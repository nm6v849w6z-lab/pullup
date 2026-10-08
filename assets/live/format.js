// Helpers de formatage partagés par la vue live (et utilisables côté moteur).

/** 125 -> "02:05" */
export const fmtClock = s => {
  s = Math.max(0, Math.round(s));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
};

/** 1 -> "1er quart-temps", 3 -> "3e quart-temps" */
export const quarterName = q => (q === 1 ? "1er" : q + "e") + " quart-temps";

/** Pourcentage arrondi, "–" si aucune tentative. */
export const pct = (m, a) => (a ? Math.round((100 * m) / a) + " %" : "–");

/**
 * Élision du "de" devant un nom : de("Adama Diallo") -> "d'Adama Diallo".
 * À utiliser aussi dans le moteur qui génère les textes d'actions
 * ("Tir manqué de Adama Diallo" -> "Tir manqué d'Adama Diallo").
 */
export const de = name => (/^[aeiouyàâäéèêëîïôöùûüh]/i.test(name) ? "d'" : "de ") + name;

/** Évaluation : pts + reb + pd + int + ctr − tirs ratés − LF ratés − pertes. */
export const rating = p =>
  p.pts + p.reb + p.ast + p.stl + p.blk
  - (p.fg2a + p.fg3a - p.fg2m - p.fg3m)
  - (p.fta - p.ftm)
  - p.tov;

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Encre de la publicité peinte sur le parquet (2026-10-08 : « la pub manque
// de visibilité quand le parquet est foncé ») : peinture sombre sur un bois
// clair, claire sur un parquet foncé — celle qui contraste le plus une fois
// posée —, avec juste l'opacité qu'il faut pour une lisibilité constante
// (contraste ≥ 1,85, comme une vraie peinture de sol : jamais criarde).
// Même règle dans le direct 2D, la carte des tirs et l'aperçu du parquet
// (miroir moteurbasket3.html:floorAdInk).
export function floorAdInk(floor) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(floor || "").trim());
  const bg = m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [207, 154, 85];
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (ink, a) => ink.map((c, i) => c * a + bg[i] * (1 - a));
  const DARK = [60, 30, 5], LIGHT = [255, 246, 232];
  const ink = ratio(over(DARK, 0.4), bg) >= ratio(over(LIGHT, 0.4), bg) ? DARK : LIGHT;
  let a = 0.28;
  while (a < 0.6 && ratio(over(ink, a), bg) < 1.85) a += 0.02;
  return `rgba(${ink.join(",")},${a.toFixed(2)})`;
}
