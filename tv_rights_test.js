// Vérifie les droits TV (retour utilisateur : "il faut aussi prévoir les
// droits TV", en complément de la grille de primes de montée rescalée sur la
// référence BuzzerBeater fournie) : revenu hebdomadaire FIXE selon la
// division ACTUELLE du club (voir TV_RIGHTS_WEEKLY_BY_LEVEL/Team.trainWeek
// côté moteur), payé que le club entraîne ou pas, absent si aucune division
// n'est transmise (utilisation directe du moteur sans ligue), visible dans
// le rapport hebdomadaire ET sur l'onglet Économie, et qui grimpe bien pour
// une division plus prestigieuse.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar } = require("./test_helpers.js");
const E = require("./engine.js");
const { generateTeam, TV_RIGHTS_WEEKLY_BY_LEVEL, MAX_DIVISION_LEVEL, divisionInfo } = E;
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

// ---------------------------------------------------------------------
// Partie 1 : logique moteur pure (Team.trainWeek(divisionLevel)).
// ---------------------------------------------------------------------

// --- Sans division transmise (Team utilisé seul, comme dans la plupart des
// tests directs du moteur) : aucun revenu de droits TV. ---
{
  const team = generateTeam("Sans ligue Test", 1.0);
  const budgetBefore = team.budget;
  const w = team.trainWeek();
  console.log("Sans divisionLevel — tvRightsRevenue:", w.tvRightsRevenue);
  if (w.tvRightsRevenue !== 0) throw new Error("❌ Aucun revenu de droits TV ne devrait être versé sans division transmise, obtenu : " + w.tvRightsRevenue);
  if (team.transactions.some(t => t.label && t.label.startsWith("Droits TV"))) {
    throw new Error("❌ Aucune transaction 'Droits TV' ne devrait apparaître sans division transmise.");
  }
  console.log("✅ Aucun revenu de droits TV sans division transmise (compatibilité avec un Team utilisé hors ligue).");
}

// --- Avec division transmise : le montant versé correspond EXACTEMENT à
// TV_RIGHTS_WEEKLY_BY_LEVEL pour cette division, pour chaque niveau de la
// pyramide, et grimpe strictement avec le prestige de la division. ---
{
  const amounts = [];
  for (let level = 1; level <= MAX_DIVISION_LEVEL; level++) {
    const team = generateTeam(`Division ${level} Test`, 1.0);
    const budgetBefore = team.budget;
    const w = team.trainWeek(level);
    const expected = TV_RIGHTS_WEEKLY_BY_LEVEL[level];
    console.log(`Division ${level} (${divisionInfo(level).name}) — droits TV versés : ${w.tvRightsRevenue} (attendu ${expected})`);
    if (w.tvRightsRevenue !== expected) {
      throw new Error(`❌ Droits TV incorrects pour la Division ${level} : attendu ${expected}, obtenu ${w.tvRightsRevenue}.`);
    }
    const tx = team.transactions.find(t => t.label === `Droits TV (${divisionInfo(level).name})`);
    if (!tx || tx.amount !== expected) {
      throw new Error(`❌ La transaction 'Droits TV (${divisionInfo(level).name})' devrait valoir ${expected}, obtenu : ${tx ? tx.amount : "absente"}.`);
    }
    amounts.push(expected);
  }
  console.log("\nMontants par division (I → VI) :", amounts.join(", "));
  for (let i = 1; i < amounts.length; i++) {
    if (amounts[i] >= amounts[i - 1]) {
      throw new Error(`❌ Les droits TV devraient strictement décroître d'une division à la division inférieure (Division ${i} : ${amounts[i - 1]}, Division ${i + 1} : ${amounts[i]}).`);
    }
  }
  console.log("✅ Le montant des droits TV correspond exactement à la grille, pour chaque division, et décroît strictement de la Division I à la VI.");
}

