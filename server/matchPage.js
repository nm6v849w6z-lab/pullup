"use strict";

// =====================================================================
// PAGE PUBLIQUE D'UN MATCH PARTAGÉ (`/m/<code>`, voir server/matchLinks.js)
// : sans connexion, sans le script du jeu. En-tête avec le contexte du
// match (compétition, journée, date, équipes, score final une fois le match
// terminé), puis le terrain 2D du direct (assets/live/live-view.js +
// adapter.js, les mêmes modules que dans le jeu) alimenté par
// `/m/<code>/data` (JSON public, lecture seule) :
//  - match en cours : on suit le direct en temps réel (nouvelles actions
//    toutes les 10 s) ;
//  - match terminé : rediffusion depuis le coup d'envoi, avec curseur et
//    sauts de 30 s (même principe que « Revoir le direct » du jeu).
// Même thème, mêmes polices et même en-tête que la page publique d'un
// joueur (server/playerPage.js). Pas d'indexation (noindex).
// =====================================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const I18n = require("./i18n.js");
const { head, shell, esc, translator } = require("./playerPage.js");

// Version des modules du direct (cache des navigateurs) : empreinte des
// fichiers au démarrage du serveur.
const ASSET_V = (() => {
  try {
    const h = crypto.createHash("sha1");
    for (const f of ["live-view.js", "adapter.js", "court2d.js", "live.css"]) h.update(fs.readFileSync(path.join(__dirname, "..", "assets", "live", f)));
    return h.digest("hex").slice(0, 10);
  } catch (e) { return String(Date.now()); }
})();

const PAGE_CSS = `
  .mh{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:14px;text-align:center}
  .mh-kick{grid-column:1/-1;font:700 12px/1.3 "DM Sans",sans-serif;letter-spacing:.6px;text-transform:uppercase;color:var(--amber)}
  .mh-team{font:800 26px/1.1 "Barlow Condensed",sans-serif;overflow-wrap:anywhere}
  .mh-team i{display:block;width:34px;height:6px;border-radius:3px;margin:0 auto 8px}
  .mh-score{font:800 40px/1 "Barlow Condensed",sans-serif;white-space:nowrap}
  .mh-score small{display:block;font:700 12px/1.4 "DM Sans",sans-serif;letter-spacing:.6px;color:var(--ink-faint);text-transform:uppercase}
  .mh-reveal{font:700 13px/1 "DM Sans",sans-serif;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer;white-space:nowrap}
  .mh-badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#d6473f;color:#fff;font:800 13px/1 "DM Sans",sans-serif;letter-spacing:.6px}
  .mh-when{grid-column:1/-1;color:var(--ink-dim);font-size:14px}
  .ml-seek{display:flex;align-items:center;gap:10px;margin:16px 0 12px;padding:8px 12px;background:var(--panel);border:1px solid var(--line-soft);border-radius:12px}
  .ml-seek input[type=range]{flex:1;min-width:0;accent-color:var(--amber);margin:0}
  .ml-seek button{flex:none;font:700 13px/1 "DM Sans",sans-serif;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer}
  .ml-seek span{flex:none;font-size:13px;color:var(--ink-dim);min-width:72px;text-align:right;font-variant-numeric:tabular-nums}
  #mlLive{margin-top:16px;min-height:200px}
  .ml-msg{margin:16px 0 0;color:var(--ink-dim)}
  .ml-note{margin:14px 0 0;font-size:13px;color:var(--ink-faint)}
  @media (max-width:640px){.mh-team{font-size:20px}.mh-score{font-size:32px}.ml-seek{gap:6px;padding:8px}.ml-seek span{min-width:0}}
`;

function dateLabel(ms, lang) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString(lang === "fr" ? "fr-FR" : lang, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  } catch (e) { return new Date(ms).toISOString().slice(0, 16).replace("T", " "); }
}

