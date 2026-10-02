// Ligue privée SPÉCIALE (retour utilisateur 2026-10-02 : 3 clubs, 30
// matchs à 10h 12h 14h 16h 18h 20h sur 5 jours à partir de demain).
const assert = require("assert");
const Engine = require("../engine.js");
const Calendar = require("./calendar.js");
const PL = require("./privateLeague.js");

const NOW = Calendar.parisEpochForLocalTime(2026, 10, 2, 21, 0);
const lg = Engine.generateMultiManagerLeague(["Gotham Knights", "BC Dia", "Krautentruppen"], 1, NOW, Calendar.dailyAnchoredCalendarConfig());
const refs = [0, 1, 2].map(i => PL.refFor("fr-1", lg, i, "Division I"));
const store = PL.emptyStore();
// Ligue privée normale déjà en cours pour Gotham Knights.
store.list.push({ id: "normale", name: "Coupe des Champions", status: "running", members: [refs[0]], rounds: [] });

const startDay = Calendar.addParisCalendarDays(Calendar.parisLocalDateParts(NOW), 1);
const r = PL.createSpecialPrivateLeague(Engine, store, refs, { name: "Ligue spéciale", hours: [10, 12, 14, 16, 18, 20], days: 5, startDay }, NOW);
assert.ok(r.ok, r.error);
const lp = store.list.find(l => l.id === r.privateLeagueId);
assert.strictEqual(lp.rounds.length, 30, "30 matchs");
assert.ok(lp.rounds.every(x => x.matches.length === 1), "un match par créneau");
const first = Calendar.parisLocalDateParts(lp.rounds[0].dueAt);
assert.deepStrictEqual([first.year, first.month, first.day], [2026, 10, 3], "premier jour : demain");
assert.strictEqual(lp.rounds[0].dueAt, Calendar.parisEpochForLocalTime(2026, 10, 3, 10, 0), "premier match à 10h");
assert.strictEqual(lp.rounds[29].dueAt, Calendar.parisEpochForLocalTime(2026, 10, 7, 20, 0), "dernier match le 5e jour à 20h");
const perTeam = [0, 0, 0], homes = [0, 0, 0], pairs = {};
lp.rounds.forEach(x => { const m = x.matches[0]; perTeam[m.home]++; perTeam[m.away]++; homes[m.home]++; const k = [m.home, m.away].sort().join("-"); pairs[k] = (pairs[k] || 0) + 1; });
assert.deepStrictEqual(perTeam, [20, 20, 20], "20 matchs par club");
assert.deepStrictEqual(homes, [10, 10, 10], "10 à domicile chacun");
assert.deepStrictEqual(Object.values(pairs), [10, 10, 10], "chaque affiche 10 fois");
console.log("✅ 30 matchs, 6 par jour sur 5 jours, 20 par club (10 à domicile), chaque affiche 10 fois");

assert.strictEqual(PL.activeFor(store, "fr-1", 0).id, "normale", "la ligue spéciale ne compte pas comme ligue privée normale");
console.log("✅ jouable en plus de la ligue privée normale");

const view = PL.projectForViewer(store, "fr-1", 1, NOW).privateLeagues.find(l => l.id === lp.id);
assert.ok(view && view.special, "projection : ligue spéciale visible et marquée");

const leagues = new Map([["fr-1", lg]]);
PL.catchUp(Engine, store, leagues, lp.rounds[0].dueAt - 1000, {});
assert.ok(!lp.rounds[0].matches[0].played, "rien avant 10h");
assert.strictEqual(PL.nextDeadline(store, NOW), lp.rounds[0].dueAt, "prochaine échéance : 10h demain");
PL.catchUp(Engine, store, leagues, lp.rounds[0].dueAt + 1000, {});
assert.ok(lp.rounds[0].matches[0].played && !lp.rounds[1].matches[0].played, "10h joué, 12h pas encore");
console.log("✅ coup d'envoi à l'heure, créneau par créneau");
console.log("\n✅ special_private_league_test.js : tout est vert");
