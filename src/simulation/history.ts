/* eslint-disable @typescript-eslint/no-non-null-assertion -- Timeline invariants keep referenced slots present. */
import type { EngineSetup, GalaxyGenerationConfig, GalaxyRecord, Vec2 } from "../domain/types";
import { Engine, type EngineCheckpoint } from "./engine";
export interface HistoryMarker {
  markerId: number;
  activeWallTick: number;
  stepIndex: number;
  modelRevision: number;
  eventOrdinal: number;
  keyframeId: number;
  commandLogOffset: number;
  effectTimerResiduals: { encounter: number; merger: number };
  stepAccumulator: number;
  exactDigest?: string;
  special: boolean;
}
export interface HistoryKeyframe {
  keyframeId: number;
  activeWallTick: number;
  eventOrdinal: number;
  modelRevision: number;
  commandLogOffset: number;
  checkpoint: EngineCheckpoint;
  earlyTopology: boolean;
}
export type HistoryLogRecord =
  | {
      eventOrdinal: number;
      stepIndex: number;
      activeWallTick: number;
      recordKind: "command";
      commandType: string;
      payload: unknown;
      resultingModelRevision: number;
    }
  | {
      eventOrdinal: number;
      stepIndex: number;
      activeWallTick: number;
      recordKind: "mergerExpectation";
      inputIds: string[][];
      outputConfigHashes: string[];
      resultingModelRevision: number;
      verified: boolean;
    };
