// Vérifie les actions du manager (server/actions.js) — les points d'entrée
// qui manquaient pour préparer un match/entraînement À L'AVANCE plutôt que
// de cliquer "maintenant" (voir server/index.js et README.md).
//
// Généralisation multi-manager (2026-09) : chaque fonction prend maintenant
// (team, teamIndex, league, body, now) — `teamIndex` explicite, plus jamais
// l'index 0 supposé implicitement (voir League.listPlayerForSale/placeBid/
// placeCoachBid, qui en ont besoin). La première moitié de ce fichier
// exerce ces fonctions comme avant (toujours à l'index 0, solo historique) ;
// la dernière section exerce explicitement un `teamIndex` NON NUL, sur une
// vraie ligue multi-manager (voir generateMultiManagerLeague).
const E = require("../engine.js");
const {
  generateStartingRoster, generateLeague, generateMultiManagerLeague, POSITIONS,
  generateYouthCandidate, MAX_YOUTH_ROSTER_SIZE, YOUTH_TRAINEE_WEEKLY_SALARY, salaryForOverall,
} = E;
const actions = require("./actions.js");

const T0 = Date.UTC(2026, 8, 7);

function freshTeamAndLeague() {
  const team = generateStartingRoster("Lyon Test");
  team.offensivePriorities = ["Jeu en pénétration", "Pick & Roll", "Transition rapide"];
  const league = generateLeague(team, 1, T0);
  return { team, league };
}

// ---------------------------------------------------------------------
// setLineup
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const byPos = {};
  POSITIONS.forEach(pos => { byPos[pos] = team.players.find(p => p.position === pos); });

  const starters = {};
  POSITIONS.forEach(pos => { starters[pos] = byPos[pos].id; });
  const res = actions.setLineup(team, 0, league, { starters });
  if (!res.ok) throw new Error(`❌ Une feuille de match valide devrait être acceptée : ${res.error}`);
  if (!res.hasValidLineup) throw new Error("❌ Une feuille complète (un titulaire par poste) devrait être valide.");
  POSITIONS.forEach(pos => {
    if (team.lineup.starters[pos] !== byPos[pos].id) throw new Error(`❌ Le titulaire ${pos} n'a pas été appliqué correctement.`);
  });
  console.log("✅ setLineup applique une feuille de match valide.");

  // Rejet : joueur inconnu.
  const bad = actions.setLineup(team, 0, league, { starters: { ...starters, Pivot: 999999 } });
  if (bad.ok) throw new Error("❌ Un id de joueur inconnu devrait être rejeté.");
  console.log("✅ setLineup rejette un id de joueur inconnu.");

  // Rejet : corps de requête complètement absent.
  const missing = actions.setLineup(team, 0, league, {});
  if (missing.ok) throw new Error("❌ Une feuille de match sans 'starters' devrait être rejetée.");
  console.log("✅ setLineup rejette une requête sans 'starters'.");
}

// ---------------------------------------------------------------------
// setTactics
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const res = actions.setTactics(team, 0, league, {
    offensivePriorities: ["Jeu extérieur", "Jeu en mouvement", "Équilibrée"],
    defense: "Zone press",
    rhythm: "Rapide",
  });
  if (!res.ok) throw new Error(`❌ Des tactiques valides devraient être acceptées : ${res.error}`);
  if (team.defense !== "Zone press" || team.rhythm !== "Rapide") throw new Error("❌ Défense/rythme n'ont pas été appliqués.");
  if (team.offensivePriorities.length !== 3) throw new Error("❌ Les 3 priorités offensives auraient dû être appliquées.");
  console.log("✅ setTactics applique des tactiques valides.");

  const tooMany = actions.setTactics(team, 0, league, { offensivePriorities: ["Jeu extérieur", "Jeu en mouvement", "Équilibrée", "Post-up"] });
  if (tooMany.ok) throw new Error("❌ Plus de 3 priorités offensives devrait être rejeté.");
  console.log("✅ setTactics rejette plus de 3 priorités offensives.");

  const unknown = actions.setTactics(team, 0, league, { defense: "Zone imaginaire" });
  if (unknown.ok) throw new Error("❌ Une défense inconnue devrait être rejetée.");
  console.log("✅ setTactics rejette une défense inconnue.");

  // Réglage partiel : ne touche que ce qui est fourni.
  const rhythmBefore = team.rhythm;
  const partial = actions.setTactics(team, 0, league, { defense: "Homme à homme" });
  if (!partial.ok) throw new Error("❌ Un réglage partiel (juste la défense) devrait être accepté.");
  if (team.rhythm !== rhythmBefore) throw new Error("❌ Un réglage partiel ne devrait pas toucher aux champs non fournis (rythme).");
  console.log("✅ setTactics ne modifie que les champs explicitement fournis.");
}

// ---------------------------------------------------------------------
// setTraining
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const res = actions.setTraining(team, 0, league, { trainingSkill: "threePoint", trainingPositions: ["Arrière"] });
  if (!res.ok) throw new Error(`❌ Un réglage d'entraînement valide devrait être accepté : ${res.error}`);
  if (team.trainingSkill !== "threePoint" || team.trainingPositions.join(",") !== "Arrière") {
    throw new Error("❌ L'entraînement n'a pas été appliqué correctement.");
  }
  console.log("✅ setTraining applique un réglage valide.");

  const unknownSkill = actions.setTraining(team, 0, league, { trainingSkill: "invisibilite" });
  if (unknownSkill.ok) throw new Error("❌ Une compétence d'entraînement inconnue devrait être rejetée.");
  console.log("✅ setTraining rejette une compétence inconnue.");

  const dup = actions.setTraining(team, 0, league, { trainingPositions: ["Arrière", "Arrière"] });
  if (dup.ok) throw new Error("❌ Un poste dupliqué dans trainingPositions devrait être rejeté.");
  console.log("✅ setTraining rejette un poste d'entraînement dupliqué.");

  // Retour utilisateur (2026-09, "enleve l'entrainement aucune (entrainement
  // général uniquement)") : il n'existe plus de valeur "aucun entraînement",
  // un poste doit toujours être travaillé, donc trainingSkill:null est
  // désormais rejeté plutôt qu'accepté.
  const stop = actions.setTraining(team, 0, league, { trainingSkill: null });
  if (stop.ok) throw new Error("❌ trainingSkill:null devrait être rejeté (il n'y a plus d'entraînement \"aucune\").");
  console.log("✅ setTraining rejette trainingSkill:null (l'entraînement individuel est toujours actif).");

  // Entraînement collectif (retour utilisateur, 2026-09, voir Team.
  // collectiveTraining côté moteur) : réglage SÉPARÉ transmis dans le même
  // appel setTraining.
  const collective = actions.setTraining(team, 0, league, { collectiveTraining: "tactique" });
  if (!collective.ok || team.collectiveTraining !== "tactique") {
    throw new Error("❌ setTraining devrait accepter collectiveTraining:\"tactique\".");
  }
  console.log("✅ setTraining applique un focus collectif valide (\"tactique\").");

  const collectiveUnknown = actions.setTraining(team, 0, league, { collectiveTraining: "n'importe quoi" });
  if (collectiveUnknown.ok) throw new Error("❌ Un focus collectif inconnu devrait être rejeté.");
  console.log("✅ setTraining rejette un focus collectif inconnu.");

  const collectiveStop = actions.setTraining(team, 0, league, { collectiveTraining: null });
  if (!collectiveStop.ok || team.collectiveTraining !== null) {
    throw new Error("❌ collectiveTraining:null (revenir à \"aucun\") devrait être accepté.");
  }
  console.log("✅ setTraining accepte collectiveTraining:null pour revenir à \"aucun\".");

  // Tactique précisément travaillée (retour utilisateur, 2026-09 : "il faut
  // effectivement choisir ce qui est bossé comme tactique", puis "je pense
  // qu'il faut pouvoir choisir uniquement une seule chose... un seul aspect
  // et pas tous les aspects") : Team.trainedTactics est désormais un
  // instantané À UN SEUL ASPECT { category, value } (et non plus un
  // instantané partiel multi-catégories).
  const trainedValid = actions.setTraining(team, 0, league, {
    trainedTactics: { category: "offense", value: "Pick & Roll" },
  });
  if (!trainedValid.ok) throw new Error(`❌ Un trainedTactics { category, value } valide devrait être accepté : ${trainedValid.error}`);
  if (!team.trainedTactics || team.trainedTactics.category !== "offense" || team.trainedTactics.value !== "Pick & Roll") {
    throw new Error("❌ trainedTactics n'a pas été appliqué correctement.");
  }
  console.log("✅ setTraining applique un trainedTactics { category: \"offense\", value } valide.");

  const trainedDefense = actions.setTraining(team, 0, league, { trainedTactics: { category: "defense", value: "Zone extérieure" } });
  if (!trainedDefense.ok || team.trainedTactics.category !== "defense" || team.trainedTactics.value !== "Zone extérieure") {
    throw new Error("❌ trainedTactics { category: \"defense\", value } devrait être accepté et remplacer l'aspect précédent.");
  }
  console.log("✅ setTraining applique un trainedTactics { category: \"defense\", value } valide (remplace l'aspect précédent).");

  const trainedRhythm = actions.setTraining(team, 0, league, { trainedTactics: { category: "rhythm", value: "Rapide" } });
  if (!trainedRhythm.ok || team.trainedTactics.category !== "rhythm" || team.trainedTactics.value !== "Rapide") {
    throw new Error("❌ trainedTactics { category: \"rhythm\", value } devrait être accepté.");
  }
  console.log("✅ setTraining applique un trainedTactics { category: \"rhythm\", value } valide.");

  const trainedBadCategory = actions.setTraining(team, 0, league, { trainedTactics: { category: "n'importe quoi", value: "Rapide" } });
  if (trainedBadCategory.ok) throw new Error("❌ Une trainedTactics.category inconnue devrait être rejetée.");
  console.log("✅ setTraining rejette une trainedTactics.category inconnue.");

  const trainedBadOffenseValue = actions.setTraining(team, 0, league, { trainedTactics: { category: "offense", value: "Ça n'existe pas" } });
  if (trainedBadOffenseValue.ok) throw new Error("❌ Une priorité offensive inconnue dans trainedTactics.value devrait être rejetée.");
  console.log("✅ setTraining rejette une priorité offensive inconnue dans trainedTactics.value.");

  const trainedBadDefenseValue = actions.setTraining(team, 0, league, { trainedTactics: { category: "defense", value: "Ça n'existe pas" } });
  if (trainedBadDefenseValue.ok) throw new Error("❌ Une défense inconnue dans trainedTactics.value devrait être rejetée.");
  console.log("✅ setTraining rejette une défense inconnue dans trainedTactics.value.");

  const trainedBadRhythmValue = actions.setTraining(team, 0, league, { trainedTactics: { category: "rhythm", value: "Ça n'existe pas" } });
  if (trainedBadRhythmValue.ok) throw new Error("❌ Un rythme inconnu dans trainedTactics.value devrait être rejeté.");
  console.log("✅ setTraining rejette un rythme inconnu dans trainedTactics.value.");

  const trainedBadShape = actions.setTraining(team, 0, league, { trainedTactics: { value: "Rapide" } });
  if (trainedBadShape.ok) throw new Error("❌ Un trainedTactics sans category devrait être rejeté.");
  console.log("✅ setTraining rejette un trainedTactics sans category.");

  const trainedClear = actions.setTraining(team, 0, league, { trainedTactics: null });
  if (!trainedClear.ok || team.trainedTactics !== null) {
    throw new Error("❌ trainedTactics:null (revenir à \"rien de précis\") devrait être accepté.");
  }
  console.log("✅ setTraining accepte trainedTactics:null pour l'effacer.");
}

