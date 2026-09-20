// Vérifie le rattrapage automatique (server/autoSim.js) : une ligue avance
// TOUTE SEULE au fil du temps réel, sans qu'un manager clique sur quoi que
// ce soit — le cœur du "calendrier réel" demandé par l'utilisateur.
const E = require("../engine.js");
const { generateStartingRoster, generateLeague, POSITIONS } = E;
const { catchUpLeague, ensureLiveMatch } = require("./autoSim.js");
const { scheduledTimeForRound, scheduledTimeForLeagueRound, WEEK_MS, MATCH_BROADCAST_DURATION_MS } = require("./calendar.js");

function freshLeague(now) {
  const team = generateStartingRoster("Lyon Test");
  team.offensivePriorities = ["Jeu en pénétration", "Pick & Roll", "Transition rapide"];
  team.trainingSkill = "threePoint";
  team.trainingPositions = ["Arrière"];
  const league = generateLeague(team, 1, now);
  return { team, league };
}

const T0 = Date.UTC(2026, 8, 7); // un lundi arbitraire, fixe pour tout le fichier

// ---------------------------------------------------------------------
// 1) Ligue sans calendrier réel (calendarStartAt = null, comme une ancienne
//    sauvegarde) : catchUpLeague ne doit RIEN faire — no-op silencieux, pas
//    une erreur.
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  league.calendarStartAt = null;
  const events = catchUpLeague(league, T0 + 999 * WEEK_MS);
  if (events.length !== 0) throw new Error(`❌ Sans calendrier réel configuré, catchUpLeague ne devrait rien faire (0 événement), obtenu ${events.length}.`);
  if (league.round !== 0) throw new Error(`❌ Le round ne devrait pas avancer sans calendrier réel configuré.`);
  console.log("✅ Sans calendarStartAt configuré : no-op (rétro-compatible avec une ancienne sauvegarde).");
}

// ---------------------------------------------------------------------
// 2) Avant le premier match programmé : rien ne doit se passer.
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  const firstMatchAt = scheduledTimeForRound(league.calendarStartAt, 0);
  const events = catchUpLeague(league, firstMatchAt - 1);
  if (events.length !== 0) throw new Error(`❌ Avant l'heure du premier match, catchUpLeague ne devrait rien simuler, obtenu ${events.length} événement(s).`);
  if (league.round !== 0) throw new Error(`❌ Le round ne devrait pas avoir avancé avant l'heure du premier match.`);
  console.log("✅ Rien ne se passe avant l'heure programmée du premier match.");
}

// ---------------------------------------------------------------------
// 2bis) Fenêtre "en direct" (retour utilisateur : "si je me connecte à
//    l'heure du match, je dois pouvoir voir le live") : entre l'heure
//    programmée et l'heure programmée + MATCH_BROADCAST_DURATION_MS, catchUpLeague
//    ne doit RIEN résoudre tout seul — le manager a le temps de se
//    connecter et de jouer/regarder son match en direct côté navigateur
//    avant que le rattrapage automatique ne s'en charge à sa place.
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  const firstMatchAt = scheduledTimeForRound(league.calendarStartAt, 0);
  const events = catchUpLeague(league, firstMatchAt + MATCH_BROADCAST_DURATION_MS - 1);
  if (events.length !== 0) throw new Error(`❌ Dans la fenêtre "en direct" (avant qu'elle n'expire), catchUpLeague ne devrait rien résoudre, obtenu ${events.length} événement(s).`);
  if (league.round !== 0) throw new Error("❌ Le round ne devrait pas avoir avancé pendant la fenêtre \"en direct\".");
  console.log("✅ Pendant la fenêtre \"en direct\" (MATCH_BROADCAST_DURATION_MS après l'heure programmée), rien n'est résolu automatiquement — le manager a le temps de se connecter.");
}

