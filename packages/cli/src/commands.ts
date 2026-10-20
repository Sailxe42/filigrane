import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createDevSigner,
  createLocalSigner,
  derToPem,
  generateDevCertificateChain,
  markImage,
  markText,
  readText,
  shortSourceType,
  type Signer,
  type VerifyImageResult,
  verifyImage,
} from '@filigrane/core';
import { formatJson, formatMarkdown, formatSarif, formatText } from './scan/report.ts';
import { scanProject } from './scan/scan.ts';
import { c } from './term.ts';

export const CLI_VERSION = '0.1.0';
const TEXT_EXT = new Set(['.txt', '.md', '.markdown']);

function isText(file: string): boolean {
  return TEXT_EXT.has(path.extname(file).toLowerCase());
}

/** Reads a PEM value that may be given inline or as a file path. */
async function pemValue(v: string): Promise<string> {
  return v.includes('-----BEGIN') ? v : readFile(v, 'utf8');
}

export interface MarkArgs {
  output?: string;
  model?: string;
  modified?: boolean;
  cert?: string;
  key?: string;
  dev?: boolean;
  watermark?: boolean;
  metadata?: boolean;
  c2pa?: boolean;
  strength?: number;
  quality?: number;
}

async function resolveSigner(a: MarkArgs): Promise<{ signer?: Signer; note?: string }> {
  const cert = a.cert ?? process.env.FILIGRANE_CERT;
  const key = a.key ?? process.env.FILIGRANE_KEY;
  if (cert && key) return { signer: await createLocalSigner({ certificate: await pemValue(cert), privateKey: await pemValue(key) }) };
  if (a.dev) return { signer: await createDevSigner('Filigrane CLI (development)'), note: 'signed with a throw-away development certificate (shows as untrusted)' };
  return { note: 'no signing credentials: C2PA layer skipped (use --cert/--key, FILIGRANE_CERT/FILIGRANE_KEY or --dev)' };
}

function defaultOutput(input: string): string {
  const ext = path.extname(input);
  return `${input.slice(0, input.length - ext.length)}.ai${ext}`;
}

export async function cmdMark(input: string, a: MarkArgs): Promise<number> {
  const output = a.output ?? defaultOutput(input);
  const [modelName, modelVersion] = (a.model ?? '').split('@');
  if (isText(input)) {
    const text = await readFile(input, 'utf8');
    await writeFile(output, markText(text, { involvement: a.modified ? 'modified' : 'generated' }));
    console.log(`${c.green('✔')} ${output} ${c.dim('(invisible text markers)')}`);
    return 0;
  }
  const bytes = new Uint8Array(await readFile(input));
  const { signer, note } = a.c2pa === false ? {} : await resolveSigner(a);
  const res = await markImage(bytes, {
    signer,
    involvement: a.modified ? 'modified' : 'generated',
    model: modelName ? { name: modelName, version: modelVersion } : undefined,
    generator: { name: 'Filigrane CLI', version: CLI_VERSION },
    title: path.basename(input),
    layers: { watermark: a.watermark !== false, metadata: a.metadata !== false, c2pa: a.c2pa !== false },
    watermark: a.strength ? { strength: a.strength } : undefined,
    quality: a.quality,
  });
  await writeFile(output, res.bytes);
  console.log(`${c.green('✔')} ${output} ${c.dim(`(${res.layers.join(' + ')})`)}`);
  if (note) console.log(c.yellow(`  ! ${note}`));
  if (res.layers.length < 2) console.log(c.yellow('  ! fewer than two marking layers: the Code of Practice expects at least two'));
  return 0;
}

export interface VerifyArgs {
  json?: boolean;
  trust?: string;
}

