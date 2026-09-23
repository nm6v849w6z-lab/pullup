// Vérifie la demande de transfert dans la presse (retour utilisateur,
// 2026-09) : "un joueur très frustré (motivation proche de 0 depuis 3
// semaines) peut demander son transfert dans la presse. Ne rien faire laisse
// sa motivation proche de 0, ouvrir la discussion avec lui pour le
// remotiver (ne marche pas à chaque fois) ou le vendre sont les deux
// possibilités."
//
// Voir engine.js : le grand commentaire au-dessus de
// TRANSFER_REQUEST_MOTIVATION_THRESHOLD, Player.weeksAtLowMotivation /
// transferRequestActive / transferRequestQuote, Team.updateTransferRequests
// (appelée chaque semaine par trainWeek) et Team.discussTransferRequest
// (l'action "discuter" du manager).
//
// Test purement moteur (pas de serveur HTTP ni de DOM, comme
// bench_frustration_test.js) : plus rapide, se concentre sur la logique.
const E = require("./engine.js");
const {
  generateStartingRoster, ATTRS, MENTAL_ATTRS,
  TRANSFER_REQUEST_MOTIVATION_THRESHOLD, TRANSFER_REQUEST_WEEKS_THRESHOLD,
  TRANSFER_REQUEST_DISCUSS_BASE_CHANCE, TRANSFER_REQUEST_DISCUSS_MENTAL_BONUS,
  TRANSFER_REQUEST_DISCUSS_SUCCESS_FORM_BOOST,
} = E;

function freshTeam() {
  return generateStartingRoster("Transfer Request Test");
}

function anyPlayer(team) {
  return team.players[0];
}

// ---------------------------------------------------------------------
// 1) Le compteur de semaines sous le seuil augmente chaque semaine où la
//    motivation reste basse, et ne déclenche rien avant le seuil.
// ---------------------------------------------------------------------
(function testWeeksAtLowMotivationIncrements() {
  const team = freshTeam();
  const p = anyPlayer(team);
  p.form = TRANSFER_REQUEST_MOTIVATION_THRESHOLD; // pile au seuil, "proche de 0"

  team.updateTransferRequests(Date.now());
  if (p.weeksAtLowMotivation !== 1) {
    throw new Error(`❌ Après 1 semaine sous le seuil, weeksAtLowMotivation devrait valoir 1 (obtenu ${p.weeksAtLowMotivation}).`);
  }
  if (p.transferRequestActive) {
    throw new Error("❌ La demande de transfert ne devrait pas encore être active après 1 seule semaine.");
  }

  team.updateTransferRequests(Date.now());
  if (p.weeksAtLowMotivation !== 2 || p.transferRequestActive) {
    throw new Error(`❌ Après 2 semaines, compteur=2 et pas encore de demande active (obtenu weeksAtLowMotivation=${p.weeksAtLowMotivation}, transferRequestActive=${p.transferRequestActive}).`);
  }
  console.log("✅ weeksAtLowMotivation augmente chaque semaine sous le seuil, sans déclencher de demande avant le seuil.");
})();

// ---------------------------------------------------------------------
// 2) La demande de transfert se déclenche exactement au seuil de semaines
//    (TRANSFER_REQUEST_WEEKS_THRESHOLD = 3), avec une citation assignée.
// ---------------------------------------------------------------------
(function testTransferRequestTriggersAtThreshold() {
  const team = freshTeam();
  const p = anyPlayer(team);
  p.form = 10; // bien sous le seuil

  for (let i = 0; i < TRANSFER_REQUEST_WEEKS_THRESHOLD - 1; i++) {
    team.updateTransferRequests(Date.now());
  }
  if (p.transferRequestActive) {
    throw new Error(`❌ La demande ne devrait pas encore être active avant la ${TRANSFER_REQUEST_WEEKS_THRESHOLD}e semaine.`);
  }

  team.updateTransferRequests(Date.now()); // franchit le seuil
  if (!p.transferRequestActive) {
    throw new Error(`❌ La demande de transfert devrait être active après ${TRANSFER_REQUEST_WEEKS_THRESHOLD} semaines consécutives sous le seuil.`);
  }
  if (typeof p.transferRequestQuote !== "string" || !p.transferRequestQuote.includes(p.name)) {
    throw new Error(`❌ Une citation de presse mentionnant le joueur devrait être assignée (obtenu : ${JSON.stringify(p.transferRequestQuote)}).`);
  }
  console.log(`✅ La demande de transfert se déclenche pile au seuil de ${TRANSFER_REQUEST_WEEKS_THRESHOLD} semaines, avec une citation : "${p.transferRequestQuote}"`);
})();