// `resolved` : résultat de MatchLinks.resolveLink.
function renderMatchPage({ resolved, code, origin = "", lang = "fr" }) {
  lang = I18n.normLang(lang) || "fr";
  const { t, tf } = translator(lang);
  const { meta, status, teams, live } = resolved;
  const home = teams.A.name, away = teams.B.name;
  const fs0 = live.finalScore;
  const score = status === "replay" && fs0 ? `${fs0.home ?? fs0.A ?? "–"} – ${fs0.away ?? fs0.B ?? "–"}` : "";
  const comp = [t(meta.competition), meta.round ? tf("Journée {0}", meta.round.replace(/^\D+/, "")) : ""].filter(Boolean).join(" · ");
  const when = dateLabel(meta.kickoffAt, lang);
  const title = `${home} – ${away}`;
  const kind = status === "replay" ? t("Rediffusion") : status === "live" ? t("En direct") : t("À venir");
  const description = [comp, when, kind].filter(Boolean).join(" · ");
  // Rediffusion : score final masqué tant qu'on ne le demande pas (on peut
  // vouloir regarder le match sans connaître le résultat).
  const mid = score
    ? `<div class="mh-score"><button type="button" class="mh-reveal" id="mlReveal">${esc(t("Voir le score final"))}</button><span id="mlScore" hidden>${esc(score)}<small>${esc(t("Score final"))}</small></span></div>`
    : `<div class="mh-score">${status === "live" ? `<span class="mh-badge">${esc(t("En direct").toUpperCase())}</span>` : esc("–")}</div>`;
  const body = `<section class="card">
  <div class="mh">
    <div class="mh-kick">${esc(comp)}</div>
    <div class="mh-team"><i style="background:${esc(teams.A.color)}"></i>${esc(home)}</div>
    ${mid}
    <div class="mh-team"><i style="background:${esc(teams.B.color)}"></i>${esc(away)}</div>
    <div class="mh-when">${esc(when)}</div>
  </div>
  <div id="mlSeek" class="ml-seek" hidden>
    <button type="button" data-seek="0" aria-label="${esc(t("Revoir depuis le début"))}">⏮</button>
    <button type="button" data-seek="-30000" aria-label="${esc(t("Reculer de 30 secondes"))}">−30 s</button>
    <input type="range" min="0" max="1000" step="1000" aria-label="${esc(t("Moment du match"))}">
    <button type="button" data-seek="30000" aria-label="${esc(t("Avancer de 30 secondes"))}">+30 s</button>
    <span></span>
  </div>
  <div id="mlLive"></div>
  <p id="mlMsg" class="ml-msg">${esc(t("Chargement du match…"))}</p>
  <p class="ml-note">${esc(t("Lien de consultation : le match se regarde ici, rien ne peut y être modifié."))}</p>
</section>`;
  const strings = {
    upcoming: t("Le direct commence au coup d'envoi."), gone: t("Ce match n'est plus disponible") + ".",
    error: t("Le match n'a pas pu être chargé. Réessayez dans un instant."), replay: t("Rediffusion"), live: t("En direct"),
  };
  const script = `<script type="module">
import { createLiveView } from "/assets/live/live-view.js?v=${ASSET_V}";
import { createLiveAdapter } from "/assets/live/adapter.js?v=${ASSET_V}";
const CODE = ${JSON.stringify(code)}, S = ${JSON.stringify(strings)}, QL = 600, OL = 300;
const root = document.getElementById("mlLive"), msg = document.getElementById("mlMsg"), seek = document.getElementById("mlSeek");
const range = seek.querySelector("input"), posTxt = seek.querySelector("span");
const reveal = document.getElementById("mlReveal");
if (reveal) reveal.addEventListener("click", () => { reveal.remove(); document.getElementById("mlScore").hidden = false; });
let data = null, raw = null, cur = null, view = null, adapter = null, items = [], applied = 0, dragging = false;
const say = t => { msg.textContent = t || ""; msg.hidden = !t; };
async function load() {
  const r = await fetch("/m/" + encodeURIComponent(CODE) + "/data", { cache: "no-store" });
  if (r.status === 404) { const e = new Error("gone"); e.gone = true; throw e; }
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}
const shift = (live, delta) => ({ ...live, kickoffAt: live.kickoffAt + delta,
  events: (live.events || []).map(e => (typeof e.airAt === "number" ? { ...e, airAt: e.airAt + delta } : e)),
  pauses: (live.pauses || []).map(p => (typeof p.airAt === "number" ? { ...p, airAt: p.airAt + delta } : p)) });
const itemsOf = live => [...(live.events || []).map(ev => ({ at: ev.airAt, ev })), ...(live.pauses || []).filter(p => p.kind === "timeout").map(p => ({ at: p.airAt, pause: p }))].sort((a, b) => a.at - b.at);
function mount(live) {
  if (view) { try { view.destroy(); } catch (e) { /* rien */ } }
  root.innerHTML = "";
  cur = live;
  const m = data.meta || {};
  const dress = { meta: { competition: [data.status === "replay" ? S.replay : S.live, m.competition].filter(Boolean).join(" · "), round: m.round || "", venue: "" }, courtLogo: "", arenaSponsor: null, courtStyle: null, referees: [0, 1, 2].map(i => ({ id: "ref" + i, avatar: "" })) };
  adapter = createLiveAdapter({ live, teams: data.teams, mine: null, quarterLength: QL, overtimeLength: OL, dress, presenter: null });
  view = createLiveView(root, { quarterLength: QL, halftimeShowSeen: true, staging: null, court2d: true });
  items = itemsOf(live); applied = 0;
}
function sync() {
  if (!adapter) return;
  const now = Date.now();
  while (applied < items.length && items[applied].at <= now) {
    const it = items[applied++];
    try { if (it.ev) adapter.applyEvent(it.ev); else adapter.applyPause(it.pause); } catch (e) { /* événement inattendu */ }
  }
  if (data.status === "replay" && now >= cur.kickoffAt + (cur.totalDurationMs || 0)) adapter.finish();
  adapter.tick(now);
  try { view.update(adapter.buildState(now)); } catch (e) { /* le terrain ne casse jamais la page */ }
  if (data.status === "replay" && !dragging) { const p = Math.max(0, Math.min(total(), now - cur.kickoffAt)); range.value = String(p); posTxt.textContent = clockAt(p); }
}
const total = () => Math.max(1000, (raw && raw.totalDurationMs) || 0);
function clockAt(p) {
  const evs = cur.events || []; let last = null;
  for (const e of evs) { if (e.airAt - cur.kickoffAt <= p) last = e; else break; }
  if (!last) return "";
  const q = last.quarter > 4 ? "P" + (last.quarter - 4) : "Q" + last.quarter;
  return q + " " + (last.clock || "");
}
function playFrom(p) { mount(shift(raw, Date.now() + 1200 - raw.kickoffAt - Math.max(0, Math.min(total(), p)))); }
seek.querySelectorAll("[data-seek]").forEach(b => b.addEventListener("click", () => {
  const d = Number(b.dataset.seek), p = Date.now() - cur.kickoffAt;
  playFrom(d === 0 ? 0 : p + d);
}));
range.addEventListener("input", () => { dragging = true; posTxt.textContent = clockAt(Number(range.value)); });
range.addEventListener("change", () => { dragging = false; playFrom(Number(range.value)); });
async function refresh() {
  try {
    const d = await load();
    if (d.status === "replay" && data.status !== "replay") { location.reload(); return; }
    data = d; raw = d.live;
    const fresh = itemsOf(d.live);
    if (fresh.length > items.length) { cur = d.live; items = fresh; }
    if (d.status === "live") say("");
  } catch (e) { if (e.gone) say(S.gone); }
}
(async () => {
  try { data = await load(); } catch (e) { say(e.gone ? S.gone : S.error); return; }
  raw = data.live;
  if (data.status === "replay") {
    range.max = String(total()); seek.hidden = false;
    playFrom(0);
    say("");
  } else {
    mount(raw);
    say(data.status === "upcoming" ? S.upcoming : "");
    setInterval(refresh, 10000);
  }
  setInterval(sync, 250);
  sync();
})();
</script>`;
  const head0 = head({ lang, title: `${title} · Hoop Manager`, description, ogTitle: title, url: origin ? `${origin}/m/${code}` : "",
    image: `${origin || "https://hoop-manager.com"}/assets/mobile/icon-512.png`,
    extraCss: PAGE_CSS }).replace("</head>", `<link rel="stylesheet" href="/assets/live/live.css?v=${ASSET_V}">\n<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">\n</head>`);
  return head0 + "\n" + shell(lang, body + script, t);
}

function renderMatchNotFoundPage({ lang = "fr", origin = "" } = {}) {
  lang = I18n.normLang(lang) || "fr";
  const { t } = translator(lang);
  const title = t("Ce match n'est plus disponible");
  const description = t("Ce lien de match n'existe pas, ou la rediffusion a été remplacée par des matchs plus récents.");
  const body = `<section class="card nf"><h1>${esc(title)}</h1><p class="ml-msg">${esc(description)}</p>` +
    `<p><a class="btn" href="/bienvenue${lang === "fr" ? "" : `?lang=${lang}`}">${esc(t("Découvrir Hoop Manager"))}</a></p></section>`;
  return head({ lang, title: `${title} · Hoop Manager`, description, ogTitle: title, url: "", image: `${origin || "https://hoop-manager.com"}/assets/mobile/icon-512.png`,
    extraCss: PAGE_CSS + ".nf{max-width:620px;margin:40px auto}.nf h1{font-size:36px;margin-bottom:10px}.nf .btn{margin-top:14px}" }) + "\n" + shell(lang, body, t);
}

module.exports = { renderMatchPage, renderMatchNotFoundPage, ASSET_V };
