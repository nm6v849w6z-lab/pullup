// Vérifie le CALENDRIER ANCRÉ QUOTIDIEN (retour utilisateur, 2026-09 — "la
// vraie saison de test" : "3 matchs par jour à heures fixes réelles : 10h
// Championnat, 15h Coupe, 19h Championnat", en heure de Paris, DST comprise)
// — voir le grand commentaire dans server/calendar.js. Calculs purs,
// déterministes (aucune vraie horloge) — même esprit que
// server/calendar_test.js pour le calendrier classique.
const C = require("./calendar.js");
const {
  DAILY_ANCHORED_CHAMPIONSHIP_HOURS, DAILY_ANCHORED_CUP_HOUR,
  parisUtcOffsetMs, parisEpochForLocalTime,
  dailyAnchoredCalendarConfig, dailyAnchoredCalendarStartAt,
  dailyAnchoredScheduledTimeForSlot,
  dailyAnchoredDayIndexForChampionshipRound, dailyAnchoredSlotIndexForChampionshipRound,
  dailyAnchoredScheduledTimeForChampionshipRound, dailyAnchoredScheduledTimeForCupRound,
} = C;
const HOUR_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------
// 1) Les 3 créneaux quotidiens tombent bien à 10h/15h/19h heure de PARIS,
//    hors tout changement d'heure (mi-septembre, CEST = UTC+2).
// ---------------------------------------------------------------------
{
  const calendarStartAt = parisEpochForLocalTime(2026, 9, 16, 10); // jour 0, 10h Paris (CEST, +2h)
  if (parisUtcOffsetMs(calendarStartAt) !== 2 * HOUR_MS) {
    throw new Error(`❌ Prérequis du test : le 16 septembre 2026 devrait être en heure d'été (UTC+2) à Paris, offset obtenu ${parisUtcOffsetMs(calendarStartAt) / HOUR_MS}h.`);
  }
  // round0 = jour0/10h, round1 = jour0/19h, round2 = jour1/10h...
  const r0 = dailyAnchoredScheduledTimeForChampionshipRound(calendarStartAt, 0);
  const r1 = dailyAnchoredScheduledTimeForChampionshipRound(calendarStartAt, 1);
  const r2 = dailyAnchoredScheduledTimeForChampionshipRound(calendarStartAt, 2);
  if (r0 !== calendarStartAt) throw new Error("❌ Le round 0 devrait tomber exactement à calendarStartAt (jour 0, 10h Paris).");
  if (r1 - r0 !== 9 * HOUR_MS) throw new Error(`❌ 10h -> 19h le même jour devrait faire 9h d'écart, obtenu ${(r1 - r0) / HOUR_MS}h.`);
  if (r2 - r1 !== 15 * HOUR_MS) throw new Error(`❌ 19h (jour 0) -> 10h (jour 1) devrait faire 15h d'écart (hors DST), obtenu ${(r2 - r1) / HOUR_MS}h.`);
  const cup0 = dailyAnchoredScheduledTimeForCupRound(calendarStartAt, 0);
  if (cup0 - r0 !== 5 * HOUR_MS) throw new Error(`❌ Le créneau de coupe (15h) du jour 0 devrait tomber 5h après le créneau de 10h, obtenu ${(cup0 - r0) / HOUR_MS}h.`);
  if (r1 - cup0 !== 4 * HOUR_MS) throw new Error(`❌ Le créneau de 19h devrait tomber 4h après celui de coupe (15h), obtenu ${(r1 - cup0) / HOUR_MS}h.`);
  console.log("✅ Les 3 créneaux quotidiens (10h Championnat, 15h Coupe, 19h Championnat) tombent aux bons horaires heure de Paris, hors changement d'heure.");

  if (dailyAnchoredDayIndexForChampionshipRound(0) !== 0 || dailyAnchoredDayIndexForChampionshipRound(1) !== 0) throw new Error("❌ Les rounds 0 et 1 devraient être le jour 0.");
  if (dailyAnchoredDayIndexForChampionshipRound(2) !== 1 || dailyAnchoredDayIndexForChampionshipRound(3) !== 1) throw new Error("❌ Les rounds 2 et 3 devraient être le jour 1.");
  if (dailyAnchoredSlotIndexForChampionshipRound(0) !== 0 || dailyAnchoredSlotIndexForChampionshipRound(1) !== 1) throw new Error("❌ slotIndex devrait valoir 0 (10h) puis 1 (19h).");
  console.log("✅ dailyAnchoredDayIndexForChampionshipRound/dailyAnchoredSlotIndexForChampionshipRound : 2 journées de championnat par jour civil.");
}