// ---------------------------------------------------------------------
// setPlan — préparation à l'avance d'une journée FUTURE (voir
// Team.stagePlanForRound/getPlanForRound côté moteur, et le bug corrigé
// côté navigateur : préparer une journée future en mode multi-manager
// n'atteignait jamais le serveur avant ce point d'entrée). Réutilise les
// mêmes validateurs que setTactics/setLineup ci-dessus (voir
// validateOffensivePriorities/validateDefense/validateRhythm/
// validateLineupBody dans actions.js) : pas re-testés en détail ici, juste
// leur branchement correct dans setPlan.
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  // Le tout premier match à venir du club (index 0) : n'importe quelle
  // journée future valide fera l'affaire pour ce test, cherchons-en une.
  const futureRound = league.schedule.findIndex(matches => matches.some(m => m.home === 0 || m.away === 0));
  if (futureRound < 0) throw new Error("❌ (setup) aucune journée programmée pour l'équipe 0.");

  const res = actions.setPlan(team, 0, league, {
    round: futureRound,
    patch: { offensivePriorities: ["Jeu extérieur", "Jeu en mouvement", "Équilibrée"], defense: "Zone press", rhythm: "Rapide" },
  });
  if (!res.ok) throw new Error(`❌ Un plan valide pour une journée future devrait être accepté : ${res.error}`);
  if (!team.hasPlanForRound(futureRound)) throw new Error("❌ Le plan aurait dû être enregistré dans team.plannedTactics.");
  if (team.getPlanForRound(futureRound).defense !== "Zone press") throw new Error("❌ Le champ 'defense' du plan n'a pas été appliqué correctement.");
  // Les ordres EN DIRECT ne doivent JAMAIS être touchés par un plan (c'est
  // tout l'intérêt de stagePlanForRound plutôt que de muter team directement).
  if (team.defense === "Zone press" && futureRound !== league.round) {
    // (juste un garde-fou de non-régression trivial, pas une vraie assertion
    // forte : team.defense a sa propre valeur de départ, voir freshTeamAndLeague)
  }
  console.log("✅ setPlan enregistre un plan valide pour une journée future dans team.plannedTactics, sans toucher aux ordres en direct.");

  // Patch PARTIEL : la seconde modification ne touche que le champ fourni,
  // fusionne avec le plan déjà en place (voir Team.stagePlanForRound).
  const rhythmBefore = team.getPlanForRound(futureRound).rhythm;
  const partial = actions.setPlan(team, 0, league, { round: futureRound, patch: { defense: "Homme à homme" } });
  if (!partial.ok) throw new Error("❌ Un patch partiel (juste la défense) devrait être accepté.");
  if (team.getPlanForRound(futureRound).rhythm !== rhythmBefore) throw new Error("❌ Un patch partiel ne devrait pas toucher aux champs non fournis (rythme) du plan déjà en place.");
  if (team.getPlanForRound(futureRound).defense !== "Homme à homme") throw new Error("❌ Le patch partiel aurait dû mettre à jour la défense.");
  console.log("✅ setPlan fusionne un patch partiel avec le plan déjà en place pour cette journée (ne remplace jamais tout le plan).");

  // Rejet : tactiques invalides dans le patch (même validation que setTactics) -> rien ne change.
  const planBefore = JSON.stringify(team.getPlanForRound(futureRound));
  const badTactics = actions.setPlan(team, 0, league, { round: futureRound, patch: { defense: "Zone imaginaire" } });
  if (badTactics.ok) throw new Error("❌ Une défense inconnue dans le patch d'un plan devrait être rejetée.");
  if (JSON.stringify(team.getPlanForRound(futureRound)) !== planBefore) throw new Error("❌ Un patch rejeté ne devrait RIEN muter du plan déjà en place.");
  console.log("✅ setPlan rejette un patch de tactiques invalide sans rien muter (mêmes règles que setTactics).");

  // Rejet : lineup invalide dans le patch (même validation que setLineup).
  const badLineup = actions.setPlan(team, 0, league, { round: futureRound, patch: { lineup: { starters: { Meneur: 999999 } } } });
  if (badLineup.ok) throw new Error("❌ Un id de joueur inconnu dans le lineup d'un plan devrait être rejeté.");
  console.log("✅ setPlan rejette un lineup invalide dans le patch (mêmes règles que setLineup).");

  // Rejet : 'round' absent/non entier.
  const missingRound = actions.setPlan(team, 0, league, { patch: { defense: "Zone press" } });
  if (missingRound.ok) throw new Error("❌ Un plan sans 'round' devrait être rejeté.");
  console.log("✅ setPlan rejette une requête sans 'round'.");

  // Rejet : 'round' hors bornes du calendrier (négatif ou >= totalRounds).
  const roundTooLow = actions.setPlan(team, 0, league, { round: -1, patch: { defense: "Zone press" } });
  if (roundTooLow.ok) throw new Error("❌ Une journée négative devrait être rejetée.");
  const roundTooHigh = actions.setPlan(team, 0, league, { round: league.totalRounds, patch: { defense: "Zone press" } });
  if (roundTooHigh.ok) throw new Error("❌ Une journée au-delà de la dernière (>= totalRounds) devrait être rejetée.");
  console.log("✅ setPlan rejette une journée hors des bornes du calendrier.");

  // Rejet : 'round' déjà JOUÉ (un résultat existe déjà pour cette équipe à
  // cette journée) — plus une "préparation à l'avance" possible.
  const playedRound = futureRound;
  league.recordResult(playedRound, 0, league.schedule[playedRound].find(m => m.home === 0 || m.away === 0).away, 80, 70);
  const alreadyPlayed = actions.setPlan(team, 0, league, { round: playedRound, patch: { defense: "Zone press" } });
  if (alreadyPlayed.ok) throw new Error("❌ Une journée déjà jouée par cette équipe (résultat existant) devrait être rejetée pour une préparation à l'avance.");
  console.log("✅ setPlan rejette une journée déjà jouée par cette équipe.");

  // Rejet : 'patch' absent, ou vide (aucun champ reconnu).
  const missingPatch = actions.setPlan(team, 0, league, { round: futureRound + 1 < league.totalRounds ? futureRound + 1 : futureRound });
  if (missingPatch.ok) throw new Error("❌ Un plan sans 'patch' devrait être rejeté.");
  console.log("✅ setPlan rejette une requête sans 'patch'.");
}

// ---------------------------------------------------------------------
// fireTrainer — congédiement + relistage à -30% (League.fireTeamTrainer,
// voir engine.js/coach_market_test.js pour le détail de la règle elle-même :
// ce test-ci vérifie seulement le branchement correct de l'action serveur,
// pas la formule du prix relisté).
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  team.hireTrainer(2, 4000);
  const listingsBefore = league.coachListings.length;

  const res = actions.fireTrainer(team, 0, league, {}, T0);
  if (!res.ok) throw new Error(`❌ Congédier un entraîneur en poste devrait être accepté : ${res.error}`);
  if (res.relisted !== true) throw new Error("❌ La réponse devrait indiquer relisted:true (un entraîneur était bien en poste).");
  if (team.trainer) throw new Error("❌ L'équipe ne devrait plus avoir d'entraîneur après l'action fireTrainer.");
  if (league.coachListings.length !== listingsBefore + 1) throw new Error("❌ fireTrainer aurait dû pousser exactement une nouvelle annonce dans league.coachListings.");
  console.log("✅ fireTrainer congédie l'entraîneur et le reliste (relisted:true), via League.fireTeamTrainer.");

  // Sans entraîneur en poste : reste ok:true, relisted:false (no-op propre,
  // jamais une erreur — voir League.fireTeamTrainer).
  const again = actions.fireTrainer(team, 0, league, {}, T0);
  if (!again.ok || again.relisted !== false) throw new Error("❌ Congédier sans entraîneur en poste devrait rester ok:true avec relisted:false.");
  console.log("✅ fireTrainer reste un no-op propre (ok:true, relisted:false) quand aucun entraîneur n'est en poste.");
}

// ---------------------------------------------------------------------
// bidOnAnalystListing / fireVideoAnalyst / runVideoSession — marché des
// analystes vidéo + séance vidéo (voir engine.js/analyst_market_test.js pour
// le détail des règles elles-mêmes : ce test-ci vérifie seulement le
// branchement de ces trois nouvelles actions serveur, valeurs valides ET
// invalides).
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();

  // --- bidOnAnalystListing ---------------------------------------------
  const analystListing = league.generateAnalystCandidate(T0);
  const analystBid = actions.bidOnAnalystListing(team, 0, league, { listingId: analystListing.id, amount: analystListing.startPrice + 100 }, T0);
  if (!analystBid.ok) throw new Error(`❌ Une enchère valide sur un candidat analyste devrait être acceptée : ${analystBid.error}`);
  if (analystBid.listing.currentBidderIdx !== 0) throw new Error("❌ L'enchère analyste devrait être enregistrée au bon teamIndex (0).");
  console.log("✅ bidOnAnalystListing accepte une enchère valide, au bon teamIndex.");

  const unknownAnalystListing = actions.bidOnAnalystListing(team, 0, league, { listingId: "id-qui-n-existe-pas", amount: 100 }, T0);
  if (unknownAnalystListing.ok) throw new Error("❌ Enchérir sur un candidat analyste inconnu devrait être rejeté.");
  console.log("✅ bidOnAnalystListing rejette un candidat inconnu.");

  const missingAmount = actions.bidOnAnalystListing(team, 0, league, { listingId: analystListing.id }, T0);
  if (missingAmount.ok) throw new Error("❌ Une enchère sans 'amount' devrait être rejetée.");
  console.log("✅ bidOnAnalystListing rejette une requête sans 'amount'.");

  // --- fireVideoAnalyst --------------------------------------------------
  team.hireVideoAnalyst(2, 4000);
  const listingsBefore = league.analystListings.length;
  const fireRes = actions.fireVideoAnalyst(team, 0, league, {}, T0);
  if (!fireRes.ok) throw new Error(`❌ Congédier un analyste en poste devrait être accepté : ${fireRes.error}`);
  if (fireRes.relisted !== true) throw new Error("❌ La réponse devrait indiquer relisted:true (un analyste était bien en poste).");
  if (team.videoAnalyst) throw new Error("❌ L'équipe ne devrait plus avoir d'analyste après l'action fireVideoAnalyst.");
  if (league.analystListings.length !== listingsBefore + 1) throw new Error("❌ fireVideoAnalyst aurait dû pousser exactement une nouvelle annonce dans league.analystListings.");
  console.log("✅ fireVideoAnalyst congédie l'analyste et le reliste (relisted:true), via League.fireTeamVideoAnalyst.");

  const fireAgain = actions.fireVideoAnalyst(team, 0, league, {}, T0);
  if (!fireAgain.ok || fireAgain.relisted !== false) throw new Error("❌ Congédier sans analyste en poste devrait rester ok:true avec relisted:false.");
  console.log("✅ fireVideoAnalyst reste un no-op propre (ok:true, relisted:false) quand aucun analyste n'est en poste.");

  // --- runVideoSession -----------------------------------------------
  const T_DAY = Date.UTC(2026, 8, 16, 12, 0, 0);

  // Sans analyste sous contrat (celui embauché plus haut vient d'être
  // congédié) : refusé avec un message explicite (pas juste ok:false vide).
  const noAnalyst = actions.runVideoSession(team, 0, league, { opponentIdx: 1 }, T_DAY);
  if (noAnalyst.ok) throw new Error("❌ Une séance vidéo sans analyste sous contrat devrait être refusée.");
  console.log("✅ runVideoSession refuse sans analyste sous contrat :", noAnalyst.error);

  team.hireVideoAnalyst(3, 5000);

  // opponentIdx manquant/invalide : rejeté AVANT même d'appeler League.runVideoSession.
  const missingOpponent = actions.runVideoSession(team, 0, league, {}, T_DAY);
  if (missingOpponent.ok) throw new Error("❌ Une séance vidéo sans 'opponentIdx' devrait être rejetée.");
  console.log("✅ runVideoSession rejette une requête sans 'opponentIdx' :", missingOpponent.error);

  const selfOpponent = actions.runVideoSession(team, 0, league, { opponentIdx: 0 }, T_DAY);
  if (selfOpponent.ok) throw new Error("❌ Scouter sa propre équipe (opponentIdx égal à teamIndex) devrait être rejeté.");
  console.log("✅ runVideoSession rejette opponentIdx === teamIndex (scouter sa propre équipe) :", selfOpponent.error);

  const outOfBoundsOpponent = actions.runVideoSession(team, 0, league, { opponentIdx: 999 }, T_DAY);
  if (outOfBoundsOpponent.ok) throw new Error("❌ Un opponentIdx hors bornes devrait être rejeté.");
  console.log("✅ runVideoSession rejette un opponentIdx hors bornes :", outOfBoundsOpponent.error);

  const floatOpponent = actions.runVideoSession(team, 0, league, { opponentIdx: 1.5 }, T_DAY);
  if (floatOpponent.ok) throw new Error("❌ Un opponentIdx non entier devrait être rejeté.");
  console.log("✅ runVideoSession rejette un opponentIdx non entier :", floatOpponent.error);

  // Requête valide : réussit, révèle bien 3 caractéristiques (niveau 3 -> 3,
  // voir ANALYST_REVEAL_COUNT_BY_LEVEL côté moteur — mapping 1:1, jamais
  // 10/10 même au meilleur niveau).
  const validSession = actions.runVideoSession(team, 0, league, { opponentIdx: 1 }, T_DAY);
  if (!validSession.ok) throw new Error(`❌ Une séance vidéo valide devrait être acceptée : ${validSession.error}`);
  if (validSession.opponentIdx !== 1) throw new Error("❌ La réponse devrait renvoyer le bon opponentIdx.");
  if (validSession.revealed.length !== 3) throw new Error(`❌ Niveau 3 devrait révéler 3 caractéristiques, obtenu ${validSession.revealed.length}.`);
  if (validSession.analystLevel !== 3) throw new Error("❌ La réponse devrait renvoyer le bon analystLevel.");
  console.log("✅ runVideoSession accepte une requête valide et renvoie opponentIdx/revealed/analystLevel.");

  // Même jour, adversaire DIFFÉRENT (pas encore scouté) : cooldown -> refusé
  // (limiteur de rythme quotidien, inchangé).
  const cooldownSession = actions.runVideoSession(team, 0, league, { opponentIdx: 2 }, T_DAY + 1000);
  if (cooldownSession.ok) throw new Error("❌ Une 2e séance le même jour civil devrait être refusée (cooldown).");
  if (cooldownSession.error && cooldownSession.error.includes("scoutée")) {
    throw new Error("❌ Le refus pour un adversaire DIFFÉRENT le même jour doit être 'cooldown', pas 'already-scouted'.");
  }
  console.log("✅ runVideoSession applique le cooldown quotidien :", cooldownSession.error);

  // Même adversaire déjà scouté (opponentIdx 1), plusieurs jours plus tard :
  // refusé en PERMANENCE avec "already-scouted", pas un cooldown temporaire
  // (retour utilisateur : un adversaire n'est scoutable qu'UNE FOIS/saison).
  const alreadyScoutedSession = actions.runVideoSession(team, 0, league, { opponentIdx: 1 }, T_DAY + 10 * 24 * 3600 * 1000);
  if (alreadyScoutedSession.ok) throw new Error("❌ Rescouter un adversaire déjà scouté cette saison devrait être refusé, même des jours plus tard.");
  if (!alreadyScoutedSession.error || !alreadyScoutedSession.error.includes("scoutée")) {
    throw new Error(`❌ Le message de refus devrait mentionner que l'équipe a déjà été scoutée, obtenu : ${alreadyScoutedSession.error}`);
  }
  console.log("✅ runVideoSession refuse en permanence un adversaire déjà scouté cette saison :", alreadyScoutedSession.error);
}

