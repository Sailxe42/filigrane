import { describe, expect, it } from 'vitest';
import { createDevSigner, decodeImage, encodeImage, markImage, verifyImage } from '../src/index.ts';
import { syntheticImage } from './helpers.ts';

describe.each(['jpeg', 'png'] as const)('markImage / verifyImage (%s)', (format) => {
  const input = encodeImage(syntheticImage(640, 480, 5), format);

  it('applies three layers that all report AI generation', async () => {
    const signer = await createDevSigner();
    const marked = await markImage(input, { signer, model: { name: 'Test Model', version: '1' } });
    expect(marked.layers).toEqual(['watermark', 'metadata', 'c2pa']);
    const v = await verifyImage(marked.bytes);
    expect(v.verdict).toBe('ai-generated');
    expect(v.signals).toBe(3);
    expect(v.c2pa.active?.valid).toBe(true);
    expect(v.c2pa.active?.actions[0].softwareAgent).toBe('Test Model 1');
    expect(v.c2pa.active?.softBindings[0].alg).toBe('io.filigrane.fgw1');
    expect(v.metadata.aiSystem).toBe('Test Model');
    expect(v.metadata.provenance).toBe(`self#jumbf=/c2pa/${marked.manifestLabel}`);
    expect(v.watermark.payload?.id).toBe(marked.watermarkId);
    expect(v.tampered).toBe(false);
  });

  it('still flags the image after metadata is stripped and it is recompressed', async () => {
    const marked = await markImage(input, { signer: await createDevSigner() });
    const laundered = encodeImage(decodeImage(marked.bytes), 'jpeg', { quality: 70 });
    const v = await verifyImage(laundered);
    expect(v.c2pa.present).toBe(false);
    expect(v.metadata.present).toBe(false);
    expect(v.watermark.detected).toBe(true);
    expect(v.verdict).toBe('ai-generated');
  });

  it('works without a signer (watermark + metadata)', async () => {
    const marked = await markImage(input, { involvement: 'modified' });
    expect(marked.layers).toEqual(['watermark', 'metadata']);
    const v = await verifyImage(marked.bytes);
    expect(v.verdict).toBe('ai-modified');
    expect(v.signals).toBe(2);
  });

  it('reports no signal on an unmarked image', async () => {
    const v = await verifyImage(input);
    expect(v.verdict).toBe('no-ai-signal');
    expect(v.signals).toBe(0);
  });
});
