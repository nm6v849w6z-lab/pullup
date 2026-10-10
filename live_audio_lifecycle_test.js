// Cycle de vie du son du direct (mission live 2026-10-10 : « quand je
// reviens sur l'onglet, le son ne revient pas ; même après actualisation, je
// n'entends plus que le commentateur »). Navigateur réel (Chromium) avec la
// politique de lecture automatique d'un iPhone ÉMULÉE (headless n'en applique
// aucune) : un AudioContext ne démarre / ne reprend QUE pendant un geste.
// Vérifie, catégorie par catégorie (sifflet, sirène 3 pts, cha-ching,
// interception, raté, buzzer, réactions du public, fonds en boucle) :
//   arrivée → bouton « touchez pour réactiver » ; geste → tous les sons ;
//   onglet masqué → silence (le match continue) ; retour → bouton, geste →
//   tous les sons, sans doublon ; vue recréée → même contexte, toujours
//   audible ; rechargement → bouton puis sons. Un seul AudioContext vivant.
const fs = require("fs"), path = require("path"), http = require("http");
const ok = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };
let chromium;
try { chromium = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright").chromium; } catch (e) { /* rien */ }
if (!chromium || !fs.existsSync("/opt/pw-browsers/chromium")) { console.log("ℹ️  Chromium absent : vérification navigateur sautée"); process.exit(0); }
const ROOT = __dirname;
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/live/live.css"></head><body style="background:#000">
<div id="hmLiveRoot" class="hm-live"></div>
<script src="/assets/audio/audio-core.js?v=20261010-22"></script>
<script type="module">
import { createLiveView } from "/assets/live/live-view.js";
const POS = ["M","AS","A","AF","P"];
const team = k => ({ name: k, short: k, score: 10, teamFouls: 0, timeoutsLeft: 3, quarterScores: [10, 0, null, null], players: [0,1,2,3,4].map(i => ({ id: k+":"+i, name: k+i, pos: POS[i], onCourt: true, starter: true, number: i, pts: 0, pf: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, seconds: 0 })) });
let id = 1;
window.S = { status: "live", quarter: 2, clock: 400, possession: 0, shots: [], events: [{ id: id++, kind: "tipoff", type: "period", quarter: 1, clock: 600, airAt: Date.now() - 60000, text: "x" }], teams: [team("A"), team("B")] };
const mk = () => { window.view = createLiveView(document.getElementById("hmLiveRoot"), { court2d: false }); window.view.update(window.S); };
mk();
window.recreate = () => { window.view.destroy(); mk(); };
// Une action de chaque catégorie sonore.
const KINDS = [
  { kind: "foul", type: "foul", team: 1 },                                              // sifflet + huées/réaction
  { kind: "shot", type: "shot", made: true, zone: "three", team: 0 },                   // sirène 3 pts + clameur
  { kind: "freeThrow", type: "freeThrow", made: 1, team: 0, attempt: 1, of: 1 },        // cha-ching + applaudissements
  { kind: "turnover", type: "turnover", tovType: "steal", team: 1, possessionAfter: 0 },// interception
  { kind: "freeThrow", type: "freeThrow", made: 0, team: 1, attempt: 1, of: 1 },        // « wah-wah »
];
let qn = 1;
// Buzzer : une fin de quart-temps DIFFÉRENTE à chaque salve (un buzzer par quart, jamais deux).
window.fire = () => { for (const k of KINDS.concat([{ kind: "quarterEnd", type: "period", quarter: qn++, clock: 0 }])) { const e = { id: id++, quarter: 2, clock: window.S.clock, airAt: Date.now(), text: "e", ...k }; window.S = { ...window.S, events: window.S.events.concat([e]) }; window.view.update(window.S); } };
setInterval(() => { window.S = { ...window.S, clock: Math.max(1, window.S.clock - 1) }; window.view.update(window.S); }, 1000);
window.ready = true;
</script></body></html>`;
const INIT = () => {
  window.__ctx = []; window.__starts = [];
  let gestureAt = -1e9;
  for (const ev of ["pointerdown", "pointerup", "click", "keydown", "touchend"]) window.addEventListener(ev, e => { if (e.isTrusted) gestureAt = performance.now(); }, true);
  const allowed = () => performance.now() - gestureAt < 1000;
  const AC = window.AudioContext, realResume = AC.prototype.resume;
  window.AudioContext = class extends AC {
    constructor(...a) { super(...a); window.__ctx.push(this); if (!allowed()) { const sus = () => AC.prototype.suspend.call(this); sus(); setTimeout(sus, 0); setTimeout(sus, 60); } }
    resume() { return allowed() ? realResume.call(this) : Promise.reject(new DOMException("autoplay", "NotAllowedError")); }
  };
  window.webkitAudioContext = window.AudioContext;
  for (const P of [AudioBufferSourceNode.prototype, OscillatorNode.prototype]) {
    const st = P.start;
    P.start = function (...a) { window.__starts.push({ running: this.context.state === "running", file: !!this.buffer && this.buffer.duration > 0.3 }); return st.apply(this, a); };
  }
  let hidden = false;
  Object.defineProperty(Document.prototype, "hidden", { get() { return hidden; }, configurable: true });
  Object.defineProperty(Document.prototype, "visibilityState", { get() { return hidden ? "hidden" : "visible"; }, configurable: true });
  window.__setHidden = h => { hidden = h; document.dispatchEvent(new Event("visibilitychange")); };
};
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(PAGE); return; }
  const f = path.join(ROOT, path.normalize(u).replace(/^([/\\])+/, ""));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp3": "audio/mpeg" }[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
const SFX_KEYS = ["whistle", "siren", "cash", "steal", "miss", "buzzer"];
(async () => {
  await new Promise(r => server.listen(0, r));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
    await p.addInitScript(INIT);
    const errors = []; p.on("pageerror", e => errors.push(e.message));
    const url = "http://127.0.0.1:" + server.address().port + "/";
    const load = async () => { await p.goto(url); await p.waitForFunction(() => window.ready === true && window.view.audio && window.HMAudio && window.HMAudio.debug().wants.length > 0, null, { timeout: 15000 }); await p.waitForTimeout(1500); };
    const st = () => p.evaluate(() => ({ status: window.HMAudio.status, live: window.__ctx.filter(c => c.state !== "closed").map(c => c.state), made: window.__ctx.length, btn: !document.querySelector("[data-ref=sndResume]").hidden }));
    // Une salve de chaque catégorie ; renvoie les bruitages joués, réactions, sources démarrées sur un contexte actif.
    const burst = async () => {
      const before = await p.evaluate(() => ({ log: window.view.audio.debug().log.length, react: window.view.audio.debug().ambLog.filter(x => x.kind === "react").length, starts: window.__starts.filter(s => s.running).length }));
      await p.evaluate(() => window.fire());
      await p.waitForTimeout(2500);
      return p.evaluate(b => { const d = window.view.audio.debug(); return { keys: d.log.slice(b.log).map(x => x.key), reacts: d.ambLog.filter(x => x.kind === "react").slice(b.react).map(x => x.react), started: window.__starts.filter(s => s.running).length - b.starts, files: window.__starts.filter(s => s.running && s.file).length }; }, before);
    };
    const checkAll = (r, lbl) => {
      for (const k of SFX_KEYS) ok(r.keys.filter(x => x === k).length === 1, `${lbl} : bruitage « ${k} » joué exactement une fois (${r.keys.join(",")})`);
      ok(r.reacts.length >= 2 && r.reacts.includes("cheer"), `${lbl} : réactions du public jouées (${r.reacts.join(",")})`);
      ok(r.started >= SFX_KEYS.length, `${lbl} : ${r.started} sources audio réellement démarrées sur un contexte actif`);
    };

    await load();
    let s = await st();
    ok(s.made === 1, `un seul AudioContext pour tout le direct (${s.made})`);
    ok(s.status === "blocked" && s.btn, `arrivée sans geste : son bloqué par le navigateur → bouton « touchez pour le réactiver » visible (${JSON.stringify(s)})`);
    await p.click("[data-ref=sndResume]"); await p.waitForTimeout(800);
    s = await st();
    ok(s.status === "running" && !s.btn && s.live.join() === "running", `geste sur le bouton : son actif, bouton masqué (${JSON.stringify(s)})`);
    checkAll(await burst(), "premier chargement");
    ok(await p.evaluate(() => window.__starts.some(s => s.running && s.file)), "fichiers d'ambiance (fond, réactions) joués, pas seulement la synthèse");

    await p.evaluate(() => window.__setHidden(true)); await p.waitForTimeout(500);
    s = await st();
    ok(s.live.join() === "suspended", `onglet masqué : contexte en pause (${s.live})`);
    const hid = await burst();
    ok(hid.keys.length === 0 && hid.started === 0, `onglet masqué : aucun son (${JSON.stringify(hid)})`);
    await p.waitForTimeout(3000);

    await p.evaluate(() => window.__setHidden(false)); await p.waitForTimeout(1500);
    s = await st();
    ok(s.status === "blocked" && s.btn, `retour sur l'onglet, reprise refusée sans geste : bouton explicite visible, pas de silence inexpliqué (${JSON.stringify(s)})`);
    await p.click("[data-ref=sndResume]"); await p.waitForTimeout(800);
    s = await st();
    ok(s.status === "running" && s.made === 1, `retour + geste : son rétabli sur le MÊME contexte (${JSON.stringify(s)})`);
    checkAll(await burst(), "après retour sur l'onglet");

    await p.evaluate(() => window.recreate()); await p.waitForTimeout(1500);
    s = await st();
    ok(s.made === 1 && s.status === "running" && !s.btn, `vue du direct recréée (nouvelle entrée) : même contexte, toujours actif (${JSON.stringify(s)})`);
    ok(await p.evaluate(() => window.HMAudio.debug().wants.length === 1), "une seule vue enregistrée auprès du noyau (pas de doublon)");
    checkAll(await burst(), "après nouvelle entrée dans le direct");

    await load();
    s = await st();
    ok(s.status === "blocked" && s.btn, `rechargement : bouton visible (${JSON.stringify(s)})`);
    await p.mouse.click(640, 5); await p.waitForTimeout(800);
    s = await st();
    ok(s.status === "running" && !s.btn, `rechargement + n'importe quel geste sur la page : son actif (${JSON.stringify(s)})`);
    checkAll(await burst(), "après rechargement");
    ok(!errors.length, `aucune erreur (${errors.join(" | ")})`);
  } finally { await b.close(); server.close(); }
  console.log("\n🏁 live_audio_lifecycle_test.js : le son du direct revient (onglet, rechargement, nouvelle entrée), catégorie par catégorie.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