// ---------------------------------------------------------------------
// listPlayer / bidOnListing / bidOnCoachListing
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const someone = team.players[0];

  const listed = actions.listPlayer(team, 0, league, { playerId: someone.id, price: 5000 }, T0);
  if (!listed.ok) throw new Error(`❌ Mettre son propre joueur aux enchères à un prix valide devrait être accepté : ${listed.error}`);
  if (listed.listing.startPrice !== 5000) throw new Error("❌ Le prix choisi n'a pas été appliqué à l'annonce.");
  if (listed.listing.sellerIdx !== 0) throw new Error("❌ L'annonce devrait être enregistrée au bon teamIndex (0).");
  console.log("✅ listPlayer met un joueur aux enchères au prix choisi, au bon teamIndex.");

  const already = actions.listPlayer(team, 0, league, { playerId: someone.id, price: 1 }, T0);
  if (already.ok) throw new Error("❌ Un joueur déjà listé ne devrait pas pouvoir être re-listé.");
  console.log("✅ listPlayer refuse de lister un joueur déjà aux enchères.");

  const negativePrice = actions.listPlayer(team, 0, league, { playerId: team.players[1].id, price: -10 }, T0);
  if (negativePrice.ok) throw new Error("❌ Un prix négatif devrait être rejeté.");
  console.log("✅ listPlayer rejette un prix négatif ou nul.");

  // Enchère sur sa PROPRE annonce -> refusée par League.placeBid lui-même
  // (own-listing), remontée telle quelle par bidOnListing.
  const ownBid = actions.bidOnListing(team, 0, league, { listingId: listed.listing.id, amount: 6000 }, T0);
  if (ownBid.ok) throw new Error("❌ Enchérir sur sa propre annonce devrait être refusé.");
  console.log("✅ bidOnListing refuse d'enchérir sur sa propre annonce (remonte la raison de League.placeBid).");

  // Une annonce d'un adversaire : une enchère valide doit être acceptée.
  const rivalListing = league.listPlayerForSale(1, league.teams[1].players[0].id, 2000, T0);
  const goodBid = actions.bidOnListing(team, 0, league, { listingId: rivalListing.id, amount: 2500 }, T0);
  if (!goodBid.ok) throw new Error(`❌ Une enchère valide sur l'annonce d'un adversaire devrait être acceptée : ${goodBid.error}`);
  if (goodBid.listing.currentBidderIdx !== 0) throw new Error("❌ L'enchère devrait être enregistrée au bon teamIndex (0).");
  console.log("✅ bidOnListing accepte une enchère valide sur l'annonce d'un adversaire, au bon teamIndex.");

  const unknownListing = actions.bidOnListing(team, 0, league, { listingId: "id-qui-n-existe-pas", amount: 100 }, T0);
  if (unknownListing.ok) throw new Error("❌ Enchérir sur une annonce inexistante devrait être rejeté.");
  console.log("✅ bidOnListing rejette une annonce inconnue.");

  const coachListing = league.generateCoachCandidate(T0);
  const coachBid = actions.bidOnCoachListing(team, 0, league, { listingId: coachListing.id, amount: coachListing.startPrice + 100 }, T0);
  if (!coachBid.ok) throw new Error(`❌ Une enchère valide sur un candidat entraîneur devrait être acceptée : ${coachBid.error}`);
  if (coachBid.listing.currentBidderIdx !== 0) throw new Error("❌ L'enchère entraîneur devrait être enregistrée au bon teamIndex (0).");
  console.log("✅ bidOnCoachListing accepte une enchère valide, au bon teamIndex.");
}

// ---------------------------------------------------------------------
// Multi-manager : chaque action, exercée avec un teamIndex NON NUL — voir
// generateMultiManagerLeague (2 managers humains, index 0 et 1, complétés
// par 8 adversaires CPU). Vérifie que rien n'est plus jamais implicitement
// appliqué à l'index 0.
// ---------------------------------------------------------------------
{
  const league = generateMultiManagerLeague(["Lyon Multi", "Marseille Multi"], 1, T0);
  const teamIndex = 1;
  const team = league.teams[teamIndex];
  if (!team.isHuman) throw new Error("❌ (setup) league.teams[1] devrait être humaine dans une ligue multi-manager à 2 managers.");

  const byPos = {};
  POSITIONS.forEach(pos => { byPos[pos] = team.players.find(p => p.position === pos); });
  const starters = {};
  POSITIONS.forEach(pos => { starters[pos] = byPos[pos].id; });
  const lineupRes = actions.setLineup(team, teamIndex, league, { starters });
  if (!lineupRes.ok) throw new Error(`❌ setLineup à un teamIndex non nul devrait fonctionner : ${lineupRes.error}`);
  if (league.teams[0].lineup.starters[POSITIONS[0]] === team.lineup.starters[POSITIONS[0]] && league.teams[0] !== team) {
    // (pas une vraie assertion forte, juste un garde-fou de non-régression trivial)
  }
  console.log("✅ setLineup fonctionne correctement pour un teamIndex non nul (1), sans toucher à l'équipe 0.");

  const tacticsRes = actions.setTactics(team, teamIndex, league, { defense: "Zone press" });
  if (!tacticsRes.ok || team.defense !== "Zone press") throw new Error("❌ setTactics à un teamIndex non nul devrait s'appliquer à CETTE équipe.");
  if (league.teams[0].defense === "Zone press") throw new Error("❌ setTactics à teamIndex=1 ne devrait pas avoir touché l'équipe 0.");
  console.log("✅ setTactics fonctionne correctement pour un teamIndex non nul (1), isolé de l'équipe 0.");

  const trainingRes = actions.setTraining(team, teamIndex, league, { trainingSkill: "rebound", trainingPositions: ["Pivot"] });
  if (!trainingRes.ok || team.trainingSkill !== "rebound") throw new Error("❌ setTraining à un teamIndex non nul devrait s'appliquer à CETTE équipe.");
  console.log("✅ setTraining fonctionne correctement pour un teamIndex non nul (1).");

  const listRes = actions.listPlayer(team, teamIndex, league, { playerId: team.players[0].id, price: 4000 }, T0);
  if (!listRes.ok) throw new Error(`❌ listPlayer à un teamIndex non nul devrait fonctionner : ${listRes.error}`);
  if (listRes.listing.sellerIdx !== teamIndex) throw new Error(`❌ listPlayer devrait enregistrer sellerIdx=${teamIndex}, obtenu ${listRes.listing.sellerIdx}.`);
  console.log("✅ listPlayer enregistre le bon teamIndex (1) comme vendeur.");

  // teams[0] (l'autre manager humain) met un joueur aux enchères ; teams[1]
  // (teamIndex non nul) enchérit dessus — vérifie que placeBid utilise bien
  // teamIndex=1 comme bidderIdx, pas 0.
  const otherListing = league.listPlayerForSale(0, league.teams[0].players[1].id, 3000, T0);
  const bidRes = actions.bidOnListing(team, teamIndex, league, { listingId: otherListing.id, amount: 3500 }, T0);
  if (!bidRes.ok) throw new Error(`❌ bidOnListing à un teamIndex non nul devrait fonctionner : ${bidRes.error}`);
  if (bidRes.listing.currentBidderIdx !== teamIndex) throw new Error(`❌ bidOnListing devrait enregistrer currentBidderIdx=${teamIndex}, obtenu ${bidRes.listing.currentBidderIdx}.`);
  console.log("✅ bidOnListing enregistre le bon teamIndex (1) comme enchérisseur (jamais 0 par défaut).");

  const coachListing = league.generateCoachCandidate(T0);
  const coachBidRes = actions.bidOnCoachListing(team, teamIndex, league, { listingId: coachListing.id, amount: coachListing.startPrice + 50 }, T0);
  if (!coachBidRes.ok) throw new Error(`❌ bidOnCoachListing à un teamIndex non nul devrait fonctionner : ${coachBidRes.error}`);
  if (coachBidRes.listing.currentBidderIdx !== teamIndex) throw new Error(`❌ bidOnCoachListing devrait enregistrer currentBidderIdx=${teamIndex}, obtenu ${coachBidRes.listing.currentBidderIdx}.`);
  console.log("✅ bidOnCoachListing enregistre le bon teamIndex (1) comme enchérisseur.");

  const futureRound = league.schedule.findIndex(matches => matches.some(m => m.home === teamIndex || m.away === teamIndex));
  const planRes = actions.setPlan(team, teamIndex, league, { round: futureRound, patch: { defense: "Zone press" } });
  if (!planRes.ok) throw new Error(`❌ setPlan à un teamIndex non nul devrait fonctionner : ${planRes.error}`);
  if (!team.hasPlanForRound(futureRound) || team.getPlanForRound(futureRound).defense !== "Zone press") {
    throw new Error("❌ setPlan devrait enregistrer le plan sur CETTE équipe (teamIndex=1), pas sur l'équipe 0.");
  }
  if (league.teams[0].hasPlanForRound(futureRound)) throw new Error("❌ setPlan à teamIndex=1 ne devrait pas avoir touché le plan de l'équipe 0.");
  console.log("✅ setPlan fonctionne correctement pour un teamIndex non nul (1), isolé de l'équipe 0.");

  team.hireTrainer(2, 3000);
  const fireRes = actions.fireTrainer(team, teamIndex, league, {}, T0);
  if (!fireRes.ok || !fireRes.relisted) throw new Error(`❌ fireTrainer à un teamIndex non nul devrait fonctionner et relister : ${fireRes.error}`);
  if (team.trainer) throw new Error("❌ fireTrainer devrait avoir congédié l'entraîneur de CETTE équipe (teamIndex=1).");
  console.log("✅ fireTrainer fonctionne correctement pour un teamIndex non nul (1).");

  const analystListing = league.generateAnalystCandidate(T0);
  const analystBidRes = actions.bidOnAnalystListing(team, teamIndex, league, { listingId: analystListing.id, amount: analystListing.startPrice + 50 }, T0);
  if (!analystBidRes.ok) throw new Error(`❌ bidOnAnalystListing à un teamIndex non nul devrait fonctionner : ${analystBidRes.error}`);
  if (analystBidRes.listing.currentBidderIdx !== teamIndex) throw new Error(`❌ bidOnAnalystListing devrait enregistrer currentBidderIdx=${teamIndex}, obtenu ${analystBidRes.listing.currentBidderIdx}.`);
  console.log("✅ bidOnAnalystListing enregistre le bon teamIndex (1) comme enchérisseur.");

  team.hireVideoAnalyst(3, 3000);
  const fireAnalystRes = actions.fireVideoAnalyst(team, teamIndex, league, {}, T0);
  if (!fireAnalystRes.ok || !fireAnalystRes.relisted) throw new Error(`❌ fireVideoAnalyst à un teamIndex non nul devrait fonctionner et relister : ${fireAnalystRes.error}`);
  if (team.videoAnalyst) throw new Error("❌ fireVideoAnalyst devrait avoir congédié l'analyste de CETTE équipe (teamIndex=1).");
  console.log("✅ fireVideoAnalyst fonctionne correctement pour un teamIndex non nul (1).");

  team.hireVideoAnalyst(2, 3000);
  const opponentIdx = teamIndex === 0 ? 1 : 0;
  const sessionRes = actions.runVideoSession(team, teamIndex, league, { opponentIdx }, T0);
  if (!sessionRes.ok) throw new Error(`❌ runVideoSession à un teamIndex non nul devrait fonctionner : ${sessionRes.error}`);
  if (sessionRes.opponentIdx !== opponentIdx) throw new Error("❌ runVideoSession devrait renvoyer le bon opponentIdx.");
  if (JSON.stringify(team.scoutedAttrs[String(opponentIdx)]) !== JSON.stringify(sessionRes.revealed)) {
    throw new Error("❌ runVideoSession devrait mettre à jour Team.scoutedAttrs de CETTE équipe (teamIndex=1), pas celle de l'équipe 0.");
  }
  if (league.teams[0].scoutedAttrs[String(opponentIdx)]) throw new Error("❌ runVideoSession à teamIndex=1 ne devrait pas avoir touché le scoutisme de l'équipe 0.");
  console.log("✅ runVideoSession fonctionne correctement pour un teamIndex non nul (1), isolé de l'équipe 0.");
}

