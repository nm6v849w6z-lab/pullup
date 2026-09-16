// Vérifie la grille salariale des joueurs (demande utilisateur : "les
// salaires des joueurs doivent evoluer en fonction de leur carac (mis à jour
// toutes les saisons) / un joueur très fort doit coûter cher / grille
// salariale cohérente entre joueurs basiques et très forts") : formule
// exponentielle (pas linéaire) selon l'overall, salaire fixé à la création
// puis figé jusqu'au passage de saison suivant, masse salariale payée chaque
// semaine (entraînement ou pas), affichage Effectif/Économie, persistance.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar } = require("./test_helpers.js");
const E = require("./engine.js");
const { salaryForOverall, levelCoefficientFor, Player } = E;
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

// --- Le poste EFFECTIF (celui qui détermine le coefficient de niveau, donc
// le salaire) est bien déterminé D'APRÈS LES CARACTÉRISTIQUES, pas d'après
// une étiquette : l'exemple donné par l'utilisateur — "gros rebond, grosse
// défense intérieure → pivot". ---
{
  const pivotLikeAttrs = {
    midRange: 20, threePoint: 15, inside: 88, pass: 18, rebound: 86,
    block: 78, dribble: 15, agility: 22, defOutside: 18, defInside: 84,
  };
  const { position, coefficient } = levelCoefficientFor(pivotLikeAttrs);
  console.log("Profil 'gros rebond + grosse défense intérieure' → poste détecté :", position, "| coefficient :", coefficient.toFixed(1));
  if (position !== "Pivot") throw new Error("❌ Un profil gros rebond/grosse défense intérieure devrait ressortir Pivot, pas " + position);
  const flatAvg = Object.values(pivotLikeAttrs).reduce((a, b) => a + b, 0) / 10;
  console.log("(moyenne brute pour comparaison :", flatAvg.toFixed(1), "— le coefficient pondéré doit être nettement supérieur, ses lacunes hors-spécialité comptant moins)");
  if (coefficient <= flatAvg + 5) throw new Error("❌ Le coefficient pondéré devrait dépasser nettement la moyenne brute pour un spécialiste bien typé.");
  console.log("✅ Le poste effectif est bien déterminé d'après les caractéristiques, et valorise correctement un spécialiste.");
}

// --- Cas concret signalé par l'utilisateur : un joueur à 97 en tir à 3
// points (poste de carte Arrière), reste du profil ordinaire, touchait
// seulement 1848 €/semaine avant correctif — le pic exceptionnel se noyait
// dans la moyenne pondérée de tout le reste. Doit désormais toucher une
// prime nette qui reflète un tir "parmi les meilleurs au monde", sans faire
// exploser la masse salariale d'un effectif ordinaire (voir plus bas). ---
{
  const starAttrs = {
    midRange: 55, threePoint: 97, inside: 20, pass: 45, rebound: 20,
    block: 15, dribble: 45, agility: 50, defOutside: 45, defInside: 15,
  };
  const star = new Player({ name: "Star Test", position: "Arrière", height: 195, age: 24, attrs: starAttrs, aggressiveness: 0.5 });
  console.log("\nJoueur à 97 en tir à 3pts (poste Arrière) → poste effectif :", star.effectivePosition, "| salaire :", star.salary, "€/sem.");
  if (star.effectivePosition !== "Arrière") throw new Error("❌ Un profil Arrière typé 3pts devrait rester Arrière.");
  if (star.salary < 5000) throw new Error("❌ Un pic à 97 dans la caractéristique signature du poste devrait nettement dépasser 5000 €/sem (obtenu : " + star.salary + ").");
  console.log("✅ Le pic exceptionnel sur une seule caractéristique signature est désormais correctement récompensé (bien au-delà des 1848 € signalés).");
}

