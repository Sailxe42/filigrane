/** An image as 8-bit RGBA pixels, row-major, no padding. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}
