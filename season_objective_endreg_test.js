// Vérifie le SIGNAL DE FIN DE SAISON RÉGULIÈRE de l'objectif du conseil
// d'administration (retour utilisateur, 2026-09, immédiatement après avoir
// demandé et reçu le signal de mi-saison : "Juste après la saison régulière
// (avant PO et barrage) aussi") : voir season_objective_midseason_test.js
// pour le premier signal intermédiaire déjà couvert (même mécanique
// partagée, voir engine.js:computeSeasonObjectivePaceSignal), et
// season_objective_test.js pour le verdict de FIN de saison (barrage +
// play-offs compris).
//
// Voir engine.js : le grand commentaire au-dessus de
// SEASON_OBJECTIVE_ENDREG_MISS_MALUS_PER_TIER et
// seasonObjectiveEndOfRegularSeasonSignal ; et server/liveMatch.js:
// finalizeRound pour le point d'application réel (automatique, au jalon
// "fin-saison-reguliere", pour chaque équipe humaine, AVANT le barrage de
// relégation et les play-offs, voir server/autoSim.js:catchUpPlayoffs).
// Retour utilisateur (2026-09, ultérieur) : "pour les équipes de milieu de
// classement (ni PO ni barrage) et celles qui descendent tout de suite, il
// ne faut pas qu'un signal et pas deux [...] la fin de la saison régulière
// correspond à la fin de la saison pour ces équipes là" : CE signal
// provisoire ne s'applique donc plus QU'aux équipes dont le sort dépend
// encore des play-offs (rang 1-4) ou du barrage (rang 7-8), les tests 4 et
// 5 ci-dessous en tiennent compte (rang de l'équipe du joueur imprévisible
// sur une saison simulée organiquement). Voir
// season_objective_locked_at_endreg_test.js pour la couverture dédiée du
// nouveau comportement (rang 5-6/9-10 : VRAI verdict, pas un simple aperçu).
const Engine = require("./engine.js");
const { finalizeRound } = require("./server/liveMatch.js");
const {
  generateTeam, generateLeague,
  SEASON_OBJECTIVE_MISS_MALUS_PER_TIER, SEASON_OBJECTIVE_EXCEED_BONUS_PER_TIER, SEASON_OBJECTIVE_MET_BONUS,
  SEASON_OBJECTIVE_MIDSEASON_MISS_MALUS_PER_TIER, SEASON_OBJECTIVE_MIDSEASON_EXCEED_BONUS_PER_TIER,
  SEASON_OBJECTIVE_MIDSEASON_MET_BONUS,
  SEASON_OBJECTIVE_ENDREG_MISS_MALUS_PER_TIER, SEASON_OBJECTIVE_ENDREG_EXCEED_BONUS_PER_TIER,
  SEASON_OBJECTIVE_ENDREG_MET_BONUS,
  seasonObjectiveEndOfRegularSeasonSignal, seasonObjectiveVerdict,
} = Engine;

function freshLeague() {
  const user = generateTeam("User", 1.0);
  return generateLeague(user, 1);
}

// Même fabrication déterministe de classement que
// season_objective_midseason_test.js : idx i bat TOUS les idx supérieurs,
// donc idx 0 = rang 1, ..., idx 9 = rang 10.
function fabricateStrictStandingsOrder(lg) {
  for (let i = 0; i < lg.teams.length; i++) {
    for (let j = i + 1; j < lg.teams.length; j++) {
      lg.recordResult(0, i, j, 80, 60);
    }
  }
}

