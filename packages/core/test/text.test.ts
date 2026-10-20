import { describe, expect, it } from 'vitest';
import { aiTextAttributes, markText, readText, stripTextMarks } from '../src/text/text.ts';

const sample = 'First paragraph about the weather.\n\nSecond paragraph with more details.\n';

describe('text marking', () => {
  it('adds invisible markers that are read back', () => {
    const marked = markText(sample, { id: 1234 });
    expect(marked).not.toBe(sample);
    expect(stripTextMarks(marked)).toBe(sample);
    const r = readText(marked);
    expect(r.detected).toBe(true);
    expect(r.markers).toBe(2);
    expect(r.payload).toEqual({ aiGenerated: true, aiModified: false, id: 1234 });
    expect(r.text).toBe(sample);
  });

  it('keeps visible text identical when rendered', () => {
    const marked = markText(sample);
    // Only invisible code points are added.
    const extra = [...marked].filter((c) => !sample.includes(c));
    expect(extra.every((c) => /[⁣︀-️]/u.test(c) || c.codePointAt(0)! >= 0xe0100)).toBe(true);
  });

  it('survives copying a single paragraph', () => {
    const marked = markText(sample, { involvement: 'modified', id: 'conversation-7' });
    const second = marked.split('\n\n')[1];
    expect(readText(second).payload?.aiModified).toBe(true);
  });

  it('replaces previous markers instead of stacking them', () => {
    const twice = markText(markText(sample, { id: 1 }), { id: 2 });
    expect(readText(twice).markers).toBe(2);
    expect(readText(twice).payload?.id).toBe(2);
  });

  it('ignores random variation selectors', () => {
    expect(readText('emoji ❤️ text').detected).toBe(false);
  });

  it('provides HTML attributes', () => {
    expect(aiTextAttributes({ model: 'X' })).toEqual({ 'data-ai-generated': 'true', 'data-ai-model': 'X' });
  });
});
