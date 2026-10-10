// Mission live 2026-10-10 — temps et audio (assets/live/sfx.js), tests 19-24 :
//  19  buzzer au passage du chrono à 00:00 (une seule source de temps : le
//      chrono affiché), et à la fin d'un temps mort / d'une pause ;
//  20  un seul buzzer par fin de période (00:00 puis événement quarterEnd) ;
//  21  aucun chant défensif avant la possession établie (début de période,
//      entre-deux, possession confirmée depuis 1,2 s) ;
//  22  plus aucun son quand on quitte la page du direct ;
//  23  retour sur la page : aucun lecteur audio supplémentaire ;
//  24  plus aucun son après la clôture du match (et pas de reprise au
//      rechargement d'un match terminé).
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const ok = m => console.log("✅ " + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fakeAudio() {
  const calls = { ctx: 0, suspend: 0, resume: 0, closed: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime(v) { this.value = v; } });
  const node = extra => ({ connect() {}, disconnect() {}, ...extra });
  class AC {
    constructor() { calls.ctx++; this.state = "running"; this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); }
    createGain() { return node({ gain: param() }); }
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBiquadFilter() { return node({ type: "", frequency: param(), Q: param() }); }
    createOscillator() { return node({ type: "", frequency: param(), start() {}, stop() {} }); }
    createBuffer(c, n) { const ch = Array.from({ length: c }, () => new Float32Array(n)); return { getChannelData: i => ch[i] }; }
    createBufferSource() { return node({ buffer: null, loop: false, start() {}, stop() {} }); }
    decodeAudioData(b, ok2) { ok2(null); }
    suspend() { calls.suspend++; this.state = "suspended"; return Promise.resolve(); }
    resume() { calls.resume++; this.state = "running"; return Promise.resolve(); }
    close() { calls.closed++; this.state = "closed"; }
  }
  return { AC, calls };
}

