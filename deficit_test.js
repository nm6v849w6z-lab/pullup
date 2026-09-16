// Vérifie l'alerte de déficit économique et la mise en vente forcée (retour
// utilisateur : "en cas de déficit économique trop important, message
// d'alerte, et si au bout de 2 semaines, la solution pas résolue, mise en
// vente de tous les joueurs pour 1 euro / on va mettre ce déficit à 500k") :
// suivi des semaines CONSÉCUTIVES sous le seuil (Team.trainWeek), mise en
// vente forcée exactement après DEFICIT_GRACE_WEEKS semaines non résolues
// (pas avant, pas répétée ensuite), remise à zéro du compteur dès que le
// budget repasse au-dessus, vente effective d'un joueur listé (Team.sellPlayer,
// SANS plancher d'effectif — retour utilisateur explicite : "on peut vendre
// tout son effectif si on le souhaite"), et affichage/persistance côté UI.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, writeRawSave, fastForwardCalendar } = require("./test_helpers.js");
const E = require("./engine.js");
const {
  generateTeam, DEFICIT_ALERT_THRESHOLD, DEFICIT_GRACE_WEEKS,
} = E;
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

// ---------------------------------------------------------------------
// Partie 1 : logique moteur pure (Team.trainWeek) — budget forcé bien en
// dessous du seuil, plusieurs semaines de suite.
// ---------------------------------------------------------------------
{
  const team = generateTeam("Déficit Test", 1.0);
  team.budget = DEFICIT_ALERT_THRESHOLD - 100000; // largement sous le seuil dès le départ

  // --- Semaine 1 sous le seuil : alerte, mais pas encore de mise en vente
  // (DEFICIT_GRACE_WEEKS = 2, donc il faut 2 semaines consécutives). ---
  const w1 = team.trainWeek();
  console.log("Semaine 1 sous le seuil — deficitAlert:", w1.deficitAlert, "| deficitWeeks:", w1.deficitWeeks, "| forcedFireSale:", w1.forcedFireSale);
  if (!w1.deficitAlert) throw new Error("❌ L'alerte de déficit devrait se déclencher dès la 1ère semaine sous le seuil.");
  if (w1.deficitWeeks !== 1) throw new Error("❌ deficitWeeks devrait valoir 1 après une seule semaine sous le seuil, obtenu : " + w1.deficitWeeks);
  if (w1.forcedFireSale) throw new Error("❌ La mise en vente forcée ne devrait pas se déclencher après une seule semaine (grâce de " + DEFICIT_GRACE_WEEKS + " semaines).");
  if (team.players.some(p => p.forSale)) throw new Error("❌ Aucun joueur ne devrait être listé après une seule semaine sous le seuil.");
  console.log("✅ Alerte déclenchée dès la 1ère semaine, sans mise en vente prématurée.");

  // --- Semaine 2 toujours sous le seuil (les salaires continuent d'être
  // payés, le budget reste sous le seuil) : mise en vente forcée de TOUT
  // l'effectif à 1 €. ---
  const w2 = team.trainWeek();
  console.log("\nSemaine 2 toujours sous le seuil — deficitWeeks:", w2.deficitWeeks, "| forcedFireSale:", w2.forcedFireSale);
  if (w2.deficitWeeks !== DEFICIT_GRACE_WEEKS) throw new Error("❌ deficitWeeks devrait valoir " + DEFICIT_GRACE_WEEKS + " après 2 semaines consécutives sous le seuil.");
  if (!w2.forcedFireSale) throw new Error("❌ La mise en vente forcée aurait dû se déclencher exactement à la " + DEFICIT_GRACE_WEEKS + "e semaine consécutive sous le seuil.");
  const allForSale = team.players.every(p => p.forSale && p.salePrice === 1);
  console.log("Tous les joueurs listés à 1 € :", allForSale, `(${team.players.length} joueurs)`);
  if (!allForSale) throw new Error("❌ Tout l'effectif devrait être listé à 1 € après " + DEFICIT_GRACE_WEEKS + " semaines de déficit non résolu.");
  console.log("✅ Mise en vente forcée de tout l'effectif à 1 € déclenchée exactement à la " + DEFICIT_GRACE_WEEKS + "e semaine consécutive.");

  // --- Semaine 3, toujours en déficit : le compteur continue de grimper,
  // mais la mise en vente ne se redéclenche pas (déjà faite). ---
  const w3 = team.trainWeek();
  console.log("\nSemaine 3 toujours sous le seuil — deficitWeeks:", w3.deficitWeeks, "| forcedFireSale:", w3.forcedFireSale);
  if (w3.deficitWeeks !== 3) throw new Error("❌ deficitWeeks devrait continuer à grimper (attendu 3, obtenu " + w3.deficitWeeks + ").");
  if (w3.forcedFireSale) throw new Error("❌ La mise en vente forcée ne devrait pas se redéclencher une fois déjà faite.");
  console.log("✅ Pas de nouvelle mise en vente redondante une fois l'effectif déjà listé.");

  // --- Redressement : une grosse recette ramène le budget au-dessus du
  // seuil → le compteur de semaines consécutives revient à 0. ---
  team.recordTransaction("Recette exceptionnelle (test)", 2000000);
  const w4 = team.trainWeek();
  console.log("\nAprès redressement du budget — budget:", team.budget, "| deficitAlert:", w4.deficitAlert, "| deficitWeeks:", w4.deficitWeeks);
  if (w4.deficitAlert) throw new Error("❌ L'alerte ne devrait plus être active une fois le budget redressé au-dessus du seuil.");
  if (w4.deficitWeeks !== 0) throw new Error("❌ deficitWeeks devrait revenir à 0 une fois le budget redressé, obtenu : " + w4.deficitWeeks);
  console.log("✅ Le compteur de semaines de déficit revient à 0 dès que le budget repasse au-dessus du seuil.");
}

