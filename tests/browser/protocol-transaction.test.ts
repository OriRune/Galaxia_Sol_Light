import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_GENERATION } from "../../src/domain/defaults";
import { SimulationClient } from "../../src/simulation/client";
import {
  PROTOCOL_VERSION,
  type DirectWorkerEvent,
  type SceneDeltaEvent,
  type TopologyEvent,
} from "../../src/simulation/protocol";

const clients: SimulationClient[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.dispose()));
});

describe("Worker revision and transaction contract", () => {
  it("retains and exactly restores a disclosed-age recovery checkpoint in a new Worker", async () => {
    const client = new SimulationClient();
    clients.push(client);
    await client.initialize(
      {
        galaxies: [
          {
            id: "recoverable",
            generation: { ...DEFAULT_GENERATION, starCount: 500 },
            name: null,
            position: { x: 0, y: 0 },
            bulkVelocity: { x: 0, y: 0 },
          },
        ],
        gravity: 1,
        playbackSpeed: 1,
      },
      false,
    );
    await client.command("STEP", {});
    await client.command("REQUEST_RECOVERY_CHECKPOINT", {});
    const retained = client.getRecoveryCheckpoint();
    expect(retained?.event.stepIndex).toBe(1);
    expect(retained?.ageMs).toBeGreaterThanOrEqual(0);
    const digestEvent = await client.command("REQUEST_STATE_DIGEST", {});
    if (digestEvent.type !== "DIGEST_RESULT") throw new Error("Expected digest result.");
    const retainedDigest = digestEvent.digest;
    await client.command("STEP", {});
    const evolvedEvent = await client.command("REQUEST_STATE_DIGEST", {});
    if (evolvedEvent.type !== "DIGEST_RESULT") throw new Error("Expected digest result.");
    expect(evolvedEvent.digest).not.toBe(retainedDigest);
    await expect(client.restoreLatestCheckpoint()).resolves.toMatchObject({
      type: "ACK",
      modelRevision: 2,
    });
    const restoredEvent = await client.command("REQUEST_STATE_DIGEST", {});
    if (restoredEvent.type !== "DIGEST_RESULT") throw new Error("Expected digest result.");
    expect(restoredEvent.digest).toBe(retainedDigest);
  });

  it("publishes a FRAME joined to the committed topology and receives its returned lease", async () => {
    const frames: { length: number; coreId: string; epoch: number }[] = [];
    const client = new SimulationClient(undefined, {
      applyFrame: (frame, positions) => {
        frames.push({
          length: positions.length,
          coreId: frame.cores[0]?.id ?? "",
          epoch: frame.topologyEpoch,
        });
      },
    });
    clients.push(client);
    await client.initialize(
      {
        galaxies: [
          {
            id: "frame-owner",
            generation: { ...DEFAULT_GENERATION, starCount: 500 },
            name: null,
            position: { x: 0, y: 0 },
            bulkVelocity: { x: 0, y: 0 },
          },
        ],
        gravity: 1,
        playbackSpeed: 1,
      },
      false,
    );
    client.tick(performance.now());
    await expect.poll(() => frames.length).toBe(1);
    expect(frames[0]).toEqual({ length: 1_000, coreId: "frame-owner", epoch: 1 });
    client.tick(performance.now());
    await expect.poll(() => frames.length).toBe(2);
  });

  it("commits an automatic merger topology/delta pair before STEP acknowledgement", async () => {
    const commits: { topology: TopologyEvent; delta: SceneDeltaEvent }[] = [];
    const client = new SimulationClient(undefined, {
      commitAutomaticEvents: (topology, delta) => {
        commits.push({ topology, delta });
      },
    });
    clients.push(client);
    const makeGalaxy = (id: string, x: number) => ({
      id,
      generation: { ...DEFAULT_GENERATION, starCount: 500 },
      name: id,
      position: { x, y: 0 },
      bulkVelocity: { x: 0, y: 0 },
    });
    await client.initialize(
      {
        galaxies: [makeGalaxy("a", -3), makeGalaxy("b", 3)],
        gravity: 1,
        playbackSpeed: 1,
      },
      false,
    );
    await expect(client.command("STEP", {})).resolves.toMatchObject({
      type: "ACK",
      modelRevision: 2,
    });
    const committed = commits[0];
    if (!committed) throw new Error("Automatic merger transaction was not committed.");
    expect(committed.topology.descriptors).toHaveLength(1);
    expect(committed.topology.descriptors[0]).toMatchObject({
      generation: { type: "elliptical", starCount: 1_000, mass: 50 },
      name: "a + b",
    });
    expect(committed.delta).toMatchObject({
      removedIds: ["a", "b"],
      mergerMappings: [{ inputIds: ["a", "b"], oldIndices: [0, 1], newIndex: 0 }],
    });
    expect(client.modelRevision).toBe(2);
  });

  it("increments revisions, rejects stale work, and releases snapshot locks", async () => {
    const client = new SimulationClient();
    clients.push(client);
    await client.initialize();
    const snapshot = await client.requestUndoSnapshot();
    const acknowledgement = await client.mutation(
      "SET_GRAVITY",
      { gravity: 2 },
      snapshot.snapshotId,
    );
    expect(acknowledgement.modelRevision).toBe(2);
    expect(client.modelRevision).toBe(2);
    await expect(
      client.command("SET_GRAVITY", { gravity: 3 }, { expectedModelRevision: 1 }),
    ).rejects.toThrow("STALE_REVISION");
    const next = await client.requestUndoSnapshot();
    await expect(client.requestUndoSnapshot()).rejects.toThrow("MUTATION_BUSY");
    await expect(
      client.command("RELEASE_UNDO_SNAPSHOT", { snapshotId: next.snapshotId }),
    ).resolves.toMatchObject({ type: "ACK", modelRevision: 2 });
    await expect(client.requestUndoSnapshot()).resolves.toMatchObject({ modelRevision: 2 });
  });

  it("rejects a duplicate request ID at the Worker boundary", async () => {
    const worker = new Worker(new URL("../../src/simulation/worker.ts", import.meta.url), {
      type: "module",
    });
    const events: DirectWorkerEvent[] = [];
    worker.onmessage = (event: MessageEvent<DirectWorkerEvent>) => events.push(event.data);
    const base = {
      protocolVersion: PROTOCOL_VERSION,
      expectedModelRevision: null,
      transactionSnapshotId: null,
    };
    worker.postMessage({
      ...base,
      requestId: 77,
      type: "INIT",
      payload: {
        initialSetup: { galaxies: [], gravity: 1, playbackSpeed: 1 },
        initialPlaying: true,
      },
    });
    await expect.poll(() => events.some((event) => event.type === "READY")).toBe(true);
    worker.postMessage({ ...base, requestId: 77, type: "PING", payload: { nonce: 9 } });
    await expect.poll(() => events.at(-1)?.type).toBe("REJECT");
    expect(events.at(-1)).toMatchObject({ code: "INVALID_PAYLOAD" });
    worker.terminate();
  });
});
