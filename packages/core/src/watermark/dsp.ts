/** Signal-processing primitives for the watermark: 8×8 DCT and image resampling. */

const N = 8;
/** Orthonormal DCT-II basis: COS[u * 8 + x] = a(u) · cos((2x + 1)uπ / 16). */
const COS = new Float64Array(N * N);
for (let u = 0; u < N; u++) {
  const a = u === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
  for (let x = 0; x < N; x++) COS[u * N + x] = a * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
}

const tmp = new Float64Array(N * N);

/** Forward 2-D DCT of the 8×8 block at (bx, by) of `img` (width `w`) into `out` (row = v, col = u). */
export function dct8(img: Float32Array, w: number, bx: number, by: number, out: Float64Array): void {
  // Rows: tmp[y][u] = Σx img[y][x] · C[u][x]
  for (let y = 0; y < N; y++) {
    const row = (by + y) * w + bx;
    for (let u = 0; u < N; u++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += img[row + x] * COS[u * N + x];
      tmp[y * N + u] = s;
    }
  }
  // Columns: out[v][u] = Σy tmp[y][u] · C[v][y]
  for (let v = 0; v < N; v++) {
    for (let u = 0; u < N; u++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += tmp[y * N + u] * COS[v * N + y];
      out[v * N + u] = s;
    }
  }
}

/** Inverse 2-D DCT of `coef` (row = v, col = u) written into the 8×8 block at (bx, by) of `img`. */
export function idct8(coef: Float64Array, img: Float32Array, w: number, bx: number, by: number): void {
  for (let y = 0; y < N; y++) {
    for (let u = 0; u < N; u++) {
      let s = 0;
      for (let v = 0; v < N; v++) s += coef[v * N + u] * COS[v * N + y];
      tmp[y * N + u] = s;
    }
  }
  for (let y = 0; y < N; y++) {
    const row = (by + y) * w + bx;
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let u = 0; u < N; u++) s += tmp[y * N + u] * COS[u * N + x];
      img[row + x] = s;
    }
  }
}

interface Weights {
  index: Int32Array;
  weight: Float32Array;
  count: Int32Array;
  start: Int32Array;
}

/** Area-averaging weights for resampling `src` samples onto `dst` samples. */
function areaWeights(src: number, dst: number): Weights {
  const scale = src / dst;
  const index: number[] = [];
  const weight: number[] = [];
  const count = new Int32Array(dst);
  const start = new Int32Array(dst);
  for (let d = 0; d < dst; d++) {
    const a = d * scale;
    const b = (d + 1) * scale;
    start[d] = index.length;
    let total = 0;
    for (let s = Math.floor(a); s < Math.ceil(b) && s < src; s++) {
      const overlap = Math.min(b, s + 1) - Math.max(a, s);
      if (overlap <= 0) continue;
      index.push(s);
      weight.push(overlap);
      total += overlap;
    }
    count[d] = index.length - start[d];
    for (let i = start[d]; i < index.length; i++) weight[i] /= total;
  }
  return { index: Int32Array.from(index), weight: Float32Array.from(weight), count, start };
}

/** Box-filter (area) resize of a single-channel float image. */
export function resizeArea(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  const wx = areaWeights(sw, dw);
  const wy = areaWeights(sh, dh);
  const mid = new Float32Array(dw * sh);
  for (let y = 0; y < sh; y++) {
    const row = y * sw;
    for (let x = 0; x < dw; x++) {
      let s = 0;
      for (let i = wx.start[x], e = i + wx.count[x]; i < e; i++) s += src[row + wx.index[i]] * wx.weight[i];
      mid[y * dw + x] = s;
    }
  }
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let s = 0;
      for (let i = wy.start[y], e = i + wy.count[y]; i < e; i++) s += mid[wy.index[i] * dw + x] * wy.weight[i];
      out[y * dw + x] = s;
    }
  }
  return out;
}

/** Bilinear resize with pixel-centre alignment (used to upsample the watermark residual). */
export function resizeBilinear(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  const out = new Float32Array(dw * dh);
  const sx = sw / dw;
  const sy = sh / dh;
  const x0 = new Int32Array(dw);
  const fx = new Float32Array(dw);
  for (let x = 0; x < dw; x++) {
    const p = Math.min(sw - 1, Math.max(0, (x + 0.5) * sx - 0.5));
    x0[x] = Math.min(sw - 2, Math.floor(p));
    fx[x] = p - x0[x];
    if (sw === 1) {
      x0[x] = 0;
      fx[x] = 0;
    }
  }
  for (let y = 0; y < dh; y++) {
    const p = Math.min(sh - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = sh === 1 ? 0 : Math.min(sh - 2, Math.floor(p));
    const fy = sh === 1 ? 0 : p - y0;
    const r0 = y0 * sw;
    const r1 = sh === 1 ? r0 : r0 + sw;
    for (let x = 0; x < dw; x++) {
      const a = x0[x];
      const b = sw === 1 ? a : a + 1;
      const top = src[r0 + a] + (src[r0 + b] - src[r0 + a]) * fx[x];
      const bot = src[r1 + a] + (src[r1 + b] - src[r1 + a]) * fx[x];
      out[y * dw + x] = top + (bot - top) * fy;
    }
  }
  return out;
}
