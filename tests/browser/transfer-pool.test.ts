import { afterEach, describe, expect, it } from "vitest";
import {
  applyPublishedLease,
  type PublishedLease,
  type TransferPoolStats,
} from "../../perf/transfer-pool";

interface Response {
  type: "READY" | "FRAME" | "TICKED" | "FRAME_TRANSPORT" | "STATS";
  requestId: number;
  leaseId?: string;
  positions?: ArrayBuffer;
  stats?: TransferPoolStats;
}

const workers: Worker[] = [];

afterEach(() => {
  for (const worker of workers.splice(0)) worker.terminate();
});

function worker() {
  const result = new Worker(new URL("../../perf/transfer-pool.worker.ts", import.meta.url), {
    type: "module",
  });
  workers.push(result);
  return result;
}

function request(target: Worker, message: object, transfer: Transferable[] = []) {
  return new Promise<Response>((resolve, reject) => {
    const requestId = "requestId" in message ? Number(message.requestId) : -1;
    const onMessage = (event: MessageEvent<Response>) => {
      if (event.data.requestId !== requestId || event.data.type === "FRAME_TRANSPORT") return;
      cleanup();
      resolve(event.data);
    };
    const cleanup = () => {
      target.removeEventListener("message", onMessage);
      target.removeEventListener("error", onError);
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    };
    target.addEventListener("message", onMessage);
    target.addEventListener("error", onError);
    target.postMessage(message, transfer);
  });
}

async function initialize(target: Worker) {
  await request(target, { type: "INIT", requestId: 0, floatCount: 32 });
}

async function stats(target: Worker, requestId: number) {
  const response = await request(target, { type: "STATS", requestId });
  if (!response.stats) throw new Error("Missing transfer-pool statistics.");
  return response.stats;
}

describe("exact three-lease Worker transport", () => {
  it("completes 10,000 publish/return cycles without a fourth live lease", async () => {
    const target = worker();
    await initialize(target);
    for (let cycle = 1; cycle <= 10_000; cycle += 1) {
      const frame = await request(target, { type: "TICK", requestId: cycle });
      expect(frame.type).toBe("FRAME");
      if (!frame.leaseId || !frame.positions) throw new Error("Missing FRAME lease.");
      target.postMessage({ type: "RETURN", leaseId: frame.leaseId, positions: frame.positions }, [
        frame.positions,
      ]);
    }
    const result = await stats(target, 10_001);
    expect(result).toMatchObject({
      simulationSteps: 10_000,
      publications: 10_000,
      rebuilds: 0,
      freeLeases: 3,
      outstandingLeases: 0,
      currentLiveLeases: 3,
      maximumLiveLeases: 3,
    });
  }, 30_000);

  it("drops slow-main publications without stalling simulation", async () => {
    const target = worker();
    await initialize(target);
    const frame = await request(target, { type: "TICK", requestId: 1 });
    expect(frame.type).toBe("FRAME");
    expect((await request(target, { type: "TICK", requestId: 2 })).type).toBe("TICKED");
    expect((await request(target, { type: "TICK", requestId: 3 })).type).toBe("TICKED");
    const result = await stats(target, 4);
    expect(result.simulationSteps).toBe(3);
    expect(result.publications).toBe(1);
    expect(result.droppedPublications).toBe(2);
  });

  it("returns a lease when applyFrame throws", () => {
    const positions = new ArrayBuffer(16);
    const returned: unknown[] = [];
    const lease: PublishedLease = { leaseId: "1:1", positions };
    expect(() => {
      applyPublishedLease(
        {
          postMessage(message) {
            returned.push(message);
          },
        },
        lease,
        () => {
          throw new Error("injected apply failure");
        },
      );
    }).toThrow("injected apply failure");
    expect(returned).toHaveLength(1);
    expect(returned[0]).toMatchObject({ type: "RETURN", leaseId: "1:1", positions });
  });

  it("rebuilds exactly once after three missed opportunities and ignores the late old lease", async () => {
    const target = worker();
    await initialize(target);
    const old = await request(target, { type: "TICK", requestId: 1 });
    if (!old.leaseId || !old.positions) throw new Error("Missing old lease.");
    let recoveryEvents = 0;
    target.addEventListener("message", (event: MessageEvent<Response>) => {
      if (event.data.type === "FRAME_TRANSPORT") recoveryEvents += 1;
    });
    await request(target, { type: "TICK", requestId: 2 });
    await request(target, { type: "TICK", requestId: 3 });
    await request(target, { type: "TICK", requestId: 4 });
    target.postMessage({ type: "RETURN", leaseId: old.leaseId, positions: old.positions }, [
      old.positions,
    ]);
    const next = await request(target, { type: "TICK", requestId: 5 });
    expect(next.type).toBe("FRAME");
    if (!next.leaseId || !next.positions) throw new Error("Missing rebuilt lease.");
    expect(next.leaseId.startsWith("2:")).toBe(true);
    target.postMessage({ type: "RETURN", leaseId: next.leaseId, positions: next.positions }, [
      next.positions,
    ]);
    const result = await stats(target, 6);
    expect(recoveryEvents).toBe(1);
    expect(result).toMatchObject({
      rebuilds: 1,
      ignoredLateReturns: 1,
      freeLeases: 3,
      currentLiveLeases: 3,
      maximumLiveLeases: 3,
    });
  });
});
