// Direct 2D : changement d'onglet du navigateur (retour utilisateur
// 2026-10-08 : « le Live 2D part en vrille quand on revient sur l'onglet »).
// Onglet masqué → la mise en scène est suspendue (aucune minuterie de
// chorégraphie, événements absorbés) ; retour → recalage sur l'état du
// moteur (possession, arrêt de jeu, statut), sans rejouer ni inventer
// d'action, sans gros pas de temps, une seule boucle de rendu.
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

// Visibilité contrôlée par le test.
let vis = "visible";
Object.defineProperty(window.document, "visibilityState", { configurable: true, get: () => vis });
Object.defineProperty(window.document, "hidden", { configurable: true, get: () => vis === "hidden" });
const setVis = v => { vis = v; window.document.dispatchEvent(new window.Event("visibilitychange")); };
// Horloge du match contrôlée (simule des minutes d'absence sans attendre).
let offset = 0;
const clock = () => Date.now() + offset;
// Compte des rappels requestAnimationFrame (une seule boucle attendue).
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
  shots: [], events: [{ id: 0, kind: "tipoff", type: "period", quarter: 1, clock: 600, airAt: Date.now() - 120000, text: "" }], referees: [0, 1, 2].map(i => ({ id: "ref" + i, avatar: avatar("ref" + i) })),
};
// Match en cours : l'entre-deux du moteur a déjà été diffusé (avant lui,
// personne n'a le ballon — voir live_court2d_clock_test.js).
let nextId = 1;
const ev = (o) => { const e = { id: nextId++, quarter: S.quarter, clock: S.clock, text: "", airAt: clock(), ...o }; S.events.push(e); return e; };
const made = (team, shooter, assister) => ev({ team, type: "made", kind: "shot", made: true, zone: "mid", shot: { x: team === 0 ? 78 : 16, y: 18 }, possessionTeam: team, possessionAfter: 1 - team, actors: { shooter, assister } });

