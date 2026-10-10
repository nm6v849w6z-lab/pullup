// =====================================================================
// Musiques des séquences (2026-10-08) : émissions d'avant-match et de
// mi-temps (« emission »), entrée des joueurs du direct 2D (« entree »),
// shows du direct 2D (« pompom », « mascotte1..3 », « lanceur », 2026-10-09 ;
// mascotte : trois musiques à tour de rôle, 2026-10-10).
// Fichiers fournis, utilisés tels quels : assets/audio/music/*.mp3.
//
//   HMMusic.play("emission")            // lance (fondu d'entrée), en boucle
//   HMMusic.play("entree", { lease })   // doit être renouvelé (sinon s'arrête)
//   HMMusic.stop("emission")            // fondu de sortie puis arrêt
//   HMMusic.duck(promise)               // coupe pendant une pub sonore
//
// Règles : une seule musique à la fois (la précédente finit son fondu de
// sortie AVANT que la suivante démarre) ; fondu d'entrée ~1,5 s, de sortie
// ~0,9 s (0,4 s quand on passe d'une musique à l'autre) ; rien quand
// l'onglet est masqué. Fondus par Web Audio (GainNode) — le volume d'un
// <audio> est figé sur iPhone ; repli sur element.volume sinon. Si le
// navigateur bloque la lecture automatique, elle démarre au premier toucher.
// =====================================================================
(function () {
  if (typeof window === "undefined" || window.HMMusic) return;
  const script = document.currentScript;
  const BASE = script && script.src ? new URL("music/", script.src).href : "assets/audio/music/";
  const TRACKS = { emission: "emission.mp3", entree: "entree-joueurs.mp3",
    pompom: "pompom.mp3", mascotte1: "mascotte-1.mp3", mascotte2: "mascotte-2.mp3", mascotte3: "mascotte-3.mp3", lanceur: "lanceur-maillot.mp3" };   // shows du direct 2D (mascotte : 3 musiques à tour de rôle)
  const FILES_VERSION = "20261010";   // à changer quand un fichier est remplacé (cache navigateur 24 h)
  const VOLUME = 0.55, FADE_IN = 1500, FADE_OUT = 900, FADE_SWITCH = 400;
  let ctx = null;
  let cur = null;        // { key, el, gain, state: "play" | "out", lease, blocked, ducked }
  let next = null;       // { key, opts } : demandée pendant le fondu de sortie de `cur`
  let leaseTimer = 0;

  function audioCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }
  // Volume (0 → VOLUME) en `ms`, puis `done`.
  function ramp(t, to, ms, done) {
    if (t.fadeTimer) { clearInterval(t.fadeTimer); t.fadeTimer = 0; }
    if (t.gain && ctx) {
      const g = t.gain.gain, now = ctx.currentTime;
      try { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(to, now + ms / 1000); } catch (e) { g.value = to; }
      if (done) t.fadeTimer = setTimeout(done, ms + 30);
      return;
    }
    const from = t.el.volume, t0 = Date.now();
    t.fadeTimer = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      try { t.el.volume = from + (to - from) * k; } catch (e) { /* rien */ }
      if (k >= 1) { clearInterval(t.fadeTimer); t.fadeTimer = 0; if (done) done(); }
    }, 30);
  }
  function release(t) {
    if (t.fadeTimer) { clearInterval(t.fadeTimer); clearTimeout(t.fadeTimer); }
    try { t.el.pause(); } catch (e) { /* rien */ }
    try { if (t.src) t.src.disconnect(); if (t.gain) t.gain.disconnect(); } catch (e) { /* rien */ }
    try { t.el.removeAttribute("src"); t.el.load(); } catch (e) { /* rien */ }
  }
  function start(key, opts) {
    const file = TRACKS[key];
    if (!file) return;
    const el = new Audio(BASE + file + "?v=" + FILES_VERSION);
    el.loop = opts.loop !== false; el.preload = "auto";
    const t = { key, el, gain: null, src: null, state: "play", lease: 0, blocked: false, ducked: false, fadeTimer: 0 };
    const c = audioCtx();
    if (c) {
      try { t.src = c.createMediaElementSource(el); t.gain = c.createGain(); t.gain.gain.value = 0; t.src.connect(t.gain); t.gain.connect(c.destination); }
      catch (e) { t.src = t.gain = null; }
      if (c.state === "suspended") { try { c.resume(); } catch (e) { /* rien */ } }
    }
    if (!t.gain) el.volume = 0;
    cur = t;
    renew(opts);
    if (!document.hidden) begin(t);
  }
  function begin(t) {
    const p = t.el.play();
    if (p && p.catch) p.catch(() => { if (cur === t) t.blocked = true; });   // lecture auto bloquée : au premier toucher
    ramp(t, VOLUME, FADE_IN);
  }
  function renew(opts) {
    if (!cur) return;
    cur.lease = opts && opts.lease ? Date.now() + opts.lease : 0;
    if (cur.lease && !leaseTimer) leaseTimer = setInterval(() => {
      if (!cur || !cur.lease) { clearInterval(leaseTimer); leaseTimer = 0; return; }
      if (Date.now() > cur.lease) stop(cur.key);   // séquence plus suivie : fin
    }, 300);
  }
  function play(key, opts = {}) {
    if (!TRACKS[key]) return;
    if (cur && cur.key === key && cur.state === "play") { renew(opts); return; }
    // Une séquence ouverte explicitement (émission) garde la main sur une
    // demande « à bail » (entrée des joueurs pendant que l'émission est ouverte).
    if (opts.lease && ((cur && cur.state === "play" && !cur.lease) || (next && !next.opts.lease))) return;
    if (cur) { next = { key, opts }; fadeOut(cur, FADE_SWITCH); return; }
    start(key, opts);
  }
  function fadeOut(t, ms) {
    if (t.state === "out") return;
    t.state = "out";
    ramp(t, 0, ms, () => {
      release(t);
      if (cur === t) cur = null;
      const n = next; next = null;
      if (n) start(n.key, n.opts);
    });
  }
  function stop(key, ms = FADE_OUT) {
    if (next && (!key || next.key === key)) next = null;
    if (!cur || (key && cur.key !== key)) return;
    fadeOut(cur, ms);
  }
  // Pub sonore (vraie régie) : la musique s'efface puis reprend après.
  function duck(promise) {
    const t = cur;
    if (t && t.state === "play") { t.ducked = true; ramp(t, 0, 300, () => { if (cur === t && t.ducked) { try { t.el.pause(); } catch (e) { /* rien */ } } }); }
    const back = () => { if (cur === t && t && t.ducked) { t.ducked = false; if (t.state === "play" && !document.hidden) begin(t); } };
    return Promise.resolve(promise).then(v => { back(); return v; }, e => { back(); throw e; });
  }
  // Onglet masqué : silence ; retour : reprise (une séquence « bail » non
  // renouvelée s'arrête d'elle-même).
  document.addEventListener("visibilitychange", () => {
    if (!cur || cur.state !== "play") return;
    if (document.hidden) { try { cur.el.pause(); } catch (e) { /* rien */ } }
    else if (!cur.ducked && (!cur.lease || Date.now() <= cur.lease)) begin(cur);
  });
  // Premier geste : contexte audio débloqué, lecture bloquée relancée.
  const unlock = () => {
    const c = audioCtx();
    if (c && c.state === "suspended") { try { c.resume(); } catch (e) { /* rien */ } }
    if (cur && cur.blocked && cur.state === "play" && !document.hidden) { cur.blocked = false; begin(cur); }
  };
  ["pointerdown", "keydown", "touchend"].forEach(ev => document.addEventListener(ev, unlock, true));

  window.HMMusic = {
    play, stop, duck,
    get current() { return cur && cur.state === "play" ? cur.key : null; },
    debug: () => ({ current: cur ? { key: cur.key, state: cur.state, blocked: cur.blocked, ducked: cur.ducked, lease: cur.lease, time: cur.el.currentTime, level: cur.gain ? cur.gain.gain.value : cur.el.volume, webAudio: !!cur.gain } : null, next: next ? next.key : null }),
  };
})();
