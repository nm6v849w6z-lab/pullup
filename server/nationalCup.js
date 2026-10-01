"use strict";

// =====================================================================
// COUPE NATIONALE (retour utilisateur, 2026-09-28 : « coupe nationale
// limitée à 512 équipes », « +7 points par division d'écart, plafonné à
// +21 », option (b) « tout d'un coup avec le direct », primes par match
// gagné). Une Coupe PAR PAYS, qui réunit les clubs de TOUS ses championnats
// (512 au plus, les divisions les plus hautes d'abord) et REMPLACE, à partir
// de la saison suivant la création du monde, la Coupe interne à chaque
// championnat (League.cup, voir League.startNextSeason).
//
// Tenue dans le registre du monde (world.cups[country], voir
// server/world.js) — seuls des RÉFÉRENCES de clubs y sont stockées
// ({ leagueId, idx, name, level }), jamais les clubs eux-mêmes.
//   { country, season, totalRounds, champion: ref|null,
//     rounds: [{ index, stageFromEnd, matches: [match], resolved }] }
//   match = { id, home: ref, away: ref|null (exempt), bye, handicap: { home, away },
//             started, result: { scoreHome, scoreAway, forfeit, quarterScores, tacticsUsed },
//             winner: "home"|"away"|null, resolved }
//
// Tirage : puissance de 2 au-dessus du nombre de clubs ; les EXEMPTS du 1er
// tour vont aux divisions les plus hautes (tirage au sort à niveau égal) ;
// ensuite, appariements au hasard à chaque tour (comme la Coupe interne).
// Un tour par semaine, le jeudi à 20:00 heure locale (semaine k = tour k),
// donc 9 tours au plus pendant les 9 semaines de championnat.
//
// Handicap : le club de la division la plus basse part avec +7 points par
// division d'écart (plafond +21), ajoutés au score final — jamais aux stats
// des joueurs ni aux records.
//
// Déroulé d'un tour (step, appelé par server/world.js:catchUpWorld) :
//  - au coup d'envoi : chaque match est calculé UNE fois avec les VRAIS
//    clubs (ordres de Coupe préparés appliqués) ; s'il implique un manager,
//    la diffusion est déposée dans la ligue de CHAQUE manager concerné
//    (league.liveMatches, clé « ncup:… »), l'adversaire y étant un « club
//    invité » (index NATIONAL_CUP_GUEST_IDX, voir guestForTeam) ;
//  - à la fin de la fenêtre de diffusion : stats/MVP écrits des deux côtés,
//    primes de Coupe, fil d'actualité, diffusions retirées, tour suivant.
// Un tour très en retard (serveur endormi) est joué d'un coup, sans direct.
// =====================================================================

const NATIONAL_CUP_MAX_CLUBS = 512;
const NATIONAL_CUP_HANDICAP_PER_DIVISION = 7;
const NATIONAL_CUP_HANDICAP_MAX = 21;
// Index « invité » de l'adversaire d'une autre ligue dans la diffusion et
// les données envoyées au navigateur (jamais un vrai index de league.teams) :
// NATIONAL_CUP_GUEST_IDX + numéro du tour, un invité distinct par tour.
const NATIONAL_CUP_GUEST_IDX = 100;
function guestIdxForRound(roundIndex) { return NATIONAL_CUP_GUEST_IDX + roundIndex; }
const STAGE_KEYS_FROM_END = ["finale", "demies", "quarts", "huitiemes", "seiziemes", "32es", "64es", "128es", "256es"];
const STAGE_LABELS_FROM_END = ["Finale", "Demi-finales", "Quarts de finale", "Huitièmes de finale", "Seizièmes de finale", "32es de finale", "64es de finale", "128es de finale", "256es de finale"];

function stageKey(fromEnd) { return STAGE_KEYS_FROM_END[fromEnd] || `${Math.pow(2, fromEnd)}es`; }
function stageLabel(fromEnd) { return STAGE_LABELS_FROM_END[fromEnd] || `${Math.pow(2, fromEnd)}es de finale`; }

function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function handicapFor(home, away) {
  if (!home || !away) return { home: 0, away: 0 };
  const diff = Math.abs((home.level || 1) - (away.level || 1));
  const pts = Math.min(NATIONAL_CUP_HANDICAP_MAX, diff * NATIONAL_CUP_HANDICAP_PER_DIVISION);
  if (!pts) return { home: 0, away: 0 };
  return (home.level || 1) > (away.level || 1) ? { home: pts, away: 0 } : { home: 0, away: pts };
}

function makeMatch(roundIndex, k, home, away) {
  return {
    id: `r${roundIndex}m${k}`, home, away: away || null, bye: !away,
    handicap: handicapFor(home, away),
    started: false, result: null, winner: away ? null : "home", resolved: !away,
  };
}

