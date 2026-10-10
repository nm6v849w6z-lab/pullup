// =====================================================================
// Hoop Manager · Terrain 2D animé du match en direct (v2, « façon
// BuzzerBeater » — retour utilisateur 2026-09-30 : possession jouée en
// continu, chrono des 24 s, croix des tirs manqués, médaillons des cinq
// en jeu, porteur cerclé, parquet aux couleurs du club qui reçoit)
//
//   import { createCourt2D } from "./live/court2d.js";
//   const court = createCourt2D(hostElement, { colors: ["#F26B1D", "#3B8FE0"] });
//   court.update(state, newEventIds);   // à chaque update() de la vue live
//   court.destroy();
//
// Rien n'est simulé ici : le moteur a déjà décidé chaque action. Le terrain
// REJOUE : formations attaque/défense selon la possession, et pour l'action
// À VENIR (state.nextAction : type, équipe, acteurs, endroit du tir, heure
// de diffusion `airAt`) une possession complète calée dans le temps réel —
// remontée de balle, passes, déplacement du tireur, tir dont le ballon
// atteint le cercle exactement à `airAt`, puis le résultat quand
// l'événement arrive (panier, rebond, interception…). Le chrono des 24 s
// descend pendant la possession. Sans nextAction (pas encore connue), les
// joueurs bougent en formation et l'action se joue à l'arrivée de
// l'événement, comme en v1.
//
// Repère : celui de la carte des tirs (pieds : x 0→94 gauche→droite,
// y 0→50 haut→bas). L'équipe [0] attaque le panier de DROITE.
// =====================================================================
import { esc, floorAdInk } from "./format.js";

const RIM = [{ x: 88.75, y: 25 }, { x: 5.25, y: 25 }];   // panier visé par l'équipe t
const NS = "http://www.w3.org/2000/svg";
const PX = 10;                                            // 1 pied = 10 unités SVG
// Arène (refonte 2026-10-08) : le terrain (940 × 500) au centre d'une salle
// sombre — dégagement (apron), panneaux LED, premiers rangs de tribunes ;
// en bas, la table de marque et les deux bancs. Plus de bande de
// médaillons : le tableau d'affichage est suspendu au-dessus des tribunes.
const SIDE = 110, TOP = 96, BOT = 176;                    // décor autour du terrain
const OX = SIDE, OY = TOP;                                // origine du terrain
// Seuls ces événements donnent lieu à une possession jouée à l'avance ; les
// autres (changement, début de quart, temps mort…) se jouent à leur arrivée.
const PLANNED_KINDS = new Set(["shot", "rebound", "freeThrow", "turnover", "outOfBounds", "foul", "unsportsmanlikeFoul", "technicalFoul"]);
const VW = 940 + SIDE * 2, VH = TOP + 500 + BOT;
const SHOT_CLOCK = 24;
const FLAG_W = 34, FLAG_H = 40;                            // drapeau des tribunes (mât compris), unités de l'arène

// Postes du moteur → créneau de formation (attaque / défense).
const SLOT = { M: 0, AS: 1, A: 2, AF: 3, P: 4 };
const OFF = [{ d: 30, y: 25 }, { d: 24, y: 5 }, { d: 24, y: 45 }, { d: 14, y: 12 }, { d: 7, y: 40 }];
const DEF = [{ d: 22, y: 21 }, { d: 17, y: 9 }, { d: 17, y: 41 }, { d: 9, y: 19 }, { d: 3, y: 32 }];

// Hasard REPRODUCTIBLE (mission live 2026-10-10, « un seul live par
// match, identique après rechargement ») : avant, chaque recharge tirait
// d'autres points de rebond, d'autres coupes, d'autres sorties. Le
// générateur est re-semé à chaque action jouée (playEvent / buildPlan) et à
// chaque pas de mouvement sans ballon, à partir de l'identité de l'action
// (jamais de l'heure de diffusion, décalée en rediffusion) : même action →
// mêmes tirages, quel que soit le moment où on la regarde.
let rngState = 0x2545f491;
function rand01() {
  rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function reseed(key) {
  let h = 0x811c9dc5; const k = String(key);
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  rngState = h | 0;
}
const rnd = (a, b) => a + rand01() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};
const initials = n => n.split(/\s+/).map(w => w[0] || "").join("").slice(0, 2);
const lastName = n => { const w = n.trim().split(/\s+/); return w[w.length - 1] || n; };

function slotPos(team, slot, attacking) {
  const s = (attacking ? OFF : DEF)[slot] || OFF[0];
  const rim = RIM[attacking ? team : 1 - team];
  const dir = rim.x > 47 ? -1 : 1;
  return { x: rim.x + dir * s.d, y: s.y };
}
// Bancs (pause, mi-temps, temps mort) : de part et d'autre de la table de
// marque, au centre de la ligne de touche du bas (comme dans une vraie
// salle) — l'équipe [0] à gauche, l'équipe [1] à droite, donc jamais une
// traversée complète du terrain, et chaque équipe rejoint TOUJOURS le sien
// (retour utilisateur 2026-10-08). Les joueurs se regroupent en demi-cercle
// autour du coach (point BENCH), pas en file.
// Arène : bancs HORS du terrain, sur la ligne de touche du bas, de part et
// d'autre de la table de marque (coach debout devant, remplaçants assis).
const BENCH = [{ x: 22, y: 53.5 }, { x: 72, y: 53.5 }];
// Sièges du banc (remplaçants), du centre vers l'extérieur.
const SEAT_Y = 58.6, SEAT_DX = 3.4;
const seatPos = (team, i) => ({ x: team === 0 ? 33.5 - i * SEAT_DX : 60.5 + i * SEAT_DX, y: SEAT_Y });
function parkLine(team, i) {
  const b = BENCH[team] || BENCH[0];
  const k = Math.max(0, Math.min(6, i)) - 2;                 // -2 … 4 autour du centre
  return { x: b.x + k * 3.2, y: b.y - (k === 0 || k === 2 ? 3 : (Math.abs(k) === 1 || k === 3 ? 1 : 0)) };
}
// Temps mort (2026-10-08 : « les joueurs du banc doivent aussi se lever ») :
// regroupement autour du coach (debout devant son banc, HUDDLE_Y = COACH_Y
// de staging.js). Anneau 0 : les cinq en jeu, en demi-cercle serré ;
// anneau 1 : les remplaçants, en demi-cercle plus large derrière eux.
// Une seule géométrie pour le terrain, la mise en scène et le banc.
const HUDDLE_Y = 55;
function huddlePos(team, i, n, ring) {
  const b = BENCH[team] || BENCH[0];
  if (!ring) { const a = Math.PI * (1.12 + i * 0.19); return { x: b.x + Math.cos(a) * 6.6, y: HUDDLE_Y + Math.sin(a) * 5.6 }; }
  const a = Math.PI * (1 + (n > 1 ? i / (n - 1) : 0.5));
  return { x: b.x + Math.cos(a) * 11.4, y: HUDDLE_Y + Math.sin(a) * 9 };
}
// Table de marque : où vont les arbitres pendant les arrêts.
const TABLE = { x: 47, y: 52.4 };
const STOP_Y = 50.7;                                      // officiels debout devant la table
const STALE_EVENT_MS = 6000;                              // événement plus vieux : recalage, pas d'animation
const GAP_RESYNC_MS = 1500;                               // trou d'images au-delà duquel on recale
const THROTTLE_MS = 700;                                  // images bridées : mise en scène suspendue
const REF_BEHIND = 2.5;                                   // arbitre de fond : centre à 2,5 pieds derrière la ligne (jeton ≈ 1,6 de demi-largeur)

