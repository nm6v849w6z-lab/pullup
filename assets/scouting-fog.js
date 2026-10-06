/* Analyste vidéo — brouillard de guerre (2026-10-06, maquette validée).
   Module partagé serveur (require) / navigateur (window.HM_FOG).

   Règle : aucune information sur un adversaire n'est certaine. Une séance
   vidéo produit un RAPPORT figé (valeurs observées ce jour-là, sous forme
   d'intervalles) pour tout l'effectif adverse ; le serveur n'envoie ensuite
   que ces intervalles (élargis avec l'âge du rapport), jamais les vraies
   valeurs. Les joueurs du manager restent exacts (non traités ici).

   Team.scoutReports = { clé du club (nom en minuscules) : [rapport, …] },
   plus récent d'abord, CONFIG.maxReportsPerClub au plus. Rapport :
   { club, clubName, season, at, level, keys: [clés révélées],
     p: { idJoueur: { n: nom, o: [min,max] note, s: [min,max] étoiles,
                      a: { clé: [min,max] } } } }

   Extensible : barème par niveau dans CONFIG.levels, caractéristiques
   éligibles dans CONFIG.eligibleAttrs, autres types de rapports (tactique,
   par joueur, analystes spécialisés) = autres champs du rapport. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HM_FOG = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CONFIG = {
    // reveal : caractéristiques révélées (les mêmes pour tout l'effectif) ;
    // half : demi-largeur de l'intervalle ; errChance : probabilité que
    // l'estimation soit décalée de errShift points (l'intervalle peut alors
    // rater la vraie valeur) ; starsHalf : demi-largeur sur le potentiel.
    levels: {
      1: { reveal: 1, half: 5, errChance: 0.25, errShift: [3, 6], starsHalf: 1 },
      2: { reveal: 2, half: 4, errChance: 0.18, errShift: [2, 5], starsHalf: 1 },
      3: { reveal: 3, half: 3, errChance: 0.12, errShift: [2, 4], starsHalf: 0.5 },
      4: { reveal: 4, half: 2, errChance: 0.07, errShift: [2, 3], starsHalf: 0.5 },
      5: { reveal: 5, half: 1, errChance: 0.03, errShift: [1, 2], starsHalf: 0.5 },
    },
    ovrExtraHalf: 1,          // la note globale est un peu moins précise
    agingHalfPerSeason: 2,    // chaque saison écoulée élargit de ± 2
    unscoutedOvrSpan: 25,     // sans rapport : fourchette de 25 points
    salarySpan: 0.3,          // salaire adverse : fourchette de 30 %
    maxReportsPerClub: 3,
    eligibleAttrs: null,      // null = toutes les caractéristiques
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clubKey = name => String(name || "").trim().toLowerCase();
  const levelCfg = level => CONFIG.levels[clamp(Math.round(level || 1), 1, 5)];

  // Hachage stable (fourchettes sans rapport : identiques à chaque
  // chargement, sinon on retrouverait la valeur en rechargeant).
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }

  // Potentiel (0-99, 10 paliers) → étoiles (0,5 à 5, par demi-étoile).
  function starsOf(potential) {
    if (typeof potential !== "number") return null;
    return clamp(Math.floor(clamp(potential, 0, 99) / 10) + 1, 1, 10) / 2;
  }

  function estimate(value, half, cfg, rng) {
    let c = value;
    if (rng() < cfg.errChance) {
      const [a, b] = cfg.errShift;
      c += (rng() < 0.5 ? -1 : 1) * (a + Math.floor(rng() * (b - a + 1)));
    }
    let lo = Math.round(c - half), hi = Math.round(c + half);
    if (lo < 1) { hi += 1 - lo; lo = 1; }
    if (hi > 99) { lo -= hi - 99; hi = 99; }
    return [lo, hi];
  }

  function estimateStars(stars, cfg, rng) {
    if (stars == null) return null;
    let c = stars;
    if (rng() < cfg.errChance) c += rng() < 0.5 ? -0.5 : 0.5;
    return [clamp(c - cfg.starsHalf, 0.5, 5), clamp(c + cfg.starsHalf, 0.5, 5)];
  }

  // Rapport d'une séance vidéo sur `opp`. ctx : { level, season, now,
  // attrs (liste ATTRS), overall(p), rng }.
  function makeReport(opp, ctx) {
    const cfg = levelCfg(ctx.level);
    const rng = ctx.rng || Math.random;
    const pool = (CONFIG.eligibleAttrs || ctx.attrs).filter(k => ctx.attrs.includes(k));
    const drawn = pool.slice();
    for (let i = drawn.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [drawn[i], drawn[j]] = [drawn[j], drawn[i]]; }
    const keys = ctx.attrs.filter(k => drawn.slice(0, cfg.reveal).includes(k));
    const p = {};
    (opp.players || []).forEach(pl => {
      if (!pl || pl.id == null) return;
      const a = {};
      keys.forEach(k => { if (pl.attrs && typeof pl.attrs[k] === "number") a[k] = estimate(pl.attrs[k], cfg.half, cfg, rng); });
      p[pl.id] = { n: pl.name, o: estimate(ctx.overall(pl), cfg.half + CONFIG.ovrExtraHalf, cfg, rng), s: estimateStars(starsOf(pl.potential), cfg, rng), a };
    });
    return { club: clubKey(opp.name), clubName: opp.name, season: ctx.season, at: ctx.now, level: Math.round(ctx.level || 1), keys, p };
  }

  function addReport(team, report) {
    team.scoutReports = team.scoutReports && typeof team.scoutReports === "object" ? team.scoutReports : {};
    const list = (team.scoutReports[report.club] || []).filter(r => r.season !== report.season);
    team.scoutReports[report.club] = [report, ...list].slice(0, CONFIG.maxReportsPerClub);
  }

  function reportFor(team, oppName, season) {
    const list = (team && team.scoutReports && team.scoutReports[clubKey(oppName)]) || [];
    return season == null ? (list[0] || null) : (list.find(r => r.season === season) || null);
  }

  // Confiance : 4 Très bonne, 3 Bonne, 2 Moyenne, 1 Faible (0 = aucun rapport).
  function confidence(level, age) {
    const base = level >= 5 ? 4 : level >= 3 ? 3 : 2;
    return clamp(base - Math.max(0, age || 0), 1, 4);
  }
  const CONF_LABELS = ["Aucun rapport", "Faible", "Moyenne", "Bonne", "Très bonne"];

  const widen = (r, w, lo = 1, hi = 99) => r ? [clamp(r[0] - w, lo, hi), clamp(r[1] + w, lo, hi)] : null;

  function unscoutedOvr(playerId, ovr, season) {
    const span = CONFIG.unscoutedOvrSpan;
    const off = Math.floor(hash(playerId + ":" + season) * (span + 1));
    let lo = Math.round(ovr) - off, hi = lo + span;
    if (lo < 1) { hi += 1 - lo; lo = 1; }
    if (hi > 99) { lo -= hi - 99; hi = 99; }
    return [lo, hi];
  }

  function salaryRange(playerId, salary) {
    if (typeof salary !== "number" || !(salary > 0)) return null;
    const u = hash("sal:" + playerId);
    const lo = salary * (1 - CONFIG.salarySpan * u);
    const hi = lo * (1 + CONFIG.salarySpan);
    const r = v => Math.max(100, Math.round(v / 100) * 100);
    return [r(lo), r(hi)];
  }

  // Ce que le manager (`viewer`, son Team avec scoutReports) sait de
  // `player` : tous ses rapports (n'importe quel club, le joueur a pu
  // changer d'équipe), la valeur la plus récente par caractéristique.
  function viewFor(viewer, player, ctx) {
    const season = ctx.season;
    const all = [];
    const reports = (viewer && viewer.scoutReports) || {};
    Object.keys(reports).forEach(k => (reports[k] || []).forEach(r => { if (r && r.p && r.p[player.id]) all.push(r); }));
    all.sort((a, b) => (b.season - a.season) || (b.at - a.at));
    const hist = all.map(r => {
      const e = r.p[player.id];
      const age = Math.max(0, season - r.season);
      const w = age * CONFIG.agingHalfPerSeason;
      const a = {};
      Object.keys(e.a || {}).forEach(k => { a[k] = widen(e.a[k], w); });
      return { season: r.season, at: r.at, level: r.level, club: r.clubName, age, conf: confidence(r.level, age), o: widen(e.o, w), s: e.s ? widen(e.s, age * 0.5, 0.5, 5) : null, a };
    });
    const a = {}, aAge = {};
    hist.slice().reverse().forEach(h => Object.keys(h.a).forEach(k => { a[k] = h.a[k]; aAge[k] = h.age; }));
    const last = hist[0] || null;
    return {
      o: last ? last.o : unscoutedOvr(player.id, ctx.overall, season),
      s: last ? last.s : null,
      a, aAge,
      conf: last ? last.conf : 0,
      level: last ? last.level : null,
      season: last ? last.season : null,
      at: last ? last.at : null,
      hist: hist.map(h => ({ season: h.season, at: h.at, level: h.level, club: h.club, conf: h.conf, o: h.o, s: h.s, a: h.a })),
    };
  }

  const mid = r => Math.round((r[0] + r[1]) / 2);
  const rangeText = r => r ? (r[0] === r[1] ? String(r[0]) : r[0] + " – " + r[1]) : "";

  return { CONFIG, clubKey, starsOf, makeReport, addReport, reportFor, confidence, CONF_LABELS, viewFor, unscoutedOvr, salaryRange, mid, rangeText, levelCfg };
});
