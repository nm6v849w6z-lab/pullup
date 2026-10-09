// Cohérence de la chaîne d'événements du moteur (retour utilisateur
// 2026-10-09 : « faute sur Greco » puis « +3 Kyle Murphy » au même chrono,
// sans arrêt ni remise en jeu) :
//  1. faute simple sans lancers : le jeu s'arrête (événement `inbound`),
//     l'action suivante vient PLUS TARD (chrono différent) ;
//  2. chaque panier : 2 pts à l'intérieur de la ligne, 3 pts derrière, 1 par
//     lancer franc — crédités au TIREUR de l'événement et à lui seul ;
//  3. le score de chaque événement = score précédent + points crédités ;
//  4. le tireur est dans l'équipe de l'événement ; la feuille finale = la
//     somme des événements.
const assert = require("assert");
const E = require("./engine.js");

const sec = c => { const [m, s] = String(c).split(":").map(Number); return m * 60 + s; };
const a = E.generateStartingRoster("Cohérence A"), b = E.generateStartingRoster("Cohérence B");
const games = 30;
let shots = 0, fts = 0, fouls = 0, foulGaps = [];
for (let g = 0; g < games; g++) {
  const eng = new E.MatchEngine(a, b);
  const r = eng.simulate();
  const ev = r.events;
  const idsOf = { A: new Set(eng.teamA.players.map(p => p.id)), B: new Set(eng.teamB.players.map(p => p.id)) };
  const totals = new Map();
  let prev = { A: 0, B: 0 };
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    // Points crédités par cet événement (deltas de statistiques du moteur).
    const credited = [];
    for (const k of ["A", "B"]) for (const [id, d] of Object.entries((e.delta && e.delta[k]) || {})) if (d.pts) { credited.push({ k, id: Number(id), pts: d.pts }); totals.set(Number(id), (totals.get(Number(id)) || 0) + d.pts); }
    const gainA = e.score.A - prev.A, gainB = e.score.B - prev.B;
    const sum = k => credited.filter(c => c.k === k).reduce((s, c) => s + c.pts, 0);
    assert.strictEqual(sum("A"), gainA, `score A ${prev.A}→${e.score.A} mais ${sum("A")} pts crédités : ${e.text}`);
    assert.strictEqual(sum("B"), gainB, `score B ${prev.B}→${e.score.B} mais ${sum("B")} pts crédités : ${e.text}`);
    if (e.type === "shot" && e.made) {
      shots++;
      const want = e.zone === "three" ? 3 : 2;
      assert.ok(credited.length === 1 && credited[0].id === e.shooterId && credited[0].pts === want && credited[0].k === e.team,
        `panier de ${e.shooter} (${e.zone}) : ${want} pts attendus pour lui seul, crédités ${JSON.stringify(credited)} — ${e.text}`);
      assert.ok(idsOf[e.team].has(e.shooterId), `tireur dans l'équipe de l'événement : ${e.text}`);
    } else if (e.type === "freeThrow") {
      fts++;
      const want = e.made ? 1 : 0;
      assert.ok(want ? (credited.length === 1 && credited[0].id === e.shooterId && credited[0].pts === 1) : credited.length === 0, `lancer franc : 1 pt au tireur s'il est réussi — ${e.text}`);
    } else if (!(e.type === "shot" && e.foulType)) {
      assert.strictEqual(credited.length, 0, `aucun point hors panier / lancer : ${e.type} ${e.text}`);
    }
    // Faute simple sans lancers : arrêt + remise en jeu, l'action suivante plus tard.
    if (e.type === "foul" && e.foulType === "common" && e.inbound) {
      fouls++;
      let j = i + 1;
      while (j < ev.length && ["substitution", "foulOut", "technicalEjection", "technicalFoul", "unsportsmanlikeFoul", "shortHanded"].includes(ev[j].type)) j++;
      const nx = ev[j];
      if (nx && nx.quarter === e.quarter && nx.type !== "freeThrow" && nx.type !== "quarterEnd") {
        const gap = sec(e.clock) - sec(nx.clock);
        foulGaps.push(gap);
        assert.ok(gap > 0 || sec(e.clock) <= 1, `faute à ${e.clock} puis ${nx.type} au même chrono, sans remise en jeu : ${e.text} / ${nx.text}`);
        assert.ok(nx.possStart === undefined || nx.possStart < sec(e.clock) + 1, `l'action suivante repart de la remise en jeu (possStart ${nx.possStart}, faute ${e.clock})`);
      }
    }
    prev = e.score;
  }
  // Feuille finale = somme des événements.
  for (const p of [...r.boxScoreA, ...r.boxScoreB]) assert.strictEqual(totals.get(p.id) || 0, p.pts, `feuille finale de ${p.name} : ${p.pts} pts, ${totals.get(p.id) || 0} dans les événements`);
  assert.strictEqual(prev.A, r.finalScore.A); assert.strictEqual(prev.B, r.finalScore.B);
}
foulGaps.sort((x, y) => x - y);
console.log(`✅ ${shots} paniers et ${fts} lancers francs sur ${games} matchs : 2 / 3 / 1 point(s) au tireur de l'événement, et à lui seul ; score et feuille finale = somme des événements.`);
console.log(`✅ ${fouls} fautes simples sans lancers : arrêt + remise en jeu, l'action suivante vient ensuite (écart médian ${foulGaps[foulGaps.length >> 1]} s, minimum ${foulGaps[0]} s).`);
