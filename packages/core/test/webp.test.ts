import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { signAsset } from '../src/c2pa/builder.ts';
import { DIGITAL_SOURCE_TYPE, LABEL } from '../src/c2pa/labels.ts';
import { readC2pa } from '../src/c2pa/reader.ts';
import { webpContainer } from '../src/containers/container.ts';
import { insertWebpJumbf, readWebpXmp, stripWebpC2pa, webpChunks, writeWebpXmp } from '../src/containers/webp.ts';
import { createDevSigner } from '../src/crypto/signer.ts';
import { createSharpCodec, registerImageCodec } from '../src/image/codec.ts';
import { markImage, verifyImage } from '../src/image/image.ts';
import { syntheticImage } from './helpers.ts';

async function webp(lossless = false, alpha = false): Promise<Uint8Array> {
  const img = syntheticImage(320, 240, 21);
  const channels = alpha ? 4 : 3;
  // With alpha, make the left half semi-transparent so the encoder keeps the alpha channel.
  const data = alpha ? img.data.map((v, i) => (i % 4 === 3 && ((i >> 2) % img.width) < img.width / 2 ? 128 : v)) : img.data.filter((_, i) => i % 4 !== 3);
  const buf = await sharp(data, { raw: { width: img.width, height: img.height, channels } }).webp(lossless ? { lossless: true } : { quality: 85 }).toBuffer();
  return new Uint8Array(buf);
}

const riffSize = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset).getUint32(4, true);
const decodes = async (b: Uint8Array) => (await sharp(b).metadata()).width === 320;

describe('WebP container', () => {
  it('inserts and strips a C2PA chunk with a correct RIFF size', async () => {
    const input = await webp();
    const { bytes, range } = insertWebpJumbf(input, new Uint8Array(101));
    expect(riffSize(bytes)).toBe(bytes.length - 8);
    expect(webpChunks(bytes).map((c) => c.id)).toEqual(['VP8 ', 'C2PA']);
    expect(range).toEqual({ start: input.length, length: 8 + 101 });
    expect(stripWebpC2pa(bytes)).toEqual(input);
    expect(await decodes(bytes)).toBe(true);
  });

  it.each([
    ['lossy', false, false],
    ['lossless', true, false],
    ['lossless with alpha', true, true],
  ])('adds XMP to a simple %s file by converting it to the extended format', async (_n, lossless, alpha) => {
    const input = await webp(lossless, alpha);
    const out = writeWebpXmp(input, '<x:xmpmeta/>');
    const chunks = webpChunks(out);
    expect(chunks[0].id).toBe('VP8X');
    expect(chunks[0].data[0] & 0x04).toBe(0x04);
    expect(!!(chunks[0].data[0] & 0x10)).toBe(alpha);
    expect(readWebpXmp(out)).toBe('<x:xmpmeta/>');
    expect(riffSize(out)).toBe(out.length - 8);
    expect(await decodes(out)).toBe(true);
  });
});

describe('WebP C2PA', () => {
  it('signs a WebP whose hash covers the RIFF header', async () => {
    const signer = await createDevSigner();
    const assertions = [{ label: LABEL.actionsV2, data: { actions: [{ action: 'c2pa.created', digitalSourceType: DIGITAL_SOURCE_TYPE.trainedAlgorithmicMedia }] } }];
    const signed = await signAsset(await webp(), webpContainer, { signer, assertions, claimGenerator: { name: 'test' } });
    const report = await readC2pa(signed.bytes, webpContainer);
    expect(report.active?.valid).toBe(true);
    expect(await decodes(signed.bytes)).toBe(true);
  });
});

describe('markImage on WebP', () => {
  it('applies the metadata layers and warns when no WebP codec is registered', async () => {
    const marked = await markImage(await webp(), { signer: await createDevSigner() });
    expect(marked.mimeType).toBe('image/webp');
    expect(marked.layers).toEqual(['metadata', 'c2pa']);
    expect(marked.warnings[0]).toMatch(/no webp codec/);
    const v = await verifyImage(marked.bytes);
    expect(v.verdict).toBe('ai-generated');
    expect(v.signals).toBe(2);
    expect(v.warnings[0]).toMatch(/no webp codec/);
  });

  it('applies all three layers with a registered codec', async () => {
    registerImageCodec('webp', createSharpCodec(sharp as never));
    const marked = await markImage(await webp(), { signer: await createDevSigner(), model: { name: 'Test' } });
    expect(marked.layers).toEqual(['watermark', 'metadata', 'c2pa']);
    expect(await decodes(marked.bytes)).toBe(true);
    const v = await verifyImage(marked.bytes);
    expect(v.signals).toBe(3);
    expect(v.c2pa.active?.valid).toBe(true);
    expect(v.watermark.payload?.id).toBe(marked.watermarkId);
    expect(v.warnings).toEqual([]);
  });
});
