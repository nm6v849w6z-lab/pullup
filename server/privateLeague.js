"use strict";

// ---------------------------------------------------------------------
// LIGUES PRIVÉES (Premium) — retour communauté relayé par l'utilisateur,
// 2026-09-26 (Diablue, aszat) : "Ligues perso ? comme LP sur BB", "sur
// buzzerbeater, la ligue privée, c'est un truc à part qui ne joue pas sur la
// forme des joueurs [...] ça n'a aucun impact sur la forme, l'entrainement
// etc... c'est un truc pour s'amuser un peu plus", "il faut aucun revenu, le
// choix du terrain se fera dans les parametres de la LP [...] mais aucun
// revenu de billetterie dans tous les cas", "pour créer et rejoindre la LP il
// faut etre premium".
//
// LIGUES PRIVÉES MONDIALES (retour utilisateur 2026-10-02 : « Pour la ligue
// privée il faut que n'importe quel joueur du monde qui est premium puisse
// rejoindre la LP sinon ça n'a aucun sens. ») : une ligue privée n'appartient
// plus à UN championnat. Elle est rangée au niveau du monde (données annexes
// « privateleagues », comme les amicaux entre championnats de
// server/worldFriendlies.js) et ses membres sont des références de club
// { leagueId, idx, name, country, label, look } : n'importe quel club humain
// Premium de n'importe quel pays ou division la rejoint avec le code.
//
// Principes (inchangés) :
// - Création ET participation réservées aux clubs Premium
//   (Team.hasActivePremium), vérifié côté serveur à chaque action.
// - Un club ne participe qu'à UNE ligue privée active à la fois (dans le
//   monde entier) ; codes d'invitation uniques dans le monde entier.
// - Une journée par semaine, le VENDREDI, à l'heure choisie par le créateur
//   (heure de Paris, par demi-heure de 08h00 à 23h30 ; 21h30 par défaut et
//   pour les ligues créées avant ce choix — retour utilisateur 2026-09-26 :
//   "laisse le choix de l'heure des matchs").
//   Aller-retour (generateRoundRobinSchedule), 4/6/8/10 équipes, lancement
//   automatique quand la ligue est complète ou anticipé par le créateur dès
//   4 clubs ; le créateur qui part dissout la ligue.
// - Les matchs sont simulés sur des COPIES des équipes (serializeTeam →
//   teamFromSave) : MatchEngine.simulate a ses propres effets de bord
//   (blessures, minutes d'entraînement, snapshots de forme), qui tombent avec
//   la copie. RIEN n'est écrit sur les joueurs ni le club réels — ni forme,
//   ni fatigue, ni entraînement, ni finances, ni stats de carrière
//   (matchLog), ni classement mondial. Seul le résultat est stocké (+ une
//   entrée de fil d'actu pour les membres).
// - Avantage du terrain optionnel (venue "home") : option homeAdvantage de
//   MatchEngine, voir HOME_ADVANTAGE_FACTOR côté moteur ; "neutral" = aucun.
// - Les journées sont jouées par server/world.js:catchUpWorld, qui a toutes
//   les ligues en main. Un championnat illisible (stockage injoignable) :
//   la journée attend le passage suivant, jamais un forfait.
//
// Forme d'une ligue privée « monde » (données annexes, store.list) :
// { id, name, code, creator: { leagueId, idx }, size, venue, hour, minute,
//   status ("open"|"running"|"finished"), createdAt, startedAt, finishedAt,
//   members: [ref...],
//   rounds: [{ index, dueAt, feedPushed?, matches: [{ home, away, played,
//     playedAt, scoreHome, scoreAway, forfeit, quarterScores, boxScoreHome,
//     boxScoreAway, seed?, kickoffAt?, liveUntil?, legacyKey? }] }],
//   legacy?: { leagueId } }
// `home`/`away` sont des PLACES dans `members` (figées au lancement).
// Navigateur : projetée dans le repère de la ligue du manager (projectForViewer)
// sous l'ancienne forme (teamIndices, creatorTeamIndex, home/away = index
// locaux ; clubs des autres championnats = clubs invités légers
// PRIVATE_LEAGUE_GUEST_IDX + k), pour que l'affichage existant reste tel quel.
//
// Ancienne forme (avant 2026-10-02, JSON brut dans League.privateLeagues,
// teamIndices/creatorTeamIndex/home/away = index dans league.teams) :
// migrée vers le monde sans perte (migrateLeague, même id, même code, mêmes
// membres, journées et résultats) dès que le stockage du monde est lisible ;
// catchUpPrivateLeagues reste le chemin de compatibilité d'une ligue pas
// encore migrée (stockage du monde illisible).
// ---------------------------------------------------------------------

const Calendar = require("./calendar.js");
const { schedulePlayback } = require("./liveMatch.js");

