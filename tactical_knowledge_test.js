// Vérifie le système de "connaissance tactique" (retour utilisateur,
// 2026-09), DEUXIÈME révision :
//
// "sur la partie connaissance tactique, on va modifier un peu la chose. ajd
// ça impacte l'alchimie d'équipe. on va enlever ça et créer une jauge
// connaissance tactique qui impactera le niveau de l'équipe [...]
// l'entrainement augmente la connaissance tactique."
//
// puis, une fois la première version (3 catégories scalaires, bascule
// binaire "tactique établie") livrée et testée en jeu :
//
// "il faudrait que ce soit plus progressif. après un match on n'oublie pas.
// après 2 matchs on commence à oublier. après 3 encore plus etc [...] si on
// joue un match on apprend mais on est pas direct au taquet et ce n'est pas
// direct la tactique de référence [...] il faudrait qu'il y ait une jauge
// par type d'attaque, une par rythme et une par défense [...] comme ça on
// verrait bien les tactiques que l'on maîtrise ou pas."
//
// Cette révision remplace le modèle à 3 catégories scalaires + instantané
// de référence unique par une maîtrise PAR OPTION précise (10 priorités
// offensives, 5 défenses, 3 rythmes), chacune évoluant PROGRESSIVEMENT selon
// une série de matchs consécutifs joués/délaissés (Team.tacticalKnowledgeStreaks) :
// voir engine.js, le grand commentaire CONNAISSANCE TACTIQUE au-dessus de
// TACTICAL_KNOWLEDGE_GAIN_BASE, Team.tacticalKnowledge/
// tacticalKnowledgeStreaks/tacticalKnowledgeFactor/updateTacticalKnowledge,
// tacticalKnowledgeGainForStreak/tacticalKnowledgeLossForStreak,
// Player.eff()/Team.resetForMatch (effet sur la performance, séparé de
// chemistryFactor).
//
// Test purement moteur (pas de serveur HTTP ni de DOM, comme
// server/actions_test.js) : plus rapide, se concentre sur la logique.
const E = require("./engine.js");
const {
  generateStartingRoster, generateLeague, serializeTeam, teamFromSave,
  TACTICAL_KNOWLEDGE_GAIN_BASE, TACTICAL_KNOWLEDGE_GAIN_STEP, TACTICAL_KNOWLEDGE_GAIN_MAX,
  TACTICAL_KNOWLEDGE_LOSS_STEP, TACTICAL_KNOWLEDGE_LOSS_MAX, TACTICAL_KNOWLEDGE_DAILY_GAIN,
  tacticalKnowledgeGainForStreak, tacticalKnowledgeLossForStreak,
  recordMatchStatsForTeam, MatchEngine,
} = E;

const T0 = Date.UTC(2026, 8, 21);
const ONE_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------
// 1) Courbe de gain : jouer la MÊME option plusieurs matchs de suite fait
//    monter sa maîtrise de plus en plus (jusqu'au plafond), jamais un saut
//    direct au maximum dès le premier match.
// ---------------------------------------------------------------------
(function testGainCurveRampsThenPlateaus() {
  if (tacticalKnowledgeGainForStreak(1) !== TACTICAL_KNOWLEDGE_GAIN_BASE) {
    throw new Error(`❌ Le 1er match consécutif devrait rapporter exactement TACTICAL_KNOWLEDGE_GAIN_BASE (${TACTICAL_KNOWLEDGE_GAIN_BASE}), obtenu ${tacticalKnowledgeGainForStreak(1)}.`);
  }
  if (tacticalKnowledgeGainForStreak(2) !== TACTICAL_KNOWLEDGE_GAIN_BASE + TACTICAL_KNOWLEDGE_GAIN_STEP) {
    throw new Error("❌ Le 2e match consécutif devrait rapporter BASE + STEP.");
  }
  if (tacticalKnowledgeGainForStreak(4) !== TACTICAL_KNOWLEDGE_GAIN_MAX) {
    throw new Error(`❌ Le gain devrait plafonner à TACTICAL_KNOWLEDGE_GAIN_MAX (${TACTICAL_KNOWLEDGE_GAIN_MAX}) au 4e match.`);
  }
  if (tacticalKnowledgeGainForStreak(9) !== TACTICAL_KNOWLEDGE_GAIN_MAX) {
    throw new Error("❌ Le gain ne devrait jamais dépasser le plafond, même très loin dans la série.");
  }

  const home = generateStartingRoster("Gain Curve");
  generateLeague(home, 1, T0);
  home.defense = "Homme à homme";
  const values = [];
  for (let i = 0; i < 5; i++) {
    recordMatchStatsForTeam(home, i, "championship", T0 + i * ONE_DAY);
    values.push(home.tacticalKnowledge.defense["Homme à homme"]);
  }
  // 50 + 6, +8, +10, +12, +12 (plafond atteint au 4e match consécutif).
  const expected = [56, 64, 74, 86, 98];
  if (JSON.stringify(values) !== JSON.stringify(expected)) {
    throw new Error(`❌ La progression de maîtrise devrait suivre [${expected}], obtenu [${values}].`);
  }
  console.log(`✅ Jouer la même option 5 matchs de suite fait monter sa maîtrise progressivement (${values.join(" -> ")}), jamais d'un coup.`);
})();

