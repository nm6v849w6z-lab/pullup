// =====================================================================
// CALENDRIER RÉEL — retour utilisateur (2026-09) : "le jeu va être online,
// donc il faudra mettre un calendrier réel / dans une vraie semaine, 2
// matchs de championnat + 1 de coupe". Ce module ne fait QUE le calcul des
// horaires (aucun accès disque/réseau, aucune dépendance à engine.js) —
// entièrement pur et déterministe (jamais de Date.now() implicite dedans),
// pour rester facile à tester sans avoir à attendre le temps réel.
//
// Module UMD, comme engine.js : utilisable depuis Node (serveur + tests) et,
// plus tard, depuis le navigateur si l'affichage a besoin d'annoncer "prochain
// match dans X".
// =====================================================================
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BasketCalendar = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

const DAY_MS = 24 * 60 * 60 * 1000;
// Calendrier CLASSIQUE (calendrier réel de production) — reste la valeur
// par défaut de toutes les fonctions ci-dessous, et ce que `WEEK_MS`/
// `CHAMPIONSHIP_SLOT_OFFSETS_MS` désignent dans le reste de ce fichier et
// des tests existants (server/calendar_test.js, server/autoSim_test.js...) :
// une ligue individuelle peut tourner sur un rythme différent (voir plus
// bas, "MODE ACCÉLÉRÉ") en passant explicitement `weekMs`/`slotOffsetsMs` à
// `scheduledTimeForRound`/`realWeekEndAt` — mais ces deux constantes elles-
// mêmes ne varient jamais.
const WEEK_MS = 7 * DAY_MS;

// Durée réelle d'une "diffusion en direct" (retour utilisateur, 2026-09 :
// "il faut que le match se joue tout seul à 19h par exemple / si je me
// connecte à 19h30 je dois reprendre le match là où il en est" — et "le
// match doit durer autour d'1h30, c'est comme ça sur BuzzerBeater") : à
// partir de l'heure programmée d'une journée, le match du club du joueur se
// déroule en TEMPS RÉEL sur cette durée (voir server/liveMatch.js pour le
// détail de la mise en rythme — mi-temps, pauses de quart-temps, temps
// morts) — s'y connecter en cours de route reprend exactement où c'en est,
// jamais depuis le début. Passé ce délai sans que le manager ne se soit
// connecté DU TOUT, le serveur considère qu'il est absent et joue la
// journée entière (son match compris) en coulisses, exactement comme les
// autres rencontres — voir server/autoSim.js (catchUpLeague ne résout une
// journée qu'une fois `scheduledTimeForRound(...) + MATCH_BROADCAST_DURATION_MS`
// dépassé, jamais dès l'heure programmée elle-même).
const MATCH_BROADCAST_DURATION_MS = 90 * 60 * 1000; // 1h30, comme sur BuzzerBeater

// Décalages (depuis le début de la semaine réelle, League.calendarStartAt +
// n*WEEK_MS) des matchs de championnat qui tombent cette semaine-là — 2 par
// semaine réelle, espacés (pas dos à dos) pour laisser au manager le temps
// d'ajuster sa feuille de match entre les deux, façon "mercredi/samedi" si la
// semaine démarre un lundi. Le 3e match visé par le retour utilisateur (une
// coupe ou, à défaut, un amical) n'est PAS encore dans ce tableau — la
// compétition de coupe elle-même n'existe pas encore côté moteur (onglet
// "Coupe" toujours un placeholder, voir moteurbasket3.html) ; ce sera un
// TROISIÈME décalage à ajouter ici le jour où cette compétition existera,
// sans rien changer au reste de ce module (voir CHAMPIONSHIP_SLOT_OFFSETS_MS
// ci-dessous, pensé pour grandir).
const CHAMPIONSHIP_SLOT_OFFSETS_MS = [2 * DAY_MS, 5 * DAY_MS];

// Nombre de journées de championnat simulées par semaine réelle — dérivé de
// CHAMPIONSHIP_SLOT_OFFSETS_MS plutôt que codé en dur ailleurs, pour que les
// deux restent forcément synchronisés.
const ROUNDS_PER_REAL_WEEK = CHAMPIONSHIP_SLOT_OFFSETS_MS.length;

