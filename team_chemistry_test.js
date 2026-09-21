// Vérifie le système d'"alchimie d'équipe" (retour utilisateur, 2026-09) :
//
// "l'alchimie du groupe elle doit avoir un impact positif ou négatif sur
// les perfomances d'équipe: elle peut être impactée:
//  - par le coach lors de ses interviews
//  - par les changements fréquents de joueurs (jamais une base de joueurs
//    fixes, donc il faut recreer du lien entre les joueurs), mais changer
//    un joueur majeur d'une équipe doit forcément avoir bcp plus d'impact
//    que de changer le 12 homme (qui doit être très faible)
//  - changer trop régulièrement de tactique doit aussi avoir un petit
//    impact"
//
// Voir engine.js : le grand commentaire au-dessus de
// CHEMISTRY_ROSTER_CHANGE_MAX_RANK, Team.chemistry/chemistryFactor/
// applyChemistryDelta/checkTacticsChemistry, chemistryRosterImportance/
// rosterRankOf, MILESTONE_INTERVIEW_TONES.chemistryWin/chemistryLoss,
// League._resolveListing/Team.sellPlayer (levier 2), recordMatchStatsForTeam
// (levier 3), Player.eff()/Team.resetForMatch (effet sur la performance).
//
// Test purement moteur (pas de serveur HTTP ni de DOM, comme
// server/actions_test.js) : plus rapide, se concentre sur la logique.
const E = require("./engine.js");
const {
  generateStartingRoster, generateLeague, generateMultiManagerLeague, serializeTeam, teamFromSave,
  chemistryRosterImportance, rosterRankOf, chemistryLabel,
  CHEMISTRY_ROSTER_CHANGE_MAX_RANK, CHEMISTRY_ROSTER_CHANGE_BASE,
  CHEMISTRY_TACTICS_OFFENSE_PENALTY, CHEMISTRY_TACTICS_DEFENSE_PENALTY, CHEMISTRY_TACTICS_RHYTHM_PENALTY,
  CHEMISTRY_TACTICS_TRAINED_FACTOR,
  MILESTONE_INTERVIEW_TONES, recordMatchStatsForTeam, MatchEngine,
} = E;

const T0 = Date.UTC(2026, 8, 21);

// ---------------------------------------------------------------------
// 1) Importance selon le rang : le meilleur joueur pèse plein pot, le
//    "12e homme" (rang CHEMISTRY_ROSTER_CHANGE_MAX_RANK) ne pèse presque
//    rien, et ça décroît strictement entre les deux.
// ---------------------------------------------------------------------
(function testRosterImportanceByRank() {
  const rank1 = chemistryRosterImportance(1);
  const rank12 = chemistryRosterImportance(CHEMISTRY_ROSTER_CHANGE_MAX_RANK);
  const rank20 = chemistryRosterImportance(20);
  if (rank1 !== 1) throw new Error(`❌ Le meilleur joueur (rang 1) devrait peser 1.0, obtenu ${rank1}.`);
  if (rank12 !== 0) throw new Error(`❌ Le "12e homme" devrait peser ~0, obtenu ${rank12}.`);
  if (rank20 !== 0) throw new Error(`❌ Un rang au-delà de 12 devrait rester à 0, obtenu ${rank20}.`);
  for (let r = 2; r <= CHEMISTRY_ROSTER_CHANGE_MAX_RANK; r++) {
    if (chemistryRosterImportance(r) >= chemistryRosterImportance(r - 1)) {
      throw new Error(`❌ L'importance devrait décroître strictement du rang ${r - 1} au rang ${r}.`);
    }
  }
  console.log("✅ chemistryRosterImportance : le meilleur joueur pèse plein pot (1.0), le 12e homme quasiment rien (0), décroissance stricte entre les deux.");
})();

// ---------------------------------------------------------------------
// 2) rosterRankOf : classe bien les joueurs par overall() décroissant.
// ---------------------------------------------------------------------
(function testRosterRankOf() {
  const team = generateStartingRoster("Rank Test");
  const sorted = [...team.players].sort((a, b) => b.overall() - a.overall());
  const best = sorted[0], worst = sorted[sorted.length - 1];
  if (rosterRankOf(team.players, best.id) !== 1) throw new Error("❌ Le meilleur joueur devrait être rang 1.");
  if (rosterRankOf(team.players, worst.id) !== team.players.length) throw new Error("❌ Le moins bon joueur devrait être au dernier rang.");
  console.log("✅ rosterRankOf classe correctement les joueurs par overall() décroissant.");
})();

