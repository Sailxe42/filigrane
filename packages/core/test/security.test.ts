/**
 * Regression tests for attacks found during the security audit of 2026-10-20.
 * Each test builds a malicious input and checks that verification is not fooled.
 */
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { signAsset } from '../src/c2pa/builder.ts';
import { DIGITAL_SOURCE_TYPE, LABEL } from '../src/c2pa/labels.ts';
import { readC2pa } from '../src/c2pa/reader.ts';
import { decodeCbor, encodeCbor } from '../src/cbor/cbor.ts';
import { type AssetContainer, jpegContainer } from '../src/containers/container.ts';
import { makeChunk, PNG_SIGNATURE, readPngXmp } from '../src/containers/png.ts';
import { createLocalSigner, createDevSigner } from '../src/crypto/signer.ts';
import { createCertificate, derToPem, generateDevCertificateChain, OID, parseCertificate } from '../src/crypto/x509.ts';
import { decodeImage, encodeImage } from '../src/image/codec.ts';
import { decodePng } from '../src/image/png-codec.ts';
import { markImage, verifyImage } from '../src/image/image.ts';
import { findChild, parseJumbf, type SuperBox, serializeJumbf } from '../src/jumbf/jumbf.ts';
import { concat, sha256 } from '../src/util/bytes.ts';
import { syntheticImage } from './helpers.ts';

const jpeg = () => encodeImage(syntheticImage(160, 120, 5), 'jpeg');

/** Re-embeds a modified copy of the manifest store, keeping the exclusion consistent with the new layout. */
async function reembed(file: Uint8Array, edit: (store: SuperBox) => void, hashOf?: (stripped: Uint8Array) => Promise<Uint8Array>) {
  const store = parseJumbf(jpegContainer.read(file)!.store);
  const stripped = jpegContainer.strip(file);
  let exclusion = { start: 0, length: 0 };
  for (let i = 0; i < 6; i++) {
    const copy = parseJumbf(serializeJumbf(store));
    edit(copy);
    const assertions = findChild(copy.children[0] as SuperBox, LABEL.assertionStore)!;
    const fake = assertions.children.find((c) => c.kind === 'super' && c.desc.label === 'c2pa.hash.data__2') as SuperBox | undefined;
    if (fake && hashOf) fake.children = [{ kind: 'content', type: 'cbor', data: encodeCbor({ exclusions: [exclusion], alg: 'sha256', hash: await hashOf(stripped) }) }];
    const inserted = jpegContainer.insert(stripped, serializeJumbf(copy));
    if (inserted.range.start === exclusion.start && inserted.range.length === exclusion.length) return inserted.bytes;
    exclusion = { start: inserted.range.start, length: inserted.range.length };
  }
  throw new Error('layout did not stabilise');
}

