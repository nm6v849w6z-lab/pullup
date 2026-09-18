// Vérifie la recherche globale du topbar (retour utilisateur, 2026-09 :
// "Oui, définissons la Recherche" -> scope "Équipes,Joueurs", filtres
// "Aucun filtre, juste le nom", placement "Barre de recherche globale",
// précisé ensuite par "je mettrai bien la recherche directement dans cette
// barre" en référence au topbar existant, voir renderTopbarSearchResults
// dans moteurbasket3.html) : équipes et joueurs de la ligue du manager,
// recherche par nom uniquement, insensible à la casse et aux accents,
// résultats cliquables qui ouvrent la vraie fiche équipe/joueur (mêmes
// écouteurs délégués que teamLinkHtml/playerLinkHtml, voir
// team_detail_page_test.js/player_detail_test.js pour ces fiches elles-mêmes).
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

const searchInput = doc.getElementById("topbarSearchInput");
const resultsBox = doc.getElementById("topbarSearchResults");
if (!searchInput || !resultsBox) throw new Error("❌ (setup) Le champ de recherche devrait être présent dans le topbar.");

function typeQuery(q) {
  searchInput.value = q;
  searchInput.dispatchEvent(new win.Event("input", { bubbles: true }));
}

// ---------------------------------------------------------------------
// Partie 1 : recherche d'équipe, résultat cliquable ouvrant sa fiche.
// ---------------------------------------------------------------------
const league = win.eval("league");
const myTeamIndex = win.eval("myTeamIndex");
const otherTeamIdx = myTeamIndex === 1 ? 2 : 1;
const otherTeam = league.teams[otherTeamIdx];
// Une sous-chaîne partielle (pas le nom complet) : prouve que c'est bien une
// recherche par inclusion, pas une correspondance exacte.
const teamQuery = otherTeam.name.slice(0, Math.max(3, Math.floor(otherTeam.name.length / 2)));
typeQuery(teamQuery);

const teamResultBtn = resultsBox.querySelector(`[data-team-idx="${otherTeamIdx}"]`);
console.log(`Recherche "${teamQuery}" -> résultat équipe trouvé pour "${otherTeam.name}" :`, !!teamResultBtn);
if (resultsBox.classList.contains("hidden")) throw new Error("❌ Le menu de résultats devrait être visible après une recherche non vide.");
if (!teamResultBtn) throw new Error(`❌ BUG : aucune correspondance équipe trouvée pour la sous-chaîne "${teamQuery}" du nom "${otherTeam.name}".`);
teamResultBtn.click();
const teamDetailVisible = !doc.getElementById("teamDetailSection").classList.contains("hidden");
const teamDetailTitle = doc.getElementById("teamDetailName").textContent;
console.log("Fiche équipe ouverte depuis la recherche :", teamDetailVisible, "| titre :", teamDetailTitle);
if (!teamDetailVisible || !teamDetailTitle.includes(otherTeam.name)) {
  throw new Error("❌ Cliquer sur un résultat d'équipe devrait ouvrir la vraie fiche équipe correspondante.");
}
const inputClearedAfterTeamClick = searchInput.value === "";
const resultsHiddenAfterTeamClick = resultsBox.classList.contains("hidden");
console.log("Champ vidé et menu refermé après sélection :", inputClearedAfterTeamClick, resultsHiddenAfterTeamClick);
if (!inputClearedAfterTeamClick || !resultsHiddenAfterTeamClick) {
  throw new Error("❌ Sélectionner un résultat devrait vider le champ et refermer le menu de résultats.");
}
doc.getElementById("closeTeamDetailBtn").click();
console.log("✅ La recherche d'équipe fonctionne par sous-chaîne et ouvre la vraie fiche équipe.");

// ---------------------------------------------------------------------
// Partie 2 : recherche de joueur, résultat cliquable ouvrant sa fiche.
// ---------------------------------------------------------------------
const targetPlayer = otherTeam.players[0];
const playerQuery = targetPlayer.name.slice(0, Math.max(3, Math.floor(targetPlayer.name.length / 2)));
typeQuery(playerQuery);
const playerResultBtn = resultsBox.querySelector(`[data-player-team="${otherTeamIdx}"][data-player-id="${targetPlayer.id}"]`);
console.log(`\nRecherche "${playerQuery}" -> résultat joueur trouvé pour "${targetPlayer.name}" :`, !!playerResultBtn);
if (!playerResultBtn) throw new Error(`❌ BUG : aucune correspondance joueur trouvée pour la sous-chaîne "${playerQuery}" du nom "${targetPlayer.name}".`);
playerResultBtn.click();
const playerDetailVisible = !doc.getElementById("playerDetailSection").classList.contains("hidden");
const playerDetailTitle = doc.getElementById("playerDetailName").textContent;
console.log("Fiche joueur ouverte depuis la recherche :", playerDetailVisible, "| titre :", playerDetailTitle);
if (!playerDetailVisible || !playerDetailTitle.includes(targetPlayer.name)) {
  throw new Error("❌ Cliquer sur un résultat de joueur devrait ouvrir la vraie fiche joueur correspondante.");
}
doc.getElementById("closePlayerDetailBtn").click();
console.log("✅ La recherche de joueur fonctionne par sous-chaîne et ouvre la vraie fiche joueur.");