// ---------------------------------------------------------------------
// 3) Levier 2 (transferts) : vendre un joueur MAJEUR fait bien plus mal à
//    l'alchimie que vendre le fond de banc.
// ---------------------------------------------------------------------
(function testTransferImpactByImportance() {
  const teamStar = generateStartingRoster("Star Seller");
  generateLeague(teamStar, 1, T0);
  teamStar.chemistry = 80;
  const sorted = [...teamStar.players].sort((a, b) => b.overall() - a.overall());
  const star = sorted[0];
  star.forSale = true;
  star.salePrice = 1;
  const chemistryBeforeStar = teamStar.chemistry;
  teamStar.sellPlayer(star.id);
  const dropForStar = chemistryBeforeStar - teamStar.chemistry;

  const teamBench = generateStartingRoster("Bench Seller");
  generateLeague(teamBench, 1, T0);
  teamBench.chemistry = 80;
  const sortedBench = [...teamBench.players].sort((a, b) => b.overall() - a.overall());
  const twelfth = sortedBench[Math.min(CHEMISTRY_ROSTER_CHANGE_MAX_RANK - 1, sortedBench.length - 1)];
  twelfth.forSale = true;
  twelfth.salePrice = 1;
  const chemistryBeforeBench = teamBench.chemistry;
  teamBench.sellPlayer(twelfth.id);
  const dropForBench = chemistryBeforeBench - teamBench.chemistry;

  console.log(`   Vente du meilleur joueur : -${dropForStar.toFixed(1)} d'alchimie. Vente du 12e homme : -${dropForBench.toFixed(1)}.`);
  if (!(dropForStar > dropForBench)) {
    throw new Error(`❌ Vendre le meilleur joueur (-${dropForStar}) devrait faire bien plus mal que vendre le 12e homme (-${dropForBench}).`);
  }
  if (dropForBench > 1) {
    throw new Error(`❌ Vendre le 12e homme devrait avoir un impact "très faible" (obtenu -${dropForBench}).`);
  }
  if (Math.abs(dropForStar - CHEMISTRY_ROSTER_CHANGE_BASE) > 0.01) {
    throw new Error(`❌ Vendre LE meilleur joueur (rang 1) devrait coûter exactement CHEMISTRY_ROSTER_CHANGE_BASE (${CHEMISTRY_ROSTER_CHANGE_BASE}), obtenu ${dropForStar}.`);
  }
  console.log("✅ Vendre un joueur majeur fait bien plus mal à l'alchimie que vendre le 12e homme (impact quasi nul).");
})();

// ---------------------------------------------------------------------
// 4) Un vrai transfert de marché (League._resolveListing) pénalise les
//    DEUX équipes (vendeuse ET acheteuse), jamais de bonus.
// ---------------------------------------------------------------------
(function testMarketTransferPenalizesBothSides() {
  const league = generateMultiManagerLeague(["Vendeur", "Acheteur"], 1, T0);
  const seller = league.teams[0];
  const buyer = league.teams[1];
  seller.chemistry = 70;
  buyer.chemistry = 70;
  // Le meilleur joueur (rang 1) explicitement, pour un impact garanti et
  // déterministe, peu importe comment le roster a été tiré au hasard.
  const player = [...seller.players].sort((a, b) => b.overall() - a.overall())[0];
  const listing = league.listPlayerForSale(0, player.id, 1000, T0);
  league.placeBid(listing.id, 1, 5000, T0 + 1000);
  league._resolveListing(league.transferListings.find(l => l.id === listing.id), T0 + 2000);

  if (!(seller.chemistry < 70)) throw new Error("❌ L'équipe vendeuse devrait perdre de l'alchimie après un transfert.");
  if (!(buyer.chemistry < 70)) throw new Error("❌ L'équipe acheteuse devrait aussi perdre de l'alchimie après un transfert.");
  console.log(`✅ Un transfert de marché pénalise les deux équipes (vendeur ${70 - seller.chemistry >= 0 ? "-" : "+"}${Math.abs(70 - seller.chemistry).toFixed(1)}, acheteur -${(70 - buyer.chemistry).toFixed(1)}), jamais de bonus.`);
})();

// ---------------------------------------------------------------------
// 5) Levier 1 (interviews) : un ton "Humble" construit plus de cohésion
//    qu'un ton "Agressif", y compris (et surtout) après une défaite.
// ---------------------------------------------------------------------
(function testInterviewToneAffectsChemistry() {
  // Correctif 2026-09 (retour utilisateur : "la première interview [...] ne
  // doit pas porter sur le resultat du premier match") : "debut-saison" est
  // désormais TOUJOURS won=true (aucune variante défaite, voir
  // Team.queueSeasonPreviewInterview), donc plus adaptée pour comparer
  // victoire/défaite ici — "mi-saison" (toujours liée à un vrai résultat de
  // match) reste le jalon de référence pour ce test générique. `generateLeague`
  // met déjà en attente sa propre interview "debut-saison" automatiquement
  // (voir buildLeagueWithHumanTeams) : retrouver l'entrée par `milestone
  // === "mi-saison"` plutôt que par index évite toute ambiguïté avec elle.
  function chemistryDeltaFor(tone, won) {
    const team = generateStartingRoster(`Interview ${tone} ${won}`);
    generateLeague(team, 1, T0);
    team.chemistry = 50;
    const player = team.players[0];
    player.secondsPlayed = 600;
    team.applyMoraleForResult(won, won ? 8 : -8, "Rivaux FC", 9, T0, "mi-saison", [player.id]);
    const pending = team.pendingInterviews.find(i => i.milestone === "mi-saison");
    const before = team.chemistry;
    team.resolveInterview(pending.id, tone, T0);
    return team.chemistry - before;
  }

  const aggroLoss = chemistryDeltaFor("Agressif", false);
  const humbleLoss = chemistryDeltaFor("Humble", false);
  const aggroWin = chemistryDeltaFor("Agressif", true);
  const humbleWin = chemistryDeltaFor("Humble", true);

  if (!(humbleLoss > aggroLoss)) {
    throw new Error(`❌ "Humble" après une défaite (${humbleLoss}) devrait construire plus de cohésion que "Agressif" (${aggroLoss}).`);
  }
  if (!(humbleWin > aggroWin)) {
    throw new Error(`❌ "Humble" après une victoire (${humbleWin}) devrait construire plus de cohésion que "Agressif" (${aggroWin}).`);
  }
  if (aggroLoss >= 0) throw new Error(`❌ "Agressif" après une défaite devrait coûter de l'alchimie (obtenu ${aggroLoss}).`);
  console.log(`✅ Le ton du coach influence bien l'alchimie : Humble/défaite=${humbleLoss}, Agressif/défaite=${aggroLoss}, Humble/victoire=${humbleWin}, Agressif/victoire=${aggroWin}.`);
})();

