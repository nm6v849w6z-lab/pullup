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
// Principes :
// - Réservé à la ligue multi-manager (League.calendarDailyAnchored) : une
//   ligue privée regroupe des clubs HUMAINS d'une même ligue partagée.
// - Création ET participation réservées aux clubs Premium
//   (Team.hasActivePremium), vérifié côté serveur à chaque action.
// - Une journée par semaine, le VENDREDI à 21h30 (heure de Paris) — après le
//   dernier créneau officiel du jour (championnat 19h + 90 min de diffusion).
//   Aller-retour (generateRoundRobinSchedule), 6/8/10 équipes.
// - Les matchs sont simulés sur des COPIES des équipes (serializeTeam →
//   teamFromSave) : MatchEngine.simulate a ses propres effets de bord
//   (blessures, minutes d'entraînement, snapshots de forme), qui tombent avec
//   la copie. RIEN n'est écrit sur les joueurs ni le club réels — ni forme,
//   ni fatigue, ni entraînement, ni finances, ni stats de carrière
//   (matchLog), ni classement mondial. Seul le résultat est stocké dans
//   League.privateLeagues (+ une entrée de fil d'actu pour les membres).
// - Avantage du terrain optionnel (venue "home") : option homeAdvantage de
//   MatchEngine, voir HOME_ADVANTAGE_FACTOR côté moteur ; "neutral" = aucun.
//
// Forme d'une ligue privée (JSON brut dans League.privateLeagues) :
// { id, name, code, creatorTeamIndex, size, venue, status
//   ("open"|"running"|"finished"), createdAt, startedAt, finishedAt,
//   teamIndices: [idx...],
//   rounds: [{ index, dueAt, matches: [{ home, away, played, playedAt,
//     scoreHome, scoreAway, forfeit, quarterScores, boxScoreHome,
//     boxScoreAway }] }] }
// `home`/`away` sont des index dans league.teams ; -1 = exempt (nombre
// impair d'équipes au lancement).
// ---------------------------------------------------------------------

const Calendar = require("./calendar.js");

const PRIVATE_LEAGUE_SIZES = [6, 8, 10];
const PRIVATE_LEAGUE_MIN_TEAMS_TO_START = 4;
const PRIVATE_LEAGUE_VENUES = ["home", "neutral"];
const PRIVATE_LEAGUE_WEEKDAY = 5; // vendredi (convention Date#getUTCDay)
const PRIVATE_LEAGUE_HOUR = 21;
const PRIVATE_LEAGUE_MINUTE = 30;
const PRIVATE_LEAGUE_NAME_MAX = 30;
const PRIVATE_LEAGUE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I
const PRIVATE_LEAGUE_CODE_LENGTH = 6;
// Une ligue terminée reste consultable un moment (palmarès) puis est purgée
// pour ne pas faire grossir la sauvegarde indéfiniment.
const PRIVATE_LEAGUE_FINISHED_RETENTION_MS = 60 * 24 * 3600 * 1000;

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

function isActive(lp) {
  return lp.status === "open" || lp.status === "running";
}

// La ligue privée ACTIVE (ouverte ou en cours) dont ce club est membre — un
// club ne peut être que dans une seule à la fois (voir createPrivateLeague/
// joinPrivateLeague).
function activePrivateLeagueFor(league, teamIndex) {
  return (league.privateLeagues || []).find(lp => isActive(lp) && lp.teamIndices.includes(teamIndex)) || null;
}

function findById(league, id) {
  return (league.privateLeagues || []).find(lp => lp.id === id) || null;
}

// Garde-fous communs à toute action : ligue multi-manager, club humain,
// Premium actif.
function checkEligibility(team, league, now) {
  if (!league.calendarDailyAnchored) return "Les ligues privées ne sont disponibles que dans la ligue partagée.";
  if (!team || !team.isHuman) return "Seul un club géré par un manager peut participer à une ligue privée.";
  if (typeof team.hasActivePremium !== "function" || !team.hasActivePremium(now)) {
    return "Les ligues privées sont réservées aux clubs Premium.";
  }
  return null;
}

// --- Actions --------------------------------------------------------------

