// Direct 2D (retour utilisateur 2026-10-09) : pendant toute interruption
// prolongée (temps mort, fin de quart-temps, mi-temps, fin de match), le
// ballon du match est tenu par un arbitre — jamais laissé à un joueur, au
// milieu des joueurs ni posé sur le parquet ; il revient au jeu à la reprise.
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
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

async function heldByRef(court, label, ms = 3500) {
  const t0 = Date.now(); let d = null;
  while (Date.now() - t0 < ms) {
    d = court.debug();
    if (d.keeper && !d.holder && dist(d.ball, d.keeper) < 2.5) return d;
    await sleep(60);
  }
  fail(`${label} : ballon tenu par l'arbitre attendu (porteur ${d && d.holder}, ballon ${d && d.ball}, arbitre ${d && d.keeper}).`);
}

(async () => {
  const host = window.document.getElementById("host");
  const S = { status: "live", quarter: 2, clock: 400, possession: 0,
    teams: [mkTeam("Gotham", 10), mkTeam("Rennes", 10)], shots: [], referees: [0, 1, 2].map(i => ({ id: "ref" + i })),
    events: [{ id: 0, kind: "tipoff", type: "period", quarter: 1, clock: 600, airAt: Date.now() - 120000, text: "" }] };
  const court = window.createCourt2D(host, { colors: ["#F26B1D", "#3B8FE0"], raster: false });
  court.update(S, []);
  await sleep(1200);
  const d0 = court.debug();
  if (!d0.holder || d0.keeper) fail(`en jeu : un joueur a le ballon, pas l'arbitre (porteur ${d0.holder}, arbitre ${d0.keeper}).`);
  ok(`En jeu : ballon au joueur ${d0.holder}.`);

  // Temps mort (60 s côté moteur).
  const t1 = Date.now();
  S.stoppage = { kind: "timeout", team: 0, startAt: t1, endsAt: t1 + 6000 };
  S.events.push({ id: 1, team: 0, type: "timeout", kind: "timeout", quarter: 2, clock: 400, airAt: t1, durationMs: 6000, text: "Temps mort." });
  court.update(S, [1]);
  let d = await heldByRef(court, "temps mort");
  ok(`Temps mort : ballon dans les mains de l'arbitre (${d.ball} ≈ ${d.keeper}), aucun joueur ne le tient.`);
  await sleep(2500);
  d = court.debug();
  if (d.holder || dist(d.ball, d.keeper) > 2.5) fail("pendant tout le temps mort, le ballon reste à l'arbitre.");
  ok("Il le garde pendant tout le temps mort.");
  // Reprise : un joueur de l'équipe qui a la possession récupère le ballon.
  await sleep(4000);
  S.stoppage = null;
  court.update(S, []);
  const t2 = Date.now();
  while (Date.now() - t2 < 4000 && !court.debug().holder) await sleep(80);
  d = court.debug();
  if (!d.holder || d.keeper) fail(`à la reprise, le ballon revient au jeu (porteur ${d.holder}).`);
  ok(`Reprise : ballon rendu au jeu (${d.holder}).`);

  // Fin de quart-temps.
  S.stoppage = { kind: "quarter-break", quarter: 2, startAt: Date.now(), endsAt: Date.now() + 120000 };
  S.events.push({ id: 2, kind: "quarterEnd", type: "period", quarter: 2, clock: 0, airAt: Date.now(), text: "Fin du quart-temps." });
  court.update(S, [2]);
  d = await heldByRef(court, "fin de quart-temps");
  ok("Fin de quart-temps : ballon tenu par l'arbitre.");

  // Mi-temps (statut du direct) : parquet vidé, le ballon est parti avec
  // les arbitres — jamais laissé au rond central.
  S.status = "halftime";
  court.update(S, []);
  await sleep(800);
  const op = host.querySelector(".c2d-ball") && host.querySelector(".c2d-ball").getAttribute("opacity");
  d = court.debug();
  if (op !== "0" || d.holder) fail(`mi-temps : ballon retiré du parquet (opacité ${op}, porteur ${d.holder}).`);
  ok("Mi-temps : ballon retiré du parquet avec les arbitres (plus jamais posé au rond central).");

  // Pause sans arbitre à l'écran (direct sans arbitres) : ballon masqué.
  const host2 = window.document.createElement("div"); window.document.body.appendChild(host2);
  const S2 = { ...S, status: "live", referees: null, stoppage: { kind: "timeout", team: 0, startAt: Date.now(), endsAt: Date.now() + 8000 } };
  const c2 = window.createCourt2D(host2, { colors: ["#F26B1D", "#3B8FE0"], raster: false });
  c2.update(S2, []);
  await sleep(600);
  if (host2.querySelector(".c2d-ball").getAttribute("opacity") !== "0") fail("pause sans arbitre : ballon masqué, jamais posé au sol.");
  ok("Pause sans arbitre à l'écran : ballon masqué, jamais posé au sol.");
  c2.destroy && c2.destroy();

  court.destroy && court.destroy();
  console.log("\n🏁 live_court2d_ref_ball_test.js : le ballon est confié à l'arbitre pendant les pauses.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
