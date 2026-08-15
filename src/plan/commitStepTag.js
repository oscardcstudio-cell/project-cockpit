#!/usr/bin/env node
// commit-step-tag — hook git `commit-msg`.
//
// Pose un trailer `Step: <id>` sur chaque commit, pour que l'avancement du plan
// se dérive de l'historique au lieu d'être déclaré à la main.
//
// Pourquoi ce hook existe : mesuré le 2026-08-15 sur 1035 commits, seuls 4
// référençaient une étape du plan. L'avancement se déduisait donc du scope
// conventionnel seul — utile, mais grossier : `fix(matching)` peut servir le
// gate D comme la revue de E. Un trailer explicite tranche.
//
// Le hook ne demande RIEN dans le cas courant : il lit le scope du sujet, le
// résout via `.planning/plan-map.json` (la même table que project-cockpit/plan)
// et écrit le trailer lui-même. Il ne bloque que sur un scope absent de la
// table — le seul moment où un humain doit trancher à quelle étape ça appartient.
//
// Silencieux hors projet équipé : sans plan-map.json, le hook s'efface.

import fs from 'node:fs';
import path from 'node:path';

const msgPath = process.argv[2];
if (!msgPath) process.exit(0);

const root = process.argv[3] || process.cwd();
const MAP = path.join(root, '.planning', 'plan-map.json');
const PLAN = path.join(root, '.planning', 'launch-plan.json');

// Projet non équipé → le hook n'a rien à dire.
if (!fs.existsSync(MAP)) process.exit(0);

let raw;
try { raw = fs.readFileSync(msgPath, 'utf8'); } catch { process.exit(0); }

const lines = raw.split(/\r?\n/);
const subject = (lines.find((l) => l.trim() && !l.startsWith('#')) || '').trim();

// Commits mécaniques : rien à rattacher, git les fabrique.
// Pas de `\b` après les `!` : entre `!` et l'espace il n'y a aucune frontière de
// mot (deux caractères non-alphanumériques), donc `fixup!\b` ne matche jamais et
// les commits d'autofixup se faisaient bloquer. Attrapé par le test.
if (/^(Merge\b|Revert\b|fixup!|squash!|amend!)/.test(subject)) process.exit(0);

// Déjà tagué à la main → on valide au lieu de réécrire.
const existing = raw.match(/^Step:\s*(\S+)\s*$/m);

const map = (() => {
  try {
    const j = JSON.parse(fs.readFileSync(MAP, 'utf8'));
    const m = j.scopes || j;
    const out = {};
    for (const [k, v] of Object.entries(m)) {
      if (k.startsWith('_')) continue;
      out[String(k).toLowerCase()] = String(v);
    }
    return out;
  } catch { return null; }
})();
if (!map) process.exit(0); // table illisible : on ne bloque pas sur notre propre panne

const validIds = new Set(Object.values(map));
validIds.add('·'); // hors plan, valeur légitime

function die(reason, hint) {
  process.stderr.write(
    `\n[commit-step-tag] BLOQUE : ${reason}\n${hint}\n\n` +
    `Étapes connues : ${[...validIds].sort().join(' ')}\n` +
    `  · = hors plan (outillage, pilotage, notes) — n'avance aucune étape.\n` +
    `Table : .planning/plan-map.json\n\n`
  );
  process.exit(1);
}

if (existing) {
  if (!validIds.has(existing[1])) {
    die(`\`Step: ${existing[1]}\` ne correspond à aucune étape du plan.`,
      `Corrige le trailer, ou ajoute le scope à la table s'il s'agit d'une nouvelle étape.`);
  }
  process.exit(0);
}

const scoped = subject.match(/^[a-z]+\(([^)]+)\)/i);
if (!scoped) {
  die('ce commit n\'a pas de scope conventionnel, impossible de le rattacher à une étape.',
    'Écris `type(scope): sujet`, ou ajoute une ligne `Step: ·` si le travail n\'avance aucune étape.');
}

const scope = scoped[1].toLowerCase();
const step = map[scope];
if (!step) {
  die(`le scope \`${scope}\` est absent de la table scope → étape.`,
    `Ajoute-le à .planning/plan-map.json (c'est une décision : à quelle étape ce travail appartient-il ?),\n` +
    `ou mets \`Step: ·\` dans ce message si ça n'avance aucune étape.`);
}

// Cas courant : on écrit le trailer nous-mêmes, l'auteur n'a rien à faire.
// Placé en fin de bloc de trailers (Co-Authored-By & co) pour rester conforme.
const body = raw.replace(/\s*$/, '');
fs.writeFileSync(msgPath, `${body}\nStep: ${step}\n`);