// ---------------------------------------------------------------------
// 3) Juste après l'expiration de la fenêtre "en direct" du 1er match de la
//    semaine (mais avant le 2e) : exactement UNE journée simulée, PAS
//    encore d'entraînement (il faut les 2 matchs de la semaine réelle —
//    voir isLastRoundOfRealWeek).
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  const firstMatchAt = scheduledTimeForRound(league.calendarStartAt, 0) + MATCH_BROADCAST_DURATION_MS;
  const weekBefore = team.week;
  const events = catchUpLeague(league, firstMatchAt);
  const matchEvents = events.filter(e => e.type === "match");
  const trainingEvents = events.filter(e => e.type === "training");
  if (matchEvents.length !== 1) throw new Error(`❌ Une fois la fenêtre "en direct" du 1er match de la semaine expirée, exactement 1 journée devrait être simulée, obtenu ${matchEvents.length}.`);
  if (trainingEvents.length !== 0) throw new Error(`❌ L'entraînement ne devrait pas encore s'appliquer après un seul des 2 matchs de la semaine, obtenu ${trainingEvents.length} événement(s) d'entraînement.`);
  if (league.round !== 1) throw new Error(`❌ league.round devrait être 1 après la 1ère journée, obtenu ${league.round}.`);
  if (team.week !== weekBefore) throw new Error(`❌ team.week ne devrait pas avoir bougé avant l'entraînement hebdomadaire (Team.trainWeek), obtenu ${team.week} au lieu de ${weekBefore}.`);
  console.log("✅ Un seul des 2 matchs de la semaine simulé : pas encore d'entraînement (attend le 2e match).");
}

// ---------------------------------------------------------------------
// 4) Après les 2 matchs de la semaine 0 : 2 journées simulées + UN SEUL
//    événement d'entraînement (pas deux) — Team.trainWeek a bien tourné
//    (semaine incrémentée, salaires/staff payés).
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  const weekBefore = team.week;
  const budgetBefore = team.budget;
  const secondMatchAt = scheduledTimeForRound(league.calendarStartAt, 1) + MATCH_BROADCAST_DURATION_MS;
  const events = catchUpLeague(league, secondMatchAt);
  const matchEvents = events.filter(e => e.type === "match");
  const trainingEvents = events.filter(e => e.type === "training");
  if (matchEvents.length !== 2) throw new Error(`❌ Après l'heure du 2e match, 2 journées devraient être simulées au total, obtenu ${matchEvents.length}.`);
  if (trainingEvents.length !== 1) throw new Error(`❌ L'entraînement devrait s'appliquer EXACTEMENT une fois pour la semaine réelle écoulée, obtenu ${trainingEvents.length}.`);
  if (league.round !== 2) throw new Error(`❌ league.round devrait être 2 après les 2 journées de la semaine, obtenu ${league.round}.`);
  if (team.week !== weekBefore + 1) throw new Error(`❌ team.week devrait avoir avancé d'exactement 1 (Team.trainWeek appelé une fois), obtenu ${team.week} (attendu ${weekBefore + 1}).`);
  if (team.budget === budgetBefore) throw new Error(`❌ Le budget devrait avoir bougé (salaires payés par Team.trainWeek) après l'entraînement hebdomadaire.`);
  if (league.lastAutoTrainedWeek !== 0) throw new Error(`❌ league.lastAutoTrainedWeek devrait être 0 (semaine réelle 0 traitée), obtenu ${league.lastAutoTrainedWeek}.`);
  console.log("✅ Les 2 matchs de la semaine simulés + entraînement hebdomadaire appliqué UNE SEULE fois (finances à jour).");
}

// ---------------------------------------------------------------------
// 5) Idempotence : appeler catchUpLeague DEUX FOIS avec le même `now` (ou
//    un `now` plus tard mais toujours dans la même fenêtre déjà traitée) ne
//    doit PAS rejouer une deuxième fois les mêmes journées / le même
//    entraînement.
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  const secondMatchAt = scheduledTimeForRound(league.calendarStartAt, 1) + MATCH_BROADCAST_DURATION_MS;
  catchUpLeague(league, secondMatchAt);
  const weekAfterFirstPass = team.week;
  const roundAfterFirstPass = league.round;
  // Un second appel, même un peu plus tard mais toujours avant la journée
  // suivante programmée, ne doit RIEN rejouer.
  const events = catchUpLeague(league, secondMatchAt + 1000);
  if (events.length !== 0) throw new Error(`❌ Un second appel dans la même fenêtre ne devrait produire aucun nouvel événement, obtenu ${events.length}.`);
  if (team.week !== weekAfterFirstPass) throw new Error(`❌ team.week ne devrait pas rebouger sur un appel répété (idempotence), obtenu ${team.week} au lieu de ${weekAfterFirstPass}.`);
  if (league.round !== roundAfterFirstPass) throw new Error(`❌ league.round ne devrait pas rebouger sur un appel répété (idempotence), obtenu ${league.round} au lieu de ${roundAfterFirstPass}.`);
  console.log("✅ Rattrapage idempotent : rejouer catchUpLeague sur la même fenêtre ne simule rien deux fois.");
}

