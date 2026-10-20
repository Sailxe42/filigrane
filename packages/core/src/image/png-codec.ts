/** Pure TypeScript PNG decoder/encoder (8-bit RGBA output, all standard colour types, Adam7). */
import { Unzlib, zlibSync } from 'fflate';
import { concat, readU32 } from '../util/bytes.ts';
import { makeChunk, PNG_SIGNATURE, pngChunks } from '../containers/png.ts';
import type { Raster } from './raster.ts';

const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function unfilter(data: Uint8Array, offset: number, width: number, height: number, bpp: number, rowBytes: number): { pixels: Uint8Array; next: number } {
  const out = new Uint8Array(rowBytes * height);
  let o = offset;
  for (let y = 0; y < height; y++) {
    const type = data[o++];
    const row = y * rowBytes;
    const prev = row - rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const raw = data[o++];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = y > 0 && x >= bpp ? out[prev + x - bpp] : 0;
      let v: number;
      switch (type) {
        case 0: v = raw; break;
        case 1: v = raw + a; break;
        case 2: v = raw + b; break;
        case 3: v = raw + ((a + b) >> 1); break;
        case 4: v = raw + paeth(a, b, c); break;
        default: throw new Error(`Invalid PNG filter type ${type}`);
      }
      out[row + x] = v & 0xff;
    }
  }
  void width;
  return { pixels: out, next: o };
}

/**
 * Inflates at most `limit` bytes. A tiny IDAT can expand to gigabytes (a "zlib
 * bomb"), so decompression stops as soon as the size implied by IHDR is reached.
 */
function inflateLimited(data: Uint8Array, limit: number): Uint8Array {
  const out = new Uint8Array(limit);
  let size = 0;
  const z = new Unzlib((chunk) => {
    const n = Math.min(chunk.length, limit - size);
    out.set(chunk.subarray(0, n), size);
    size += n;
  });
  const STEP = 16384;
  for (let i = 0; i < data.length && size < limit; i += STEP) z.push(data.subarray(i, i + STEP), i + STEP >= data.length);
  return out.subarray(0, size);
}

/** Bytes of filtered scanlines (one filter byte per row) for the whole image. */
function inflatedSize(width: number, height: number, bitsPerPixel: number, interlace: boolean): number {
  const rows = (w: number, h: number) => (w > 0 && h > 0 ? (Math.ceil((w * bitsPerPixel) / 8) + 1) * h : 0);
  if (!interlace) return rows(width, height);
  return ADAM7.reduce((sum, [x0, y0, dx, dy]) => sum + rows(Math.ceil((width - x0) / dx), Math.ceil((height - y0) / dy)), 0);
}

