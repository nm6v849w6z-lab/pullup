// Retour utilisateur 2026-10-03 (« Pb là », classement en direct de la
// mi-temps) : les équipes exemptées de la journée (bye) apparaissaient avec
// leur id ("0", "8") au lieu de leur nom — `teams` ne contenait que les
// équipes qui jouaient. Toutes les équipes du classement doivent être nommées.
const assert = require("assert");
const Engine = require("../engine.js");
const Adapter = require("./showsAdapter.js");

const league = Engine.generateLeague(Engine.generateStartingRoster("Test FC"));
// Simule une journée avec exemptés : on retire un match de la journée.
const real = league.matchesForRound.bind(league);
league.matchesForRound = r => real(r).slice(1);

for (const input of [Adapter.buildHalftimeInput(league, 0, 0), Adapter.buildPrematchInput(league, 0, 0, Date.now())]) {
  input.standings.forEach(row => {
    const t = input.teams[row.teamId];
    assert.ok(t && t.name, `équipe ${row.teamId} sans nom`);
  });
}
console.log("✅ Émissions : toutes les équipes du classement ont un nom (exemptés compris)");
