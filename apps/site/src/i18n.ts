/** Site translations. English lives in the HTML; this file holds French and the runtime switcher. */

export type Lang = 'en' | 'fr';

export const FR: Record<string, string> = {
  skip: 'Aller au contenu',
  copy: 'Copier',
  copied: 'Copié',
  'nav.how': 'Fonctionnement',
  'nav.code': 'Code',
  'nav.verify': 'Vérifier un fichier',
  'hero.eyebrow': 'Open source · AI Act, article 50',
  'hero.title': 'Rendez votre appli d’IA <em>transparente</em> en une après-midi',
  'hero.lead':
    'Marquez les images générées par IA avec deux couches invisibles, prévenez vos utilisateurs qu’ils parlent à une IA dans 24 langues, et vérifiez n’importe quel fichier — avec une seule boîte à outils TypeScript qui tourne partout.',
  'hero.verify': 'Vérifier un fichier',
  'hero.start': 'Démarrer',
  'obl.title': 'Trois obligations, un seul kit',
  'obl.lead': 'L’article 50 de l’AI Act s’applique depuis le 2 août 2026, avec des amendes jusqu’à 15 M€ ou 3 % du chiffre d’affaires mondial.',
  'obl.chat.title': 'Signaler les chatbots',
  'obl.chat.body': 'Les personnes doivent savoir qu’elles interagissent avec un système d’IA, au plus tard lors de la première interaction.',
  'obl.mark.title': 'Marquer les contenus générés',
  'obl.mark.body': 'Les contenus doivent être lisibles par machine et détectables comme générés par IA. Le Code de bonnes pratiques attend au moins deux couches de marquage.',
  'obl.label.title': 'Étiqueter deepfakes et textes IA',
  'obl.label.body': 'Les déployeurs doivent étiqueter visiblement les deepfakes et les textes d’IA publiés sur des sujets d’intérêt public.',
  'how.title': 'Trois couches qui se protègent mutuellement',
  'how.lead': 'Un réseau social peut effacer les métadonnées. Les pixels peuvent être retouchés. Ensemble, les couches gardent le signal.',
  'how.c2pa.title': 'Manifeste C2PA signé (Content Credentials)',
  'how.c2pa.body': 'Un historique signé cryptographiquement de la façon dont l’image a été créée. La moindre modification du fichier casse la signature : la falsification se voit.',
  'how.c2pa.p1': 'Infalsifiable',
  'how.c2pa.p2': 'Standard du secteur',
  'how.c2pa.p3': 'Perdu si les métadonnées sont effacées',
  'how.iptc.title': 'Métadonnées IPTC « Digital Source Type »',
  'how.iptc.body': 'Le marqueur que les moteurs de recherche, réseaux sociaux et logiciels photo lisent déjà pour afficher « généré par IA ».',
  'how.iptc.p1': 'Largement reconnu',
  'how.iptc.p2': 'Perdu si les métadonnées sont effacées',
  'how.wm.title': 'Filigrane invisible dans les pixels',
  'how.wm.body': 'Un code de 64 bits réparti sur des milliers de coefficients de fréquence, invisible à l’œil (≈ 43 dB de PSNR), relié au manifeste.',
  'how.wm.p1': 'Résiste à la recompression JPEG',
  'how.wm.p2': 'Résiste au redimensionnement',
  'how.wm.p3': 'Résiste à l’effacement des métadonnées',
  'how.wm.p4': 'Pas encore : le recadrage',
  'code.title': 'Quelques lignes, dans la stack que vous utilisez déjà',
  'code.lead': 'Pur TypeScript, zéro dépendance native : Node.js, navigateurs, Deno, Bun et runtimes edge.',
  'demo.title': 'Composants en direct, dans chaque langue de l’UE',
  'demo.lead': 'Accessibles, personnalisables par variables CSS, et ils laissent une puce « IA » visible après fermeture de la bannière.',
  'demo.language': 'Langue',
  'facts.layers': 'couches de marquage',
  'facts.langs': 'langues de l’UE',
  'facts.native': 'dépendance native',
  'facts.license': 'licence libre',
  'faq.title': 'Questions',
  'faq.q1': 'Filigrane me rend-il conforme ?',
  'faq.a1':
    'Il implémente les mesures techniques décrites dans le Code de bonnes pratiques de la Commission : marquage multicouche, détection et signalement visible. La conformité dépend aussi de votre rôle, de votre produit et de la façon dont vous publiez — ceci n’est pas un avis juridique.',
  'faq.q2': 'Avec quel certificat signer ?',
  'faq.a2':
    'En production, utilisez un certificat d’une autorité de certification présente sur la liste de confiance C2PA. Pour tester, `filigrane keygen` crée un certificat de développement : les manifestes sont valides mais affichés « non approuvés ».',
  'faq.q3': 'Le vérificateur envoie-t-il mes fichiers ?',
  'faq.a3': 'Non. Tout s’exécute dans votre navigateur ; le fichier ne quitte jamais votre appareil.',
  'faq.q4': 'Le filigrane est-il robuste ?',
  'faq.a4':
    'Il résiste à la recompression JPEG jusqu’à la qualité 50, au redimensionnement, aux changements de luminosité et à l’effacement des métadonnées. Le recadrage et la rotation ne sont pas encore gérés. Chaque version est testée automatiquement.',
  'faq.q5': 'Est-ce compatible avec les autres outils C2PA ?',
  'faq.a5': 'Oui. Chaque commit est vérifié par l’implémentation de référence C2PA (c2pa-rs), et Filigrane lit les manifestes produits par d’autres outils.',
  'footer.disclaimer':
    'Filigrane est un projet open source indépendant, sans lien avec la Commission européenne. Il fournit des mesures techniques, pas un avis juridique.',
  'footer.made': 'Fabriqué en France',
  // verify page
  'v.title': 'Vérifiez si un contenu a été généré par IA',
  'v.lead': 'Glissez une image : Filigrane cherche un manifeste C2PA signé, des métadonnées IPTC et un filigrane invisible. Ou collez un texte.',
  'v.drop': 'Déposez une image JPEG ou PNG',
  'v.drop2': 'ou cliquez pour choisir un fichier',
  'v.privacy': 'Le fichier ne quitte jamais votre appareil.',
  'v.textTitle': 'Vérifier un texte',
  'v.textHint': 'Collez un texte qui pourrait contenir des marqueurs d’IA invisibles.',
  'v.samples': 'Ou essayez un exemple :',
  'v.s1': 'Image générée par IA',
  'v.s2': 'Après un réseau social',
  'v.s3': 'Image sans marquage',
  'v.textCheck': 'Vérifier le texte',
  'v.playTitle': 'Essayer : marquer une image',
  'v.playLead': 'Marquez une image avec les trois couches (certificat de démonstration), puis simulez un réseau social qui efface les métadonnées et recompresse.',
  'v.playPick': 'Choisir une image à marquer',
  'v.download': 'Télécharger l’image marquée',
  'v.launder': 'Simuler un réseau social (effacer + recompresser)',
  'v.working': 'Analyse en cours…',
};

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('fg-site-lang');
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {
    // ignore
  }
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

const original = new Map<Element, string>();

/** Swaps every [data-i18n] / [data-i18n-html] element to the requested language. */
export function applyLang(lang: Lang): void {
  document.documentElement.lang = lang;
  try {
    localStorage.setItem('fg-site-lang', lang);
  } catch {
    // ignore
  }
  for (const el of document.querySelectorAll('[data-i18n], [data-i18n-html]')) {
    const html = el.hasAttribute('data-i18n-html');
    const key = el.getAttribute(html ? 'data-i18n-html' : 'data-i18n')!;
    if (!original.has(el)) original.set(el, html ? el.innerHTML : el.textContent ?? '');
    const value = lang === 'fr' ? FR[key] : undefined;
    const text = value ?? original.get(el)!;
    if (html) el.innerHTML = text;
    else el.textContent = text;
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
}

export function t(key: string, en: string): string {
  return document.documentElement.lang === 'fr' && FR[key] ? FR[key] : en;
}

export function initLangSwitch(): Lang {
  const lang = detectLang();
  applyLang(lang);
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
    b.addEventListener('click', () => applyLang(b.dataset.lang as Lang));
  }
  return lang;
}
