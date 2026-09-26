// =====================================================================
// Hoop Manager · Vue « Match en direct »
//
//   import { createLiveView } from "./live/live-view.js";
//   const view = createLiveView(document.getElementById("live"), options);
//   view.update(state);   // à chaque tick du moteur / message du serveur
//
// La vue ne calcule rien du match : elle affiche l'état qu'on lui donne
// (contrat décrit dans README.md). Elle garde seulement l'état d'interface
// (filtres, position du fil, animations) entre deux appels à update().
//
// Habillage (2026-09-26, retour utilisateur : « améliore la page live pour
// qu'elle colle plus à l'esprit du jeu ») : même langage que le bandeau
// « Prochain match » du tableau de bord (fond scindé, cercle de terrain,
// liserés aux couleurs des clubs, écussons, titres en capitales) et que la
// fiche joueur (avatars, pastilles de poste ambre, tuiles de stats).
// =====================================================================
import { fmtClock, quarterName, pct, rating, esc, de } from "./format.js";

const BALL = `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#d97b35" stroke="#2b1a0e" stroke-width="1.4"/><path d="M12 1.5v21M1.5 12h21M5 4.5c3.5 3.2 3.5 11.8 0 15M19 4.5c-3.5 3.2-3.5 11.8 0 15" fill="none" stroke="#2b1a0e" stroke-width="1.3"/></svg>`;

const TEMPLATE = `
<div class="toast" data-ref="toast" role="status" aria-live="polite"></div>

<header class="board">
  <div class="board-split" aria-hidden="true"></div>
  <svg class="board-court" width="600" height="300" viewBox="0 0 600 300" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="300" cy="150" r="90"/><circle cx="300" cy="150" r="30"/><line x1="300" y1="0" x2="300" y2="300"/></svg>
  <div class="board-kicker">
    <span class="comp"><span class="live-dot" data-ref="liveDot"></span><span data-ref="kicker">En direct</span></span>
    <span data-ref="venue"></span>
  </div>
  <div class="board-top">
    ${[0, 1].map(t => `
    <div class="team ${t ? "away" : "home"}" style="order:${t ? 5 : 1}">
      <div class="crest" data-ref="crest${t}"></div>
      <div class="tinfo">
        <div class="tname" data-ref="name${t}"></div><div class="tshort" data-ref="short${t}"></div>
        <div class="tmeta"><span data-ref="fouls${t}"></span><span class="dots" data-ref="tos${t}" title="Temps morts restants"></span></div>
      </div>
    </div>
    <div class="score-wrap" style="order:${t ? 4 : 2}">
      <div class="score" data-ref="score${t}">0</div>
      <div class="poss" data-ref="poss${t}" title="Possession">${BALL}</div>
    </div>`).join("")}
    <div class="center" style="order:3">
      <div class="clock" data-ref="clock">10:00</div>
      <div class="period" data-ref="period"></div>
    </div>
  </div>
  <div class="board-bottom">
    <table class="qt" data-ref="qt" aria-label="Score par quart-temps"></table>
    <div class="tracker">
      <div class="tracker-head">
        <span class="klbl">Écart au score</span>
        <span class="run" data-ref="run"></span>
      </div>
      <svg data-ref="lead" viewBox="0 0 600 64" preserveAspectRatio="none" aria-label="Évolution de l'écart au score"></svg>
      <div class="tracker-axis"><span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span></div>
    </div>
  </div>
</header>

<section class="half" data-ref="half" aria-live="polite">
  <div class="half-ball">${BALL}</div>
  <div><h2>Mi-temps</h2><p data-ref="halfTxt"></p></div>
  <button class="cta" type="button" data-ref="showBtn">
    <span class="play"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="#F5A13A"/></svg></span>
    <span class="lbl">Voir l'émission<small>Résumé et chiffres clés</small></span>
  </button>
</section>
<dialog data-ref="dlg" aria-labelledby="hm-dlg-title">
  <h3 id="hm-dlg-title">L'émission de la mi-temps</h3>
  <p class="sub" data-ref="dlgScore"></p>
  <ul class="facts" data-ref="dlgFacts"></ul>
  <form method="dialog" style="text-align:right"><button class="ghost">Retour au match</button></form>
</dialog>

<section class="leaders" data-ref="leaders" aria-label="Meilleurs joueurs du match"></section>

<div class="grid">
  <section class="panel">
    <div class="phead">
      <h2>Carte des tirs</h2>
      <div class="filters">
        <div class="seg" data-seg="team"><button data-v="all" aria-pressed="true">Les deux</button><button data-v="0" data-ref="fT0"></button><button data-v="1" data-ref="fT1"></button></div>
        <div class="seg" data-seg="q"><button data-v="all" aria-pressed="true">Match</button><button data-v="1">Q1</button><button data-v="2">Q2</button><button data-v="3">Q3</button><button data-v="4">Q4</button></div>
        <div class="seg" data-seg="res"><button data-v="all" aria-pressed="true">Tous</button><button data-v="made">Réussis</button><button data-v="miss">Manqués</button></div>
      </div>
    </div>
    <svg class="court" data-ref="court" viewBox="0 0 940 500" role="img" aria-label="Terrain avec les tirs"></svg>
    <div class="legend">
      <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="#93A1B8"/></svg>Réussi</span>
      <span><svg width="14" height="14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="#93A1B8" stroke-width="2.5" stroke-linecap="round"/></svg>Manqué</span>
      <span data-ref="sides"></span>
    </div>
    <div class="zones" data-ref="zones"></div>
  </section>

  <section class="panel">
    <div class="phead">
      <h2>Fil du match</h2>
      <div class="seg" data-seg="feed"><button data-v="all" aria-pressed="true">Tout</button><button data-v="score">Paniers</button><button data-v="foul">Fautes et pertes</button></div>
    </div>
    <div class="feedbox">
      <button class="newpill" type="button" data-ref="newpill"></button>
      <ol class="feed" data-ref="feed" aria-live="polite"></ol>
    </div>
  </section>
</div>

<section class="panel section">
  <div class="phead"><h2>Face à face</h2><span class="cmp-legend" data-ref="cmpLegend"></span></div>
  <div class="cmp" data-ref="cmp"></div>
</section>

<section class="panel section">
  <div class="phead">
    <h2>Feuille de match</h2>
    <div class="seg" data-seg="box"><button data-v="0" aria-pressed="true" data-ref="fB0"></button><button data-v="1" data-ref="fB1"></button></div>
  </div>
  <table class="box" data-ref="box"></table>
  <div class="dnp" data-ref="dnp"></div>
</section>
`;

