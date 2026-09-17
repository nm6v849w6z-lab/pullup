// Vérifie server/actions.js pour la "tactique confirmée" (retour
// utilisateur, 2026-09 : "on a déjà tout défini ensemble ce matin avec le
// nouveau moteur de jeu" — six réglages tactiques supplémentaires réservés
// au niveau "confirmée", plus un septième (endgameManagement) indépendant du
// tier, voir le grand commentaire au-dessus de SCREEN_DEFENSES dans
// engine.js). Ce fichier couvre uniquement setTactics/setPlan (validation +
// application des nouveaux champs) — voir confirmed_tactics_test.js pour la
// partie navigateur (UI Ordres + persistance de bout en bout) et
// engine.js/moteurbasket3.html eux-mêmes pour la simulation.
const E = require("../engine.js");
const { generateStartingRoster, generateLeague, POSITIONS } = E;
const actions = require("./actions.js");

const T0 = Date.UTC(2026, 8, 17);

function freshTeamAndLeague() {
  const team = generateStartingRoster("Confirmée Test");
  const league = generateLeague(team, 1, T0);
  return { team, league };
}

// ---------------------------------------------------------------------
// setTactics : applique chacun des 7 nouveaux champs individuellement.
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const res = actions.setTactics(team, 0, league, {
    tacticalTier: "confirmée",
    screenDefense: "Switch",
    helpDefense: "Forte",
    watchAssignments: [{ position: "Ailier fort", focus: "denyEntry" }],
    postDefense: "Prise à deux",
    closeoutStyle: "Agressif",
    offRebStyle: "Agressif",
    endgameManagement: "Adaptatif",
  });
  if (!res.ok) throw new Error(`❌ Des réglages "confirmée" valides devraient être acceptés : ${res.error}`);
  console.log("setTactics (confirmée) — team :", {
    tacticalTier: team.tacticalTier, screenDefense: team.screenDefense, helpDefense: team.helpDefense,
    watchAssignments: team.watchAssignments, postDefense: team.postDefense, closeoutStyle: team.closeoutStyle,
    offRebStyle: team.offRebStyle, endgameManagement: team.endgameManagement,
  });
  if (team.tacticalTier !== "confirmée") throw new Error("❌ tacticalTier n'a pas été appliqué.");
  if (team.screenDefense !== "Switch") throw new Error("❌ screenDefense n'a pas été appliqué.");
  if (team.helpDefense !== "Forte") throw new Error("❌ helpDefense n'a pas été appliqué.");
  if (JSON.stringify(team.watchAssignments) !== JSON.stringify([{ position: "Ailier fort", focus: "denyEntry" }])) {
    throw new Error("❌ watchAssignments n'a pas été appliqué.");
  }
  if (team.postDefense !== "Prise à deux") throw new Error("❌ postDefense n'a pas été appliqué.");
  if (team.closeoutStyle !== "Agressif") throw new Error("❌ closeoutStyle n'a pas été appliqué.");
  if (team.offRebStyle !== "Agressif") throw new Error("❌ offRebStyle n'a pas été appliqué.");
  if (team.endgameManagement !== "Adaptatif") throw new Error("❌ endgameManagement n'a pas été appliqué.");
  console.log("✅ setTactics applique bien les 7 nouveaux réglages de tactique confirmée.");
}

// ---------------------------------------------------------------------
// setTactics : rejette chaque champ invalide individuellement (jamais de
// mutation partielle — voir fail() ci-dessus, chaque validateur s'exécute
// avant toute écriture sur `team`).
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const cases = [
    { tacticalTier: "expert" },
    { screenDefense: "Zone complète" },
    { helpDefense: "Extrême" },
    { watchAssignments: "pas un tableau" },
    { watchAssignments: [{ position: "Poste inconnu", focus: "denyPostUp" }] },
    { watchAssignments: [{ position: "Ailier fort", focus: "focus inconnu" }] },
    { watchAssignments: [{ position: "Meneur", focus: "reboundPriority" }, { position: "Arrière", focus: "reboundPriority" }, { position: "Ailier", focus: "reboundPriority" }, { position: "Ailier fort", focus: "reboundPriority" }] }, // 4 > MAX_WATCH_ASSIGNMENTS
    { postDefense: "Improvisation" },
    { closeoutStyle: "Passif" },
    { offRebStyle: "Kamikaze" },
    { endgameManagement: "Panique" },
  ];
  for (const body of cases) {
    const res = actions.setTactics(team, 0, league, body);
    console.log(`setTactics(${JSON.stringify(body)}) →`, res.ok ? "accepté (❌ inattendu)" : `rejeté (${res.error})`);
    if (res.ok) throw new Error(`❌ Ce réglage invalide aurait dû être rejeté : ${JSON.stringify(body)}.`);
  }
  console.log("✅ setTactics rejette chaque réglage de tactique confirmée invalide, sans muter l'équipe.");
}

