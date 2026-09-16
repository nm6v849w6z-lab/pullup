// Vérifie la compétition de COUPE (retour utilisateur, 2026-09 — "une vraie
// compétition de Coupe", en remplacement du placeholder côté navigateur) :
// élimination directe à 16 places pour 10 équipes (6 "exempts"/byes tirés au
// sort + 2 vrais matchs au 1er tour), avancement d'un tour à la fois
// jusqu'au champion, et intégration avec le calendrier ancré quotidien (voir
// server/daily_calendar_test.js) via server/autoSim.js.
const Engine = require("../engine.js");
const { generateMultiManagerLeague, CUP_BRACKET_SIZE, CUP_STAGE_NAMES, generateCupBracket } = Engine;
const Calendar = require("./calendar.js");
const { dailyAnchoredCalendarConfig, MATCH_BROADCAST_DURATION_MS, scheduledTimeForLeagueRound } = Calendar;
const { catchUpLeague, ensureLiveMatch } = require("./autoSim.js");

const T0 = Date.UTC(2026, 8, 15, 7, 0, 0); // 15 septembre 2026, 09h Paris (CEST) — un jeudi arbitraire

function freshMultiLeague(now = T0, names = ["Lyon Cup", "Marseille Cup"]) {
  return generateMultiManagerLeague(names, 1, now, dailyAnchoredCalendarConfig());
}

// ---------------------------------------------------------------------
// 1) generateCupBracket : taille 16, 6 byes tirés au sort, 2 vrais matchs de
//    1er tour — invariants vérifiés sur PLUSIEURS tirages (Math.random réel,
//    non figé : on vérifie des propriétés STRUCTURELLES, pas un résultat
//    précis, vu que le tirage au sort est délibérément aléatoire — voir le
//    retour utilisateur, "pas encore de classement pour faire des têtes de
//    série").
// ---------------------------------------------------------------------
{
  if (CUP_BRACKET_SIZE !== 16) throw new Error(`❌ CUP_BRACKET_SIZE devrait valoir 16 (puissance de 2 juste au-dessus de 10), obtenu ${CUP_BRACKET_SIZE}.`);
  if (CUP_STAGE_NAMES.length !== 4 || CUP_STAGE_NAMES[0] !== "huitiemes" || CUP_STAGE_NAMES[3] !== "finale") {
    throw new Error(`❌ CUP_STAGE_NAMES devrait être ["huitiemes","quarts","demies","finale"], obtenu ${JSON.stringify(CUP_STAGE_NAMES)}.`);
  }

  const teamIdxs = Array.from({ length: 10 }, (_, i) => i);
  const seenByeSets = new Set();
  for (let trial = 0; trial < 40; trial++) {
    const round0 = generateCupBracket(teamIdxs);
    if (round0.index !== 0) throw new Error("❌ Le 1er tour devrait avoir index=0.");
    if (round0.name !== "huitiemes") throw new Error(`❌ Le 1er tour devrait s'appeler "huitiemes", obtenu "${round0.name}".`);
    if (round0.dayIndex !== 0) throw new Error("❌ Le 1er tour devrait être programmé le jour 0.");
    if (round0.resolved) throw new Error("❌ Le 1er tour ne devrait PAS être marqué résolu tant que ses 2 vrais matchs n'ont pas été joués.");
    if (round0.matches.length !== CUP_BRACKET_SIZE / 2) {
      throw new Error(`❌ Le 1er tour devrait avoir ${CUP_BRACKET_SIZE / 2} "places" (byes + matchs), obtenu ${round0.matches.length}.`);
    }

    const byes = round0.matches.filter(m => m.bye);
    const realMatches = round0.matches.filter(m => !m.bye);
    if (byes.length !== CUP_BRACKET_SIZE - 10) throw new Error(`❌ ${CUP_BRACKET_SIZE - 10} byes attendus (16 places - 10 équipes), obtenu ${byes.length}.`);
    if (realMatches.length !== 2) throw new Error(`❌ 2 vrais matchs attendus au 1er tour (4 équipes restantes), obtenu ${realMatches.length}.`);

    // Chaque bye est déjà résolu, sans adversaire, gagnant = lui-même.
    byes.forEach(b => {
      if (b.away !== null) throw new Error("❌ Un bye ne devrait avoir AUCUN adversaire (away=null).");
      if (!b.resolved) throw new Error("❌ Un bye devrait déjà être résolu à la création du tableau (qualification automatique, aucun match joué).");
      if (b.winner !== b.home) throw new Error("❌ Le vainqueur d'un bye devrait être l'équipe elle-même.");
    });
    // Chaque vrai match, lui, est encore à jouer.
    realMatches.forEach(m => {
      if (m.resolved || m.winner !== null) throw new Error("❌ Un vrai match du 1er tour ne devrait PAS être résolu à la création du tableau.");
      if (m.home === m.away) throw new Error("❌ Un match ne peut pas opposer une équipe à elle-même.");
    });

    // Les 10 équipes sont TOUTES présentes exactement une fois (byes +
    // équipes des vrais matchs), jamais oubliées ni dupliquées.
    const allTeamsInBracket = [
      ...byes.map(b => b.home),
      ...realMatches.flatMap(m => [m.home, m.away]),
    ].sort((a, b) => a - b);
    if (JSON.stringify(allTeamsInBracket) !== JSON.stringify(teamIdxs)) {
      throw new Error(`❌ Les 10 équipes devraient TOUTES apparaître exactement une fois dans le tableau, obtenu ${JSON.stringify(allTeamsInBracket)}.`);
    }

    seenByeSets.add(JSON.stringify(byes.map(b => b.home).sort((a, b) => a - b)));
  }
  // Le tirage est bien ALÉATOIRE : sur 40 tirages, on ne devrait pas retomber
  // systématiquement sur exactement le même groupe de 6 byes (statistiquement
  // quasi impossible sinon — C(10,6) = 210 combinaisons possibles).
  if (seenByeSets.size < 2) {
    throw new Error("❌ Le tirage au sort des byes devrait varier d'un appel à l'autre (aléatoire) — 40 tirages ont donné systématiquement le même groupe, ce qui suggère un tirage non aléatoire.");
  }
  console.log(`✅ generateCupBracket : 16 places, 6 byes tirés au sort (aléatoirement — ${seenByeSets.size} combinaisons différentes observées sur 40 tirages) + 2 vrais matchs de 1er tour, les 10 équipes toutes présentes exactement une fois.`);
}

