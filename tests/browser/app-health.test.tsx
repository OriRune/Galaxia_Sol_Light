import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";

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
});
