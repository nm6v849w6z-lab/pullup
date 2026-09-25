// Hoop Shows — émissions avant-match/mi-temps + pronostics (DEV_NOTES.md
// point 11). Style projet (assertions manuelles, throw en cas d'échec) —
// PAS node:test, contrairement au livrable d'origine (voir INTEGRATION.md,
// hoop-shows/test/shows.test.js) : les 9 tests du prestataire sont réécrits
// à l'identique dans la Partie A ci-dessous (même comportement vérifié,
// juste réécrits dans le style de ce dépôt), puis complétés en Partie B par
// des tests d'intégration contre le VRAI adaptateur (server/showsAdapter.js)
// et l'orchestration serveur (server/shows.js), sur une ligue engine.js
// réelle plutôt que sur des fixtures à la main — seule façon de vérifier
// que l'adaptateur convertit correctement les vraies données du moteur
// (compos, forme, confrontations directes, événements de match, lot de fin
// de saison...) plutôt que seulement la logique pure déjà couverte côté
// prestataire.
const D = require("./shows/showData.js");
const P = require("./shows/pronostics.js");
const Sample = require("./shows/sampleData.js");

// =====================================================================
// PARTIE A — les 9 tests livrés (hoop-shows/test/shows.test.js), réécrits
// ici en style projet, contre les copies verbatim server/shows/showData.js
// et server/shows/pronostics.js (voir leur en-tête : copiées telles
// quelles depuis le livrable, jamais modifiées).
// =====================================================================

const teams = { a: { name: "Alpha" }, b: { name: "Bravo" }, c: { name: "Charlie" }, d: { name: "Delta" } };
const players = { a1: { name: "A. Un", teamId: "a" }, b1: { name: "B. Un", teamId: "b" }, c1: { name: "C. Un", teamId: "c" }, d1: { name: "D. Un", teamId: "d" } };
const shot = (q, teamId, playerId, pts, made) => ({ q, type: "shot", teamId, playerId, pts, made, x: 0.2, y: 0.5 });

function sampleLeague() {
  return {
    day: 3, leagueId: "t", myTeamId: "a", teams, players,
    standings: [{ teamId: "c", w: 2, l: 0 }, { teamId: "a", w: 1, l: 1 }, { teamId: "d", w: 1, l: 1 }, { teamId: "b", w: 0, l: 2 }],
    matches: [
      // a mène 5-2 à la mi-temps, mais énorme 3e quart-temps de b (ne doit PAS apparaître)
      { id: "m1", homeId: "a", awayId: "b", events: [shot(1, "a", "a1", 3, true), shot(2, "a", "a1", 2, true), shot(2, "b", "b1", 2, true), shot(3, "b", "b1", 3, true), shot(3, "b", "b1", 3, true), shot(4, "b", "b1", 3, true)] },
      // égalité 4-4 à la mi-temps
      { id: "m2", homeId: "c", awayId: "d", events: [shot(1, "c", "c1", 2, true), shot(2, "c", "c1", 2, true), shot(1, "d", "d1", 2, true), shot(2, "d", "d1", 2, true), shot(4, "d", "d1", 2, true)] },
    ],
  };
}

// --- 1) anti-spoiler : seuls les quart-temps 1 et 2 sont lus -----------
{
  const show = D.buildHalftimeShow(sampleLeague());
  const mm = show.segments.find(s => s.type === "myMatch");
  if (mm.home.score !== 5) throw new Error(`❌ score domicile attendu 5, obtenu ${mm.home.score}.`);
  if (mm.away.score !== 2) throw new Error(`❌ score extérieur attendu 2, obtenu ${mm.away.score}.`);
  if (mm.quarters[2] !== null) throw new Error(`❌ Q3 devrait être null (anti-spoiler), obtenu ${JSON.stringify(mm.quarters[2])}.`);
  if (mm.shots.length !== 3) throw new Error(`❌ 3 tirs attendus (1re mi-temps uniquement), obtenu ${mm.shots.length}.`);
  const json = JSON.stringify(show);
  if (/"score":(8|11)\b/.test(json)) throw new Error("❌ Le score final (spoiler) fuite quelque part dans l'émission sérialisée.");
  console.log("✅ Mi-temps : anti-spoiler, seuls Q1/Q2 lus, aucun score final ne fuite.");
}

