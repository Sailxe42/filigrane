# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com) and the project uses [Semantic Versioning](https://semver.org).

## [0.1.2] — 2026-10-20

Security release: update `@filigranejs/core` and `filigrane` (the CLI). `@filigranejs/ui` is unchanged (0.1.0).

### Security

- C2PA verification only uses assertions referenced by the signed claim. Before, an unsigned assertion added to a manifest could hide changes to the image or add a false "AI-generated" action.
- The data-hash exclusions must cover only the embedded manifest: a signed hash can no longer leave image bytes unprotected.
- Trust-list checks require every issuing certificate to be a certificate authority (basic constraints, key usage, validity): a signing certificate can no longer issue "trusted" certificates under any name.
- Assertion hashes are computed over the original bytes of the manifest, as the C2PA specification requires.
- Hostile files: a PNG XMP chunk without terminators no longer blocks reading forever; PNG decompression stops at the size declared in the header ("zlib bomb"); CBOR `__proto__` keys stay plain data; JUMBF and DER nesting is limited; truncated JPEG markers are rejected.
- Regression tests for each of these attacks (`packages/core/test/security.test.ts`).

### Changed

- JPEG decoding is limited to 100 megapixels and 1 GB of memory.
- `markImage()` reads the watermark back after encoding: on images too small or too uniform for it to survive compression, it is no longer listed in `layers` (a warning explains why) and no soft-binding assertion points to it.
- `filigrane verify` reports unreadable files and continues with the others (exit code 2 when a file fails).
- `filigrane scan` maps matches to lines in O(log n) instead of re-reading the file for each match.
- `filigrane scan <subfolder>` reports paths relative to the working directory, so GitHub code scanning links findings to the right files when the action scans a subfolder.
- GitHub Action: keeps the job's Node.js version when it is 20 or newer, writes its reports to the runner's temporary directory, runs the scan twice instead of three times, and uses CLI version `0` (latest 0.x) by default instead of `latest`.
- Website: Content Security Policy, legal notice and third-party licences; the language is stored only when the visitor picks one; object URLs are released.

## [0.1.1] — 2026-10-20

### Changed

- GitHub Action: shorter description so the action can be listed on the GitHub Marketplace. The npm packages are unchanged (0.1.0).

## [0.1.0] — 2026-10-20

### Added

- `@filigranejs/core`: `markImage()` / `verifyImage()` with three layers (C2PA claim v2 manifest, IPTC metadata, fgw1 watermark) for JPEG, PNG and WebP (WebP pixels through a pluggable codec: `createSharpCodec`, `createCanvasCodec`); `markText()` / `readText()`; pure TypeScript C2PA signing and validation (CBOR, JUMBF, COSE, X.509) interoperability-tested against c2pa-rs; development certificate generation.
- `@filigranejs/ui`: `<ai-disclosure>` and `<ai-label>` Web Components in the 24 official EU languages, with the official EU icons; `disclosureText()`.
- `filigrane` CLI: `mark`, `verify`, `scan` (text, JSON, SARIF, Markdown) and `keygen`.
- GitHub Action for AI transparency scans.
- Website with an in-browser verifier and marking playground.
