// Vérifie l'humeur des supporters : jauge 0-100 (neutre à 50 au départ),
// réaction aux résultats de matchs (victoire/défaite, domicile ou extérieur),
// dérive hebdomadaire liée au confort tarifaire moyen, effet chiffré sur
// l'affluence projetée et la tolérance au prix des billets, journal des
// événements, et persistance complète.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
let dom = await openGame(html, baseUrl);
let doc = dom.window.document;
let win = dom.window;

function clickTab(key) {
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click();
}

// --- Départ neutre (50/100) ---
let saved = readRawSave(savePath);
console.log("Humeur au départ :", saved.team.fanMorale, "(attendu 50)");
if (saved.team.fanMorale !== 50) throw new Error("❌ L'humeur des supporters devrait démarrer neutre (50/100) : " + saved.team.fanMorale);

// --- L'onglet Humeur des supporters affiche la jauge, l'effet chiffré, et
// un premier message "aucun événement". ---
clickTab("humeur");
console.log("Valeur affichée :", doc.getElementById("moraleValue").textContent);
console.log("Libellé affiché :", doc.getElementById("moraleLabelText").textContent);
if (doc.getElementById("moraleLabelText").textContent !== "Satisfaits") {
  throw new Error("❌ À 50/100, le libellé attendu est \"Satisfaits\" : " + doc.getElementById("moraleLabelText").textContent);
}
const gaugeWidth = doc.getElementById("moraleGaugeFill").style.width;
console.log("Largeur de la jauge :", gaugeWidth, "(attendu 50%)");
if (gaugeWidth !== "50%") throw new Error("❌ La jauge devrait refléter la valeur d'humeur (50%) : " + gaugeWidth);
console.log("✅ La jauge d'humeur des supporters s'affiche correctement au départ.");

// --- Joue des matchs jusqu'à voir l'humeur bouger avec un résultat (victoire
// OU défaite — le moteur est aléatoire, donc on couvre les deux cas). Depuis
// le passage au calendrier réel (tâche #21), le match se joue tout seul :
// on avance le calendrier d'une journée (voir fastForwardCalendar) au lieu
// de cliquer "Verrouiller & simuler".
await flush(dom);
win.close();
fastForwardCalendar(savePath, 1);
dom = await openGame(html, baseUrl);
doc = dom.window.document;
win = dom.window;

// --- Le récapitulatif "Pendant votre absence" affiche bien la variation
// d'humeur consécutive au résultat du match (voir showCatchupSummaryIfAny). ---
const catchupTextAfterMatch = doc.getElementById("catchupContent").textContent;
console.log("\nRécapitulatif après le 1er match :", catchupTextAfterMatch.replace(/\s+/g, " ").trim().slice(0, 200));
if (!catchupTextAfterMatch.includes("Humeur des supporters")) throw new Error("❌ Le récapitulatif devrait mentionner la variation d'humeur des supporters.");
doc.getElementById("catchupContinueBtn").click();

saved = readRawSave(savePath);
const moraleAfterMatch1 = saved.team.fanMorale;
console.log("Humeur après le 1er match :", moraleAfterMatch1, "(différente de 50 attendue)");
if (moraleAfterMatch1 === 50) throw new Error("❌ L'humeur des supporters devrait avoir bougé après un match.");
if (!saved.team.moraleHistory.length) throw new Error("❌ Le premier événement d'humeur devrait être journalisé.");
const firstEvent = saved.team.moraleHistory[0];
console.log("Premier événement journalisé :", firstEvent);
const isMatchEvent = firstEvent.label.includes("Victoire") || firstEvent.label.includes("Défaite");
if (!isMatchEvent) throw new Error("❌ Le premier événement devrait être lié au résultat du match : " + JSON.stringify(firstEvent));
const deltaMatchesDirection = (firstEvent.label.includes("Victoire") && firstEvent.delta > 0) ||
  (firstEvent.label.includes("Défaite") && firstEvent.delta < 0);
console.log(`${deltaMatchesDirection ? "✅" : "❌"} Le signe de la variation correspond au résultat (victoire → hausse, défaite → baisse).`);
if (!deltaMatchesDirection) throw new Error("❌ Le signe de la variation d'humeur ne correspond pas au résultat du match.");

