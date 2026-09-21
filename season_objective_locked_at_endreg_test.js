// Vérifie que, pour les équipes dont le sort est déjà scellé à l'issue de
// la SEULE saison régulière (retour utilisateur, 2026-09, ultérieur à la
// demande initiale du signal de fin de saison régulière : "Pour les équipes
// de milieu de classement (ni PO ni barrage) et celles qui descendent tout
// de suite, il ne faut pas qu'un signal et pas deux. La fin de la saison
// régulière correspond à la fin de la saison pour ces équipes là"), un seul
// signal d'objectif de saison tombe à la fin de la saison régulière : le
// VRAI verdict final (barème SEASON_OBJECTIVE_*, la vraie sanction/
// récompense), jamais le simple aperçu provisoire ENDREG, et jamais les
// deux (aucun second verdict réappliqué plus tard, voir Team.
// seasonObjectiveVerdictSettled). Pour les équipes dont le sort dépend
// encore des play-offs (rang 1-4) ou du barrage de relégation (rang 7-8),
// rien ne change : voir season_objective_endreg_test.js.
//
// Voir engine.js : le grand commentaire au-dessus de seasonAchievementTier
// (nouvelle branche "sort déjà scellé") et Team.seasonObjectiveVerdictSettled ;
// et server/liveMatch.js:finalizeRound pour le point d'application réel.
const Engine = require("./engine.js");
const { finalizeRound } = require("./server/liveMatch.js");
const {
  generateTeam, generateLeague, generateMultiManagerLeague,
  SEASON_OBJECTIVE_MISS_MALUS_PER_TIER,
  seasonAchievementTier, seasonObjectiveVerdict,
} = Engine;

function freshLeague() {
  const user = generateTeam("User", 1.0);
  return generateLeague(user, 1);
}

// idx i bat TOUS les idx supérieurs (i<j) : idx 0 = rang 1 (play-offs), ...,
// idx 4/5 = rang 5/6 (milieu de tableau), idx 6/7 = rang 7/8 (barrage),
// idx 8/9 = rang 9/10 (relégation directe). Même fabrication déterministe
// que season_objective_midseason_test.js/season_objective_endreg_test.js.
function fabricateStrictStandingsOrder(lg) {
  for (let i = 0; i < lg.teams.length; i++) {
    for (let j = i + 1; j < lg.teams.length; j++) {
      lg.recordResult(0, i, j, 80, 60);
    }
  }
}

// ---------------------------------------------------------------------
// 1) seasonAchievementTier/seasonObjectiveVerdict : palier/verdict DÉFINITIF
//    dès la fin de la saison régulière pour un rang 5-6 (milieu de tableau)
//    ou 9-10 (relégation directe), SANS attendre les play-offs/le barrage.
//    Fonctions PURES (aucun match supplémentaire simulé, aucune mutation) :
//    classement fabriqué + League.round positionné sur le dernier round,
//    exactement l'état que finalizeRound voit juste avant d'appliquer son
//    propre signal (voir server/liveMatch.js).
// ---------------------------------------------------------------------
(function testLockedRankGetsRealVerdictFormulaPure() {
  const lg = freshLeague();
  fabricateStrictStandingsOrder(lg);
  lg.round = lg.totalRounds - 1; // classement de saison régulière figé, comme au dernier round de finalizeRound

  // Rang 5 (idx4), milieu de tableau (palier 2), objectif "titre" (palier 5) -> gap 3.
  lg.teams[4].seasonObjective = "titre";
  const tier4 = seasonAchievementTier(lg, 4);
  if (tier4 !== 2) {
    throw new Error(`❌ idx4 (rang 5) devrait avoir un palier atteint DÉFINITIF de 2 dès la fin de la saison régulière, sans attendre les play-offs (obtenu ${tier4}).`);
  }
  const verdict4 = seasonObjectiveVerdict(lg, 4);
  if (!verdict4) throw new Error("❌ Le verdict devrait déjà être calculable pour une équipe de milieu de tableau à la fin de la saison régulière.");
  if (verdict4.gap !== 3 || verdict4.delta !== -3 * SEASON_OBJECTIVE_MISS_MALUS_PER_TIER) {
    throw new Error(`❌ gap/delta inattendus pour le milieu de tableau (obtenu gap=${verdict4.gap}, delta=${verdict4.delta}, attendu gap=3, delta=${-3 * SEASON_OBJECTIVE_MISS_MALUS_PER_TIER}).`);
  }

  // Rang 9 (idx8), relégation directe (palier 0, jamais concernée par le
  // barrage : voir relegatedTeamIndexes, le barrage ne touche que 7-8),
  // objectif "milieu-tableau" (palier 2) -> gap 2.
  lg.teams[8].seasonObjective = "milieu-tableau";
  const tier8 = seasonAchievementTier(lg, 8);
  if (tier8 !== 0) {
    throw new Error(`❌ idx8 (rang 9) devrait déjà être considéré relégué (palier 0) dès la fin de la saison régulière (obtenu ${tier8}).`);
  }
  const verdict8 = seasonObjectiveVerdict(lg, 8);
  if (!verdict8 || verdict8.gap !== 2 || verdict8.delta !== -2 * SEASON_OBJECTIVE_MISS_MALUS_PER_TIER) {
    throw new Error(`❌ gap/delta inattendus pour la relégation directe (obtenu ${JSON.stringify(verdict8)}, attendu gap=2, delta=${-2 * SEASON_OBJECTIVE_MISS_MALUS_PER_TIER}).`);
  }

  // Rang 1 (idx0, play-offs à venir) et rang 7 (idx6, barrage à venir) :
  // sort PAS encore scellé, doit rester `null` (aucun play-offs/barrage
  // résolu à ce stade) : rien ne change pour elles.
  lg.teams[0].seasonObjective = "titre";
  if (seasonObjectiveVerdict(lg, 0) !== null) {
    throw new Error("❌ Rang 1 (play-offs à venir) : le verdict ne devrait PAS encore être calculable à ce stade.");
  }
  lg.teams[6].seasonObjective = "playoffs";
  if (seasonObjectiveVerdict(lg, 6) !== null) {
    throw new Error("❌ Rang 7 (barrage à venir) : le verdict ne devrait PAS encore être calculable à ce stade.");
  }

  console.log(`✅ seasonAchievementTier/seasonObjectiveVerdict donnent déjà un palier/verdict DÉFINITIF pour les rangs 5-6/9-10 dès la fin de la saison régulière (milieu de tableau : gap=${verdict4.gap}, delta=${verdict4.delta} ; relégation directe : gap=${verdict8.gap}, delta=${verdict8.delta}), sans attendre les play-offs/le barrage, tandis que les rangs 1-4/7-8 restent \`null\` jusqu'à leur issue réelle.`);
})();

