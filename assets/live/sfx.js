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
//   tir ou lancer franc RATÉ de l'équipe à l'extérieur → « wah-wah » comique.
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
  // Raté de l'équipe à l'extérieur : lancer franc manqué, ou tir manqué
  // (dans le fil, un tir manqué est l'événement « rebound » : équipe du
  // tireur = celle du rebondeur sur un rebond offensif, l'autre sinon).
  { key: "miss", when: (e, home) => e.kind === "freeThrow" && (e.made || 0) === 0 && (e.team === 0 || e.team === 1) && e.team !== home },
  { key: "miss", when: (e, home) => e.kind === "rebound" && (e.team === 0 || e.team === 1) && (e.offensive ? e.team : 1 - e.team) !== home },
];
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
  const prefs = (() => { try { const p = JSON.parse(localStorage.getItem(STORE) || "null"); if (p && Number.isInteger(p.level)) return p; } catch (e) { /* rien */ } return { level: 2 }; })();
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (e) { /* rien */ } };
  const played = new Set();       // ids d'événements déjà sonorisés
  const lastAt = {};              // bruitage → instant de la dernière lecture
  const log = [];                 // derniers bruitages (tests, diagnostic)
  let ctx = null, master = null, comp = null;
  let manifest = { files: {} };
  const buffers = new Map();
  const ready = (typeof fetch === "function"
    ? fetch(`${base}/manifest.json`, { cache: "no-cache" }).then(r => (r.ok ? r.json() : { files: {} })).catch(() => ({ files: {} }))
    : Promise.resolve({ files: {} })).then(m => { manifest = m && m.files ? m : { files: {} }; if (prefs.level > 0) preload(); return manifest; });

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
    } catch (e) { ctx = null; }
    return ctx;
  }
  function unlock() { const c = audio(); if (c && c.state === "suspended") { try { c.resume(); } catch (e) { /* rien */ } } }
  function load(key) {
    const file = manifest.files && manifest.files[key];
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
  function preload() { for (const k of Object.keys(manifest.files || {})) load(k); }

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
    load(key).then(buf => {
      try {
        if (buf) { const src = c.createBufferSource(); src.buffer = buf; src.connect(master); src.start(); return; }
        if (SYNTH[key]) SYNTH[key](c.currentTime + 0.01);
      } catch (e) { /* un bruitage raté ne bloque jamais le direct */ }
    }).catch(() => {});
    return true;
  }
  // Nouveaux événements du fil (déjà diffusés). `state.teams` index 0 =
  // domicile. Événement déjà sonorisé, en retard ou citation : rien.
  function onEvents(events, state, o = {}) {
    if (!events || !events.length || !(prefs.level > 0)) return [];
    const home = o.home != null ? o.home : 0;
    const t = nowMs(), out = [];
    for (const e of events) {
      if (!e || e.id == null) continue;
      const id = String(e.id) + "@" + (e.airAt || 0);
      if (played.has(id)) continue;
      played.add(id); if (played.size > 800) played.delete(played.values().next().value);
      if (e.airAt && t - e.airAt > STALE_MS) continue;
      for (const key of sfxForEvent(e, home)) if (play(key, e.kind)) out.push(key);
    }
    return out;
  }
  function setLevel(level) {
    prefs.level = Math.max(0, Math.min(SFX_LEVELS.length - 1, Number(level) | 0)); save();
    if (master) try { master.gain.value = SFX_LEVELS[prefs.level]; } catch (e) { /* rien */ }
    if (prefs.level > 0) { unlock(); preload(); }
  }
  const onGesture = () => { if (prefs.level > 0) unlock(); if (typeof document !== "undefined") document.removeEventListener("pointerdown", onGesture, true); };
  if (typeof document !== "undefined") document.addEventListener("pointerdown", onGesture, true);
  return {
    onEvents, play, setLevel, ready,
    get level() { return prefs.level; },
    debug: () => ({ level: prefs.level, files: manifest.files, log: log.slice(), played: played.size }),
    destroy() { if (typeof document !== "undefined") document.removeEventListener("pointerdown", onGesture, true); if (ctx) { try { ctx.close(); } catch (e) { /* rien */ } } },
  };
}
