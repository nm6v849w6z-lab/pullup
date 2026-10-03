// Recalcul unique des salaires au meilleur poste (2026-10-03).
const assert = require("assert");
const Engine = require("../engine.js");
const World = require("./world.js");
const lg = Engine.generateMultiManagerLeague(["Gotham Knights"], 1, Date.now());
const p = lg.teams[0].players[0];
p.salary = 1;
p.contractUntilSeason = 3;
p.nextSalary = 12345;
const n = World.applyBestPositionSalaries(lg);
assert.ok(n >= 1);
assert.strictEqual(p.salary, Engine.salaryForOverall(Engine.levelCoefficientFor(p.attrs, p.position).coefficient), "contrat en cours compris");
assert.strictEqual(p.nextSalary, 12345, "prolongation signée intacte");
assert.strictEqual(World.applyBestPositionSalaries(lg), 0, "idempotent");
console.log("✅ salary_best_position_test.js : tout est vert");