// ---------------------------------------------------------------------
// 2) Courbe de perte : délaisser une option ne coûte RIEN au 1er match
//    d'absence ("après un match on n'oublie pas"), puis accélère.
// ---------------------------------------------------------------------
(function testLossCurveHasGracePeriodThenAccelerates() {
  if (tacticalKnowledgeLossForStreak(1) !== 0) {
    throw new Error("❌ Le 1er match d'absence ne devrait donner AUCUNE perte (période de grâce).");
  }
  if (tacticalKnowledgeLossForStreak(2) !== TACTICAL_KNOWLEDGE_LOSS_STEP) {
    throw new Error(`❌ Le 2e match d'absence devrait coûter exactement TACTICAL_KNOWLEDGE_LOSS_STEP (${TACTICAL_KNOWLEDGE_LOSS_STEP}).`);
  }
  if (tacticalKnowledgeLossForStreak(3) !== 2 * TACTICAL_KNOWLEDGE_LOSS_STEP) {
    throw new Error("❌ Le 3e match d'absence devrait coûter 2x plus que le 2e (accélération).");
  }
  if (tacticalKnowledgeLossForStreak(5) !== TACTICAL_KNOWLEDGE_LOSS_MAX) {
    throw new Error(`❌ La perte devrait plafonner à TACTICAL_KNOWLEDGE_LOSS_MAX (${TACTICAL_KNOWLEDGE_LOSS_MAX}) au 5e match d'absence.`);
  }
  if (tacticalKnowledgeLossForStreak(20) !== TACTICAL_KNOWLEDGE_LOSS_MAX) {
    throw new Error("❌ La perte ne devrait jamais dépasser le plafond, même très loin dans l'absence.");
  }

  const home = generateStartingRoster("Loss Curve");
  generateLeague(home, 1, T0);
  home.defense = "Homme à homme";
  recordMatchStatsForTeam(home, 0, "championship", T0); // H2H streak=1 -> 56
  home.defense = "Zone extérieure"; // H2H désormais délaissée
  const values = [];
  for (let i = 1; i <= 5; i++) {
    recordMatchStatsForTeam(home, i, "championship", T0 + i * ONE_DAY);
    values.push(home.tacticalKnowledge.defense["Homme à homme"]);
  }
  // 56 -> match1 d'absence: 0 perte (56) -> match2: -4 (52) -> match3: -8 (44)
  // -> match4: -12 (32) -> match5: -16 (16, plafond).
  const expected = [56, 52, 44, 32, 16];
  if (JSON.stringify(values) !== JSON.stringify(expected)) {
    throw new Error(`❌ La perte progressive de l'option délaissée devrait suivre [${expected}], obtenu [${values}].`);
  }
  console.log(`✅ Délaisser une option ne coûte rien au 1er match d'absence, puis la perte accélère : ${values.join(" -> ")}.`);
})();

