// Page Marché, bouton « Joueurs » (2026-10-10) : l'icône est un DÉBARDEUR de
// basket sans manches (bretelles + emmanchures), plus le maillot à manches
// courtes d'avant. Vérifie le vrai composant (MK_MODE_ICONS.players, utilisé
// par renderMarketModeToggle) : silhouette fermée dont les épaules ne
// débordent pas des bretelles (pas de manche : aucun point hors du corps au-
// dessus des emmanchures).
const html = require("./test_game_html.js").readGameHtml();
const fail = m => { throw new Error("❌ " + m); };
const m = /const MK_MODE_ICONS = \{[\s\S]*?players: '([^']+)'/.exec(html);
if (!m) fail("MK_MODE_ICONS.players introuvable");
const svg = m[1];
if (/M8 3h2a2 2 0 0 0 4 0h2l3 3-2 3-1-1v13H8V8L7 9 5 6z/.test(svg)) fail("ancien maillot à manches courtes encore présent");
const d = (/class="mk-tank" d="([^"]+)"/.exec(svg) || [])[1];
if (!d) fail("silhouette du débardeur (path.mk-tank) absente");
// Points de la silhouette (absolus + relatifs simples) : on suit le tracé.
const nums = d.match(/[a-zA-Z]|-?\d*\.?\d+/g);
let x = 0, y = 0, cmd = "", pts = [];
for (let i = 0; i < nums.length;) {
  if (/[a-zA-Z]/.test(nums[i])) { cmd = nums[i++]; if (cmd === "z" || cmd === "Z") continue; }
  const n = k => +nums[i + k];
  if (cmd === "M" || cmd === "L") { x = n(0); y = n(1); i += 2; }
  else if (cmd === "C") { x = n(4); y = n(5); i += 6; }
  else if (cmd === "c") { x += n(4); y += n(5); i += 6; }
  else if (cmd === "S") { x = n(2); y = n(3); i += 4; }
  else if (cmd === "l") { x += n(0); y += n(1); i += 2; }
  else if (cmd === "h") { x += n(0); i += 1; }
  else if (cmd === "H") { x = n(0); i += 1; }
  else if (cmd === "v") { y += n(0); i += 1; }
  else if (cmd === "V") { y = n(0); i += 1; }
  else if (cmd === "s") { x += n(2); y += n(3); i += 4; }
  else fail("commande SVG inattendue " + cmd);
  pts.push([x, y]);
}
const top = pts.filter(([, py]) => py <= 4);
const straps = [Math.min(...top.map(p => p[0])), Math.max(...top.map(p => p[0]))];
// Manches : un point au-dessus de y = 9 plus large que les bretelles (épaule qui s'étend).
const sleeve = pts.filter(([px, py]) => py < 9 && (px < straps[0] - 0.01 || px > straps[1] + 0.01));
if (sleeve.length) fail(`manches détectées (${JSON.stringify(sleeve)})`);
const bodyW = Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0]));
if (!(bodyW >= 12 && straps[1] - straps[0] <= 9)) fail(`proportions d'un débardeur attendues (corps ${bodyW}, bretelles ${straps})`);
if (!/renderMarketModeToggle[\s\S]{0,600}MK_MODE_ICONS\[k\]/.test(html)) fail("le bouton du marché doit utiliser MK_MODE_ICONS");
console.log(`✅ Bouton « Joueurs » du Marché : débardeur sans manches (bretelles x ${straps.join("–")}, corps ${bodyW} de large, emmanchures sous les bretelles).`);
console.log("\n🏁 market_tank_icon_test.js");
