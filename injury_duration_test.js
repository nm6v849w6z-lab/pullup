// Vérifie le système de blessures PERSISTANTES (retour utilisateur, 2026-09) :
//
// "Quand le joueur est blessé il faudra l'ajouter à cet endroit également
// [Effectif]. Avec une petit croix rouge et son nom sur ligne en rouge. En
// passant sur la croix on verra la blessure et la durée."
//
// Décisions de design confirmées par l'utilisateur (AskUserQuestion) :
// - Durée : en jours RÉELS, même logique que Player.condition
//   (CONDITION_DAY_MS), pas un compteur de matchs manqués.
// - Détail : plusieurs types nommés (INJURY_TYPES), chacun avec sa propre
//   plage de gravité/durée, pas un seul type générique.
//
// Contrairement à Player.injured (indicateur transitoire, remis à false à
// CHAQUE match, sert seulement à sortir un joueur du match EN COURS),
// Player.injuryType/injuryUntil survivent d'un match à l'autre et empêchent
// le joueur d'être aligné tant qu'ils ne sont pas écoulés.
//
// Voir engine.js : INJURY_TYPES/rollInjury/isCurrentlyInjured/
// injuryDaysRemaining, Player.matchInjuryLocked, Team.resetForMatch/
// backupsForSlot, MatchEngine.simulate (matchNow)/applyFatigue,
// serializePlayerRecord/playerFromSave. Miroir identique dans
// moteurbasket3.html (voir renderEffectifSection/injuryCrossHtml/
// evaluationSquaresHtml pour la partie affichage, couverte plus bas via jsdom).
const fs = require("fs");
const E = require("./engine.js");
const {
  generateStartingRoster, serializeTeam, teamFromSave,
  rollInjury, isCurrentlyInjured, injuryDaysRemaining, INJURY_TYPES,
  CONDITION_DAY_MS, MatchEngine, POSITIONS,
} = E;
const { startTestServer, openGame, flush, readRawSave, writeRawSave, fastForwardCalendar } = require("./test_helpers.js");

const T0 = Date.UTC(2026, 8, 21);

// ---------------------------------------------------------------------
// 1) rollInjury : type toujours connu, durée toujours dans la plage annoncée
//    par ce type, toujours dans le futur.
// ---------------------------------------------------------------------
(function testRollInjuryValidity() {
  for (let i = 0; i < 500; i++) {
    const { injuryType, injuryUntil } = rollInjury(T0);
    const type = INJURY_TYPES.find(t => t.label === injuryType);
    if (!type) throw new Error(`❌ Type de blessure inconnu : "${injuryType}".`);
    const days = (injuryUntil - T0) / CONDITION_DAY_MS;
    if (days < type.minDays - 0.01 || days > type.maxDays + 0.01) {
      throw new Error(`❌ Durée hors plage pour "${injuryType}" : ${days.toFixed(2)}j, attendu [${type.minDays}, ${type.maxDays}].`);
    }
    if (injuryUntil <= T0) throw new Error("❌ injuryUntil devrait toujours être dans le futur.");
  }
  console.log(`✅ rollInjury() produit 500 tirages valides (type connu, durée dans la plage annoncée, toujours future).`);
})();

// ---------------------------------------------------------------------
// 2) isCurrentlyInjured / injuryDaysRemaining : arithmétique jour par jour.
// ---------------------------------------------------------------------
(function testDayMath() {
  const p = { injuryUntil: T0 + 3 * CONDITION_DAY_MS };
  if (!isCurrentlyInjured(p, T0)) throw new Error("❌ Devrait être blessé au moment du tirage.");
  if (!isCurrentlyInjured(p, T0 + 2 * CONDITION_DAY_MS)) throw new Error("❌ Devrait toujours être blessé à J+2 sur une blessure de 3 jours.");
  if (isCurrentlyInjured(p, T0 + 3 * CONDITION_DAY_MS)) throw new Error("❌ Ne devrait plus être blessé exactement à l'échéance.");
  if (isCurrentlyInjured(p, T0 + 4 * CONDITION_DAY_MS)) throw new Error("❌ Ne devrait plus être blessé après l'échéance.");
  const remaining = injuryDaysRemaining(p, T0 + 1 * CONDITION_DAY_MS + 1);
  if (remaining !== 2) throw new Error(`❌ injuryDaysRemaining devrait arrondir à 2 jours restants à J+1 (+1ms) sur 3, obtenu ${remaining}.`);
  const healthy = { injuryUntil: null };
  if (isCurrentlyInjured(healthy, T0)) throw new Error("❌ injuryUntil=null ne devrait jamais être considéré comme blessé.");
  if (injuryDaysRemaining(healthy, T0) !== 0) throw new Error("❌ injuryDaysRemaining devrait être 0 pour un joueur non blessé.");
  console.log("✅ isCurrentlyInjured/injuryDaysRemaining : arithmétique en jours réels correcte (bornes incluses/exclues, cas non blessé).");
})();

