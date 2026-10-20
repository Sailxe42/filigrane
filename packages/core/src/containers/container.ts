import { insertJpegJumbf, isJpeg, readJpegJumbf, readJpegXmp, stripJpegC2pa, writeJpegXmp } from './jpeg.ts';
import { insertPngJumbf, isPng, readPngJumbf, readPngXmp, stripPngC2pa, writePngXmp } from './png.ts';

/** What the C2PA layer needs from a file format. */
export interface AssetContainer {
  mimeType: string;
  /** Removes any embedded C2PA manifest store. */
  strip(asset: Uint8Array): Uint8Array;
  /** Embeds a manifest store into a stripped asset and reports where it landed. */
  insert(stripped: Uint8Array, store: Uint8Array): { bytes: Uint8Array; range: { start: number; length: number } };
  /** Extracts the embedded manifest store, if any. */
  read(asset: Uint8Array): { store: Uint8Array; ranges: { start: number; end: number }[] } | undefined;
  readXmp(asset: Uint8Array): string | undefined;
  writeXmp(asset: Uint8Array, xmp: string): Uint8Array;
}

export const jpegContainer: AssetContainer = {
  mimeType: 'image/jpeg',
  strip: stripJpegC2pa,
  insert: insertJpegJumbf,
  read(asset) {
    const stores = readJpegJumbf(asset);
    // The C2PA store is the JUMBF superbox labelled "c2pa"; other APP11 users are ignored.
    const found = stores.find((s) => s.jumbf.length > 30 && labelOf(s.jumbf) === 'c2pa');
    return found && { store: found.jumbf, ranges: found.ranges };
  },
  readXmp: readJpegXmp,
  writeXmp: writeJpegXmp,
};

export const pngContainer: AssetContainer = {
  mimeType: 'image/png',
  strip: stripPngC2pa,
  insert: insertPngJumbf,
  read: readPngJumbf,
  readXmp: readPngXmp,
  writeXmp: writePngXmp,
};

/** Reads the label of the description box of a JUMBF superbox without a full parse. */
function labelOf(jumbf: Uint8Array): string | undefined {
  // jumb header (8) + jumd header (8) + uuid (16) + toggles (1)
  const start = 8 + 8 + 16 + 1;
  if (!(jumbf[start - 1] & 0x02)) return undefined;
  let end = start;
  while (end < jumbf.length && jumbf[end] !== 0) end++;
  return new TextDecoder().decode(jumbf.subarray(start, end));
}

export function containerFor(asset: Uint8Array, mimeType?: string): AssetContainer {
  if (mimeType === 'image/jpeg' || (!mimeType && isJpeg(asset))) return jpegContainer;
  if (mimeType === 'image/png' || (!mimeType && isPng(asset))) return pngContainer;
  if (isJpeg(asset)) return jpegContainer;
  if (isPng(asset)) return pngContainer;
  throw new Error(`Unsupported file format${mimeType ? ` (${mimeType})` : ''}: JPEG and PNG are supported`);
}

export function sniffMimeType(asset: Uint8Array): string | undefined {
  if (isJpeg(asset)) return 'image/jpeg';
  if (isPng(asset)) return 'image/png';
  return undefined;
}
