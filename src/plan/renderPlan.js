/**
 * Rend le modèle scanPlan() en vue HTML statique self-contained.
 * Lecture seule : aucun bouton d'action, aucun JS — la progressive disclosure
 * (résumé → détail) passe par <details> CSS pur.
 *
 * Priorité d'affichage (demande Oscar) : les contradictions déclaré/mesuré
 * sautent aux yeux en premier, avant l'aperçu des étapes ; le hors-plan reste
 * visible, jamais caché en bas de page comme un détail mineur.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function fmtDate(ts) {
  return ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '—';
}

function fmtPct(n) {
  return n === null || n === undefined ? '—' : `${n.toFixed(1).replace('.', ',')} %`;
}

function plural(n, mot) {
  return `${n} ${mot}${n > 1 ? 's' : ''}`;
}

// Symbole/label indépendants du vocabulaire d'un plan précis : on ne connaît
// à l'avance ni le nombre d'étapes ni leurs statuts exacts.
function statusMeta(status) {
  const s = String(status || '').toLowerCase();
  if (['done', 'skipped', 'cancelled'].includes(s)) return { sym: '✓', cls: 'ok', label: s === 'done' ? 'terminée' : s };
  if (['doing', 'active', 'in-progress', 'in_progress'].includes(s)) return { sym: '▶', cls: 'accent', label: 'en cours' };
  if (['todo', 'pending', 'planned'].includes(s)) return { sym: '○', cls: 'muted', label: 'à faire' };
  return { sym: '?', cls: 'muted', label: s || 'inconnu' };
}

function contradictionText(s) {
  if (s.contradiction === 'declaree-close-mais-active') {
    return `Déclarée ${s.subDone}/${s.subTotal} (close) mais ${plural(s.commits, 'commit')} il y a ${s.idleDays} j — ${fmtPct(s.share)} du dépôt encore mobilisés dessus.`;
  }
  if (s.contradiction === 'travail-non-enregistre') {
    return `Déclarée ${s.subDone}/${s.subTotal} seulement, mais ${plural(s.commits, 'commit')} (${fmtPct(s.share)} du dépôt) déjà investis — le plan sous-compte le travail réel.`;
  }
  return '';
}

function stepCard(s) {
  const st = statusMeta(s.status);
  const badge = s.contradiction
    ? `<span class="warnbadge">⚠ ${s.contradiction === 'declaree-close-mais-active' ? 'close mais active' : 'travail non enregistré'}</span>`
    : '';
  const scopes = s.scopes.length
    ? s.scopes.map((sc) => `<code>${esc(sc)}</code>`).join(' ')
    : '<span class="muted-t">aucune</span>';
  return `<article class="card${s.contradiction ? ' has-warn' : ''}">
  <div class="card-head">
    <span class="stepid">${esc(s.id)}</span>
    <span class="title">${esc(s.title)}</span>
    <span class="st ${st.cls}">${st.sym} ${esc(st.label)}</span>
  </div>
  <div class="compare">
    <div class="col"><span class="k">déclaré</span><span class="v">${s.subDone}/${s.subTotal}</span></div>
    <div class="col"><span class="k">mesuré</span><span class="v">${plural(s.commits, 'commit')} · ${fmtPct(s.share)}</span></div>
    <div class="col"><span class="k">inactif</span><span class="v">${s.idleDays === null ? '—' : `${s.idleDays} j`}</span></div>
  </div>
  ${badge}
  <details>
    <summary>Détail</summary>
    <div class="detail">
      <div><span class="k">première activité</span> ${fmtDate(s.first)}</div>
      <div><span class="k">dernière activité</span> ${fmtDate(s.last)}</div>
      <div><span class="k">scopes</span> ${scopes}</div>
    </div>
  </details>
</article>`;
}

export function renderPlan(model) {
  if (!model || !model.ok) {
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan de projet</title>
<style>
:root { --bg:#0d1117; --surface:#161b22; --fg:#c9d1d9; --fg2:#8b949e; --accent:#58a6ff; --ok:#3fb950; --warn:#e3b341; --danger:#f85149; --border:#30363d; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; padding:24px; }
.empty { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:20px; max-width:640px; }
.empty h1 { font-size:16px; margin:0 0 8px; }
.empty p { color:var(--fg2); margin:0; }
</style>
</head>
<body>
<div class="empty">
  <h1>Plan de projet — indisponible</h1>
  <p>${esc(model?.reason || 'raison inconnue')}</p>
</div>
</body>
</html>
`;
  }

  const contradictions = model.steps.filter((s) => s.contradiction);
  const alerts = contradictions.map((s) => `<div class="alert ${s.contradiction === 'declaree-close-mais-active' ? 'danger' : 'warn'}">
  <div class="alert-head"><span class="stepid">${esc(s.id)}</span> ${esc(s.title)}</div>
  <p>${contradictionText(s)}</p>
</div>`).join('');

  const cards = model.steps.map(stepCard).join('');

  const offPlanBlock = `<article class="card offplan">
  <div class="card-head"><span class="title">Hors plan</span></div>
  <div class="compare">
    <div class="col"><span class="k">mesuré</span><span class="v">${plural(model.offPlan.commits, 'commit')} · ${fmtPct(model.offPlan.share)}</span></div>
  </div>
  <p class="muted-t">Effort qui n'avance aucune étape déclarée (outillage, pilotage, notes…).</p>
</article>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan de projet</title>
<style>
:root { --bg:#0d1117; --surface:#161b22; --fg:#c9d1d9; --fg2:#8b949e; --accent:#58a6ff; --ok:#3fb950; --warn:#e3b341; --danger:#f85149; --border:#30363d; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; padding:24px; overflow-x:hidden; }
header { margin-bottom:20px; }
h1 { font-size:18px; margin:0 0 4px; }
h1 small { color:var(--fg2); font-weight:normal; }
h2 { font-size:14px; text-transform:uppercase; letter-spacing:.05em; color:var(--fg2); margin:0 0 10px; }
.alerts { margin-bottom:24px; }
.alert { border:1px solid var(--danger); border-left:4px solid var(--danger); border-radius:8px; background:var(--surface); padding:10px 14px; margin-bottom:10px; }
.alert.warn { border-color:var(--warn); border-left-color:var(--warn); }
.alert-head { font-weight:600; margin-bottom:4px; }
.alert p { margin:0; color:var(--fg); }
.stepid { display:inline-block; background:var(--bg); border:1px solid var(--border); border-radius:4px; padding:1px 6px; font-size:12px; color:var(--fg2); margin-right:6px; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; margin-bottom:24px; }
.card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:14px; }
.card.has-warn { border-color:var(--warn); }
.card.offplan { border-style:dashed; }
.card-head { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px; margin-bottom:10px; }
.title { font-weight:600; flex:1; min-width:0; }
.st { font-size:12px; white-space:nowrap; margin-left:auto; }
.st.ok { color:var(--ok); } .st.accent { color:var(--accent); } .st.muted { color:var(--fg2); }
.compare { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:8px; }
.compare .col { display:flex; flex-direction:column; }
.compare .k { color:var(--fg2); font-size:11px; text-transform:uppercase; letter-spacing:.03em; }
.compare .v { font-size:13px; }
.warnbadge { display:inline-block; font-size:12px; color:var(--warn); margin-bottom:6px; }
details { margin-top:4px; }
details summary { cursor:pointer; color:var(--accent); font-size:12px; }
.detail { margin-top:8px; display:flex; flex-direction:column; gap:4px; font-size:13px; }
.detail .k { color:var(--fg2); font-size:11px; text-transform:uppercase; letter-spacing:.03em; margin-right:6px; }
code { background:var(--bg); border:1px solid var(--border); border-radius:4px; padding:0 4px; color:var(--accent); font-size:12px; }
.muted-t { color:var(--fg2); font-size:12px; margin:6px 0 0; }
footer { color:var(--fg2); font-size:12px; margin-top:8px; }
@media (max-width:720px) {
  body { padding:14px; }
  .compare { gap:10px; }
}
</style>
</head>
<body>
<header>
  <h1>Plan de projet <small>· lecture seule · ${plural(model.totals.commits, 'commit')} analysés, ${model.totals.mapped} rattachés à une étape</small></h1>
</header>

${alerts ? `<section class="alerts"><h2>⚠ Contradictions déclaré / mesuré (${contradictions.length})</h2>${alerts}</section>` : ''}

<h2>Étapes</h2>
<div class="grid">${cards}${offPlanBlock}</div>

<footer>Rattachement scope→étape : ${model.mapping.source ? `<code>${esc(model.mapping.source)}</code> (${model.mapping.entries} entrées)` : 'inconnu'}${model.unmapped.commits ? ` · ${plural(model.unmapped.commits, 'commit')} non rattaché(s) à un scope connu` : ''}.</footer>
</body>
</html>
`;
}

export default renderPlan;
