// Audit du moteur de match du 2026-09-29 (demande utilisateur : « regarde le
// moteur de jeu déjà, regarde s'il y a des choses à corriger et à
// améliorer ») — garde-fous sur les correctifs apportés à MatchEngine :
//  1) les lancers francs entièrement manqués (0/2) sont journalisés ;
//  2) bonus : dès la 5e faute d'équipe du quart-temps, une faute hors tir
//     donne 2 lancers francs (l'affichage « bonus » du direct correspond
//     enfin à quelque chose) ;
//  3) rebonds offensifs ≈ 25-32 % des rebonds (mesuré 44 % avant) ;
//  4) hiérarchie des zones de tir : intérieur > mi-distance > 3 points
//     (l'ordre était inversé : 42,6 / 47,1 / 40,4 %) ;
//  5) score moyen d'équipes de référence entre 78 et 96 points.
// Mesures sur un échantillon de matchs entre clubs générés par
// generateLeague (tolérances larges : c'est de l'aléatoire).
const E = require("./engine.js");

function fail(msg) { throw new Error("❌ " + msg); }

let ft0 = 0, ftEv = 0, bonusFt = 0, oreb = 0, reb = 0, pts = [], zone = { paint: [0, 0], mid: [0, 0], three: [0, 0] };
const N = 160;
for (let i = 0; i < N; i++) {
  if (i % 10 === 0) var league = E.generateLeague(E.generateStartingRoster("Audit"));
  const teams = league.teams.slice(1);
  const a = teams[i % teams.length], b = teams[(i * 3 + 1) % teams.length];
  if (a === b) continue;
  const r = new E.MatchEngine(a, b).simulate();
  pts.push(r.finalScore.A, r.finalScore.B);
  const ev = r.events;
  for (let k = 0; k < ev.length; k++) {
    const e = ev[k];
    if (e.type === "freeThrow") { ftEv++; if (e.made === 0) ft0++; }
    if (e.type === "shot" || e.type === "rebound") { const z = e.zone === "inside" ? "paint" : e.zone; zone[z][1]++; if (e.made) zone[z][0]++; }
    // Faute hors tir (texte de commonFoul, sans tir ni and-one au même
    // instant) immédiatement suivie de 2 lancers francs = bonus (un
    // événement par lancer depuis le 2026-10-09 : `of` = taille de la série).
    if (e.type === "foul" && ev[k + 1] && ev[k + 1].type === "freeThrow" && (ev[k + 1].of || ev[k + 1].attempts) === 2 && ev[k + 1].clock === e.clock &&
        !(ev[k - 1] && ev[k - 1].type === "shot" && ev[k - 1].clock === e.clock)) bonusFt++;
  }
  for (const p of [...r.boxScoreA, ...r.boxScoreB]) { oreb += p.oreb || 0; reb += p.reb; }
}
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const pc = z => 100 * zone[z][0] / zone[z][1];

if (ft0 === 0) fail("des séries de lancers francs 0/n doivent être journalisées (événement freeThrow avec made=0).");
console.log(`✅ Lancers francs entièrement manqués journalisés (${ft0} séries 0/n sur ${ftEv}).`);

if (bonusFt < N * 0.3) fail(`bonus attendu (5e faute d'équipe du quart-temps → 2 lancers francs sur faute hors tir) : seulement ${bonusFt} cas sur ${N} matchs.`);
console.log(`✅ Bonus de lancers francs actif (${(bonusFt / N).toFixed(1)} fois par match).`);

const orebPct = 100 * oreb / reb;
if (orebPct < 22 || orebPct > 34) fail(`part des rebonds offensifs attendue entre 22 et 34 %, mesurée ${orebPct.toFixed(1)} %.`);
console.log(`✅ Rebonds offensifs : ${orebPct.toFixed(1)} % des rebonds.`);

if (!(pc("paint") > pc("mid") && pc("mid") > pc("three"))) fail(`hiérarchie des zones attendue intérieur > mi-distance > 3 pts, mesuré ${pc("paint").toFixed(1)} / ${pc("mid").toFixed(1)} / ${pc("three").toFixed(1)} %.`);
if (pc("paint") < 48 || pc("three") > 42) fail(`intérieur ≥ 48 % et 3 pts ≤ 42 % attendus, mesuré ${pc("paint").toFixed(1)} / ${pc("three").toFixed(1)} %.`);
console.log(`✅ Adresse par zone cohérente : intérieur ${pc("paint").toFixed(1)} %, mi-distance ${pc("mid").toFixed(1)} %, 3 pts ${pc("three").toFixed(1)} %.`);

const avg = mean(pts);
if (avg < 78 || avg > 96) fail(`score moyen par équipe attendu entre 78 et 96, mesuré ${avg.toFixed(1)}.`);
console.log(`✅ Score moyen par équipe : ${avg.toFixed(1)} points.`);
console.log("✅ Tous les garde-fous de l'audit moteur du 2026-09-29 sont passés.");
