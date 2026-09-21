// Vérifie l'objectif de saison du conseil d'administration (retour
// utilisateur, 2026-09) : "En début de saison, le conseil d'administration
// doit donner un objectif de classement (maintien, milieu de tableau, PO,
// finale, titre). [...] Si l'objectif n'est pas respecté pendant la saison,
// cela impact l'humeur des supporters. Une équipe qui est dernière alors
// qu'elle devait jouer la finale, doit voir ses supporters mécontents.
// L'objectif du CA doit être posé sur base du niveau des différentes
// équipes du championnat."
//
// Voir engine.js : le grand commentaire au-dessus de SEASON_OBJECTIVE_TIERS,
// assignSeasonObjectives (appelée par buildLeagueWithHumanTeams),
// seasonAchievementTier et seasonObjectiveVerdict.
//
// Test purement moteur (pas de serveur HTTP ni de DOM, comme
// transfer_request_test.js) : plus rapide, se concentre sur la logique.
const E = require("./engine.js");
const {
  generateTeam, generateLeague, simulateOrForfeit, serializeTeam, teamFromSave,
  SEASON_OBJECTIVE_TIERS, SEASON_OBJECTIVE_MISS_MALUS_PER_TIER,
  SEASON_OBJECTIVE_EXCEED_BONUS_PER_TIER, SEASON_OBJECTIVE_MET_BONUS,
  assignSeasonObjectives, seasonAchievementTier, seasonObjectiveVerdict,
} = E;

function freshLeague() {
  const user = generateTeam("User", 1.0);
  return generateLeague(user, 1);
}

// Joue toute la saison régulière + barrage + play-offs jusqu'au champion
// (voir milestone_interview_and_mvp_test.js pour le même patron
// `league.round = league.totalRounds`, nécessaire pour que
// isRegularSeasonDone() considère la saison régulière terminée).
function playFullSeason(lg) {
  for (let r = 0; r < lg.totalRounds; r++) {
    lg.matchesForRound(r).forEach(m => {
      const res = simulateOrForfeit(lg.teams[m.home], lg.teams[m.away]);
      lg.recordResult(r, m.home, m.away, res.scoreHome, res.scoreAway);
    });
  }
  lg.round = lg.totalRounds;
  lg.runRelegationBarrage();
  lg.runPlayoffsInstantly();
}

// ---------------------------------------------------------------------
// 1) assignSeasonObjectives : exactement 2 équipes par palier, les plus
//    fortes (Team.averageOverall) reçoivent les objectifs les plus
//    ambitieux.
// ---------------------------------------------------------------------
(function testAssignSeasonObjectivesRanksByStrength() {
  const lg = freshLeague();
  const counts = {};
  lg.teams.forEach(t => {
    if (!t.seasonObjective) throw new Error(`❌ Chaque équipe devrait avoir un objectif assigné (obtenu ${t.seasonObjective} pour ${t.name}).`);
    counts[t.seasonObjective] = (counts[t.seasonObjective] || 0) + 1;
  });
  ["maintien", "milieu-tableau", "playoffs", "finale", "titre"].forEach(key => {
    if (counts[key] !== 2) throw new Error(`❌ Le palier "${key}" devrait contenir exactement 2 équipes (obtenu ${counts[key] || 0}).`);
  });

  const ranked = lg.teams.map(t => ({ name: t.name, avg: t.averageOverall(), objective: t.seasonObjective }))
    .sort((a, b) => b.avg - a.avg);
  // Les 2 premières (les plus fortes) doivent viser le titre, les 2
  // dernières (les plus faibles) doivent viser le maintien.
  if (ranked[0].objective !== "titre" || ranked[1].objective !== "titre") {
    throw new Error(`❌ Les 2 équipes les plus fortes devraient viser le titre (obtenu ${JSON.stringify(ranked.slice(0, 2))}).`);
  }
  if (ranked[8].objective !== "maintien" || ranked[9].objective !== "maintien") {
    throw new Error(`❌ Les 2 équipes les plus faibles devraient viser le maintien (obtenu ${JSON.stringify(ranked.slice(8, 10))}).`);
  }
  // Objectifs strictement décroissants (ou égaux) le long du classement de force.
  for (let i = 0; i < ranked.length - 1; i++) {
    if (SEASON_OBJECTIVE_TIERS[ranked[i].objective] < SEASON_OBJECTIVE_TIERS[ranked[i + 1].objective]) {
      throw new Error(`❌ L'objectif devrait décroître (ou rester égal) avec la force de l'équipe : ${JSON.stringify(ranked)}`);
    }
  }
  console.log("✅ assignSeasonObjectives classe les 10 équipes par force (2 par palier), les plus fortes visant le titre, les plus faibles le maintien.");
})();