// ---------------------------------------------------------------------
// 2) generateMultiManagerLeague : la coupe n'existe QUE pour le calendrier
//    ancré quotidien (pas pour le calendrier classique — pas de créneau de
//    15h où la faire vivre).
// ---------------------------------------------------------------------
{
  const classicLeague = generateMultiManagerLeague(["Lyon Classic", "Nice Classic"], 1, T0); // pas de calendarConfig -> classique
  if (classicLeague.calendarDailyAnchored) throw new Error("❌ Sans calendarConfig explicite, la ligue ne devrait PAS être au calendrier ancré quotidien.");
  if (classicLeague.cup !== null) throw new Error("❌ Une ligue au calendrier CLASSIQUE ne devrait jamais avoir de coupe (pas de créneau de 15h).");
  console.log("✅ Une ligue multi-manager au calendrier classique n'a pas de coupe (comportement historique inchangé).");

  const dailyLeague = freshMultiLeague();
  if (!dailyLeague.calendarDailyAnchored) throw new Error("❌ Avec dailyAnchoredCalendarConfig(), la ligue devrait être au calendrier ancré quotidien.");
  if (!dailyLeague.cup || dailyLeague.cup.champion !== null || dailyLeague.cup.rounds.length !== 1) {
    throw new Error("❌ Une ligue au calendrier ancré quotidien devrait avoir une coupe fraîchement créée (1 tour, pas encore de champion).");
  }
  console.log("✅ Une ligue multi-manager au calendrier ancré quotidien a systématiquement une coupe fraîche dès sa création (10 équipes, byes tirés au sort).");
}

