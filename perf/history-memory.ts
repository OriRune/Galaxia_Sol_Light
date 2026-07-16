const MIB = 1024 * 1024;
const RETAINED_LIMIT = 192 * MIB;
const TRANSIENT_LIMIT = 224 * MIB;

interface MutableState {
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
}

interface StyleBlock {
  id: number;
  red: Uint8Array;
  green: Uint8Array;
  blue: Uint8Array;
  alpha: Uint8Array;
  pointSize: Uint8Array;
}

interface Segment {
  start: number;
  length: number;
  ownerSlot: number;
  styleBlock: StyleBlock;
  styleOffset: number;
}

interface Snapshot {
  state: MutableState;
  segments: Segment[];
  stepIndex: number;
}

class StyleReferences {
  private readonly counts = new Map<number, number>();

  retain(snapshot: Snapshot) {
    for (const id of new Set(snapshot.segments.map((segment) => segment.styleBlock.id))) {
      this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
    }
  }

  release(snapshot: Snapshot) {
    for (const id of new Set(snapshot.segments.map((segment) => segment.styleBlock.id))) {
      const next = (this.counts.get(id) ?? 0) - 1;
      if (next === 0) this.counts.delete(id);
      else this.counts.set(id, next);
    }
  }

  count(id: number) {
    return this.counts.get(id) ?? 0;
  }

  get blocks() {
    return this.counts.size;
  }
}

class MarkerLru {
  private readonly states = new Map<number, Snapshot>();
  evictions = 0;

  insert(markerId: number, snapshot: Snapshot) {
    this.states.delete(markerId);
    this.states.set(markerId, snapshot);
    if (this.states.size > 10) {
      const [oldest] = this.states.keys();
      if (oldest === undefined) throw new Error("LRU eviction had no oldest entry.");
      this.states.delete(oldest);
      this.evictions += 1;
    }
  }

  get size() {
    return this.states.size;
  }

  get markerIds() {
    return [...this.states.keys()];
  }

  get snapshots() {
    return [...this.states.values()];
  }
}

function createState(starCount: number, phase: number): MutableState {
  const state = {
    x: new Float32Array(starCount),
    y: new Float32Array(starCount),
    vx: new Float32Array(starCount),
    vy: new Float32Array(starCount),
  };
  for (let index = 0; index < starCount; index += 1) {
    state.x[index] = Math.fround(index * 0.001 + phase);
    state.y[index] = Math.fround(-index * 0.002 + phase);
    state.vx[index] = Math.fround((index % 97) * 0.0001 + phase);
    state.vy[index] = Math.fround(-(index % 89) * 0.0001 - phase);
  }
  return state;
}

function cloneState(state: MutableState): MutableState {
  return { x: state.x.slice(), y: state.y.slice(), vx: state.vx.slice(), vy: state.vy.slice() };
}

function styleBlock(id: number, starCount: number): StyleBlock {
  const block = {
    id,
    red: new Uint8Array(starCount),
    green: new Uint8Array(starCount),
    blue: new Uint8Array(starCount),
    alpha: new Uint8Array(starCount),
    pointSize: new Uint8Array(starCount),
  };
  for (let index = 0; index < starCount; index += 1) {
    block.red[index] = (index + id) & 0xff;
    block.green[index] = (index * 3 + id) & 0xff;
    block.blue[index] = (index * 7 + id) & 0xff;
    block.alpha[index] = 204;
    block.pointSize[index] = (index % 3) + 1;
  }
  return block;
}

function snapshot(state: MutableState, segments: Segment[], stepIndex: number): Snapshot {
  return {
    state: cloneState(state),
    segments: segments.map((segment) => ({ ...segment })),
    stepIndex,
  };
}

function rebuildOwnerSlots(starCount: number, segments: Segment[]) {
  const owner = new Uint8Array(starCount);
  for (const segment of segments)
    owner.fill(segment.ownerSlot, segment.start, segment.start + segment.length);
  return owner;
}

function collectBuffers(value: unknown, buffers: Set<ArrayBuffer>) {
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) buffers.add(value.buffer);
    return;
  }
  if (value instanceof ArrayBuffer) {
    buffers.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectBuffers(item, buffers);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) collectBuffers(item, buffers);
  }
}

function bytesOf(...values: unknown[]) {
  const buffers = new Set<ArrayBuffer>();
  for (const value of values) collectBuffers(value, buffers);
  return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
}

