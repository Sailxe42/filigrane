/**
 * PNG container support: C2PA stores live in a "caBX" chunk placed before the
 * first IDAT; XMP lives in an iTXt chunk with the "XML:com.adobe.xmp" keyword.
 */
import { ascii, concat, readU32, textDecoder, textEncoder, toAscii, u32 } from '../util/bytes.ts';
import { crc32 } from '../util/crc32.ts';

export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const C2PA_CHUNK = 'caBX';
const XMP_KEYWORD = 'XML:com.adobe.xmp';

export interface PngChunk {
  type: string;
  /** Offset of the length field. */
  start: number;
  /** Offset just after the CRC. */
  end: number;
  data: Uint8Array;
}

export function isPng(b: Uint8Array): boolean {
  if (b.length < 8) return false;
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIGNATURE[i]) return false;
  return true;
}

export function pngChunks(b: Uint8Array): PngChunk[] {
  if (!isPng(b)) throw new Error('Not a PNG file');
  const chunks: PngChunk[] = [];
  let o = 8;
  while (o + 12 <= b.length) {
    const len = readU32(b, o);
    const type = toAscii(b, o + 4, o + 8);
    const end = o + 12 + len;
    if (end > b.length) throw new Error(`Truncated PNG chunk ${type}`);
    chunks.push({ type, start: o, end, data: b.subarray(o + 8, o + 8 + len) });
    o = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

export function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = ascii(type);
  return concat([u32(data.length), typeBytes, data, u32(crc32(concat([typeBytes, data])))]);
}

function rebuild(b: Uint8Array, keep: (c: PngChunk) => boolean): Uint8Array {
  const parts: Uint8Array[] = [PNG_SIGNATURE];
  for (const c of pngChunks(b)) if (keep(c)) parts.push(b.subarray(c.start, c.end));
  return concat(parts);
}

export function stripPngC2pa(b: Uint8Array): Uint8Array {
  return rebuild(b, (c) => c.type !== C2PA_CHUNK);
}

/** Offset right after IHDR (and before any IDAT), where metadata chunks go. */
function afterHeader(b: Uint8Array): number {
  const ihdr = pngChunks(b).find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('PNG without IHDR');
  return ihdr.end;
}

export function insertPngJumbf(b: Uint8Array, jumbf: Uint8Array): { bytes: Uint8Array; range: { start: number; length: number } } {
  const clean = stripPngC2pa(b);
  const at = afterHeader(clean);
  const chunk = makeChunk(C2PA_CHUNK, jumbf);
  return { bytes: concat([clean.subarray(0, at), chunk, clean.subarray(at)]), range: { start: at, length: chunk.length } };
}

export function readPngJumbf(b: Uint8Array): { store: Uint8Array; ranges: { start: number; end: number }[] } | undefined {
  const c = pngChunks(b).find((x) => x.type === C2PA_CHUNK);
  return c && { store: c.data.slice(), ranges: [{ start: c.start, end: c.end }] };
}

function isXmpChunk(c: PngChunk): boolean {
  if (c.type !== 'iTXt') return false;
  return toAscii(c.data, 0, Math.min(c.data.length, XMP_KEYWORD.length)) === XMP_KEYWORD && c.data[XMP_KEYWORD.length] === 0;
}

export function readPngXmp(b: Uint8Array): string | undefined {
  const c = pngChunks(b).find(isXmpChunk);
  if (!c) return undefined;
  // keyword \0 compressionFlag compressionMethod languageTag \0 translatedKeyword \0 text
  let o = XMP_KEYWORD.length + 1;
  const compressed = c.data[o];
  o += 2;
  while (c.data[o] !== 0) o++;
  o++;
  while (c.data[o] !== 0) o++;
  o++;
  if (compressed) return undefined; // compressed XMP is not used by C2PA tools; ignore
  return textDecoder.decode(c.data.subarray(o));
}

export function writePngXmp(b: Uint8Array, xmp: string): Uint8Array {
  const clean = rebuild(b, (c) => !isXmpChunk(c));
  const data = concat([ascii(XMP_KEYWORD), new Uint8Array([0, 0, 0, 0, 0]), textEncoder.encode(xmp)]);
  const at = afterHeader(clean);
  return concat([clean.subarray(0, at), makeChunk('iTXt', data), clean.subarray(at)]);
}
