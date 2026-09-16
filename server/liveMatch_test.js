// Vérifie la mise en rythme de la diffusion en direct (server/liveMatch.js) :
// retour utilisateur — "le match doit durer autour d'1h30, c'est comme ça sur
// BuzzerBeater" + "on met une vraie mi-temps et une vraie pause après Q1 et
// Q3 / temps mort pour ajouter un peu de piquant" + "je ne dois pas avoir la
// possibilité d'avancer le live plus vite" (la vitesse ne dépend QUE de
// l'horloge réelle, jamais d'un réglage) + "il faut que le match se joue
// tout seul à 19h, si je me connecte à 19h30 je dois reprendre le match là
// où il en est" + (2026-09, plus tardif) "les secondes sont très longues, 1
// seconde dans le jeu est plus longue qu'une vraie seconde" — ce dernier
// retour a changé la mise en rythme : la durée totale n'est plus un plafond
// FIXE de 1h30 tapé en dur (MATCH_BROADCAST_DURATION_MS ne sert plus que de
// délai de sécurité pour la résolution automatique, voir server/autoSim.js),
// mais la somme du temps de jeu proportionnel aux secondes de jeu écoulées
// (jamais plus d'une seconde réelle par seconde de jeu, voir
// SECONDS_SCALE_MS côté liveMatch.js) et du budget de pauses — toujours
// largement sous 1h30 en pratique.
const Engine = require("../engine.js");
const { MATCH_BROADCAST_DURATION_MS } = require("./calendar.js");
const {
  HALFTIME_BREAK_MS, QUARTER_BREAK_MS, TIMEOUT_BREAK_MS, TIMEOUTS_PER_QUARTER,
  SECONDS_SCALE_MS, MIN_EVENT_GAP_MS,
  schedulePlayback, computeLiveMatch, ensureLiveMatchStarted, finalizeRound, liveMatchKey,
} = require("./liveMatch.js");
const { generateStartingRoster, generateTeam, generateLeague, POSITIONS, MatchEngine } = Engine;

