// Direct 2D : fluidité (demande du 2026-10-08, « améliorer fortement la
// fluidité »). Le rendu interpole vers les cibles fixées par la scène :
//  - un joueur accélère, tourne en arc et freine (jamais de saut de vitesse
//    ni de téléportation), s'arrête pile sur sa cible ;
//  - les dix joueurs ne changent plus de cible à la même image ;
//  - le ballon ne saute jamais (changement de porteur sans passe : il glisse) ;
//  - un pas de temps anormal n'est jamais injecté (pas de rattrapage) ;
//  - une seule boucle de rendu, pas d'accumulation de minuteries, aucune
//    coordonnée NaN / Infinity ; diagnostic debug().perf disponible ;
//  - calques : décor statique, public et bancs hors du terrain animé.
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
let rafCalls = 0;
const rafOrig = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = fn => { rafCalls++; return rafOrig(fn); };

const avatar = id => `<span class="player-avatar"><svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" data-avatar="${id}"><circle cx="60" cy="60" r="40"/></svg></span>`;
const POS = ["M", "AS", "A", "AF", "P"];
const mkTeam = (key, names) => ({
  name: key, short: key.slice(0, 3).toUpperCase(), score: 0, color: key === "Gotham" ? "#F26B1D" : "#3B8FE0",
  players: names.map((n, i) => ({ id: key + ":" + n, name: n, pos: POS[i % 5], onCourt: i < 5, avatar: avatar(key + i), pts: 0, reb: 0, ast: 0, number: 4 + i, fatigue: 10, pf: 0 })),
});
const S = {
  status: "live", quarter: 2, clock: 400, possession: 0,
  teams: [mkTeam("Gotham", ["Ali Kane", "Ben Moro", "Cal Ito", "Dan Vidal", "Eli Nakamura", "Fab Roux", "Gus Lee"]),
          mkTeam("Rennes", ["Hal Novak", "Ian Brooks", "Jo Wright", "Kai Ferreira", "Leo Ramos", "Max Silva", "Ned Diallo"])],
  shots: [], events: [], referees: [0, 1, 2].map(i => ({ id: "ref" + i, avatar: avatar("ref" + i) })),
};

// Enregistre l'état du mouvement d'un jeton à chaque image.
function record(court, id, ms) {
  return new Promise(resolve => {
    const out = [];
    const t0 = window.performance.now();
    const loop = t => {
      const m = court.test.motion(id);
      out.push({ t, ...m });
      if (t - t0 < ms) window.requestAnimationFrame(loop); else resolve(out);
    };
    window.requestAnimationFrame(loop);
  });
}

