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
import { fmtClock, quarterName, pct, rating, esc, de, floorAdInk } from "./format.js";
import { createCourt2D } from "./court2d.js?v=20261009-27";
import { createHighlights } from "./highlights.js?v=20261009-27";

const BALL = `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#d97b35" stroke="#2b1a0e" stroke-width="1.4"/><path d="M12 1.5v21M1.5 12h21M5 4.5c3.5 3.2 3.5 11.8 0 15M19 4.5c-3.5 3.2-3.5 11.8 0 15" fill="none" stroke="#2b1a0e" stroke-width="1.3"/></svg>`;

const TEMPLATE = `
<div class="toast" data-ref="toast" role="status" aria-live="polite"></div>

<!-- Plein écran (demande du 2026-10-07) : barre du haut (équipes, score,
     période, chrono, temps mort), terrain au centre, fil du match à droite. -->
<div class="fsbar" data-ref="fsbar" aria-hidden="true">
  ${[0, 1].map(t => `
  <div class="fs-team ${t ? "away" : "home"}" style="order:${t ? 5 : 1}">
    <span class="fs-crest" data-ref="fscrest${t}"></span>
    <span class="fs-id"><b class="fs-name" data-ref="fsname${t}"></b><small class="fs-meta" data-ref="fsmeta${t}"></small></span>
  </div>
  <div class="fs-score" data-ref="fsscore${t}" style="order:${t ? 4 : 2}">0</div>`).join("")}
  <div class="fs-center" style="order:3">
    <span class="fs-period" data-ref="fsperiod"></span>
    <span class="fs-clock" data-ref="fsclock">10:00</span>
    <span class="fs-shot" data-ref="fsshot" title="Chrono des 24 secondes"></span>
    <span class="tmo fs-tmo" data-ref="fstmo" hidden></span>
  </div>
  <button type="button" class="fs-exit" data-ref="fsExit" aria-label="Quitter le plein écran" title="Quitter le plein écran (Échap)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>
  </button>
</div>
<!-- Rediffusion en plein écran (2026-10-09) : le curseur de temps de la
     page (makeReplaySeekBar, hors de la vue) est accueilli ici. -->
<div class="fs-seek" data-ref="fsseek"></div>

<!-- Mini-tableau d'affichage collé sous le topbar dès que le grand bandeau
     sort de l'écran (retour utilisateur, 2026-09-26 : « même si on scrolle,
     on voit toujours le score, le temps restant et le quart-temps »). -->
<div class="mini" data-ref="mini" aria-hidden="true">
  <div class="mini-in">
    ${[0, 1].map(t => `
    <div class="mteam ${t ? "away" : "home"}" style="order:${t ? 5 : 1}">
      <span class="mcrest" data-ref="mcrest${t}"></span><span class="mshort" data-ref="mshort${t}"></span>
    </div>
    <div class="mscore" data-ref="mscore${t}" style="order:${t ? 4 : 2}">0</div>`).join("")}
    <div class="mcenter" style="order:3">
      <span class="mclock" data-ref="mclock">10:00</span>
      <span class="mperiod" data-ref="mperiod"></span>
      <span class="tmo mtmo" data-ref="mtmo" hidden></span>
    </div>
  </div>
</div>

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
        <div class="tsponsor" data-ref="sponsor${t}"></div>
        <div class="tmeta"><span data-ref="fouls${t}"></span><span class="dots" data-ref="tos${t}" title="Temps morts restants"></span></div>
      </div>
    </div>
    <div class="score-wrap s${t}" style="order:${t ? 4 : 2}">
      <div class="score" data-ref="score${t}">0</div>
      <div class="poss" data-ref="poss${t}" title="Possession">${BALL}</div>
    </div>`).join("")}
    <div class="center" style="order:3">
      <div class="clock" data-ref="clock">10:00</div>
      <div class="shotclock" data-ref="shotclock" title="Chrono des 24 secondes"></div>
      <div class="period" data-ref="period"></div>
      <div class="tmo" data-ref="tmo" hidden></div>
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

<div class="grid" data-ref="grid">
  <section class="panel court-panel" data-ref="courtPanel">
    <div class="phead">
      <h2 data-ref="courtTitle">Terrain</h2>
      <button type="button" class="comm-btn" data-ref="commBtn" aria-pressed="false" title="Commentaire audio du match" hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path class="on" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/><path class="off" d="m16 9 6 6M22 9l-6 6"/></svg><span>Commentaire</span>
      </button>
      <button type="button" class="fs-btn" data-ref="fsBtn" aria-pressed="false" title="Suivre le match en plein écran">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span>Plein écran</span>
      </button>
      <div class="seg view-seg" data-seg="view"><button data-v="2d" aria-pressed="true">Terrain</button><button data-v="chart">Carte des tirs</button></div>
      <div class="filters" data-ref="chartFilters" hidden>
        <div class="seg" data-seg="team"><button data-v="all" aria-pressed="true">Les deux</button><button data-v="0" data-ref="fT0"></button><button data-v="1" data-ref="fT1"></button></div>
        <div class="seg" data-seg="q"><button data-v="all" aria-pressed="true">Match</button><button data-v="1">Q1</button><button data-v="2">Q2</button><button data-v="3">Q3</button><button data-v="4">Q4</button></div>
        <div class="seg" data-seg="res"><button data-v="all" aria-pressed="true">Tous</button><button data-v="made">Réussis</button><button data-v="miss">Manqués</button></div>
      </div>
    </div>
    <div class="court2d" data-ref="court2d"></div>
    <div class="court-wrap" data-ref="courtWrap" hidden><svg class="court" data-ref="court" viewBox="0 0 940 500" role="img" aria-label="Terrain avec les tirs"></svg><div class="shot-tip" data-ref="shotTip" role="tooltip"></div></div>
    <div class="legend" data-ref="chartLegend" hidden>
      <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="#93A1B8"/></svg>Réussi</span>
      <span><svg width="14" height="14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="#93A1B8" stroke-width="2.5" stroke-linecap="round"/></svg>Manqué</span>
      <span data-ref="sides"></span>
    </div>
    <div class="zones" data-ref="zones" hidden></div>
  </section>

  <section class="panel feed-panel">
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

