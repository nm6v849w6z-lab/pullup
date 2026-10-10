// Tunnels des vestiaires du direct 2D (mission live 2026-10-10 : « les
// joueurs, les pompom girls, la mascotte et les lanceurs de t-shirts
// apparaissent directement sur le terrain, comme téléportés ») :
//   - deux vrais accès dessinés dans l'arène (couloir + toit + linteau
//     « VESTIAIRES »), aux coins du bas, hors du terrain, à l'écart des bancs
//     et de la table ;
//   - entrée des joueurs : chacun attend DANS son tunnel (sous le toit, en
//     file), passe par le dégagement puis gagne le terrain — jamais une
//     apparition sur le parquet, jamais un saut de position (téléportation) ;
//   - mi-temps : retour aux vestiaires par le tunnel ; reprise : sortie du
//     tunnel ; coachs idem ;
//   - la route ne traverse ni les tribunes, ni les bancs, ni la table.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dom = new JSDOM(`<!doctype html><div id="host"></div>`, { pretendToBeVisual: true, runScripts: "outside-only" });
const { window } = dom;
const strip = src => src.replace(/^import .*$/mg, "").replace(/^export\s+(function|const|let|class)/mg, "$1").replace(/^export\s*\{[^}]*\};?/mg, "");
window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/format.js"), "utf8")));
window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8")));
window.eval("window.__staging = (function(){" + strip(fs.readFileSync(path.join(__dirname, "assets/live/characters.js"), "utf8")) + "; const mascotSvg = mascot;" + strip(fs.readFileSync(path.join(__dirname, "assets/live/showfx.js"), "utf8")) + ";" +
  strip(fs.readFileSync(path.join(__dirname, "assets/live/staging.js"), "utf8")) + "; return { createStaging, showFor, SHOW_FOR, CHOREOS, INTRO_MS }; })();");
const avatar = id => `<svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" data-avatar="${id}"><circle cx="60" cy="60" r="40"/></svg>`;
const POS = ["M", "AS", "A", "AF", "P"];
const mkTeam = (key, color) => ({ name: key, short: key.slice(0, 3).toUpperCase(), score: 0, color,
  players: [0, 1, 2, 3, 4].map(i => ({ id: key + ":#" + i, name: key + " J" + i, pos: POS[i], onCourt: true, starter: true, avatar: avatar(key + i), number: 10 + i, pf: 0 })) });
// Zones interdites au passage (pieds) : tribunes du bas hors tunnels, bancs (sièges), table.
const ROOF_Y = 60.8, MOUTH_Y = 59.8;
const inTunnelX = x => Math.abs(x + 2) <= 3.4 || Math.abs(x - 96) <= 3.4;
const forbidden = (x, y) => {
  if (y > 61.5 && !inTunnelX(x)) return "tribunes";
  if (y > 57.6 && y < 60.4 && ((x > 4.2 && x < 34.8) || (x > 59.2 && x < 89.8))) return "sièges du banc";
  if (x > 37.2 && x < 56.8 && y > 51.2 && y < 55.2) return "table de marque";
  return null;
};

