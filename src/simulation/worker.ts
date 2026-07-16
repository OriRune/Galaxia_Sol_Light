/// <reference lib="webworker" />

import { workerRequestSchema, workerSignalSchema } from "../domain/protocolSchemas";
import sineTableUrl from "../generation/generated/sine-f32.bin?url";
import { installSineTable } from "../generation/sineTable";
import { Engine, type EngineCheckpoint } from "./engine";
import { FramePool } from "./framePool";
import { SimulationScheduler } from "./scheduler";
import { HistoryTimeline } from "./history";
import {
  PROTOCOL_VERSION,
  type AckEvent,
  type DirectWorkerEvent,
  type ProtocolErrorCode,
  type RejectEvent,
  type UnsolicitedWorkerEvent,
  type WorkerRequest,
} from "./protocol";

const scope = self as DedicatedWorkerGlobalScope;
let engine: Engine | null = null;
let scheduler: SimulationScheduler | null = null;
let history: HistoryTimeline | null = null;
let modelRevision = 0;
let topologyEpoch = 0;
let frameId = 0;
let framePool: FramePool | null = null;
let checkpointCounter = 0;
let lastCheckpointActiveWallMs = 0;
let lastHistoryActiveWallMs = 0;
let tickInFlight = false;
let pendingTickNowMs: number | null = null;
let activeSnapshot: { id: string; timeout: ReturnType<typeof setTimeout> } | null = null;
const requestIds = new Set<number>();
const sineReady = fetch(sineTableUrl)
  .then((response) => {
    if (!response.ok) throw new Error("SINE_TABLE_LOAD_FAILED");
    return response.arrayBuffer();
  })
  .then(installSineTable);

const revisionMutations = new Set<WorkerRequest["type"]>([
  "SET_PLAYBACK_SPEED",
  "SET_GRAVITY",
  "LOAD_SETUP",
  "ADD_GALAXY",
  "PATCH_GALAXY",
  "MOVE_GALAXY",
  "SET_BULK_VELOCITY",
  "DELETE_GALAXY",
  "RESTORE_UNDO_SNAPSHOT",
  "RESUME_FROM_MARKER",
  "RESTORE_RECOVERY_CHECKPOINT",
]);

function post(event: DirectWorkerEvent | UnsolicitedWorkerEvent, transfer: Transferable[] = []) {
  scope.postMessage(event, transfer);
}

function requireEngine() {
  if (!engine) throw new Error("NOT_INITIALIZED");
  return engine;
}

function ids() {
  return requireEngine().topology.descriptors.map((descriptor) => descriptor.id);
}

function emitTopology(
  requestId: number | null,
  delta: {
    addedIds: string[];
    removedIds: string[];
    mergerMappings?: import("./protocol").MergerMapping[];
  } | null,
) {
  const transfer = requireEngine().topologyTransfer();
  framePool?.resize(requireEngine().starCount * 2);
  topologyEpoch += 1;
  post({
    protocolVersion: PROTOCOL_VERSION,
    type: "TOPOLOGY",
    modelRevision,
    topologyEpoch,
    causeRequestId: requestId,
    ...transfer,
  });
  if (delta) {
    post({
      protocolVersion: PROTOCOL_VERSION,
      type: "SCENE_DELTA",
      modelRevision,
      topologyEpoch,
      causeRequestId: requestId,
      addedIds: delta.addedIds,
      removedIds: delta.removedIds,
      mergerMappings: delta.mergerMappings ?? [],
    });
  }
}

function reject(
  requestId: number,
  code: ProtocolErrorCode | "NOT_INITIALIZED" | "ALREADY_INITIALIZED" | "INVALID_REQUEST",
  message: string,
) {
  post({
    protocolVersion: PROTOCOL_VERSION,
    type: "REJECT",
    requestId,
    currentModelRevision: modelRevision,
    code,
    message,
  } satisfies RejectEvent);
}

