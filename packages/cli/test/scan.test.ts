import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatMarkdown, formatSarif } from '../src/scan/report.ts';
import { scanProject } from '../src/scan/scan.ts';

async function project(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'filigrane-scan-'));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), content);
  }
  return dir;
}

const CHAT = `import { useChat } from '@ai-sdk/react';\nexport function Chat() { const { messages } = useChat(); return null; }\n`;
const IMAGES = `import OpenAI from 'openai';\nconst openai = new OpenAI();\nexport const gen = (prompt) => openai.images.generate({ model: 'gpt-image-1', prompt });\n`;

describe('scanProject', () => {
  it('flags a chatbot and an image generator without transparency measures', async () => {
    const r = await scanProject(await project({ 'app/chat.tsx': CHAT, 'lib/images.ts': IMAGES }));
    expect(r.usesAi).toBe(true);
    const errors = r.findings.filter((f) => f.level === 'error');
    expect(errors.map((f) => f.ruleId).sort()).toEqual(['FG001', 'FG002']);
    expect(errors.find((f) => f.ruleId === 'FG002')).toMatchObject({ file: 'lib/images.ts', line: 3 });
    expect(r.checklist.filter((c) => c.status === 'missing')).toHaveLength(2);
  });

  it('passes once the disclosure and marking are in place', async () => {
    const r = await scanProject(
      await project({
        'app/chat.tsx': `import '@filigrane/ui';\n${CHAT}\nexport const Banner = () => <ai-disclosure dismissible />;`,
        'lib/images.ts': `import { markImage } from '@filigrane/core';\n${IMAGES}`,
      }),
    );
    expect(r.findings.filter((f) => f.level === 'error')).toEqual([]);
    expect(r.checklist.slice(0, 2).map((c) => c.status)).toEqual(['ok', 'ok']);
  });

  it('detects Python generators and deepfake tooling', async () => {
    const r = await scanProject(
      await project({
        'gen.py': 'from diffusers import StableDiffusionXLPipeline\npipe = StableDiffusionXLPipeline.from_pretrained("x")\n',
        'swap.py': 'import insightface\n',
        'tts.py': 'from openai import OpenAI\nclient = OpenAI()\nclient.audio.speech.create(model="tts-1", voice="alloy", input="hi")\n',
      }),
    );
    const ids = r.findings.map((f) => f.ruleId);
    expect(ids).toContain('FG002');
    expect(ids).toContain('FG003');
    expect(ids).toContain('FG004');
  });

  it('ignores dependencies and reports nothing for non-AI projects', async () => {
    const r = await scanProject(await project({ 'src/index.ts': 'export const add = (a: number, b: number) => a + b;\n', 'node_modules/openai/x.js': IMAGES }));
    expect(r.usesAi).toBe(false);
    expect(r.findings).toEqual([]);
  });

  it('produces valid SARIF and Markdown reports', async () => {
    const r = await scanProject(await project({ 'lib/images.ts': IMAGES }));
    const sarif = JSON.parse(formatSarif(r, '0.0.0'));
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].tool.driver.rules.length).toBeGreaterThan(3);
    expect(sarif.runs[0].results[0]).toMatchObject({ ruleId: 'FG002', level: 'error' });
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine).toBe(3);
    const md = formatMarkdown(r, '0.0.0');
    expect(md).toContain('| Art. 50(2) | Mark AI-generated images in a machine-readable way | ✖ missing |');
    expect(md).toContain('not legal advice');
  });
});
