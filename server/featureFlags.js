// Drapeaux de fonctionnalités globaux (2026-10-08), stockés dans les
// données du monde (store.saveWorldAuxRaw("featureflags")) : modifiables
// par l'API admin SANS redéploiement (POST /api/admin/feature-flags).
//
// liveShows : mise en scène du direct 2D (coach devant le banc, entrée des
// joueurs, shows des arrêts de jeu). Trois modes :
//   - "whitelist" : seulement les clubs de `clubs` (noms exacts) ou ceux qui
//     ont la bêta par club (Team.betaFeatures "liveShows", /api/admin/beta-feature) ;
//   - "all"       : tout le monde (sortie de bêta) ;
//   - "off"       : coupé pour tous.
// Sous-drapeaux : coach, playerIntro, shows (chaque brique séparément) et
// ads (pub interstitielle des non-premium pendant les shows).
//
// live2d (2026-10-09, sortie de bêta) : terrain animé du direct. "all" =
// tout le monde (défaut), "whitelist" = seulement les clubs qui ont la bêta
// par club (Team.betaFeatures "live2d"), "off" = coupé pour tous.
// Sortie de bêta du 2026-10-09 : un réglage enregistré AVANT (sans `v`)
// ne garde pas son mode « whitelist » — tout le monde passe en "all" ; un
// réglage posé ensuite par l'API admin (v = 2) est respecté tel quel.
"use strict";

const NAME = "featureflags";   // store : minuscules seulement
const VERSION = 2;
const DEFAULTS = Object.freeze({
  v: VERSION,
  live2d: { mode: "all" },
  liveShows: {
    mode: "all",
    clubs: ["Gotham Knights", "BC Dia"],
    coach: true,
    playerIntro: true,
    shows: true,
    // Pub des non-premium : interstitiel H5 existant (décision 2026-10-08),
    // une par arrêt au plus, plafond par match, arrêt assez long pour que la
    // pub finisse avant la reprise.
    ads: { enabled: true, maxPerMatch: 3, minStoppageMs: 25000 },
  },
});
const MODES = ["whitelist", "all", "off"];

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function normalize(raw) {
  const out = clone(DEFAULTS);
  const current = !!(raw && typeof raw === "object" && raw.v >= VERSION);
  const l2 = raw && typeof raw === "object" && raw.live2d && typeof raw.live2d === "object" ? raw.live2d : null;
  if (l2 && current && MODES.includes(l2.mode)) out.live2d.mode = l2.mode;
  const ls = raw && typeof raw === "object" && raw.liveShows && typeof raw.liveShows === "object" ? raw.liveShows : null;
  if (ls) {
    if (MODES.includes(ls.mode) && (current || ls.mode === "off")) out.liveShows.mode = ls.mode;
    if (Array.isArray(ls.clubs)) out.liveShows.clubs = ls.clubs.filter(c => typeof c === "string" && c.trim()).map(c => c.trim()).slice(0, 200);
    for (const k of ["coach", "playerIntro", "shows"]) if (typeof ls[k] === "boolean") out.liveShows[k] = ls[k];
    if (ls.ads && typeof ls.ads === "object") {
      if (typeof ls.ads.enabled === "boolean") out.liveShows.ads.enabled = ls.ads.enabled;
      const n = Number(ls.ads.maxPerMatch);
      if (Number.isFinite(n) && n >= 0 && n <= 20) out.liveShows.ads.maxPerMatch = Math.floor(n);
      const m = Number(ls.ads.minStoppageMs);
      if (Number.isFinite(m) && m >= 0 && m <= 600000) out.liveShows.ads.minStoppageMs = Math.floor(m);
    }
  }
  return out;
}

// Fusion d'un correctif partiel (body de la route admin) dans l'existant.
function merge(current, patch) {
  const cur = normalize(current);
  const p = patch && typeof patch === "object" ? patch : {};
  const next = { v: VERSION, live2d: { ...cur.live2d }, liveShows: cur.liveShows };
  if (p.live2d && typeof p.live2d === "object") next.live2d = { ...cur.live2d, ...p.live2d };
  if (p.liveShows && typeof p.liveShows === "object") next.liveShows = { ...cur.liveShows, ...p.liveShows, ads: { ...cur.liveShows.ads, ...(p.liveShows.ads || {}) } };
  return normalize(next);
}

let cache = null, cacheAt = 0;
const TTL_MS = 30 * 1000;

async function load(store, savePath, now = Date.now()) {
  if (cache && now - cacheAt < TTL_MS) return cache;
  let raw = null;
  try { raw = await store.loadWorldAuxRaw(NAME, savePath); } catch (e) { raw = null; }
  cache = normalize(raw); cacheAt = now;
  return cache;
}

async function update(store, savePath, patch) {
  let raw = null;
  try { raw = await store.loadWorldAuxRaw(NAME, savePath); } catch (e) { raw = null; }
  const next = merge(raw, patch);
  await store.saveWorldAuxRaw(NAME, next, savePath);
  cache = next; cacheAt = Date.now();
  return next;
}

function _resetCacheForTests() { cache = null; cacheAt = 0; }

// Compteurs de pubs (POST /api/ads/track) : { "AAAA-MM-JJ": { "liveShow:pompom:impression": n } }.
const AdsStats = (() => {
  let pending = {}, timer = null;
  function count(event, placement, show) {
    const day = new Date().toISOString().slice(0, 10);
    const k = [placement, show, event].filter(Boolean).join(":");
    pending[day] = pending[day] || {};
    pending[day][k] = (pending[day][k] || 0) + 1;
  }
  async function flush(store, savePath) {
    const batch = pending; pending = {};
    if (!Object.keys(batch).length) return;
    let cur = null;
    try { cur = await store.loadWorldAuxRaw("adsstats", savePath); } catch (e) { cur = null; }
    const out = cur && typeof cur === "object" ? cur : {};
    for (const day of Object.keys(batch)) { out[day] = out[day] || {}; for (const k of Object.keys(batch[day])) out[day][k] = (out[day][k] || 0) + batch[day][k]; }
    const days = Object.keys(out).sort(); while (days.length > 60) delete out[days.shift()];   // 60 jours gardés
    try { await store.saveWorldAuxRaw("adsstats", out, savePath); } catch (e) { /* perdu : statistiques seulement */ }
  }
  function scheduleFlush(store, savePath, ms = 60000) {
    if (timer) return;
    timer = setTimeout(() => { timer = null; flush(store, savePath); }, ms);
    if (timer && typeof timer.unref === "function") timer.unref();
  }
  return { count, flush, scheduleFlush, _pending: () => pending };
})();

module.exports = { DEFAULTS, MODES, normalize, merge, load, update, AdsStats, _resetCacheForTests };