// --- 2) match nul -> équipes "en suspens", bilans inchangés ------------
{
  const show = D.buildHalftimeShow(sampleLeague());
  const t = show.segments.find(s => s.type === "table");
  const c = t.rows.find(r => r.teamId === "c"), d = t.rows.find(r => r.teamId === "d");
  if (c.trend !== "suspended" || d.trend !== "suspended") throw new Error("❌ c et d (match nul à la mi-temps) devraient être 'suspended'.");
  if (c.w !== 2 || c.l !== 0 || d.w !== 1 || d.l !== 1) throw new Error(`❌ Bilans c/d ne devraient pas bouger avant résolution du nul : obtenu c=${c.w}-${c.l} d=${d.w}-${d.l}.`);
  const a = t.rows.find(r => r.teamId === "a");
  if (a.w !== 2 || a.l !== 1) throw new Error(`❌ a (mène à la mi-temps) devrait être provisoirement 2-1, obtenu ${a.w}-${a.l}.`);
  if (t.rows[0].teamId !== "c") throw new Error("❌ c devrait rester 1er (100 % de victoires).");
  if (a.pos !== 2) throw new Error(`❌ a devrait être 2e, obtenu pos=${a.pos}.`);
  if (!/égalité/.test(t.note || "")) throw new Error("❌ La note du classement devrait mentionner l'égalité en cours.");
  console.log("✅ Mi-temps : match nul -> équipes en suspens, classement provisoire correct.");
}

// --- 3) le match à suivre est le match nul ------------------------------
{
  const show = D.buildHalftimeShow(sampleLeague());
  const w = show.segments.find(s => s.type === "matchToWatch");
  if (!w || w.matchId !== "m2") throw new Error(`❌ Le match à suivre devrait être m2 (égalité), obtenu ${w && w.matchId}.`);
  if (w.tag !== "ÉGALITÉ PARFAITE") throw new Error(`❌ Étiquette attendue "ÉGALITÉ PARFAITE", obtenu "${w.tag}".`);
  console.log("✅ Mi-temps : le match à suivre mis en avant est bien le match nul.");
}

// --- 4) classement : tri %victoires puis ordre d'origine ---------------
{
  const rows = D.rankTable([{ teamId: "x", w: 3, l: 3 }, { teamId: "y", w: 2, l: 1 }, { teamId: "z", w: 3, l: 3 }], ["z", "x", "y"]);
  const order = rows.map(r => r.teamId);
  if (order.join(",") !== "y,z,x") throw new Error(`❌ Ordre attendu y,z,x (y au meilleur %, x/z départagés par ordre d'origine), obtenu ${order.join(",")}.`);
  console.log("✅ Classement : tri au % de victoires, départage par ordre d'origine.");
}

// --- 5) émissions déterministes (même entrée -> même sortie) -----------
{
  const s = Sample.build(1);
  const h1 = JSON.stringify(D.buildHalftimeShow(s)), h2 = JSON.stringify(D.buildHalftimeShow(s));
  if (h1 !== h2) throw new Error("❌ buildHalftimeShow devrait être déterministe (même entrée -> même JSON).");
  const p1 = JSON.stringify(D.buildPrematchShow(s)), p2 = JSON.stringify(D.buildPrematchShow(s));
  if (p1 !== p2) throw new Error("❌ buildPrematchShow devrait être déterministe (même entrée -> même JSON).");
  console.log("✅ Émissions déterministes (même entrée -> même JSON, avant-match et mi-temps).");
}

// --- 6) avant-match : aucun résultat de match lu, compos + duel --------
{
  const s = Sample.build(2);
  const noEvents = Object.assign({}, s, { matches: undefined });
  const show = D.buildPrematchShow(noEvents);
  const types = show.segments.map(x => x.type);
  const expectedTypes = ["intro", "poster", "lineups", "duel", "fixtures", "table", "ad", "pronostics", "kickoff"];
  if (types.join(",") !== expectedTypes.join(",")) throw new Error(`❌ Rubriques avant-match attendues ${expectedTypes.join(",")}, obtenu ${types.join(",")}.`);
  const lu = show.segments.find(x => x.type === "lineups");
  if (lu.home.players.length !== 5) throw new Error(`❌ 5 titulaires attendus côté domicile, obtenu ${lu.home.players.length}.`);
  const poster = show.segments.find(x => x.type === "poster");
  if (!poster.lastMeeting || poster.lastMeeting.home.score !== 78) throw new Error("❌ La dernière confrontation directe (score 78) devrait apparaître dans l'affiche.");
  console.log("✅ Avant-match : construit sans lire le moindre résultat de match, compos et duel présents.");
}

