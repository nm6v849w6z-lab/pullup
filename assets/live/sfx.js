// =====================================================================
// Bruitages du direct (2026-10-09) : petits effets sonores décalés,
// déclenchés par les ÉVÉNEMENTS RÉELS du moteur (fil du match), jamais par
// une animation du terrain.
//
//   import { createSfx, sfxForEvent } from "./live/sfx.js";
//   const sfx = createSfx();
//   sfx.onEvents(nouveauxEvenements, state);   // une fois par événement
//
// Associations (SFX_RULES, à enrichir sans toucher au moteur) :
//   lancer franc RÉUSSI de l'équipe à domicile → « cha-ching » (caisse) ;
//   panier à 3 points VALIDÉ de l'équipe à domicile → courte sirène arcade ;
//   faute sifflée (faute, technique, antisportive, faute sur tir) → sifflet ;
//   interception de l'équipe à domicile → jingle arcade ;
//   lancer franc RATÉ de l'équipe à l'extérieur → « wah-wah » comique
//   (seulement un lancer franc : avant le 2026-10-10, il partait aussi sur
//   un tir classique manqué — l'événement « rebound » du fil).
// Sons : fichier s'il est déclaré dans assets/audio/sfx/manifest.json
// ({ "files": { "siren": "siren.mp3" } }), sinon synthèse Web Audio
// (aucun fichier fourni à ce jour). Un fichier absent ou illisible retombe
// sur la synthèse : jamais d'erreur.
// Règles : un son par événement (id mémorisé), même son pas deux fois en
// moins de COOLDOWN_MS, sons différents superposables (compresseur de
// mixage), rien onglet masqué, rien pour un événement en retard (arrivée en
// cours de match, saut dans le temps) ; tout est asynchrone et protégé
// (try/catch) : le direct n'est jamais bloqué. Préférence (niveau : 0
// coupé, 1 bas, 2 moyen, 3 fort) gardée dans ce navigateur.
// =====================================================================

export const SFX_LEVELS = [0, 0.25, 0.5, 0.85];
const STORE = "hm-live-sfx";
const COOLDOWN_MS = 450;          // même bruitage : pas deux fois en moins de 0,45 s
const STALE_MS = 4000;            // événement diffusé il y a plus de 4 s : pas de son

// Règles événement → bruitage. `home` : index de l'équipe à domicile (0).
export const SFX_RULES = [
  { key: "cash", when: (e, home) => e.kind === "freeThrow" && (e.made || 0) > 0 && e.team === home },
  { key: "siren", when: (e, home) => e.kind === "shot" && e.made === true && e.zone === "three" && e.team === home },
  { key: "whistle", when: e => e.kind === "foul" || e.kind === "technicalFoul" || e.kind === "unsportsmanlikeFoul" || (e.kind === "shot" && !!e.foulType && !e.made) },
  { key: "steal", when: (e, home) => e.kind === "turnover" && e.tovType === "steal" && e.possessionAfter === home },
  // Buzzer de fin de quart-temps (et de fin de match).
  { key: "buzzer", when: e => e.kind === "quarterEnd" },
  // Lancer franc manqué de l'équipe à l'extérieur, et RIEN d'autre : un tir
  // classique manqué (événement « rebound » du fil) déclenche seulement une
  // réaction du public (CROWD_RULES), jamais ce bruitage.
  { key: "miss", when: (e, home) => e.kind === "freeThrow" && (e.made || 0) === 0 && (e.team === 0 || e.team === 1) && e.team !== home },
];

