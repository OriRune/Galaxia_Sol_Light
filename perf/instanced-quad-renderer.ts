export interface CameraTransform {
  scale: number;
  x: number;
  y: number;
}

const vertexSource = `#version 300 es
precision highp float;
layout(location=0) in vec2 aQuad;
layout(location=1) in vec2 aPosition;
layout(location=2) in vec4 aStyle;
uniform vec2 uSurface;
uniform vec3 uCamera;
uniform float uDiameter;
out vec2 vUv;
out vec4 vStyle;
void main() {
  vec2 pixel = aPosition * uCamera.x + uCamera.yz + aQuad * uDiameter;
  vec2 clip = vec2(pixel.x / uSurface.x * 2.0 - 1.0, 1.0 - pixel.y / uSurface.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vUv = aQuad + 0.5;
  vStyle = aStyle;
}`;

const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uStar;
in vec2 vUv;
in vec4 vStyle;
out vec4 outColor;
void main() {
  vec4 texel = texture(uStar, vUv);
  outColor = vec4(vStyle.rgb, vStyle.a * texel.a);
}`;

const feedbackVertexSource = `#version 300 es
precision highp float;
const vec2 vertices[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vUv;
void main() {
  gl_Position = vec4(vertices[gl_VertexID], 0.0, 1.0);
  vUv = gl_Position.xy * 0.5 + 0.5;
}`;

const feedbackFragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uPrior;
uniform float uDecay;
uniform vec3 uReproject;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 uv = (vUv - 0.5 - uReproject.yz) / uReproject.x + 0.5;
  outColor = texture(uPrior, uv) * uDecay;
}`;

function required<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`${label} allocation failed.`);
  return value;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = required(gl.createShader(type), "Benchmark shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Benchmark shader compilation failed: ${String(log)}`);
  }
  return shader;
}

function program(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const result = required(gl.createProgram(), "Benchmark program");
  const vertexShader = compile(gl, gl.VERTEX_SHADER, vertex);
  const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(result, vertexShader);
  gl.attachShader(result, fragmentShader);
  gl.linkProgram(result);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
    throw new Error(`Benchmark program link failed: ${String(gl.getProgramInfoLog(result))}`);
  }
  return result;
}

function location(gl: WebGL2RenderingContext, owner: WebGLProgram, name: string) {
  const result = gl.getUniformLocation(owner, name);
  if (result === null) throw new Error(`Missing benchmark uniform ${name}.`);
  return result;
}

export class InstancedQuadRenderer {
  readonly gl: WebGL2RenderingContext;
  private readonly particleCount: number;
  private readonly width: number;
  private readonly height: number;
  private readonly starProgram: WebGLProgram;
  private readonly feedbackProgram: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly positionBuffer: WebGLBuffer;
  private readonly styleBuffer: WebGLBuffer;
  private readonly buffers: WebGLBuffer[];
  private readonly starTexture: WebGLTexture;
  private readonly textures: [WebGLTexture, WebGLTexture];
  private readonly framebuffers: [WebGLFramebuffer, WebGLFramebuffer];
  private accumulated: 0 | 1 = 0;
  private previousCamera: CameraTransform = { scale: 1, x: 0, y: 0 };

  constructor(
    gl: WebGL2RenderingContext,
    particleCount: number,
    styles: Uint8Array,
    starCanvas: HTMLCanvasElement,
    width: number,
    height: number,
  ) {
    this.gl = gl;
    this.particleCount = particleCount;
    this.width = width;
    this.height = height;
    this.starProgram = program(gl, vertexSource, fragmentSource);
    this.feedbackProgram = program(gl, feedbackVertexSource, feedbackFragmentSource);
    const vao = required(gl.createVertexArray(), "Vertex array");
    const quad = required(gl.createBuffer(), "Quad buffer");
    const positions = required(gl.createBuffer(), "Position buffer");
    const style = required(gl.createBuffer(), "Style buffer");
    const indices = required(gl.createBuffer(), "Index buffer");
    this.vao = vao;
    this.positionBuffer = positions;
    this.styleBuffer = style;
    this.buffers = [quad, positions, style, indices];
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);
    gl.bufferData(gl.ARRAY_BUFFER, (particleCount + 5) * 8, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, style);
    gl.bufferData(gl.ARRAY_BUFFER, styles, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 4, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    const starTexture = required(gl.createTexture(), "Star texture");
    this.starTexture = starTexture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, starTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, starCanvas);