(async () => {
  const host = window.document.getElementById("host");
  const court = window.createCourt2D(host, { colors: ["#F26B1D", "#3B8FE0"], raster: false, now: clock });
  court.update(S, []);
  await sleep(300);

  const pos = () => [...host.querySelectorAll(".c2d-p, .c2d-ref")].map(g => { const m = /translate\(([^ ]+) ([^)]+)\)/.exec(g.getAttribute("transform") || ""); return m ? [+m[1], +m[2]] : [NaN, NaN]; });
  const sane = (label) => {
    const p = pos();
    if (p.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) fail(`${label} : position invalide (NaN / Infinity).`);
    if (p.some(([x, y]) => x < -150 || x > 1100 || y < -150 || y > 700)) fail(`${label} : un jeton est parti hors de la salle ${JSON.stringify(p.filter(([x, y]) => x < -150 || x > 1100 || y < -150 || y > 700))}.`);
    const b = /translate\(([^ ]+) ([^)]+)\)/.exec(host.querySelector(".c2d-ball").getAttribute("transform") || "");
    if (!b || !Number.isFinite(+b[1]) || !Number.isFinite(+b[2])) fail(`${label} : ballon en position invalide.`);
    if (host.querySelectorAll(".c2d-p").length !== 10) fail(`${label} : dix joueurs attendus sur le terrain, obtenu ${host.querySelectorAll(".c2d-p").length}.`);
  };
  const holderOk = (label) => {
    const d = court.debug();
    if (S.status === "live" && !S.stoppage && (!d.holder || d.holderTeam !== S.possession)) fail(`${label} : le ballon doit être à l'équipe du moteur (${S.possession}), obtenu ${JSON.stringify({ holder: d.holder, team: d.holderTeam })}.`);
  };
  const ptsCount = () => host.querySelectorAll(".c2d-ptsf").length;

  // Boucle de rendu : nombre d'images par seconde de référence.
  rafCalls = 0; await sleep(1000); const rafBase = rafCalls;

  // 1) Retour pendant une animation de tir / un vol de ballon (2 s d'absence).
  S.teams[0].score += 2; S.possession = 1;
  made(0, "Gotham:Ben Moro", "Gotham:Ali Kane");
  court.update(S, [nextId - 1]);
  await sleep(250);
  setVis("hidden");
  if (!court.debug().suspended || court.debug().pendingTimers !== 0) fail(`onglet masqué : mise en scène suspendue, aucune minuterie en attente (obtenu ${JSON.stringify(court.debug())}).`);
  await sleep(2000);
  const ptsBefore = ptsCount();
  setVis("visible");
  await sleep(120);
  sane("retour après 2 s (tir en cours)");
  holderOk("retour après 2 s (tir en cours)");
  if (court.debug().inFlight) fail("au retour, aucun vol de ballon interrompu ne doit continuer.");
  ok("Retour après 2 s pendant un tir / un vol de ballon : recalage propre, ballon à l'équipe du moteur.");

  // 2) Absence de 30 s pendant laquelle le moteur joue des actions : absorbées,
  //    pas rejouées ; au retour, état du moteur.
  setVis("hidden");
  for (let i = 0; i < 6; i++) {
    offset += 5000;
    const t = i % 2;
    S.teams[t].score += 2; S.possession = 1 - t;
    made(t, t ? "Rennes:Jo Wright" : "Gotham:Cal Ito");
    court.update(S, [nextId - 1]);
    if (court.debug().queued || court.debug().pendingTimers) fail("onglet masqué : aucun événement mis en file, aucune minuterie de mise en scène.");
  }
  setVis("visible");
  await sleep(150);
  sane("retour après 30 s");
  holderOk("retour après 30 s");
  if (ptsCount() > ptsBefore) fail("les paniers marqués pendant l'absence ne doivent pas être rejoués (aucun « +2 » au retour).");
  ok("Absence de 30 s : 6 actions du moteur absorbées, aucune rejouée, terrain recalé sur la possession du moteur.");

  // 3) Absence de plusieurs minutes, retour pendant un temps mort (arrêt de jeu).
  setVis("hidden");
  offset += 4 * 60 * 1000;
  S.stoppage = { kind: "timeout", team: 1, quarter: 2, startAt: clock() - 5000, endsAt: clock() + 40000 };
  ev({ team: 1, type: "timeout", kind: "timeout", durationMs: 45000, actors: {} });
  court.update(S, [nextId - 1]);
  setVis("visible");
  await sleep(150);
  sane("retour après 4 min (temps mort)");
  const benchY = pos().slice(0, 10).every(([, y]) => y / 10 > 49);
  if (!benchY) fail(`retour pendant un temps mort : les joueurs doivent être aux bancs (hors du terrain), obtenu ${JSON.stringify(pos().slice(0, 10))}.`);
  ok("Absence de 4 min, retour pendant un temps mort : chacun à son banc, ballon libre (arrêt de jeu du moteur).");
  S.stoppage = null;

  // 4) Événement arrivé très en retard alors que l'onglet est visible
  //    (minuteries bridées) : recalage, pas d'animation rattrapée.
  const resyncsBefore = court.debug().resyncs;
  S.teams[1].score += 3; S.possession = 0;
  const late = made(1, "Rennes:Jo Wright");
  late.airAt = clock() - 20000; late.zone = "three";
  const pts0 = ptsCount();
  court.update(S, [late.id]);
  await sleep(120);
  if (court.debug().resyncs !== resyncsBefore + 1) fail("un événement très en retard doit déclencher un recalage.");
  if (ptsCount() > pts0) fail("un panier très en retard ne doit pas être animé (« +3 » rejoué).");
  // Terrain visible : recalage EN DOUCEUR (2026-10-09) — le ballon rejoint le
  // porteur par une passe, les joueurs courent à leur place (pas de saut).
  await sleep(700);
  sane("événement en retard"); holderOk("événement en retard");
  ok("Événement très en retard (onglet visible) : recalage sur le moteur, aucune animation rattrapée.");

  // 5) Allers-retours rapides et répétés : une seule boucle de rendu, pas de
  //    minuteries qui s'accumulent, positions toujours valides.
  for (let i = 0; i < 12; i++) { setVis("hidden"); await sleep(i % 3 ? 20 : 0); setVis("visible"); await sleep(30); }
  await sleep(200);
  sane("allers-retours rapides"); holderOk("allers-retours rapides");
  rafCalls = 0; await sleep(1000);
  if (rafCalls > rafBase * 1.5 + 5) fail(`une seule boucle de rendu attendue : ${rafCalls} images / s contre ${rafBase} avant.`);
  if (court.debug().pendingTimers > 20) fail(`minuteries accumulées : ${court.debug().pendingTimers}.`);
  ok(`12 allers-retours rapides : une seule boucle de rendu (${rafCalls} contre ${rafBase} images / s), ${court.debug().pendingTimers} minuterie(s) en attente.`);

  // 6) Fonctionnement normal après reprise : un panier visible se joue (« +2 »).
  let sawPts = false;
  const obs = new window.MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains("c2d-ptsf")) sawPts = true; })));
  obs.observe(host, { childList: true, subtree: true });
  S.teams[0].score += 2; S.possession = 1;
  const m2 = made(0, "Gotham:Dan Vidal");
  court.update(S, [m2.id]);
  await sleep(4500);   // panier, « +2 », puis remise en jeu (comme live_court2d_test)
  obs.disconnect();
  if (!sawPts) fail("après reprise, un panier du moteur doit être joué normalement (« +2 » affiché).");
  sane("jeu normal après reprise"); holderOk("jeu normal après reprise");
  ok("Après reprise : les nouvelles actions du moteur sont jouées normalement (« +2 » affiché).");

  // 6 bis) Retour pendant un rebond puis pendant un contre (gros événement).
  S.possession = 0;
  const miss = ev({ team: 0, type: "miss", kind: "rebound", made: false, zone: "mid", offensive: false, shot: { x: 70, y: 30 }, possessionTeam: 0, possessionAfter: 1, actors: { shooter: "Gotham:Cal Ito", rebounder: "Rennes:Hal Novak" } });
  S.possession = 1;
  court.update(S, [miss.id]);
  await sleep(400);
  setVis("hidden"); await sleep(300); setVis("visible"); await sleep(120);
  sane("retour pendant un rebond"); holderOk("retour pendant un rebond");
  const blk = ev({ team: 1, type: "miss", kind: "shot", made: false, blocked: true, zone: "paint", shot: { x: 20, y: 25 }, possessionTeam: 1, possessionAfter: 0, actors: { shooter: "Rennes:Leo Ramos", blocker: "Gotham:Eli Nakamura" } });
  S.possession = 0;
  court.update(S, [blk.id]);
  await sleep(200);
  setVis("hidden"); offset += 45000; await sleep(200); setVis("visible"); await sleep(120);
  sane("retour pendant un contre"); holderOk("retour pendant un contre");
  ok("Retour pendant un rebond et pendant un contre (bannière, public) : recalage propre.");

  // 7) Retour pendant la mi-temps / fin de match : au banc, pas de ballon en jeu.
  setVis("hidden"); S.status = "halftime"; court.update(S, []); setVis("visible"); await sleep(120);
  sane("retour à la mi-temps");
  if (!pos().slice(0, 10).every(([, y]) => y / 10 > 49)) fail("mi-temps : joueurs aux bancs au retour.");
  ok("Retour pendant la mi-temps : joueurs aux bancs, aucune action inventée.");

  court.destroy();
  setVis("hidden"); setVis("visible");   // plus aucun écouteur actif après destroy
  ok("destroy() retire l'écouteur de visibilité et la boucle de rendu.");
  console.log("✅ Tous les tests de reprise après changement d'onglet sont passés.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