// Index de la semaine réelle (0-indexée) à laquelle appartient une journée
// de championnat donnée (0-indexée elle aussi — voir League.round).
function realWeekIndexForRound(round) {
  return Math.floor(round / ROUNDS_PER_REAL_WEEK);
}

// Position de cette journée DANS sa semaine réelle (0 = premier match de la
// semaine, 1 = second, etc.) — sert à piocher le bon décalage dans
// CHAMPIONSHIP_SLOT_OFFSETS_MS.
function slotIndexForRound(round) {
  return round % ROUNDS_PER_REAL_WEEK;
}

// True si cette journée est la DERNIÈRE de sa semaine réelle — c'est à ce
// moment-là (une fois les matchs de championnat de la semaine joués) que
// l'entraînement hebdomadaire (Team.trainWeek) doit s'appliquer une seule
// fois, voir server/autoSim.js.
function isLastRoundOfRealWeek(round) {
  return slotIndexForRound(round) === ROUNDS_PER_REAL_WEEK - 1;
}

// Instant réel (epoch ms) auquel une journée de championnat donnée doit se
// jouer, à partir du début de saison (League.calendarStartAt). `weekMs`/
// `slotOffsetsMs` explicites (au lieu des constantes classiques ci-dessus
// directement) : c'est ce qui permet à une ligue individuelle de tourner
// sur un rythme différent (voir "MODE ACCÉLÉRÉ" plus bas) sans jamais
// changer cette formule elle-même — appeler avec league.calendarWeekMs/
// calendarSlotOffsetsMs (voir engine.js) quand ils sont renseignés, sinon
// laisser les valeurs par défaut (calendrier classique).
function scheduledTimeForRound(calendarStartAt, round, weekMs = WEEK_MS, slotOffsetsMs = CHAMPIONSHIP_SLOT_OFFSETS_MS) {
  const week = realWeekIndexForRound(round);
  const slot = slotIndexForRound(round);
  return calendarStartAt + week * weekMs + slotOffsetsMs[slot];
}

// Confort : lit calendarWeekMs/calendarSlotOffsetsMs directement sur la
// ligue (voir League.calendarWeekMs/calendarSlotOffsetsMs, engine.js) au
// lieu de refaire ce petit bout de logique de repli (classique si `null`,
// ancienne sauvegarde comprise) à chaque site d'appel (server/autoSim.js,
// server/liveMatch.js, server/index.js).
function scheduledTimeForLeagueRound(league, round) {
  // Calendrier ancré quotidien (retour utilisateur, 2026-09 — voir le grand
  // bloc "CALENDRIER ANCRÉ QUOTIDIEN" plus bas dans ce fichier) : réservé à
  // la ligue multi-manager (League.calendarDailyAnchored, jamais vrai pour
  // la carrière solo) — un rythme entièrement différent (2 journées de
  // championnat PAR JOUR CIVIL à Paris, DST comprise) qui n'est PAS
  // exprimable via calendarWeekMs/calendarSlotOffsetsMs (arithmétique en ms
  // fixe, incompatible avec la durée VARIABLE d'un jour civil à Paris) —
  // voir dailyAnchoredScheduledTimeForChampionshipRound, définie plus bas
  // (après DAILY_ANCHORED_CHAMPIONSHIP_HOURS) mais appelée ici via une
  // simple référence de fonction (hissée par la déclaration `function`,
  // comme le reste de ce module).
  if (league.calendarDailyAnchored) {
    return dailyAnchoredScheduledTimeForChampionshipRound(league.calendarStartAt, round);
  }
  return scheduledTimeForRound(
    league.calendarStartAt,
    round,
    typeof league.calendarWeekMs === "number" ? league.calendarWeekMs : undefined,
    Array.isArray(league.calendarSlotOffsetsMs) ? league.calendarSlotOffsetsMs : undefined
  );
}

