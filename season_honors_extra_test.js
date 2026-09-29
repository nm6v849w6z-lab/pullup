// Récompenses à la fin de la saison régulière, 6e homme, MVP des play-offs
// et All-Star Game de mi-saison (retours utilisateur 2026-09-28), par-dessus
// awardSeasonHonours (voir season_awards_test.js).
const E = require("./engine.js");
const C = require("./server/calendar.js");
const A = require("./server/autoSim.js");
function check(c, m) { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); }
function paris(ms) { return new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", hourCycle: "h23" }).format(new Date(ms)); }

const created = Date.UTC(2026, 8, 27, 9);
const lg = E.generateMultiManagerLeague(["Alpha", "Beta"], 1, created, C.dailyAnchoredCalendarConfig());
const events = [];
let t = created, seen = null;
for (let i = 0; i < 900; i++) {
  t += 4 * 3600 * 1000;
  A.catchUpLeague(lg, t).forEach(e => events.push(e));
  if (lg.seasonAwards && !seen) seen = { round: lg.round, done: lg.isPlayoffsDone(), keys: lg.seasonAwards.awards.map(a => a.key) };
  if (lg.isPlayoffsDone()) { E.awardSeasonHonours(lg, t); break; }
}
check(lg.isPlayoffsDone(), "(saison simulée jusqu'au champion)");
check(seen && seen.round === lg.totalRounds && !seen.done && !seen.keys.includes("playoffsMvp"), "récompenses décernées dès la fin de la saison régulière, sans MVP des play-offs");
const aw = lg.seasonAwards.awards;
const mvp = aw.find(a => a.key === "mvp"), sixth = aw.find(a => a.key === "sixthMan"), po = aw.find(a => a.key === "playoffsMvp");
check(!!mvp && (!sixth || sixth.playerId !== mvp.playerId), "6e homme jamais le MVP");
check(!!po && po.teamIdx === lg.playoffs.champion, `MVP des play-offs dans l'équipe championne (${po && po.playerName})`);
const poPlayer = lg.teams[po.teamIdx].players.find(p => p.id === po.playerId);
check(poPlayer.awards.some(a => a.key === "playoffsMvp"), "MVP des play-offs dans les distinctions du joueur");
const before = JSON.stringify(lg.seasonAwards);
E.awardSeasonHonours(lg, t + 1000);
check(JSON.stringify(lg.seasonAwards) === before, "idempotent");
const asg = lg.allStarGame;
check(!!asg && events.filter(e => e.type === "all-star-game").length === 1, "All-Star Game joué une fois à mi-saison");
check(/^Sun, 20$/.test(paris(asg.playedAt)), "le dimanche à 20h");
check(asg.teams.every(s => s.players.length === 10) && asg.teams[0].players.every(p => p.nationality === (lg.country || "fr")) && asg.teams[1].players.every(p => p.nationality !== (lg.country || "fr")), "10 nationaux contre 10 étrangers");
check(asg.teams.flatMap(s => s.players).filter(p => p.min > 0).length === 20, "tout le monde joue");
const back = E.leagueFromSave(JSON.parse(JSON.stringify(E.serializeLeague(lg))));
check(back.allStarGame && back.allStarGame.mvp.id === asg.mvp.id && back.seasonHonoursId === lg.seasonHonoursId, "sauvegarde : All-Star Game et clôture conservés");
console.log("\n🏁 Récompenses (saison régulière, 6e homme, MVP des play-offs) et All-Star Game vérifiés.");
