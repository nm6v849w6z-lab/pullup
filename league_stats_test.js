// Vérifie les stats de la ligue + le MVP de la dernière journée sur
// l'onglet Ligue (retour utilisateur, 2026-09 : "stats de la Ligue + MVP de
// la dernière journée" — voir Player.matchLog / recordMatchStatsForTeam
// côté moteur, déjà couvert en détail par club_facilities_test.js pour la
// persistance ; ce fichier-ci vérifie la couche d'agrégation + l'affichage
// UI, voir renderLeagueStatsPanel/computeSeasonPlayerStats/
// computeLastMatchdayMvp dans moteurbasket3.html).
const fs = require("fs");
const { startTestServer, openGame, flush, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();

// ---------------------------------------------------------------------
// Partie 1 : avant tout match joué — aucun MVP, message d'attente propre,
// pas de crash sur un classement de stats vide.
// ---------------------------------------------------------------------
const dom1 = await openGame(html, baseUrl);
const doc1 = dom1.window.document;
doc1.getElementById("regenBtn").click(); // "📊 Classement"
const panelBefore = doc1.getElementById("leagueStatsPanel").textContent;
console.log("Panneau de stats avant tout match (extrait) :", panelBefore.replace(/\s+/g, " ").slice(0, 200));
if (!panelBefore.includes("Aucune journée de championnat jouée")) {
  throw new Error("❌ Avant le premier match, le panneau devrait indiquer qu'aucune journée n'a encore été jouée (pas de MVP).");
}
if (!panelBefore.includes("Aucune statistique de saison disponible")) {
  throw new Error("❌ Avant le premier match, le panneau devrait indiquer qu'aucune statistique de saison n'est encore disponible.");
}
console.log("✅ Avant tout match joué, le panneau de stats de la ligue affiche des messages d'attente propres, sans crash.");
await flush(dom1);
dom1.window.close();

// ---------------------------------------------------------------------
// Partie 2 : 3 journées de championnat jouées (fastForwardCalendar, même
// mécanisme que calendar_test.js) — MVP réel de la 3e journée, classements
// de stats peuplés et cohérents avec les totaux bruts de matchLog.
// ---------------------------------------------------------------------
fastForwardCalendar(savePath, 3);
const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;
doc2.getElementById("catchupContinueBtn").click(); // referme le récapitulatif d'absence
doc2.getElementById("regenBtn").click(); // "📊 Classement"

const panelHtml = doc2.getElementById("leagueStatsPanel").innerHTML;
const mvpText = doc2.querySelector("#leagueStatsPanel .mvp-callout").textContent.replace(/\s+/g, " ").trim();
console.log("\nMVP de la dernière journée jouée :", mvpText);
if (!/MVP de la journée 3/.test(mvpText)) {
  throw new Error("❌ Après 3 journées jouées, le MVP affiché devrait porter sur la journée 3 (la dernière jouée), obtenu : " + mvpText);
}
if (!/\d+ pts, \d+ reb, \d+ pas/.test(mvpText)) {
  throw new Error("❌ La ligne de stats du MVP devrait afficher au moins points/rebonds/passes, obtenu : " + mvpText);
}
console.log("✅ Le MVP affiché porte bien sur la dernière journée réellement jouée (journée 3), avec sa ligne de stats.");

// Retour utilisateur (2026-09) : "pour le mvp de la journée, mets plus de
// stats, et mets l'évaluation". La ligne doit maintenant couvrir aussi
// interceptions/contres, le détail des tirs (2pts/3pts) et le score
// d'évaluation lui-même (déjà calculé pour élire ce MVP, jamais affiché
// avant).
if (!/\d+ int, \d+ ctr/.test(mvpText)) {
  throw new Error("❌ La ligne de stats du MVP devrait aussi afficher interceptions et contres, obtenu : " + mvpText);
}
if (!/\d+\/\d+ à 2pts, \d+\/\d+ à 3pts/.test(mvpText)) {
  throw new Error("❌ La ligne de stats du MVP devrait afficher le détail des tirs à 2pts/3pts, obtenu : " + mvpText);
}
if (!/évaluation -?\d+/.test(mvpText)) {
  throw new Error("❌ La ligne de stats du MVP devrait afficher son score d'évaluation, obtenu : " + mvpText);
}
console.log("✅ La ligne de stats du MVP couvre bien interceptions/contres, le détail des tirs, et le score d'évaluation.");

// Recoupe le MVP affiché avec un calcul indépendant fait directement sur les
// matchLog bruts de TOUTES les équipes (pas seulement le club du joueur),
// pour vérifier que computeLastMatchdayMvp regarde bien toute la ligue.
const independentBest = win2.eval(`
  (function() {
    let best = null;
    league.teams.forEach(team => {
      team.players.forEach(p => {
        const e = (p.matchLog || []).find(m => m.competition === "championship" && m.round === 2);
        if (!e) return;
        const ev = e.pts + e.reb + e.ast + e.stl + e.blk
          - ((e.fga2 - e.fgm2) + (e.fga3 - e.fgm3) + (e.fta - e.ftm)) - e.tov - e.pf;
        if (!best || ev > best.ev) best = { name: p.name, team: team.name, ev };
      });
    });
    return best;
  })()
`);
console.log("Meilleure évaluation calculée indépendamment (journée 3, round index 2) :", independentBest);
if (!mvpText.includes(independentBest.name) || !mvpText.includes(independentBest.team)) {
  throw new Error(`❌ Le MVP affiché (${mvpText}) ne correspond pas au meilleur score d'évaluation calculé indépendamment sur toute la ligue (${independentBest.name}, ${independentBest.team}).`);
}
console.log("✅ Le MVP correspond bien au meilleur score d'évaluation toutes équipes confondues (pas seulement le club du joueur).");
if (!mvpText.includes(`évaluation ${independentBest.ev}`)) {
  throw new Error(`❌ Le score d'évaluation affiché devrait être ${independentBest.ev} (calculé indépendamment), obtenu : ${mvpText}.`);
}
console.log("✅ Le score d'évaluation affiché correspond exactement au calcul indépendant.");

// Classements de stats : au moins une carte par catégorie, avec des lignes
// non vides, triées dans le bon ordre (décroissant) pour chaque catégorie.
const cards = [...doc2.querySelectorAll("#leagueStatsPanel .stats-leader-card")];
console.log("\nCatégories de classement affichées :", cards.map(c => c.querySelector("h4").textContent).join(", "));
if (cards.length !== 6) throw new Error("❌ 6 catégories de classement de stats attendues (Points/Rebonds/Passes/Interceptions/Contres/Évaluation), obtenu : " + cards.length);
let allSortedDesc = true;
let allNonEmpty = true;
cards.forEach(card => {
  const items = [...card.querySelectorAll("li")];
  if (!items.length) allNonEmpty = false;
  const values = items.map(li => parseFloat(li.textContent.split("·")[1]));
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) allSortedDesc = false;
  }
});
console.log(`${allNonEmpty ? "✅" : "❌"} Chaque catégorie de classement affiche au moins un joueur.`);
console.log(`${allSortedDesc ? "✅" : "❌"} Chaque catégorie de classement est triée par ordre décroissant.`);
if (!allNonEmpty || !allSortedDesc) throw new Error("❌ Les classements de stats de la ligue devraient être non vides et triés par ordre décroissant.");

