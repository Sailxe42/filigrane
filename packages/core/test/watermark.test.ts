import { describe, expect, it } from 'vitest';
import { decodeImage, encodeImage } from '../src/image/codec.ts';
import { decodeCodeword, detectWatermark, embedWatermark, encodeCodeword } from '../src/watermark/watermark.ts';
import { psnr, resizeRaster, syntheticImage } from './helpers.ts';

const payload = { aiGenerated: true, aiModified: false, id: 0xc0ffee42 };

describe('watermark codeword', () => {
  it('round-trips and protects with a CRC', () => {
    const bits = encodeCodeword(payload);
    expect(bits).toHaveLength(64);
    expect(decodeCodeword(bits)).toEqual(payload);
    const flipped = bits.slice();
    flipped[30] ^= 1;
    expect(decodeCodeword(flipped)).toBeUndefined();
  });
});

describe('watermark embedding', () => {
  const original = syntheticImage(800, 600, 11);
  const marked = embedWatermark(original, payload);
  const jpeg = (q: number) => decodeImage(encodeImage(marked, 'jpeg', { quality: q }));

  it('is invisible (PSNR above 40 dB)', () => {
    expect(psnr(original, marked)).toBeGreaterThan(40);
  });

  it('is detected in the marked image', () => {
    const d = detectWatermark(marked);
    expect(d.detected).toBe(true);
    expect(d.payload).toEqual(payload);
  });

  it.each([90, 70, 50])('survives JPEG recompression at quality %i', (q) => {
    expect(detectWatermark(jpeg(q)).payload?.id).toBe(payload.id);
  });

  it.each([0.5, 0.75, 1.5])('survives resizing to %f×', (f) => {
    expect(detectWatermark(resizeRaster(marked, 800 * f, 600 * f)).payload?.id).toBe(payload.id);
  });

  it('survives a brightness change', () => {
    const brighter = { ...marked, data: marked.data.map((v, i) => (i % 4 === 3 ? v : Math.min(255, v + 15))) };
    expect(detectWatermark(brighter).detected).toBe(true);
  });

  it('does not fire on unmarked images', () => {
    for (let seed = 1; seed <= 6; seed++) {
      expect(detectWatermark(syntheticImage(400, 300, seed * 97)).detected).toBe(false);
    }
  });

  it('leaves tiny images untouched', () => {
    const tiny = syntheticImage(40, 40);
    expect(embedWatermark(tiny, payload).data).toEqual(tiny.data);
  });
});
