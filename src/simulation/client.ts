import {
  EMPTY_ENGINE_SETUP,
  HEARTBEAT_FAILURE_LIMIT,
  HEARTBEAT_INTERVAL_MS,
  LONG_TIMEOUT_MS,
  ORDINARY_TIMEOUT_MS,
  PROTOCOL_VERSION,
  type AckEvent,
  type DirectWorkerEvent,
  type FrameEvent,
  type HistoryStatusEvent,
  type RecoveryCheckpointEvent,
  type SceneDeltaEvent,
  type TopologyEvent,
  type WorkerRequest,
  type WorkerSignal,
} from "./protocol";
import type { EngineSetup } from "../domain/types";

interface Pending {
  resolve: (event: DirectWorkerEvent) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  mutation: boolean;
  commandType: WorkerRequest["type"];
}

interface CommandOptions {
  expectedModelRevision?: number | null;
  transactionSnapshotId?: string | null;
  timeoutMs?: number;
}

export interface SimulationClientCallbacks {
  commitCommandEvents?: (
    requestId: number,
    topology: TopologyEvent | null,
    delta: SceneDeltaEvent | null,
  ) => void;
  commitAutomaticEvents?: (topology: TopologyEvent, delta: SceneDeltaEvent) => void;
  protocolError?: (message: string) => void;
  applyFrame?: (frame: FrameEvent, positions: Float32Array) => void;
  recoveryCheckpoint?: (checkpoint: RecoveryCheckpointEvent) => void;
  historyStatus?: (status: HistoryStatusEvent) => void;
  workerUnavailable?: (
    message: string,
    checkpoint: { stepIndex: number; ageMs: number } | null,
  ) => void;
}

interface StagedEvents {
  topology: TopologyEvent | null;
  delta: SceneDeltaEvent | null;
}

const TOPOLOGY_AND_DELTA_COMMANDS = new Set<WorkerRequest["type"]>([
  "INIT",
  "LOAD_SETUP",
  "ADD_GALAXY",
  "DELETE_GALAXY",
  "RESTORE_UNDO_SNAPSHOT",
  "RESTORE_RECOVERY_CHECKPOINT",
]);
const TOPOLOGY_COMMANDS = new Set<WorkerRequest["type"]>([
  ...TOPOLOGY_AND_DELTA_COMMANDS,
  "PATCH_GALAXY",
  "REGENERATE_SCENE",
]);

export class SimulationClient {
  private worker: Worker | null = null;
  private workerGeneration = 0;
  private nextRequestId = 1;
  private acknowledgedModelRevision = 0;
  private mutationInFlight = false;
  private readonly pending = new Map<number, Pending>();
  private readonly stagedByRequest = new Map<number, StagedEvents>();
  private automaticTopology: TopologyEvent | null = null;
  private committedTopology: { epoch: number; ids: string[]; starCount: number } | null = null;
  private latestCheckpoint: { event: RecoveryCheckpointEvent; receivedAt: number } | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatOutstanding = false;
  private heartbeatFailures = 0;
  private visible = true;

  constructor(
    private readonly createWorker: () => Worker = () =>
      new Worker(new URL("../simulation/worker.ts", import.meta.url), { type: "module" }),
    private readonly callbacks: SimulationClientCallbacks = {},
  ) {}

  get modelRevision() {
    return this.acknowledgedModelRevision;
  }

  getRecoveryCheckpoint() {
    if (!this.latestCheckpoint) return null;
    return {
      event: this.latestCheckpoint.event,
      ageMs: Math.max(0, performance.now() - this.latestCheckpoint.receivedAt),
    };
  }

  async initialize(
    initialSetup: EngineSetup = EMPTY_ENGINE_SETUP,
    initialPlaying = true,
  ): Promise<number> {
    if (this.worker !== null) throw new Error("Simulation Worker is already initialized.");
    const worker = this.createWorker();
    const generation = this.workerGeneration + 1;
    this.workerGeneration = generation;
    this.worker = worker;
    worker.onmessage = (message: MessageEvent<unknown>) => {
      if (generation === this.workerGeneration) this.receive(message.data);
    };
    worker.onerror = () => {
      if (generation === this.workerGeneration) this.workerFailed("Simulation Worker failed.");
    };
    worker.onmessageerror = () => {
      if (generation === this.workerGeneration)
        this.workerFailed("Simulation Worker message failed.");
    };
    const event = await this.command("INIT", { initialSetup, initialPlaying });
    if (event.type !== "READY" || event.modelRevision !== 1) {
      throw new Error("Simulation Worker returned an invalid READY event.");
    }
    this.acknowledgedModelRevision = event.modelRevision;
    this.startHeartbeat();
    return event.modelRevision;
  }

