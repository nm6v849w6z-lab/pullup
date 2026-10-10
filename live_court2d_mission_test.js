// Mission live 2026-10-10 — terrain 2D (assets/live/court2d.js), tests de
// régression demandés (numéros de la mission) :
//   1  faute jamais signalée avant le contact (ni avant l'heure de l'action)
//   4  lancers francs depuis la ligne, même avec un temps mort entre deux
//      lancers (avant : remise en jeu côté table, lancer tiré de la table)
//   6  remise en jeu après un temps mort, même si l'onglet a été masqué
//   7  ballon et possession cohérents (porteur de l'équipe qui attaque)
//   8  remiseur jamais bloqué hors du terrain (chaîne de remise interrompue)
//   9  le porteur attaque des espaces (pas de dribble sur place)
//  10  joueurs sans ballon en mouvement
//  11  circulation de balle avant l'action réelle (passes utiles)
//  12  aucune passe à l'adversaire, aucune passe inventée sur une action courte
//  14  rebond offensif annoncé seulement quand le rebondeur tient le ballon
//  15  … pour l'équipe qui récupère réellement
//  16  aucun moment commenté deux fois pour un même événement
//  17/18 même action → même mise en scène (rechargement, rediffusion)
//  25  l'onde verte du cercle ne reste jamais (retour sur la page)
//  30  fin du direct : plus aucune animation (halt)
const { harness, watch, fail, ok } = require("./test_court2d_harness.js");

