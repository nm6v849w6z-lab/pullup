// Vérifie #59 (retour utilisateur, 2026-09) : "arriverais-tu à mettre en
// place ce type d'analyse de l'adversaire [...] l'analyse doit porter sur des
// éléments qu'on peut réellement contrer tactiquement [...] on peut choisir
// de bloquer la passe à l'intérieur, empêcher la pénétration des
// extérieurs... il faut des informations cohérentes avec le moteur de jeu en
// place que l'on peut contrer avec une analyse plus poussée." Voir
// computeScoutingTendencies/tacticalReportHtml dans moteurbasket3.html :
// contrairement au Scoutisme (caractéristiques, déjà couvert par
// client_scouting_test.js), ce rapport ne révèle JAMAIS les réglages
// tactiques actuels de l'adversaire (retour utilisateur antérieur, voir
// renderOrdresGrid : "je ne dois pas pouvoir choisir la tactique [...] de
// l'adversaire, ça ne doit pas apparaitre"), uniquement des tendances
// chiffrées reconstituées depuis Player.matchLog/paintAtt/paintMade
// (AUCUNE nouvelle donnée persistée), chacune reliée à un vrai levier
// défensif existant (WATCH_FOCUS_LABELS).
const fs = require("fs");
const { startTestServer, openGame, flush, writeRawSave, readRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
let dom = await openGame(html, baseUrl);
let doc = dom.window.document;
let win = dom.window;

function clickTab(key) {
  const btn = [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key);
  if (!btn) throw new Error(`❌ Onglet introuvable : ${key}`);
  btn.click();
}

// ---------------------------------------------------------------------
// Partie 1 : aucun match encore disputé par l'adversaire cette saison ->
// message d'absence de données, pas de crash ni de pourcentages inventés.
// ---------------------------------------------------------------------
clickTab("ligue");
const rows = [...doc.querySelectorAll("#standingsContent table.standings-table tbody tr")];
const myRow = rows.find(r => r.classList.contains("me"));
const opponentRow = rows.find(r => r !== myRow);
const opponentIdx = Number(opponentRow.querySelector("[data-team-idx]").dataset.teamIdx);
opponentRow.querySelector("[data-team-idx]").click();
// Retour utilisateur (2026-09) : "il faudrait ajouter des boutons sur la
// page d'une équipe (effectif [...] analyse de l'équipe)" — le rapport
// tactique vit désormais sous le sous-onglet "Analyse d'équipe" de la fiche
// équipe (voir teamDetailAnalyseHtml), plus sous "Effectif" (par défaut à
// l'ouverture, voir showTeamDetail).
doc.querySelector('[data-team-detail-subview="analyse"]').click();

const reportBefore = doc.querySelector("#teamDetailContent .tactical-report");
console.log("Rapport tactique présent (avant tout match) :", !!reportBefore);
if (!reportBefore) throw new Error("❌ Le panneau de scoutisme devrait toujours contenir un bloc '.tactical-report', même sans données.");
console.log("Texte affiché :", reportBefore.textContent.replace(/\s+/g, " ").trim().slice(0, 200));
if (!reportBefore.textContent.includes("Pas encore assez")) {
  throw new Error("❌ Sans aucun match disputé par l'adversaire, le rapport devrait afficher un message d'absence de données, pas des pourcentages inventés.");
}
if (/\d+%/.test(reportBefore.textContent)) {
  throw new Error("❌ Sans données, aucun pourcentage ne devrait apparaître.");
}
console.log("✅ Sans match disputé par l'adversaire, le rapport tactique affiche bien un message d'absence de données (aucun chiffre inventé).");

await flush(dom);
dom.window.close();

// ---------------------------------------------------------------------
// Partie 2 : injection d'un matchLog contrôlé pour l'adversaire (un seul
// match, chiffres choisis pour exercer les 5 tendances + leurs 5 conseils),
// puis vérification que le rapport recalcule EXACTEMENT les mêmes
// pourcentages que la formule de production (paintAtt/fga2, jamais une
// valeur approximative ou codée en dur côté test).
// ---------------------------------------------------------------------
let saved = readRawSave(savePath);
const oppTeam = saved.league.teams[opponentIdx];
const pivot = oppTeam.players.find(p => p.position === "Pivot");
const meneur = oppTeam.players.find(p => p.position === "Meneur");
const ailierFort = oppTeam.players.find(p => p.position === "Ailier fort");
if (!pivot || !meneur || !ailierFort) throw new Error("❌ (setup) l'adversaire devrait avoir au moins un Pivot, un Meneur et un Ailier fort.");

const logEntry = (over) => ({
  round: 0, competition: "championship", week: 1, min: 30,
  pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
  fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0, paintAtt: 0, paintMade: 0,
  ...over,
});

// Pivot : uniquement des tirs dans la raquette (paintAtt = fga2).
pivot.matchLog = [logEntry({ fga2: 8, fgm2: 4, paintAtt: 8, paintMade: 4, oreb: 3, dreb: 1, pts: 8 })];
// Ailier fort : quelques tirs dans la raquette aussi (dilue la part du pivot).
ailierFort.matchLog = [logEntry({ fga2: 2, fgm2: 1, paintAtt: 2, paintMade: 1, oreb: 2, dreb: 0, pts: 2 })];
// Meneur : 2 tirs dans la raquette (pénétration) + 8 tirs à 3 points (menace extérieure).
meneur.matchLog = [logEntry({ fga2: 2, fgm2: 1, paintAtt: 2, paintMade: 1, fga3: 8, fgm3: 3, dreb: 4, pts: 11 })];

writeRawSave(savePath, saved);

const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;

// Calcul indépendant (même arithmétique que computeScoutingTendencies, mais
// écrit séparément ici) à partir des chiffres injectés ci-dessus, pour ne
// jamais comparer la production à elle-même.
const totalFga2 = 8 + 2 + 2; // fga2 : pivot + ailier fort + meneur
const totalFga3 = 0 + 0 + 8; // fga3 : pivot + ailier fort + meneur
const teamFga = totalFga2 + totalFga3;
const totalPaintAtt = 8 + 2 + 2; // paintAtt : pivot + ailier fort + meneur
const expected = {
  paintSharePct: Math.round((totalPaintAtt / teamFga) * 100),
  pivotPaintSharePct: Math.round((8 / totalPaintAtt) * 100),
  meneurDriveRatePct: Math.round((2 / (2 + 8)) * 100),
  threeRatePct: Math.round((8 / teamFga) * 100),
  orebSharePct: Math.round((5 / (5 + 5)) * 100), // oreb 3+2+0=5, dreb 1+0+4=5
};
console.log("\nAttendu (calcul indépendant) :", expected);

[...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ligue").click();
const oppRow2 = [...doc2.querySelectorAll("#standingsContent table.standings-table tbody tr")]
  .find(r => r.querySelector("[data-team-idx]") && Number(r.querySelector("[data-team-idx]").dataset.teamIdx) === opponentIdx);
oppRow2.querySelector("[data-team-idx]").click();
doc2.querySelector('[data-team-detail-subview="analyse"]').click();

const oppTeamLive = win2.eval(`league.teams[${opponentIdx}]`);
const tendencies = win2.computeScoutingTendencies(oppTeamLive);
console.log("Tendances calculées par la production :", tendencies);
if (tendencies.gamesPlayed !== 1) throw new Error(`❌ gamesPlayed attendu 1, obtenu ${tendencies.gamesPlayed}.`);
["paintSharePct", "pivotPaintSharePct", "meneurDriveRatePct", "threeRatePct", "orebSharePct"].forEach(key => {
  if (tendencies[key] !== expected[key]) {
    throw new Error(`❌ ${key} attendu ${expected[key]}, obtenu ${tendencies[key]}.`);
  }
});
console.log("✅ computeScoutingTendencies recalcule exactement les pourcentages attendus à partir du matchLog injecté.");

// Retour utilisateur (2026-09) : "'priorité au rebond' c'est pas uniquement
// pour les rebonds offensifs ?" -> reboundPriority s'assigne à un POSTE
// précis (voir WATCH_FOCUS_EFFECTS.reboundPriority côté moteur), le conseil
// doit donc nommer explicitement le poste (et son titulaire) qui capte le
// plus de rebonds offensifs, comme pour le pivot/le meneur ci-dessus. Ici,
// le pivot (oreb=3) devance l'ailier fort (oreb=2) et le meneur (oreb=0).
if (tendencies.topRebounderPosition !== "Pivot") {
  throw new Error(`❌ topRebounderPosition attendu "Pivot" (3 rebonds offensifs, devant l'ailier fort à 2), obtenu "${tendencies.topRebounderPosition}".`);
}
if (tendencies.topRebounderName !== pivot.name) {
  throw new Error(`❌ topRebounderName attendu "${pivot.name}" (le pivot de la fixture), obtenu "${tendencies.topRebounderName}".`);
}
console.log(`✅ Le meilleur rebondeur offensif identifié est bien le pivot (${tendencies.topRebounderName}), poste avec le plus de rebonds offensifs.`);

const reportText = doc2.querySelector("#teamDetailContent .tactical-report").textContent.replace(/\s+/g, " ").trim();
console.log("\nTexte du rapport tactique :", reportText);
if (!reportText.includes(`${expected.paintSharePct}%`)) throw new Error("❌ Le pourcentage de tirs dans la raquette devrait apparaître dans le texte du rapport.");
if (!reportText.includes(`${expected.pivotPaintSharePct}%`)) throw new Error("❌ La part du pivot dans les tirs intérieurs devrait apparaître dans le texte du rapport.");
if (!reportText.includes(`${expected.meneurDriveRatePct}%`)) throw new Error("❌ Le taux de pénétration du meneur devrait apparaître dans le texte du rapport.");
if (!reportText.includes(`${expected.threeRatePct}%`)) throw new Error("❌ Le taux de tirs à 3 points devrait apparaître dans le texte du rapport.");
if (!reportText.includes(`${expected.orebSharePct}%`)) throw new Error("❌ Le taux de rebonds offensifs devrait apparaître dans le texte du rapport.");
console.log("✅ Les 5 pourcentages calculés apparaissent bien, textuellement, dans le rapport affiché.");

// Les conseils doivent citer les VRAIS libellés de consignes (WATCH_FOCUS_LABELS),
// jamais un réglage tactique actuel de l'adversaire (aucune trace de
// screenDefense/helpDefense/postDefense/closeoutStyle, réglages qui restent
// volontairement invisibles, voir renderOrdresGrid).
const labels = win2.eval("WATCH_FOCUS_LABELS");
console.log("\nLibellés de consignes attendus dans le texte :", labels);
if (!reportText.includes(labels.denyDrive)) throw new Error(`❌ Le conseil sur le meneur devrait citer la consigne "${labels.denyDrive}".`);
if (!reportText.includes(labels.reboundPriority)) throw new Error(`❌ Le conseil rebond devrait citer la consigne "${labels.reboundPriority}".`);
if (!reportText.includes("pivot") || !reportText.includes(`"${labels.reboundPriority}" sur leur pivot`)) {
  throw new Error(`❌ Le conseil rebond devrait nommer explicitement le poste ciblé ("sur leur pivot"), pas rester générique, obtenu : "${reportText}".`);
}
console.log("✅ Le conseil rebond nomme explicitement le poste (et le joueur) à surveiller, pas une consigne générique.");
if (!reportText.includes(labels.denyEntry) && !reportText.includes(labels.denyPostUp)) {
  throw new Error(`❌ Le conseil sur le pivot devrait citer "${labels.denyEntry}" ou "${labels.denyPostUp}".`);
}
if (!reportText.includes(labels.harassOutsideShot)) throw new Error(`❌ Le conseil sur le tir à 3 points devrait citer la consigne "${labels.harassOutsideShot}".`);
console.log("✅ Les conseils citent bien les vrais libellés de consignes défensives existantes (Ordres/WATCH_FOCUS_LABELS).");

for (const forbidden of ["screenDefense", "helpDefense", "postDefense", "closeoutStyle", "Switch", "Prise à deux", "Zone press", "Box and one"]) {
  if (reportText.includes(forbidden)) {
    throw new Error(`❌ Le rapport ne devrait jamais révéler un réglage tactique actuel de l'adversaire (trouvé : "${forbidden}").`);
  }
}
console.log("✅ Le rapport ne révèle aucun réglage tactique actuel de l'adversaire, uniquement des tendances chiffrées.");

if (!reportText.includes("gratuit")) throw new Error("❌ Le rapport devrait signaler qu'il est temporairement gratuit (paiement pas encore en place).");
console.log("✅ Le rapport signale bien son accès gratuit temporaire.");

// Le nom des joueurs cités (pivot/meneur/tireur) doit correspondre aux VRAIS
// joueurs de la fixture, pas un texte générique.
if (!reportText.includes(pivot.name)) throw new Error("❌ Le nom du pivot devrait être cité dans le rapport.");
if (!reportText.includes(meneur.name)) throw new Error("❌ Le nom du meneur devrait être cité dans le rapport (pénétration ET tireur à 3 points).");
console.log("✅ Le rapport cite bien les vrais joueurs de l'adversaire, pas un texte générique.");

await flush(dom2);
dom2.window.close();
server.close();

console.log("\n🏁 Tous les tests du rapport tactique (scoutisme adverse) sont passés.");

})().catch(e => {
  console.error("❌ Échec :", e);
  process.exit(1);
});
