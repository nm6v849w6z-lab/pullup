"use strict";
// =====================================================================
// MATCHS AMICAUX INTERNATIONAUX (retour utilisateur 2026-10-06) : le
// sélectionneur consulte les demandes reçues, envoie une demande à une
// autre sélection (même catégorie), choisit une date compatible et le
// terrain (domicile / extérieur) ; la sélection invitée accepte ou refuse ;
// une demande peut être annulée. Réservé au sélectionneur (droit
// « friendlies », voir nationalCoach.PERMS) : jamais aux adjoints ni aux
// recruteurs.
//
// Calendrier (les matchs de club ne bougent JAMAIS) : un amical se joue
// UNIQUEMENT pendant une fenêtre internationale (retour utilisateur
// 2026-10-06 : « les jours ne sont pas libres, c'est uniquement sur les
// fenêtres internationales »), le dimanche à 20h comme les matchs de
// qualification, et seulement par deux sélections qui n'ont pas de match
// ce jour-là (exemptées, ou sans qualifications cette saison) :
//   - jamais à moins de 3 jours d'un autre match international de l'une
//     des deux sélections (fatigue : récupération normale du moteur) ;
//   - d'une date trop proche : il faut pouvoir répondre avant le gel des
//     convocations (3 jours avant le match).
// Une fois acceptée, la rencontre a son rassemblement (convocations
// figées 3 jours avant, voir nationalCoach.gatheringsOf, gid
// `s<saison>x<id>`) et se joue comme un match de qualification
// (nationalMatches.playMatch : vrais joueurs, fatigue normale, retiré des
// stats de club, blessures reportées au club).
//
// Sélection sans sélectionneur (intérim) : elle accepte d'office, comme un
// club CPU pour les amicaux de club.
//
// Stockage : store.intlFriendlies = [{ id, season, cat, home, away, from,
// to, at, status: "pending" | "accepted" | "refused" | "cancelled" |
// "played", createdAt, respondedAt, cancelledBy, reason, auto, gid, label,
// scoreHome, scoreAway, quarterScores, boxHome, boxAway, forfeit,
// injuries }] — 3 saisons gardées. États vus par une sélection : « sent »
// / « received » (en attente), « scheduled » (acceptée, à jouer),
// « played », « refused », « cancelled ».
// =====================================================================
const DAY = 24 * 3600 * 1000;
const LIMITS = { perSeason: 3, minGapDays: 3, pendingPerPair: 1, closedKeepDays: 14 };
const LABEL = "Match amical international";

function NT() { return require("./nationalTeams.js"); }
function NC() { return require("./nationalCoach.js"); }
function NM() { return require("./nationalMatches.js"); }
function fail(error, status = 400) { return { ok: false, status, error }; }
function listOf(store) {
  if (!Array.isArray(store.intlFriendlies)) store.intlFriendlies = [];
  return store.intlFriendlies;
}
function involves(f, teamId) { return f.home === teamId || f.away === teamId; }
function isLive(f) { return f.status === "pending" || f.status === "accepted"; }
function freezeMs() { return NC().LIMITS.freezeDays * DAY; }

