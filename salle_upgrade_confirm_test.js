// Vérifie la confirmation avant achat/amélioration d'une infrastructure de
// l'onglet 🏟️ Salle (retour utilisateur, 2026-09, reprenant les points
// suggérés dans un échange externe collé par l'utilisateur puis explicitement
// confirmés : "oui reprends les points dans le bloc stp") — voir
// showUpgradeConfirm dans moteurbasket3.html, réutilisée par les 3 points
// d'appel (agrandissement de la salle, boutique des supporters,
// CLUB_FACILITIES). Couvre les 3 cas demandés explicitement :
//   1. Fonds insuffisants : bouton "Valider" désactivé + montant manquant affiché.
//   2. Palier déjà maximum : un badge "Max" remplace la carte d'action, sans dialogue.
//   3. Infrastructure jamais construite (niveau 0) : libellé "Construire" au
//      lieu d'"Améliorer".
// Vérifie aussi que "Annuler" ferme la confirmation sans rien acheter, et
// qu'une confirmation acceptée applique bien l'achat (cas déjà couvert côté
// achat lui-même par club_facilities_test.js/tabs_test.js, revérifié ici
// pour la boutique des supporters).
// Retour utilisateur (2026-09, suite) : "je ne veux voir que l'état actuel
// [...] une petite flèche sur la brique pour upgrader l'installation" — les
// cartes n'affichent plus qu'un aperçu du palier ACTUEL, la confirmation
// s'ouvrant désormais via la flèche dédiée (.facility-upgrade-arrow) plutôt
// qu'au clic sur la carte entière.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

function clickTab(key) {
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click();
}
clickTab("salle");

// Agrandissement de la salle : plus de palier ni de confirmation depuis le
// 2026-09-27 (places ajoutées librement par type de gradin, voir
// arena_seats_test.js). Ce fichier ne couvre plus que les autres
// infrastructures.

// ---------------------------------------------------------------------
// 4) Infrastructure jamais construite (niveau 0, ex. gym) : le libellé
//    d'action de la confirmation est "Construire", pas "Améliorer".
// ---------------------------------------------------------------------
win.eval("teamA.arenaLevel = 1; teamA.facilityLevels = { tvStation: 0, gym: 0, wellness: 0 }; teamA.budget = 100000000;");
win.eval("renderSalleSection();");
win.eval('showFacilityModal("gym")');
// Les infrastructures s'ouvrent désormais depuis la vue quartier, dans une fenêtre.
const modalFor = k => { win.eval(`showFacilityModal("${k}")`); return doc.getElementById("facilityModalOverlay"); };
const otherHolder = modalFor("gym");
const gymCard = otherHolder.querySelector('[data-facility-card="gym"]');
if (!gymCard) throw new Error("❌ (setup) carte de la salle de musculation introuvable.");
if (!gymCard.textContent.includes("Aucune salle de musculation")) {
  throw new Error("❌ Au niveau 0, la carte devrait afficher l'état actuel (\"Aucune salle de musculation\"), pas un aperçu du premier palier payant.");
}
const gymArrow = gymCard.querySelector(".facility-upgrade-arrow");
if (!gymArrow) throw new Error("❌ (setup) flèche d'amélioration de la salle de musculation introuvable.");
gymArrow.click();
overlay = doc.getElementById("upgradeConfirmOverlay");
if (!overlay) throw new Error("❌ Cliquer sur la flèche de la salle de musculation (niveau 0) devrait ouvrir une confirmation.");
console.log("Titre de la confirmation (infrastructure jamais construite) :", doc.querySelector("#upgradeConfirmOverlay h3").textContent);
if (!doc.querySelector("#upgradeConfirmOverlay h3").textContent.includes("Construire")) {
  throw new Error("❌ Une infrastructure jamais construite (niveau 0) devrait afficher \"Construire\", pas \"Améliorer\", dans le titre de la confirmation.");
}
doc.getElementById("upgradeConfirmValidate").click();
if (win.eval("teamA.facilityLevels.gym") !== 1) throw new Error("❌ Valider la confirmation aurait dû construire le premier palier de la salle de musculation.");
console.log("✅ Infrastructure jamais construite : libellé \"Construire\" (pas \"Améliorer\"), achat bien appliqué après validation.");

