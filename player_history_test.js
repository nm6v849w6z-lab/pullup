// Historique du joueur et suivi des blessures (retour utilisateur
// 2026-10-03) : journaux portés par le joueur (engine.js : recordPlayerEvent,
// recordPlayerInjury), alimentés par les transferts, la promotion de
// l'académie, les gros matchs et Team.recordInjury ; sauvegardés avec lui.
const E = require("./engine.js");
const assert = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };
const T0 = Date.UTC(2026, 8, 28, 9);
const lg = E.generateMultiManagerLeague(["A", "B"], 1, T0);
const [a, b] = lg.teams.filter(t => t.isHuman);
a.budget = 1e9;
const p = b.players[0];
const r = E.transferPlayerBetweenTeams(b, a, p.id, 50000, T0);
assert(r.result === "sold" && p.historyLog[0].type === "transfer" && p.historyLog[0].from === b.name && p.historyLog[0].to === a.name && p.historyLog[0].fee === 50000, "transfert enregistré dans l'historique du joueur");
// Blessure : suivie sur le joueur (pros et jeunes).
p.injuryUntil = T0 + 5 * 864e5;
a.recordInjury({ at: T0, playerId: p.id, playerName: p.name, injuryType: "Entorse", days: 5, opponentName: b.name });
assert(p.injuryHistory.length === 1 && p.injuryHistory[0].type === "Entorse" && p.injuryHistory[0].opponent === b.name && p.injuryHistory[0].club === a.name, "blessure suivie sur le joueur");
const y = (a.youthPlayers || [])[0];
if (y) {
  a.recordInjury({ at: T0, playerId: y.id, playerName: y.name, injuryType: "Contracture", days: 3, opponentName: null, friendly: true });
  assert(y.injuryHistory.length === 1 && y.injuryHistory[0].friendly, "blessure d'un jeune en amical suivie sur le jeune");
}
// Gros match.
p.secondsPlayed = 1800;
p.stats = { pts: 31, reb: 3, ast: 2, stl: 7, blk: 0, tov: 0, pf: 0, fgm2: 10, fga2: 15, fgm3: 3, fga3: 6, ftm: 2, fta: 2, oreb: 0, dreb: 3 };
a.players.filter(x => x !== p).forEach(x => { x.secondsPlayed = 0; });
E.recordMatchStatsForTeam(a, 3, "championship", T0 + 864e5);
const games = p.historyLog.filter(e => e.type === "game");
assert(games.some(e => e.stat === "pts" && e.value === 31) && games.some(e => e.stat === "stl" && e.value === 7), "gros match (31 pts, 7 interceptions) enregistré");
// Sauvegarde.
const back = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(a)))).players.find(x => x.id === p.id);
assert(back.historyLog.length === p.historyLog.length && back.injuryHistory.length === 1, "historique et blessures conservés au rechargement");
console.log("\n✅ player_history_test.js : tout est vert");
