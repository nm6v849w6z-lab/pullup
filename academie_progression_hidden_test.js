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

// --- Palier actuel : nom/niveau visibles, multiplicateur numérique masqué ---
const currentPanelText = doc.getElementById("trainingCenterCurrentPanel").textContent;
console.log("\nPanneau du palier actuel :", currentPanelText.replace(/\s+/g, " ").trim());
if (!currentPanelText.includes("Terrain arrière") || !currentPanelText.includes("niveau 1")) {
  throw new Error("❌ Le panneau du palier actuel devrait toujours afficher le nom et le niveau du Centre de formation.");
}
if (/×\s*\d/.test(currentPanelText) || currentPanelText.includes("progression automatique")) {
  throw new Error("❌ Le multiplicateur de progression par palier ne devrait plus être affiché sur le palier actuel (masqué sur demande utilisateur), obtenu : " + currentPanelText);
}
console.log("✅ Le palier actuel affiche bien son nom/niveau, sans le multiplicateur de progression.");

// --- Prochain palier (carte d'achat) : nom/coût visibles, multiplicateur masqué ---
const nextCardText = doc.querySelector("#trainingCenterCurrentPanel + .staff-hire-grid, #academieSection .staff-hire-grid")
  ? doc.querySelector(".staff-hire-grid").textContent
  : "";
console.log("\nCarte du prochain palier :", nextCardText.replace(/\s+/g, " ").trim());
if (!nextCardText.includes("Centre régional")) {
  throw new Error("❌ La carte du prochain palier devrait afficher son nom ('Centre régional').");
}
if (!nextCardText.includes("80")) {
  throw new Error("❌ La carte du prochain palier devrait toujours afficher son coût.");
}
if (/×\s*\d/.test(nextCardText) || nextCardText.includes("Progression")) {
  throw new Error("❌ Le multiplicateur de progression du prochain palier ne devrait plus être affiché (masqué sur demande utilisateur), obtenu : " + nextCardText);
}
console.log("✅ La carte du prochain palier affiche bien son nom/coût, sans le multiplicateur de progression.");

await flush(dom);
dom.window.close();
server.close();

console.log("\n🏁 Tous les tests de masquage de la progression par niveau (académie de jeunes) sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
