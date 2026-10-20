/**
 * Framework-agnostic Web Components for AI transparency.
 *
 *   <ai-disclosure>  "You are chatting with an AI system" banner (AI Act Art. 50(1))
 *   <ai-label>       "AI-generated" / "AI-modified" badge with details (Art. 50(2)/(4))
 *
 * They work in plain HTML and in React, Vue, Svelte, Angular… Theme them with
 * CSS custom properties (--fg-ai-*). Safe to import during SSR: nothing is
 * registered until a browser `customElements` registry exists.
 */
import { EU_ICONS } from './eu-icons.ts';
import { type Strings, strings } from './i18n.ts';

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/**
 * Renders an official EU icon. The shape and the letters take their colours
 * from --fg-ai-eu-bg / --fg-ai-eu-fg (black with white letters by default,
 * inverted in dark mode).
 */
export function euIconSvg(key: keyof typeof EU_ICONS, heightEm = 1): string {
  const icon = EU_ICONS[key];
  const [, , w, h] = icon.viewBox.split(' ').map(Number);
  const width = ((heightEm * w) / h).toFixed(3);
  return `<svg class="eu" viewBox="${icon.viewBox}" style="height:${heightEm}em;width:${width}em" aria-hidden="true" focusable="false"><path fill-rule="evenodd" fill="var(--_eu-bg)" d="${icon.shape}"/><path fill="var(--_eu-fg)" d="${icon.glyphs}"/></svg>`;
}

/** Filigrane's own neutral "AI" mark, used by <ai-disclosure> and by <ai-label icon="filigrane">. */
export const AI_ICON = `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false"><rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6.6 16.6 9.4 7.4h1.5l2.8 9.2h-1.8l-.6-2.1H8.9l-.6 2.1Zm2.7-3.6h2.1L10.3 9.2Zm5.6 3.6V7.4h1.7v9.2Z" fill="currentColor"/><path d="M19.3 3.6l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5Z" fill="currentColor"/></svg>`;

const BASE_CSS = `
:host { --_bg: var(--fg-ai-bg, #f4f1ff); --_fg: var(--fg-ai-fg, #1f1b2d); --_border: var(--fg-ai-border, #c9bdf5);
  --_accent: var(--fg-ai-accent, #5b3fd6); --_radius: var(--fg-ai-radius, 10px);
  --_eu-bg: var(--fg-ai-eu-bg, #000); --_eu-fg: var(--fg-ai-eu-fg, #fff);
  font-family: var(--fg-ai-font, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif); color: var(--_fg); }
@media (prefers-color-scheme: dark) {
  :host { --_bg: var(--fg-ai-bg, #221d38); --_fg: var(--fg-ai-fg, #f1edff); --_border: var(--fg-ai-border, #4a3f80); --_accent: var(--fg-ai-accent, #b7a6ff);
    --_eu-bg: var(--fg-ai-eu-bg, #fff); --_eu-fg: var(--fg-ai-eu-fg, #000); }
}
svg.eu { display: block; }
[hidden] { display: none !important; }
.icon { color: var(--_accent); display: inline-flex; font-size: 1.25em; flex: none; }
a { color: var(--_accent); }
button { font: inherit; cursor: pointer; }
button:focus-visible, a:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }
`;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function langOf(el: HTMLElement): string | null {
  return el.getAttribute('lang') || el.closest('[lang]')?.getAttribute('lang') || (typeof navigator !== 'undefined' ? navigator.language : null);
}