// ---------------------------------------------------------------------
// 2) Intégration réelle, saison ORGANIQUE complète (aucun classement
//    fabriqué, aucune perturbation artificielle) avec les 10 équipes de la
//    ligue humaines (generateMultiManagerLeague) : pour CHAQUE rang final,
//    vérifie qu'un rang 5-6/9-10 reçoit directement le VRAI verdict (jamais
//    l'aperçu "Fin de saison régulière"), qu'un rang 1-4/7-8 continue de ne
//    recevoir qu'un aperçu provisoire, et que Team.
//    seasonObjectiveVerdictSettled reflète exactement cette distinction,
//    peu importe QUELLES équipes précises atterrissent à quel rang (aucune
//    hypothèse sur l'issue de la saison simulée).
// ---------------------------------------------------------------------
(function testAllTenTeamsGetTheRightKindOfSignalOnce() {
  const names = Array.from({ length: 10 }, (_, i) => `Club ${i}`);
  const lg = generateMultiManagerLeague(names, 1);
  for (let r = 0; r < lg.totalRounds; r++) finalizeRound(Engine, lg, r, Date.now());

  if (lg.playoffs) throw new Error("❌ (setup) finalizeRound seule ne devrait jamais déclencher les play-offs.");
  if (lg.relegationBarrage) throw new Error("❌ (setup) finalizeRound seule ne devrait jamais déclencher le barrage de relégation.");

  const table = lg.standings();
  let lockedChecked = 0, notLockedChecked = 0;
  table.forEach((row, i) => {
    const rank = i + 1;
    const team = lg.teams[row.idx];
    const history = team.moraleHistory || [];
    const objectiveEntry = history.find(e => e.label.startsWith("Fin de saison régulière") || e.label.startsWith("Objectif de la saison"));
    if (!objectiveEntry) {
      throw new Error(`❌ Rang ${rank} (idx ${row.idx}) : aucun événement d'objectif de saison trouvé après la fin de la saison régulière.`);
    }
    const isLocked = rank === 5 || rank === 6 || rank === 9 || rank === 10;
    if (isLocked) {
      lockedChecked++;
      if (!objectiveEntry.label.startsWith("Objectif de la saison")) {
        throw new Error(`❌ Rang ${rank} (ni play-offs ni barrage) devrait recevoir le VRAI verdict final dès la fin de la saison régulière, pas un simple aperçu (obtenu "${objectiveEntry.label}").`);
      }
      if (!team.seasonObjectiveVerdictSettled) {
        throw new Error(`❌ Rang ${rank} : Team.seasonObjectiveVerdictSettled devrait être vrai après réception de son verdict définitif dès la fin de la saison régulière.`);
      }
    } else {
      notLockedChecked++;
      if (!objectiveEntry.label.startsWith("Fin de saison régulière")) {
        throw new Error(`❌ Rang ${rank} (play-offs ou barrage encore à jouer) devrait ne recevoir qu'un aperçu provisoire à ce stade (obtenu "${objectiveEntry.label}").`);
      }
      if (team.seasonObjectiveVerdictSettled) {
        throw new Error(`❌ Rang ${rank} : Team.seasonObjectiveVerdictSettled ne devrait PAS encore être vrai, son sort dépend encore des play-offs/du barrage.`);
      }
    }
    // Jamais les deux à la fois pour la même équipe à ce stade (retour
    // utilisateur : "il ne faut pas qu'un signal et pas deux").
    const bothCount = history.filter(e => e.label.startsWith("Fin de saison régulière") || e.label.startsWith("Objectif de la saison")).length;
    if (bothCount !== 1) {
      throw new Error(`❌ Rang ${rank} : un seul événement d'objectif de saison devrait exister à ce stade (obtenu ${bothCount}).`);
    }
  });

  if (lockedChecked !== 4) throw new Error(`❌ (setup) 4 équipes devraient être au sort scellé (rangs 5-6-9-10), obtenu ${lockedChecked}.`);
  if (notLockedChecked !== 6) throw new Error(`❌ (setup) 6 équipes devraient avoir un sort encore en jeu (rangs 1-4 et 7-8), obtenu ${notLockedChecked}.`);

  console.log("✅ Sur une saison organique complète, les 4 équipes de milieu de tableau/reléguées directement (rangs 5-6 et 9-10) reçoivent directement le VRAI verdict de fin de saison dès la fin de la saison régulière (jamais un simple aperçu, jamais les deux), tandis que les 6 autres (play-offs/barrage encore à jouer) continuent de ne recevoir qu'un aperçu provisoire.");
})();

console.log("\nTous les tests du verdict scellé dès la fin de la saison régulière (milieu de tableau/relégation directe) sont passés.");
