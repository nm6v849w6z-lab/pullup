// Vérifie les deux nouveaux systèmes d'interview demandés (retour
// utilisateur, 2026-09) :
//
// 1) Interviews de JALON (mi-saison / fin de saison régulière / demi-finale
//    de play-offs) : "il faut une interview un peu étoffée qui doit être
//    fait à ce moment là. Ca peut jouer sur les supporters et sur les
//    joueurs [...] On a 3 jours pour faire l'interview sinon c'est neutre
//    sur le moral", voir engine.js : MILESTONE_INTERVIEW_TYPES/
//    MILESTONE_INTERVIEW_TONES/MILESTONE_INTERVIEW_QUOTES/
//    MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS, Team.applyMoraleForResult/
//    pruneExpiredInterviews/resolveInterview, milestoneTypeForRound/
//    midSeasonRound, League.runPlayoffs/queuePlayoffSemiInterviews.
//
// 2) MVP AUTOMATIQUE du match : "le mvp du match se fait interviewer à
//    chaque fois. Il n'y a aucune action c'est automatique [...] mettre ses
//    citations sur la page tableau de bord et sur le box score du match
//    fini [...] +2 sur toutes ses caracs", voir engine.js : statEvaluation/
//    MVP_ATTR_BONUS/MVP_QUOTES/awardMatchMvp/recordMatchStatsAndAwardMvp,
//    Player.pendingMatchBoost/eff(), Team.lastMatchMvp.
//
// Test purement moteur (pas de serveur HTTP ni de DOM, comme
// server/actions_test.js) : plus rapide, et se concentre sur la logique en
// elle-même plutôt que sur son câblage aux routes HTTP (déjà exercées par
// server/actions_test.js pour le système d'interview NORMAL, dont celui-ci
// partage l'essentiel de la tuyauterie).
const Engine = require("./engine.js");
const {
  generateStartingRoster, generateLeague, simulateOrForfeit,
  recordMatchStatsForTeam, recordMatchStatsAndAwardMvp,
  milestoneTypeForRound, midSeasonRound, statEvaluation,
  MVP_ATTR_BONUS, MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS,
  serializeTeam, teamFromSave,
} = Engine;

const T0 = Date.UTC(2026, 8, 7);

function freshTeamAndLeague(name) {
  const team = generateStartingRoster(name || "Lyon Test");
  const league = generateLeague(team, 1, T0);
  return { team, league };
}

// ---------------------------------------------------------------------
// milestoneTypeForRound / midSeasonRound
// ---------------------------------------------------------------------
{
  const { league } = freshTeamAndLeague();
  if (league.totalRounds !== 18) throw new Error(`❌ (setup) attendu 18 journées, obtenu ${league.totalRounds}.`);
  if (midSeasonRound(league.totalRounds) !== 9) throw new Error(`❌ midSeasonRound(18) devrait valoir 9, obtenu ${midSeasonRound(league.totalRounds)}.`);
  if (milestoneTypeForRound(9, league.totalRounds) !== "mi-saison") throw new Error("❌ La journée 9 devrait être détectée comme mi-saison.");
  if (milestoneTypeForRound(17, league.totalRounds) !== "fin-saison-reguliere") throw new Error("❌ La dernière journée (17) devrait être détectée comme fin de saison régulière.");
  if (milestoneTypeForRound(0, league.totalRounds) !== null) throw new Error("❌ La journée 0 ne devrait déclencher aucun jalon.");
  if (milestoneTypeForRound(8, league.totalRounds) !== null) throw new Error("❌ La journée 8 (juste avant la mi-saison) ne devrait déclencher aucun jalon.");
  console.log("✅ milestoneTypeForRound/midSeasonRound identifient correctement les journées 9 (mi-saison) et 17 (fin de saison régulière), aucune autre.");
}