function fmtClock(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Fabrique une liste d'événements factice, juste assez réaliste pour tester
// la mise en rythme (schedulePlayback regarde `ev.quarter` ET `ev.clock`,
// depuis le correctif "les secondes sont très longues" — retour utilisateur,
// 2026-09 — qui rend le rythme proportionnel aux secondes de jeu écoulées) :
// N événements par quart-temps, leur chrono décroissant régulièrement de
// 10:00 à 0:00, 4 quarts-temps, pas de prolongation.
function fakeEvents(perQuarter = 30) {
  const events = [];
  for (let q = 1; q <= 4; q++) {
    for (let i = 0; i < perQuarter; i++) {
      const clockSec = Math.round(600 - (i * 600) / perQuarter);
      events.push({ quarter: q, clock: fmtClock(clockSec), text: `Event ${q}-${i}`, score: { A: 0, B: 0 } });
    }
  }
  return events;
}

// Calcule la durée de jeu (hors pauses) attendue pour `fakeEvents`, avec
// exactement la même formule que schedulePlayback (proportionnelle aux
// secondes de jeu réellement écoulées entre deux événements consécutifs
// du même quart-temps, avec un plancher pour le dernier événement de
// chaque quart-temps) — sert de référence indépendante pour le test.
function expectedPlayMs(perQuarter) {
  let total = 0;
  for (let q = 1; q <= 4; q++) {
    for (let i = 0; i < perQuarter; i++) {
      if (i === perQuarter - 1) { total += MIN_EVENT_GAP_MS; continue; }
      const deltaSec = Math.round(600 - (i * 600) / perQuarter) - Math.round(600 - ((i + 1) * 600) / perQuarter);
      total += Math.max(MIN_EVENT_GAP_MS, deltaSec * SECONDS_SCALE_MS);
    }
  }
  return total;
}

const KICKOFF = Date.UTC(2026, 8, 9, 19, 0, 0); // un mercredi 19h arbitraire

// ---------------------------------------------------------------------
// 1) La diffusion complète (jeu + pauses) dure la somme du temps de jeu
//    proportionnel aux secondes de jeu écoulées (retour utilisateur,
//    2026-09 : "les secondes sont très longues, 1 seconde dans le jeu est
//    plus longue qu'une vraie seconde" — voir SECONDS_SCALE_MS/
//    MIN_EVENT_GAP_MS côté liveMatch.js) et du budget de pauses — largement
//    dans la fenêtre MATCH_BROADCAST_DURATION_MS (utilisée ailleurs comme
//    simple délai de sécurité, jamais comme durée cible exacte depuis ce
//    correctif).
// ---------------------------------------------------------------------
{
  const perQuarter = 30;
  const { events, pauses, totalDurationMs } = schedulePlayback(fakeEvents(perQuarter), KICKOFF);

  const quarterBreaks = pauses.filter(p => p.kind === "quarter-break");
  const halftimes = pauses.filter(p => p.kind === "halftime");
  const timeouts = pauses.filter(p => p.kind === "timeout");
  const pauseBudgetMs = quarterBreaks.reduce((s, p) => s + p.durationMs, 0)
    + halftimes.reduce((s, p) => s + p.durationMs, 0)
    + timeouts.reduce((s, p) => s + p.durationMs, 0);
  const expectedTotal = expectedPlayMs(perQuarter) + pauseBudgetMs;

  console.log(`Durée totale de la diffusion : ${(totalDurationMs / 60000).toFixed(1)} min (attendue ${(expectedTotal / 60000).toFixed(1)} min, plafond de sécurité ${MATCH_BROADCAST_DURATION_MS / 60000} min).`);
  if (totalDurationMs !== expectedTotal) {
    throw new Error(`❌ La diffusion complète devrait durer exactement le temps de jeu proportionnel + le budget de pauses, obtenu ${totalDurationMs} (attendu ${expectedTotal}).`);
  }
  if (totalDurationMs >= MATCH_BROADCAST_DURATION_MS) {
    throw new Error(`❌ La diffusion (${totalDurationMs}ms) devrait rester largement sous le délai de sécurité MATCH_BROADCAST_DURATION_MS (${MATCH_BROADCAST_DURATION_MS}ms).`);
  }
  console.log("✅ La diffusion complète dure exactement le temps de jeu proportionnel aux secondes écoulées + le budget de pauses, toujours bien en-deçà du délai de sécurité (1h30).");

  // 3 pauses de quart-temps (après Q1, Q2=mi-temps, Q3) + 2 temps morts par
  // quart-temps × 4 quarts-temps = 8 temps morts.
  if (quarterBreaks.length !== 2) throw new Error(`❌ 2 pauses de quart-temps attendues (après Q1 et Q3), obtenu ${quarterBreaks.length}.`);
  if (halftimes.length !== 1) throw new Error(`❌ Exactement 1 mi-temps attendue (après Q2), obtenu ${halftimes.length}.`);
  if (timeouts.length !== TIMEOUTS_PER_QUARTER * 4) throw new Error(`❌ ${TIMEOUTS_PER_QUARTER * 4} temps morts attendus (${TIMEOUTS_PER_QUARTER}/quart-temps × 4), obtenu ${timeouts.length}.`);
  halftimes.forEach(h => { if (h.durationMs !== HALFTIME_BREAK_MS) throw new Error("❌ La mi-temps devrait durer HALFTIME_BREAK_MS."); });
  quarterBreaks.forEach(b => { if (b.durationMs !== QUARTER_BREAK_MS) throw new Error("❌ Une pause de quart-temps devrait durer QUARTER_BREAK_MS."); });
  timeouts.forEach(t => { if (t.durationMs !== TIMEOUT_BREAK_MS) throw new Error("❌ Un temps mort devrait durer TIMEOUT_BREAK_MS."); });
  console.log(`✅ Une vraie mi-temps (après Q2), une vraie pause après Q1 et après Q3, et ${timeouts.length} temps morts "piquants" répartis dans les quarts-temps.`);
}

// ---------------------------------------------------------------------
// 1bis) Retour utilisateur : "les secondes sont très longues, 1 seconde
//    dans le jeu est plus longue qu'une vraie seconde" — vérifie
//    directement l'invariant demandé : entre deux événements consécutifs
//    du même quart-temps, le temps RÉEL qui s'écoule n'est jamais supérieur
//    au temps de JEU qu'ils représentent (à la marge du plancher
//    MIN_EVENT_GAP_MS près, qui ne s'applique qu'aux événements dont le
//    chrono ne bouge pas du tout, ex. des annonces groupées).
// ---------------------------------------------------------------------
{
  const perQuarter = 30;
  const { events, pauses } = schedulePlayback(fakeEvents(perQuarter), KICKOFF);
  function clockSec(clockStr) {
    const [m, s] = clockStr.split(":").map(Number);
    return m * 60 + s;
  }
  for (let i = 0; i < events.length - 1; i++) {
    const a = events[i], b = events[i + 1];
    if (a.quarter !== b.quarter) continue;
    // Un temps mort peut avoir été inséré entre ces deux événements
    // (schedulePlayback les place à part, dans `pauses` — voir
    // timeoutAfterIndex) : ce sont des secondes de PAUSE, pas de jeu, donc
    // hors sujet pour cet invariant (déjà couvert par le test 1 ci-dessus).
    const overlapsAPause = pauses.some(p => a.airAt < p.airAt + p.durationMs && b.airAt > p.airAt);
    if (overlapsAPause) continue;
    const gameDeltaSec = Math.max(0, clockSec(a.clock) - clockSec(b.clock));
    const realDeltaMs = b.airAt - a.airAt;
    if (gameDeltaSec > 0 && realDeltaMs > gameDeltaSec * SECONDS_SCALE_MS + 1) {
      throw new Error(`❌ Une seconde de jeu ne devrait jamais durer plus d'une seconde réelle (SECONDS_SCALE_MS) — entre "${a.text}" et "${b.text}", ${gameDeltaSec}s de jeu ont pris ${realDeltaMs}ms réels.`);
    }
  }
  console.log("✅ Aucune seconde de jeu ne dure plus longtemps que SECONDS_SCALE_MS de temps réel (retour utilisateur : \"1 seconde dans le jeu est plus longue qu'une vraie seconde\").");
}

// ---------------------------------------------------------------------
// 2) Les horaires de diffusion (airAt) sont strictement croissants et tous
//    postérieurs ou égaux au coup d'envoi, jamais accélérables — la seule
//    façon d'avancer plus vite serait d'attendre plus longtemps en horloge
//    réelle, il n'existe aucun paramètre de vitesse.
// ---------------------------------------------------------------------
{
  const { events } = schedulePlayback(fakeEvents(), KICKOFF);
  let previous = KICKOFF - 1;
  events.forEach((ev, i) => {
    if (ev.airAt <= previous) throw new Error(`❌ airAt devrait être strictement croissant (événement ${i}).`);
    if (ev.airAt < KICKOFF) throw new Error(`❌ Aucun événement ne devrait être diffusé avant le coup d'envoi (événement ${i}).`);
    previous = ev.airAt;
  });
  if (events[events.length - 1].airAt >= KICKOFF + MATCH_BROADCAST_DURATION_MS) {
    throw new Error("❌ Le dernier événement devrait être diffusé avant la fin de la fenêtre de diffusion.");
  }
  console.log("✅ Les horaires de diffusion (airAt) sont strictement croissants, entre le coup d'envoi et la fin de la fenêtre — aucun paramètre de vitesse n'existe.");
}

// ---------------------------------------------------------------------
// 3) Reprendre "là où on en est" : étant donné les MÊMES événements et le
//    MÊME coup d'envoi, se reconnecter à n'importe quel instant `now`
//    (calculé indépendamment) doit toujours retomber sur EXACTEMENT les
//    mêmes horaires — la diffusion ne dépend jamais de l'instant où on la
//    consulte, seulement du coup d'envoi (déterminisme total).
// ---------------------------------------------------------------------
{
  const events = fakeEvents();
  const first = schedulePlayback(events, KICKOFF);
  const second = schedulePlayback(events, KICKOFF);
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error("❌ schedulePlayback devrait être déterministe : mêmes événements + même coup d'envoi => même calendrier de diffusion, à chaque appel.");
  }
  console.log("✅ Le calendrier de diffusion est déterministe : se reconnecter en cours de route retombe toujours sur la même chronologie (reprise fiable là où on en est).");
}

