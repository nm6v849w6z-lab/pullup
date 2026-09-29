// Audit moteur 2026-09-29, suite (« béton » et réalisme) :
// 1) Graine par match : même graine + mêmes équipes + même instant => même
//    match, événement par événement ; graine renvoyée et stockée (journal
//    de match des joueurs, résultats du championnat).
// 2) Temps morts simulés : règle FIBA (2 en 1re mi-temps, 3 en 2e dont 2 au
//    plus dans les 2 dernières minutes, 1 par prolongation), événements
//    « timeout » avec l'équipe et les temps morts restants.
// 3) Rotation (15-20 changements par équipe visés) et fins de match
//    (prolongations, dernières possessions) : seuils larges, c'est du hasard.
const assert = require("assert");
const E = require("./engine.js");

function fresh(tier = 1) {
  return [E.generateTeam("Alpha", tier), E.generateTeam("Bêta", tier)];
}
const clockSec = c => { const [m, s] = c.split(":").map(Number); return m * 60 + s; };

// --- 1) Graine ---------------------------------------------------------
{
  const [a, b] = fresh();
  const snapA = JSON.stringify(E.serializeTeam(a)), snapB = JSON.stringify(E.serializeTeam(b));
  const now = Date.UTC(2026, 8, 29, 18, 0, 0);
  const r1 = new E.MatchEngine(a, b, { homeAdvantage: true }).simulate(now);
  assert(Number.isInteger(r1.seed) && r1.seed >= 0, "la graine doit être renvoyée");
  const a2 = E.teamFromSave(JSON.parse(snapA)), b2 = E.teamFromSave(JSON.parse(snapB));
  const r2 = new E.MatchEngine(a2, b2, { homeAdvantage: true, seed: r1.seed }).simulate(now);
  assert.deepStrictEqual(r2.finalScore, r1.finalScore);
  assert.strictEqual(JSON.stringify(r2.events), JSON.stringify(r1.events), "mêmes événements avec la même graine");
  assert.strictEqual(JSON.stringify(r2.boxScoreA), JSON.stringify(r1.boxScoreA));
  // Une autre graine donne un autre match (à coup sûr sur le fil complet).
  const a3 = E.teamFromSave(JSON.parse(snapA)), b3 = E.teamFromSave(JSON.parse(snapB));
  const r3 = new E.MatchEngine(a3, b3, { homeAdvantage: true, seed: (r1.seed + 1) >>> 0 }).simulate(now);
  assert.notStrictEqual(JSON.stringify(r3.events), JSON.stringify(r1.events));
  // Hors match, le hasard redevient Math.random (les tests qui le figent marchent).
  const orig = Math.random; Math.random = () => 0.25;
  try { assert.strictEqual(E.rand01(), 0.25); } finally { Math.random = orig; }
  // Journal de match et résultat du championnat gardent la graine.
  const sim = E.simulateOrForfeit(a2, b2, now);
  assert(Number.isInteger(sim.seed));
  E.recordMatchStatsAndAwardMvp(a2, b2, 0, "championship", now, sim.quarterScores, sim.tacticsUsed, sim.seed);
  const played = a2.players.find(p => p.matchLog.length);
  assert.strictEqual(played.matchLog[played.matchLog.length - 1].seed, sim.seed, "graine dans le journal de match");
  console.log(`✅ Graine : match rejoué à l'identique (graine ${r1.seed}, ${r1.finalScore.A}-${r1.finalScore.B}), stockée dans le journal de match.`);
}

// --- 2) et 3) Temps morts, rotation, fins de match ----------------------
{
  const N = +process.argv[2] || 400;
  let timeouts = 0, subs = 0, ot = 0, starterMin = 0, starterN = 0;
  for (let i = 0; i < N; i++) {
    const [a, b] = fresh();
    const r = new E.MatchEngine(a, b, { homeAdvantage: true }).simulate();
    if (r.quarterScores.A.length > 4) ot++;
    subs += r.events.filter(e => e.type === "substitution").length / 2;
    for (const key of ["A", "B"]) {
      const tos = r.events.filter(e => e.type === "timeout" && e.team === key);
      assert.strictEqual(tos.length, r.timeoutsUsed[key], "timeoutsUsed = nombre d'événements");
      timeouts += tos.length;
      const h1 = tos.filter(e => e.quarter <= 2), h2 = tos.filter(e => e.quarter === 3 || e.quarter === 4);
      const last2 = tos.filter(e => e.quarter === 4 && clockSec(e.clock) <= 120);
      assert(h1.length <= 2, `au plus 2 temps morts en 1re mi-temps (${h1.length})`);
      assert(h2.length <= 3, `au plus 3 temps morts en 2e mi-temps (${h2.length})`);
      assert(last2.length <= 2, `au plus 2 temps morts dans les 2 dernières minutes (${last2.length})`);
      for (let q = 5; q <= r.quarterScores.A.length; q++) assert(tos.filter(e => e.quarter === q).length <= 1, "1 temps mort par prolongation");
      tos.forEach(e => {
        assert(/^Temps mort demandé par /.test(e.text), e.text);
        assert(Number.isInteger(e.remaining) && e.remaining >= 0, "temps morts restants");
      });
    }
    for (const box of [r.boxScoreA, r.boxScoreB]) {
      box.slice().sort((x, y) => y.min - x.min).slice(0, 5).forEach(p => { starterMin += p.min; starterN++; });
    }
  }
  const toPer = timeouts / N / 2, subsPer = subs / N, otPct = 100 * ot / N, top5 = starterMin / starterN;
  assert(toPer >= 1.5 && toPer <= 4, `temps morts par équipe : ${toPer.toFixed(1)}`);
  assert(subsPer >= 14 && subsPer <= 23, `changements par équipe : ${subsPer.toFixed(1)}`);
  assert(top5 >= 25 && top5 <= 32, `minutes des cinq plus utilisés : ${top5.toFixed(1)}`);
  assert(otPct >= 1.5 && otPct <= 9, `prolongations : ${otPct.toFixed(1)} %`);
  console.log(`✅ ${N} matchs : ${toPer.toFixed(1)} temps morts et ${subsPer.toFixed(1)} changements par équipe, cinq majeur ${top5.toFixed(1)} min, ${otPct.toFixed(1)} % de prolongations.`);
}
console.log("✅ Graine, temps morts, rotation et fins de match : OK.");
