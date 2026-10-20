# Signing certificates

The C2PA layer is signed with an X.509 certificate. Anyone can verify the signature; the certificate tells verifiers *who* signed.

## Development

```bash
npx filigrane keygen --name "My Company"   # writes .filigrane/dev-chain.pem and .filigrane/dev-key.pem
```

or in code:

```ts
import { createDevSigner } from '@filigrane/core';
const signer = await createDevSigner('My Company (development)');
```

Manifests signed this way are cryptographically valid, but verifiers show the signer as **untrusted** because the development CA is not on any trust list. Never ship a development key.

## Production

1. Obtain a C2PA signing certificate from a certification authority whose root is on the **C2PA trust list**. The [C2PA](https://c2pa.org) conformance program governs which products can be issued such certificates; check its website for the current process and the list of participating CAs.
2. Requirements checked by Filigrane and other validators:
   - ECDSA key on P-256, P-384 or P-521 (Filigrane signs with ES256/384/512),
   - `digitalSignature` key usage, not a CA certificate,
   - an extended key usage accepted by C2PA (for example `id-kp-documentSigning` or `id-kp-emailProtection`).
3. Store the private key in a secret manager, never in the repository.

```ts
const signer = await createLocalSigner({
  certificate: process.env.FILIGRANE_CERT!, // PEM chain: signing certificate, then intermediates
  privateKey: process.env.FILIGRANE_KEY!,   // PKCS#8 "PRIVATE KEY" or SEC1 "EC PRIVATE KEY"
});
```

The CLI reads the same variables: `FILIGRANE_CERT` and `FILIGRANE_KEY` (file paths or PEM text).

## Keys in a KMS or HSM

A signer is any object with an algorithm, a certificate chain and a `sign` function, so the private key never has to leave your key management service:

```ts
import type { Signer } from '@filigrane/core';

const kmsSigner: Signer = {
  alg: 'ES256',
  certificates: [leafDer, intermediateDer],
  async sign(data) {
    // Ask your KMS to sign SHA-256(data) with ECDSA P-256.
    // Return the raw 64-byte signature (r || s). Many KMS return DER: convert it first.
    return rawSignature;
  },
};
```

## Verifying against a trust list

```ts
const report = await verifyImage(bytes, { trustAnchors: trustedRootsPem });
report.c2pa.active?.signature.trusted; // true when the signer chains to one of the anchors
```

```bash
npx filigrane verify image.jpg --trust trusted-roots.pem
```
