// Vérifie le SIGNAL DE MI-SAISON de l'objectif du conseil d'administration
// (retour utilisateur, 2026-09, en complément de season_objective_test.js qui
// couvre le verdict de FIN de saison) : "Ajoute un signal à la mi saison
// ouais ça serait pas mal", en réponse direct à l'offre faite après la
// livraison du verdict final ("Si tu veux aussi un signal en cours de
// saison (par exemple à la mi-saison), dis-le-moi et je l'ajouterai.").
//
// Voir engine.js : le grand commentaire au-dessus de
// SEASON_OBJECTIVE_MIDSEASON_MISS_MALUS_PER_TIER,
// currentStandingsPaceObjective et seasonObjectiveMidSeasonSignal ; et
// server/liveMatch.js:finalizeRound pour le point d'application réel
// (automatique, à LA journée de mi-saison, pour chaque équipe humaine).
//
// Test purement moteur pour les fonctions pures (1-3), puis intégration
// via server/liveMatch.js:finalizeRound (4-6, même patron que
// server/liveMatch_test.js) pour vérifier le déclenchement réel en jeu.
const Engine = require("./engine.js");
const { finalizeRound } = require("./server/liveMatch.js");
const {
  generateTeam, generateLeague, midSeasonRound,
  SEASON_OBJECTIVE_TIERS, SEASON_OBJECTIVE_MISS_MALUS_PER_TIER, SEASON_OBJECTIVE_EXCEED_BONUS_PER_TIER,
  SEASON_OBJECTIVE_MET_BONUS,
  SEASON_OBJECTIVE_MIDSEASON_MISS_MALUS_PER_TIER, SEASON_OBJECTIVE_MIDSEASON_EXCEED_BONUS_PER_TIER,
  SEASON_OBJECTIVE_MIDSEASON_MET_BONUS,
  currentStandingsPaceObjective, seasonObjectiveMidSeasonSignal,
} = Engine;

function freshLeague() {
  const user = generateTeam("User", 1.0);
  return generateLeague(user, 1);
}

// Classement PROVISOIRE totalement déterministe (voir League.standings(),
// qui ne fait que trier `this.results` : aucun besoin de respecter le VRAI
// calendrier pour fabriquer un classement précis) : l'équipe idx i bat
// TOUTES les équipes d'idx supérieur, donc l'ordre du classement final
// reproduit exactement l'ordre des idx (idx 0 = rang 1, ..., idx 9 = rang 10).
function fabricateStrictStandingsOrder(lg) {
  for (let i = 0; i < lg.teams.length; i++) {
    for (let j = i + 1; j < lg.teams.length; j++) {
      lg.recordResult(0, i, j, 80, 60); // home (i, le mieux classé) bat away (j)
    }
  }
}

// ---------------------------------------------------------------------
// 1) currentStandingsPaceObjective : même découpage par tranches de 2 que
//    assignSeasonObjectives, appliqué cette fois au classement PROVISOIRE.
// ---------------------------------------------------------------------
(function testPaceObjectiveBucketing() {
  const lg = freshLeague();
  fabricateStrictStandingsOrder(lg);
  const expected = ["titre", "titre", "finale", "finale", "playoffs", "playoffs", "milieu-tableau", "milieu-tableau", "maintien", "maintien"];
  expected.forEach((key, idx) => {
    const got = currentStandingsPaceObjective(lg, idx);
    if (got !== key) throw new Error(`❌ idx ${idx} (rang ${idx + 1}) : palier attendu "${key}", obtenu "${got}".`);
  });
  console.log("✅ currentStandingsPaceObjective classe le classement provisoire par tranches de 2, comme assignSeasonObjectives.");
})();

