# project-cockpit

Dashboard de **pilotage projet** statique pour tout projet structuré `company/`
(+ GSD `.planning/` optionnel). Une page HTML self-contained, lecture seule :

- les **domaines cliquables** (business/stratégie, marque, marketing, produit, juridique, projets) ;
- la **gamme des phases** du `COMPANY_PLAYBOOK.md` avec gates (passée / en cours / à venir) ;
- la **fraîcheur des livrables** (date du dernier commit par fichier, fallback mtime) ;
- par domaine, un bouton **« Copier le contexte pour Claude »** : un bloc markdown
  (phase courante, fichiers à charger + règles non-négociables, état des fichiers,
  agents pilotes) à coller en premier message d'une conversation — Claude sait
  immédiatement de quoi on parle, quel que soit le dossier de démarrage.

**Principe non négociable** : le cockpit est une *vue générée*, jamais éditée.
La source de vérité reste le markdown du projet (`company/`, `.planning/STATE.md`).
Zéro serveur, zéro DB, zéro état propre → zéro divergence possible.

## Installation (jamais de copie — dépendance versionnée)

```bash
# en dépendance versionnée (Docker/Railway ET clone-seul)
npm i -D github:oscardcstudio-cell/project-cockpit#v0.1.0
# ou en local (monorepo de packages)
npm i -D file:../../packages/project-cockpit
```

## Usage

```bash
npx cockpit-generate [racine-du-projet] [--out dashboards/cockpit.html]
```

Sortie par défaut : `<racine>/dashboards/cockpit.html` — emplacement **versionné**
du projet, jamais un temp OS. Régénérer à la demande, par script npm, ou par hook
de fin de conversation (Stop) :

```json
{ "scripts": { "cockpit": "cockpit-generate . --out dashboards/cockpit.html" } }
```

## Brancher sur subvention_match (2 min)

```bash
cd subvention_match
npm i -D "github:oscardcstudio-cell/project-cockpit#v0.1.3"
# (github:#tag obligatoire dès que le projet build ailleurs — Railway/Docker ;
#  file:../../packages/project-cockpit réservé aux projets clone-seul local)
npx cockpit-generate . --out dashboards/cockpit.html
```

Prérequis : un dossier `company/` avec `COMPANY_PLAYBOOK.md` (les phases/gates sont
parsées depuis **le playbook du projet** — rien n'est dupliqué dans le package).
`.planning/STATE.md` (GSD) est détecté automatiquement et affiché comme source
unique de l'état opérationnel.

## API (pour hooks et scripts)

```js
import { scanProject } from 'project-cockpit/scan';
import { buildContextBlock } from 'project-cockpit/context';
import { renderCockpit } from 'project-cockpit/render';

const model = scanProject('/chemin/projet');       // lecture seule
// { git: false } → fraîcheur par mtime fs seul (2 ms au lieu de ~15 s de git log
// par fichier) — obligatoire dans un hook SessionStart.
const html  = renderCockpit(model);                // page complète
const bloc  = buildContextBlock(model, 'marketing'); // markdown injectable
```

### Volet SessionStart (enrichir `gsd-session-bilan.js`)

Le même `buildContextBlock` sert au bilan de démarrage : ajouter au hook local
(`C:\Users\oscar\.claude\hooks\gsd-session-bilan.js` ou volet dédié) :

```js
import { scanProject } from 'project-cockpit/scan';
import { buildContextBlock } from 'project-cockpit/context';
const model = scanProject(projectRoot);
// injecter un digest court : phase courante + carte des domaines
const digest = [
  model.phaseCourante ? `Phase playbook : P${model.phaseCourante.num} — ${model.phaseCourante.titre}` : null,
  ...model.domains.filter((d) => d.files.length).map((d) =>
    `- ${d.label} : ${d.remplis}/${d.files.length} livrables, dernier il y a ${d.dernierAgeDays ?? '?'} j`),
].filter(Boolean).join('\n');
```

Et si la première demande d'Oscar matche un domaine (mots-clés `companyPhases` de
`notes-backlog/presets/company-phases`), injecter `buildContextBlock(model, id)` complet.

## Carte des domaines

`src/domains/companyDomains.js` = data (domaine → dossiers, phases, fichiers à
charger + règles, agents pilotes), alignée sur `company/CLAUDE.md`. Un projet
non standard passe sa propre carte : `scanProject(root, { domains: maCarte })`.

## Heuristiques assumées (affichées comme telles)

- **Livrable « rempli »** : fichier ≥ 600 octets **et** < 2 placeholders de template.
  Un placeholder = crochet **multi-mots** type `[NOM DE L'ENTREPRISE]` ; les crochets
  mono-mot (`[VÉRIF]`, `[CNM]`, `[CXL]`) et les tags épistémiques connus
  (`[HYPOTHÈSE]`, `[DONNÉE RÉELLE]`, `[À SOURCER]`, `[RÉFUTÉ 0-3]`…) ne comptent
  jamais — calibré sur le corpus réel Mecene (v0.1.1–v0.1.2). Un `.json` non vide
  est toujours « rempli » (config GSD de 340 o ≠ squelette).
- **Phase courante** : première phase du playbook dont un livrable attendu est
  absent ou squelette. `.planning/STATE.md` reste l'état opérationnel qui **prime**
  (règle GOTCHAS 2026-07-18) — le cockpit l'affiche, ne le remplace pas.

## Tests

```bash
npm test   # test/smoke.mjs : scan fixture, phases, phase courante, contexte, rendu
```

## Non-buts (v1)

- Pas d'actions depuis la page (lancer une conv, éditer un fichier) → v2 possible
  via `remote-claude-chat` (relais → worker PC), la page reste statique d'ici là.
- Pas de graphiques : stat tiles + tables suffisent, statuts toujours symbole + libellé
  (jamais couleur seule).
