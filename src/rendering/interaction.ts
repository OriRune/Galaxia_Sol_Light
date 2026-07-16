/* eslint-disable @typescript-eslint/no-non-null-assertion -- Frame validation guarantees parallel-array lengths. */
import { MAX_BULK_SPEED, MAX_POSITION, MIN_POSITION } from "../domain/ranges";
import type { CoreFrame, TopologyEvent } from "../simulation/protocol";
import { screenToWorld, worldToScreen, type CameraState, type CssPoint } from "./camera";

const CELL_SIZE = 32;

export interface HitFrameIdentity {
  modelRevision: number;
  topologyEpoch: number;
  frameId: number;
}

export class HitGrid {
  private ownerIds: string[] = [];
  private ownerSlot = new Uint8Array();
  private renderedRadius = new Uint8Array();
  private screenX = new Float32Array();
  private screenY = new Float32Array();
  private nextIndex = new Int32Array();
  private cellHead = new Int32Array();
  private cols = 0;
  private rows = 0;
  private cores: { id: string; sceneIndex: number; x: number; y: number; radius: number }[] = [];
  private identity: HitFrameIdentity | null = null;

  applyTopology(topology: TopologyEvent): void {
    const total = topology.segments.reduce((sum, segment) => sum + segment.count, 0);
    this.ownerIds = topology.descriptors.map((descriptor) => descriptor.id);
    this.ownerSlot = new Uint8Array(total);
    this.renderedRadius = new Uint8Array(total);
    const blocks = new Map(topology.styleBlocks.map((block) => [block.id, block]));
    for (const segment of topology.segments) {
      const slot = this.ownerIds.indexOf(segment.ownerId);
      const block = blocks.get(segment.styleBlockId);
      if (slot < 0 || slot > 255 || !block) throw new Error("Invalid picking topology.");
      for (let offset = 0; offset < segment.count; offset += 1) {
        const index = segment.start + offset;
        this.ownerSlot[index] = slot;
        this.renderedRadius[index] = block.pointSize[offset] ?? 1;
      }
    }
    this.screenX = new Float32Array(total);
    this.screenY = new Float32Array(total);
    this.nextIndex = new Int32Array(total);
    this.identity = null;
  }

  applyFrame(
    camera: CameraState,
    positions: Float32Array,
    cores: readonly CoreFrame[],
    identity: HitFrameIdentity,
  ): void {
    if (positions.length !== this.screenX.length * 2)
      throw new Error("Picking frame count mismatch.");
    const cols = Math.ceil(camera.cssWidth / CELL_SIZE) + 2;
    const rows = Math.ceil(camera.cssHeight / CELL_SIZE) + 2;
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols;
      this.rows = rows;
      this.cellHead = new Int32Array(cols * rows);
    }
    this.cellHead.fill(-1);
    this.nextIndex.fill(-1);
    for (let index = 0; index < this.screenX.length; index += 1) {
      const screen = worldToScreen(camera, {
        x: positions[index * 2]!,
        y: positions[index * 2 + 1]!,
      });
      this.screenX[index] = screen.x;
      this.screenY[index] = screen.y;
      if (
        screen.x < -32 ||
        screen.x >= camera.cssWidth + 32 ||
        screen.y < -32 ||
        screen.y >= camera.cssHeight + 32
      )
        continue;
      const cellX = Math.min(cols - 1, Math.floor(screen.x / CELL_SIZE) + 1);
      const cellY = Math.min(rows - 1, Math.floor(screen.y / CELL_SIZE) + 1);
      const cell = cellY * cols + cellX;
      this.nextIndex[index] = this.cellHead[cell] ?? -1;
      this.cellHead[cell] = index;
    }
    this.cores = cores.map((core) => {
      const point = worldToScreen(camera, core);
      return {
        id: core.id,
        sceneIndex: core.sceneIndex,
        x: point.x,
        y: point.y,
        radius: core.coreRadius * camera.zoom,
      };
    });
    this.identity = { ...identity };
  }

  pick(point: CssPoint): string | null {
    const candidates = new Set<string>();
    const centerX = Math.floor(point.x / CELL_SIZE) + 1;
    const centerY = Math.floor(point.y / CELL_SIZE) + 1;
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = centerX + dx,
          y = centerY + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        let index = this.cellHead[y * this.cols + x] ?? -1;
        while (index >= 0) {
          const sx = this.screenX[index]!,
            sy = this.screenY[index]!,
            radius = this.renderedRadius[index]!;
          if ((sx - point.x) ** 2 + (sy - point.y) ** 2 <= radius ** 2)
            candidates.add(this.ownerIds[this.ownerSlot[index]!]!);
          index = this.nextIndex[index] ?? -1;
        }
      }
    for (const core of this.cores)
      if ((core.x - point.x) ** 2 + (core.y - point.y) ** 2 <= core.radius ** 2)
        candidates.add(core.id);
    let winner: { id: string; distance: number; sceneIndex: number } | null = null;
    for (const id of candidates) {
      const core = this.cores.find((candidate) => candidate.id === id);
      if (!core) continue;
      const distance = (core.x - point.x) ** 2 + (core.y - point.y) ** 2;
      if (
        !winner ||
        distance < winner.distance ||
        (distance === winner.distance && core.sceneIndex > winner.sceneIndex)
      )
        winner = { id, distance, sceneIndex: core.sceneIndex };
    }
    return winner?.id ?? null;
  }

  getIdentity(): HitFrameIdentity | null {
    return this.identity ? { ...this.identity } : null;
  }
  clear(): void {
    this.ownerIds = [];
    this.ownerSlot = new Uint8Array();
    this.renderedRadius = new Uint8Array();
    this.screenX = new Float32Array();
    this.screenY = new Float32Array();
    this.nextIndex = new Int32Array();
    this.cellHead = new Int32Array();
    this.cores = [];
    this.identity = null;
    this.cols = 0;
    this.rows = 0;
  }
}

