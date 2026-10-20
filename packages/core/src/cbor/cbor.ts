/**
 * Minimal CBOR (RFC 8949) encoder/decoder.
 *
 * C2PA stores claims, assertions and COSE signatures as CBOR. Only the subset
 * needed by C2PA is supported, but decoding is general enough to read
 * manifests produced by other tools (indefinite lengths, tags, floats).
 *
 * Mapping:
 *   number (safe integer) ↔ major type 0/1        Uint8Array ↔ byte string
 *   number (non-integer)  ↔ float64 (decodes f16/f32/f64)
 *   string ↔ text string     Array ↔ array       boolean/null/undefined ↔ simple
 *   plain object ↔ map with text keys (insertion order is preserved)
 *   Map ↔ map with arbitrary keys (used for COSE integer labels)
 *   Tagged ↔ tag
 */
import { ByteWriter, textDecoder, textEncoder } from '../util/bytes.ts';

export class Tagged {
  readonly tag: number;
  readonly value: unknown;
  constructor(tag: number, value: unknown) {
    this.tag = tag;
    this.value = value;
  }
}

export type CborValue = unknown;

function writeHead(w: ByteWriter, major: number, n: number): void {
  const m = major << 5;
  if (n < 24) w.byte(m | n);
  else if (n < 0x100) w.byte(m | 24).byte(n);
  else if (n < 0x10000) w.byte(m | 25).u16(n);
  else if (n < 0x100000000) w.byte(m | 26).u32(n);
  else {
    w.byte(m | 27);
    w.u32(Math.floor(n / 2 ** 32));
    w.u32(n >>> 0);
  }
}

function encodeInto(w: ByteWriter, v: CborValue): void {
  if (v === null) {
    w.byte(0xf6);
  } else if (v === undefined) {
    w.byte(0xf7);
  } else if (v === false) {
    w.byte(0xf4);
  } else if (v === true) {
    w.byte(0xf5);
  } else if (typeof v === 'number') {
    if (Number.isSafeInteger(v)) {
      if (v >= 0) writeHead(w, 0, v);
      else writeHead(w, 1, -1 - v);
    } else {
      const buf = new DataView(new ArrayBuffer(8));
      buf.setFloat64(0, v);
      w.byte(0xfb).bytes(new Uint8Array(buf.buffer));
    }
  } else if (typeof v === 'string') {
    const b = textEncoder.encode(v);
    writeHead(w, 3, b.length);
    w.bytes(b);
  } else if (v instanceof Uint8Array) {
    writeHead(w, 2, v.length);
    w.bytes(v);
  } else if (Array.isArray(v)) {
    writeHead(w, 4, v.length);
    for (const item of v) encodeInto(w, item);
  } else if (v instanceof Tagged) {
    writeHead(w, 6, v.tag);
    encodeInto(w, v.value);
  } else if (v instanceof Map) {
    writeHead(w, 5, v.size);
    for (const [k, val] of v) {
      encodeInto(w, k);
      encodeInto(w, val);
    }
  } else if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, val]) => val !== undefined);
    writeHead(w, 5, entries.length);
    for (const [k, val] of entries) {
      encodeInto(w, k);
      encodeInto(w, val);
    }
  } else {
    throw new TypeError(`Cannot CBOR-encode value of type ${typeof v}`);
  }
}

export function encodeCbor(v: CborValue): Uint8Array {
  const w = new ByteWriter();
  encodeInto(w, v);
  return w.finish();
}

class Decoder {
  private o = 0;
  private readonly b: Uint8Array;
  private readonly view: DataView;
  constructor(b: Uint8Array) {
    this.b = b;
    this.view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }

  get offset(): number {
    return this.o;
  }

  private need(n: number): void {
    if (this.o + n > this.b.length) throw new RangeError('Unexpected end of CBOR data');
  }

