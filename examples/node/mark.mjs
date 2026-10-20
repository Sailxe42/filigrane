// Mark every AI-generated image of a folder: node mark.mjs ./generated
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createDevSigner, createLocalSigner, markImage } from '@filigrane/core';

const dir = process.argv[2] ?? '.';
const signer = process.env.FILIGRANE_CERT
  ? await createLocalSigner({ certificate: process.env.FILIGRANE_CERT, privateKey: process.env.FILIGRANE_KEY })
  : await createDevSigner('Example (development)');

for (const name of await readdir(dir)) {
  if (!/\.(jpe?g|png)$/i.test(name) || name.includes('.ai.')) continue;
  const input = await readFile(path.join(dir, name));
  const { bytes, layers } = await markImage(input, { signer, model: { name: 'Example Model' } });
  const out = path.join(dir, name.replace(/(\.\w+)$/, '.ai$1'));
  await writeFile(out, bytes);
  console.log(`${out}: ${layers.join(' + ')}`);
}
