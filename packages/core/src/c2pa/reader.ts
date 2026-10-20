/**
 * Reads and validates an embedded C2PA manifest store.
 *
 * Checks performed on the active manifest (status codes follow the C2PA spec):
 *  - every hashed URI in the claim matches its assertion  (assertion.hashedURI.*)
 *  - the hard binding matches the file bytes              (assertion.dataHash.*)
 *  - the COSE signature matches the claim                 (claimSignature.*)
 *  - the signing certificate is valid and suitable        (signingCredential.*)
 */
import { decodeCbor } from '../cbor/cbor.ts';
import { coseVerify1, parseCoseSign1 } from '../crypto/cose.ts';
import { C2PA_SIGNING_EKUS, type Certificate, describeName, parseCertificate, verifyIssuedBy } from '../crypto/x509.ts';
import type { AssetContainer } from '../containers/container.ts';
import { contentOf, findChild, parseJumbf, type SuperBox, superboxPayload, uuidString } from '../jumbf/jumbf.ts';
import { concat, equalBytes, subtle, textDecoder, toHex } from '../util/bytes.ts';
import { AI_SOURCE_TYPES, LABEL, UUID } from './labels.ts';

export interface ValidationEntry {
  code: string;
  ok: boolean;
  message: string;
}

export interface SignatureInfo {
  alg?: string;
  issuer: string;
  subject: string;
  notBefore?: Date;
  notAfter?: Date;
  serialNumber?: string;
  /** Signature matches the claim. */
  valid: boolean;
  /** Chains to one of the supplied trust anchors (null when no anchors were supplied). */
  trusted: boolean | null;
}

export interface ActionInfo {
  action: string;
  digitalSourceType?: string;
  softwareAgent?: string;
  description?: string;
}

export interface ManifestReport {
  label: string;
  title?: string;
  claimGenerator?: string;
  instanceId?: string;
  claimVersion: 1 | 2;
  assertions: { label: string; data?: unknown }[];
  actions: ActionInfo[];
  /** True when an action declares a trained-algorithm (AI) digital source type. */
  aiGenerated: boolean;
  digitalSourceType?: string;
  softBindings: { alg: string; value: string }[];
  signature: SignatureInfo;
  validation: ValidationEntry[];
  /** True when all integrity checks passed (trust is reported separately). */
  valid: boolean;
}

export interface C2paReport {
  present: boolean;
  active?: ManifestReport;
  /** Labels of all manifests in the store (ingredients first, active last). */
  manifests: string[];
  error?: string;
}

export interface ReadOptions {
  /** PEM or DER trust anchors; when given, the signer chain must lead to one of them. */
  trustAnchors?: Uint8Array[];
  /** Date used for certificate validity checks (defaults to now). */
  now?: Date;
}

const HASH_ALGS: Record<string, string> = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };

async function digest(alg: string | undefined, data: Uint8Array): Promise<Uint8Array> {
  const name = HASH_ALGS[alg ?? 'sha256'];
  if (!name) throw new Error(`Unsupported hash algorithm ${alg}`);
  return new Uint8Array(await subtle().digest(name, data as BufferSource));
}

interface HashedUri {
  url: string;
  hash: Uint8Array;
  alg?: string;
}

function isManifest(n: SuperBox): boolean {
  const u = uuidString(n.desc.uuid);
  return u === UUID.manifest || u === UUID.updateManifest;
}

