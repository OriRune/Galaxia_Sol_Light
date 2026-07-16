export const FRAME_POOL_SIZE = 3;

export interface FrameLease {
  leaseId: number;
  buffer: ArrayBuffer;
}

export class FramePool {
  private generation = 1;
  private nextLease = 1;
  private free: ArrayBuffer[];
  private outstanding: number | null = null;
  private missed = 0;

  constructor(private floatCount: number) {
    this.free = this.allocate();
  }

  resize(floatCount: number) {
    if (floatCount === this.floatCount) return;
    this.floatCount = floatCount;
    this.rebuild();
  }

  publicationOpportunity(): { lease: FrameLease | null; rebuilt: boolean } {
    if (this.outstanding !== null) {
      this.missed += 1;
      if (this.missed >= 3) {
        this.rebuild();
        return { lease: null, rebuilt: true };
      }
      return { lease: null, rebuilt: false };
    }
    const buffer = this.free.pop();
    if (!buffer) return { lease: null, rebuilt: false };
    const leaseId = this.generation * 1_000_000_000 + this.nextLease;
    this.nextLease += 1;
    this.outstanding = leaseId;
    this.missed = 0;
    return { lease: { leaseId, buffer }, rebuilt: false };
  }

  returnLease(leaseId: number, buffer: ArrayBuffer) {
    if (
      leaseId !== this.outstanding ||
      Math.floor(leaseId / 1_000_000_000) !== this.generation ||
      buffer.byteLength !== this.floatCount * Float32Array.BYTES_PER_ELEMENT
    ) {
      return false;
    }
    this.outstanding = null;
    this.missed = 0;
    this.free.push(buffer);
    return true;
  }

  private allocate() {
    return Array.from(
      { length: FRAME_POOL_SIZE },
      () => new ArrayBuffer(this.floatCount * Float32Array.BYTES_PER_ELEMENT),
    );
  }

  private rebuild() {
    this.generation += 1;
    this.free = this.allocate();
    this.outstanding = null;
    this.missed = 0;
  }
}
