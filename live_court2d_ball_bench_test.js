// Direct 2D (demande du 2026-10-08) :
//  4. Après un tir raté, le ballon ne s'arrête plus net au sol : il
//     rebondit (rebonds décroissants), garde une partie de sa vitesse,
//     roule puis est pris par le rebondeur.
//  5. Temps mort : les remplaçants se lèvent, rejoignent le regroupement
//     autour du coach (demi-cercle derrière les cinq), sans se superposer,
//     puis retournent à leur place sur le banc à la fin.
//  + encre de la pub du parquet adaptée au bois (clair / foncé) ;
//  + panneaux LED : textes découpés à leur panneau, resserrés si longs.
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

const avatar = id => `<span class="player-avatar"><svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" data-avatar="${id}"><circle cx="60" cy="60" r="40"/></svg></span>`;
const POS = ["M", "AS", "A", "AF", "P"];
const mkTeam = (key, n) => ({ name: key, short: key.slice(0, 3).toUpperCase(), score: 0, color: key === "Gotham" ? "#F26B1D" : "#3B8FE0",
  players: Array.from({ length: n }, (_, i) => ({ id: key + ":" + i, name: key + " Joueur" + i, pos: POS[i % 5], onCourt: i < 5, avatar: avatar(key + i), pts: 0, reb: 0, ast: 0, number: 4 + i, fatigue: 10, pf: 0 })) });

