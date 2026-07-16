import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { bootstrapDeterministicArtifacts } from "./app/bootstrap";
import "./app/styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Galaxia root element is missing.");
}

const performanceHarness =
  import.meta.env.VITE_TEST_HOOKS === "true" &&
  new URLSearchParams(location.search).get("harness") === "performance";

void bootstrapDeterministicArtifacts().then(async () => {
  if (performanceHarness) {
    const { RendererHarness } = await import("../perf/RendererHarness");
    createRoot(root).render(<RendererHarness />);
  } else {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
});