// ---------------------------------------------------------------------
// Ambiance de salle (2026-10-10, « inspirée de NBA 2K ») : un fond de
// public permanent dont l'humeur suit l'état RÉEL du match, plus des
// réactions ponctuelles aux événements. Modes (ambienceMode, pure) :
//   offense  — domicile en attaque : public qui pousse, applaudissements ;
//   defense  — domicile en défense : chants « DE-FENSE ! » (variations) ;
//   ftHome   — lancer franc à domicile : silence de concentration, murmure ;
//   ftAway   — lancer franc adverse : huées et sifflets ;
//   break    — temps mort, entre quarts, mi-temps : brouhaha calme ;
//   pregame / final / neutral.
// Un lancer franc compte dès qu'il est annoncé par le moteur
// (nextAction.kind === "freeThrow" à moins de 12 s) ou qu'une série est en
// cours (dernier événement = lancer n° k < n).
export const AMB_LEVELS = [0, 0.6, 1.1, 1.8];
export function ambienceMode(S, now = Date.now(), home = 0) {
  if (!S) return "off";
  if (S.status === "final") return "final";
  if (S.status === "pregame") return "pregame";
  if (S.status === "halftime" || S.stoppage || S.timeout) return "break";
  const na = S.nextAction;
  let ft = null;
  if (na && na.kind === "freeThrow" && (na.team === 0 || na.team === 1) && na.airAt - now <= 12000) ft = na.team;
  const evs = S.events || [];
  for (let i = evs.length - 1; i >= 0 && ft === null; i--) {
    const e = evs[i];
    if (!e || e.kind === "quote" || e.kind === "substitution") continue;
    if (e.kind === "freeThrow" && e.of > 1 && e.attempt < e.of) ft = e.team;
    break;
  }
  if (ft === 0 || ft === 1) return ft === home ? "ftHome" : "ftAway";
  if (S.possession === home) return "offense";
  if (S.possession === 0 || S.possession === 1) return "defense";
  return "neutral";
}
// Réactions du public à un événement réel (pure : testable). `intensity` :
// 1 normale, plus forte sur un 3 points, un panier décisif (4e quart ou
// prolongation, 2 dernières minutes, écart ≤ 6).
// Grand match (playoffs, barrage, finale) : d'après la description du direct.
export function isBigGame(S) { return !!(S && S.meta && /play.?off|barrage|finale/i.test(String(S.meta.competition || "") + " " + String(S.meta.round || ""))); }
export function crowdReactionFor(e, S, home = 0) {
  if (!e || !e.kind || e.kind === "quote") return null;
  const t = e.team;
  const clutch = S && S.quarter >= 4 && typeof S.clock === "number" && S.clock <= 120 && S.teams && Math.abs((S.teams[0].score || 0) - (S.teams[1].score || 0)) <= 6;
  // Contre (fil : tir manqué `blocked`, équipe = celle du tireur) : grande
  // clameur si l'équipe à domicile contre, déception si elle est contrée.
  // Contre du domicile : « Ooooh ! » d'émerveillement, puis la clameur.
  if (e.kind === "shot" && e.blocked && (t === 0 || t === 1)) return t === home ? { kind: "groan", intensity: 0.8 } : { kind: "wow", intensity: 1.2, also: { kind: "cheer", intensity: 1.35 * (clutch ? 1.2 : 1), delay: 700 } };
  // Expulsion (technique) ou 5e faute : protestation si c'est un joueur à
  // domicile, la salle se réjouit si c'est un adversaire.
  if ((e.kind === "technicalEjection" || e.kind === "foulOut") && (t === 0 || t === 1)) return t === home ? { kind: "jeer", intensity: e.kind === "technicalEjection" ? 1.5 : 1.1 } : { kind: "cheer", intensity: e.kind === "technicalEjection" ? 1.3 : 1.0 };
  // Blessure : le public retient son souffle, inquiet.
  if (e.kind === "injury") return { kind: "gasp", intensity: 0.9 };
  // Faute sifflée CONTRE l'équipe à domicile (fil : équipe = celle qui fait
  // la faute ; faute sur tir : tir manqué avec `foulType`, faute de l'autre
  // équipe) : huées de protestation, plus fortes sur technique / antisportive.
  if ((e.kind === "foul" || e.kind === "technicalFoul" || e.kind === "unsportsmanlikeFoul") && t === home) return { kind: "jeer", intensity: e.kind === "foul" ? 1.0 : 1.4 };
  if (e.kind === "shot" && e.made !== true && e.foulType && (t === 0 || t === 1) && 1 - t === home) return { kind: "jeer", intensity: 1.0 };
  if (e.kind === "shot" && e.made === true) {
    // Contre-attaque conclue au cercle (shotType « fastbreak ») : grand moment.
    if (t === home) return { kind: "cheer", intensity: (e.zone === "three" ? 1.4 : e.shotType === "fastbreak" ? 1.3 : 1) * (clutch ? 1.5 : 1) };
    return { kind: "groan", intensity: (e.zone === "three" ? 1.3 : 1) * (clutch ? 1.3 : 1) };   // 3 points / fin serrée : grand « ohhh »
  }
  // Tir classique manqué (fil : « rebound » ; équipe du tireur = celle du
  // rebondeur sur un rebond offensif, l'autre sinon).
  if (e.kind === "rebound" && (t === 0 || t === 1)) {
    const shooterTeam = e.offensive ? t : 1 - t;
    return shooterTeam === home ? { kind: "groan", intensity: 0.6 } : { kind: "cheer", intensity: clutch ? 1.2 : 0.7 };
  }
  if (e.kind === "freeThrow" && (t === 0 || t === 1)) {
    const made = (e.made || 0) > 0;
    if (t === home) return made ? { kind: "applause", intensity: 0.8 } : { kind: "groan", intensity: 0.7 };
    return made ? null : { kind: "cheer", intensity: 0.8 };
  }
  if (e.kind === "turnover" && e.tovType === "steal" && e.possessionAfter === home) return { kind: "cheer", intensity: 0.9 };
  if (e.kind === "timeout" || e.type === "timeout") return { kind: "applause", intensity: 0.6 };
  if (e.kind === "quarterEnd") return { kind: "applause", intensity: 1.3 };   // fin de quart-temps : applaudissements nourris (version longue)
  return null;
}
// Bruitages d'un événement (pure : testable). Plusieurs règles peuvent
// répondre (sons différents) ; un même son n'est listé qu'une fois.
export function sfxForEvent(e, home = 0) {
  if (!e || !e.kind || e.kind === "quote") return [];
  const out = [];
  for (const r of SFX_RULES) { try { if (r.when(e, home) && !out.includes(r.key)) out.push(r.key); } catch (err) { /* règle défaillante : ignorée */ } }
  return out;
}

