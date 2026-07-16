/* eslint-disable @typescript-eslint/no-non-null-assertion -- Validated engine state and bounded loops guarantee slots. */
import { validateEngineSetup, validateGalaxyRecord } from "../domain/validation";
import { coreRadius } from "../domain/derived";
import type {
  EngineSetup,
  GalaxyGenerationConfig,
  GalaxyRecord,
  PlaybackSpeed,
} from "../domain/types";
import { canonicalGenerationWords } from "../generation/hashWords";
import { generateGalaxy } from "../generation/generateGalaxy";
import type { GeneratedGalaxy } from "../generation/shared";
import { DT } from "./constants";
import {
  accumulateCoreAccelerations,
  applyOverlapFrictionHalfImpulse,
  createFrictionWorkspace,
  type FrictionWorkspace,
} from "./corePhysics";
import { createRemnantRecord, eligibleMergerPairs } from "./merger";
import type { GalaxyDescriptor, SegmentDescriptor, StyleBlockTransfer } from "./protocol";
import type { MergerMapping } from "./protocol";
import { halfKickStars } from "./starPhysics";

export interface StateBank {
  coreX: Float64Array;
  coreY: Float64Array;
  coreVx: Float64Array;
  coreVy: Float64Array;
  coreAx: Float64Array;
  coreAy: Float64Array;
  starX: Float32Array;
  starY: Float32Array;
  starVx: Float32Array;
  starVy: Float32Array;
}

export interface EngineTopology {
  descriptors: readonly GalaxyDescriptor[];
  segments: readonly SegmentDescriptor[];
  styleBlocks: ReadonlyMap<string, Readonly<StyleBlockTransfer>>;
  ownerSlot: Uint8Array;
}

export interface EngineCheckpoint {
  version: 1;
  bank: StateBank;
  records: GalaxyRecord[];
  gravity: number;
  playbackSpeed: PlaybackSpeed;
  stepIndex: number;
  stepAccumulator: number;
  activeWallMs: number;
  topology: {
    descriptors: GalaxyDescriptor[];
    segments: SegmentDescriptor[];
    styleBlocks: StyleBlockTransfer[];
    ownerSlot: Uint8Array;
  };
  encounterPairs: string[];
  encounterEpisodes: [string, EncounterEpisode][];
  mergerEffects: [string, TimedPeak][];
}

interface EngineSnapshot {
  bank: StateBank;
  topology: EngineTopology;
  records: readonly GalaxyRecord[];
  gravity: number;
  playbackSpeed: PlaybackSpeed;
  playing: boolean;
  stepIndex: number;
  stepAccumulator: number;
  activeWallMs: number;
  encounterPairs: Set<string>;
  encounterEpisodes: Map<string, EncounterEpisode>;
  mergerEffects: Map<string, TimedPeak>;
  styleCounter: number;
  pendingMergerMappings: MergerMapping[];
  newRemnantsThisStep: Set<string>;
}

export interface EncounterEpisode {
  target: number;
  afterglowRemaining: number;
}

export interface TimedPeak {
  target: number;
  remaining: number;
}

function allocateBank(coreCount: number, starCount: number): StateBank {
  return {
    coreX: new Float64Array(coreCount),
    coreY: new Float64Array(coreCount),
    coreVx: new Float64Array(coreCount),
    coreVy: new Float64Array(coreCount),
    coreAx: new Float64Array(coreCount),
    coreAy: new Float64Array(coreCount),
    starX: new Float32Array(starCount),
    starY: new Float32Array(starCount),
    starVx: new Float32Array(starCount),
    starVy: new Float32Array(starCount),
  };
}

function copyBank(source: StateBank): StateBank {
  return {
    coreX: source.coreX.slice(),
    coreY: source.coreY.slice(),
    coreVx: source.coreVx.slice(),
    coreVy: source.coreVy.slice(),
    coreAx: source.coreAx.slice(),
    coreAy: source.coreAy.slice(),
    starX: source.starX.slice(),
    starY: source.starY.slice(),
    starVx: source.starVx.slice(),
    starVy: source.starVy.slice(),
  };
}

function cloneRecord(record: Readonly<GalaxyRecord>): GalaxyRecord {
  return {
    id: record.id,
    generation: { ...record.generation },
    name: record.name,
    position: { ...record.position },
    bulkVelocity: { ...record.bulkVelocity },
  };
}

function sameGeneration(left: GalaxyGenerationConfig, right: GalaxyGenerationConfig) {
  return (
    left.type === right.type &&
    left.seed === right.seed &&
    left.starCount === right.starCount &&
    left.size === right.size &&
    left.mass === right.mass &&
    left.spin === right.spin &&
    left.armCount === right.armCount &&
    left.blackHole === right.blackHole
  );
}

function allFinite(arrays: readonly (Float32Array | Float64Array)[]) {
  for (const array of arrays) for (const value of array) if (!Number.isFinite(value)) return false;
  return true;
}

export class Engine {
  currentBank: StateBank;
  candidateBank: StateBank;
  topology: EngineTopology;
  gravity: number;
  playbackSpeed: PlaybackSpeed;
  playing: boolean;
  stepIndex = 0;
  stepAccumulator = 0;
  activeWallMs = 0;
  private records: GalaxyRecord[];
  private styleCounter = 0;
  private snapshotCounter = 0;
  private readonly snapshots = new Map<string, EngineSnapshot>();
  private frictionWorkspace: FrictionWorkspace;
  private readonly starAccelerationWorkspace = new Float64Array(2);
  private pendingMergerMappings: MergerMapping[] = [];
  private encounterPairs = new Set<string>();
  private encounterEpisodes = new Map<string, EncounterEpisode>();
  private mergerEffects = new Map<string, TimedPeak>();
  private newRemnantsThisStep = new Set<string>();