(async () => {
  const { buzzerCue, ambienceMode, createSfx } = await import(pathToFileURL(path.join(__dirname, "assets/live/sfx.js")).href);
  const H = 0, A = 1, now = 5_000_000;
  const live = (o = {}) => ({ status: "live", quarter: 2, clock: 30, teams: [{ score: 40 }, { score: 38 }], events: [{ id: 1, kind: "shot", team: 0 }], possession: H, ...o });

  // ---------- 19. Buzzer : 00:00 et fin d'arrêt ----------
  assert.strictEqual(buzzerCue(live({ clock: 1 }), live({ clock: 0 }), now), "q2", "chrono 00:01 → 00:00 : buzzer de fin du 2e quart");
  assert.strictEqual(buzzerCue(live({ clock: 3 }), live({ clock: 2 }), now), null, "chrono qui tourne : rien");
  assert.strictEqual(buzzerCue(live({ clock: 0 }), live({ clock: 0 }), now), null, "déjà à 00:00 : rien");
  assert.strictEqual(buzzerCue(live({ clock: 400 }), live({ clock: 0 }), now), null, "saut dans le temps (400 s → 0) : pas de buzzer");
  const st = { kind: "timeout", startAt: now - 60000, endsAt: now };
  assert.strictEqual(buzzerCue(live({ stoppage: st }), live({ stoppage: null }), now + 100), "s" + st.startAt, "fin de temps mort : buzzer");
  const qb = { kind: "quarter-break", startAt: now - 120000, endsAt: now };
  assert.strictEqual(buzzerCue(live({ stoppage: qb }), live({ stoppage: null }), now + 50), "s" + qb.startAt, "fin de pause : buzzer");
  assert.strictEqual(buzzerCue(live({ stoppage: st }), live({ stoppage: null }), now - 30000), null, "arrêt quitté bien avant sa fin (saut) : pas de buzzer");
  assert.strictEqual(buzzerCue(live({ quarter: 4, clock: 0 }), live({ status: "final", quarter: 4, clock: 0 }), now), "q4", "fin du match : buzzer (clé du 4e quart)");
  ok("19. Buzzer au passage à 00:00, à la fin d'un temps mort et d'une pause ; rien sur un saut dans le temps.");

  // ---------- 20-24 : moteur audio (Web Audio factice) ----------
  const { AC, calls } = fakeAudio();
  global.window = { AudioContext: AC, addEventListener() {}, removeEventListener() {} };
  const listeners = {};
  global.document = { hidden: false, visibilityState: "visible", addEventListener(k, f) { (listeners[k] = listeners[k] || []).push(f); }, removeEventListener(k, f) { listeners[k] = (listeners[k] || []).filter(x => x !== f); } };
  global.localStorage = { _: {}, getItem(k) { return this._[k] || null; }, setItem(k, v) { this._[k] = v; } };
  let t = now;
  const sfx = createSfx({ now: () => t, base: "file:///inexistant", closeAfterMs: 60 });
  await sfx.ready;
  const buzzers = () => sfx.debug().log.filter(x => x.key === "buzzer").length;
  assert.ok(sfx.buzz("q2"), "premier buzzer de la fin du 2e quart");
  t += 2200;
  sfx.onEvents([{ id: 50, kind: "quarterEnd", quarter: 2, team: null, airAt: t }], live({ clock: 0 }), { home: H });
  assert.strictEqual(buzzers(), 1, "00:00 puis événement de fin de quart : UN seul buzzer");
  t += 1000; assert.strictEqual(sfx.buzz("q2"), false, "même clé : jamais deux fois");
  sfx.onEvents([{ id: 51, kind: "quarterEnd", quarter: 3, team: null, airAt: t }], live({ quarter: 3, clock: 0 }), { home: H });
  assert.strictEqual(buzzers(), 2, "fin de quart sans passage visible par 00:00 : buzzer (une fois)");
  ok("20. Chaque fin de période : un seul buzzer (00:00 ou, à défaut, l'événement de fin de quart).");

  // 21. Chant défensif.
  const evQS = [{ id: 1, kind: "quarterStart", quarter: 3 }];
  assert.strictEqual(ambienceMode(live({ possession: A, events: evQS }), now, H), "neutral", "début de quart (avant la première action) : pas de défense");
  assert.strictEqual(ambienceMode(live({ possession: null, events: [] }), now, H), "neutral", "avant l'entre-deux : neutre");
  assert.strictEqual(ambienceMode(live({ possession: A, clock: 0 }), now, H), "neutral", "chrono à 00:00 : plus d'attaque ni de défense");
  t += 5000;
  sfx.updateAmbience(live({ possession: H }), { home: H });
  assert.strictEqual(sfx.ambMode, "offense");
  sfx.updateAmbience(live({ possession: A }), { home: H });
  assert.notStrictEqual(sfx.ambMode, "defense", "possession adverse pas encore confirmée : pas de chant");
  t += 600; sfx.updateAmbience(live({ possession: A }), { home: H });
  assert.notStrictEqual(sfx.ambMode, "defense", "0,6 s : toujours pas");
  t += 700; sfx.updateAmbience(live({ possession: A }), { home: H });
  assert.strictEqual(sfx.ambMode, "defense", "1,3 s de possession adverse confirmée : défense (chant)");
  t += 100; sfx.updateAmbience(live({ possession: H }), { home: H });
  t += 300; sfx.updateAmbience(live({ possession: A }), { home: H });
  assert.notStrictEqual(sfx.ambMode, "defense", "possession qui rebascule 0,3 s : pas de chant");
  ok("21. Chant défensif seulement après 1,2 s de possession adverse confirmée ; jamais avant l'entre-deux ni à 00:00.");

  // 22-23. Navigation.
  const ctxBefore = calls.ctx;
  sfx.setAudible(false);
  assert.strictEqual(sfx.ambMode, "off", "page quittée : ambiance coupée");
  // Noyau audio partagé (assets/audio/audio-core.js, 2026-10-10) : la vue
  // se retire (plus aucun module ne veut de son → contexte mis en pause après
  // un court délai, pour qu'une vue qui en remplace une autre reprenne la
  // main sans suspension) ; sa sortie propre est coupée tout de suite.
  assert.ok(calls.suspend >= 1 || (global.window.HMAudio && global.window.HMAudio.debug().wants.length === 0), "page quittée : la vue ne demande plus de son (contexte mis en pause)");
  t += 1000;
  assert.strictEqual(sfx.play("whistle", "test"), false, "page quittée : aucun bruitage");
  sfx.onEvents([{ id: 60, kind: "shot", made: true, zone: "three", team: H, airAt: t }], live(), { home: H });
  assert.ok(!sfx.debug().ambLog.some(x => x.kind === "react" && x.at === t), "page quittée : aucune réaction du public");
  t += 1000; sfx.updateAmbience(live({ possession: H }), { home: H });
  assert.strictEqual(sfx.ambMode, "off", "page quittée : l'ambiance ne repart pas toute seule");
  ok("22. Page quittée : ambiance, bruitages et réactions coupés, contexte audio en pause.");
  sfx.setAudible(true);
  t += 1000; sfx.updateAmbience(live({ possession: H }), { home: H });
  assert.strictEqual(sfx.ambMode, "offense", "retour sur la page : l'ambiance reprend sur l'état courant");
  assert.strictEqual(calls.ctx, ctxBefore, "retour sur la page : aucun nouveau lecteur audio");
  ok("23. Retour sur la page : l'ambiance reprend, aucun lecteur audio supplémentaire.");

  // 24. Fin du match.
  t += 1000; sfx.updateAmbience(live({ status: "final", possession: null }), { home: H });
  assert.ok(sfx.debug().ambLog.some(x => x.kind === "finalReaction"), "coup de sifflet final : réaction du public");
  await sleep(120);
  assert.ok(sfx.closed, "clôture du direct après le délai");
  t += 5000;
  assert.strictEqual(sfx.play("whistle", "après"), false, "après la clôture : aucun bruitage");
  sfx.updateAmbience(live({ status: "final" }), { home: H });
  assert.strictEqual(sfx.ambMode, "off", "après la clôture : silence");
  assert.strictEqual(sfx.buzz("q9"), false, "après la clôture : aucun buzzer");
  // Rediffusion ramenée avant la fin : le son reprend.
  sfx.reopen(); t += 1000;
  assert.strictEqual(sfx.play("whistle", "reprise"), true, "rediffusion ramenée avant la fin : bruitages de retour");
  t += 1000; sfx.updateAmbience(live({ possession: H }), { home: H });
  assert.strictEqual(sfx.ambMode, "offense", "rediffusion ramenée avant la fin : ambiance de retour");
  // Rechargement sur un match déjà terminé : silence immédiat, pas de clameur.
  const s2 = createSfx({ now: () => t, base: "file:///inexistant" });
  await s2.ready;
  s2.updateAmbience(live({ status: "final" }), { home: H });
  assert.ok(s2.closed && s2.ambMode === "off", "match terminé au chargement : état terminal immédiat");
  assert.ok(!s2.debug().ambLog.some(x => x.kind === "finalReaction"), "match terminé au chargement : pas de réaction finale rejouée");
  // Détruit avant la fin du chargement : jamais de contexte recréé ensuite.
  const n0 = calls.ctx;
  const s3 = createSfx({ now: () => t, base: "file:///inexistant" });
  s3.destroy();
  await s3.ready; await sleep(20);
  assert.strictEqual(calls.ctx, n0, "vue détruite : aucun contexte audio créé après coup");
  sfx.destroy(); s2.destroy();
  ok("24. Fin du match : plus aucun son après la clôture, ni au rechargement ; aucun lecteur créé après destruction.");
  console.log("\n🏁 live_buzzer_audio_test.js");
})().catch(e => { console.error(e); process.exit(1); });
