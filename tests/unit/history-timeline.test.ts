import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_SETUP, FIRST_LIGHT } from "../../src/domain/defaults";
import { Engine } from "../../src/simulation/engine";
import { HistoryTimeline } from "../../src/simulation/history";
const make = () => {
  const engine = new Engine(
    {
      ...DEFAULT_ENGINE_SETUP,
      galaxies: [{ ...FIRST_LIGHT, generation: { ...FIRST_LIGHT.generation, starCount: 500 } }],
    },
    true,
  );
  return { engine, history: new HistoryTimeline(engine, 1) };
};
describe("history markers, keyframes, and log", () => {
  it("creates ten regular markers per active second, none while hidden, and retains 300", () => {
    const { history } = make();
    history.advanceActiveWall(1000, true, true, 1);
    expect(history.getMarkers()).toHaveLength(10);
    history.advanceActiveWall(1000, false, true, 1);
    expect(history.getMarkers()).toHaveLength(10);
    history.advanceActiveWall(30000, true, true, 1);
    expect(history.getMarkers()).toHaveLength(300);
    expect(history.getMarkers()[0]?.activeWallTick).toBe(11);
  });
  it("creates a single-step marker without moving the regular boundary", () => {
    const { history } = make();
    history.advanceActiveWall(90, true, true, 1);
    const special = history.singleStepMarker(1);
    expect(special).toMatchObject({ activeWallTick: 0, special: true });
    history.advanceActiveWall(10, true, true, 1);
    expect(history.getMarkers().at(-1)).toMatchObject({ activeWallTick: 1, special: false });
  });
  it("orders two same-step commands on opposite sides of a marker exactly", () => {
    const { history } = make(),
      before = history.logCommand("SET_GRAVITY", { gravity: 2 }, 2);
    const marker = history.singleStepMarker(2),
      after = history.logCommand("SET_PLAYBACK_SPEED", { playbackSpeed: 2 }, 3);
    expect(before.eventOrdinal).toBeLessThan(marker.eventOrdinal);
    expect(marker.eventOrdinal).toBeLessThan(after.eventOrdinal);
    expect(before.stepIndex).toBe(after.stepIndex);
  });
  it("logs topology commands and verifies merger expectations exactly once", () => {
    const { history } = make();
    history.logCommand("ADD_GALAXY", { id: "g" }, 2, true);
    const merger = history.logMergerExpectation([["a", "b"]], ["hash"], 3);
    history.verifyMergerExpectation(merger, [["a", "b"]], ["hash"]);
    expect(() => {
      history.verifyMergerExpectation(merger, [["a", "b"]], ["hash"]);
    }).toThrow("HISTORY_LOG_CORRUPT");
    expect(history.getLog().map((record) => record.recordKind)).toEqual([
      "command",
      "mergerExpectation",
    ]);
  });
  it("keeps early-topology and scheduled keyframes bounded across the nineteen-marker gap", () => {
    const { engine, history } = make();
    history.advanceActiveWall(100, true, true, 1);
    history.logCommand("ADD_GALAXY", {}, 2, true);
    history.advanceActiveWall(1900, true, true, 2);
    expect(history.getMarkers()).toHaveLength(20);
    expect(history.getKeyframes().some((frame) => frame.earlyTopology)).toBe(true);
    expect(history.getKeyframes().length).toBeLessThanOrEqual(32);
    for (const marker of history.getMarkers())
      history.cacheMarkerState(marker.markerId, engine.createCheckpoint());
    expect(history.intervalCacheSize).toBe(10);
    expect(
      history.getCachedMarkerState(history.getMarkers().at(-1)?.markerId ?? -1),
    ).not.toBeNull();
    history.advanceActiveWall(30000, true, true, 2);
    expect(history.getKeyframes().length).toBeLessThanOrEqual(32);
  });
});

