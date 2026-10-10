// Terrain 2D — limites du terrain (mission live 2026-10-10 : « un joueur fait
// une passe alors qu'il est en touche, le ballon repart comme si de rien
// n'était, aucun coup de sifflet »). Le moteur décide des sorties de balle
// (événements outOfBounds / perte ballon dehors) ; le terrain :
//   - ballon VIVANT : porteur, ballon libre et receveur toujours DANS les
//     lignes (toucher la ligne = dehors) — jamais un ballon joué en touche ;
//     aucune passe partie de derrière une ligne ;
//   - sortie du moteur : coup de sifflet (bruitage), ballon mort, AUCUNE
//     passe de jeu avant la remise en jeu, remise en jeu par l'équipe que
//     le moteur désigne, remiseur derrière la ligne, ballon rendu DANS le
//     terrain.
// Vrais matchs du moteur, diffusés en temps réel (2 × 80 s, en parallèle).
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { JSDOM } = require("jsdom");
const E = require("./engine.js");
const LM = require("./server/liveMatch.js");
const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DUR = Number(process.env.BOUNDS_MS || 80000);
const out = (x, y) => x <= 0 || x >= 94 || y <= 0 || y >= 50;   // toucher la ligne = dehors

async function runMatch(createLiveAdapter, sfxForEvent, seedQ) {
  // Match avec au moins une sortie de balle dans la fenêtre diffusée.
  let home, away, res, sched, startAt;
  for (let n = 0; n < 40; n++) {
    home = E.generateTeam("Lyon", 1); away = E.generateTeam("Rennes", 1);
    res = new E.MatchEngine(home, away, { homeAdvantage: true }).simulate();
    sched = LM.schedulePlayback(res.events, 0);
    const oob = sched.events.find(e => e.quarter === seedQ && (e.type === "outOfBounds" || (e.type === "turnover" && e.deadBall)));
    if (!oob) continue;
    startAt = oob.airAt - 15000;
    if (sched.pauses.some(p => p.airAt > startAt && p.airAt < startAt + DUR)) continue;
    break;
  }
  const delta = Date.now() + 300 - startAt;
  const live = { isHome: true, kickoffAt: delta, events: sched.events.map(e => ({ ...e, airAt: e.airAt + delta })), pauses: sched.pauses.map(p => ({ ...p, airAt: p.airAt + delta })), totalDurationMs: sched.totalDurationMs, boxScoreA: res.boxScoreA, boxScoreB: res.boxScoreB };
  const td = t => ({ name: t.name, short: t.name.slice(0, 3), color: "#fff", players: t.players.map(p => ({ id: p.id, name: p.name, pos: p.position })) });
  const ad = createLiveAdapter({ live, teams: { A: td(home), B: td(away) }, mine: "A" });
  const dom = new JSDOM(`<!doctype html><div id="host"></div>`, { pretendToBeVisual: true, runScripts: "outside-only" });
  const { window } = dom;
  const strip = s => s.replace(/^import .*$/mg, "").replace(/^export\s+(function|const|let|class)/mg, "$1").replace(/^export\s*\{[^}]*\};?/mg, "");
  window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/format.js"), "utf8")));
  window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8")));
  const host = window.document.getElementById("host");
  const court = window.createCourt2D(host, { colors: ["#e8892e", "#3B8FE0"], raster: false });
  const posOf = id => { for (const g of host.querySelectorAll(".c2d-p")) if (g.getAttribute("data-id") === id) { const m = /translate\(([^ ]+) ([^)]+)\)/.exec(g.getAttribute("transform")); return m ? [m[1] / 10, m[2] / 10] : null; } return null; };
  let i = 0, seen = new Set(), S = null, first = true;
  const stats = { samples: 0, holderOut: 0, passOut: 0, oob: [], whistles: 0, passesDead: 0 };
  const push = () => {
    const now = Date.now();
    while (i < live.events.length && live.events[i].airAt <= now) ad.applyEvent(live.events[i++]);
    ad.tick(now); S = ad.buildState(now);
    const fresh = S.events.filter(e => !seen.has(e.id));
    seen = new Set(S.events.map(e => e.id));
    court.update(S, fresh.map(e => e.id));
    if (first) { first = false; return; }   // arrivée : historique (aucune action rejouée)
    for (const e of fresh) {
      if (e.kind === "outOfBounds" || (e.kind === "turnover" && e.deadBall === true && e.tovType !== "steal")) {
        stats.oob.push({ e, at: now, after: e.possessionAfter });
        if (sfxForEvent(e, 0).includes("whistle")) stats.whistles++;
      }
    }
  };
  let lastFlight = null;
  const t0 = Date.now();
  let lastPush = 0;
  while (Date.now() - t0 < DUR) {
    if (Date.now() - lastPush > 250) { push(); lastPush = Date.now(); }
    const d = court.debug();
    if (d.phase === "LIVE" && d.holder) { stats.samples++; const p = posOf(d.holder); if (p && out(p[0], p[1])) stats.holderOut++; }
    if (d.flight && d.flight.kind === "pass" && (!lastFlight || lastFlight.from !== d.flight.from)) {
      const f = d.flight.from;
      if (d.phase === "LIVE" && f && out(f.x, f.y)) stats.passOut++;
      lastFlight = d.flight;
    }
    // Après une sortie : jusqu'à la reprise, ballon mort (pas de jeu).
    const lastO = stats.oob[stats.oob.length - 1];
    if (lastO && !lastO.checked && Date.now() - lastO.at > 900) {
      lastO.checked = true;
      lastO.phase = d.phase; lastO.inbounder = d.inbounder; lastO.phases = d.log.filter(x => x.kind === "phase").slice(-4).map(x => x.to + ":" + x.why);
    }
    if (lastO && !lastO.done && /remise en jeu effectuée/.test(d.phaseWhy) && d.phase === "LIVE") {
      lastO.done = true; lastO.inboundTeam = d.holderTeam; lastO.ball = d.ball;
    }
    await sleep(50);
  }
  stats.passesDead = court.debug().deadPassBlocked;
  stats.fixes = court.debug().oobFixes;
  court.destroy && court.destroy();
  return stats;
}

