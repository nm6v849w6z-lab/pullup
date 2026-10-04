// Joueur qui change de club en cours de saison (retours utilisateur
// 2026-10-04) : ses lignes de match restent au club qu'il quitte (feuilles
// de match figées), et ses minutes de la semaine le suivent (entraînement).
const assert = require("assert");
const E = require("./engine.js");
const lg = E.generateLeague(E.generateStartingRoster("Vendeur"));
const seller = lg.teams[0], buyer = lg.teams[1];
const p = seller.players[0];
p.matchLog = [{ round: 0, competition: "championship", min: 30, pts: 12, team: seller.name },
  { round: -1, competition: "friendly", min: 20, pts: 4, team: seller.name }];
p.trainingSecondsPlayedByPosition = { [p.position]: 1500 };
seller.budget = 1e7; buyer.budget = 1e7;
const res = E.transferPlayerBetweenTeams(seller, buyer, p.id, 1000, Date.now());
assert.strictEqual(res.result, "sold", JSON.stringify(res));
assert.ok(!seller.players.includes(p) && buyer.players.includes(p));
assert.strictEqual(seller.departedMatchLog.length, 1, "match officiel gardé par l'ancien club (amical exclu)");
assert.deepStrictEqual([seller.departedMatchLog[0].playerId, seller.departedMatchLog[0].pts], [p.id, 12]);
assert.strictEqual(p.trainingSecondsPlayedByPosition[p.position], 1500, "minutes de la semaine conservées");
const back = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(seller))));
assert.strictEqual(back.departedMatchLog.length, 1, "sauvegardé");
console.log("✅ Départ en cours de saison : feuille de match gardée par l'ancien club, minutes de la semaine conservées");

// Restauration des feuilles déjà vidées (départs antérieurs à l'archivage).
{
  const lg2 = E.generateLeague(E.generateStartingRoster("Club"));
  const T = lg2.teams[0], U = lg2.teams[1];
  const qs = { home: [20, 20, 20, 20], away: [18, 18, 18, 18] };
  T.players.forEach(p => { p.matchLog = [{ round: 0, competition: "championship", min: 20, pts: 5, quarterScores: qs }]; });
  // Parti avant le correctif : sa ligne est restée chez lui, sans club.
  const gone = T.players.pop();
  gone.matchLog = [{ round: 0, competition: "championship", min: 31, pts: 17, quarterScores: qs }];
  gone.historyLog = [{ type: "transfer", from: T.name, to: U.name }];
  U.players.push(gone);
  // Un autre joueur venu de T mais dont la ligne est d'un autre match : ignorée.
  const other = U.players[0];
  other.matchLog = [{ round: 0, competition: "championship", min: 30, pts: 30, quarterScores: { home: [1, 1, 1, 1], away: [2, 2, 2, 2] } }];
  other.historyLog = [{ type: "transfer", from: T.name, to: U.name }];
  const before = JSON.stringify(gone.matchLog);
  const r1 = E.restoreDepartedMatchLogs([lg2]);
  assert.strictEqual(T.departedMatchLog.length, 1, "ligne du joueur parti rendue à son ancien club");
  assert.deepStrictEqual([T.departedMatchLog[0].playerId, T.departedMatchLog[0].pts, T.departedMatchLog[0].min], [gone.id, 17, 31], "statistiques d'origine, rien d'inventé");
  assert.strictEqual(JSON.stringify(gone.matchLog), before, "journal du joueur inchangé");
  assert.strictEqual(r1.length, 1);
  E.restoreDepartedMatchLogs([lg2]);
  assert.strictEqual(T.departedMatchLog.length, 1, "pas de doublon au second passage");
  console.log("✅ Restauration : feuilles de match rendues à l'ancien club (données d'origine, sans doublon)");
}
