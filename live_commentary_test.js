// Commentaire audio du direct 2D (2026-10-08) : le terrain annonce ses
// moments (opts.onMoment) au moment où il les anime, commentary.js choisit
// une phrase et la joue (fichier enregistré déclaré au manifest, sinon voix
// de synthèse). Règles : désactivé par défaut, une voix à la fois, les
// moments forts coupent les petits, délai entre deux phrases ordinaires,
// pas deux fois la même variante, rien onglet masqué.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function fail(msg) { throw new Error("❌ " + msg); }
const ok = msg => console.log("✅ " + msg);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dom = new JSDOM(`<!doctype html><div id="host"></div>`, { pretendToBeVisual: true, runScripts: "outside-only", url: "http://localhost/" });
const { window } = dom;
const strip = src => src.replace(/^import .*$/mg, "").replace(/^export\s+(function|const|let|class)/mg, "$1").replace(/^export\s*\{[^}]*\};?/mg, "")
  .replace(/import\.meta\.url/g, JSON.stringify("http://localhost/assets/live/commentary.js"));
// Voix de synthèse factice : on enregistre ce qui est dit.
const spoken = [];
window.SpeechSynthesisUtterance = function (text) { this.text = text; };
window.speechSynthesis = { getVoices: () => [{ lang: "fr-FR", name: "Test" }], cancel() {}, speak(u) { if (u.text.trim()) spoken.push(u.text); } };
window.fetch = () => Promise.resolve({ ok: false });
let vis = "visible";
Object.defineProperty(window.document, "hidden", { configurable: true, get: () => vis === "hidden" });
window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/format.js"), "utf8")));
window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8")));
window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/commentary.js"), "utf8")) + "\nwindow.__C = { createCommentary, MOMENTS };");
const { createCommentary, MOMENTS } = window.__C;

