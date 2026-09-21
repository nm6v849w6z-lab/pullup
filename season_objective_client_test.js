// Vérifie l'objectif de saison du conseil d'administration côté NAVIGATEUR
// (retour utilisateur, 2026-09, voir season_objective_test.js pour la
// couverture purement moteur de la même fonctionnalité) : l'objectif est
// visible sur l'onglet Humeur des supporters dès une nouvelle carrière, le
// verdict s'affiche sur l'écran de fin de saison une fois la saison
// entièrement jouée, et cliquer "Nouvelle saison" applique réellement
// l'impact sur l'humeur des supporters (Team.fanMorale/moraleHistory) tout
// en assignant un nouvel objectif pour la saison qui commence.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
let dom = await openGame(html, baseUrl);
let doc = dom.window.document;
let win = dom.window;

// --- Nouvelle carrière : un objectif devrait déjà être assigné, visible
// sur l'onglet Humeur des supporters. ---
const saved0 = readRawSave(savePath);
const objectiveAtStart = saved0.team.seasonObjective;
console.log("Objectif de saison au départ :", objectiveAtStart);
if (!objectiveAtStart) throw new Error("❌ Une nouvelle carrière devrait déjà avoir un objectif de saison assigné.");

doc.querySelector('[data-tab="humeur"]').click();
const objectiveText = doc.getElementById("seasonObjectiveValue").textContent;
console.log("Texte affiché sur l'onglet Humeur des supporters :", objectiveText);
if (!objectiveText || objectiveText === "Pas encore fixé") {
  throw new Error(`❌ L'objectif devrait être affiché en toutes lettres sur l'onglet Humeur des supporters (obtenu "${objectiveText}").`);
}

// --- Joue toute la saison régulière + barrage + play-offs (même patron que
// promotion_test.js). ---
await flush(dom);
win.close();
fastForwardCalendar(savePath, 24);
dom = await openGame(html, baseUrl);
doc = dom.window.document;
win = dom.window;
doc.getElementById("catchupContinueBtn").click();
await flush(dom);

const saved1 = readRawSave(savePath);
if (!saved1.league.playoffs || saved1.league.playoffs.champion == null) {
  throw new Error("❌ Les play-offs devraient être entièrement joués (champion connu) à la fin de la saison.");
}
const moraleBefore = saved1.team.fanMorale;
const historyLengthBefore = (saved1.team.moraleHistory || []).length;
console.log(`\nHumeur des supporters avant "Nouvelle saison" : ${moraleBefore}`);

// --- Le verdict de l'objectif de saison doit être annoncé sur l'écran de
// fin de saison (lecture seule, aucun impact tant qu'on ne clique pas
// "Nouvelle saison", voir seasonObjectiveVerdict, fonction pure). ---
const verdictEl = doc.querySelector(".season-objective-verdict");
if (!verdictEl) throw new Error("❌ Le verdict de l'objectif de saison devrait être affiché sur l'écran de fin de saison.");
console.log("Verdict affiché :", verdictEl.textContent);
const verdictClass = ["missed", "met", "exceeded"].find(c => verdictEl.classList.contains(c));
if (!verdictClass) throw new Error("❌ Le verdict devrait porter l'une des classes missed/met/exceeded.");

// Aucun impact tant qu'on n'a pas cliqué "Nouvelle saison" : re-générer
// l'écran (un simple re-rendu, voir renderSeasonEnd) ne doit rien muter.
const saved1b = readRawSave(savePath);
if (saved1b.team.fanMorale !== moraleBefore || (saved1b.team.moraleHistory || []).length !== historyLengthBefore) {
  throw new Error("❌ Afficher le verdict (lecture seule) ne devrait avoir AUCUN effet tant que 'Nouvelle saison' n'est pas cliqué.");
}

