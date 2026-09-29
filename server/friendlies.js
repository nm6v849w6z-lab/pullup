"use strict";

// ---------------------------------------------------------------------
// MATCHS AMICAUX — demande utilisateur (2026-09-27) : "on doit pouvoir les
// faire quand on veut sur les jours de repos. on doit pouvoir faire jouer
// les jeunes. quand quelqu'un propose un match amical, on devrait recevoir
// un petit message privé." Choix validés avec l'utilisateur :
// - adversaire humain (invitation à accepter) OU équipe CPU (accepte tout
//   de suite) ;
// - jour de repos ET heure au choix (heure de Paris, par demi-heure de
//   08h00 à 23h30) ;
// - "comme un vrai match" : fatigue, blessures et progression (minutes
//   d'entraînement fondamental) s'appliquent aux VRAIS joueurs ; mais rien
//   sur le classement, l'économie, les stats de saison (matchLog) ni le MVP ;
// - un amical par jour au plus pour chaque club.
//
// Jour de repos d'un club : jour civil (Paris) sans match officiel pour lui
// (championnat, play-offs s'il y est encore, coupe s'il y est encore, ligue
// privée en cours). Il faut que ce soit un jour de repos pour les DEUX clubs.
// Si un match officiel apparaît après coup ce jour-là (play-offs, tirage de
// coupe), l'amical est annulé au moment de le jouer.
//
// Simulation (sur le modèle de server/privateLeague.js, mais sur les VRAIS
// joueurs) : une "coquille" d'équipe (copie via serializeTeam/teamFromSave,
// pour les tactiques, le staff et les installations) dans laquelle on place
// les VRAIS objets joueurs retenus — effectif pro ET jeunes de l'académie
// (Team.youthPlayers) choisis dans la composition de l'amical. Tout ce que
// MatchEngine écrit sur les joueurs (blessures, minutes d'entraînement,
// forme) les touche donc réellement ; ce qu'il écrit sur l'équipe
// (alchimie, connaissance tactique) tombe avec la coquille. Les blessures
// sont reportées dans le carnet du vrai club (Team.recordInjury).
//
// Forme d'un amical (JSON brut dans League.friendlies) :
// { id, homeIdx, awayIdx, proposerIdx, at, day: "AAAA-MM-JJ", time: "HH:MM",
//   status: "pending"|"accepted"|"declined"|"cancelled"|"expired"|"played",
//   createdAt, respondedAt, cancelReason,
//   lineups: { [teamIdx]: { starters: [id x5], bench: [id x0..7] } },
//   result: { scoreHome, scoreAway, forfeit, quarterScores, boxScoreHome,
//     boxScoreAway, injuries: [{ teamIdx, playerId, name }] } | null }
// ---------------------------------------------------------------------

const Calendar = require("./calendar.js");

