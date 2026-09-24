// Vérifie le score par quart-temps affiché sur la "Feuille de statistiques"
// d'un match déjà joué (retour Discord d'Ariane, relayé par l'utilisateur,
// 2026-09-24 : "afficher le score par quart-temps sur la boxscore du
// match" — voir DEV_NOTES.md). `quarterScores` existait déjà côté moteur
// (MatchEngine.simulate()) mais n'était jusqu'ici jamais propagée au-delà :
// ce test couvre toute la chaîne, de simulateOrForfeit/recordMatchStats
// AndAwardMvp (moteur) jusqu'à boxscoreQuarterScoresHtml (client), voir
// showMatchBoxscore/matchQuarterScoresFromTeam dans moteurbasket3.html.
// Même patron que calendrier_boxscore_test.js (déjà couvert par ailleurs
// pour le reste de la feuille de stats) — ce fichier-ci se concentre
// uniquement sur ce qui est NOUVEAU : le tableau de quarts-temps.
const fs = require("fs");
const { startTestServer, openGame, flush, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();

// Première ouverture nécessaire pour créer la sauvegarde initiale (voir le
// même patron dans player_season_stats_modal_test.js/mvp_avatar_test.js)
// avant de pouvoir avancer le calendrier avec fastForwardCalendar.
const domInit = await openGame(html, baseUrl);
await flush(domInit);
await domInit.window.close();

fastForwardCalendar(savePath, 1);
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
doc.getElementById("catchupContinueBtn").click();
[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "calendrier").click();

const scoreBtn = doc.querySelector("#calendrierContent .calendar-score-btn");
if (!scoreBtn) throw new Error("❌ Après un match joué, son score devrait être un bouton cliquable.");
scoreBtn.click();

const overlay = doc.getElementById("matchBoxscoreOverlay");
if (!overlay) throw new Error("❌ Cliquer sur le score devrait ouvrir la feuille de statistiques.");

// ---------------------------------------------------------------------
// Partie 1 : le tableau de quarts-temps est bien présent, AU-DESSUS des
// onglets domicile/extérieur (une seule fois pour tout le match, pas par
// équipe affichée) — recoupé avec quarterScores brut du matchLog.
// ---------------------------------------------------------------------
const independent = win.eval(`
  (function() {
    const round0 = league.results.find(r => r.round === 0 && (r.home === myTeamIndex || r.away === myTeamIndex));
    const homeTeam = league.teams[round0.home];
    const awayTeam = league.teams[round0.away];
    const entryHome = homeTeam.players.map(p => (p.matchLog || []).find(m => m.round === 0 && m.competition === "championship")).find(Boolean);
    return {
      homeName: homeTeam.name, awayName: awayTeam.name,
      scoreHome: round0.scoreHome, scoreAway: round0.scoreAway,
      quarterScores: entryHome ? entryHome.quarterScores : null,
    };
  })()
`);
if (!independent.quarterScores) throw new Error("❌ (setup) Le matchLog du 1er joueur de l'équipe à domicile devrait porter quarterScores pour ce match.");
console.log(`Match de référence : ${independent.homeName} ${independent.scoreHome} - ${independent.scoreAway} ${independent.awayName}, quarts-temps : ${JSON.stringify(independent.quarterScores)}.`);

const quartersHolder = doc.getElementById("matchBoxscoreQuartersHolder");
if (!quartersHolder) throw new Error("❌ La feuille de statistiques devrait contenir un bloc #matchBoxscoreQuartersHolder.");
const quarterTable = quartersHolder.querySelector("table.quarter-scores-table");
if (!quarterTable) throw new Error("❌ #matchBoxscoreQuartersHolder devrait contenir le tableau des quarts-temps.");
console.log("✅ Le tableau des quarts-temps est bien affiché sur la feuille de statistiques.");

// Placé AVANT .boxscore-toggle (indépendant de l'onglet domicile/extérieur
// actif) — vérifié via l'ordre des éléments dans le DOM.
const boxToggle = overlay.querySelector(".boxscore-toggle");
if (!(quartersHolder.compareDocumentPosition(boxToggle) & win.Node.DOCUMENT_POSITION_FOLLOWING)) {
  throw new Error("❌ Le tableau des quarts-temps devrait apparaître AVANT les onglets domicile/extérieur (commun aux deux équipes).");
}
console.log("✅ Le tableau des quarts-temps apparaît bien au-dessus des onglets (une seule fois pour tout le match).");

// ---------------------------------------------------------------------
// Partie 2 : en-têtes (4 quarts-temps, sauf prolongation), une ligne par
// équipe avec le bon nom, les bons scores par quart, et le bon total —
// recoupé terme à terme avec matchLog brut ET avec league.results.
// ---------------------------------------------------------------------
const headers = [...quarterTable.querySelectorAll("thead th")].map(th => th.textContent.trim());
const qCount = independent.quarterScores.home.length;
const expectedHeaders = ["", ...Array.from({ length: qCount }, (_, i) => i < 4 ? `${i + 1}${i === 0 ? "er" : "e"}` : `Prol. ${i - 3}`), "Total"];
if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
  throw new Error(`❌ En-têtes attendus ${JSON.stringify(expectedHeaders)}, obtenu ${JSON.stringify(headers)}.`);
}
console.log(`✅ Les en-têtes du tableau des quarts-temps sont corrects (${qCount} quart(s)-temps).`);

