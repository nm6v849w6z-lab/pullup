// Personnages de la mise en scène du direct 2D (2026-10-08) : pompom girl,
// mascotte (kraken, ours, aigle, dragon, loup, taureau), lanceur de
// t-shirts, t-shirt. Style des maquettes de référence (contours cartoon
// sombres, aplats), couleurs du club en paramètres, JAMAIS en dur.
//
// Chaque fonction rend un fragment SVG centré sur (0, 0) = les pieds,
// orienté vers le haut (y négatif), dans le repère du terrain (1 pied =
// 10 unités) : ~42 unités de haut en version « parquet » (la taille d'un
// jeton joueur). `detail: true` = version détaillée (gros plan, écran
// Personnalisation) : mêmes formes, reflets et détails en plus.
//
// Les parties animées portent une classe (stg-arm-l, stg-pom, stg-body…)
// que live.css anime en boucle (transform / opacity seulement) ; rien n'est
// recréé à chaque image.

const INK = "#1d1530";

function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = v => Math.max(0, Math.min(255, v + amt));
  return "#" + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map(v => v.toString(16).padStart(2, "0")).join("");
}
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Pompons (étoiles à rayons) : couleur secondaire du club.
function pompom(cx, cy, color, cls, detail) {
  let rays = "";
  const n = detail ? 14 : 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    rays += `M${cx} ${cy} L${(cx + Math.cos(a) * 6.5).toFixed(1)} ${(cy + Math.sin(a) * 6.5).toFixed(1)} `;
  }
  return `<g class="stg-pom ${cls}"><circle cx="${cx}" cy="${cy}" r="5" fill="${color}"/><path d="${rays}" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>` +
    (detail ? `<circle cx="${cx - 1.4}" cy="${cy - 1.6}" r="1.8" fill="#fff" opacity=".55"/>` : "") + `</g>`;
}

// Pompom girl : couettes à nœud, crop top au sigle, jupe plissée, baskets.
export function pompomGirl({ primary = "#d6473f", secondary = "#ffd34d", skin = "#f0cbae", hair = "#5a3a22", short = "", detail = false } = {}) {
  const top = shade(primary, -25);
  return `<g class="stg-ch stg-pp">` +
    `<ellipse cx="0" cy="1" rx="11" ry="3.2" fill="rgba(0,0,0,.28)"/>` +
    // jambes et baskets
    `<path d="M-4 -12 L-4.2 -2 M4 -12 L4.2 -2" stroke="${skin}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M-7.6 -1.6 h7 v2.2 h-7z M0.6 -1.6 h7 v2.2 h-7z" fill="#fff" stroke="${INK}" stroke-width="1"/>` +
    (detail ? `<path d="M-6.5 -0.6 h5 M1.6 -0.6 h5" stroke="${primary}" stroke-width=".8"/>` : "") +
    // jupe
    `<path d="M-9 -12 L9 -12 L11 -5 L-11 -5Z" fill="${primary}" stroke="${INK}" stroke-width="1.1"/>` +
    `<path d="M-6 -12 L-7 -5 M-2 -12 L-2.3 -5 M2 -12 L2.3 -5 M6 -12 L7 -5" stroke="${top}" stroke-width=".8"/>` +
    `<path d="M-10.5 -6.8 H10.5" stroke="#fff" stroke-width="1.1"/>` +
    // buste
    `<path d="M-6.5 -24 Q0 -26 6.5 -24 L6 -13 L-6 -13Z" fill="${primary}" stroke="${INK}" stroke-width="1.1"/>` +
    `<path d="M-3 -24 L0 -20.5 L3 -24" stroke="#fff" stroke-width="1.2" fill="none"/>` +
    (short ? `<text x="0" y="-15.2" text-anchor="middle" font-size="4.2" font-weight="900" fill="#fff" font-family="system-ui,sans-serif">${esc(String(short).slice(0, 3))}</text>` : "") +
    // bras levés + pompons (animés)
    `<g class="stg-arm-l"><path d="M-6 -23 L-11 -33" stroke="${skin}" stroke-width="3" stroke-linecap="round"/>${pompom(-12, -35, secondary, "l", detail)}</g>` +
    `<g class="stg-arm-r"><path d="M6 -23 L11 -33" stroke="${skin}" stroke-width="3" stroke-linecap="round"/>${pompom(12, -35, secondary, "r", detail)}</g>` +
    // tête et couettes à nœud
    `<path d="M-8.5 -31 Q-12 -27 -10 -22 M8.5 -31 Q12 -27 10 -22" stroke="${hair}" stroke-width="3.4" stroke-linecap="round" fill="none"/>` +
    `<circle cx="0" cy="-30.5" r="6.4" fill="${skin}" stroke="${INK}" stroke-width="1.1"/>` +
    `<path d="M-6.4 -31.5 Q-6 -38.5 0 -38 Q6 -38.5 6.4 -31.5 Q3 -35 0 -34.6 Q-3 -35 -6.4 -31.5Z" fill="${hair}"/>` +
    `<path d="M-9.2 -34 l-2.4 -1.6 l.4 3Z M9.2 -34 l2.4 -1.6 l-.4 3Z" fill="${primary}"/>` +
    `<circle cx="-2.3" cy="-30.4" r=".9" fill="${INK}"/><circle cx="2.3" cy="-30.4" r=".9" fill="${INK}"/>` +
    `<path d="M-1.8 -27.6 Q0 -26.2 1.8 -27.6" stroke="${INK}" stroke-width=".8" fill="none"/>` +
    (detail ? `<circle cx="-4" cy="-28.4" r="1" fill="#f59a9a" opacity=".6"/><circle cx="4" cy="-28.4" r="1" fill="#f59a9a" opacity=".6"/>` : "") +
    `</g>`;
}

