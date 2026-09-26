// Vérifie le système d'"alchimie d'équipe" (retour utilisateur, 2026-09) :
//
// "l'alchimie du groupe elle doit avoir un impact positif ou négatif sur
// les perfomances d'équipe: elle peut être impactée:
//  - par le coach lors de ses interviews
//  - par les changements fréquents de joueurs (jamais une base de joueurs
//    fixes, donc il faut recreer du lien entre les joueurs), mais changer
//    un joueur majeur d'une équipe doit forcément avoir bcp plus d'impact
//    que de changer le 12 homme (qui doit être très faible)"
//
// Un troisième levier (changer trop souvent de tactique) a existé ici un
// temps, RETIRÉ depuis (retour utilisateur, 2026-09 : "sur la partie
// connaissance tactique, on va modifier un peu la chose. ajd ça impacte
// l'alchimie d'équipe. on va enlever ça et créer une jauge connaissance
// tactique qui impactera le niveau de l'équipe") au profit d'une jauge
// séparée, voir tactical_knowledge_test.js pour toute la mécanique de
// changement/entraînement de tactique — ce fichier-ci ne garde qu'un test
// de non-régression (section 6 ci-dessous) confirmant que changer de
// tactique ne touche plus JAMAIS Team.chemistry.
//
// Voir engine.js : le grand commentaire au-dessus de
// CHEMISTRY_ROSTER_CHANGE_MAX_RANK, Team.chemistry/chemistryFactor/
// applyChemistryDelta, chemistryRosterImportance/rosterRankOf,
// MILESTONE_INTERVIEW_TONES.chemistryWin/chemistryLoss,
// League._resolveListing/Team.sellPlayer (levier 2), Player.eff()/
// Team.resetForMatch (effet sur la performance).
//
// Test purement moteur (pas de serveur HTTP ni de DOM, comme
// server/actions_test.js) : plus rapide, se concentre sur la logique.
const E = require("./engine.js");
const {
  generateStartingRoster, generateLeague, generateMultiManagerLeague, serializeTeam, teamFromSave,
  chemistryRosterImportance, rosterRankOf, chemistryLabel,
  CHEMISTRY_ROSTER_CHANGE_MAX_RANK, CHEMISTRY_ROSTER_CHANGE_BASE,
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
// 6) Non-régression (retour utilisateur, 2026-09 : "on va enlever ça" à
//    propos de l'impact tactique sur l'alchimie) : changer de tactique,
//    même TOUT changer d'un coup (offense + défense + rythme), plusieurs
//    matchs de suite, ne doit plus JAMAIS faire bouger Team.chemistry —
//    voir tactical_knowledge_test.js pour vérifier que ça fait bien bouger
//    Team.tacticalKnowledge à la place.
// ---------------------------------------------------------------------
const ONE_DAY = 24 * 60 * 60 * 1000;

(function testTacticsChangeNoLongerAffectsChemistry() {
  const home = generateStartingRoster("Tactics No Longer Chemistry");
  generateLeague(home, 1, T0);
  home.chemistry = 60;
  // Le gain "matchs joués ensemble" (2026-09-26) est neutralisé ici : on ne
  // teste que l'absence d'effet des changements de TACTIQUE (le gain par
  // match a son propre test, chemistry_gain_test.js).
  home.updateChemistryAfterMatch = () => {};
  recordMatchStatsForTeam(home, 0, "championship", T0);
  if (home.chemistry !== 60) throw new Error("❌ Le tout premier match ne devrait donner aucun changement d'alchimie.");

  home.offensivePriorities = ["Contre-attaque", "Poste bas", "Écrans multiples"];
  home.defense = home.defense === "Homme à homme" ? "Zone extérieure" : "Homme à homme";
  home.rhythm = home.rhythm === "Rapide" ? "Lent" : "Rapide";
  recordMatchStatsForTeam(home, 1, "championship", T0 + 1 * ONE_DAY);
  if (home.chemistry !== 60) {
    throw new Error(`❌ Tout changer d'un coup (attaque+défense+rythme) ne devrait plus affecter l'alchimie, obtenu ${home.chemistry}.`);
  }

  // Encore un changement au match suivant, pour être sûr qu'aucun effet ne
  // se déclenche même en cumulant plusieurs changements successifs.
  home.defense = home.defense === "Homme à homme" ? "Zone extérieure" : "Homme à homme";
  recordMatchStatsForTeam(home, 2, "championship", T0 + 2 * ONE_DAY);
  if (home.chemistry !== 60) {
    throw new Error(`❌ Un second changement de tactique ne devrait toujours pas affecter l'alchimie, obtenu ${home.chemistry}.`);
  }
  console.log("✅ Changer de tactique (même tout à la fois, même plusieurs matchs de suite) n'affecte plus jamais Team.chemistry.");
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
// 10) Round-trip serializeTeam/teamFromSave : chemistry doit survivre à
//     l'identique (voir tactical_knowledge_test.js pour le round-trip de
//     tacticalKnowledge/tacticalKnowledgeStreaks/trainedTactics/
//     collectiveTrainingLog/tacticsCycleStartDayIndex).
// ---------------------------------------------------------------------
(function testSerializationRoundTrip() {
  const team = generateStartingRoster("Roundtrip Chemistry");
  generateLeague(team, 1, T0);
  team.chemistry = 37;

  const saved = serializeTeam(team);
  if (saved.chemistry !== 37) throw new Error("❌ serializeTeam devrait persister chemistry.");

  const reloaded = teamFromSave(saved);
  if (reloaded.chemistry !== 37) throw new Error("❌ teamFromSave devrait restaurer chemistry.");
  console.log("✅ chemistry survit à l'identique à un round-trip serializeTeam/teamFromSave.");
})();

// ---------------------------------------------------------------------
// 11) Sauvegarde ancienne (avant cette fonctionnalité) : chemistry absent
//     des données -> on garde la valeur neutre par défaut (50), jamais une
//     erreur.
// ---------------------------------------------------------------------
(function testBackwardCompatibilityOldSave() {
  const team = generateStartingRoster("Old Save Chemistry");
  generateLeague(team, 1, T0);
  const saved = serializeTeam(team);
  delete saved.chemistry;

  const reloaded = teamFromSave(saved);
  if (typeof reloaded.chemistry !== "number" || reloaded.chemistry < 0 || reloaded.chemistry > 100) {
    throw new Error("❌ Une sauvegarde sans chemistry devrait garder une valeur par défaut valide (constructeur, 50).");
  }
  console.log("✅ Une sauvegarde antérieure à cette fonctionnalité (chemistry absent) se recharge sans erreur, avec des valeurs par défaut valides.");
})();

console.log("\n✅ Tous les tests d'alchimie d'équipe (Team.chemistry) sont passés.");