const FRIENDLY_TIMES = [];
for (let h = 8; h <= 23; h++) [0, 30].forEach(m => FRIENDLY_TIMES.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`));
const FRIENDLY_DEFAULT_TIME = "20:00";
const FRIENDLY_MIN_LEAD_MS = 30 * 60 * 1000; // au moins 30 min avant le coup d'envoi
// Invitation à un club humain (retour utilisateur 2026-09-27 : "il faut que
// l'invitation reste max 3 jours, et après elle s'annule", "si pas validé 1h
// avant le match, ça s'annule aussi").
const FRIENDLY_INVITE_TTL_MS = 3 * 24 * 3600 * 1000;
const FRIENDLY_ACCEPT_DEADLINE_MS = 60 * 60 * 1000;
// Heure limite pour accepter une invitation : 3 jours après l'envoi, et au
// plus tard 1 h avant le coup d'envoi.
function inviteDeadline(f) {
  return Math.min((f.createdAt || 0) + FRIENDLY_INVITE_TTL_MS, f.at - FRIENDLY_ACCEPT_DEADLINE_MS);
}
const FRIENDLY_HORIZON_DAYS = 21; // jusqu'à 3 semaines à l'avance
const FRIENDLY_MAX_UPCOMING = 5; // amicaux à venir (en attente + acceptés) par club
const FRIENDLY_STARTERS = 5;
const FRIENDLY_BENCH_MAX = 7; // 5 + 7 = 12 convoqués, comme un match officiel
const FRIENDLY_PLAYOFF_SLOTS = 6; // au plus 3 matchs de demie + 3 de finale
const FRIENDLY_PLAYED_RETENTION_MS = 60 * 24 * 3600 * 1000;
const FRIENDLY_CLOSED_RETENTION_MS = 7 * 24 * 3600 * 1000;
const FALLBACK_POSITIONS = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];

function fail(error) { return { ok: false, error }; }
function pad2(n) { return String(n).padStart(2, "0"); }

function dayKeyOf(ms) {
  const p = Calendar.parisLocalDateParts(ms);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function parseDayKey(raw) {
  const m = typeof raw === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function slotEpoch(dayParts, time) {
  const [hour, minute] = time.split(":").map(Number);
  return Calendar.parisEpochForLocalTime(dayParts.year, dayParts.month, dayParts.day, hour, minute);
}

// "mercredi 1 octobre" (heure de Paris).
function dayLabelFr(ms) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(new Date(ms));
}

function isUpcoming(f) { return f.status === "pending" || f.status === "accepted"; }
function involves(f, idx) { return f.homeIdx === idx || f.awayIdx === idx; }
function findById(league, id) { return (league.friendlies || []).find(f => f.id === id) || null; }

// --- Jours de repos ----------------------------------------------------------

function playoffAlive(po, idx) {
  const live = s => s && !s.resolved && (s.idxA === idx || s.idxB === idx);
  if (po.finalSeries) return live(po.finalSeries);
  if (live(po.series[0]) || live(po.series[1])) return true;
  return po.series.some(s => s && s.resolved && s.winner === idx); // qualifié, finale pas encore tirée
}

// Instants (epoch ms) de tous les matchs officiels encore à jouer pour ce
// club : championnat, play-offs (s'il y est encore), coupe (s'il y est
// encore, tous les tours restants), ligue privée en cours.
function officialMatchTimesFor(Engine, league, teamIdx) {
  const out = [];
  if (!league || typeof league.calendarStartAt !== "number") return out;
  if (!league.isRegularSeasonDone()) {
    for (let r = league.round; r < league.totalRounds; r++) {
      if (league.matchesForRound(r).some(m => m.home === teamIdx || m.away === teamIdx)) {
        out.push(Calendar.scheduledTimeForLeagueRound(league, r));
      }
    }
  }
  const po = league.playoffs;
  if (po && po.champion == null && playoffAlive(po, teamIdx)) {
    for (let k = 0; k < FRIENDLY_PLAYOFF_SLOTS; k++) out.push(Calendar.scheduledTimeForLeagueRound(league, po.round + k));
  }
  const cupRound = league.calendarDailyAnchored && league.pendingCupRound ? league.pendingCupRound() : null;
  if (cupRound) {
    const alive = cupRound.matches.some(m => (m.home === teamIdx || m.away === teamIdx) && !(m.resolved && m.winner !== teamIdx));
    if (alive) {
      const stages = Engine.CUP_STAGE_NAMES || [];
      const idx = stages.indexOf(cupRound.name);
      const remaining = idx >= 0 ? stages.length - idx : 1;
      for (let k = 0; k < remaining; k++) out.push(Calendar.scheduledTimeForLeagueCupRound(league, cupRound.dayIndex + k));
    }
  }
  // Coupe nationale (server/nationalCup.js, League.nationalCupAlive) :
  // tous les jeudis de Coupe restants tant que le club est en course.
  const nc = league.nationalCupAlive;
  if (nc && league.calendarDailyAnchored && (nc.teams || []).includes(teamIdx)) {
    for (let k = nc.nextRound; k < nc.totalRounds; k++) out.push(Calendar.scheduledTimeForLeagueCupRound(league, k));
  }
  (league.privateLeagues || []).forEach(lp => {
    if (lp.status !== "running") return;
    (lp.rounds || []).forEach(r => {
      if (r.matches.some(m => !m.played && (m.home === teamIdx || m.away === teamIdx))) out.push(r.dueAt);
    });
  });
  return out;
}

function officialDaysFor(Engine, league, teamIdx) {
  return new Set(officialMatchTimesFor(Engine, league, teamIdx).map(dayKeyOf));
}

function friendlyDaysFor(league, teamIdx, exceptId = null) {
  const days = new Set((league.friendlies || []).filter(f => isUpcoming(f) && involves(f, teamIdx) && f.id !== exceptId).map(f => f.day));
  // Amicaux contre un club d'un autre championnat (server/worldFriendlies.js),
  // posés par server/index.js avant les actions d'amicaux (jamais sauvegardé).
  const extra = league.worldFriendlyDays && league.worldFriendlyDays.get(teamIdx);
  if (extra) extra.forEach(d => days.add(d));
  return days;
}

// Pourquoi ce jour n'est PAS possible pour ces deux clubs (null = possible).
function dayConflict(Engine, league, myIdx, oppIdx, dayKey, exceptId = null) {
  if (officialDaysFor(Engine, league, myIdx).has(dayKey)) return "Votre club a un match officiel ce jour-là : les amicaux se jouent les jours de repos.";
  if (officialDaysFor(Engine, league, oppIdx).has(dayKey)) return "Votre adversaire a un match officiel ce jour-là.";
  if (friendlyDaysFor(league, myIdx, exceptId).has(dayKey)) return "Votre club a déjà un match amical ce jour-là (un par jour au plus).";
  if (friendlyDaysFor(league, oppIdx, exceptId).has(dayKey)) return "Votre adversaire a déjà un match amical ce jour-là.";
  return null;
}

// Jours de repos communs aux deux clubs sur les FRIENDLY_HORIZON_DAYS
// prochains jours, avec les heures encore possibles pour chacun.
function availableDays(Engine, league, myIdx, oppIdx, now) {
  const out = [];
  if (!league || typeof league.calendarStartAt !== "number") return out;
  const today = Calendar.parisLocalDateParts(now);
  const busy = new Set([
    ...officialDaysFor(Engine, league, myIdx), ...officialDaysFor(Engine, league, oppIdx),
    ...friendlyDaysFor(league, myIdx), ...friendlyDaysFor(league, oppIdx),
  ]);
  for (let d = 0; d <= FRIENDLY_HORIZON_DAYS; d++) {
    const parts = Calendar.addParisCalendarDays(today, d);
    const key = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
    if (busy.has(key)) continue;
    const times = FRIENDLY_TIMES.filter(t => slotEpoch(parts, t) >= now + FRIENDLY_MIN_LEAD_MS);
    if (!times.length) continue;
    out.push({ day: key, label: dayLabelFr(slotEpoch(parts, "12:00")), times });
  }
  return out;
}

// --- Composition -------------------------------------------------------------

// Pros + jeunes de l'académie : tous peuvent jouer un amical.
function friendlyPool(team) {
  return [...(team.players || []), ...(team.youthPlayers || [])];
}

function validateLineup(team, raw) {
  if (!raw || !Array.isArray(raw.starters) || !Array.isArray(raw.bench)) return { error: "Composition invalide." };
  const pool = new Map(friendlyPool(team).map(p => [String(p.id), p]));
  const starters = raw.starters.map(String);
  const bench = raw.bench.map(String);
  if (starters.length !== FRIENDLY_STARTERS) return { error: `Il faut exactement ${FRIENDLY_STARTERS} titulaires.` };
  if (bench.length > FRIENDLY_BENCH_MAX) return { error: `${FRIENDLY_BENCH_MAX} remplaçants au plus.` };
  const all = [...starters, ...bench];
  if (new Set(all).size !== all.length) return { error: "Un joueur ne peut figurer qu'une fois dans la composition." };
  if (all.some(id => !pool.has(id))) return { error: "Un joueur de la composition n'appartient pas à votre club." };
  return { value: { starters: starters.map(id => pool.get(id).id), bench: bench.map(id => pool.get(id).id) } };
}

// Coquille d'équipe (tactiques, staff, installations du vrai club) garnie
// des VRAIS joueurs retenus. Sans composition propre à l'amical : effectif
// et feuille de match actuels du club (ordres du moment).
function buildFriendlyTeam(Engine, real, lineup, at, orders = null) {
  const shell = Engine.teamFromSave(Engine.serializeTeam(real));
  shell.recordInjury = (entry) => { if (typeof real.recordInjury === "function") real.recordInjury(entry); };
  // Journal de l'entraînement collectif : tenu par le VRAI club seulement —
  // sur la coquille, les jours « Récupération » seraient crédités une
  // seconde fois aux vrais joueurs (voir Team.applyRestDayRecovery).
  shell.syncCollectiveTrainingLog = () => {};
  if (orders) return applyFriendlyOrders(Engine, shell, real, orders, at);
  if (!lineup) {
    shell.players = real.players.slice();
    return shell;
  }
  const POS = Engine.POSITIONS || FALLBACK_POSITIONS;
  const pool = friendlyPool(real);
  const byId = new Map(pool.map(p => [String(p.id), p]));
  const fit = p => p && !(Engine.isCurrentlyInjured && Engine.isCurrentlyInjured(p, at));
  const chosen = new Set();
  const take = ids => ids.map(id => byId.get(String(id))).filter(p => fit(p) && !chosen.has(p.id) && chosen.add(p.id));
  const starters = take(lineup.starters || []);
  const bench = take(lineup.bench || []);
  // Titulaire blessé/parti depuis : complété par le banc, puis par le reste
  // de l'effectif pro (jamais un forfait évitable).
  const byOverall = (a, b) => (b.overall ? b.overall() : 0) - (a.overall ? a.overall() : 0);
  bench.sort(byOverall);
  while (starters.length < FRIENDLY_STARTERS && bench.length) starters.push(bench.shift());
  const spare = real.players.filter(p => fit(p) && !chosen.has(p.id)).sort(byOverall);
  while (starters.length < FRIENDLY_STARTERS && spare.length) { const p = spare.shift(); chosen.add(p.id); starters.push(p); }

  const posMap = {};
  const rest = [];
  starters.forEach(p => { if (POS.includes(p.position) && !posMap[p.position]) posMap[p.position] = p.id; else rest.push(p); });
  POS.forEach(pos => { if (!posMap[pos] && rest.length) posMap[pos] = rest.shift().id; });
  const backupPositions = {};
  bench.forEach(p => { backupPositions[p.id] = [POS.includes(p.position) ? p.position : POS[0]]; });
  shell.players = [...starters, ...bench];
  shell.lineup = { starters: posMap, backupPositions, convoked: shell.players.map(p => p.id) };
  return shell;
}

// Ordres complets de l'amical (page Ordres) : tactiques + feuille de match
// posées sur la coquille ; joueurs = pros + jeunes cités dans la feuille
// (convocation, titulaires, remplaçants, temps de jeu). Un titulaire parti
// depuis est remplacé par le meilleur joueur disponible (pas de forfait
// évitable) ; un titulaire blessé est géré comme en match officiel.
function applyFriendlyOrders(Engine, shell, real, orders, at) {
  const POS = Engine.POSITIONS || FALLBACK_POSITIONS;
  const FIELDS = Engine.TACTIC_PRESET_FIELDS || ["offensivePriorities", "defense", "rhythm", "tacticalTier", "screenDefense", "helpDefense", "postDefense", "closeoutStyle", "offRebStyle", "endgameManagement"];
  FIELDS.forEach(k => { if (orders[k] !== undefined) shell[k] = Array.isArray(orders[k]) ? [...orders[k]] : orders[k]; });
  shell.watchAssignments = [];
  const pool = friendlyPool(real);
  const byId = new Map(pool.map(p => [String(p.id), p]));
  const src = orders.lineup || {};
  const lineup = {
    starters: {}, backupPositions: {},
    ...(src.minutes ? { minutes: JSON.parse(JSON.stringify(src.minutes)) } : {}),
  };
  const used = new Set();
  const addUsed = id => { if (byId.has(String(id))) used.add(String(id)); };
  POS.forEach(pos => { const id = src.starters && src.starters[pos]; lineup.starters[pos] = id != null && byId.has(String(id)) ? byId.get(String(id)).id : null; if (id != null) addUsed(id); });
  Object.entries(src.backupPositions || {}).forEach(([id, positions]) => { if (byId.has(String(id))) { lineup.backupPositions[byId.get(String(id)).id] = [...positions]; addUsed(id); } });
  if (lineup.minutes) Object.values(lineup.minutes).forEach(m => Object.keys(m).forEach(id => { if (!byId.has(String(id))) delete m[id]; else addUsed(id); }));
  if (Array.isArray(src.convoked)) { lineup.convoked = src.convoked.filter(id => byId.has(String(id))).map(id => byId.get(String(id)).id); src.convoked.forEach(addUsed); }
  // Effectif de la coquille : les pros (comme un match officiel, la
  // convocation décide qui joue) + les jeunes cités dans la feuille.
  const youthIds = new Set((real.youthPlayers || []).map(p => String(p.id)));
  shell.players = pool.filter(p => !youthIds.has(String(p.id)) || used.has(String(p.id)));
  const fit = p => !(Engine.isCurrentlyInjured && Engine.isCurrentlyInjured(p, at));
  const byOverall = (a, b) => (b.overall ? b.overall() : 0) - (a.overall ? a.overall() : 0);
  POS.forEach(pos => {
    if (lineup.starters[pos] != null) return;
    const taken = new Set(Object.values(lineup.starters).filter(x => x != null).map(String));
    const cand = shell.players.filter(p => fit(p) && !taken.has(String(p.id))).sort((a, b) => ((b.position === pos) - (a.position === pos)) || byOverall(a, b))[0];
    if (cand) { lineup.starters[pos] = cand.id; if (lineup.convoked && !lineup.convoked.includes(cand.id)) lineup.convoked.push(cand.id); }
  });
  // Un titulaire est toujours convoqué (quitte à retirer le dernier convoqué
  // sans rôle, puis le dernier remplaçant, pour rester à 12).
  if (lineup.convoked) {
    const starterIds = Object.values(lineup.starters).filter(x => x != null);
    starterIds.forEach(id => { if (!lineup.convoked.includes(id)) lineup.convoked.push(id); });
    const isStarter = id => starterIds.includes(id);
    const isBackup = id => (lineup.backupPositions[id] || []).length > 0;
    while (lineup.convoked.length > 12) {
      let k = -1;
      for (let i = lineup.convoked.length - 1; i >= 0 && k < 0; i--) if (!isStarter(lineup.convoked[i]) && !isBackup(lineup.convoked[i])) k = i;
      for (let i = lineup.convoked.length - 1; i >= 0 && k < 0; i--) if (!isStarter(lineup.convoked[i])) k = i;
      if (k < 0) break;
      const [gone] = lineup.convoked.splice(k, 1);
      delete lineup.backupPositions[gone];
    }
  }
  shell.lineup = lineup;
  return shell;
}

function compactBoxScore(rows, youthIds) {
  return (rows || []).map(r => ({
    id: r.id, name: r.name, position: r.position, min: r.min,
    pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, tov: r.tov, pf: r.pf,
    fgm2: r.fgm2, fga2: r.fga2, fgm3: r.fgm3, fga3: r.fga3, ftm: r.ftm, fta: r.fta,
    plusMinus: r.plusMinus || 0,
    youth: youthIds.has(r.id) || undefined,
  }));
}

// --- Fil d'actualité ---------------------------------------------------------

function pushFeed(Engine, team, key, title, text) {
  if (!team || !team.isHuman || !team.feed || typeof Engine.pushEntry !== "function") return;
  Engine.pushEntry(team.feed, {
    key, category: "club", week: team.week, title, text,
    action: { label: "Matchs amicaux", href: "/amicaux" },
  });
}

function whenLabel(f) {
  return `${dayLabelFr(f.at)} à ${f.time.replace(":", "h")}`;
}

// --- Actions -----------------------------------------------------------------

function checkLeague(league) {
  if (!league || typeof league.calendarStartAt !== "number") return "Les matchs amicaux ne sont pas disponibles dans cette partie.";
  return null;
}

function checkTeam(league, idx) {
  return Number.isInteger(idx) && idx >= 0 && idx < league.teams.length && league.teams[idx] ? league.teams[idx] : null;
}

// POST /api/friendly/propose  body: { opponent, day: "AAAA-MM-JJ", time: "HH:MM", venue: "home"|"away" }
function proposeFriendly(Engine, team, teamIndex, league, body, now) {
  const err = checkLeague(league);
  if (err) return fail(err);
  if (!team || !team.isHuman) return fail("Seul un club géré par un manager peut proposer un amical.");
  const oppIdx = Number(body && body.opponent);
  const opp = checkTeam(league, oppIdx);
  if (!opp) return fail("Adversaire introuvable.");
  if (oppIdx === teamIndex) return fail("Vous ne pouvez pas jouer contre vous-même.");
  const dayParts = parseDayKey(body && body.day);
  if (!dayParts) return fail("Jour invalide.");
  const time = body && body.time ? String(body.time) : FRIENDLY_DEFAULT_TIME;
  if (!FRIENDLY_TIMES.includes(time)) return fail("Heure invalide (par demi-heure, de 08h00 à 23h30).");
  const at = slotEpoch(dayParts, time);
  const day = dayKeyOf(at);
  if (at < now + FRIENDLY_MIN_LEAD_MS) return fail("Le coup d'envoi doit être dans au moins 30 minutes.");
  if (at > now + (FRIENDLY_HORIZON_DAYS + 1) * Calendar.DAY_MS) return fail(`Un amical se programme au plus ${FRIENDLY_HORIZON_DAYS} jours à l'avance.`);
  const conflict = dayConflict(Engine, league, teamIndex, oppIdx, day);
  if (conflict) return fail(conflict);
  const upcoming = (league.friendlies || []).filter(f => isUpcoming(f) && involves(f, teamIndex)).length;
  if (upcoming >= FRIENDLY_MAX_UPCOMING) return fail(`${FRIENDLY_MAX_UPCOMING} matchs amicaux à venir au plus.`);
  if (opp.isHuman && at - FRIENDLY_ACCEPT_DEADLINE_MS <= now) return fail("Contre un manager, le match doit être dans plus d'une heure : il doit accepter au plus tard 1 h avant.");
  const venue = body && body.venue === "away" ? "away" : "home";

  if (!Array.isArray(league.friendlies)) league.friendlies = [];
  const humanOpp = !!opp.isHuman;
  const f = {
    id: Engine.randomHexToken(6),
    homeIdx: venue === "home" ? teamIndex : oppIdx,
    awayIdx: venue === "home" ? oppIdx : teamIndex,
    proposerIdx: teamIndex,
    at, day, time,
    status: humanOpp ? "pending" : "accepted",
    createdAt: now, respondedAt: humanOpp ? null : now, cancelReason: null,
    lineups: {}, result: null,
  };
  league.friendlies.push(f);
  const out = { ok: true, friendlyId: f.id, status: f.status };
  if (humanOpp) {
    const where = venue === "home" ? `chez ${team.name}` : `chez vous (${opp.name})`;
    out.notify = {
      to: oppIdx,
      text: `🏀 Invitation à un match amical : ${team.name} vous propose un amical le ${whenLabel(f)}, ${where}. ` +
        `Acceptez ou refusez depuis l'onglet Matchs amicaux.`,
    };
    pushFeed(Engine, opp, `friendly_invite_${f.id}`, `Invitation à un match amical de ${team.name}`,
      `${team.name} vous propose un amical le ${whenLabel(f)}. Répondez depuis l'onglet Matchs amicaux.`);
  }
  return out;
}

