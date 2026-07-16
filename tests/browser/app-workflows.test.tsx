import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
    timeout: 10_000,
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
    change("Type", "elliptical");
    await mutationsReady();
    expect(screen.getByLabelText("Arm count")).toBeDisabled();
    change("Type", "barredSpiral");
    await mutationsReady();
    change("Arm count", "4");
    await mutationsReady();
    change("Name", "");
    await mutationsReady();
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

    change("Recording seconds", "10");
    fireEvent.click(screen.getByRole("button", { name: "Record", exact: true }));
    const stop = await screen.findByRole("button", { name: "Stop recording" }, { timeout: 10_000 });
    await screen.findByText(/Recording: [1-9]\d* captured/, {}, { timeout: 10_000 });
    fireEvent.click(stop);
    await screen.findByText(/Recording saved:/, {}, { timeout: 10_000 });
    fireEvent.click(screen.getByRole("tab", { name: "Recordings" }));
    const recordings = screen.getByRole("list", { name: "Saved recordings" });
    fireEvent.click(await within(recordings).findByRole("button", {}, { timeout: 10_000 }));
    expect(await screen.findByRole("region", { name: "Recording detail" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Export recording part 1" })).toBeEnabled();
  }, 30_000);

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
    fireEvent.click(await within(presets).findByRole("button", { name: "Load preset" }));
    expect(within(presets).getByRole("button", { name: "Export preset" })).toBeEnabled();
    expect(within(presets).getByRole("button", { name: "Rename preset" })).toBeEnabled();
    expect(within(presets).getByRole("button", { name: "Delete preset" })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole("img")).toHaveAccessibleName(/2 galaxies/));

    await mutationsReady();
    fireEvent.click(screen.getByRole("tab", { name: "Scenes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save scene" }));
    const scenes = await screen.findByRole("list", { name: "Saved scenes" });
    fireEvent.click(await within(scenes).findByRole("button", { name: /Load scene/ }));
    expect(within(scenes).getByRole("button", { name: "Export scene" })).toBeEnabled();
    expect(within(scenes).getByRole("button", { name: "Rename scene" })).toBeEnabled();
    expect(within(scenes).getByRole("button", { name: "Delete scene" })).toBeEnabled();
    await waitFor(() => expect(screen.getByLabelText("Gravity")).toHaveValue("2"));

    const invalid = new File(["not a scene"], "invalid.galaxia", {
      type: "application/octet-stream",
    });
    fireEvent.change(screen.getByLabelText("Import scene"), { target: { files: [invalid] } });
    await screen.findByText(/INVALID_IMPORT/);

    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("dialog", { name: "Interaction help" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close help" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset camera" }));
    fireEvent.click(screen.getByRole("button", { name: "Play/Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    fireEvent.click(screen.getByRole("button", { name: "Play/Pause" }));
  }, 30_000);
});

afterEach(() => {
  document.body.replaceChildren();
});
