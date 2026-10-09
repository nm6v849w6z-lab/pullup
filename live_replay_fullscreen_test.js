// Rediffusion en plein écran (BUG 2026-10-09 : « en plein écran, il n'est
// pas possible d'avancer le temps ») : le curseur de la page (.replay-seek,
// posé À CÔTÉ de la vue du direct) est accueilli dans la vue le temps du
// plein écran — visible, mêmes boutons −30 s / +30 s et glissière, flèches
// ← / → du clavier — puis remis à sa place à la sortie. Navigateur réel.
const fs = require("fs");
const path = require("path");
const http = require("http");
const ok = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };
let chromium;
try { chromium = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright").chromium; } catch (e) { /* rien */ }
if (!chromium || !fs.existsSync("/opt/pw-browsers/chromium")) { console.log("ℹ️  Chromium absent : vérification navigateur sautée"); process.exit(0); }
const ROOT = __dirname;
// Même balisage que makeReplaySeekBar (moteurbasket3.html), posé avant la vue
// comme renderLiveReplaySeekBar ; le saut est enregistré dans window.seeks.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/live/live.css">
<style>body{margin:0;background:#0b0f17;color:#fff}.replay-seek{display:flex;gap:10px;padding:8px}</style></head><body>
<div id="page"><div class="replay-seek" id="liveReplaySeek"><span class="replay-seek-tag">Rediffusion</span><button type="button" data-seek="-30000">−30 s</button><input type="range" min="0" max="100"><button type="button" data-seek="30000">+30 s</button><span class="replay-seek-pos">QT1</span></div>
<div id="hmLiveRoot" class="hm-live"></div></div>
<script type="module">
import { createLiveView } from "/assets/live/live-view.js";
window.seeks = [];
document.querySelectorAll("#liveReplaySeek [data-seek]").forEach(b => b.addEventListener("click", () => window.seeks.push(Number(b.dataset.seek))));
window.view = createLiveView(document.getElementById("hmLiveRoot"), { court2d: false });
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
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  try {
    for (const [w, h] of [[1280, 800], [844, 390]]) {
      const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
      const errors = []; p.on("pageerror", e => errors.push(e.message));
      await p.goto("http://127.0.0.1:" + server.address().port + "/");
      await p.waitForFunction(() => window.ready === true);
      const vis = () => p.evaluate(() => { const bar = document.getElementById("liveReplaySeek"); const r = bar.getBoundingClientRect(); const cs = getComputedStyle(bar); return { inView: !!bar.closest("#hmLiveRoot"), shown: r.width > 50 && r.height > 10 && cs.display !== "none" && r.top >= 0 && r.bottom <= innerHeight }; });
      await p.click('[data-ref="fsBtn"]');
      await p.waitForTimeout(300);
      ok(await p.evaluate(() => document.getElementById("hmLiveRoot").classList.contains("is-full")), `${w}×${h} : plein écran`);
      let v = await vis();
      ok(v.inView && v.shown, `${w}×${h} : curseur de rediffusion visible en plein écran (${JSON.stringify(v)})`);
      await p.click('#liveReplaySeek [data-seek="30000"]');
      await p.click('#liveReplaySeek [data-seek="-30000"]');
      await p.keyboard.press("ArrowRight");
      await p.keyboard.press("ArrowLeft");
      const seeks = await p.evaluate(() => window.seeks.splice(0));
      ok(seeks.join() === "30000,-30000,30000,-30000", `${w}×${h} : +30 s / −30 s (boutons et flèches ← →) sans quitter le plein écran (${seeks})`);
      ok(await p.evaluate(() => document.getElementById("hmLiveRoot").classList.contains("is-full")), `${w}×${h} : toujours en plein écran après les sauts`);
      // Curseur recréé par la page pendant le plein écran (saut = nouvel élément).
      await p.evaluate(() => { const old = document.getElementById("liveReplaySeek"); const nb = old.cloneNode(true); old.remove(); document.getElementById("hmLiveRoot").insertAdjacentElement("beforebegin", nb); nb.querySelectorAll("[data-seek]").forEach(b => b.addEventListener("click", () => window.seeks.push(Number(b.dataset.seek)))); window.view.update && 0; });
      await p.evaluate(() => { try { window.view.setState && 0; } catch (e) {} });
      // La vue reprend le curseur au rendu suivant (update) : simulé par un nouvel état vide.
      await p.evaluate(() => { try { window.view.update(null); } catch (e) { /* état minimal */ } });
      v = await vis();
      ok(v.inView, `${w}×${h} : curseur recréé (saut) repris dans le plein écran`);
      await p.click('[data-ref="fsExit"]');
      await p.waitForTimeout(200);
      v = await vis();
      const back = await p.evaluate(() => { const bar = document.getElementById("liveReplaySeek"); return bar.nextElementSibling && bar.nextElementSibling.id === "hmLiveRoot"; });
      ok(!v.inView && back, `${w}×${h} : sortie du plein écran → curseur remis à sa place, au-dessus du direct`);
      ok(!errors.length, `${w}×${h} : aucune erreur (${errors.join(" | ")})`);
    }
  } finally { await b.close(); server.close(); }
  console.log("\n🏁 live_replay_fullscreen_test.js : rediffusion pilotable en plein écran.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