// --- 7) démo : la mi-temps de l'échantillon contient toutes les rubriques
{
  const show = D.buildHalftimeShow(Sample.build(1));
  const types = show.segments.map(x => x.type);
  for (const t of ["intro", "myMatch", "multiplex", "matchToWatch", "table", "ad", "pronostics"]) {
    if (!types.includes(t)) throw new Error(`❌ Rubrique "${t}" manquante dans l'émission de mi-temps de démo.`);
  }
  const t = show.segments.find(x => x.type === "table");
  if (!t.rows.some(r => r.trend === "suspended")) throw new Error("❌ Le match forcé à égalité dans la démo devrait apparaître 'suspended' au classement.");
  console.log("✅ Démo : l'émission de mi-temps contient toutes les rubriques attendues.");
}

// --- 8) pronostics : verrouillage, résolution, classement, idempotence -
// Asynchrone (server/shows/pronostics.js:createPronosticsService renvoie
// des Promises, voir son en-tête — un `store` abstrait pensé pour un
// backend distant plus tard) : mis dans une fonction dédiée, AWAITÉE plus
// bas avant la Partie B, plutôt qu'un IIFE fire-and-forget — sinon rien ne
// garantit que ses assertions s'exécutent avant la fin du script (et donc
// avant que le code de sortie du process ne soit déjà déterminé par les
// tests synchrones suivants).
async function test8Pronostics() {
  let clock = 1000;
  const svc = P.createPronosticsService({ now: () => clock });
  const qs = [
    { id: "q1", kind: "secondHalfWinner", matchId: "m1", label: "", options: [{ id: "a" }, { id: "b" }] },
    { id: "q2", kind: "matchWinner", matchId: "m2", label: "", options: [{ id: "c" }, { id: "d" }] },
  ];
  {
    await svc.publishQuestions("s1", { season: "2026", lockAt: 2000, questions: qs });
    await svc.submit({ userId: "u1", showId: "s1", answers: { q1: "b", q2: "d" } });
    await svc.submit({ userId: "u2", showId: "s1", answers: { q1: "a", q2: "d" } });

    let rejected = false;
    try { await svc.submit({ userId: "u3", showId: "s1", answers: { q1: "z" } }); } catch (e) { rejected = /invalide/.test(e.message); }
    if (!rejected) throw new Error("❌ Une réponse invalide (option inexistante) devrait être rejetée.");

    clock = 2500;
    let lockedRejected = false;
    try { await svc.submit({ userId: "u3", showId: "s1", answers: { q1: "a" } }); } catch (e) { lockedRejected = /verrouill/.test(e.message); }
    if (!lockedRejected) throw new Error("❌ Un envoi après lockAt devrait être rejeté (verrouillé).");

    const L = sampleLeague();
    const correct = P.resolveQuestions(qs, { m1: L.matches[0], m2: L.matches[1] });
    if (correct.q1 !== "b" || correct.q2 !== "d") throw new Error(`❌ Réponses correctes attendues {q1:b, q2:d}, obtenu ${JSON.stringify(correct)}.`);

    const r1 = await svc.resolve("s1", correct);
    const u1Points = r1.results.find(r => r.userId === "u1").points;
    const u2Points = r1.results.find(r => r.userId === "u2").points;
    if (u1Points !== 20) throw new Error(`❌ u1 (2 bonnes réponses) devrait avoir 20 points, obtenu ${u1Points}.`);
    if (u2Points !== 10) throw new Error(`❌ u2 (1 bonne réponse) devrait avoir 10 points, obtenu ${u2Points}.`);

    const r2 = await svc.resolve("s1", correct);
    if (r2.alreadyResolved !== true) throw new Error("❌ Une seconde résolution de la même émission devrait être idempotente (alreadyResolved).");

    const lb = await svc.leaderboard("2026", { userId: "u2" });
    if (lb.total !== 2) throw new Error(`❌ 2 participants attendus au classement, obtenu ${lb.total}.`);
    if (lb.top[0].userId !== "u1") throw new Error(`❌ u1 devrait être 1er, obtenu ${lb.top[0].userId}.`);
    if (lb.me.rank !== 2) throw new Error(`❌ u2 devrait être 2e, obtenu ${lb.me.rank}.`);
    const winner = await svc.seasonWinner("2026");
    if (winner.userId !== "u1") throw new Error(`❌ Le vainqueur de saison devrait être u1, obtenu ${winner.userId}.`);
    console.log("✅ Pronostics : verrouillage, résolution, classement et idempotence corrects.");
  }
}

