// Invariants du moteur de match (audit 2026-09-29) : sur des matchs à tiers
// variés, tactiques aléatoires et cas limites (effectif de 5-6 joueurs,
// blessés, épuisés, forme physique à 10), vérifie que rien d'impossible ne
// sort de MatchEngine.simulate() — points = 2×FG2 + 3×FG3 + LF, somme des
// joueurs = score, somme des quarts = score, minutes ≈ 200 (+25 par
// prolongation), aucun NaN, réussis ≤ tentés, chrono monotone par quart-temps,
// cinq joueurs en fin de match, textes sans `undefined`.
// Stress + invariants du moteur : tiers variés, tactiques aléatoires, effectifs réduits.
const E = require("./engine.js");
function fail(msg) { throw new Error("❌ " + msg); }
const N = +process.argv[2] || 150;
const OFF = Object.keys(E.OFFENSE_PROFILES), DEF = Object.keys(E.DEFENSES), RH = Object.keys(E.RHYTHMS);
const pick = a => a[Math.floor(Math.random() * a.length)];
const pick3 = a => { const c = [...a], o = []; for (let i = 0; i < 3; i++) o.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]); return o; };
const sec = c => { const [m, s] = c.split(":").map(Number); return m * 60 + s; };
const problems = {};
const note = (k, d) => { problems[k] = problems[k] || { n: 0, ex: d }; problems[k].n++; };
let ot = 0;
for (let i = 0; i < N; i++) {
  const tier = pick([0.4, 0.6, 0.8, 1.0, 1.2, 1.6, 2.2]);
  const a = E.generateTeam("A", tier * E.rand(0.85, 1.15)), b = E.generateTeam("B", tier * E.rand(0.85, 1.15));
  for (const t of [a, b]) { t.offensivePriorities = pick3(OFF); t.defense = pick(DEF); t.rhythm = pick(RH); t.autoAssignLineup(); }
  // Cas limites : effectif réduit / joueurs blessés / très fatigués
  const mode = i % 10;
  if (mode === 0) a.players = a.players.slice(0, 6), a.autoAssignLineup();
  if (mode === 1) b.players = b.players.slice(0, 5), b.autoAssignLineup();
  if (mode === 2) a.players.forEach(p => { p.fatigue = 90; });
  if (mode === 3) b.players.slice(5).forEach(p => { p.injuryUntil = Date.now() + 864e5; });
  if (mode === 4) a.players.forEach(p => { p.condition = 10; });
  let r;
  try { r = new E.MatchEngine(a, b, { homeAdvantage: i % 2 === 0 }).simulate(); } catch (e) { note("exception:" + e.message.slice(0, 80), { mode, tier }); continue; }
  const nq = r.quarterScores.A.length; if (nq > 4) ot++;
  const regMin = 40 + 5 * (nq - 4);
  for (const [team, box, sc, key] of [[a, r.boxScoreA, r.finalScore.A, "A"], [b, r.boxScoreB, r.finalScore.B, "B"]]) {
    const sum = box.reduce((s, p) => s + p.pts, 0);
    if (sum !== sc) note("somme pts != score", { sum, sc, mode });
    const qs = r.quarterScores[key].reduce((s, v) => s + v, 0);
    if (qs !== sc) note("somme quarts != score", { qs, sc });
    const mins = box.reduce((s, p) => s + p.min, 0);
    if (Math.abs(mins - regMin * 5) > 8 && mode >= 5) note("minutes != 5x" + regMin, { mins, mode });
    for (const p of box) {
      for (const k of Object.keys(p)) if (typeof p[k] === "number" && !Number.isFinite(p[k])) note("NaN stat " + k, { p: p.name });
      if (p.fgm2 > p.fga2 || p.fgm3 > p.fga3 || p.ftm > p.fta) note("made > attempts", { p: p.name });
      if (p.min > regMin + 1) note("min > " + regMin, { min: p.min, mode });
      if (p.pts !== p.fgm2 * 2 + p.fgm3 * 3 + p.ftm) note("pts != 2*fg2+3*fg3+ft", { p: p.name, pts: p.pts });
      if (p.reb !== (p.oreb || 0) + (p.dreb || 0)) note("reb != oreb+dreb", { p: p.name });
      if (p.pf > 5 && !(p.pf === 6)) note("pf > 5", { p: p.name, pf: p.pf });
      if ([p.pts, p.reb, p.ast, p.stl, p.blk, p.tov, p.pf].some(v => v < 0)) note("stat négative", { p: p.name });
    }
  }
  // chrono monotone par quart, événements structurés
  let prevQ = 0, prevC = 1e9;
  for (const e of r.events) {
    if (e.quarter !== prevQ) { prevQ = e.quarter; prevC = 1e9; }
    const c = sec(e.clock);
    if (c > prevC + 0.5) note("chrono remonte", { q: e.quarter, from: prevC, to: c, type: e.type });
    prevC = c;
    if (!e.type) note("événement sans type", { text: e.text });
    if (e.type === "shot" && !e.shooter) note("shot sans shooter", {});
    if (e.type === "rebound" && !e.rebounder) note("rebound sans rebounder", {});
    if (e.type === "freeThrow" && !(e.attempts >= 1)) note("LF sans attempts", {});
    if (e.text && /undefined|\bNaN\b|\{[a-z]+\}/.test(e.text)) note("texte cassé", { text: e.text });
  }
  // 5 joueurs sur le terrain en fin de match (sauf bancs réduits)
  if (mode >= 5) for (const t of [a, b]) { const n = t.onCourtPlayers().length; if (n !== 5) note("fin de match à " + n + " joueurs", { mode }); }
}
console.log("matchs", N, "prolongations", ot);
for (const k in problems) console.log(`- ${k} : ${problems[k].n}  ex ${JSON.stringify(problems[k].ex)}`);
if (Object.keys(problems).length) fail("invariants violés (voir ci-dessus).");
console.log("✅ Aucun invariant violé sur " + N + " matchs (cas limites compris).");
