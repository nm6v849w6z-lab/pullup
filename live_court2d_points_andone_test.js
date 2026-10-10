// Terrain 2D — « +2 » et « AND ONE » (mission live 2026-10-10).
//  « +2 » : affiché UNE fois par panier confirmé (clé = événement du moteur),
//   dans un calque à part jamais réordonné (avant : enfant du jeton, réinséré
//   à chaque tri de profondeur → animation relancée → clignotement), qui suit
//   le tireur, puis supprimé ; paniers rapprochés : un « +2 » chacun ; même
//   événement renvoyé (rendu, resynchronisation) : rien de plus.
//  « AND ONE » : jamais sur le panier ni sur la faute ; seulement quand le
//   lancer franc additionnel est RÉUSSI (à son événement), une seule fois ;
//   lancer raté, panier sans faute : jamais.
// Vrais matchs du moteur, diffusés en temps réel par l'adaptateur.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { JSDOM } = require("jsdom");
const E = require("./engine.js");
const LM = require("./server/liveMatch.js");
const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { createLiveAdapter } = await import(pathToFileURL(path.join(__dirname, "assets/live/adapter.js")).href);
  // Matchs avec un « and one » au lancer réussi, un au lancer raté.
  const found = {};
  for (let n = 0; n < 200 && !(found.made && found.missed); n++) {
    const home = E.generateTeam("Lyon", 1), away = E.generateTeam("Rennes", 1);
    const res = new E.MatchEngine(home, away, { homeAdvantage: true }).simulate();
    const evs = res.events;
    for (let i = 1; i < evs.length - 1; i++) {
      if (evs[i].type !== "foul" || evs[i].foulType !== "andOne" || evs[i - 1].type !== "shot" || !evs[i - 1].made) continue;
      const ft = evs.slice(i + 1).find(e => e.type === "freeThrow");
      if (!ft || ft.foulType !== "andOne" || evs[i].quarter !== 2) continue;
      const k = ft.made ? "made" : "missed";
      if (!found[k]) found[k] = { home, away, res, foulIdx: i };
    }
  }
  if (!found.made || !found.missed) fail("matchs avec « and one » (lancer réussi et raté) introuvables");

  const runScenario = async (sc, label) => {
    const dom = new JSDOM(`<!doctype html><div id="host"></div>`, { pretendToBeVisual: true, runScripts: "outside-only" });
    const { window } = dom;
    const strip = s => s.replace(/^import .*$/mg, "").replace(/^export\s+(function|const|let|class)/mg, "$1").replace(/^export\s*\{[^}]*\};?/mg, "");
    window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/format.js"), "utf8")));
    window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8")));
    const host = window.document.getElementById("host");
    const court = window.createCourt2D(host, { colors: ["#e8892e", "#3B8FE0"], raster: false });
    const sched = LM.schedulePlayback(sc.res.events, 0);
    const shotEv = sched.events.find(e => e.type === "foul" && e.foulType === "andOne" && e.quarter === 2 && e.clock === sc.res.events[sc.foulIdx].clock);
    const fi = sched.events.indexOf(shotEv);
    const shot = sched.events[fi - 1], ft = sched.events.slice(fi + 1).find(e => e.type === "freeThrow");
    // Diffusion recalée : 6 s avant le panier = maintenant.
    const delta = Date.now() + 6000 - shot.airAt;
    const live = { isHome: true, kickoffAt: delta, events: sched.events.map(e => ({ ...e, airAt: e.airAt + delta })), pauses: sched.pauses.map(p => ({ ...p, airAt: p.airAt + delta })), totalDurationMs: sched.totalDurationMs, boxScoreA: sc.res.boxScoreA, boxScoreB: sc.res.boxScoreB };
    const td = t => ({ name: t.name, short: t.name.slice(0, 3), color: "#fff", players: t.players.map(p => ({ id: p.id, name: p.name, pos: p.position })) });
    const ad = createLiveAdapter({ live, teams: { A: td(sc.home), B: td(sc.away) }, mine: "A" });
    const T = { shot: shot.airAt + delta, foul: shotEv.airAt + delta, ft: ft.airAt + delta };
    const log = [];
    const obs = new window.MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (!n.getAttribute) return;
      const c = n.getAttribute("class") || "";
      if (/(^| )c2d-banner( |$)/.test(c)) log.push({ kind: "banner", text: n.textContent, at: Date.now() });
      if (/(^| )c2d-ptsf( |$)/.test(c)) log.push({ kind: "pts", text: n.textContent, at: Date.now(), inSprite: !!n.closest(".c2d-p"), node: n });
    })));
    obs.observe(host, { childList: true, subtree: true });
    let i = 0, seen = new Set(), S = null;
    // Saut initial sur l'état juste avant (le terrain « prime » le passé : rien n'est rejoué).
    const push = () => { const now = Date.now(); while (i < live.events.length && live.events[i].airAt <= now) ad.applyEvent(live.events[i++]); ad.tick(now); S = ad.buildState(now); const fresh = S.events.filter(e => !seen.has(e.id)).map(e => e.id); seen = new Set(S.events.map(e => e.id)); court.update(S, fresh); return fresh; };
    push();
    // Mutation : animation relancée ⇔ nœud retiré puis réinséré.
    let reinserted = 0;
    const obs2 = new window.MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.querySelector && n.querySelector(".c2d-ptsf")) reinserted++; })));
    obs2.observe(host, { childList: true, subtree: true });
    const until = T.ft + 4500;
    while (Date.now() < until) { push(); await sleep(150); }
    // Même état renvoyé plusieurs fois (rendu répété, resynchronisation) : rien de plus.
    const n0 = log.length;
    for (let k = 0; k < 5; k++) { court.update(S, S.events.slice(-4).map(e => e.id)); await sleep(60); }
    const dup = log.length - n0;
    obs.disconnect(); obs2.disconnect();
    const leftovers = host.querySelectorAll(".c2d-ptsf").length;
    court.destroy && court.destroy();
    return { log, T, shot, ft, reinserted, dup, leftovers };
  };

  // 1. Panier + faute, lancer RÉUSSI.
  let r = await runScenario(found.made, "réussi");
  let banners = r.log.filter(x => x.kind === "banner" && /AND ONE/.test(x.text));
  ok(`Scénario 1 (panier + faute, lancer réussi) : ${banners.length} « AND ONE » — affiché à ${banners[0] ? banners[0].at - r.T.ft : "?"} ms du lancer (faute à ${r.T.foul - r.T.ft} ms).`);
  if (banners.length !== 1) fail(`« AND ONE » : une seule apparition attendue, obtenu ${banners.length}`);
  if (banners[0].at < r.T.ft - 50) fail(`« AND ONE » affiché AVANT la réussite du lancer franc (${banners[0].at - r.T.ft} ms)`);
  const pts = r.log.filter(x => x.kind === "pts");
  if (pts.length !== 2 || pts[0].text !== "+2" || pts[1].text !== "+1") fail(`« +2 » puis « +1 » attendus une fois chacun, obtenu ${pts.map(p => p.text)}`);
  if (pts.some(p => p.inSprite)) fail("les points ne doivent plus être dans le jeton (réordonné à chaque tri)");
  if (r.reinserted) fail(`un « +2 » a été réinséré dans le DOM (${r.reinserted} fois) : animation relancée = clignotement`);
  if (r.dup) fail(`même état renvoyé : ${r.dup} affichage(s) en double`);
  if (r.leftovers) fail(`${r.leftovers} « +N » restés après la fin de l'animation`);
  ok("« +2 » (panier) puis « +1 » (lancer) : une fois chacun, calque à part jamais réinséré (pas de clignotement), rien en double sur un état renvoyé, nettoyés après ~2 s.");

  // 2. Panier + faute, lancer RATÉ.
  r = await runScenario(found.missed, "raté");
  banners = r.log.filter(x => x.kind === "banner" && /AND ONE/.test(x.text));
  if (banners.length) fail(`lancer additionnel raté : aucun « AND ONE » attendu, obtenu ${banners.length}`);
  const pts2 = r.log.filter(x => x.kind === "pts").map(p => p.text);
  if (pts2.join() !== "+2") fail(`lancer raté : seul le « +2 » du panier attendu, obtenu ${pts2}`);
  ok("Scénario 2 (panier + faute, lancer raté) : aucun « AND ONE » ; seul le « +2 » du panier.");

  // 3. Panier classique sans faute : jamais d'« AND ONE » (statique + toute la séquence ci-dessus).
  const src = fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8");
  const calls = src.split("\n").filter(l => /andOneBanner\(|banner\("AND ONE"/.test(l) && !/function andOneBanner/.test(l));
  if (calls.length !== 2 || !calls.some(l => /made && e\.foulType === "andOne"/.test(l))) fail(`« AND ONE » doit n'être déclenché QUE par un lancer réussi d'un and-one (${calls.map(l => l.trim()).join(" | ")})`);
  ok("Scénario 3 (panier sans faute, faute sans panier) : le seul déclencheur d'« AND ONE » est un lancer franc RÉUSSI d'une action and-one.");
  console.log("\n🏁 live_court2d_points_andone_test.js : « +2 » unique et stable, « AND ONE » après le lancer réussi seulement.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