// ---------------------------------------------------------------------
// Interview de jalon : mise en attente avec playerIds, délai de 3 jours
// (pas 2h), effet sur fanMorale ET Player.form à la résolution.
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const opp = league.teams[1];
  // Simule un vrai match pour obtenir de vraies stats/secondsPlayed (mêmes
  // conditions qu'un vrai appel depuis finalizeRound).
  simulateOrForfeit(team, opp);
  const playersWhoPlayed = team.players.filter(p => p.secondsPlayed > 0);
  if (!playersWhoPlayed.length) throw new Error("❌ (setup) au moins un joueur devrait avoir joué ce match simulé.");

  team.applyMoraleForResult(true, 15, opp.name, 9, T0, "mi-saison");
  const entry = team.pendingInterviews.find(i => i.milestone === "mi-saison");
  if (!entry) throw new Error("❌ applyMoraleForResult(..., 9, T0, 'mi-saison') devrait mettre une interview de jalon en attente.");
  if (entry.round !== 9) throw new Error("❌ L'entrée de jalon mi-saison devrait porter round=9.");
  if (!Array.isArray(entry.playerIds) || entry.playerIds.length !== playersWhoPlayed.length) {
    throw new Error(`❌ entry.playerIds devrait contenir exactement les ${playersWhoPlayed.length} joueurs ayant joué, obtenu ${entry.playerIds && entry.playerIds.length}.`);
  }
  console.log("✅ Une interview de jalon mi-saison est bien mise en attente, avec la liste exacte des joueurs ayant disputé ce match.");

  // Délai de 3 jours (pas 2h) : encore là juste avant l'échéance, purgée juste après.
  team.pruneExpiredInterviews(T0 + MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS - 1000);
  if (!team.pendingInterviews.some(i => i.id === entry.id)) throw new Error("❌ Une interview de jalon ne devrait PAS être purgée juste avant l'échéance de 3 jours.");
  team.pruneExpiredInterviews(T0 + MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS + 1000);
  if (team.pendingInterviews.some(i => i.id === entry.id)) throw new Error("❌ Une interview de jalon devrait être purgée une fois l'échéance de 3 jours dépassée.");
  console.log("✅ Le délai de réponse d'une interview de jalon est bien de 3 jours (pas 2h comme l'interview normale).");

  // Résolution : effet sur fanMorale ET Player.form (jamais le cas pour une
  // interview normale).
  team.applyMoraleForResult(true, 15, opp.name, 9, T0, "mi-saison");
  const entry2 = team.pendingInterviews.find(i => i.milestone === "mi-saison");
  const targetPlayer = team.players.find(p => p.id === entry2.playerIds[0]);
  const formBefore = targetPlayer.form;
  const fanBefore = team.fanMorale;
  const res = team.resolveInterview(entry2.id, "Agressif", T0);
  if (!res || !res.ok) throw new Error("❌ resolveInterview devrait accepter un ton valide pour une interview de jalon.");
  if (typeof res.formDelta !== "number") throw new Error("❌ Le résultat de resolveInterview pour une interview de jalon devrait inclure formDelta.");
  if (team.fanMorale === fanBefore) throw new Error("❌ fanMorale devrait avoir changé après résolution.");
  const formAfter = team.players.find(p => p.id === targetPlayer.id).form;
  if (formAfter === formBefore) throw new Error("❌ Player.form du joueur concerné devrait avoir changé après résolution d'une interview de jalon (ton Agressif, victoire).");
  if (formAfter <= formBefore) throw new Error(`❌ Ton Agressif + victoire devrait AUGMENTER la forme, obtenu ${formBefore} → ${formAfter}.`);
  console.log(`✅ Résoudre une interview de jalon (ton Agressif, victoire) augmente bien la forme du joueur concerné (${formBefore} → ${formAfter}) en plus de l'humeur des supporters.`);
}