// --- Une fois construite (niveau > 0), le libellé redevient "Améliorer". ---
win.eval("renderSalleSection();");
const gymCard2 = otherHolder.querySelector('[data-facility-card="gym"]');
if (!gymCard2 || !gymCard2.textContent.includes("Salle basique")) {
  throw new Error("❌ (setup) après le 1er achat, la carte devrait afficher l'état actuel (\"Salle basique\", palier 1).");
}
const gymArrow2 = gymCard2.querySelector(".facility-upgrade-arrow");
if (!gymArrow2) throw new Error("❌ (setup) flèche d'amélioration (2e palier) de la salle de musculation introuvable.");
gymArrow2.click();
if (!doc.querySelector("#upgradeConfirmOverlay h3").textContent.includes("Améliorer")) {
  throw new Error("❌ Une infrastructure déjà construite (niveau > 0) devrait afficher \"Améliorer\", pas \"Construire\".");
}
console.log("✅ Infrastructure déjà construite (niveau > 0) : libellé \"Améliorer\".");
doc.getElementById("upgradeConfirmCancel").click();

// ---------------------------------------------------------------------
// 5) Boutique des supporters : mêmes garanties (Construire au niveau 0,
//    confirmation avant achat, application après Valider).
// ---------------------------------------------------------------------
win.eval("teamA.fanShopLevel = 0; teamA.budget = 100000000;");
win.eval("renderSalleSection();");
win.eval('showFacilityModal("fanShop")');
const shopCard = doc.getElementById("facilityModalOverlay").querySelector("[data-fan-shop-card]");
if (!shopCard) throw new Error("❌ (setup) carte de la boutique des supporters introuvable.");
if (!shopCard.textContent.includes("Aucune boutique")) {
  throw new Error("❌ Au niveau 0, la carte devrait afficher l'état actuel (\"Aucune boutique\"), pas un aperçu du premier palier payant.");
}
const shopArrow = shopCard.querySelector(".facility-upgrade-arrow");
if (!shopArrow) throw new Error("❌ (setup) flèche d'amélioration de la boutique des supporters introuvable.");
shopArrow.click();
if (!doc.querySelector("#upgradeConfirmOverlay h3").textContent.includes("Construire")) {
  throw new Error("❌ La boutique des supporters jamais construite (niveau 0) devrait afficher \"Construire\".");
}
doc.getElementById("upgradeConfirmValidate").click();
if (win.eval("teamA.fanShopLevel") !== 1) throw new Error("❌ Valider la confirmation aurait dû construire le premier palier de la boutique des supporters.");
console.log("✅ Boutique des supporters : libellé \"Construire\" au niveau 0, achat bien appliqué après validation.");

