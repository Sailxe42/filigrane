/**
 * Interoperability check against the C2PA reference implementation (c2pa-rs via c2pa-python).
 *
 *   npm run build && pip install c2pa-python && node scripts/interop.mjs
 *
 * Marks JPEG and PNG images in every supported mode, then asks the reference
 * reader to validate them. Exits non-zero if any file is not "Valid".
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDevSigner, encodeImage, markImage } from '../packages/core/dist/index.js';

const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const dir = mkdtempSync(path.join(os.tmpdir(), 'filigrane-interop-'));
const signer = await createDevSigner('Filigrane Interop');

const w = 320;
const h = 240;
const data = new Uint8Array(w * h * 4);
for (let i = 0; i < w * h; i++) {
  data[i * 4] = (i % w) * 0.7;
  data[i * 4 + 1] = Math.floor(i / w);
  data[i * 4 + 2] = 128 + ((i * 13) % 60);
  data[i * 4 + 3] = 255;
}

const files = [];
for (const format of ['jpeg', 'png']) {
  for (const involvement of ['generated', 'modified']) {
    const marked = await markImage(encodeImage({ width: w, height: h, data }, format), {
      signer,
      involvement,
      model: { name: 'Interop Model', version: '1.0' },
    });
    const file = path.join(dir, `${involvement}.${format === 'jpeg' ? 'jpg' : 'png'}`);
    writeFileSync(file, marked.bytes);
    files.push(file);
  }
}

const out = execFileSync(python, [path.join(import.meta.dirname, 'validate.py'), ...files], { encoding: 'utf8' });
const results = JSON.parse(out);
let failed = 0;
for (const r of results) {
  const ok = r.state === 'Valid' || r.state === 'Trusted';
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${path.basename(r.file)}: ${r.state} ${r.errors.length ? JSON.stringify(r.errors) : ''}`);
}
process.exit(failed ? 1 : 0);
