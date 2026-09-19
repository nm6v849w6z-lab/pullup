// Vérifie la navigation par onglets (Club/Ligue/Coupe/Calendrier/Matchs
// amicaux/Économie/Salle/Staff/Humeur des supporters/📋 Ordres, et
// Effectif/Stats hebdo/Entraînement), la Salle avec ses catégories de
// places à prix indépendants, la boutique des supporters (revenu
// hebdomadaire fixe), et l'onglet Effectif (consultation des
// caractéristiques, distinct de l'onglet Ordres qui sert à composer la
// feuille de match) — y compris l'accès direct aux Ordres depuis le Calendrier.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar } = require("./test_helpers.js");
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

function visiblePageId() {
  const ids = ["prepSection", "standingsSection", "trainingSection", "seasonEndSection", "liveSection",
    "clubSection", "staffSection", "economieSection", "salleSection", "calendrierSection", "coupeSection",
    "effectifSection", "humeurSection", "placeholderSection", "statsHebdoSection"];
  return ids.find(id => !doc.getElementById(id).classList.contains("hidden"));
}

// --- Par défaut : retour utilisateur (2026-09) : "quand on ouvre le jeu, on
// doit arriver sur la page tableau de bord et pas ordres" — voir
// enterNextMatchOrShowSeasonEnd({ landOnDashboard: true }), appelé
// uniquement par le tout premier chargement de la page (window.__gameReady).
// L'onglet "club" (tableau de bord) est donc désormais actif à l'ouverture,
// pas "📋 Ordres". ---
console.log("Page visible au chargement :", visiblePageId());
if (visiblePageId() !== "clubSection") throw new Error("❌ La page par défaut à l'ouverture devrait être le tableau de bord (club).");
const clubBtnActive = [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "club").classList.contains("active");
console.log(`${clubBtnActive ? "✅" : "❌"} L'onglet "Club" (tableau de bord) est actif par défaut.`);
if (!clubBtnActive) throw new Error("❌ L'onglet Club devrait être actif par défaut.");

// --- Chaque onglet affiche bien SA page (et une seule) — vérifie les 13 onglets. ---
const TAB_TO_PAGE = {
  club: "clubSection", ligue: "standingsSection", coupe: "coupeSection",
  calendrier: "calendrierSection", amicaux: "placeholderSection", economie: "economieSection",
  salle: "salleSection", staff: "staffSection", humeur: "humeurSection", ordres: "prepSection",
  effectif: "effectifSection", statshebdo: "statsHebdoSection", entrainement: "trainingSection",
};
let allTabsOk = true;
Object.entries(TAB_TO_PAGE).forEach(([tab, expectedPage]) => {
  clickTab(tab);
  const shown = visiblePageId();
  const ok = shown === expectedPage;
  if (!ok) allTabsOk = false;
  console.log(`${ok ? "✅" : "❌"} Onglet "${tab}" → page "${shown}" (attendu "${expectedPage}").`);
});
if (!allTabsOk) throw new Error("❌ Au moins un onglet n'affiche pas la bonne page.");
console.log("\n✅ Les 13 onglets affichent chacun leur propre page.");

// --- Onglet Effectif : table des caractéristiques (lecture seule), PAS la
// feuille de match / les tactiques (qui vivent maintenant dans "Ordres"). ---
clickTab("effectif");
const rosterTable = doc.querySelector("#rosterContent table.roster-table");
if (!rosterTable) throw new Error("❌ L'onglet Effectif devrait afficher un tableau des caractéristiques des joueurs.");
const rosterRows = rosterTable.querySelectorAll("tbody tr").length;
console.log(`\nOnglet Effectif : ${rosterRows} joueurs listés (attendu 15).`);
if (rosterRows !== 15) throw new Error("❌ L'onglet Effectif devrait lister les 15 joueurs du club : " + rosterRows);
const hasPrepGridInEffectif = !!doc.querySelector("#effectifSection #prepGrid");
console.log(`${!hasPrepGridInEffectif ? "✅" : "❌"} L'onglet Effectif ne contient pas la feuille de match (composée désormais dans Ordres).`);
if (hasPrepGridInEffectif) throw new Error("❌ La feuille de match ne devrait plus apparaître dans l'onglet Effectif.");
const hasThreePointHeader = [...rosterTable.querySelectorAll("th")].some(th => th.textContent === "3PTS");
if (!hasThreePointHeader) throw new Error("❌ Le tableau de l'effectif devrait inclure une colonne pour chaque caractéristique (ex. 3PTS).");
console.log("✅ Le tableau des caractéristiques est bien affiché, avec une colonne par caractéristique.");

// --- L'onglet Ordres, lui, contient bien la feuille de match + le compte à
// rebours jusqu'au coup d'envoi (le comportement historique de prepSection,
// juste sous un nouveau nom — plus de bouton de verrouillage depuis le
// passage au calendrier réel, tâche #21 : le match se joue tout seul). ---
clickTab("ordres");
if (!doc.getElementById("prepGrid") || doc.getElementById("prepSection").classList.contains("hidden")) {
  throw new Error("❌ L'onglet Ordres devrait afficher la préparation du match (tactiques + feuille de match + compte à rebours).");
}
console.log("✅ L'onglet \"📋 Ordres\" affiche bien la feuille de match et les tactiques.");

