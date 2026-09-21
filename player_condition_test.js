// Vérifie le système de "forme physique" (retour utilisateur, 2026-09) :
//
// "Chaque joueur possède une forme comprise entre 0 et 100. La forme est
// totalement indépendante de l'entraînement [...] La valeur réelle reste
// précise (ex. 68), mais l'interface affiche l'état correspondant [...]
// perte après un match qui dépend des minutes jouées [...] récupère
// automatiquement +15 points de forme par jour de repos, avec un plafond
// à 100."
//
// Voir engine.js : CONDITION_STATES/conditionStateFor/currentCondition/
// conditionLossForMinutes/CONDITION_DAY_MS/CONDITION_RECOVERY_PER_DAY,
// Player.condition/conditionUpdatedAt/matchCondition, Player.resetForMatch/
// eff(), MatchEngine.applyFatigue (risque de blessure), recordMatchStatsForTeam
// (perte post-match), serializePlayerRecord/playerFromSave (persistance).
//
// Champ VOLONTAIREMENT séparé de Player.form (confiance, alimentée par les
// interviews) et de Player.fatigue (énergie EN MATCH, remise à 0 à chaque
// coup d'envoi) : voir le grand commentaire de CONDITION_STATES dans
// engine.js pour la distinction complète.
//
// Test purement moteur (pas de serveur HTTP ni de DOM, comme
// server/actions_test.js) : plus rapide, se concentre sur la logique.
const E = require("./engine.js");
const {
  generateStartingRoster, generateLeague, serializeTeam, teamFromSave,
  conditionLossForMinutes, currentCondition, conditionStateFor,
  CONDITION_DAY_MS, CONDITION_RECOVERY_PER_DAY, CONDITION_RECOVERY_PER_DAY_TRAINED, CONDITION_STATES,
  MatchEngine,
} = E;

const T0 = Date.UTC(2026, 8, 21);

// ---------------------------------------------------------------------
// 1) Perte de forme après un match, selon les minutes jouées : valeurs de
//    référence EXACTES fournies par l'utilisateur.
// ---------------------------------------------------------------------
(function testConditionLossReferenceValues() {
  const refs = [[5, 3], [10, 6], [20, 12], [30, 18], [40, 25]];
  refs.forEach(([minutes, expectedLoss]) => {
    const got = conditionLossForMinutes(minutes);
    if (got !== expectedLoss) {
      throw new Error(`❌ conditionLossForMinutes(${minutes}) = ${got}, attendu ${expectedLoss}.`);
    }
  });
  if (conditionLossForMinutes(0) !== 0) throw new Error("❌ conditionLossForMinutes(0) devrait être 0.");
  console.log("✅ conditionLossForMinutes reproduit exactement les 5 valeurs de référence fournies (5→-3, 10→-6, 20→-12, 30→-18, 40→-25).");
})();