// POST /api/private-league/create  body: { name, size, venue }
function createPrivateLeague(Engine, team, teamIndex, league, body, now) {
  const err = checkEligibility(team, league, now);
  if (err) return fail(err);
  if (activePrivateLeagueFor(league, teamIndex)) return fail("Votre club participe déjà à une ligue privée.");
  const name = normalizeName(body && body.name);
  if (!name) return fail(`Le nom de la ligue doit faire entre 2 et ${PRIVATE_LEAGUE_NAME_MAX} caractères.`);
  const size = Number(body && body.size);
  if (!PRIVATE_LEAGUE_SIZES.includes(size)) return fail("Nombre d'équipes invalide (6, 8 ou 10).");
  const venue = body && body.venue;
  if (!PRIVATE_LEAGUE_VENUES.includes(venue)) return fail("Choix du terrain invalide.");

  if (!Array.isArray(league.privateLeagues)) league.privateLeagues = [];
  let code = randomCode();
  while (league.privateLeagues.some(lp => lp.code === code)) code = randomCode();
  const lp = {
    id: randomId(Engine),
    name, code,
    creatorTeamIndex: teamIndex,
    size, venue,
    status: "open",
    createdAt: now, startedAt: null, finishedAt: null,
    teamIndices: [teamIndex],
    rounds: [],
  };
  league.privateLeagues.push(lp);
  return { ok: true, privateLeagueId: lp.id };
}

// POST /api/private-league/join  body: { code }
function joinPrivateLeague(Engine, team, teamIndex, league, body, now) {
  const err = checkEligibility(team, league, now);
  if (err) return fail(err);
  if (activePrivateLeagueFor(league, teamIndex)) return fail("Votre club participe déjà à une ligue privée.");
  const code = normalizeCode(body && body.code);
  if (!code) return fail("Code d'invitation invalide.");
  const lp = (league.privateLeagues || []).find(l => l.code === code && isActive(l));
  if (!lp) return fail("Aucune ligue privée ouverte ne correspond à ce code.");
  if (lp.status !== "open") return fail("Cette ligue privée a déjà commencé.");
  if (lp.teamIndices.length >= lp.size) return fail("Cette ligue privée est complète.");
  lp.teamIndices.push(teamIndex);
  if (lp.teamIndices.length >= lp.size) startPrivateLeagueNow(Engine, lp, now);
  return { ok: true, privateLeagueId: lp.id, started: lp.status === "running" };
}

// POST /api/private-league/leave  body: { id }
// Uniquement tant que la ligue n'a pas commencé. Le créateur qui part
// dissout la ligue (les autres redeviennent libres).
function leavePrivateLeague(Engine, team, teamIndex, league, body, now) {
  const lp = findById(league, body && body.id);
  if (!lp) return fail("Ligue privée introuvable.");
  if (!lp.teamIndices.includes(teamIndex)) return fail("Votre club ne fait pas partie de cette ligue privée.");
  if (lp.status !== "open") return fail("Impossible de quitter une ligue privée déjà lancée.");
  if (lp.creatorTeamIndex === teamIndex) {
    league.privateLeagues = league.privateLeagues.filter(l => l.id !== lp.id);
    return { ok: true, dissolved: true };
  }
  lp.teamIndices = lp.teamIndices.filter(i => i !== teamIndex);
  return { ok: true, dissolved: false };
}

// POST /api/private-league/start  body: { id }
// Lancement anticipé par le créateur, dès PRIVATE_LEAGUE_MIN_TEAMS_TO_START
// clubs (le lancement est automatique quand la ligue est complète).
function startPrivateLeague(Engine, team, teamIndex, league, body, now) {
  const lp = findById(league, body && body.id);
  if (!lp) return fail("Ligue privée introuvable.");
  if (lp.creatorTeamIndex !== teamIndex) return fail("Seul le créateur de la ligue peut la lancer.");
  if (lp.status !== "open") return fail("Cette ligue privée a déjà commencé.");
  if (lp.teamIndices.length < PRIVATE_LEAGUE_MIN_TEAMS_TO_START) {
    return fail(`Il faut au moins ${PRIVATE_LEAGUE_MIN_TEAMS_TO_START} clubs pour lancer la ligue.`);
  }
  startPrivateLeagueNow(Engine, lp, now);
  return { ok: true, privateLeagueId: lp.id };
}

// --- Calendrier -------------------------------------------------------------

