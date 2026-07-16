import { afterEach, describe, expect, it } from "vitest";
import { SimulationClient } from "../../src/simulation/client";
import { PROTOCOL_VERSION, type RejectEvent } from "../../src/simulation/protocol";

const clients: SimulationClient[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.dispose()));
});

describe("module Worker smoke", () => {
  it("initializes at revision 1 and answers PING", async () => {
    const client = new SimulationClient();
    clients.push(client);
    await expect(client.initialize()).resolves.toBe(1);
    await expect(client.ping(8675309)).resolves.toBe(8675309);
  });

  it("handles client lifecycle edge cases", async () => {
    const client = new SimulationClient();
    await expect(client.ping(1)).rejects.toThrow("unavailable");
    await client.dispose();
    await client.initialize();
    await expect(client.initialize()).rejects.toThrow("already initialized");
    await client.dispose();
    await client.dispose();
  });

  it("rejects the wrong protocol version", async () => {
    const worker = new Worker(new URL("../../src/simulation/worker.ts", import.meta.url), {
      type: "module",
    });
    const response = new Promise<RejectEvent>((resolve) => {
      worker.onmessage = (event: MessageEvent<RejectEvent>) => {
        resolve(event.data);
      };
    });
    worker.postMessage({
      protocolVersion: PROTOCOL_VERSION + 1,
      requestId: 7,
      expectedModelRevision: null,
      transactionSnapshotId: null,
      type: "INIT",
      payload: {},
    });
    await expect(response).resolves.toMatchObject({
      type: "REJECT",
      requestId: 7,
      code: "PROTOCOL_VERSION",
    });
    worker.terminate();
  });

  it("rejects commands before INIT and malformed requests", async () => {
    const worker = new Worker(new URL("../../src/simulation/worker.ts", import.meta.url), {
      type: "module",
    });
    const events: RejectEvent[] = [];
    worker.onmessage = (event: MessageEvent<RejectEvent>) => events.push(event.data);
    worker.postMessage({
      protocolVersion: PROTOCOL_VERSION,
      requestId: 2,
      expectedModelRevision: null,
      transactionSnapshotId: null,
      type: "PING",
      payload: { nonce: 1 },
    });
    await expect.poll(() => events.at(-1)?.code).toBe("NOT_INITIALIZED");
    worker.postMessage({ protocolVersion: PROTOCOL_VERSION, requestId: 3 });
    await expect.poll(() => events.at(-1)?.code).toBe("INVALID_PAYLOAD");
    worker.terminate();
  });

  it("rejects duplicate INIT and a malformed PING", async () => {
    const worker = new Worker(new URL("../../src/simulation/worker.ts", import.meta.url), {
      type: "module",
    });
    const events: { type: string; code?: string }[] = [];
    worker.onmessage = (event: MessageEvent<{ type: string; code?: string }>) => {
      events.push(event.data);
    };
    const base = {
      protocolVersion: PROTOCOL_VERSION,
      expectedModelRevision: null,
      transactionSnapshotId: null,
    };
    worker.postMessage({
      ...base,
      requestId: 4,
      type: "INIT",
      payload: {
        initialSetup: { galaxies: [], gravity: 1, playbackSpeed: 1 },
        initialPlaying: true,
      },
    });
    await expect.poll(() => events.some((event) => event.type === "READY")).toBe(true);
    worker.postMessage({
      ...base,
      requestId: 5,
      type: "INIT",
      payload: {
        initialSetup: { galaxies: [], gravity: 1, playbackSpeed: 1 },
        initialPlaying: true,
      },
    });
    await expect.poll(() => events.at(-1)?.code).toBe("ALREADY_INITIALIZED");
    worker.postMessage({ ...base, requestId: 6, type: "PING", payload: {} });
    await expect.poll(() => events.at(-1)?.code).toBe("INVALID_PAYLOAD");
    worker.terminate();
  });
});
