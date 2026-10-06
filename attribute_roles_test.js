// Audit des attributs (2026-10-06) : un rôle propre par attribut.
//  - Interceptions : pari défensif, plus fréquent quand l'Interception
//    dépasse la Défense extérieure ;
//  - Détermination : progression à l'entraînement et motivation après une
//    défaite (plus rien en match) ;
//  - génération corrélée par familles (écarts du type 81/38 rares).
// Les effets de match eux-mêmes sont mesurés par simulation (milliers de
// matchs, trop long pour un test) : voir DEV_NOTES.md.
const E = require("./engine.js");
const check = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };
const fake = attrs => ({ attrs, eff: k => attrs[k] });

const hunter = E.stealGambleRate(fake({ steal: 81, defOutside: 38 }));
const solid = E.stealGambleRate(fake({ steal: 80, defOutside: 80 }));
const weak = E.stealGambleRate(fake({ steal: 30, defOutside: 70 }));
check(hunter > solid * 3 && solid > weak, `pari : chasseur 81/38 ${hunter.toFixed(3)} > défenseur solide ${solid.toFixed(3)} > ${weak.toFixed(3)}`);

check(E.determinationTrainingMult({ attrs: { determination: 90 } }) > 1.2 && E.determinationTrainingMult({ attrs: { determination: 20 } }) < 0.9 && E.determinationTrainingMult({ attrs: {} }) === 1,
  "Détermination : progression à l'entraînement ×0,8 à ×1,25 (neutre sans valeur)");

const team = E.generateTeam("Moral", 0.9);
const hi = team.players[0], lo = team.players[1];
hi.attrs.determination = 90; lo.attrs.determination = 15; hi.form = 50; lo.form = 50;
team.players.slice(2).forEach(p => { p.attrs.determination = 50; p.form = 50; });
team.applyChemistryResult(70, 80);
check(hi.form > 50 && lo.form < 50 && team.players.slice(2).every(p => p.form === 50), `défaite : le déterminé se remobilise (${hi.form}), l'autre accuse le coup (${lo.form}), 50 = neutre`);
const f = hi.form; team.applyChemistryResult(80, 70);
check(hi.form === f, "victoire : motivation inchangée");

const ps = [];
for (let i = 0; i < 120; i++) ps.push(...E.generateTeam("G" + i, 0.92).players.filter(p => p.age > 21));
const xs = ps.map(p => p.attrs.steal), ys = ps.map(p => p.attrs.defOutside);
const m = a => a.reduce((s, v) => s + v, 0) / a.length, mx = m(xs), my = m(ys);
const r = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
const gap = ps.filter(p => p.attrs.steal - p.attrs.defOutside >= 35).length / ps.length;
check(r > 0.25 && gap < 0.04, `génération corrélée : corrélation Interceptions/Défense ext. ${r.toFixed(2)}, écarts ≥ 35 : ${(100 * gap).toFixed(1)} %`);
check(Object.values(E.ATTR_FAMILIES).flat().length === new Set(Object.values(E.ATTR_FAMILIES).flat()).size, "familles : chaque caractéristique dans une seule famille");

console.log("\n🏁 attribute_roles_test.js : tout est vert");
