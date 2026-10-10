// Terrain 2D (assets/live/court2d.js), 2026-10-10 :
//  A. Lancers francs : placement RÉGLEMENTAIRE (avant : les 9 autres joueurs
//     alignés le long de la raquette). Tireur seul sur la ligne ; au plus
//     3 défenseurs et 2 coéquipiers du tireur dans les emplacements de
//     rebond ; les autres derrière la ligne à 3 points et la ligne des
//     lancers prolongée ; personne d'autre dans la raquette.
//  B. Tireur qui entre par un changement juste avant son tir : c'est bien
//     LUI qui lâche le ballon (avant : le dernier porteur tirait — « le tir
//     de Greco attribué à un autre »).
const { harness, watch, fail, ok } = require("./test_court2d_harness.js");

const RIM0 = { x: 88.75, y: 25 };   // panier visé par Gotham (équipe 0)
function checkAlignment(h, shooterId, label) {
  const lay = h.court.test.layout().sprites;
  const pts = Object.entries(lay).filter(([k]) => !k.startsWith("ref")).map(([k, p]) => ({ id: k, team: k.startsWith("Gotham") ? 0 : 1, x: p.sx, y: p.sy }))
    .filter(p => h.S.teams[p.team].players.some(q => q.id === p.id && q.onCourt));
  const sh = pts.find(p => p.id === shooterId);
  if (!sh || Math.abs(sh.x - 75) > 1.5 || Math.abs(sh.y - 25) > 1.5) fail(`${label} : tireur sur la ligne des lancers attendu (${sh && sh.x.toFixed(1)}, ${sh && sh.y.toFixed(1)}).`);
  const others = pts.filter(p => p !== sh);
  const inLaneSpace = p => p.x >= 75 && p.x <= 94 && ((p.y >= 14 && p.y <= 17.6) || (p.y >= 32.4 && p.y <= 36));
  const insideLane = p => p.x > 75.5 && p.y > 17.6 && p.y < 32.4;
  const off = others.filter(p => p.team === 0 && inLaneSpace(p)).length, def = others.filter(p => p.team === 1 && inLaneSpace(p)).length;
  if (off > 2) fail(`${label} : ${off} coéquipiers du tireur dans les emplacements (2 au plus).`);
  if (def > 3) fail(`${label} : ${def} défenseurs dans les emplacements (3 au plus).`);
  if (others.some(insideLane)) fail(`${label} : un joueur dans la raquette pendant le lancer (${JSON.stringify(others.filter(insideLane))}).`);
  const rest = others.filter(p => !inLaneSpace(p));
  const bad = rest.filter(p => Math.hypot(p.x - RIM0.x, p.y - RIM0.y) < 23.75 || p.x > 75);
  if (bad.length) fail(`${label} : joueurs hors emplacements pas derrière la ligne à 3 points / ligne des lancers prolongée : ${JSON.stringify(bad)}.`);
  return { off, def, rest: rest.length };
}

(async () => {
  // ---------- A1. Lancer franc joué directement (événement) ----------
  {
    const h = harness();
    h.court.test.give("Gotham:1");
    h.run(200);
    const e = h.ev({ kind: "freeThrow", type: "ft", team: 0, made: 1, attempt: 1, of: 2, possessionTeam: 0, possessionAfter: 0, actors: { shooter: "Gotham:3" }, text: "1er lancer." });
    h.push(e);
    watch(h, 3000);   // joueurs rendus à leur place au moment du lancer
    const r = checkAlignment(h, "Gotham:3", "A1 lancer joué");
    ok(`A1. Lancer joué : tireur seul sur la ligne, emplacements ${r.def} défenseurs + ${r.off} attaquants, ${r.rest} joueurs derrière la ligne à 3 points.`);
    // Entre les deux lancers : alignement conservé.
    watch(h, 1500);
    checkAlignment(h, "Gotham:3", "A1 entre les deux lancers");
    ok("A1. Entre les deux lancers : alignement réglementaire conservé.");
  }
  // ---------- A2. Lancers préparés à l'avance (action annoncée) ----------
  {
    const h = harness();
    h.court.test.give("Gotham:1");
    h.S.nextAction = { kind: "freeThrow", team: 0, made: 1, attempt: 1, of: 1, possessionTeam: 0, airAt: h.vt + 7000, actors: { shooter: "Gotham:2" } };
    h.tick();
    watch(h, 5000);
    const r = checkAlignment(h, "Gotham:2", "A2 lancer annoncé");
    const al = h.d().log.filter(x => x.kind === "ft-align").pop();
    if (!al || al.lane.length !== 5 || al.lane.filter(t => t === 1).length !== 3 || al.lane.filter(t => t === 0).length !== 2) fail(`A2 : 3 défenseurs + 2 attaquants dans les emplacements attendus (${JSON.stringify(al)}).`);
    ok(`A2. Lancer annoncé à l'avance : même alignement (${r.def} + ${r.off} dans les emplacements, ${r.rest} derrière la ligne à 3 points).`);
  }

  // ---------- B. Tireur entré par un changement juste avant son tir ----------
  {
    const h = harness();
    h.court.test.give("Gotham:1");
    h.run(200);
    const airAt = h.vt + 9000;
    h.S.nextAction = { kind: "shot", team: 0, zone: "mid", made: true, airAt, possessionTeam: 0, shot: { x: 76, y: 20 }, actors: { shooter: "Gotham:7", handler: "Gotham:1" }, passes: ["Gotham:1", "Gotham:7"], shotType: "jumper" };
    h.tick();
    watch(h, 2600);
    // Le changement arrive maintenant (Gotham:7 entre à la place de Gotham:2).
    h.S.teams[0].players[7].onCourt = true; h.S.teams[0].players[2].onCourt = false;
    const sub = h.ev({ kind: "substitution", type: "sub", team: 0, possessionAfter: 0, actors: { in: "Gotham:7", out: "Gotham:2" }, text: "Changement." });
    h.push(sub);
    const log = watch(h, airAt - h.vt + 200);
    const held = log.filter(x => x.t < airAt - 100 && x.holder).map(x => x.holder);
    const last = held[held.length - 1];
    if (last !== "Gotham:7") fail(`B : le tireur du moteur (Gotham:7) doit lâcher le ballon, dernier porteur ${last}.`);
    if (!h.d().log.some(x => x.kind === "plan-wait")) fail("B : la préparation aurait dû attendre l'entrée du tireur.");
    ok("B. Tireur entré par un changement juste avant son tir : c'est bien lui qui reçoit et lâche le ballon.");
  }
  console.log("\n🏁 live_court2d_freethrow_shooter_test.js : lancers francs réglementaires, bon tireur après un changement.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
