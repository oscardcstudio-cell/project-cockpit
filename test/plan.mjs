// Vérification de scanPlan sur un repo git jetable — le calcul doit tenir
// sans dépendre du contenu d'un projet réel.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scanPlan, loadScopeMap, loadSteps } from '../src/plan/scanPlan.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planscan-'));
const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });

git('init', '-q');
git('config', 'user.email', 't@t');
git('config', 'user.name', 't');
fs.mkdirSync(path.join(root, '.planning'), { recursive: true });

fs.writeFileSync(path.join(root, '.planning/launch-plan.json'), JSON.stringify({
  steps: [
    { id: 'A', title: 'Close mais active', status: 'done', substeps: [{ status: 'done' }] },
    { id: 'B', title: 'Ouverte, gros volume, peu coche', status: 'todo',
      substeps: [{ status: 'done' }, { status: 'todo' }, { status: 'todo' }, { status: 'todo' }] },
    { id: 'C', title: 'Ouverte, aucun commit', status: 'todo', substeps: [{ status: 'todo' }] },
  ],
}));
fs.writeFileSync(path.join(root, '.planning/plan-map.json'), JSON.stringify({
  scopes: { ui: 'A', campagne: 'B', notes: '·' },
}));

// A : 1 commit récent → close mais active. B : 6 commits → travail non enregistré.
// notes : hors plan. zzz : scope inconnu.
const commit = (msg) => {
  fs.appendFileSync(path.join(root, 'f.txt'), msg + '\n');
  git('add', 'f.txt');
  execFileSync('git', ['commit', '-q', '-m', msg], { cwd: root, stdio: 'ignore' });
};
commit('fix(ui): bouton');
for (let i = 0; i < 6; i++) commit(`feat(campagne): post ${i}`);
commit('docs(notes): note');
commit('chore(zzz): inconnu');

const r = scanPlan(root);
assert.equal(r.ok, true, 'le scan doit aboutir');

const byId = Object.fromEntries(r.steps.map((s) => [s.id, s]));
assert.equal(byId.A.commits, 1, 'A doit compter 1 commit');
assert.equal(byId.B.commits, 6, 'B doit compter 6 commits');
assert.equal(byId.C.commits, 0, 'C ne doit compter aucun commit');

assert.equal(byId.A.contradiction, 'declaree-close-mais-active',
  'une etape close qui recoit encore des commits doit etre signalee');
assert.equal(byId.B.contradiction, 'travail-non-enregistre',
  'une etape a fort volume et peu cochee doit etre signalee');
assert.equal(byId.C.contradiction, null, 'une etape sans activite ne contredit rien');

assert.equal(r.offPlan.commits, 1, 'le scope hors plan ne doit avancer aucune etape');
assert.equal(r.unmapped.commits, 1, 'un scope inconnu doit rester non mappe');
assert.equal(r.unmapped.scopes.zzz, 1, 'le scope inconnu doit etre nomme');
assert.equal(r.totals.mapped, 7, '7 commits rattaches a une etape');

// Sans table, le module refuse de deviner.
fs.rmSync(path.join(root, '.planning/plan-map.json'));
const noMap = scanPlan(root);
assert.equal(noMap.ok, false, 'sans table, le scan ne doit pas pretendre aboutir');
assert.match(noMap.reason, /table scope/, 'la raison doit nommer la table manquante');

// Sans plan, idem.
fs.rmSync(path.join(root, '.planning/launch-plan.json'));
assert.equal(scanPlan(root).ok, false, 'sans plan, le scan ne doit pas aboutir');

assert.equal(loadScopeMap(root).map, null, 'table absente = null, pas un objet vide trompeur');
assert.deepEqual(loadSteps(root), [], 'plan absent = liste vide');

fs.rmSync(root, { recursive: true, force: true });
console.log('OK — scanPlan : 15 assertions vertes');