// Crée la Coupe nationale d'un pays. `entries` : championnats du pays du plus
// haut au plus bas (world.leaguesOfCountry) ; `leagues` : Map id → League.
function createNationalCup(country, entries, leagues, season) {
  let clubs = [];
  entries.forEach(e => {
    const lg = leagues.get(e.id);
    if (!lg) return;
    lg.teams.forEach((t, idx) => clubs.push({ leagueId: e.id, idx, name: t.name, level: e.level }));
  });
  clubs = clubs.slice(0, NATIONAL_CUP_MAX_CLUBS);
  if (clubs.length < 2) return null;
  let size = 2;
  while (size < clubs.length) size *= 2;
  const totalRounds = Math.round(Math.log2(size));
  const byeCount = size - clubs.length;
  // Exempts : divisions les plus hautes d'abord (au hasard à niveau égal).
  const byLevel = shuffle(clubs).sort((a, b) => a.level - b.level);
  const byes = byLevel.slice(0, byeCount);
  const playIn = shuffle(byLevel.slice(byeCount));
  const matches = [];
  byes.forEach(c => matches.push(makeMatch(0, matches.length, c, null)));
  for (let i = 0; i + 1 < playIn.length; i += 2) matches.push(makeMatch(0, matches.length, playIn[i], playIn[i + 1]));
  return {
    country, season, totalRounds, champion: null,
    rounds: [{ index: 0, stageFromEnd: totalRounds - 1, matches, resolved: matches.every(m => m.resolved) }],
  };
}

function pendingRound(cup) {
  if (!cup || cup.champion) return null;
  const r = cup.rounds[cup.rounds.length - 1];
  return r && !r.resolved ? r : null;
}

function winnerRef(m) { return m.winner === "away" ? m.away : m.home; }

// Tour suivant (ou champion) une fois le tour courant entièrement résolu.
function advance(cup) {
  const last = cup.rounds[cup.rounds.length - 1];
  if (!last || !last.matches.every(m => m.resolved)) return false;
  last.resolved = true;
  const winners = last.matches.map(winnerRef);
  if (winners.length === 1) { cup.champion = winners[0]; return true; }
  const shuffled = shuffle(winners);
  const index = last.index + 1;
  const matches = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) matches.push(makeMatch(index, matches.length, shuffled[i], shuffled[i + 1]));
  cup.rounds.push({ index, stageFromEnd: cup.totalRounds - 1 - index, matches, resolved: false });
  return true;
}

// Diffusion avec le handicap déjà au tableau d'affichage (comme sur
// BuzzerBeater : le club de division inférieure démarre à +7/+14/+21) —
// les stats des joueurs, elles, restent celles du match réellement joué.
function withHandicap(live, handicap) {
  const h = handicap || { home: 0, away: 0 };
  if (live.forfeit || (!h.home && !h.away)) return live;
  return {
    ...live,
    finalScore: { home: live.finalScore.home + h.home, away: live.finalScore.away + h.away },
    events: (live.events || []).map(ev => ev.score ? { ...ev, score: { A: ev.score.A + h.home, B: ev.score.B + h.away } } : ev),
  };
}

const COUNTRY_NAMES = { fr: "France", us: "États-Unis", it: "Italie", es: "Espagne", de: "Allemagne", gr: "Grèce",
  lt: "Lituanie", pl: "Pologne", pt: "Portugal", be: "Belgique", ch: "Suisse", br: "Brésil", ar: "Argentine",
  ca: "Canada", cn: "Chine", hk: "Hong Kong", tw: "Taïwan" };
function countryName(code) { return COUNTRY_NAMES[code] || String(code || "").toUpperCase(); }
const MAX_TROPHIES = 40;
function addTrophy(team, league, type, label, now) {
  team.trophies = team.trophies || [];
  if (team.trophies.some(t => t.type === type && league && t.seasonId === (league.seasonId || null) && t.label === label)) return;
  team.trophies.unshift({ at: now, type, divisionLevel: league ? league.divisionLevel || null : null, label, seasonId: league ? league.seasonId || null : null });
  if (team.trophies.length > MAX_TROPHIES) team.trophies.length = MAX_TROPHIES;
}

function liveKey(cup, round, m) { return `ncup:${cup.season}:${round.index}:${m.id}`; }

