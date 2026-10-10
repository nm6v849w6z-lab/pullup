// Direct 2D : temps du match (demande du 2026-10-08).
//  1. Le chrono ne démarre PAS au chargement du direct ni au marqueur
//     « Début du quart-temps » : seulement à l'entre-deux du moteur
//     (événement `tipoff`), dans l'adaptateur spectateur (adapter.js:tick)
//     ET dans celui de son club (moteurbasket3.html:updateLiveClockTick).
//  2. Avant l'entre-deux, le terrain n'a pas de porteur, personne ne se
//     promène, le chrono des 24 s est figé — même après une longue attente
//     ou une avance du temps.
//  3. Saut dans le temps (rediffusion : curseur, ±30 s ; rafale
//     d'événements ; temps de match qui recule) : recalage sur l'état du
//     moteur, rien n'est rejoué en accéléré, rien n'est joué deux fois.
//  4. Changement d'onglet avant / après l'entre-deux : compatible.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { JSDOM } = require("jsdom");
const E = require("./engine.js");
const LM = require("./server/liveMatch.js");

function fail(msg) { throw new Error("❌ " + msg); }
const ok = msg => console.log("✅ " + msg);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { createLiveAdapter } = await import(pathToFileURL(path.join(__dirname, "assets/live/adapter.js")).href);
  // Match réel du moteur, diffusé à partir de K.
  const K = 1_900_000_000_000;
  const home = E.generateTeam("Lyon Basket", 1), away = E.generateTeam("Rennes Club", 1);
  home.name = "Lyon Basket"; away.name = "Rennes Club";
  const res = new E.MatchEngine(home, away, { homeAdvantage: true }).simulate();
  const sched = LM.schedulePlayback(res.events, K);
  const qs = sched.events[0], tip = sched.events.find(e => e.type === "tipoff");
  if (!qs || qs.type !== "quarterStart" || !tip || tip.airAt <= qs.airAt) fail("le moteur doit diffuser « Début du quart-temps » puis l'entre-deux (tipoff).");
  ok(`Moteur : « Début du 1er quart-temps » à K, entre-deux (tipoff, ${tip.clock}) à K + ${tip.airAt - K} ms — c'est l'entre-deux qui lance le chrono.`);

  // ---------- 1. Adaptateur spectateur ----------
  const td = (t, col) => ({ name: t.name, short: t.name.slice(0, 3).toUpperCase(), color: col, players: t.players.map((p, i) => ({ id: p.id, name: p.name, pos: p.position, number: 4 + i, avatar: "" })) });
  const teams = { A: td(home, "#e8892e"), B: td(away, "#3B8FE0") };
  const mkLive = () => JSON.parse(JSON.stringify({ isHome: true, kickoffAt: K, events: sched.events, pauses: sched.pauses, totalDurationMs: sched.totalDurationMs, boxScoreA: res.boxScoreA, boxScoreB: res.boxScoreB, seed: 1 }));
  const at = (ad, live, now, from = { i: 0 }) => {
    const items = live.events;
    while (from.i < items.length && items[from.i].airAt <= now) ad.applyEvent(items[from.i++]);
    ad.tick(now); return ad.buildState(now);
  };
  {
    // Avant-match : chargé 5 s, puis 30 s avant le coup d'envoi.
    const pre = mkLive(); pre.pregame = true; pre.events = []; pre.pauses = [];
    const ad0 = createLiveAdapter({ live: pre, teams, mine: "A" });
    for (const now of [K - 35000, K - 30000, K - 5000]) { ad0.tick(now); const s = ad0.buildState(now); if (s.status !== "pregame" || s.clock !== 600 || s.shotClock !== null) fail(`avant-match : chrono arrêté à 10:00 attendu (${s.status}, ${s.clock}, ${s.shotClock}).`); }
    // Direct ouvert, coup d'envoi passé mais entre-deux pas encore diffusé
    // (+ avance du temps jusqu'à juste avant l'entre-deux).
    const live = mkLive(), ad = createLiveAdapter({ live, teams, mine: "A" }), cur = { i: 0 };
    for (const now of [K, K + 500, K + 1500, tip.airAt - 1]) {
      const s = at(ad, live, now, cur);
      if (s.clock !== 600 || s.shotClock !== null) fail(`entre-deux pas encore diffusé (t = K + ${now - K} ms) : chrono arrêté à 10:00 attendu, obtenu ${s.clock} / ${s.shotClock}.`);
    }
    // Entre-deux : le chrono démarre à cet instant précis.
    let s = at(ad, live, tip.airAt, cur);
    if (s.clock !== 600 || typeof s.shotClock !== "number" || s.shotClock !== 24) fail(`à l'entre-deux : chrono à 10:00 et 24 s qui démarre, obtenu ${s.clock} / ${s.shotClock}.`);
    s = at(ad, live, tip.airAt + 3000, cur);
    if (!(s.clock <= 598 && s.clock >= 595) || !(s.shotClock < 22)) fail(`3 s après l'entre-deux : chrono ≈ 9:57, obtenu ${s.clock} (24 s : ${s.shotClock}).`);
    ok(`Adaptateur : chrono figé à 10:00 avant le coup d'envoi, au coup d'envoi et jusqu'à l'entre-deux ; démarre à l'entre-deux (${s.clock} s restantes 3 s après).`);
    // Quart suivant : même règle au marqueur de début du Q2.
    const q2 = sched.events.find(e => e.type === "quarterStart" && e.quarter === 2);
    const q2next = sched.events.find(e => e.quarter === 2 && e.type !== "quarterStart");
    const ad2 = createLiveAdapter({ live: mkLive(), teams, mine: "A" }); const c2 = { i: 0 }; const live2 = mkLive();
    let s2 = at(ad2, live2, q2.airAt + 10, c2);
    if (s2.quarter !== 2 || s2.clock !== 600 || s2.shotClock !== null) fail(`début du Q2 (marqueur seul) : chrono arrêté à 10:00, obtenu Q${s2.quarter} ${s2.clock} / ${s2.shotClock}.`);
    s2 = at(ad2, live2, q2next.airAt + 1500, c2);
    if (!(typeof s2.shotClock === "number" || s2.clock < 600)) fail("Q2 : le chrono repart à la première action.");
    ok("Changement de quart-temps : chrono arrêté sur le marqueur, reprise à la première action du quart.");
  }

  // ---------- 1 bis. Miroir de son club (moteurbasket3.html) ----------
  {
    const html = require("./test_game_html.js").readGameHtml();
    const grab = name => { const m = new RegExp(`function ${name}\\([^]*?\\n}\\n`).exec(html); if (!m) fail(`fonction ${name} introuvable`); return m[0]; };
    const ctx = {};
    const src = `${grab("clockSecondsFromStr")}${grab("secondsToClockStr")}${grab("livePossessionAt")}${grab("liveDeadBallHoldMs")}${grab("liveShotClockBase")}${grab("updateLiveClockTick")}
      return { updateLiveClockTick, setTick: (e, p) => { liveTickEvents = e; liveTickPauses = p; } };`;
    const els = { shotClockDisplay: { classList: { add() {}, remove() {}, toggle() {} }, textContent: "" }, clockDisplay: { textContent: "10:00" } };
    let fakeNow = K;
    const liveState = { clock: 600, shotClock: null, possession: null, reset() {} };
    // (règles partagées : window.HM_RULES, assets/game-rules.js)
    const f = new Function("document", "Date", "liveState", "syncTopbarLiveStrip", "hmLiveOnTick", "setPossessionDot", "window", `let liveTickEvents = [], liveTickPauses = []; ${src}`);
    const api = f({ getElementById: id => els[id] }, { now: () => fakeNow }, liveState, () => {}, () => {}, () => {}, { HM_RULES: require("./assets/game-rules.js") });
    const clockSec = c => { const m = /^(\d+):(\d+)$/.exec(c); return m ? +m[1] * 60 + +m[2] : 0; };
    api.setTick(sched.events.map(ev => ({ airAt: ev.airAt, quarter: ev.quarter, clockSec: clockSec(ev.clock), possession: ev.possession || null, possessionAfter: ev.possessionAfter || null, type: ev.type, team: ev.team })),
      sched.pauses.map(p => ({ airAt: p.airAt, endAt: p.airAt + p.durationMs })));
    for (const t of [K + 100, K + 1500, tip.airAt - 1]) { fakeNow = t; api.updateLiveClockTick(); if (liveState.clock !== 600 || liveState.shotClock !== null || els.clockDisplay.textContent !== "10:00") fail(`son club, avant l'entre-deux (K + ${t - K} ms) : 10:00 figé attendu, obtenu ${els.clockDisplay.textContent} / ${liveState.shotClock}.`); }
    fakeNow = tip.airAt + 3000; api.updateLiveClockTick();
    if (!(liveState.clock <= 598 && liveState.clock >= 595)) fail(`son club, 3 s après l'entre-deux : ≈ 9:57 attendu, obtenu ${els.clockDisplay.textContent}.`);
    ok(`Direct de son club : même règle (10:00 figé jusqu'à l'entre-deux, ${els.clockDisplay.textContent} 3 s après).`);
  }

  // ---------- 2-4. Terrain (court2d) ----------
  const dom = new JSDOM(`<!doctype html><div id="host"></div>`, { pretendToBeVisual: true, runScripts: "outside-only" });
  const { window } = dom;
  const strip = src => src.replace(/^import .*$/mg, "").replace(/^export\s+(function|const|let|class)/mg, "$1").replace(/^export\s*\{[^}]*\};?/mg, "");
  window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/format.js"), "utf8")));
  window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8")));
  let vis = "visible";
  Object.defineProperty(window.document, "visibilityState", { configurable: true, get: () => vis });
  Object.defineProperty(window.document, "hidden", { configurable: true, get: () => vis === "hidden" });
  const setVis = v => { vis = v; window.document.dispatchEvent(new window.Event("visibilitychange")); };
  let rafCalls = 0; const rafOrig = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = fn => { rafCalls++; return rafOrig(fn); };

  // Horloge du direct contrôlée : `shift` simule l'avance / le recul du temps.
  let shift = 0;
  const clock = () => Date.now() + shift;
  const live = mkLive();
  const base = Date.now() + 1000 - K;            // coup d'envoi dans 1 s (temps réel)
  live.kickoffAt += base; live.events.forEach(e => { e.airAt += base; }); live.pauses.forEach(p => { p.airAt += base; });
  // Entre-deux retardé de 40 s dans ce scénario (il suit d'ordinaire le
  // marqueur de 2,2 s) : longue attente avant le vrai début du match.
  live.events.forEach(e => { if (e.type !== "quarterStart" || e.quarter !== 1) e.airAt += 40000; }); live.pauses.forEach(p => { p.airAt += 40000; });
  
  const T = { kick: live.kickoffAt, tip: live.events.find(e => e.type === "tipoff").airAt };
  let ad = createLiveAdapter({ live, teams, mine: "A" }), cur = { i: 0 }, seen = new Set();
  const host = window.document.getElementById("host");
  const court = window.createCourt2D(host, { colors: ["#e8892e", "#3B8FE0"], raster: false, now: clock });
  // Même chaîne que le jeu : adaptateur → état → terrain, ids nouveaux.
  const push = () => { const now = clock(); const s = at(ad, live, now, cur); const fresh = s.events.filter(e => !seen.has(e.id)).map(e => e.id); seen = new Set(s.events.map(e => e.id)); court.update(s, fresh); return s; };
  // Rediffusion : curseur (même calcul que shiftReplayTimeline), adaptateur
  // remis à zéro puis rejoué jusqu'à maintenant — vue (terrain) conservée.
  const seek = targetMs => { const delta = (clock() - targetMs) - live.kickoffAt; live.kickoffAt += delta; live.events.forEach(e => { e.airAt += delta; }); live.pauses.forEach(p => { p.airAt += delta; }); ad.reset(); cur = { i: 0 }; };
  const pos = () => [...host.querySelectorAll(".c2d-svg .c2d-p")].map(g => { const m = /translate\(([^ ]+) ([^)]+)\)/.exec(g.getAttribute("transform") || ""); return m ? [+m[1], +m[2]] : [NaN, NaN]; });
  const sane = label => {
    const p = pos();
    if (p.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) fail(`${label} : coordonnée invalide (NaN / Infinity).`);
    if (p.some(([x, y]) => x < -150 || x > 1100 || y < -150 || y > 700)) fail(`${label} : un joueur est parti hors de la salle.`);
    const d = court.debug();
    if (d.queued > 3) fail(`${label} : actions empilées (${d.queued} en file).`);
    if (d.pendingTimers > 40) fail(`${label} : minuteries accumulées (${d.pendingTimers}).`);
  };
  const ptsCount = () => host.querySelectorAll(".c2d-ptsf").length;
  const run = async (ms, step = 200) => { for (let t = 0; t < ms; t += step) { push(); await sleep(step); } };

  // 2. Avant-match → coup d'envoi → avant l'entre-deux.
  live.pregame = true;
  let s = push();
  if (s.status !== "pregame") fail("avant le coup d'envoi : statut avant-match.");
  await sleep(600);
  delete live.pregame;
  await sleep(500);                               // coup d'envoi passé : « Début du quart-temps » diffusé
  await run(1000);
  let d = court.debug();
  if (d.gameOn || d.holder) fail(`coup d'envoi passé, entre-deux pas encore diffusé : pas de porteur, jeu pas commencé (gameOn ${d.gameOn}, porteur ${d.holder}).`);
  const clockTxt = () => host.querySelector(".c2d-clock-val") ? host.querySelector(".c2d-clock-val").textContent : null;
  if (clockTxt() !== null && clockTxt() !== "24") fail(`avant l'entre-deux : 24 s figé, obtenu ${clockTxt()}.`);
  // Attente 5 s puis avance du temps de 30 s, toujours AVANT l'entre-deux.
  await run(5000);
  d = court.debug();
  if (d.gameOn || d.holder || push().clock !== 600) fail("5 s après le coup d'envoi, entre-deux pas encore diffusé : jeu et chrono arrêtés.");
  shift += 30000;
  await run(300);
  d = court.debug();
  if (d.gameOn || d.holder || push().clock !== 600) fail("avance du temps avant l'entre-deux : le chrono et le jeu restent arrêtés.");
  // Onglet masqué puis rendu avant l'entre-deux.
  setVis("hidden"); await sleep(200); setVis("visible"); await sleep(150);
  shift += Math.max(0, T.tip - clock() - 300);   // juste avant l'entre-deux
  d = court.debug();
  if (d.gameOn || d.holder) fail(`retour d'onglet avant l'entre-deux : toujours pas de porteur (${JSON.stringify({ gameOn: d.gameOn, holder: d.holder, now: clock() - T.tip })}).`);
  ok("Avant l'entre-deux (chargement, attente 5 s, avance de 30 s, onglet) : chrono et 24 s figés, aucun porteur, jeu pas commencé.");

  // 3. Entre-deux réel : le jeu démarre.
  await run(4800);
  d = court.debug(); s = push();
  if (!d.gameOn) fail("après l'entre-deux du moteur, le jeu doit être lancé.");
  if (!(s.clock < 600)) fail(`après l'entre-deux, le chrono tourne (obtenu ${s.clock}).`);
  if (s.possession !== null && d.holder && d.holderTeam !== s.possession) fail("première possession : le ballon est à l'équipe du moteur.");
  sane("après l'entre-deux");
  ok(`Entre-deux : jeu lancé, chrono en marche (${Math.floor(s.clock / 60)}:${String(s.clock % 60).padStart(2, "0")}), première possession à l'équipe du moteur.`);

  // Progression normale : aucun saut détecté.
  const j0 = court.debug().jumps;
  await run(6000);
  if (court.debug().jumps !== j0) fail(`progression normale : aucun saut ne doit être détecté (obtenu ${court.debug().jumps - j0}).`);
  sane("progression normale");
  ok("Progression normale (6 s, actions successives) : aucun recalage parasite.");

  // 4. Avances rapides : légère (rafale), importante, successives, recul.
  const checkJump = async (label, fn) => {
    const before = court.debug(), pts0 = ptsCount();
    fn();
    push();
    await sleep(60);
    const after = court.debug();
    if (after.jumps <= before.jumps) fail(`${label} : le saut doit être détecté.`);
    if (after.inFlight) fail(`${label} : aucune animation (vol de ballon) ne doit continuer après le recalage.`);
    if (ptsCount() > pts0) fail(`${label} : aucun panier rejoué (« +2 / +3 ») après le saut.`);
    sane(label);
    await run(1400);
    const s2 = push(), d2 = court.debug();
    if (s2.status === "live" && !s2.stoppage && s2.possession !== null && d2.holder && d2.holderTeam !== s2.possession) fail(`${label} : après recalage, ballon à l'équipe du moteur.`);
    sane(label + " (reprise)");
  };
  await checkJump("avance légère (+30 s, rafale d'actions)", () => { shift += 30000; });
  await checkJump("avance importante (+4 min)", () => { shift += 240000; });
  for (let i = 0; i < 3; i++) await checkJump(`avances successives (${i + 1}/3)`, () => { shift += 20000 + i * 7000; });
  await checkJump("curseur de rediffusion vers l'avant (+90 s)", () => seek(clock() - live.kickoffAt + 90000));
  await checkJump("curseur de rediffusion vers l'arrière (−2 min)", () => seek(clock() - live.kickoffAt - 120000));
  // Pendant une passe / un tir / un déplacement : on attend une animation en cours.
  for (let k = 0; k < 40 && !court.debug().inFlight; k++) { push(); await sleep(100); }
  await checkJump("avance pendant une animation (passe / tir en vol)", () => { shift += 45000; });
  ok("Avances rapides (légère, importante, successives, curseur avant / arrière, pendant une animation) : saut détecté, recalage sur le moteur, rien de rejoué, aucune animation empilée.");

  // 5. Onglet après l'entre-deux : court et long.
  setVis("hidden"); shift += 5000; await sleep(300); push(); setVis("visible"); await sleep(150); sane("retour d'onglet (5 s)");
  setVis("hidden"); shift += 600000; await sleep(300); push(); setVis("visible"); await sleep(150); sane("retour d'onglet (10 min)");
  for (let i = 0; i < 8; i++) { setVis("hidden"); await sleep(30); setVis("visible"); await sleep(40); }
  await run(1500); sane("allers-retours d'onglet");
  rafCalls = 0; await sleep(1000);
  if (rafCalls > 70) fail(`une seule boucle de rendu attendue (${rafCalls} rappels/s).`);
  ok(`Onglet après l'entre-deux (5 s, 10 min, allers-retours) : recalage propre, une seule boucle (${rafCalls} rappels/s), ${court.debug().pendingTimers} minuteries.`);

  court.destroy();
  console.log("Temps du match du direct 2D : tout est vert.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
