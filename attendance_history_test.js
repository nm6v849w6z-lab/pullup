// Vérifie le retour utilisateur (2026-09) : "sur l'onglet salle, il n'y a
// tjrs pas l'affluence des matchs précédents (jusqu'à 10 matchs)". Voir
// Team.attendanceHistory/simulateHomeAttendance (engine.js, miroir identique
// dans moteurbasket3.html) et renderAttendanceHistory dans moteurbasket3.html.
// Le moteur lui-même (simulateHomeAttendance, déjà appelé pour de vrai à
// chaque match à domicile via server/liveMatch.js:finalizeRound) est
// volontairement exercé ici en appelant directement teamA.simulateHomeAttendance
// depuis le navigateur (plutôt que de rejouer des journées entières comme
// player_stats_persistence_test.js) : plus rapide, et le point à vérifier ici
// est l'AFFICHAGE (onglet Salle) et la PERSISTANCE, pas la génération des
// chiffres d'affluence eux-mêmes (déjà couverte ailleurs indirectement via
// les transactions de billetterie).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

function clickTab(key) {
  const btn = [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key);
  if (!btn) throw new Error(`❌ Onglet introuvable : ${key}`);
  btn.click();
}

// ---------------------------------------------------------------------
// Partie 1 : avant tout match à domicile, message d'attente propre plutôt
// qu'une liste vide silencieuse.
// ---------------------------------------------------------------------
clickTab("salle");
const emptyHolder = doc.getElementById("attendanceHistoryHolder");
if (!emptyHolder) throw new Error("❌ (setup) #attendanceHistoryHolder introuvable sur l'onglet Salle.");
console.log("Message avant tout match à domicile :", emptyHolder.textContent.trim());
if (!emptyHolder.textContent.includes("Aucun match à domicile")) {
  throw new Error("❌ Sans historique, un message d'attente clair devrait être affiché.");
}
console.log("✅ Message d'attente correct avant tout match à domicile joué.");

// ---------------------------------------------------------------------
// Partie 2 : 12 matchs à domicile simulés (au-delà du plafond de 10) ->
// seuls les 10 plus RÉCENTS sont gardés et affichés, le plus récent en
// premier.
// ---------------------------------------------------------------------
const opponents = ["Rennes", "Marseille", "Toulouse", "Nantes", "Bordeaux", "Lille", "Strasbourg", "Nice", "Montpellier", "Reims", "Angers", "Brest"];
win.eval(`
  (function() {
    const opponents = ${JSON.stringify(opponents)};
    opponents.forEach((name, i) => {
      teamA.week = i + 1;
      teamA.simulateHomeAttendance(name);
    });
  })();
`);
const historyLength = win.eval("teamA.attendanceHistory.length");
console.log(`\n${opponents.length} matchs à domicile simulés, longueur de l'historique en mémoire : ${historyLength} (attendu 10, plafond)`);
if (historyLength !== 10) throw new Error(`❌ BUG NON CORRIGÉ : l'historique devrait être plafonné à 10 entrées, obtenu ${historyLength}.`);

clickTab("effectif"); // force un changement d'onglet
clickTab("salle"); // puis revient sur Salle pour re-déclencher renderSalleSection
const lines = [...doc.querySelectorAll("#attendanceHistoryHolder .gain-line")];
console.log("Lignes affichées :", lines.length, "(attendu 10)");
if (lines.length !== 10) throw new Error(`❌ 10 entrées en mémoire devraient produire 10 lignes affichées, obtenu ${lines.length}.`);
console.log("Première ligne (devrait être le match le PLUS RÉCENT, vs Brest) :", lines[0].textContent.trim());
if (!lines[0].textContent.includes("Brest")) {
  throw new Error(`❌ Le match le plus récent (vs Brest, semaine 12) devrait être affiché EN PREMIER, obtenu : "${lines[0].textContent.trim()}"`);
}
console.log("Dernière ligne affichée (devrait être le 10e plus récent, vs Toulouse, PAS Rennes/Marseille qui ont été évincés) :", lines[9].textContent.trim());
if (!lines[9].textContent.includes("Toulouse")) {
  throw new Error(`❌ La 10e ligne devrait être le match vs Toulouse (semaine 3), les 2 plus anciens (Rennes/Marseille) devraient avoir été évincés par le plafond, obtenu : "${lines[9].textContent.trim()}"`);
}
const anyRennesOrMarseille = lines.some(l => l.textContent.includes("Rennes") || l.textContent.includes("Marseille"));
if (anyRennesOrMarseille) throw new Error("❌ Les 2 matchs les plus anciens (Rennes, Marseille) devraient avoir été évincés par le plafond de 10, ils apparaissent encore.");
console.log("✅ Historique plafonné à 10 entrées, le plus récent affiché en premier, les plus anciens correctement évincés.");