// Copie « invitée » d'un club pour la ligue d'un manager (diffusion, Ordres,
// scouting, fiche) : sérialisation complète du club, sans son fil ni ses
// finances (données privées du club invité).
function guestForTeam(Engine, team, ref) {
  const data = Engine.serializeTeam(team);
  delete data.feed; delete data.transactions; delete data.managerLinkToken; delete data.messages;
  // Historique hebdomadaire des joueurs (permaliens) : inutile ici, et privé.
  (data.players || []).forEach(p => { delete p.weeklyHistory; });
  // Données privées du club invité (ordres préparés, marché, sponsors…).
  ["plannedTactics", "tacticPresets", "ordersHistory", "marketWatchlist", "marketAlerts", "marketAlertSeen",
    "sponsorOffers", "sponsorContracts", "sponsorHistory", "scoutingAdTickets", "scoutingUnlocks", "scoutingAdWatchLog",
    "scoutedAttrs", "pendingInterviews", "pendingYouthDecisions", "youthCandidates", "trainingHistory", "lastTrainingReport",
    "collectiveTrainingLog"].forEach(k => { delete data[k]; });
  data.budget = 0;
  data.isHuman = !!team.isHuman;
  return { leagueId: ref.leagueId, idx: ref.idx, level: ref.level, team: data };
}

// Fait avancer la Coupe nationale d'un pays jusqu'à `now`. `refLeague` :
// ligue de référence du pays (son calendrier donne les dates des tours).
function step({ Engine, Calendar, LiveMatch }, cup, leagues, refLeague, now, events = []) {
  if (!cup || !refLeague) return events;
  const teamOf = ref => { const lg = leagues.get(ref.leagueId); return lg ? lg.teams[ref.idx] : null; };
  for (let guard = 0; guard < 12; guard++) {
    const round = pendingRound(cup);
    if (!round) break;
    const kickoff = Calendar.scheduledTimeForLeagueCupRound(refLeague, round.index);
    if (kickoff == null || now < kickoff) break;
    const windowEnd = kickoff + Calendar.MATCH_BROADCAST_DURATION_MS;
    const late = now >= windowEnd;
    // 1) Coup d'envoi.
    round.matches.forEach(m => {
      if (m.bye || m.started) return;
      const home = teamOf(m.home), away = teamOf(m.away);
      if (!home || !away) { m.started = true; m.result = { scoreHome: home ? Engine.FORFEIT_SCORE : 0, scoreAway: away ? Engine.FORFEIT_SCORE : 0, forfeit: true, quarterScores: null, tacticsUsed: null }; return; }
      if (home.isHuman && typeof home.applyPlannedTacticsForRound === "function") home.applyPlannedTacticsForRound(round.index, "cup");
      if (away.isHuman && typeof away.applyPlannedTacticsForRound === "function") away.applyPlannedTacticsForRound(round.index, "cup");
      const hasHuman = home.isHuman || away.isHuman;
      if (hasHuman && !late) {
        const live = LiveMatch.computeLiveMatchForTeams(Engine, home, away, round.index, m.home.idx, m.away.idx, kickoff, "cup");
        m.result = { scoreHome: live.finalScore.home, scoreAway: live.finalScore.away, forfeit: live.forfeit, quarterScores: live.quarterScores, tacticsUsed: live.tacticsUsed, seed: live.seed };
        // Diffusion déposée dans la ligue de chaque manager concerné.
        [["home", home, m.home, away, m.away], ["away", away, m.away, home, m.home]].forEach(([side, team, ref, opp, oppRef]) => {
          if (!team.isHuman) return;
          const lg = leagues.get(ref.leagueId);
          if (!lg) return;
          if (!lg.liveMatches) lg.liveMatches = {};
          const sameLeague = oppRef.leagueId === ref.leagueId;
          const oppIdx = sameLeague ? oppRef.idx : guestIdxForRound(round.index);
          lg.liveMatches[liveKey(cup, round, m)] = {
            ...withHandicap(live, m.handicap),
            homeIdx: side === "home" ? ref.idx : oppIdx,
            awayIdx: side === "away" ? ref.idx : oppIdx,
            handicap: m.handicap,
            nationalCup: { season: cup.season, round: round.index, matchId: m.id, stageFromEnd: round.stageFromEnd },
            guest: sameLeague ? null : guestForTeam(Engine, opp, oppRef),
          };
        });
      } else {
        const sim = Engine.simulateOrForfeit(home, away, kickoff);
        m.result = { scoreHome: sim.scoreHome, scoreAway: sim.scoreAway, forfeit: sim.forfeit, quarterScores: sim.quarterScores || null, tacticsUsed: sim.tacticsUsed || null, seed: sim.seed };
        if (!sim.forfeit) Engine.recordMatchStatsAndAwardMvp(home, away, round.index, "cup", kickoff, m.result.quarterScores, m.result.tacticsUsed, m.result.seed);
        m.statsRecorded = true;
      }
      m.started = true;
    });
    if (now < windowEnd) break;
    // 2) Fin de la diffusion : résultats définitifs.
    round.matches.forEach(m => {
      if (m.bye || m.resolved || !m.started) return;
      const home = teamOf(m.home), away = teamOf(m.away);
      const r = m.result;
      if (!m.statsRecorded && home && away && !r.forfeit) {
        Engine.recordMatchStatsAndAwardMvp(home, away, round.index, "cup", kickoff, r.quarterScores, r.tacticsUsed, r.seed);
      }
      m.statsRecorded = true;
      const totalHome = r.scoreHome + (r.forfeit ? 0 : m.handicap.home);
      const totalAway = r.scoreAway + (r.forfeit ? 0 : m.handicap.away);
      m.winner = totalAway > totalHome ? "away" : "home";
      m.resolved = true;
      const winTeam = m.winner === "home" ? home : away;
      if (winTeam) {
        if (typeof Engine.applySponsorWinPrimes === "function") Engine.applySponsorWinPrimes(winTeam);
        Engine.payCupWinBonus(winTeam, round.stageFromEnd);
      }
      // Diffusions retirées, fil d'actualité des managers.
      [[home, m.home, away, true, totalHome, totalAway], [away, m.away, home, false, totalAway, totalHome]].forEach(([team, ref, opp, isHome, pf, pa]) => {
        if (!team) return;
        const lg = leagues.get(ref.leagueId);
        if (lg && lg.liveMatches) { LiveMatch.archiveReplay(lg, liveKey(cup, round, m)); delete lg.liveMatches[liveKey(cup, round, m)]; }
        if (team.isHuman && team.feed && opp) {
          Engine.handleGameEvent(team.feed, {
            type: "match_played", week: team.week, matchId: `ncup:${cup.season}:${round.index}:${m.id}`,
            opponent: opp.name, home: isHome, pointsFor: pf, pointsAgainst: pa, topScorer: null,
          }, { clubName: team.name });
        }
      });
    });
    events.push({ type: "national-cup-round", country: cup.country, season: cup.season, round: round.index, stage: stageKey(round.stageFromEnd) });
    advance(cup);
    if (cup.champion) {
      const champ = teamOf(cup.champion);
      events.push({ type: "national-cup-champion", country: cup.country, season: cup.season, champion: cup.champion.name });
      if (champ) addTrophy(champ, leagues.get(cup.champion.leagueId), "national-cup", `Vainqueur de la Coupe nationale (${countryName(cup.country)})`, now);
      if (champ && champ.isHuman && typeof Engine.unlockAchievement === "function") Engine.unlockAchievement(champ, "cupWinner", cup.season, now);
      if (champ && champ.isHuman && champ.feed) {
        Engine.pushEntry(champ.feed, {
          key: `ncup_champion_${cup.season}`, category: "ligue", week: champ.week, createdAt: now,
          title: "Vainqueur de la Coupe nationale !",
          text: `${champ.name} remporte la Coupe nationale (saison ${cup.season}).`,
          action: { label: "Coupe", href: "/coupe" },
        });
      }
    }
  }
  return events;
}