// ---------------------------------------------------------------------
// 3) Indépendance totale entre options : changer UNIQUEMENT la défense ne
//    touche à AUCUNE priorité offensive ni au rythme, et parmi les 3
//    priorités offensives jouées, seules celles qui changent réellement
//    sont affectées (comparaison en ENSEMBLE, pas en ordre).
// ---------------------------------------------------------------------
// Ré-implémentation INDÉPENDANTE de la trajectoire attendue (mêmes règles
// que Team.updateTacticalKnowledge, décrites dans le grand commentaire
// CONNAISSANCE TACTIQUE d'engine.js), construite UNIQUEMENT à partir des
// fonctions publiques tacticalKnowledgeGainForStreak/
// tacticalKnowledgeLossForStreak (déjà validées ci-dessus, sections 1 et 2)
// et de la règle de bascule de série (positive tant que jouée, négative dès
// qu'elle ne l'est plus). Sert d'oracle indépendant pour vérifier que le
// moteur traite bien CHAQUE option des 18 séparément, sur toute une séquence
// de matchs, sans avoir à recalculer les valeurs à la main pour chacune.
function referenceTrajectory(matches) {
  const categories = { offense: Object.keys(E.OFFENSE_PROFILES), defense: Object.keys(E.DEFENSES), rhythm: Object.keys(E.RHYTHMS) };
  const knowledge = { offense: {}, defense: {}, rhythm: {} };
  const streaks = { offense: {}, defense: {}, rhythm: {} };
  ["offense", "defense", "rhythm"].forEach(cat => {
    categories[cat].forEach(k => { knowledge[cat][k] = 50; streaks[cat][k] = 0; });
  });
  matches.forEach(m => {
    const playedOffense = new Set(m.offense);
    const applyOne = (cat, key, played) => {
      const prev = streaks[cat][key] || 0;
      if (played) {
        const s = prev > 0 ? prev + 1 : 1;
        streaks[cat][key] = s;
        knowledge[cat][key] = Math.min(100, Math.max(0, knowledge[cat][key] + tacticalKnowledgeGainForStreak(s)));
      } else {
        const s = prev < 0 ? prev - 1 : -1;
        streaks[cat][key] = s;
        knowledge[cat][key] = Math.min(100, Math.max(0, knowledge[cat][key] - tacticalKnowledgeLossForStreak(-s)));
      }
    };
    categories.offense.forEach(k => applyOne("offense", k, playedOffense.has(k)));
    categories.defense.forEach(k => applyOne("defense", k, k === m.defense));
    categories.rhythm.forEach(k => applyOne("rhythm", k, k === m.rhythm));
  });
  return knowledge;
}

(function testPerOptionIndependence() {
  const home = generateStartingRoster("Per Option Independence");
  generateLeague(home, 1, T0);
  home.defense = "Homme à homme";

  // Séquence délibérément tordue : 2 matchs identiques, puis SEULE la
  // défense change, puis les mêmes 3 priorités offensives réordonnées, puis
  // UNE SEULE priorité remplacée — de quoi vérifier que rien ne "déborde"
  // d'une option sur une autre.
  const matches = [
    { offense: ["Équilibrée", "Pick & Roll", "Jeu en mouvement"], defense: "Homme à homme", rhythm: home.rhythm },
    { offense: ["Équilibrée", "Pick & Roll", "Jeu en mouvement"], defense: "Homme à homme", rhythm: home.rhythm },
    { offense: ["Équilibrée", "Pick & Roll", "Jeu en mouvement"], defense: "Zone extérieure", rhythm: home.rhythm },
    { offense: ["Jeu en mouvement", "Équilibrée", "Pick & Roll"], defense: "Zone extérieure", rhythm: home.rhythm },
    { offense: ["Jeu en mouvement", "Équilibrée", "Isolation"], defense: "Zone extérieure", rhythm: home.rhythm },
  ];
  const expected = referenceTrajectory(matches);

  matches.forEach((m, i) => {
    home.offensivePriorities = m.offense;
    home.defense = m.defense;
    home.rhythm = m.rhythm;
    recordMatchStatsForTeam(home, i, "championship", T0 + i * ONE_DAY);
  });

  let mismatches = [];
  ["offense", "defense", "rhythm"].forEach(cat => {
    Object.keys(expected[cat]).forEach(key => {
      if (home.tacticalKnowledge[cat][key] !== expected[cat][key]) {
        mismatches.push(`${cat}/${key}: attendu ${expected[cat][key]}, obtenu ${home.tacticalKnowledge[cat][key]}`);
      }
    });
  });
  if (mismatches.length) {
    throw new Error(`❌ Trajectoire divergente de l'oracle indépendant sur ${mismatches.length} option(s) :\n${mismatches.join("\n")}`);
  }
  // Vérifie concrètement que le changement de défense seul n'a rien
  // débordé sur les priorités offensives ni le rythme (toujours jouées à
  // l'identique jusqu'au match 3) : elles doivent avoir continué à monter à
  // CHAQUE match, jamais stagné ni baissé.
  if (!(home.tacticalKnowledge.offense["Équilibrée"] > 50 + 3 * TACTICAL_KNOWLEDGE_GAIN_BASE)) {
    throw new Error("❌ \"Équilibrée\", jouée sans interruption, devrait avoir accumulé un gain substantiel sur 5 matchs.");
  }
  console.log(`✅ Sur une séquence de 5 matchs mêlant changements de défense, réordonnancement et remplacement d'une seule priorité offensive, les 18 options suivent exactement la trajectoire attendue (comparaison en ENSEMBLE pour l'attaque, indépendance totale entre options).`);
})();