// ---------------------------------------------------------------------
// 6) Levier 3 (tactique) : un changement de tactique entre deux matchs
//    coûte un malus PROPORTIONNEL à ce qui change réellement (retour
//    utilisateur, 2026-09 : "si je passe de pick and roll + pénétration +
//    transition à pick and roll + pénétration + jeu intérieur, je perds
//    combien d'alchimie ?" — 1 seule priorité sur 3 changée ne doit PAS
//    coûter autant qu'un changement complet) ; rejouer la MÊME tactique ne
//    coûte rien.
// ---------------------------------------------------------------------
(function testTacticsChangeImpact() {
  const home = generateStartingRoster("Home Tactics");
  generateLeague(home, 1, T0);
  home.chemistry = 60;

  // Premier match "réellement joué" : pose juste la référence, aucun malus
  // (pas de match précédent auquel se comparer).
  recordMatchStatsForTeam(home, 0, "championship", T0);
  if (home.chemistry !== 60) throw new Error("❌ Le tout premier match ne devrait donner aucun malus de tactique.");

  // Même tactique au match suivant : aucun malus.
  recordMatchStatsForTeam(home, 1, "championship", T0 + 1000);
  if (home.chemistry !== 60) throw new Error("❌ Rejouer la même tactique ne devrait donner aucun malus.");

  // Change la défense seule : malus = CHEMISTRY_TACTICS_DEFENSE_PENALTY.
  home.defense = home.defense === "Homme à homme" ? "Zone extérieure" : "Homme à homme";
  recordMatchStatsForTeam(home, 2, "championship", T0 + 2000);
  if (home.chemistry !== 60 - CHEMISTRY_TACTICS_DEFENSE_PENALTY) {
    throw new Error(`❌ Changer de défense devrait coûter exactement CHEMISTRY_TACTICS_DEFENSE_PENALTY (${CHEMISTRY_TACTICS_DEFENSE_PENALTY}), obtenu ${60 - home.chemistry}.`);
  }
  console.log(`✅ Changer de défense seule coûte exactement -${CHEMISTRY_TACTICS_DEFENSE_PENALTY}, rejouer la même tactique ne coûte rien, aucun malus au tout premier match.`);
})();

