/* eslint-disable @typescript-eslint/no-non-null-assertion -- Topology validation guarantees style lengths. */
import type { CoreFrame, StyleBlockTransfer, TopologyEvent } from "../simulation/protocol";
import { TrailFeedback } from "./TrailFeedback";
import { CoreArtwork } from "./CoreArtwork";

export interface RendererDebugCounters {
  particles: number;
  textures: number;
  renderTextures: number;
  listeners: number;
  outstandingLeases: number;
  staticUploads: number;
  positionUploads: number;
}

const vertexSource = `#version 300 es
precision highp float;
layout(location=0) in vec2 aQuad;
layout(location=1) in vec2 aPosition;
layout(location=2) in vec4 aColor;
layout(location=3) in float aSize;
uniform vec2 uSurface;
uniform vec4 uCamera;
uniform float uDpr;
uniform float uOpacity;
out vec2 vUv;
out vec4 vColor;
void main() {
  vec2 pixel = aPosition * uCamera.xy + uCamera.zw + aQuad * aSize * 2.0 * uDpr;
  vec2 clip = vec2(pixel.x / uSurface.x * 2.0 - 1.0, 1.0 - pixel.y / uSurface.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vUv = aQuad + 0.5;
  vColor = vec4(aColor.rgb, aColor.a * uOpacity);
}`;

