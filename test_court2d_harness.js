// Banc d'essai du terrain 2D (assets/live/court2d.js) sur horloge
// virtuelle : images de 40 ms, minuteries et requestAnimationFrame rejoués
// à la main — déterministe, image par image. Utilisé par
// live_court2d_dead_ball_test.js et live_court2d_turnovers_test.js.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);
const strip = src => src.replace(/^import .*$/mg, "").replace(/^export\s+(function|const|let|class)/mg, "$1").replace(/^export\s*\{[^}]*\};?/mg, "");
const POS = ["M", "AS", "A", "AF", "P"];
const mkTeam = (key, n) => ({ name: key, short: key.slice(0, 3).toUpperCase(), score: 0, color: key === "Gotham" ? "#F26B1D" : "#3B8FE0",
  players: Array.from({ length: n }, (_, i) => ({ id: key + ":" + i, name: key + " Joueur" + i, pos: POS[i % 5], onCourt: i < 5, pts: 0, reb: 0, ast: 0, number: 4 + i, fatigue: 10, pf: 0 })) });

function harness() {
  const dom = new JSDOM(`<!doctype html><div id="host"></div>`, { pretendToBeVisual: false, runScripts: "outside-only" });
  const win = dom.window;
  const T0 = 1_900_000_000_000;
  let vt = T0, seq = 0;
  const timers = new Map();
  win.setTimeout = (fn, ms) => { const id = ++seq; timers.set(id, { at: vt + Math.max(0, ms || 0), fn }); return id; };
  win.clearTimeout = id => { timers.delete(id); };
  let rafs = [];
  win.requestAnimationFrame = fn => { rafs.push(fn); return rafs.length; };
  win.cancelAnimationFrame = () => {};
  Object.defineProperty(win.performance, "now", { value: () => vt - T0 + 100000, configurable: true });
  win.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/format.js"), "utf8")));
  win.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8")));
  const court = win.createCourt2D(win.document.getElementById("host"), { raster: false, now: () => vt });
  const S = { status: "live", quarter: 2, clock: 400, possession: 0, teams: [mkTeam("Gotham", 10), mkTeam("Rennes", 10)], shots: [],
    referees: [0, 1, 2].map(i => ({ id: "ref" + i })), events: [] };
  let id = 0;
  // Fil déjà commencé (entre-deux diffusé il y a 2 min) : le jeu est lancé.
  S.events.push({ id: ++id, kind: "tipoff", type: "period", team: 0, quarter: 1, clock: 600, airAt: vt - 120000, text: "" });
  const tele = [];
  let prev = null, maxStep = 0;
  const frame = () => {
    vt += 40;
    for (;;) {
      let next = null;
      for (const [k, t] of timers) if (t.at <= vt && (!next || t.at < next[1].at)) next = [k, t];
      if (!next) break;
      timers.delete(next[0]); next[1].fn();
    }
    const fns = rafs; rafs = []; fns.forEach(fn => fn(vt - T0 + 100000));
    const lay = court.test.layout().sprites;
    for (const k in lay) {
      if (k.startsWith("ref")) continue;
      const p = lay[k], q = prev && prev[k];
      if (q) { const d = Math.hypot(p.sx - q.sx, p.sy - q.sy); if (d > maxStep) maxStep = d; if (d > 3) tele.push({ id: k, d: +d.toFixed(1), at: vt }); }
    }
    prev = lay;
  };
  const api = {
    S, court, win, get vt() { return vt; },
    run(ms, each) { const end = vt + ms; while (vt < end) { frame(); if (each) each(); } },
    // Un événement diffusé maintenant (ou `dt` ms plus tard / plus tôt).
    ev(e, dt = 0) { const x = { id: ++id, quarter: S.quarter, clock: S.clock, airAt: vt + dt, text: e.text || "", actors: {}, ...e }; S.events.push(x); return x; },
    push(...evs) { if (evs.length) S.possession = evs[evs.length - 1].possessionAfter ?? S.possession; court.update(S, evs.map(e => e.id)); },
    tick() { court.update(S, []); },
    tele, get maxStep() { return maxStep; }, resetTele() { tele.length = 0; maxStep = 0; prev = null; },
    d: () => court.debug(),
    sp: pid => court.test.layout().sprites[pid],
    ball: () => court.test.ball(),
  };
  court.update(S, []);
  api.run(1500, () => { if ((vt / 40) % 5 === 0) api.tick(); });
  return api;
}
const teamOf = pid => (pid && pid.startsWith("Gotham") ? 0 : pid && pid.startsWith("Rennes") ? 1 : null);
// Joue `ms` d'images en relevant l'état du terrain (rendu périodique comme la vue : 200 ms).
function watch(h, ms) {
  const log = [];
  let n = 0;
  h.run(ms, () => {
    if (++n % 5 === 0) h.tick();
    const d = h.d(), b = h.ball();
    const hs = d.holder ? h.sp(d.holder) : null;
    log.push({ t: h.vt, phase: d.phase, holder: d.holder, team: d.holderTeam, bx: b.x, by: b.y, hx: hs ? hs.sx : null, hy: hs ? hs.sy : null, inbounder: d.inbounder, inb: d.inbounds, side: d.sideInbounds, flight: d.inFlight });
  });
  return log;
}


module.exports = { harness, watch, teamOf, mkTeam, fail, ok };
