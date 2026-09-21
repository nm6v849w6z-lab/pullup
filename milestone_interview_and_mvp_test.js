// Vérifie les deux nouveaux systèmes d'interview demandés (retour
// utilisateur, 2026-09) :
//
// 1) Interviews de JALON (début de saison / mi-saison / fin de saison
//    régulière / demi-finale de play-offs / finale de play-offs) : "il faut
//    une interview un peu étoffée qui doit être fait à ce moment là. Ca peut
//    jouer sur les supporters et sur les joueurs [...] On a 3 jours pour
//    faire l'interview sinon c'est neutre sur le moral", voir engine.js :
//    MILESTONE_INTERVIEW_TYPES/MILESTONE_INTERVIEW_TONES/
//    MILESTONE_INTERVIEW_QUOTES/MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS,
//    Team.applyMoraleForResult/pruneExpiredInterviews/resolveInterview,
//    milestoneTypeForRound/midSeasonRound, League._queuePlayoffSeriesInterview
//    (demi-finales ET finale).
//
//    L'ancien système d'interview "classique" (une interview possible après
//    CHAQUE match, délai de 2h) a depuis été retiré intégralement (retour
//    utilisateur, 2026-09 : "on enlève ça") : Team.applyMoraleForResult ne
//    met désormais JAMAIS d'interview en attente sans `milestone` explicite,
//    quel que soit `round`. Voir plus bas le test qui couvre ce
//    non-comportement.
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
  // Correctif 2026-09 (retour utilisateur : "mets un vrai pop up pour
  // l'interview [...] mets 2/3 questions quand même, et pose des vraies
  // questions") : voir la toute dernière partie de ce fichier.
  MILESTONE_INTERVIEW_QUESTIONS, interviewTranscriptFor,
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
  if (milestoneTypeForRound(0, league.totalRounds) !== "debut-saison") throw new Error("❌ La journée 0 devrait être détectée comme début de saison.");
  if (milestoneTypeForRound(9, league.totalRounds) !== "mi-saison") throw new Error("❌ La journée 9 devrait être détectée comme mi-saison.");
  if (milestoneTypeForRound(17, league.totalRounds) !== "fin-saison-reguliere") throw new Error("❌ La dernière journée (17) devrait être détectée comme fin de saison régulière.");
  if (milestoneTypeForRound(1, league.totalRounds) !== null) throw new Error("❌ La journée 1 (juste après le début de saison) ne devrait déclencher aucun jalon.");
  if (milestoneTypeForRound(8, league.totalRounds) !== null) throw new Error("❌ La journée 8 (juste avant la mi-saison) ne devrait déclencher aucun jalon.");
  console.log("✅ milestoneTypeForRound/midSeasonRound identifient correctement les journées 0 (début de saison), 9 (mi-saison) et 17 (fin de saison régulière), aucune autre.");
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
// L'ancien système d'interview CLASSIQUE (une interview possible après
// chaque match de championnat) a été entièrement retiré (retour
// utilisateur, 2026-09 : "on enlève ça") : un match SANS jalon associé ne
// doit plus jamais mettre d'interview en attente, quel que soit `round`.
// fanMorale continue en revanche d'évoluer immédiatement à chaque match
// (comportement inchangé, seule la file d'interviews change).
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const opp = league.teams[1];
  simulateOrForfeit(team, opp);
  const fanBefore = team.fanMorale;
  team.applyMoraleForResult(true, 10, opp.name, 3, T0);
  if (team.pendingInterviews.some(i => i.round === 3)) {
    throw new Error("❌ Une journée normale (round 3, sans `milestone`) ne devrait plus jamais mettre d'interview en attente.");
  }
  if (team.fanMorale === fanBefore) throw new Error("❌ fanMorale devrait quand même évoluer immédiatement à chaque match, jalon ou non.");
  console.log("✅ Un match sans jalon associé n'ouvre plus aucune interview (ancien système classique bien retiré), fanMorale évolue toujours immédiatement.");
}