// Avatars rastérisés (2026-10-01, « ça semble laguer ») : dix SVG d'avatar
// complets déplacés 60 fois par seconde coûtent cher à repeindre ; on les
// convertit une fois en image bitmap (canvas) et le sprite affiche une
// <image>. Sans canvas (tests JSDOM) : SVG inline comme avant.
const rasterCache = new Map();
function rasterizeAvatar(svgHtml, w, h) {
  if (rasterCache.has(svgHtml)) return rasterCache.get(svgHtml);
  const pr = new Promise(resolve => {
    try {
      const tpl = document.createElement("template"); tpl.innerHTML = svgHtml;
      const svg = tpl.content.querySelector("svg");
      if (!svg || typeof Image === "undefined") return resolve(null);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext && canvas.getContext("2d");
      if (!ctx) return resolve(null);
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("width", String(w * 3)); svg.setAttribute("height", String(h * 3));
      const url = URL.createObjectURL(new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();
      img.onload = () => {
        try { canvas.width = w * 3; canvas.height = h * 3; ctx.drawImage(img, 0, 0, w * 3, h * 3); resolve(canvas.toDataURL("image/png")); }
        catch (e) { resolve(null); }
        URL.revokeObjectURL(url);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch (e) { resolve(null); }
  });
  rasterCache.set(svgHtml, pr);
  return pr;
}

export function createCourt2D(host, opts = {}) {
  host.classList.add("c2d");
  const now = () => (opts.now ? opts.now() : Date.now());
  // Calques (fluidité, 2026-10-08) : le navigateur repeignait TOUTE la salle
  // (parquet, tribunes, ~660 spectateurs, panneaux) à chaque image dès qu'un
  // joueur bougeait — c'était le premier coût du direct (≈ 14 images/s sur
  // un téléphone moyen). Désormais :
  //  - `bgSvg` : décor statique (salle, parquet, lignes, paniers), calque
  //    à part jamais repeint pendant le jeu ;
  //  - `crowdL` : le public en « feuilles » (une par cohorte de mouvement et
  //    par camp), animées par transformation CSS composée par la carte
  //    graphique — aucun coût par image pour le processeur ;
  //  - `svg` : ce qui bouge (joueurs, ballon, arbitres, effets, tableau).
  // Les trois partagent la même viewBox et la même boîte (placeUnder).
  const under = document.createElement("div");
  under.className = "c2d-under"; under.setAttribute("aria-hidden", "true");
  host.appendChild(under);
  const bgSvg = el("svg", { viewBox: `0 0 ${VW} ${VH}`, class: "c2d-bgsvg", focusable: "false" }, under);
  const crowdL = document.createElement("div");
  crowdL.className = "c2d-crowd";
  under.appendChild(crowdL);
  // Drapeaux des tribunes (2026-10-09) : jamais tout à fait immobiles
  // (flottement léger permanent), agités sur les grands moments. Chaque
  // tissu est un petit élément HTML animé par transformation CSS (composé
  // par la carte graphique, aucun coût par image pour le processeur).
  const flagsL = document.createElement("div");
  flagsL.className = "c2d-flags";
  under.appendChild(flagsL);
  const flags = [];   // { el, x, y, side } (x, y : arène, pied du mât)
  // Bancs (remplaçants) et coachs : calque à part, repeint seulement quand
  // un remplaçant change (énergie, faute, changement) ou qu'un coach bouge.
  const benchSvg = el("svg", { viewBox: `0 0 ${VW} ${VH}`, class: "c2d-benchsvg", focusable: "false" }, under);
  const benchLayer = el("g", { transform: `translate(${OX} ${OY})` }, benchSvg);
  const svg = el("svg", { viewBox: `0 0 ${VW} ${VH}`, class: "c2d-svg", role: "img", "aria-label": "Terrain animé du match" }, host);
  const defs = el("defs", {}, svg);
  // Téléphone (2026-10-08) : si la salle ne tient pas, on rogne les
  // tribunes — jamais le terrain, la table ni les bancs.
  let viewBox = `0 0 ${VW} ${VH}`;
  const fitView = () => {
    const w = host.clientWidth || 0;
    viewBox = w && w < 640 ? `${OX - 70} 0 ${940 + 140} ${OY + 616}` : `0 0 ${VW} ${VH}`;
    for (const s of [svg, bgSvg, benchSvg, ...crowdL.children]) if (s.getAttribute("viewBox") !== viewBox) s.setAttribute("viewBox", viewBox);
    placeFlags();
    placeUnder();
  };
  // Le décor suit exactement la boîte du terrain animé (plein écran,
  // paysage centré…) : lecture de mise en page au redimensionnement
  // seulement, jamais pendant l'animation.
  function placeUnder() {
    if (typeof svg.getBoundingClientRect !== "function") return;
    const r = svg.getBoundingClientRect(), h = host.getBoundingClientRect();
    if (!r.width) return;
    const st = under.style, l = r.left - h.left - (host.clientLeft || 0), t = r.top - h.top - (host.clientTop || 0);
    st.left = l.toFixed(2) + "px"; st.top = t.toFixed(2) + "px"; st.width = r.width.toFixed(2) + "px"; st.height = r.height.toFixed(2) + "px";
    if (showCv) { const cs = showCv.style; cs.left = st.left; cs.top = st.top; cs.width = st.width; cs.height = st.height; }
  }
  // Calque canvas des shows (showfx.js, 2026-10-09) : créé à la demande de
  // la mise en scène, posé exactement sur le terrain animé, retiré après.
  let showCv = null;
  // Drapeaux : position en % de la boîte (suit le rognage téléphone).
  // Boîte plus large (ou plus haute) que le dessin — plein écran sur un
  // écran large, paysage : le terrain est centré (« meet ») avec des bandes
  // vides ; les drapeaux suivent le DESSIN, pas la boîte (retour
  // 2026-10-09 : drapeaux « dans le vide », hors des tribunes).
  function placeFlags() {
    const [vx, vy, vw, vh] = viewBox.split(/\s+/).map(Number);
    // Vue recadrée (téléphone) : un drapeau qui sortirait du dessin est
    // masqué plutôt que coupé au bord.
    for (const f of flags) f.el.style.display = f.x < vx || f.x + FLAG_W > vx + vw || f.y - FLAG_H < vy || f.y > vy + vh ? "none" : "";
    let W = 0, H = 0;
    try { const r = svg.getBoundingClientRect(); W = r.width; H = r.height; } catch (e) { /* pas de mise en page */ }
    if (W > 0 && H > 0) {
      const k = Math.min(W / vw, H / vh), ox = (W - vw * k) / 2, oy = (H - vh * k) / 2;
      for (const f of flags) {
        const st = f.el.style;
        st.left = (ox + (f.x - vx) * k).toFixed(2) + "px"; st.top = (oy + (f.y - FLAG_H - vy) * k).toFixed(2) + "px";
        st.width = (FLAG_W * k).toFixed(2) + "px"; st.height = (FLAG_H * k).toFixed(2) + "px";
      }
      return;
    }
    for (const f of flags) {
      const st = f.el.style;
      st.left = ((f.x - vx) / vw * 100).toFixed(3) + "%"; st.top = ((f.y - FLAG_H - vy) / vh * 100).toFixed(3) + "%";
      st.width = (FLAG_W / vw * 100).toFixed(3) + "%"; st.height = (FLAG_H / vh * 100).toFixed(3) + "%";
    }
  }
  fitView();
  let ro = null;
  // Recadrage à l'image suivante (2026-10-09) : fitView change la taille du
  // terrain observé ; appelé DANS le callback, il relançait l'observateur
  // dans la même image (« ResizeObserver loop completed with undelivered
  // notifications », pris pour une erreur fatale par le jeu — retour de la
  // carte des tirs en plein écran sur téléphone).
  let fitRaf = 0;
  const fitSoon = () => {
    if (fitRaf) return;
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : f => setTimeout(f, 16);
    fitRaf = raf(() => { fitRaf = 0; if (!destroyed) fitView(); });
  };
  try { if (typeof ResizeObserver === "function") { ro = new ResizeObserver(fitSoon); ro.observe(host); ro.observe(svg); } } catch (e) { /* rien */ }
  const uid = "c2d" + Math.random().toString(36).slice(2, 7);

  // --- fond : public, parquet ---
  const crowd = el("pattern", { id: uid + "-cw", width: "23", height: "19", patternUnits: "userSpaceOnUse" }, defs);
  [["4", "5", "#26375a"], ["15", "3", "#1f2c48"], ["10", "13", "#33243a"], ["20", "15", "#273a52"], ["1", "16", "#3a2b1e"]].forEach(([x, y, c]) => el("circle", { cx: x, cy: y, r: "2.4", fill: c }, crowd));
  const vign = el("radialGradient", { id: uid + "-vg", cx: "50%", cy: "55%", r: "70%" }, defs);
  el("stop", { offset: ".6", "stop-color": "#000", "stop-opacity": "0" }, vign);
  el("stop", { offset: "1", "stop-color": "#000", "stop-opacity": ".6" }, vign);
  // Éclairage de salle (2026-10-08) : un éclairage général chaud, trois
  // nappes de projecteurs (au-dessus de chaque raquette et du rond central)
  // et un assombrissement des bords — des dégradés statiques, sans filtre,
  // donc sans coût par image.
  const light = el("radialGradient", { id: uid + "-lt", cx: "50%", cy: "46%", r: "64%" }, defs);
  el("stop", { offset: "0", "stop-color": "#fff3dc", "stop-opacity": ".2" }, light);
  el("stop", { offset: ".55", "stop-color": "#fff3dc", "stop-opacity": ".04" }, light);
  el("stop", { offset: "1", "stop-color": "#000", "stop-opacity": ".38" }, light);
  const spot = el("radialGradient", { id: uid + "-sp", cx: "50%", cy: "50%", r: "50%" }, defs);
  el("stop", { offset: "0", "stop-color": "#fff8e8", "stop-opacity": ".22" }, spot);
  el("stop", { offset: ".5", "stop-color": "#fff8e8", "stop-opacity": ".07" }, spot);
  el("stop", { offset: "1", "stop-color": "#fff8e8", "stop-opacity": "0" }, spot);
  const glow = el("radialGradient", { id: uid + "-gl", cx: "50%", cy: "50%", r: "50%" }, defs);
  el("stop", { offset: "0", "stop-color": "#ffe9b8", "stop-opacity": ".10" }, glow);
  el("stop", { offset: "1", "stop-color": "#ffe9b8", "stop-opacity": "0" }, glow);
  // Décor statique de la salle (tribunes, apron, LED, table, bancs) : dessiné
  // une fois par club qui reçoit (drawArena), jamais par image.
  el("rect", { width: VW, height: VH, fill: "#04060b" }, bgSvg);
  const arenaG = el("g", { transform: `translate(${OX} ${OY})`, class: "c2d-arena" }, bgSvg);
  const floor = el("g", { transform: `translate(${OX} ${OY})` }, bgSvg);
  const floorBase = el("g", {}, floor);          // parquet + zones (redessiné selon le club)
  // Lumière des projecteurs posée SUR le parquet, SOUS les lignes et les joueurs.
  const lightG = el("g", { class: "c2d-light" }, floor);
  [[190, 250, 330], [750, 250, 330], [470, 250, 260]].forEach(([cx, cy, r]) => el("ellipse", { cx, cy, rx: r, ry: r * 0.78, fill: `url(#${uid}-sp)` }, lightG));
  el("rect", { width: "940", height: "500", rx: "8", fill: `url(#${uid}-lt)` }, lightG);
  // Halo des projecteurs qui déborde sur les gradins, au-dessus de chaque panier.
  [[52, 250], [888, 250]].forEach(([cx, cy]) => el("ellipse", { cx, cy, rx: 150, ry: 110, fill: `url(#${uid}-gl)` }, lightG));
  // Parquet vernis : reflets des projecteurs du plafond (taches allongées)
  // et reflet doux du logo central — calques statiques semi-transparents.
  const gloss = el("radialGradient", { id: uid + "-gs", cx: "50%", cy: "50%", r: "50%" }, defs);
  el("stop", { offset: "0", "stop-color": "#ffffff", "stop-opacity": ".11" }, gloss);
  el("stop", { offset: "1", "stop-color": "#ffffff", "stop-opacity": "0" }, gloss);
  [[150, 70], [320, 60], [620, 60], [790, 70], [210, 440], [730, 440]].forEach(([cx, cy]) => el("ellipse", { cx, cy, rx: 46, ry: 13, fill: `url(#${uid}-gs)`, class: "c2d-gloss" }, lightG));
  el("ellipse", { cx: 470, cy: 300, rx: 70, ry: 22, fill: `url(#${uid}-gs)`, opacity: ".7" }, lightG);
  const lines = el("g", { class: "c2d-lines", fill: "none", stroke: "rgba(255,255,255,.88)", "stroke-width": "2.5" }, floor);
  el("rect", { x: "2", y: "2", width: "936", height: "496", rx: "4" }, lines);
  el("line", { x1: "470", y1: "2", x2: "470", y2: "498" }, lines);
  el("circle", { cx: "470", cy: "250", r: "60" }, lines);
  [false, true].forEach(flip => {
    const X = x => (flip ? 940 - x : x), sw = flip ? 0 : 1;
    el("rect", { x: flip ? 750 : 0, y: "170", width: "190", height: "160" }, lines);
    el("circle", { cx: X(190), cy: "250", r: "60" }, lines);
    el("path", { d: `M${X(0)} 30 L${X(141.5)} 30 A237.5 237.5 0 0 ${sw} ${X(141.5)} 470 L${X(0)} 470` }, lines);
    el("path", { d: `M${X(52)} 210 A40 40 0 0 ${sw} ${X(52)} 290` }, lines);
  });
  // Paniers vus de dessus (2026-10-08) : ombre douce, support derrière la
  // ligne de fond, planche, cercle et filet — un dégradé radial pour
  // l'ombre (pas de filtre : aucun coût par image).
  const hoopSh = el("radialGradient", { id: uid + "-hs", cx: "50%", cy: "50%", r: "50%" }, defs);
  el("stop", { offset: "0", "stop-color": "#000", "stop-opacity": ".42" }, hoopSh);
  el("stop", { offset: "1", "stop-color": "#000", "stop-opacity": "0" }, hoopSh);
  const hoopsG = el("g", { class: "c2d-hoops" }, floor);
  // Ombre douce sous chaque jeton (dégradé, pas de filtre).
  const tokSh = el("radialGradient", { id: uid + "-ts", cx: "50%", cy: "50%", r: "50%" }, defs);
  el("stop", { offset: "0", "stop-color": "#000", "stop-opacity": ".5" }, tokSh);
  el("stop", { offset: ".65", "stop-color": "#000", "stop-opacity": ".22" }, tokSh);
  el("stop", { offset: "1", "stop-color": "#000", "stop-opacity": "0" }, tokSh);
  [false, true].forEach(flip => {
    const X = x => (flip ? 940 - x : x), RX = (x, w) => (flip ? 940 - x - w : x);
    const g = el("g", { class: "c2d-hoop" }, hoopsG);
    el("ellipse", { cx: X(50), cy: "262", rx: "34", ry: "24", fill: `url(#${uid}-hs)` }, g);
    el("rect", { x: RX(-40, 24), y: "234", width: "24", height: "32", rx: "5", fill: "#1d2533", stroke: "#0b1018", "stroke-width": "1.5" }, g);
    el("rect", { x: RX(-18, 54), y: "245", width: "54", height: "10", rx: "3", fill: "#3a4457", stroke: "#0b1018", "stroke-width": "1" }, g);
    el("rect", { x: RX(34, 7), y: "213", width: "7", height: "74", rx: "2", fill: "#f4f6f9", stroke: "#9aa3b2", "stroke-width": "1.2" }, g);
    el("rect", { x: RX(41, 4), y: "247", width: "4", height: "6", fill: "#8b94a3" }, g);
    el("circle", { cx: X(52), cy: "250", r: "8.6", fill: "rgba(255,255,255,.22)" }, g);
    const net = el("g", { stroke: "rgba(255,255,255,.85)", "stroke-width": ".9", fill: "none" }, g);
    el("circle", { cx: X(52), cy: "250", r: "4.2" }, net);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, c = Math.cos(a), sn = Math.sin(a); el("line", { x1: (X(52) + c * 4.2).toFixed(1), y1: (250 + sn * 4.2).toFixed(1), x2: (X(52) + c * 8.4).toFixed(1), y2: (250 + sn * 8.4).toFixed(1) }, net); }
    el("circle", { cx: X(52), cy: "250", r: "10.4", fill: "none", stroke: "rgba(0,0,0,.35)", "stroke-width": "1" }, g);
    el("circle", { cx: X(52), cy: "250", r: "9", fill: "none", stroke: "#F5A13A", "stroke-width": "2.8", class: "c2d-rim" }, g);
  });
  const logoG = el("g", { class: "c2d-logo", opacity: ".8" }, floor);
  const adTop = el("text", { x: "470", y: "50", class: "c2d-ad", "text-anchor": "middle" }, floor);
  const adBot = el("text", { x: "470", y: "472", class: "c2d-ad", "text-anchor": "middle" }, floor);
  // Tirs manqués : plus aucune marque sur le terrain (retour utilisateur
  // 2026-10-08 : la carte des tirs les montre déjà) — ni croix, ni onde
  // rouge au cercle, ni texte ; seule l'action est jouée (tir, rebond).

  // Parquet : bois + bordeaux par défaut, ou parquet du club qui reçoit
  // (state.courtStyle : floor, grain, line, paint — Premium).
  // Sans parquet Premium (2026-10-08) : raquettes et zones à 3 points aux
  // couleurs de l'équipe qui reçoit (homeColor), lattes au ton légèrement
  // alterné (grain), le tout dessiné une fois par changement de style.
  let floorKey = null;
  function drawFloor(cs, homeColor) {
    const key = cs ? [cs.floor, cs.grain, cs.line, cs.paint].join("|") : "default|" + (homeColor || "");
    if (key === floorKey) return;
    floorKey = key;
    floorBase.innerHTML = "";
    const wood = cs ? cs.floor : "#cf9a55", grain = cs ? cs.grain : "#c6904b";
    // Pub peinte : encre adaptée au bois (lisible sur parquet clair ET foncé).
    adTop.style.fill = adBot.style.fill = floorAdInk(wood);
    const paint = cs && cs.paint ? cs.paint : (cs ? null : (homeColor || "rgba(118,30,56,.55)"));
    el("rect", { width: "940", height: "500", rx: "8", fill: wood }, floorBase);
    // Lattes : une sur trois un peu plus sombre, une sur cinq un peu plus claire.
    for (let y = 0, i = 0; y < 500; y += 14, i++) {
      if (i % 3 === 1) el("rect", { y, width: "940", height: "14", fill: "#000", opacity: ".035" }, floorBase);
      else if (i % 5 === 3) el("rect", { y, width: "940", height: "14", fill: "#fff", opacity: ".035" }, floorBase);
    }
    for (let y = 14; y < 500; y += 14) el("rect", { y, width: "940", height: "1", fill: grain, opacity: ".9" }, floorBase);
    for (let y = 0; y < 500; y += 14) for (let x = (y / 14) % 2 ? 45 : 0; x < 940; x += 90) el("rect", { x, y, width: "1", height: "14", fill: grain, opacity: ".7" }, floorBase);
    if (paint) {
      const home = !cs && !!homeColor;
      [false, true].forEach(flip => {
        const X = x => (flip ? 940 - x : x), sw = flip ? 0 : 1;
        el("path", { d: `M${X(0)} 30 L${X(141.5)} 30 A237.5 237.5 0 0 ${sw} ${X(141.5)} 470 L${X(0)} 470 Z`, fill: paint, opacity: cs ? ".55" : home ? ".26" : "1" }, floorBase);
        el("rect", { x: flip ? 750 : 0, y: "170", width: "190", height: "160", fill: paint, opacity: cs ? ".85" : home ? ".55" : ".9" }, floorBase);
      });
      if (cs) el("circle", { cx: "470", cy: "250", r: "60", fill: paint, opacity: ".65" }, floorBase);
    }
    lines.setAttribute("stroke", cs ? cs.line : "rgba(255,255,255,.88)");
  }
  drawFloor(null);

  // ---------- arène (décor statique, 2026-10-08) ----------
  // Couleurs paramétrables par club qui reçoit : state.arena = { apron,
  // seats, led, fill (0-1, remplissage des tribunes), boards: [textes] } ;
  // à défaut, dérivées de la couleur du club et de l'humeur des supporters.
  const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || "")); const n = m ? parseInt(m[1], 16) : 0x888888; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (a, b, k) => { const A = hexRgb(a), B = hexRgb(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, "0")).join(""); };
  const fanSheets = [];   // { el, side } : feuilles du public (calques composés)
  let arenaKey = null;
  function drawArena(home, arena, homeName, awayColor) {
    const a = arena || {};
    const fill = Math.max(0.15, Math.min(1, typeof a.fill === "number" ? a.fill : 0.82));
    const key = [home, awayColor, a.apron, a.seats, a.led, fill, (a.boards || []).join("/"), homeName].join("|");
    if (key === arenaKey) return;
    arenaKey = key;
    arenaG.innerHTML = ""; crowdL.innerHTML = ""; fanSheets.length = 0;
    const apron = a.apron || mix(home, "#3a2616", 0.8);
    const seat = a.seats || mix(home, "#0d1018", 0.72);
    const led = a.led || home;
    // Tribunes : un fond de sièges (motif), puis des spectateurs (premiers
    // rangs) en sections qui oscillent légèrement (CSS, décalées).
    const pat = el("pattern", { id: uid + "-seat", width: "15", height: "14", patternUnits: "userSpaceOnUse" }, defs);
    el("rect", { width: "15", height: "14", fill: "#07090f" }, pat);
    el("rect", { x: "2", y: "3", width: "11", height: "9", rx: "2.5", fill: seat }, pat);
    el("rect", { x: -OX, y: -OY, width: VW, height: VH, fill: `url(#${uid}-seat)` }, arenaG);
    const rnd01 = (() => { let k = 0; for (const ch of key) k = (k * 31 + ch.charCodeAt(0)) >>> 0; return () => { k = (k * 1664525 + 1013904223) >>> 0; return k / 4294967296; }; })();
    const skins = ["#f1c7a3", "#d9a47c", "#b97d55", "#8d5a3b", "#5e3b26", "#e8b48f"];
    const shirts = ["#2b3445", "#3b4252", "#5a6170", "#e9e4da", "#273a5a", "#4a3b35", awayColor || "#3B8FE0"];
    // Spectateurs (retour utilisateur 2026-10-08 : « pas de simples points
    // décoratifs ») : chacun est un petit personnage (corps, tête, bras) dans
    // une cohorte tirée au hasard (12) — les voisins ne bougent jamais en
    // même temps. Supporter du club qui reçoit (h), visiteur (a) ou neutre
    // (n) : les réactions (crowdReact) dépendent de l'équipe qui marque.
    // Fluidité (2026-10-08) : chaque cohorte de mouvement (2 balancements,
    // 1 déplacement latéral, immobiles) × camp (h, a, n) est une feuille
    // <svg> à part, animée EN BLOC par la carte graphique (transformation
    // CSS) ; les réactions animent les feuilles du camp concerné. Les neutres
    // immobiles restent dans le décor statique. L'assombrissement des
    // tribunes vers l'extérieur est appliqué aux couleurs des spectateurs des
    // feuilles (elles sont au-dessus du dégradé du décor).
    const MOTION = ["ba", "st", "sh", "st", "bb", "st", "st", "bb", "st", "sh", "st", "st"];   // cohorte c0…c11 → mouvement
    // Un spectateur = bras, corps, tête ; ils sont regroupés en UN tracé par
    // couleur et par feuille (≈ 20 formes par feuille au lieu de ~360), le
    // navigateur n'a plus des centaines d'éléments à parcourir par image.
    const buckets = new Map();   // clé de feuille → { side, motion, arms: Map, bodies: Map, heads: Map, n }
    const bucketOf = (side, motion) => {
      const key = side === "n" && motion === "st" ? "bg" : side + motion;
      if (!buckets.has(key)) buckets.set(key, { key, side, motion, arms: new Map(), bodies: new Map(), heads: new Map(), n: 0 });
      return buckets.get(key);
    };
    const add = (m, color, d) => m.set(color, (m.get(color) || "") + d);
    const ell = (cx, cy, rx, ry) => `M${(cx - rx).toFixed(1)} ${cy.toFixed(1)}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
    // Assombrissement des tribunes vers l'extérieur (même dégradé que le
    // rectangle « -af » du décor) appliqué aux couleurs des spectateurs des
    // feuilles, qui sont au-dessus de ce dégradé ; 8 paliers.
    const fadeAt = (x, y) => {
      const d = Math.hypot((x + OX) / VW - 0.5, (y + OY) / VH - 0.47) / 0.62;
      const f = d <= 0.62 ? 0 : d <= 0.86 ? (d - 0.62) / 0.24 * 0.55 : Math.min(0.92, 0.55 + (d - 0.86) / 0.14 * 0.37);
      return Math.round(f * 8) / 8;
    };
    let fanCount = 0;
    const fan = (x, y) => {
      if (rnd01() > fill) return;
      const r = rnd01();
      const side = r < 0.48 ? "h" : r < 0.56 ? "n" : r < 0.62 ? "a" : (rnd01() < 0.7 ? "h" : "n");
      let shirt = side === "h" && r < 0.48 ? home : side === "a" ? (awayColor || "#3B8FE0") : r < 0.56 ? "#ffffff" : shirts[Math.floor(rnd01() * (shirts.length - 1))];
      let skin = skins[Math.floor(rnd01() * skins.length)];
      const c = Math.floor(rnd01() * 12), b = bucketOf(side, MOTION[c]);
      if (b.key !== "bg") { const f = fadeAt(x, y); if (f > 0) { shirt = mix(shirt, "#000000", f); skin = mix(skin, "#000000", f); } }
      add(b.arms, skin, `M${(x - 5).toFixed(1)} ${(y + 1).toFixed(1)}l-2.6 -7M${(x + 5).toFixed(1)} ${(y + 1).toFixed(1)}l2.6 -7`);
      add(b.bodies, shirt, ell(x, y + 3, 6.6, 4.2));
      add(b.heads, skin, ell(x, y - 0.8, 3.7, 3.7));
      b.n++; fanCount++;
    };
    // Haut : 3 rangs ; bas : 2 rangs ; côtés : 2 colonnes.
    for (let row = 0; row < 3; row++) for (let x = -OX + 9; x < 940 + OX - 4; x += 17) fan(x + (row % 2) * 8, -55 - row * 16);
    for (let row = 0; row < 3; row++) for (let x = -OX + 9; x < 940 + OX - 4; x += 17) fan(x + (row % 2) * 8, 640 + row * 16);
    // Côtés : les spectateurs (calques au-dessus du décor) ne débordent pas
    // sur le texte des panneaux LED du haut et du bas.
    for (let col = 0; col < 3; col++) for (let y = -24; y < 600; y += 16) { fan(-60 - col * 17, y + (col % 2) * 8); fan(1000 + col * 17, y + (col % 2) * 8); }
    // Feuilles : le décor (neutres immobiles) puis une feuille <svg> par
    // cohorte de mouvement × camp, animée en bloc (CSS, carte graphique).
    for (const b of buckets.values()) {
      let g;
      if (b.key === "bg") g = el("g", { class: "fans-still" }, arenaG);
      else {
        const sv = el("svg", { viewBox, class: `c2d-fans m-${b.motion} s-${b.side}`, focusable: "false", "data-fans": String(b.n) }, crowdL);
        g = el("g", { transform: `translate(${OX} ${OY})` }, sv);
        fanSheets.push({ el: sv, side: b.side, motion: b.motion, anim: null });
      }
      if (b.key !== "bg") {   // les neutres immobiles ne lèvent jamais les bras
        const armsG = el("g", { class: "arms", fill: "none", "stroke-width": "2.3", "stroke-linecap": "round" }, g);
        for (const [col, d] of b.arms) el("path", { d, stroke: col }, armsG);
      }
      for (const [col, d] of b.bodies) el("path", { d, fill: col }, g);
      for (const [col, d] of b.heads) el("path", { d, fill: col }, g);
    }
    crowdL.setAttribute("data-fans", String(fanCount));
    buildFlags(home, awayColor, rnd01, fill);
    // Les tribunes se fondent dans le noir vers l'extérieur.
    const fade = el("radialGradient", { id: uid + "-af", cx: "50%", cy: "47%", r: "62%" }, defs);
    el("stop", { offset: ".62", "stop-color": "#000", "stop-opacity": "0" }, fade);
    el("stop", { offset: ".86", "stop-color": "#000", "stop-opacity": ".55" }, fade);
    el("stop", { offset: "1", "stop-color": "#000", "stop-opacity": ".92" }, fade);
    el("rect", { x: -OX, y: -OY, width: VW, height: VH, fill: `url(#${uid}-af)` }, arenaG);
    // Panneaux LED autour du dégagement.
    const ledG = el("g", { class: "c2d-led" }, arenaG);
    const boards = (a.boards && a.boards.length ? a.boards : [homeName, "HOOP MANAGER", homeName, "PULL UP"]).map(t => String(t || "").toUpperCase()).filter(Boolean);
    // Textes des panneaux (2026-10-08, « le nom passe sous la barrière »
    // dans un coin) : chaque panneau est découpé en emplacements égaux, un
    // texte centré par emplacement, resserré s'il est plus long que lui, et
    // découpé au cadre de SON panneau — jamais de débordement sur le
    // panneau voisin, quelle que soit la longueur du nom.
    let stripN = 0;
    const strip = (x, y, w, h, vertical) => {
      el("rect", { x, y, width: w, height: h, fill: "#06080d", stroke: "#1a2030", "stroke-width": "1" }, ledG);
      el("rect", { x: x + 1, y: y + 1, width: w - 2, height: h - 2, fill: led, opacity: ".16" }, ledG);
      const cid = `${uid}-led${++stripN}`;
      el("rect", { x: x + 1, y: y + 1, width: w - 2, height: h - 2 }, el("clipPath", { id: cid }, ledG));
      const txtG = el("g", { "clip-path": `url(#${cid})` }, ledG);
      const len = vertical ? h : w, pad = 14;
      const n = Math.max(1, Math.round((len - 2 * pad) / 230)), slot = (len - 2 * pad) / n;
      for (let i = 0; i < n; i++) {
        const c = pad + slot * (i + 0.5);
        // Vertical : la ligne de base est décalée d'une demi-hauteur de lettre pour centrer le texte dans le panneau.
        const tx = vertical ? x + w / 2 + (x < 0 ? 3.2 : -3.2) : x + c, ty = vertical ? y + c : y + h / 2 + 3.5;
        const label = boards[i % boards.length];
        const est = label.length * 8.4, room = slot - 24;    // ≈ 8,4 unités par lettre (9 px, gras, espacées)
        const t = el("text", { x: tx, y: ty, "text-anchor": "middle", class: "c2d-led-txt", fill: i % 2 ? "#ffffff" : mix(led, "#ffffff", 0.35), "data-no-i18n": "1",
          ...(est > room ? { textLength: room.toFixed(0), lengthAdjust: "spacingAndGlyphs" } : {}),
          ...(vertical ? { transform: `rotate(${x < 0 ? -90 : 90} ${tx} ${ty})` } : {}) }, txtG);
        t.textContent = label;
      }
    };
    strip(-42, -44, 1024, 11, false);
    strip(-53, -44, 11, 673, true);
    strip(982, -44, 11, 673, true);
    strip(-42, 618, 1024, 11, false);
    // Dégagement (apron) : couleur de la salle, éclairé par le haut.
    el("rect", { x: -42, y: -33, width: 1024, height: 651, fill: apron }, arenaG);
    const ap = el("radialGradient", { id: uid + "-ap", cx: "50%", cy: "45%", r: "60%" }, defs);
    el("stop", { offset: "0", "stop-color": "#fff3dc", "stop-opacity": ".10" }, ap);
    el("stop", { offset: ".7", "stop-color": "#000", "stop-opacity": ".05" }, ap);
    el("stop", { offset: "1", "stop-color": "#000", "stop-opacity": ".45" }, ap);
    el("rect", { x: -42, y: -33, width: 1024, height: 651, fill: `url(#${uid}-ap)` }, arenaG);
    // Supports des paniers (base rembourrée) derrière les lignes de fond.
    [false, true].forEach(flip => {
      const X = (x, w = 0) => (flip ? 940 - x - w : x);
      el("ellipse", { cx: X(-24), cy: "254", rx: "20", ry: "34", fill: "#000", opacity: ".35" }, arenaG);
      el("rect", { x: X(-40, 28), y: "222", width: "28", height: "56", rx: "8", fill: mix(home, "#000000", 0.35), stroke: "#0b0f17", "stroke-width": "1.5" }, arenaG);
      el("rect", { x: X(-35, 18), y: "228", width: "18", height: "44", rx: "5", fill: mix(home, "#ffffff", 0.08), opacity: ".85" }, arenaG);
    });
    // Table de marque, au centre de la ligne de touche du bas.
    el("rect", { x: "376", y: "520", width: "188", height: "40", rx: "5", fill: "#000", opacity: ".35" }, arenaG);
    el("rect", { x: "372", y: "512", width: "196", height: "38", rx: "5", fill: "#141a25", stroke: "#0a0d14", "stroke-width": "1.5" }, arenaG);
    el("rect", { x: "376", y: "514", width: "188", height: "9", rx: "2", fill: "#06080d" }, arenaG);
    el("rect", { x: "377", y: "515", width: "186", height: "7", rx: "2", fill: led, opacity: ".35" }, arenaG);
    const tt = el("text", { x: "470", y: "521", "text-anchor": "middle", class: "c2d-led-txt small", fill: "#fff", "data-no-i18n": "1" }, arenaG); tt.textContent = String(homeName || "HOOP MANAGER").toUpperCase();
    for (let i = 0; i < 6; i++) { el("rect", { x: 392 + i * 28, y: "530", width: "16", height: "10", rx: "2", fill: "#2a3343" }, arenaG); el("rect", { x: 394 + i * 28, y: "532", width: "12", height: "6", rx: "1", fill: "#7fb1ff", opacity: ".35" }, arenaG); }
    // Chaises des bancs (une par place).
    [0, 1].forEach(t => {
      const col = t === 0 ? home : (awayColor || "#3B8FE0");
      for (let i = 0; i < 9; i++) {
        const p = seatPos(t, i);
        el("rect", { x: (p.x * PX - 13).toFixed(1), y: (p.y * PX + 2).toFixed(1), width: "26", height: "15", rx: "4", fill: mix(col, "#000000", 0.45), stroke: "#05070c", "stroke-width": "1" }, arenaG);
        el("rect", { x: (p.x * PX - 13).toFixed(1), y: (p.y * PX + 14).toFixed(1), width: "26", height: "4", rx: "2", fill: mix(col, "#000000", 0.65) }, arenaG);
      }
    });
    // Le terrain déborde de lumière sur le dégagement.
    const spill = el("radialGradient", { id: uid + "-spl", cx: "50%", cy: "50%", r: "50%" }, defs);
    el("stop", { offset: "0", "stop-color": "#ffe9c4", "stop-opacity": ".12" }, spill);
    el("stop", { offset: "1", "stop-color": "#ffe9c4", "stop-opacity": "0" }, spill);
    el("ellipse", { cx: "470", cy: "250", rx: "640", ry: "420", fill: `url(#${uid}-spl)` }, arenaG);
  }
  // Drapeaux : surtout ceux du club qui reçoit, quelques-uns des visiteurs
  // (dans leur coin) ; jamais devant le tableau d'affichage. Tissu à deux
  // bandes (couleur du club + liseré clair), mât fin ; durée et phase du
  // flottement propres à chaque drapeau (jamais à l'unisson).
  function buildFlags(home, awayColor, rnd01, fill) {
    flagsL.innerHTML = ""; flags.length = 0;
    const away = awayColor || "#3B8FE0";
    const spots = [];
    // Haut (évite le tableau : x terrain 330–610), bas, côtés.
    for (const x of [-70, 40, 150, 250, 690, 790, 900, 1000]) spots.push([x, -50]);
    for (const x of [-40, 90, 230, 380, 560, 710, 850, 980]) spots.push([x, 672]);
    for (const y of [40, 230, 430]) { spots.push([-80, y]); spots.push([996, y]); }
    spots.forEach(([x, y]) => {
      if (rnd01() > fill + 0.15) return;                       // tribunes clairsemées : moins de drapeaux
      const side = (x > 940 && y < 300) || (y > 600 && x > 900) ? "a" : "h";   // un coin des visiteurs
      const col = side === "a" ? away : home;
      const light = mix(col, "#ffffff", 0.82);
      const ax = x + OX + (rnd01() - 0.5) * 14, ay = y + OY + (rnd01() - 0.5) * 6;
      const f = document.createElement("div");
      f.className = "c2d-flag s-" + side;
      const d1 = (1.4 + rnd01() * 1.1).toFixed(2), d2 = (0.55 + rnd01() * 0.35).toFixed(2), dl = (-rnd01() * 3).toFixed(2);
      f.style.setProperty("--fd", d1 + "s"); f.style.setProperty("--fw", d2 + "s"); f.style.setProperty("--fdl", dl + "s");
      f.innerHTML = `<svg class="pole" viewBox="0 0 ${FLAG_W} ${FLAG_H}" preserveAspectRatio="none" aria-hidden="true"><path d="M2.2 1.5V${FLAG_H}" stroke="#c9ccd3" stroke-width="1.6" stroke-linecap="round"/><circle cx="2.2" cy="1.6" r="1.4" fill="#e8e2d0"/></svg>` +
        `<div class="cloth"><svg viewBox="0 0 30 18" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0H30V18H0Z" fill="${col}"/><path d="M0 7H30V11H0Z" fill="${light}"/><path d="M0 0H30" stroke="rgba(255,255,255,.25)" stroke-width="1.2"/><path d="M0 18H30" stroke="rgba(0,0,0,.3)" stroke-width="1.4"/></svg></div>`;
      flagsL.appendChild(f);
      flags.push({ el: f, x: ax, y: ay, side });
    });
    flagsL.setAttribute("data-flags", String(flags.length));
    placeFlags();
  }
  // Grand moment : les drapeaux du camp concerné s'agitent fort (classe
  // posée le temps du moment) ; « show » (entrée, shows) : agitation moyenne.
  let flagTimer = 0;
  function flagsWave(side, level, ms) {
    if (reducedMotion) return;
    flagsL.classList.remove("wave-h", "wave-a", "wave-all", "lvl-1", "lvl-2");
    void flagsL.offsetWidth;
    flagsL.classList.add(side === "all" ? "wave-all" : "wave-" + side, "lvl-" + level);
    clearTimeout(flagTimer);
    flagTimer = setTimeout(() => flagsL.classList.remove("wave-h", "wave-a", "wave-all", "lvl-1", "lvl-2"), ms);
  }

  // Ambiance lumineuse : « show » (entrée des joueurs, shows des temps
  // morts) = salle tamisée + projecteurs mobiles ; flash sur un gros panier.
  const ambG = el("g", { class: "c2d-amb", opacity: "0" }, svg);
  el("rect", { width: VW, height: VH, fill: "#02030a", opacity: ".5" }, ambG);
  const beamGr = el("radialGradient", { id: uid + "-bm", cx: "50%", cy: "50%", r: "50%" }, defs);
  el("stop", { offset: "0", "stop-color": "#fff6dd", "stop-opacity": ".55" }, beamGr);
  el("stop", { offset: "1", "stop-color": "#fff6dd", "stop-opacity": "0" }, beamGr);
  [0, 1].forEach(i => el("ellipse", { cx: OX + 470, cy: OY + 250, rx: "120", ry: "90", fill: `url(#${uid}-bm)`, class: "c2d-beam b" + i }, ambG));
  let ambMode = "";
  function ambience(mode) {
    mode = mode || "";
    if (mode === ambMode) return;
    ambMode = mode;
    ambG.setAttribute("opacity", mode === "show" ? "1" : "0");
    svg.classList.toggle("c2d-show", mode === "show");
    flagsL.classList.toggle("is-show", mode === "show");
  }
  const flashR = el("rect", { x: OX, y: OY, width: "940", height: "500", fill: "#fffbe8", opacity: "0", class: "c2d-flash", "pointer-events": "none" }, svg);
  function bigFlash() {
    if (reducedMotion) return;
    flashR.classList.remove("on"); void flashR.getBoundingClientRect(); flashR.classList.add("on");
  }
  // Réactions du public : « score » (panier : les supporters de l'équipe qui
  // marque se lèvent, bras en l'air ; les autres s'affaissent), « miss » (tir
  // raté : déception chez ses supporters, rien chez les autres), « big »
  // ajouté sur une grosse action (3 points, dunk, contre, buzzer) : plus
  // d'agitation, plus longtemps. Équipe 0 = club qui reçoit (h).
  // Fluidité (2026-10-08) : animations Web Animations sur les feuilles
  // (transformation composée, sans relecture forcée de la mise en page) ;
  // bras levés par une classe posée le temps de la réaction.
  let reactTimer = 0;
  const KF = {
    cheer: [{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(0,-.45%,0)", offset: 0.45 }, { transform: "translate3d(0,0,0)" }],
    cheerBig: [{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(-.08%,-.65%,0)", offset: 0.35 }, { transform: "translate3d(.08%,-.25%,0)", offset: 0.7 }, { transform: "translate3d(0,0,0)" }],
    slump: [{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(0,.2%,0)", offset: 0.4 }, { transform: "translate3d(0,0,0)" }],
    groan: [{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(0,-.2%,0)", offset: 0.2 }, { transform: "translate3d(0,.13%,0)", offset: 0.55 }, { transform: "translate3d(0,0,0)" }],
  };
  function crowdReact(kind, team, big = false) {
    if (reducedMotion || !fanSheets.length) return;
    const fan = team === 0 ? "h" : "a", other = fan === "h" ? "a" : "h";
    const cls = kind === "score" ? `react-cheer-${fan}` : `react-groan-${fan}`;
    crowdL.className = `c2d-crowd ${cls}${big ? " react-big" : ""}`;
    for (const sh of fanSheets) {
      let kf = null, ms = 0, it = 1, arms = false;
      if (kind === "score") {
        if (sh.side === fan || (sh.side === "n" && fan === "h" && big)) { kf = big ? KF.cheerBig : KF.cheer; ms = big ? 420 : 460; it = big ? 5 : 3; arms = true; }
        else if (sh.side === other) { kf = KF.slump; ms = 1400; }
      } else if (sh.side === fan) { kf = KF.groan; ms = 1200; }
      if (!kf) continue;
      if (typeof sh.el.animate === "function") { try { if (sh.anim) sh.anim.cancel(); const an = sh.anim = sh.el.animate(kf, { duration: ms, iterations: it, easing: "ease-out" }); an.onfinish = () => { if (sh.anim === an) sh.anim = null; }; } catch (e) { /* rien */ } }
      sh.el.classList.toggle("arms-up", arms);
    }
    if (kind === "score") flagsWave(fan, big ? 2 : 1, big ? 3400 : 1800);
    clearTimeout(reactTimer);
    reactTimer = setTimeout(() => { crowdL.className = "c2d-crowd"; fanSheets.forEach(sh => sh.el.classList.remove("arms-up")); }, big ? 2600 : 1700);
  }

  // --- tableau d'affichage suspendu (2026-10-08, refonte arène) : sigles,
  // score, 24 s, quart-temps et temps restant, au-dessus des tribunes. Les
  // anciennes cartes des cinq ont disparu : énergie et fautes sont sous
  // chaque jeton (terrain et banc), le détail au toucher.
  const board = el("g", { transform: `translate(${OX + 470} 6)`, class: "c2d-board" }, svg);
  el("path", { d: "M-60 0 V-8 M60 0 V-8", stroke: "#2a3140", "stroke-width": "2" }, board);
  el("rect", { x: "-104", y: "0", width: "208", height: "66", rx: "9", fill: "#0a0e16", stroke: "#2a3346", "stroke-width": "1.5" }, board);
  el("rect", { x: "-100", y: "4", width: "200", height: "58", rx: "7", fill: `url(#${uid}-bd)` }, board);
  const bdGrad = el("linearGradient", { id: uid + "-bd", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
  el("stop", { offset: "0", "stop-color": "#1a2233" }, bdGrad);
  el("stop", { offset: "1", "stop-color": "#0c111b" }, bdGrad);
  const teamBar = [0, 1].map(t => el("rect", { x: t ? "60" : "-96", y: "8", width: "36", height: "3", rx: "1.5", fill: "#888" }, board));
  const scoreTxt = [0, 1].map(t => el("text", { x: t ? "66" : "-66", y: "46", "text-anchor": "middle", class: "c2d-score" }, board));
  const shortTxt = [0, 1].map(t => el("text", { x: t ? "78" : "-78", y: "22", "text-anchor": "middle", class: "c2d-short", "data-no-i18n": "1" }, board));
  const periodTxt = el("text", { x: "0", y: "57", "text-anchor": "middle", class: "c2d-period", "data-no-i18n": "1" }, board);
  const clockG = el("g", { class: "c2d-clock" }, board);
  el("rect", { x: "-26", y: "8", width: "52", height: "36", rx: "6", fill: "rgba(255,255,255,.05)", stroke: "rgba(255,255,255,.08)" }, clockG);
  el("text", { x: "0", y: "19", "text-anchor": "middle", class: "c2d-clock-lbl" }, clockG).textContent = "24 S";
  const clockTxt = el("text", { x: "0", y: "39", "text-anchor": "middle", class: "c2d-clock-val" }, clockG);
  clockTxt.textContent = "24";
  let boardKey = "";
  function syncBoard() {
    const T = S.teams || [];
    const q = S.quarter || 1, qLab = q > 4 ? "P" + (q - 4) : "Q" + q;
    const c = Math.max(0, Math.round(S.clock || 0)), clk = Math.floor(c / 60) + ":" + String(c % 60).padStart(2, "0");
    const per = S.status === "final" ? "FIN" : S.status === "halftime" ? "MI-TEMPS" : S.status === "pregame" ? "AVANT-MATCH" : qLab + " · " + clk;
    const key = [T[0] && T[0].score, T[1] && T[1].score, T[0] && T[0].short, T[1] && T[1].short, per].join("|");
    if (key === boardKey) return;
    boardKey = key;
    [0, 1].forEach(t => { scoreTxt[t].textContent = T[t] ? String(T[t].score ?? 0) : "0"; shortTxt[t].textContent = T[t] ? String(T[t].short || "").toUpperCase() : ""; shortTxt[t].setAttribute("fill", "#e9eef7"); teamBar[t].setAttribute("fill", colors[t]); });
    periodTxt.textContent = per;
  }

  // --- calques animés ---
  const layer = el("g", { transform: `translate(${OX} ${OY})`, class: "c2d-players" }, svg);
  // Mise en scène (staging.js, 2026-10-08) : coachs SOUS les joueurs (premier
  // enfant du calque, jamais retrié), animateurs des shows AU-DESSUS.
  const coachLayer = el("g", { class: "stg-coaches" }, benchLayer);
  // Priorité 3 (2026-10-08) : traînée des passes et arc des tirs, sous le
  // ballon ; une trace par vol, effacée en fondu à l'arrivée.
  const trailG = el("g", { class: "c2d-trails" }, layer);
  const ballG = el("g", { class: "c2d-ball" }, layer);
  const ballSh = el("ellipse", { cx: "0", cy: "8", rx: "9", ry: "3.6", fill: "rgba(0,0,0,.4)", class: "c2d-ball-sh" }, ballG);
  const ballBody = el("g", {}, ballG);
  const ballGrad = el("radialGradient", { id: uid + "-bl", cx: "35%", cy: "30%", r: "70%" }, defs);
  el("stop", { offset: "0", "stop-color": "#ffb76b" }, ballGrad);
  el("stop", { offset: ".6", "stop-color": "#e8892e" }, ballGrad);
  el("stop", { offset: "1", "stop-color": "#b85f17" }, ballGrad);
  // Ballon plus gros (2026-10-08 : « minuscule et caché ») : rayon 9.5,
  // posé sur le bord du jeton du porteur (voir tick).
  el("circle", { r: "9.5", fill: `url(#${uid}-bl)`, stroke: "#4a2308", "stroke-width": "1.4" }, ballBody);
  el("path", { d: "M-9.5 0h19M0 -9.5v19M-6.1 -7.2c3.5 3.3 3.5 11.1 0 14.4M6.1 -7.2c-3.5 3.3-3.5 11.1 0 14.4", fill: "none", stroke: "#4a2308", "stroke-width": "1.2" }, ballBody);
  const fxG = el("g", { class: "c2d-fx" }, layer);
  // Points marqués (« +1 / +2 / +3 ») : calque À PART, jamais réordonné
  // (mission live 2026-10-10, « le +2 clignote ») — attachés au jeton, ils
  // étaient réinsérés dans le DOM à chaque tri de profondeur des joueurs
  // (4 fois par seconde, et juste après le panier quand le ballon change de
  // main), ce qui RELANÇAIT leur animation CSS depuis 0 (opacité 0) :
  // clignotement. Ici, l'élément reste en place ; seule sa position suit le
  // tireur (render, chaque image).
  const ptsG = el("g", { class: "c2d-ptsfx" }, layer);
  const frontLayer = el("g", { transform: `translate(${OX} ${OY})`, class: "stg-front" }, svg);
  const caption = document.createElement("div");
  caption.className = "c2d-caption";
  host.appendChild(caption);

  // ---------- état ----------
  const sprites = new Map();
  const ball = { x: 47, y: 25, z: 0, holder: null, flight: null };
  let S = null, possession = 0, raf = 0, last = performance.now(), timers = new Set();
  let halted = false;   // fin du direct : terrain figé (api.halt)
  let logoKey = null, clipSeq = 0, colors = opts.colors || ["#F26B1D", "#3B8FE0"];
  let plan = null;                 // possession en cours (voir buildPlan)
  let stopUntil = 0;               // arrêt de jeu (temps mort, fin de quart) : arbitres à la table
  let possStart = now();           // début de la possession courante (chrono des 24 s)
  let medalsKey = null, lastDrift = 0;
  // Arbitres (2026-10-08) : trois sprites gris (state.referees), placés en
  // mécanique à trois (chef sur la ligne de fond, queue derrière le jeu,
  // centre côté faible), réaffectés au plus court chemin toutes les 700 ms.
  const refs = [];
  let lastRefs = 0;
  // Zone avant : dès que le ballon a franchi la ligne médiane dans le sens
  // de l'attaque, le porteur n'y retourne plus (règle du retour en zone,
  // représentation seulement — le moteur ne siffle pas de violation) ; et
  // il traverse dans les 8 s de possession (règle des 8 s).
  let crossed = false;
  // ---------- états du match (2026-10-09) ----------
  // Une seule machine à états pour la scène, posée sur l'existant (arrêts
  // longs `stopUntil`, chorégraphies `sceneUntil`) :
  //   PREGAME → LIVE (entre-deux) ;
  //   LIVE → DEAD_BALL (panier, sortie, faute, lancers francs) ;
  //   DEAD_BALL → INBOUND_SETUP (remiseur hors du terrain, ballon donné,
  //     changements attendus) → INBOUND (passe de remise en jeu) → LIVE ;
  //   * → TIMEOUT (temps mort) → INBOUND_SETUP ; * → PERIOD_END (fin de
  //     quart) → INBOUND_SETUP (quart suivant) ou fin du match.
  // Ballon mort : aucun mouvement de jeu (dérive, dribble, possession
  // planifiée, « remise en ordre ») ; la possession ne bouge plus jusqu'à la
  // remise en jeu ; une remise en jeu n'est jouée qu'une fois par arrêt
  // (clé de l'événement). Journal de diagnostic : debug().log, et la console
  // si window.__hmLiveDebug = true.
  let phase = "PREGAME", phaseWhy = "", phaseAt = 0, lastInboundKey = null, anomalies = 0;
  const diagLog = [];
  const debugOn = () => { try { return typeof window !== "undefined" && !!window.__hmLiveDebug; } catch (e) { return false; } };
  function diag(kind, info) {
    const x = { t: Math.round(performance.now()), ...(info || null), kind };
    diagLog.push(x); if (diagLog.length > 150) diagLog.shift();
    if (debugOn()) try { console.debug("[court2d]", kind, info || ""); } catch (e) { /* rien */ }
  }
  function setPhase(p, why = "") {
    // Jeu en cours : plus de remiseur verrouillé (mission live 2026-10-10,
    // « joueur bloqué hors du terrain avec le ballon ») — le verrou ne
    // survit plus à une remise en jeu interrompue.
    if (p === "LIVE" && inbounder) { diag("inbounder-released", { id: inbounder, why }); inbounder = null; }
    if (p === phase && why === phaseWhy) return;
    diag("phase", { from: phase, to: p, why, possession: S && S.possession });
    phase = p; phaseWhy = why; phaseAt = performance.now();
  }
  const deadBall = () => phase === "DEAD_BALL" || phase === "INBOUND_SETUP" || phase === "INBOUND";
  // Ballon mort : chacun s'arrête là où il est (freinage naturel, pas de saut).
  function freezePlayers(ms) {
    for (const sp of sprites.values()) {
      if (sp.leaving || sp.stage) continue;
      sp.tx = Math.max(-3, Math.min(97, sp.x + (sp.vx || 0) * 0.12)); sp.ty = Math.max(1.5, Math.min(57, sp.y + (sp.vy || 0) * 0.12)); sp.speed = 1;
      busy(sp, ms);
    }
  }
  // Audit possession (2026-10-07) : dernier événement joué, compteurs du
  // garde-fou (voir giveBall / tick) lus par les tests via debug().
  let lastPlayed = null;
  // releases : ballon lâché à l'instant où le moteur change la possession
  // (interception, perte…) ; corrections : écart rattrapé par le garde-fou
  // de l'animation (scène en retard) ; refusals : remise refusée.
  const audit = { refusals: 0, corrections: 0, releases: 0 };

  function makeSprite(p, t) {
    const g = el("g", { class: "c2d-p t" + t, "data-id": p.id }, layer);
    el("ellipse", { cx: "0", cy: "12", rx: "19", ry: "7", fill: `url(#${uid}-ts)`, class: "c2d-sh" }, g);
    const ring = el("ellipse", { cx: "0", cy: "12", rx: "17", ry: "7", fill: "none", stroke: "#F5A13A", "stroke-width": "2", class: "c2d-ring", opacity: "0" }, g);
    // Porteur de balle (2026-10-08) : halo pulsant aux couleurs de son équipe
    // sous le jeton (animation CSS, coupée si prefers-reduced-motion).
    const carrier = el("g", { class: "c2d-carrier", opacity: "0" }, g);
    el("ellipse", { cx: "0", cy: "6", rx: "38", ry: "18", fill: colors[t], "fill-opacity": ".18", class: "c2d-carrier-glow" }, carrier);
    el("ellipse", { cx: "0", cy: "6", rx: "31", ry: "13.5", fill: colors[t], "fill-opacity": ".35", stroke: colors[t], "stroke-width": "3.2", class: "c2d-carrier-ring" }, carrier);
    el("ellipse", { cx: "0", cy: "6", rx: "31", ry: "13.5", fill: "none", stroke: "#fff", "stroke-opacity": ".6", "stroke-width": "1.1", class: "c2d-carrier-ring" }, carrier);
    let av = null;
    if (p.avatar) {
      const tpl = document.createElement("template");
      tpl.innerHTML = p.avatar;
      av = tpl.content.querySelector("svg");
    }
    if (av) {
      const cid = uid + "-c" + (++clipSeq);
      // Découpe rangée DANS le jeton : supprimée avec lui (avant, chaque
      // entrée en jeu laissait une découpe orpheline dans <defs>).
      const cp = el("clipPath", { id: cid }, g);
      el("rect", { x: "-19", y: "-30", width: "38", height: "41", rx: "6.8" }, cp);   // même arrondi que les avatars du jeu (18 % de la largeur)
      av.setAttribute("width", "38"); av.setAttribute("height", "41");
      av.setAttribute("x", "-19"); av.setAttribute("y", "-30");
      av.classList.add("c2d-av");
      const wrap = el("g", { "clip-path": `url(#${cid})` }, g);
      wrap.appendChild(av);
      // Dès que la version bitmap est prête, elle remplace le SVG inline.
      if (opts.raster !== false) rasterizeAvatar(p.avatar, 38, 41).then(url => {
        if (!url || !wrap.isConnected) return;
        wrap.innerHTML = "";
        el("image", { href: url, x: "-19", y: "-30", width: "38", height: "41", class: "c2d-av", preserveAspectRatio: "xMidYMid slice" }, wrap);
      });
      // Pas de cadre coloré autour de l'avatar (règle du jeu, 2026-10-07) :
      // l'équipe se lit sur l'étiquette du nom, à ses couleurs.
    } else {
      el("circle", { r: "12", cy: "-8", fill: colors[t], stroke: "#0b1220", "stroke-width": "2" }, g);
      el("text", { y: "-4", "text-anchor": "middle", class: "c2d-ini" }, g).textContent = initials(p.name);
    }
    // Numéro de maillot en pastille, coin haut du jeton (côté opposé au ballon).
    if (Number.isInteger(p.number)) {
      const nb = el("g", { class: "c2d-num", transform: `translate(${t === 0 ? -17 : 17} -28)` }, g);
      el("circle", { r: "7.2", fill: colors[t], stroke: "#0b1220", "stroke-width": "1.6" }, nb);
      el("text", { y: "3", "text-anchor": "middle", "data-no-i18n": "1" }, nb).textContent = String(p.number);
    }
    const lab = el("g", { class: "c2d-lab" }, g);
    const txt = el("text", { y: "26", "text-anchor": "middle" }, lab);
    txt.textContent = lastName(p.name).toUpperCase();
    const w = Math.max(30, txt.textContent.length * 6.6 + 10);
    lab.insertBefore(el("rect", { x: -w / 2, y: "17", width: w, height: "13", rx: "4", fill: colors[t], class: "c2d-plate" }), txt);
    const stat = el("text", { y: "-36", "text-anchor": "middle", class: "c2d-stat", opacity: "0" }, g);
    const stats = statsDecor(g, t, 28, 32);
    const sp = { stats, id: p.id, team: t, g, ring, carrier, stat, lab, labState: "", labHalf: w / 2 / PX, number: Number.isInteger(p.number) ? p.number : null, pos: p.pos || "", ox: 0, oy: 0, x: 47, y: t ? 30 : 20, tx: 47, ty: 25, speed: 1, slot: SLOT[p.pos] ?? 2, name: p.name, avatar: p.avatar };
    sprites.set(p.id, sp);
    return sp;
  }

  function makeRef(r, i) {
    const g = el("g", { class: "c2d-ref", "data-id": "ref" + i }, layer);
    el("ellipse", { cx: "0", cy: "12", rx: "11", ry: "4.5", fill: "rgba(0,0,0,.32)", class: "c2d-sh" }, g);
    let av = null;
    if (r && r.avatar) { const tpl = document.createElement("template"); tpl.innerHTML = r.avatar; av = tpl.content.querySelector("svg"); }
    if (av) {
      const cid = uid + "-r" + (++clipSeq);
      const cp = el("clipPath", { id: cid }, defs);
      el("rect", { x: "-16", y: "-26", width: "32", height: "35", rx: "5.8" }, cp);
      av.setAttribute("width", "32"); av.setAttribute("height", "35"); av.setAttribute("x", "-16"); av.setAttribute("y", "-26");
      const wrap = el("g", { "clip-path": `url(#${cid})` }, g); wrap.appendChild(av);
      if (opts.raster !== false) rasterizeAvatar(r.avatar, 32, 35).then(url => { if (!url || !wrap.isConnected) return; wrap.innerHTML = ""; el("image", { href: url, x: "-16", y: "-26", width: "32", height: "35", preserveAspectRatio: "xMidYMid slice" }, wrap); });
    } else {
      el("circle", { r: "10", cy: "-8", fill: "#8a8f99", stroke: "#2b2f36", "stroke-width": "2" }, g);
      el("text", { y: "-4", "text-anchor": "middle", class: "c2d-ini" }, g).textContent = "A";
    }
    const lab = el("g", { class: "c2d-lab" }, g);
    el("rect", { x: "-14", y: "15", width: "28", height: "11", rx: "3.5", fill: "#6b7280", class: "c2d-plate" }, lab);
    el("text", { y: "23.5", "text-anchor": "middle", "data-no-i18n": "1" }, lab).textContent = "ARB";
    const home = [{ x: 47, y: STOP_Y }, { x: 41, y: STOP_Y }, { x: 53, y: STOP_Y }][i];
    return { id: "ref" + i, g, lab, labState: "", labHalf: 1.4, ref: true, ox: 0, oy: 0, x: home.x, y: home.y, tx: home.x, ty: home.y, speed: 1, moving: false };
  }
  // Arrêt prolongé (temps mort, fin de quart-temps, mi-temps, fin de match)
  // : selon la scène (stopUntil) OU le moteur (S.stoppage). Le ballon du
  // match est alors confié à un arbitre (retour utilisateur 2026-10-09) :
  // jamais laissé au milieu des joueurs ni posé sur le parquet.
  function inLongStop() {
    if (performance.now() < stopUntil) return true;
    // (la reprise prépare le jeu 0,6 s avant la fin de l'arrêt)
    return !!(S && S.stoppage && S.stoppage.endsAt - 600 > now());
  }
  function inLongPause() {
    return !!S && S.status !== "pregame" && (S.status === "halftime" || S.status === "final" || (S.status === "live" && inLongStop()));
  }
  function refKeeper() {
    if (!refs.length || !inLongPause()) return null;
    let best = null;
    for (const r of refs) if (!best || Math.abs(r.tx - 47) < Math.abs(best.tx - 47)) best = r;   // l'arbitre du milieu, à la table
    return best;
  }
  function syncRefs(list) {
    if (refs.length || !Array.isArray(list)) return;
    for (let i = 0; i < 3; i++) refs.push(makeRef(list[i] || null, i));
  }
  // Cibles des trois arbitres : chef (ligne de fond du panier attaqué, côté
  // ballon), queue (ligne de touche côté ballon, derrière le jeu), centre
  // (ligne de touche côté faible, hauteur lancer franc). Arrêts de jeu :
  // à la table de marque. Entre-deux : un arbitre au centre.
  function refTargets() {
    const live = S && S.status === "live";
    if (!live || performance.now() < stopUntil) return [{ x: 47, y: STOP_Y }, { x: 41, y: STOP_Y }, { x: 53, y: STOP_Y }];   // bl absent → 0
    if (lastPlayed && lastPlayed.kind === "tipoff" && performance.now() < sceneUntil) return [{ x: 47, y: 29 }, { x: 30, y: 2.5 }, { x: 64, y: 47.5 }];
    const rim = RIM[possession], dir = rim.x > 47 ? 1 : -1;
    const ballSide = ball.y < 25 ? -1 : 1;                   // -1 : haut de l'écran
    const sideY = side => (side < 0 ? 2.5 : 47.5);
    const bx = Math.max(6, Math.min(88, ball.x));
    return [
      // Chef : DERRIÈRE la ligne de fond (x 94 / 0), jamais dessus ni devant
      // (retour utilisateur 2026-10-08) ; `bl` le garde derrière (declutter).
      { x: dir > 0 ? 94 + REF_BEHIND : -REF_BEHIND, y: 25 + ballSide * 11, bl: dir },
      { x: Math.max(4, Math.min(90, bx - dir * 14)), y: sideY(ballSide) },               // queue, derrière le jeu
      { x: Math.max(4, Math.min(90, rim.x - dir * 17)), y: sideY(-ballSide) },           // centre, côté faible
    ];
  }
  function steerRefs(nowP) {
    if (!refs.length || nowP - lastRefs < 700) return;
    lastRefs = nowP;
    const T = refTargets();
    // Affectation au plus court chemin (3! = 6 permutations) : pas de traversée inutile.
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    let best = null, bestD = Infinity;
    for (const pm of perms) { const d = pm.reduce((s, ti, ri) => s + Math.hypot(T[ti].x - refs[ri].x, T[ti].y - refs[ri].y), 0); if (d < bestD) { bestD = d; best = pm; } }
    // Hors jeu (arrêt, fin de match) : places fixes, sans petit décalage
    // aléatoire — les arbitres s'immobilisent (mission live 2026-10-10 :
    // « des choses bougent encore après la fin du match »).
    const playing = S && S.status === "live" && performance.now() >= stopUntil;
    if (playing) reseed("r" + (S.quarter || 0) + "|" + Math.round(Number(S.clock) || 0));
    best.forEach((ti, ri) => { const r = refs[ri]; r.bl = T[ti].bl || 0; r.tx = T[ti].x + (r.bl || !playing ? 0 : rnd(-0.6, 0.6)); r.ty = T[ti].y; r.speed = Math.hypot(r.tx - r.x, r.ty - r.y) > 20 ? 1.3 : 0.9; });
  }

  // Changements (2026-10-08, arène) : l'entrant se lève, passe par la
  // table de marque puis rejoint le jeu ; le sortant retourne s'asseoir à
  // sa place. Visuel seulement (aucune attente côté moteur) ; premier
  // affichage, onglet masqué ou hors direct : chacun apparaît à sa place.
  function syncRoster() {
    const seen = new Set();
    const walk = sprites.size > 0 && S.status === "live" && !suspended && !resyncing && !(typeof document !== "undefined" && document.hidden) && !reducedMotion;
    [0, 1].forEach(t => {
      const on = S.teams[t].players.filter(p => p.onCourt);
      const used = new Set();
      on.forEach(p => {
        let sp = sprites.get(p.id);
        if (!sp) {
          sp = makeSprite(p, t);
          const seat = seatOfId.get(p.id);
          if (walk && seat) {
            const s0 = seatPos(seat.team, seat.i);
            sp.x = s0.x; sp.y = s0.y; sp.tx = TABLE.x + (t ? 2.4 : -2.4) + (used.size - 2) * 0.4; sp.ty = 50.9;
            sp.speed = 1.9; sp.busy = true; sp.entering = performance.now() + 3000;
          } else { const park = parkLine(t, used.size); sp.x = sp.tx = park.x; sp.y = sp.ty = park.y; }
        } else if (sp.leaving) { sp.leaving = false; sp.leaveAt = 0; sp.busy = false; }
        let slot = SLOT[p.pos] ?? 2;
        while (used.has(slot)) slot = (slot + 1) % 5;
        used.add(slot); sp.slot = slot;
        seen.add(p.id);
      });
    });
    for (const [id, sp] of sprites) if (!seen.has(id) && !sp.leaving) {
      const idx = benchList(sp.team).findIndex(p => p.id === id);
      const seat = idx >= 0 ? seatPos(sp.team, idx) : parkLine(sp.team, 6);
      sp.tx = seat.x; sp.ty = seat.y; sp.speed = 1.9; sp.leaving = true; sp.busy = false; sp.stage = null;
      if (ball.holder === id) ball.holder = null;
      sp.leaveAt = performance.now() + (walk ? 3200 : 0);
    }
  }

  // Cibles de formation. Les défenseurs se placent entre leur vis-à-vis
  // (même créneau) et le cercle, pas sur un créneau figé.
  function formation() {
    if (performance.now() < stopUntil) return;   // arrêt de jeu : tout le monde reste au banc
    if (phase === "DEAD_BALL") return;            // ballon mort : on attend la remise en jeu
    for (const sp of sprites.values()) {
      if (sp.leaving || sp.busy || (inbounder && sp.id === inbounder)) continue;   // le remiseur reste derrière sa ligne
      if (sp.team === possession) {
        const p = slotPos(sp.team, sp.slot, true);
        sp.tx = p.x + rnd(-1.5, 1.5); sp.ty = p.y + rnd(-1.5, 1.5); sp.speed = 1;
      } else {
        const mark = onCourt(1 - sp.team).find(o => o.slot === sp.slot);
        const rim = RIM[1 - sp.team];
        if (mark) { sp.tx = lerp(mark.tx, rim.x, 0.22) + rnd(-1, 1); sp.ty = lerp(mark.ty, rim.y, 0.22) + rnd(-1, 1); }
        else { const p = slotPos(sp.team, sp.slot, false); sp.tx = p.x; sp.ty = p.y; }
        sp.speed = 1;
      }
    }
  }
  const spriteOf = id => (id ? sprites.get(id) : null);
  const onCourt = t => [...sprites.values()].filter(s => s.team === t && !s.leaving);
  const handlerOf = t => onCourt(t).sort((a, b) => a.slot - b.slot)[0] || null;

  // ---------- possession : source de vérité ----------
  // Audit possession live (2026-10-07). L'équipe qui a le ballon est celle de
  // l'état du direct (S.possession = possessionAfter du dernier événement
  // diffusé, décidé par le moteur). Le terrain ne tient PAS de possession
  // concurrente : `possession` ci-dessous n'est que l'équipe en attaque de la
  // scène jouée, et le ballon ne peut être porté que par un joueur de
  // l'équipe du moteur. Une remise à l'autre équipe est refusée (ballon
  // libre, rendu à la bonne équipe à la resynchronisation).
  function ownerTeam() { return S && S.status === "live" && (S.possession === 0 || S.possession === 1) ? S.possession : null; }
  const teamOf = v => (v === 0 || v === 1 ? v : null);
  function giveBall(sp) {
    const own = ownerTeam();
    if (sp && ((own !== null && sp.team !== own) || sp.leaving || !sprites.has(sp.id))) { audit.refusals++; if (opts.onAudit) opts.onAudit({ kind: "refusal", id: sp.id, team: sp.team, owner: own, leaving: !!sp.leaving, stack: new Error().stack }); ball.holder = null; ball.flight = null; return false; }
    // Arrêt de jeu en cours (temps mort, fin de quart) : le ballon reste à la
    // table ; la reprise (fin de l'arrêt) le redonne elle-même.
    if (sp && inLongStop()) { ball.holder = null; ball.flight = null; return false; }
    ball.holder = sp ? sp.id : null; ball.flight = null; ball.loose = null;
    return true;
  }
  // `land` : ballon lâché (tir raté, contre, lancer manqué, sortie) — il
  // avance à vitesse régulière, touche le sol PUIS rebondit et roule
  // (ballon libre, voir LOOSE) au lieu de s'arrêter net.
  function fly(to, ms, height, done, kind = "", land = false) {
    ball.holder = null; ball.loose = null;
    ball.flight = { from: { x: ball.x, y: ball.y }, to, t: 0, ms, h: height, done, target: null, kind, z0: ball.z || 0, land };
  }
  // ---------- ballon libre (2026-10-08 : « la balle s'arrête net ») ----------
  // Après un vol `land`, le ballon garde 70 % de sa vitesse horizontale,
  // rebondit (restitution 0,6, rebonds de plus en plus bas), puis roule
  // avec frottement jusqu'à l'arrêt ou jusqu'à ce qu'un joueur le prenne.
  // Hauteur en unités de `ball.z` (même échelle que les vols).
  const LOOSE = { carry: 0.7, bounce: 0.6, g: 90, friction: 16, minBounce: 2.2 };
  function looseFrom(f) {
    const T = Math.max(0.12, f.ms / 1000);
    return { vx: (f.to.x - f.from.x) / T * LOOSE.carry, vy: (f.to.y - f.from.y) / T * LOOSE.carry, vz: f.h * Math.PI / T * LOOSE.bounce };
  }
  // Un pas de ballon libre (aussi utilisé pour prévoir où il sera).
  function looseStep(st, dt) {
    if (st.vz > 0 || st.z > 0) {
      st.vz -= LOOSE.g * dt; st.z += st.vz * dt;
      if (st.z <= 0) { st.z = 0; st.vz = -st.vz * (st.bounce || LOOSE.bounce); if (st.vz < LOOSE.minBounce) st.vz = 0; }
    }
    if (st.z <= 0) {   // au sol : frottement (roule)
      const v = Math.hypot(st.vx, st.vy);
      if (v > 0) { const k = Math.max(0, v - LOOSE.friction * dt) / v; st.vx *= k; st.vy *= k; }
    }
    st.x += st.vx * dt; st.y += st.vy * dt;
    st.x = Math.max(-6, Math.min(100, st.x)); st.y = Math.max(-4, Math.min(56, st.y));
  }
  // Panier marqué (2026-10-09, « le ballon tombe puis s'arrête net ») : il
  // sort du filet, touche le sol et fait deux ou trois petits rebonds de
  // plus en plus bas (restitution 0,5) en glissant un peu vers le terrain,
  // puis s'immobilise — ballon libre ordinaire : le premier joueur qui le
  // prend (remise en jeu, possession) l'arrête net, sans rebond parasite.
  // Purement visuel : rien ne dépend de sa position.
  function netDrop(rim) {
    const dir = rim.x > 47 ? -1 : 1;   // vers l'intérieur du terrain
    ball.holder = null; ball.flight = null; ball.drib = 0;
    ball.x = rim.x + dir * 0.8; ball.y = rim.y + 0.4; ball.z = 0;
    ball.loose = { x: ball.x, y: ball.y, z: 0, vz: reducedMotion ? 0 : 20, bounce: 0.5, vx: dir * rnd(2.6, 4.2), vy: rnd(-1.4, 1.4) };
  }
  // Où sera le ballon `ms` après avoir touché le sol en `to` (vol `land` from → to).
  function looseAt(from, to, flightMs, h, ms) {
    const st = { x: to.x, y: to.y, z: 0, ...looseFrom({ from, to, ms: flightMs, h }) };
    for (let t = 0; t < ms; t += 20) looseStep(st, 0.02);
    return { x: st.x, y: st.y };
  }
  // Passe vers un joueur : la cible suit le receveur PENDANT le vol (plus de
  // position figée au départ qui devient fausse quand il se déplace).
  // Garde-fou (chaque image et à chaque nouvel état du direct) : un porteur
  // sorti du terrain ou de l'équipe qui n'a pas le ballon selon le moteur
  // (scène encore en retard sur le fil) lâche le ballon immédiatement.
  function enforcePossession(onUpdate = false) {
    if (!ball.holder) return;
    const own = ownerTeam(), h = sprites.get(ball.holder);
    if (!h || h.leaving || (own !== null && h.team !== own)) { if (onUpdate) audit.releases++; else audit.corrections++; ball.holder = null; }
  }
  function flyTo(sp, ms, height, done, kind = "") {
    if (!sp) return;
    fly({ x: sp.x, y: sp.y }, ms, height, done, kind);
    ball.flight.target = sp.id;
  }
  // Passe de `from` à `to` (même équipe) : depuis le porteur réel ; si le
  // ballon est encore en route vers `from`, la passe part à sa réception ;
  // jamais vers un adversaire.
  // `maxMs` : durée maximale du vol (la passe doit arriver avant le tir).
  function pass(from, to, lob = false, maxMs = Infinity) {
    if (!to || ball.holder === to.id || (ball.flight && ball.flight.target === to.id)) return;
    if (ball.flight && from && ball.flight.target === from.id) { const d = ball.flight.done; ball.flight.done = () => { if (d) d(); pass(from, to, lob, maxMs); }; return; }
    const src = ball.holder ? spriteOf(ball.holder) : null;
    if (src && src.team !== to.team) return;
    if (ball.flight) return;
    const dist = Math.hypot(to.x - ball.x, to.y - ball.y);
    flyTo(to, Math.max(140, Math.min(lob ? 520 : 320 + dist * 6, maxMs)), lob ? 7 : 2.5, () => giveBall(to), "pass");
  }
  // Commentaire audio (commentary.js) : le moment est annoncé à l'instant
  // où il est animé ; rien quand l'onglet est masqué (pas de rattrapage).
  // Moments du commentateur (mission live 2026-10-10) : rattachés à
  // l'action CONFIRMÉE en cours de jeu (`momentKey`, posée par playEvent),
  // annoncés une seule fois par action (pas de doublon au recalage ni à
  // l'arrivée sur la page), et la clé sert de graine au choix de la phrase
  // (même rediffusion → mêmes phrases).
  let momentKey = "";
  const saidMoments = new Set();
  const moment = (k, info) => {
    if (suspended || !opts.onMoment) return;
    const key = momentKey + "#" + k;
    if (momentKey && saidMoments.has(key)) return;
    if (momentKey) { saidMoments.add(key); if (saidMoments.size > 200) saidMoments.delete(saidMoments.values().next().value); }
    try { opts.onMoment(k, { ...(info || {}), key }); } catch (err) { /* jamais bloquant */ }
  };
  const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); fn(); }, Math.max(0, ms)); timers.add(id); return id; };
  // Joueur tenu par une chorégraphie pendant `ms`. Jeton : seule la DERNIÈRE
  // demande le libère (une minuterie plus ancienne — mise en place des
  // lancers, rebond… — ne relâche plus un joueur repris entre-temps, cause du
  // remiseur ramené dans le terrain par la formation).
  function busy(sp, ms) { if (!sp) return; sp.busy = true; const tok = sp.busyTok = (sp.busyTok || 0) + 1; later(ms, () => { if (sp.busyTok === tok) sp.busy = false; }); }
  // Saut (tir, contre, rebond) : l'avatar se soulève et grossit un instant.
  function jump(sp, h = 1) { if (!sp) return; sp.jump = { t: 0, h }; }
  // Réaction du banc (sobre) : la bande des médaillons de l'équipe sursaute.
  // Le public (aux couleurs du club qui reçoit) se lève sur un panier à domicile.
  function cheer(team, strong = false) { crowdReact("score", team, strong); }
  // Cibles bornées au terrain et à ses abords. `out` : remiseur, qui DOIT
  // pouvoir se tenir derrière n'importe quelle ligne (touche du haut
  // comprise — avant le 2026-10-09 la borne y ≥ 1,5 le ramenait DANS le
  // terrain pour une remise en jeu côté haut).
  let inbounder = null;   // id du remiseur en place (voir runInbound)
  function moveTo(sp, x, y, speed = 1.6, out = false) {
    if (!sp) return;
    // Remiseur en place : aucune autre consigne (plan, formation, entrée,
    // ballon perdu…) ne le fait rentrer avant la passe.
    if (!out && inbounder && sp.id === inbounder && !outside(x, y)) {
      if (window.__hmLiveDebug) diag("blocked", { what: "inbounder-move", id: sp.id, target: [+x.toFixed(1), +y.toFixed(1)], stack: String(new Error().stack).split("\n").slice(2, 4).join(" | ") });
      return;
    }
    sp.tx = Math.max(out ? -4.5 : -3, Math.min(out ? 98.5 : 97, x));
    sp.ty = Math.max(out ? -4.5 : 1.5, Math.min(57, y));
    sp.speed = speed;
  }
  // Le joueur est-il HORS du terrain (derrière une ligne) ? Lignes : x 0–94, y 0–50.
  const outside = (x, y) => x < 0 || x > 94 || y < 0 || y > 50;
  function say(text) { caption.innerHTML = text; caption.classList.add("show"); }
  // « +1 / +2 / +3 » (retour utilisateur 2026-10-08) : élément à part, attaché
  // au jeton, qui apparaît vite, reste ~2 s puis s'efface et est SUPPRIMÉ ;
  // même timing pour les trois ; un même panier rejoué (plan + événement,
  // resynchronisation) ne le relance pas.
  // UNE fois par panier confirmé : clé = identifiant de l'événement du
  // moteur (jamais relancé par un rejeu, un recalage ou un nouveau rendu).
  const ptsSeen = new Map();       // clé → instant (repli sans id : fenêtre de 2,6 s)
  const floats = new Set();        // { g, sp } affichés
  function floatPts(sp, text, evKey) {
    const t = performance.now();
    const key = evKey != null ? "ev:" + evKey : sp.id + "|" + text;
    const seen = ptsSeen.get(key);
    if (seen !== undefined && (evKey != null || t - seen < 2600)) return;
    ptsSeen.set(key, t); if (ptsSeen.size > 400) ptsSeen.delete(ptsSeen.keys().next().value);
    const g = el("g", { class: `c2d-ptsf t${sp.team}`, "data-for": sp.id }, ptsG);
    el("text", { "text-anchor": "middle", "data-no-i18n": "1" }, g).textContent = text;
    const f = { g, sp };
    floats.add(f); placeFloat(f);
    fxTimer(2050, () => { g.remove(); floats.delete(f); });
  }
  function placeFloat(f) { const sp = f.sp; f.g.setAttribute("transform", `translate(${((sp.x + (sp.ox || 0)) * PX).toFixed(1)} ${((sp.y + (sp.oy || 0)) * PX - 38).toFixed(1)})`); }
  function flash(sp, text, cls = "", evKey = null) {
    if (!sp) return;
    sp.stat.textContent = text;
    // Points marqués (« +2 », « +3 », « +1 ») : plus gros, couleur de
    // l'équipe, montent en flottant puis s'effacent (priorité 3).
    if (cls === "good" && /^\+\d$/.test(text)) { sp.stat.textContent = ""; floatPts(sp, text, evKey); return; }
    sp.stat.setAttribute("class", "c2d-stat " + cls);
    sp.stat.setAttribute("opacity", "1");
    fxTimer(1600, () => sp.stat.setAttribute("opacity", "0"));
  }
  // Onde au cercle sur un PANIER seulement (un tir manqué n'a plus de
  // signal visuel propre, voir plus haut).
  // Grande bannière d'action (contre) : texte traduit par la couche i18n du
  // jeu (« Contre » → « Block »), entrée en zoom, secousse, fondu — CSS
  // (.c2d-banner). Déclenchée UNIQUEMENT par un contre du moteur, à son airAt.
  function banner(text, cls = "") {
    const g = el("g", { class: "c2d-banner " + cls, transform: "translate(470 250)" }, fxG);
    g.setAttribute("data-no-i18n", "1");
    el("text", { class: "c2d-banner-shadow", "text-anchor": "middle", y: "6", "data-no-i18n": "1" }, g).textContent = text;
    el("text", { class: "c2d-banner-text", "text-anchor": "middle", y: "0", "data-no-i18n": "1" }, g).textContent = text;
    fxTimer(1500, () => g.remove());
  }
  const andOneSeen = new Set();
  function andOneBanner(evKey) {
    const k = String(evKey);
    if (andOneSeen.has(k)) return;
    andOneSeen.add(k); if (andOneSeen.size > 200) andOneSeen.delete(andOneSeen.values().next().value);
    banner("AND ONE", "andone");
  }
  const blockLabel = () => { try { const t = typeof window !== "undefined" && window.hmI18n && window.hmI18n.t ? window.hmI18n.t("Contre") : "Contre"; return String(t || "Contre").toUpperCase(); } catch (e) { return "CONTRE"; } };
  // Trace du vol en cours : points échantillonnés à chaque image (position
  // dessinée du ballon, hauteur comprise : le tir dessine son arc), au plus
  // 40 ; à l'arrivée (ou vol interrompu), fondu CSS puis suppression.
  let trail = null;
  function traceTrail(f) {
    if (!trail || trail.flight !== f) {
      endTrail();
      const shot = f.kind.startsWith("shot");
      const cls = shot ? `c2d-trail shot t${f.kind.slice(4)}` : "c2d-trail pass";
      trail = { flight: f, pts: [], max: shot ? 9 : 6, path: el("path", { class: cls, fill: "none" }, trailG) };
    }
    const x = (ball.x + ballOff.x) * PX, y = (ball.y + ballOff.y) * PX - ball.z * 4;
    const last = trail.pts[trail.pts.length - 1];
    if (last && Math.hypot(last[0] - x, last[1] - y) < 3) return;
    // Passe ET tir : courte traînée de mouvement juste derrière le ballon
    // (retours utilisateur 2026-10-08 : plus de pointillés ; l'arc du tir se
    // lit au mouvement du ballon, dont la hauteur est dessinée).
    trail.pts.push([x, y]); if (trail.pts.length > trail.max) trail.pts.shift();
    trail.path.setAttribute("d", "M" + trail.pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L"));
  }
  function endTrail() {
    if (!trail) return;
    const path = trail.path; trail = null;
    path.classList.add("fade");
    setTimeout(() => path.remove(), 1000);
  }
  // Effets passagers (onde du cercle, bannière, cercle de faute) : leur
  // nettoyage ne dépend PAS des minuteries de chorégraphie, annulées à la
  // suspension / au recalage (mission live 2026-10-10 : « cercle vert qui
  // clignote au retour sur la page » — l'onde restait dans le DOM et son
  // animation CSS rejouait à chaque réinsertion).
  const fxTimers = new Set();
  const fxTimer = (ms, fn) => { const id = setTimeout(() => { fxTimers.delete(id); fn(); }, ms); fxTimers.add(id); return id; };
  function clearFx() {
    fxTimers.forEach(clearTimeout); fxTimers.clear();
    while (fxG.firstChild) fxG.firstChild.remove();
    floats.forEach(f => f.g.remove()); floats.clear();
    for (const sp of sprites.values()) { if (sp.stat) sp.stat.setAttribute("opacity", "0"); if (sp.ring) sp.ring.setAttribute("opacity", "0"); }
  }
  function rimFx(team, made) {
    if (!made) return;
    const r = RIM[team];
    const c = el("circle", { cx: r.x * PX, cy: r.y * PX, r: "10", fill: "none", stroke: "#5fd6ae", "stroke-width": "3", class: "c2d-wave" }, fxG);
    fxTimer(900, () => c.remove());
  }
  function startPossession(t) { possession = t; possStart = now(); crossed = false; }
  // Identité offensive de l'équipe (tactique réelle du match, S.teams[t].tactics) :
  // rythme Rapide → ballon qui circule plus vite, Lent → plus posé.
  function teamPace(t) {
    const tac = S && S.teams && S.teams[t] && S.teams[t].tactics;
    const r = String((tac && tac.rhythm) || "");
    return /rapide/i.test(r) ? 0.78 : /lent/i.test(r) ? 1.3 : 1;
  }
  // Drive : priorité offensive « pénétration » → le porteur attaque plus près du cercle.
  function drivesInside(t) {
    const tac = S && S.teams && S.teams[t] && S.teams[t].tactics;
    return /p[ée]n[ée]tration|int[ée]rieur/i.test([tac && tac.offense, ...((tac && tac.offenses) || [])].join(" "));
  }
  // Ligne médiane franchie dans le sens de l'attaque ?
  const inFront = (team, x) => (team === 0 ? x >= 47 : x <= 47);
  // Borne une abscisse à la zone avant quand le ballon y est déjà passé.
  function frontX(team, x) { if (!crossed) return x; return team === 0 ? Math.max(48.5, x) : Math.min(45.5, x); }

  // Remise en jeu après panier : le pivot derrière la ligne de fond, le
  // meneur vient chercher le ballon, puis tout le monde remonte.
  // Changements à venir sur le même arrêt de jeu (dernier lancer franc
  // réussi, ballon sorti…) : ils se font AVANT la remise en jeu (retour
  // utilisateur 2026-10-09) — la remise en jeu attend le dernier changement
  // (relâchée par playEvent « substitution », filet de sécurité 6 s).
  let heldInbound = null, inboundCount = 0;
  const subsPending = () => queue.some(q => q.kind === "substitution" || q.kind === "shortHanded")
    || !!(S && S.nextAction && (S.nextAction.kind === "substitution" || S.nextAction.kind === "shortHanded") && S.nextAction.airAt - now() < 1500);
  // Fin d'une remise en jeu : le jeu ne reprend QUE quand le ballon est
  // entré dans le terrain (reçu par un joueur dans les lignes). Remiseur
  // encore ballon en main (passe pas encore partie) : il passe d'abord, la
  // reprise suit la réception — il ne rentre jamais sur le terrain avec le
  // ballon.
  // Déroulé d'une remise en jeu, piloté par les positions (pas par des
  // délais fixes) : 1) le remiseur rejoint son point DERRIÈRE la ligne ;
  // 2) l'arbitre lui donne le ballon une fois qu'il y est (au plus 3 s) ;
  // 3) il le tient un instant puis passe au meneur (état INBOUND) ;
  // 4) reprise à la réception dans le terrain (completeInbound).
  // Receveur de la remise en jeu (2026-10-10, « tir attribué à un autre ») :
  // si le moteur annonce un tir de cette équipe dans les secondes qui
  // suivent, c'est le TIREUR désigné qui reçoit la remise (une remise suivie
  // d'un tir rapide) ; sinon le meneur. Avant, le meneur recevait toujours
  // et, faute de temps pour préparer l'action, le tir partait de ses mains.
  function imminentShooter(nt) {
    const na = S && S.nextAction;
    if (!na || !na.actors || !na.actors.shooter || !(na.kind === "shot" || na.kind === "rebound")) return null;
    const team = teamOf(na.possessionTeam) !== null ? na.possessionTeam : na.kind === "rebound" ? (na.offensive ? na.team : 1 - na.team) : na.team;
    if (team !== nt || !(na.airAt - now() < 6000)) return null;
    const sp = spriteOf(na.actors.shooter);
    return sp && sp.team === nt && !sp.leaving ? sp : null;
  }
  function runInbound(nt, pg, inb, why, keepClock, stopped) {
    const t0 = performance.now();
    const goal = inb ? { x: inb.tx, y: inb.ty } : null;
    const ready = () => !inb || (outside(inb.x, inb.y) && Math.hypot(inb.tx - inb.x, inb.ty - inb.y) < 2) || performance.now() - t0 > 5000;
    let nudged = false;
    const wait = () => {
      if (stopped()) return;
      // Cible du remiseur modifiée entre-temps (ou pas encore dehors après
      // 3 s) : on le renvoie derrière sa ligne, tracé.
      if (inb && goal && !outside(inb.tx, inb.ty)) { diag("anomaly", { what: "inbounder-retargeted", id: inb.id, target: [+inb.tx.toFixed(1), +inb.ty.toFixed(1)] }); anomalies++; moveTo(inb, goal.x, goal.y, 2.9, true); }
      if (inb && !nudged && performance.now() - t0 > 3000 && !outside(inb.x, inb.y)) { nudged = true; busy(inb, 3000); moveTo(inb, goal.x, goal.y, 3.2, true); }
      if (!ready()) { later(100, wait); return; }
      if (inb && !outside(inb.x, inb.y)) { anomalies++; diag("anomaly", { what: "inbounder-inside", id: inb.id, at: [+inb.x.toFixed(1), +inb.y.toFixed(1)], target: [+inb.tx.toFixed(1), +inb.ty.toFixed(1)], busy: !!inb.busy, leaving: !!inb.leaving, stage: !!inb.stage, entering: !!inb.entering, why }); }
      const src = inb || pg;
      flyTo(src, 280, 1, () => {
        giveBall(src);
        later(inb ? 420 : 150, () => {
          if (stopped()) return;
          setPhase("INBOUND", why);
          if (inb && ball.holder === inb.id) pass(inb, pg);
          later(inb ? 520 : 100, () => { if (!stopped()) completeInbound(nt, pg, inb, why, keepClock); });
        });
      });
    };
    later(150, wait);
    // Garde-fou : chaîne de remise en jeu interrompue (vol de ballon
    // remplacé, minuterie perdue) → la remise est conclue, jamais un
    // remiseur figé derrière la ligne.
    later(7000, () => { if (!stopped() && inbounder && inb && inbounder === inb.id && deadBall()) { anomalies++; diag("anomaly", { what: "inbound-watchdog", id: inb.id }); completeInbound(nt, pg, inb, why, keepClock, 3); } });
  }
  function completeInbound(nt, pg, inb, why, keepClock, tries = 0) {
    if (inb && ball.holder === inb.id && pg && pg !== inb && tries < 3) {
      pass(inb, pg);
      later(650, () => { if (performance.now() >= stopUntil) completeInbound(nt, pg, inb, why, keepClock, tries + 1); });
      return;
    }
    if (ball.flight && tries < 3) { later(300, () => { if (performance.now() >= stopUntil) completeInbound(nt, pg, inb, why, keepClock, tries + 1); }); return; }
    pg.busy = false; if (inb) inb.busy = false;
    if (!ball.holder || ball.holder === (inb && inb.id)) giveBall(pg);
    inbounder = null;
    if (!keepClock) startPossession(nt); else possession = nt;   // ballon touché dans le terrain : le jeu (et les 24 s) reprend
    setPhase("LIVE", "remise en jeu effectuée");
    formation();
  }
  function releaseInbound(force) {
    if (!heldInbound || (!force && subsPending())) return;
    const h = heldInbound; heldInbound = null;
    if (h.side) sidelineInbound(h.nt, h.at, { ...h.opts, key: null }); else inbound(h.nt, h.rim, null, h.why);
  }
  // Fin de période déjà connue (dans la file, ou action suivante du moteur) :
  // elle passe avant toute remise en jeu (panier ou sortie au buzzer).
  // Lancers francs à venir : aucune remise en jeu (mission live 2026-10-10,
  // « lancer franc tiré depuis la table de marque » — la reprise d'un temps
  // mort entre deux lancers envoyait le tireur remettre en jeu côté table).
  const ftPending = () => queue.some(q => q.kind === "freeThrow")
    || !!(S && S.nextAction && S.nextAction.kind === "freeThrow" && S.nextAction.airAt - now() < 9000);
  const periodEndPending = () => queue.some(q => q.kind === "quarterEnd")
    || !!(S && (S.status === "final" || (S.nextAction && S.nextAction.kind === "quarterEnd" && S.nextAction.airAt - now() < 2500)));
  // Remise en jeu déjà jouée pour cet arrêt (même événement) : ignorée.
  function inboundOnce(key) {
    if (key == null) return true;
    if (key === lastInboundKey) { diag("inbound-duplicate", { key }); return false; }
    lastInboundKey = key; return true;
  }
  // Remise en jeu depuis la LIGNE DE FOND (après un panier, un dernier
  // lancer réussi, en début de quart) : le remiseur DERRIÈRE la ligne de fond
  // du panier où le point a été marqué, le meneur vient chercher le ballon,
  // les autres remontent, la défense se replace ; le jeu (et le chrono des
  // 24 s) ne reprend qu'à la réception dans le terrain.
  function inbound(nt, rim, key = null, why = "panier") {
    if (performance.now() < stopUntil) return;   // temps mort / fin de quart déjà sifflé : pas de remise en jeu
    if (periodEndPending()) { diag("inbound-skipped", { why: "fin de période", key }); return; }
    if (!inboundOnce(key)) return;
    if (nt !== 0 && nt !== 1) { diag("anomaly", { what: "inbound-team", nt }); anomalies++; setPhase("LIVE", "remise sans équipe"); return; }
    possession = nt; crossed = false;
    if (subsPending()) {
      setPhase("INBOUND_SETUP", "changements avant la remise en jeu");
      const h = heldInbound = { nt, rim, why };
      scene(6000);   // ni possession planifiée ni « remise en ordre » pendant l'attente
      later(6000, () => { if (heldInbound === h) releaseInbound(true); });
      return;
    }
    inboundCount++;
    setPhase("INBOUND_SETUP", why);
    scene(2400);
    const dir = rim.x > 47 ? 1 : -1;
    const team = onCourt(nt).sort((a, b) => a.slot - b.slot);
    let pg = team[0], inb = team[team.length - 1];
    if (!pg) { setPhase("LIVE", "remise sans joueur"); return; }
    const shr = imminentShooter(nt);
    if (shr && shr !== pg) { if (shr === inb) inb = pg; pg = shr; diag("inbound-to-shooter", { shooter: shr.id }); }
    for (const sp of sprites.values()) sp.busy = false;
    // Le remiseur sort DERRIÈRE la ligne de fond (hors du terrain), le
    // meneur vient chercher le ballon à l'intérieur ; les autres remontent
    // déjà (retour utilisateur 2026-10-01 : « devant la ligne de fond et pas
    // derrière, ça ne va pas »).
    const baseline = dir > 0 ? 94 : 0;
    if (inb && inb !== pg) { busy(inb, 3000); moveTo(inb, baseline + dir * 2.4, 25 + rnd(-6, 6), 2.9, true); }
    inbounder = inb && inb !== pg ? inb.id : null;
    busy(pg, 2400); moveTo(pg, baseline - dir * 9, 30 + rnd(-4, 4), 2);
    for (const sp of onCourt(nt)) if (sp !== pg && sp !== inb) { busy(sp, 1200); moveTo(sp, lerp(sp.x, 47, 0.5), sp.y + rnd(-4, 4), 1.4); }
    formation();
    // Un arrêt de jeu survenu entre-temps (temps mort, fin de quart) annule
    // la suite de la remise en jeu : personne ne revient du banc.
    const stopped = () => performance.now() < stopUntil;
    runInbound(nt, pg, inb !== pg ? inb : null, why, false, stopped);
  }

  // Remise en jeu en TOUCHE (2026-10-09) : ballon sorti, faute simple sans
  // lancers francs, reprise après un temps mort. Le remiseur (équipe `nt`)
  // sort sur la ligne de touche à hauteur de l'arrêt (`at`), passe au meneur
  // qui s'est démarqué ; la défense se replace ; l'action suivante du moteur
  // ne part qu'ensuite. `opts.keepClock` : l'attaque garde le ballon après
  // un contact défensif — le chrono des 24 s n'est pas remis à zéro.
  let sideInbounds = 0;
  function sidelineInbound(nt, at, opts = {}) {
    if (inLongStop()) return;
    if (ftPending()) { diag("inbound-skipped", { why: "lancers francs à suivre", key: opts.key }); setPhase("DEAD_BALL", "lancers francs à suivre"); return; }
    if (periodEndPending()) { diag("inbound-skipped", { why: "fin de période", key: opts.key }); return; }
    if (!inboundOnce(opts.key)) return;
    if (nt !== 0 && nt !== 1) { diag("anomaly", { what: "sideline-team", nt }); anomalies++; setPhase("LIVE", "touche sans équipe"); return; }
    possession = nt; crossed = false;
    const why = opts.why || "touche";
    if (subsPending()) {
      setPhase("INBOUND_SETUP", "changements avant la remise en jeu");
      const h = heldInbound = { side: true, nt, at, opts };
      scene(6000);
      later(6000, () => { if (heldInbound === h) releaseInbound(true); });
      return;
    }
    sideInbounds++;
    setPhase("INBOUND_SETUP", why);
    scene(2600);
    const team = onCourt(nt).sort((a, b) => a.slot - b.slot);
    let pg = team[0];
    if (!pg) { setPhase("LIVE", "touche sans joueur"); return; }
    const shr = imminentShooter(nt);
    if (shr && shr !== pg) { pg = shr; diag("inbound-to-shooter", { shooter: shr.id }); }
    // Remiseur : le coéquipier le plus proche de l'endroit de la remise.
    const spot0 = at && Number.isFinite(at.x) ? at : { x: ball.x, y: ball.y };
    const inb = team.filter(sp => sp !== pg).sort((a, b) => Math.hypot(a.x - spot0.x, a.y - spot0.y) - Math.hypot(b.x - spot0.x, b.y - spot0.y))[0] || pg;
    // Endroit réglementaire : à hauteur de l'arrêt, derrière la ligne de
    // TOUCHE (jamais dans les coins : ±12 pieds des lignes de fond), ou
    // derrière la ligne de FOND si le ballon est sorti par là.
    const dir = RIM[nt].x > 47 ? 1 : -1;
    for (const sp of sprites.values()) sp.busy = false;
    ball.flight = null; ball.loose = null;
    if (opts.edge === "baseline") {
      const left = at ? at.x < 47 : ball.x < 47;
      const y = Math.max(4, Math.min(46, at && Number.isFinite(at.y) ? at.y : ball.y));
      if (inb && inb !== pg) { busy(inb, 3200); moveTo(inb, left ? -2.4 : 96.4, y, 2.9, true); }
      busy(pg, 2600); moveTo(pg, left ? 7 : 87, y + (y < 25 ? 6 : -6), 2);
    } else {
      const top = at ? at.y < 25 : ball.y < 25;
      const x = Math.max(12, Math.min(82, at && Number.isFinite(at.x) ? at.x : ball.x));
      if (inb && inb !== pg) { busy(inb, 3200); moveTo(inb, x, top ? -2.4 : 52.4, 2.9, true); }
      busy(pg, 2600); moveTo(pg, x + dir * 5, top ? 9 : 41, 2);
    }
    inbounder = inb && inb !== pg ? inb.id : null;
    for (const sp of onCourt(nt)) if (sp !== pg && sp !== inb) { busy(sp, 1400); moveTo(sp, Math.max(4, Math.min(90, sp.x + dir * 4)), sp.y, 1.4); }
    formation();   // défense : chacun sur son vis-à-vis
    const stopped = () => performance.now() < stopUntil;
    runInbound(nt, pg, inb !== pg ? inb : null, why, !!opts.keepClock, stopped);
  }
  // ---------- pertes de balle en situation (2026-10-09) ----------
  // Bornes du terrain jouable pour un ballon libre (il reste DANS le terrain).
  const inCourt = p => ({ x: Math.max(3, Math.min(91, p.x)), y: Math.max(3, Math.min(47, p.y)) });
  // Passe trop longue : la trajectoire passeur → receveur, prolongée
  // au-delà du receveur jusqu'à la ligne qu'elle franchit réellement.
  function overthrowExit(passer, recv) {
    if (!passer || !recv) return null;
    let dx = recv.x - passer.x, dy = recv.y - passer.y;
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return null;
    // Premier franchissement d'une ligne (x 0/94, y 0/50) en partant du receveur.
    let best = Infinity;
    for (const [lim, v, p] of [[0, dx, recv.x], [94, dx, recv.x], [0, dy, recv.y], [50, dy, recv.y]]) {
      if (Math.abs(v) < 1e-6) continue;
      const k = (lim - p) / v;
      if (k > 0 && k < best) best = k;
    }
    if (!Number.isFinite(best) || best > 40) return null;   // trop loin : sortie latérale classique
    const k = best + 2.2;
    return { x: recv.x + dx * k, y: recv.y + dy * k };
  }
  // Interception dans la ligne de passe : le défenseur lit la passe vers le
  // receveur et coupe la trajectoire (55 % du chemin).
  function interceptPass(nt, passer, recv, st) {
    const from = passer ? { x: passer.x, y: passer.y } : { x: ball.x, y: ball.y };
    const to = recv ? { x: recv.x, y: recv.y } : { x: from.x + (nt === 0 ? -8 : 8), y: from.y };
    const L = inCourt({ x: lerp(from.x, to.x, 0.55), y: lerp(from.y, to.y, 0.55) });
    startPossession(nt);
    setPhase("LIVE", "passe interceptée");
    for (const sp of [st, recv]) if (sp) busy(sp, 1000);
    moveTo(st, L.x, L.y, 2.8);
    if (recv) moveTo(recv, lerp(recv.x, L.x, 0.4), lerp(recv.y, L.y, 0.4), 1.6);
    moment("interception", { team: nt });
    ball.holder = null; ball.loose = null;
    fly(L, 460, 2.2, () => { if (giveBall(st)) { flash(st, "INT", "good"); jump(st, 0.5); } else giveBall(handlerOf(nt)); later(500, () => formation()); }, "pass");
  }
  // Ballon libre : passe imprécise / déviée (`passLoose`), receveur qui ne
  // contrôle pas (`fumble`), receveur parti ailleurs (`missedMove`). Le
  // ballon reste DANS le terrain, le défenseur désigné par le moteur le
  // ramasse (un coéquipier du receveur tente aussi sa chance, en vain).
  function looseTurnover(kind, nt, passer, recv, rec) {
    setPhase("LIVE", kind === "fumble" ? "ballon mal contrôlé" : kind === "missedMove" ? "receveur parti" : "passe imprécise");
    const from = passer ? { x: passer.x, y: passer.y } : { x: ball.x, y: ball.y };
    const to0 = recv ? { x: recv.x, y: recv.y } : { x: from.x + (nt === 0 ? 8 : -8), y: from.y + rnd(-5, 5) };
    let land;
    if (kind === "missedMove" && recv) {
      // Le receveur coupe ailleurs ; la passe part vers l'endroit où il était.
      busy(recv, 1300); moveTo(recv, recv.x + rnd(-1, 1) * 7, Math.max(4, Math.min(46, recv.y + (recv.y < 25 ? 7 : -7))), 2.2);
      land = inCourt(to0);
    } else if (kind === "fumble" && recv) {
      land = inCourt({ x: to0.x + rnd(-2, 2), y: to0.y + rnd(-2, 2) });
    } else {
      // Passe imprécise : trop courte et à côté de la ligne de passe.
      const dx = to0.x - from.x, dy = to0.y - from.y, d = Math.hypot(dx, dy) || 1;
      const off = rnd(3.5, 6) * (rand01() < 0.5 ? -1 : 1);
      land = inCourt({ x: from.x + dx * 0.7 - dy / d * off, y: from.y + dy * 0.7 + dx / d * off });
    }
    const picker = rec && rec.team === nt ? rec : handlerOf(nt);
    ball.holder = null;
    const flightMs = kind === "fumble" ? 380 : 440;
    // Rebond amorti, orienté vers l'intérieur du terrain : le ballon libre
    // reste en jeu (une vraie sortie est l'affaire de `passOut`).
    const looseState = () => {
      const cx = 47 - land.x, cy = 25 - land.y, n = Math.hypot(cx, cy) || 1;
      return { x: land.x, y: land.y, z: 0.3, vz: 7, bounce: 0.45, vx: cx / n * rnd(1.5, 3), vy: cy / n * rnd(1.5, 3) };
    };
    const grab = () => {
      const st0 = looseState();
      ball.loose = { ...st0 };
      const sim = { ...st0 }; for (let t = 0; t < 650; t += 20) looseStep(sim, 0.02);
      const catchAt = inCourt(sim);
      if (picker) { busy(picker, 1600); moveTo(picker, catchAt.x, catchAt.y, 2.6); }
      if (recv && kind !== "missedMove") { busy(recv, 900); moveTo(recv, lerp(recv.x, catchAt.x, 0.6), lerp(recv.y, catchAt.y, 0.6), 1.5); }
      // Ramassé quand le défenseur ARRIVE au ballon (au plus 1,6 s) — jamais à distance.
      const t0 = performance.now();
      const tryPick = () => {
        if (ball.holder || !picker) return;
        const near = Math.hypot(picker.x - ball.x, picker.y - ball.y) < 2.4;
        if (near || performance.now() - t0 > 1600) {
          startPossession(nt);
          if (!near) { flyTo(picker, 220, 1, () => { giveBall(picker); formation(); }); return; }
          if (giveBall(picker)) flash(picker, "RÉCUP", "good"); else giveBall(handlerOf(nt));
          formation();
          return;
        }
        later(80, tryPick);
      };
      later(250, tryPick);
    };
    fly(land, flightMs, kind === "fumble" ? 2 : 2.5, () => {
      if (kind === "fumble" && recv) jump(recv, 0.4);
      grab();
    }, "pass");
  }
  // Ballon SORTI (2026-10-09) : il file hors du terrain par la ligne de
  // touche la plus proche, le jeu s'arrête aussitôt (plus aucune action
  // planifiée, chacun freine sur place), puis remise en jeu en touche à
  // l'endroit de la sortie par l'équipe `nt` (celle qui n'a PAS touché le
  // ballon en dernier, décidée par le moteur : possessionAfter).
  function ballOut(nt, from, opts = {}) {
    setPhase("DEAD_BALL", opts.why || "sortie");
    plan = null;
    const src = from && Number.isFinite(from.x) && Number.isFinite(from.y) ? from : { x: ball.x, y: ball.y };
    // Point de sortie : celui de la trajectoire (passe trop longue), sinon la
    // ligne la plus proche du joueur — ligne de FOND près des paniers.
    let exit = opts.exit;
    if (!exit) {
      const nearBase = src.x < 9 || src.x > 85;
      exit = nearBase ? { x: src.x < 47 ? -2.2 : 96.2, y: Math.max(3, Math.min(47, src.y + rnd(-3, 3))) }
        : { x: Math.max(6, Math.min(88, src.x + rnd(-3, 3))), y: src.y < 25 ? -2.2 : 52.2 };
    }
    const edge = exit.x < 0 || exit.x > 94 ? "baseline" : "sideline";
    fly(exit, opts.flightMs || 520, 2, null, "", true);
    freezePlayers(1000);
    scene(3800);
    diag("ball-out", { team: nt, exit: [+exit.x.toFixed(1), +exit.y.toFixed(1)], edge, lastTouch: opts.lastTouch || null, tov: opts.kind || null });
    // Point de remise en jeu : sur la ligne, à l'endroit de la sortie.
    const at = edge === "baseline" ? { x: exit.x < 47 ? 0 : 94, y: exit.y } : { x: exit.x, y: exit.y < 25 ? 0 : 50 };
    later(950 + (opts.flightMs ? opts.flightMs - 520 : 0), () => sidelineInbound(nt, at, { ...opts, edge }));
  }


  // ---------- possession à venir (state.nextAction) ----------
  // Calée sur le temps réel : la remontée de balle occupe le premier tiers,
  // les passes le deuxième, le tireur rejoint son endroit et tire pour que
  // le ballon atteigne le cercle exactement à `airAt`. Les acteurs viennent
  // de l'événement (le moteur a déjà décidé) ; le résultat n'est joué qu'à
  // l'arrivée réelle de l'événement (playEvent), donc jamais dévoilé avant.
  // Alignement RÉGLEMENTAIRE des lancers francs (2026-10-10 : « trop de
  // joueurs autour de la raquette ») : avant, les 9 autres joueurs étaient
  // tous alignés le long de la raquette. Désormais (FIBA/NBA) : le tireur
  // seul sur la ligne ; 5 emplacements de rebond au plus — 3 pour l'équipe
  // qui défend (les deux plus proches du panier + le 3e d'un côté), 2 pour
  // l'équipe du tireur (les 2es, en alternance) ; les 4 autres derrière la
  // ligne à 3 points et la ligne des lancers prolongée. Les plus grands
  // gabarits (créneau le plus haut) prennent les emplacements.
  // Pieds : ligne de fond à 0, raquette jusqu'à 19 (ligne des lancers),
  // côtés de la raquette à y = 17 et 33.
  function ftAlignment(t, shooter) {
    const rim = RIM[t], dir = rim.x > 47 ? -1 : 1, base = rim.x - dir * 5.25;
    const X = d => base + dir * d;
    const bySize = list => list.slice().sort((a, b) => b.slot - a.slot);
    const off = bySize(onCourt(t).filter(sp => sp !== shooter)), def = bySize(onCourt(1 - t));
    const out = [];
    const put = (sp, d, y, role) => { if (sp) out.push({ sp, x: X(d), y, role }); };
    put(def[0], 8.3, 16.2, "lane"); put(def[1], 8.3, 33.8, "lane");
    put(off[0], 11.3, 16.2, "lane"); put(off[1], 11.3, 33.8, "lane");
    put(def[2], 14.3, 16.2, "lane");
    const perim = [[31, 9], [31, 41], [33, 19.5], [33, 30.5], [29, 4], [29, 46]];
    [off[2], def[3], off[3], def[4], ...off.slice(4), ...def.slice(5)].filter(Boolean)
      .forEach((sp, i) => { const p = perim[i % perim.length]; put(sp, p[0], p[1], "perimeter"); });
    return { line: { x: X(19), y: 25 }, spots: out };
  }
  function alignForFreeThrow(t, shooter, ms, speed) {
    // Lancers francs : plus aucun remiseur verrouillé (le tireur pouvait
    // être resté « remiseur » côté table et y tirer ses lancers).
    if (inbounder) { diag("inbounder-released", { id: inbounder, why: "lancers francs" }); inbounder = null; }
    const al = ftAlignment(t, shooter);
    if (shooter) { busy(shooter, ms); moveTo(shooter, al.line.x, al.line.y, speed); }
    al.spots.forEach(({ sp, x, y }) => { busy(sp, ms); moveTo(sp, x, y, speed); });
    diag("ft-align", { team: t, lane: al.spots.filter(x => x.role === "lane").map(x => x.sp.team), perimeter: al.spots.filter(x => x.role === "perimeter").length });
    return al;
  }

  function buildPlan(na) {
    reseed("p" + actionKey(na, S && S.events ? S.events.length : 0));
    // Une scène est en cours (remise en jeu, rebond…) : on attend sa fin
    // avant de lancer la possession, sans jamais couper la chorégraphie.
    // Ballon mort : la possession suivante ne part qu'après la remise en jeu
    // (état LIVE). Garde-fou : un arrêt qui s'éternise (> 9 s) est signalé
    // et levé plutôt que de figer le direct.
    if (deadBall() && performance.now() - phaseAt > 9000) { anomalies++; diag("anomaly", { what: "dead-ball-stuck", phase, why: phaseWhy }); setPhase("LIVE", "garde-fou"); }
    // (lancers francs : ils se préparent PENDANT l'arrêt de jeu — c'est un
    // ballon mort par nature ; avant, le plan attendait la fin d'un ballon
    // mort qui ne venait jamais et les lancers se jouaient en version courte,
    // en retard sur le fil)
    const wait = Math.max(sceneUntil - performance.now(), deadBall() && na.kind !== "freeThrow" ? 250 : 0);
    if (wait > 0) {
      plan = { airAt: na.airAt, fired: false, pending: true };
      later(wait + 50, () => { if (plan && plan.airAt === na.airAt && plan.pending) buildPlan(na); });
      return;
    }
    const t0 = now();
    const total = na.airAt - t0;
    // Plan non joué (trop tard, action non planifiable) : `skipped`, pour que
    // l'arrivée de l'événement joue la version courte (et pas un ballon
    // téléporté au cercle comme si le tir était déjà parti).
    if (!(total > 1200)) { plan = { airAt: na.airAt, fired: true, skipped: true }; return; }
    const kind = na.kind;
    if (!PLANNED_KINDS.has(kind) || (kind === "rebound" && na.freeThrow)) { plan = { airAt: na.airAt, fired: true, skipped: true }; return; }
    const a = na.actors || {};
    // Équipe en attaque : celle que le moteur donne pour l'action
    // (possessionTeam = possession PENDANT l'action) ; repli pour un direct
    // antérieur.
    const offT = teamOf(na.possessionTeam) !== null && kind !== "rebound" ? na.possessionTeam
      : kind === "rebound" ? (na.offensive ? na.team : 1 - na.team)
      : kind === "foul" || kind === "unsportsmanlikeFoul" || kind === "technicalFoul" ? 1 - na.team
      : na.team;
    if (offT !== 0 && offT !== 1) { plan = { airAt: na.airAt, fired: true, skipped: true }; return; }
    // Tireur désigné par le moteur pas encore sur le terrain (il entre par un
    // changement appliqué juste avant l'action, 2026-10-10 : « tir de Greco
    // attribué à un autre ») : on attend son sprite au lieu de faire tirer
    // le dernier porteur ; trop tard → version courte, avec le bon tireur.
    if ((kind === "shot" || kind === "rebound" || kind === "freeThrow") && a.shooter && !spriteOf(a.shooter)) {
      diag("plan-wait", { why: "tireur pas encore entré", shooter: a.shooter });
      plan = { airAt: na.airAt, fired: false, pending: true };
      later(250, () => { if (plan && plan.airAt === na.airAt && plan.pending) buildPlan(na); });
      return;
    }
    if (possession !== offT) startPossession(offT);
    plan = { airAt: na.airAt, kind, offT, fired: false, steps: [] };
    // Les étapes ne valent que pour CE plan : un arrêt de jeu (temps mort,
    // fin de quart) le remplace, et ses minuteries déjà posées se taisent.
    const self = plan;
    const at = (frac, fn) => later(total * frac, () => { if (plan === self) fn(); });
    const shooter = spriteOf(a.shooter), assister = spriteOf(a.assister);
    // Porteur : celui que le moteur a désigné (na.passes[0] / na.actors.handler),
    // sinon celui qui a déjà le ballon, sinon le meneur.
    const real = spriteOf(na.passes && na.passes[0]) || spriteOf(a.handler);
    const current = ball.holder && spriteOf(ball.holder);
    const handler = (real && real.team === offT ? real : null) || (current && current.team === offT ? current : null) || handlerOf(offT);
    if (!handler) return;
    // Le ballon vient d'une remise en jeu / d'un rebond chez un coéquipier :
    // c'est lui qui commence la chaîne (passe au porteur réel). Sans
    // porteur, le ballon rejoint le porteur réel.
    const starter = current && current.team === offT ? current : null;
    if (!starter && ball.holder !== handler.id && !ball.flight) giveBall(handler);
    // Remontée : le porteur dribble jusqu'à la tête de raquette — sauf
    // violation des 8 s à venir (moteur) : il reste bloqué en zone arrière.
    const top = slotPos(offT, 0, true);
    if (kind === "turnover" && na.tovKind === "eightSeconds") { const own = RIM[1 - offT]; moveTo(handler, lerp(own.x, 47, 0.55), 18 + rand01() * 14, 1.2); }
    else moveTo(handler, top.x, top.y, 1.6);
    formation();
    if (kind === "freeThrow") {
      // Alignement pour les lancers francs, tir calé sur airAt.
      at(0.05, () => {
        const sh = shooter || handler;
        for (const sp of sprites.values()) sp.busy = false;
        alignForFreeThrow(offT, sh, total, 1.8);
        later(700, () => { if (plan === self && sh && ball.holder !== sh.id) flyTo(sh, 300, 1.5, () => giveBall(sh)); });
      });
      at(0.97, () => { fly({ x: RIM[offT].x, y: RIM[offT].y }, Math.max(350, total * 0.03), 6); plan.fired = true; firedAt = na.airAt; });
      return;
    }
    if (kind === "turnover" || kind === "outOfBounds" || kind === "foul" || kind === "unsportsmanlikeFoul" || kind === "technicalFoul") {
      // Chaîne réelle du moteur (porteur → créateur → joueur qui perd le
      // ballon / qui subit la faute) ; aucune passe inventée. Sur une faute
      // technique ou antisportive, `player` est le FAUTIF (défense) : il ne
      // reçoit jamais le ballon.
      const victim = (kind === "turnover" || kind === "foul") ? spriteOf(a.player) : null;
      const chain = [];
      // (le coéquipier qui a le ballon après une remise en jeu / un rebond
      // ouvre la chaîne : la perte n'est jamais jouée loin du ballon)
      for (const sp of [starter, handler, ...(na.passes || []).map(spriteOf), victim]) if (sp && sp.team === offT && chain[chain.length - 1] !== sp) chain.push(sp);
      const n = chain.length - 1;
      for (let i = 0; i < n; i++) at(n === 1 ? 0.7 : 0.45 + 0.3 * (i / (n - 1)), () => pass(chain[i], chain[i + 1]));
      // Faute (mission live 2026-10-10, « faute sifflée avant le contact ») :
      // le fautif réel vient au contact du fauté AVANT l'heure de la faute ;
      // le coup de sifflet (airAt) tombe sur un contact déjà visible.
      const fouler = kind === "foul" ? spriteOf(a.defender) : null;
      if (fouler && victim && fouler.team !== offT) {
        // Il reste au contact jusqu'au coup de sifflet (le fauté, tenu, ne
        // file plus) : re-visé toutes les 150 ms tant que ce plan vaut.
        let until = 0;
        const stick = () => { if (plan !== self) return; moveTo(fouler, victim.x + (fouler.x >= victim.x ? 1.4 : -1.4), victim.y + 0.4, 2.4); if (performance.now() < until) later(150, stick); };
        at(0.74, () => { const hold = total * 0.26 + 900; until = performance.now() + hold; busy(fouler, hold); busy(victim, hold); stick(); });
        self.contact = { d: fouler.id, v: victim.id };
      }
      return;
    }
    // Tir (kind shot ou rebound = tir manqué + rebond). Mise en scène des
    // FAITS du moteur (2026-10-07) : la chaîne de passes réelle
    // (porteur → créateur → tireur, `na.passes`), le type de tir
    // (`na.shotType`), l'emplacement (`na.shot`, issu du sous-secteur) et
    // le défenseur du tir (`na.actors.defender`, ouverture `na.quality`).
    const spot = na.shot ? { x: na.shot.x, y: na.shot.y } : slotPos(offT, shooter ? shooter.slot : 0, true);
    const rim = RIM[offT];
    const type = na.shotType || (na.zone === "three" ? "three" : na.zone === "paint" ? "layup" : "jumper");
    const drive = type === "layup" || type === "fastbreak";
    const flightMs = type === "three" ? 720 : drive ? 380 : type === "floater" ? 520 : type === "post" ? 480 : 600;
    const flightH = type === "three" ? 9 : drive ? 2.5 : type === "floater" ? 7 : type === "post" ? 4 : 8;
    // Chaîne de passes : ids réels, dédoublonnés, le tireur en dernier.
    const chain = [];
    for (const id of [...(na.passes || []), a.shooter]) { const sp = spriteOf(id); if (sp && sp.team === offT && chain[chain.length - 1] !== sp) chain.push(sp); }
    if (!chain.length && shooter) chain.push(shooter);
    if (chain[0] && chain[0] !== handler) chain.unshift(handler);
    if (starter && chain[0] && chain[0] !== starter) chain.unshift(starter);
    // Action très courte (enchaînée à 2,2 s d'une autre) : si la chaîne ne
    // tient pas avant le tir, on garde le premier porteur et le tireur (le
    // tireur reçoit toujours le ballon avant de tirer).
    while (chain.length > 2 && (chain.length - 1) * 360 > total - flightMs - 200) chain.splice(chain.length - 2, 1);
    const tShot = total - flightMs;
    const atMs = (ms, fn) => later(ms, () => { if (plan === self) fn(); });
    // Les passes se répartissent entre 35 % et 80 % du temps ; aucune passe
    // inventée : une chaîne d'un seul joueur = isolation / drive.
    const nPass = Math.max(0, chain.length - 1);
    // La dernière passe arrive avant le tir (vol ≤ ~700 ms) : le tir ne coupe
    // plus une passe en l'air.
    // Action courte : passes serrées dès maintenant.
    const shortPlan = tShot - 800 < 150 + 600 * Math.max(0, nPass - 1);
    const tLastPass = shortPlan ? Math.max(0, tShot - 480) : Math.min(total * 0.8, tShot - 800);
    const tFirstPass = shortPlan ? 0 : Math.max(150, Math.min(total * 0.35, tLastPass - 600 * Math.max(1, nPass - 1)));
    const times = [];
    for (let i = 0; i < nPass; i++) times.push(nPass === 1 ? tLastPass : tFirstPass + (tLastPass - tFirstPass) * (i / (nPass - 1)));
    // Circulation de balle (mission live 2026-10-10, « plus de passes
    // utiles, moins de dribble sur place ») : quand l'action laisse du temps
    // avant la chaîne réelle du moteur, le ballon tourne d'abord (renversements
    // vers des coéquipiers démarqués), puis revient au porteur qui lance la
    // chaîne réelle — la passe décisive reste celle du moteur. Cadence selon
    // l'identité de l'équipe (rythme Rapide / Lent).
    const swingEnd = (nPass ? times[0] : tShot - 700) - 450;
    const room = swingEnd - 1400;
    const startHolder = chain[0];
    if (startHolder && room > 1800) {
      const pace = teamPace(offT);
      const k = Math.min(3, Math.floor(room / (2100 * pace)));
      const pool = onCourt(offT).filter(sp => sp !== startHolder && sp !== shooter && !sp.leaving);
      let from = startHolder, tt = 1400;
      for (let i = 0; i < k - 1 && pool.length; i++) {
        const open = pool.map(sp => ({ sp, gap: Math.min(...onCourt(1 - offT).map(d => Math.hypot(d.tx - sp.tx, d.ty - sp.ty)), 99) }))
          .filter(o => o.sp !== from).sort((a, b) => b.gap - a.gap);
        const to = open.length ? open[Math.floor(rand01() * Math.min(2, open.length))].sp : null;
        if (!to) break;
        const f = from;
        atMs(tt, () => { if (ball.holder === f.id && !ball.flight) pass(f, to); });
        from = to; tt += room / k;
      }
      if (from !== startHolder) { const f = from; atMs(swingEnd, () => { if (ball.holder === f.id && !ball.flight) pass(f, startHolder); }); }
    }
    for (let i = 0; i < nPass; i++) {
      const from = chain[i], to = chain[i + 1], t = times[i];
      const lob = type === "post" && i === nPass - 1;   // entrée de balle au poste : lobée
      // Vol borné : arrivée avant la passe suivante, et au plus tard 120 ms avant le tir.
      const limit = (i + 1 < nPass ? times[i + 1] : tShot - 120) - t;
      atMs(t, () => pass(from, to, lob, limit));
    }
    // Filet (2026-10-10, « tir attribué à un autre ») : une passe prévue est
    // abandonnée si un autre ballon est encore en l'air à son heure (fin de
    // remise en jeu, passe précédente) — le tireur du moteur n'avait alors
    // jamais le ballon et c'est le porteur du moment qui tirait. Juste avant
    // le tir, il le reçoit : tout de suite, ou dès la réception en cours.
    // Après la DERNIÈRE passe programmée (action courte : elle tombe tard),
    // jamais avant — sinon une passe de la chaîne reprenait le ballon au
    // tireur.
    atMs(Math.max(0, tShot - 650, nPass ? times[nPass - 1] + 90 : 0), () => {
      if (!shooter || ball.holder === shooter.id || (ball.flight && ball.flight.target === shooter.id)) return;
      if (ball.flight) { const tgt = spriteOf(ball.flight.target); if (tgt && tgt.team === offT) pass(tgt, shooter, false, 260); return; }
      const h = ball.holder ? spriteOf(ball.holder) : null;
      if (!h || h.team === offT) { diag("shooter-catchup", { shooter: shooter.id, from: h ? h.id : null }); pass(h, shooter, false, 300); }
    });
    // Le tireur rejoint son emplacement (un drive attaque le cercle depuis
    // le périmètre ; un post-up se gagne dos au panier, lentement).
    const tMove = Math.max(150, Math.min(total * 0.55, tLastPass - 500));
    atMs(tMove, () => {
      if (!shooter) return;
      busy(shooter, total - tMove);
      if (drive) { const start = slotPos(offT, shooter.slot, true); moveTo(shooter, lerp(start.x, spot.x, 0.35), lerp(start.y, spot.y, 0.35), 1.4); }
      else moveTo(shooter, spot.x, spot.y, type === "post" ? 1.1 : 1.7);
    });
    if (drive) atMs(Math.max(tMove + 200, tShot - 900), () => { if (shooter) moveTo(shooter, spot.x, spot.y, 2.6); });
    // Défenseur du tir : contestation selon l'ouverture réelle du tir.
    const defender = spriteOf(a.defender) || spriteOf(a.blocker);
    if (defender && defender.team !== offT) {
      const q = na.quality || "contesté";
      const lateMs = q === "ouvert" ? 250 : q === "très contesté" ? -650 : -350;   // ouvert : il arrive après le tir
      const gap = na.foulType === "shooting" || na.fouled ? 0.9 : q === "très contesté" ? 1.2 : 2.2;
      atMs(Math.max(tMove, tShot + lateMs), () => { busy(defender, 1400); moveTo(defender, lerp(spot.x, rim.x, 0.08) + (rim.x > 47 ? gap : -gap), spot.y + 0.6, q === "ouvert" ? 1.8 : 2.6); });
    }
    later(Math.max(0, tShot), () => {
      if (plan !== self) return;
      // Le tir part : le ballon touche le cercle à airAt. Saut du tireur.
      // Le ballon part d'où il est (dans les mains du tireur, ou encore en
      // fin de passe) : plus de téléportation sur le tireur.
      const sh = shooter || spriteOf(ball.holder);
      // Passe vers le tireur encore en l'air (action très courte) : il la
      // reçoit maintenant, le tir part de ses mains. Ballon encore en l'air
      // vers un coéquipier (dernière passe tardive) : c'est aussi le tireur
      // du moteur qui le récupère — le tir ne part jamais d'un autre joueur.
      const inAir = ball.flight && sh && (ball.flight.target === sh.id || (spriteOf(ball.flight.target) || {}).team === offT);
      if (inAir || (sh && ball.holder && ball.holder !== sh.id && (spriteOf(ball.holder) || {}).team === offT)) { if (ball.flight) ball.flight.done = null; ball.flight = null; giveBall(sh); const h = sprites.get(sh.id); if (h) { ball.x = h.x; ball.y = h.y; } }
      diag("shot-release", { via: "plan", shooter: shooter ? shooter.id : null, from: sh ? sh.id : null, holder: ball.holder || null });
      if (sh) jump(sh, drive ? 0.9 : 1.15);
      if (defender && na.quality !== "ouvert") later(120, () => jump(defender, 1.1));
      fly({ x: rim.x, y: rim.y }, flightMs, flightH, null, "shot" + offT);
      plan.fired = true; firedAt = na.airAt;
    });
  }

  // ---------- file des événements ----------
  // Plusieurs événements peuvent arriver au même instant (panier + faute +
  // lancer franc) : on les joue à la suite, chacun avec le temps qu'il lui
  // faut, pour que le terrain reste lisible. Le fil du match, lui, les
  // affiche tout de suite.
  const queue = [];
  let busyUntil = 0, drainTimer = 0, firedAt = 0;   // firedAt : airAt du dernier tir parti à l'avance
  // Scène en cours (entre-deux, remise en jeu, rebond, temps mort, pause) :
  // tant qu'elle dure, le rendu périodique (chaque seconde côté client) ne
  // doit PAS « remettre de l'ordre » (ballon rendu au meneur + formation),
  // sinon il coupe la chorégraphie — c'était le cas de la remise en jeu et
  // de l'entre-deux (retour utilisateur 2026-10-01).
  let sceneUntil = 0, firstUpdate = true, lastSort = 0, sortKey = "", lastSortHolder = null;
  const scene = ms => { sceneUntil = Math.max(sceneUntil, performance.now() + ms); };
  const holdFor = e => (e.kind === "shot" || e.kind === "rebound") ? (e.made ? 3000 : 2000)
    : e.kind === "freeThrow" ? ((e.made || 0) > 0 ? 2800 : 2000)
    : e.kind === "turnover" ? 1400 : e.kind === "timeout" ? 3800 : e.kind === "tipoff" ? 3200 : e.kind === "quarterStart" ? (e.quarter === 1 ? 1600 : 2200) : e.kind === "substitution" ? 600 : 900;
  function drain() {
    if (drainTimer) return;
    const wait = busyUntil - performance.now();
    if (wait > 0) { drainTimer = later(wait, () => { drainTimer = 0; drain(); }); return; }
    const e = queue.shift();
    if (!e) return;
    const t0 = performance.now();
    playEvent(e);
    // Un tir déjà joué à l'avance (possession planifiée) ne retient que son résultat.
    const pre = (firedAt === e.airAt || (plan && plan.airAt === e.airAt && plan.fired)) && (e.kind === "shot" || e.kind === "rebound" || e.kind === "freeThrow");
    // Un tir réussi joué à l'avance garde tout son temps : la remise en jeu
    // qui suit en fait partie (retour 2026-10-01 : pas de remise en jeu
    // après un lancer franc marqué).
    const scored = e.made === true || (e.kind === "freeThrow" && (e.made || 0) > 0);
    busyUntil = t0 + (pre && !scored ? Math.min(holdFor(e), 1600) : holdFor(e));
    if (queue.length) drain();
  }

  // Perte de balle sans voleur (passe dehors, passe ratée, ballon mal
  // contrôlé) : jouée une fois que le joueur désigné a le ballon.
  function playLostTurnover(e, kind, nt, pl, a) {
    if (pl) flash(pl, "PERTE", "bad");
    moment("perte", { team: 1 - nt });
    if (kind === "passOut") { ballOut(nt, pl ? { x: pl.x, y: pl.y } : null, { key: "e" + e.id, why: "passe trop longue", lastTouch: "attack", kind, exit: overthrowExit(pl, spriteOf(a.receiver)), flightMs: 620 }); return; }
    if (kind === "legacyOut") { ballOut(nt, pl ? { x: pl.x, y: pl.y } : null, { key: "e" + e.id, why: "sortie", lastTouch: "attack" }); return; }
    looseTurnover(kind, nt, pl, spriteOf(a.receiver), spriteOf(a.recoverer));
  }

  // ---------- résultat d'une action (événement arrivé) ----------
  // Identité stable d'une action (voir reseed) : rang dans le fil, type,
  // acteurs, chrono — jamais l'heure de diffusion.
  const actionKey = (e, n) => [n, e.kind, e.quarter, e.clock, (e.actors && (e.actors.shooter || e.actors.player || e.actors.rebounder)) || "", e.made ? 1 : 0].join("|");
  function playEvent(e) {
    if (e.kind === "quote") return;   // commentaire du présentateur : fil seulement
    reseed("e" + actionKey(e, e.id));
    momentKey = actionKey(e, e.id);
    const a = e.actors || {};
    const shooter = spriteOf(a.shooter), assister = spriteOf(a.assister), t = e.team;
    const prePlayed = firedAt === e.airAt || !!(plan && plan.airAt === e.airAt && plan.fired && !plan.skipped);
    // Équipe qui a le ballon APRÈS cet événement, selon le moteur.
    const after = teamOf(e.possessionAfter);
    const prev = lastPlayed; lastPlayed = e;
    switch (e.kind) {
      case "tipoff": {
        // Entre-deux : les deux pivots au centre, les autres autour du rond
        // central, ballon lancé en l'air, l'équipe qui gagne (t) le récupère.
        scene(3200);
        const c = { x: 47, y: 25 };
        for (const sp of sprites.values()) sp.busy = true;
        [0, 1].forEach(team => {
          const dir = team === 0 ? -1 : 1;                 // chacun de son côté (0 attaque à droite)
          const list = onCourt(team).sort((a, b) => a.slot - b.slot);
          const jumper = list.find(sp => sp.slot === 4) || list[list.length - 1];
          list.forEach((sp, i) => {
            if (sp === jumper) { moveTo(sp, c.x + dir * 1.4, c.y, 1.6); return; }
            const ang = (i - 1.5) * 0.85;
            moveTo(sp, c.x + dir * (7.5 + Math.cos(ang) * 1.5), c.y + Math.sin(ang) * 7.5, 1.6);
          });
        });
        ball.holder = null; ball.flight = null; ball.x = c.x; ball.y = c.y;
        moment("entre_deux");
        later(1100, () => {
          fly({ x: c.x, y: c.y }, 800, 10, () => {
            const to = handlerOf(t) || onCourt(t)[0];
            if (!to) return;
            startPossession(t);
            flyTo(to, 380, 3, () => { for (const sp of sprites.values()) sp.busy = false; giveBall(to); setPhase("LIVE", "entre-deux"); formation(); });
          });
        });
        break;
      }
      case "shot": case "rebound": {
        const isReb = e.kind === "rebound";
        const offT = teamOf(e.possessionTeam) !== null && (!isReb || teamOf(e.possessionAfter) !== null) ? e.possessionTeam : isReb ? (e.offensive ? t : 1 - t) : t;
        possession = offT;
        // Équipe qui récupère le ballon : moteur (possessionAfter), sinon
        // celle du rebondeur / l'adversaire après un panier.
        const nextT = after !== null ? after : isReb ? t : e.made ? 1 - offT : offT;
        // Rebond après un tir contré déjà joué : le ballon est déjà libre.
        const afterBlock = isReb && prev && prev.kind === "shot" && prev.blocked && !prev.made;
        // Tir manqué SANS rebond derrière (contre : le rebond suit ; faute
        // sur le tir : les lancers suivent).
        const blockedShot = !isReb && !e.made && (e.blocked || !!a.blocker);
        const fouledShot = !isReb && !e.made && !blockedShot && (e.foulType === "shooting" || !!e.fouled || !!a.defender);
        const spot = e.shot ? { x: e.shot.x, y: e.shot.y } : slotPos(offT, shooter ? shooter.slot : 0, true);
        const rim = RIM[offT];
        const finish = () => {
          rimFx(offT, !!e.made);
          if (e.made) {
            flash(shooter, e.zone === "three" ? "+3" : "+2", "good", e.id);
            // Gros panier (3 points, dunk, buzzer) : flash de lumière et public debout.
            const big = e.zone === "three" || /dunk|smash/i.test(String(e.shotType || "")) || (typeof e.clock === "number" && e.clock <= 1);
            if (big) bigFlash();
            moment(typeof e.clock === "number" && e.clock <= 1 ? "buzzer" : /dunk|smash/i.test(String(e.shotType || "")) ? "dunk" : e.zone === "three" ? "trois_points" : "panier", { team: offT });
            later(350, () => { jump(shooter, 0.6); cheer(offT, big); });
            netDrop(rim);
            // Panier validé : ballon mort, score déjà à jour (moteur), le jeu
            // s'arrête jusqu'à la remise en jeu de l'équipe qui a encaissé
            // (ligne de fond de CE panier). Panier + faute (« and one ») : le
            // moteur laisse le ballon à l'attaque (possessionAfter), les
            // lancers suivent — pas de remise en jeu.
            setPhase("DEAD_BALL", "panier");
            plan = null;
            later(900, () => {
              if (after === null ? queue.some(q => q.kind === "foul" || q.kind === "freeThrow") : nextT === offT) return;
              inbound(nextT, rim, "e" + e.id, "panier");
            });
          } else if (blockedShot) {
            // Contre : le ballon part du contre et reste LIBRE ; le rebond
            // (événement suivant du moteur) dira qui le récupère.
            const bl = spriteOf(a.blocker); jump(bl, 1.3);
            banner(blockLabel(), "block");
            moment("contre", { team: 1 - offT });
            crowdReact("score", 1 - offT, true);   // contre : les supporters de la défense exultent
            const dir = rim.x > 47 ? -1 : 1;
            fly({ x: spot.x + dir * 4, y: spot.y + rnd(-4, 4) }, 260, 2.5, null, "", true);
          } else if (fouledShot) {
            // Faute sur le tir : pas de rebond, le tireur va aux lancers.
            // Faute VISIBLE (mission live 2026-10-10) : le défenseur du tir
            // est marqué, le tireur encaisse le contact.
            setPhase("DEAD_BALL", "faute sur tir");
            const df = spriteOf(a.defender);
            if (df) { flash(df, "FAUTE", "bad"); df.ring.setAttribute("opacity", "1"); fxTimer(1500, () => df.ring.setAttribute("opacity", "0")); }
            if (shooter) jump(shooter, 0.5);
            moment("faute", { team: 1 - offT });
            fly({ x: rim.x + (rim.x > 47 ? -2 : 2), y: rim.y + 1.5 }, 300, 1.5, () => { if (shooter && shooter.team === nextT) flyTo(shooter, 380, 2, () => giveBall(shooter)); });
          } else {
            // Rebond : le ballon rebondit sur le cercle (ou part du contre)
            // puis retombe ; le vrai rebondeur y va, les autres proches
            // s'approchent (lutte), et il saute pour le capter.
            const dir = rim.x > 47 ? -1 : 1;
            if (!isReb || !afterBlock) crowdReact("miss", offT);   // tir raté : déception
            // (rebond offensif : annoncé quand le rebondeur TIENT le ballon,
            // jamais pendant que le ballon est encore en l'air)
            if (!isReb) moment("rate", { team: offT });
            const mk = momentKey;
            const drop = { x: rim.x + dir * rnd(3, 9), y: rim.y + rnd(-7, 7) };
            const hop = afterBlock ? { x: ball.x, y: ball.y } : { x: rim.x + dir * rnd(0.5, 2), y: rim.y + rnd(-1.5, 1.5) };
            scene(1700);
            // Rebondeur désigné par le moteur, de l'équipe qui récupère.
            const named = spriteOf(a.rebounder);
            const rb = named && named.team === nextT ? named : handlerOf(nextT);
            const near = [...sprites.values()].filter(sp => sp !== rb && !sp.leaving && Math.hypot(sp.x - rim.x, sp.y - rim.y) < 14).slice(0, 3);
            // (vols à vitesse régulière : le ballon ne marque pas d'arrêt entre le cercle et le sol)
            fly(hop, 200, 2.5, () => {
              near.forEach(sp => { busy(sp, 900); moveTo(sp, lerp(sp.x, drop.x, 0.5) + rnd(-1.5, 1.5), lerp(sp.y, drop.y, 0.5) + rnd(-1.5, 1.5), 1.6); });
              // Le rebondeur va là où le ballon sera (il rebondit et roule).
              const catchAt = looseAt(hop, drop, 420, 3.5, 700);
              if (rb) { busy(rb, 1000); moveTo(rb, catchAt.x + rnd(-0.6, 0.6), catchAt.y + rnd(-0.6, 0.6), 2.4); }
              fly(drop, 420, 3.5, () => {
                if (rb) jump(rb, 1);
                later(700, () => { startPossession(nextT); giveBall(rb); if (rb && isReb) flash(rb, "REB"); if (isReb && e.offensive && ball.holder === (rb && rb.id)) { const cur = momentKey; momentKey = mk; moment("rebond_offensif", { team: nextT }); momentKey = cur; } setPhase("LIVE", "rebond"); formation(); });
              }, "", true);
            }, "", true);
          }
        };
        if (afterBlock) { finish(); break; }
        // Rebond d'un dernier lancer franc manqué (moteur, 2026-10-10) : le
        // ballon est au cercle, le rebondeur est celui de l'événement.
        if (isReb && e.freeThrow) { ball.flight = null; if (Math.hypot(ball.x - rim.x, ball.y - rim.y) > 3) { ball.x = rim.x; ball.y = rim.y; } finish(); break; }
        if (prePlayed) { ball.flight = null; if (!blockedShot) { ball.x = rim.x; ball.y = rim.y; } finish(); break; }
        // Pas de plan (première action, reconnexion) : version courte.
        const cur = spriteOf(ball.holder);
        const handler = (cur && cur.team === offT ? cur : null) || handlerOf(offT);
        let delay = 0;
        if (shooter) { busy(shooter, 1800); moveTo(shooter, spot.x, spot.y, 2); }
        if (handler && ball.holder !== handler.id && !ball.flight) giveBall(handler);
        if (assister && assister !== handler && assister !== shooter) { later(delay, () => pass(handler, assister)); delay += 420; }
        if (shooter && (handler !== shooter || assister)) { later(delay, () => pass(assister || handler, shooter)); delay += 450; }
        // Le tir part TOUJOURS des mains du tireur du moteur (2026-10-10) :
        // une passe abandonnée (ballon encore en l'air à son heure) est
        // rattrapée avant le tir, au lieu de faire tirer le porteur du moment.
        let shotGone = false;
        const shootNow = () => { if (shotGone) return; shotGone = true; diag("shot-release", { via: "court", shooter: shooter ? shooter.id : null, holder: ball.holder || null }); fly({ x: rim.x, y: rim.y }, e.zone === "three" ? 700 : 520, e.zone === "paint" ? 4 : 8, finish, "shot" + offT); };
        later(delay + 250 + 1100, shootNow);   // garantie : le tir part quoi qu'il arrive
        later(delay + 250, () => {
          if (!shooter || ball.holder === shooter.id) { shootNow(); return; }
          diag("shooter-catchup", { shooter: shooter.id, from: ball.holder || null, short: true });
          if (ball.flight) {
            const tgt = ball.flight.target === shooter.id ? null : spriteOf(ball.flight.target), d = ball.flight.done;
            ball.flight.done = () => { if (d) d(); if (tgt) { pass(tgt, shooter, false, 260); later(480, shootNow); } else later(260, shootNow); };
            return;
          }
          pass(spriteOf(ball.holder), shooter, false, 260); later(480, shootNow);
        });
        break;
      }
      case "freeThrow": {
        possession = t;
        const rim = RIM[t], dir = rim.x > 47 ? -1 : 1;
        const made = (e.made || 0) > 0;
        // Équipe qui a le ballon après les lancers (moteur) : l'adversaire en
        // général ; l'équipe qui tire si la possession continue (faute
        // technique / antisportive au milieu d'une action).
        const nextT = after !== null ? after : 1 - t;
        // Un événement par lancer (moteur 2026-10-09) : avant le dernier de la
        // série, l'arbitre rend le ballon au tireur, tout le monde reste
        // aligné (un changement peut se glisser entre deux lancers).
        const more = e.of > 1 && e.attempt < e.of;
        setPhase("DEAD_BALL", "lancers francs");
        const finish = () => {
          rimFx(t, made); if (made) { flash(shooter, "+" + e.made, "good", e.id); netDrop(rim); }
          // « AND ONE » (mission 2026-10-10) : panier + faute, PUIS lancer
          // additionnel RÉUSSI — affiché à la confirmation du lancer (cet
          // événement du moteur), une seule fois par lancer ; jamais sur la
          // faute, jamais sur un lancer raté.
          if (made && e.foulType === "andOne") andOneBanner(e.id);
          crowdReact(made ? "score" : "miss", t);
          moment(made ? "lancer_reussi" : "lancer_rate", { team: t });
          scene(more ? 2400 : 1500);
          if (more) {
            later(450, () => {
              // Réalignement (un changement a pu se glisser entre deux lancers).
              const al = alignForFreeThrow(t, shooter, 2200, 1.4);
              if (shooter) flyTo(shooter, 420, 2, () => giveBall(shooter));
              else { ball.flight = null; ball.x = al.line.x; ball.y = al.line.y; }
            });
            return;
          }
          later(500, () => {
            for (const sp of sprites.values()) sp.busy = false;
            // Lancers d'une faute technique / antisportive : l'équipe qui a
            // tiré garde le ballon, remise en jeu en touche (pas de rebond).
            if (nextT === t) { sidelineInbound(t, { x: 47 + (RIM[t].x > 47 ? 1 : -1) * 4, y: 50 }, { key: "e" + e.id, why: "après lancers" }); return; }
            // Dernier lancer réussi : remise en jeu adverse, ligne de fond.
            if (made) { inbound(nextT, rim, "e" + e.id, "lancer réussi"); return; }
            // Lancer manqué suivi d'un rebond (moteur, `rebound`) : le ballon
            // reste au cercle, l'événement « rebond » désigne le rebondeur.
            if (e.rebound) { setPhase("DEAD_BALL", "rebond de lancer"); fly({ x: rim.x - dir * 1.2, y: rim.y }, 200, 2, null, "", true); return; }
            // Direct plus ancien (sans rebond dans le fil) : son joueur le plus grand.
            const rb = onCourt(nextT).sort((a, b) => b.slot - a.slot)[0];
            const drop = { x: rim.x - dir * rnd(2, 5), y: rim.y + rnd(-5, 5) };
            const ftFrom = { x: ball.x, y: ball.y }, ftCatch = looseAt(ftFrom, drop, 380, 3, 750);
            fly(drop, 380, 3, () => {
              if (rb) { busy(rb, 700); moveTo(rb, ftCatch.x, ftCatch.y, 2.2); }
              later(750, () => { startPossession(nextT); giveBall(rb || handlerOf(nextT)); setPhase("LIVE", "rebond après lancer"); formation(); });
            }, "", true);
          });
        };
        if (prePlayed) { ball.flight = null; ball.x = rim.x; ball.y = rim.y; finish(); break; }
        alignForFreeThrow(t, shooter, 2600, 1.6);
        // Lancers joués après leur diffusion (version courte) : si le moteur a
        // déjà rendu le ballon à l'adversaire, le tireur ne le « porte » pas,
        // le ballon passe seulement par ses mains avant le cercle.
        later(900, () => { if (shooter && ball.holder !== shooter.id) flyTo(shooter, 300, 1.5, nextT === t ? () => giveBall(shooter) : null); });
        later(1400, () => fly({ x: rim.x, y: rim.y }, 600, 6, finish));
        break;
      }
      case "turnover": {
        // Perte de balle EN SITUATION (moteur, 2026-10-09, `tovKind`) : la
        // passe ratée a une cause visible, et le ballon ne sort que si la
        // trajectoire l'emmène réellement hors des lignes.
        const nt = after !== null ? after : 1 - t;
        const stl = spriteOf(a.stealer), st = stl && stl.team === nt ? stl : null;
        const pl = spriteOf(a.player) || spriteOf(ball.holder);
        const kind = e.tovKind || (st ? "strip" : e.deadBall === false ? "passLoose" : "legacyOut");
        plan = null;
        // Violation (moteur, 2026-10-10 : 8 s, 24 s, retour en zone arrière) :
        // coup de sifflet, jeu arrêté, remise en jeu adverse en touche.
        if (e.tovType === "violation") {
          setPhase("DEAD_BALL", "violation " + kind);
          freezePlayers(900);
          if (pl) flash(pl, kind === "eightSeconds" ? "8 S" : kind === "shotClock" ? "24 S" : "RETOUR", "bad");
          moment("perte", { team: 1 - nt });
          scene(3200);
          const at = kind === "shotClock" ? { x: ball.x, y: ball.y < 25 ? 0 : 50 } : { x: RIM[nt].x > 47 ? 40 : 54, y: 50 };
          later(900, () => sidelineInbound(nt, at, { key: "e" + e.id, why: "violation " + kind }));
          break;
        }
        diag("turnover", { tov: kind, team: nt, passer: a.player || null, receiver: a.receiver || null, recoverer: a.recoverer || a.stealer || null });
        if (kind === "intercept" && st) { interceptPass(nt, pl, spriteOf(a.receiver), st); break; }
        if (st) {
          startPossession(nt);
          setPhase("LIVE", "interception");
          busy(st, 900);
          if (pl) moveTo(st, pl.x + (st.team === 0 ? -1 : 1), pl.y + 1, 2.4);
          flash(st, "INT", "good");
          moment("interception", { team: nt });
          flyTo(st, 420, 1.5, () => giveBall(st));
          later(900, () => formation());
          break;
        }
        // Le joueur que le moteur désigne a le ballon AVANT de le perdre
        // (mission live 2026-10-10 : « perte attribuée à un joueur qui n'a
        // jamais touché le ballon ») : passe rapide du porteur du moment.
        const holder = ball.holder ? spriteOf(ball.holder) : null;
        if (pl && holder && holder !== pl && holder.team === pl.team && !ball.flight) {
          pass(holder, pl, false, 260);
          later(340, () => playLostTurnover(e, kind, nt, pl, a));
          break;
        }
        playLostTurnover(e, kind, nt, pl, a);
        break;
      }
      case "outOfBounds": {
        // Ballon dévié en touche par un DÉFENSEUR (moteur, 2026-10-09) :
        // l'attaque le garde (possessionAfter), remise en jeu en touche, le
        // chrono des 24 s continue.
        const offT = after !== null ? after : 1 - t;
        const d = spriteOf(a.player);
        if (d) { busy(d, 700); jump(d, 0.4); flash(d, "SORTIE", "bad"); }
        moment("perte", { team: offT });
        ballOut(offT, d ? { x: d.x, y: d.y } : null, { key: "e" + e.id, why: "sortie (défense)", lastTouch: "defense", keepClock: true });
        break;
      }
      case "foul": case "unsportsmanlikeFoul": case "technicalFoul": {
        // Fautif (réel) et victime (réelle, `player` sur une faute simple) :
        // contact joué — le fautif vient au contact, la victime encaisse.
        // Fautif : le défenseur réel ; sur une faute technique/antisportive,
        // `player` est le fautif. Plus de repli sur un joueur quelconque.
        const d = spriteOf(a.defender) || (e.kind !== "foul" ? spriteOf(a.player) : null);
        const v = e.kind === "foul" ? spriteOf(a.player) : null;
        const andOne = e.foulType === "andOne";
        // Signal (FAUTE, cercle, commentaire) SEULEMENT une fois le contact
        // visible (mission live 2026-10-10) : le fautif est déjà au contact
        // (possession planifiée) ou y court ; au plus 700 ms d'attente.
        const signal = () => {
          flash(d, e.kind === "technicalFoul" ? "TECHNIQUE" : e.kind === "unsportsmanlikeFoul" ? "ANTISPORTIVE" : "FAUTE", "bad");
          // (« AND ONE » : plus ici — mission 2026-10-10 — seulement quand le
          // lancer franc additionnel est RÉUSSI, voir case "freeThrow".)
          moment(e.kind === "technicalFoul" ? "faute_technique" : e.kind === "unsportsmanlikeFoul" ? "antisportive" : "faute", { team: t });
          if (d) { d.ring.setAttribute("opacity", "1"); fxTimer(1500, () => d.ring.setAttribute("opacity", "0")); }
        };
        if (d && v && d !== v && !andOne) {
          busy(d, 900); busy(v, 900); moveTo(d, v.x + (d.x >= v.x ? 1.6 : -1.6), v.y + 0.4, 2.6);
          const t0 = performance.now();
          const waitContact = () => {
            if (Math.hypot(d.x - v.x, d.y - v.y) < 2.6 || performance.now() - t0 > 700) { jump(v, 0.5); signal(); return; }
            later(60, waitContact);
          };
          waitContact();
        } else { if (andOne && v) jump(v, 0.4); signal(); }
        // Faute simple sans lancers francs : arrêt, puis remise en jeu en
        // touche par l'équipe fautée (jamais de jeu qui continue sous la
        // faute). Lancers à suivre (bonus, faute sur tir) : rien ici.
        const offT = e.kind === "foul" ? 1 - t : null;
        const ftNext = queue.some(q => q.kind === "freeThrow") || !!(S && S.nextAction && S.nextAction.kind === "freeThrow");
        setPhase("DEAD_BALL", e.kind === "foul" ? "faute" : "faute technique / antisportive");
        plan = null;
        if (e.kind === "foul" && e.foulType === "common" && !ftNext && (offT === 0 || offT === 1) && (after === null || after === offT)) {
          scene(3400);
          const spot = v ? { x: v.x, y: v.y } : null;
          later(800, () => sidelineInbound(offT, spot, { key: "e" + e.id, why: "faute", keepClock: true }));
        }
        break;
      }
      case "foulOut": case "technicalEjection": case "injury": { flash(spriteOf(a.player), e.kind === "injury" ? "BLESSÉ" : "EXCLU", "bad"); moment(e.kind === "injury" ? "blessure" : "exclusion", { team: t }); break; }
      case "substitution": case "shortHanded": {
        const p = spriteOf(a.player); if (p) flash(p, "SORT");
        if (e.kind === "substitution") moment("changement", { team: t });
        later(1600, () => { const r = spriteOf(a.replacement); if (r) flash(r, "ENTRE", "good"); });
        if (heldInbound) later(250, () => releaseInbound(false));
        break;
      }
      case "quarterStart": {
        for (const sp of sprites.values()) sp.busy = false;
        sceneUntil = 0; stopUntil = 0;
        if (e.quarter === 1) {
          // Entrée des joueurs : du banc vers le rond central, l'entre-deux suit.
          setPhase("PREGAME", "entrée des joueurs");
          scene(2500);
          ball.holder = null; ball.flight = null; ball.x = 47; ball.y = 25;
          for (const sp of sprites.values()) { const dir = sp.team === 0 ? -1 : 1; moveTo(sp, 47 + dir * (8 + sp.slot * 2), 25 + (sp.slot - 2) * 5, 1.3); busy(sp, 2400); }
          break;
        }
        moment("debut_quart", { quarter: e.quarter });
        // Reprise : remise en jeu de l'équipe en possession depuis sa ligne de fond.
        const pt = teamOf(e.possessionTeam) !== null ? e.possessionTeam : teamOf(ownerTeam()) !== null ? ownerTeam() : possession;
        setPhase("DEAD_BALL", "début de quart");
        inbound(pt, RIM[1 - pt], "q" + e.quarter, "début de quart");
        break;
      }
      case "quarterEnd": {
        // Tout le monde au banc jusqu'au début du quart suivant (la fin du
        // match est annoncée par le passage au statut « final »).
        if (S && S.status !== "final" && !(e.quarter >= 4)) moment(e.quarter === 2 ? "mi_temps" : "fin_quart", { quarter: e.quarter });
        scene(60 * 60 * 1000);
        stopUntil = performance.now() + 60 * 60 * 1000;
        plan = null; heldInbound = null;
        setPhase("PERIOD_END", "fin du quart " + e.quarter);
        for (const sp of sprites.values()) { const p = parkLine(sp.team, sp.slot); moveTo(sp, p.x, p.y, 1.3); busy(sp, 4000); }
        ball.holder = null; ball.flight = null;
        break;
      }
      case "timeout": {
        // Au banc pendant toute la pause (durée réelle du temps mort si le
        // fil la donne, 60 s côté serveur) ; la reprise vient de la
        // possession suivante (buildPlan attend la fin de scène).
        // Durée : celle du fil, sinon celle de l'arrêt du moteur (S.stoppage).
        const stRem = S && S.stoppage && S.stoppage.endsAt ? S.stoppage.endsAt - now() : 0;
        const hold = Math.max(e.durationMs || 0, stRem) || 4200;
        moment("temps_mort", { team: t });
        scene(hold);
        stopUntil = performance.now() + hold;
        heldInbound = null;
        setPhase("TIMEOUT", "temps mort");
        // La possession planifiée avant l'arrêt est oubliée : elle sera
        // reconstruite à la reprise (buildPlan attend la fin de scène), et
        // ses étapes déjà posées ne déplacent plus personne.
        plan = null;
        // Chacun rejoint le regroupement autour du coach, devant SON banc, d'un pas rapide.
        for (const t of [0, 1]) onCourt(t).sort((a, b) => a.slot - b.slot).forEach((sp, i) => { const p = huddlePos(t, i, 5, 0); moveTo(sp, p.x, p.y, 1.5); busy(sp, hold - 600); });
        ball.holder = null; ball.flight = null;
        // Reprise : remise en jeu en touche (zone arrière) de l'équipe qui a
        // le ballon. Déclenchée par la FIN RÉELLE du temps mort (état du
        // direct, voir checkResume), plus par une minuterie que la
        // suspension / le recalage pouvaient effacer (mission live
        // 2026-10-10 : « pas de remise en jeu après un temps mort »).
        armResume(S && S.stoppage && S.stoppage.kind === "timeout" ? S.stoppage.startAt : e.airAt, now() + hold);
        break;
      }
      default: break;
    }
    if (e.text) say(e.text);
  }

  // Reprise après un temps mort : une seule fois par temps mort (clé = son
  // début), à 0,6 s de sa fin, même après un recalage ou un retour sur
  // l'onglet. Lancers francs à suivre : pas de remise en jeu (les lancers
  // reprennent). Arrivé longtemps après la fin : le recalage a déjà
  // replacé le jeu, rien à rejouer.
  let resume = null;
  function armResume(startAt, endsAt) {
    if (!Number.isFinite(endsAt)) return;
    const key = "to" + (Number.isFinite(startAt) ? startAt : endsAt);
    if (resume && resume.key === key) return;
    resume = { key, endsAt, done: false };
  }
  function checkResume() {
    if (!resume || resume.done || suspended || !S || S.status !== "live") return;
    const t = now();
    if (t < resume.endsAt - 600) return;
    resume.done = true;
    if (t - resume.endsAt > 5000) return;
    stopUntil = 0; sceneUntil = 0;
    for (const sp of sprites.values()) sp.busy = false;
    const own = ownerTeam(); if (own !== null) possession = own;
    setPhase("DEAD_BALL", "reprise après temps mort");
    if (ftPending()) {
      // Lancers à reprendre : tout le monde se réaligne, le tireur reçoit le ballon.
      diag("resume", { key: resume.key, then: "lancers francs" });
      const na = S.nextAction && S.nextAction.kind === "freeThrow" ? S.nextAction : queue.find(q => q.kind === "freeThrow");
      const ft = na && (na.team === 0 || na.team === 1) ? na.team : possession;
      const shSp = spriteOf(na && na.actors && na.actors.shooter);
      possession = ft;
      alignForFreeThrow(ft, shSp, 3200, 1.9);
      if (shSp) later(900, () => { if (ball.holder !== shSp.id) flyTo(shSp, 400, 2, () => giveBall(shSp)); });
      return;
    }
    diag("resume", { key: resume.key, then: "remise en jeu" });
    sidelineInbound(possession, { x: 47 + (RIM[possession].x > 47 ? -10 : 10), y: 50 }, { key: resume.key, why: "reprise après temps mort", keepClock: true });
  }

  // Médaillons des cinq en jeu : avatar, points / rebonds / passes.
  // ---------- onglet masqué / reprise (2026-10-08) ----------
  // Cause du bug « le direct part en vrille après un changement d'onglet » :
  // onglet masqué, requestAnimationFrame s'arrête (plus de rendu ni de
  // déplacement) mais la page continue d'appeler update() et TOUTE la
  // chorégraphie à base de minuteries (passes, tirs, rebonds, remises en
  // jeu, temps morts, plan de possession) continue, bridée et par paquets :
  // vols de ballon jamais terminés, passes enchaînées sur un état figé,
  // cibles contradictoires ; au retour tout se déclenche d'un coup.
  // Correctif : à la mise en arrière-plan on SUSPEND (minuteries de mise en
  // scène annulées, file vidée, événements seulement absorbés) ; au retour
  // on RECALE sur l'état courant du moteur (possession, arrêt de jeu,
  // statut, cinq en jeu) sans rejouer ni inventer quoi que ce soit, horloge
  // de rendu remise à l'instant présent. Une seule boucle de rendu (rAF)
  // et un seul écouteur, retirés à destroy().
  let suspended = false, resyncCount = 0, throttled = false;
  let lastStatus = null;   // dernier statut vu par update() (fin du match → commentaire)
  // Temps du match (2026-10-08, « le chrono démarre au chargement » et « le
  // live part en vrille quand on avance le temps ») :
  //  - `gameOn` : l'entre-deux du moteur (premier vrai événement de jeu,
  //    `tipoff`) a été diffusé. Avant : personne n'a le ballon, personne
  //    ne se promène, le chrono des 24 s reste figé — même si la page est
  //    ouverte depuis longtemps ou que le temps a été avancé.
  //  - `tl` : signature du fil reçu (nombre d'événements, dernier vu) et
  //    horloges au dernier état ; un fil reconstruit ou décalé (curseur de
  //    rediffusion, ±30 s), une horloge de diffusion qui bondit par rapport
  //    au temps réellement écoulé dans la page, une rafale d'événements =
  //    SAUT : recalage sur l'état du moteur (resync), rien n'est rejoué en
  //    accéléré.
  let gameOn = false, jumps = 0, lastUpdateAt = 0;
  let tl = null;
  // Événement encore à jouer (arrivé dans cette mise à jour, ou il y a moins de 6 s).
  const fresh0 = e => !!(e && e.airAt && now() - e.airAt < STALE_EVENT_MS);
  const isGameEvent = e => e && e.kind && e.kind !== "quarterStart" && e.kind !== "quote" && e.kind !== "timeout";
  const evSig = e => (e ? `${e.id}@${e.airAt || 0}:${e.kind}` : "");
  function clearChoreo() {
    timers.forEach(clearTimeout); timers.clear();
    drainTimer = 0; queue.length = 0; plan = null; heldInbound = null; inbounder = null;
  }
  function suspend() {
    if (suspended) return;
    suspended = true;
    clearChoreo(); clearFx();
  }
  // Recalage sur l'état du moteur. `soft` (terrain visible et à jour) : les
  // joueurs REJOIGNENT leurs places en courant, le ballon est passé au
  // porteur — jamais de téléportation sous les yeux du spectateur (cause du
  // « joueur qui se retrouve à l'autre bout du terrain » : un recalage
  // déclenché pendant qu'on regarde — rafale d'événements, retour de la
  // carte des tirs, horloge qui saute — replaçait tout le monde d'un coup
  // sur la formation de la nouvelle possession, souvent dans l'autre
  // moitié). Recalage instantané seulement quand rien n'était affiché
  // (onglet masqué, images gelées, vue non rafraîchie).
  function resync(reason = "?", soft = false) {
    suspended = false;
    resyncCount++;
    diag("resync", { reason, soft, possession: S && S.possession });
    clearChoreo(); clearFx();
    busyUntil = 0; sceneUntil = 0; firedAt = 0;
    ball.flight = null; ball.z = 0; endTrail();
    for (const [id, sp] of sprites) {
      if (sp.leaving) { sp.g.remove(); sprites.delete(id); continue; }
      sp.busy = false; sp.entering = 0; sp.jump = null; sp.cut = false; sp.ox = 0; sp.oy = 0;
    }
    benchKey = null;
    last = performance.now();
    if (!S) return;
    resyncing = true;
    try { syncRoster(); } finally { resyncing = false; }
    syncBench();
    const live = S.status === "live";
    const st = S.stoppage;
    const tNow = now();
    if (S.possession === 0 || S.possession === 1) possession = S.possession;
    // Arrêt de jeu en cours selon le moteur (temps mort, pause) : tout le
    // monde au banc ; sinon jeu en cours ; hors direct : au banc.
    stopUntil = live && st && st.endsAt > tNow ? performance.now() + (st.endsAt - tNow) : live ? 0 : performance.now() + 3600e3;
    const inPlay = live && gameOn && performance.now() >= stopUntil;
    const prevHolder = ball.holder;
    ball.holder = null;
    lastInboundKey = null;
    setPhase(inPlay ? "LIVE" : live && st && st.kind === "timeout" && st.endsAt > tNow ? "TIMEOUT" : live && !gameOn ? "PREGAME" : "PERIOD_END", "recalage");
    if (inPlay) {
      formation();
      // (un joueur tenu par la mise en scène — entrée, regroupement, banc —
      // n'est jamais déplacé d'office : c'est elle qui le guide)
      if (!soft) for (const sp of sprites.values()) { if (sp.stage) continue; sp.x = sp.tx; sp.y = sp.ty; sp.moving = false; }
      const h = handlerOf(possession);
      if (h && soft) {
        // Ballon rendu au porteur par une passe (ou gardé s'il l'avait déjà).
        if (prevHolder === h.id) giveBall(h);
        else { ball.flight = null; flyTo(h, 450, 2.2, () => giveBall(h), "pass"); }
      } else if (h) { giveBall(h); ball.x = h.x; ball.y = h.y; }
      crossed = !!h && inFront(h.team, h.x);
    } else if (live && !gameOn && performance.now() >= stopUntil) {
      // Avant l'entre-deux : alignés autour du rond central, ballon au centre.
      for (const sp of sprites.values()) { if (sp.stage) continue; const dir = sp.team === 0 ? -1 : 1; place(sp, 47 + dir * (8 + sp.slot * 2), 25 + (sp.slot - 2) * 5, soft); }
      ball.x = 47; ball.y = 25;
    } else if (live && st && st.kind === "timeout" && st.endsAt > tNow) {
      for (const t of [0, 1]) onCourt(t).sort((a, b) => a.slot - b.slot).forEach((sp, i) => { if (sp.stage) return; const p = huddlePos(t, i, 5, 0); place(sp, p.x, p.y, soft); });
      ball.x = 47; ball.y = 25;
    } else {
      for (const sp of sprites.values()) { if (sp.stage) continue; const p = parkLine(sp.team, sp.slot); place(sp, p.x, p.y, soft); }
      ball.x = 47; ball.y = 25;
    }
    for (const b of benchRefs.values()) { const p = benchTarget(b); b.x = b.tx = p.x; b.y = b.ty = p.y; halt(b); b.tf = ""; }
    ball.loose = null;
    possStart = tNow;
    const evs = (S.events || []).filter(e => e.kind !== "quote");
    lastPlayed = evs.length ? evs[evs.length - 1] : lastPlayed;
    lastRefs = 0; steerRefs(performance.now());
    for (const r of refs) { r.x = r.tx; r.y = r.ty; r.ox = 0; r.oy = 0; r.moving = false; }
    ballOff.x = 0; ballOff.y = 0;
    ballFix.x = 0; ballFix.y = 0; ballPrev = null; ball.drib = 0; ball.dribOf = null;
    if (!soft) for (const sp of sprites.values()) { if (!sp.stage) halt(sp); sp.nextDrift = 0; }
    for (const r of refs) halt(r);
  }
  // Recalage d'un joueur : instantané (rien n'était affiché) ou en courant.
  function place(sp, x, y, soft) {
    if (soft) { moveTo(sp, x, y, 1.8); return; }
    sp.x = sp.tx = x; sp.y = sp.ty = y; sp.moving = false;
  }
  let resyncing = false;
  function onVisibility() {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "hidden") { throttled = false; suspend(); }
    else if (suspended) { throttled = false; resync("retour sur l'onglet"); }
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState === "hidden") suspended = true;
  }

  // ---------- énergie / fautes sous les jetons, banc des remplaçants ----------
  // (2026-10-08, refonte arène : remplacent les cartes du haut.) Barre
  // d'énergie fine (100 − fatigue du moteur) sous chaque jeton, pastille de
  // fautes à partir de 4 ; détail complet au toucher / survol (bulle).
  const pdata = new Map();               // id → dernière ligne joueur reçue
  function energyOf(p) { return p && typeof p.fatigue === "number" ? Math.max(0, Math.min(100, 100 - p.fatigue)) : -1; }
  function paintStats(r, p) {
    const pf = Math.max(0, Math.min(5, (p && p.pf) || 0)), en = energyOf(p);
    if (pf !== r.pf) {
      r.pf = pf;
      r.foul.setAttribute("opacity", pf >= 4 ? "1" : "0");
      r.foulC.setAttribute("fill", pf >= 5 ? "#FF4D4D" : "#F5A13A");
      r.foulT.textContent = String(pf);
    }
    if (en !== r.en) {
      r.en = en;
      r.eg.setAttribute("opacity", en < 0 ? "0" : "1");
      if (en >= 0) { r.bar.setAttribute("width", (r.w * en / 100).toFixed(1)); r.bar.setAttribute("fill", en > 60 ? "#3ecf67" : en > 35 ? "#F5A13A" : "#FF5B5B"); }
    }
  }
  function statsDecor(g, t, w, y) {
    const eg = el("g", { class: "c2d-energy", opacity: "0" }, g);
    el("rect", { x: -w / 2, y, width: w, height: "3.4", rx: "1.7", fill: "rgba(0,0,0,.55)" }, eg);
    const bar = el("rect", { x: -w / 2, y, width: w, height: "3.4", rx: "1.7", fill: "#3ecf67" }, eg);
    const foul = el("g", { class: "c2d-foul", opacity: "0", transform: `translate(${t === 0 ? 17 : -17} 4)` }, g);
    const foulC = el("circle", { r: "6.4", fill: "#F5A13A", stroke: "#0b1220", "stroke-width": "1.4" }, foul);
    const foulT = el("text", { y: "2.9", "text-anchor": "middle", "data-no-i18n": "1" }, foul);
    return { eg, bar, w, foul, foulC, foulT, pf: -1, en: -2 };
  }
  function syncTokenStats() {
    for (const sp of sprites.values()) if (sp.stats) paintStats(sp.stats, pdata.get(sp.id));
    for (const b of benchRefs.values()) paintStats(b.stats, pdata.get(b.id));
  }
  // Bulle de détail (toucher / survol d'un jeton ou d'un remplaçant).
  const tip = document.createElement("div");
  tip.className = "c2d-tip"; tip.hidden = true;
  host.appendChild(tip);
  let tipId = null;
  function showTip(id, g) {
    const p = pdata.get(id); if (!p || !g || typeof g.getBoundingClientRect !== "function") return;
    const en = energyOf(p), pf = p.pf || 0;
    tip.innerHTML = `<b>${esc(p.name || "")}</b>${Number.isInteger(p.number) ? ` <span>#${p.number}</span>` : ""}` +
      `<div>Énergie ${en < 0 ? "—" : en + " %"} · Fautes ${pf}${pf >= 5 ? " (exclu)" : ""}</div>` +
      `<div>${p.pts || 0} pts · ${p.reb || 0} reb · ${p.ast || 0} pd${p.onCourt ? "" : " · sur le banc"}</div>`;
    const hr = host.getBoundingClientRect(), r = g.getBoundingClientRect();
    tip.hidden = false; tipId = id;
    tip.style.left = Math.max(4, Math.min(hr.width - 170, r.left - hr.left + r.width / 2 - 85)) + "px";
    tip.style.top = Math.max(4, r.top - hr.top - 64) + "px";
  }
  function hideTip() { tip.hidden = true; tipId = null; }
  host.addEventListener("pointerover", e => { if (e.pointerType === "touch") return; const g = e.target.closest && e.target.closest("[data-id]"); if (g && pdata.has(g.getAttribute("data-id"))) showTip(g.getAttribute("data-id"), g); });
  host.addEventListener("pointerout", e => { if (e.pointerType === "touch") return; if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest("[data-id]")) hideTip(); });
  host.addEventListener("click", e => { const g = e.target.closest && e.target.closest("[data-id]"); const id = g && g.getAttribute("data-id"); if (id && pdata.has(id) && tipId !== id) showTip(id, g); else hideTip(); });

  // Banc : un jeton réduit par remplaçant, assis à sa place (ordre de
  // l'effectif) ; grisé s'il est exclu (5 fautes) ou blessé. Un joueur qui
  // marche encore vers le banc n'y est pas encore dessiné.
  const benchG = el("g", { class: "c2d-bench" }, benchLayer);
  const benchRefs = new Map();           // id → { g, stats, seat, x, y, … } (remplaçants)
  let benchN = [0, 0];                   // remplaçants valides par équipe (regroupement)
  // Temps mort en cours (moteur : S.stoppage) — les remplaçants se lèvent
  // un instant après le coup de sifflet et se rassoient juste avant la reprise.
  function huddleOn() {
    const st = S && S.stoppage, t = now();
    return !!(S && S.status === "live" && st && st.kind === "timeout" && t >= st.startAt + 500 && t < st.endsAt - 900);
  }
  function benchTarget(b) { return huddleOn() && !b.out && b.rank >= 0 ? huddlePos(b.team, b.rank, benchN[b.team], 1) : b.seat; }
  // Déplacement des remplaçants (même mouvement continu que les joueurs) ;
  // le calque des bancs n'est repeint que quand l'un d'eux bouge.
  function moveBench(dt) {
    for (const b of benchRefs.values()) {
      const p = benchTarget(b);
      b.tx = p.x; b.ty = p.y; b.speed = 1;
      const v = steer(b, dt);
      if (v > 0.3) animated++;
      const tf = `translate(${(b.x * PX).toFixed(1)} ${(b.y * PX).toFixed(1)}) scale(.78)`;
      if (tf !== b.tf) { b.tf = tf; b.g.setAttribute("transform", tf); }
    }
  }
  const seatOfId = new Map();            // id → { team, i } (dernière place connue)
  let benchKey = null;
  function benchList(t) { return (S.teams[t].players || []).filter(p => !p.onCourt); }
  function syncBench() {
    const walking = [...sprites.values()].filter(sp => sp.leaving).map(sp => sp.id);
    const key = [0, 1].map(t => benchList(t).map(p => p.id + (p.pf >= 5 || p.injured ? "x" : "")).join(",")).join("#") + "#" + walking.join(",") + "#" + colors.join("|");
    if (key === benchKey) return;
    benchKey = key;
    // Position courante gardée d'un redessin à l'autre (changement pendant
    // un temps mort : le remplaçant debout ne se téléporte pas sur sa chaise).
    const prevPos = new Map([...benchRefs].map(([id, b]) => [id, { x: b.x, y: b.y }]));
    benchG.innerHTML = ""; benchRefs.clear();
    const rankN = [0, 0];
    [0, 1].forEach(t => benchList(t).forEach((p, i) => {
      const seat = seatPos(t, i);
      seatOfId.set(p.id, { team: t, i });
      if (walking.includes(p.id)) return;
      const out = (p.pf || 0) >= 5 || !!p.injured;
      const g = el("g", { class: "c2d-sub t" + t + (out ? " out" : ""), "data-id": p.id, transform: `translate(${(seat.x * PX).toFixed(1)} ${(seat.y * PX).toFixed(1)}) scale(.78)` }, benchG);
      el("ellipse", { cx: "0", cy: "12", rx: "17", ry: "6", fill: `url(#${uid}-ts)` }, g);
      if (p.avatar) {
        const cid = uid + "-b" + (++clipSeq);
        const cp = el("clipPath", { id: cid }, g);   // supprimée avec le banc redessiné
        el("rect", { x: "-19", y: "-30", width: "38", height: "41", rx: "6.8" }, cp);
        const wrap = el("g", { "clip-path": `url(#${cid})` }, g);
        const tpl = document.createElement("template"); tpl.innerHTML = p.avatar; const av = tpl.content.querySelector("svg");
        if (av) { av.setAttribute("width", "38"); av.setAttribute("height", "41"); av.setAttribute("x", "-19"); av.setAttribute("y", "-30"); wrap.appendChild(av); }
        if (opts.raster !== false) rasterizeAvatar(p.avatar, 38, 41).then(url => { if (!url || !wrap.isConnected) return; wrap.innerHTML = ""; el("image", { href: url, x: "-19", y: "-30", width: "38", height: "41", preserveAspectRatio: "xMidYMid slice" }, wrap); });
      } else {
        el("circle", { r: "12", cy: "-8", fill: colors[t], stroke: "#0b1220", "stroke-width": "2" }, g);
        el("text", { y: "-4", "text-anchor": "middle", class: "c2d-ini" }, g).textContent = initials(p.name || "");
      }
      if (Number.isInteger(p.number)) {
        const nb = el("g", { class: "c2d-num", transform: `translate(${t === 0 ? -17 : 17} -28)` }, g);
        el("circle", { r: "7.2", fill: colors[t], stroke: "#0b1220", "stroke-width": "1.6" }, nb);
        el("text", { y: "3", "text-anchor": "middle", "data-no-i18n": "1" }, nb).textContent = String(p.number);
      }
      if (out) { const x = el("g", { class: "c2d-out", transform: "translate(0 -10)" }, g); el("circle", { r: "8", fill: "#FF4D4D", stroke: "#0b1220", "stroke-width": "1.4" }, x); el("text", { y: "3.4", "text-anchor": "middle", "data-no-i18n": "1" }, x).textContent = p.injured ? "+" : "5F"; }
      const stats = statsDecor(g, t, 30, 15);
      const at = prevPos.get(p.id) || seat;
      const b = { id: p.id, g, stats, team: t, seat, out, rank: out ? -1 : rankN[t]++, x: at.x, y: at.y, tx: at.x, ty: at.y, speed: 1, tf: "" };
      if (at !== seat) g.setAttribute("transform", `translate(${(at.x * PX).toFixed(1)} ${(at.y * PX).toFixed(1)}) scale(.78)`);
      benchRefs.set(p.id, b);
    }));
    benchN = rankN;
  }

  // ---------- anti-chevauchement (rendu seulement) ----------
  // 2026-10-08 : les jetons trop proches s'écartent légèrement À L'ÉCRAN
  // (sp.ox / sp.oy, en pieds) sans toucher aux positions de la scène
  // (sp.x / sp.y, ballon, possession) ; le porteur ne bouge pas, les
  // arbitres cèdent la place en premier. Étiquettes : réduites quand deux
  // jetons se touchent, masquées pour celui de derrière quand ils se
  // chevauchent (jamais pour le porteur).
  const GAP_X = 4.0, GAP_Y = 5.0, OFF_MAX = 4.5;
  const ballOff = { x: 0, y: 0 };
  const ballFix = { x: 0, y: 0 };          // écart de continuité du ballon (voir frame)
  let ballPrev = null, ballBodyTf = "", ballShK = -1, clockLow = null, animated = 0;
  let ballHidden = false;
  function declutter(dt) {
    const list = [];
    for (const sp of sprites.values()) if (!sp.leaving) list.push(sp);
    for (const r of refs) list.push(r);
    for (const a of list) { a.fx = 0; a.fy = 0; a.near = 9; a.nearFront = false; }
    // Relaxation en 4 passes (un groupe de 5-6 jetons s'ouvre en éventail).
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          let dx = b.x + b.fx - a.x - a.fx, dy = b.y + b.fy - a.y - a.fy;
          const dn = Math.hypot(dx / GAP_X, dy / GAP_Y);
          if (dn >= 1) continue;
          if (dn < 1e-3) { dx = 0.5; dy = 0.2; }
          // Pousse le long de l'axe, au prorata du recouvrement (en pieds).
          const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
          const need = (1 - dn) * Math.hypot(ux * GAP_X, uy * GAP_Y) * 0.5;
          const wa = a.id === ball.holder ? 0 : a.ref ? 1.6 : 1, wb = b.id === ball.holder ? 0 : b.ref ? 1.6 : 1, w = wa + wb || 1;
          a.fx -= ux * need * 2 * wa / w; a.fy -= uy * need * 2 * wa / w;
          b.fx += ux * need * 2 * wb / w; b.fy += uy * need * 2 * wb / w;
        }
      }
    }
    const k = Math.min(1, dt * 7);
    for (const a of list) {
      let fx = a.fx, fy = a.fy; const m = Math.hypot(fx, fy);
      if (m > OFF_MAX) { fx *= OFF_MAX / m; fy *= OFF_MAX / m; }
      a.ox += (fx - a.ox) * k; a.oy += (fy - a.oy) * k;
      // Arbitre de ligne de fond arrivé à son poste : jamais repoussé sur le terrain.
      if (a.ref && a.bl && Math.abs(a.tx - a.x) < 1.5) {
        if (a.bl > 0 && a.x + a.ox < 94 + REF_BEHIND - 0.3) a.ox = 94 + REF_BEHIND - 0.3 - a.x;
        if (a.bl < 0 && a.x + a.ox > 0.3 - REF_BEHIND) a.ox = 0.3 - REF_BEHIND - a.x;
      }
    }
    // Étiquettes, sur les positions affichées.
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dn = Math.hypot((b.x + b.ox - a.x - a.ox) / GAP_X, (b.y + b.oy - a.y - a.oy) / GAP_Y);
        if (dn < a.near) { a.near = dn; }
        if (dn < b.near) { b.near = dn; }
        // Celui de devant (plus bas à l'écran) ou le porteur garde son nom.
        const aFront = a.id === ball.holder || (b.id !== ball.holder && a.y + a.oy >= b.y + b.oy);
        const back = aFront ? b : a, front = aFront ? a : b;
        if (dn < 0.95 || labelUnder(back, front)) back.nearFront = true;
      }
    }
    for (const a of list) {
      const st = a.id === ball.holder ? "" : a.nearFront ? "off" : a.near < 1.15 ? "sm" : "";
      if (st !== a.labState) { a.labState = st; a.lab.classList.toggle("lab-off", st === "off"); a.lab.classList.toggle("lab-sm", st === "sm"); }
    }
  }

  // L'étiquette du nom de « back » (sous son jeton, de +1,7 à +3 pieds)
  // passe-t-elle sous l'avatar de « front » (de -3 à +1,1 pied) ?
  function labelUnder(back, front) {
    const bx = back.x + back.ox, by = back.y + back.oy, fx = front.x + front.ox, fy = front.y + front.oy;
    if (front.id !== ball.holder && fy < by) return false;
    return Math.abs(fx - bx) < back.labHalf + 1.9 && fy - 3.0 < by + 3.0 && fy + 1.1 > by + 1.7;
  }

  // ---------- déplacement continu (fluidité, 2026-10-08) ----------
  // Avant : vitesse constante, départ et arrêt secs, demi-tour instantané
  // dès que la cible changeait. Désormais chaque jeton (joueur, arbitre) a
  // une VITESSE (vx, vy en pieds/s) : il accélère vers sa cible, tourne en
  // arc (la vitesse ne change jamais d'un coup), freine pour s'arrêter pile
  // dessus. La cible reste fixée par la scène (moteur → chorégraphie) ; le
  // rendu ne fait qu'interpoler. Vitesse de croisière inchangée (14 × speed
  // pieds/s), donc mêmes durées à ~0,2 s près.
  function steer(sp, dt) {
    const dx = sp.tx - sp.x, dy = sp.ty - sp.y, d = Math.hypot(dx, dy);
    let vx = sp.vx || 0, vy = sp.vy || 0;
    if (d < 0.02 && vx * vx + vy * vy < 0.5) { sp.x = sp.tx; sp.y = sp.ty; sp.vx = sp.vy = 0; return 0; }
    const vmax = 14 * (sp.speed || 1);
    const acc = Math.max(40, vmax * 3.4);                         // ≈ 0,3 s pour atteindre la croisière
    const want = Math.min(vmax, Math.sqrt(1.7 * acc * d));        // freinage : arrivée à l'arrêt
    const wx = d > 1e-6 ? dx / d * want : 0, wy = d > 1e-6 ? dy / d * want : 0;
    let ax = wx - vx, ay = wy - vy;
    const am = Math.hypot(ax, ay), lim = acc * 1.6 * dt;          // virage un peu plus vif que l'accélération
    if (am > lim) { ax *= lim / am; ay *= lim / am; }
    vx += ax; vy += ay;
    const mx = vx * dt, my = vy * dt;
    // Jamais au-delà de la cible : arrivée (le pas suivant repart de là).
    if (mx * dx + my * dy >= d * d && Math.hypot(mx, my) >= d) { sp.x = sp.tx; sp.y = sp.ty; sp.vx = sp.vy = 0; return 0; }
    sp.x += mx; sp.y += my; sp.vx = vx; sp.vy = vy;
    return Math.hypot(vx, vy);
  }
  // Oscillation de la marche : liée à la distance parcourue (foulée) et
  // proportionnelle à la vitesse — plus d'oscillation qui s'allume / s'éteint.
  function stride(sp, v, dt, amp) {
    sp.stride = ((sp.stride || 0) + v * dt * 0.55) % 6.2832;
    return Math.sin(sp.stride) * amp * Math.min(1, v / 7);
  }
  // Coordonnées valides : terrain (0-94 × 0-50) + dégagement, banc et table
  // compris (le remiseur sort derrière les lignes, les remplaçants vont au banc).
  const validPos = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= -8 && x <= 102 && y >= -6 && y <= 62;
  function fixPosition(sp) {
    anomalies++;
    const bad = { x: sp.x, y: sp.y, tx: sp.tx, ty: sp.ty };
    const safe = sp.lastGood || slotPos(sp.team, sp.slot || 0, sp.team === possession);
    if (!validPos(sp.x, sp.y)) { sp.x = safe.x; sp.y = safe.y; sp.vx = sp.vy = 0; }
    if (!validPos(sp.tx, sp.ty)) { const p = slotPos(sp.team, sp.slot || 0, sp.team === possession); sp.tx = p.x; sp.ty = p.y; }
    diag("anomaly", { what: "invalid-position", id: sp.id, bad, fixed: { x: sp.x, y: sp.y, tx: sp.tx, ty: sp.ty } });
  }
  // Position imposée (recalage, entrée, mise en scène) : vitesse remise à zéro.
  const halt = sp => { sp.vx = 0; sp.vy = 0; };

  // Public au repos (fluidité, 2026-10-08) : de temps en temps (1,2 à
  // 2,2 s), UNE cohorte remue brièvement (petit sursaut ou déhanché, 0,7 s)
  // — animation Web Animations de la feuille (transformation sur son
  // calque : ni mise en page ni repeinte). Plus d'animation continue : elle
  // obligeait le compositeur à redessiner toute l'image à chaque image.
  const IDLE_KF = {
    ba: [{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(0,-.18%,0)" }, { transform: "translate3d(0,0,0)" }],
    bb: [{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(0,-.12%,0)", offset: 0.3 }, { transform: "translate3d(0,-.04%,0)", offset: 0.55 }, { transform: "translate3d(0,-.14%,0)", offset: 0.75 }, { transform: "translate3d(0,0,0)" }],
    sh: [{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(-.08%,-.06%,0)", offset: 0.35 }, { transform: "translate3d(.08%,-.06%,0)", offset: 0.7 }, { transform: "translate3d(0,0,0)" }],
  };
  let nextIdle = 0;
  function crowdIdle(nowP) {
    if (reducedMotion || nowP < nextIdle || !fanSheets.length) return;
    nextIdle = nowP + 1200 + Math.random() * 1000;
    const pool = fanSheets.filter(sh => IDLE_KF[sh.motion] && !sh.anim);
    const sh = pool[Math.floor(Math.random() * pool.length)];
    if (!sh || typeof sh.el.animate !== "function") return;
    try { const an = sh.anim = sh.el.animate(IDLE_KF[sh.motion], { duration: 700, easing: "ease-in-out" }); an.onfinish = () => { if (sh.anim === an) sh.anim = null; }; } catch (e) { /* rien */ }
  }

  // ---------- diagnostic de fluidité (2026-10-08) ----------
  // Intervalle entre deux images, durée du travail de la boucle, pics
  // (image > 34 ms = au moins une image sautée à 60 Hz), nombre d'éléments
  // animés. Tampons circulaires préalloués : aucune allocation par image.
  // Lecture : debug().perf ; panneau à l'écran avec ?c2dperf=1 ou
  // localStorage "hm-c2d-perf" = "1" (développement seulement).
  const PERF_N = 240;
  const perf = { iv: new Float32Array(PERF_N), work: new Float32Array(PERF_N), n: 0, i: 0, prev: 0, spikes: 0, longFrames: 0, maxIv: 0, maxWork: 0, animated: 0, frames: 0 };
  function perfRecord(nowP, work) {
    if (perf.prev && !suspended) {
      const iv = nowP - perf.prev;
      if (iv < 1000) {
        perf.iv[perf.i] = iv; perf.work[perf.i] = work; perf.i = (perf.i + 1) % PERF_N; if (perf.n < PERF_N) perf.n++;
        if (iv > 34) perf.spikes++;
        if (work > 8) perf.longFrames++;
        if (iv > perf.maxIv) perf.maxIv = iv;
        if (work > perf.maxWork) perf.maxWork = work;
        perf.frames++;
      }
    }
    perf.prev = nowP;
  }
  function perfReport() {
    const n = perf.n; if (!n) return { fps: 0, frameMs: 0, p95Ms: 0, maxMs: 0, workMs: 0, maxWorkMs: 0, spikes: perf.spikes, longFrames: perf.longFrames, animated: perf.animated, frames: perf.frames };
    const iv = Array.from(perf.iv.subarray(0, n)).sort((a, b) => a - b);
    let sIv = 0, sW = 0; for (let k = 0; k < n; k++) { sIv += perf.iv[k]; sW += perf.work[k]; }
    return { fps: Math.round(1000 / (sIv / n)), frameMs: +(sIv / n).toFixed(2), p95Ms: +iv[Math.floor(n * 0.95)].toFixed(1), maxMs: +perf.maxIv.toFixed(1),
      workMs: +(sW / n).toFixed(2), maxWorkMs: +perf.maxWork.toFixed(2), spikes: perf.spikes, longFrames: perf.longFrames, animated: perf.animated, frames: perf.frames };
  }
  let perfBox = null, perfShown = 0;
  try { if ((typeof location !== "undefined" && /[?&]c2dperf=1/.test(location.search)) || (typeof localStorage !== "undefined" && localStorage.getItem("hm-c2d-perf") === "1")) { perfBox = document.createElement("div"); perfBox.className = "c2d-perf"; host.appendChild(perfBox); } } catch (e) { /* rien */ }
  function perfPaint(nowP) {
    if (!perfBox || nowP - perfShown < 500) return;
    perfShown = nowP;
    const r = perfReport();
    perfBox.textContent = `${r.fps} i/s · image ${r.frameMs} ms (p95 ${r.p95Ms}, max ${r.maxMs}) · boucle ${r.workMs} ms (max ${r.maxWorkMs}) · pics ${r.spikes} · animés ${r.animated}`;
  }

  // ---------- boucle d'animation ----------
  function tick(nowP) {
    if (halted) return;
    raf = requestAnimationFrame(tick);
    const t0 = performance.now();
    frame(nowP);
    perf.animated = animated;
    perfRecord(nowP, performance.now() - t0);
    perfPaint(nowP);
  }
  function frame(nowP) {
    animated = 0;
    // Trou d'images (onglet gelé sans visibilitychange, machine en veille) :
    // même recalage que le retour d'onglet, jamais de rattrapage.
    // Images très ralenties (navigateur qui bride rAF sans masquer la page,
    // économie d'énergie) : la chorégraphie à minuteries n'est plus
    // suivie par le rendu → suspendue jusqu'au retour d'images normales.
    const gap = nowP - last;
    if (S && !suspended && gap > GAP_RESYNC_MS) resync("images gelées");
    else if (S && !suspended && gap > THROTTLE_MS) { suspend(); throttled = true; }
    else if (suspended && throttled && gap < 100 && !(typeof document !== "undefined" && document.hidden)) { throttled = false; resync("images bridées"); }
    const dt = Math.min(0.05, Math.max(0, (nowP - last) / 1000)); last = nowP;
    if (stage) { try { stage.tick(nowP, dt); } catch (e) { /* la mise en scène ne bloque jamais le terrain */ } }
    // Jeu sans ballon (retour utilisateur 2026-10-01 : « les joueurs sont
    // trop statiques ») : toutes les 1,2 s, chaque attaquant sans ballon
    // bouge autour de son poste, et un sur trois coupe vers le cercle (puis
    // ressort) ; le porteur dribble sur place en se décalant ; les
    // défenseurs suivent leur vis-à-vis entre lui et le panier.
    // Fluidité (2026-10-08) : chaque joueur a SON rythme (1 à 1,5 s, plus
    // de changement de cible simultané des dix joueurs) et une vitesse
    // calée sur la distance (il arrive à peu près quand la cible suivante
    // tombe : mouvement continu plutôt que « sprint, arrêt, sprint »).
    // (jamais pendant un arrêt de jeu : temps mort, fin de quart — chacun reste au banc)
    if (S && S.status === "live" && gameOn && nowP > sceneUntil && performance.now() >= stopUntil && !deadBall()) {
      const rim = RIM[possession];
      for (const sp of sprites.values()) {
        if (sp.leaving || sp.busy || sp.stage || nowP < (sp.nextDrift || 0)) continue;
        reseed("d" + sp.id + "|" + (S.quarter || 0) + "|" + Math.round(Number(S.clock) || 0) + "|" + possession);
        sp.nextDrift = nowP + 1000 + rand01() * 500;
        if (sp.team === possession) {
          const p = slotPos(sp.team, sp.slot, true);
          if (ball.holder === sp.id) continue;   // le porteur erre en continu (voir plus bas)
          if (sp.cut) { sp.cut = false; sp.tx = p.x + rnd(-3, 3); sp.ty = p.y + rnd(-3, 3); sp.speed = Math.max(0.3, Math.min(1.1, Math.hypot(sp.tx - sp.x, sp.ty - sp.y) / 15)); }
          else if (rand01() < 0.33) { sp.cut = true; sp.tx = lerp(p.x, rim.x, rnd(0.45, 0.75)); sp.ty = lerp(p.y, rim.y, rnd(0.3, 0.6)) + rnd(-3, 3); sp.speed = 1.5; }
          else { sp.tx = p.x + rnd(-5, 5); sp.ty = p.y + rnd(-5, 5); sp.speed = Math.max(0.18, Math.min(0.9, Math.hypot(sp.tx - sp.x, sp.ty - sp.y) / 16)); }
          sp.ty = Math.max(1.5, Math.min(48.5, sp.ty)); sp.tx = Math.max(1.5, Math.min(92.5, sp.tx));
        } else {
          const mark = onCourt(1 - sp.team).find(o => o.slot === sp.slot);
          if (mark) {
            const x = lerp(mark.tx, rim.x, 0.25) + rnd(-1.5, 1.5), y = lerp(mark.ty, rim.y, 0.25) + rnd(-1.5, 1.5);
            moveTo(sp, x, y, Math.max(0.25, Math.min(1.3, Math.hypot(x - sp.x, y - sp.y) / 12)));
          }
        }
      }
    }
    // Porteur de balle : dribble continu (retour 2026-10-08 : « dribbler →
    // s'arrêter → reprendre » disparaît). Hors chorégraphie, il se déplace
    // sans jamais s'immobiliser (nouvelle petite cible dès qu'il arrive), en
    // zone avant uniquement une fois la ligne médiane franchie, et il la
    // franchit avant 8 s de possession.
    if (S && S.status === "live" && ball.holder && !ball.flight) {
      const h = sprites.get(ball.holder);
      if (h && h.team === possession) {
        if (!crossed && inFront(h.team, ball.x)) crossed = true;
        const age = (now() - possStart) / 1000;
        if (!h.busy && !h.stage && nowP > sceneUntil && !deadBall()) {
          const d = Math.hypot(h.tx - h.x, h.ty - h.y);
          if (!crossed && age > 5.5 && !inFront(h.team, h.tx)) { moveTo(h, h.team === 0 ? 52 : 42, Math.max(8, Math.min(42, h.y)), 1.8); }
          else if (d < 0.6) {
            // Porteur : il ATTAQUE un espace (têtes de raquette, ailes, haut
            // de la clé) au lieu de dribbler sur place ; une équipe qui joue
            // la pénétration attaque plus près du cercle.
            reseed("h" + h.id + "|" + (S.quarter || 0) + "|" + Math.round(Number(S.clock) || 0));
            const rim = RIM[h.team];   // panier attaqué
            const dirx = rim.x > 47 ? -1 : 1, deep = drivesInside(h.team) ? 0.72 : 1;
            const SPOTS = [{ d: 30, y: 25 }, { d: 24, y: 12 }, { d: 24, y: 38 }, { d: 20, y: 18 }, { d: 20, y: 32 }];
            let pi = Math.floor(rand01() * SPOTS.length); if (pi === h.lastSpot) pi = (pi + 1) % SPOTS.length; h.lastSpot = pi;
            const sp0 = SPOTS[pi];
            moveTo(h, frontX(h.team, Math.max(2, Math.min(92, rim.x + dirx * sp0.d * deep))), Math.max(3, Math.min(47, sp0.y + rnd(-1.5, 1.5))), rnd(0.7, 0.95));
          }
          else if (crossed && !inFront(h.team, h.tx)) { h.tx = frontX(h.team, h.tx); }
        }
      }
    }
    crowdIdle(nowP);
    moveBench(dt);
    steerRefs(nowP);
    for (const r of refs) {
      if (r.stage) { r.bl = 0; r.tx = r.stage.x; r.ty = r.stage.y; r.speed = r.stage.speed; }
      r.v = steer(r, dt); r.moving = r.v > 0.3; if (r.moving) animated++;
    }
    declutter(dt);
    for (const r of refs) {
      const bob = stride(r, r.v || 0, dt, 1);
      r.g.setAttribute("transform", `translate(${((r.x + r.ox) * PX).toFixed(1)} ${((r.y + r.oy) * PX + bob).toFixed(1)})`);
    }
    for (const [id, sp] of sprites) {
      // Sortant arrivé à sa place (ou trop long) : il rejoint le banc dessiné.
      if (sp.leaving && (nowP > sp.leaveAt || Math.hypot(sp.tx - sp.x, sp.ty - sp.y) < 0.4)) { sp.g.remove(); sprites.delete(id); benchKey = null; if (S) syncBench(); continue; }
      // Entrant arrivé à la table (ou reprise du jeu) : il rejoint sa place.
      if (sp.entering && (nowP > sp.entering || Math.hypot(sp.tx - sp.x, sp.ty - sp.y) < 0.5)) {
        sp.entering = 0; sp.busy = false;
        const pos = slotPos(sp.team, sp.slot, sp.team === possession); sp.tx = pos.x; sp.ty = pos.y; sp.speed = 2.2;
        // Tape dans la main au passage d'un sortant de la même équipe.
        for (const o of sprites.values()) if (o.leaving && o.team === sp.team && Math.hypot(o.x - sp.x, o.y - sp.y) < 6) { jump(sp, 0.35); jump(o, 0.35); break; }
      }
      // Position imposée par la mise en scène (regroupement, banc, entrée).
      if (sp.stage) { sp.tx = sp.stage.x; sp.ty = sp.stage.y; sp.speed = sp.stage.speed; }
      // Position ou cible invalide (NaN, hors de la salle) : correction
      // contrôlée et tracée — le joueur repart de sa dernière position
      // valide (ou de son poste) au lieu d'apparaître n'importe où.
      if (!validPos(sp.x, sp.y) || !validPos(sp.tx, sp.ty)) fixPosition(sp);
      const v = sp.v = steer(sp, dt);
      if (validPos(sp.x, sp.y)) sp.lastGood = { x: sp.x, y: sp.y };
      sp.moving = v > 0.3;
      if (sp.moving) animated++;
      const bob = stride(sp, v, dt, 1.2);
      let lift = 0, scale = 1;
      if (sp.jump) { sp.jump.t += dt / 0.55; if (sp.jump.t >= 1) sp.jump = null; else { const k = Math.sin(sp.jump.t * Math.PI); lift = -k * 14 * sp.jump.h; scale = 1 + k * 0.12 * sp.jump.h; } }
      sp.g.setAttribute("transform", `translate(${((sp.x + sp.ox) * PX).toFixed(1)} ${((sp.y + sp.oy) * PX + bob + lift).toFixed(1)})${scale !== 1 ? ` scale(${scale.toFixed(3)})` : ""}`);
      const has = ball.holder === id;
      if (has !== sp.hasBall) { sp.hasBall = has; sp.g.classList.toggle("has-ball", has); sp.carrier.setAttribute("opacity", has ? "1" : "0"); }
    }
    for (const f of floats) placeFloat(f);
    if (trail && trail.flight !== ball.flight) endTrail();
    if (ball.flight) {
      const f = ball.flight; f.t = Math.min(1, f.t + (dt * 1000) / f.ms);
      if (f.target) { const tg = sprites.get(f.target); if (tg) f.to = { x: tg.x + (tg.team === 0 ? 2.2 : -2.2), y: tg.y + 0.3 }; }
      const k = f.land ? f.t : ease(f.t);
      ball.x = lerp(f.from.x, f.to.x, k); ball.y = lerp(f.from.y, f.to.y, k);
      // Hauteur : part de celle du ballon au lâcher (dribble) — pas de saut.
      ball.z = Math.sin(f.t * Math.PI) * f.h + (f.z0 || 0) * (1 - k);
      animated++;
      if (f.t >= 1) {
        ball.flight = null; ball.z = 0; ball.drib = 0;
        if (f.land) ball.loose = { x: f.to.x, y: f.to.y, z: 0, ...looseFrom(f) };
        if (f.done) f.done();
      }
    } else if (ball.loose && !ball.holder) {
      // Ballon libre : rebonds puis roulement (jusqu'à ce qu'un joueur le prenne).
      const st = ball.loose;
      looseStep(st, dt);
      ball.x = st.x; ball.y = st.y; ball.z = st.z;
      if (st.z <= 0 && st.vz === 0 && Math.hypot(st.vx, st.vy) < 0.05) ball.loose = null;
      else animated++;
    } else if (ball.holder) {
      const h = sprites.get(ball.holder);
      // Dribble continu tant qu'il a le ballon (un peu plus bas et plus vite à l'arrêt).
      // Posé sur le bord du jeton (côté attaque), à hauteur des mains.
      // Phase de dribble propre au porteur, repartie de la main (0) à chaque
      // réception : pas de ballon qui saute à la réception d'une passe.
      if (h) {
        if (ball.dribOf !== h.id) { ball.dribOf = h.id; ball.drib = 0; }
        ball.drib = (ball.drib || 0) + dt * 1000 / (h.moving ? 110 : 95);
        const amp = 0.9 + 0.3 * Math.min(1, (h.v || 0) / 8);
        ball.x = h.x + (h.team === 0 ? 2.2 : -2.2); ball.y = h.y + 0.3; ball.z = Math.abs(Math.sin(ball.drib)) * amp;
      }
    }
    // Pause prolongée : le ballon est dans les mains de l'arbitre (il glisse
    // jusqu'à lui grâce à la continuité ci-dessous, puis le suit).
    const keeper = refKeeper();
    if (keeper) {
      ball.holder = null; ball.flight = null; ball.loose = null;
      ball.x = keeper.x + 1.5; ball.y = keeper.y - 0.4; ball.z = 0.6;
    }
    // Garde-fou : jamais de porteur dans l'équipe qui n'a pas le ballon selon
    // le moteur (ex. scène encore en retard sur le fil) — le ballon est
    // libéré, la resynchronisation le rend à la bonne équipe.
    enforcePossession();
    // Le ballon suit le décalage d'affichage de son porteur (anti-chevauchement).
    const hb = !ball.flight && ball.holder ? sprites.get(ball.holder) : null;
    const kb = Math.min(1, dt * 9);
    ballOff.x += ((hb ? hb.ox : 0) - ballOff.x) * kb; ballOff.y += ((hb ? hb.oy : 0) - ballOff.y) * kb;
    // Continuité du ballon (fluidité, 2026-10-08) : si sa position logique
    // saute d'une image à l'autre (changement de porteur sans passe, remise
    // en jeu, ballon replacé par la scène), l'écart est absorbé puis résorbé
    // (≤ 110 pieds/s) — le ballon glisse, il ne se téléporte jamais. Les vols
    // normaux (≤ 260 pieds/s en l'air) ne sont pas touchés.
    const lx = ball.x + ballOff.x, ly = ball.y + ballOff.y;
    if (ballPrev) {
      const jx = lx - ballPrev.x, jy = ly - ballPrev.y;
      // Seuil : vitesse d'un vol (passe, tir) en l'air ; celle d'un joueur
      // quand le ballon est tenu.
      if (Math.hypot(jx, jy) > (ball.flight ? 260 : 45) * dt + 0.35) { ballFix.x -= jx; ballFix.y -= jy; }
    }
    ballPrev = ballPrev || { x: 0, y: 0 }; ballPrev.x = lx; ballPrev.y = ly;
    // Résorption : exponentielle près du but, plafonnée à 110 pieds/s quand
    // l'écart est grand (le ballon file comme une passe vive, sans bond).
    const fm = Math.hypot(ballFix.x, ballFix.y);
    if (fm > 0) { const red = Math.min(fm * (1 - Math.exp(-dt / 0.07)), 110 * dt), kf = (fm - red) / fm; ballFix.x *= kf; ballFix.y *= kf; }
    if (Math.abs(ballFix.x) < 0.01) ballFix.x = 0;
    if (Math.abs(ballFix.y) < 0.01) ballFix.y = 0;
    ballG.setAttribute("transform", `translate(${((lx + ballFix.x) * PX).toFixed(1)} ${((ly + ballFix.y) * PX).toFixed(1)})`);
    // Avant-match (entrée des joueurs) : pas de ballon par terre sans porteur.
    // (Pauses prolongées : ballon tenu par l'arbitre, voir refKeeper.)
    // Mi-temps (parquet vidé : arbitres et joueurs aux vestiaires) ou pause
    // sans arbitre à l'écran : ballon retiré (jamais posé sur le parquet) ;
    // sinon il est dans les mains d'un arbitre (refKeeper).
    const hideBall = !!(S && (S.status === "pregame" || S.status === "halftime" || (!refs.length && inLongPause())));
    if (hideBall !== ballHidden) { ballHidden = hideBall; ballG.setAttribute("opacity", hideBall ? "0" : "1"); }
    const bt = `translate(0 ${(-ball.z * 4).toFixed(1)}) scale(${(1 + ball.z / 14).toFixed(2)})`;
    if (bt !== ballBodyTf) { ballBodyTf = bt; ballBody.setAttribute("transform", bt); }
    // Ombre du ballon : plus petite et plus pâle quand il monte (tir) ;
    // réécrite seulement quand elle change.
    const zk = Math.min(1, ball.z / 9), shk = Math.round(zk * 40);
    if (shk !== ballShK) { ballShK = shk; ballSh.setAttribute("rx", (9 - zk * 4).toFixed(1)); ballSh.setAttribute("ry", (3.6 - zk * 1.4).toFixed(1)); ballSh.setAttribute("opacity", (1 - zk * 0.55).toFixed(2)); }
    if (ball.flight && ball.flight.kind && !reducedMotion && !hideBall) traceTrail(ball.flight);
    // Chrono des 24 s : descend depuis le début de la possession.
    if (S && S.status === "live") {
      // Source unique : state.shotClock (calculé par le client depuis la
      // timeline du moteur) ; repli sur le chrono chorégraphique sinon.
      const left = !gameOn ? null : typeof S.shotClock === "number" ? S.shotClock : S.shotClock === null ? null : Math.max(0, SHOT_CLOCK - (now() - possStart) / 1000);
      // Chrono éteint (null : pause, entre-deux, moins de temps au
      // quart-temps qu'au chrono des 24 s — règle FIBA) : écran vide, jamais
      // un « 24 » par défaut (mission live 2026-10-10).
      const txt = left === null ? "" : left < 5 ? left.toFixed(1) : String(Math.ceil(left));
      if (clockTxt.textContent !== txt) { clockTxt.textContent = txt; clockG.classList.toggle("off", left === null); }
      const low = left !== null && left < 5;
      if (low !== clockLow) { clockLow = low; clockG.classList.toggle("low", low); }
    }
    // Ordre de superposition (le plus bas devant) : 4 fois par seconde, et
    // seulement si l'ordre a changé.
    if (nowP - lastSort > 250 || ball.holder !== lastSortHolder) {
      lastSortHolder = ball.holder;
      lastSort = nowP;
      // Le porteur de balle passe toujours au premier plan.
      const zy = sp => (sp.id === ball.holder ? 1e4 : sp.y + (sp.oy || 0));
      const ordered = [...sprites.values(), ...refs].sort((a, b) => zy(a) - zy(b));
      const key = ordered.map(sp => sp.id).join("|");
      if (key !== sortKey) { sortKey = key; ordered.forEach(sp => layer.insertBefore(sp.g, trailG)); }
    }
  }
  // ---------- mise en scène (staging.js) ----------
  let reducedMotion = false;
  try { reducedMotion = !!(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { /* rien */ }
  // Module chargé à la demande (live-view.js) : objet ou promesse.
  let stage = null, destroyed = false;
  const makeStage = mod => (mod && typeof mod.createStaging === "function" && typeof opts.staging === "function" ? mod.createStaging({
    el, PX, OX, OY, uid, defs, coachLayer, frontLayer, BENCH, TABLE, RIM,
    now, nowP: () => performance.now(), reduced: reducedMotion,
    colors: () => colors,
    sprites: () => sprites.values(),
    refs: () => refs,
    parkLine, slotPos, seatPos, ambience, huddlePos,
    possession: () => possession,
    // Terrain réellement à l'écran (page du direct affichée, onglet visible).
    shown: () => !!(host.isConnected && host.getClientRects && host.getClientRects().length) && !(typeof document !== "undefined" && document.hidden),
    raster: opts.raster !== false ? rasterizeAvatar : null,
    formation: () => formation(),
    hold(sp, x, y, speed = 1.4, snap = false) { sp.stage = { x, y, speed }; if (snap) { sp.x = sp.tx = x; sp.y = sp.ty = y; halt(sp); } },
    release(sp) { if (!sp) return; delete sp.stage; if (sp.g) sp.g.setAttribute("opacity", "1"); },
    // Canvas des shows : { canvas, vb: [x, y, w, h], w, h } (px CSS) ; null
    // sans canvas 2D (rendu SVG de repli dans staging.js).
    overlay() {
      if (!showCv) {
        if (typeof document === "undefined") return null;
        const c = document.createElement("canvas");
        let ok = false; try { ok = !!(c.getContext && c.getContext("2d")); } catch (e) { ok = false; }
        if (!ok) return null;
        c.className = "c2d-showfx"; c.setAttribute("aria-hidden", "true");
        host.appendChild(c); showCv = c; placeUnder();
      }
      return { canvas: showCv, vb: viewBox.split(/\s+/).map(Number), w: parseFloat(showCv.style.width) || svg.clientWidth || 0, h: parseFloat(showCv.style.height) || svg.clientHeight || 0 };
    },
    dropOverlay() { if (showCv) { showCv.remove(); showCv = null; } },
  }, opts.staging) : null);
  let stagingModuleRef = null;   // module de mise en scène chargé (recréé à la reprise après halt)
  if (opts.stagingModule && typeof opts.stagingModule.then === "function") opts.stagingModule.then(mod => { stagingModuleRef = mod; if (!destroyed && !stage && !halted) { stage = makeStage(mod); if (stage && S) stage.update(S, []); } }).catch(() => {});
  else if (opts.stagingModule) { stagingModuleRef = opts.stagingModule; stage = makeStage(opts.stagingModule); }

  raf = requestAnimationFrame(tick);

  // ---------- API ----------
  // Fin du direct (mission live 2026-10-10) : terrain figé pour de bon —
  // plus de boucle de rendu, de minuterie ni de spectacle ; les mises à jour
  // suivantes sont ignorées (fin définitive, même après rechargement).
  const api = {
    halt() {
      if (halted) return;
      halted = true;
      cancelAnimationFrame(raf); raf = 0;
      clearChoreo(); clearFx();
      if (stage) { try { stage.destroy(); } catch (e) { /* rien */ } stage = null; }
      diag("halt", {});
    },
    get halted() { return halted; },
    // Rediffusion ramenée avant la fin : le terrain repart, recalé.
    resume() {
      if (!halted || destroyed) return;
      halted = false;
      last = performance.now();
      raf = requestAnimationFrame(tick);
      if (stagingModuleRef) { try { stage = makeStage(stagingModuleRef); } catch (e) { stage = null; } }
      if (S) resync("reprise du direct");
    },
    update(state, newEvents = []) {
      if (halted) return;
      // Statut précédent gardé à part (la vue peut muter le même objet état).
      if (lastStatus && lastStatus !== "final" && state.status === "final") moment("fin_match");
      lastStatus = state.status;
      const prevUpdateAt = lastUpdateAt; lastUpdateAt = performance.now();
      S = state;
      if (state.teams && state.teams[0] && state.teams[0].color) colors = [state.teams[0].color, state.teams[1].color];
      drawFloor(state.courtStyle || null, colors[0]);
      drawArena(colors[0], state.arena || null, (state.teams[0] && (state.teams[0].name || state.teams[0].short)) || "HOOP MANAGER", colors[1]);
      const lk = (state.courtLogo || "") + "|" + (state.arenaSponsor || "");
      if (lk !== logoKey) { logoKey = lk; logoG.innerHTML = state.courtLogo || ""; adTop.textContent = adBot.textContent = (state.arenaSponsor || "HOOP MANAGER").toUpperCase(); }
      // Temps du match : entre-deux diffusé ? saut dans le fil ?
      const evAll = state.events || [];
      let jump = false;
      if (tl && !firstUpdate) {
        if (evAll.length < tl.n || evSig(evAll[tl.n - 1]) !== tl.sig) jump = true;          // fil reconstruit / décalé
        // Horloge de diffusion qui avance (ou recule) plus vite que le temps
        // réellement écoulé dans la page : le temps a été déplacé.
        if (Math.abs((now() - tl.now) - (performance.now() - tl.at)) > 2500) jump = true;
        // Rafale (reconnexion, avance rapide) : beaucoup d'événements, ou
        // étalés sur plus de 8 s de diffusion. Quelques événements récents
        // arrivés ensemble (changements au même arrêt, image en retard) se
        // jouent normalement, à la suite — plus de recalage pour si peu.
        const air = evAll.filter(e => newEvents.includes(e.id)).map(e => e.airAt).filter(Boolean);
        if (newEvents.length > 8 || (air.length > 1 && Math.max(...air) - Math.min(...air) > 8000)) jump = true;
      }
      tl = { n: evAll.length, sig: evSig(evAll[evAll.length - 1]), now: now(), at: performance.now() };
      if (jump || !gameOn) gameOn = evAll.some(isGameEvent);
      // Arrivée en cours de match (le jeu a déjà commencé) : état « en jeu ».
      if (gameOn && phase === "PREGAME" && state.status === "live" && !evAll.some(e => e.kind === "tipoff" && fresh0(e))) setPhase("LIVE", "match déjà commencé");
      const before = sprites.size;
      syncRefs(state.referees);
      syncRoster();
      enforcePossession(true);
      pdata.clear(); [0, 1].forEach(t => (state.teams[t].players || []).forEach(p => pdata.set(p.id, p)));
      syncBench();
      syncTokenStats();
      if (tipId && !pdata.has(tipId)) hideTip();
      syncBoard();
      if (state.status === "live" && state.stoppage && state.stoppage.kind === "timeout") armResume(state.stoppage.startAt, state.stoppage.endsAt);
      checkResume();
      const quiet = !suspended && performance.now() > sceneUntil && performance.now() > busyUntil && !queue.length && !ball.flight && phase === "LIVE";
      // Ballon volontairement libre après un tir manqué (contre, faute sur le
      // tir) : c'est l'événement suivant du moteur (rebond, lancers) qui
      // désigne qui le récupère — pas de meneur choisi ici.
      const looseByEngine = lastPlayed && lastPlayed.kind === "shot" && !lastPlayed.made;
      if ((sprites.size !== before || ball.holder == null) && !newEvents.length && state.status === "live" && gameOn && quiet && !looseByEngine) {
        if (state.possession === 0 || state.possession === 1) possession = state.possession;
        if (ball.holder == null) giveBall(handlerOf(possession));
        formation();
      }
      // Reconnexion en cours de match (tout le passé arrive d'un coup) : on
      // ne rejoue que les deux dernières actions, pas six minutes de retard.
      let fresh = jump ? newEvents.slice(-2) : newEvents;
      // Première image (arrivée sur la page au coup d'envoi : les premiers
      // événements sont déjà là) : on joue ceux des 6 dernières secondes.
      if (firstUpdate && !fresh.length && state.status === "live") {
        const t = now();
        fresh = state.events.filter(e => e.airAt && e.airAt >= t - ((e.kind === "shot" || e.kind === "freeThrow") && e.made ? 1500 : 6000)).slice(-3).map(e => e.id);
      }
      firstUpdate = false;
      // Onglet masqué : le moteur reste la source de vérité, mais rien n'est
      // mis en scène (requestAnimationFrame est suspendu, les minuteries
      // bridées) — les événements sont seulement absorbés ; la reprise
      // (resync) recale le terrain sur l'état courant. Onglet visible : un
      // événement arrivé très en retard (minuteries bridées, reconnexion)
      // n'est pas rejoué non plus — recalage à la place.
      const tNow = now();
      const evs = state.events.filter(e => fresh.includes(e.id));
      const stale = evs.filter(e => e.airAt && tNow - e.airAt > STALE_EVENT_MS);
      if (suspended || stale.length || jump) {
        evs.forEach(e => { if (e.kind !== "quote") lastPlayed = e; });
        if (jump) { jumps++; for (let i = evAll.length - 1; i >= 0; i--) if (evAll[i].kind !== "quote") { lastPlayed = evAll[i]; break; } }
        // Terrain visible et rafraîchi il y a peu : recalage EN DOUCEUR.
        const visible = !(typeof document !== "undefined" && document.hidden) && prevUpdateAt > 0 && performance.now() - prevUpdateAt < 2500;
        // (un saut dans le temps — curseur de rediffusion, reconnexion — est
        // une coupure voulue : recalage instantané, comme un changement de plan)
        if (!suspended) resync(jump ? "saut dans le temps" : "événement en retard", visible && !jump);
        if (stage) { try { stage.update(state, []); } catch (e) { /* jamais bloquant */ } }
        return;
      }
      for (const e of evs) queue.push(e);
      drain();
      if (stage) { try { stage.update(state, state.events.filter(e => fresh.includes(e.id))); } catch (e) { /* jamais bloquant */ } }
      // Action à venir : une possession complète calée sur son heure.
      const na = state.nextAction;
      if (state.status === "live" && na && na.airAt && (!plan || plan.airAt !== na.airAt)) {
        const delay = Math.max(0, busyUntil + queue.reduce((s, e) => s + holdFor(e), 0) - performance.now());   // laisse le résultat précédent se jouer
        const target = na;
        plan = { airAt: na.airAt, fired: false, pending: true };
        later(delay, () => { if (plan && plan.airAt === target.airAt && plan.pending) buildPlan(target); });
      }
      if (state.status === "pregame" || state.status === "final" || state.status === "halftime") {
        for (const sp of sprites.values()) { if (!sp.leaving) { const p = parkLine(sp.team, sp.slot); moveTo(sp, p.x, p.y, 1); } }
        ball.holder = null;
        clockTxt.textContent = "24";
      }
    },
    // État du ballon pour les tests (audit possession 2026-10-07).
    // Diagnostic : remet les compteurs de fluidité à zéro (début d'une mesure).
    perfReset() { perf.n = 0; perf.i = 0; perf.prev = 0; perf.spikes = 0; perf.longFrames = 0; perf.maxIv = 0; perf.maxWork = 0; perf.frames = 0; },
    debug() {
      const h = ball.holder ? sprites.get(ball.holder) : null;
      return { holder: ball.holder, holderTeam: h ? h.team : null, inFlight: !!ball.flight, flightTarget: ball.flight ? ball.flight.target : null, flight: ball.flight ? { t: ball.flight.t, ms: ball.flight.ms, to: ball.flight.to } : null,
        scenePossession: possession, owner: ownerTeam(), refusals: audit.refusals, corrections: audit.corrections, releases: audit.releases,
        phase, phaseWhy, anomalies, inbounder, log: diagLog.slice(),
        suspended, resyncs: resyncCount, pendingTimers: timers.size, queued: queue.length, perf: perfReport(), gameOn, jumps, inbounds: inboundCount, sideInbounds, inboundHeld: !!heldInbound, ball: [+ball.x.toFixed(2), +ball.y.toFixed(2)], keeper: (k => (k ? [+k.x.toFixed(2), +k.y.toFixed(2)] : null))(refKeeper()),
        staging: stage ? stage.debug() : null };
    },
    // Crochets de test (live_court2d_test.js) : position du porteur, âge de
    // la possession, cible courante — aucun usage dans le jeu.
    test: {
      // Réaction du public (drapeaux compris) : captures et tests.
      react(kind, team, big) { crowdReact(kind, team, !!big); },
      setHolderPosition(x, y) { const h = sprites.get(ball.holder); if (h) { h.x = h.tx = x; h.y = h.ty = y; h.busy = false; crossed = false; } },
      resetPossessionClock(offsetMs) { possStart = now() + offsetMs; sceneUntil = 0; },
      holderTarget() { const h = sprites.get(ball.holder); return h ? { x: h.tx, y: h.ty } : null; },
      // Place un joueur (ou un arbitre « refN ») et le fige 10 s : captures et
      // test de l'anti-chevauchement.
      placeAt(id, x, y) { const sp = sprites.get(id) || refs.find(r => r.id === id); if (!sp) return; sp.x = sp.tx = x; sp.y = sp.ty = y; halt(sp); if (!sp.ref) busy(sp, 10000); },
      layout() { const out = {}; for (const sp of [...sprites.values(), ...refs]) out[sp.id] = { x: sp.x + sp.ox, y: sp.y + sp.oy, sx: sp.x, sy: sp.y, lab: sp.labState }; return { holder: ball.holder, sprites: out }; },
      // Fluidité (live_court2d_fluidity_test.js) : cible d'un jeton, état de
      // son mouvement, ballon remis à un joueur, image jouée à la main.
      target(id, x, y, speed = 1.6) { const sp = sprites.get(id) || refs.find(r => r.id === id); if (!sp) return; sp.busy = true; sp.tx = x; sp.ty = y; sp.speed = speed; },
      motion(id) { const sp = sprites.get(id) || refs.find(r => r.id === id); return sp ? { x: sp.x, y: sp.y, vx: sp.vx || 0, vy: sp.vy || 0, tx: sp.tx, ty: sp.ty, speed: sp.speed, nextDrift: sp.nextDrift || 0 } : null; },
      give(id) { return giveBall(sprites.get(id)); },
      bench() { return [...benchRefs.values()].map(b => ({ id: b.id, team: b.team, x: b.x, y: b.y, seat: b.seat, out: b.out, rank: b.rank })); },
      huddle: (t, i, n, ring) => huddlePos(t, i, n, ring),
      ball() { const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(ballG.getAttribute("transform") || ""); return { x: ball.x, y: ball.y, z: ball.z, shown: m ? { x: +m[1] / PX, y: +m[2] / PX } : null, holder: ball.holder, flight: !!ball.flight, loose: !!ball.loose }; },
      advance(ms) { const t = last + ms; frame(t); return t; },
    },
    destroy() { destroyed = true; halted = true; clearFx(); if (ro) try { ro.disconnect(); } catch (e) { /* rien */ } if (stage) stage.destroy(); cancelAnimationFrame(raf); timers.forEach(clearTimeout); timers.clear(); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility); clearTimeout(reactTimer); clearTimeout(flagTimer); host.innerHTML = ""; host.classList.remove("c2d"); },
  };
  // Diagnostic activé : accès depuis la console (window.__hmCourt2d.debug().perf).
  if (perfBox && typeof window !== "undefined") window.__hmCourt2d = api;
  return api;
}