// ---------------------------------------------------------------------
// 4) Bonus d'entraînement collectif "tactique" : s'ajoute PAR-DESSUS la
//    courbe de gain, UNIQUEMENT sur l'option RÉELLEMENT jouée ce match (une
//    préparation en avance sur une option pas encore live ne rapporte rien
//    tant que l'ordre live n'a pas changé).
// ---------------------------------------------------------------------
(function testTrainingBonusOnlyOnLiveOption() {
  const home = generateStartingRoster("Training Bonus Live Only");
  generateLeague(home, 1, T0);
  home.defense = "Homme à homme";
  recordMatchStatsForTeam(home, 0, "championship", T0); // streak=1 -> +6

  home.collectiveTraining = "tactique";
  home.trainedTactics = { category: "defense", value: "Homme à homme" }; // la tactique DÉJÀ jouée
  home.syncCollectiveTrainingLog(T0 + 1 * ONE_DAY);
  home.syncCollectiveTrainingLog(T0 + 2 * ONE_DAY);
  recordMatchStatsForTeam(home, 1, "championship", T0 + 3 * ONE_DAY); // streak=2 -> +8, + bonus 2 jours

  const expected = 56 + tacticalKnowledgeGainForStreak(2) + TACTICAL_KNOWLEDGE_DAILY_GAIN * 2;
  if (home.tacticalKnowledge.defense["Homme à homme"] !== expected) {
    throw new Error(`❌ Le bonus d'entraînement (2 jours banqués) devrait s'ajouter au gain de streak normal (attendu ${expected}, obtenu ${home.tacticalKnowledge.defense["Homme à homme"]}).`);
  }
  console.log(`✅ 2 jours d'entraînement banqués sur l'option DÉJÀ jouée ajoutent +${TACTICAL_KNOWLEDGE_DAILY_GAIN * 2} par-dessus le gain de série normal (${expected}).`);

  // Prépare maintenant une AUTRE défense, pas encore jouée en direct : elle
  // continue de décliner NORMALEMENT (toujours délaissée, aucun rapport avec
  // l'entraînement qui la cible), le bonus ne s'applique tout simplement
  // pas puisqu'elle n'est pas jouée ce match.
  const streaksBefore = home.tacticalKnowledgeStreaks.defense["Zone press"];
  const before = home.tacticalKnowledge.defense["Zone press"];
  home.trainedTactics = { category: "defense", value: "Zone press" };
  home.syncCollectiveTrainingLog(T0 + 4 * ONE_DAY);
  home.syncCollectiveTrainingLog(T0 + 5 * ONE_DAY);
  recordMatchStatsForTeam(home, 2, "championship", T0 + 6 * ONE_DAY); // toujours H2H en direct
  const expectedZonePress = before - tacticalKnowledgeLossForStreak(-streaksBefore + 1);
  if (home.tacticalKnowledge.defense["Zone press"] !== expectedZonePress) {
    throw new Error(`❌ Préparer une option pas encore jouée en direct ne devrait donner AUCUN bonus (elle devrait juste continuer sa décroissance normale d'absence, attendu ${expectedZonePress}, obtenu ${home.tacticalKnowledge.defense["Zone press"]}).`);
  }
  console.log("✅ Préparer une option pas encore jouée en direct n'ajoute AUCUN bonus tant que l'ordre live n'a pas effectivement changé (elle continue juste sa décroissance normale d'absence).");
})();