// Têtes de mascotte par espèce (au-dessus du maillot). `p` = couleur principale.
const SPECIES = {
  kraken: (p, d) => `<path d="M-13 -22 Q-14 -44 0 -45 Q14 -44 13 -22Z" fill="${p}" stroke="${INK}" stroke-width="1.4"/>` +
    (d ? `<circle cx="7" cy="-38" r="2.2" fill="${shade(p, -30)}"/><circle cx="-6" cy="-41" r="1.4" fill="${shade(p, -30)}"/><path d="M-9 -40 Q-6 -43 -2 -43.5" stroke="#fff" stroke-width="1.6" opacity=".45" fill="none"/>` : ""),
  ours: (p, d) => `<circle cx="-9" cy="-41" r="4.2" fill="${p}" stroke="${INK}" stroke-width="1.3"/><circle cx="9" cy="-41" r="4.2" fill="${p}" stroke="${INK}" stroke-width="1.3"/>` +
    `<circle cx="0" cy="-32" r="12" fill="${p}" stroke="${INK}" stroke-width="1.4"/><ellipse cx="0" cy="-27.5" rx="5" ry="3.6" fill="${shade(p, 55)}"/><ellipse cx="0" cy="-29" rx="1.8" ry="1.2" fill="${INK}"/>` +
    (d ? `<circle cx="-9" cy="-41" r="2" fill="${shade(p, 40)}"/><circle cx="9" cy="-41" r="2" fill="${shade(p, 40)}"/>` : ""),
  aigle: (p, d) => `<path d="M-11 -24 Q-13 -44 0 -45 Q13 -44 11 -24Z" fill="#fff" stroke="${INK}" stroke-width="1.4"/>` +
    `<path d="M-2 -31 L6 -29 L-1 -25Z" fill="#f5b41e" stroke="${INK}" stroke-width="1"/>` +
    `<path d="M-11 -30 Q-16 -26 -12 -21 M11 -30 Q16 -26 12 -21" stroke="${p}" stroke-width="3" fill="none"/>` +
    (d ? `<path d="M-6 -43 Q0 -48 6 -43" stroke="${p}" stroke-width="2" fill="none"/>` : ""),
  dragon: (p, d) => `<path d="M-9 -40 L-12 -49 L-5 -42Z M9 -40 L12 -49 L5 -42Z" fill="${shade(p, 40)}" stroke="${INK}" stroke-width="1"/>` +
    `<path d="M-12 -23 Q-14 -43 0 -44 Q14 -43 12 -23Z" fill="${p}" stroke="${INK}" stroke-width="1.4"/><path d="M-6 -26 Q0 -23 6 -26" stroke="${INK}" stroke-width="1" fill="none"/>` +
    `<circle cx="-3" cy="-28" r=".9" fill="${INK}"/><circle cx="3" cy="-28" r=".9" fill="${INK}"/>` +
    (d ? `<path d="M-2 -45 L0 -49 L2 -45 M-6 -44 L-4 -47 L-2 -44" fill="${shade(p, -30)}"/>` : ""),
  loup: (p, d) => `<path d="M-11 -36 L-9 -49 L-3 -40Z M11 -36 L9 -49 L3 -40Z" fill="${p}" stroke="${INK}" stroke-width="1.2"/>` +
    `<path d="M-12 -23 Q-13 -42 0 -43 Q13 -42 12 -23 Q0 -18 -12 -23Z" fill="${p}" stroke="${INK}" stroke-width="1.4"/><path d="M-5 -27 Q0 -21 5 -27 Q0 -30 -5 -27Z" fill="${shade(p, 60)}"/><ellipse cx="0" cy="-27.6" rx="1.6" ry="1.1" fill="${INK}"/>` +
    (d ? `<path d="M-9 -45 L-8 -42 M9 -45 L8 -42" stroke="${shade(p, 50)}" stroke-width="1.2"/>` : ""),
  taureau: (p, d) => `<path d="M-11 -38 Q-20 -40 -18 -48 Q-15 -42 -9 -42Z M11 -38 Q20 -40 18 -48 Q15 -42 9 -42Z" fill="#f2ead8" stroke="${INK}" stroke-width="1.1"/>` +
    `<path d="M-12 -23 Q-13 -43 0 -44 Q13 -43 12 -23Z" fill="${p}" stroke="${INK}" stroke-width="1.4"/><ellipse cx="0" cy="-25" rx="7" ry="4.2" fill="${shade(p, 50)}" stroke="${INK}" stroke-width=".8"/>` +
    `<circle cx="-2.4" cy="-25" r=".9" fill="${INK}"/><circle cx="2.4" cy="-25" r=".9" fill="${INK}"/>` +
    (d ? `<circle cx="0" cy="-21.4" r="1.6" fill="none" stroke="#d9c27a" stroke-width="1"/>` : ""),
};
const DEFAULT_SPECIES_COLOR = { kraken: "#7b4fd6", ours: "#8a5a32", aigle: "#2b2b33", dragon: "#2f9e57", loup: "#8a93a3", taureau: "#7a3b25" };

