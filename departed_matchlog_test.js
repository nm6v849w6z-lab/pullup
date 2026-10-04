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
