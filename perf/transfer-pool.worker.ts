/// <reference lib="webworker" />

import { ThreeLeasePool } from "./transfer-pool";

type Request =
  | { type: "INIT"; requestId: number; floatCount: number }
  | { type: "TICK"; requestId: number }
  | { type: "RETURN"; leaseId: string; positions: ArrayBuffer }
  | { type: "STATS"; requestId: number };

const scope = self as DedicatedWorkerGlobalScope;
let pool: ThreeLeasePool | null = null;

scope.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "INIT") {
    pool = new ThreeLeasePool(request.floatCount);
    scope.postMessage({ type: "READY", requestId: request.requestId });
    return;
  }
  if (!pool) throw new Error("Transfer pool Worker is not initialized.");
  if (request.type === "RETURN") {
    pool.returnLease(request.leaseId, request.positions);
    return;
  }
  if (request.type === "STATS") {
    scope.postMessage({ type: "STATS", requestId: request.requestId, stats: pool.stats() });
    return;
  }
  const outcome = pool.publicationOpportunity();
  if (outcome.rebuilt) {
    scope.postMessage({ type: "FRAME_TRANSPORT", requestId: request.requestId });
  }
  if (outcome.lease) {
    scope.postMessage({ type: "FRAME", requestId: request.requestId, ...outcome.lease }, [
      outcome.lease.positions,
    ]);
  } else {
    scope.postMessage({ type: "TICKED", requestId: request.requestId });
  }
};
