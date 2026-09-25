// =====================================================================
// MATCH EN DIRECT — retour utilisateur (2026-09) : "il faut que le match se
// joue tout seul à 19h par exemple / si je me connecte à 19h30 je dois
// reprendre le match là où il en est (pas depuis le début)" + "le match doit
// durer autour d'1h30, c'est comme ça sur BuzzerBeater" + "on met une vraie
// mi-temps et une vraie pause après Q1 et Q3 / temps mort pour ajouter un
// peu de piquant" + "je ne dois pas avoir la possibilité d'avancer le live
// plus vite comme actuellement sur la version test" + (plus tardif) "les
// secondes sont très longues, 1 seconde dans le jeu est plus longue qu'une
// vraie seconde" + (2026-09, multi-manager) "jusqu'à 10 vrais managers
// humains dans une ligue partagée à la fois".
//
// Généralisation multi-manager : à l'origine, UN SEUL match en direct
// possible par journée (celui du club du joueur, toujours à l'index 0,
// stocké dans league.liveMatch). Avec plusieurs managers humains, PLUSIEURS
// matchs de la même journée peuvent chacun impliquer au moins un côté humain,
// EN MÊME TEMPS — chacun doit pouvoir regarder LE SIEN, peu importe ce qui se
// passe dans les autres. Voir League.liveMatches (engine.js) : une entrée par
// match diffusé, indexée par liveMatchKey(round, home, away). Un match
// CPU-vs-CPU n'a JAMAIS d'entrée ici (voir ensureLiveMatchStarted) : il
// continue de se résoudre instantanément comme avant (simulateOrForfeit).
//
// Chaque match diffusé est simulé EN UNE FOIS, dès l'heure programmée (voir
// server/calendar.js), avec le moteur complet (Engine.MatchEngine) : le
// résultat est donc déterminé dès cet instant-là, mais ÉTALÉ dans le temps
// réel — chaque événement se voit attribuer un horaire réel de diffusion
// (`airAt`), au rythme des secondes de jeu qu'il représente (voir
// SECONDS_SCALE_MS plus bas : jamais plus d'une seconde réelle par seconde de
// jeu écoulée), avec de vraies pauses (mi-temps, quart-temps, temps morts)
// insérées dans le calendrier de diffusion — MATCH_BROADCAST_DURATION_MS
// (voir calendar.js) ne sert plus qu'à borner le délai de sécurité avant
// résolution automatique en l'absence du/des manager(s), plus à fixer la
// durée réelle de la diffusion elle-même. Un navigateur, en se connectant à
// n'importe quel moment, peut donc reconstituer exactement où en est SA
// diffusion SANS jamais pouvoir l'accélérer.
//
// Simulation CANONIQUE : dans this.liveMatches, "A" désigne TOUJOURS l'équipe
// À DOMICILE, "B" TOUJOURS l'équipe À L'EXTÉRIEUR (MatchEngine n'a aucune
// notion d'avantage du terrain liée à l'ordre de ses arguments — le choix
// domicile/extérieur ne sert qu'à repérer les deux camps de façon stable,
// indépendante du spectateur). Chaque manager humain qui regarde reçoit une
// vue PERSONNALISÉE (voir viewLiveMatchForTeam plus bas) où "A" désigne
// TOUJOURS SA PROPRE équipe (boxScoreA = la sienne, events tagués team:"A" =
// les siens) — exactement la forme que le navigateur attendait déjà à
// l'époque solo (league.liveMatch, jamais league.liveMatches) : AUCUN
// changement d'affichage côté client, juste une résolution par appelant au
// lieu d'une resolution globale unique.
//
// Module Node uniquement (pas de UMD/navigateur) : c'est le SERVEUR qui
// calcule et stocke une fois pour toutes le calendrier de diffusion — le
// navigateur ne fait que le consommer (voir serializeLeague/leagueFromSave
// dans engine.js, qui transportent le liveMatch résolu pour lui tel quel,
// comme n'importe quelle autre donnée JSON de la sauvegarde).
// =====================================================================
const { MATCH_BROADCAST_DURATION_MS } = require("./calendar.js");

// Pauses "spectacle" (retour utilisateur : "une vraie mi-temps et une vraie
// pause après Q1 et Q3 / temps mort pour ajouter un peu de piquant") —
// purement narratives : elles espacent la diffusion dans le temps réel, mais
// ne changent RIEN au déroulé du match lui-même (score, événements) déjà
// entièrement déterminé par Engine.MatchEngine.
const HALFTIME_BREAK_MS = 10 * 60 * 1000; // pause après le 2e quart-temps
const QUARTER_BREAK_MS = 4 * 60 * 1000; // pause après le 1er et le 3e quart-temps
const OVERTIME_BREAK_MS = 2 * 60 * 1000; // courte pause avant chaque prolongation
const TIMEOUT_BREAK_MS = 60 * 1000; // temps mort "piquant", quelques-uns par quart-temps
const TIMEOUTS_PER_QUARTER = 2;

// Rythme du jeu proprement dit (hors pauses) — retour utilisateur (2026-09) :
// "les secondes sont très longues, 1 seconde dans le jeu est plus longue
// qu'une vraie seconde". Le rythme est DIRECTEMENT proportionnel aux secondes
// de jeu réellement écoulées entre deux événements consécutifs : 1 seconde de
// jeu ne dure jamais plus qu'une seconde réelle.
const SECONDS_SCALE_MS = 1000; // 1 seconde de jeu = 1 seconde réelle (jamais plus)
// Plancher réel pour un événement qui ne fait avancer le chrono d'AUCUNE
// seconde de jeu (annonces groupées au même chrono : entre-deux, marqueur de
// quart-temps, faute suivie de ses lancers francs...) — sans ce plancher
// elles s'enchaîneraient instantanément, illisibles dans le fil de texte.
const MIN_EVENT_GAP_MS = 400;

function clockSecondsFromStr(clockStr) {
  const [m, s] = clockStr.split(":").map(Number);
  return m * 60 + s;
}

// Durée de la pause qui suit la fin du quart-temps `q` (donné par
// ev.quarter), ou 0 s'il n'y en a pas (fin du match). `hasNext` indique s'il
// y a bien un quart-temps/une prolongation suivante à diffuser (sinon,
// inutile d'ajouter une pause après le tout dernier quart-temps joué).
function breakAfterQuarter(q, hasNext) {
  if (!hasNext) return 0;
  if (q === 1) return QUARTER_BREAK_MS;
  if (q === 2) return HALFTIME_BREAK_MS;
  if (q === 3) return QUARTER_BREAK_MS;
  return OVERTIME_BREAK_MS; // entre deux prolongations (q >= 4)
}