(async () => {
  const host = window.document.getElementById("host");
  const court = window.createCourt2D(host, { colors: ["#F26B1D", "#3B8FE0"], raster: false });
  court.update(S, []);
  await sleep(300);

  // --- Calques ---
  const under = host.querySelector(".c2d-under");
  if (!under || !under.querySelector("svg.c2d-bgsvg") || !under.querySelector("svg.c2d-benchsvg") || !under.querySelector(".c2d-crowd")) fail("calques attendus sous le terrain animé : décor (c2d-bgsvg), public (c2d-crowd), bancs (c2d-benchsvg).");
  const top = host.querySelector("svg.c2d-svg");
  if (top.querySelector(".c2d-arena, .c2d-lines, .c2d-fans, .c2d-sub")) fail("le terrain animé ne doit plus contenir le décor, le public ni les bancs (repeints à chaque image avant).");
  if (!top.querySelector(".c2d-p") || !top.querySelector(".c2d-ball")) fail("joueurs et ballon restent dans le terrain animé.");
  if (under.querySelector("svg.c2d-bgsvg").getAttribute("viewBox") !== top.getAttribute("viewBox")) fail("décor et terrain animé partagent la même viewBox.");
  ok("Calques : décor statique, public (feuilles) et bancs sous le terrain animé, même repère.");

  // --- 1 joueur : accélération, vitesse plafonnée, freinage, arrivée ---
  const id = "Gotham:Cal Ito";
  court.test.placeAt(id, 20, 25);
  court.test.target(id, 70, 25, 1.4);       // 50 pieds, croisière 14 × 1,4 = 19,6 pieds/s
  const run = await record(court, id, 4200);
  const vmax = 14 * 1.4;
  let maxV = 0, maxDv = 0, maxStep = 0, nan = 0;
  for (let k = 1; k < run.length; k++) {
    const a = run[k - 1], b = run[k], dt = (b.t - a.t) / 1000;
    if (![b.x, b.y, b.vx, b.vy].every(Number.isFinite)) nan++;
    const v = Math.hypot(b.vx, b.vy); maxV = Math.max(maxV, v);
    // (l'image d'arrivée, où une vitesse résiduelle de quelques pieds/s
    // tombe à zéro sur quelques centièmes de pied, n'est pas un à-coup)
    const arrived = b.vx === 0 && b.vy === 0 && Math.hypot(b.tx - b.x, b.ty - b.y) < 0.01 && Math.hypot(a.vx, a.vy) < 4;
    if (dt > 0 && !arrived) maxDv = Math.max(maxDv, Math.hypot(b.vx - a.vx, b.vy - a.vy) / dt);
    if (dt > 0) maxStep = Math.max(maxStep, Math.hypot(b.x - a.x, b.y - a.y) / dt);
  }
  const first = run.find(r => Math.hypot(r.vx, r.vy) > 0);
  const end = run[run.length - 1];
  if (nan) fail(`coordonnées invalides (NaN / Infinity) : ${nan} images.`);
  if (!first || Math.hypot(first.vx, first.vy) > vmax * 0.35) fail(`départ : le joueur doit accélérer progressivement (première vitesse ${first && Math.hypot(first.vx, first.vy).toFixed(1)} pieds/s pour ${vmax} en croisière).`);
  if (maxV > vmax * 1.02 || maxStep > vmax * 1.1) fail(`vitesse de croisière dépassée : ${maxV.toFixed(1)} / ${maxStep.toFixed(1)} pieds/s (max ${vmax}).`);
  if (maxV < vmax * 0.9) fail(`la croisière doit être atteinte sur 50 pieds (obtenu ${maxV.toFixed(1)} pieds/s).`);
  if (maxDv > Math.max(40, vmax * 3.4) * 1.6 * 1.15) fail(`accélération trop brutale : ${maxDv.toFixed(0)} pieds/s².`);
  if (Math.abs(end.x - 70) > 0.05 || Math.abs(end.y - 25) > 0.05 || Math.hypot(end.vx, end.vy) > 0.01) fail(`arrivée : le joueur doit s'arrêter pile sur sa cible, obtenu (${end.x.toFixed(2)}, ${end.y.toFixed(2)}) à ${Math.hypot(end.vx, end.vy).toFixed(2)} pieds/s.`);
  const nearEnd = run.filter(r => Math.hypot(70 - r.x, 25 - r.y) < 1 && Math.hypot(70 - r.x, 25 - r.y) > 0.05);
  if (nearEnd.some(r => Math.hypot(r.vx, r.vy) > vmax * 0.8)) fail("freinage : à moins d'un pied de la cible, le joueur doit avoir ralenti.");
  ok(`1 joueur : départ progressif, croisière ${maxV.toFixed(1)} pieds/s (≤ ${vmax}), freinage, arrêt pile sur la cible ; accélération max ${maxDv.toFixed(0)} pieds/s².`);

  // --- Changement de direction en pleine course : virage en arc ---
  court.test.placeAt(id, 20, 10);
  court.test.target(id, 80, 10, 1.4);
  await sleep(900);
  const before = court.test.motion(id);
  court.test.target(id, 20, 40, 1.4);        // demi-tour vers l'arrière
  const turn = await record(court, id, 1200);
  let turnDv = 0;
  for (let k = 1; k < turn.length; k++) { const dt = (turn[k].t - turn[k - 1].t) / 1000; if (dt > 0) turnDv = Math.max(turnDv, Math.hypot(turn[k].vx - turn[k - 1].vx, turn[k].vy - turn[k - 1].vy) / dt); }
  if (!(before.vx > 10)) fail(`avant le virage, le joueur doit courir vers la droite (vx = ${before.vx.toFixed(1)}).`);
  if (turnDv > Math.max(40, vmax * 3.4) * 1.6 * 1.15) fail(`changement de direction trop sec : ${turnDv.toFixed(0)} pieds/s².`);
  const mid = turn[Math.floor(turn.length / 4)];
  if (!(mid.vx < before.vx)) fail("le virage doit être progressif (la vitesse vers la droite diminue d'abord).");
  ok(`Changement de direction : virage progressif (variation de vitesse max ${turnDv.toFixed(0)} pieds/s², jamais de demi-tour instantané).`);

  // --- 10 joueurs + 3 arbitres en mouvement simultané : tous continus ---
  const ids = [...S.teams[0].players, ...S.teams[1].players].filter(p => p.onCourt).map(p => p.id);
  ids.forEach((pid, i) => { court.test.placeAt(pid, 10 + i * 7, 8 + (i % 4) * 9); court.test.target(pid, 84 - i * 7, 42 - (i % 4) * 9, 1 + (i % 3) * 0.3); });
  ["ref0", "ref1", "ref2"].forEach((r, i) => court.test.target(r, 10 + i * 30, i % 2 ? 2.5 : 47.5, 1.2));
  const all = await Promise.all([...ids, "ref0", "ref1", "ref2"].map(pid => record(court, pid, 1500)));
  let worst = 0, bad = 0;
  all.forEach(rs => { for (let k = 1; k < rs.length; k++) { const dt = (rs[k].t - rs[k - 1].t) / 1000; if (!(dt > 0)) continue; const step = Math.hypot(rs[k].x - rs[k - 1].x, rs[k].y - rs[k - 1].y); worst = Math.max(worst, step / dt); if (![rs[k].x, rs[k].y].every(Number.isFinite)) bad++; } });
  if (bad) fail("coordonnées invalides pendant le mouvement simultané.");
  if (worst > 14 * 1.6 * 1.1) fail(`mouvement simultané : un jeton a sauté (${worst.toFixed(1)} pieds/s).`);
  if (!(court.debug().perf.animated >= 8)) fail(`diagnostic : le nombre d'éléments animés doit être suivi (obtenu ${court.debug().perf.animated}).`);
  ok(`10 joueurs + 3 arbitres en mouvement simultané : continus (vitesse max ${worst.toFixed(1)} pieds/s), ${court.debug().perf.animated} éléments animés suivis.`);

  // --- Rythmes désynchronisés (plus de changement de cible commun) ---
  ids.forEach(pid => court.test.placeAt(pid, 40, 25));
  await sleep(10500);   // fin du « busy » de placeAt (10 s)
  await sleep(3200);
  const drifts = new Set(ids.map(pid => Math.round(court.test.motion(pid).nextDrift / 50)));
  if (drifts.size < 5) fail(`les joueurs doivent avoir chacun leur rythme de déplacement (obtenu ${drifts.size} échéances distinctes pour 10).`);
  ok(`Jeu sans ballon : ${drifts.size} rythmes distincts pour 10 joueurs (plus de mouvement synchronisé).`);

  // --- Ballon : changement de porteur sans passe → glisse, ne saute pas ---
  const a = "Gotham:Ali Kane", b = "Gotham:Eli Nakamura";
  court.test.placeAt(a, 30, 10); court.test.placeAt(b, 60, 40);
  court.test.give(a);
  await sleep(400);
  const ballTrack = [];
  const trackBall = ms => new Promise(res => { const t0 = window.performance.now(); const loop = t => { ballTrack.push({ t, ...court.test.ball() }); if (t - t0 < ms) window.requestAnimationFrame(loop); else res(); }; window.requestAnimationFrame(loop); });
  const tr = trackBall(700);
  await sleep(50);
  court.test.give(b);                        // 42 pieds plus loin, sans vol
  await tr;
  let bStep = 0;
  for (let k = 1; k < ballTrack.length; k++) { const p = ballTrack[k - 1].shown, q = ballTrack[k].shown; if (p && q) bStep = Math.max(bStep, Math.hypot(q.x - p.x, q.y - p.y)); }
  const lastB = ballTrack[ballTrack.length - 1].shown;
  const bm = court.test.motion(b);
  if (bStep > 3) fail(`le ballon ne doit jamais se téléporter : saut de ${bStep.toFixed(1)} pieds en une image.`);
  if (Math.hypot(lastB.x - (bm.x + 2.2), lastB.y - (bm.y + 0.3)) > 1.5) fail("après le glissement, le ballon doit être dans les mains du nouveau porteur.");
  ok(`Ballon : changement de porteur à 42 pieds sans passe → glissement (plus grand pas ${bStep.toFixed(1)} pieds), puis dans les mains du porteur.`);

  // --- Pas de temps anormal : jamais injecté ---
  court.test.placeAt(id, 20, 25); court.test.target(id, 80, 25, 1.4);
  await sleep(500);
  const m0 = court.test.motion(id);
  court.test.advance(650);                    // image très tardive (navigateur ralenti)
  const m1 = court.test.motion(id);
  if (Math.hypot(m1.x - m0.x, m1.y - m0.y) > 14 * 1.4 * 0.05 + 0.01) fail(`image tardive : le déplacement doit être borné à 50 ms de mouvement, obtenu ${Math.hypot(m1.x - m0.x, m1.y - m0.y).toFixed(2)} pieds.`);
  ok("Image tardive (650 ms) : pas de temps borné à 50 ms, aucun rattrapage.");

  // --- Boucle unique, minuteries bornées, diagnostic ---
  rafCalls = 0; await sleep(1000);
  const perSec = rafCalls;
  if (perSec > 75) fail(`une seule boucle de rendu attendue (${perSec} rappels par seconde, test compris).`);
  const d = court.debug();
  if (d.pendingTimers > 40) fail(`minuteries accumulées : ${d.pendingTimers}.`);
  const p = d.perf;
  if (!p || !(p.frames > 0) || !(p.fps > 0) || typeof p.maxMs !== "number" || typeof p.spikes !== "number" || typeof p.workMs !== "number") fail(`diagnostic de fluidité incomplet : ${JSON.stringify(p)}.`);
  court.perfReset();
  if (court.debug().perf.frames !== 0) fail("perfReset doit remettre les compteurs à zéro.");
  ok(`Une seule boucle de rendu (${perSec} rappels/s), ${d.pendingTimers} minuteries ; diagnostic : ${p.fps} i/s, boucle ${p.workMs} ms, pics ${p.spikes}.`);

  court.destroy();
  console.log("Fluidité du direct 2D : tout est vert.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
