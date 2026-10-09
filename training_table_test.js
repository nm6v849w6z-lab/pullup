// Tableau d'aptitude par poste des entraînements des fondamentaux (retour
// utilisateur 2026-09-29) : mêmes chiffres dans engine.js et dans le jeu,
// affichés tels quels et appliqués au calcul réel.
const fs = require("fs");
const assert = require("assert");
const E = require("./engine.js");
const P = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];
const EXPECTED = {
  threePoint: [100,100,100,60,20], midRange: [100,100,100,80,40], inside: [20,30,50,100,100],
  pass: [100,100,100,100,80], rebound: [20,30,60,100,100], block: [10,20,40,90,100],
  dribble: [100,100,90,60,30], defOutside: [100,100,100,70,20], defInside: [20,30,80,100,100],
  freeThrow: [100,100,100,100,100], penetration: [100,100,100,60,30], shotCreation: [100,100,100,100,75],
  steal: [100,100,100,75,75],
  outsideShot: [100,100,100,70,30], playmaking: [100,90,85,55,25],
  quickShotsOutside: [100,100,100,55,25], quickShotsInside: [40,60,85,100,100],
  creativeScoring: [100,100,100,60,30], perimeterDefense: [100,100,100,45,20],
  rimAttack: [80,100,100,85,50],
  // Défense polyvalente : pas de ligne propre, chaque caractéristique suit la
  // sienne (DE / DI) — la valeur affichée est leur moyenne.
  allroundDef: [60,65,90,85,60],
};
assert.deepStrictEqual(Object.keys(EXPECTED).sort(), Object.keys(E.TRAINING_PROGRAMS).sort(), "tous les programmes du jeu doivent être dans le tableau");
for (const [k, row] of Object.entries(EXPECTED)) {
  P.forEach((pos, i) => assert.strictEqual(E.positionEfficiencyForProgram(k, pos), row[i], `${k} / ${pos}`));
}
// Défense polyvalente : chaque caractéristique garde sa propre ligne.
P.forEach((pos, i) => {
  assert.strictEqual(E.positionEfficiencyForProgramAttr("allroundDef", "defOutside", pos), EXPECTED.defOutside[i], `allroundDef/DE / ${pos}`);
  assert.strictEqual(E.positionEfficiencyForProgramAttr("allroundDef", "defInside", pos), EXPECTED.defInside[i], `allroundDef/DI / ${pos}`);
  assert.strictEqual(E.positionEfficiencyForProgramAttr("outsideShot", "threePoint", pos), EXPECTED.outsideShot[i], `outsideShot/3pts / ${pos}`);
});
// Lancer franc : dilution réduite de moitié, les autres inchangées.
[1, 2, 3, 4, 5].forEach(n => {
  assert.strictEqual(E.trainingDilutionFor("freeThrow", n), E.TRAINING_DILUTION_BY_POSITION_COUNT[n] / 2, `dilution LF ${n} postes`);
  assert.strictEqual(E.trainingDilutionFor("steal", n), E.TRAINING_DILUTION_BY_POSITION_COUNT[n], `dilution Interceptions ${n} postes`);
});
// Ancienne sauvegarde sur « Tirs rapides » → Tir rapide extérieur.
assert.strictEqual(E.TRAINING_PROGRAMS.quickShots, undefined);
console.log("✅ engine.js : les 21 entraînements reprennent exactement le tableau.");
// Miroir du jeu : même bloc de chiffres.
const grab = src => src.slice(src.indexOf("const TRAINING_POSITION_EFFICIENCY = {"), src.indexOf("};", src.indexOf("const TRAINING_POSITION_EFFICIENCY = {")));
assert.strictEqual(grab(require("./test_game_html.js").readGameHtml()), grab(fs.readFileSync("engine.js", "utf8")), "tableau différent entre engine.js et moteurbasket3.html");
console.log("✅ moteurbasket3.html : tableau identique à engine.js.");
console.log("\n🏁 Tableau d'entraînement des fondamentaux conforme.");
