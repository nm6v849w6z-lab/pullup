// Drapeaux des tribunes du direct 2D (demande du 2026-10-09) : présents
// dans les gradins (club qui reçoit + un coin des visiteurs), jamais tout à
// fait immobiles (flottement permanent), agités fort sur les grands moments
// (gros panier : drapeaux du camp qui marque), moyennement pendant les
// shows ; jamais devant le tableau d'affichage ; suivent le rognage
// téléphone. Navigateur réel (animations CSS). Captures dans $FLAGS_SHOTS.
const fs = require("fs");
const path = require("path");
const http = require("http");

function fail(msg) { throw new Error("❌ " + msg); }
const ok = msg => console.log("✅ " + msg);

let chromium;
try { chromium = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright").chromium; } catch (e) { /* rien */ }
if (!chromium || !fs.existsSync("/opt/pw-browsers/chromium")) { console.log("ℹ️  Chromium absent : vérification navigateur sautée"); process.exit(0); }

const ROOT = __dirname;
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/live/live.css">
<style>body{margin:0;background:#0b0f17}#host{width:1160px}</style></head><body><div id="host" class="c2d"></div>
<script type="module">
import { createCourt2D } from "/assets/live/court2d.js";
const av = () => '<svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="60" r="40" fill="#888"/></svg>';
const POS = ["M", "AS", "A", "AF", "P"];
const team = (k, c) => ({ name: k, short: k.slice(0, 3).toUpperCase(), score: 0, color: c,
  players: [0, 1, 2, 3, 4].map(i => ({ id: k + ":#" + i, name: k + " J" + i, pos: POS[i], onCourt: true, starter: true, avatar: av(), number: 10 + i, pf: 0 })) });
const S = { status: "live", quarter: 2, clock: 400, possession: 0, shots: [],
  events: [{ id: 0, kind: "tipoff", type: "period", quarter: 1, clock: 600, airAt: Date.now() - 100000, text: "" }],
  referees: [0, 1, 2].map(i => ({ id: "ref" + i, avatar: av() })), teams: [team("Krakens", "#d6473f"), team("Rennes", "#2f7fd8")] };
window.court = createCourt2D(document.getElementById("host"), { raster: false, colors: ["#d6473f", "#2f7fd8"] });
window.court.update(S, []);
window.ready = true;
</script></body></html>`;
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(PAGE); return; }
  const f = path.join(ROOT, path.normalize(u).replace(/^([/\\])+/, ""));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": { ".js": "text/javascript", ".css": "text/css" }[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const shots = process.env.FLAGS_SHOTS || "";
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 800 } });
    const errors = []; page.on("pageerror", e => errors.push(String(e)));
    await page.goto("http://127.0.0.1:" + server.address().port + "/");
    await page.waitForFunction(() => window.ready === true, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const state = () => page.evaluate(() => {
      const host = document.getElementById("host").getBoundingClientRect();
      const board = document.querySelector(".c2d-board").getBoundingClientRect();
      const fl = [...document.querySelectorAll(".c2d-flag")];
      const court = document.querySelector(".c2d-svg").getBoundingClientRect();
      const sx = court.width / 1160, sy = court.height / 772;
      // Rectangle du parquet (arène 110,96 → 1050,596).
      const pk = { l: court.left + 110 * sx, t: court.top + 96 * sy, r: court.left + 1050 * sx, b: court.top + 596 * sy };
      return {
        n: fl.length, h: fl.filter(f => f.classList.contains("s-h")).length, a: fl.filter(f => f.classList.contains("s-a")).length,
        cloth: fl.map(f => f.querySelector(".cloth").getAnimations().map(a => a.animationName).join(",")),
        wave: fl.map(f => ({ side: f.classList.contains("s-h") ? "h" : "a", anim: f.getAnimations().map(a => a.animationName).join(",") })),
        onBoard: fl.filter(f => { const r = f.getBoundingClientRect(); return r.right > board.left && r.left < board.right && r.bottom > board.top && r.top < board.bottom; }).length,
        onCourt: fl.filter(f => { const r = f.getBoundingClientRect(); const cx = (r.left + r.right) / 2, cy = r.bottom; return cx > pk.l && cx < pk.r && cy > pk.t && cy < pk.b; }).length,
        inside: fl.every(f => { const r = f.getBoundingClientRect(); return r.width > 4 && r.left >= host.left - 2 && r.right <= host.right + 2; }),
      };
    });
    let s = await state();
    if (s.n < 10 || s.h < 8 || s.a < 1) fail(`drapeaux dans les gradins (club qui reçoit + coin des visiteurs) attendus : ${JSON.stringify({ n: s.n, h: s.h, a: s.a })}.`);
    if (s.onBoard || s.onCourt || !s.inside) fail(`drapeaux dans les tribunes seulement (ni tableau ni parquet) : ${JSON.stringify(s)}.`);
    if (!s.cloth.every(c => /c2d-flutter/.test(c))) fail("chaque drapeau flotte en permanence (jamais immobile) : " + JSON.stringify(s.cloth));
    if (s.wave.some(w => w.anim)) fail("hors grand moment : pas d'agitation forte.");
    if (shots) await page.locator("#host").screenshot({ path: path.join(shots, "drapeaux-calme.png") });
    ok(`${s.n} drapeaux (${s.h} du club qui reçoit, ${s.a} des visiteurs) dans les gradins, flottement permanent, ni sur le tableau ni sur le parquet.`);

    // Gros panier du club qui reçoit : ses drapeaux s'agitent fort, pas ceux des visiteurs.
    await page.evaluate(() => court.test.react("score", 0, true));
    await page.waitForTimeout(250);
    s = await state();
    if (!s.wave.filter(w => w.side === "h").every(w => /c2d-flag-wave-big/.test(w.anim))) fail("grand moment du club qui reçoit : ses drapeaux s'agitent fort " + JSON.stringify(s.wave));
    if (s.wave.filter(w => w.side === "a").some(w => w.anim)) fail("grand moment du club qui reçoit : drapeaux visiteurs calmes.");
    if (!s.cloth.every(c => c)) fail("le tissu flotte toujours.");
    if (shots) await page.locator("#host").screenshot({ path: path.join(shots, "drapeaux-grand-moment.png") });
    await page.waitForTimeout(3600);
    s = await state();
    if (s.wave.some(w => w.anim)) fail("après le grand moment, retour au flottement léger.");
    ok("Grand moment (3 points, dunk, contre…) : drapeaux du camp qui marque agités fort, puis retour au flottement léger.");

    // Panier simple des visiteurs : agitation moyenne de leurs drapeaux seulement.
    await page.evaluate(() => court.test.react("score", 1, false));
    await page.waitForTimeout(250);
    s = await state();
    if (!s.wave.filter(w => w.side === "a").every(w => /c2d-flag-wave$|c2d-flag-wave,|^c2d-flag-wave/.test(w.anim) && !/big/.test(w.anim))) fail("panier des visiteurs : leurs drapeaux s'agitent (moyen) " + JSON.stringify(s.wave));
    if (s.wave.filter(w => w.side === "h").some(w => w.anim)) fail("panier des visiteurs : drapeaux du club qui reçoit calmes.");
    ok("Panier simple : agitation moyenne des drapeaux du camp qui marque.");

    // Téléphone (viewBox rognée) : les drapeaux suivent.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.getElementById("host").style.width = "390px"; });
    await page.waitForTimeout(500);
    s = await state();
    if (s.onBoard || s.onCourt) fail("téléphone : drapeaux toujours dans les tribunes " + JSON.stringify(s));
    if (shots) await page.locator("#host").screenshot({ path: path.join(shots, "drapeaux-mobile.png") });
    ok("Téléphone : les drapeaux suivent le cadrage, toujours dans les tribunes.");
    if (errors.length) fail("erreurs de page : " + errors.join(" | "));
    ok("Tous les tests des drapeaux sont passés.");
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e.message || e); process.exit(1); });
