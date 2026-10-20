/**
 * Builds and embeds a signed C2PA manifest (claim v2) into an asset.
 *
 * Layout produced (identical in shape to the reference implementation):
 *
 *   c2pa (manifest store)
 *   └─ urn:c2pa:<uuid> (manifest)
 *      ├─ c2pa.assertions
 *      │  ├─ c2pa.actions.v2      (cbor, salted)
 *      │  ├─ …extra assertions    (cbor, salted)
 *      │  └─ c2pa.hash.data       (cbor, salted) — hard binding to the file bytes
 *      ├─ c2pa.claim.v2           (cbor)
 *      └─ c2pa.signature          (COSE_Sign1, detached claim payload)
 */
import { encodeCbor } from '../cbor/cbor.ts';
import { coseSign1 } from '../crypto/cose.ts';
import type { Signer } from '../crypto/signer.ts';
import type { AssetContainer } from '../containers/container.ts';
import { type SuperBox, serializeJumbf, superboxPayload, uuidBytes, TOGGLE_LABEL, TOGGLE_REQUESTABLE } from '../jumbf/jumbf.ts';
import { ascii, concat, randomBytes, sha256, u32, uuidV4 } from '../util/bytes.ts';
import { LABEL, UUID } from './labels.ts';

export interface AssertionInput {
  label: string;
  /** Any CBOR-encodable value. */
  data: unknown;
}

export interface GeneratorInfo {
  name: string;
  version?: string;
  [key: string]: unknown;
}

export interface SignManifestOptions {
  signer: Signer;
  /** Assertions created by this claim generator (actions, soft bindings, …). */
  assertions: AssertionInput[];
  claimGenerator: GeneratorInfo;
  title?: string;
  /** Instance ID of the asset; generated when omitted. */
  instanceId?: string;
  /** Manifest label ("urn:c2pa:<uuid>"); generated when omitted. */
  manifestLabel?: string;
}

export function newManifestLabel(): string {
  return `urn:c2pa:${uuidV4()}`;
}

const TOGGLES = TOGGLE_REQUESTABLE | TOGGLE_LABEL;

function saltBox(): Uint8Array {
  // Private "c2sh" box holding a 16-byte salt, so assertion hashes cannot be brute-forced.
  return concat([u32(24), ascii('c2sh'), randomBytes(16)]);
}

function cborAssertion(label: string, data: unknown, salt: Uint8Array): SuperBox {
  return {
    kind: 'super',
    desc: { uuid: uuidBytes(UUID.cbor), toggles: TOGGLES | 0x10, label, privateBox: salt },
    children: [{ kind: 'content', type: 'cbor', data: encodeCbor(data) }],
  };
}

function superbox(uuid: string, label: string, children: SuperBox['children']): SuperBox {
  return { kind: 'super', desc: { uuid: uuidBytes(uuid), toggles: TOGGLES, label }, children };
}

/** Signs and embeds a manifest; returns the new file bytes and the manifest label. */
export async function signAsset(
  asset: Uint8Array,
  container: AssetContainer,
  o: SignManifestOptions,
): Promise<{ bytes: Uint8Array; manifestLabel: string; store: Uint8Array }> {
  const stripped = container.strip(asset);
  const dataHash = await sha256(stripped);
  const manifestLabel = o.manifestLabel ?? newManifestLabel();
  const instanceId = o.instanceId ?? `xmp:iid:${uuidV4()}`;

  // Assertions other than the hard binding never change: build them once.
  const fixed = o.assertions.map((a) => cborAssertion(a.label, a.data, saltBox()));
  const hashSalt = saltBox();

  let exclusion = { start: 0, length: 0 };
  for (let attempt = 0; attempt < 6; attempt++) {
    const hashAssertion = cborAssertion(
      LABEL.hashData,
      { exclusions: [exclusion], name: 'jumbf manifest', alg: 'sha256', hash: dataHash, pad: new Uint8Array(0) },
      hashSalt,
    );
    const assertions = [...fixed, hashAssertion];
    const hashedUris = await Promise.all(
      assertions.map(async (a) => ({
        url: `self#jumbf=${LABEL.assertionStore}/${a.desc.label}`,
        hash: await sha256(superboxPayload(a)),
      })),
    );
    const claim: Record<string, unknown> = {
      instanceID: instanceId,
      claim_generator_info: o.claimGenerator,
      signature: `self#jumbf=/${LABEL.manifestStore}/${manifestLabel}/${LABEL.signature}`,
      created_assertions: hashedUris,
    };
    if (o.title) claim['dc:title'] = o.title;
    claim.alg = 'sha256';
    const claimBytes = encodeCbor(claim);
    const signature = await coseSign1(claimBytes, o.signer);

    const store = serializeJumbf(
      superbox(UUID.manifestStore, LABEL.manifestStore, [
        superbox(UUID.manifest, manifestLabel, [
          superbox(UUID.assertionStore, LABEL.assertionStore, assertions),
          superbox(UUID.claim, LABEL.claimV2, [{ kind: 'content', type: 'cbor', data: claimBytes }]),
          superbox(UUID.signature, LABEL.signature, [{ kind: 'content', type: 'cbor', data: signature }]),
        ]),
      ]),
    );

    const embedded = container.insert(stripped, store);
    if (embedded.range.start === exclusion.start && embedded.range.length === exclusion.length) {
      return { bytes: embedded.bytes, manifestLabel, store };
    }
    // The exclusion must describe exactly the bytes the manifest occupies; iterate until stable.
    exclusion = { start: embedded.range.start, length: embedded.range.length };
  }
  throw new Error('Could not stabilise the manifest layout');
}
