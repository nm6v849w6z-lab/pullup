// Ordres préparés à l'avance et joueur vendu depuis (retour utilisateur
// 2026-10-04) : le joueur parti ne reste pas titulaire du plan, son
// remplaçant désigné prend la place ; plan d'avant le correctif réparé à
// l'application.
const assert = require("assert");
const E = require("./engine.js");
const lg = E.generateLeague(E.generateStartingRoster("Club"));
const t = lg.teams[0], buyer = lg.teams[1];
t.isHuman = true; t.budget = 1e7; buyer.budget = 1e7;
const starter = t.players.find(p => p.id === t.lineup.starters["Meneur"]);
const backup = t.players.find(p => p.position === "Meneur" && p.id !== starter.id);
const plan = t.snapshotTactics();
plan.lineup.backupPositions = { [backup.id]: ["Meneur"] };
t.stagePlanForRound(3, plan, "championship");
// Plan d'avant le correctif : copie brute gardée pour l'application.
const stale = JSON.parse(JSON.stringify(t.plannedTactics));
E.transferPlayerBetweenTeams(t, buyer, starter.id, 1000, Date.now());
const key = Object.keys(t.plannedTactics)[0];
assert.strictEqual(t.plannedTactics[key].lineup.starters["Meneur"], backup.id, "remplaçant promu dans le plan");
t.plannedTactics = stale;
t.applyPlannedTacticsForRound(3, "championship");
assert.ok(t.hasValidLineup(), "plan ancien réparé à l'application : " + t.missingStarterPositions().join(","));
console.log("✅ Joueur vendu : retiré des ordres préparés, remplaçant promu, pas de forfait");