// Étale une liste d'événements DÉJÀ ENTIÈREMENT DÉTERMINÉE (voir
// MatchEngine.simulate) dans le temps réel, à partir de `kickoffAt` : ajoute
// `airAt` (horaire réel absolu, epoch ms) à chaque événement, et renvoie la
// liste des pauses (mi-temps, quarts-temps, temps morts) avec leur propre
// horaire de départ. Pur et déterministe : mêmes événements + même
// kickoffAt => toujours le même calendrier de diffusion (aucun Math.random
// ici).
// `homeName`/`awayName` (retour utilisateur, 2026-09 : "dans les commentaires
// du match, quand il y a un temps mort [...] il faudrait aussi que ça soit
// mis dans le texte. temps mort demandé par ....") — permettent d'attribuer
// chaque temps mort à une équipe ("Temps mort demandé par {équipe}", sans
// emoji — retiré depuis, retour utilisateur, 2026-09 : "enlève l'emoji") au
// lieu du texte générique d'avant. Toujours PUR/déterministe (voir le
// commentaire de schedulePlayback plus haut, "aucun Math.random ici") :
// l'équipe qui demande le temps mort est celle qui est MENÉE au score à cet
// instant précis (comportement réaliste — on prend un temps mort pour
// stopper une série adverse) ; à égalité, alterne entre domicile et
// extérieur selon le numéro du temps mort dans le quart-temps (1er, 2e...),
// jamais aléatoire. Par défaut ("Domicile"/"Extérieur") pour les appelants
// qui ne connaissent pas encore les noms (anciens tests) — computeLiveMatch,
// le seul appelant réel, passe toujours les vrais noms d'équipe.
function schedulePlayback(events, kickoffAt, homeName = "Domicile", awayName = "Extérieur") {
  if (!events.length) {
    return { events: [], pauses: [], totalDurationMs: 0 };
  }

  const quartersInOrder = [];
  events.forEach(ev => { if (!quartersInOrder.includes(ev.quarter)) quartersInOrder.push(ev.quarter); });

  const scheduled = [];
  const pauses = [];
  let cursor = 0; // décalage (ms) depuis kickoffAt

  quartersInOrder.forEach((q, qi) => {
    const quarterEvents = events.filter(ev => ev.quarter === q);
    const hasNextQuarter = qi < quartersInOrder.length - 1;
    // Répartit les TIMEOUTS_PER_QUARTER temps morts à peu près régulièrement
    // dans ce quart-temps (jamais sur le tout premier ou le tout dernier
    // événement, pour ne pas les coller à une pause de quart-temps voisine).
    // Map idxInQuarter -> son numéro d'ordre (1er/2e temps mort du
    // quart-temps), utilisé ci-dessous pour l'alternance à égalité.
    const timeoutOrdinalByIndex = new Map();
    for (let t = 1; t <= TIMEOUTS_PER_QUARTER; t++) {
      const pos = Math.round((t / (TIMEOUTS_PER_QUARTER + 1)) * (quarterEvents.length - 1));
      if (pos > 0 && pos < quarterEvents.length - 1) timeoutOrdinalByIndex.set(pos, t);
    }

    quarterEvents.forEach((ev, idxInQuarter) => {
      scheduled.push({ ...ev, airAt: kickoffAt + cursor });

      const nextInQuarter = quarterEvents[idxInQuarter + 1];
      const deltaSec = nextInQuarter
        ? Math.max(0, clockSecondsFromStr(ev.clock) - clockSecondsFromStr(nextInQuarter.clock))
        : 0;
      const gapMs = Math.max(MIN_EVENT_GAP_MS, deltaSec * SECONDS_SCALE_MS);
      cursor += gapMs;

      if (timeoutOrdinalByIndex.has(idxInQuarter)) {
        const scoreNow = ev.score || { A: 0, B: 0 };
        const ordinal = timeoutOrdinalByIndex.get(idxInQuarter);
        let callingTeam;
        if (scoreNow.A < scoreNow.B) callingTeam = "home";
        else if (scoreNow.A > scoreNow.B) callingTeam = "away";
        else callingTeam = (ordinal % 2 === 1) ? "home" : "away";
        const callingTeamName = callingTeam === "home" ? homeName : awayName;
        pauses.push({
          kind: "timeout", team: callingTeam,
          // Retour utilisateur (2026-09) : "enlève l'emoji" (sur la
          // banderole/le fil de commentaires de temps mort).
          label: `Temps mort demandé par ${callingTeamName}`,
          airAt: kickoffAt + cursor, durationMs: TIMEOUT_BREAK_MS,
        });
        cursor += TIMEOUT_BREAK_MS;
      }
    });

    const brk = breakAfterQuarter(q, hasNextQuarter);
    if (brk > 0) {
      pauses.push({
        kind: q === 2 ? "halftime" : "quarter-break",
        label: q === 2 ? "🏀 Mi-temps" : "Pause entre les quarts-temps",
        airAt: kickoffAt + cursor,
        durationMs: brk,
      });
      cursor += brk;
    }
  });

  return { events: scheduled, pauses, totalDurationMs: cursor };
}

// Clé stable d'un match dans league.liveMatches — une journée (round) donnée
// ne joue jamais deux fois le même duel home/away, donc ce triplet suffit.
function liveMatchKey(round, homeIdx, awayIdx) {
  return `${round}:${homeIdx}:${awayIdx}`;
}

// Équivalent pour un match de COUPE (voir League.cup côté engine.js) —
// préfixé "cup:" pour ne JAMAIS collisionner avec une clé de championnat
// (celles-ci commencent toujours par un simple chiffre, voir liveMatchKey
// ci-dessus) : les deux cohabitent librement dans le même league.liveMatches
// (voir viewLiveMatchForTeam plus bas, qui cherche par home/awayIdx sans se
// soucier du format de la clé). `cupRoundIndex` = round.index (voir
// generateCupBracket/buildNextCupRound), PAS le round de championnat.
function cupLiveMatchKey(cupRoundIndex, homeIdx, awayIdx) {
  return `cup:${cupRoundIndex}:${homeIdx}:${awayIdx}`;
}

function POSITIONS_MISSING(team) {
  return !team.hasValidLineup();
}

