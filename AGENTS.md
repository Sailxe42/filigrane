# Notes for AI coding agents

Guidance for AI assistants contributing to this repository. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Commands

- `npm test` — Vitest suite (must stay green)
- `npm run build` — `tsc -b` for the three packages
- `npm run interop` — validates marked files with the C2PA reference implementation (needs `pip install c2pa-python`)
- `node scripts/benchmark-watermark.mjs` — watermark robustness table (after build)

## Rules

- `packages/core` must run in browsers and edge runtimes: no Node-only APIs, no native dependencies, WebCrypto only.
- Source imports use `.ts` extensions (rewritten by `tsc`); keep TypeScript strict and erasable-syntax-only.
- Any change to C2PA output must keep `npm run interop` reporting **Valid** for every file.
- Numbers in the README (tests, robustness, PSNR) must come from a test or a script in the repo.
- Wording: Filigrane implements technical measures — never write that it guarantees compliance or that it is "C2PA conformant" (say "tested for interoperability with the reference implementation"). Not legal advice.
- Commits follow Conventional Commits.