// ---------------------------------------------------------------------
// 6bis) Le malus offensif est PROPORTIONNEL au nombre de priorités qui
//       changent réellement, pas un tout-ou-rien (retour utilisateur,
//       2026-09 : "si je passe de pick and roll + pénétration + transition
//       à pick and roll + pénétration + jeu intérieur, je perds combien
//       d'alchimie ?" — 1 seule priorité sur 3 changée ne doit PAS coûter
//       autant qu'un changement complet). Chaque scénario repart d'une
//       équipe fraîche pour mesurer un delta isolé, propre, sans effet de
//       bord d'un scénario sur l'autre (le premier match "réellement joué"
//       après un changement pose lui-même une nouvelle référence).
// ---------------------------------------------------------------------
(function testTacticsOffensePriorityIsProportional() {
  function chemistryDeltaForOffenseChange(newPriorities) {
    const team = generateStartingRoster("Proportional Tactics");
    generateLeague(team, 1, T0);
    team.chemistry = 60;
    // Pose la référence (3 priorités par défaut du constructeur, voir
    // Team.constructor) : aucun malus sur ce tout premier match.
    recordMatchStatsForTeam(team, 0, "championship", T0);
    const before = team.chemistry;
    team.offensivePriorities = newPriorities;
    recordMatchStatsForTeam(team, 1, "championship", T0 + 1000);
    return before - team.chemistry;
  }

  // Priorités par défaut (Team.constructor) : ["Équilibrée", "Pick & Roll", "Jeu en mouvement"].
  const oneChanged = chemistryDeltaForOffenseChange(["Équilibrée", "Pick & Roll", "Jeu intérieur"]);
  if (oneChanged !== CHEMISTRY_TACTICS_OFFENSE_PENALTY) {
    throw new Error(`❌ Changer 1 priorité offensive sur 3 devrait coûter exactement CHEMISTRY_TACTICS_OFFENSE_PENALTY (${CHEMISTRY_TACTICS_OFFENSE_PENALTY}), obtenu ${oneChanged}.`);
  }

  const twoChanged = chemistryDeltaForOffenseChange(["Équilibrée", "Jeu intérieur", "Contre-attaque"]);
  if (twoChanged !== 2 * CHEMISTRY_TACTICS_OFFENSE_PENALTY) {
    throw new Error(`❌ Changer 2 priorités offensives sur 3 devrait coûter 2× CHEMISTRY_TACTICS_OFFENSE_PENALTY (${2 * CHEMISTRY_TACTICS_OFFENSE_PENALTY}), obtenu ${twoChanged}.`);
  }

  const threeChanged = chemistryDeltaForOffenseChange(["Jeu intérieur", "Contre-attaque", "Poste bas"]);
  if (threeChanged !== 3 * CHEMISTRY_TACTICS_OFFENSE_PENALTY) {
    throw new Error(`❌ Changer les 3 priorités offensives devrait coûter 3× CHEMISTRY_TACTICS_OFFENSE_PENALTY (${3 * CHEMISTRY_TACTICS_OFFENSE_PENALTY}), obtenu ${threeChanged}.`);
  }
  if (!(twoChanged > oneChanged && threeChanged > twoChanged)) {
    throw new Error(`❌ Le malus devrait croître strictement avec le nombre de priorités changées (1=${oneChanged}, 2=${twoChanged}, 3=${threeChanged}).`);
  }

  // Permuter l'ORDRE des 3 mêmes priorités par défaut : aucun malus
  // (comparaison en ENSEMBLE, pas en ordre).
  const reordered = chemistryDeltaForOffenseChange(["Jeu en mouvement", "Équilibrée", "Pick & Roll"]);
  if (reordered !== 0) {
    throw new Error(`❌ Permuter l'ordre des mêmes 3 priorités ne devrait donner aucun malus, obtenu -${reordered}.`);
  }

  console.log(`✅ Le malus offensif est proportionnel au nombre de priorités changées : 1=-${oneChanged}, 2=-${twoChanged}, 3=-${threeChanged}, réordonner les mêmes=0.`);
})();

// ---------------------------------------------------------------------
// 6ter) Tout change à la fois (3 priorités + défense + rythme) : le malus
//       cumule les 3 catégories plutôt que de plafonner à une seule.
// ---------------------------------------------------------------------
(function testTacticsFullChangeStacks() {
  const home = generateStartingRoster("Home Full Tactics Change");
  generateLeague(home, 1, T0);
  home.chemistry = 60;
  recordMatchStatsForTeam(home, 0, "championship", T0);
  const before = home.chemistry;

  home.offensivePriorities = ["Contre-attaque", "Poste bas", "Écrans multiples"];
  home.defense = home.defense === "Homme à homme" ? "Zone extérieure" : "Homme à homme";
  home.rhythm = home.rhythm === "Rapide" ? "Lent" : "Rapide";
  recordMatchStatsForTeam(home, 1, "championship", T0 + 1000);

  const fullChangePenalty = 3 * CHEMISTRY_TACTICS_OFFENSE_PENALTY + CHEMISTRY_TACTICS_DEFENSE_PENALTY + CHEMISTRY_TACTICS_RHYTHM_PENALTY;
  if (before - home.chemistry !== fullChangePenalty) {
    throw new Error(`❌ Tout changer d'un coup devrait coûter le cumul des 3 catégories (-${fullChangePenalty}), obtenu -${before - home.chemistry}.`);
  }
  console.log(`✅ Changer attaque + défense + rythme en même temps cumule les 3 malus (-${fullChangePenalty} au total).`);
})();

// ---------------------------------------------------------------------
// 6quater) Entraînement collectif "tactique" (retour utilisateur, 2026-09,
//       puis "il faut effectivement choisir ce qui est bossé comme
//       tactique [...] un seul aspect et pas tous les aspects", puis "tu
//       divises à chaque fois par 2 le malus [...] par jour d'entrainement
//       sur la tactique") : UN SEUL aspect précis ({ category, value }),
//       atténué CATÉGORIE PAR CATÉGORIE, et d'autant plus fort qu'il a été
//       travaillé de jours de repos banqués depuis le dernier match (voir
//       Team.syncCollectiveTrainingLog/daysTrainedForTarget).
// ---------------------------------------------------------------------
const ONE_DAY = 24 * 60 * 60 * 1000;

(function testCollectiveTrainingNoMitigationWithoutBankedDays() {
  const home = generateStartingRoster("Collective Tactics No Banked Days");
  generateLeague(home, 1, T0);
  home.chemistry = 60;
  home.defense = "Homme à homme";
  recordMatchStatsForTeam(home, 0, "championship", T0);

  // Choisi le jour même du match suivant, sans le moindre jour de repos
  // banqué au préalable (aucun appel à syncCollectiveTrainingLog entre les
  // deux matchs) : aucune atténuation, plein tarif.
  home.collectiveTraining = "tactique";
  home.trainedTactics = { category: "defense", value: "Zone extérieure" };
  home.defense = "Zone extérieure";
  recordMatchStatsForTeam(home, 1, "championship", T0 + 1000);

  if (home.chemistry !== 60 - CHEMISTRY_TACTICS_DEFENSE_PENALTY) {
    throw new Error(`❌ Sans le moindre jour de repos banqué, le malus devrait rester plein tarif (-${CHEMISTRY_TACTICS_DEFENSE_PENALTY}), obtenu ${60 - home.chemistry}.`);
  }
  console.log(`✅ trainedTactics choisi le jour même du match (0 jour banqué) : malus plein tarif (-${CHEMISTRY_TACTICS_DEFENSE_PENALTY}), pas encore d'atténuation.`);
})();