// ---------------------------------------------------------------------
// 2) Passage à l'heure D'HIVER (dernier dimanche d'octobre — 25 octobre
//    2026) : le jour civil qui contient la bascule dure 25h réelles, mais
//    les créneaux (10h/15h/19h) restent à la bonne heure LOCALE des deux
//    côtés — jamais un décalage UTC figé.
// ---------------------------------------------------------------------
{
  const day0 = parisEpochForLocalTime(2026, 10, 24, 10); // veille de la bascule, encore CEST (+2h)
  if (parisUtcOffsetMs(day0) !== 2 * HOUR_MS) throw new Error("❌ Prérequis : le 24 octobre 2026 devrait encore être en heure d'été (UTC+2) à Paris.");

  const day1_10h = dailyAnchoredScheduledTimeForSlot(day0, 1, 10); // 25 octobre, 10h Paris (déjà CET, +1h, la bascule a lieu à 3h du matin)
  if (parisUtcOffsetMs(day1_10h) !== 1 * HOUR_MS) {
    throw new Error(`❌ Le 25 octobre 2026 à 10h Paris devrait déjà être en heure d'hiver (UTC+1), offset obtenu ${parisUtcOffsetMs(day1_10h) / HOUR_MS}h.`);
  }
  // 24/10 10h (UTC+2, donc 08:00 UTC) -> 25/10 10h (UTC+1, donc 09:00 UTC) :
  // 25h réelles se sont écoulées (le jour civil de la bascule dure 1h de
  // plus), PAS 24h — c'est exactement ce qu'une arithmétique en ms fixe
  // (`+ n*DAY_MS`) aurait fait à tort.
  if (day1_10h - day0 !== 25 * HOUR_MS) {
    throw new Error(`❌ Le jour de la bascule vers l'heure d'hiver devrait durer 25h réelles entre les deux créneaux de 10h, obtenu ${(day1_10h - day0) / HOUR_MS}h.`);
  }
  console.log(`✅ Bascule heure d'hiver (25 octobre 2026) : le créneau de 10h reste à 10h heure LOCALE des deux côtés — 25h réelles se sont écoulées (jour civil allongé), jamais 24h pile.`);

  // Les 3 créneaux du jour de la bascule elle-même restent cohérents entre
  // eux (toujours 10h/15h/19h Paris, jamais décalés).
  const h10 = dailyAnchoredScheduledTimeForSlot(day0, 1, 10);
  const h15 = dailyAnchoredScheduledTimeForSlot(day0, 1, DAILY_ANCHORED_CUP_HOUR);
  const h19 = dailyAnchoredScheduledTimeForSlot(day0, 1, 19);
  if (h15 - h10 !== 5 * HOUR_MS || h19 - h15 !== 4 * HOUR_MS) {
    throw new Error("❌ Même le jour de la bascule, les 3 créneaux devraient rester espacés de 5h puis 4h en heure locale.");
  }
  console.log("✅ Le jour même de la bascule vers l'heure d'hiver, les 3 créneaux (10h/15h/19h) restent cohérents entre eux en heure locale.");
}