// ---------------------------------------------------------------------
// 3) Une motivation qui remonte au-dessus du seuil remet le compteur à 0 et
//    referme une demande déjà active (ne rien faire ne suffit pas, mais la
//    remontée par tout autre moyen, elle, résout le problème).
// ---------------------------------------------------------------------
(function testRecoveringMotivationClearsRequest() {
  const team = freshTeam();
  const p = anyPlayer(team);
  p.form = 10;
  for (let i = 0; i < TRANSFER_REQUEST_WEEKS_THRESHOLD; i++) team.updateTransferRequests(Date.now());
  if (!p.transferRequestActive) throw new Error("❌ (setup) la demande devrait être active avant ce test.");

  p.form = 80; // remontée franche, par un autre moyen (interview, discussion, etc.)
  team.updateTransferRequests(Date.now());
  if (p.transferRequestActive || p.transferRequestQuote !== null || p.weeksAtLowMotivation !== 0) {
    throw new Error(`❌ Une motivation remontée au-dessus du seuil devrait effacer la demande (obtenu transferRequestActive=${p.transferRequestActive}, transferRequestQuote=${JSON.stringify(p.transferRequestQuote)}, weeksAtLowMotivation=${p.weeksAtLowMotivation}).`);
  }
  console.log("✅ Une motivation qui remonte au-dessus du seuil referme la demande de transfert et remet le compteur à 0.");
})();

// ---------------------------------------------------------------------
// 4) Ne rien faire (motivation qui reste proche de 0) laisse la demande
//    active semaine après semaine.
// ---------------------------------------------------------------------
(function testDoingNothingKeepsRequestActive() {
  const team = freshTeam();
  const p = anyPlayer(team);
  p.form = 5;
  for (let i = 0; i < TRANSFER_REQUEST_WEEKS_THRESHOLD; i++) team.updateTransferRequests(Date.now());
  if (!p.transferRequestActive) throw new Error("❌ (setup) la demande devrait être active avant ce test.");
  const quoteBefore = p.transferRequestQuote;

  team.updateTransferRequests(Date.now());
  team.updateTransferRequests(Date.now());
  if (!p.transferRequestActive) {
    throw new Error("❌ Ne rien faire ne devrait jamais refermer une demande de transfert active.");
  }
  if (p.transferRequestQuote !== quoteBefore) {
    throw new Error("❌ La citation ne devrait pas changer tant que la demande reste active et non résolue.");
  }
  console.log("✅ Ne rien faire laisse la demande de transfert active, sans changer la citation.");
})();

// ---------------------------------------------------------------------
// 5) discussTransferRequest rejette un joueur introuvable.
// ---------------------------------------------------------------------
(function testDiscussRejectsUnknownPlayer() {
  const team = freshTeam();
  const result = team.discussTransferRequest("id-inexistant", Date.now());
  if (result.ok !== false || result.reason !== "not-found") {
    throw new Error(`❌ Un playerId inconnu devrait renvoyer {ok:false, reason:"not-found"} (obtenu ${JSON.stringify(result)}).`);
  }
  console.log("✅ discussTransferRequest rejette proprement un playerId inconnu.");
})();

// ---------------------------------------------------------------------
// 6) discussTransferRequest rejette un joueur qui n'a pas de demande active.
// ---------------------------------------------------------------------
(function testDiscussRejectsNonRequestingPlayer() {
  const team = freshTeam();
  const p = anyPlayer(team);
  p.form = 80;
  p.transferRequestActive = false;
  const result = team.discussTransferRequest(p.id, Date.now());
  if (result.ok !== false || result.reason !== "not-requesting") {
    throw new Error(`❌ Un joueur sans demande active devrait renvoyer {ok:false, reason:"not-requesting"} (obtenu ${JSON.stringify(result)}).`);
  }
  console.log("✅ discussTransferRequest rejette proprement un joueur qui n'a pas demandé son transfert.");
})();

