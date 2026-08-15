// Vérification du hook commit-msg : il doit poser le trailer tout seul dans le
// cas courant, et ne bloquer que là où un humain doit trancher.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BIN = path.join(process.cwd(), 'src', 'plan', 'commitStepTag.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'steptag-'));
fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
fs.writeFileSync(path.join(root, '.planning/plan-map.json'),
  JSON.stringify({ _doc: 'ignoré', scopes: { matching: 'D', notes: '·' } }));

const msgFile = path.join(root, 'MSG');
/** @returns {{code:number, msg:string}} */
function run(message) {
  fs.writeFileSync(msgFile, message);
  let code = 0;
  try {
    execFileSync('node', [BIN, msgFile, root], { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch (e) { code = e.status ?? 1; }
  return { code, msg: fs.readFileSync(msgFile, 'utf8') };
}

// Cas courant : le trailer est écrit sans rien demander.
let r = run('fix(matching): seuil\n');
assert.equal(r.code, 0, 'un scope connu ne doit pas bloquer');
assert.match(r.msg, /^Step: D$/m, 'le trailer doit être posé');

// Hors plan : la valeur '·' est légitime.
r = run('docs(notes): une idée\n');
assert.equal(r.code, 0);
assert.match(r.msg, /^Step: ·$/m, "le hors-plan doit être marqué '·'");

// Scope inconnu : c'est une décision, on bloque.
r = run('feat(nouveau): truc\n');
assert.equal(r.code, 1, 'un scope absent de la table doit bloquer');

// Pas de scope conventionnel : on bloque aussi.
assert.equal(run('un commit sans scope\n').code, 1);

// ...sauf si l'auteur déclare explicitement le hors-plan.
r = run('un commit sans scope\n\nStep: ·\n');
assert.equal(r.code, 0, "l'échappatoire explicite doit passer");

// Un Step invalide écrit à la main ne passe pas en douce.
assert.equal(run('fix(matching): x\n\nStep: ZZ\n').code, 1);

// Idempotent : pas de second trailer sur un message déjà tagué.
r = run('fix(matching): y\n\nStep: D\n');
assert.equal(r.code, 0);
assert.equal((r.msg.match(/^Step:/gm) || []).length, 1, 'un seul trailer');

// Commits fabriqués par git : jamais touchés.
for (const s of ['Merge branch \'br\'', 'Revert "fix(matching): x"', 'fixup! fix(matching): x']) {
  r = run(s + '\n');
  assert.equal(r.code, 0, `${s} ne doit pas bloquer`);
  assert.doesNotMatch(r.msg, /^Step:/m, `${s} ne doit pas être tagué`);
}

// Le trailer se range avec les autres, pas au milieu du corps.
r = run('fix(matching): z\n\nCorps.\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n');
assert.equal(r.code, 0);
assert.match(r.msg, /Co-Authored-By:[^\n]*\nStep: D\n$/, 'le trailer doit finir le message');

// Projet non équipé : le hook s'efface au lieu de bloquer.
fs.rmSync(path.join(root, '.planning/plan-map.json'));
assert.equal(run('n\'importe quoi\n').code, 0, 'sans table, aucun blocage');

fs.rmSync(root, { recursive: true, force: true });
console.log('OK — commitStepTag : 14 assertions vertes');
