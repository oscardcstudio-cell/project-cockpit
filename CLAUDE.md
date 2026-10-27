> Hiérarchie : hérite de C:\dev\claude\CLAUDE.md et C:\dev\claude\oscardcstudio\CLAUDE.md

# project-cockpit

Package partagé : génère un dashboard HTML statique de pilotage (domaines, phases, plan) depuis un projet `company/` et `.planning/`. Consommé uniquement en `github:oscardcstudio-cell/project-cockpit#<tag>`, jamais copié.

- Test : `npm test` (aucune dépendance, pas d'install requis).
- Tout changement de `src/` = bump de version dans `package.json` + tag `vX.Y.Z` poussé.
- La page générée est une vue en lecture seule : la source de vérité reste le markdown du projet, jamais éditer le HTML produit.
- Sortie dans un emplacement versionné du projet (`dashboards/cockpit.html`), jamais dans un temp OS.
- Carte des fichiers : [llms.txt](llms.txt).
