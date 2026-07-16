export type TrailClearReason =
  "scene-replacement" | "empty-topology" | "context-restored" | "non-invertible-camera";
export const TRAIL_CLEAR_REASONS: readonly TrailClearReason[] = [
  "scene-replacement",
  "empty-topology",
  "context-restored",
  "non-invertible-camera",
];
export interface TrailCamera {
  scale: number;
  x: number;
  y: number;
}
export function trailFade(deltaMs: number): number {
  return 0.5 ** (deltaMs / 1200);
}
export function trailReprojection(
  previous: TrailCamera,
  current: TrailCamera,
  width: number,
  height: number,
): { ratio: number; x: number; y: number } {
  const ratio = current.scale / previous.scale,
    centerShift = (ratio - 1) / 2;
  return {
    ratio,
    x: (current.x - previous.x * ratio) / width + centerShift,
    y: -(current.y - previous.y * ratio) / height + centerShift,
  };
}

const vertex = `#version 300 es
precision highp float;
const vec2 vertices[3] = vec2[3](vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));
out vec2 vUv;
void main(){gl_Position=vec4(vertices[gl_VertexID],0.0,1.0);vUv=gl_Position.xy*0.5+0.5;}`;
const fragment = `#version 300 es
precision highp float;
uniform sampler2D uPrior; uniform float uFade; uniform vec3 uReproject;
in vec2 vUv; out vec4 outColor;
void main(){vec2 uv=(vUv-0.5-uReproject.yz)/uReproject.x+0.5;outColor=texture(uPrior,uv)*uFade;}`;

function required<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`${label} allocation failed.`);
  return value;
}
function shader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const result = required(gl.createShader(type), "Trail shader");
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS))
    throw new Error(`Trail shader failed: ${String(gl.getShaderInfoLog(result))}`);
  return result;
}
function makeProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const result = required(gl.createProgram(), "Trail program"),
    v = shader(gl, gl.VERTEX_SHADER, vertex),
    f = shader(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(result, v);
  gl.attachShader(result, f);
  gl.linkProgram(result);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS))
    throw new Error("Trail program link failed.");
  return result;
}
function uniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  return required(gl.getUniformLocation(program, name), name);
}

export class TrailFeedback {
  private readonly program: WebGLProgram;
  private textures: WebGLTexture[] = [];
  private framebuffers: WebGLFramebuffer[] = [];
  private width = 0;
  private height = 0;
  private accumulated: 0 | 1 = 0;
  private previous: TrailCamera | null = null;
  private clearEvents: TrailClearReason[] = [];
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = makeProgram(gl);
  }
  ensureSize(): void {
    const gl = this.gl,
      w = gl.drawingBufferWidth,
      h = gl.drawingBufferHeight;
    if (w === this.width && h === this.height && this.textures.length === 2) return;
    this.releaseTargets();
    this.width = w;
    this.height = h;
    for (let i = 0; i < 2; i += 1) {
      const texture = required(gl.createTexture(), "Trail texture"),
        fb = required(gl.createFramebuffer(), "Trail framebuffer");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      this.textures.push(texture);
      this.framebuffers.push(fb);
    }
    this.clear("context-restored");
  }
  clear(reason: TrailClearReason): void {
    this.clearEvents.push(reason);
    for (const fb of this.framebuffers) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fb);
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.previous = null;
  }
  update(camera: TrailCamera, deltaMs: number, drawCurrent: (opacity: number) => void): void {
    this.ensureSize();
    const gl = this.gl,
      scratch: 0 | 1 = this.accumulated === 0 ? 1 : 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[scratch] ?? null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const previous = this.previous ?? camera,
      reprojection = trailReprojection(previous, camera, this.width, this.height);
    if (!Number.isFinite(reprojection.ratio) || reprojection.ratio === 0)
      this.clear("non-invertible-camera");
    else
      this.draw(
        this.accumulated,
        trailFade(deltaMs),
        reprojection.ratio,
        reprojection.x,
        reprojection.y,
      );
    drawCurrent(0.35);
    this.accumulated = scratch;
    this.previous = { ...camera };
  }
  composite(): void {
    this.draw(this.accumulated, 1, 1, 0, 0);
  }
  private draw(index: number, fade: number, ratio: number, x: number, y: number): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[index] ?? null);
    gl.uniform1i(uniform(gl, this.program, "uPrior"), 1);
    gl.uniform1f(uniform(gl, this.program, "uFade"), fade);
    gl.uniform3f(uniform(gl, this.program, "uReproject"), ratio, x, y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  getClearEvents(): readonly TrailClearReason[] {
    return [...this.clearEvents];
  }
  getTargetCount(): number {
    return this.textures.length;
  }
  destroy(): void {
    this.releaseTargets();
    this.gl.deleteProgram(this.program);
  }
  private releaseTargets(): void {
    for (const fb of this.framebuffers) this.gl.deleteFramebuffer(fb);
    for (const texture of this.textures) this.gl.deleteTexture(texture);
    this.framebuffers = [];
    this.textures = [];
  }
}