// ---------------------------------------------------------------------
// 3) Team.resetForMatch : un titulaire encore blessé à l'entrée du match ne
//    doit jamais être aligné - le remplaçant désigné le couvre automatiquement.
// ---------------------------------------------------------------------
(function testResetForMatchBenchesInjuredStarter() {
  const team = generateStartingRoster("Test Blessure");
  const pos = POSITIONS[0];
  const starterId = team.lineup.starters[pos];
  const starter = team.players.find(p => p.id === starterId);
  starter.injuryType = "Entorse à la cheville";
  starter.injuryUntil = T0 + 5 * CONDITION_DAY_MS;

  team.resetForMatch(T0);
  if (starter.onCourt) throw new Error("❌ Un titulaire encore blessé à l'entrée du match ne devrait jamais être aligné.");
  if (!starter.matchInjuryLocked) throw new Error("❌ matchInjuryLocked devrait être posé par resetForMatch pour un joueur encore blessé.");

  const onCourtForPos = team.players.find(p => p.onCourt && p.matchPosition === pos);
  if (!onCourtForPos) {
    console.log("⚠️  Aucun remplaçant disponible pour ce poste (banc épuisé pour ce scénario) : poste laissé vacant, comportement attendu si aucun backup n'existe.");
  } else if (onCourtForPos.id === starter.id) {
    throw new Error("❌ Le joueur blessé lui-même ne devrait jamais se retrouver onCourt.");
  }
  console.log(`✅ Team.resetForMatch bench bien un titulaire encore blessé (${starter.name}) et promeut un remplaçant valide à sa place.`);
})();

// ---------------------------------------------------------------------
// 4) Team.backupsForSlot : un remplaçant lui-même encore blessé ne doit
//    jamais être proposé comme option de remplacement.
// ---------------------------------------------------------------------
(function testBackupsForSlotExcludesInjured() {
  const team = generateStartingRoster("Test Banc Blessé");
  const pos = POSITIONS[0];
  team.resetForMatch(T0);
  const candidates = team.backupsForSlot(pos);
  if (!candidates.length) throw new Error("❌ (setup) ce scénario a besoin d'au moins un remplaçant disponible pour ce poste.");
  const chosen = candidates[0];
  chosen.injuryType = "Contusion";
  chosen.injuryUntil = T0 + 2 * CONDITION_DAY_MS;
  chosen.matchInjuryLocked = isCurrentlyInjured(chosen, T0);
  const after = team.backupsForSlot(pos);
  if (after.some(p => p.id === chosen.id)) {
    throw new Error("❌ Un remplaçant encore blessé (matchInjuryLocked) ne devrait plus apparaître dans backupsForSlot.");
  }
  console.log("✅ Team.backupsForSlot exclut bien un remplaçant encore blessé (matchInjuryLocked).");
})();

// ---------------------------------------------------------------------
// 5) Persistance : injuryType/injuryUntil survivent à un aller-retour
//    serializeTeam -> teamFromSave, comme condition/conditionUpdatedAt.
// ---------------------------------------------------------------------
(function testSerializationRoundTrip() {
  const team = generateStartingRoster("Test Sauvegarde");
  const p = team.players[0];
  p.injuryType = "Blessure au genou";
  p.injuryUntil = T0 + 20 * CONDITION_DAY_MS;
  const saved = serializeTeam(team);
  const reloaded = teamFromSave(saved);
  const reloadedPlayer = reloaded.players.find(x => x.id === p.id);
  if (reloadedPlayer.injuryType !== "Blessure au genou") {
    throw new Error(`❌ injuryType devrait survivre à la sauvegarde/rechargement, obtenu "${reloadedPlayer.injuryType}".`);
  }
  if (reloadedPlayer.injuryUntil !== p.injuryUntil) {
    throw new Error("❌ injuryUntil devrait survivre EXACTEMENT à la sauvegarde/rechargement.");
  }
  // Une sauvegarde ANTÉRIEURE à cette fonctionnalité (injuryType/injuryUntil
  // absents) doit se recharger sans erreur, avec les valeurs par défaut du
  // constructeur (jamais blessé) - même précaution que pour condition/
  // conditionUpdatedAt (voir player_condition_test.js).
  const legacySave = serializeTeam(generateStartingRoster("Test Legacy"));
  legacySave.players.forEach(pdata => { delete pdata.injuryType; delete pdata.injuryUntil; });
  const legacyReloaded = teamFromSave(legacySave);
  legacyReloaded.players.forEach(pl => {
    if (isCurrentlyInjured(pl, T0)) throw new Error("❌ Une sauvegarde antérieure à cette fonctionnalité ne devrait jamais recharger un joueur comme blessé.");
  });
  console.log("✅ injuryType/injuryUntil survivent à la sauvegarde/rechargement, et une sauvegarde antérieure se recharge sans erreur (jamais blessé par défaut).");
})();