// ---------------------------------------------------------------------
// 5) LE POINT CENTRAL de cette révision (retour utilisateur, 2026-09) :
//    revenir à une tactique délaissée plusieurs matchs de suite n'est PLUS
//    "tout ou rien" comme dans l'ancien système à instantané de référence
//    unique — ça remonte progressivement, au même rythme qu'un
//    apprentissage tout neuf. Un aller-retour d'UN SEUL match, lui, reste
//    gratuit (aucune perte), mais réinitialise quand même l'élan de gain.
// ---------------------------------------------------------------------
(function testReturnAfterMultiMatchAbsenceRampsLikeFreshLearning() {
  const home = generateStartingRoster("Return After Absence");
  generateLeague(home, 1, T0);
  home.defense = "Homme à homme";
  // Joue Homme à homme 4 matchs de suite : haute maîtrise (plafond de gain atteint).
  for (let i = 0; i < 4; i++) {
    recordMatchStatsForTeam(home, i, "championship", T0 + i * ONE_DAY);
  }
  const masteryBeforeLeaving = home.tacticalKnowledge.defense["Homme à homme"]; // 56+8+10+12=86... via boucle réelle

  // Part sur Zone extérieure pendant 3 matchs (une "presque toute la saison
  // sur une tactique, 3-4 matchs sur une autre" comme décrit par l'utilisateur).
  home.defense = "Zone extérieure";
  for (let i = 4; i < 7; i++) {
    recordMatchStatsForTeam(home, i, "championship", T0 + i * ONE_DAY);
  }
  const masteryAfterAbsence = home.tacticalKnowledge.defense["Homme à homme"];
  // 3 matchs d'absence : perte 0 (match1) puis -4 (match2) puis -8 (match3).
  const expectedAfterAbsence = masteryBeforeLeaving - 0 - TACTICAL_KNOWLEDGE_LOSS_STEP - 2 * TACTICAL_KNOWLEDGE_LOSS_STEP;
  if (masteryAfterAbsence !== expectedAfterAbsence) {
    throw new Error(`❌ Après 3 matchs d'absence, la perte cumulée devrait être exactement celle de la courbe (attendu ${expectedAfterAbsence}, obtenu ${masteryAfterAbsence}).`);
  }
  if (masteryAfterAbsence >= masteryBeforeLeaving) {
    throw new Error("❌ 3 matchs d'absence consécutifs devraient avoir fait baisser la maîtrise.");
  }

  // Retour à Homme à homme : ne remonte PAS d'un coup à masteryBeforeLeaving,
  // le gain repart d'un streak=1 tout neuf (+TACTICAL_KNOWLEDGE_GAIN_BASE),
  // EXACTEMENT comme s'il s'agissait d'une tactique jamais jouée.
  home.defense = "Homme à homme";
  recordMatchStatsForTeam(home, 7, "championship", T0 + 7 * ONE_DAY);
  const afterReturn = home.tacticalKnowledge.defense["Homme à homme"];
  if (afterReturn !== masteryAfterAbsence + TACTICAL_KNOWLEDGE_GAIN_BASE) {
    throw new Error(`❌ Le retour après une absence de plusieurs matchs devrait rapporter EXACTEMENT le gain de base d'un 1er match (+${TACTICAL_KNOWLEDGE_GAIN_BASE}), comme un apprentissage neuf (attendu ${masteryAfterAbsence + TACTICAL_KNOWLEDGE_GAIN_BASE}, obtenu ${afterReturn}).`);
  }
  if (afterReturn >= masteryBeforeLeaving) {
    throw new Error("❌ Un seul match de retour ne devrait PAS suffire à retrouver la maîtrise d'avant le départ (ça doit remonter progressivement, pas d'un coup).");
  }
  console.log(`✅ Revenir à une tactique délaissée 3 matchs de suite (${masteryBeforeLeaving} -> ${masteryAfterAbsence} -> ${afterReturn}) remonte progressivement, exactement comme un apprentissage neuf — plus jamais "tout ou rien".`);
})();

(function testSingleMatchDetourIsFreeButResetsGainMomentum() {
  const home = generateStartingRoster("Single Match Detour");
  generateLeague(home, 1, T0);
  home.defense = "Homme à homme";
  // 3 matchs de suite : streak=3 côté gain, prêt pour +12 au prochain match consécutif.
  for (let i = 0; i < 3; i++) {
    recordMatchStatsForTeam(home, i, "championship", T0 + i * ONE_DAY);
  }
  const masteryBeforeDetour = home.tacticalKnowledge.defense["Homme à homme"];

  // UN SEUL match sur une autre défense, puis retour immédiat.
  home.defense = "Zone press";
  recordMatchStatsForTeam(home, 3, "championship", T0 + 3 * ONE_DAY);
  const masteryAfterOneAwayMatch = home.tacticalKnowledge.defense["Homme à homme"];
  if (masteryAfterOneAwayMatch !== masteryBeforeDetour) {
    throw new Error(`❌ Un aller-retour d'UN SEUL match ne devrait coûter AUCUNE perte (attendu ${masteryBeforeDetour}, obtenu ${masteryAfterOneAwayMatch}).`);
  }

  home.defense = "Homme à homme";
  recordMatchStatsForTeam(home, 4, "championship", T0 + 4 * ONE_DAY);
  const afterReturn = home.tacticalKnowledge.defense["Homme à homme"];
  if (afterReturn !== masteryBeforeDetour + TACTICAL_KNOWLEDGE_GAIN_BASE) {
    throw new Error(`❌ Le retour après UN SEUL match d'écart devrait repartir d'un gain de base (+${TACTICAL_KNOWLEDGE_GAIN_BASE}), l'élan de série est réinitialisé même sans perte (attendu ${masteryBeforeDetour + TACTICAL_KNOWLEDGE_GAIN_BASE}, obtenu ${afterReturn}).`);
  }
  console.log(`✅ Un aller-retour d'un seul match ne coûte toujours rien (${masteryBeforeDetour} inchangé), mais réinitialise quand même l'élan de gain au retour (+${TACTICAL_KNOWLEDGE_GAIN_BASE} et non le gain de série d'avant).`);
})();

