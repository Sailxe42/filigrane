/**
 * JPEG container support.
 *
 * C2PA manifests live in APP11 segments using the JPEG XT box format
 * (ISO/IEC 18477-3): each segment carries `CI ("JP") | En | Z | box data`,
 * and continuation segments repeat the JUMBF box header.
 * XMP lives in an APP1 segment prefixed with the Adobe XMP namespace.
 */
import { ascii, concat, readU16, readU32, textDecoder, textEncoder, u16, u32 } from '../util/bytes.ts';

export interface JpegSegment {
  marker: number;
  /** Offset of the 0xFF marker byte. */
  start: number;
  /** Offset just after the segment. */
  end: number;
  /** Offset of the segment payload (after the length field). */
  dataStart: number;
}

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;
const APP1 = 0xe1;
const APP11 = 0xeb;
const XMP_NS = 'http://ns.adobe.com/xap/1.0/\0';
const MAX_SEGMENT_PAYLOAD = 0xffff - 2;

export function isJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === SOI && b[2] === 0xff;
}

/** Lists the header segments up to (and including) SOS. */
export function jpegSegments(b: Uint8Array): JpegSegment[] {
  if (!isJpeg(b)) throw new Error('Not a JPEG file');
  const segs: JpegSegment[] = [];
  let o = 2;
  while (o < b.length) {
    if (b[o] !== 0xff) throw new Error(`Invalid JPEG marker at offset ${o}`);
    while (b[o] === 0xff) o++; // fill bytes
    if (o >= b.length) throw new Error('Truncated JPEG marker');
    const marker = b[o];
    const start = o - 1;
    o++;
    if (marker === EOI) break;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      segs.push({ marker, start, end: o, dataStart: o });
      continue;
    }
    if (o + 2 > b.length) throw new Error('Truncated JPEG segment');
    const len = readU16(b, o);
    if (len < 2 || o + len > b.length) throw new Error('Truncated JPEG segment');
    segs.push({ marker, start, end: o + len, dataStart: o + 2 });
    o += len;
    if (marker === SOS) break;
  }
  return segs;
}

interface JumbfPiece {
  seg: JpegSegment;
  en: number;
  z: number;
  /** Offset where this piece's box data begins. */
  boxStart: number;
}

function app11Pieces(b: Uint8Array): JumbfPiece[] {
  const pieces: JumbfPiece[] = [];
  for (const seg of jpegSegments(b)) {
    if (seg.marker !== APP11) continue;
    const d = seg.dataStart;
    if (seg.end - d < 8 || b[d] !== 0x4a || b[d + 1] !== 0x50) continue;
    pieces.push({ seg, en: readU16(b, d + 2), z: readU32(b, d + 4), boxStart: d + 8 });
  }
  return pieces;
}

function boxHeaderLength(b: Uint8Array, at: number): number {
  return readU32(b, at) === 1 ? 16 : 8;
}

export interface EmbeddedJumbf {
  /** The reassembled JUMBF superbox. */
  jumbf: Uint8Array;
  /** File byte ranges occupied by the segments that carry it. */
  ranges: { start: number; end: number }[];
}

/** Returns every JUMBF superbox stored in APP11, keyed by its box type label check later. */
export function readJpegJumbf(b: Uint8Array): EmbeddedJumbf[] {
  const groups = new Map<number, JumbfPiece[]>();
  for (const p of app11Pieces(b)) {
    const list = groups.get(p.en) ?? [];
    list.push(p);
    groups.set(p.en, list);
  }
  const out: EmbeddedJumbf[] = [];
  for (const pieces of groups.values()) {
    pieces.sort((x, y) => x.z - y.z);
    const parts: Uint8Array[] = [];
    pieces.forEach((p, i) => {
      const skip = i === 0 ? 0 : boxHeaderLength(b, p.boxStart);
      parts.push(b.subarray(p.boxStart + skip, p.seg.end));
    });
    out.push({ jumbf: concat(parts), ranges: pieces.map((p) => ({ start: p.seg.start, end: p.seg.end })) });
  }
  return out;
}