// ---------------------------------------------------------------------
// 1) seasonObjectiveEndOfRegularSeasonSignal : les 3 cas, avec le barème
//    ENDREG (plus franc que le barème de mi-saison, mais toujours plus
//    modeste que le verdict final).
// ---------------------------------------------------------------------
(function testSignalGapToDeltaFormula() {
  const lg = freshLeague();
  fabricateStrictStandingsOrder(lg);

  lg.teams[9].seasonObjective = "titre"; // rang 10, palier "maintien" -> gap max (4)
  const missSignal = seasonObjectiveEndOfRegularSeasonSignal(lg, 9);
  if (missSignal.paceObjective !== "maintien") throw new Error(`❌ (setup) idx 9 devrait pointer pour "maintien" (obtenu ${missSignal.paceObjective}).`);
  if (missSignal.gap !== 4 || missSignal.delta !== -4 * SEASON_OBJECTIVE_ENDREG_MISS_MALUS_PER_TIER) {
    throw new Error(`❌ gap/delta inattendus (obtenu gap=${missSignal.gap}, delta=${missSignal.delta}, attendu gap=4, delta=${-4 * SEASON_OBJECTIVE_ENDREG_MISS_MALUS_PER_TIER}).`);
  }
  if (!missSignal.label.startsWith("Fin de saison régulière")) {
    throw new Error(`❌ Le libellé devrait commencer par "Fin de saison régulière" (obtenu "${missSignal.label}").`);
  }

  lg.teams[0].seasonObjective = "titre"; // rang 1, palier "titre" -> gap nul
  const metSignal = seasonObjectiveEndOfRegularSeasonSignal(lg, 0);
  if (metSignal.gap !== 0 || metSignal.delta !== SEASON_OBJECTIVE_ENDREG_MET_BONUS) {
    throw new Error(`❌ Objectif exactement en ligne avec le classement définitif : delta attendu ${SEASON_OBJECTIVE_ENDREG_MET_BONUS} (obtenu gap=${metSignal.gap}, delta=${metSignal.delta}).`);
  }

  lg.teams[0].seasonObjective = "maintien"; // toujours rang 1 -> gap = 1-5 = -4
  const exceedSignal = seasonObjectiveEndOfRegularSeasonSignal(lg, 0);
  const expectedExceedDelta = SEASON_OBJECTIVE_ENDREG_MET_BONUS + SEASON_OBJECTIVE_ENDREG_EXCEED_BONUS_PER_TIER * 4;
  if (exceedSignal.gap !== -4 || exceedSignal.delta !== expectedExceedDelta) {
    throw new Error(`❌ Classement définitif largement au-dessus de l'objectif : delta attendu ${expectedExceedDelta} (obtenu gap=${exceedSignal.gap}, delta=${exceedSignal.delta}).`);
  }
  if (exceedSignal.delta <= metSignal.delta) throw new Error("❌ Dépasser largement l'objectif devrait rapporter plus que le remplir pile.");

  console.log(`✅ seasonObjectiveEndOfRegularSeasonSignal : en dessous = ${missSignal.delta}, sur la bonne voie = +${metSignal.delta}, largement au-dessus = +${exceedSignal.delta}.`);
})();

// ---------------------------------------------------------------------
// 2) Barème ENDREG strictement entre le barème de mi-saison (moins fiable,
//    saison encore à moitié jouée) et le barème de fin de saison COMPLÈTE
//    (verdict final, la vraie sanction/récompense) : ni aussi timide que le
//    premier, ni aussi sévère que le second.
// ---------------------------------------------------------------------
(function testEndregMagnitudeBetweenMidSeasonAndFinal() {
  if (SEASON_OBJECTIVE_ENDREG_MISS_MALUS_PER_TIER <= SEASON_OBJECTIVE_MIDSEASON_MISS_MALUS_PER_TIER) {
    throw new Error("❌ Le malus de fin de saison régulière devrait être strictement plus franc que celui de mi-saison.");
  }
  if (SEASON_OBJECTIVE_ENDREG_MISS_MALUS_PER_TIER >= SEASON_OBJECTIVE_MISS_MALUS_PER_TIER) {
    throw new Error("❌ Le malus de fin de saison régulière devrait rester strictement en retrait de celui du verdict final.");
  }
  if (SEASON_OBJECTIVE_ENDREG_EXCEED_BONUS_PER_TIER <= SEASON_OBJECTIVE_MIDSEASON_EXCEED_BONUS_PER_TIER
    || SEASON_OBJECTIVE_ENDREG_EXCEED_BONUS_PER_TIER >= SEASON_OBJECTIVE_EXCEED_BONUS_PER_TIER) {
    throw new Error("❌ Le bonus de fin de saison régulière par palier devrait se situer strictement entre celui de mi-saison et celui du verdict final.");
  }
  if (SEASON_OBJECTIVE_ENDREG_MET_BONUS <= SEASON_OBJECTIVE_MIDSEASON_MET_BONUS
    || SEASON_OBJECTIVE_ENDREG_MET_BONUS >= SEASON_OBJECTIVE_MET_BONUS) {
    throw new Error("❌ Le petit bonus 'sur la bonne voie' de fin de saison régulière devrait se situer strictement entre celui de mi-saison et le bonus 'objectif rempli' du verdict final.");
  }
  console.log("✅ Le barème de fin de saison régulière se situe strictement entre celui de mi-saison (plus timide) et celui du verdict final (plus sévère/généreux).");
})();

