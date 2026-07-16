import { describe, expect, it } from "vitest";
import { DEFAULT_DRAFT, FIRST_LIGHT } from "../../src/domain/defaults";
import {
  applyPresetPlan,
  captureCoherentScene,
  createPresetFile,
  createSceneFile,
  exportPortableFile,
  importPortableFile,
} from "../../src/persistence/portable";

const envelope = {
  id: "portable-1",
  name: "Portable",
  appVersion: "0.1.0",
  exportedAt: "2026-07-15T00:00:00.000Z",
};
describe("portable presets and scenes", () => {
  it("round trips the strict closed preset field set with trailing newline", async () => {
    const portable = createPresetFile(envelope, DEFAULT_DRAFT),
      blob = exportPortableFile(portable),
      text = await blob.text();
    expect(text.endsWith("\n")).toBe(true);
    expect(await importPortableFile(new File([text], "preset.json"))).toEqual(portable);
    await expect(
      importPortableFile(
        new File([text.replace('"payload": {', '"extra": 1, "payload": {')], "bad.json"),
      ),
    ).rejects.toThrow("INVALID_IMPORT");
    await expect(importPortableFile(new File(["{"], "malformed.json"))).rejects.toThrow(
      "INVALID_IMPORT",
    );
  });
  it("captures authoritative Worker setup plus only main-thread performance/trails", async () => {
    const setup = await captureCoherentScene(
      () => Promise.resolve({ galaxies: [FIRST_LIGHT], gravity: 2, playbackSpeed: 0.5 }),
      "high",
      true,
    );
    expect(setup).toEqual({
      galaxies: [FIRST_LIGHT],
      gravity: 2,
      playbackSpeed: 0.5,
      performanceLevel: "high",
      trails: true,
    });
    const scene = createSceneFile(envelope, setup);
    expect(await exportPortableFile(scene).text()).toContain('"kind": "galaxia-scene"');
  });
  it("applies multi-mode presets at viewport center without clearing", () => {
    const plan = applyPresetPlan(
      "builder",
      {
        galaxies: [FIRST_LIGHT],
        gravity: 1,
        playbackSpeed: 1,
        performanceLevel: "low",
        trails: false,
      },
      DEFAULT_DRAFT,
      { x: 17, y: -4 },
      "new",
    );
    expect(plan.command).toMatchObject({
      type: "ADD_GALAXY",
      payload: { galaxy: { position: { x: 17, y: -4 } } },
    });
    expect(plan.automaticFraming).toBe(false);
  });
  it("replaces the sole preset configuration and enables framing", () => {
    const plan = applyPresetPlan(
      "single",
      {
        galaxies: [FIRST_LIGHT],
        gravity: 1,
        playbackSpeed: 1,
        performanceLevel: "low",
        trails: false,
      },
      DEFAULT_DRAFT,
      { x: 99, y: 99 },
      "unused",
    );
    expect(plan.command.type).toBe("PATCH_GALAXY");
    expect(plan.automaticFraming).toBe(true);
  });
});