  constructor(setup: unknown, playing: boolean) {
    const validated = validateEngineSetup(setup);
    this.gravity = validated.gravity;
    this.playbackSpeed = validated.playbackSpeed;
    this.playing = playing;
    this.records = validated.galaxies.map(cloneRecord);
    const built = this.buildFromRecords(this.records);
    this.currentBank = built.bank;
    this.candidateBank = allocateBank(this.records.length, this.currentBank.starX.length);
    this.topology = built.topology;
    this.frictionWorkspace = createFrictionWorkspace(this.records.length);
    this.validateState();
  }

  get galaxyCount() {
    return this.records.length;
  }

  get starCount() {
    return this.currentBank.starX.length;
  }

  sceneSetup(): EngineSetup {
    return {
      galaxies: this.records.map((record, index) => ({
        ...cloneRecord(record),
        position: { x: this.currentBank.coreX[index]!, y: this.currentBank.coreY[index]! },
        bulkVelocity: {
          x: this.currentBank.coreVx[index]!,
          y: this.currentBank.coreVy[index]!,
        },
      })),
      gravity: this.gravity,
      playbackSpeed: this.playbackSpeed,
    };
  }

  loadSetup(setup: unknown, postLoadPlaying: boolean) {
    this.replaceSetup(setup, postLoadPlaying, true);
    this.clearAllEffects();
  }

  addGalaxy(value: unknown) {
    const galaxy = cloneRecord(validateGalaxyRecord(value)),
      proposed = validateEngineSetup({
        ...this.sceneSetup(),
        galaxies: [...this.sceneSetup().galaxies, galaxy],
      }),
      accepted = proposed.galaxies.at(-1)!;
    const generated = generateGalaxy(accepted.generation),
      oldStars = this.starCount,
      bank = allocateBank(this.galaxyCount + 1, oldStars + generated.x.length);
    for (const key of ["coreX", "coreY", "coreVx", "coreVy", "coreAx", "coreAy"] as const)
      bank[key].set(this.currentBank[key]);
    for (const key of ["starX", "starY", "starVx", "starVy"] as const)
      bank[key].set(this.currentBank[key]);
    const newIndex = this.galaxyCount;
    bank.coreX[newIndex] = accepted.position.x;
    bank.coreY[newIndex] = accepted.position.y;
    bank.coreVx[newIndex] = accepted.bulkVelocity.x;
    bank.coreVy[newIndex] = accepted.bulkVelocity.y;
    this.copyGenerated(bank, generated, oldStars, accepted);
    const ownerSlot = new Uint8Array(bank.starX.length);
    ownerSlot.set(this.topology.ownerSlot);
    ownerSlot.fill(newIndex, oldStars);
    this.styleCounter += 1;
    const styleBlockId = `style-${String(this.styleCounter)}`,
      styleBlocks = new Map(this.topology.styleBlocks);
    styleBlocks.set(styleBlockId, {
      id: styleBlockId,
      red: generated.red,
      green: generated.green,
      blue: generated.blue,
      alpha: generated.alpha,
      pointSize: generated.pointSize,
    });
    this.records.push(cloneRecord(accepted));
    this.currentBank = bank;
    this.candidateBank = allocateBank(this.records.length, bank.starX.length);
    this.topology = {
      descriptors: this.records.map((record) => ({
        id: record.id,
        generation: { ...record.generation },
        name: record.name,
      })),
      segments: [
        ...this.topology.segments,
        { ownerId: accepted.id, start: oldStars, count: generated.x.length, styleBlockId },
      ],
      styleBlocks,
      ownerSlot,
    };
    this.frictionWorkspace = createFrictionWorkspace(this.records.length);
    this.validateState();
  }

  deleteGalaxy(id: string) {
    const removedIndex = this.records.findIndex((record) => record.id === id);
    if (removedIndex < 0) throw new Error("GALAXY_NOT_FOUND");
    const survivors = this.records
        .map((record, oldIndex) => ({ record: cloneRecord(record), oldIndex }))
        .filter(({ oldIndex }) => oldIndex !== removedIndex),
      survivingSegments = this.topology.segments.filter((segment) => segment.ownerId !== id),
      totalStars = survivingSegments.reduce((sum, segment) => sum + segment.count, 0),
      bank = allocateBank(survivors.length, totalStars),
      ownerSlot = new Uint8Array(totalStars),
      segments: SegmentDescriptor[] = [],
      styleBlocks = new Map<string, Readonly<StyleBlockTransfer>>();
    let offset = 0;
    survivors.forEach(({ record, oldIndex }, newIndex) => {
      bank.coreX[newIndex] = this.currentBank.coreX[oldIndex]!;
      bank.coreY[newIndex] = this.currentBank.coreY[oldIndex]!;
      bank.coreVx[newIndex] = this.currentBank.coreVx[oldIndex]!;
      bank.coreVy[newIndex] = this.currentBank.coreVy[oldIndex]!;
      for (const segment of survivingSegments) {
        if (segment.ownerId !== record.id) continue;
        const end = segment.start + segment.count;
        bank.starX.set(this.currentBank.starX.subarray(segment.start, end), offset);
        bank.starY.set(this.currentBank.starY.subarray(segment.start, end), offset);
        bank.starVx.set(this.currentBank.starVx.subarray(segment.start, end), offset);
        bank.starVy.set(this.currentBank.starVy.subarray(segment.start, end), offset);
        ownerSlot.fill(newIndex, offset, offset + segment.count);
        const style = this.topology.styleBlocks.get(segment.styleBlockId);
        if (!style) throw new Error("INVALID_SIMULATION_STATE");
        styleBlocks.set(style.id, style);
        segments.push({ ...segment, start: offset });
        offset += segment.count;
      }
    });
    this.records = survivors.map(({ record }) => record);
    this.currentBank = bank;
    this.candidateBank = allocateBank(this.records.length, totalStars);
    this.topology = {
      descriptors: this.records.map((record) => ({
        id: record.id,
        generation: { ...record.generation },
        name: record.name,
      })),
      segments,
      styleBlocks,
      ownerSlot,
    };
    this.frictionWorkspace = createFrictionWorkspace(this.records.length);
    this.clearEffectsFor(id);
    this.validateState();
  }