// ---------------------------------------------------------------------
// Les 5 jalons attendus sont bien tous déclarés, avec au moins une citation
// pour chaque ton et chaque issue (victoire/défaite) : "ça ferait 5
// interview max" (retour utilisateur, 2026-09).
// ---------------------------------------------------------------------
{
  const { MILESTONE_INTERVIEW_TYPES, MILESTONE_INTERVIEW_TONES, MILESTONE_INTERVIEW_QUOTES } = Engine;
  const expectedMilestones = ["debut-saison", "mi-saison", "fin-saison-reguliere", "demi-finale-po", "finale-po"];
  const actualMilestones = Object.keys(MILESTONE_INTERVIEW_TYPES);
  if (actualMilestones.length !== 5 || expectedMilestones.some(m => !actualMilestones.includes(m))) {
    throw new Error(`❌ MILESTONE_INTERVIEW_TYPES devrait exposer exactement 5 jalons (${expectedMilestones.join(", ")}), obtenu ${actualMilestones.join(", ")}.`);
  }
  expectedMilestones.forEach(milestone => {
    Object.keys(MILESTONE_INTERVIEW_TONES).forEach(tone => {
      ["win", "loss"].forEach(outcome => {
        const quotes = MILESTONE_INTERVIEW_QUOTES[milestone] && MILESTONE_INTERVIEW_QUOTES[milestone][tone] && MILESTONE_INTERVIEW_QUOTES[milestone][tone][outcome];
        if (!Array.isArray(quotes) || !quotes.length) {
          throw new Error(`❌ MILESTONE_INTERVIEW_QUOTES["${milestone}"]["${tone}"]["${outcome}"] devrait contenir au moins une citation.`);
        }
      });
    });
  });
  console.log("✅ Les 5 jalons attendus (début de saison, mi-saison, fin de saison régulière, demi-finale de PO, finale de PO) sont bien déclarés, chacun avec des citations pour les 3 tons et les 2 issues.");
}

