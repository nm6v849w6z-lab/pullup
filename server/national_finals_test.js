// Sélections nationales — phase D (server/nationalMatches.js) : phases
// finales de la dernière semaine (lundi → dimanche 20h), consolation,
// récupération améliorée (seulement là), classement final, palmarès, Coupe
// du monde la saison suivante (classement continental), règle de la
// Supercoupe (joueur encore en course avec sa sélection : absent).
const assert = require("assert");
const store = require("./store.js");
const N = require("./nationalTeams.js");
const C = require("./nationalCoach.js");
const M = require("./nationalMatches.js");
const NationalCup = require("./nationalCup.js");
const Calendar = require("./calendar.js");
const LiveMatch = require("./liveMatch.js");
const Engine = require("../engine.js");
const ok = m => console.log("✅ " + m);
const DAY = 864e5;

const start = Date.UTC(2027, 0, 5, 19);
const COUNTRIES = Object.keys(Engine.WORLD_COUNTRIES);
const lg = store.createMultiManagerCareer(["Lyon NT", "Paris NT"], start).league;
lg.seasonNumber = 2; lg.calendarStartAt = start; lg.country = "fr";
const all = lg.teams.flatMap(t => t.players);
const fresh = at => all.forEach(p => { p.condition = 100; p.conditionUpdatedAt = at; p.injuryUntil = null; });
all.forEach((p, i) => { p.nationality = COUNTRIES[i % COUNTRIES.length]; p.age = 25; });
fresh(start);
const leagues = new Map([["fr-1", lg]]);
const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }] };
const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
// Durée sûre d'un direct (diffusion d'un match, prolongations comprises).
const LIVE = 5 * 3600e3;
const runSeason = (season, s0) => {
  lg.seasonNumber = season; lg.calendarStartAt = s0;
  N.step(st, leagues, world, s0 + 3600e3);
  const comp = M.compOf(st, season, "A");
  for (const w of [1, 2, 3]) {
    const at = comp.matches.find(m => m.w === w).at;
    fresh(at - DAY);
    N.step(st, leagues, world, at - 3 * DAY + 1000);
    N.step(st, leagues, world, at + 60e3);
    // Fin des directs (2026-10-06) : résultats, classement, tirage.
    N.step(st, leagues, world, at + LIVE);
  }
  return comp;
};
const comp = runSeason(2, start);
assert.ok(comp.matches.every(m => m.status === "played"));

// 1) Tournois créés à la fin des qualifications.
const fin = M.finalsOf(st, 2, "A");
assert.ok(fin && fin.comp === "continental");
const by = k => fin.tournaments.find(t => t.key === k);
assert.strictEqual(by("EUM").teams.length, 8, "Euro : 8 qualifiés");
assert.strictEqual(by("EUC").teams.length, 2, "consolation européenne : 2");
assert.strictEqual(by("AMM").teams.length, 4, "AmeriCup : 4");
assert.strictEqual(by("ASM").teams.length, 3, "Coupe d'Asie : 3");
const days = N.seasonCalendar(N.configOf(st), start, 2, "A").find(c => c.kind === "final").days;
const dayOf = m => days.indexOf(m.at);
assert.ok(by("EUM").matches.filter(m => m.stage === "group").every(m => dayOf(m) >= 0 && dayOf(m) <= 2), "Euro : poules du lundi au mercredi");
assert.strictEqual(by("EUM").ko, 8);
ok("tournois de la dernière semaine : Euro (8), consolation (2), AmeriCup (4), Coupe d'Asie (3)");

