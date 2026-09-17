// Vérifie l'onglet 📈 Stats hebdo (retour utilisateur, 2026-09 : "développe
// l'onglet stats hebdo") : récapitulatif de la semaine d'entraînement pour
// tout l'effectif (matchs joués, performances individuelles), navigable
// semaine par semaine sur toute la saison en cours. Les finances et l'humeur
// des supporters en ont depuis été retirées (retour utilisateur, 2026-09 :
// doublons des onglets dédiés 💶 Économie et 😊 Humeur des supporters). Voir
// renderStatsHebdoSection/computeWeekPlayerStats/ownMatchSummaryForRound
// dans moteurbasket3.html, alimentés par le nouveau champ Player.matchLog[].week
// (voir recordMatchStatsForTeam côté moteur).
const fs = require("fs");
const { startTestServer, openGame, flush, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();

// ---------------------------------------------------------------------
// Partie 1 : avant tout match joué — page accessible, message d'attente
// propre, aucune navigation possible (une seule semaine connue : la 1ère).
// ---------------------------------------------------------------------
const dom1 = await openGame(html, baseUrl);
const doc1 = dom1.window.document;
[...doc1.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "statshebdo").click();

const statsHebdoVisible = !doc1.getElementById("statsHebdoSection").classList.contains("hidden");
console.log("Onglet Stats hebdo visible :", statsHebdoVisible);
if (!statsHebdoVisible) throw new Error("❌ L'onglet Stats hebdo devrait maintenant afficher une vraie page, plus un placeholder.");
const weekLabel = doc1.querySelector("#statsHebdoNav .week-nav-label").textContent;
console.log("Semaine affichée par défaut :", weekLabel, "(attendu 'Semaine 1')");
if (weekLabel !== "Semaine 1") throw new Error("❌ Avant tout match joué, la semaine affichée par défaut devrait être la semaine 1, obtenu : " + weekLabel);
const prevDisabled = doc1.getElementById("statsHebdoPrevBtn").disabled;
const nextDisabled = doc1.getElementById("statsHebdoNextBtn").disabled;
console.log(`${prevDisabled && nextDisabled ? "✅" : "❌"} Navigation désactivée des deux côtés (une seule semaine connue pour l'instant).`);
if (!prevDisabled || !nextDisabled) throw new Error("❌ Avec une seule semaine connue, les boutons précédent/suivant devraient être désactivés.");
const content1 = doc1.getElementById("statsHebdoContent").textContent;
if (!content1.includes("Aucun match joué lors de cette semaine")) {
  throw new Error("❌ Avant tout match joué, la page devrait indiquer qu'aucun match n'a encore été joué cette semaine.");
}
console.log("✅ Avant tout match joué : page accessible, semaine 1 par défaut, navigation désactivée, message d'attente propre.");
await flush(dom1);
dom1.window.close();

// ---------------------------------------------------------------------
// Partie 2 : après 4 journées jouées (2 semaines complètes d'entraînement)
// — matchs/performances/finances cohérents avec les données brutes,
// navigation semaine par semaine fonctionnelle.
// ---------------------------------------------------------------------
fastForwardCalendar(savePath, 4);
const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;
doc2.getElementById("catchupContinueBtn").click();
[...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "statshebdo").click();

const teamWeek = win2.eval("teamA.week");
console.log("\nteamA.week après 4 journées (2 semaines) jouées :", teamWeek, "(attendu 3 : semaines 1 et 2 entraînées, semaine 3 en cours)");
const weekLabel2 = doc2.querySelector("#statsHebdoNav .week-nav-label").textContent;
console.log("Semaine affichée par défaut :", weekLabel2);
if (weekLabel2 !== `Semaine ${teamWeek}`) throw new Error(`❌ La page devrait par défaut afficher la semaine EN COURS (${teamWeek}), obtenu : ${weekLabel2}.`);

// --- Navigue vers la semaine 1 (2 journées jouées) et vérifie le contenu. ---
doc2.getElementById("statsHebdoPrevBtn").click();
doc2.getElementById("statsHebdoPrevBtn").click();
const weekLabelAfterNav = doc2.querySelector("#statsHebdoNav .week-nav-label").textContent;
console.log("Semaine après 2 clics '← Semaine précédente' :", weekLabelAfterNav, "(attendu 'Semaine 1')");
if (weekLabelAfterNav !== "Semaine 1") throw new Error("❌ La navigation vers la semaine précédente ne fonctionne pas correctement.");
const prevDisabledAtMin = doc2.getElementById("statsHebdoPrevBtn").disabled;
console.log(`${prevDisabledAtMin ? "✅" : "❌"} '← Semaine précédente' désactivé une fois la 1ère semaine atteinte.`);
if (!prevDisabledAtMin) throw new Error("❌ Le bouton précédent devrait se désactiver à la semaine 1 (la plus ancienne).");

const matchRows = [...doc2.querySelectorAll("#statsHebdoContent table.standings-table tbody tr")];
console.log("Matchs affichés pour la semaine 1 :", matchRows.length, "(attendu 2, une par journée de la semaine)");
if (matchRows.length !== 2) throw new Error("❌ La semaine 1 (journées 1 et 2) devrait afficher 2 matchs, obtenu : " + matchRows.length);
if (!matchRows[0].textContent.includes("Journée 1") || !matchRows[1].textContent.includes("Journée 2")) {
  throw new Error("❌ Les matchs de la semaine 1 devraient être les journées 1 et 2, dans l'ordre.");
}

// Recoupe le score affiché de la journée 1 avec league.results (calcul
// indépendant, sans passer par renderStatsHebdoSection).
const independentRound0 = win2.eval(`
  (function() {
    const r = league.results.find(res => res.round === 0 && (res.home === myTeamIndex || res.away === myTeamIndex));
    const isHome = r.home === myTeamIndex;
    return { my: isHome ? r.scoreHome : r.scoreAway, opp: isHome ? r.scoreAway : r.scoreHome };
  })()
`);
console.log("Score journée 1 affiché :", matchRows[0].textContent.replace(/\s+/g, " "), "| calculé indépendamment :", independentRound0);
if (!matchRows[0].textContent.includes(`${independentRound0.my} - ${independentRound0.opp}`)) {
  throw new Error("❌ Le score affiché pour la journée 1 ne correspond pas au résultat réel (league.results).");
}
console.log("✅ Les matchs de la semaine 1 (2 journées) s'affichent avec le bon score, dans le bon ordre.");

// --- Performances individuelles : recoupe les totaux affichés avec matchLog brut. ---
const perfRows = [...doc2.querySelectorAll("#statsHebdoContent table.roster-table tbody tr")];
console.log("\nLignes de performances individuelles (semaine 1) :", perfRows.length, "(attendu > 0)");
if (!perfRows.length) throw new Error("❌ La semaine 1 (2 matchs joués) devrait afficher au moins une performance individuelle.");
const independentTeamTotals = win2.eval(`
  (function() {
    let totalPts = 0, playersWithLog = 0;
    teamA.players.forEach(p => {
      const log = (p.matchLog || []).filter(m => m.week === 1);
      if (log.length) { playersWithLog++; totalPts += log.reduce((s, m) => s + m.pts, 0); }
    });
    return { totalPts, playersWithLog };
  })()
`);
const displayedTotalPts = perfRows.reduce((s, r) => s + Number(r.children[3].textContent), 0);
console.log("Total de points affiché (semaine 1) :", displayedTotalPts, "| calculé indépendamment sur matchLog brut :", independentTeamTotals.totalPts);
if (displayedTotalPts !== independentTeamTotals.totalPts) {
  throw new Error(`❌ Le total de points affiché (${displayedTotalPts}) ne correspond pas au total calculé indépendamment sur matchLog brut (${independentTeamTotals.totalPts}).`);
}
if (perfRows.length !== independentTeamTotals.playersWithLog) {
  throw new Error(`❌ Le nombre de lignes de performances (${perfRows.length}) devrait correspondre au nombre de joueurs ayant joué cette semaine (${independentTeamTotals.playersWithLog}).`);
}
console.log("✅ Les performances individuelles de la semaine correspondent exactement aux totaux bruts de matchLog.");

// --- Les finances de la semaine ne sont plus affichées ici (retour
// utilisateur, 2026-09 : "finances de la semaine n'a rien à faire dans
// l'onglet stats hebdo") — doublon retiré, voir désormais l'onglet
// 💶 Économie (solde en début de semaine + journal des transactions). ---
if (doc2.getElementById("statsHebdoFinanceList")) {
  throw new Error("❌ Le bloc \"Finances de la semaine\" ne devrait plus exister dans Stats hebdo (doublon avec l'onglet Économie).");
}
if (doc2.getElementById("statsHebdoContent").textContent.includes("Finances de la semaine")) {
  throw new Error("❌ Le titre \"Finances de la semaine\" ne devrait plus apparaître dans Stats hebdo.");
}
console.log("✅ Le bloc \"Finances de la semaine\" a bien été retiré de l'onglet Stats hebdo (doublon avec l'onglet Économie).");

// --- Un joueur y est bien cliquable (fiche joueur, voir #45). ---
const weekPlayerLink = doc2.querySelector("#statsHebdoContent .player-link");
if (!weekPlayerLink) throw new Error("❌ Les performances individuelles devraient être des liens joueur cliquables (fiche joueur).");
weekPlayerLink.click();
const playerDetailVisible = !doc2.getElementById("playerDetailSection").classList.contains("hidden");
console.log(`${playerDetailVisible ? "✅" : "❌"} Cliquer sur un joueur depuis Stats hebdo ouvre bien sa fiche.`);
if (!playerDetailVisible) throw new Error("❌ Un lien joueur dans Stats hebdo devrait ouvrir la fiche joueur.");
doc2.getElementById("closePlayerDetailBtn").click();
const backToStatsHebdo = !doc2.getElementById("statsHebdoSection").classList.contains("hidden");
console.log(`${backToStatsHebdo ? "✅" : "❌"} '← Retour' depuis cette fiche ramène bien à Stats hebdo.`);
if (!backToStatsHebdo) throw new Error("❌ '← Retour' depuis la fiche joueur ouverte depuis Stats hebdo devrait y ramener exactement.");

await flush(dom2);
dom2.window.close();
server.close();

console.log("\n🏁 Tous les tests de l'onglet Stats hebdo sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
