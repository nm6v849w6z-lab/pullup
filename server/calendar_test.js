// Vérifie les calculs purs du calendrier réel (server/calendar.js) — aucune
// dépendance au moteur ni au disque, tout est déterministe (pas de vraie
// horloge).
const C = require("./calendar.js");
const {
  DAY_MS, WEEK_MS, ROUNDS_PER_REAL_WEEK,
  realWeekIndexForRound, slotIndexForRound, isLastRoundOfRealWeek,
  scheduledTimeForRound, scheduledTimeForLeagueRound, realWeekEndAt,
  FAST_WEEK_MS, FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS,
  setFastTestMode, isFastTestModeEnabled, getDefaultCalendarConfig,
} = C;

// ---------------------------------------------------------------------
// 2 matchs de championnat par semaine réelle (retour utilisateur) : c'est
// la valeur la plus structurante de tout le module — si elle change un
// jour (ajout d'un 3e créneau, coupe/amical), une bonne partie des
// assertions ci-dessous devra être revue en même temps, ce qui est
// volontaire (le test sert de garde-fou explicite sur cette hypothèse).
// ---------------------------------------------------------------------
if (ROUNDS_PER_REAL_WEEK !== 2) {
  throw new Error(`❌ ROUNDS_PER_REAL_WEEK devrait valoir 2 (2 matchs de championnat/semaine réelle), obtenu ${ROUNDS_PER_REAL_WEEK}.`);
}
console.log("✅ 2 journées de championnat par semaine réelle.");

// ---------------------------------------------------------------------
// Répartition semaine/créneau : rounds 0,1 -> semaine 0 (créneaux 0,1) ;
// rounds 2,3 -> semaine 1 ; etc. Sur 18 journées (championnat 10 équipes
// aller-retour), ça doit tomber pile sur 9 semaines réelles complètes.
// ---------------------------------------------------------------------
{
  const expected = [
    [0, 0, 0, false], [1, 0, 1, true],
    [2, 1, 0, false], [3, 1, 1, true],
    [17, 8, 1, true],
  ];
  expected.forEach(([round, week, slot, isLast]) => {
    const gotWeek = realWeekIndexForRound(round);
    const gotSlot = slotIndexForRound(round);
    const gotLast = isLastRoundOfRealWeek(round);
    if (gotWeek !== week) throw new Error(`❌ realWeekIndexForRound(${round}) devrait être ${week}, obtenu ${gotWeek}.`);
    if (gotSlot !== slot) throw new Error(`❌ slotIndexForRound(${round}) devrait être ${slot}, obtenu ${gotSlot}.`);
    if (gotLast !== isLast) throw new Error(`❌ isLastRoundOfRealWeek(${round}) devrait être ${isLast}, obtenu ${gotLast}.`);
  });
  // 18 journées (10 équipes, aller-retour) = 9 semaines réelles pile.
  const totalRounds = 18;
  const lastRound = totalRounds - 1;
  if (realWeekIndexForRound(lastRound) !== 8) {
    throw new Error(`❌ La dernière journée (${lastRound}) d'une saison à 18 journées devrait tomber en semaine réelle 8 (9e semaine), obtenu ${realWeekIndexForRound(lastRound)}.`);
  }
  console.log("✅ Répartition semaine/créneau correcte — 18 journées tiennent pile dans 9 semaines réelles.");
}

// ---------------------------------------------------------------------
// Horaires programmés : espacés (pas dos à dos) à l'intérieur d'une même
// semaine réelle, et strictement croissants d'une journée à l'autre —
// jamais deux journées au même horaire, jamais un ordre chronologique
// inversé par rapport à l'ordre des journées.
// ---------------------------------------------------------------------
{
  const calendarStartAt = Date.UTC(2026, 8, 7); // un lundi arbitraire
  const totalRounds = 18;
  let previousTime = -Infinity;
  for (let round = 0; round < totalRounds; round++) {
    const t = scheduledTimeForRound(calendarStartAt, round);
    if (t <= previousTime) {
      throw new Error(`❌ scheduledTimeForRound(${round}) = ${t} devrait être strictement après la journée précédente (${previousTime}).`);
    }
    // Toujours dans les 7 jours de SA semaine réelle.
    const week = realWeekIndexForRound(round);
    const weekStart = calendarStartAt + week * WEEK_MS;
    const weekEnd = weekStart + WEEK_MS;
    if (t < weekStart || t >= weekEnd) {
      throw new Error(`❌ scheduledTimeForRound(${round}) = ${t} devrait tomber dans sa semaine réelle [${weekStart}, ${weekEnd}).`);
    }
    previousTime = t;
  }
  console.log(`✅ Les ${totalRounds} journées sont programmées à des horaires strictement croissants, chacune dans sa propre semaine réelle.`);

  // Les deux matchs d'une même semaine sont espacés d'au moins 1 jour plein
  // (pas "dos à dos" le même jour) — retour utilisateur implicite (une
  // vraie semaine, pas deux matchs collés).
  const t0 = scheduledTimeForRound(calendarStartAt, 0);
  const t1 = scheduledTimeForRound(calendarStartAt, 1);
  if (t1 - t0 < DAY_MS) {
    throw new Error(`❌ Les 2 matchs de championnat d'une même semaine réelle devraient être espacés d'au moins 1 jour, obtenu ${(t1 - t0) / DAY_MS} jour(s).`);
  }
  console.log(`✅ Les 2 matchs d'une même semaine réelle sont bien espacés (${(t1 - t0) / DAY_MS} jours).`);
}