function unlockSnapshot(release: boolean) {
  if (!activeSnapshot) return;
  clearTimeout(activeSnapshot.timeout);
  if (release) engine?.releaseSnapshot(activeSnapshot.id);
  activeSnapshot = null;
  scheduler?.setMutationLocked(false);
}

function acknowledge(requestId: number, result: AckEvent["result"] = "OK") {
  post({ protocolVersion: PROTOCOL_VERSION, type: "ACK", requestId, modelRevision, result });
  if (result === "CHANGED") emitCheckpoint();
}

function emitCheckpoint() {
  if (!engine) return;
  checkpointCounter += 1;
  lastCheckpointActiveWallMs = engine.activeWallMs;
  post({
    protocolVersion: PROTOCOL_VERSION,
    type: "RECOVERY_CHECKPOINT",
    checkpointId: `checkpoint-${String(checkpointCounter)}`,
    modelRevision,
    stepIndex: engine.stepIndex,
    activeWallMs: engine.activeWallMs,
    payload: engine.createCheckpoint(),
  });
}

function emitHistoryStatus(reconstructing = false) {
  if (!history) return;
  post({
    protocolVersion: PROTOCOL_VERSION,
    type: "HISTORY_STATUS",
    markerIds: history.getMarkers().map((marker) => marker.markerId),
    selectedMarkerId: history.currentMarkerId,
    reconstructing,
  });
}

function syncHistoryToEngine() {
  if (!engine || !history) return;
  const markerCount = history.getMarkers().length;
  history.advanceActiveWall(
    engine.activeWallMs - lastHistoryActiveWallMs,
    true,
    engine.playing,
    modelRevision,
  );
  lastHistoryActiveWallMs = engine.activeWallMs;
  if (history.getMarkers().length !== markerCount) emitHistoryStatus();
}

function publishAutomaticMergers() {
  if (!engine) return;
  const mappings = engine.consumeMergerMappings();
  if (mappings.length === 0) return;
  modelRevision += 1;
  const descriptors = engine.topology.descriptors;
  history?.logMergerExpectation(
    mappings.map((mapping) => mapping.inputIds),
    mappings.map((mapping) =>
      JSON.stringify(
        descriptors.find((descriptor) => descriptor.id === mapping.remnantId)?.generation ?? null,
      ),
    ),
    modelRevision,
  );
  emitTopology(null, {
    addedIds: mappings.map((mapping) => mapping.remnantId),
    removedIds: mappings.flatMap((mapping) => mapping.inputIds),
    mergerMappings: mappings,
  });
}

function onStepCommitted() {
  publishAutomaticMergers();
  if (engine && engine.activeWallMs - lastCheckpointActiveWallMs >= 1_000) emitCheckpoint();
}

function requiresExpectedRevision(type: WorkerRequest["type"]) {
  return revisionMutations.has(type) || type === "ENTER_HISTORY" || type === "SCRUB_TO_MARKER";
}

function markerNumber(value: string) {
  const parsed = Number(value.replace(/^marker-/, ""));
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("HISTORY_LOG_CORRUPT");
  return parsed;
}

function invalidRevisionRule(request: WorkerRequest) {
  return requiresExpectedRevision(request.type)
    ? request.expectedModelRevision !== modelRevision
    : request.expectedModelRevision !== null;
}

