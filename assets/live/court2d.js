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
import { esc } from "./format.js";

const RIM = [{ x: 88.75, y: 25 }, { x: 5.25, y: 25 }];   // panier visé par l'équipe t
const NS = "http://www.w3.org/2000/svg";
const PX = 10;                                            // 1 pied = 10 unités SVG
const PAD = 50;                                           // gradins autour du terrain
const HEAD = 58;                                          // bande des médaillons + chrono
// Seuls ces événements donnent lieu à une possession jouée à l'avance ; les
// autres (changement, début de quart, temps mort…) se jouent à leur arrivée.
const PLANNED_KINDS = new Set(["shot", "rebound", "freeThrow", "turnover", "foul", "unsportsmanlikeFoul", "technicalFoul"]);
const VW = 940 + PAD * 2, VH = 500 + PAD * 2 + HEAD;
const SHOT_CLOCK = 24;

// Postes du moteur → créneau de formation (attaque / défense).
const SLOT = { M: 0, AS: 1, A: 2, AF: 3, P: 4 };
const OFF = [{ d: 30, y: 25 }, { d: 24, y: 5 }, { d: 24, y: 45 }, { d: 14, y: 12 }, { d: 7, y: 40 }];
const DEF = [{ d: 22, y: 21 }, { d: 17, y: 9 }, { d: 17, y: 41 }, { d: 9, y: 19 }, { d: 3, y: 32 }];

