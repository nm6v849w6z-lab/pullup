"use strict";

// =====================================================================
// PAGE PUBLIQUE D'UN JOUEUR (`/j/<code>`, permaliens validés le
// 2026-10-01, voir server/playerLinks.js) : rendue ici, sans connexion ni
// script du jeu. Montre TOUT du joueur (le manager a choisi de le
// partager) : identité, club, note, potentiel (palier, jamais de chiffre,
// comme dans le jeu), caractéristiques en barres, stats de la saison et
// courbe de progression (note globale par défaut, ou une caractéristique
// au choix) tirée de Player.weeklyHistory (engine.js).
//
// Même thème sombre, mêmes polices et même en-tête que les pages publiques
// (server/site.js). Langue : celle des pages publiques (I18n.siteLang :
// ?lang=, cookie « hm-lang », Accept-Language, sinon français), textes
// traduits par le dictionnaire du jeu (assets/i18n/*.js). Aperçu riche
// (og:title « Nom · Poste, NN ans · Note XX · Club ») pour les partages.
// Pas d'indexation (noindex) : un lien partagé n'a rien à faire dans un
// moteur de recherche.
// =====================================================================

const Engine = require("../engine.js");
const I18n = require("./i18n.js");

const OG_LOCALES = { fr: "fr_FR", en: "en_GB", it: "it_IT", es: "es_ES", pt: "pt_BR", de: "de_DE", pl: "pl_PL", el: "el_GR", lt: "lt_LT", zh: "zh_CN" };

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Traduction : texte français du jeu → langue de la page ; `{0}`, `{1}`…
// remplacés APRÈS traduction (clé du dictionnaire telle quelle).
function translator(lang) {
  const t = s => I18n.translate(lang, s);
  const tf = (key, ...args) => t(key).replace(/\{(\d)\}/g, (m, i) => (args[i] != null ? String(args[i]) : m));
  return { t, tf };
}

// Ordre d'affichage des caractéristiques : le même que la fiche joueur du
// jeu (PDP_ATTR_ORDER, moteurbasket3.html).
const ATTR_GROUPS = [
  ["Fondamentaux", ["threePoint", "midRange", "freeThrow", "inside", "penetration", "shotCreation", "dribble",
    "pass", "defOutside", "steal", "defInside", "block", "rebound"]],
  ["Physique", ["speed", "acceleration", "agility", "vertical", "strength", "power", "endurance"]],
  ["Mental", ["decision", "vision", "anticipation", "focus", "composure", "determination", "discipline", "leadership"]],
];

function tierClass(v) {
  if (v <= 20) return "t-red";
  if (v <= 50) return "t-amber";
  if (v <= 80) return "t-white";
  return "t-green";
}

