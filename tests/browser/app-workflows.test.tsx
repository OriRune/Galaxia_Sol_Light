import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app/App";

async function ready() {
  await screen.findByText("Simulation: ready", {}, { timeout: 10_000 });
  await screen.findByText("Renderer: ready", {}, { timeout: 10_000 });
}

function change(label: string, value: string) {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

async function mutationsReady() {
  await waitFor(() => expect(screen.getByRole("tab", { name: "Builder" })).toBeEnabled(), {
    timeout: 30_000,
  });
}
async function modeReady(name: "Single" | "Collision" | "Builder" | "Random") {
  await waitFor(() =>
    expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true"),
  );
}

describe("application workflows", () => {
  it("covers random categories, draft boundaries, keyboard, capture, and recording controls", async () => {
    render(<App />);
    await ready();

    for (const [label, value] of [
      ["Seed", "-1"],
      ["Star count", "499"],
      ["Size", "101"],
      ["Mass", "0"],
      ["Spin", "3"],
      ["Arm count", "9"],
    ])
      change(label, value);
    expect(screen.getByLabelText("Seed")).toHaveValue("-1");
    expect(screen.getByLabelText("Seed")).toHaveAttribute("aria-invalid", "true");
    fireEvent.keyDown(screen.getByLabelText("Seed"), { key: "Escape" });
    expect(screen.getByLabelText("Seed")).toHaveValue("1");
    fireEvent.change(screen.getByLabelText("Seed"), { target: { value: "-0" } });
    fireEvent.keyDown(screen.getByLabelText("Seed"), { key: "Enter" });
    fireEvent.blur(screen.getByLabelText("Seed"));
    await mutationsReady();
    expect(screen.getByLabelText("Seed")).toHaveValue("0");
    change("Type", "elliptical");
    await mutationsReady();
    expect(screen.getByLabelText("Arm count")).toBeDisabled();
    change("Type", "barredSpiral");
    await mutationsReady();
    change("Arm count", "4");
    await mutationsReady();
    change("Name", "");
    await mutationsReady();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x".repeat(81) } });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });
    fireEvent.click(screen.getByLabelText("Central black hole"));
    await mutationsReady();

    const autoFrame = screen.getByLabelText("Auto-frame");
    fireEvent.click(autoFrame);
    expect(autoFrame).not.toBeChecked();
    fireEvent.keyDown(window, { key: "f" });
    expect(autoFrame).toBeChecked();
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "f" });
    expect(autoFrame).toBeChecked();
    fireEvent.keyDown(window, { key: " " });
    await screen.findByText(/Paused.*1 galaxies/);
    fireEvent.keyDown(window, { key: "." });
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("dialog", { name: "Interaction help" })).toBeVisible();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close help" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Interaction help" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Random" }));
    await modeReady("Random");
    change("Random category", "cluster");
    change("Scenario seed", "1234");
    change("Random category", "collision");
    change("Random category", "single");
    fireEvent.click(screen.getByRole("button", { name: "Generate scenario" }));
    await waitFor(() => expect(screen.getByRole("img")).toHaveAccessibleName(/random mode/));
    await mutationsReady();

    fireEvent.click(screen.getByRole("tab", { name: "Single" }));
    await modeReady("Single");
    fireEvent.click(screen.getByRole("button", { name: "Screenshot" }));
    await screen.findByText("Screenshot saved.", {}, { timeout: 10_000 });
    fireEvent.click(screen.getByRole("tab", { name: "Captures" }));
    expect(
      within(screen.getByRole("list", { name: "Saved captures" })).getAllByRole("listitem"),
    ).toHaveLength(1);
    fireEvent.click(
      within(screen.getByRole("list", { name: "Saved captures" })).getByRole("button", {
        name: /^Capture /,
      }),
    );
    expect(await screen.findByRole("region", { name: "Capture detail" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Download capture" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Download capture" }));
    await screen.findByText(/Downloaded .*\.png\./);
    vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    fireEvent.click(
      within(screen.getByRole("list", { name: "Saved captures" })).getByRole("button", {
        name: "Rename capture",
      }),
    );
    vi.spyOn(window, "prompt").mockReturnValueOnce("Renamed capture");
    fireEvent.click(
      within(screen.getByRole("list", { name: "Saved captures" })).getByRole("button", {
        name: "Rename capture",
      }),
    );
    await screen.findByText("Capture renamed to Renamed capture.");

    change("Recording seconds", "10");
    fireEvent.click(screen.getByRole("button", { name: "Record", exact: true }));
    const stop = await screen.findByRole("button", { name: "Stop recording" }, { timeout: 10_000 });
    await screen.findByText(/Recording: [1-9]\d* captured/, {}, { timeout: 10_000 });
    fireEvent.click(stop);
    await screen.findByText(/Recording saved:/, {}, { timeout: 30_000 });
    fireEvent.click(screen.getByRole("tab", { name: "Recordings" }));
    const recordings = screen.getByRole("list", { name: "Saved recordings" });
    fireEvent.click(await within(recordings).findByRole("button", {}, { timeout: 10_000 }));
    expect(await screen.findByRole("region", { name: "Recording detail" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Export recording part 1" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous frame" }));
    fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
    fireEvent.click(screen.getByRole("button", { name: "Export recording part 1" }));
    await screen.findByText("Recording part 1 downloaded.", {}, { timeout: 10_000 });
    vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "Rename recording" }));
    vi.spyOn(window, "prompt").mockReturnValueOnce("Renamed recording");
    fireEvent.click(screen.getByRole("button", { name: "Rename recording" }));
    await screen.findByText("Recording renamed to Renamed recording.");
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete recording" }));
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete recording" }));
    await screen.findByText("Recording deleted.");
  }, 60_000);

  it("commits editing, topology, global, persistence, undo, and dialog workflows", async () => {
    render(<App />);
    await ready();

    change("Star count", "500");
    await mutationsReady();
    change("Seed", "42");
    await mutationsReady();
    change("Size", "55");
    await mutationsReady();
    change("Mass", "30");
    await mutationsReady();
    change("Name", "Coverage galaxy");
    await mutationsReady();
    await waitFor(() => expect(screen.getByRole("img")).toHaveAccessibleName(/500 stars/));

    fireEvent.click(screen.getByRole("button", { name: "Play/Pause" }));
    await screen.findByText(/Paused.*1 galaxies/);
    fireEvent.click(screen.getByRole("tab", { name: "Collision" }));
    await modeReady("Collision");
    fireEvent.click(screen.getByRole("button", { name: "Add galaxy" }));
    await waitFor(() => expect(screen.getByRole("img")).toHaveAccessibleName(/2 galaxies/));
    await mutationsReady();
    fireEvent.click(screen.getByRole("tab", { name: "Builder" }));
    await modeReady("Builder");
    const galaxies = screen.getByRole("list", { name: "Scene galaxies" });
    const firstGalaxy = within(galaxies).getAllByRole("button").at(0);
    expect(firstGalaxy).toBeDefined();
    if (!firstGalaxy) return;
    fireEvent.click(firstGalaxy);
    change("Position X", "12");
    await mutationsReady();
    change("Position Y", "-8");
    await mutationsReady();
    change("Velocity X", "1.5");
    await mutationsReady();
    change("Velocity Y", "-1.5");
    await mutationsReady();
    change("Name", "Builder draft");
    await mutationsReady();
    fireEvent.click(screen.getByRole("button", { name: "Apply to selected" }));
    await mutationsReady();
    fireEvent.click(screen.getByRole("button", { name: "Reset draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected galaxy" }));
    await waitFor(() => expect(screen.getByRole("img")).toHaveAccessibleName(/1 galaxies/));

    await mutationsReady();

    change("Gravity", "2");
    await mutationsReady();
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "0.5" } });
    await mutationsReady();
    fireEvent.change(screen.getByLabelText("Performance"), { target: { value: "low" } });
    await mutationsReady();
    fireEvent.click(screen.getByLabelText("Trails"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await mutationsReady();
    const remainingGalaxy = within(screen.getByRole("list", { name: "Scene galaxies" }))
      .getAllByRole("button")
      .at(0);
    expect(remainingGalaxy).toBeDefined();
    if (!remainingGalaxy) return;
    fireEvent.click(remainingGalaxy);

    fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
    fireEvent.click(screen.getByRole("tab", { name: "Presets" }));
    const presets = await screen.findByRole("list", { name: "Saved presets" });
    const builtIn = within(presets).getAllByRole("button", { name: "Load built-in preset" }).at(0);
    expect(builtIn).toBeDefined();
    if (!builtIn) return;
    fireEvent.click(builtIn);
    await mutationsReady();
    fireEvent.click(await within(presets).findByRole("button", { name: "Load preset" }));
    expect(within(presets).getByRole("button", { name: "Export preset" })).toBeEnabled();
    expect(within(presets).getByRole("button", { name: "Rename preset" })).toBeEnabled();
    expect(within(presets).getByRole("button", { name: "Delete preset" })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole("img")).toHaveAccessibleName(/3 galaxies/));
    fireEvent.click(within(presets).getByRole("button", { name: "Export preset" }));
    await screen.findByText(/Exported .*galaxia-preset\.json\./);
    vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    fireEvent.click(within(presets).getByRole("button", { name: "Rename preset" }));
    vi.spyOn(window, "prompt").mockReturnValueOnce("Renamed preset");
    fireEvent.click(within(presets).getByRole("button", { name: "Rename preset" }));
    await screen.findByText("Preset renamed to Renamed preset.");

    await mutationsReady();
    fireEvent.click(screen.getByRole("tab", { name: "Scenes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save scene" }));
    const scenes = await screen.findByRole("list", { name: "Saved scenes" });
    fireEvent.click(await within(scenes).findByRole("button", { name: /Load scene/ }));
    expect(within(scenes).getByRole("button", { name: "Export scene" })).toBeEnabled();
    expect(within(scenes).getByRole("button", { name: "Rename scene" })).toBeEnabled();
    expect(within(scenes).getByRole("button", { name: "Delete scene" })).toBeEnabled();
    await waitFor(() => expect(screen.getByLabelText("Gravity")).toHaveValue("2"));
    fireEvent.click(within(scenes).getByRole("button", { name: "Export scene" }));
    await screen.findByText(/Exported .*galaxia-scene\.json\./);
    vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    fireEvent.click(within(scenes).getByRole("button", { name: "Rename scene" }));
    vi.spyOn(window, "prompt").mockReturnValueOnce("Renamed scene");
    fireEvent.click(within(scenes).getByRole("button", { name: "Rename scene" }));
    await screen.findByText("Scene renamed to Renamed scene.");

    const invalid = new File(["not a scene"], "invalid.galaxia", {
      type: "application/octet-stream",
    });
    fireEvent.change(screen.getByLabelText("Import scene"), { target: { files: [invalid] } });
    await screen.findByText(/INVALID_IMPORT/);

    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(within(presets).getByRole("button", { name: "Delete preset" }));
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    fireEvent.click(within(presets).getByRole("button", { name: "Delete preset" }));
    await screen.findByText("Preset deleted.");
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(within(scenes).getByRole("button", { name: "Delete scene" }));
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    fireEvent.click(within(scenes).getByRole("button", { name: "Delete scene" }));
    await screen.findByText("Scene deleted.");

    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("dialog", { name: "Interaction help" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close help" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset camera" }));
    const viewport = screen.getByRole("img");
    const viewportRegion = viewport.parentElement;
    expect(viewportRegion).not.toBeNull();
    if (!viewportRegion) return;
    vi.spyOn(viewportRegion, "setPointerCapture").mockImplementation(() => undefined);
    vi.spyOn(viewportRegion, "releasePointerCapture").mockImplementation(() => undefined);
    fireEvent.wheel(viewportRegion, { deltaY: -1, clientX: 40, clientY: 40 });
    fireEvent.wheel(viewportRegion, { deltaY: 1, clientX: 40, clientY: 40 });
    fireEvent.pointerDown(viewportRegion, { pointerId: 7, button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(viewportRegion, { pointerId: 7, clientX: 20, clientY: 25 });
    fireEvent.pointerUp(viewportRegion, { pointerId: 7, clientX: 20, clientY: 25 });
    fireEvent.pointerDown(viewportRegion, { pointerId: 8, button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerCancel(viewportRegion, { pointerId: 8 });
    fireEvent.click(screen.getByRole("tab", { name: "Selection" }));
    const sceneList = screen.getByRole("list", { name: "Scene galaxies" });
    const selectable = within(sceneList).getAllByRole("button").at(0);
    expect(selectable).toBeDefined();
    if (!selectable) return;
    fireEvent.click(selectable);
    const coreRing = await waitFor(() => {
      const ring = document.querySelector<SVGCircleElement>(".selected-core-ring");
      expect(ring).not.toBeNull();
      return ring;
    });
    if (!coreRing) return;
    const coreX = Number(coreRing.getAttribute("cx")),
      coreY = Number(coreRing.getAttribute("cy"));
    fireEvent.pointerDown(viewportRegion, {
      pointerId: 9,
      button: 0,
      clientX: coreX,
      clientY: coreY,
    });
    fireEvent.pointerMove(viewportRegion, { pointerId: 9, clientX: coreX + 8, clientY: coreY + 6 });
    fireEvent.pointerUp(viewportRegion, { pointerId: 9, clientX: coreX + 8, clientY: coreY + 6 });
    const velocityHandle = document.querySelector<SVGCircleElement>(".velocity-handle");
    if (velocityHandle) {
      const velocityX = Number(velocityHandle.getAttribute("cx")),
        velocityY = Number(velocityHandle.getAttribute("cy"));
      fireEvent.pointerDown(viewportRegion, {
        pointerId: 10,
        button: 0,
        clientX: velocityX,
        clientY: velocityY,
      });
      fireEvent.pointerMove(viewportRegion, {
        pointerId: 10,
        clientX: velocityX + 5,
        clientY: velocityY + 5,
      });
      fireEvent.pointerUp(viewportRegion, {
        pointerId: 10,
        clientX: velocityX + 5,
        clientY: velocityY + 5,
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    fireEvent.click(screen.getByRole("button", { name: "Play/Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    fireEvent.click(screen.getByRole("button", { name: "Play/Pause" }));
  }, 60_000);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
