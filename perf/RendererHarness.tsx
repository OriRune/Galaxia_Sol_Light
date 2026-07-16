import { useEffect, useRef, useState } from "react";
import { runRendererProxy, type RendererProxyResult } from "./renderer-proxy";
import { runProductionHigh, type ProductionFixture } from "./production-high";

interface DisplayResult {
  averageFps: number;
}

export function RendererHarness() {
  const parameters = new URLSearchParams(location.search);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [driver, setDriver] = useState(parameters.get("driver") ?? "");
  const count = Number(parameters.get("particles") ?? 60_000);
  const warmupMs = Number(parameters.get("warmupMs") ?? 5_000);
  const measurementMs = Number(parameters.get("measurementMs") ?? 60_000);
  const runs = Number(parameters.get("runs") ?? 1);
  const autorun = parameters.get("autorun") === "1";
  const production = parameters.get("production") === "1";
  const fixture = (parameters.get("fixture") ?? "high") as ProductionFixture;
  const started = useRef(false);

  const run = async () => {
    if (!driver.trim()) return;
    setRunning(true);
    const host = document.getElementById("benchmark-surface");
    if (!host) throw new Error("Benchmark surface is missing.");
    const surface = host.getBoundingClientRect();
    const results: (RendererProxyResult | Awaited<ReturnType<typeof runProductionHigh>>)[] = [];
    for (let index = 0; index < runs; index += 1) {
      results.push(
        production
          ? await runProductionHigh(host, warmupMs, measurementMs, fixture)
          : await runRendererProxy(host, count, warmupMs, measurementMs),
      );
    }
    const next = results.at(-1);
    if (!next) throw new Error("Benchmark produced no result.");
    const envelope = {
      recordedAt: new Date().toISOString(),
      pageUrl: location.href,
      appVersion: __APP_VERSION__,
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      surface: { width: surface.width, height: surface.height },
      graphicsDriverVersion: driver.trim(),
      qualifyingSurface: surface.width === 1920 && surface.height === 1080,
      results,
    };
    setResult(next);
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(
      new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" }),
    );
    anchor.download = `${production ? `production-${fixture}` : "renderer-proxy"}-${String(count)}-${String(Date.now())}.json`;
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(anchor.href);
    }, 0);
    setRunning(false);
  };

  useEffect(() => {
    if (autorun && driver.trim() && !started.current) {
      started.current = true;
      void run().catch((reason: unknown) => {
        setRunning(false);
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    }
  });

  return (
    <main className="benchmark-shell">
      <div id="benchmark-surface" />
      <section className="benchmark-controls">
        <label>
          Graphics driver version{" "}
          <input
            value={driver}
            onChange={(event) => {
              setDriver(event.target.value);
            }}
          />
        </label>
        <button
          disabled={running || !driver.trim()}
          onClick={() => {
            void run();
          }}
        >
          Run all
        </button>
        <output data-result={result ? JSON.stringify(result) : undefined}>
          {error ??
            (running ? "Running" : result ? `${result.averageFps.toFixed(1)} FPS` : "Ready")}
        </output>
      </section>
    </main>
  );
}
