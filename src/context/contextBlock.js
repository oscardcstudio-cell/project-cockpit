/**
 * Construit le bloc de contexte d'un domaine — le texte que le cockpit met dans le
 * presse-papier (« coller en début de conversation Claude ») et que le hook
 * SessionStart peut injecter tel quel. Une seule implémentation pour les deux voies.
 */

function fmtAge(ageDays) {
    if (ageDays === null || ageDays === undefined) return 'date inconnue';
    if (ageDays === 0) return 'aujourd’hui';
    if (ageDays === 1) return 'hier';
    return `il y a ${ageDays} j`;
}

export function buildContextBlock(model, domainId) {
    const d = model.domains.find((x) => x.id === domainId);
    if (!d) throw new Error(`Domaine inconnu : ${domainId}`);

    const lines = [];
    const projet = model.projet ? ` — ${model.projet}` : '';
    lines.push(`## Contexte de travail : ${d.label}${projet}`);
    if (model.phaseCourante) {
        lines.push(`Phase courante du projet (heuristique livrables) : P${model.phaseCourante.num} — ${model.phaseCourante.titre}.`);
        if (model.phaseCourante.gate) lines.push(`Gate en cours : ${model.phaseCourante.gate}`);
    }
    if (d.phases.length) {
        const liees = d.phases
            .map((n) => model.phases.find((p) => p.num === n))
            .filter(Boolean)
            .map((p) => `P${p.num} ${p.titre}`);
        if (liees.length) lines.push(`Phases du playbook liées à ce domaine : ${liees.join(' · ')}.`);
    }

    if (d.charger.length) {
        lines.push('', 'Charger avant de travailler :');
        for (const c of d.charger) {
            lines.push(`- \`${c.path}\`${c.regle ? ` — ${c.regle}` : ''}`);
        }
    }

    if (d.files.length) {
        lines.push('', 'État des fichiers du domaine :');
        for (const f of d.files) {
            const etat = f.rempli ? `modifié ${fmtAge(f.ageDays)}` : 'squelette / à produire';
            lines.push(`- \`${f.path}\` — ${etat}`);
        }
    }

    if (d.agents.length) lines.push('', `Agents pilotes : ${d.agents.join(', ')}.`);
    if (d.id === 'produit' && model.state.present) {
        lines.push('', 'L’état opérationnel vit dans `.planning/STATE.md` (source unique, prime sur le plan structuré) — le lire en premier.');
    }
    return lines.join('\n');
}

export default buildContextBlock;