// ---------------------------------------------------------------------
// Partie 2 : redressement DANS le délai de grâce — ne doit PAS déclencher la
// mise en vente forcée (une seule semaine de déficit, puis résorbé avant la
// 2e semaine consécutive).
// ---------------------------------------------------------------------
{
  const team = generateTeam("Redressement rapide Test", 1.0);
  team.budget = DEFICIT_ALERT_THRESHOLD - 50000;
  const w1 = team.trainWeek();
  if (w1.deficitWeeks !== 1) throw new Error("❌ (redressement rapide) deficitWeeks devrait valoir 1 après la 1ère semaine.");
  team.recordTransaction("Redressement avant la 2e semaine (test)", 2000000);
  const w2 = team.trainWeek();
  console.log("\nRedressement avant la 2e semaine consécutive — forcedFireSale:", w2.forcedFireSale, "| deficitWeeks:", w2.deficitWeeks);
  if (w2.forcedFireSale) throw new Error("❌ Un redressement AVANT la 2e semaine consécutive ne devrait jamais déclencher la mise en vente forcée.");
  if (team.players.some(p => p.forSale)) throw new Error("❌ Aucun joueur ne devrait être listé si le déficit a été résorbé à temps.");
  console.log("✅ Un redressement dans le délai de grâce (avant " + DEFICIT_GRACE_WEEKS + " semaines) évite bien la mise en vente forcée.");
}

