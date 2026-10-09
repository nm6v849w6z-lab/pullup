// Direct 2D (retour utilisateur 2026-10-09) : « après un lancer franc
// marqué il y a effectivement un arrêt de jeu, le changement doit être fait
// avant que la remise en jeu soit faite ». Le moteur place les changements
// après le dernier lancer réussi (voir engine_dead_ball_subs_test.js) ; le
// terrain doit jouer le changement PUIS la remise en jeu, jamais l'inverse.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function fail(msg) { throw new Error("❌ " + msg); }
const ok = msg => console.log("✅ " + msg);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dom = new JSDOM(`<!doctype html><div id="host"></div>`, { pretendToBeVisual: true, runScripts: "outside-only" });
const { window } = dom;
const strip = src => src.replace(/^import .*$/mg, "").replace(/^export\s+(function|const|let|class)/mg, "$1").replace(/^export\s*\{[^}]*\};?/mg, "");
window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/format.js"), "utf8")));
window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8")));

const POS = ["M", "AS", "A", "AF", "P"];
const mkTeam = (key, n) => ({ name: key, short: key.slice(0, 3).toUpperCase(), score: 0, color: key === "Gotham" ? "#F26B1D" : "#3B8FE0",
  players: Array.from({ length: n }, (_, i) => ({ id: key + ":" + i, name: key + " Joueur" + i, pos: POS[i % 5], onCourt: i < 5, pts: 0, reb: 0, ast: 0, number: 4 + i, fatigue: 10, pf: 0 })) });

async function scenario(withSub) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const S = { status: "live", quarter: 2, clock: 400, possession: 0,
    teams: [mkTeam("Gotham", 10), mkTeam("Rennes", 10)], shots: [], referees: [0, 1, 2].map(i => ({ id: "ref" + i })),
    events: [{ id: 0, kind: "tipoff", type: "period", quarter: 1, clock: 600, airAt: Date.now() - 120000, text: "" }] };
  const court = window.createCourt2D(host, { colors: ["#F26B1D", "#3B8FE0"], raster: false });
  court.update(S, []);
  await sleep(400);
  // Dernier lancer franc réussi de Gotham ; Rennes remettra en jeu.
  const ftAt = Date.now();
  S.events.push({ id: 1, team: 0, type: "ft", kind: "freeThrow", quarter: 2, clock: 400, made: 2, attempts: 2, airAt: ftAt, text: "2/2 aux lancers francs.", actors: { shooter: "Gotham:0" } });
  S.teams[0].score = 2;
  S.nextAction = withSub
    ? { kind: "substitution", team: 1, airAt: ftAt + 400, actors: {} }
    : { kind: "shot", team: 1, zone: "mid", airAt: ftAt + 20000, shot: { x: 20, y: 20 }, actors: { shooter: "Rennes:0" } };
  court.update(S, [1]);
  const log = [];
  let subSent = false, heldSeen = false, inboundAt = null, queuedAtInbound = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    await sleep(40);
    if (withSub && !subSent && Date.now() >= ftAt + 400) {
      subSent = true;
      S.teams[1].players[2].onCourt = false; S.teams[1].players[7].onCourt = true;
      S.events.push({ id: 2, team: 1, type: "sub", kind: "substitution", quarter: 2, clock: 400, airAt: ftAt + 400, text: "Rennes Joueur7 remplace Rennes Joueur2.", actors: { player: "Rennes:2", replacement: "Rennes:7" } });
      S.nextAction = { kind: "shot", team: 1, zone: "mid", airAt: ftAt + 20000, shot: { x: 20, y: 20 }, actors: { shooter: "Rennes:0" } };
      court.update(S, [2]);
    }
    const d = court.debug();
    if (d.inboundHeld) heldSeen = true;
    if (inboundAt === null && d.inbounds > 0) { inboundAt = Date.now() - ftAt; queuedAtInbound = d.queued; }
    if (inboundAt !== null && Date.now() - ftAt > inboundAt + 300) break;
  }
  court.destroy && court.destroy();
  return { heldSeen, inboundAt, queuedAtInbound };
}

