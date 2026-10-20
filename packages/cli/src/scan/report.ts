import path from 'node:path';
import { RULES } from './rules.ts';
import type { ScanResult } from './scan.ts';
import { c } from '../term.ts';

export const DOCS_URL = 'https://github.com/Sailxe42/filigrane#readme';
const DISCLAIMER = 'This report is produced by static heuristics to help you prepare; it is not legal advice and does not certify compliance.';

const STATUS_ICON: Record<string, string> = { ok: '✔', missing: '✖', 'not-applicable': '–', review: '?' };

export function formatText(r: ScanResult, version: string): string {
  const lines: string[] = [];
  lines.push(c.bold(`Filigrane scan v${version}`) + c.dim(` · ${r.filesScanned} files · ${r.root}`));
  lines.push('');
  for (const item of r.checklist) {
    const color = item.status === 'ok' ? c.green : item.status === 'missing' ? c.red : item.status === 'review' ? c.yellow : c.dim;
    lines.push(`${color(STATUS_ICON[item.status])} ${c.bold(item.article)} ${item.requirement}${c.dim(` — ${item.detail}`)}`);
  }
  if (r.findings.length) {
    lines.push('');
    for (const f of r.findings) {
      const color = f.level === 'error' ? c.red : f.level === 'warning' ? c.yellow : c.cyan;
      lines.push(`${color(f.level.padEnd(7))} ${c.bold(f.ruleId)} ${f.file}:${f.line}:${f.column}`);
      lines.push(`        ${f.message}`);
      if (f.snippet) lines.push(c.dim(`        > ${f.snippet}`));
    }
  }
  const errors = r.findings.filter((f) => f.level === 'error').length;
  const warnings = r.findings.filter((f) => f.level === 'warning').length;
  lines.push('');
  lines.push(errors ? c.red(`${errors} error(s), ${warnings} warning(s)`) : c.green(`No blocking issue · ${warnings} warning(s)`));
  lines.push(c.dim(DISCLAIMER));
  return lines.join('\n');
}

export function formatJson(r: ScanResult, version: string): string {
  return JSON.stringify({ tool: 'filigrane', version, generatedAt: new Date().toISOString(), ...r, disclaimer: DISCLAIMER }, null, 2);
}

/** SARIF 2.1.0 for GitHub code scanning and other static-analysis dashboards. */
export function formatSarif(r: ScanResult, version: string): string {
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Filigrane',
            version,
            informationUri: DOCS_URL,
            rules: Object.values(RULES).map((rule) => ({
              id: rule.id,
              name: rule.name,
              shortDescription: { text: rule.summary },
              fullDescription: { text: `${rule.summary}. ${rule.help}` },
              help: { text: rule.help, markdown: `**${rule.article}** — ${rule.help}\n\n_${DISCLAIMER}_` },
              defaultConfiguration: { level: rule.level },
              properties: { tags: ['ai-act', 'transparency', rule.article] },
            })),
          },
        },
        results: r.findings.map((f) => ({
          ruleId: f.ruleId,
          level: f.level,
          message: { text: f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.file },
                region: { startLine: f.line, startColumn: f.column },
              },
            },
          ],
        })),
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

/** Markdown report suitable for pull-request comments or a compliance file. */
export function formatMarkdown(r: ScanResult, version: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    `# AI transparency report`,
    '',
    `Project: \`${path.basename(r.root)}\` · Date: ${date} · Tool: Filigrane v${version} · Files scanned: ${r.filesScanned}`,
    '',
    '## Checklist',
    '',
    '| Article | Requirement | Status | Detail |',
    '| --- | --- | --- | --- |',
    ...r.checklist.map((i) => `| ${i.article} | ${i.requirement} | ${STATUS_ICON[i.status]} ${i.status} | ${i.detail} |`),
    '',
    '## Findings',
    '',
  ];
  if (!r.findings.length) lines.push('No findings.');
  else {
    lines.push('| Level | Rule | Location | Message |', '| --- | --- | --- | --- |');
    for (const f of r.findings) lines.push(`| ${f.level} | ${f.ruleId} | \`${f.file}:${f.line}\` | ${f.message.replace(/\|/g, '\\|')} |`);
  }
  lines.push('', `> ${DISCLAIMER}`);
  return lines.join('\n');
}