// ---------------------------------------------------------------------
// 2) seasonObjectiveMidSeasonSignal : les 3 cas (en dessous, sur la bonne
//    voie, au-dessus), avec le barème MIDSEASON (plus modeste que le
//    barème de fin de saison, voir le point 3).
// ---------------------------------------------------------------------
(function testSignalGapToDeltaFormula() {
  const lg = freshLeague();
  fabricateStrictStandingsOrder(lg);

  // idx 9 : rang 10, palier provisoire "maintien". Objectif "titre" -> gap
  // maximal (5-1=4) : GROS malus.
  lg.teams[9].seasonObjective = "titre";
  const missSignal = seasonObjectiveMidSeasonSignal(lg, 9);
  if (missSignal.paceObjective !== "maintien") throw new Error(`❌ (setup) idx 9 devrait pointer pour "maintien" (obtenu ${missSignal.paceObjective}).`);
  if (missSignal.gap !== 4 || missSignal.delta !== -4 * SEASON_OBJECTIVE_MIDSEASON_MISS_MALUS_PER_TIER) {
    throw new Error(`❌ gap/delta inattendus (obtenu gap=${missSignal.gap}, delta=${missSignal.delta}, attendu gap=4, delta=${-4 * SEASON_OBJECTIVE_MIDSEASON_MISS_MALUS_PER_TIER}).`);
  }

  // idx 0 : rang 1, palier provisoire "titre". Objectif "titre" -> gap nul,
  // petit bonus "sur la bonne voie".
  lg.teams[0].seasonObjective = "titre";
  const metSignal = seasonObjectiveMidSeasonSignal(lg, 0);
  if (metSignal.gap !== 0 || metSignal.delta !== SEASON_OBJECTIVE_MIDSEASON_MET_BONUS) {
    throw new Error(`❌ Objectif exactement en ligne avec le rythme actuel : delta attendu ${SEASON_OBJECTIVE_MIDSEASON_MET_BONUS} (obtenu gap=${metSignal.gap}, delta=${metSignal.delta}).`);
  }

  // idx 0 à nouveau, mais objectif "maintien" cette fois -> largement
  // au-dessus du rythme actuel (gap=1-5=-4) : bonus généreux.
  lg.teams[0].seasonObjective = "maintien";
  const exceedSignal = seasonObjectiveMidSeasonSignal(lg, 0);
  const expectedExceedDelta = SEASON_OBJECTIVE_MIDSEASON_MET_BONUS + SEASON_OBJECTIVE_MIDSEASON_EXCEED_BONUS_PER_TIER * 4;
  if (exceedSignal.gap !== -4 || exceedSignal.delta !== expectedExceedDelta) {
    throw new Error(`❌ Rythme largement au-dessus de l'objectif : delta attendu ${expectedExceedDelta} (obtenu gap=${exceedSignal.gap}, delta=${exceedSignal.delta}).`);
  }
  if (exceedSignal.delta <= metSignal.delta) throw new Error("❌ Dépasser largement le rythme attendu devrait rapporter plus que le suivre pile.");

  console.log(`✅ seasonObjectiveMidSeasonSignal : en dessous du rythme = ${missSignal.delta}, sur la bonne voie = +${metSignal.delta}, largement au-dessus = +${exceedSignal.delta}.`);
})();

// ---------------------------------------------------------------------
// 3) Barème de mi-saison volontairement plus modeste que le barème de fin
//    de saison (évite de compter deux fois le même écart, voir le grand
//    commentaire d'engine.js) : chaque constante MIDSEASON_* doit être
//    strictement plus petite que son équivalent de fin de saison.
// ---------------------------------------------------------------------
(function testMidSeasonMagnitudeSmallerThanFinal() {
  if (SEASON_OBJECTIVE_MIDSEASON_MISS_MALUS_PER_TIER >= SEASON_OBJECTIVE_MISS_MALUS_PER_TIER) {
    throw new Error("❌ Le malus de mi-saison par palier devrait être strictement plus petit que celui de fin de saison.");
  }
  if (SEASON_OBJECTIVE_MIDSEASON_EXCEED_BONUS_PER_TIER >= SEASON_OBJECTIVE_EXCEED_BONUS_PER_TIER) {
    throw new Error("❌ Le bonus de mi-saison par palier devrait être strictement plus petit que celui de fin de saison.");
  }
  if (SEASON_OBJECTIVE_MIDSEASON_MET_BONUS >= SEASON_OBJECTIVE_MET_BONUS) {
    throw new Error("❌ Le petit bonus 'sur la bonne voie' de mi-saison devrait être strictement plus petit que le bonus 'objectif rempli' de fin de saison.");
  }
  console.log("✅ Le barème de mi-saison reste partout plus modeste que le barème de fin de saison (pas de double-comptage du même écart).");
})();

// ---------------------------------------------------------------------
// 4) seasonObjectiveMidSeasonSignal renvoie null sans objectif assigné.
// ---------------------------------------------------------------------
(function testSignalNullGuard() {
  const lg = freshLeague();
  fabricateStrictStandingsOrder(lg);
  lg.teams[0].seasonObjective = null;
  if (seasonObjectiveMidSeasonSignal(lg, 0) !== null) throw new Error("❌ Devrait renvoyer null sans objectif assigné, même avec un classement calculable.");
  console.log("✅ seasonObjectiveMidSeasonSignal renvoie null sans objectif assigné.");
})();

