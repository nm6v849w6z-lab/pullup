// Nouvelle saison automatique qui GARDE les effectifs (retour utilisateur,
// 2026-09-28) : cycle de 12 semaines (9 championnat + 2 play-offs + 1
// intersaison), mise à jour de fin de saison le lundi qui suit la finale
// (vieillissement une seule fois par saison, retraites, primes, forme remise
// à 100, motivation relevée à « Neutre »), puis le lundi suivant nouvelle
// saison : nouveau calendrier, nouvelle Coupe, classement à zéro, mêmes
// clubs et mêmes joueurs. Voir League.startIntersaison/startNextSeason
// (engine.js) et server/autoSim.js:catchUpWeeklyRhythm.
const assert = require("assert");
const E = require("../engine.js");
const C = require("./calendar.js");
const A = require("./autoSim.js");

const H = 3600 * 1000, D = 24 * H;
const PARIS = "Europe/Paris";
function paris(ms) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: PARIS, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).reduce((o, x) => (o[x.type] = x.value, o), {});
  return `${p.weekday} ${p.hour}:${p.minute}`;
}
const ok = m => console.log("✅ " + m);

const created = Date.UTC(2026, 8, 27, 9); // dimanche 27 septembre 2026
const lg = E.generateMultiManagerLeague(["Lyon Saison", "Paris Saison"], 1, created, C.dailyAnchoredCalendarConfig());
assert.strictEqual(lg.seasonNumber === undefined ? 1 : lg.seasonNumber, 1);
const start1 = lg.calendarStartAt;
const human = lg.teams[0];
const cpu = lg.teams.find(t => !t.isHuman);
const humanIds = human.players.map(p => p.id).sort();
const cpuIds = cpu.players.map(p => p.id).sort();
const humanAges = new Map(human.players.map(p => [p.id, p.age]));
const cpuAges = new Map(cpu.players.map(p => [p.id, p.age]));
// Un vétéran sur le départ, un joueur démotivé.
const leaver = human.players[0];
leaver.retiringAfterSeason = true;
const sulky = human.players[1];

// 1) Toute la saison + les play-offs.
let t = created;
const events = [];
for (let i = 0; i < 2000 && !lg.isPlayoffsDone(); i++) {
  t += 3 * H;
  A.catchUpLeague(lg, t).forEach(e => events.push(e));
}
assert.ok(lg.isPlayoffsDone(), "play-offs terminés");
assert.ok(!lg.seasonEndTickDone);
// Juste avant le lundi : rien n'a bougé côté âges.
const endTick = C.weeklyRhythmEconomyTickAt(lg.calendarStartAt, (lg.lastEconomyTick || 0) + 1);
assert.strictEqual(paris(endTick), "Mon 00:00");
assert.ok(endTick - start1 <= 11 * 7 * D, "fin de saison au plus tard le lundi de la semaine 12");
ok(`saison complète jouée, mise à jour de fin de saison ${new Date(endTick).toISOString().slice(0, 10)} (${paris(endTick)})`);

// 2) Lundi de fin de saison = début d'intersaison.
sulky.form = 10; sulky.transferRequestActive = true;
human.players[2].condition = 40; human.players[2].conditionUpdatedAt = endTick - D;
const ev2 = A.catchUpLeague(lg, endTick + 60 * 1000);
assert.ok(lg.seasonEndTickDone, "mise à jour de fin de saison faite");
assert.ok(lg.isPlayoffsDone(), "toujours en intersaison (classement conservé jusqu'à la reprise)");
assert.strictEqual(lg.intersaisonStartedAt, endTick);
assert.ok(!human.players.includes(leaver), "le retraité est parti");
human.players.forEach(p => {
  assert.strictEqual(p.age, humanAges.get(p.id) + 1, `${p.name} a pris exactement un an`);
  assert.strictEqual(p.condition, 100, "forme physique remise à 100");
  assert.ok(p.form >= E.INTERSAISON_MOTIVATION_FLOOR, "motivation au moins « Neutre »");
});
assert.strictEqual(sulky.form, E.INTERSAISON_MOTIVATION_FLOOR);
assert.strictEqual(sulky.transferRequestActive, false, "demande de transfert refermée");
cpu.players.forEach(p => { if (cpuAges.has(p.id)) assert.strictEqual(p.age, cpuAges.get(p.id) + 1, "l'IA vieillit aussi"); });
const seasonEndEvent = ev2.find(e => e.type === "training" && e.seasonEnd);
assert.ok(seasonEndEvent && seasonEndEvent.retired.some(r => r.playerId === leaver.id));
assert.ok((human.seasonHistory || []).length >= 1, "saison archivée dans l'histoire du club");
ok("lundi de fin de saison : retraite, un an de plus pour tous (IA comprise), forme 100, motivation « Neutre » au minimum, saison archivée");