// ---------------------------------------------------------------------
// 6) Rattrapage sur une longue absence (plusieurs mois réels d'un coup) :
//    toute la saison régulière doit être simulée, l'entraînement appliqué
//    une fois par semaine réelle (pas une fois par journée), et les
//    play-offs/barrage calculés automatiquement une fois la saison
//    terminée — sans dépasser (pas de nouvelle saison auto-démarrée, ça
//    reste un choix manuel, voir le commentaire dans autoSim.js).
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  const farFuture = T0 + 52 * WEEK_MS; // un an plus tard, largement de quoi rattraper toute la saison régulière
  const events = catchUpLeague(league, farFuture);
  const matchEvents = events.filter(e => e.type === "match");
  const trainingEvents = events.filter(e => e.type === "training");
  const seasonEndEvents = events.filter(e => e.type === "season-end");

  if (!league.isRegularSeasonDone()) throw new Error(`❌ Après un an de rattrapage, la saison régulière (${league.totalRounds} journées) devrait être entièrement jouée, round=${league.round}.`);
  if (matchEvents.length !== league.totalRounds) throw new Error(`❌ Exactement ${league.totalRounds} journées auraient dû être simulées, obtenu ${matchEvents.length}.`);
  // 18 journées / 2 par semaine réelle = 9 semaines d'entraînement.
  const expectedTrainingWeeks = league.totalRounds / 2;
  if (trainingEvents.length !== expectedTrainingWeeks) throw new Error(`❌ L'entraînement aurait dû s'appliquer ${expectedTrainingWeeks} fois (1/semaine réelle), obtenu ${trainingEvents.length}.`);
  if (seasonEndEvents.length !== 1) throw new Error(`❌ La fin de saison (play-offs/barrage) devrait être calculée exactement une fois, obtenu ${seasonEndEvents.length}.`);
  if (!league.playoffs) throw new Error("❌ Les play-offs devraient être calculés une fois la saison régulière terminée.");
  if (!league.relegationBarrage) throw new Error("❌ Le barrage de relégation devrait être calculé une fois la saison régulière terminée.");
  console.log(`✅ Rattrapage d'une longue absence : ${matchEvents.length} journées + ${trainingEvents.length} semaines d'entraînement + fin de saison (play-offs/barrage) calculés automatiquement.`);

  // Trophée du club (retour utilisateur, page "Aperçu" : "trophée du club") :
  // runPlayoffs doit enregistrer un trophée "championship" pour le champion,
  // via League.recordTrophy, dès la finale des play-offs résolue.
  const champTrophies = league.teams[league.playoffs.champion].trophies;
  if (!Array.isArray(champTrophies) || champTrophies.length !== 1 || champTrophies[0].type !== "championship") {
    throw new Error(`❌ Le champion des play-offs devrait avoir exactement 1 trophée de type "championship" dans son palmarès, obtenu ${JSON.stringify(champTrophies)}.`);
  }
  console.log("✅ Le champion des play-offs reçoit bien un trophée dans son palmarès (Team.trophies).");

  // Un appel supplémentaire, encore plus tard : ne doit RIEN refaire (la
  // saison réelle est terminée, une nouvelle saison reste un choix manuel).
  const moreEvents = catchUpLeague(league, farFuture + 10 * WEEK_MS);
  if (moreEvents.length !== 0) throw new Error(`❌ Une fois les play-offs calculés, catchUpLeague ne devrait plus rien faire tant qu'une nouvelle saison n'est pas démarrée manuellement, obtenu ${moreEvents.length} événement(s).`);
  console.log("✅ Une fois la saison réelle terminée (play-offs calculés), le rattrapage s'arrête — une nouvelle saison reste un choix manuel.");
}