// Pastilles du fil : texte court plutôt qu'un pictogramme (même esprit que
// les badges du reste du jeu). Les paniers affichent les points marqués.
const CHIP = { miss: "Raté", foul: "Faute", turnover: "Perte", timeout: "Temps mort", sub: "Chgt", injury: "Blessure", info: "·" };
const ZONES = [["paint", "Raquette"], ["mid", "Mi-distance"], ["three", "3 points"]];
const DEFAULT_COLORS = ["#F26B1D", "#3B8FE0"];
const COLOR = t => `var(--c${t})`;

// Couleur de club lisible sur le fond sombre : un maillot noir ou bleu
// foncé est éclairci (le liseré du bandeau garde, lui, la vraie couleur).
function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(rgb) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}
function readable(hex) {
  const rgb = hexRgb(hex);
  if (!rgb) return null;
  const L = luminance(rgb);
  if (L >= 0.16) return hex;
  const k = L < 0.03 ? 0.6 : 0.38;
  const mix = rgb.map(c => Math.round(c + (255 - c) * k));
  return "#" + mix.map(c => c.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {HTMLElement} root  conteneur vide
 * @param {object} [opts]
 * @param {number} [opts.quarterLength=600]  durée d'un quart-temps en secondes
 * @param {number} [opts.bonusAt=5]          fautes d'équipe à partir desquelles on affiche « bonus »
 * @param {number} [opts.foulOutAt=5]        fautes personnelles d'exclusion
 * @param {(state)=>void} [opts.onShowHalftime]  clic sur « Voir l'émission ».
 *        Par défaut, ouvre un récapitulatif intégré.
 */
export function createLiveView(root, opts = {}) {
  const QLEN = opts.quarterLength ?? 600;
  const BONUS = opts.bonusAt ?? 5;
  const FOUL_OUT = opts.foulOutAt ?? 5;

  root.classList.add("hm-live");
  root.innerHTML = TEMPLATE;
  const $ = r => root.querySelector(`[data-ref="${r}"]`);

  const ui = { team: "all", q: "all", res: "all", feed: "all", box: null };
  let S = null;                 // dernier état reçu
  let seenEvents = null;        // Set des id d'événements déjà affichés
  let seenShots = null;
  let lastScore = null;
  let pending = 0, toastTimer = 0;
  let logoKey = ["", ""], courtLogoKey = null;

  // ---------- interactions ----------
  root.querySelectorAll("[data-seg]").forEach(seg => {
    seg.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
      ui[seg.dataset.seg] = b.dataset.v;
      if (S) render(new Set(), new Set());
    });
  });
  const feed = $("feed");
  const edges = () => {
    feed.classList.toggle("scrolled", feed.scrollTop > 4);
    feed.classList.toggle("end", feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 4);
  };
  feed.addEventListener("scroll", () => {
    edges();
    if (feed.scrollTop <= 4) { pending = 0; $("newpill").classList.remove("show"); }
  }, { passive: true });
  $("newpill").addEventListener("click", () => { feed.scrollTop = 0; });
  $("showBtn").addEventListener("click", () => (opts.onShowHalftime ? opts.onShowHalftime(S) : openRecap()));

  // ---------- API ----------
  function update(state) {
    S = state;
    const first = seenEvents === null;
    if (ui.box === null) {
      // Feuille de match : mon équipe d'abord (si l'adaptateur le précise).
      const mine = S.teams.findIndex(t => t.mine);
      ui.box = String(mine >= 0 ? mine : 0);
      $("box").closest("section").querySelectorAll("[data-seg=box] button")
        .forEach(b => b.setAttribute("aria-pressed", b.dataset.v === ui.box));
    }
    const newEv = new Set(), newShots = new Set();
    if (!first) {
      for (const e of S.events) if (!seenEvents.has(e.id)) newEv.add(e.id);
      for (const s of S.shots) if (!seenShots.has(s.id)) newShots.add(s.id);
    }
    render(newEv, newShots);
    if (!first) {
      S.events.filter(e => newEv.has(e.id) && (e.type === "timeout" || e.type === "period" || e.highlight))
        .slice(-1).forEach(e => toast(e.toast || e.text));
      [0, 1].forEach(t => { if (lastScore && S.teams[t].score > lastScore[t]) bump(t); });
    }
    seenEvents = new Set(S.events.map(e => e.id));
    seenShots = new Set(S.shots.map(s => s.id));
    lastScore = S.teams.map(t => t.score);
  }

  function destroy() { clearTimeout(toastTimer); root.innerHTML = ""; root.classList.remove("hm-live"); }

  // ---------- rendu ----------
  function render(newEv, newShots) {
    applyColors();
    renderBoard(); renderHalf(); renderLeaders(); renderCourt(newShots); renderFeed(newEv); renderCompare(); renderBox();
  }

  function applyColors() {
    let c = S.teams.map((T, t) => T.color || DEFAULT_COLORS[t]);
    const ink = c.map((x, t) => readable(x) || DEFAULT_COLORS[t]);
    root.style.setProperty("--stripe0", c[0]);
    root.style.setProperty("--stripe1", c[1]);
    root.style.setProperty("--c0", ink[0]);
    root.style.setProperty("--c1", ink[1]);
  }

  const elapsed = (q, clock) => (q - 1) * QLEN + (QLEN - clock);
  const scoring = () => S.events.filter(e => e.score).sort((a, b) => elapsed(a.quarter, a.clock) - elapsed(b.quarter, b.clock) || a.id - b.id);

  function currentRun() {
    const sc = scoring(); let team = null, pts = 0;
    for (let i = sc.length - 1; i >= 0; i--) {
      const prev = i ? sc[i - 1].score : [0, 0], cur = sc[i].score;
      const t = cur[0] > prev[0] ? 0 : cur[1] > prev[1] ? 1 : null;
      if (t === null) continue;
      if (team === null) team = t;
      if (t !== team) break;
      pts += cur[t] - prev[t];
    }
    return { team, pts };
  }

  function renderBoard() {
    const [A, B] = S.teams;
    const M = S.meta || {};
    const done = S.status === "final";
    $("liveDot").classList.toggle("done", done);
    $("kicker").textContent = [done ? "Match terminé" : "En direct", M.competition, M.round].filter(Boolean).join(" · ");
    $("venue").textContent = M.venue || "";
    [0, 1].forEach(t => {
      const T = S.teams[t];
      const key = T.logo ? T.logo.length + ":" + T.logo.slice(-40) : "short:" + T.short;
      if (logoKey[t] !== key) {
        logoKey[t] = key;
        // T.logo : HTML déjà produit par le jeu (écusson du club), jamais
        // du texte saisi tel quel ; sinon, écusson générique aux initiales.
        $("crest" + t).innerHTML = T.logo || `<span class="crest-txt">${esc(T.short)}</span>`;
        $("crest" + t).classList.toggle("has-logo", !!T.logo);
      }
      $("name" + t).textContent = T.name;
      $("short" + t).textContent = T.short;
      $("name" + t).classList.toggle("mine", !!T.mine);
      $("score" + t).textContent = T.score;
      $("score" + t).classList.toggle("trail", S.teams[1 - t].score > T.score);
      $("fouls" + t).innerHTML = T.teamFouls >= BONUS ? `<span class="bonus">Fautes ${T.teamFouls} · bonus</span>` : `Fautes ${T.teamFouls}`;
      const tot = T.timeoutsTotal ?? 0;
      $("tos" + t).innerHTML = Array.from({ length: tot }, (_, i) => `<i class="${i < T.timeoutsLeft ? "" : "used"}"></i>`).join("");
      $("poss" + t).classList.toggle("on", S.status === "live" && S.possession === t);
      $("fT" + t).textContent = T.short; $("fB" + t).textContent = T.name;
    });
    $("sides").innerHTML = `<b style="color:var(--c0)">${esc(A.short)}</b> attaque à droite, <b style="color:var(--c1)">${esc(B.short)}</b> à gauche`;
    $("clock").textContent = done ? "Final" : fmtClock(S.clock);
    $("clock").classList.toggle("final", done);
    const diff = A.score - B.score;
    $("period").textContent = done ? (diff ? `Victoire ${de(S.teams[diff > 0 ? 0 : 1].name)}` : "Égalité") : S.status === "halftime" ? "Mi-temps" : S.quarter > 4 ? `Prolongation ${S.quarter - 4}` : quarterName(S.quarter);

    const nq = Math.max(4, A.quarterScores.length);
    let q = `<tr><th></th>${Array.from({ length: nq }, (_, i) => `<th>${i < 4 ? "Q" + (i + 1) : "P" + (i - 3)}</th>`).join("")}<th>Total</th></tr>`;
    [A, B].forEach((T, t) => {
      q += `<tr><td><span class="qdot" style="background:${COLOR(t)}"></span>${esc(T.short)}</td>${Array.from({ length: nq }, (_, i) => {
        const v = T.quarterScores[i];
        const o = S.teams[1 - t].quarterScores[i];
        const cur = S.status === "live" && i === S.quarter - 1;
        const notStarted = v == null || (S.status === "halftime" && i === S.quarter - 1 && !v);
        const won = !notStarted && !cur && o != null && v > o;
        return `<td class="${cur ? "cur" : ""}${won ? " won" : ""}">${notStarted ? "–" : v}</td>`;
      }).join("")}<td class="tot">${T.score}</td></tr>`;
    });
    $("qt").innerHTML = q;

    const run = currentRun(), d = A.score - B.score;
    const runEl = $("run");
    if (S.status !== "final" && run.team !== null && run.pts >= 5) {
      runEl.innerHTML = `Série <b>${run.pts}-0</b> pour ${esc(S.teams[run.team].short)}`;
      runEl.className = "run hot";
      runEl.style.setProperty("--rc", COLOR(run.team));
    } else {
      runEl.innerHTML = d ? `${esc(S.teams[d > 0 ? 0 : 1].short)} ${S.status === "final" ? "l'emporte de" : "mène de"} <b>${Math.abs(d)}</b>` : "Égalité";
      runEl.className = "run";
    }

    // courbe d'écart (dérivée des événements qui portent un score)
    const W = 600, H = 64, Mid = H / 2, total = Math.max(4, S.quarter) * QLEN;
    const pts = [{ t: 0, d: 0 }, ...scoring().map(e => ({ t: elapsed(e.quarter, e.clock), d: e.score[0] - e.score[1] }))];
    const now = S.status === "final" ? total : Math.min(total, elapsed(S.quarter, S.clock));
    const mx = Math.max(8, ...pts.map(p => Math.abs(p.d))), k = (Mid - 4) / mx;
    let path = `M0 ${Mid}`;
    pts.forEach((p, i) => { const x = Math.min(W, (p.t / total) * W); if (i) path += ` H${x}`; path += ` V${Mid - p.d * k}`; });
    path += ` H${(now / total) * W} V${Mid} Z`;
    const nQ = total / QLEN;
    $("lead").innerHTML = `<defs><clipPath id="hm-up"><rect width="${W}" height="${Mid}"/></clipPath><clipPath id="hm-dn"><rect y="${Mid}" width="${W}" height="${Mid}"/></clipPath></defs>
      ${Array.from({ length: nQ - 1 }, (_, i) => `<line x1="${((i + 1) * W) / nQ}" y1="0" x2="${((i + 1) * W) / nQ}" y2="${H}" stroke="var(--line)" stroke-dasharray="3 3"/>`).join("")}
      <line x1="0" y1="${Mid}" x2="${W}" y2="${Mid}" stroke="var(--line)"/>
      <path d="${path}" fill="var(--c0)" opacity=".8" clip-path="url(#hm-up)"/>
      <path d="${path}" fill="var(--c1)" opacity=".8" clip-path="url(#hm-dn)"/>
      ${S.status === "live" ? `<line x1="${(now / total) * W}" y1="0" x2="${(now / total) * W}" y2="${H}" stroke="var(--accent)" stroke-width="1.5" opacity=".7"/>` : ""}`;
  }

  function renderHalf() {
    const on = S.status === "halftime";
    $("half").classList.toggle("show", on);
    if (!on) return;
    const d = S.teams[0].score - S.teams[1].score;
    const who = d ? `${esc(S.teams[d > 0 ? 0 : 1].name)} mène de <b>${Math.abs(d)}</b>` : "<b>Égalité</b>";
    $("halfTxt").innerHTML = who + (S.halftimeResumeIn != null ? ` · reprise dans <b>${fmtClock(S.halftimeResumeIn)}</b>` : "");
  }

  // Nom de joueur cliquable (ouvre sa fiche) si l'adaptateur fournit un lien.
  const pname = (p, cls = "") => p.link
    ? `<button type="button" class="plink ${cls}" data-player-team="${esc(p.link.team)}" data-player-id="${esc(p.link.id)}">${esc(p.name)}</button>`
    : `<span class="${cls}">${esc(p.name)}</span>`;
  const avatar = (p, size = "") => `<span class="av ${size}">${p.avatar || `<span class="av-txt">${esc(initials(p.name))}</span>`}</span>`;
  const initials = n => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  // « Hommes du match » : le meilleur de chaque équipe sur les trois
  // grandes stats, façon tuiles de la fiche joueur.
  // Signature des stats (sans les avatars) : la feuille et les tuiles ne
  // sont redessinées que si un chiffre a bougé (l'horloge rafraîchit la vue
  // chaque seconde, les avatars SVG coûtent cher à réinjecter).
  const sig = T => T.players.map(p => [p.id, p.onCourt ? 1 : 0, Math.floor(p.seconds / 60), p.pts, p.reb, p.ast, p.stl, p.blk, p.tov, p.pf, p.fg2m, p.fg2a, p.fg3m, p.fg3a, p.ftm, p.fta].join(",")).join(";");
  let leadersKey = null, boxKey = null;

  function renderLeaders() {
    const key = sig(S.teams[0]) + "|" + sig(S.teams[1]) + "|" + S.teams.map(t => t.short).join();
    if (key === leadersKey) return;
    leadersKey = key;
    const cats = [["pts", "Points"], ["reb", "Rebonds"], ["ast", "Passes déc."]];
    const anyPlayed = S.teams.some(T => T.players.some(p => p.seconds > 0 || p.onCourt));
    if (!anyPlayed) { $("leaders").innerHTML = ""; return; }
    $("leaders").innerHTML = cats.map(([k, lbl]) => {
      const rows = [0, 1].map(t => {
        const ps = S.teams[t].players.filter(p => p.seconds > 0 || p.onCourt);
        const best = ps.reduce((a, b) => (b[k] > (a ? a[k] : -1) ? b : a), null);
        if (!best) return "";
        return `<div class="ld-row t${t}">${avatar(best)}<div class="ld-who">${pname(best, "ld-name")}<span class="ld-team">${esc(S.teams[t].short)}${best.pos ? " · " + esc(best.pos) : ""}</span></div><div class="ld-val">${best[k]}</div></div>`;
      }).join("");
      return `<div class="ld-tile"><div class="klbl">${lbl}</div>${rows}</div>`;
    }).join("");
  }

  const COURT_BASE = (() => {
    const half = flip => {
      const X = x => (flip ? 940 - x : x), sw = flip ? 0 : 1;
      // Raquette teintée aux couleurs de l'équipe QUI ATTAQUE ce panier.
      const tint = flip ? "var(--c0)" : "var(--c1)";
      return `<rect x="${flip ? 750 : 0}" y="170" width="190" height="160" fill="${tint}" opacity=".13"/>
        <rect class="ln" x="${flip ? 750 : 0}" y="170" width="190" height="160" fill="none"/>
        <circle class="ln" cx="${X(190)}" cy="250" r="60"/>
        <path class="ln" d="M${X(0)} 30 L${X(141.5)} 30 A237.5 237.5 0 0 ${sw} ${X(141.5)} 470 L${X(0)} 470"/>
        <path class="ln" d="M${X(52)} 210 A40 40 0 0 ${sw} ${X(52)} 290"/>
        <line class="ln" x1="${X(40)}" y1="220" x2="${X(40)}" y2="280" stroke-width="3"/>
        <circle class="rim" cx="${X(52)}" cy="250" r="7.5"/>`;
    };
    return `<rect class="ln" x="2" y="2" width="936" height="496" rx="4"/><line class="ln" x1="470" y1="2" x2="470" y2="498"/>
      <circle class="ln" cx="470" cy="250" r="60"/>${half(false)}${half(true)}`;
  })();

  function renderCourt(newShots) {
    const list = S.shots
      .filter(s => (ui.team === "all" || s.team == ui.team) && (ui.q === "all" || s.quarter == ui.q) && (ui.res === "all" || (ui.res === "made") === s.made))
      .sort((a, b) => a.made - b.made); // réussis dessinés par-dessus
    let g = "";
    for (const s of list) {
      const x = s.x * 10, y = s.y * 10, c = COLOR(s.team);
      if (s.made) g += `<g class="made${newShots.has(s.id) ? " shot-new" : ""}"><circle class="ring" cx="${x}" cy="${y}" r="8" fill="none" stroke="${c}" stroke-width="3" opacity="0"/><circle class="dot" cx="${x}" cy="${y}" r="8" fill="${c}"/></g>`;
      else g += `<g class="miss"><path d="M${x - 6} ${y - 6}l12 12M${x + 6} ${y - 6}l-12 12" stroke="${c}"/></g>`;
    }
    // Logo du club qui reçoit au rond central (S.courtLogo : SVG fourni par
    // le jeu, dessiné pour un cercle de 104 unités centré en 470,250).
    const court = $("court");
    if (courtLogoKey !== (S.courtLogo || "")) {
      courtLogoKey = S.courtLogo || "";
      court.innerHTML = `<g class="base">${COURT_BASE}</g><g class="logo" opacity=".85">${courtLogoKey}</g><g class="marks"></g>`;
    }
    court.querySelector(".marks").innerHTML = g;

    let h = `<span></span>` + ZONES.map(z => `<span class="h">${z[1]}</span>`).join("");
    [0, 1].forEach(t => {
      h += `<span class="tn" style="color:${COLOR(t)}">${esc(S.teams[t].short)}</span>`;
      for (const [z] of ZONES) {
        const ss = S.shots.filter(s => s.team === t && s.zone === z && (ui.q === "all" || s.quarter == ui.q));
        const m = ss.filter(s => s.made).length, a = ss.length;
        h += `<span class="zcell"><span class="zn">${m}/${a}</span><span class="zbar"><b style="width:${a ? (100 * m) / a : 0}%;background:${COLOR(t)}"></b></span><span class="zp">${pct(m, a)}</span></span>`;
      }
    });
    $("zones").innerHTML = h;
  }

  function renderFeed(newEv) {
    const keep = e => ui.feed === "all" || e.type === "period" ||
      (ui.feed === "score" ? !!e.score : e.type === "foul" || e.type === "turnover");
    // Points rapportés par chaque action qui porte un score.
    const gained = new Map();
    let prev = [0, 0];
    for (const e of scoring()) {
      const t = e.team === 1 ? 1 : 0;
      gained.set(e.id, Math.max(0, e.score[t] - prev[t]));
      prev = e.score;
    }
    const list = S.events.filter(keep).slice(-150).reverse();
    const prevTop = feed.scrollTop, prevH = feed.scrollHeight;
    feed.innerHTML = list.length ? list.map(e => {
      if (e.type === "period") return `<li class="ev sep"><span>${esc(e.text)}</span></li>`;
      const t = e.team;
      const cls = ["ev", t != null ? "t" + t : "", e.score ? "made" : "", e.highlight ? "big" : "", newEv.has(e.id) ? "fresh" : ""].join(" ");
      let sc = "";
      if (e.score) { const [a, b] = e.score; sc = t === 0 ? `<b>${a}</b>-${b}` : `${a}-<b>${b}</b>`; }
      const chip = e.score ? `+${gained.get(e.id) || (e.type === "ft" ? 1 : 2)}` : e.type === "ft" ? "LF" : (CHIP[e.type] || "·");
      const chipCls = e.score ? "chip pts" : `chip ${e.type}`;
      return `<li class="${cls}"><span class="tm"><b>Q${e.quarter}</b> ${fmtClock(e.clock)}</span><span class="${chipCls}">${chip}</span><span class="tx">${esc(e.text)}</span><span class="sc">${sc}</span></li>`;
    }).join("") : `<li class="empty">Les actions du match s'afficheront ici.</li>`;

    // on ne fait pas sauter la liste si l'utilisateur relit plus bas
    if (prevTop > 4) {
      feed.style.scrollBehavior = "auto";
      feed.scrollTop = prevTop + (feed.scrollHeight - prevH);
      feed.style.scrollBehavior = "";
      const n = list.filter(e => newEv.has(e.id)).length;
      if (n) {
        pending += n;
        $("newpill").textContent = `↑ ${pending} nouvelle${pending > 1 ? "s" : ""} action${pending > 1 ? "s" : ""}`;
        $("newpill").classList.add("show");
      }
    }
    edges();
  }

  const totals = T => {
    const o = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 };
    T.players.forEach(p => { for (const k in o) o[k] += p[k] || 0; });
    return o;
  };

  function renderCompare() {
    const a = totals(S.teams[0]), b = totals(S.teams[1]);
    $("cmpLegend").innerHTML = `<span style="color:var(--c0)">■ ${esc(S.teams[0].short)}</span><span style="color:var(--c1)">■ ${esc(S.teams[1].short)}</span>`;
    const rows = [
      ["Tirs", a.fg2m + a.fg3m, a.fg2a + a.fg3a, b.fg2m + b.fg3m, b.fg2a + b.fg3a],
      ["3 points", a.fg3m, a.fg3a, b.fg3m, b.fg3a],
      ["Lancers francs", a.ftm, a.fta, b.ftm, b.fta],
      ["Rebonds", a.reb, null, b.reb],
      ["Passes décisives", a.ast, null, b.ast],
      ["Interceptions", a.stl, null, b.stl],
      ["Pertes de balle", a.tov, null, b.tov, null, true],
      ["Fautes", a.pf, null, b.pf, null, true],
    ];
    $("cmp").innerHTML = rows.map(([l, am, aa, bm, ba, lowerIsBetter]) => {
      const ratio = aa !== null;
      const av = ratio ? (aa ? am / aa : 0) : am, bv = ratio ? (ba ? bm / ba : 0) : bm;
      const tot = av + bv || 1;
      const aw = lowerIsBetter ? av < bv : av > bv, bw = lowerIsBetter ? bv < av : bv > av;
      const al = ratio ? pct(am, aa) + `<span class="pct">${am}/${aa}</span>` : am;
      const bl = ratio ? pct(bm, ba) + `<span class="pct">${bm}/${ba}</span>` : bm;
      return `<div class="cmp-item"><div class="klbl">${l}</div><div class="crow"><span class="${aw ? "w" : ""}">${al}</span>
        <div class="cbar"><span class="a" style="flex:${av / tot}"></span><span class="b" style="flex:${bv / tot}"></span></div>
        <span class="r ${bw ? "w" : ""}">${bl}</span></div></div>`;
    }).join("");
  }

  function renderBox() {
    const ti = +ui.box, T = S.teams[ti];
    const key = ti + "|" + sig(T);
    if (key === boxKey) return;
    boxKey = key;
    const played = T.players.filter(p => p.seconds > 0 || p.onCourt);
    const best = k => Math.max(1, ...played.map(p => p[k]));
    const lead = { pts: best("pts"), reb: best("reb"), ast: best("ast") };
    const lc = (p, k) => (p[k] === lead[k] ? "lead" : "");
    const evalCls = v => (v >= 10 ? "ev-good" : v < 0 ? "ev-bad" : "");
    const row = p => { const r = rating(p); return `<tr class="${p.onCourt ? "is-on" : ""}">
      <td><div class="pcell">${avatar(p, "sm")}<div class="pmain">${pname(p, "pn")}<div class="psub">${p.pos ? `<span class="pos">${esc(p.pos)}</span>` : ""}${p.onCourt ? `<span class="oncourt" title="Sur le terrain"><span>Sur le terrain</span></span>` : ""}${p.pf >= FOUL_OUT ? `<span class="out">Exclu</span>` : ""}</div></div></div></td>
      <td>${Math.floor(p.seconds / 60)}</td><td class="${lc(p, "pts")}">${p.pts}</td><td class="${lc(p, "reb")}">${p.reb}</td><td class="${lc(p, "ast")}">${p.ast}</td>
      <td class="c2">${p.stl}</td><td class="c2">${p.blk}</td><td class="c2">${p.tov}</td><td class="${p.pf >= FOUL_OUT - 1 ? "f4" : ""}">${p.pf}</td>
      <td class="c3">${p.fg2m}/${p.fg2a}</td><td class="c3">${p.fg3m}/${p.fg3a}</td><td>${p.ftm}/${p.fta}</td><td class="${evalCls(r)}">${r}</td></tr>`; };
    const t = totals(T);
    const starters = played.filter(p => p.starter), bench = played.filter(p => !p.starter);
    $("box").style.setProperty("--tc", COLOR(ti));
    $("box").innerHTML = `<thead><tr><th>Joueur</th><th>Min</th><th>Pts</th><th>Reb</th><th>PD</th>
        <th class="c2">Int</th><th class="c2">Ctr</th><th class="c2">Pdb</th><th>Fte</th><th class="c3">2 pts</th><th class="c3">3 pts</th><th>LF</th><th>Éval</th></tr></thead>
      <tbody>
        ${starters.length ? `<tr class="grp"><td colspan="13">Cinq de départ</td></tr>${starters.map(row).join("")}` : ""}
        ${bench.length ? `<tr class="grp"><td colspan="13">Banc</td></tr>${bench.map(row).join("")}` : ""}
        <tr class="total"><td>Total</td><td></td><td>${t.pts}</td><td>${t.reb}</td><td>${t.ast}</td>
          <td class="c2">${t.stl}</td><td class="c2">${t.blk}</td><td class="c2">${t.tov}</td><td>${t.pf}</td>
          <td class="c3">${t.fg2m}/${t.fg2a}<span class="pct">${pct(t.fg2m, t.fg2a)}</span></td>
          <td class="c3">${t.fg3m}/${t.fg3a}<span class="pct">${pct(t.fg3m, t.fg3a)}</span></td>
          <td>${t.ftm}/${t.fta}<span class="pct">${pct(t.ftm, t.fta)}</span></td>
          <td>${played.reduce((s, p) => s + rating(p), 0)}</td></tr>
      </tbody>`;
    const dnp = T.players.filter(p => !played.includes(p));
    $("dnp").innerHTML = dnp.length ? `<span class="klbl">Pas encore entrés</span> ` + dnp.map(p => esc(p.name)).join(", ") + "." : "";
  }

  // ---------- effets ----------
  function toast(msg) {
    const el = $("toast"); el.textContent = msg; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }
  function bump(t) { const el = $("score" + t); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }

  function openRecap() {
    const [A, B] = S.teams, a = totals(A), b = totals(B);
    const top = T => T.players.reduce((x, y) => (y.pts > x.pts ? y : x));
    const diffs = scoring().map(e => e.score[0] - e.score[1]);
    const big = Math.max(0, ...diffs.map(Math.abs)), bigD = diffs.find(d => Math.abs(d) === big);
    $("dlgScore").textContent = `${A.name} ${A.score} – ${B.score} ${B.name}`;
    $("dlgFacts").innerHTML = [
      `Meilleurs marqueurs : <b>${esc(top(A).name)}</b> (${top(A).pts} pts) et <b>${esc(top(B).name)}</b> (${top(B).pts} pts).`,
      `Adresse : ${pct(a.fg2m + a.fg3m, a.fg2a + a.fg3a)} pour ${esc(A.name)}, ${pct(b.fg2m + b.fg3m, b.fg2a + b.fg3a)} pour ${esc(B.name)}.`,
      `Rebonds : ${a.reb} contre ${b.reb}. Pertes de balle : ${a.tov} contre ${b.tov}.`,
      big ? `Plus gros écart : ${big} points en faveur de ${esc(bigD > 0 ? A.name : B.name)}.` : "Aucune équipe n'a réussi à se détacher.",
    ].map(x => `<li>${x}</li>`).join("");
    $("dlg").showModal();
  }

  return { update, destroy };
}