/** Builds the APP11 segments that carry a JUMBF superbox. */
export function jumbfSegments(jumbf: Uint8Array, boxInstance = 1): Uint8Array[] {
  const header = jumbf.subarray(0, boxHeaderLength(jumbf, 0));
  const segments: Uint8Array[] = [];
  let offset = 0;
  let z = 1;
  while (offset < jumbf.length) {
    const prefix = z === 1 ? new Uint8Array(0) : header;
    const room = MAX_SEGMENT_PAYLOAD - 8 - prefix.length;
    const chunk = jumbf.subarray(offset, offset + room);
    const payload = concat([ascii('JP'), u16(boxInstance), u32(z), prefix, chunk]);
    segments.push(concat([new Uint8Array([0xff, APP11]), u16(payload.length + 2), payload]));
    offset += chunk.length;
    z++;
  }
  return segments;
}

/** Removes all segments matching the predicate. */
function removeSegments(b: Uint8Array, drop: (seg: JpegSegment) => boolean): Uint8Array {
  const segs = jpegSegments(b);
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let last = 2;
  for (const seg of segs) {
    if (drop(seg)) {
      parts.push(b.subarray(last, seg.start));
      last = seg.end;
    }
  }
  parts.push(b.subarray(last));
  return concat(parts);
}

function isXmpSegment(b: Uint8Array, seg: JpegSegment): boolean {
  if (seg.marker !== APP1) return false;
  const ns = textEncoder.encode(XMP_NS);
  if (seg.end - seg.dataStart < ns.length) return false;
  for (let i = 0; i < ns.length; i++) if (b[seg.dataStart + i] !== ns[i]) return false;
  return true;
}

/** Removes C2PA (APP11 "JP" + JUMBF) segments. */
export function stripJpegC2pa(b: Uint8Array): Uint8Array {
  return removeSegments(b, (seg) => seg.marker === APP11 && b[seg.dataStart] === 0x4a && b[seg.dataStart + 1] === 0x50);
}

/**
 * Offset where new metadata segments should go: after SOI and any APP0 (JFIF)
 * or APP1 (Exif/XMP) segments, so readers that expect them first still work.
 */
function metadataInsertOffset(b: Uint8Array): number {
  let at = 2;
  for (const seg of jpegSegments(b)) {
    if (seg.marker === 0xe0 || seg.marker === APP1) at = seg.end;
    else break;
  }
  return at;
}

/** Inserts a JUMBF manifest store; returns the new file and the byte range of the inserted segments. */
export function insertJpegJumbf(b: Uint8Array, jumbf: Uint8Array): { bytes: Uint8Array; range: { start: number; length: number } } {
  const clean = stripJpegC2pa(b);
  const at = metadataInsertOffset(clean);
  const segs = concat(jumbfSegments(jumbf));
  return {
    bytes: concat([clean.subarray(0, at), segs, clean.subarray(at)]),
    range: { start: at, length: segs.length },
  };
}

export function readJpegXmp(b: Uint8Array): string | undefined {
  for (const seg of jpegSegments(b)) {
    if (isXmpSegment(b, seg)) return textDecoder.decode(b.subarray(seg.dataStart + XMP_NS.length, seg.end));
  }
  return undefined;
}

/** Replaces (or adds) the XMP packet. */
export function writeJpegXmp(b: Uint8Array, xmp: string): Uint8Array {
  const clean = removeSegments(b, (seg) => isXmpSegment(b, seg));
  const payload = concat([textEncoder.encode(XMP_NS), textEncoder.encode(xmp)]);
  if (payload.length > MAX_SEGMENT_PAYLOAD) throw new Error('XMP packet too large for a single APP1 segment');
  const seg = concat([new Uint8Array([0xff, APP1]), u16(payload.length + 2), payload]);
  // Place XMP after APP0/Exif but before anything else.
  let at = 2;
  for (const s of jpegSegments(clean)) {
    if (s.marker === 0xe0 || (s.marker === APP1 && !isXmpSegment(clean, s))) at = s.end;
    else break;
  }
  return concat([clean.subarray(0, at), seg, clean.subarray(at)]);
}