// =====================================================================
// SUPERCOUPE (retour utilisateur 2026-09-28 : « supercoupes », Division I
// seulement) : le samedi 20:00 (heure locale) de la semaine d'intersaison,
// champion de Division I (play-offs) contre vainqueur de la Coupe nationale
// — ou le finaliste si c'est le même club. Match sec, en direct, handicap
// comme en Coupe, prime au vainqueur, trophée. world.superCups[country] :
//   { country, season, at, home: ref, away: ref, handicap, started, result,
//     winner: "home"|"away"|null, resolved }
// Côté ligues : même mécanique de diffusion que la Coupe (competition
// "cup", tour SUPERCUP_ROUND, club invité 100 + SUPERCUP_ROUND).
// =====================================================================
const SUPERCUP_ROUND = 99;
const SUPERCUP_WIN_BONUS = 200000;

function superCupKickoff(Calendar, restartAt, timeZone) {
  // Samedi précédant la reprise (lundi 6h Paris = lundi 0h à New York) : la
  // date locale de « reprise − 2 jours » est ce samedi dans les deux pays.
  const parts = Calendar.zonedLocalDateParts(restartAt - 2 * 24 * 3600 * 1000, timeZone || "Europe/Paris");
  return Calendar.zonedEpochForLocalTime(timeZone || "Europe/Paris", parts.year, parts.month, parts.day, Calendar.WEEKLY_RHYTHM_MATCH_HOUR || 20);
}

// Finaliste malheureux de la Coupe (perdant de la finale).
function cupFinalist(cup) {
  const last = cup && cup.rounds[cup.rounds.length - 1];
  const m = last && last.matches.length === 1 ? last.matches[0] : null;
  if (!m || !m.resolved || m.bye) return null;
  return m.winner === "home" ? m.away : m.home;
}