// POST /api/friendly/respond  body: { id, accept: true|false }
function respondFriendly(Engine, team, teamIndex, league, body, now) {
  const f = findById(league, body && body.id);
  if (!f || !involves(f, teamIndex)) return fail("Match amical introuvable.");
  if (f.proposerIdx === teamIndex) return fail("C'est à votre adversaire de répondre à cette invitation.");
  if (f.status !== "pending") return fail("Cette invitation n'est plus en attente.");
  if (f.at <= now) return fail("L'heure de ce match amical est passée.");
  if (body && body.accept && now >= inviteDeadline(f)) return fail("Trop tard pour accepter : l'invitation a expiré.");
  const proposer = league.teams[f.proposerIdx];
  if (body && body.accept) {
    const conflict = dayConflict(Engine, league, teamIndex, f.proposerIdx, f.day, f.id);
    if (conflict) return fail(conflict);
    f.status = "accepted";
    f.respondedAt = now;
    pushFeed(Engine, proposer, `friendly_answer_${f.id}`, `${team.name} accepte votre match amical`,
      `Rendez-vous le ${whenLabel(f)}.`);
  } else {
    f.status = "declined";
    f.respondedAt = now;
    pushFeed(Engine, proposer, `friendly_answer_${f.id}`, `${team.name} décline votre match amical`,
      `L'amical du ${whenLabel(f)} n'aura pas lieu.`);
  }
  return { ok: true, friendlyId: f.id, status: f.status };
}

