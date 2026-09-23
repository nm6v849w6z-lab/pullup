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
const matchRows = [...doc2.querySelectorAll("#playerDetailContent table.roster-table")].pop().querySelectorAll("tbody tr");
console.log("Lignes 'match par match' affichées :", matchRows.length, "(attendu 3)");
if (matchRows.length !== 3) throw new Error("❌ 3 journées jouées devraient produire 3 lignes de match par match, obtenu : " + matchRows.length);

// Recoupe la 1ère ligne affichée (la plus RÉCENTE, tri décroissant) avec le
// matchLog brut du joueur.
const independent = win2.eval(`
  (function() {
    const team = league.teams[${mvpTeamIdx}];
    const p = team.players.find(pl => pl.id === ${mvpPlayerId});
    const log = [...p.matchLog].sort((a, b) => b.round - a.round);
    return { latest: log[0], gp: p.matchLog.length, totalPts: p.matchLog.reduce((s, m) => s + m.pts, 0) };
  })()
`);
console.log("Dernière entrée matchLog (calcul indépendant) :", independent.latest);
const firstRowText = matchRows[0].textContent;
if (!firstRowText.includes(`Journée ${independent.latest.round + 1}`) || !firstRowText.includes(String(independent.latest.pts))) {
  throw new Error(`❌ La 1ère ligne affichée (${firstRowText.replace(/\s+/g, " ")}) devrait correspondre à la journée la plus récente du matchLog brut (journée ${independent.latest.round + 1}, ${independent.latest.pts} pts).`);
}
// Index 0 (et non plus 1) depuis que les Caractéristiques sont affichées en
// grille de pastilles (.pdp-attr-grid/.pdp-pill) plutôt qu'en
// table.roster-table, et depuis la refonte "pdp-card" (2026-09, "on a tjrs
// pas les pages joueurs à jour") qui a ajouté un aperçu des 5 derniers
// matchs en table.pdp-games (classe distincte, jamais roster-table) : il ne
// reste donc toujours que 2 table.roster-table sur la fiche, tout en bas
// (Moyennes détaillées de la saison, puis Match par match, historique
// complet), voir renderPlayerDetail.
const avgPtsShown = doc2.querySelectorAll("#playerDetailContent table.roster-table")[0].querySelector("tbody tr td:nth-child(2)").textContent;
const expectedAvg = (independent.totalPts / independent.gp).toFixed(1);
console.log("Moyenne de points affichée :", avgPtsShown, "| attendue (calcul indépendant) :", expectedAvg);
if (avgPtsShown !== expectedAvg) throw new Error(`❌ La moyenne de points affichée (${avgPtsShown}) ne correspond pas au calcul indépendant (${expectedAvg}).`);
console.log("✅ Fiche joueur ouverte depuis les stats de la ligue : moyennes et match par match cohérents avec le matchLog brut.");

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
