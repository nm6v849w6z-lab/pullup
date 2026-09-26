// Alchimie : leviers à la hausse (retour utilisateur 2026-09-26 :
// "faisons la vivre davantage à la hausse, ça tire trop vers le bas là").
// Voir engine.js : CHEMISTRY_MATCH_TOGETHER_GAIN/CHEMISTRY_SAME_FIVE_GAIN,
// Team.updateChemistryAfterMatch (appelée par recordMatchStatsForTeam).
// Vérifie : +0,5 par match joué, +0,5 de plus si même cinq de départ qu'au
// match précédent, rien de plus si le cinq change, plafond 100, et
// lastStartersKey sauvegardé/rechargé.
const E = require("./engine.js");
const {
  generateStartingRoster, serializeTeam, teamFromSave, recordMatchStatsForTeam,
  CHEMISTRY_MATCH_TOGETHER_GAIN, CHEMISTRY_SAME_FIVE_GAIN, POSITIONS,
} = E;
const T0 = Date.UTC(2026, 8, 21);
const DAY = 24 * 3600 * 1000;

const team = generateStartingRoster("Soudés");
const setFive = ids => { team.lineup.starters = {}; POSITIONS.forEach((pos, k) => { team.lineup.starters[pos] = ids[k]; }); };
const five1 = team.players.slice(0, 5).map(p => p.id);
const five2 = team.players.slice(1, 6).map(p => p.id);
team.chemistry = 50;

setFive(five1);
recordMatchStatsForTeam(team, 0, "championship", T0);
if (team.chemistry !== 50 + CHEMISTRY_MATCH_TOGETHER_GAIN) throw new Error(`❌ 1er match : +${CHEMISTRY_MATCH_TOGETHER_GAIN} attendu, obtenu ${team.chemistry}.`);
recordMatchStatsForTeam(team, 1, "championship", T0 + DAY);
if (team.chemistry !== 50 + 2 * CHEMISTRY_MATCH_TOGETHER_GAIN + CHEMISTRY_SAME_FIVE_GAIN) throw new Error(`❌ Même cinq : bonus de stabilité attendu, obtenu ${team.chemistry}.`);
const before = team.chemistry;
setFive(five2);
recordMatchStatsForTeam(team, 2, "championship", T0 + 2 * DAY);
if (team.chemistry !== before + CHEMISTRY_MATCH_TOGETHER_GAIN) throw new Error(`❌ Cinq changé : seulement +${CHEMISTRY_MATCH_TOGETHER_GAIN} attendu, obtenu ${team.chemistry - before}.`);
console.log(`✅ +${CHEMISTRY_MATCH_TOGETHER_GAIN} par match, +${CHEMISTRY_SAME_FIVE_GAIN} de plus avec le même cinq (50 -> ${team.chemistry}).`);

// Sauvegarde : la stabilité du cinq survit à un rechargement.
const reloaded = teamFromSave(JSON.parse(JSON.stringify(serializeTeam(team))));
if (reloaded.lastStartersKey !== team.lastStartersKey) throw new Error("❌ lastStartersKey devrait être sauvegardé et rechargé.");
if (Math.abs(reloaded.chemistry - team.chemistry) > 1e-9) throw new Error("❌ La valeur (décimale) de l'alchimie devrait survivre à la sauvegarde.");
console.log("✅ Sauvegarde/rechargement : alchimie et cinq de départ conservés.");

// Plafond.
team.chemistry = 99.8;
recordMatchStatsForTeam(team, 3, "championship", T0 + 3 * DAY);
recordMatchStatsForTeam(team, 4, "championship", T0 + 4 * DAY);
if (team.chemistry !== 100) throw new Error(`❌ L'alchimie ne devrait jamais dépasser 100, obtenu ${team.chemistry}.`);
console.log("✅ Plafond 100 respecté.");
console.log("\n🏁 Alchimie à la hausse : tous les tests passent.");