// Instants des matchs internationaux d'une sélection pendant une saison
// (qualifications, phases finales, amicaux en attente / acceptés / joués).
function matchTimesOf(store, teamId, season, exceptId) {
  const team = store.teams[teamId];
  if (!team) return [];
  const out = [];
  const comp = NM().compOf(store, season, team.cat);
  if (comp) comp.matches.forEach(m => { if (m.home === teamId || m.away === teamId) out.push(m.at); });
  const fin = NM().finalsOf(store, season, team.cat);
  if (fin) fin.tournaments.forEach(t => { if (t.teams.includes(teamId)) t.matches.forEach(m => { if (m.home === teamId || m.away === teamId) out.push(m.at); }); });
  listOf(store).forEach(f => { if (f.id !== exceptId && f.season === season && involves(f, teamId) && (isLive(f) || f.status === "played")) out.push(f.at); });
  return out;
}
// Dates possibles d'une saison : le dimanche (20h) de chaque fenêtre
// internationale, avant les exclusions propres à chaque sélection :
// { at, week, window }.
function candidateDays(store, season, calendarStartAt) {
  if (typeof calendarStartAt !== "number") return [];
  const cfg = NT().configOf(store);
  return (cfg.windowWeeks || []).map((week, i) => ({ at: NT().seasonDayAt(cfg, calendarStartAt, 7 * (week - 1) + 5), week, window: i + 1 }));
}
// Raison pour laquelle `teamId` ne peut pas jouer à `at` (ou null).
function busyReason(store, teamId, season, at, exceptId) {
  const gap = LIMITS.minGapDays * DAY;
  if (matchTimesOf(store, teamId, season, exceptId).some(t => Math.abs(t - at) < gap)) return "busy";
  return null;
}
// Dates proposées à une sélection : chaque dimanche libre pour elle, avec la
// liste des sélections (même catégorie) déjà prises ce jour-là.
function datesFor(store, team, season, calendarStartAt, now, exceptId) {
  const others = Object.values(store.teams).filter(t => t.cat === team.cat && t.id !== team.id);
  const out = [];
  for (const d of candidateDays(store, season, calendarStartAt)) {
    // Assez tôt pour répondre avant le gel des convocations.
    if (now >= d.at - freezeMs() - DAY) continue;
    if (busyReason(store, team.id, season, d.at, exceptId)) continue;
    const busy = others.filter(t => busyReason(store, t.id, season, d.at, exceptId)).map(t => t.id);
    out.push({ at: d.at, week: d.week, window: d.window, busy });
  }
  return out;
}
// Vérifie qu'un amical a/b à `at` respecte le calendrier (null si oui).
function slotError(store, a, b, season, at, calendarStartAt, now, exceptId) {
  const d = candidateDays(store, season, calendarStartAt).find(x => x.at === at);
  if (!d) return "Date impossible : les amicaux internationaux se jouent uniquement pendant les fenêtres internationales (dimanche à 20h).";
  if (now >= at - freezeMs() - DAY) return "Date trop proche : la demande doit pouvoir être acceptée avant le gel des convocations (3 jours avant le match).";
  if (busyReason(store, a, season, at, exceptId)) return `${NT().teamLabel(a)} joue déjà un match international à cette période.`;
  if (busyReason(store, b, season, at, exceptId)) return `${NT().teamLabel(b)} joue déjà un match international à cette période.`;
  return null;
}
function seasonCount(store, teamId, season, exceptId) {
  return listOf(store).filter(f => f.id !== exceptId && f.season === season && involves(f, teamId) && (isLive(f) || f.status === "played")).length;
}
function whenText(at) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(at));
  } catch (e) { return new Date(at).toISOString(); }
}
function feedTo(store, teamId, entry) {
  const m = NT().activeMandate(store, teamId);
  if (m) NC().coachFeed(m, { kind: "friendly", ...entry });
}

