// Barrage 7e-8e seulement s'il a un enjeu (2026-09-29, décision
// utilisateur « enlève le barrage aussi ») : au moins 3 championnats ouverts
// juste en dessous. league.barrageHasStakes === false → pas de barrage (et
// un barrage déjà programmé mais pas commencé est annulé).
const assert = require("assert");
const Calendar = require("./server/calendar.js");
const AutoSim = require("./server/autoSim.js");
const store = require("./server/store.js");
const H = 3600 * 1000;
function playToEndOfRegularSeason(stakes) {
  const created = Date.UTC(2026, 8, 27, 9);
  const league = store.createMultiManagerCareer(["Lyon Enjeu", "Paris Enjeu"], created, "Lyon Enjeu").league;
  league.calendarDailyAnchored = true; league.calendarWeeklyRhythm = true;
  league.calendarStartAt = Calendar.weeklyRhythmCalendarStartAt(created);
  league.cup = null;
  league.barrageHasStakes = stakes;
  let t = created;
  for (let i = 0; i < 400 && !league.playoffs; i++) { t += 6 * H; AutoSim.catchUpLeague(league, t); }
  return { league, t };
}
const off = playToEndOfRegularSeason(false);
assert.ok(off.league.playoffs, "play-offs lancés");
assert.ok(!off.league.relegationBarrage, "aucun barrage sans enjeu");
console.log("✅ Sans 3 championnats en dessous : pas de barrage.");
const on = playToEndOfRegularSeason(true);
assert.ok(on.league.relegationBarrage && on.league.relegationBarrage.pending, "barrage programmé quand il a un enjeu");
console.log("✅ Avec enjeu : barrage programmé comme avant.");
on.league.barrageHasStakes = false;
AutoSim.catchUpLeague(on.league, on.league.relegationBarrage.at + 1);
assert.ok(!on.league.relegationBarrage, "barrage devenu sans enjeu : annulé avant le coup d envoi");
console.log("✅ Barrage déjà programmé mais devenu sans enjeu : annulé.");
const World = require("./server/world.js");
const w = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }, { id: "fr-2a", country: "fr", level: 2, group: 0 }, { id: "fr-2b", country: "fr", level: 2, group: 1 }] };
assert.strictEqual(World.divisionMovesFor(w, "fr-1").barrage, false);
w.leagues.push({ id: "fr-2c", country: "fr", level: 2, group: 2 });
assert.strictEqual(World.divisionMovesFor(w, "fr-1").barrage, true);
console.log("✅ L'enjeu suit le nombre de championnats ouverts juste en dessous.");
console.log("\n🏁 Barrage uniquement quand il compte.");
