import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import type { SimulationClientCallbacks } from "../../src/simulation/client";
import { PROTOCOL_VERSION, type AckEvent } from "../../src/simulation/protocol";
import { DEFAULT_GENERATION } from "../../src/domain/defaults";
import { useAppStore } from "../../src/app/store";

afterEach(() => {
  document.body.replaceChildren();
});

describe("health failures", () => {
  it.each([
    [new Error("Worker exploded"), new Error("WebGL exploded")],
    ["worker unknown", "renderer unknown"],
  ])("keeps the shell stable when services fail", async (workerError, rendererError) => {
    render(
      <App
        services={{
          createClient: () => ({
            initialize: async () => {
              await Promise.resolve();
              // Exercises the defensive unknown-rejection branch.
              // eslint-disable-next-line @typescript-eslint/only-throw-error
              throw workerError;
            },
            ping: () => Promise.resolve(1),
            dispose: vi.fn(() => Promise.resolve()),
          }),
          createViewport: () => ({
            mount: async () => {
              await Promise.resolve();
              // Exercises the defensive unknown-rejection branch.
              // eslint-disable-next-line @typescript-eslint/only-throw-error
              throw rendererError;
            },
            destroy: vi.fn(),
          }),
        }}
      />,
    );
    expect(await screen.findByText("Simulation: unavailable")).toBeInTheDocument();
    expect(await screen.findByText("Renderer: unavailable")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Galaxia" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /Worker exploded|WebGL exploded|Simulation Worker unavailable|WebGL unavailable/,
    );
  });

  it("offers explicit checkpoint recovery after a running worker becomes unavailable", async () => {
    let callbacks: SimulationClientCallbacks | undefined;
    const restore = vi.fn(() => Promise.resolve()),
      regenerate = vi.fn(() => Promise.resolve());
    render(
      <App
        services={{
          createClient: (nextCallbacks) => {
            callbacks = nextCallbacks;
            return {
              initialize: () => Promise.resolve({ result: "CHANGED" as const }),
              ping: () => Promise.resolve(1),
              dispose: () => Promise.resolve(),
              restoreLatestCheckpoint: restore,
              regenerateFromSetup: regenerate,
              setVisibility: vi.fn(),
            };
          },
          createViewport: () => ({
            mount: () => Promise.resolve(),
            destroy: vi.fn(),
            getCameraState: () => ({
              centerX: 0,
              centerY: 0,
              zoom: 5,
              cssWidth: 100,
              cssHeight: 100,
              devicePixelRatio: 1,
            }),
          }),
        }}
      />,
    );
    await screen.findByText("Simulation: ready");
    act(() => {
      useAppStore.setState({
        descriptors: [
          { id: "recovery", generation: { ...DEFAULT_GENERATION, starCount: 500 }, name: null },
        ],
      });
    });
    callbacks?.applyFrame?.(
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "FRAME",
        leaseId: 1,
        frameId: 1,
        modelRevision: 1,
        topologyEpoch: 1,
        stepIndex: 42,
        positions: new ArrayBuffer(0),
        cores: [
          {
            id: "recovery",
            sceneIndex: 0,
            x: 3,
            y: 4,
            vx: 1,
            vy: 2,
            coreRadius: 2,
            generationSize: 40,
            requestedPeakLinearY: 1,
          },
        ],
        bounds: [],
      },
      new Float32Array(),
    );
    callbacks?.workerUnavailable?.("heartbeat failed", { stepIndex: 42, ageMs: 1500 });
    expect(await screen.findByRole("alert")).toHaveTextContent("Checkpoint at step 42");
    fireEvent.click(screen.getByRole("button", { name: "Restore checkpoint" }));
    expect(await screen.findByText("Simulation: ready")).toBeInTheDocument();
    expect(restore).toHaveBeenCalledOnce();
    callbacks?.workerUnavailable?.("heartbeat failed again", { stepIndex: 43, ageMs: 2000 });
    fireEvent.click(
      await screen.findByRole("button", { name: "Regenerate from last compatible frame" }),
    );
    expect(await screen.findByText(/Scene regenerated/)).toBeInTheDocument();
    expect(regenerate).toHaveBeenCalledOnce();
  });

  it("enters, scrubs, exits, and resumes rewind history through worker acknowledgements", async () => {
    let callbacks: SimulationClientCallbacks | undefined;
    const acknowledgement: AckEvent = {
        protocolVersion: PROTOCOL_VERSION,
        type: "ACK",
        requestId: 1,
        modelRevision: 1,
        result: "CHANGED",
      },
      command = vi.fn(() => Promise.resolve(acknowledgement)),
      mutation = vi.fn(() => Promise.resolve(acknowledgement));
    render(
      <App
        services={{
          createClient: (nextCallbacks) => {
            callbacks = nextCallbacks;
            return {
              initialize: () => Promise.resolve(acknowledgement),
              ping: () => Promise.resolve(1),
              dispose: () => Promise.resolve(),
              command,
              mutation,
            };
          },
          createViewport: () => ({ mount: () => Promise.resolve(), destroy: vi.fn() }),
        }}
      />,
    );
    await screen.findByText("Simulation: ready");
    callbacks?.historyStatus?.({
      protocolVersion: PROTOCOL_VERSION,
      type: "HISTORY_STATUS",
      markerIds: [10, 20, 30],
      selectedMarkerId: null,
      reconstructing: false,
    });
    const position = await screen.findByLabelText("History position");
    fireEvent.change(position, { target: { value: "1" } });
    await screen.findByText("2 / 3");
    expect(command).toHaveBeenCalledWith("ENTER_HISTORY", expect.anything(), expect.anything());

    callbacks?.historyStatus?.({
      protocolVersion: PROTOCOL_VERSION,
      type: "HISTORY_STATUS",
      markerIds: [10, 20, 30],
      selectedMarkerId: 20,
      reconstructing: true,
    });
    expect(await screen.findByText("Reconstructing...")).toBeInTheDocument();
    callbacks?.historyStatus?.({
      protocolVersion: PROTOCOL_VERSION,
      type: "HISTORY_STATUS",
      markerIds: [10, 20, 30],
      selectedMarkerId: 20,
      reconstructing: false,
    });
    const resume = screen.getByRole("button", { name: "Resume here" });
    await vi.waitFor(() => expect(resume).toBeEnabled());
    fireEvent.click(resume);
    expect(mutation).toHaveBeenCalledWith("RESUME_FROM_MARKER", { markerId: "marker-20" });

    await vi.waitFor(() => {
      expect(mutation).toHaveBeenCalledOnce();
    });
    callbacks?.historyStatus?.({
      protocolVersion: PROTOCOL_VERSION,
      type: "HISTORY_STATUS",
      markerIds: [10],
      selectedMarkerId: 10,
      reconstructing: false,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Exit to present" }));
    expect(command).toHaveBeenCalledWith("EXIT_HISTORY_TO_PRESENT", {});
  });

  it("renders the alternate mode, selection, budget, playback, and recording states", async () => {
    const acknowledgement: AckEvent = {
      protocolVersion: PROTOCOL_VERSION,
      type: "ACK",
      requestId: 1,
      modelRevision: 1,
      result: "NO_CHANGE",
    };
    const command = vi.fn(() => Promise.resolve(acknowledgement)),
      mutation = vi.fn(() => Promise.resolve(acknowledgement)),
      setAutomaticFraming = vi.fn(),
      resetCamera = vi.fn(),
      setTrails = vi.fn();
    render(
      <App
        services={{
          createClient: () => ({
            initialize: () => Promise.resolve(acknowledgement),
            ping: () => Promise.resolve(1),
            dispose: () => Promise.resolve(),
            command,
            mutation,
            requestUndoSnapshot: () => Promise.resolve({ snapshotId: "ui-snapshot", stepIndex: 0 }),
            commitUiOnly: () => Promise.resolve(),
          }),
          createViewport: () => ({
            mount: () => Promise.resolve(),
            destroy: vi.fn(),
            setAutomaticFraming,
            resetCamera,
            setTrails,
          }),
        }}
      />,
    );
    await screen.findByText("Simulation: ready");
    act(() => {
      useAppStore.setState((state) => ({
        mode: "builder",
        panel: "inspect",
        performanceLevel: "low",
        recordingActive: true,
        historyMarkerIds: [],
        historyMarkerId: null,
        historyBusy: false,
        automaticFraming: false,
        trails: true,
        descriptors: [
          { id: "alternate", generation: { ...DEFAULT_GENERATION, starCount: 30_000 }, name: null },
        ],
        selectedGalaxyId: "alternate",
        draft: {
          generation: { ...DEFAULT_GENERATION, starCount: 30_000 },
          name: "Alternate",
        },
        status: { ...state.status, playing: false, galaxyCount: 1, starCount: 30_000 },
      }));
    });
    expect(await screen.findByText(/Scene exceeds the low automatic budget/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument();
    expect(screen.getByText("Galaxy selected.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "2" } });
    await vi.waitFor(() => expect(screen.getByLabelText("Performance")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Performance"), { target: { value: "high" } });
    await vi.waitFor(() => expect(screen.getByLabelText("Gravity")).toBeEnabled());
    fireEvent.click(screen.getByLabelText("Trails"));
    fireEvent.click(screen.getByLabelText("Auto-frame"));
    fireEvent.click(screen.getByRole("button", { name: "Reset camera" }));
    fireEvent.click(screen.getByRole("button", { name: "Play/Pause" }));
    await vi.waitFor(() => {
      expect(command).toHaveBeenCalled();
    });
    expect(setAutomaticFraming).toHaveBeenCalled();
    expect(resetCamera).toHaveBeenCalled();
    expect(setTrails).toHaveBeenCalled();

    act(() => {
      useAppStore.setState((state) => ({
        mode: "random",
        panel: "create",
        recordingActive: false,
        selectedGalaxyId: null,
        descriptors: [],
        randomCategory: "collision",
        status: { ...state.status, playing: true, galaxyCount: 0, starCount: 0 },
      }));
    });
    expect(await screen.findByLabelText("Random category")).toHaveValue("collision");
    expect(screen.getByText("Pick a galaxy to inspect it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record", exact: true })).toBeInTheDocument();
  });

  it("reports a rejected history reconstruction and clears its busy state", async () => {
    let callbacks: SimulationClientCallbacks | undefined;
    render(
      <App
        services={{
          createClient: (nextCallbacks) => {
            callbacks = nextCallbacks;
            return {
              initialize: () =>
                Promise.resolve({
                  protocolVersion: PROTOCOL_VERSION,
                  type: "ACK" as const,
                  requestId: 1,
                  modelRevision: 1,
                  result: "NO_CHANGE" as const,
                }),
              ping: () => Promise.resolve(1),
              dispose: () => Promise.resolve(),
              command: () => Promise.reject(new Error("History unavailable")),
            };
          },
          createViewport: () => ({ mount: () => Promise.resolve(), destroy: vi.fn() }),
        }}
      />,
    );
    await screen.findByText("Simulation: ready");
    callbacks?.historyStatus?.({
      protocolVersion: PROTOCOL_VERSION,
      type: "HISTORY_STATUS",
      markerIds: [1, 2],
      selectedMarkerId: null,
      reconstructing: false,
    });
    fireEvent.change(await screen.findByLabelText("History position"), {
      target: { value: "0" },
    });
    expect(await screen.findByText("History unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Reconstructing...")).not.toBeInTheDocument();
  });
});