(function testCollectiveTrainingCompoundsPerBankedDay() {
  const home = generateStartingRoster("Collective Tactics Compounding");
  generateLeague(home, 1, T0);
  home.chemistry = 60;
  home.defense = "Homme à homme";
  recordMatchStatsForTeam(home, 0, "championship", T0); // "mardi"

  home.collectiveTraining = "tactique";
  home.trainedTactics = { category: "defense", value: "Zone extérieure" };
  // 3 jours de repos ("mercredi/jeudi/vendredi"), même choix chaque jour.
  home.syncCollectiveTrainingLog(T0 + 1 * ONE_DAY);
  home.syncCollectiveTrainingLog(T0 + 2 * ONE_DAY);
  home.syncCollectiveTrainingLog(T0 + 3 * ONE_DAY);

  home.defense = "Zone extérieure";
  recordMatchStatsForTeam(home, 1, "championship", T0 + 4 * ONE_DAY); // "samedi"

  const expectedPenalty = CHEMISTRY_TACTICS_DEFENSE_PENALTY * Math.pow(CHEMISTRY_TACTICS_TRAINED_FACTOR, 3);
  if (Math.abs((60 - home.chemistry) - expectedPenalty) > 1e-9) {
    throw new Error(`❌ 3 jours de repos banqués sur la même tactique devraient diviser le malus par 2 trois fois de suite (-${expectedPenalty.toFixed(3)}), obtenu ${(60 - home.chemistry).toFixed(3)}.`);
  }
  console.log(`✅ 3 jours de repos consécutifs (mer/jeu/ven) sur la même tactique : malus divisé par 2 trois fois (-${expectedPenalty.toFixed(3)} au lieu de -${CHEMISTRY_TACTICS_DEFENSE_PENALTY}), comme un match mardi -> samedi.`);
})();

(function testCollectiveTrainingRecuperationDayDoesNotEraseBankedProgress() {
  const home = generateStartingRoster("Collective Tactics Recup Keeps Progress");
  generateLeague(home, 1, T0);
  home.chemistry = 60;
  home.defense = "Homme à homme";
  recordMatchStatsForTeam(home, 0, "championship", T0);

  home.collectiveTraining = "tactique";
  home.trainedTactics = { category: "defense", value: "Zone extérieure" };
  home.syncCollectiveTrainingLog(T0 + 1 * ONE_DAY); // "mercredi" : tactique
  home.syncCollectiveTrainingLog(T0 + 2 * ONE_DAY); // "jeudi" : tactique
  // "vendredi" : passe en récupération SANS toucher trainedTactics, ne doit
  // ni ajouter un 3e jour, ni effacer les 2 déjà banqués (retour
  // utilisateur : "on doit quand même avoir le malus divisé par deux du
  // mercredi et par deux encore une fois le jeudi").
  home.collectiveTraining = "recuperation";
  home.syncCollectiveTrainingLog(T0 + 3 * ONE_DAY);

  home.defense = "Zone extérieure";
  recordMatchStatsForTeam(home, 1, "championship", T0 + 4 * ONE_DAY); // "samedi"

  const expectedPenalty = CHEMISTRY_TACTICS_DEFENSE_PENALTY * Math.pow(CHEMISTRY_TACTICS_TRAINED_FACTOR, 2);
  if (Math.abs((60 - home.chemistry) - expectedPenalty) > 1e-9) {
    throw new Error(`❌ Un jour "récupération" intercalé ne devrait ni ajouter ni effacer de jours banqués (attendu -${expectedPenalty.toFixed(3)} pour 2 jours), obtenu -${(60 - home.chemistry).toFixed(3)}.`);
  }
  console.log(`✅ Jour "récupération" intercalé (vendredi) : les 2 jours déjà banqués (mercredi+jeudi) restent acquis, malus -${expectedPenalty.toFixed(3)} au lieu de -${CHEMISTRY_TACTICS_DEFENSE_PENALTY}.`);
})();

