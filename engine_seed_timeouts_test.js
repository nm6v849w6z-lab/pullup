// Audit moteur 2026-09-29, suite (« béton » et réalisme) :
// 1) Graine par match : même graine + mêmes équipes + même instant => même
//    match, événement par événement ; graine renvoyée et stockée (journal
//    de match des joueurs, résultats du championnat).
// 2) Temps morts simulés : règle FIBA (2 en 1re mi-temps, 3 en 2e dont 2 au
//    plus dans les 2 dernières minutes, 1 par prolongation), événements
//    « timeout » avec l'équipe et les temps morts restants.
// 3) Rotation (15-20 changements par équipe visés) et fins de match
//    (prolongations, dernières possessions) : seuils larges, c'est du hasard.
// 4) Ids de joueurs dans les événements (homonymes), exclusions pour 5
//    fautes (0,1-0,2 par équipe visés), plancher de Player.eff.
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

// --- 1 bis) Ids de joueurs dans les événements ---------------------------
// Deux homonymes dans la même équipe : les points relus événement par
// événement, par id, retombent exactement sur la feuille de match.
{
  const keys = ["shooter", "assister", "defender", "player", "replacement", "stealer", "rebounder", "blocker"];
  for (let i = 0; i < 20; i++) {
    const [a, b] = fresh();
    const starters = Object.values(a.lineup.starters);
    const twin = a.players.find(p => p.id === starters[0]), other = a.players.find(p => p.id === starters[1]);
    other.name = twin.name;
    const r = new E.MatchEngine(a, b).simulate();
    const byId = new Map([...a.players, ...b.players].map(p => [p.id, p]));
    const pts = new Map();
    for (const ev of r.events) {
      for (const k of keys) if (ev[k]) {
        assert(ev[k + "Id"] != null, `${ev.type}.${k}Id manquant`);
        assert.strictEqual(byId.get(ev[k + "Id"]).name, ev[k], `${ev.type}.${k}Id ne correspond pas au nom`);
      }
      if (ev.team !== "A") continue;
      if (ev.type === "shot" && ev.made) pts.set(ev.shooterId, (pts.get(ev.shooterId) || 0) + (ev.zone === "three" ? 3 : 2));
      if (ev.type === "freeThrow") pts.set(ev.shooterId, (pts.get(ev.shooterId) || 0) + (ev.made || 0));
    }
    for (const row of r.boxScoreA) assert.strictEqual(pts.get(row.id) || 0, row.pts, `points de ${row.name} (#${row.id}) relus par id`);
  }
  console.log("✅ Ids de joueurs : chaque joueur nommé dans un événement porte son id, deux homonymes ne fusionnent plus.");
}

// --- 2) et 3) Temps morts, rotation, fins de match ----------------------
{
  const N = +process.argv[2] || 400;
  let timeouts = 0, subs = 0, ot = 0, starterMin = 0, starterN = 0, foulOuts = 0;
  for (let i = 0; i < N; i++) {
    const [a, b] = fresh();
    const r = new E.MatchEngine(a, b, { homeAdvantage: true }).simulate();
    if (r.quarterScores.A.length > 4) ot++;
    subs += r.events.filter(e => e.type === "substitution").length / 2;
    foulOuts += r.events.filter(e => e.type === "foulOut").length;
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
  const foPer = foulOuts / N / 2;
  assert(foPer >= 0.07 && foPer <= 0.3, `exclusions pour 5 fautes par équipe : ${foPer.toFixed(2)}`);
  const toPer = timeouts / N / 2, subsPer = subs / N, otPct = 100 * ot / N, top5 = starterMin / starterN;
  assert(toPer >= 1.5 && toPer <= 4, `temps morts par équipe : ${toPer.toFixed(1)}`);
  assert(subsPer >= 14 && subsPer <= 23, `changements par équipe : ${subsPer.toFixed(1)}`);
  assert(top5 >= 25 && top5 <= 32, `minutes des cinq plus utilisés : ${top5.toFixed(1)}`);
  assert(otPct >= 1.5 && otPct <= 9, `prolongations : ${otPct.toFixed(1)} %`);
  console.log(`✅ ${N} matchs : ${foPer.toFixed(2)} exclusion pour 5 fautes, ${toPer.toFixed(1)} temps morts et ${subsPer.toFixed(1)} changements par équipe, cinq majeur ${top5.toFixed(1)} min, ${otPct.toFixed(1)} % de prolongations.`);
}
// --- 5) Plancher de Player.eff ---------------------------------------------
{
  const p = E.generateTeam("Plancher", 1).players[0];
  p.form = 0; p.fatigue = 100; p.matchCondition = 0; p.matchChemistryFactor = 0.9; p.matchTacticalKnowledgeFactor = 0.9; p.matchVenueFactor = 0.98;
  const worst = p.eff("threePoint") / p.attrs.threePoint;
  assert(Math.abs(worst - 0.5) < 0.02, `au pire 50 % de la valeur (obtenu ${(100 * worst).toFixed(0)} %)`);
  p.form = 100; p.fatigue = 0; p.matchCondition = 100; p.matchChemistryFactor = 1; p.matchTacticalKnowledgeFactor = 1; p.matchVenueFactor = 1;
  assert(p.eff("threePoint") > p.attrs.threePoint, "les bonus ne sont pas plafonnés par le plancher");
  console.log(`✅ Plancher de eff() : un joueur au plus mal garde ${(100 * worst).toFixed(0)} % de sa valeur.`);
}
console.log("✅ Graine, ids, temps morts, rotation, fautes, fins de match et plancher : OK.");
