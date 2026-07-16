import type {
  EngineSetup,
  GalaxyGenerationConfig,
  GalaxyRecord,
  PlaybackSpeed,
  Vec2,
} from "../domain/types";

export const PROTOCOL_VERSION = 1 as const;
export const ORDINARY_TIMEOUT_MS = 5_000;
export const LONG_TIMEOUT_MS = 30_000;
export const HEARTBEAT_INTERVAL_MS = 2_000;
export const HEARTBEAT_FAILURE_LIMIT = 3;

export type AckResult = "OK" | "CHANGED" | "NO_CHANGE";
export type ProtocolErrorCode =
  | "PROTOCOL_VERSION"
  | "PROTOCOL_SEQUENCE"
  | "INVALID_PAYLOAD"
  | "STALE_REVISION"
  | "MUTATION_BUSY"
  | "SNAPSHOT_NOT_FOUND"
  | "INVALID_VALUE"
  | "SCENE_LIMIT"
  | "INVALID_SIMULATION_STATE"
  | "SIMULATION_OVERLOAD"
  | "HISTORY_LOG_CORRUPT"
  | "WORKER_UNAVAILABLE"
  | "FRAME_TRANSPORT"
  | "SINE_TABLE_NOT_READY";

interface RequestBase<TType extends string, TPayload> {
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: number;
  expectedModelRevision: number | null;
  transactionSnapshotId: string | null;
  type: TType;
  payload: TPayload;
}

export type WorkerRequest =
  | RequestBase<"INIT", { initialSetup: EngineSetup; initialPlaying: boolean }>
  | RequestBase<"PLAY" | "PAUSE" | "STEP" | "REGENERATE_SCENE", Record<string, never>>
  | RequestBase<"SET_PLAYBACK_SPEED", { playbackSpeed: PlaybackSpeed }>
  | RequestBase<"SET_GRAVITY", { gravity: number }>
  | RequestBase<"LOAD_SETUP", { setup: EngineSetup; postLoadPlaying: boolean }>
  | RequestBase<"ADD_GALAXY", { galaxy: GalaxyRecord }>
  | RequestBase<
      "PATCH_GALAXY",
      { galaxyId: string; generation: GalaxyGenerationConfig; name: string | null }
    >
  | RequestBase<"MOVE_GALAXY", { galaxyId: string; position: Vec2 }>
  | RequestBase<"SET_BULK_VELOCITY", { galaxyId: string; bulkVelocity: Vec2 }>
  | RequestBase<"DELETE_GALAXY", { galaxyId: string }>
  | RequestBase<
      | "REQUEST_UNDO_SNAPSHOT"
      | "EXIT_HISTORY_TO_PRESENT"
      | "REQUEST_STATE_DIGEST"
      | "REQUEST_SCENE_SETUP"
      | "REQUEST_RECOVERY_CHECKPOINT"
      | "DISPOSE",
      Record<string, never>
    >
  | RequestBase<"COMMIT_UI_ONLY_MUTATION", { snapshotId: string }>
  | RequestBase<"RESTORE_UNDO_SNAPSHOT" | "RELEASE_UNDO_SNAPSHOT", { snapshotId: string }>
  | RequestBase<"ENTER_HISTORY" | "RESUME_FROM_MARKER", { markerId: string }>
  | RequestBase<"SCRUB_TO_MARKER", { markerId: string; reconstructionToken: string }>
  | RequestBase<"RESTORE_RECOVERY_CHECKPOINT", { checkpoint: unknown }>
  | RequestBase<"PING", { nonce: number }>;

export type WorkerSignal =
  | { protocolVersion: typeof PROTOCOL_VERSION; type: "TICK"; payload: { nowMs: number } }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      type: "SET_VISIBILITY";
      payload: { visible: boolean };
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      type: "RETURN_FRAME_BUFFER";
      payload: { leaseId: number; buffer: ArrayBuffer };
    };