(function testCollectiveTrainingTacticsNoMitigationWhenMismatched() {
  const home = generateStartingRoster("Home Collective Tactics Mismatched");
  generateLeague(home, 1, T0);
  home.chemistry = 60;
  home.defense = "Homme à homme";
  recordMatchStatsForTeam(home, 0, "championship", T0);

  // On entraîne "Zone extérieure" (2 jours banqués), mais on joue en fait
  // une AUTRE défense en match : ça ne correspond pas à ce qui a été
  // travaillé, donc plein tarif malgré les jours banqués.
  home.collectiveTraining = "tactique";
  home.trainedTactics = { category: "defense", value: "Zone extérieure" };
  home.syncCollectiveTrainingLog(T0 + 1 * ONE_DAY);
  home.syncCollectiveTrainingLog(T0 + 2 * ONE_DAY);

  home.defense = "Zone intérieure";
  recordMatchStatsForTeam(home, 1, "championship", T0 + 3 * ONE_DAY);

  if (home.chemistry !== 60 - CHEMISTRY_TACTICS_DEFENSE_PENALTY) {
    throw new Error(`❌ Un changement de défense qui ne correspond PAS à trainedTactics devrait coûter le plein tarif (-${CHEMISTRY_TACTICS_DEFENSE_PENALTY}), obtenu ${60 - home.chemistry}.`);
  }
  console.log(`✅ Défense jouée différente de celle entraînée : malus plein tarif (-${CHEMISTRY_TACTICS_DEFENSE_PENALTY}), même avec des jours banqués sur une AUTRE défense.`);
})();

(function testCollectiveTrainingTacticsNoMitigationWhenUnset() {
  const home = generateStartingRoster("Home Collective Tactics Unset");
  generateLeague(home, 1, T0);
  home.chemistry = 60;
  home.defense = "Homme à homme";
  // trainedTactics resté `null` (cas par défaut avant toute sélection).

  recordMatchStatsForTeam(home, 0, "championship", T0);
  home.defense = "Zone extérieure";
  recordMatchStatsForTeam(home, 1, "championship", T0 + 1000);

  if (home.chemistry !== 60 - CHEMISTRY_TACTICS_DEFENSE_PENALTY) {
    throw new Error(`❌ Sans trainedTactics choisi, le malus devrait rester plein tarif (-${CHEMISTRY_TACTICS_DEFENSE_PENALTY}), obtenu ${60 - home.chemistry}.`);
  }
  console.log(`✅ Aucun trainedTactics choisi : aucune atténuation, malus plein tarif (-${CHEMISTRY_TACTICS_DEFENSE_PENALTY}).`);
})();

// ---------------------------------------------------------------------
// 6quinquies) Identité tactique établie (retour utilisateur, 2026-09 : "si
//       je joue toute la saison sur une tactique, je change pour un seul
//       match, et je reviens à ma tactique, j'ai un malus [...] ça ne
//       devrait pas être le cas") : revenir EXACTEMENT à la tactique
//       établie après un aller-retour d'UN match ne coûte rien, mais s'y
//       tenir 2 matchs de suite en fait la NOUVELLE identité établie (un
//       retour à l'ancienne coûte alors de nouveau).
// ---------------------------------------------------------------------
(function testEstablishedTacticsNoPenaltyOnReturnAfterOneOffDeviation() {
  const home = generateStartingRoster("Established Tactics Return");
  generateLeague(home, 1, T0);
  home.chemistry = 60;
  home.defense = "Homme à homme"; // tactique établie "toute la saison"
  recordMatchStatsForTeam(home, 0, "championship", T0);
  recordMatchStatsForTeam(home, 1, "championship", T0 + 1 * ONE_DAY); // rejouée, confirme l'identité
  const chemistryBeforeDeviation = home.chemistry;

  // Un seul match sur une autre défense (retour utilisateur : "je change
  // pour un seul match") : coûte normalement.
  home.defense = "Zone extérieure";
  recordMatchStatsForTeam(home, 2, "championship", T0 + 2 * ONE_DAY);
  if (home.chemistry !== chemistryBeforeDeviation - CHEMISTRY_TACTICS_DEFENSE_PENALTY) {
    throw new Error(`❌ Le changement d'un seul match devrait coûter le plein tarif (-${CHEMISTRY_TACTICS_DEFENSE_PENALTY}), obtenu ${chemistryBeforeDeviation - home.chemistry}.`);
  }
  const chemistryAfterDeviation = home.chemistry;

  // Retour à la tactique établie ("et je reviens à ma tactique") : aucun
  // malus, ce n'est pas un "nouveau" changement.
  home.defense = "Homme à homme";
  recordMatchStatsForTeam(home, 3, "championship", T0 + 3 * ONE_DAY);
  if (home.chemistry !== chemistryAfterDeviation) {
    throw new Error(`❌ Revenir à la tactique établie après UN seul match d'écart ne devrait coûter aucun malus (attendu ${chemistryAfterDeviation}, obtenu ${home.chemistry}).`);
  }
  console.log(`✅ Retour à la tactique établie après un aller-retour d'un match : aucun malus (chemistry inchangée à ${home.chemistry}).`);
})();

