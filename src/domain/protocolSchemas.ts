import { z } from "zod";

import {
  bulkVelocitySchema,
  engineSetupSchema,
  galaxyGenerationConfigSchema,
  galaxyRecordSchema,
  playbackSpeedSchema,
  positionSchema,
  stableIdSchema,
} from "./schemas";

const uint32 = z.number().int().min(0).max(0xffff_ffff);
const uint53 = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const boundedFinite = (minimum: number, maximum: number) =>
  z
    .number()
    .min(minimum)
    .max(maximum)
    .transform((value) => (Object.is(value, -0) ? 0 : value));
const empty = z.strictObject({});
const nullableRevision = z.union([uint53, z.null()]);
const nullableId = z.union([stableIdSchema, z.null()]);
const requestBase = {
  protocolVersion: z.literal(1),
  requestId: uint32,
  expectedModelRevision: nullableRevision,
  transactionSnapshotId: nullableId,
};
const command = <T extends string, S extends z.ZodType>(type: T, payload: S) =>
  z.strictObject({ ...requestBase, type: z.literal(type), payload });

export const workerRequestSchema = z.discriminatedUnion("type", [
  command("INIT", z.strictObject({ initialSetup: engineSetupSchema, initialPlaying: z.boolean() })),
  command("PLAY", empty),
  command("PAUSE", empty),
  command("STEP", empty),
  command("SET_PLAYBACK_SPEED", z.strictObject({ playbackSpeed: playbackSpeedSchema })),
  command("SET_GRAVITY", z.strictObject({ gravity: boundedFinite(0.25, 4) })),
  command("LOAD_SETUP", z.strictObject({ setup: engineSetupSchema, postLoadPlaying: z.boolean() })),
  command("ADD_GALAXY", z.strictObject({ galaxy: galaxyRecordSchema })),
  command(
    "PATCH_GALAXY",
    z.strictObject({
      galaxyId: stableIdSchema,
      generation: galaxyGenerationConfigSchema,
      name: z.union([z.string().trim().min(1), z.null()]),
    }),
  ),
  command("MOVE_GALAXY", z.strictObject({ galaxyId: stableIdSchema, position: positionSchema })),
  command(
    "SET_BULK_VELOCITY",
    z.strictObject({ galaxyId: stableIdSchema, bulkVelocity: bulkVelocitySchema }),
  ),
  command("DELETE_GALAXY", z.strictObject({ galaxyId: stableIdSchema })),
  command("REGENERATE_SCENE", empty),
  command("REQUEST_UNDO_SNAPSHOT", empty),
  command("COMMIT_UI_ONLY_MUTATION", z.strictObject({ snapshotId: stableIdSchema })),
  command("RESTORE_UNDO_SNAPSHOT", z.strictObject({ snapshotId: stableIdSchema })),
  command("RELEASE_UNDO_SNAPSHOT", z.strictObject({ snapshotId: stableIdSchema })),
  command("ENTER_HISTORY", z.strictObject({ markerId: stableIdSchema })),
  command(
    "SCRUB_TO_MARKER",
    z.strictObject({ markerId: stableIdSchema, reconstructionToken: stableIdSchema }),
  ),
  command("RESUME_FROM_MARKER", z.strictObject({ markerId: stableIdSchema })),
  command("EXIT_HISTORY_TO_PRESENT", empty),
  command("REQUEST_STATE_DIGEST", empty),
  command("REQUEST_SCENE_SETUP", empty),
  command("REQUEST_RECOVERY_CHECKPOINT", empty),
  command("RESTORE_RECOVERY_CHECKPOINT", z.strictObject({ checkpoint: z.unknown() })),
  command("PING", z.strictObject({ nonce: uint32 })),
  command("DISPOSE", empty),
]);

export const workerSignalSchema = z.discriminatedUnion("type", [
  z.strictObject({
    protocolVersion: z.literal(1),
    type: z.literal("TICK"),
    payload: z.strictObject({ nowMs: boundedFinite(0, Number.MAX_VALUE) }),
  }),
  z.strictObject({
    protocolVersion: z.literal(1),
    type: z.literal("SET_VISIBILITY"),
    payload: z.strictObject({ visible: z.boolean() }),
  }),
  z.strictObject({
    protocolVersion: z.literal(1),
    type: z.literal("RETURN_FRAME_BUFFER"),
    payload: z.strictObject({ leaseId: uint53, buffer: z.instanceof(ArrayBuffer) }),
  }),
]);
