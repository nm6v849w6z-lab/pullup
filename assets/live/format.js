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
