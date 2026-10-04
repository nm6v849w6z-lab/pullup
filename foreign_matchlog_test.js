// Recrue venue d'un autre championnat (retour utilisateur 2026-10-03) : ses
// matchs de championnat joués là-bas ne comptent pas dans sa nouvelle ligue
// (leaders, fiche, feuilles de match). Nettoyage des sauvegardes existantes
// au chargement + historique remis à zéro lors d'un transfert entre ligues.
const assert = require("assert");
const Engine = require("./engine.js");

const lg = Engine.generateLeague(Engine.generateStartingRoster("Gotham"));
lg.results = [0, 1, 2].map(round => ({ round, home: 0, away: 1, scoreHome: 80, scoreAway: 70 }));
const team = lg.teams[0];
const [native, recruit] = team.players;
native.matchLog = [0, 1, 2].map(round => ({ round, competition: "championship", min: 30, pts: 10, quarterScores: { home: [20, 20, 20, 20], away: [20, 20, 15, 15] } }));
const nativeCount = native.matchLog.length;
// Recrue d'ailleurs : lignes de championnat aux mêmes journées, autres scores.
recruit.matchLog = [0, 1, 2].map(round => ({ round, competition: "championship", min: 30, pts: 25, quarterScores: { home: [1, 1, 1, 2], away: [3, 3, 3, 4] } }));
const reloaded = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(lg))));
const t2 = reloaded.teams[0];
assert.strictEqual(t2.players.find(p => p.id === recruit.id).matchLog.length, 0, "lignes d'un autre championnat retirées");
assert.strictEqual(t2.players.find(p => p.id === recruit.id).archivedMatchLog.length, 3, "mises de côté, pas supprimées");
assert.strictEqual(t2.players.find(p => p.id === native.id).matchLog.length, nativeCount, "lignes de cette ligue gardées");
console.log("✅ Matchs d'un autre championnat retirés au chargement, ceux de la ligue gardés");