// ---------------------------------------------------------------------
// 2) Scénario complet fourni par l'utilisateur à l'origine (100 → match
//    40 min → 75 → 1 jour de repos → 90 → match 30 min → 72 → 1 jour de
//    repos → 87), rejoué avec CONDITION_RECOVERY_PER_DAY_TRAINED (retour
//    utilisateur, 2026-09, entraînement collectif : "bosser la récupération
//    +15 sur un jour sans match avec l'entraînement récupération sinon
//    c'est seulement +10") : ce +15/jour historique reste exact pour un
//    club dont le focus collectif de la semaine est "recuperation" (voir
//    Team.collectiveTraining/conditionRecoveryPerDay), ce n'est plus le
//    comportement par défaut.
// ---------------------------------------------------------------------
(function testFullRecoveryScenarioWithRecoveryTraining() {
  let now = T0;
  let player = { condition: 100, conditionUpdatedAt: now };

  player.condition = player.condition - conditionLossForMinutes(40);
  player.conditionUpdatedAt = now;
  if (player.condition !== 75) throw new Error(`❌ Après un match de 40 min, attendu 75, obtenu ${player.condition}.`);

  now += CONDITION_DAY_MS;
  let recovered = currentCondition(player, now, CONDITION_RECOVERY_PER_DAY_TRAINED);
  if (recovered !== 90) throw new Error(`❌ Après 1 jour de repos (entraînement récupération), attendu 90, obtenu ${recovered}.`);
  player.condition = recovered;
  player.conditionUpdatedAt = now;

  player.condition = player.condition - conditionLossForMinutes(30);
  player.conditionUpdatedAt = now;
  if (player.condition !== 72) throw new Error(`❌ Après un match de 30 min, attendu 72, obtenu ${player.condition}.`);

  now += CONDITION_DAY_MS;
  recovered = currentCondition(player, now, CONDITION_RECOVERY_PER_DAY_TRAINED);
  if (recovered !== 87) throw new Error(`❌ Après 1 jour de repos (entraînement récupération), attendu 87, obtenu ${recovered}.`);

  console.log("✅ Scénario historique fourni par l'utilisateur (100→75→90→72→87) reste exact avec l'entraînement collectif \"recuperation\" (+15/jour).");
})();

// ---------------------------------------------------------------------
// 2bis) Même scénario, mais SANS entraînement collectif "recuperation" (le
//       nouveau défaut, +10/jour au lieu de +15) : la récupération est donc
//       plus lente qu'avant pour un club qui n'investit pas ce focus.
// ---------------------------------------------------------------------
(function testFullRecoveryScenarioDefaultRate() {
  let now = T0;
  let player = { condition: 100, conditionUpdatedAt: now };

  player.condition = player.condition - conditionLossForMinutes(40);
  player.conditionUpdatedAt = now;

  now += CONDITION_DAY_MS;
  let recovered = currentCondition(player, now); // taux par défaut = CONDITION_RECOVERY_PER_DAY
  const expectedAfterOneDay = Math.min(100, 75 + CONDITION_RECOVERY_PER_DAY);
  if (recovered !== expectedAfterOneDay) {
    throw new Error(`❌ Après 1 jour de repos (défaut, sans entraînement récupération), attendu ${expectedAfterOneDay}, obtenu ${recovered}.`);
  }
  player.condition = recovered;
  player.conditionUpdatedAt = now;

  player.condition = player.condition - conditionLossForMinutes(30);
  player.conditionUpdatedAt = now;

  now += CONDITION_DAY_MS;
  recovered = currentCondition(player, now);
  const expectedAfterTwoDays = Math.min(100, player.condition + CONDITION_RECOVERY_PER_DAY);
  if (recovered !== expectedAfterTwoDays) {
    throw new Error(`❌ Après 1 jour de repos supplémentaire (défaut), attendu ${expectedAfterTwoDays}, obtenu ${recovered}.`);
  }
  console.log(`✅ Sans entraînement collectif "recuperation", la récupération suit le nouveau défaut CONDITION_RECOVERY_PER_DAY (+${CONDITION_RECOVERY_PER_DAY}/jour), plus lente que l'ancien +15/jour.`);
})();

// ---------------------------------------------------------------------
// 3) Plafond à 100, et aucune récupération sur un intervalle de moins d'un
//    jour (la récupération est journalière, pas continue).
// ---------------------------------------------------------------------
(function testRecoveryCapAndSubDayNoOp() {
  const now = T0;
  const capped = currentCondition({ condition: 95, conditionUpdatedAt: now - 3 * CONDITION_DAY_MS }, now);
  if (capped !== 100) throw new Error(`❌ La forme devrait plafonner à 100, obtenu ${capped}.`);

  const halfDay = currentCondition({ condition: 50, conditionUpdatedAt: now - CONDITION_DAY_MS / 2 }, now);
  if (halfDay !== 50) throw new Error(`❌ Moins d'un jour écoulé ne devrait donner aucune récupération, obtenu ${halfDay}.`);

  console.log("✅ Plafond à 100 respecté, et aucune récupération avant un jour plein écoulé.");
})();

