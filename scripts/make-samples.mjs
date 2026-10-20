/** Builds the sample images used by the online verifier (run after `npm run build`). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createDevSigner, decodeImage, encodeImage, markImage } from '../packages/core/dist/index.js';

const W = 1200, H = 800;
const data = new Uint8Array(W * H * 4);
let seed = 7;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const hill = (x, f, a, p) => Math.sin(x * f + p) * a;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H;
    // Sunset sky
    let r = 255 * (0.98 - 0.35 * t), g = 120 + 90 * (1 - t) * (1 - t), b = 90 + 140 * t;
    const sun = Math.hypot(x - 820, y - 330) / 110;
    if (sun < 1) { r = 255; g = 230 - sun * 40; b = 170 - sun * 60; } else if (sun < 2.4) { const k = (2.4 - sun) / 1.4; r += (255 - r) * k * 0.5; g += (210 - g) * k * 0.5; }
    // Layered hills
    const h1 = 520 + hill(x, 0.006, 40, 1) + hill(x, 0.017, 14, 3);
    const h2 = 600 + hill(x, 0.004, 55, 2) + hill(x, 0.013, 18, 0.5);
    const h3 = 690 + hill(x, 0.005, 35, 4) + hill(x, 0.021, 10, 1.5);
    if (y > h1) { r = 120; g = 70; b = 120; }
    if (y > h2) { r = 70; g = 45; b = 95; }
    if (y > h3) { r = 35; g = 25; b = 60; }
    const n = (rnd() - 0.5) * 10;
    const i = (y * W + x) * 4;
    data[i] = Math.max(0, Math.min(255, r + n));
    data[i + 1] = Math.max(0, Math.min(255, g + n));
    data[i + 2] = Math.max(0, Math.min(255, b + n));
    data[i + 3] = 255;
  }
}
const plain = encodeImage({ width: W, height: H, data }, 'jpeg', { quality: 90 });
const signer = await createDevSigner('Filigrane Demo');
const marked = await markImage(plain, { signer, model: { name: 'Demo Landscape Model', version: '1.0' }, generator: { name: 'Filigrane samples', version: '0.1.0' }, title: 'ai-generated.jpg' });
const laundered = encodeImage(decodeImage(marked.bytes), 'jpeg', { quality: 75 });
mkdirSync('apps/site/public/samples', { recursive: true });
writeFileSync('apps/site/public/samples/unmarked.jpg', plain);
writeFileSync('apps/site/public/samples/ai-generated.jpg', marked.bytes);
writeFileSync('apps/site/public/samples/after-social-network.jpg', laundered);
console.log('samples written', plain.length, marked.bytes.length, laundered.length);
