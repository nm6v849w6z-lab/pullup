// Mission live 2026-10-10 — « un seul live par match » (serveur) : le direct
// d'un match est calculé avec une graine STABLE dérivée de son identité
// (server/liveMatch.js:liveMatchSeed). Deux calculs du même match (perte du
// direct stocké, cache périmé, double calcul concurrent) donnent EXACTEMENT
// la même chronologie : mêmes événements, même ordre, mêmes horaires, même
// score, mêmes statistiques. Un autre match → une autre graine.
const assert = require("assert");
const path = require("path");
const Engine = require(path.join(__dirname, "engine.js"));
const LiveMatch = require(path.join(__dirname, "server/liveMatch.js"));
const ok = m => console.log("✅ " + m);

const KICK = Date.UTC(2026, 9, 10, 18, 0, 0);
const lg = Engine.generateLeague(Engine.generateStartingRoster("Chrono Test"), 1, KICK);
const m0 = lg.matchesForRound(0)[0];
const m1 = lg.matchesForRound(1)[0];
const clone = o => JSON.parse(JSON.stringify(o));
const a = LiveMatch.computeLiveMatch(Engine, lg, 0, m0.home, m0.away, KICK, "championship");
const b = LiveMatch.computeLiveMatch(Engine, lg, 0, m0.home, m0.away, KICK, "championship");
assert.ok(a.events.length > 100, "match simulé");
assert.strictEqual(a.seed, b.seed, "même graine pour le même match");
assert.deepStrictEqual(clone(a.events), clone(b.events), "même chronologie (événements, ordre, horaires, textes)");
assert.deepStrictEqual(a.finalScore, b.finalScore, "même score");
assert.deepStrictEqual(clone(a.boxScoreA), clone(b.boxScoreA), "mêmes statistiques");
ok(`Même match calculé deux fois : chronologie identique (${a.events.length} événements, ${a.finalScore.home}-${a.finalScore.away}).`);
const c = LiveMatch.computeLiveMatch(Engine, lg, 1, m1.home, m1.away, KICK + 86400e3, "championship");
assert.notStrictEqual(c.seed, a.seed, "autre match : autre graine");
ok("Autre match : autre graine, donc autre chronologie.");
console.log("\n🏁 live_chronology_determinism_test.js : un seul live par match.");