  patchGalaxy(id: string, generation: GalaxyGenerationConfig, name: string | null) {
    const index = this.records.findIndex((record) => record.id === id);
    const record = this.records[index];
    if (!record) throw new Error("GALAXY_NOT_FOUND");
    if (sameGeneration(record.generation, generation) && record.name === name)
      return "NO_CHANGE" as const;
    if (sameGeneration(record.generation, generation)) {
      record.name = name;
      this.refreshDescriptors();
      return "CHANGED" as const;
    }
    const setup = this.sceneSetup();
    const proposed = setup.galaxies[index];
    if (!proposed) throw new Error("GALAXY_NOT_FOUND");
    proposed.generation = { ...generation };
    proposed.name = name;
    this.regenerateRecord(index, proposed);
    this.clearEffectsFor(id);
    return "CHANGED" as const;
  }

  moveGalaxy(id: string, x: number, y: number) {
    const index = this.indexOf(id);
    const deltaX = x - this.currentBank.coreX[index]!;
    const deltaY = y - this.currentBank.coreY[index]!;
    this.currentBank.coreX[index] = x;
    this.currentBank.coreY[index] = y;
    for (const segment of this.topology.segments) {
      if (segment.ownerId !== id) continue;
      for (let star = segment.start; star < segment.start + segment.count; star += 1) {
        this.currentBank.starX[star] = Math.fround(this.currentBank.starX[star]! + deltaX);
        this.currentBank.starY[star] = Math.fround(this.currentBank.starY[star]! + deltaY);
      }
    }
    this.recordAt(index).position = { x, y };
    this.validateState();
  }

  setBulkVelocity(id: string, x: number, y: number) {
    const index = this.indexOf(id);
    const deltaX = x - this.currentBank.coreVx[index]!;
    const deltaY = y - this.currentBank.coreVy[index]!;
    this.currentBank.coreVx[index] = x;
    this.currentBank.coreVy[index] = y;
    for (const segment of this.topology.segments) {
      if (segment.ownerId !== id) continue;
      for (let star = segment.start; star < segment.start + segment.count; star += 1) {
        this.currentBank.starVx[star] = Math.fround(this.currentBank.starVx[star]! + deltaX);
        this.currentBank.starVy[star] = Math.fround(this.currentBank.starVy[star]! + deltaY);
      }
    }
    this.recordAt(index).bulkVelocity = { x, y };
    this.validateState();
  }

  regenerateScene() {
    if (this.records.length === 0) return "NO_CHANGE" as const;
    const setup = this.sceneSetup();
    this.replaceSetup(setup, this.playing, false);
    this.clearAllEffects();
    return "CHANGED" as const;
  }

  step(activeWallSeconds: number) {
    this.newRemnantsThisStep.clear();
    this.applyStartOfStepMergers();
    const source = this.currentBank;
    const candidate = this.candidateBank;
    candidate.coreX.set(source.coreX);
    candidate.coreY.set(source.coreY);
    candidate.coreVx.set(source.coreVx);
    candidate.coreVy.set(source.coreVy);
    candidate.starX.set(source.starX);
    candidate.starY.set(source.starY);
    candidate.starVx.set(source.starVx);
    candidate.starVy.set(source.starVy);
    const halfDt = DT / 2;
    try {
      accumulateCoreAccelerations(candidate, this.topology.descriptors, this.gravity);
      for (let core = 0; core < this.galaxyCount; core += 1) {
        candidate.coreVx[core] = candidate.coreVx[core]! + candidate.coreAx[core]! * halfDt;
        candidate.coreVy[core] = candidate.coreVy[core]! + candidate.coreAy[core]! * halfDt;
      }
      applyOverlapFrictionHalfImpulse(candidate, this.topology, this.frictionWorkspace, halfDt);
      halfKickStars(candidate, this.topology, this.gravity, halfDt, this.starAccelerationWorkspace);
      for (let core = 0; core < this.galaxyCount; core += 1) {
        candidate.coreX[core] = candidate.coreX[core]! + candidate.coreVx[core]! * DT;
        candidate.coreY[core] = candidate.coreY[core]! + candidate.coreVy[core]! * DT;
      }
      for (let star = 0; star < this.starCount; star += 1) {
        candidate.starX[star] = Math.fround(candidate.starX[star]! + candidate.starVx[star]! * DT);
        candidate.starY[star] = Math.fround(candidate.starY[star]! + candidate.starVy[star]! * DT);
      }
      accumulateCoreAccelerations(candidate, this.topology.descriptors, this.gravity);
      for (let core = 0; core < this.galaxyCount; core += 1) {
        candidate.coreVx[core] = candidate.coreVx[core]! + candidate.coreAx[core]! * halfDt;
        candidate.coreVy[core] = candidate.coreVy[core]! + candidate.coreAy[core]! * halfDt;
      }
      applyOverlapFrictionHalfImpulse(candidate, this.topology, this.frictionWorkspace, halfDt);
      halfKickStars(candidate, this.topology, this.gravity, halfDt, this.starAccelerationWorkspace);
      this.validateBank(candidate);
      this.currentBank = candidate;
      this.candidateBank = source;
      this.updateEffects(activeWallSeconds);
      if (activeWallSeconds > 0) this.activeWallMs += activeWallSeconds * 1_000;
      this.stepIndex += 1;
      return true;
    } catch {
      this.playing = false;
      return false;
    }
  }

  consumeMergerMappings() {
    const mappings = this.pendingMergerMappings;
    this.pendingMergerMappings = [];
    return mappings;
  }

