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
// ":not(.boxscore-totals)" exclut la ligne de totaux ajoutée en bas du
// tableau (retour utilisateur, 2026-09 : "ça manque d'un petit total sur
// les différentes du box score"), vérifiée séparément plus bas.
const rowsA = [...doc2.querySelectorAll("#matchBoxscoreHolder table.boxscore tbody tr:not(.boxscore-totals)")];
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
  // "★ " est préfixé au nom du MVP du match (retour utilisateur, 2026-09,
  // voir boxscoreTableHtml/matchMvpCalloutHtml) : retiré ici pour comparer
  // le nom du joueur, pas son marquage visuel.
  const name = row.children[0].textContent.replace(/^★ /, "");
  const pts = Number(row.children[3].textContent); // Joueur, Poste, MIN, PTS...
  const expected = independentCheck.rows[i];
  if (name !== expected.name || pts !== expected.pts) {
    throw new Error(`❌ Ligne ${i} : affiché (${name}, ${pts} pts) ne correspond pas à matchLog brut (${expected.name}, ${expected.pts} pts).`);
  }
});
console.log("✅ La feuille de stats ouverte depuis le Calendrier correspond exactement à Player.matchLog pour ce match précis.");

// --- Retour utilisateur (2026-09) : "ça manque d'un petit total sur les
// différentes du box score et d'un mvp du match" : une ligne de totaux en
// bas de tableau, et un encart "MVP du match" au-dessus des onglets,
// commun aux deux équipes (un seul MVP pour tout le match, pas un par
// équipe, voir boxscoreMatchMvp). ---
const totalsRowA = doc2.querySelector("#matchBoxscoreHolder table.boxscore tbody tr.boxscore-totals");
if (!totalsRowA) throw new Error("❌ La feuille de stats devrait afficher une ligne de totaux en bas du tableau.");
const totalPtsA = Number(totalsRowA.children[3].textContent);
const expectedTotalPtsA = independentCheck.rows.reduce((sum, r) => sum + r.pts, 0);
if (totalPtsA !== expectedTotalPtsA) {
  throw new Error(`❌ Total PTS affiché (${totalPtsA}) ne correspond pas à la somme des lignes joueur (${expectedTotalPtsA}).`);
}
console.log(`✅ La ligne de totaux additionne bien les statistiques des joueurs (${totalPtsA} pts au total pour l'équipe A).`);

const mvpCallout = doc2.querySelector("#matchBoxscoreMvpHolder .mvp-callout");
if (!mvpCallout) throw new Error("❌ Un encart \"MVP du match\" devrait être affiché au-dessus de la feuille de statistiques.");
if (!/MVP du match/.test(mvpCallout.textContent)) {
  throw new Error(`❌ L'encart au-dessus de la feuille de statistiques devrait annoncer le MVP du match, obtenu : "${mvpCallout.textContent}".`);
}
// Le MVP du match (toutes équipes confondues, voir boxscoreMatchMvp) peut
// jouer dans l'équipe A OU B : sa ligne (classe boxscore-mvp-row) n'est
// donc pas garantie d'apparaître dans l'onglet A actuellement affiché.
const mvpStarRowOnA = !!doc2.querySelector("#matchBoxscoreHolder table.boxscore tbody tr.boxscore-mvp-row");

// --- Bascule vers l'onglet B, puis fermeture. ---
tabs[1].click();
const rowsB = [...doc2.querySelectorAll("#matchBoxscoreHolder table.boxscore tbody tr:not(.boxscore-totals)")];
if (!rowsB.length) throw new Error("❌ La feuille de stats de l'équipe B devrait aussi afficher au moins une ligne de joueur.");
console.log("✅ Bascule vers l'onglet de l'équipe B fonctionne.");

const mvpStarRowOnB = !!doc2.querySelector("#matchBoxscoreHolder table.boxscore tbody tr.boxscore-mvp-row");
if (!mvpStarRowOnA && !mvpStarRowOnB) {
  throw new Error("❌ La ligne du joueur MVP devrait être marquée (classe boxscore-mvp-row) dans le tableau de l'une des deux équipes.");
}
console.log(`✅ Un encart "MVP du match" est affiché, et la ligne correspondante est mise en avant dans le tableau de l'équipe concernée : ${mvpCallout.querySelector("b").textContent}.`);

// Le MVP du match reste le même (toutes équipes confondues), que l'onglet
// affiché soit A ou B : l'encart ne doit pas changer selon l'onglet actif.
const mvpCalloutAfterSwitch = doc2.querySelector("#matchBoxscoreMvpHolder .mvp-callout");
if (!mvpCalloutAfterSwitch || mvpCalloutAfterSwitch.textContent !== mvpCallout.textContent) {
  throw new Error("❌ Le MVP du match ne devrait pas changer en basculant d'onglet (un seul MVP pour tout le match).");
}
console.log("✅ Le MVP du match reste identique en basculant entre les deux équipes.");

const closeBtn = doc2.getElementById("matchBoxscoreCloseBtn");
closeBtn.click();
if (doc2.getElementById("matchBoxscoreOverlay")) throw new Error("❌ Le bouton Fermer devrait fermer la feuille de statistiques.");
console.log("✅ La feuille de statistiques se ferme bien via le bouton Fermer.");

await flush(dom2);
dom2.window.close();
server.close();

console.log("\n🏁 Tous les tests du boxscore d'un match passé (onglet Calendrier) sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
