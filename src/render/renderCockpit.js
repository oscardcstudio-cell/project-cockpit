/**
 * Rend le modèle scanProject() en dashboard HTML statique self-contained.
 * Pattern maison « dark terminal » (cf. MODULES_CATALOG §5) : variables CSS,
 * bascule light/dark, monospace, zéro asset externe. Lecture seule : la page
 * n'écrit rien, elle copie des blocs de contexte dans le presse-papier.
 */
import { buildContextBlock } from '../context/contextBlock.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function statut(d) {
    if (!d.files.length) return { sym: '—', label: 'vide', cls: 'muted' };
    if (d.dernierAgeDays === null) return { sym: '○', label: 'date inconnue', cls: 'muted' };
    if (d.dernierAgeDays <= 7) return { sym: '✓', label: `à jour (${d.dernierAgeDays} j)`, cls: 'ok' };
    if (d.dernierAgeDays <= 30) return { sym: '●', label: `actif (${d.dernierAgeDays} j)`, cls: 'warn' };
    return { sym: '○', label: `dormant (${d.dernierAgeDays} j)`, cls: 'muted' };
}

function fmtDate(ts) {
    return new Date(ts * 1000).toISOString().slice(0, 10);
}

export function renderCockpit(model) {
    const contexts = Object.fromEntries(model.domains.map((d) => [d.id, buildContextBlock(model, d.id)]));
    const totalLivrables = model.phases.flatMap((p) => p.livrables);
    const filesByPath = new Map(model.domains.flatMap((d) => d.files.map((f) => [f.path, f])));
    const remplis = totalLivrables.filter((rel) => filesByPath.get(rel)?.rempli).length;
    const agesGlobaux = model.domains.map((d) => d.dernierAgeDays).filter((a) => a !== null);
    const dernierAge = agesGlobaux.length ? Math.min(...agesGlobaux) : null;
    const cur = model.phaseCourante?.num;

    const phaseRail = model.phases.map((p) => {
        const etat = cur === undefined || cur === null ? 'todo' : p.num < cur ? 'done' : p.num === cur ? 'cur' : 'todo';
        const sym = etat === 'done' ? '✓' : etat === 'cur' ? '▶' : '○';
        const lab = etat === 'done' ? 'passée' : etat === 'cur' ? 'en cours' : 'à venir';
        return `<div class="ph ${etat}" title="${esc(p.gate ?? '')}"><span class="sym">${sym}</span> P${p.num} ${esc(p.titre)} <span class="lab">${lab}</span></div>`;
    }).join('');

    const cards = model.domains.map((d) => {
        const s = statut(d);
        return `<button class="card" data-domain="${esc(d.id)}" aria-expanded="false">
  <div class="card-head"><span class="dom">${esc(d.label)}</span><span class="st ${s.cls}">${s.sym} ${esc(s.label)}</span></div>
  <div class="card-sub">${d.files.length} fichier(s) · ${d.remplis} rempli(s)${d.phases.length ? ` · phases ${d.phases.map((n) => `P${n}`).join(' ')}` : ''}</div>
</button>`;
    }).join('');

    const panels = model.domains.map((d) => {
        const rows = d.files.map((f) => {
            const etat = f.rempli
                ? `modifié ${f.ageDays === 0 ? 'aujourd’hui' : `il y a ${f.ageDays} j`}`
                : 'squelette / à produire';
            return `<tr><td><code>${esc(f.path)}</code></td><td>${esc(etat)}</td><td class="num">${(f.bytes / 1024).toFixed(1)} ko</td></tr>`;
        }).join('');
        const charger = d.charger.map((c) => `<li><code>${esc(c.path)}</code>${c.regle ? ` — ${esc(c.regle)}` : ''}</li>`).join('');
        return `<section class="panel" id="panel-${esc(d.id)}" hidden>
  <div class="panel-head">
    <h2>${esc(d.label)}</h2>
    <button class="copy" data-domain="${esc(d.id)}">Copier le contexte pour Claude</button>
  </div>
  ${d.agents.length ? `<p class="muted-t">Agents pilotes : ${esc(d.agents.join(', '))}</p>` : ''}
  ${charger ? `<h3>À charger en début de conversation</h3><ul>${charger}</ul>` : ''}
  ${rows ? `<h3>Fichiers</h3><div class="twrap"><table><thead><tr><th>Fichier</th><th>État</th><th>Taille</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted-t">Aucun fichier.</p>'}
  <details><summary>Bloc de contexte (aperçu)</summary><pre>${esc(contexts[d.id])}</pre></details>
</section>`;
    }).join('');

    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cockpit — ${esc(model.projet ?? 'projet')}</title>
<style>
:root { --bg:#0d1117; --bg2:#161b22; --fg:#c9d1d9; --fg2:#8b949e; --border:#30363d; --accent:#58a6ff; --ok:#3fb950; --warn:#d29922; }
html.light { --bg:#f6f8fa; --bg2:#ffffff; --fg:#1f2328; --fg2:#57606a; --border:#d0d7de; --accent:#0969da; --ok:#1a7f37; --warn:#9a6700; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; padding:24px; }
header { display:flex; justify-content:space-between; align-items:baseline; gap:16px; flex-wrap:wrap; margin-bottom:20px; }
h1 { font-size:18px; margin:0; } h1 small { color:var(--fg2); font-weight:normal; }
h2 { font-size:16px; margin:0; } h3 { font-size:13px; color:var(--fg2); text-transform:uppercase; letter-spacing:.05em; }
#mode { background:none; border:1px solid var(--border); color:var(--fg); padding:4px 10px; border-radius:6px; cursor:pointer; }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:20px; }
.tile { background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:12px 14px; }
.tile .v { font-size:20px; font-weight:600; } .tile .k { color:var(--fg2); font-size:12px; }
.rail { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px; }
.ph { border:1px solid var(--border); border-radius:6px; padding:4px 10px; font-size:12px; color:var(--fg2); background:var(--bg2); }
.ph.cur { border-color:var(--accent); color:var(--fg); }
.ph.done .sym { color:var(--ok); } .ph.cur .sym { color:var(--accent); }
.ph .lab { color:var(--fg2); font-size:11px; margin-left:4px; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; margin-bottom:24px; }
.card { text-align:left; background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:14px; cursor:pointer; color:var(--fg); font:inherit; }
.card:hover, .card.active { border-color:var(--accent); }
.card-head { display:flex; justify-content:space-between; gap:8px; align-items:baseline; }
.dom { font-weight:600; } .card-sub { color:var(--fg2); font-size:12px; margin-top:6px; }
.st { font-size:12px; white-space:nowrap; } .st.ok { color:var(--ok); } .st.warn { color:var(--warn); } .st.muted { color:var(--fg2); }
.panel { background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:16px 18px; margin-bottom:24px; }
.panel-head { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
.copy { background:var(--accent); color:var(--bg); border:none; border-radius:6px; padding:6px 12px; font:inherit; font-weight:600; cursor:pointer; }
.copy.copied { background:var(--ok); }
.twrap { overflow-x:auto; } table { border-collapse:collapse; width:100%; font-size:13px; }
th, td { text-align:left; padding:5px 10px; border-bottom:1px solid var(--border); } th { color:var(--fg2); font-weight:normal; }
td.num { text-align:right; color:var(--fg2); }
pre { background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:12px; overflow-x:auto; font-size:12px; }
code { color:var(--accent); } ul { padding-left:20px; } li { margin:3px 0; }
.muted-t { color:var(--fg2); } footer { color:var(--fg2); font-size:12px; margin-top:8px; }
details summary { cursor:pointer; color:var(--fg2); }
</style>
</head>
<body>
<header>
  <h1>Cockpit ${esc(model.projet ?? '')} <small>· généré le ${fmtDate(model.generatedAt)} · lecture seule</small></h1>
  <button id="mode" type="button">light / dark</button>
</header>
<div class="tiles">
  <div class="tile"><div class="v">${model.phaseCourante ? `P${model.phaseCourante.num}` : '?'}</div><div class="k">${esc(model.phaseCourante?.titre ?? 'phase inconnue')} (heuristique livrables)</div></div>
  <div class="tile"><div class="v">${remplis} / ${totalLivrables.length}</div><div class="k">livrables du playbook remplis</div></div>
  <div class="tile"><div class="v">${dernierAge === null ? '—' : dernierAge === 0 ? 'aujourd’hui' : `${dernierAge} j`}</div><div class="k">dernière activité company/</div></div>
  <div class="tile"><div class="v">${model.state.present ? '✓ présent' : '— absent'}</div><div class="k">.planning/STATE.md (GSD)</div></div>
</div>
<div class="rail">${phaseRail}</div>
<div class="grid">${cards}</div>
${panels}
<footer>Vue générée par project-cockpit — la source de vérité reste le markdown du projet. Cliquer un domaine puis « Copier le contexte » et coller en premier message d'une conversation Claude.</footer>
<script>
const CTX = ${JSON.stringify(contexts).replace(/</g, '\\u003c')};
document.getElementById('mode').addEventListener('click', () => document.documentElement.classList.toggle('light'));
function openDomain(id, scroll = true) {
  const panel = document.getElementById('panel-' + id);
  if (!panel) return;
  document.querySelectorAll('.card').forEach((c) => { const on = c.dataset.domain === id; c.classList.toggle('active', on); c.setAttribute('aria-expanded', String(on)); });
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = p !== panel; });
  history.replaceState(null, '', '#' + id);
  if (scroll) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
document.querySelectorAll('.card').forEach((card) => {
  card.addEventListener('click', () => openDomain(card.dataset.domain));
});
if (location.hash) openDomain(location.hash.slice(1), false);
document.querySelectorAll('.copy').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const text = CTX[btn.dataset.domain];
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    btn.classList.add('copied'); btn.textContent = 'Copié — coller en 1er message';
    setTimeout(() => { btn.classList.remove('copied'); btn.textContent = 'Copier le contexte pour Claude'; }, 2500);
  });
});
</script>
</body>
</html>
`;
}

export default renderCockpit;