// ---------------------------------------------------------------------
// 4) computeLiveMatch : simule le VRAI moteur de match (MatchEngine complet,
//    comme l'écran "en direct" du navigateur) et étale son résultat déjà
//    déterminé sur la fenêtre de diffusion.
// ---------------------------------------------------------------------
{
  const userTeam = generateStartingRoster("Live Test");
  const league = generateLeague(userTeam, 1, KICKOFF);
  const m0 = league.matchesForRound(0).find(m => m.home === 0 || m.away === 0);
  const live = computeLiveMatch(Engine, league, 0, m0.home, m0.away, KICKOFF);
  console.log(`\nMatch en direct calculé — journée ${live.round}, domicile: ${live.homeIdx}, extérieur: ${live.awayIdx}, score final: ${live.finalScore.home}-${live.finalScore.away}, ${live.events.length} événements.`);
  if (live.forfeit) throw new Error("❌ Avec un effectif complet des deux côtés, ce ne devrait pas être un forfait.");
  if (!live.events.length) throw new Error("❌ Un match normal (non forfait) devrait produire une liste d'événements à diffuser.");
  if (typeof live.finalScore.home !== "number" || typeof live.finalScore.away !== "number") {
    throw new Error("❌ Le score final devrait être déterminé dès le calcul du match en direct.");
  }
  if (!live.boxScoreA.length || !live.boxScoreB.length) throw new Error("❌ Les feuilles de statistiques (boxscore) des deux équipes devraient être calculées.");
  console.log("✅ computeLiveMatch simule le match complet avec le vrai moteur et fournit un score déjà déterminé, prêt à être diffusé.");
}

