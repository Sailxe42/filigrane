import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  AI_SDK,
  AUDIO_VIDEO_GEN,
  CHAT,
  DEEPFAKE,
  DISCLOSURE_EVIDENCE,
  IMAGE_GEN,
  MARKING_EVIDENCE,
  type Level,
  type Pattern,
  RULES,
} from './rules.ts';

export interface Finding {
  ruleId: string;
  level: Level;
  message: string;
  file: string;
  line: number;
  column: number;
  snippet: string;
}

export type CheckStatus = 'ok' | 'missing' | 'not-applicable' | 'review';

export interface ScanResult {
  root: string;
  filesScanned: number;
  usesAi: boolean;
  findings: Finding[];
  checklist: { article: string; requirement: string; status: CheckStatus; detail: string }[];
}

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte', '.astro', '.py', '.html']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', 'coverage', '.venv', 'venv', '__pycache__', '.turbo', '.cache', 'vendor', '.scratch', '.output']);
const MAX_FILE_SIZE = 1_000_000;

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) yield* walk(path.join(dir, e.name));
    } else if (e.isFile() && SOURCE_EXT.has(path.extname(e.name))) {
      yield path.join(dir, e.name);
    }
  }
}

interface Hit {
  file: string;
  line: number;
  column: number;
  snippet: string;
  what: string;
}

/** Offsets where each line starts, so a match position maps to a line in O(log n). */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

function findAll(text: string, file: string, patterns: Pattern[], starts: number[]): Hit[] {
  const hits: Hit[] = [];
  for (const p of patterns) {
    const re = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : `${p.re.flags}g`);
    for (const m of text.matchAll(re)) {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= m.index!) lo = mid;
        else hi = mid - 1;
      }
      const lineEnd = lo + 1 < starts.length ? starts[lo + 1] - 1 : text.length;
      const snippet = text.slice(starts[lo], lineEnd).trim().slice(0, 160);
      hits.push({ file, line: lo + 1, column: m.index! - starts[lo] + 1, snippet, what: p.what });
    }
  }
  return hits;
}

/**
 * Paths are reported relative to the working directory when the file is inside it,
 * so `filigrane scan src` in a repository gives repository-relative paths (what
 * GitHub code scanning expects); otherwise relative to the scanned directory.
 */
function displayPath(file: string, root: string): string {
  const fromCwd = path.relative(process.cwd(), file);
  const inside = fromCwd !== '' && !fromCwd.startsWith('..') && !path.isAbsolute(fromCwd);
  return (inside ? fromCwd : path.relative(root, file)).split(path.sep).join('/');
}

function finding(ruleId: string, hit: Hit, root: string, extra = ''): Finding {
  const rule = RULES[ruleId];
  return {
    ruleId,
    level: rule.level,
    message: `${rule.summary} (${hit.what}${extra}). ${rule.help}`,
    file: displayPath(hit.file, root),
    line: hit.line,
    column: hit.column,
    snippet: hit.snippet,
  };
}

/** Scans a project directory for AI transparency gaps. */
export async function scanProject(root: string): Promise<ScanResult> {
  const abs = path.resolve(root);
  const sdk: Hit[] = [];
  const chat: Hit[] = [];
  const image: Hit[] = [];
  const av: Hit[] = [];
  const deepfake: Hit[] = [];
  let disclosure = false;
  let marking = false;
  let filesScanned = 0;

  const info = await stat(abs);
  const files = info.isFile() ? [abs] : [];
  if (info.isDirectory()) for await (const f of walk(abs)) files.push(f);

  for (const file of files) {
    const s = await stat(file);
    if (s.size > MAX_FILE_SIZE) continue;
    const text = await readFile(file, 'utf8');
    filesScanned++;
    const starts = lineStarts(text);
    sdk.push(...findAll(text, file, AI_SDK, starts));
    chat.push(...findAll(text, file, CHAT, starts));
    image.push(...findAll(text, file, IMAGE_GEN, starts));
    av.push(...findAll(text, file, AUDIO_VIDEO_GEN, starts));
    deepfake.push(...findAll(text, file, DEEPFAKE, starts));
    if (!disclosure && DISCLOSURE_EVIDENCE.some((re) => re.test(text))) disclosure = true;
    if (!marking && MARKING_EVIDENCE.some((re) => re.test(text))) marking = true;
  }

  const findings: Finding[] = [];
  if (!disclosure) for (const h of chat) findings.push(finding('FG001', h, abs));
  if (!marking) for (const h of image) findings.push(finding('FG002', h, abs));
  for (const h of av) findings.push(finding('FG003', h, abs));
  for (const h of deepfake) findings.push(finding('FG004', h, abs));
  const usesAi = sdk.length + chat.length + image.length + av.length + deepfake.length > 0;
  if (usesAi && chat.length + sdk.length > 0) {
    const first = chat[0] ?? sdk[0];
    findings.push(finding('FG005', first, abs));
  }

  const checklist: ScanResult['checklist'] = [
    {
      article: 'Art. 50(1)',
      requirement: 'Tell people they are interacting with an AI system',
      status: chat.length === 0 ? 'not-applicable' : disclosure ? 'ok' : 'missing',
      detail: chat.length === 0 ? 'No conversational AI detected' : disclosure ? 'A disclosure was found in the project' : `${chat.length} conversational AI location(s) without disclosure`,
    },
    {
      article: 'Art. 50(2)',
      requirement: 'Mark AI-generated images in a machine-readable way',
      status: image.length === 0 ? 'not-applicable' : marking ? 'ok' : 'missing',
      detail: image.length === 0 ? 'No image generation detected' : marking ? 'Marking code was found in the project' : `${image.length} image generation location(s) without marking`,
    },
    {
      article: 'Art. 50(2)',
      requirement: 'Mark AI-generated audio and video',
      status: av.length === 0 ? 'not-applicable' : 'review',
      detail: av.length === 0 ? 'No audio/video generation detected' : 'Manual review needed: check provider watermarking',
    },
    {
      article: 'Art. 50(4)',
      requirement: 'Disclose deepfakes and AI text published on matters of public interest',
      status: deepfake.length > 0 || usesAi ? 'review' : 'not-applicable',
      detail: deepfake.length > 0 ? 'Face/voice synthesis detected: deepfakes must be labelled' : usesAi ? 'Depends on how outputs are published: review editorial process' : 'No generative AI detected',
    },
  ];

  findings.sort((a, b) => (a.level === b.level ? a.file.localeCompare(b.file) || a.line - b.line : a.level === 'error' ? -1 : b.level === 'error' ? 1 : a.level === 'warning' ? -1 : 1));
  return { root: abs, filesScanned, usesAi, findings, checklist };
}
