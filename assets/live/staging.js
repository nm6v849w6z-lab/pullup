// Mise en scène du direct 2D (2026-10-08) : coach devant chaque banc, entrée
// des joueurs, regroupement au temps mort, banc en fin de quart-temps et
// shows des arrêts de jeu (pompom girls, mascotte, canon à t-shirts).
//
// Couche PUREMENT VISUELLE posée par court2d.js : elle ne touche ni au
// moteur ni à l'état du match. Tout est calculé à partir de l'heure réelle
// et des arrêts de jeu du serveur (state.stoppage = { kind, team, quarter,
// startAt, endsAt }, state.kickoffAt) : arriver en retard, revenir sur
// l'onglet ou sauter dans un replay place directement chacun à sa place, et
// un show ne dure jamais plus longtemps que l'arrêt (il s'arrête à endsAt).
// La simulation n'attend jamais la mise en scène.
//
// Sous-drapeaux (cfg) : coach, playerIntro, shows — voir
// server/featureFlags.js et hmLiveStagingCfg (moteurbasket3.html).

import { pompomGirl, mascot as mascotSvg, defaultMascot, launcher, tshirt, trampoline, smoke } from "./characters.js?v=20261008-19";
import { createShowFx, showColors, SHOW_CYCLE, DESIGN } from "./showfx.js?v=20261008-19";

// Moment → show. Les autres arrêts (mi-temps, fin Q2, prolongations) n'ont
// pas de show pour l'instant : ajouter une ligne ici suffit.
export const SHOW_FOR = {
  "timeout": "pompom",
  "quarter-break:1": "mascot",
  "quarter-break:3": "tshirt",
};
export function showFor(stoppage, quarter) {
  if (!stoppage) return null;
  if (stoppage.kind === "timeout") return SHOW_FOR.timeout || null;
  if (stoppage.kind === "quarter-break") return SHOW_FOR["quarter-break:" + (stoppage.quarter || quarter)] || null;
  return SHOW_FOR[stoppage.kind] || null;
}

// Mascotte de fin de Q1 (2026-10-09) : dunk au trampoline (A) et tour
// d'honneur avec check des fans (B) en alternance, un match sur deux —
// parité de la journée (cfg.round), à défaut du jour du coup d'envoi.
// Même variante pour tous les spectateurs d'un même match.
export function mascotVariant(cfg, state) {
  const r = cfg && cfg.round != null && Number.isFinite(+cfg.round) ? Math.floor(+cfg.round) : null;
  const k = r != null ? r : (state && state.kickoffAt ? Math.floor(state.kickoffAt / 86400000) : 0);
  return Math.abs(k) % 2 === 0 ? "A" : "B";
}

export const INTRO_MS = 30000;      // entrée des joueurs (avant-match et reprise)
const EDGE_MS = 1100;               // entrée / sortie des animateurs
const COACH_Y = 55;                 // debout devant son banc (arène 2026-10-08 : bancs hors du terrain)
const TUNNEL = { x: 47, y: 53 };

