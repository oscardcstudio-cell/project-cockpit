/**
 * Carte des domaines d'un projet structuré `company/` (cf. company/CLAUDE.md).
 *
 * C'est de la DATA : le scanner et le renderer sont agnostiques. Un projet qui
 * s'écarte de la structure standard peut passer sa propre carte à scanProject().
 *
 * - `dirs` : dossiers company/ appartenant au domaine (fichiers scannés pour la fraîcheur).
 * - `phases` : numéros de phase du COMPANY_PLAYBOOK.md liés (les libellés/gates sont
 *   parsés depuis le playbook du projet scanné — jamais dupliqués ici).
 * - `charger` : fichiers à charger en début de conversation sur ce domaine, dans
 *   l'ordre, avec la règle non-négociable associée quand il y en a une.
 * - `agents` : agents pilotes indiqués par le playbook (indicatif).
 */
export const companyDomains = [
    {
        id: 'strategie',
        label: 'Business & stratégie',
        dirs: ['company/strategie'],
        phases: [0, 1, 2],
        charger: [
            { path: 'company/strategie/hypotheses.md', regle: 'obligatoire avant toute décision stratégique' },
            { path: 'company/strategie/metrics.md', regle: 'obligatoire avant toute décision stratégique' },
            { path: 'company/strategie/business_plan.md' },
            { path: 'company/strategie/distribution.md' },
        ],
        agents: ['meta-business', 'meta-offre-pricing'],
    },
    {
        id: 'brand',
        label: 'Marque & éditorial',
        dirs: ['company/brand'],
        phases: [3, 5],
        charger: [
            { path: 'company/brand/plateforme.md' },
            { path: 'company/brand/guide_editorial.md', regle: 'obligatoire avant tout texte au nom de l’entreprise' },
            { path: 'company/brand/charte.md', regle: 'obligatoire avant tout visuel' },
            { path: 'company/brand/direction_artistique.md', regle: 'obligatoire avant tout visuel' },
        ],
        agents: ['meta-creation', 'meta-redacteur'],
    },
    {
        id: 'marketing',
        label: 'Marketing & acquisition',
        dirs: ['company/marketing'],
        phases: [4, 7],
        charger: [
            { path: 'company/brand/guide_editorial.md', regle: 'obligatoire avant tout texte au nom de l’entreprise' },
            { path: 'company/marketing/plan_marketing.md' },
            { path: 'company/marketing/calendrier_editorial.md' },
            { path: 'company/strategie/distribution.md' },
        ],
        agents: ['meta-marketing', 'meta-ux-conversion'],
    },
    {
        id: 'produit',
        label: 'Produit & build',
        dirs: ['.planning'],
        phases: [6],
        charger: [
            { path: '.planning/STATE.md', regle: 'source unique de l’état opérationnel (prime sur le plan structuré)' },
            { path: '.planning/ROADMAP.md' },
        ],
        agents: ['meta-ui-ux', 'meta-motion'],
    },
    {
        id: 'juridique',
        label: 'Juridique (transverse)',
        dirs: ['company/juridique'],
        phases: [],
        charger: [
            { path: 'company/juridique/statuts.md', regle: 'obligatoire avant toute demande juridique' },
            { path: 'company/juridique/checklist_solo.md', regle: 'si solo founder' },
            { path: 'company/juridique/pacte_associes.md', regle: 'si associés' },
        ],
        agents: ['meta-juridique'],
    },
    {
        id: 'projets',
        label: 'Projets en cours',
        dirs: ['company/projets'],
        phases: [],
        charger: [],
        agents: [],
    },
];

export default companyDomains;