const rnd = (a, b) => a + Math.random() * (b - a);
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
const BENCH = [{ x: 33, y: 46 }, { x: 61, y: 46 }];
function parkLine(team, i) {
  const b = BENCH[team] || BENCH[0];
  const k = Math.max(0, Math.min(6, i)) - 2;                 // -2 … 4 autour du centre
  return { x: b.x + k * 3.2, y: b.y - (k === 0 || k === 2 ? 3 : (Math.abs(k) === 1 || k === 3 ? 1 : 0)) };
}
// Table de marque : où vont les arbitres pendant les arrêts.
const TABLE = { x: 47, y: 48 };

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
  const svg = el("svg", { viewBox: `0 0 ${VW} ${VH}`, class: "c2d-svg", role: "img", "aria-label": "Terrain animé du match" }, host);
  const defs = el("defs", {}, svg);
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
  el("stop", { offset: "0", "stop-color": "#fff3dc", "stop-opacity": ".16" }, light);
  el("stop", { offset: ".55", "stop-color": "#fff3dc", "stop-opacity": ".04" }, light);
  el("stop", { offset: "1", "stop-color": "#000", "stop-opacity": ".32" }, light);
  const spot = el("radialGradient", { id: uid + "-sp", cx: "50%", cy: "50%", r: "50%" }, defs);
  el("stop", { offset: "0", "stop-color": "#fff8e8", "stop-opacity": ".22" }, spot);
  el("stop", { offset: ".5", "stop-color": "#fff8e8", "stop-opacity": ".07" }, spot);
  el("stop", { offset: "1", "stop-color": "#fff8e8", "stop-opacity": "0" }, spot);
  const glow = el("radialGradient", { id: uid + "-gl", cx: "50%", cy: "50%", r: "50%" }, defs);
  el("stop", { offset: "0", "stop-color": "#ffe9b8", "stop-opacity": ".10" }, glow);
  el("stop", { offset: "1", "stop-color": "#ffe9b8", "stop-opacity": "0" }, glow);
  el("rect", { width: VW, height: VH, fill: "#0b1220", rx: "14" }, svg);
  el("rect", { width: VW, height: VH, fill: `url(#${uid}-cw)`, rx: "14" }, svg);
  el("rect", { width: VW, height: VH, fill: `url(#${uid}-vg)`, rx: "14" }, svg);
  const floor = el("g", { transform: `translate(${PAD} ${PAD + HEAD})` }, svg);
  const floorBase = el("g", {}, floor);          // parquet + zones (redessiné selon le club)
  // Lumière des projecteurs posée SUR le parquet, SOUS les lignes et les joueurs.
  const lightG = el("g", { class: "c2d-light" }, floor);
  [[190, 250, 330], [750, 250, 330], [470, 250, 260]].forEach(([cx, cy, r]) => el("ellipse", { cx, cy, rx: r, ry: r * 0.78, fill: `url(#${uid}-sp)` }, lightG));
  el("rect", { width: "940", height: "500", rx: "8", fill: `url(#${uid}-lt)` }, lightG);
  // Halo des projecteurs qui déborde sur les gradins, au-dessus de chaque panier.
  [[52, 250], [888, 250]].forEach(([cx, cy]) => el("ellipse", { cx, cy, rx: 150, ry: 110, fill: `url(#${uid}-gl)` }, lightG));
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
    el("line", { x1: X(40), y1: "220", x2: X(40), y2: "280", stroke: "#e9e9e9", "stroke-width": "5" }, lines);
    el("circle", { cx: X(52), cy: "250", r: "8", stroke: "#F5A13A", "stroke-width": "3", class: "c2d-rim" }, lines);
  });
  const logoG = el("g", { class: "c2d-logo", opacity: ".8" }, floor);
  const adTop = el("text", { x: "470", y: "50", class: "c2d-ad", "text-anchor": "middle" }, floor);
  const adBot = el("text", { x: "470", y: "472", class: "c2d-ad", "text-anchor": "middle" }, floor);
  // Tirs manqués : plus aucune marque sur le terrain (retour utilisateur
  // 2026-10-08 : la carte des tirs les montre déjà) — ni croix, ni onde
  // rouge au cercle, ni texte ; seule l'action est jouée (tir, rebond).

  // Parquet : bois + bordeaux par défaut, ou parquet du club qui reçoit
  // (state.courtStyle : floor, grain, line, paint — Premium).
  let floorKey = null;
  function drawFloor(cs) {
    const key = cs ? [cs.floor, cs.grain, cs.line, cs.paint].join("|") : "default";
    if (key === floorKey) return;
    floorKey = key;
    floorBase.innerHTML = "";
    const wood = cs ? cs.floor : "#cf9a55", grain = cs ? cs.grain : "#c6904b";
    const paint = cs && cs.paint ? cs.paint : (cs ? null : "rgba(118,30,56,.55)");
    el("rect", { width: "940", height: "500", rx: "8", fill: wood }, floorBase);
    for (let y = 14; y < 500; y += 14) el("rect", { y, width: "940", height: "1", fill: grain, opacity: ".9" }, floorBase);
    for (let y = 0; y < 500; y += 14) for (let x = (y / 14) % 2 ? 45 : 0; x < 940; x += 90) el("rect", { x, y, width: "1", height: "14", fill: grain, opacity: ".7" }, floorBase);
    if (paint) {
      [false, true].forEach(flip => {
        const X = x => (flip ? 940 - x : x), sw = flip ? 0 : 1;
        el("path", { d: `M${X(0)} 30 L${X(141.5)} 30 A237.5 237.5 0 0 ${sw} ${X(141.5)} 470 L${X(0)} 470 Z`, fill: paint, opacity: cs ? ".55" : "1" }, floorBase);
        el("rect", { x: flip ? 750 : 0, y: "170", width: "190", height: "160", fill: paint, opacity: cs ? ".85" : ".9" }, floorBase);
      });
      if (cs) el("circle", { cx: "470", cy: "250", r: "60", fill: paint, opacity: ".65" }, floorBase);
    }
    lines.setAttribute("stroke", cs ? cs.line : "rgba(255,255,255,.88)");
  }
  drawFloor(null);

  // --- bande du haut : médaillons des cinq en jeu + chrono des 24 s ---
  const head = el("g", { transform: `translate(${PAD} 12)`, class: "c2d-head" }, svg);
  const medals = [el("g", { class: "c2d-medals t0" }, head), el("g", { class: "c2d-medals t1", transform: "translate(940 0)" }, head)];
  const clockG = el("g", { transform: "translate(470 0)", class: "c2d-clock" }, head);
  el("rect", { x: "-44", y: "2", width: "88", height: "40", rx: "10", fill: "rgba(10,16,28,.85)", stroke: "rgba(255,255,255,.12)" }, clockG);
  el("text", { x: "0", y: "16", "text-anchor": "middle", class: "c2d-clock-lbl" }, clockG).textContent = "24 S";
  const clockTxt = el("text", { x: "0", y: "36", "text-anchor": "middle", class: "c2d-clock-val" }, clockG);
  clockTxt.textContent = "24";

  // --- calques animés ---
  const layer = el("g", { transform: `translate(${PAD} ${PAD + HEAD})`, class: "c2d-players" }, svg);
  const ballG = el("g", { class: "c2d-ball" }, layer);
  el("ellipse", { cx: "0", cy: "6", rx: "7", ry: "3", fill: "rgba(0,0,0,.35)", class: "c2d-ball-sh" }, ballG);
  const ballBody = el("g", {}, ballG);
  const ballGrad = el("radialGradient", { id: uid + "-bl", cx: "35%", cy: "30%", r: "70%" }, defs);
  el("stop", { offset: "0", "stop-color": "#ffb76b" }, ballGrad);
  el("stop", { offset: ".6", "stop-color": "#e8892e" }, ballGrad);
  el("stop", { offset: "1", "stop-color": "#b85f17" }, ballGrad);
  el("circle", { r: "7", fill: `url(#${uid}-bl)`, stroke: "#4a2308", "stroke-width": "1.2" }, ballBody);
  el("path", { d: "M-7 0h14M0 -7v14M-4.5 -5.3c2.6 2.4 2.6 8.2 0 10.6M4.5 -5.3c-2.6 2.4-2.6 8.2 0 10.6", fill: "none", stroke: "#4a2308", "stroke-width": "1" }, ballBody);
  const fxG = el("g", { class: "c2d-fx" }, layer);
  const caption = document.createElement("div");
  caption.className = "c2d-caption";
  host.appendChild(caption);

  // ---------- état ----------
  const sprites = new Map();
  const ball = { x: 47, y: 25, z: 0, holder: null, flight: null };
  let S = null, possession = 0, raf = 0, last = performance.now(), timers = [];
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
  // Audit possession (2026-10-07) : dernier événement joué, compteurs du
  // garde-fou (voir giveBall / tick) lus par les tests via debug().
  let lastPlayed = null;
  // releases : ballon lâché à l'instant où le moteur change la possession
  // (interception, perte…) ; corrections : écart rattrapé par le garde-fou
  // de l'animation (scène en retard) ; refusals : remise refusée.
  const audit = { refusals: 0, corrections: 0, releases: 0 };

  function makeSprite(p, t) {
    const g = el("g", { class: "c2d-p t" + t, "data-id": p.id }, layer);
    el("ellipse", { cx: "0", cy: "12", rx: "13", ry: "5", fill: "rgba(0,0,0,.38)", class: "c2d-sh" }, g);
    const ring = el("ellipse", { cx: "0", cy: "12", rx: "17", ry: "7", fill: "none", stroke: "#F5A13A", "stroke-width": "2", class: "c2d-ring", opacity: "0" }, g);
    const carrier = el("ellipse", { cx: "0", cy: "12", rx: "19", ry: "8", fill: "none", stroke: "#fff", "stroke-width": "1.6", "stroke-dasharray": "4 3", class: "c2d-carrier", opacity: "0" }, g);
    let av = null;
    if (p.avatar) {
      const tpl = document.createElement("template");
      tpl.innerHTML = p.avatar;
      av = tpl.content.querySelector("svg");
    }
    if (av) {
      const cid = uid + "-c" + (++clipSeq);
      const cp = el("clipPath", { id: cid }, defs);
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
    const lab = el("g", { class: "c2d-lab" }, g);
    const txt = el("text", { y: "26", "text-anchor": "middle" }, lab);
    txt.textContent = lastName(p.name).toUpperCase();
    const w = Math.max(30, txt.textContent.length * 6.6 + 10);
    lab.insertBefore(el("rect", { x: -w / 2, y: "17", width: w, height: "13", rx: "4", fill: colors[t], class: "c2d-plate" }), txt);
    const stat = el("text", { y: "-36", "text-anchor": "middle", class: "c2d-stat", opacity: "0" }, g);
    const sp = { id: p.id, team: t, g, ring, carrier, stat, x: 47, y: t ? 30 : 20, tx: 47, ty: 25, speed: 1, slot: SLOT[p.pos] ?? 2, name: p.name, avatar: p.avatar };
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
    const home = [{ x: 47, y: 48 }, { x: 42, y: 48 }, { x: 52, y: 48 }][i];
    return { id: "ref" + i, g, x: home.x, y: home.y, tx: home.x, ty: home.y, speed: 1, moving: false };
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
    if (!live || performance.now() < stopUntil) return [{ x: 47, y: 48.5 }, { x: 41, y: 48.5 }, { x: 53, y: 48.5 }];
    if (lastPlayed && lastPlayed.kind === "tipoff" && performance.now() < sceneUntil) return [{ x: 47, y: 29 }, { x: 30, y: 2.5 }, { x: 64, y: 47.5 }];
    const rim = RIM[possession], dir = rim.x > 47 ? 1 : -1;
    const ballSide = ball.y < 25 ? -1 : 1;                   // -1 : haut de l'écran
    const sideY = side => (side < 0 ? 2.5 : 47.5);
    const bx = Math.max(6, Math.min(88, ball.x));
    return [
      { x: rim.x + dir * 4.5, y: 25 + ballSide * 11 },                                   // chef
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
    best.forEach((ti, ri) => { const r = refs[ri]; r.tx = T[ti].x + rnd(-0.6, 0.6); r.ty = T[ti].y; r.speed = Math.hypot(r.tx - r.x, r.ty - r.y) > 20 ? 1.3 : 0.9; });
  }

  function syncRoster() {
    const seen = new Set();
    [0, 1].forEach(t => {
      const on = S.teams[t].players.filter(p => p.onCourt);
      const used = new Set();
      on.forEach(p => {
        let sp = sprites.get(p.id);
        if (!sp) {
          sp = makeSprite(p, t);
          const park = parkLine(t, used.size); sp.x = sp.tx = park.x; sp.y = sp.ty = park.y;
        } else if (sp.leaving) { sp.leaving = false; sp.leaveAt = 0; sp.busy = false; }
        let slot = SLOT[p.pos] ?? 2;
        while (used.has(slot)) slot = (slot + 1) % 5;
        used.add(slot); sp.slot = slot;
        seen.add(p.id);
      });
    });
    for (const [id, sp] of sprites) if (!seen.has(id) && !sp.leaving) {
      const park = parkLine(sp.team, 6);
      sp.tx = park.x; sp.ty = park.y; sp.leaving = true; sp.busy = false;
      if (ball.holder === id) ball.holder = null;
      sp.leaveAt = performance.now() + 1500;
    }
  }

  // Cibles de formation. Les défenseurs se placent entre leur vis-à-vis
  // (même créneau) et le cercle, pas sur un créneau figé.
  function formation() {
    if (performance.now() < stopUntil) return;   // arrêt de jeu : tout le monde reste au banc
    for (const sp of sprites.values()) {
      if (sp.leaving || sp.busy) continue;
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
    if (sp && performance.now() < stopUntil) { ball.holder = null; ball.flight = null; return false; }
    ball.holder = sp ? sp.id : null; ball.flight = null;
    return true;
  }
  function fly(to, ms, height, done) {
    ball.holder = null;
    ball.flight = { from: { x: ball.x, y: ball.y }, to, t: 0, ms, h: height, done, target: null };
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
  function flyTo(sp, ms, height, done) {
    if (!sp) return;
    fly({ x: sp.x, y: sp.y }, ms, height, done);
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
    flyTo(to, Math.max(140, Math.min(lob ? 520 : 320 + dist * 6, maxMs)), lob ? 7 : 2.5, () => giveBall(to));
  }
  const later = (ms, fn) => { const id = setTimeout(fn, Math.max(0, ms)); timers.push(id); return id; };
  function busy(sp, ms) { if (!sp) return; sp.busy = true; later(ms, () => { sp.busy = false; }); }
  // Saut (tir, contre, rebond) : l'avatar se soulève et grossit un instant.
  function jump(sp, h = 1) { if (!sp) return; sp.jump = { t: 0, h }; }
  // Réaction du banc (sobre) : la bande des médaillons de l'équipe sursaute.
  function cheer(team) { const g = medals[team]; if (!g) return; g.classList.remove("c2d-cheer"); void g.getBoundingClientRect; g.classList.add("c2d-cheer"); later(700, () => g.classList.remove("c2d-cheer")); }
  // Cibles bornées au terrain (le remiseur peut sortir derrière la ligne de fond, en x seulement).
  function moveTo(sp, x, y, speed = 1.6) { if (!sp) return; sp.tx = Math.max(-3, Math.min(97, x)); sp.ty = Math.max(1.5, Math.min(48.5, y)); sp.speed = speed; }
  function say(text) { caption.innerHTML = text; caption.classList.add("show"); }
  function flash(sp, text, cls = "") {
    if (!sp) return;
    sp.stat.textContent = text; sp.stat.setAttribute("class", "c2d-stat " + cls); sp.stat.setAttribute("opacity", "1");
    later(1600, () => sp.stat.setAttribute("opacity", "0"));
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
    later(1500, () => g.remove());
  }
  const blockLabel = () => { try { const t = typeof window !== "undefined" && window.hmI18n && window.hmI18n.t ? window.hmI18n.t("Contre") : "Contre"; return String(t || "Contre").toUpperCase(); } catch (e) { return "CONTRE"; } };
  function rimFx(team, made) {
    if (!made) return;
    const r = RIM[team];
    const c = el("circle", { cx: r.x * PX, cy: r.y * PX, r: "10", fill: "none", stroke: "#5fd6ae", "stroke-width": "3", class: "c2d-wave" }, fxG);
    later(900, () => c.remove());
  }
  function startPossession(t) { possession = t; possStart = now(); crossed = false; }
  // Ligne médiane franchie dans le sens de l'attaque ?
  const inFront = (team, x) => (team === 0 ? x >= 47 : x <= 47);
  // Borne une abscisse à la zone avant quand le ballon y est déjà passé.
  function frontX(team, x) { if (!crossed) return x; return team === 0 ? Math.max(48.5, x) : Math.min(45.5, x); }

  // Remise en jeu après panier : le pivot derrière la ligne de fond, le
  // meneur vient chercher le ballon, puis tout le monde remonte.
  function inbound(nt, rim) {
    if (performance.now() < stopUntil) return;   // temps mort / fin de quart déjà sifflé : pas de remise en jeu
    startPossession(nt); scene(2400);
    const dir = rim.x > 47 ? 1 : -1;
    const team = onCourt(nt).sort((a, b) => a.slot - b.slot);
    const pg = team[0], inb = team[team.length - 1];
    if (!pg) return;
    for (const sp of sprites.values()) sp.busy = false;
    // Le remiseur sort DERRIÈRE la ligne de fond (hors du terrain), le
    // meneur vient chercher le ballon à l'intérieur ; les autres remontent
    // déjà (retour utilisateur 2026-10-01 : « devant la ligne de fond et pas
    // derrière, ça ne va pas »).
    const baseline = dir > 0 ? 94 : 0;
    if (inb && inb !== pg) { busy(inb, 2400); moveTo(inb, baseline + dir * 2.2, 25 + rnd(-6, 6), 2.2); }
    busy(pg, 2400); moveTo(pg, baseline - dir * 9, 30 + rnd(-4, 4), 2);
    for (const sp of onCourt(nt)) if (sp !== pg && sp !== inb) { busy(sp, 1200); moveTo(sp, lerp(sp.x, 47, 0.5), sp.y + rnd(-4, 4), 1.4); }
    formation();
    // Un arrêt de jeu survenu entre-temps (temps mort, fin de quart) annule
    // la suite de la remise en jeu : personne ne revient du banc.
    const stopped = () => performance.now() < stopUntil;
    later(800, () => { if (stopped()) return; const src = (inb && inb !== pg) ? inb : pg; flyTo(src, 300, 1, () => giveBall(src)); });
    later(1650, () => { if (stopped()) return; if (inb && inb !== pg && ball.holder === inb.id) pass(inb, pg); });
    later(2200, () => { if (stopped()) return; pg.busy = false; if (inb) inb.busy = false; if (!ball.holder) giveBall(pg); formation(); });
  }

  // ---------- possession à venir (state.nextAction) ----------
  // Calée sur le temps réel : la remontée de balle occupe le premier tiers,
  // les passes le deuxième, le tireur rejoint son endroit et tire pour que
  // le ballon atteigne le cercle exactement à `airAt`. Les acteurs viennent
  // de l'événement (le moteur a déjà décidé) ; le résultat n'est joué qu'à
  // l'arrivée réelle de l'événement (playEvent), donc jamais dévoilé avant.
  function buildPlan(na) {
    // Une scène est en cours (remise en jeu, rebond…) : on attend sa fin
    // avant de lancer la possession, sans jamais couper la chorégraphie.
    const wait = sceneUntil - performance.now();
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
    if (!PLANNED_KINDS.has(kind)) { plan = { airAt: na.airAt, fired: true, skipped: true }; return; }
    const a = na.actors || {};
    // Équipe en attaque : celle que le moteur donne pour l'action
    // (possessionTeam = possession PENDANT l'action) ; repli pour un direct
    // antérieur.
    const offT = teamOf(na.possessionTeam) !== null && kind !== "rebound" ? na.possessionTeam
      : kind === "rebound" ? (na.offensive ? na.team : 1 - na.team)
      : kind === "foul" || kind === "unsportsmanlikeFoul" || kind === "technicalFoul" ? 1 - na.team
      : na.team;
    if (offT !== 0 && offT !== 1) { plan = { airAt: na.airAt, fired: true, skipped: true }; return; }
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
    // Remontée : le porteur dribble jusqu'à la tête de raquette.
    const top = slotPos(offT, 0, true);
    moveTo(handler, top.x, top.y, 1.6);
    formation();
    if (kind === "freeThrow") {
      // Alignement pour les lancers francs, tir calé sur airAt.
      const rim = RIM[offT], dir = rim.x > 47 ? -1 : 1;
      at(0.05, () => {
        const line = { x: rim.x + dir * 13.75, y: 25 };
        const sh = shooter || handler;
        for (const sp of sprites.values()) sp.busy = false;
        busy(sh, total); moveTo(sh, line.x, line.y, 1.8);
        const others = [...onCourt(offT).filter(s => s !== sh), ...onCourt(1 - offT)];
        others.forEach((sp, i) => { busy(sp, total); moveTo(sp, rim.x + dir * (3 + (i >> 1) * 5.5), i % 2 ? 16.5 : 33.5, 1.8); });
        later(700, () => { if (plan === self && sh && ball.holder !== sh.id) flyTo(sh, 300, 1.5, () => giveBall(sh)); });
      });
      at(0.97, () => { fly({ x: RIM[offT].x, y: RIM[offT].y }, Math.max(350, total * 0.03), 6); plan.fired = true; firedAt = na.airAt; });
      return;
    }
    if (kind === "turnover" || kind === "foul" || kind === "unsportsmanlikeFoul" || kind === "technicalFoul") {
      // Chaîne réelle du moteur (porteur → créateur → joueur qui perd le
      // ballon / qui subit la faute) ; aucune passe inventée. Sur une faute
      // technique ou antisportive, `player` est le FAUTIF (défense) : il ne
      // reçoit jamais le ballon.
      const victim = (kind === "turnover" || kind === "foul") ? spriteOf(a.player) : null;
      const chain = [];
      for (const sp of [handler, ...(na.passes || []).map(spriteOf), victim]) if (sp && sp.team === offT && chain[chain.length - 1] !== sp) chain.push(sp);
      const n = chain.length - 1;
      for (let i = 0; i < n; i++) at(n === 1 ? 0.7 : 0.45 + 0.3 * (i / (n - 1)), () => pass(chain[i], chain[i + 1]));
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
    for (let i = 0; i < nPass; i++) {
      const from = chain[i], to = chain[i + 1], t = times[i];
      const lob = type === "post" && i === nPass - 1;   // entrée de balle au poste : lobée
      // Vol borné : arrivée avant la passe suivante, et au plus tard 120 ms avant le tir.
      const limit = (i + 1 < nPass ? times[i + 1] : tShot - 120) - t;
      atMs(t, () => pass(from, to, lob, limit));
    }
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
      const gap = q === "très contesté" ? 1.2 : 2.2;
      atMs(Math.max(tMove, tShot + lateMs), () => { busy(defender, 1400); moveTo(defender, lerp(spot.x, rim.x, 0.08) + (rim.x > 47 ? gap : -gap), spot.y + 0.6, q === "ouvert" ? 1.8 : 2.6); });
    }
    later(Math.max(0, tShot), () => {
      if (plan !== self) return;
      // Le tir part : le ballon touche le cercle à airAt. Saut du tireur.
      // Le ballon part d'où il est (dans les mains du tireur, ou encore en
      // fin de passe) : plus de téléportation sur le tireur.
      const sh = shooter || spriteOf(ball.holder);
      // Passe vers le tireur encore en l'air (action très courte) : il la
      // reçoit maintenant, le tir part de ses mains.
      if (sh && ball.flight && ball.flight.target === sh.id) { ball.flight.done = null; giveBall(sh); const h = sprites.get(sh.id); if (h) { ball.x = h.x; ball.y = h.y; } }
      if (sh) jump(sh, drive ? 0.9 : 1.15);
      if (defender && na.quality !== "ouvert") later(120, () => jump(defender, 1.1));
      fly({ x: rim.x, y: rim.y }, flightMs, flightH);
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
  let sceneUntil = 0, firstUpdate = true, lastSort = 0, sortKey = "";
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

  // ---------- résultat d'une action (événement arrivé) ----------
  function playEvent(e) {
    if (e.kind === "quote") return;   // commentaire du présentateur : fil seulement
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
        later(1100, () => {
          fly({ x: c.x, y: c.y }, 800, 10, () => {
            const to = handlerOf(t) || onCourt(t)[0];
            if (!to) return;
            startPossession(t);
            flyTo(to, 380, 3, () => { for (const sp of sprites.values()) sp.busy = false; giveBall(to); formation(); });
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
        const fouledShot = !isReb && !e.made && !blockedShot;
        const spot = e.shot ? { x: e.shot.x, y: e.shot.y } : slotPos(offT, shooter ? shooter.slot : 0, true);
        const rim = RIM[offT];
        const finish = () => {
          rimFx(offT, !!e.made);
          if (e.made) {
            flash(shooter, e.zone === "three" ? "+3" : "+2", "good");
            later(350, () => { jump(shooter, 0.6); cheer(offT); });
            ball.x = rim.x + (rim.x > 47 ? -1.5 : 1.5); ball.y = rim.y + 1; ball.holder = null; ball.flight = null;
            // Panier + faute (« and one ») : pas de remise en jeu, les lancers suivent.
            // Panier + faute (« and one ») : le moteur laisse le ballon à
            // l'attaque (possessionAfter), les lancers suivent.
            later(900, () => {
              if (after === null ? queue.some(q => q.kind === "foul" || q.kind === "freeThrow") : nextT === offT) return;
              inbound(nextT, rim);
            });
          } else if (blockedShot) {
            // Contre : le ballon part du contre et reste LIBRE ; le rebond
            // (événement suivant du moteur) dira qui le récupère.
            const bl = spriteOf(a.blocker); jump(bl, 1.3);
            banner(blockLabel(), "block");
            const dir = rim.x > 47 ? -1 : 1;
            fly({ x: spot.x + dir * 4, y: spot.y + rnd(-4, 4) }, 260, 2.5);
          } else if (fouledShot) {
            // Faute sur le tir : pas de rebond, le tireur va aux lancers.
            fly({ x: rim.x + (rim.x > 47 ? -2 : 2), y: rim.y + 1.5 }, 300, 1.5, () => { if (shooter && shooter.team === nextT) flyTo(shooter, 380, 2, () => giveBall(shooter)); });
          } else {
            // Rebond : le ballon rebondit sur le cercle (ou part du contre)
            // puis retombe ; le vrai rebondeur y va, les autres proches
            // s'approchent (lutte), et il saute pour le capter.
            const dir = rim.x > 47 ? -1 : 1;
            const drop = { x: rim.x + dir * rnd(3, 9), y: rim.y + rnd(-7, 7) };
            const hop = afterBlock ? { x: ball.x, y: ball.y } : { x: rim.x + dir * rnd(0.5, 2), y: rim.y + rnd(-1.5, 1.5) };
            scene(1700);
            // Rebondeur désigné par le moteur, de l'équipe qui récupère.
            const named = spriteOf(a.rebounder);
            const rb = named && named.team === nextT ? named : handlerOf(nextT);
            const near = [...sprites.values()].filter(sp => sp !== rb && !sp.leaving && Math.hypot(sp.x - rim.x, sp.y - rim.y) < 14).slice(0, 3);
            fly(hop, 200, 2.5, () => {
              near.forEach(sp => { busy(sp, 900); moveTo(sp, lerp(sp.x, drop.x, 0.5) + rnd(-1.5, 1.5), lerp(sp.y, drop.y, 0.5) + rnd(-1.5, 1.5), 1.6); });
              if (rb) { busy(rb, 1000); moveTo(rb, drop.x + rnd(-0.8, 0.8), drop.y + rnd(-0.8, 0.8), 2.4); }
              fly(drop, 420, 3.5, () => {
                if (rb) jump(rb, 1);
                later(450, () => { startPossession(nextT); giveBall(rb); if (rb && isReb) flash(rb, "REB"); formation(); });
              });
            });
          }
        };
        if (afterBlock) { finish(); break; }
        if (prePlayed) { ball.flight = null; if (!blockedShot) { ball.x = rim.x; ball.y = rim.y; } finish(); break; }
        // Pas de plan (première action, reconnexion) : version courte.
        const cur = spriteOf(ball.holder);
        const handler = (cur && cur.team === offT ? cur : null) || handlerOf(offT);
        let delay = 0;
        if (shooter) { busy(shooter, 1800); moveTo(shooter, spot.x, spot.y, 2); }
        if (handler && ball.holder !== handler.id && !ball.flight) giveBall(handler);
        if (assister && assister !== handler && assister !== shooter) { later(delay, () => pass(handler, assister)); delay += 420; }
        if (shooter && (handler !== shooter || assister)) { later(delay, () => pass(assister || handler, shooter)); delay += 450; }
        later(delay + 250, () => fly({ x: rim.x, y: rim.y }, e.zone === "three" ? 700 : 520, e.zone === "paint" ? 4 : 8, finish));
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
        const finish = () => {
          rimFx(t, made); if (made) flash(shooter, "+" + e.made, "good");
          scene(1500);
          later(500, () => {
            for (const sp of sprites.values()) sp.busy = false;
            if (nextT === t) { startPossession(t); const h = handlerOf(t); if (h) flyTo(h, 420, 2, () => { giveBall(h); formation(); }); return; }
            if (made) { inbound(nextT, rim); return; }
            // Lancer manqué : le moteur rend le ballon à `nextT` sans désigner
            // de rebondeur ; on prend son joueur le plus grand (créneau 4).
            const rb = onCourt(nextT).sort((a, b) => b.slot - a.slot)[0];
            const drop = { x: rim.x - dir * rnd(2, 5), y: rim.y + rnd(-5, 5) };
            fly(drop, 380, 3, () => {
              if (rb) { busy(rb, 700); moveTo(rb, drop.x, drop.y, 2.2); }
              later(600, () => { startPossession(nextT); giveBall(rb || handlerOf(nextT)); formation(); });
            });
          });
        };
        if (prePlayed) { ball.flight = null; ball.x = rim.x; ball.y = rim.y; finish(); break; }
        const line = { x: rim.x + dir * 13.75, y: 25 };
        if (shooter) { busy(shooter, 2600); moveTo(shooter, line.x, line.y, 1.6); }
        const others = [...onCourt(t).filter(s => s !== shooter), ...onCourt(1 - t)];
        others.forEach((sp, i) => { busy(sp, 2600); moveTo(sp, rim.x + dir * (3 + (i >> 1) * 5.5), i % 2 ? 16.5 : 33.5, 1.6); });
        // Lancers joués après leur diffusion (version courte) : si le moteur a
        // déjà rendu le ballon à l'adversaire, le tireur ne le « porte » pas,
        // le ballon passe seulement par ses mains avant le cercle.
        later(900, () => { if (shooter && ball.holder !== shooter.id) flyTo(shooter, 300, 1.5, nextT === t ? () => giveBall(shooter) : null); });
        later(1400, () => fly({ x: rim.x, y: rim.y }, 600, 6, finish));
        break;
      }
      case "turnover": {
        // Le ballon quitte IMMÉDIATEMENT l'équipe qui le perd : vers
        // l'intercepteur (désigné par le moteur), ou hors du terrain puis
        // remise en jeu de l'équipe qui le récupère (possessionAfter).
        const nt = after !== null ? after : 1 - t;
        const stl = spriteOf(a.stealer), st = stl && stl.team === nt ? stl : null;
        const pl = spriteOf(a.player) || spriteOf(ball.holder);
        startPossession(nt);
        if (st) {
          busy(st, 900);
          if (pl) moveTo(st, pl.x + (st.team === 0 ? -1 : 1), pl.y + 1, 2.4);
          flash(st, "INT", "good");
          flyTo(st, 420, 1.5, () => giveBall(st));
          later(900, () => formation());
        } else {
          if (pl) flash(pl, "PERTE", "bad");
          const src = pl || { x: ball.x, y: ball.y };
          fly({ x: src.x + rnd(-3, 3), y: src.y < 25 ? -2 : 52 }, 500, 2, () => {
            const h = handlerOf(nt);
            later(400, () => { if (h && !ball.holder) flyTo(h, 420, 2, () => { giveBall(h); formation(); }); });
          });
        }
        break;
      }
      case "foul": case "unsportsmanlikeFoul": case "technicalFoul": {
        // Fautif (réel) et victime (réelle, `player` sur une faute simple) :
        // contact joué — le fautif vient au contact, la victime encaisse.
        const d = spriteOf(a.defender) || (e.kind !== "foul" ? spriteOf(a.player) : null) || onCourt(t)[0];
        const v = e.kind === "foul" ? spriteOf(a.player) : null;
        if (d && v && d !== v) { busy(d, 900); busy(v, 900); moveTo(d, v.x + (d.x >= v.x ? 1.6 : -1.6), v.y + 0.4, 2.6); later(350, () => jump(v, 0.5)); }
        flash(d, e.kind === "technicalFoul" ? "TECHNIQUE" : e.kind === "unsportsmanlikeFoul" ? "ANTISPORTIVE" : "FAUTE", "bad");
        if (d) { d.ring.setAttribute("opacity", "1"); later(1500, () => d.ring.setAttribute("opacity", "0")); }
        break;
      }
      case "foulOut": case "technicalEjection": case "injury": { flash(spriteOf(a.player), e.kind === "injury" ? "BLESSÉ" : "EXCLU", "bad"); break; }
      case "substitution": case "shortHanded": {
        const p = spriteOf(a.player); if (p) flash(p, "SORT");
        later(1600, () => { const r = spriteOf(a.replacement); if (r) flash(r, "ENTRE", "good"); });
        break;
      }
      case "quarterStart": {
        for (const sp of sprites.values()) sp.busy = false;
        sceneUntil = 0; stopUntil = 0;
        if (e.quarter === 1) {
          // Entrée des joueurs : du banc vers le rond central, l'entre-deux suit.
          scene(2500);
          ball.holder = null; ball.flight = null; ball.x = 47; ball.y = 25;
          for (const sp of sprites.values()) { const dir = sp.team === 0 ? -1 : 1; moveTo(sp, 47 + dir * (8 + sp.slot * 2), 25 + (sp.slot - 2) * 5, 1.3); busy(sp, 2400); }
          break;
        }
        // Reprise : remise en jeu de l'équipe en possession depuis sa ligne de fond.
        const pt = teamOf(e.possessionTeam) !== null ? e.possessionTeam : teamOf(ownerTeam()) !== null ? ownerTeam() : possession;
        inbound(pt, RIM[1 - pt]);
        break;
      }
      case "quarterEnd": {
        // Tout le monde au banc jusqu'au début du quart suivant.
        scene(60 * 60 * 1000);
        stopUntil = performance.now() + 60 * 60 * 1000;
        plan = null;
        for (const sp of sprites.values()) { const p = parkLine(sp.team, sp.slot); moveTo(sp, p.x, p.y, 1.3); busy(sp, 4000); }
        ball.holder = null; ball.flight = null;
        break;
      }
      case "timeout": {
        // Au banc pendant toute la pause (durée réelle du temps mort si le
        // fil la donne, 60 s côté serveur) ; la reprise vient de la
        // possession suivante (buildPlan attend la fin de scène).
        const hold = e.durationMs || 4200;
        scene(hold);
        stopUntil = performance.now() + hold;
        // La possession planifiée avant l'arrêt est oubliée : elle sera
        // reconstruite à la reprise (buildPlan attend la fin de scène), et
        // ses étapes déjà posées ne déplacent plus personne.
        plan = null;
        // Chacun rejoint SON banc (BENCH[team], de part et d'autre de la table) d'un pas rapide.
        for (const sp of sprites.values()) { const p = parkLine(sp.team, sp.slot); moveTo(sp, p.x, p.y, 1.5); busy(sp, hold - 600); }
        ball.holder = null; ball.flight = null;
        later(hold - 500, () => { stopUntil = 0; for (const sp of sprites.values()) sp.busy = false; const own = ownerTeam(); if (own !== null) possession = own; giveBall(handlerOf(possession)); formation(); });
        break;
      }
      default: break;
    }
    if (e.text) say(e.text);
  }

  // Médaillons des cinq en jeu : avatar, points / rebonds / passes.
  function syncMedals() {
    const key = [0, 1].map(t => S.teams[t].players.filter(p => p.onCourt).map(p => p.id).join("|")).join("#");
    if (key === medalsKey) return;
    medalsKey = key;
    [0, 1].forEach(t => {
      const g = medals[t]; g.innerHTML = "";
      const on = S.teams[t].players.filter(p => p.onCourt).slice(0, 5);
      on.forEach((p, i) => {
        const x = t === 0 ? i * 86 : -(i + 1) * 86 + 4;
        const m = el("g", { transform: `translate(${x} 0)`, class: "c2d-medal" }, g);
        el("rect", { width: "82", height: "44", rx: "8", fill: "rgba(10,16,28,.82)", stroke: colors[t], "stroke-width": "1.2", "stroke-opacity": ".7" }, m);
        if (p.avatar) {
          const tpl = document.createElement("template"); tpl.innerHTML = p.avatar;
          const av = tpl.content.querySelector("svg");
          if (av) {
            const cid = uid + "-m" + (++clipSeq);
            const cp = el("clipPath", { id: cid }, defs);
            // Proportions et arrondi des avatars du jeu (120:130, 18 %).
            el("rect", { x: "2", y: "3.5", width: "34", height: "37", rx: "6.1" }, cp);
            av.setAttribute("width", "34"); av.setAttribute("height", "37"); av.setAttribute("x", "2"); av.setAttribute("y", "3.5");
            const wrap = el("g", { "clip-path": `url(#${cid})` }, m); wrap.appendChild(av);
          }
        }
        // Nom seul, toujours contenu dans la carte (retour 2026-10-08 : plus
        // de statistiques sur les cartes, aucun nom qui déborde) : largeur
        // disponible 40 px ; au-delà, les glyphes sont resserrés (textLength).
        const name = lastName(p.name).toUpperCase();
        const nm = el("text", { x: "60", y: "25", "text-anchor": "middle", class: "c2d-medal-name" }, m);
        nm.textContent = name;
        // Mesure réelle quand le navigateur la donne (≈ 8 px par lettre en
        // 800 10 px), estimation sinon (tests JSDOM).
        let w = name.length * 8;
        try { if (typeof nm.getComputedTextLength === "function") { const m = nm.getComputedTextLength(); if (m > 0) w = m; } } catch (e) { /* JSDOM */ }
        if (w > 40) { nm.setAttribute("textLength", "40"); nm.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
      });
    });
  }

  // ---------- boucle d'animation ----------
  function tick(nowP) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (nowP - last) / 1000); last = nowP;
    // Jeu sans ballon (retour utilisateur 2026-10-01 : « les joueurs sont
    // trop statiques ») : toutes les 1,2 s, chaque attaquant sans ballon
    // bouge autour de son poste, et un sur trois coupe vers le cercle (puis
    // ressort) ; le porteur dribble sur place en se décalant ; les
    // défenseurs suivent leur vis-à-vis entre lui et le panier.
    if (S && S.status === "live" && nowP - lastDrift > 1200 && nowP > sceneUntil) {
      lastDrift = nowP;
      const rim = RIM[possession];
      for (const sp of sprites.values()) {
        if (sp.leaving || sp.busy) continue;
        if (sp.team === possession) {
          const p = slotPos(sp.team, sp.slot, true);
          if (ball.holder === sp.id) continue;   // le porteur erre en continu (voir plus bas)
          if (sp.cut) { sp.cut = false; sp.tx = p.x + rnd(-3, 3); sp.ty = p.y + rnd(-3, 3); sp.speed = 1.1; }
          else if (Math.random() < 0.33) { sp.cut = true; sp.tx = lerp(p.x, rim.x, rnd(0.45, 0.75)); sp.ty = lerp(p.y, rim.y, rnd(0.3, 0.6)) + rnd(-3, 3); sp.speed = 1.5; }
          else { sp.tx = p.x + rnd(-5, 5); sp.ty = p.y + rnd(-5, 5); sp.speed = 0.9; }
          sp.ty = Math.max(1.5, Math.min(48.5, sp.ty)); sp.tx = Math.max(1.5, Math.min(92.5, sp.tx));
        } else {
          const mark = onCourt(1 - sp.team).find(o => o.slot === sp.slot);
          if (mark) { moveTo(sp, lerp(mark.tx, rim.x, 0.25) + rnd(-1.5, 1.5), lerp(mark.ty, rim.y, 0.25) + rnd(-1.5, 1.5), 1.2); }
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
        if (!h.busy && nowP > sceneUntil) {
          const d = Math.hypot(h.tx - h.x, h.ty - h.y);
          if (!crossed && age > 5.5 && !inFront(h.team, h.tx)) { moveTo(h, h.team === 0 ? 52 : 42, Math.max(8, Math.min(42, h.y)), 1.8); }
          else if (d < 0.6) { const p = slotPos(h.team, h.slot, true); moveTo(h, frontX(h.team, Math.max(2, Math.min(92, lerp(h.x, p.x, 0.3) + rnd(-4, 4)))), Math.max(3, Math.min(47, lerp(h.y, p.y, 0.3) + rnd(-3, 3))), rnd(0.55, 0.8)); }
          else if (crossed && !inFront(h.team, h.tx)) { h.tx = frontX(h.team, h.tx); }
        }
      }
    }
    steerRefs(nowP);
    for (const r of refs) {
      const d = Math.hypot(r.tx - r.x, r.ty - r.y);
      if (d > 0.05) { const k = Math.min(1, 14 * r.speed * dt / d); r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; r.moving = true; } else r.moving = false;
      const bob = r.moving ? Math.sin(nowP / 95) * 1 : 0;
      r.g.setAttribute("transform", `translate(${(r.x * PX).toFixed(1)} ${(r.y * PX + bob).toFixed(1)})`);
    }
    for (const [id, sp] of sprites) {
      if (sp.leaving && nowP > sp.leaveAt) { sp.g.remove(); sprites.delete(id); continue; }
      const d = Math.hypot(sp.tx - sp.x, sp.ty - sp.y);
      if (d > 0.05) {
        const v = 14 * sp.speed * dt;
        const k = Math.min(1, v / d);
        sp.x += (sp.tx - sp.x) * k; sp.y += (sp.ty - sp.y) * k;
        sp.moving = true;
      } else sp.moving = false;
      const bob = sp.moving ? Math.sin(nowP / 90) * 1.2 : 0;
      let lift = 0, scale = 1;
      if (sp.jump) { sp.jump.t += dt / 0.55; if (sp.jump.t >= 1) sp.jump = null; else { const k = Math.sin(sp.jump.t * Math.PI); lift = -k * 14 * sp.jump.h; scale = 1 + k * 0.12 * sp.jump.h; } }
      sp.g.setAttribute("transform", `translate(${(sp.x * PX).toFixed(1)} ${(sp.y * PX + bob + lift).toFixed(1)})${scale !== 1 ? ` scale(${scale.toFixed(3)})` : ""}`);
      const has = ball.holder === id;
      sp.g.classList.toggle("has-ball", has);
      sp.carrier.setAttribute("opacity", has ? "1" : "0");
    }
    if (ball.flight) {
      const f = ball.flight; f.t = Math.min(1, f.t + (dt * 1000) / f.ms);
      if (f.target) { const tg = sprites.get(f.target); if (tg) f.to = { x: tg.x + (tg.team === 0 ? 1.6 : -1.6), y: tg.y + 0.6 }; }
      const k = ease(f.t);
      ball.x = lerp(f.from.x, f.to.x, k); ball.y = lerp(f.from.y, f.to.y, k);
      ball.z = Math.sin(f.t * Math.PI) * f.h;
      if (f.t >= 1) { ball.flight = null; ball.z = 0; if (f.done) f.done(); }
    } else if (ball.holder) {
      const h = sprites.get(ball.holder);
      // Dribble continu tant qu'il a le ballon (un peu plus bas et plus vite à l'arrêt).
      if (h) { ball.x = h.x + (h.team === 0 ? 1.6 : -1.6); ball.y = h.y + 0.6; ball.z = Math.abs(Math.sin(nowP / (h.moving ? 110 : 95))) * (h.moving ? 1.2 : 0.9); }
    }
    // Garde-fou : jamais de porteur dans l'équipe qui n'a pas le ballon selon
    // le moteur (ex. scène encore en retard sur le fil) — le ballon est
    // libéré, la resynchronisation le rend à la bonne équipe.
    enforcePossession();
    ballG.setAttribute("transform", `translate(${(ball.x * PX).toFixed(1)} ${(ball.y * PX).toFixed(1)})`);
    ballBody.setAttribute("transform", `translate(0 ${(-ball.z * 4).toFixed(1)}) scale(${(1 + ball.z / 14).toFixed(2)})`);
    // Chrono des 24 s : descend depuis le début de la possession.
    if (S && S.status === "live") {
      // Source unique : state.shotClock (calculé par le client depuis la
      // timeline du moteur) ; repli sur le chrono chorégraphique sinon.
      const left = typeof S.shotClock === "number" ? S.shotClock : S.shotClock === null ? null : Math.max(0, SHOT_CLOCK - (now() - possStart) / 1000);
      const txt = left === null ? "24" : left < 5 ? left.toFixed(1) : String(Math.ceil(left));
      if (clockTxt.textContent !== txt) clockTxt.textContent = txt;
      clockG.classList.toggle("low", left !== null && left < 5);
    }
    // Ordre de superposition (le plus bas devant) : 4 fois par seconde, et
    // seulement si l'ordre a changé.
    if (nowP - lastSort > 250) {
      lastSort = nowP;
      const ordered = [...sprites.values(), ...refs].sort((a, b) => a.y - b.y);
      const key = ordered.map(sp => sp.id).join("|");
      if (key !== sortKey) { sortKey = key; ordered.forEach(sp => layer.appendChild(sp.g)); layer.appendChild(ballG); layer.appendChild(fxG); }
    }
  }
  raf = requestAnimationFrame(tick);

  // ---------- API ----------
  return {
    update(state, newEvents = []) {
      S = state;
      if (state.teams && state.teams[0] && state.teams[0].color) colors = [state.teams[0].color, state.teams[1].color];
      drawFloor(state.courtStyle || null);
      const lk = (state.courtLogo || "") + "|" + (state.arenaSponsor || "");
      if (lk !== logoKey) { logoKey = lk; logoG.innerHTML = state.courtLogo || ""; adTop.textContent = adBot.textContent = (state.arenaSponsor || "HOOP MANAGER").toUpperCase(); }
      const before = sprites.size;
      syncRefs(state.referees);
      syncRoster();
      enforcePossession(true);
      syncMedals();
      const quiet = performance.now() > sceneUntil && performance.now() > busyUntil && !queue.length && !ball.flight;
      // Ballon volontairement libre après un tir manqué (contre, faute sur le
      // tir) : c'est l'événement suivant du moteur (rebond, lancers) qui
      // désigne qui le récupère — pas de meneur choisi ici.
      const looseByEngine = lastPlayed && lastPlayed.kind === "shot" && !lastPlayed.made;
      if ((sprites.size !== before || ball.holder == null) && !newEvents.length && state.status === "live" && quiet && !looseByEngine) {
        if (state.possession === 0 || state.possession === 1) possession = state.possession;
        if (ball.holder == null) giveBall(handlerOf(possession));
        formation();
      }
      // Reconnexion en cours de match (tout le passé arrive d'un coup) : on
      // ne rejoue que les deux dernières actions, pas six minutes de retard.
      let fresh = newEvents.length > 3 ? newEvents.slice(-2) : newEvents;
      // Première image (arrivée sur la page au coup d'envoi : les premiers
      // événements sont déjà là) : on joue ceux des 6 dernières secondes.
      if (firstUpdate && !fresh.length && state.status === "live") {
        const t = now();
        fresh = state.events.filter(e => e.airAt && e.airAt >= t - 6000).slice(-3).map(e => e.id);
      }
      firstUpdate = false;
      for (const e of state.events) if (fresh.includes(e.id)) queue.push(e);
      drain();
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
    debug() {
      const h = ball.holder ? sprites.get(ball.holder) : null;
      return { holder: ball.holder, holderTeam: h ? h.team : null, inFlight: !!ball.flight, flightTarget: ball.flight ? ball.flight.target : null, flight: ball.flight ? { t: ball.flight.t, ms: ball.flight.ms, to: ball.flight.to } : null,
        scenePossession: possession, owner: ownerTeam(), refusals: audit.refusals, corrections: audit.corrections, releases: audit.releases };
    },
    // Crochets de test (live_court2d_test.js) : position du porteur, âge de
    // la possession, cible courante — aucun usage dans le jeu.
    test: {
      setHolderPosition(x, y) { const h = sprites.get(ball.holder); if (h) { h.x = h.tx = x; h.y = h.ty = y; h.busy = false; crossed = false; } },
      resetPossessionClock(offsetMs) { possStart = now() + offsetMs; sceneUntil = 0; },
      holderTarget() { const h = sprites.get(ball.holder); return h ? { x: h.tx, y: h.ty } : null; },
    },
    destroy() { cancelAnimationFrame(raf); timers.forEach(clearTimeout); host.innerHTML = ""; host.classList.remove("c2d"); },
  };
}
