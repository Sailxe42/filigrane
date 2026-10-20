/**
 * X.509 certificates: parsing (for verification and display) and generation of
 * development certificate chains, using WebCrypto only.
 */
import { fromBase64, randomBytes, sha256, subtle, toBase64, toHex } from '../util/bytes.ts';
import {
  type Asn1Node,
  bitString,
  bool,
  decodeString,
  decodeTime,
  derEcdsaToRaw,
  explicit,
  integer,
  octetString,
  oid,
  oidToString,
  parseDer,
  printableString,
  rawEcdsaToDer,
  seq,
  set,
  time,
  tlv,
  utf8String,
} from './asn1.ts';

export const OID = {
  commonName: '2.5.4.3',
  country: '2.5.4.6',
  organization: '2.5.4.10',
  organizationalUnit: '2.5.4.11',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  extKeyUsage: '2.5.29.37',
  subjectKeyIdentifier: '2.5.29.14',
  authorityKeyIdentifier: '2.5.29.35',
  ecPublicKey: '1.2.840.10045.2.1',
  rsaEncryption: '1.2.840.113549.1.1.1',
  rsaPss: '1.2.840.113549.1.1.10',
  ed25519: '1.3.101.112',
  p256: '1.2.840.10045.3.1.7',
  p384: '1.3.132.0.34',
  p521: '1.3.132.0.35',
  ecdsaSha256: '1.2.840.10045.4.3.2',
  ecdsaSha384: '1.2.840.10045.4.3.3',
  ecdsaSha512: '1.2.840.10045.4.3.4',
  ekuEmailProtection: '1.3.6.1.5.5.7.3.4',
  ekuDocumentSigning: '1.3.6.1.5.5.7.3.36',
  ekuTimeStamping: '1.3.6.1.5.5.7.3.8',
  ekuOcspSigning: '1.3.6.1.5.5.7.3.9',
  ekuC2pa: '1.3.6.1.4.1.62558.2.1',
  ekuMicrosoftC2pa: '1.3.6.1.4.1.311.76.59.1.9',
} as const;

/** Extended key usages accepted for C2PA claim signing certificates. */
export const C2PA_SIGNING_EKUS: readonly string[] = [
  OID.ekuEmailProtection,
  OID.ekuDocumentSigning,
  OID.ekuTimeStamping,
  OID.ekuOcspSigning,
  OID.ekuC2pa,
  OID.ekuMicrosoftC2pa,
];

export interface DistinguishedName {
  commonName?: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
}

export interface Certificate {
  der: Uint8Array;
  tbs: Uint8Array;
  serialNumber: string;
  issuer: DistinguishedName;
  subject: DistinguishedName;
  notBefore: Date;
  notAfter: Date;
  /** DER SubjectPublicKeyInfo. */
  spki: Uint8Array;
  publicKeyAlgorithm: string;
  namedCurve?: string;
  isCA: boolean;
  keyUsage: Set<string>;
  extKeyUsage: string[];
  subjectKeyId?: string;
  authorityKeyId?: string;
  signatureAlgorithm: string;
  signature: Uint8Array;
}

const KEY_USAGE_BITS = ['digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment', 'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly'];

function parseName(node: Asn1Node): DistinguishedName {
  const dn: DistinguishedName = {};
  for (const rdn of node.children) {
    for (const atv of rdn.children) {
      const type = oidToString(atv.children[0].value);
      const value = decodeString(atv.children[1]);
      if (type === OID.commonName) dn.commonName = value;
      else if (type === OID.organization) dn.organization = value;
      else if (type === OID.organizationalUnit) dn.organizationalUnit = value;
      else if (type === OID.country) dn.country = value;
    }
  }
  return dn;
}

