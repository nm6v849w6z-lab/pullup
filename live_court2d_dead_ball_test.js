// Direct 2D — arrêts de jeu et remises en jeu (2026-10-09, « correction des
// incohérences du Live 2D ») : machine à états du terrain (LIVE → DEAD_BALL →
// INBOUND_SETUP → INBOUND → LIVE, TIMEOUT, PERIOD_END), sorties de balle,
// paniers, lancers francs, téléportations, chrono arrêté pendant l'arrêt.
// Horloge virtuelle (images de 40 ms, minuteries et rAF rejoués à la main) :
// déterministe, image par image.
//   1. ballon sorti en touche (perte) : arrêt, remise en jeu de l'autre équipe ;
//   2. ballon sorti après un contact défensif : l'attaque le garde ;
//   3. panier à 2 points : remise en jeu adverse depuis la ligne de fond ;
//   4. panier à 3 points : idem, « +3 » une seule fois ;
//   5. lancers francs : pas de remise entre deux lancers, remise après le dernier réussi ;
//   6. sortie juste après une transition (interception) ;
//   7. joueur loin de sa place / position invalide : replacement contrôlé, sans saut ;
//   8. événements quasi simultanés / répétés : ni double remise en jeu ni double « +2 » ;
//   9. remise en jeu exécutée : retour à LIVE, la possession suivante repart ;
//  10. fin de période au moment d'un panier ou d'une sortie : la fin de période gagne.
// Plus : chrono de match arrêté pendant la remise en jeu, chrono des 24 s
// conservé après une sortie défensive (assets/live/adapter.js), et recalage
// en douceur (aucune téléportation) quand le terrain est visible.
const path = require("path");
const { pathToFileURL } = require("url");
const { harness, watch, fail, ok } = require("./test_court2d_harness.js");