// ---------------------------------------------------------------------
// Correctif 2026-09 (retour utilisateur : "mets un vrai pop up pour
// l'interview qu'on peut passer et faire en retournant dans le tableau de
// bord [...] mets 2/3 questions quand même, et pose des vraies questions,
// c'est pas ouf quand même là") : chaque jalon porte désormais 2 VRAIES
// questions de journaliste (MILESTONE_INTERVIEW_QUESTIONS), et
// MILESTONE_INTERVIEW_QUOTES porte EXACTEMENT autant de réponses que de
// questions pour ce jalon (une réponse par question, dans le même ordre),
// pour chaque {ton, issue}. interviewTranscriptFor zippe les deux en un
// transcript {question, answer}[], et Team.resolveInterview l'expose via
// `quotes` sur son résultat.
// ---------------------------------------------------------------------
{
  const expectedMilestones = ["debut-saison", "mi-saison", "fin-saison-reguliere", "demi-finale-po", "finale-po"];
  const { MILESTONE_INTERVIEW_TONES, MILESTONE_INTERVIEW_QUOTES } = Engine;
  expectedMilestones.forEach(milestone => {
    const questions = MILESTONE_INTERVIEW_QUESTIONS[milestone];
    console.log(`\nQuestions pour "${milestone}" :`, questions);
    if (!Array.isArray(questions) || questions.length < 2) {
      throw new Error(`❌ MILESTONE_INTERVIEW_QUESTIONS["${milestone}"] devrait contenir au moins 2 vraies questions, obtenu ${questions && questions.length}.`);
    }
    if (questions.some(q => typeof q !== "string" || q.trim().length < 5)) {
      throw new Error(`❌ MILESTONE_INTERVIEW_QUESTIONS["${milestone}"] devrait contenir de VRAIES questions (chaînes non triviales), pas des placeholders.`);
    }
    Object.keys(MILESTONE_INTERVIEW_TONES).forEach(tone => {
      ["win", "loss"].forEach(outcome => {
        const answers = MILESTONE_INTERVIEW_QUOTES[milestone][tone][outcome];
        if (answers.length !== questions.length) {
          throw new Error(`❌ MILESTONE_INTERVIEW_QUOTES["${milestone}"]["${tone}"]["${outcome}"] devrait porter exactement une réponse par question (${questions.length} attendues), obtenu ${answers.length}.`);
        }
      });
    });
  });
  console.log("✅ Chaque jalon porte au moins 2 vraies questions (MILESTONE_INTERVIEW_QUESTIONS), avec exactement autant de réponses par {ton, issue} dans MILESTONE_INTERVIEW_QUOTES.");
}
{
  // interviewTranscriptFor : zippe questions/réponses, remplace {opponent},
  // ne plante jamais sur un jalon/ton inconnu (tableau vide plutôt qu'une
  // exception, même contrat que le reste des méthodes "résoudre" de ce
  // fichier).
  const transcript = interviewTranscriptFor("debut-saison", "Agressif", true, "Rennes");
  console.log("\nTranscript début de saison / Agressif / victoire :", transcript);
  if (!Array.isArray(transcript) || transcript.length !== MILESTONE_INTERVIEW_QUESTIONS["debut-saison"].length) {
    throw new Error("❌ interviewTranscriptFor devrait renvoyer exactement un {question, answer} par question du jalon.");
  }
  transcript.forEach((qa, i) => {
    if (qa.question !== MILESTONE_INTERVIEW_QUESTIONS["debut-saison"][i]) throw new Error(`❌ La question ${i} du transcript devrait correspondre à MILESTONE_INTERVIEW_QUESTIONS dans le même ordre.`);
    if (!qa.answer || qa.answer.includes("{opponent}")) throw new Error(`❌ La réponse ${i} devrait être non vide et avoir remplacé {opponent} par le vrai nom de l'adversaire.`);
  });
  if (!transcript.some(qa => qa.answer.includes("Rennes"))) throw new Error("❌ Au moins une réponse (la première, réaction au résultat) devrait mentionner l'adversaire par son nom.");
  console.log("✅ interviewTranscriptFor construit bien le transcript complet, questions dans l'ordre, {opponent} remplacé.");

  const emptyTranscript = interviewTranscriptFor("milestone-inconnu", "Agressif", true, "Rennes");
  if (!Array.isArray(emptyTranscript) || emptyTranscript.length !== 0) throw new Error("❌ interviewTranscriptFor devrait renvoyer un tableau vide (jamais d'exception) pour un jalon inconnu.");
  console.log("✅ interviewTranscriptFor ne plante jamais sur un jalon inconnu (tableau vide).");
}
{
  // Team.resolveInterview expose désormais `quotes` (le transcript complet)
  // en plus de `delta`/`formDelta`, et `quote` (dans moraleHistory) devient
  // les réponses mises bout à bout plutôt qu'une seule phrase.
  const { team, league } = freshTeamAndLeague();
  const opp = league.teams[1];
  simulateOrForfeit(team, opp);
  team.applyMoraleForResult(true, 15, opp.name, 0, T0, "debut-saison");
  const entry = team.pendingInterviews.find(i => i.milestone === "debut-saison");
  const res = team.resolveInterview(entry.id, "Mesuré", T0);
  console.log("\nrésultat resolveInterview (quotes) :", res && res.quotes);
  if (!res || !Array.isArray(res.quotes) || res.quotes.length !== MILESTONE_INTERVIEW_QUESTIONS["debut-saison"].length) {
    throw new Error("❌ Team.resolveInterview devrait exposer `quotes`, le transcript complet {question, answer}[] du jalon résolu.");
  }
  const histEntry = team.moraleHistory.find(e => e.milestone === "debut-saison");
  if (!histEntry || !Array.isArray(histEntry.quotes) || histEntry.quotes.length !== res.quotes.length) {
    throw new Error("❌ moraleHistory devrait porter le même `quotes` (transcript complet) que le résultat de resolveInterview.");
  }
  if (!histEntry.quote || histEntry.quote !== res.quotes.map(q => q.answer).join(" ")) {
    throw new Error("❌ moraleHistory.quote devrait rester les réponses mises bout à bout (compatibilité avec recentInterviewsHtml côté client).");
  }
  console.log("✅ Team.resolveInterview expose bien `quotes` (transcript complet), fixé à l'identique dans moraleHistory, `quote` restant les réponses concaténées.");
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
// Interview de jalon "demi-finale de PO" (retour utilisateur, 2026-09 :
// les play-offs se jouent maintenant match par match, en direct, sur
// plusieurs jours réels, voir League.recordPlayoffGameResult/
// startPlayoffsIfNeeded) : round=null (pas de journée de calendrier
// associée), retrouvée par `milestone` uniquement, playerIds figés au
// moment où la série se termine (pas de la finale), jamais mise en attente
// tant que la série est encore ouverte. Teste directement
// League.recordPlayoffGameResult sur un `league.playoffs` construit à la
// main, pour ne pas dépendre du tirage au sort du classement/seeding : voir
// le test d'intégration juste après pour un vrai déroulé de play-offs.
// ---------------------------------------------------------------------
{
  const { team: humanTeam, league } = freshTeamAndLeague("SemiFinalisteHumain");
  const opp = league.teams[1];
  simulateOrForfeit(humanTeam, opp); // fait jouer les deux rosters, pour que secondsPlayed soit déjà renseigné avant l'instantané
  league.playoffs = {
    seeds: [0, 1, 2, 3],
    round: 99, // arbitraire ici, jamais lu par recordPlayoffGameResult
    series: [
      { idxA: 0, idxB: 1, games: [], winsA: 0, winsB: 0, winner: null, resolved: false },
      { idxA: 2, idxB: 3, games: [{ home: 3, away: 2, scoreHome: 60, scoreAway: 55 }], winsA: 0, winsB: 1, winner: null, resolved: false },
    ],
    finalSeries: null,
    champion: null,
    semiPlayerIds: {},
  };

  // 1re manche de la demi-finale 1 (idx0 gagne à domicile, 1-0) : ne décide
  // rien encore, aucune interview ne doit apparaître.
  league.recordPlayoffGameResult("semi0", 0, 1, 70, 60, T0);
  if (humanTeam.pendingInterviews.some(i => i.milestone === "demi-finale-po")) {
    throw new Error("❌ Aucune interview de demi-finale ne devrait être mise en attente tant que la série n'est pas décidée (1 victoire sur 2).");
  }
  console.log("✅ recordPlayoffGameResult ne met PAS en attente d'interview de demi-finale tant que la série est encore ouverte.");

  // Manche décisive (idx0 gagne à l'extérieur, 2-0) : la série se termine
  // MAINTENANT, l'interview doit être mise en attente à cet instant précis.
  league.recordPlayoffGameResult("semi0", 1, 0, 74, 88, T0);
  const semiEntry = humanTeam.pendingInterviews.find(i => i.milestone === "demi-finale-po");
  if (!semiEntry) throw new Error("❌ recordPlayoffGameResult devrait mettre en attente une interview pour l'équipe humaine qualifiée dès que sa demi-finale est décidée.");
  if (semiEntry.round !== null) throw new Error(`❌ Une interview de demi-finale de PO devrait porter round=null (aucune journée de calendrier), obtenu ${semiEntry.round}.`);
  if (!semiEntry.won) throw new Error("❌ L'équipe humaine (idxA de la série, winner=0) devrait avoir `won=true`.");
  if (semiEntry.scoreDiff !== 88 - 74) throw new Error(`❌ scoreDiff incorrect, obtenu ${semiEntry.scoreDiff}.`);
  if (!Array.isArray(semiEntry.playerIds) || !semiEntry.playerIds.length) throw new Error("❌ playerIds de l'interview de demi-finale devrait reprendre l'instantané des joueurs ayant joué.");
  console.log("✅ recordPlayoffGameResult met bien en attente une interview de jalon 'demi-finale de PO' (round=null, playerIds figés à la demi) dès que la série se décide.");

  const res = league.teams[0].resolveInterview(semiEntry.id, "Mesuré", T0);
  if (!res || !res.ok || typeof res.formDelta !== "number") throw new Error("❌ L'interview de demi-finale de PO devrait se résoudre comme n'importe quelle interview de jalon (effet supporters + joueurs).");
  console.log("✅ L'interview de demi-finale de PO se résout bien avec le même système que les deux autres jalons (effet supporters + joueurs).");

  // ---------------------------------------------------------------------
  // Interview de jalon "finale de PO" (retour utilisateur, 2026-09 : "on
  // peut ajouter un interview post finale de PO, en cas de victoire ou
  // défaite"). Même mécanique que la demi-finale ci-dessus, via la même
  // League._queuePlayoffSeriesInterview, mais SANS snapshot (dernier match
  // de la saison, rien ne resimule ces joueurs après). Complète la série
  // gagnée par l'équipe humaine à l'instant : elle affronte l'autre demi
  // en finale.
  // ---------------------------------------------------------------------
  league.playoffs.finalSeries = { idxA: 0, idxB: 2, games: [], winsA: 0, winsB: 0, winner: null, resolved: false };
  league.recordPlayoffGameResult("final", 0, 2, 80, 70, T0);
  if (humanTeam.pendingInterviews.some(i => i.milestone === "finale-po")) {
    throw new Error("❌ Aucune interview de finale ne devrait être mise en attente tant que la série n'est pas décidée (1 victoire sur 2).");
  }
  league.recordPlayoffGameResult("final", 2, 0, 65, 90, T0);
  const finalEntry = humanTeam.pendingInterviews.find(i => i.milestone === "finale-po");
  if (!finalEntry) throw new Error("❌ recordPlayoffGameResult devrait mettre en attente une interview 'finale-po' pour l'équipe humaine dès que la finale est décidée.");
  if (finalEntry.round !== null) throw new Error(`❌ Une interview de finale de PO devrait porter round=null, obtenu ${finalEntry.round}.`);
  if (!finalEntry.won) throw new Error("❌ L'équipe humaine (idxA de la finale, winner=0) devrait avoir `won=true`.");
  if (league.playoffs.champion !== 0) throw new Error("❌ League.playoffs.champion devrait être l'équipe humaine (idx 0) qui a gagné la finale.");
  const finalRes = league.teams[0].resolveInterview(finalEntry.id, "Agressif", T0);
  if (!finalRes || !finalRes.ok || typeof finalRes.formDelta !== "number") throw new Error("❌ L'interview de finale de PO devrait se résoudre comme n'importe quelle interview de jalon.");
  console.log("✅ recordPlayoffGameResult met bien en attente puis résout une interview de jalon 'finale-po' (victoire ou défaite) dès que la finale se décide, avec champion posé sur League.playoffs.");
}

// ---------------------------------------------------------------------
// Intégration : un vrai déroulé de play-offs (League.runPlayoffsInstantly,
// tour par tour comme le ferait server/autoSim.js:catchUpPlayoffs mais sans
// diffusion en direct) attache bien semiPlayerIds pour les 4
// demi-finalistes (peu importe qui ils sont) et ne plante jamais, qu'une
// équipe humaine se soit qualifiée ou non.
// ---------------------------------------------------------------------
{
  const { league } = freshTeamAndLeague("RealPlayoffIntegration");
  // Saute directement à "saison régulière terminée" (aucun résultat réel ne
  // compte ici, seul le déroulé des play-offs eux-mêmes est testé) : voir
  // League.isRegularSeasonDone/startPlayoffsIfNeeded, qui exigent désormais
  // que la saison régulière soit VRAIMENT finie avant de démarrer les
  // play-offs (retour utilisateur, 2026-09), contrairement à l'ancienne
  // League.runPlayoffs() qui pouvait être appelée à tout moment.
  league.round = league.totalRounds;
  const playoffs = league.runPlayoffsInstantly(T0);
  if (playoffs.champion == null) throw new Error("❌ runPlayoffsInstantly() devrait décider un champion.");
  if (!playoffs.semiPlayerIds) throw new Error("❌ runPlayoffsInstantly() devrait attacher un instantané semiPlayerIds.");
  const [s0, s1] = playoffs.series;
  [s0.idxA, s0.idxB, s1.idxA, s1.idxB].forEach(idx => {
    if (!Array.isArray(playoffs.semiPlayerIds[idx])) throw new Error(`❌ semiPlayerIds devrait contenir une entrée pour le demi-finaliste idx=${idx}.`);
  });
  if (!s0.resolved || !s1.resolved) throw new Error("❌ Les deux demi-finales devraient être résolues une fois les play-offs terminés.");
  if (!playoffs.finalSeries || !playoffs.finalSeries.resolved) throw new Error("❌ La finale devrait être résolue une fois les play-offs terminés.");
  console.log("✅ Un vrai déroulé de League.runPlayoffsInstantly() attache bien semiPlayerIds pour les 4 demi-finalistes, sans jamais lancer d'exception.");

  // Si l'équipe humaine a atteint la finale (aléatoire selon la simulation),
  // elle doit avoir une interview 'finale-po' en attente ; si elle s'est
  // arrêtée en demie, une interview 'demi-finale-po'. Dans tous les cas au
  // moins une entrée de jalon de play-offs doit exister pour elle, preuve
  // que _queuePlayoffSeriesInterview (renommée depuis
  // _queuePlayoffSemiInterview) fonctionne bien de bout en bout via le vrai
  // déroulé, demies ET finale confondues.
  const humanIdx = league.teams.findIndex(t => t.isHuman);
  if (humanIdx === -1) throw new Error("❌ (setup) une équipe humaine devrait exister dans cette ligue.");
  const humanTeam2 = league.teams[humanIdx];
  const reachedFinal = playoffs.finalSeries.idxA === humanIdx || playoffs.finalSeries.idxB === humanIdx;
  const expectedMilestone = reachedFinal ? "finale-po" : "demi-finale-po";
  if (!humanTeam2.pendingInterviews.some(i => i.milestone === expectedMilestone)) {
    throw new Error(`❌ L'équipe humaine (${reachedFinal ? "finaliste" : "éliminée en demie"}) devrait avoir une interview '${expectedMilestone}' en attente après un vrai déroulé de play-offs.`);
  }
  console.log(`✅ L'équipe humaine a bien une interview de jalon '${expectedMilestone}' en attente après un vrai déroulé de play-offs (${reachedFinal ? "allée jusqu'en finale" : "éliminée en demie"}).`);
}

console.log("\n🏁 Tous les tests milestone_interview_and_mvp_test.js sont passés.");