function createSuperCup(country, season, d1Entry, d1League, cup, at) {
  if (!d1League || !d1League.playoffs || d1League.playoffs.champion == null) return null;
  if (!cup || cup.season !== season || !cup.champion) return null;
  const idx = d1League.playoffs.champion;
  const home = { leagueId: d1Entry.id, idx, name: d1League.teams[idx].name, level: d1Entry.level || 1 };
  let away = cup.champion;
  if (away.leagueId === home.leagueId && away.idx === home.idx) away = cupFinalist(cup);
  if (!away) return null;
  return {
    country, season, at, home, away: { ...away }, handicap: handicapFor(home, away),
    started: false, result: null, winner: null, resolved: false,
  };
}

function superCupLiveKey(sc) { return `scup:${sc.season}`; }

function stepSuperCup({ Engine, LiveMatch, Calendar }, sc, leagues, now, events = []) {
  if (!sc || sc.resolved || now < sc.at) return events;
  const teamOf = ref => { const lg = leagues.get(ref.leagueId); return lg ? lg.teams[ref.idx] : null; };
  const home = teamOf(sc.home), away = teamOf(sc.away);
  const windowEnd = sc.at + Calendar.MATCH_BROADCAST_DURATION_MS;
  const late = now >= windowEnd;
  if (!sc.started) {
    if (!home || !away) {
      sc.result = { scoreHome: home ? Engine.FORFEIT_SCORE : 0, scoreAway: away ? Engine.FORFEIT_SCORE : 0, forfeit: true, quarterScores: null };
    } else if ((home.isHuman || away.isHuman) && !late) {
      const live = LiveMatch.computeLiveMatchForTeams(Engine, home, away, SUPERCUP_ROUND, sc.home.idx, sc.away.idx, sc.at, "cup");
      sc.result = { scoreHome: live.finalScore.home, scoreAway: live.finalScore.away, forfeit: live.forfeit, quarterScores: live.quarterScores, tacticsUsed: live.tacticsUsed || null, seed: live.seed };
      [["home", home, sc.home, away, sc.away], ["away", away, sc.away, home, sc.home]].forEach(([side, team, ref, opp, oppRef]) => {
        if (!team.isHuman) return;
        const lg = leagues.get(ref.leagueId);
        if (!lg) return;
        if (!lg.liveMatches) lg.liveMatches = {};
        const sameLeague = oppRef.leagueId === ref.leagueId;
        const oppIdx = sameLeague ? oppRef.idx : guestIdxForRound(SUPERCUP_ROUND);
        lg.liveMatches[superCupLiveKey(sc)] = {
          ...withHandicap(live, sc.handicap),
          homeIdx: side === "home" ? ref.idx : oppIdx,
          awayIdx: side === "away" ? ref.idx : oppIdx,
          handicap: sc.handicap,
          nationalCup: { season: sc.season, round: SUPERCUP_ROUND, superCup: true },
          guest: sameLeague ? null : guestForTeam(Engine, opp, oppRef),
        };
      });
    } else {
      const sim = Engine.simulateOrForfeit(home, away, sc.at);
      sc.result = { scoreHome: sim.scoreHome, scoreAway: sim.scoreAway, forfeit: sim.forfeit, quarterScores: sim.quarterScores || null, tacticsUsed: sim.tacticsUsed || null, seed: sim.seed };
      // Stats des joueurs (journal de matchs, feuille de match) : comme un
      // match de Coupe, tour SUPERCUP_ROUND (libellé « Supercoupe »).
      if (!sim.forfeit) Engine.recordMatchStatsAndAwardMvp(home, away, SUPERCUP_ROUND, "cup", sc.at, sc.result.quarterScores, sc.result.tacticsUsed, sc.result.seed);
      sc.statsRecorded = true;
    }
    sc.started = true;
    events.push({ type: "super-cup-kickoff", country: sc.country, season: sc.season });
  }
  if (now < windowEnd) return events;
  const r = sc.result;
  // Direct terminé : stats des joueurs enregistrées (2026-09-30, retour
  // utilisateur : « stats des joueurs de la Supercoupe », comme la Coupe).
  if (!sc.statsRecorded && home && away && !r.forfeit) {
    Engine.recordMatchStatsAndAwardMvp(home, away, SUPERCUP_ROUND, "cup", sc.at, r.quarterScores, r.tacticsUsed || null, r.seed);
  }
  sc.statsRecorded = true;
  const totalHome = r.scoreHome + (r.forfeit ? 0 : sc.handicap.home);
  const totalAway = r.scoreAway + (r.forfeit ? 0 : sc.handicap.away);
  sc.winner = totalAway > totalHome ? "away" : "home";
  sc.resolved = true;
  const winRef = sc.winner === "home" ? sc.home : sc.away;
  const winTeam = sc.winner === "home" ? home : away;
  if (winTeam) {
    if (winTeam.isHuman && typeof winTeam.recordTransaction === "function") {
      winTeam.recordTransaction("Prime de Supercoupe", SUPERCUP_WIN_BONUS);
    }
    addTrophy(winTeam, leagues.get(winRef.leagueId), "super-cup", `Vainqueur de la Supercoupe (${countryName(sc.country)})`, now);
    if (winTeam.isHuman && typeof Engine.unlockAchievement === "function") Engine.unlockAchievement(winTeam, "superCup", sc.season, now);
  }
  [[home, sc.home, away, true, totalHome, totalAway], [away, sc.away, home, false, totalAway, totalHome]].forEach(([team, ref, opp, isHome, pf, pa]) => {
    if (!team) return;
    const lg = leagues.get(ref.leagueId);
    if (lg && lg.liveMatches) { LiveMatch.archiveReplay(lg, superCupLiveKey(sc)); delete lg.liveMatches[superCupLiveKey(sc)]; }
    if (team.isHuman && team.feed && opp) {
      Engine.pushEntry(team.feed, {
        key: `scup_${sc.season}_${ref.leagueId}_${ref.idx}`, category: "ligue", week: team.week, createdAt: now,
        title: pf > pa ? "Supercoupe remportée !" : "Supercoupe perdue",
        text: `Supercoupe : ${isHome ? `${team.name} ${pf}-${pa} ${opp.name}` : `${opp.name} ${pa}-${pf} ${team.name}`}${pf > pa ? `. Prime de ${SUPERCUP_WIN_BONUS.toLocaleString("fr-FR")} €.` : "."}`,
        action: { label: "Coupe", href: "/coupe" },
      });
    }
  });
  events.push({ type: "super-cup-winner", country: sc.country, season: sc.season, winner: winRef.name });
  return events;
}

