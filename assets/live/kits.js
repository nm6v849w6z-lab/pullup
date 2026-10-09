// =====================================================================
// Tenues du match (2026-10-09, « éviter que les deux équipes portent des
// maillots de couleurs trop proches ») : choix des maillots portés pendant
// un direct, par distance PERCEPTUELLE des couleurs (ΔE 2000 dans l'espace
// CIELAB, pas une comparaison de codes hexadécimaux).
//
// Règles (dans l'ordre) :
//   1. premiers maillots des deux équipes assez différents → on les garde ;
//   2. sinon, l'équipe extérieure passe à son deuxième maillot s'il est assez
//      différent du premier maillot à domicile ;
//   3. si LES DEUX maillots extérieurs sont trop proches du premier maillot à
//      domicile → l'équipe à domicile porte son DEUXIÈME maillot (règle
//      prioritaire), avec le maillot extérieur le plus lisible contre lui ;
//   4. sinon la meilleure combinaison disponible (ΔE le plus grand) ;
//   5. tout est trop proche → la combinaison la moins mauvaise, le match
//      se joue normalement.
// Les couleurs officielles des clubs ne sont JAMAIS modifiées : seule la
// tenue du match est choisie, une fois, avant le coup d'envoi (fonction
// pure : mêmes couleurs → même choix). Seuil centralisé : KIT_MIN_DELTA_E.
// Couleur comparée : la couleur dominante du maillot (couleur principale,
// celle des jetons du terrain et des grandes zones du maillot).
//
// Script classique (window.HMKits dans le jeu) et module CommonJS
// (serveur, tests).
// =====================================================================
(function (root) {
  "use strict";
  // ΔE 2000 en dessous duquel deux maillots sont jugés trop proches sur le
  // terrain (≈ 10 : même famille de teinte ; ≥ 25 : nettement distincts).
  const KIT_MIN_DELTA_E = 22;

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // sRGB → CIELAB (illuminant D65).
  function rgbToLab(rgb) {
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const [r, g, b] = rgb.map(lin);
    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  // CIEDE2000.
  function deltaE2000(lab1, lab2) {
    const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
    const rad = Math.PI / 180, deg = 180 / Math.PI;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h = (b, a) => { if (a === 0 && b === 0) return 0; const t = Math.atan2(b, a) * deg; return t < 0 ? t + 360 : t; };
    const h1p = h(b1, a1p), h2p = h(b2, a2p);
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2 * rad);
    const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp = h1p + h2p;
    if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360; hbp /= 2; }
    const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
    const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const RC = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    const SL = 1 + 0.015 * Math.pow(Lbp - 50, 2) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
    const RT = -Math.sin(2 * dTheta * rad) * RC;
    return Math.sqrt(Math.pow(dLp / SL, 2) + Math.pow(dCp / SC, 2) + Math.pow(dHp / SH, 2) + RT * (dCp / SC) * (dHp / SH));
  }
  function colorDistance(hexA, hexB) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    if (!a || !b) return Infinity;   // couleur inconnue : rien à comparer
    return deltaE2000(rgbToLab(a), rgbToLab(b));
  }
  // home / away : { primary: "#rrggbb", secondary: "#rrggbb" | null }.
  // Renvoie { home: "primary"|"secondary", away: …, colors: [h, a], deltaE,
  // ok (ΔE ≥ seuil), rule } — `rule` dit quelle règle a tranché.
  function pickMatchKits(home, away, threshold = KIT_MIN_DELTA_E) {
    const kit = (t, k) => (t && t[k] && hexToRgb(t[k]) ? String(t[k]).toLowerCase() : null);
    const hp = kit(home, "primary"), hs = kit(home, "secondary"), ap = kit(away, "primary"), as = kit(away, "secondary");
    const res = (h, a, rule) => {
      const ch = h === "secondary" ? hs : hp, ca = a === "secondary" ? as : ap;
      const d = colorDistance(ch, ca);
      return { home: h, away: a, colors: [ch, ca], deltaE: Number.isFinite(d) ? Math.round(d * 10) / 10 : null, ok: d >= threshold, rule };
    };
    if (!hp || !ap) return res("primary", "primary", "couleur inconnue");
    const d = (x, y) => (x && y ? colorDistance(x, y) : -1);
    if (d(hp, ap) >= threshold) return res("primary", "primary", "premiers maillots");
    if (as && d(hp, as) >= threshold) return res("primary", "secondary", "deuxième maillot extérieur");
    // Les deux maillots extérieurs sont trop proches du premier maillot à
    // domicile : le deuxième maillot à domicile s'impose (règle prioritaire).
    if (hs) {
      const options = [["primary", d(hs, ap)], ["secondary", as ? d(hs, as) : -1]].filter(o => o[1] >= 0).sort((x, y) => y[1] - x[1]);
      if (options.length && options[0][1] >= threshold) return res("secondary", options[0][0], "deuxième maillot à domicile");
    }
    // Meilleure combinaison possible, sinon la moins mauvaise.
    const all = [["primary", "primary", d(hp, ap)], ["primary", "secondary", d(hp, as)], ["secondary", "primary", d(hs, ap)], ["secondary", "secondary", d(hs, as)]]
      .filter(c => c[2] >= 0).sort((x, y) => y[2] - x[2]);
    const best = all[0];
    return res(best[0], best[1], best[2] >= threshold ? "meilleure combinaison" : "combinaison la moins mauvaise");
  }
  const api = { KIT_MIN_DELTA_E, hexToRgb, rgbToLab, deltaE2000, colorDistance, pickMatchKits };
  root.HMKits = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