// ---------------------------------------------------------------------
// 2) generateLeague appelle bien assignSeasonObjectives (intégration) :
//    déjà couvert ci-dessus indirectement, mais vérifie explicitement que
//    l'équipe DU JOUEUR (index 0, humaine) reçoit elle aussi un objectif,
//    pas seulement les adversaires CPU.
// ---------------------------------------------------------------------
(function testUserTeamGetsObjectiveToo() {
  const lg = freshLeague();
  if (!lg.teams[0].seasonObjective) throw new Error("❌ L'équipe du joueur (index 0) devrait recevoir un objectif comme les autres.");
  console.log(`✅ L'équipe du joueur reçoit elle aussi un objectif de saison (${lg.teams[0].seasonObjective}).`);
})();

// ---------------------------------------------------------------------
// 3) seasonAchievementTier renvoie null tant que la saison n'est pas
//    ENTIÈREMENT terminée (pas encore de play-offs, ou champion pas encore
//    connu).
// ---------------------------------------------------------------------
(function testAchievementTierNullBeforeSeasonEnd() {
  const lg = freshLeague();
  if (seasonAchievementTier(lg, 0) !== null) throw new Error("❌ Devrait renvoyer null avant même le moindre match joué.");
  for (let r = 0; r < lg.totalRounds; r++) {
    lg.matchesForRound(r).forEach(m => {
      const res = simulateOrForfeit(lg.teams[m.home], lg.teams[m.away]);
      lg.recordResult(r, m.home, m.away, res.scoreHome, res.scoreAway);
    });
  }
  lg.round = lg.totalRounds;
  lg.runRelegationBarrage();
  lg.startPlayoffsIfNeeded();
  // Retour utilisateur (2026-09, ultérieur) : "il ne faut pas qu'un signal
  // et pas deux [...] la fin de la saison régulière correspond à la fin de
  // la saison pour ces équipes là" : SEULE une équipe dont le sort dépend
  // encore des play-offs (une des 4 têtes de série ci-dessous, rang 1-4) ou
  // du barrage (rang 7-8) reste `null` à ce stade désormais, contrairement à
  // une équipe de rang 5-6/9-10, dont le palier est maintenant définitif dès
  // la fin de la saison régulière (voir
  // season_objective_locked_at_endreg_test.js pour la couverture dédiée de
  // ce cas). On vérifie donc ici sur une équipe GARANTIE encore en lice
  // (tête de série de play-offs), pas nécessairement l'équipe idx0 du
  // joueur (dont le rang final, ici imprévisible, peut tomber dans l'un ou
  // l'autre cas).
  const stillUndecided = lg.playoffs.seeds[0];
  if (seasonAchievementTier(lg, stillUndecided) !== null) {
    throw new Error(`❌ Une équipe encore en lice pour les play-offs (idx ${stillUndecided}) devrait rester null tant que le champion n'est pas connu.`);
  }
  console.log("✅ seasonAchievementTier renvoie null pour une équipe encore en lice pour les play-offs, tant qu'ils ne sont pas terminés.");
})();