  async ping(nonce: number): Promise<number> {
    const event = await this.command("PING", { nonce });
    if (event.type !== "PONG") throw new Error("Simulation Worker returned an invalid PONG event.");
    return event.nonce;
  }

  async requestUndoSnapshot() {
    const event = await this.command("REQUEST_UNDO_SNAPSHOT", {}, { timeoutMs: LONG_TIMEOUT_MS });
    if (event.type !== "UNDO_SNAPSHOT_READY") {
      throw new Error("Worker did not return an undo snapshot.");
    }
    return event;
  }

  async requestSceneSetup() {
    const event = await this.command("REQUEST_SCENE_SETUP", {}, { timeoutMs: LONG_TIMEOUT_MS });
    if (event.type !== "SCENE_SETUP_RESULT")
      throw new Error("Worker did not return a scene setup.");
    return event.setup;
  }

  async requestStateDigest() {
    const event = await this.command("REQUEST_STATE_DIGEST", {});
    if (event.type !== "DIGEST_RESULT") throw new Error("Worker did not return a state digest.");
    return event.digest;
  }

  async releaseUndoSnapshot(snapshotId: string) {
    const event = await this.command("RELEASE_UNDO_SNAPSHOT", { snapshotId });
    if (event.type !== "ACK") throw new Error("Worker did not release the undo snapshot.");
  }

  async commitUiOnly(snapshotId: string) {
    const event = await this.command(
      "COMMIT_UI_ONLY_MUTATION",
      { snapshotId },
      { transactionSnapshotId: snapshotId },
    );
    if (event.type !== "ACK" || event.result !== "CHANGED")
      throw new Error("Worker did not commit the UI-only mutation.");
    return event;
  }

  async restoreLatestCheckpoint() {
    const retained = this.latestCheckpoint?.event;
    if (!retained) throw new Error("SNAPSHOT_NOT_FOUND: recovery checkpoint is unavailable.");
    this.stopHeartbeat();
    this.worker?.terminate();
    this.worker = null;
    this.workerGeneration += 1;
    this.acknowledgedModelRevision = 0;
    this.failAll(new Error("Worker replaced for checkpoint recovery."));
    await this.initialize(EMPTY_ENGINE_SETUP, false);
    return this.mutation("RESTORE_RECOVERY_CHECKPOINT", { checkpoint: retained.payload });
  }

  async regenerateFromSetup(setup: EngineSetup) {
    this.stopHeartbeat();
    this.worker?.terminate();
    this.worker = null;
    this.workerGeneration += 1;
    this.acknowledgedModelRevision = 0;
    this.failAll(new Error("Worker replaced for scene regeneration."));
    return this.initialize(setup, false);
  }

  async mutation(
    type: WorkerRequest["type"],
    payload: unknown,
    snapshotId: string | null = null,
  ): Promise<AckEvent> {
    const event = await this.command(type, payload, {
      expectedModelRevision: this.acknowledgedModelRevision,
      transactionSnapshotId: snapshotId,
      ...(TOPOLOGY_COMMANDS.has(type) ? { timeoutMs: LONG_TIMEOUT_MS } : {}),
    });
    if (event.type !== "ACK") throw new Error("Worker mutation did not return ACK.");
    return event;
  }