// ---------------------------------------------------------------------
// realWeekEndAt : borne de fin de semaine cohérente avec les horaires de
// match (le 2e match de la semaine tombe forcément AVANT la fin de sa
// semaine réelle).
// ---------------------------------------------------------------------
{
  const calendarStartAt = 1_700_000_000_000;
  for (let week = 0; week < 5; week++) {
    const end = realWeekEndAt(calendarStartAt, week);
    const secondRound = week * ROUNDS_PER_REAL_WEEK + 1;
    const secondMatchTime = scheduledTimeForRound(calendarStartAt, secondRound);
    if (secondMatchTime >= end) {
      throw new Error(`❌ Le 2e match de la semaine réelle ${week} (${secondMatchTime}) devrait tomber avant la fin de cette semaine (${end}).`);
    }
  }
  console.log("✅ realWeekEndAt cohérent avec les horaires de match calculés par scheduledTimeForRound.");
}

// ---------------------------------------------------------------------
// Cohérence avec la copie CÔTÉ NAVIGATEUR (engine.js) : moteurbasket3.html
// embarque engine.js (pas server/calendar.js, qui ne tourne que côté
// serveur) et y a sa PROPRE copie des mêmes formules pures pour afficher un
// compte à rebours sans dépendre du réseau (voir le commentaire au-dessus de
// calendarScheduledTimeForRound dans engine.js) — ce test croisé garantit
// que les deux copies restent identiques : si l'une des deux dérive, ce
// test échoue immédiatement plutôt que de laisser le compte à rebours
// afficher une heure différente de celle réellement appliquée par le
// serveur.
// ---------------------------------------------------------------------
{
  const Engine = require("../engine.js");
  const calendarStartAt = Date.UTC(2026, 8, 7);
  for (let round = 0; round < 40; round++) {
    const serverTime = scheduledTimeForRound(calendarStartAt, round);
    const clientTime = Engine.calendarScheduledTimeForRound(calendarStartAt, round);
    if (serverTime !== clientTime) {
      throw new Error(`❌ scheduledTimeForRound(${round}) diverge : serveur=${serverTime}, navigateur (engine.js)=${clientTime}.`);
    }
  }
  console.log("✅ La copie côté navigateur (engine.js) des formules de calendrier (horaires sur 40 journées) est identique à server/calendar.js.");
}