function describe(file: string, v: VerifyImageResult): string {
  const lines: string[] = [];
  const head =
    v.verdict === 'ai-generated' ? c.magenta('AI-GENERATED') : v.verdict === 'ai-modified' ? c.magenta('AI-MODIFIED') : c.green('NO AI SIGNAL');
  lines.push(`${c.bold(file)}  ${head} ${c.dim(`(${v.signals}/3 layers)`)}${v.tampered ? c.red('  TAMPERED') : ''}`);
  const m = v.c2pa.active;
  if (m) {
    const ok = m.valid ? c.green('valid') : c.red('INVALID');
    const trust = m.signature.trusted === null ? '' : m.signature.trusted ? c.green(' trusted') : c.yellow(' untrusted');
    lines.push(`  C2PA       ${ok}${trust} · signed by ${m.signature.subject} · ${m.claimGenerator ?? 'unknown generator'}`);
    for (const a of m.actions) lines.push(c.dim(`             ${a.action}${a.digitalSourceType ? ` · ${shortSourceType(a.digitalSourceType)}` : ''}${a.softwareAgent ? ` · ${a.softwareAgent}` : ''}`));
    for (const e of m.validation.filter((x) => !x.ok)) lines.push(c.red(`             ✖ ${e.code}: ${e.message}`));
  } else lines.push(`  C2PA       ${c.dim(v.c2pa.error ?? 'none')}`);
  lines.push(`  Metadata   ${v.metadata.digitalSourceType ? shortSourceType(v.metadata.digitalSourceType) + (v.metadata.aiSystem ? ` · ${v.metadata.aiSystem}` : '') : c.dim('none')}`);
  lines.push(
    `  Watermark  ${v.watermark.detected ? `${c.green('detected')} · id ${v.watermark.payload!.id.toString(16).padStart(8, '0')} · confidence ${(v.watermark.confidence * 100).toFixed(0)}%` : c.dim('none')}`,
  );
  return lines.join('\n');
}

export async function cmdVerify(files: string[], a: VerifyArgs): Promise<number> {
  const trustAnchors = a.trust ? await pemValue(a.trust) : undefined;
  const results: Record<string, unknown> = {};
  for (const file of files) {
    if (isText(file)) {
      const r = readText(await readFile(file, 'utf8'));
      if (a.json) results[file] = { kind: 'text', detected: r.detected, payload: r.payload, markers: r.markers };
      else console.log(`${c.bold(file)}  ${r.detected ? c.magenta(r.payload?.aiModified ? 'AI-MODIFIED' : 'AI-GENERATED') : c.green('NO AI SIGNAL')} ${c.dim(`(${r.markers} text marker(s))`)}`);
      continue;
    }
    const v = await verifyImage(new Uint8Array(await readFile(file)), { trustAnchors });
    if (a.json) results[file] = v;
    else console.log(describe(file, v) + '\n');
  }
  if (a.json) console.log(JSON.stringify(results, (_k, v) => (v instanceof Uint8Array ? undefined : v), 2));
  return 0;
}

export async function cmdKeygen(a: { out?: string; name?: string; days?: number }): Promise<number> {
  const out = a.out ?? '.filigrane';
  await mkdir(out, { recursive: true });
  const dev = await generateDevCertificateChain(a.name ?? 'Filigrane Development', a.days ?? 365);
  const certPath = path.join(out, 'dev-chain.pem');
  const keyPath = path.join(out, 'dev-key.pem');
  await writeFile(certPath, dev.chain.map((d) => derToPem(d)).join(''));
  await writeFile(keyPath, derToPem(dev.privateKeyPkcs8, 'PRIVATE KEY'), { mode: 0o600 });
  console.log(`${c.green('✔')} ${certPath}\n${c.green('✔')} ${keyPath}`);
  console.log(c.yellow('  ! Development certificate: manifests will show as "untrusted". Never commit the key.'));
  if (existsSync('.gitignore')) {
    const gi = await readFile('.gitignore', 'utf8');
    if (!gi.split(/\r?\n/).includes(`${out}/`)) await writeFile('.gitignore', `${gi.trimEnd()}\n${out}/\n`);
  }
  return 0;
}

export interface ScanArgs {
  format?: string;
  output?: string;
  failOn?: string;
}

export async function cmdScan(dir: string, a: ScanArgs): Promise<number> {
  const r = await scanProject(dir);
  const format = a.format ?? 'text';
  const text =
    format === 'json' ? formatJson(r, CLI_VERSION) : format === 'sarif' ? formatSarif(r, CLI_VERSION) : format === 'markdown' || format === 'md' ? formatMarkdown(r, CLI_VERSION) : formatText(r, CLI_VERSION);
  if (a.output) await writeFile(a.output, text);
  else console.log(text);
  const failOn = a.failOn ?? 'error';
  const failing = r.findings.filter((f) => (failOn === 'never' ? false : failOn === 'warning' ? f.level !== 'note' : f.level === 'error'));
  return failing.length ? 1 : 0;
}
