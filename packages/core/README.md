# @filigrane/core

Mark, label and verify AI-generated content for the EU AI Act (Article 50): signed **C2PA** manifests, **IPTC** "AI-generated" metadata, an invisible **watermark** that survives recompression and resizing, and invisible text markers. JPEG, PNG and WebP. Pure TypeScript on WebCrypto — Node.js 20+, browsers, Deno, Bun and edge runtimes.

```bash
npm install @filigrane/core
```

```ts
import { createLocalSigner, markImage, verifyImage, markText } from '@filigrane/core';

const signer = await createLocalSigner({ certificate: process.env.FILIGRANE_CERT, privateKey: process.env.FILIGRANE_KEY });
const { bytes, layers } = await markImage(png, { signer, model: { name: 'gpt-image-1' } });
// layers → ['watermark', 'metadata', 'c2pa']

const report = await verifyImage(bytes);
report.verdict; // 'ai-generated'

const answer = markText(llmOutput); // invisible, paragraph-level markers
```

Development without a certificate: `createDevSigner()`.

Documentation, robustness benchmark and interoperability results: <https://github.com/Sailxe42/filigrane>

Not legal advice. MIT licence.