// Vue de la Supercoupe pour la ligue d'un manager (sauvegarde) : noms,
// niveaux, index local (club de la ligue) ou invité, score handicap compris.
async function projectSuperCup(Engine, sc, leagueId, teamIdx, loadTeam) {
  if (!sc) return null;
  const mine = ref => ref && ref.leagueId === leagueId && ref.idx === teamIdx;
  const local = ref => (ref.leagueId === leagueId ? ref.idx : guestIdxForRound(SUPERCUP_ROUND));
  const isMine = mine(sc.home) || mine(sc.away);
  const r = sc.result;
  const view = {
    season: sc.season, at: sc.at, round: SUPERCUP_ROUND, mine: isMine,
    home: { name: sc.home.name, level: sc.home.level, leagueId: sc.home.leagueId, refIdx: sc.home.idx, idx: isMine ? local(sc.home) : (sc.home.leagueId === leagueId ? sc.home.idx : null) },
    away: { name: sc.away.name, level: sc.away.level, leagueId: sc.away.leagueId, refIdx: sc.away.idx, idx: isMine ? local(sc.away) : (sc.away.leagueId === leagueId ? sc.away.idx : null) },
    handicap: sc.handicap, started: sc.started, resolved: sc.resolved,
    score: sc.resolved && r ? { home: r.scoreHome + (r.forfeit ? 0 : sc.handicap.home), away: r.scoreAway + (r.forfeit ? 0 : sc.handicap.away) } : null,
    winner: sc.resolved ? sc.winner : null,
  };
  let guest = null;
  if (isMine) {
    const oppRef = mine(sc.home) ? sc.away : sc.home;
    if (oppRef.leagueId !== leagueId) {
      const team = await loadTeam(oppRef);
      if (team) guest = { ...guestForTeam(Engine, team, oppRef), localIdx: guestIdxForRound(SUPERCUP_ROUND), name: oppRef.name };
    }
  }
  return { superCup: view, guest };
}