// Accessoires de la mascotte, posés sur la tête.
function mascotAccessory(kind, secondary) {
  if (kind === "bandeau") return `<path d="M-13 -36 Q0 -40 13 -36 L13 -32.5 Q0 -36.5 -13 -32.5Z" fill="${secondary}" stroke="${INK}" stroke-width="1"/><path d="M-10 -35 h3 M-3 -36 h3 M4 -35.6 h3" stroke="#e14b4b" stroke-width="1.2"/>`;
  if (kind === "lunettes") return `<rect x="-9.5" y="-33.5" width="8" height="5.5" rx="2" fill="#111" stroke="${INK}"/><rect x="1.5" y="-33.5" width="8" height="5.5" rx="2" fill="#111" stroke="${INK}"/><path d="M-1.5 -31.5 h3" stroke="#111" stroke-width="1.2"/>`;
  if (kind === "casquette") return `<path d="M-12 -38 Q-11 -48 0 -48 Q11 -48 12 -38Z" fill="${secondary}" stroke="${INK}" stroke-width="1.1"/><path d="M0 -38.5 Q12 -39.5 18 -36.6 Q12 -35 0 -36.4Z" fill="${shade(secondary, -30)}" stroke="${INK}" stroke-width="1"/>`;
  if (kind === "couronne") return `<path d="M-9 -42 L-9 -50 L-4.5 -46 L0 -51 L4.5 -46 L9 -50 L9 -42Z" fill="#f5c542" stroke="${INK}" stroke-width="1.1"/><circle cx="0" cy="-45" r="1.3" fill="#e14b4b"/>`;
  return "";
}

