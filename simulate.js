// =====================================================================
// Harnais de test statistique pour le moteur de basket
// Usage: node simulate.js [nombreDeMatchs] [seedTag]
// =====================================================================
const E = require("./engine.js");

const N = parseInt(process.argv[2] || "3000", 10);
const TIER_LO = parseFloat(process.argv[3] || "0.85");
const TIER_HI = parseFloat(process.argv[4] || "1.15");
const OFF_LIST = Object.keys(E.OFFENSE_PROFILES);
const DEF_LIST = Object.keys(E.DEFENSES);
const RHYTHM_LIST = Object.keys(E.RHYTHMS);

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pick3Unique(arr) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function randomizeTeam(team) {
  team.offensivePriorities = pick3Unique(OFF_LIST);
  team.defense = pick(DEF_LIST);
  team.rhythm = pick(RHYTHM_LIST);
}

function mean(a) { return a.reduce((s, v) => s + v, 0) / a.length; }
function stdev(a) {
  const m = mean(a);
  return Math.sqrt(mean(a.map(v => (v - m) ** 2)));
}
function percentile(sortedArr, p) {
  const idx = clampIdx((p / 100) * (sortedArr.length - 1));
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}
function clampIdx(i) { return Math.max(0, Math.min(i, 1e9)); }

const results = [];
const anomalies = { low: [], high: [], blowout: [] };

for (let i = 0; i < N; i++) {
  const teamA = E.generateTeam("Équipe A", E.rand(TIER_LO, TIER_HI));
  const teamB = E.generateTeam("Équipe B", E.rand(TIER_LO, TIER_HI));
  randomizeTeam(teamA);
  randomizeTeam(teamB);

  const engine = new E.MatchEngine(teamA, teamB);
  const res = engine.simulate();

  const A = res.finalScore.A, B = res.finalScore.B;
  const total = A + B;
  const diff = Math.abs(A - B);

  // Reconstitution des tirs / pertes de balle cumulés
  const allA = teamA.players, allB = teamB.players;
  const sum = (players, key) => players.reduce((s, p) => s + p.stats[key], 0);
  const fga2 = sum(allA, "fga2") + sum(allB, "fga2");
  const fgm2 = sum(allA, "fgm2") + sum(allB, "fgm2");
  const fga3 = sum(allA, "fga3") + sum(allB, "fga3");
  const fgm3 = sum(allA, "fgm3") + sum(allB, "fgm3");
  const fta = sum(allA, "fta") + sum(allB, "fta");
  const ftm = sum(allA, "ftm") + sum(allB, "ftm");
  const tov = sum(allA, "tov") + sum(allB, "tov");
  const pf = sum(allA, "pf") + sum(allB, "pf");
  const possessions = fga2 + fga3 + tov + Math.round(fta / 2.2); // approx (FTA/2.2 ~ possessions finished at the line)

  const record = {
    A, B, total, diff,
    offA: teamA.offensivePriorities, offB: teamB.offensivePriorities,
    defA: teamA.defense, defB: teamB.defense,
    rhythmA: teamA.rhythm, rhythmB: teamB.rhythm,
    fg2pct: fgm2 / fga2, fg3pct: fgm3 / fga3, ftpct: ftm / fta,
    tov, pf, possessions,
  };
  results.push(record);

  if (A < 45 || B < 45) anomalies.low.push(record);
  if (A > 130 || B > 130) anomalies.high.push(record);
  if (diff > 45) anomalies.blowout.push(record);
}

const scoresAll = [];
results.forEach(r => { scoresAll.push(r.A, r.B); });
scoresAll.sort((a, b) => a - b);
const totals = results.map(r => r.total).sort((a, b) => a - b);
const diffs = results.map(r => r.diff).sort((a, b) => a - b);
const fg2 = results.map(r => r.fg2pct).filter(x => !isNaN(x));
const fg3 = results.map(r => r.fg3pct).filter(x => !isNaN(x));
const ft = results.map(r => r.ftpct).filter(x => !isNaN(x));
const poss = results.map(r => r.possessions).sort((a, b) => a - b);
const tovs = results.map(r => r.tov);
const pfs = results.map(r => r.pf);

function report(label, arr, opts = {}) {
  const sorted = [...arr].sort((a, b) => a - b);
  console.log(`${label}: moyenne=${mean(arr).toFixed(2)} médiane=${percentile(sorted,50).toFixed(2)} ` +
    `écart-type=${stdev(arr).toFixed(2)} min=${sorted[0].toFixed(2)} max=${sorted[sorted.length-1].toFixed(2)} ` +
    `p5=${percentile(sorted,5).toFixed(2)} p95=${percentile(sorted,95).toFixed(2)}`);
}

console.log(`\n=== Simulation de ${N} matchs ===\n`);
report("Score par équipe", scoresAll);
report("Total points (les 2 équipes)", totals);
report("Écart de score", diffs);
report("Possessions estimées / équipe / match (total/2)", poss.map(p => p / 2));
report("FG% 2pts", fg2.map(x => x * 100));
report("FG% 3pts", fg3.map(x => x * 100));
report("FT%", ft.map(x => x * 100));
report("Pertes de balle (total match, 2 équipes)", tovs);
report("Fautes personnelles (total match, 2 équipes)", pfs);

console.log(`\n--- Anomalies ---`);
console.log(`Matchs avec un score d'équipe < 45 pts ("score de handball"): ${anomalies.low.length} / ${N} (${(100*anomalies.low.length/N).toFixed(1)}%)`);
console.log(`Matchs avec un score d'équipe > 130 pts (score délirant): ${anomalies.high.length} / ${N} (${(100*anomalies.high.length/N).toFixed(1)}%)`);
console.log(`Écarts de score > 45 pts (blowout improbable): ${anomalies.blowout.length} / ${N} (${(100*anomalies.blowout.length/N).toFixed(1)}%)`);

if (anomalies.low.length) {
  console.log("\nExemples de scores bas:");
  anomalies.low.slice(0, 5).forEach(r => console.log(`  ${r.A}-${r.B} | rythme ${r.rhythmA}/${r.rhythmB} | def ${r.defA}/${r.defB} | off ${r.offA.join(",")}  vs  ${r.offB.join(",")}`));
}
if (anomalies.high.length) {
  console.log("\nExemples de scores hauts:");
  anomalies.high.slice(0, 5).forEach(r => console.log(`  ${r.A}-${r.B} | rythme ${r.rhythmA}/${r.rhythmB} | def ${r.defA}/${r.defB} | off ${r.offA.join(",")}  vs  ${r.offB.join(",")}`));
}

// Répartition par rythme, pour voir l'effet du paramètre "Rapide"/"Lent"
const byRhythmPair = {};
results.forEach(r => {
  const key = [r.rhythmA, r.rhythmB].sort().join(" + ");
  byRhythmPair[key] = byRhythmPair[key] || [];
  byRhythmPair[key].push(r.total);
});
console.log("\n--- Total de points moyen selon la combinaison de rythmes ---");
Object.entries(byRhythmPair).forEach(([k, arr]) => {
  console.log(`  ${k}: moyenne=${mean(arr).toFixed(1)} (n=${arr.length}) max=${Math.max(...arr)}`);
});

// Sauvegarde brute pour analyse plus poussée si besoin
require("fs").writeFileSync("/home/claude/basket/last_run.json", JSON.stringify({ N, results }).slice(0, 20_000_000));
console.log("\n(Données brutes sauvegardées dans last_run.json)");