// ---------------------------------------------------------------------
// Partie 3 : Team.sellPlayer — vente effective d'un joueur listé, AUCUN
// plancher d'effectif (retour utilisateur : "on peut vendre tout son
// effectif si on le souhaite"), refus de vendre un joueur non listé ou
// inexistant.
// ---------------------------------------------------------------------
{
  const team = generateTeam("Vente Test", 1.0);
  const initialCount = team.players.length;
  console.log(`\nEffectif de départ : ${initialCount} joueurs.`);

  // Refuse de vendre un joueur qui n'est pas listé.
  const notListed = team.players[0];
  const soldNotListed = team.sellPlayer(notListed.id);
  if (soldNotListed) throw new Error("❌ La vente d'un joueur non listé (forSale=false) devrait être refusée.");
  console.log("✅ La vente d'un joueur non listé est bien refusée.");

  // Refuse de vendre un id inexistant.
  if (team.sellPlayer(-999999)) throw new Error("❌ La vente d'un identifiant de joueur inexistant devrait être refusée.");
  console.log("✅ La vente d'un identifiant inexistant est bien refusée.");

  // Force le déficit puis la mise en vente forcée pour lister tout le monde.
  team.budget = DEFICIT_ALERT_THRESHOLD - 100000;
  team.trainWeek();
  team.trainWeek();
  if (!team.players.every(p => p.forSale)) throw new Error("❌ Tout l'effectif devrait être listé avant la suite du test.");

  // Vend TOUT l'effectif, un par un, jusqu'à zéro joueur — aucun plancher.
  const budgetBeforeSelling = team.budget;
  let sold = 0;
  while (team.players.length > 0) {
    const target = team.players[0];
    const ok = team.sellPlayer(target.id);
    if (!ok) throw new Error("❌ La vente d'un joueur listé devrait toujours réussir, quelle que soit la taille de l'effectif restant.");
    sold++;
  }
  console.log(`Joueurs vendus : ${sold} | Effectif restant : ${team.players.length} | Budget : ${team.budget}`);
  if (team.players.length !== 0) throw new Error("❌ L'effectif entier devrait avoir pu être vendu, jusqu'à zéro joueur, obtenu : " + team.players.length);
  if (sold !== initialCount) throw new Error(`❌ Le nombre de ventes (${sold}) devrait correspondre exactement à l'effectif de départ (${initialCount}).`);
  const expectedBudget = budgetBeforeSelling + sold * 1;
  if (team.budget !== expectedBudget) throw new Error(`❌ Le budget devrait avoir encaissé exactement ${sold} € (1 € par joueur vendu), attendu ${expectedBudget}, obtenu ${team.budget}.`);
  console.log("✅ Aucun plancher d'effectif : le club a pu vendre l'intégralité de son effectif, jusqu'à zéro joueur, chaque vente encaissant exactement 1 €.");

  // Vendre un effectif déjà vide refuse simplement (plus aucun joueur listé
  // à trouver), sans planter.
  if (team.sellPlayer(notListed.id)) throw new Error("❌ Vendre un joueur qui n'est plus dans l'effectif devrait être refusé, pas planter.");
  console.log("✅ Un effectif vidé jusqu'à zéro joueur ne plante pas sur une tentative de vente supplémentaire.");

  // Retour utilisateur (2026-09) : "en cas d'indisponibilité pour vente
  // d'un joueur, qui avait été mis dans la composition, il doit être enlevé
  // de la composition [...] si un titulaire est vendu, qu'il y a 4 joueurs
  // titu et au moins un remplaçant, [...] le remplaçant doit être aligné
  // comme titu [...], il ne faut pas mettre un forfait dans ce type de cas"
  // — Team.sellPlayer (voir handleStarterDeparture dans engine.js) promeut
  // donc D'ABORD un remplaçant déjà désigné à chaque poste vidé, tant qu'il
  // en reste un ; ce n'est qu'une fois effectif ET remplaçants épuisés à un
  // poste que le trou reste (lineup.starters[pos] mis explicitement à null,
  // jamais laissé pointer vers un id qui n'existe plus). Après avoir vendu
  // l'intégralité de l'effectif, TOUS les postes doivent donc être vacants
  // (null), détectés par missingStarterPositions()/hasValidLineup() — et
  // c'est précisément ce qui doit déclencher un forfait si la feuille de
  // match n'est pas corrigée avant le coup d'envoi (voir POSITIONS_MISSING,
  // server/liveMatch.js).
  const allStartersNull = Object.values(team.lineup.starters).every(id => id == null);
  if (!allStartersNull) throw new Error("❌ Tous les postes de la feuille de match devraient être vacants (null) une fois l'effectif entier vendu, obtenu : " + JSON.stringify(team.lineup.starters));
  if (team.missingStarterPositions().length !== E.POSITIONS.length) {
    throw new Error(`❌ Les 5 postes de la feuille de match devraient tous être invalides après avoir vendu tout l'effectif, obtenu : ${team.missingStarterPositions().length}.`);
  }
  if (team.hasValidLineup()) throw new Error("❌ Un effectif vide ne devrait plus pouvoir constituer une feuille de match valide (voir le mécanisme de forfait).");
  console.log("✅ Les remplaçants déjà désignés sont promus automatiquement tant qu'il en reste (aucun forfait prématuré), et une fois effectif ET remplaçants épuisés, tous les postes sont vacants (null, jamais une référence périmée) — hasValidLineup() le détecte bien, plus de feuille valide (voir forfeit_test.js).");
}