// Calcule (une seule fois) le match en direct home vs away pour `round` :
// simule le match complet avec le moteur complet, OU un forfait si l'une des
// deux équipes ne peut pas aligner un cinq de départ complet (voir
// rosterCannotFieldLineup côté navigateur / simulateOrForfeit côté moteur) —
// dans ce cas, rien à diffuser en direct, juste le résultat immédiat.
// Convention CANONIQUE (voir en-tête de fichier) : "A" = domicile, "B" =
// extérieur, TOUJOURS — la vue personnalisée par spectateur se fait à part
// (voir viewLiveMatchForTeam). `competition` ("championship" par défaut, ou
// "cup" — voir ensureCupLiveMatchStarted) : purement informatif, transporté
// tel quel dans l'entrée renvoyée pour que l'affichage sache distinguer un
// direct de championnat d'un direct de coupe — ne change rien au calcul.
function computeLiveMatch(Engine, league, round, homeIdx, awayIdx, kickoffAt, competition = "championship") {
  const home = league.teams[homeIdx];
  const away = league.teams[awayIdx];

  const homeCannotField = POSITIONS_MISSING(home);
  const awayCannotField = POSITIONS_MISSING(away);

  if (homeCannotField || awayCannotField) {
    let homeScore, awayScore;
    if (homeCannotField && awayCannotField) {
      homeScore = 0;
      awayScore = 0;
    } else if (homeCannotField) {
      homeScore = 0;
      awayScore = Engine.FORFEIT_SCORE;
    } else {
      homeScore = Engine.FORFEIT_SCORE;
      awayScore = 0;
    }
    return {
      round, kickoffAt, homeIdx, awayIdx, competition,
      forfeit: true,
      finalScore: { home: homeScore, away: awayScore },
      // Forfait : aucun quart-temps réellement joué (voir simulateOrForfeit
      // côté moteur, même convention `null`) — idem pour tacticsUsed
      // (aucune tactique réellement mise en œuvre).
      quarterScores: null,
      tacticsUsed: null,
      events: [], pauses: [], totalDurationMs: 0,
      boxScoreA: [], boxScoreB: [],
    };
  }

  // Tactiques "en direct" de CHACUNE des deux équipes, capturées ICI (retour
  // utilisateur, 2026-09 : "Scouting Pro" — voir le grand commentaire de
  // Engine.recordMatchStatsForTeam sur tacticsUsed/server/scouting.js) :
  // exactement l'instant où elles comptent réellement pour CE match, AVANT
  // que le manager ne puisse les changer pour son prochain match pendant que
  // celui-ci est encore en cours de diffusion (voir Engine.tacticsSnapshotFor).
  const tacticsUsed = { home: Engine.tacticsSnapshotFor(home), away: Engine.tacticsSnapshotFor(away) };
  const engine = new Engine.MatchEngine(home, away);
  const result = engine.simulate();
  const { events, pauses, totalDurationMs } = schedulePlayback(result.events, kickoffAt, home.name, away.name);

  return {
    round, kickoffAt, homeIdx, awayIdx, competition,
    forfeit: false,
    finalScore: { home: result.finalScore.A, away: result.finalScore.B },
    // quarterScores (retour Discord d'Ariane, relayé par l'utilisateur,
    // 2026-09-24 : "afficher le score par quart-temps sur la boxscore du
    // match") : posée ici (même endroit que finalScore juste au-dessus, même
    // réorientation A/B -> home/away) pour survivre à la diffusion en
    // direct de ce match (league.liveMatches est persisté sur disque) — lue
    // ensuite par finalizeRound/finalizeCupRound/finalizePlayoffRound une
    // fois le match terminé, pour l'attacher au matchLog des joueurs (voir
    // Engine.recordMatchStatsAndAwardMvp). `tacticsUsed` : même principe,
    // même survie à la diffusion en direct.
    quarterScores: { home: result.quarterScores.A, away: result.quarterScores.B },
    tacticsUsed,
    events, pauses, totalDurationMs,
    boxScoreA: result.boxScoreA, boxScoreB: result.boxScoreB,
  };
}

// Point d'entrée appelé à chaque requête (voir server/index.js, AVANT
// catchUpLeague) : pour la journée en cours de LA LIGUE (plus "du club du
// joueur" — voir generalisation en en-tête de fichier), démarre la diffusion
// de CHAQUE match impliquant au moins un côté humain et pas déjà démarré.
// Idempotent (ne redémarre jamais un match déjà dans league.liveMatches) —
// ne fait rien tant que l'heure programmée de la journée n'est pas atteinte.
// Renvoie la liste des clés NOUVELLEMENT démarrées (vide si rien de neuf) —
// c'est à l'appelant (voir tick() côté server/index.js) de décider si ça
// suffit à justifier une sauvegarde immédiate.
function ensureLiveMatchStarted(Engine, league, now, scheduledTimeForLeagueRound) {
  if (typeof league.calendarStartAt !== "number") return [];
  // `league.playoffs` : posé dès la fin de la saison régulière (voir
  // League.startPlayoffsIfNeeded), donc AVANT le moindre match de play-offs
  // joué : plus rien à diffuser ici côté championnat une fois ce champ posé
  // (voir ensurePlayoffLiveMatchStarted plus bas pour son propre calendrier).
  if (league.playoffs || league.isRegularSeasonDone()) return [];
  const round = league.round;
  const kickoffAt = scheduledTimeForLeagueRound(league, round);
  if (now < kickoffAt) return [];

  if (!league.liveMatches) league.liveMatches = {};
  const startedKeys = [];

  league.matchesForRound(round).forEach(m => {
    const home = league.teams[m.home];
    const away = league.teams[m.away];
    if (!home.isHuman && !away.isHuman) return; // CPU-vs-CPU : jamais de diffusion en direct
    const key = liveMatchKey(round, m.home, m.away);
    if (league.liveMatches[key]) return; // déjà démarrée (idempotent)
    // Applique un plan d'ordres préparé à l'avance pour CETTE journée (voir
    // Team.applyPlannedTacticsForRound dans engine.js), pour CHAQUE côté
    // humain impliqué (un adversaire CPU n'a pas de plan à appliquer) — juste
    // avant que computeLiveMatch ne lise les champs "en direct" : le calcul
    // de la diffusion elle-même est déjà figé une fois pour toutes ici, donc
    // c'est le tout dernier moment où ce plan peut encore compter.
    if (home.isHuman) home.applyPlannedTacticsForRound(round);
    if (away.isHuman) away.applyPlannedTacticsForRound(round);
    league.liveMatches[key] = computeLiveMatch(Engine, league, round, m.home, m.away, kickoffAt);
    startedKeys.push(key);
  });

  return startedKeys;
}

// Équivalent de ensureLiveMatchStarted, mais pour le tour de COUPE
// actuellement en attente (voir League.pendingCupRound côté engine.js) —
// démarre la diffusion de chaque match RÉEL (jamais un bye, déjà résolu à sa
// création, voir generateCupBracket) impliquant au moins un côté humain, dès
// que le créneau de 15h de son jour est atteint. `scheduledTimeForLeagueCupRound`
// injecté comme `scheduledTimeForLeagueRound` l'est pour ensureLiveMatchStarted
// (voir server/calendar.js) — même raison (résolution du rythme propre à
// CETTE ligue). Applique désormais un plan d'ordres préparé à l'avance pour
// CE tour de Coupe (correctif 2026-09, voir Team.applyPlannedTacticsForRound
// côté moteur : plannedTactics est maintenant keyé "{compétition}:{tour}",
// donc un plan de Coupe ne peut plus collisionner avec un plan de
// championnat portant le même numéro) — jusque-là, aucun mécanisme de
// planification n'existait pour la Coupe : un match de coupe se jouait
// TOUJOURS avec les ordres courants de l'équipe, jamais un plan préparé à
// l'avance, quoi que le manager ait réglé sur l'écran Ordres pour ce tour.
function ensureCupLiveMatchStarted(Engine, league, now, scheduledTimeForLeagueCupRound) {
  if (typeof league.calendarStartAt !== "number") return [];
  const round = league.pendingCupRound ? league.pendingCupRound() : null;
  if (!round) return [];
  const kickoffAt = scheduledTimeForLeagueCupRound(league, round.dayIndex);
  if (now < kickoffAt) return [];

  if (!league.liveMatches) league.liveMatches = {};
  const startedKeys = [];

  round.matches.forEach(m => {
    if (m.bye || m.away == null) return; // bye : déjà résolu, aucune diffusion
    const home = league.teams[m.home];
    const away = league.teams[m.away];
    if (!home.isHuman && !away.isHuman) return; // CPU-vs-CPU : jamais de diffusion en direct
    const key = cupLiveMatchKey(round.index, m.home, m.away);
    if (league.liveMatches[key]) return; // déjà démarrée (idempotent)
    // Voir le commentaire de ensureLiveMatchStarted (championnat) pour le
    // même mécanisme : appliqué juste avant que computeLiveMatch ne lise
    // les champs "en direct", tout dernier moment où ce plan peut compter.
    if (home.isHuman) home.applyPlannedTacticsForRound(round.index, "cup");
    if (away.isHuman) away.applyPlannedTacticsForRound(round.index, "cup");
    league.liveMatches[key] = computeLiveMatch(Engine, league, round.index, m.home, m.away, kickoffAt, "cup");
    startedKeys.push(key);
  });

  return startedKeys;
}