// ---------------------------------------------------------------------
// MODE ACCÉLÉRÉ (tests/démo solo, retour utilisateur 2026-09) — vérifie que
// scheduledTimeForRound accepte bien un rythme personnalisé (weekMs/
// slotOffsetsMs explicites) SANS toucher au comportement par défaut
// (classique) testé ci-dessus, que scheduledTimeForLeagueRound lit
// correctement calendarWeekMs/calendarSlotOffsetsMs sur une ligue (avec
// repli sur le classique pour une ligue/ancienne sauvegarde qui ne les a
// pas), et que setFastTestMode/getDefaultCalendarConfig pilotent bien le
// réglage utilisé pour une NOUVELLE ligue (jamais pour une ligue déjà en
// cours, qui garde son propre rythme) — voir server/index.js
// (BASKET_FAST_CALENDAR) et server/store.js (createNewCareer).
// ---------------------------------------------------------------------
{
  const calendarStartAt = Date.UTC(2026, 8, 7);
  const HOUR_MS = 60 * 60 * 1000;

  // Un match toutes les 3h (resserré depuis 5h, retour utilisateur 2026-09 :
  // "sinon ça va être long les tests"), intervalle glissant depuis
  // calendarStartAt (pas d'ancrage sur une heure de la journée) : round0 à
  // +3h, round1 à +6h (fin de la "semaine" de 2 matchs, 6h au total).
  const fastRound0 = scheduledTimeForRound(calendarStartAt, 0, FAST_WEEK_MS, FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS);
  const fastRound1 = scheduledTimeForRound(calendarStartAt, 1, FAST_WEEK_MS, FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS);
  if (fastRound0 !== calendarStartAt + 3 * HOUR_MS) {
    throw new Error(`❌ En mode accéléré, le 1er match devrait tomber 3h après calendarStartAt, obtenu un décalage de ${(fastRound0 - calendarStartAt) / HOUR_MS}h.`);
  }
  if (fastRound1 !== calendarStartAt + 6 * HOUR_MS) {
    throw new Error(`❌ En mode accéléré, le 2e match devrait tomber 6h après calendarStartAt, obtenu un décalage de ${(fastRound1 - calendarStartAt) / HOUR_MS}h.`);
  }
  // Tous les matchs suivants doivent rester espacés d'exactement 3h,
  // indéfiniment (round2 = 9h, round3 = 12h, ...) — un intervalle glissant
  // uniforme, jamais un rythme "N matchs par journée calendaire".
  for (let round = 0; round < 10; round++) {
    const t = scheduledTimeForRound(calendarStartAt, round, FAST_WEEK_MS, FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS);
    const expected = calendarStartAt + (round + 1) * 3 * HOUR_MS;
    if (t !== expected) {
      throw new Error(`❌ En mode accéléré, le round ${round} devrait tomber exactement ${(round + 1) * 3}h après calendarStartAt (espacement uniforme de 3h), obtenu un décalage de ${(t - calendarStartAt) / HOUR_MS}h.`);
    }
  }
  // Le calendrier CLASSIQUE (appelé sans les 2 derniers arguments, comme
  // partout ailleurs dans ce fichier) doit rester totalement inchangé.
  if (scheduledTimeForRound(calendarStartAt, 0) !== calendarStartAt + 2 * DAY_MS) {
    throw new Error("❌ Le calendrier classique (sans config explicite) ne devrait jamais être affecté par l'existence du mode accéléré.");
  }
  console.log("✅ Mode accéléré : un match de championnat toutes les 3h (intervalle glissant, jamais ancré sur une heure de la journée) — sans jamais affecter le calendrier classique par défaut.");

  // scheduledTimeForLeagueRound : lit le rythme directement sur l'objet
  // ligue, avec repli sur le classique si absent (ancienne sauvegarde).
  const classicLeague = { calendarStartAt, calendarWeekMs: null, calendarSlotOffsetsMs: null };
  const fastLeague = { calendarStartAt, calendarWeekMs: FAST_WEEK_MS, calendarSlotOffsetsMs: FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS };
  if (scheduledTimeForLeagueRound(classicLeague, 0) !== scheduledTimeForRound(calendarStartAt, 0)) {
    throw new Error("❌ scheduledTimeForLeagueRound devrait retomber sur le calendrier classique quand calendarWeekMs/calendarSlotOffsetsMs sont absents.");
  }
  if (scheduledTimeForLeagueRound(fastLeague, 0) !== fastRound0) {
    throw new Error("❌ scheduledTimeForLeagueRound devrait utiliser le rythme accéléré de la ligue quand il est renseigné.");
  }
  console.log("✅ scheduledTimeForLeagueRound applique bien le rythme propre à chaque ligue (classique par défaut, accéléré si configuré).");

  // setFastTestMode/getDefaultCalendarConfig : pilotent le réglage GLOBAL
  // utilisé pour une NOUVELLE ligue — jamais activé par défaut.
  if (isFastTestModeEnabled()) throw new Error("❌ Le mode accéléré ne devrait jamais être activé par défaut.");
  const classicDefault = getDefaultCalendarConfig();
  if (classicDefault.weekMs !== WEEK_MS) throw new Error("❌ getDefaultCalendarConfig() devrait renvoyer le calendrier classique tant que le mode accéléré n'est pas activé.");
  setFastTestMode(true);
  if (!isFastTestModeEnabled()) throw new Error("❌ setFastTestMode(true) devrait activer le mode accéléré.");
  const fastDefault = getDefaultCalendarConfig();
  if (fastDefault.weekMs !== FAST_WEEK_MS || fastDefault.slotOffsetsMs !== FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS) {
    throw new Error("❌ getDefaultCalendarConfig() devrait renvoyer le rythme accéléré une fois le mode activé.");
  }
  setFastTestMode(false); // remis à false : ne doit jamais fuiter sur les autres tests (chaque fichier de test relance son propre process node, mais reste prudent au sein de celui-ci).
  if (getDefaultCalendarConfig().weekMs !== WEEK_MS) throw new Error("❌ setFastTestMode(false) devrait revenir au calendrier classique.");
  console.log("✅ setFastTestMode/getDefaultCalendarConfig pilotent bien le réglage global (jamais activé par défaut, désactivable).");

  // Cohérence croisée serveur/navigateur EN MODE ACCÉLÉRÉ aussi (mêmes
  // arguments explicites des deux côtés) — même garde-fou que le test
  // classique plus haut, pour ne jamais laisser diverger le compte à
  // rebours affiché d'un mode de calendrier à l'autre.
  const Engine = require("../engine.js");
  for (let round = 0; round < 20; round++) {
    const serverTime = scheduledTimeForRound(calendarStartAt, round, FAST_WEEK_MS, FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS);
    const clientTime = Engine.calendarScheduledTimeForRound(calendarStartAt, round, FAST_WEEK_MS, FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS);
    if (serverTime !== clientTime) {
      throw new Error(`❌ En mode accéléré, scheduledTimeForRound(${round}) diverge : serveur=${serverTime}, navigateur (engine.js)=${clientTime}.`);
    }
  }
  console.log("✅ La copie côté navigateur (engine.js) reste identique à server/calendar.js même avec un rythme personnalisé (mode accéléré).");
}

console.log("\n✅ Calendrier réel (server/calendar.js) : calculs purs vérifiés — 2 matchs de championnat par semaine réelle, horaires croissants et cohérents, y compris en mode accéléré (tests/démo).");