function resolveAssertion(store: SuperBox, manifest: SuperBox, url: string): SuperBox | undefined {
  const path = url.replace(/^self#jumbf=/, '');
  const parts = path.split('/').filter(Boolean);
  let target = manifest;
  if (path.startsWith('/')) {
    // Absolute: /c2pa/<manifest>/c2pa.assertions/<label>
    const m = store.children.find((c): c is SuperBox => c.kind === 'super' && c.desc.label === parts[1]);
    if (!m) return undefined;
    target = m;
    parts.splice(0, 2);
  }
  let node: SuperBox | undefined = target;
  for (const p of parts) node = node && findChild(node, p);
  return node;
}

function assertionData(box: SuperBox): unknown {
  const c = contentOf(box);
  if (!c) return undefined;
  try {
    if (c.type === 'cbor') return decodeCbor(c.data);
    if (c.type === 'json') return JSON.parse(textDecoder.decode(c.data));
  } catch {
    return undefined;
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function generatorName(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return generatorName(v[0]);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return [str(o.name), str(o.version)].filter(Boolean).join(' ') || undefined;
  }
  return undefined;
}

/** A certificate may issue others only if it is a CA allowed to sign certificates. */
function canIssue(cert: Certificate, now: Date): boolean {
  return cert.isCA && (cert.keyUsage.size === 0 || cert.keyUsage.has('keyCertSign')) && now >= cert.notBefore && now <= cert.notAfter;
}

async function checkChain(certs: Certificate[], anchors: Certificate[], now: Date): Promise<boolean> {
  for (let i = 0; i < certs.length; i++) {
    const cert = certs[i];
    for (const anchor of anchors) {
      if (equalBytes(cert.der, anchor.der)) return true;
      if (canIssue(anchor, now) && (await verifyIssuedBy(cert, anchor).catch(() => false))) return true;
    }
    const next = certs[i + 1];
    if (!next || !canIssue(next, now) || !(await verifyIssuedBy(cert, next).catch(() => false))) return false;
  }
  return false;
}

interface Exclusion {
  start: number;
  length: number;
}

/**
 * Exclusions must only skip the bytes of the embedded manifest store: otherwise a
 * signer could leave parts of the image unprotected.
 */
function exclusionsValid(exclusions: unknown, ranges: { start: number; end: number }[], size: number): exclusions is Exclusion[] {
  if (!Array.isArray(exclusions)) return false;
  // A large store spans several adjacent JPEG segments: merge touching ranges.
  const merged: { start: number; end: number }[] = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  ranges = merged;
  let previousEnd = 0;
  for (const ex of [...exclusions].sort((a, b) => a?.start - b?.start)) {
    if (!ex || !Number.isSafeInteger(ex.start) || !Number.isSafeInteger(ex.length) || ex.start < 0 || ex.length < 0) return false;
    const end = ex.start + ex.length;
    if (ex.start < previousEnd || end > size) return false;
    if (!ranges.some((r) => ex.start >= r.start && end <= r.end)) return false;
    previousEnd = end;
  }
  return true;
}

async function validateManifest(
  asset: Uint8Array,
  ranges: { start: number; end: number }[],
  store: SuperBox,
  manifest: SuperBox,
  opts: ReadOptions,
): Promise<ManifestReport> {
  const validation: ValidationEntry[] = [];
  const add = (code: string, ok: boolean, message: string) => validation.push({ code, ok, message });

  const claimBox = findChild(manifest, LABEL.claimV2) ?? findChild(manifest, LABEL.claimV1);
  const claimVersion: 1 | 2 = claimBox?.desc.label === LABEL.claimV2 ? 2 : 1;
  const claimBytes = claimBox && contentOf(claimBox, 'cbor')?.data;
  const decoded = claimBytes ? decodeCbor(claimBytes) : {};
  const claim = (decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded : {}) as Record<string, unknown>;
  if (!claimBytes) add('claim.missing', false, 'The manifest has no claim');

  // 1. Hashed URIs. Only assertions referenced by the signed claim, with a matching
  // hash, are used below: anything else in the store is unsigned and ignored.
  const list = (v: unknown) => (Array.isArray(v) ? (v as HashedUri[]) : []);
  const uris = [...list(claim.created_assertions), ...list(claim.gathered_assertions), ...list(claim.assertions)];
  const assertions: SuperBox[] = [];
  for (const uri of uris) {
    const box = typeof uri?.url === 'string' ? resolveAssertion(store, manifest, uri.url) : undefined;
    if (!box) {
      add('assertion.missing', false, `Assertion not found: ${String(uri?.url)}`);
      continue;
    }
    const actual = await digest(uri.alg ?? str(claim.alg), superboxPayload(box));
    const ok = uri.hash instanceof Uint8Array && equalBytes(actual, uri.hash);
    add(ok ? 'assertion.hashedURI.match' : 'assertion.hashedURI.mismatch', ok, `${box.desc.label}`);
    if (ok && !assertions.includes(box)) assertions.push(box);
  }

  // 2. Hard binding
  const isHashData = (a: SuperBox) => a.desc.label === LABEL.hashData || !!a.desc.label?.startsWith(`${LABEL.hashData}__`);
  const hashBox = assertions.find(isHashData);
  if (hashBox) {
    const hd = assertionData(hashBox) as { exclusions?: unknown; alg?: string; hash?: Uint8Array } | undefined;
    const exclusions = hd?.exclusions ?? [];
    if (!exclusionsValid(exclusions, ranges, asset.length)) {
      add('assertion.dataHash.mismatch', false, 'The signed hash skips bytes outside the manifest');
    } else {
      const parts: Uint8Array[] = [];
      let pos = 0;
      for (const ex of [...exclusions].sort((a, b) => a.start - b.start)) {
        parts.push(asset.subarray(pos, ex.start));
        pos = ex.start + ex.length;
      }
      parts.push(asset.subarray(pos));
      const actual = await digest(hd?.alg ?? str(claim.alg), concat(parts));
      const ok = hd?.hash instanceof Uint8Array && equalBytes(actual, hd.hash);
      add(ok ? 'assertion.dataHash.match' : 'assertion.dataHash.mismatch', ok, ok ? 'File content matches the signed hash' : 'The file was modified after signing');
    }
  } else if (assertions.some((a) => a.desc.label?.startsWith('c2pa.hash.'))) {
    add('assertion.hardBinding.unsupported', false, 'This hard-binding type is not supported yet');
  } else {
    add('claim.hardBindings.missing', false, 'No hard binding to the file content');
  }

  // 3. Signature
  const sigBox = findChild(manifest, LABEL.signature);
  const sigBytes = sigBox && contentOf(sigBox, 'cbor')?.data;
  const signature: SignatureInfo = { issuer: 'Unknown', subject: 'Unknown', valid: false, trusted: null };
  if (sigBytes && claimBytes) {
    try {
      const cose = parseCoseSign1(sigBytes);
      const leaf = cose.certificates[0];
      signature.alg = cose.alg;
      if (leaf) {
        signature.issuer = describeName(leaf.issuer);
        signature.subject = describeName(leaf.subject);
        signature.notBefore = leaf.notBefore;
        signature.notAfter = leaf.notAfter;
        signature.serialNumber = leaf.serialNumber;
      }
      signature.valid = await coseVerify1(cose, claimBytes);
      add(signature.valid ? 'claimSignature.validated' : 'claimSignature.mismatch', signature.valid, signature.valid ? 'Claim signature is valid' : 'Claim signature does not match');
      if (leaf) {
        const now = opts.now ?? new Date();
        const inside = now >= leaf.notBefore && now <= leaf.notAfter;
        add(inside ? 'claimSignature.insideValidity' : 'signingCredential.expired', inside, inside ? 'Signing certificate is within its validity period' : 'Signing certificate is expired or not yet valid');
        const profileOk = !leaf.isCA && leaf.keyUsage.has('digitalSignature') && leaf.extKeyUsage.some((e) => C2PA_SIGNING_EKUS.includes(e));
        if (!profileOk) add('signingCredential.invalid', false, 'Signing certificate does not meet the C2PA certificate profile');
        if (opts.trustAnchors?.length) {
          signature.trusted = await checkChain(cose.certificates, opts.trustAnchors.map(parseCertificate), now);
          add(signature.trusted ? 'signingCredential.trusted' : 'signingCredential.untrusted', signature.trusted, signature.trusted ? 'Signer chains to a trusted anchor' : 'Signer is not on the trust list');
        }
      }
    } catch (e) {
      add('claimSignature.missing', false, `Unreadable signature: ${(e as Error).message}`);
    }
  } else {
    add('claimSignature.missing', false, 'The manifest is not signed');
  }

  // 4. Human-readable information
  const actions: ActionInfo[] = [];
  const softBindings: { alg: string; value: string }[] = [];
  const assertionList = assertions.map((a) => {
    const data = assertionData(a);
    const label = a.desc.label ?? '';
    if (label.startsWith(LABEL.actions)) {
      for (const act of ((data as { actions?: Record<string, unknown>[] })?.actions ?? [])) {
        actions.push({
          action: str(act.action) ?? 'unknown',
          digitalSourceType: str(act.digitalSourceType),
          softwareAgent: generatorName(act.softwareAgent),
          description: str(act.description),
        });
      }
    }
    if (label.startsWith(LABEL.softBinding)) {
      const sb = data as { alg?: string; blocks?: { value?: unknown }[] };
      for (const block of sb?.blocks ?? []) {
        const v = block.value;
        softBindings.push({ alg: sb.alg ?? 'unknown', value: typeof v === 'string' ? v : v instanceof Uint8Array ? toHex(v) : '' });
      }
    }
    return { label, data };
  });

  const aiAction = actions.find((a) => a.digitalSourceType && AI_SOURCE_TYPES.has(a.digitalSourceType));
  const integrity = validation.filter((v) => !v.code.startsWith('signingCredential.untrusted') && !v.code.startsWith('signingCredential.trusted'));

  return {
    label: manifest.desc.label ?? '',
    title: str(claim['dc:title']),
    claimGenerator: generatorName(claim.claim_generator_info) ?? str(claim.claim_generator),
    instanceId: str(claim.instanceID),
    claimVersion,
    assertions: assertionList,
    actions,
    aiGenerated: !!aiAction,
    digitalSourceType: aiAction?.digitalSourceType ?? actions.find((a) => a.digitalSourceType)?.digitalSourceType,
    softBindings,
    signature,
    validation,
    valid: integrity.every((v) => v.ok),
  };
}

/** Reads and validates the C2PA manifest store embedded in `asset`. */
export async function readC2pa(asset: Uint8Array, container: AssetContainer, opts: ReadOptions = {}): Promise<C2paReport> {
  let found: ReturnType<AssetContainer['read']>;
  try {
    found = container.read(asset);
  } catch (e) {
    return { present: false, manifests: [], error: (e as Error).message };
  }
  if (!found) return { present: false, manifests: [] };
  try {
    const store = parseJumbf(found.store);
    const manifests = store.children.filter((c): c is SuperBox => c.kind === 'super' && isManifest(c));
    const active = manifests[manifests.length - 1];
    if (!active) return { present: true, manifests: [], error: 'Empty manifest store' };
    return {
      present: true,
      manifests: manifests.map((m) => m.desc.label ?? ''),
      active: await validateManifest(asset, found.ranges, store, active, opts),
    };
  } catch (e) {
    return { present: true, manifests: [], error: `Malformed manifest store: ${(e as Error).message}` };
  }
}