(async () => {
  const plain = await scenario(false);
  if (plain.inboundAt === null) fail("lancer franc réussi sans changement : la remise en jeu doit avoir lieu.");
  if (plain.heldSeen) fail("sans changement à venir, la remise en jeu n'attend pas.");
  ok(`Lancer franc réussi sans changement : remise en jeu immédiate (${plain.inboundAt} ms après le lancer).`);

  const sub = await scenario(true);
  if (!sub.heldSeen) fail("changement annoncé après le lancer : la remise en jeu doit attendre.");
  if (sub.inboundAt === null) fail("la remise en jeu doit avoir lieu une fois le changement fait.");
  if (sub.queuedAtInbound !== 0) fail(`le changement doit être joué AVANT la remise en jeu (encore ${sub.queuedAtInbound} en file).`);
  if (!(sub.inboundAt > plain.inboundAt)) fail(`la remise en jeu doit venir après le changement (${sub.inboundAt} ms contre ${plain.inboundAt} ms).`);
  ok(`Lancer franc réussi puis changement : le changement est joué d'abord, la remise en jeu suit (${sub.inboundAt} ms après le lancer).`);
  // Deux lancers, un événement chacun (moteur 2026-10-09), changement ENTRE
  // les deux : après le 1er (manqué), le tireur garde le ballon sur la ligne,
  // pas de remise en jeu ni de rebond ; le changement se fait, puis le 2e.
  {
    const host = window.document.createElement("div");
    window.document.body.appendChild(host);
    const S = { status: "live", quarter: 2, clock: 400, possession: 0,
      teams: [mkTeam("Gotham", 10), mkTeam("Rennes", 10)], shots: [], referees: [0, 1, 2].map(i => ({ id: "ref" + i })),
      events: [{ id: 0, kind: "tipoff", type: "period", quarter: 1, clock: 600, airAt: Date.now() - 120000, text: "" }] };
    const court = window.createCourt2D(host, { colors: ["#F26B1D", "#3B8FE0"], raster: false });
    court.update(S, []);
    await sleep(400);
    const t1 = Date.now();
    S.events.push({ id: 1, team: 0, type: "ft", kind: "freeThrow", quarter: 2, clock: 400, made: 0, attempts: 1, attempt: 1, of: 2, possessionAfter: 0, airAt: t1, text: "1er lancer manqué.", actors: { shooter: "Gotham:3" } });
    S.nextAction = { kind: "substitution", team: 1, airAt: t1 + 2600, actors: {} };
    court.update(S, [1]);
    await sleep(3000);
    const d1 = court.debug();
    if (d1.holder !== "Gotham:3") fail(`entre deux lancers, le tireur garde le ballon sur la ligne (porteur ${d1.holder}).`);
    if (d1.inbounds !== 0) fail("pas de remise en jeu entre deux lancers.");
    S.teams[1].players[2].onCourt = false; S.teams[1].players[7].onCourt = true;
    S.events.push({ id: 2, team: 1, type: "sub", kind: "substitution", quarter: 2, clock: 400, airAt: Date.now(), text: "Rennes Joueur7 remplace Rennes Joueur2.", actors: { player: "Rennes:2", replacement: "Rennes:7" } });
    const t2 = Date.now() + 2200;
    S.nextAction = { kind: "freeThrow", team: 0, airAt: t2, actors: { shooter: "Gotham:3" } };
    court.update(S, [2]);
    await sleep(2400);
    if (!host.querySelector('.c2d-p[data-id="Rennes:7"]')) fail("le remplaçant est entré entre les deux lancers.");
    S.events.push({ id: 3, team: 0, type: "ft", kind: "freeThrow", quarter: 2, clock: 400, made: 1, attempts: 1, attempt: 2, of: 2, possessionAfter: 1, airAt: t2, text: "2e lancer réussi.", actors: { shooter: "Gotham:3" } });
    S.teams[0].score = 1;
    S.nextAction = { kind: "shot", team: 1, zone: "mid", airAt: Date.now() + 20000, shot: { x: 20, y: 20 }, actors: { shooter: "Rennes:0" } };
    court.update(S, [3]);
    const t0 = Date.now();
    while (Date.now() - t0 < 6000 && court.debug().inbounds === 0) await sleep(50);
    if (court.debug().inbounds !== 1) fail("après le 2e lancer réussi, remise en jeu de l'adversaire.");
    ok("Deux lancers : le tireur garde le ballon sur la ligne, changement entre les deux lancers, remise en jeu après le dernier.");
  }
  console.log("\n🏁 live_court2d_sub_inbound_test.js : changement avant la remise en jeu.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