// Équivalent de scheduledTimeForLeagueRound, mais pour un TOUR DE COUPE
// (créneau de 15h du jour `cupDayIndex` — voir League.cup côté engine.js) —
// n'a de sens QUE pour une ligue au calendrier ancré quotidien (voir
// commentaire ci-dessus) : une ligue au calendrier classique/accéléré n'a
// jamais de league.cup (voir generateMultiManagerLeague), donc cette
// fonction n'est jamais appelée pour elle.
function scheduledTimeForLeagueCupRound(league, cupDayIndex) {
  return dailyAnchoredScheduledTimeForCupRound(league.calendarStartAt, cupDayIndex);
}

// Instant réel (epoch ms) de fin d'une semaine réelle donnée (utile pour
// afficher un compte à rebours, ou plafonner l'entraînement automatique à
// une fois par semaine calendaire même si l'appelant "rattrape" plusieurs
// semaines d'un coup après une longue absence).
function realWeekEndAt(calendarStartAt, weekIndex, weekMs = WEEK_MS) {
  return calendarStartAt + (weekIndex + 1) * weekMs;
}

// ---------------------------------------------------------------------
// MODE ACCÉLÉRÉ (tests/démo solo) — retour utilisateur (2026-09) : pouvoir
// enchaîner une saison entière en quelques jours plutôt qu'en ~9 semaines
// réelles, avant d'ouvrir le jeu à plusieurs managers en calendrier
// classique ("on repartira sur un calendrier classique quand le jeu sera
// opérationnel [...] on restera sur ce schéma [accéléré] aussi" pour les
// tests solo). Un match de championnat se simule toutes les 3h (au lieu
// d'être espacés sur plusieurs jours — resserré de 5h à 3h, retour
// utilisateur 2026-09 : "sinon ça va être long les tests") — la "semaine"
// de 2 matchs tient donc dans 6h réelles ; l'entraînement + les finances
// hebdomadaires (Team.trainWeek, voir server/autoSim.js) s'appliquant comme
// d'habitude juste après le second match, sans aucun changement requis côté
// autoSim.js/liveMatch.js (ROUNDS_PER_REAL_WEEK, le NOMBRE de matchs par
// semaine, ne change JAMAIS d'un mode à l'autre — seuls les horaires sont
// compressés). Une saison de 18 journées se termine donc en ~54h (~2-3
// jours réels) : dernier match à round17 = calendarStartAt + 18*3h.
//
// Contrairement à l'ancienne version de ce mode (retour utilisateur,
// 2026-09 : matchs fixés à des horaires de la journée façon "10h/15h"), ce
// rythme est un intervalle GLISSANT depuis l'instant de création — pas
// d'ancrage sur une heure de la journée (voir anchoredCalendarStartAt côté
// engine.js, qui ne s'applique qu'à un rythme d'exactement 1 jour/semaine,
// donc jamais à celui-ci) : le tout premier match tombe 5h après la
// création de la carrière, quelle que soit l'heure à laquelle elle a eu
// lieu.
//
// Activé via la variable d'environnement BASKET_FAST_CALENDAR=1 au
// démarrage du serveur (voir server/index.js) ; jamais activé par défaut.
// `setFastTestMode`/`getDefaultCalendarConfig` ne pilotent QUE le réglage
// utilisé pour GÉNÉRER une toute NOUVELLE ligue (voir generateLeague côté
// engine.js, et server/store.js) — le rythme d'une ligue déjà en cours reste
// celui figé dans sa propre sauvegarde (League.calendarWeekMs/
// calendarSlotOffsetsMs), jamais relu dynamiquement depuis ce réglage global
// : redémarrer le serveur avec/sans le flag ne dérègle donc jamais un
// calendrier déjà en cours.
const FAST_MATCH_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3h entre 2 matchs, quel que soit le mode
const FAST_WEEK_MS = ROUNDS_PER_REAL_WEEK * FAST_MATCH_INTERVAL_MS; // 2 matchs * 3h = 6h
const FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS = [FAST_MATCH_INTERVAL_MS, 2 * FAST_MATCH_INTERVAL_MS]; // 3h, 6h — espacement uniforme (round suivant = +3h)

