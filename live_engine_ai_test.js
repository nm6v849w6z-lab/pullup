// Mission live 2026-10-10 — décisions offensives du moteur (tests 12-13,
// plusieurs profils d'équipe) : la chronologie officielle vient du moteur ;
// ces repères vérifient que ses décisions restent crédibles et que
// l'identité tactique se voit, sur plusieurs dizaines de matchs.
//  12  peu de passes « dangereuses » : pertes de balle dans une fourchette
//      réaliste, interceptions minoritaires ;
//  13  sélection de tir crédible selon le contexte : réussite, part de tirs
//      à 3 points selon le profil, passes décisives, qualité du tir (les tirs
//      « très contestés » restent minoritaires).
const assert = require("assert");
const E = require("./engine.js");
const ok = m => console.log("✅ " + m);

const PROFILES = [["Jeu extérieur", "Jeu en mouvement", "Tirs rapides"], ["Jeu intérieur", "Post-up", "Jeu en pénétration"], ["Équilibrée", "Pick & Roll", "Jeu en mouvement"]];
const out = {};
for (const pr of PROFILES) {
  const s = { fga: 0, fgm: 0, fga3: 0, ast: 0, tov: 0, stl: 0, poss: 0, games: 0, q: { ouvert: 0, "contesté": 0, "très contesté": 0 } };
  for (let g = 0; g < 16; g++) {
    const a = E.generateStartingRoster("IA A " + g), b = E.generateStartingRoster("IA B " + g);
    a.offensivePriorities = [...pr];
    const ev = new E.MatchEngine(a, b, { seed: 7000 + g }).simulate(Date.UTC(2026, 9, 10)).events;
    s.games++;
    for (const e of ev) {
      const shotA = (e.type === "shot" && e.team === "A" && !e.blocked) || (e.type === "rebound" && e.zone && ((e.team === "A" && e.offensive) || (e.team === "B" && !e.offensive)));
      if (shotA && !(e.type === "shot" && e.fouled && !e.made)) {
        s.fga++; if (e.zone === "three") s.fga3++;
        if (e.type === "shot" && e.made) { s.fgm++; if (e.assister) s.ast++; }
        if (e.quality && s.q[e.quality] != null) s.q[e.quality]++;
      }
      if (e.type === "turnover" && e.team === "A") { s.tov++; if (e.tovType === "steal") s.stl++; }
    }
  }
  out[pr[0]] = s;
}
const rows = [];
for (const [name, s] of Object.entries(out)) {
  const fg = s.fgm / s.fga, p3 = s.fga3 / s.fga, astR = s.ast / Math.max(1, s.fgm), tov = s.tov / s.games, qTot = s.q.ouvert + s.q["contesté"] + s.q["très contesté"];
  rows.push(`${name} : ${(fg * 100).toFixed(1)} % de réussite, ${(p3 * 100).toFixed(0)} % de tirs à 3 pts, ${(astR * 100).toFixed(0)} % de paniers assistés, ${tov.toFixed(1)} pertes/match, ${(s.q["très contesté"] / qTot * 100).toFixed(0)} % de tirs très contestés`);
  assert.ok(fg > 0.34 && fg < 0.62, `${name} : réussite crédible (${fg})`);
  assert.ok(astR > 0.35 && astR < 0.80, `${name} : part de paniers assistés crédible (${astR})`);
  assert.ok(tov > 6 && tov < 22, `${name} : pertes de balle crédibles (${tov})`);
  assert.ok(s.stl / Math.max(1, s.tov) < 0.75, `${name} : les interceptions restent minoritaires parmi les pertes`);
  assert.ok(s.q["très contesté"] / qTot < 0.4, `${name} : les tirs forcés restent minoritaires`);
}
const p3 = n => out[n].fga3 / out[n].fga;
assert.ok(p3("Jeu extérieur") > p3("Équilibrée") && p3("Équilibrée") > p3("Jeu intérieur"), "identité : extérieur > équilibrée > intérieur en part de tirs à 3 points");
rows.forEach(r => ok(r));
ok("12. Pertes de balle et interceptions dans des fourchettes réalistes pour les trois profils (pas de passes dangereuses en série).");
ok(`13. Sélection de tir crédible et identité visible : tirs à 3 pts ${(p3("Jeu extérieur") * 100).toFixed(0)} % (extérieur) > ${(p3("Équilibrée") * 100).toFixed(0)} % (équilibrée) > ${(p3("Jeu intérieur") * 100).toFixed(0)} % (intérieur).`);
console.log("\n🏁 live_engine_ai_test.js");
