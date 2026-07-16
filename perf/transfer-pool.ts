export const TRANSFER_POOL_SIZE = 3;

export interface PublishedLease {
  leaseId: string;
  positions: ArrayBuffer;
}

export interface TransferPoolStats {
  generation: number;
  simulationSteps: number;
  publications: number;
  droppedPublications: number;
  rebuilds: number;
  ignoredLateReturns: number;
  freeLeases: number;
  outstandingLeases: number;
  currentLiveLeases: number;
  maximumLiveLeases: number;
}

export class ThreeLeasePool {
  private generation = 1;
  private nextLease = 1;
  private free: ArrayBuffer[];
  private outstanding: string | null = null;
  private missedOpportunities = 0;
  private simulationSteps = 0;
  private publications = 0;
  private droppedPublications = 0;
  private rebuilds = 0;
  private ignoredLateReturns = 0;
  private maximumLiveLeases = TRANSFER_POOL_SIZE;

  constructor(private readonly floatCount: number) {
    this.free = this.allocatePool();
  }

  publicationOpportunity(): { lease: PublishedLease | null; rebuilt: boolean } {
    this.simulationSteps += 1;
    if (this.outstanding !== null) {
      this.droppedPublications += 1;
      this.missedOpportunities += 1;
      if (this.missedOpportunities === 3) {
        this.rebuild();
        return { lease: null, rebuilt: true };
      }
      return { lease: null, rebuilt: false };
    }
    const positions = this.free.pop();
    if (!positions) {
      this.droppedPublications += 1;
      return { lease: null, rebuilt: false };
    }
    const values = new Float32Array(positions);
    const step = this.simulationSteps;
    for (let index = 0; index < values.length; index += 2) {
      values[index] = step + index / 2;
      values[index + 1] = -step - index / 2;
    }
    const leaseId = `${String(this.generation)}:${String(this.nextLease)}`;
    this.nextLease += 1;
    this.outstanding = leaseId;
    this.missedOpportunities = 0;
    this.publications += 1;
    this.recordLiveCount();
    return { lease: { leaseId, positions }, rebuilt: false };
  }

  returnLease(leaseId: string, positions: ArrayBuffer) {
    if (leaseId !== this.outstanding || !leaseId.startsWith(`${String(this.generation)}:`)) {
      this.ignoredLateReturns += 1;
      return false;
    }
    if (positions.byteLength !== this.floatCount * Float32Array.BYTES_PER_ELEMENT) {
      this.rebuild();
      return false;
    }
    this.outstanding = null;
    this.missedOpportunities = 0;
    this.free.push(positions);
    this.recordLiveCount();
    return true;
  }

  stats(): TransferPoolStats {
    const outstandingLeases = this.outstanding === null ? 0 : 1;
    return {
      generation: this.generation,
      simulationSteps: this.simulationSteps,
      publications: this.publications,
      droppedPublications: this.droppedPublications,
      rebuilds: this.rebuilds,
      ignoredLateReturns: this.ignoredLateReturns,
      freeLeases: this.free.length,
      outstandingLeases,
      currentLiveLeases: this.free.length + outstandingLeases,
      maximumLiveLeases: this.maximumLiveLeases,
    };
  }

  private allocatePool() {
    return Array.from(
      { length: TRANSFER_POOL_SIZE },
      () => new ArrayBuffer(this.floatCount * Float32Array.BYTES_PER_ELEMENT),
    );
  }

  private rebuild() {
    this.generation += 1;
    this.free = this.allocatePool();
    this.outstanding = null;
    this.missedOpportunities = 0;
    this.rebuilds += 1;
    this.recordLiveCount();
  }

  private recordLiveCount() {
    const live = this.free.length + (this.outstanding === null ? 0 : 1);
    this.maximumLiveLeases = Math.max(this.maximumLiveLeases, live);
    if (live !== TRANSFER_POOL_SIZE)
      throw new Error("Transfer pool violated the three-lease invariant.");
  }
}

export interface LeaseReturnPort {
  postMessage(message: unknown, transfer: Transferable[]): void;
}

export function applyPublishedLease(
  port: LeaseReturnPort,
  lease: PublishedLease,
  applyFrame: (positions: Float32Array) => void,
) {
  try {
    applyFrame(new Float32Array(lease.positions));
  } finally {
    port.postMessage({ type: "RETURN", leaseId: lease.leaseId, positions: lease.positions }, [
      lease.positions,
    ]);
  }
}
