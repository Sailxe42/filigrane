import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { signAsset } from '../src/c2pa/builder.ts';
import { DIGITAL_SOURCE_TYPE, LABEL } from '../src/c2pa/labels.ts';
import { readC2pa } from '../src/c2pa/reader.ts';
import { jpegContainer, pngContainer } from '../src/containers/container.ts';
import { readJpegJumbf } from '../src/containers/jpeg.ts';
import { createDevSigner } from '../src/crypto/signer.ts';
import { pemToDerList } from '../src/crypto/x509.ts';
import { encodeImage } from '../src/image/codec.ts';
import { parseJumbf } from '../src/jumbf/jumbf.ts';
import { syntheticImage } from './helpers.ts';

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const actions = { label: LABEL.actionsV2, data: { actions: [{ action: 'c2pa.created', digitalSourceType: DIGITAL_SOURCE_TYPE.trainedAlgorithmicMedia }] } };
const options = async () => ({ signer: await createDevSigner('C2PA Test'), assertions: [actions], claimGenerator: { name: 'test', version: '1' }, title: 'test' });

describe('C2PA interoperability', () => {
  it('validates a manifest produced by the reference implementation (c2pa-rs)', async () => {
    const report = await readC2pa(fixture('reference-c2pa-rs.jpg'), jpegContainer, {
      trustAnchors: pemToDerList(fs.readFileSync(new URL('./fixtures/reference-ca.pem', import.meta.url), 'utf8')),
      now: new Date('2026-11-01T00:00:00Z'),
    });
    expect(report.present).toBe(true);
    expect(report.active?.valid).toBe(true);
    expect(report.active?.signature.trusted).toBe(true);
    expect(report.active?.aiGenerated).toBe(true);
    expect(report.active?.claimVersion).toBe(2);
    expect(report.active?.validation.map((v) => v.code)).toContain('assertion.dataHash.match');
  });
});

describe.each([
  ['JPEG', 'jpeg', jpegContainer],
  ['PNG', 'png', pngContainer],
] as const)('C2PA signing (%s)', (_name, format, container) => {
  const asset = () => encodeImage(syntheticImage(96, 64, 3), format);

  it('produces a manifest that our reader validates', async () => {
    const signed = await signAsset(asset(), container, await options());
    const report = await readC2pa(signed.bytes, container);
    expect(report.active?.valid).toBe(true);
    expect(report.active?.label).toBe(signed.manifestLabel);
    expect(report.active?.aiGenerated).toBe(true);
    expect(report.active?.signature.valid).toBe(true);
    expect(report.active?.signature.trusted).toBeNull();
  });

  it('detects pixel tampering after signing', async () => {
    const signed = await signAsset(asset(), container, await options());
    const tampered = signed.bytes.slice();
    tampered[tampered.length - 30] ^= 0xff;
    const report = await readC2pa(tampered, container);
    expect(report.active?.valid).toBe(false);
    expect(report.active?.validation.find((v) => v.code === 'assertion.dataHash.mismatch')).toBeTruthy();
  });

  it('replaces an existing manifest when re-signing', async () => {
    const once = await signAsset(asset(), container, await options());
    const twice = await signAsset(once.bytes, container, await options());
    const report = await readC2pa(twice.bytes, container);
    expect(report.manifests).toEqual([twice.manifestLabel]);
    expect(report.active?.valid).toBe(true);
  });
});

describe('C2PA trust', () => {
  it('reports untrusted signers when anchors are supplied', async () => {
    const signed = await signAsset(encodeImage(syntheticImage(64, 64), 'jpeg'), jpegContainer, await options());
    const other = pemToDerList(fs.readFileSync(new URL('./fixtures/reference-ca.pem', import.meta.url), 'utf8'));
    const report = await readC2pa(signed.bytes, jpegContainer, { trustAnchors: other });
    expect(report.active?.signature.trusted).toBe(false);
    expect(report.active?.valid).toBe(true); // integrity is still fine
  });

  it('detects a modified assertion through its hashed URI', async () => {
    const signed = await signAsset(encodeImage(syntheticImage(64, 64), 'jpeg'), jpegContainer, await options());
    const bytes = signed.bytes.slice();
    const { ranges } = readJpegJumbf(bytes)[0];
    // Flip a byte inside the actions assertion text ("c2pa.created" → "c2pa.creat?d").
    const text = new TextDecoder('latin1').decode(bytes);
    const at = text.indexOf('c2pa.created', ranges[0].start);
    bytes[at + 10] = 0x3f;
    const report = await readC2pa(bytes, jpegContainer);
    expect(report.active?.validation.some((v) => v.code === 'assertion.hashedURI.mismatch')).toBe(true);
    expect(report.active?.valid).toBe(false);
  });

  it('lays out the manifest store like the reference implementation', async () => {
    const signed = await signAsset(encodeImage(syntheticImage(64, 64), 'jpeg'), jpegContainer, await options());
    const store = parseJumbf(signed.store);
    expect(store.desc.label).toBe('c2pa');
    const manifest = store.children[0];
    expect(manifest.kind === 'super' && manifest.children.map((c) => (c.kind === 'super' ? c.desc.label : c.type))).toEqual([
      'c2pa.assertions',
      'c2pa.claim.v2',
      'c2pa.signature',
    ]);
  });
});