function applyRevisionMutation(request: WorkerRequest) {
  const authoritative = requireEngine();
  const previousIds = ids();
  let topology: "none" | "refresh" | "delta" = "none";
  let result: AckEvent["result"] = "CHANGED";
  switch (request.type) {
    case "SET_PLAYBACK_SPEED":
      authoritative.playbackSpeed = request.payload.playbackSpeed;
      scheduler?.resetOrigin();
      break;
    case "SET_GRAVITY":
      authoritative.gravity = request.payload.gravity;
      break;
    case "LOAD_SETUP":
      authoritative.loadSetup(request.payload.setup, request.payload.postLoadPlaying);
      topology = "delta";
      break;
    case "ADD_GALAXY":
      authoritative.addGalaxy(request.payload.galaxy);
      topology = "delta";
      break;
    case "PATCH_GALAXY":
      result = authoritative.patchGalaxy(
        request.payload.galaxyId,
        request.payload.generation,
        request.payload.name,
      );
      topology = result === "CHANGED" ? "refresh" : "none";
      break;
    case "MOVE_GALAXY":
      authoritative.moveGalaxy(
        request.payload.galaxyId,
        request.payload.position.x,
        request.payload.position.y,
      );
      break;
    case "SET_BULK_VELOCITY":
      authoritative.setBulkVelocity(
        request.payload.galaxyId,
        request.payload.bulkVelocity.x,
        request.payload.bulkVelocity.y,
      );
      break;
    case "DELETE_GALAXY":
      authoritative.deleteGalaxy(request.payload.galaxyId);
      topology = "delta";
      break;
    case "RESTORE_UNDO_SNAPSHOT":
      authoritative.restoreSnapshot(request.payload.snapshotId);
      topology = "delta";
      break;
    case "RESUME_FROM_MARKER":
      if (!history?.resumeFromMarker(markerNumber(request.payload.markerId)))
        throw new Error("SNAPSHOT_NOT_FOUND");
      scheduler?.resetOrigin();
      topology = "delta";
      break;
    case "RESTORE_RECOVERY_CHECKPOINT":
      authoritative.restoreCheckpoint(request.payload.checkpoint as EngineCheckpoint);
      topology = "delta";
      break;
    default:
      throw new Error("INVALID_PAYLOAD");
  }
  if (result === "NO_CHANGE") {
    unlockSnapshot(true);
    acknowledge(request.requestId, result);
    return;
  }
  modelRevision += 1;
  if (request.type === "RESTORE_UNDO_SNAPSHOT") {
    authoritative.playing = false;
    history = new HistoryTimeline(authoritative, modelRevision);
    emitHistoryStatus();
  } else if (request.type !== "RESUME_FROM_MARKER")
    history?.logCommand(request.type, request.payload, modelRevision, topology !== "none");
  else emitHistoryStatus(false);
  if (topology === "refresh") emitTopology(request.requestId, null);
  if (topology === "delta") {
    const currentIds = ids();
    emitTopology(request.requestId, {
      addedIds: currentIds.filter((id) => !previousIds.includes(id)),
      removedIds: previousIds.filter((id) => !currentIds.includes(id)),
    });
  }
  if (request.transactionSnapshotId !== null) unlockSnapshot(false);
  acknowledge(request.requestId, result);
}