// ---------------------------------------------------------------------
// 7) discussTransferRequest, succès forcé (Math.random stubbé à 0, donc
//    toujours sous la chance calculée) : boost de forme, demande refermée,
//    compteur remis à 0.
// ---------------------------------------------------------------------
(function testDiscussSuccessPath() {
  const team = freshTeam();
  const p = anyPlayer(team);
  p.form = 10;
  for (let i = 0; i < TRANSFER_REQUEST_WEEKS_THRESHOLD; i++) team.updateTransferRequests(Date.now());
  if (!p.transferRequestActive) throw new Error("❌ (setup) la demande devrait être active avant ce test.");

  const realRandom = Math.random;
  Math.random = () => 0; // garantit success = true (0 < chance, chance > 0 toujours)
  let result;
  try {
    result = team.discussTransferRequest(p.id, Date.now());
  } finally {
    Math.random = realRandom;
  }

  if (!result.ok || !result.success) {
    throw new Error(`❌ Avec Math.random stubbé à 0, la discussion devrait réussir (obtenu ${JSON.stringify(result)}).`);
  }
  if (result.formBefore !== 10) {
    throw new Error(`❌ formBefore devrait valoir la forme avant discussion (obtenu ${result.formBefore}).`);
  }
  const expectedForm = Math.min(100, 10 + TRANSFER_REQUEST_DISCUSS_SUCCESS_FORM_BOOST);
  if (p.form !== expectedForm || result.formAfter !== expectedForm) {
    throw new Error(`❌ Un succès devrait booster la forme de ${TRANSFER_REQUEST_DISCUSS_SUCCESS_FORM_BOOST} (attendu ${expectedForm}, obtenu p.form=${p.form}, formAfter=${result.formAfter}).`);
  }
  if (p.transferRequestActive || p.transferRequestQuote !== null || p.weeksAtLowMotivation !== 0) {
    throw new Error("❌ Un succès devrait refermer la demande et remettre le compteur à 0.");
  }
  console.log(`✅ discussTransferRequest, succès : forme boostée (10 → ${p.form}), demande refermée.`);
})();

// ---------------------------------------------------------------------
// 8) discussTransferRequest, échec forcé (Math.random stubbé à 1, donc
//    toujours au-dessus de la chance calculée) : rien ne change, la demande
//    reste active ("ne marche pas à chaque fois").
// ---------------------------------------------------------------------
(function testDiscussFailurePath() {
  const team = freshTeam();
  const p = anyPlayer(team);
  p.form = 10;
  for (let i = 0; i < TRANSFER_REQUEST_WEEKS_THRESHOLD; i++) team.updateTransferRequests(Date.now());
  if (!p.transferRequestActive) throw new Error("❌ (setup) la demande devrait être active avant ce test.");
  const quoteBefore = p.transferRequestQuote;

  const realRandom = Math.random;
  Math.random = () => 0.999999; // garantit success = false (chance max = 0.65)
  let result;
  try {
    result = team.discussTransferRequest(p.id, Date.now());
  } finally {
    Math.random = realRandom;
  }

  if (!result.ok || result.success) {
    throw new Error(`❌ Avec Math.random stubbé proche de 1, la discussion devrait échouer (obtenu ${JSON.stringify(result)}).`);
  }
  if (p.form !== 10 || result.formAfter !== 10) {
    throw new Error(`❌ Un échec ne devrait rien changer à la forme (obtenu p.form=${p.form}, formAfter=${result.formAfter}).`);
  }
  if (!p.transferRequestActive || p.transferRequestQuote !== quoteBefore) {
    throw new Error("❌ Un échec ne devrait ni refermer la demande, ni changer la citation (le manager peut retenter plus tard, ou vendre le joueur).");
  }
  console.log("✅ discussTransferRequest, échec : rien ne change, la demande reste active.");
})();

