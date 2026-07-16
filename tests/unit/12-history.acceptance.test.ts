import { expect, it } from "vitest";
import { DEFAULT_ENGINE_SETUP, FIRST_LIGHT } from "../../src/domain/defaults";
import { Engine } from "../../src/simulation/engine";
import { HistoryTimeline } from "../../src/simulation/history";

it("scenario 12 restores a marker exactly and branches from it", async () => {
  const engine = new Engine(
    {
      ...DEFAULT_ENGINE_SETUP,
      galaxies: [{ ...FIRST_LIGHT, generation: { ...FIRST_LIGHT.generation, starCount: 500 } }],
    },
    true,
  );
  const history = new HistoryTimeline(engine, 1);
  for (let step = 0; step < 6; step += 1) engine.step(1 / 60);
  history.advanceActiveWall(100, true, true, 1);
  await Promise.resolve();
  const marker = history.getMarkers()[0];
  expect(marker).toBeDefined();
  if (!marker) return;
  const markerDigest = await engine.stateDigest();
  engine.step(1 / 60);
  await history.enterHistory(marker.markerId);
  expect(await engine.stateDigest()).toBe(markerDigest);
  expect(history.resumeFromMarker(marker.markerId)).toBe(true);
  expect(engine.playing).toBe(true);
});