// --- Actions du sélectionneur (routes) -----------------------------------
function request(store, me, body, now, ctx) {
  const m = NC().coachMandate(store, me, body && body.teamId, "friendlies");
  if (!m) return fail("Réservé au sélectionneur de cette sélection.", 403);
  const cfg = NT().configOf(store);
  if (!cfg.matchesLive) return fail("Les matchs internationaux ne sont pas encore en service.");
  const team = store.teams[body.teamId];
  const opp = store.teams[body.opponent];
  if (!opp || opp.id === team.id) return fail("Sélection adverse inconnue.");
  if (opp.cat !== team.cat) return fail("Un amical se joue entre sélections de la même catégorie (A contre A, U21 contre U21).");
  const at = Number(body.at);
  if (!Number.isFinite(at)) return fail("Choisissez une date.");
  const season = ctx.season;
  if (listOf(store).some(f => f.status === "pending" && involves(f, team.id) && involves(f, opp.id))) return fail("Une demande est déjà en attente avec cette sélection.");
  if (seasonCount(store, team.id, season) >= LIMITS.perSeason) return fail(`${LIMITS.perSeason} matchs amicaux par saison au maximum.`);
  if (seasonCount(store, opp.id, season) >= LIMITS.perSeason) return fail(`${NT().teamLabel(opp.id)} a déjà ${LIMITS.perSeason} matchs amicaux cette saison.`);
  const err = slotError(store, team.id, opp.id, season, at, ctx.calendarStartAt, now);
  if (err) return fail(err);
  const venue = body.venue === "away" ? "away" : "home";
  const f = {
    id: `f${(store.seq = (store.seq || 1) + 1)}`, season, cat: team.cat,
    home: venue === "home" ? team.id : opp.id, away: venue === "home" ? opp.id : team.id,
    from: team.id, to: opp.id, at, status: "pending", createdAt: now, respondedAt: null,
  };
  listOf(store).push(f);
  const where = venue === "home" ? `à domicile (${NT().teamLabel(team.id)} reçoit)` : `à l'extérieur (chez ${NT().teamLabel(opp.id)})`;
  if (!NT().activeMandate(store, opp.id)) {
    // Intérim : accepte d'office.
    f.status = "accepted"; f.respondedAt = now; f.auto = true;
    NC().coachFeed(m, { key: `fr_auto_${f.id}`, kind: "friendly", at: now, title: `Amical programmé contre ${NT().teamLabel(opp.id)}`, text: `Sélection sans sélectionneur : l'intérim accepte. ${whenText(at)}, ${where}.` });
  } else {
    feedTo(store, opp.id, { key: `fr_req_${f.id}`, at: now, title: `Demande de match amical : ${NT().teamLabel(team.id)}`, text: `${whenText(at)}, ${venue === "home" ? `chez ${NT().teamLabel(team.id)}` : "à domicile"}. Répondez depuis la rubrique Amicaux.` });
  }
  return { ok: true, friendly: f };
}
function respond(store, me, body, now, ctx) {
  const f = listOf(store).find(x => x.id === (body && body.id));
  if (!f) return fail("Demande introuvable.", 404);
  const m = NC().coachMandate(store, me, f.to, "friendlies");
  if (!m) return fail("Réservé au sélectionneur de la sélection invitée.", 403);
  if (f.status !== "pending") return fail("Cette demande n'est plus en attente.");
  if (!body.accept) {
    f.status = "refused"; f.respondedAt = now;
    feedTo(store, f.from, { key: `fr_no_${f.id}`, at: now, title: `${NT().teamLabel(f.to)} refuse votre match amical`, text: `Date proposée : ${whenText(f.at)}.` });
    return { ok: true, friendly: f };
  }
  if (now >= f.at - freezeMs()) return fail("Trop tard : les convocations de cette date sont figées.");
  const err = slotError(store, f.from, f.to, f.season, f.at, ctx.calendarStartAt, now - DAY, f.id);
  if (err) return fail(err);
  f.status = "accepted"; f.respondedAt = now;
  feedTo(store, f.from, { key: `fr_ok_${f.id}`, at: now, title: `${NT().teamLabel(f.to)} accepte votre match amical`, text: `${whenText(f.at)}. Les convocations se font dans la rubrique Convoqués.` });
  // Autres demandes en attente devenues impossibles (même période).
  listOf(store).forEach(o => {
    if (o === f || o.status !== "pending") return;
    if (![f.home, f.away].some(id => involves(o, id)) || Math.abs(o.at - f.at) >= LIMITS.minGapDays * DAY) return;
    o.status = "cancelled"; o.respondedAt = now; o.reason = "conflict";
    [o.from, o.to].forEach(id => feedTo(store, id, { key: `fr_conflict_${o.id}_${id}`, at: now, title: `Amical annulé : ${NT().teamLabel(o.from)} – ${NT().teamLabel(o.to)}`, text: "Date déjà prise par un autre match amical." }));
  });
  return { ok: true, friendly: f };
}
function cancel(store, me, body, now) {
  const f = listOf(store).find(x => x.id === (body && body.id));
  if (!f) return fail("Demande introuvable.", 404);
  const side = [f.from, f.to].find(id => NC().coachMandate(store, me, id, "friendlies"));
  if (!side) return fail("Réservé aux sélectionneurs des deux sélections.", 403);
  if (f.status === "pending" && side !== f.from) return fail("Demande reçue : refusez-la plutôt.");
  if (f.status !== "pending" && f.status !== "accepted") return fail("Ce match ne peut plus être annulé.");
  if (f.status === "accepted" && now >= f.at - freezeMs()) return fail("Convocations figées : le match ne peut plus être annulé.");
  f.status = "cancelled"; f.respondedAt = now; f.cancelledBy = side; f.reason = "cancelled";
  const other = side === f.from ? f.to : f.from;
  feedTo(store, other, { key: `fr_cancel_${f.id}`, at: now, title: `Amical annulé par ${NT().teamLabel(side)}`, text: `Match prévu ${whenText(f.at)}.` });
  return { ok: true, friendly: f };
}