// ---------------------------------------------------------------------
// 6) Centre de formation (retour utilisateur, 2026-09 : "mets aussi un
//    systeme de fleche ici [...] comme ça à l'écran on a que le niveau du
//    centre actuelle") : même carte état-actuel + flèche d'amélioration,
//    directement dans l'onglet Salle, sans passer par l'onglet Académie.
//    La salle de formation démarre toujours au niveau 1 (jamais 0, voir
//    Team.trainingCenterLevel), donc toujours "Améliorer", jamais
//    "Construire".
// ---------------------------------------------------------------------
win.eval("teamA.trainingCenterLevel = 1; teamA.budget = 100000000;");
win.eval("renderSalleSection();");
const tcCard = modalFor("trainingCenter").querySelector("[data-training-center-card]");
if (!tcCard) throw new Error("❌ (setup) carte du centre de formation introuvable dans l'onglet Salle.");
if (!tcCard.textContent.includes("Centre de formation")) throw new Error("❌ La carte devrait mentionner le Centre de formation.");
if (!tcCard.textContent.includes(win.eval("trainingCenterInfo(1).name"))) {
  throw new Error("❌ La carte devrait afficher le palier ACTUEL du centre de formation.");
}
const tcArrow = tcCard.querySelector(".facility-upgrade-arrow");
if (!tcArrow) throw new Error("❌ (setup) flèche d'amélioration du centre de formation introuvable.");
tcArrow.click();
overlay = doc.getElementById("upgradeConfirmOverlay");
if (!overlay) throw new Error("❌ Cliquer sur la flèche du centre de formation devrait ouvrir une confirmation.");
if (!doc.querySelector("#upgradeConfirmOverlay h3").textContent.includes("Améliorer")) {
  throw new Error("❌ Le centre de formation démarre toujours au niveau 1 : le titre devrait dire \"Améliorer\", jamais \"Construire\".");
}
doc.getElementById("upgradeConfirmValidate").click();
if (win.eval("teamA.trainingCenterLevel") !== 2) throw new Error("❌ Valider la confirmation aurait dû améliorer le centre de formation au palier 2.");
console.log("✅ Centre de formation : carte état-actuel + flèche d'amélioration dans l'onglet Salle, achat bien appliqué après validation.");

// --- Paliers maximum (boutique + centre de formation) : badge "Max".
// Mutations LOCALES uniquement (pas de saveMyTeam/sync), regroupées ici
// après les deux derniers VRAIS achats ci-dessus (sinon un futur sync
// embarquerait ces niveaux "Max" cosmétiques dans son instantané complet et
// corromprait la vérification de persistance plus bas (chaque sync envoie
// l'état COMPLET de l'équipe, pas seulement le champ modifié). ---
win.eval("teamA.fanShopLevel = FAN_SHOP_LEVELS[FAN_SHOP_LEVELS.length - 1].level;");
win.eval("renderSalleSection();");
const shopCardMax = modalFor("fanShop").querySelector("[data-fan-shop-card]");
if (!shopCardMax.querySelector(".facility-max-badge")) throw new Error("❌ La boutique des supporters au palier maximum devrait afficher un badge 'Max'.");
console.log("✅ Boutique des supporters au palier maximum : badge 'Max' affiché.");

win.eval("teamA.trainingCenterLevel = TRAINING_CENTER_LEVELS[TRAINING_CENTER_LEVELS.length - 1].level;");
win.eval("renderSalleSection();");
const tcCardMax = modalFor("trainingCenter").querySelector("[data-training-center-card]");
if (!tcCardMax.querySelector(".facility-max-badge")) throw new Error("❌ Le centre de formation au palier maximum devrait afficher un badge 'Max'.");
console.log("✅ Centre de formation au palier maximum : badge 'Max' affiché.");

await flush(dom);
const saved = readRawSave(savePath);
console.log("\nSauvegarde brute — facilityLevels.gym :", saved.team.facilityLevels && saved.team.facilityLevels.gym, "| fanShopLevel :", saved.team.fanShopLevel, "| trainingCenterLevel :", saved.team.trainingCenterLevel);
if (!saved.team.facilityLevels || saved.team.facilityLevels.gym !== 1) throw new Error("❌ L'achat de la salle de musculation via la confirmation devrait être persisté.");
if (saved.team.fanShopLevel !== 1) throw new Error("❌ L'achat de la boutique des supporters via la confirmation devrait être persisté.");
if (saved.team.trainingCenterLevel !== 2) throw new Error("❌ L'amélioration du centre de formation via la confirmation devrait être persistée (palier 2).");
console.log("✅ Les achats effectués via la confirmation sont bien persistés côté serveur.");

dom.window.close();
server.close();
console.log("\n🏁 Tous les tests de confirmation d'achat/amélioration de l'onglet Salle sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
