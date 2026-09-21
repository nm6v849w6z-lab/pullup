// Vérifie l'érosion de motivation (Player.form) pour un non-titulaire qui ne
// joue quasiment pas (retour utilisateur, 2026-09) : "il faut que la
// motivation soit aussi impactée par le temps de jeu, un joueur qui cire le
// banc doit être malheureux (surtout si c'est censé etre un titu dans
// l'équipe où il est)".
//
// Voir engine.js : le grand commentaire au-dessus de
// BENCH_FRUSTRATION_MAX_SECONDS, Team.applyBenchFrustration (appelée par
// Team.trainWeek, au même rythme que le reste de l'entraînement).
//
// Test purement moteur (pas de serveur HTTP ni de DOM, comme
// server/actions_test.js) : plus rapide, se concentre sur la logique.
const E = require("./engine.js");
const {
  generateStartingRoster, POSITIONS, ATTRS,
  BENCH_FRUSTRATION_MAX_SECONDS, BENCH_FRUSTRATION_BASE_MALUS, BENCH_FRUSTRATION_DESERVING_MULT,
} = E;

function freshTeam() {
  return generateStartingRoster("Frustration Test");
}

// Un non-titulaire quelconque au poste `pos` (généré à 3 par poste par
// generateStartingRoster, autoAssignLineup en a déjà mis un sur le banc).
function benchPlayerAt(team, pos) {
  const starterId = team.lineup.starters[pos];
  return team.players.find(p => p.position === pos && p.id !== starterId);
}

// ---------------------------------------------------------------------
// 1) Un remplaçant n'ayant quasiment pas joué cette semaine perd en
//    motivation.
// ---------------------------------------------------------------------
(function testBenchPlayerNoPlayingTimeLosesMotivation() {
  const team = freshTeam();
  const bench = benchPlayerAt(team, POSITIONS[0]);
  bench.trainingSecondsPlayedByPosition = {}; // aucun temps de jeu cette semaine
  bench.form = 70;
  team.applyBenchFrustration(Date.now());
  if (bench.form >= 70) {
    throw new Error(`❌ Un remplaçant n'ayant pas joué devrait perdre en motivation (avant: 70, après: ${bench.form}).`);
  }
  console.log(`✅ Un remplaçant sans temps de jeu perd en motivation (70 → ${bench.form}).`);
})();

// ---------------------------------------------------------------------
// 2) Un titulaire n'est jamais concerné, même à 0 minute (cas théorique).
// ---------------------------------------------------------------------
(function testStarterNeverPenalized() {
  const team = freshTeam();
  const pos = POSITIONS[0];
  const starter = team.players.find(p => p.id === team.lineup.starters[pos]);
  starter.trainingSecondsPlayedByPosition = {};
  starter.form = 70;
  team.applyBenchFrustration(Date.now());
  if (starter.form !== 70) {
    throw new Error(`❌ Un titulaire ne devrait jamais perdre en motivation via applyBenchFrustration (obtenu : ${starter.form}).`);
  }
  console.log("✅ Un titulaire n'est jamais pénalisé, même à 0 minute jouée cette semaine.");
})();

// ---------------------------------------------------------------------
// 3) Un remplaçant qui a quand même tourné un peu (au-dessus du seuil bas)
//    n'est pas pénalisé : seul celui qui ne joue quasiment jamais l'est.
// ---------------------------------------------------------------------
(function testBenchPlayerWithEnoughPlayingTimeNotPenalized() {
  const team = freshTeam();
  const pos = POSITIONS[1];
  const bench = benchPlayerAt(team, pos);
  bench.trainingSecondsPlayedByPosition = { [pos]: BENCH_FRUSTRATION_MAX_SECONDS + 1 };
  bench.form = 70;
  team.applyBenchFrustration(Date.now());
  if (bench.form !== 70) {
    throw new Error(`❌ Un remplaçant ayant quand même tourné cette semaine ne devrait pas perdre en motivation (obtenu : ${bench.form}).`);
  }
  console.log("✅ Un remplaçant ayant dépassé le seuil bas de temps de jeu n'est pas pénalisé.");
})();

// ---------------------------------------------------------------------
// 4) Un joueur actuellement blessé n'est jamais concerné : ne pas jouer
//    n'est alors pas un choix du coach.
// ---------------------------------------------------------------------
(function testInjuredBenchPlayerNotPenalized() {
  const team = freshTeam();
  const pos = POSITIONS[2];
  const bench = benchPlayerAt(team, pos);
  bench.trainingSecondsPlayedByPosition = {};
  bench.form = 70;
  bench.injuryUntil = Date.now() + 5 * 24 * 60 * 60 * 1000; // blessé pour 5 jours encore
  team.applyBenchFrustration(Date.now());
  if (bench.form !== 70) {
    throw new Error(`❌ Un remplaçant actuellement blessé ne devrait jamais être pénalisé (obtenu : ${bench.form}).`);
  }
  console.log("✅ Un remplaçant actuellement blessé n'est jamais pénalisé pour son temps de jeu.");
})();