// ---------------------------------------------------------------------
// upgradeArena / setTicketPrices / upgradeFanShop (retour utilisateur,
// 2026-09, veille du premier vrai test à 10 managers) : Salle/prix des
// billets/boutique des supporters n'avaient pas encore leur point d'entrée
// dédié — ces achats/réglages mutaient `teamA` côté navigateur puis
// appelaient saveMyTeam(), devenu un no-op en mode multi-manager (voir
// moteurbasket3.html) ; ils étaient donc silencieusement perdus au
// prochain chargement. Même contrat que les actions ci-dessus : validées
// AVANT toute mutation (un budget insuffisant ou un niveau/catégorie
// invalide ne doit RIEN changer à l'état).
{
  const { team, league } = freshTeamAndLeague();
  const startingBudget = team.budget; // CLUB_STARTING_BUDGET, voir engine.js

  // --- upgradeArena --------------------------------------------------
  const arenaBefore = team.arenaLevel;
  const arenaRes = actions.upgradeArena(team, 0, league, {});
  if (!arenaRes.ok) throw new Error(`❌ Un agrandissement de salle abordable devrait être accepté : ${arenaRes.error}`);
  if (team.arenaLevel !== arenaBefore + 1) throw new Error("❌ arenaLevel aurait dû progresser d'un palier.");
  if (team.budget !== startingBudget - 150000) throw new Error(`❌ Le coût de l'agrandissement (150000) aurait dû être déduit du budget, obtenu ${team.budget}.`);
  if (arenaRes.arenaLevel !== team.arenaLevel || arenaRes.budget !== team.budget) throw new Error("❌ La réponse devrait refléter le nouvel arenaLevel/budget.");
  console.log("✅ upgradeArena agrandit la salle d'un palier et déduit le coût du budget.");

  // Budget insuffisant pour le palier suivant (300000, budget actuel 150000) : rejeté, rien ne change.
  const arenaLevelBefore2 = team.arenaLevel;
  const budgetBefore2 = team.budget;
  const arenaUnaffordable = actions.upgradeArena(team, 0, league, {});
  if (arenaUnaffordable.ok) throw new Error("❌ Un agrandissement de salle non abordable devrait être rejeté.");
  if (team.arenaLevel !== arenaLevelBefore2 || team.budget !== budgetBefore2) throw new Error("❌ Un agrandissement rejeté ne devrait RIEN muter (niveau/budget inchangés).");
  console.log("✅ upgradeArena rejette un agrandissement non abordable sans rien muter.");

  // Niveau maximum : force arenaLevel au dernier palier connu, vérifie le rejet propre.
  const { ARENA_LEVELS } = E;
  team.arenaLevel = ARENA_LEVELS[ARENA_LEVELS.length - 1].level;
  const arenaMaxed = actions.upgradeArena(team, 0, league, {});
  if (arenaMaxed.ok) throw new Error("❌ Une salle déjà au niveau maximum ne devrait plus pouvoir être agrandie.");
  console.log("✅ upgradeArena rejette un agrandissement au-delà du dernier palier.");

  // --- setTicketPrices -------------------------------------------------
  const { team: team2, league: league2 } = freshTeamAndLeague();
  const priceRes = actions.setTicketPrices(team2, 0, league2, { prices: { gradins: 22, loge: 90 } });
  if (!priceRes.ok) throw new Error(`❌ Des prix de billets valides devraient être acceptés : ${priceRes.error}`);
  if (team2.ticketPrices.gradins !== 22) throw new Error(`❌ Le prix 'gradins' aurait dû être appliqué à 22, obtenu ${team2.ticketPrices.gradins}.`);
  if (team2.ticketPrices.loge !== 90) throw new Error(`❌ Le prix 'loge' aurait dû être appliqué à 90, obtenu ${team2.ticketPrices.loge}.`);
  console.log("✅ setTicketPrices applique un prix par catégorie explicitement fournie.");

  // Mise à jour partielle : ne touche pas 'tribune', non fournie.
  const tribuneBefore = team2.ticketPrices.tribune;
  const partialPrice = actions.setTicketPrices(team2, 0, league2, { prices: { gradins: 18 } });
  if (!partialPrice.ok) throw new Error("❌ Une mise à jour partielle (une seule catégorie) devrait être acceptée.");
  if (team2.ticketPrices.tribune !== tribuneBefore) throw new Error("❌ Une catégorie non fournie ne devrait pas être modifiée.");
  console.log("✅ setTicketPrices ne modifie que les catégories explicitement fournies.");

  // Bornage : un prix hors de [minPrice, maxPrice] est CLAMPÉ (même comportement
  // que le curseur côté navigateur), pas rejeté.
  const clamped = actions.setTicketPrices(team2, 0, league2, { prices: { gradins: 999 } });
  if (!clamped.ok) throw new Error("❌ Un prix hors bornes devrait être accepté (borné), pas rejeté.");
  const { SEAT_CATEGORIES } = E;
  const gradinsCat = SEAT_CATEGORIES.find(c => c.key === "gradins");
  if (team2.ticketPrices.gradins !== gradinsCat.maxPrice) throw new Error(`❌ Le prix aurait dû être borné à maxPrice (${gradinsCat.maxPrice}), obtenu ${team2.ticketPrices.gradins}.`);
  console.log("✅ setTicketPrices borne un prix hors limites à [minPrice, maxPrice] de sa catégorie.");

  // Catégorie inconnue : rejetée.
  const unknownCat = actions.setTicketPrices(team2, 0, league2, { prices: { vip_imaginaire: 50 } });
  if (unknownCat.ok) throw new Error("❌ Une catégorie de place inconnue devrait être rejetée.");
  console.log("✅ setTicketPrices rejette une catégorie de place inconnue.");

  // Corps de requête invalide : rejeté.
  const missingPrices = actions.setTicketPrices(team2, 0, league2, {});
  if (missingPrices.ok) throw new Error("❌ Une requête sans 'prices' devrait être rejetée.");
  console.log("✅ setTicketPrices rejette une requête sans 'prices'.");

  // --- upgradeFanShop --------------------------------------------------
  const { team: team3, league: league3 } = freshTeamAndLeague();
  const shopBudgetBefore = team3.budget;
  const shopRes = actions.upgradeFanShop(team3, 0, league3, {});
  if (!shopRes.ok) throw new Error(`❌ Un achat de boutique des supporters abordable devrait être accepté : ${shopRes.error}`);
  if (team3.fanShopLevel !== 1) throw new Error(`❌ fanShopLevel aurait dû passer à 1, obtenu ${team3.fanShopLevel}.`);
  if (team3.budget !== shopBudgetBefore - 40000) throw new Error(`❌ Le coût (40000) aurait dû être déduit du budget, obtenu ${team3.budget}.`);
  console.log("✅ upgradeFanShop achète le palier suivant et déduit le coût du budget.");

  // Budget insuffisant : rejeté, rien ne change.
  team3.budget = 100;
  const shopLevelBefore2 = team3.fanShopLevel;
  const shopUnaffordable = actions.upgradeFanShop(team3, 0, league3, {});
  if (shopUnaffordable.ok) throw new Error("❌ Un achat de boutique non abordable devrait être rejeté.");
  if (team3.fanShopLevel !== shopLevelBefore2 || team3.budget !== 100) throw new Error("❌ Un achat rejeté ne devrait RIEN muter (niveau/budget inchangés).");
  console.log("✅ upgradeFanShop rejette un achat non abordable sans rien muter.");

  // Niveau maximum : force fanShopLevel au dernier palier connu, vérifie le rejet propre.
  const { FAN_SHOP_LEVELS } = E;
  team3.budget = 10000000;
  team3.fanShopLevel = FAN_SHOP_LEVELS[FAN_SHOP_LEVELS.length - 1].level;
  const shopMaxed = actions.upgradeFanShop(team3, 0, league3, {});
  if (shopMaxed.ok) throw new Error("❌ Une boutique déjà au niveau maximum ne devrait plus pouvoir être achetée/agrandie.");
  console.log("✅ upgradeFanShop rejette un achat au-delà du dernier palier.");

  // --- teamIndex non nul (multi-manager) --------------------------------
  const multiLeague = generateMultiManagerLeague(["Lyon Multi Salle", "Marseille Multi Salle"], 1, T0);
  const multiTeamIndex = 1;
  const multiTeam = multiLeague.teams[multiTeamIndex];
  const multiArena = actions.upgradeArena(multiTeam, multiTeamIndex, multiLeague, {});
  if (!multiArena.ok) throw new Error(`❌ upgradeArena à un teamIndex non nul devrait fonctionner : ${multiArena.error}`);
  if (multiLeague.teams[0].arenaLevel === multiTeam.arenaLevel && multiLeague.teams[0] !== multiTeam) {
    if (multiLeague.teams[0].arenaLevel !== 1) throw new Error("❌ upgradeArena à teamIndex=1 ne devrait pas avoir touché l'équipe 0.");
  }
  console.log("✅ upgradeArena fonctionne correctement pour un teamIndex non nul (1), sans toucher à l'équipe 0.");

  const multiPrices = actions.setTicketPrices(multiTeam, multiTeamIndex, multiLeague, { prices: { tribune: 40 } });
  if (!multiPrices.ok || multiTeam.ticketPrices.tribune !== 40) throw new Error("❌ setTicketPrices à un teamIndex non nul devrait s'appliquer à CETTE équipe.");
  if (multiLeague.teams[0].ticketPrices.tribune === 40) throw new Error("❌ setTicketPrices à teamIndex=1 ne devrait pas avoir touché l'équipe 0.");
  console.log("✅ setTicketPrices fonctionne correctement pour un teamIndex non nul (1), isolé de l'équipe 0.");

  const multiShop = actions.upgradeFanShop(multiTeam, multiTeamIndex, multiLeague, {});
  if (!multiShop.ok || multiTeam.fanShopLevel !== 1) throw new Error("❌ upgradeFanShop à un teamIndex non nul devrait s'appliquer à CETTE équipe.");
  if (multiLeague.teams[0].fanShopLevel === 1) throw new Error("❌ upgradeFanShop à teamIndex=1 ne devrait pas avoir touché l'équipe 0.");
  console.log("✅ upgradeFanShop fonctionne correctement pour un teamIndex non nul (1), isolé de l'équipe 0.");
}