<!-- Meilleurs joueurs entre la carte des tirs / le fil du match et le face
     à face (retour utilisateur 2026-10-01). -->
<section class="leaders" data-ref="leaders" aria-label="Meilleurs joueurs du match"></section>

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
  <div class="tactics" data-ref="tactics"></div>
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
function readable(hex, light) {
  const rgb = hexRgb(hex);
  if (!rgb) return null;
  const L = luminance(rgb);
  if (light) {
    // Thème clair : c'est le maillot blanc ou jaune qui disparaît sur le fond.
    if (L <= 0.45) return hex;
    const k = L > 0.8 ? 0.55 : 0.35;
    return "#" + rgb.map(c => Math.round(c * (1 - k)).toString(16).padStart(2, "0")).join("");
  }
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
 * @param {()=>boolean} [opts.halftimeShowSeen]  vrai = émission déjà regardée :
 *        le bouton « Voir l'émission » est masqué (retour utilisateur,
 *        2026-09-27 : « quand on a déjà regardé l'émission de la mi temps, il
 *        faut que le bouton s'enlève »).
 */
export function createLiveView(root, opts = {}) {
  const QLEN = opts.quarterLength ?? 600;
  const BONUS = opts.bonusAt ?? 5;
  const FOUL_OUT = opts.foulOutAt ?? 5;
  let stagingModule = null;   // promesse du module staging.js (chargé à la demande)
  // Moments forts (3 points, ON FIRE, titre, coupe) : assets/live/highlights.js.
  // Trophée : opts.trophyFor (direct de son club), sinon finale d'un tournoi
  // des sélections (S.meta.competition « … · finale »).
  const highlights = createHighlights(root, {
    trophyFor: S0 => (typeof opts.trophyFor === "function" ? opts.trophyFor(S0) : null) || ntTrophy(S0),
  });
  function ntTrophy(S0) {
    const c = S0 && S0.meta && S0.meta.competition ? String(S0.meta.competition) : "";
    return /Sélections nationales/.test(c) && /· finale$/i.test(c) && !/Rediffusion/.test(c) ? { kind: "title", label: c.replace(/^Sélections nationales · /, ""), key: "nt" } : null;
  }
  let lastStatus = null;

  root.classList.add("hm-live");
  root.innerHTML = TEMPLATE;
  const $ = r => root.querySelector(`[data-ref="${r}"]`);
  // Fluidité (2026-10-08) : les blocs reconstruits chaque seconde (feuille
  // de match et ses 24 avatars, meneurs, comparatif, fautes…) ne touchent
  // plus au DOM quand leur contenu n'a pas changé — chaque réécriture
  // coûtait style, mise en page et peinture, et volait des images au
  // terrain animé.
  const IH = typeof Element !== "undefined" ? Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML") : null;
  function guardHTML(el) {
    if (!el || !IH || !IH.set) return;
    let last = null;
    Object.defineProperty(el, "innerHTML", { configurable: true, get() { return IH.get.call(el); }, set(v) { v = String(v); if (v === last) return; last = v; IH.set.call(el, v); } });
  }
  ["box", "leaders", "cmp", "cmpLegend", "tactics", "dnp", "lead", "qt", "sides", "halfTxt", "fouls0", "fouls1", "tos0", "tos1", "feed"].forEach(r => guardHTML($(r)));

  // `view` : "2d" = terrain animé (court2d.js, 2026-09-29 : « les joueurs qui
  // bougent »), "chart" = l'ancienne carte des tirs avec ses filtres.
  // `opts.court2d === false` : terrain animé indisponible (pas dans la bêta
  // du club) → carte des tirs seule, sans le sélecteur Terrain / Carte.
  const court2dAllowed = opts.court2d !== false;
  const ui = { team: "all", q: "all", res: "all", feed: "all", box: null, view: court2dAllowed ? "2d" : "chart" };
  let court2d = null;
  // Commentaire audio (commentary.js, 2026-10-08) : chargé avec le terrain
  // animé ; le terrain annonce ses moments (onMoment), le module parle.
  let comm = null, commLoad = null;
  const loadComm = () => commLoad || (commLoad = import("./commentary.js?v=20261009-27").then(m => {
    if (comm === false) return null;          // vue détruite entre-temps
    comm = m.createCommentary();
    syncCommBtn();
    return comm;
  }).catch(() => null));
  function syncCommBtn() {
    const b = $("commBtn"); if (!b) return;
    b.toggleAttribute("hidden", !court2dAllowed || !comm);
    b.setAttribute("aria-pressed", String(!!(comm && comm.on)));
  }
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
      if (seg.dataset.seg === "view") applyView();
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

  // Terrain animé ou carte des tirs (retour utilisateur, 2026-09-29 : « il
  // faudrait remplacer la carte des tirs actuelle mais laisser la
  // possibilité de l'afficher »). Le terrain prend toute la largeur (le fil
  // du match passe en dessous), la carte garde la disposition à deux
  // colonnes avec ses filtres.
  function applyView() {
    if (!court2dAllowed) ui.view = "chart";
    const is2d = ui.view === "2d";
    const seg = root.querySelector("[data-seg=view]");
    if (seg) seg.toggleAttribute("hidden", !court2dAllowed);
    $("courtTitle").textContent = is2d ? "Terrain" : "Carte des tirs";
    // toggleAttribute plutôt que `.hidden` : un <svg> n'a pas la propriété
    // `hidden` (elle n'existe que sur HTMLElement), l'attribut resterait posé.
    $("court2d").toggleAttribute("hidden", !is2d);
    ["courtWrap", "chartFilters", "chartLegend", "zones"].forEach(r => $(r).toggleAttribute("hidden", is2d));
    $("grid").classList.toggle("view-2d", is2d);
    if (is2d && !court2d) {
      // Mise en scène (coach, entrée des joueurs, shows — bêta liveShows) :
      // module chargé seulement si le jeu en fournit la configuration.
      if (opts.staging && !stagingModule) stagingModule = import("./staging.js?v=20261009-27").catch(() => null);
      loadComm();
      try { court2d = createCourt2D($("court2d"), { colors: S ? S.teams.map(t => t.color) : undefined, staging: opts.staging || null, stagingModule, onMoment: (m, info) => { if (comm) comm.say(m, info); } }); if (S) court2d.update(S, []); }
      catch (e) { court2d = null; ui.view = "chart"; applyView(); }
    } else if (is2d && court2d && S) {
      // Retour depuis la carte des tirs : remet le terrain à jour (joueurs
      // sur le terrain, possession) sans rejouer les actions manquées.
      try { court2d.update(S, []); } catch (e) { /* rien */ }
    }
  }
  applyView();

  // Mini-tableau : visible quand le bas du grand bandeau (hors quarts-temps)
  // passe sous le topbar collant du jeu (--topbar-h). Écoute en capture pour
  // attraper le défilement de n'importe quel conteneur.
  const mini = $("mini"), boardTop = root.querySelector(".board-top");
  let miniRaf = 0;
  const syncMini = () => {
    miniRaf = 0;
    if (!root.isConnected || !boardTop) return;
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 0;
    const r = boardTop.getBoundingClientRect();
    const show = !!S && r.height > 0 && r.bottom < top + 8;
    mini.classList.toggle("show", show);
    mini.setAttribute("aria-hidden", show ? "false" : "true");
  };
  const onScroll = () => { if (!miniRaf) miniRaf = requestAnimationFrame(syncMini); };
  if (typeof window !== "undefined") {
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });
  }

  // ---------- Plein écran ----------
  // Vrai plein écran (Fullscreen API) quand le navigateur le permet, sinon
  // la vue couvre la fenêtre (iPhone). Le terrain 2D est imposé (s'il est
  // disponible) ; le fil du match se cale sur les actions les plus récentes.
  let full = false;
  function setFull(on) {
    on = !!on;
    if (on === full) return;
    full = on;
    root.classList.toggle("is-full", on);
    $("fsbar").setAttribute("aria-hidden", on ? "false" : "true");
    $("fsBtn").setAttribute("aria-pressed", String(on));
    if (typeof document !== "undefined") document.documentElement.classList.toggle("hm-live-full", on);
    if (on && court2dAllowed && ui.view !== "2d") {
      ui.view = "2d";
      root.querySelectorAll("[data-seg=view] button").forEach(x => x.setAttribute("aria-pressed", x.dataset.v === "2d"));
      applyView();
    }
    try {
      if (on && root.requestFullscreen && !document.fullscreenElement) { const p = root.requestFullscreen(); if (p && p.catch) p.catch(() => {}); }
      else if (!on && document.fullscreenElement === root && document.exitFullscreen) { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); }
    } catch (e) { /* plein écran CSS seul */ }
    if (on) { feed.scrollTop = 0; pending = 0; $("newpill").classList.remove("show"); }
    if (on) adoptSeek(); else releaseSeek();
    if (S) { renderBoard(); }
  }
  // Rediffusion en plein écran (BUG 2026-10-09 : « impossible d'avancer le
  // temps en plein écran ») : le curseur (.replay-seek) est posé par la page
  // À CÔTÉ de la vue, or le plein écran ne montre que la vue. Il est donc
  // déplacé dans la bande .fs-seek le temps du plein écran (même élément,
  // mêmes boutons −30 s / +30 s et glissière), puis remis à sa place. Un
  // curseur recréé par la page pendant le plein écran (saut dans le temps)
  // est repris au rendu suivant. Clavier : ← / → = −30 s / +30 s.
  let seekHome = null;
  function replayBar() {
    for (let e = root.parentElement; e && e !== root.ownerDocument.body; e = e.parentElement) {
      const b = [...e.querySelectorAll(".replay-seek")].find(x => !root.contains(x));
      if (b) return b;
    }
    return null;
  }
  function adoptSeek() {
    const slot = $("fsseek");
    if (!full || !slot || slot.querySelector(".replay-seek")) return;
    const bar = replayBar();
    if (!bar) return;
    if (!seekHome || !seekHome.isConnected) seekHome = root.ownerDocument.createComment("replay-seek");
    bar.parentNode.insertBefore(seekHome, bar);
    slot.appendChild(bar);
  }
  function releaseSeek() {
    const bar = $("fsseek") && $("fsseek").querySelector(".replay-seek");
    if (bar && seekHome && seekHome.parentNode) seekHome.parentNode.insertBefore(bar, seekHome);
    if (seekHome && seekHome.parentNode) seekHome.remove();
    seekHome = null;
  }
  $("fsBtn").addEventListener("click", () => setFull(!full));
  $("commBtn").addEventListener("click", () => { if (!comm) return; comm.setOn(!comm.on); syncCommBtn(); });
  $("fsExit").addEventListener("click", () => setFull(false));
  if (typeof document !== "undefined") {
    // Échap / geste système : le navigateur quitte le vrai plein écran.
    document.addEventListener("fullscreenchange", () => { if (full && document.fullscreenElement !== root) setFull(false); });
    document.addEventListener("keydown", e => {
      if (full && e.key === "Escape" && !document.fullscreenElement) setFull(false);
      if (full && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !(e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))) {
        const b = root.querySelector(`.fs-seek [data-seek="${e.key === "ArrowLeft" ? "-30000" : "30000"}"]`);
        if (b) { e.preventDefault(); b.click(); }
      }
    });
  }

  // Temps mort en cours (state.timeout, calé sur la pause du moteur) :
  // « TEMPS MORT · LYO 00:18 », distinct du chrono de match.
  function renderTimeout() {
    const tm = S && S.status === "live" && S.timeout && S.timeout.remaining > 0 ? S.timeout : null;
    const txt = tm ? `Temps mort${tm.team === 0 || tm.team === 1 ? " · " + S.teams[tm.team].short : ""} ${fmtClock(tm.remaining)}` : "";
    for (const r of ["tmo", "mtmo", "fstmo"]) {
      const el = $(r);
      if (el.textContent !== txt) el.textContent = txt;
      el.hidden = !tm;
    }
    root.classList.toggle("in-timeout", !!tm);
  }

  // ---------- API ----------
  let lightKey = null, lightTicks = 0, lastClock = null, lastHalf = null, lastTmo = null;
  function update(state) {
    if (full) adoptSeek();
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
    // Rendu allégé (2026-10-01, « ça semble laguer ») : le client redessine
    // chaque seconde pour l'horloge ; si rien d'autre n'a changé (pas de
    // nouvelle action, même statut, mêmes cinq, mêmes scores), on ne refait
    // que le bandeau — reconstruire fil + feuille de match (24 avatars SVG)
    // chaque seconde saccadait l'animation du terrain. La feuille (minutes
    // jouées) est rafraîchie toutes les 5 s.
    const key = [S.status, S.quarter, S.events.length, S.shots.length, S.teams.map(t => t.score + ":" + t.teamFouls + ":" + t.timeoutsLeft + ":" + t.players.filter(p => p.onCourt).map(p => p.id).join(",")).join("|"), ui.box, ui.team, ui.q, ui.res, ui.feed].join("#");
    if (!first && key === lightKey && !newEv.size && !newShots.size) {
      const tmoNow = S.timeout ? S.timeout.remaining : null;
      if (S.clock === lastClock && S.halftimeResumeIn === lastHalf && tmoNow === lastTmo) {
        // Seul le chrono des 24 s a bougé (dixièmes) : juste lui.
        renderShotClock();
      } else {
        lightTicks++;
        withStableScroll(() => { renderBoard(); renderHalf(); if (lightTicks % 5 === 0) { renderLeaders(); renderBox(); } });
      }
    } else {
      lightKey = key; lightTicks = 0;
      render(newEv, newShots);
    }
    if (court2d && ui.view === "2d") {
      try { court2d.update(S, [...newEv]); } catch (e) { /* le terrain ne doit jamais casser la page */ }
    }
    // Moments forts : jamais au premier affichage (arrivée en cours de match),
    // ni sur un saut dans le temps (rediffusion : beaucoup d'actions d'un coup).
    try {
      const fresh = S.events.filter(e => newEv.has(e.id)), air = fresh.map(e => e.airAt).filter(Boolean);
      const jump = fresh.length > 8 || (air.length > 1 && Math.max(...air) - Math.min(...air) > 8000);
      if (first || jump) highlights.prime(S.events);
      else if (fresh.length) highlights.detect(fresh, S);
      if (!first && lastStatus && lastStatus !== "final" && S.status === "final") highlights.onFinal(S);
    } catch (e) { /* jamais bloquant */ }
    lastStatus = S.status;
    if (!first) {
      S.events.filter(e => newEv.has(e.id) && (e.type === "timeout" || e.type === "period" || e.highlight))
        .slice(-1).forEach(e => toast(e.toast || e.text));
      [0, 1].forEach(t => { if (lastScore && S.teams[t].score > lastScore[t]) bump(t); });
    }
    lastClock = S.clock; lastHalf = S.halftimeResumeIn; lastTmo = S.timeout ? S.timeout.remaining : null;
    // Plein écran : le fil reste sur les actions les plus récentes.
    if (full && newEv.size) { feed.scrollTop = 0; pending = 0; $("newpill").classList.remove("show"); }
    seenEvents = new Set(S.events.map(e => e.id));
    seenShots = new Set(S.shots.map(s => s.id));
    lastScore = S.teams.map(t => t.score);
  }

  // Infobulle de la carte des tirs : nom du tireur au survol (ou au toucher).
  function showShotTip(e) {
    const tipEl = $("shotTip");
    if (!tipEl) return;
    const g = e.target && e.target.closest ? e.target.closest(".marks g[data-tip]") : null;
    if (!g || !g.dataset.tip) { tipEl.classList.remove("show"); return; }
    const wrap = tipEl.parentElement.getBoundingClientRect(), r = g.getBoundingClientRect();
    tipEl.textContent = g.dataset.tip;
    const half = tipEl.offsetWidth / 2 + 4;
    const x = Math.max(half, Math.min(wrap.width - half, r.left + r.width / 2 - wrap.left));
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${r.top - wrap.top}px`;
    tipEl.classList.add("show");
  }
  {
    const courtEl = $("court");
    if (courtEl) {
      courtEl.addEventListener("pointermove", showShotTip);
      courtEl.addEventListener("click", showShotTip);
      courtEl.addEventListener("pointerleave", () => { const t = $("shotTip"); if (t) t.classList.remove("show"); });
    }
  }

  function destroy() {
    clearTimeout(toastTimer);
    try { highlights.destroy(); } catch (e) { /* rien */ }
    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    }
    if (miniRaf) cancelAnimationFrame(miniRaf);
    if (court2d) { try { court2d.destroy(); } catch (e) { /* rien */ } court2d = null; }
    if (comm) { try { comm.destroy(); } catch (e) { /* rien */ } } comm = false;
    root.innerHTML = ""; root.classList.remove("hm-live");
  }

  // ---------- rendu ----------
  function render(newEv, newShots) {
    withStableScroll(() => {
      applyColors();
      renderBoard(); renderHalf(); renderLeaders(); renderCourt(newShots); renderFeed(newEv); renderCompare(); renderBox();
    });
  }

  // Stabilité du défilement (retour utilisateur 2026-09-26 : "la page saute
  // encore quand je suis tout en bas, ça saute notamment quand il y a un
  // tir"). Safari n'a pas d'ancrage de défilement : tout changement de
  // hauteur AU-DESSUS de ce qu'on regarde (pastille de série, bandeau de
  // mi-temps, meneurs...) décalait la page. On retient donc la position à
  // l'écran du premier bloc visible et on la rétablit après le rendu
  // (l'ancrage natif est coupé dans la vue, voir live.css, pour ne pas
  // corriger deux fois). Et la vue ne rétrécit pas en cours de quart-temps
  // (hauteur minimale = plus grande hauteur atteinte) : tout en bas de page,
  // une ligne qui disparaît faisait remonter l'écran.
  let stablePhase = null, stableMaxH = 0;
  function scrollerOf(el) {
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
    }
    return null; // la fenêtre
  }
  function withStableScroll(fn) {
    if (typeof window === "undefined" || typeof document === "undefined" || !root.isConnected || !root.getBoundingClientRect) { fn(); return; }
    const phase = S ? `${S.status}|${S.quarter}` : "";
    if (phase !== stablePhase) { stablePhase = phase; stableMaxH = 0; root.style.minHeight = ""; }
    const sc = scrollerOf(root);
    const viewTop = sc ? sc.getBoundingClientRect().top : 0;
    let anchor = null, before = 0;
    // Tout en haut de la page, on laisse le contenu pousser (comme l'ancrage
    // natif) : le bandeau de mi-temps doit rester visible.
    const atTop = (sc ? sc.scrollTop : window.scrollY) <= 0;
    if (!atTop) for (const el of root.querySelectorAll("section, [data-ref]")) {
      if (el.closest(".mini")) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top >= viewTop - 1) { anchor = el; before = r.top; break; }
    }
    fn();
    const h = root.offsetHeight;
    if (h > stableMaxH) stableMaxH = h;
    if (stableMaxH) root.style.minHeight = stableMaxH + "px";
    if (anchor && anchor.isConnected) {
      const delta = anchor.getBoundingClientRect().top - before;
      if (Math.abs(delta) >= 1) { if (sc) sc.scrollTop += delta; else window.scrollBy(0, delta); }
    }
  }

  function applyColors() {
    const light = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light";
    let c = S.teams.map((T, t) => T.color || DEFAULT_COLORS[t]);
    const ink = c.map((x, t) => readable(x, light) || DEFAULT_COLORS[t]);
    // Liseré : vraie couleur de maillot, sauf un maillot blanc sur fond clair.
    const stripe = c.map((x, t) => (light && hexRgb(x) && luminance(hexRgb(x)) > 0.8 ? ink[t] : x));
    root.style.setProperty("--stripe0", stripe[0]);
    root.style.setProperty("--stripe1", stripe[1]);
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

  function renderShotClock() {
    const sc = S.status === "live" && typeof S.shotClock === "number" ? S.shotClock : null;
    const txt = sc === null ? "" : String(Math.ceil(sc));
    if ($("shotclock").textContent !== txt) $("shotclock").textContent = txt;
    $("shotclock").classList.toggle("on", sc !== null);
    $("shotclock").classList.toggle("low", sc !== null && sc <= 5);
    const fs = $("fsshot");
    if (fs.textContent !== txt) fs.textContent = txt;
    fs.classList.toggle("on", sc !== null);
    fs.classList.toggle("low", sc !== null && sc <= 5);
  }
  function renderBoard() {
    const [A, B] = S.teams;
    const M = S.meta || {};
    const done = S.status === "final";
    // "pregame" : page live ouverte avant le coup d'envoi (depuis l'émission
    // d'avant-match), tout à zéro en attendant le début du direct.
    const pregame = S.status === "pregame";
    $("liveDot").classList.toggle("done", done || pregame);
    $("kicker").textContent = [done ? "Match terminé" : pregame ? "Avant-match" : "En direct", M.competition, M.round].filter(Boolean).join(" · ");
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
      // Sponsor maillot (voir Team.sponsorContracts côté jeu) : une ligne
      // sous le nom, vide sans contrat.
      // Ligne « Maillot · sponsor » retirée (retour utilisateur 2026-10-03).
      $("sponsor" + t).textContent = "";
      $("sponsor" + t).classList.remove("on");
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
    // Chrono des 24 secondes (retour utilisateur 2026-10-03), seulement
    // pendant le jeu.
    renderShotClock();
    const diff = A.score - B.score;
    $("period").textContent = done ? (diff ? `Victoire ${de(S.teams[diff > 0 ? 0 : 1].name)}` : "Égalité")
      : pregame ? (S.kickoffIn > 0 ? `Coup d'envoi dans ${fmtClock(S.kickoffIn)}` : "Coup d'envoi imminent")
      : S.status === "halftime" ? "Mi-temps" : S.quarter > 4 ? `Prolongation ${S.quarter - 4}` : quarterName(S.quarter);

    // Mini-tableau (même contenu, en condensé)
    [0, 1].forEach(t => {
      const T = S.teams[t];
      const mk = logoKey[t];
      const mc = $("mcrest" + t);
      if (mc.dataset.k !== mk) { mc.dataset.k = mk; mc.innerHTML = $("crest" + t).innerHTML; mc.classList.toggle("has-logo", !!T.logo); }
      $("mshort" + t).textContent = T.short;
      $("mshort" + t).classList.toggle("mine", !!T.mine);
      $("mscore" + t).textContent = T.score;
      $("mscore" + t).classList.toggle("trail", S.teams[1 - t].score > T.score);
    });
    $("mclock").textContent = $("clock").textContent;
    $("mclock").classList.toggle("final", done);
    $("mperiod").textContent = $("period").textContent;
    // Barre du plein écran (même contenu que le bandeau).
    [0, 1].forEach(t => {
      const T = S.teams[t];
      const fc = $("fscrest" + t);
      if (fc.dataset.k !== logoKey[t]) { fc.dataset.k = logoKey[t]; fc.innerHTML = $("crest" + t).innerHTML; fc.classList.toggle("has-logo", !!T.logo); }
      $("fsname" + t).textContent = T.name;
      $("fsname" + t).classList.toggle("mine", !!T.mine);
      $("fsmeta" + t).textContent = `Fautes ${T.teamFouls}${T.teamFouls >= BONUS ? " · bonus" : ""}${(T.timeoutsTotal ?? 0) ? ` · TM ${T.timeoutsLeft}/${T.timeoutsTotal}` : ""}`;
      $("fsscore" + t).textContent = T.score;
      $("fsscore" + t).classList.toggle("trail", S.teams[1 - t].score > T.score);
    });
    $("fsclock").textContent = $("clock").textContent;
    $("fsclock").classList.toggle("final", done);
    $("fsperiod").textContent = done ? "Final" : S.status === "halftime" ? "Mi-temps" : pregame ? "Avant-match" : S.quarter > 4 ? `P${S.quarter - 4}` : `Q${S.quarter}`;
    renderTimeout();
    if (typeof window !== "undefined") onScroll();

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
      // « KRA mène de 4 » retiré (retour utilisateur 2026-10-03) : seule une
      // série en cours reste annoncée.
      runEl.innerHTML = "";
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
    $("showBtn").hidden = !!(opts.halftimeShowSeen && opts.halftimeShowSeen());
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
  const sig = T => T.players.map(p => [p.id, p.onCourt ? 1 : 0, p.slot || "", S.status, JSON.stringify(T.tactics || null), Math.floor(p.seconds / 60), p.pts, p.reb, p.oreb || 0, p.ast, p.stl, p.blk, p.tov, p.pf, p.fg2m, p.fg2a, p.fg3m, p.fg3a, p.ftm, p.fta].join(",")).join(";");
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

  // Découpe le nom du sponsor pour la pub au sol : une ligne jusqu'à 18
  // caractères, sinon deux lignes coupées à l'espace le plus proche du milieu.
  function floorAdLines(name) {
    if (name.length <= 18 || !name.includes(" ")) return [name];
    const words = name.split(/\s+/);
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      const d = Math.max(a.length, b.length);
      if (!best || d < best.d) best = { d, lines: [a, b] };
    }
    return best.lines;
  }

  function renderCourt(newShots) {
    const list = S.shots
      .filter(s => (ui.team === "all" || s.team == ui.team) && (ui.q === "all" || s.quarter == ui.q) && (ui.res === "all" || (ui.res === "made") === s.made))
      .sort((a, b) => a.made - b.made); // réussis dessinés par-dessus
    // Dernier tir du match (réussi ou raté) : dessiné au-dessus des autres
    // et clignotant jusqu'au tir suivant (retour utilisateur, 2026-09-26),
    // sans halo autour (« c'est moche »).
    const lastId = S.shots.length ? S.shots[S.shots.length - 1].id : null; // tirs ajoutés dans l'ordre du match
    const li = list.findIndex(s => s.id === lastId);
    if (li >= 0) list.push(list.splice(li, 1)[0]);
    let g = "";
    for (const s of list) {
      const x = s.x * 10, y = s.y * 10, c = COLOR(s.team);
      const last = s.id === lastId ? " last" : "";
      // Survol : qui a tiré (retour utilisateur 2026-10-03).
      // (infobulle maison, voir showShotTip : le title natif tardait ou ne
      // s'affichait pas, seul le curseur « ? » apparaissait).
      const tip = ` data-tip="${esc([s.shooter, s.made ? "✓" : "✗", s.clock != null ? `Q${s.quarter} ${fmtClock(s.clock)}` : ""].filter(Boolean).join(" · "))}"`;
      if (s.made) g += `<g class="made${last}"${tip}><circle class="dot" cx="${x}" cy="${y}" r="8" fill="${c}"/><circle class="hit" cx="${x}" cy="${y}" r="13" fill="transparent"/></g>`;
      else g += `<g class="miss${last}"${tip}><circle class="hit" cx="${x}" cy="${y}" r="13" fill="transparent"/><path d="M${x - 6} ${y - 6}l12 12M${x + 6} ${y - 6}l-12 12" stroke="${c}"/></g>`;
    }
    // Logo du club qui reçoit au rond central (S.courtLogo : SVG fourni par
    // le jeu, dessiné pour un cercle de 104 unités centré en 470,250).
    const court = $("court");
    // Pub du sponsor salle du club qui reçoit (S.arenaSponsor, sinon
    // « HOOP MANAGER ») peinte sur le parquet, une seule fois, au milieu du
    // terrain sous le rond central, à mi-distance entre le bas du rond
    // (y=310) et la ligne de touche (y=498) (retours utilisateur 2026-09-27 :
    // plus de bandeaux LED le long des lignes de touche, puis « trop proche
    // du bord » pour les pubs dans les coins). Au-delà de 18 caractères, le
    // nom passe sur 2 lignes.
    const cs = S.courtStyle || null;
    // Couleurs de la marque (S.arenaSponsorStyle, catalogue des sponsors) :
    // la pub est alors peinte dans un cartouche à ses couleurs.
    const hex = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
    const adStyle = S.arenaSponsor && S.arenaSponsorStyle && hex(S.arenaSponsorStyle.bg) && hex(S.arenaSponsorStyle.ink) ? S.arenaSponsorStyle : null;
    const ledKey = (S.courtLogo || "") + "|" + (S.arenaSponsor || "") + "|" + (adStyle ? adStyle.bg + adStyle.ink : "") + "|" + (cs ? [cs.floor, cs.line, cs.paint].join(",") : "");
    if (courtLogoKey !== ledKey) {
      courtLogoKey = ledKey;
      // Parquet aux couleurs du club qui reçoit (S.courtStyle, Premium) :
      // teinte du bois, lames, lignes, raquettes et rond central peints.
      court.style.background = cs ? cs.floor : "";
      court.style.setProperty("--courtLine", cs ? cs.line : "");
      if (!cs) court.style.removeProperty("--courtLine");
      let planks = "";
      if (cs) {
        for (let y = 25; y < 500; y += 25) planks += `<line x1="0" y1="${y}" x2="940" y2="${y}" stroke="${cs.grain}" stroke-width="3"/>`;
        if (cs.paint) planks += `<rect x="0" y="170" width="190" height="160" fill="${cs.paint}" opacity=".75"/><rect x="750" y="170" width="190" height="160" fill="${cs.paint}" opacity=".75"/><circle cx="470" cy="250" r="60" fill="${cs.paint}" opacity=".65"/>`;
      }
      const lines = floorAdLines((S.arenaSponsor || "HOOP MANAGER").toUpperCase());
      const ad = (cx, cy) => {
        let plate = "";
        if (adStyle) {
          const w = Math.min(340, Math.max(...lines.map(l => l.length * 17.5))) + 36, h = lines.length * 24 + 18;
          plate = `<rect class="floor-ad-plate" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="10" fill="${adStyle.bg}" opacity=".82"/>`;
        }
        return plate + lines.map((l, i) => {
          const y = cy + (i - (lines.length - 1) / 2) * 24 + 7;
          const fit = l.length * 17.5 > 320 ? ` textLength="320" lengthAdjust="spacingAndGlyphs"` : "";
          // Parquet du club : encre adaptée au bois (clair ou foncé), sauf cartouche du sponsor.
          const fill = adStyle ? adStyle.ink : cs ? floorAdInk(cs.floor) : null;
          return `<text class="floor-ad" x="${cx}" y="${y}" text-anchor="middle"${fit}${fill ? ` style="fill:${fill}"` : ""}>${esc(l)}</text>`;
        }).join("");
      };
      court.innerHTML = `<g class="floor">${planks}</g><g class="base">${COURT_BASE}</g><g class="ads">${ad(470, 404)}</g><g class="logo" opacity=".85">${S.courtLogo || ""}</g><g class="marks"></g>`;
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
      (ui.feed === "score" ? !!e.score : e.type === "quote" ? false : e.type === "foul" || e.type === "turnover");
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
      // Commentaire du présentateur (Nicolas Cosset) : avatar + nom, sans chrono.
      if (e.type === "quote") return `<li class="ev quote${newEv.has(e.id) ? " fresh" : ""}"><span class="qav">${e.avatar || ""}</span><span class="qtx"><b>${esc(e.speaker || "")}</b>${esc(e.text)}</span></li>`;
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
    const o = { pts: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 };
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
    // Titulaires : liseré jaune, comme sur les feuilles de match (retour
    // utilisateur 2026-10-03).
    const row = p => { const r = rating(p); const pos = p.onCourt && p.slot ? p.slot : p.pos; return `<tr class="${[p.onCourt ? "is-on" : "", p.starter ? "is-starter" : ""].filter(Boolean).join(" ")}">
      <td><div class="pcell">${avatar(p, "sm")}<div class="pmain">${pname(p, "pn")}<div class="psub">${pos ? `<span class="pos">${esc(pos)}</span>` : ""}${p.pf >= FOUL_OUT ? `<span class="out">Exclu</span>` : ""}</div></div></div></td>
      <td>${Math.floor(p.seconds / 60)}</td><td class="${lc(p, "pts")}">${p.pts}</td><td class="${lc(p, "reb")}">${p.reb}</td><td class="c2">${p.oreb || 0}</td><td class="${lc(p, "ast")}">${p.ast}</td>
      <td class="c2">${p.stl}</td><td class="c2">${p.blk}</td><td class="c2">${p.tov}</td><td class="${p.pf >= FOUL_OUT - 1 ? "f4" : ""}">${p.pf}</td>
      <td class="c3">${p.fg2m}/${p.fg2a}</td><td class="c3">${p.fg3m}/${p.fg3a}</td><td>${p.ftm}/${p.fta}</td><td class="${evalCls(r)}">${r}</td></tr>`; };
    const t = totals(T);
    // Ordre des postes (retour utilisateur 2026-10-03 : « trier les joueurs
    // par poste, au moins ceux sur le terrain ») : pendant le match, le
    // premier groupe est le cinq EN JEU, rangé par poste occupé ; ensuite
    // le banc, par poste puis temps de jeu. Hors direct (fin de match),
    // cinq de départ puis banc.
    // Tri par rang numérique (posRank/slotRank, indépendant de la langue :
    // les libellés courts sont traduits) ; repli sur les codes français.
    const POS_ORDER = ["M", "A", "AS", "AF", "P"];
    const rank = x => { if (typeof x === "number") return x; const i = POS_ORDER.indexOf(x); return i < 0 ? 9 : i; };
    const byPos = key => (a, b) => rank(key(a)) - rank(key(b)) || b.seconds - a.seconds;
    const posKey = p => (p.posRank != null ? p.posRank : p.pos);
    const slotKey = p => (p.slotRank != null ? p.slotRank : p.slot || posKey(p));
    const live = S.status === "live" || S.status === "halftime";
    const first = live ? played.filter(p => p.onCourt).sort(byPos(slotKey)) : played.filter(p => p.starter).sort(byPos(posKey));
    const bench = played.filter(p => !first.includes(p)).sort(byPos(posKey));
    const COLS = 14;
    $("box").style.setProperty("--tc", COLOR(ti));
    $("box").innerHTML = `<thead><tr><th>Joueur</th><th>Min</th><th>Pts</th><th>Reb</th><th class="c2" title="Rebonds offensifs">RO</th><th>PD</th>
        <th class="c2">Int</th><th class="c2">Ctr</th><th class="c2">Pdb</th><th>Fte</th><th class="c3">2 pts</th><th class="c3">3 pts</th><th>LF</th><th>Éval</th></tr></thead>
      <tbody>
        ${first.length ? `<tr class="grp"><td colspan="${COLS}">${live ? "Sur le terrain" : "Cinq de départ"}</td></tr>${first.map(row).join("")}` : ""}
        ${bench.length ? `<tr class="grp"><td colspan="${COLS}">Banc</td></tr>${bench.map(row).join("")}` : ""}
        <tr class="total"><td>Total</td><td></td><td>${t.pts}</td><td>${t.reb}</td><td class="c2">${t.oreb}</td><td>${t.ast}</td>
          <td class="c2">${t.stl}</td><td class="c2">${t.blk}</td><td class="c2">${t.tov}</td><td>${t.pf}</td>
          <td class="c3">${t.fg2m}/${t.fg2a}<span class="pct">${pct(t.fg2m, t.fg2a)}</span></td>
          <td class="c3">${t.fg3m}/${t.fg3a}<span class="pct">${pct(t.fg3m, t.fg3a)}</span></td>
          <td>${t.ftm}/${t.fta}<span class="pct">${pct(t.ftm, t.fta)}</span></td>
          <td>${played.reduce((s, p) => s + rating(p), 0)}</td></tr>
      </tbody>`;
    // Tactiques des deux équipes sous la feuille de match (retour
    // utilisateur 2026-10-03) : attaque, défense, rythme.
    const tac = S.teams.map(x => x.tactics || null);
    // Variante A (retour utilisateur 2026-10-04) : une carte par équipe,
    // même rendu que la feuille de match (matchTacticsHtml du jeu).
    const RLVL = { Lent: 1, Normal: 2, Rapide: 3 };
    const card = (x, t) => {
      const T = S.teams[t];
      const offs = x && Array.isArray(x.offenses) && x.offenses.length ? x.offenses : (x && x.offense ? [x.offense] : []);
      const lvl = RLVL[x && x.rhythm] || 0;
      const speed = lvl ? `<span class="tac-speed" aria-hidden="true">${[1, 2, 3].map(i => `<i${i <= lvl ? ' class="on"' : ""}></i>`).join("")}</span>` : "";
      const pill = (v, extra = "") => v ? `<span class="tac-pill">${extra}${esc(v)}</span>` : `<span class="tac-none">–</span>`;
      // Couleur claire (maillot blanc…) : chiffre n° 1 en foncé.
      const rgb = hexRgb(T.color || DEFAULT_COLORS[t]);
      const inkDark = rgb && luminance(rgb) > 0.6 ? ";--tc-ink:#1a1f2b" : "";
      return `<div class="tac-card" style="--tc:var(--c${t})${inkDark}"><div class="tac-head"><span class="tac-logo${T.logo ? " has-logo" : ""}">${T.logo || esc(T.short)}</span><span class="tac-name">${esc(T.name || T.short)}</span></div>` +
        `<div class="tac-body"><div class="tac-sec"><small>Attaque</small>` +
        (offs.length ? `<div class="tac-off">${offs.map((o, i) => `<div${i === 0 ? ' class="main"' : ""}><b>${i + 1}</b>${esc(o)}</div>`).join("")}</div>` : `<div class="tac-none">–</div>`) +
        `</div><div class="tac-row"><div class="tac-sec"><small>Défense</small>${pill(x && x.defense)}</div>` +
        `<div class="tac-sec"><small>Rythme</small>${pill(x && x.rhythm, speed)}</div></div></div></div>`;
    };
    $("tactics").innerHTML = tac.some(Boolean)
      ? `<div class="klbl">Tactiques</div><div class="tac-grid">${card(tac[0], 0)}${card(tac[1], 1)}</div>`
      : "";
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

  return { update, destroy, highlights };
}