// ---------------------------------------------------------------------
// 9) L'attribut Mental déplace la chance de succès de la fourchette
//    attendue (statistique, sur un grand nombre d'essais).
//    "mental" n'est plus stocké individuellement (retour utilisateur,
//    2026-09, voir mentalAverage() au-dessus de PHYSICAL_ATTRS dans
//    engine.js) : on fixe les 8 traits de MENTAL_ATTRS à la même valeur
//    pour obtenir exactement mentalAverage(p) === mental.
// ---------------------------------------------------------------------
(function testMentalAttributeShiftsSuccessChance() {
  const N = 4000;
  const team = freshTeam();

  function successRateForMental(mental) {
    const p = anyPlayer(team);
    MENTAL_ATTRS.forEach(a => { p.attrs[a] = mental; });
    let successes = 0;
    for (let i = 0; i < N; i++) {
      p.form = 10;
      p.transferRequestActive = false;
      p.weeksAtLowMotivation = 0;
      for (let w = 0; w < TRANSFER_REQUEST_WEEKS_THRESHOLD; w++) team.updateTransferRequests(Date.now());
      const result = team.discussTransferRequest(p.id, Date.now());
      if (result.success) successes++;
    }
    return successes / N;
  }

  const rateLowMental = successRateForMental(0);
  const rateHighMental = successRateForMental(100);

  const expectedLow = TRANSFER_REQUEST_DISCUSS_BASE_CHANCE;
  const expectedHigh = TRANSFER_REQUEST_DISCUSS_BASE_CHANCE + TRANSFER_REQUEST_DISCUSS_MENTAL_BONUS;
  const tolerance = 0.06;

  if (Math.abs(rateLowMental - expectedLow) > tolerance) {
    throw new Error(`❌ Taux de succès avec Mental=0 hors fourchette attendue (attendu ~${expectedLow}, obtenu ${rateLowMental}).`);
  }
  if (Math.abs(rateHighMental - expectedHigh) > tolerance) {
    throw new Error(`❌ Taux de succès avec Mental=100 hors fourchette attendue (attendu ~${expectedHigh}, obtenu ${rateHighMental}).`);
  }
  if (rateHighMental <= rateLowMental) {
    throw new Error(`❌ Un Mental élevé devrait donner un taux de succès plus élevé (Mental=0 → ${rateLowMental}, Mental=100 → ${rateHighMental}).`);
  }
  console.log(`✅ Le Mental déplace bien la chance de succès (Mental=0 → ${rateLowMental.toFixed(3)}, Mental=100 → ${rateHighMental.toFixed(3)}, attendu ~${expectedLow} à ~${expectedHigh}).`);
})();

// ---------------------------------------------------------------------
// 10) Sérialisation / désérialisation : les 3 nouveaux champs survivent à un
//     aller-retour de sauvegarde, et une ancienne sauvegarde qui ne les a
//     pas encore reste compatible (valeurs par défaut du constructeur).
// ---------------------------------------------------------------------
(function testSerializeDeserializeRoundTrip() {
  const team = freshTeam();
  const p = anyPlayer(team);
  p.weeksAtLowMotivation = 2;
  p.transferRequestActive = true;
  p.transferRequestQuote = "Une citation de test.";

  if (typeof E.serializePlayerRecord === "function" && typeof E.playerFromSave === "function") {
    const record = E.serializePlayerRecord(p);
    if (record.weeksAtLowMotivation !== 2 || record.transferRequestActive !== true || record.transferRequestQuote !== "Une citation de test.") {
      throw new Error(`❌ serializePlayerRecord devrait conserver les 3 nouveaux champs (obtenu ${JSON.stringify({ w: record.weeksAtLowMotivation, a: record.transferRequestActive, q: record.transferRequestQuote })}).`);
    }
    const restored = E.playerFromSave(record);
    if (restored.weeksAtLowMotivation !== 2 || restored.transferRequestActive !== true || restored.transferRequestQuote !== "Une citation de test.") {
      throw new Error(`❌ playerFromSave devrait restaurer les 3 nouveaux champs (obtenu ${JSON.stringify({ w: restored.weeksAtLowMotivation, a: restored.transferRequestActive, q: restored.transferRequestQuote })}).`);
    }

    // Compatibilité ascendante : une ancienne sauvegarde sans ces champs.
    const oldRecord = { ...record };
    delete oldRecord.weeksAtLowMotivation;
    delete oldRecord.transferRequestActive;
    delete oldRecord.transferRequestQuote;
    const restoredOld = E.playerFromSave(oldRecord);
    if (restoredOld.weeksAtLowMotivation !== 0 || restoredOld.transferRequestActive !== false || restoredOld.transferRequestQuote !== null) {
      throw new Error(`❌ Une sauvegarde sans ces champs devrait retomber sur les valeurs par défaut du constructeur (obtenu ${JSON.stringify({ w: restoredOld.weeksAtLowMotivation, a: restoredOld.transferRequestActive, q: restoredOld.transferRequestQuote })}).`);
    }
    console.log("✅ Sérialisation/désérialisation : les 3 nouveaux champs survivent à un aller-retour, et une ancienne sauvegarde reste compatible (valeurs par défaut).");
  } else {
    console.log("⚠️  serializePlayerRecord/playerFromSave non exportés directement : test de round-trip sauté (voir server/actions_test.js ou persistence_test.js pour une couverture via l'API applicative).");
  }
})();

console.log("\nTous les tests de demande de transfert sont passés.");
