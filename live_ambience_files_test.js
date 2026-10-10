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
  const listeners = {};
  global.window = { AudioContext: AC, addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); }, removeEventListener() {}, __cue: d => (listeners["hm-crowd-cue"] || []).forEach(f => f({ detail: d })) };
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

  // Défense : le chant enregistré (amb_chant, une variante) tourne en boucle ;
  // pas de chant synthétisé en plus ; attaque : il s'éteint (log du mode).
  sfx.updateAmbience({ ...base, possession: 1 });
  await sleep(50);
  const chantSrc = started.filter(s => /^amb_chant_\d\.mp3$/.test(s.name));
  assert.strictEqual(chantSrc.length, 1, "chant enregistré lancé une fois : " + JSON.stringify(started));
  assert.ok(chantSrc[0].loop, "chant en boucle");
  await sleep(1200);
  assert.ok(sfx.debug().ambLog.filter(x => x.kind === "chant").every(x => x.file), "aucun chant synthétisé quand le fichier existe");
  sfx.updateAmbience({ ...base, possession: 0 });
  sfx.updateAmbience({ ...base, possession: 1 });
  await sleep(50);
  assert.strictEqual(started.filter(s => /^amb_chant_/.test(s.name)).length, 1, "retour en défense : même boucle remontée, pas relancée");
  ok(`Défense : chant enregistré (${chantSrc[0].name}) en boucle, monté en défense et coupé en attaque, jamais relancé ; plus de chant synthétisé.`);

  // Lancer franc adverse : la boucle de huées enregistrée monte (créée une
  // fois, jamais relancée) ; pas de sifflets synthétisés en plus.
  const boos = () => started.filter(s => s.name === "amb_boo.mp3");
  sfx.updateAmbience({ ...base, possession: 1, nextAction: { kind: "freeThrow", team: 1, airAt: t + 3000 } });
  await sleep(50);
  assert.strictEqual(sfx.ambMode, "ftAway");
  assert.ok(boos().length === 1 && boos()[0].loop, "huées enregistrées en boucle : " + JSON.stringify(started.map(s => s.name)));
  sfx.updateAmbience({ ...base, possession: 0 });
  sfx.updateAmbience({ ...base, possession: 1, nextAction: { kind: "freeThrow", team: 1, airAt: t + 3000 } });
  await sleep(50);
  assert.strictEqual(boos().length, 1, "huées remontées, pas relancées");
  sfx.updateAmbience({ ...base, possession: 0 });
  ok("Lancer franc adverse : huées enregistrées (amb_boo.mp3) en boucle, remontées sans relance ; plus de sifflets synthétisés.");

  // Encouragements en attaque (amb_offense), salle calme (amb_bed_calm),
  // ébullition en fin de match serrée (amb_bed_hot) : boucles créées une
  // seule fois ; l'état « bouillant » suit le score et le temps réels.
  const once = n => started.filter(s => s.name === n);
  sfx.updateAmbience({ ...base, possession: 0 });
  sfx.updateAmbience({ ...base, status: "pregame" });
  sfx.updateAmbience({ ...base, possession: 0 });
  await sleep(50);
  for (const n of ["amb_offense.mp3", "amb_bed_calm.mp3", "amb_bed_hot.mp3"]) assert.ok(once(n).length === 1 && once(n)[0].loop, n + " : une boucle, créée une fois");
  const hotLog = () => sfx.debug().ambLog.filter(x => x.kind === "hot").map(x => x.on);
  sfx.updateAmbience({ ...base, possession: 0, quarter: 4, clock: 90, teams: [{ score: 80 }, { score: 78 }] });
  sfx.updateAmbience({ ...base, possession: 1, quarter: 4, clock: 80, teams: [{ score: 80 }, { score: 78 }] });
  sfx.updateAmbience({ ...base, possession: 1, quarter: 4, clock: 70, teams: [{ score: 90 }, { score: 70 }] });
  assert.deepStrictEqual(hotLog(), [true, false], "salle en ébullition en fin de match serrée seulement : " + JSON.stringify(hotLog()));
  assert.ok(!sfx.debug().ambLog.some(x => x.kind === "mode" && /hot/.test(x.mode)), "l'ébullition ne change pas le mode");
  sfx.updateAmbience({ ...base, possession: 0 });
  await sleep(50);
  assert.ok(["amb_offense.mp3", "amb_bed_calm.mp3", "amb_bed_hot.mp3"].every(n => once(n).length === 1), "aucune relance des boucles");
  ok("Attaque : encouragements enregistrés ; avant-match / pauses : salle calme ; fin de match serrée : salle en ébullition — boucles créées une fois, jamais relancées.");

  const cheers = () => started.filter(s => /^amb_cheer/.test(s.name)).map(s => s.name);
  let id = 100;
  for (let i = 0; i < 12; i++) {
    t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 0, made: true, zone: "mid" }], base); await sleep(5);
    if (i % 3 === 2) { t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "freeThrow", team: 1, made: 1 }], base); await sleep(5); }   // pas de série 8-0
  }
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
  const groans = () => started.filter(s => /^amb_groan/.test(s.name)).map(s => s.name);
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 1, made: true, zone: "three" }], base); await sleep(5);
  assert.strictEqual(cheers().length, n0, "panier adverse : aucune clameur");
  assert.strictEqual(groans().pop(), "amb_groan_big.mp3", "3 points adverse : grand « ohhh »");
  for (let i = 0; i < 8; i++) { t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 1, made: true, zone: "mid" }], base); await sleep(5); }
  const g = groans().slice(1);
  assert.strictEqual(g.length, 8, "une déception par panier adverse");
  assert.ok(g.every(n => man.files.amb_groan.includes(n)) && g.every((n, i) => i === 0 || n !== g[i - 1]), "variantes courtes, jamais la même deux fois de suite : " + g.join(","));
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "rebound", team: 1, offensive: false }], base); await sleep(5);
  assert.strictEqual(groans().length, 10, "tir manqué à domicile : déception");
  assert.strictEqual(cheers().length, n0, "… et aucune clameur");
  ok(`Panier adverse : déception (${[...new Set(g)].join(", ")}), grand « ohhh » sur un 3 points ; tir manqué à domicile : déception ; jamais de clameur.`);
  // Applaudissements : lancer franc réussi à domicile et temps mort →
  // variantes courtes ; fin de quart-temps → version longue.
  const claps = () => started.filter(s => /^amb_applause/.test(s.name)).map(s => s.name);
  const fts = [];
  for (let i = 0; i < 6; i++) { t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "freeThrow", team: 0, made: 1, attempt: 1, of: 1 }], base); await sleep(5); }
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "timeout", type: "timeout", team: 1 }], base); await sleep(5);
  const c2 = claps();
  assert.strictEqual(c2.length, 7, "lancers réussis et temps mort : applaudissements");
  assert.ok(c2.every(n => man.files.amb_applause.includes(n)) && c2.every((n, i) => i === 0 || n !== c2[i - 1]), "variantes courtes, jamais la même deux fois de suite : " + c2.join(","));
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "quarterEnd", type: "period" }], base); await sleep(5);
  assert.strictEqual(claps().pop(), "amb_applause_big.mp3", "fin de quart-temps : version longue");
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "freeThrow", team: 1, made: 1, attempt: 1, of: 1 }], base); await sleep(5);
  assert.strictEqual(claps().length, 8, "lancer adverse réussi : pas d'applaudissements");
  ok(`Applaudissements : lancer réussi à domicile et temps mort (${[...new Set(c2)].join(", ")}), fin de quart-temps → version longue ; rien sur un lancer adverse réussi.`);
  // Faute sifflée contre l'équipe à domicile : huées de protestation (jeer).
  const jeers = () => started.filter(s => /^amb_jeer_\d\.mp3$/.test(s.name)).map(s => s.name);
  for (let i = 0; i < 4; i++) { t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "foul", team: 0 }], base); await sleep(5); }
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "foul", team: 1 }], base); await sleep(5);
  const j = jeers();
  assert.ok(j.length === 4 && j.every((n, i) => i === 0 || n !== j[i - 1]), "protestation à chaque faute du domicile, variantes alternées, rien sur une faute adverse : " + j.join(","));
  const wows = () => started.filter(s => /^amb_wow_\d\.mp3$/.test(s.name));
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 1, made: false, blocked: true }], base); await sleep(20);
  assert.strictEqual(wows().length, 1, "contre du domicile : « Ooooh ! » immédiat");
  const nc = cheers().length;
  await sleep(800);
  assert.ok(cheers().length === nc + 1 && cheers().pop() === "amb_cheer_big.mp3", "… puis grande clameur");
  // Tir décisif imminent : souffle retenu, une seule fois par tir annoncé.
  const gasps = () => started.filter(s => s.name === "amb_gasp.mp3").length;
  const clutch = { ...base, possession: 0, quarter: 4, clock: 12, teams: [{ score: 80 }, { score: 79 }] };
  sfx.updateAmbience({ ...clutch, nextAction: { kind: "shot", team: 0, airAt: t + 1200 } });
  sfx.updateAmbience({ ...clutch, nextAction: { kind: "shot", team: 0, airAt: t + 1200 } });
  sfx.updateAmbience({ ...clutch, clock: 60, nextAction: { kind: "shot", team: 0, airAt: t + 9000 } });
  await sleep(20);
  assert.strictEqual(gasps(), 1, "souffle retenu une seule fois, seulement sur un tir décisif imminent");
  // Meilleur marqueur adverse (≥ 20 pts) qui va tirer : courtes huées, une fois.
  const nj = jeers().length;
  const star = { ...base, possession: 1, teams: [{ score: 50, players: [{ id: "H1", pts: 30 }] }, { score: 48, players: [{ id: "A1", pts: 24 }, { id: "A2", pts: 6 }] }] };
  sfx.updateAmbience({ ...star, nextAction: { kind: "shot", team: 1, airAt: t + 2000, actors: { shooter: "A1" } } });
  sfx.updateAmbience({ ...star, nextAction: { kind: "shot", team: 1, airAt: t + 2000, actors: { shooter: "A1" } } });
  sfx.updateAmbience({ ...star, nextAction: { kind: "shot", team: 1, airAt: t + 2100, actors: { shooter: "A2" } } });
  await sleep(20);
  assert.strictEqual(jeers().length, nj + 1, "huées sur le meilleur marqueur adverse seulement, une fois par tir");
  // Dernière possession défensive serrée : tension même avec un chrono des 24 s plein.
  const tLog = () => sfx.debug().ambLog.filter(x => x.kind === "tension").map(x => x.on).pop();
  sfx.updateAmbience({ ...base, possession: 1, quarter: 4, clock: 15, shotClock: 20, teams: [{ score: 80 }, { score: 79 }] });
  assert.strictEqual(tLog(), true, "dernière possession défensive serrée : salle debout");
  sfx.updateAmbience({ ...base, possession: 0 });
  // Coup de sifflet final : victoire → grande clameur puis longs applaudissements ;
  // arrivée sur un match déjà fini → rien.
  const nb = cheers().length;
  sfx.updateAmbience({ ...base, possession: 0, quarter: 4, clock: 1, teams: [{ score: 81 }, { score: 79 }] });
  sfx.updateAmbience({ ...base, status: "final", quarter: 4, clock: 0, teams: [{ score: 81 }, { score: 79 }] });
  await sleep(20);
  assert.strictEqual(cheers().slice(nb).pop(), "amb_cheer_big.mp3", "victoire à domicile : explosion");
  await sleep(1900);
  assert.strictEqual(started.filter(s => /^amb_applause/.test(s.name)).pop().name, "amb_applause_big.mp3", "… puis longs applaudissements");
  const nf = sfx.debug().ambLog.filter(x => x.kind === "finalReaction").length;
  sfx.updateAmbience({ ...base, status: "final" });
  assert.strictEqual(sfx.debug().ambLog.filter(x => x.kind === "finalReaction").length, nf, "match déjà fini : pas de nouvelle réaction");
  sfx.updateAmbience({ ...base, possession: 0 });
  // Série 8-0 à domicile : clameur + « Ooooh ! » + applaudissements empilés,
  // une fois ; ébullition jusqu'au prochain panier adverse.
  const runs = () => sfx.debug().ambLog.filter(x => x.kind === "run").length;
  const stack = () => started.length;
  t += 5000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 1, made: true, zone: "mid" }], base); await sleep(5);
  for (const z of ["mid", "three"]) { t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 0, made: true, zone: z }], base); await sleep(5); }
  assert.strictEqual(runs(), 0, "5-0 : pas encore de série");
  const r0 = stack(), w0 = wows().length;
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 0, made: true, zone: "three" }], base); await sleep(600);
  assert.strictEqual(runs(), 1, "8-0 : la salle s'enflamme");
  assert.ok(wows().length === w0 + 1 && started.slice(r0).some(x => /^amb_applause/.test(x.name)) && started.slice(r0).some(x => /^amb_cheer/.test(x.name)), "clameur + « Ooooh ! » + applaudissements empilés");
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 0, made: true, zone: "mid" }], base); await sleep(600);
  assert.strictEqual(runs(), 1, "10-0 : pas de nouvel empilement");
  // Grand match : réactions plus fortes (log d'intensité).
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "shot", team: 1, made: true, zone: "mid" }], { ...base, meta: { competition: "Play-offs" } }); await sleep(5);
  const lastGroan = sfx.debug().ambLog.filter(x => x.kind === "react" && x.react === "groan").pop();
  assert.ok(Math.abs(lastGroan.intensity - 1.2) < 1e-9, "play-offs : déception plus forte (" + lastGroan.intensity + ")");
  ok("Série 8-0 à domicile : clameur, « Ooooh ! » et applaudissements empilés, une seule fois ; play-offs : réactions plus fortes.");
  // Spectacle en musique : mode « show » (public très discret) ; seules les
  // réactions du spectacle (signal hm-crowd-cue) passent, très basses.
  window.HMMusic = { current: "pompom" };
  assert.strictEqual(sfx.updateAmbience({ ...base, possession: 0, stoppage: { kind: "timeout" } }), "show", "musique du spectacle : mode show");
  const nr = () => sfx.debug().ambLog.filter(x => x.kind === "react").length, r1 = nr();
  t += 3000; sfx.onEvents([{ id: id++, airAt: t, kind: "timeout", type: "timeout", team: 1 }], base); await sleep(5);
  assert.strictEqual(nr(), r1, "pendant le spectacle : pas de réaction de match");
  t += 3000; window.__cue({ kind: "applause", intensity: 0.9 }); await sleep(5);
  const last = sfx.debug().ambLog.filter(x => x.kind === "react").pop();
  assert.ok(nr() === r1 + 1 && last.react === "applause" && last.intensity <= 0.5, "fin de chorégraphie : applaudissements très discrets (" + JSON.stringify(last) + ")");
  window.HMMusic = null;
  assert.strictEqual(sfx.updateAmbience({ ...base, possession: 0 }), "offense", "fin du spectacle : retour au jeu");
  ok("Spectacle : public très discret, réactions du spectacle seulement (≤ 0,5).");
  ok(`Faute contre le domicile : protestation (${[...new Set(j)].join(", ")}) ; contre du domicile : « Ooooh ! » puis grande clameur ; tir décisif : le public retient son souffle.`);
  sfx.destroy();
  console.log("\n🏁 live_ambience_files_test.js : fichiers d'ambiance branchés aux bons événements.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