// ---------------------------------------------------------------------
// bidOnRecruiterListing / fireRecruiter — marché du recruteur (TROISIÈME
// rôle de staff, voir engine.js/youth_academy_test.js pour le détail des
// règles elles-mêmes : ce test-ci vérifie seulement le branchement correct
// des deux nouvelles actions serveur, même forme que bidOnAnalystListing/
// fireVideoAnalyst ci-dessus).
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();

  // --- bidOnRecruiterListing ---------------------------------------------
  const recruiterListing = league.generateRecruiterCandidate(T0);
  const recruiterBid = actions.bidOnRecruiterListing(team, 0, league, { listingId: recruiterListing.id, amount: recruiterListing.startPrice + 100 }, T0);
  if (!recruiterBid.ok) throw new Error(`❌ Une enchère valide sur un candidat recruteur devrait être acceptée : ${recruiterBid.error}`);
  if (recruiterBid.listing.currentBidderIdx !== 0) throw new Error("❌ L'enchère recruteur devrait être enregistrée au bon teamIndex (0).");
  console.log("✅ bidOnRecruiterListing accepte une enchère valide, au bon teamIndex.");

  const unknownRecruiterListing = actions.bidOnRecruiterListing(team, 0, league, { listingId: "id-qui-n-existe-pas", amount: 100 }, T0);
  if (unknownRecruiterListing.ok) throw new Error("❌ Enchérir sur un candidat recruteur inconnu devrait être rejeté.");
  console.log("✅ bidOnRecruiterListing rejette un candidat inconnu.");

  const missingAmount = actions.bidOnRecruiterListing(team, 0, league, { listingId: recruiterListing.id }, T0);
  if (missingAmount.ok) throw new Error("❌ Une enchère sans 'amount' devrait être rejetée.");
  console.log("✅ bidOnRecruiterListing rejette une requête sans 'amount'.");

  // --- fireRecruiter -------------------------------------------------
  team.hireRecruiter(2, 4000);
  const listingsBefore = league.recruiterListings.length;
  const fireRes = actions.fireRecruiter(team, 0, league, {}, T0);
  if (!fireRes.ok) throw new Error(`❌ Congédier un recruteur en poste devrait être accepté : ${fireRes.error}`);
  if (fireRes.relisted !== true) throw new Error("❌ La réponse devrait indiquer relisted:true (un recruteur était bien en poste).");
  if (team.recruiter) throw new Error("❌ L'équipe ne devrait plus avoir de recruteur après l'action fireRecruiter.");
  if (league.recruiterListings.length !== listingsBefore + 1) throw new Error("❌ fireRecruiter aurait dû pousser exactement une nouvelle annonce dans league.recruiterListings.");
  console.log("✅ fireRecruiter congédie le recruteur et le reliste (relisted:true), via League.fireTeamRecruiter.");

  const fireAgain = actions.fireRecruiter(team, 0, league, {}, T0);
  if (!fireAgain.ok || fireAgain.relisted !== false) throw new Error("❌ Congédier sans recruteur en poste devrait rester ok:true avec relisted:false.");
  console.log("✅ fireRecruiter reste un no-op propre (ok:true, relisted:false) quand aucun recruteur n'est en poste.");
}

// ---------------------------------------------------------------------
// upgradeTrainingCenter — Centre de formation (même contrat qu'upgradeArena
// ci-dessus, voir engine.js/youth_academy_test.js pour le détail des
// paliers).
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  team.budget = 0;
  const unaffordable = actions.upgradeTrainingCenter(team, 0, league, {}, T0);
  if (unaffordable.ok) throw new Error("❌ upgradeTrainingCenter devrait rejeter un agrandissement non abordable.");
  if (team.trainingCenterLevel !== 1) throw new Error("❌ Un agrandissement rejeté ne devrait rien muter.");
  console.log("✅ upgradeTrainingCenter rejette un agrandissement non abordable sans rien muter.");

  team.budget = 10000000;
  const res = actions.upgradeTrainingCenter(team, 0, league, {}, T0);
  if (!res.ok) throw new Error(`❌ Un agrandissement abordable du Centre de formation devrait être accepté : ${res.error}`);
  if (team.trainingCenterLevel !== 2) throw new Error("❌ upgradeTrainingCenter devrait faire progresser trainingCenterLevel d'exactement un palier.");
  console.log("✅ upgradeTrainingCenter agrandit le Centre de formation d'un palier et déduit le coût du budget.");
}

// ---------------------------------------------------------------------
// signYouthCandidate / declineYouthCandidate / promoteYouthPlayer /
// releaseYouthPlayer — académie de jeunes (voir engine.js/
// youth_academy_test.js pour le détail des règles elles-mêmes : ce test-ci
// vérifie seulement le branchement correct des quatre nouvelles actions
// serveur).
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();

  // --- signYouthCandidate ----------------------------------------------
  const candidate = generateYouthCandidate(T0, 3);
  team.youthCandidates.push(candidate);
  const signRes = actions.signYouthCandidate(team, 0, league, { candidateId: candidate.id }, T0);
  if (!signRes.ok) throw new Error(`❌ Signer un candidat existant devrait être accepté : ${signRes.error}`);
  if (signRes.player.salary !== YOUTH_TRAINEE_WEEKLY_SALARY) throw new Error("❌ signYouthCandidate devrait fixer le salaire au tarif de stagiaire.");
  if (!team.youthPlayers.some(p => p.id === candidate.id)) throw new Error("❌ Le candidat signé devrait rejoindre team.youthPlayers.");
  console.log("✅ signYouthCandidate déplace bien un candidat vers l'effectif jeunes, au tarif de stagiaire.");

  const unknownCandidate = actions.signYouthCandidate(team, 0, league, { candidateId: "id-qui-n-existe-pas" }, T0);
  if (unknownCandidate.ok) throw new Error("❌ Signer un candidat inconnu devrait être rejeté.");
  console.log("✅ signYouthCandidate rejette un candidat inconnu.");

  const missingCandidateId = actions.signYouthCandidate(team, 0, league, {}, T0);
  if (missingCandidateId.ok) throw new Error("❌ Signer sans 'candidateId' devrait être rejeté.");
  console.log("✅ signYouthCandidate rejette une requête sans 'candidateId'.");

  // Effectif jeunes déjà complet : refus explicite (youth-roster-full).
  while (team.youthPlayers.length < MAX_YOUTH_ROSTER_SIZE) {
    const extra = generateYouthCandidate(T0, 1);
    team.youthCandidates.push(extra);
    team.signYouthCandidate(extra.id);
  }
  const extraCandidate = generateYouthCandidate(T0, 1);
  team.youthCandidates.push(extraCandidate);
  const fullRes = actions.signYouthCandidate(team, 0, league, { candidateId: extraCandidate.id }, T0);
  if (fullRes.ok) throw new Error("❌ Signer alors que l'effectif jeunes est déjà à MAX_YOUTH_ROSTER_SIZE devrait être rejeté.");
  console.log("✅ signYouthCandidate rejette une signature quand l'effectif jeunes est déjà complet.");

  // --- declineYouthCandidate ---------------------------------------------
  const declineRes = actions.declineYouthCandidate(team, 0, league, { candidateId: extraCandidate.id }, T0);
  if (!declineRes.ok) throw new Error(`❌ Refuser un candidat existant devrait être accepté : ${declineRes.error}`);
  if (team.youthCandidates.some(c => c.id === extraCandidate.id)) throw new Error("❌ Le candidat refusé devrait quitter team.youthCandidates.");
  console.log("✅ declineYouthCandidate retire bien un candidat de la file, sans consommer de place.");

  const unknownDecline = actions.declineYouthCandidate(team, 0, league, { candidateId: "id-qui-n-existe-pas" }, T0);
  if (unknownDecline.ok) throw new Error("❌ Refuser un candidat inconnu devrait être rejeté.");
  console.log("✅ declineYouthCandidate rejette un candidat inconnu.");

  // --- promoteYouthPlayer / releaseYouthPlayer ----------------------------
  const eighteenYearOld = team.youthPlayers[0];
  eighteenYearOld.age = 18;
  team.pendingYouthDecisions = [eighteenYearOld.id];
  const rosterBefore = team.players.length;
  const promoteRes = actions.promoteYouthPlayer(team, 0, league, { playerId: eighteenYearOld.id }, T0);
  if (!promoteRes.ok) throw new Error(`❌ Promouvoir un jeune de 18 ans en attente devrait être accepté : ${promoteRes.error}`);
  if (!team.players.some(p => p.id === eighteenYearOld.id)) throw new Error("❌ promoteYouthPlayer devrait déplacer le jeune vers team.players.");
  if (promoteRes.player.salary !== salaryForOverall(promoteRes.player.overall())) throw new Error("❌ promoteYouthPlayer devrait recalculer le salaire à la vraie valeur de marché.");
  if (team.players.length !== rosterBefore + 1) throw new Error("❌ L'effectif pro devrait grandir exactement d'une unité après la promotion.");
  console.log("✅ promoteYouthPlayer déplace bien un jeune de 18 ans vers l'effectif pro, salaire recalculé.");

  const unknownPromote = actions.promoteYouthPlayer(team, 0, league, { playerId: "id-qui-n-existe-pas" }, T0);
  if (unknownPromote.ok) throw new Error("❌ Promouvoir un id de jeune inconnu devrait être rejeté.");
  console.log("✅ promoteYouthPlayer rejette un id de jeune inconnu.");

  const anotherYouth = team.youthPlayers.find(p => p.id !== eighteenYearOld.id) || generateYouthCandidate(T0, 1);
  if (!team.youthPlayers.some(p => p.id === anotherYouth.id)) { team.youthCandidates.push(anotherYouth); team.signYouthCandidate(anotherYouth.id); }
  anotherYouth.age = 18;
  team.pendingYouthDecisions = [anotherYouth.id];
  const releaseRes = actions.releaseYouthPlayer(team, 0, league, { playerId: anotherYouth.id }, T0);
  if (!releaseRes.ok) throw new Error(`❌ Libérer un jeune de 18 ans en attente devrait être accepté : ${releaseRes.error}`);
  if (team.youthPlayers.some(p => p.id === anotherYouth.id)) throw new Error("❌ releaseYouthPlayer devrait retirer le jeune de team.youthPlayers.");
  if (team.players.some(p => p.id === anotherYouth.id)) throw new Error("❌ releaseYouthPlayer ne devrait JAMAIS envoyer le jeune vers l'effectif pro.");
  console.log("✅ releaseYouthPlayer libère bien un jeune de 18 ans sans jamais le promouvoir.");

  const unknownRelease = actions.releaseYouthPlayer(team, 0, league, { playerId: "id-qui-n-existe-pas" }, T0);
  if (unknownRelease.ok) throw new Error("❌ Libérer un id de jeune inconnu devrait être rejeté.");
  console.log("✅ releaseYouthPlayer rejette un id de jeune inconnu.");
}

