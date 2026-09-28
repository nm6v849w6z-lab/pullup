"use strict";

// =====================================================================
// MATCHS AMICAUX ENTRE CHAMPIONNATS / PAYS (liste de la nuit du
// 2026-09-28 : « amicaux entre ligues/pays »). Mêmes règles que les
// amicaux d'un même championnat (server/friendlies.js : jour de repos
// commun, heure de Paris par demi-heure, invitation à accepter contre un
// manager, 3 jours / 1 h avant, un amical par jour, vrais joueurs,
// fatigue/blessures/progression, rien sur le classement ni l'économie),
// mais les deux clubs vivent dans deux championnats différents : l'amical
// est rangé au niveau du monde (données annexes « friendlies »,
// store.loadWorldAuxRaw) et joué par server/world.js:catchUpWorld, qui a
// les deux ligues en main.
//
//   { id, home: ref, away: ref, proposer: "home"|"away", at, day, time,
//     status, createdAt, respondedAt, cancelReason,
//     lineups: { home?, away? }, orders: { home?, away? }, result }
//   ref = { leagueId, idx, name, country, label }
//
// Navigateur : projeté dans league.friendlies (id « w<id> », adversaire =
// club invité léger 3000 + k), actions /api/friendly/* avec cet id.
// =====================================================================

const Friendlies = require("./friendlies.js");
const Calendar = require("./calendar.js");

const WORLD_FRIENDLY_GUEST_IDX = 3000;
const ID_PREFIX = "w";

function fail(error) { return { ok: false, error }; }
function isUpcoming(f) { return f.status === "pending" || f.status === "accepted"; }
function sideOf(f, leagueId, idx) {
  if (f.home.leagueId === leagueId && f.home.idx === idx) return "home";
  if (f.away.leagueId === leagueId && f.away.idx === idx) return "away";
  return null;
}
function other(side) { return side === "home" ? "away" : "home"; }
function isWorldId(id) { return typeof id === "string" && id.startsWith(ID_PREFIX) && id.length > 1; }
function rawId(id) { return id.slice(ID_PREFIX.length); }

function emptyStore() { return { version: 1, list: [] }; }

// Jours d'amicaux « monde » d'un club (Map idx → Set de jours) pour une
// ligue : ajoutés aux conflits des amicaux internes (voir
// Friendlies.friendlyDaysFor, league.worldFriendlyDays).
function friendlyDaysByIdx(store, leagueId, exceptId = null) {
  const out = new Map();
  ((store && store.list) || []).forEach(f => {
    if (!isUpcoming(f) || f.id === exceptId) return;
    ["home", "away"].forEach(side => {
      const r = f[side];
      if (r.leagueId !== leagueId) return;
      if (!out.has(r.idx)) out.set(r.idx, new Set());
      out.get(r.idx).add(f.day);
    });
  });
  return out;
}

// Pourquoi ce jour n'est pas possible (null = possible). `myLg`/`oppLg` :
// les deux ligues (avec worldFriendlyDays posé).
function dayConflict(Engine, myLg, myIdx, oppLg, oppIdx, day, exceptId = null) {
  if (Friendlies.officialDaysFor(Engine, myLg, myIdx).has(day)) return "Votre club a un match officiel ce jour-là : les amicaux se jouent les jours de repos.";
  if (Friendlies.officialDaysFor(Engine, oppLg, oppIdx).has(day)) return "Votre adversaire a un match officiel ce jour-là.";
  if (Friendlies.friendlyDaysFor(myLg, myIdx, exceptId).has(day)) return "Votre club a déjà un match amical ce jour-là (un par jour au plus).";
  if (Friendlies.friendlyDaysFor(oppLg, oppIdx, exceptId).has(day)) return "Votre adversaire a déjà un match amical ce jour-là.";
  return null;
}

function availableDays(Engine, myLg, myIdx, oppLg, oppIdx, now) {
  const out = [];
  if (typeof myLg.calendarStartAt !== "number" || typeof oppLg.calendarStartAt !== "number") return out;
  const today = Calendar.parisLocalDateParts(now);
  for (let d = 0; d <= Friendlies.FRIENDLY_HORIZON_DAYS; d++) {
    const parts = Calendar.addParisCalendarDays(today, d);
    const key = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    if (dayConflict(Engine, myLg, myIdx, oppLg, oppIdx, key)) continue;
    const times = Friendlies.FRIENDLY_TIMES.filter(t => Friendlies.slotEpoch(parts, t) >= now + Friendlies.FRIENDLY_MIN_LEAD_MS);
    if (!times.length) continue;
    out.push({ day: key, label: Friendlies.dayLabelFr(Friendlies.slotEpoch(parts, "12:00")), times });
  }
  return out;
}

