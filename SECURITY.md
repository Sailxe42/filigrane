# Security policy

Filigrane verifies signatures and parses untrusted files, so security reports matter a lot.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability reporting: *Security* tab → *Report a vulnerability* on [Sailxe42/filigrane](https://github.com/Sailxe42/filigrane/security/advisories/new).

Please include the affected package and version, a description of the issue and, if possible, a sample file or code to reproduce it. You will get an answer within 7 days.

## In scope

- Signature or hash validation that accepts a modified or forged manifest
- Crashes, hangs or excessive memory use on crafted JPEG, PNG, JUMBF, CBOR or X.509 input
- Private key exposure through the library or the CLI
- Script injection in the Web Components

## Out of scope

- The watermark being removable by a determined attacker: it is a transparency signal, not DRM (see [docs/watermark.md](docs/watermark.md))
- Development certificates showing as untrusted