// Vue d'un manager (navigateur) : son parcours et le tour en cours, avec les
// clubs invités de ses matchs contre un autre championnat.
function viewForTeam(Engine, cup, leagues, leagueId, teamIdx) {
  if (!cup) return null;
  const mine = ref => ref && ref.leagueId === leagueId && ref.idx === teamIdx;
  const teamOf = ref => { const lg = leagues.get(ref.leagueId); return lg ? lg.teams[ref.idx] : null; };
  const path = [];
  cup.rounds.forEach(r => {
    const m = r.matches.find(x => mine(x.home) || mine(x.away));
    if (!m) return;
    const isHome = mine(m.home);
    const oppRef = isHome ? m.away : m.home;
    const entry = {
      round: r.index, stageFromEnd: r.stageFromEnd, stage: stageKey(r.stageFromEnd), label: stageLabel(r.stageFromEnd),
      matchId: m.id, bye: m.bye, isHome, resolved: m.resolved, started: m.started,
      opponent: oppRef ? { name: oppRef.name, leagueId: oppRef.leagueId, level: oppRef.level, sameLeague: oppRef.leagueId === leagueId, idx: oppRef.leagueId === leagueId ? oppRef.idx : guestIdxForRound(r.index) } : null,
      handicap: isHome ? m.handicap.home : m.handicap.away,
      oppHandicap: isHome ? m.handicap.away : m.handicap.home,
      score: m.resolved && m.result ? { pf: (isHome ? m.result.scoreHome : m.result.scoreAway), pa: (isHome ? m.result.scoreAway : m.result.scoreHome) } : null,
      won: m.resolved ? (m.winner === (isHome ? "home" : "away")) : null,
    };
    if (!m.resolved && oppRef && oppRef.leagueId !== leagueId) {
      const opp = teamOf(oppRef);
      if (opp) entry.guest = guestForTeam(Engine, opp, oppRef);
    }
    path.push(entry);
  });
  return {
    country: cup.country, season: cup.season, totalRounds: cup.totalRounds,
    champion: cup.champion ? cup.champion.name : null,
    rounds: cup.rounds.map(r => ({
      index: r.index, stage: stageKey(r.stageFromEnd), label: stageLabel(r.stageFromEnd), resolved: r.resolved,
      matchCount: r.matches.filter(m => !m.bye).length, byes: r.matches.filter(m => m.bye).length,
    })),
    path,
  };
}

// Projection de la Coupe nationale dans la ligue d'un manager (sauvegarde
// envoyée au navigateur, GET /api/save) : même forme que la Coupe interne
// (league.cup : rounds[{ index, name, dayIndex, matches[{ home, away,
// scoreHome, scoreAway, winner, resolved, bye }] }]) pour que Calendrier,
// Ordres, fiche de match et statistiques fonctionnent tels quels, mais avec
// SEULEMENT le match du club à chaque tour ; l'adversaire d'un autre
// championnat y est un club invité (guestIdxForRound). Scores = score
// officiel, handicap compris. `loadTeam(ref)` renvoie le Team d'une
// référence (ou null) ; seuls les invités des tours où le club joue sont
// chargés.
async function projectForLeague(Engine, cup, leagueId, teamIdx, loadTeam) {
  if (!cup) return null;
  const mine = ref => ref && ref.leagueId === leagueId && ref.idx === teamIdx;
  const local = (ref, roundIndex) => (ref.leagueId === leagueId ? ref.idx : guestIdxForRound(roundIndex));
  const guests = [];
  const rounds = [];
  for (const r of cup.rounds) {
    const m = r.matches.find(x => mine(x.home) || mine(x.away));
    const base = { index: r.index, name: stageKey(r.stageFromEnd), label: stageLabel(r.stageFromEnd), stageFromEnd: r.stageFromEnd, dayIndex: r.index, resolved: r.resolved, matchCount: r.matches.filter(x => !x.bye).length, byes: r.matches.filter(x => x.bye).length, matches: [] };
    rounds.push(base);
    if (!m) continue;
    const home = local(m.home, r.index);
    const away = m.away ? local(m.away, r.index) : null;
    const withHc = (s, side) => s + (m.result && m.result.forfeit ? 0 : m.handicap[side]);
    const pm = {
      home, away, bye: !!m.bye, resolved: !!m.resolved,
      // Clé de la diffusion (liveKey sans la saison) : « Revoir le direct »
      // retrouve ce match même contre un club invité (voir /api/replay).
      replayKey: `ncup:${cup.season}:${r.index}:${m.id}`,
      scoreHome: m.resolved && m.result ? withHc(m.result.scoreHome, "home") : null,
      scoreAway: m.resolved && m.result ? withHc(m.result.scoreAway, "away") : null,
      forfeit: m.result ? !!m.result.forfeit : null,
      quarterScores: m.result ? m.result.quarterScores || null : null,
      winner: m.bye ? home : (m.resolved ? (m.winner === "away" ? away : home) : null),
      handicapHome: m.handicap.home, handicapAway: m.handicap.away,
      homeLevel: m.home.level, awayLevel: m.away ? m.away.level : null,
    };
    base.matches.push(pm);
    const oppRef = m.bye ? null : (mine(m.home) ? m.away : m.home);
    if (oppRef && oppRef.leagueId !== leagueId) {
      const team = await loadTeam(oppRef);
      const g = team ? guestForTeam(Engine, team, oppRef) : { leagueId: oppRef.leagueId, idx: oppRef.idx, level: oppRef.level, team: null };
      guests.push({ ...g, localIdx: guestIdxForRound(r.index), name: oppRef.name });
    }
  }
  const champ = cup.champion;
  return {
    cup: {
      national: true, country: cup.country, season: cup.season, totalRounds: cup.totalRounds,
      champion: champ ? (mine(champ) ? teamIdx : (champ.leagueId === leagueId ? champ.idx : null)) : null,
      championName: champ ? champ.name : null,
      rounds,
    },
    guests,
  };
}

