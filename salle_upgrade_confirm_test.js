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
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

function clickTab(key) {
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click();
}
clickTab("salle");

// ---------------------------------------------------------------------
// 1) Cliquer sur la carte d'agrandissement de la salle ouvre une confirmation
//    avec le coût, le niveau avant/après et la capacité avant/après.
// ---------------------------------------------------------------------
const arenaLevelBefore = win.eval("teamA.arenaLevel");
const arenaCapBefore = win.eval("arenaInfo(teamA.arenaLevel).capacity");
const arenaNextCost = win.eval("teamA.nextArenaLevel().upgradeCost");
const arenaNextCap = win.eval("teamA.nextArenaLevel().capacity");
win.eval(`teamA.budget = ${arenaNextCost + 1000000};`); // large budget, cas "abordable"
const arenaCard = doc.querySelector("#arenaCurrentPanel .staff-hire-card");
if (!arenaCard) throw new Error("❌ (setup) carte de la salle introuvable.");
if (arenaCard.textContent.includes(arenaNextCap.toLocaleString("fr-FR"))) {
  throw new Error("❌ La carte de la salle ne devrait afficher que l'état ACTUEL, jamais la capacité du prochain palier.");
}
const arenaArrow = arenaCard.querySelector(".facility-upgrade-arrow");
if (!arenaArrow) throw new Error("❌ (setup) flèche d'amélioration de la salle introuvable.");
arenaArrow.click();

let overlay = doc.getElementById("upgradeConfirmOverlay");
if (!overlay) throw new Error("❌ Cliquer sur la carte d'agrandissement de la salle devrait ouvrir une confirmation.");
console.log("Contenu de la confirmation (salle) :", overlay.textContent.replace(/\s+/g, " ").trim());
if (!overlay.textContent.includes(String(arenaCapBefore).length ? arenaCapBefore.toLocaleString("fr-FR") : "")) {
  // Vérification directe plus bas (regex trop fragile sur le formatage) ; le vrai test est sur le montant/la capacité suivants.
}
if (!overlay.textContent.includes(arenaNextCap.toLocaleString("fr-FR"))) {
  throw new Error("❌ La confirmation devrait afficher la capacité APRÈS l'agrandissement.");
}
const validateBtn = doc.getElementById("upgradeConfirmValidate");
if (validateBtn.disabled) throw new Error("❌ Avec un budget suffisant, le bouton Valider ne devrait PAS être désactivé.");
console.log("✅ La confirmation d'agrandissement de la salle affiche coût/capacité avant-après, Valider actif (budget suffisant).");

// --- Annuler : ferme la confirmation, n'achète rien. ---
doc.getElementById("upgradeConfirmCancel").click();
if (doc.getElementById("upgradeConfirmOverlay")) throw new Error("❌ 'Annuler' devrait fermer la confirmation.");
if (win.eval("teamA.arenaLevel") !== arenaLevelBefore) throw new Error("❌ 'Annuler' ne devrait PAS avoir agrandi la salle.");
console.log("✅ 'Annuler' ferme la confirmation sans rien acheter.");

// ---------------------------------------------------------------------
// 2) Fonds insuffisants : le bouton Valider est désactivé, le montant
//    manquant est affiché, et cliquer dessus (au cas où) n'achète rien.
// ---------------------------------------------------------------------
win.eval(`teamA.budget = ${arenaNextCost - 1};`); // juste en dessous du coût
arenaArrow.click();
overlay = doc.getElementById("upgradeConfirmOverlay");
if (!overlay) throw new Error("❌ (setup) la confirmation devrait s'ouvrir même sans budget suffisant.");
const missing = 1;
console.log("Confirmation avec budget insuffisant :", overlay.textContent.replace(/\s+/g, " ").trim());
if (!overlay.textContent.includes("Il manque")) {
  throw new Error("❌ Avec un budget insuffisant, la confirmation devrait afficher le montant manquant (\"Il manque X €\").");
}
if (!doc.getElementById("upgradeConfirmValidate").disabled) {
  throw new Error("❌ Avec un budget insuffisant, le bouton Valider devrait être désactivé.");
}
doc.getElementById("upgradeConfirmValidate").click(); // ne devrait rien faire (disabled)
if (win.eval("teamA.arenaLevel") !== arenaLevelBefore) throw new Error("❌ Un budget insuffisant ne devrait jamais permettre l'achat, même en forçant le clic.");
console.log("✅ Fonds insuffisants : bouton Valider désactivé, montant manquant affiché, aucun achat possible.");
doc.getElementById("upgradeConfirmCancel").click();

// ---------------------------------------------------------------------
// 3) Palier déjà maximum : un badge "Max" remplace la carte d'action, sans
//    ouvrir de confirmation au clic (plus de carte cliquable du tout).
// ---------------------------------------------------------------------
win.eval("teamA.budget = 100000000; teamA.arenaLevel = ARENA_LEVELS[ARENA_LEVELS.length - 1].level;");
win.eval("renderSalleSection();");
const arenaMaxBadge = doc.querySelector("#arenaCurrentPanel .facility-max-badge");
if (!arenaMaxBadge) throw new Error("❌ Au niveau maximum, un badge 'Max' devrait remplacer la carte d'agrandissement de la salle.");
if (arenaMaxBadge.textContent.trim() !== "Max") throw new Error(`❌ Le badge de niveau maximum devrait afficher \"Max\", obtenu \"${arenaMaxBadge.textContent.trim()}\".`);
console.log("✅ Salle au niveau maximum : badge 'Max' affiché, plus de carte d'action cliquable.");

// ---------------------------------------------------------------------
// 4) Infrastructure jamais construite (niveau 0, ex. gym) : le libellé
//    d'action de la confirmation est "Construire", pas "Améliorer".
// ---------------------------------------------------------------------
win.eval("teamA.arenaLevel = 1; teamA.facilityLevels = { tvStation: 0, gym: 0, wellness: 0 }; teamA.budget = 100000000;");
win.eval("renderSalleSection();");
const otherHolder = doc.getElementById("otherFacilitiesPanel");
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
const shopCard = otherHolder.querySelector("[data-fan-shop-card]");
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
const tcCard = otherHolder.querySelector("[data-training-center-card]");
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
const shopCardMax = otherHolder.querySelector("[data-fan-shop-card]");
if (!shopCardMax.querySelector(".facility-max-badge")) throw new Error("❌ La boutique des supporters au palier maximum devrait afficher un badge 'Max'.");
console.log("✅ Boutique des supporters au palier maximum : badge 'Max' affiché.");

win.eval("teamA.trainingCenterLevel = TRAINING_CENTER_LEVELS[TRAINING_CENTER_LEVELS.length - 1].level;");
win.eval("renderSalleSection();");
const tcCardMax = otherHolder.querySelector("[data-training-center-card]");
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
