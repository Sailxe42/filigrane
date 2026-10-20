/**
 * @filigranejs/ui — accessible, multilingual AI disclosure components.
 *
 * Importing this module registers <ai-disclosure> and <ai-label> in browsers.
 */
import { defineElements } from './elements.ts';

export { AiDisclosureElement, AiLabelElement, AI_ICON, defineElements, euIconSvg } from './elements.ts';
export { EU_ICONS, type EuIcon } from './eu-icons.ts';
export { STRINGS, LANGUAGES, resolveLanguage, strings, type Strings } from './i18n.ts';

/** Plain-text disclosure for server-rendered pages, emails, voice assistants or logs. */
export { disclosureText } from './text.ts';

defineElements();
