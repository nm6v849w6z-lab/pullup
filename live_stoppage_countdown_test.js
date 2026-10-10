// Décomptes des interruptions (mission live 2026-10-10 : « il faut toujours
// pouvoir voir le temps restant pendant les pauses et les temps morts ») :
// temps mort, pause entre deux quarts-temps, mi-temps — décompte visible
// (tableau, mini-bandeau, plein écran), calculé sur la fin ABSOLUE de
// l'arrêt (S.stoppage.endsAt, la même référence que le buzzer), qui descend
// seconde par seconde, atteint 00:00 au buzzer (UNE fois), puis disparaît ;
// juste après un onglet masqué (aucune mise à jour pendant 4 s) ou un
// rechargement : valeur exacte immédiatement, jamais figée.
const fs = require("fs"), path = require("path"), http = require("http");
const ok = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };
let chromium;
try { chromium = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright").chromium; } catch (e) { /* rien */ }
if (!chromium || !fs.existsSync("/opt/pw-browsers/chromium")) { console.log("ℹ️  Chromium absent : vérification navigateur sautée"); process.exit(0); }
const ROOT = __dirname;
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/live/live.css"></head><body style="background:#000">
<div id="hmLiveRoot" class="hm-live"></div>
<script type="module">
import { createLiveView } from "/assets/live/live-view.js";
const POS = ["M","AS","A","AF","P"];
const team = k => ({ name: k + "ville", short: k, score: 40, teamFouls: 0, timeoutsLeft: 3, quarterScores: [20, 20, null, null], players: [0,1,2,3,4].map(i => ({ id: k+":"+i, name: k+i, pos: POS[i], onCourt: true, starter: true, number: i, pts: 0, pf: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, seconds: 0 })) });
window.base = { status: "live", quarter: 2, clock: 300, possession: 0, shots: [], events: [{ id: 1, kind: "tipoff", type: "period", quarter: 1, clock: 600, airAt: Date.now() - 60000, text: "x" }], teams: [team("A"), team("B")] };
window.view = createLiveView(document.getElementById("hmLiveRoot"), { court2d: false });
// État du direct à l'instant t, recalculé comme le font l'adaptateur et le jeu
// (activeStoppage : arrêt en cours si t < endsAt).
window.stop = null; window.paused = false;
window.stateAt = t => { const st = window.stop && t >= window.stop.startAt && t < window.stop.endsAt ? window.stop : null;
  return { ...window.base, status: st && st.kind === "halftime" ? "halftime" : "live", stoppage: st ? { ...st, remaining: Math.ceil((st.endsAt - t) / 1000) } : null, timeout: st && st.kind === "timeout" ? { team: st.team, remaining: Math.ceil((st.endsAt - t) / 1000), endsAt: st.endsAt } : null, halftimeResumeIn: st && st.kind === "halftime" ? Math.ceil((st.endsAt - t) / 1000) : null }; };
window.view.update(window.stateAt(Date.now()));
setInterval(() => { if (!window.paused) window.view.update(window.stateAt(Date.now())); }, 250);
window.ready = true;
</script></body></html>`;
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(PAGE); return; }
  const f = path.join(ROOT, path.normalize(u).replace(/^([/\\])+/, ""));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp3": "audio/mpeg" }[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
    const errors = []; p.on("pageerror", e => errors.push(e.message));
    await p.goto("http://127.0.0.1:" + server.address().port + "/");
    await p.waitForFunction(() => window.ready === true && window.view.audio, null, { timeout: 15000 });
    const read = () => p.evaluate(() => ({ t: document.querySelector("[data-ref=tmo]").textContent, hidden: document.querySelector("[data-ref=tmo]").hidden, fs: document.querySelector("[data-ref=fstmo]").textContent, buzz: window.view.audio.debug().log.filter(x => x.key === "buzzer").length }));
    const secs = t => { const m = /(\d+):(\d+)/.exec(t); return m ? +m[1] * 60 + +m[2] : null; };
    for (const [kind, label, dur] of [["timeout", "TEMPS MORT", 6000], ["quarter-break", "PAUSE", 6000], ["halftime", "MI-TEMPS", 6000]]) {
      const buzz0 = (await read()).buzz;
      await p.evaluate(([kind, dur]) => { const now = Date.now(); window.stop = { kind, team: kind === "timeout" ? 1 : null, quarter: 2, startAt: now, endsAt: now + dur }; }, [kind, dur]);
      const seen = [];
      let zeroSeen = false, last = Infinity, monotone = true;
      for (let i = 0; i < 34; i++) {
        const r = await read();
        if (!r.hidden) { const v = secs(r.t); seen.push(v); if (v > last) monotone = false; last = v; if (v === 0) zeroSeen = true; if (!r.t.toUpperCase().startsWith(label)) throw new Error(`❌ ${kind} : libellé « ${label} » attendu, obtenu « ${r.t} »`); if (r.fs !== r.t) throw new Error("❌ plein écran : même décompte attendu"); }
        await p.waitForTimeout(250);
      }
      const r = await read();
      const distinct = [...new Set(seen)];
      ok(seen.length > 0 && distinct[0] >= 5, `${kind} : décompte visible dès le début (${distinct.join(" → ")})`);
      ok(monotone && distinct.length >= 6, `${kind} : décompte qui descend seconde par seconde, sans jamais remonter`);
      ok(zeroSeen, `${kind} : le décompte atteint 00:00`);
      ok(r.hidden, `${kind} : décompte retiré après la reprise`);
      ok(r.buzz - buzz0 === 1, `${kind} : buzzer à la fin, exactement une fois (${r.buzz - buzz0})`);
    }
    // Onglet masqué : plus aucune mise à jour pendant 4 s, puis retour.
    await p.evaluate(() => { const now = Date.now(); window.stop = { kind: "timeout", team: 0, startAt: now, endsAt: now + 9000 }; });
    await p.waitForTimeout(700);
    const before = secs((await read()).t);
    await p.evaluate(() => { window.paused = true; });
    await p.waitForTimeout(4000);
    await p.evaluate(() => { window.paused = false; window.view.update(window.stateAt(Date.now())); });
    const after = secs((await read()).t);
    ok(before >= 8 && after <= before - 3 && after >= before - 5, `retour après 4 s sans mise à jour (onglet masqué) : valeur exacte immédiatement (${before} → ${after}), jamais figée`);
    // Rechargement en plein temps mort : décompte juste dès l'arrivée.
    const endsAt = await p.evaluate(() => window.stop.endsAt);
    await p.reload(); await p.waitForFunction(() => window.ready === true);
    await p.evaluate(e => { window.stop = { kind: "timeout", team: 0, startAt: e - 9000, endsAt: e }; window.view.update(window.stateAt(Date.now())); }, endsAt);
    const rl = await p.evaluate(e => ({ t: document.querySelector("[data-ref=tmo]").textContent, expect: Math.ceil((e - Date.now()) / 1000) }), endsAt);
    ok(Math.abs(secs(rl.t) - rl.expect) <= 1, `rechargement : décompte repris à la bonne valeur (${rl.t}, attendu ≈ ${rl.expect} s)`);
    ok(!errors.length, `aucune erreur (${errors.join(" | ")})`);
  } finally { await b.close(); server.close(); }
  console.log("\n🏁 live_stoppage_countdown_test.js : décomptes des temps morts et des pauses visibles, justes, buzzer unique.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
