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
// Banc (pause, mi-temps, temps mort) : le long de la ligne de touche du bas,
// chaque équipe de son côté (la bande des médaillons occupe le haut).
function parkLine(team, i) { return { x: team === 0 ? 16 + i * 5.5 : 78 - i * 5.5, y: 46 }; }

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
  const light = el("radialGradient", { id: uid + "-lt", cx: "50%", cy: "50%", r: "62%" }, defs);
  el("stop", { offset: "0", "stop-color": "#fff3dc", "stop-opacity": ".18" }, light);
  el("stop", { offset: "1", "stop-color": "#000", "stop-opacity": ".25" }, light);
  el("rect", { width: VW, height: VH, fill: "#0b1220", rx: "14" }, svg);
  el("rect", { width: VW, height: VH, fill: `url(#${uid}-cw)`, rx: "14" }, svg);
  el("rect", { width: VW, height: VH, fill: `url(#${uid}-vg)`, rx: "14" }, svg);
  const floor = el("g", { transform: `translate(${PAD} ${PAD + HEAD})` }, svg);
  const floorBase = el("g", {}, floor);          // parquet + zones (redessiné selon le club)
  el("rect", { width: "940", height: "500", rx: "8", fill: `url(#${uid}-lt)`, class: "c2d-light" }, floor);
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
  const missG = el("g", { class: "c2d-misses" }, floor);   // croix des tirs manqués du quart-temps

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
  el("circle", { r: "7", fill: "#e8892e", stroke: "#4a2308", "stroke-width": "1.2" }, ballBody);
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
  let possStart = now();           // début de la possession courante (chrono des 24 s)
  let medalsKey = null, missKey = null, lastDrift = 0;

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
      el("rect", { x: "-19", y: "-30", width: "38", height: "41", rx: "9" }, cp);
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
      el("rect", { x: "-19", y: "-30", width: "38", height: "41", rx: "9", fill: "none", stroke: colors[t], "stroke-width": "2.5", class: "c2d-frame" }, g);
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

  function giveBall(sp) { ball.holder = sp ? sp.id : null; ball.flight = null; }
  function fly(to, ms, height, done) {
    ball.holder = null;
    ball.flight = { from: { x: ball.x, y: ball.y }, to, t: 0, ms, h: height, done };
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
  function rimFx(team, made) {
    const r = RIM[team];
    const c = el("circle", { cx: r.x * PX, cy: r.y * PX, r: "10", fill: "none", stroke: made ? "#5fd6ae" : "#FF7A7F", "stroke-width": "3", class: "c2d-wave" }, fxG);
    later(900, () => c.remove());
  }
  function startPossession(t) { possession = t; possStart = now(); }

  // Remise en jeu après panier : le pivot derrière la ligne de fond, le
  // meneur vient chercher le ballon, puis tout le monde remonte.
  function inbound(nt, rim) {
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
    later(800, () => { const src = (inb && inb !== pg) ? inb : pg; fly({ x: src.x, y: src.y }, 300, 1, () => giveBall(src)); });
    later(1650, () => { if (inb && inb !== pg && ball.holder === inb.id) fly({ x: pg.x, y: pg.y }, 380, 2, () => giveBall(pg)); });
    later(2200, () => { pg.busy = false; if (inb) inb.busy = false; if (!ball.holder) giveBall(pg); formation(); });
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
    if (!(total > 1200)) { plan = { airAt: na.airAt, fired: true }; return; }
    const kind = na.kind;
    if (!PLANNED_KINDS.has(kind)) { plan = { airAt: na.airAt, fired: true }; return; }
    const a = na.actors || {};
    const offT = kind === "rebound" ? (na.offensive ? na.team : 1 - na.team)
      : kind === "foul" || kind === "unsportsmanlikeFoul" || kind === "technicalFoul" ? (na.possessionTeam != null ? na.possessionTeam : 1 - na.team)
      : na.team;
    if (offT !== 0 && offT !== 1) { plan = { airAt: na.airAt, fired: true }; return; }
    if (possession !== offT) startPossession(offT);
    plan = { airAt: na.airAt, kind, offT, fired: false, steps: [] };
    const at = (frac, fn) => later(total * frac, () => { if (plan && plan.airAt === na.airAt) fn(); });
    const shooter = spriteOf(a.shooter), assister = spriteOf(a.assister);
    // Porteur : celui que le moteur a désigné (na.passes[0] / na.actors.handler),
    // sinon celui qui a déjà le ballon, sinon le meneur.
    const real = spriteOf(na.passes && na.passes[0]) || spriteOf(a.handler);
    const current = ball.holder && spriteOf(ball.holder);
    const handler = (real && real.team === offT ? real : null) || (current && current.team === offT ? current : null) || handlerOf(offT);
    if (!handler) return;
    if (ball.holder !== handler.id) {
      // Le ballon vient d'une remise en jeu / d'un rebond chez un coéquipier : courte passe au porteur réel.
      if (current && current.team === offT && current !== handler && !ball.flight) fly({ x: handler.x, y: handler.y }, 320, 2.5, () => giveBall(handler));
      else if (!ball.flight) giveBall(handler);
    }
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
        later(700, () => { if (plan && plan.airAt === na.airAt) giveBall(sh); });
      });
      at(0.97, () => { fly({ x: RIM[offT].x, y: RIM[offT].y }, Math.max(350, total * 0.03), 6); plan.fired = true; firedAt = na.airAt; });
      return;
    }
    if (kind === "turnover" || kind === "foul" || kind === "unsportsmanlikeFoul" || kind === "technicalFoul") {
      // Le porteur (celui qui perd la balle / qui subit la faute) reçoit le
      // ballon après une passe, l'événement conclut.
      const victim = spriteOf(a.player) || handler;
      at(0.45, () => { const teammates = onCourt(offT).filter(s => s !== handler); const to = teammates[Math.floor(Math.random() * teammates.length)]; if (to && to !== victim) { fly({ x: to.x, y: to.y }, 350, 2, () => giveBall(to)); } });
      at(0.75, () => { if (victim && ball.holder !== victim.id) fly({ x: victim.x, y: victim.y }, 350, 2, () => giveBall(victim)); });
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
    const tShot = total - flightMs;
    const atMs = (ms, fn) => later(ms, () => { if (plan && plan.airAt === na.airAt) fn(); });
    // Les passes se répartissent entre 35 % et 80 % du temps ; aucune passe
    // inventée : une chaîne d'un seul joueur = isolation / drive.
    const nPass = Math.max(0, chain.length - 1);
    const tLastPass = Math.min(total * 0.8, tShot - 350);
    const tFirstPass = Math.max(150, Math.min(total * 0.35, tLastPass - 600 * Math.max(1, nPass - 1)));
    for (let i = 0; i < nPass; i++) {
      const from = chain[i], to = chain[i + 1];
      const t = nPass === 1 ? tLastPass : tFirstPass + (tLastPass - tFirstPass) * (i / (nPass - 1));
      const lob = type === "post" && i === nPass - 1;   // entrée de balle au poste : lobée
      atMs(t, () => { if (ball.holder === from.id) fly({ x: to.x, y: to.y }, lob ? 520 : 320 + Math.hypot(to.x - from.x, to.y - from.y) * 6, lob ? 7 : 2.5, () => giveBall(to)); else if (ball.holder !== to.id && !ball.flight) giveBall(to); });
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
      if (!plan || plan.airAt !== na.airAt) return;
      // Le tir part : le ballon touche le cercle à airAt. Saut du tireur.
      const sh = shooter || spriteOf(ball.holder);
      if (sh) { ball.x = sh.x; ball.y = sh.y; jump(sh, drive ? 0.9 : 1.15); }
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
    const prePlayed = firedAt === e.airAt || !!(plan && plan.airAt === e.airAt && plan.fired);
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
            fly({ x: to.x, y: to.y }, 380, 3, () => { for (const sp of sprites.values()) sp.busy = false; startPossession(t); giveBall(to); formation(); });
          });
        });
        break;
      }
      case "shot": case "rebound": {
        const isReb = e.kind === "rebound";
        const offT = isReb ? (e.offensive ? t : 1 - t) : t;
        possession = offT;
        const spot = e.shot ? { x: e.shot.x, y: e.shot.y } : slotPos(offT, shooter ? shooter.slot : 0, true);
        const rim = RIM[offT];
        const finish = () => {
          rimFx(offT, !!e.made);
          if (e.made) {
            flash(shooter, e.zone === "three" ? "+3" : "+2", "good");
            later(350, () => { jump(shooter, 0.6); cheer(offT); });
            ball.x = rim.x + (rim.x > 47 ? -1.5 : 1.5); ball.y = rim.y + 1; ball.holder = null; ball.flight = null;
            // Panier + faute (« and one ») : pas de remise en jeu, les lancers suivent.
            later(900, () => { if (queue.some(q => q.kind === "foul" || q.kind === "freeThrow")) return; inbound(1 - offT, rim); });
          } else {
            if (a.blocker) { const bl = spriteOf(a.blocker); flash(bl, "CONTRE", "good"); jump(bl, 1.2); }
            addMiss(spot, offT);
            // Rebond : le ballon rebondit sur le cercle (ou part du contre)
            // puis retombe ; le vrai rebondeur y va, les autres proches
            // s'approchent (lutte), et il saute pour le capter.
            const dir = rim.x > 47 ? -1 : 1;
            const drop = { x: rim.x + dir * rnd(3, 9), y: rim.y + rnd(-7, 7) };
            const hop = a.blocker ? { x: spot.x + dir * 3, y: spot.y + rnd(-3, 3) } : { x: rim.x + dir * rnd(0.5, 2), y: rim.y + rnd(-1.5, 1.5) };
            scene(1700);
            const rb = spriteOf(a.rebounder);
            const near = [...sprites.values()].filter(sp => sp !== rb && !sp.leaving && Math.hypot(sp.x - rim.x, sp.y - rim.y) < 14).slice(0, 3);
            fly(hop, 200, 2.5, () => {
              near.forEach(sp => { busy(sp, 900); moveTo(sp, lerp(sp.x, drop.x, 0.5) + rnd(-1.5, 1.5), lerp(sp.y, drop.y, 0.5) + rnd(-1.5, 1.5), 1.6); });
              if (rb) { busy(rb, 1000); moveTo(rb, drop.x + rnd(-0.8, 0.8), drop.y + rnd(-0.8, 0.8), 2.4); }
              fly(drop, 420, 3.5, () => {
                if (rb) jump(rb, 1);
                later(450, () => { if (isReb) startPossession(t); giveBall(rb || handlerOf(possession)); if (rb) flash(rb, "REB"); formation(); });
              });
            });
          }
        };
        if (prePlayed) { ball.flight = null; ball.x = rim.x; ball.y = rim.y; finish(); break; }
        // Pas de plan (première action, reconnexion) : version courte.
        const handler = spriteOf(ball.holder) || handlerOf(offT);
        let delay = 0;
        if (shooter) { busy(shooter, 1800); moveTo(shooter, spot.x, spot.y, 2); }
        if (assister && assister !== handler && assister !== shooter) { later(delay, () => fly({ x: assister.x, y: assister.y }, 350, 2, () => giveBall(assister))); delay += 420; }
        if (shooter && (handler !== shooter || assister)) { later(delay, () => { const src = assister || handler; if (src && src !== shooter) fly({ x: shooter.x, y: shooter.y }, 380, 2, () => giveBall(shooter)); else giveBall(shooter); }); delay += 450; }
        later(delay + 250, () => fly({ x: rim.x, y: rim.y }, e.zone === "three" ? 700 : 520, e.zone === "paint" ? 4 : 8, finish));
        break;
      }
      case "freeThrow": {
        possession = t;
        const rim = RIM[t], dir = rim.x > 47 ? -1 : 1;
        const made = (e.made || 0) > 0;
        const finish = () => {
          rimFx(t, made); if (made) flash(shooter, "+" + e.made, "good");
          scene(1500);
          later(500, () => {
            for (const sp of sprites.values()) sp.busy = false;
            if (made) { inbound(1 - t, rim); return; }
            const rb = onCourt(1 - t).sort((a, b) => b.slot - a.slot)[0];
            const drop = { x: rim.x - dir * rnd(2, 5), y: rim.y + rnd(-5, 5) };
            fly(drop, 380, 3, () => {
              if (rb) { busy(rb, 700); moveTo(rb, drop.x, drop.y, 2.2); }
              later(600, () => { startPossession(1 - t); giveBall(rb || handlerOf(1 - t)); formation(); });
            });
          });
        };
        if (prePlayed) { ball.flight = null; ball.x = rim.x; ball.y = rim.y; finish(); break; }
        const line = { x: rim.x + dir * 13.75, y: 25 };
        if (shooter) { busy(shooter, 2600); moveTo(shooter, line.x, line.y, 1.6); }
        const others = [...onCourt(t).filter(s => s !== shooter), ...onCourt(1 - t)];
        others.forEach((sp, i) => { busy(sp, 2600); moveTo(sp, rim.x + dir * (3 + (i >> 1) * 5.5), i % 2 ? 16.5 : 33.5, 1.6); });
        later(900, () => giveBall(shooter));
        later(1400, () => fly({ x: rim.x, y: rim.y }, 600, 6, finish));
        break;
      }
      case "turnover": {
        const st = spriteOf(a.stealer), pl = spriteOf(a.player) || spriteOf(ball.holder);
        if (st && pl) { busy(st, 900); moveTo(st, pl.x + 1, pl.y + 1, 2.4); later(500, () => { giveBall(st); flash(st, "INT", "good"); }); }
        else if (pl) { flash(pl, "PERTE", "bad"); if (ball.holder !== pl.id && !ball.flight) giveBall(pl); later(80, () => fly({ x: pl.x + rnd(-3, 3), y: pl.y < 25 ? -2 : 52 }, 500, 2)); }
        later(900, () => { startPossession(1 - t); if (!st) giveBall(handlerOf(1 - t)); formation(); });
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
        missG.innerHTML = ""; missKey = null;
        sceneUntil = 0;
        if (e.quarter === 1) {
          // Entrée des joueurs : du banc vers le rond central, l'entre-deux suit.
          scene(2500);
          ball.holder = null; ball.flight = null; ball.x = 47; ball.y = 25;
          for (const sp of sprites.values()) { const dir = sp.team === 0 ? -1 : 1; moveTo(sp, 47 + dir * (8 + sp.slot * 2), 25 + (sp.slot - 2) * 5, 1.3); busy(sp, 2400); }
          break;
        }
        // Reprise : remise en jeu de l'équipe en possession depuis sa ligne de fond.
        const pt = S.possession != null ? S.possession : possession;
        inbound(pt, RIM[1 - pt]);
        break;
      }
      case "quarterEnd": {
        // Tout le monde au banc jusqu'au début du quart suivant.
        scene(60 * 60 * 1000);
        for (const sp of sprites.values()) { const p = parkLine(sp.team, sp.slot); moveTo(sp, p.x, p.y, 1); busy(sp, 4000); }
        ball.holder = null; ball.flight = null;
        break;
      }
      case "timeout": {
        // Au banc pendant toute la pause (durée réelle du temps mort si le
        // fil la donne, 60 s côté serveur) ; la reprise vient de la
        // possession suivante (buildPlan attend la fin de scène).
        const hold = e.durationMs || 4200;
        scene(hold);
        for (const sp of sprites.values()) { const p = parkLine(sp.team, sp.slot); moveTo(sp, p.x, p.y, 1); busy(sp, hold - 600); }
        ball.holder = null; ball.flight = null;
        later(hold - 500, () => { for (const sp of sprites.values()) sp.busy = false; giveBall(handlerOf(possession)); formation(); });
        break;
      }
      default: break;
    }
    if (e.text) say(e.text);
  }

  // Croix des tirs manqués du quart-temps (comme la référence).
  function addMiss(spot, team) {
    const x = spot.x * PX, y = spot.y * PX;
    const d = `M${x - 5} ${y - 5}l10 10M${x + 5} ${y - 5}l-10 10`;
    const g = el("g", { class: "c2d-miss", opacity: ".9" }, missG);
    el("path", { d, stroke: "rgba(0,0,0,.55)", "stroke-width": "4.5", "stroke-linecap": "round" }, g);   // liseré : lisible sur tout parquet
    el("path", { d, stroke: colors[team], "stroke-width": "2.5", "stroke-linecap": "round" }, g);
  }
  function syncMisses() {
    // À la (re)connexion : toutes les croix du quart-temps en cours.
    const q = S.quarter;
    const list = (S.shots || []).filter(s => !s.made && s.quarter === q);
    const key = q + ":" + list.length;
    if (key === missKey) return;
    missKey = key;
    missG.innerHTML = "";
    list.forEach(s => addMiss(s, s.team));
  }

  // Médaillons des cinq en jeu : avatar, points / rebonds / passes.
  function syncMedals() {
    const key = [0, 1].map(t => S.teams[t].players.filter(p => p.onCourt).map(p => p.id + ":" + p.pts + ":" + p.reb + ":" + p.ast).join("|")).join("#");
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
            el("rect", { x: "4", y: "3", width: "30", height: "38", rx: "6" }, cp);
            av.setAttribute("width", "30"); av.setAttribute("height", "38"); av.setAttribute("x", "4"); av.setAttribute("y", "3");
            const wrap = el("g", { "clip-path": `url(#${cid})` }, m); wrap.appendChild(av);
          }
        }
        el("text", { x: "40", y: "17", class: "c2d-medal-name" }, m).textContent = lastName(p.name).toUpperCase().slice(0, 9);
        const line = el("text", { x: "40", y: "36", class: "c2d-medal-stats" }, m);
        line.innerHTML = `<tspan class="c2d-ms-v">${p.pts | 0}</tspan><tspan class="c2d-ms-l"> pts </tspan><tspan class="c2d-ms-v">${p.reb | 0}</tspan><tspan class="c2d-ms-l"> rb </tspan><tspan class="c2d-ms-v">${p.ast | 0}</tspan><tspan class="c2d-ms-l"> pd</tspan>`;
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
          if (ball.holder === sp.id) { sp.tx = sp.x + rnd(-3, 3); sp.ty = Math.max(2, Math.min(48, sp.y + rnd(-2.5, 2.5))); sp.speed = 0.7; continue; }
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
      const k = ease(f.t);
      ball.x = lerp(f.from.x, f.to.x, k); ball.y = lerp(f.from.y, f.to.y, k);
      ball.z = Math.sin(f.t * Math.PI) * f.h;
      if (f.t >= 1) { ball.flight = null; ball.z = 0; if (f.done) f.done(); }
    } else if (ball.holder) {
      const h = sprites.get(ball.holder);
      if (h) { ball.x = h.x + (h.team === 0 ? 1.6 : -1.6); ball.y = h.y + 0.6; ball.z = h.moving ? Math.abs(Math.sin(nowP / 110)) * 1.2 : 0; }
    }
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
      const ordered = [...sprites.values()].sort((a, b) => a.y - b.y);
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
      syncRoster();
      syncMedals();
      syncMisses();
      const quiet = performance.now() > sceneUntil && performance.now() > busyUntil && !queue.length && !ball.flight;
      if ((sprites.size !== before || ball.holder == null) && !newEvents.length && state.status === "live" && quiet) {
        if (state.possession != null) possession = state.possession;
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
    destroy() { cancelAnimationFrame(raf); timers.forEach(clearTimeout); host.innerHTML = ""; host.classList.remove("c2d"); },
  };
}
