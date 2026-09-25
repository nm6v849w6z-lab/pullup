// =====================================================================
// SCOUTING PRO — retour utilisateur (2026-09) : "analyse des équipes
// adverses (« Scouting Pro ») en mode payant + accès gratuit via pub
// récompensée [...] Pour tout ce qui est pub. Pour le moment mets un écran
// gris avec pub. On connectera comme il faut plus tard."
//
// Ce module NE remplace PAS le rapport tactique déjà existant et déjà
// gratuit (voir tacticalReportHtml/computeScoutingTendencies côté
// navigateur, moteurbasket3.html) : il ajoute un DEUXIÈME rapport, plus
// complet, gagné soit en "regardant" une pub factice (écran gris, voir
// POST /api/scouting/ad-ticket puis /api/scouting/ad-complete côté
// server/index.js), soit via `team.scoutingPremium` (bouton "Passer Pro"
// factice, AUCUN paiement réel tant qu'aucune régie publicitaire/plateforme
// de paiement n'est branchée — voir le grand commentaire de
// Team.constructor dans engine.js).
//
// Portée v1 (cadrage 2026-09, voir DEV_NOTES.md) : forme récente, bilan
// domicile/extérieur, séries, historique des confrontations, zones de tir
// (intérieur/mi-distance/3 points — PAS de heatmap spatiale), joueurs clés
// (forme/blessure du moment), classement simplifié. EXCLUS explicitement de
// v1 (retour utilisateur) : efficacité par type d'action (aucune donnée de
// ce type dans le moteur), +/- par combinaison de 5 joueurs (les
// événements bruts d'un match sont jetés à sa finalisation, voir
// server/liveMatch.js:finalizeRound, donc irrécupérable après coup).
//
// Module Node uniquement (comme server/liveMatch.js) : calculé à la demande
// à chaque requête à partir de la ligue déjà chargée en mémoire, jamais mis
// en cache séparément.
// =====================================================================
const Engine = require("../engine.js");

// Nombre maximum de pubs (factices) qu'un club peut "regarder" par MOIS
// civil à Paris. Était 3 par jour ; retour utilisateur (2026-09-25) : "on
// va enlever le mode gratuit dans l'analyse, si on est pas pro et qu'on
// clique dessus, on doit avoir un bouton regarder la pub et accéder au
// contenu / on ne doit pouvoir le faire qu'une fois par mois". Mois CIVIL
// (du 1er au dernier jour, heure de Paris), pas 30 jours glissants.
const MONTHLY_AD_UNLOCK_CAP = 1;

// Clé "année-mois" du mois civil à Paris de `ms` (ex. "2026-9").
function parisMonthKey(ms) {
  const d = new Date(Engine.parisCalendarDayIndex(ms));
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
}