// --- Les droits TV s'ajoutent bel et bien au budget en plus de la masse
// salariale (pas à la place) — vérifie le delta exact sur une semaine sans
// staff, sans subvention de démarrage (semaine au-delà de STARTUP_SUBSIDY_WEEKS)
// et sans variation de moral. ---
{
  const { STARTUP_SUBSIDY_WEEKS } = E;
  const team = generateTeam("Delta Test", 1.0);
  for (let w = 1; w <= STARTUP_SUBSIDY_WEEKS; w++) team.trainWeek(); // épuise la subvention, sans droits TV
  const budgetBefore = team.budget;
  const payrollExpected = team.players.reduce((s, p) => s + p.salary, 0);
  const result = team.trainWeek(1); // Division I cette fois
  const budgetAfter = team.budget;
  const expectedDelta = -payrollExpected + TV_RIGHTS_WEEKLY_BY_LEVEL[1];
  console.log(`\nBudget avant/après (Division I, hors subvention) : ${budgetBefore} → ${budgetAfter} (delta attendu : ${expectedDelta})`);
  if (Math.round(budgetAfter - budgetBefore) !== Math.round(expectedDelta)) {
    throw new Error("❌ Le delta de budget devrait correspondre exactement à -(masse salariale) + droits TV.");
  }
  console.log("✅ Les droits TV s'ajoutent bien au budget EN PLUS de la masse salariale, pas à sa place.");
}

// ---------------------------------------------------------------------
// Partie 2 : parcours UI — l'onglet Économie affiche le bon montant pour la
// division actuelle, et le rapport hebdomadaire mentionne le versement.
// ---------------------------------------------------------------------
(async () => {

const { server, savePath, baseUrl } = await startTestServer();
let dom = await openGame(html, baseUrl);
let doc = dom.window.document;
let win = dom.window;

function clickTab(key) {
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click();
}

// Nouvelle carrière : toujours en Division I (voir promotion_test.js).
clickTab("economie");
const tvCardText = doc.getElementById("economieTvRights").textContent;
console.log("\nCarte 'Droits TV' (Économie), nouvelle carrière (Division I) :", tvCardText);
const expectedDI = TV_RIGHTS_WEEKLY_BY_LEVEL[1];
if (!tvCardText.includes(expectedDI.toLocaleString("fr-FR")) && !tvCardText.replace(/\s/g, "").includes(String(expectedDI))) {
  throw new Error(`❌ La carte 'Droits TV' devrait afficher ${expectedDI}/sem. pour une Division I, obtenu : "${tvCardText}"`);
}
console.log("✅ La carte 'Droits TV' de l'onglet Économie affiche le bon montant pour la division actuelle.");

// --- Une semaine réelle (2 journées) s'écoule : depuis le passage au
// calendrier réel (tâche #21), l'entraînement hebdomadaire — et donc le
// versement des droits TV — s'applique tout seul en fin de semaine réelle,
// plus besoin de cliquer sur "Valider la semaine" (voir
// fastForwardCalendar/catchUpLeague). Le récapitulatif d'absence doit
// mentionner les droits TV versés.
await flush(dom);
win.close();
fastForwardCalendar(savePath, 2);
dom = await openGame(html, baseUrl);
doc = dom.window.document;
win = dom.window;
if (doc.getElementById("catchupSection").classList.contains("hidden")) {
  throw new Error("❌ Le récapitulatif d'absence devrait s'afficher après 1 semaine réelle (2 journées) jouée automatiquement.");
}
const reportHtml = doc.getElementById("catchupContent").innerHTML;
console.log("Récapitulatif mentionne les droits TV :", reportHtml.includes("Droits TV"));
if (!reportHtml.includes("Droits TV")) throw new Error("❌ Le récapitulatif d'absence devrait mentionner les droits TV versés cette semaine.");
console.log("✅ Le récapitulatif d'absence mentionne bien le versement des droits TV.");
doc.getElementById("catchupContinueBtn").click();

// La transaction est bien journalisée et persistée.
await flush(dom);
const saved = readRawSave(savePath);
const tvTx = saved.team.transactions.find(t => t.label === `Droits TV (${divisionInfo(1).name})`);
console.log("Transaction persistée :", tvTx);
if (!tvTx || tvTx.amount !== expectedDI) throw new Error("❌ La transaction des droits TV devrait être journalisée et persistée avec le bon montant.");
console.log("✅ La transaction des droits TV est journalisée et survit à la sauvegarde.");

win.close();
server.close();
console.log("\n✅ Droits TV vérifiés : revenu hebdomadaire exact par division, absent sans ligue, décroissant strictement de la Division I à la VI, cumulé (pas substitué) à la masse salariale, affiché dans le rapport hebdomadaire et sur l'onglet Économie, journalisé et persisté.");

})().catch(e => { console.error(e); process.exit(1); });
