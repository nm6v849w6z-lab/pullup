// Vérifie la fiche joueur (retour utilisateur, 2026-09 : "pages joueur avec
// stats de la saison, match par match + une moyenne") — voir
// showPlayerDetail/renderPlayerDetail/playerLinkHtml dans moteurbasket3.html.
// Ouverte depuis plusieurs emplacements (Effectif, stats de la ligue,
// scoutisme), avec retour à l'origine exacte, et respect de la
// confidentialité du scoutisme pour les caractéristiques adverses (mais pas
// pour les stats de matchs, déjà publiques via les classements de la ligue).
const fs = require("fs");
const { startTestServer, openGame, flush, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();

// ---------------------------------------------------------------------
// Partie 1 : depuis l'Effectif (son propre joueur) — caractéristiques
// visibles en clair, aucun match joué pour l'instant, retour exact à
// l'Effectif via "← Retour".
// ---------------------------------------------------------------------
const dom1 = await openGame(html, baseUrl);
const doc1 = dom1.window.document;

[...doc1.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "effectif").click();
const firstPlayerLink = doc1.querySelector("#rosterContent .player-link");
if (!firstPlayerLink) throw new Error("❌ (setup) l'Effectif devrait afficher au moins un lien joueur cliquable.");
const firstPlayerName = firstPlayerLink.textContent;
firstPlayerLink.click();

const playerDetailVisible = !doc1.getElementById("playerDetailSection").classList.contains("hidden");
const effectifHiddenNow = doc1.getElementById("effectifSection").classList.contains("hidden");
console.log("Nom cliqué :", firstPlayerName, "| fiche joueur visible :", playerDetailVisible, "| Effectif masqué :", effectifHiddenNow);
if (!playerDetailVisible || !effectifHiddenNow) throw new Error("❌ Cliquer sur un joueur de l'Effectif devrait ouvrir sa fiche.");
if (!doc1.getElementById("playerDetailName").textContent.includes(firstPlayerName)) {
  throw new Error("❌ Le titre de la fiche devrait reprendre le nom du joueur cliqué.");
}
// Gabarit large (retour utilisateur, 2026-09, refonte "pdp-card" :
// "pourquoi c'est aussi serré ? [...] gros trou [...] à gauche [...] à
// droite il y a aussi de la perte de place") : playerDetailSection est
// passée de NARROW_PAGE_IDS (ancien format à plat, 700px) à WIDE_PAGE_IDS
// (voir showPage/.wrap-wide) — sans ça, la grille 280px+1fr de la refonte se
// retrouvait plafonnée à 700px, laissant un grand vide symétrique de chaque
// côté sur un écran large.
const wrapClasses = doc1.querySelector(".wrap").className;
console.log("Classes du gabarit sur la fiche joueur :", wrapClasses);
if (!wrapClasses.includes("wrap-wide")) throw new Error("❌ La fiche joueur devrait utiliser le gabarit large (wrap-wide), pas rester plafonnée à 700px/960px.");
console.log("✅ La fiche joueur utilise bien le gabarit large (pas de vide gauche/droite).");
// .pdp-pill:not(.locked) → .pdp-attr-value depuis le revirtement 2026-09-23
// (échelle rouge/orange/blanc/vert SANS halo pour les valeurs révélées,
// voir moteurbasket3.html/DEV_NOTES.md) : .pdp-pill ne sert plus qu'au
// badge "?" verrouillé (voir lockedCells plus bas, inchangé).
const attrCellsOwn = doc1.querySelectorAll("#playerDetailContent .pdp-attr-value").length;
console.log("Cellules de caractéristiques déverrouillées (propre effectif) :", attrCellsOwn, "(attendu > 0)");
if (attrCellsOwn === 0) throw new Error("❌ Les caractéristiques de son propre joueur devraient toujours être visibles en clair.");
if (!doc1.getElementById("playerDetailContent").textContent.includes("Aucun match joué cette saison")) {
  throw new Error("❌ Avant tout match joué, la fiche devrait indiquer qu'aucun match n'a encore été joué.");
}
console.log("✅ Fiche joueur ouverte depuis l'Effectif : caractéristiques en clair, message d'attente propre sans historique de matchs.");

// ---------------------------------------------------------------------
// Motivation (Player.form, voir motivationBadgeHtml, retour utilisateur,
// 2026-09 : "La motivation du joueur n'apparaît pas ?") : visible sur SA
// PROPRE fiche joueur, avec le bon libellé d'état pour la valeur réelle.
// ---------------------------------------------------------------------
const ownPlayerId = Number(firstPlayerLink.dataset.playerId);
const ownPlayerForm = dom1.window.eval(`teamA.players.find(p => p.id === ${ownPlayerId}).form`);
const expectedMotivationLabel = dom1.window.eval(`motivationLabel(${ownPlayerForm})`);
const motivationBadge1 = doc1.querySelector("#playerDetailContent .motivation-badge");
console.log("Motivation affichée pour son propre joueur :", motivationBadge1 && motivationBadge1.textContent, "(attendu", expectedMotivationLabel, ", form réel =", ownPlayerForm, ")");
if (!motivationBadge1) throw new Error("❌ La fiche de son propre joueur devrait afficher un badge de motivation.");
if (motivationBadge1.textContent !== expectedMotivationLabel) {
  throw new Error(`❌ Le badge de motivation devrait afficher "${expectedMotivationLabel}" pour form=${ownPlayerForm}, obtenu "${motivationBadge1.textContent}".`);
}
console.log("✅ La motivation de son propre joueur est bien affichée sur sa fiche, avec le bon libellé d'état.");

doc1.getElementById("closePlayerDetailBtn").click();
const backToEffectif = !doc1.getElementById("effectifSection").classList.contains("hidden") &&
  doc1.getElementById("tabEffectif") && doc1.getElementById("tabEffectif").classList.contains("active");
// Le bouton "tabEffectif" n'existe peut-être pas sous cet id exact — on
// vérifie plutôt directement l'état des pages/onglets, plus robuste.
const effectifVisibleAfterBack = !doc1.getElementById("effectifSection").classList.contains("hidden");
const playerDetailHiddenAfterBack = doc1.getElementById("playerDetailSection").classList.contains("hidden");
console.log("Après '← Retour' — Effectif visible :", effectifVisibleAfterBack, "| fiche joueur masquée :", playerDetailHiddenAfterBack);
if (!effectifVisibleAfterBack || !playerDetailHiddenAfterBack) {
  throw new Error("❌ '← Retour' depuis la fiche joueur ouverte depuis l'Effectif devrait ramener exactement à l'Effectif.");
}
console.log("✅ '← Retour' ramène bien à l'écran d'origine exact (Effectif).");
await flush(dom1);
dom1.window.close();

// ---------------------------------------------------------------------
// Partie 2 : depuis les classements de stats de la ligue (onglet Ligue),
// après quelques journées jouées — moyennes + match par match cohérents
// avec les totaux bruts de matchLog, retour exact à l'onglet Ligue.
// ---------------------------------------------------------------------
fastForwardCalendar(savePath, 3);
const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;
doc2.getElementById("catchupContinueBtn").click();
doc2.getElementById("regenBtn").click(); // "📊 Classement" -> onglet Ligue

const mvpLink = doc2.querySelector("#leagueStatsPanel .mvp-callout .player-link");
if (!mvpLink) throw new Error("❌ (setup) le MVP de la dernière journée devrait être un lien joueur cliquable.");
const mvpTeamIdx = Number(mvpLink.dataset.playerTeam);
const mvpPlayerId = Number(mvpLink.dataset.playerId);
const mvpName = mvpLink.textContent;
mvpLink.click();

const detailContent = doc2.getElementById("playerDetailContent").textContent;
console.log("\nFiche ouverte pour le MVP :", mvpName);
if (!doc2.getElementById("playerDetailName").textContent.includes(mvpName)) {
  throw new Error("❌ Le titre de la fiche devrait reprendre le nom du MVP cliqué.");
}
if (!detailContent.includes("Moyennes de la saison (3 matchs)")) {
  throw new Error("❌ Après 3 journées jouées, la fiche devrait afficher '3 matchs' dans le titre des moyennes.");
}
// Retour utilisateur (2026-09-24) : "enleve le match par match en bas" — le
// tableau "Match par match" (historique complet, journée par journée) a été
// retiré du bas de la fiche joueur, remplacé par la fenêtre superposée
// "Voir toute la saison" ouverte depuis la carte "Derniers matchs"
// (n'apparaît que si plus de 5 matchs joués, voir
// player_season_stats_modal_test.js pour cette fenêtre en détail — ce
// fichier-ci n'en a que 3, pas assez pour que le bouton apparaisse). Il ne
// reste donc plus qu'UNE SEULE table.roster-table sur la fiche : "Moyennes
// de la saison" (remontée AU-DESSUS de "Mise en vente", retour utilisateur
// "il faut remonter le bloc moyenne de la saison au dessus du bloc mise en
// vente" — voir renderPlayerDetail).
const rosterTables = doc2.querySelectorAll("#playerDetailContent table.roster-table");
if (rosterTables.length !== 1) {
  throw new Error(`❌ Une seule table.roster-table ("Moyennes de la saison") devrait rester sur la fiche joueur (le "Match par match" a été retiré), obtenu ${rosterTables.length}.`);
}
console.log("✅ Le tableau \"Match par match\" a bien disparu de la fiche joueur (une seule table.roster-table restante : Moyennes de la saison).");

// Recoupe la moyenne de points affichée avec le matchLog brut du joueur.
const independent = win2.eval(`
  (function() {
    const team = league.teams[${mvpTeamIdx}];
    const p = team.players.find(pl => pl.id === ${mvpPlayerId});
    return { gp: p.matchLog.length, totalPts: p.matchLog.reduce((s, m) => s + m.pts, 0) };
  })()
`);
const avgPtsShown = rosterTables[0].querySelector("tbody tr td:nth-child(2)").textContent;
const expectedAvg = (independent.totalPts / independent.gp).toFixed(1);
console.log("Moyenne de points affichée :", avgPtsShown, "| attendue (calcul indépendant) :", expectedAvg);
if (avgPtsShown !== expectedAvg) throw new Error(`❌ La moyenne de points affichée (${avgPtsShown}) ne correspond pas au calcul indépendant (${expectedAvg}).`);
console.log("✅ Fiche joueur ouverte depuis les stats de la ligue : moyennes cohérentes avec le matchLog brut.");

// Ordre "Moyennes de la saison" AVANT "Mise en vente" (retour utilisateur,
// voir plus haut) : comparaison de position dans le texte brut du
// conteneur plutôt qu'un sélecteur DOM dédié (les deux ne sont pas dans le
// même type de bloc — .pdp-card pour "Mise en vente", <h3 class="field-
// label"> nu pour "Moyennes de la saison", voir renderPlayerDetail).
// "Mise en vente" n'existe que pour SON PROPRE effectif (isOwnTeam) : ce
// MVP est celui de toute la ligue, pas forcément dans l'équipe du joueur —
// ce test d'ordre ne s'applique donc que si le bloc est bien présent ici.
const fullText = doc2.getElementById("playerDetailContent").textContent;
const idxAverages = fullText.indexOf("Moyennes de la saison");
const idxForSale = fullText.indexOf("Mise en vente");
if (idxAverages === -1) throw new Error("❌ \"Moyennes de la saison\" devrait être présent sur la fiche joueur.");
if (idxForSale === -1) {
  console.log("ℹ️ MVP hors de son propre effectif ici (pas de bloc \"Mise en vente\") : ordre non vérifiable sur cette fiche, voir player_season_stats_modal_test.js pour un cas garanti sur son propre effectif.");
} else if (idxAverages >= idxForSale) {
  throw new Error(`❌ "Moyennes de la saison" devrait apparaître AVANT "Mise en vente" dans la fiche joueur (idxAverages=${idxAverages}, idxForSale=${idxForSale}).`);
} else {
  console.log("✅ Le bloc \"Moyennes de la saison\" apparaît bien au-dessus de \"Mise en vente\".");
}

doc2.getElementById("closePlayerDetailBtn").click();
const standingsVisibleAfterBack = !doc2.getElementById("standingsSection").classList.contains("hidden");
const ligueTabActiveAfterBack = [...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ligue").classList.contains("active");
console.log(`${standingsVisibleAfterBack && ligueTabActiveAfterBack ? "✅" : "❌"} '← Retour' depuis une fiche ouverte sur l'onglet Ligue y ramène exactement (pas systématiquement l'Effectif).`);
if (!standingsVisibleAfterBack || !ligueTabActiveAfterBack) {
  throw new Error("❌ '← Retour' devrait ramener à l'onglet Ligue (l'origine réelle), pas un écran fixe codé en dur.");
}

// ---------------------------------------------------------------------
// Partie 3 : depuis le scoutisme (joueur ADVERSE) — caractéristiques
// verrouillées tant que non révélées par une séance vidéo, mais les stats
// de matchs restent visibles (déjà publiques via les classements ci-dessus).
// ---------------------------------------------------------------------
const opponentRow = doc2.querySelector("#standingsContent [data-team-idx]");
if (!opponentRow) throw new Error("❌ (setup) au moins un nom d'équipe adverse devrait être cliquable pour ouvrir sa fiche équipe.");
opponentRow.click();
const opponentPlayerLink = doc2.querySelector("#teamDetailContent .player-link");
if (!opponentPlayerLink) throw new Error("❌ (setup) la fiche équipe adverse devrait afficher des liens joueur cliquables.");
const oppName = opponentPlayerLink.textContent;
opponentPlayerLink.click();

const lockedCells = doc2.querySelectorAll("#playerDetailContent .pdp-pill.locked").length;
console.log("\nFiche ouverte pour un joueur adverse (scoutisme) :", oppName, "| cellules verrouillées :", lockedCells, "(attendu = toutes, aucune séance vidéo faite)");
if (lockedCells !== ATTRS_LENGTH_FALLBACK(win2)) {
  throw new Error(`❌ Sans séance vidéo faite sur cet adversaire, TOUTES ses caractéristiques devraient rester verrouillées sur sa fiche, obtenu ${lockedCells} verrouillées.`);
}
console.log("✅ Les caractéristiques d'un adversaire non scouté restent verrouillées sur sa fiche joueur, exactement comme sur le panneau de scoutisme.");

// Motivation : jamais affichée pour un joueur adverse (voir le commentaire
// d'isOwnTeam dans renderPlayerDetail), contrairement à la forme physique
// juste au-dessus qui, elle, reste toujours visible.
const motivationBadgeOpponent = doc2.querySelector("#playerDetailContent .motivation-badge");
const conditionBadgeOpponent = doc2.querySelector("#playerDetailContent .condition-badge");
console.log("Badge de motivation affiché pour un adversaire :", !!motivationBadgeOpponent, "(attendu false) | badge de forme physique :", !!conditionBadgeOpponent, "(attendu true)");
if (motivationBadgeOpponent) throw new Error("❌ La motivation d'un joueur adverse ne devrait JAMAIS être affichée (information interne au club).");
if (!conditionBadgeOpponent) throw new Error("❌ La forme physique, elle, devrait rester visible même pour un joueur adverse.");
console.log("✅ La motivation reste privée à son propre effectif, sans affecter la forme physique (toujours publique).");

function ATTRS_LENGTH_FALLBACK(w) { return w.eval("ATTRS.length"); }

await flush(dom2);
dom2.window.close();
server.close();

console.log("\n🏁 Tous les tests de la fiche joueur sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