// ---------------------------------------------------------------------
// 4) États affichés : les 5 paliers demandés, avec les bons seuils.
// ---------------------------------------------------------------------
(function testConditionStates() {
  const expected = [
    [100, "Pas de fatigue"], [90, "Pas de fatigue"],
    [89, "Légèrement fatigué"], [75, "Légèrement fatigué"],
    [74, "Fatigué"], [60, "Fatigué"],
    [59, "Très fatigué"], [40, "Très fatigué"],
    [39, "Épuisé"], [0, "Épuisé"],
  ];
  expected.forEach(([value, label]) => {
    const got = conditionStateFor(value).label;
    if (got !== label) throw new Error(`❌ conditionStateFor(${value}) = "${got}", attendu "${label}".`);
  });
  // Le malus de performance et le risque de blessure doivent s'aggraver
  // strictement à mesure que la forme baisse (retour utilisateur : "0-39
  // Épuisé -> gros malus + risque de blessure augmenté").
  for (let i = 1; i < CONDITION_STATES.length; i++) {
    if (CONDITION_STATES[i].perfFactor >= CONDITION_STATES[i - 1].perfFactor) {
      throw new Error("❌ Le malus de performance devrait s'aggraver strictement à chaque palier inférieur.");
    }
    if (CONDITION_STATES[i].injuryMult <= CONDITION_STATES[i - 1].injuryMult) {
      throw new Error("❌ Le risque de blessure devrait augmenter strictement à chaque palier inférieur.");
    }
  }
  console.log("✅ Les 5 états affichés (Pas de fatigue/Légèrement fatigué/Fatigué/Très fatigué/Épuisé) ont les bons seuils, et le malus/risque s'aggrave à chaque palier.");
})();

// ---------------------------------------------------------------------
// 5) Player.eff() : un joueur "Épuisé" doit produire une statistique
//    effective nettement inférieure à un joueur "Pas de fatigue", toutes
//    choses égales par ailleurs (forme/confiance et fatigue en match fixées
//    à l'identique) : la forme physique doit avoir un effet réel, mesurable.
// ---------------------------------------------------------------------
(function testEffReflectsCondition() {
  const team = generateStartingRoster("Condition Test");
  const league = generateLeague(team, 1, T0);
  const p = team.players[0];
  p.form = 70;
  p.fatigue = 0;
  p.pendingMatchBoost = 0;

  p.matchCondition = 100; // "Pas de fatigue"
  const effFresh = p.eff("midRange");
  p.matchCondition = 20; // "Épuisé"
  const effExhausted = p.eff("midRange");

  if (!(effExhausted < effFresh)) {
    throw new Error(`❌ eff() devrait baisser avec une forme physique basse (frais=${effFresh}, épuisé=${effExhausted}).`);
  }
  const ratio = effExhausted / effFresh;
  // 0.55 / 1.00 attendu (voir CONDITION_STATES), marge de tolérance pour le
  // clamp(1, 130) sur des valeurs extrêmes.
  if (ratio > 0.62 || ratio < 0.50) {
    throw new Error(`❌ Le ratio épuisé/frais (${ratio.toFixed(2)}) devrait être proche de 0.55 (perfFactor "Épuisé").`);
  }
  console.log(`✅ Player.eff() reflète bien la forme physique (frais=${effFresh.toFixed(1)}, épuisé=${effExhausted.toFixed(1)}, ratio=${ratio.toFixed(2)}).`);
})();