function whenLabel(f) { return Friendlies.whenLabel(f); }

// Proposition. `me`/`opp` = { league, idx, ref } ; `store` modifié sur place.
function propose(Engine, store, me, opp, body, now) {
  const team = me.league.teams[me.idx];
  const oppTeam = opp.league.teams[opp.idx];
  if (!team || !team.isHuman) return fail("Seul un club géré par un manager peut proposer un amical.");
  if (!oppTeam) return fail("Adversaire introuvable.");
  if (me.ref.leagueId === opp.ref.leagueId) return fail("Adversaire du même championnat : passez par la liste habituelle.");
  const dayParts = Friendlies.parseDayKey(body && body.day);
  if (!dayParts) return fail("Jour invalide.");
  const time = body && body.time ? String(body.time) : Friendlies.FRIENDLY_DEFAULT_TIME;
  if (!Friendlies.FRIENDLY_TIMES.includes(time)) return fail("Heure invalide (par demi-heure, de 08h00 à 23h30).");
  const at = Friendlies.slotEpoch(dayParts, time);
  const day = Friendlies.dayKeyOf(at);
  if (at < now + Friendlies.FRIENDLY_MIN_LEAD_MS) return fail("Le coup d'envoi doit être dans au moins 30 minutes.");
  if (at > now + (Friendlies.FRIENDLY_HORIZON_DAYS + 1) * Calendar.DAY_MS) return fail(`Un amical se programme au plus ${Friendlies.FRIENDLY_HORIZON_DAYS} jours à l'avance.`);
  const conflict = dayConflict(Engine, me.league, me.idx, opp.league, opp.idx, day);
  if (conflict) return fail(conflict);
  const upcomingMine = (me.league.friendlies || []).filter(f => isUpcoming(f) && (f.homeIdx === me.idx || f.awayIdx === me.idx)).length +
    store.list.filter(f => isUpcoming(f) && sideOf(f, me.ref.leagueId, me.idx)).length;
  if (upcomingMine >= Friendlies.FRIENDLY_MAX_UPCOMING) return fail(`${Friendlies.FRIENDLY_MAX_UPCOMING} matchs amicaux à venir au plus.`);
  if (oppTeam.isHuman && at - Friendlies.FRIENDLY_ACCEPT_DEADLINE_MS <= now) return fail("Contre un manager, le match doit être dans plus d'une heure : il doit accepter au plus tard 1 h avant.");
  const venue = body && body.venue === "away" ? "away" : "home";
  const human = !!oppTeam.isHuman;
  const f = {
    id: Engine.randomHexToken(6),
    home: venue === "home" ? me.ref : opp.ref,
    away: venue === "home" ? opp.ref : me.ref,
    proposer: venue === "home" ? "home" : "away",
    at, day, time,
    status: human ? "pending" : "accepted",
    createdAt: now, respondedAt: human ? null : now, cancelReason: null,
    lineups: {}, orders: {}, result: null,
  };
  store.list.push(f);
  if (human) {
    Friendlies.pushFeed(Engine, oppTeam, `friendly_invite_${f.id}`, `Invitation à un match amical de ${team.name}`,
      `${team.name} (${me.ref.label}) vous propose un amical le ${whenLabel(f)}. Répondez depuis l'onglet Matchs amicaux.`);
  }
  return { ok: true, friendlyId: ID_PREFIX + f.id, status: f.status, entry: f };
}

function find(store, id) { return store.list.find(f => f.id === rawId(id)) || null; }