// ---------------------------------------------------------------------
// 4) seasonAchievementTier : les 5 issues possibles, sur une saison
//    complète simulée.
// ---------------------------------------------------------------------
(function testAchievementTierAllOutcomes() {
  const lg = freshLeague();
  playFullSeason(lg);

  const champion = lg.playoffs.champion;
  if (seasonAchievementTier(lg, champion) !== 5) throw new Error(`❌ Le champion (idx ${champion}) devrait avoir un palier atteint de 5.`);

  const finalLoser = lg.playoffs.finalSeries.idxA === champion ? lg.playoffs.finalSeries.idxB : lg.playoffs.finalSeries.idxA;
  if (seasonAchievementTier(lg, finalLoser) !== 4) throw new Error(`❌ Le finaliste battu (idx ${finalLoser}) devrait avoir un palier atteint de 4.`);

  lg.playoffs.series.forEach(series => {
    const semiLoser = series.winner === series.idxA ? series.idxB : series.idxA;
    if (seasonAchievementTier(lg, semiLoser) !== 3) throw new Error(`❌ Un éliminé en demi-finale (idx ${semiLoser}) devrait avoir un palier atteint de 3.`);
  });

  const relegated = lg.relegatedTeamIndexes();
  relegated.forEach(idx => {
    if (seasonAchievementTier(lg, idx) !== 0) throw new Error(`❌ Une équipe reléguée (idx ${idx}) devrait avoir un palier atteint de 0, quel que soit son classement par ailleurs.`);
  });

  // Une équipe ni en play-offs, ni reléguée : palier 1 (rang 7-8, a donc
  // nécessairement survécu au barrage) ou 2 (rang 5-6).
  const playoffIdxs = new Set([...lg.playoffs.series.flatMap(s => [s.idxA, s.idxB])]);
  const table = lg.standings();
  table.forEach((row, i) => {
    const rank = i + 1;
    if (playoffIdxs.has(row.idx) || relegated.includes(row.idx)) return;
    const tier = seasonAchievementTier(lg, row.idx);
    const expected = rank <= 6 ? 2 : 1;
    if (tier !== expected) throw new Error(`❌ Rang ${rank} (idx ${row.idx}), ni play-offs ni relégué, devrait avoir un palier atteint de ${expected} (obtenu ${tier}).`);
  });
  console.log("✅ seasonAchievementTier couvre correctement les 5 issues possibles (relégation, maintien de justesse, milieu de tableau, demi-finale, finale, titre) sur une saison complète.");
})();

// ---------------------------------------------------------------------
// 5) seasonObjectiveVerdict : le scénario exact donné par l'utilisateur,
//    "une équipe qui est dernière alors qu'elle devait jouer la finale,
//    doit voir ses supporters mécontents" : gros écart, gros malus.
// ---------------------------------------------------------------------
(function testUserGivenScenarioLastPlaceExpectedFinal() {
  const lg = freshLeague();
  playFullSeason(lg);
  const relegated = lg.relegatedTeamIndexes();
  if (!relegated.length) throw new Error("❌ (setup) au moins une équipe devrait être reléguée sur une saison complète.");
  const teamIdx = relegated[0];
  lg.teams[teamIdx].seasonObjective = "finale"; // on impose le scénario, quel que soit son objectif réel tiré au sort

  const verdict = seasonObjectiveVerdict(lg, teamIdx);
  if (!verdict) throw new Error("❌ (setup) le verdict devrait être calculable, la saison est terminée.");
  if (verdict.gap <= 0 || verdict.delta >= 0) {
    throw new Error(`❌ Une équipe reléguée dont l'objectif était la finale devrait subir un GROS malus (obtenu gap=${verdict.gap}, delta=${verdict.delta}).`);
  }
  // Écart maximal possible sur l'échelle (finale=4, relégué=0) : gap=4,
  // donc le plus gros malus que ce barème puisse produire pour cet
  // objectif précis.
  if (verdict.gap !== 4 || verdict.delta !== -4 * SEASON_OBJECTIVE_MISS_MALUS_PER_TIER) {
    throw new Error(`❌ gap/delta inattendus pour ce scénario (obtenu gap=${verdict.gap}, delta=${verdict.delta}, attendu gap=4, delta=${-4 * SEASON_OBJECTIVE_MISS_MALUS_PER_TIER}).`);
  }
  console.log(`✅ Scénario donné par l'utilisateur vérifié : une équipe dernière (reléguée) dont l'objectif était la finale subit un gros malus d'humeur des supporters (${verdict.delta}). Message : "${verdict.label}"`);
})();