// ---------------------------------------------------------------------
// 6) resetForMatch snapshot matchCondition à partir de la forme RATTRAPÉE
//    (jours de repos inclus), pas de la valeur brute stockée.
// ---------------------------------------------------------------------
(function testResetForMatchSnapshotsRecoveredCondition() {
  const team = generateStartingRoster("Snapshot Test");
  generateLeague(team, 1, T0);
  const p = team.players[0];
  p.condition = 60;
  p.conditionUpdatedAt = T0;

  const twoDaysLater = T0 + 2 * CONDITION_DAY_MS;
  p.resetForMatch(twoDaysLater);
  const expected = Math.min(100, 60 + 2 * CONDITION_RECOVERY_PER_DAY);
  if (p.matchCondition !== expected) {
    throw new Error(`❌ matchCondition après resetForMatch (2 jours plus tard) devrait être ${expected}, obtenu ${p.matchCondition}.`);
  }
  // Player.condition lui-même NE DOIT PAS bouger tant que le match n'a pas
  // réellement eu lieu (recordMatchStatsForTeam s'en charge, voir plus bas) :
  // resetForMatch ne fait qu'un instantané pour LIRE, jamais pour ÉCRIRE.
  if (p.condition !== 60) throw new Error("❌ resetForMatch ne devrait jamais modifier Player.condition lui-même.");
  console.log("✅ resetForMatch pose matchCondition d'après la forme rattrapée (jours de repos), sans toucher à Player.condition.");
})();

// ---------------------------------------------------------------------
// 7) recordMatchStatsForTeam applique la perte post-match sur matchCondition
//    (pas sur l'ancienne valeur stockée) et fige conditionUpdatedAt à `now`.
// ---------------------------------------------------------------------
(function testRecordMatchStatsAppliesLoss() {
  const { recordMatchStatsForTeam } = E;
  const team = generateStartingRoster("Post Match Test");
  generateLeague(team, 1, T0);
  const p = team.players[0];
  p.condition = 60;
  p.conditionUpdatedAt = T0;

  const matchTime = T0 + 2 * CONDITION_DAY_MS;
  // Appel DIRECT sur le joueur (pas via Team.resetForMatch) : utilise le
  // taux par défaut CONDITION_RECOVERY_PER_DAY (voir Player.resetForMatch).
  const matchConditionBefore = Math.min(100, 60 + 2 * CONDITION_RECOVERY_PER_DAY);
  p.resetForMatch(matchTime);
  if (p.matchCondition !== matchConditionBefore) {
    throw new Error(`❌ matchCondition avant match attendu ${matchConditionBefore}, obtenu ${p.matchCondition}.`);
  }
  p.secondsPlayed = 30 * 60; // 30 minutes jouées
  p.stats = p.emptyStats();

  recordMatchStatsForTeam(team, 0, "championship", matchTime);

  const expected = matchConditionBefore - conditionLossForMinutes(30);
  if (p.condition !== expected) {
    throw new Error(`❌ Après recordMatchStatsForTeam (30 min jouées), condition attendue ${expected}, obtenu ${p.condition}.`);
  }
  if (p.conditionUpdatedAt !== matchTime) {
    throw new Error("❌ conditionUpdatedAt devrait être figé à l'instant du match après recordMatchStatsForTeam.");
  }
  console.log(`✅ recordMatchStatsForTeam applique bien la perte post-match sur la forme rattrapée (${matchConditionBefore} → ${p.condition} après 30 min), et fige conditionUpdatedAt.`);
})();

// ---------------------------------------------------------------------
// 8) Un joueur qui NE JOUE PAS un match donné ne perd rien (voir
//    recordMatchStatsForTeam, filtre secondsPlayed > 0) : sa récupération
//    continue de s'accumuler normalement, sans être interrompue.
// ---------------------------------------------------------------------
(function testBenchPlayerDoesNotLoseCondition() {
  const { recordMatchStatsForTeam } = E;
  const team = generateStartingRoster("Bench Test");
  generateLeague(team, 1, T0);
  const bench = team.players.find(p => !Object.values(team.lineup.starters).includes(p.id)) || team.players[10];
  bench.condition = 60;
  bench.conditionUpdatedAt = T0;
  bench.secondsPlayed = 0; // n'a pas joué ce match

  recordMatchStatsForTeam(team, 0, "championship", T0 + CONDITION_DAY_MS);
  if (bench.condition !== 60) throw new Error("❌ Un joueur qui n'a pas joué ne devrait pas perdre de forme.");
  console.log("✅ Un joueur qui ne joue pas un match ne perd aucune forme physique.");
})();