// Courbe de progression : MÊME fonction côté serveur (rendu initial, sans
// script) et dans le navigateur (changement de série, voir le <script>
// plus bas, qui en reçoit le code source). Volontairement en ES5 simple,
// sans dépendance. Copie équivalente dans le jeu : ppChartHtml
// (moteurbasket3.html).
function ppChartHtml(vals, weeks, emptyMsg) {
  var n = vals.length;
  if (n < 2) return '<p class="pp-empty">' + emptyMsg + "</p>";
  var loV = Math.min.apply(null, vals), hiV = Math.max.apply(null, vals);
  var lo = loV, hi = hiV;
  if (hi - lo < 4) { var mid = (hi + lo) / 2; lo = mid - 2; hi = mid + 2; }
  var pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  var x = function (i) { return (i / (n - 1)) * 100; };
  var y = function (v) { return (1 - (v - lo) / (hi - lo)) * 100; };
  var fmt = function (v) { return String(Math.round(v * 10) / 10); };
  var safe = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); };
  var pts = vals.map(function (v, i) { return x(i).toFixed(2) + "," + y(v).toFixed(2); });
  var d = Math.round((vals[n - 1] - vals[0]) * 10) / 10;
  var dots = vals.map(function (v, i) {
    return '<span class="pp-dot' + (i === n - 1 ? " pp-dot-last" : "") + '" style="left:' + x(i).toFixed(2) + "%;top:" + y(v).toFixed(2) + '%" title="' + safe(weeks[i]) + " : " + fmt(v) + '"></span>';
  }).join("");
  return '<div class="pp-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
    '<line x1="0" x2="100" y1="' + y(hiV).toFixed(2) + '" y2="' + y(hiV).toFixed(2) + '" class="pp-grid"></line>' +
    '<line x1="0" x2="100" y1="' + y(loV).toFixed(2) + '" y2="' + y(loV).toFixed(2) + '" class="pp-grid"></line>' +
    '<path d="M0,100 L' + pts.join(" L") + ' L100,100 Z" class="pp-area"></path>' +
    '<polyline points="' + pts.join(" ") + '" class="pp-line"></polyline></svg>' + dots +
    '<span class="pp-y" style="top:' + y(hiV).toFixed(2) + '%">' + fmt(hiV) + "</span>" +
    (hiV !== loV ? '<span class="pp-y" style="top:' + y(loV).toFixed(2) + '%">' + fmt(loV) + "</span>" : "") +
    "</div>" +
    '<div class="pp-x"><span>' + safe(weeks[0]) + '</span><b class="' + (d > 0 ? "pp-up" : d < 0 ? "pp-down" : "pp-flat") + '">' + (d > 0 ? "+" : "") + fmt(d) + "</b><span>" + safe(weeks[n - 1]) + "</span></div>";
}

// Styles de la courbe (aussi repris par le jeu, voir .pp2- dans
// moteurbasket3.html).
const CHART_CSS = `
  .pp-plot{position:relative;height:200px;margin:8px 34px 0 0}
  .pp-plot svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  .pp-grid{stroke:var(--line);stroke-width:1;stroke-dasharray:3 4;vector-effect:non-scaling-stroke}
  .pp-area{fill:rgba(240,162,60,.12)}
  .pp-line{fill:none;stroke:var(--amber);stroke-width:2.5;stroke-linejoin:round;vector-effect:non-scaling-stroke}
  .pp-dot{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:var(--bg);border:2px solid var(--amber)}
  .pp-dot-last{width:11px;height:11px;margin:-5.5px 0 0 -5.5px;background:var(--amber)}
  .pp-y{position:absolute;right:-34px;transform:translateY(-50%);font-size:12px;color:var(--ink-dim);font-variant-numeric:tabular-nums}
  .pp-x{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:10px 34px 0 0;font-size:12px;color:var(--ink-faint)}
  .pp-x b{font-size:14px}
  .pp-up{color:#3ecf67}.pp-down{color:#ff6b5e}
  .pp-empty{margin:12px 0 4px;color:var(--ink-dim);font-size:15px}
`;

function avg(log, k) {
  return log.length ? Math.round((log.reduce((s, m) => s + (Number(m[k]) || 0), 0) / log.length) * 10) / 10 : 0;
}

// Maillot aux couleurs du club, floqué du numéro (ou des initiales).
function jerseyBadge(team, player) {
  const colors = Engine.JERSEY_COLORS || {};
  const fill = colors[team.jerseyColor] || "#3b6fd6";
  const light = /^#(f|e)/i.test(fill);
  const label = Number.isInteger(player.number)
    ? String(player.number)
    : String(player.name || "?").split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return `<svg viewBox="0 0 40 44" width="88" height="96" aria-hidden="true"><path d="M11 2h5q4 6 8 0h5l2 7q3 2 6 3v30H3V12q3-1 6-3z" fill="${esc(fill)}" stroke="${light ? "#20242c" : "rgba(255,255,255,.55)"}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<text x="20" y="31" text-anchor="middle" font-size="${label.length > 1 ? 13 : 15}" font-weight="800" fill="${light ? "#20242c" : "#fff"}" font-family="Barlow Condensed,DM Sans,sans-serif">${esc(label)}</text></svg>`;
}