// ---------------------------------------------------------------------
// 3) Avancement manuel (League.pendingCupRound/recordCupMatchResult/
//    advanceCup) : les byes sont DÉJÀ qualifiés (aucun match à jouer), les
//    vainqueurs des 2 vrais matchs du 1er tour rejoignent les 6 byes pour
//    former les 8 places des quarts — jamais de choix du joueur dans
//    l'appariement.
// ---------------------------------------------------------------------
{
  const league = freshMultiLeague();
  const round0 = league.pendingCupRound();
  if (!round0 || round0.name !== "huitiemes") throw new Error("❌ Le tour en attente juste après création devrait être les huitièmes.");

  const realMatches0 = round0.matches.filter(m => !m.bye);
  const byeWinners = round0.matches.filter(m => m.bye).map(m => m.winner);

  // Résout les 2 vrais matchs (scores arbitraires, home gagne à chaque fois).
  realMatches0.forEach((m) => {
    const matchIndex = round0.matches.indexOf(m);
    league.recordCupMatchResult(matchIndex, 80, 60, null);
  });
  const expectedWinners0 = realMatches0.map(m => m.winner);
  if (expectedWinners0.some(w => w === null)) throw new Error("❌ Tous les vainqueurs du 1er tour devraient être connus une fois les 2 vrais matchs enregistrés.");

  league.advanceCup();
  if (!round0.resolved) throw new Error("❌ Le 1er tour devrait être marqué résolu après advanceCup().");
  if (league.cup.rounds.length !== 2) throw new Error(`❌ Un 2e tour (quarts) devrait avoir été engendré, obtenu ${league.cup.rounds.length} tour(s).`);

  const quarts = league.cup.rounds[1];
  if (quarts.name !== "quarts") throw new Error(`❌ Le 2e tour devrait s'appeler "quarts", obtenu "${quarts.name}".`);
  if (quarts.dayIndex !== round0.dayIndex + 1) throw new Error("❌ Le 2e tour devrait être programmé le jour SUIVANT celui du 1er tour.");
  if (quarts.matches.length !== 4) throw new Error(`❌ Les quarts devraient avoir 4 matchs (8 places), obtenu ${quarts.matches.length}.`);
  quarts.matches.forEach(m => {
    if (m.bye) throw new Error("❌ Aucun bye ne devrait plus exister à partir des quarts (toujours une puissance de 2 de vainqueurs).");
    if (m.home === m.away) throw new Error("❌ Un match des quarts ne peut pas opposer une équipe à elle-même.");
  });

  // Les 8 participants des quarts sont EXACTEMENT les 6 byes + les 2
  // vainqueurs du 1er tour — jamais une autre équipe, jamais de doublon.
  const quartsParticipants = quarts.matches.flatMap(m => [m.home, m.away]).sort((a, b) => a - b);
  const expectedParticipants = [...byeWinners, ...expectedWinners0].sort((a, b) => a - b);
  if (JSON.stringify(quartsParticipants) !== JSON.stringify(expectedParticipants)) {
    throw new Error(`❌ Les participants des quarts devraient être exactement les 6 byes + les 2 vainqueurs du 1er tour, attendu ${JSON.stringify(expectedParticipants)}, obtenu ${JSON.stringify(quartsParticipants)}.`);
  }
  console.log("✅ Les byes du 1er tour sont automatiquement qualifiés (aucun match), et rejoignent correctement les 2 vainqueurs du 1er tour pour former les 8 places des quarts.");

  if (league.pendingCupRound() !== quarts) throw new Error("❌ pendingCupRound() devrait maintenant renvoyer le tour des quarts.");
  console.log("✅ pendingCupRound() pointe bien vers le tour suivant une fois le précédent résolu.");
}

// ---------------------------------------------------------------------
// 4) Coupe jouée intégralement jusqu'au champion (avancement manuel,
//    quarts -> demies -> finale), en vérifiant le nombre de matchs et le
//    nom de chaque tour à chaque étape.
// ---------------------------------------------------------------------
{
  const league = freshMultiLeague(T0, ["Lyon FullCup", "Marseille FullCup", "Nice FullCup"]);
  const expectedCounts = { huitiemes: 2, quarts: 4, demies: 2, finale: 1 }; // vrais matchs par tour

  let guard = 0;
  while (league.cup.champion === null) {
    if (++guard > 10) throw new Error("❌ La coupe ne devrait jamais prendre plus de 4 tours à se résoudre (16 places).");
    const round = league.pendingCupRound();
    if (!round) throw new Error("❌ pendingCupRound() ne devrait renvoyer null QUE si la coupe est déjà terminée (champion connu).");
    const realMatches = round.matches.filter(m => !m.bye);
    if (realMatches.length !== expectedCounts[round.name]) {
      throw new Error(`❌ Le tour "${round.name}" devrait avoir ${expectedCounts[round.name]} vrais matchs, obtenu ${realMatches.length}.`);
    }
    realMatches.forEach(m => {
      const matchIndex = round.matches.indexOf(m);
      league.recordCupMatchResult(matchIndex, 70, 65, null); // home gagne systématiquement
    });
    league.advanceCup();
  }

  if (league.cup.rounds.length !== 4) throw new Error(`❌ Une coupe complète devrait compter exactement 4 tours (huitièmes/quarts/demies/finale), obtenu ${league.cup.rounds.length}.`);
  const finale = league.cup.rounds[3];
  if (finale.name !== "finale" || finale.matches.length !== 1) throw new Error("❌ Le dernier tour devrait être la finale, avec exactement 1 match.");
  if (league.cup.champion !== finale.matches[0].winner) throw new Error("❌ Le champion devrait être le vainqueur de la finale.");
  if (typeof league.cup.champion !== "number" || league.cup.champion < 0 || league.cup.champion >= 10) {
    throw new Error(`❌ Le champion devrait être un index d'équipe valide (0-9), obtenu ${league.cup.champion}.`);
  }
  if (league.pendingCupRound() !== null) throw new Error("❌ Une fois le champion connu, pendingCupRound() devrait renvoyer null (plus aucun tour dû).");
  console.log(`✅ Une coupe complète se joue intégralement jusqu'au champion (index ${league.cup.champion}) en exactement 4 tours (2, 4, 2 puis 1 vrai(s) match(s)), sans tour supplémentaire une fois la finale résolue.`);
}