// ---------------------------------------------------------------------
// Le système d'interview NORMAL (sans jalon) reste inchangé : délai de 2h,
// aucun effet sur Player.form.
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const opp = league.teams[1];
  simulateOrForfeit(team, opp);
  const formsBefore = team.players.map(p => p.form);
  team.applyMoraleForResult(true, 10, opp.name, 3, T0);
  const entry = team.pendingInterviews.find(i => i.round === 3);
  if (entry.milestone) throw new Error("❌ Une journée normale (round 3) ne devrait jamais porter `milestone`.");
  const res = team.resolveInterview(entry.id, "Mesuré", T0);
  if (!res.ok) throw new Error("❌ resolveInterview (interview normale) devrait réussir.");
  if (typeof res.formDelta === "number") throw new Error("❌ Une interview NORMALE ne devrait jamais renvoyer formDelta.");
  const formsAfter = team.players.map(p => p.form);
  if (JSON.stringify(formsBefore) !== JSON.stringify(formsAfter)) throw new Error("❌ Une interview normale ne devrait jamais modifier Player.form.");
  console.log("✅ Le système d'interview normal (journées sans jalon) reste inchangé : aucun effet sur Player.form.");
}

// ---------------------------------------------------------------------
// MVP automatique du match : élection, citation figée dans matchLog,
// Team.lastMatchMvp posé pour LES DEUX équipes, bonus temporaire accordé.
// ---------------------------------------------------------------------
{
  const home = generateStartingRoster("HomeMvpTest");
  const away = generateStartingRoster("AwayMvpTest");
  simulateOrForfeit(home, away);

  // Référence indépendante (même formule, calculée ICI plutôt que réutiliser
  // awardMatchMvp) : garantit que le test détecte une vraie régression du
  // choix du MVP, pas seulement que la fonction ne plante pas.
  let expectedBest = null;
  [...home.players, ...away.players].forEach(p => {
    if (p.secondsPlayed > 0) {
      const evalScore = statEvaluation(p.stats);
      if (!expectedBest || evalScore > expectedBest.evalScore) expectedBest = { player: p, evalScore };
    }
  });
  if (!expectedBest) throw new Error("❌ (setup) au moins un joueur devrait avoir joué.");

  const mvpInfo = recordMatchStatsAndAwardMvp(home, away, 0, "championship", T0);
  if (!mvpInfo) throw new Error("❌ recordMatchStatsAndAwardMvp devrait renvoyer un MVP pour un match réellement joué.");
  if (mvpInfo.playerName !== expectedBest.player.name) {
    throw new Error(`❌ Le MVP élu (${mvpInfo.playerName}) ne correspond pas à la meilleure évaluation attendue (${expectedBest.player.name}).`);
  }
  console.log(`✅ Le MVP élu (${mvpInfo.playerName}, évaluation ${mvpInfo.evalScore}) correspond bien à la meilleure évaluation (statEvaluation) toutes équipes confondues.`);

  const mvpPlayer = expectedBest.player;
  const mvpTeam = home.players.includes(mvpPlayer) ? home : away;
  const otherTeam = mvpTeam === home ? away : home;

  if (home.lastMatchMvp.playerName !== mvpInfo.playerName || away.lastMatchMvp.playerName !== mvpInfo.playerName) {
    throw new Error("❌ Team.lastMatchMvp devrait être posé IDENTIQUEMENT pour les DEUX équipes (le MVP peut appartenir à l'une ou l'autre).");
  }
  console.log("✅ Team.lastMatchMvp est bien posé pour les deux équipes, que le MVP appartienne à l'une ou l'autre.");

  const lastEntry = mvpPlayer.matchLog[mvpPlayer.matchLog.length - 1];
  if (!lastEntry || !lastEntry.isMvp) throw new Error("❌ L'entrée matchLog du joueur élu devrait porter isMvp=true.");
  if (!lastEntry.mvpQuote || typeof lastEntry.mvpQuote !== "string") throw new Error("❌ L'entrée matchLog du joueur élu devrait porter une citation (mvpQuote).");
  console.log("✅ La citation du MVP est bien figée sur son entrée matchLog (isMvp/mvpQuote), pour un affichage futur sur le box score du match fini.");

  // Aucun autre joueur (des deux équipes) ne doit être marqué MVP.
  const otherFlagged = [...home.players, ...away.players].filter(p => p.id !== mvpPlayer.id).some(p => {
    const e = p.matchLog[p.matchLog.length - 1];
    return e && e.round === 0 && e.competition === "championship" && e.isMvp;
  });
  if (otherFlagged) throw new Error("❌ Un seul joueur devrait être marqué MVP pour ce match.");

  // Bonus temporaire : +2 sur chaque caractéristique lue en match (eff()),
  // jamais sur overall().
  if (mvpPlayer.pendingMatchBoost !== MVP_ATTR_BONUS) {
    throw new Error(`❌ pendingMatchBoost devrait valoir MVP_ATTR_BONUS (${MVP_ATTR_BONUS}), obtenu ${mvpPlayer.pendingMatchBoost}.`);
  }
  const effWithBoost = mvpPlayer.eff("midRange");
  const savedBoost = mvpPlayer.pendingMatchBoost;
  mvpPlayer.pendingMatchBoost = 0;
  const effWithoutBoost = mvpPlayer.eff("midRange");
  mvpPlayer.pendingMatchBoost = savedBoost;
  if (!(effWithBoost > effWithoutBoost)) throw new Error(`❌ eff() devrait être strictement supérieur avec le bonus MVP actif (${effWithBoost} vs ${effWithoutBoost}).`);
  const overallWithBoost = mvpPlayer.overall();
  mvpPlayer.pendingMatchBoost = 0;
  const overallWithoutBoost = mvpPlayer.overall();
  mvpPlayer.pendingMatchBoost = savedBoost;
  if (overallWithBoost !== overallWithoutBoost) throw new Error("❌ overall() ne devrait JAMAIS être affecté par le bonus MVP (seulement eff(), lu en match).");
  console.log(`✅ Le bonus temporaire de MVP (+${MVP_ATTR_BONUS}) est bien lu par eff() (${effWithoutBoost.toFixed(2)} → ${effWithBoost.toFixed(2)}) mais jamais par overall() (note affichée inchangée).`);

  // Consommation du bonus : effacé dès que le joueur a réellement rejoué,
  // jamais avant, jamais deux fois.
  mvpPlayer.secondsPlayed = 600; // simule "il vient de jouer" sans dépendre d'une vraie resimulation aléatoire
  recordMatchStatsForTeam(mvpTeam, 1, "championship");
  if (mvpPlayer.pendingMatchBoost !== 0) throw new Error("❌ Le bonus MVP devrait être effacé après le tout prochain match réellement joué par ce joueur.");
  console.log("✅ Le bonus temporaire de MVP est bien consommé (effacé) après le tout prochain match réellement joué par le MVP, jamais avant.");

  // Round-trip de sauvegarde : pendingMatchBoost (Player) et lastMatchMvp
  // (Team) doivent survivre à un rechargement.
  const savedOther = serializeTeam(otherTeam);
  const reloadedOther = teamFromSave(JSON.parse(JSON.stringify(savedOther)));
  if (!reloadedOther.lastMatchMvp || reloadedOther.lastMatchMvp.playerName !== mvpInfo.playerName) {
    throw new Error("❌ Team.lastMatchMvp devrait survivre à un round-trip serializeTeam/teamFromSave.");
  }
  console.log("✅ Team.lastMatchMvp survit à un round-trip serializeTeam/teamFromSave.");
}

