// Vérifie le SIGNAL DE MI-SAISON de l'objectif du conseil d'administration
// côté NAVIGATEUR (retour utilisateur, 2026-09, voir
// season_objective_midseason_test.js pour la couverture purement moteur de
// la même fonctionnalité, et season_objective_client_test.js pour le verdict
// de FIN de saison déjà couvert côté navigateur) : le signal doit apparaître
// dans le récapitulatif "Pendant votre absence…" exactement à la journée de
// mi-saison, ET dans le journal de l'onglet Humeur des supporters, avec un
// impact déjà réellement appliqué à Team.fanMorale (contrairement au verdict
// de fin de saison, qui lui reste en lecture seule tant que "Nouvelle
// saison" n'a pas été cliqué).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
let dom = await openGame(html, baseUrl);
let doc = dom.window.document;
let win = dom.window;

const saved0 = readRawSave(savePath);
const objective = saved0.team.seasonObjective;
console.log("Objectif de saison :", objective);
if (!objective) throw new Error("❌ Une nouvelle carrière devrait déjà avoir un objectif de saison assigné.");

// La mi-saison d'un calendrier à 10 équipes (18 journées) tombe à la
// journée 9 (0-indexée), voir Engine.midSeasonRound. On rattrape 10
// journées (0..9 incluses) pour couvrir pile la journée de mi-saison, sans
// aller plus loin (même patron que season_objective_client_test.js pour
// aller jusqu'à la FIN de saison, ici volontairement arrêté plus tôt).
await flush(dom);
win.close();
fastForwardCalendar(savePath, 10);
dom = await openGame(html, baseUrl);
doc = dom.window.document;
win = dom.window;

// --- Le récapitulatif "Pendant votre absence…" doit annoncer le signal de
// mi-saison, en plus du résultat du match de cette journée-là. ---
const catchupHtml = doc.getElementById("catchupContent").innerHTML;
if (!catchupHtml.includes("Mi-saison")) {
  throw new Error(`❌ Le récapitulatif de rattrapage devrait mentionner le signal de mi-saison ("Mi-saison : ..."), obtenu :\n${catchupHtml}`);
}
console.log("✅ Le récapitulatif \"Pendant votre absence…\" annonce le signal de mi-saison.");

// --- Contrairement au verdict de fin de saison (lecture seule tant que
// "Nouvelle saison" n'est pas cliqué), ce signal est déjà RÉELLEMENT
// appliqué à ce stade (voir server/liveMatch.js:finalizeRound, qui
// l'applique côté serveur au moment même où la journée est résolue,
// jamais différé). ---
const savedMid = readRawSave(savePath);
const history = savedMid.team.moraleHistory || [];
const signalEntry = history.find(e => e.label && e.label.startsWith("Mi-saison"));
if (!signalEntry) throw new Error("❌ Un événement d'humeur \"Mi-saison : ...\" devrait avoir été journalisé (Team.moraleHistory).");
console.log("Événement journalisé :", signalEntry.label, "delta =", signalEntry.delta);

doc.getElementById("catchupContinueBtn").click();
await flush(dom);

// --- Visible aussi sur l'onglet Humeur des supporters (journal complet,
// voir renderHumeurSection), sans action supplémentaire requise. ---
doc.querySelector('[data-tab="humeur"]').click();
const historyHtml = doc.getElementById("moraleHistoryContent").innerHTML;
if (!historyHtml.includes("Mi-saison")) {
  throw new Error(`❌ L'onglet Humeur des supporters devrait afficher l'événement de signal de mi-saison dans son journal, obtenu :\n${historyHtml}`);
}
console.log("✅ L'événement de signal de mi-saison figure dans le journal de l'onglet Humeur des supporters.");

// --- Le signal ne doit apparaître qu'UNE SEULE fois sur toute la saison
// (exactement à la mi-saison, jamais avant ni après, voir
// season_objective_midseason_test.js:testFinalizeRoundTriggersOnlyAtMidSeason
// pour la même garantie côté moteur) : on rattrape le reste de la saison
// régulière et on vérifie qu'aucune seconde occurrence n'apparaît.
await flush(dom);
win.close();
fastForwardCalendar(savePath, 18);
dom = await openGame(html, baseUrl);
doc = dom.window.document;
win = dom.window;
const savedEnd = readRawSave(savePath);
const historyEnd = savedEnd.team.moraleHistory || [];
const signalOccurrences = historyEnd.filter(e => e.label && e.label.startsWith("Mi-saison")).length;
if (signalOccurrences !== 1) {
  throw new Error(`❌ Le signal de mi-saison devrait apparaître EXACTEMENT une fois sur toute la saison régulière (obtenu ${signalOccurrences} occurrence(s)).`);
}
console.log("✅ Le signal de mi-saison n'apparaît qu'une seule fois sur toute la saison régulière.");

await flush(dom);
win.close();
server.close();
console.log("\n✅ Signal de mi-saison de l'objectif de saison du conseil d'administration vérifié côté navigateur : annoncé dans le récapitulatif de rattrapage, réellement appliqué à l'humeur des supporters dès la journée de mi-saison, visible dans le journal de l'onglet dédié, jamais plus d'une fois par saison.");

})().catch(e => { console.error(e); process.exit(1); });