// POST /api/friendly/cancel  body: { id }
// Le club qui a proposé retire son invitation ; une fois accepté, l'un ou
// l'autre peut annuler tant que le match n'a pas commencé.
function cancelFriendly(Engine, team, teamIndex, league, body, now) {
  const f = findById(league, body && body.id);
  if (!f || !involves(f, teamIndex)) return fail("Match amical introuvable.");
  if (!isUpcoming(f)) return fail("Ce match amical n'est plus à venir.");
  if (f.status === "pending" && f.proposerIdx !== teamIndex) return fail("Pour décliner une invitation, utilisez « Refuser ».");
  if (f.at <= now) return fail("Ce match amical a déjà commencé.");
  f.status = "cancelled";
  f.cancelReason = `Annulé par ${team.name}.`;
  f.respondedAt = f.respondedAt || now;
  const otherIdx = f.homeIdx === teamIndex ? f.awayIdx : f.homeIdx;
  pushFeed(Engine, league.teams[otherIdx], `friendly_cancel_${f.id}`, `${team.name} annule le match amical`,
    `L'amical du ${whenLabel(f)} n'aura pas lieu.`);
  return { ok: true, friendlyId: f.id, status: f.status };
}

// POST /api/friendly/lineup  body: { id, orders } (ordres complets, page
// Ordres — retour utilisateur 2026-09-27 : "pour le match amical, il faut
// pouvoir avoir un vrai onglet ordres") | { id, starters, bench } (ancienne
// composition simple) | { id, reset: true } (revenir aux ordres du club).
function setFriendlyLineup(Engine, team, teamIndex, league, body, now) {
  const f = findById(league, body && body.id);
  if (!f || !involves(f, teamIndex)) return fail("Match amical introuvable.");
  if (!isUpcoming(f)) return fail("Ce match amical n'est plus à venir.");
  if (f.at <= now) return fail("Ce match amical a déjà commencé.");
  if (!f.lineups || typeof f.lineups !== "object") f.lineups = {};
  if (!f.orders || typeof f.orders !== "object") f.orders = {};
  if (body && body.reset) {
    delete f.lineups[teamIndex];
    delete f.orders[teamIndex];
    return { ok: true, friendlyId: f.id };
  }
  if (body && body.orders) {
    const Actions = require("./actions.js");
    const v = Actions.validateOrdersSnapshot({ players: friendlyPool(team) }, body.orders);
    if (!v.ok) return fail(v.error);
    f.orders[teamIndex] = v.value;
    delete f.lineups[teamIndex];
    return { ok: true, friendlyId: f.id };
  }
  const v = validateLineup(team, body);
  if (v.error) return fail(v.error);
  f.lineups[teamIndex] = v.value;
  return { ok: true, friendlyId: f.id };
}

