# project-cockpit

Dashboard de **pilotage projet** statique pour tout projet structuré `company/`
(+ GSD `.planning/` optionnel). Une page HTML self-contained, lecture seule :

- les **domaines cliquables** (business/stratégie, marque, marketing, produit, juridique, projets) ;
- la **gamme des phases** du `COMPANY_PLAYBOOK.md` avec gates (passée / en cours / à venir) ;
- la **fraîcheur des livrables** (date du dernier commit par fichier, fallback mtime) ;
- par domaine, un bouton **« Copier le contexte pour Claude »** : un bloc markdown
  (phase courante, fichiers à charger + règles à respecter, état des fichiers,
  agents pilotes) à coller en premier message d'une conversation — Claude sait
  immédiatement de quoi on parle, quel que soit le dossier de démarrage.

## Avancement dérivé de git (`project-cockpit/plan`, v0.2.0)

Un plan tenu à la main enregistre ce qu'on **décide**, pas ce qu'on **fait**.
Mesuré sur Mecene le 2026-08-15, 1037 commits : l'étape E était déclarée à 1/7
alors qu'elle concentrait **26 % de tout le repo** ; l'étape G était déclarée à
2/7 avec **zéro commit** (ses « acquis » étaient des décisions, pas du code).

`scanPlan()` rattache chaque commit à une étape via une table `scope → étape`
écrite **une seule fois** par projet, puis calcule volume, dates, inactivité et
**contradictions** :

- `declaree-close-mais-active` — étape marquée finie qui reçoit encore des commits ;
- `travail-non-enregistre` — étape à fort volume dont les sous-étapes restent décochées.

```js
import { scanPlan } from 'project-cockpit/plan';
const r = scanPlan(process.cwd());   // { ok, steps[], offPlan, unmapped, mapping }
```

### Le tag d'étape dans les commits (v0.3.0)

Le rattachement par scope est grossier : `fix(matching)` peut servir une étape
comme une autre. Le hook git `commit-msg` pose un trailer `Step: <id>` — mais
**sans rien demander** dans le cas courant : il lit le scope, le résout via la
table, et écrit le trailer lui-même. Il ne bloque que sur un scope absent de la
table, c'est-à-dire au seul moment où il faut décider à quelle étape ce travail
appartient.

```sh
# .githooks/commit-msg  (avec core.hooksPath=.githooks)
BIN="node_modules/project-cockpit/src/plan/commitStepTag.js"
[ -f "$BIN" ] || exit 0
node "$BIN" "$1" || exit 1
```

Silencieux si le package n'est pas installé (clone frais) ou si le projet n'a pas
de table. Les commits fabriqués par git (`Merge`, `Revert`, `fixup!`, `squash!`)
ne sont jamais touchés. Échappatoire explicite : écrire `Step: ·` à la main
déclare un travail hors plan.

Deux fichiers côté projet, aucun côté package :
`.planning/launch-plan.json` (les étapes) et `.planning/plan-map.json` (la table).
Table absente → `ok:false` avec la raison. **Le module ne devine jamais** un
rattachement, et il ne prétend pas mesurer l'achèvement : il mesure où va le
travail, ce que git sait réellement dire.

> Piège vérifié : le proxy RTK tronque `git log` d'un facteur ~164 quand la
> commande passe par un shell (35 lignes rendues au lieu de 5764, en silence).
> `readCommits()` appelle `execFileSync` directement pour contourner le hook.

**Principe de base** : le cockpit est une *vue générée*, jamais éditée.
La source de vérité reste le markdown du projet (`company/`, `.planning/STATE.md`).
Zéro serveur, zéro DB, zéro état propre → zéro divergence possible.

## Installation (jamais de copie — dépendance versionnée)

```bash
# en dépendance versionnée (Docker/Railway ET clone-seul)
npm i -D github:oscardcstudio-cell/project-cockpit#v0.3.0
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
# (github:#tag obligatoire : jamais de copie ni de file:)
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