export function decodePng(b: Uint8Array): Raster {
  const chunks = pngChunks(b);
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('PNG without IHDR');
  const width = readU32(ihdr.data, 0);
  const height = readU32(ihdr.data, 4);
  const depth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Unsupported PNG colour type ${colorType}`);
  if (![1, 2, 4, 8, 16].includes(depth)) throw new Error(`Unsupported PNG bit depth ${depth}`);
  if (width === 0 || height === 0 || width * height > 100_000_000) throw new Error('PNG too large or empty');

  const palette = chunks.find((c) => c.type === 'PLTE')?.data;
  const trns = chunks.find((c) => c.type === 'tRNS')?.data;
  const idat = concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const data = inflateLimited(idat, inflatedSize(width, height, channels * depth, !!interlace));
  const bpp = Math.max(1, (channels * depth) >> 3);
  const out = new Uint8Array(width * height * 4);
  const maxVal = (1 << depth) - 1;

  const sample = (row: Uint8Array, rowStart: number, index: number): number => {
    if (depth === 8) return row[rowStart + index];
    if (depth === 16) return row[rowStart + index * 2];
    const bitPos = index * depth;
    const byte = row[rowStart + (bitPos >> 3)];
    return (byte >> (8 - depth - (bitPos & 7))) & maxVal;
  };
  const scale = depth === 16 || depth === 8 ? 1 : 255 / maxVal;
  const trnsGray = trns && colorType === 0 ? (depth === 16 ? trns[0] : (trns[0] << 8) | trns[1]) : -1;

  const writePixel = (row: Uint8Array, rowStart: number, x: number, dst: number) => {
    let r: number, g: number, bl: number, a = 255;
    if (colorType === 3) {
      const idx = sample(row, rowStart, x);
      r = palette ? palette[idx * 3] : 0;
      g = palette ? palette[idx * 3 + 1] : 0;
      bl = palette ? palette[idx * 3 + 2] : 0;
      a = trns && idx < trns.length ? trns[idx] : 255;
    } else if (colorType === 0 || colorType === 4) {
      const raw = sample(row, rowStart, x * channels);
      r = g = bl = Math.round(raw * scale);
      if (colorType === 4) a = sample(row, rowStart, x * channels + 1);
      else if (trnsGray >= 0 && depth <= 8 && raw === (trns![1] & maxVal)) a = 0;
    } else {
      r = sample(row, rowStart, x * channels);
      g = sample(row, rowStart, x * channels + 1);
      bl = sample(row, rowStart, x * channels + 2);
      if (colorType === 6) a = sample(row, rowStart, x * channels + 3);
    }
    out[dst] = r;
    out[dst + 1] = g;
    out[dst + 2] = bl;
    out[dst + 3] = a;
  };

  if (!interlace) {
    const rowBytes = Math.ceil((width * channels * depth) / 8);
    const { pixels } = unfilter(data, 0, width, height, bpp, rowBytes);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) writePixel(pixels, y * rowBytes, x, (y * width + x) * 4);
  } else {
    let offset = 0;
    for (const [x0, y0, dx, dy] of ADAM7) {
      const pw = Math.ceil((width - x0) / dx);
      const ph = Math.ceil((height - y0) / dy);
      if (pw <= 0 || ph <= 0) continue;
      const rowBytes = Math.ceil((pw * channels * depth) / 8);
      const { pixels, next } = unfilter(data, offset, pw, ph, bpp, rowBytes);
      offset = next;
      for (let y = 0; y < ph; y++)
        for (let x = 0; x < pw; x++) writePixel(pixels, y * rowBytes, x, ((y0 + y * dy) * width + x0 + x * dx) * 4);
    }
  }
  return { width, height, data: out };
}

/** Ancillary chunks worth carrying over when a PNG is re-encoded. */
const KEEP = new Set(['iCCP', 'sRGB', 'gAMA', 'cHRM', 'pHYs', 'tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

/** Encodes RGBA pixels as an 8-bit RGBA PNG, optionally copying metadata chunks from `source`. */
export function encodePng(r: Raster, source?: Uint8Array): Uint8Array {
  const { width, height, data } = r;
  const rowBytes = width * 4;
  const filtered = new Uint8Array((rowBytes + 1) * height);
  const candidates = Array.from({ length: 5 }, () => new Uint8Array(rowBytes));
  for (let y = 0; y < height; y++) {
    const row = y * rowBytes;
    let best = 0;
    let bestScore = Infinity;
    for (let type = 0; type < 5; type++) {
      const c = candidates[type];
      let score = 0;
      for (let x = 0; x < rowBytes; x++) {
        const v = data[row + x];
        const a = x >= 4 ? data[row + x - 4] : 0;
        const b = y > 0 ? data[row - rowBytes + x] : 0;
        const cc = y > 0 && x >= 4 ? data[row - rowBytes + x - 4] : 0;
        const f = type === 0 ? v : type === 1 ? v - a : type === 2 ? v - b : type === 3 ? v - ((a + b) >> 1) : v - paeth(a, b, cc);
        c[x] = f & 0xff;
        score += c[x] < 128 ? c[x] : 256 - c[x];
      }
      if (score < bestScore) {
        bestScore = score;
        best = type;
      }
    }
    filtered[y * (rowBytes + 1)] = best;
    filtered.set(candidates[best], y * (rowBytes + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const extra = source ? pngChunks(source).filter((c) => KEEP.has(c.type)).map((c) => makeChunk(c.type, c.data)) : [];
  return concat([
    PNG_SIGNATURE,
    makeChunk('IHDR', ihdr),
    ...extra,
    makeChunk('IDAT', zlibSync(filtered, { level: 6 })),
    makeChunk('IEND', new Uint8Array(0)),
  ]);
}