(async () => {
  const { createLiveAdapter } = await import(pathToFileURL(path.join(__dirname, "assets/live/adapter.js")).href);
  const { sfxForEvent } = await import(pathToFileURL(path.join(__dirname, "assets/live/sfx.js")).href);
  const runs = await Promise.all([runMatch(createLiveAdapter, sfxForEvent, 2), runMatch(createLiveAdapter, sfxForEvent, 3)]);
  const tot = runs.reduce((a, r) => ({ samples: a.samples + r.samples, holderOut: a.holderOut + r.holderOut, passOut: a.passOut + r.passOut, oob: a.oob.concat(r.oob), whistles: a.whistles + r.whistles, fixes: a.fixes + r.fixes }), { samples: 0, holderOut: 0, passOut: 0, oob: [], whistles: 0, fixes: 0 });
  if (tot.samples < 200) fail(`trop peu d'échantillons de jeu (${tot.samples})`);
  if (tot.holderOut) fail(`ballon vivant : porteur derrière une ligne dans ${tot.holderOut} échantillons sur ${tot.samples}`);
  if (tot.passOut) fail(`${tot.passOut} passe(s) de jeu partie(s) de derrière une ligne`);
  ok(`Ballon vivant (${tot.samples} échantillons, 2 vrais matchs) : porteur toujours dans les lignes, aucune passe depuis la touche (${tot.fixes} ballons libres / cibles ramenés dans le terrain).`);
  if (!tot.oob.length) fail("aucune sortie de balle du moteur dans les fenêtres diffusées");
  if (tot.whistles !== tot.oob.length) fail(`coup de sifflet attendu sur chaque sortie (${tot.whistles}/${tot.oob.length})`);
  for (const o of tot.oob) {
    if (o.checked && o.phase === "LIVE" && !/remise en jeu/.test(o.phases.join())) fail(`sortie ${o.e.kind} : le jeu continue sans arrêt (${o.phases.join(" → ")})`);
    if (o.done) {
      if (o.inboundTeam !== null && o.after !== null && o.after !== undefined && o.inboundTeam !== o.after) fail(`sortie : remise en jeu par l'équipe ${o.inboundTeam}, le moteur désigne ${o.after}`);
      if (o.ball && out(o.ball[0], o.ball[1])) fail(`après la remise en jeu, ballon encore dehors (${o.ball})`);
    }
  }
  const done = tot.oob.filter(o => o.done).length;
  ok(`${tot.oob.length} sortie(s) du moteur : coup de sifflet, ballon mort jusqu'à la remise en jeu, remise par l'équipe désignée (${done} vérifiées), ballon rendu dans le terrain.`);
  console.log("\n🏁 live_court2d_bounds_test.js : jamais de ballon joué en touche ; sorties sifflées et remises en jeu réglementaires.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
