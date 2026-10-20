# L'article 50 de l'AI Act, pour les développeurs

Un résumé pratique des obligations de transparence de l'AI Act et de leur mise en œuvre avec Filigrane. **Ceci n'est pas un avis juridique** : faites valider votre situation par un avocat et lisez les sources citées en fin de page.

## Dates

| Date | Ce qui s'applique |
| --- | --- |
| 2 août 2026 | Les obligations de transparence de l'article 50 s'appliquent à tous les systèmes d'IA, quel que soit leur niveau de risque |
| 2 décembre 2026 | Obligation de marquage pour les systèmes génératifs déjà sur le marché avant le 2 août 2026 |

Les amendes en cas de manquement à l'article 50 peuvent atteindre 15 M€ ou 3 % du chiffre d'affaires annuel mondial, le montant le plus élevé étant retenu (article 99(4)).

## Les obligations

| Article | Qui | Obligation | Filigrane |
| --- | --- | --- | --- |
| 50(1) | Fournisseurs | Informer les personnes qu'elles interagissent avec un système d'IA (chatbots, assistants vocaux), sauf si c'est évident | `<ai-disclosure>`, `disclosureText()` |
| 50(2) | Fournisseurs | Marquer les sons, images, vidéos et textes générés ou manipulés par IA dans un format lisible par machine, détectable comme artificiel | `markImage()`, `markText()`, `verifyImage()` |
| 50(3) | Déployeurs | Informer les personnes exposées à la reconnaissance des émotions ou à la catégorisation biométrique | Hors périmètre |
| 50(4) | Déployeurs | Signaler les deepfakes ; étiqueter les textes d'IA publiés pour informer le public sur des sujets d'intérêt public, sauf relecture sous responsabilité éditoriale | `<ai-label>` |

**Fournisseur ou déployeur ?** Si vous mettez un système d'IA sur le marché sous votre nom — y compris une appli qui appelle l'API d'un modèle tiers — vous êtes probablement fournisseur de ce système. Si vous utilisez un système d'IA dans votre propre activité, vous êtes déployeur. Beaucoup d'entreprises sont les deux.

## Le Code de bonnes pratiques

La Commission européenne a publié le 10 juin 2026 un Code de bonnes pratiques sur le marquage et l'étiquetage des contenus générés par IA ; la Commission et le Comité IA l'ont jugé adéquat pour démontrer la conformité. Points techniques clés :

- **Au moins deux couches de marquage lisible par machine** si nécessaire, par exemple des métadonnées et un filigrane, car aucune technique n'est assez robuste seule.
- **Détection** : permettre aux déployeurs, utilisateurs, autorités et chercheurs de vérifier qu'un contenu est généré par IA.
- **Étiquettes** : visibles au plus tard quand la personne voit le contenu pour la première fois, non masquées, conservées lors du partage. L'UE publie des icônes gratuites à cet effet.
- **Accessibilité** : langage simple, texte alternatif ou attributs ARIA pour les technologies d'assistance.

## Liste de contrôle

- [ ] Chaque interface de chat affiche `<ai-disclosure>` (ou un message équivalent) avant ou au premier message.
- [ ] Chaque image générée passe par `markImage()` avec un certificat de signature de production.
- [ ] Les textes générés qui sortent de votre produit sont marqués avec `markText()` ; les textes publiés sur des sujets d'intérêt public portent `<ai-label>`, sauf relecture éditoriale.
- [ ] Les deepfakes sont étiquetés visiblement et l'étiquette reste lors du téléchargement ou du partage.
- [ ] `filigrane scan` tourne en CI (GitHub Action) et son rapport Markdown est conservé comme preuve.
- [ ] Sons et vidéos générés : vérifiez que votre fournisseur les marque (support Filigrane prévu).

## Sources

- [Commission européenne — Code de bonnes pratiques sur la transparence des contenus générés par IA](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)
- [Commission européenne — Icônes de l'UE pour l'étiquetage des contenus générés par IA](https://digital-strategy.ec.europa.eu/en/policies/eu-icons-labelling-ai-generated-content)
- [Goodwin — Les obligations de transparence de l'AI Act sont en vigueur (août 2026)](https://www.goodwinlaw.com/en/insights/publications/2026/08/alerts-technology-dpc-eu-ai-act-transparency-obligations-now-in-force)
- [Jones Day — Code de bonnes pratiques final (juin 2026)](https://www.jonesday.com/en/insights/2026/06/european-commission-publishes-final-code-of-practice-on-marking-and-labelling-aigenerated-content)
- [Règlement (UE) 2026/1744 (omnibus numérique sur l’IA) : délai jusqu’au 2 décembre 2026 pour le marquage de l’article 50(2) des systèmes déjà sur le marché](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=OJ:L_202601744)