// ---------------------------------------------------------------------
// 6) La connaissance tactique a un effet réel et MODESTE sur la
//    performance en match (Player.eff()), SÉPARÉ de l'alchimie, basé sur la
//    MOYENNE des 3 options ACTUELLEMENT jouées (pas les 18 dans leur
//    ensemble).
// ---------------------------------------------------------------------
(function testTacticalKnowledgeAffectsPerformance() {
  const team = generateStartingRoster("Perf Test");
  generateLeague(team, 1, T0);
  const p = team.players[0];
  p.form = 70; p.fatigue = 0; p.condition = 100; p.pendingMatchBoost = 0;
  team.chemistry = 50; // neutre, isole l'effet de tacticalKnowledge

  team.offensivePriorities.forEach(pr => { team.tacticalKnowledge.offense[pr] = 100; });
  team.tacticalKnowledge.defense[team.defense] = 100;
  team.tacticalKnowledge.rhythm[team.rhythm] = 100;
  team.resetForMatch(T0);
  const effGreat = p.eff("midRange");

  team.offensivePriorities.forEach(pr => { team.tacticalKnowledge.offense[pr] = 0; });
  team.tacticalKnowledge.defense[team.defense] = 0;
  team.tacticalKnowledge.rhythm[team.rhythm] = 0;
  team.resetForMatch(T0);
  const effTerrible = p.eff("midRange");

  if (!(effGreat > effTerrible)) {
    throw new Error(`❌ Une meilleure connaissance tactique devrait donner une meilleure performance (100 -> ${effGreat}, 0 -> ${effTerrible}).`);
  }
  const ratio = effTerrible / effGreat;
  if (ratio < 0.80 || ratio > 0.95) {
    throw new Error(`❌ L'effet de la connaissance tactique devrait être modeste (ratio attendu ~0.89, obtenu ${ratio.toFixed(2)}).`);
  }
  console.log(`✅ La connaissance tactique (moyenne des 3 options ACTUELLEMENT jouées) a un effet réel mais modeste sur eff() (100 -> ${effGreat.toFixed(1)}, 0 -> ${effTerrible.toFixed(1)}, ratio=${ratio.toFixed(2)}), séparé de l'alchimie.`);

  // Une option NON jouée à un niveau très différent ne doit avoir AUCUN effet.
  team.tacticalKnowledge.offense["Isolation"] = 0; // jamais dans offensivePriorities par défaut
  team.resetForMatch(T0);
  const effUnaffected = p.eff("midRange");
  if (Math.abs(effUnaffected - effTerrible) > 1e-9) {
    throw new Error("❌ La maîtrise d'une option NON jouée ne devrait avoir AUCUN effet sur la performance.");
  }
  console.log("✅ La maîtrise d'une option qui n'est pas ACTUELLEMENT jouée n'a aucun effet sur tacticalKnowledgeFactor.");
})();

// ---------------------------------------------------------------------
// 7) Intégration bout en bout : MatchEngine.simulate() pose bien
//    matchTacticalKnowledgeFactor sur tous les joueurs, sans planter.
// ---------------------------------------------------------------------
(function testMatchEngineIntegration() {
  const home = generateStartingRoster("Home MC Test");
  const away = generateStartingRoster("Away MC Test");
  home.offensivePriorities.forEach(pr => { home.tacticalKnowledge.offense[pr] = 85; });
  home.tacticalKnowledge.defense[home.defense] = 85;
  home.tacticalKnowledge.rhythm[home.rhythm] = 85;
  away.offensivePriorities.forEach(pr => { away.tacticalKnowledge.offense[pr] = 20; });
  away.tacticalKnowledge.defense[away.defense] = 20;
  away.tacticalKnowledge.rhythm[away.rhythm] = 20;
  const result = new MatchEngine(home, away).simulate(T0);
  if (!result || !result.finalScore) throw new Error("❌ MatchEngine.simulate() devrait renvoyer un résultat normal.");
  [...home.players, ...away.players].forEach(p => {
    if (typeof p.matchTacticalKnowledgeFactor !== "number") {
      throw new Error("❌ Tous les joueurs devraient avoir un matchTacticalKnowledgeFactor posé après simulate().");
    }
  });
  console.log("✅ MatchEngine.simulate() pose bien matchTacticalKnowledgeFactor sur tous les joueurs des deux équipes, sans régression.");
})();

