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
const panelBefore = doc1.getElementById("standingsSection").textContent;
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

// Refonte de la page Ligue (2026-09-25, maquette "ligue-apercu.html") : le
// MVP de la journée est une carte .lg-mvp dans la colonne de droite
// (#standingsContent) — évaluation en grand, stats en pastilles (PTS, REB,
// PAS, INT, CTR, BP), barres de tir 2 pts / 3 pts / LF.
const mvpCard = doc2.querySelector("#standingsContent .lg-mvp");
const mvpText = mvpCard.textContent.replace(/\s+/g, " ").trim();
console.log("\nMVP de la dernière journée jouée :", mvpText);
if (!/MVP de la journée 3/.test(mvpText)) {
  throw new Error("❌ Après 3 journées jouées, le MVP affiché devrait porter sur la journée 3 (la dernière jouée), obtenu : " + mvpText);
}
const chipLabels = [...mvpCard.querySelectorAll(".lg-chips span")].map(s => s.textContent);
if (JSON.stringify(chipLabels) !== JSON.stringify(["PTS", "REB", "PAS", "INT", "CTR", "BP"])) {
  throw new Error("❌ Les pastilles du MVP devraient être PTS/REB/PAS/INT/CTR/BP, obtenu : " + JSON.stringify(chipLabels));
}
const shotLabels = [...mvpCard.querySelectorAll(".lg-shot > span:first-child")].map(s => s.textContent);
if (JSON.stringify(shotLabels) !== JSON.stringify(["2 pts", "3 pts", "LF"])) {
  throw new Error("❌ Les barres de tir du MVP devraient couvrir 2 pts / 3 pts / LF, obtenu : " + JSON.stringify(shotLabels));
}
console.log("✅ Le MVP affiché porte bien sur la journée 3, avec ses pastilles de stats et ses barres de tir.");

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
const shownEval = mvpCard.querySelector(".lg-mvp-eval").firstChild.textContent.trim();
const shownPts = mvpCard.querySelector(".lg-chips b").textContent;
const independentPts = win2.eval(`league.teams.flatMap(t => t.players).find(p => p.name === ${JSON.stringify(independentBest.name)}).matchLog.find(m => m.competition === "championship" && m.round === 2).pts`);
if (shownPts !== String(independentPts)) throw new Error(`❌ La pastille PTS du MVP (${shownPts}) devrait valoir ${independentPts}.`);
if (shownEval !== String(independentBest.ev)) {
  throw new Error(`❌ Le score d'évaluation affiché devrait être ${independentBest.ev} (calculé indépendamment), obtenu : ${mvpText}.`);
}
console.log("✅ Le score d'évaluation affiché correspond exactement au calcul indépendant.");

// Leaders de la ligue (refonte 2026-09-25) : une carte .lg-card par
// catégorie, le n°1 dans .lg-lead (avatar + grosse valeur), les suivants
// dans une <ol> (rang explicite .lg-r, valeur .lg-v, barre relative au n°1).
const cardsOf = () => [...doc2.querySelectorAll("#leagueStatsPanel .lg-card")];
const cardValues = card => [card.querySelector(".lg-lead-v"), ...card.querySelectorAll("li .lg-v")].map(el => parseFloat(el.textContent));
const cardNamed = label => cardsOf().find(c => c.querySelector("h3").textContent.startsWith(label));
let cards = cardsOf();
console.log("\nCatégories de classement affichées :", cards.map(c => c.querySelector("h3").textContent).join(", "));
if (cards.length !== 6) throw new Error("❌ 6 catégories de classement de stats attendues (Points/Rebonds/Passes/Interceptions/Contres/Évaluation), obtenu : " + cards.length);
cards.forEach(card => {
  const label = card.querySelector("h3").textContent;
  const values = cardValues(card);
  if (values.length !== 5 || values.some(Number.isNaN)) throw new Error(`❌ "${label}" devrait afficher 5 valeurs numériques par défaut, obtenu : ${JSON.stringify(values)}.`);
  for (let i = 1; i < values.length; i++) if (values[i] > values[i - 1]) throw new Error(`❌ "${label}" n'est pas triée par ordre décroissant : ${JSON.stringify(values)}.`);
  if (!card.querySelector(".lg-lead .player-avatar")) throw new Error(`❌ Le n°1 de "${label}" devrait afficher son avatar.`);
  const ranks = [...card.querySelectorAll("li .lg-r")].map(s => s.textContent);
  if (JSON.stringify(ranks) !== JSON.stringify(["2", "3", "4", "5"])) throw new Error(`❌ Rangs 2-5 attendus pour "${label}", obtenu : ${JSON.stringify(ranks)}.`);
  const teamLinks = card.querySelectorAll(".lg-code .team-link");
  if (teamLinks.length !== 5) throw new Error(`❌ "${label}" devrait afficher 5 codes d'équipe cliquables, obtenu : ${teamLinks.length}.`);
  const players = card.querySelectorAll(".player-link");
  if (players.length !== 5) throw new Error(`❌ "${label}" devrait afficher 5 liens joueur, obtenu : ${players.length}.`);
});
console.log("✅ 6 cartes de leaders, 5 joueurs chacune, triées, n°1 avec avatar, rangs 2-5, codes d'équipe cliquables.");

