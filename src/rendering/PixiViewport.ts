import { Application, WebGLRenderer } from "pixi.js";
import type { FrameEvent, TopologyEvent } from "../simulation/protocol";
import { ProductionRenderer, type RendererDebugCounters } from "./ProductionRenderer";
import {
  automaticFramingReducer,
  frameLiveBounds,
  panCamera,
  resetCamera as resetCameraState,
  worldToScreen,
  zoomAtPoint,
  type CameraState,
  type CssPoint,
} from "./camera";
import { DragSession, HitGrid, type DragCommit, type DragPreview } from "./interaction";

export interface ViewportMetrics {
  renderer: "webgl";
  width: number;
  height: number;
  devicePixelRatio: number;
}

export class PixiViewport {
  private application: Application | null = null;
  private host: HTMLElement | null = null;
  private metrics: ViewportMetrics | null = null;
  private renderer: ProductionRenderer | null = null;
  private topologyEpoch: number | null = null;
  private automaticFraming = true;
  private camera: CameraState = {
    centerX: 0,
    centerY: 0,
    zoom: 5,
    cssWidth: 0,
    cssHeight: 0,
    devicePixelRatio: 1,
  };
  private destroyed = false;
  private contextLost = false;
  private trails = false;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame = 0;
  private lastTopology: TopologyEvent | null = null;
  private lastFrame: { event: FrameEvent; positions: Float32Array<ArrayBuffer> } | null = null;
  private dragSession: DragSession | null = null;
  private dragKind: "center" | "velocity" | null = null;
  private readonly hitGrid = new HitGrid();
  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
  };
  private readonly handleContextRestored = () => {
    if (!this.application) return;
    if (!(this.application.renderer instanceof WebGLRenderer)) return;
    const gl = this.application.renderer.gl;
    if (!(gl instanceof WebGL2RenderingContext)) return;
    this.renderer?.destroy();
    this.renderer = new ProductionRenderer(gl);
    if (this.lastTopology) this.renderer.applyTopology(this.lastTopology);
    this.renderer.setTrails(this.trails);
    this.contextLost = false;
    if (this.lastFrame) this.applyFrame(this.lastFrame.event, this.lastFrame.positions);
  };

  async mount(hostElement: HTMLElement): Promise<void> {
    if (this.application !== null) throw new Error("Viewport is already mounted.");
    const application = new Application();
    await application.init({
      preference: "webgl",
      background: 0x050814,
      antialias: false,
      autoDensity: true,
      resizeTo: hostElement,
    });
    if (this.destroyed) {
      application.destroy(true);
      throw new Error("Viewport mount was cancelled.");
    }
    if (!(application.renderer instanceof WebGLRenderer)) {
      application.destroy(true);
      throw new Error("Galaxia requires WebGL rendering.");
    }
    const gl = application.renderer.gl;
    if (!(gl instanceof WebGL2RenderingContext)) {
      application.destroy(true);
      throw new Error("Galaxia requires WebGL2 rendering.");
    }
    application.stop();
    this.application = application;
    this.renderer = new ProductionRenderer(gl);
    this.host = hostElement;
    this.canvas = application.canvas;
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
    hostElement.append(this.canvas);
    this.resize(
      Math.max(1, hostElement.clientWidth),
      Math.max(1, hostElement.clientHeight),
      devicePixelRatio,
    );
    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        const width = Math.max(1, hostElement.clientWidth),
          height = Math.max(1, hostElement.clientHeight);
        if (
          width !== this.camera.cssWidth ||
          height !== this.camera.cssHeight ||
          devicePixelRatio !== this.camera.devicePixelRatio
        )
          this.resize(width, height, devicePixelRatio);
      });
    });
    this.resizeObserver.observe(hostElement);
  }

  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    if (!this.application) return;
    this.application.renderer.resolution = devicePixelRatio;
    this.application.renderer.resize(cssWidth, cssHeight);
    this.camera = { ...this.camera, cssWidth, cssHeight, devicePixelRatio };
    this.updateMetrics();
  }

  getMetrics(): ViewportMetrics | null {
    return this.metrics;
  }

  applyTopology(topology: TopologyEvent): void {
    if (!this.renderer) throw new Error("Viewport is not mounted.");
    this.renderer.applyTopology(topology);
    this.lastTopology = topology;
    this.hitGrid.applyTopology(topology);
    this.topologyEpoch = topology.topologyEpoch;
  }

  applyFrame(frame: FrameEvent, positions = new Float32Array(frame.positions)): void {
    if (!this.renderer || !this.application) throw new Error("Viewport is not mounted.");
    if (frame.topologyEpoch !== this.topologyEpoch)
      throw new Error("Frame topology does not match renderer topology.");
    this.lastFrame = { event: frame, positions: new Float32Array(positions) };
    if (this.contextLost) return;
    if (this.automaticFraming)
      this.camera = frameLiveBounds(this.camera, frame.bounds, frame.cores);
    this.hitGrid.applyFrame(this.camera, positions, frame.cores, {
      modelRevision: frame.modelRevision,
      topologyEpoch: frame.topologyEpoch,
      frameId: frame.frameId,
    });
    const dpr = this.camera.devicePixelRatio;
    this.renderer.applyFrame(
      positions,
      frame.cores,
      this.camera.zoom * dpr,
      -this.camera.zoom * dpr,
      (this.camera.cssWidth / 2 - this.camera.centerX * this.camera.zoom) * dpr,
      (this.camera.cssHeight / 2 + this.camera.centerY * this.camera.zoom) * dpr,
      dpr,
    );
  }

  setAutomaticFraming(enabled: boolean): void {
    this.automaticFraming = automaticFramingReducer(this.automaticFraming, {
      type: "EXPLICIT_TOGGLE",
      enabled,
    });
  }
  setTrails(enabled: boolean): void {
    this.trails = enabled;
    this.renderer?.setTrails(enabled);
  }
  panByCssPixels(dx: number, dy: number): void {
    this.camera = panCamera(this.camera, dx, dy);
    this.automaticFraming = automaticFramingReducer(this.automaticFraming, {
      type: "MANUAL_PAN_OR_ZOOM",
    });
  }
  zoomAtCssPoint(factor: number, x: number, y: number): void {
    this.camera = zoomAtPoint(this.camera, factor, { x, y });
    this.automaticFraming = automaticFramingReducer(this.automaticFraming, {
      type: "MANUAL_PAN_OR_ZOOM",
    });
  }
  resetCamera(): void {
    this.camera = resetCameraState(this.camera);
  }
  getCameraState(): Readonly<CameraState> {
    return { ...this.camera };
  }
  isAutomaticFramingEnabled(): boolean {
    return this.automaticFraming;
  }
  pickAtCssPoint(x: number, y: number): string | null {
    return this.hitGrid.pick({ x, y });
  }
  beginCenterDrag(galaxyId: string, pointer: CssPoint): boolean {
    const core = this.lastFrame?.event.cores.find((item) => item.id === galaxyId),
      identity = this.hitGrid.getIdentity();
    if (!core || !identity) return false;
    const projected = worldToScreen(this.camera, core),
      radius = Math.max(2, core.coreRadius * this.camera.zoom);
    if ((pointer.x - projected.x) ** 2 + (pointer.y - projected.y) ** 2 > radius ** 2) return false;
    this.dragSession = DragSession.center(
      galaxyId,
      identity.topologyEpoch,
      this.camera,
      { x: core.x, y: core.y },
      pointer,
    );
    this.dragKind = "center";
    return true;
  }
  beginVelocityDrag(galaxyId: string, pointer: CssPoint): boolean {
    const core = this.lastFrame?.event.cores.find((item) => item.id === galaxyId),
      identity = this.hitGrid.getIdentity();
    if (!core || !identity) return false;
    const endpoint = worldToScreen(this.camera, {
      x: core.x + core.vx * 2,
      y: core.y + core.vy * 2,
    });
    if ((pointer.x - endpoint.x) ** 2 + (pointer.y - endpoint.y) ** 2 > 8 ** 2) return false;
    this.dragSession = DragSession.velocity(
      galaxyId,
      identity.topologyEpoch,
      this.camera,
      { x: core.x, y: core.y },
      { x: core.vx, y: core.vy },
    );
    this.dragKind = "velocity";
    return true;
  }
  updateCenterDrag(pointer: CssPoint): DragPreview | null {
    return this.dragKind === "center" ? this.updateDrag(pointer) : null;
  }
  updateVelocityDrag(pointer: CssPoint): DragPreview | null {
    return this.dragKind === "velocity" ? this.updateDrag(pointer) : null;
  }
  finishDrag(): DragCommit | null {
    const result = this.dragSession?.finish() ?? null;
    this.dragSession = null;
    this.dragKind = null;
    return result;
  }
  cancelDrag(): void {
    this.dragSession?.cancel();
    this.dragSession = null;
    this.dragKind = null;
  }
  private updateDrag(pointer: CssPoint): DragPreview | null {
    const epoch = this.topologyEpoch;
    if (!this.dragSession || epoch === null) return null;
    const preview = this.dragSession.update(
      pointer,
      epoch,
      new Set(this.lastTopology?.descriptors.map((descriptor) => descriptor.id) ?? []),
    );
    if (!preview) this.cancelDrag();
    return preview;
  }
  renderArtworkTo(target: HTMLCanvasElement): void {
    if (!this.application) throw new Error("Viewport is not mounted.");
    const context = target.getContext("2d");
    if (!context) throw new Error("Artwork target requires a 2D context.");
    context.fillStyle = "rgb(5, 8, 20)";
    context.fillRect(0, 0, target.width, target.height);
    const source = this.application.canvas,
      scale = Math.min(target.width / source.width, target.height / source.height),
      width = source.width * scale,
      height = source.height * scale,
      x = (target.width - width) / 2,
      y = (target.height - height) / 2;
    context.drawImage(source, x, y, width, height);
  }

  getDebugCounters(): RendererDebugCounters {
    const counters = this.renderer?.getDebugCounters() ?? {
      particles: 0,
      textures: 0,
      renderTextures: 0,
      listeners: 0,
      outstandingLeases: 0,
      staticUploads: 0,
      positionUploads: 0,
    };
    return { ...counters, listeners: this.canvas ? 2 : 0 };
  }

  destroy(): void {
    this.destroyed = true;
    this.canvas?.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas?.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = 0;
    this.resizeObserver = null;
    this.renderer?.destroy();
    this.renderer = null;
    this.topologyEpoch = null;
    this.hitGrid.clear();
    this.cancelDrag();
    this.application?.destroy(true, { children: true, texture: true });
    this.application = null;
    this.host = null;
    this.canvas = null;
    this.lastTopology = null;
    this.lastFrame = null;
    this.metrics = null;
  }

  private updateMetrics() {
    if (!this.application || !this.host) return;
    this.metrics = {
      renderer: "webgl",
      width: this.host.clientWidth,
      height: this.host.clientHeight,
      devicePixelRatio: this.application.renderer.resolution,
    };
  }
}