describe("history reconstruction and mode", () => {
  it("replays the complete closed command vocabulary", async () => {
    const { history } = make();
    const added = {
      ...FIRST_LIGHT,
      id: "added",
      generation: { ...FIRST_LIGHT.generation, seed: 2, starCount: 500 },
    };
    history.logCommand("SET_GRAVITY", { gravity: 2 }, 2);
    history.logCommand("SET_PLAYBACK_SPEED", { playbackSpeed: 2 }, 3);
    history.logCommand("ADD_GALAXY", { galaxy: added }, 4);
    history.logCommand(
      "PATCH_GALAXY",
      {
        galaxyId: FIRST_LIGHT.id,
        generation: { ...FIRST_LIGHT.generation, starCount: 500 },
        name: "Patched",
      },
      5,
    );
    history.logCommand("MOVE_GALAXY", { galaxyId: FIRST_LIGHT.id, position: { x: 3, y: 4 } }, 6);
    history.logCommand(
      "SET_BULK_VELOCITY",
      { galaxyId: FIRST_LIGHT.id, bulkVelocity: { x: 1, y: -1 } },
      7,
    );
    history.logCommand("DELETE_GALAXY", { galaxyId: "added" }, 8);
    history.logCommand("REGENERATE_SCENE", {}, 9);
    history.logCommand(
      "LOAD_SETUP",
      {
        setup: {
          ...DEFAULT_ENGINE_SETUP,
          galaxies: [{ ...FIRST_LIGHT, generation: { ...FIRST_LIGHT.generation, starCount: 500 } }],
        },
        postLoadPlaying: false,
      },
      10,
    );
    const marker = history.singleStepMarker(10);
    expect(await history.reconstruct(marker.markerId)).not.toBeNull();
  });

  it("rejects an unknown replay command", async () => {
    const { history } = make();
    history.logCommand("UNKNOWN", {}, 2);
    const marker = history.singleStepMarker(2);
    await expect(history.reconstruct(marker.markerId)).rejects.toThrow("HISTORY_LOG_CORRUPT");
  });

  it("reconstructs and verifies a recorded merger expectation", async () => {
    const left = {
        ...FIRST_LIGHT,
        id: "left",
        generation: { ...FIRST_LIGHT.generation, starCount: 500 },
        position: { x: -3, y: 0 },
        bulkVelocity: { x: 0, y: 0 },
      },
      right = {
        ...FIRST_LIGHT,
        id: "right",
        generation: { ...FIRST_LIGHT.generation, seed: 2, starCount: 500 },
        position: { x: 3, y: 0 },
        bulkVelocity: { x: 0, y: 0 },
      },
      engine = new Engine({ ...DEFAULT_ENGINE_SETUP, galaxies: [left, right] }, true),
      history = new HistoryTimeline(engine, 1);
    expect(engine.step(1 / 60)).toBe(true);
    const mappings = engine.consumeMergerMappings();
    const hashes = mappings.map((mapping) =>
      JSON.stringify(
        engine.topology.descriptors.find((descriptor) => descriptor.id === mapping.remnantId)
          ?.generation ?? null,
      ),
    );
    history.logMergerExpectation(
      mappings.map((mapping) => mapping.inputIds),
      hashes,
      2,
    );
    const marker = history.singleStepMarker(2);
    expect(await history.reconstruct(marker.markerId)).not.toBeNull();
  });

  it("rejects invalid navigation and expectation data", async () => {
    const { engine, history } = make();
    expect(history.exitToPresent()).toBe(false);
    expect(history.resumeFromMarker(404)).toBe(false);
    await expect(history.reconstruct(404)).rejects.toThrow("HISTORY_LOG_CORRUPT");
    history.cacheMarkerState(404, engine.createCheckpoint());
    expect(history.resumeFromMarker(404)).toBe(false);
    await expect(history.scrubToMarker(404)).rejects.toThrow("HISTORY_LOG_CORRUPT");
    const merger = history.logMergerExpectation([["a", "b"]], ["hash"], 2);
    expect(() => {
      history.verifyMergerExpectation(merger, [["a", "c"]], ["hash"]);
    }).toThrow("HISTORY_LOG_CORRUPT");
    expect(() => {
      history.verifyMergerExpectation(history.logCommand("SET_GRAVITY", { gravity: 2 }, 3), [], []);
    }).toThrow("HISTORY_LOG_CORRUPT");
  });

  it("scrubs between cached markers and ignores inactive wall time", async () => {
    const { engine, history } = make();
    history.advanceActiveWall(0, true, true, 1);
    history.advanceActiveWall(100, true, false, 1);
    engine.step(1 / 60);
    history.advanceActiveWall(100, true, true, 1);
    engine.step(1 / 60);
    history.advanceActiveWall(100, true, true, 1);
    const [first, second] = history.getMarkers();
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    await history.enterHistory(first.markerId);
    await history.enterHistory(first.markerId);
    expect(await history.scrubToMarker(second.markerId)).not.toBeNull();
    history.logCommand("ADD_GALAXY", {}, 2, true);
    history.logCommand("ADD_GALAXY", {}, 3, true);
  });

  it("reconstructs marker digests without changing the live state", async () => {
    const { engine, history } = make();
    for (let index = 0; index < 6; index += 1) {
      engine.step(1 / 60);
      history.advanceActiveWall(100, true, true, 1);
    }
    await Promise.resolve();
    const present = await engine.stateDigest();
    for (const marker of history.getMarkers()) {
      const state = await history.reconstruct(marker.markerId);
      expect(state).not.toBeNull();
    }
    expect(await engine.stateDigest()).toBe(present);
    expect(history.intervalCacheSize).toBeLessThanOrEqual(10);
  });

  it("pins and restores present, then truncates and plays on resume", async () => {
    const { engine, history } = make();
    engine.step(1 / 60);
    history.advanceActiveWall(100, true, true, 1);
    const marker = history.getMarkers()[0];
    expect(marker).toBeDefined();
    if (!marker) return;
    engine.step(1 / 60);
    const present = await engine.stateDigest();
    await history.enterHistory(marker.markerId);
    expect(history.inHistory).toBe(true);
    expect(engine.playing).toBe(false);
    expect(history.exitToPresent()).toBe(true);
    expect(await engine.stateDigest()).toBe(present);
    expect(engine.playing).toBe(false);
    await history.enterHistory(marker.markerId);
    expect(history.resumeFromMarker(marker.markerId)).toBe(true);
    expect(engine.playing).toBe(true);
    expect(history.getMarkers().at(-1)?.markerId).toBe(marker.markerId);
  });

  it("exposes the exact history-mode action policy and cancels obsolete work", async () => {
    const { engine, history } = make();
    engine.step(1 / 60);
    history.advanceActiveWall(100, true, true, 1);
    const marker = history.getMarkers()[0];
    expect(marker).toBeDefined();
    if (!marker) return;
    await history.enterHistory(marker.markerId);
    expect(history.actionAvailability()).toEqual({
      selection: true,
      camera: true,
      scrub: true,
      exit: true,
      resume: true,
      edit: false,
      addDelete: false,
      globals: false,
      presets: false,
      mode: false,
      sceneLoad: false,
      undo: false,
      recording: false,
    });
    history.cancelReconstruction();
    expect(history.currentMarkerId).toBe(marker.markerId);
  });
});