// ---------------------------------------------------------------------
// 5) Intégration réelle (server/liveMatch.js:finalizeRound) : le signal ne
//    se déclenche AUTOMATIQUEMENT (recordMoraleEvent + userResult.
//    seasonObjectiveSignal) qu'à LA journée de mi-saison, jamais avant,
//    jamais après, même patron que server/liveMatch_test.js.
// ---------------------------------------------------------------------
(function testFinalizeRoundTriggersOnlyAtMidSeason() {
  const lg = freshLeague();
  const mid = midSeasonRound(lg.totalRounds);
  const historyLenBefore = (lg.teams[0].moraleHistory || []).length;

  for (let r = 0; r < mid; r++) {
    const ev = finalizeRound(Engine, lg, r, Date.now());
    const mine = ev.userResults.find(u => u.teamIdx === 0);
    if (mine && mine.seasonObjectiveSignal) {
      throw new Error(`❌ Le signal de mi-saison ne devrait apparaître qu'à la journée ${mid}, pas à la journée ${r}.`);
    }
  }

  const objectiveBefore = lg.teams[0].seasonObjective;
  const midEvent = finalizeRound(Engine, lg, mid, Date.now());
  const mineAtMid = midEvent.userResults.find(u => u.teamIdx === 0);
  if (!mineAtMid || !mineAtMid.seasonObjectiveSignal) {
    throw new Error(`❌ Le signal de mi-saison devrait apparaître dans userResult à la journée ${mid} (mi-saison, objectif "${objectiveBefore}").`);
  }
  // Recalculé indépendamment juste après (fonction PURE, classement/objectif
  // inchangés depuis l'application) : doit correspondre EXACTEMENT à ce qui
  // a été appliqué.
  const recomputed = seasonObjectiveMidSeasonSignal(lg, 0);
  if (JSON.stringify(recomputed) !== JSON.stringify(mineAtMid.seasonObjectiveSignal)) {
    throw new Error(`❌ Le signal appliqué (${JSON.stringify(mineAtMid.seasonObjectiveSignal)}) devrait correspondre exactement au recalcul indépendant (${JSON.stringify(recomputed)}).`);
  }

  // moraleHistory a bien reçu DEUX nouvelles entrées à cette journée (le
  // résultat du match ET le signal de mi-saison, voir l'ordre dans le grand
  // commentaire de finalizeRound côté serveur) : le signal (posé en dernier,
  // donc unshifté en dernier) doit se retrouver TOUT en tête.
  const historyAfter = lg.teams[0].moraleHistory || [];
  if (historyAfter.length !== historyLenBefore + (mid + 1) + 1) {
    // (mid+1) journées de championnat jouées (0..mid inclus, un match par
    // journée pour l'équipe du joueur, un calendrier à 10 équipes sans
    // journée de repos), chacune posant UN événement de résultat de match,
    // PLUS UN SEUL événement supplémentaire de signal de mi-saison (à la
    // journée `mid` seulement).
    throw new Error(`❌ Nombre d'entrées d'humeur inattendu (obtenu ${historyAfter.length}, attendu ${historyLenBefore + (mid + 1) + 1}).`);
  }
  if (!historyAfter[0].label.startsWith("Mi-saison")) {
    throw new Error(`❌ L'événement de signal de mi-saison devrait être le plus récent de l'historique (obtenu en tête : "${historyAfter[0].label}").`);
  }
  if (historyAfter[0].delta !== mineAtMid.seasonObjectiveSignal.delta) {
    throw new Error(`❌ Le delta journalisé (${historyAfter[0].delta}) devrait correspondre à celui du signal (${mineAtMid.seasonObjectiveSignal.delta}).`);
  }

  for (let r = mid + 1; r < lg.totalRounds; r++) {
    const ev = finalizeRound(Engine, lg, r, Date.now());
    const mine = ev.userResults.find(u => u.teamIdx === 0);
    if (mine && mine.seasonObjectiveSignal) {
      throw new Error(`❌ Le signal de mi-saison ne devrait plus jamais réapparaître après la journée ${mid} (vu à nouveau à la journée ${r}).`);
    }
  }
  console.log(`✅ finalizeRound déclenche le signal de mi-saison automatiquement, une seule fois, exactement à la journée ${mid} (mi-saison), jamais avant ni après ; l'événement journalisé correspond exactement au signal recalculé indépendamment.`);
})();

// ---------------------------------------------------------------------
// 6) Sans objectif assigné pour l'équipe du joueur, la journée de
//    mi-saison ne pose AUCUN événement de signal supplémentaire (seul le
//    résultat du match habituel est journalisé).
// ---------------------------------------------------------------------
(function testNoSignalWithoutObjective() {
  const lg = freshLeague();
  const mid = midSeasonRound(lg.totalRounds);
  lg.teams[0].seasonObjective = null;
  for (let r = 0; r < mid; r++) finalizeRound(Engine, lg, r, Date.now());
  const historyLenBefore = (lg.teams[0].moraleHistory || []).length;
  const midEvent = finalizeRound(Engine, lg, mid, Date.now());
  const mine = midEvent.userResults.find(u => u.teamIdx === 0);
  if (mine.seasonObjectiveSignal) throw new Error("❌ Sans objectif assigné, aucun signal ne devrait être calculé/appliqué.");
  const historyAfter = lg.teams[0].moraleHistory || [];
  if (historyAfter.length !== historyLenBefore + 1) {
    throw new Error(`❌ Sans objectif, une SEULE nouvelle entrée (le résultat du match) était attendue (obtenu ${historyAfter.length - historyLenBefore}).`);
  }
  console.log("✅ Sans objectif de saison assigné, la journée de mi-saison ne pose aucun événement de signal supplémentaire.");
})();

console.log("\nTous les tests du signal de mi-saison de l'objectif de saison sont passés.");