// ---------------------------------------------------------------------
// 3) seasonObjectiveEndOfRegularSeasonSignal renvoie null sans objectif
//    assigné.
// ---------------------------------------------------------------------
(function testSignalNullGuard() {
  const lg = freshLeague();
  fabricateStrictStandingsOrder(lg);
  lg.teams[0].seasonObjective = null;
  if (seasonObjectiveEndOfRegularSeasonSignal(lg, 0) !== null) throw new Error("❌ Devrait renvoyer null sans objectif assigné, même avec un classement calculable.");
  console.log("✅ seasonObjectiveEndOfRegularSeasonSignal renvoie null sans objectif assigné.");
})();

// ---------------------------------------------------------------------
// 4) Intégration réelle (server/liveMatch.js:finalizeRound) : le signal ne
//    se déclenche qu'à LA dernière journée de la saison régulière (jalon
//    "fin-saison-reguliere"), et surtout AVANT que League.playoffs/
//    League.relegationBarrage n'existent (ce que finalizeRound seule ne
//    déclenche jamais, voir server/autoSim.js:catchUpPlayoffs, qui les
//    déclenche seulement APRÈS coup) : le classement utilisé est donc bien
//    le classement DÉFINITIF de la saison régulière, ni plus ni moins.
// ---------------------------------------------------------------------
(function testFinalizeRoundTriggersAtEndOfRegularSeasonOnly() {
  const lg = freshLeague();
  const lastRegularRound = lg.totalRounds - 1;

  for (let r = 0; r < lastRegularRound; r++) {
    const ev = finalizeRound(Engine, lg, r, Date.now());
    const mine = ev.userResults.find(u => u.teamIdx === 0);
    if (mine && mine.seasonObjectiveSignal && mine.seasonObjectiveSignal.label.startsWith("Fin de saison régulière")) {
      throw new Error(`❌ Le signal de fin de saison régulière ne devrait apparaître qu'à la journée ${lastRegularRound}, pas à la journée ${r}.`);
    }
  }

  if (lg.playoffs) throw new Error("❌ (setup) les play-offs ne devraient pas encore exister avant la dernière journée de saison régulière.");
  if (lg.relegationBarrage) throw new Error("❌ (setup) le barrage de relégation ne devrait pas encore exister avant la dernière journée de saison régulière.");

  const objectiveBefore = lg.teams[0].seasonObjective;
  const lastEvent = finalizeRound(Engine, lg, lastRegularRound, Date.now());

  // Toujours PAS de play-offs/barrage juste après finalizeRound pour cette
  // dernière journée : c'est server/autoSim.js:catchUpPlayoffs, appelée
  // séparément et PLUS TARD, qui les déclenche, jamais finalizeRound
  // elle-même (voir le grand commentaire de finalizeRound côté serveur).
  if (lg.playoffs) throw new Error("❌ finalizeRound ne devrait jamais déclencher les play-offs elle-même.");
  if (lg.relegationBarrage) throw new Error("❌ finalizeRound ne devrait jamais déclencher le barrage de relégation elle-même.");

  const mine = lastEvent.userResults.find(u => u.teamIdx === 0);
  if (!mine || !mine.seasonObjectiveSignal) {
    throw new Error(`❌ Un signal/verdict d'objectif de saison devrait apparaître dans userResult à la journée ${lastRegularRound} (objectif "${objectiveBefore}").`);
  }
  // Rang de l'équipe du joueur imprévisible (saison simulée organiquement,
  // pas de classement fabriqué ici) : rang 5-6/9-10 (ni PO ni barrage) reçoit
  // désormais le VRAI verdict directement (retour utilisateur, "il ne faut
  // pas qu'un signal et pas deux"), rang 1-4/7-8 continue de ne recevoir
  // qu'un aperçu provisoire, exactement comme avant.
  const rank0 = lg.standings().findIndex(s => s.idx === 0) + 1;
  const isLocked = rank0 === 5 || rank0 === 6 || rank0 === 9 || rank0 === 10;
  console.log(`Rang de l'équipe du joueur en fin de saison régulière : ${rank0} (${isLocked ? "sort déjà scellé" : "play-offs ou barrage encore à jouer"}).`);

  if (isLocked) {
    if (!mine.seasonObjectiveSignal.label.startsWith("Objectif de la saison")) {
      throw new Error(`❌ Rang ${rank0} (ni play-offs ni barrage) : le VRAI verdict final devrait s'appliquer dès la fin de la saison régulière, pas un simple aperçu (obtenu "${mine.seasonObjectiveSignal.label}").`);
    }
    if (!lg.teams[0].seasonObjectiveVerdictSettled) {
      throw new Error("❌ Team.seasonObjectiveVerdictSettled devrait être vrai après application du verdict définitif dès la fin de la saison régulière.");
    }
    const recomputed = seasonObjectiveVerdict(lg, 0);
    if (JSON.stringify(recomputed) !== JSON.stringify(mine.seasonObjectiveSignal)) {
      throw new Error(`❌ Le verdict appliqué (${JSON.stringify(mine.seasonObjectiveSignal)}) devrait correspondre exactement au recalcul indépendant (${JSON.stringify(recomputed)}).`);
    }
    const history = lg.teams[0].moraleHistory || [];
    if (!history[0].label.startsWith("Objectif de la saison")) {
      throw new Error(`❌ L'événement de verdict devrait être le plus récent de l'historique (obtenu en tête : "${history[0].label}").`);
    }
    console.log(`✅ Rang ${rank0} : finalizeRound applique directement le VRAI verdict de fin de saison dès la dernière journée de saison régulière (jamais un simple aperçu), AVANT que les play-offs/le barrage n'existent.`);
  } else {
    if (!mine.seasonObjectiveSignal.label.startsWith("Fin de saison régulière")) {
      throw new Error(`❌ Le libellé devrait indiquer "Fin de saison régulière" (obtenu "${mine.seasonObjectiveSignal.label}").`);
    }
    if (lg.teams[0].seasonObjectiveVerdictSettled) {
      throw new Error("❌ Team.seasonObjectiveVerdictSettled ne devrait PAS encore être vrai : le sort de cette équipe dépend encore des play-offs/du barrage.");
    }
    // Recalculé indépendamment juste après (classement/objectif inchangés) :
    // doit correspondre EXACTEMENT à ce qui a été appliqué.
    const recomputed = seasonObjectiveEndOfRegularSeasonSignal(lg, 0);
    if (JSON.stringify(recomputed) !== JSON.stringify(mine.seasonObjectiveSignal)) {
      throw new Error(`❌ Le signal appliqué (${JSON.stringify(mine.seasonObjectiveSignal)}) devrait correspondre exactement au recalcul indépendant (${JSON.stringify(recomputed)}).`);
    }
    const history = lg.teams[0].moraleHistory || [];
    if (!history[0].label.startsWith("Fin de saison régulière")) {
      throw new Error(`❌ L'événement de signal de fin de saison régulière devrait être le plus récent de l'historique (obtenu en tête : "${history[0].label}").`);
    }
    console.log(`✅ Rang ${rank0} : finalizeRound déclenche le signal de fin de saison régulière automatiquement, exactement à la journée ${lastRegularRound} (la dernière), AVANT que les play-offs/le barrage n'existent ; l'événement journalisé correspond exactement au signal recalculé indépendamment.`);
  }
})();