// ---------------------------------------------------------------------
// setTactics : watchAssignments accepte bien exactement MAX_WATCH_ASSIGNMENTS
// (3) affectations, et un tableau vide (= aucune affectation, delta zéro).
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const threeAssignments = [
    { position: "Meneur", focus: "denyPostUp" },
    { position: "Arrière", focus: "harassOutsideShot" },
    { position: "Pivot", focus: "reboundPriority" },
  ];
  const res = actions.setTactics(team, 0, league, { watchAssignments: threeAssignments });
  if (!res.ok) throw new Error(`❌ Exactement 3 affectations "Surveiller" devraient être acceptées : ${res.error}`);
  if (team.watchAssignments.length !== 3) throw new Error("❌ Les 3 affectations auraient dû être appliquées.");
  console.log("✅ setTactics accepte exactement MAX_WATCH_ASSIGNMENTS (3) affectations \"Surveiller\".");

  const resEmpty = actions.setTactics(team, 0, league, { watchAssignments: [] });
  if (!resEmpty.ok) throw new Error(`❌ Un tableau vide watchAssignments devrait être accepté (= aucune affectation) : ${resEmpty.error}`);
  if (team.watchAssignments.length !== 0) throw new Error("❌ watchAssignments aurait dû être vidé.");
  console.log("✅ setTactics accepte un tableau watchAssignments vide (aucune affectation, comportement standard).");
}

// ---------------------------------------------------------------------
// setPlan : les mêmes 7 champs sont acceptés dans le patch d'une journée
// future (même validation, mêmes règles de fusion que setTactics), et
// survivent à Team.applyPlannedTacticsForRound.
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const futureRound = league.schedule.findIndex(dayMatches => dayMatches.some(m => m.home === 0 || m.away === 0));
  if (futureRound < 0) throw new Error("❌ (setup) aucune journée future trouvée pour l'équipe 0.");

  const res = actions.setPlan(team, 0, league, {
    round: futureRound,
    patch: {
      tacticalTier: "confirmée",
      screenDefense: "Prise à deux",
      helpDefense: "Faible",
      watchAssignments: [{ position: "Pivot", focus: "denyPostUp" }],
      postDefense: "Pousser vers le fond",
      closeoutStyle: "Agressif",
      offRebStyle: "Prudent",
      endgameManagement: "Adaptatif",
    },
  });
  if (!res.ok) throw new Error(`❌ Un patch "confirmée" valide sur une journée future devrait être accepté : ${res.error}`);
  const plan = team.plannedTactics[futureRound];
  console.log("Plan (journée future) après setPlan :", {
    tacticalTier: plan.tacticalTier, screenDefense: plan.screenDefense, watchAssignments: plan.watchAssignments,
  });
  if (plan.tacticalTier !== "confirmée" || plan.screenDefense !== "Prise à deux" || plan.helpDefense !== "Faible") {
    throw new Error("❌ Les nouveaux champs de tactique confirmée n'ont pas été enregistrés dans le plan.");
  }
  if (JSON.stringify(plan.watchAssignments) !== JSON.stringify([{ position: "Pivot", focus: "denyPostUp" }])) {
    throw new Error("❌ watchAssignments n'a pas été enregistré dans le plan.");
  }
  console.log("✅ setPlan accepte et enregistre les 7 nouveaux champs dans le patch d'une journée future.");

  // L'application du plan (au moment où sa journée devient la prochaine à
  // résoudre) doit reporter ces mêmes valeurs sur les ordres EN DIRECT.
  team.applyPlannedTacticsForRound(futureRound);
  console.log("Après applyPlannedTacticsForRound — ordres EN DIRECT :", {
    tacticalTier: team.tacticalTier, screenDefense: team.screenDefense, offRebStyle: team.offRebStyle,
  });
  if (team.tacticalTier !== "confirmée" || team.screenDefense !== "Prise à deux" || team.offRebStyle !== "Prudent") {
    throw new Error("❌ applyPlannedTacticsForRound n'a pas reporté les nouveaux champs sur les ordres en direct.");
  }
  console.log("✅ applyPlannedTacticsForRound reporte bien les nouveaux champs planifiés sur les ordres en direct.");
}

// ---------------------------------------------------------------------
// setPlan : rejette un champ de tactique confirmée invalide dans le patch,
// exactement comme setTactics.
// ---------------------------------------------------------------------
{
  const { team, league } = freshTeamAndLeague();
  const futureRound = league.schedule.findIndex(dayMatches => dayMatches.some(m => m.home === 0 || m.away === 0));
  const res = actions.setPlan(team, 0, league, { round: futureRound, patch: { screenDefense: "Zone complète" } });
  console.log("setPlan avec screenDefense invalide →", res.ok ? "accepté (❌ inattendu)" : `rejeté (${res.error})`);
  if (res.ok) throw new Error("❌ Un screenDefense invalide dans un patch de plan devrait être rejeté.");
  console.log("✅ setPlan rejette un champ de tactique confirmée invalide dans le patch, comme setTactics.");
}

console.log("\n✅ Tous les tests server/confirmed_tactics_actions_test.js sont passés.");