// ---------------------------------------------------------------------
// Partie 2bis : détail catégorie de place par catégorie de place (retour
// utilisateur, 2026-09, sur l'historique une fois affiché : "sur
// l'affluence, c'est bien, mais je mettrai le détail catégorie de place par
// catégorie place") sous chaque ligne, dont la somme doit retomber
// exactement sur le total affiché sur la ligne elle-même.
// ---------------------------------------------------------------------
const breakdowns = [...doc.querySelectorAll("#attendanceHistoryHolder .attendance-breakdown")];
console.log("\nLignes de détail par catégorie affichées :", breakdowns.length, "(attendu 10, une par match)");
if (breakdowns.length !== 10) throw new Error(`❌ BUG NON CORRIGÉ : chaque match de l'historique devrait afficher un détail par catégorie de place, obtenu ${breakdowns.length} sur 10.`);
["Gradins populaires", "Tribune couverte", "Loges VIP"].forEach(catName => {
  if (!breakdowns[0].textContent.includes(catName)) {
    throw new Error(`❌ Le détail par catégorie devrait citer "${catName}", obtenu : "${breakdowns[0].textContent.trim()}"`);
  }
});
console.log("Détail de la ligne la plus récente :", breakdowns[0].textContent.trim());
const firstEntryBreakdownSum = win.eval("teamA.attendanceHistory[0].breakdown.reduce((s, b) => s + b.attendance, 0)");
const firstEntryTotal = win.eval("teamA.attendanceHistory[0].attendance");
console.log(`Somme du détail par catégorie : ${firstEntryBreakdownSum} (devrait retomber exactement sur le total affiché : ${firstEntryTotal})`);
if (firstEntryBreakdownSum !== firstEntryTotal) {
  throw new Error(`❌ La somme des catégories (${firstEntryBreakdownSum}) devrait être exactement égale au total du match (${firstEntryTotal}).`);
}
console.log("✅ Chaque match affiche un détail par catégorie de place, dont la somme retombe exactement sur le total.");

// Compatibilité arrière : une entrée enregistrée AVANT ce détail (aucun
// champ breakdown, sauvegarde plus ancienne) ne doit pas planter le rendu,
// ni afficher un faux détail reconstitué, juste la ligne totale seule.
win.eval(`teamA.attendanceHistory.unshift({ week: 99, opponentName: "Vieille Sauvegarde", attendance: 1000, revenue: 20000, capacity: 5000 });`);
win.eval("renderAttendanceHistory();");
const linesWithLegacyEntry = [...doc.querySelectorAll("#attendanceHistoryHolder .gain-line")];
const legacyLine = linesWithLegacyEntry[0];
console.log("\nLigne d'une entrée sans détail (ancienne sauvegarde) :", legacyLine.textContent.trim());
if (!legacyLine.textContent.includes("Vieille Sauvegarde")) throw new Error("❌ (setup) l'entrée de compatibilité arrière devrait apparaître en premier.");
if (legacyLine.querySelector(".attendance-breakdown")) {
  throw new Error("❌ Une entrée sans champ breakdown (ancienne sauvegarde, avant cette fonctionnalité) ne devrait PAS afficher de détail par catégorie inventé.");
}
console.log("✅ Une entrée d'avant cette fonctionnalité (sans breakdown) s'affiche sans planter, sans détail inventé.");
win.eval("teamA.attendanceHistory.shift();"); // retire l'entrée de compatibilité, pour ne pas fausser la suite du test
win.eval("renderAttendanceHistory();");

// ---------------------------------------------------------------------
// Partie 3 : persistance à travers un rechargement complet de la page
// (nouvelle session JSDOM, même serveur).
// ---------------------------------------------------------------------
win.eval("saveMyTeam();");
await flush(dom);
const saved = readRawSave(savePath);
console.log("\nSauvegarde brute, longueur de attendanceHistory :", (saved.team.attendanceHistory || []).length, "(attendu 10)");
if (!Array.isArray(saved.team.attendanceHistory) || saved.team.attendanceHistory.length !== 10) {
  throw new Error(`❌ BUG NON CORRIGÉ : attendanceHistory devrait être persisté dans la sauvegarde brute avec 10 entrées, obtenu ${JSON.stringify(saved.team.attendanceHistory)}.`);
}

await dom.window.close();
const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;
[...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "salle").click();
const linesAfterReload = [...doc2.querySelectorAll("#attendanceHistoryHolder .gain-line")];
console.log("Après rechargement complet, lignes affichées :", linesAfterReload.length, "(attendu 10)");
if (linesAfterReload.length !== 10) throw new Error(`❌ L'historique d'affluence devrait survivre à un rechargement complet de la page, obtenu ${linesAfterReload.length} lignes au lieu de 10.`);
if (!linesAfterReload[0].textContent.includes("Brest")) {
  throw new Error(`❌ Après rechargement, le match le plus récent devrait toujours être affiché en premier, obtenu : "${linesAfterReload[0].textContent.trim()}"`);
}
console.log("✅ L'historique d'affluence survit bien à un rechargement complet de la page, dans le bon ordre.");

const breakdownsAfterReload = [...doc2.querySelectorAll("#attendanceHistoryHolder .attendance-breakdown")];
console.log("Détail par catégorie après rechargement :", breakdownsAfterReload.length, "(attendu 10, le détail doit survivre lui aussi)");
if (breakdownsAfterReload.length !== 10) {
  throw new Error(`❌ BUG NON CORRIGÉ : le détail par catégorie de place devrait aussi survivre au rechargement, obtenu ${breakdownsAfterReload.length} sur 10.`);
}
console.log("✅ Le détail par catégorie de place survit lui aussi au rechargement complet de la page.");

await flush(dom2);
await dom2.window.close();
server.close();
console.log("\n🏁 Tous les tests attendance_history_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
