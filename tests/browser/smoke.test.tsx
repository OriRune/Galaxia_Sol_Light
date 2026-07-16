import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";

describe("browser foundation", () => {
  it("renders the shell and reaches healthy services", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Galaxia" })).toBeInTheDocument();
    expect(
      await screen.findByText("Simulation: ready", {}, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Renderer: ready", {}, { timeout: 5_000 })).toBeInTheDocument();
  });
});

afterEach(() => {
  document.body.replaceChildren();
});