// ---------------------------------------------------------------------
// 5) Un remplaçant qui note MIEUX que le titulaire actuel à son poste
//    (donc "mériterait" clairement d'être titulaire) perd nettement plus de
//    motivation qu'un remplaçant simplement moins bon que ce titulaire.
// ---------------------------------------------------------------------
(function testDeservingBenchPlayerPenalizedMoreSeverely() {
  const team = freshTeam();
  const pos = POSITIONS[3];
  const starter = team.players.find(p => p.id === team.lineup.starters[pos]);
  const [weakBench, strongBench] = team.players.filter(p => p.position === pos && p.id !== starter.id);

  ATTRS.forEach(a => { starter.attrs[a] = 50; });
  ATTRS.forEach(a => { weakBench.attrs[a] = 20; });   // nettement moins bon que le titulaire
  ATTRS.forEach(a => { strongBench.attrs[a] = 90; }); // nettement meilleur que le titulaire, à SON poste

  [starter, weakBench, strongBench].forEach(p => { p.trainingSecondsPlayedByPosition = {}; p.form = 70; });

  team.applyBenchFrustration(Date.now());

  const weakLoss = 70 - weakBench.form;
  const strongLoss = 70 - strongBench.form;
  if (!(strongLoss > weakLoss)) {
    throw new Error(`❌ Un remplaçant qui note mieux que le titulaire à son poste devrait perdre plus de motivation (faible: -${weakLoss}, fort: -${strongLoss}).`);
  }
  const expectedWeakLoss = 70 - Math.round(70 - BENCH_FRUSTRATION_BASE_MALUS);
  const expectedStrongLoss = 70 - Math.round(70 - BENCH_FRUSTRATION_BASE_MALUS * BENCH_FRUSTRATION_DESERVING_MULT);
  if (weakLoss !== expectedWeakLoss || strongLoss !== expectedStrongLoss) {
    throw new Error(`❌ Malus attendu : faible -${expectedWeakLoss}, fort -${expectedStrongLoss} (obtenu : faible -${weakLoss}, fort -${strongLoss}).`);
  }
  console.log(`✅ Un remplaçant qui "mériterait" d'être titulaire (meilleur que le titulaire actuel à son poste) perd nettement plus de motivation qu'un remplaçant en retrait (-${strongLoss} contre -${weakLoss}).`);
})();

// ---------------------------------------------------------------------
// 6) Player.form ne descend jamais sous 1 (même convention que
//    resolveInterview, voir son commentaire dans engine.js).
// ---------------------------------------------------------------------
(function testFormFloorClamp() {
  const team = freshTeam();
  const bench = benchPlayerAt(team, POSITIONS[4]);
  bench.trainingSecondsPlayedByPosition = {};
  bench.form = 1;
  team.applyBenchFrustration(Date.now());
  if (bench.form < 1) {
    throw new Error(`❌ Player.form ne devrait jamais descendre sous 1 (obtenu : ${bench.form}).`);
  }
  console.log(`✅ Player.form reste plafonné à 1 minimum même pour un remplaçant déjà au plus bas (${bench.form}).`);
})();

// ---------------------------------------------------------------------
// 7) Team.trainWeek applique bien la frustration du banc, AVANT que la
//    remise à zéro hebdomadaire de trainingSecondsPlayedByPosition n'ait
//    lieu (sinon le temps de jeu de la semaine qui s'achève serait déjà
//    perdu au moment du calcul).
// ---------------------------------------------------------------------
(function testTrainWeekAppliesBenchFrustrationBeforeReset() {
  const team = freshTeam();
  const bench = benchPlayerAt(team, POSITIONS[0]);
  bench.trainingSecondsPlayedByPosition = {}; // aucun temps de jeu cette semaine
  bench.form = 70;
  team.trainWeek(1, Date.now());
  if (bench.form >= 70) {
    throw new Error(`❌ Team.trainWeek devrait appliquer la frustration du banc (avant: 70, après: ${bench.form}).`);
  }
  console.log(`✅ Team.trainWeek applique bien la frustration du banc au même rythme que le reste de l'entraînement (70 → ${bench.form}).`);
})();

console.log("\n✅ Tous les tests de frustration du banc (motivation liée au temps de jeu) sont passés.");
