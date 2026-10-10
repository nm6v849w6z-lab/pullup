// Moteur — rebonds, violations, possessions et synchronisation (2026-10-10).
// Les 20 contrôles demandés, sur les IDENTIFIANTS, les chronomètres, les
// équipes en possession et les statistiques (jamais sur le seul texte) :
//  1-7   rebonds : une seule résolution par tir manqué, même joueur dans le
//        jeu, l'événement et la feuille de match, lancers francs compris ;
//  8-14  violations 8 s / 24 s / retour en zone arrière et chronomètre 24/14 ;
//  15-16 possession alternée (flèche) au début des périodes et prolongations ;
//  17    une seule implémentation des règles (moteur, page du jeu, direct) ;
//  18    moteur indépendant des animations (aucun Math.random) ;
//  19    journal des événements = feuille de match finale ;
//  20    aucune possession ni aucun événement en double.
// Scénarios reproductibles : graines fixes (MatchEngine { seed }) et
// générateurs contrôlés pour les règles pures.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const E = require("./engine.js");
const R = require("./assets/game-rules.js");
const ok = m => console.log("✅ " + m);
const seq = vals => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };

(async () => {
  // ---------- règles pures ----------
  assert.strictEqual(R.shotClockAfter("newPossession"), 24);
  assert.strictEqual(R.shotClockAfter("offensiveRebound", 3), 14);
  assert.strictEqual(R.shotClockAfter("defensiveFoul", 9), 14, "faute défensive, 9 s restantes → 14");
  assert.strictEqual(R.shotClockAfter("defensiveFoul", 19), 19, "faute défensive, 19 s restantes → 19 (pas de remise à 24)");
  assert.strictEqual(R.shotClockAfter("defensiveFoul", 9, { backcourt: true }), 24, "faute défensive en zone arrière → 24");
  assert.strictEqual(R.shotClockAfter("defenseOutOfBounds", 7), 7, "sortie provoquée par la défense en zone avant → le restant");
  assert.ok(!R.shotClockOn(20, 24) && R.shotClockOn(30, 24), "chronomètre éteint quand il reste moins de temps de jeu");
  ok("12. Chronomètre des tirs : 24 en nouvelle possession, 14 après un rebond offensif, au moins 14 après une faute défensive, jamais remis à 24 sans raison.");
  assert.ok(R.isEightSecondViolation({ backcourtStart: true, crossedAt: null }) && R.isEightSecondViolation({ backcourtStart: true, crossedAt: 8.2 }));
  assert.ok(!R.isEightSecondViolation({ backcourtStart: true, crossedAt: 6.4 }) && !R.isEightSecondViolation({ backcourtStart: false }));
  assert.ok(R.isShotClockViolation({ shotReleased: false }) && R.isShotClockViolation({ shotReleased: true, releasedBeforeExpiry: false }));
  assert.ok(!R.isShotClockViolation({ shotReleased: true, releasedBeforeExpiry: true, touchedRim: true }), "tir parti à temps qui touche l'anneau : pas de violation");
  assert.ok(R.isShotClockViolation({ shotReleased: true, releasedBeforeExpiry: true, touchedRim: false, defenseControl: false }), "tir parti à temps, sans toucher l'anneau, repris par l'attaque : violation");
  assert.ok(!R.isShotClockViolation({ shotReleased: true, releasedBeforeExpiry: true, touchedRim: false, defenseControl: true }), "… repris par la défense : pas de violation");
  assert.ok(R.isBackcourtViolation({ frontcourtControl: true, lastTouchInFrontcourt: "offense", firstTouchInBackcourt: "offense" }));
  for (const c of [{ frontcourtControl: true, lastTouchInFrontcourt: "defense", firstTouchInBackcourt: "offense" }, { frontcourtControl: false, lastTouchInFrontcourt: "offense", firstTouchInBackcourt: "offense" },
    { frontcourtControl: true, lastTouchInFrontcourt: "offense", firstTouchInBackcourt: "defense" }, { frontcourtControl: true, lastTouchInFrontcourt: "offense", firstTouchInBackcourt: "offense", throwIn: true }])
    assert.ok(!R.isBackcourtViolation(c), "pas une violation : " + JSON.stringify(c));
  // Tirages contrôlés : la même suite de nombres donne la même décision.
  const big = { eightSeconds: 1, backcourtSituation: 1, shotClock: 1 };
  assert.strictEqual(R.rollViolations(seq([0.5, 0]), { backcourtStart: true, gameClock: 300, budget: 15, chances: big }).kind, "eightSeconds");
  assert.strictEqual(R.rollViolations(seq([0.5, 0.9, 0, 0.9, 0.5]), { backcourtStart: true, gameClock: 300, budget: 15, chances: { ...big, eightSeconds: 0 } }).kind, "backcourt");
  const defl = R.rollViolations(seq([0.5, 0.9, 0, 0.1, 0.5, 0.99]), { backcourtStart: true, gameClock: 300, budget: 15, chances: { ...big, eightSeconds: 0, shotClock: 0 } });
  assert.strictEqual(defl.kind, null, "ballon dévié par la défense vers la zone arrière : pas de violation");
  assert.ok(defl.crossedAt < 8, "franchissement légal dans les 8 s");
  const sc = R.rollViolations(seq([0, 0.1]), { backcourtStart: false, gameClock: 300, shotClock: 14, budget: 10, chances: { eightSeconds: 0, backcourtSituation: 0, shotClock: 1 } });
  assert.ok(sc.kind === "shotClock" && sc.clockUsed === 14, "violation des 24 s sur un chronomètre ramené à 14 : 14 s consommées");
  assert.strictEqual(R.rollViolations(seq([0, 0.1]), { backcourtStart: false, gameClock: 10, shotClock: 24, budget: 10, chances: { eightSeconds: 0, backcourtSituation: 0, shotClock: 1 } }).kind, null, "chronomètre éteint en fin de période : pas de violation des 24 s");
  ok("13-14. Retour en zone arrière : violation seulement si l'attaque a le contrôle en zone avant et touche en dernier puis en premier ; déviation, remise en jeu, absence de contrôle : pas de violation.");
  assert.strictEqual(R.arrowAfterTipoff("A"), "B");
  assert.deepStrictEqual(R.alternatingPossession("B"), { possession: "B", arrow: "A" });
  assert.deepStrictEqual([2, 3, 4, 5, 6].map(p => R.periodStartTeam("A", p)), ["B", "A", "B", "A", "B"]);

  // ---------- moteur : 60 matchs, graines fixes ----------
  const games = [];
  for (let g = 0; g < 60; g++) {
    const a = E.generateStartingRoster("Règles A " + g), b = E.generateStartingRoster("Règles B " + g);
    if (g % 3 === 0) b.defense = "Zone press";
    const eng = new E.MatchEngine(a, b, { seed: 9100 + g });
    const r = eng.simulate(Date.UTC(2026, 9, 10));
    games.push({ r, eng, ids: { A: new Set(eng.teamA.players.map(p => p.id)), B: new Set(eng.teamB.players.map(p => p.id)) } });
  }
  const isGame = e => !["substitution", "foulOut", "shortHanded", "quarterEnd", "injury", "timeout"].includes(e.type);
  let defReb = 0, offReb = 0, ftReb = 0, ftOffReb = 0, ftMoreMissed = 0, techMissed = 0, v8 = 0, v24 = 0, vbc = 0, cross = 0, after14 = 0, buzzer = 0, ot = 0, periods = 0;
  for (const { r, ids } of games) {
    const ev = r.events;
    const rebByPlayer = new Map();
    // 1-2, 6-7 : rebonds
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type !== "rebound") continue;
      const t = e.team, sk = e.offensive ? t : t === "A" ? "B" : "A";
      assert.ok(ids[t].has(e.rebounderId), "rebondeur de l'équipe du rebond");
      assert.strictEqual(e.possessionAfter, t, "possession à l'équipe qui prend le rebond");
      const d = (e.delta && e.delta[t]) || {};
      const credited = Object.entries(e.delta || {}).flatMap(([k, per]) => Object.entries(per).filter(([, x]) => x.reb).map(([id, x]) => ({ k, id: Number(id), reb: x.reb, o: x.oreb || 0, dd: x.dreb || 0 })));
      assert.ok(credited.length === 1 && credited[0].id === e.rebounderId && credited[0].reb === 1 && credited[0].k === t, `rebond crédité au seul rebondeur de l'événement (${JSON.stringify(credited)})`);
      assert.strictEqual(e.offensive ? credited[0].o : credited[0].dd, 1, "offensif / défensif crédité selon l'événement");
      assert.ok(sk === e.possession || e.possession === undefined, "l'équipe du tireur avait la possession");
      rebByPlayer.set(e.rebounderId, (rebByPlayer.get(e.rebounderId) || 0) + 1);
      if (e.freeThrow) {
        ftReb++; if (e.offensive) ftOffReb++;
        // 3 : le dernier lancer manqué, juste avant, annonçait le rebond
        const p = ev[i - 1];
        assert.ok(p && p.type === "freeThrow" && p.rebound && p.made === 0 && p.attempt === p.of && p.shooterId === e.shooterId, "rebond de lancer : juste après le dernier lancer manqué du même tireur");
      } else if (e.offensive) offReb++; else defReb++;
    }
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === "freeThrow" && e.made === 0) {
        if (e.attempt < e.of) {
          // 4 : d'autres lancers à tirer — aucun rebond
          ftMoreMissed++;
          assert.ok(!e.rebound && !(ev[i + 1] && ev[i + 1].type === "rebound" && ev[i + 1].freeThrow), "lancer manqué avec d'autres lancers à suivre : pas de rebond");
        } else if (!e.rebound) {
          // 5 : lancer de faute technique / antisportive — pas de rebond, remise en jeu
          techMissed++;
          assert.ok(!(ev[i + 1] && ev[i + 1].type === "rebound" && ev[i + 1].freeThrow), "lancer sans rebond (technique / antisportive) : pas d'événement de rebond");
        } else assert.ok(ev[i + 1] && ev[i + 1].type === "rebound" && ev[i + 1].freeThrow, "dernier lancer manqué annoncé rebondable : un rebond suit");
      }
    }
    // 6-7, 19 : feuille finale = journal
    for (const p of [...r.boxScoreA, ...r.boxScoreB]) assert.strictEqual(p.reb || 0, rebByPlayer.get(p.id) || 0, `rebonds de ${p.name} : feuille = événements`);
    const fromLog = new Map();
    for (const e of ev) for (const k of ["A", "B"]) for (const [id, d] of Object.entries((e.delta && e.delta[k]) || {})) { const row = fromLog.get(Number(id)) || {}; for (const f in d) row[f] = (row[f] || 0) + d[f]; fromLog.set(Number(id), row); }
    for (const p of [...r.boxScoreA, ...r.boxScoreB]) for (const f of ["pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf", "fgm2", "fga2", "fgm3", "fga3", "ftm", "fta"])
      assert.strictEqual((fromLog.get(p.id) || {})[f] || 0, p[f] || 0, `${p.name} ${f} : journal = feuille finale`);
    // 8-12 : violations et chronomètre
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.tovType === "violation") {
        const other = e.team === "A" ? "B" : "A";
        assert.strictEqual(e.possessionAfter, other, "violation : ballon à l'adversaire");
        assert.ok(ids[e.team].has(e.playerId) && e.deadBall === true, "violation : joueur responsable identifié, ballon mort");
        assert.strictEqual(e.delta[e.team][e.playerId].tov, 1, "violation : une perte de balle, au joueur responsable");
        const next = ev.slice(i + 1).find(isGame);
        if (next && next.quarter === e.quarter && next.type !== "quarterStart") assert.strictEqual(next.possession, other, `après la violation, l'action suivante est jouée par l'adversaire (${next.type})`);
        if (e.tovKind === "eightSeconds") { v8++; assert.strictEqual(e.possLen, 8, "8 s consommées"); }
        if (e.tovKind === "shotClock") { v24++; if (!e.afterShot) assert.ok(e.possLen === e.shotClock, `24 s : tout le chronomètre consommé (${e.possLen} / ${e.shotClock})`); }
        if (e.tovKind === "backcourt") { vbc++; assert.ok(e.possLen > e.crossAt, "retour en zone : après le franchissement"); }
      }
      if (typeof e.crossAt === "number" && e.tovKind !== "eightSeconds") { cross++; assert.ok(e.crossAt < 8, "franchissement légal dans les 8 s"); }
      if (e.buzzerShot && (e.type === "shot" || e.type === "rebound")) buzzer++;
      // 12 : possession qui suit un rebond offensif → 14 s
      if (e.type === "rebound" && e.offensive) {
        const next = ev.slice(i + 1).find(x => isGame(x) && typeof x.shotClock === "number" && x.possStart !== e.possStart);
        if (next && next.quarter === e.quarter && next.possession === e.team && !next.alternating) {
          after14++;
          if (R.shotClockOn(next.possStart, 14)) { assert.strictEqual(next.shotClock, 14, "après un rebond offensif : chronomètre à 14"); assert.ok(next.possLen <= 14.05, "possession suivante dans les 14 s"); }
        }
      }
      if (typeof e.possLen === "number" && typeof e.shotClock === "number" && R.shotClockOn(e.possStart, e.shotClock) && e.type !== "foul" && !e.inbound && e.type !== "outOfBounds") assert.ok(e.possLen <= e.shotClock + 0.05, `possession plus longue que le chronomètre (${e.possLen} > ${e.shotClock})`);
    }
    // 15-16, 20 : périodes
    const tip = ev.filter(e => e.type === "tipoff");
    assert.strictEqual(tip.length, 1, "un seul entre-deux");
    const starts = ev.filter(e => e.type === "quarterStart" && e.quarter > 1);
    const quarters = new Set(ev.map(e => e.quarter));
    assert.strictEqual(starts.length, quarters.size - 1, "un seul début par période");
    for (const s of starts) {
      periods++; if (s.quarter > 4) ot++;
      assert.strictEqual(s.possession, R.periodStartTeam(tip[0].team, s.quarter), `période ${s.quarter} : ballon à l'équipe de la flèche`);
      assert.strictEqual(s.arrow, s.possession === "A" ? "B" : "A", "la flèche change de sens après usage");
      const first = ev.slice(ev.indexOf(s) + 1).find(e => isGame(e) && e.quarter === s.quarter && e.type !== "quarterStart");
      if (first && first.type !== "technicalFoul" && first.type !== "foul" && first.type !== "unsportsmanlikeFoul") assert.strictEqual(first.possession, s.possession, `période ${s.quarter} : la première action est jouée par l'équipe de la flèche`);
    }
    // 20 : aucun événement en double
    const keys = new Set();
    // (deux lancers 1/1 du même tireur au même instant — faute technique puis
    // and-one — sont deux événements distincts : le second porte `rebound`)
    for (let i = 0; i < ev.length; i++) { const e = ev[i]; const k = JSON.stringify([e.quarter, e.clock, e.type, e.text, e.score, !!e.rebound, ev[i - 1] && ev[i - 1].type]); assert.ok(!keys.has(k) || e.type === "substitution", "événement en double : " + e.text); keys.add(k); }
  }
  assert.ok(defReb > 1000 && offReb > 300 && ftReb > 100 && ftOffReb > 5, `échantillon de rebonds (${defReb}/${offReb}/${ftReb})`);
  ok(`1. ${defReb} rebonds défensifs : un seul rebondeur, de l'équipe qui récupère, crédité dans la même action (reb + dreb).`);
  ok(`2. ${offReb} rebonds offensifs : même contrôle (reb + oreb), possession conservée.`);
  ok(`3. ${ftReb} rebonds sur dernier lancer franc manqué (${ftOffReb} offensifs) : événement juste après le lancer, même tireur.`);
  ok(`4. ${ftMoreMissed} lancers manqués avec d'autres lancers à suivre : aucun rebond.`);
  ok(`5. ${techMissed} lancers manqués de faute technique / antisportive : aucun rebond (remise en jeu réglementaire).`);
  ok("6-7. Rebondeur identique dans l'événement, les statistiques et la feuille de match ; aucun rebond compté deux fois ni oublié.");
  assert.ok(v8 > 3 && v24 > 10 && vbc > 2, `violations observées (${v8} / ${v24} / ${vbc})`);
  ok(`8. ${v8} violations des 8 s : 8 s consommées, perte au porteur, ballon à l'adversaire.`);
  ok(`9. ${cross} possessions remontées depuis la zone arrière : franchissement légal avant 8 s.`);
  ok(`10. ${v24} violations des 24 s : chronomètre entièrement consommé, ballon à l'adversaire.`);
  ok(`11. ${buzzer} tirs partis juste avant la sirène des 24 s : panier ou rebond normal (violation seulement si l'anneau n'est pas touché et que l'attaque reprend).`);
  ok(`12. ${after14} possessions après un rebond offensif : chronomètre à 14 s ; aucune possession plus longue que son chronomètre.`);
  ok(`13. ${vbc} retours en zone arrière sifflés, toujours après le franchissement.`);
  ok(`15. ${periods} débuts de période : ballon à l'équipe désignée par la flèche, qui change de sens.`);
  assert.ok(ot > 0, "au moins une prolongation dans l'échantillon");
  ok(`16. ${ot} prolongations : même règle de possession alternée.`);
  ok("19. Journal des événements = feuille de match finale (points, rebonds, passes, pertes, fautes, tirs) pour chaque joueur.");
  ok("20. Un seul entre-deux, un seul début par période, aucun événement en double, action suivante toujours jouée par l'équipe en possession.");

  // ---------- 17. une seule implémentation ----------
  const html = fs.readFileSync(path.join(__dirname, "moteurbasket3.html"), "utf8");
  assert.ok(!/\nclass MatchEngine\b/.test(html) && !/new MatchEngine\(/.test(html.replace(/\/\/[^\n]*/g, "")) && !/function simulateOrForfeit\b/.test(html), "moteurbasket3.html ne contient plus de copie du moteur");
  assert.ok(/<script src="assets\/game-rules\.js[^"]*"[^>]*>/.test(html), "moteurbasket3.html charge les règles partagées");
  assert.ok(/require\("\.\/assets\/game-rules\.js"\)/.test(fs.readFileSync(path.join(__dirname, "engine.js"), "utf8")), "engine.js utilise les règles partagées");
  const { shotClockBase } = await import(pathToFileURL(path.join(__dirname, "assets/live/adapter.js")).href);
  const src = /function liveShotClockBase\([^]*?\n}\n/.exec(html)[0];
  const liveShotClockBase = new Function("window", src + "return liveShotClockBase;")({ HM_RULES: R });
  for (const ev of [{ type: "rebound", offensive: true }, { type: "rebound", offensive: false }, { type: "foul", inbound: true, possStart: 300 }, { type: "outOfBounds", lastTouch: "defense", possStart: 300 }, { type: "shot", made: true }, null])
    for (const sec of [299, 290, 285, 280]) assert.strictEqual(liveShotClockBase(ev, sec), shotClockBase(ev, sec), "chronomètre des tirs : page du jeu = direct " + JSON.stringify(ev));
  // Matchs entre équipes non jouées : ce moteur-là (marqueurs de la flèche).
  const lg = E.generateLeague(E.generateStartingRoster("CPU"), 1, Date.UTC(2026, 9, 10));
  const orig = E.MatchEngine.prototype.simulate;
  let calls = 0, arrows = 0;
  E.MatchEngine.prototype.simulate = function (...args) { calls++; const res = orig.apply(this, args); if (res.events.some(e => e.type === "quarterStart" && e.alternating)) arrows++; return res; };
  try { lg.simulateCpuMatchesForRound(0); } finally { E.MatchEngine.prototype.simulate = orig; }
  assert.ok(calls >= 4 && arrows === calls, `matchs entre équipes non jouées : moteur corrigé (${arrows}/${calls})`);
  ok(`17. Une seule implémentation : plus de copie du moteur dans la page, règles partagées (assets/game-rules.js) identiques page / direct / moteur ; ${calls} matchs entre équipes non jouées simulés par le moteur corrigé.`);

  // ---------- 18. indépendance vis-à-vis des animations ----------
  const run = () => { const a = E.generateStartingRoster("Anim A"), b = E.generateStartingRoster("Anim B"); return { a, b }; };
  const { a, b } = run();
  const snap = JSON.stringify([a, b].map(t => t.players.map(p => [p.id, p.attrs])));
  const sim = () => { const ta = JSON.parse(snap); void ta; return new E.MatchEngine(a, b, { seed: 4242 }).simulate(Date.UTC(2026, 9, 10)); };
  const realRandom = Math.random;
  let r1, r2;
  try { Math.random = () => 0.999; r1 = sim(); Math.random = () => 0.001; r2 = sim(); } finally { Math.random = realRandom; }
  assert.deepStrictEqual(r2.finalScore, r1.finalScore, "Math.random (animations, public) n'influence pas le match");
  assert.strictEqual(JSON.stringify(r2.events.map(e => [e.type, e.clock, e.rebounderId || e.playerId || e.shooterId || null])), JSON.stringify(r1.events.map(e => [e.type, e.clock, e.rebounderId || e.playerId || e.shooterId || null])), "mêmes événements quel que soit Math.random");
  const court = fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8");
  assert.ok(!/crowd/i.test(fs.readFileSync(path.join(__dirname, "engine.js"), "utf8").replace(/\/\/[^\n]*/g, "")), "aucune notion de public dans le moteur");
  assert.ok(/function crowdIdle/.test(court), "les mouvements du public restent dans le terrain 2D (décor)");
  ok("18. Moteur indépendant des animations : même match avec n'importe quel Math.random, aucune référence au public ; mouvements du public conservés comme décor.");
  console.log("\n🏁 engine_rules_test.js");
})().catch(e => { console.error(e); process.exit(1); });
