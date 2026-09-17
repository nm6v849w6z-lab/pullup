// Vérifie #49 (retour utilisateur, 2026-09) : "académie de jeunes basique
// par défaut + masquer la progression par niveau" — une nouvelle carrière
// démarre bien avec le Centre de formation au palier de base ("Terrain
// arrière", gratuit, niveau 1 — voir Team.trainingCenterLevel), et l'onglet
// Académie de jeunes n'affiche plus le multiplicateur de progression
// numérique par palier (ni sur le palier actuel, ni sur la carte du
// prochain palier) — seulement le nom et le coût, comme les autres
// infrastructures (Station TV, Salle de musculation...).
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "academie").click();

// --- Palier de base par défaut ---
const trainingCenterLevel = win.eval("teamA.trainingCenterLevel");
console.log("Palier du Centre de formation d'une nouvelle carrière :", trainingCenterLevel, "(attendu 1, le palier de base gratuit)");
if (trainingCenterLevel !== 1) throw new Error("❌ Une nouvelle carrière devrait démarrer avec le Centre de formation au palier de base (1), obtenu : " + trainingCenterLevel);
console.log("✅ Le Centre de formation démarre bien au palier de base par défaut.");

// --- Palier actuel : nom/niveau visibles, multiplicateur numérique masqué.
// Retour utilisateur (2026-09, suite) : "je ne veux plus qu'une brique en
// haut avec le niveau actuel de l'académie + une fleche sur le cote [...]
// comme pour les autres infrastructures". renderTrainingCenterPanel est
// passé à une seule carte .facility-card + buildUpgradeArrow/
// showUpgradeConfirm (même système que Salle), à la place de l'ancienne
// carte cliquable à achat immédiat. ---
const currentPanelText = doc.getElementById("trainingCenterCurrentPanel").textContent;
console.log("\nPanneau du palier actuel :", currentPanelText.replace(/\s+/g, " ").trim());
if (!currentPanelText.includes("Terrain arrière") || !currentPanelText.includes("Niveau 1")) {
  throw new Error("❌ Le panneau du palier actuel devrait toujours afficher le nom et le niveau du Centre de formation.");
}
if (/×\s*\d/.test(currentPanelText) || currentPanelText.includes("progression automatique")) {
  throw new Error("❌ Le multiplicateur de progression par palier ne devrait plus être affiché sur la carte au premier coup d'œil (masqué sur demande utilisateur), obtenu : " + currentPanelText);
}
console.log("✅ La carte du palier actuel affiche bien son nom/niveau, sans le multiplicateur de progression visible au premier coup d'œil.");

// --- Prochain palier : uniquement via la flèche d'amélioration (popup de
// confirmation), même endroit que pour la Salle (arène, boutique,
// CLUB_FACILITIES), où le détail complet (dont le multiplicateur de
// progression) n'apparaît QUE dans cette popup ouverte volontairement avant
// achat, jamais sur la carte elle-même. ---
const tcArrow = doc.querySelector("#trainingCenterCurrentPanel .facility-upgrade-arrow");
if (!tcArrow) throw new Error("❌ Une flèche d'amélioration devrait être présente sur la carte du Centre de formation.");
tcArrow.click();
const overlay = doc.getElementById("upgradeConfirmOverlay");
if (!overlay) throw new Error("❌ Cliquer sur la flèche devrait ouvrir la confirmation d'amélioration.");
const overlayText = overlay.textContent;
console.log("\nConfirmation d'amélioration :", overlayText.replace(/\s+/g, " ").trim());
if (!overlayText.includes("Centre régional")) throw new Error("❌ La confirmation devrait afficher le nom du prochain palier ('Centre régional').");
if (!overlayText.includes("80")) throw new Error("❌ La confirmation devrait afficher le coût du prochain palier.");
doc.getElementById("upgradeConfirmCancel").click();
if (doc.getElementById("upgradeConfirmOverlay")) throw new Error("❌ 'Annuler' devrait fermer la confirmation sans rien acheter.");
if (win.eval("teamA.trainingCenterLevel") !== 1) throw new Error("❌ Annuler ne devrait pas avoir amélioré le Centre de formation.");
console.log("✅ Le prochain palier (nom, coût, effet) n'apparaît que dans la confirmation ouverte via la flèche, jamais sur la carte elle-même.");

await flush(dom);
dom.window.close();
server.close();

console.log("\n🏁 Tous les tests de masquage de la progression par niveau (académie de jeunes) sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