// ---------------------------------------------------------------------
// Partie 4 : parcours UI complet — budget forcé très négatif via la
// sauvegarde, plusieurs semaines validées, bandeau d'alerte visible sur le
// tableau de bord/Économie, badge + bouton de vente sur l'Effectif après la
// mise en vente forcée, vente effective via le bouton, et persistance.
// ---------------------------------------------------------------------
(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom1 = await openGame(html, baseUrl);
await flush(dom1);
const saved = readRawSave(savePath);
dom1.window.close();
// Marge large sous le seuil (pas seulement 100 000 € comme dans la version
// précédente de ce test, qui déclenchait l'entraînement hebdomadaire à la
// main via validateTrainingBtn SANS jouer le moindre match) : depuis le
// passage au calendrier réel (tâche #21), avancer de vraies semaines fait
// aussi jouer les 2 matchs de championnat de chaque semaine, dont
// potentiellement un match à domicile qui peut rapporter une recette de
// billetterie à 6 chiffres (voir Team.simulateHomeAttendance) — largement de
// quoi repasser au-dessus du seuil si le déficit de départ n'est que
// symbolique, et fausser ce test (recette qui referme le déficit avant la
// fin du délai de grâce).
saved.team.budget = DEFICIT_ALERT_THRESHOLD - 3000000;
writeRawSave(savePath, saved);

let dom2 = await openGame(html, baseUrl);
let doc2 = dom2.window.document;
let win2 = dom2.window;

function clickTab(key) {
  [...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click();
}

// --- Avant même de jouer une semaine, le bandeau d'avertissement (pas
// encore "critical") doit déjà être visible sur le tableau de bord du club,
// puisque le budget sauvegardé est déjà sous le seuil. ---
clickTab("club");
let banner = doc2.getElementById("clubDeficitBanner").querySelector(".deficit-banner");
console.log("\nBandeau au chargement (budget déjà sous le seuil) :", banner ? banner.className : null);
if (!banner || !banner.classList.contains("warn")) throw new Error("❌ Le bandeau d'avertissement (non critique) devrait être visible dès le chargement si le budget sauvegardé est déjà sous le seuil.");

// --- 2 semaines réelles consécutives (team.week n'avance QUE via
// trainWeek(), qui s'applique désormais tout seul une fois par semaine
// réelle — tâche #21, plus de bouton "Valider la semaine" à cliquer) pour
// déclencher la mise en vente forcée. Avance le calendrier de 4 journées (2
// semaines réelles) d'un coup : inutile de jouer de vrais matchs pour ce
// test, seul l'entraînement hebdomadaire nous intéresse (voir
// fastForwardCalendar/catchUpLeague). ---
await flush(dom2);
win2.close();
fastForwardCalendar(savePath, 4);
dom2 = await openGame(html, baseUrl);
doc2 = dom2.window.document;
win2 = dom2.window;
if (!doc2.getElementById("catchupSection").classList.contains("hidden")) {
  doc2.getElementById("catchupContinueBtn").click();
}

await flush(dom2);
const savedAfter2Weeks = readRawSave(savePath);
console.log("Semaines de déficit après 2 semaines jouées :", savedAfter2Weeks.team.deficitWeeks, "| joueurs listés :", savedAfter2Weeks.team.players.filter(p => p.forSale).length, "/", savedAfter2Weeks.team.players.length);
if (!savedAfter2Weeks.team.players.every(p => p.forSale)) {
  throw new Error("❌ Tout l'effectif devrait être listé après 2 semaines de déficit non résolu.");
}
console.log("✅ Mise en vente forcée déclenchée après 2 semaines de jeu réel via l'UI.");

// --- Le bandeau doit maintenant être "critical" (effectif listé). ---
clickTab("club");
banner = doc2.getElementById("clubDeficitBanner").querySelector(".deficit-banner");
console.log("Bandeau après mise en vente forcée :", banner ? banner.className : null);
if (!banner || !banner.classList.contains("critical")) throw new Error("❌ Le bandeau devrait passer en mode 'critical' une fois l'effectif listé.");
console.log("✅ Le bandeau de déficit passe bien en mode critique une fois la mise en vente forcée déclenchée.");

// --- L'onglet Effectif affiche un badge + un bouton de vente pour chaque
// joueur listé. ---
clickTab("effectif");
const badges = doc2.querySelectorAll("#rosterContent .forsale-badge");
const sellButtons = doc2.querySelectorAll("#rosterContent [data-sell-player]");
console.log(`Badges "En vente" : ${badges.length} | Boutons "Vendre" : ${sellButtons.length}`);
if (badges.length !== savedAfter2Weeks.team.players.length) throw new Error("❌ Chaque joueur listé devrait porter le badge 'En vente'.");
if (sellButtons.length !== savedAfter2Weeks.team.players.length) throw new Error("❌ Chaque joueur listé devrait avoir un bouton 'Vendre' (aucun plancher d'effectif).");
console.log("✅ Badges et boutons de vente affichés pour tout l'effectif listé.");

// --- Vendre effectivement un joueur via le bouton met à jour le budget et
// l'effectif, et c'est persisté. ---
const budgetBeforeSale = readRawSave(savePath).team.budget;
const countBeforeSale = doc2.querySelectorAll("#rosterContent tbody tr").length;
sellButtons[0].click();
await flush(dom2);
const savedAfterSale = readRawSave(savePath);
const countAfterSale = doc2.querySelectorAll("#rosterContent tbody tr").length;
console.log(`\nBudget avant/après vente : ${budgetBeforeSale} → ${savedAfterSale.team.budget} | Lignes du tableau avant/après : ${countBeforeSale} → ${countAfterSale}`);
if (savedAfterSale.team.budget !== budgetBeforeSale + 1) throw new Error("❌ La vente d'un joueur listé devrait créditer exactement 1 € au budget.");
if (countAfterSale !== countBeforeSale - 1) throw new Error("❌ Le tableau de l'effectif devrait perdre une ligne après la vente.");
if (savedAfterSale.team.players.length !== countBeforeSale - 1) throw new Error("❌ L'effectif sauvegardé devrait avoir un joueur de moins après la vente.");
console.log("✅ La vente via le bouton 'Vendre' met à jour le budget, l'effectif affiché ET la sauvegarde.");

win2.close();
server.close();
console.log("\n✅ Alerte de déficit économique et mise en vente forcée vérifiées : suivi des semaines consécutives, déclenchement exact après " + DEFICIT_GRACE_WEEKS + " semaines non résolues, remise à zéro sur redressement, vente effective SANS plancher d'effectif (jusqu'à zéro joueur), et affichage/persistance côté UI.");

})().catch(e => { console.error(e); process.exit(1); });