// Rattrapage répété pendant l'intersaison : rien ne vieillit deux fois.
const agesAfter = new Map(human.players.map(p => [p.id, p.age]));
A.catchUpLeague(lg, endTick + 3 * D);
human.players.forEach(p => assert.strictEqual(p.age, agesAfter.get(p.id)));
assert.strictEqual(lg.seasonNumber || 1, 1, "toujours la saison 1 pendant l'intersaison");
// Garde-fou : une seconde mise à jour de fin de saison pour le MÊME numéro
// de saison (ex. joueur transféré d'une autre ligue déjà basculée) ne le
// refait pas vieillir.
const p0 = human.players[0];
const age0 = p0.age;
human.trainWeek(1, endTick, { seasonEnd: true, seasonNo: 1 });
assert.strictEqual(p0.age, age0, "garde-fou : pas de second anniversaire pour la même saison");
ok("pendant l'intersaison : marchés actifs, aucun second vieillissement (garde-fou par numéro de saison)");

// 3) Lundi suivant : nouvelle saison.
const restart = C.weeklyRhythmEconomyTickAt(lg.calendarStartAt, (lg.lastEconomyTick || 0) + 1);
assert.strictEqual(restart - endTick, 7 * D, "une semaine d'intersaison");
const ev3 = A.catchUpLeague(lg, restart + 60 * 1000);
const ns = ev3.find(e => e.type === "new-season");
assert.ok(ns && ns.seasonNumber === 2, "événement nouvelle saison");
assert.strictEqual(lg.seasonNumber, 2);
assert.strictEqual(lg.round, 0);
assert.deepStrictEqual(lg.results, []);
assert.strictEqual(lg.playoffs, null);
assert.strictEqual(lg.seasonEndTickDone, false);
assert.strictEqual(lg.lastEconomyTick, 0);
assert.ok(lg.cup && lg.cup.champion == null && lg.cup.rounds.length === 1, "nouvelle Coupe");
assert.strictEqual(paris(lg.calendarStartAt), "Tue 20:00");
assert.strictEqual(lg.calendarStartAt - restart, D + 20 * H, "reprise le mardi à 20:00, le lendemain");
assert.deepStrictEqual(human.players.map(p => p.id).sort(), humanIds.filter(id => id !== leaver.id).sort(), "même effectif (moins le retraité)");
assert.strictEqual(lg.teams.length, 10);
assert.ok(human.players.every(p => (p.matchLog || []).length === 0), "stats de saison remises à zéro");
assert.ok(human.feed.entries.some(e => e.key === "season_start" && /saison 2/.test(e.title)));
ok(`nouvelle saison 2 le ${paris(restart)} : premier match ${paris(lg.calendarStartAt)}, mêmes clubs et effectifs, classement et Coupe remis à zéro`);

// 4) La saison 2 se joue normalement, et sa fin fait vieillir d'un an de plus.
const agesS2 = new Map(human.players.map(p => [p.id, p.age]));
t = restart;
for (let i = 0; i < 2000 && !lg.isPlayoffsDone(); i++) { t += 3 * H; A.catchUpLeague(lg, t); }
assert.ok(lg.isPlayoffsDone());
const end2 = C.weeklyRhythmEconomyTickAt(lg.calendarStartAt, (lg.lastEconomyTick || 0) + 1);
A.catchUpLeague(lg, end2 + 60 * 1000);
human.players.forEach(p => { if (agesS2.has(p.id)) assert.strictEqual(p.age, agesS2.get(p.id) + 1); });
assert.ok(human.seasonHistory.length >= 2, "deux saisons dans l'histoire du club");
const restart2 = C.weeklyRhythmEconomyTickAt(lg.calendarStartAt, (lg.lastEconomyTick || 0) + 1);
A.catchUpLeague(lg, restart2 + 60 * 1000);
assert.strictEqual(lg.seasonNumber, 3);
ok("saison 2 jouée, vieillissement de fin de saison 2, puis saison 3");

// 5) Sauvegarde : numéro de saison, intersaison, garde-fou de vieillissement.
const back = E.leagueFromSave(JSON.parse(JSON.stringify(E.serializeLeague(lg))));
assert.strictEqual(back.seasonNumber, 3);
assert.ok(back.teams[0].players.every(p => p.lastAgedSeasonNo === 2 || p.age <= 19), "garde-fou persisté");
ok("sauvegarde : numéro de saison et garde-fou de vieillissement persistés");

// 6) autoNextSeason === false : ancien comportement (attente d'un reset).
const lg2 = E.generateMultiManagerLeague(["X"], 1, created, C.dailyAnchoredCalendarConfig());
lg2.autoNextSeason = false;
t = created;
for (let i = 0; i < 2000 && !lg2.isPlayoffsDone(); i++) { t += 3 * H; A.catchUpLeague(lg2, t); }
A.catchUpLeague(lg2, t + 60 * D);
assert.strictEqual(lg2.seasonNumber || 1, 1);
assert.ok(lg2.isPlayoffsDone());
ok("autoNextSeason = false : pas de nouvelle saison automatique");

console.log("\n🏁 new_season_test.js : tout est vert");
