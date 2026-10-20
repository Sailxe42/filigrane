import { describe, expect, it } from 'vitest';
import { derToPem, generateDevCertificateChain, OID, parseCertificate, pemToDerList, verifyIssuedBy } from '../src/crypto/x509.ts';
import { derEcdsaToRaw, rawEcdsaToDer } from '../src/crypto/asn1.ts';
import { createDevSigner, createLocalSigner } from '../src/crypto/signer.ts';
import { coseSign1, coseVerify1, parseCoseSign1 } from '../src/crypto/cose.ts';
import { textEncoder } from '../src/util/bytes.ts';

describe('X.509', () => {
  it('generates a C2PA-compatible development chain', async () => {
    const dev = await generateDevCertificateChain('Unit Test', 30);
    const [leaf, ca] = dev.chain.map(parseCertificate);
    expect(leaf.subject.commonName).toBe('Unit Test Signer');
    expect(leaf.issuer.commonName).toBe('Unit Test Root CA');
    expect(leaf.isCA).toBe(false);
    expect(ca.isCA).toBe(true);
    expect([...leaf.keyUsage]).toEqual(['digitalSignature']);
    expect(leaf.extKeyUsage).toContain(OID.ekuEmailProtection);
    expect(ca.keyUsage.has('keyCertSign')).toBe(true);
    expect(leaf.authorityKeyId).toBe(ca.subjectKeyId);
    expect(leaf.notAfter.getTime() - leaf.notBefore.getTime()).toBeCloseTo(30 * 24 * 3600_000, -5);
    expect(await verifyIssuedBy(leaf, ca)).toBe(true);
    expect(await verifyIssuedBy(ca, leaf)).toBe(false);
  });

  it('round-trips PEM', async () => {
    const dev = await generateDevCertificateChain();
    const pem = dev.chain.map((d) => derToPem(d)).join('');
    expect(pemToDerList(pem)).toEqual(dev.chain);
  });

  it('converts ECDSA signatures between raw and DER forms', () => {
    const raw = new Uint8Array(64).map((_, i) => (i === 0 || i === 32 ? 0x80 : i));
    expect(derEcdsaToRaw(rawEcdsaToDer(raw))).toEqual(raw);
  });
});

describe('COSE_Sign1', () => {
  it('signs and verifies a detached payload', async () => {
    const signer = await createDevSigner();
    const payload = textEncoder.encode('claim bytes');
    const cose = parseCoseSign1(await coseSign1(payload, signer));
    expect(cose.alg).toBe('ES256');
    expect(cose.certificates).toHaveLength(2);
    expect(await coseVerify1(cose, payload)).toBe(true);
    expect(await coseVerify1(cose, textEncoder.encode('other bytes'))).toBe(false);
  });

  it('builds a signer from PEM strings', async () => {
    const dev = await generateDevCertificateChain();
    const signer = await createLocalSigner({
      certificate: dev.chain.map((d) => derToPem(d)).join(''),
      privateKey: derToPem(dev.privateKeyPkcs8, 'PRIVATE KEY'),
    });
    expect(signer.alg).toBe('ES256');
    const cose = parseCoseSign1(await coseSign1(new Uint8Array([1]), signer));
    expect(await coseVerify1(cose, new Uint8Array([1]))).toBe(true);
  });
});
