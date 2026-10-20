import '@filigranejs/ui';
import { readText, type VerifyImageResult } from '@filigranejs/core';
import { FR, initLangSwitch, t } from './i18n.ts';
import { renderReport } from './report.ts';

Object.assign(FR, {
  'r.gen': 'Généré par IA',
  'r.mod': 'Modifié avec l’IA',
  'r.none': 'Aucun signal d’IA trouvé',
  'r.absent': 'Absent',
  'r.valid': 'Valide',
  'r.invalid': 'Invalide',
  'r.found': 'Trouvé',
  'r.trusted': 'signataire de confiance',
});

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let nextId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
worker.onmessage = (e) => {
  const p = pending.get(e.data.id);
  if (!p) return;
  pending.delete(e.data.id);
  if (e.data.ok) p.resolve(e.data.result);
  else p.reject(new Error(e.data.error));
};

function call<T>(type: 'verify' | 'mark' | 'launder', bytes: Uint8Array): Promise<T> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, bytes });
  });
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function working(target: HTMLElement): void {
  target.innerHTML = `<p class="muted"><span class="spinner"></span> ${t('v.working', 'Analysing…')}</p>`;
}

function error(target: HTMLElement, err: Error): void {
  target.innerHTML = `<div class="verdict bad" role="alert"><div><div class="big">${document.documentElement.lang === 'fr' ? 'Fichier illisible' : 'Unreadable file'}</div><div class="small">${err.message.replace(/</g, '&lt;')}</div></div></div>`;
}

async function readFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

// ---------------------------------------------------------------- verifier

let lastVerify: { report: VerifyImageResult; url: string } | undefined;

async function verifyFile(file: File): Promise<void> {
  const out = $('result');
  working(out);
  try {
    if (lastVerify) URL.revokeObjectURL(lastVerify.url);
    lastVerify = undefined;
    const url = URL.createObjectURL(file);
    const { report } = await call<{ report: VerifyImageResult }>('verify', await readFile(file));
    lastVerify = { report, url };
    out.innerHTML = renderReport(report, url);
  } catch (e) {
    error(out, e as Error);
  }
}

function initDrop(): void {
  const drop = $('drop');
  const input = $<HTMLInputElement>('file');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => input.files?.[0] && verifyFile(input.files[0]));
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-sample]')) {
    b.addEventListener('click', async () => {
      const res = await fetch(b.dataset.sample!);
      const blob = await res.blob();
      verifyFile(new File([blob], b.dataset.sample!.split('/').pop()!, { type: blob.type || 'image/jpeg' }));
    });
  }
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const file = e.dataTransfer?.files[0];
    if (file) verifyFile(file);
  });
}

// ---------------------------------------------------------------- text

function initText(): void {
  $('text-check').addEventListener('click', () => {
    const r = readText($<HTMLTextAreaElement>('text').value);
    const fr = document.documentElement.lang === 'fr';
    $('text-result').innerHTML = r.detected
      ? `<div class="verdict ai" role="status"><div><div class="big">${r.payload?.aiModified ? t('r.mod', 'Modified with AI') : t('r.gen', 'AI-generated')}</div><div class="small">${fr ? `${r.markers} marqueur(s) invisible(s) trouvé(s).` : `${r.markers} invisible marker(s) found.`}</div></div></div>`
      : `<div class="verdict none" role="status"><div><div class="big">${t('r.none', 'No AI signal found')}</div><div class="small">${fr ? 'Aucun marqueur invisible dans ce texte.' : 'No invisible marker in this text.'}</div></div></div>`;
  });
}

// ---------------------------------------------------------------- playground

let marked: { bytes: Uint8Array; mimeType: string } | undefined;
/** Object URLs of the playground previews, released when a new image is processed. */
let playUrls: string[] = [];
function playUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  playUrls.push(url);
  return url;
}

function initPlayground(): void {
  const input = $<HTMLInputElement>('play-file');
  const out = $('play-result');
  const download = $<HTMLAnchorElement>('play-download');
  const launder = $<HTMLButtonElement>('play-launder');
  $('play-pick').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    working(out);
    for (const u of playUrls) URL.revokeObjectURL(u);
    playUrls = [];
    try {
      const res = await call<{ bytes: Uint8Array; mimeType: string; report: VerifyImageResult }>('mark', await readFile(file));
      marked = res;
      const url = playUrl(new Blob([res.bytes as BlobPart], { type: res.mimeType }));
      download.href = url;
      download.download = file.name.replace(/(\.\w+)?$/, (ext) => `.ai${ext || (res.mimeType === 'image/png' ? '.png' : '.jpg')}`);
      download.hidden = false;
      launder.hidden = false;
      out.innerHTML = renderReport(res.report, url);
    } catch (e) {
      error(out, e as Error);
    }
  });
  launder.addEventListener('click', async () => {
    if (!marked) return;
    working(out);
    try {
      const res = await call<{ bytes: Uint8Array; mimeType: string; report: VerifyImageResult }>('launder', marked.bytes);
      const url = playUrl(new Blob([res.bytes as BlobPart], { type: res.mimeType }));
      const fr = document.documentElement.lang === 'fr';
      out.innerHTML =
        `<p class="small muted">${fr ? 'Après effacement des métadonnées et recompression JPEG (qualité 75) :' : 'After stripping metadata and recompressing as JPEG (quality 75):'}</p>` +
        renderReport(res.report, url);
    } catch (e) {
      error(out, e as Error);
    }
  });
}

initLangSwitch();
initDrop();
initText();
initPlayground();
document.addEventListener('langchange', () => {
  if (lastVerify) $('result').innerHTML = renderReport(lastVerify.report, lastVerify.url);
});