// ---------------------------------------------------------------------
// 5) Intégration avec le calendrier ancré quotidien (server/autoSim.js) :
//    catchUpLeague résout championnat (10h/19h) ET coupe (15h, quand due)
//    ensemble, en avançant la coupe d'un tour par jour, sans jamais bloquer
//    le championnat — même après la fin de la coupe (créneau de 15h qui
//    reste alors simplement vide).
// ---------------------------------------------------------------------
{
  const league = freshMultiLeague();
  // Avance très loin dans le futur (largement de quoi couvrir toute la
  // saison ET la coupe entière) en un seul passage, comme un manager
  // revenant après une longue absence.
  const farFuture = league.calendarStartAt + 60 * 24 * 60 * 60 * 1000; // +60 jours
  const events = catchUpLeague(league, farFuture);

  const cupEvents = events.filter(e => e.type === "cup-match");
  if (cupEvents.length !== 4) throw new Error(`❌ 4 événements de tour de coupe attendus (un par tour), obtenu ${cupEvents.length}.`);
  const cupEventNames = cupEvents.map(e => e.cupRoundName);
  if (JSON.stringify(cupEventNames) !== JSON.stringify(CUP_STAGE_NAMES)) {
    throw new Error(`❌ Les tours de coupe devraient se résoudre dans l'ordre huitièmes -> quarts -> demies -> finale, obtenu ${JSON.stringify(cupEventNames)}.`);
  }
  // Chaque tour de coupe doit avoir eu lieu le jour attendu (0, 1, 2, 3 —
  // un jour de plus par tour), ET ce jour doit se situer AVANT (ou le même
  // jour que) la fin de la saison régulière (9 jours) : sinon la coupe
  // dépasserait de la saison, ce qui ne devrait jamais arriver vu sa taille
  // fixe (4 tours max).
  cupEvents.forEach((e, i) => {
    if (e.dayIndex !== i) throw new Error(`❌ Le tour "${e.cupRoundName}" aurait dû se jouer le jour ${i}, obtenu ${e.dayIndex}.`);
  });
  if (league.cup.champion === null) throw new Error("❌ La coupe aurait dû être entièrement résolue (champion connu) sur un rattrapage aussi large (+60 jours).");
  console.log(`✅ catchUpLeague résout la coupe entière (4 tours, jours 0 à 3) entrelacée avec le championnat, dans le bon ordre chronologique (huitièmes -> quarts -> demies -> finale).`);

  // Le championnat, lui, doit être allé à son terme normalement (18
  // journées, saison régulière + play-offs) — la coupe ne doit JAMAIS avoir
  // bloqué son avancement.
  if (!league.isRegularSeasonDone()) throw new Error("❌ La saison régulière de championnat aurait dû être entièrement résolue elle aussi.");
  if (!league.playoffs) throw new Error("❌ Les play-offs auraient dû être calculés (saison régulière terminée sur un si large rattrapage).");
  console.log("✅ Le championnat (saison régulière + play-offs) se déroule normalement, sans jamais être bloqué par la coupe — y compris les nombreux jours SANS tour de coupe dû (après la finale).");

  // Ordre chronologique au sein d'une même journée : le tour de coupe du
  // jour 0 doit apparaître ENTRE le round 0 (10h) et le round 1 (19h) de
  // championnat dans la liste d'événements.
  const matchEvents = events.filter(e => e.type === "match");
  const round0Idx = events.indexOf(matchEvents.find(e => e.round === 0));
  const round1Idx = events.indexOf(matchEvents.find(e => e.round === 1));
  const cupDay0Idx = events.indexOf(cupEvents[0]);
  if (!(round0Idx < cupDay0Idx && cupDay0Idx < round1Idx)) {
    throw new Error(`❌ Le tour de coupe du jour 0 (15h) devrait être résolu ENTRE le round 0 (10h, index ${round0Idx}) et le round 1 (19h, index ${round1Idx}) de championnat — obtenu à l'index ${cupDay0Idx}.`);
  }
  console.log("✅ Un jour avec tour de coupe dû : l'ordre de résolution respecte bien 10h (championnat) -> 15h (coupe) -> 19h (championnat).");
}