// ---------------------------------------------------------------------
// Interview de jalon "demi-finale de PO" : round=null (pas de journée de
// calendrier associée), retrouvée par `milestone` uniquement, playerIds
// figés au moment de la demi (pas de la finale). Teste directement
// League.queuePlayoffSemiInterviews sur un `league.playoffs` construit à la
// main, pour ne pas dépendre du tirage au sort du classement/seeding, voir
// le test d'intégration juste après pour le vrai runPlayoffs().
// ---------------------------------------------------------------------
{
  const { team: humanTeam, league } = freshTeamAndLeague("SemiFinalisteHumain");
  const opp = league.teams[1];
  simulateOrForfeit(humanTeam, opp);
  const semiPlayerIds = { 0: humanTeam.players.filter(p => p.secondsPlayed > 0).map(p => p.id) };
  league.playoffs = {
    semi1: { idxA: 0, idxB: 1, winner: 0, games: [{ home: 0, away: 1, scoreHome: 88, scoreAway: 74 }] },
    semi2: { idxA: 2, idxB: 3, winner: 3, games: [{ home: 3, away: 2, scoreHome: 60, scoreAway: 55 }] },
    semiPlayerIds,
  };
  league.queuePlayoffSemiInterviews(T0);
  const semiEntry = humanTeam.pendingInterviews.find(i => i.milestone === "demi-finale-po");
  if (!semiEntry) throw new Error("❌ queuePlayoffSemiInterviews devrait mettre en attente une interview pour l'équipe humaine qualifiée en demi-finale.");
  if (semiEntry.round !== null) throw new Error(`❌ Une interview de demi-finale de PO devrait porter round=null (aucune journée de calendrier), obtenu ${semiEntry.round}.`);
  if (!semiEntry.won) throw new Error("❌ L'équipe humaine (idxA du semi1, winner=0) devrait avoir `won=true`.");
  if (semiEntry.scoreDiff !== 88 - 74) throw new Error(`❌ scoreDiff incorrect, obtenu ${semiEntry.scoreDiff}.`);
  if (!Array.isArray(semiEntry.playerIds) || !semiEntry.playerIds.length) throw new Error("❌ playerIds de l'interview de demi-finale devrait reprendre l'instantané semiPlayerIds fourni.");
  console.log("✅ queuePlayoffSemiInterviews met bien en attente une interview de jalon 'demi-finale de PO' (round=null, playerIds figés à la demi) pour l'équipe humaine qualifiée.");

  const res = league.teams[0].resolveInterview(semiEntry.id, "Mesuré", T0);
  if (!res || !res.ok || typeof res.formDelta !== "number") throw new Error("❌ L'interview de demi-finale de PO devrait se résoudre comme n'importe quelle interview de jalon (effet supporters + joueurs).");
  console.log("✅ L'interview de demi-finale de PO se résout bien avec le même système que les deux autres jalons (effet supporters + joueurs).");
}

