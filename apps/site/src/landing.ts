import '@filigrane/ui';
import { LANGUAGES } from '@filigrane/ui';
import { initLangSwitch, t } from './i18n.ts';

const LANGUAGE_NAMES: Record<string, string> = {
  bg: 'Български', cs: 'Čeština', da: 'Dansk', de: 'Deutsch', el: 'Ελληνικά', en: 'English', es: 'Español', et: 'Eesti',
  fi: 'Suomi', fr: 'Français', ga: 'Gaeilge', hr: 'Hrvatski', hu: 'Magyar', it: 'Italiano', lt: 'Lietuvių', lv: 'Latviešu',
  mt: 'Malti', nl: 'Nederlands', pl: 'Polski', pt: 'Português', ro: 'Română', sk: 'Slovenčina', sl: 'Slovenščina', sv: 'Svenska',
};

const DEADLINE = Date.UTC(2026, 11, 2);

function renderDeadline(): void {
  const el = document.getElementById('deadline');
  if (!el) return;
  const days = Math.ceil((DEADLINE - Date.now()) / 86_400_000);
  const fr = document.documentElement.lang === 'fr';
  if (days > 0) {
    el.innerHTML = fr
      ? `Échéance du marquage pour les systèmes déjà sur le marché : <strong>2 décembre 2026</strong> — encore ${days} jour${days > 1 ? 's' : ''}.`
      : `Marking deadline for systems already on the market: <strong>2 December 2026</strong> — ${days} day${days > 1 ? 's' : ''} left.`;
  } else {
    el.innerHTML = fr
      ? 'Les obligations de marquage de l’article 50 <strong>s’appliquent</strong> à tous les systèmes.'
      : 'Article 50 marking obligations <strong>now apply</strong> to every system.';
  }
}

function initTabs(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-tabs]')) {
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const select = (tab: HTMLButtonElement) => {
      for (const other of tabs) {
        const on = other === tab;
        other.setAttribute('aria-selected', String(on));
        other.tabIndex = on ? 0 : -1;
        document.getElementById(other.getAttribute('aria-controls')!)!.hidden = !on;
      }
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        const next = tabs[(i + dir + tabs.length) % tabs.length];
        select(next);
        next.focus();
      });
    });
  }
}

function initCopy(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    b.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(b.dataset.copy!);
      const label = b.textContent;
      b.textContent = t('copied', 'Copied');
      setTimeout(() => (b.textContent = label), 1500);
    });
  }
}

function initDemo(lang: string): void {
  const select = document.getElementById('demo-lang') as HTMLSelectElement | null;
  const target = document.getElementById('demo');
  if (!select || !target) return;
  for (const code of LANGUAGES) select.add(new Option(`${LANGUAGE_NAMES[code] ?? code} (${code})`, code));
  const apply = (code: string) => {
    for (const el of target.querySelectorAll('ai-disclosure, ai-label')) el.setAttribute('lang', code);
  };
  select.value = lang;
  apply(lang);
  select.addEventListener('change', () => apply(select.value));
}

const lang = initLangSwitch();
renderDeadline();
initTabs();
initCopy();
initDemo(lang);
document.addEventListener('langchange', renderDeadline);
