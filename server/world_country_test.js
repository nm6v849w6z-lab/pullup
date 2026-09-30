"use strict";
// Aperçu du pays de Planète Hoop (retour utilisateur 2026-09-30, « comme
// l'aperçu du pays de BuzzerBeater ») : World.countryOverview et ses
// morceaux (countryStats : leaders avec les contres + meilleures
// performances en un match ; recordCountryHonours avec les finalistes ;
// countryTitles ; internationalFriendlies ; classement des managers du pays).
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const store = require("./store.js");
const World = require("./world.js");

const D = 24 * 3600 * 1000;
const ok = m => console.log("✅ " + m);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "world-country-"));
  const multi = path.join(dir, "multi-league.json");
  const now = Date.now();
  const career = store.createMultiManagerCareer(["Lyon Aperçu", "Paris Aperçu"], now - 20 * D, "Lyon Aperçu");
  career.league.teams[0].lastSeenAt = now - D;
  await store.saveMultiLeague(career.league, multi);
  await World.catchUpWorld(multi, now);
  const world = await World.loadWorld(multi, now);

  // 1) Statistiques du pays : leaders (contres compris) et meilleurs matchs.
  const st = world.countryStats.fr;
  assert.ok(st.clubs === 10 && st.managers === 2, `clubs/managers : ${st.clubs}/${st.managers}`);
  assert.strictEqual(st.activeManagers, 1, "un seul manager vu dans les 7 derniers jours");
  ["pts", "reb", "ast", "blk"].forEach(k => {
    assert.ok(st.leaders[k].length > 0, `leaders ${k}`);
    assert.ok(st.leaders[k].every((r, i, a) => i === 0 || a[i - 1].value >= r.value), `leaders ${k} triés`);
    assert.ok(Number.isInteger(st.leaders[k][0].teamIdx) && st.leaders[k][0].leagueId === "fr-1", "leader cliquable (ligue + club)");
    assert.ok(st.bests[k].length > 0 && st.bests[k][0].value > 0, `meilleur match ${k}`);
  });
  const fr1 = await World.loadLeague(world, "fr-1", multi);
  let maxPts = 0;
  fr1.teams.forEach(t => t.players.forEach(p => (p.matchLog || []).forEach(m => { if (m.competition !== "friendly") maxPts = Math.max(maxPts, m.pts || 0); })));
  assert.strictEqual(st.bests.pts[0].value, maxPts, "record de points = vrai maximum des feuilles de match");
  assert.ok(st.bests.pts[0].opponent && st.bests.pts[0].opponent !== st.bests.pts[0].team, "adversaire du record retrouvé");
  ok(`statistiques du pays : leaders pts/reb/ast/blk, record de points ${maxPts} (${st.bests.pts[0].name} contre ${st.bests.pts[0].opponent}), managers actifs`);

  // 2) Palmarès avec finalistes (championnat et Coupe).
  const lg = fr1;
  lg.playoffs = { champion: 2, finalSeries: { idxA: 2, idxB: 5 }, series: [] };
  const cup = { season: lg.seasonNumber || 1, champion: { leagueId: "fr-1", idx: 7, name: lg.teams[7].name },
    rounds: [{ index: 0, matches: [{ home: { leagueId: "fr-1", idx: 7, name: lg.teams[7].name }, away: { leagueId: "fr-1", idx: 2, name: lg.teams[2].name }, winner: "home", resolved: true }] }] };
  const w2 = { leagues: world.leagues, cups: { fr: cup }, history: {} };
  World.recordCountryHonours(w2, "fr", new Map([["fr-1", lg]]));
  const h = w2.history.fr[0];
  assert.deepStrictEqual([h.champion, h.championFinalist, h.cupWinner, h.cupFinalist], [lg.teams[2].name, lg.teams[5].name, lg.teams[7].name, lg.teams[2].name]);
  ok("palmarès : champion + finaliste de Division I, vainqueur + finaliste de la Coupe");

  // 3) Titres par club.
  const titles = World.countryTitles([
    { season: 2, champion: "A", championFinalist: "B", cupWinner: "B", cupFinalist: "C", superCupWinner: "A" },
    { season: 1, champion: "A", championFinalist: "C", cupWinner: "A", cupFinalist: "B" },
  ]);
  assert.deepStrictEqual(titles.map(t => t.name), ["A", "B", "C"]);
  assert.deepStrictEqual(titles[0], { name: "A", championships: 2, cups: 1, superCups: 1, finals: 0 });
  assert.deepStrictEqual(titles[2], { name: "C", championships: 0, cups: 0, superCups: 0, finals: 2 });
  ok("titres par club : championnats, Coupes, Supercoupes, finales perdues");

  // 4) Amicaux internationaux (joués et annoncés seulement).
  const ref = (country, name) => ({ leagueId: `${country}-1`, idx: 1, name, country, label: "Division I" });
  const fstore = { list: [
    { status: "played", at: now - 3 * D, home: ref("fr", "F1"), away: ref("us", "U1"), result: { scoreHome: 80, scoreAway: 70, revealAt: now - 3 * D } },
    { status: "played", at: now - 2 * D, home: ref("us", "U2"), away: ref("fr", "F2"), result: { scoreHome: 90, scoreAway: 60, revealAt: now - 2 * D } },
    { status: "played", at: now - 1000, home: ref("us", "U3"), away: ref("fr", "F3"), result: { scoreHome: 50, scoreAway: 60, revealAt: now + D } },
    { status: "played", at: now - D, home: ref("fr", "F4"), away: ref("fr", "F5"), result: { scoreHome: 50, scoreAway: 60 } },
    { status: "accepted", at: now + D, home: ref("fr", "F6"), away: ref("us", "U6") },
  ] };
  const intl = World.internationalFriendlies(fstore, "fr", now);
  assert.deepStrictEqual([intl.played, intl.wins, intl.losses], [2, 1, 1]);
  assert.deepStrictEqual(intl.byCountry, [{ country: "us", played: 2, wins: 1, losses: 1 }]);
  assert.strictEqual(intl.recent[0].home.name, "U2", "le plus récent d'abord");
  ok("amicaux internationaux : bilan par pays, huis clos et amicaux franco-français exclus");

  // 5) Aperçu complet + classement des managers du pays.
  world.summaries["fr-1"].managers.forEach(m => { m.games = 0; });
  world.summaries["fr-1"].managers[0].games = 3;
  world.summaries["fr-1"].managers[0].rating = 1540;
  world.summaries["us-1"].managers = [{ idx: 4, name: "NY Test", rating: 1600, games: 2 }];
  world.history = { fr: [{ season: 1, champion: fr1.teams[3].name, championFinalist: fr1.teams[4].name, cupWinner: null }] };
  const ov = World.countryOverview(world, "fr", { myCountry: "fr", friendlies: fstore, now });
  assert.ok(ov.mine && ov.name === "France");
  assert.deepStrictEqual([ov.card.divisionCount, ov.card.leagueCount, ov.card.clubs, ov.card.managers], [1, 1, 10, 2]);
  assert.strictEqual(ov.divisions[0].leagues[0].id, "fr-1");
  assert.ok(ov.divisions[0].leagues[0].leader, "leader de chaque championnat");
  assert.deepStrictEqual(ov.ranking.top.map(r => [r.nationalRank, r.worldRank, r.name]), [[1, 2, "Lyon Aperçu"]]);
  assert.strictEqual(ov.ranking.worldTotal, 2);
  assert.strictEqual(ov.titles[0].name, fr1.teams[3].name);
  assert.ok(ov.clubs[fr1.teams[3].name] && ov.clubs[fr1.teams[3].name].leagueId === "fr-1", "clubs du palmarès cliquables");
  assert.ok(ov.leaders.blk.length && ov.bests.blk.length && !ov.leaders.eval);
  assert.strictEqual(ov.friendlies.played, 2);
  const us = World.countryOverview(world, "us", { myCountry: "fr", now });
  assert.ok(!us.mine && us.ranking.top[0].name === "NY Test" && us.ranking.top[0].worldRank === 1);
  assert.deepStrictEqual(us.titles, []);
  ok("countryOverview : carte du pays, divisions, classement national/mondial des managers, titres, clubs cliquables");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("\n🏁 world_country_test.js : tout est vert");
})().catch(e => { console.error("❌", e); process.exit(1); });