(async () => {
  // ---------- 1. Ballon sorti en touche (perte de Gotham) ----------
  {
    const h = harness();
    h.court.test.give("Gotham:0");
    h.resetTele();
    const side0 = h.d().sideInbounds;
    const e = h.ev({ kind: "turnover", type: "turnover", team: 0, tovType: "lost", possessionTeam: 0, possessionAfter: 1, actors: { player: "Gotham:1" }, text: "Gotham Joueur1 perd le ballon." });
    h.push(e);
    const first = h.d();
    if (first.phase !== "DEAD_BALL") fail(`1. sortie : arrêt de jeu immédiat attendu (DEAD_BALL), obtenu ${first.phase}.`);
    const log = watch(h, 4500);
    if (!log.some(x => x.by < 0 || x.by > 50)) fail("1. sortie : le ballon doit quitter le terrain par une ligne de touche.");
    // Pendant l'arrêt (avant la remise en jeu) : personne n'a le ballon, aucun Gotham ne le reprend.
    if (log.some(x => x.team === 0)) fail("1. sortie : Gotham (dernier à toucher) ne doit jamais récupérer le ballon.");
    const d = h.d();
    if (d.sideInbounds !== side0 + 1) fail(`1. sortie : une remise en jeu en touche attendue (obtenu ${d.sideInbounds - side0}).`);
    if (d.holderTeam !== 1) fail(`1. sortie : ballon à Rennes après la remise en jeu (obtenu équipe ${d.holderTeam}).`);
    if (d.phase !== "LIVE") fail(`1. sortie : reprise du jeu après la remise en jeu (état ${d.phase}).`);
    const phases = [...new Set(log.map(x => x.phase))];
    if (phases.join(">") !== "DEAD_BALL>INBOUND_SETUP>INBOUND>LIVE") fail(`1. sortie : enchaînement d'états inattendu ${phases.join(" > ")}.`);
    if (h.tele.length) fail(`1. sortie : téléportation ${JSON.stringify(h.tele[0])}.`);
    // Remiseur : de Rennes, hors du terrain sur la ligne de touche.
    if (!log.some(x => x.team === 1 && x.phase === "INBOUND_SETUP" && (x.hy < 0 || x.hy > 50))) fail("1. sortie : le remiseur de Rennes doit être hors du terrain, sur la ligne de touche.");
    const inbLog = d.log.filter(x => x.kind === "ball-out");
    if (!inbLog.length || inbLog[0].team !== 1) fail("1. sortie : journal de diagnostic (ball-out, équipe 1) attendu. " + JSON.stringify(d.log.map(x => x.kind + ":" + (x.team ?? ""))));
    ok(`1. Ballon sorti (perte) : arrêt immédiat, ballon hors du terrain, remise en jeu en touche par l'autre équipe (${phases.join(" → ")}), aucune téléportation.`);
  }

  // ---------- 2. Sortie après un contact défensif ----------
  {
    const h = harness();
    h.court.test.give("Gotham:0");
    const e = h.ev({ kind: "outOfBounds", type: "outOfBounds", team: 1, lastTouch: "defense", inbound: true, possessionTeam: 0, possessionAfter: 0, actors: { player: "Rennes:2" }, text: "Rennes Joueur2 dévie le ballon en touche : remise en jeu pour Gotham." });
    h.push(e);
    const log = watch(h, 4500);
    if (log.some(x => x.team === 1)) fail("2. contact défensif : Rennes (dernier à toucher) ne doit jamais avoir le ballon.");
    const d = h.d();
    if (d.holderTeam !== 0 || d.phase !== "LIVE") fail(`2. contact défensif : Gotham garde le ballon et le jeu reprend (porteur ${d.holderTeam}, état ${d.phase}).`);
    if (!log.some(x => x.phase === "INBOUND")) fail("2. contact défensif : remise en jeu attendue.");
    ok("2. Ballon sorti après un contact défensif : l'attaque garde le ballon, remise en jeu en touche, reprise.");
  }

  // ---------- 3 et 4. Paniers à 2 et 3 points ----------
  for (const [zone, pts] of [["mid", 2], ["three", 3]]) {
    const h = harness();
    h.court.test.give("Gotham:1");
    h.S.teams[0].score += pts;
    const inb0 = h.d().inbounds;
    const e = h.ev({ kind: "shot", type: "made", team: 0, made: true, zone, possessionTeam: 0, possessionAfter: 1, shot: { x: zone === "three" ? 66 : 76, y: 25 }, actors: { shooter: "Gotham:1" }, text: "Panier." });
    h.push(e);
    const log = watch(h, 5200);
    const d = h.d();
    if (d.inbounds !== inb0 + 1) fail(`${pts} pts : une remise en jeu attendue (obtenu ${d.inbounds - inb0}).`);
    if (log.some(x => x.team === 0 && x.t > e.airAt + 200)) fail(`${pts} pts : l'équipe qui a marqué ne doit plus avoir le ballon.`);
    if (d.holderTeam !== 1 || d.phase !== "LIVE") fail(`${pts} pts : remise en jeu de Rennes puis reprise (porteur ${d.holderTeam}, état ${d.phase}).`);
    // Remiseur derrière la ligne de fond de CE panier (droite : x > 94).
    if (!log.some(x => x.hx > 94 && x.team === 1 && x.phase === "INBOUND_SETUP")) fail(`${pts} pts : le remiseur de Rennes doit être derrière la ligne de fond du panier marqué.`);
    const pf = h.win.document.querySelectorAll(".c2d-ptsf").length;
    if (pf > 1) fail(`${pts} pts : « +${pts} » affiché ${pf} fois.`);
    if (h.S.teams[0].score !== pts) fail(`${pts} pts : le terrain ne modifie jamais le score.`);
    ok(`${pts === 2 ? 3 : 4}. Panier à ${pts} points : ballon mort, remise en jeu adverse derrière la ligne de fond, reprise du jeu (« +${pts} » une seule fois).`);
  }

  // ---------- 5. Lancers francs ----------
  {
    const h = harness();
    const inb0 = h.d().inbounds;
    const f1 = h.ev({ kind: "freeThrow", type: "ft", team: 0, made: 1, attempt: 1, of: 2, attempts: 1, lastMade: true, possessionTeam: 0, possessionAfter: 0, actors: { shooter: "Gotham:0" }, text: "1er lancer réussi." });
    h.push(f1);
    watch(h, 2600);
    if (h.d().inbounds !== inb0) fail("5. lancers : pas de remise en jeu entre deux lancers.");
    if (h.d().phase !== "DEAD_BALL") fail(`5. lancers : ballon mort entre les lancers (état ${h.d().phase}).`);
    const f2 = h.ev({ kind: "freeThrow", type: "ft", team: 0, made: 1, attempt: 2, of: 2, attempts: 1, lastMade: true, possessionTeam: 0, possessionAfter: 1, actors: { shooter: "Gotham:0" }, text: "2e lancer réussi." });
    h.push(f2);
    watch(h, 7000);
    const d = h.d();
    if (d.inbounds !== inb0 + 1 || d.holderTeam !== 1 || d.phase !== "LIVE") fail(`5. lancers : remise en jeu adverse après le dernier lancer réussi (remises ${d.inbounds - inb0}, porteur ${d.holderTeam}, état ${d.phase}).`);
    ok("5. Lancers francs : ballon mort entre les lancers (pas de remise), remise en jeu adverse après le dernier lancer réussi.");
  }

  // ---------- 6. Sortie juste après une transition ----------
  {
    const h = harness();
    h.court.test.give("Gotham:0");
    const st = h.ev({ kind: "turnover", type: "turnover", team: 0, tovType: "steal", possessionTeam: 0, possessionAfter: 1, actors: { player: "Gotham:0", stealer: "Rennes:1" }, text: "Interception." });
    h.push(st);
    watch(h, 1500);
    if (h.d().holderTeam !== 1) fail("6. transition : l'intercepteur a le ballon.");
    const side0 = h.d().sideInbounds;
    const out = h.ev({ kind: "turnover", type: "turnover", team: 1, tovType: "lost", possessionTeam: 1, possessionAfter: 0, actors: { player: "Rennes:1" }, text: "Rennes perd le ballon en transition." });
    h.push(out);
    const log = watch(h, 4500);
    const d = h.d();
    if (d.sideInbounds !== side0 + 1) fail(`6. transition : une seule remise en jeu (obtenu ${d.sideInbounds - side0}).`);
    if (log.some(x => x.team === 1 && x.t > out.airAt + 100)) fail("6. transition : Rennes ne doit plus avoir le ballon après sa sortie.");
    if (d.holderTeam !== 0 || d.phase !== "LIVE") fail(`6. transition : remise en jeu de Gotham puis reprise (porteur ${d.holderTeam}, état ${d.phase}).`);
    ok("6. Sortie juste après une interception (transition) : arrêt, une seule remise en jeu, pour la bonne équipe.");
  }

  // ---------- 7. Joueur loin de sa place / position invalide ----------
  {
    const h = harness();
    h.court.test.give("Gotham:0");
    // Un défenseur de Rennes resté tout au fond de l'autre moitié.
    h.court.test.placeAt("Rennes:3", 90, 45);
    h.resetTele();
    const e = h.ev({ kind: "turnover", type: "turnover", team: 0, tovType: "lost", possessionTeam: 0, possessionAfter: 1, actors: { player: "Gotham:2" }, text: "Perte." });
    h.push(e);
    watch(h, 4500);
    if (h.tele.length) fail(`7. replacement : aucun saut attendu, obtenu ${JSON.stringify(h.tele.slice(0, 2))}.`);
    // Position invalide (NaN) : correction contrôlée et tracée.
    const an0 = h.d().anomalies;
    h.court.test.target("Gotham:4", NaN, 20);
    watch(h, 400);
    const d = h.d();
    const g4 = h.sp("Gotham:4");
    if (!(d.anomalies > an0) || !d.log.some(x => x.kind === "anomaly" && x.what === "invalid-position")) fail("7. position invalide : correction tracée (anomaly invalid-position) attendue.");
    if (!Number.isFinite(g4.sx) || g4.sx < -8 || g4.sx > 102) fail(`7. position invalide : le joueur reste sur une position valide (obtenu ${g4.sx}).`);
    ok(`7. Joueur éloigné : il rejoint sa place en courant (plus grand pas ${h.maxStep.toFixed(2)} pied par image, aucun saut) ; cible invalide corrigée et tracée.`);
  }

  // ---------- 8. Événements quasi simultanés / répétés ----------
  {
    const h = harness();
    h.court.test.give("Gotham:1");
    const inb0 = h.d().inbounds;
    const e = h.ev({ kind: "shot", type: "made", team: 0, made: true, zone: "mid", possessionTeam: 0, possessionAfter: 1, shot: { x: 76, y: 25 }, actors: { shooter: "Gotham:1" }, text: "Panier." });
    h.push(e);
    h.run(80);
    h.court.update(h.S, [e.id]);          // même événement relivré (resynchronisation du fil)
    h.run(80);
    const sub = h.ev({ kind: "substitution", type: "sub", team: 1, possessionAfter: 1, actors: { player: "Rennes:2", replacement: "Rennes:7" }, text: "Changement." }, 0);
    h.S.teams[1].players[2].onCourt = false; h.S.teams[1].players[7].onCourt = true;
    h.push(sub);
    watch(h, 9000);
    const d = h.d();
    if (d.inbounds !== inb0 + 1) fail(`8. simultanés : une seule remise en jeu (obtenu ${d.inbounds - inb0}).`);
    const pf = h.win.document.querySelectorAll(".c2d-ptsf").length;
    if (pf > 1) fail(`8. simultanés : « +2 » affiché ${pf} fois.`);
    if (d.holderTeam !== 1 || d.phase !== "LIVE") fail(`8. simultanés : remise en jeu de Rennes après le changement (porteur ${d.holderTeam}, état ${d.phase}).`);
    ok("8. Panier relivré deux fois + changement au même arrêt : une seule remise en jeu (après le changement), « +2 » une seule fois.");
  }

  // ---------- 9. Remise en jeu exécutée : la possession suivante repart ----------
  {
    const h = harness();
    h.court.test.give("Gotham:1");
    const e = h.ev({ kind: "shot", type: "made", team: 0, made: true, zone: "mid", possessionTeam: 0, possessionAfter: 1, shot: { x: 76, y: 25 }, actors: { shooter: "Gotham:1" }, text: "Panier." });
    h.S.nextAction = { kind: "shot", team: 1, zone: "mid", airAt: h.vt + 11000, possessionTeam: 1, shot: { x: 20, y: 22 }, actors: { shooter: "Rennes:3" }, passes: ["Rennes:0", "Rennes:3"] };
    h.push(e);
    const log = watch(h, 10600);
    const liveAt = log.find(x => x.phase === "LIVE" && x.t > e.airAt + 500);
    if (!liveAt) fail("9. reprise : retour à l'état LIVE attendu.");
    // Pendant l'arrêt : jamais de passe de l'action suivante avant la fin de la remise en jeu.
    const before = log.filter(x => x.t < liveAt.t && x.holder === "Rennes:3");
    if (before.length) fail("9. reprise : l'action suivante ne doit pas commencer avant la remise en jeu.");
    if (!log.some(x => x.t > liveAt.t && x.holder === "Rennes:3")) fail("9. reprise : la possession suivante doit se jouer (le tireur reçoit le ballon).");
    ok("9. Remise en jeu exécutée : retour à LIVE, puis la possession suivante du moteur se joue (jamais avant).");
  }

  // ---------- 10. Fin de période au moment d'un panier / d'une sortie ----------
  for (const kind of ["panier", "sortie"]) {
    const h = harness();
    h.court.test.give("Gotham:1");
    const inb0 = h.d().inbounds, side0 = h.d().sideInbounds;
    const e = kind === "panier"
      ? h.ev({ kind: "shot", type: "made", team: 0, made: true, zone: "mid", possessionTeam: 0, possessionAfter: 1, shot: { x: 76, y: 25 }, actors: { shooter: "Gotham:1" }, clock: 0, text: "Panier au buzzer." })
      : h.ev({ kind: "turnover", type: "turnover", team: 0, tovType: "lost", possessionTeam: 0, possessionAfter: 1, actors: { player: "Gotham:1" }, clock: 0, text: "Perte." });
    h.push(e);
    h.run(300);
    const qe = h.ev({ kind: "quarterEnd", type: "period", team: null, clock: 0, possessionAfter: 1, text: "Fin du quart." });
    h.push(qe);
    const log = watch(h, 5000);
    const d = h.d();
    if (d.inbounds !== inb0 || d.sideInbounds !== side0) fail(`10. ${kind} + fin de période : aucune remise en jeu (obtenu ${d.inbounds - inb0} + ${d.sideInbounds - side0}).`);
    if (d.phase !== "PERIOD_END") fail(`10. ${kind} + fin de période : état PERIOD_END attendu, obtenu ${d.phase}.`);
    if (log.slice(-10).some(x => x.holder)) fail(`10. ${kind} + fin de période : plus aucun joueur ne tient le ballon.`);
    ok(`10. Fin de période juste après ${kind === "panier" ? "un panier" : "une sortie"} : la fin de période l'emporte (pas de remise en jeu, état PERIOD_END).`);
  }

  // ---------- Recalage en douceur (terrain visible) ----------
  {
    const h = harness();
    h.court.test.give("Gotham:0");
    h.run(400, () => {});
    h.tick();
    h.resetTele();
    // Événement arrivé très en retard (minuteries bridées) qui change la possession.
    const late = h.ev({ kind: "turnover", type: "turnover", team: 0, tovType: "steal", possessionTeam: 0, possessionAfter: 1, actors: { player: "Gotham:0", stealer: "Rennes:1" }, text: "Interception." }, -20000);
    h.push(late);
    const r = h.d().resyncs;
    watch(h, 2500);
    if (!(r >= 1)) fail("recalage : un événement très en retard déclenche un recalage.");
    if (h.tele.length) fail(`recalage visible : aucune téléportation attendue, obtenu ${JSON.stringify(h.tele.slice(0, 3))}.`);
    if (h.d().holderTeam !== 1) fail("recalage : ballon à l'équipe du moteur.");
    ok(`Recalage avec le terrain visible : les joueurs rejoignent leurs places en courant (plus grand pas ${h.maxStep.toFixed(2)} pied par image), ballon passé au porteur — aucune téléportation.`);
  }

  // ---------- Chrono : arrêté pendant la remise en jeu, 24 s conservées ----------
  {
    const { createLiveAdapter, DEAD_BALL_HOLD_MS } = await import(pathToFileURL(path.join(__dirname, "assets/live/adapter.js")).href);
    const K = 2_000_000_000_000;
    const team = n => ({ name: n, short: n.slice(0, 3), color: "#123456", players: [] });
    const base = [
      { type: "quarterStart", quarter: 1, clock: "10:00", airAt: K },
      { type: "tipoff", team: "A", quarter: 1, clock: "10:00", airAt: K + 2200, possession: "A", possessionAfter: "A" },
      { type: "turnover", tovType: "lost", team: "A", quarter: 1, clock: "09:40", airAt: K + 22200, possession: "A", possessionAfter: "B", possStart: 600 },
      { type: "shot", made: true, team: "B", quarter: 1, clock: "09:20", airAt: K + 42200, possession: "B", possessionAfter: "A", possStart: 580 },
      { type: "outOfBounds", lastTouch: "defense", inbound: true, team: "B", quarter: 1, clock: "09:10", airAt: K + 52200, possession: "A", possessionAfter: "A", possStart: 600 - 40 + 0 },
      { type: "shot", made: false, team: "A", quarter: 1, clock: "09:00", airAt: K + 62200, possession: "A", possessionAfter: "B" },
    ];
    // Contexte du moteur : la possession d'A a commencé à 9:20 (560 s).
    base[4].possStart = 560;
    const live = { isHome: true, kickoffAt: K, events: base, pauses: [], totalDurationMs: 70000 };
    const ad = createLiveAdapter({ live, teams: { A: team("A"), B: team("B") }, mine: "A" });
    base.forEach(e => ad.applyEvent(e));
    const at = t => { ad.tick(t); return ad.buildState(t); };
    // Après la perte (9:40) : chrono arrêté pendant la remise en jeu, puis repart.
    const s1 = at(K + 22200 + 500), s2 = at(K + 22200 + DEAD_BALL_HOLD_MS - 100), s3 = at(K + 22200 + 12000);
    if (s1.clock !== 580 || s2.clock !== 580) fail(`chrono : arrêté à 9:40 pendant la remise en jeu (obtenu ${s1.clock} / ${s2.clock}).`);
    if (!(s3.clock < 580)) fail(`chrono : repart après la remise en jeu (obtenu ${s3.clock}).`);
    // Après un panier au 1er quart : le chrono continue (règle FIBA).
    const s4 = at(K + 42200 + 1500);
    if (!(s4.clock < 560)) fail(`chrono : continue après un panier hors des 2 dernières minutes (obtenu ${s4.clock}).`);
    // Sortie défensive à 9:10 : possession commencée à 9:20 → 14 s… 24 − 10 = 14 restantes, pas 24.
    const s5 = at(K + 52200 + 500);
    if (!(s5.shotClock <= 14.01 && s5.shotClock >= 13.9)) fail(`24 s : conservées après une sortie défensive (attendu 14, obtenu ${s5.shotClock}).`);
    ok(`Chrono arrêté ${DEAD_BALL_HOLD_MS / 1000} s pendant la remise en jeu après une sortie, qui continue après un panier ; chrono des 24 s conservé (14 s) après une sortie défensive.`);
  }
  console.log("\n🏁 live_court2d_dead_ball_test.js : arrêts de jeu et remises en jeu conformes.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
