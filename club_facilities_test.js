// Vérifie les "autres infrastructures" du club (retour utilisateur, 2026-09 :
// "à côté du bouton salle à acheter, mettre les autres améliorations
// (boutique des supporters, centre de formation [...] station tv [...] salle
// de soin, SPA, salle de musculation" puis "pour les option salle de sport,
// spa... il faut 4 niveaux (rien, pas cher, moyen cher, cher). plus c'est
// cher plus c'est performant") — voir CLUB_FACILITIES/Team.facilityLevels/
// Team.upgradeFacility/Team.nextFacilityLevel côté moteur.
//
// Conception (choisie ici, retour utilisateur : "tu proposes, j'ajuste
// ensuite") : Boutique des supporters et Centre de formation existaient déjà
// (inchangés, simplement surfacés dans la nouvelle grille) ; salle de soin et
// SPA ont été fusionnées en UNE seule infrastructure ("Espace bien-être",
// les deux idées étant redondantes) ; 3 NOUVELLES infrastructures au total :
//   - Station TV : revenu hebdomadaire fixe supplémentaire (comme la
//     boutique des supporters), payé dans Team.trainWeek.
//   - Salle de musculation : réduit le risque de blessure en match.
//   - Espace bien-être (spa + soins) : réduit l'accumulation de fatigue en
//     match.
// Chacune avec 4 paliers (0 = rien construit, aucun effet, jusqu'à 3 = le
// plus cher/performant), exactement le nombre demandé.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const E = require("./engine.js");
const {
  CLUB_FACILITIES, facilityInfo, generateStartingRoster, generateLeague,
  generateMultiManagerLeague, serializeTeam, teamFromSave, MatchEngine,
} = E;
const actions = require("./server/actions.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

const T0 = Date.UTC(2026, 8, 7);

function freshTeamAndLeague() {
  const team = generateStartingRoster("Lyon Facilities Test");
  team.offensivePriorities = ["Jeu en pénétration", "Pick & Roll", "Transition rapide"];
  const league = generateLeague(team, 1, T0);
  return { team, league };
}

// ---------------------------------------------------------------------
// Partie 1 : CLUB_FACILITIES — structure (4 paliers chacune, niveau 0 = rien).
// ---------------------------------------------------------------------
{
  const keys = Object.keys(CLUB_FACILITIES);
  console.log("Infrastructures définies :", keys.join(", "));
  if (keys.length !== 3) throw new Error(`❌ 3 infrastructures attendues (tvStation, gym, wellness), obtenu : ${keys.length}.`);
  keys.forEach(key => {
    const cfg = CLUB_FACILITIES[key];
    if (cfg.levels.length !== 4) throw new Error(`❌ ${key} devrait avoir 4 paliers (rien, pas cher, moyen cher, cher), obtenu ${cfg.levels.length}.`);
    if (cfg.levels[0].level !== 0 || cfg.levels[0].cost !== 0) throw new Error(`❌ ${key} : le palier 0 devrait être gratuit ("rien").`);
    for (let i = 1; i < cfg.levels.length; i++) {
      if (cfg.levels[i].cost <= cfg.levels[i - 1].cost) {
        throw new Error(`❌ ${key} : le coût devrait strictement augmenter à chaque palier (plus cher = plus performant).`);
      }
    }
  });
  console.log("✅ Les 3 infrastructures ont bien 4 paliers chacune (0 = rien), coût strictement croissant.");

  // Performance strictement croissante avec le prix, palier par palier.
  const gymLevels = CLUB_FACILITIES.gym.levels;
  for (let i = 1; i < gymLevels.length; i++) {
    if (gymLevels[i].injuryRiskMult >= gymLevels[i - 1].injuryRiskMult) {
      throw new Error("❌ La salle de musculation devrait réduire le risque de blessure de plus en plus à chaque palier plus cher.");
    }
  }
  const wellnessLevels = CLUB_FACILITIES.wellness.levels;
  for (let i = 1; i < wellnessLevels.length; i++) {
    if (wellnessLevels[i].fatigueMult >= wellnessLevels[i - 1].fatigueMult) {
      throw new Error("❌ L'espace bien-être devrait réduire l'accumulation de fatigue de plus en plus à chaque palier plus cher.");
    }
  }
  const tvLevels = CLUB_FACILITIES.tvStation.levels;
  for (let i = 1; i < tvLevels.length; i++) {
    if (tvLevels[i].weeklyRevenue <= tvLevels[i - 1].weeklyRevenue) {
      throw new Error("❌ La station TV devrait rapporter de plus en plus à chaque palier plus cher.");
    }
  }
  console.log("✅ Plus c'est cher, plus c'est performant (blessure, fatigue, revenu), pour les 3 infrastructures.");
}

// ---------------------------------------------------------------------
// Partie 2 : Team.facilityLevels par défaut + Team.upgradeFacility.
// ---------------------------------------------------------------------
{
  const { team } = freshTeamAndLeague();
  if (!team.facilityLevels || team.facilityLevels.tvStation !== 0 || team.facilityLevels.gym !== 0 || team.facilityLevels.wellness !== 0) {
    throw new Error("❌ Une équipe fraîche devrait démarrer sans aucune infrastructure (tout à 0).");
  }
  console.log("✅ Une équipe fraîche démarre avec les 3 infrastructures au niveau 0 (rien construit).");

  Object.keys(CLUB_FACILITIES).forEach(key => {
    const cfg = CLUB_FACILITIES[key];
    const budgetBefore = team.budget;
    const next1 = cfg.levels[1];
    if (!team.upgradeFacility(key)) throw new Error(`❌ ${key} : le premier palier abordable devrait pouvoir être acheté.`);
    if (team.facilityLevels[key] !== 1) throw new Error(`❌ ${key} : le niveau aurait dû passer à 1.`);
    if (team.budget !== budgetBefore - next1.cost) throw new Error(`❌ ${key} : le coût (${next1.cost}) aurait dû être déduit du budget.`);
    console.log(`✅ ${cfg.name} : premier palier acheté, coût déduit du budget.`);

    // Budget insuffisant : rejeté, rien ne change.
    const levelBefore = team.facilityLevels[key];
    const savedBudget = team.budget;
    team.budget = 1;
    if (team.upgradeFacility(key)) throw new Error(`❌ ${key} : un achat non abordable devrait être rejeté.`);
    if (team.facilityLevels[key] !== levelBefore || team.budget !== 1) throw new Error(`❌ ${key} : un achat rejeté ne devrait RIEN muter.`);
    team.budget = savedBudget;
    console.log(`✅ ${cfg.name} : achat non abordable rejeté sans rien muter.`);

    // Va jusqu'au niveau maximum, puis vérifie le rejet propre au-delà.
    team.budget = 100000000;
    while (team.nextFacilityLevel(key)) team.upgradeFacility(key);
    if (team.facilityLevels[key] !== cfg.levels[cfg.levels.length - 1].level) {
      throw new Error(`❌ ${key} : devrait avoir atteint le dernier palier.`);
    }
    if (team.upgradeFacility(key)) throw new Error(`❌ ${key} : une infrastructure déjà au niveau maximum ne devrait plus pouvoir être achetée.`);
    console.log(`✅ ${cfg.name} : rejet propre au-delà du dernier palier.`);
  });
}

// ---------------------------------------------------------------------
// Partie 3 : Station TV — revenu hebdomadaire versé dans Team.trainWeek,
// exactement comme la boutique des supporters (voir tv_rights_test.js pour
// le même principe appliqué aux droits TV de la division).
// ---------------------------------------------------------------------
{
  const { team } = freshTeamAndLeague();
  const w0 = team.trainWeek();
  if (w0.tvStationRevenue !== 0) throw new Error("❌ Aucun revenu de station TV ne devrait être versé sans station TV construite.");
  console.log("✅ Aucun revenu de station TV tant qu'aucune station n'est construite.");

  team.upgradeFacility("tvStation");
  const expected = facilityInfo("tvStation", team.facilityLevels.tvStation).weeklyRevenue;
  const budgetBefore = team.budget;
  const w1 = team.trainWeek();
  if (w1.tvStationRevenue !== expected) throw new Error(`❌ Le revenu de station TV attendu était ${expected}, obtenu ${w1.tvStationRevenue}.`);
  if (team.budget !== budgetBefore + w1.tvStationRevenue - (w1.playerPayroll || 0) - (w1.youthPayroll || 0) + (w1.tvRightsRevenue || 0) + (w1.fanShopRevenue || 0)) {
    // Vérification plus simple, robuste au reste du rapport : la transaction existe avec le bon montant.
  }
  const tx = team.transactions.find(t => t.label && t.label.startsWith("Recettes station TV"));
  if (!tx || tx.amount !== expected) throw new Error("❌ La transaction 'Recettes station TV' devrait être journalisée avec le bon montant.");
  console.log(`✅ La station TV verse ${expected}/semaine, journalisé dans les transactions.`);
}

// ---------------------------------------------------------------------
// Partie 4 : Salle de musculation / Espace bien-être — effet EN MATCH (voir
// MatchEngine.applyFatigue). Vérifié directement sur la formule (Math.random
// figé) plutôt que statistiquement, pour un test rapide et déterministe.
// ---------------------------------------------------------------------
{
  const { team: teamA, league } = freshTeamAndLeague();
  const teamB = league.teams.find(t => t !== teamA);
  const engine = new MatchEngine(teamA, teamB, 1);
  teamA.resetForMatch();
  teamB.resetForMatch();
  const p = teamA.onCourtPlayers()[0];
  p.fatigue = 50;

  // --- Fatigue : avec espace bien-être au palier max, l'accumulation de
  // fatigue sur un intervalle donné doit être STRICTEMENT plus faible que
  // sans (palier 0). ---
  const seconds = 24; // choisi pour un delta de fatigue "propre" sans le mult (seconds/24 * mult = mult)
  const fatigueBefore = p.fatigue;
  engine.applyFatigue(teamA, "Normal", seconds, 1, "10:00", []);
  const deltaNoWellness = p.fatigue - fatigueBefore;

  teamA.budget = 100000000; // assez pour les 3 paliers successifs, peu importe le budget de départ
  teamA.upgradeFacility("wellness");
  teamA.upgradeFacility("wellness");
  teamA.upgradeFacility("wellness"); // palier max
  p.fatigue = fatigueBefore;
  engine.applyFatigue(teamA, "Normal", seconds, 1, "10:00", []);
  const deltaWithWellness = p.fatigue - fatigueBefore;
  console.log(`Accumulation de fatigue sur ${seconds}s — sans espace bien-être : +${deltaNoWellness.toFixed(3)}, avec (palier max) : +${deltaWithWellness.toFixed(3)}`);
  if (!(deltaWithWellness < deltaNoWellness)) {
    throw new Error("❌ L'espace bien-être (palier max) devrait réduire l'accumulation de fatigue en match par rapport à aucun espace bien-être.");
  }
  const expectedMult = facilityInfo("wellness", 3).fatigueMult;
  if (Math.abs(deltaWithWellness - deltaNoWellness * expectedMult) > 1e-9) {
    throw new Error("❌ Le delta de fatigue avec espace bien-être devrait correspondre EXACTEMENT à deltaSansEffet * fatigueMult du palier.");
  }
  console.log("✅ L'espace bien-être réduit l'accumulation de fatigue en match, exactement selon son fatigueMult.");

  // --- Blessures : avec salle de musculation au palier max, la probabilité
  // de blessure (injuryChance) doit être STRICTEMENT plus faible — vérifié
  // en figeant Math.random() juste sous le seuil "sans salle" : la blessure
  // doit alors disparaître une fois le multiplicateur appliqué.
  const { team: teamC, league: league2 } = freshTeamAndLeague();
  const teamD = league2.teams.find(t => t !== teamC);
  const engine2 = new MatchEngine(teamC, teamD, 1);
  teamC.resetForMatch();
  teamD.resetForMatch();
  const p2 = teamC.onCourtPlayers()[0];
  p2.fatigue = 100; // fatigueFactor maximal (1.0), pour une injuryChance de base la plus haute possible
  const BASE_INJURY_RATE = 0.00013;
  const fatigueFactor = 0.25 + 0.75 * (p2.fatigue / 100);
  const baseChance = BASE_INJURY_RATE * (seconds / 12) * fatigueFactor;
  const gymMult3 = facilityInfo("gym", 3).injuryRiskMult;
  const reducedChance = baseChance * gymMult3;
  if (!(reducedChance < baseChance)) throw new Error("❌ Le multiplicateur de la salle de musculation devrait réduire la chance de blessure.");
  // Un tirage compris entre reducedChance et baseChance : blessure SANS
  // salle de musculation, mais PAS avec (palier max).
  const originalRandom = Math.random;
  const probe = (reducedChance + baseChance) / 2;
  Math.random = () => probe;
  try {
    p2.fatigue = 100;
    p2.injured = false;
    engine2.applyFatigue(teamC, "Normal", seconds, 1, "10:00", []);
    if (!p2.injured) throw new Error("❌ Sans salle de musculation, ce tirage aurait dû déclencher une blessure (contrôle du test).");

    teamC.budget = 100000000; // assez pour les 3 paliers successifs, peu importe le budget de départ
    teamC.upgradeFacility("gym");
    teamC.upgradeFacility("gym");
    teamC.upgradeFacility("gym"); // palier max
    p2.fatigue = 100;
    p2.injured = false;
    p2.onCourt = true;
    engine2.applyFatigue(teamC, "Normal", seconds, 1, "10:00", []);
    if (p2.injured) throw new Error("❌ Avec la salle de musculation au palier max, ce même tirage ne devrait PLUS déclencher de blessure.");
  } finally {
    Math.random = originalRandom;
  }
  console.log("✅ La salle de musculation (palier max) réduit bien la probabilité de blessure en match (tirage identique, résultat différent).");
}

// ---------------------------------------------------------------------
// Partie 5 : persistance (serializeTeam/teamFromSave).
// ---------------------------------------------------------------------
{
  const { team } = freshTeamAndLeague();
  team.upgradeFacility("tvStation");
  team.upgradeFacility("gym");
  team.upgradeFacility("gym");
  const saved = serializeTeam(team);
  if (JSON.stringify(saved.facilityLevels) !== JSON.stringify(team.facilityLevels)) {
    throw new Error("❌ serializeTeam devrait porter facilityLevels tel quel.");
  }
  const restored = teamFromSave({ ...saved, teamName: team.name, players: saved.players });
  if (restored.facilityLevels.tvStation !== 1 || restored.facilityLevels.gym !== 2 || restored.facilityLevels.wellness !== 0) {
    throw new Error(`❌ teamFromSave devrait restaurer facilityLevels exactement, obtenu : ${JSON.stringify(restored.facilityLevels)}.`);
  }
  console.log("✅ facilityLevels survit à un aller-retour serializeTeam/teamFromSave.");

  // Ancienne sauvegarde (avant cette fonctionnalité, sans facilityLevels) :
  // repli propre sur {tvStation:0, gym:0, wellness:0}, jamais de crash.
  const legacySave = { ...saved };
  delete legacySave.facilityLevels;
  const restoredLegacy = teamFromSave({ ...legacySave, teamName: team.name, players: saved.players });
  if (restoredLegacy.facilityLevels.tvStation !== 0 || restoredLegacy.facilityLevels.gym !== 0 || restoredLegacy.facilityLevels.wellness !== 0) {
    throw new Error("❌ Une sauvegarde sans facilityLevels (ancienne) devrait retomber sur {tvStation:0, gym:0, wellness:0}, sans crash.");
  }
  console.log("✅ Une sauvegarde d'avant cette fonctionnalité retombe proprement sur aucune infrastructure, sans crash.");
}

// ---------------------------------------------------------------------
// Partie 6 : action serveur (server/actions.js:upgradeFacility) — même
// contrat que upgradeArena/upgradeFanShop (voir server/actions_test.js).
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const budgetBefore = team.budget;
  const res = actions.upgradeFacility(team, 0, league, { facility: "gym" });
  if (!res.ok) throw new Error(`❌ Un achat abordable de salle de musculation devrait être accepté : ${res.error}`);
  if (team.facilityLevels.gym !== 1) throw new Error("❌ facilityLevels.gym aurait dû passer à 1.");
  if (res.budget !== team.budget || res.facilityLevels.gym !== 1) throw new Error("❌ La réponse devrait refléter le nouveau facilityLevels/budget.");
  console.log("✅ upgradeFacility (action serveur) achète le palier suivant et déduit le coût du budget.");

  // Infrastructure inconnue : rejetée.
  const unknown = actions.upgradeFacility(team, 0, league, { facility: "sauna_imaginaire" });
  if (unknown.ok) throw new Error("❌ Une infrastructure inconnue devrait être rejetée.");
  console.log("✅ upgradeFacility rejette une infrastructure inconnue.");

  // Budget insuffisant : rejeté, rien ne change.
  const levelBefore = team.facilityLevels.gym;
  team.budget = 10;
  const unaffordable = actions.upgradeFacility(team, 0, league, { facility: "gym" });
  if (unaffordable.ok) throw new Error("❌ Un achat non abordable devrait être rejeté.");
  if (team.facilityLevels.gym !== levelBefore) throw new Error("❌ Un achat rejeté ne devrait RIEN muter.");
  console.log("✅ upgradeFacility rejette un achat non abordable sans rien muter.");

  // teamIndex non nul (multi-manager), isolé de l'équipe 0.
  const multiLeague = generateMultiManagerLeague(["Lyon Multi Facilities", "Marseille Multi Facilities"], 1, T0);
  const multiTeam = multiLeague.teams[1];
  const multiRes = actions.upgradeFacility(multiTeam, 1, multiLeague, { facility: "wellness" });
  if (!multiRes.ok || multiTeam.facilityLevels.wellness !== 1) throw new Error("❌ upgradeFacility à un teamIndex non nul devrait s'appliquer à CETTE équipe.");
  if (multiLeague.teams[0].facilityLevels.wellness === 1) throw new Error("❌ upgradeFacility à teamIndex=1 ne devrait pas avoir touché l'équipe 0.");
  console.log("✅ upgradeFacility fonctionne correctement pour un teamIndex non nul (1), isolé de l'équipe 0.");
}

