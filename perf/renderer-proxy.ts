import { Application, WebGLRenderer } from "pixi.js";
import { InstancedQuadRenderer } from "./instanced-quad-renderer";

export interface RendererProxyResult {
  particleCount: number;
  frames: number;
  averageFps: number;
  p95FrameIntervalMs: number;
  p95VisibleResponseMs: number;
  frameIntervalsMs: number[];
  visibleResponsesMs: number[];
  workerCopyMs: number[];
  particleUpdateMs: number[];
  renderMs: number[];
  pickingProbeMs: number[];
  trailSamples: TrailSample[];
  webgl: { vendor: string; renderer: string; version: string };
}

interface TrailSample {
  elapsedSeconds: number;
  activeTexels: number;
  medianY: number;
  p99Y: number;
  standardDeviationY: number;
}

const WIDTH = 1920;
const HEIGHT = 1080;
const GROUP_COUNT = 5;

function percentile(values: number[], quantile: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(quantile * sorted.length) - 1] ?? 0;
}

function texture() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D texture canvas unavailable.");
  const gradient = context.createRadialGradient(8, 8, 0, 8, 8, 7);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(2 / 7, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 16, 16);
  return canvas;
}

function trailStatistics(bytes: Uint8Array, elapsedSeconds: number): TrailSample {
  const luminance: number[] = [];
  let sum = 0;
  let sumSquares = 0;
  const texelCount = bytes.length / 4;
  for (let offset = 0; offset < bytes.length; offset += 4) {
    const red = (bytes[offset] ?? 0) / 255;
    const green = (bytes[offset + 1] ?? 0) / 255;
    const blue = (bytes[offset + 2] ?? 0) / 255;
    const alpha = (bytes[offset + 3] ?? 0) / 255;
    const y = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    sum += y;
    sumSquares += y * y;
    if (alpha >= 1 / 255) luminance.push(y);
  }
  const mean = sum / texelCount;
  return {
    elapsedSeconds,
    activeTexels: luminance.length,
    medianY: percentile(luminance, 0.5),
    p99Y: percentile(luminance, 0.99),
    standardDeviationY: Math.sqrt(Math.max(0, sumSquares / texelCount - mean * mean)),
  };
}