const bodyRows = [...quarterTable.querySelectorAll("tbody tr")];
if (bodyRows.length !== 2) throw new Error(`❌ Le tableau des quarts-temps devrait avoir exactement 2 lignes (domicile/extérieur), obtenu ${bodyRows.length}.`);

function checkRow(row, expectedName, expectedQuarters, expectedTotal) {
  const cells = [...row.children].map(td => td.textContent.trim());
  if (cells[0] !== expectedName) throw new Error(`❌ Nom d'équipe attendu "${expectedName}", obtenu "${cells[0]}".`);
  const quarters = cells.slice(1, 1 + expectedQuarters.length).map(Number);
  if (JSON.stringify(quarters) !== JSON.stringify(expectedQuarters)) {
    throw new Error(`❌ Scores par quart-temps attendus ${JSON.stringify(expectedQuarters)} pour ${expectedName}, obtenu ${JSON.stringify(quarters)}.`);
  }
  const total = Number(cells[cells.length - 1]);
  if (total !== expectedTotal) throw new Error(`❌ Total attendu ${expectedTotal} pour ${expectedName}, obtenu ${total}.`);
  const sumOfQuarters = expectedQuarters.reduce((a, b) => a + b, 0);
  if (sumOfQuarters !== expectedTotal) throw new Error(`❌ (garde-fou) La somme des quarts-temps (${sumOfQuarters}) devrait égaler le total (${expectedTotal}).`);
}
checkRow(bodyRows[0], independent.homeName, independent.quarterScores.home, independent.scoreHome);
checkRow(bodyRows[1], independent.awayName, independent.quarterScores.away, independent.scoreAway);
console.log("✅ Les scores par quart-temps (et leur total) correspondent exactement à matchLog brut et au score final du match, pour les deux équipes.");

// Le tableau ne doit PAS changer en basculant d'onglet (commun aux deux
// équipes, pas re-rendu par renderMatchBoxscoreTab).
[...overlay.querySelectorAll(".bs-tab")][1].click();
const quarterTableAfterSwitch = doc.getElementById("matchBoxscoreQuartersHolder").querySelector("table.quarter-scores-table");
if (!quarterTableAfterSwitch || quarterTableAfterSwitch.textContent !== quarterTable.textContent) {
  throw new Error("❌ Le tableau des quarts-temps ne devrait pas changer en basculant d'onglet domicile/extérieur.");
}
console.log("✅ Le tableau des quarts-temps reste identique en basculant entre les deux équipes.");

await flush(dom);
dom.window.close();
server.close();

console.log("\n🏁 Tous les tests du score par quart-temps sur la feuille de statistiques sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
