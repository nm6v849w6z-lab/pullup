// Équilibrage du moteur de match (audit 2026-09-29, batterie A–H) : deux
// clubs identiques (mêmes joueurs copiés) sauf la modification testée. Les
// seuils sont larges (c'est de l'aléatoire, 160 matchs par test) mais
// attrapent une régression franche : une caractéristique qui ne compte plus,
// une qui écrase tout, un banc qui ne fatigue plus, une tactique gratuite,
// une Isolation ou un Box and one qui ne dépendraient plus d'une vraie star.
const E = require("./engine.js");
const N = +process.argv[2] || 160;
function fail(msg) { throw new Error("❌ " + msg); }

// Tier 0,8 (attributs ≈35) : des shooteurs déjà à 90 plafonnent à 99 et masqueraient le test F.
const base = E.generateTeam("T", 0.8);
const clone = () => {
  const c = E.generateTeam("C", 1);
  c.players = base.players.map(p => new E.Player({ name: p.name, nationality: p.nationality, position: p.position, height: p.height, age: p.age, attrs: { ...p.attrs }, aggressiveness: p.aggressiveness }));
  c.autoAssignLineup();
  return c;
};
const boost = (t, attrs, d, only = null) => { t.players.forEach(p => { if (only && !only(p)) return; attrs.forEach(a => { p.attrs[a] = Math.min(99, p.attrs[a] + d); }); }); t.autoAssignLineup(); return t; };
function series(setA, setB = () => {}, opts = {}) {
  let w = 0, diff = 0, A = {}, B = {}, q4 = [0, 0];
  const acc = (o, box) => { for (const p of box) for (const k of ["fgm3", "fga3", "oreb", "tov", "fgm2", "fga2"]) o[k] = (o[k] || 0) + (p[k] || 0); };
  for (let i = 0; i < N; i++) {
    const a = clone(), b = clone(); setA(a); setB(b);
    const r = new E.MatchEngine(a, b, opts).simulate();
    if (r.finalScore.A > r.finalScore.B) w++;
    diff += r.finalScore.A - r.finalScore.B; q4[0] += r.quarterScores.A[3]; q4[1] += r.quarterScores.B[3];
    acc(A, r.boxScoreA); acc(B, r.boxScoreB);
  }
  return { win: 100 * w / N, diff: diff / N, A, B, q4: q4.map(v => v / N) };
}
const pct = (m, a) => 100 * m / a;
const ok = (label, cond, detail) => { if (!cond) fail(`${label} : ${detail}`); console.log(`✅ ${label} : ${detail}`); };