// --- Calendrier : la journée à venir propose un accès direct à "Ordres". ---
clickTab("calendrier");
const orderBtn = doc.querySelector(".calendar-order-btn");
if (!orderBtn) throw new Error("❌ Le calendrier devrait proposer un bouton pour donner ses ordres pour le prochain match.");
orderBtn.click();
const jumpedToOrdres = !doc.getElementById("prepSection").classList.contains("hidden") &&
  [...doc.querySelectorAll(".tab-btn")].find(b => b.classList.contains("active")).dataset.tab === "ordres";
console.log(`\n${jumpedToOrdres ? "✅" : "❌"} Le bouton du calendrier amène directement à l'onglet Ordres.`);
if (!jumpedToOrdres) throw new Error("❌ Le clic sur le bouton du calendrier devrait amener directement à l'onglet Ordres.");

// --- Salle : plusieurs catégories de places, chacune avec son propre prix. ---
clickTab("salle");
const categoryCards = doc.querySelectorAll(".seat-category-card");
console.log("\nCatégories de places affichées :", categoryCards.length, "(attendu 3)");
if (categoryCards.length !== 3) throw new Error("❌ La Salle devrait proposer 3 catégories de places (gradins, tribune, loges).");
const gradinsRange = doc.getElementById("ticketPriceRange_gradins");
const logeRange = doc.getElementById("ticketPriceRange_loge");
if (!gradinsRange || !logeRange) throw new Error("❌ Chaque catégorie de places devrait avoir son propre curseur de prix.");
if (gradinsRange.max === logeRange.max) throw new Error("❌ Les catégories de places ne devraient pas avoir la même fourchette de prix (gradins vs loges VIP).");
console.log(`✅ 3 catégories de places, chacune avec sa propre fourchette de prix (gradins jusqu'à ${gradinsRange.max} €, loges jusqu'à ${logeRange.max} €).`);

// Change le prix des loges VIP et vérifie la persistance.
logeRange.value = "90";
logeRange.dispatchEvent(new win.Event("change"));
await flush(dom);
let saved = readRawSave(savePath);
console.log("Prix des loges VIP après réglage à 90 € :", saved.team.ticketPrices.loge);
if (saved.team.ticketPrices.loge !== 90) throw new Error("❌ Le prix des loges VIP n'a pas été mis à jour : " + saved.team.ticketPrices.loge);
if (saved.team.ticketPrices.gradins === 90) throw new Error("❌ Changer le prix des loges ne devrait pas affecter le prix des gradins (catégories indépendantes).");
console.log("✅ Chaque catégorie de places a un prix indépendant, et c'est bien persisté.");

// --- Agrandissement de la salle : toujours fonctionnel avec les catégories
// (retour utilisateur, 2026-09 : "on voit le cout de l'évolution et on
// valide si ok", puis "je ne veux voir que l'état actuel [...] une petite
// flèche sur la brique pour upgrader" — la carte n'affiche plus que l'état
// ACTUEL de la salle, seule sa flèche ⬆ (.facility-upgrade-arrow) ouvre la
// confirmation, voir showUpgradeConfirm ; l'achat ne se fait qu'après le
// clic sur "Valider"). ---
const levelBefore = saved.team.arenaLevel;
const upgradeArrow = doc.querySelector("#arenaCurrentPanel .facility-upgrade-arrow");
if (!upgradeArrow) throw new Error("❌ La carte de la salle devrait avoir une flèche d'amélioration (.facility-upgrade-arrow).");
upgradeArrow.click();
const arenaConfirmDialog = doc.getElementById("upgradeConfirmOverlay");
if (!arenaConfirmDialog) throw new Error("❌ Cliquer sur la flèche d'agrandissement de la salle devrait ouvrir une confirmation avant l'achat.");
doc.getElementById("upgradeConfirmValidate").click();
await flush(dom);
saved = readRawSave(savePath);
console.log("\nNiveau de salle :", levelBefore, "→", saved.team.arenaLevel);
if (saved.team.arenaLevel !== levelBefore + 1) throw new Error("❌ L'agrandissement de la salle ne s'est pas comporté comme attendu.");
console.log("✅ L'agrandissement de la salle passe par une confirmation puis fonctionne toujours avec le système de catégories.");