// ---------------------------------------------------------------------
// 3) Passage à l'heure D'ÉTÉ (dernier dimanche de mars — 29 mars 2026) :
//    symétrique, le jour civil de la bascule dure 23h réelles.
// ---------------------------------------------------------------------
{
  const day0 = parisEpochForLocalTime(2026, 3, 28, 10); // veille de la bascule, encore CET (+1h)
  if (parisUtcOffsetMs(day0) !== 1 * HOUR_MS) throw new Error("❌ Prérequis : le 28 mars 2026 devrait encore être en heure d'hiver (UTC+1) à Paris.");

  const day1_10h = dailyAnchoredScheduledTimeForSlot(day0, 1, 10); // 29 mars, 10h Paris (déjà CEST, +2h — la bascule a lieu à 2h du matin)
  if (parisUtcOffsetMs(day1_10h) !== 2 * HOUR_MS) {
    throw new Error(`❌ Le 29 mars 2026 à 10h Paris devrait déjà être en heure d'été (UTC+2), offset obtenu ${parisUtcOffsetMs(day1_10h) / HOUR_MS}h.`);
  }
  if (day1_10h - day0 !== 23 * HOUR_MS) {
    throw new Error(`❌ Le jour de la bascule vers l'heure d'été devrait durer 23h réelles entre les deux créneaux de 10h, obtenu ${(day1_10h - day0) / HOUR_MS}h.`);
  }
  console.log(`✅ Bascule heure d'été (29 mars 2026) : le créneau de 10h reste à 10h heure LOCALE des deux côtés — 23h réelles se sont écoulées (jour civil raccourci), jamais 24h pile.`);
}

// ---------------------------------------------------------------------
// 4) dailyAnchoredCalendarStartAt : ancre le jour 0 sur le prochain MERCREDI
//    à 10h Paris (retour utilisateur, 2026-09, réinitialisation d'une ligue
//    multi-manager : "il faut que les matchs commencent à partir de
//    mercredi, ça laissera le temps à tout le monde pour prendre ses marques
//    et faire des emplettes") : le mercredi du jour même si créé avant 10h
//    ce jour-là, sinon le mercredi suivant (jamais un autre jour de semaine).
//    2026-09-16 est un mercredi, 2026-09-17 un jeudi, 2026-09-23 le mercredi
//    suivant.
// ---------------------------------------------------------------------
{
  const monday = parisEpochForLocalTime(2026, 9, 14, 8); // lundi, avant le mercredi
  const start1 = dailyAnchoredCalendarStartAt(monday);
  if (start1 !== parisEpochForLocalTime(2026, 9, 16, 10)) {
    throw new Error("❌ Créé un lundi, le jour 0 devrait être le MERCREDI de la même semaine à 10h Paris.");
  }
  const wednesdayBeforeTenAm = parisEpochForLocalTime(2026, 9, 16, 8); // mercredi, 8h Paris, avant le créneau
  const start2 = dailyAnchoredCalendarStartAt(wednesdayBeforeTenAm);
  if (start2 !== parisEpochForLocalTime(2026, 9, 16, 10)) {
    throw new Error("❌ Créé un mercredi avant 10h, le jour 0 devrait être CE MERCREDI à 10h Paris.");
  }
  const wednesdayAfterTenAm = parisEpochForLocalTime(2026, 9, 16, 14); // mercredi, 14h Paris, après le créneau
  const start3 = dailyAnchoredCalendarStartAt(wednesdayAfterTenAm);
  if (start3 !== parisEpochForLocalTime(2026, 9, 23, 10)) {
    throw new Error("❌ Créé un mercredi après 10h, le jour 0 devrait basculer sur le MERCREDI SUIVANT à 10h Paris (jamais le jeudi).");
  }
  const thursday = parisEpochForLocalTime(2026, 9, 17, 9); // jeudi, le lendemain du mercredi ci-dessus
  const start4 = dailyAnchoredCalendarStartAt(thursday);
  if (start4 !== parisEpochForLocalTime(2026, 9, 23, 10)) {
    throw new Error("❌ Créé un jeudi, le jour 0 devrait être le MERCREDI de la semaine suivante à 10h Paris.");
  }
  console.log("✅ dailyAnchoredCalendarStartAt ancre bien le jour 0 sur le prochain mercredi à 10h Paris, en basculant à la semaine suivante si ce mercredi est déjà passé.");
}