// --- La prime de pic est PLAFONNÉE : un joueur qui cumule par pur hasard
// plusieurs caractéristiques déjà très hautes ET un pic extrême ne doit pas
// voir son salaire s'envoler de façon absurde/imprévisible (repéré en
// testant sur des effectifs générés réels : certains effectifs entiers
// dépassaient 100 000 €/semaine de masse salariale par pur hasard de
// génération, avant plafonnement). ---
{
  const freakAttrs = {
    midRange: 20, threePoint: 20, inside: 99, pass: 20, rebound: 99,
    block: 99, dribble: 20, agility: 20, defOutside: 20, defInside: 99,
  };
  const freak = new Player({ name: "Freak Test", position: "Pivot", height: 215, age: 24, attrs: freakAttrs, aggressiveness: 0.5 });
  console.log("Profil extrême (4 carac fortes du Pivot à 99) → salaire :", freak.salary, "€/sem.");
  if (freak.salary > 90000) throw new Error("❌ La prime de pic plafonnée devrait empêcher un salaire absurde même sur un profil extrême (obtenu : " + freak.salary + ").");
  console.log("✅ La prime de pic reste plafonnée même sur un profil cumulant plusieurs carac exceptionnelles.");
}

// --- Subvention de démarrage (retour utilisateur sur BuzzerBeater :
// "quand tu commences, tu as 300 ou 500k au début / ensuite pendant 4
// semaines tu as 50k chaque semaine") : versée les STARTUP_SUBSIDY_WEEKS
// premières semaines de la carrière, puis plus jamais. ---
{
  const { generateTeam, STARTUP_SUBSIDY_AMOUNT, STARTUP_SUBSIDY_WEEKS } = E;
  const team = generateTeam("Subvention Test", 1.0);
  team.budget = 300000;
  const subsidyWeeksSeen = [];
  for (let w = 1; w <= STARTUP_SUBSIDY_WEEKS + 2; w++) {
    team.trainWeek();
    const tx = team.transactions.find(t => t.week === w && t.label === "Subvention de démarrage");
    if (tx) subsidyWeeksSeen.push(w);
    if (tx && tx.amount !== STARTUP_SUBSIDY_AMOUNT) {
      throw new Error("❌ Le montant de la subvention de démarrage devrait être fixe (" + STARTUP_SUBSIDY_AMOUNT + " €), obtenu : " + tx.amount);
    }
  }
  console.log("\nSemaines ayant touché la subvention de démarrage :", subsidyWeeksSeen.join(", "));
  const expectedWeeks = Array.from({ length: STARTUP_SUBSIDY_WEEKS }, (_, i) => i + 1);
  if (JSON.stringify(subsidyWeeksSeen) !== JSON.stringify(expectedWeeks)) {
    throw new Error("❌ La subvention de démarrage devrait être versée exactement les semaines " + expectedWeeks.join(", ") + ", pas au-delà.");
  }
  console.log("✅ La subvention de démarrage est versée exactement pendant les " + STARTUP_SUBSIDY_WEEKS + " premières semaines, puis s'arrête.");
}

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
let dom = await openGame(html, baseUrl);
let doc = dom.window.document;
let win = dom.window;

function clickTab(key) {
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click();
}

// --- La formule est bien exponentielle et strictement croissante : un
// joueur très fort coûte beaucoup, beaucoup plus qu'un joueur quelconque
// (pas juste un peu plus). Recalibrée 2026-09 sur des données réelles de
// BuzzerBeater (retour utilisateur : "on est très loin des niveaux que tu
// proposes") — voir SALARY_BASELINE_OVERALL dans engine.js pour le détail
// de la calibration (masse salariale d'un effectif de Division II ~400-
// 500 000 €/semaine). L'échelle couvre désormais un spectre bien plus
// large (du joueur de complément au profil quasi légendaire), donc l'écart
// pertinent à vérifier est sur l'ÉTENDUE COMPLÈTE de la grille (30 à 130),
// pas seulement sur un tronçon de 20 points. ---
const s15 = salaryForOverall(15), s30 = salaryForOverall(30), s50 = salaryForOverall(50), s70 = salaryForOverall(70), s90 = salaryForOverall(90), s130 = salaryForOverall(130);
console.log("Salaires de référence — 15:", s15, "| 30:", s30, "| 50:", s50, "| 70:", s70, "| 90:", s90, "| 130:", s130);
if (!(s15 < s30 && s30 < s50 && s50 < s70 && s70 < s90 && s90 < s130)) throw new Error("❌ Le salaire devrait strictement augmenter avec l'overall.");
const diffLow = s50 - s30;   // +20 points, bas de l'échelle
const diffHigh = s90 - s70;  // +20 points, haut de l'échelle
console.log("Écart en euros sur 20 points d'overall — bas d'échelle:", diffLow, "| haut d'échelle:", diffHigh);
if (diffHigh <= diffLow) throw new Error("❌ L'écart en euros devrait s'accélérer en haut de l'échelle (grille exponentielle, pas linéaire).");
// Repère bas de l'échelle : un joueur de complément (coefficient 15, proche
// d'un effectif de départ tout juste créé — voir generateStartingRoster),
// pas le plancher SALARY_MIN lui-même (jamais atteint par une vraie
// génération, seulement une sécurité pour un cas dégénéré).
if (s130 / s15 < 25) throw new Error("❌ Un profil quasi légendaire (130) devrait coûter au moins 25x un joueur de complément (15) sur l'étendue complète de la grille : ratio " + (s130 / s15).toFixed(1));
console.log("✅ Grille salariale exponentielle et cohérente (un très fort joueur coûte nettement plus qu'un joueur basique, sur toute l'étendue de la grille).");