// ---------------------------------------------------------------------
// 6) Diffusion en direct des matchs de coupe impliquant un côté humain
//    (server/liveMatch.js, via ensureLiveMatch/server/autoSim.js) —
//    réutilise la même machinerie que le championnat (league.liveMatches,
//    clé préfixée "cup:" pour ne jamais collisionner).
// ---------------------------------------------------------------------
{
  const league = freshMultiLeague(T0, ["Lyon Live", "Marseille Live", "Nice Live", "Rennes Live", "Nantes Live", "Bordeaux Live"]);
  // Trouve un vrai match du 1er tour de coupe impliquant au moins une
  // équipe humaine (garanti d'exister avec 6 managers humains sur 10 places,
  // même si ce n'est pas garanti à 100% par le hasard — on boucle sur
  // plusieurs ligues fraîches jusqu'à en trouver une).
  let targetLeague = league;
  let humanMatch = null;
  for (let attempt = 0; attempt < 30 && !humanMatch; attempt++) {
    const l = attempt === 0 ? league : freshMultiLeague(T0, ["Lyon Live", "Marseille Live", "Nice Live", "Rennes Live", "Nantes Live", "Bordeaux Live"]);
    const round0 = l.pendingCupRound();
    const real = round0.matches.filter(m => !m.bye);
    const hh = real.find(m => l.teams[m.home].isHuman || l.teams[m.away].isHuman);
    if (hh) { targetLeague = l; humanMatch = hh; }
  }
  if (!humanMatch) throw new Error("❌ Prérequis du test : aucun tirage au sort sur 30 essais n'a produit de vrai match de 1er tour impliquant un côté humain (improbable).");

  const cupKickoffAt = Calendar.scheduledTimeForLeagueCupRound(targetLeague, 0);
  const startedKeys = ensureLiveMatch(targetLeague, cupKickoffAt);
  const key = `cup:0:${humanMatch.home}:${humanMatch.away}`;
  if (!startedKeys.includes(key)) throw new Error(`❌ La diffusion du match de coupe humain aurait dû démarrer avec la clé "${key}", obtenu ${JSON.stringify(startedKeys)}.`);
  if (!targetLeague.liveMatches[key]) throw new Error("❌ league.liveMatches devrait contenir l'entrée du match de coupe.");
  if (targetLeague.liveMatches[key].competition !== "cup") throw new Error('❌ L\'entrée de direct devrait porter competition:"cup".');
  console.log("✅ Un match de coupe impliquant un côté humain démarre sa propre diffusion en direct (league.liveMatches, clé préfixée \"cup:\"), avec competition:\"cup\".");

  // Finalise la journée entière (10h+15h+19h) : la coupe doit reprendre le
  // score EXACT déterminé au coup d'envoi (jamais un second tirage), comme
  // pour un match de championnat.
  const scoreAtKickoff = { ...targetLeague.liveMatches[key].finalScore };
  const events = catchUpLeague(targetLeague, cupKickoffAt + MATCH_BROADCAST_DURATION_MS);
  const cupEvent = events.find(e => e.type === "cup-match" && e.cupRoundIndex === 0);
  if (!cupEvent) throw new Error("❌ Le tour de coupe du jour 0 aurait dû être finalisé.");
  const finalizedMatch = cupEvent.matches.find(m => m.home === humanMatch.home && m.away === humanMatch.away);
  if (!finalizedMatch || finalizedMatch.scoreHome !== scoreAtKickoff.home || finalizedMatch.scoreAway !== scoreAtKickoff.away) {
    throw new Error("❌ Le résultat finalisé du match de coupe devrait reprendre EXACTEMENT le score déterminé au coup d'envoi de la diffusion en direct.");
  }
  if (targetLeague.liveMatches[key]) throw new Error("❌ L'entrée league.liveMatches du match de coupe devrait être supprimée une fois finalisée.");
  console.log("✅ Un match de coupe diffusé en direct se finalise avec le score EXACT déterminé au coup d'envoi (jamais un second tirage), et son entrée liveMatches est bien nettoyée.");
}

console.log("\n✅ Coupe (engine.js/server/liveMatch.js/server/autoSim.js) : tableau à 16 places (6 byes + 2 matchs), avancement de tour en tour, coupe complète jusqu'au champion, et intégration avec le calendrier ancré quotidien — toutes vérifiées.");