// Tests 9 à 14 (+ le récapitulatif final) rassemblés dans main(), AWAITÉ
// tout en bas — garantit que test8Pronostics() (asynchrone) est
// intégralement passé, dans l'ordre, avant la suite (voir son commentaire).
async function main() {
await test8Pronostics();

// --- 9) question annulée en cas d'égalité -------------------------------
{
  const m = { id: "x", homeId: "a", awayId: "b", events: [shot(3, "a", "a1", 2, true), shot(4, "b", "b1", 2, true)] };
  if (P.resolveQuestion({ kind: "secondHalfWinner" }, m) !== null) throw new Error("❌ Une égalité en 2e mi-temps devrait annuler la question 'secondHalfWinner' (null).");
  if (P.resolveQuestion({ kind: "margin" }, m) !== null) throw new Error("❌ Une égalité devrait aussi annuler la question 'margin' (null).");
  if (P.resolveQuestion({ kind: "totalPoints", line: 3.5 }, m) !== "over") throw new Error("❌ 'totalPoints' à la ligne 3.5 (4 points marqués) devrait résoudre 'over'.");
  console.log("✅ Pronostics : question annulée en cas d'égalité, 'totalPoints' résolu normalement.");
}

// =====================================================================
// PARTIE B — intégration RÉELLE : server/showsAdapter.js (conversion
// engine.js -> format showData.js, coordonnées de tirs, verrou des
// compos) et server/shows.js (fenêtres, pronostics, résolution à la
// finalisation d'une journée, lot de fin de saison) sur une VRAIE ligue
// engine.js (generateLeague), jamais une fixture écrite à la main — seule
// façon de vérifier que l'adaptateur lit correctement les vraies formes
// de données du moteur (compos, forme, confrontations, joueurs...).
// =====================================================================
const Engine = require("../engine.js");
const Calendar = require("./calendar.js");
const LiveMatch = require("./liveMatch.js");
const Shows = require("./shows.js");
const Adapter = require("./showsAdapter.js");

function freshLeague() {
  const team = Engine.generateStartingRoster("Test FC");
  return Engine.generateLeague(team);
}

// --- 10) fenêtre de verrouillage des compos = fenêtre d'ouverture de
//         l'émission avant-match : EXACTEMENT T - 5 min (voir
//         hoop-shows/INTEGRATION.md, "5 min" explicite côté prestataire).
{
  const league = freshLeague();
  const kickoffAt = Calendar.scheduledTimeForLeagueRound(league, 0);
  const LOCK_MS = Shows.LINEUP_LOCK_BEFORE_KICKOFF_MS;
  if (LOCK_MS !== 5 * 60 * 1000) throw new Error(`❌ LINEUP_LOCK_BEFORE_KICKOFF_MS devrait être 5 min, obtenu ${LOCK_MS} ms.`);
  if (Shows.lineupLocked(kickoffAt - LOCK_MS - 1, kickoffAt)) throw new Error("❌ 1 ms avant T-5min : ne devrait pas encore être verrouillé.");
  if (!Shows.lineupLocked(kickoffAt - LOCK_MS, kickoffAt)) throw new Error("❌ Exactement à T-5min : devrait déjà être verrouillé (>=).");
  if (!Shows.lineupLocked(kickoffAt, kickoffAt)) throw new Error("❌ Au coup d'envoi : devrait être verrouillé.");
  if (Shows.getPrematchShow(league, 0, 0, kickoffAt - LOCK_MS - 1)) throw new Error("❌ L'émission avant-match ne devrait pas être disponible avant T-5min.");
  if (!Shows.getPrematchShow(league, 0, 0, kickoffAt - LOCK_MS)) throw new Error("❌ L'émission avant-match devrait être disponible dès T-5min (même instant que le verrou).");
  console.log("✅ Verrou des compos et ouverture de l'émission avant-match : même fenêtre T-5min.");
}

// --- 11) émission avant-match : forme réelle depuis engine.js, format
//         showData.js respecté (rubriques attendues, 5 titulaires).
{
  const league = freshLeague();
  const kickoffAt = Calendar.scheduledTimeForLeagueRound(league, 0);
  const show = Shows.getPrematchShow(league, 0, 0, kickoffAt - Shows.LINEUP_LOCK_BEFORE_KICKOFF_MS);
  if (!show || show.kind !== "prematch") throw new Error("❌ getPrematchShow devrait renvoyer une émission de type 'prematch'.");
  const lu = show.segments.find(s => s.type === "lineups");
  if (!lu || lu.home.players.length !== 5 || lu.away.players.length !== 5) throw new Error("❌ 5 titulaires attendus de chaque côté (vraies compos engine.js).");
  if (!show.pronostics || !show.pronostics.questions.length) throw new Error("❌ Des questions de pronostics devraient être publiées avec l'émission avant-match.");
  console.log("✅ Émission avant-match : vraies compos engine.js correctement adaptées (5 titulaires/équipe).");
}

// --- 12) émission de mi-temps : n'existe QUE pendant la vraie pause de
//         mi-temps calculée par server/liveMatch.js, anti-spoiler
//         respecté sur les VRAIS événements convertis par l'adaptateur.
{
  const league = freshLeague();
  const kickoffAt = Calendar.scheduledTimeForLeagueRound(league, 0);
  const lm = LiveMatch.computeLiveMatch(Engine, league, 0, 0, 9, kickoffAt, "championship");
  league.liveMatches = {};
  league.liveMatches[LiveMatch.liveMatchKey(0, 0, 9, "championship")] = lm;
  const half = lm.pauses.find(p => p.kind === "halftime");
  if (!half) throw new Error("❌ Une pause 'halftime' devrait toujours exister dans un match programmé.");
  const resumeAt = half.airAt + half.durationMs;

  if (Shows.getHalftimeShow(league, 0, 0, half.airAt - 1000)) throw new Error("❌ L'émission de mi-temps ne devrait pas exister avant le début de la pause.");
  const show = Shows.getHalftimeShow(league, 0, 0, half.airAt + 1000);
  if (!show || show.kind !== "halftime") throw new Error("❌ getHalftimeShow devrait renvoyer une émission pendant la pause de mi-temps.");
  if (Shows.getHalftimeShow(league, 0, 0, resumeAt + 1000)) throw new Error("❌ L'émission de mi-temps ne devrait plus être disponible après la reprise.");

  const mm = show.segments.find(s => s.type === "myMatch");
  if (mm.quarters[2] !== null || mm.quarters[3] !== null) throw new Error("❌ Q3/Q4 ne devraient jamais apparaître dans l'émission de mi-temps (vraies données du moteur incluses).");
  const json = JSON.stringify(show);
  const finalHome = lm.matchResult ? lm.matchResult.scoreA : null;
  if (finalHome != null && new RegExp(`"score":${finalHome}\\b`).test(json) && mm.home.score !== finalHome) {
    throw new Error("❌ Le score final ne devrait jamais fuiter dans l'émission de mi-temps.");
  }
  show.shots = mm.shots;
  for (const s of mm.shots) {
    if (!(s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1)) throw new Error(`❌ Coordonnée de tir hors [0,1] : ${JSON.stringify(s)}.`);
  }
  console.log("✅ Émission de mi-temps : fenêtre réelle respectée, anti-spoiler sur les vrais événements, tirs normalisés en [0,1].");
}

// --- 13) pronostics : validations (émission inconnue, réponse invalide,
//         verrouillage) sur la vraie orchestration serveur (SYNCHRONE).
{
  const league = freshLeague();
  const kickoffAt = Calendar.scheduledTimeForLeagueRound(league, 0);
  const now = kickoffAt - Shows.LINEUP_LOCK_BEFORE_KICKOFF_MS;
  const show = Shows.getPrematchShow(league, 0, 0, now);
  const showId = show.pronostics.showId;
  const q = show.pronostics.questions[0];

  const unknown = Shows.submitPronosticsSync(league, 0, "n-existe-pas", { x: "y" }, now);
  if (unknown.ok) throw new Error("❌ Un showId inconnu devrait être rejeté.");

  const invalid = Shows.submitPronosticsSync(league, 0, showId, { [q.id]: "option-inexistante" }, now);
  if (invalid.ok) throw new Error("❌ Une option inexistante devrait être rejetée.");

  const ok = Shows.submitPronosticsSync(league, 0, showId, { [q.id]: q.options[0].id }, now);
  if (!ok.ok) throw new Error(`❌ Un envoi valide devrait être accepté, obtenu erreur : ${ok.error}.`);
  const sub = Shows.getSubmissionSync(league, 0, showId);
  if (!sub || sub.answers[q.id] !== q.options[0].id) throw new Error("❌ La réponse envoyée devrait être relisible telle quelle (reprise de session).");

  const afterLock = Shows.submitPronosticsSync(league, 0, showId, { [q.id]: q.options[1].id }, show.pronostics.lockAt + 1);
  if (afterLock.ok) throw new Error("❌ Un envoi après lockAt (coup d'envoi) devrait être rejeté.");
  console.log("✅ Pronostics (orchestration serveur) : émission inconnue/réponse invalide/verrouillage correctement rejetés, reprise de session correcte.");
}

// --- 14) résolution à la finalisation d'une journée + lot de fin de
//         saison (1 mois de Premium au vainqueur du classement mondial),
//         via le VRAI point d'accroche server/liveMatch.js:finalizeRound.
{
  const league = freshLeague();
  const kickoffAt = Calendar.scheduledTimeForLeagueRound(league, 0);
  const now = kickoffAt - Shows.LINEUP_LOCK_BEFORE_KICKOFF_MS;
  const show = Shows.getPrematchShow(league, 0, 0, now);
  const showId = show.pronostics.showId;
  const q = show.pronostics.questions[0];
  // Un pronostic par option possible, pour être certain qu'AU MOINS un
  // manager (ici il n'y en a qu'un, teamIdx 0) tombe juste au moins une
  // fois n'est pas nécessaire ici : on vérifie juste que la résolution
  // s'exécute et verrouille l'émission, peu importe le résultat.
  Shows.submitPronosticsSync(league, 0, showId, { [q.id]: q.options[0].id }, now);

  if (league.round !== 0) throw new Error(`❌ La ligue devrait démarrer à la journée 0, obtenu ${league.round}.`);
  LiveMatch.finalizeRound(Engine, league, 0, kickoffAt + 3 * 60 * 60 * 1000);
  if (league.round !== 1) throw new Error(`❌ finalizeRound devrait faire avancer la ligue à la journée 1, obtenu ${league.round}.`);

  const resolved = league.showsPronostics["pr:show:" + showId];
  if (!resolved || !resolved.resolved) throw new Error("❌ L'émission avant-match devrait être résolue après la finalisation de sa journée.");
  const sub = Shows.getSubmissionSync(league, 0, showId);
  if (!sub.result || typeof sub.result.good !== "number") throw new Error("❌ Le pronostic soumis devrait porter un résultat (bonnes réponses) après résolution.");

  const already = league.showsPronostics["pr:show:" + showId].resolvedAt;
  Shows.resolveRoundShowsSync(league, 0, [], kickoffAt); // no-op (results vide) : ne doit rien casser ni re-résoudre
  if (league.showsPronostics["pr:show:" + showId].resolvedAt !== already) throw new Error("❌ Une résolution déjà faite ne devrait jamais être rejouée (idempotence).");

  if (league.teams[0].premiumUntil) throw new Error("❌ Aucun lot de fin de saison ne devrait être accordé avant grantSeasonPrizeSync.");
  const prize = Shows.grantSeasonPrizeSync(league, kickoffAt);
  if (!prize || prize.teamIdx !== 0) throw new Error(`❌ Le seul participant (teamIdx 0) devrait remporter le lot de fin de saison, obtenu ${JSON.stringify(prize)}.`);
  if (!league.teams[0].hasActivePremium(kickoffAt)) throw new Error("❌ team.hasActivePremium devrait être vrai juste après l'octroi du lot.");
  if (league.teams[0].premiumUntil !== kickoffAt + Shows.SEASON_PRIZE_PREMIUM_MS) throw new Error("❌ premiumUntil devrait valoir maintenant + SEASON_PRIZE_PREMIUM_MS.");
  console.log("✅ Résolution à la finalisation de journée (via le vrai finalizeRound) + lot de fin de saison (Premium) corrects, idempotents.");
}

console.log("✅ Tous les tests Hoop Shows sont passés.");
}

main().catch(e => { console.error(e); process.exitCode = 1; });