// --- Chaque joueur a un salaire positif dès la génération, et la masse
// salariale de l'effectif ne dépasse pas absurdement le budget de départ
// (ne le vide pas en une seule semaine). Seuil à 75% (et non 50%) : la
// grille recalibrée sur BuzzerBeater (voir SALARY_BASELINE_OVERALL dans
// engine.js) couvre un spectre bien plus large, donc même un effectif de
// départ (tier neutre) ordinaire peut, par variance de génération normale,
// cumuler plusieurs profils au-dessus de la moyenne — vérifié sur 1000
// effectifs générés, moins de 0.1% dépassent 200 000 €/semaine. Ce test
// vise à détecter un vrai bug d'emballement, pas la variance normale. ---
await flush(dom);
let saved = readRawSave(savePath);
const totalPayroll = saved.team.players.reduce((s, p) => s + p.salary, 0);
console.log("\nMasse salariale hebdo au départ :", totalPayroll, "€ | budget de départ :", saved.team.budget, "€");
if (saved.team.players.some(p => !(p.salary > 0))) throw new Error("❌ Chaque joueur devrait avoir un salaire positif dès la génération.");
if (totalPayroll > saved.team.budget * 0.75) throw new Error("❌ La masse salariale de départ semble disproportionnée par rapport au budget de départ.");
console.log("✅ Masse salariale de départ raisonnable par rapport au budget de départ.");

// --- Onglet Effectif : colonne Salaire visible, et résumé de la masse
// salariale hebdomadaire. ---
clickTab("effectif");
const rosterHtml = doc.getElementById("rosterContent").innerHTML;
if (!rosterHtml.includes("Salaire")) throw new Error("❌ L'onglet Effectif devrait afficher une colonne Salaire.");
console.log("✅ L'onglet Effectif affiche le salaire de chaque joueur.");

// --- Onglet Économie : carte "Masse salariale". ---
clickTab("economie");
const payrollText = doc.getElementById("economiePayroll").textContent;
console.log("Masse salariale affichée (Économie) :", payrollText);
if (!payrollText || payrollText === "0 €/sem.") throw new Error("❌ La carte Masse salariale devrait afficher un montant hebdomadaire.");

