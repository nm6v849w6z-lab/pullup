// =====================================================================
// ADAPTATEUR — Hoop Shows (émissions avant-match/mi-temps + pronostics)
// Voir DEV_NOTES.md point 11, hoop-shows/INTEGRATION.md (§3, format attendu
// par server/shows/showData.js). Convertit l'état RÉEL de la ligue
// (engine.js) vers le format normalisé attendu par showData.js — AUCUNE
// donnée fabriquée : tout vient de league.teams/league.results/
// league.liveMatches/matchLog déjà persistés, ou est omis quand la donnée
// réelle n'existe pas (voir les commentaires "PAS de X" ci-dessous).
//
// Portée v1 (décision Claude, à valider par Antony si besoin — voir
// DEV_NOTES.md) : CHAMPIONNAT UNIQUEMENT. La Coupe n'a pas la même notion de
// "journée" (bracket à élimination) et n'est pas mentionnée dans la demande
// utilisateur d'origine ("émission d'avant match et de la mi temps" au sens
// du calendrier de championnat) — ajoutable plus tard sans réécriture (les
// fonctions ci-dessous sont déjà paramétrées par `round`/`competition` pour
// la plupart), simplement pas encore branchée pour la Coupe.
// =====================================================================
const Engine = require("../engine.js");
const Scouting = require("./scouting.js");

// Repère du terrain utilisé par showData.js (x,y dans [0,1], x=0 = ligne de
// fond gauche, l'équipe à domicile attaque le panier de gauche) — DOIT rester
// cohérent avec le repère déjà utilisé par le terrain du live existant (voir
// moteurbasket3.html:randomPointForZone/seededRandom, viewBox 0 0 1000 440,
// panier de l'équipe "A" des événements CANONIQUES — c-à-d domicile, voir
// server/liveMatch.js:computeLiveMatch, "A" = TOUJOURS l'équipe à domicile —
// à x=50, panier de "B" à x=950). Portée EXACTEMENT le même algorithme et la
// MÊME graine (ev.airAt) que le live, pour que les tirs affichés dans
// l'émission de mi-temps soient au MÊME endroit que ceux déjà vus en direct
// par un manager qui suivait le match. Le moteur ne modélise aucune
// coordonnée de tir réelle (seulement une zone catégorielle "inside"/"mid"/
// "three", voir engine.js:playPossession) — cette randomisation SEEDÉE
// (déterministe) est la même approximation déjà acceptée pour le terrain du
// live, pas une fabrication nouvelle pour ce chantier.
const COURT_W = 1000;
const COURT_H = 440;

