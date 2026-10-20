/**
 * Tiny DER (ASN.1 Distinguished Encoding Rules) encoder and parser, enough to
 * build and read X.509 certificates and ECDSA signatures.
 */
import { concat, textDecoder, textEncoder } from '../util/bytes.ts';

export interface Asn1Node {
  tag: number;
  /** Full TLV bytes. */
  raw: Uint8Array;
  /** Value bytes. */
  value: Uint8Array;
  /** Parsed children for constructed types. */
  children: Asn1Node[];
}

// ---------------------------------------------------------------- encoding

function encodeLength(n: number): Uint8Array {
  if (n < 0x80) return new Uint8Array([n]);
  const bytes: number[] = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

export function tlv(tag: number, value: Uint8Array): Uint8Array {
  return concat([new Uint8Array([tag]), encodeLength(value.length), value]);
}

export const seq = (...items: Uint8Array[]) => tlv(0x30, concat(items));
export const set = (...items: Uint8Array[]) => tlv(0x31, concat(items));
export const octetString = (v: Uint8Array) => tlv(0x04, v);
export const bitString = (v: Uint8Array) => tlv(0x03, concat([new Uint8Array([0]), v]));
export const nullValue = () => new Uint8Array([0x05, 0x00]);
export const bool = (v: boolean) => tlv(0x01, new Uint8Array([v ? 0xff : 0x00]));
export const utf8String = (s: string) => tlv(0x0c, textEncoder.encode(s));
export const printableString = (s: string) => tlv(0x13, textEncoder.encode(s));
/** Context-specific constructed tag [n]. */
export const explicit = (n: number, inner: Uint8Array) => tlv(0xa0 | n, inner);

/** Unsigned big-endian integer (adds a leading zero when the high bit is set). */
export function integer(v: Uint8Array | number): Uint8Array {
  let bytes: Uint8Array;
  if (typeof v === 'number') {
    const arr: number[] = [];
    let n = v;
    do {
      arr.unshift(n & 0xff);
      n = Math.floor(n / 256);
    } while (n > 0);
    bytes = new Uint8Array(arr);
  } else {
    let i = 0;
    while (i < v.length - 1 && v[i] === 0) i++;
    bytes = v.subarray(i);
  }
  if (bytes[0] & 0x80) bytes = concat([new Uint8Array([0]), bytes]);
  return tlv(0x02, bytes);
}

export function oid(dotted: string): Uint8Array {
  const parts = dotted.split('.').map(Number);
  const out: number[] = [parts[0] * 40 + parts[1]];
  for (const p of parts.slice(2)) {
    const stack: number[] = [p & 0x7f];
    let n = Math.floor(p / 128);
    while (n > 0) {
      stack.unshift((n & 0x7f) | 0x80);
      n = Math.floor(n / 128);
    }
    out.push(...stack);
  }
  return tlv(0x06, new Uint8Array(out));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** UTCTime for years < 2050, GeneralizedTime otherwise (RFC 5280). */
export function time(d: Date): Uint8Array {
  const y = d.getUTCFullYear();
  const rest = `${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
  if (y < 2050) return tlv(0x17, textEncoder.encode(`${String(y % 100).padStart(2, '0')}${rest}`));
  return tlv(0x18, textEncoder.encode(`${y}${rest}`));
}

// ---------------------------------------------------------------- parsing

function parseAt(b: Uint8Array, o: number, end: number): { node: Asn1Node; next: number } {
  if (o + 2 > end) throw new Error('Truncated DER');
  const tag = b[o];
  let len = b[o + 1];
  let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('Unsupported DER length');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[o + 2 + i];
    hdr += n;
  }
  const vs = o + hdr;
  const ve = vs + len;
  if (ve > end) throw new Error('DER value exceeds buffer');
  const value = b.subarray(vs, ve);
  const constructed = (tag & 0x20) !== 0;
  const children: Asn1Node[] = [];
  if (constructed) {
    let p = vs;
    while (p < ve) {
      const r = parseAt(b, p, ve);
      children.push(r.node);
      p = r.next;
    }
  }
  return { node: { tag, raw: b.subarray(o, ve), value, children }, next: ve };
}

export function parseDer(b: Uint8Array): Asn1Node {
  return parseAt(b, 0, b.length).node;
}

export function parseChildren(value: Uint8Array): Asn1Node[] {
  const out: Asn1Node[] = [];
  let p = 0;
  while (p < value.length) {
    const r = parseAt(value, p, value.length);
    out.push(r.node);
    p = r.next;
  }
  return out;
}

export function oidToString(value: Uint8Array): string {
  const parts = [Math.floor(value[0] / 40), value[0] % 40];
  let n = 0;
  for (let i = 1; i < value.length; i++) {
    n = n * 128 + (value[i] & 0x7f);
    if (!(value[i] & 0x80)) {
      parts.push(n);
      n = 0;
    }
  }
  return parts.join('.');
}

export function decodeString(node: Asn1Node): string {
  return textDecoder.decode(node.value);
}

export function decodeTime(node: Asn1Node): Date {
  const s = textDecoder.decode(node.value);
  const m = node.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(s) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(s);
  if (!m) throw new Error(`Unsupported ASN.1 time ${s}`);
  let year = Number(m[1]);
  if (node.tag === 0x17) year += year < 50 ? 2000 : 1900;
  return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)));
}

// ---------------------------------------------------------------- ECDSA helpers

/** Converts a raw (IEEE P1363) r||s signature into a DER SEQUENCE { r, s }. */
export function rawEcdsaToDer(raw: Uint8Array): Uint8Array {
  const half = raw.length / 2;
  return seq(integer(raw.subarray(0, half)), integer(raw.subarray(half)));
}

/** Converts a DER ECDSA signature into raw r||s with fixed-size components. */
export function derEcdsaToRaw(der: Uint8Array, size = 32): Uint8Array {
  const node = parseDer(der);
  const out = new Uint8Array(size * 2);
  node.children.slice(0, 2).forEach((int, i) => {
    let v = int.value;
    while (v.length > size && v[0] === 0) v = v.subarray(1);
    out.set(v, i * size + (size - v.length));
  });
  return out;
}
