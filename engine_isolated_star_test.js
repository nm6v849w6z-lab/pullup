// Joueur esseulé (retour utilisateur 2026-10-03 : 52 points d'un arrière
// à 55 de GEN entouré de joueurs faibles) : une star entourée de joueurs
// bien plus faibles ne prend plus une part démesurée des tirs, et la
// défense se resserre sur lui. Moyenne de points bornée sur 150 matchs.
const E = require("./engine.js");
const N = 150;
function lonelyTeam() {
  const t = E.generateLeague(E.generateStartingRoster("Esseulé")).teams[1];
  t.players.forEach(p => { Object.keys(p.attrs).forEach(k => { p.attrs[k] = 38; }); p.form = 80; });
  const star = t.players.find(p => p.id === t.lineup.starters["Arrière"]);
  ["midRange", "threePoint", "shotCreation", "dribble", "speed", "steal"].forEach(k => { star.attrs[k] = 94; });
  return { t, star };
}
function opponent() {
  const t = E.generateLeague(E.generateStartingRoster("Adverse")).teams[2];
  t.players.forEach(p => { Object.keys(p.attrs).forEach(k => { p.attrs[k] = 50; }); p.form = 80; });
  return t;
}
let pts = 0, fga = 0, teamFga = 0;
for (let i = 0; i < N; i++) {
  const { t, star } = lonelyTeam();
  const r = new E.MatchEngine(t, opponent(), { homeAdvantage: false }).simulate();
  const row = r.boxScoreA.find(x => x.name === star.name);
  pts += row.pts; fga += row.fga2 + row.fga3;
  teamFga += r.boxScoreA.reduce((s, x) => s + x.fga2 + x.fga3, 0);
}
const avg = pts / N, share = fga / teamFga;
console.log(`Star esseulée : ${avg.toFixed(1)} pts/match, ${(share * 100).toFixed(0)} % des tirs de l'équipe`);
if (avg > 25) throw new Error(`❌ star esseulée trop dominante : ${avg.toFixed(1)} pts/match`);
if (share > 0.36) throw new Error(`❌ part de tirs trop élevée : ${(share * 100).toFixed(0)} %`);
if (avg < 12) throw new Error(`❌ la star doit rester la première option : ${avg.toFixed(1)} pts/match`);
console.log("✅ Joueur esseulé : impact réduit, reste la première option");
