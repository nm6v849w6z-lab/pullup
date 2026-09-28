// Écran de fin de saison en ligue partagée (retour utilisateur 2026-09-28,
// nouvelle saison automatique) : plus de bouton « Démarrer une nouvelle
// saison » (il régénérerait une ligue locale), encadré d'intersaison avec la
// date de reprise, et verdict calculé pour SON club (myTeamIndex), pas
// l'équipe 0. Voir intersaisonNoticeHtml/renderSeasonEnd.
const fs = require("fs");
const E = require("./engine.js");
const C = require("./server/calendar.js");
const A = require("./server/autoSim.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);

(async () => {
  const H = 3600 * 1000;
  const created = Date.now() - 120 * 24 * H;
  const lg = E.generateMultiManagerLeague(["Lyon Inter", "Paris Inter"], 1, created, C.dailyAnchoredCalendarConfig());
  lg.autoNextSeason = false; // on fige l'intersaison pour le test
  let t = created;
  for (let i = 0; i < 2000 && !lg.seasonEndTickDone; i++) { t += 3 * H; A.catchUpLeague(lg, t); }
  if (!lg.seasonEndTickDone || typeof lg.intersaisonStartedAt !== "number") fail("(setup) intersaison non atteinte.");
  const meIdx = 1; // deuxième club humain : vérifie qu'on n'utilise plus l'index 0
  const { server, multiSavePath, baseUrl } = await startTestServer();
  await store.saveMultiLeague(lg, multiSavePath);
  const dom = await openGame(html, `${baseUrl}?m=${lg.teams[meIdx].managerLinkToken}`);
  const win = dom.window, doc = win.document;
  win.eval("showSeasonEnd()");
  await new Promise(r => setTimeout(r, 50));
  const content = doc.getElementById("seasonEndContent");
  const btn = doc.getElementById("newSeasonBtn");
  if (!btn.classList.contains("hidden")) fail("le bouton « Démarrer une nouvelle saison » doit être masqué en ligue partagée.");
  const notice = content.querySelector(".intersaison-notice");
  if (!notice || !/Intersaison/.test(notice.textContent) || !/la saison 2 démarre le/.test(notice.textContent)) fail(`encadré d'intersaison : ${notice && notice.textContent}`);
  if (!/amicaux/.test(notice.textContent)) fail("l'encadré doit rappeler que les amicaux sont possibles.");
  if (content.querySelector(".season-division-outcome")) fail("une seule ligue : pas de verdict de montée/descente.");
  if ([...content.querySelectorAll("h3")].some(h => /Relégation/.test(h.textContent))) fail("une seule ligue : pas de bloc Relégation.");
  const champ = lg.playoffs.champion;
  const sawYou = /c'est vous/.test(content.textContent);
  if ((champ === meIdx) !== sawYou) fail(`« c'est vous » doit suivre myTeamIndex (champion ${champ}, moi ${meIdx}).`);
  ok("fin de saison en ligue partagée : pas de bouton de nouvelle saison, encadré d'intersaison (date de reprise, amicaux), pas de montée/descente, verdict pour son propre club");
  dom.window.close();
  server.close();
  console.log("\n🏁 new_season_ui_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
