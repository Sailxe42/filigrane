/**
 * JUMBF (ISO/IEC 19566-5) box model.
 *
 * A C2PA manifest store is a tree of JUMBF superboxes ("jumb"), each starting
 * with a description box ("jumd") that carries a type UUID and a label, followed
 * by content boxes ("cbor", "json", "bfdb", "bidb", ...) or nested superboxes.
 */
import { ByteWriter, concat, readU32, readU64, textDecoder, textEncoder, toAscii, ascii, u32 } from '../util/bytes.ts';

export interface JumbfDescription {
  /** 16-byte type UUID. */
  uuid: Uint8Array;
  /** Toggle bits: 1 = requestable, 2 = label present, 4 = id present, 8 = signature present, 16 = private box. */
  toggles: number;
  label?: string;
  id?: number;
  signature?: Uint8Array;
  /** Raw private box (including its header), when present. */
  privateBox?: Uint8Array;
}

export interface ContentBox {
  kind: 'content';
  /** Four-character box type, e.g. "cbor". */
  type: string;
  /** Box payload (without the 8-byte header). */
  data: Uint8Array;
}

export interface SuperBox {
  kind: 'super';
  desc: JumbfDescription;
  children: JumbfNode[];
  /** Byte range of the whole superbox inside the buffer it was parsed from. */
  range?: { start: number; end: number; payloadStart: number };
  /** Original payload bytes of a parsed superbox (hashes are computed over these). */
  raw?: Uint8Array;
}

const MAX_DEPTH = 32;

export type JumbfNode = SuperBox | ContentBox;

export const TOGGLE_REQUESTABLE = 0x01;
export const TOGGLE_LABEL = 0x02;
export const TOGGLE_ID = 0x04;
export const TOGGLE_SIGNATURE = 0x08;
export const TOGGLE_PRIVATE = 0x10;

interface RawBox {
  type: string;
  start: number;
  payloadStart: number;
  end: number;
}

function readBoxes(b: Uint8Array, start: number, end: number): RawBox[] {
  const boxes: RawBox[] = [];
  let o = start;
  while (o + 8 <= end) {
    let size = readU32(b, o);
    const type = toAscii(b, o + 4, o + 8);
    let header = 8;
    if (size === 1) {
      if (o + 16 > end) throw new Error('Truncated JUMBF extended box header');
      size = readU64(b, o + 8);
      header = 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < header || o + size > end) throw new Error(`Invalid JUMBF box size for "${type}"`);
    boxes.push({ type, start: o, payloadStart: o + header, end: o + size });
    o += size;
  }
  return boxes;
}

function parseDescription(b: Uint8Array, start: number, end: number): JumbfDescription {
  if (end - start < 17) throw new Error('JUMBF description box too short');
  const uuid = b.slice(start, start + 16);
  const toggles = b[start + 16];
  let o = start + 17;
  const desc: JumbfDescription = { uuid, toggles };
  if (toggles & TOGGLE_LABEL) {
    let z = o;
    while (z < end && b[z] !== 0) z++;
    desc.label = textDecoder.decode(b.subarray(o, z));
    o = z + 1;
  }
  if (toggles & TOGGLE_ID) {
    if (o + 4 > end) throw new Error('Truncated JUMBF description box');
    desc.id = readU32(b, o);
    o += 4;
  }
  if (toggles & TOGGLE_SIGNATURE) {
    desc.signature = b.slice(o, o + 32);
    o += 32;
  }
  if (toggles & TOGGLE_PRIVATE && o < end) {
    desc.privateBox = b.slice(o, end);
  }
  return desc;
}

function parseSuper(b: Uint8Array, box: RawBox, depth = 0): SuperBox {
  if (depth > MAX_DEPTH) throw new Error('JUMBF nesting too deep');
  const inner = readBoxes(b, box.payloadStart, box.end);
  if (!inner.length || inner[0].type !== 'jumd') throw new Error('JUMBF superbox without description box');
  const desc = parseDescription(b, inner[0].payloadStart, inner[0].end);
  const children: JumbfNode[] = inner.slice(1).map((c) =>
    c.type === 'jumb' ? parseSuper(b, c, depth + 1) : { kind: 'content', type: c.type, data: b.slice(c.payloadStart, c.end) },
  );
  return {
    kind: 'super',
    desc,
    children,
    range: { start: box.start, end: box.end, payloadStart: box.payloadStart },
    raw: b.subarray(box.payloadStart, box.end),
  };
}

/** Parses a buffer that starts with a JUMBF superbox (e.g. a C2PA manifest store). */
export function parseJumbf(b: Uint8Array): SuperBox {
  const boxes = readBoxes(b, 0, b.length);
  if (!boxes.length || boxes[0].type !== 'jumb') throw new Error('Not a JUMBF superbox');
  return parseSuper(b, boxes[0]);
}

function boxBytes(type: string, payload: Uint8Array): Uint8Array {
  const size = payload.length + 8;
  if (size > 0xffffffff) throw new Error('JUMBF box too large');
  return concat([u32(size), ascii(type), payload]);
}

export function serializeDescription(d: JumbfDescription): Uint8Array {
  const w = new ByteWriter();
  w.bytes(d.uuid);
  let toggles = d.toggles;
  if (d.label !== undefined) toggles |= TOGGLE_LABEL;
  if (d.id !== undefined) toggles |= TOGGLE_ID;
  if (d.signature) toggles |= TOGGLE_SIGNATURE;
  w.byte(toggles);
  if (d.label !== undefined) w.bytes(textEncoder.encode(d.label)).byte(0);
  if (d.id !== undefined) w.u32(d.id);
  if (d.signature) w.bytes(d.signature);
  if (d.privateBox) w.bytes(d.privateBox);
  return boxBytes('jumd', w.finish());
}

/** Serialises a superbox; returns the bytes of the complete "jumb" box. */
export function serializeJumbf(node: SuperBox): Uint8Array {
  const parts = [serializeDescription(node.desc)];
  for (const child of node.children) {
    parts.push(child.kind === 'super' ? serializeJumbf(child) : boxBytes(child.type, child.data));
  }
  return boxBytes('jumb', concat(parts));
}

/**
 * Payload of a superbox (description box + children), i.e. the box without its header.
 * Parsed boxes return their original bytes, so hashes match exactly what was signed.
 */
export function superboxPayload(node: SuperBox): Uint8Array {
  return node.raw ?? serializeJumbf(node).subarray(8);
}

export function findChild(node: SuperBox, label: string): SuperBox | undefined {
  return node.children.find((c): c is SuperBox => c.kind === 'super' && c.desc.label === label);
}

export function contentOf(node: SuperBox, type?: string): ContentBox | undefined {
  return node.children.find((c): c is ContentBox => c.kind === 'content' && (!type || c.type === type));
}

/** Parses a textual UUID ("6332706d-0011-0010-8000-00aa00389b71") into 16 bytes. */
export function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function uuidString(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 16; i++) {
    s += b[i].toString(16).padStart(2, '0');
    if (i === 3 || i === 5 || i === 7 || i === 9) s += '-';
  }
  return s;
}