// Premier vendredi 21h30 (Paris) strictement APRÈS `now`.
function firstPrivateLeagueSlotAfter(now) {
  const today = Calendar.parisLocalDateParts(now);
  const daysAhead = Calendar.daysUntilParisWeekday(today, PRIVATE_LEAGUE_WEEKDAY);
  let target = daysAhead > 0 ? Calendar.addParisCalendarDays(today, daysAhead) : today;
  let slot = Calendar.parisEpochForLocalTime(target.year, target.month, target.day, PRIVATE_LEAGUE_HOUR, PRIVATE_LEAGUE_MINUTE);
  if (slot <= now) {
    target = Calendar.addParisCalendarDays(today, daysAhead + 7);
    slot = Calendar.parisEpochForLocalTime(target.year, target.month, target.day, PRIVATE_LEAGUE_HOUR, PRIVATE_LEAGUE_MINUTE);
  }
  return slot;
}

// Créneau de la journée `roundIndex` : `roundIndex` semaines civiles après le
// premier créneau (toujours un vendredi 21h30, changement d'heure compris).
function privateLeagueSlotForRound(firstSlot, roundIndex) {
  if (roundIndex === 0) return firstSlot;
  const day0 = Calendar.parisLocalDateParts(firstSlot);
  const target = Calendar.addParisCalendarDays(day0, 7 * roundIndex);
  return Calendar.parisEpochForLocalTime(target.year, target.month, target.day, PRIVATE_LEAGUE_HOUR, PRIVATE_LEAGUE_MINUTE);
}

function startPrivateLeagueNow(Engine, lp, now) {
  // Ordre de tirage mélangé pour que le créateur ne reçoive pas toujours en
  // premier ; exempt (-1) ajouté si nombre impair.
  const participants = lp.teamIndices.slice();
  for (let i = participants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [participants[i], participants[j]] = [participants[j], participants[i]];
  }
  if (participants.length % 2 === 1) participants.push(-1);
  const schedule = Engine.generateRoundRobinSchedule(participants.length);
  const firstSlot = firstPrivateLeagueSlotAfter(now);
  lp.rounds = schedule.map((round, index) => ({
    index,
    dueAt: privateLeagueSlotForRound(firstSlot, index),
    matches: round
      .map(m => ({ home: participants[m.home], away: participants[m.away] }))
      .filter(m => m.home !== -1 && m.away !== -1)
      .map(m => ({ ...m, played: false, playedAt: null, scoreHome: null, scoreAway: null, forfeit: null, quarterScores: null, boxScoreHome: null, boxScoreAway: null })),
  }));
  lp.status = "running";
  lp.startedAt = now;
}

// --- Simulation -------------------------------------------------------------

// Copie profonde et indépendante d'une équipe : tout ce que MatchEngine
// touche pendant simulate() tombe avec elle.
function cloneTeamForExhibition(Engine, team) {
  return Engine.teamFromSave(Engine.serializeTeam(team));
}

function compactBoxScore(rows) {
  return rows.map(r => ({
    id: r.id, name: r.name, position: r.position, min: r.min,
    pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, tov: r.tov, pf: r.pf,
    fgm2: r.fgm2, fga2: r.fga2, fgm3: r.fgm3, fga3: r.fga3, ftm: r.ftm, fta: r.fta,
    plusMinus: r.plusMinus || 0,
  }));
}

function simulatePrivateLeagueMatch(Engine, league, lp, match, now) {
  const homeReal = league.teams[match.home];
  const awayReal = league.teams[match.away];
  if (!homeReal || !awayReal) {
    match.played = true; match.playedAt = now; match.forfeit = "both";
    match.scoreHome = 0; match.scoreAway = 0;
    return;
  }
  const home = cloneTeamForExhibition(Engine, homeReal);
  const away = cloneTeamForExhibition(Engine, awayReal);
  const homeOk = home.hasValidLineup();
  const awayOk = away.hasValidLineup();
  match.played = true;
  match.playedAt = now;
  if (homeOk && awayOk) {
    const engine = new Engine.MatchEngine(home, away, { homeAdvantage: lp.venue === "home" });
    const result = engine.simulate(now);
    match.scoreHome = result.finalScore.A;
    match.scoreAway = result.finalScore.B;
    match.forfeit = null;
    match.quarterScores = { home: result.quarterScores.A, away: result.quarterScores.B };
    match.boxScoreHome = compactBoxScore(result.boxScoreA);
    match.boxScoreAway = compactBoxScore(result.boxScoreB);
    return;
  }
  match.quarterScores = null; match.boxScoreHome = null; match.boxScoreAway = null;
  if (!homeOk && !awayOk) { match.forfeit = "both"; match.scoreHome = 0; match.scoreAway = 0; return; }
  if (!homeOk) { match.forfeit = "home"; match.scoreHome = 0; match.scoreAway = Engine.FORFEIT_SCORE; return; }
  match.forfeit = "away"; match.scoreHome = Engine.FORFEIT_SCORE; match.scoreAway = 0;
}

