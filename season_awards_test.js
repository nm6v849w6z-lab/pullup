// Récompenses de fin de saison (MVP, meilleur jeune, meilleurs marqueur /
// rebondeur / passeur / défenseur, cinq majeur), carrière des joueurs et
// succès du manager (liste de la nuit du 2026-09-28). Voir
// awardSeasonHonours / MANAGER_ACHIEVEMENTS (engine.js), leurs appels dans
// server/index.js:tick et server/autoSim.js, et l'affichage (Histoire du
// club, fiche joueur, fin de saison) dans moteurbasket3.html.
const assert = require("assert");
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const AutoSim = require("./server/autoSim.js");
const store = require("./server/store.js");
const { startTestServer, openGame, patchDateNow } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const ok = m => console.log("✅ " + m);
const H = 3600 * 1000;

(async () => {
  const created = Date.UTC(2026, 8, 27, 9);
  const career = store.createMultiManagerCareer(["Lyon Gala", "Paris Gala"], created, "Lyon Gala");
  const league = career.league;
  league.calendarDailyAnchored = true; league.calendarWeeklyRhythm = true;
  league.calendarStartAt = Calendar.weeklyRhythmCalendarStartAt(created);
  league.cup = null;
  let t = created;
  for (let i = 0; i < 500 && !league.seasonEndTickDone; i++) { t += 6 * H; AutoSim.catchUpLeague(league, t); }
  assert.ok(league.isPlayoffsDone() && league.seasonEndTickDone, "saison terminée");
  const sa = league.seasonAwards;
  assert.ok(sa && sa.seasonNumber === 1, "récompenses décernées");
  const keys = sa.awards.map(a => a.key);
  ["mvp", "topScorer", "topRebounder", "topPasser", "bestDefender"].forEach(k => assert.ok(keys.includes(k), k));
  assert.strictEqual(keys.filter(k => k === "allStar").length, 5, "cinq majeur : un par poste");
  const allStarPositions = sa.awards.filter(a => a.key === "allStar").map(a => a.position);
  assert.strictEqual(new Set(allStarPositions).size, 5);
  const mvp = sa.awards.find(a => a.key === "mvp");
  const mvpPlayer = league.teams[mvp.teamIdx].players.find(p => p.id === mvp.playerId);
  assert.ok(mvpPlayer.awards.some(a => a.key === "mvp" && a.seasonNumber === 1), "distinction sur le joueur");
  const young = sa.awards.find(a => a.key === "youngPlayer");
  if (young) assert.ok(young.age <= 21);
  ok(`récompenses : MVP ${mvp.playerName} (${mvp.teamName}, ${mvp.detail})${young ? `, meilleur jeune ${young.playerName}` : ""}, cinq majeur (${allStarPositions.length} postes), meilleurs marqueur/rebondeur/passeur/défenseur`);

  // Carrière : une ligne de saison par joueur ayant joué.
  const played = league.teams.flatMap(tm => tm.players).filter(p => (p.careerSeasons || []).length);
  assert.ok(played.length > 50, "lignes de carrière");
  const c = mvpPlayer.careerSeasons[0];
  assert.ok(c.seasonNumber === 1 && c.games > 5 && c.pts > 0 && c.teamName);
  ok(`carrière : ${played.length} joueurs avec leur saison 1 (${mvpPlayer.name} : ${c.games} matchs, ${c.pts} pts, ${c.eval} d'éval.)`);

  // Succès du manager.
  const lyon = league.teams[0];
  assert.ok(lyon.achTiers.FIRST_SEASON >= 1, "succès « Première saison » (Bronze)");
  if (league.playoffs.seeds.includes(0)) assert.ok(lyon.achTiers.FINAL_FOUR >= 1);
  if (league.playoffs.champion === 0) assert.ok(lyon.achTiers.CHAMPION >= 1);
  assert.ok(lyon.feed.entries.some(e => /Succès débloqué/.test(e.title)));
  ok(`succès du manager : ${Object.keys(lyon.achTiers).filter(k => lyon.achTiers[k]).join(", ")}`);

  // Idempotent + sauvegarde.
  const n = mvpPlayer.awards.length, nc = mvpPlayer.careerSeasons.length, na = lyon.achLog.length;
  Engine.awardSeasonHonours(league, t + H);
  assert.strictEqual(mvpPlayer.awards.length, n); assert.strictEqual(mvpPlayer.careerSeasons.length, nc); assert.strictEqual(lyon.achLog.length, na);
  const back = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(league))));
  assert.deepStrictEqual(back.seasonAwards, league.seasonAwards);
  const mvpBack = back.teams[mvp.teamIdx].players.find(p => p.id === mvp.playerId);
  assert.deepStrictEqual(mvpBack.awards, mvpPlayer.awards); assert.deepStrictEqual(mvpBack.careerSeasons, mvpPlayer.careerSeasons);
  assert.deepStrictEqual(back.teams[0].achTiers, lyon.achTiers);
  assert.deepStrictEqual(back.teams[0].achStats, JSON.parse(JSON.stringify(lyon.achStats)));
  ok("idempotent et sauvegardé (récompenses, distinctions, carrière, succès)");

  // Navigateur : Histoire du club + fiche du MVP.
  const clock = { now: t + H };
  const { server, multiSavePath, baseUrl } = await startTestServer(() => clock.now);
  await store.saveMultiLeague(league, multiSavePath);
  const dom = await openGame(html, `${baseUrl}?m=${lyon.managerLinkToken}`, w => patchDateNow(w, () => clock.now));
  const win = dom.window, doc = win.document;
  if (win.eval("currentVisiblePageId()") === "catchupSection") doc.getElementById("catchupContinueBtn").click();
  win.eval("TAB_HANDLERS.histoire()");
  // Récompenses : plus dans l'Histoire du club, uniquement sur la page Ligue.
  assert.ok(!doc.getElementById("hcSeasonAwards"), "pas de récompenses dans l'Histoire du club");
  assert.ok(!doc.getElementById("hcAchievements"), "succès du manager : plus dans l'Histoire du club");
  // Succès : sur le profil du manager (2026-09-30).
  win.eval("showManagerProfile(myTeamIndex)");
  const ach = doc.getElementById("mpAchievements");
  assert.ok(ach && ach.querySelectorAll(".ach-card.is-on").length === Object.keys(lyon.achTiers).filter(k => lyon.achTiers[k]).length && /Première saison/i.test(ach.textContent));
  win.eval(`showPlayerDetail(${mvp.teamIdx}, ${JSON.stringify(mvp.playerId)})`);
  const det = doc.getElementById("playerDetailContent") || doc.body;
  assert.ok(/Carrière/.test(det.textContent) && /Distinctions/.test(det.textContent) && /MVP de la saison/.test(det.textContent), "fiche joueur : carrière et distinctions");
  ok("navigateur : succès sur le profil du manager (récompenses sur la page Ligue), carrière et distinctions sur la fiche du MVP");
  dom.window.close();
  server.close();
  console.log("\n🏁 season_awards_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