// --- Simulation --------------------------------------------------------------

function simulateFriendly(Engine, league, f, now) {
  const at = f.at;
  const homeReal = league.teams[f.homeIdx];
  const awayReal = league.teams[f.awayIdx];
  if (!homeReal || !awayReal) { f.status = "cancelled"; f.cancelReason = "Un des deux clubs n'existe plus."; return; }
  // Un match officiel a pu apparaître ce jour-là depuis la programmation
  // (play-offs, tour de coupe) : l'officiel passe avant.
  if (officialDaysFor(Engine, league, f.homeIdx).has(f.day) || officialDaysFor(Engine, league, f.awayIdx).has(f.day)) {
    f.status = "cancelled";
    f.cancelReason = "Annulé : un match officiel a été programmé ce jour-là.";
    [homeReal, awayReal].forEach(t => pushFeed(Engine, t, `friendly_cancel_${f.id}`, "Match amical annulé", `L'amical du ${whenLabel(f)} est annulé : match officiel ce jour-là.`));
    return;
  }
  const lineups = f.lineups || {};
  const orders = f.orders || {};
  f.status = "played";
  const res = playFriendlyMatch(Engine, homeReal, awayReal,
    { lineup: lineups[f.homeIdx] || null, orders: orders[f.homeIdx] || null },
    { lineup: lineups[f.awayIdx] || null, orders: orders[f.awayIdx] || null }, at, now);
  res.injuries = res.injuries.map(i => ({ teamIdx: i.side === "home" ? f.homeIdx : f.awayIdx, playerId: i.playerId, name: i.name }));
  f.result = res;
  // Résultat annoncé plus tard (voir catchUpFriendlies), à revealAt.
  f.announced = false;
}

