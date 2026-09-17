// Vérifie #58 (retour utilisateur, 2026-09) : "sur l'onglet calendrier,
// quand un match est fini, je dois pouvoir cliquer sur le score pour voir
// le boxscore". Voir showMatchBoxscore/boxscoreRowsFromMatchLog dans
// moteurbasket3.html. Reconstitué depuis Player.matchLog (déjà alimenté
// pour chaque match réellement simulé, voir recordMatchStatsForTeam côté
// moteur), AUCUNE nouvelle donnée persistée.
const fs = require("fs");
const { startTestServer, openGame, flush, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();

// --- Partie 1 : avant tout match joué, le score ("–") n'est PAS un bouton
// cliquable (rien à montrer). ---
const dom1 = await openGame(html, baseUrl);
const doc1 = dom1.window.document;
[...doc1.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "calendrier").click();
if (doc1.querySelector("#calendrierContent .calendar-score-btn")) {
  throw new Error("❌ Avant tout match joué, aucun score ne devrait être cliquable (rien à afficher).");
}
console.log("✅ Avant tout match joué, aucun bouton de score cliquable dans le Calendrier.");
await flush(dom1);
dom1.window.close();

// --- Partie 2 : 1 journée jouée, le score devient cliquable et ouvre le
// bon boxscore, recoupé avec matchLog brut. ---
fastForwardCalendar(savePath, 1);
const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;
doc2.getElementById("catchupContinueBtn").click();
[...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "calendrier").click();

const scoreBtn = doc2.querySelector("#calendrierContent .calendar-score-btn");
if (!scoreBtn) throw new Error("❌ Après un match joué, son score devrait être un bouton cliquable.");
console.log("\nBouton de score trouvé, texte :", scoreBtn.textContent.trim());
scoreBtn.click();

const overlay = doc2.getElementById("matchBoxscoreOverlay");
if (!overlay) throw new Error("❌ Cliquer sur le score devrait ouvrir la feuille de statistiques.");
const tabs = [...overlay.querySelectorAll(".bs-tab")];
if (tabs.length !== 2) throw new Error("❌ La feuille de statistiques devrait avoir 2 onglets (domicile/extérieur).");
console.log("Onglets de la feuille de stats :", tabs.map(t => t.textContent));

// Recoupe la ligne du meilleur marqueur de l'onglet A (déjà actif) avec
// matchLog brut de la MÊME équipe/round/compétition, sans dépendre du nom
// affiché sur le bouton (qui, lui, dépend du point de vue "mon équipe").
const rowsA = [...doc2.querySelectorAll("#matchBoxscoreHolder table.boxscore tbody tr")];
if (!rowsA.length) throw new Error("❌ La feuille de stats de l'équipe A devrait afficher au moins une ligne de joueur.");
// Même tri (minutes décroissantes) que boxscoreRowsFromMatchLog côté
// production, pour comparer terme à terme SANS dépendre du nom (deux
// joueurs générés aléatoirement peuvent homonymes).
const independentCheck = win2.eval(`
  (function() {
    const round0 = league.results.find(r => r.round === 0 && (r.home === myTeamIndex || r.away === myTeamIndex));
    const homeTeam = league.teams[round0.home];
    const rows = homeTeam.players
      .map(p => { const e = (p.matchLog || []).find(m => m.round === 0 && m.competition === "championship"); return e ? { name: p.name, min: e.min, pts: e.pts } : null; })
      .filter(Boolean)
      .sort((a, b) => b.min - a.min);
    return { homeName: homeTeam.name, rows };
  })()
`);
console.log("Nom de l'équipe A affiché dans l'onglet :", tabs[0].textContent, "| attendu :", independentCheck.homeName);
if (tabs[0].textContent !== independentCheck.homeName) throw new Error("❌ Le nom de l'onglet A devrait être celui de l'équipe à domicile de ce match.");
if (rowsA.length !== independentCheck.rows.length) {
  throw new Error(`❌ Le nombre de lignes affichées (${rowsA.length}) devrait correspondre au nombre de joueurs ayant joué ce match d'après matchLog brut (${independentCheck.rows.length}).`);
}
rowsA.forEach((row, i) => {
  const name = row.children[0].textContent;
  const pts = Number(row.children[3].textContent); // Joueur, Poste, MIN, PTS...
  const expected = independentCheck.rows[i];
  if (name !== expected.name || pts !== expected.pts) {
    throw new Error(`❌ Ligne ${i} : affiché (${name}, ${pts} pts) ne correspond pas à matchLog brut (${expected.name}, ${expected.pts} pts).`);
  }
});
console.log("✅ La feuille de stats ouverte depuis le Calendrier correspond exactement à Player.matchLog pour ce match précis.");

// --- Bascule vers l'onglet B, puis fermeture. ---
tabs[1].click();
const rowsB = [...doc2.querySelectorAll("#matchBoxscoreHolder table.boxscore tbody tr")];
if (!rowsB.length) throw new Error("❌ La feuille de stats de l'équipe B devrait aussi afficher au moins une ligne de joueur.");
console.log("✅ Bascule vers l'onglet de l'équipe B fonctionne.");

const closeBtn = doc2.getElementById("matchBoxscoreCloseBtn");
closeBtn.click();
if (doc2.getElementById("matchBoxscoreOverlay")) throw new Error("❌ Le bouton Fermer devrait fermer la feuille de statistiques.");
console.log("✅ La feuille de statistiques se ferme bien via le bouton Fermer.");

await flush(dom2);
dom2.window.close();
server.close();

console.log("\n🏁 Tous les tests du boxscore d'un match passé (onglet Calendrier) sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
