import { strings } from './i18n.ts';

export type DisclosureKind = 'chat' | 'generated' | 'modified';

/**
 * Returns the disclosure sentence for a language, e.g. to prefix the first
 * chatbot message or to read out in a voice interface.
 */
export function disclosureText(kind: DisclosureKind = 'chat', lang = 'en'): string {
  const t = strings(lang);
  if (kind === 'chat') return `${t.chatTitle}. ${t.chatBody}`;
  return kind === 'modified' ? t.modifiedDetails : t.generatedDetails;
}