export function parseCertificate(der: Uint8Array): Certificate {
  const cert = parseDer(der);
  const [tbs, sigAlg, sigValue] = cert.children;
  let i = 0;
  if (tbs.children[0].tag === 0xa0) i++; // version
  const serial = tbs.children[i++];
  i++; // signature algorithm (repeated)
  const issuer = parseName(tbs.children[i++]);
  const validity = tbs.children[i++];
  const subject = parseName(tbs.children[i++]);
  const spkiNode = tbs.children[i++];
  const algId = spkiNode.children[0];
  const publicKeyAlgorithm = oidToString(algId.children[0].value);
  const namedCurve = algId.children[1]?.tag === 0x06 ? oidToString(algId.children[1].value) : undefined;

  const out: Certificate = {
    der,
    tbs: tbs.raw,
    serialNumber: toHex(serial.value),
    issuer,
    subject,
    notBefore: decodeTime(validity.children[0]),
    notAfter: decodeTime(validity.children[1]),
    spki: spkiNode.raw,
    publicKeyAlgorithm,
    namedCurve,
    isCA: false,
    keyUsage: new Set(),
    extKeyUsage: [],
    signatureAlgorithm: oidToString(sigAlg.children[0].value),
    signature: sigValue.value.subarray(1),
  };

  const extWrapper = tbs.children.slice(i).find((n) => n.tag === 0xa3);
  for (const ext of extWrapper?.children[0]?.children ?? []) {
    const id = oidToString(ext.children[0].value);
    const valueNode = ext.children[ext.children.length - 1];
    const value = parseDer(valueNode.value);
    if (id === OID.basicConstraints) {
      out.isCA = value.children[0]?.tag === 0x01 && value.children[0].value[0] !== 0;
    } else if (id === OID.keyUsage) {
      const bits = value.value.subarray(1);
      KEY_USAGE_BITS.forEach((name, bit) => {
        const byte = bits[bit >> 3] ?? 0;
        if (byte & (0x80 >> (bit & 7))) out.keyUsage.add(name);
      });
    } else if (id === OID.extKeyUsage) {
      out.extKeyUsage = value.children.map((n) => oidToString(n.value));
    } else if (id === OID.subjectKeyIdentifier) {
      out.subjectKeyId = toHex(value.value);
    } else if (id === OID.authorityKeyIdentifier) {
      const kid = value.children.find((n) => n.tag === 0x80);
      if (kid) out.authorityKeyId = toHex(kid.value);
    }
  }
  return out;
}

// ---------------------------------------------------------------- PEM

