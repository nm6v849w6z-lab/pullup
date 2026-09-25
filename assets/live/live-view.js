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
// =====================================================================
import { fmtClock, quarterName, pct, rating, esc } from "./format.js";

const TEMPLATE = `
<div class="toast" data-ref="toast" role="status" aria-live="polite"></div>

<header class="board">
  <div class="board-top">
    ${[0, 1].map(t => `
    <div class="team ${t ? "away" : "home"}" style="order:${t ? 3 : 1}">
      <div class="crest" data-ref="crest${t}"></div>
      <div>
        <div class="tname" data-ref="name${t}"></div>
        <div class="tmeta"><span data-ref="fouls${t}"></span><span class="dots" data-ref="tos${t}" title="Temps morts restants"></span></div>
      </div>
      <div class="score" data-ref="score${t}">0</div>
      <div class="poss" data-ref="poss${t}" title="Possession"></div>
    </div>`).join("")}
    <div class="center" style="order:2">
      <div class="live" data-ref="live">En direct</div>
      <div class="clock" data-ref="clock">10:00</div>
      <div class="period" data-ref="period"></div>
    </div>
  </div>
  <div class="board-bottom">
    <table class="qt" data-ref="qt" aria-label="Score par quart-temps"></table>
    <div class="tracker">
      <div class="tracker-head">
        <span>Écart au score <span style="color:var(--home)" data-ref="upLbl"></span> <span style="color:var(--away)" data-ref="dnLbl"></span></span>
        <span class="run" data-ref="run"></span>
      </div>
      <svg data-ref="lead" viewBox="0 0 600 64" preserveAspectRatio="none" aria-label="Évolution de l'écart au score"></svg>
    </div>
  </div>
</header>

<section class="half" data-ref="half" aria-live="polite">
  <div class="half-ball"><svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="#1b1305" stroke-width="2" aria-hidden="true"><circle cx="15" cy="15" r="12"/><path d="M3 15h24M15 3v24M6.5 6.5c4 4 4 13 0 17M23.5 6.5c-4 4-4 13 0 17"/></svg></div>
  <div><h2>Mi-temps</h2><p data-ref="halfTxt"></p></div>
  <button class="cta" type="button" data-ref="showBtn">
    <span class="play"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="#f5a623"/></svg></span>
    <span class="lbl">Voir l'émission<small>Résumé et chiffres clés</small></span>
  </button>
</section>
<dialog data-ref="dlg" aria-labelledby="hm-dlg-title">
  <h3 id="hm-dlg-title">L'émission de la mi-temps</h3>
  <p class="sub" data-ref="dlgScore"></p>
  <ul class="facts" data-ref="dlgFacts"></ul>
  <form method="dialog" style="text-align:right"><button class="ghost">Retour au match</button></form>
</dialog>

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
      <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="#8290ab"/></svg>Réussi</span>
      <span><svg width="14" height="14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="#8290ab" stroke-width="2.5" stroke-linecap="round"/></svg>Manqué</span>
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
  <div class="phead"><h2>Face à face</h2></div>
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

const ICON = { made: "●", miss: "○", ft: "◐", foul: "⚑", turnover: "✕", timeout: "⏸", sub: "⇄" };
const ZONES = [["paint", "Raquette"], ["mid", "Mi-distance"], ["three", "3 points"]];
const COLOR = t => (t === 0 ? "var(--home)" : "var(--away)");

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

  const ui = { team: "all", q: "all", res: "all", feed: "all", box: "0" };
  let S = null;                 // dernier état reçu
  let seenEvents = null;        // Set des id d'événements déjà affichés
  let seenShots = null;
  let lastScore = null;
  let pending = 0, toastTimer = 0;

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
    renderBoard(); renderHalf(); renderCourt(newShots); renderFeed(newEv); renderCompare(); renderBox();
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
    const [A, B] = S.teams, live = $("live");
    [0, 1].forEach(t => {
      const T = S.teams[t];
      $("crest" + t).textContent = T.short;
      $("name" + t).textContent = T.name;
      $("score" + t).textContent = T.score;
      $("fouls" + t).innerHTML = T.teamFouls >= BONUS ? `<span class="bonus">Fautes ${T.teamFouls} · bonus</span>` : `Fautes ${T.teamFouls}`;
      const tot = T.timeoutsTotal ?? 5;
      $("tos" + t).innerHTML = Array.from({ length: tot }, (_, i) => `<i class="${i < T.timeoutsLeft ? "" : "used"}"></i>`).join("");
      $("poss" + t).classList.toggle("on", S.status === "live" && S.possession === t);
      $("fT" + t).textContent = T.short; $("fB" + t).textContent = T.name;
    });
    $("upLbl").textContent = "▲ " + A.short; $("dnLbl").textContent = "▼ " + B.short;
    $("sides").textContent = `${A.name} attaque à droite, ${B.name} à gauche`;
    $("clock").textContent = fmtClock(S.clock);
    $("period").textContent = S.status === "final" ? "Terminé" : S.status === "halftime" ? "Mi-temps" : quarterName(S.quarter);
    live.textContent = S.status === "final" ? "Match terminé" : "En direct";
    live.classList.toggle("done", S.status === "final");

    const nq = Math.max(4, A.quarterScores.length);
    let q = `<tr><th></th>${Array.from({ length: nq }, (_, i) => `<th>${i < 4 ? "Q" + (i + 1) : "P" + (i - 3)}</th>`).join("")}<th>Total</th></tr>`;
    [A, B].forEach((T, t) => {
      q += `<tr><td style="color:${COLOR(t)}">${esc(T.short)}</td>${Array.from({ length: nq }, (_, i) => {
        const v = T.quarterScores[i];
        const cur = S.status === "live" && i === S.quarter - 1;
        const notStarted = v == null || (S.status === "halftime" && i === S.quarter - 1 && !v);
        return `<td class="${cur ? "cur" : ""}">${notStarted ? "–" : v}</td>`;
      }).join("")}<td class="tot">${T.score}</td></tr>`;
    });
    $("qt").innerHTML = q;

    const run = currentRun(), d = A.score - B.score;
    $("run").textContent = run.team !== null && run.pts >= 5 ? `Série ${run.pts}-0 pour ${S.teams[run.team].short}`
      : d ? `${S.teams[d > 0 ? 0 : 1].short} mène de ${Math.abs(d)}` : "Égalité";

    // courbe d'écart (dérivée des événements qui portent un score)
    const W = 600, H = 64, M = H / 2, total = 4 * QLEN;
    const pts = [{ t: 0, d: 0 }, ...scoring().map(e => ({ t: elapsed(e.quarter, e.clock), d: e.score[0] - e.score[1] }))];
    const now = S.status === "final" ? total : Math.min(total, elapsed(S.quarter, S.clock));
    const mx = Math.max(8, ...pts.map(p => Math.abs(p.d))), k = (M - 4) / mx;
    let path = `M0 ${M}`;
    pts.forEach((p, i) => { const x = Math.min(W, (p.t / total) * W); if (i) path += ` H${x}`; path += ` V${M - p.d * k}`; });
    path += ` H${(now / total) * W} V${M} Z`;
    $("lead").innerHTML = `<defs><clipPath id="hm-up"><rect width="${W}" height="${M}"/></clipPath><clipPath id="hm-dn"><rect y="${M}" width="${W}" height="${M}"/></clipPath></defs>
      ${[1, 2, 3].map(i => `<line x1="${(i * W) / 4}" y1="0" x2="${(i * W) / 4}" y2="${H}" stroke="var(--line)" stroke-dasharray="3 3"/>`).join("")}
      <line x1="0" y1="${M}" x2="${W}" y2="${M}" stroke="var(--line)"/>
      <path d="${path}" fill="var(--home)" opacity=".75" clip-path="url(#hm-up)"/>
      <path d="${path}" fill="var(--away)" opacity=".75" clip-path="url(#hm-dn)"/>`;
  }

  function renderHalf() {
    const on = S.status === "halftime";
    $("half").classList.toggle("show", on);
    if (!on) return;
    const d = S.teams[0].score - S.teams[1].score;
    const who = d ? `${esc(S.teams[d > 0 ? 0 : 1].name)} mène de <b>${Math.abs(d)}</b>` : "<b>Égalité</b>";
    $("halfTxt").innerHTML = who + (S.halftimeResumeIn != null ? ` · reprise dans <b>${fmtClock(S.halftimeResumeIn)}</b>` : "");
  }

  const COURT_BASE = (() => {
    const half = flip => {
      const X = x => (flip ? 940 - x : x), sw = flip ? 0 : 1;
      return `<rect class="ln" x="${flip ? 750 : 0}" y="170" width="190" height="160" fill="rgba(255,255,255,.035)"/>
        <circle class="ln" cx="${X(190)}" cy="250" r="60"/>
        <path class="ln" d="M${X(0)} 30 L${X(141.5)} 30 A237.5 237.5 0 0 ${sw} ${X(141.5)} 470 L${X(0)} 470"/>
        <path class="ln" d="M${X(52)} 210 A40 40 0 0 ${sw} ${X(52)} 290"/>
        <line class="ln" x1="${X(40)}" y1="220" x2="${X(40)}" y2="280" stroke-width="3"/>
        <circle class="ln" cx="${X(52)}" cy="250" r="7.5" style="stroke:var(--accent)"/>`;
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
    $("court").innerHTML = COURT_BASE + g;

    let h = `<span></span>` + ZONES.map(z => `<span class="h">${z[1]}</span>`).join("");
    [0, 1].forEach(t => {
      h += `<span class="tn" style="color:${COLOR(t)}">${esc(S.teams[t].short)}</span>`;
      for (const [z] of ZONES) {
        const ss = S.shots.filter(s => s.team === t && s.zone === z && (ui.q === "all" || s.quarter == ui.q));
        const m = ss.filter(s => s.made).length, a = ss.length;
        h += `<span class="zcell">${m}/${a}<span class="zbar"><b style="width:${a ? (100 * m) / a : 0}%;background:${COLOR(t)}"></b></span></span>`;
      }
    });
    $("zones").innerHTML = h;
  }

  function renderFeed(newEv) {
    const keep = e => ui.feed === "all" || e.type === "period" ||
      (ui.feed === "score" ? !!e.score : e.type === "foul" || e.type === "turnover");
    const list = S.events.filter(keep).slice(-150).reverse();
    const prevTop = feed.scrollTop, prevH = feed.scrollHeight;
    feed.innerHTML = list.length ? list.map(e => {
      if (e.type === "period") return `<li class="ev sep">${esc(e.text)}</li>`;
      const t = e.team;
      const cls = ["ev", t != null ? "t" + t : "", e.score ? "made" : "", e.highlight ? "big" : "", newEv.has(e.id) ? "fresh" : ""].join(" ");
      let sc = "";
      if (e.score) { const [a, b] = e.score; sc = t === 0 ? `<b>${a}</b>–${b}` : `${a}–<b>${b}</b>`; }
      return `<li class="${cls}"><span class="tm">Q${e.quarter} ${fmtClock(e.clock)}</span><span class="ic" aria-hidden="true">${ICON[e.type] || "·"}</span><span class="tx">${esc(e.text)}</span><span class="sc">${sc}</span></li>`;
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
      return `<div><div class="lbl">${l}</div><div class="crow"><span class="${aw ? "w" : ""}">${al}</span>
        <div class="cbar"><span class="a" style="flex:${av / tot}"></span><span class="b" style="flex:${bv / tot}"></span></div>
        <span class="r ${bw ? "w" : ""}">${bl}</span></div></div>`;
    }).join("");
  }

  function renderBox() {
    const T = S.teams[+ui.box];
    const played = T.players.filter(p => p.seconds > 0 || p.onCourt);
    const best = k => Math.max(1, ...played.map(p => p[k]));
    const lead = { pts: best("pts"), reb: best("reb"), ast: best("ast") };
    const lc = (p, k) => (p[k] === lead[k] ? "lead" : "");
    const row = p => `<tr>
      <td><span class="${p.onCourt ? "oncourt" : ""}">${esc(p.name)}</span><span class="pos">${esc(p.pos || "")}</span>${p.pf >= FOUL_OUT ? `<span class="out">${FOUL_OUT}F</span>` : ""}</td>
      <td>${Math.floor(p.seconds / 60)}</td><td class="${lc(p, "pts")}">${p.pts}</td><td class="${lc(p, "reb")}">${p.reb}</td><td class="${lc(p, "ast")}">${p.ast}</td>
      <td class="c2">${p.stl}</td><td class="c2">${p.blk}</td><td class="c2">${p.tov}</td><td class="${p.pf >= FOUL_OUT - 1 ? "f4" : ""}">${p.pf}</td>
      <td class="c3">${p.fg2m}/${p.fg2a}</td><td class="c3">${p.fg3m}/${p.fg3a}</td><td>${p.ftm}/${p.fta}</td><td>${rating(p)}</td></tr>`;
    const t = totals(T);
    const starters = played.filter(p => p.starter), bench = played.filter(p => !p.starter);
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
    $("dnp").textContent = dnp.length ? "N'ont pas encore joué : " + dnp.map(p => p.name).join(", ") + "." : "";
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