  command(
    type: WorkerRequest["type"],
    payload: unknown,
    options: CommandOptions = {},
  ): Promise<DirectWorkerEvent> {
    const worker = this.worker;
    if (worker === null) return Promise.reject(new Error("Simulation Worker is unavailable."));
    const expectedModelRevision = options.expectedModelRevision ?? null;
    const mutation = expectedModelRevision !== null;
    if (mutation && this.mutationInFlight) {
      return Promise.reject(new Error("A simulation mutation is already in flight."));
    }
    const requestId = this.allocateRequestId();
    const request = {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      expectedModelRevision,
      transactionSnapshotId: options.transactionSnapshotId ?? null,
      type,
      payload,
    } as WorkerRequest;
    if (mutation) this.mutationInFlight = true;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        this.stagedByRequest.delete(requestId);
        if (pending.mutation) this.mutationInFlight = false;
        reject(new Error(`${type} timed out.`));
      }, options.timeoutMs ?? ORDINARY_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timeout, mutation, commandType: type });
      if (type === "PLAY" || type === "PAUSE" || type === "SET_PLAYBACK_SPEED") {
        this.tick(performance.now());
      }
      worker.postMessage(request);
    });
  }

  tick(nowMs: number) {
    this.signal({ protocolVersion: PROTOCOL_VERSION, type: "TICK", payload: { nowMs } });
  }

  setVisibility(visible: boolean) {
    this.visible = visible;
    this.signal({
      protocolVersion: PROTOCOL_VERSION,
      type: "SET_VISIBILITY",
      payload: { visible },
    });
  }

  async dispose(): Promise<void> {
    if (this.worker === null) return;
    this.stopHeartbeat();
    try {
      const event = await this.command("DISPOSE", {});
      if (event.type !== "WORKER_DISPOSING")
        throw new Error("Worker did not acknowledge disposal.");
    } finally {
      this.worker.terminate();
      this.worker = null;
      this.workerGeneration += 1;
      this.acknowledgedModelRevision = 0;
      this.failAll(new Error("Simulation Worker disposed."));
    }
  }

  terminate(): void {
    this.stopHeartbeat();
    this.workerGeneration += 1;
    this.worker?.terminate();
    this.worker = null;
    this.failAll(new Error("Simulation Worker terminated."));
  }

  private signal(signal: WorkerSignal, transfer: Transferable[] = []) {
    this.worker?.postMessage(signal, transfer);
  }

  private allocateRequestId() {
    while (this.pending.has(this.nextRequestId))
      this.nextRequestId = (this.nextRequestId + 1) >>> 0;
    const id = this.nextRequestId;
    this.nextRequestId = (this.nextRequestId + 1) >>> 0;
    return id;
  }

  private receive(value: unknown) {
    if (this.isHistoryStatus(value)) {
      this.callbacks.historyStatus?.(value);
      return;
    }
    if (this.isRecoveryCheckpoint(value)) {
      this.latestCheckpoint = { event: value, receivedAt: performance.now() };
      this.callbacks.recoveryCheckpoint?.(value);
      return;
    }
    if (this.isFrame(value)) {
      this.applyFrame(value);
      return;
    }
    if (this.isUnsolicited(value)) {
      this.stageUnsolicited(value);
      return;
    }
    if (typeof value !== "object" || value === null || !("requestId" in value)) return;
    if (!("protocolVersion" in value) || value.protocolVersion !== PROTOCOL_VERSION) return;
    const event = value as DirectWorkerEvent;
    const pending = this.pending.get(event.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(event.requestId);
    if (pending.mutation) this.mutationInFlight = false;
    if (event.type === "REJECT") {
      this.stagedByRequest.delete(event.requestId);
      pending.reject(new Error(`${event.code}: ${event.message}`));
      return;
    }
    if ("modelRevision" in event) {
      if (event.modelRevision < this.acknowledgedModelRevision) {
        pending.reject(new Error("PROTOCOL_SEQUENCE: model revision regressed."));
        return;
      }
      if (event.type === "ACK" || event.type === "READY") {
        this.acknowledgedModelRevision = event.modelRevision;
      }
    }
    if (event.type === "ACK" || event.type === "READY") {
      const staged = this.stagedByRequest.get(event.requestId);
      if (
        (TOPOLOGY_COMMANDS.has(pending.commandType) && !staged?.topology) ||
        (TOPOLOGY_AND_DELTA_COMMANDS.has(pending.commandType) && !staged?.delta)
      ) {
        this.stagedByRequest.delete(event.requestId);
        const message = "PROTOCOL_SEQUENCE: required topology transaction events are missing.";
        this.callbacks.protocolError?.(message);
        pending.reject(new Error(message));
        return;
      }
      if (staged) {
        if (staged.topology) this.commitTopologyCache(staged.topology);
        this.callbacks.commitCommandEvents?.(event.requestId, staged.topology, staged.delta);
        this.stagedByRequest.delete(event.requestId);
      }
    }
    pending.resolve(event);
  }

  private isUnsolicited(value: unknown): value is TopologyEvent | SceneDeltaEvent {
    return (
      typeof value === "object" &&
      value !== null &&
      "protocolVersion" in value &&
      value.protocolVersion === PROTOCOL_VERSION &&
      "type" in value &&
      (value.type === "TOPOLOGY" || value.type === "SCENE_DELTA")
    );
  }

  private stageUnsolicited(event: TopologyEvent | SceneDeltaEvent) {
    if (event.causeRequestId !== null) {
      if (!this.pending.has(event.causeRequestId)) return;
      const staged = this.stagedByRequest.get(event.causeRequestId) ?? {
        topology: null,
        delta: null,
      };
      if (event.type === "TOPOLOGY") staged.topology = event;
      else staged.delta = event;
      this.stagedByRequest.set(event.causeRequestId, staged);
      return;
    }
    if (event.type === "TOPOLOGY") {
      this.automaticTopology = event;
      return;
    }
    const topology = this.automaticTopology;
    if (
      topology?.modelRevision !== event.modelRevision ||
      topology.topologyEpoch !== event.topologyEpoch
    ) {
      this.automaticTopology = null;
      this.callbacks.protocolError?.("PROTOCOL_SEQUENCE: automatic topology/delta mismatch.");
      return;
    }
    this.automaticTopology = null;
    if (event.modelRevision < this.acknowledgedModelRevision) {
      this.callbacks.protocolError?.("PROTOCOL_SEQUENCE: automatic revision regressed.");
      return;
    }
    this.acknowledgedModelRevision = event.modelRevision;
    this.commitTopologyCache(topology);
    this.callbacks.commitAutomaticEvents?.(topology, event);
  }

  private isFrame(value: unknown): value is FrameEvent {
    return (
      typeof value === "object" &&
      value !== null &&
      "protocolVersion" in value &&
      value.protocolVersion === PROTOCOL_VERSION &&
      "type" in value &&
      value.type === "FRAME" &&
      "positions" in value &&
      value.positions instanceof ArrayBuffer
    );
  }

  private isRecoveryCheckpoint(value: unknown): value is RecoveryCheckpointEvent {
    return (
      typeof value === "object" &&
      value !== null &&
      "protocolVersion" in value &&
      value.protocolVersion === PROTOCOL_VERSION &&
      "type" in value &&
      value.type === "RECOVERY_CHECKPOINT" &&
      "checkpointId" in value &&
      typeof value.checkpointId === "string" &&
      "stepIndex" in value &&
      typeof value.stepIndex === "number" &&
      "payload" in value
    );
  }

  private isHistoryStatus(value: unknown): value is HistoryStatusEvent {
    return (
      typeof value === "object" &&
      value !== null &&
      "protocolVersion" in value &&
      value.protocolVersion === PROTOCOL_VERSION &&
      "type" in value &&
      value.type === "HISTORY_STATUS" &&
      "markerIds" in value &&
      Array.isArray(value.markerIds)
    );
  }

  private applyFrame(frame: FrameEvent) {
    try {
      const topology = this.committedTopology;
      if (
        frame.topologyEpoch !== topology?.epoch ||
        frame.modelRevision < this.acknowledgedModelRevision ||
        frame.positions.byteLength !== topology.starCount * 2 * Float32Array.BYTES_PER_ELEMENT ||
        frame.cores.length !== topology.ids.length ||
        frame.cores.some((core, index) => core.id !== topology.ids[index])
      ) {
        this.callbacks.protocolError?.("PROTOCOL_SEQUENCE: incompatible FRAME.");
        return;
      }
      this.callbacks.applyFrame?.(frame, new Float32Array(frame.positions));
    } finally {
      this.signal(
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "RETURN_FRAME_BUFFER",
          payload: { leaseId: frame.leaseId, buffer: frame.positions },
        },
        [frame.positions],
      );
    }
  }

  private commitTopologyCache(topology: TopologyEvent) {
    this.committedTopology = {
      epoch: topology.topologyEpoch,
      ids: topology.descriptors.map((descriptor) => descriptor.id),
      starCount: topology.segments.reduce((sum, segment) => sum + segment.count, 0),
    };
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (
        !this.visible ||
        this.heartbeatOutstanding ||
        this.worker === null ||
        this.pending.size > 0
      )
        return;
      this.heartbeatOutstanding = true;
      void this.ping(performance.now() >>> 0)
        .then(() => {
          this.heartbeatFailures = 0;
        })
        .catch(() => {
          this.heartbeatFailures += 1;
          if (this.heartbeatFailures >= HEARTBEAT_FAILURE_LIMIT) {
            this.workerFailed("Simulation Worker heartbeat failed.");
          }
        })
        .finally(() => {
          this.heartbeatOutstanding = false;
        });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.heartbeatOutstanding = false;
    this.heartbeatFailures = 0;
  }

  private workerFailed(message: string) {
    this.stopHeartbeat();
    this.worker?.terminate();
    this.worker = null;
    this.workerGeneration += 1;
    this.failAll(new Error(message));
    const checkpoint = this.getRecoveryCheckpoint();
    this.callbacks.workerUnavailable?.(
      message,
      checkpoint ? { stepIndex: checkpoint.event.stepIndex, ageMs: checkpoint.ageMs } : null,
    );
  }

  private failAll(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    this.stagedByRequest.clear();
    this.automaticTopology = null;
    this.committedTopology = null;
    this.mutationInFlight = false;
  }
}
