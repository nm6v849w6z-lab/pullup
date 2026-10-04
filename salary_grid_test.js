// Grille salariale du 2026-10-04 (variante A validée par l'utilisateur) :
// inchangée jusqu'à 50 de niveau, hausse de plus en plus forte au-dessus ;
// contrats en cours intacts ; pas de demande d'augmentation due au seul
// changement de grille.
const assert = require("assert");
const E = require("./engine.js");
const old = E.legacySalaryForOverall;
let prevPct = -1;
for (const g of [30, 40, 50]) assert.strictEqual(E.salaryForOverall(g), old(g), `inchangé à ${g}`);
for (const g of [55, 60, 65, 70, 75, 80]) {
  const pct = E.salaryForOverall(g) / old(g) - 1;
  assert.ok(pct > prevPct, `hausse croissante avec le niveau (${g} : ${Math.round(pct * 100)} %)`);
  prevPct = pct;
}
for (let g = 1; g < 95; g++) assert.ok(E.salaryForOverall(g + 1) >= E.salaryForOverall(g), `croissante en ${g}`);
assert.deepStrictEqual([60, 65, 70, 75, 80].map(E.salaryForOverall), [11500, 17500, 27000, 43000, 68000], "paliers de la variante A");

// Contrat en cours : le salaire ne bouge pas au passage de saison.
const lg = E.generateLeague(E.generateStartingRoster("Club"));
const t = lg.teams[0];
const p = t.players[0];
p.salary = 1234; p.contractUntilSeason = 9; p.nextSalary = null;
t.recalculateSalaries();
assert.strictEqual(p.salary, 1234, "contrat en cours intact");

// Demande d'augmentation : ancienne grille pour un contrat d'avant le changement.
const star = t.players[1];
Object.keys(star.attrs).forEach(k => { star.attrs[k] = 80; });
delete star.salaryGrid;
assert.ok(E.askedSalary(star, true) < E.askedSalary(star), "ancienne grille plus basse pour une star");
E.signNewContract(star, 3, 1);
assert.strictEqual(star.salaryGrid, 2, "nouveau contrat marqué nouvelle grille");
assert.strictEqual(star.salary, E.askedSalary(star), "nouveau contrat au salaire de la nouvelle grille");
const back = E.playerFromSave(JSON.parse(JSON.stringify(E.serializePlayerRecord(star))));
assert.strictEqual(back.salaryGrid, 2, "sauvegardé");
console.log("✅ Grille salariale : bas inchangé, haut renforcé (hausse croissante), contrats en cours intacts");