export async function runRendererProxy(
  host: HTMLElement,
  particleCount: number,
  warmupMs: number,
  measurementMs: number,
): Promise<RendererProxyResult> {
  const application = new Application();
  await application.init({
    preference: "webgl",
    width: WIDTH,
    height: HEIGHT,
    resolution: devicePixelRatio,
    autoDensity: true,
    background: 0x050814,
    antialias: false,
    autoStart: false,
  });
  if (!(application.renderer instanceof WebGLRenderer)) throw new Error("WebGL required.");
  host.replaceChildren(application.canvas);
  const starTexture = texture();
  const positions = new Float32Array(particleCount * 2);
  const copied = new Float32Array(positions.length);
  const localX = new Float32Array(particleCount);
  const localY = new Float32Array(particleCount);
  const styles = new Uint8Array((particleCount + GROUP_COUNT) * 4);
  const colors = [0x9bc5ff, 0xffc9a8, 0xffe5a0, 0xc6a6ff, 0xa8ffd8];
  for (let index = 0; index < particleCount; index += 1) {
    const group = Math.min(GROUP_COUNT - 1, Math.floor((index * GROUP_COUNT) / particleCount));
    let state = ((group + 1) * 0x9e3779b9 + index) >>> 0;
    const draw = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const radius = 10 + Math.sqrt(draw()) * 70;
    let phase = draw() * Math.PI * 2;
    let x = Math.cos(phase) * radius;
    let y = Math.sin(phase) * radius;
    if (group === 0) {
      phase += radius * 0.08 + (index % 2) * Math.PI;
      x = Math.cos(phase) * radius;
      y = Math.sin(phase) * radius;
    } else if (group === 1) {
      if (draw() < 0.35) {
        x = (draw() * 2 - 1) * 55;
        y = (draw() * 2 - 1) * 7;
      } else {
        phase += radius * 0.07 + (index % 2) * Math.PI;
        x = Math.cos(phase) * radius;
        y = Math.sin(phase) * radius;
      }
    } else if (group === 2) {
      y *= 0.62;
    } else if (group === 3) {
      const clump = index % 4;
      const clumpPhase = (clump / 4) * Math.PI * 2;
      x = Math.cos(clumpPhase) * 35 + (draw() * 2 - 1) * 24;
      y = Math.sin(clumpPhase) * 35 + (draw() * 2 - 1) * 24;
    } else {
      const concentrated = 8 + draw() ** 2 * 62;
      x = Math.cos(phase) * concentrated;
      y = Math.sin(phase) * concentrated;
    }
    localX[index] = x;
    localY[index] = y;
    const color = colors[group] ?? 0xffffff;
    styles[index * 4] = color >> 16;
    styles[index * 4 + 1] = (color >> 8) & 0xff;
    styles[index * 4 + 2] = color & 0xff;
    styles[index * 4 + 3] = 204;
  }
  for (let group = 0; group < GROUP_COUNT; group += 1) {
    const color = colors[group] ?? 0xffffff;
    const offset = (particleCount + group) * 4;
    styles[offset] = color >> 16;
    styles[offset + 1] = (color >> 8) & 0xff;
    styles[offset + 2] = color & 0xff;
    styles[offset + 3] = 217;
  }
  const gl = application.renderer.gl;
  if (!(gl instanceof WebGL2RenderingContext)) throw new Error("WebGL2 fallback required.");
  const renderer = new InstancedQuadRenderer(gl, particleCount, styles, starTexture, WIDTH, HEIGHT);
  const groupSize = particleCount / GROUP_COUNT;
  const centerXs = new Float32Array(GROUP_COUNT);
  const centerYs = new Float32Array(GROUP_COUNT);
  const rotationCosines = new Float32Array(GROUP_COUNT);
  const rotationSines = new Float32Array(GROUP_COUNT);
  const corePositions = new Float32Array(GROUP_COUNT * 2);

  const update = (elapsedMs: number) => {
    const seconds = elapsedMs / 1000;
    const cameraScale = 1 + Math.sin(seconds * 0.11) * 0.035;
    const cameraX = Math.sin(seconds * 0.17) * 8;
    const cameraY = Math.cos(seconds * 0.13) * 6;
    for (let group = 0; group < GROUP_COUNT; group += 1) {
      const fixtureAngle = (group / GROUP_COUNT) * Math.PI * 2;
      const centerX = WIDTH / 2 + Math.cos(fixtureAngle + seconds * 0.01) * 400;
      const centerY = HEIGHT / 2 + Math.sin(fixtureAngle + seconds * 0.01) * 400;
      const rotation = seconds * (0.16 + group * 0.01);
      centerXs[group] = centerX;
      centerYs[group] = centerY;
      rotationCosines[group] = Math.cos(rotation);
      rotationSines[group] = Math.sin(rotation);
      corePositions[group * 2] = centerX;
      corePositions[group * 2 + 1] = centerY;
    }
    for (let index = 0; index < particleCount; index += 1) {
      const group = Math.min(GROUP_COUNT - 1, Math.floor(index / groupSize));
      const centerX = centerXs[group] ?? 0;
      const centerY = centerYs[group] ?? 0;
      const cosine = rotationCosines[group] ?? 1;
      const sine = rotationSines[group] ?? 0;
      const baseX = localX[index] ?? 0;
      const baseY = localY[index] ?? 0;
      const x = centerX + baseX * cosine - baseY * sine;
      const y = centerY + baseX * sine + baseY * cosine;
      positions[index * 2] = x;
      positions[index * 2 + 1] = y;
    }
    return { scale: cameraScale, x: cameraX, y: cameraY };
  };

  let lastTimestamp = 0;
  let startTimestamp = 0;
  const frameIntervalsMs: number[] = [];
  const visibleResponsesMs: number[] = [];
  const workerCopyMs: number[] = [];
  const particleUpdateMs: number[] = [];
  const renderMs: number[] = [];
  const pickingProbeMs: number[] = [];
  const trailSamples: TrailSample[] = [];
  let sampledFiveSeconds = false;
  let sampledSixtySeconds = false;
  let nextInputAt = warmupMs + 2_000;
  let inputStarted = 0;
  let inputIndex = 0;
  let manualPan = 0;
  let manualZoom = 1;
  let paused = false;

  await new Promise<void>((resolve) => {
    const frame = (timestamp: number) => {
      if (startTimestamp === 0) {
        startTimestamp = timestamp;
        lastTimestamp = timestamp;
      }
      const elapsed = timestamp - startTimestamp;
      const measuring = elapsed >= warmupMs;
      const copyStart = performance.now();
      copied.set(positions);
      const copyEnd = performance.now();
      const camera = update(paused ? Math.max(0, elapsed - (timestamp - lastTimestamp)) : elapsed);
      camera.x += manualPan;
      camera.scale *= manualZoom;
      const updateEnd = performance.now();
      const renderStart = performance.now();
      renderer.uploadPositions(positions);
      renderer.uploadCorePositions(corePositions);
      renderer.render(camera, timestamp - lastTimestamp);
      const renderEnd = performance.now();
      if (measuring) {
        frameIntervalsMs.push(timestamp - lastTimestamp);
        workerCopyMs.push(copyEnd - copyStart);
        particleUpdateMs.push(updateEnd - copyEnd);
        renderMs.push(renderEnd - renderStart);
      }
      if (elapsed >= nextInputAt) {
        inputStarted = performance.now();
        const action = inputIndex % 4;
        if (action === 0) {
          paused = true;
          requestAnimationFrame(() => {
            paused = false;
          });
        } else if (action === 1) {
          manualPan = 20;
          requestAnimationFrame(() => {
            manualPan = 0;
          });
        } else if (action === 2) {
          manualZoom = 1.05;
          requestAnimationFrame(() => {
            manualZoom = 1;
          });
        } else {
          const pickStart = performance.now();
          let nearest = Number.POSITIVE_INFINITY;
          for (let group = 0; group < GROUP_COUNT; group += 1) {
            const angle = (group / GROUP_COUNT) * Math.PI * 2 + elapsed * 0.00001;
            nearest = Math.min(nearest, Math.hypot(Math.cos(angle) * 400, Math.sin(angle) * 400));
          }
          pickingProbeMs.push(performance.now() - pickStart + nearest * 0);
        }
        requestAnimationFrame(() => visibleResponsesMs.push(performance.now() - inputStarted));
        nextInputAt += 2_000;
        inputIndex += 1;
      }
      lastTimestamp = timestamp;
      if (!sampledFiveSeconds && elapsed >= 5_000) {
        trailSamples.push(trailStatistics(renderer.readTrail(), 5));
        sampledFiveSeconds = true;
      }
      if (!sampledSixtySeconds && elapsed >= 60_000) {
        trailSamples.push(trailStatistics(renderer.readTrail(), 60));
        sampledSixtySeconds = true;
      }
      if (elapsed < warmupMs + measurementMs) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });

  if (trailSamples.length === 0) {
    trailSamples.push(trailStatistics(renderer.readTrail(), (warmupMs + measurementMs) / 1000));
  }
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const webgl = {
    vendor: String(
      debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    ),
    renderer: String(
      debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    ),
    version: String(gl.getParameter(gl.VERSION)),
  };
  const durationSeconds = frameIntervalsMs.reduce((sum, value) => sum + value, 0) / 1000;
  const result: RendererProxyResult = {
    particleCount,
    frames: frameIntervalsMs.length + 1,
    averageFps: durationSeconds === 0 ? 0 : frameIntervalsMs.length / durationSeconds,
    p95FrameIntervalMs: percentile(frameIntervalsMs, 0.95),
    p95VisibleResponseMs: percentile(visibleResponsesMs, 0.95),
    frameIntervalsMs,
    visibleResponsesMs,
    workerCopyMs,
    particleUpdateMs,
    renderMs,
    pickingProbeMs,
    trailSamples,
    webgl,
  };
  renderer.destroy();
  application.destroy(true);
  return result;
}
