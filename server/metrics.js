"use strict";

// =====================================================================
// MESURES DU SERVEUR (performance, 2026-10-09) : nombre de requêtes et
// temps de réponse par route, attente du verrou de sauvegarde, chargements
// et sauvegardes de ligues, rattrapages du monde. Tout en mémoire (remis à
// zéro au redémarrage ou par l'admin), coût négligeable. Lecture :
// GET /api/admin/metrics (X-Admin-Token), page /admin/metrics.
// =====================================================================

const SAMPLES = 200;            // derniers temps gardés par série (p95)
const series = new Map();       // nom → { n, total, max, errors, samples[] }
let since = Date.now();

function serie(name) {
  let s = series.get(name);
  if (!s) { s = { n: 0, total: 0, max: 0, errors: 0, samples: [] }; series.set(name, s); }
  return s;
}

// Une mesure de durée (ms) pour `name` ; `error` : réponse ≥ 500.
function record(name, ms, error = false) {
  const s = serie(name);
  s.n++; s.total += ms; if (ms > s.max) s.max = ms; if (error) s.errors++;
  if (s.samples.length >= SAMPLES) s.samples.shift();
  s.samples.push(ms);
}

// Chronomètre : `const stop = Metrics.start("x"); … stop();`
function start(name) {
  const t0 = process.hrtime.bigint();
  return (error = false) => record(name, Number(process.hrtime.bigint() - t0) / 1e6, error);
}

// Libellé de route stable : identifiants et codes remplacés.
function routeLabel(method, pathname) {
  let p = String(pathname || "/");
  if (p.startsWith("/assets/")) return "GET /assets/*";
  p = p.replace(/^\/(j|m)\/[^/]+/, "/$1/:code")
    .replace(/\/\d+(?=\/|$)/g, "/:n")
    .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, "/:id");
  return `${method} ${p}`;
}

function pct(arr, q) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * q))];
}

function snapshot() {
  const out = [];
  for (const [name, s] of series) {
    out.push({ name, count: s.n, avgMs: +(s.total / Math.max(1, s.n)).toFixed(1), p95Ms: +pct(s.samples, 0.95).toFixed(1), maxMs: +s.max.toFixed(1), errors: s.errors, totalMs: Math.round(s.total) });
  }
  out.sort((a, b) => b.totalMs - a.totalMs);
  const mem = process.memoryUsage();
  return { since, uptimeS: Math.round(process.uptime()), memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) }, series: out };
}

function reset() { series.clear(); since = Date.now(); }

// Page admin (le jeton est saisi dans la page, jamais dans l'URL).
function adminPageHtml() {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Mesures serveur · Hoop Manager</title>
<style>body{margin:0;background:#0d131d;color:#eef2f7;font:14px/1.45 -apple-system,Segoe UI,Arial,sans-serif;padding:16px}h1{font-size:20px;margin:0 0 12px}
input,button{font:inherit;padding:8px 10px;border-radius:8px;border:1px solid #26334a;background:#141c29;color:#eef2f7}button{background:#f0a23c;color:#2a1a04;font-weight:700;border:0;cursor:pointer}
.bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.wrap{overflow-x:auto}table{border-collapse:collapse;min-width:640px;width:100%}th,td{padding:6px 8px;border-bottom:1px solid #1e2939;text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}th{color:#9aa8bd;font-weight:600}.muted{color:#9aa8bd}.bad{color:#ff6b5e}</style></head><body>
<h1>Mesures serveur</h1>
<div class="bar"><input id="tok" type="password" placeholder="Jeton admin" autocomplete="off"><button id="go">Afficher</button><button id="rst">Remettre à zéro</button><label class="muted"><input id="auto" type="checkbox"> actualiser (10 s)</label></div>
<p id="info" class="muted"></p><div class="wrap"><table id="t"></table></div>
<script>
const $=id=>document.getElementById(id);let timer=null;
try{$("tok").value=sessionStorage.getItem("hm-admin-tok")||"";}catch(e){}
async function load(reset){const tok=$("tok").value.trim();try{sessionStorage.setItem("hm-admin-tok",tok);}catch(e){}
const r=await fetch("/api/admin/metrics"+(reset?"?reset=1":""),{method:reset?"POST":"GET",headers:{"X-Admin-Token":tok}});
if(!r.ok){$("info").textContent="Accès refusé ("+r.status+")";return;}const d=await r.json();
$("info").textContent="Depuis "+new Date(d.since).toLocaleString("fr-FR")+" · serveur lancé il y a "+Math.round(d.uptimeS/60)+" min · mémoire "+d.memoryMb.rss+" Mo (tas "+d.memoryMb.heapUsed+" Mo)";
$("t").innerHTML="<tr><th>Série</th><th>Nombre</th><th>Moyenne (ms)</th><th>p95 (ms)</th><th>Max (ms)</th><th>Erreurs</th><th>Temps total (s)</th></tr>"+d.series.map(s=>"<tr><td>"+s.name.replace(/</g,"&lt;")+"</td><td>"+s.count+"</td><td>"+s.avgMs+"</td><td>"+s.p95Ms+"</td><td>"+s.maxMs+"</td><td class='"+(s.errors?"bad":"")+"'>"+s.errors+"</td><td>"+(s.totalMs/1000).toFixed(1)+"</td></tr>").join("");}
$("go").onclick=()=>load(false);$("rst").onclick=()=>load(true);
$("auto").onchange=()=>{clearInterval(timer);if($("auto").checked)timer=setInterval(()=>load(false),10000);};
</script></body></html>`;
}

module.exports = { record, start, routeLabel, snapshot, reset, adminPageHtml };
