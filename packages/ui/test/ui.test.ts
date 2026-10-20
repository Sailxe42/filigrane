// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { disclosureText, LANGUAGES, resolveLanguage, STRINGS } from '../src/index.ts';

const EU_LANGUAGES = ['bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'ga', 'hr', 'hu', 'it', 'lt', 'lv', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'sl', 'sv'];

describe('i18n', () => {
  it('covers the 24 official EU languages with every string', () => {
    expect([...LANGUAGES].sort()).toEqual(EU_LANGUAGES);
    const keys = Object.keys(STRINGS.en);
    for (const lang of EU_LANGUAGES) {
      expect(Object.keys(STRINGS[lang]).sort()).toEqual([...keys].sort());
      for (const k of keys) expect(STRINGS[lang][k as keyof (typeof STRINGS)['en']].trim().length).toBeGreaterThan(0);
    }
  });

  it('resolves regional tags and falls back to English', () => {
    expect(resolveLanguage('fr-BE')).toBe('fr');
    expect(resolveLanguage('pt_BR')).toBe('pt');
    expect(resolveLanguage('ja')).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
  });

  it('builds plain-text disclosures', () => {
    expect(disclosureText('chat', 'de')).toMatch(/^Sie chatten mit einem KI-System\./);
    expect(disclosureText('modified', 'fr')).toBe('Ce contenu a été en partie modifié par une intelligence artificielle.');
  });
});

describe('<ai-disclosure>', () => {
  it('renders an accessible banner in the page language', () => {
    document.body.innerHTML = '<div lang="fr"><ai-disclosure model="Mistral Large" href="/ia"></ai-disclosure></div>';
    const el = document.querySelector('ai-disclosure')!;
    const banner = el.shadowRoot!.querySelector('[role="note"]')!;
    expect(banner.getAttribute('aria-label')).toBe('Vous échangez avec un système d’IA');
    expect(el.shadowRoot!.textContent).toContain('Modèle : Mistral Large');
    expect(el.shadowRoot!.querySelector('a')!.getAttribute('href')).toBe('/ia');
  });

  it('collapses to a visible chip when dismissed and fires an event', () => {
    document.body.innerHTML = '<ai-disclosure lang="en" dismissible></ai-disclosure>';
    const el = document.querySelector('ai-disclosure')!;
    let fired = false;
    el.addEventListener('ai-disclosure-dismiss', () => (fired = true));
    (el.shadowRoot!.querySelector('.dismiss') as HTMLButtonElement).click();
    expect(fired).toBe(true);
    const chip = el.shadowRoot!.querySelector('.chip')!;
    expect(chip.textContent).toContain('You are chatting with an AI system');
    (chip as HTMLButtonElement).click();
    expect(el.shadowRoot!.querySelector('[role="note"]')).not.toBeNull();
  });

  it('refuses javascript: links', () => {
    document.body.innerHTML = '<ai-disclosure href="javascript:alert(1)"></ai-disclosure>';
    expect(document.querySelector('ai-disclosure')!.shadowRoot!.querySelector('a')).toBeNull();
  });
});

describe('<ai-label>', () => {
  it('toggles its details', () => {
    document.body.innerHTML = '<ai-label lang="es" kind="modified" model="Imagen"></ai-label>';
    const root = document.querySelector('ai-label')!.shadowRoot!;
    const badge = root.querySelector('.badge') as HTMLButtonElement;
    expect(badge.textContent).toContain('Modificado por IA');
    expect(root.querySelector('.pop')!.hasAttribute('hidden')).toBe(true);
    badge.click();
    const opened = document.querySelector('ai-label')!.shadowRoot!;
    expect(opened.querySelector('.pop')!.hasAttribute('hidden')).toBe(false);
    expect(opened.querySelector('.badge')!.getAttribute('aria-expanded')).toBe('true');
    expect(opened.textContent).toContain('Modelo: Imagen');
  });

  it('keeps an accessible name in compact mode', () => {
    document.body.innerHTML = '<ai-label compact lang="it"></ai-label>';
    const badge = document.querySelector('ai-label')!.shadowRoot!.querySelector('.badge')!;
    expect(badge.getAttribute('aria-label')).toBe('Generato con IA');
  });
});
