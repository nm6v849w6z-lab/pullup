// Bruitages du direct (assets/live/sfx.js, 2026-10-09) : le bon son pour le
// bon événement RÉEL du moteur, une seule fois par événement, jamais pour un
// événement voisin mais invalide (lancer manqué, panier à 2 points, équipe
// adverse…), rien en retard ni coupé, aucun plantage sans Web Audio ni
// fichier, synthèse exécutable de bout en bout.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const ok = m => console.log("✅ " + m);

// Web Audio factice (nœuds et paramètres enregistreurs).
function fakeAudio() {
  const calls = { osc: 0, buf: 0, started: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = extra => ({ connect() {}, disconnect() {}, ...extra });
  class AC {
    constructor() { this.state = "running"; this.currentTime = 0; this.sampleRate = 44100; this.destination = node(); }
    createGain() { return node({ gain: param() }); }
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBiquadFilter() { return node({ type: "", frequency: param(), Q: param() }); }
    createOscillator() { calls.osc++; return node({ type: "", frequency: param(), start() { calls.started++; }, stop() {} }); }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { calls.buf++; return node({ buffer: null, start() { calls.started++; }, stop() {} }); }
    decodeAudioData(b, ok2) { ok2(null); }
    resume() { this.state = "running"; }
    close() {}
  }
  return { AC, calls };
}

(async () => {
  const { createSfx, sfxForEvent, SFX_RULES } = await import(pathToFileURL(path.join(__dirname, "assets/live/sfx.js")).href);
  const H = 0, A = 1;
  // 1. Associations (fonction pure).
  const cases = [
    [{ kind: "freeThrow", team: H, made: 1 }, ["cash"], "lancer franc réussi domicile"],
    [{ kind: "freeThrow", team: H, made: 0 }, [], "lancer franc manqué domicile : jamais le son de réussite"],
    [{ kind: "freeThrow", team: A, made: 1 }, [], "lancer franc réussi extérieur"],
    [{ kind: "shot", team: H, made: true, zone: "three" }, ["siren"], "3 points domicile"],
    [{ kind: "shot", team: H, made: true, zone: "mid" }, [], "2 points domicile : pas de sirène"],
    [{ kind: "shot", team: A, made: true, zone: "three" }, [], "3 points extérieur : pas de sirène"],
    [{ kind: "rebound", team: A, offensive: false, zone: "three" }, [], "3 points domicile MANQUÉ : pas de sirène"],
    [{ kind: "foul", team: A }, ["whistle"], "faute"],
    [{ kind: "technicalFoul", team: H }, ["whistle"], "faute technique"],
    [{ kind: "shot", team: A, made: false, foulType: "shooting" }, ["whistle"], "faute sur tir"],
    [{ kind: "turnover", team: A, tovType: "steal", possessionAfter: H }, ["steal"], "interception domicile"],
    [{ kind: "turnover", team: H, tovType: "steal", possessionAfter: A }, [], "interception extérieure"],
    [{ kind: "turnover", team: A, tovType: "lost", possessionAfter: H }, [], "perte sans interception"],
    [{ kind: "freeThrow", team: A, made: 0 }, ["miss"], "lancer franc raté extérieur"],
    [{ kind: "rebound", team: H, offensive: false }, ["miss"], "tir raté extérieur (rebond défensif domicile)"],
    [{ kind: "rebound", team: A, offensive: true }, ["miss"], "tir raté extérieur (rebond offensif)"],
    [{ kind: "rebound", team: A, offensive: false }, [], "tir raté domicile : pas de « wah-wah »"],
    [{ kind: "quote", team: null }, [], "citation du présentateur"],
  ];
  for (const [e, want, label] of cases) assert.deepStrictEqual(sfxForEvent(e, H), want, label);
  ok(`${cases.length} cas : caisse (lancer franc réussi domicile), sirène (3 pts validé domicile), sifflet (fautes), jingle (interception domicile), « wah-wah » (raté extérieur) — et rien pour les événements voisins invalides (${SFX_RULES.length} règles).`);

  // 2. Une fois par événement, en retard / coupé : rien ; sans Web Audio : pas d'erreur.
  global.localStorage = { _: {}, getItem(k) { return this._[k] || null; }, setItem(k, v) { this._[k] = v; } };
  let now = 1_000_000;
  const sfx = createSfx({ now: () => now, base: "file:///inexistant" });
  await sfx.ready;
  const ev = (id, e, dt = 0) => ({ id, airAt: now - dt, ...e });
  const three = ev(1, { kind: "shot", team: H, made: true, zone: "three" });
  assert.deepStrictEqual(sfx.onEvents([three], {}), ["siren"]);
  now += 50; assert.deepStrictEqual(sfx.onEvents([three], {}), [], "même événement relivré : pas de second son");
  now += 3000; assert.deepStrictEqual(sfx.onEvents([three], {}), [], "toujours pas");
  assert.deepStrictEqual(sfx.onEvents([ev(2, { kind: "freeThrow", team: H, made: 1 }, 6000)], {}), [], "événement en retard : pas de son");
  // Sons distincts ensemble : superposés ; même son en rafale : un seul.
  now += 2000;
  const both = sfx.onEvents([ev(3, { kind: "foul", team: A }), ev(4, { kind: "turnover", team: A, tovType: "steal", possessionAfter: H })], {});
  assert.deepStrictEqual(both.sort(), ["steal", "whistle"]);
  now += 100; assert.deepStrictEqual(sfx.onEvents([ev(5, { kind: "foul", team: H })], {}), [], "deux sifflets en 0,1 s : un seul");
  now += 600; assert.deepStrictEqual(sfx.onEvents([ev(6, { kind: "foul", team: H })], {}), ["whistle"]);
  sfx.setLevel(0); now += 2000;
  assert.deepStrictEqual(sfx.onEvents([ev(7, { kind: "freeThrow", team: H, made: 1 })], {}), [], "coupés : rien");
  sfx.setLevel(2);
  assert.strictEqual(JSON.parse(global.localStorage.getItem("hm-live-sfx")).level, 2, "préférence gardée");
  ok("Un son par événement (relivré : rien), rien pour un événement en retard ni bruitages coupés, sons différents superposés, même son en rafale joué une fois ; sans Web Audio ni fichier : aucune erreur.");

  // 3. Synthèse exécutable (Web Audio factice) + fichier manquant → synthèse.
  const fa = fakeAudio();
  global.window = { AudioContext: fa.AC };
  global.fetch = async url => (String(url).includes("manifest") ? { ok: true, json: async () => ({ version: 1, files: { siren: "absent.mp3" } }) } : { ok: false });
  now = 2_000_000;
  const s2 = createSfx({ now: () => now, base: "http://local/sfx" });
  await s2.ready;
  for (const [i, key] of ["cash", "siren", "whistle", "steal", "miss"].entries()) { now += 1000; assert.strictEqual(s2.play(key, "test"), true, key); }
  await new Promise(r => setTimeout(r, 30));
  assert.ok(fa.calls.osc >= 12 && fa.calls.started >= 12, `synthèse exécutée (${fa.calls.osc} oscillateurs)`);
  ok(`Synthèse des 5 bruitages exécutée sans erreur (${fa.calls.osc} oscillateurs, ${fa.calls.buf} sources de bruit) ; fichier déclaré mais absent (siren) → synthèse.`);
  console.log("\n🏁 live_sfx_test.js : bruitages conformes.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
