/**
 * Machine-readable marking of AI-generated text.
 *
 * A compact payload is encoded as invisible Unicode variation selectors (one
 * selector per byte) behind an INVISIBLE SEPARATOR anchor (U+2063). The marker
 * is repeated after every paragraph so that a partial copy keeps it. It survives
 * copy/paste in browsers, editors and chat apps, but not aggressive
 * normalisation — pair it with a visible label and HTML metadata.
 *
 * Format "fgt1": "F" "G" version flags id(4 bytes) crc8 → 9 bytes.
 */
import { payloadIdFrom } from '../watermark/watermark.ts';

export interface TextMarkPayload {
  aiGenerated: boolean;
  aiModified?: boolean;
  id: number;
}

const ANCHOR = '⁣';
const VERSION = 1;

function byteToSelector(b: number): string {
  return b < 16 ? String.fromCodePoint(0xfe00 + b) : String.fromCodePoint(0xe0100 + b - 16);
}

function selectorToByte(cp: number): number | undefined {
  if (cp >= 0xfe00 && cp <= 0xfe0f) return cp - 0xfe00;
  if (cp >= 0xe0100 && cp <= 0xe01ef) return cp - 0xe0100 + 16;
  return undefined;
}

function crc8(bytes: number[]): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

export function encodeTextMarker(p: TextMarkPayload): string {
  const id = p.id >>> 0;
  const bytes = [0x46, 0x47, VERSION, (p.aiGenerated ? 1 : 0) | (p.aiModified ? 2 : 0), id >>> 24, (id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff];
  bytes.push(crc8(bytes));
  return ANCHOR + bytes.map(byteToSelector).join('');
}

const MARKER_RE = /⁣((?:[︀-️]|\uDB40[\uDD00-\uDDEF])+)/g;

function decodeMarker(selectors: string): TextMarkPayload | undefined {
  const bytes: number[] = [];
  for (const ch of selectors) {
    const b = selectorToByte(ch.codePointAt(0)!);
    if (b === undefined) return undefined;
    bytes.push(b);
  }
  if (bytes.length !== 9 || bytes[0] !== 0x46 || bytes[1] !== 0x47 || bytes[2] !== VERSION) return undefined;
  if (crc8(bytes.slice(0, 8)) !== bytes[8]) return undefined;
  const id = ((bytes[4] << 24) >>> 0) + (bytes[5] << 16) + (bytes[6] << 8) + bytes[7];
  return { aiGenerated: !!(bytes[3] & 1), aiModified: !!(bytes[3] & 2), id };
}

export interface MarkTextOptions {
  involvement?: 'generated' | 'modified';
  /** 32-bit id, or any string (hashed). Defaults to a hash of the text. */
  id?: number | string;
  /** Where to place markers (default: after every paragraph). */
  placement?: 'paragraphs' | 'end';
}

/** Returns the text with invisible AI markers (existing markers are replaced). */
export function markText(text: string, o: MarkTextOptions = {}): string {
  const clean = stripTextMarks(text);
  const id = typeof o.id === 'number' ? o.id : payloadIdFrom(o.id ?? clean);
  const marker = encodeTextMarker({ aiGenerated: o.involvement !== 'modified', aiModified: o.involvement === 'modified', id });
  const withBreaks = o.placement === 'end' ? clean : clean.replace(/(\S)([ \t]*\r?\n[ \t]*\r?\n)/g, `$1${marker}$2`);
  // Always mark the end of the text, before any trailing whitespace.
  const tail = /\s*$/.exec(withBreaks)!.index;
  return withBreaks.slice(0, tail) + marker + withBreaks.slice(tail);
}

export interface ReadTextResult {
  detected: boolean;
  payload?: TextMarkPayload;
  /** Number of valid markers found. */
  markers: number;
  /** The text without markers. */
  text: string;
}

export function readText(text: string): ReadTextResult {
  let payload: TextMarkPayload | undefined;
  let markers = 0;
  for (const m of text.matchAll(MARKER_RE)) {
    const p = decodeMarker(m[1]);
    if (p) {
      markers++;
      payload ??= p;
    }
  }
  return { detected: markers > 0, payload, markers, text: stripTextMarks(text) };
}

export function stripTextMarks(text: string): string {
  return text.replace(MARKER_RE, '');
}

/** HTML attributes to put on an element that wraps AI-generated text. */
export function aiTextAttributes(o: { involvement?: 'generated' | 'modified'; model?: string } = {}): Record<string, string> {
  const attrs: Record<string, string> = {
    'data-ai-generated': o.involvement === 'modified' ? 'modified' : 'true',
  };
  if (o.model) attrs['data-ai-model'] = o.model;
  return attrs;
}