// ---------------------------------------------------------------------
// 5) dailyAnchoredCalendarConfig : juste un marqueur reconnu par
//    buildLeagueWithHumanTeams côté engine.js (voir generateMultiManagerLeague).
// ---------------------------------------------------------------------
{
  const cfg = dailyAnchoredCalendarConfig();
  if (cfg.dailyAnchored !== true) throw new Error("❌ dailyAnchoredCalendarConfig() devrait renvoyer { dailyAnchored: true }.");
  console.log("✅ dailyAnchoredCalendarConfig() renvoie bien le marqueur { dailyAnchored: true }.");
}

// ---------------------------------------------------------------------
// 6) Cohérence croisée avec la copie CÔTÉ NAVIGATEUR (engine.js) — même
//    garde-fou que server/calendar_test.js pour le calendrier classique,
//    étendu au rythme ancré quotidien : sur une plage de rounds ET de jours
//    de coupe, à cheval sur les DEUX bascules DST ci-dessus.
// ---------------------------------------------------------------------
{
  const Engine = require("../engine.js");
  const starts = [
    parisEpochForLocalTime(2026, 9, 16, 10),  // hors DST
    parisEpochForLocalTime(2026, 10, 20, 10), // à cheval sur la bascule d'hiver
    parisEpochForLocalTime(2026, 3, 25, 10),  // à cheval sur la bascule d'été
  ];
  starts.forEach(calendarStartAt => {
    for (let round = 0; round < 30; round++) {
      const serverTime = dailyAnchoredScheduledTimeForChampionshipRound(calendarStartAt, round);
      const clientTime = Engine.dailyAnchoredScheduledTimeForChampionshipRound(calendarStartAt, round);
      if (serverTime !== clientTime) {
        throw new Error(`❌ dailyAnchoredScheduledTimeForChampionshipRound(round=${round}) diverge : serveur=${serverTime}, navigateur (engine.js)=${clientTime}.`);
      }
    }
    for (let dayIndex = 0; dayIndex < 10; dayIndex++) {
      const serverTime = dailyAnchoredScheduledTimeForCupRound(calendarStartAt, dayIndex);
      const clientTime = Engine.dailyAnchoredScheduledTimeForCupRound(calendarStartAt, dayIndex);
      if (serverTime !== clientTime) {
        throw new Error(`❌ dailyAnchoredScheduledTimeForCupRound(dayIndex=${dayIndex}) diverge : serveur=${serverTime}, navigateur (engine.js)=${clientTime}.`);
      }
    }
  });
  // Même garde-fou pour dailyAnchoredCalendarStartAt lui-même (l'ancrage sur
  // le mercredi), à divers instants `now` de la semaine, à cheval sur les
  // deux bascules DST.
  const nows = [
    parisEpochForLocalTime(2026, 9, 14, 8),  // lundi, hors DST
    parisEpochForLocalTime(2026, 9, 16, 14), // mercredi après 10h, hors DST
    parisEpochForLocalTime(2026, 10, 24, 9), // veille de la bascule d'hiver
    parisEpochForLocalTime(2026, 3, 28, 9),  // veille de la bascule d'été
  ];
  nows.forEach(now => {
    const serverStart = dailyAnchoredCalendarStartAt(now);
    const clientStart = Engine.dailyAnchoredCalendarStartAt(now);
    if (serverStart !== clientStart) {
      throw new Error(`❌ dailyAnchoredCalendarStartAt(now=${now}) diverge : serveur=${serverStart}, navigateur (engine.js)=${clientStart}.`);
    }
  });
  console.log("✅ La copie côté navigateur (engine.js) du calendrier ancré quotidien est identique à server/calendar.js, y compris à cheval sur les deux bascules DST (mars/octobre 2026).");
}

console.log("\n✅ Calendrier ancré quotidien (server/calendar.js) : créneaux 10h/15h/19h heure de Paris, DST comprise — vérifiés des deux côtés d'un changement d'heure.");
