// Archives de saison (retour utilisateur 2026-10-04) : chaque match officiel
// figé avec les deux équipes, le score par quart-temps et la ligne de chaque
// joueur, y compris ceux partis depuis, indépendamment de l'effectif.
const assert = require("assert");
const E = require("./engine.js");
const lg = E.generateLeague(E.generateStartingRoster("Club"));
lg.teams.forEach(t => { t.isHuman = false; });
const T = lg.teams[0], U = lg.teams[1];
const now = Date.now();
// Un match de championnat simulé et enregistré comme en vrai.
const r = new E.MatchEngine(T, U).simulate(now);
E.recordMatchStatsAndAwardMvp(T, U, 0, "championship", now, { home: r.quarterScores.A, away: r.quarterScores.B }, null, r.seed);
lg.results.push({ round: 0, home: 0, away: 1, scoreHome: r.finalScore.A, scoreAway: r.finalScore.B });
// Un joueur de T vendu après le match : sa ligne reste dans l'archive.
const sold = T.players.find(p => (p.matchLog || []).some(e => e.round === 0));
E.transferPlayerBetweenTeams(T, lg.teams[2], sold.id, 1000, now);
const a = E.buildSeasonArchive(lg, { leagueId: "fr-1", now });
assert.strictEqual(a.matches.length, 1, "un match archivé");
const m = a.matches[0];
assert.deepStrictEqual([m.home.team, m.away.team, m.scoreHome, m.scoreAway], [T.name, U.name, r.finalScore.A, r.finalScore.B], "équipes et score");
const nameCol = a.cols.indexOf("name"), ptsCol = a.cols.indexOf("pts");
assert.ok(m.home.rows.some(row => row[nameCol] === sold.name), "joueur vendu depuis présent");
assert.strictEqual(m.home.rows.reduce((n, row) => n + row[ptsCol], 0), r.finalScore.A, "points des joueurs = score");
assert.strictEqual(m.away.rows.reduce((n, row) => n + row[ptsCol], 0), r.finalScore.B);
assert.ok(JSON.stringify(a).length < 20000, "compact");
console.log("✅ Archive de saison : match figé (équipes, score, lignes de tous les joueurs, partis compris)");

// Lignes d'avant le 2026-10-04 (sans domicile/adversaire) : appariement par
// les résultats de la ligue.
{
  const strip = e => { delete e.isHome; delete e.opponent; };
  lg.teams.forEach(t => { t.players.forEach(p => (p.matchLog || []).forEach(strip)); (t.departedMatchLog || []).forEach(strip); });
  const b = E.buildSeasonArchive(lg, { leagueId: "fr-1", now });
  assert.strictEqual(b.matches.length, 1);
  assert.deepStrictEqual([b.matches[0].home.team, b.matches[0].away.team], [T.name, U.name], "domicile retrouvé via les résultats");
  console.log("✅ Archive de saison : anciennes lignes appariées correctement");
}
