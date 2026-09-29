// Rivaux du championnat et derbys (2026-09-29) : chaque club a un rival,
// managers appariés entre eux d'abord, paires gardées d'une saison à
// l'autre, deux derbys max par saison (championnat seulement), affluence et
// humeur renforcées.
const assert = require("assert");
const Engine = require("./engine.js");
const store = require("./server/store.js");
const Calendar = require("./server/calendar.js");
const AutoSim = require("./server/autoSim.js");
const H = 3600 * 1000;
const created = Date.UTC(2026, 8, 27, 9);
const league = store.createMultiManagerCareer(["Alpha Derby", "Beta Derby", "Gamma Derby"], created, "Alpha Derby").league;
const n = league.teams.length;
const rivals = league.teams.map((_, i) => league.rivalOf(i));
rivals.forEach((r, i) => { assert(r != null && r !== i, `club ${i} sans rival`); assert.strictEqual(rivals[r], i, "rivalité réciproque"); });
const humans = league.teams.map((t, i) => t.isHuman ? i : null).filter(i => i != null);
assert.strictEqual(humans.length, 3);
const hh = humans.filter(i => league.teams[rivals[i]].isHuman).length;
assert.strictEqual(hh, 2, "sur 3 managers, 2 sont rivaux entre eux, le 3e a un rival de l'IA");
console.log("✅ Chaque club a un rival (réciproque), managers appariés entre eux d'abord.");
for (let i = 0; i < n; i++) {
  let d = 0;
  for (let r = 0; r < league.totalRounds; r++) league.matchesForRound(r).forEach(m => { if (!m.bye && (m.home === i || m.away === i) && league.isDerbyMatch(m.home, m.away)) d++; });
  assert.strictEqual(d, 2, `club ${i} : ${d} derbys au lieu de 2`);
}
console.log("✅ Deux derbys par saison pour chaque club (aller et retour).");
// Saison suivante : paires gardées si mêmes clubs ; un club remplacé → réappariement.
const before = JSON.stringify(league.rivalPairs.pairs.map(p => p.names));
league.seasonNumber = (league.seasonNumber || 1) + 1;
league.ensureRivalPairs();
assert.strictEqual(JSON.stringify(league.rivalPairs.pairs.map(p => p.names).sort()), JSON.stringify(JSON.parse(before).sort()), "mêmes clubs → mêmes paires");
const cpuIdx = league.teams.findIndex((t, i) => !t.isHuman && !league.teams[league.rivalOf(i)].isHuman);
league.teams[cpuIdx].name = "Nouveau Promu"; league.teams[cpuIdx].isHuman = true;
league.seasonNumber += 1;
league.ensureRivalPairs();
const hh2 = league.teams.map((t, i) => t.isHuman && league.teams[league.rivalOf(i)].isHuman).filter(Boolean).length;
assert.strictEqual(hh2, 4, "4 managers → 2 paires de managers");
console.log("✅ Paires gardées d'une saison à l'autre ; un 4e manager est apparié avec le 3e.");
// Reprise d'un club de l'IA en cours de saison : même rival tout de suite,
// et la paire continue la saison suivante si elle réunit deux managers.
{
  const lg3 = store.createMultiManagerCareer(["Zeta Derby", "Eta Derby", "Theta Derby"], created, "Zeta Derby").league;
  const lone = lg3.teams.findIndex((t, i) => t.isHuman && !lg3.teams[lg3.rivalOf(i)].isHuman);
  const cpuRival = lg3.rivalOf(lone);
  lg3.teams[cpuRival].name = "Iota Derby"; lg3.teams[cpuRival].isHuman = true; // reprise en cours de saison
  assert.strictEqual(lg3.rivalOf(cpuRival), lone, "le nouveau manager hérite tout de suite du rival du club repris");
  lg3.seasonNumber = (lg3.seasonNumber || 1) + 1;
  assert.strictEqual(lg3.rivalOf(cpuRival), lone, "saison suivante : la rivalité héritée (deux managers) continue");
  console.log("✅ Reprise d'un club de l'IA : le nouveau manager prend sa place et son rival, qui reste le même ensuite.");
}
// Sauvegarde.
const back = store.deserializeMultiLeague(JSON.parse(JSON.stringify(store.serializeMultiLeague(league)))).league;
assert.deepStrictEqual(back.rivalPairs, league.rivalPairs);
console.log("✅ Paires sauvegardées.");
// Effets : humeur ×1,5, affluence +15 %.
const t = league.teams[humans[0]];
const origRandom = Math.random; Math.random = () => 0.5;
t.fanMorale = 50; t.moraleHistory = [];
const d0 = t.applyMoraleForResult(true, 10, "X", 1, created) ; const normal = t.moraleHistory[0].delta;
t.applyMoraleForResult(true, 10, "X", 1, created, null, null, true); const derby = t.moraleHistory[0].delta;
assert(Math.abs(derby - normal * Engine.DERBY_MORALE_MULT) < 0.11, `humeur derby ${derby} vs ${normal}`);
assert(/Derby gagné/.test(t.moraleHistory[0].label));
t.fanMorale = 30;
const g1 = t.simulateHomeAttendance("X").attendance, g2 = t.simulateHomeAttendance("X", true).attendance;
Math.random = origRandom;
assert(g2 > g1, `affluence derby ${g2} > ${g1}`);
assert(/Billetterie \(derby\)/.test(t.transactions[0].label));
console.log(`✅ Derby : humeur ×${Engine.DERBY_MORALE_MULT} (${normal} → ${derby}), affluence ${g1} → ${g2}.`);
// Matchs réels : une saison simulée, l'humeur d'un manager note ses derbys.
const lg2 = store.createMultiManagerCareer(["Delta Derby", "Epsilon Derby"], created, "Delta Derby").league;
lg2.calendarDailyAnchored = true; lg2.calendarWeeklyRhythm = true;
lg2.calendarStartAt = Calendar.weeklyRhythmCalendarStartAt(created); lg2.cup = null;
let now = created;
for (let i = 0; i < 400 && !lg2.isRegularSeasonDone(); i++) { now += 6 * H; AutoSim.catchUpLeague(lg2, now); }
const h0 = lg2.teams.findIndex(x => x.isHuman);
const labels = [].concat(...lg2.teams.filter(x => x.isHuman).map(x => (x.moraleHistory || []).map(e => e.label)));
assert(labels.some(l => /^Derby (gagné|perdu)/.test(l)), "des derbys apparaissent dans l'humeur des managers");
console.log("✅ Saison simulée : les derbys des managers sont bien traités comme tels.");
console.log("\n🏁 Rivaux et derbys conformes.");
