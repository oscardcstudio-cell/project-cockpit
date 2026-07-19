#!/usr/bin/env node
/**
 * cockpit-generate [root] [--out <fichier.html>]
 * Scanne le projet (défaut : cwd) et écrit le dashboard.
 * Sortie par défaut : <root>/dashboards/cockpit.html — emplacement versionné,
 * jamais un temp OS (règle d'or artefacts 2026-06-20).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { scanProject } from './scan/scanProject.js';
import { renderCockpit } from './render/renderCockpit.js';

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const out = outIdx !== -1 ? argv.splice(outIdx, 2)[1] : null;
const root = resolve(argv[0] ?? process.cwd());
const outPath = resolve(out ?? resolve(root, 'dashboards/cockpit.html'));

const model = scanProject(root);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, renderCockpit(model));
console.log(`cockpit généré : ${outPath}`);
console.log(`  projet : ${model.projet ?? '(sans info.json)'} · phase courante : ${model.phaseCourante ? `P${model.phaseCourante.num} ${model.phaseCourante.titre}` : 'inconnue'} · domaines : ${model.domains.length}`);
