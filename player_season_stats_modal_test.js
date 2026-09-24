// Vérifie la fenêtre superposée "Voir toute la saison" de la fiche joueur
// (retour utilisateur, 2026-09-24, captures des blocs "Derniers matchs"/
// "Moyennes de la saison"/"Mise en vente") : "dans derniers matchs, ajoute
// un bouton pour voir plus que les 5 derniers matchs et voir toute la
// saison (ça pourrait ouvrir une fenetre qui se superpose et qui montre
// toutes les stats (pas juste point rebond passse) de la saison avec une
// moyenne en bas. enleve le match par match en bas" + "il faut remonter le
// bloc moyenne de la saison au dessus du bloc mise en vente" — voir
// showPlayerSeasonStatsModal/playerFullSeasonMatchesTableHtml/
// playerSeasonAveragesTableHtml/renderPlayerDetail dans moteurbasket3.html.
// La suppression du tableau "Match par match" et la cohérence des moyennes
// sont déjà couvertes par player_detail_test.js (scénario à 3 matchs, pas
// assez pour que le bouton "Voir toute la saison" apparaisse) — ce fichier
// se concentre sur ce qui a besoin de PLUS de 5 matchs joués : le bouton
// lui-même, le contenu de la fenêtre, et l'ordre garanti sur son PROPRE
// effectif (où "Mise en vente" est toujours présent).
const fs = require("fs");
const { startTestServer, openGame, flush, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();

// Première ouverture nécessaire pour créer la sauvegarde initiale (voir le
// même patron dans mvp_avatar_test.js) avant de pouvoir avancer le
// calendrier avec fastForwardCalendar.
const domInit = await openGame(html, baseUrl);
await flush(domInit);
await domInit.window.close();

// 7 journées jouées : strictement plus que les 5 affichées par "Derniers
// matchs", pour que le bouton "Voir toute la saison" apparaisse.
fastForwardCalendar(savePath, 7);
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
doc.getElementById("catchupContinueBtn").click();

const myTeamIdx = win.eval("myTeamIndex");
const team = win.eval("league.teams[myTeamIndex]");
const player = team.players[0];
win.showPlayerDetail(myTeamIdx, player.id);

const gp = win.eval(`league.teams[myTeamIndex].players.find(p => p.id === ${player.id}).matchLog.length`);
console.log(`Joueur de test : ${player.name} (${gp} matchs joués cette saison, attendu 7).`);
if (gp !== 7) throw new Error(`❌ (setup) Ce joueur devrait avoir joué exactement 7 matchs (fastForwardCalendar(7)), obtenu ${gp}.`);

// ---------------------------------------------------------------------
// Partie 1 : le bouton "Voir toute la saison" apparaît bien (plus de 5
// matchs joués), avec le bon décompte, et pas de fenêtre ouverte avant clic.
// ---------------------------------------------------------------------
const openBtn = doc.getElementById("playerSeasonStatsOpenBtn");
if (!openBtn) throw new Error("❌ Le bouton \"Voir toute la saison\" devrait être présent dans la carte \"Derniers matchs\" (7 matchs joués, plus que les 5 affichés).");
if (!openBtn.textContent.includes("7 matchs")) {
  throw new Error(`❌ Le bouton devrait mentionner "7 matchs", obtenu : "${openBtn.textContent}".`);
}
console.log(`✅ Le bouton "Voir toute la saison" apparaît bien (${openBtn.textContent.trim()}), l'effectif ayant joué plus de 5 matchs.`);
if (doc.getElementById("playerSeasonStatsOverlay")) {
  throw new Error("❌ La fenêtre \"Voir toute la saison\" ne devrait pas être ouverte avant le clic sur le bouton.");
}

// ---------------------------------------------------------------------
// Partie 2 : clic -> fenêtre superposée avec TOUTES les stats de TOUS les
// matchs (pas juste Pts/Reb/Pd comme "Derniers matchs"), + une moyenne en
// bas (même contenu que le bloc "Moyennes de la saison" du reste de la
// fiche, réutilisé via playerSeasonAveragesTableHtml).
// ---------------------------------------------------------------------
openBtn.click();
const overlay = doc.getElementById("playerSeasonStatsOverlay");
if (!overlay) throw new Error("❌ Un clic sur \"Voir toute la saison\" devrait ouvrir la fenêtre superposée.");
console.log("✅ La fenêtre \"Voir toute la saison\" s'ouvre bien au clic.");

if (!overlay.textContent.includes(player.name)) {
  throw new Error(`❌ Le titre de la fenêtre devrait mentionner le joueur (${player.name}).`);
}

const tables = overlay.querySelectorAll("table.roster-table");
if (tables.length !== 2) {
  throw new Error(`❌ La fenêtre devrait contenir 2 tables (tous les matchs, puis la moyenne en bas), obtenu ${tables.length}.`);
}
const [matchesTable, averagesTable] = tables;

// "toutes les stats (pas juste point rebond passse)" : bien plus de
// colonnes que l'aperçu "Derniers matchs" (J/Adversaire/Résultat/Pts/Reb/
// Pd/Éval, 7 colonnes) — Perte/Faute/2pts/3pts/LF en plus ici.
const headers = [...matchesTable.querySelectorAll("thead th")].map(th => th.textContent.trim());
const expectedHeaders = ["Journée", "Adversaire", "Résultat", "Min", "Pts", "Reb", "Pas", "Int", "Ctr", "Perte", "Faute", "2 pts", "3 pts", "LF", "Éval"];
if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
  throw new Error(`❌ En-têtes attendus ${JSON.stringify(expectedHeaders)}, obtenu ${JSON.stringify(headers)}.`);
}
console.log("✅ La table \"tous les matchs\" affiche bien TOUTES les stats (15 colonnes), pas seulement Pts/Reb/Pd.");

