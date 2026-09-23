// Vérifie la balise <meta name="viewport"> (retour utilisateur, 2026-09-23,
// capture d'écran mobile : "Le texte passe au dessus de la barre du haut du
// site"). Cause identifiée : moteurbasket3.html n'avait AUCUNE balise
// viewport, ce qui poussait les navigateurs mobiles à simuler un viewport
// large façon desktop (~980px) puis à mettre toute la page à l'échelle pour
// la faire tenir à l'écran — cassant au passage le positionnement
// position:sticky de .topbar sur iOS Safari (le contenu pouvait alors
// glisser par-dessus), ET empêchant les media queries mobiles existantes
// (@media max-width:900px/680px/560px...) de jamais se déclencher sur un
// vrai téléphone.
//
// Ce test ne peut pas vérifier le rendu visuel réel (jsdom ne calcule pas de
// mise en page CSS) — la vérification visuelle a été faite via Playwright
// (captures d'écran + mesures réelles de débordement horizontal à 390px de
// large, voir DEV_NOTES.md). Il sert uniquement de garde-fou automatisé
// contre une régression future (suppression accidentelle de la balise, ou
// de son contenu correct).
const fs = require("fs");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;

const meta = doc.querySelector('meta[name="viewport"]');
if (!meta) {
  throw new Error("❌ La balise <meta name=\"viewport\"> a disparu de moteurbasket3.html — régression du correctif 2026-09-23 (texte qui passait au-dessus de la barre du haut sur mobile).");
}
const content = meta.getAttribute("content") || "";
if (!content.includes("width=device-width")) {
  throw new Error(`❌ meta viewport présente mais sans "width=device-width" (content actuel : "${content}") — les navigateurs mobiles reviendraient à un viewport élargi simulé.`);
}
if (!content.includes("initial-scale=1")) {
  throw new Error(`❌ meta viewport présente mais sans "initial-scale=1" (content actuel : "${content}") — la page pourrait s'ouvrir déjà zoomée sur mobile.`);
}
console.log("✅ <meta name=\"viewport\" content=\"" + content + "\"> bien présente.");

// Garde-fou léger (vérif texte brut, pas de mise en page réelle dans jsdom) :
// le correctif de débordement horizontal du bouton "Donnez vos ordres" sous
// 560px (effet de bord direct du correctif viewport ci-dessus : une fois la
// page rendue à sa vraie largeur sur téléphone, la sidebar fixe 236px ne
// laisse plus assez de place à .topbar-cta en une seule ligne) doit rester
// présent.
if (!html.includes("button.topbar-cta{padding:8px 10px; font-size:11.5px; white-space:normal")) {
  throw new Error("❌ Le correctif de débordement horizontal de button.topbar-cta sous 560px semble avoir disparu (régression du correctif 2026-09-23).");
}
console.log("✅ Correctif de débordement du bouton \"Donnez vos ordres\" (sous 560px) toujours présent.");

dom.window.close();
server.close();

})().catch(e => { console.error(e); process.exit(1); });
