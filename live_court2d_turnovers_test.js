// Direct 2D — pertes de balle en situation et remises en jeu réglementaires
// (2026-10-09, « les pertes de balle sont trop souvent un ballon envoyé
// directement en touche » / « le remiseur doit être derrière la ligne »).
//
// Remises en jeu :
//   - sortie en touche (côté haut ET côté bas) : remise en jeu, bonne équipe,
//     remiseur DERRIÈRE la ligne tant qu'il tient le ballon (coordonnées du
//     terrain, pas seulement le dessin), reprise seulement une fois le
//     ballon reçu DANS le terrain ;
//   - sortie en fond de terrain : remiseur derrière la ligne de fond ;
//   - une même sortie relivrée : une seule remise en jeu.
// Pertes de balle (moteur → terrain) :
//   - passe imprécise : ballon libre DANS le terrain, récupéré par le défenseur
//     désigné, sans arrêt ni remise en jeu ;
//   - passe interceptée : le défenseur coupe la ligne de passe ;
//   - receveur parti : le ballon arrive là où il était ;
//   - ballon mal contrôlé : le receveur le touche puis il échappe ;
//   - passe trop longue : la trajectoire sort réellement → remise en jeu.
// Moteur (engine.js:chooseTurnoverSituation et taux de pertes) :
//   - pertes pas systématiquement des sorties ; passeur imprécis → plus de
//     passes dehors ; receveur maladroit → plus de ballons mal contrôlés ;
//     défenseur qui lit le jeu → plus d'interceptions ;
//   - passe simple (bons passeurs, peu de pression) plus fiable, passe sous
//     pression plus risquée (taux de pertes sur matchs simulés).
const E = require("./engine.js");
const { harness, watch, teamOf, fail, ok } = require("./test_court2d_harness.js");

const outside = (x, y) => x < 0 || x > 94 || y < 0 || y > 50;
// Pendant la remise en jeu : le remiseur, ballon en main, est hors du terrain.
function checkInbounder(h, log, label) {
  const holding = log.filter(x => x.holder && x.inbounder && x.holder === x.inbounder);
  if (!holding.length) fail(`${label} : le remiseur doit recevoir le ballon hors du terrain.`);
  const bad = holding.find(x => !outside(x.hx, x.hy));
  if (bad) fail(`${label} : le remiseur tient le ballon DANS le terrain (${bad.hx.toFixed(1)}, ${bad.hy.toFixed(1)}).`);
  const live = log.find(x => x.phase === "LIVE" && x.t > holding[0].t);
  if (!live) fail(`${label} : reprise attendue après la remise en jeu.`);
  if (live.holder && outside(live.hx, live.hy)) fail(`${label} : le jeu reprend alors que le ballon est encore hors du terrain.`);
  return holding;
}
function watchIn(h, ms) {
  const log = watch(h, ms);
  // Remiseur désigné (état du terrain, debug().inbounder) à chaque image.
  return log;
}