// Mascotte : tête d'espèce, maillot numéroté aux couleurs du club, jambes
// et baskets. cfg = { species, primary, secondary, number, accessory }.
export function mascot(cfg = {}, { detail = false } = {}) {
  const sp = SPECIES[cfg.species] ? cfg.species : "kraken";
  const body = cfg.bodyColor || DEFAULT_SPECIES_COLOR[sp];
  const jersey = cfg.primary || "#1d9a6c", trim = cfg.secondary || "#ffd34d";
  const num = Number.isInteger(cfg.number) ? cfg.number : 8;
  const eyes = sp === "aigle" || sp === "loup" || sp === "ours" || sp === "kraken"
    ? `<circle cx="-4.6" cy="-33" r="3.6" fill="#fff" stroke="${INK}" stroke-width="1"/><circle cx="4.6" cy="-33" r="3.6" fill="#fff" stroke="${INK}" stroke-width="1"/><circle cx="-4" cy="-32.6" r="1.8" fill="${INK}"/><circle cx="5.2" cy="-32.6" r="1.8" fill="${INK}"/>` : "";
  const legs = sp === "kraken"
    ? `<g class="stg-legs"><path d="M-9 -16 Q-15 -8 -17 -2 M-4 -14 Q-6 -6 -6 -1 M4 -14 Q6 -6 6 -1 M9 -16 Q15 -8 17 -2" stroke="${body}" stroke-width="3.6" stroke-linecap="round" fill="none"/>` +
      (detail ? `<circle cx="-15" cy="-5" r="1.2" fill="#fff"/><circle cx="15" cy="-5" r="1.2" fill="#fff"/><circle cx="-12.6" cy="-9" r="1" fill="#fff"/><circle cx="12.6" cy="-9" r="1" fill="#fff"/>` : "") + `</g>`
    : `<g class="stg-legs"><path d="M-4 -14 L-4.5 -2 M4 -14 L4.5 -2" stroke="${body}" stroke-width="4" stroke-linecap="round"/></g>`;
  return `<g class="stg-ch stg-mascot">` +
    `<ellipse cx="0" cy="1" rx="14" ry="3.6" fill="rgba(0,0,0,.28)"/>` + legs +
    `<path d="M-8.8 -2.2 h8 v2.6 h-8z M0.8 -2.2 h8 v2.6 h-8z" fill="#fff" stroke="${INK}" stroke-width="1"/>` +
    (detail ? `<path d="M-7.6 -0.8 h6 M2 -0.8 h6" stroke="${jersey}" stroke-width="1"/>` : "") +
    `<g class="stg-body"><path d="M-12 -24 L12 -24 L11 -13 Q0 -10 -11 -13Z" fill="${jersey}" stroke="${INK}" stroke-width="1.3"/>` +
    `<path d="M-12 -24 L12 -24" stroke="${trim}" stroke-width="2"/><path d="M-4 -24 L0 -20.8 L4 -24" stroke="#fff" stroke-width="1.2" fill="none"/>` +
    `<text x="0" y="-14.2" text-anchor="middle" font-size="7.6" font-weight="900" fill="#fff" font-family="system-ui,sans-serif">${num}</text>` +
    `<g class="stg-arm-l"><path d="M-12 -22 Q-17 -18 -18 -12" stroke="${body}" stroke-width="3.4" stroke-linecap="round" fill="none"/></g>` +
    `<g class="stg-arm-r"><path d="M12 -22 Q17 -26 18 -32" stroke="${body}" stroke-width="3.4" stroke-linecap="round" fill="none"/></g>` +
    SPECIES[sp](body, detail) + eyes + mascotAccessory(cfg.accessory, trim) + `</g></g>`;
}

// Mascotte par défaut d'un club : espèce tirée de son sigle (KRA → kraken,
// OUR/BEA → ours, AIG/EAG → aigle, DRA → dragon, LOU/WOL → loup,
// TAU/BUL → taureau), sinon d'un hachage stable du sigle ; couleurs du club.
export function defaultMascot(short, colors) {
  const s = String(short || "").toUpperCase();
  const map = [["KRA", "kraken"], ["OUR", "ours"], ["BEA", "ours"], ["AIG", "aigle"], ["EAG", "aigle"], ["DRA", "dragon"], ["LOU", "loup"], ["WOL", "loup"], ["TAU", "taureau"], ["BUL", "taureau"]];
  let species = (map.find(([k]) => s.startsWith(k)) || [])[1];
  if (!species) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; species = Object.keys(SPECIES)[h % Object.keys(SPECIES).length]; }
  const [p, q] = colors || ["#1d9a6c", "#ffd34d"];
  return { species, primary: p, secondary: q, number: 8, accessory: "bandeau", celebration: "salto", name: "" };
}
export const MASCOT_SPECIES = Object.keys(SPECIES);