// Résout définitivement TOUT le tour de coupe actuellement en attente (voir
// League.pendingCupRound) — même principe que finalizeRound ci-dessous, côté
// coupe : les matchs déjà diffusés en direct sont finalisés avec leur score
// DÉJÀ déterminé (jamais un second tirage), les autres (CPU-vs-CPU, ou un
// match humain jamais démarré en direct — rattrapage) sont simulés
// MAINTENANT. Les byes (déjà résolus à la création du tour, voir
// generateCupBracket) sont simplement ignorés ici. Fait avancer la coupe
// d'un tour (voir League.advanceCup — engendre le tour suivant, ou couronne
// le champion si c'était la finale) une fois tous les matchs réels du tour
// enregistrés. Renvoie `null` si aucun tour n'était en attente (no-op).
function finalizeCupRound(Engine, league) {
  const { simulateOrForfeit, recordMatchStatsAndAwardMvp, handleGameEvent } = Engine;
  const round = league.pendingCupRound();
  if (!round) return null;

  round.matches.forEach((m, matchIndex) => {
    if (m.bye || m.away == null) return; // déjà résolu à la création
    const home = league.teams[m.home];
    const away = league.teams[m.away];
    const key = cupLiveMatchKey(round.index, m.home, m.away);
    const live = league.liveMatches && league.liveMatches[key];

    let scoreHome, scoreAway, forfeit, quarterScores, tacticsUsed;
    if (live) {
      scoreHome = live.finalScore.home;
      scoreAway = live.finalScore.away;
      forfeit = live.forfeit;
      quarterScores = live.quarterScores || null;
      tacticsUsed = live.tacticsUsed || null;
      delete league.liveMatches[key];
    } else {
      // Jamais démarré en direct (CPU-vs-CPU, ou tour rattrapé d'un coup) :
      // applique d'abord un plan d'ordres préparé à l'avance pour CHAQUE
      // côté humain impliqué (voir finalizeRound ci-dessus pour le même
      // principe côté championnat, et Team.applyPlannedTacticsForRound côté
      // moteur), sinon un manager absent qui avait préparé ce tour de Coupe
      // verrait quand même ses ordres du moment (voire ceux par défaut)
      // appliqués à sa place.
      if (home.isHuman) home.applyPlannedTacticsForRound(round.index, "cup");
      if (away.isHuman) away.applyPlannedTacticsForRound(round.index, "cup");
      const sim = simulateOrForfeit(home, away);
      scoreHome = sim.scoreHome;
      scoreAway = sim.scoreAway;
      forfeit = sim.forfeit;
      quarterScores = sim.quarterScores;
      tacticsUsed = sim.tacticsUsed;
    }
    // Journal de matchs (voir finalizeRound ci-dessus pour le même principe
    // côté championnat) : un match de coupe compte aussi pour les stats de
    // saison des joueurs impliqués, ET pour le MVP automatique du match
    // (retour utilisateur, 2026-09 : "le mvp du match se fait interviewer à
    // chaque fois" — chaque match réellement simulé, coupe comprise, voir
    // recordMatchStatsAndAwardMvp/awardMatchMvp côté moteur).
    if (!forfeit) {
      recordMatchStatsAndAwardMvp(home, away, round.index, "cup", undefined, quarterScores, tacticsUsed);
    }
    league.recordCupMatchResult(matchIndex, scoreHome, scoreAway, forfeit);

    // Fil d'actualité (voir finalizeRound ci-dessus pour le même principe
    // côté championnat) : pas de récap "league_round" pour la Coupe (élimination
    // directe, pas une journée à plat comme le championnat — le prestataire
    // ne prévoit ce récap que pour `league_round`, jamais pour un tour de
    // Coupe).
    if (home.isHuman && home.feed) {
      handleGameEvent(home.feed, {
        type: "match_played", week: home.week, matchId: `cup:${round.index}:${m.home}:${m.away}`,
        opponent: away.name, home: true, pointsFor: scoreHome, pointsAgainst: scoreAway,
        topScorer: topScorerForTeamRound(home, round.index, "cup"),
      }, { clubName: home.name });
    }
    if (away.isHuman && away.feed) {
      handleGameEvent(away.feed, {
        type: "match_played", week: away.week, matchId: `cup:${round.index}:${m.home}:${m.away}`,
        opponent: home.name, home: false, pointsFor: scoreAway, pointsAgainst: scoreHome,
        topScorer: topScorerForTeamRound(away, round.index, "cup"),
      }, { clubName: away.name });
    }
  });

  const cupRoundIndex = round.index;
  const cupRoundName = round.name;
  const dayIndex = round.dayIndex;
  league.advanceCup();
  return { type: "cup-match", cupRoundIndex, cupRoundName, dayIndex, matches: round.matches };
}

// =====================================================================
// PLAY-OFFS : retour utilisateur (2026-09) : "les play offs doivent être
// comme les matchs de saisons régulières, avec un live [...] sur plusieurs
// jours réels (et pas tout simulés d'un coup)". Même principe que le bloc
// Coupe ci-dessus (un tour à la fois, diffusé en direct, résolu au rythme du
// calendrier réel) mais appliqué à League.playoffs (voir engine.js, séries
// best-of-3 plutôt qu'élimination directe) plutôt qu'à League.cup. `round`
// ici est TOUJOURS league.playoffs.round (jamais league.round, qui reste
// figé à totalRounds une fois la saison régulière terminée, voir
// League.startPlayoffsIfNeeded). Reprend liveMatchKey (championnat) telle
// quelle, jamais un nouveau préfixe : un tour de play-offs a toujours
// round >= totalRounds, un tour de championnat toujours round < totalRounds,
// donc aucune collision possible dans league.liveMatches. `competition`
// posé à "championship" (comme League.runPlayoffsInstantly côté moteur),
// jamais un nouveau tag "playoff" : un match de play-offs se comporte alors,
// pour tout le reste de l'affichage (préparation, direct, box-score, MVP,
// historique de stats), exactement comme un match de championnat ordinaire,
// seul son `round` (>= totalRounds) le distingue.
// =====================================================================