async function handleRequest(request: WorkerRequest) {
  if (requestIds.has(request.requestId)) {
    reject(request.requestId, "INVALID_PAYLOAD", "Duplicate request ID.");
    return;
  }
  requestIds.add(request.requestId);
  if (request.type === "INIT") {
    if (engine) {
      reject(request.requestId, "ALREADY_INITIALIZED", "Worker is already initialized.");
      return;
    }
    if (request.expectedModelRevision !== null || request.transactionSnapshotId !== null) {
      reject(request.requestId, "INVALID_PAYLOAD", "INIT revision fields must be null.");
      return;
    }
    engine = new Engine(request.payload.initialSetup, request.payload.initialPlaying);
    history = new HistoryTimeline(engine, 1);
    framePool = new FramePool(engine.starCount * 2);
    scheduler = new SimulationScheduler(engine, {
      stepCommitted: onStepCommitted,
      historyBoundary: syncHistoryToEngine,
    });
    modelRevision = 1;
    emitTopology(request.requestId, { addedIds: ids(), removedIds: [] });
    post({
      protocolVersion: PROTOCOL_VERSION,
      type: "READY",
      requestId: request.requestId,
      modelRevision,
      status: "ready",
    });
    emitCheckpoint();
    return;
  }
  if (!engine) {
    reject(request.requestId, "NOT_INITIALIZED", "Worker must be initialized first.");
    return;
  }
  if (invalidRevisionRule(request)) {
    reject(request.requestId, "STALE_REVISION", "Expected model revision does not match.");
    if (request.transactionSnapshotId === activeSnapshot?.id) unlockSnapshot(true);
    return;
  }
  try {
    if (request.type === "PING") {
      post({
        protocolVersion: PROTOCOL_VERSION,
        type: "PONG",
        requestId: request.requestId,
        nonce: request.payload.nonce,
      });
      return;
    }
    if (request.type === "REQUEST_UNDO_SNAPSHOT") {
      if (activeSnapshot) {
        reject(request.requestId, "MUTATION_BUSY", "A mutation transaction is already active.");
        return;
      }
      const id = engine.requestSnapshot();
      const timeout = setTimeout(() => {
        if (activeSnapshot?.id === id) unlockSnapshot(true);
      }, 30_000);
      activeSnapshot = { id, timeout };
      scheduler?.setMutationLocked(true);
      post({
        protocolVersion: PROTOCOL_VERSION,
        type: "UNDO_SNAPSHOT_READY",
        requestId: request.requestId,
        snapshotId: id,
        modelRevision,
        estimatedBytes: engine.starCount * 16 + engine.galaxyCount * 48,
      });
      return;
    }
    if (request.type === "RELEASE_UNDO_SNAPSHOT") {
      if (activeSnapshot?.id === request.payload.snapshotId) unlockSnapshot(true);
      else engine.releaseSnapshot(request.payload.snapshotId);
      acknowledge(request.requestId);
      return;
    }
    if (request.type === "COMMIT_UI_ONLY_MUTATION") {
      if (activeSnapshot?.id !== request.payload.snapshotId) {
        reject(
          request.requestId,
          "SNAPSHOT_NOT_FOUND",
          "Active transaction snapshot was not found.",
        );
        return;
      }
      unlockSnapshot(false);
      acknowledge(request.requestId, "CHANGED");
      return;
    }
    if (
      request.transactionSnapshotId !== null &&
      request.transactionSnapshotId !== activeSnapshot?.id
    ) {
      reject(request.requestId, "SNAPSHOT_NOT_FOUND", "Transaction snapshot was not found.");
      return;
    }
    if (revisionMutations.has(request.type)) {
      applyRevisionMutation(request);
      return;
    }
    if (request.type === "REGENERATE_SCENE") {
      const result = engine.regenerateScene();
      if (result === "CHANGED") {
        modelRevision += 1;
        history?.logCommand(request.type, request.payload, modelRevision, true);
        emitTopology(request.requestId, null);
      }
      acknowledge(request.requestId, result);
      return;
    }
    if (request.type === "ENTER_HISTORY" || request.type === "SCRUB_TO_MARKER") {
      const selected = markerNumber(request.payload.markerId);
      emitHistoryStatus(true);
      const restored =
        request.type === "ENTER_HISTORY"
          ? await history?.enterHistory(selected)
          : await history?.scrubToMarker(selected);
      if (!restored) {
        acknowledge(request.requestId, "NO_CHANGE");
        return;
      }
      emitTopology(request.requestId, null);
      emitHistoryStatus(false);
      acknowledge(request.requestId);
      return;
    }
    if (request.type === "EXIT_HISTORY_TO_PRESENT") {
      if (!history?.exitToPresent()) {
        acknowledge(request.requestId, "NO_CHANGE");
        return;
      }
      emitTopology(request.requestId, null);
      emitHistoryStatus(false);
      acknowledge(request.requestId);
      return;
    }
    if (request.type === "PLAY") {
      engine.playing = true;
      scheduler?.resetOrigin();
    }
    if (request.type === "PAUSE") {
      engine.playing = false;
      scheduler?.resetOrigin();
    }
    if (request.type === "STEP") {
      scheduler?.singleStep();
      history?.singleStepMarker(modelRevision);
      emitHistoryStatus();
    }
    if (request.type === "REQUEST_STATE_DIGEST") {
      post({
        protocolVersion: PROTOCOL_VERSION,
        type: "DIGEST_RESULT",
        requestId: request.requestId,
        digest: await engine.stateDigest(),
      });
      return;
    }
    if (request.type === "REQUEST_SCENE_SETUP") {
      post({
        protocolVersion: PROTOCOL_VERSION,
        type: "SCENE_SETUP_RESULT",
        requestId: request.requestId,
        setup: engine.sceneSetup(),
      });
      return;
    }
    if (request.type === "REQUEST_RECOVERY_CHECKPOINT") {
      emitCheckpoint();
      acknowledge(request.requestId);
      return;
    }
    if (request.type === "DISPOSE") {
      unlockSnapshot(true);
      post({
        protocolVersion: PROTOCOL_VERSION,
        type: "WORKER_DISPOSING",
        requestId: request.requestId,
      });
      setTimeout(() => {
        scope.close();
      }, 0);
      return;
    }
    acknowledge(request.requestId);
  } catch (error) {
    if (request.transactionSnapshotId === activeSnapshot?.id) unlockSnapshot(true);
    const message = error instanceof Error ? error.message : "Invalid simulation state.";
    const code = message.includes("SNAPSHOT_NOT_FOUND")
      ? "SNAPSHOT_NOT_FOUND"
      : message.includes("HISTORY_LOG_CORRUPT")
        ? "HISTORY_LOG_CORRUPT"
        : "INVALID_SIMULATION_STATE";
    reject(request.requestId, code, message);
  }
}

