// Sélections nationales — analyse Premium du Mode Sélectionneur
// (server/nationalCoach.js analysisData, route
// /api/national/coach/analysis-data) : matchs internationaux joués (saison
// en cours et précédente) d'une sélection transformés en « équipe
// virtuelle » (matchLog "national" par joueur, tactiques jouées, scores par
// quart-temps) + agrégats du rapport club (server/scouting.js) ; adversaire
// ou sa propre sélection ; réservé au staff ayant le droit "analysis" ;
// aucune donnée avant le premier match.
const assert = require("assert");
const store = require("./store.js");
const N = require("./nationalTeams.js");
const C = require("./nationalCoach.js");
const M = require("./nationalMatches.js");
const Engine = require("../engine.js");
const ok = m => console.log("✅ " + m);
const DAY = 864e5;

const start = Date.UTC(2027, 0, 5, 19);
const COUNTRIES = Object.keys(Engine.WORLD_COUNTRIES);
const lg = store.createMultiManagerCareer(["Lyon AN", "Paris AN"], start).league;
lg.seasonNumber = 2; lg.calendarStartAt = start; lg.country = "fr";
lg.teams.forEach(t => { if (t.isHuman) t.lastSeenAt = start + 300 * DAY; });
const all = lg.teams.flatMap(t => t.players);
all.forEach((p, i) => { p.nationality = COUNTRIES[i % COUNTRIES.length]; p.age = 25; p.injuryUntil = null; p.condition = 100; p.conditionUpdatedAt = start; });
const leagues = new Map([["fr-1", lg]]);
const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }] };
const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
let now = start + 3600e3;
N.step(st, leagues, world, now);
const comp = M.compOf(st, 2, "A");
const m1 = comp.matches.find(m => m.w === 1);
const TID = m1.home, OPP = m1.away;
const lyon = N.managerOf("fr-1", lg, 0, world), paris = N.managerOf("fr-1", lg, 1, world);
assert.ok(C.adminAppoint(st, TID, lyon, 2, now, leagues).ok);
const ctx = { season: 2, pool: null };

// 1) Avant tout match : pas de données (message clair côté client).
const empty = C.analysisData(st, lyon, TID, OPP, now, ctx);
assert.ok(empty.ok && empty.report.gamesPlayed === 0 && empty.matches.length === 0 && empty.team.players.length === 0, "aucun match joué : rapport vide");
ok("aucun match international joué : rapport vide");

// 2) Droits : staff avec "analysis" seulement ; même catégorie.
assert.strictEqual(C.analysisData(st, paris, TID, OPP, now, ctx).status, 403, "hors staff : refusé");
assert.strictEqual(C.analysisData(st, lyon, TID, OPP.replace("-A", "-U21"), now, ctx).status, 404, "autre catégorie : refusé");
assert.strictEqual(C.analysisData(st, lyon, "xx-A", null, now, ctx).status, 404, "sélection inconnue");
ok("droits : staff de la sélection (droit analysis), même catégorie");

// 3) Fenêtres 1 et 2 jouées : équipe virtuelle et rapport.
now = comp.matches.filter(m => m.w === 2)[0].at + 60e3;
N.step(st, leagues, world, now);
// Fin des directs (2026-10-06) : un match encore en diffusion reste caché.
now = Math.max(...comp.matches.filter(m => m.w === 2).map(m => m.liveUntil || 0)) + 2000;
N.step(st, leagues, world, now);
const mine = comp.matches.filter(m => m.status === "played" && (m.home === TID || m.away === TID));
assert.ok(mine.length >= 2, "au moins deux matchs joués");
const d = C.analysisData(st, lyon, TID, OPP, now, ctx);
assert.ok(d.ok && !d.own && d.teamId === OPP);
const oppPlayed = comp.matches.filter(m => m.status === "played" && (m.home === OPP || m.away === OPP));
assert.strictEqual(d.matches.length, oppPlayed.length, "tous les matchs joués de l'adversaire");
assert.strictEqual(d.report.gamesPlayed, oppPlayed.length, "gamesPlayed = matchs joués");
assert.deepStrictEqual(d.matches.map(m => m.round), d.matches.map((_, i) => i), "rangs chronologiques");
const p0 = d.team.players[0];
assert.ok(p0 && p0.ref && p0.club && p0.matchLog.length && p0.matchLog.every(e => e.competition === "national"), "joueurs : ref, club, matchLog national");
const e0 = p0.matchLog[0];
["min", "pts", "fga2", "fga3", "oreb", "dreb", "paintAtt", "ptsPaint", "plusMinus"].forEach(k => assert.ok(typeof e0[k] === "number", "stat moteur " + k));
assert.ok(e0.quarterScores && e0.quarterScores.home.length >= 4, "scores par quart-temps");
assert.ok(e0.tacticsUsed && e0.tacticsUsed.defense, "tactique jouée");
assert.strictEqual(d.report.strategyUsage.totalMatches, oppPlayed.length, "stratégies utilisées");
assert.ok(d.report.shotZones.totalAttempts > 0 && d.report.keyPlayers.length === 3, "zones de tir, joueurs clés");
const h = d.report.homeAwayRecord;
assert.strictEqual(h.home.wins + h.home.losses + h.away.wins + h.away.losses, oppPlayed.length, "bilan domicile/extérieur");
assert.ok(d.report.recentForm.length && d.report.recentForm.every(g => g.at && g.opponentName), "forme récente datée");
assert.ok(d.report.headToHead.length === 1 && d.report.headToHead[0].scoreFor === (m1.home === TID ? m1.scoreHome : m1.scoreAway), "confrontation vue de ma sélection");
assert.ok(d.report.standing && d.report.standing.rank >= 1, "classement du groupe");
assert.ok(d.team.lineup && Object.keys(d.team.lineup.starters).length === 5, "5 majeur du dernier match");
// Les ids provisoires du moteur ne fuient pas.
assert.ok(d.team.players.every(p => p.id < 9000000 || p.id < 0), "ids réels des joueurs");
ok("adversaire : équipe virtuelle (stats moteur, quart-temps, tactiques), zones, stratégies, joueurs clés, forme, confrontations, classement");

// 4) Sa propre sélection (« Analyse de ma sélection »).
const own = C.analysisData(st, lyon, TID, null, now, ctx);
assert.ok(own.ok && own.own && own.teamId === TID && own.report.gamesPlayed === mine.length && own.report.headToHead.length === 0, "ma sélection");
ok("ma sélection : même rapport, sans confrontation");

// 5) Saison précédente gardée, plus ancienne ignorée.
const own3 = C.analysisData(st, lyon, TID, null, now, { season: 3, pool: null });
assert.strictEqual(own3.report.gamesPlayed, mine.length, "saison précédente incluse");
const own4 = C.analysisData(st, lyon, TID, null, now, { season: 4, pool: null });
assert.strictEqual(own4.report.gamesPlayed, 0, "deux saisons plus tôt : ignorée");
ok("saison en cours et précédente seulement");
console.log("\n🏁 national_analysis_test.js : analyse Premium du Mode Sélectionneur conforme.");