// Lanceur de t-shirts : casquette, micro-casque, canon à manomètre.
export function launcher({ primary = "#d6473f", secondary = "#1d9a6c", skin = "#d9a47c", detail = false } = {}) {
  return `<g class="stg-ch stg-launcher">` +
    `<ellipse cx="0" cy="1" rx="12" ry="3.4" fill="rgba(0,0,0,.28)"/>` +
    `<path d="M-4 -13 L-4.4 -2 M4 -13 L4.4 -2" stroke="#5c5c5c" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M-8.8 -2 h8 v2.6 h-8z M0.8 -2 h8 v2.6 h-8z" fill="${secondary}" stroke="${INK}" stroke-width="1"/>` +
    `<path d="M-8 -26 Q0 -28 8 -26 L7.4 -13 L-7.4 -13Z" fill="${primary}" stroke="${INK}" stroke-width="1.2"/>` +
    `<path d="M-5 -26 L-5 -13 M5 -26 L5 -13" stroke="#fff" stroke-width="1.2"/>` +
    // canon (pivote pour viser)
    `<g class="stg-cannon"><rect x="-3" y="-38" width="7" height="22" rx="2.4" fill="#4a4a4a" stroke="${INK}" stroke-width="1.1" transform="rotate(18 0 -22)"/>` +
    `<circle cx="1" cy="-19" r="3" fill="#f5c542" stroke="${INK}" stroke-width=".9"/>` +
    (detail ? `<path d="M1 -19 l1.4 -1.6" stroke="${INK}" stroke-width=".7"/>` : "") + `</g>` +
    `<circle cx="0" cy="-31.5" r="6" fill="${skin}" stroke="${INK}" stroke-width="1.1"/>` +
    `<path d="M-6.4 -33 Q-6 -39.5 0 -39.5 Q6 -39.5 6.4 -33Z" fill="${secondary}" stroke="${INK}" stroke-width="1"/><path d="M0 -33.5 Q8 -34.5 11 -32.5 Q7 -31.4 0 -32Z" fill="${shade(secondary, -30)}"/>` +
    `<path d="M-6 -31 Q-8.6 -27 -4 -26.5" stroke="#222" stroke-width="1" fill="none"/>` +
    `<path d="M-3.6 -28 Q0 -25.4 3.6 -28 Q3 -26 0 -25.6 Q-3 -26 -3.6 -28Z" fill="#6b3e26"/>` +
    `<circle cx="-2.2" cy="-31.6" r=".9" fill="${INK}"/><circle cx="2.2" cy="-31.6" r=".9" fill="${INK}"/>` +
    `</g>`;
}

// T-shirt en vol (tourne) aux couleurs du club.
export function tshirt({ primary = "#d6473f", secondary = "#fff" } = {}) {
  return `<g class="stg-tshirt"><path d="M-6 -4 L-3 -6 Q0 -4.6 3 -6 L6 -4 L4.4 -1.6 L3.4 -2.4 L3.4 5 L-3.4 5 L-3.4 -2.4 L-4.4 -1.6Z" fill="${primary}" stroke="${INK}" stroke-width=".9"/>` +
    `<path d="M-3.4 0 H3.4" stroke="${secondary}" stroke-width="1"/></g>`;
}

// Trampoline et panier « show » (le dunk de la mascotte).
export function trampoline() {
  return `<g class="stg-tramp"><ellipse cx="0" cy="3" rx="13" ry="3.4" fill="rgba(0,0,0,.25)"/>` +
    `<path d="M-11 0 L-13 6 M11 0 L13 6" stroke="#2b2b2b" stroke-width="2"/>` +
    `<ellipse cx="0" cy="0" rx="12" ry="4" fill="#2b2b2b"/><ellipse cx="0" cy="-0.6" rx="10" ry="3" fill="#3b8fe0"/></g>`;
}

// Fumée du canon (bouffée qui grossit et s'efface — animée en CSS).
export function smoke() {
  return `<g class="stg-smoke"><circle cx="0" cy="0" r="4" fill="#d8d2c8" opacity=".85"/><circle cx="4" cy="-3" r="3" fill="#e6e1d8" opacity=".8"/><circle cx="-3.6" cy="-2.6" r="2.6" fill="#e6e1d8" opacity=".75"/></g>`;
}
