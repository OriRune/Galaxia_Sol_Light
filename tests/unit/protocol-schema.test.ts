import { describe, expect, it } from "vitest";

import { FIRST_LIGHT } from "../../src/domain/defaults";
import { workerRequestSchema, workerSignalSchema } from "../../src/domain/protocolSchemas";
import { PROTOCOL_VERSION, type WorkerRequest } from "../../src/simulation/protocol";

const empty = {};
const payloads: Record<WorkerRequest["type"], unknown> = {
  INIT: { initialSetup: { galaxies: [], gravity: 1, playbackSpeed: 1 }, initialPlaying: true },
  PLAY: empty,
  PAUSE: empty,
  STEP: empty,
  SET_PLAYBACK_SPEED: { playbackSpeed: 2 },
  SET_GRAVITY: { gravity: 2 },
  LOAD_SETUP: {
    setup: { galaxies: [FIRST_LIGHT], gravity: 1, playbackSpeed: 1 },
    postLoadPlaying: false,
  },
  ADD_GALAXY: { galaxy: FIRST_LIGHT },
  PATCH_GALAXY: {
    galaxyId: FIRST_LIGHT.id,
    generation: FIRST_LIGHT.generation,
    name: "First Light",
  },
  MOVE_GALAXY: { galaxyId: FIRST_LIGHT.id, position: { x: 2, y: -3 } },
  SET_BULK_VELOCITY: { galaxyId: FIRST_LIGHT.id, bulkVelocity: { x: 1, y: -1 } },
  DELETE_GALAXY: { galaxyId: FIRST_LIGHT.id },
  REGENERATE_SCENE: empty,
  REQUEST_UNDO_SNAPSHOT: empty,
  COMMIT_UI_ONLY_MUTATION: { snapshotId: "snapshot-1" },
  RESTORE_UNDO_SNAPSHOT: { snapshotId: "snapshot-1" },
  RELEASE_UNDO_SNAPSHOT: { snapshotId: "snapshot-1" },
  ENTER_HISTORY: { markerId: "marker-1" },
  SCRUB_TO_MARKER: { markerId: "marker-1", reconstructionToken: "token-1" },
  RESUME_FROM_MARKER: { markerId: "marker-1" },
  EXIT_HISTORY_TO_PRESENT: empty,
  REQUEST_STATE_DIGEST: empty,
  REQUEST_SCENE_SETUP: empty,
  REQUEST_RECOVERY_CHECKPOINT: empty,
  RESTORE_RECOVERY_CHECKPOINT: { checkpoint: {} },
  PING: { nonce: 42 },
  DISPOSE: empty,
};

describe("complete Worker protocol schemas", () => {
  it.each(Object.entries(payloads))("accepts the exact %s payload", (type, payload) => {
    expect(
      workerRequestSchema.safeParse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 1,
        expectedModelRevision: null,
        transactionSnapshotId: null,
        type,
        payload,
      }).success,
    ).toBe(true);
  });

  it.each(Object.keys(payloads))("rejects an invalid %s payload", (type) => {
    expect(
      workerRequestSchema.safeParse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 1,
        expectedModelRevision: null,
        transactionSnapshotId: null,
        type,
        payload: null,
      }).success,
    ).toBe(false);
  });

  it("accepts only the three exact fire-and-forget signals", () => {
    expect(
      workerSignalSchema.safeParse({ protocolVersion: 1, type: "TICK", payload: { nowMs: 5 } })
        .success,
    ).toBe(true);
    expect(
      workerSignalSchema.safeParse({
        protocolVersion: 1,
        type: "SET_VISIBILITY",
        payload: { visible: false },
      }).success,
    ).toBe(true);
    expect(
      workerSignalSchema.safeParse({
        protocolVersion: 1,
        type: "RETURN_FRAME_BUFFER",
        payload: { leaseId: 1, buffer: new ArrayBuffer(8) },
      }).success,
    ).toBe(true);
    expect(
      workerSignalSchema.safeParse({ protocolVersion: 1, type: "UNKNOWN", payload: {} }).success,
    ).toBe(false);
  });
});