// Joueurs du club du manager en ambre (.lg-mine-p) : exactement ceux de
// myTeamIndex.
const myIdx = win2.eval("myTeamIndex");
const mineOk = cards.every(card => [...card.querySelectorAll(".lg-lead, li")].every(el =>
  el.classList.contains("lg-mine-p") === (Number(el.querySelector(".player-link").dataset.playerTeam) === myIdx)));
if (!mineOk) throw new Error("❌ .lg-mine-p devrait marquer exactement les joueurs du club du manager.");
console.log("✅ Les joueurs du club du manager sont mis en évidence (et eux seuls).");

// Recoupe le premier de "Points" avec un calcul indépendant (moyenne exacte).
const independentTopScorer = win2.eval(`
  (function() {
    let best = null;
    league.teams.forEach(team => {
      team.players.forEach(p => {
        const log = (p.matchLog || []).filter(m => m.competition === "championship");
        if (!log.length) return;
        const avg = log.reduce((s, m) => s + m.pts, 0) / log.length;
        const tot = log.reduce((s, m) => s + m.pts, 0);
        if (!best || avg > best.avg) best = { name: p.name, team: team.name, avg, tot };
      });
    });
    return best;
  })()
`);
const leadLine = cardNamed("Points").querySelector(".lg-lead").textContent;
console.log("\nMeilleur marqueur affiché :", leadLine.replace(/\s+/g, " "), "| calculé indépendamment :", independentTopScorer);
if (!leadLine.includes(independentTopScorer.name) || !leadLine.includes(independentTopScorer.avg.toFixed(1))) {
  throw new Error(`❌ Le meilleur marqueur affiché (${leadLine}) ne correspond pas au calcul indépendant (${independentTopScorer.name} : ${independentTopScorer.avg.toFixed(1)}).`);
}
console.log("✅ La moyenne de points du meilleur marqueur correspond au calcul indépendant sur matchLog.");

// Clic sur un code d'équipe -> fiche équipe.
const someTeamLink = cardNamed("Points").querySelector("li .team-link");
const clickedTeamIdx = Number(someTeamLink.dataset.teamIdx);
someTeamLink.click();
if (doc2.getElementById("teamDetailSection").classList.contains("hidden") || win2.eval("teamDetailIdx") !== clickedTeamIdx) {
  throw new Error("❌ Cliquer sur un code d'équipe dans un classement de stats devrait ouvrir sa fiche équipe.");
}
console.log("✅ Cliquer sur un code d'équipe ouvre bien sa fiche équipe.");
win2.eval("hideTeamDetail();");
doc2.getElementById("regenBtn").click();

// "Classement complet" : top 20 puis "Réduire", indépendamment par carte.
const totalPlayers = win2.eval("league.teams.reduce((s, t) => s + t.players.length, 0)");
const expandBtn = cardNamed("Points").querySelector("[data-stats-expand-cat='pts']");
if (!expandBtn || !/Classement complet/.test(expandBtn.textContent)) throw new Error("❌ Bouton \"Classement complet\" introuvable sur la carte Points.");
expandBtn.click();
const expectedExpanded = Math.min(20, totalPlayers);
const expandedCount = 1 + cardNamed("Points").querySelectorAll("li").length;
if (expandedCount !== expectedExpanded) throw new Error(`❌ Après "Classement complet", ${expectedExpanded} joueurs attendus, obtenu : ${expandedCount}.`);
const expandedRanks = [...cardNamed("Points").querySelectorAll("li .lg-r")].map(s => s.textContent);
if (expandedRanks[expandedRanks.length - 1] !== String(expectedExpanded)) throw new Error("❌ Le dernier rang affiché devrait être " + expectedExpanded);
if (!/Réduire/.test(cardNamed("Points").querySelector("[data-stats-expand-cat='pts']").textContent)) throw new Error("❌ Une fois dépliée, le bouton devrait proposer \"Réduire\".");
if (!cardsOf().filter(c => c !== cardNamed("Points")).every(c => c.querySelectorAll("li").length <= 4)) throw new Error("❌ Déplier Points ne devrait pas déplier les autres cartes.");
cardNamed("Points").querySelector("[data-stats-expand-cat='pts']").click();
if (cardNamed("Points").querySelectorAll("li").length !== 4) throw new Error("❌ \"Réduire\" devrait revenir au top 5.");
console.log(`✅ "Classement complet" déplie la carte Points jusqu'au top ${expectedExpanded}, "Réduire" la replie, les autres cartes ne bougent pas.`);

