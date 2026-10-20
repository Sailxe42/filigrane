# Contributing to Filigrane

Thank you for helping make AI transparent! Contributions of all sizes are welcome.

## Good first contributions

- **Translation review**: native speakers of any of the 24 EU languages can check [`packages/ui/src/i18n.ts`](packages/ui/src/i18n.ts).
- **Examples** for other frameworks (Vue, Svelte, Astro, Express, FastAPI…).
- **Scanner rules** for more AI SDKs in [`packages/cli/src/scan/rules.ts`](packages/cli/src/scan/rules.ts).

## Development

Requirements: Node.js 20+ (22 recommended). Python 3.10+ only for the conformance check.

```bash
npm install
npm test                 # all unit and integration tests (Vitest)
npm run build            # compile packages with tsc
npm run dev:site         # website on http://localhost:5173
node scripts/benchmark-watermark.mjs   # watermark robustness (after build)
pip install c2pa-python && npm run conformance   # validate output with the C2PA reference implementation
```

Repository layout:

```
packages/core   marking, verification, C2PA, watermark (no runtime dependency besides jpeg-js and fflate)
packages/ui     Web Components
packages/cli    command-line tool
apps/site       website, verifier and playground
examples        integration examples (scanned in CI)
docs            guides and specifications
```

## Guidelines

- TypeScript strict mode, ESM, no native dependencies in `core`: it must run in browsers and edge runtimes.
- Add tests with every change; keep the conformance check green.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) (`feat(core): …`, `fix(ui): …`).
- Be precise about legal claims: Filigrane implements technical measures and never promises compliance.

By contributing you agree that your contributions are licensed under the MIT licence. Please be respectful and constructive in all interactions.