export type InitRequest = Extract<WorkerRequest, { type: "INIT" }>;
export type PingRequest = Extract<WorkerRequest, { type: "PING" }>;
export type DisposeRequest = Extract<WorkerRequest, { type: "DISPOSE" }>;
export type SmokeWorkerRequest = WorkerRequest;

export interface ReadyEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "READY";
  requestId: number;
  modelRevision: number;
  status: "ready";
}

export interface AckEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "ACK";
  requestId: number;
  modelRevision: number;
  result: AckResult;
}

export interface RejectEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "REJECT";
  requestId: number;
  currentModelRevision: number;
  code: ProtocolErrorCode | "NOT_INITIALIZED" | "ALREADY_INITIALIZED" | "INVALID_REQUEST";
  message: string;
}

export interface PongEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "PONG";
  requestId: number;
  nonce: number;
}

export interface UndoSnapshotReadyEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "UNDO_SNAPSHOT_READY";
  requestId: number;
  snapshotId: string;
  modelRevision: number;
  estimatedBytes: number;
}

export interface WorkerDisposingEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "WORKER_DISPOSING";
  requestId: number;
}

export interface DigestResultEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "DIGEST_RESULT";
  requestId: number;
  digest: string;
}

export interface SceneSetupResultEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "SCENE_SETUP_RESULT";
  requestId: number;
  setup: EngineSetup;
}

export interface GalaxyDescriptor {
  id: string;
  generation: GalaxyGenerationConfig;
  name: string | null;
}

export interface SegmentDescriptor {
  ownerId: string;
  start: number;
  count: number;
  styleBlockId: string;
}

export interface StyleBlockTransfer {
  id: string;
  red: Uint8Array;
  green: Uint8Array;
  blue: Uint8Array;
  alpha: Uint8Array;
  pointSize: Uint8Array;
}

export interface TopologyEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "TOPOLOGY";
  modelRevision: number;
  topologyEpoch: number;
  causeRequestId: number | null;
  descriptors: GalaxyDescriptor[];
  segments: SegmentDescriptor[];
  styleBlocks: StyleBlockTransfer[];
}

export interface MergerMapping {
  inputIds: string[];
  remnantId: string;
  oldIndices: number[];
  newIndex: number;
}

export interface SceneDeltaEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "SCENE_DELTA";
  modelRevision: number;
  topologyEpoch: number;
  causeRequestId: number | null;
  addedIds: string[];
  removedIds: string[];
  mergerMappings: MergerMapping[];
}

export interface CoreFrame {
  id: string;
  sceneIndex: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  coreRadius: number;
  generationSize: number;
  requestedPeakLinearY: number;
}

export interface GalaxyBounds {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FrameEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "FRAME";
  leaseId: number;
  frameId: number;
  modelRevision: number;
  topologyEpoch: number;
  stepIndex: number;
  positions: ArrayBuffer;
  cores: CoreFrame[];
  bounds: GalaxyBounds[];
}

export interface RecoveryCheckpointEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "RECOVERY_CHECKPOINT";
  checkpointId: string;
  modelRevision: number;
  stepIndex: number;
  activeWallMs: number;
  payload: unknown;
}
export interface HistoryStatusEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "HISTORY_STATUS";
  markerIds: number[];
  selectedMarkerId: number | null;
  reconstructing: boolean;
}

export type UnsolicitedWorkerEvent =
  TopologyEvent | SceneDeltaEvent | FrameEvent | RecoveryCheckpointEvent | HistoryStatusEvent;

export type DirectWorkerEvent =
  | ReadyEvent
  | AckEvent
  | RejectEvent
  | PongEvent
  | UndoSnapshotReadyEvent
  | DigestResultEvent
  | SceneSetupResultEvent
  | WorkerDisposingEvent;
export type SmokeWorkerEvent = DirectWorkerEvent;

export const EMPTY_ENGINE_SETUP: EngineSetup = { galaxies: [], gravity: 1, playbackSpeed: 1 };