// Premier jour du mois civil suivant (Paris), en ms "minuit UTC" du triplet
// année/mois/jour — sert uniquement à afficher "prochaine pub le 1er ...".
function nextParisMonthStart(ms) {
  const d = new Date(Engine.parisCalendarDayIndex(ms));
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

function fail(error) {
  return { ok: false, error };
}

function validOpponentIdx(league, teamIndex, opponentIdx) {
  return Number.isInteger(opponentIdx) && opponentIdx >= 0 && opponentIdx < league.teams.length && opponentIdx !== teamIndex;
}

// Combien de pubs ce club a déjà "regardé" CE MOIS-CI (mois civil Paris) —
// recalculé à la demande depuis scoutingAdWatchLog (voir Team.constructor),
// jamais un compteur séparé qui pourrait diverger.
function adsWatchedThisMonth(team, now) {
  const key = parisMonthKey(now);
  return (team.scoutingAdWatchLog || []).filter(ts => parisMonthKey(ts) === key).length;
}

// Nombre de matchs déjà comptés dans le matchLog de `opponent` cette saison
// (même façon de compter que computeScoutingTendencies côté navigateur,
// voir moteurbasket3.html — un jeu de clés round|competition uniques,
// jamais un simple .length qui compterait chaque JOUEUR séparément).
function gamesPlayedFor(team) {
  const keys = new Set();
  team.players.forEach(p => {
    (p.matchLog || []).forEach(m => keys.add(`${m.round}|${m.competition}`));
  });
  return keys.size;
}

// Statut d'accès de `teamIndex` au rapport Pro de `opponentIdx` : verrouillé,
// débloqué (encore à jour), ou périmé (l'adversaire a rejoué depuis) — voir
// le grand commentaire de Team.scoutingUnlocks dans engine.js pour le choix
// de péremption "données changées" plutôt que "délai/horaire figé".
function getScoutingAccess(league, teamIndex, opponentIdx, now = Date.now()) {
  const team = league.teams[teamIndex];
  const opponent = league.teams[opponentIdx];
  if (!team || !opponent) return fail("Équipe ou adversaire invalide.");
  const premium = !!team.scoutingPremium;
  const unlock = (team.scoutingUnlocks || {})[opponentIdx];
  const currentGames = gamesPlayedFor(opponent);
  const stale = !!unlock && typeof unlock.gamesPlayedAtUnlock === "number" && unlock.gamesPlayedAtUnlock !== currentGames;
  const unlocked = !!unlock && !stale;
  const adsMonth = adsWatchedThisMonth(team, now);
  return {
    ok: true,
    opponentIdx,
    level: premium || unlocked ? "full" : "locked",
    premium,
    unlocked,
    stale,
    unlockedAt: unlock ? unlock.unlockedAt : null,
    unlockedSource: unlock ? unlock.source : null,
    adsWatchedThisMonth: adsMonth,
    adsRemainingThisMonth: Math.max(0, MONTHLY_AD_UNLOCK_CAP - adsMonth),
    monthlyCap: MONTHLY_AD_UNLOCK_CAP,
    nextAdAvailableAt: nextParisMonthStart(now),
  };
}

// Crée un ticket de pub (factice) pour `opponentIdx` — refusé si Premium
// (inutile, tout est déjà débloqué), déjà débloqué et à jour (rien à
// gagner), ou quota quotidien déjà atteint. Le ticket lui-même ne débloque
// RIEN — voir completeAdTicket plus bas, appelé seulement après le décompte
// de l'écran gris côté client.
function createAdTicket(league, teamIndex, opponentIdx, now = Date.now()) {
  const team = league.teams[teamIndex];
  if (!team) return fail("Équipe invalide.");
  if (!validOpponentIdx(league, teamIndex, opponentIdx)) return fail("Adversaire invalide.");
  if (team.scoutingPremium) return fail("Déjà Premium : aucune pub nécessaire.");
  const access = getScoutingAccess(league, teamIndex, opponentIdx, now);
  if (access.unlocked) return fail("Ce rapport est déjà débloqué et à jour.");
  if (adsWatchedThisMonth(team, now) >= MONTHLY_AD_UNLOCK_CAP) {
    return fail("Pub gratuite déjà utilisée ce mois-ci. Revenez le mois prochain, ou passez Pro.");
  }
  const ticketId = Engine.randomHexToken(12);
  team.scoutingAdTickets = team.scoutingAdTickets || {};
  team.scoutingAdTickets[ticketId] = { opponentIdx, createdAt: now };
  return { ok: true, ticketId, opponentIdx };
}

// Complète un ticket de pub déjà créé — IDEMPOTENT (un ticket est supprimé
// dès sa première complétion, une deuxième tentative avec le même id échoue
// proprement plutôt que de recréditer le quota une deuxième fois). Un
// contrôle serveur minimal, pas une vraie vérification SSV (Server-Side
// Verification d'un vrai SDK de pub) : voir le grand commentaire en tête de
// fichier, "on connectera comme il faut plus tard".
function completeAdTicket(league, teamIndex, ticketId, now = Date.now()) {
  const team = league.teams[teamIndex];
  if (!team) return fail("Équipe invalide.");
  const ticket = team.scoutingAdTickets && team.scoutingAdTickets[ticketId];
  if (!ticket) return fail("Ticket de pub inconnu, déjà utilisé, ou expiré.");
  delete team.scoutingAdTickets[ticketId];
  const opponent = league.teams[ticket.opponentIdx];
  if (!opponent) return fail("Adversaire invalide.");
  team.scoutingAdWatchLog = team.scoutingAdWatchLog || [];
  team.scoutingAdWatchLog.push(now);
  team.scoutingUnlocks = team.scoutingUnlocks || {};
  team.scoutingUnlocks[ticket.opponentIdx] = {
    level: "full", unlockedAt: now, source: "ad", gamesPlayedAtUnlock: gamesPlayedFor(opponent),
  };
  return { ok: true, opponentIdx: ticket.opponentIdx };
}

// Bouton "Passer Pro" factice (voir Team.constructor/le grand commentaire en
// tête de fichier) : bascule dev UNIQUEMENT, aucun paiement réel.
function setPremium(team, premium) {
  team.scoutingPremium = !!premium;
  return { ok: true, premium: team.scoutingPremium };
}

// Agrège les tirs de `team` par zone (intérieur/mi-distance/3 points) sur
// tout le matchLog déjà persisté — retour utilisateur (2026-09) : "La
// heatmap doit se résumer à tire à 3 points/mi distance/interieur", PAS une
// heatmap spatiale (aucune coordonnée de tir n'existe dans le moteur). Le
// mi-distance est dérivé (fga2 - paintAtt / fgm2 - paintMade, voir
// Player.emptyStats côté moteur) : AUCUN nouveau champ moteur nécessaire.
function aggregateShotZones(team) {
  const z = { inside: { att: 0, made: 0 }, mid: { att: 0, made: 0 }, three: { att: 0, made: 0 } };
  team.players.forEach(p => {
    (p.matchLog || []).forEach(m => {
      const paintAtt = m.paintAtt || 0, paintMade = m.paintMade || 0;
      const fga2 = m.fga2 || 0, fgm2 = m.fgm2 || 0;
      z.inside.att += paintAtt; z.inside.made += paintMade;
      z.mid.att += Math.max(0, fga2 - paintAtt); z.mid.made += Math.max(0, fgm2 - paintMade);
      z.three.att += m.fga3 || 0; z.three.made += m.fgm3 || 0;
    });
  });
  const totalAtt = z.inside.att + z.mid.att + z.three.att;
  const zoneStats = key => ({
    attempts: z[key].att,
    made: z[key].made,
    sharePct: totalAtt > 0 ? Math.round((z[key].att / totalAtt) * 100) : null,
    fgPct: z[key].att > 0 ? Math.round((z[key].made / z[key].att) * 100) : null,
  });
  return { inside: zoneStats("inside"), mid: zoneStats("mid"), three: zoneStats("three"), totalAttempts: totalAtt };
}

// Fréquence d'utilisation des tactiques offensive/défensive/rythme de
// `team`, sur tout le matchLog déjà persisté — retour utilisateur (2026-09,
// captures d'écran d'un autre jeu type BuzzerBeater) : "Graphiques
// stratégies offensive/défensive". S'appuie sur `tacticsUsed`, le
// "instantané" capturé au moment RÉEL de la simulation de chaque match (voir
// Engine.tacticsSnapshotFor/simulateOrForfeit/computeLiveMatch et le grand
// commentaire de recordMatchStatsForTeam) — jamais les réglages ACTUELS de
// l'équipe (`team.defense`/`team.offensivePriorities`/`team.rhythm`), qui
// ont pu changer depuis.
// `tacticsUsed` est stocké sur CHAQUE joueur de l'équipe (Player.matchLog),
// une fois par match — dédoublonne donc par (competition, round) pour ne
// compter chaque match qu'une seule fois, peu importe combien de joueurs de
// l'effectif ont une entrée de matchLog ce jour-là (rotation, blessures...).
// Ignore les matchs forfait (jamais de matchLog créé, voir finalizeRound —
// `tacticsUsed` n'existe donc que pour des matchs réellement simulés) et les
// entrées anciennes, antérieures à cette fonctionnalité, où `tacticsUsed`
// vaut `null` (aucun instantané n'existait encore).
function aggregateStrategyUsage(team) {
  const seen = new Map(); // `${competition}|${round}` -> tacticsUsed
  team.players.forEach(p => {
    (p.matchLog || []).forEach(m => {
      if (!m.tacticsUsed) return;
      const key = `${m.competition}|${m.round}`;
      if (!seen.has(key)) seen.set(key, m.tacticsUsed);
    });
  });

  const tally = (pick) => {
    const counts = {};
    seen.forEach(t => {
      const val = pick(t);
      if (!val) return;
      counts[val] = (counts[val] || 0) + 1;
    });
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
  };

  return {
    totalMatches: seen.size,
    defense: tally(t => t.defense),
    offense: tally(t => t.offense),
    rhythm: tally(t => t.rhythm),
  };
}

// Forme récente/bilan domicile-extérieur/série en cours/historique des
// confrontations — tous calculés depuis league.results (championnat
// uniquement, voir League.recordResult/standings côté moteur : la Coupe ne
// tient pas ce même registre à plat, hors scope v1, voir DEV_NOTES.md).
function recentFormFor(league, teamIdx, limit = 5) {
  const games = league.results
    .filter(r => r.home === teamIdx || r.away === teamIdx)
    .sort((a, b) => b.round - a.round);
  return games.slice(0, limit).map(r => {
    const isHome = r.home === teamIdx;
    const scoreFor = isHome ? r.scoreHome : r.scoreAway;
    const scoreAgainst = isHome ? r.scoreAway : r.scoreHome;
    const opponentIdx = isHome ? r.away : r.home;
    return {
      round: r.round, isHome, opponentIdx,
      opponentName: league.teams[opponentIdx] ? league.teams[opponentIdx].name : "?",
      scoreFor, scoreAgainst, win: scoreFor > scoreAgainst,
    };
  });
}

function homeAwayRecordFor(league, teamIdx) {
  const rec = { home: { wins: 0, losses: 0 }, away: { wins: 0, losses: 0 } };
  league.results.forEach(r => {
    if (r.home === teamIdx) {
      if (r.scoreHome > r.scoreAway) rec.home.wins++; else rec.home.losses++;
    } else if (r.away === teamIdx) {
      if (r.scoreAway > r.scoreHome) rec.away.wins++; else rec.away.losses++;
    }
  });
  return rec;
}

// Série en cours (victoires OU défaites consécutives), la plus récente
// journée en premier — s'arrête dès le premier résultat qui rompt la série.
function streakFor(league, teamIdx) {
  const games = league.results
    .filter(r => r.home === teamIdx || r.away === teamIdx)
    .sort((a, b) => b.round - a.round);
  if (!games.length) return { type: null, length: 0 };
  const winAt = r => (r.home === teamIdx ? r.scoreHome > r.scoreAway : r.scoreAway > r.scoreHome);
  const firstWin = winAt(games[0]);
  let length = 0;
  for (const g of games) {
    if (winAt(g) !== firstWin) break;
    length++;
  }
  return { type: firstWin ? "W" : "L", length };
}

function headToHeadFor(league, teamIdx, opponentIdx) {
  return league.results
    .filter(r => (r.home === teamIdx && r.away === opponentIdx) || (r.away === teamIdx && r.home === opponentIdx))
    .sort((a, b) => b.round - a.round)
    .map(r => {
      const isHome = r.home === teamIdx;
      const scoreFor = isHome ? r.scoreHome : r.scoreAway;
      const scoreAgainst = isHome ? r.scoreAway : r.scoreHome;
      return { round: r.round, isHome, scoreFor, scoreAgainst, win: scoreFor > scoreAgainst };
    });
}

// Meilleurs marqueurs de la saison (moyenne pts/match sur le matchLog déjà
// persisté), avec leur état de forme physique/blessure ACTUEL (pas figé au
// matchLog — voir Player.condition/injuryType/injuryUntil côté moteur,
// snapshot pris à la demande comme le reste de ce rapport).
function keyPlayersFor(team, now, limit = 3) {
  const rows = team.players.map(p => {
    const log = p.matchLog || [];
    const games = log.length;
    const totalPts = log.reduce((s, m) => s + (m.pts || 0), 0);
    const totalReb = log.reduce((s, m) => s + (m.reb || 0), 0);
    const totalAst = log.reduce((s, m) => s + (m.ast || 0), 0);
    const injured = !!(p.injuryUntil && p.injuryUntil > now);
    return {
      // `id` (retour utilisateur, 2026-09-24 : "rebosse ça [...] regarde
      // comment c'est sur football manager") : nécessaire côté client pour
      // générer l'avatar du joueur (playerAvatarHtml, indexé par id) dans la
      // nouvelle présentation en carte "meilleurs marqueurs" — absent avant
      // cette fonctionnalité, aucun consommateur existant n'en dépendait.
      id: p.id, name: p.name, position: p.position, games,
      ppg: games ? Math.round((totalPts / games) * 10) / 10 : 0,
      rpg: games ? Math.round((totalReb / games) * 10) / 10 : 0,
      apg: games ? Math.round((totalAst / games) * 10) / 10 : 0,
      condition: typeof p.condition === "number" ? p.condition : null,
      injured, injuryReturnAt: injured ? p.injuryUntil : null,
    };
  }).filter(r => r.games > 0);
  rows.sort((a, b) => b.ppg - a.ppg);
  return rows.slice(0, limit);
}

function standingFor(league, teamIdx) {
  const table = league.standings();
  const row = table.find(r => r.idx === teamIdx);
  if (!row) return null;
  return { rank: table.indexOf(row) + 1, ...row };
}

// Construit le rapport Pro complet pour `opponentIdx`, vu par `teamIdx` —
// n'est appelé qu'après vérification d'accès (voir server/index.js,
// GET /api/scouting/report) : ce module ne revérifie PAS lui-même l'accès,
// pour rester une simple fonction de lecture, testable indépendamment.
function buildScoutingReport(league, teamIdx, opponentIdx, now = Date.now()) {
  const opponent = league.teams[opponentIdx];
  if (!opponent) return fail("Adversaire invalide.");
  return {
    ok: true,
    opponentIdx,
    opponentName: opponent.name,
    generatedAt: now,
    gamesPlayed: gamesPlayedFor(opponent),
    standing: standingFor(league, opponentIdx),
    recentForm: recentFormFor(league, opponentIdx),
    homeAwayRecord: homeAwayRecordFor(league, opponentIdx),
    streak: streakFor(league, opponentIdx),
    headToHead: headToHeadFor(league, teamIdx, opponentIdx),
    shotZones: aggregateShotZones(opponent),
    strategyUsage: aggregateStrategyUsage(opponent),
    keyPlayers: keyPlayersFor(opponent, now),
  };
}

module.exports = {
  MONTHLY_AD_UNLOCK_CAP, parisMonthKey, adsWatchedThisMonth,
  getScoutingAccess, createAdTicket, completeAdTicket, setPremium,
  buildScoutingReport,
  // Exportées pour les tests (vérification indépendante, voir
  // scouting_pro_test.js) plutôt que de dupliquer ces formules dans le test.
  gamesPlayedFor, aggregateShotZones, aggregateStrategyUsage,
  // Exportées pour server/showsAdapter.js (Hoop Shows, DEV_NOTES.md point
  // 11) — déjà utilisées EN INTERNE par buildScoutingReport ci-dessus
  // (forme récente/bilan domicile-extérieur/série en cours/confrontations
  // directes/classement), juste pas exposées jusqu'ici faute d'appelant
  // externe. Aucun changement de comportement : simples ajouts à cette
  // liste.
  recentFormFor, homeAwayRecordFor, streakFor, headToHeadFor, standingFor,
};