(function testEstablishedTacticsSolidifiesAfterTwoConsecutiveMatches() {
  const home = generateStartingRoster("Established Tactics Solidify");
  generateLeague(home, 1, T0);
  home.chemistry = 60;
  home.defense = "Homme à homme";
  recordMatchStatsForTeam(home, 0, "championship", T0);
  recordMatchStatsForTeam(home, 1, "championship", T0 + 1 * ONE_DAY);

  // Change de défense et s'y tient 2 matchs de suite : devient la NOUVELLE
  // identité établie.
  home.defense = "Zone extérieure";
  recordMatchStatsForTeam(home, 2, "championship", T0 + 2 * ONE_DAY); // coûte (1er match sur la nouvelle défense)
  recordMatchStatsForTeam(home, 3, "championship", T0 + 3 * ONE_DAY); // gratuit (rejoue la même chose)
  const chemistryAfterSolidifying = home.chemistry;

  // Revenir à l'ANCIENNE défense coûte maintenant de nouveau : "Zone
  // extérieure" est devenue l'identité établie, "Homme à homme" est
  // désormais l'écart.
  home.defense = "Homme à homme";
  recordMatchStatsForTeam(home, 4, "championship", T0 + 4 * ONE_DAY);
  if (home.chemistry !== chemistryAfterSolidifying - CHEMISTRY_TACTICS_DEFENSE_PENALTY) {
    throw new Error(`❌ Revenir à l'ANCIENNE tactique après 2 matchs sur la nouvelle devrait de nouveau coûter le plein tarif (-${CHEMISTRY_TACTICS_DEFENSE_PENALTY}), obtenu ${chemistryAfterSolidifying - home.chemistry}.`);
  }
  console.log(`✅ Une tactique jouée 2 matchs de suite devient la nouvelle identité établie : y revenir après coup coûte de nouveau (-${CHEMISTRY_TACTICS_DEFENSE_PENALTY}).`);
})();

// ---------------------------------------------------------------------
// 7) L'alchimie a un effet réel et MODESTE sur la performance en match
//    (Player.eff()), via Team.resetForMatch/chemistryFactor.
// ---------------------------------------------------------------------
(function testChemistryAffectsPerformance() {
  const team = generateStartingRoster("Perf Test");
  generateLeague(team, 1, T0);
  const p = team.players[0];
  p.form = 70; p.fatigue = 0; p.condition = 100; p.pendingMatchBoost = 0;

  team.chemistry = 100;
  team.resetForMatch(T0);
  const effGreat = p.eff("midRange");

  team.chemistry = 0;
  team.resetForMatch(T0);
  const effTerrible = p.eff("midRange");

  if (!(effGreat > effTerrible)) {
    throw new Error(`❌ Une meilleure alchimie devrait donner une meilleure performance (chemistry=100 -> ${effGreat}, chemistry=0 -> ${effTerrible}).`);
  }
  const ratio = effTerrible / effGreat;
  // 0.94 / 1.06 attendu (voir chemistryFactor), effet volontairement modeste.
  if (ratio < 0.80 || ratio > 0.95) {
    throw new Error(`❌ L'effet de l'alchimie devrait être modeste (ratio attendu ~0.89, obtenu ${ratio.toFixed(2)}).`);
  }
  console.log(`✅ L'alchimie a un effet réel mais modeste sur eff() (chemistry=100 -> ${effGreat.toFixed(1)}, chemistry=0 -> ${effTerrible.toFixed(1)}, ratio=${ratio.toFixed(2)}).`);
})();

// ---------------------------------------------------------------------
// 8) Intégration bout en bout : MatchEngine.simulate() pose bien
//    matchChemistryFactor sur tous les joueurs, sans planter.
// ---------------------------------------------------------------------
(function testMatchEngineIntegration() {
  const home = generateStartingRoster("Home MC Test");
  const away = generateStartingRoster("Away MC Test");
  home.chemistry = 85;
  away.chemistry = 20;
  const result = new MatchEngine(home, away).simulate(T0);
  if (!result || !result.finalScore) throw new Error("❌ MatchEngine.simulate() devrait renvoyer un résultat normal.");
  [...home.players, ...away.players].forEach(p => {
    if (typeof p.matchChemistryFactor !== "number") {
      throw new Error("❌ Tous les joueurs devraient avoir un matchChemistryFactor posé après simulate().");
    }
  });
  console.log("✅ MatchEngine.simulate() pose bien matchChemistryFactor sur tous les joueurs des deux équipes, sans régression.");
})();

// ---------------------------------------------------------------------
// 9) États affichés (chemistryLabel) et bornes [0, 100] toujours respectées.
// ---------------------------------------------------------------------
(function testChemistryLabelAndClamp() {
  const team = generateStartingRoster("Clamp Test");
  team.chemistry = 100;
  team.applyChemistryDelta(50); // ne doit jamais dépasser 100
  if (team.chemistry !== 100) throw new Error("❌ chemistry ne devrait jamais dépasser 100.");
  team.applyChemistryDelta(-500); // ne doit jamais descendre sous 0
  if (team.chemistry !== 0) throw new Error("❌ chemistry ne devrait jamais descendre sous 0.");

  if (chemistryLabel(90) !== "Alchimie parfaite") throw new Error("❌ Libellé attendu pour 90 : Alchimie parfaite.");
  if (chemistryLabel(10) !== "Vestiaire fracturé") throw new Error("❌ Libellé attendu pour 10 : Vestiaire fracturé.");
  console.log("✅ Team.chemistry reste toujours borné à [0, 100], et chemistryLabel renvoie les bons états.");
})();