function head({ lang, title, description, ogTitle, url, image, extraCss = "" }) {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<meta property="og:site_name" content="Hoop Manager">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(description)}">
${url ? `<meta property="og:url" content="${esc(url)}">\n` : ""}<meta property="og:image" content="${esc(image)}">
<meta property="og:locale" content="${OG_LOCALES[lang] || "fr_FR"}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="theme-color" content="#0d131d">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/mobile/favicon-32.png?v=3">
<link rel="apple-touch-icon" href="/assets/mobile/apple-touch-icon.png?v=3">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root{--bg:#0d131d;--panel:#141c29;--line:#26334a;--line-soft:#1e2939;--ink:#eef2f7;--ink-dim:#9aa8bd;--ink-faint:#6b7a92;--amber:#f0a23c;--amber-hi:#ffb85a;--amber-ink:#2a1a04}
  *{box-sizing:border-box}
  html,body{margin:0}
  body{background:var(--bg);color:var(--ink);font-family:"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden}
  a{color:var(--amber)}
  .wrap{max-width:1040px;margin:0 auto;padding:0 16px}
  h1,h2,h3{font-family:"Barlow Condensed","DM Sans",sans-serif;letter-spacing:.2px;line-height:1.1;margin:0}
  header{border-bottom:1px solid var(--line-soft);background:rgba(13,19,29,.9)}
  header .wrap{display:flex;align-items:center;gap:12px;min-height:60px}
  .brand{margin-right:auto;display:flex;align-items:center}
  .brand img{height:32px;width:auto;display:block}
  .btn{display:inline-flex;align-items:center;justify-content:center;border-radius:10px;font:700 15px/1 "DM Sans",sans-serif;padding:11px 15px;text-decoration:none;background:var(--amber);color:var(--amber-ink);white-space:nowrap}
  .btn:hover{background:var(--amber-hi);color:var(--amber-ink)}
  main{padding:24px 0 48px}
  .card{background:var(--panel);border:1px solid var(--line-soft);border-radius:16px;padding:18px 20px;min-width:0}
  .card h2{font-size:22px;margin:0 0 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
  .card h2 small{font:500 13px/1.2 "DM Sans",sans-serif;color:var(--ink-faint)}
  footer{border-top:1px solid var(--line-soft);padding:22px 0 36px;color:var(--ink-faint);font-size:14px}
  footer a{color:var(--ink-dim)}
  ${CHART_CSS}
  ${extraCss}
</style>
</head>`;
}

function shell(lang, body, t) {
  return `<body>
<header><div class="wrap">
  <a class="brand" href="/bienvenue" aria-label="Hoop Manager"><img src="/assets/brand/logo-hoop-manager.png" alt="Hoop Manager"></a>
  <a class="btn" href="/bienvenue${lang === "fr" ? "" : `?lang=${lang}`}">${esc(t("Jouer gratuitement"))}</a>
</div></header>
<main><div class="wrap">${body}</div></main>
<footer><div class="wrap">© ${new Date().getFullYear()} Hoop Manager · <a href="/le-jeu${lang === "fr" ? "" : `?lang=${lang}`}">${esc(t("Découvrir Hoop Manager"))}</a></div></footer>
</body>
</html>`;
}

const PAGE_CSS = `
  .hero{display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center}
  .hero-badge{display:flex;align-items:center;justify-content:center;width:104px;height:104px;border-radius:20px;background:var(--bg);border:1px solid var(--line)}
  .hero-pos{display:inline-block;font:700 12px/1 "DM Sans",sans-serif;letter-spacing:.6px;text-transform:uppercase;color:var(--amber);margin-bottom:6px}
  .hero h1{font-size:40px;overflow-wrap:anywhere}
  .hero-club{margin:4px 0 10px;color:var(--ink-dim);font-weight:500}
  .chips{display:flex;flex-wrap:wrap;gap:6px}
  .chip{font-size:13px;color:var(--ink-dim);border:1px solid var(--line);border-radius:999px;padding:4px 10px;white-space:nowrap}
  .chip b{color:var(--ink)}
  .ring{position:relative;width:112px;height:112px}
  .ring svg{display:block}
  .ring-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .ring-c b{font:800 38px/1 "Barlow Condensed",sans-serif}
  .ring-c span{font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--ink-faint)}
  .pot{margin-top:8px;text-align:center;font-size:13px;color:var(--ink-dim)}
  .pot b{display:block;color:var(--amber);font-size:15px}
  .grid2{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;margin-top:16px}
  .stack{display:flex;flex-direction:column;gap:16px;min-width:0}
  .attr-groups{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 22px}
  .attr-group h3{font-size:16px;color:var(--ink-dim);margin:10px 0 6px;display:flex;justify-content:space-between}
  .attr-group h3 span{font:500 12px/1.4 "DM Sans",sans-serif;color:var(--ink-faint)}
  .attr-group.wide{grid-column:1/-1}
  .attr-group.wide .attr-list{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 22px}
  .attr{display:grid;grid-template-columns:minmax(0,1fr) 72px 26px;align-items:center;gap:10px;padding:4px 0;font-size:14px}
  .attr-l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink-dim)}
  .attr-t{height:6px;border-radius:3px;background:var(--line-soft);overflow:hidden}
  .attr-t i{display:block;height:100%;border-radius:3px}
  .attr-v{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
  .t-red i{background:#ff3b30}.t-red .attr-v{color:#ff6b5e}
  .t-amber i{background:#ff9500}.t-amber .attr-v{color:#ffad42}
  .t-white i{background:#eef2f7}
  .t-green i{background:#3ecf67}.t-green .attr-v{color:#3ecf67}
  .tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  .tile{background:var(--bg);border:1px solid var(--line-soft);border-radius:12px;padding:10px 8px;text-align:center}
  .tile b{display:block;font:800 26px/1 "Barlow Condensed",sans-serif}
  .tile span{font-size:12px;color:var(--ink-faint)}
  .foot{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:13px;color:var(--ink-dim)}
  .foot b{color:var(--ink)}
  .muted{color:var(--ink-dim);margin:0}
  .pp-sel{font:500 14px/1.2 "DM Sans",sans-serif;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px 10px;max-width:100%}
  .cta{margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .cta p{margin:0;font-weight:500}
  .note{margin:14px 0 0;font-size:13px;color:var(--ink-faint)}
  @media (max-width:860px){.grid2{grid-template-columns:minmax(0,1fr)}.grid2 .stack{order:-1}}
  @media (max-width:640px){
    .hero{grid-template-columns:auto 1fr;gap:14px}
    .hero-badge{width:76px;height:76px;border-radius:16px}
    .hero-badge svg{width:62px;height:68px}
    .hero h1{font-size:30px}
    .hero-rating{grid-column:1/-1;display:flex;align-items:center;gap:16px;justify-content:flex-start}
    .pot{text-align:left;margin:0}
    .attr-groups,.attr-group.wide .attr-list{grid-template-columns:minmax(0,1fr)}
    .tiles{grid-template-columns:repeat(2,minmax(0,1fr))}
    .card{padding:16px}
  }
`;

// `data` : { player, team, league, divisionLabel, origin, code, lang }.
function renderPlayerPage({ player, team, league, divisionLabel = "", origin = "", code = "", lang = "fr" }) {
  lang = I18n.normLang(lang) || "fr";
  const { t, tf } = translator(lang);
  const overall = Math.round(player.overall());
  const pos = t(player.position);
  const ogTitle = tf("{0} · {1}, {2} ans · Note {3} · {4}", player.name, pos, player.age, overall, team.name);
  const description = tf("Fiche de {0} sur Hoop Manager : caractéristiques, potentiel et progression semaine après semaine.", player.name);
  const labels = Engine.TRAINING_LABELS || {};
  const nation = Engine.nationName ? Engine.nationName(player.nationality) : "";

  // -- En-tête --
  const circ = 2 * Math.PI * 48;
  const dash = (Math.max(0, Math.min(100, overall)) / 100) * circ;
  const ringColor = { "t-red": "#ff3b30", "t-amber": "#ff9500", "t-white": "#eef2f7", "t-green": "#3ecf67" }[tierClass(overall)];
  const tier = Engine.potentialTierLabel(player.potential);
  const tierIdx = Engine.potentialTierIndex(player.potential);
  let html = `<section class="card hero">` +
    `<div class="hero-badge">${jerseyBadge(team, player)}</div>` +
    `<div class="hero-id"><span class="hero-pos">${esc(pos)}</span><h1>${esc(player.name)}</h1>` +
    `<p class="hero-club">${esc(team.name)}${divisionLabel ? ` · ${esc(t(divisionLabel))}` : ""}</p>` +
    `<div class="chips">` +
    (nation ? `<span class="chip">${esc(t(nation))}</span>` : "") +
    `<span class="chip">${esc(tf("{0} ans", player.age))}</span>` +
    `<span class="chip">${esc(player.height)} cm</span>` +
    (Number.isInteger(player.number) ? `<span class="chip">n° <b>${player.number}</b></span>` : "") +
    `</div></div>` +
    `<div class="hero-rating"><div class="ring" title="${esc(t("Note globale"))}"><svg width="112" height="112" viewBox="0 0 116 116" aria-hidden="true">` +
    `<circle cx="58" cy="58" r="48" fill="none" stroke="#26334a" stroke-width="9"></circle>` +
    `<circle cx="58" cy="58" r="48" fill="none" stroke="${ringColor}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 58 58)"></circle></svg>` +
    `<div class="ring-c"><b class="pp-overall">${overall}</b><span>${esc(t("Note"))}</span></div></div>` +
    `<div class="pot" data-potential>${esc(t("Potentiel"))}<b>${esc(t(tier))}</b>${esc(tf("Palier {0}/10", tierIdx))}</div></div>` +
    `</section>`;

  // -- Caractéristiques --
  const attrRow = a => {
    const v = Math.round(Number(player.attrs[a]) || 0);
    return `<div class="attr ${tierClass(v)}" data-attr="${a}"><span class="attr-l">${esc(t(labels[a] || a))}</span>` +
      `<span class="attr-t"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span><span class="attr-v">${v}</span></div>`;
  };
  const groups = ATTR_GROUPS.map(([title, keys], gi) => {
    const list = keys.filter(k => typeof player.attrs[k] === "number");
    const mean = list.length ? (list.reduce((s, k) => s + player.attrs[k], 0) / list.length).toFixed(1) : "–";
    return `<div class="attr-group${gi === 0 ? " wide" : ""}"><h3>${esc(t(title))}<span>${esc(tf("moy. {0}", mean))}</span></h3>` +
      `<div class="attr-list">${list.map(attrRow).join("")}</div></div>`;
  }).join("");
  const attrsCard = `<section class="card"><h2>${esc(t("Caractéristiques"))}</h2><div class="attr-groups">${groups}</div></section>`;

  // -- Saison --
  const log = Array.isArray(player.matchLog) ? player.matchLog : [];
  let seasonCard = `<section class="card"><h2>${esc(t("Saison"))}${log.length ? `<small>${esc(log.length > 1 ? tf("{0} matchs", log.length) : tf("{0} match", log.length))}</small>` : ""}</h2>`;
  if (log.length) {
    seasonCard += `<div class="tiles">` +
      [["pts", "Points"], ["reb", "Rebonds"], ["ast", "Passes déc."], ["stl", "Interceptions"]]
        .map(([k, l]) => `<div class="tile"><b>${avg(log, k)}</b><span>${esc(t(l))}</span></div>`).join("") + `</div>` +
      `<div class="foot">` + [["blk", "Contres"], ["tov", "Pertes"], ["pf", "Fautes"], ["min", "Minutes"]]
        .map(([k, l]) => `<span>${esc(t(l))} <b>${avg(log, k)}</b></span>`).join("") + `</div>`;
  } else {
    seasonCard += `<p class="muted">${esc(t("Aucun match joué cette saison pour l'instant."))}</p>`;
  }
  seasonCard += `</section>`;

  // -- Progression --
  const hist = Engine.playerHistoryEntries(player);
  const weeks = hist.map(h => tf("S{0} · sem. {1}", h.season, h.week));
  const series = { overall: hist.map(h => h.overall) };
  Engine.ATTRS.forEach(a => { series[a] = hist.map(h => (typeof h.attrs[a] === "number" ? h.attrs[a] : null)); });
  const emptyMsg = t("La progression s'affichera au fil des semaines");
  const options = [`<option value="overall">${esc(t("Note globale"))}</option>`]
    .concat(ATTR_GROUPS.map(([title, keys]) => `<optgroup label="${esc(t(title))}">` +
      keys.map(k => `<option value="${k}">${esc(t(labels[k] || k))}</option>`).join("") + `</optgroup>`)).join("");
  // Courbe de progression : réservée aux clubs Premium, comme dans le jeu
  // (retour utilisateur 2026-10-01).
  const premium = typeof team.hasActivePremium === "function" ? team.hasActivePremium(Date.now()) : !!team.isPaying;
  let progressCard = !premium
    ? `<section class="card" id="progress"><h2>${esc(t("Progression"))}</h2><p class="muted">${esc(t("La courbe de progression est réservée aux clubs Premium."))}</p></section>`
    : `<section class="card" id="progress"><h2>${esc(t("Progression"))}` +
    (hist.length >= 2 ? `<select class="pp-sel" id="ppSel" aria-label="${esc(t("Courbe affichée"))}">${options}</select>` : "") + `</h2>` +
    `<div id="ppChart">${ppChartHtml(series.overall, weeks, esc(emptyMsg))}</div></section>`;
  const dataJson = JSON.stringify({ weeks, series }).replace(/</g, "\\u003c");
  const script = premium && hist.length >= 2
    ? `<script>(function(){var D=${dataJson};var E=${JSON.stringify(esc(emptyMsg))};${ppChartHtml.toString()}
var s=document.getElementById("ppSel"),c=document.getElementById("ppChart");if(!s||!c)return;
s.addEventListener("change",function(){var v=D.series[s.value]||[];var w=[],y=[];v.forEach(function(x,i){if(typeof x==="number"){y.push(x);w.push(D.weeks[i]);}});c.innerHTML=ppChartHtml(y,w,E);});})();</script>`
    : "";

  const cta = `<section class="card cta"><p>${esc(tf("Fiche partagée par le manager de {0} sur Hoop Manager, le jeu de gestion de basket en ligne.", team.name))}</p>` +
    `<a class="btn" href="/bienvenue${lang === "fr" ? "" : `?lang=${lang}`}">${esc(t("Jouer gratuitement"))}</a></section>`;

  html += `<div class="grid2">${attrsCard}<div class="stack">${progressCard}${seasonCard}</div></div>${cta}`;

  const url = origin && code ? `${origin}/j/${code}` : "";
  const image = `${origin || "https://hoop-manager.com"}/assets/mobile/icon-512.png`;
  return head({ lang, title: `${player.name} · Hoop Manager`, description, ogTitle, url, image, extraCss: PAGE_CSS }) +
    "\n" + shell(lang, html, t).replace("</body>", `${script}\n</body>`);
}

function renderNotFoundPage({ lang = "fr", origin = "" } = {}) {
  lang = I18n.normLang(lang) || "fr";
  const { t } = translator(lang);
  const title = t("Lien expiré ou introuvable");
  const description = t("Ce lien de joueur n'existe pas ou n'est plus actif : le manager l'a coupé, ou le joueur a quitté son club.");
  const body = `<section class="card nf"><h1>${esc(title)}</h1><p class="muted">${esc(description)}</p>` +
    `<p><a class="btn" href="/bienvenue${lang === "fr" ? "" : `?lang=${lang}`}">${esc(t("Découvrir Hoop Manager"))}</a></p></section>`;
  return head({ lang, title: `${title} · Hoop Manager`, description, ogTitle: title, url: "", image: `${origin || "https://hoop-manager.com"}/assets/mobile/icon-512.png`,
    extraCss: ".nf{max-width:620px;margin:40px auto}.nf h1{font-size:36px;margin-bottom:10px}.nf .btn{margin-top:14px}" }) + "\n" + shell(lang, body, t);
}

module.exports = { renderPlayerPage, renderNotFoundPage, ppChartHtml, CHART_CSS, ATTR_GROUPS };