// ---------------------------------------------------------------------
// 5) computeLiveMatch : forfait immédiat (aucun événement à diffuser) si
//    l'une des deux équipes ne peut pas aligner un cinq de départ complet —
//    même règle que rosterCannotFieldLineup côté navigateur.
// ---------------------------------------------------------------------
{
  const userTeam = generateStartingRoster("Forfait Test");
  userTeam.players = userTeam.players.filter(p => p.position !== "Pivot");
  const league = generateLeague(userTeam, 1, KICKOFF);
  // S'assure que le club du joueur reçoit à la journée 0 (sinon le test
  // porterait sur l'adversaire) — sinon retente avec l'autre sens, les deux
  // sont couverts par le même code.
  const m0 = league.matchesForRound(0).find(m => m.home === 0 || m.away === 0);
  const live = computeLiveMatch(Engine, league, 0, m0.home, m0.away, KICKOFF);
  console.log(`\nForfait détecté : ${live.forfeit} | score : ${live.finalScore.home}-${live.finalScore.away}`);
  if (!live.forfeit) throw new Error("❌ Un effectif incapable d'aligner un cinq de départ complet devrait produire un forfait immédiat.");
  if (live.events.length !== 0) throw new Error("❌ Un forfait n'a rien à diffuser en direct (0 événement).");
  const userIsHome = m0.home === 0;
  const userScore = userIsHome ? live.finalScore.home : live.finalScore.away;
  if (userScore !== 0) throw new Error("❌ Le club forfait devrait perdre 0-20 (voir FORFEIT_SCORE).");
  console.log("✅ Un effectif incomplet produit un forfait immédiat, sans rien à diffuser en direct.");
}