let fastTestModeEnabled = false;

function setFastTestMode(enabled) {
  fastTestModeEnabled = !!enabled;
}

function isFastTestModeEnabled() {
  return fastTestModeEnabled;
}

// {weekMs, slotOffsetsMs} à figer dans une ligue à sa création (voir
// generateLeague), reflétant le réglage GLOBAL courant du serveur — jamais
// pour une ligue déjà en cours (voir commentaire ci-dessus).
function getDefaultCalendarConfig() {
  return fastTestModeEnabled
    ? { weekMs: FAST_WEEK_MS, slotOffsetsMs: FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS }
    : { weekMs: WEEK_MS, slotOffsetsMs: CHAMPIONSHIP_SLOT_OFFSETS_MS };
}

// ---------------------------------------------------------------------
// CALENDRIER ANCRÉ QUOTIDIEN (retour utilisateur, 2026-09 — "la vraie saison
// de test" : "3 matchs par jour, à heures fixes réelles : 10h Championnat,
// 15h Coupe, 19h Championnat", en heure de PARIS, DST comprise) — un rythme
// entièrement DISTINCT du mode accéléré ci-dessus (intervalle GLISSANT, sans
// notion d'heure de la journée) et du calendrier classique plus haut
// (rythme HEBDOMADAIRE, weekMs/slotOffsetsMs en ms fixes depuis
// calendarStartAt). Réservé à la ligue multi-manager (voir
// generateMultiManagerLeague/createMultiManagerCareer côté engine.js/
// server/store.js) — jamais utilisé par la carrière solo historique,
// jamais activé par une variable d'environnement (contrairement au mode
// accéléré) : la ligue multi-manager EST la saison de test, ce rythme
// s'applique donc dès sa création, sans bascule.
//
// Pourquoi ce n'est PAS un troisième jeu de weekMs/slotOffsetsMs comme les
// deux modes ci-dessus : un décalage FIXE en millisecondes depuis
// calendarStartAt (`calendarStartAt + n*DAY_MS`) suppose qu'un jour dure
// TOUJOURS 24h — faux deux fois par an en heure de Paris (23h au passage à
// l'heure d'été, dernier dimanche de mars ; 25h au passage à l'heure d'hiver,
// dernier dimanche d'octobre). Une arithmétique en ms glisserait donc l'heure
// AFFICHÉE (10h/15h/19h) d'une heure entière à chaque changement d'heure. Ce
// bloc calcule à la place, pour CHAQUE jour, l'horaire réel (epoch ms)
// correspondant à une heure CIVILE fixe (10h/15h/19h) à Paris CE JOUR-LÀ, via
// Intl.DateTimeFormat (fonctionne identiquement en Node et navigateur, voir
// engine.js pour la copie côté client) — jamais un décalage UTC codé en dur
// (+1h/+2h), qui serait faux la moitié de l'année.
// ---------------------------------------------------------------------
const PARIS_TIME_ZONE = "Europe/Paris";

// Heures civiles (Paris) des 3 créneaux quotidiens — jamais concernées par
// le changement d'heure elles-mêmes (celui-ci a toujours lieu entre 1h et 3h
// du matin, heure locale, loin de 10h/15h/19h), donc jamais ambiguës ni
// inexistantes (contrairement à une heure comme 2h30 lors du passage à
// l'heure d'été, qui n'existe tout simplement pas ce jour-là).
const DAILY_ANCHORED_CHAMPIONSHIP_HOURS = [10, 19]; // 10h puis 19h, championnat
const DAILY_ANCHORED_CUP_HOUR = 15; // 15h, coupe (seulement les jours où un tour est dû — voir dailyAnchoredScheduledTimeForCupRound)

