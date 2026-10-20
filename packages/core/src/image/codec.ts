/**
 * Decoding and encoding of image formats to and from RGBA rasters.
 *
 * JPEG and PNG are built in (pure JavaScript). Other formats — WebP today —
 * need a codec registered with `registerImageCodec()`: `createCanvasCodec()`
 * in browsers, or `createSharpCodec(sharp)` in Node.js.
 */
import jpeg from 'jpeg-js';
import { concat } from '../util/bytes.ts';
import { isJpeg, jpegSegments } from '../containers/jpeg.ts';
import { isPng } from '../containers/png.ts';
import { isWebp } from '../containers/webp.ts';
import { decodePng, encodePng } from './png-codec.ts';
import type { Raster } from './raster.ts';

export type ImageFormat = 'jpeg' | 'png' | 'webp';

export interface EncodeOptions {
  /** Lossy quality, 1-100 (default 92). */
  quality?: number;
  /** Original file whose metadata (Exif, ICC profile, text chunks) should be preserved. */
  source?: Uint8Array;
}

/** A pluggable decoder/encoder for one image format. */
export interface ImageCodec {
  decode(bytes: Uint8Array): Raster | Promise<Raster>;
  encode(raster: Raster, options: EncodeOptions): Uint8Array | Promise<Uint8Array>;
}

export function detectFormat(b: Uint8Array): ImageFormat | undefined {
  if (isJpeg(b)) return 'jpeg';
  if (isPng(b)) return 'png';
  if (isWebp(b)) return 'webp';
  return undefined;
}

const codecs = new Map<ImageFormat, ImageCodec>();

/** Registers (or replaces) the codec used for a format. */
export function registerImageCodec(format: ImageFormat, codec: ImageCodec): void {
  codecs.set(format, codec);
}

/** True when pixels of this format can be decoded and encoded. */
export function canProcessPixels(format: ImageFormat): boolean {
  return format === 'jpeg' || format === 'png' || codecs.has(format);
}

/** Synchronous decoding of the built-in formats (JPEG, PNG). */
export function decodeImage(b: Uint8Array): Raster {
  if (isJpeg(b)) {
    const img = jpeg.decode(b, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 200, maxMemoryUsageInMB: 2048 });
    return { width: img.width, height: img.height, data: img.data };
  }
  if (isPng(b)) return decodePng(b);
  throw new Error('Unsupported image format for synchronous decoding: JPEG and PNG are supported');
}

/** APP segments carried over when a JPEG is re-encoded: Exif (APP1), ICC (APP2), IPTC (APP13), Adobe (APP14). */
function metadataSegments(source: Uint8Array): Uint8Array[] {
  return jpegSegments(source)
    .filter((s) => s.marker === 0xe1 || s.marker === 0xe2 || s.marker === 0xed || s.marker === 0xee)
    .map((s) => source.subarray(s.start, s.end));
}

/**
 * jpeg-js returns `Buffer.from(...)` whenever a CommonJS `module` object exists,
 * which bundlers emulate in browsers where `Buffer` is missing. Provide a scoped
 * stand-in for the duration of the (synchronous) call only.
 */
function encodeJpeg(r: Raster, quality: number): Uint8Array {
  const g = globalThis as { Buffer?: unknown };
  const stub = typeof g.Buffer === 'undefined';
  if (stub) g.Buffer = { from: (x: ArrayLike<number>) => Uint8Array.from(x) };
  try {
    return new Uint8Array(jpeg.encode({ data: r.data, width: r.width, height: r.height }, quality).data);
  } finally {
    if (stub) delete g.Buffer;
  }
}

/** Synchronous encoding of the built-in formats (JPEG, PNG). */
export function encodeImage(r: Raster, format: ImageFormat, o: EncodeOptions = {}): Uint8Array {
  if (format === 'png') return encodePng(r, o.source && isPng(o.source) ? o.source : undefined);
  if (format !== 'jpeg') throw new Error(`No built-in ${format} encoder: use encodeImageAsync() with a registered codec`);
  const out = encodeJpeg(r, o.quality ?? 92);
  if (!o.source || !isJpeg(o.source)) return out;
  // Splice the original metadata segments in after the encoder's JFIF (APP0) header.
  const segs = jpegSegments(out);
  const at = segs[0]?.marker === 0xe0 ? segs[0].end : 2;
  return concat([out.subarray(0, at), ...metadataSegments(o.source), out.subarray(at)]);
}

/** Decodes any supported format, using registered codecs first. */
export async function decodeImageAsync(b: Uint8Array): Promise<Raster> {
  const format = detectFormat(b);
  const codec = format && codecs.get(format);
  if (codec) return codec.decode(b);
  if (format === 'webp') throw new Error('No WebP codec registered: see registerImageCodec()');
  return decodeImage(b);
}

/** Encodes any supported format, using registered codecs first. */
export async function encodeImageAsync(r: Raster, format: ImageFormat, o: EncodeOptions = {}): Promise<Uint8Array> {
  const codec = codecs.get(format);
  if (codec) return codec.encode(r, o);
  return encodeImage(r, format, o);
}

// ---------------------------------------------------------------- ready-made codecs

/**
 * Browser codec based on createImageBitmap + OffscreenCanvas (works in pages
 * and Web Workers). Decoding is supported everywhere; WebP encoding depends on
 * the browser (Chromium and Firefox yes, Safari no).
 */
export function createCanvasCodec(mimeType = 'image/webp'): ImageCodec {
  return {
    async decode(bytes) {
      const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mimeType }), {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
      });
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      return { width: img.width, height: img.height, data: new Uint8Array(img.data.buffer) };
    },
    async encode(r, o) {
      const canvas = new OffscreenCanvas(r.width, r.height);
      canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
      const blob = await canvas.convertToBlob({ type: mimeType, quality: (o.quality ?? 92) / 100 });
      if (blob.type !== mimeType) throw new Error(`This browser cannot encode ${mimeType}`);
      return new Uint8Array(await blob.arrayBuffer());
    },
  };
}

/** The subset of the `sharp` API used by `createSharpCodec`. */
export interface SharpLike {
  (input: Uint8Array, options?: { raw?: { width: number; height: number; channels: 4 } }): {
    ensureAlpha(): { raw(): { toBuffer(o: { resolveWithObject: true }): Promise<{ data: Uint8Array; info: { width: number; height: number } }> } };
    webp(o: { quality: number }): { toBuffer(): Promise<Uint8Array> };
  };
}

/**
 * Node.js codec backed by the `sharp` package (bring your own: `npm install sharp`).
 *   registerImageCodec('webp', createSharpCodec(sharp))
 */
export function createSharpCodec(sharp: SharpLike): ImageCodec {
  return {
    async decode(bytes) {
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
    },
    async encode(r, o) {
      const out = await sharp(r.data, { raw: { width: r.width, height: r.height, channels: 4 } })
        .webp({ quality: o.quality ?? 92 })
        .toBuffer();
      return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
    },
  };
}