function respond(Engine, store, me, oppLeague, body, now) {
  const f = find(store, body && body.id);
  const side = f && sideOf(f, me.ref.leagueId, me.idx);
  if (!side) return fail("Match amical introuvable.");
  if (f.proposer === side) return fail("C'est à votre adversaire de répondre à cette invitation.");
  if (f.status !== "pending") return fail("Cette invitation n'est plus en attente.");
  if (f.at <= now) return fail("L'heure de ce match amical est passée.");
  const deadline = Math.min((f.createdAt || 0) + Friendlies.FRIENDLY_INVITE_TTL_MS, f.at - Friendlies.FRIENDLY_ACCEPT_DEADLINE_MS);
  const team = me.league.teams[me.idx];
  const oppRef = f[other(side)];
  const proposer = oppLeague && oppLeague.teams[oppRef.idx];
  if (body && body.accept) {
    if (now >= deadline) return fail("Trop tard pour accepter : l'invitation a expiré.");
    if (oppLeague) {
      // Cet amical-ci ne compte pas comme conflit avec lui-même.
      me.league.worldFriendlyDays = friendlyDaysByIdx(store, me.ref.leagueId, f.id);
      oppLeague.worldFriendlyDays = friendlyDaysByIdx(store, oppRef.leagueId, f.id);
      const conflict = dayConflict(Engine, me.league, me.idx, oppLeague, oppRef.idx, f.day, f.id);
      if (conflict) return fail(conflict);
    }
    f.status = "accepted";
    f.respondedAt = now;
    Friendlies.pushFeed(Engine, proposer, `friendly_answer_${f.id}`, `${team.name} accepte votre match amical`, `Rendez-vous le ${whenLabel(f)}.`);
  } else {
    f.status = "declined";
    f.respondedAt = now;
    Friendlies.pushFeed(Engine, proposer, `friendly_answer_${f.id}`, `${team.name} décline votre match amical`, `L'amical du ${whenLabel(f)} n'aura pas lieu.`);
  }
  return { ok: true, friendlyId: ID_PREFIX + f.id, status: f.status };
}

function cancel(Engine, store, me, oppLeague, body, now) {
  const f = find(store, body && body.id);
  const side = f && sideOf(f, me.ref.leagueId, me.idx);
  if (!side) return fail("Match amical introuvable.");
  if (!isUpcoming(f)) return fail("Ce match amical n'est plus à venir.");
  if (f.status === "pending" && f.proposer !== side) return fail("Pour décliner une invitation, utilisez « Refuser ».");
  if (f.at <= now) return fail("Ce match amical a déjà commencé.");
  const team = me.league.teams[me.idx];
  f.status = "cancelled";
  f.cancelReason = `Annulé par ${team.name}.`;
  f.respondedAt = f.respondedAt || now;
  const oppRef = f[other(side)];
  Friendlies.pushFeed(Engine, oppLeague && oppLeague.teams[oppRef.idx], `friendly_cancel_${f.id}`, `${team.name} annule le match amical`, `L'amical du ${whenLabel(f)} n'aura pas lieu.`);
  return { ok: true, friendlyId: ID_PREFIX + f.id, status: f.status };
}

function setLineup(Engine, store, me, body, now) {
  const f = find(store, body && body.id);
  const side = f && sideOf(f, me.ref.leagueId, me.idx);
  if (!side) return fail("Match amical introuvable.");
  if (!isUpcoming(f)) return fail("Ce match amical n'est plus à venir.");
  if (f.at <= now) return fail("Ce match amical a déjà commencé.");
  const team = me.league.teams[me.idx];
  f.lineups = f.lineups || {};
  f.orders = f.orders || {};
  if (body && body.reset) { delete f.lineups[side]; delete f.orders[side]; return { ok: true, friendlyId: ID_PREFIX + f.id }; }
  if (body && body.orders) {
    const Actions = require("./actions.js");
    const v = Actions.validateOrdersSnapshot({ players: Friendlies.friendlyPool(team) }, body.orders);
    if (!v.ok) return fail(v.error);
    f.orders[side] = v.value;
    delete f.lineups[side];
    return { ok: true, friendlyId: ID_PREFIX + f.id };
  }
  const v = Friendlies.validateLineup(team, body);
  if (v.error) return fail(v.error);
  f.lineups[side] = v.value;
  return { ok: true, friendlyId: ID_PREFIX + f.id };
}

// Amicaux « monde » d'un manager, dans le repère de sa ligue (voir le
// commentaire de tête). Renvoie { friendlies, guests }.
function projectForViewer(store, leagueId, idx) {
  const guests = [];
  const byKey = new Map();
  const guestIdx = ref => {
    const key = `${ref.leagueId}:${ref.idx}`;
    let g = byKey.get(key);
    if (!g) {
      g = { localIdx: WORLD_FRIENDLY_GUEST_IDX + byKey.size, leagueId: ref.leagueId, idx: ref.idx, light: { name: ref.name, country: ref.country || null, players: [] } };
      byKey.set(key, g);
      guests.push(g);
    }
    return g.localIdx;
  };
  const friendlies = ((store && store.list) || []).map(f => {
    const side = sideOf(f, leagueId, idx);
    if (!side) return null;
    const oppIdx = guestIdx(f[other(side)]);
    const local = s => (s === side ? idx : oppIdx);
    const lineups = {}, orders = {};
    if (f.lineups && f.lineups[side]) lineups[idx] = f.lineups[side];
    if (f.orders && f.orders[side]) orders[idx] = f.orders[side];
    return {
      id: ID_PREFIX + f.id, homeIdx: local("home"), awayIdx: local("away"), proposerIdx: local(f.proposer),
      at: f.at, day: f.day, time: f.time, status: f.status, createdAt: f.createdAt, respondedAt: f.respondedAt,
      cancelReason: f.cancelReason, lineups, orders,
      result: f.result ? { ...f.result, injuries: (f.result.injuries || []).map(i => ({ teamIdx: local(i.side), playerId: i.playerId, name: i.name })) } : null,
      remote: { leagueId: f[other(side)].leagueId, label: f[other(side)].label || null, country: f[other(side)].country || null },
    };
  }).filter(Boolean);
  return { friendlies, guests };
}