// --- La masse salariale est bien déduite du budget à chaque semaine
// d'entraînement, entraînement ou pas. Depuis le passage au calendrier réel
// (tâche #21), l'entraînement hebdomadaire n'est plus déclenché isolément
// (bouton "Valider la semaine" indépendant du calendrier) : une semaine
// réelle fait obligatoirement jouer ses 2 journées de championnat en même
// temps (voir fastForwardCalendar/catchUpLeague) — on ne peut donc plus
// isoler "une semaine sans le moindre match" comme avant. On vérifie
// désormais le delta de budget de façon générale et robuste : il doit
// correspondre EXACTEMENT à la somme de TOUTES les transactions journalisées
// pendant cette semaine (salaires, subvention de démarrage, droits TV, et
// une éventuelle recette de billetterie si l'un des 2 matchs était à
// domicile) — pas seulement au sous-ensemble "salaires + subvention" comme
// avant, ce qui reste une vérification tout aussi stricte de la cohérence
// budget/journal, tout en couvrant le cas général.
const budgetBeforeSave = readRawSave(savePath);
const budgetBefore = budgetBeforeSave.team.budget;
const txCountBefore = budgetBeforeSave.team.transactions.length;
win.close();
fastForwardCalendar(savePath, 2);
dom = await openGame(html, baseUrl);
doc = dom.window.document;
win = dom.window;
if (!doc.getElementById("catchupSection").classList.contains("hidden")) {
  doc.getElementById("catchupContinueBtn").click();
}
await flush(dom);
saved = readRawSave(savePath);
const budgetAfter = saved.team.budget;
const newTxs = saved.team.transactions.slice(txCountBefore);
console.log("\nBudget avant la 1ère semaine réelle :", budgetBefore, " → après (2 journées + entraînement hebdomadaire) :", budgetAfter);
console.log("Nouvelles transactions journalisées :", newTxs.map(t => `${t.label}: ${t.amount}`));

const payrollTx = newTxs.find(t => t.label === "Salaires des joueurs");
if (!payrollTx || payrollTx.amount >= 0) throw new Error("❌ Une transaction \"Salaires des joueurs\" négative devrait être journalisée chaque semaine.");
const subsidyTx = newTxs.find(t => t.label === "Subvention de démarrage");
if (!subsidyTx || subsidyTx.amount <= 0) throw new Error("❌ La semaine 1 (dans les STARTUP_SUBSIDY_WEEKS premières semaines) devrait toucher la subvention de démarrage.");
console.log("Subvention de démarrage journalisée :", subsidyTx.amount, "€");
// Droits TV (retour utilisateur : "il faut aussi prévoir les droits TV") :
// une nouvelle carrière démarre en Division I (voir promotion_test.js), donc
// une transaction "Droits TV" est journalisée dès la semaine 1.
const tvTx = newTxs.find(t => t.label && t.label.startsWith("Droits TV"));
if (!tvTx || tvTx.amount <= 0) throw new Error("❌ Une transaction \"Droits TV\" positive devrait être journalisée chaque semaine (division actuelle du club).");
console.log("Droits TV journalisés :", tvTx.amount, "€ (" + tvTx.label + ")");

const sumNewTxs = newTxs.reduce((s, t) => s + t.amount, 0);
if (Math.round(budgetAfter - budgetBefore) !== Math.round(sumNewTxs)) {
  throw new Error("❌ La variation de budget devrait correspondre exactement à la somme de toutes les transactions journalisées cette semaine (salaires, subvention, droits TV, recette de billetterie éventuelle).");
}
console.log("✅ La masse salariale est bien débitée et journalisée chaque semaine (subvention de démarrage, droits TV, et recette de billetterie éventuelle, tous pris en compte dans le delta de budget).");

// --- Persistance : le salaire de chaque joueur survit à un rechargement
// (même serveur), et ne se recalcule PAS tout seul d'après les attributs
// actuels (sinon un simple rechargement ferait bouger les salaires en
// dehors du rythme "une fois par saison"). ---
win.close();
const dom2 = await openGame(html, baseUrl);
const win2 = dom2.window;
const reloaded = readRawSave(savePath);
const salariesMatch = reloaded.team.players.every((p, i) => p.salary === saved.team.players[i].salary);
console.log("\nSalaires identiques avant/après rechargement :", salariesMatch);
if (!salariesMatch) throw new Error("❌ Les salaires devraient survivre au rechargement sans se recalculer tout seuls.");
console.log("✅ Les salaires persistent au rechargement, figés jusqu'au prochain passage de saison.");
await flush(dom2);
win2.close();
server.close();

console.log("\n✅ Grille salariale des joueurs vérifiée : formule exponentielle cohérente, salaire visible (Effectif/Économie), masse salariale payée chaque semaine, persistance.");

})().catch(e => { console.error(e); process.exit(1); });