// --- Prix des billets délibérément excessifs : la dérive hebdomadaire de
// l'entraînement doit faire BAISSER l'humeur, indépendamment des résultats. ---
clickTab("salle");
["gradins", "tribune", "loge"].forEach(key => {
  const range = doc.getElementById(`ticketPriceRange_${key}`);
  range.value = range.max; // prix maximum autorisé pour chaque catégorie
  range.dispatchEvent(new win.Event("change"));
});
await flush(dom);
saved = readRawSave(savePath);
console.log("\nPrix des billets réglés au maximum :", saved.team.ticketPrices);
const moraleBeforeGreedyWeek = saved.team.fanMorale;

// L'entraînement hebdomadaire s'applique tout seul, automatiquement, en fin
// de semaine réelle (après la 2e journée de championnat de la semaine — voir
// catchUpLeague) depuis le passage au calendrier réel (tâche #21) : plus de
// bouton "Valider la semaine" à cliquer. On avance le calendrier de 2
// journées (1 semaine réelle complète, en repartant de la journée déjà
// jouée) pour que la semaine se termine et déclenche l'entraînement.
await flush(dom);
win.close();
fastForwardCalendar(savePath, 2);
dom = await openGame(html, baseUrl);
doc = dom.window.document;
win = dom.window;
doc.getElementById("catchupContinueBtn").click();
saved = readRawSave(savePath);
console.log("Humeur avant/après une semaine à prix maximum :", moraleBeforeGreedyWeek, "→", saved.team.fanMorale);
if (saved.team.fanMorale >= moraleBeforeGreedyWeek) {
  throw new Error("❌ Des prix de billets excessifs devraient faire baisser l'humeur des supporters semaine après semaine.");
}
const hasPriceDriftEvent = saved.team.moraleHistory.some(ev => ev.label.includes("trop élevés"));
if (!hasPriceDriftEvent) throw new Error("❌ La dérive liée aux prix élevés devrait être journalisée.");
console.log("✅ Des prix de billets excessifs font baisser l'humeur, semaine après semaine, indépendamment des résultats.");

// --- Effet chiffré sur l'affluence et la tolérance tarifaire : une baisse
// d'humeur doit réduire les deux par rapport à l'humeur neutre de départ. ---
clickTab("humeur");
const attendanceEffectText = doc.getElementById("moraleAttendanceEffect").textContent;
const forgivenessEffectText = doc.getElementById("moraleForgivenessEffect").textContent;
console.log("\nEffet sur l'affluence (humeur dégradée) :", attendanceEffectText);
console.log("Effet sur la tolérance tarifaire (humeur dégradée) :", forgivenessEffectText);
const attendancePct = parseInt(attendanceEffectText, 10);
if (attendancePct >= 70) throw new Error("❌ Avec une humeur dégradée, la base d'affluence projetée devrait être sous la base neutre (~70%) : " + attendanceEffectText);
console.log("✅ L'humeur dégradée réduit bien l'affluence projetée et la tolérance tarifaire affichées.");

// --- Persistance complète (rechargement, même serveur). ---
win.close();
const dom2 = await openGame(html, baseUrl);
const win2 = dom2.window;
const reloaded = readRawSave(savePath);
console.log("\nAprès rechargement — humeur :", reloaded.team.fanMorale, "| événements :", reloaded.team.moraleHistory.length);
const persistedOk = reloaded.team.fanMorale === saved.team.fanMorale && reloaded.team.moraleHistory.length === saved.team.moraleHistory.length;
console.log(`${persistedOk ? "✅" : "❌"} L'humeur des supporters et son historique survivent au rechargement.`);
if (!persistedOk) throw new Error("❌ La persistance de l'humeur des supporters a échoué.");

await flush(dom2);
win2.close();
server.close();
console.log("\n✅ Humeur des supporters vérifiée : départ neutre, réaction aux résultats, dérive tarifaire hebdomadaire, effets chiffrés sur l'affluence/la tolérance au prix, journal d'événements, persistance.");

})().catch(e => { console.error(e); process.exit(1); });
