/** Decoding and encoding of supported image formats to and from RGBA rasters. */
import jpeg from 'jpeg-js';
import { concat } from '../util/bytes.ts';
import { isJpeg, jpegSegments } from '../containers/jpeg.ts';
import { isPng } from '../containers/png.ts';
import { decodePng, encodePng } from './png-codec.ts';
import type { Raster } from './raster.ts';

export type ImageFormat = 'jpeg' | 'png';

export function detectFormat(b: Uint8Array): ImageFormat | undefined {
  if (isJpeg(b)) return 'jpeg';
  if (isPng(b)) return 'png';
  return undefined;
}

export function decodeImage(b: Uint8Array): Raster {
  if (isJpeg(b)) {
    const img = jpeg.decode(b, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 200, maxMemoryUsageInMB: 2048 });
    return { width: img.width, height: img.height, data: img.data };
  }
  if (isPng(b)) return decodePng(b);
  throw new Error('Unsupported image format: JPEG and PNG are supported');
}

/** APP segments carried over when a JPEG is re-encoded: Exif (APP1), ICC (APP2), IPTC (APP13), Adobe (APP14). */
function metadataSegments(source: Uint8Array): Uint8Array[] {
  return jpegSegments(source)
    .filter((s) => s.marker === 0xe1 || s.marker === 0xe2 || s.marker === 0xed || s.marker === 0xee)
    .map((s) => source.subarray(s.start, s.end));
}

export interface EncodeOptions {
  /** JPEG quality, 1-100 (default 92). */
  quality?: number;
  /** Original file whose metadata (Exif, ICC profile, text chunks) should be preserved. */
  source?: Uint8Array;
}

export function encodeImage(r: Raster, format: ImageFormat, o: EncodeOptions = {}): Uint8Array {
  if (format === 'png') return encodePng(r, o.source && isPng(o.source) ? o.source : undefined);
  const out = new Uint8Array(jpeg.encode({ data: r.data, width: r.width, height: r.height }, o.quality ?? 92).data);
  if (!o.source || !isJpeg(o.source)) return out;
  // Splice the original metadata segments in after the encoder's JFIF (APP0) header.
  const segs = jpegSegments(out);
  const at = segs[0]?.marker === 0xe0 ? segs[0].end : 2;
  return concat([out.subarray(0, at), ...metadataSegments(o.source), out.subarray(at)]);
}