function seededRandom(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function randomPointForZone(team, zone, seed) {
  const rnd = seededRandom(Math.round(seed) || 0);
  const randSeeded = (min, max) => min + rnd() * (max - min);
  const basketX = team === "A" ? 50 : 950;
  const dir = team === "A" ? 1 : -1;
  if (zone === "inside") {
    const x = basketX + dir * randSeeded(15, 150);
    const y = randSeeded(150, 290);
    return { x: clamp(x, 30, 970) / COURT_W, y: clamp(y, 30, 410) / COURT_H };
  }
  const isThree = zone === "three";
  const angleDeg = isThree ? randSeeded(-62, 62) : randSeeded(-65, 65);
  const radius = isThree ? randSeeded(230, 270) : randSeeded(120, 205);
  const angle = angleDeg * Math.PI / 180;
  const x = basketX + dir * Math.cos(angle) * radius;
  const y = 220 + Math.sin(angle) * radius;
  return { x: clamp(x, 30, 970) / COURT_W, y: clamp(y, 30, 410) / COURT_H };
}

// Poste interne (français, voir engine.js:POSITIONS) -> code attendu par
// showData.js (voir INTEGRATION.md §3 : "MEN, ARR, AIL, AF, PIV").
const POS_CODE = {
  "Meneur": "MEN", "Arrière": "ARR", "Ailier shooteur": "AIL", "Ailier fort": "AF", "Pivot": "PIV",
};

function matchId(round, homeIdx, awayIdx) { return `${round}:${homeIdx}:${awayIdx}`; }

// Moyennes de saison d'un joueur (pts/ast/reb/tpPct/tov), depuis son
// matchLog déjà persisté — MÊME agrégation que teamSeasonStatsRows côté
// navigateur (moteurbasket3.html), recalculée ici côté serveur (module Node,
// pas d'accès au DOM). `null` si le joueur n'a encore joué aucun match
// (showData gère déjà l'absence de `season` proprement, voir
// buildPrematchShow:round1/H.player).
function playerSeasonAverages(p) {
  const log = p.matchLog || [];
  if (!log.length) return null;
  const sum = { pts: 0, ast: 0, reb: 0, tov: 0, fgm3: 0, fga3: 0 };
  log.forEach(m => { Object.keys(sum).forEach(k => { sum[k] += m[k] || 0; }); });
  const gp = log.length;
  return {
    pts: sum.pts / gp, ast: sum.ast / gp, reb: sum.reb / gp, tov: sum.tov / gp,
    tpPct: sum.fga3 > 0 ? Math.round((sum.fgm3 / sum.fga3) * 100) : 0,
  };
}

// Construit la carte `players` normalisée pour un ENSEMBLE de teamIdx donné
// (jamais toute la ligue d'un coup : seuls les effectifs des équipes
// réellement utiles à CETTE émission sont exposés, voir buildPrematchInput/
// buildHalftimeInput plus bas).
function playersMapFor(league, teamIdxs) {
  const players = {};
  teamIdxs.forEach(idx => {
    const team = league.teams[idx];
    if (!team) return;
    team.players.forEach(p => {
      players[String(p.id)] = {
        name: p.name, pos: POS_CODE[p.position] || p.position, teamId: String(idx),
        season: playerSeasonAverages(p),
      };
    });
  });
  return players;
}

function teamsMapFor(league, teamIdxs) {
  const teams = {};
  teamIdxs.forEach(idx => {
    const team = league.teams[idx];
    if (!team) return;
    // PAS de `city` : aucun champ ville n'existe sur Team (voir DEV_NOTES.md
    // point 10, même constat déjà fait pour le tableau de bord) — omis
    // plutôt qu'inventé, showData désactive alors simplement le tag "DERBY".
    teams[String(idx)] = { name: team.name, short: team.name };
  });
  return teams;
}

function standingsBefore(league) {
  return league.standings().map(r => ({ teamId: String(r.idx), w: r.wins, l: r.losses }));
}

// Forme récente (5 derniers matchs de CHAMPIONNAT, du plus ancien au plus
// récent, 'V'/'D') — réutilise Scouting.recentFormFor (déjà testé, déjà
// utilisé pour Scouting Pro), juste réordonné/reformaté pour showData.js.
function formFor(league, teamIdx, limit = 5) {
  return Scouting.recentFormFor(league, teamIdx, limit).slice().reverse().map(r => (r.win ? "V" : "D"));
}

// Historique brut des confrontations entre deux équipes (championnat
// uniquement, même périmètre que Scouting.headToHeadFor), le plus ancien en
// premier (showData.js prend le DERNIER élément du tableau comme la
// confrontation la plus récente, voir buildPrematchShow).
function headToHeadRaw(league, aIdx, bIdx) {
  return league.results
    .filter(r => (r.home === aIdx && r.away === bIdx) || (r.home === bIdx && r.away === aIdx))
    .sort((x, y) => x.round - y.round)
    .map(r => ({ day: r.round + 1, homeId: String(r.home), awayId: String(r.away), homeScore: r.scoreHome, awayScore: r.scoreAway }));
}

function startersFor(team) {
  return Engine.POSITIONS.map(pos => team.lineup.starters[pos]).filter(Boolean).map(String);
}

// Absents (blessés) des deux équipes d'un match précis — donnée RÉELLE
// (Player.injuryType/injuryUntil, voir Engine.isCurrentlyInjured), jamais de
// raison inventée : le libellé reprend INJURY_TYPES tel quel (déjà utilisé
// partout ailleurs dans l'appli pour afficher une blessure).
function absentsFor(league, homeIdx, awayIdx, now) {
  const out = [];
  [homeIdx, awayIdx].forEach(idx => {
    const team = league.teams[idx];
    if (!team) return;
    team.players.forEach(p => {
      if (!Engine.isCurrentlyInjured(p, now)) return;
      const label = (Engine.INJURY_TYPES && Engine.INJURY_TYPES[p.injuryType] && Engine.INJURY_TYPES[p.injuryType].label) || p.injuryType || "blessé";
      out.push({ playerId: String(p.id), teamId: String(idx), reason: label });
    });
  });
  return out;
}

// Convertit les événements CANONIQUES d'un match déjà simulé (voir
// server/liveMatch.js:computeLiveMatch — "A" = TOUJOURS l'équipe à domicile,
// "B" = TOUJOURS l'équipe à l'extérieur, quel que soit le spectateur) vers le
// format normalisé attendu par showData.js (voir INTEGRATION.md §3). Les
// types d'événements sans équivalent dans le contrat (substitution,
// quarterStart/End, tipoff, technicalFoul/technicalEjection,
// unsportsmanlikeFoul, foulOut, shortHanded, injury) sont IGNORÉS — showData
// dit explicitement gérer leur absence proprement (les rubriques qui en
// dépendent se désactivent seules).
function convertEvents(rawEvents, homeIdx, awayIdx) {
  const teamIdxFor = (side) => (side === "A" ? homeIdx : awayIdx);
  const nameToId = { [homeIdx]: {}, [awayIdx]: {} };
  [homeIdx, awayIdx].forEach(idx => {
    const team = league_teamsCache.get(idx);
    if (team) team.players.forEach(p => { nameToId[idx][p.name] = p.id; });
  });
  const idFor = (name, idx) => (name != null && nameToId[idx] && nameToId[idx][name] != null) ? String(nameToId[idx][name]) : null;

  const out = [];
  (rawEvents || []).forEach(ev => {
    const idx = teamIdxFor(ev.team);
    const teamId = String(idx);
    switch (ev.type) {
      case "shot": {
        const p = randomPointForZone(ev.team, ev.zone, ev.airAt);
        const evOut = {
          q: ev.quarter, type: "shot", teamId, playerId: idFor(ev.shooter, idx),
          pts: ev.zone === "three" ? 3 : 2, made: !!ev.made, x: p.x, y: p.y,
        };
        if (ev.made && ev.assister) evOut.assistId = idFor(ev.assister, idx);
        out.push(evOut);
        break;
      }
      case "freeThrow": {
        const n = ev.attempts || 0, made = ev.made || 0;
        for (let i = 0; i < n; i++) {
          out.push({ q: ev.quarter, type: "ft", teamId, playerId: idFor(ev.shooter, idx), made: i < made });
        }
        break;
      }
      case "rebound":
        out.push({ q: ev.quarter, type: "rebound", teamId, playerId: idFor(ev.rebounder, idx) });
        break;
      case "turnover":
        out.push({ q: ev.quarter, type: "turnover", teamId, playerId: idFor(ev.player, idx) });
        break;
      case "foul":
        // `ev.defender` : celui qui commet la faute (voir engine.js log("foul")) —
        // showData interprète `teamId` comme "l'équipe qui commet la faute",
        // déjà exactement ev.team ici (teamKey(defTeam)).
        out.push({ q: ev.quarter, type: "foul", teamId, playerId: idFor(ev.defender, idx) });
        break;
      default:
        break; // type sans équivalent, ignoré (voir commentaire de fonction)
    }
  });
  return out;
}

// Petit cache local (juste le temps d'un appel à convertEvents) pour
// retrouver l'équipe d'un index sans le repasser en paramètre partout —
// posé/nettoyé par buildMatchesInputForRound ci-dessous.
let league_teamsCache = new Map();

// Rassemble, pour `round` (championnat), tous les matchs ACTUELLEMENT
// diffusés en direct (league.liveMatches — jamais les matchs CPU-vs-CPU du
// même jour : ceux-là ne sont simulés qu'à la finalisation de la journée,
// voir server/autoSim.js:finalizeRound, donc pas encore connus à la
// mi-temps d'un match humain — c'est le comportement VOULU, pas une
// limitation : aucun spoiler possible sur un match pas encore simulé).
function buildMatchesInputForRound(league, round) {
  league_teamsCache = new Map(league.teams.map((t, i) => [i, t]));
  const out = [];
  const teamIdxs = new Set();
  Object.keys(league.liveMatches || {}).forEach(key => {
    if (key.startsWith("cup:")) return;
    const parts = key.split(":").map(Number);
    if (parts.length !== 3 || parts[0] !== round) return;
    const [r, homeIdx, awayIdx] = parts;
    const entry = league.liveMatches[key];
    if (!entry || entry.forfeit) return; // forfait : aucun événement à montrer
    teamIdxs.add(homeIdx); teamIdxs.add(awayIdx);
    out.push({
      id: matchId(r, homeIdx, awayIdx), homeId: String(homeIdx), awayId: String(awayIdx),
      events: convertEvents(entry.events, homeIdx, awayIdx),
    });
  });
  league_teamsCache = new Map();
  return { matches: out, teamIdxs: Array.from(teamIdxs) };
}

// Instant réel de la reprise (fin de la pause de mi-temps) POUR CE match
// précis — relu depuis `pauses` (déjà calculé par
// server/liveMatch.js:schedulePlayback, jamais recalculé ici) plutôt que
// d'ajouter une nouvelle notion de calendrier : cherche l'entrée
// `kind:"halftime"` et renvoie `airAt + durationMs`. `null` si la pause n'a
// pas encore été atteinte dans le calendrier de diffusion (ne devrait pas
// arriver : la pause est toujours calculée à l'avance dès le coup d'envoi,
// voir computeLiveMatch) ou si le match n'a pas (plus) d'entrée en direct.
function halftimeResumeAt(league, round, homeIdx, awayIdx) {
  const entry = league.liveMatches && league.liveMatches[matchId(round, homeIdx, awayIdx)];
  if (!entry) return null;
  const pause = (entry.pauses || []).find(p => p.kind === "halftime");
  return pause ? pause.airAt + pause.durationMs : null;
}

// --------------------------------------------------------------- avant-match
function buildPrematchInput(league, myTeamIdx, round, kickoffAt) {
  const fixtures = league.matchesForRound(round).filter(m => !m.bye);
  const fx = fixtures.find(f => f.home === myTeamIdx || f.away === myTeamIdx);
  const teamIdxs = new Set();
  fixtures.forEach(f => { teamIdxs.add(f.home); teamIdxs.add(f.away); });

  const form = {};
  teamIdxs.forEach(idx => { form[String(idx)] = formFor(league, idx, 5); });

  const lineups = {};
  let absents = [];
  let headToHead = [];
  if (fx) {
    lineups[String(fx.home)] = startersFor(league.teams[fx.home]);
    lineups[String(fx.away)] = startersFor(league.teams[fx.away]);
    absents = absentsFor(league, fx.home, fx.away, kickoffAt);
    headToHead = headToHeadRaw(league, fx.home, fx.away);
  }

  return {
    day: round + 1, leagueId: "main", myTeamId: String(myTeamIdx),
    teams: teamsMapFor(league, Array.from(teamIdxs)),
    players: playersMapFor(league, fx ? [fx.home, fx.away] : []),
    standings: standingsBefore(league),
    fixtures: fixtures.map(f => ({ id: matchId(round, f.home, f.away), homeId: String(f.home), awayId: String(f.away) })),
    form, headToHead, lineups, absents, kickoffAt,
  };
}

// --------------------------------------------------------------- mi-temps
function buildHalftimeInput(league, myTeamIdx, round) {
  const { matches, teamIdxs } = buildMatchesInputForRound(league, round);
  const resumeAt = halftimeResumeAt(league, round, ...(() => {
    const mine = league.matchesForRound(round).find(m => m.home === myTeamIdx || m.away === myTeamIdx);
    return mine ? [mine.home, mine.away] : [null, null];
  })());
  return {
    day: round + 1, leagueId: "main", myTeamId: String(myTeamIdx),
    teams: teamsMapFor(league, teamIdxs),
    players: playersMapFor(league, teamIdxs),
    matches, standings: standingsBefore(league), resumeAt,
  };
}

// --------------------------------------------------------------- résolution
// Résout les pronostics d'un match à partir de ce qui est déjà connu à la
// finalisation de la journée (score final, quarterScores, matchLog) — SANS
// dépendre des événements bruts du match (jetés à la finalisation, voir
// server/liveMatch.js:finalizeRound). Reproduit exactement la sémantique de
// server/shows/pronostics.js:resolveQuestion (mêmes règles d'égalité/paliers)
// mais à partir de ce résumé plutôt que d'un `match.events` complet.
function resolveShowQuestion(q, result) {
  if (!result) return null;
  const { homeIdx, awayIdx, scoreHome, scoreAway, quarterScores, topScorerByPlayerId } = result;
  if (q.kind === "secondHalfWinner") {
    const homeQ = (quarterScores && quarterScores.home || []).slice(2).reduce((s, v) => s + (v || 0), 0);
    const awayQ = (quarterScores && quarterScores.away || []).slice(2).reduce((s, v) => s + (v || 0), 0);
    if (homeQ === awayQ) return null;
    return String(homeQ > awayQ ? homeIdx : awayIdx);
  }
  switch (q.kind) {
    case "matchWinner":
      if (scoreHome === scoreAway) return null;
      return String(scoreHome > scoreAway ? homeIdx : awayIdx);
    case "totalPoints":
      return (scoreHome + scoreAway) === q.line ? null : (scoreHome + scoreAway) > q.line ? "over" : "under";
    case "margin": {
      const d = Math.abs(scoreHome - scoreAway);
      if (d === 0) return null;
      return d <= 5 ? "1-5" : d <= 10 ? "6-10" : "11+";
    }
    case "topScorer": {
      const pts = q.options.map(o => ({ id: String(o.id), pts: (topScorerByPlayerId && topScorerByPlayerId[o.id]) || 0 }));
      pts.sort((a, b) => b.pts - a.pts);
      if (pts.length > 1 && pts[0].pts === pts[1].pts) return null;
      return pts[0].id;
    }
    default:
      return null;
  }
}

// Points par joueur (matchLog[].pts) pour un match/round/competition précis
// — utilisé pour résoudre "topScorer" sans les événements bruts.
function topScorerMapForMatch(league, round, competition, homeIdx, awayIdx) {
  const map = {};
  [homeIdx, awayIdx].forEach(idx => {
    const team = league.teams[idx];
    if (!team) return;
    team.players.forEach(p => {
      const entry = (p.matchLog || [])[p.matchLog.length - 1];
      if (entry && entry.round === round && entry.competition === competition) map[String(p.id)] = entry.pts || 0;
    });
  });
  return map;
}

module.exports = {
  matchId, POS_CODE, randomPointForZone,
  buildPrematchInput, buildHalftimeInput,
  resolveShowQuestion, topScorerMapForMatch,
  // Exportés pour les tests (vérification indépendante).
  playerSeasonAverages, formFor, headToHeadRaw, standingsBefore, convertEvents,
};