(async () => {
  const STG = window.__staging;
  let NOW = 1_800_000_000_000;
  const S = { status: "pregame", quarter: 1, clock: 600, possession: null, events: [], shots: [], kickoffAt: NOW + 31000,
    referees: [0, 1, 2].map(i => ({ id: "ref" + i, avatar: avatar("ref" + i) })), teams: [mkTeam("Krakens", "#d6473f"), mkTeam("Rennes", "#2f7fd8")] };
  const cfg = { coach: true, playerIntro: true, shows: true, coaches: [avatar("c0"), avatar("c1")], homeColors: ["#d6473f", "#ffd34d"], homeShort: "KRA", mascot: null };
  const host = window.document.getElementById("host");
  const court = window.createCourt2D(host, { raster: false, now: () => NOW, staging: () => cfg, stagingModule: STG });
  const ids = S.teams.flatMap(t => t.players.map(p => p.id));
  const posAll = () => { const L = court.test.layout().sprites; return Object.fromEntries(ids.map(id => [id, L[id] ? { x: L[id].sx, y: L[id].sy } : null])); };
  // Avance simulée : l'horloge du direct suit l'horloge réelle (images à 60 i/s).
  const run = async (ms, sample) => { const t0 = Date.now(), n0 = NOW; while (Date.now() - t0 < ms) { NOW = n0 + (Date.now() - t0); court.update(S, []); await sleep(40); if (sample) sample(); } };

  // 1. Décor.
  const tunnels = host.querySelectorAll(".c2d-tunnel"), roofs = host.querySelectorAll(".c2d-tunnel-roof");
  court.update(S, []); await sleep(200);
  const labs = [...host.querySelectorAll(".c2d-tunnel-lab")].map(t => t.textContent);
  if (host.querySelectorAll(".c2d-tunnel").length !== 2 || host.querySelectorAll(".c2d-tunnel-roof").length !== 2 || labs.join() !== "VESTIAIRES,VESTIAIRES") fail(`deux tunnels (couloir + toit + linteau) attendus, obtenu ${host.querySelectorAll(".c2d-tunnel").length} / ${labs}`);
  ok("Décor : deux tunnels des vestiaires (couloir, toit, linteau « VESTIAIRES ») dans les coins du bas de l'arène.");

  // 2. Entrée des joueurs : 30 s avant le coup d'envoi.
  NOW = S.kickoffAt - 30000 + 50; court.update(S, []); await sleep(120);
  let P = posAll();
  const hiddenAtStart = ids.filter(id => P[id] && P[id].y > ROOF_Y && inTunnelX(P[id].x));
  if (hiddenAtStart.length !== 10) fail(`au début de l'entrée, les 10 joueurs attendent dans les tunnels, sous le toit (${hiddenAtStart.length}) ${JSON.stringify(P)}`);
  const side = id => (id.startsWith("Krakens") ? 0 : 1);
  if (!ids.every(id => (side(id) === 0 ? P[id].x < 5 : P[id].x > 89))) fail("chaque équipe dans le tunnel de son côté (domicile à gauche)");
  ok("Avant la sortie : chaque joueur attend dans le tunnel de son équipe, caché sous le toit (rien sur le parquet).");
  let prev = P, maxJump = 0, crossed = null;
  const passedMouth = new Set();
  await run(9000, () => {
    const Q = posAll();
    for (const id of ids) {
      const a = prev[id], b = Q[id]; if (!a || !b) continue;
      maxJump = Math.max(maxJump, Math.hypot(b.x - a.x, b.y - a.y));
      const why = forbidden(b.x, b.y); if (why && !crossed) crossed = `${id} @ ${b.x.toFixed(1)},${b.y.toFixed(1)} : ${why}`;
      if (b.y < MOUTH_Y + 0.5 && a.y >= MOUTH_Y - 0.5 && inTunnelX(a.x)) passedMouth.add(id);
    }
    prev = Q;
  });
  if (crossed) fail("trajet interdit pendant l'entrée : " + crossed);
  if (maxJump > 2.2) fail(`téléportation pendant l'entrée : saut de ${maxJump.toFixed(2)} pieds entre deux images`);
  P = posAll();
  const onFloor = ids.filter(id => P[id].y < 50);
  if (onFloor.length !== 10 || passedMouth.size !== 10) fail(`les 10 joueurs doivent être sortis par l'embouchure et sur le terrain (${onFloor.length} sur le terrain, ${passedMouth.size} par l'embouchure)`);
  ok(`Entrée : les 10 joueurs sortent du tunnel par l'embouchure, traversent le dégagement et gagnent le terrain — déplacements continus (pas max ${maxJump.toFixed(2)} pied/image), jamais par les tribunes, les bancs ni la table.`);

  // 3. Mi-temps : retour aux vestiaires, puis reprise.
  S.status = "live"; S.kickoffAt = NOW - 1500000; S.quarter = 2;
  S.events = [{ id: 1, kind: "tipoff", type: "period", quarter: 1, clock: 600, team: 0 }];
  court.update(S, [1]); await sleep(300);
  S.status = "halftime"; S.stoppage = { kind: "halftime", quarter: 2, startAt: NOW, endsAt: NOW + 120000 };
  prev = posAll(); maxJump = 0; crossed = null;
  await run(7000, () => { const Q = posAll(); for (const id of ids) { const a = prev[id], b = Q[id]; if (!a || !b) continue; maxJump = Math.max(maxJump, Math.hypot(b.x - a.x, b.y - a.y)); const why = forbidden(b.x, b.y); if (why && !crossed) crossed = `${id} : ${why}`; } prev = Q; });
  P = posAll();
  const inside = ids.filter(id => P[id].y > ROOF_Y && inTunnelX(P[id].x));
  if (inside.length !== 10) fail(`mi-temps : les joueurs rentrent aux vestiaires par leur tunnel (${inside.length}/10) ${JSON.stringify(P)}`);
  if (crossed) fail("trajet interdit vers les vestiaires : " + crossed);
  if (maxJump > 2.2) fail(`mi-temps : téléportation (${maxJump.toFixed(2)} pieds)`);
  const coach = court.debug().staging.coaches;
  if (!coach.every((c, t) => c && c.y > MOUTH_Y && (t === 0 ? c.x < 5 : c.x > 89))) fail("mi-temps : les coachs rentrent aussi aux vestiaires " + JSON.stringify(coach));
  ok("Mi-temps : joueurs et coachs rentrent aux vestiaires par LEUR tunnel, sans téléportation.");
  // Reprise (30 s avant la fin de la mi-temps) : sortie du tunnel.
  NOW = S.stoppage.endsAt - 30000; court.update(S, []); await sleep(80);
  prev = posAll(); maxJump = 0;
  await run(7000, () => { const Q = posAll(); for (const id of ids) { const a = prev[id], b = Q[id]; if (!a || !b) continue; maxJump = Math.max(maxJump, Math.hypot(b.x - a.x, b.y - a.y)); } prev = Q; });
  P = posAll();
  if (ids.filter(id => P[id].y < 50).length !== 10) fail("reprise : les joueurs ressortent du tunnel et regagnent le terrain " + JSON.stringify(P));
  if (maxJump > 2.2) fail(`reprise : téléportation (${maxJump.toFixed(2)} pieds)`);
  ok("Reprise : sortie des tunnels et retour sur le terrain, en continu.");
  court.destroy();
  console.log("\n🏁 live_tunnel_access_test.js : entrées et sorties par de vrais tunnels, jamais de téléportation.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