// Match amical entre deux VRAIS clubs (même championnat ou non, voir
// server/worldFriendlies.js) : coquilles garnies des vrais joueurs, fatigue,
// blessures, progression, jour d'amical marqué. `setup` = { lineup, orders }
// propres à l'amical (ou null : ordres du club). Renvoie le résultat
// (injuries[].side = "home"|"away").
function playFriendlyMatch(Engine, homeReal, awayReal, homeSetup, awaySetup, at, now) {
  const home = buildFriendlyTeam(Engine, homeReal, homeSetup.lineup, at, homeSetup.orders);
  const away = buildFriendlyTeam(Engine, awayReal, awaySetup.lineup, at, awaySetup.orders);
  const youthIds = new Set([...(homeReal.youthPlayers || []), ...(awayReal.youthPlayers || [])].map(p => p.id));
  const players = [...home.players, ...away.players];
  const injuredBefore = new Map(players.map(p => [p.id, p.injuryUntil]));
  // Huis clos, pas de direct (retour utilisateur 2026-09-28 : "tu devrais
  // mettre le meme temps que pour les autres matchs pour dévoiler le score
  // de l'amical, mais pas besoin de mettre de live, le huis clos est bien") :
  // joué au coup d'envoi, résultat caché aux managers jusqu'à revealAt (la
  // durée d'un match officiel diffusé), puis annoncé dans le fil — voir
  // isRevealed, hideUnrevealedFriendly, catchUpFriendlies et
  // server/worldFriendlies.js:catchUp.
  const res = { scoreHome: 0, scoreAway: 0, forfeit: null, quarterScores: null, boxScoreHome: null, boxScoreAway: null, injuries: [], playedAt: now, revealAt: at + Calendar.MATCH_BROADCAST_DURATION_MS };
  const homeOk = home.hasValidLineup();
  const awayOk = away.hasValidLineup();
  if (homeOk && awayOk) {
    const tacticsUsed = { home: Engine.tacticsSnapshotFor(home), away: Engine.tacticsSnapshotFor(away) };
    const result = new Engine.MatchEngine(home, away, { homeAdvantage: true }).simulate(at);
    res.scoreHome = result.finalScore.A;
    res.scoreAway = result.finalScore.B;
    res.quarterScores = { home: result.quarterScores.A, away: result.quarterScores.B };
    res.seed = result.seed;
    res.boxScoreHome = compactBoxScore(result.boxScoreA, youthIds);
    res.boxScoreAway = compactBoxScore(result.boxScoreB, youthIds);
    // Fatigue (forme physique) exactement comme un match officiel, puis
    // retrait de l'entrée "friendly" du journal : un amical ne compte ni
    // dans les stats de saison, ni dans les records, ni pour le MVP.
    Engine.recordMatchStatsForTeam(home, -1, "friendly", at, null, tacticsUsed.home);
    Engine.recordMatchStatsForTeam(away, -1, "friendly", at, null, tacticsUsed.away);
    players.forEach(p => { if (Array.isArray(p.matchLog)) p.matchLog = p.matchLog.filter(e => e.competition !== "friendly"); });
    // Retour utilisateur (2026-09-27) : un amical "empêche de faire
    // l'entraînement collectif tactique ou de récupération" ce jour-là (jour
    // marqué) et fait gagner un peu de connaissance tactique selon les
    // minutes des joueurs habituels (rôles) — sur les VRAIS clubs, la
    // coquille ci-dessus est jetée.
    const friendlyDay = Engine.parisCalendarDayIndex(at);
    [[homeReal, home], [awayReal, away]].forEach(([t, shell]) => {
      if (typeof t.markFriendlyDay === "function") t.markFriendlyDay(friendlyDay);
      const secs = {};
      shell.players.forEach(p => { if (p.secondsPlayed > 0) secs[p.id] = p.secondsPlayed; });
      if (typeof t.gainTacticalKnowledgeFromFriendly === "function") t.gainTacticalKnowledgeFromFriendly(secs);
    });
    players.forEach(p => {
      if (p.injuryUntil && p.injuryUntil !== injuredBefore.get(p.id)) {
        res.injuries.push({ side: home.players.includes(p) ? "home" : "away", playerId: p.id, name: p.name });
      }
    });
  } else if (!homeOk && !awayOk) { res.forfeit = "both"; }
  else if (!homeOk) { res.forfeit = "home"; res.scoreAway = Engine.FORFEIT_SCORE; }
  else { res.forfeit = "away"; res.scoreHome = Engine.FORFEIT_SCORE; }
  return res;
}

