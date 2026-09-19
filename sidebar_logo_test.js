// Vérifie l'intégration du logo "Pull Up" fourni par l'utilisateur (2026-09,
// image jointe au fond blanc) en remplacement de l'ancien repère 🏀 + texte
// "Pull Up" dans .sidebar-brand (voir la CSS .brand-logo-img/.brand-mark/
// .brand-name juste au-dessus de .sidebar-brand dans moteurbasket3.html) :
// - en sidebar déployée (comportement par défaut), c'est bien le logo (image
//   PNG en data URI, fond rendu transparent et rogné au plus près du
//   contenu) qui doit être visible, pas l'ancien repère emoji/texte ;
// - retour utilisateur (2026-09) : "enlève les emoji sur le menu de gauche
//   aussi" a retiré les emojis .sidebar-icon des boutons de navigation, ce
//   qui a aussi supprimé le rail réduit à 60px sous 900px (il ne montrait
//   QUE ces emojis, devenus vides sans eux) : la sidebar garde désormais sa
//   largeur et son logo complet à toutes les tailles d'écran, plus de repli
//   sur l'emoji 🏀 nulle part.
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
  throw new Error("❌ L'ancien repère .brand-mark (🏀) devrait rester dans le DOM (repli CSS historique, même s'il n'est plus jamais affiché, voir le commentaire dédié).");
}
if (!name || name.textContent.trim() !== "Pull Up") {
  throw new Error("❌ L'ancien texte .brand-name (\"Pull Up\") devrait rester dans le DOM (masqué par CSS, le logo image porte déjà le texte).");
}
console.log("✅ L'ancien repère emoji + texte reste bien présent dans le DOM (inerte, plus jamais affiché).");

// La CSS elle-même : l'emoji/texte doivent être cachés en permanence (plus
// de repli sous 900px depuis le retrait du rail réduit, voir plus haut) et
// le logo image ne doit JAMAIS être cité dans une règle display:none, à
// aucune taille d'écran.
const styleBlock = [...doc.querySelectorAll("style")].map(s => s.textContent).join("\n");
if (!/\.sidebar-brand \.brand-mark\{[^}]*display:none;\}/.test(styleBlock)) {
  throw new Error("❌ .sidebar-brand .brand-mark devrait être display:none par défaut (repère historique, inerte).");
}
if (!/\.sidebar-brand \.brand-name\{[^}]*display:none;\}/.test(styleBlock)) {
  throw new Error("❌ .sidebar-brand .brand-name devrait être display:none par défaut (le logo image porte déjà le texte \"Pull Up\").");
}
if (/\.sidebar-brand \.brand-logo-img\{[^}]*display:none;\}/.test(styleBlock)) {
  throw new Error("❌ .brand-logo-img ne devrait plus jamais être caché (plus de rail réduit sous 900px depuis le retrait des emojis du menu).");
}
if (/\.sidebar-brand \.brand-mark\{[^}]*display:inline;\}/.test(styleBlock)) {
  throw new Error("❌ .brand-mark (🏀) ne devrait plus jamais redevenir visible (plus de repli rail réduit).");
}
console.log("✅ Le logo complet reste affiché à toutes les tailles d'écran, plus aucun repli sur l'emoji du logo.");

// Retour utilisateur (2026-09) : "le logo ne se bloque tjrs pas sur le
// côté" : .sidebar défile en interne (overflow-y:auto) dès que la liste de
// boutons dépasse 100vh, et .sidebar-brand (le logo) faisait partie de ce
// contenu défilant au lieu de rester ancré en haut. Vérifie que
// .sidebar-brand est bien épinglé (position:sticky, calé en haut de son
// ancêtre défilant .sidebar) avec un fond opaque pour ne pas laisser
// transparaître les boutons qui remontent dessous.
const sidebarBrandRuleMatch = styleBlock.match(/\.sidebar-brand\{([^}]*)\}/);
if (!sidebarBrandRuleMatch) throw new Error("❌ (setup) Règle .sidebar-brand introuvable dans la feuille de style.");
const sidebarBrandRule = sidebarBrandRuleMatch[1];
if (!/position:sticky/.test(sidebarBrandRule) || !/top:0/.test(sidebarBrandRule)) {
  throw new Error(`❌ BUG NON CORRIGÉ : .sidebar-brand devrait être position:sticky; top:0 pour rester visible pendant le défilement interne de la sidebar, règle actuelle : "${sidebarBrandRule}".`);
}
if (!/background:var\(--panel\)/.test(sidebarBrandRule)) {
  throw new Error(`❌ .sidebar-brand devrait avoir un fond opaque (background:var(--panel), identique à .sidebar) pour masquer les boutons qui défilent dessous une fois épinglé, règle actuelle : "${sidebarBrandRule}".`);
}
console.log("✅ .sidebar-brand (le logo) est bien épinglé en haut de la sidebar pendant son défilement interne.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests sidebar_logo_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