  private readArg(info: number): number {
    if (info < 24) return info;
    if (info === 24) {
      this.need(1);
      return this.b[this.o++];
    }
    if (info === 25) {
      this.need(2);
      const v = this.view.getUint16(this.o);
      this.o += 2;
      return v;
    }
    if (info === 26) {
      this.need(4);
      const v = this.view.getUint32(this.o);
      this.o += 4;
      return v;
    }
    if (info === 27) {
      this.need(8);
      const hi = this.view.getUint32(this.o);
      const lo = this.view.getUint32(this.o + 4);
      this.o += 8;
      const v = hi * 2 ** 32 + lo;
      if (!Number.isSafeInteger(v)) throw new RangeError('CBOR integer exceeds 2^53');
      return v;
    }
    throw new Error(`Unsupported CBOR additional info ${info}`);
  }

  private chunks(major: number): Uint8Array {
    const parts: Uint8Array[] = [];
    for (;;) {
      this.need(1);
      if (this.b[this.o] === 0xff) {
        this.o++;
        break;
      }
      const head = this.b[this.o++];
      if (head >> 5 !== major) throw new Error('Invalid indefinite-length string chunk');
      const len = this.readArg(head & 31);
      this.need(len);
      parts.push(this.b.subarray(this.o, this.o + len));
      this.o += len;
    }
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }

  decode(depth = 0): CborValue {
    if (depth > 64) throw new Error('CBOR nesting too deep');
    this.need(1);
    const head = this.b[this.o++];
    const major = head >> 5;
    const info = head & 31;

    switch (major) {
      case 0:
        return this.readArg(info);
      case 1:
        return -1 - this.readArg(info);
      case 2:
      case 3: {
        let bytes: Uint8Array;
        if (info === 31) bytes = this.chunks(major);
        else {
          const len = this.readArg(info);
          this.need(len);
          bytes = this.b.slice(this.o, this.o + len);
          this.o += len;
        }
        return major === 2 ? bytes : textDecoder.decode(bytes);
      }
      case 4: {
        const arr: CborValue[] = [];
        if (info === 31) {
          while (this.b[this.o] !== 0xff) arr.push(this.decode(depth + 1));
          this.o++;
        } else {
          const len = this.readArg(info);
          for (let i = 0; i < len; i++) arr.push(this.decode(depth + 1));
        }
        return arr;
      }
      case 5: {
        const entries: [CborValue, CborValue][] = [];
        const indefinite = info === 31;
        const len = indefinite ? Infinity : this.readArg(info);
        for (let i = 0; i < len; i++) {
          if (indefinite && this.b[this.o] === 0xff) {
            this.o++;
            break;
          }
          entries.push([this.decode(depth + 1), this.decode(depth + 1)]);
        }
        if (entries.every(([k]) => typeof k === 'string')) {
          const obj: Record<string, CborValue> = {};
          // defineProperty: a "__proto__" key must stay a plain property, never replace the prototype.
          for (const [k, v] of entries) Object.defineProperty(obj, k as string, { value: v, enumerable: true, writable: true, configurable: true });
          return obj;
        }
        return new Map(entries);
      }
      case 6:
        return new Tagged(this.readArg(info), this.decode(depth + 1));
      default: {
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        if (info === 23) return undefined;
        if (info === 25) {
          this.need(2);
          const v = halfToFloat(this.view.getUint16(this.o));
          this.o += 2;
          return v;
        }
        if (info === 26) {
          this.need(4);
          const v = this.view.getFloat32(this.o);
          this.o += 4;
          return v;
        }
        if (info === 27) {
          this.need(8);
          const v = this.view.getFloat64(this.o);
          this.o += 8;
          return v;
        }
        if (info < 24) return { simple: info };
        throw new Error(`Unsupported CBOR simple value ${info}`);
      }
    }
  }
}

function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

export function decodeCbor(b: Uint8Array): CborValue {
  const d = new Decoder(b);
  const v = d.decode();
  if (d.offset !== b.length) throw new Error(`Trailing bytes after CBOR value (${b.length - d.offset})`);
  return v;
}

/** Decodes a CBOR value and also returns how many bytes it used (for embedded streams). */
export function decodeCborPrefix(b: Uint8Array): { value: CborValue; length: number } {
  const d = new Decoder(b);
  const value = d.decode();
  return { value, length: d.offset };
}