// Bascule Moyennes / Totaux : valeurs entières, tri sur les totaux, unité.
doc2.querySelector("#leagueStatsPanel [data-lg-mode='tot']").click();
if (doc2.querySelector("#leagueStatsPanel [data-lg-mode='tot']").getAttribute("aria-pressed") !== "true") throw new Error("❌ Le bouton Totaux devrait être actif après clic.");
cardsOf().forEach(card => {
  const values = cardValues(card);
  for (let i = 1; i < values.length; i++) if (values[i] > values[i - 1]) throw new Error(`❌ En Totaux, "${card.querySelector("h3").textContent}" devrait être triée par total décroissant : ${JSON.stringify(values)}.`);
  if (![card.querySelector(".lg-lead-v"), ...card.querySelectorAll("li .lg-v")].every(el => /^-?\d+$/.test(el.textContent))) throw new Error("❌ En Totaux, les valeurs devraient être des entiers.");
});
const independentTopTotal = win2.eval(`Math.max(...league.teams.flatMap(t => t.players).map(p => (p.matchLog || []).filter(m => m.competition === "championship").reduce((s, m) => s + m.pts, 0)))`);
if (cardNamed("Points").querySelector(".lg-lead-v").textContent !== String(independentTopTotal)) throw new Error(`❌ En Totaux, le n°1 des points devrait afficher ${independentTopTotal}.`);
if (!/sur \d+ match/.test(cardNamed("Points").querySelector(".lg-unit").textContent)) throw new Error("❌ En Totaux, l'unité devrait indiquer « sur N matchs ».");
doc2.querySelector("#leagueStatsPanel [data-lg-mode='avg']").click();
if (!/par match/.test(cardNamed("Points").querySelector(".lg-unit").textContent)) throw new Error("❌ Retour en Moyennes : l'unité devrait redevenir « par match ».");
console.log("✅ La bascule Moyennes/Totaux re-trie et affiche les totaux exacts, puis revient aux moyennes.");

// Classement : 10 lignes d'équipe, séparateurs de zones, forme, colonne course.
const teamRows = [...doc2.querySelectorAll("#standingsContent table.lg-table tbody tr[data-lg-team]")];
if (teamRows.length !== 10) throw new Error("❌ Le classement devrait lister 10 équipes, obtenu : " + teamRows.length);
const dividers = [...doc2.querySelectorAll("#standingsContent tr.lg-div")].map(tr => tr.textContent);
if (JSON.stringify(dividers) !== JSON.stringify(["Hors play-offs", "Zone de barrage", "Relégation directe"])) throw new Error("❌ Séparateurs de zones inattendus : " + JSON.stringify(dividers));
const formCounts = teamRows.map(tr => tr.querySelectorAll(".lg-f").length);
if (!formCounts.every(n => n === 3)) throw new Error("❌ Après 3 journées, chaque équipe devrait avoir 3 pastilles de forme, obtenu : " + JSON.stringify(formCounts));
const standings = win2.eval("league.standings()");
teamRows.forEach((tr, i) => {
  const s = standings[i];
  const wl = s.wins + s.losses;
  const f = [...tr.querySelectorAll(".lg-f")].map(x => x.textContent);
  if (f.filter(x => x === "V").length !== s.wins || wl !== 3) throw new Error(`❌ La forme de ${s.name} (${f.join("")}) ne colle pas à son bilan ${s.wins}-${s.losses}.`);
  if (tr.querySelector(".lg-pts").textContent !== String(s.points)) throw new Error(`❌ Points affichés incorrects pour ${s.name}.`);
});
const meRow = teamRows.find(tr => tr.classList.contains("me"));
if (!meRow) throw new Error("❌ La ligne du club du manager devrait être marquée (classe me).");
// Badge « TOI » retiré (retour utilisateur, 2026-09-26 : « sur la page ligue enleve: TOI ») :
// la ligne reste mise en évidence (classe me/lg-mine), sans le badge.
if (meRow.querySelector(".lg-you") || /\bTOI\b/.test(meRow.textContent)) throw new Error("❌ Le badge « TOI » ne devrait plus apparaître sur la page Ligue.");
const race = doc2.querySelector("#standingsContent .lg-race");
const myRank = teamRows.indexOf(meRow) + 1;
if (!race || !race.querySelector(".lg-race-kpis b").textContent.startsWith(String(myRank))) throw new Error("❌ La carte « course » devrait afficher la position du club (" + myRank + ").");
// Sur-titre « Journée N sur 18 · 10 équipes » retiré (retour utilisateur 2026-09-26).
if (doc2.querySelector("#standingsContent .lg-head small")) throw new Error("❌ Le sur-titre « Journée N sur … · N équipes » a été retiré de la page Ligue.");
console.log(`✅ Classement : 10 équipes, 3 séparateurs de zones, forme cohérente avec le bilan, ligne TOI, carte course (${myRank}e).`);

await flush(dom2);
dom2.window.close();
server.close();

console.log("\n🏁 Tous les tests des stats de la ligue + MVP de la dernière journée sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