let r = series(() => {}, () => {});
ok("A équipes identiques", r.win >= 38 && r.win <= 62, `${r.win.toFixed(0)} % de victoires, écart ${r.diff.toFixed(1)}`);
r = series(() => {}, () => {}, { homeAdvantage: true });
ok("A avantage du terrain", r.win >= 50 && r.win <= 72, `${r.win.toFixed(0)} % à domicile`);
r = series(a => boost(a, E.ATTRS, 9), () => {});
ok("B équipe +9 partout (≈ +20 %)", r.win >= 75 && r.win <= 98, `${r.win.toFixed(0)} %, écart +${r.diff.toFixed(1)}`);
r = series(a => { const st = new Set(Object.values(a.lineup.starters)); boost(a, E.ATTRS, 25, p => st.has(p.id) && p === a.players.find(x => st.has(x.id))); }, () => {});
ok("C un titulaire élite (+25)", r.win >= 56 && r.win <= 85, `${r.win.toFixed(0)} %, écart +${r.diff.toFixed(1)}`);
r = series(a => { const st = new Set(Object.values(a.lineup.starters)); a.players = a.players.filter(p => st.has(p.id)); a.autoAssignLineup(); }, () => {});
ok("D sans banc (fatigue)", r.win <= 32 && r.q4[0] < r.q4[1] - 2, `${r.win.toFixed(0)} %, 4e quart ${r.q4[0].toFixed(1)} contre ${r.q4[1].toFixed(1)}`);
r = series(a => boost(a, ["defInside", "defOutside", "block", "steal"], 20), () => {});
ok("E défense +20", r.win >= 60 && r.win <= 86 && pct(r.B.fgm2 + r.B.fgm3, r.B.fga2 + r.B.fga3) < pct(r.A.fgm2 + r.A.fgm3, r.A.fga2 + r.A.fga3), `${r.win.toFixed(0)} %, adresse adverse ${pct(r.B.fgm2 + r.B.fgm3, r.B.fga2 + r.B.fga3).toFixed(1)} %`);
r = series(a => boost(a, ["threePoint"], 20), () => {});
ok("F tir à 3 pts +20", (pct(r.A.fgm3, r.A.fga3) - pct(r.B.fgm3, r.B.fga3) >= 1.0 || r.win >= 55) && r.A.fga3 > r.B.fga3 * 1.03, `3P% ${pct(r.A.fgm3, r.A.fga3).toFixed(1)} contre ${pct(r.B.fgm3, r.B.fga3).toFixed(1)}, tentatives ${(r.A.fga3 / N).toFixed(1)} contre ${(r.B.fga3 / N).toFixed(1)}`);
r = series(a => boost(a, ["rebound"], 20), () => {});
ok("G rebond +20", r.A.oreb / N - r.B.oreb / N >= 2.5, `rebonds offensifs ${(r.A.oreb / N).toFixed(1)} contre ${(r.B.oreb / N).toFixed(1)}`);
r = series(a => boost(a, ["dribble", "pass", "decision"], 20), () => {});
ok("H maniement +20", r.B.tov / N - r.A.tov / N >= 1.5 && r.B.tov / N - r.A.tov / N <= 6, `pertes ${(r.A.tov / N).toFixed(1)} contre ${(r.B.tov / N).toFixed(1)}`);
// Tactiques : aucune défense ni priorité gratuite face au réglage de base.
for (const k of Object.keys(E.DEFENSES)) {
  r = series(a => { a.defense = k; }, b => { b.defense = "Homme à homme"; });
  ok(`Défense « ${k} »`, Math.abs(r.diff) <= 6.5, `écart ${r.diff.toFixed(1)}`);
}
for (const k of ["Jeu intérieur", "Jeu extérieur", "Isolation", "Post-up", "Transition rapide", "Tirs rapides"]) {
  r = series(a => { a.offensivePriorities = [k, k, k]; }, b => { b.offensivePriorities = ["Équilibrée", "Équilibrée", "Équilibrée"]; });
  ok(`Priorité « ${k} »`, Math.abs(r.diff) <= 6.5, `écart ${r.diff.toFixed(1)}`);
}
// Isolation et Box and one avec une vraie star (audit 2026-09-29) : ces
// deux réglages doivent briller face à / avec une star et coûter sans.
{
  const withStar = t => { const st = t.players.find(p => p.id === Object.values(t.lineup.starters)[1]); E.ATTRS.forEach(a => { st.attrs[a] = Math.min(99, st.attrs[a] + 25); }); t.autoAssignLineup(); return t; };
  const iso = t => { t.offensivePriorities = ["Isolation", "Isolation", "Isolation"]; };
  const bal = t => { t.offensivePriorities = ["Équilibrée", "Équilibrée", "Équilibrée"]; };
  const twice = (a, b) => { const x = series(a, b), y = series(a, b); return (x.diff + y.diff) / 2; };
  const isoPlain = twice(iso, bal) - twice(bal, bal);
  const isoStar = twice(a => { withStar(a); iso(a); }, bal) - twice(a => { withStar(a); bal(a); }, bal);
  // Comparaison relative seulement : le cinq de base est tiré au hasard, et
  // s'il a déjà un joueur au-dessus du lot, l'Isolation y paie aussi (voulu).
  ok("Isolation : paie davantage avec une star", isoStar - isoPlain >= 2, `sans star ${isoPlain.toFixed(1)}, avec star ${isoStar.toFixed(1)}`);
  const box = b => { b.defense = "Box and one"; }, man = b => { b.defense = "Homme à homme"; };
  const boxPlain = twice(() => {}, box) - twice(() => {}, man);
  const boxStar = twice(withStar, box) - twice(withStar, man);
  ok("Box and one : gêne davantage une star", boxPlain - boxStar >= 3, `écart de l'attaque sans star ${boxPlain >= 0 ? "+" : ""}${boxPlain.toFixed(1)}, avec star ${boxStar.toFixed(1)}`);
}
// Réglages « confirmés » (audit 2026-09-29) : chacun doit être un
// compromis — meilleur face à l'attaque qu'il vise que face à l'inverse.
{
  const conf = f => t => { t.tacticalTier = "confirmée"; f(t); };
  const off = k => t => { t.offensivePriorities = [k, k, k]; };
  const gain = (field, value, neutral, opp) => {
    const one = () => series(conf(a => { a[field] = value; }), off(opp)).diff - series(conf(a => { a[field] = neutral; }), off(opp)).diff;
    return (one() + one() + one() + one()) / 4;
  };
  const trade = (label, field, value, neutral, good, bad) => {
    const g = gain(field, value, neutral, good), b = gain(field, value, neutral, bad);
    ok(label, g - b >= 1, `face au ${good} ${g >= 0 ? "+" : ""}${g.toFixed(1)}, face au ${bad} ${b >= 0 ? "+" : ""}${b.toFixed(1)}`);
  };
  trade("Aide « Forte »", "helpDefense", "Forte", "Moyenne", "Jeu intérieur", "Jeu extérieur");
  trade("Post-up « Prise à deux »", "postDefense", "Prise à deux", "Classique", "Post-up", "Jeu extérieur");
  trade("Close-out « Agressif »", "closeoutStyle", "Agressif", "Contrôlé", "Jeu extérieur", "Jeu en pénétration");
}
console.log("✅ Batterie d'équilibrage passée.");