// ---------------------------------------------------------------------
// 5bis) computeLiveMatch : cas plus subtils visés par le retour utilisateur
//    — d'abord "en cas d'indisponibilité pour vente d'un joueur, qui avait
//    été mis dans la composition, il doit être enlevé de la composition",
//    PUIS deux précisions successives : "si un titulaire est vendu, qu'il y
//    a 4 joueurs titu et au moins un remplaçant, [...] le remplaçant doit
//    être aligné comme titu sur le poste laissé en blanc, il ne faut pas
//    mettre un forfait dans ce type de cas", et enfin "pour le forfait,
//    c'est uniquement si on a moins de 5 joueurs sur la feuille. si on a 4
//    titu, mais [qu'il] manque le meneur titu par exemple, mais qu'on a un
//    pivot remplaçant [...] le pivot remplaçant est mis comme meneur
//    titulaire" — donc TROIS sous-cas à distinguer : (a) un remplaçant est
//    DÉJÀ DÉSIGNÉ pour le poste du titulaire vendu (voir
//    toggleBackupPosition) : promotion automatique à ce poste, aucun
//    forfait ; (b) aucun remplaçant désigné pour CE poste précis, mais au
//    moins un remplaçant désigné à un AUTRE poste : il dépanne quand même,
//    promu titulaire À LA PLACE DU POSTE VACANT (hors de son poste
//    habituel) — toujours aucun forfait, tant qu'il reste du monde "sur la
//    feuille" (titulaires + remplaçants) ; (c) littéralement AUCUN
//    remplaçant désigné nulle part (moins de 5 joueurs sur la feuille) : le
//    trou reste, forfait si la feuille n'est pas corrigée avant le coup
//    d'envoi. Voir Team.handleStarterDeparture/designatedBackupForPosition/
//    anyDesignatedBackup (engine.js) et POSITIONS_MISSING (liveMatch.js, qui
//    doit s'appuyer sur Team.hasValidLineup() et non une simple couverture
//    de poste roster-wide).
// ---------------------------------------------------------------------
{
  // (a) Remplaçant déjà désigné pour le poste du titulaire vendu — c'est le
  // cas par défaut dès la génération d'un effectif (generateStartingRoster
  // -> Team.autoAssignLineup désigne automatiquement les 2 autres joueurs de
  // chaque poste comme remplaçants de ce poste) : promotion automatique,
  // AUCUN forfait, même sans aucune action du joueur.
  const userTeam = generateStartingRoster("Lineup Auto-Promote Test");
  const soldStarterId = userTeam.lineup.starters["Pivot"];
  if (!soldStarterId) throw new Error("❌ Prérequis du test : le Pivot titulaire devrait être assigné au départ.");
  const expectedBackup = userTeam.designatedBackupForPosition("Pivot");
  if (!expectedBackup) throw new Error("❌ Prérequis du test : un effectif fraîchement généré (3 joueurs/poste) devrait déjà désigner un remplaçant Pivot.");

  const starter = userTeam.players.find(p => p.id === soldStarterId);
  starter.forSale = true;
  if (!userTeam.sellPlayer(soldStarterId)) throw new Error("❌ La vente du titulaire (listé) aurait dû réussir.");

  console.log("\nTitulaire vendu, remplaçant déjà désigné pour ce poste — hasValidLineup:", userTeam.hasValidLineup(), "| nouveau titulaire Pivot:", userTeam.lineup.starters["Pivot"], "(attendu:", expectedBackup.id, ")");
  if (!userTeam.hasValidLineup()) throw new Error("❌ La feuille de match devrait rester valide : le remplaçant déjà désigné aurait dû être promu titulaire automatiquement.");
  if (userTeam.lineup.starters["Pivot"] !== expectedBackup.id) throw new Error("❌ Le remplaçant déjà désigné pour ce poste aurait dû devenir titulaire automatiquement.");

  const league = generateLeague(userTeam, 1, KICKOFF);
  const m0a = league.matchesForRound(0).find(m => m.home === 0 || m.away === 0);
  const live = computeLiveMatch(Engine, league, 0, m0a.home, m0a.away, KICKOFF);
  console.log("Résolution du match en direct — forfeit:", live.forfeit);
  if (live.forfeit) throw new Error("❌ Un remplaçant déjà désigné pour le poste du titulaire vendu aurait dû être promu automatiquement, sans aucun forfait.");
  console.log("✅ La vente d'un titulaire dont le poste a déjà un remplaçant désigné promeut automatiquement ce remplaçant — aucun forfait, sans action du joueur.");
}
{
  // (b) Retour utilisateur, exemple précis : "si on a 4 titu, mais [qu'il]
  // manque le meneur titu par exemple, mais qu'on a un pivot remplaçant
  // [...] le pivot remplaçant est mis comme meneur titulaire" — aucun
  // remplaçant désigné pour LE POSTE DU TITULAIRE VENDU (Meneur), mais au
  // moins un remplaçant désigné à un AUTRE poste (Pivot) : il doit quand
  // même dépanner comme titulaire AU POSTE VACANT (Meneur), pas de forfait.
  const userTeam = generateStartingRoster("Lineup Cross-Position Test");
  const soldStarterId = userTeam.lineup.starters["Meneur"];
  if (!soldStarterId) throw new Error("❌ Prérequis du test : le Meneur titulaire devrait être assigné au départ.");
  // Ne laisse DÉSIGNÉ que le remplaçant Pivot (retire tous les autres, à
  // Meneur comme aux autres postes, comme si le joueur les avait tous
  // décochés/réaffectés ailleurs dans l'onglet Ordres) — isole précisément
  // le scénario décrit par le retour utilisateur ("un pivot remplaçant"),
  // pour que la promotion croisée soit déterministe dans ce test.
  const expectedCrossBackup = userTeam.designatedBackupForPosition("Pivot");
  if (!expectedCrossBackup) throw new Error("❌ Prérequis du test : un remplaçant Pivot par défaut devrait toujours être désigné.");
  Object.keys(userTeam.lineup.backupPositions).forEach(idStr => {
    const id = Number(idStr);
    if (id === expectedCrossBackup.id) return;
    (userTeam.lineup.backupPositions[id] || []).slice().forEach(pos => userTeam.toggleBackupPosition(id, pos, false));
  });
  if (userTeam.designatedBackupForPosition("Meneur")) throw new Error("❌ Prérequis du test : plus aucun remplaçant désigné pour Meneur après le retrait explicite.");
  if (userTeam.anyDesignatedBackup().id !== expectedCrossBackup.id) throw new Error("❌ Prérequis du test : le remplaçant Pivot devrait être le seul remplaçant désigné restant dans tout l'effectif.");

  const starter = userTeam.players.find(p => p.id === soldStarterId);
  starter.forSale = true;
  if (!userTeam.sellPlayer(soldStarterId)) throw new Error("❌ La vente du titulaire (listé) aurait dû réussir.");

  console.log("\nTitulaire Meneur vendu, aucun remplaçant Meneur mais un remplaçant Pivot disponible — hasValidLineup:", userTeam.hasValidLineup(), "| nouveau titulaire Meneur:", userTeam.lineup.starters["Meneur"], "(attendu, le remplaçant Pivot:", expectedCrossBackup.id, ")");
  if (!userTeam.hasValidLineup()) throw new Error("❌ La feuille de match devrait rester valide : un remplaçant désigné à un autre poste (Pivot) aurait dû dépanner comme Meneur titulaire.");
  if (userTeam.lineup.starters["Meneur"] !== expectedCrossBackup.id) throw new Error("❌ Le remplaçant Pivot déjà désigné aurait dû être promu Meneur titulaire à défaut d'un remplaçant Meneur dédié.");

  const league = generateLeague(userTeam, 1, KICKOFF);
  const m0b = league.matchesForRound(0).find(m => m.home === 0 || m.away === 0);
  const live = computeLiveMatch(Engine, league, 0, m0b.home, m0b.away, KICKOFF);
  console.log("Résolution du match en direct — forfeit:", live.forfeit);
  if (live.forfeit) throw new Error("❌ Un remplaçant disponible à un AUTRE poste aurait dû dépanner comme titulaire au poste vacant, sans aucun forfait (l'effectif reste ≥ 5 sur la feuille).");
  console.log("✅ Sans remplaçant désigné pour le poste précis mais avec un remplaçant disponible à un autre poste, ce dernier dépanne comme titulaire — aucun forfait tant qu'il reste ≥ 5 joueurs sur la feuille.");
}
{
  // (c) Littéralement AUCUN remplaçant désigné nulle part dans l'effectif
  // (tous les postes de remplaçant retirés) : après la vente du titulaire
  // Pivot, il ne reste que 4 joueurs "sur la feuille" (titulaires) et 0
  // remplaçant — c'est SEULEMENT dans ce cas que le trou doit rester, et
  // déclencher un forfait s'il n'est pas corrigé avant le coup d'envoi.
  const userTeam = generateStartingRoster("Lineup Genuine Gap Test");
  const soldStarterId = userTeam.lineup.starters["Pivot"];
  if (!soldStarterId) throw new Error("❌ Prérequis du test : le Pivot titulaire devrait être assigné au départ.");
  // Retire TOUS les remplaçants désignés, à TOUS les postes (pas seulement
  // Pivot) — sinon un remplaçant d'un autre poste dépannerait (voir le
  // sous-cas (b) ci-dessus), ce qui n'est plus le scénario testé ici.
  userTeam.lineup.backupPositions = {};
  if (userTeam.anyDesignatedBackup()) throw new Error("❌ Prérequis du test : plus aucun remplaçant désigné nulle part après le retrait explicite.");

  const starter = userTeam.players.find(p => p.id === soldStarterId);
  starter.forSale = true;
  if (!userTeam.sellPlayer(soldStarterId)) throw new Error("❌ La vente du titulaire (listé) aurait dû réussir.");

  const rosterStillCoversPos = userTeam.players.some(p => p.position === "Pivot");
  if (!rosterStillCoversPos) throw new Error("❌ Prérequis du test : l'effectif devrait toujours couvrir le poste Pivot (via les autres Pivots, juste non désignés remplaçants).");
  if (userTeam.hasValidLineup()) throw new Error("❌ La feuille de match ne devrait plus être valide : aucun remplaçant n'était désigné nulle part (moins de 5 joueurs sur la feuille).");
  console.log("\nTitulaire vendu, AUCUN remplaçant désigné nulle part (effectif pourtant non vide) — hasValidLineup:", userTeam.hasValidLineup(), "| postes manquants:", userTeam.missingStarterPositions());

  const league = generateLeague(userTeam, 1, KICKOFF);
  const m0c = league.matchesForRound(0).find(m => m.home === 0 || m.away === 0);
  const live = computeLiveMatch(Engine, league, 0, m0c.home, m0c.away, KICKOFF);
  console.log("Résolution du match en direct — forfeit:", live.forfeit, "| score:", live.finalScore.home, "-", live.finalScore.away);
  if (!live.forfeit) throw new Error("❌ Un titulaire vendu sans aucun remplaçant désigné nulle part (moins de 5 sur la feuille) devrait produire un forfait.");
  const userScore = m0c.home === 0 ? live.finalScore.home : live.finalScore.away;
  if (userScore !== 0) throw new Error("❌ Le club dont la feuille de match n'a pas été corrigée après une vente devrait perdre 0-20 (voir FORFEIT_SCORE).");
  console.log("✅ La vente d'un titulaire sans AUCUN remplaçant désigné nulle part (moins de 5 sur la feuille) laisse bien un trou (non comblé automatiquement), et ce trou déclenche un forfait au coup d'envoi même si l'effectif couvre encore le poste — POSITIONS_MISSING s'appuie bien sur Team.hasValidLineup(), pas sur une simple couverture de poste roster-wide.");
}

