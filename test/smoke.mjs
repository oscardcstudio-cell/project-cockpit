import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanProject, parsePlaybookPhases, currentPhase } from '../src/scan/scanProject.js';
import { buildContextBlock } from '../src/context/contextBlock.js';
import { renderCockpit } from '../src/render/renderCockpit.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/mini');
const model = scanProject(fixture);

// — scan : phases parsées depuis le playbook du projet (pas de duplication)
assert.equal(model.projet, 'fixture-co');
assert.deepEqual(model.phases.map((p) => p.num), [0, 1, 3]);
assert.ok(model.phases[0].gate.includes('problème formulé'));
assert.deepEqual(model.phases[2].livrables, ['company/brand/plateforme.md', 'company/brand/guide_editorial.md']);

// — phase courante : hypotheses.md rempli (P0 ok), cibles.md squelette → P1
assert.equal(model.phaseCourante.num, 1);

// — fraîcheur / remplissage
const brand = model.domains.find((d) => d.id === 'brand');
assert.equal(brand.files.length, 3);
// guide_editorial.md est gros (> 600 o) mais truffé de placeholders [MAJUSCULES] → squelette
assert.equal(brand.remplis, 0);
assert.equal(brand.files.find((f) => f.path.endsWith('guide_editorial.md')).rempli, false);
const strat = model.domains.find((d) => d.id === 'strategie');
assert.equal(strat.files.find((f) => f.path.endsWith('hypotheses.md')).rempli, true);
// tags épistémiques ([HYPOTHÈSE], [DONNÉE RÉELLE]…) ≠ placeholders de template → rempli
assert.equal(strat.files.find((f) => f.path.endsWith('decisions-log.md')).rempli, true);

// — STATE.md détecté (domaine produit)
assert.equal(model.state.present, true);

// — bloc de contexte : règles de chargement + état fichiers
const ctx = buildContextBlock(model, 'marketing');
assert.ok(ctx.includes('Contexte de travail : Marketing & acquisition — fixture-co'));
assert.ok(ctx.includes('guide_editorial.md'));
assert.ok(ctx.includes('obligatoire avant tout texte'));
assert.ok(buildContextBlock(model, 'brand').includes('squelette / à produire'));
assert.throws(() => buildContextBlock(model, 'inconnu'));

// — rendu HTML : self-contained, domaines, contextes embarqués, échappement
const html = renderCockpit(model);
assert.ok(html.includes('<!doctype html>'));
assert.ok(html.includes('Marketing &amp; acquisition'));
assert.ok(html.includes('Copier le contexte pour Claude'));
assert.ok(html.includes('const CTX ='));
assert.ok(!/src\s*=\s*"http/.test(html), 'aucun asset externe');
assert.ok(!html.includes('</script></script>'));

// — currentPhase : toutes phases remplies → dernière phase
const all = new Map([['a.md', { rempli: true }]]);
assert.equal(currentPhase([{ num: 0, livrables: ['a.md'] }], all).num, 0);
assert.equal(parsePlaybookPhases(null).length, 0);

console.log('smoke OK — scan, phase courante, contexte, rendu');
