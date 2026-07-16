import { describe, expect, it, vi } from "vitest";
import { SimulationClient } from "../../src/simulation/client";
import { PROTOCOL_VERSION } from "../../src/simulation/protocol";

interface Request {
  requestId: number;
  type: string;
  payload: unknown;
}

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  responder: ((request: Request) => void) | null = null;
  terminated = false;

  postMessage(request: Request) {
    this.responder?.(request);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

const asWorker = (fake: FakeWorker) => fake as unknown as Worker;
const event = (requestId: number, type: string, fields = {}) => ({
  protocolVersion: PROTOCOL_VERSION,
  requestId,
  type,
  ...fields,
});

function emitReady(fake: FakeWorker, requestId: number) {
  const common = {
    protocolVersion: PROTOCOL_VERSION,
    modelRevision: 1,
    topologyEpoch: 1,
    causeRequestId: requestId,
  };
  fake.emit({ ...common, type: "TOPOLOGY", descriptors: [], segments: [], styleBlocks: [] });
  fake.emit({
    ...common,
    type: "SCENE_DELTA",
    addedIds: [],
    removedIds: [],
    mergerMappings: [],
  });
  fake.emit(event(requestId, "READY", { modelRevision: 1, status: "ready" }));
}

describe("SimulationClient protocol defenses", () => {
  it("handles unavailable, duplicate initialization, and concurrent mutation boundaries", async () => {
    const unavailable = new SimulationClient(() => asWorker(new FakeWorker()));
    await expect(unavailable.ping(1)).rejects.toThrow("unavailable");
    await expect(unavailable.restoreLatestCheckpoint()).rejects.toThrow("SNAPSHOT_NOT_FOUND");
    await expect(unavailable.dispose()).resolves.toBeUndefined();
    unavailable.tick(1);
    unavailable.setVisibility(false);
    unavailable.terminate();

    const fake = new FakeWorker();
    fake.responder = (request) => {
      emitReady(fake, request.requestId);
    };
    const client = new SimulationClient(() => asWorker(fake));
    await client.initialize();
    await expect(client.initialize()).rejects.toThrow("already initialized");
    fake.responder = null;
    const first = client.mutation("SET_GRAVITY", { gravity: 2 });
    await expect(client.mutation("SET_GRAVITY", { gravity: 3 })).rejects.toThrow(
      "already in flight",
    );
    client.terminate();
    await expect(first).rejects.toThrow("terminated");
  });

  it("rejects every valid-but-wrong direct response type", async () => {
    const fake = new FakeWorker();
    fake.responder = (request) => {
      emitReady(fake, request.requestId);
    };
    const client = new SimulationClient(() => asWorker(fake));
    await client.initialize();
    fake.responder = (request) => {
      fake.emit(event(request.requestId, "PONG", { nonce: 1 }));
    };
    await expect(client.requestUndoSnapshot()).rejects.toThrow("undo snapshot");
    await expect(client.requestSceneSetup()).rejects.toThrow("scene setup");
    await expect(client.requestStateDigest()).rejects.toThrow("state digest");
    await expect(client.releaseUndoSnapshot("snapshot")).rejects.toThrow("release");
    await expect(client.mutation("SET_GRAVITY", { gravity: 2 })).rejects.toThrow(
      "did not return ACK",
    );
    fake.responder = (request) => {
      fake.emit(event(request.requestId, "WORKER_DISPOSING"));
    };
    await client.dispose();
  });

  it("stages command topology/delta until the final response task", async () => {
    const fake = new FakeWorker();
    const commits: string[] = [];
    fake.responder = (request) => {
      const common = {
        protocolVersion: PROTOCOL_VERSION,
        modelRevision: 1,
        topologyEpoch: 1,
        causeRequestId: request.requestId,
      };
      fake.emit({
        ...common,
        type: "TOPOLOGY",
        descriptors: [],
        segments: [],
        styleBlocks: [],
      });
      expect(commits).toEqual([]);
      fake.emit({
        ...common,
        type: "SCENE_DELTA",
        addedIds: [],
        removedIds: [],
        mergerMappings: [],
      });
      expect(commits).toEqual([]);
      fake.emit(event(request.requestId, "READY", { modelRevision: 1, status: "ready" }));
    };
    const client = new SimulationClient(() => asWorker(fake), {
      commitCommandEvents: (_requestId, topology, delta) => {
        commits.push(`${topology?.type ?? "none"}/${delta?.type ?? "none"}`);
      },
    });
    await client.initialize();
    expect(commits).toEqual(["TOPOLOGY/SCENE_DELTA"]);
    fake.responder = (request) => {
      fake.emit(event(request.requestId, "WORKER_DISPOSING"));
    };
    await client.dispose();
  });

  it("commits automatic topology and delta only as a matching pair", async () => {
    const fake = new FakeWorker();
    const commits: number[] = [];
    const errors: string[] = [];
    fake.responder = (request) => {
      emitReady(fake, request.requestId);
    };
    const client = new SimulationClient(() => asWorker(fake), {
      commitAutomaticEvents: (topology) => {
        commits.push(topology.topologyEpoch);
      },
      protocolError: (message) => {
        errors.push(message);
      },
    });
    await client.initialize();
    const topology = {
      protocolVersion: PROTOCOL_VERSION,
      type: "TOPOLOGY",
      modelRevision: 2,
      topologyEpoch: 4,
      causeRequestId: null,
      descriptors: [],
      segments: [],
      styleBlocks: [],
    } as const;
    fake.emit(topology);
    expect(commits).toEqual([]);
    fake.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "SCENE_DELTA",
      modelRevision: 2,
      topologyEpoch: 4,
      causeRequestId: null,
      addedIds: [],
      removedIds: [],
      mergerMappings: [],
    });
    expect(commits).toEqual([4]);
    fake.emit(topology);
    fake.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "SCENE_DELTA",
      modelRevision: 3,
      topologyEpoch: 5,
      causeRequestId: null,
      addedIds: [],
      removedIds: [],
      mergerMappings: [],
    });
    expect(commits).toEqual([4]);
    expect(errors.at(-1)).toContain("PROTOCOL_SEQUENCE");
    fake.responder = (request) => {
      fake.emit(event(request.requestId, "WORKER_DISPOSING"));
    };
    await client.dispose();
  });

  it("ignores malformed, stale, and wrong-version events", async () => {
    const fake = new FakeWorker();
    fake.responder = (request) => {
      fake.emit(null);
      fake.emit({ requestId: request.requestId });
      fake.emit({ protocolVersion: 2, requestId: request.requestId });
      fake.emit(event(999, "PONG", { nonce: 0 }));
      emitReady(fake, request.requestId);
    };
    const client = new SimulationClient(() => asWorker(fake));
    await expect(client.initialize()).resolves.toBe(1);
    fake.responder = (request) => {
      fake.emit(event(request.requestId, "PONG", { nonce: 4 }));
    };
    await expect(client.ping(4)).resolves.toBe(4);
    fake.responder = (request) => {
      fake.emit(event(request.requestId, "WORKER_DISPOSING"));
    };
    await client.dispose();
    expect(fake.terminated).toBe(true);
  });

  it("rejects REJECT and invalid response types", async () => {
    const rejected = new FakeWorker();
    rejected.responder = (request) => {
      rejected.emit(
        event(request.requestId, "REJECT", {
          currentModelRevision: 0,
          code: "INVALID_REQUEST",
          message: "bad",
        }),
      );
    };
    await expect(new SimulationClient(() => asWorker(rejected)).initialize()).rejects.toThrow(
      "INVALID_REQUEST: bad",
    );
    const invalid = new FakeWorker();
    invalid.responder = (request) => {
      invalid.emit(event(request.requestId, "PONG", { nonce: 1 }));
    };
    await expect(new SimulationClient(() => asWorker(invalid)).initialize()).rejects.toThrow(
      "invalid READY",
    );
  });

  it("rejects pending work on Worker failures", async () => {
    const fake = new FakeWorker();
    const pending = new SimulationClient(() => asWorker(fake)).initialize();
    fake.onerror?.(new ErrorEvent("error"));
    await expect(pending).rejects.toThrow("Worker failed");
    const second = new FakeWorker();
    const secondPending = new SimulationClient(() => asWorker(second)).initialize();
    second.onmessageerror?.(new MessageEvent("messageerror"));
    await expect(secondPending).rejects.toThrow("message failed");
  });

  it("times out an unanswered request", async () => {
    vi.useFakeTimers();
    const pending = new SimulationClient(() => asWorker(new FakeWorker())).initialize();
    const assertion = expect(pending).rejects.toThrow("INIT timed out");
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    vi.useRealTimers();
  });
});