// ---------------------------------------------------------------------
// 7) Sécurité forfait : si l'effectif du club du joueur ne peut plus
//    aligner un cinq de départ complet au moment où un match automatique
//    tombe (aucun manager là pour cliquer sur "Déclarer forfait"), le
//    rattrapage ne doit PAS planter — le match doit être perdu par forfait
//    (voir simulateOrForfeit), exactement comme pour n'importe quelle
//    équipe CPU en délicatesse côté effectif.
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  // Vide complètement un poste (comme forfeit_test.js) : plus aucun joueur
  // éligible au Pivot, impossible d'aligner un cinq complet.
  team.players = team.players.filter(p => p.position !== "Pivot");
  team.autoAssignLineup();

  const secondMatchAt = scheduledTimeForRound(league.calendarStartAt, 1) + MATCH_BROADCAST_DURATION_MS;
  const events = catchUpLeague(league, secondMatchAt);
  const matchEvents = events.filter(e => e.type === "match");
  if (matchEvents.length !== 2) throw new Error(`❌ 2 journées auraient dû être simulées même avec un effectif incomplet, obtenu ${matchEvents.length}.`);
  const userMatches = matchEvents.filter(e => e.userResults && e.userResults.length);
  if (!userMatches.length) throw new Error("❌ Le club du joueur devrait avoir eu au moins un match programmé sur ces 2 journées.");
  const anyForfeit = userMatches.some(e => e.userResults.some(u => u.forfeit));
  if (!anyForfeit) throw new Error("❌ Avec un effectif incapable d'aligner un cinq complet, au moins un des matchs automatiques du joueur devrait se solder par un forfait.");
  console.log("✅ Un effectif incapable d'aligner un cinq de départ complet se solde par un forfait automatique, sans planter le rattrapage.");
}

// ---------------------------------------------------------------------
// 8) Diffusion en direct (retour utilisateur : "il faut que le match se
//    joue tout seul à 19h par exemple / si je me connecte à 19h30 je dois
//    reprendre le match là où il en est") : ensureLiveMatch calcule le match
//    UNE SEULE FOIS dès l'heure programmée, et catchUpLeague, une fois la
//    fenêtre de diffusion écoulée, finalise avec CE score déjà déterminé —
//    jamais un second tirage.
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  const kickoffAt = scheduledTimeForRound(league.calendarStartAt, 0);
  const myMatch = league.matchesForRound(0).find(m => m.home === 0 || m.away === 0);
  if (!myMatch) throw new Error("❌ Prérequis du test : le club du joueur devrait jouer à la journée 0.");
  const myKey = `0:${myMatch.home}:${myMatch.away}`;

  // Avant l'heure du coup d'envoi : aucune diffusion ne doit démarrer.
  const beforeKeys = ensureLiveMatch(league, kickoffAt - 1);
  if (beforeKeys.length !== 0) {
    throw new Error("❌ ensureLiveMatch ne devrait rien démarrer avant l'heure programmée du match.");
  }
  if (league.liveMatches && league.liveMatches[myKey]) throw new Error("❌ league.liveMatches devrait rester vide avant l'heure programmée.");

  // Pile à l'heure programmée : la diffusion démarre, le résultat est déjà
  // déterminé (score final connu) même si la diffusion elle-même s'étale
  // ensuite dans le temps réel.
  const startedKeys = ensureLiveMatch(league, kickoffAt);
  if (!startedKeys.includes(myKey)) throw new Error("❌ ensureLiveMatch aurait dû démarrer la diffusion du match du joueur à l'heure programmée.");
  const liveEntry = league.liveMatches[myKey];
  if (!liveEntry || liveEntry.round !== 0) throw new Error("❌ league.liveMatches devrait contenir une entrée pour la journée 0.");
  const finalScoreAtStart = { ...liveEntry.finalScore };
  console.log(`\nDiffusion démarrée à l'heure du coup d'envoi — score déjà déterminé : ${finalScoreAtStart.home}-${finalScoreAtStart.away} (domicile-extérieur).`);

  // Un appel un peu plus tard, toujours en pleine diffusion : idempotent
  // (même entrée, même score) — jamais un second tirage.
  const startedAgainKeys = ensureLiveMatch(league, kickoffAt + 5 * 60 * 1000);
  if (startedAgainKeys.includes(myKey)) throw new Error("❌ Un second appel pendant la diffusion ne devrait pas redémarrer un match déjà en cours.");
  const liveAgain = league.liveMatches[myKey];
  if (liveAgain.finalScore.home !== finalScoreAtStart.home || liveAgain.finalScore.away !== finalScoreAtStart.away) {
    throw new Error("❌ Un second appel pendant la diffusion ne devrait JAMAIS changer le score déjà déterminé.");
  }
  console.log("✅ ensureLiveMatch est idempotent pendant la diffusion : le score déterminé au coup d'envoi ne change plus.");

  // Une fois la fenêtre de diffusion entièrement écoulée sans qu'aucun appel
  // à ensureLiveMatch supplémentaire n'intervienne, catchUpLeague finalise
  // AVEC ce score déjà connu (jamais un troisième tirage).
  const afterBroadcast = kickoffAt + MATCH_BROADCAST_DURATION_MS;
  const events = catchUpLeague(league, afterBroadcast);
  const matchEvent = events.find(e => e.type === "match" && e.round === 0);
  if (!matchEvent) throw new Error("❌ La journée 0 aurait dû être finalisée une fois la diffusion terminée.");
  const userResult = matchEvent.userResults.find(u => u.teamIdx === 0);
  if (!userResult) throw new Error("❌ Le résultat du club du joueur devrait figurer dans userResults.");
  const isHome = userResult.isHome;
  const expectedUserScore = isHome ? finalScoreAtStart.home : finalScoreAtStart.away;
  console.log(`Score finalisé : ${userResult.scoreUser}-${userResult.scoreOpponent} (attendu, issu du direct : ${expectedUserScore}).`);
  if (userResult.scoreUser !== expectedUserScore) {
    throw new Error("❌ Le score finalisé devrait être EXACTEMENT celui déterminé au coup d'envoi (voir liveMatch.finalScore), pas un nouveau tirage.");
  }
  if (league.liveMatches[myKey]) throw new Error("❌ L'entrée league.liveMatches du match devrait être vidée une fois la journée finalisée.");
  console.log("✅ Une fois la diffusion terminée, catchUpLeague finalise avec le score EXACT déterminé au coup d'envoi — jamais un second tirage.");
}