// Équivalent de ensureCupLiveMatchStarted, mais pour le tour de PLAY-OFFS
// actuellement en attente (voir League.playoffMatchesForRound/playoffs.round
// côté engine.js) : démarre la diffusion de chaque match RÉEL impliquant au
// moins un côté humain, dès que le créneau réel de CE tour est atteint.
function ensurePlayoffLiveMatchStarted(Engine, league, now, scheduledTimeForLeagueRound) {
  if (typeof league.calendarStartAt !== "number") return [];
  if (!league.playoffs || league.playoffs.champion != null) return [];
  const round = league.playoffs.round;
  const matches = league.playoffMatchesForRound(round);
  if (!matches.length) return [];
  const kickoffAt = scheduledTimeForLeagueRound(league, round);
  if (now < kickoffAt) return [];

  if (!league.liveMatches) league.liveMatches = {};
  const startedKeys = [];

  matches.forEach(m => {
    const home = league.teams[m.home];
    const away = league.teams[m.away];
    if (!home.isHuman && !away.isHuman) return; // CPU-vs-CPU : jamais de diffusion en direct
    const key = liveMatchKey(round, m.home, m.away);
    if (league.liveMatches[key]) return; // déjà démarrée (idempotent)
    // Voir le commentaire de ensureLiveMatchStarted (championnat) pour le
    // même mécanisme : appliqué juste avant que computeLiveMatch ne lise les
    // champs "en direct", tout dernier moment où ce plan peut encore compter.
    // Tag "championship" (jamais un tag "playoff" séparé, voir le grand
    // commentaire en tête de ce bloc) : un plan de journée de play-offs se
    // prépare donc depuis le même écran Ordres qu'un plan de championnat
    // ordinaire, sans rien y changer (voir Team.plannedTactics/planKey côté
    // moteur, upcomingRoundsForOrders côté navigateur).
    if (home.isHuman) home.applyPlannedTacticsForRound(round, "championship");
    if (away.isHuman) away.applyPlannedTacticsForRound(round, "championship");
    league.liveMatches[key] = computeLiveMatch(Engine, league, round, m.home, m.away, kickoffAt, "championship");
    startedKeys.push(key);
  });

  return startedKeys;
}

// Résout définitivement TOUT le tour de play-offs actuellement en attente
// (voir League.playoffs.round) : même principe que finalizeCupRound
// ci-dessus, mais chaque match résolu fait progresser une SÉRIE best-of-3
// (voir League.recordPlayoffGameResult côté moteur) au lieu d'un bracket à
// élimination directe. Fait avancer playoffs.round d'un cran une fois tous
// les matchs dus ce tour-ci réglés (voir League.playoffMatchesForRound,
// jamais vide tant que le champion n'est pas connu). Renvoie `null` si aucun
// tour n'était en attente (pas de play-offs en cours, ou déjà terminés).
function finalizePlayoffRound(Engine, league, now = Date.now()) {
  const { simulateOrForfeit, recordMatchStatsAndAwardMvp } = Engine;
  if (!league.playoffs || league.playoffs.champion != null) return null;
  const round = league.playoffs.round;
  const matches = league.playoffMatchesForRound(round);
  if (!matches.length) return null;

  const userResults = [];

  matches.forEach(m => {
    const home = league.teams[m.home];
    const away = league.teams[m.away];
    const key = liveMatchKey(round, m.home, m.away);
    const live = league.liveMatches && league.liveMatches[key];

    let scoreHome, scoreAway, forfeit, quarterScores, tacticsUsed;
    if (live) {
      scoreHome = live.finalScore.home;
      scoreAway = live.finalScore.away;
      forfeit = live.forfeit;
      quarterScores = live.quarterScores || null;
      tacticsUsed = live.tacticsUsed || null;
      delete league.liveMatches[key];
    } else {
      // Jamais démarré en direct (CPU-vs-CPU, ou tour rattrapé d'un coup) :
      // voir le même principe côté finalizeCupRound ci-dessus. Tag
      // "championship" (voir le même choix, et pourquoi, dans
      // ensurePlayoffLiveMatchStarted plus haut).
      if (home.isHuman) home.applyPlannedTacticsForRound(round, "championship");
      if (away.isHuman) away.applyPlannedTacticsForRound(round, "championship");
      const sim = simulateOrForfeit(home, away);
      scoreHome = sim.scoreHome;
      scoreAway = sim.scoreAway;
      forfeit = sim.forfeit;
      quarterScores = sim.quarterScores;
      tacticsUsed = sim.tacticsUsed;
    }

    // Journal de matchs (voir le même principe côté finalizeRound ci-dessous)
    // : un match de play-offs compte aussi pour les stats de saison des
    // joueurs impliqués, ET pour le MVP automatique du match. `competition`
    // "championship" (voir le grand commentaire en tête de ce bloc) : jamais
    // un tag "playoff" séparé ici.
    if (!forfeit) {
      recordMatchStatsAndAwardMvp(home, away, round, "championship", now, quarterScores, tacticsUsed);
    }

    league.recordPlayoffGameResult(m.seriesId, m.home, m.away, scoreHome, scoreAway, now);

    // `seriesResolved` (lu APRÈS recordPlayoffGameResult, une fois la série
    // éventuellement close) : dit si CE match précis vient de décider la
    // série de `m.seriesId` (2 victoires atteintes). Voir
    // moteurbasket3.html:showCatchupSummaryIfAny, qui n'attache l'interview
    // de jalon "demi-finale-po"/"finale-po" qu'au match qui a RÉELLEMENT
    // décidé la série, jamais au premier match encore en cours. La finale a
    // désormais aussi sa propre interview de jalon (retour utilisateur,
    // 2026-09 : "interview post finale de PO, en cas de victoire ou
    // défaite"), donc `finalSeries` compte tout autant ici que les demies.
    const series = m.seriesId === "semi0" ? league.playoffs.series[0]
      : m.seriesId === "semi1" ? league.playoffs.series[1]
      : league.playoffs.finalSeries;
    const seriesResolved = !!(series && series.resolved);

    if (home.isHuman) {
      userResults.push({
        teamIdx: m.home, round, isHome: true, opponent: away.name, opponentIdx: m.away,
        scoreUser: scoreHome, scoreOpponent: scoreAway, won: scoreHome > scoreAway, forfeit,
        seriesId: m.seriesId, seriesResolved,
      });
    }
    if (away.isHuman) {
      userResults.push({
        teamIdx: m.away, round, isHome: false, opponent: home.name, opponentIdx: m.home,
        scoreUser: scoreAway, scoreOpponent: scoreHome, won: scoreAway > scoreHome, forfeit,
        seriesId: m.seriesId, seriesResolved,
      });
    }
  });

  league.playoffs.round += 1;
  const seasonEnded = league.playoffs.champion != null;
  return { type: "playoff-match", round, userResults, seasonEnded };
}

