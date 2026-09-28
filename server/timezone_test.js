// Fuseau horaire par ligue (retour utilisateur 2026-09-28 : matchs à 20:00
// heure locale, « oui heure de new york » pour les USA) et mise à jour
// hebdomadaire UNIQUE pour tous les pays (lundi 6h à Paris). Voir
// League.timeZone et zonedScheduledTimeForSlot/weeklyRhythmEconomyTickAt
// (server/calendar.js et ses copies).
const assert = require("assert");
const E = require("../engine.js");
const C = require("./calendar.js");
const fmt = (ms, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
const created = Date.UTC(2026, 8, 27, 9);
const fr = E.generateMultiManagerLeague(["Lyon TZ"], 1, created, C.dailyAnchoredCalendarConfig());
const us = E.generateMultiManagerLeague(["Boston TZ"], 1, created, C.dailyAnchoredCalendarConfig());
us.timeZone = "America/New_York";
us.calendarStartAt = C.weeklyRhythmCalendarStartAt(created, us.timeZone);
assert.strictEqual(fmt(us.calendarStartAt, "America/New_York"), "Tue 20:00");
for (let r = 0; r < 18; r++) {
  assert.strictEqual(fmt(C.scheduledTimeForLeagueRound(us, r), "America/New_York"), (r % 2 ? "Sat" : "Tue") + " 20:00");
  assert.strictEqual(fmt(C.scheduledTimeForLeagueRound(fr, r), "Europe/Paris"), (r % 2 ? "Sat" : "Tue") + " 20:00");
}
assert.strictEqual(fmt(C.scheduledTimeForLeagueCupRound(us, 0), "America/New_York"), "Thu 20:00");
for (let k = 1; k < 9; k++) {
  const a = C.scheduledTimeForLeagueEconomyTick(fr, k), b = C.scheduledTimeForLeagueEconomyTick(us, k);
  assert.strictEqual(a, b, `mise à jour ${k} au même instant`);
  assert.strictEqual(fmt(a, "Europe/Paris"), "Mon 06:00");
  assert.ok(b > C.scheduledTimeForLeagueRound(us, 2 * k - 1) && b < C.scheduledTimeForLeagueRound(us, 2 * k));
}
// Nouvelle saison : reste à l'heure de New York.
us.startNextSeason(C.scheduledTimeForLeagueEconomyTick(us, 12));
assert.strictEqual(fmt(us.calendarStartAt, "America/New_York"), "Tue 20:00");
const back = E.leagueFromSave(JSON.parse(JSON.stringify(E.serializeLeague(us))));
assert.strictEqual(back.timeZone, "America/New_York");
console.log("✅ Fuseaux : 20:00 heure locale (Paris / New York), Coupe jeudi 20:00, mise à jour au même instant pour tous (lundi 6h Paris), nouvelle saison et sauvegarde gardent le fuseau.");
console.log("\n🏁 timezone_test.js : tout est vert");