// ---------------------------------------------------------------------
// 8) Round-trip serializeTeam/teamFromSave : la maîtrise PAR OPTION et les
//    séries en cours doivent survivre à l'identique, y compris des séries
//    négatives (absence en cours).
// ---------------------------------------------------------------------
(function testSerializationRoundTrip() {
  const team = generateStartingRoster("Roundtrip Tactical Knowledge");
  generateLeague(team, 1, T0);
  team.tacticalKnowledge.offense["Équilibrée"] = 63;
  team.tacticalKnowledge.defense["Zone press"] = 28;
  team.tacticalKnowledge.rhythm["Rapide"] = 91;
  team.tacticalKnowledgeStreaks.offense["Équilibrée"] = 3;
  team.tacticalKnowledgeStreaks.defense["Zone press"] = -2;
  team.tacticalKnowledgeStreaks.rhythm["Rapide"] = 0;
  team.collectiveTraining = "tactique";
  team.trainedTactics = { category: "defense", value: "Zone extérieure" };
  team.syncCollectiveTrainingLog(T0);
  team.syncCollectiveTrainingLog(T0 + ONE_DAY);
  team.tacticsCycleStartDayIndex = T0 - ONE_DAY;

  const saved = serializeTeam(team);
  if (!saved.tacticalKnowledge || saved.tacticalKnowledge.offense["Équilibrée"] !== 63
    || saved.tacticalKnowledge.defense["Zone press"] !== 28 || saved.tacticalKnowledge.rhythm["Rapide"] !== 91) {
    throw new Error("❌ serializeTeam devrait persister tacticalKnowledge, PAR OPTION.");
  }
  if (!saved.tacticalKnowledgeStreaks || saved.tacticalKnowledgeStreaks.offense["Équilibrée"] !== 3
    || saved.tacticalKnowledgeStreaks.defense["Zone press"] !== -2) {
    throw new Error("❌ serializeTeam devrait persister tacticalKnowledgeStreaks, y compris les séries négatives.");
  }
  if (!saved.trainedTactics || saved.trainedTactics.category !== "defense" || saved.trainedTactics.value !== "Zone extérieure") {
    throw new Error("❌ serializeTeam devrait persister trainedTactics.");
  }
  if (!Array.isArray(saved.collectiveTrainingLog) || saved.collectiveTrainingLog.length !== 2) {
    throw new Error(`❌ serializeTeam devrait persister collectiveTrainingLog (2 entrées attendues, ${saved.collectiveTrainingLog && saved.collectiveTrainingLog.length} obtenues).`);
  }
  if (saved.tacticsCycleStartDayIndex !== T0 - ONE_DAY) {
    throw new Error("❌ serializeTeam devrait persister tacticsCycleStartDayIndex.");
  }

  const reloaded = teamFromSave(saved);
  if (reloaded.tacticalKnowledge.offense["Équilibrée"] !== 63 || reloaded.tacticalKnowledge.defense["Zone press"] !== 28
    || reloaded.tacticalKnowledge.rhythm["Rapide"] !== 91) {
    throw new Error("❌ teamFromSave devrait restaurer tacticalKnowledge, PAR OPTION, à l'identique.");
  }
  if (reloaded.tacticalKnowledgeStreaks.offense["Équilibrée"] !== 3 || reloaded.tacticalKnowledgeStreaks.defense["Zone press"] !== -2) {
    throw new Error("❌ teamFromSave devrait restaurer tacticalKnowledgeStreaks à l'identique, y compris les séries négatives.");
  }
  // Une option jamais touchée doit rester à sa valeur par défaut (50/0).
  if (reloaded.tacticalKnowledge.offense["Isolation"] !== 50 || reloaded.tacticalKnowledgeStreaks.offense["Isolation"] !== 0) {
    throw new Error("❌ Une option jamais modifiée devrait rester à sa valeur par défaut après un round-trip.");
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
  console.log("✅ tacticalKnowledge/tacticalKnowledgeStreaks (par option, y compris séries négatives)/trainedTactics/collectiveTrainingLog/tacticsCycleStartDayIndex survivent à l'identique à un round-trip serializeTeam/teamFromSave.");
})();

// ---------------------------------------------------------------------
// 9) Sauvegarde ancienne : tacticalKnowledge totalement absent -> valeurs
//    neutres par défaut (50) sur les 18 options, jamais une erreur.
// ---------------------------------------------------------------------
(function testBackwardCompatibilityMissingTacticalKnowledge() {
  const team = generateStartingRoster("Old Save No Tactical Knowledge");
  generateLeague(team, 1, T0);
  const saved = serializeTeam(team);
  delete saved.tacticalKnowledge;
  delete saved.tacticalKnowledgeStreaks;

  const reloaded = teamFromSave(saved);
  if (reloaded.tacticalKnowledge.offense["Équilibrée"] !== 50 || reloaded.tacticalKnowledge.defense["Homme à homme"] !== 50
    || reloaded.tacticalKnowledge.rhythm["Normal"] !== 50) {
    throw new Error("❌ Une sauvegarde sans tacticalKnowledge devrait garder les valeurs par défaut valides (50 partout).");
  }
  if (reloaded.tacticalKnowledgeStreaks.offense["Équilibrée"] !== 0) {
    throw new Error("❌ Une sauvegarde sans tacticalKnowledgeStreaks devrait garder des séries à 0.");
  }
  recordMatchStatsForTeam(reloaded, 0, "championship", T0);
  if (reloaded.tacticalKnowledge.defense[reloaded.defense] !== 50 + TACTICAL_KNOWLEDGE_GAIN_BASE) {
    throw new Error("❌ Le premier match après une sauvegarde ancienne devrait se comporter comme un tout premier match (gain de base normal, aucun historique de série).");
  }
  console.log("✅ Une sauvegarde antérieure à cette fonctionnalité (tacticalKnowledge absent) se recharge sans erreur, avec des valeurs par défaut valides sur les 18 options.");
})();

// ---------------------------------------------------------------------
// 10) Sauvegarde de la PREMIÈRE version de cette fonctionnalité (3
//     catégories scalaires {offense,defense,rhythm}, chacune un seul
//     nombre) : migre en ne reprenant que les 3 options ACTUELLEMENT
//     jouées, le reste repart neutre à 50 — pas d'erreur, pas de valeur
//     inventée pour les 15 autres options.
// ---------------------------------------------------------------------
(function testBackwardCompatibilityOldScalarFormat() {
  const team = generateStartingRoster("Old Scalar Format");
  generateLeague(team, 1, T0);
  team.defense = "Zone press";
  team.rhythm = "Lent";
  const saved = serializeTeam(team);
  // Simule le format scalaire de la toute première version.
  saved.tacticalKnowledge = { offense: 72, defense: 30, rhythm: 88 };
  delete saved.tacticalKnowledgeStreaks;

  const reloaded = teamFromSave(saved);
  reloaded.offensivePriorities.forEach(p => {
    if (reloaded.tacticalKnowledge.offense[p] !== 72) {
      throw new Error(`❌ Chaque priorité ACTUELLEMENT jouée (${p}) devrait hériter de l'ancienne valeur scalaire offense (72).`);
    }
  });
  if (reloaded.tacticalKnowledge.defense["Zone press"] !== 30) {
    throw new Error("❌ La défense ACTUELLEMENT jouée devrait hériter de l'ancienne valeur scalaire defense (30).");
  }
  if (reloaded.tacticalKnowledge.rhythm["Lent"] !== 88) {
    throw new Error("❌ Le rythme ACTUELLEMENT joué devrait hériter de l'ancienne valeur scalaire rhythm (88).");
  }
  // Une option NON jouée actuellement ne doit PAS hériter de la valeur scalaire.
  if (reloaded.tacticalKnowledge.defense["Homme à homme"] !== 50) {
    throw new Error("❌ Une défense NON jouée actuellement devrait repartir neutre à 50, pas hériter de l'ancienne valeur scalaire.");
  }
  console.log("✅ Une sauvegarde de la première version (format scalaire) migre en ne reprenant que les options ACTUELLEMENT jouées, le reste repart neutre à 50.");
})();

console.log("\n✅ Tous les tests de connaissance tactique (Team.tacticalKnowledge, modèle par option) sont passés.");