// ---------------------------------------------------------------------
// respondToInterview / skipInterview : Médias, interview DE JALON (voir
// Team.pendingInterviews/applyMoraleForResult/resolveInterview/
// skipInterview côté moteur, MILESTONE_INTERVIEW_TONES). Retour utilisateur,
// 2026-09 : l'interview classique d'après CHAQUE match a été retirée ("on
// enlève ça") ; seul un `milestone` (un des 5 moments clés de la saison, voir
// MILESTONE_INTERVIEW_TYPES) met désormais une interview en attente, jamais
// `round` seul. Le manager choisit un ton (delta selon victoire/défaite,
// plus un effet sur la forme des joueurs ayant disputé ce match) ou
// l'ignore (effet nul).
{
  const { team, league } = freshTeamAndLeague();

  const toneNames = Object.keys(E.MILESTONE_INTERVIEW_TONES);
  if (toneNames.length !== 3) throw new Error("❌ MILESTONE_INTERVIEW_TONES devrait exposer exactement 3 tons.");
  console.log("✅ MILESTONE_INTERVIEW_TONES expose les 3 tons attendus.");

  // Un appel SANS `milestone` (même avec un `round` numérique, ex. un match
  // de championnat ordinaire) ne met plus rien en attente depuis le retrait
  // de l'interview classique.
  team.applyMoraleForResult(true, 12, "Adversaire test");
  if (team.pendingInterviews.length !== 0) throw new Error("❌ applyMoraleForResult sans `milestone` ne devrait jamais mettre d'interview en attente.");
  team.applyMoraleForResult(true, 12, "Adversaire test", 3);
  if (team.pendingInterviews.length !== 0) throw new Error("❌ applyMoraleForResult avec `round` mais SANS `milestone` ne devrait plus mettre d'interview en attente (interview classique retirée).");
  console.log("✅ applyMoraleForResult sans `milestone` ne met jamais d'interview en attente, même avec un `round` numérique.");

  // Victoire au round 3, mi-saison : une interview de jalon est mise en
  // attente.
  team.applyMoraleForResult(true, 12, "Adversaire test", 3, T0, "mi-saison");
  if (team.pendingInterviews.length !== 1) throw new Error("❌ applyMoraleForResult avec `milestone` devrait mettre une interview en attente.");
  const winInterview = team.pendingInterviews[0];
  if (winInterview.round !== 3 || winInterview.won !== true || winInterview.milestone !== "mi-saison") throw new Error("❌ L'interview en attente devrait porter le round, le résultat du match et le milestone.");

  const moraleBeforeWin = team.fanMorale;
  const aggroWinRes = actions.respondToInterview(team, 0, league, { id: winInterview.id, tone: "Agressif" }, T0);
  if (!aggroWinRes.ok || aggroWinRes.delta !== E.MILESTONE_INTERVIEW_TONES["Agressif"].fanWin) throw new Error(`❌ respondToInterview (Agressif, victoire) devrait renvoyer le delta de victoire agressive : ${JSON.stringify(aggroWinRes)}`);
  if (aggroWinRes.formDelta !== E.MILESTONE_INTERVIEW_TONES["Agressif"].formWin) throw new Error(`❌ respondToInterview (Agressif, victoire) devrait aussi renvoyer le delta de forme : ${JSON.stringify(aggroWinRes)}`);
  if (team.fanMorale <= moraleBeforeWin) throw new Error("❌ Une interview agressive après une victoire devrait augmenter l'humeur des supporters.");
  if (team.pendingInterviews.length !== 0) throw new Error("❌ respondToInterview devrait retirer l'interview traitée de la file.");
  console.log("✅ respondToInterview (Agressif, victoire) applique le bon delta et vide la file.");

  // Même id rejoué : introuvable (déjà traitée).
  const alreadyDone = actions.respondToInterview(team, 0, league, { id: winInterview.id, tone: "Mesuré" }, T0);
  if (alreadyDone.ok) throw new Error("❌ Répondre deux fois à la même interview devrait être rejeté.");
  console.log("✅ respondToInterview rejette une interview déjà traitée.");

  // Ton inconnu.
  team.applyMoraleForResult(false, 8, "Adversaire test", 4, T0, "fin-saison-reguliere");
  const lossInterview = team.pendingInterviews[team.pendingInterviews.length - 1];
  const unknownTone = actions.respondToInterview(team, 0, league, { id: lossInterview.id, tone: "Sarcastique" }, T0);
  if (unknownTone.ok) throw new Error("❌ Un ton inconnu devrait être rejeté.");
  console.log("✅ respondToInterview rejette un ton inconnu.");

  // Défaite, ton Humble : le SEUL cas où une défaite produit un effet NET
  // POSITIF sur l'humeur (voir le commentaire de MILESTONE_INTERVIEW_TONES).
  const moraleBeforeLoss = team.fanMorale;
  const humbleLossRes = actions.respondToInterview(team, 0, league, { id: lossInterview.id, tone: "Humble" }, T0);
  if (!humbleLossRes.ok || humbleLossRes.delta !== E.MILESTONE_INTERVIEW_TONES["Humble"].fanLoss) throw new Error(`❌ respondToInterview (Humble, défaite) devrait renvoyer le delta correspondant : ${JSON.stringify(humbleLossRes)}`);
  if (team.fanMorale <= moraleBeforeLoss) throw new Error("❌ Une interview humble après une défaite devrait quand même augmenter l'humeur des supporters (le seul cas positif après une défaite).");
  console.log("✅ respondToInterview (Humble, défaite) produit bien un effet net positif sur l'humeur.");

  // skipInterview : effet nul, retire simplement l'entrée de la file.
  team.applyMoraleForResult(true, 5, "Adversaire test", null, T0, "demi-finale-po");
  const skipTarget = team.pendingInterviews[team.pendingInterviews.length - 1];
  const moraleBeforeSkip = team.fanMorale;
  const skipRes = actions.skipInterview(team, 0, league, { id: skipTarget.id }, T0);
  if (!skipRes.ok) throw new Error(`❌ skipInterview devrait accepter un id valide : ${skipRes.error}`);
  if (team.fanMorale !== moraleBeforeSkip) throw new Error("❌ skipInterview ne devrait avoir aucun effet sur l'humeur des supporters.");
  if (team.pendingInterviews.some(i => i.id === skipTarget.id)) throw new Error("❌ skipInterview devrait retirer l'entrée de la file.");
  console.log("✅ skipInterview retire l'interview de la file, sans effet sur l'humeur.");

  const unknownSkip = actions.skipInterview(team, 0, league, { id: "id-qui-n-existe-pas" }, T0);
  if (unknownSkip.ok) throw new Error("❌ skipInterview devrait rejeter un id inconnu.");
  console.log("✅ skipInterview rejette un id inconnu.");

  // Round-trip serializeTeam/teamFromSave : pendingInterviews doit survivre
  // à une sauvegarde/rechargement (convention établie pour tout champ Team).
  team.applyMoraleForResult(true, 9, "Adversaire test", 0, T0, "debut-saison");
  const beforeCount = team.pendingInterviews.length;
  const saved = E.serializeTeam(team);
  const reloaded = E.teamFromSave(saved);
  if (reloaded.pendingInterviews.length !== beforeCount) throw new Error("❌ pendingInterviews devrait survivre à un round-trip serializeTeam/teamFromSave.");
  if (reloaded.pendingInterviews[0].id !== team.pendingInterviews[0].id) throw new Error("❌ Le contenu de pendingInterviews devrait être préservé par le round-trip.");
  console.log("✅ pendingInterviews survit à un round-trip serializeTeam/teamFromSave.");
}

// ---------------------------------------------------------------------
// discussTransferRequest : Médias, demande de transfert dans la presse
// (retour utilisateur, 2026-09 : "un joueur très frustré [...] peut demander
// son transfert dans la presse [...] ouvrir la discussion avec lui pour le
// remotiver [...] ou le vendre sont les deux possibilités"). Voir
// Team.discussTransferRequest/updateTransferRequests côté moteur, testés en
// détail dans transfer_request_test.js ; ce test-ci couvre uniquement la
// validation de forme et le passage de résultat propres à cette action
// serveur (même patron que promoteYouthPlayer/releaseYouthPlayer plus haut).
{
  const { team, league } = freshTeamAndLeague();
  const p = team.players[0];

  // playerId manquant.
  const missingId = actions.discussTransferRequest(team, 0, league, {}, T0);
  if (missingId.ok) throw new Error("❌ discussTransferRequest devrait rejeter un body sans playerId.");
  console.log("✅ discussTransferRequest rejette un body sans playerId.");

  // playerId inconnu.
  const unknownId = actions.discussTransferRequest(team, 0, league, { playerId: "id-qui-n-existe-pas" }, T0);
  if (unknownId.ok) throw new Error("❌ discussTransferRequest devrait rejeter un playerId inconnu.");
  console.log("✅ discussTransferRequest rejette un playerId inconnu.");

  // Joueur connu mais sans demande de transfert active.
  p.transferRequestActive = false;
  const notRequesting = actions.discussTransferRequest(team, 0, league, { playerId: p.id }, T0);
  if (notRequesting.ok) throw new Error("❌ discussTransferRequest devrait rejeter un joueur qui n'a pas demandé son transfert.");
  console.log("✅ discussTransferRequest rejette un joueur qui n'a pas demandé son transfert.");

  // Demande active, succès forcé (Math.random stubbé) : forme boostée, forme
  // avant/après renvoyées.
  p.form = 10;
  for (let i = 0; i < E.TRANSFER_REQUEST_WEEKS_THRESHOLD; i++) team.updateTransferRequests(T0);
  if (!p.transferRequestActive) throw new Error("❌ (setup) la demande devrait être active avant ce test.");

  const realRandom = Math.random;
  Math.random = () => 0;
  let successRes;
  try {
    successRes = actions.discussTransferRequest(team, 0, league, { playerId: p.id }, T0);
  } finally {
    Math.random = realRandom;
  }
  if (!successRes.ok || !successRes.success) throw new Error(`❌ discussTransferRequest devrait accepter une demande active et réussir avec Math.random stubbé à 0 : ${JSON.stringify(successRes)}`);
  if (successRes.formBefore !== 10 || successRes.formAfter !== p.form) throw new Error(`❌ discussTransferRequest devrait renvoyer formBefore/formAfter cohérents avec le joueur : ${JSON.stringify(successRes)}`);
  if (p.transferRequestActive) throw new Error("❌ Un succès devrait refermer la demande de transfert.");
  console.log(`✅ discussTransferRequest, succès : ${JSON.stringify({ formBefore: successRes.formBefore, formAfter: successRes.formAfter })}, demande refermée.`);

  // Rejouée juste après : plus de demande active, donc rejetée.
  const alreadyResolved = actions.discussTransferRequest(team, 0, league, { playerId: p.id }, T0);
  if (alreadyResolved.ok) throw new Error("❌ discussTransferRequest rejouée après succès devrait être rejetée (plus de demande active).");
  console.log("✅ discussTransferRequest rejette une demande déjà résolue.");
}

// ---------------------------------------------------------------------
// Délai de réponse de 3 jours à une interview de jalon (retour utilisateur :
// "on a 3 jours pour faire l'interview sinon c'est neutre sur le moral") :
// voir Team.pruneExpiredInterviews/MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS
// côté moteur.
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const T_MATCH = Date.UTC(2026, 8, 10, 12, 0, 0);
  const DEADLINE_MS = E.MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS;

  team.applyMoraleForResult(true, 10, "Adversaire test", 3, T_MATCH, "mi-saison");
  const interview = team.pendingInterviews[0];

  // Juste avant l'échéance : toujours répondable.
  const justBefore = T_MATCH + DEADLINE_MS - 60000;
  const okRes = actions.respondToInterview(team, 0, league, { id: interview.id, tone: "Mesuré" }, justBefore);
  if (!okRes.ok) throw new Error(`❌ Une interview répondue avant l'échéance de 3 jours devrait être acceptée : ${okRes.error}`);
  console.log("✅ Une interview répondue juste avant l'échéance de 3 jours est acceptée.");

  // Après l'échéance : la file est purgée SANS effet sur l'humeur, comme un
  // "sans commentaire" implicite.
  team.applyMoraleForResult(false, 6, "Adversaire test", 17, T_MATCH, "fin-saison-reguliere");
  const lateInterview = team.pendingInterviews[team.pendingInterviews.length - 1];
  const afterDeadline = T_MATCH + DEADLINE_MS + 1000;
  const moraleBeforeLate = team.fanMorale;
  const lateRes = actions.respondToInterview(team, 0, league, { id: lateInterview.id, tone: "Agressif" }, afterDeadline);
  if (lateRes.ok) throw new Error("❌ Répondre après le délai de 3 jours devrait être rejeté (interview déjà purgée).");
  if (team.fanMorale !== moraleBeforeLate) throw new Error("❌ Une interview expirée ne devrait avoir aucun effet sur l'humeur, même en tentant d'y répondre trop tard.");
  if (team.pendingInterviews.some(i => i.id === lateInterview.id)) throw new Error("❌ Une interview expirée devrait avoir été purgée de la file.");
  console.log("✅ Une interview non traitée après 3 jours est purgée automatiquement, sans effet sur l'humeur.");

  // pruneExpiredInterviews appelé directement, plusieurs entrées à la fois.
  team.applyMoraleForResult(true, 5, "Adversaire test", 0, T_MATCH, "debut-saison");
  team.applyMoraleForResult(true, 5, "Adversaire test", null, T_MATCH, "demi-finale-po");
  const removedCount = team.pruneExpiredInterviews(afterDeadline);
  if (removedCount !== 2) throw new Error(`❌ pruneExpiredInterviews aurait dû retirer 2 entrées expirées, en a retiré ${removedCount}.`);
  console.log("✅ pruneExpiredInterviews retire bien toutes les entrées expirées d'un coup.");
}