export function createSfx(opts = {}) {
  const nowMs = opts.now || (() => Date.now());
  const base = opts.base || new URL("../audio/sfx", import.meta.url).href;
  const prefs = (() => { try { const p = JSON.parse(localStorage.getItem(STORE) || "null"); if (p && Number.isInteger(p.level)) return { amb: 2, ...p }; } catch (e) { /* rien */ } return { level: 2, amb: 2 }; })();
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (e) { /* rien */ } };
  const played = new Set();       // ids d'événements déjà sonorisés
  const lastAt = {};              // bruitage → instant de la dernière lecture
  const log = [];                 // derniers bruitages (tests, diagnostic)
  let ctx = null, master = null, comp = null, ambOut = null, ambDuck = null;
  let manifest = { files: {} };
  const buffers = new Map();
  const ready = (typeof fetch === "function"
    ? fetch(`${base}/manifest.json`, { cache: "no-cache" }).then(r => (r.ok ? r.json() : { files: {} })).catch(() => ({ files: {} }))
    : Promise.resolve({ files: {} })).then(m => { manifest = m && m.files ? m : { files: {} }; if (prefs.level > 0 || prefs.amb > 0) preload(); return manifest; });

  function audio() {
    if (ctx) return ctx;
    const AC = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AC) return null;
    try {
      ctx = new AC();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = SFX_LEVELS[prefs.level] || 0;
      master.connect(comp); comp.connect(ctx.destination);
      // Bus de l'ambiance : son propre volume (réglage « Ambiance »), et un
      // étage « duck » qui s'efface sous les bruitages importants.
      ambOut = ctx.createGain(); ambOut.gain.value = AMB_LEVELS[prefs.amb] || 0;
      ambDuck = ctx.createGain(); ambDuck.gain.value = 1;
      ambDuck.connect(ambOut); ambOut.connect(comp);
    } catch (e) { ctx = null; }
    return ctx;
  }
  // Contexte mis en pause par le navigateur (créé avant un geste, onglet
  // revenu, « interrupted » sur iPhone) : relancé au prochain geste.
  function unlock() { const c = audio(); if (c && c.state !== "running" && c.state !== "closed") { try { const q = c.resume(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* rien */ } } }
  // Variantes : une clé du manifeste peut lister plusieurs fichiers ; on en
  // tire un au hasard, jamais deux fois de suite le même.
  const lastPick = {};
  function pick(key) {
    const f = manifest.files && manifest.files[key];
    if (!Array.isArray(f)) return f || null;
    if (!f.length) return null;
    let i; do { i = Math.floor(Math.random() * f.length); } while (f.length > 1 && i === lastPick[key]);
    lastPick[key] = i;
    return f[i];
  }
  function load(key, file = pick(key)) {
    if (!file) return Promise.resolve(null);
    const url = `${base}/${file}?v=${encodeURIComponent(manifest.version || 1)}`;
    if (buffers.has(url)) return buffers.get(url);
    const c = audio();
    const pr = !c || typeof fetch !== "function" ? Promise.resolve(null)
      : fetch(url).then(r => (r.ok ? r.arrayBuffer() : null))
        .then(b => (b ? new Promise(res => { try { const q = c.decodeAudioData(b, res, () => res(null)); if (q && q.then) q.then(res, () => res(null)); } catch (e) { res(null); } }) : null))
        .catch(() => null);
    buffers.set(url, pr);
    return pr;
  }
  function preload() {
    for (const [k, v] of Object.entries(manifest.files || {})) {
      if (!(k.startsWith("amb_") ? prefs.amb > 0 : prefs.level > 0)) continue;
      for (const f of [].concat(v)) load(k, f);
    }
  }

  // ---------- synthèse (aucun fichier fourni) ----------
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  function osc(type, f, t, dur, peak, a = 0.005, dest = master) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    env(g, t, a, peak, dur); o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  function noise(t, dur, peak, freq, q = 1.2) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    env(g, t, 0.002, peak, dur); src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }
  const SYNTH = {
    // Buzzer (sans fichier) : deux carrés graves légèrement désaccordés.
    buzzer(t) { osc("square", 196, t, 1.4, 0.16, 0.01); osc("square", 199, t, 1.4, 0.12, 0.01); },
    // Caisse enregistreuse : « ka » mécanique (tiroir) puis deux tintements
    // de cloche (partiels inharmoniques), le second plus aigu : « cha-ching ».
    cash(t) {
      noise(t, 0.05, 0.5, 2600, 0.9); noise(t + 0.045, 0.04, 0.35, 1800, 0.9);
      for (const [dt, f] of [[0.09, 2093], [0.2, 2637]]) {
        osc("sine", f, t + dt, 0.55, 0.32, 0.002); osc("sine", f * 2.76, t + dt, 0.3, 0.12, 0.002); osc("sine", f * 5.4, t + dt, 0.15, 0.05, 0.002);
      }
    },
    // Sirène de pompier façon arcade, courte : deux montées-descentes.
    siren(t) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = "sawtooth"; o2.type = "square"; lp.type = "lowpass"; lp.frequency.value = 2400;
      for (const x of [o, o2]) {
        const det = x === o2 ? 1.005 : 1;
        x.frequency.setValueAtTime(620 * det, t);
        x.frequency.linearRampToValueAtTime(1180 * det, t + 0.22); x.frequency.linearRampToValueAtTime(620 * det, t + 0.45);
        x.frequency.linearRampToValueAtTime(1180 * det, t + 0.67); x.frequency.linearRampToValueAtTime(700 * det, t + 0.9);
        x.connect(lp); x.start(t); x.stop(t + 1.0);
      }
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
      g.gain.setValueAtTime(0.16, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.98);
      lp.connect(g); g.connect(master);
    },
    // Sifflet d'arbitre : sifflement aigu avec le roulement de la bille
    // (modulation d'amplitude rapide), très bref.
    whistle(t) {
      const g = ctx.createGain(), am = ctx.createGain(), lfo = ctx.createOscillator(), lfoG = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.015); g.gain.setValueAtTime(0.22, t + 0.26); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      lfo.frequency.value = 38; lfoG.gain.value = 0.45; am.gain.value = 0.55;
      lfo.connect(lfoG); lfoG.connect(am.gain);
      for (const f of [2960, 3140]) { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.02, t + 0.3); o.connect(am); o.start(t); o.stop(t + 0.36); }
      am.connect(g); g.connect(master); lfo.start(t); lfo.stop(t + 0.36);
      noise(t, 0.3, 0.05, 3000, 2);
    },
    // Interception : jingle arcade (arpège montant en carré).
    steal(t) { [1047, 1319, 1568, 2093].forEach((f, i) => osc("square", f, t + i * 0.055, 0.09, 0.09, 0.003)); },
    // Raté : « wah-wah » de trombone, descendant, discret.
    miss(t) {
      const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = "sawtooth"; lp.type = "lowpass"; lp.Q.value = 6;
      const notes = [392, 370, 349, 294];
      notes.forEach((f, i) => { const at = t + i * 0.17; o.frequency.setValueAtTime(f, at); lp.frequency.setValueAtTime(500, at); lp.frequency.linearRampToValueAtTime(1500, at + 0.08); lp.frequency.linearRampToValueAtTime(600, at + 0.16); });
      o.frequency.linearRampToValueAtTime(260, t + 0.8);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.02); g.gain.setValueAtTime(0.13, t + 0.62); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.82);
      o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + 0.85);
    },
  };

  // Joue un bruitage (fichier sinon synthèse). Renvoie true s'il part.
  function play(key, why = "") {
    if (!(prefs.level > 0)) return false;
    if (typeof document !== "undefined" && document.hidden) return false;
    const t = nowMs();
    if (t - (lastAt[key] || -1e9) < COOLDOWN_MS) return false;
    lastAt[key] = t;
    log.push({ key, why, at: t }); if (log.length > 60) log.shift();
    const c = audio(); if (!c) return true;   // pas de Web Audio (tests) : compté, rien joué
    try { if (c.state === "suspended") c.resume(); } catch (e) { /* rien */ }
    duckAmbience(key === "whistle" ? 0.35 : 0.5, key === "siren" ? 1.1 : 0.7);
    load(key).then(buf => {
      try {
        if (buf) { const src = c.createBufferSource(); src.buffer = buf; src.connect(master); src.start(); return; }
        if (SYNTH[key]) SYNTH[key](c.currentTime + 0.01);
      } catch (e) { /* un bruitage raté ne bloque jamais le direct */ }
    }).catch(() => {});
    return true;
  }
  // ---------- ambiance de salle ----------
  // Synthèse par défaut (aucun fichier fourni) ; fichiers facultatifs du
  // manifeste : amb_bed (fond, en boucle), amb_boo (huées, en boucle),
  // amb_chant (« DE-FENSE », une ou plusieurs prises), amb_cheer, amb_groan,
  // amb_clap. Un seul fond et une seule boucle de huées, créés une fois ;
  // le mode change par fondus (setTargetAtTime), jamais par relance.
  const AMB_MIX = {   // fond : volume, couleur (filtre) ; huées ; chants
    offense: { bed: 0.62, tone: 1250, boo: 0, chant: false, claps: true },
    defense: { bed: 0.5, tone: 1050, boo: 0, chant: true, claps: false },
    ftHome: { bed: 0.13, tone: 700, boo: 0, chant: false, claps: false },
    ftAway: { bed: 0.32, tone: 900, boo: 1.0, chant: false, claps: false },
    break: { bed: 0.5, tone: 950, boo: 0, chant: false, claps: false },
    pregame: { bed: 0.48, tone: 950, boo: 0, chant: false, claps: false },
    neutral: { bed: 0.55, tone: 1000, boo: 0, chant: false, claps: false },
    final: { bed: 0.45, tone: 950, boo: 0, chant: false, claps: false },
    off: { bed: 0, tone: 900, boo: 0, chant: false, claps: false },
  };
  const amb = { mode: "off", hot: false, tension: false, bed: null, boo: null, chant: null, calm: null, heat: null, cheerLoop: null, chantTimer: null, clapTimer: null, whistleTimer: null, log: [], lastReact: {} };
  let noiseBuf = null;
  function crowdNoise() {
    // Bruit « rose » de 4 s, généré UNE fois et réutilisé partout.
    if (noiseBuf) return noiseBuf;
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16; }
    }
    return (noiseBuf = buf);
  }
  // Boucle d'un fichier compressé : le MP3 / AAC ajoute un court silence
  // au début et à la fin (délai d'encodeur, selon le navigateur) → clic ou
  // trou à chaque tour. On boucle entre le premier et le dernier échantillon
  // non silencieux (la boucle est préparée avec un fondu enchaîné).
  function trimLoop(src, buf) {
    try {
      const d = buf.getChannelData(0), n = d.length, eps = 1e-4, lim = Math.min(n >> 2, buf.sampleRate);
      let a = 0, b = n - 1;
      while (a < lim && Math.abs(d[a]) < eps) a++;
      while (b > n - 1 - lim && Math.abs(d[b]) < eps) b--;
      if (b - a > buf.sampleRate) { src.loopStart = a / buf.sampleRate; src.loopEnd = (b + 1) / buf.sampleRate; }
    } catch (e) { /* boucle entière */ }
  }
  function loopLayer(fileKey, build) {
    // Couche en boucle : fichier du manifeste s'il existe, sinon synthèse.
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(ambDuck);
    const layer = { gain: g, filter: null };
    load(fileKey).then(buf => {
      try {
        const src = ctx.createBufferSource(); src.loop = true;
        if (buf) { src.buffer = buf; src.connect(g); trimLoop(src, buf); }
        else { src.buffer = crowdNoise(); build(src, g, layer); }
        src.start(ctx.currentTime + 0.02, Math.random() * (buf ? buf.duration * 0.9 : 3));   // point de départ varié
        layer.src = src;
      } catch (e) { /* rien */ }
    });
    return layer;
  }
  // Chant « DE-FENSE » enregistré (clé `amb_chant`, boucle de plusieurs
  // cycles) : une couche en boucle qui monte en défense et s'éteint dès le
  // changement de possession ; sans fichier, chants synthétisés (chantOnce).
  const CHANT_GAIN = 0.75;
  const hasFile = key => !!(manifest.files && manifest.files[key]);
  // Couches enregistrées facultatives (créées une fois, si le fichier existe) :
  // chant défensif, salle calme (`amb_bed_calm`), salle en ébullition
  // (`amb_bed_hot`), encouragements en attaque (`amb_offense`).
  function fileLayers() {
    if (!amb.chant && hasFile("amb_chant")) amb.chant = loopLayer("amb_chant", () => {});
    if (!amb.calm && hasFile("amb_bed_calm")) amb.calm = loopLayer("amb_bed_calm", () => {});
    if (!amb.heat && hasFile("amb_bed_hot")) amb.heat = loopLayer("amb_bed_hot", () => {});
    if (!amb.cheerLoop && hasFile("amb_offense")) amb.cheerLoop = loopLayer("amb_offense", () => {});
  }
  function ensureLayers() {
    if (amb.bed) { fileLayers(); return; }
    if (!audio()) return;
    fileLayers();
    // Fond : brouhaha (passe-bande large) qui « respire » (deux LFO lents).
    amb.bed = loopLayer("amb_bed", (src, g, layer) => {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1000; bp.Q.value = 0.55;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
      const breath = ctx.createGain(); breath.gain.value = 0.85;
      for (const [f, d] of [[0.11, 0.12], [0.27, 0.08]]) { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = f; og.gain.value = d; o.connect(og); og.connect(breath.gain); o.start(); }
      src.connect(bp); bp.connect(lp); lp.connect(breath); breath.connect(g); layer.filter = bp;
    });
    // Huées : voix graves (bruit passe-bande bas, vibrato).
    amb.boo = loopLayer("amb_boo", (src, g) => {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 330; bp.Q.value = 2.2;
      const bp2 = ctx.createBiquadFilter(); bp2.type = "bandpass"; bp2.frequency.value = 620; bp2.Q.value = 3;
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 0.6; vg.gain.value = 60; vib.connect(vg); vg.connect(bp.frequency); vib.start();
      const mix = ctx.createGain(); mix.gain.value = 1.6;
      src.connect(bp); src.connect(bp2); bp.connect(mix); bp2.connect(mix); mix.connect(g);
    });
  }
  const T = (param, v, tc = 0.6) => { try { param.cancelScheduledValues(ctx.currentTime); param.setTargetAtTime(Math.max(0.0001, v), ctx.currentTime, tc); } catch (e) { /* rien */ } };
  function duckAmbience(to, sec) {
    if (!ambDuck || !ctx) return;
    try { const t = ctx.currentTime; ambDuck.gain.cancelScheduledValues(t); ambDuck.gain.setTargetAtTime(to, t, 0.04); ambDuck.gain.setTargetAtTime(1, t + sec, 0.35); } catch (e) { /* rien */ }
  }
  // Voix de foule pour les chants : plusieurs voix détunées (dents de scie)
  // à travers deux formants de voyelle, plus le souffle des consonnes.
  function shout(t, dur, f0, vowel, peak) {
    const F = vowel === "e" ? [530, 1850] : vowel === "en" ? [480, 1600] : [600, 1100];
    const g = ctx.createGain(); g.connect(ambDuck);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.04); g.gain.setValueAtTime(peak, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    f1.type = f2.type = "bandpass"; f1.frequency.value = F[0]; f2.frequency.value = F[1]; f1.Q.value = 5; f2.Q.value = 7;
    f1.connect(g); f2.connect(g);
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(); o.type = "sawtooth";
      const f = f0 * (0.82 + Math.random() * 0.4);
      o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.93, t + dur);
      o.connect(f1); o.connect(f2); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  function hiss(t, dur, peak, freq = 4500) {
    const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = crowdNoise(); hp.type = "highpass"; hp.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp); hp.connect(g); g.connect(ambDuck); src.start(t, Math.random() * 3); src.stop(t + dur + 0.05);
  }
  function stomp(t, peak) {   // coup de pied / batterie de tribune
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(ambDuck); o.start(t); o.stop(t + 0.25);
  }
  function crowdClap(t, peak) {   // applaudissement collectif : plusieurs mains, léger flou
    for (let i = 0; i < 5; i++) hiss(t + Math.random() * 0.03, 0.07, peak * (0.6 + Math.random() * 0.4), 1400 + Math.random() * 900);
  }
  // « DE-FENSE ! » : trois variantes (avec frappes de pieds, avec mains,
  // tempo et hauteur légèrement différents) tirées sans répétition.
  let lastChant = -1;
  function chantOnce() {
    if (amb.mode !== "defense" || !ctx) return;
    load("amb_chant").then(buf => {
      if (amb.mode !== "defense") return;
      try {
        if (buf) { const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ambDuck); src.start(); return; }
        let v; do { v = Math.floor(Math.random() * 3); } while (v === lastChant); lastChant = v;
        const t = ctx.currentTime + 0.03, f0 = [165, 185, 150][v], tempo = [1, 0.92, 1.08][v], pk = 0.09;
        shout(t, 0.24 * tempo, f0 * 1.12, "e", pk);                 // « DE »
        hiss(t + 0.3 * tempo, 0.07, 0.05, 3800);                      // « f »
        shout(t + 0.34 * tempo, 0.36 * tempo, f0, "en", pk);          // « FEN »
        hiss(t + 0.66 * tempo, 0.12, 0.05, 5000);                     // « se »
        if (v === 0) { stomp(t + 0.95 * tempo, 0.22); stomp(t + 1.25 * tempo, 0.22); }
        else if (v === 1) { crowdClap(t + 0.95 * tempo, 0.12); crowdClap(t + 1.22 * tempo, 0.12); }
        else { stomp(t + 0.95 * tempo, 0.2); crowdClap(t + 1.22 * tempo, 0.12); }
      } catch (e) { /* rien */ }
    });
    amb.log.push({ kind: "chant", at: nowMs() }); if (amb.log.length > 80) amb.log.shift();
  }
  function clapsOnce() {   // encouragements en attaque : rafale d'applaudissements rythmés
    if (amb.mode !== "offense" || !ctx) return;
    try { const t = ctx.currentTime + 0.02, n = 5 + Math.floor(Math.random() * 4), gap = 0.42 + Math.random() * 0.08; for (let i = 0; i < n; i++) crowdClap(t + i * gap, 0.07); } catch (e) { /* rien */ }
  }
  function whistleOnce() {   // sifflets du public sur un lancer adverse
    if (amb.mode !== "ftAway" || !ctx) return;
    try {
      const t = ctx.currentTime + 0.02;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
        const o = ctx.createOscillator(), g = ctx.createGain(), at = t + Math.random() * 0.6, f = 2100 + Math.random() * 900, d = 0.35 + Math.random() * 0.4;
        o.frequency.setValueAtTime(f, at); o.frequency.linearRampToValueAtTime(f * (Math.random() < 0.5 ? 1.25 : 0.8), at + d);
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.035, at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
        o.connect(g); g.connect(ambDuck); o.start(at); o.stop(at + d + 0.05);
      }
    } catch (e) { /* rien */ }
  }
  function clearAmbTimers() { ["chantTimer", "clapTimer", "whistleTimer"].forEach(k => { if (amb[k]) { clearTimeout(amb[k]); amb[k] = null; } }); }
  function scheduleLoops() {
    clearAmbTimers();
    const m = AMB_MIX[amb.mode] || AMB_MIX.off;
    if (m.chant && !amb.chant) { const loop = () => { chantOnce(); amb.chantTimer = setTimeout(loop, 2600 + Math.random() * 900); }; amb.chantTimer = setTimeout(loop, 700); }
    if (m.claps && !amb.cheerLoop) { const loop = () => { clapsOnce(); amb.clapTimer = setTimeout(loop, 5200 + Math.random() * 3500); }; amb.clapTimer = setTimeout(loop, 1800 + Math.random() * 1500); }
    // Fichier de huées fourni : ses sifflets suffisent (pas de sifflets synthétisés).
    if (amb.mode === "ftAway" && !hasFile("amb_boo")) { const loop = () => { whistleOnce(); amb.whistleTimer = setTimeout(loop, 1400 + Math.random() * 1200); }; amb.whistleTimer = setTimeout(loop, 300); }
  }
  // Avec le fichier « salle calme » : il remplace le brouhaha dans les moments
  // calmes (avant-match, pauses, fin, murmure du lancer franc à domicile).
  const CALM_MIX = { ftHome: { bed: 0.02, calm: 0.2 }, break: { bed: 0.08, calm: 0.5 }, pregame: { bed: 0.05, calm: 0.5 }, final: { bed: 0.1, calm: 0.45 }, ftAway: { bed: 0.2, calm: 0.25 } };
  const OFFENSE_GAIN = 0.55, HEAT_GAIN = 1.4;
  function applyMix() {
    const mode = amb.mode, m = AMB_MIX[mode] || AMB_MIX.off;
    const cm = amb.calm ? CALM_MIX[mode] : null;
    const hot = (amb.hot || amb.runHot) && !!amb.heat && (mode === "offense" || mode === "defense");
    // 24 s de l'adversaire qui s'achèvent : la salle et le chant montent.
    const tense = amb.tension && mode === "defense" ? 1.6 : 1;
    // Lancer franc : on « fait le silence » vite ; sinon fondu plus doux.
    const tc = mode === "ftHome" ? 0.35 : 0.9;
    const bed = (cm ? cm.bed : m.bed) * (hot ? 0.45 : 1) * tense;
    if (amb.bed) { T(amb.bed.gain.gain, bed, tc); if (amb.bed.filter) T(amb.bed.filter.frequency, m.tone, 1.2); }
    if (amb.calm) T(amb.calm.gain.gain, cm ? cm.calm : 0, tc);
    if (amb.heat) T(amb.heat.gain.gain, hot ? HEAT_GAIN : 0, hot ? 1.2 : 0.8);
    if (amb.cheerLoop) T(amb.cheerLoop.gain.gain, mode === "offense" ? OFFENSE_GAIN * (hot ? 1.4 : 1) : 0, mode === "offense" ? 0.6 : 0.4);
    if (amb.boo) T(amb.boo.gain.gain, m.boo, m.boo ? 0.5 : 0.8);
    if (amb.chant) T(amb.chant.gain.gain, m.chant ? CHANT_GAIN * (hot ? 1.15 : 1) * tense : 0, m.chant ? 0.45 : 0.3);
  }
  function setMode(mode) {
    if (mode === amb.mode) return false;
    const prev = amb.mode; amb.mode = mode;
    amb.log.push({ kind: "mode", mode, from: prev, at: nowMs() }); if (amb.log.length > 80) amb.log.shift();
    if (!(prefs.amb > 0) || !audio()) { clearAmbTimers(); return true; }
    ensureLayers();
    applyMix();
    if (amb.chant && (AMB_MIX[mode] || {}).chant) { amb.log.push({ kind: "chant", file: true, at: nowMs() }); if (amb.log.length > 80) amb.log.shift(); }
    scheduleLoops();
    return true;
  }
  // État du direct (appelé à chaque mise à jour de la vue, pas à chaque
  // image) : seul un CHANGEMENT de mode agit. Onglet masqué : silence.
  function updateAmbience(S, o = {}) {
    const hidden = typeof document !== "undefined" && document.hidden;
    const musicOn = typeof window !== "undefined" && window.HMMusic && window.HMMusic.current;
    let mode = hidden ? "off" : ambienceMode(S, nowMs(), o.home != null ? o.home : 0);
    if (musicOn && mode !== "off") mode = "break";   // musique des shows : le public se fait discret
    // Fin de match serrée (4e quart ou prolongation, ≤ 2 min, écart ≤ 6) :
    // la salle bout (couche `amb_bed_hot`), sans changer de mode.
    const big = isBigGame(S);
    const hot = !!(S && S.status === "live" && S.quarter >= 4 && typeof S.clock === "number" && S.clock <= (big ? 300 : 120) && S.teams && Math.abs((S.teams[0].score || 0) - (S.teams[1].score || 0)) <= (big ? 8 : 6));
    // Défense, 24 s de l'adversaire à 6 s ou moins : tension (montée).
    // Dernière possession défensive d'un match serré (Q4+, ≤ 24 s, écart ≤ 3) :
    // la salle est debout, tension maximale quel que soit le chrono des 24 s.
    const close3 = !!S && S.status === "live" && S.quarter >= 4 && typeof S.clock === "number" && S.clock <= 24 && S.teams && Math.abs((S.teams[0].score || 0) - (S.teams[1].score || 0)) <= 3;
    const tension = mode === "defense" && !!S && ((typeof S.shotClock === "number" && S.shotClock > 0 && S.shotClock <= 6) || close3);
    const hotChanged = hot !== amb.hot, tensionChanged = tension !== amb.tension;
    if (hotChanged) { amb.hot = hot; amb.log.push({ kind: "hot", on: hot, at: nowMs() }); if (amb.log.length > 80) amb.log.shift(); }
    if (tensionChanged) { amb.tension = tension; amb.log.push({ kind: "tension", on: tension, at: nowMs() }); if (amb.log.length > 80) amb.log.shift(); }
    // Tir décisif imminent (4e quart ou prolongation, ≤ 24 s, écart ≤ 3) :
    // le public retient son souffle, une fois par tir annoncé.
    const na = S && S.nextAction;
    // Meilleur marqueur adverse (≥ 20 pts) qui s'apprête à tirer : courtes
    // huées, une fois par tir annoncé.
    const away = 1 - (o.home != null ? o.home : 0);
    if (na && na.kind === "shot" && na.team === away && mode === "defense" && S.teams && S.teams[away] && Array.isArray(S.teams[away].players)) {
      const ps = S.teams[away].players, top = ps.reduce((b, p) => ((p.pts || 0) > ((b && b.pts) || 0) ? p : b), null);
      const shooter = na.actors && na.actors.shooter, dt = na.airAt - nowMs();
      if (top && (top.pts || 0) >= 20 && shooter === top.id && dt > 0 && dt <= 2500 && amb.starBooFor !== na.airAt) { amb.starBooFor = na.airAt; react({ kind: "jeer", intensity: 0.7 }); }
    }
    if (na && na.kind === "shot" && mode !== "off" && S.status === "live" && S.quarter >= 4 && typeof S.clock === "number" && S.clock <= 24 && S.teams && Math.abs((S.teams[0].score || 0) - (S.teams[1].score || 0)) <= 3) {
      const dt = na.airAt - nowMs();
      if (dt > 0 && dt <= 1800 && amb.gaspFor !== na.airAt) { amb.gaspFor = na.airAt; react({ kind: "gasp", intensity: 1 }); }
    }
    // Coup de sifflet final (passage du jeu à « final », pas l'arrivée sur un
    // match déjà fini) : victoire à domicile = explosion puis longs
    // applaudissements (plus fort si le match était serré) ; défaite =
    // grande déception puis applaudissements polis.
    const LIVE_MODES = ["offense", "defense", "ftHome", "ftAway", "neutral", "break"];
    if (mode === "final" && LIVE_MODES.includes(amb.mode) && S && S.teams) {
      const h = o.home != null ? o.home : 0, d = (S.teams[h].score || 0) - (S.teams[1 - h].score || 0);
      amb.lastReact.cheer = amb.lastReact.groan = -1e9;   // prioritaire, même juste après le dernier panier
      if (d > 0) react(big ? { kind: "cheer", intensity: 1.8, also: { kind: "wow", intensity: 1.3, delay: 200, also: { kind: "applause", intensity: 1.4, delay: 1400 } } }   // grand match : tout empilé
        : { kind: "cheer", intensity: d <= 5 ? 1.8 : 1.4, also: { kind: "applause", intensity: 1.3, delay: 1800 } });
      else if (d < 0) react({ kind: "groan", intensity: d >= -5 ? 1.4 : 1, also: { kind: "applause", intensity: 0.6, delay: 2500 } });
      amb.log.push({ kind: "finalReaction", diff: d, at: nowMs() }); if (amb.log.length > 80) amb.log.shift();
    }
    const changed = setMode(mode);   // applique le mélange avec les états « bouillant » / « tension » à jour
    if ((hotChanged || tensionChanged) && !changed && prefs.amb > 0 && audio()) { ensureLayers(); applyMix(); }
    return changed ? mode : null;
  }
  function react(r) {
    if (!r || !(prefs.amb > 0)) return false;
    const t0 = nowMs();
    if (t0 - (amb.lastReact[r.kind] || -1e9) < 900) return false;   // pas deux fois la même réaction collée
    amb.lastReact[r.kind] = t0;
    amb.log.push({ kind: "react", react: r.kind, intensity: r.intensity, at: t0 }); if (amb.log.length > 80) amb.log.shift();
    crowdSound(r);
    // Réaction enchaînée (ex. « Ooooh ! » puis clameur sur un contre).
    if (r.also) { const nx = r.also; const fire = () => { amb.lastReact[nx.kind] = -1e9; react(nx); }; if (nx.delay) { const id = setTimeout(fire, nx.delay); amb.alsoTimers = (amb.alsoTimers || []).concat(id); } else fire(); }
    return true;
  }
  function crowdSound(r) {
    const c = audio(); if (!c) return;
    unlock();
    ensureLayers();
    // Grand moment (3 points, panier décisif) : version longue « _big » si
    // fournie ; sinon une des variantes (jamais deux fois la même de suite).
    const big = (r.intensity || 1) >= 1.3 && manifest.files && manifest.files["amb_" + r.kind + "_big"];
    load(big ? "amb_" + r.kind + "_big" : "amb_" + r.kind).then(buf => {
      try {
        const t = ctx.currentTime + 0.02, k = Math.min(1.8, r.intensity || 1);
        // Fichier : léger temps de réaction du public (≈ 0,15 s), volume
        // selon l'intensité avec une petite variation.
        if (buf) { const src = ctx.createBufferSource(), g = ctx.createGain(); g.gain.value = Math.min(1.3, 0.85 * k * (0.92 + Math.random() * 0.16)); src.buffer = buf; src.connect(g); g.connect(ambDuck); src.start(t + 0.13); return; }
        const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = crowdNoise(); bp.type = "bandpass";
        if (r.kind === "cheer" || r.kind === "wow") {          // clameur qui monte puis retombe (+ « woo » aigu)
          bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1500, t + 0.4); bp.Q.value = 0.7;
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45 * k, t + 0.18); g.gain.setTargetAtTime(0.0001, t + 0.7, 0.55 + 0.25 * k);
          if (k >= 1.3) for (let i = 0; i < 3; i++) shout(t + 0.1 + i * 0.12, 0.7, 330 + Math.random() * 90, "o", 0.035);
          for (let i = 0; i < Math.round(6 * k); i++) crowdClap(t + 0.35 + i * 0.16 + Math.random() * 0.05, 0.06);
        } else if (r.kind === "groan" || r.kind === "jeer" || r.kind === "gasp") {   // « ohhh » déçu, grave, qui descend
          bp.frequency.setValueAtTime(700, t); bp.frequency.linearRampToValueAtTime(380, t + 0.9); bp.Q.value = 1.4;
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * k, t + 0.12); g.gain.setTargetAtTime(0.0001, t + 0.5, 0.35);
        } else {                           // applaudissements
          bp.frequency.value = 2200; bp.Q.value = 0.6; g.gain.value = 0.0001;
          for (let i = 0; i < Math.round(10 * k); i++) crowdClap(t + i * 0.13 + Math.random() * 0.05, 0.05);
        }
        src.connect(bp); bp.connect(g); g.connect(ambDuck); src.start(t, Math.random() * 2); src.stop(t + 3.5);
      } catch (e) { /* rien */ }
    }).catch(() => {});
  }
  function setAmbLevel(level) {
    prefs.amb = Math.max(0, Math.min(AMB_LEVELS.length - 1, Number(level) | 0)); save();
    if (ambOut) try { T(ambOut.gain, AMB_LEVELS[prefs.amb], 0.3); } catch (e) { /* rien */ }
    if (prefs.amb > 0) {
      unlock(); const m = amb.mode; amb.mode = "off"; setMode(m);
      // Retour immédiat au toucher du bouton (comme le sifflet d'essai des
      // bruitages) : une courte clameur au nouveau volume.
      crowdSound({ kind: "cheer", intensity: 0.8 });
      amb.log.push({ kind: "preview", at: nowMs() }); if (amb.log.length > 80) amb.log.shift();
    } else clearAmbTimers();
  }

  // Nouveaux événements du fil (déjà diffusés). `state.teams` index 0 =
  // domicile. Événement déjà sonorisé, en retard ou citation : rien.
  function onEvents(events, state, o = {}) {
    if (!events || !events.length || !(prefs.level > 0 || prefs.amb > 0)) return [];
    const home = o.home != null ? o.home : 0;
    const t = nowMs(), out = [];
    for (const e of events) {
      if (!e || e.id == null) continue;
      const id = String(e.id) + "@" + (e.airAt || 0);
      if (played.has(id)) continue;
      played.add(id); if (played.size > 800) played.delete(played.values().next().value);
      if (e.airAt && t - e.airAt > STALE_MS) continue;
      for (const key of sfxForEvent(e, home)) if (play(key, e.kind)) out.push(key);
      // Réaction du public (journal de l'ambiance, debug().ambLog).
      let r = crowdReactionFor(e, state, home);
      // Série en cours (points consécutifs d'une même équipe) : à 8-0 ou plus
      // pour l'équipe à domicile, la salle s'enflamme (clameur + « Ooooh ! » +
      // applaudissements empilés) et reste en ébullition jusqu'au prochain
      // panier adverse.
      const pts = e.kind === "shot" && e.made === true ? (e.zone === "three" ? 3 : 2) : e.kind === "freeThrow" ? (e.made || 0) : 0;
      if (pts > 0 && (e.team === 0 || e.team === 1)) {
        amb.run = amb.run && amb.run.team === e.team ? { team: e.team, pts: amb.run.pts + pts } : { team: e.team, pts };
        const runHot = amb.run.team === home && amb.run.pts >= 8;
        if (runHot && !amb.runHot && e.kind === "shot") {
          r = { kind: "cheer", intensity: 1.5, also: { kind: "wow", intensity: 1, delay: 150, also: { kind: "applause", intensity: 1.2, delay: 250 } } };
          amb.log.push({ kind: "run", pts: amb.run.pts, at: t }); if (amb.log.length > 80) amb.log.shift();
        }
        if (runHot !== amb.runHot) { amb.runHot = runHot; if (prefs.amb > 0 && audio()) { ensureLayers(); applyMix(); } }
      }
      // Grand match : réactions plus fortes.
      if (r && isBigGame(state)) r = { ...r, intensity: Math.min(1.8, (r.intensity || 1) * 1.2) };
      if (r) react(r);
    }
    return out;
  }
  function setLevel(level) {
    prefs.level = Math.max(0, Math.min(SFX_LEVELS.length - 1, Number(level) | 0)); save();
    if (master) try { master.gain.value = SFX_LEVELS[prefs.level]; } catch (e) { /* rien */ }
    if (prefs.level > 0) { unlock(); preload(); }
  }
  // Déblocage du son : à CHAQUE geste tant que le contexte n'est pas
  // « running » (pointerdown seul ne compte pas comme geste sur iPhone :
  // touchend / click oui ; le contexte peut aussi être remis en pause).
  const GESTURES = ["pointerdown", "pointerup", "touchend", "click", "keydown"];
  const offGesture = () => { if (typeof document !== "undefined") GESTURES.forEach(g => document.removeEventListener(g, onGesture, true)); };
  const onGesture = () => {
    if (!(prefs.level > 0 || prefs.amb > 0)) return;
    const wasRunning = ctx && ctx.state === "running";
    unlock();
    if (!wasRunning && prefs.amb > 0 && amb.mode !== "off") { const m = amb.mode; amb.mode = "off"; setMode(m); }
  };
  if (typeof document !== "undefined") GESTURES.forEach(g => document.addEventListener(g, onGesture, true));
  return {
    onEvents, play, setLevel, ready, updateAmbience, setAmbLevel,
    get level() { return prefs.level; },
    get ambLevel() { return prefs.amb; },
    get ambMode() { return amb.mode; },
    debug: () => ({ level: prefs.level, amb: prefs.amb, ambMode: amb.mode, ambLog: amb.log.slice(), files: manifest.files, log: log.slice(), played: played.size }),
    destroy() { clearAmbTimers(); (amb.alsoTimers || []).forEach(clearTimeout); offGesture(); if (ctx) { try { ctx.close(); } catch (e) { /* rien */ } } },
  };
}