// Recoupe le premier de "Points / match" avec un calcul indépendant sur les
// matchLog bruts (moyenne exacte sur les 3 journées jouées).
const independentTopScorer = win2.eval(`
  (function() {
    let best = null;
    league.teams.forEach(team => {
      team.players.forEach(p => {
        const log = (p.matchLog || []).filter(m => m.competition === "championship");
        if (!log.length) return;
        const avg = log.reduce((s, m) => s + m.pts, 0) / log.length;
        if (!best || avg > best.avg) best = { name: p.name, team: team.name, avg };
      });
    });
    return best;
  })()
`);
const topScorerCard = cards.find(c => c.querySelector("h4").textContent.startsWith("Points"));
const topScorerLine = topScorerCard.querySelector("li").textContent;
console.log("\nMeilleur marqueur affiché :", topScorerLine.replace(/\s+/g, " "), "| calculé indépendamment :", independentTopScorer);
if (!topScorerLine.includes(independentTopScorer.name) || !topScorerLine.includes(independentTopScorer.avg.toFixed(1))) {
  throw new Error(`❌ Le meilleur marqueur affiché (${topScorerLine}) ne correspond pas à la moyenne calculée indépendamment (${independentTopScorer.name} : ${independentTopScorer.avg.toFixed(1)}).`);
}
console.log("✅ La moyenne de points affichée pour le meilleur marqueur correspond exactement au calcul indépendant sur matchLog.");

