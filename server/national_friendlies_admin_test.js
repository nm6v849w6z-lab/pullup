// Amicaux internationaux programmés par l'admin (POST /api/admin/national
// { action: "friendly" }, voir nationalFriendlies.adminSchedule) : France –
// Allemagne aux prochains dimanches de fenêtre libres, ou à une date forcée.
const assert = require("assert");
const N = require("./nationalTeams.js");
const F = require("./nationalFriendlies.js");
const ok = m => console.log("✅ " + m);
const DAY = 864e5;
const start = Date.UTC(2027, 0, 5, 19);
const st = N.emptyStore(); st.config = { cycleStartSeason: 2, matchesLive: true };
N.step(st, new Map(), { leagues: [] }, start + 3600e3);
const ctx = { season: 2, calendarStartAt: start };
let now = start + 3600e3;
assert.ok(st.teams["fr-A"] && st.teams["de-A"], "sélections fr-A et de-A");

const r = F.adminSchedule(st, { home: "fr-A", away: "de-A", count: 2 }, now, ctx);
assert.ok(r.ok, r.error);
assert.strictEqual(r.friendlies.length, 2);
const cand = F.candidateDays(st, 2, start).map(d => d.at);
assert.ok(r.friendlies.every(f => cand.includes(f.at)), "dimanches de fenêtre internationale");
assert.ok(Math.abs(r.friendlies[0].at - r.friendlies[1].at) >= 3 * DAY, "pas deux matchs la même semaine");
assert.ok(st.intlFriendlies.filter(f => f.admin && f.status === "accepted").length === 2 && !st.intlFriendlies.some(f => f.id === "tmp"), "deux amicaux acceptés");
ok(`2 amicaux France – Allemagne aux prochaines fenêtres libres : ${r.friendlies.map(f => f.when).join(" ; ")}`);

const d = new Date(now + 10 * DAY);
const date = d.toISOString().slice(0, 10);
const bad = F.adminSchedule(st, { home: "fr-A", away: "de-A", date, time: "18:30" }, now, ctx);
assert.ok(!bad.ok && /force/.test(bad.error), "hors fenêtre sans force : refusé");
const forced = F.adminSchedule(st, { home: "fr-A", away: "de-A", date, time: "18:30", force: true }, now, ctx);
assert.ok(forced.ok || /3 jours/.test(forced.error), forced.error);
assert.ok(!F.adminSchedule(st, { home: "fr-A", away: "fr-U21" }, now, ctx).ok, "catégories différentes : refusé");
assert.ok(!F.adminSchedule(st, { home: "fr-A", away: "xx-A" }, now, ctx).ok, "sélection inconnue : refusé");
ok("date forcée (force: true) acceptée hors fenêtre ; catégories différentes et sélection inconnue refusées");