const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
in vec2 vUv;
in vec4 vColor;
out vec4 outColor;
void main() {
  float alpha = texture(uTexture, vUv).a * vColor.a;
  outColor = vec4(vColor.rgb * alpha, alpha);
}`;

function required<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`${label} allocation failed.`);
  return value;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = required(gl.createShader(type), "Renderer shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Renderer shader compilation failed: ${String(log)}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const result = required(gl.createProgram(), "Renderer program");
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(result, vertex);
  gl.attachShader(result, fragment);
  gl.linkProgram(result);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
    throw new Error(`Renderer program link failed: ${String(gl.getProgramInfoLog(result))}`);
  }
  return result;
}

function uniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string) {
  return required(gl.getUniformLocation(program, name), `Uniform ${name}`);
}

export function createProceduralStarPixels(): Uint8Array {
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const radius = Math.hypot(x - 7.5, y - 7.5);
      const alpha = radius <= 2 ? 255 : radius >= 7 ? 0 : Math.round((255 * (7 - radius)) / 5);
      const offset = (y * 16 + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = alpha;
    }
  }
  return pixels;
}

function copyStyles(topology: TopologyEvent): Uint8Array {
  const total = topology.segments.reduce((sum, segment) => sum + segment.count, 0);
  const styles = new Uint8Array(total * 5);
  const blocks = new Map<string, StyleBlockTransfer>(
    topology.styleBlocks.map((block) => [block.id, block]),
  );
  for (const segment of topology.segments) {
    const block = blocks.get(segment.styleBlockId);
    if (!block) throw new Error(`Invalid style block ${segment.styleBlockId}.`);
    if (
      block.red.length !== segment.count ||
      block.green.length !== segment.count ||
      block.blue.length !== segment.count ||
      block.alpha.length !== segment.count ||
      block.pointSize.length !== segment.count
    ) {
      throw new Error(`Invalid style block ${segment.styleBlockId}.`);
    }
    for (let index = 0; index < segment.count; index += 1) {
      const target = (segment.start + index) * 5;
      styles[target] = block.red[index]!;
      styles[target + 1] = block.green[index]!;
      styles[target + 2] = block.blue[index]!;
      styles[target + 3] = block.alpha[index]!;
      styles[target + 4] = block.pointSize[index] ?? 1;
    }
  }
  return styles;
}

export class ProductionRenderer {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffers: WebGLBuffer[];
  private readonly positionBuffer: WebGLBuffer;
  private readonly styleBuffer: WebGLBuffer;
  private readonly texture: WebGLTexture;
  private readonly trails: TrailFeedback;
  private readonly coreArtwork: CoreArtwork;
  private trailsEnabled = false;
  private lastRenderTime = 0;
  private particleCount = 0;
  private cores: CoreFrame[] = [];
  private destroyed = false;
  private counters: RendererDebugCounters = {
    particles: 0,
    textures: 1,
    renderTextures: 0,
    listeners: 0,
    outstandingLeases: 0,
    staticUploads: 0,
    positionUploads: 0,
  };

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createProgram(gl);
    this.trails = new TrailFeedback(gl);
    this.coreArtwork = new CoreArtwork(gl);
    this.vao = required(gl.createVertexArray(), "Vertex array");
    const quad = required(gl.createBuffer(), "Quad buffer");
    this.positionBuffer = required(gl.createBuffer(), "Position buffer");
    this.styleBuffer = required(gl.createBuffer(), "Style buffer");
    const indices = required(gl.createBuffer(), "Index buffer");
    this.buffers = [quad, this.positionBuffer, this.styleBuffer, indices];
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.styleBuffer);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 5, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.UNSIGNED_BYTE, false, 5, 4);
    gl.vertexAttribDivisor(3, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.texture = required(gl.createTexture(), "Star texture");
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      16,
      16,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      createProceduralStarPixels(),
    );
  }

  applyTopology(topology: TopologyEvent): void {
    const styles = copyStyles(topology);
    this.particleCount = styles.length / 5;
    this.counters.particles = this.particleCount;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.particleCount * 8, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.styleBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, styles, this.gl.STATIC_DRAW);
    this.counters.staticUploads += 1;
    this.coreArtwork.setBlackHoles(
      topology.descriptors.map(
        (descriptor) => [descriptor.id, descriptor.generation.blackHole] as const,
      ),
    );
    if (this.particleCount === 0) this.trails.clear("empty-topology");
  }

  setTrails(enabled: boolean): void {
    this.trailsEnabled = enabled;
  }
  clearTrails(): void {
    this.trails.clear("scene-replacement");
  }

  applyFrame(
    positions: Float32Array,
    cores: CoreFrame[],
    scaleX: number,
    scaleY: number,
    x: number,
    y: number,
    dpr: number,
  ): void {
    if (positions.length !== this.particleCount * 2)
      throw new Error("Frame particle count does not match topology.");
    this.cores = cores.map((core) => ({ ...core }));
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
    this.counters.positionUploads += 1;
    const now = performance.now(),
      delta = this.lastRenderTime === 0 ? 0 : now - this.lastRenderTime;
    this.lastRenderTime = now;
    const draw = (opacity: number) => {
      this.drawStars(scaleX, scaleY, x, y, dpr, opacity);
    };
    if (this.trailsEnabled) {
      this.trails.update({ scale: scaleX, x, y }, delta, draw);
      this.counters.textures = 3;
      this.counters.renderTextures = 2;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(5 / 255, 8 / 255, 20 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.trailsEnabled) this.trails.composite();
    draw(1);
    this.coreArtwork.draw(cores, { scaleX, scaleY, x, y, dpr });
  }

  private drawStars(
    scaleX: number,
    scaleY: number,
    x: number,
    y: number,
    dpr: number,
    opacity: number,
  ): void {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(uniform(gl, this.program, "uTexture"), 0);
    gl.uniform2f(
      uniform(gl, this.program, "uSurface"),
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
    );
    gl.uniform4f(uniform(gl, this.program, "uCamera"), scaleX, scaleY, x, y);
    gl.uniform1f(uniform(gl, this.program, "uDpr"), dpr);
    gl.uniform1f(uniform(gl, this.program, "uOpacity"), opacity);
    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.particleCount);
    gl.bindVertexArray(null);
  }

  getDebugCounters(): RendererDebugCounters {
    return { ...this.counters };
  }
  getCoreCache(): readonly CoreFrame[] {
    return this.cores;
  }
  getTrailClearEvents(): readonly string[] {
    return this.trails.getClearEvents();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const buffer of this.buffers) this.gl.deleteBuffer(buffer);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
    this.gl.deleteTexture(this.texture);
    this.trails.destroy();
    this.coreArtwork.destroy();
    this.cores = [];
    this.counters = {
      particles: 0,
      textures: 0,
      renderTextures: 0,
      listeners: 0,
      outstandingLeases: 0,
      staticUploads: this.counters.staticUploads,
      positionUploads: this.counters.positionUploads,
    };
  }
}
