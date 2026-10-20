/**
 * Reproducible robustness benchmark for the fgw1 watermark (run after `npm run build`).
 *   node scripts/benchmark-watermark.mjs
 * Prints a Markdown table: detection rate per transformation over synthetic photos.
 */
import { decodeImage, detectWatermark, embedWatermark, encodeImage } from '../packages/core/dist/index.js';

function photo(w, h, seed) {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const d = new Uint8Array(w * h * 4);
  const shapes = Array.from({ length: 24 }, () => ({ x: rnd() * w, y: rnd() * h, r: 8 + (rnd() * Math.min(w, h)) / 4, c: [rnd() * 255, rnd() * 255, rnd() * 255] }));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 40 + (150 * x) / w, g = 60 + (120 * y) / h, b = 140 + 60 * Math.sin(x / 37) * Math.cos(y / 23);
    for (const sh of shapes) if (Math.hypot(x - sh.x, y - sh.y) < sh.r) { r = r * 0.4 + sh.c[0] * 0.6; g = g * 0.4 + sh.c[1] * 0.6; b = b * 0.4 + sh.c[2] * 0.6; }
    const n = (rnd() - 0.5) * 18, i = (y * w + x) * 4;
    d[i] = Math.max(0, Math.min(255, r + n)); d[i + 1] = Math.max(0, Math.min(255, g + n)); d[i + 2] = Math.max(0, Math.min(255, b + n)); d[i + 3] = 255;
  }
  return { width: w, height: h, data: d };
}
function resize(r, w, h) {
  w = Math.round(w); h = Math.round(h);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(r.width - 1, Math.floor((x + 0.5) * r.width / w)), sy = Math.min(r.height - 1, Math.floor((y + 0.5) * r.height / h));
    for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = r.data[(sy * r.width + sx) * 4 + c];
  }
  return { width: w, height: h, data: out };
}
const psnr = (a, b) => { let se = 0; for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) se += (a.data[i + c] - b.data[i + c]) ** 2; return 10 * Math.log10(255 ** 2 / (se / (a.width * a.height * 3))); };
const jpeg = (r, q) => decodeImage(encodeImage(r, 'jpeg', { quality: q }));
const adjust = (r, f) => ({ ...r, data: r.data.map((v, i) => (i % 4 === 3 ? v : Math.max(0, Math.min(255, Math.round(f(v)))))) });

const sizes = [[1024, 768], [1920, 1080], [800, 800], [768, 1024], [3000, 2000]];
const attacks = [
  ['No change', (r) => r],
  ['JPEG quality 90', (r) => jpeg(r, 90)],
  ['JPEG quality 75', (r) => jpeg(r, 75)],
  ['JPEG quality 50', (r) => jpeg(r, 50)],
  ['JPEG quality 30', (r) => jpeg(r, 30)],
  ['Resize to 50 %', (r) => resize(r, r.width / 2, r.height / 2)],
  ['Resize to 25 % + JPEG 80', (r) => jpeg(resize(r, r.width / 4, r.height / 4), 80)],
  ['Upscale to 150 %', (r) => resize(r, r.width * 1.5, r.height * 1.5)],
  ['Brightness +20', (r) => adjust(r, (v) => v + 20)],
  ['Contrast ×1.2', (r) => adjust(r, (v) => (v - 128) * 1.2 + 128)],
  ['Metadata stripped + JPEG 75 (social network)', (r) => jpeg(r, 75)],
];
const marked = sizes.map(([w, h], i) => { const img = photo(w, h, 1000 + i); const wm = embedWatermark(img, { aiGenerated: true, id: 0x5eed0000 + i }); return { img, wm, id: 0x5eed0000 + i }; });
const ps = marked.map((m) => psnr(m.img, m.wm));
console.log(`Average PSNR: ${(ps.reduce((a, b) => a + b) / ps.length).toFixed(1)} dB (min ${Math.min(...ps).toFixed(1)} dB) over ${sizes.length} images\n`);
console.log('| Transformation | Detected |\n| --- | --- |');
for (const [name, f] of attacks) {
  const ok = marked.filter((m) => detectWatermark(f(m.wm)).payload?.id === m.id).length;
  console.log(`| ${name} | ${ok}/${marked.length} |`);
}
let fp = 0;
for (let i = 0; i < 20; i++) if (detectWatermark(photo(640, 480, 5000 + i)).detected) fp++;
console.log(`| Unmarked images (false positives) | ${fp}/20 |`);