// ---------------------------------------------------------------------
// 9) Round-trip serializeTeam/teamFromSave : condition/conditionUpdatedAt
//    doivent survivre à l'identique.
// ---------------------------------------------------------------------
(function testSerializationRoundTrip() {
  const team = generateStartingRoster("Roundtrip Test");
  generateLeague(team, 1, T0);
  const p = team.players[0];
  p.condition = 42;
  p.conditionUpdatedAt = T0 - 5 * CONDITION_DAY_MS;

  const saved = serializeTeam(team);
  const savedPlayer = saved.players.find(x => x.id === p.id);
  if (savedPlayer.condition !== 42) throw new Error("❌ serializeTeam devrait persister condition.");
  if (savedPlayer.conditionUpdatedAt !== p.conditionUpdatedAt) throw new Error("❌ serializeTeam devrait persister conditionUpdatedAt.");

  const reloaded = teamFromSave(saved);
  const reloadedPlayer = reloaded.players.find(x => x.id === p.id);
  if (reloadedPlayer.condition !== 42) throw new Error("❌ teamFromSave devrait restaurer condition.");
  if (reloadedPlayer.conditionUpdatedAt !== p.conditionUpdatedAt) throw new Error("❌ teamFromSave devrait restaurer conditionUpdatedAt.");
  console.log("✅ condition/conditionUpdatedAt survivent à l'identique à un round-trip serializeTeam/teamFromSave.");
})();

// ---------------------------------------------------------------------
// 10) Sauvegarde ancienne (avant cette fonctionnalité) : condition/
//     conditionUpdatedAt absents des données -> on garde les valeurs déjà
//     posées par le constructeur (joueur "frais"), jamais une erreur.
// ---------------------------------------------------------------------
(function testBackwardCompatibilityOldSave() {
  const team = generateStartingRoster("Old Save Test");
  generateLeague(team, 1, T0);
  const saved = serializeTeam(team);
  saved.players.forEach(p => { delete p.condition; delete p.conditionUpdatedAt; });

  const reloaded = teamFromSave(saved);
  reloaded.players.forEach(p => {
    if (typeof p.condition !== "number" || p.condition < 0 || p.condition > 100) {
      throw new Error("❌ Une sauvegarde sans condition devrait garder une valeur par défaut valide (constructeur).");
    }
    if (typeof p.conditionUpdatedAt !== "number") {
      throw new Error("❌ Une sauvegarde sans conditionUpdatedAt devrait garder une valeur par défaut valide (constructeur).");
    }
  });
  console.log("✅ Une sauvegarde antérieure à cette fonctionnalité (condition/conditionUpdatedAt absents) se recharge sans erreur, avec des valeurs par défaut valides.");
})();

// ---------------------------------------------------------------------
// 11) Intégration bout en bout : un vrai MatchEngine.simulate() doit poser
//     matchCondition sur tous les joueurs via resetForMatch, sans planter.
// ---------------------------------------------------------------------
(function testMatchEngineIntegration() {
  const home = generateStartingRoster("Home Test");
  const away = generateStartingRoster("Away Test");
  const now = T0 + CONDITION_DAY_MS;
  const result = new MatchEngine(home, away).simulate(now);
  if (!result || !result.finalScore) throw new Error("❌ MatchEngine.simulate(now) devrait renvoyer un résultat normal.");
  [...home.players, ...away.players].forEach(p => {
    if (typeof p.matchCondition !== "number") {
      throw new Error("❌ Tous les joueurs devraient avoir un matchCondition posé après simulate().");
    }
  });
  console.log("✅ MatchEngine.simulate(now) pose bien matchCondition sur tous les joueurs des deux équipes, sans régression.");
})();

console.log("\n✅ Tous les tests de forme physique (Player.condition) sont passés.");
