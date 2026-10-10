// Ambiance de salle du direct (assets/live/sfx.js, 2026-10-10) : l'humeur
// du public suit l'état RÉEL du match (possession, lancers francs, arrêts),
// les chants « DE-FENSE » ne passent qu'en défense et s'arrêtent au
// changement de possession, les réactions correspondent à l'équipe et au
// résultat réel de l'action, une seule fois par événement ; l'ambiance se
// coupe sans couper les bruitages (et inversement).
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const ok = m => console.log("✅ " + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fakeAudio() {
  const calls = { osc: 0, buf: 0, started: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime(v) { this.value = v; } });
  const node = extra => ({ connect() {}, disconnect() {}, ...extra });
  class AC {
    constructor() { this.state = "running"; this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); }
    createGain() { return node({ gain: param() }); }
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBiquadFilter() { return node({ type: "", frequency: param(), Q: param() }); }
    createOscillator() { calls.osc++; return node({ type: "", frequency: param(), start() { calls.started++; }, stop() {} }); }
    createBuffer(c, n) { const ch = Array.from({ length: c }, () => new Float32Array(n)); return { getChannelData: i => ch[i] }; }
    createBufferSource() { calls.buf++; return node({ buffer: null, loop: false, start() { calls.started++; }, stop() {} }); }
    decodeAudioData(b, ok2) { ok2(null); }
    resume() { this.state = "running"; }
    close() {}
  }
  return { AC, calls };
}

