// Tenues du match (2026-10-09, assets/live/kits.js) : maillots aussi
// distincts que possible, par distance perceptuelle des couleurs (ΔE 2000,
// CIELAB), deuxième maillot à domicile prioritaire quand les deux maillots
// extérieurs ressemblent au premier maillot à domicile, couleurs officielles
// jamais modifiées, match lancé même si tout est imparfait.
const assert = require("assert");
const K = require("./assets/live/kits.js");
const ok = m => console.log("✅ " + m);

// 0. ΔE 2000 : valeurs de référence (Sharma, Wu, Dalal 2005).
assert.ok(Math.abs(K.deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]) - 2.0425) < 1e-3);
assert.ok(Math.abs(K.deltaE2000([50, 2.5, 0], [73, 25, -18]) - 27.1492) < 1e-3);
assert.ok(K.colorDistance("#c8102e", "#d6473f") < K.KIT_MIN_DELTA_E, "deux rouges : trop proches");
assert.ok(K.colorDistance("#1f4e9c", "#0b1f4a") < K.KIT_MIN_DELTA_E, "bleu et bleu nuit : trop proches (malgré des codes très différents)");
assert.ok(K.colorDistance("#c8102e", "#1f4e9c") >= K.KIT_MIN_DELTA_E, "rouge et bleu : distincts");
ok(`ΔE 2000 conforme aux valeurs de référence ; seuil centralisé ${K.KIT_MIN_DELTA_E} (rouge/rouge foncé ${K.colorDistance("#c8102e", "#d6473f").toFixed(1)}, bleu/bleu nuit ${K.colorDistance("#1f4e9c", "#0b1f4a").toFixed(1)}, rouge/bleu ${K.colorDistance("#c8102e", "#1f4e9c").toFixed(1)}).`);

// 1. Assez différents : on garde les premiers maillots.
let r = K.pickMatchKits({ primary: "#c8102e", secondary: "#ffffff" }, { primary: "#1f4e9c", secondary: "#f2c94c" });
assert.deepStrictEqual([r.home, r.away, r.ok], ["primary", "primary", true]);
ok(`Maillots assez différents conservés (ΔE ${r.deltaE}).`);

// 2. Trop proches : l'équipe extérieure passe à son deuxième maillot.
r = K.pickMatchKits({ primary: "#c8102e", secondary: "#ffffff" }, { primary: "#d6473f", secondary: "#f2f2f0" });
assert.deepStrictEqual([r.home, r.away, r.ok], ["primary", "secondary", true]);
ok(`Premiers maillots trop proches : deuxième maillot extérieur (ΔE ${r.deltaE}).`);

// 3. Les DEUX maillots extérieurs ressemblent au premier maillot à domicile :
//    le deuxième maillot à domicile s'impose.
r = K.pickMatchKits({ primary: "#1f4e9c", secondary: "#ffffff" }, { primary: "#0b1f4a", secondary: "#2b5fb3" });
assert.strictEqual(r.home, "secondary", JSON.stringify(r));
assert.ok(r.ok && r.rule === "deuxième maillot à domicile", JSON.stringify(r));
ok(`Deux maillots extérieurs trop proches du maillot domicile : deuxième maillot à domicile imposé (${r.colors.join(" contre ")}, ΔE ${r.deltaE}).`);

// 4. Combinaison alternative : seule la paire (2e domicile, 2e extérieur) est lisible.
r = K.pickMatchKits({ primary: "#c8102e", secondary: "#ffffff" }, { primary: "#d6473f", secondary: "#f2f2f0" }, 999);
assert.strictEqual(r.ok, false);
r = K.pickMatchKits({ primary: "#2e7d32", secondary: "#f2c94c" }, { primary: "#1b5e20", secondary: "#f0d060" });
assert.ok(r.ok && r.colors[0] !== r.colors[1], JSON.stringify(r));
ok(`Combinaison alternative trouvée si nécessaire (${r.home}/${r.away} : ${r.colors.join(" contre ")}, règle « ${r.rule} »).`);

// 5. Tout est trop proche : la moins mauvaise, et le match se joue.
r = K.pickMatchKits({ primary: "#c8102e", secondary: "#b00020" }, { primary: "#d6473f", secondary: "#e53935" });
assert.ok(!r.ok && r.colors[0] && r.colors[1] && r.rule === "combinaison la moins mauvaise", JSON.stringify(r));
const all = [["#c8102e", "#d6473f"], ["#c8102e", "#e53935"], ["#b00020", "#d6473f"], ["#b00020", "#e53935"]].map(([a, b]) => K.colorDistance(a, b));
assert.ok(Math.abs(Math.max(...all) - K.colorDistance(r.colors[0], r.colors[1])) < 1e-9, "la moins mauvaise = ΔE le plus grand");
ok(`Toutes les combinaisons imparfaites : la moins mauvaise est retenue (ΔE ${r.deltaE}), le match démarre.`);

// 6. Pas de deuxième maillot, couleurs inconnues : jamais d'erreur.
r = K.pickMatchKits({ primary: "#c8102e" }, { primary: "#d6473f" });
assert.ok(r.colors[0] && r.colors[1]);
r = K.pickMatchKits({ primary: null }, { primary: "#d6473f" });
assert.ok(r && r.rule === "couleur inconnue");
// 7. Couleurs officielles intactes, choix stable.
const home = { primary: "#1f4e9c", secondary: "#ffffff" }, away = { primary: "#0b1f4a", secondary: "#2b5fb3" };
const snap = JSON.stringify([home, away]);
const r1 = K.pickMatchKits(home, away), r2 = K.pickMatchKits(home, away);
assert.strictEqual(JSON.stringify([home, away]), snap, "couleurs des clubs non modifiées");
assert.deepStrictEqual(r1, r2, "choix stable");
ok("Sans deuxième maillot ou couleur inconnue : pas d'erreur ; couleurs officielles intactes, choix stable d'un appel à l'autre.");

// 8. Page publique du match (server/matchLinks.js) : même choix.
const ML = require("./server/matchLinks.js");
if (typeof ML.colorsFor === "function") {
  const c = ML.colorsFor({ jerseyColor: "#1f4e9c", awayJerseyColor: "#ffffff" }, { jerseyColor: "#0b1f4a", awayJerseyColor: "#2b5fb3" });
  assert.deepStrictEqual(c, ["#ffffff", r1.colors[1]]);
  ok("Page publique du match : même tenue que le direct du jeu.");
}
console.log("\n🏁 live_kits_test.js : tenues du match conformes.");