// Décalage Paris/UTC (en ms, +1h ou +2h selon la saison) à l'instant `utcMs`
// — calculé en formatant `utcMs` dans le fuseau Europe/Paris puis en
// comparant à sa lecture UTC naïve, plutôt qu'en codant en dur "+1h l'hiver,
// +2h l'été" (faux la moitié de l'année, et faux tout court hors Europe/
// Paris). `Intl.DateTimeFormat` avec `timeZone` résout correctement les
// dates IANA aussi bien côté Node que dans un navigateur (voir engine.js).
function parisUtcOffsetMs(utcMs) {
  const parts = parisLocalDateParts(utcMs);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - utcMs;
}

// Composants civils (année/mois/jour/heure/minute/seconde) de `utcMs` tels
// qu'affichés à Paris — pur formatage, aucune arithmétique de fuseau ici.
function parisLocalDateParts(utcMs) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS_TIME_ZONE, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map = {};
  dtf.formatToParts(new Date(utcMs)).forEach(p => { if (p.type !== "literal") map[p.type] = p.value; });
  return {
    year: Number(map.year), month: Number(map.month), day: Number(map.day),
    hour: Number(map.hour), minute: Number(map.minute), second: Number(map.second),
  };
}

// Ajoute `days` jours CIVILS (calendaires, jamais un décalage en ms — un
// jour civil peut durer 23h/24h/25h en heure de Paris) à une date {year,
// month, day} — arithmétique de calendrier pure (Date.UTC comme simple
// calculatrice de calendrier grégorien, PAS comme un instant réel : aucun
// fuseau horaire n'intervient ici, seule la conversion finale en epoch via
// parisEpochForLocalTime en tient compte).
function addParisCalendarDays(dateParts, days) {
  const d = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// Instant réel (epoch ms) correspondant à une heure CIVILE donnée
// (année/mois/jour/heure/minute/seconde) à Paris — l'inverse de
// parisLocalDateParts. Converge en au plus 2 itérations : le décalage
// Paris/UTC ne prend que 2 valeurs (+1h/+2h), jamais autre chose, donc une
// estimation initiale (en traitant l'heure civile comme si elle était déjà
// UTC) puis une correction par le décalage réel à CETTE estimation suffit
// toujours à retomber juste. Sans ambiguïté possible ici : les 3 créneaux
// (10h/15h/19h) ne tombent jamais dans l'heure "dédoublée"/"inexistante"
// du changement d'heure (toujours entre 1h et 3h du matin).
function parisEpochForLocalTime(year, month, day, hour, minute = 0, second = 0) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const offset = parisUtcOffsetMs(guess);
    const candidate = Date.UTC(year, month - 1, day, hour, minute, second) - offset;
    if (candidate === guess) return candidate;
    guess = candidate;
  }
  return guess;
}

// `calendarConfig` reconnu par anchoredCalendarStartAt/buildLeagueWithHumanTeams
// côté engine.js pour choisir CE rythme (plutôt que le classique ou le mode
// accéléré) — juste un marqueur, aucune donnée numérique dedans (contrairement
// à {weekMs, slotOffsetsMs}) puisque ce rythme n'est justement PAS exprimable
// en simple décalage ms fixe (voir le grand commentaire en tête de ce bloc).
function dailyAnchoredCalendarConfig() {
  return { dailyAnchored: true };
}

// Instant réel (epoch ms) du tout premier créneau ("jour 0", 10h à Paris) —
// ancré sur le jour de création `now`, sauf si 10h est déjà passé ce
// jour-là, auquel cas bascule sur le lendemain (comme anchoredCalendarStartAt
// plus haut, pour que le tout premier match reste à venir plutôt que déjà
// écoulé dès la création).
function dailyAnchoredCalendarStartAt(now) {
  const today = parisLocalDateParts(now);
  const firstSlot = parisEpochForLocalTime(today.year, today.month, today.day, DAILY_ANCHORED_CHAMPIONSHIP_HOURS[0]);
  if (firstSlot > now) return firstSlot;
  const tomorrow = addParisCalendarDays(today, 1);
  return parisEpochForLocalTime(tomorrow.year, tomorrow.month, tomorrow.day, DAILY_ANCHORED_CHAMPIONSHIP_HOURS[0]);
}