async function handleMessage(event: MessageEvent<unknown>) {
  await sineReady;
  const raw = event.data;
  if (typeof raw !== "object" || raw === null || !("protocolVersion" in raw)) {
    reject(0, "INVALID_PAYLOAD", "Worker message must be an object.");
    return;
  }
  if (raw.protocolVersion !== PROTOCOL_VERSION) {
    const requestId = "requestId" in raw && typeof raw.requestId === "number" ? raw.requestId : 0;
    reject(requestId, "PROTOCOL_VERSION", "Unsupported Worker protocol version.");
    return;
  }
  const signal = workerSignalSchema.safeParse(raw);
  if (signal.success) {
    if (signal.data.type === "TICK") {
      if (tickInFlight) {
        pendingTickNowMs = Math.max(
          pendingTickNowMs ?? Number.NEGATIVE_INFINITY,
          signal.data.payload.nowMs,
        );
        return;
      }
      tickInFlight = true;
      let tickNowMs: number | null = signal.data.payload.nowMs;
      try {
        while (tickNowMs !== null) {
          pendingTickNowMs = null;
          await scheduler?.tick(tickNowMs);
          syncHistoryToEngine();
          const opportunity = framePool?.publicationOpportunity();
          if (opportunity?.lease && engine) {
            const frame = engine.writeFrame(opportunity.lease.buffer);
            frameId += 1;
            post(
              {
                protocolVersion: PROTOCOL_VERSION,
                type: "FRAME",
                leaseId: opportunity.lease.leaseId,
                frameId,
                modelRevision,
                topologyEpoch,
                stepIndex: engine.stepIndex,
                positions: opportunity.lease.buffer,
                cores: frame.cores,
                bounds: frame.bounds,
              },
              [opportunity.lease.buffer],
            );
          }
          tickNowMs = pendingTickNowMs;
        }
      } finally {
        tickInFlight = false;
      }
    }
    if (signal.data.type === "SET_VISIBILITY") {
      scheduler?.setVisibility(signal.data.payload.visible);
    }
    if (signal.data.type === "RETURN_FRAME_BUFFER") {
      framePool?.returnLease(signal.data.payload.leaseId, signal.data.payload.buffer);
    }
    return;
  }
  const request = workerRequestSchema.safeParse(raw);
  if (!request.success) {
    const requestId = "requestId" in raw && typeof raw.requestId === "number" ? raw.requestId : 0;
    reject(requestId, "INVALID_PAYLOAD", "Worker request payload is invalid.");
    return;
  }
  await handleRequest(request.data);
}

scope.onmessage = (event) => {
  void handleMessage(event);
};
