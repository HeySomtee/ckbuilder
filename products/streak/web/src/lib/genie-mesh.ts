import type { GenieRow } from './genie-geometry';

const vertexSource = `
attribute vec2 a_position;
attribute vec2 a_uv;
uniform vec2 u_viewport;
varying vec2 v_uv;
void main() {
  vec2 clip = a_position / u_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
}`;
const fragmentSource = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_alpha;
varying vec2 v_uv;
void main() { gl_FragColor = texture2D(u_texture, v_uv) * u_alpha; }
`;

export function createGenieMesh(canvas: HTMLCanvasElement, snapshot: HTMLCanvasElement) {
  let context: WebGLRenderingContext | null;
  try {
    context = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });
  } catch {
    return null;
  }
  if (!context) return null;
  const gl = context;
  let program: WebGLProgram | null = null;
  let texture: WebGLTexture | null = null;
  let buffer: WebGLBuffer | null = null;
  let vertices: Float32Array<ArrayBuffer> | undefined;
  const shaders: WebGLShader[] = [];
  let disposed = false;
  let lost = false;
  const lose = (event: Event) => {
    event.preventDefault();
    lost = true;
  };
  canvas.addEventListener('webglcontextlost', lose);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', lose);
    if (!gl.isContextLost()) {
      if (buffer) gl.deleteBuffer(buffer);
      if (texture) gl.deleteTexture(texture);
      if (program) gl.deleteProgram(program);
      shaders.forEach((shader) => gl.deleteShader(shader));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    vertices = undefined;
  };
  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw Error('Shader allocation failed');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw Error('Shader compilation failed');
      return shader;
    };
    program = gl.createProgram();
    if (!program) throw Error('Program allocation failed');
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Program linking failed');
    buffer = gl.createBuffer();
    texture = gl.createTexture();
    if (!buffer || !texture) throw Error('Mesh allocation failed');
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, snapshot);
    if (gl.getError() !== gl.NO_ERROR) throw Error('Texture upload failed');
    const position = gl.getAttribLocation(program, 'a_position');
    const uv = gl.getAttribLocation(program, 'a_uv');
    const viewport = gl.getUniformLocation(program, 'u_viewport');
    const alpha = gl.getUniformLocation(program, 'u_alpha');
    const sampler = gl.getUniformLocation(program, 'u_texture');
    if (position < 0 || uv < 0 || !viewport || !alpha || !sampler)
      throw Error('Mesh inputs unavailable');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
    gl.uniform1i(sampler, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
    const paint = (rows: GenieRow[], opacity: number) => {
      if (disposed || lost || gl.isContextLost() || !rows.length || !Number.isFinite(opacity))
        return false;
      const length = (rows.length + 1) * 8;
      if (!vertices || vertices.length !== length) {
        vertices = new Float32Array(length);
        gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
      }
      for (let index = 0; index <= rows.length; index++) {
        const edge = index === rows.length ? rows[index - 1].bottom : rows[index].top;
        if (![edge.left, edge.right, edge.y].every(Number.isFinite)) return false;
        const offset = index * 8;
        const v = index / rows.length;
        vertices[offset] = edge.left;
        vertices[offset + 1] = edge.y;
        vertices[offset + 2] = 0;
        vertices[offset + 3] = v;
        vertices[offset + 4] = edge.right;
        vertices[offset + 5] = edge.y;
        vertices[offset + 6] = 1;
        vertices[offset + 7] = v;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(viewport, innerWidth, innerHeight);
      gl.uniform1f(alpha, Math.max(0, Math.min(1, opacity)));
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, (rows.length + 1) * 2);
      return true;
    };
    return { paint, dispose };
  } catch {
    dispose();
    return null;
  }
}
