// AI Act Art. 50(2): mark AI-generated images in a machine-readable way (two layers or more).
import OpenAI from 'openai';
import { createLocalSigner, markImage } from '@filigranejs/core';

const openai = new OpenAI();
// PEM strings from your secret manager; see "Signing certificates" in the README.
const signer = createLocalSigner({ certificate: process.env.FILIGRANE_CERT!, privateKey: process.env.FILIGRANE_KEY! });

export async function POST(request: Request) {
  const { prompt } = await request.json();
  const result = await openai.images.generate({ model: 'gpt-image-1', prompt });
  const png = Uint8Array.from(atob(result.data![0].b64_json!), (c) => c.charCodeAt(0));

  const marked = await markImage(png, {
    signer: await signer,
    model: { name: 'gpt-image-1' },
    generator: { name: 'My App', version: '1.0.0' },
  });
  return new Response(marked.bytes, { headers: { 'content-type': marked.mimeType } });
}