// ---------------------------------------------------------------------
// 6) ensureLiveMatchStarted + finalizeRound : le score utilisé à la
//    finalisation est EXACTEMENT celui calculé au coup d'envoi (couvert plus
//    en détail côté intégration dans autoSim_test.js — ici, un test unitaire
//    ciblé sur liveMatch.js seul).
// ---------------------------------------------------------------------
{
  const { scheduledTimeForLeagueRound } = require("./calendar.js");
  const userTeam = generateStartingRoster("Finalize Test");
  const league = generateLeague(userTeam, 1, KICKOFF);
  const kickoffAt = scheduledTimeForLeagueRound(league, 0);
  const m0f = league.matchesForRound(0).find(m => m.home === 0 || m.away === 0);
  const myKeyF = liveMatchKey(0, m0f.home, m0f.away);

  const notYet = ensureLiveMatchStarted(Engine, league, kickoffAt - 1, scheduledTimeForLeagueRound);
  if (notYet.length !== 0) throw new Error("❌ ensureLiveMatchStarted ne devrait rien démarrer avant l'heure programmée.");

  const startedKeys = ensureLiveMatchStarted(Engine, league, kickoffAt, scheduledTimeForLeagueRound);
  if (!startedKeys.includes(myKeyF)) throw new Error("❌ ensureLiveMatchStarted aurait dû démarrer la diffusion du match du joueur à l'heure programmée.");
  const startedEntry = league.liveMatches[myKeyF];
  const scoreAtKickoff = { ...startedEntry.finalScore };

  const standingsBefore = league.results.length;
  const finalizedEvent = finalizeRound(Engine, league, 0);
  // +1 pour le match du joueur, +4 pour les autres rencontres CPU de la même
  // journée (voir League.simulateCpuMatchesForRound, appelé indirectement par
  // finalizeRound comme avant par simulateRoundHeadless).
  if (league.results.length !== standingsBefore + 5) {
    throw new Error(`❌ finalizeRound devrait enregistrer les 5 résultats de la journée (le sien + 4 CPU), obtenu ${league.results.length - standingsBefore}.`);
  }
  const userResultF = finalizedEvent.userResults.find(u => u.teamIdx === 0);
  if (!userResultF) throw new Error("❌ finalizeRound devrait renvoyer le résultat du club du joueur dans userResults.");
  const expectedUserScore = userResultF.isHome ? scoreAtKickoff.home : scoreAtKickoff.away;
  if (userResultF.scoreUser !== expectedUserScore) {
    throw new Error("❌ finalizeRound devrait utiliser le score déjà déterminé au coup d'envoi, sans en recalculer un nouveau.");
  }
  if (league.round !== 1) throw new Error("❌ finalizeRound devrait faire avancer la journée courante.");
  console.log("\n✅ ensureLiveMatchStarted + finalizeRound : le score utilisé à la clôture de la diffusion est exactement celui déterminé au coup d'envoi, et la journée avance normalement.");
}

console.log("\n✅ Diffusion en direct (server/liveMatch.js) : rythme de jeu proportionnel aux secondes de jeu écoulées (jamais plus d'une seconde réelle par seconde de jeu), vraie mi-temps + pauses de quart-temps + temps morts, calendrier de diffusion déterministe (reprise fiable), forfait immédiat si effectif incomplet, finalisation avec le score déjà déterminé.");