// ---------------------------------------------------------------------
// 5) Les DEUX signaux/verdicts intermédiaires (mi-saison ET fin de saison
//    régulière) apparaissent chacun EXACTEMENT une fois sur la même saison,
//    à des journées différentes, sans interférer l'un avec l'autre, que le
//    second soit un simple aperçu ("Fin de saison régulière") ou le VRAI
//    verdict ("Objectif de la saison...") selon le rang final de l'équipe.
// ---------------------------------------------------------------------
(function testBothSignalsCoexistOncePerSeason() {
  const lg = freshLeague();
  for (let r = 0; r < lg.totalRounds; r++) finalizeRound(Engine, lg, r, Date.now());
  const history = lg.teams[0].moraleHistory || [];
  const midCount = history.filter(e => e.label.startsWith("Mi-saison")).length;
  const endregCount = history.filter(e => e.label.startsWith("Fin de saison régulière") || e.label.startsWith("Objectif de la saison")).length;
  if (midCount !== 1) throw new Error(`❌ Le signal de mi-saison devrait apparaître exactement une fois (obtenu ${midCount}).`);
  if (endregCount !== 1) throw new Error(`❌ Un seul signal/verdict devrait apparaître à la fin de la saison régulière, jamais les deux à la fois (obtenu ${endregCount}).`);
  console.log("✅ Les deux signaux intermédiaires (mi-saison et fin de saison régulière) coexistent, chacun exactement une fois par saison régulière.");
})();

console.log("\nTous les tests du signal de fin de saison régulière de l'objectif de saison sont passés.");