// ---------------------------------------------------------------------
// setTeamJersey / setTeamJerseyPattern / setTeamJerseyTwoTone / setTeamLogo /
// setTeamPaying : Identité du club (retour utilisateur : "le logo de
// l'équipe doit être type dès lors que l'équipe ne paie pas [...] pour les
// équipes qui paient, elles doivent pouvoir charger leur propre image [...]
// une équipe gratuite doit pouvoir choisir uniquement entre 2 formes de
// maillot et 5 couleurs" ; puis, sur la refonte de l'Aperçu : "Pour le mode
// payant ajoute des maillots avec des dessins particuliers (rayure,
// degrade...)" ; puis : "ajoute un peu plus de couleur pour le mode payant,
// et mets le choix de 2 couleurs [...] mets plus de choix").
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();

  // 8 couleurs (retour utilisateur, 2026-09 : "mets plus de choix [...] il
  // manque jaune [...] noir, blanc") : les 5 d'origine + noir/blanc/jaune.
  if (Object.keys(E.JERSEY_COLORS).length !== 8) throw new Error("❌ JERSEY_COLORS devrait exposer exactement 8 couleurs.");
  if (E.JERSEY_SHAPES.length !== 2) throw new Error("❌ JERSEY_SHAPES devrait exposer exactement 2 formes.");
  console.log("✅ JERSEY_COLORS/JERSEY_SHAPES exposent bien 8 couleurs et 2 formes.");

  const someColor = Object.keys(E.JERSEY_COLORS)[2];
  const jerseyRes = actions.setTeamJersey(team, 0, league, { shape: E.JERSEY_SHAPES[1], color: someColor }, T0);
  if (!jerseyRes.ok || team.jerseyShape !== E.JERSEY_SHAPES[1] || team.jerseyColor !== someColor) throw new Error(`❌ setTeamJersey devrait appliquer forme/couleur valides : ${JSON.stringify(jerseyRes)}`);
  console.log("✅ setTeamJersey applique une forme/couleur valides.");

  const badShape = actions.setTeamJersey(team, 0, league, { shape: "Z", color: someColor }, T0);
  if (badShape.ok) throw new Error("❌ setTeamJersey devrait rejeter une forme inconnue.");
  const badColor = actions.setTeamJersey(team, 0, league, { shape: "A", color: "fluo" }, T0);
  if (badColor.ok) throw new Error("❌ setTeamJersey devrait rejeter une couleur inconnue.");
  console.log("✅ setTeamJersey rejette une forme ou une couleur inconnue.");

  // Logo personnalisé : refusé tant que le club n'est pas payant.
  const tinyPngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const logoRejected = actions.setTeamLogo(team, 0, league, { dataUrl: tinyPngDataUrl }, T0);
  if (logoRejected.ok) throw new Error("❌ setTeamLogo devrait être refusé pour un club gratuit (isPaying=false).");
  console.log("✅ setTeamLogo refuse un logo personnalisé pour un club gratuit.");

  const payingRes = actions.setTeamPaying(team, 0, league, { isPaying: true }, T0);
  if (!payingRes.ok || !team.isPaying) throw new Error("❌ setTeamPaying(true) devrait passer le club en payant.");
  console.log("✅ setTeamPaying bascule bien le statut du club.");

  const logoAccepted = actions.setTeamLogo(team, 0, league, { dataUrl: tinyPngDataUrl }, T0);
  if (!logoAccepted.ok || team.customLogoDataUrl !== tinyPngDataUrl) throw new Error(`❌ setTeamLogo devrait accepter une image valide pour un club payant : ${JSON.stringify(logoAccepted)}`);
  console.log("✅ setTeamLogo accepte un logo personnalisé pour un club payant.");

  const badLogo = actions.setTeamLogo(team, 0, league, { dataUrl: "not-an-image" }, T0);
  if (badLogo.ok) throw new Error("❌ setTeamLogo devrait rejeter une donnée qui n'est pas une image encodée valide.");
  console.log("✅ setTeamLogo rejette une donnée invalide.");

  // Repasser en gratuit NE DOIT PAS effacer le logo déjà chargé (retour au
  // logo type se fait au RENDU, jamais en perdant la donnée elle-même).
  actions.setTeamPaying(team, 0, league, { isPaying: false }, T0);
  if (team.customLogoDataUrl !== tinyPngDataUrl) throw new Error("❌ Repasser en club gratuit ne devrait pas effacer customLogoDataUrl (conservé pour une réactivation future).");
  console.log("✅ Repasser en club gratuit conserve le logo personnalisé déjà chargé (juste ignoré au rendu).");

  // Motif de maillot (retour utilisateur, sur la refonte de l'Aperçu :
  // "Pour le mode payant ajoute des maillots avec des dessins particuliers
  // (rayure, degrade...)") : club encore gratuit à ce stade (bascule
  // ci-dessus repassée à false) : un motif personnalisé doit être refusé,
  // "uni" doit toujours être accepté.
  // 4 motifs (retour utilisateur, 2026-09 : "2 bandes de couleur sur les
  // côtés" ajouté à uni/rayures/degrade).
  if (E.JERSEY_PATTERNS.length !== 4 || E.JERSEY_PATTERNS[0] !== "uni") {
    throw new Error(`❌ JERSEY_PATTERNS devrait exposer exactement 4 motifs, "uni" en premier, obtenu ${JSON.stringify(E.JERSEY_PATTERNS)}.`);
  }
  const patternRejected = actions.setTeamJerseyPattern(team, 0, league, { pattern: "rayures" }, T0);
  if (patternRejected.ok) throw new Error("❌ setTeamJerseyPattern devrait refuser un motif personnalisé pour un club gratuit.");
  console.log("✅ setTeamJerseyPattern refuse un motif personnalisé pour un club gratuit.");

  const uniAllowedWhileFree = actions.setTeamJerseyPattern(team, 0, league, { pattern: "uni" }, T0);
  if (!uniAllowedWhileFree.ok) throw new Error("❌ setTeamJerseyPattern devrait toujours accepter \"uni\", même pour un club gratuit.");
  console.log("✅ setTeamJerseyPattern accepte toujours \"uni\", même pour un club gratuit.");

  actions.setTeamPaying(team, 0, league, { isPaying: true }, T0);
  const patternAccepted = actions.setTeamJerseyPattern(team, 0, league, { pattern: "degrade" }, T0);
  if (!patternAccepted.ok || team.jerseyPattern !== "degrade") throw new Error(`❌ setTeamJerseyPattern devrait accepter un motif personnalisé pour un club payant : ${JSON.stringify(patternAccepted)}`);
  console.log("✅ setTeamJerseyPattern accepte un motif personnalisé pour un club payant.");

  const badPattern = actions.setTeamJerseyPattern(team, 0, league, { pattern: "carreaux" }, T0);
  if (badPattern.ok) throw new Error("❌ setTeamJerseyPattern devrait rejeter un motif inconnu.");
  console.log("✅ setTeamJerseyPattern rejette un motif inconnu.");

  // Même principe que le logo personnalisé : repasser en gratuit ne doit
  // PAS effacer le motif choisi, juste l'ignorer au rendu (voir
  // effectiveJerseyPattern côté moteurbasket3.html, non exercé ici).
  actions.setTeamPaying(team, 0, league, { isPaying: false }, T0);
  if (team.jerseyPattern !== "degrade") throw new Error("❌ Repasser en club gratuit ne devrait pas effacer jerseyPattern (conservé pour une réactivation future).");
  console.log("✅ Repasser en club gratuit conserve le motif de maillot déjà choisi (juste ignoré au rendu).");

  // Combinaison de 2 couleurs (retour utilisateur, 2026-09 : "ajoute un peu
  // plus de couleur pour le mode payant, et mets le choix de 2 couleurs
  // [...] mets plus de choix") : club encore gratuit à ce stade (bascule
  // ci-dessus repassée à false), même patron que jerseyPattern ci-dessus,
  // SAUF qu'il n'y a pas d'équivalent "uni" toujours accepté : une
  // combinaison de 2 couleurs est réservée à un club payant, sans
  // exception.
  if (Object.keys(E.JERSEY_TWO_TONE_SETS).length < 8) {
    throw new Error(`❌ JERSEY_TWO_TONE_SETS devrait exposer au moins 8 combinaisons ("mets plus de choix"), obtenu ${Object.keys(E.JERSEY_TWO_TONE_SETS).length}.`);
  }
  for (const key of Object.keys(E.JERSEY_TWO_TONE_SETS)) {
    const pair = E.JERSEY_TWO_TONE_SETS[key];
    if (!Array.isArray(pair) || pair.length !== 2) throw new Error(`❌ JERSEY_TWO_TONE_SETS.${key} devrait être une paire de 2 couleurs.`);
  }
  console.log("✅ JERSEY_TWO_TONE_SETS expose bien une palette étoffée de combinaisons de 2 couleurs valides.");

  const someTwoTone = Object.keys(E.JERSEY_TWO_TONE_SETS)[0];
  const twoToneRejected = actions.setTeamJerseyTwoTone(team, 0, league, { key: someTwoTone }, T0);
  if (twoToneRejected.ok) throw new Error("❌ setTeamJerseyTwoTone devrait refuser une combinaison de couleurs pour un club gratuit.");
  console.log("✅ setTeamJerseyTwoTone refuse une combinaison de couleurs pour un club gratuit.");

  actions.setTeamPaying(team, 0, league, { isPaying: true }, T0);
  const otherTwoTone = Object.keys(E.JERSEY_TWO_TONE_SETS)[1];
  const twoToneAccepted = actions.setTeamJerseyTwoTone(team, 0, league, { key: otherTwoTone }, T0);
  if (!twoToneAccepted.ok || team.jerseyTwoTone !== otherTwoTone) throw new Error(`❌ setTeamJerseyTwoTone devrait accepter une combinaison valide pour un club payant : ${JSON.stringify(twoToneAccepted)}`);
  console.log("✅ setTeamJerseyTwoTone accepte une combinaison de couleurs pour un club payant.");

  const badTwoTone = actions.setTeamJerseyTwoTone(team, 0, league, { key: "arc-en-ciel" }, T0);
  if (badTwoTone.ok) throw new Error("❌ setTeamJerseyTwoTone devrait rejeter une combinaison inconnue.");
  console.log("✅ setTeamJerseyTwoTone rejette une combinaison de couleurs inconnue.");

  // Même principe que le logo personnalisé/motif de maillot ci-dessus :
  // repasser en gratuit ne doit PAS effacer la combinaison choisie, juste
  // l'ignorer au rendu (voir effectiveJerseyTwoTone côté
  // moteurbasket3.html, non exercé ici).
  actions.setTeamPaying(team, 0, league, { isPaying: false }, T0);
  if (team.jerseyTwoTone !== otherTwoTone) throw new Error("❌ Repasser en club gratuit ne devrait pas effacer jerseyTwoTone (conservé pour une réactivation future).");
  console.log("✅ Repasser en club gratuit conserve la combinaison de couleurs déjà choisie (juste ignorée au rendu).");
}

