// Verrou des ordres à T − 5 min côté SERVEUR (retour utilisateur,
// 2026-09-26 : "les ordres ne sont pas bloqués 5 min avant le match") —
// /api/lineup, /api/tactics et /api/plan acceptaient tout jusqu'au coup
// d'envoi. Voir server/actions.js:ordersLockedFor.
const Engine = require("../engine.js");
const Calendar = require("./calendar.js");
const Shows = require("./shows.js");
const actions = require("./actions.js");

const league = Engine.generateLeague(Engine.generateStartingRoster("Test FC"));
const team = league.teams[0];
const r = league.round;
const kickoffAt = Calendar.scheduledTimeForLeagueRound(league, r);
const LOCK = Shows.LINEUP_LOCK_BEFORE_KICKOFF_MS;
const before = kickoffAt - LOCK - 1000, inside = kickoffAt - LOCK + 1000;

const t1 = actions.setTactics(team, 0, league, { rhythm: team.rhythm }, before);
if (!t1.ok) throw new Error("❌ Avant T-5min, /api/tactics devrait être accepté : " + t1.error);
const t2 = actions.setTactics(team, 0, league, { rhythm: team.rhythm }, inside);
if (t2.ok || !/verrouill/i.test(t2.error)) throw new Error("❌ Après T-5min, /api/tactics devrait être refusé (verrou).");
console.log("✅ /api/tactics refusé dans les 5 dernières minutes, accepté avant.");

const l2 = actions.setLineup(team, 0, league, team.lineup, inside);
if (l2.ok) throw new Error("❌ Après T-5min, /api/lineup devrait être refusé.");
console.log("✅ /api/lineup refusé dans les 5 dernières minutes.");

const p2 = actions.setPlan(team, 0, league, { round: r, competition: "championship", patch: { rhythm: team.rhythm } }, inside);
if (p2.ok) throw new Error("❌ /api/plan sur la journée verrouillée devrait être refusé.");
// Journée suivante : toujours préparable.
let next = null;
for (let x = r + 1; x < league.totalRounds; x++) if ((league.schedule[x] || []).some(m => m.home === 0 || m.away === 0)) { next = x; break; }
if (next != null) {
  const p3 = actions.setPlan(team, 0, league, { round: next, competition: "championship", patch: { rhythm: team.rhythm } }, inside);
  if (!p3.ok) throw new Error("❌ Une journée FUTURE doit rester préparable pendant le verrou : " + p3.error);
}
console.log("✅ /api/plan : journée verrouillée refusée, journées suivantes toujours préparables.");
