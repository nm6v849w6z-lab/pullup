// Rivalités (bilan face à face, Derby) et classement mondial des managers
// (2026-09-29).
const fs = require("fs");
const assert = require("assert");
const Engine = require("./engine.js");
const store = require("./server/store.js");
const World = require("./server/world.js");
const Adapter = require("./server/showsAdapter.js");
const ShowData = require("./server/shows/showData.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const qs = (h, a) => ({ home: [h, 0, 0, 0], away: [a, 0, 0, 0] });

const league = store.createMultiManagerCareer(["Lyon Rival", "Paris Rival"], Date.now(), "Lyon Rival").league;
const L = league.teams.findIndex(t => t.name === "Lyon Rival"), P = league.teams.findIndex(t => t.name === "Paris Rival");
const lyon = league.teams[L], paris = league.teams[P];
const cpu = league.teams.find(t => !t.isHuman);
assert(lyon.isHuman && paris.isHuman && cpu);
// 3 matchs officiels Lyon-Paris (2 V Lyon, 1 V Paris), un contre l'IA, un amical.
Engine.recordHumanRivalry(lyon, paris, "championship", 1, qs(80, 70));
Engine.recordHumanRivalry(paris, lyon, "cup", 2, qs(90, 85));
Engine.recordHumanRivalry(lyon, paris, "championship", 3, qs(77, 76));
Engine.recordHumanRivalry(lyon, cpu, "championship", 4, qs(100, 50));
Engine.recordHumanRivalry(lyon, paris, "friendly", 5, qs(100, 50));
const r = Engine.rivalryBetween(lyon, paris);
assert.deepStrictEqual([r.w, r.l, r.pf, r.pa, r.recent.length], [2, 1, 242, 236, 3]);
assert.deepStrictEqual([Engine.rivalryBetween(paris, lyon).w, Engine.rivalryBetween(paris, lyon).l], [1, 2]);
assert.strictEqual(Engine.rivalryBetween(lyon, cpu), null, "rien contre l'IA");
assert.strictEqual(lyon.managerRatedGames, 3); assert.strictEqual(paris.managerRatedGames, 3);
assert(lyon.managerRating > 1500 && paris.managerRating < 1500 && lyon.managerRating + paris.managerRating === 3000);
console.log(`✅ Moteur : bilan 2-1, note ${lyon.managerRating} / ${paris.managerRating} ; IA et amicaux ignorés.`);
// Passage par recordMatchStatsAndAwardMvp (chemin réel des matchs).
Engine.recordMatchStatsAndAwardMvp(lyon, paris, 5, "championship", 6, qs(60, 70));
assert.strictEqual(Engine.rivalryBetween(lyon, paris).l, 2);
console.log("✅ Chaque match officiel enregistré passe par la rivalité.");
// Sauvegarde / rechargement.
const back = store.deserializeMultiLeague(JSON.parse(JSON.stringify(store.serializeMultiLeague(league))));
const lyon2 = back.league.teams[L];
assert.deepStrictEqual(Engine.rivalryBetween(lyon2, back.league.teams[P]), Engine.rivalryBetween(lyon, paris));
assert.strictEqual(lyon2.managerRating, lyon.managerRating);
console.log("✅ Rivalités et note survivent à la sauvegarde.");
// Classement mondial.
const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }], summaries: { "fr-1": World.leagueSummary({ id: "fr-1", country: "fr", level: 1, group: 0 }, league) } };
const rk = World.managerRanking(world, { leagueId: "fr-1", idx: P });
assert.strictEqual(rk.total, 2);
const best = lyon.managerRating >= paris.managerRating ? "Lyon Rival" : "Paris Rival";
assert.strictEqual(rk.top[0].name, best);
assert.strictEqual(rk.me.rank, best === "Paris Rival" ? 1 : 2);
assert(rk.top[0].rating >= rk.top[1].rating);
console.log(`✅ Classement mondial : ${best} en tête, place du manager connue.`);
// Émission : « Le Derby » seulement contre le rival du championnat.
{
  const show = ShowData.buildPrematchShow({ ...Adapter.buildPrematchInput(league, L, 0, Date.now() + 3600e3), rivalry: { homeWins: 2, awayWins: 1, games: 3, derby: true } });
  assert.strictEqual(show.segments[0].titleAccent, "DERBY"); assert.strictEqual(show.brand, "LE DERBY");
  const plain = ShowData.buildPrematchShow({ ...Adapter.buildPrematchInput(league, L, 0, Date.now() + 3600e3), rivalry: { homeWins: 2, awayWins: 1, games: 3, derby: false } });
  assert.strictEqual(plain.segments[0].titleAccent, "MATCH", "un bilan entre managers ne fait pas un derby");
  let derbyRound = null;
  for (let r = 0; r < league.totalRounds && derbyRound == null; r++) {
    if (league.matchesForRound(r).some(m => !m.bye && (m.home === L || m.away === L) && league.isDerbyMatch(m.home, m.away))) derbyRound = r;
  }
  assert(derbyRound != null);
  assert.strictEqual(Adapter.buildPrematchInput(league, L, derbyRound, Date.now()).rivalry.derby, true);
  console.log("✅ Émission : « Le Derby » le jour du match contre son rival, pas pour un simple bilan.");
}

(async () => {
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const win = dom.window;
  win.eval(`teamB.isHuman = true; teamA.rivalries = {}; teamA.rivalries[rivalryKeyFor(teamB)] = { name: teamB.name, w: 3, l: 1, pf: 320, pa: 300, recent: [{ at: 1, competition: "championship", pf: 80, pa: 72, isHome: true }] };`);
  const line = win.eval(`rivalryLineHtml(teamB, "omc-rivalry", true)`);
  assert(/Derby/.test(line) && /3 V – 1 D/.test(line) && /V 80-72/.test(line), line);
  assert(!/Derby/.test(win.eval(`rivalryLineHtml(teamB, "omc-rivalry", false)`)), "pas de badge Derby hors rival");
  win.eval(`teamA.rivalries = {}; teamB.isHuman = false;`);
  assert(/Votre rival du championnat/.test(win.eval(`rivalryLineHtml(teamB, "x", true)`)));
  win.eval(`teamB.isHuman = true;`);
  win.eval(`teamA.rivalries = {};`);
  assert(/Première confrontation/.test(win.eval(`rivalryLineHtml(teamB, "x")`)));
  win.eval(`teamB.isHuman = false;`);
  assert.strictEqual(win.eval(`rivalryLineHtml(teamB, "x")`), "");
  console.log("✅ Jeu : ligne « Face à face » (Derby), « Première confrontation », rien contre l'IA.");
  await flush(dom); win.close(); server.close();
  console.log("\n🏁 Rivalités et classement mondial vérifiés.");
})().catch(e => { console.error(e); process.exit(1); });
