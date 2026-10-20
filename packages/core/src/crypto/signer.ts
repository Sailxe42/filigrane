/**
 * Signers produce the claim signature. Anything that can sign bytes can be a
 * signer: a local key, a cloud KMS, an HSM — implement the `Signer` interface.
 */
import { subtle } from '../util/bytes.ts';
import { integer, octetString, oid, parseDer, seq } from './asn1.ts';
import { generateDevCertificateChain, OID, parseCertificate, pemToDerList } from './x509.ts';

export type SigningAlgorithm = 'ES256' | 'ES384' | 'ES512';

export interface Signer {
  alg: SigningAlgorithm;
  /** DER-encoded certificate chain: signing certificate first, then intermediates. */
  certificates: Uint8Array[];
  /** Returns the raw signature (r || s for ECDSA). */
  sign(data: Uint8Array): Promise<Uint8Array>;
}

const CURVE_ALG: Record<string, { alg: SigningAlgorithm; curve: string; hash: string }> = {
  [OID.p256]: { alg: 'ES256', curve: 'P-256', hash: 'SHA-256' },
  [OID.p384]: { alg: 'ES384', curve: 'P-384', hash: 'SHA-384' },
  [OID.p521]: { alg: 'ES512', curve: 'P-521', hash: 'SHA-512' },
};

/** Wraps a SEC1 "EC PRIVATE KEY" into PKCS#8 so WebCrypto can import it. */
function sec1ToPkcs8(sec1: Uint8Array): Uint8Array {
  const node = parseDer(sec1);
  const curveNode = node.children.find((c) => c.tag === 0xa0)?.children[0];
  if (!curveNode) throw new Error('SEC1 key without curve parameters');
  return seq(integer(0), seq(oid(OID.ecPublicKey), curveNode.raw), octetString(sec1));
}

export interface LocalSignerOptions {
  /** PEM certificate chain (signing certificate first) or DER certificates. */
  certificate: string | Uint8Array[];
  /** PEM private key ("PRIVATE KEY" or "EC PRIVATE KEY"), PKCS#8 DER, or a CryptoKey. */
  privateKey: string | Uint8Array | CryptoKey;
}

/** Creates a signer from a certificate chain and its private key (ECDSA). */
export async function createLocalSigner(o: LocalSignerOptions): Promise<Signer> {
  const certificates = typeof o.certificate === 'string' ? pemToDerList(o.certificate) : o.certificate;
  if (!certificates.length) throw new Error('No certificate found');
  const leaf = parseCertificate(certificates[0]);
  const info = CURVE_ALG[leaf.namedCurve ?? ''];
  if (leaf.publicKeyAlgorithm !== OID.ecPublicKey || !info) {
    throw new Error('Only ECDSA (P-256, P-384, P-521) signing certificates are supported for now');
  }
  let key: CryptoKey;
  if (typeof o.privateKey === 'string') {
    const pkcs8 = pemToDerList(o.privateKey, 'PRIVATE KEY')[0];
    const sec1 = pemToDerList(o.privateKey, 'EC PRIVATE KEY')[0];
    const der = pkcs8 ?? (sec1 ? sec1ToPkcs8(sec1) : undefined);
    if (!der) throw new Error('No PEM private key found');
    key = await subtle().importKey('pkcs8', der as BufferSource, { name: 'ECDSA', namedCurve: info.curve }, false, ['sign']);
  } else if (o.privateKey instanceof Uint8Array) {
    key = await subtle().importKey('pkcs8', o.privateKey as BufferSource, { name: 'ECDSA', namedCurve: info.curve }, false, ['sign']);
  } else {
    key = o.privateKey;
  }
  return {
    alg: info.alg,
    certificates,
    sign: async (data) => new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: info.hash }, key, data as BufferSource)),
  };
}

/**
 * A signer backed by a freshly generated, throw-away certificate chain.
 * Perfect for tests and demos; manifests will validate but show as untrusted.
 */
export async function createDevSigner(name?: string): Promise<Signer> {
  const dev = await generateDevCertificateChain(name);
  return createLocalSigner({ certificate: dev.chain, privateKey: dev.signingKey });
}