  requestedPeakLinearY(id: string) {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record) throw new Error("GALAXY_NOT_FOUND");
    return Math.max(
      record.generation.blackHole ? 0.07 : 0.05,
      this.encounterEpisodes.get(id)?.target ?? 0,
      this.mergerEffects.get(id)?.target ?? 0,
    );
  }

  effectState() {
    return {
      encounterPairs: new Set(this.encounterPairs),
      encounterEpisodes: new Map(
        Array.from(this.encounterEpisodes, ([id, effect]) => [id, { ...effect }]),
      ),
      mergerEffects: new Map(Array.from(this.mergerEffects, ([id, effect]) => [id, { ...effect }])),
    };
  }

  requestSnapshot() {
    this.snapshotCounter += 1;
    const id = `engine-snapshot-${String(this.snapshotCounter)}`;
    this.snapshots.set(id, {
      bank: copyBank(this.currentBank),
      topology: this.topology,
      records: this.records.map(cloneRecord),
      gravity: this.gravity,
      playbackSpeed: this.playbackSpeed,
      playing: this.playing,
      stepIndex: this.stepIndex,
      stepAccumulator: this.stepAccumulator,
      activeWallMs: this.activeWallMs,
      encounterPairs: new Set(this.encounterPairs),
      encounterEpisodes: new Map(
        Array.from(this.encounterEpisodes, ([key, value]) => [key, { ...value }]),
      ),
      mergerEffects: new Map(Array.from(this.mergerEffects, ([key, value]) => [key, { ...value }])),
      styleCounter: this.styleCounter,
      pendingMergerMappings: this.pendingMergerMappings.map((mapping) => ({
        ...mapping,
        inputIds: [...mapping.inputIds],
        oldIndices: [...mapping.oldIndices],
      })),
      newRemnantsThisStep: new Set(this.newRemnantsThisStep),
    });
    return id;
  }

  restoreSnapshot(id: string) {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) throw new Error("SNAPSHOT_NOT_FOUND");
    this.currentBank = copyBank(snapshot.bank);
    this.candidateBank = allocateBank(snapshot.records.length, snapshot.bank.starX.length);
    this.frictionWorkspace = createFrictionWorkspace(snapshot.records.length);
    this.topology = snapshot.topology;
    this.records = snapshot.records.map(cloneRecord);
    this.gravity = snapshot.gravity;
    this.playbackSpeed = snapshot.playbackSpeed;
    this.playing = false;
    this.stepIndex = snapshot.stepIndex;
    this.stepAccumulator = snapshot.stepAccumulator;
    this.activeWallMs = snapshot.activeWallMs;
    this.encounterPairs = new Set(snapshot.encounterPairs);
    this.encounterEpisodes = new Map(
      Array.from(snapshot.encounterEpisodes, ([key, value]) => [key, { ...value }]),
    );
    this.mergerEffects = new Map(
      Array.from(snapshot.mergerEffects, ([key, value]) => [key, { ...value }]),
    );
    this.styleCounter = snapshot.styleCounter;
    this.pendingMergerMappings = snapshot.pendingMergerMappings.map((mapping) => ({
      ...mapping,
      inputIds: [...mapping.inputIds],
      oldIndices: [...mapping.oldIndices],
    }));
    this.newRemnantsThisStep = new Set(snapshot.newRemnantsThisStep);
    this.validateState();
  }

  releaseSnapshot(id: string) {
    return this.snapshots.delete(id);
  }

  snapshotByteAccounting() {
    const bankBytes = (bank: StateBank) =>
      bank.coreX.byteLength +
      bank.coreY.byteLength +
      bank.coreVx.byteLength +
      bank.coreVy.byteLength +
      bank.coreAx.byteLength +
      bank.coreAy.byteLength +
      bank.starX.byteLength +
      bank.starY.byteLength +
      bank.starVx.byteLength +
      bank.starVy.byteLength;
    let mutableBytes = 0;
    const styles = new Set<Readonly<StyleBlockTransfer>>();
    for (const style of this.topology.styleBlocks.values()) styles.add(style);
    for (const snapshot of this.snapshots.values()) {
      mutableBytes += bankBytes(snapshot.bank);
      for (const style of snapshot.topology.styleBlocks.values()) styles.add(style);
    }
    let styleBytes = 0;
    for (const style of styles)
      styleBytes +=
        style.red.byteLength +
        style.green.byteLength +
        style.blue.byteLength +
        style.alpha.byteLength +
        style.pointSize.byteLength;
    return {
      snapshotCount: this.snapshots.size,
      mutableBytes,
      sharedStyleBytes: styleBytes,
      totalBytes: mutableBytes + styleBytes,
    };
  }

  createCheckpoint(): EngineCheckpoint {
    const transfer = this.topologyTransfer();
    return {
      version: 1,
      bank: copyBank(this.currentBank),
      records: this.records.map(cloneRecord),
      gravity: this.gravity,
      playbackSpeed: this.playbackSpeed,
      stepIndex: this.stepIndex,
      stepAccumulator: this.stepAccumulator,
      activeWallMs: this.activeWallMs,
      topology: { ...transfer, ownerSlot: this.topology.ownerSlot.slice() },
      encounterPairs: Array.from(this.encounterPairs),
      encounterEpisodes: Array.from(this.encounterEpisodes, ([id, effect]) => [id, { ...effect }]),
      mergerEffects: Array.from(this.mergerEffects, ([id, effect]) => [id, { ...effect }]),
    };
  }

  restoreCheckpoint(checkpoint: EngineCheckpoint) {
    if (
      !(checkpoint.bank.starX instanceof Float32Array) ||
      !(checkpoint.topology.ownerSlot instanceof Uint8Array) ||
      checkpoint.bank.starX.length !== checkpoint.topology.ownerSlot.length
    ) {
      throw new Error("INVALID_SIMULATION_STATE");
    }
    const styleBlocks = new Map<string, Readonly<StyleBlockTransfer>>();
    for (const style of checkpoint.topology.styleBlocks) {
      styleBlocks.set(style.id, {
        id: style.id,
        red: style.red.slice(),
        green: style.green.slice(),
        blue: style.blue.slice(),
        alpha: style.alpha.slice(),
        pointSize: style.pointSize.slice(),
      });
    }
    this.currentBank = copyBank(checkpoint.bank);
    this.candidateBank = allocateBank(checkpoint.records.length, checkpoint.bank.starX.length);
    this.records = checkpoint.records.map(cloneRecord);
    this.topology = {
      descriptors: checkpoint.topology.descriptors.map((descriptor) => ({
        id: descriptor.id,
        generation: { ...descriptor.generation },
        name: descriptor.name,
      })),
      segments: checkpoint.topology.segments.map((segment) => ({ ...segment })),
      styleBlocks,
      ownerSlot: checkpoint.topology.ownerSlot.slice(),
    };
    this.gravity = checkpoint.gravity;
    this.playbackSpeed = checkpoint.playbackSpeed;
    this.playing = false;
    this.stepIndex = checkpoint.stepIndex;
    this.stepAccumulator = checkpoint.stepAccumulator;
    this.activeWallMs = checkpoint.activeWallMs;
    this.encounterPairs = new Set(checkpoint.encounterPairs);
    this.encounterEpisodes = new Map(
      checkpoint.encounterEpisodes.map(([id, effect]) => [id, { ...effect }]),
    );
    this.mergerEffects = new Map(
      checkpoint.mergerEffects.map(([id, effect]) => [id, { ...effect }]),
    );
    this.frictionWorkspace = createFrictionWorkspace(this.records.length);
    this.validateState();
  }

  async stateDigest() {
    const bytes = this.digestBytes();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
      "",
    );
  }

  topologyTransfer() {
    return {
      descriptors: this.topology.descriptors.map((descriptor) => ({
        id: descriptor.id,
        generation: { ...descriptor.generation },
        name: descriptor.name,
      })),
      segments: this.topology.segments.map((segment) => ({ ...segment })),
      styleBlocks: Array.from(this.topology.styleBlocks.values(), (style) => ({
        id: style.id,
        red: style.red.slice(),
        green: style.green.slice(),
        blue: style.blue.slice(),
        alpha: style.alpha.slice(),
        pointSize: style.pointSize.slice(),
      })),
    };
  }

  writeFrame(buffer: ArrayBuffer) {
    const positions = new Float32Array(buffer);
    if (positions.length !== this.starCount * 2) throw new Error("FRAME_TRANSPORT");
    for (let star = 0; star < this.starCount; star += 1) {
      positions[star * 2] = this.currentBank.starX[star]!;
      positions[star * 2 + 1] = this.currentBank.starY[star]!;
    }
    const cores = this.records.map((record, sceneIndex) => ({
      id: record.id,
      sceneIndex,
      x: this.currentBank.coreX[sceneIndex]!,
      y: this.currentBank.coreY[sceneIndex]!,
      vx: this.currentBank.coreVx[sceneIndex]!,
      vy: this.currentBank.coreVy[sceneIndex]!,
      coreRadius: coreRadius(record.generation.size),
      generationSize: record.generation.size,
      requestedPeakLinearY: this.requestedPeakLinearY(record.id),
    }));
    const bounds = this.records.map((record, sceneIndex) => {
      let minX = this.currentBank.coreX[sceneIndex]!;
      let minY = this.currentBank.coreY[sceneIndex]!;
      let maxX = minX;
      let maxY = minY;
      for (const segment of this.topology.segments) {
        if (segment.ownerId !== record.id) continue;
        for (let star = segment.start; star < segment.start + segment.count; star += 1) {
          const x = this.currentBank.starX[star]!;
          const y = this.currentBank.starY[star]!;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      return { id: record.id, minX, minY, maxX, maxY };
    });
    return { cores, bounds };
  }

  private buildFromRecords(records: readonly GalaxyRecord[]) {
    let totalStars = 0;
    for (const record of records) totalStars += record.generation.starCount;
    const bank = allocateBank(records.length, totalStars);
    const ownerSlot = new Uint8Array(totalStars);
    const segments: SegmentDescriptor[] = [];
    const styleBlocks = new Map<string, Readonly<StyleBlockTransfer>>();
    let offset = 0;
    records.forEach((record, sceneIndex) => {
      const generated = generateGalaxy(record.generation);
      bank.coreX[sceneIndex] = record.position.x;
      bank.coreY[sceneIndex] = record.position.y;
      bank.coreVx[sceneIndex] = record.bulkVelocity.x;
      bank.coreVy[sceneIndex] = record.bulkVelocity.y;
      this.copyGenerated(bank, generated, offset, record);
      ownerSlot.fill(sceneIndex, offset, offset + generated.x.length);
      this.styleCounter += 1;
      const styleBlockId = `style-${String(this.styleCounter)}`;
      styleBlocks.set(styleBlockId, {
        id: styleBlockId,
        red: generated.red,
        green: generated.green,
        blue: generated.blue,
        alpha: generated.alpha,
        pointSize: generated.pointSize,
      });
      segments.push({ ownerId: record.id, start: offset, count: generated.x.length, styleBlockId });
      offset += generated.x.length;
    });
    const descriptors = records.map((record) => ({
      id: record.id,
      generation: { ...record.generation },
      name: record.name,
    }));
    return {
      bank,
      topology: { descriptors, segments, styleBlocks, ownerSlot } satisfies EngineTopology,
    };
  }

  private regenerateRecord(targetIndex: number, proposed: GalaxyRecord): void {
    const generated = generateGalaxy(proposed.generation),
      targetId = this.recordAt(targetIndex).id,
      oldTargetStars = this.topology.segments
        .filter((segment) => segment.ownerId === targetId)
        .reduce((sum, segment) => sum + segment.count, 0),
      totalStars = this.starCount - oldTargetStars + generated.x.length,
      bank = allocateBank(this.records.length, totalStars),
      ownerSlot = new Uint8Array(totalStars),
      segments: SegmentDescriptor[] = [],
      styleBlocks = new Map<string, Readonly<StyleBlockTransfer>>();
    let offset = 0;
    this.records.forEach((record, sceneIndex) => {
      bank.coreX[sceneIndex] = this.currentBank.coreX[sceneIndex]!;
      bank.coreY[sceneIndex] = this.currentBank.coreY[sceneIndex]!;
      bank.coreVx[sceneIndex] = this.currentBank.coreVx[sceneIndex]!;
      bank.coreVy[sceneIndex] = this.currentBank.coreVy[sceneIndex]!;
      if (sceneIndex === targetIndex) {
        const replacement = cloneRecord(proposed);
        replacement.position = { x: bank.coreX[sceneIndex], y: bank.coreY[sceneIndex] };
        replacement.bulkVelocity = {
          x: bank.coreVx[sceneIndex],
          y: bank.coreVy[sceneIndex],
        };
        this.copyGenerated(bank, generated, offset, replacement);
        ownerSlot.fill(sceneIndex, offset, offset + generated.x.length);
        this.styleCounter += 1;
        const styleBlockId = `style-${String(this.styleCounter)}`;
        styleBlocks.set(styleBlockId, {
          id: styleBlockId,
          red: generated.red,
          green: generated.green,
          blue: generated.blue,
          alpha: generated.alpha,
          pointSize: generated.pointSize,
        });
        segments.push({
          ownerId: targetId,
          start: offset,
          count: generated.x.length,
          styleBlockId,
        });
        offset += generated.x.length;
        return;
      }
      for (const segment of this.topology.segments) {
        if (segment.ownerId !== record.id) continue;
        const end = segment.start + segment.count;
        bank.starX.set(this.currentBank.starX.subarray(segment.start, end), offset);
        bank.starY.set(this.currentBank.starY.subarray(segment.start, end), offset);
        bank.starVx.set(this.currentBank.starVx.subarray(segment.start, end), offset);
        bank.starVy.set(this.currentBank.starVy.subarray(segment.start, end), offset);
        ownerSlot.fill(sceneIndex, offset, offset + segment.count);
        const style = this.topology.styleBlocks.get(segment.styleBlockId);
        if (!style) throw new Error("INVALID_SIMULATION_STATE");
        styleBlocks.set(style.id, style);
        segments.push({ ...segment, start: offset });
        offset += segment.count;
      }
    });
    this.records[targetIndex] = cloneRecord(proposed);
    this.currentBank = bank;
    this.candidateBank = allocateBank(this.records.length, totalStars);
    this.topology = {
      descriptors: this.records.map((record) => ({
        id: record.id,
        generation: { ...record.generation },
        name: record.name,
      })),
      segments,
      styleBlocks,
      ownerSlot,
    };
    this.frictionWorkspace = createFrictionWorkspace(this.records.length);
    this.validateState();
  }

  private applyStartOfStepMergers() {
    const pairs = eligibleMergerPairs(this.records, this.currentBank);
    if (pairs.length === 0) return;
    const removed = new Set<number>();
    for (const pair of pairs) {
      removed.add(pair.first);
      removed.add(pair.second);
    }
    const survivorIndices = this.records
      .map((_, index) => index)
      .filter((index) => !removed.has(index));
    const occupiedIds = new Set(survivorIndices.map((index) => this.recordAt(index).id));
    const remnants = pairs.map((pair) =>
      createRemnantRecord(
        this.recordAt(pair.first),
        this.recordAt(pair.second),
        this.currentBank,
        pair.first,
        pair.second,
        this.stepIndex,
        pair.ordinal,
        occupiedIds,
      ),
    );
    const remnantEffects = remnants.map((remnant, ordinal) => {
      const pair = pairs[ordinal]!;
      return {
        id: remnant.id,
        target:
          Math.max(
            this.requestedPeakLinearY(this.recordAt(pair.first).id),
            this.requestedPeakLinearY(this.recordAt(pair.second).id),
          ) * 1.3,
      };
    });
    const newRecords = [
      ...survivorIndices.map((index) => {
        const record = cloneRecord(this.recordAt(index));
        record.position = {
          x: this.currentBank.coreX[index]!,
          y: this.currentBank.coreY[index]!,
        };
        record.bulkVelocity = {
          x: this.currentBank.coreVx[index]!,
          y: this.currentBank.coreVy[index]!,
        };
        return record;
      }),
      ...remnants,
    ];
    const bank = allocateBank(newRecords.length, this.starCount);
    const ownerSlot = new Uint8Array(this.starCount);
    const segments: SegmentDescriptor[] = [];
    const styleBlocks = new Map<string, Readonly<StyleBlockTransfer>>();
    let offset = 0;
    const appendOwner = (
      sourceOwnerIds: readonly string[],
      targetOwner: string,
      ownerIndex: number,
    ) => {
      for (const sourceSegment of this.topology.segments) {
        if (!sourceOwnerIds.includes(sourceSegment.ownerId)) continue;
        const end = sourceSegment.start + sourceSegment.count;
        bank.starX.set(this.currentBank.starX.subarray(sourceSegment.start, end), offset);
        bank.starY.set(this.currentBank.starY.subarray(sourceSegment.start, end), offset);
        bank.starVx.set(this.currentBank.starVx.subarray(sourceSegment.start, end), offset);
        bank.starVy.set(this.currentBank.starVy.subarray(sourceSegment.start, end), offset);
        ownerSlot.fill(ownerIndex, offset, offset + sourceSegment.count);
        const style = this.topology.styleBlocks.get(sourceSegment.styleBlockId);
        if (!style) throw new Error("INVALID_SIMULATION_STATE");
        styleBlocks.set(style.id, style);
        segments.push({
          ownerId: targetOwner,
          start: offset,
          count: sourceSegment.count,
          styleBlockId: sourceSegment.styleBlockId,
        });
        offset += sourceSegment.count;
      }
    };
    survivorIndices.forEach((oldIndex, newIndex) => {
      const record = this.recordAt(oldIndex);
      bank.coreX[newIndex] = this.currentBank.coreX[oldIndex]!;
      bank.coreY[newIndex] = this.currentBank.coreY[oldIndex]!;
      bank.coreVx[newIndex] = this.currentBank.coreVx[oldIndex]!;
      bank.coreVy[newIndex] = this.currentBank.coreVy[oldIndex]!;
      appendOwner([record.id], record.id, newIndex);
    });
    pairs.forEach((pair, ordinal) => {
      const newIndex = survivorIndices.length + ordinal;
      const remnant = remnants[ordinal]!;
      bank.coreX[newIndex] = remnant.position.x;
      bank.coreY[newIndex] = remnant.position.y;
      bank.coreVx[newIndex] = remnant.bulkVelocity.x;
      bank.coreVy[newIndex] = remnant.bulkVelocity.y;
      appendOwner(
        [this.recordAt(pair.first).id, this.recordAt(pair.second).id],
        remnant.id,
        newIndex,
      );
    });
    if (offset !== this.starCount) throw new Error("INVALID_SIMULATION_STATE");
    const mergerMappings = pairs.map((pair, ordinal) => ({
      inputIds: [this.recordAt(pair.first).id, this.recordAt(pair.second).id],
      remnantId: remnants[ordinal]!.id,
      oldIndices: [pair.first, pair.second],
      newIndex: survivorIndices.length + ordinal,
    }));
    this.records = newRecords;
    this.currentBank = bank;
    this.candidateBank = allocateBank(newRecords.length, this.starCount);
    this.topology = {
      descriptors: newRecords.map((record) => ({
        id: record.id,
        generation: { ...record.generation },
        name: record.name,
      })),
      segments,
      styleBlocks,
      ownerSlot,
    };
    this.frictionWorkspace = createFrictionWorkspace(newRecords.length);
    const removedIds = new Set(mergerMappings.flatMap((mapping) => mapping.inputIds));
    this.encounterPairs = new Set(
      Array.from(this.encounterPairs).filter((key) => {
        const pairIds = key.split("\u0000");
        return Array.from(removedIds).every((id) => !pairIds.includes(id));
      }),
    );
    for (const id of removedIds) {
      this.encounterEpisodes.delete(id);
      this.mergerEffects.delete(id);
    }
    for (const effect of remnantEffects) {
      this.mergerEffects.set(effect.id, { target: effect.target, remaining: 1.1 });
      this.newRemnantsThisStep.add(effect.id);
    }
    this.pendingMergerMappings.push(...mergerMappings);
  }

  private updateEffects(activeWallSeconds: number) {
    const previousInside = new Set<string>();
    for (const key of this.encounterPairs) {
      for (const id of key.split("\u0000")) previousInside.add(id);
    }
    const currentPairs = new Set<string>();
    const currentInside = new Set<string>();
    for (let first = 0; first < this.records.length; first += 1) {
      for (let second = first + 1; second < this.records.length; second += 1) {
        const firstRecord = this.recordAt(first);
        const secondRecord = this.recordAt(second);
        if (
          this.newRemnantsThisStep.has(firstRecord.id) ||
          this.newRemnantsThisStep.has(secondRecord.id)
        ) {
          continue;
        }
        const separation = Math.hypot(
          this.currentBank.coreX[second]! - this.currentBank.coreX[first]!,
          this.currentBank.coreY[second]! - this.currentBank.coreY[first]!,
        );
        const threshold =
          2 *
          (Math.max(2, firstRecord.generation.size * 0.1) +
            Math.max(2, secondRecord.generation.size * 0.1));
        if (separation <= threshold) {
          currentPairs.add(`${firstRecord.id}\u0000${secondRecord.id}`);
          currentInside.add(firstRecord.id);
          currentInside.add(secondRecord.id);
        }
      }
    }
    for (const record of this.records) {
      const episode = this.encounterEpisodes.get(record.id);
      if (currentInside.has(record.id)) {
        if (!episode) {
          const baseOrMerger = Math.max(
            record.generation.blackHole ? 0.07 : 0.05,
            this.mergerEffects.get(record.id)?.target ?? 0,
          );
          this.encounterEpisodes.set(record.id, {
            target: baseOrMerger * 1.18,
            afterglowRemaining: 0,
          });
        } else {
          episode.afterglowRemaining = 0;
        }
      } else if (episode && previousInside.has(record.id)) {
        episode.afterglowRemaining = 0.55;
      } else if (episode && episode.afterglowRemaining > 0 && activeWallSeconds > 0) {
        episode.afterglowRemaining = Math.max(0, episode.afterglowRemaining - activeWallSeconds);
        if (episode.afterglowRemaining === 0) this.encounterEpisodes.delete(record.id);
      }
    }
    if (activeWallSeconds > 0) {
      for (const [id, effect] of this.mergerEffects) {
        if (this.newRemnantsThisStep.has(id)) continue;
        effect.remaining = Math.max(0, effect.remaining - activeWallSeconds);
        if (effect.remaining === 0) this.mergerEffects.delete(id);
      }
    }
    this.encounterPairs = currentPairs;
  }

  private clearEffectsFor(id: string) {
    this.encounterEpisodes.delete(id);
    this.mergerEffects.delete(id);
    this.encounterPairs = new Set(
      Array.from(this.encounterPairs).filter((key) => !key.split("\u0000").includes(id)),
    );
  }

  private clearAllEffects() {
    this.encounterPairs.clear();
    this.encounterEpisodes.clear();
    this.mergerEffects.clear();
  }

  private replaceSetup(setup: unknown, playing: boolean, resetTimeline: boolean) {
    const validated = validateEngineSetup(setup);
    const records = validated.galaxies.map(cloneRecord);
    const built = this.buildFromRecords(records);
    this.records = records;
    this.gravity = validated.gravity;
    this.playbackSpeed = validated.playbackSpeed;
    this.playing = playing;
    if (resetTimeline) {
      this.stepIndex = 0;
      this.stepAccumulator = 0;
      this.activeWallMs = 0;
    }
    this.commitBuild(built);
  }

  private copyGenerated(
    bank: StateBank,
    generated: GeneratedGalaxy,
    offset: number,
    record: GalaxyRecord,
  ) {
    for (let index = 0; index < generated.x.length; index += 1) {
      const target = offset + index;
      bank.starX[target] = Math.fround(generated.x[index]! + record.position.x);
      bank.starY[target] = Math.fround(generated.y[index]! + record.position.y);
      bank.starVx[target] = Math.fround(generated.vx[index]! + record.bulkVelocity.x);
      bank.starVy[target] = Math.fround(generated.vy[index]! + record.bulkVelocity.y);
    }
  }

  private commitBuild(built: { bank: StateBank; topology: EngineTopology }) {
    this.currentBank = built.bank;
    this.candidateBank = allocateBank(this.records.length, built.bank.starX.length);
    this.topology = built.topology;
    this.frictionWorkspace = createFrictionWorkspace(this.records.length);
    this.validateState();
  }

  private refreshDescriptors() {
    this.topology = {
      ...this.topology,
      descriptors: this.records.map((record) => ({
        id: record.id,
        generation: { ...record.generation },
        name: record.name,
      })),
    };
  }

  private indexOf(id: string) {
    const index = this.records.findIndex((record) => record.id === id);
    if (index < 0) throw new Error("GALAXY_NOT_FOUND");
    return index;
  }

  private recordAt(index: number) {
    const record = this.records[index];
    if (!record) throw new Error("GALAXY_NOT_FOUND");
    return record;
  }

  private validateState() {
    this.validateBank(this.currentBank);
  }

  private validateBank(bank: StateBank) {
    if (
      !allFinite([
        bank.coreX,
        bank.coreY,
        bank.coreVx,
        bank.coreVy,
        bank.starX,
        bank.starY,
        bank.starVx,
        bank.starVy,
      ])
    ) {
      throw new Error("INVALID_SIMULATION_STATE");
    }
    if (this.topology.ownerSlot.length !== bank.starX.length) {
      throw new Error("INVALID_SIMULATION_STATE");
    }
  }

  private digestBytes() {
    const encoder = new TextEncoder();
    const pairs = Array.from(this.encounterPairs).sort();
    const episodes = Array.from(this.encounterEpisodes).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const mergerEffects = Array.from(this.mergerEffects).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const header = encoder.encode("GALAXIA-ENGINE-1");
    const variable: Uint8Array[] = [];
    for (const record of this.records) {
      variable.push(encoder.encode(record.id));
      if (record.name !== null) variable.push(encoder.encode(record.name));
    }
    for (const segment of this.topology.segments) variable.push(encoder.encode(segment.ownerId));
    let length = header.length + 8 + 16 + 4 + 4 + this.starCount * 16 + 8;
    let variableIndex = 0;
    for (const record of this.records) {
      const id = variable[variableIndex++]!;
      const name = record.name === null ? null : variable[variableIndex++]!;
      length +=
        4 +
        id.length +
        canonicalGenerationWords(record.generation, true).length * 4 +
        4 +
        (name?.length ?? 0) +
        32;
    }
    for (const segment of this.topology.segments) {
      const owner = variable[variableIndex++]!;
      length += 4 + owner.length + 8 + segment.count * 5;
    }
    length += 4 + pairs.reduce((sum, key) => sum + 4 + encoder.encode(key).length, 0);
    length += 4 + episodes.reduce((sum, [id]) => sum + 4 + encoder.encode(id).length + 16, 0);
    length += 4 + mergerEffects.reduce((sum, [id]) => sum + 4 + encoder.encode(id).length + 16, 0);
    const bytes = new Uint8Array(length);
    const view = new DataView(bytes.buffer);
    let offset = 0;
    bytes.set(header, offset);
    offset += header.length;
    view.setUint32(offset, this.stepIndex >>> 0, true);
    view.setUint32(offset + 4, Math.floor(this.stepIndex / 4_294_967_296), true);
    offset += 8;
    view.setFloat64(offset, this.gravity, true);
    view.setFloat64(offset + 8, this.playbackSpeed, true);
    offset += 16;
    view.setUint32(offset, this.records.length, true);
    offset += 4;
    for (let index = 0; index < this.records.length; index += 1) {
      const record = this.records[index]!;
      offset = this.writeText(bytes, view, offset, record.id);
      for (const word of canonicalGenerationWords(record.generation, true)) {
        view.setUint32(offset, word, true);
        offset += 4;
      }
      if (record.name === null) {
        view.setUint32(offset, 0xffff_ffff, true);
        offset += 4;
      } else offset = this.writeText(bytes, view, offset, record.name);
      view.setFloat64(offset, this.currentBank.coreX[index]!, true);
      view.setFloat64(offset + 8, this.currentBank.coreY[index]!, true);
      view.setFloat64(offset + 16, this.currentBank.coreVx[index]!, true);
      view.setFloat64(offset + 24, this.currentBank.coreVy[index]!, true);
      offset += 32;
    }
    view.setUint32(offset, this.starCount, true);
    offset += 4;
    for (const array of [
      this.currentBank.starX,
      this.currentBank.starY,
      this.currentBank.starVx,
      this.currentBank.starVy,
    ]) {
      for (const value of array) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
    }
    for (const segment of this.topology.segments) {
      offset = this.writeText(bytes, view, offset, segment.ownerId);
      view.setUint32(offset, segment.start, true);
      view.setUint32(offset + 4, segment.count, true);
      offset += 8;
      const style = this.topology.styleBlocks.get(segment.styleBlockId);
      if (!style) throw new Error("INVALID_SIMULATION_STATE");
      for (const array of [style.red, style.green, style.blue, style.alpha, style.pointSize]) {
        bytes.set(array, offset);
        offset += array.length;
      }
    }
    view.setUint32(offset, pairs.length, true);
    offset += 4;
    for (const key of pairs) offset = this.writeText(bytes, view, offset, key);
    view.setUint32(offset, episodes.length, true);
    offset += 4;
    for (const [id, effect] of episodes) {
      offset = this.writeText(bytes, view, offset, id);
      view.setFloat64(offset, effect.target, true);
      view.setFloat64(offset + 8, effect.afterglowRemaining, true);
      offset += 16;
    }
    view.setUint32(offset, mergerEffects.length, true);
    offset += 4;
    for (const [id, effect] of mergerEffects) {
      offset = this.writeText(bytes, view, offset, id);
      view.setFloat64(offset, effect.target, true);
      view.setFloat64(offset + 8, effect.remaining, true);
      offset += 16;
    }
    view.setFloat64(offset, this.stepAccumulator, true);
    return bytes;
  }

  private writeText(bytes: Uint8Array, view: DataView, offset: number, value: string) {
    const encoded = new TextEncoder().encode(value);
    view.setUint32(offset, encoded.length, true);
    bytes.set(encoded, offset + 4);
    return offset + 4 + encoded.length;
  }
}