export function pemToDerList(pem: string, label = 'CERTIFICATE'): Uint8Array[] {
  const re = new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`, 'g');
  const out: Uint8Array[] = [];
  for (const m of pem.matchAll(re)) out.push(fromBase64(m[1]));
  return out;
}

export function derToPem(der: Uint8Array, label = 'CERTIFICATE'): string {
  const b64 = toBase64(der).replace(/(.{64})/g, '$1\n').trim();
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

// ---------------------------------------------------------------- public keys

export interface VerifyAlgorithm {
  importParams: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams;
  verifyParams: AlgorithmIdentifier | EcdsaParams | RsaPssParams;
}

const CURVES: Record<string, string> = { [OID.p256]: 'P-256', [OID.p384]: 'P-384', [OID.p521]: 'P-521' };

/** Rewrites an RSASSA-PSS SubjectPublicKeyInfo into plain rsaEncryption form, which WebCrypto accepts. */
function normalizeRsaSpki(spki: Uint8Array): Uint8Array {
  const node = parseDer(spki);
  const keyBits = node.children[1];
  return seq(seq(oid(OID.rsaEncryption), new Uint8Array([0x05, 0x00])), keyBits.raw);
}

export async function importCertificateKey(cert: Certificate, coseAlg: number): Promise<{ key: CryptoKey; params: VerifyAlgorithm['verifyParams'] }> {
  const s = subtle();
  if (cert.publicKeyAlgorithm === OID.ecPublicKey) {
    const namedCurve = CURVES[cert.namedCurve ?? ''];
    if (!namedCurve) throw new Error(`Unsupported EC curve ${cert.namedCurve}`);
    const hash = coseAlg === -35 ? 'SHA-384' : coseAlg === -36 ? 'SHA-512' : 'SHA-256';
    const key = await s.importKey('spki', cert.spki as BufferSource, { name: 'ECDSA', namedCurve }, false, ['verify']);
    return { key, params: { name: 'ECDSA', hash } };
  }
  if (cert.publicKeyAlgorithm === OID.rsaEncryption || cert.publicKeyAlgorithm === OID.rsaPss) {
    const bits = coseAlg === -38 ? 384 : coseAlg === -39 ? 512 : 256;
    const hash = `SHA-${bits}`;
    const key = await s.importKey('spki', normalizeRsaSpki(cert.spki) as BufferSource, { name: 'RSA-PSS', hash }, false, ['verify']);
    return { key, params: { name: 'RSA-PSS', saltLength: bits / 8 } };
  }
  if (cert.publicKeyAlgorithm === OID.ed25519) {
    const key = await s.importKey('spki', cert.spki as BufferSource, { name: 'Ed25519' }, false, ['verify']);
    return { key, params: { name: 'Ed25519' } };
  }
  throw new Error(`Unsupported public key algorithm ${cert.publicKeyAlgorithm}`);
}

/** Verifies that `cert` was signed by `issuer` (ECDSA issuers only for now). */
export async function verifyIssuedBy(cert: Certificate, issuer: Certificate): Promise<boolean> {
  const hashes: Record<string, string> = { [OID.ecdsaSha256]: 'SHA-256', [OID.ecdsaSha384]: 'SHA-384', [OID.ecdsaSha512]: 'SHA-512' };
  const hash = hashes[cert.signatureAlgorithm];
  if (!hash || issuer.publicKeyAlgorithm !== OID.ecPublicKey) return false;
  const namedCurve = CURVES[issuer.namedCurve ?? ''];
  if (!namedCurve) return false;
  const size = namedCurve === 'P-256' ? 32 : namedCurve === 'P-384' ? 48 : 66;
  const key = await subtle().importKey('spki', issuer.spki as BufferSource, { name: 'ECDSA', namedCurve }, false, ['verify']);
  return subtle().verify({ name: 'ECDSA', hash }, key, derEcdsaToRaw(cert.signature, size) as BufferSource, cert.tbs as BufferSource);
}

// ---------------------------------------------------------------- generation

function encodeName(dn: DistinguishedName): Uint8Array {
  const rdns: Uint8Array[] = [];
  const add = (type: string, value: Uint8Array) => rdns.push(set(seq(oid(type), value)));
  if (dn.country) add(OID.country, printableString(dn.country));
  if (dn.organization) add(OID.organization, utf8String(dn.organization));
  if (dn.organizationalUnit) add(OID.organizationalUnit, utf8String(dn.organizationalUnit));
  if (dn.commonName) add(OID.commonName, utf8String(dn.commonName));
  return seq(...rdns);
}

function keyUsageBits(names: string[]): Uint8Array {
  let value = 0;
  let highest = 0;
  for (const n of names) {
    const bit = KEY_USAGE_BITS.indexOf(n);
    if (bit < 0 || bit > 7) continue;
    value |= 0x80 >> bit;
    highest = Math.max(highest, bit);
  }
  const unused = 7 - highest;
  return tlv(0x03, new Uint8Array([unused, value]));
}

function extension(id: string, critical: boolean, value: Uint8Array): Uint8Array {
  return critical ? seq(oid(id), bool(true), octetString(value)) : seq(oid(id), octetString(value));
}

async function keyId(spki: Uint8Array): Promise<Uint8Array> {
  // RFC 7093 method 1: leftmost 160 bits of the SHA-256 of the subjectPublicKey.
  const keyBits = parseDer(spki).children[1].value.subarray(1);
  return (await sha256(keyBits)).subarray(0, 20);
}

export interface CreateCertificateOptions {
  subject: DistinguishedName;
  issuer?: DistinguishedName;
  publicKey: CryptoKey;
  /** Private key of the issuer (the subject's own key for a self-signed CA). */
  signingKey: CryptoKey;
  issuerPublicKey?: CryptoKey;
  isCA?: boolean;
  notBefore?: Date;
  notAfter?: Date;
  extKeyUsage?: string[];
}

/** Creates an ECDSA P-256 / SHA-256 X.509 v3 certificate. */
export async function createCertificate(o: CreateCertificateOptions): Promise<Uint8Array> {
  const s = subtle();
  const spki = new Uint8Array(await s.exportKey('spki', o.publicKey));
  const issuerSpki = new Uint8Array(await s.exportKey('spki', o.issuerPublicKey ?? o.publicKey));
  const serial = randomBytes(16);
  serial[0] &= 0x7f;
  const notBefore = o.notBefore ?? new Date(Date.now() - 60_000);
  const notAfter = o.notAfter ?? new Date(notBefore.getTime() + 365 * 24 * 3600_000);
  const sigAlg = seq(oid(OID.ecdsaSha256));

  const exts: Uint8Array[] = [];
  if (o.isCA) {
    exts.push(extension(OID.basicConstraints, true, seq(bool(true))));
    exts.push(extension(OID.keyUsage, true, keyUsageBits(['keyCertSign', 'cRLSign'])));
  } else {
    exts.push(extension(OID.basicConstraints, true, seq()));
    exts.push(extension(OID.keyUsage, true, keyUsageBits(['digitalSignature'])));
    exts.push(extension(OID.extKeyUsage, false, seq(...(o.extKeyUsage ?? [OID.ekuEmailProtection]).map(oid))));
  }
  exts.push(extension(OID.subjectKeyIdentifier, false, octetString(await keyId(spki))));
  exts.push(extension(OID.authorityKeyIdentifier, false, seq(tlv(0x80, await keyId(issuerSpki)))));

  const tbs = seq(
    explicit(0, integer(2)),
    integer(serial),
    sigAlg,
    encodeName(o.issuer ?? o.subject),
    seq(time(notBefore), time(notAfter)),
    encodeName(o.subject),
    spki,
    explicit(3, seq(...exts)),
  );
  const raw = new Uint8Array(await s.sign({ name: 'ECDSA', hash: 'SHA-256' }, o.signingKey, tbs as BufferSource));
  return seq(tbs, sigAlg, bitString(rawEcdsaToDer(raw)));
}

export interface DevCertificateChain {
  /** End-entity signing certificate followed by the CA certificate (DER). */
  chain: Uint8Array[];
  /** PKCS#8 private key of the signing certificate. */
  privateKeyPkcs8: Uint8Array;
  signingKey: CryptoKey;
}

/**
 * Generates a throw-away CA and signing certificate. Manifests signed with it are
 * structurally valid but show as "untrusted": use a certificate from a CA on the
 * C2PA trust list in production.
 */
export async function generateDevCertificateChain(name = 'Filigrane Development', days = 365): Promise<DevCertificateChain> {
  const s = subtle();
  const params = { name: 'ECDSA', namedCurve: 'P-256' };
  const ca = (await s.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair;
  const leaf = (await s.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair;
  const caName = { commonName: `${name} Root CA`, organization: name };
  const notBefore = new Date(Date.now() - 60_000);
  const caCert = await createCertificate({
    subject: caName,
    publicKey: ca.publicKey,
    signingKey: ca.privateKey,
    isCA: true,
    notBefore,
    notAfter: new Date(notBefore.getTime() + 2 * days * 24 * 3600_000),
  });
  const leafCert = await createCertificate({
    subject: { commonName: `${name} Signer`, organization: name },
    issuer: caName,
    publicKey: leaf.publicKey,
    issuerPublicKey: ca.publicKey,
    signingKey: ca.privateKey,
    notBefore,
    notAfter: new Date(notBefore.getTime() + days * 24 * 3600_000),
    extKeyUsage: [OID.ekuEmailProtection, OID.ekuDocumentSigning],
  });
  return {
    chain: [leafCert, caCert],
    privateKeyPkcs8: new Uint8Array(await s.exportKey('pkcs8', leaf.privateKey)),
    signingKey: leaf.privateKey,
  };
}

export function describeName(dn: DistinguishedName): string {
  return [dn.commonName, dn.organization].filter(Boolean).join(', ') || 'Unknown';
}
