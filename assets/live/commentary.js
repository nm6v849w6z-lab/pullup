// =====================================================================
// Commentaire audio du direct 2D (2026-10-08).
//
// Le terrain (court2d.js) annonce chaque « moment » au moment même où il
// l'anime (panier, contre, interception, temps mort, fin de quart…) via
// opts.onMoment ; ce module choisit une phrase et la fait entendre :
//   - fichier enregistré s'il existe : assets/audio/commentary/<langue>/
//     <moment>_<n>.mp3, déclaré dans manifest.json de la langue
//     ({ "files": { "trois_points": 4, … } } = 4 variantes) ;
//   - sinon, voix de synthèse du navigateur (provisoire), qui lit le texte
//     de la variante — le même texte que celui à générer avec la vraie voix.
// Règles d'écoute : une seule voix à la fois, les moments forts coupent les
// petits, un délai minimum entre deux phrases ordinaires, pas deux fois la
// même variante de suite, rien quand l'onglet est masqué (le terrain ne
// rejoue rien au retour, il n'y a donc jamais de rattrapage audio).
// Préférence (activé, volume) gardée dans ce navigateur (localStorage).
// =====================================================================

// p = priorité (0 petit … 3 énorme) ; chance = probabilité de commenter
// (les actions fréquentes ne sont pas toutes commentées).
export const MOMENTS = {
  entre_deux: { p: 2, chance: 1, lines: ["C'est parti, l'entre-deux est lancé !", "Le ballon est en l'air, le match commence !", "Entre-deux… et c'est parti !"] },
  debut_quart: { p: 1, chance: 0.8, lines: ["On reprend !", "C'est reparti pour un nouveau quart-temps.", "Les deux équipes sont de retour sur le parquet."] },
  panier: { p: 1, chance: 0.45, lines: ["Panier !", "Et ça rentre !", "Deux points de plus.", "Bien joué, c'est dedans."] },
  trois_points: { p: 2, chance: 1, lines: ["Trois points… dedans !", "Derrière l'arc… et ça rentre !", "Quel tir à trois points !", "Il ne tremble pas, trois points !"] },
  dunk: { p: 2, chance: 1, lines: ["Quel dunk !", "Il s'envole… et il écrase le ballon dans le cercle !", "Dunk ! La salle est debout !"] },
  buzzer: { p: 3, chance: 1, lines: ["Au buzzer… ça rentre ! Incroyable !", "Sur la sirène ! Quel panier !", "Juste avant la sonnerie… dedans !"] },
  contre: { p: 2, chance: 1, lines: ["Contré !", "Quel contre !", "Non, non, non ! Énorme contre !"] },
  rate: { p: 0, chance: 0.3, lines: ["C'est raté.", "Ça ressort…", "Le tir ne trouve pas la cible."] },
  rebond_offensif: { p: 1, chance: 0.5, lines: ["Rebond offensif !", "Deuxième chance pour l'attaque.", "Ils récupèrent leur propre rebond !"] },
  interception: { p: 1, chance: 0.7, lines: ["Interception !", "Ballon volé !", "Il lit parfaitement la passe, interception !"] },
  perte: { p: 0, chance: 0.4, lines: ["Balle perdue.", "Quel dommage, ballon rendu.", "Mauvaise passe, ballon perdu."] },
  faute: { p: 0, chance: 0.4, lines: ["Coup de sifflet, faute.", "L'arbitre siffle une faute.", "Faute !"] },
  faute_technique: { p: 2, chance: 1, lines: ["Faute technique !", "L'arbitre ne laisse rien passer, faute technique.", "Technique ! Le ton monte."] },
  antisportive: { p: 2, chance: 1, lines: ["Faute antisportive !", "C'est sévère, faute antisportive.", "Antisportive, l'arbitre n'hésite pas."] },
  exclusion: { p: 2, chance: 1, lines: ["Cinquième faute, il doit sortir.", "Il est exclu, c'est un coup dur.", "C'est terminé pour lui ce soir."] },
  blessure: { p: 2, chance: 1, lines: ["Il reste au sol… on espère que ce n'est rien.", "Inquiétude, il se tient la jambe.", "Le jeu est arrêté, un joueur est touché."] },
  lancer_reussi: { p: 0, chance: 0.25, lines: ["Lancer réussi.", "Dedans.", "Il ne rate pas."] },
  lancer_rate: { p: 0, chance: 0.3, lines: ["Lancer manqué.", "À côté.", "Il laisse filer le lancer."] },
  changement: { p: 0, chance: 0.25, lines: ["Changement de joueur.", "Le coach fait tourner.", "Du sang neuf sur le terrain."] },
  temps_mort: { p: 2, chance: 1, lines: ["Temps mort !", "Le coach demande un temps mort.", "On s'arrête, temps mort."] },
  fin_quart: { p: 2, chance: 1, lines: ["Fin du quart-temps !", "La sirène retentit, fin du quart.", "Et c'est la fin de ce quart-temps."] },
  mi_temps: { p: 2, chance: 1, lines: ["C'est la mi-temps !", "Les équipes rentrent au vestiaire.", "Mi-temps, on souffle un peu."] },
  fin_match: { p: 3, chance: 1, lines: ["C'est terminé ! Quel match !", "Fin du match, merci à tous !", "La sirène finale retentit, c'est fini !"] },
};
// Délai minimum depuis la phrase précédente, selon la priorité.
const GAP_MS = [4500, 2600, 900, 0];
const STORE = "hm-commentary";

