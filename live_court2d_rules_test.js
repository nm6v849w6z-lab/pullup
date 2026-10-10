// Terrain 2D et règles du moteur (2026-10-10) :
//  A. Dernier lancer franc manqué suivi d'un rebond du moteur : c'est le
//     rebondeur DE L'ÉVÉNEMENT qui récupère le ballon (avant : le terrain
//     inventait un rebondeur, le plus grand de l'équipe adverse).
//  B. Violation (8 s / 24 s / retour en zone) : jeu arrêté, puis remise en
//     jeu de l'adversaire — pas de ballon libre inventé.
const { harness, watch, fail, ok } = require("./test_court2d_harness.js");

(async () => {
  // ---------- A ----------
  for (const [offensive, reb, team] of [[false, "Rennes:2", 1], [true, "Gotham:1", 0]]) {
    const h = harness();
    h.court.test.give("Gotham:3");
    h.run(200);
    h.push(h.ev({ kind: "freeThrow", type: "ft", team: 0, made: 0, attempt: 2, of: 2, rebound: true, possessionTeam: 0, possessionAfter: 0, actors: { shooter: "Gotham:3" }, text: "2e lancer manqué." }));
    watch(h, 2600);
    if (h.d().holder) fail(`A : ballon au cercle en attendant le rebond du moteur (porteur ${h.d().holder}).`);
    h.push(h.ev({ kind: "rebound", type: "miss", team, offensive, freeThrow: true, possessionTeam: 0, possessionAfter: team, actors: { shooter: "Gotham:3", rebounder: reb }, text: "Rebond." }));
    watch(h, 3500);
    const d = h.d();
    if (d.holder !== reb) fail(`A : le rebondeur du moteur (${reb}) doit avoir le ballon, porteur ${d.holder}.`);
    ok(`A. Lancer manqué, rebond ${offensive ? "offensif" : "défensif"} du moteur : ${reb} récupère le ballon, comme dans l'événement et la feuille de match.`);
  }
  // ---------- B ----------
  for (const kind of ["eightSeconds", "shotClock", "backcourt"]) {
    const h = harness();
    h.court.test.give("Gotham:0");
    h.run(200);
    const side0 = h.d().sideInbounds;
    h.push(h.ev({ kind: "turnover", type: "turnover", team: 0, tovType: "violation", tovKind: kind, deadBall: true, possessionTeam: 0, possessionAfter: 1, actors: { player: "Gotham:0" }, text: "Violation." }));
    let dead = false, loose = false;
    h.run(800, () => { if (h.d().phase === "DEAD_BALL") dead = true; if (h.ball().loose) loose = true; });
    watch(h, 6000);
    const d = h.d();
    if (!dead) fail(`B ${kind} : jeu arrêté attendu.`);
    if (loose) fail(`B ${kind} : pas de ballon libre sur une violation.`);
    if (d.sideInbounds <= side0) fail(`B ${kind} : remise en jeu en touche de l'adversaire attendue.`);
    if (d.holderTeam !== 1) fail(`B ${kind} : ballon à l'adversaire après la remise (équipe ${d.holderTeam}).`);
    ok(`B. Violation ${kind} : arrêt, remise en jeu de l'adversaire, ballon à l'équipe désignée par le moteur.`);
  }
  console.log("\n🏁 live_court2d_rules_test.js");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