async function digest(state: MutableState, segments: Segment[], stepIndex: number) {
  const header = new TextEncoder().encode("GALAXIA-ENGINE-1");
  const total =
    header.length +
    8 +
    state.x.byteLength * 4 +
    segments.reduce((sum, segment) => sum + segment.length * 5 + 12, 0);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  bytes.set(header, offset);
  offset += header.length;
  view.setUint32(offset, stepIndex >>> 0, true);
  view.setUint32(offset + 4, Math.floor(stepIndex / 2 ** 32), true);
  offset += 8;
  for (const array of [state.x, state.y, state.vx, state.vy]) {
    for (const value of array) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
  }
  for (const segment of segments) {
    view.setUint32(offset, segment.start, true);
    view.setUint32(offset + 4, segment.length, true);
    view.setUint32(offset + 8, segment.ownerSlot, true);
    offset += 12;
    const block = segment.styleBlock;
    for (let index = 0; index < segment.length; index += 1) {
      const source = segment.styleOffset + index;
      bytes[offset] = block.red[source] ?? 0;
      bytes[offset + 1] = block.green[source] ?? 0;
      bytes[offset + 2] = block.blue[source] ?? 0;
      bytes[offset + 3] = block.alpha[source] ?? 0;
      bytes[offset + 4] = block.pointSize[source] ?? 0;
      offset += 5;
    }
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export interface HistoryMemoryReport {
  starCount: number;
  keyframes: number;
  undoSnapshots: number;
  cacheEntries: number;
  cacheEvictions: number;
  denseCacheEntries: number;
  denseEvictions: number;
  styleBlocks: number;
  latestStyleReferenceCount: number;
  ownerSlotsMatch: boolean;
  originalDigest: string;
  restoredDigest: string;
  retainedBytes: number;
  transientBytes: number;
  retainedLimitBytes: number;
  transientLimitBytes: number;
}

export async function runHistoryMemoryProof(starCount = 120_000): Promise<HistoryMemoryReport> {
  const references = new StyleReferences();
  const base = createState(starCount, 0.125);
  const keyframes: Snapshot[] = [];
  const blocks: StyleBlock[] = [];
  for (let interval = 0; interval < 31; interval += 1) {
    const block = styleBlock(interval + 1, starCount);
    blocks.push(block);
    const current = snapshot(
      base,
      [
        {
          start: 0,
          length: starCount,
          ownerSlot: interval % 12,
          styleBlock: block,
          styleOffset: 0,
        },
      ],
      interval * 60,
    );
    keyframes.push(current);
    references.retain(current);
  }
  const latest = keyframes.at(-1);
  if (!latest) throw new Error("History proof produced no keyframes.");
  const latestSegment = latest.segments[0];
  if (!latestSegment) throw new Error("History proof produced no live segment.");
  const split = Math.floor(starCount / 2);
  const preMergerSegments: Segment[] = [
    {
      start: 0,
      length: split,
      ownerSlot: 3,
      styleBlock: latestSegment.styleBlock,
      styleOffset: 0,
    },
    {
      start: split,
      length: starCount - split,
      ownerSlot: 7,
      styleBlock: latestSegment.styleBlock,
      styleOffset: split,
    },
  ];
  const expectedOwner = rebuildOwnerSlots(starCount, preMergerSegments);
  const rebuiltOwner = rebuildOwnerSlots(
    starCount,
    preMergerSegments.map((segment) => ({ ...segment })),
  );
  const ownerSlotsMatch = expectedOwner.every((value, index) => rebuiltOwner[index] === value);
  const mergerSegments = preMergerSegments.map((segment) => ({ ...segment, ownerSlot: 0 }));
  const postMerger = snapshot(base, mergerSegments, 1_861);
  references.retain(postMerger);

  const undoSnapshots = Array.from({ length: 20 }, (_, index) =>
    snapshot(base, mergerSegments, 1_862 + index),
  );
  for (const item of undoSnapshots) references.retain(item);

  const cache = new MarkerLru();
  for (let marker = 1; marker <= 19; marker += 1)
    cache.insert(marker, snapshot(base, mergerSegments, marker));
  const dense = new MarkerLru();
  for (let marker = 1; marker <= 300; marker += 1) {
    dense.insert(marker, snapshot(base, mergerSegments, marker));
    if (dense.size > 10) throw new Error("Dense marker cache exceeded ten entries.");
  }

  const currentBank = cloneState(base);
  const candidateBank = cloneState(base);
  const pinnedPresent = snapshot(base, mergerSegments, 1_900);
  const reconstructionCandidate = snapshot(base, mergerSegments, 1_881);
  const framePool = Array.from({ length: 3 }, () => new Float32Array(starCount * 2));
  const mainOwnerSlots = rebuildOwnerSlots(starCount, mergerSegments);
  const mainHitPositions = new Float32Array(starCount * 2);
  const mainStyle = new Uint8Array(starCount * 5);
  const retainedBytes = bytesOf(
    keyframes,
    postMerger,
    undoSnapshots,
    cache.snapshots,
    currentBank,
    candidateBank,
    pinnedPresent,
    reconstructionCandidate,
    framePool,
    mainOwnerSlots,
    mainHitPositions,
    mainStyle,
  );
  const transientClone = snapshot(base, mergerSegments, 1_881);
  const transientBytes = bytesOf(
    keyframes,
    postMerger,
    undoSnapshots,
    cache.snapshots,
    currentBank,
    candidateBank,
    pinnedPresent,
    reconstructionCandidate,
    transientClone,
    framePool,
    mainOwnerSlots,
    mainHitPositions,
    mainStyle,
  );
  const originalDigest = await digest(postMerger.state, postMerger.segments, postMerger.stepIndex);
  const restored = snapshot(postMerger.state, postMerger.segments, postMerger.stepIndex);
  const restoredDigest = await digest(restored.state, restored.segments, restored.stepIndex);
  const latestStyleReferenceCount = references.count(latestSegment.styleBlock.id);
  references.release(postMerger);
  for (const item of undoSnapshots) references.release(item);

  return {
    starCount,
    keyframes: keyframes.length,
    undoSnapshots: undoSnapshots.length,
    cacheEntries: cache.size,
    cacheEvictions: cache.evictions,
    denseCacheEntries: dense.size,
    denseEvictions: dense.evictions,
    styleBlocks: references.blocks,
    latestStyleReferenceCount,
    ownerSlotsMatch,
    originalDigest,
    restoredDigest,
    retainedBytes,
    transientBytes,
    retainedLimitBytes: RETAINED_LIMIT,
    transientLimitBytes: TRANSIENT_LIMIT,
  };
}
