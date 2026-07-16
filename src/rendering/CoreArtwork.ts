/* eslint-disable @typescript-eslint/no-non-null-assertion -- readPixels fills the fixed RGBA sample buffer. */
import type { CoreFrame } from "../simulation/protocol";

export const CORE_OFF_Y = 0.05,
  CORE_ON_Y = 0.07,
  MAX_SCENE_LINEAR_Y = 8;
export function reinhard(y: number): number {
  return y / (1 + y);
}
export function linearToSrgb(y: number): number {
  return y <= 0.0031308 ? 12.92 * y : 1.055 * Math.pow(y, 1 / 2.4) - 0.055;
}
export function visibleCoreChannel(y: number): number {
  return linearToSrgb(reinhard(y));
}
export function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

const vertex = `#version 300 es
precision highp float; uniform vec2 uSurface; uniform vec2 uCenter; uniform float uRadius; out vec2 vLocal;
const vec2 q[6]=vec2[6](vec2(-1.,-1.),vec2(1.,-1.),vec2(1.,1.),vec2(-1.,-1.),vec2(1.,1.),vec2(-1.,1.));
void main(){vLocal=q[gl_VertexID];vec2 p=uCenter+vLocal*uRadius;gl_Position=vec4(p.x/uSurface.x*2.-1.,1.-p.y/uSurface.y*2.,0.,1.);}`;
const fragment = `#version 300 es
precision highp float; uniform float uPeak; uniform bool uLinear; uniform bool uBlackHole; in vec2 vLocal; out vec4 outColor;
float srgb(float y){float d=y/(1.+y);return d<=.0031308?12.92*d:1.055*pow(d,1./2.4)-.055;}
void main(){float r=length(vLocal);if(r>1.)discard;float y=mix(uPeak,uPeak*.5,r);vec3 c=vec3(y);if(uBlackHole&&r>.76&&r<.9)c=vec3(0.,y/.7874,y);if(uLinear)outColor=vec4(c,1.);else outColor=vec4(srgb(c.r),srgb(c.g),srgb(c.b),1.);}`;
function need<T>(v: T | null, label: string): T {
  if (v === null) throw new Error(`${label} allocation failed.`);
  return v;
}
function makeShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const s = need(gl.createShader(type), "Core shader");
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(String(gl.getShaderInfoLog(s)));
  return s;
}
function makeProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const p = need(gl.createProgram(), "Core program"),
    v = makeShader(gl, gl.VERTEX_SHADER, vertex),
    f = makeShader(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(String(gl.getProgramInfoLog(p)));
  return p;
}
function u(gl: WebGL2RenderingContext, p: WebGLProgram, n: string): WebGLUniformLocation {
  return need(gl.getUniformLocation(p, n), n);
}

export interface CoreDrawCamera {
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
  dpr: number;
}
export class CoreArtwork {
  private readonly program: WebGLProgram;
  private blackHoles = new Map<string, boolean>();
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = makeProgram(gl);
  }
  setBlackHoles(entries: Iterable<readonly [string, boolean]>): void {
    this.blackHoles = new Map(entries);
  }
  draw(cores: readonly CoreFrame[], camera: CoreDrawCamera, linear = false): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2f(u(gl, this.program, "uSurface"), gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1i(u(gl, this.program, "uLinear"), linear ? 1 : 0);
    for (const core of cores) {
      const peak = Math.min(MAX_SCENE_LINEAR_Y - Number.EPSILON, core.requestedPeakLinearY);
      gl.uniform2f(
        u(gl, this.program, "uCenter"),
        core.x * camera.scaleX + camera.x,
        core.y * camera.scaleY + camera.y,
      );
      gl.uniform1f(
        u(gl, this.program, "uRadius"),
        Math.max(2 * camera.dpr, Math.abs(core.coreRadius * camera.scaleX)),
      );
      gl.uniform1f(u(gl, this.program, "uPeak"), peak);
      gl.uniform1i(u(gl, this.program, "uBlackHole"), this.blackHoles.get(core.id) ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }
  measurePeak(core: CoreFrame, blackHole: boolean): number {
    const gl = this.gl;
    if (!gl.getExtension("EXT_color_buffer_float"))
      throw new Error("EXT_color_buffer_float is required.");
    const texture = need(gl.createTexture(), "Float texture"),
      fb = need(gl.createFramebuffer(), "Float framebuffer");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1024, 512, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error("RGBA32F framebuffer is incomplete.");
    gl.viewport(0, 0, 1024, 512);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.setBlackHoles([[core.id, blackHole]]);
    this.draw([core], { scaleX: 8, scaleY: -8, x: 512, y: 256, dpr: 1 }, true);
    const pixels = new Float32Array(4);
    gl.readPixels(512, 255, 1, 1, gl.RGBA, gl.FLOAT, pixels);
    const peak = 0.2126 * pixels[0]! + 0.7152 * pixels[1]! + 0.0722 * pixels[2]!;
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return peak;
  }
  destroy(): void {
    this.gl.deleteProgram(this.program);
  }
}