// Résout définitivement TOUTE la journée `round` — remplace à la fois
// l'ancien finalizeLiveMatch (un seul match, déjà diffusé) et l'ancien
// simulateRoundHeadless côté autoSim.js (le reste de la journée) : les
// matchs déjà diffusés en direct (voir league.liveMatches) sont finalisés
// avec leur score DÉJÀ déterminé (jamais un second tirage) ; tous les autres
// matchs de cette journée (CPU-vs-CPU, ou un match humain qui n'a jamais été
// démarré en direct — ex. plusieurs semaines rattrapées d'un coup après une
// longue absence, voir catchUpLeague) sont simulés MAINTENANT
// (simulateOrForfeit), exactement comme un manager absent au coup d'envoi.
// Fait progresser `league.round` une fois la journée entière réglée (voir
// League.advanceRound) — un round n'avance donc qu'une fois TOUS ses matchs
// réglés, humains compris, quel que soit leur nombre. Renvoie un événement
// `{ type: "match", round, userResults: [...] }` — UNE entrée par équipe
// HUMAINE impliquée dans la journée (voir Team.isHuman), pas seulement celle
// de "l'index 0" comme avant ; c'est à l'appelant (voir server/index.js) de
// filtrer/personnaliser ces événements pour UN destinataire précis avant de
// les renvoyer par l'API.
// `now` (retour utilisateur, 2026-09, bug révélé par un test qui simule le
// temps plutôt que d'attendre en réel) : horodatage réel transmis
// explicitement jusqu'à Team.applyMoraleForResult (voir son commentaire),
// point de départ du délai de 3 jours avant qu'une interview de jalon ne
// s'auto-purge (MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS/
// pruneExpiredInterviews). Sans lui, applyMoraleForResult retombait sur son
// propre `Date.now()` par défaut, DIFFÉRENT du `now` déjà reçu ici par
// autoSim.js:catchUpClassic/catchUpDailyAnchored (et donc du `now` que
// server/index.js:tick réutilise juste après pour purger les interviews
// expirées) : sans conséquence en production (les deux valent alors
// littéralement le même Date.now() réel, à la milliseconde près), mais
// l'interview créée ici pouvait se retrouver purgée AUSSITÔT créée dès que
// ces deux horloges divergent (tout environnement qui simule le temps
// plutôt que d'attendre en réel, comme les tests). Optionnel (défaut
// Date.now()) uniquement pour ne pas casser les quelques appels directs
// existants (tests) qui ne le passent pas encore.
// Meilleur marqueur d'UNE équipe pour UNE journée donnée (fil d'actualité du
// tableau de bord, voir handleGameEvent "match_played" plus bas) : lu depuis
// Player.matchLog, dont la DERNIÈRE entrée vient justement d'être poussée
// par recordMatchStatsAndAwardMvp (voir son appel juste au-dessus de chaque
// utilisation de cette fonction) — jamais recalculé depuis p.stats, remis à
// zéro entre-temps par resetForMatch au prochain match. `null` pour un
// forfait (aucune simulation réelle, donc aucune entrée matchLog ajoutée ce
// tour-ci) ou une équipe où personne n'a de minutes jouées.
function topScorerForTeamRound(team, round, competition) {
  let best = null;
  team.players.forEach(p => {
    const entry = p.matchLog[p.matchLog.length - 1];
    if (!entry || entry.round !== round || entry.competition !== competition) return;
    if (!best || entry.pts > best.points) best = { name: p.name, points: entry.pts };
  });
  return best;
}