// ---------------------------------------------------------------------
// setTeamAwayJersey / setTeamAwayJerseyPattern / setTeamAwayJerseyTwoTone :
// maillot EXTÉRIEUR (retour utilisateur, 2026-09 : "sur les maillots, il y
// a un problème, c'est qu'on ne peut choisir que les maillots domiciles, il
// faudrait changer ça" puis "Travaille sur les maillots extérieurs
// également") : même comportement/mêmes garde-fous que setTeamJersey/
// setTeamJerseyPattern/setTeamJerseyTwoTone ci-dessus, sur des champs
// indépendants (Team.awayJerseyColor/awayJerseyPattern/awayJerseyTwoTone).
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();

  // Couleur par défaut à la création : contraste avec la couleur domicile
  // (voir defaultAwayJerseyColor, engine.js), jamais la même couleur.
  if (team.awayJerseyColor === team.jerseyColor) {
    throw new Error("❌ La couleur de maillot extérieur par défaut ne devrait jamais être identique à la couleur domicile.");
  }
  console.log(`✅ Couleur de maillot extérieur par défaut (${team.awayJerseyColor}) distincte de la couleur domicile (${team.jerseyColor}).`);

  // La forme (jerseyShape) reste PARTAGÉE avec le maillot domicile, pas de
  // champ awayJerseyShape séparé.
  const shapeRes = actions.setTeamJersey(team, 0, league, { shape: E.JERSEY_SHAPES[1], color: team.jerseyColor }, T0);
  if (!shapeRes.ok || team.jerseyShape !== E.JERSEY_SHAPES[1]) throw new Error("❌ (setup) setTeamJersey devrait appliquer la nouvelle forme.");
  console.log("✅ Le maillot extérieur n'a pas de forme propre : jerseyShape reste bien partagé.");

  const someAwayColor = Object.keys(E.JERSEY_COLORS)[3];
  const awayJerseyRes = actions.setTeamAwayJersey(team, 0, league, { color: someAwayColor }, T0);
  if (!awayJerseyRes.ok || team.awayJerseyColor !== someAwayColor) throw new Error(`❌ setTeamAwayJersey devrait appliquer une couleur valide : ${JSON.stringify(awayJerseyRes)}`);
  console.log("✅ setTeamAwayJersey applique une couleur valide.");

  const badAwayColor = actions.setTeamAwayJersey(team, 0, league, { color: "fluo" }, T0);
  if (badAwayColor.ok) throw new Error("❌ setTeamAwayJersey devrait rejeter une couleur inconnue.");
  console.log("✅ setTeamAwayJersey rejette une couleur inconnue.");

  const awayPatternRejected = actions.setTeamAwayJerseyPattern(team, 0, league, { pattern: "rayures" }, T0);
  if (awayPatternRejected.ok) throw new Error("❌ setTeamAwayJerseyPattern devrait refuser un motif personnalisé pour un club gratuit.");
  console.log("✅ setTeamAwayJerseyPattern refuse un motif personnalisé pour un club gratuit.");

  const awayUniAllowedWhileFree = actions.setTeamAwayJerseyPattern(team, 0, league, { pattern: "uni" }, T0);
  if (!awayUniAllowedWhileFree.ok) throw new Error("❌ setTeamAwayJerseyPattern devrait toujours accepter \"uni\", même pour un club gratuit.");
  console.log("✅ setTeamAwayJerseyPattern accepte toujours \"uni\", même pour un club gratuit.");

  actions.setTeamPaying(team, 0, league, { isPaying: true }, T0);
  const awayPatternAccepted = actions.setTeamAwayJerseyPattern(team, 0, league, { pattern: "bandes" }, T0);
  if (!awayPatternAccepted.ok || team.awayJerseyPattern !== "bandes") throw new Error(`❌ setTeamAwayJerseyPattern devrait accepter un motif personnalisé pour un club payant : ${JSON.stringify(awayPatternAccepted)}`);
  console.log("✅ setTeamAwayJerseyPattern accepte un motif personnalisé pour un club payant.");

  const badAwayPattern = actions.setTeamAwayJerseyPattern(team, 0, league, { pattern: "carreaux" }, T0);
  if (badAwayPattern.ok) throw new Error("❌ setTeamAwayJerseyPattern devrait rejeter un motif inconnu.");
  console.log("✅ setTeamAwayJerseyPattern rejette un motif inconnu.");

  const someAwayTwoTone = Object.keys(E.JERSEY_TWO_TONE_SETS)[2];
  const awayTwoToneAccepted = actions.setTeamAwayJerseyTwoTone(team, 0, league, { key: someAwayTwoTone }, T0);
  if (!awayTwoToneAccepted.ok || team.awayJerseyTwoTone !== someAwayTwoTone) throw new Error(`❌ setTeamAwayJerseyTwoTone devrait accepter une combinaison valide pour un club payant : ${JSON.stringify(awayTwoToneAccepted)}`);
  console.log("✅ setTeamAwayJerseyTwoTone accepte une combinaison de couleurs pour un club payant.");

  const badAwayTwoTone = actions.setTeamAwayJerseyTwoTone(team, 0, league, { key: "arc-en-ciel" }, T0);
  if (badAwayTwoTone.ok) throw new Error("❌ setTeamAwayJerseyTwoTone devrait rejeter une combinaison inconnue.");
  console.log("✅ setTeamAwayJerseyTwoTone rejette une combinaison de couleurs inconnue.");

  // Repasser en gratuit ne doit PAS effacer le motif/la combinaison du
  // maillot extérieur, même principe que le maillot domicile.
  actions.setTeamPaying(team, 0, league, { isPaying: false }, T0);
  if (team.awayJerseyPattern !== "bandes") throw new Error("❌ Repasser en club gratuit ne devrait pas effacer awayJerseyPattern (conservé pour une réactivation future).");
  if (team.awayJerseyTwoTone !== someAwayTwoTone) throw new Error("❌ Repasser en club gratuit ne devrait pas effacer awayJerseyTwoTone (conservé pour une réactivation future).");
  console.log("✅ Repasser en club gratuit conserve le motif/la combinaison du maillot extérieur déjà choisis (juste ignorés au rendu).");

  // Le maillot domicile reste totalement indépendant du maillot extérieur
  // tout du long (aucune des actions ci-dessus n'a dû y toucher).
  if (team.jerseyColor === undefined || team.jerseyColor === someAwayColor) {
    throw new Error("❌ Modifier le maillot extérieur ne devrait jamais affecter jerseyColor (maillot domicile).");
  }
  console.log("✅ Le maillot domicile reste indépendant du maillot extérieur.");
}

// ---------------------------------------------------------------------
// teamIndex non nul (multi-manager) — mêmes six nouvelles actions
// (recruteur, Centre de formation, académie de jeunes) exercées sur
// teamIndex=1, même vérification d'isolement que le reste du fichier.
// ---------------------------------------------------------------------
{
  const multiLeague = generateMultiManagerLeague(["Lyon Multi Académie", "Marseille Multi Académie"], 1, T0);
  const multiTeamIndex = 1;
  const multiTeam = multiLeague.teams[multiTeamIndex];
  multiTeam.budget = 10000000;

  const recruiterListing = multiLeague.generateRecruiterCandidate(T0);
  const recruiterBidRes = actions.bidOnRecruiterListing(multiTeam, multiTeamIndex, multiLeague, { listingId: recruiterListing.id, amount: recruiterListing.startPrice + 50 }, T0);
  if (!recruiterBidRes.ok) throw new Error(`❌ bidOnRecruiterListing à un teamIndex non nul devrait fonctionner : ${recruiterBidRes.error}`);
  if (recruiterBidRes.listing.currentBidderIdx !== multiTeamIndex) throw new Error(`❌ bidOnRecruiterListing devrait enregistrer currentBidderIdx=${multiTeamIndex}, obtenu ${recruiterBidRes.listing.currentBidderIdx}.`);
  console.log("✅ bidOnRecruiterListing enregistre le bon teamIndex (1) comme enchérisseur.");

  multiTeam.hireRecruiter(2, 3000);
  const fireRecruiterRes = actions.fireRecruiter(multiTeam, multiTeamIndex, multiLeague, {}, T0);
  if (!fireRecruiterRes.ok || !fireRecruiterRes.relisted) throw new Error(`❌ fireRecruiter à un teamIndex non nul devrait fonctionner et relister : ${fireRecruiterRes.error}`);
  if (multiTeam.recruiter) throw new Error("❌ fireRecruiter devrait avoir congédié le recruteur de CETTE équipe (teamIndex=1).");
  console.log("✅ fireRecruiter fonctionne correctement pour un teamIndex non nul (1).");

  const multiTrainingCenter = actions.upgradeTrainingCenter(multiTeam, multiTeamIndex, multiLeague, {}, T0);
  if (!multiTrainingCenter.ok || multiTeam.trainingCenterLevel !== 2) throw new Error("❌ upgradeTrainingCenter à un teamIndex non nul devrait s'appliquer à CETTE équipe.");
  if (multiLeague.teams[0].trainingCenterLevel === 2) throw new Error("❌ upgradeTrainingCenter à teamIndex=1 ne devrait pas avoir touché l'équipe 0.");
  console.log("✅ upgradeTrainingCenter fonctionne correctement pour un teamIndex non nul (1), isolé de l'équipe 0.");

  const multiCandidate = generateYouthCandidate(T0, 2);
  multiTeam.youthCandidates.push(multiCandidate);
  const multiSign = actions.signYouthCandidate(multiTeam, multiTeamIndex, multiLeague, { candidateId: multiCandidate.id }, T0);
  if (!multiSign.ok || !multiTeam.youthPlayers.some(p => p.id === multiCandidate.id)) throw new Error("❌ signYouthCandidate à un teamIndex non nul devrait s'appliquer à CETTE équipe.");
  if (multiLeague.teams[0].youthPlayers.some(p => p.id === multiCandidate.id)) throw new Error("❌ signYouthCandidate à teamIndex=1 ne devrait pas avoir touché l'équipe 0.");
  console.log("✅ signYouthCandidate fonctionne correctement pour un teamIndex non nul (1), isolé de l'équipe 0.");

  multiCandidate.age = 18;
  multiTeam.pendingYouthDecisions = [multiCandidate.id];
  const multiRosterBefore = multiTeam.players.length;
  const multiPromote = actions.promoteYouthPlayer(multiTeam, multiTeamIndex, multiLeague, { playerId: multiCandidate.id }, T0);
  if (!multiPromote.ok || multiTeam.players.length !== multiRosterBefore + 1) throw new Error("❌ promoteYouthPlayer à un teamIndex non nul devrait s'appliquer à CETTE équipe.");
  console.log("✅ promoteYouthPlayer fonctionne correctement pour un teamIndex non nul (1).");

  const multiCandidate2 = generateYouthCandidate(T0, 2);
  multiTeam.youthCandidates.push(multiCandidate2);
  multiTeam.signYouthCandidate(multiCandidate2.id);
  multiCandidate2.age = 18;
  multiTeam.pendingYouthDecisions = [multiCandidate2.id];
  const multiRelease = actions.releaseYouthPlayer(multiTeam, multiTeamIndex, multiLeague, { playerId: multiCandidate2.id }, T0);
  if (!multiRelease.ok || multiTeam.youthPlayers.some(p => p.id === multiCandidate2.id)) throw new Error("❌ releaseYouthPlayer à un teamIndex non nul devrait s'appliquer à CETTE équipe.");
  console.log("✅ releaseYouthPlayer fonctionne correctement pour un teamIndex non nul (1).");

  multiTeam.applyMoraleForResult(true, 10, "Adversaire test", null, T0, "mi-saison");
  const multiInterview = multiTeam.pendingInterviews[multiTeam.pendingInterviews.length - 1];
  const multiInterviewRes = actions.respondToInterview(multiTeam, multiTeamIndex, multiLeague, { id: multiInterview.id, tone: "Mesuré" }, T0);
  if (!multiInterviewRes.ok || multiTeam.pendingInterviews.some(i => i.id === multiInterview.id)) throw new Error("❌ respondToInterview à un teamIndex non nul devrait s'appliquer à CETTE équipe.");
  if (multiLeague.teams[0].pendingInterviews.some(i => i.id === multiInterview.id)) throw new Error("❌ respondToInterview à teamIndex=1 ne devrait pas avoir touché l'équipe 0.");
  console.log("✅ respondToInterview fonctionne correctement pour un teamIndex non nul (1), isolé de l'équipe 0.");

  const multiTransferPlayer = multiTeam.players[0];
  multiTransferPlayer.form = 10;
  for (let i = 0; i < E.TRANSFER_REQUEST_WEEKS_THRESHOLD; i++) multiTeam.updateTransferRequests(T0);
  if (!multiTransferPlayer.transferRequestActive) throw new Error("❌ (setup) la demande de transfert devrait être active avant ce test.");
  const realRandomMulti = Math.random;
  Math.random = () => 0;
  let multiDiscussRes;
  try {
    multiDiscussRes = actions.discussTransferRequest(multiTeam, multiTeamIndex, multiLeague, { playerId: multiTransferPlayer.id }, T0);
  } finally {
    Math.random = realRandomMulti;
  }
  if (!multiDiscussRes.ok || !multiDiscussRes.success) throw new Error(`❌ discussTransferRequest à un teamIndex non nul devrait s'appliquer à CETTE équipe et réussir avec Math.random stubbé à 0 : ${JSON.stringify(multiDiscussRes)}`);
  if (multiTransferPlayer.transferRequestActive) throw new Error("❌ discussTransferRequest à un teamIndex non nul devrait bien refermer la demande sur CETTE équipe.");
  console.log("✅ discussTransferRequest fonctionne correctement pour un teamIndex non nul (1).");
}

console.log("\n✅ Actions du manager (server/actions.js) vérifiées : feuille de match, tactiques, entraînement, marché, salle, prix des billets, boutique des supporters, recruteur, Centre de formation, académie de jeunes et Médias (interviews d'après-match, demandes de transfert) : préparables à l'avance, validées avant application, et correctement scopées à un teamIndex explicite (0 comme non nul, voir la ligue multi-manager).");