describe('security: C2PA manifest validation', () => {
  it('detects pixel tampering hidden behind an unsigned hard-binding assertion', async () => {
    const marked = (await markImage(jpeg(), { signer: await createDevSigner() })).bytes;
    // Replace the pixels, then add an unsigned c2pa.hash.data__2 that matches the new pixels.
    const px = decodeImage(marked);
    for (let i = 0; i < px.data.length; i += 4) px.data[i] = 255 - px.data[i];
    const tamperedBase = jpegContainer.strip(encodeImage(px, 'jpeg'));
    const withOldStore = jpegContainer.insert(tamperedBase, jpegContainer.read(marked)!.store).bytes;
    const forged = await reembed(
      withOldStore,
      (store) => {
        const assertions = findChild(store.children[0] as SuperBox, LABEL.assertionStore)!;
        const template = assertions.children[0] as SuperBox;
        assertions.children.unshift({ kind: 'super', desc: { uuid: template.desc.uuid, toggles: 3, label: 'c2pa.hash.data__2' }, children: [] });
      },
      sha256,
    );
    const v = await verifyImage(forged, { skipWatermark: true });
    expect(v.c2pa.active?.signature.valid).toBe(true);
    expect(v.c2pa.active?.valid).toBe(false);
    expect(v.tampered).toBe(true);
  });

  it('ignores assertions that the signed claim does not reference', async () => {
    const signer = await createDevSigner();
    const photo = await signAsset(jpeg(), jpegContainer, {
      signer,
      assertions: [{ label: LABEL.actionsV2, data: { actions: [{ action: 'c2pa.created', digitalSourceType: DIGITAL_SOURCE_TYPE.digitalCapture }] } }],
      claimGenerator: { name: 'Camera' },
    });
    const forged = await reembed(photo.bytes, (store) => {
      const assertions = findChild(store.children[0] as SuperBox, LABEL.assertionStore)!;
      const template = assertions.children[0] as SuperBox;
      assertions.children.unshift({
        kind: 'super',
        desc: { uuid: template.desc.uuid, toggles: 3, label: 'c2pa.actions.v2__1' },
        children: [{ kind: 'content', type: 'cbor', data: encodeCbor({ actions: [{ action: 'c2pa.created', digitalSourceType: DIGITAL_SOURCE_TYPE.trainedAlgorithmicMedia }] }) }],
      });
    });
    const report = await readC2pa(forged, jpegContainer);
    expect(report.active?.aiGenerated).toBe(false);
    expect(report.active?.assertions.map((a) => a.label)).not.toContain('c2pa.actions.v2__1');
  });

  it('rejects a signed hash that excludes image bytes', async () => {
    // A malicious signer excludes the whole file, so any pixels would "match".
    const greedy: AssetContainer = {
      ...jpegContainer,
      insert(stripped, store) {
        const inserted = jpegContainer.insert(stripped, store);
        return { bytes: inserted.bytes, range: { start: 0, length: inserted.bytes.length } };
      },
    };
    const signed = await signAsset(jpeg(), greedy, { signer: await createDevSigner(), assertions: [], claimGenerator: { name: 'x' } });
    const report = await readC2pa(signed.bytes, jpegContainer);
    expect(report.active?.signature.valid).toBe(true);
    expect(report.active?.valid).toBe(false);
    expect(report.active?.validation.find((c) => c.code === 'assertion.dataHash.mismatch')?.message).toMatch(/outside the manifest/);
  });

  it('does not trust a certificate issued by a non-CA (leaf) certificate', async () => {
    const dev = await generateDevCertificateChain('Trusted Org');
    const leaf = parseCertificate(dev.chain[0]);
    const s = crypto.subtle;
    const key = (await s.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const leafPublic = await s.importKey('spki', leaf.spki as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
    const impostor = await createCertificate({
      subject: { commonName: 'Famous Brand', organization: 'Famous Brand' },
      issuer: leaf.subject,
      publicKey: key.publicKey,
      issuerPublicKey: leafPublic,
      signingKey: dev.signingKey,
      extKeyUsage: [OID.ekuDocumentSigning],
    });
    const signer = await createLocalSigner({
      certificate: derToPem(impostor) + derToPem(dev.chain[0]),
      privateKey: derToPem(new Uint8Array(await s.exportKey('pkcs8', key.privateKey)), 'PRIVATE KEY'),
    });
    const marked = (await markImage(jpeg(), { signer, layers: { watermark: false } })).bytes;
    const v = await verifyImage(marked, { trustAnchors: derToPem(dev.chain[1]), skipWatermark: true });
    expect(v.c2pa.active?.signature.valid).toBe(true);
    expect(v.c2pa.active?.signature.trusted).toBe(false);
    // The legitimate chain is still trusted.
    const genuine = (await markImage(jpeg(), { signer: await createLocalSigner({ certificate: dev.chain.map((d) => derToPem(d)).join(''), privateKey: derToPem(dev.privateKeyPkcs8, 'PRIVATE KEY') }), layers: { watermark: false } })).bytes;
    expect((await verifyImage(genuine, { trustAnchors: derToPem(dev.chain[1]), skipWatermark: true })).c2pa.active?.signature.trusted).toBe(true);
  });
});

describe('security: hostile files', () => {
  it('reads a PNG XMP chunk without terminators instead of looping forever', () => {
    const base = encodeImage(syntheticImage(64, 64), 'png');
    const evil = makeChunk('iTXt', concat([new TextEncoder().encode('XML:com.adobe.xmp'), new Uint8Array([0, 0, 0]), new Uint8Array(40).fill(65)]));
    const file = concat([base.subarray(0, 33), evil, base.subarray(33)]);
    expect(readPngXmp(file)).toBeUndefined();
  });

  it('stops inflating a PNG "zlib bomb" at the size declared in IHDR', () => {
    const ihdr = new Uint8Array(13);
    new DataView(ihdr.buffer).setUint32(0, 16);
    new DataView(ihdr.buffer).setUint32(4, 16);
    ihdr[8] = 8;
    ihdr[9] = 6;
    // 64 MB of zeros compress to ~64 KB. The second half of the stream is replaced by
    // invalid data: only a decoder that stops at the declared size (16×16 RGBA) succeeds.
    const bomb = new Uint8Array(deflateSync(Buffer.alloc(64 * 1024 * 1024)));
    bomb.fill(0xff, bomb.length >> 1);
    const file = concat([PNG_SIGNATURE, makeChunk('IHDR', ihdr), makeChunk('IDAT', bomb), makeChunk('IEND', new Uint8Array(0))]);
    const raster = decodePng(file);
    expect(raster.width * raster.height).toBe(256);
  });

  it('keeps a "__proto__" CBOR key as plain data', () => {
    const v = decodeCbor(encodeCbor(new Map<string, unknown>([['__proto__', { polluted: true }], ['a', 1]]))) as Record<string, unknown>;
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
    expect((v as { polluted?: boolean }).polluted).toBeUndefined();
    expect(Object.keys(v)).toEqual(['__proto__', 'a']);
  });
});
