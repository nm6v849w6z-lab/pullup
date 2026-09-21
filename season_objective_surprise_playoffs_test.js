// Vérifie le BONUS DE QUALIFICATION SURPRISE EN PLAY-OFFS (retour
// utilisateur, 2026-09, ultérieur aux deux signaux déjà couverts par
// season_objective_endreg_test.js et season_objective_locked_at_endreg_test.js) :
// "une équipe qui est en PO alors que le CA ne visait que le milieu de
// tableau/maintien doit avoir un petit surplus des supporters pour les PO"
// puis, en précision : "elle doit avoir un petit bonus au moment des PO pas
// à la fin de la saison". C'est un TROISIÈME événement, distinct des deux
// autres : ni le signal de fin de saison régulière (aperçu provisoire), ni
// le verdict final (seasonObjectiveVerdict), mais un petit bonus FIXE
// (SEASON_OBJECTIVE_SURPRISE_PLAYOFFS_BONUS) appliqué au tout début des
// play-offs (League.playoffs.seeds tout juste tiré au sort), réservé aux
// équipes dont l'objectif de départ n'était que "maintien" ou
// "milieu-tableau". Voir engine.js:seasonObjectiveSurprisePlayoffsBonus et
// server/autoSim.js:catchUpPlayoffs (point d'application réel, serveur).
const Engine = require("./engine.js");
const {
  generateTeam, generateLeague, generateMultiManagerLeague,
  SEASON_OBJECTIVE_SURPRISE_PLAYOFFS_BONUS,
  seasonObjectiveSurprisePlayoffsBonus,
} = Engine;
const { catchUpLeague } = require("./server/autoSim.js");
const { scheduledTimeForLeagueRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");

const BONUS_LABEL_PREFIX = "Qualification surprise en play-offs";

function freshLeague() {
  const user = generateTeam("User", 1.0);
  return generateLeague(user, 1);
}

// ---------------------------------------------------------------------
// 1) seasonObjectiveSurprisePlayoffsBonus : fonction PURE, tous les gardes-
//    fous (aucune mutation, league.playoffs fabriqué à la main puisque seul
//    `.seeds` est lu par la fonction, voir son propre commentaire dans
//    engine.js).
// ---------------------------------------------------------------------
(function testNullWithoutObjective() {
  const lg = freshLeague();
  lg.teams[0].seasonObjective = null;
  lg.playoffs = { seeds: [0, 1, 2, 3] };
  const bonus = seasonObjectiveSurprisePlayoffsBonus(lg, 0);
  if (bonus !== null) throw new Error(`❌ Sans objectif de saison assigné, le bonus devrait être null, obtenu ${JSON.stringify(bonus)}.`);
  console.log("✅ Aucun objectif de saison assigné : pas de bonus (null).");
})();

(function testNullForAmbitiousObjectivesEvenAsSeed() {
  const lg = freshLeague();
  lg.playoffs = { seeds: [0, 1, 2] };
  ["playoffs", "finale", "titre"].forEach((objective, i) => {
    lg.teams[i].seasonObjective = objective;
    const bonus = seasonObjectiveSurprisePlayoffsBonus(lg, i);
    if (bonus !== null) {
      throw new Error(`❌ Objectif "${objective}" (déjà play-offs ou mieux) : rien de "surprise" à se qualifier, le bonus devrait être null, obtenu ${JSON.stringify(bonus)}.`);
    }
  });
  console.log("✅ Objectifs déjà ambitieux (play-offs/finale/titre), même tête de série : jamais de bonus surprise (rien de surprenant).");
})();

(function testNullIfNotASeed() {
  const lg = freshLeague();
  lg.teams[4].seasonObjective = "maintien";
  lg.playoffs = { seeds: [0, 1, 2, 3] }; // idx4 absent des têtes de série
  const bonus = seasonObjectiveSurprisePlayoffsBonus(lg, 4);
  if (bonus !== null) throw new Error(`❌ Une équipe hors play-offs ne devrait jamais recevoir ce bonus, obtenu ${JSON.stringify(bonus)}.`);
  console.log("✅ Objectif modeste mais équipe hors play-offs (pas une tête de série) : pas de bonus (null).");
})();

(function testNullIfNoPlayoffsYet() {
  const lg = freshLeague();
  lg.teams[0].seasonObjective = "maintien";
  lg.playoffs = null; // saison régulière pas encore terminée
  const bonus = seasonObjectiveSurprisePlayoffsBonus(lg, 0);
  if (bonus !== null) throw new Error(`❌ Sans league.playoffs (play-offs pas encore tirés au sort), le bonus devrait être null, obtenu ${JSON.stringify(bonus)}.`);
  console.log("✅ league.playoffs pas encore posé : pas de bonus (null), impossible de savoir si l'équipe sera tête de série.");
})();

(function testCorrectBonusForBothModestObjectives() {
  const lg = freshLeague();
  lg.playoffs = { seeds: [0, 1] };
  ["maintien", "milieu-tableau"].forEach((objective, i) => {
    lg.teams[i].seasonObjective = objective;
    const bonus = seasonObjectiveSurprisePlayoffsBonus(lg, i);
    if (!bonus) throw new Error(`❌ Objectif "${objective}", tête de série : un bonus était attendu, obtenu null.`);
    if (bonus.delta !== SEASON_OBJECTIVE_SURPRISE_PLAYOFFS_BONUS) {
      throw new Error(`❌ delta attendu ${SEASON_OBJECTIVE_SURPRISE_PLAYOFFS_BONUS} pour "${objective}", obtenu ${bonus.delta}.`);
    }
    if (!bonus.label.startsWith(BONUS_LABEL_PREFIX)) {
      throw new Error(`❌ Le libellé devrait commencer par "${BONUS_LABEL_PREFIX}", obtenu "${bonus.label}".`);
    }
  });
  console.log(`✅ Objectifs "maintien" et "milieu-tableau", tête de série : bonus +${SEASON_OBJECTIVE_SURPRISE_PLAYOFFS_BONUS} avec le bon libellé, pour les deux.`);
})();

// ---------------------------------------------------------------------
// 2) Intégration réelle, câblage serveur (server/autoSim.js:catchUpPlayoffs,
//    le VRAI point d'application, pas seulement la fonction pure ci-dessus) :
//    une ligue à 10 managers humains, TOUS avec un objectif modeste
//    ("maintien"/"milieu-tableau" en alternance, forcé après la création de
//    la ligue : l'objectif ne joue aucun rôle dans la simulation des matchs,
//    voir assignSeasonObjectives/seasonAchievementTier, donc ce forçage ne
//    biaise en rien quelles 4 équipes se qualifient organiquement). Comme
//    les 10 équipes ont un objectif modeste, les 4 têtes de série qui
//    émergent organiquement de la saison régulière (quelles qu'elles
//    soient) ont TOUJOURS un objectif modeste : le bonus doit donc être
//    appliqué aux 4, jamais aux 6 autres.
//
//    `now` est calé PRÉCISÉMENT à la fin de la fenêtre de diffusion de la
//    toute dernière journée de saison régulière (comme catchUpClassic/
//    catchUpPlayoffs le font pour chaque journée, voir server/autoSim.js) :
//    juste assez pour que catchUpPlayoffs tire au sort les têtes de série et
//    applique le bonus, mais PAS assez pour que le moindre match de
//    play-offs soit résolu (leur propre créneau, plus tard, voir
//    scheduledTimeForLeagueRound) - ceci pour inspecter Team.moraleHistory
//    juste après l'application du bonus, avant qu'elle soit polluée par
//    d'autres événements de moral (résultats de matchs de play-offs), vu le
//    plafond de 40 entrées de Team.recordMoraleEvent.
// ---------------------------------------------------------------------
(function testBonusAppliedToAllSeedsOnlyWhenAllObjectivesAreModest() {
  const T0 = Date.UTC(2026, 8, 7);
  const names = Array.from({ length: 10 }, (_, i) => `Club Surprise ${i}`);
  const league = generateMultiManagerLeague(names, 1, T0);

  // Force TOUS les objectifs à modeste (indépendant de la force pré-saison
  // assignée automatiquement par assignSeasonObjectives) : alternance
  // maintien/milieu-tableau, purement pour couvrir les deux libellés.
  league.teams.forEach((team, i) => {
    team.seasonObjective = (i % 2 === 0) ? "maintien" : "milieu-tableau";
  });

  const endOfRegularSeasonAt = scheduledTimeForLeagueRound(league, league.totalRounds - 1) + MATCH_BROADCAST_DURATION_MS;
  const events = catchUpLeague(league, endOfRegularSeasonAt);

  if (!league.playoffs || !Array.isArray(league.playoffs.seeds) || league.playoffs.seeds.length !== 4) {
    throw new Error(`❌ (setup) Les têtes de série des play-offs devraient être tirées au sort à ce stade, obtenu ${JSON.stringify(league.playoffs && league.playoffs.seeds)}.`);
  }
  if (league.isPlayoffsDone()) {
    throw new Error("❌ (setup) Aucun match de play-offs ne devrait déjà être résolu à ce `now` précis (juste après la fin de la saison régulière).");
  }
  const regularSeasonEndEvent = events.find(e => e.type === "regular-season-end");
  if (!regularSeasonEndEvent) throw new Error("❌ (setup) L'événement \"regular-season-end\" aurait dû être émis à ce `now`.");

  const seeds = league.playoffs.seeds;
  league.teams.forEach((team, idx) => {
    const history = team.moraleHistory || [];
    const bonusEntries = history.filter(e => e.label.startsWith(BONUS_LABEL_PREFIX));
    const isSeed = seeds.includes(idx);
    if (isSeed) {
      if (bonusEntries.length !== 1) {
        throw new Error(`❌ idx=${idx} (tête de série, objectif "${team.seasonObjective}") : exactement 1 bonus surprise attendu, obtenu ${bonusEntries.length}.`);
      }
      if (bonusEntries[0].delta !== SEASON_OBJECTIVE_SURPRISE_PLAYOFFS_BONUS) {
        throw new Error(`❌ idx=${idx} : delta attendu ${SEASON_OBJECTIVE_SURPRISE_PLAYOFFS_BONUS}, obtenu ${bonusEntries[0].delta}.`);
      }
    } else if (bonusEntries.length !== 0) {
      throw new Error(`❌ idx=${idx} n'est PAS une tête de série de play-offs, ne devrait jamais recevoir le bonus surprise (objectif "${team.seasonObjective}" pourtant modeste), obtenu ${bonusEntries.length}.`);
    }
  });
  console.log(`✅ Câblage réel (server/autoSim.js:catchUpPlayoffs) : les ${seeds.length} têtes de série (toutes à objectif modeste ici) reçoivent bien le bonus surprise +${SEASON_OBJECTIVE_SURPRISE_PLAYOFFS_BONUS}, les 6 autres équipes jamais.`);

  // --- Idempotence : un second rattrapage, bien plus tard (de quoi
  //     terminer les play-offs), ne doit JAMAIS réappliquer ce bonus une
  //     deuxième fois (garde `if (!league.playoffs)` dans catchUpPlayoffs,
  //     déjà vraie après ce premier appel). ---
  const farFuture = endOfRegularSeasonAt + 52 * 7 * 24 * 60 * 60 * 1000;
  catchUpLeague(league, farFuture);
  if (!league.isPlayoffsDone()) throw new Error("❌ (setup) Les play-offs auraient dû être entièrement résolus après un aussi long rattrapage.");
  seeds.forEach(idx => {
    const team = league.teams[idx];
    const history = team.moraleHistory || [];
    const bonusEntries = history.filter(e => e.label.startsWith(BONUS_LABEL_PREFIX));
    if (bonusEntries.length > 1) {
      throw new Error(`❌ idx=${idx} : le bonus surprise ne devrait JAMAIS être réappliqué sur un rattrapage ultérieur, obtenu ${bonusEntries.length} occurrences.`);
    }
  });
  console.log("✅ Idempotence : un rattrapage ultérieur (play-offs entièrement joués) ne réapplique jamais une seconde fois le bonus surprise.");
})();

console.log("\nTous les tests du bonus de qualification surprise en play-offs sont passés.");