function pushRoundFeed(Engine, league, lp, round) {
  round.matches.forEach(m => {
    [m.home, m.away].forEach(idx => {
      const team = league.teams[idx];
      if (!team || !team.isHuman || !team.feed) return;
      const mine = idx === m.home;
      const opp = league.teams[mine ? m.away : m.home];
      const pf = mine ? m.scoreHome : m.scoreAway;
      const pa = mine ? m.scoreAway : m.scoreHome;
      const win = pf > pa;
      Engine.pushEntry(team.feed, {
        key: `private_league_${lp.id}_${round.index}_${idx}`,
        category: "ligue",
        week: team.week,
        title: `${lp.name} · J${round.index + 1} : ${win ? "victoire" : "défaite"} ${pf}-${pa} ${mine ? "contre" : "chez"} ${opp ? opp.name : "?"}`,
        text: m.forfeit ? "Match perdu ou gagné par forfait (cinq incomplet)." : "Match de ligue privée : aucun effet sur la forme, l'entraînement ni les finances.",
        action: { label: "Ligue privée", href: "/ligues-privees" },
      });
    });
  });
}

// Appelée à chaque tick serveur (voir server/index.js) : joue toutes les
// journées dues des ligues en cours, clôt celles qui sont terminées, purge
// les anciennes. Renvoie les journées jouées (pour les tests/journalisation).
function catchUpPrivateLeagues(Engine, league, now) {
  const played = [];
  if (!league || !Array.isArray(league.privateLeagues) || league.privateLeagues.length === 0) return played;
  league.privateLeagues.forEach(lp => {
    if (lp.status !== "running") return;
    lp.rounds.forEach(round => {
      if (round.dueAt > now) return;
      if (round.matches.every(m => m.played)) return;
      round.matches.forEach(m => { if (!m.played) simulatePrivateLeagueMatch(Engine, league, lp, m, now); });
      pushRoundFeed(Engine, league, lp, round);
      played.push({ privateLeagueId: lp.id, round: round.index });
    });
    if (lp.rounds.every(r => r.matches.every(m => m.played))) {
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

// --- Lecture ----------------------------------------------------------------

// Classement : 2 pts la victoire, 1 la défaite (convention du championnat du
// jeu), départage au +/- puis aux points marqués.
function privateLeagueStandings(lp) {
  const rows = new Map();
  lp.teamIndices.forEach(idx => rows.set(idx, { idx, played: 0, wins: 0, losses: 0, pf: 0, pa: 0, pts: 0, form: [] }));
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

// Vue envoyée au navigateur : le code d'invitation n'est visible que des
// membres (c'est le seul secret d'une ligue privée).
function publicView(lp, viewerTeamIndex) {
  const member = lp.teamIndices.includes(viewerTeamIndex);
  return { ...lp, code: member ? lp.code : null };
}

function sanitizePrivateLeaguesForViewer(privateLeagues, viewerTeamIndex) {
  return (privateLeagues || []).map(lp => publicView(lp, viewerTeamIndex));
}

module.exports = {
  PRIVATE_LEAGUE_SIZES, PRIVATE_LEAGUE_MIN_TEAMS_TO_START, PRIVATE_LEAGUE_VENUES,
  PRIVATE_LEAGUE_WEEKDAY, PRIVATE_LEAGUE_HOUR, PRIVATE_LEAGUE_MINUTE, PRIVATE_LEAGUE_NAME_MAX,
  PRIVATE_LEAGUE_CODE_LENGTH, PRIVATE_LEAGUE_FINISHED_RETENTION_MS,
  createPrivateLeague, joinPrivateLeague, leavePrivateLeague, startPrivateLeague,
  startPrivateLeagueNow, firstPrivateLeagueSlotAfter, privateLeagueSlotForRound,
  simulatePrivateLeagueMatch, catchUpPrivateLeagues, privateLeagueStandings,
  activePrivateLeagueFor, sanitizePrivateLeaguesForViewer, normalizeCode,
};