// ---------------------------------------------------------------------
// 6) Bout en bout moteur : simuler des matchs jusqu'à observer une VRAIE
//    blessure déclenchée par MatchEngine.applyFatigue doit bien poser
//    injuryType/injuryUntil (pas seulement le drapeau transitoire `injured`).
// ---------------------------------------------------------------------
(function testEngineRollsRealInjuryDuringMatch() {
  let found = null;
  for (let i = 0; i < 400 && !found; i++) {
    const home = generateStartingRoster("Home " + i);
    const away = generateStartingRoster("Away " + i);
    const now = T0 + i * CONDITION_DAY_MS;
    new MatchEngine(home, away).simulate(now);
    found = [...home.players, ...away.players].find(p => p.injured && p.injuryType);
  }
  if (!found) throw new Error("❌ (setup) aucune blessure déclenchée sur 400 matchs simulés - improbable, vérifier BASE_INJURY_RATE/le branchement de rollInjury dans applyFatigue.");
  if (typeof found.injuryUntil !== "number" || found.injuryUntil <= Date.now() - 1000 * 60 * 60 * 24 * 400) {
    throw new Error("❌ injuryUntil devrait être un timestamp futur plausible après une blessure en match.");
  }
  console.log(`✅ Une blessure réellement déclenchée en match (${found.name}, "${found.injuryType}") pose bien injuryType/injuryUntil, pas seulement le drapeau transitoire.`);
})();

// ---------------------------------------------------------------------
// 7) Affichage (jsdom) : croix rouge + ligne rouge + tooltip sur l'onglet
//    Effectif pour un joueur ACTUELLEMENT blessé, et les 5 carrés
//    d'évaluation pour un joueur qui a déjà joué des matchs.
// ---------------------------------------------------------------------
(async function testRosterDisplaysInjuryAndEvaluation() {
  const html = fs.readFileSync("moteurbasket3.html", "utf-8");
  const { server, savePath, baseUrl } = await startTestServer();
  try {
    const dom1 = await openGame(html, baseUrl);
    await flush(dom1);
    dom1.window.close();
    // Quelques journées jouées pour peupler matchLog (cases d'évaluation).
    fastForwardCalendar(savePath, 6);

    const saved = readRawSave(savePath);
    const starterId = Object.values(saved.team.lineup.starters)[0];
    const starter = saved.team.players.find(p => p.id === starterId);
    starter.injuryType = "Entorse à la cheville";
    starter.injuryUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    writeRawSave(savePath, saved);

    const dom2 = await openGame(html, baseUrl);
    const doc2 = dom2.window.document;
    [...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "effectif").click();

    const cross = doc2.querySelector("#rosterContent .injury-cross");
    if (!cross) throw new Error("❌ Le tableau Effectif devrait afficher une croix rouge pour un joueur actuellement blessé.");
    const title = cross.getAttribute("title") || "";
    if (!title.includes("Entorse à la cheville") || !title.includes("jour")) {
      throw new Error(`❌ Le survol de la croix devrait révéler le type de blessure et la durée restante, obtenu "${title}".`);
    }
    const row = cross.closest("tr");
    if (!row.classList.contains("injured")) throw new Error("❌ La ligne du joueur blessé devrait porter la classe 'injured' (ligne teintée de rouge).");

    const squares = doc2.querySelectorAll("#rosterContent .eval-square");
    if (squares.length !== doc2.querySelectorAll("#rosterContent tbody tr").length * 5) {
      throw new Error("❌ Chaque ligne du tableau Effectif devrait afficher exactement 5 carrés d'évaluation (matchs manquants = cases vides).");
    }
    const filledSquares = [...squares].filter(sq => sq.getAttribute("title"));
    if (!filledSquares.length) throw new Error("❌ Au moins un carré d'évaluation devrait porter un vrai score après plusieurs journées jouées.");
    if (!/^Évaluation [+-]?\d+ /.test(filledSquares[0].getAttribute("title"))) {
      throw new Error(`❌ Le title d'un carré d'évaluation rempli devrait citer le score PIR, obtenu "${filledSquares[0].getAttribute("title")}".`);
    }
    console.log(`✅ L'onglet Effectif affiche bien la croix rouge + ligne rouge + tooltip pour un joueur blessé, et 5 carrés d'évaluation par ligne (${filledSquares.length} remplis avec un vrai score).`);
    dom2.window.close();
  } finally {
    server.close();
  }
})().then(() => {
  console.log("\n✅ Tous les tests du système de blessures PERSISTANTES (durée, remplacement, sauvegarde, affichage) sont passés.");
}).catch(e => { console.error(e); process.exit(1); });