export type DragCommit =
  | { type: "MOVE_GALAXY"; galaxyId: string; position: CssPoint }
  | { type: "SET_BULK_VELOCITY"; galaxyId: string; velocity: CssPoint };
export interface DragPreview {
  point: CssPoint;
  valid: boolean;
}

export class DragSession {
  private preview: DragPreview;
  private finished = false;
  private constructor(
    private readonly kind: "center" | "velocity",
    private readonly galaxyId: string,
    private readonly topologyEpoch: number,
    private readonly camera: CameraState,
    private readonly core: CssPoint,
    private readonly offset: CssPoint,
    initial: DragPreview,
  ) {
    this.preview = initial;
  }

  static center(
    galaxyId: string,
    topologyEpoch: number,
    camera: CameraState,
    core: CssPoint,
    pointer: CssPoint,
  ): DragSession {
    const world = screenToWorld(camera, pointer);
    return new DragSession(
      "center",
      galaxyId,
      topologyEpoch,
      camera,
      core,
      { x: world.x - core.x, y: world.y - core.y },
      { point: core, valid: true },
    );
  }
  static velocity(
    galaxyId: string,
    topologyEpoch: number,
    camera: CameraState,
    core: CssPoint,
    velocity: CssPoint,
  ): DragSession {
    return new DragSession(
      "velocity",
      galaxyId,
      topologyEpoch,
      camera,
      core,
      { x: 0, y: 0 },
      { point: velocity, valid: true },
    );
  }
  update(
    pointer: CssPoint,
    currentTopologyEpoch: number,
    liveIds: ReadonlySet<string>,
  ): DragPreview | null {
    if (
      this.finished ||
      currentTopologyEpoch !== this.topologyEpoch ||
      !liveIds.has(this.galaxyId)
    ) {
      this.finished = true;
      return null;
    }
    const world = screenToWorld(this.camera, pointer);
    if (this.kind === "center") {
      const point = { x: world.x - this.offset.x, y: world.y - this.offset.y };
      const valid =
        point.x >= MIN_POSITION &&
        point.x <= MAX_POSITION &&
        point.y >= MIN_POSITION &&
        point.y <= MAX_POSITION;
      if (valid) this.preview = { point, valid: true };
      else this.preview = { ...this.preview, valid: false };
    } else {
      const raw = { x: (world.x - this.core.x) / 2, y: (world.y - this.core.y) / 2 };
      const magnitude = Math.hypot(raw.x, raw.y),
        valid = magnitude <= MAX_BULK_SPEED;
      const factor = valid || magnitude === 0 ? 1 : MAX_BULK_SPEED / magnitude;
      this.preview = { point: { x: raw.x * factor, y: raw.y * factor }, valid };
    }
    return { point: { ...this.preview.point }, valid: this.preview.valid };
  }
  finish(): DragCommit | null {
    if (this.finished) return null;
    this.finished = true;
    if (!this.preview.valid) return null;
    return this.kind === "center"
      ? { type: "MOVE_GALAXY", galaxyId: this.galaxyId, position: { ...this.preview.point } }
      : { type: "SET_BULK_VELOCITY", galaxyId: this.galaxyId, velocity: { ...this.preview.point } };
  }
  cancel(): void {
    this.finished = true;
  }
}