// ---------------------------------------------------------------------
// Partie 3 (retour utilisateur, 2026-09-23, capture du site EuroLeague/
// stats) : "le premier aurait son avatar, on affiche les 5 premiers, si on
// clique sur le bouton afficher en bas, on aurait les 20 premiers" — le
// n°1 de chaque carte affiche un avatar, 5 lignes par défaut, un clic sur
// "Afficher tout" déplie jusqu'à 20 (et se réplie avec un second clic).
// ---------------------------------------------------------------------
cards.forEach(card => {
  const firstLi = card.querySelector("li");
  if (!firstLi.classList.contains("stats-leader-first")) {
    throw new Error(`❌ Le premier <li> de chaque carte devrait porter la classe "stats-leader-first" (mise en avant EuroLeague), obtenu pour "${card.querySelector("h4").textContent}".`);
  }
  if (!firstLi.querySelector(".player-avatar")) {
    throw new Error(`❌ Le n°1 de chaque carte devrait afficher son avatar (playerAvatarHtml), absent pour "${card.querySelector("h4").textContent}".`);
  }
});
console.log("✅ Le n°1 de chaque carte affiche bien son avatar (mise en avant façon EuroLeague).");

const totalPlayers = win2.eval("league.teams.reduce((s, t) => s + t.players.length, 0)");
console.log(`Nombre total de joueurs dans la ligue (pour vérifier top 5 -> top 20) : ${totalPlayers}`);

const pointsCard = cards.find(c => c.querySelector("h4").textContent.startsWith("Points"));
const itemsBefore = pointsCard.querySelectorAll("li").length;
if (itemsBefore !== 5) throw new Error(`❌ Par défaut, chaque carte devrait afficher 5 joueurs, obtenu : ${itemsBefore}.`);
console.log("✅ Par défaut, 5 joueurs affichés par carte.");

const expandBtn = pointsCard.querySelector("[data-stats-expand-cat='pts']");
if (!expandBtn) throw new Error("❌ Bouton \"Afficher tout\" introuvable sur la carte Points (la ligue de test devrait compter plus de 5 joueurs éligibles).");
if (!/Afficher tout/.test(expandBtn.textContent)) {
  throw new Error(`❌ Le bouton devrait afficher "Afficher tout" avant d'être déplié, obtenu : "${expandBtn.textContent}".`);
}

expandBtn.click();
const itemsAfterExpand = doc2.querySelector("#leagueStatsPanel .stats-leader-card [data-stats-expand-cat='pts']").closest(".stats-leader-card").querySelectorAll("li").length;
const expectedExpanded = Math.min(20, totalPlayers);
console.log(`Nombre de joueurs affichés après clic sur "Afficher tout" : ${itemsAfterExpand} (attendu : ${expectedExpanded})`);
if (itemsAfterExpand !== expectedExpanded) {
  throw new Error(`❌ Après avoir cliqué sur "Afficher tout", la carte Points devrait afficher ${expectedExpanded} joueurs (top 20, ou moins si la ligue en compte moins), obtenu : ${itemsAfterExpand}.`);
}
const expandBtnAfter = doc2.querySelector("#leagueStatsPanel .stats-leader-card [data-stats-expand-cat='pts']");
if (!/Réduire/.test(expandBtnAfter.textContent)) {
  throw new Error(`❌ Après dépliage, le bouton devrait proposer de "Réduire", obtenu : "${expandBtnAfter.textContent}".`);
}
console.log("✅ Un clic sur \"Afficher tout\" déplie bien la carte Points jusqu'au top 20 (ou moins si la ligue en compte moins).");

expandBtnAfter.click();
const itemsAfterCollapse = doc2.querySelector("#leagueStatsPanel .stats-leader-card [data-stats-expand-cat='pts']").closest(".stats-leader-card").querySelectorAll("li").length;
if (itemsAfterCollapse !== 5) {
  throw new Error(`❌ Un second clic ("Réduire") devrait revenir à 5 joueurs affichés, obtenu : ${itemsAfterCollapse}.`);
}
console.log("✅ Un second clic (\"Réduire\") replie bien la carte à 5 joueurs.");

// Les AUTRES cartes ne doivent pas avoir été affectées par le clic sur
// celle de Points (état de dépliage indépendant par catégorie).
const otherCardsStillCollapsed = [...doc2.querySelectorAll("#leagueStatsPanel .stats-leader-card")]
  .filter(c => !c.querySelector("h4").textContent.startsWith("Points"))
  .every(c => c.querySelectorAll("li").length <= 5);
if (!otherCardsStillCollapsed) {
  throw new Error("❌ Déplier/replier la carte Points ne devrait pas affecter l'état des autres catégories.");
}
console.log("✅ L'état déplié/replié est bien indépendant par catégorie.");

await flush(dom2);
dom2.window.close();
server.close();

console.log("\n🏁 Tous les tests des stats de la ligue + MVP de la dernière journée sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
