/**
 * COSE_Sign1 (RFC 9052) with a detached payload, as used for C2PA claim signatures.
 * The signed bytes are the CBOR Sig_structure ["Signature1", protected, h'', claim].
 */
import { decodeCbor, encodeCbor, Tagged } from '../cbor/cbor.ts';
import type { Signer } from './signer.ts';
import { type Certificate, importCertificateKey, parseCertificate } from './x509.ts';
import { subtle } from '../util/bytes.ts';

export const COSE_ALG: Record<string, number> = {
  ES256: -7,
  ES384: -35,
  ES512: -36,
  PS256: -37,
  PS384: -38,
  PS512: -39,
  Ed25519: -8,
};

const ALG_NAMES: Record<number, string> = Object.fromEntries(Object.entries(COSE_ALG).map(([k, v]) => [v, k]));

const HEADER_ALG = 1;
const HEADER_X5CHAIN = 33;
const COSE_SIGN1_TAG = 18;

function sigStructure(protectedBytes: Uint8Array, payload: Uint8Array): Uint8Array {
  return encodeCbor(['Signature1', protectedBytes, new Uint8Array(0), payload]);
}

/** Signs `payload` and returns the tagged COSE_Sign1 structure (detached payload). */
export async function coseSign1(payload: Uint8Array, signer: Signer): Promise<Uint8Array> {
  const alg = COSE_ALG[signer.alg];
  const protectedHeader = new Map<number, unknown>([
    [HEADER_ALG, alg],
    [HEADER_X5CHAIN, signer.certificates.length === 1 ? signer.certificates[0] : signer.certificates],
  ]);
  const protectedBytes = encodeCbor(protectedHeader);
  const signature = await signer.sign(sigStructure(protectedBytes, payload));
  return encodeCbor(new Tagged(COSE_SIGN1_TAG, [protectedBytes, new Map(), null, signature]));
}

export interface CoseInfo {
  alg?: string;
  certificates: Certificate[];
  protectedBytes: Uint8Array;
  signature: Uint8Array;
}

function x5chain(v: unknown): Uint8Array[] {
  if (v instanceof Uint8Array) return [v];
  if (Array.isArray(v)) return v.filter((x): x is Uint8Array => x instanceof Uint8Array);
  return [];
}

function headerGet(h: unknown, key: number, textKey?: string): unknown {
  if (h instanceof Map) return h.get(key) ?? (textKey ? h.get(textKey) : undefined);
  if (h && typeof h === 'object') return (h as Record<string, unknown>)[textKey ?? String(key)];
  return undefined;
}

export function parseCoseSign1(bytes: Uint8Array): CoseInfo {
  let v = decodeCbor(bytes);
  if (v instanceof Tagged) v = v.value;
  if (!Array.isArray(v) || v.length !== 4) throw new Error('Not a COSE_Sign1 structure');
  const [protectedBytes, unprotected, , signature] = v as [Uint8Array, unknown, unknown, Uint8Array];
  const protectedHeader = protectedBytes.length ? decodeCbor(protectedBytes) : new Map();
  const algId = headerGet(protectedHeader, HEADER_ALG);
  const chain = x5chain(headerGet(protectedHeader, HEADER_X5CHAIN) ?? headerGet(unprotected, HEADER_X5CHAIN, 'x5chain'));
  return {
    alg: typeof algId === 'number' ? ALG_NAMES[algId] : undefined,
    certificates: chain.map(parseCertificate),
    protectedBytes,
    signature,
  };
}

/** Verifies a detached-payload COSE_Sign1 signature against `payload`. */
export async function coseVerify1(info: CoseInfo, payload: Uint8Array): Promise<boolean> {
  const leaf = info.certificates[0];
  if (!leaf || !info.alg) return false;
  const { key, params } = await importCertificateKey(leaf, COSE_ALG[info.alg]);
  return subtle().verify(params, key, info.signature as BufferSource, sigStructure(info.protectedBytes, payload) as BufferSource);
}
