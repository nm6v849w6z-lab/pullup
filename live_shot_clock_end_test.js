// Chrono des 24 s en fin de quart-temps (mission live 2026-10-10 : « s'il
// reste 17 s au quart-temps et qu'une nouvelle possession commence, afficher
// 24 au chrono des possessions est incohérent et trompeur »).
// Règle FIBA (assets/game-rules.js:shotClockOn, la même que le moteur) :
// moins de temps de jeu que de temps de possession → chrono des 24 s ÉTEINT.
// Vérifié sur de VRAIS matchs du moteur, échantillonnés toutes les 250 ms de
// diffusion, dans les trois affichages : adaptateur (spectateur, sélections,
// rediffusion), miroir de son club (moteurbasket3.html:updateLiveClockTick)
// et terrain 2D (court2d : écran vide, jamais un « 24 » par défaut).
// Le chrono du quart-temps reste la référence : il ne fait que descendre et
// atteint 00:00 à la fin de chaque quart.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { JSDOM } = require("jsdom");
const E = require("./engine.js");
const LM = require("./server/liveMatch.js");
const R = require("./assets/game-rules.js");
const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);

(async () => {
  const { createLiveAdapter } = await import(pathToFileURL(path.join(__dirname, "assets/live/adapter.js")).href);
  ok(`Règle partagée : shotClockOn(17, 24) = ${R.shotClockOn(17, 24)}, shotClockOn(30, 24) = ${R.shotClockOn(30, 24)}, shotClockOn(17, 14) = ${R.shotClockOn(17, 14)}.`);
  if (R.shotClockOn(17, 24) || !R.shotClockOn(30, 24) || !R.shotClockOn(17, 14)) fail("règle FIBA du chrono des 24 s");

  const html = require("./test_game_html.js").readGameHtml();
  const grab = name => { const m = new RegExp(`function ${name}\\([^]*?\\n}\\n`).exec(html); if (!m) fail(`fonction ${name} introuvable`); return m[0]; };
  const clockSec = c => { const m = /^(\d+):(\d+)$/.exec(c); return m ? +m[1] * 60 + +m[2] : 0; };

  let lateStarts = 0, offSamples = 0, onSamples = 0, quarterEnds = 0, matches = 0;
  for (let n = 0; n < 6; n++) {
    const K = 1_900_000_000_000;
    const home = E.generateTeam("Lyon", 1 + (n % 3)), away = E.generateTeam("Rennes", 1 + ((n + 1) % 3));
    const res = new E.MatchEngine(home, away, { homeAdvantage: true }).simulate();
    const sched = LM.schedulePlayback(res.events, K);
    const td = t => ({ name: t.name, short: "T", color: "#fff", players: t.players.map(p => ({ id: p.id, name: p.name, pos: p.position })) });
    const live = { isHome: true, kickoffAt: K, events: sched.events, pauses: sched.pauses, totalDurationMs: sched.totalDurationMs, boxScoreA: res.boxScoreA, boxScoreB: res.boxScoreB, seed: 1 };
    const ad = createLiveAdapter({ live, teams: { A: td(home), B: td(away) }, mine: "A" });
    // Miroir de son club.
    const els = { shotClockDisplay: { off: true, classList: { add(c) { if (c === "off") els.shotClockDisplay.off = true; }, remove(c) { if (c === "off") els.shotClockDisplay.off = false; }, toggle() {} }, textContent: "" }, clockDisplay: { textContent: "10:00" } };
    let fakeNow = K;
    const liveState = { clock: 600, shotClock: null, possession: null, reset() {} };
    const src = `${grab("clockSecondsFromStr")}${grab("secondsToClockStr")}${grab("livePossessionAt")}${grab("liveDeadBallHoldMs")}${grab("liveShotClockBase")}${grab("updateLiveClockTick")}
      return { updateLiveClockTick, setTick: (e, p) => { liveTickEvents = e; liveTickPauses = p; } };`;
    const api = new Function("document", "Date", "liveState", "syncTopbarLiveStrip", "hmLiveOnTick", "setPossessionDot", "window", `let liveTickEvents = [], liveTickPauses = []; ${src}`)(
      { getElementById: id => els[id] }, { now: () => fakeNow }, liveState, () => {}, () => {}, () => {}, { HM_RULES: R });
    api.setTick(sched.events.map(ev => ({ airAt: ev.airAt, quarter: ev.quarter, clockSec: clockSec(ev.clock), possession: ev.possession || null, possessionAfter: ev.possessionAfter || null, type: ev.type, team: ev.team,
      made: ev.made, tovType: ev.tovType, deadBall: ev.deadBall, inbound: !!ev.inbound, lastTouch: ev.lastTouch || null, lastMade: ev.lastMade, of: ev.of, attempt: ev.attempt, possStart: ev.possStart, foulType: ev.foulType || null, offensive: !!ev.offensive })), sched.pauses.map(p => ({ airAt: p.airAt, endAt: p.airAt + p.durationMs })));
    // Possessions commencées à moins de 24 s de la fin d'un quart (moteur).
    lateStarts += sched.events.filter(e => typeof e.possStart === "number" && e.possStart < 24 && e.possStart > 0).length;
    let i = 0, prevQ = 0, prevClock = 601;
    for (let now = K; now <= K + sched.totalDurationMs; now += 250) {
      while (i < live.events.length && live.events[i].airAt <= now) ad.applyEvent(live.events[i++]);
      ad.tick(now);
      const S = ad.buildState(now);
      fakeNow = now; api.updateLiveClockTick();
      if (S.status !== "live") { prevClock = 601; continue; }
      if (S.quarter !== prevQ) { if (prevQ && prevClock !== 0 && prevClock !== 601) fail(`fin du Q${prevQ} : le chrono doit atteindre 00:00 (dernier ${prevClock})`); if (prevQ) quarterEnds++; prevQ = S.quarter; prevClock = 601; }
      // Chrono du quart-temps : ne remonte jamais (référence officielle).
      if (S.clock > prevClock) fail(`Q${S.quarter} : le chrono du quart-temps remonte (${prevClock} → ${S.clock}) à t+${now - K} ms`);
      prevClock = S.clock;
      if (typeof S.shotClock === "number") {
        onSamples++;
        // Affiché : jamais plus que le temps de jeu restant.
        if (S.shotClock > S.clock + 1e-9) fail(`Q${S.quarter} ${S.clock} s restantes : chrono des 24 s affiché à ${S.shotClock.toFixed(1)} (doit être éteint)`);
      } else if (S.clock > 0 && S.clock < 24) offSamples++;
      // Miroir de son club : même décision, même valeur.
      if ((liveState.shotClock === null) !== (S.shotClock === null)) fail(`miroir de son club ≠ adaptateur à t+${now - K} ms Q${S.quarter} ${S.clock}/${liveState.clock} (${liveState.shotClock} / ${S.shotClock})`);
      if (liveState.shotClock !== null && els.shotClockDisplay.off) fail("bandeau de son club : chrono des 24 s masqué alors qu'il tourne");
      if (liveState.shotClock === null && S.clock < 24 && S.clock > 0 && !els.shotClockDisplay.off) fail("bandeau de son club : chrono des 24 s affiché en fin de quart-temps");
      if (liveState.shotClock !== null && Number(els.shotClockDisplay.textContent) > Math.max(liveState.clock, 0) + 0) { if (Number(els.shotClockDisplay.textContent) > liveState.clock) fail(`bandeau : ${els.shotClockDisplay.textContent} au 24 s pour ${liveState.clock} s au quart-temps`); }
    }
    matches++;
  }
  if (!(lateStarts > 0 && offSamples > 0)) fail(`scénario « moins de 24 s » non couvert (possessions tardives ${lateStarts}, échantillons ${offSamples})`);
  ok(`${matches} vrais matchs, ${onSamples + offSamples} échantillons : ${lateStarts} possessions commencées à moins de 24 s de la fin d'un quart — chrono des 24 s ÉTEINT (${offSamples} échantillons), jamais plus que le temps restant ; adaptateur et bandeau de son club identiques.`);
  // Contrôle : sans le champ `offensive` dans la liste de son club (bug
  // corrigé le 2026-10-10), le chrono des 24 s y repartait à 24 après un
  // rebond offensif au lieu de 14.
  if (!/offensive: !!ev\.offensive/.test(html)) fail("liste des événements du direct de son club : champ `offensive` absent (24 s à 24 au lieu de 14 après rebond offensif)");
  ok(`Chrono du quart-temps : ne remonte jamais, atteint 00:00 à chaque fin de quart (${quarterEnds} fins vérifiées).`);

  // ---------- Terrain 2D : écran vide quand le chrono est éteint ----------
  const dom = new JSDOM(`<!doctype html><div id="host"></div>`, { pretendToBeVisual: true, runScripts: "outside-only" });
  const { window } = dom;
  const strip = s => s.replace(/^import .*$/mg, "").replace(/^export\s+(function|const|let|class)/mg, "$1").replace(/^export\s*\{[^}]*\};?/mg, "");
  window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/format.js"), "utf8")));
  window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8")));
  const host = window.document.getElementById("host");
  const court = window.createCourt2D(host, { colors: ["#e8892e", "#3B8FE0"], raster: false });
  const P = k => [0, 1, 2, 3, 4].map(i => ({ id: k + ":" + i, name: k + i, pos: "M", onCourt: true, starter: true, number: i }));
  const base = { status: "live", quarter: 1, possession: 0, shots: [], events: [{ id: 1, kind: "tipoff", type: "period", quarter: 1, clock: 600, team: 0 }], teams: [{ name: "A", players: P("A"), score: 0 }, { name: "B", players: P("B"), score: 0 }] };
  const val = () => host.querySelector(".c2d-clock-val").textContent;
  const g = () => host.querySelector(".c2d-clock");
  court.update({ ...base, clock: 400, shotClock: 18.2 }, [1]);
  await new Promise(r => setTimeout(r, 300));
  if (val() !== "19") fail(`terrain : chrono des 24 s attendu « 19 », obtenu « ${val()} »`);
  court.update({ ...base, clock: 17, shotClock: null }, []);
  await new Promise(r => setTimeout(r, 300));
  if (val() !== "" || !g().classList.contains("off")) fail(`terrain, 17 s au quart-temps (chrono éteint) : écran vide attendu, obtenu « ${val()} »`);
  ok("Terrain 2D : 17 s au quart-temps → écran du chrono des 24 s vide et grisé (plus de « 24 » par défaut) ; valeur réelle sinon.");
  court.destroy && court.destroy();
  console.log("\n🏁 live_shot_clock_end_test.js : chrono des 24 s éteint en fin de quart-temps, chrono du quart-temps intact.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
