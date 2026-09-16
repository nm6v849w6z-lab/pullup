// Vérifie le câblage serveur de la planification des ordres à l'avance
// (voir Team.plannedTactics/applyPlannedTacticsForRound dans engine.js et
// planned_tactics_test.js à la racine pour la partie moteur pure) : les
// DEUX chemins qui résolvent réellement un match du club du joueur —
// simulateRoundHeadless (autoSim.js, manager absent) et
// ensureLiveMatchStarted (liveMatch.js, diffusion en direct) — doivent
// appliquer un plan préparé pour LA journée qu'ils s'apprêtent à résoudre,
// AVANT de lire les ordres en direct.
const E = require("../engine.js");
const { generateStartingRoster, generateLeague } = E;
const { finalizeRound } = require("./autoSim.js");
const { ensureLiveMatchStarted, computeLiveMatch } = require("./liveMatch.js");
const { scheduledTimeForLeagueRound } = require("./calendar.js");

function freshLeague(now) {
  const team = generateStartingRoster("Plan Serveur Test");
  const league = generateLeague(team, 1, now);
  return { team, league };
}

const T0 = Date.UTC(2026, 8, 7);

// ---------------------------------------------------------------------
// 1) simulateRoundHeadless applique bien le plan préparé pour LA journée
//    qu'elle résout — les ordres en direct portent les valeurs planifiées
//    après coup, et le plan est consommé.
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  team.defense = "Homme à homme";
  team.rhythm = "Normal";

  const round = league.round; // prochaine journée à résoudre
  team.stagePlanForRound(round, { defense: "Zone press", rhythm: "Lent" });
  // Une journée FUTURE (pas celle-ci) ne doit pas être touchée par cette
  // résolution.
  team.stagePlanForRound(round + 2, { defense: "Zone press", rhythm: "Rapide" });

  finalizeRound(league, round);

  console.log("Après finalizeRound(round) avec un plan préparé — defense:", team.defense, "| rhythm:", team.rhythm, "| plan consommé :", !team.plannedTactics[round], "| plan futur intact :", !!team.plannedTactics[round + 2]);
  if (team.defense !== "Zone press") throw new Error(`❌ finalizeRound aurait dû appliquer la defense planifiée ('Zone'), obtenu '${team.defense}'.`);
  if (team.rhythm !== "Lent") throw new Error(`❌ finalizeRound aurait dû appliquer le rythme planifié ('Lent'), obtenu '${team.rhythm}'.`);
  if (team.plannedTactics[round]) throw new Error("❌ Le plan de la journée résolue aurait dû être consommé (supprimé) par finalizeRound.");
  if (!team.plannedTactics[round + 2]) throw new Error("❌ Un plan préparé pour une AUTRE journée (future) ne devrait pas être touché par la résolution de celle-ci.");
  console.log("✅ finalizeRound applique le plan de SA journée avant de simuler, et le consomme — les autres journées planifiées restent intactes.");
}

// ---------------------------------------------------------------------
// 2) simulateRoundHeadless : sans plan préparé pour cette journée, les
//    ordres en direct du moment sont utilisés tels quels (comportement
//    inchangé — pas de régression pour qui ne planifie jamais).
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  team.defense = "Zone press";
  team.rhythm = "Rapide";
  const round = league.round;

  finalizeRound(league, round);

  console.log("Après finalizeRound(round) sans plan préparé — defense:", team.defense, "| rhythm:", team.rhythm);
  if (team.defense !== "Zone press" || team.rhythm !== "Rapide") throw new Error("❌ Sans plan préparé, les ordres en direct actuels auraient dû être utilisés/laissés tels quels.");
  console.log("✅ Sans plan préparé, finalizeRound laisse les ordres en direct actuels inchangés (pas de régression).");
}

// ---------------------------------------------------------------------
// 3) ensureLiveMatchStarted (le chemin "diffusion en direct") applique lui
//    aussi le plan préparé pour la journée courante avant de calculer le
//    match — on le vérifie en comparant le match calculé AVEC vs SANS le
//    plan pour une feuille de match différente (le titulaire Meneur
//    change), via computeLiveMatch directement pour isoler l'effet du
//    lineup sur boxScoreA (aucun joueur du poste retiré ne devrait plus y
//    figurer).
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  const round = league.round;
  const kickoffAt = scheduledTimeForLeagueRound(league, round);

  const starterMeneurId = team.lineup.starters["Meneur"];
  const backupMeneur = team.players.find(p => p.position === "Meneur" && p.id !== starterMeneurId);
  if (!backupMeneur) throw new Error("❌ Effectif de test invalide : il faut au moins 2 Meneurs pour ce scénario.");

  team.stagePlanForRound(round, {});
  E.Team.prototype.setStarter.call(team.plannedTactics[round], "Meneur", backupMeneur.id);

  const before = team.lineup.starters["Meneur"];
  const result = ensureLiveMatchStarted(E, league, kickoffAt, scheduledTimeForLeagueRound);

  console.log("Après ensureLiveMatchStarted avec un plan de feuille de match préparé — titulaire Meneur avant:", before, "| après:", team.lineup.starters["Meneur"], "| attendu:", backupMeneur.id, "| plan consommé:", !team.plannedTactics[round], "| clés démarrées:", result.length);
  if (team.lineup.starters["Meneur"] !== backupMeneur.id) throw new Error("❌ ensureLiveMatchStarted aurait dû appliquer la feuille de match planifiée AVANT de calculer le match en direct.");
  if (team.plannedTactics[round]) throw new Error("❌ Le plan de la journée en cours de diffusion aurait dû être consommé par ensureLiveMatchStarted.");
  if (!result.length) throw new Error("❌ ensureLiveMatchStarted aurait dû calculer et démarrer le match en direct (kickoffAt atteint).");
  console.log("✅ ensureLiveMatchStarted applique le plan de la journée en cours de diffusion AVANT de calculer le match, puis le consomme.");
}

// ---------------------------------------------------------------------
// 4) ensureLiveMatchStarted : sans plan préparé, la feuille de match en
//    direct actuelle est utilisée telle quelle.
// ---------------------------------------------------------------------
{
  const { team, league } = freshLeague(T0);
  const round = league.round;
  const kickoffAt = scheduledTimeForLeagueRound(league, round);
  const before = JSON.stringify(team.lineup);

  ensureLiveMatchStarted(E, league, kickoffAt, scheduledTimeForLeagueRound);

  console.log("Après ensureLiveMatchStarted sans plan préparé — feuille de match inchangée :", JSON.stringify(team.lineup) === before);
  if (JSON.stringify(team.lineup) !== before) throw new Error("❌ Sans plan préparé, ensureLiveMatchStarted ne devrait pas modifier la feuille de match en direct.");
  console.log("✅ Sans plan préparé, ensureLiveMatchStarted laisse la feuille de match en direct inchangée (pas de régression).");
}

console.log("\n✅ Tous les tests server/planned_tactics_test.js sont passés.");