// 2) Semaine de phase finale jour par jour, récupération améliorée.
fresh(days[0] - DAY);
N.step(st, leagues, world, days[0] - 3 * DAY + 1000);
const euConv = C.convocationOf(st, by("EUM").teams[0], `s2f`);
assert.ok(euConv && euConv.frozenAt, "convocations de la phase finale figées 3 jours avant");
assert.ok(!C.convocationOf(st, "zz-A", "s2f"));
// Lundi : une journée de poules ; perte de forme d'un joueur comparée à une fenêtre.
const t0 = by("EUM");
const m0 = t0.matches.find(m => m.stage === "group" && m.day === 0);
const condBefore = new Map(all.map(p => [p, Engine.currentCondition(p, m0.at)]));
N.step(st, leagues, world, days[0] + 60e3);
assert.ok(t0.matches.filter(m => m.day === 0).every(m => m.status === "played"));
const losses = [];
[...m0.boxHome, ...m0.boxAway].filter(r => r.min >= 30).forEach(r => {
  const p = all.find(x => x.id === r.ref.p && x.name === r.ref.n);
  losses.push(condBefore.get(p) - p.condition);
});
const normal = Engine.conditionLossForMinutes ? Engine.conditionLossForMinutes(34) : null;
assert.ok(losses.length && losses.every(l => l >= 0), "la fatigue existe toujours");
if (normal) assert.ok(Math.max(...losses) <= normal * 0.5 + 1.5 + 1, `récupération améliorée (perte ${Math.max(...losses)} pour ~${normal} normalement)`);
ok("phase finale jour par jour, récupération améliorée (moitié de la fatigue d'un match rendue)");
// Mardi → vendredi (quarts).
for (const d of [1, 2, 3, 4]) { N.step(st, leagues, world, days[d] + 60e3); N.step(st, leagues, world, days[d] + LIVE); }
const qf = t0.matches.filter(m => m.stage === "qf");
assert.strictEqual(qf.length, 4);
assert.ok(qf.every(m => m.status === "played" && dayOf(m) === 4), "quarts le vendredi");
const sf = t0.matches.filter(m => m.stage === "sf");
assert.ok(sf.length === 2 && sf.every(m => dayOf(m) === 5 && m.status === "scheduled"), "demi-finales programmées le samedi");
// 3) Règle de la Supercoupe (samedi 20h).
const un = M.unavailableAt(st, days[5]);
const sfTeams = sf.flatMap(m => [m.home, m.away]);
const qfLosers = qf.map(m => (m.scoreHome > m.scoreAway ? m.away : m.home));
const refsOf = tid => (C.convocationOf(st, tid, "s2f") || { players: [] }).players.map(C.refKey);
assert.ok(sfTeams.every(tid => refsOf(tid).every(k => un.has(k))), "demi-finalistes : absents de la Supercoupe");
assert.ok(qfLosers.every(tid => refsOf(tid).every(k => !un.has(k))), "éliminés en quart : jouent la Supercoupe");
// Supercoupe jouée entre deux clubs IA : un demi-finaliste écarté.
const retainedRef = refsOf(sfTeams[0])[0];
const retainedPlayer = all.find(p => C.refKey({ p: p.id, n: p.name }) === retainedRef);
const clubIdx = lg.teams.findIndex(t => t.players.includes(retainedPlayer));
const oppIdx = clubIdx === 2 ? 3 : 2;
lg.teams[clubIdx].isHuman = false; lg.teams[oppIdx].isHuman = false;
const sc = { country: "fr", season: 2, at: days[5], home: { leagueId: "fr-1", idx: clubIdx, name: lg.teams[clubIdx].name }, away: { leagueId: "fr-1", idx: oppIdx, name: lg.teams[oppIdx].name }, handicap: { home: 0, away: 0 } };
const untilBefore = retainedPlayer.injuryUntil;
const logBefore = retainedPlayer.matchLog.length;
NationalCup.stepSuperCup({ Engine, LiveMatch, Calendar }, sc, leagues, days[5] + 1000, [], { unavailable: un });
assert.strictEqual(retainedPlayer.injuryUntil, untilBefore, "aucune blessure inventée");
assert.strictEqual(retainedPlayer.matchLog.length, logBefore, "le joueur retenu ne joue pas la Supercoupe");
assert.ok(sc.started && (sc.retained || []).some(r => r.name === retainedPlayer.name));
ok("règle de la Supercoupe : joueurs encore en course retenus (écartés le temps du match), éliminés avant les demies disponibles");

// 4) Samedi, dimanche : classement final, palmarès.
N.step(st, leagues, world, days[5] + 60e3);
N.step(st, leagues, world, days[6] + 60e3);
N.step(st, leagues, world, days[6] + LIVE);
assert.ok(fin.tournaments.every(t => t.ranking && t.ranking.length === t.teams.length), "classement final complet");
assert.ok(fin.honoured);
const champ = t0.champion;
assert.ok(M.honoursOf(st, champ).some(h => h.rank === 1 && h.label === "Euro"), "palmarès du vainqueur");
const tv = N.teamView(st, champ, null, 2, days[6] + LIVE, start);
assert.ok(tv.finals && tv.finals.tournaments[0].champion === champ && tv.honours.length);
ok("dimanche : finale et 3e place, classement final, palmarès sur la page de la sélection");

// 5) Saison Coupe du monde : qualifiés d'après le classement continental.
const s3 = start + 84 * DAY;
runSeason(3, s3);
const wc = M.finalsOf(st, 3, "A");
assert.ok(wc && wc.comp === "world");
const cup = wc.tournaments.find(t => t.kind === "world"), cons = wc.tournaments.find(t => t.kind === "consolation");
assert.strictEqual(cup.teams.length, 8);
assert.strictEqual(cons.teams.length, 9, "consolation : les 9 autres");
const euTop5 = fin.tournaments.find(t => t.key === "EUM").ranking.slice(0, 5);
assert.deepStrictEqual(cup.teams.filter(id => euTop5.includes(id)).sort(), euTop5.slice().sort(), "les 5 premiers de l'Euro");
assert.ok(cup.teams.includes(by("ASM").ranking[0]) && by("AMM").ranking.slice(0, 2).every(id => cup.teams.includes(id)), "2 américains, 1 asiatique");
assert.strictEqual(cons.ko, 4, "consolation à 9 : 2 poules (5 et 4), demi-finales, finale");
ok("Coupe du monde (5 européens, 2 américains, 1 asiatique d'après le classement continental) et consolation des 9 autres");
console.log("\n🏁 national_finals_test.js : phases finales, récupération, Supercoupe et Coupe du monde conformes.");
