/**
 * Scanne un projet structuré company/ (+ GSD .planning/ optionnel) et produit le
 * modèle de données du cockpit. Lecture seule, zéro état propre : la source de
 * vérité reste le markdown du projet.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import companyDomains from '../domains/companyDomains.js';

const FILLED_MIN_BYTES = 600; // en dessous : considéré squelette/template (heuristique affichée comme telle)
// ≥ 2 placeholders type [NOM DE L'ENTREPRISE] = template create-company pas encore rempli
const PLACEHOLDER_RE = /\[[A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9 '’/.-]{2,}\]/g;
// Un placeholder de template est un groupe nominal multi-mots décrivant quoi
// insérer ([NOM DE L'ENTREPRISE], [ADJECTIF 1]). Les crochets mono-mot sont des
// tags ([VÉRIF], [FRAGILE]), acronymes ou citations ([CNM], [CXL]) présents dans
// des docs remplis — jamais comptés. Les tags épistémiques multi-mots connus
// ([DONNÉE RÉELLE], [À SOURCER], [RÉFUTÉ 0-3]…) sont exemptés par préfixe.
const EPISTEMIC_TAG_PREFIXES = [
    'HYPOTHÈSE', 'DONNÉE RÉELLE', 'À SOURCER', 'À VÉRIFIER', 'À MESURER',
    'RÉFUTÉ', 'TODO', 'WIP', 'N/A',
];

function isPlaceholder(match) {
    const inner = match.slice(1, -1);
    if (!inner.includes(' ')) return false;
    return !EPISTEMIC_TAG_PREFIXES.some((p) => inner.startsWith(p));
}

function isFilled(root, rel, bytes) {
    // Un .json non vide est complet quelle que soit sa taille (config, manifest…)
    if (/\.json$/i.test(rel)) return bytes > 2;
    if (bytes < FILLED_MIN_BYTES) return false;
    if (!/\.md$/i.test(rel)) return true;
    const content = safeRead(root, rel) ?? '';
    return (content.match(PLACEHOLDER_RE) ?? []).filter(isPlaceholder).length < 2;
}

function safeRead(root, rel) {
    try { return readFileSync(join(root, rel), 'utf8'); } catch { return null; }
}

/** Timestamp (s) du dernier commit touchant `rel`, sinon mtime fs, sinon null. */
function lastTouched(root, rel, useGit) {
    if (useGit) {
        try {
            const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', rel], {
                cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
            }).trim();
            if (out) return Number(out);
        } catch { /* fallback fs */ }
    }
    try { return Math.floor(statSync(join(root, rel)).mtimeMs / 1000); } catch { return null; }
}

function isGitRepo(root) {
    try {
        execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
        return true;
    } catch { return false; }
}

/** Parse les phases du COMPANY_PLAYBOOK.md du projet (source de vérité, jamais dupliquée). */
export function parsePlaybookPhases(md) {
    if (!md) return [];
    const phases = [];
    const heading = /^#{2,3}\s+Phase\s+(\d+)\s+—\s+(.+)$/gm;
    let m;
    while ((m = heading.exec(md)) !== null) {
        const start = m.index + m[0].length;
        const next = md.slice(start).search(/^#{2,3}\s+/m);
        const body = md.slice(start, next === -1 ? undefined : start + next);
        const gate = body.match(/\*\*Gate[^*]*\*\*\s*:?\s*([^\n]+)/);
        // Les playbooks notent les livrables relatifs à company/ (`strategie/x.md`)
        // ou complets (`company/strategie/x.md`) : on normalise en chemin complet.
        const livrables = [...body.matchAll(/`([\w.-]+(?:\/[\w.-]+)+\.md)`/g)]
            .map((x) => x[1])
            .map((p) => (/^(?:company|\.planning)\//.test(p) ? p
                : /^(?:strategie|brand|marketing|juridique|projets)\//.test(p) ? `company/${p}` : null))
            .filter(Boolean);
        phases.push({
            num: Number(m[1]),
            titre: m[2].replace(/\s*\*\(.*\)\*\s*$/, '').trim(),
            gate: gate ? gate[1].trim() : null,
            livrables: [...new Set(livrables)],
        });
    }
    return phases.sort((a, b) => a.num - b.num);
}

function listDomainFiles(root, domain, useGit, now) {
    const files = [];
    for (const dir of domain.dirs) {
        const abs = join(root, dir);
        if (!existsSync(abs)) continue;
        for (const name of readdirSync(abs).sort()) {
            if (!/\.(md|json)$/i.test(name)) continue;
            const rel = `${dir}/${name}`;
            let bytes = 0;
            try { bytes = statSync(join(root, rel)).size; } catch { continue; }
            const ts = lastTouched(root, rel, useGit);
            files.push({
                path: rel,
                bytes,
                rempli: isFilled(root, rel, bytes),
                touchedAt: ts,
                ageDays: ts ? Math.floor((now - ts) / 86400) : null,
            });
        }
    }
    return files;
}

/**
 * Phase courante = première phase dont un livrable attendu est absent ou squelette.
 * Heuristique assumée (affichée comme telle) ; STATE.md reste l'état opérationnel qui prime.
 */
export function currentPhase(phases, filesByPath) {
    for (const p of phases) {
        if (p.livrables.length === 0) continue;
        const manque = p.livrables.some((rel) => {
            const f = filesByPath.get(rel);
            return !f || !f.rempli;
        });
        if (manque) return p;
    }
    return phases[phases.length - 1] ?? null;
}

// `git: false` → fraîcheur par mtime fs seul (un `git log` par fichier coûte
// ~15 s sur un gros company/ — rédhibitoire pour un hook SessionStart).
export function scanProject(root, { domains = companyDomains, now = Math.floor(Date.now() / 1000), git = true } = {}) {
    const useGit = git && isGitRepo(root);
    const infoRaw = safeRead(root, 'company/info.json');
    let info = null;
    try { info = infoRaw ? JSON.parse(infoRaw) : null; } catch { info = null; }

    const phases = parsePlaybookPhases(safeRead(root, 'company/COMPANY_PLAYBOOK.md'));

    const scannedDomains = domains.map((d) => {
        const files = listDomainFiles(root, d, useGit, now);
        const ages = files.map((f) => f.ageDays).filter((a) => a !== null);
        return {
            ...d,
            files,
            remplis: files.filter((f) => f.rempli).length,
            dernierAgeDays: ages.length ? Math.min(...ages) : null,
        };
    });

    const filesByPath = new Map(scannedDomains.flatMap((d) => d.files.map((f) => [f.path, f])));
    const phase = currentPhase(phases, filesByPath);

    const stateMd = safeRead(root, '.planning/STATE.md');
    return {
        generatedAt: now,
        projet: info?.name ?? info?.nom ?? null,
        root,
        phases,
        phaseCourante: phase,
        domains: scannedDomains,
        state: stateMd ? { present: true, extrait: stateMd.split('\n').slice(0, 40).join('\n') } : { present: false },
    };
}

export default scanProject;