    const trailTextures: WebGLTexture[] = [];
    const trailFramebuffers: WebGLFramebuffer[] = [];
    for (let index = 0; index < 2; index += 1) {
      const texture = required(gl.createTexture(), "Trail texture");
      const framebuffer = required(gl.createFramebuffer(), "Trail framebuffer");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      trailTextures.push(texture);
      trailFramebuffers.push(framebuffer);
    }
    this.textures = trailTextures as [WebGLTexture, WebGLTexture];
    this.framebuffers = trailFramebuffers as [WebGLFramebuffer, WebGLFramebuffer];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  uploadPositions(positions: Float32Array) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
  }

  uploadCorePositions(positions: Float32Array) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, this.particleCount * 8, positions);
  }

  private drawInstances(offset: number, count: number, diameter: number) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 8, offset * 8);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.styleBuffer);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 4, offset * 4);
    gl.uniform1f(location(gl, this.starProgram, "uDiameter"), diameter);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count);
  }

  render(camera: CameraTransform, elapsedFrameMs: number) {
    const gl = this.gl;
    const scratch: 0 | 1 = this.accumulated === 0 ? 1 : 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[scratch]);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.feedbackProgram);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.accumulated]);
    gl.uniform1i(location(gl, this.feedbackProgram, "uPrior"), 1);
    gl.uniform1f(location(gl, this.feedbackProgram, "uDecay"), 0.5 ** (elapsedFrameMs / 1200));
    const ratio = camera.scale / this.previousCamera.scale;
    gl.uniform3f(
      location(gl, this.feedbackProgram, "uReproject"),
      ratio,
      (camera.x - this.previousCamera.x * ratio) / this.width,
      -(camera.y - this.previousCamera.y * ratio) / this.height,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.starProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.starTexture);
    gl.uniform1i(location(gl, this.starProgram, "uStar"), 0);
    gl.uniform2f(location(gl, this.starProgram, "uSurface"), this.width, this.height);
    gl.uniform3f(location(gl, this.starProgram, "uCamera"), camera.scale, camera.x, camera.y);
    this.drawInstances(0, this.particleCount, 4);
    gl.bindVertexArray(null);
    this.accumulated = scratch;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(this.feedbackProgram);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.accumulated]);
    gl.uniform1i(location(gl, this.feedbackProgram, "uPrior"), 1);
    gl.uniform1f(location(gl, this.feedbackProgram, "uDecay"), 1);
    gl.uniform3f(location(gl, this.feedbackProgram, "uReproject"), 1, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.starProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.starTexture);
    gl.uniform1i(location(gl, this.starProgram, "uStar"), 0);
    gl.uniform2f(location(gl, this.starProgram, "uSurface"), this.width, this.height);
    gl.uniform3f(location(gl, this.starProgram, "uCamera"), camera.scale, camera.x, camera.y);
    this.drawInstances(this.particleCount, 5, 18);
    gl.bindVertexArray(null);
    this.previousCamera = { ...camera };
  }

  readTrail() {
    const bytes = new Uint8Array(this.width * this.height * 4);
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[this.accumulated]);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return bytes;
  }

  destroy() {
    const gl = this.gl;
    for (const buffer of this.buffers) gl.deleteBuffer(buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.starProgram);
    gl.deleteProgram(this.feedbackProgram);
    gl.deleteTexture(this.starTexture);
    for (const framebuffer of this.framebuffers) gl.deleteFramebuffer(framebuffer);
    for (const texture of this.textures) gl.deleteTexture(texture);
  }
}
