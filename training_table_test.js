// Tableau d'aptitude par poste des entraînements des fondamentaux (retour
// utilisateur 2026-09-29) : mêmes chiffres dans engine.js et dans le jeu,
// affichés tels quels et appliqués au calcul réel.
const fs = require("fs");
const assert = require("assert");
const E = require("./engine.js");
const P = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];
const EXPECTED = {
  threePoint: [100,100,100,60,20], midRange: [100,100,100,80,40], inside: [20,30,50,100,100],
  pass: [100,90,75,60,40], rebound: [20,30,60,100,100], block: [10,20,40,90,100],
  dribble: [100,100,90,60,30], defOutside: [100,100,100,50,20], defInside: [20,30,50,100,100],
  freeThrow: [100,100,100,80,60], penetration: [100,100,100,60,30], shotCreation: [100,100,100,60,30],
  steal: [100,100,100,50,30],
  outsideShot: [100,100,100,70,30], playmaking: [100,90,85,55,25], allroundDef: [60,65,75,90,100],
  quickShots: [100,100,95,75,45], creativeScoring: [100,100,100,60,30], perimeterDefense: [100,100,100,45,20],
  rimAttack: [100,100,100,65,40],
};
assert.deepStrictEqual(Object.keys(EXPECTED).sort(), Object.keys(E.TRAINING_PROGRAMS).sort(), "tous les programmes du jeu doivent être dans le tableau");
for (const [k, row] of Object.entries(EXPECTED)) {
  P.forEach((pos, i) => assert.strictEqual(E.positionEfficiencyForProgram(k, pos), row[i], `${k} / ${pos}`));
}
console.log("✅ engine.js : les 20 entraînements reprennent exactement le tableau.");
// Miroir du jeu : même bloc de chiffres.
const grab = src => src.slice(src.indexOf("const TRAINING_POSITION_EFFICIENCY = {"), src.indexOf("};", src.indexOf("const TRAINING_POSITION_EFFICIENCY = {")));
assert.strictEqual(grab(fs.readFileSync("moteurbasket3.html", "utf8")), grab(fs.readFileSync("engine.js", "utf8")), "tableau différent entre engine.js et moteurbasket3.html");
console.log("✅ moteurbasket3.html : tableau identique à engine.js.");
console.log("\n🏁 Tableau d'entraînement des fondamentaux conforme.");