// ---------------------------------------------------------------------
// 6) seasonObjectiveVerdict : objectif exactement atteint (petit bonus),
//    objectif manqué (malus proportionnel à l'écart), objectif largement
//    dépassé (gros bonus).
// ---------------------------------------------------------------------
(function testVerdictGapToDeltaFormula() {
  const lg = freshLeague();
  playFullSeason(lg);
  const champion = lg.playoffs.champion;

  // Champion : objectif "titre" -> exactement atteint (gap=0).
  lg.teams[champion].seasonObjective = "titre";
  const metVerdict = seasonObjectiveVerdict(lg, champion);
  if (metVerdict.gap !== 0 || metVerdict.delta !== SEASON_OBJECTIVE_MET_BONUS) {
    throw new Error(`❌ Champion visant le titre : objectif exactement atteint, delta attendu ${SEASON_OBJECTIVE_MET_BONUS} (obtenu gap=${metVerdict.gap}, delta=${metVerdict.delta}).`);
  }

  // Champion : objectif "maintien" -> largement dépassé (gap=1-5=-4).
  lg.teams[champion].seasonObjective = "maintien";
  const exceedVerdict = seasonObjectiveVerdict(lg, champion);
  const expectedExceedDelta = SEASON_OBJECTIVE_MET_BONUS + SEASON_OBJECTIVE_EXCEED_BONUS_PER_TIER * 4;
  if (exceedVerdict.gap !== -4 || exceedVerdict.delta !== expectedExceedDelta) {
    throw new Error(`❌ Champion visant seulement le maintien : gros bonus attendu (obtenu gap=${exceedVerdict.gap}, delta=${exceedVerdict.delta}, attendu delta=${expectedExceedDelta}).`);
  }
  if (exceedVerdict.delta <= metVerdict.delta) {
    throw new Error("❌ Dépasser largement l'objectif devrait rapporter plus que l'atteindre pile.");
  }
  console.log(`✅ Formule gap→delta vérifiée : objectif exactement atteint = +${metVerdict.delta}, objectif largement dépassé = +${exceedVerdict.delta}.`);
})();

// ---------------------------------------------------------------------
// 7) seasonObjectiveVerdict renvoie null si l'équipe n'a pas d'objectif, ou
//    si la saison n'est pas terminée.
// ---------------------------------------------------------------------
(function testVerdictNullGuards() {
  const lg = freshLeague();
  lg.teams[0].seasonObjective = null;
  playFullSeason(lg);
  if (seasonObjectiveVerdict(lg, 0) !== null) throw new Error("❌ Devrait renvoyer null sans objectif assigné.");

  const lg2 = freshLeague(); // saison PAS terminée cette fois
  if (seasonObjectiveVerdict(lg2, 0) !== null) throw new Error("❌ Devrait renvoyer null tant que la saison n'est pas terminée, même avec un objectif assigné.");
  console.log("✅ seasonObjectiveVerdict renvoie null sans objectif assigné, ou tant que la saison n'est pas terminée.");
})();

// ---------------------------------------------------------------------
// 8) Sérialisation/désérialisation : seasonObjective survit à un
//    aller-retour, et une ancienne sauvegarde (sans ce champ) retombe sur
//    `null` (valeur par défaut du constructeur), jamais une exception.
// ---------------------------------------------------------------------
(function testSerializeDeserializeRoundTrip() {
  const lg = freshLeague();
  const team = lg.teams[0];
  team.seasonObjective = "playoffs";
  const saved = serializeTeam(team);
  if (saved.seasonObjective !== "playoffs") throw new Error(`❌ serializeTeam devrait conserver seasonObjective (obtenu ${saved.seasonObjective}).`);
  const restored = teamFromSave(saved);
  if (restored.seasonObjective !== "playoffs") throw new Error(`❌ teamFromSave devrait restaurer seasonObjective (obtenu ${restored.seasonObjective}).`);

  const oldSave = { ...saved };
  delete oldSave.seasonObjective;
  const restoredOld = teamFromSave(oldSave);
  if (restoredOld.seasonObjective !== null) throw new Error(`❌ Une sauvegarde sans ce champ devrait retomber sur null (obtenu ${restoredOld.seasonObjective}).`);
  console.log("✅ Sérialisation/désérialisation : seasonObjective survit à un aller-retour, une ancienne sauvegarde retombe sur null.");
})();

console.log("\nTous les tests d'objectif de saison du conseil d'administration sont passés.");