function finalizeRound(Engine, league, round, now = Date.now()) {
  const {
    simulateOrForfeit, recordMatchStatsAndAwardMvp, milestoneTypeForRound,
    seasonObjectiveMidSeasonSignal, seasonObjectiveEndOfRegularSeasonSignal,
    seasonObjectiveVerdict, handleGameEvent,
  } = Engine;
  const matches = league.matchesForRound(round);
  const userResults = [];
  // Émissions avant-match/mi-temps + pronostics (voir DEV_NOTES.md point 11,
  // server/shows.js) : résumé de CHAQUE match réellement joué (jamais un
  // forfait, voir le push conditionnel plus bas), accumulé pendant CETTE
  // boucle puis transmis à Shows.resolveRoundShowsSync tout à la fin de la
  // fonction — ajout ADDITIF et ISOLÉ, ne change RIEN au calcul/à la
  // diffusion en direct ci-dessus.
  const showResults = [];
  // Fil d'actualité (voir handleGameEvent "league_round" plus bas) : récap de
  // TOUS les résultats de cette journée, construit au fil de la boucle
  // ci-dessous, envoyé une fois à chaque équipe humaine concernée par cette
  // journée APRÈS la boucle (voir plus bas) — jamais pendant, pour inclure
  // les matchs traités plus tard dans la même boucle.
  const feedRoundResults = [];
  const feedHumanTeamsThisRound = new Set();
  // Interview de jalon (retour utilisateur, 2026-09 : "elle doit avoir lieu
  // après le match de la mi saison de championnat [...] et [...] après la
  // fin de la saison régulière [...] idem pour le début de saison", voir
  // Engine.milestoneTypeForRound/MILESTONE_INTERVIEW_TYPES) : au plus un des
  // trois types pour CETTE journée, `null` le reste du temps. Jamais pour la
  // Coupe (round.index n'a aucun sens vis-à-vis de league.totalRounds).
  const milestone = milestoneTypeForRound(round, league.totalRounds);

  matches.forEach(m => {
    const home = league.teams[m.home];
    const away = league.teams[m.away];
    const key = liveMatchKey(round, m.home, m.away);
    const live = league.liveMatches && league.liveMatches[key];

    let scoreHome, scoreAway, forfeit, quarterScores, tacticsUsed;
    if (live) {
      scoreHome = live.finalScore.home;
      scoreAway = live.finalScore.away;
      forfeit = live.forfeit;
      quarterScores = live.quarterScores || null;
      tacticsUsed = live.tacticsUsed || null;
      delete league.liveMatches[key];
    } else {
      // Jamais démarré en direct (CPU-vs-CPU, ou journée rattrapée d'un
      // coup — voir commentaire ci-dessus) : applique d'abord un plan
      // d'ordres préparé à l'avance pour CHAQUE côté humain impliqué (voir
      // Team.applyPlannedTacticsForRound), sinon un manager absent qui avait
      // préparé sa semaine verrait quand même ses ordres du moment (voire
      // ceux par défaut) appliqués à sa place.
      if (home.isHuman) home.applyPlannedTacticsForRound(round);
      if (away.isHuman) away.applyPlannedTacticsForRound(round);
      const sim = simulateOrForfeit(home, away);
      scoreHome = sim.scoreHome;
      scoreAway = sim.scoreAway;
      forfeit = sim.forfeit;
      quarterScores = sim.quarterScores;
      tacticsUsed = sim.tacticsUsed;
    }

    // Voir la déclaration de showResults plus haut — jamais pour un forfait
    // (aucun événement réel à montrer/aucune stat de match pour résoudre un
    // "meilleur marqueur", voir Adapter.buildMatchesInputForRound/
    // topScorerMapForMatch).
    if (!forfeit) showResults.push({ homeIdx: m.home, awayIdx: m.away, scoreHome, scoreAway, quarterScores });

    // Journal de matchs (voir Player.matchLog/recordMatchStatsForTeam côté
    // moteur) : alimente les stats de saison/MVP de la dernière journée
    // (onglet Ligue) et les pages joueur — JAMAIS pour un forfait (aucune
    // simulation réelle n'a eu lieu, p.stats/p.secondsPlayed restent ceux du
    // match précédent de chaque joueur). `quarterScores` (retour Discord
    // d'Ariane, relayé par l'utilisateur, 2026-09-24) : propagé jusqu'au
    // matchLog pour l'affichage du score par quart-temps sur la feuille de
    // match (voir boxscoreRowsFromMatchLog/showMatchBoxscore côté client).
    if (!forfeit) {
      recordMatchStatsAndAwardMvp(home, away, round, "championship", now, quarterScores, tacticsUsed);
    }

    league.recordResult(round, m.home, m.away, scoreHome, scoreAway);
    feedRoundResults.push({ home: home.name, away: away.name, homePts: scoreHome, awayPts: scoreAway });

    if (home.isHuman) {
      const won = scoreHome > scoreAway;
      // `round` en 4e argument (voir Team.applyMoraleForResult côté moteur).
      // `now` en 5e argument (voir le commentaire de finalizeRound
      // ci-dessus). `milestone` en 6e argument (voir plus haut) : SEUL ce
      // paramètre met en attente une interview pour CE résultat (résolue
      // plus tard côté navigateur, voir /api/media/interview,
      // server/actions.js), pour les trois journées concernées, jamais pour
      // un match de championnat ordinaire (retour utilisateur, 2026-09 :
      // interview classique d'après CHAQUE match retirée).
      const moraleDelta = home.applyMoraleForResult(won, scoreHome - scoreAway, away.name, round, now, milestone);
      const attendanceInfo = home.simulateHomeAttendance(away.name);
      userResults.push({
        teamIdx: m.home, round, isHome: true, opponent: away.name, opponentIdx: m.away,
        scoreUser: scoreHome, scoreOpponent: scoreAway, won, forfeit, moraleDelta, attendanceInfo,
      });
      // Fil d'actualité (voir INTEGRATION.md du prestataire, DEV_NOTES.md
      // point 10) : un match_played par équipe humaine impliquée, même pour
      // un forfait (topScorer reste `null` dans ce cas, le fil l'affiche
      // "Personne", voir handleGameEvent côté moteur).
      if (home.feed) {
        handleGameEvent(home.feed, {
          type: "match_played", week: home.week, matchId: `${round}:${m.home}:${m.away}`,
          opponent: away.name, home: true, pointsFor: scoreHome, pointsAgainst: scoreAway,
          topScorer: topScorerForTeamRound(home, round, "championship"),
        }, { clubName: home.name });
      }
      feedHumanTeamsThisRound.add(home);
    }
    if (away.isHuman) {
      const won = scoreAway > scoreHome;
      const moraleDelta = away.applyMoraleForResult(won, scoreAway - scoreHome, home.name, round, now, milestone);
      userResults.push({
        teamIdx: m.away, round, isHome: false, opponent: home.name, opponentIdx: m.home,
        scoreUser: scoreAway, scoreOpponent: scoreHome, won, forfeit, moraleDelta, attendanceInfo: null,
      });
      if (away.feed) {
        handleGameEvent(away.feed, {
          type: "match_played", week: away.week, matchId: `${round}:${m.home}:${m.away}`,
          opponent: home.name, home: false, pointsFor: scoreAway, pointsAgainst: scoreHome,
          topScorer: topScorerForTeamRound(away, round, "championship"),
        }, { clubName: away.name });
      }
      feedHumanTeamsThisRound.add(away);
    }
  });

  // Récap de journée (voir feedRoundResults/feedHumanTeamsThisRound
  // ci-dessus) : une seule entrée par équipe humaine (dédoublonnée par
  // `key: league_round_<semaine>` dans handleGameEvent côté moteur), même si
  // plusieurs de ses matchs (aucun cas réel aujourd'hui, une équipe ne joue
  // qu'un match par journée) l'avaient ajoutée deux fois à l'ensemble.
  // `round + 1` : convention d'affichage déjà en place ailleurs dans l'appli
  // (voir updateTopbar côté client, "Journée X/18" = round + 1, `round`
  // restant 0-indexé côté moteur).
  feedHumanTeamsThisRound.forEach(team => {
    if (!team.feed) return;
    handleGameEvent(team.feed, {
      type: "league_round", week: team.week, round: round + 1, results: feedRoundResults,
    }, { clubName: team.name });
  });

  // Signal INTERMÉDIAIRE de l'objectif du CA (retour utilisateur, 2026-09 :
  // "Ajoute un signal à la mi saison", puis "Juste après la saison
  // régulière (avant PO et barrage) aussi" ; voir le grand commentaire de
  // Engine.computeSeasonObjectivePaceSignal côté moteur) : appliqué APRÈS la
  // boucle ci-dessus (jamais dedans) pour que League.standings() reflète
  // déjà TOUS les résultats de cette journée (y compris les matchs traités
  // plus tôt dans la même boucle) avant de calculer le rang provisoire de
  // chaque équipe, plutôt qu'un classement partiellement à jour selon
  // l'ordre des matchs. Pour le jalon "fin-saison-reguliere" précisément,
  // ce placement APRÈS la boucle (mais dans CETTE fonction, avant
  // league.advanceRound()) garantit aussi qu'on est bien AVANT
  // League.startPlayoffsIfNeeded/runRelegationBarrage (voir
  // server/autoSim.js:catchUpPlayoffs, qui n'appelle ces deux méthodes
  // qu'APRÈS que finalizeRound soit revenue pour la dernière journée) :
  // League.standings() y reflète donc le classement définitif de la saison
  // régulière, mais ni le barrage ni les play-offs n'ont encore eu lieu,
  // exactement le moment demandé. Automatique et immédiat (pas d'interview
  // à résoudre, contrairement aux jalons "mi-saison"/"fin-saison-reguliere"
  // classiques ci-dessus, qui restent par ailleurs inchangés) : une équipe
  // humaine peut ainsi recevoir à la fois l'interview de jalon (résultat du
  // match) ET ce signal séparé (objectif de saison), les deux à la même
  // journée mais sans rapport l'un avec l'autre. Pour CHAQUE équipe humaine
  // concernée par cette journée (solo comme multi-manager, voir
  // Team.isHuman plus haut), jamais pour une équipe CPU.
  const paceSignalFn = milestone === "mi-saison" ? seasonObjectiveMidSeasonSignal
    : milestone === "fin-saison-reguliere" ? seasonObjectiveEndOfRegularSeasonSignal
    : null;
  if (paceSignalFn) {
    userResults.forEach(r => {
      // Retour utilisateur (2026-09) : "pour les équipes de milieu de
      // classement (ni PO ni barrage) et celles qui descendent tout de
      // suite, il ne faut pas qu'un signal et pas deux [...] la fin de la
      // saison régulière correspond à la fin de la saison pour ces
      // équipes là" : pour CES équipes précisément (rang 5-6 ou 9-10, voir
      // Engine.seasonAchievementTier qui leur donne désormais un palier
      // définitif dès ce point, sans attendre play-offs/barrage),
      // `seasonObjectiveVerdict` renvoie déjà le VRAI verdict de fin de
      // saison ici même : on l'applique directement à la place du simple
      // aperçu provisoire, jamais les deux. `Team.
      // seasonObjectiveVerdictSettled` (voir son commentaire côté moteur)
      // empêche qu'il soit réappliqué une seconde fois plus tard (voir
      // startNewSeason côté navigateur). Pour toute autre équipe humaine
      // (rang 1-4 ou 7-8, sort encore à décider), rien ne change : simple
      // aperçu provisoire ici, vrai verdict plus tard une fois leur saison
      // réellement terminée.
      if (milestone === "fin-saison-reguliere") {
        const settledVerdict = seasonObjectiveVerdict(league, r.teamIdx);
        if (settledVerdict) {
          league.teams[r.teamIdx].recordMoraleEvent(settledVerdict.label, settledVerdict.delta);
          league.teams[r.teamIdx].seasonObjectiveVerdictSettled = true;
          r.seasonObjectiveSignal = settledVerdict;
          return;
        }
      }
      const signal = paceSignalFn(league, r.teamIdx);
      if (!signal) return;
      league.teams[r.teamIdx].recordMoraleEvent(signal.label, signal.delta);
      r.seasonObjectiveSignal = signal;
    });
  }

  // Émissions avant-match/mi-temps + pronostics (voir showResults plus haut,
  // DEV_NOTES.md point 11) : résolution des pronostics déjà publiés pour
  // cette journée, maintenant que tous les scores/quarterScores sont connus.
  // `require` PARESSEUX (jamais en tête de fichier) : server/shows.js
  // requiert lui-même ce fichier (pour HALFTIME_BREAK_MS) — un require en
  // tête créerait une dépendance circulaire ; appelé ici, les deux modules
  // sont déjà complètement chargés (finalizeRound n'est jamais invoquée
  // pendant l'initialisation des modules). Entièrement protégé par
  // try/catch : voir le grand commentaire de Shows.resolveRoundShowsSync,
  // jamais une raison d'empêcher la finalisation d'une journée de match.
  try {
    require("./shows.js").resolveRoundShowsSync(league, round, showResults, now);
  } catch (e) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(`[hoop-shows] résolution journée ${round} échouée : ${e && e.message}`);
    }
  }

  league.advanceRound();
  return { type: "match", round, userResults };
}

