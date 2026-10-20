import type { Raster } from '../src/image/raster.ts';
import { resizeArea } from '../src/watermark/dsp.ts';

/** Deterministic photo-like test image: gradients, shapes and sensor-like noise. */
export function syntheticImage(width: number, height: number, seed = 1): Raster {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const data = new Uint8Array(width * height * 4);
  const shapes = Array.from({ length: 20 }, () => ({
    x: rnd() * width,
    y: rnd() * height,
    r: 8 + (rnd() * Math.min(width, height)) / 4,
    c: [rnd() * 255, rnd() * 255, rnd() * 255],
  }));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 40 + (150 * x) / width;
      let g = 60 + (120 * y) / height;
      let b = 140 + 60 * Math.sin(x / 37) * Math.cos(y / 23);
      for (const sh of shapes) {
        if (Math.hypot(x - sh.x, y - sh.y) < sh.r) {
          r = r * 0.4 + sh.c[0] * 0.6;
          g = g * 0.4 + sh.c[1] * 0.6;
          b = b * 0.4 + sh.c[2] * 0.6;
        }
      }
      const n = (rnd() - 0.5) * 18;
      const i = (y * width + x) * 4;
      data[i] = Math.max(0, Math.min(255, r + n));
      data[i + 1] = Math.max(0, Math.min(255, g + n));
      data[i + 2] = Math.max(0, Math.min(255, b + n));
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

export function psnr(a: Raster, b: Raster): number {
  let se = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) se += (a.data[i + c] - b.data[i + c]) ** 2;
  const mse = se / (a.width * a.height * 3);
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

export function resizeRaster(r: Raster, width: number, height: number): Raster {
  width = Math.round(width);
  height = Math.round(height);
  const out = new Uint8Array(width * height * 4);
  for (let c = 0; c < 4; c++) {
    const ch = new Float32Array(r.width * r.height);
    for (let i = 0; i < ch.length; i++) ch[i] = r.data[i * 4 + c];
    const rs = resizeArea(ch, r.width, r.height, width, height);
    for (let i = 0; i < rs.length; i++) out[i * 4 + c] = Math.round(rs[i]);
  }
  return { width, height, data: out };
}
