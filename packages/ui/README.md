# @filigrane/ui

Accessible Web Components to tell users about AI, in the **24 official EU languages** (EU AI Act Article 50). Works with plain HTML, React, Vue, Svelte, Angular…

```bash
npm install @filigrane/ui
```

```ts
import '@filigrane/ui'; // registers the elements
```

```html
<!-- Chatbots (Art. 50(1)): a banner that collapses into a visible "AI" chip once dismissed -->
<ai-disclosure model="Support assistant" href="/ai-policy" dismissible remember="chat"></ai-disclosure>

<!-- AI images and texts (Art. 50(4)) -->
<ai-label kind="generated" variant="overlay" model="Flux 1.1"></ai-label>
<ai-label kind="modified" compact></ai-label>
```

- Language from the `lang` attribute, the closest `[lang]` ancestor or the browser.
- Theme with CSS variables: `--fg-ai-bg`, `--fg-ai-fg`, `--fg-ai-border`, `--fg-ai-accent`, `--fg-ai-radius`, `--fg-ai-font`.
- Labels use the official EU icons (free to use): `variant="eu"` shows the full official label, `icon="filigrane"` switches to Filigrane's icon. Colours: `--fg-ai-eu-bg`, `--fg-ai-eu-fg`.
- Events: `ai-disclosure-dismiss`.
- SSR-safe; `disclosureText('chat', 'fr')` returns the sentence for emails, voice or server-rendered pages.

More: <https://github.com/Sailxe42/filigrane>. Not legal advice. MIT licence.