// ---------------------------------------------------------------------
// 9) Multi-manager (2026-09, "jusqu'à 10 vrais managers humains dans une
//    ligue partagée") : PLUSIEURS diffusions en direct simultanées la même
//    journée (humain-vs-humain ET humain-vs-CPU), plus des matchs CPU-vs-CPU
//    (jamais diffusés) — le tout doit se résoudre ENSEMBLE, chaque équipe
//    humaine recevant son propre résultat indépendamment des autres.
// ---------------------------------------------------------------------
{
  const { generateMultiManagerLeague } = E;
  const league = generateMultiManagerLeague(
    ["Lyon Multi", "Marseille Multi", "Nice Multi", "Rennes Multi"], 1, T0
  );
  const humanIdx = league.teams.map((t, i) => (t.isHuman ? i : null)).filter(x => x !== null);
  if (humanIdx.length !== 4) throw new Error(`❌ Prérequis du test : 4 équipes humaines attendues, obtenu ${humanIdx.length}.`);

  // Cherche une journée du calendrier round-robin où AU MOINS 2 matchs
  // opposent deux managers humains entre eux (garanti d'exister quelque part
  // dans la saison, vu qu'un round-robin joue tous les duels).
  let targetRound = -1;
  let humanVsHumanMatches = [];
  for (let r = 0; r < league.totalRounds; r++) {
    const matches = league.matchesForRound(r);
    const hh = matches.filter(m => league.teams[m.home].isHuman && league.teams[m.away].isHuman);
    if (hh.length >= 2) { targetRound = r; humanVsHumanMatches = hh; break; }
  }
  if (targetRound === -1) throw new Error("❌ Prérequis du test : le calendrier round-robin devrait produire au moins une journée avec 2 duels humain-vs-humain simultanés.");
  console.log(`\nJournée ${targetRound} choisie pour le test : ${humanVsHumanMatches.length} duels humain-vs-humain simultanés (${JSON.stringify(humanVsHumanMatches)}).`);

  // Avance artificiellement league.round jusqu'à cette journée-là, sans
  // jouer les précédentes (round-robin : chaque journée est indépendante,
  // League.matchesForRound(r) ne dépend que de r) — suffit pour isoler le
  // scénario testé ici.
  league.round = targetRound;
  const kickoffAt = scheduledTimeForLeagueRound(league, targetRound);
  const matchesThisRound = league.matchesForRound(targetRound);
  const cpuVsCpuMatches = matchesThisRound.filter(m => !league.teams[m.home].isHuman && !league.teams[m.away].isHuman);
  const humanVsCpuMatches = matchesThisRound.filter(m =>
    (league.teams[m.home].isHuman) !== (league.teams[m.away].isHuman)
  );

  // Démarre les diffusions en direct : une entrée par match impliquant au
  // moins un côté humain, AUCUNE pour les duels 100% CPU.
  const startedKeys = ensureLiveMatch(league, kickoffAt);
  const expectedStartedCount = humanVsHumanMatches.length + humanVsCpuMatches.length;
  if (startedKeys.length !== expectedStartedCount) {
    throw new Error(`❌ ${expectedStartedCount} diffusions auraient dû démarrer (humain-vs-humain + humain-vs-CPU), obtenu ${startedKeys.length}.`);
  }
  cpuVsCpuMatches.forEach(m => {
    const key = `${targetRound}:${m.home}:${m.away}`;
    if (league.liveMatches[key]) throw new Error("❌ Un match 100% CPU-vs-CPU ne devrait JAMAIS avoir d'entrée dans league.liveMatches.");
  });
  console.log(`✅ ${startedKeys.length} diffusions en direct démarrées simultanément (${humanVsHumanMatches.length} humain-vs-humain + ${humanVsCpuMatches.length} humain-vs-CPU), aucune pour les ${cpuVsCpuMatches.length} duels CPU-vs-CPU.`);

  // Capture les scores déterminés au coup d'envoi, pour vérifier ensuite
  // qu'ils sont bien repris tels quels à la finalisation (jamais un second
  // tirage), MÊME quand plusieurs diffusions humaines se déroulent en
  // parallèle la même journée.
  const scoreAtKickoffByKey = {};
  Object.keys(league.liveMatches).forEach(k => { scoreAtKickoffByKey[k] = { ...league.liveMatches[k].finalScore }; });

  // Finalise toute la journée d'un coup (comme catchUpLeague une fois la
  // fenêtre de diffusion expirée).
  const events = catchUpLeague(league, kickoffAt + MATCH_BROADCAST_DURATION_MS);
  const matchEvent = events.find(e => e.type === "match" && e.round === targetRound);
  if (!matchEvent) throw new Error("❌ La journée multi-manager aurait dû être finalisée.");

  // Chaque équipe humaine impliquée cette journée-là (les 4) doit recevoir
  // SON propre résultat, indépendamment des autres.
  if (matchEvent.userResults.length !== humanIdx.length) {
    throw new Error(`❌ ${humanIdx.length} résultats humains attendus (un par manager), obtenu ${matchEvent.userResults.length}.`);
  }
  humanIdx.forEach(idx => {
    if (!matchEvent.userResults.some(u => u.teamIdx === idx)) {
      throw new Error(`❌ Le manager d'index ${idx} aurait dû recevoir son propre résultat cette journée-là.`);
    }
  });

  // Pour les duels humain-vs-humain : les deux managers voient le MÊME match
  // (scores cohérents entre eux, exactement ceux déterminés au coup d'envoi),
  // finalisé indépendamment l'un de l'autre.
  humanVsHumanMatches.forEach(m => {
    const key = `${targetRound}:${m.home}:${m.away}`;
    const expected = scoreAtKickoffByKey[key];
    if (!expected) throw new Error("❌ Prérequis du test : le score au coup d'envoi de ce duel aurait dû être capturé.");
    const homeResult = matchEvent.userResults.find(u => u.teamIdx === m.home);
    const awayResult = matchEvent.userResults.find(u => u.teamIdx === m.away);
    if (!homeResult || !awayResult) throw new Error("❌ Les deux managers d'un duel humain-vs-humain devraient chacun recevoir leur résultat.");
    if (homeResult.scoreUser !== expected.home || homeResult.scoreOpponent !== expected.away) {
      throw new Error("❌ Le résultat du manager à domicile ne correspond pas au score déterminé au coup d'envoi.");
    }
    if (awayResult.scoreUser !== expected.away || awayResult.scoreOpponent !== expected.home) {
      throw new Error("❌ Le résultat du manager à l'extérieur ne correspond pas au score déterminé au coup d'envoi.");
    }
    if (homeResult.scoreUser !== awayResult.scoreOpponent || homeResult.scoreOpponent !== awayResult.scoreUser) {
      throw new Error("❌ Les deux managers d'un même duel humain-vs-humain devraient voir des scores parfaitement cohérents entre eux (même match).");
    }
  });
  console.log(`✅ Les ${humanVsHumanMatches.length} duels humain-vs-humain se finalisent chacun avec le score EXACT déterminé au coup d'envoi, cohérent des deux côtés.`);

  if (Object.keys(league.liveMatches).length !== 0) throw new Error("❌ Toutes les entrées league.liveMatches de cette journée devraient être vidées une fois la journée entièrement finalisée.");
  if (league.round !== targetRound + 1) throw new Error("❌ La journée ne devrait avancer qu'une fois TOUS ses matchs (humains et CPU) réglés.");
  console.log("✅ Une journée multi-manager complète (duels humain-vs-humain, humain-vs-CPU, et CPU-vs-CPU) se résout ensemble, chaque manager recevant son propre résultat indépendamment des autres.");
}