(async () => {
  // ---- 1) Module de commentaire seul ----
  // Toutes les phrases sont distinctes et non vides (c'est la liste à enregistrer).
  const all = Object.values(MOMENTS).flatMap(m => m.lines);
  if (all.some(l => !l || !l.trim()) || new Set(all).size !== all.length) fail("phrases du commentaire : vides ou en double.");
  ok(`${Object.keys(MOMENTS).length} moments, ${all.length} phrases distinctes.`);

  window.localStorage.removeItem("hm-commentary");
  const c = createCommentary({ random: () => 0 });
  await c.ready;
  if (c.on) fail("le commentaire doit être désactivé par défaut.");
  if (c.say("trois_points")) fail("désactivé : rien ne doit être dit.");
  c.setOn(true);
  if (!JSON.parse(window.localStorage.getItem("hm-commentary")).on) fail("la préférence doit être mémorisée.");
  if (!c.say("trois_points") || spoken[spoken.length - 1] !== MOMENTS.trois_points.lines[0]) fail("activé : la phrase du moment doit être dite (voix de synthèse sans fichier).");
  const n1 = spoken.length;
  if (c.say("rate", { force: true })) fail("une phrase en cours ne doit pas être coupée par un moment moins fort.");
  if (!c.say("buzzer")) fail("un moment énorme (buzzer) doit couper la phrase en cours.");
  if (spoken.length !== n1 + 1) fail("une seule phrase de plus attendue.");
  ok("Désactivé par défaut, préférence mémorisée ; les moments forts coupent les petits, jamais l'inverse.");

  // Fin de la phrase puis délai minimum entre deux petites phrases.
  const dbg = () => c.debug().log;
  c.stop();
  if (c.say("faute", { force: true })) fail("une petite phrase juste après une autre doit attendre (délai minimum).");
  ok("Délai minimum entre deux phrases ordinaires respecté.");

  // Pas deux fois la même variante de suite.
  const c2 = createCommentary({ random: () => 0 });
  await c2.ready; c2.setOn(true);
  c2.say("contre"); c2.stop();
  await sleep(950);
  c2.say("contre"); 
  const l2 = c2.debug().log;
  if (l2.length !== 2 || l2[0].i === l2[1].i) fail(`deux « contre » de suite doivent utiliser deux variantes différentes (${JSON.stringify(l2)}).`);
  ok("Jamais deux fois la même variante de suite.");

  // Onglet masqué : silence.
  c2.stop(); vis = "hidden";
  if (c2.say("fin_match")) fail("onglet masqué : rien ne doit être dit.");
  vis = "visible";
  ok("Onglet masqué : aucun commentaire (pas de rattrapage au retour).");

  // Désactivation : la phrase en cours s'arrête.
  c2.say("fin_match"); c2.setOn(false);
  if (c2.say("fin_match")) fail("désactivé : silence.");
  c.destroy(); c2.destroy();
  ok("Désactivation immédiate.");

  // Fichiers enregistrés déclarés au manifest : URL <moment>_<n>.mp3.
  const asked = [];
  window.fetch = url => { asked.push(String(url)); return /manifest/.test(url) ? Promise.resolve({ ok: true, json: () => ({ version: 3, files: { dunk: 2 } }) }) : Promise.resolve({ ok: false }); };
  window.AudioContext = function () { this.state = "running"; this.destination = {}; this.createGain = () => ({ gain: { value: 1 }, connect() {} }); this.decodeAudioData = () => Promise.resolve(null); this.close = () => {}; };
  const c3 = createCommentary({ random: () => 0.99 });
  await c3.ready; c3.setOn(true);
  const before = spoken.length;
  c3.say("dunk");
  await sleep(20);
  if (!asked.some(u => /\/assets\/audio\/commentary\/fr\/dunk_2\.mp3\?v=3$/.test(u))) fail(`fichier enregistré attendu : …/fr/dunk_2.mp3?v=3 (demandés : ${asked.join(", ")}).`);
  if (spoken.length !== before) fail("un moment enregistré ne doit pas passer par la voix de synthèse.");
  if (c3.debug().log[0].i > 1) fail("seules les variantes déclarées au manifest peuvent être tirées.");
  c3.destroy();
  delete window.AudioContext;
  window.fetch = () => Promise.resolve({ ok: false });
  ok("Manifest : les fichiers enregistrés (assets/audio/commentary/fr/<moment>_<n>.mp3) remplacent la voix de synthèse.");

  // ---- 2) Terrain → moments ----
  const avatar = id => `<span class="player-avatar"><svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" data-avatar="${id}"><circle cx="60" cy="60" r="40"/></svg></span>`;
  const POS = ["M", "AS", "A", "AF", "P"];
  const mkTeam = (key, names) => ({ name: key, short: key.slice(0, 3).toUpperCase(), score: 0, color: "#F26B1D",
    players: names.map((n, i) => ({ id: key + ":" + n, name: n, pos: POS[i % 5], onCourt: i < 5, avatar: avatar(key + i), pts: 0, reb: 0, ast: 0, number: 4 + i, fatigue: 10, pf: 0 })) });
  const S = { status: "live", quarter: 1, clock: 600, possession: 0,
    teams: [mkTeam("Gotham", ["A1", "A2", "A3", "A4", "A5", "A6"]), mkTeam("Rennes", ["B1", "B2", "B3", "B4", "B5", "B6"])],
    shots: [], events: [], referees: [] };
  let id = 1;
  const ev = o => { const e = { id: id++, quarter: S.quarter, clock: S.clock, text: "", airAt: Date.now(), ...o }; S.events.push(e); return e; };
  const moments = [];
  const court = window.createCourt2D(window.document.getElementById("host"), { raster: false, onMoment: (m, info) => moments.push(m) });
  court.update(S, []);
  const push = async (o, wait) => { const e = ev(o); court.update(S, [e.id]); await sleep(wait); };
  await push({ team: 0, type: "period", kind: "tipoff", possessionAfter: 0, actors: {} }, 3600);
  S.teams[0].score += 3; S.possession = 1;
  await push({ team: 0, type: "made", kind: "shot", made: true, zone: "three", shot: { x: 80, y: 10 }, possessionTeam: 0, possessionAfter: 1, actors: { shooter: "Gotham:A1" } }, 3500);
  await push({ team: 1, type: "timeout", kind: "timeout", durationMs: 1500, actors: {} }, 2200);
  for (const m of ["entre_deux", "trois_points", "temps_mort"]) if (!moments.includes(m)) fail(`moment « ${m} » attendu du terrain (obtenu ${moments.join(", ")}).`);
  ok(`Le terrain annonce ses moments au fil de l'animation : ${moments.join(", ")}.`);
  S.status = "final"; court.update(S, []);
  if (moments[moments.length - 1] !== "fin_match") fail("passage au statut final : « fin_match » attendu.");
  ok("Fin du match annoncée au passage au statut final.");
  court.destroy();
  console.log("Commentaire audio : tout est vert.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
