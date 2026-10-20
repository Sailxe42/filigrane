# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com) and the project uses [Semantic Versioning](https://semver.org).

## [0.1.0] — unreleased

### Added

- `@filigrane/core`: `markImage()` / `verifyImage()` with three layers (C2PA claim v2 manifest, IPTC metadata, fgw1 watermark) for JPEG, PNG and WebP (WebP pixels through a pluggable codec: `createSharpCodec`, `createCanvasCodec`); `markText()` / `readText()`; pure TypeScript C2PA signing and validation (CBOR, JUMBF, COSE, X.509) interoperability-tested against c2pa-rs; development certificate generation.
- `@filigrane/ui`: `<ai-disclosure>` and `<ai-label>` Web Components in the 24 official EU languages, with the official EU icons; `disclosureText()`.
- `filigrane` CLI: `mark`, `verify`, `scan` (text, JSON, SARIF, Markdown) and `keygen`.
- GitHub Action for AI transparency scans.
- Website with an in-browser verifier and marking playground.