const matchRows = matchesTable.querySelectorAll("tbody tr");
if (matchRows.length !== 7) {
  throw new Error(`❌ La fenêtre devrait lister les 7 matchs joués (pas seulement les 5 de l'aperçu "Derniers matchs"), obtenu ${matchRows.length} lignes.`);
}
console.log("✅ Les 7 matchs de la saison sont bien tous listés (pas limité à 5).");

// Recoupe la 1ère ligne (la plus RÉCENTE, tri décroissant) avec le
// matchLog brut, comme le faisait l'ancien test sur "Match par match".
const independent = win.eval(`
  (function() {
    const p = league.teams[myTeamIndex].players.find(pl => pl.id === ${player.id});
    const log = [...p.matchLog].sort((a, b) => b.round - a.round);
    return log[0];
  })()
`);
const firstRowText = matchRows[0].textContent;
if (!firstRowText.includes(`Journée ${independent.round + 1}`) || !firstRowText.includes(String(independent.pts))) {
  throw new Error(`❌ La 1ère ligne (${firstRowText.replace(/\s+/g, " ")}) devrait correspondre à la journée la plus récente du matchLog brut (journée ${independent.round + 1}, ${independent.pts} pts).`);
}
console.log("✅ La 1ère ligne de la fenêtre correspond bien au match le plus récent du matchLog brut.");

// "avec une moyenne en bas" : 2e table = les mêmes moyennes que le bloc
// "Moyennes de la saison" affiché par ailleurs sur la fiche (réutilisation
// de playerSeasonAveragesTableHtml, pas un second calcul qui pourrait
// diverger).
if (!averagesTable.closest("body") || !overlay.textContent.includes("Moyennes de la saison (7 matchs)")) {
  throw new Error("❌ La fenêtre devrait afficher \"Moyennes de la saison (7 matchs)\" en bas.");
}
const avgOnPage = doc.querySelector("#playerDetailContent table.roster-table tbody tr td:nth-child(2)").textContent;
const avgInModal = averagesTable.querySelector("tbody tr td:nth-child(2)").textContent;
if (avgOnPage !== avgInModal) {
  throw new Error(`❌ La moyenne de points dans la fenêtre (${avgInModal}) devrait être identique à celle affichée sur la fiche (${avgOnPage}) — même calcul réutilisé.`);
}
console.log(`✅ La fenêtre affiche bien une moyenne en bas (${avgInModal} pts/match), identique à celle du reste de la fiche.`);

// ---------------------------------------------------------------------
// Partie 3 : fermeture (bouton "Fermer" ET clic sur le fond assombri).
// ---------------------------------------------------------------------
doc.getElementById("playerSeasonStatsCloseBtn").click();
if (doc.getElementById("playerSeasonStatsOverlay")) {
  throw new Error("❌ Le bouton \"Fermer\" devrait retirer la fenêtre superposée.");
}
console.log("✅ Le bouton \"Fermer\" ferme bien la fenêtre.");

openBtn.click();
doc.getElementById("playerSeasonStatsOverlay").dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
if (doc.getElementById("playerSeasonStatsOverlay")) {
  throw new Error("❌ Un clic sur le fond assombri (en dehors de la boîte) devrait aussi fermer la fenêtre.");
}
console.log("✅ Un clic sur le fond assombri ferme bien la fenêtre.");

// ---------------------------------------------------------------------
// Partie 4 : ordre garanti sur SON PROPRE effectif (où "Mise en vente" est
// toujours présent) — "Moyennes de la saison" doit apparaître AVANT "Mise
// en vente", et le tableau "Match par match" doit avoir disparu.
// ---------------------------------------------------------------------
const fullText = doc.getElementById("playerDetailContent").textContent;
const idxAverages = fullText.indexOf("Moyennes de la saison");
const idxForSale = fullText.indexOf("Mise en vente");
if (idxAverages === -1 || idxForSale === -1) {
  throw new Error(`❌ (setup) Les deux blocs devraient être présents sur son propre effectif (idxAverages=${idxAverages}, idxForSale=${idxForSale}).`);
}
if (idxAverages >= idxForSale) {
  throw new Error(`❌ "Moyennes de la saison" devrait apparaître AVANT "Mise en vente" (idxAverages=${idxAverages}, idxForSale=${idxForSale}).`);
}
console.log("✅ Sur son propre effectif : \"Moyennes de la saison\" apparaît bien au-dessus de \"Mise en vente\".");
if (fullText.includes("Match par match")) {
  throw new Error("❌ Le tableau \"Match par match\" ne devrait plus apparaître nulle part sur la fiche joueur.");
}
console.log("✅ \"Match par match\" a bien disparu de la fiche joueur.");

await flush(dom);
dom.window.close();
server.close();

console.log("\n🏁 Tous les tests de la fenêtre \"Voir toute la saison\" sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
