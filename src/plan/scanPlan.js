// scanPlan — dérive l'avancement d'un plan à étapes depuis l'HISTORIQUE GIT,
// pas depuis des cases cochées à la main.
//
// Pourquoi : sur Mecene, le plan déclarait l'étape E à 1/7 alors que 267 commits
// (26 % du repo) y avaient été consacrés, et l'étape G à 2/7 avec zéro commit.
// Un plan tenu à la main enregistre ce qu'on DÉCIDE, pas ce qu'on FAIT. Mesuré
// le 2026-08-15 sur 1035 commits.
//
// Contrat, volontairement étroit pour rester réutilisable :
//   - les ÉTAPES viennent du plan du projet (fichier JSON à steps/substeps) ;
//   - le rattachement commit → étape vient d'une table `scope de commit → étape`
//     écrite UNE fois par projet, jamais par session ;
//   - tout le reste (volume, dates, inactivité, contradictions) est calculé.
//
// Ce module ne mesure PAS l'achèvement : il mesure où va le travail. Un module
// honnête ne prétend pas savoir ce que git ne sait pas.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DONEISH = new Set(['done', 'skipped', 'cancelled']);
const OFF_PLAN = '·'; // outillage, pilotage, notes : n'avance aucune étape

/** Lit les commits sans passer par un shell.
 *  Impératif : le proxy RTK tronque `git log` d'un facteur ~164 quand la
 *  commande transite par le shell (mesuré le 2026-08-15 : 35 lignes rendues au
 *  lieu de 5764, en silence). execFileSync contourne le hook. */
export function readCommits(root) {
  let raw;
  try {
    raw = execFileSync('git', ['log', '--pretty=format:%ct|%s'], {
      cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return []; // pas un repo git, ou git absent → le module dégrade, il ne ment pas
  }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const i = line.indexOf('|');
    if (i < 0) continue;
    const ts = Number(line.slice(0, i));
    if (!Number.isFinite(ts)) continue;
    const subject = line.slice(i + 1);
    const m = subject.match(/^[a-z]+(?:\(([^)]+)\))?/i);
    out.push({ ts, subject, scope: m && m[1] ? m[1].toLowerCase() : null });
  }
  return out;
}

/** Table scope → étape. Vit dans le PROJET, pas dans le package : chaque projet
 *  a ses propres scopes. Absente → on le dit, on ne devine pas. */
export function loadScopeMap(root, { file = '.planning/plan-map.json' } = {}) {
  const p = path.join(root, file);
  try {
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    const map = json.scopes || json;
    const norm = {};
    for (const [k, v] of Object.entries(map)) norm[String(k).toLowerCase()] = String(v);
    return { map: norm, source: file, entries: Object.keys(norm).length };
  } catch {
    return { map: null, source: null, entries: 0 };
  }
}

/** Étapes du plan. Format GSD `launch-plan.json` par défaut. */
export function loadSteps(root, { file = '.planning/launch-plan.json' } = {}) {
  try {
    const plan = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    return (plan.steps || []).map((s) => {
      const subs = Array.isArray(s.substeps) ? s.substeps : [];
      return {
        id: String(s.id),
        title: s.title || '',
        status: s.status || 'todo',
        subDone: subs.filter((x) => DONEISH.has(x.status)).length,
        subTotal: subs.length,
      };
    });
  } catch {
    return [];
  }
}

/**
 * @returns {{ok:boolean, reason?:string, steps:Array, offPlan:object, unmapped:object, totals:object, mapping:object}}
 */
export function scanPlan(root, { now = Math.floor(Date.now() / 1000), mapFile, planFile } = {}) {
  const steps = loadSteps(root, planFile ? { file: planFile } : undefined);
  const { map, source, entries } = loadScopeMap(root, mapFile ? { file: mapFile } : undefined);
  const commits = readCommits(root);

  const base = {
    totals: { commits: commits.length, mapped: 0 },
    mapping: { source, entries },
    steps: [], offPlan: { commits: 0 }, unmapped: { commits: 0, scopes: {} },
  };
  if (!steps.length) return { ...base, ok: false, reason: 'aucune étape trouvée dans le plan' };
  if (!map) return { ...base, ok: false, reason: 'aucune table scope→étape (.planning/plan-map.json)' };

  const acc = {};
  for (const s of steps) acc[s.id] = { n: 0, first: Infinity, last: 0, scopes: new Set() };
  const off = { n: 0 };
  const unmapped = { n: 0, scopes: {} };

  for (const c of commits) {
    const step = c.scope ? map[c.scope] : undefined;
    if (step === OFF_PLAN) { off.n++; continue; }
    if (!step || !acc[step]) {
      unmapped.n++;
      if (c.scope) unmapped.scopes[c.scope] = (unmapped.scopes[c.scope] || 0) + 1;
      continue;
    }
    const a = acc[step];
    a.n++; a.scopes.add(c.scope);
    if (c.ts < a.first) a.first = c.ts;
    if (c.ts > a.last) a.last = c.ts;
  }

  const totalCommits = commits.length || 1;
  const enriched = steps.map((s) => {
    const a = acc[s.id];
    const closed = DONEISH.has(s.status);
    const idleDays = a.last ? Math.round((now - a.last) / 86400) : null;
    // Les deux contradictions qui valent qu'on lève la main. Le seuil de 5 %
    // évite de crier sur une étape à trois commits.
    let contradiction = null;
    const share = a.n / totalCommits;
    if (closed && idleDays !== null && idleDays <= 7 && a.n > 0) {
      contradiction = 'declaree-close-mais-active';
    } else if (!closed && share >= 0.05 && s.subTotal && s.subDone / s.subTotal < 0.5) {
      contradiction = 'travail-non-enregistre';
    }
    return {
      ...s,
      commits: a.n,
      share: Math.round(share * 1000) / 10,
      first: a.first === Infinity ? null : a.first,
      last: a.last || null,
      idleDays,
      scopes: [...a.scopes].sort(),
      contradiction,
    };
  });

  return {
    ok: true,
    steps: enriched,
    offPlan: { commits: off.n, share: Math.round((off.n / totalCommits) * 1000) / 10 },
    unmapped: { commits: unmapped.n, scopes: unmapped.scopes },
    totals: { commits: commits.length, mapped: enriched.reduce((t, s) => t + s.commits, 0) },
    mapping: { source, entries },
  };
}

export default scanPlan;
