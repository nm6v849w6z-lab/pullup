// Fautes et exclusions pour 5 fautes (retour utilisateur 2026-10-04 :
// « BC DIA termine très souvent ses matchs avec 2 ou 3 joueurs exclus pour
// 5 fautes »). Vérifie :
//  1. Plan de temps de jeu : un joueur à 4 fautes reste sur le banc jusqu'aux
//     5 dernières minutes, comme sans plan (avant : il revenait dès le début
//     du 4e quart-temps et y jouait presque tout le quart).
//  2. Faute au tir : un défenseur à 4 fautes fait moins de fautes au tir.
//  3. Statistiques sur de nombreux matchs avec un plan 32/8 : 2 exclus ou
//     plus restent rares, les fautes ne disparaissent pas.
const E = require("./engine.js");
const { POSITIONS } = E;
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); };

function planTeam(name, tier, starterMin = 32) {
  const t = E.generateTeam(name, tier);
  POSITIONS.forEach(pos => {
    t.enableSlotMinutes(pos);
    const ids = t.slotPlayerIds(pos);
    ids.forEach(id => t.setSlotMinutes(pos, id, 0));
    t.setSlotMinutes(pos, t.lineup.starters[pos], starterMin);
    if (ids.length > 1) t.setSlotMinutes(pos, ids.find(id => id !== t.lineup.starters[pos]), 40 - starterMin);
  });
  return t;
}

// --- 1. substituteToTarget -------------------------------------------------
{
  const A = planTeam("A", 0.6), B = E.generateTeam("B", 0.6);
  const eng = new E.MatchEngine(A, B);
  A.players.forEach(p => p.resetMatchState && p.resetMatchState());
  const pos = "Pivot";
  const shares = A.slotMinuteShares(pos);
  const starter = A.players.find(p => p.id === A.lineup.starters[pos]);
  const backup = A.players.find(p => p.id !== starter.id && (shares[p.id] || 0) > 0);
  A.players.forEach(p => { p.onCourt = false; p.fouls = 0; p.fatigue = 0; p.secondsPlayedByPosition = {}; p.secondsPlayed = 0; });
  starter.onCourt = true; starter.matchPosition = pos; starter.fouls = 4;
  // Début du 4e quart-temps (8:00 à jouer) : il doit sortir.
  eng.substituteToTarget(A, starter, shares, false, 4, 480, []);
  assert(!starter.onCourt, "4 fautes à 8:00 du 4e quart-temps : le titulaire doit sortir");
  assert(backup.onCourt, "le remplaçant du plan doit entrer");
  // À 4:00 de la fin, le joueur à 4 fautes redevient disponible et, en retard
  // sur sa cible, revient en jeu.
  backup.stintStartSecs = -1000; backup.secondsPlayedByPosition[pos] = 2000; backup.minStintSecs = 0; backup.paceMarginSecs = 0;
  eng.substituteToTarget(A, backup, shares, false, 4, 240, []);
  assert(starter.onCourt, "dans les 5 dernières minutes, le joueur à 4 fautes peut revenir");
}

// --- 2. Fautes au tir et prudence -----------------------------------------
{
  const src = require("fs").readFileSync("engine.js", "utf-8");
  assert(/clamp\(foulDrawBase - defBoost, 0\.01, 0\.35\) \* foulCaution\(defender\)/.test(src), "la faute au tir doit tenir compte des fautes du défenseur");
}

// --- 3. Statistiques ---------------------------------------------------------
{
  const N = 120;
  let teams = 0, pf = 0, out = 0, twoPlus = 0, anyFive = 0;
  for (let i = 0; i < N; i++) {
    const A = planTeam("A", 0.55), B = planTeam("B", 0.55);
    new E.MatchEngine(A, B, { homeAdvantage: true }).simulate();
    for (const t of [A, B]) {
      teams++;
      const n5 = t.players.filter(p => p.stats && p.stats.pf >= 5).length;
      pf += t.players.reduce((s, p) => s + (p.stats ? p.stats.pf : 0), 0);
      out += n5; if (n5 >= 2) twoPlus++; if (n5) anyFive++;
    }
  }
  const pfAvg = pf / teams, outAvg = out / teams, twoShare = twoPlus / teams;
  console.log(`  plan 32/8, division basse : ${pfAvg.toFixed(1)} fautes/équipe, ${outAvg.toFixed(2)} exclus/équipe, ${(100 * twoShare).toFixed(1)} % d'équipes avec 2+ exclus`);
  assert(pfAvg > 14 && pfAvg < 21, `fautes par équipe hors bande (${pfAvg.toFixed(1)})`);
  assert(anyFive > 0, "l'exclusion pour 5 fautes doit rester possible");
  assert(outAvg < 0.5, `trop d'exclusions pour 5 fautes avec un plan (${outAvg.toFixed(2)}/équipe, ~0,8 avant le correctif)`);
  assert(twoShare < 0.10, `2 exclus ou plus trop fréquents (${(100 * twoShare).toFixed(1)} %)`);
}

console.log("✅ foul_trouble_plan_test.js : tout est vert");