export class HistoryTimeline {
  private markers: HistoryMarker[] = [];
  private keyframes: HistoryKeyframe[] = [];
  private log: HistoryLogRecord[] = [];
  private markerCounter = 0;
  private keyframeCounter = 0;
  private eventOrdinal = 0;
  private activeWallMs = 0;
  private activeWallTick = 0;
  private earlyIntervals = new Set<number>();
  private intervalCache = new Map<number, EngineCheckpoint>();
  private reconstructionToken = 0;
  private presentPin: EngineCheckpoint | null = null;
  private historyMarkerId: number | null = null;
  constructor(
    private readonly engine: Engine,
    initialRevision: number,
  ) {
    this.captureKeyframe(initialRevision, false);
  }
  getMarkers(): readonly HistoryMarker[] {
    return this.markers;
  }
  getKeyframes(): readonly HistoryKeyframe[] {
    return this.keyframes;
  }
  getLog(): readonly HistoryLogRecord[] {
    return this.log;
  }
  cacheMarkerState(markerId: number, state: EngineCheckpoint): void {
    this.intervalCache.delete(markerId);
    this.intervalCache.set(markerId, state);
    if (this.intervalCache.size > 10) {
      const oldest = this.intervalCache.keys().next().value;
      if (oldest !== undefined) this.intervalCache.delete(oldest);
    }
  }
  getCachedMarkerState(markerId: number): EngineCheckpoint | null {
    const state = this.intervalCache.get(markerId);
    if (!state) return null;
    this.intervalCache.delete(markerId);
    this.intervalCache.set(markerId, state);
    return state;
  }
  get intervalCacheSize(): number {
    return this.intervalCache.size;
  }
  get inHistory(): boolean {
    return this.historyMarkerId !== null;
  }
  actionAvailability() {
    return {
      selection: true,
      camera: true,
      scrub: true,
      exit: true,
      resume: true,
      edit: !this.inHistory,
      addDelete: !this.inHistory,
      globals: !this.inHistory,
      presets: !this.inHistory,
      mode: !this.inHistory,
      sceneLoad: !this.inHistory,
      undo: !this.inHistory,
      recording: !this.inHistory,
    };
  }
  async enterHistory(markerId: number, progress?: () => void): Promise<EngineCheckpoint | null> {
    this.presentPin ??= this.engine.createCheckpoint();
    this.engine.playing = false;
    const state = await this.reconstruct(markerId, progress);
    if (state) {
      this.engine.restoreCheckpoint(state);
      this.historyMarkerId = markerId;
    }
    return state;
  }
  async scrubToMarker(markerId: number, progress?: () => void): Promise<EngineCheckpoint | null> {
    if (!this.inHistory) throw new Error("HISTORY_LOG_CORRUPT");
    const state = await this.reconstruct(markerId, progress);
    if (state) {
      this.engine.restoreCheckpoint(state);
      this.historyMarkerId = markerId;
    }
    return state;
  }
  exitToPresent(): boolean {
    if (!this.presentPin) return false;
    this.engine.restoreCheckpoint(this.presentPin);
    this.presentPin = null;
    this.historyMarkerId = null;
    this.engine.playing = false;
    return true;
  }
  resumeFromMarker(markerId: number): boolean {
    const cached = this.getCachedMarkerState(markerId);
    if (!cached) return false;
    this.engine.restoreCheckpoint(cached);
    this.engine.playing = true;
    const markerIndex = this.markers.findIndex((marker) => marker.markerId === markerId);
    if (markerIndex < 0) return false;
    const marker = this.markers[markerIndex]!;
    this.markers.splice(markerIndex + 1);
    this.log = this.log.filter((record) => record.eventOrdinal <= marker.eventOrdinal);
    this.keyframes = this.keyframes.filter(
      (frame) =>
        frame.eventOrdinal <= marker.eventOrdinal || frame.keyframeId === marker.keyframeId,
    );
    this.intervalCache.clear();
    this.presentPin = null;
    this.historyMarkerId = null;
    return true;
  }
  cancelReconstruction(): void {
    this.reconstructionToken += 1;
  }
  async reconstruct(markerId: number, progress?: () => void): Promise<EngineCheckpoint | null> {
    const token = ++this.reconstructionToken,
      cached = this.getCachedMarkerState(markerId);
    if (cached) return cached;
    const marker = this.markers.find((candidate) => candidate.markerId === markerId);
    if (!marker) throw new Error("HISTORY_LOG_CORRUPT");
    const keyframe = this.keyframes.find((candidate) => candidate.keyframeId === marker.keyframeId);
    if (!keyframe) throw new Error("HISTORY_LOG_CORRUPT");
    const replay = new Engine(
      {
        galaxies: [],
        gravity: keyframe.checkpoint.gravity,
        playbackSpeed: keyframe.checkpoint.playbackSpeed,
      },
      false,
    );
    replay.restoreCheckpoint(keyframe.checkpoint);
    let logIndex = keyframe.commandLogOffset;
    const timer = setTimeout(() => {
      progress?.();
    }, 250);
    try {
      while (replay.stepIndex < marker.stepIndex) {
        while (logIndex < this.log.length) {
          const record = this.log[logIndex]!;
          if (
            record.eventOrdinal > marker.eventOrdinal ||
            record.stepIndex !== replay.stepIndex ||
            record.recordKind === "mergerExpectation"
          )
            break;
          this.applyCommand(replay, record);
          logIndex += 1;
        }
        const expectation = this.log
          .slice(logIndex)
          .find(
            (record): record is Extract<HistoryLogRecord, { recordKind: "mergerExpectation" }> =>
              record.recordKind === "mergerExpectation" &&
              record.stepIndex === replay.stepIndex &&
              record.eventOrdinal <= marker.eventOrdinal,
          );
        const activeSeconds = 1 / (60 * replay.playbackSpeed);
        if (!replay.step(activeSeconds)) throw new Error("HISTORY_LOG_CORRUPT");
        const mappings = replay.consumeMergerMappings();
        if (expectation) {
          const hashes = mappings.map((mapping) =>
            JSON.stringify(
              replay.topology.descriptors.find((descriptor) => descriptor.id === mapping.remnantId)
                ?.generation ?? null,
            ),
          );
          this.verifyMergerExpectation(
            { ...expectation, verified: false },
            mappings.map((mapping) => mapping.inputIds),
            hashes,
          );
          const position = this.log.indexOf(expectation);
          if (position >= logIndex) logIndex = position + 1;
        } else if (mappings.length > 0) throw new Error("HISTORY_LOG_CORRUPT");
      }
      while (logIndex < this.log.length) {
        const record = this.log[logIndex]!;
        if (record.eventOrdinal > marker.eventOrdinal) break;
        if (record.recordKind === "command" && record.stepIndex === replay.stepIndex)
          this.applyCommand(replay, record);
        logIndex += 1;
      }
      replay.stepAccumulator = marker.stepAccumulator;
      const checkpoint = replay.createCheckpoint();
      if (marker.exactDigest) {
        const reconstructedDigest = await replay.stateDigest();
        if (reconstructedDigest !== marker.exactDigest) throw new Error("HISTORY_LOG_CORRUPT");
      }
      if (token !== this.reconstructionToken) return null;
      this.cacheMarkerState(markerId, checkpoint);
      return checkpoint;
    } finally {
      clearTimeout(timer);
    }
  }
  private applyCommand(
    engine: Engine,
    record: Extract<HistoryLogRecord, { recordKind: "command" }>,
  ): void {
    switch (record.commandType) {
      case "SET_GRAVITY": {
        const payload = record.payload as { gravity: number };
        engine.gravity = payload.gravity;
        break;
      }
      case "SET_PLAYBACK_SPEED": {
        const payload = record.payload as { playbackSpeed: 0.25 | 0.5 | 1 | 2 | 4 };
        engine.playbackSpeed = payload.playbackSpeed;
        break;
      }
      case "ADD_GALAXY": {
        const payload = record.payload as { galaxy: GalaxyRecord };
        engine.addGalaxy(payload.galaxy);
        break;
      }
      case "DELETE_GALAXY": {
        const payload = record.payload as { galaxyId: string };
        engine.deleteGalaxy(payload.galaxyId);
        break;
      }
      case "PATCH_GALAXY": {
        const payload = record.payload as {
          galaxyId: string;
          generation: GalaxyGenerationConfig;
          name: string | null;
        };
        engine.patchGalaxy(payload.galaxyId, payload.generation, payload.name);
        break;
      }
      case "MOVE_GALAXY": {
        const payload = record.payload as { galaxyId: string; position: Vec2 };
        engine.moveGalaxy(payload.galaxyId, payload.position.x, payload.position.y);
        break;
      }
      case "SET_BULK_VELOCITY": {
        const payload = record.payload as { galaxyId: string; bulkVelocity: Vec2 };
        engine.setBulkVelocity(payload.galaxyId, payload.bulkVelocity.x, payload.bulkVelocity.y);
        break;
      }
      case "LOAD_SETUP": {
        const payload = record.payload as { setup: EngineSetup; postLoadPlaying: boolean };
        engine.loadSetup(payload.setup, payload.postLoadPlaying);
        break;
      }
      case "REGENERATE_SCENE":
        engine.regenerateScene();
        break;
      default:
        throw new Error("HISTORY_LOG_CORRUPT");
    }
  }
  advanceActiveWall(
    deltaMs: number,
    visible: boolean,
    playing: boolean,
    modelRevision: number,
  ): void {
    if (!visible || !playing || deltaMs <= 0) return;
    const target = this.activeWallMs + deltaMs;
    while ((this.activeWallTick + 1) * 100 <= target + Number.EPSILON) {
      this.activeWallTick += 1;
      this.activeWallMs = this.activeWallTick * 100;
      this.createRegularMarker(modelRevision);
    }
    this.activeWallMs = target;
  }
  singleStepMarker(modelRevision: number): HistoryMarker {
    return this.createMarker(modelRevision, true);
  }
  logCommand(
    commandType: string,
    payload: unknown,
    resultingModelRevision: number,
    topologyChanging = false,
  ): HistoryLogRecord {
    this.eventOrdinal += 1;
    const record: HistoryLogRecord = {
      eventOrdinal: this.eventOrdinal,
      stepIndex: this.engine.stepIndex,
      activeWallTick: this.activeWallTick,
      recordKind: "command",
      commandType,
      payload: structuredClone(payload),
      resultingModelRevision,
    };
    this.log.push(record);
    if (topologyChanging) {
      const interval = Math.floor(this.activeWallTick / 10);
      if (!this.earlyIntervals.has(interval)) {
        this.earlyIntervals.add(interval);
        this.captureKeyframe(resultingModelRevision, true);
      }
    }
    return record;
  }
  logMergerExpectation(
    inputIds: string[][],
    outputConfigHashes: string[],
    resultingModelRevision: number,
  ): HistoryLogRecord {
    this.eventOrdinal += 1;
    const record: HistoryLogRecord = {
      eventOrdinal: this.eventOrdinal,
      stepIndex: Math.max(0, this.engine.stepIndex - 1),
      activeWallTick: this.activeWallTick,
      recordKind: "mergerExpectation",
      inputIds: inputIds.map((ids) => [...ids]),
      outputConfigHashes: [...outputConfigHashes],
      resultingModelRevision,
      verified: false,
    };
    this.log.push(record);
    return record;
  }
  verifyMergerExpectation(
    record: HistoryLogRecord,
    actualInputIds: string[][],
    actualHashes: string[],
  ): void {
    if (record.recordKind !== "mergerExpectation" || record.verified)
      throw new Error("HISTORY_LOG_CORRUPT");
    if (
      JSON.stringify(record.inputIds) !== JSON.stringify(actualInputIds) ||
      JSON.stringify(record.outputConfigHashes) !== JSON.stringify(actualHashes)
    )
      throw new Error("HISTORY_LOG_CORRUPT");
    record.verified = true;
  }
  get currentMarkerId(): number | null {
    return this.historyMarkerId;
  }
  private createRegularMarker(modelRevision: number): void {
    const interval = Math.floor((this.activeWallTick - 1) / 10);
    if (this.activeWallTick % 10 === 0 && !this.earlyIntervals.has(interval))
      this.captureKeyframe(modelRevision, false);
    this.createMarker(modelRevision, false);
  }
  private createMarker(modelRevision: number, special: boolean): HistoryMarker {
    this.eventOrdinal += 1;
    this.markerCounter += 1;
    const keyframe = this.keyframes.at(-1)!;
    const effects = this.engine.effectState(),
      marker: HistoryMarker = {
        markerId: this.markerCounter,
        activeWallTick: this.activeWallTick,
        stepIndex: this.engine.stepIndex,
        modelRevision,
        eventOrdinal: this.eventOrdinal,
        keyframeId: keyframe.keyframeId,
        commandLogOffset: this.log.length,
        effectTimerResiduals: {
          encounter: [...effects.encounterEpisodes.values()].reduce(
            (sum, effect) => sum + effect.afterglowRemaining,
            0,
          ),
          merger: [...effects.mergerEffects.values()].reduce(
            (sum, effect) => sum + effect.remaining,
            0,
          ),
        },
        stepAccumulator: this.engine.stepAccumulator,
        special,
      };
    this.markers.push(marker);
    void this.engine.stateDigest().then((digest) => {
      if (this.markers.includes(marker)) marker.exactDigest = digest;
    });
    if (this.markers.length > 300) this.markers.splice(0, this.markers.length - 300);
    this.prune();
    return marker;
  }
  private captureKeyframe(modelRevision: number, earlyTopology: boolean): void {
    this.keyframeCounter += 1;
    const frame: HistoryKeyframe = {
      keyframeId: this.keyframeCounter,
      activeWallTick: this.activeWallTick,
      eventOrdinal: this.eventOrdinal,
      modelRevision,
      commandLogOffset: this.log.length,
      checkpoint: this.engine.createCheckpoint(),
      earlyTopology,
    };
    this.keyframes.push(frame);
    if (this.keyframes.length > 32) this.keyframes.splice(0, this.keyframes.length - 32);
  }
  private prune(): void {
    const earliest = this.markers[0]!;
    const requiredIndex = this.keyframes.findIndex(
      (frame) => frame.keyframeId === earliest.keyframeId,
    );
    if (requiredIndex > 1) this.keyframes.splice(0, requiredIndex - 1);
    const logOffset = this.keyframes[0]!.commandLogOffset;
    if (logOffset > 0) {
      this.log.splice(0, logOffset);
      for (const frame of this.keyframes) frame.commandLogOffset -= logOffset;
      for (const marker of this.markers)
        marker.commandLogOffset = Math.max(0, marker.commandLogOffset - logOffset);
    }
  }
}