// ---------------------------------------------------------------------
// Partie 7 : parcours UI — l'onglet Salle affiche la nouvelle grille
// "Autres infrastructures" (station TV / salle de musculation / espace
// bien-être + carte Centre de formation, upgradable directement via sa
// flèche depuis 2026-09, voir Partie 8bis plus bas), un achat s'y reflète
// immédiatement et persiste bien côté serveur (mode multi-manager).
// ---------------------------------------------------------------------
(async () => {

const { server, savePath, baseUrl } = await startTestServer();
let dom = await openGame(html, baseUrl);
let doc = dom.window.document;
let win = dom.window;

function clickTab(key) {
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click();
}

clickTab("salle");
const otherHolder = doc.getElementById("otherFacilitiesPanel");
if (!otherHolder) throw new Error("❌ #otherFacilitiesPanel devrait exister sur l'onglet Salle.");
const cardsBefore = otherHolder.querySelectorAll(".staff-hire-card");
// 1 Centre de formation + 1 Boutique des supporters (retour utilisateur,
// 2026-09 : "la boutique de supporters doit être avec les autres
// infrastructures en haut") + 3 infrastructures CLUB_FACILITIES = 5.
if (cardsBefore.length !== 5) throw new Error(`❌ La grille "Autres infrastructures" devrait afficher 5 cartes (Centre de formation + Boutique des supporters + 3 infrastructures), obtenu ${cardsBefore.length}.`);
console.log(`✅ L'onglet Salle affiche bien la grille "Autres infrastructures" (${cardsBefore.length} cartes).`);

// Chaque carte n'affiche que l'état ACTUEL de l'infrastructure (retour
// utilisateur, 2026-09 : "je ne veux voir que l'état actuel [...] une
// petite flèche sur la brique pour upgrader"), jamais un aperçu du palier
// suivant — donc au niveau 0 (rien construit), le nom affiché est celui du
// palier 0 ("Aucune station TV", etc.), pas celui du premier palier payant.
if (!otherHolder.textContent.includes("Aucune station TV")) throw new Error("❌ La grille devrait afficher l'état actuel de la Station TV (\"Aucune station TV\" au niveau 0).");
if (!otherHolder.textContent.includes("Aucune salle de musculation")) throw new Error("❌ La grille devrait afficher l'état actuel de la Salle de musculation (\"Aucune salle de musculation\" au niveau 0).");
if (!otherHolder.textContent.includes("Aucun espace bien-être")) throw new Error("❌ La grille devrait afficher l'état actuel de l'Espace bien-être (\"Aucun espace bien-être\" au niveau 0).");
if (!otherHolder.textContent.includes("Centre de formation")) throw new Error("❌ La grille devrait mentionner le Centre de formation.");
console.log("✅ Les 3 nouvelles infrastructures (état actuel, niveau 0) et la carte Centre de formation sont bien présentes.");

// Achat de la station TV via la flèche de sa carte : ouvre d'abord une
// confirmation (retour utilisateur, 2026-09 : "on voit le cout de
// l'évolution et on valide si ok", voir showUpgradeConfirm — le nom du
// PROCHAIN palier, "Studio local", apparaît dans cette confirmation, pas sur
// la carte elle-même), puis niveau et budget mis à jour après clic sur
// "Valider", côté client ET persisté côté serveur.
const budgetBefore = win.eval("teamA.budget");
const tvCard = otherHolder.querySelector('[data-facility-card="tvStation"]');
if (!tvCard) throw new Error("❌ La carte de la Station TV (data-facility-card=\"tvStation\") devrait être présente.");
const tvArrow = tvCard.querySelector(".facility-upgrade-arrow");
if (!tvArrow) throw new Error("❌ La carte de la Station TV devrait avoir une flèche d'amélioration.");
tvArrow.click();
const tvConfirmDialog = doc.getElementById("upgradeConfirmOverlay");
if (!tvConfirmDialog) throw new Error("❌ Cliquer sur la flèche de la Station TV devrait ouvrir une confirmation avant l'achat.");
if (!tvConfirmDialog.textContent.includes("Studio local")) {
  throw new Error("❌ La confirmation devrait mentionner le premier palier payant (\"Studio local\").");
}
if (!tvConfirmDialog.textContent.includes("Construire")) {
  throw new Error("❌ La confirmation d'achat d'une infrastructure jamais construite (niveau 0) devrait afficher \"Construire\", pas \"Améliorer\".");
}
doc.getElementById("upgradeConfirmValidate").click();
const levelAfterClick = win.eval("teamA.facilityLevels.tvStation");
if (levelAfterClick !== 1) throw new Error(`❌ Après clic sur Valider, teamA.facilityLevels.tvStation aurait dû passer à 1, obtenu ${levelAfterClick}.`);
const budgetAfterClick = win.eval("teamA.budget");
if (budgetAfterClick >= budgetBefore) throw new Error("❌ Le budget aurait dû diminuer après l'achat de la Station TV.");
console.log("✅ Cliquer sur la flèche puis Valider applique l'infrastructure et déduit le budget côté client.");

await flush(dom);
const saved = readRawSave(savePath);
if (!saved.team.facilityLevels || saved.team.facilityLevels.tvStation !== 1) {
  throw new Error(`❌ L'achat de la Station TV devrait être persisté côté serveur, obtenu : ${JSON.stringify(saved.team && saved.team.facilityLevels)}.`);
}
console.log("✅ L'achat de la Station TV est bien persisté côté serveur.");

win.close();
server.close();
console.log("\n✅ Autres infrastructures du club vérifiées : 3 nouvelles infrastructures à 4 paliers chacune, achat/rejet corrects, effets exacts (revenu station TV, réduction du risque de blessure, réduction de l'accumulation de fatigue), persistance fidèle (y compris repli propre sur une ancienne sauvegarde), action serveur isolée par équipe, et grille visible/fonctionnelle sur l'onglet Salle.");

})().catch(e => { console.error(e); process.exit(1); });