// Vue minimale (côté serveur, non sauvegardée) du tour en attente pour un
// club : sert à valider les ordres préparés d'un tour de Coupe nationale
// (server/actions.js:isValidFutureCupRoundForTeam, verrou T − 5 min).
function pendingViewFor(cup, leagueId, teamIdx) {
  const r = pendingRound(cup);
  if (!r) return null;
  const mine = ref => ref && ref.leagueId === leagueId && ref.idx === teamIdx;
  const m = r.matches.find(x => mine(x.home) || mine(x.away));
  const local = ref => (ref && ref.leagueId === leagueId ? ref.idx : guestIdxForRound(r.index));
  return {
    index: r.index, dayIndex: r.index, resolved: false,
    matches: m ? [{ home: local(m.home), away: m.away ? local(m.away) : null, bye: !!m.bye, resolved: !!m.resolved || !!m.started }] : [],
  };
}

// Clubs encore en course, par championnat : { leagueId: { season,
// nextRound, totalRounds, teams: [idx] } } (voir League.nationalCupAlive,
// utilisé par server/friendlies.js pour réserver les jeudis de Coupe).
function aliveByLeague(cup) {
  const out = {};
  const r = pendingRound(cup);
  if (!r) return out;
  r.matches.forEach(m => [m.home, m.away].forEach(ref => {
    if (!ref) return;
    const e = out[ref.leagueId] || (out[ref.leagueId] = { season: cup.season, nextRound: r.index, totalRounds: cup.totalRounds, teams: [] });
    if (!e.teams.includes(ref.idx)) e.teams.push(ref.idx);
  }));
  return out;
}

// Matchs d'un tour (page Coupe, pagination côté serveur).
function roundMatches(cup, roundIndex, { offset = 0, limit = 40, q = "", pendingOnly = false, first = null } = {}) {
  const r = cup && cup.rounds[roundIndex];
  if (!r) return null;
  const needle = String(q || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const isFirst = ref => !!(first && ref && ref.leagueId === first.leagueId && ref.idx === first.idx);
  const real = r.matches.filter(m => !m.bye);
  let list = real.map(m => ({
    id: m.id, bye: m.bye, home: m.home && { name: m.home.name, level: m.home.level, leagueId: m.home.leagueId, idx: m.home.idx },
    away: m.away && { name: m.away.name, level: m.away.level, leagueId: m.away.leagueId, idx: m.away.idx },
    handicap: m.handicap, resolved: m.resolved, started: !!m.started, mine: isFirst(m.home) || isFirst(m.away),
    score: m.resolved && m.result ? { home: m.result.scoreHome + (m.result.forfeit ? 0 : m.handicap.home), away: m.result.scoreAway + (m.result.forfeit ? 0 : m.handicap.away) } : null,
    winner: m.resolved ? m.winner : null,
  }));
  if (pendingOnly) list = list.filter(m => !m.resolved);
  if (needle) list = list.filter(m => norm(m.home && m.home.name).includes(needle) || norm(m.away && m.away.name).includes(needle));
  list = list.filter(m => m.mine).concat(list.filter(m => !m.mine));
  return {
    index: r.index, stage: stageKey(r.stageFromEnd), label: stageLabel(r.stageFromEnd), resolved: r.resolved,
    total: list.length, byes: r.matches.length - real.length, matches: list.slice(offset, offset + limit),
  };
}

module.exports = {
  NATIONAL_CUP_MAX_CLUBS, NATIONAL_CUP_HANDICAP_PER_DIVISION, NATIONAL_CUP_HANDICAP_MAX, NATIONAL_CUP_GUEST_IDX,
  SUPERCUP_ROUND, SUPERCUP_WIN_BONUS, superCupKickoff, cupFinalist, createSuperCup, stepSuperCup, projectSuperCup, superCupLiveKey,
  aliveByLeague, guestIdxForRound, withHandicap, projectForLeague, pendingViewFor, makeMatch,
  stageKey, stageLabel, handicapFor, createNationalCup, pendingRound, advance, liveKey, guestForTeam, step, viewForTeam, roundMatches,
};