(async () => {
  const { ambienceMode, crowdReactionFor, createSfx } = await import(pathToFileURL(path.join(__dirname, "assets/live/sfx.js")).href);
  const H = 0, A = 1, now = 5_000_000;
  const base = { status: "live", quarter: 2, clock: 300, teams: [{ score: 40 }, { score: 38 }], events: [] };

  // 1. Mode d'ambiance (fonction pure).
  const M = (extra, label, want) => { assert.strictEqual(ambienceMode({ ...base, ...extra }, now, H), want, label); };
  M({ possession: H }, "domicile en attaque", "offense");
  M({ possession: A }, "domicile en défense", "defense");
  M({ possession: A, nextAction: { kind: "freeThrow", team: H, airAt: now + 5000 } }, "lancer franc domicile annoncé", "ftHome");
  M({ possession: H, nextAction: { kind: "freeThrow", team: A, airAt: now + 5000 } }, "lancer franc adverse annoncé", "ftAway");
  M({ possession: A, nextAction: { kind: "freeThrow", team: H, airAt: now + 30000 } }, "lancer lointain : pas encore", "defense");
  M({ possession: H, events: [{ kind: "freeThrow", team: H, attempt: 1, of: 2 }, { kind: "substitution" }] }, "série de lancers en cours (changement entre deux)", "ftHome");
  M({ possession: A, events: [{ kind: "freeThrow", team: H, attempt: 2, of: 2 }] }, "série terminée : retour au jeu", "defense");
  M({ possession: H, stoppage: { kind: "timeout" } }, "temps mort", "break");
  M({ status: "halftime", possession: H }, "mi-temps", "break");
  M({ status: "pregame" }, "avant-match", "pregame");
  M({ status: "final" }, "fin de match", "final");
  ok("Mode d'ambiance : attaque / défense selon la possession réelle, lancers francs domicile / adverses (annoncés ou série en cours), arrêts de jeu, avant et après match.");

  // 2. Réactions du public (fonction pure) : bonne équipe, bon résultat.
  const R = (e, S, want, label) => { const r = crowdReactionFor(e, { ...base, ...S }, H); assert.deepStrictEqual(r && { kind: r.kind, i: +r.intensity.toFixed(2) }, want, label); };
  R({ kind: "shot", team: H, made: true, zone: "mid" }, {}, { kind: "cheer", i: 1 }, "2 points domicile : clameur");
  R({ kind: "shot", team: H, made: true, zone: "three" }, {}, { kind: "cheer", i: 1.4 }, "3 points domicile : clameur plus forte");
  R({ kind: "shot", team: A, made: true, zone: "mid" }, {}, { kind: "groan", i: 1 }, "panier adverse : déception");
  R({ kind: "shot", team: A, made: true, zone: "three" }, {}, { kind: "groan", i: 1.3 }, "3 points adverse : grande déception");
  R({ kind: "rebound", team: H, offensive: false }, {}, { kind: "cheer", i: 0.7 }, "tir adverse manqué : le public se réjouit");
  R({ kind: "rebound", team: A, offensive: false }, {}, { kind: "groan", i: 0.6 }, "tir domicile manqué : déception");
  R({ kind: "freeThrow", team: A, made: 0 }, {}, { kind: "cheer", i: 0.8 }, "lancer adverse manqué");
  R({ kind: "freeThrow", team: H, made: 1 }, {}, { kind: "applause", i: 0.8 }, "lancer domicile réussi");
  R({ kind: "quarterEnd" }, {}, { kind: "applause", i: 1.3 }, "fin de quart-temps : applaudissements nourris");
  R({ kind: "timeout", type: "timeout", team: H }, {}, { kind: "applause", i: 0.6 }, "temps mort : applaudissements");
  R({ kind: "shot", team: H, made: true, zone: "mid" }, { quarter: 4, clock: 40 }, { kind: "cheer", i: 1.5 }, "panier décisif en fin de match : plus fort");
  assert.strictEqual(crowdReactionFor({ kind: "substitution", team: H }, base, H), null, "changement : rien");
  // Priorité 2 (2026-10-10) : contres, contre-attaques, fautes contre l'équipe à domicile.
  R({ kind: "shot", team: A, made: false, blocked: true }, {}, { kind: "wow", i: 1.2 }, "contre de l'équipe à domicile : « Ooooh ! »");
  assert.strictEqual(crowdReactionFor({ kind: "shot", team: A, made: false, blocked: true }, base, H).also.kind, "cheer", "… puis grande clameur");
  R({ kind: "injury", team: H }, {}, { kind: "gasp", i: 0.9 }, "blessure : le public retient son souffle");
  R({ kind: "technicalEjection", team: H }, {}, { kind: "jeer", i: 1.5 }, "expulsion d'un joueur à domicile : forte protestation");
  R({ kind: "foulOut", team: A }, {}, { kind: "cheer", i: 1 }, "5e faute d'un adversaire : la salle se réjouit");
  R({ kind: "shot", team: H, made: false, blocked: true }, {}, { kind: "groan", i: 0.8 }, "domicile contré : déception");
  R({ kind: "shot", team: H, made: true, zone: "paint", shotType: "fastbreak" }, {}, { kind: "cheer", i: 1.3 }, "contre-attaque au cercle : grand moment");
  R({ kind: "foul", team: H }, {}, { kind: "jeer", i: 1 }, "faute sifflée contre le domicile : protestation");
  R({ kind: "technicalFoul", team: H }, {}, { kind: "jeer", i: 1.4 }, "technique contre le domicile : forte protestation");
  R({ kind: "shot", team: A, made: false, foulType: "shooting" }, {}, { kind: "jeer", i: 1 }, "faute sur tir du domicile : protestation");
  assert.strictEqual(crowdReactionFor({ kind: "foul", team: A }, base, H), null, "faute de l'adversaire : pas de huées");
  assert.strictEqual(crowdReactionFor({ kind: "shot", team: H, made: false, foulType: "shooting" }, base, H), null, "faute sur tir subie par le domicile : pas de huées");
  ok("Réactions : clameur sur un panier domicile (plus forte à 3 points et en fin de match serrée), déception sur un panier adverse ou un tir domicile manqué, joie sur un tir ou lancer adverse manqué.");

  // 3. Moteur d'ambiance (Web Audio factice) : transitions, chants, doublons.
  const { AC, calls } = fakeAudio();
  global.window = { AudioContext: AC };
  global.localStorage = { _: {}, getItem(k) { return this._[k] || null; }, setItem(k, v) { this._[k] = v; } };
  let t = now;
  const sfx = createSfx({ now: () => t, base: "file:///inexistant" });
  await sfx.ready;
  const S = { ...base, possession: H };
  assert.strictEqual(sfx.updateAmbience(S), "offense");
  assert.strictEqual(sfx.updateAmbience(S), null, "même état : rien ne change (pas de relance)");
  const nodesAfterBed = calls.buf;
  for (let i = 0; i < 20; i++) sfx.updateAmbience(S);
  assert.strictEqual(calls.buf, nodesAfterBed, "aucune nouvelle source audio à chaque mise à jour");
  // Défense : chants ; changement de possession : plus de chant.
  assert.strictEqual(sfx.updateAmbience({ ...S, possession: A }), "defense");
  await sleep(1200);
  const chants = () => sfx.debug().ambLog.filter(x => x.kind === "chant").length;
  const c1 = chants();
  assert.ok(c1 >= 1, "chant « DE-FENSE » en défense");
  assert.strictEqual(sfx.updateAmbience({ ...S, possession: H }), "offense");
  await sleep(3800);
  assert.strictEqual(chants(), c1, "possession reprise : plus aucun chant de défense");
  // Lancer franc domicile : silence ; adverse : huées ; retour au jeu.
  assert.strictEqual(sfx.updateAmbience({ ...S, nextAction: { kind: "freeThrow", team: H, airAt: t + 3000 } }), "ftHome");
  await sleep(3000);
  assert.strictEqual(chants(), c1, "lancer franc domicile : pas de chant");
  assert.strictEqual(sfx.updateAmbience({ ...S, possession: A, nextAction: { kind: "freeThrow", team: A, airAt: t + 3000 } }), "ftAway");
  assert.strictEqual(sfx.updateAmbience({ ...S, possession: A }), "defense");
  assert.strictEqual(sfx.updateAmbience({ ...S, stoppage: { kind: "timeout" } }), "break");
  const modes = sfx.debug().ambLog.filter(x => x.kind === "mode").map(x => x.mode);
  assert.deepStrictEqual(modes, ["offense", "defense", "offense", "ftHome", "ftAway", "defense", "break"]);
  // 24 s de l'adversaire : tension en défense à 6 s ou moins, pas en attaque.
  const tens = () => sfx.debug().ambLog.filter(x => x.kind === "tension").map(x => x.on);
  sfx.updateAmbience({ ...S, possession: A, shotClock: 12 });
  sfx.updateAmbience({ ...S, possession: A, shotClock: 5 });
  sfx.updateAmbience({ ...S, possession: A, shotClock: 3 });
  sfx.updateAmbience({ ...S, possession: H, shotClock: 4 });
  assert.deepStrictEqual(tens(), [true, false], "tension des 24 s en défense seulement : " + JSON.stringify(tens()));
  ok(`Transitions : ${modes.join(" → ")} ; chants seulement en défense, arrêtés dès la reprise de possession ; aucune relance ni nouvelle source à chaque mise à jour.`);

  // 4. Réactions déclenchées par les vrais événements, une fois chacun.
  t += 10000;
  const e3 = { id: 50, airAt: t, kind: "shot", team: H, made: true, zone: "three" };
  assert.deepStrictEqual(sfx.onEvents([e3], S), ["siren"], "3 points : la sirène (bruitage)");
  sfx.onEvents([e3], S); sfx.onEvents([e3], S);
  const reacts = () => sfx.debug().ambLog.filter(x => x.kind === "react");
  assert.strictEqual(reacts().length, 1, "même événement relivré : une seule réaction");
  assert.strictEqual(reacts()[0].react, "cheer");
  t += 2000;
  const miss = { id: 51, airAt: t, kind: "rebound", team: H, offensive: false };
  assert.deepStrictEqual(sfx.onEvents([miss], S), [], "tir adverse manqué : AUCUN bruitage de lancer raté");
  assert.strictEqual(reacts().pop().react, "cheer", "… mais le public réagit");
  t += 2000;
  assert.deepStrictEqual(sfx.onEvents([{ id: 52, airAt: t, kind: "freeThrow", team: A, made: 0 }], S), ["miss"], "lancer franc adverse manqué : bruitage dédié");
  ok("Événements réels : 3 points → sirène + clameur, une seule fois même relivré ; tir adverse manqué → réaction du public sans le son du lancer raté ; lancer adverse manqué → son dédié.");

  // 5. Réglages indépendants.
  sfx.setAmbLevel(0); t += 3000;
  const nR = reacts().length;
  assert.deepStrictEqual(sfx.onEvents([{ id: 53, airAt: t, kind: "shot", team: H, made: true, zone: "three" }], S), ["siren"], "ambiance coupée : bruitages toujours là");
  assert.strictEqual(reacts().length, nR, "ambiance coupée : pas de réaction du public");
  sfx.setAmbLevel(2); sfx.setLevel(0); t += 3000;
  assert.deepStrictEqual(sfx.onEvents([{ id: 54, airAt: t, kind: "shot", team: H, made: true, zone: "three" }], S), [], "bruitages coupés : pas de sirène");
  assert.strictEqual(reacts().length, nR + 1, "… mais l'ambiance réagit toujours");
  assert.strictEqual(JSON.parse(global.localStorage.getItem("hm-live-sfx")).amb, 2, "préférence d'ambiance gardée");
  // Retour immédiat au toucher du bouton : une courte clameur (pas une
  // « réaction » comptée) ; ambiance coupée : rien.
  const previews = () => sfx.debug().ambLog.filter(x => x.kind === "preview").length;
  const p0 = previews(), r0 = reacts().length;
  sfx.setAmbLevel(3);
  assert.strictEqual(previews(), p0 + 1, "bouton Ambiance : clameur d'essai au nouveau volume");
  assert.strictEqual(reacts().length, r0, "… sans compter comme une réaction de match");
  sfx.setAmbLevel(0);
  assert.strictEqual(previews(), p0 + 1, "ambiance coupée : pas de clameur d'essai");
  sfx.destroy();
  ok("Ambiance et bruitages se règlent séparément (l'un coupé, l'autre continue) ; préférence gardée ; clameur d'essai au toucher du bouton.");
  console.log("\n🏁 live_ambience_test.js : ambiance de salle conforme.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