// --- "Nouvelle saison" : l'impact doit être réellement appliqué, UNE SEULE
// FOIS au total sur la saison (retour utilisateur, 2026-09, ultérieur : "il
// ne faut pas qu'un signal et pas deux [...] la fin de la saison régulière
// correspond à la fin de la saison pour ces équipes là") : une équipe de
// milieu de tableau ou reléguée directement (ni play-offs ni barrage) a déjà
// reçu ce même verdict dès la fin de la saison régulière (voir
// Team.seasonObjectiveVerdictSettled, journalisée alors sous ce même
// libellé) et ne doit PAS le voir réappliqué ici ; seule une équipe dont le
// sort dépendait encore des play-offs/du barrage le reçoit pour la première
// fois à ce clic. ---
const alreadySettled = !!saved1.team.seasonObjectiveVerdictSettled;
console.log("Verdict déjà réglé avant ce clic (milieu de tableau/relégation directe) :", alreadySettled);
doc.getElementById("newSeasonBtn").click();
await flush(dom);
const saved2 = readRawSave(savePath);
const historyAfter = saved2.team.moraleHistory || [];
if (alreadySettled) {
  if (historyAfter.length !== historyLengthBefore || saved2.team.fanMorale !== moraleBefore) {
    throw new Error(`❌ RÉGRESSION (double signal) : le verdict avait déjà été appliqué dès la fin de la saison régulière, "Nouvelle saison" n'aurait rien dû réappliquer (obtenu ${historyAfter.length} entrées au lieu de ${historyLengthBefore}, humeur ${saved2.team.fanMorale} au lieu de ${moraleBefore}).`);
  }
  console.log("✅ Équipe de milieu de tableau/reléguée directement : verdict déjà réglé dès la fin de la saison régulière, pas réappliqué une seconde fois au clic sur \"Nouvelle saison\".");
} else {
  if (historyAfter.length !== historyLengthBefore + 1) {
    throw new Error(`❌ Un nouvel événement d'humeur (le verdict de l'objectif) devrait avoir été journalisé (obtenu ${historyAfter.length} entrées, attendu ${historyLengthBefore + 1}).`);
  }
  const newEntry = historyAfter[0]; // recordMoraleEvent insère en tête (unshift)
  console.log("Nouvel événement journalisé :", newEntry.label, "delta =", newEntry.delta);
  if (verdictClass === "missed" && newEntry.delta >= 0) {
    throw new Error(`❌ Un objectif manqué devrait journaliser un delta négatif (obtenu ${newEntry.delta}).`);
  }
  if (verdictClass === "exceeded" && newEntry.delta <= 0) {
    throw new Error(`❌ Un objectif dépassé devrait journaliser un delta positif (obtenu ${newEntry.delta}).`);
  }
  console.log(`✅ Le signe du delta journalisé correspond au verdict affiché (${verdictClass}).`);
}

// --- La nouvelle saison doit avoir réassigné un objectif frais (jamais
// laissé vide ni figé sur celui de la saison précédente). ---
const newObjective = saved2.team.seasonObjective;
console.log("Objectif de la nouvelle saison :", newObjective);
if (!newObjective) throw new Error("❌ La nouvelle saison devrait avoir un objectif fraîchement assigné.");

// --- Persistance : rechargement complet de la page. ---
win.close();
const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;
doc2.querySelector('[data-tab="humeur"]').click();
const objectiveTextReloaded = doc2.getElementById("seasonObjectiveValue").textContent;
console.log("Objectif affiché après rechargement :", objectiveTextReloaded);
if (objectiveTextReloaded === "Pas encore fixé") throw new Error("❌ L'objectif devrait survivre au rechargement complet de la page.");

await flush(dom2);
win2.close();
server.close();
console.log("\n✅ Objectif de saison du conseil d'administration vérifié côté navigateur : affiché dès une nouvelle carrière, verdict annoncé (lecture seule) à l'écran de fin de saison, impact réel sur l'humeur des supporters appliqué au clic sur 'Nouvelle saison', nouvel objectif réassigné pour la saison suivante, persistance au rechargement.");

})().catch(e => { console.error(e); process.exit(1); });