// ---------------------------------------------------------------------
// Intégration : un vrai League.runPlayoffs() attache bien semiPlayerIds
// pour les 4 demi-finalistes (peu importe qui ils sont), et
// queuePlayoffSemiInterviews ne plante jamais derrière, qu'une équipe
// humaine se soit qualifiée ou non.
// ---------------------------------------------------------------------
{
  const { league } = freshTeamAndLeague("RealPlayoffIntegration");
  const playoffs = league.runPlayoffs(T0);
  if (!playoffs.semiPlayerIds) throw new Error("❌ runPlayoffs() devrait attacher un instantané semiPlayerIds.");
  [playoffs.semi1.idxA, playoffs.semi1.idxB, playoffs.semi2.idxA, playoffs.semi2.idxB].forEach(idx => {
    if (!Array.isArray(playoffs.semiPlayerIds[idx])) throw new Error(`❌ semiPlayerIds devrait contenir une entrée pour le demi-finaliste idx=${idx}.`);
  });
  league.queuePlayoffSemiInterviews(T0); // ne doit jamais lancer d'exception
  console.log("✅ Un vrai League.runPlayoffs() attache bien semiPlayerIds pour les 4 demi-finalistes ; queuePlayoffSemiInterviews s'exécute ensuite sans erreur.");
}

console.log("\n🏁 Tous les tests milestone_interview_and_mvp_test.js sont passés.");
