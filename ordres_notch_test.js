// Page Ordres sur iPhone (retour utilisateur 2026-09-28, "Tjrs ce bug") :
// le topbar est masqué sur cette page, donc la barre d'action collante doit
// réserver elle-même la place de la barre d'état (env(safe-area-inset-top)).
// Le correctif avait été annoncé dans le commit 6791d2d sans y figurer :
// ce test empêche qu'il disparaisse de nouveau.
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const html = require("./test_game_html.js").readGameHtml();

const rule = html.match(/\.topbar-hidden-on-page\s*~\s*\.content-scroll\s+\.ordres-actionbar\s*\{([^}]*)\}/);
assert(rule, "règle de la barre d'action des Ordres quand le topbar est masqué absente");
assert(/top\s*:\s*0/.test(rule[1]), "la barre d'action doit se coller à top:0");
assert(/padding-top\s*:\s*calc\([^;]*env\(safe-area-inset-top/.test(rule[1]),
  "la barre d'action doit réserver env(safe-area-inset-top)");
console.log("✅ Barre d'action des Ordres : place réservée pour l'encoche / la barre d'état.");

assert(/topbarEl\.classList\.toggle\("topbar-hidden-on-page", id === "prepSection"\)/.test(html),
  "le topbar doit toujours être masqué sur la page Ordres (sinon la règle ne s'applique plus)");
console.log("✅ Topbar masqué sur Ordres uniquement (la règle s'applique bien).");

// Autres éléments plein écran / collés en haut (même session, 2026-09-28).
const hs = html.match(/#hoopShowSection\{position:fixed;[^}]*\}/);
assert(hs && /padding:env\(safe-area-inset-top/.test(hs[0]), "Hoop Show plein écran : env(safe-area-inset-top) manquant");
assert(/\.tour-toast\{\s*position:fixed; top:calc\(20px \+ env\(safe-area-inset-top/.test(html), "toast de la visite guidée : env(safe-area-inset-top) manquant");
console.log("✅ Hoop Show et message de la visite guidée : place réservée pour l'encoche.");

console.log("\n🏁 iPhone : plus rien sous l'encoche (Ordres, Hoop Show, visite guidée).");