// Fil d'actualité des deux clubs après un amical. `isHomeInjury(i)` : la
// blessure i concerne-t-elle le club qui reçoit ?
function friendlyResultFeeds(Engine, id, homeReal, awayReal, res, isHomeInjury) {
  [[homeReal, awayReal, res.scoreHome, res.scoreAway, true], [awayReal, homeReal, res.scoreAway, res.scoreHome, false]].forEach(([t, opp, pf, pa, isHome]) => {
    const hurt = res.injuries.filter(i => isHomeInjury(i) === isHome).map(i => i.name);
    const text = res.forfeit ? "Match décidé par forfait (cinq incomplet)."
      : `Match amical : aucun effet sur le classement ni les finances.${hurt.length ? ` Blessé${hurt.length > 1 ? "s" : ""} : ${hurt.join(", ")}.` : ""}`;
    pushFeed(Engine, t, `friendly_result_${id}_${isHome ? "h" : "a"}`, `Amical : ${pf > pa ? "victoire" : "défaite"} ${pf}-${pa} contre ${opp.name}`, text);
  });
}

// Appelée à chaque tick serveur (voir server/index.js) : joue les amicaux
// acceptés dont l'heure est passée, périme les invitations restées sans
// réponse, purge l'historique ancien. Renvoie les amicaux joués.
function catchUpFriendlies(Engine, league, now) {
  const played = [];
  if (!league || !Array.isArray(league.friendlies) || !league.friendlies.length) return played;
  league.friendlies.slice().sort((a, b) => a.at - b.at).forEach(f => {
    // Invitation sans réponse : annulée 3 jours après l'envoi, ou 1 h avant
    // le coup d'envoi (voir inviteDeadline).
    if (f.status === "pending" && now >= inviteDeadline(f)) {
      f.status = "expired";
      const oppName = (league.teams[f.proposerIdx === f.homeIdx ? f.awayIdx : f.homeIdx] || {}).name || "Votre adversaire";
      const why = (f.createdAt || 0) + FRIENDLY_INVITE_TTL_MS <= f.at - FRIENDLY_ACCEPT_DEADLINE_MS
        ? "l'invitation est restée 3 jours sans réponse" : "elle n'a pas été acceptée 1 h avant le match";
      pushFeed(Engine, league.teams[f.proposerIdx], `friendly_answer_${f.id}`, "Invitation à un amical annulée",
        `${oppName} n'a pas répondu : ${why}.`);
      return;
    }
    if (f.at > now) return;
    if (f.status === "accepted") {
      simulateFriendly(Engine, league, f, now);
      played.push(f.id);
    }
  });
  // Huis clos : résultats annoncés dans le fil à revealAt (voir
  // playFriendlyMatch). Un amical joué sans ce champ a déjà été annoncé.
  league.friendlies.forEach(f => {
    if (f.status !== "played" || f.announced !== false || !isRevealed(f, now)) return;
    f.announced = true;
    const homeReal = league.teams[f.homeIdx], awayReal = league.teams[f.awayIdx];
    if (homeReal && awayReal && f.result) friendlyResultFeeds(Engine, f.id, homeReal, awayReal, f.result, i => i.teamIdx === f.homeIdx);
  });
  league.friendlies = league.friendlies.filter(f => {
    if (isUpcoming(f)) return true;
    const keep = f.status === "played" ? FRIENDLY_PLAYED_RETENTION_MS : FRIENDLY_CLOSED_RETENTION_MS;
    return now - f.at < keep;
  });
  return played;
}