// --- Passage du rattrapage du monde ---------------------------------------
function step(store, leagues, world, now, season, calendarStartAt) {
  const cfg = NT().configOf(store);
  const due = [];
  let changed = false;
  if (!cfg.matchesLive || typeof calendarStartAt !== "number" || !Array.isArray(store.intlFriendlies)) return { changed, due };
  for (const f of store.intlFriendlies) {
    if (f.status === "pending") {
      // Pas de réponse avant le gel des convocations : demande caduque.
      if (now >= f.at - freezeMs()) {
        f.status = "cancelled"; f.respondedAt = now; f.reason = "expired";
        [f.from, f.to].forEach(id => feedTo(store, id, { key: `fr_exp_${f.id}_${id}`, at: now, title: `Demande d'amical expirée : ${NT().teamLabel(f.from)} – ${NT().teamLabel(f.to)}`, text: "Pas de réponse avant le gel des convocations." }));
        changed = true;
      } else due.push(f.at - freezeMs());
      continue;
    }
    if (f.status !== "accepted") continue;
    if (now < f.at) { due.push(f.at); continue; }
    if (!store.teams[f.home] || !store.teams[f.away]) { f.status = "cancelled"; f.reason = "unknown"; changed = true; continue; }
    // Liste figée d'abord (si le passage du gel a été manqué), puis le match.
    f.gid = `s${f.season}x${f.id}`;
    f.label = LABEL;
    const g = NC().gatheringsOf(store, store.teams[f.home], f.season, calendarStartAt).find(x => x.gid === f.gid);
    [f.home, f.away].forEach(tid => {
      const conv = NC().convocationOf(store, tid, f.gid);
      if (g && !(conv && conv.frozenAt)) NC().freezeConvocation(store, store.teams[tid], g, NT().activeMandate(store, tid), leagues, world, now);
    });
    NM().playMatch(store, null, f, leagues, world, now);
    // Direct en cours : résultat annoncé à la fin (nationalMatches.announceDue).
    if (NM().isLive(f, now)) due.push(f.liveUntil + 1000);
    changed = true;
  }
  // Historique : 3 saisons ; demandes refusées / annulées gardées 14 jours.
  const before = store.intlFriendlies.length;
  store.intlFriendlies = store.intlFriendlies.filter(f => f.season >= season - 2 && !((f.status === "refused" || f.status === "cancelled") && now - (f.respondedAt || f.createdAt || 0) > LIMITS.closedKeepDays * DAY));
  if (store.intlFriendlies.length !== before) changed = true;
  return { changed, due };
}

// --- Vues ---------------------------------------------------------------
function stateFor(f, teamId) {
  if (f.status === "pending") return f.from === teamId ? "sent" : "received";
  if (f.status === "accepted") return "scheduled";
  return f.status;
}
function publicFriendly(store, f, teamId, now) {
  const opp = f.home === teamId ? f.away : f.home;
  // Match encore en direct : ni score ni résultat avant la fin de la diffusion.
  if (NM().isLive(f, now)) return { ...publicFriendly(store, { ...f, status: "accepted", scoreHome: null, scoreAway: null, forfeit: null }, teamId), state: "live", status: "live", liveUntil: f.liveUntil };
  return {
    liveUntil: typeof f.liveUntil === "number" ? f.liveUntil : null,
    id: f.id, state: stateFor(f, teamId), status: f.status, season: f.season, at: f.at,
    home: f.home, away: f.away, homeLabel: NT().teamLabel(f.home), awayLabel: NT().teamLabel(f.away),
    venue: f.home === teamId ? "home" : "away", opponent: opp, opponentLabel: NT().teamLabel(opp), opponentCountry: String(opp).split("-")[0],
    from: f.from, to: f.to, createdAt: f.createdAt, respondedAt: f.respondedAt || null, reason: f.reason || null, auto: !!f.auto,
    cancelledBy: f.cancelledBy || null, scoreHome: f.scoreHome != null ? f.scoreHome : null, scoreAway: f.scoreAway != null ? f.scoreAway : null, forfeit: f.forfeit || null,
    gid: `s${f.season}x${f.id}`, freezeAt: f.at - freezeMs(),
  };
}
function viewFor(store, team, season, calendarStartAt, now) {
  const mine = listOf(store).filter(f => involves(f, team.id)).sort((a, b) => a.at - b.at);
  const pub = f => publicFriendly(store, f, team.id, now);
  const by = st => mine.filter(f => stateFor(f, team.id) === st).map(pub);
  return {
    limits: { perSeason: LIMITS.perSeason, used: seasonCount(store, team.id, season), minGapDays: LIMITS.minGapDays },
    live: !!NT().configOf(store).matchesLive,
    received: by("received"), sent: by("sent"), scheduled: by("scheduled"),
    played: by("played").reverse(),
    closed: mine.filter(f => f.status === "refused" || f.status === "cancelled").map(pub).reverse(),
    dates: datesFor(store, team, season, calendarStartAt, now),
    opponents: Object.values(store.teams).filter(t => t.cat === team.cat && t.id !== team.id).map(t => {
      const m = NT().activeMandate(store, t.id);
      return { id: t.id, label: NT().teamLabel(t.id), country: t.country, coach: m ? (m.pseudo || (m.clubName ? `Manager de ${m.clubName}` : "Sélectionneur")) : null, interim: !m, used: seasonCount(store, t.id, season) };
    }).sort((a, b) => a.label.localeCompare(b.label, "fr")),
  };
}
// Amicaux programmés et joués d'une sélection (page publique : calendrier).
function publicListOf(store, teamId, now) {
  return listOf(store).filter(f => involves(f, teamId) && (f.status === "accepted" || f.status === "played")).sort((a, b) => a.at - b.at).map(f => publicFriendly(store, f, teamId, now));
}

module.exports = { LIMITS, LABEL, request, respond, cancel, step, viewFor, datesFor, candidateDays, slotError, publicFriendly, publicListOf, matchTimesOf };