// Instant réel (epoch ms) du créneau à l'heure civile `hour` (10/15/19) du
// jour `dayIndex` (0 = jour de calendarStartAt, 1 = le lendemain, etc.) —
// LE calcul commun aux championnats (dailyAnchoredScheduledTimeForChampionshipRound,
// hour ∈ {10,19}) et à la coupe (dailyAnchoredScheduledTimeForCupRound,
// hour = 15) ci-dessous. `calendarStartAt` DOIT être le jour 0 à 10h (voir
// dailyAnchoredCalendarStartAt) — sa propre heure civile (toujours 10h) sert
// de point de départ pour calculer le jour civil `dayIndex` jours plus tard.
function dailyAnchoredScheduledTimeForSlot(calendarStartAt, dayIndex, hour) {
  const day0 = parisLocalDateParts(calendarStartAt);
  const target = dayIndex > 0 ? addParisCalendarDays(day0, dayIndex) : day0;
  return parisEpochForLocalTime(target.year, target.month, target.day, hour);
}

// Une journée de championnat par créneau (10h ou 19h) — 2 par jour civil,
// jamais 2 par semaine comme le calendrier classique. `round` 0-indexé,
// comme partout ailleurs dans ce fichier.
function dailyAnchoredDayIndexForChampionshipRound(round) {
  return Math.floor(round / DAILY_ANCHORED_CHAMPIONSHIP_HOURS.length);
}
function dailyAnchoredSlotIndexForChampionshipRound(round) {
  return round % DAILY_ANCHORED_CHAMPIONSHIP_HOURS.length;
}
function dailyAnchoredScheduledTimeForChampionshipRound(calendarStartAt, round) {
  const dayIndex = dailyAnchoredDayIndexForChampionshipRound(round);
  const hour = DAILY_ANCHORED_CHAMPIONSHIP_HOURS[dailyAnchoredSlotIndexForChampionshipRound(round)];
  return dailyAnchoredScheduledTimeForSlot(calendarStartAt, dayIndex, hour);
}

// Créneau de 15h du jour `cupDayIndex` — SEULEMENT quand un tour de coupe y
// est effectivement programmé (voir League.cup côté engine.js) : ce module
// ne sait rien lui-même de "un jour a-t-il un tour de coupe dû" — c'est
// l'appelant (server/autoSim.js) qui ne consulte cette fonction que pour un
// `cupDayIndex` correspondant à un tour réellement en attente.
function dailyAnchoredScheduledTimeForCupRound(calendarStartAt, cupDayIndex) {
  return dailyAnchoredScheduledTimeForSlot(calendarStartAt, cupDayIndex, DAILY_ANCHORED_CUP_HOUR);
}

return {
  DAY_MS, WEEK_MS, MATCH_BROADCAST_DURATION_MS,
  CHAMPIONSHIP_SLOT_OFFSETS_MS, ROUNDS_PER_REAL_WEEK,
  realWeekIndexForRound, slotIndexForRound, isLastRoundOfRealWeek,
  scheduledTimeForRound, scheduledTimeForLeagueRound, realWeekEndAt,
  FAST_MATCH_INTERVAL_MS, FAST_WEEK_MS, FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS,
  setFastTestMode, isFastTestModeEnabled, getDefaultCalendarConfig,
  // Calendrier ancré quotidien (voir bloc dédié ci-dessus) :
  PARIS_TIME_ZONE, DAILY_ANCHORED_CHAMPIONSHIP_HOURS, DAILY_ANCHORED_CUP_HOUR,
  parisUtcOffsetMs, parisLocalDateParts, addParisCalendarDays, parisEpochForLocalTime,
  dailyAnchoredCalendarConfig, dailyAnchoredCalendarStartAt,
  dailyAnchoredScheduledTimeForSlot,
  dailyAnchoredDayIndexForChampionshipRound, dailyAnchoredSlotIndexForChampionshipRound,
  dailyAnchoredScheduledTimeForChampionshipRound, dailyAnchoredScheduledTimeForCupRound,
  scheduledTimeForLeagueCupRound,
};

});