// ---------------------------------------------------------------------
// Partie 3 : insensible à la casse ET aux accents (retour utilisateur :
// "Aucun filtre, juste le nom", mais ça doit rester praticable sans devoir
// taper les accents exacts). normalizeSearchText est testée directement
// (NFD + suppression des accents combinants), avec un exemple garanti plutôt
// que de dépendre d'un prénom accentué généré au hasard.
const normalizedAccented = win.eval(`normalizeSearchText("Théo ÉCHASSÉRIAU")`);
console.log("\nnormalizeSearchText(\"Théo ÉCHASSÉRIAU\") =", JSON.stringify(normalizedAccented));
if (normalizedAccented !== "theo echasseriau") {
  throw new Error(`❌ La recherche devrait être insensible à la casse et aux accents, obtenu : "${normalizedAccented}".`);
}
console.log("✅ La normalisation de recherche est bien insensible à la casse et aux accents.");

// ---------------------------------------------------------------------
// Partie 4 : aucune correspondance -> messages "Aucun(e)... ne correspond"
// pour les deux groupes, sans exception ni résultat fantôme.
// ---------------------------------------------------------------------
typeQuery("zzzzzimpossible9999");
const teamsEmptyMsg = resultsBox.textContent.includes("Aucune équipe ne correspond");
const playersEmptyMsg = resultsBox.textContent.includes("Aucun joueur ne correspond");
console.log("\nAucune correspondance -> messages vides affichés (équipes/joueurs) :", teamsEmptyMsg, playersEmptyMsg);
if (!teamsEmptyMsg || !playersEmptyMsg) {
  throw new Error("❌ Une recherche sans correspondance devrait afficher un message explicite pour chaque groupe (Équipes/Joueurs).");
}
if (resultsBox.querySelector("[data-team-idx], [data-player-id]")) {
  throw new Error("❌ Une recherche sans correspondance ne devrait afficher aucun résultat cliquable.");
}
console.log("✅ Une recherche sans correspondance affiche des messages clairs, sans résultat fantôme.");

// ---------------------------------------------------------------------
// Partie 5 : champ vide -> menu masqué (pas de menu vide qui traîne).
// ---------------------------------------------------------------------
typeQuery("");
console.log("\nMenu masqué quand le champ est vide :", resultsBox.classList.contains("hidden"));
if (!resultsBox.classList.contains("hidden")) throw new Error("❌ Le menu de résultats devrait rester masqué tant que le champ est vide.");
console.log("✅ Le menu reste masqué tant qu'aucune recherche n'est en cours.");

// ---------------------------------------------------------------------
// Partie 6 : Échap referme le menu SANS vider le texte tapé (juste une
// fermeture, pas une annulation de la recherche en cours).
// ---------------------------------------------------------------------
typeQuery(teamQuery);
if (resultsBox.classList.contains("hidden")) throw new Error("❌ (setup) Le menu devrait être ouvert avant le test Échap.");
searchInput.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
const hiddenAfterEscape = resultsBox.classList.contains("hidden");
const textKeptAfterEscape = searchInput.value === teamQuery;
console.log("\nÉchap referme le menu :", hiddenAfterEscape, "| texte conservé :", textKeptAfterEscape);
if (!hiddenAfterEscape) throw new Error("❌ Échap devrait refermer le menu de résultats.");
if (!textKeptAfterEscape) throw new Error("❌ Échap ne devrait pas vider le texte déjà tapé, juste refermer le menu.");
console.log("✅ Échap referme le menu sans effacer la recherche en cours.");

// ---------------------------------------------------------------------
// Partie 7 : un clic en dehors du bloc de recherche referme le menu.
// ---------------------------------------------------------------------
searchInput.dispatchEvent(new win.Event("input", { bubbles: true })); // ré-ouvre (même texte, déjà en place)
if (resultsBox.classList.contains("hidden")) throw new Error("❌ (setup) Le menu devrait être ouvert avant le test clic extérieur.");
doc.getElementById("topbarClubName").dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
const hiddenAfterOutsideClick = resultsBox.classList.contains("hidden");
console.log("\nClic en dehors du bloc de recherche referme le menu :", hiddenAfterOutsideClick);
if (!hiddenAfterOutsideClick) throw new Error("❌ Un clic en dehors du bloc de recherche devrait refermer le menu de résultats.");
console.log("✅ Un clic en dehors referme bien le menu de résultats.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests topbar_search_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