(async () => {
  // ---------- Remises en jeu ----------
  for (const [label, at, edge] of [["touche côté haut", { x: 40, y: 6 }, "sideline"], ["touche côté bas", { x: 55, y: 44 }, "sideline"], ["fond de terrain", { x: 89, y: 18 }, "baseline"]]) {
    const h = harness();
    h.court.test.give("Gotham:1");
    h.court.test.placeAt("Gotham:1", at.x, at.y);
    h.run(200); h.resetTele();
    const side0 = h.d().sideInbounds;
    const e = h.ev({ kind: "turnover", type: "turnover", team: 0, tovType: "lost", possessionTeam: 0, possessionAfter: 1, actors: { player: "Gotham:1" }, text: "Perte." });
    h.push(e);
    const log = watch(h, 5200);
    const d = h.d();
    if (d.sideInbounds !== side0 + 1) fail(`${label} : une remise en jeu attendue (obtenu ${d.sideInbounds - side0}).`);
    const out = d.log.find(x => x.kind === "ball-out");
    if (!out || out.edge !== edge) fail(`${label} : sortie par la ligne de ${edge === "baseline" ? "fond" : "touche"} attendue (obtenu ${out && out.edge}).`);
    if (log.some(x => x.team === 0 && x.t > e.airAt + 100)) fail(`${label} : Gotham (dernier à toucher) ne récupère jamais le ballon.`);
    const holding = checkInbounder(h, log, label);
    const where = holding[0];
    if (edge === "baseline" && !(where.hx > 94)) fail(`${label} : remiseur derrière la ligne de fond (x = ${where.hx.toFixed(1)}).`);
    if (edge === "sideline" && !(at.y < 25 ? where.hy < 0 : where.hy > 50)) fail(`${label} : remiseur derrière la bonne ligne de touche (y = ${where.hy.toFixed(1)}).`);
    if (d.holderTeam !== 1 || d.phase !== "LIVE") fail(`${label} : ballon à Rennes et jeu repris (porteur ${d.holderTeam}, état ${d.phase}).`);
    if (h.tele.length) fail(`${label} : téléportation ${JSON.stringify(h.tele[0])}.`);
    ok(`Sortie (${label}) : remise en jeu par la bonne équipe, remiseur derrière la ligne (${where.hx.toFixed(1)}, ${where.hy.toFixed(1)}) tant qu'il tient le ballon, reprise après réception dans le terrain.`);
  }
  {
    const h = harness();
    h.court.test.give("Gotham:1");
    const side0 = h.d().sideInbounds;
    const e = h.ev({ kind: "turnover", type: "turnover", team: 0, tovType: "lost", possessionTeam: 0, possessionAfter: 1, actors: { player: "Gotham:1" }, text: "Perte." });
    h.push(e); h.run(120); h.court.update(h.S, [e.id]); h.run(120); h.court.update(h.S, [e.id]);
    watch(h, 5000);
    if (h.d().sideInbounds !== side0 + 1) fail(`même sortie relivrée : une seule remise en jeu (obtenu ${h.d().sideInbounds - side0}).`);
    ok("Une même sortie relivrée trois fois : une seule remise en jeu.");
  }

  // ---------- Pertes de balle en situation ----------
  const tov = (h, extra) => h.ev({ kind: "turnover", type: "turnover", team: 0, possessionTeam: 0, possessionAfter: 1, text: "Perte.", ...extra });
  for (const kind of ["passLoose", "fumble", "missedMove"]) {
    const h = harness();
    h.court.test.give("Gotham:0");
    h.court.test.placeAt("Gotham:0", 50, 25); h.court.test.placeAt("Gotham:2", 66, 12); h.court.test.placeAt("Rennes:3", 60, 18);
    h.run(200); h.resetTele();
    const recv0 = h.sp("Gotham:2");
    const side0 = h.d().sideInbounds, inb0 = h.d().inbounds;
    const e = tov(h, { tovType: "lost", tovKind: kind, deadBall: false, actors: { player: "Gotham:0", receiver: "Gotham:2", recoverer: "Rennes:3" } });
    h.push(e);
    const log = watch(h, 3200);
    const d = h.d();
    if (d.sideInbounds !== side0 || d.inbounds !== inb0) fail(`${kind} : pas de remise en jeu (ballon resté dans le terrain).`);
    if (log.some(x => x.phase !== "LIVE")) fail(`${kind} : jeu continu (ballon libre), jamais d'arrêt (${[...new Set(log.map(x => x.phase))].join(",")}).`);
    if (log.some(x => outside(x.bx, x.by))) fail(`${kind} : le ballon ne doit jamais sortir du terrain.`);
    if (!log.some(x => !x.holder && !x.flight)) fail(`${kind} : le ballon doit être libre un instant (ballon libre récupérable).`);
    if (d.holder !== "Rennes:3") fail(`${kind} : le défenseur désigné par le moteur récupère le ballon (obtenu ${d.holder}).`);
    if (kind === "missedMove") {
      const r1 = h.sp("Gotham:2");
      if (Math.hypot(r1.sx - recv0.sx, r1.sy - recv0.sy) < 3) fail("missedMove : le receveur doit être parti ailleurs.");
    }
    if (kind === "fumble" && !log.some(x => Math.hypot(x.bx - recv0.sx, x.by - recv0.sy) < 4)) fail("fumble : le ballon doit arriver au receveur avant de lui échapper.");
    ok(`Perte « ${kind} » : ballon libre dans le terrain, récupéré par le défenseur désigné, sans arrêt ni remise en jeu.`);
  }
  {
    const h = harness();
    h.court.test.give("Gotham:0");
    h.court.test.placeAt("Gotham:0", 50, 25); h.court.test.placeAt("Gotham:2", 70, 10); h.court.test.placeAt("Rennes:1", 64, 22);
    h.run(200); h.resetTele();
    const e = tov(h, { tovType: "steal", tovKind: "intercept", deadBall: false, actors: { player: "Gotham:0", receiver: "Gotham:2", stealer: "Rennes:1" } });
    h.push(e);
    const log = watch(h, 2500);
    if (h.d().holder !== "Rennes:1") fail(`intercept : l'intercepteur a le ballon (obtenu ${h.d().holder}).`);
    const caught = log.find(x => x.holder === "Rennes:1");
    // Point d'interception entre le passeur et le receveur (dans la ligne de passe).
    if (!(caught.bx > 50 && caught.bx < 72 && caught.by < 25 && caught.by > 8)) fail(`intercept : interception dans la ligne de passe (obtenu ${caught.bx.toFixed(1)}, ${caught.by.toFixed(1)}).`);
    if (h.d().sideInbounds !== 0 && log.some(x => x.phase !== "LIVE")) fail("intercept : jeu continu.");
    ok(`Passe interceptée : le défenseur coupe la ligne de passe (${caught.bx.toFixed(1)}, ${caught.by.toFixed(1)}) et garde le ballon, jeu continu.`);
  }
  {
    const h = harness();
    h.court.test.give("Gotham:0");
    h.court.test.placeAt("Gotham:0", 50, 30); h.court.test.placeAt("Gotham:2", 60, 8);
    h.run(200); h.resetTele();
    const side0 = h.d().sideInbounds;
    const e = tov(h, { tovType: "lost", tovKind: "passOut", deadBall: true, actors: { player: "Gotham:0", receiver: "Gotham:2" } });
    h.push(e);
    const log = watch(h, 5600);
    const out = h.d().log.find(x => x.kind === "ball-out");
    if (!out || out.tov !== "passOut") fail("passOut : sortie journalisée attendue.");
    // La sortie se fait dans le prolongement de la passe (vers le haut et la droite).
    if (!(out.exit[1] < 0 && out.exit[0] > 60)) fail(`passOut : sortie dans le prolongement de la passe (obtenu ${out.exit}).`);
    if (h.d().sideInbounds !== side0 + 1 || h.d().holderTeam !== 1) fail("passOut : remise en jeu par Rennes.");
    checkInbounder(h, log, "passOut");
    ok(`Passe trop longue : le ballon sort dans le prolongement de la passe (${out.exit.join(", ")}), remise en jeu réglementaire.`);
  }

  // ---------- Moteur : situations des pertes ----------
  {
    const fake = (o = {}) => ({ id: o.id || Math.random(), eff: k => (o[k] ?? 55) });
    const handler = fake({ id: "h" });
    const mates = [fake({ id: "m1" }), fake({ id: "m2" }), fake({ id: "m3" }), fake({ id: "m4" })];
    const defs = [1, 2, 3, 4, 5].map(i => fake({ id: "d" + i }));
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const count = (h, offFive, steal, stealer, n = 4000) => { const c = {}; for (let i = 0; i < n; i++) { const r = E.chooseTurnoverSituation(h, offFive, defs, steal, stealer, 55, rnd); c[r.kind] = (c[r.kind] || 0) + 1; if (r.kind === "passOut" ? !r.deadBall : r.deadBall) fail("deadBall seulement pour une passe sortie."); } return c; };
    const avg = count(handler, [handler, ...mates], false, null);
    const outShare = avg.passOut / 4000;
    if (!(outShare > 0.15 && outShare < 0.5)) fail(`pertes hors interception : sorties ${Math.round(outShare * 100)} % (ni jamais ni systématiques).`);
    const badPasser = count(fake({ id: "h", pass: 25, vision: 55 }), [handler, ...mates], false, null);
    if (!(badPasser.passOut > avg.passOut * 1.15)) fail(`passeur imprécis : plus de passes dehors (${badPasser.passOut} contre ${avg.passOut}).`);
    const clumsy = [fake({ id: "c1", dribble: 20 }), fake({ id: "c2", dribble: 20 }), fake({ id: "c3", dribble: 20 }), fake({ id: "c4", dribble: 20 })];
    const fumbles = count(handler, [handler, ...clumsy], false, null);
    if (!(fumbles.fumble > avg.fumble * 1.2)) fail(`receveurs maladroits : plus de ballons mal contrôlés (${fumbles.fumble} contre ${avg.fumble}).`);
    const reader = fake({ id: "s", anticipation: 90 }), poor = fake({ id: "s2", anticipation: 30 });
    const iRead = count(handler, [handler, ...mates], true, reader).intercept || 0, iPoor = count(handler, [handler, ...mates], true, poor).intercept || 0;
    if (!(iRead > iPoor * 1.3)) fail(`défenseur qui lit le jeu : plus d'interceptions de passe (${iRead} contre ${iPoor}).`);
    ok(`Situations des pertes : ${Math.round(outShare * 100)} % de passes dehors pour un passeur moyen (${Math.round(badPasser.passOut / 40)} % pour un passeur imprécis), ballons mal contrôlés ×${(fumbles.fumble / avg.fumble).toFixed(1)} avec des receveurs maladroits, interceptions ×${(iRead / iPoor).toFixed(1)} pour un défenseur qui lit le jeu.`);
  }
  {
    // Taux de pertes sur matchs simulés (calcul du moteur, inchangé) :
    // passeurs/dribbleurs sûrs contre défense moyenne, et attaque moyenne
    // contre défense qui presse.
    const N = 30;
    const tovOf = (setA, setB) => { let t = 0; for (let i = 0; i < N; i++) { const a = E.generateTeam("A", 1), b = E.generateTeam("B", 1); setA(a); setB(b); [a, b].forEach(x => x.autoAssignLineup()); const r = new E.MatchEngine(a, b).simulate(); t += r.boxScoreA.reduce((s, p) => s + p.tov, 0); } return t / N; };
    const boost = (t, ks, d) => t.players.forEach(p => ks.forEach(k => { p.attrs[k] = Math.max(1, Math.min(99, p.attrs[k] + d)); }));
    const base = tovOf(() => {}, () => {});
    const safe = tovOf(a => boost(a, ["dribble", "pass", "vision"], 20), () => {});
    const pressed = tovOf(() => {}, b => boost(b, ["defOutside", "steal", "anticipation"], 20));
    if (!(safe < base)) fail(`passes simples (bons passeurs) plus fiables : ${safe.toFixed(1)} pertes contre ${base.toFixed(1)}.`);
    if (!(pressed > base)) fail(`passes sous pression plus risquées : ${pressed.toFixed(1)} pertes contre ${base.toFixed(1)}.`);
    ok(`Taux de pertes (moteur) : ${base.toFixed(1)} par match, ${safe.toFixed(1)} avec des passeurs/dribbleurs sûrs, ${pressed.toFixed(1)} face à une défense qui presse.`);
  }
  console.log("\n🏁 live_court2d_turnovers_test.js : pertes de balle et remises en jeu conformes.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