// --- Boutique des supporters : achat UNIQUE, puis revenu hebdomadaire fixe
// payé pendant l'entraînement (indépendant de la fréquentation des matchs).
// Même confirmation avant achat que l'agrandissement de la salle ci-dessus,
// déclenchée par la flèche de la carte (pas la carte entière). ---
const shopCardBefore = doc.querySelector("#otherFacilitiesPanel [data-fan-shop-card]");
if (!shopCardBefore) throw new Error("❌ Aucune carte d'achat de boutique des supporters trouvée.");
const budgetBeforeShop = saved.team.budget;
const shopArrow = shopCardBefore.querySelector(".facility-upgrade-arrow");
if (!shopArrow) throw new Error("❌ La carte de la boutique des supporters devrait avoir une flèche d'amélioration.");
shopArrow.click();
if (!doc.getElementById("upgradeConfirmOverlay")) throw new Error("❌ Cliquer sur la flèche de la boutique des supporters devrait ouvrir une confirmation avant l'achat.");
doc.getElementById("upgradeConfirmValidate").click();
await flush(dom);
saved = readRawSave(savePath);
console.log("\nNiveau de boutique après achat :", saved.team.fanShopLevel, "| budget avant :", budgetBeforeShop, "| après :", saved.team.budget);
if (saved.team.fanShopLevel !== 1) throw new Error("❌ L'achat de la boutique des supporters n'a pas fonctionné : niveau " + saved.team.fanShopLevel);
if (saved.team.budget >= budgetBeforeShop) throw new Error("❌ L'achat de la boutique aurait dû débiter le budget (coût unique).");
const hasShopTransaction = saved.team.transactions.some(t => t.label.includes("Boutique des supporters"));
if (!hasShopTransaction) throw new Error("❌ L'achat de la boutique devrait être journalisé.");
console.log("✅ L'achat de la boutique des supporters débite le budget une fois et est journalisé.");

// --- Une semaine réelle complète (2 journées de championnat) s'applique
// TOUTE SEULE désormais (plus de bouton "Valider la semaine" ni "Verrouiller
// & simuler" depuis le passage au calendrier réel, tâche #21) : on avance le
// calendrier d'une semaine (voir fastForwardCalendar/catchUpLeague) pour
// observer À LA FOIS le revenu hebdomadaire fixe de la boutique (pendant
// l'entraînement automatique de fin de semaine) ET une éventuelle recette de
// billetterie si l'une des deux journées est à domicile.
clickTab("ordres");
// Le bandeau textuel "Journée X : mon club reçoit/se déplace à ..." a été
// retiré de l'écran Ordres (retour utilisateur, 2026-09, voir
// renderOrdresRoundDateTime dans moteurbasket3.html) : on lit directement
// currentMatch.isHome plutôt que de chercher "reçoit" dans un texte qui n'y
// est plus affiché.
const isHomeMatch = win.eval("currentMatch.isHome");
const budgetBeforeWeek = saved.team.budget;
await flush(dom);
win.close();

fastForwardCalendar(savePath, 2); // 1 semaine réelle complète (2 journées)
dom = await openGame(html, baseUrl);
doc = dom.window.document;
win = dom.window;
doc.getElementById("catchupContinueBtn").click(); // consomme le récapitulatif, reprend le fil normalement
await flush(dom);
saved = readRawSave(savePath);

console.log("\nBudget avant/après une semaine complète (2 journées + entraînement, avec boutique) :", budgetBeforeWeek, "→", saved.team.budget);
const hasWeeklyShopRevenue = saved.team.transactions.some(t => t.label.includes("Recettes boutique des supporters"));
console.log(`${hasWeeklyShopRevenue ? "✅" : "❌"} La boutique rapporte un revenu hebdomadaire fixe pendant l'entraînement automatique.`);
if (!hasWeeklyShopRevenue) throw new Error("❌ La boutique des supporters devrait rapporter un revenu chaque semaine d'entraînement.");

console.log("Journée 1 de la semaine à domicile :", isHomeMatch);
if (isHomeMatch) {
  const gotTicketRevenue = saved.team.transactions.some(t => t.label.startsWith("Billetterie vs"));
  console.log(`${gotTicketRevenue ? "✅" : "❌"} Une recette de billetterie a bien été journalisée (match à domicile, multi-catégories).`);
  if (!gotTicketRevenue) throw new Error("❌ Un match à domicile devrait rapporter une recette de billetterie journalisée.");
} else {
  console.log("(Première journée de la semaine à l'extérieur — pas de recette de billetterie garantie sur celle-ci.)");
}

// --- Persistance complète (rechargement) : catégories de prix, niveau de
// boutique et transactions survivent (même serveur, relit son fichier). ---
win.close();
const dom2 = await openGame(html, baseUrl);
const win2 = dom2.window;
const reloadedSave = readRawSave(savePath);
console.log("\nAprès rechargement — prix loges :", reloadedSave.team.ticketPrices.loge,
  "| niveau boutique :", reloadedSave.team.fanShopLevel, "| transactions :", reloadedSave.team.transactions.length);
const persistedOk = reloadedSave.team.ticketPrices.loge === saved.team.ticketPrices.loge &&
  reloadedSave.team.fanShopLevel === saved.team.fanShopLevel &&
  reloadedSave.team.transactions.length === saved.team.transactions.length;
console.log(`${persistedOk ? "✅" : "❌"} Catégories de prix, boutique et transactions survivent au rechargement.`);
if (!persistedOk) throw new Error("❌ La persistance de la Salle/Boutique/Économie a échoué.");

await flush(dom2);
win2.close();
server.close();
console.log("\n✅ Navigation par onglets, Salle multi-catégories, boutique des supporters, et séparation Effectif/Ordres vérifiées.");

})().catch(e => { console.error(e); process.exit(1); });
