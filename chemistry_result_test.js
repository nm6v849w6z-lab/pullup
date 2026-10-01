// Alchimie selon le résultat (retour utilisateur 2026-10-01 : « les
// victoires ne devraient pas impacter plus la cohésion ? ») : victoire +2
// (+3 à partir de 3 de suite), défaite −1 (−2 à partir de 3 de suite, −1 de
// plus au-delà de 20 points d'écart), jamais en amical ; série sauvegardée.
// Voir engine.js : Team.applyChemistryResult, recordMatchStatsAndAwardMvp.
const E = require("./engine.js");
const { generateStartingRoster, serializeTeam, teamFromSave, recordMatchStatsAndAwardMvp, CHEMISTRY_MATCH_TOGETHER_GAIN } = E;
function assert(c, m) { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); }

const t = generateStartingRoster("Soudés");
const seq = [[80, 70], [80, 70], [80, 70], [80, 70], [70, 80], [70, 80], [60, 90], [70, 80]];
const got = seq.map(([pf, pa]) => t.applyChemistryResult(pf, pa));
assert(JSON.stringify(got) === JSON.stringify([2, 2, 3, 3, -1, -1, -3, -2]), `séries : ${got.join(" ")}`);
assert(t.chemistryResultStreak === -4, "série de défaites suivie");
const r = teamFromSave(JSON.parse(JSON.stringify(serializeTeam(t))));
assert(r.chemistryResultStreak === -4, "série sauvegardée et rechargée");

// Branché sur un vrai match officiel (score par quart-temps), pas en amical.
const home = generateStartingRoster("Dom"), away = generateStartingRoster("Ext");
home.chemistry = 50; away.chemistry = 50;
const qs = { home: [25, 25, 25, 25], away: [20, 20, 20, 25] };
recordMatchStatsAndAwardMvp(home, away, 0, "championship", Date.UTC(2026, 9, 1), qs);
assert(home.chemistry === 50 + CHEMISTRY_MATCH_TOGETHER_GAIN + 2, `vainqueur : ${home.chemistry}`);
assert(away.chemistry === 50 + CHEMISTRY_MATCH_TOGETHER_GAIN - 1, `perdant : ${away.chemistry}`);
const h2 = generateStartingRoster("A"), a2 = generateStartingRoster("B");
h2.chemistry = 50; a2.chemistry = 50;
recordMatchStatsAndAwardMvp(h2, a2, -1, "friendly", Date.UTC(2026, 9, 1), qs);
assert(h2.chemistry === 50 + CHEMISTRY_MATCH_TOGETHER_GAIN && h2.chemistryResultStreak === 0, "amical : pas d'effet du résultat");
console.log("🏁 Alchimie selon le résultat : OK");