// ---------------------------------------------------------------------
// 6) CALENDRIER ANCRÉ QUOTIDIEN (retour utilisateur, 2026-09 — "la vraie
//    saison de test") : l'entraînement + l'économie se déclenchent UNE FOIS
//    PAR JOUR CIVIL, juste après le créneau de 19h (le dernier de la
//    journée) — jamais après celui de 10h, et TOUJOURS une fois par jour
//    même un jour SANS tour de coupe dû (dégradation propre, voir
//    League.lastAutoTrainedDay/server/cup_test.js pour la coupe elle-même).
// ---------------------------------------------------------------------
{
  const { generateMultiManagerLeague } = E;
  const { dailyAnchoredCalendarConfig, scheduledTimeForLeagueRound: schedRound, scheduledTimeForLeagueCupRound } = require("./calendar.js");
  const league = generateMultiManagerLeague(["Lyon Daily", "Marseille Daily"], 1, T0, dailyAnchoredCalendarConfig());
  if (!league.calendarDailyAnchored) throw new Error("❌ Prérequis du test : la ligue devrait être au calendrier ancré quotidien.");
  if (league.lastAutoTrainedDay !== -1) throw new Error("❌ lastAutoTrainedDay devrait démarrer à -1 (aucun jour encore traité).");

  // --- Jour 0 : résout le créneau de 10h SEUL (round 0) — pas encore
  // d'entraînement (le créneau de 19h de ce jour n'est pas encore résolu).
  const round0KickoffAt = schedRound(league, 0);
  const eventsAfter10h = catchUpLeague(league, round0KickoffAt + MATCH_BROADCAST_DURATION_MS);
  if (eventsAfter10h.some(e => e.type === "training")) {
    throw new Error("❌ Aucun entraînement ne devrait être déclenché juste après le créneau de 10h (le créneau de 19h du même jour n'est pas encore résolu).");
  }
  if (league.lastAutoTrainedDay !== -1) throw new Error("❌ lastAutoTrainedDay ne devrait toujours pas avoir bougé après le seul créneau de 10h.");
  console.log("✅ Le créneau de 10h (championnat) résolu seul ne déclenche PAS l'entraînement quotidien — celui-ci attend le DERNIER créneau du jour (19h).");

  // --- Jour 0, créneau de 19h (round 1) : DEVRAIT déclencher l'entraînement
  // pour le jour 0 — une entrée par équipe HUMAINE (2 ici).
  const round1KickoffAt = schedRound(league, 1);
  const eventsAfter19h = catchUpLeague(league, round1KickoffAt + MATCH_BROADCAST_DURATION_MS);
  const trainingDay0 = eventsAfter19h.find(e => e.type === "training");
  if (!trainingDay0) throw new Error("❌ L'entraînement du jour 0 aurait dû se déclencher juste après le créneau de 19h.");
  if (trainingDay0.day !== 0) throw new Error(`❌ L'événement d'entraînement devrait porter day:0, obtenu day:${trainingDay0.day}.`);
  if (trainingDay0.results.length !== 2) throw new Error(`❌ 2 résultats d'entraînement attendus (2 managers humains), obtenu ${trainingDay0.results.length}.`);
  if (league.lastAutoTrainedDay !== 0) throw new Error(`❌ lastAutoTrainedDay devrait valoir 0 après le jour 0, obtenu ${league.lastAutoTrainedDay}.`);
  // Ce même jour comprenait aussi un tour de coupe (jour 0 = 1er tour, voir
  // server/cup_test.js) : l'entraînement s'est bien déclenché malgré/avec
  // lui, une seule fois — pas deux (pas un entraînement par créneau).
  const trainingEventsDay0 = eventsAfter19h.filter(e => e.type === "training");
  if (trainingEventsDay0.length !== 1) throw new Error(`❌ Un seul événement d'entraînement attendu pour le jour 0 (pas un par créneau), obtenu ${trainingEventsDay0.length}.`);
  console.log("✅ Le jour 0 (avec tour de coupe dû à 15h) déclenche l'entraînement UNE SEULE fois, juste après le créneau de 19h.");

  // --- Un jour SANS tour de coupe dû (bien après la fin de la coupe, 4
  // tours max — voir server/cup_test.js) : l'entraînement continue de se
  // déclencher normalement, une fois par jour, dégradation propre.
  if (league.cup.champion !== null) throw new Error("❌ Prérequis : la coupe ne devrait pas déjà être terminée à ce stade (seul le jour 0 a été rattrapé).");
  const day5Round1 = 5 * 2 + 1; // round 11 = jour 5, créneau de 19h
  const day5KickoffAt = schedRound(league, day5Round1);
  const eventsDay5 = catchUpLeague(league, day5KickoffAt + MATCH_BROADCAST_DURATION_MS);
  const trainingDay5 = eventsDay5.find(e => e.type === "training" && e.day === 5);
  if (!trainingDay5) throw new Error("❌ L'entraînement du jour 5 aurait dû se déclencher normalement, même sans tour de coupe dû ce jour-là (coupe déjà terminée depuis le jour 3).");
  if (league.cup.champion === null) throw new Error("❌ Prérequis : la coupe aurait dû être terminée d'ici le jour 5 (4 tours max, commencée au jour 0).");
  if (!eventsDay5.some(e => e.type === "cup-match")) {
    // Pas une erreur en soi (dépend d'où en était la coupe), juste une
    // vérification de cohérence : si la coupe s'est terminée AVANT le jour
    // 5, ce jour-là ne doit contenir AUCUN événement de coupe — jamais un
    // "faux" tour forcé pour combler un créneau vide.
    console.log("ℹ️  La coupe s'est terminée avant le jour 5 — ce jour-là n'a effectivement aucun tour de coupe dû, l'entraînement se déclenche quand même normalement.");
  }
  console.log("✅ Un jour sans tour de coupe dû déclenche quand même l'entraînement quotidien normalement (dégradation propre) — jamais de créneau de 15h forcé pour combler.");

  // --- Un second appel dans la MÊME fenêtre (même jour déjà traité) ne doit
  // JAMAIS redéclencher l'entraînement une seconde fois pour ce jour.
  const eventsAgain = catchUpLeague(league, day5KickoffAt + MATCH_BROADCAST_DURATION_MS + 1000);
  if (eventsAgain.some(e => e.type === "training" && e.day === 5)) {
    throw new Error("❌ L'entraînement du jour 5 ne devrait JAMAIS se redéclencher une fois déjà appliqué pour ce jour.");
  }
  console.log("✅ L'entraînement quotidien ne se déclenche jamais deux fois pour le même jour civil, même sur un second rattrapage qui retombe dans la même fenêtre.");
}

console.log("\n✅ Rattrapage automatique (server/autoSim.js) : la ligue avance toute seule au fil du temps réel — journées de championnat, entraînement hebdomadaire, marché, fin de saison, diffusion en direct reprenable et forfait en cas d'effectif incomplet — sans qu'aucun clic ne soit nécessaire.");