// ---------------------------------------------------------------------
// 10) Round-trip serializeTeam/teamFromSave : chemistry et l'instantané
//     tactique de référence doivent survivre à l'identique.
// ---------------------------------------------------------------------
(function testSerializationRoundTrip() {
  const team = generateStartingRoster("Roundtrip Chemistry");
  generateLeague(team, 1, T0);
  team.chemistry = 37;
  team.lastTacticsSnapshotForChemistry = { offense: ["Jeu en pénétration"], defense: "Zone press", rhythm: "Rapide" };
  team.establishedTacticsSnapshot = { offense: ["Jeu en pénétration"], defense: "Zone press", rhythm: "Lent" };
  team.collectiveTraining = "tactique";
  team.trainedTactics = { category: "defense", value: "Zone extérieure" };
  team.syncCollectiveTrainingLog(T0);
  team.syncCollectiveTrainingLog(T0 + ONE_DAY);
  team.tacticsCycleStartDayIndex = T0 - ONE_DAY;

  const saved = serializeTeam(team);
  if (saved.chemistry !== 37) throw new Error("❌ serializeTeam devrait persister chemistry.");
  if (!saved.lastTacticsSnapshotForChemistry || saved.lastTacticsSnapshotForChemistry.defense !== "Zone press") {
    throw new Error("❌ serializeTeam devrait persister lastTacticsSnapshotForChemistry.");
  }
  if (!saved.establishedTacticsSnapshot || saved.establishedTacticsSnapshot.rhythm !== "Lent") {
    throw new Error("❌ serializeTeam devrait persister establishedTacticsSnapshot.");
  }
  if (!saved.trainedTactics || saved.trainedTactics.category !== "defense" || saved.trainedTactics.value !== "Zone extérieure") {
    throw new Error("❌ serializeTeam devrait persister trainedTactics (nouveau format { category, value }).");
  }
  if (!Array.isArray(saved.collectiveTrainingLog) || saved.collectiveTrainingLog.length !== 2) {
    throw new Error(`❌ serializeTeam devrait persister collectiveTrainingLog (2 entrées attendues, ${saved.collectiveTrainingLog && saved.collectiveTrainingLog.length} obtenues).`);
  }
  if (saved.tacticsCycleStartDayIndex !== T0 - ONE_DAY) {
    throw new Error("❌ serializeTeam devrait persister tacticsCycleStartDayIndex.");
  }

  const reloaded = teamFromSave(saved);
  if (reloaded.chemistry !== 37) throw new Error("❌ teamFromSave devrait restaurer chemistry.");
  if (!reloaded.lastTacticsSnapshotForChemistry || reloaded.lastTacticsSnapshotForChemistry.rhythm !== "Rapide") {
    throw new Error("❌ teamFromSave devrait restaurer lastTacticsSnapshotForChemistry.");
  }
  if (!reloaded.establishedTacticsSnapshot || reloaded.establishedTacticsSnapshot.rhythm !== "Lent") {
    throw new Error("❌ teamFromSave devrait restaurer establishedTacticsSnapshot.");
  }
  if (!reloaded.trainedTactics || reloaded.trainedTactics.category !== "defense" || reloaded.trainedTactics.value !== "Zone extérieure") {
    throw new Error("❌ teamFromSave devrait restaurer trainedTactics.");
  }
  if (!Array.isArray(reloaded.collectiveTrainingLog) || reloaded.collectiveTrainingLog.length !== 2) {
    throw new Error("❌ teamFromSave devrait restaurer collectiveTrainingLog.");
  }
  if (reloaded.tacticsCycleStartDayIndex !== T0 - ONE_DAY) {
    throw new Error("❌ teamFromSave devrait restaurer tacticsCycleStartDayIndex.");
  }
  console.log("✅ chemistry/lastTacticsSnapshotForChemistry/establishedTacticsSnapshot/trainedTactics/collectiveTrainingLog/tacticsCycleStartDayIndex survivent à l'identique à un round-trip serializeTeam/teamFromSave.");
})();

// ---------------------------------------------------------------------
// 11) Sauvegarde ancienne (avant cette fonctionnalité) : chemistry absent
//     des données -> on garde la valeur neutre par défaut (50), jamais une
//     erreur, et aucun malus de tactique au match suivant.
// ---------------------------------------------------------------------
(function testBackwardCompatibilityOldSave() {
  const team = generateStartingRoster("Old Save Chemistry");
  generateLeague(team, 1, T0);
  const saved = serializeTeam(team);
  delete saved.chemistry;
  delete saved.lastTacticsSnapshotForChemistry;

  const reloaded = teamFromSave(saved);
  if (typeof reloaded.chemistry !== "number" || reloaded.chemistry < 0 || reloaded.chemistry > 100) {
    throw new Error("❌ Une sauvegarde sans chemistry devrait garder une valeur par défaut valide (constructeur, 50).");
  }
  if (reloaded.lastTacticsSnapshotForChemistry !== null) {
    throw new Error("❌ Une sauvegarde sans instantané tactique devrait garder null (constructeur).");
  }
  recordMatchStatsForTeam(reloaded, 0, "championship", T0);
  if (reloaded.chemistry !== 50) {
    throw new Error("❌ Le premier match après une sauvegarde ancienne ne devrait donner aucun malus de tactique.");
  }
  console.log("✅ Une sauvegarde antérieure à cette fonctionnalité (chemistry absent) se recharge sans erreur, avec des valeurs par défaut valides.");
})();

console.log("\n✅ Tous les tests d'alchimie d'équipe (Team.chemistry) sont passés.");