(async () => {
  // ---------- Pub du parquet ----------
  const ink = window.floorAdInk;
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const contrast = (floor, rgba) => {
    const bg = [1, 3, 5].map(i => parseInt(floor.slice(i, i + 2), 16));
    const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(rgba); const a = +m[4], c = [+m[1], +m[2], +m[3]].map((v, i) => v * a + bg[i] * (1 - a));
    const x = lum(c), y = lum(bg); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const floors = { "nuit (#131d33)": "#131d33", "ardoise (#2b2f36)": "#2b2f36", "noyer foncé (#5b3a24)": "#5b3a24", "chêne (#a5703f)": "#a5703f", "érable clair (#d9a86b)": "#d9a86b", "bois du jeu (#cf9a55)": "#cf9a55", "très clair (#efe3c8)": "#efe3c8" };
  const res = [];
  for (const [label, f] of Object.entries(floors)) {
    const c = contrast(f, ink(f));
    if (c < 1.84) fail(`pub du parquet peu lisible sur ${label} : contraste ${c.toFixed(2)} (${ink(f)}).`);
    res.push(`${label.split(" (")[0]} ${c.toFixed(2)}`);
  }
  if (!/^rgba\(255/.test(ink("#131d33")) || !/^rgba\(60/.test(ink("#d9a86b"))) fail("encre claire sur parquet foncé, sombre sur bois clair.");
  ok(`Pub du parquet : encre adaptée (claire sur parquet foncé, sombre sur bois clair), contraste ≥ 1,85 partout — ${res.join(", ")}.`);

  // ---------- Terrain ----------
  const NOW = () => Date.now();
  const S = { status: "live", quarter: 2, clock: 400, possession: 0,
    teams: [mkTeam("Gotham", 12), mkTeam("Rennes", 10)], shots: [], referees: [0, 1, 2].map(i => ({ id: "ref" + i })),
    events: [{ id: 0, kind: "tipoff", type: "period", quarter: 1, clock: 600, airAt: NOW() - 120000, text: "" }],
    arena: { boards: ["OLYMPIQUE SAINT-GERMAIN-EN-LAYE BASKET CLUB", "HOOP MANAGER"] },
    courtStyle: { floor: "#131d33", grain: "#16223b", line: "rgba(245,161,58,.28)", paint: null }, arenaSponsor: "Pull Up Energy" };
  const host = window.document.getElementById("host");
  const court = window.createCourt2D(host, { colors: ["#F26B1D", "#3B8FE0"], raster: false });
  court.update(S, []);
  await sleep(300);

  const adFill = host.querySelector(".c2d-ad").style.fill;
  if (!/^rgba\(255, ?246, ?232/.test(adFill)) fail(`direct 2D, parquet foncé : encre claire attendue pour la pub, obtenu ${adFill}.`);
  ok(`Direct 2D, parquet « Nuit » : pub peinte en encre claire (${adFill}).`);

  // Panneaux LED : chaque texte dans un groupe découpé à SON panneau, resserré s'il est trop long.
  const led = host.querySelector(".c2d-led");
  const groups = [...led.querySelectorAll("g[clip-path]")];
  if (groups.length !== 4) fail(`4 panneaux LED découpés attendus, obtenu ${groups.length}.`);
  let squeezed = 0;
  for (const g of groups) {
    const id = /url\(#([^)]+)\)/.exec(g.getAttribute("clip-path"))[1];
    const r = led.querySelector(`clipPath[id="${id}"] rect`);
    const R = { x: +r.getAttribute("x"), y: +r.getAttribute("y"), w: +r.getAttribute("width"), h: +r.getAttribute("height") };
    for (const t of g.querySelectorAll("text")) {
      const x = +t.getAttribute("x"), y = +t.getAttribute("y"), vertical = !!t.getAttribute("transform");
      const half = (t.getAttribute("textLength") ? +t.getAttribute("textLength") : t.textContent.length * 8.4) / 2;
      const along = vertical ? [y - half, y + half] : [x - half, x + half], lo = vertical ? R.y : R.x, hi = vertical ? R.y + R.h : R.x + R.w;
      if (along[0] < lo - 0.5 || along[1] > hi + 0.5) fail(`panneau LED : « ${t.textContent} » déborde de son panneau (${along.map(v => v.toFixed(0))} hors ${lo}–${hi}).`);
      if (t.getAttribute("textLength")) squeezed++;
    }
  }
  if (!squeezed) fail("un nom très long doit être resserré dans son emplacement.");
  ok(`Panneaux LED (4 coins) : chaque texte reste dans son panneau (découpe + emplacements), ${squeezed} nom(s) long(s) resserré(s).`);

  // ---------- 4. Ballon après un tir raté ----------
  let id = 1;
  const ev = o => { const e = { id: id++, quarter: 2, clock: 390, text: "", airAt: Date.now(), ...o }; S.events.push(e); return e; };
  const shooter = "Gotham:1", reb = "Rennes:4";
  court.test.give("Gotham:0");
  await sleep(300);
  const track = [];
  let tracking = true;
  const loop = t => { if (!tracking) return; track.push({ t, ...court.test.ball() }); window.requestAnimationFrame(loop); };
  window.requestAnimationFrame(loop);
  const miss = ev({ team: 0, type: "miss", kind: "shot", made: false, zone: "mid", shot: { x: 76, y: 18 }, possessionTeam: 0, possessionAfter: 1, actors: { shooter } });
  // le rebond suit (le moteur désigne le rebondeur de l'autre équipe)
  court.update(S, [miss.id]);
  await sleep(2600);
  S.possession = 1;
  const rbE = ev({ team: 1, type: "miss", kind: "rebound", offensive: false, possessionTeam: 0, possessionAfter: 1, actors: { rebounder: reb } });
  court.update(S, [rbE.id]);
  await sleep(3200);
  tracking = false;
  // Phase libre : entre la fin du dernier vol et la prise par un joueur.
  const free = track.filter(p => p.loose);
  if (free.length < 8) fail(`après le tir raté, le ballon doit rester libre un moment (rebonds, roulement), obtenu ${free.length} images.`);
  let contacts = 0, rises = 0;
  for (let k = 1; k < free.length; k++) { if (free[k - 1].z > 0.05 && free[k].z <= 0.001) contacts++; if (free[k].z > free[k - 1].z + 0.01 && free[k - 1].z <= 0.001) rises++; }
  const peaks = []; for (let k = 1; k < free.length - 1; k++) if (free[k].z > 0.05 && free[k].z >= free[k - 1].z && free[k].z >= free[k + 1].z) peaks.push(free[k].z);
  const moved = Math.hypot(free[free.length - 1].x - free[0].x, free[free.length - 1].y - free[0].y);
  if (rises < 2 || peaks.length < 2) fail(`le ballon doit rebondir au sol (rebonds : ${rises}, sommets : ${peaks.map(p => p.toFixed(2))}).`);
  if (peaks.length > 1 && !(peaks[1] < peaks[0])) fail(`les rebonds doivent diminuer (${peaks.map(p => p.toFixed(2))}).`);
  if (moved < 0.8) fail(`le ballon doit garder de la vitesse et continuer sa trajectoire au sol (déplacement ${moved.toFixed(2)} pied).`);
  // Pas d'arrêt instantané : vitesse horizontale juste après le premier contact.
  const first = free.findIndex((p, k) => k > 0 && free[k - 1].z > 0.05 && p.z <= 0.001) ;
  const after = free.slice(Math.max(0, first), Math.max(0, first) + 3);
  const v = after.length >= 2 ? Math.hypot(after[1].x - after[0].x, after[1].y - after[0].y) / ((after[1].t - after[0].t) / 1000) : Infinity;
  if (!(v > 2)) fail(`au premier contact avec le sol, le ballon ne doit pas s'arrêter net (vitesse ${v.toFixed(2)} pieds/s).`);
  const d = court.debug();
  if (d.holder !== reb) fail(`le rebondeur du moteur prend le ballon à la fin (porteur ${d.holder}).`);
  ok(`Tir raté : ballon libre ${free.length} images, ${rises} rebond(s) (sommets ${peaks.slice(0, 3).map(p => p.toFixed(2)).join(" > ")}), ${v.toFixed(1)} pieds/s au contact, ${moved.toFixed(1)} pieds parcourus au sol, pris par le rebondeur.`);

  // ---------- 5. Temps mort : remplaçants autour du coach ----------
  const t0 = Date.now();
  S.stoppage = { kind: "timeout", team: 0, quarter: 2, startAt: t0, endsAt: t0 + 12000 };
  const to = ev({ team: 0, type: "timeout", kind: "timeout", durationMs: 12000, actors: {} });
  court.update(S, [to.id]);
  const seats0 = court.test.bench();
  if (seats0.some(b => Math.hypot(b.x - b.seat.x, b.y - b.seat.y) > 0.05)) fail("avant le coup de sifflet, les remplaçants sont assis.");
  await sleep(4500);
  court.update(S, []);
  const bench = court.test.bench(), lay = court.test.layout().sprites;
  for (const t of [0, 1]) {
    const mine = bench.filter(b => b.team === t && !b.out);
    if (!mine.length) fail(`équipe ${t} : des remplaçants attendus.`);
    for (const b of mine) {
      const h = court.test.huddle(t, b.rank, mine.length, 1);
      if (Math.hypot(b.x - h.x, b.y - h.y) > 0.6) fail(`temps mort : ${b.id} doit avoir rejoint le regroupement (à ${Math.hypot(b.x - h.x, b.y - h.y).toFixed(1)} pied de sa place).`);
      if (Math.hypot(b.x - b.seat.x, b.y - b.seat.y) < 3) fail(`temps mort : ${b.id} doit s'être levé et avoir quitté le banc.`);
    }
    // Les cinq en jeu en demi-cercle serré, les remplaçants derrière : personne superposé.
    const five = S.teams[t].players.filter(p => p.onCourt).map(p => lay[p.id]).map(q => ({ x: q.sx, y: q.sy }));
    const pts = [...five, ...mine.map(b => ({ x: b.x, y: b.y }))];
    let minD = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) minD = Math.min(minD, Math.hypot(pts[i].x - pts[j].x, (pts[i].y - pts[j].y) * 0.8));
    if (minD < 2.4) fail(`temps mort, équipe ${t} : deux joueurs se superposent (écart mini ${minD.toFixed(2)} pied).`);
    const cx = court.test.huddle(t, 0, 1, 1).x, ring0 = five.every(p => Math.hypot(p.x - cx, p.y - 55) < 7.5), ring1 = mine.every(b => Math.hypot(b.x - cx, b.y - 55) > 8.5);
    if (!ring0 || !ring1) fail(`temps mort, équipe ${t} : les cinq autour du coach, les remplaçants en demi-cercle derrière eux.`);
  }
  ok(`Temps mort : ${bench.filter(b => !b.out).length} remplaçants levés, regroupés en demi-cercle derrière les cinq autour du coach, sans superposition.`);
  // Fin du temps mort : retour au banc.
  S.stoppage.endsAt = Date.now() + 300;
  await sleep(3800);
  S.stoppage = null; court.update(S, []);
  await sleep(300);
  const back = court.test.bench();
  if (back.some(b => Math.hypot(b.x - b.seat.x, b.y - b.seat.y) > 0.3)) fail(`fin du temps mort : chacun retourne à sa place sur le banc (${back.map(b => Math.hypot(b.x - b.seat.x, b.y - b.seat.y).toFixed(1)).join(",")}).`);
  ok("Fin du temps mort : les remplaçants regagnent leur place sur le banc.");

  // Changement pendant un temps mort : le remplaçant debout ne se téléporte pas sur sa chaise.
  const t1 = Date.now();
  S.stoppage = { kind: "timeout", team: 1, quarter: 2, startAt: t1 - 1000, endsAt: t1 + 15000 };
  court.update(S, []);
  await sleep(3500);
  const standing = court.test.bench().find(b => b.team === 0 && !b.out);
  const outId = S.teams[0].players.find(p => p.onCourt && p.id !== "Gotham:0").id;
  S.teams[0].players.find(p => p.id === outId).onCourt = false;
  S.teams[0].players.find(p => p.id === "Gotham:11").onCourt = true;
  court.update(S, []);
  const after2 = court.test.bench().find(b => b.id === standing.id);
  if (after2 && Math.hypot(after2.x - standing.x, after2.y - standing.y) > 1.5) fail("changement pendant le temps mort : le banc est redessiné sans faire sauter les remplaçants debout.");
  ok("Changement pendant le temps mort : banc redessiné, les remplaçants debout restent où ils sont.");

  court.destroy();
  console.log("Ballon libre, temps morts, pub et panneaux : tout est vert.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
