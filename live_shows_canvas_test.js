// Shows du direct 2D dessinés d'après la maquette « Shows Live 2D »
// (assets/live/showfx.js, 2026-10-09), dans un vrai navigateur :
//  - temps mort → pompom girls au centre (8 danseuses, canvas posé sur le
//    terrain, tableau d'affichage jamais recouvert) ;
//  - fin Q1 → mascotte : dunk au trampoline (A) ou tour d'honneur (B), en
//    alternance un match sur deux (parité de la journée) ;
//  - fin Q3 → canon rotatif sur chariot, t-shirts en l'air ;
//  - le show disparaît avec l'arrêt de jeu ; mouvement réduit = image fixe.
// Captures dans $SHOWS_SHOTS (facultatif).
const fs = require("fs");
const path = require("path");
const http = require("http");

function fail(msg) { throw new Error("❌ " + msg); }
const ok = msg => console.log("✅ " + msg);

let chromium;
try { chromium = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright").chromium; } catch (e) { /* rien */ }
if (!chromium || !fs.existsSync("/opt/pw-browsers/chromium")) { console.log("ℹ️  Chromium absent : vérification navigateur sautée"); process.exit(0); }

const ROOT = __dirname;
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css" };
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/live/live.css">
<style>body{margin:0;background:#0b0f17}#host{width:1160px}</style></head><body><div id="host" class="c2d"></div>
<script type="module">
import { createCourt2D } from "/assets/live/court2d.js";
import * as STG from "/assets/live/staging.js";
window.STG = STG;
window.NOW = 1800000000000;
const av = id => '<svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="60" r="40" fill="#888"/></svg>';
const POS = ["M", "AS", "A", "AF", "P"];
const team = (k, c) => ({ name: k, short: k.slice(0, 3).toUpperCase(), score: 0, color: c,
  players: [0, 1, 2, 3, 4].map(i => ({ id: k + ":#" + i, name: k + " J" + i, pos: POS[i], onCourt: true, starter: true, avatar: av(), number: 10 + i, pf: 0 })) });
window.S = { status: "live", quarter: 2, clock: 400, possession: 0, shots: [], kickoffAt: window.NOW - 900000,
  events: [{ id: 0, kind: "tipoff", type: "period", quarter: 1, clock: 600, airAt: window.NOW - 800000, text: "" }],
  referees: [0, 1, 2].map(i => ({ id: "ref" + i, avatar: av() })), teams: [team("Krakens", "#d6473f"), team("Rennes", "#2f7fd8")] };
window.CFG = { coach: true, playerIntro: false, shows: true, coaches: [av(), av()], homeColors: ["#d6473f", "#f6f0e6"], homeShort: "KRA", mascot: null, round: 4 };
window.court = createCourt2D(document.getElementById("host"), { raster: false, now: () => window.NOW, staging: () => window.CFG, stagingModule: STG });
window.court.update(window.S, []);
window.ready = true;
</script></body></html>`;

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(PAGE); return; }
  const f = path.join(ROOT, path.normalize(u).replace(/^([/\\])+/, ""));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port + "/";
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const shots = process.env.SHOWS_SHOTS || "";
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 800 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    await page.goto(base);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 15000 });

    // --- Alternance de la mascotte ---
    const alt = await page.evaluate(() => {
      const v = STG.mascotVariant;
      return { r4: v({ round: 4 }, {}), r5: v({ round: 5 }, {}), r6: v({ round: 6 }, {}), d0: v({}, { kickoffAt: 86400000 * 10 + 5 }), d1: v({}, { kickoffAt: 86400000 * 11 + 5 }) };
    });
    if (alt.r4 !== "A" || alt.r5 !== "B" || alt.r6 !== "A") fail("mascotte : dunk et tour d'honneur doivent alterner d'une journée à l'autre " + JSON.stringify(alt));
    if (alt.d0 === alt.d1) fail("sans journée connue, alternance selon le jour du match.");
    ok("Mascotte : dunk au trampoline et tour d'honneur en alternance, un match sur deux.");

    // Place l'horloge, laisse tourner quelques images, lit l'état.
    const at = async (stoppage, tMs, quarter) => page.evaluate(async ([st, t, q]) => {
      if (st) { S.quarter = q || S.quarter; S.stoppage = { ...st, startAt: 1800000000000 + 1000000, endsAt: 1800000000000 + 1000000 + st.ms }; }
      else S.stoppage = null;
      window.NOW = 1800000000000 + 1000000 + t;
      court.update(S, []);
      await new Promise(r => setTimeout(r, 450));
      const d = court.debug().staging;
      const cv = document.querySelector(".c2d-showfx");
      let ink = 0, boardInk = 0;
      if (cv && cv.width) {
        const g = cv.getContext("2d"), px = g.getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 3; i < px.length; i += 16) if (px[i] > 24) ink++;
        // Tableau d'affichage (arène x 476–684, y 6–72) : jamais recouvert.
        const sx = cv.width / 1160, sy = cv.height / 772;
        const b = g.getImageData(Math.round(486 * sx), Math.round(10 * sy), Math.round(188 * sx), Math.round(56 * sy)).data;
        for (let i = 3; i < b.length; i += 4) if (b[i] > 0) boardInk++;
      }
      return { show: d.show, variant: d.variant, renderer: d.renderer, frame: d.frame, ink, boardInk, cls: cv ? cv.className : null, opacity: cv ? cv.style.opacity : null };
    }, [stoppage, tMs, quarter]);
    // Personnage visible : hors des toits des tunnels (coins du bas, repère de la maquette).
    const visible = c => !(c.y > 1158 && (c.x < 260 || c.x > 1740));
    const snap = async name => { if (shots) await page.locator("#host").screenshot({ path: path.join(shots, name) }); };

    // --- Temps mort : pompom girls ---
    const TO = { kind: "timeout", team: 0, ms: 60000 };
    let r = await at(TO, 400 + 9000, 2);
    if (r.show !== "pompom" || r.renderer !== "canvas") fail("temps mort : pompom girls dessinées sur le canvas attendues " + JSON.stringify(r));
    if (!r.frame || r.frame.chars.filter(c => c.kind === "dancer").length !== 8) fail("8 pompom girls attendues au centre " + JSON.stringify(r.frame));
    if (r.ink < 400) fail("le canvas du show doit être visible (pixels dessinés : " + r.ink + ").");
    if (!/stg-show-pompom/.test(r.cls)) fail("canvas du show identifiable (.stg-show-pompom).");
    const center = r.frame.chars.every(c => c.x > 780 && c.x < 1220 && c.y > 440 && c.y < 680);
    if (!center) fail("chorégraphie au centre du parquet attendue " + JSON.stringify(r.frame.chars));
    if (r.boardInk) fail("le tableau d'affichage ne doit jamais être recouvert par le show.");
    await snap("show-pompom.png");
    ok(`Temps mort : 8 pompom girls au centre (canvas, ${r.ink} points dessinés), tableau dégagé.`);
    // Retour 2026-10-09 : elles ne sortent pas au bout de 20 s — elles dansent
    // au centre pendant TOUT le temps mort et ne sortent qu'à la fin.
    for (const sec of [18, 21, 25, 32, 40, 47, 53]) {
      r = await at(TO, 400 + sec * 1000, 2);
      const d = r.frame ? r.frame.chars.filter(c => c.kind === "dancer") : [];
      if (d.length !== 8 || !d.every(c => c.x > 780 && c.x < 1220 && c.y > 440 && c.y < 680)) fail(`à ${sec} s du temps mort, les 8 pompom girls dansent encore au centre ` + JSON.stringify(r.frame));
    }
    r = await at(TO, 58500, 2);
    if (r.frame && r.frame.chars.length) fail("juste avant la reprise, les pompom girls sont sorties " + JSON.stringify(r.frame));
    ok("Pompom girls : une seule entrée, danse au centre pendant tout le temps mort, sortie juste avant la reprise.");
    r = await at(null, 61000);
    if (r.show || r.cls) fail("le show doit disparaître à la fin du temps mort " + JSON.stringify(r));
    ok("Fin du temps mort : canvas retiré.");

    // --- Fin Q1 : mascotte A (journée paire) ---
    const Q1 = { kind: "quarter-break", quarter: 1, ms: 120000 };
    // Mission live 2026-10-10 : UN SEUL tour, vitesse calculée sur la durée
    // de la pause (staging.js:mascotLap) — routine A jouée à 0,8× sur 2 min :
    // le dunk (4,4 s de scène) arrive à 5,5 s.
    r = await at(Q1, 400 + 5500, 1);
    if (r.show !== "mascot" || r.variant !== "A" || r.renderer !== "canvas") fail("fin Q1, journée paire : dunk au trampoline attendu " + JSON.stringify(r));
    const m = r.frame.chars.find(c => c.kind === "masc");
    if (!m || !(m.h > 20)) fail("la mascotte doit être en l'air (trampoline → dunk) " + JSON.stringify(r.frame));
    await snap("show-mascotte-A.png");
    ok("Fin Q1 (journée paire) : mascotte, dunk au trampoline.");
    // Mission live 2026-10-10 : entrée par le tunnel de droite (hors du
    // parquet au début), routine UNE fois, puis la mascotte ATTEND en saluant
    // (immobile) et ne repart par le tunnel qu'à la fin de la pause.
    r = await at(Q1, 400 + 300, 1);
    const m0 = r.frame && r.frame.chars.find(c => c.kind === "masc");
    if (m0 && !(m0.x > 1700 && m0.y > 1000)) fail("mascotte A : au début, elle sort du tunnel de droite (coin bas droit) " + JSON.stringify(r.frame));
    const wait = [];
    for (const sec of [40, 70, 100]) { r = await at(Q1, 400 + sec * 1000, 1); const mm = r.frame && r.frame.chars.filter(c => c.kind === "masc"); if (!mm || mm.length !== 1) fail(`mascotte A à ${sec} s : présente une seule fois (attente) ` + JSON.stringify(r.frame)); wait.push(mm[0]); }
    if (wait.some(w => Math.hypot(w.x - wait[0].x, w.y - wait[0].y) > 2 || w.h > 0)) fail("mascotte A : après son passage, elle attend sur place (pas de second tour) " + JSON.stringify(wait));
    r = await at(Q1, 118600, 1);
    if (r.frame && r.frame.chars && r.frame.chars.some(c => c.kind === "masc" && visible(c))) fail("mascotte A : repartie par le tunnel à la fin de la pause " + JSON.stringify(r.frame));
    ok("Mascotte A : sort du tunnel, un seul dunk, attend la fin de la pause en saluant, repart par le tunnel.");
    await at(null, 125000);

    // --- Fin Q1 : mascotte B (journée impaire) ---
    await page.evaluate(() => { CFG.round = 5; });
    // Tour d'honneur étiré sur la pause (vitesse 0,2× : 6 s de scène à 30 s).
    r = await at(Q1, 400 + 30000, 1);
    if (r.show !== "mascot" || r.variant !== "B") fail("fin Q1, journée impaire : tour d'honneur attendu " + JSON.stringify(r));
    const mb = r.frame.chars.find(c => c.kind === "masc");
    if (!mb || !(mb.y < 200)) fail("tour d'honneur : la mascotte longe la tribune du haut à 6 s " + JSON.stringify(r.frame));
    if (r.boardInk) fail("tour d'honneur : la mascotte passe derrière le tableau d'affichage.");
    await snap("show-mascotte-B.png");
    ok("Fin Q1 (journée impaire) : mascotte, tour d'honneur et check des fans, sous le tableau.");
    // Un seul tour (vitesse calée sur la pause), puis attente, puis sortie.
    const lap = [];
    for (let sec = 2; sec <= 116; sec += 2) { r = await at(Q1, 400 + sec * 1000, 1); const mm = r.frame && r.frame.chars.find(c => c.kind === "masc"); lap.push(mm ? [Math.round(mm.x), Math.round(mm.y)] : null); }
    const topPasses = lap.reduce((n, p, i) => n + (p && p[1] < 200 && !(lap[i - 1] && lap[i - 1][1] < 200) ? 1 : 0), 0);
    if (topPasses !== 1) fail("mascotte B : un seul passage le long de la tribune du haut (un tour) " + JSON.stringify(lap));
    const last = lap.slice(-10);
    if (!last.every(p => p && Math.hypot(p[0] - last[0][0], p[1] - last[0][1]) < 2)) fail("mascotte B : tour fini, elle attend sur place la fin de la pause " + JSON.stringify(last));
    r = await at(Q1, 118600, 1);
    if (r.frame && r.frame.chars && r.frame.chars.some(c => c.kind === "masc" && visible(c))) fail("mascotte B : repartie par un tunnel à la fin " + JSON.stringify(r.frame));
    ok("Mascotte B : un seul tour, vitesse adaptée à la pause, attente, sortie par le tunnel.");
    await at(null, 125000);

    // --- Fin Q3 : lanceurs de t-shirts « en tournée » (mission live 2026-10-10) ---
    const Q3 = { kind: "quarter-break", quarter: 3, ms: 120000 };
    const tableZone = c => c.x > 820 && c.x < 1180 && c.y > 1000;
    const onFloor = c => c.x > 193 && c.x < 1808 && c.y > 120 && c.y < 975;
    r = await at(Q3, 400 + 300, 3);
    if (r.show !== "tshirt" || r.variant !== "T") fail("fin Q3 : lanceurs de t-shirts (tournée) attendus " + JSON.stringify(r));
    if ((r.frame ? r.frame.chars : []).some(c => c.kind === "staff" && onFloor(c))) fail("au début, le staff sort des tunnels, il n'apparaît pas sur le parquet " + JSON.stringify(r.frame));
    const plan = r.frame.spots, shotsPlan = r.frame.shots;
    if (!plan || plan.length !== 2 || plan.some(p => new Set(p.map(x => x.join())).size < 3)) fail("chaque lanceur tire depuis au moins 3 emplacements différents " + JSON.stringify(plan));
    const targets = new Set(shotsPlan.flat().map(x => x.T.join()));
    if (targets.size < 6) fail("cibles variées dans les tribunes attendues " + JSON.stringify(shotsPlan));
    let flying = 0;
    for (let sec = 4; sec <= 110; sec += 6) {
      r = await at(Q3, 400 + sec * 1000, 3);
      const st = (r.frame ? r.frame.chars : []).filter(c => c.kind === "staff");
      if (st.some(tableZone)) fail(`à ${sec} s : aucun lanceur à la table de marque ` + JSON.stringify(r.frame));
      flying += r.frame ? r.frame.shirts : 0;
    }
    if (!flying) fail("des t-shirts en l'air pendant la tournée");
    await snap("show-canon.png");
    // Reproductible : même arrêt → même tournée (relecture, rechargement).
    r = await at(Q3, 400 + 30000, 3);
    if (JSON.stringify(r.frame.spots) !== JSON.stringify(plan) || JSON.stringify(r.frame.shots) !== JSON.stringify(shotsPlan)) fail("tournée non reproductible pour le même arrêt");
    // Fin : tout le monde est rentré avant la reprise (jamais de retard).
    r = await at(Q3, 118600, 3);
    if (r.frame && r.frame.chars.some(c => c.kind === "staff" && visible(c))) fail("fin de la pause : lanceurs rentrés au tunnel " + JSON.stringify(r.frame));
    ok(`Fin Q3 : lanceurs sortis des tunnels, ${plan.map(p => p.length).join(" + ")} emplacements, ${targets.size} cibles différentes, reproductible, rentrés avant la reprise.`);
    // Saut dans le temps au-delà de l'arrêt : coupure propre.
    r = await at(null, 600000);
    if (r.cls) fail("saut après l'arrêt : canvas retiré.");

    // --- Téléphone (viewBox rognée) : le show suit le terrain ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.getElementById("host").style.width = "390px"; });
    await page.waitForTimeout(300);
    r = await at(TO, 400 + 9000, 2);
    if (r.renderer !== "canvas" || r.ink < 100) fail("téléphone : show visible " + JSON.stringify(r));
    await snap("show-pompom-mobile.png");
    ok("Téléphone : le show suit le cadrage du terrain.");
    await at(null, 61000);

    if (errors.length) fail("erreurs de page : " + errors.join(" | "));
    ok("Tous les tests des shows dessinés sont passés.");
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e.message || e); process.exit(1); });