// Vue PERSONNALISÉE du match en direct de `teamIndex`, si son équipe en a un
// en cours cette journée (voir league.liveMatches) — sinon `null`. Reprend
// EXACTEMENT la forme historique d'un league.liveMatch solo ({round,
// kickoffAt, isHome, opponentIdx, forfeit, finalScore, events, pauses,
// totalDurationMs, boxScoreA, boxScoreB}, "A" = TOUJOURS l'équipe du
// spectateur) : le navigateur n'a besoin d'AUCUN changement pour continuer à
// l'afficher — voir server/index.js, qui appelle cette fonction pour
// remplir league.liveMatch (le champ de confort, jamais league.liveMatches
// au pluriel) juste avant de répondre à CE destinataire précis. Un match
// canonique est toujours stocké "A = domicile" (voir computeLiveMatch) :
// pour un spectateur à l'extérieur, on doit donc échanger A<->B dans les
// événements/box-scores AVANT de les renvoyer — jamais re-simuler.
function viewLiveMatchForTeam(league, teamIndex) {
  if (!league.liveMatches) return null;
  const entry = Object.values(league.liveMatches).find(
    m => m.homeIdx === teamIndex || m.awayIdx === teamIndex
  );
  if (!entry) return null;

  const isHome = entry.homeIdx === teamIndex;
  const opponentIdx = isHome ? entry.awayIdx : entry.homeIdx;

  // `competition` ("championship"/"cup", voir computeLiveMatch) : absent
  // pour une entrée d'avant ce champ (rétro-compatible) — "championship" par
  // défaut, comme c'était implicitement le cas.
  const competition = entry.competition || "championship";

  if (isHome) {
    return {
      round: entry.round, kickoffAt: entry.kickoffAt, isHome: true, opponentIdx, competition,
      forfeit: entry.forfeit, finalScore: entry.finalScore,
      events: entry.events, pauses: entry.pauses, totalDurationMs: entry.totalDurationMs,
      boxScoreA: entry.boxScoreA, boxScoreB: entry.boxScoreB,
    };
  }

  // Spectateur à l'extérieur : échange A<->B partout où ça compte (mais
  // JAMAIS finalScore, qui est déjà absolu en repère home/away — voir
  // liveMatchScoreAB côté navigateur, qui s'appuie déjà sur `isHome` pour le
  // relire correctement quel que soit le camp du spectateur).
  //
  // BUG corrigé (retour utilisateur, 2026-09 : "il y a un pb d'affichage,
  // bc dia est à l'exterieur [...] j'ai l'impression que tu mets
  // systematique l'équipe qui est sur sa session à gauche dans le live") :
  // `ev.score` (le score A/B COURANT à cet instant précis du match, voir
  // MatchEngine.log) n'était PAS échangé ici, alors que `ev.team`/
  // `ev.possession` l'étaient déjà. Résultat pour un spectateur à
  // l'extérieur : le tableau de score et les cases par quart-temps (remplis
  // en direct à partir de `ev.score`, voir applyEvent/fillQuarterBar côté
  // navigateur) restaient en repère domicile/extérieur BRUT, alors que le
  // nom de son équipe restait affiché du côté "A" (repère "ma propre
  // équipe" attendu partout ailleurs). Un match à l'extérieur affichait
  // donc son propre score à la place de celui de l'adversaire, et
  // inversement, pendant toute la diffusion (le score final, lui, restait
  // correct : voir liveMatchScoreAB, déjà basé sur `isHome`, pas sur ce
  // repère événement par événement).
  const swapTeamLabel = (label) => (label === "A" ? "B" : label === "B" ? "A" : label);
  const events = entry.events.map(ev => ({
    ...ev,
    ...(ev.team !== undefined ? { team: swapTeamLabel(ev.team) } : null),
    ...(ev.possession !== undefined ? { possession: swapTeamLabel(ev.possession) } : null),
    ...(ev.score !== undefined ? { score: { A: ev.score.B, B: ev.score.A } } : null),
  }));

  return {
    round: entry.round, kickoffAt: entry.kickoffAt, isHome: false, opponentIdx, competition,
    forfeit: entry.forfeit, finalScore: entry.finalScore,
    events, pauses: entry.pauses, totalDurationMs: entry.totalDurationMs,
    boxScoreA: entry.boxScoreB, boxScoreB: entry.boxScoreA,
  };
}

// Liste ALLÉGÉE (retour utilisateur, 2026-09-24 : "pouvoir regarder le live
// d'une autre équipe depuis son calendrier" — voir DEV_NOTES.md) de TOUS les
// matchs actuellement en direct (league.liveMatches, PLURIEL) — SANS le
// contenu du match (événements/scores), volontairement : cette liste sert
// uniquement à savoir QUELLES équipes sont actuellement en direct, pour
// afficher un bouton "🔴 En direct" sur la fiche d'une équipe adverse (voir
// server/index.js:/api/live-status et moteurbasket3.html). Le contenu
// complet (et personnalisé, A = équipe suivie) n'est renvoyé qu'à la demande
// explicite du spectateur, voir /api/spectate et viewLiveMatchForTeam
// ci-dessus — jamais poussé automatiquement à tout le monde. Portée
// VOLONTAIREMENT limitée aux matchs DÉJÀ dans league.liveMatches (décision
// utilisateur du 2026-09-24, "Limiter aux matchs déjà en direct") : un match
// CPU-vs-CPU n'y apparaît jamais (voir server/autoSim_test.js) et cette
// fonction ne change rien à cette architecture délibérée.
function liveMatchesLiteFor(league) {
  if (!league.liveMatches) return [];
  return Object.values(league.liveMatches).map(m => ({
    homeIdx: m.homeIdx, awayIdx: m.awayIdx, round: m.round, competition: m.competition || "championship",
  }));
}

module.exports = {
  HALFTIME_BREAK_MS, QUARTER_BREAK_MS, OVERTIME_BREAK_MS, TIMEOUT_BREAK_MS, TIMEOUTS_PER_QUARTER,
  SECONDS_SCALE_MS, MIN_EVENT_GAP_MS,
  schedulePlayback, liveMatchKey, computeLiveMatch, ensureLiveMatchStarted, finalizeRound, viewLiveMatchForTeam,
  liveMatchesLiteFor,
  // Coupe (voir le bloc dédié plus haut) :
  cupLiveMatchKey, ensureCupLiveMatchStarted, finalizeCupRound,
  // Play-offs (voir le bloc dédié plus haut) :
  ensurePlayoffLiveMatchStarted, finalizePlayoffRound,
};