// Petit générateur pseudo-aléatoire stable (graine = début de l'arrêt) :
// même show pour tous les spectateurs d'un même arrêt.
function rng(seed) {
  let a = (seed | 0) || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = k => Math.max(0, Math.min(1, k));
const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

// Formations des pompom girls (pieds), centrées sur le rond central, loin des
// groupes réunis devant les bancs (y ≥ 41).
const FORMATIONS = {
  line: (i, n) => ({ x: 47 + (i - (n - 1) / 2) * 4.4, y: 25 }),
  v: (i, n) => ({ x: 47 + (i - (n - 1) / 2) * 4.2, y: 16 + Math.abs(i - (n - 1) / 2) * 3.4 }),
  circle: (i, n) => ({ x: 47 + Math.cos((i / n) * Math.PI * 2 - Math.PI / 2) * 8.5, y: 25 + Math.sin((i / n) * Math.PI * 2 - Math.PI / 2) * 7 }),
  twoLines: (i, n) => ({ x: 47 + (Math.floor(i / 2) - (Math.ceil(n / 2) - 1) / 2) * 5.4, y: 19 + (i % 2) * 11 }),
};
export const CHOREOS = [
  ["line", "v", "circle", "twoLines"],
  ["v", "circle", "line", "twoLines"],
  ["circle", "twoLines", "v", "line"],
  ["twoLines", "line", "circle", "v"],
];

export function createStaging(api, getCfg) {
  const { el, PX } = api;
  let cfg = null, S = null;
  let destroyed = false;
  const coaches = [null, null];
  let phaseKey = "", phaseStartedAt = 0;
  let lastChoreo = -1;
  let show = null;                        // { key, name, g, render(now), destroy() }
  const shownFor = new Set();             // arrêts dont le show a démarré (pub : une par arrêt)
  const held = new Set();
  let introCard = null;

  // ---------- coach ----------
  function makeCoach(t) {
    const svgHtml = cfg.coaches && cfg.coaches[t];
    const g = el("g", { class: "stg-coach t" + t, "data-coach": String(t) }, api.coachLayer);
    const inner = el("g", { class: "stg-coach-in" }, g);
    el("ellipse", { cx: "0", cy: "10", rx: "15", ry: "5", fill: `url(#${api.uid}-ts)` }, inner);
    if (svgHtml) {
      const tpl = document.createElement("template"); tpl.innerHTML = svgHtml;
      const av = tpl.content.querySelector("svg");
      if (av) {
        const cid = api.uid + "-coach" + t;
        const cp = el("clipPath", { id: cid }, api.defs);
        el("rect", { x: "-15", y: "-26", width: "30", height: "33", rx: "5.4" }, cp);
        av.setAttribute("width", "30"); av.setAttribute("height", "33"); av.setAttribute("x", "-15"); av.setAttribute("y", "-26");
        const wrap = el("g", { "clip-path": `url(#${cid})` }, inner); wrap.appendChild(av);
        if (api.raster) api.raster(svgHtml, 30, 33).then(url => { if (!url || !wrap.isConnected) return; wrap.innerHTML = ""; el("image", { href: url, x: "-15", y: "-26", width: "30", height: "33", preserveAspectRatio: "xMidYMid slice" }, wrap); });
      }
    }
    const col = (api.colors()[t]) || "#555";
    const lab = el("g", { class: "c2d-lab" }, inner);
    el("rect", { x: "-17", y: "11", width: "34", height: "11", rx: "3.5", fill: col, class: "c2d-plate" }, lab);
    el("text", { y: "19.5", "text-anchor": "middle", "data-no-i18n": "1" }, lab).textContent = "COACH";
    const bx = api.BENCH[t].x;
    return { t, g, inner, x: bx, y: COACH_Y, tx: bx, ty: COACH_Y, nextWalk: 0, anim: "", animUntil: 0, visible: true };
  }
  function coachAnim(c, name, ms) { if (!c) return; c.anim = name; c.animUntil = ms ? api.nowP() + ms : Infinity; }
  function setCoachClass(c, cls) {
    if (c.cls === cls) return;
    c.cls = cls; c.inner.setAttribute("class", "stg-coach-in" + (cls ? " is-" + cls : ""));
  }

  // ---------- jetons tenus par la mise en scène ----------
  function hold(sp, x, y, speed, snap) { api.hold(sp, x, y, speed, snap); held.add(sp); }
  function releaseAll(reform) {
    if (!held.size) return;
    for (const sp of held) api.release(sp);
    held.clear();
    if (reform) api.formation();
  }
  const byTeam = t => [...api.sprites()].filter(sp => sp.team === t && !sp.leaving).sort((a, b) => a.slot - b.slot);

  // ---------- phases ----------
  function phaseAt(now) {
    if (!cfg || !S) return { kind: "off" };
    if (S.status === "pregame") {
      const left = S.kickoffAt ? S.kickoffAt - now : Infinity;
      if (cfg.playerIntro && left <= INTRO_MS && left > 0) return { kind: "intro", t: INTRO_MS - left, key: "intro" };
      return { kind: "pregame", key: "pregame" };
    }
    if (S.status === "final") return { kind: "final", key: "final" };
    const st = S.stoppage;
    if (st && now < st.endsAt && now >= st.startAt) {
      if (st.kind === "halftime") {
        const left = st.endsAt - now;
        if (cfg.playerIntro && left <= INTRO_MS) return { kind: "return", t: INTRO_MS - left, st, key: "return:" + st.startAt };
        return { kind: "halftime", st, key: "half:" + st.startAt };
      }
      return { kind: st.kind, st, t: now - st.startAt, left: st.endsAt - now, key: st.kind + ":" + st.startAt };
    }
    return { kind: "live", key: "live" };
  }

  // Entrée des joueurs (30 s, finit exactement au coup d'envoi) : sortie du
  // tunnel en file, présentation des cinq (extérieur puis domicile), coachs
  // devant les bancs, mise en place pour l'entre-deux.
  function introTargets(sp, t, i) {
    const team = sp.team, dir = team === 0 ? -1 : 1;
    const line = { x: 47 + dir * (6 + i * 5.5), y: 25 };
    if (t < 4800) {
      const start = 300 + (team === 1 ? 0 : 2200) + i * 380;
      if (t < start) return { x: TUNNEL.x, y: TUNNEL.y, speed: 2, snap: true, hidden: true };
      return { ...line, speed: 1.5 };
    }
    if (t < 21000) {
      // Présentation : extérieur (équipe 1) de 5 s à 13 s, domicile de 13 s à 21 s.
      const base = team === 1 ? 5000 : 13000;
      const on = t >= base + i * 1600 && t < base + (i + 1) * 1600;
      return on ? { x: line.x, y: line.y - 4, speed: 1.4, present: true } : { ...line, speed: 1.2 };
    }
    if (t < 24000) return { ...line, speed: 1.2 };
    // Entre-deux : les pivots au centre, les autres autour du rond.
    if (i === 4) return { x: 47 + dir * 1.4, y: 25, speed: 1.4 };
    const ys = [14.5, 21, 29, 35.5];
    return { x: 47 + dir * 8, y: ys[i], speed: 1.4 };
  }
  function showIntroCard(sp) {
    if (introCard && introCard.id === sp.id) return;
    hideIntroCard();
    const g = el("g", { class: "stg-intro" }, api.frontLayer);
    const x = (sp.x + (sp.ox || 0)) * PX, y = (sp.y + (sp.oy || 0)) * PX;
    el("ellipse", { cx: x, cy: y + 12, rx: "30", ry: "11", fill: api.colors()[sp.team], "fill-opacity": ".35", class: "stg-spot" }, g);
    const lines = [String(sp.name || "").toUpperCase(), [Number.isInteger(sp.number) ? "#" + sp.number : "", sp.pos || ""].filter(Boolean).join(" · ")];
    const w = Math.max(90, lines[0].length * 7.2 + 20);
    const card = el("g", { transform: `translate(${x} ${y - 62})`, class: "stg-card" }, g);
    el("rect", { x: -w / 2, y: "-15", width: w, height: "30", rx: "8", fill: "rgba(10,16,28,.9)", stroke: api.colors()[sp.team], "stroke-width": "2" }, card);
    el("text", { y: "-1", "text-anchor": "middle", class: "stg-card-name", "data-no-i18n": "1" }, card).textContent = lines[0];
    el("text", { y: "10.5", "text-anchor": "middle", class: "stg-card-sub", "data-no-i18n": "1" }, card).textContent = lines[1];
    introCard = { id: sp.id, g };
  }
  function hideIntroCard() { if (introCard) { introCard.g.remove(); introCard = null; } }

  // ---------- shows ----------
  // Shows dessinés (showfx.js, visuels de la maquette « Shows Live 2D ») :
  // un canvas posé sur le terrain, dans le repère de la maquette. Sans
  // canvas 2D, rendu SVG d'origine ci-dessous.
  const FX_OF = { pompom: "pom", mascot: "masc", tshirt: "tee" };
  function makeFxShow(name, st, colors) {
    const fx = FX_OF[name];
    if (!fx || typeof createShowFx !== "function" || typeof api.overlay !== "function") return null;
    const ov = api.overlay();
    if (!ov) return null;
    const ctx = ov.canvas.getContext("2d");
    if (!ctx) { api.dropOverlay(); return null; }
    const variant = fx === "pom" ? "A" : fx === "tee" ? "C" : mascotVariant(cfg, S);
    const mcfg = cfg.mascot || null;
    const fxr = createShowFx(showColors(colors[0], colors[1], cfg.homeShort, mcfg && mcfg.number != null ? mcfg.number : 8));
    const cycle = (SHOW_CYCLE[fx === "pom" ? "pom" : fx + variant] || 14) * 1000;
    const STILL = { pom: 6, mascA: 2.5, mascB: 3, teeC: 3.3 };      // image fixe (mouvement réduit)
    let ci = null;
    if (fx === "pom") { ci = Math.floor(rng(Math.floor(st.startAt / 1000))() * 4); if (ci === lastChoreo) ci = (ci + 1) % 4; lastChoreo = ci; }
    ov.canvas.classList.add("stg-show", "stg-show-" + name);
    ov.canvas.setAttribute("data-variant", variant);
    const LEAD = 400;                                                // ms après le début de l'arrêt
    let frame = null;
    return { name, variant, key: st.startAt, choreo: ci, renderer: "canvas", render(now) {
      const o = api.overlay();
      if (!o) return;
      const cv = o.canvas;
      const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
      const cw = Math.round(o.w * dpr), ch = Math.round(o.h * dpr);
      if (!cw || !ch) return;
      if (cv.width !== cw) cv.width = cw;
      if (cv.height !== ch) cv.height = ch;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cw, ch);
      const el0 = now - st.startAt - LEAD;
      if (el0 < 0) return;
      // Fondu d'entrée et de sortie (le show finit avec l'arrêt, jamais après).
      cv.style.opacity = String(Math.max(0, Math.min(1, el0 / 400, (st.endsAt - now) / 900)).toFixed(3));
      // Écran ← arène (viewBox, « meet ») ← maquette (parquet ↔ terrain 940 × 500).
      const [vx, vy, vw, vh] = o.vb;
      const sc = Math.min(cw / vw, ch / vh), ox = (cw - vw * sc) / 2 - vx * sc, oy = (ch - vh * sc) / 2 - vy * sc;
      const [dx, dy, dw, dh] = DESIGN.court, kx = (940 / dw) * sc, ky = (500 / dh) * sc;
      ctx.setTransform(kx, 0, 0, ky, ox + sc * api.OX - dx * kx, oy + sc * api.OY - dy * ky);
      // Le tableau d'affichage reste au-dessus des personnages.
      ctx.save(); ctx.beginPath(); ctx.rect(-4000, -4000, 10000, 10000); ctx.rect(...DESIGN.board); ctx.clip("evenodd");
      const key = fx === "pom" ? "pom" : fx + variant;
      const t = api.reduced ? STILL[key] : (el0 % cycle) / 1000;
      try { frame = fxr.draw(ctx, { show: fx, variant, t, q: kx, order: ci || 0 }); } catch (e) { frame = null; }
      ctx.restore();
    }, frame: () => frame, destroy() { api.dropOverlay(); } };
  }

  function makeShow(name, st) {
    const seed = Math.floor(st.startAt / 1000);
    const r = rng(seed);
    const colors = cfg.homeColors || [api.colors()[0], "#ffd34d"];
    const fxShow = makeFxShow(name, st, colors);
    if (fxShow) return fxShow;
    const g = el("g", { class: "stg-show stg-show-" + name }, api.frontLayer);
    const t0 = st.startAt + EDGE_MS, t1 = st.endsAt - EDGE_MS;
    const enterK = now => clamp01((now - t0 + EDGE_MS) / EDGE_MS);     // 0 → 1 pendant l'entrée
    const exitK = now => clamp01((now - (t1 - EDGE_MS)) / EDGE_MS);    // 0 → 1 pendant la sortie
    if (name === "pompom") {
      const n = 6 + Math.floor(r() * 3);
      let ci = Math.floor(r() * CHOREOS.length);
      if (ci === lastChoreo) ci = (ci + 1) % CHOREOS.length;           // jamais deux fois de suite
      lastChoreo = ci;
      const seq = CHOREOS[ci];
      const dancers = [];
      for (let i = 0; i < n; i++) {
        const d = el("g", { class: "stg-dancer" + (i % 2 ? " alt" : "") }, g);
        d.innerHTML = pompomGirl({ primary: colors[0], secondary: colors[1], short: cfg.homeShort || "", skin: ["#f0cbae", "#d9a47c", "#a0663f", "#e6b894"][i % 4], hair: ["#5a3a22", "#1b120c", "#b5532e", "#d8b56e"][(i * 3) % 4] });
        dancers.push({ g: d, side: i % 2 ? 100 : -6 });
      }
      const STEP = 6200, MOVE = 1200;
      return { name, key: st.startAt, g, choreo: ci, render(now) {
        const el0 = Math.max(0, now - t0);
        const idx = Math.floor(el0 / STEP), into = el0 - idx * STEP;
        const a = FORMATIONS[seq[idx % seq.length]], b = FORMATIONS[seq[(idx + 1) % seq.length]];
        const k = api.reduced ? 0 : ease(clamp01((into - (STEP - MOVE)) / MOVE));
        const kin = ease(enterK(now)), kout = ease(exitK(now));
        dancers.forEach((d, i) => {
          const p = { x: lerp(a(i, n).x, b(i, n).x, k), y: lerp(a(i, n).y, b(i, n).y, k) };
          const x = lerp(lerp(d.side, p.x, kin), d.side, kout), y = p.y;
          d.g.setAttribute("transform", `translate(${(x * PX).toFixed(1)} ${(y * PX).toFixed(1)})`);
        });
        g.setAttribute("opacity", String(Math.min(kin, 1 - kout * 0.999).toFixed(2)));
      }, destroy() { g.remove(); } };
    }
    if (name === "mascot") {
      const mcfg = cfg.mascot || defaultMascot(cfg.homeShort, colors);
      const tr = el("g", { transform: `translate(${77 * PX} ${25 * PX})` }, g); tr.innerHTML = trampoline();
      const flash = el("circle", { cx: 88.75 * PX, cy: 25 * PX, r: "13", fill: "none", stroke: "#ffd34d", "stroke-width": "4", opacity: "0", class: "stg-rimflash" }, g);
      const m = el("g", { class: "stg-mascot-g" }, g);
      const body = el("g", { class: "stg-mascot-in" }, m); body.innerHTML = mascotSvg(mcfg);
      const LOOP = 12000;
      const celebration = mcfg.celebration || "salto";
      return { name, key: st.startAt, g, mascot: mcfg, render(now) {
        const el0 = Math.max(0, now - t0), n = Math.floor(el0 / LOOP), t = el0 - n * LOOP;
        const miss = rng(seed + n * 7)() < 0.15;                   // petite chance de dunk raté
        let x = 62, y = 40, sc = 1, rot = 0, cls = "run";
        if (api.reduced) { x = 76; y = 30; cls = ""; }
        else if (t < 2500) { const k = ease(t / 2500); x = lerp(62, 72, k); y = lerp(40, 26.5, k); }
        else if (t < 3000) { const k = (t - 2500) / 500; x = lerp(72, 77, k); y = 25; sc = 1 - Math.sin(k * Math.PI) * 0.18; cls = ""; }
        else if (t < 4400) { const k = (t - 3000) / 1400; x = lerp(77, 87.4, ease(k)); y = 25 - Math.sin(k * Math.PI) * 2; sc = 1 + Math.sin(k * Math.PI * 0.85) * 0.8; rot = celebration === "salto" ? k * 360 : 0; cls = ""; }
        else if (t < 5000) { const k = (t - 4400) / 600; x = miss ? lerp(87.4, 83, k) : 87.4; y = 25; sc = miss ? 1.6 - k * 0.4 : 1.65; rot = miss ? -k * 40 : 0; cls = "dunk"; }
        else if (t < 6200) { const k = (t - 5000) / 1200; x = lerp(miss ? 83 : 87.4, 84, k); y = lerp(25, 30, k); sc = lerp(miss ? 1.2 : 1.65, 1, ease(k)); rot = miss ? lerp(-40, 0, k) : 0; cls = ""; }
        else if (t < 9000) { const k = (t - 6200) / 2800; x = 84; y = 30; cls = miss ? "sad" : "celebrate-" + celebration; if (celebration === "salto" && !miss) { rot = clamp01(k * 1.6) * 360; y = 30 - Math.sin(clamp01(k * 1.6) * Math.PI) * 3; } }
        else { const k = ease((t - 9000) / 3000); x = lerp(84, 62, k); y = lerp(30, 40, k); }
        const kin = enterK(now), kout = exitK(now);
        if (kin < 1) { x = lerp(50, x, kin); y = lerp(50, y, kin); }
        if (kout > 0) { x = lerp(x, 100, kout); }
        m.setAttribute("transform", `translate(${(x * PX).toFixed(1)} ${(y * PX).toFixed(1)}) scale(${sc.toFixed(3)}) rotate(${rot.toFixed(1)} 0 -22)`);
        const dunkOn = !api.reduced && t >= 4400 && t < 5200 && !miss;
        flash.setAttribute("opacity", dunkOn ? "1" : "0");
        body.setAttribute("class", "stg-mascot-in" + (cls ? " is-" + cls : ""));
        g.setAttribute("opacity", String(Math.min(1, kin * 2).toFixed(2)));
      }, destroy() { g.remove(); } };
    }
    if (name === "tshirt") {
      // Côté des bancs (comme le coach et la table), aux coins libres :
      // les bancs occupent x ≈ 26–40 et 54–68, la table ≈ 43–51. Canon
      // tourné vers l'extérieur, tirs vers les gradins derrière les bancs.
      const spots = [{ x: 15, y: 49.2, dir: -1 }, { x: 79, y: 49.2, dir: 1 }];
      const ls = spots.map((p, i) => { const l = el("g", { transform: `translate(${p.x * PX} ${p.y * PX}) scale(${p.dir} 1)`, class: "stg-launcher-g" }, g); l.innerHTML = launcher({ primary: colors[0], secondary: colors[1] }); return l; });
      const pool = [];
      for (let i = 0; i < 6; i++) { const s = el("g", { opacity: "0", class: "stg-shirt-g" }, g); s.innerHTML = tshirt({ primary: colors[0], secondary: colors[1] }); pool.push(s); }
      const puffs = spots.map(p => { const s = el("g", { opacity: "0" }, g); s.innerHTML = smoke(); return s; });
      const FIRE = 1800, FLY = 1300;
      return { name, key: st.startAt, g, render(now) {
        const el0 = Math.max(0, now - t0);
        const kin = enterK(now), kout = exitK(now);
        g.setAttribute("opacity", String(Math.min(kin, 1 - kout * 0.999).toFixed(2)));
        if (api.reduced) return;
        pool.forEach((s, i) => {
          // Tir n° (i + 6·k) : lanceur alterné, cible tirée au hasard (stable).
          const shotIdx = Math.floor((el0 - i * FIRE) / (FIRE * 6)) * 6 + i;
          const tShot = shotIdx * FIRE, age = el0 - tShot;
          if (shotIdx < 0 || age < 0 || age > FLY || now > t1 - EDGE_MS) { s.setAttribute("opacity", "0"); return; }
          const rr = rng(seed + shotIdx * 13);
          const from = spots[shotIdx % 2], to = { x: from.x + from.dir * (3 + rr() * 12), y: 53.2 + rr() * 1.4 };
          const k = age / FLY;
          const x = lerp(from.x, to.x, k), y = lerp(from.y - 3.4, to.y, k) - Math.sin(k * Math.PI) * 6;
          s.setAttribute("opacity", k > 0.85 ? String(((1 - k) / 0.15).toFixed(2)) : "1");
          s.setAttribute("transform", `translate(${(x * PX).toFixed(1)} ${(y * PX).toFixed(1)}) rotate(${(k * 540 * (shotIdx % 2 ? -1 : 1)).toFixed(0)}) scale(${(1.1 + Math.sin(k * Math.PI) * 0.6).toFixed(2)})`);
          // Hook « objet à gagner » (plus tard) : t-shirt attrapé en tribune.
          if (k > 0.98 && cfg.onTshirtLanded && !s.landed) { s.landed = true; try { cfg.onTshirtLanded({ shot: shotIdx }); } catch (e) { /* hook vide */ } }
          if (k < 0.5) s.landed = false;
        });
        puffs.forEach((p, i) => {
          const last = Math.floor(el0 / FIRE); const side = last % 2; const age = el0 - last * FIRE;
          const on = side === i && age < 600;
          p.setAttribute("opacity", on ? String((1 - age / 600).toFixed(2)) : "0");
          p.setAttribute("transform", `translate(${(spots[i].x * PX + spots[i].dir * 4).toFixed(1)} ${(spots[i].y * PX - 38).toFixed(1)}) scale(${(1 + age / 300).toFixed(2)})`);
        });
        ls.forEach((l, i) => l.setAttribute("class", "stg-launcher-g" + (Math.floor(el0 / FIRE) % 2 === i && el0 % FIRE < 250 ? " is-fire" : "")));
      }, destroy() { g.remove(); } };
    }
    g.remove();
    return null;
  }
  function endShow() { if (show) { show.destroy(); show = null; } }

  // ---------- musiques des séquences (2026-10-08, shows 2026-10-09) ----------
  // Fichiers fournis (assets/audio/music/*.mp3) : entrée des joueurs pendant
  // la phase « intro », puis une musique par show — pompom girls, mascotte,
  // lanceurs de maillots — tant que le show est à l'écran (page du direct
  // affichée). Bail renouvelé ici : séquence finie, page quittée ou vue
  // détruite, la musique s'efface d'elle-même (assets/audio/music.js), en
  // même temps que le fondu de sortie du show.
  const SHOW_MUSIC = { pompom: "pompom", mascot: "mascotte", tshirt: "lanceur" };
  let musicAt = 0, musicKey = null;
  function music(ph, nowP) {
    const M = typeof window !== "undefined" ? window.HMMusic : null;
    if (!M || nowP - musicAt < 400) return;
    musicAt = nowP;
    const on = !api.shown || api.shown();
    let want = null;
    if (on && ph.kind === "intro") want = "entree";
    else if (on && show && SHOW_MUSIC[show.name] && ph.st && api.now() < ph.st.endsAt - 900) want = SHOW_MUSIC[show.name];
    if (musicKey && musicKey !== want) { M.stop(musicKey); musicKey = null; }
    if (want === "entree") { M.play("entree", { lease: 1500 }); musicKey = want; }
    else if (want) { M.play(want, { lease: 1500 }); musicKey = want; }
  }
  function musicOff() { const M = typeof window !== "undefined" ? window.HMMusic : null; if (M && musicKey) M.stop(musicKey); musicKey = null; }

  // ---------- boucle ----------
  function tick(nowP) {
    if (destroyed) return;
    const now = api.now();
    const ph = phaseAt(now);
    music(ph, nowP);
    const changed = ph.key !== phaseKey;
    if (changed) {
      phaseKey = ph.key; phaseStartedAt = now;
      hideIntroCard();
      // Chaque phase repart de zéro : elle reprend ce qu'elle doit tenir.
      releaseAll(ph.kind === "live");
    }
    // Arrivée en retard (onglet ouvert pendant l'arrêt, saut dans un replay) :
    // chacun est posé directement à sa place, sans traversée du terrain.
    const late = changed && ((ph.t || 0) > 1500);

    // Coachs (sous-drapeau coach).
    if (cfg && cfg.coach && S) {
      for (const t of [0, 1]) if (!coaches[t]) coaches[t] = makeCoach(t);
      for (const c of coaches) {
        const bx = api.BENCH[c.t].x;
        let vis = true;
        if (ph.kind === "intro") {
          if (ph.t < 19000) { c.tx = TUNNEL.x; c.ty = TUNNEL.y; vis = false; if (late || changed) { c.x = c.tx; c.y = c.ty; } }
          else { c.tx = bx; c.ty = COACH_Y; }
        } else if (ph.kind === "timeout" || ph.kind === "quarter-break" || ph.kind === "halftime" || ph.kind === "return") {
          c.tx = bx; c.ty = COACH_Y;
          if (ph.kind === "timeout") coachAnim(c, "instruct", 400);
        } else if (nowP > c.nextWalk) {
          // Va-et-vient discret le long de la ligne de touche.
          c.nextWalk = nowP + 4500 + Math.random() * 3500;
          c.tx = bx + (Math.random() - 0.5) * 6; c.ty = COACH_Y;
        }
        if (late) { c.x = c.tx; c.y = c.ty; }
        const d = Math.hypot(c.tx - c.x, c.ty - c.y);
        const moving = d > 0.05;
        if (moving) { const k = Math.min(1, (ph.kind === "intro" ? 9 : 3) * (1 / 60) / d); c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; }
        const bob = moving && !api.reduced ? Math.sin(nowP / 110) * 0.8 : 0;
        c.g.setAttribute("transform", `translate(${(c.x * PX).toFixed(1)} ${(c.y * PX + bob).toFixed(1)})`);
        c.g.setAttribute("opacity", vis ? "1" : "0");
        if (c.animUntil < nowP) c.anim = "";
        setCoachClass(c, api.reduced ? "" : c.anim || (moving ? "walk" : ""));
      }
    }

    // Joueurs et arbitres.
    if (cfg && S) {
      if (ph.kind === "intro") {
        let presented = null;
        for (const t of [1, 0]) byTeam(t).forEach((sp, i) => {
          const tg = introTargets(sp, ph.t, i);
          hold(sp, tg.x, tg.y, tg.speed, late || !!tg.snap);
          sp.g.setAttribute("opacity", tg.hidden ? "0" : "1");
          if (tg.present) presented = sp;
        });
        if (presented) showIntroCard(presented); else hideIntroCard();
      } else if (ph.kind === "return") {
        // Reprise de la 2e mi-temps : les deux équipes reviennent ensemble.
        for (const t of [0, 1]) byTeam(t).forEach(sp => {
          const p = api.slotPos(sp.team, sp.slot, sp.team === api.possession());
          hold(sp, p.x, p.y, ph.t < 8000 ? 1.1 : 1.4, late);
        });
      } else if (ph.kind === "timeout" || ph.kind === "quarter-break") {
        const releaseAt = ph.left < 900;
        if (releaseAt) releaseAll(true);
        else {
          for (const t of [0, 1]) byTeam(t).forEach((sp, i) => {
            const bx = api.BENCH[t].x;
            if (ph.kind === "timeout") {
              // Regroupement en demi-cercle autour du coach, devant le banc
              // (géométrie partagée avec le terrain et les remplaçants : court2d.js:huddlePos).
              const hp = api.huddlePos ? api.huddlePos(t, i, 5, 0) : { x: bx + Math.cos(Math.PI * (1.12 + i * 0.19)) * 6.6, y: COACH_Y + Math.sin(Math.PI * (1.12 + i * 0.19)) * 5.6 };
              hold(sp, hp.x, hp.y, 1.8, late);
            } else {
              const p = api.parkLine(t, i);
              hold(sp, p.x, p.y, 1.4, late);
            }
          });
          api.refs().forEach((r, i) => hold(r, 47 + (i - 1) * 3, 50.7, 1.4, late));
        }
      }
    }

    // Shows (sous-drapeau shows).
    const name = cfg && cfg.shows && ph.st ? showFor(ph.st, S && S.quarter) : null;
    // Lumière tamisée + projecteurs mobiles pendant l'entrée des joueurs et les shows.
    if (api.ambience) api.ambience(ph.kind === "intro" || (name && (ph.kind === "timeout" || ph.kind === "quarter-break")) ? "show" : "");
    if (name && (ph.kind === "timeout" || ph.kind === "quarter-break")) {
      const t0 = ph.st.startAt + EDGE_MS, t1 = ph.st.endsAt - EDGE_MS;
      if (now >= t0 - EDGE_MS && now < t1) {
        if (!show || show.key !== ph.st.startAt) {
          endShow();
          show = makeShow(name, ph.st);
          if (show && !shownFor.has(ph.st.startAt)) {
            shownFor.add(ph.st.startAt);
            if (cfg.onShow) { try { cfg.onShow({ show: name, stoppage: ph.st, remainingMs: ph.st.endsAt - now }); } catch (e) { /* jamais bloquant */ } }
          }
        }
        if (show) show.render(now);
      } else endShow();
    } else endShow();
  }

  return {
    update(state, freshEvents) {
      S = state;
      try { cfg = getCfg ? getCfg(state) : null; } catch (e) { cfg = null; }
      if (!cfg) { musicOff(); releaseAll(false); endShow(); hideIntroCard(); coaches.forEach((c, i) => { if (c) { c.g.remove(); coaches[i] = null; } }); return; }
      // Réactions du coach aux actions (discrètes, sans effet sur le jeu).
      for (const e of freshEvents || []) {
        if (!e) continue;
        if (e.kind === "shot" && e.made && (e.team === 0 || e.team === 1)) {
          coachAnim(coaches[e.team], "clap", 1400);
          if (e.made === 3) coachAnim(coaches[1 - e.team], "gesture", 1400);
        } else if (e.blocked && (e.team === 0 || e.team === 1)) coachAnim(coaches[1 - e.team], "gesture", 1200);
        else if (e.kind === "turnover" && (e.team === 0 || e.team === 1)) coachAnim(coaches[e.team], "gesture", 1200);
      }
    },
    tick,
    debug() {
      return { phase: phaseKey, show: show ? show.name : null, choreo: show && show.choreo != null ? show.choreo : null, held: held.size,
        variant: show && show.variant ? show.variant : null, renderer: show ? show.renderer || "svg" : null, frame: show && show.frame ? show.frame() : null,
        coaches: coaches.map(c => (c ? { x: c.x, y: c.y, anim: c.cls || "" } : null)), shownFor: [...shownFor] };
    },
    destroy() { destroyed = true; musicOff(); releaseAll(false); endShow(); hideIntroCard(); coaches.forEach(c => c && c.g.remove()); },
  };
}
