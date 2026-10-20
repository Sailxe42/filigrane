/**
 * WebP (RIFF) container support.
 *
 * - C2PA: a "C2PA" chunk appended after the image data, as the reference
 *   implementation does; the hard-binding exclusion covers its header and
 *   payload (not the RIFF padding byte).
 * - XMP: an "XMP " chunk. Metadata chunks require the extended format, so a
 *   simple VP8/VP8L file is converted by adding a VP8X header chunk.
 */
import { ascii, concat, textDecoder, textEncoder, toAscii } from '../util/bytes.ts';

export interface RiffChunk {
  id: string;
  /** Offset of the chunk header. */
  start: number;
  /** Offset after the payload and its padding byte. */
  end: number;
  data: Uint8Array;
}

const XMP_FLAG = 0x04;
const ALPHA_FLAG = 0x10;

export function isWebp(b: Uint8Array): boolean {
  return b.length >= 16 && toAscii(b, 0, 4) === 'RIFF' && toAscii(b, 8, 12) === 'WEBP';
}

function readU32LE(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

function u32LE(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

export function webpChunks(b: Uint8Array): RiffChunk[] {
  if (!isWebp(b)) throw new Error('Not a WebP file');
  const chunks: RiffChunk[] = [];
  const end = Math.min(b.length, readU32LE(b, 4) + 8);
  let o = 12;
  while (o + 8 <= end) {
    const size = readU32LE(b, o + 4);
    const payloadEnd = o + 8 + size;
    if (payloadEnd > end) throw new Error('Truncated WebP chunk');
    chunks.push({ id: toAscii(b, o, o + 4), start: o, end: Math.min(end, payloadEnd + (size & 1)), data: b.subarray(o + 8, payloadEnd) });
    o = payloadEnd + (size & 1);
  }
  return chunks;
}

function chunk(id: string, data: Uint8Array): Uint8Array {
  return concat([ascii(id), u32LE(data.length), data, data.length & 1 ? new Uint8Array(1) : new Uint8Array(0)]);
}

function riff(chunks: Uint8Array[]): Uint8Array {
  const body = concat([ascii('WEBP'), ...chunks]);
  return concat([ascii('RIFF'), u32LE(body.length), body]);
}

function raw(b: Uint8Array, c: RiffChunk): Uint8Array {
  return b.subarray(c.start, c.end);
}

export function stripWebpC2pa(b: Uint8Array): Uint8Array {
  return riff(webpChunks(b).filter((c) => c.id !== 'C2PA').map((c) => raw(b, c)));
}

export function insertWebpJumbf(b: Uint8Array, jumbf: Uint8Array): { bytes: Uint8Array; range: { start: number; length: number } } {
  const clean = stripWebpC2pa(b);
  const bytes = riff([...webpChunks(clean).map((c) => raw(clean, c)), chunk('C2PA', jumbf)]);
  return { bytes, range: { start: clean.length, length: 8 + jumbf.length } };
}

export function readWebpJumbf(b: Uint8Array): { store: Uint8Array; ranges: { start: number; end: number }[] } | undefined {
  const c = webpChunks(b).find((x) => x.id === 'C2PA');
  return c && { store: c.data.slice(), ranges: [{ start: c.start, end: c.start + 8 + c.data.length }] };
}

export function readWebpXmp(b: Uint8Array): string | undefined {
  const c = webpChunks(b).find((x) => x.id === 'XMP ');
  return c && textDecoder.decode(c.data);
}

/** Canvas size and alpha usage from a simple-format image chunk. */
function imageInfo(chunks: RiffChunk[]): { width: number; height: number; alpha: boolean } {
  const vp8l = chunks.find((c) => c.id === 'VP8L');
  if (vp8l) {
    const d = vp8l.data;
    const bits = d[1] | (d[2] << 8) | (d[3] << 16) | (d[4] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: ((bits >>> 28) & 1) === 1 };
  }
  const vp8 = chunks.find((c) => c.id === 'VP8 ');
  if (vp8) {
    const d = vp8.data;
    if (d[3] !== 0x9d || d[4] !== 0x01 || d[5] !== 0x2a) throw new Error('Invalid VP8 frame header');
    return { width: (d[6] | (d[7] << 8)) & 0x3fff, height: (d[8] | (d[9] << 8)) & 0x3fff, alpha: chunks.some((c) => c.id === 'ALPH') };
  }
  throw new Error('WebP without image data');
}

function vp8x(flags: number, width: number, height: number): Uint8Array {
  const d = new Uint8Array(10);
  d[0] = flags;
  const w = width - 1;
  const h = height - 1;
  d.set([w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff, h & 0xff, (h >>> 8) & 0xff, (h >>> 16) & 0xff], 4);
  return chunk('VP8X', d);
}

/** Replaces (or adds) the XMP chunk, converting to the extended format when needed. */
export function writeWebpXmp(b: Uint8Array, xmp: string): Uint8Array {
  const chunks = webpChunks(b).filter((c) => c.id !== 'XMP ' && c.id !== 'C2PA');
  const parts: Uint8Array[] = [];
  const ext = chunks.find((c) => c.id === 'VP8X');
  if (ext) {
    const data = ext.data.slice();
    data[0] |= XMP_FLAG;
    parts.push(chunk('VP8X', data));
  } else {
    const info = imageInfo(chunks);
    parts.push(vp8x(XMP_FLAG | (info.alpha ? ALPHA_FLAG : 0), info.width, info.height));
  }
  for (const c of chunks) if (c.id !== 'VP8X') parts.push(raw(b, c));
  parts.push(chunk('XMP ', textEncoder.encode(xmp)));
  return riff(parts);
}