function safeHref(href: string | null): string | null {
  return href && /^(https?:|\/|\.|#)/i.test(href) ? href : null;
}

// ---------------------------------------------------------------- <ai-disclosure>

export class AiDisclosureElement extends Base {
  static observedAttributes = ['lang', 'model', 'href', 'dismissible', 'remember', 'variant'];
  private root?: ShadowRoot;

  connectedCallback(): void {
    this.root ??= this.attachShadow({ mode: 'open' });
    this.render();
  }

  attributeChangedCallback(): void {
    if (this.root) this.render();
  }

  private get storageKey(): string | null {
    const key = this.getAttribute('remember');
    return key === null ? null : `fg-ai-disclosure:${key || location.pathname}`;
  }

  private get dismissed(): boolean {
    const key = this.storageKey;
    try {
      return !!key && localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  /** Collapses the banner into a compact, still-visible "AI" indicator. */
  dismiss(): void {
    const key = this.storageKey;
    try {
      if (key) localStorage.setItem(key, '1');
    } catch {
      // Storage may be unavailable (private mode): the banner simply reappears next time.
    }
    this.render();
    this.dispatchEvent(new CustomEvent('ai-disclosure-dismiss', { bubbles: true, composed: true }));
  }

  /** Re-opens the full banner. */
  expand(): void {
    const key = this.storageKey;
    try {
      if (key) localStorage.removeItem(key);
    } catch {
      // ignore
    }
    this.removeAttribute('data-collapsed');
    this.render(true);
  }

  private render(forceOpen = false): void {
    const t: Strings = strings(langOf(this));
    const model = this.getAttribute('model');
    const href = safeHref(this.getAttribute('href'));
    const dismissible = this.hasAttribute('dismissible');
    const collapsed = !forceOpen && dismissible && (this.dismissed || this.hasAttribute('data-collapsed'));
    if (collapsed) this.setAttribute('data-collapsed', '');
    this.root!.innerHTML = `
<style>${BASE_CSS}
.banner { display: flex; gap: .75em; align-items: flex-start; background: var(--_bg); border: 1px solid var(--_border);
  border-radius: var(--_radius); padding: .75em 1em; line-height: 1.4; }
.text { flex: 1; min-width: 0; }
.title { font-weight: 600; margin: 0; }
.body { margin: .15em 0 0; font-size: .92em; opacity: .9; }
.meta { margin: .25em 0 0; font-size: .85em; opacity: .8; }
.dismiss { background: transparent; border: 1px solid var(--_border); color: inherit; border-radius: 999px; padding: .25em .8em; font-size: .85em; }
.chip { display: inline-flex; align-items: center; gap: .4em; background: var(--_bg); border: 1px solid var(--_border);
  border-radius: 999px; padding: .2em .7em; font-size: .85em; color: inherit; }
:host([variant="compact"]) .banner { padding: .45em .75em; font-size: .9em; }
:host([variant="compact"]) .body { display: none; }
</style>
${
  collapsed
    ? `<button class="chip" part="chip" aria-label="${esc(t.chatTitle)}"><span class="icon">${AI_ICON}</span><span>${esc(t.chatTitle)}</span></button>`
    : `<div class="banner" part="banner" role="note" aria-label="${esc(t.chatTitle)}">
  <span class="icon">${AI_ICON}</span>
  <div class="text">
    <p class="title">${esc(t.chatTitle)}</p>
    <p class="body">${esc(t.chatBody)}</p>
    ${model || href ? `<p class="meta">${model ? `${esc(t.model)} ${esc(model)}` : ''}${model && href ? ' · ' : ''}${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(t.learnMore)}</a>` : ''}</p>` : ''}
  </div>
  ${dismissible ? `<button class="dismiss" part="button">${esc(t.gotIt)}</button>` : ''}
</div>`
}`;
    this.root!.querySelector('.dismiss')?.addEventListener('click', () => {
      this.setAttribute('data-collapsed', '');
      this.dismiss();
    });
    this.root!.querySelector('.chip')?.addEventListener('click', () => this.expand());
  }
}

// ---------------------------------------------------------------- <ai-label>

let labelCount = 0;

export class AiLabelElement extends Base {
  static observedAttributes = ['kind', 'lang', 'model', 'href', 'variant', 'compact', 'icon'];
  private root?: ShadowRoot;
  private open = false;
  private readonly popId = `fg-ai-label-${++labelCount}`;

  connectedCallback(): void {
    this.root ??= this.attachShadow({ mode: 'open' });
    this.render();
  }

  attributeChangedCallback(): void {
    if (this.root) this.render();
  }

  private toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.render();
    if (this.open) (this.root!.querySelector('.badge') as HTMLElement | null)?.focus();
  }

  private render(): void {
    const t = strings(langOf(this));
    const modified = this.getAttribute('kind') === 'modified';
    const label = modified ? t.modified : t.generated;
    const details = modified ? t.modifiedDetails : t.generatedDetails;
    const model = this.getAttribute('model');
    const href = safeHref(this.getAttribute('href'));
    const compact = this.hasAttribute('compact');
    // variant="eu": the official full EU label ("AI GENERATED" / "AI MODIFIED", English only).
    const euLabel = this.getAttribute('variant') === 'eu';
    const icon = this.getAttribute('icon') === 'filigrane' ? AI_ICON : euIconSvg('ai');
    const content = euLabel
      ? euIconSvg(modified ? 'modified' : 'generated', 1.6)
      : `<span class="icon">${icon}</span>${compact ? '' : `<span>${esc(label)}</span>`}`;
    this.root!.innerHTML = `
<style>${BASE_CSS}
:host { display: inline-block; position: relative; vertical-align: middle; }
:host([variant="overlay"]) { position: absolute; top: var(--fg-ai-offset, 8px); left: var(--fg-ai-offset, 8px); z-index: 2; }
.badge { display: inline-flex; align-items: center; gap: .35em; background: var(--_bg); color: var(--_fg);
  border: 1px solid var(--_border); border-radius: 999px; padding: .2em .65em; font-size: .8em; font-weight: 600; line-height: 1.3; }
:host([variant="overlay"]) .badge { background: color-mix(in srgb, var(--_bg) 88%, transparent); backdrop-filter: blur(6px); }
.badge .icon { font-size: 1.15em; }
:host([variant="eu"]) .badge { background: none; border: 0; padding: 0; border-radius: 999px; }
.pop { position: absolute; top: calc(100% + 6px); left: 0; min-width: 14em; max-width: 20em; background: var(--_bg);
  border: 1px solid var(--_border); border-radius: var(--_radius); padding: .6em .8em; font-size: .85em; line-height: 1.4;
  box-shadow: 0 6px 24px rgb(0 0 0 / .15); z-index: 10; }
.pop p { margin: 0; }
.pop p + p { margin-top: .3em; opacity: .85; }
</style>
<button class="badge" part="badge" aria-expanded="${this.open}" aria-controls="${this.popId}" ${compact || euLabel ? `aria-label="${esc(label)}"` : ''}>
  ${content}
</button>
<div class="pop" part="details" id="${this.popId}" role="region" aria-label="${esc(label)}" ${this.open ? '' : 'hidden'}>
  <p>${esc(details)}</p>
  ${model ? `<p>${esc(t.model)} ${esc(model)}</p>` : ''}
  ${href ? `<p><a href="${esc(href)}" target="_blank" rel="noopener">${esc(t.learnMore)}</a></p>` : ''}
</div>`;
    const badge = this.root!.querySelector('.badge') as HTMLElement;
    badge.addEventListener('click', () => this.toggle());
    badge.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') this.toggle(false);
    });
  }
}

/** Registers <ai-disclosure> and <ai-label> (idempotent, no-op outside browsers). */
export function defineElements(): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get('ai-disclosure')) customElements.define('ai-disclosure', AiDisclosureElement);
  if (!customElements.get('ai-label')) customElements.define('ai-label', AiLabelElement);
}