// --- Lecture -----------------------------------------------------------------

// Score dévoilé ? (huis clos : pas avant revealAt, voir playFriendlyMatch).
function isRevealed(f, now) {
  return !(f && f.result && typeof f.result.revealAt === "number" && now < f.result.revealAt);
}
// Vue manager d'un amical joué mais pas encore dévoilé : un amical accepté
// dont l'heure est passée, sans résultat (« Résultat à venir »).
function hideUnrevealedFriendly(view, f, now) {
  if (f.status !== "played" || isRevealed(f, now)) return view;
  return { ...view, status: "accepted", result: null, revealAt: f.result.revealAt };
}

// Un manager ne voit que SES amicaux, et que SA composition (celle de
// l'adversaire reste secrète jusqu'au match — la feuille de match suffit).
function sanitizeFriendliesForViewer(list, viewerIdx, now = Date.now()) {
  return (list || []).filter(f => involves(f, viewerIdx)).map(f => {
    const lineups = {};
    if (f.lineups && f.lineups[viewerIdx]) lineups[viewerIdx] = f.lineups[viewerIdx];
    const orders = {};
    if (f.orders && f.orders[viewerIdx]) orders[viewerIdx] = f.orders[viewerIdx];
    return hideUnrevealedFriendly({ ...f, lineups, orders }, f, now);
  });
}

module.exports = {
  FRIENDLY_TIMES, FRIENDLY_DEFAULT_TIME, FRIENDLY_MIN_LEAD_MS, FRIENDLY_INVITE_TTL_MS, FRIENDLY_ACCEPT_DEADLINE_MS, inviteDeadline, FRIENDLY_HORIZON_DAYS, FRIENDLY_MAX_UPCOMING,
  FRIENDLY_STARTERS, FRIENDLY_BENCH_MAX,
  dayKeyOf, officialMatchTimesFor, officialDaysFor, friendlyDaysFor, availableDays, dayConflict, parseDayKey, slotEpoch, dayLabelFr, whenLabel, pushFeed,
  inviteDeadlineOf: inviteDeadline, validateLineup, friendlyPool, playFriendlyMatch, friendlyResultFeeds,
  FRIENDLY_PLAYED_RETENTION_MS, FRIENDLY_CLOSED_RETENTION_MS,
  proposeFriendly, respondFriendly, cancelFriendly, setFriendlyLineup,
  buildFriendlyTeam, simulateFriendly, catchUpFriendlies, sanitizeFriendliesForViewer, isRevealed, hideUnrevealedFriendly,
};
