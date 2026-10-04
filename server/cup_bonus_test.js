// Primes de Coupe (retour utilisateur 2026-09-28, inspiré de BuzzerBeater) :
// finale 400 000 $, demie 200 000, quart 130 000, huitième 100 000,
// seizième 80 000, 32e 65 000, 64e et avant 50 000 — versées au club humain qui gagne
// son match de Coupe (un exempt ne rapporte rien). Recherche du monde :
// raccourcis « D.I », « D2.1 », « USA ».
const assert = require("assert");
const E = require("../engine.js");
const C = require("./calendar.js");
const W = require("./world.js");

assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7].map(E.cupWinBonusFor), [400000, 200000, 130000, 100000, 80000, 65000, 50000, 50000]);
const lg = E.generateMultiManagerLeague(["Lyon Coupe"], 1, Date.UTC(2026, 8, 27, 9), C.dailyAnchoredCalendarConfig());
const round = lg.pendingCupRound();
const idx = round.matches.findIndex(m => !m.bye);
const m = round.matches[idx];
const human = lg.teams[0];
// Le club humain joue et gagne ce match.
m.home = 0; if (m.away === 0) m.away = lg.teams.findIndex((t, i) => i > 0 && !round.matches.some(x => x.home === i || x.away === i)) || 5;
const before = human.budget;
lg.recordCupMatchResult(idx, 90, 70, false);
const stageFromEnd = E.CUP_STAGE_NAMES ? E.CUP_STAGE_NAMES.length - 1 - E.CUP_STAGE_NAMES.indexOf(round.name) : 3;
assert.strictEqual(human.budget - before, E.cupWinBonusFor(stageFromEnd));
assert.ok((human.transactions || human.transactionLog || []).length === 0 || JSON.stringify(human.transactions || human.transactionLog || []).includes("Prime de Coupe"));
console.log(`✅ Prime de Coupe versée au vainqueur humain (${round.name} : ${E.cupWinBonusFor(stageFromEnd).toLocaleString("fr-FR")} $).`);
// Un club de l'IA vainqueur ne touche rien (et ne plante pas).
const idx2 = round.matches.findIndex((x, i) => i !== idx && !x.bye);
if (idx2 !== -1) { const t = lg.teams[round.matches[idx2].home]; const b = t.budget; lg.recordCupMatchResult(idx2, 80, 60, false); if (!t.isHuman) assert.strictEqual(t.budget, b); }
console.log("✅ Rien pour un club de l'IA.");

const world = { summaries: {
  "fr-1": { id: "fr-1", country: "fr", level: 1, group: 0, label: "Division I", humans: 2, standings: [] },
  "fr-2.1": { id: "fr-2.1", country: "fr", level: 2, group: 0, label: "Division II.1", humans: 1, standings: [] },
  "us-1": { id: "us-1", country: "us", level: 1, group: 0, label: "Division I", humans: 0, standings: [] },
} };
const ids = q => W.searchWorld(world, q).leagues.map(l => l.id).sort().join(",");
assert.strictEqual(ids("D.I"), "fr-1,us-1");
assert.strictEqual(ids("D1"), "fr-1,us-1");
assert.strictEqual(ids("D2.1"), "fr-2.1");
assert.strictEqual(ids("II.1"), "fr-2.1");
assert.strictEqual(ids("USA"), "us-1");
assert.strictEqual(ids("i"), "");
console.log("✅ Recherche : « D.I », « D1 », « D2.1 », « II.1 », « USA ».");
console.log("\n🏁 cup_bonus_test.js : tout est vert");
