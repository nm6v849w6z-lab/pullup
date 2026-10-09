// Plein écran du match (43) et timer du temps mort dans le panneau
// supérieur (45), demande du 2026-10-07. Match RÉEL du moteur diffusé par
// schedulePlayback, état construit par l'adaptateur commun
// (assets/live/adapter.js) à des instants successifs, vue live-view.js :
//  - le temps mort vient de la pause du moteur (state.timeout), apparaît
//    dès son début, décompte chaque seconde, disparaît à la fin — dans le
//    bandeau, le mini-tableau et la barre du plein écran ;
//  - même règle pour le direct de son club (moteurbasket3.html:liveActiveTimeout) ;
//  - plein écran : barre (équipes, score, période, chrono), terrain et fil
//    du match ; nouvelles actions en tête du fil en temps réel ; sortie par
//    le bouton et par Échap.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { JSDOM } = require("jsdom");
const E = require("./engine.js");
const LM = require("./server/liveMatch.js");
const assert = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };

(async () => {
  const { createLiveAdapter, activeTimeout } = await import(pathToFileURL(path.join(__dirname, "assets/live/adapter.js")).href);
  const { createLiveView } = await import(pathToFileURL(path.join(__dirname, "assets/live/live-view.js")).href);
  let res, sched, home, away;
  for (let i = 0; i < 30; i++) {
    home = E.generateTeam("Lyon Basket", 1); away = E.generateTeam("Rennes Club", 1); home.name = "Lyon Basket"; away.name = "Rennes Club";
    res = new E.MatchEngine(home, away, { homeAdvantage: true }).simulate();
    sched = LM.schedulePlayback(res.events, 1_800_000_000_000);
    if (sched.pauses.some(p => p.kind === "timeout")) break;
  }
  const tmo = sched.pauses.find(p => p.kind === "timeout");
  assert(tmo && tmo.durationMs > 2000, `match avec un temps mort du moteur (${tmo.team}, ${Math.round(tmo.durationMs / 1000)} s)`);
  const live = { isHome: true, kickoffAt: 1_800_000_000_000, events: sched.events, pauses: sched.pauses, totalDurationMs: sched.totalDurationMs, boxScoreA: res.boxScoreA, boxScoreB: res.boxScoreB, seed: 1 };
  const td = t => ({ name: t.name, short: t.name.slice(0, 3).toUpperCase(), color: t === home ? "#e8892e" : "#3B8FE0", logo: "", players: t.players.map(p => ({ id: p.id, name: p.name, pos: p.position, avatar: "" })) });
  const ad = createLiveAdapter({ live, teams: { A: td(home), B: td(away) }, mine: "A" });
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const root = dom.window.document.getElementById("root");
  const view = createLiveView(root, { court2d: false });
  const $ = r => root.querySelector(`[data-ref="${r}"]`);
  let ti = 0;
  const timeline = [...live.events.map(e => ({ at: e.airAt, ev: e })), ...live.pauses.filter(p => p.kind === "timeout").map(p => ({ at: p.airAt, pause: p }))].sort((a, b) => a.at - b.at);
  const at = now => { while (ti < timeline.length && timeline[ti].at <= now) { const it = timeline[ti++]; if (it.ev) ad.applyEvent(it.ev); else ad.applyPause(it.pause); } ad.tick(now); const S = ad.buildState(now); view.update(S); return S; };

  // 45. Timer du temps mort.
  let S = at(tmo.airAt - 1500);
  assert(!S.timeout && $("tmo").hidden && $("fstmo").hidden, "avant le temps mort : aucun timer");
  S = at(tmo.airAt + 200);
  const total = Math.ceil(tmo.durationMs / 1000);
  const short = S.teams[tmo.team === "home" ? 0 : 1].short;
  assert(S.timeout && S.timeout.remaining === Math.ceil((tmo.durationMs - 200) / 1000) && !$("tmo").hidden, `dès le début : timer affiché (${$("tmo").textContent})`);
  assert(new RegExp(`Temps mort · ${short} \\d\\d:\\d\\d`).test($("tmo").textContent), "timer : « Temps mort · " + short + " mm:ss » (équipe qui l'a demandé)");
  assert($("tmo").textContent === $("fstmo").textContent && $("tmo").textContent === $("mtmo").textContent, "même timer dans le bandeau, le mini-tableau et la barre du plein écran");
  assert($("clock").textContent !== $("tmo").textContent && $("tmo").classList.contains("tmo"), "timer distinct du chrono de match");
  const t1 = $("tmo").textContent;
  S = at(tmo.airAt + 3200);
  assert($("tmo").textContent !== t1 && S.timeout.remaining === Math.ceil((tmo.durationMs - 3200) / 1000), `décompte en temps réel (${t1} → ${$("tmo").textContent})`);
  S = at(tmo.airAt + tmo.durationMs + 50);
  assert(!S.timeout && $("tmo").hidden && $("fstmo").hidden && $("mtmo").hidden, "fin du temps mort : timer disparu");
  // Même règle côté direct de son club (copie inline).
  const html = require("./test_game_html.js").readGameHtml();
  const src = /function liveActiveTimeout\([\s\S]*?\n}\n/.exec(html);
  assert(src, "copie liveActiveTimeout présente pour le direct de son club");
  const inline = new Function(src[0] + "; return liveActiveTimeout;")();
  for (const now of [tmo.airAt - 1, tmo.airAt, tmo.airAt + 5000, tmo.airAt + tmo.durationMs - 1, tmo.airAt + tmo.durationMs]) assert(JSON.stringify(inline(live.pauses, now)) === JSON.stringify(activeTimeout(live.pauses, now)), `direct de son club : même temps mort à +${now - tmo.airAt} ms`);
  assert(/timeout: hmLive\.final \? null : liveActiveTimeout\(m\.pauses, Date\.now\(\)\)/.test(html), "hmLiveBuildState expose state.timeout");

  // 43. Plein écran.
  $("fsBtn").click();
  assert(root.classList.contains("is-full") && $("fsbar").getAttribute("aria-hidden") === "false", "plein écran : activé par le bouton");
  assert($("fsscore0").textContent === String(S.teams[0].score) && $("fsscore1").textContent === String(S.teams[1].score) && $("fsname0").textContent === S.teams[0].name && /^Q\d$|^P\d$/.test($("fsperiod").textContent) && $("fsclock").textContent === $("clock").textContent, `barre du haut : équipes, score ${$("fsscore0").textContent}-${$("fsscore1").textContent}, ${$("fsperiod").textContent} ${$("fsclock").textContent}`);
  assert(root.querySelector(".grid .court-panel") && root.querySelector(".grid .feed-panel"), "terrain et fil du match dans la zone principale");
  const firstBefore = $("feed").firstElementChild && $("feed").firstElementChild.textContent;
  const next = live.events.find(e => e.airAt > tmo.airAt + tmo.durationMs + 50 && e.type === "shot");
  S = at(next.airAt + 10);
  const firstAfter = $("feed").firstElementChild.textContent;
  assert(firstAfter !== firstBefore && firstAfter.includes(next.text.slice(0, 20)), "fil du match : la nouvelle action arrive en tête, en temps réel");
  assert($("fsscore0").textContent === String(S.teams[0].score) && $("fsscore1").textContent === String(S.teams[1].score), "barre du haut : score mis à jour en temps réel");
  root.ownerDocument.defaultView.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
  $("fsExit").click();
  assert(!root.classList.contains("is-full"), "plein écran : quitté par le bouton");
  // Hôte du jeu (#hmLiveRoot{display:block}, sélecteur par id) : la grille
  // du plein écran doit l'emporter, sinon la carte des tirs s'étire hors
  // de l'écran (retour utilisateur 2026-10-08).
  const css = fs.readFileSync("assets/live/live.css", "utf8");
  assert(/\.hm-live\.is-full\{[^}]*display:grid!important[^}]*grid-template-rows:auto minmax\(0,1fr\)!important/.test(css), "plein écran : grille prioritaire sur le conteneur du jeu (carte des tirs visible)");
  console.log("\n🏁 live_fullscreen_timeout_test.js : plein écran et timer du temps mort.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