const PRIVATE_LEAGUE_SIZES = [4, 6, 8, 10]; // 4 : retour utilisateur 2026-09-26
const PRIVATE_LEAGUE_MIN_TEAMS_TO_START = 4;
const PRIVATE_LEAGUE_VENUES = ["home", "neutral"];
const PRIVATE_LEAGUE_WEEKDAY = 5; // vendredi (convention Date#getUTCDay)
// Heure par défaut (et des ligues créées avant le choix de l'heure).
const PRIVATE_LEAGUE_HOUR = 21;
const PRIVATE_LEAGUE_MINUTE = 30;
// Heures proposées au créateur : toutes les demi-heures de 08h00 à 23h30.
const PRIVATE_LEAGUE_TIMES = [];
for (let h = 8; h <= 23; h++) [0, 30].forEach(m => PRIVATE_LEAGUE_TIMES.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`));
const PRIVATE_LEAGUE_NAME_MAX = 30;
const PRIVATE_LEAGUE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I
const PRIVATE_LEAGUE_CODE_LENGTH = 6;
// Une ligue terminée reste consultable un moment (palmarès) puis est purgée
// pour ne pas faire grossir la sauvegarde indéfiniment.
const PRIVATE_LEAGUE_FINISHED_RETENTION_MS = 60 * 24 * 3600 * 1000;
// Clubs des autres championnats dans le navigateur (voir projectForViewer) :
// au-delà des invités de la Coupe nationale (100+), du marché mondial
// (1000+/2000+) et des amicaux entre championnats (3000+).
const PRIVATE_LEAGUE_GUEST_IDX = 4000;
// Nom des données annexes du monde (store.loadWorldAuxStrict).
const STORE_NAME = "privateleagues";
// Logo personnalisé recopié dans la référence d'un membre (affiché chez les
// autres membres) seulement s'il reste léger ; sinon logo type.
const LOOK_LOGO_MAX = 120000;

function fail(error) { return { ok: false, error }; }

function randomCode() {
  let code = "";
  for (let i = 0; i < PRIVATE_LEAGUE_CODE_LENGTH; i++) {
    code += PRIVATE_LEAGUE_CODE_ALPHABET[Math.floor(Math.random() * PRIVATE_LEAGUE_CODE_ALPHABET.length)];
  }
  return code;
}

function randomId(Engine) {
  return Engine.randomHexToken(6);
}

function normalizeName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > PRIVATE_LEAGUE_NAME_MAX) return null;
  return name;
}

function normalizeCode(raw) {
  if (typeof raw !== "string") return null;
  const code = raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return code.length === PRIVATE_LEAGUE_CODE_LENGTH ? code : null;
}

// "HH:MM" → { hour, minute } si c'est une heure proposée, sinon null.
// Absent → heure par défaut (ancien client qui n'envoie pas le champ).
function normalizeTime(raw) {
  if (raw === undefined || raw === null || raw === "") return { hour: PRIVATE_LEAGUE_HOUR, minute: PRIVATE_LEAGUE_MINUTE };
  if (typeof raw !== "string" || !PRIVATE_LEAGUE_TIMES.includes(raw)) return null;
  const [hour, minute] = raw.split(":").map(Number);
  return { hour, minute };
}

// Heure des matchs d'une ligue (ancienne ligue sans le champ → 21h30).
function leagueTime(lp) {
  const ok = lp && Number.isInteger(lp.hour) && Number.isInteger(lp.minute);
  return ok ? { hour: lp.hour, minute: lp.minute } : { hour: PRIVATE_LEAGUE_HOUR, minute: PRIVATE_LEAGUE_MINUTE };
}

function isActive(lp) {
  return lp.status === "open" || lp.status === "running";
}

// --- Références de clubs ------------------------------------------------------

function emptyStore() { return { version: 1, list: [] }; }
function isValidStore(s) { return !!(s && typeof s === "object" && Array.isArray(s.list)); }

function sameRef(a, b) { return !!a && !!b && a.leagueId === b.leagueId && a.idx === b.idx; }
function memberSlot(lp, leagueId, idx) {
  return (lp.members || []).findIndex(r => r.leagueId === leagueId && r.idx === idx);
}
function isCreator(lp, leagueId, idx) { return !!lp.creator && lp.creator.leagueId === leagueId && lp.creator.idx === idx; }

// Apparence d'un club pour les autres membres (logo, maillot, trigramme).
function teamLook(team) {
  if (!team) return null;
  const logo = typeof team.customLogoDataUrl === "string" && team.customLogoDataUrl.length <= LOOK_LOGO_MAX ? team.customLogoDataUrl : null;
  return {
    trigram: team.trigram || null,
    jerseyColor: team.jerseyColor || null, jerseyShape: team.jerseyShape || null,
    jerseyPattern: team.jerseyPattern || null, jerseyTwoTone: team.jerseyTwoTone || null,
    isPaying: !!team.isPaying, premiumUntil: typeof team.premiumUntil === "number" ? team.premiumUntil : null,
    customLogoDataUrl: logo,
  };
}

// Référence d'un club : { leagueId, idx, name, country, label, look }.
function refFor(leagueId, league, idx, label = "") {
  const t = league && league.teams[idx];
  return {
    leagueId, idx, name: t ? t.name : "?",
    country: (league && league.country) || "fr",
    label: label || "", look: teamLook(t),
  };
}

// La ligue privée ACTIVE (ouverte ou en cours) dont ce club est membre — un
// club ne peut être que dans une seule à la fois, dans le monde entier. Les
// ligues spéciales (createSpecialPrivateLeague) ne comptent pas : on peut en
// jouer une EN PLUS de sa ligue privée normale.
function activeFor(store, leagueId, idx) {
  return ((store && store.list) || []).find(lp => isActive(lp) && !lp.special && memberSlot(lp, leagueId, idx) >= 0) || null;
}

function findById(store, id) {
  return ((store && store.list) || []).find(lp => lp.id === id) || null;
}

// Garde-fous communs à toute action : ligue multi-manager, club humain,
// Premium actif.
function checkEligibility(team, league, now) {
  if (!league || !league.calendarDailyAnchored) return "Les ligues privées ne sont disponibles que dans la ligue partagée.";
  if (!team || !team.isHuman) return "Seul un club géré par un manager peut participer à une ligue privée.";
  if (typeof team.hasActivePremium !== "function" || !team.hasActivePremium(now)) {
    return "Les ligues privées sont réservées aux clubs Premium.";
  }
  return null;
}

// --- Actions (monde) -------------------------------------------------------
// `me` = { league, idx, ref } : le club qui agit, sa ligue et sa référence
// (refFor). `store` (données « privateleagues ») est modifié sur place ; à
// l'appelant de le sauvegarder si la réponse est { ok: true }.

// POST /api/private-league/create  body: { name, size, venue, time: "HH:MM" }
function createPrivateLeague(Engine, store, me, body, now) {
  const team = me.league && me.league.teams[me.idx];
  const err = checkEligibility(team, me.league, now);
  if (err) return fail(err);
  if (activeFor(store, me.ref.leagueId, me.idx)) return fail("Votre club participe déjà à une ligue privée.");
  const name = normalizeName(body && body.name);
  if (!name) return fail(`Le nom de la ligue doit faire entre 2 et ${PRIVATE_LEAGUE_NAME_MAX} caractères.`);
  const size = Number(body && body.size);
  if (!PRIVATE_LEAGUE_SIZES.includes(size)) return fail("Nombre d'équipes invalide (4, 6, 8 ou 10).");
  const venue = body && body.venue;
  if (!PRIVATE_LEAGUE_VENUES.includes(venue)) return fail("Choix du terrain invalide.");
  const time = normalizeTime(body && body.time);
  if (!time) return fail("Heure des matchs invalide.");

  // Code unique dans le monde entier (toutes les ligues stockées, même
  // terminées : un vieux code ne désigne jamais une autre ligue).
  let code = randomCode();
  while (store.list.some(lp => lp.code === code)) code = randomCode();
  const lp = {
    id: randomId(Engine),
    name, code,
    creator: { leagueId: me.ref.leagueId, idx: me.idx },
    size, venue,
    hour: time.hour, minute: time.minute,
    status: "open",
    createdAt: now, startedAt: null, finishedAt: null,
    members: [{ ...me.ref, idx: me.idx }],
    rounds: [],
  };
  store.list.push(lp);
  return { ok: true, privateLeagueId: lp.id };
}

// POST /api/private-league/join  body: { code } — depuis n'importe quel
// championnat du monde.
function joinPrivateLeague(Engine, store, me, body, now) {
  const team = me.league && me.league.teams[me.idx];
  const err = checkEligibility(team, me.league, now);
  if (err) return fail(err);
  if (activeFor(store, me.ref.leagueId, me.idx)) return fail("Votre club participe déjà à une ligue privée.");
  const code = normalizeCode(body && body.code);
  if (!code) return fail("Code d'invitation invalide.");
  const lp = store.list.find(l => l.code === code && isActive(l));
  if (!lp) return fail("Aucune ligue privée ouverte ne correspond à ce code.");
  if (lp.status !== "open") return fail("Cette ligue privée a déjà commencé.");
  if (lp.members.length >= lp.size) return fail("Cette ligue privée est complète.");
  lp.members.push({ ...me.ref, idx: me.idx });
  if (lp.members.length >= lp.size) startPrivateLeagueNow(Engine, lp, now);
  return { ok: true, privateLeagueId: lp.id, started: lp.status === "running" };
}

// POST /api/private-league/leave  body: { id }
// Uniquement tant que la ligue n'a pas commencé. Le créateur qui part
// dissout la ligue (les autres redeviennent libres).
function leavePrivateLeague(Engine, store, me, body, now) {
  const lp = findById(store, body && body.id);
  if (!lp) return fail("Ligue privée introuvable.");
  const slot = memberSlot(lp, me.ref.leagueId, me.idx);
  if (slot < 0) return fail("Votre club ne fait pas partie de cette ligue privée.");
  if (lp.status !== "open") return fail("Impossible de quitter une ligue privée déjà lancée.");
  if (isCreator(lp, me.ref.leagueId, me.idx)) {
    store.list = store.list.filter(l => l.id !== lp.id);
    return { ok: true, dissolved: true };
  }
  lp.members.splice(slot, 1);
  return { ok: true, dissolved: false };
}

// POST /api/private-league/orders  body: { id, round?, orders } | { id, round?, reset: true }
// Ordres propres à la ligue privée (retour utilisateur 2026-10-02 : « il n'y
// a pas de bouton pour faire sa compo ou la modifier en ligue privée ») :
// rangés sur la fiche du club dans la ligue, jamais vus des autres,
// appliqués sur la COPIE de l'équipe au coup d'envoi (voir playMatch) — rien
// sur les ordres des matchs officiels. Sans ordres propres : ordres actuels
// du club.
// UN JEU D'ORDRES PAR JOURNÉE (retour utilisateur 2026-10-05 : « chaque
// match doit avoir ses propres ordres […] une modification sur le match N ne
// doit jamais modifier les ordres déjà définis du match N+1, N+2 ») :
// member.ordersByRound[<index de journée>]. Avant ce correctif, un seul
// `member.orders` valait pour toutes les journées à venir, d'où la
// propagation. `round` omis : prochaine journée non jouée du club.
// Ancien `member.orders` (sauvegardes d'avant) : recopié tel quel sur
// chaque journée encore à jouer qui n'a pas les siens (rien ne change pour
// ces journées), puis supprimé — voir migrateMemberOrders.
// Verrou à T − 5 min de LA journée visée, comme un match officiel (retour
// utilisateur 2026-10-03 : « il faut que la compo soit lue dans les 5 min
// avant le match, comme un match classique »).
const LP_ORDERS_LOCK_MS = 5 * 60 * 1000;
const LP_ORDERS_LOCKED_ERROR = "Ordres verrouillés : le coup d'envoi est dans moins de 5 minutes.";
function memberRoundsToPlay(lp, slot) {
  return (lp.rounds || []).filter(r => r.matches.some(m => !m.played && (m.home === slot || m.away === slot)));
}
// Verrou de la PROCHAINE journée du club (T − 5 min).
function memberOrdersLocked(lp, slot, now) {
  const round = memberRoundsToPlay(lp, slot)[0];
  return !!round && typeof round.dueAt === "number" && now >= round.dueAt - LP_ORDERS_LOCK_MS;
}
function migrateMemberOrders(lp, slot) {
  const member = lp.members && lp.members[slot];
  if (!member || !member.orders) return false;
  member.ordersByRound = member.ordersByRound && typeof member.ordersByRound === "object" ? member.ordersByRound : {};
  memberRoundsToPlay(lp, slot).forEach(r => {
    if (!member.ordersByRound[r.index]) member.ordersByRound[r.index] = JSON.parse(JSON.stringify(member.orders));
  });
  delete member.orders;
  return true;
}
// Ordres de ligue privée de ce club pour CETTE journée (ou null : ordres du club).
function memberOrdersForRound(lp, slot, roundIndex) {
  const member = lp.members && lp.members[slot];
  if (!member) return null;
  const own = member.ordersByRound && member.ordersByRound[roundIndex];
  return own || member.orders || null;
}
function myLpOrdersView(lp, slot) {
  if (slot < 0) return { myOrders: null, myOrdersByRound: {} };
  const byRound = {};
  memberRoundsToPlay(lp, slot).forEach(r => { const o = memberOrdersForRound(lp, slot, r.index); if (o) byRound[r.index] = o; });
  const next = memberRoundsToPlay(lp, slot).find(r => r.matches.some(m => !m.live && (m.home === slot || m.away === slot)));
  return { myOrders: next ? (byRound[next.index] || null) : null, myOrdersByRound: byRound };
}
function setPrivateLeagueOrders(Engine, store, me, body, now) {
  const lp = findById(store, body && body.id);
  if (!lp || !isActive(lp)) return fail("Ligue privée introuvable.");
  const slot = memberSlot(lp, me.ref.leagueId, me.idx);
  if (slot < 0) return fail("Votre club ne fait pas partie de cette ligue privée.");
  const member = lp.members[slot];
  const toPlay = memberRoundsToPlay(lp, slot);
  const round = body && body.round != null ? toPlay.find(r => r.index === Number(body.round)) : toPlay[0];
  if (!round) return fail("Journée de ligue privée invalide (déjà jouée, ou sans match pour votre club).");
  if (typeof round.dueAt === "number" && now >= round.dueAt - LP_ORDERS_LOCK_MS) return fail(LP_ORDERS_LOCKED_ERROR);
  migrateMemberOrders(lp, slot);
  member.ordersByRound = member.ordersByRound && typeof member.ordersByRound === "object" ? member.ordersByRound : {};
  if (body && body.reset) { delete member.ordersByRound[round.index]; return { ok: true, privateLeagueId: lp.id, round: round.index }; }
  const team = me.league && me.league.teams[me.idx];
  if (!team) return fail("Club introuvable.");
  const Friendlies = require("./friendlies.js");
  const Actions = require("./actions.js");
  const v = Actions.validateOrdersSnapshot({ players: Friendlies.friendlyPool(team) }, body && body.orders);
  if (!v.ok) return fail(v.error);
  // Copie propre à cette journée : jamais d'objet partagé avec une autre.
  member.ordersByRound[round.index] = JSON.parse(JSON.stringify(v.value));
  return { ok: true, privateLeagueId: lp.id, round: round.index };
}

// POST /api/private-league/start  body: { id }
// Lancement anticipé par le créateur, dès PRIVATE_LEAGUE_MIN_TEAMS_TO_START
// clubs (le lancement est automatique quand la ligue est complète).
function startPrivateLeague(Engine, store, me, body, now) {
  const lp = findById(store, body && body.id);
  if (!lp) return fail("Ligue privée introuvable.");
  if (!isCreator(lp, me.ref.leagueId, me.idx)) return fail("Seul le créateur de la ligue peut la lancer.");
  if (lp.status !== "open") return fail("Cette ligue privée a déjà commencé.");
  if (lp.members.length < PRIVATE_LEAGUE_MIN_TEAMS_TO_START) {
    return fail(`Il faut au moins ${PRIVATE_LEAGUE_MIN_TEAMS_TO_START} clubs pour lancer la ligue.`);
  }
  startPrivateLeagueNow(Engine, lp, now);
  return { ok: true, privateLeagueId: lp.id };
}

// Ligue privée SPÉCIALE (créée par l'administrateur, retour utilisateur
// 2026-10-02 : « une ligue privée spéciale de 30 matchs avec 3 équipes,
// matchs à 10h 12h 14h 16h 18h 20h sur 5 jours à partir de demain »).
// `refs` : références des clubs (refFor), au moins 2. Un match par créneau :
// les paires s'enchaînent en boucle, domicile et extérieur alternés à chaque
// tour complet. Créneaux (heure de Paris) : `hours` de chaque jour, pendant
// `days` jours à partir de `startDay` ({ year, month, day }). Lancée tout de
// suite (status "running"), sans code à partager ; ne bloque pas la ligue
// privée normale de ses membres (voir activeFor).
function createSpecialPrivateLeague(Engine, store, refs, opts, now) {
  if (!Array.isArray(refs) || refs.length < 2) return fail("Il faut au moins 2 clubs.");
  const name = normalizeName(opts && opts.name);
  if (!name) return fail(`Le nom de la ligue doit faire entre 2 et ${PRIVATE_LEAGUE_NAME_MAX} caractères.`);
  const hours = (opts.hours || []).filter(h => Number.isInteger(h) && h >= 0 && h <= 23);
  const days = Number(opts.days);
  if (!hours.length || !(days >= 1 && days <= 14)) return fail("Créneaux invalides.");
  const slots = [];
  for (let d = 0; d < days; d++) {
    const day = Calendar.addParisCalendarDays(opts.startDay, d);
    hours.forEach(h => slots.push(Calendar.parisEpochForLocalTime(day.year, day.month, day.day, h, 0)));
  }
  slots.sort((a, b) => a - b);
  if (slots[0] <= now) return fail("Le premier créneau est déjà passé.");
  const pairs = [];
  for (let i = 0; i < refs.length; i++) for (let j = i + 1; j < refs.length; j++) pairs.push([i, j]);
  // Ordre des paires : pour 3 clubs, (0,1) (1,2) (0,2) — chacun joue 2
  // créneaux sur 3, jamais 3 de suite.
  const ordered = refs.length === 3 ? [[0, 1], [1, 2], [0, 2]] : pairs;
  let code = randomCode();
  while (store.list.some(lp => lp.code === code)) code = randomCode();
  const lp = {
    id: randomId(Engine), name, code, special: true,
    creator: { leagueId: refs[0].leagueId, idx: refs[0].idx },
    size: refs.length, venue: "home",
    hour: hours[hours.length - 1], minute: 0,
    status: "running",
    createdAt: now, startedAt: now, finishedAt: null,
    members: refs.map(r => ({ ...r })),
    rounds: slots.map((dueAt, index) => {
      const [a, b] = ordered[index % ordered.length];
      const swap = Math.floor(index / ordered.length) % 2 === 1;
      return {
        index, dueAt,
        matches: [{ home: swap ? b : a, away: swap ? a : b, played: false, playedAt: null, scoreHome: null, scoreAway: null, forfeit: null, quarterScores: null, boxScoreHome: null, boxScoreAway: null }],
      };
    }),
  };
  store.list.push(lp);
  return { ok: true, privateLeagueId: lp.id, rounds: lp.rounds.length, firstAt: slots[0], lastAt: slots[slots.length - 1] };
}

// --- Calendrier -------------------------------------------------------------

// Premier vendredi à hour:minute (Paris, 21h30 par défaut) strictement APRÈS `now`.
function firstPrivateLeagueSlotAfter(now, hour = PRIVATE_LEAGUE_HOUR, minute = PRIVATE_LEAGUE_MINUTE) {
  const today = Calendar.parisLocalDateParts(now);
  const daysAhead = Calendar.daysUntilParisWeekday(today, PRIVATE_LEAGUE_WEEKDAY);
  let target = daysAhead > 0 ? Calendar.addParisCalendarDays(today, daysAhead) : today;
  let slot = Calendar.parisEpochForLocalTime(target.year, target.month, target.day, hour, minute);
  if (slot <= now) {
    target = Calendar.addParisCalendarDays(today, daysAhead + 7);
    slot = Calendar.parisEpochForLocalTime(target.year, target.month, target.day, hour, minute);
  }
  return slot;
}

// Créneau de la journée `roundIndex` : `roundIndex` semaines civiles après le
// premier créneau (toujours un vendredi, même heure, changement d'heure compris).
function privateLeagueSlotForRound(firstSlot, roundIndex, hour = PRIVATE_LEAGUE_HOUR, minute = PRIVATE_LEAGUE_MINUTE) {
  if (roundIndex === 0) return firstSlot;
  const day0 = Calendar.parisLocalDateParts(firstSlot);
  const target = Calendar.addParisCalendarDays(day0, 7 * roundIndex);
  return Calendar.parisEpochForLocalTime(target.year, target.month, target.day, hour, minute);
}

// Participants : les places de `members` (ligue « monde ») ou les index de
// `teamIndices` (ancienne forme).
function participantsOf(lp) {
  return Array.isArray(lp.members) ? lp.members.map((_, slot) => slot) : (lp.teamIndices || []).slice();
}

function startPrivateLeagueNow(Engine, lp, now) {
  // Ordre de tirage mélangé pour que le créateur ne reçoive pas toujours en
  // premier ; exempt (-1) ajouté si nombre impair.
  const participants = participantsOf(lp);
  for (let i = participants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [participants[i], participants[j]] = [participants[j], participants[i]];
  }
  if (participants.length % 2 === 1) participants.push(-1);
  const schedule = Engine.generateRoundRobinSchedule(participants.length);
  const { hour, minute } = leagueTime(lp);
  const firstSlot = firstPrivateLeagueSlotAfter(now, hour, minute);
  lp.rounds = schedule.map((round, index) => ({
    index,
    dueAt: privateLeagueSlotForRound(firstSlot, index, hour, minute),
    matches: round
      .map(m => ({ home: participants[m.home], away: participants[m.away] }))
      .filter(m => m.home !== -1 && m.away !== -1)
      .map(m => ({ ...m, played: false, playedAt: null, scoreHome: null, scoreAway: null, forfeit: null, quarterScores: null, boxScoreHome: null, boxScoreAway: null })),
  }));
  lp.status = "running";
  lp.startedAt = now;
}

// Instants des matchs de ligue privée à venir de chaque club d'un
// championnat (Map idx → [epoch]) : posé sur la ligue
// (league.worldPrivateLeagueTimes, jamais sauvegardé) pour que
// Friendlies.officialMatchTimesFor compte ces vendredis comme jours de
// match (amicaux, entraînement).
function busyTimesByIdx(store, leagueId) {
  const out = new Map();
  ((store && store.list) || []).forEach(lp => {
    if (lp.status !== "running") return;
    (lp.rounds || []).forEach(r => r.matches.forEach(m => {
      if (m.played) return;
      [m.home, m.away].forEach(slot => {
        const ref = lp.members[slot];
        if (!ref || ref.leagueId !== leagueId) return;
        if (!out.has(ref.idx)) out.set(ref.idx, []);
        out.get(ref.idx).push(r.dueAt);
      });
    }));
  });
  return out;
}

// --- Simulation -------------------------------------------------------------

// Copie profonde et indépendante d'une équipe : tout ce que MatchEngine
// touche pendant simulate() tombe avec elle.
// Copie INDÉPENDANTE (passage par JSON) : serializeTeam renvoie certains
// objets du vrai club tels quels (feuille de match, priorités, plans) ;
// sans cette copie, des ordres appliqués à la copie pouvaient toucher ceux
// du vrai club (retour utilisateur 2026-10-05 sur les ordres partagés).
function cloneTeamForExhibition(Engine, team) {
  return Engine.teamFromSave(JSON.parse(JSON.stringify(Engine.serializeTeam(team))));
}

function compactBoxScore(rows) {
  return rows.map(r => ({
    id: r.id, name: r.name, position: r.position, min: r.min,
    pts: r.pts, reb: r.reb, oreb: r.oreb || 0, ast: r.ast, stl: r.stl, blk: r.blk, tov: r.tov, pf: r.pf,
    fgm2: r.fgm2, fga2: r.fga2, fgm3: r.fgm3, fga3: r.fga3, ftm: r.ftm, fta: r.fta,
    plusMinus: r.plusMinus || 0,
    starter: r.starter || undefined,
  }));
}

// Direct des matchs de ligue privée (retour utilisateur 2026-10-01 : « il
// faut ajouter le live sur les matchs de ligue privée ») : le match reste
// simulé d'un coup sur des copies (aucun effet sur les vrais clubs), mais
// sa diffusion est calée sur le coup d'envoi de la journée (round.dueAt) et
// rangée avec les directs à revoir (clé « lp:… », voir lpLiveKey ;
// stockage propre à chaque ligue privée « monde », store.appendLpReplays).
// Tant que la diffusion n'est pas finie (match.liveUntil), le score reste
// caché aux managers (projectForViewer) et le fil d'actu attend
// (round.feedPushed). `home`/`away` : places (monde) ou index (ancienne forme).
function lpLiveKey(lp, roundIndex, home, away) {
  return `lp:${lp.id}:${roundIndex}:${home}:${away}`;
}

// Joue UN match sur des copies de `homeReal`/`awayReal` (null = club
// introuvable : forfait). `archive(entry)` reçoit le direct à ranger.
function playMatch(Engine, homeReal, awayReal, lp, match, now, kickoffAt, roundIndex, archive) {
  // Ordres propres à la ligue privée (setPrivateLeagueOrders) : appliqués à
  // la copie, avec ses propres joueurs copiés (jamais les vrais).
  const withOrders = (copy, slot) => {
    // Compo photographiée à T − 5 min (freezeDueOrders) en priorité, sinon
    // ordres de ligue privée actuels, sinon ordres du club (copie telle quelle).
    const frozen = match.frozen && match.frozen[slot];
    const orders = copy && (frozen || memberOrdersForRound(lp, slot, roundIndex));
    if (!orders) return copy;
    try { return require("./friendlies.js").applyFriendlyOrders(Engine, copy, copy, orders, kickoffAt); } catch (e) { return copy; }
  };
  const home = homeReal ? withOrders(cloneTeamForExhibition(Engine, homeReal), match.home) : null;
  const away = awayReal ? withOrders(cloneTeamForExhibition(Engine, awayReal), match.away) : null;
  const homeOk = !!home && home.hasValidLineup();
  const awayOk = !!away && away.hasValidLineup();
  match.played = true;
  match.playedAt = now;
  delete match.frozen;
  if (homeOk && awayOk) {
    // Tactiques des deux équipes (direct et feuille de match, retour
    // utilisateur 2026-10-03), figées avant la simulation.
    const tacticsUsed = { home: Engine.tacticsSnapshotFor(home), away: Engine.tacticsSnapshotFor(away) };
    const engine = new Engine.MatchEngine(home, away, { homeAdvantage: lp.venue === "home" });
    const result = engine.simulate(now);
    match.tacticsUsed = tacticsUsed;
    // Ordres joués (onglet Tactiques, « partir d'un match ») : rangés dans
    // l'historique de chaque club à l'annonce du résultat, jamais envoyés
    // au navigateur (voir projectForViewer).
    match.ordersUsed = { home: Engine.tacticPresetOrdersFrom(home.snapshotTactics()), away: Engine.tacticPresetOrdersFrom(away.snapshotTactics()) };
    match.scoreHome = result.finalScore.A;
    match.scoreAway = result.finalScore.B;
    match.forfeit = null;
    match.quarterScores = { home: result.quarterScores.A, away: result.quarterScores.B };
    match.seed = result.seed;
    match.boxScoreHome = compactBoxScore(result.boxScoreA);
    match.boxScoreAway = compactBoxScore(result.boxScoreB);
    if (roundIndex != null && archive && Array.isArray(result.events) && result.events.length) {
      const pb = schedulePlayback(result.events, kickoffAt);
      match.kickoffAt = kickoffAt;
      match.liveUntil = kickoffAt + pb.totalDurationMs;
      archive({
        round: roundIndex, kickoffAt, homeIdx: match.home, awayIdx: match.away, competition: "lp",
        privateLeague: { id: lp.id, name: lp.name, round: roundIndex, venue: lp.venue },
        forfeit: false, finalScore: { home: match.scoreHome, away: match.scoreAway },
        quarterScores: match.quarterScores, seed: result.seed, tacticsUsed,
        events: pb.events, pauses: pb.pauses, totalDurationMs: pb.totalDurationMs,
        boxScoreA: result.boxScoreA, boxScoreB: result.boxScoreB,
      });
    }
    return;
  }
  match.quarterScores = null; match.boxScoreHome = null; match.boxScoreAway = null; match.tacticsUsed = null;
  if (!homeOk && !awayOk) { match.forfeit = "both"; match.scoreHome = 0; match.scoreAway = 0; return; }
  if (!homeOk) { match.forfeit = "home"; match.scoreHome = 0; match.scoreAway = Engine.FORFEIT_SCORE; return; }
  match.forfeit = "away"; match.scoreHome = Engine.FORFEIT_SCORE; match.scoreAway = 0;
}

function feedEntryFor(lp, round, m, mine, oppName) {
  const pf = mine ? m.scoreHome : m.scoreAway;
  const pa = mine ? m.scoreAway : m.scoreHome;
  const win = pf > pa;
  return {
    category: "ligue",
    title: `${lp.name} · J${round.index + 1} : ${win ? "victoire" : "défaite"} ${pf}-${pa} ${mine ? "contre" : "chez"} ${oppName || "?"}`,
    text: m.forfeit ? "Match perdu ou gagné par forfait (cinq incomplet)." : "Match de ligue privée : aucun effet sur la forme, l'entraînement ni les finances.",
    action: { label: "Ligue privée", href: "/ligues-privees" },
  };
}

// Club réel derrière une référence (ligues en main), ou null : club
// introuvable ou devenu un autre club (nom différent).
function teamOfRef(leagues, ref) {
  const lg = ref && leagues.get(ref.leagueId);
  const t = lg && lg.teams[ref.idx];
  return t && t.name === ref.name ? t : null;
}

// Rattrapage des ligues privées « monde » (server/world.js:catchUpWorld,
// toutes les ligues en main dans `leagues` : Map leagueId → League). Joue
// les journées dues, annonce les résultats une fois la diffusion finie,
// clôt et purge. `out.replays` reçoit les directs à ranger ({ lpId, item }).
// Renvoie true si `store` a changé.
// Compo lue à T − 5 min, comme un match officiel (retour utilisateur
// 2026-10-03) : pour chaque match pas encore joué dont le coup d'envoi est
// dans moins de 5 minutes, photographie des ordres de chaque club — ses
// ordres de ligue privée, sinon les ordres actuels de son club (tactique et
// feuille de match) — jouée telle quelle au coup d'envoi (voir playMatch).
// Une seule photo par journée (round.frozenAt). Renvoie true si posée.
function freezeDueOrders(Engine, lp, round, leagues, now) {
  if (round.frozenAt || typeof round.dueAt !== "number" || now < round.dueAt - LP_ORDERS_LOCK_MS) return false;
  const todo = round.matches.filter(m => !m.played);
  if (!todo.length) return false;
  // Championnat d'un membre illisible ce passage-ci : on réessaie au suivant.
  if (todo.some(m => [m.home, m.away].some(slot => { const r = lp.members[slot]; return !r || !leagues.has(r.leagueId); }))) return false;
  todo.forEach(m => {
    m.frozen = {};
    [m.home, m.away].forEach(slot => {
      const member = lp.members[slot];
      const own = memberOrdersForRound(lp, slot, round.index);
      if (own) { m.frozen[slot] = JSON.parse(JSON.stringify(own)); return; }
      const team = teamOfRef(leagues, member);
      if (team && typeof team.snapshotTactics === "function") {
        m.frozen[slot] = { ...JSON.parse(JSON.stringify(team.snapshotTactics())), lineup: JSON.parse(JSON.stringify(team.lineup || {})) };
      }
    });
  });
  round.frozenAt = now;
  return true;
}

function catchUp(Engine, store, leagues, now, out = {}) {
  if (!isValidStore(store)) return false;
  const replays = out.replays || (out.replays = []);
  const played = out.played || (out.played = []);
  let changed = false;
  store.list.forEach(lp => {
    if (lp.status !== "running") return;
    lp.rounds.forEach(round => {
      if (freezeDueOrders(Engine, lp, round, leagues, now)) changed = true;
      if (round.dueAt > now) return;
      const todo = round.matches.filter(m => !m.played);
      if (!todo.length) return;
      // Un championnat d'un membre illisible ce passage-ci : la journée
      // attend (jamais un forfait pour une panne de stockage).
      const missing = todo.some(m => [m.home, m.away].some(slot => { const r = lp.members[slot]; return !r || !leagues.has(r.leagueId); }));
      if (missing) return;
      todo.forEach(m => {
        const homeReal = teamOfRef(leagues, lp.members[m.home]);
        const awayReal = teamOfRef(leagues, lp.members[m.away]);
        playMatch(Engine, homeReal, awayReal, lp, m, now, round.dueAt, round.index, entry => {
          replays.push({ lpId: lp.id, item: { key: lpLiveKey(lp, round.index, m.home, m.away), savedAt: now, entry } });
        });
      });
      round.feedPushed = false;
      played.push({ privateLeagueId: lp.id, round: round.index });
      changed = true;
    });
    // Fil d'actu (résultat) seulement une fois la diffusion de la journée
    // finie ; feedPushed absent = journée d'avant le direct, déjà annoncée.
    lp.rounds.forEach(round => {
      if (round.feedPushed !== false || !round.matches.every(m => m.played)) return;
      if (round.matches.some(m => typeof m.liveUntil === "number" && m.liveUntil > now)) return;
      round.matches.forEach(m => {
        [m.home, m.away].forEach(slot => {
          const ref = lp.members[slot];
          const team = teamOfRef(leagues, ref);
          if (!team || !team.isHuman || !team.feed) return;
          const mine = slot === m.home;
          const opp = lp.members[mine ? m.away : m.home];
          Engine.pushEntry(team.feed, { key: `private_league_${lp.id}_${round.index}_${ref.idx}`, week: team.week, ...feedEntryFor(lp, round, m, mine, opp && opp.name) });
          if (m.ordersUsed && m.ordersUsed[mine ? "home" : "away"] && typeof Engine.pushOrdersHistory === "function") {
            Engine.pushOrdersHistory(team, { competition: "lp", round: round.index, lpName: lp.name, at: round.dueAt, opponentName: opp && opp.name, isHome: mine,
              scoreFor: mine ? m.scoreHome : m.scoreAway, scoreAgainst: mine ? m.scoreAway : m.scoreHome, orders: m.ordersUsed[mine ? "home" : "away"] });
          }
        });
        delete m.ordersUsed;
      });
      round.feedPushed = true;
      changed = true;
    });
    if (lp.rounds.every(r => r.matches.every(m => m.played)) && lp.rounds.every(r => r.feedPushed !== false)) {
      lp.status = "finished";
      lp.finishedAt = now;
      changed = true;
    }
  });
  const before = store.list.length;
  store.list = store.list.filter(lp => {
    if (lp.status !== "finished") return true;
    return typeof lp.finishedAt !== "number" || now - lp.finishedAt < PRIVATE_LEAGUE_FINISHED_RETENTION_MS;
  });
  return changed || store.list.length !== before;
}

// Prochaine échéance (coup d'envoi d'une journée, fin de diffusion à
// annoncer) — server/world.js la donne à server/index.js pour relancer le
// rattrapage à l'heure.
function nextDeadline(store, now) {
  let next = null;
  const take = t => { if (typeof t === "number" && t > now && (next == null || t < next)) next = t; };
  ((store && store.list) || []).forEach(lp => {
    if (lp.status !== "running") return;
    lp.rounds.forEach(round => {
      if (round.matches.some(m => !m.played)) {
        take(round.dueAt);
        // Photo de la compo à T − 5 min (freezeDueOrders).
        if (!round.frozenAt) take(round.dueAt - LP_ORDERS_LOCK_MS);
      }
      if (round.feedPushed === false) round.matches.forEach(m => take(typeof m.liveUntil === "number" ? m.liveUntil + 1000 : null));
    });
  });
  return next;
}

// Noms, libellés de division et apparence des membres rafraîchis depuis les
// vrais clubs (ligues en main). `labelOf(leagueId)` : « Division I »…
// Renvoie true si quelque chose a changé.
function refreshRefs(store, leagues, labelOf = () => null) {
  let changed = false;
  ((store && store.list) || []).forEach(lp => {
    if (lp.status === "finished") return;
    lp.members.forEach(ref => {
      const lg = leagues.get(ref.leagueId);
      const team = lg && lg.teams[ref.idx];
      if (!team || team.name !== ref.name) return;
      const look = teamLook(team);
      const label = labelOf(ref.leagueId) || ref.label || "";
      const country = lg.country || ref.country || "fr";
      if (JSON.stringify(look) !== JSON.stringify(ref.look) || label !== ref.label || country !== ref.country) {
        ref.look = look; ref.label = label; ref.country = country;
        changed = true;
      }
    });
  });
  return changed;
}

// Montées/descentes (server/world.js:applyCountryMoves échange deux clubs
// entre deux championnats) : les références suivent le club. Même ordre
// que les échanges eux-mêmes. Renvoie true si une référence a bougé.
function remapMoves(store, moves) {
  let changed = false;
  (moves || []).forEach(m => {
    if (!m || !m.up || !m.down) return;
    const swap = r => {
      if (!r) return;
      if (r.leagueId === m.up.leagueId && r.idx === m.up.idx) { r.leagueId = m.down.leagueId; r.idx = m.down.idx; changed = true; return; }
      if (r.leagueId === m.down.leagueId && r.idx === m.down.idx) { r.leagueId = m.up.leagueId; r.idx = m.up.idx; changed = true; }
    };
    ((store && store.list) || []).forEach(lp => { lp.members.forEach(swap); swap(lp.creator); });
  });
  return changed;
}

// --- Migration des anciennes ligues privées ----------------------------------

// Range dans `store` les ligues privées de l'ancienne forme encore dans
// league.privateLeagues (même id, même code, mêmes membres, journées et
// résultats ; index → références). Idempotent : une ligue déjà présente
// (même id) n'est pas recopiée. Ne touche PAS à league.privateLeagues (voir
// migrateAndSave : vidé seulement une fois l'écriture vérifiée).
// `refOf(idx)` : référence du club `idx` de cette ligue (refFor).
// Renvoie les ids recopiés.
function migrateLeague(store, leagueId, league, refOf) {
  const moved = [];
  (league && Array.isArray(league.privateLeagues) ? league.privateLeagues : []).forEach(old => {
    if (!old || !old.id || !Array.isArray(old.teamIndices)) return;
    if (store.list.some(lp => lp.id === old.id)) return;
    const slotOf = idx => old.teamIndices.indexOf(idx);
    // Code unique dans le monde : deux championnats ont pu tirer le même
    // code avant la mise en commun (improbable) — le second en change.
    let code = old.code;
    if (store.list.some(lp => lp.code === code)) {
      do { code = randomCode(); } while (store.list.some(lp => lp.code === code));
      console.warn(`[ligues privées] code ${old.code} déjà pris dans le monde : « ${old.name} » (${leagueId}) passe au code ${code}.`);
    }
    const creatorIdx = Number.isInteger(old.creatorTeamIndex) ? old.creatorTeamIndex : old.teamIndices[0];
    const lp = {
      id: old.id, name: old.name, code,
      creator: { leagueId, idx: creatorIdx },
      size: old.size, venue: old.venue,
      ...(Number.isInteger(old.hour) && Number.isInteger(old.minute) ? { hour: old.hour, minute: old.minute } : {}),
      status: old.status, createdAt: old.createdAt || null, startedAt: old.startedAt || null, finishedAt: old.finishedAt || null,
      members: old.teamIndices.map(idx => refOf(idx)),
      rounds: (old.rounds || []).map(r => ({
        ...r,
        matches: (r.matches || []).map(m => {
          const out = { ...m, home: slotOf(m.home), away: slotOf(m.away) };
          // Direct déjà rangé sous l'ancienne clé, dans les directs de
          // ligue privée de ce championnat (store.loadReplays(…, "lp")).
          if (typeof m.liveUntil === "number") out.legacyKey = lpLiveKey(old, r.index, m.home, m.away);
          return out;
        }).filter(m => m.home >= 0 && m.away >= 0),
      })),
      legacy: { leagueId },
    };
    store.list.push(lp);
    moved.push(lp.id);
  });
  return moved;
}

// --- Stockage (données annexes du monde) -------------------------------------

// Lecture : le stockage, `emptyStore()` s'il n'existe pas encore, `null` si
// la lecture a ÉCHOUÉ (stockage injoignable, JSON abîmé) — jamais un stock
// vide à la place (il serait réécrit par-dessus les vraies ligues).
async function loadStore(savePath) {
  const store = require("./store.js");
  const raw = await store.loadWorldAuxStrict(STORE_NAME, savePath);
  if (raw === store.WORLD_READ_FAILED) return null;
  if (raw == null) return emptyStore();
  if (!isValidStore(raw)) { console.warn("[ligues privées] données du monde inattendues : laissées telles quelles."); return null; }
  return raw;
}

// Écriture : lève une exception si elle échoue.
async function saveStore(data, savePath) {
  const store = require("./store.js");
  await store.saveWorldAuxRaw(STORE_NAME, data, savePath, { strict: true });
}

// Migration sûre de plusieurs ligues : `entries` = [{ leagueId, league,
// refOf }]. Recopie dans une COPIE du stock, l'écrit, la RELIT et vérifie
// chaque ligue recopiée avant de vider league.privateLeagues (à l'appelant
// de sauvegarder ces ligues — elles sont renvoyées). Au moindre échec, rien
// ne change (les anciennes ligues continuent comme avant, voir
// catchUpPrivateLeagues) et la migration sera retentée au passage suivant.
async function migrateAndSave(storeData, entries, savePath) {
  const withLegacy = (entries || []).filter(e => e.league && Array.isArray(e.league.privateLeagues) && e.league.privateLeagues.length);
  if (!withLegacy.length || !isValidStore(storeData)) return [];
  const next = JSON.parse(JSON.stringify(storeData));
  let moved = 0;
  withLegacy.forEach(e => { moved += migrateLeague(next, e.leagueId, e.league, e.refOf).length; });
  try {
    if (moved) {
      await saveStore(next, savePath);
      const check = await loadStore(savePath);
      const ok = check && withLegacy.every(e => e.league.privateLeagues.every(old => !old || !old.id || check.list.some(lp => lp.id === old.id)));
      if (!ok) throw new Error("relecture incomplète");
    }
  } catch (e) {
    console.warn("[ligues privées] migration vers le monde reportée :", e.message);
    return [];
  }
  storeData.version = next.version;
  storeData.list = next.list;
  withLegacy.forEach(e => {
    console.log(`[ligues privées] ${e.league.privateLeagues.length} ligue(s) privée(s) de ${e.leagueId} rangée(s) au niveau du monde.`);
    e.league.privateLeagues = [];
  });
  return withLegacy.map(e => e.league);
}

// --- Lecture ----------------------------------------------------------------

// Classement : 2 pts la victoire, 1 la défaite (convention du championnat du
// jeu), départage au +/- puis aux points marqués. Sur une vue projetée
// (teamIndices) ou une ligue « monde » (places de members).
function privateLeagueStandings(lp) {
  const rows = new Map();
  participantsOf(lp).forEach(idx => rows.set(idx, { idx, played: 0, wins: 0, losses: 0, pf: 0, pa: 0, pts: 0, form: [] }));
  lp.rounds.forEach(round => round.matches.forEach(m => {
    if (!m.played) return;
    const h = rows.get(m.home), a = rows.get(m.away);
    if (!h || !a) return;
    h.played++; a.played++;
    h.pf += m.scoreHome; h.pa += m.scoreAway; a.pf += m.scoreAway; a.pa += m.scoreHome;
    const homeWin = m.scoreHome > m.scoreAway;
    if (homeWin) { h.wins++; a.losses++; h.form.push("V"); a.form.push("D"); }
    else { a.wins++; h.losses++; a.form.push("V"); h.form.push("D"); }
  }));
  const list = [...rows.values()].map(r => ({ ...r, pts: r.wins * 2 + r.losses, diff: r.pf - r.pa, form: r.form.slice(-5) }));
  list.sort((x, y) => y.pts - x.pts || y.diff - x.diff || y.pf - x.pf);
  return list.map((r, i) => ({ ...r, rank: i + 1 }));
}

// Match encore en direct : score, quarts et feuilles retirés (pas de
// spoiler, ni dans le calendrier ni au classement) ; `live: true` et
// l'heure de fin suffisent au navigateur pour proposer « Voir le direct ».
function hideLive(m, now) {
  if (!(m.played && typeof m.liveUntil === "number" && m.liveUntil > now)) return m;
  return { ...m, played: false, live: true, scoreHome: null, scoreAway: null, quarterScores: null, boxScoreHome: null, boxScoreAway: null, forfeit: null, tacticsUsed: null };
}

// Ligues privées « monde » d'un manager, dans le repère de sa ligue :
// seulement celles dont son club est membre (code d'invitation compris),
// sous l'ancienne forme (teamIndices, creatorTeamIndex, home/away locaux) +
// `members` (pays, division, championnat de chaque club). Clubs des autres
// championnats = invités légers (nom, pays, apparence), index
// PRIVATE_LEAGUE_GUEST_IDX + k. Renvoie { privateLeagues, guests, localOf }.
function projectForViewer(store, leagueId, idx, now = Date.now()) {
  const guests = [];
  const byKey = new Map();
  const localOf = ref => {
    if (!ref) return -1;
    if (ref.leagueId === leagueId) return ref.idx;
    const key = `${ref.leagueId}:${ref.idx}`;
    let g = byKey.get(key);
    if (!g) {
      g = {
        localIdx: PRIVATE_LEAGUE_GUEST_IDX + byKey.size, leagueId: ref.leagueId, idx: ref.idx,
        light: { name: ref.name, country: ref.country || null, label: ref.label || null, players: [], look: { ...(ref.look || {}), isHuman: true } },
      };
      byKey.set(key, g);
      guests.push(g);
    }
    return g.localIdx;
  };
  const privateLeagues = ((store && store.list) || []).filter(lp => memberSlot(lp, leagueId, idx) >= 0).map(lp => {
    const local = lp.members.map(localOf);
    const creatorSlot = lp.members.findIndex(r => sameRef(r, lp.creator));
    return {
      id: lp.id, name: lp.name, code: lp.code,
      creatorTeamIndex: creatorSlot >= 0 ? local[creatorSlot] : (lp.creator && lp.creator.leagueId === leagueId ? lp.creator.idx : -1),
      size: lp.size, venue: lp.venue, special: !!lp.special,
      ...(Number.isInteger(lp.hour) && Number.isInteger(lp.minute) ? { hour: lp.hour, minute: lp.minute } : {}),
      status: lp.status, createdAt: lp.createdAt, startedAt: lp.startedAt, finishedAt: lp.finishedAt,
      teamIndices: local.slice(),
      members: lp.members.map((r, s) => ({ idx: local[s], name: r.name, country: r.country || null, label: r.label || null, leagueId: r.leagueId, sameLeague: r.leagueId === leagueId })),
      // Ses propres ordres de ligue privée seulement (jamais ceux des autres),
      // un jeu par journée encore à jouer (voir setPrivateLeagueOrders).
      ...myLpOrdersView(lp, lp.members.findIndex(r => r.leagueId === leagueId && r.idx === idx)),
      rounds: (lp.rounds || []).map(round => ({
        index: round.index, dueAt: round.dueAt,
        matches: round.matches.map(m => {
          const v = hideLive({ ...m, home: local[m.home], away: local[m.away] }, now);
          delete v.legacyKey;
          // Compo photographiée à T − 5 min : jamais envoyée (ordres privés).
          delete v.frozen;
          delete v.ordersUsed;
          return v;
        }),
      })),
    };
  });
  return { privateLeagues, guests };
}

// Repère d'un manager pour UNE ligue « monde » : place → index local (même
// numérotation que projectForViewer, qui doit être appelée sur le même
// stock pour que les invités coïncident).
function localIndexMap(store, lp, leagueId, idx) {
  const proj = projectForViewer(store, leagueId, idx);
  const view = proj.privateLeagues.find(x => x.id === lp.id);
  return view ? { slotToLocal: view.teamIndices.slice(), guests: proj.guests } : null;
}

// --- Compatibilité : ancienne forme (League.privateLeagues) -------------------
// Ligues pas encore rangées au niveau du monde (stockage du monde illisible
// au moment de la migration) : elles continuent de se jouer comme avant,
// dans leur championnat, jusqu'à la migration (migrateAndSave).

function archivePrivateLeagueLive(league, lp, roundIndex, match, entry) {
  if (!league.pendingReplays) Object.defineProperty(league, "pendingReplays", { value: [], writable: true, enumerable: false, configurable: true });
  league.pendingReplays.push({ key: `${league.seasonNumber || 1}:${lpLiveKey(lp, roundIndex, match.home, match.away)}`, season: league.seasonNumber || 1, savedAt: Date.now(), entry });
}

function simulatePrivateLeagueMatch(Engine, league, lp, match, now, kickoffAt = now, roundIndex = null) {
  const homeReal = league.teams[match.home] || null;
  const awayReal = league.teams[match.away] || null;
  if (!homeReal || !awayReal) {
    match.played = true; match.playedAt = now; match.forfeit = "both";
    match.scoreHome = 0; match.scoreAway = 0;
    return;
  }
  playMatch(Engine, homeReal, awayReal, lp, match, now, kickoffAt, roundIndex, entry => archivePrivateLeagueLive(league, lp, roundIndex, match, entry));
}

function catchUpPrivateLeagues(Engine, league, now) {
  const played = [];
  if (!league || !Array.isArray(league.privateLeagues) || league.privateLeagues.length === 0) return played;
  league.privateLeagues.forEach(lp => {
    if (lp.status !== "running") return;
    lp.rounds.forEach(round => {
      if (round.dueAt > now) return;
      if (round.matches.every(m => m.played)) return;
      round.matches.forEach(m => { if (!m.played) simulatePrivateLeagueMatch(Engine, league, lp, m, now, round.dueAt, round.index); });
      round.feedPushed = false;
      played.push({ privateLeagueId: lp.id, round: round.index });
    });
    lp.rounds.forEach(round => {
      if (round.feedPushed !== false || !round.matches.every(m => m.played)) return;
      if (round.matches.some(m => typeof m.liveUntil === "number" && m.liveUntil > now)) return;
      round.matches.forEach(m => {
        [m.home, m.away].forEach(idx => {
          const team = league.teams[idx];
          if (!team || !team.isHuman || !team.feed) return;
          const mine = idx === m.home;
          const opp = league.teams[mine ? m.away : m.home];
          Engine.pushEntry(team.feed, { key: `private_league_${lp.id}_${round.index}_${idx}`, week: team.week, ...feedEntryFor(lp, round, m, mine, opp && opp.name) });
        });
      });
      round.feedPushed = true;
    });
    if (lp.rounds.every(r => r.matches.every(m => m.played)) && lp.rounds.every(r => r.feedPushed !== false)) {
      lp.status = "finished";
      lp.finishedAt = now;
    }
  });
  league.privateLeagues = league.privateLeagues.filter(lp => {
    if (lp.status !== "finished") return true;
    return typeof lp.finishedAt !== "number" || now - lp.finishedAt < PRIVATE_LEAGUE_FINISHED_RETENTION_MS;
  });
  return played;
}

// Vue de l'ancienne forme pour un manager de ce championnat (code masqué
// hors membres, score caché pendant le direct).
function sanitizePrivateLeaguesForViewer(privateLeagues, viewerTeamIndex, now = Date.now()) {
  return (privateLeagues || []).map(lp => {
    const member = (lp.teamIndices || []).includes(viewerTeamIndex);
    const rounds = (lp.rounds || []).map(round => ({ ...round, matches: round.matches.map(m => { const v = hideLive({ ...m }, now); delete v.frozen; delete v.ordersUsed; return v; }) }));
    return { ...lp, rounds, code: member ? lp.code : null };
  });
}

module.exports = {
  LP_ORDERS_LOCK_MS, memberOrdersLocked, memberOrdersForRound, migrateMemberOrders,
  PRIVATE_LEAGUE_SIZES, PRIVATE_LEAGUE_MIN_TEAMS_TO_START, PRIVATE_LEAGUE_VENUES,
  PRIVATE_LEAGUE_WEEKDAY, PRIVATE_LEAGUE_HOUR, PRIVATE_LEAGUE_MINUTE, PRIVATE_LEAGUE_TIMES, PRIVATE_LEAGUE_NAME_MAX,
  PRIVATE_LEAGUE_CODE_LENGTH, PRIVATE_LEAGUE_FINISHED_RETENTION_MS, PRIVATE_LEAGUE_GUEST_IDX, STORE_NAME,
  // Monde
  emptyStore, isValidStore, refFor, teamLook, activeFor, findById, memberSlot, sameRef,
  createPrivateLeague, createSpecialPrivateLeague, setPrivateLeagueOrders, joinPrivateLeague, leavePrivateLeague, startPrivateLeague,
  catchUp, nextDeadline, refreshRefs, remapMoves, busyTimesByIdx, projectForViewer, localIndexMap,
  migrateLeague, migrateAndSave, loadStore, saveStore,
  // Communs
  startPrivateLeagueNow, firstPrivateLeagueSlotAfter, privateLeagueSlotForRound,
  privateLeagueStandings, lpLiveKey, normalizeCode, normalizeTime,
  // Compatibilité (ancienne forme)
  simulatePrivateLeagueMatch, catchUpPrivateLeagues, sanitizePrivateLeaguesForViewer,
};
