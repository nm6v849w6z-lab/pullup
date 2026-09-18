// Vérifie l'intégration du logo "Pull Up" fourni par l'utilisateur (2026-09,
// image jointe au fond blanc) en remplacement de l'ancien repère 🏀 + texte
// "Pull Up" dans .sidebar-brand (voir la CSS .brand-logo-img/.brand-mark/
// .brand-name juste au-dessus de .sidebar-brand dans moteurbasket3.html) :
// - en sidebar déployée (comportement par défaut), c'est bien le logo (image
//   PNG en data URI, fond rendu transparent et rogné au plus près du
//   contenu) qui doit être visible, pas l'ancien repère emoji/texte ;
// - le rail réduit (sous 900px, voir la media query dédiée) doit garder son
//   repli sur l'emoji 🏀 : le logo complet, une fois écrasé dans ~48px de
//   large, deviendrait illisible.
// JSDOM ne calcule pas de vraie mise en page (voir le même repère déjà
// rencontré dans team_detail_page_test.js/salle_arena_purchases_height_test.js)
// donc ce test vérifie le MARQUAGE (présence de l'image, forme de sa
// source, classes CSS en jeu) plutôt qu'un display:none réellement résolu,
// qui a lui été vérifié visuellement via une vraie capture Playwright au
// moment de l'intégration.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;

const brand = doc.querySelector(".sidebar-brand");
if (!brand) throw new Error("❌ (setup) .sidebar-brand introuvable dans le DOM.");

const img = brand.querySelector(".brand-logo-img");
if (!img) throw new Error("❌ .sidebar-brand devrait contenir une image .brand-logo-img (le logo fourni par l'utilisateur).");
const src = img.getAttribute("src") || "";
if (!src.startsWith("data:image/png;base64,")) {
  throw new Error(`❌ Le logo devrait être intégré en data URI PNG (fichier HTML unique, pas d'asset externe), src actuel : "${src.slice(0, 40)}..."`);
}
if (src.length < 10000) {
  throw new Error(`❌ La donnée du logo semble anormalement courte (${src.length} caractères), probablement tronquée ou vide.`);
}
console.log(`✅ .brand-logo-img est bien présent, avec une image PNG intégrée en data URI (${Math.round(src.length / 1024)} Ko encodés).`);

const mark = brand.querySelector(".brand-mark");
const name = brand.querySelector(".brand-name");
if (!mark || mark.textContent.trim() !== "🏀") {
  throw new Error("❌ L'ancien repère .brand-mark (🏀) devrait rester dans le DOM, en repli pour le rail réduit sous 900px.");
}
if (!name || name.textContent.trim() !== "Pull Up") {
  throw new Error("❌ L'ancien texte .brand-name (\"Pull Up\") devrait rester dans le DOM (masqué par CSS en sidebar déployée, voir le commentaire dédié).");
}
console.log("✅ L'ancien repère emoji + texte reste bien présent dans le DOM (repli CSS pour le rail réduit).");

// La CSS elle-même : le logo image doit être caché sous 900px (repli emoji),
// et l'emoji/texte doivent être cachés par défaut (sidebar déployée), voir
// les règles .sidebar-brand .brand-mark/.brand-name/.brand-logo-img et la
// media query @media(max-width:900px).
const styleBlock = [...doc.querySelectorAll("style")].map(s => s.textContent).join("\n");
if (!/\.sidebar-brand \.brand-mark\{[^}]*display:none;\}/.test(styleBlock)) {
  throw new Error("❌ .sidebar-brand .brand-mark devrait être display:none par défaut (repli emoji réservé au rail réduit).");
}
if (!/\.sidebar-brand \.brand-name\{[^}]*display:none;\}/.test(styleBlock)) {
  throw new Error("❌ .sidebar-brand .brand-name devrait être display:none par défaut (le logo image porte déjà le texte \"Pull Up\").");
}
// Repère le bon bloc @media(max-width:900px) (il y en a plusieurs dans la
// feuille de style, pour d'autres composants) via la règle qui réduit la
// sidebar elle-même, unique à ce bloc-là, plutôt qu'un appariement fragile
// des accolades sur tout le bloc (qui contient lui-même beaucoup de règles).
const sidebarNarrowMarker = ".sidebar{width:60px; flex-basis:60px";
const markerIdx = styleBlock.indexOf(sidebarNarrowMarker);
if (markerIdx === -1) throw new Error("❌ (setup) Règle de réduction de la sidebar sous 900px introuvable.");
const narrowBlock = styleBlock.slice(markerIdx, markerIdx + 800);
if (!/\.sidebar-brand \.brand-logo-img\{[^}]*display:none;\}/.test(narrowBlock)) {
  throw new Error("❌ Sous 900px, .brand-logo-img devrait repasser à display:none (logo complet illisible une fois écrasé dans le rail réduit).");
}
if (!/\.sidebar-brand \.brand-mark\{[^}]*display:inline;\}/.test(narrowBlock)) {
  throw new Error("❌ Sous 900px, .brand-mark (🏀) devrait redevenir visible (display:inline) en repli.");
}
console.log("✅ La CSS bascule bien entre le logo complet (sidebar déployée) et l'emoji seul (rail réduit sous 900px).");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests sidebar_logo_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