(async () => {
  // ---------- 1. Faute : signal après le contact ----------
  {
    let h = null; const said = [];
    h = harness({ onMoment: (k, info) => { if (!h) return; const l = h.court.test.layout().sprites; said.push({ k, t: h.vt, info, d: l["Rennes:1"] && l["Gotham:2"] ? Math.hypot(l["Rennes:1"].sx - l["Gotham:2"].sx, l["Rennes:1"].sy - l["Gotham:2"].sy) : null }); } });
    h.court.test.give("Gotham:1");
    h.run(200);
    const airAt = h.vt + 7000;
    h.S.nextAction = { kind: "foul", team: 1, airAt, possessionTeam: 0, actors: { defender: "Rennes:1", player: "Gotham:2" }, foulType: "common" };
    h.tick();
    watch(h, airAt - h.vt);
    const e = h.ev({ kind: "foul", type: "foul", team: 1, foulType: "common", possessionTeam: 0, possessionAfter: 0, actors: { defender: "Rennes:1", player: "Gotham:2" }, text: "Faute." });
    h.push(e);
    watch(h, 1500);
    const f = said.find(x => x.k === "faute");
    if (!f) fail("1 : la faute doit être signalée.");
    if (f.t < e.airAt) fail(`1 : faute signalée ${e.airAt - f.t} ms AVANT l'action.`);
    if (!(f.d < 3)) fail(`1 : au signal, le fautif doit être au contact (distance ${f.d && f.d.toFixed(1)} pieds).`);
    ok(`1. Faute signalée au contact (fautif à ${f.d.toFixed(1)} pied du fauté), jamais avant l'action.`);
  }

  // ---------- 4. Lancers francs : temps mort entre deux lancers ----------
  {
    const h = harness();
    h.court.test.give("Gotham:1");
    h.run(200);
    h.push(h.ev({ kind: "shot", type: "miss", team: 0, made: false, foulType: "shooting", fouled: true, zone: "mid", possessionTeam: 0, possessionAfter: 0, actors: { shooter: "Gotham:3", defender: "Rennes:3" }, shot: { x: 76, y: 20 }, text: "Faute sur le tir." }));
    watch(h, 2500);
    h.push(h.ev({ kind: "freeThrow", type: "ft", team: 0, made: 1, attempt: 1, of: 2, possessionTeam: 0, possessionAfter: 0, actors: { shooter: "Gotham:3" }, text: "1er lancer." }));
    watch(h, 3000);
    // Temps mort entre les deux lancers (6 s), 2e lancer annoncé ensuite.
    const tStart = h.vt;
    h.S.stoppage = { kind: "timeout", team: 1, startAt: tStart, endsAt: tStart + 6000 };
    h.push(h.ev({ kind: "timeout", type: "timeout", team: 1, durationMs: 6000, text: "Temps mort." }));
    h.S.nextAction = { kind: "freeThrow", team: 0, made: 1, attempt: 2, of: 2, possessionTeam: 0, airAt: tStart + 9000, actors: { shooter: "Gotham:3" } };
    const side0 = h.d().sideInbounds;
    watch(h, 6200);
    h.S.stoppage = null; h.tick();
    watch(h, 2700);
    if (h.d().sideInbounds !== side0) fail("4 : aucune remise en jeu entre deux lancers francs (reprise du temps mort).");
    const ft2 = h.ev({ kind: "freeThrow", type: "ft", team: 0, made: 1, attempt: 2, of: 2, possessionTeam: 0, possessionAfter: 1, actors: { shooter: "Gotham:3" }, text: "2e lancer." });
    h.S.nextAction = null;
    h.push(ft2);
    // Juste avant que le ballon parte (version courte : départ à 1,4 s).
    watch(h, 1300);
    const sh = h.sp("Gotham:3");
    if (!(Math.abs(sh.sx - 75) < 1.6 && Math.abs(sh.sy - 25) < 1.6)) fail(`4 : le tireur doit être sur la ligne des lancers (${sh.sx.toFixed(1)}, ${sh.sy.toFixed(1)}).`);
    if (h.d().inbounder) fail("4 : aucun remiseur verrouillé pendant les lancers.");
    const b = h.ball();
    if (b.y > 45) fail(`4 : le ballon ne part pas de la table de marque (y ${b.y.toFixed(1)}).`);
    ok(`4. Temps mort entre deux lancers : pas de remise en jeu, le 2e lancer part de la ligne (${sh.sx.toFixed(1)}, ${sh.sy.toFixed(1)}).`);
  }

  // ---------- 6. Remise en jeu après un temps mort (onglet masqué pendant) ----------
  {
    const h = harness();
    h.court.test.give("Gotham:1");
    h.run(400);
    const doc = h.win.document;
    const setVis = v => { Object.defineProperty(doc, "visibilityState", { value: v, configurable: true }); Object.defineProperty(doc, "hidden", { value: v === "hidden", configurable: true }); doc.dispatchEvent(new h.win.Event("visibilitychange")); };
    const tStart = h.vt;
    h.S.stoppage = { kind: "timeout", team: 1, startAt: tStart, endsAt: tStart + 8000 };
    h.push(h.ev({ kind: "timeout", type: "timeout", team: 1, durationMs: 8000, text: "Temps mort." }));
    watch(h, 2000);
    setVis("hidden"); h.run(2000); setVis("visible"); h.tick();
    const side0 = h.d().sideInbounds;
    watch(h, 5000);
    h.S.stoppage = null;
    watch(h, 3000);
    if (h.d().sideInbounds <= side0) fail("6 : remise en jeu attendue à la fin du temps mort, même après un onglet masqué.");
    if (!h.d().log.some(x => x.kind === "resume" && x.then === "remise en jeu")) fail("6 : reprise pilotée par la fin réelle du temps mort attendue.");
    const d = h.d();
    if (d.phase !== "LIVE" || d.holderTeam !== 0) fail(`7 : après la remise, jeu en cours et ballon à l'équipe en possession (phase ${d.phase}, équipe ${d.holderTeam}).`);
    ok("6. Fin du temps mort : remise en jeu en touche, même après un passage en arrière-plan.");
    ok("7. Après la remise : jeu en cours, ballon à l'équipe qui a la possession.");
  }

  // ---------- 8. Chaîne de remise interrompue : remiseur libéré ----------
  {
    const h = harness();
    h.court.test.give("Gotham:1");
    h.run(200);
    h.push(h.ev({ kind: "outOfBounds", type: "turnover", team: 1, possessionTeam: 0, possessionAfter: 0, actors: { player: "Rennes:2" }, text: "Ballon dévié en touche." }));
    // Pendant la mise en place, le ballon est repris d'office (vol remplacé).
    let locked = false;
    h.run(2600, () => { if (h.d().inbounder) locked = true; });
    if (!locked) fail("8 : une remise en jeu (remiseur en place) était attendue.");
    const inbId = h.d().inbounder;
    // Passage en arrière-plan pendant la remise (chaîne de minuteries perdue).
    const doc = h.win.document;
    const setVis = v => { Object.defineProperty(doc, "visibilityState", { value: v, configurable: true }); Object.defineProperty(doc, "hidden", { value: v === "hidden", configurable: true }); doc.dispatchEvent(new h.win.Event("visibilitychange")); };
    setVis("hidden"); h.run(300); setVis("visible"); h.tick();
    h.court.test.give("Gotham:0");
    watch(h, 9000);
    const d = h.d();
    if (d.inbounder) fail(`8 : remiseur toujours verrouillé hors du terrain (${d.inbounder}).`);
    if (d.phase !== "LIVE") fail(`8 : le jeu doit avoir repris (phase ${d.phase}).`);
    // Le remiseur peut rejoindre le jeu : une consigne dans le terrain est suivie.
    h.court.test.target && h.court.test.give("Gotham:0");
    const sp = h.sp(inbId);
    if (sp && (sp.sx < 0 || sp.sx > 94 || sp.sy < 0 || sp.sy > 50)) {
      watch(h, 4000);
      const sp2 = h.sp(inbId);
      if (sp2.sx < 0 || sp2.sx > 94 || sp2.sy < 0 || sp2.sy > 50) fail(`8 : ${inbId} reste hors du terrain (${sp2.sx.toFixed(1)}, ${sp2.sy.toFixed(1)}).`);
    }
    ok("8. Remise en jeu interrompue : le remiseur est libéré, le jeu reprend (garde-fou).");
  }

  // ---------- 9-12. Circulation de balle, porteur et joueurs sans ballon ----------
  const scenario = () => {
    const h = harness();
    h.court.test.give("Gotham:0");
    h.run(200);
    const airAt = h.vt + 12000;
    h.S.nextAction = { kind: "shot", team: 0, zone: "three", made: true, airAt, possessionTeam: 0, shot: { x: 70, y: 8 }, actors: { shooter: "Gotham:2", handler: "Gotham:0", assister: "Gotham:0" }, passes: ["Gotham:0", "Gotham:2"], shotType: "three", quality: "ouvert" };
    h.tick();
    const lay0 = h.court.test.layout().sprites;
    const log = watch(h, airAt - h.vt - 100);
    return { h, log, lay0 };
  };
  {
    const { h, log, lay0 } = scenario();
    const holders = log.map(x => x.holder).filter(Boolean);
    const changes = holders.filter((x, i) => i && x !== holders[i - 1]);
    if (log.some(x => x.holder && x.team !== 0)) fail("12 : le ballon ne passe jamais à l'adversaire sans perte du moteur.");
    if (changes.length < 3) fail(`11 : circulation de balle attendue avant la passe décisive (${changes.length} passes).`);
    if (holders[holders.length - 1] !== "Gotham:2") fail("11 : la dernière passe reste celle du moteur (vers le tireur).");
    // Porteur : il couvre du terrain ; joueurs sans ballon : ils bougent.
    let handlerPath = 0;
    for (let i = 1; i < log.length; i++) if (log[i].holder && log[i].holder === log[i - 1].holder && log[i].hx != null && log[i - 1].hx != null) handlerPath += Math.hypot(log[i].hx - log[i - 1].hx, log[i].hy - log[i - 1].hy);
    const lay1 = h.court.test.layout().sprites;
    const offBall = ["Gotham:1", "Gotham:3", "Gotham:4"].map(id => Math.hypot(lay1[id].sx - lay0[id].sx, lay1[id].sy - lay0[id].sy));
    if (handlerPath < 8) fail(`9 : le porteur doit attaquer des espaces (${handlerPath.toFixed(1)} pieds parcourus).`);
    if (offBall.filter(d => d > 2).length < 2) fail(`10 : les joueurs sans ballon doivent se déplacer (${offBall.map(d => d.toFixed(1)).join(", ")}).`);
    ok(`9. Porteurs en mouvement (${handlerPath.toFixed(0)} pieds parcourus balle en main sur l'action).`);
    ok(`10. Joueurs sans ballon en mouvement (${offBall.map(d => d.toFixed(1)).join(" / ")} pieds).`);
    ok(`11. ${changes.length} passes sur une action de 12 s (renversements puis passe décisive du moteur au tireur).`);
    // Action courte : aucune passe inventée en plus de la chaîne réelle.
    const h2 = harness();
    h2.court.test.give("Gotham:0");
    h2.run(200);
    const air2 = h2.vt + 2600;
    h2.S.nextAction = { kind: "shot", team: 0, zone: "mid", made: true, airAt: air2, possessionTeam: 0, shot: { x: 76, y: 20 }, actors: { shooter: "Gotham:2", handler: "Gotham:0" }, passes: ["Gotham:0", "Gotham:2"], shotType: "jumper" };
    h2.tick();
    const l2 = watch(h2, air2 - h2.vt - 100).map(x => x.holder).filter(Boolean);
    const c2 = l2.filter((x, i) => i && x !== l2[i - 1]).length;
    if (c2 > 1) fail(`12 : action courte, une seule passe (celle du moteur) attendue, vu ${c2}.`);
    ok("12. Passes toujours entre coéquipiers ; action courte : seule la passe réelle du moteur.");
  }

  // ---------- 14-16. Rebond offensif : annonce et doublon ----------
  {
    let h = null; const said = [];
    h = harness({ onMoment: (k, info) => { if (h) said.push({ k, t: h.vt, info, holder: h.d().holder }); } });
    h.court.test.give("Gotham:0");
    h.run(200);
    const e = h.ev({ kind: "rebound", type: "miss", team: 0, offensive: true, zone: "mid", possessionTeam: 0, possessionAfter: 0, actors: { shooter: "Gotham:1", rebounder: "Gotham:4" }, shot: { x: 76, y: 20 }, text: "Rebond offensif." });
    h.push(e);
    watch(h, 5000);
    const r = said.filter(x => x.k === "rebond_offensif");
    if (r.length !== 1) fail(`14 : un seul « rebond offensif » attendu (${r.length}).`);
    if (r[0].holder !== "Gotham:4") fail(`14 : annoncé seulement quand le rebondeur tient le ballon (porteur ${r[0].holder}).`);
    if (r[0].info.team !== 0) fail("15 : l'annonce concerne l'équipe qui récupère le rebond.");
    // Même événement rejoué (recalage, arrivée sur la page) : pas de doublon.
    h.court.update(h.S, [e.id]);
    watch(h, 5000);
    if (said.filter(x => x.k === "rebond_offensif").length !== 1 || said.filter(x => x.k === "rate").length > 1) fail("16 : aucun moment commenté deux fois pour un même événement.");
    ok("14. Rebond offensif annoncé quand le rebondeur tient le ballon, jamais avant.");
    ok("15. Annonce pour l'équipe qui récupère réellement le rebond.");
    ok("16. Même événement rejoué : aucun commentaire en double.");
  }

  // ---------- 17/18. Même action → même mise en scène ----------
  {
    const run = () => {
      const h = harness();
      h.court.test.give("Gotham:0");
      h.run(200);
      h.push(h.ev({ kind: "rebound", type: "miss", team: 1, offensive: false, zone: "mid", possessionTeam: 0, possessionAfter: 1, actors: { shooter: "Gotham:1", rebounder: "Rennes:4" }, shot: { x: 76, y: 20 }, text: "Rebond." }));
      const pts = [];
      h.run(4000, () => { const b = h.ball(); pts.push(+b.x.toFixed(2), +b.y.toFixed(2)); });
      return pts;
    };
    const a = run(), b = run();
    if (JSON.stringify(a) !== JSON.stringify(b)) fail("17 : même action, trajectoire du ballon différente d'un chargement à l'autre.");
    ok(`17/18. Même action rejouée dans deux chargements : trajectoire identique (${a.length / 2} images comparées).`);
  }

  // ---------- 25. Onde verte du cercle ----------
  {
    const h = harness();
    h.court.test.give("Gotham:2");
    h.run(200);
    h.push(h.ev({ kind: "shot", type: "made", team: 0, made: true, zone: "mid", possessionTeam: 0, possessionAfter: 1, actors: { shooter: "Gotham:2" }, shot: { x: 76, y: 20 }, text: "Panier." }));
    let seen = 0;
    h.run(3500, () => { seen = Math.max(seen, h.win.document.querySelectorAll(".c2d-wave").length); });
    if (!seen) fail("25 : l'onde du cercle doit apparaître sur un panier.");
    // Panier, puis l'onglet est masqué avant la fin de l'onde : au retour, plus rien.
    h.push(h.ev({ kind: "shot", type: "made", team: 1, made: true, zone: "mid", possessionTeam: 1, possessionAfter: 0, actors: { shooter: "Rennes:2" }, shot: { x: 18, y: 20 }, text: "Panier." }));
    // L'onglet est masqué au moment même où l'onde apparaît.
    for (let i = 0; i < 100 && !h.win.document.querySelectorAll(".c2d-wave").length; i++) h.run(40);
    const doc = h.win.document;
    const setVis = v => { Object.defineProperty(doc, "visibilityState", { value: v, configurable: true }); Object.defineProperty(doc, "hidden", { value: v === "hidden", configurable: true }); doc.dispatchEvent(new h.win.Event("visibilitychange")); };
    setVis("hidden"); h.run(500); setVis("visible");
    h.run(3000, () => { if (doc.querySelectorAll(".c2d-wave").length) fail("25 : onde verte restée au cercle après le retour sur la page."); });
    ok("25. Onde verte seulement sur un panier, jamais restée affichée après un retour sur la page.");
  }

  // ---------- 30. Fin du direct ----------
  {
    const h = harness();
    h.court.test.give("Gotham:1");
    h.run(400);
    h.S.status = "final"; h.tick(); h.run(1000);
    h.court.halt();
    h.run(200);
    const before = JSON.stringify(h.court.test.layout());
    const nLog = h.d().log.length;
    h.push(h.ev({ kind: "shot", type: "made", team: 0, made: true, zone: "mid", possessionTeam: 0, possessionAfter: 1, actors: { shooter: "Gotham:1" }, text: "Panier." }));
    h.run(3000);
    if (h.rafs) fail("30 : plus aucune boucle d'animation après la fin du direct.");
    if (JSON.stringify(h.court.test.layout()) !== before) fail("30 : plus rien ne bouge après la fin du direct.");
    if (h.d().log.length !== nLog) fail("30 : aucune nouvelle action jouée après la fin du direct.");
    ok("30. Fin du direct : terrain figé, plus d'animation ni d'action.");
    // Rediffusion ramenée avant la fin : le terrain repart.
    h.S.status = "live"; h.court.resume(); h.run(400);
    if (!h.rafs) fail("30 : rediffusion ramenée avant la fin : la boucle d'animation repart.");
    ok("30. Rediffusion ramenée avant la fin : le terrain repart (fin non définitive en rediffusion seulement).");
  }
  console.log("\n🏁 live_court2d_mission_test.js");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