// Rattrapage (server/world.js:catchUpWorld, toutes les ligues en main) :
// invitations expirées, amicaux joués, purge. Renvoie true si modifié.
function catchUp(Engine, store, leagues, now, events = []) {
  let changed = false;
  const teamOf = ref => { const lg = leagues.get(ref.leagueId); return lg ? lg.teams[ref.idx] : null; };
  store.list.slice().sort((a, b) => a.at - b.at).forEach(f => {
    const deadline = Math.min((f.createdAt || 0) + Friendlies.FRIENDLY_INVITE_TTL_MS, f.at - Friendlies.FRIENDLY_ACCEPT_DEADLINE_MS);
    if (f.status === "pending" && now >= deadline) {
      f.status = "expired";
      changed = true;
      const proposer = teamOf(f[f.proposer]);
      Friendlies.pushFeed(Engine, proposer, `friendly_answer_${f.id}`, "Invitation à un amical annulée", `${f[other(f.proposer)].name} n'a pas répondu à temps.`);
      return;
    }
    if (f.status !== "accepted" || f.at > now) return;
    const homeLg = leagues.get(f.home.leagueId), awayLg = leagues.get(f.away.leagueId);
    const homeReal = teamOf(f.home), awayReal = teamOf(f.away);
    changed = true;
    // Club parti (montée/descente, reprise par un autre manager) : annulé.
    if (!homeReal || !awayReal || homeReal.name !== f.home.name || awayReal.name !== f.away.name) {
      f.status = "cancelled"; f.cancelReason = "Un des deux clubs a changé de championnat.";
      return;
    }
    if (Friendlies.officialDaysFor(Engine, homeLg, f.home.idx).has(f.day) || Friendlies.officialDaysFor(Engine, awayLg, f.away.idx).has(f.day)) {
      f.status = "cancelled";
      f.cancelReason = "Annulé : un match officiel a été programmé ce jour-là.";
      [homeReal, awayReal].forEach(t => Friendlies.pushFeed(Engine, t, `friendly_cancel_${f.id}`, "Match amical annulé", `L'amical du ${whenLabel(f)} est annulé : match officiel ce jour-là.`));
      return;
    }
    f.status = "played";
    const res = Friendlies.playFriendlyMatch(Engine, homeReal, awayReal,
      { lineup: (f.lineups || {}).home || null, orders: (f.orders || {}).home || null },
      { lineup: (f.lineups || {}).away || null, orders: (f.orders || {}).away || null }, f.at, now);
    f.result = res;
    Friendlies.friendlyResultFeeds(Engine, f.id, homeReal, awayReal, res, i => i.side === "home");
    events.push({ type: "world-friendly", id: f.id, home: f.home.name, away: f.away.name, scoreHome: res.scoreHome, scoreAway: res.scoreAway });
  });
  const before = store.list.length;
  store.list = store.list.filter(f => {
    if (isUpcoming(f)) return true;
    const keep = f.status === "played" ? Friendlies.FRIENDLY_PLAYED_RETENTION_MS : Friendlies.FRIENDLY_CLOSED_RETENTION_MS;
    return now - f.at < keep;
  });
  return changed || store.list.length !== before;
}

// Prochain coup d'envoi (échéance du monde, voir server/index.js).
function nextKickoff(store, now) {
  let next = null;
  ((store && store.list) || []).forEach(f => {
    if (f.status === "accepted" && f.at > now && (next == null || f.at < next)) next = f.at;
  });
  return next;
}

module.exports = {
  WORLD_FRIENDLY_GUEST_IDX, ID_PREFIX, isWorldId, emptyStore, friendlyDaysByIdx, dayConflict, availableDays,
  propose, respond, cancel, setLineup, projectForViewer, catchUp, nextKickoff, sideOf,
};
