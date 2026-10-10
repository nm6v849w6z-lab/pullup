// Ambiance du direct avec de VRAIS fichiers (assets/audio/sfx/manifest.json,
// 2026-10-10) : le fond `amb_bed` est bouclé ; après un panier à domicile,
// la clameur `amb_cheer` tire une variante au hasard, jamais deux fois de
// suite la même ; un 3 points ou un panier décisif prend la version longue
// `amb_cheer_big` ; un panier adverse ne déclenche aucune clameur.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const ok = m => console.log("✅ " + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dir = path.join(__dirname, "assets/audio/sfx");
  const man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  assert.ok(man.files.amb_bed && Array.isArray(man.files.amb_cheer) && man.files.amb_cheer.length >= 2 && man.files.amb_cheer_big, "manifeste : amb_bed, variantes amb_cheer, amb_cheer_big");
  const started = [];   // fichiers réellement lancés (buffer → nom)
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime(v) { this.value = v; } });
  const node = extra => ({ connect() {}, disconnect() {}, ...extra });
  class AC {
    constructor() { this.state = "running"; this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); }
    createGain() { return node({ gain: param() }); }
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBiquadFilter() { return node({ type: "", frequency: param(), Q: param() }); }
    createOscillator() { return node({ type: "", frequency: param(), start() {}, stop() {} }); }
    createBuffer(c, n) { const ch = Array.from({ length: c }, () => new Float32Array(n)); return { getChannelData: i => ch[i], duration: n / 8000, sampleRate: 8000 }; }
    createBufferSource() { const s = node({ buffer: null, loop: false, start() { if (this.buffer && this.buffer.name) started.push({ name: this.buffer.name, loop: this.loop }); }, stop() {} }); return s; }
    decodeAudioData(b, res) { const name = Buffer.from(b).toString(); const d = new Float32Array(8000).fill(0.1); const buf = { name, duration: 1, sampleRate: 8000, getChannelData: () => d }; res(buf); }
    resume() {} close() {}
  }
  global.window = { AudioContext: AC };
  global.localStorage = { _: {}, getItem(k) { return this._[k] || null; }, setItem(k, v) { this._[k] = v; } };
  global.fetch = async url => {
    const f = String(url).replace(/^.*\/sfx\//, "").split("?")[0];
    if (f === "manifest.json") return { ok: true, json: async () => man };
    if (!fs.existsSync(path.join(dir, f))) return { ok: false };
    return { ok: true, arrayBuffer: async () => new Uint8Array(Buffer.from(f)).buffer };
  };
  const { createSfx } = await import(pathToFileURL(path.join(__dirname, "assets/live/sfx.js")).href);
  let t = 9_000_000;
  const sfx = createSfx({ now: () => t, base: "http://x/assets/audio/sfx" });
  await sfx.ready;
  const base = { status: "live", quarter: 2, clock: 300, teams: [{ score: 40 }, { score: 38 }], events: [], possession: 0 };
  sfx.updateAmbience(base);
  await sleep(50);
  assert.ok(started.some(s => s.name === "amb_bed.mp3" && s.loop), "fond amb_bed.mp3 lancé en boucle");
  ok("Fond de public : amb_bed.mp3 bouclé dès que l'ambiance démarre.");

  const cheers = () => started.filter(s => /^amb_cheer/.test(s.name)).map(s => s.name);
  let id = 100;
  for (let i = 0; i < 12; i++) { t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 0, made: true, zone: "mid" }], base); await sleep(5); }
  const c = cheers();
  assert.strictEqual(c.length, 12, "une clameur par panier à domicile");
  assert.ok(c.every(n => man.files.amb_cheer.includes(n)), "panier à 2 points : variantes courtes");
  assert.ok(c.every((n, i) => i === 0 || n !== c[i - 1]), "jamais deux fois de suite la même variante : " + c.join(","));
  assert.ok(new Set(c).size >= 2, "plusieurs variantes utilisées");
  ok(`Panier à domicile : clameur, variantes alternées (${[...new Set(c)].join(", ")}), jamais la même deux fois de suite.`);

  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 0, made: true, zone: "three" }], base); await sleep(5);
  assert.strictEqual(cheers().pop(), "amb_cheer_big.mp3", "3 points à domicile : version longue");
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 0, made: true, zone: "mid" }], { ...base, quarter: 4, clock: 30 }); await sleep(5);
  assert.strictEqual(cheers().pop(), "amb_cheer_big.mp3", "panier décisif : version longue");
  ok("3 points ou panier décisif à domicile : version longue amb_cheer_big.");

  const n0 = cheers().length;
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 1, made: true, zone: "three" }], base); await sleep(5);
  assert.strictEqual(cheers().length, n0, "panier adverse : aucune clameur");
  ok("Panier adverse : pas de clameur (déception à la place).");
  sfx.destroy();
  console.log("\n🏁 live_ambience_files_test.js : fichiers d'ambiance branchés aux bons événements.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