// Générateur déterministe à partir d'une clé (mission live 2026-10-10).
function keyedRandom(key) {
  let h = 0x811c9dc5; const k = String(key);
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  let a = h | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function createCommentary(opts = {}) {
  // Dossier audio à côté du module (assets/live → assets/audio/commentary),
  // quelle que soit la page qui charge le direct.
  let base = opts.base;
  if (!base) { try { base = new URL("../audio/commentary", import.meta.url).href; } catch (e) { base = "assets/audio/commentary"; } }
  const lang = opts.lang || "fr";
  const rand = opts.random || Math.random;
  const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let prefs = { on: false, vol: 0.9 };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(STORE) || "{}") }; } catch (e) { /* navigation privée */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (e) { /* rien */ } };
  let manifest = { files: {} };
  const ready = (typeof fetch === "function"
    ? fetch(`${base}/${lang}/manifest.json`, { cache: "no-cache" }).then(r => (r.ok ? r.json() : { files: {} })).catch(() => ({ files: {} }))
    : Promise.resolve({ files: {} })).then(m => { manifest = m && typeof m === "object" && m.files ? m : { files: {} }; preload(); return manifest; });
  let current = null;          // { p, stop(), done }
  let lastAt = -1e9;
  const lastVariant = {};
  const log = [];              // derniers moments dits (tests, débogage)
  const tts = () => (opts.tts !== false && typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined" ? speechSynthesis : null);
  let voice = null;
  function pickVoice() {
    const s = tts(); if (!s || voice) return voice;
    const vs = s.getVoices() || [];
    voice = vs.find(v => /^fr(-|_)FR/i.test(v.lang)) || vs.find(v => /^fr/i.test(v.lang)) || null;
    return voice;
  }
  function stop() {
    if (current) { try { current.stop(); } catch (e) { /* rien */ } current = null; }
  }
  // Lecture par Web Audio (fichiers téléchargés puis décodés une fois) :
  // contrairement à <audio>, rien n'est bloqué sur iPhone une fois le
  // contexte débloqué par un geste (le bouton Commentaire), et le serveur
  // n'a pas à gérer les requêtes partielles (Range).
  let ctx = null, gain = null;
  const buffers = new Map();   // url → Promise<AudioBuffer|null>
  function audio() {
    if (ctx) return ctx;
    const AC = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AC) return null;
    try { ctx = new AC(); gain = ctx.createGain(); gain.gain.value = prefs.vol; gain.connect(ctx.destination); } catch (e) { ctx = null; }
    return ctx;
  }
  function unlock() {
    const c = audio(); if (c && c.state === "suspended") { try { c.resume(); } catch (e) { /* rien */ } }
    // Synthèse vocale : iOS n'accepte la première phrase que dans un geste.
    const s = tts(); if (s && !unlocked) { unlocked = true; try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; s.speak(u); } catch (e) { /* rien */ } }
  }
  let unlocked = false;
  const fileUrl = (moment, i) => `${base}/${lang}/${moment}_${i + 1}.mp3?v=${encodeURIComponent(manifest.version || 1)}`;
  function load(url) {
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
    if (!prefs.on) return;
    for (const [m, n] of Object.entries(manifest.files || {})) for (let i = 0; i < Math.min(Number(n) || 0, 12); i++) load(fileUrl(m, i));
  }
  function playFile(url, p) {
    const c = audio(); if (!c) return null;
    const t0 = nowMs();
    let src = null;
    const cur = { p, done: false, stop: () => { cur.done = true; if (src) { try { src.stop(); } catch (e) { /* rien */ } } } };
    load(url).then(buf => {
      // Pas encore téléchargé : on ne parle que si c'est encore d'actualité.
      if (!buf || cur.done || nowMs() - t0 > 1500 || (typeof document !== "undefined" && document.hidden)) { cur.done = true; return; }
      if (c.state === "suspended") { try { c.resume(); } catch (e) { /* rien */ } }
      src = c.createBufferSource(); src.buffer = buf; src.connect(gain);
      src.onended = () => { cur.done = true; };
      try { src.start(); } catch (e) { cur.done = true; }
    });
    return cur;
  }
  function speak(text, p) {
    const s = tts(); if (!s) return null;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR"; u.rate = 1.08; u.pitch = 1; u.volume = prefs.vol;
    const v = pickVoice(); if (v) u.voice = v;
    const c = { p, done: false, stop: () => { try { s.cancel(); } catch (e) { /* rien */ } c.done = true; } };
    u.onend = u.onerror = () => { c.done = true; };
    try { s.cancel(); s.speak(u); } catch (e) { return null; }
    return c;
  }
  // Moment annoncé par le terrain. Renvoie true si une phrase est jouée.
  function say(moment, info = {}) {
    const def = MOMENTS[moment];
    if (!def || !prefs.on) return false;
    if (typeof document !== "undefined" && document.hidden) return false;
    // Tirage reproductible : graine = action du match (court2d, info.key).
    const r = info.key ? keyedRandom(info.key) : rand;
    if (!info.force && r() > def.chance) return false;
    const t = nowMs();
    const busy = current && !current.done;
    if (busy) {
      if (def.p <= current.p) return false;     // on ne coupe que pour plus fort
      stop();
    } else if (t - lastAt < GAP_MS[def.p]) return false;
    const n = Math.max(1, Math.min(def.lines.length, Number(manifest.files[moment]) || def.lines.length));
    let i = Math.floor(r() * n);
    if (n > 1 && i === lastVariant[moment]) i = (i + 1) % n;
    lastVariant[moment] = i;
    const file = Number(manifest.files[moment]) > 0;
    current = file ? playFile(fileUrl(moment, i), def.p) : speak(def.lines[i], def.p);
    if (!current) return false;
    lastAt = t;
    log.push({ moment, i, file });
    if (log.length > 50) log.shift();
    return true;
  }
  function setOn(on) {
    prefs.on = !!on; save();
    if (!prefs.on) stop();
    else { unlock(); preload(); const s = tts(); if (s) { try { s.getVoices(); } catch (e) { /* rien */ } } }
  }
  function setVolume(v) { prefs.vol = Math.max(0, Math.min(1, Number(v) || 0)); save(); if (gain) gain.gain.value = prefs.vol; }
  // Commentaire déjà activé (préférence) : le navigateur exige un geste
  // avant de jouer du son, on débloque au premier toucher de la page.
  const onGesture = () => { if (prefs.on) unlock(); if (typeof document !== "undefined") document.removeEventListener("pointerdown", onGesture, true); };
  if (typeof document !== "undefined") document.addEventListener("pointerdown", onGesture, true);
  const onVis = () => { if (typeof document !== "undefined" && document.hidden) stop(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
  return {
    say, stop, setOn, setVolume, ready,
    get on() { return prefs.on; }, get volume() { return prefs.vol; },
    debug: () => ({ on: prefs.on, files: manifest.files, log: log.slice() }),
    destroy() { stop(); if (typeof document !== "undefined") { document.removeEventListener("visibilitychange", onVis); document.removeEventListener("pointerdown", onGesture, true); } if (ctx) { try { ctx.close(); } catch (e) { /* rien */ } } },
  };
}
