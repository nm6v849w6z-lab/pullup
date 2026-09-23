// Vérifie que TOUS les <select> natifs du jeu ouvrent leur liste d'options
// en thème sombre plutôt qu'en blanc (retour utilisateur, 2026-09-23 : "sur
// tous les menus déroulants dans le jeu, pourrais tu enlever le cadre blanc
// qu'il y a autour des propositions ? ça ferait un peu plus moderne je
// pense").
//
// Contexte technique important (voir le commentaire dans le :root de
// moteurbasket3.html) : le popup natif d'un <select> (la liste déroulante
// elle-même quand on clique dessus) n'est PAS un élément du DOM qu'on peut
// styler avec du CSS classique (background/border sur <option> n'a qu'un
// effet partiel et surtout jamais sur le "cadre" du popup) — c'est un
// rendu NATIF du navigateur/OS, qui bascule en clair (fond blanc) par
// défaut sur une page qui ne précise rien. Le seul levier standard pour
// faire vraiment basculer ce popup natif sur le thème sombre est la
// propriété CSS `color-scheme: dark`, posée ici sur :root ET répétée sur
// `select` lui-même.
//
// jsdom ne rend jamais le popup natif d'un <select> (aucun navigateur de
// test headless DOM-only ne le fait), donc ce test ne peut pas "voir" le
// popup blanc disparaître. Il vérifie la cause structurelle plutôt que
// l'effet visuel : la valeur CALCULÉE (getComputedStyle, pas juste la regex
// sur la feuille de style) de `color-scheme` doit être "dark" sur la racine
// du document ET sur CHAQUE <select> présent sur les écrans testés — sans
// ça, aucun navigateur ne bascule son popup natif sur le thème sombre.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

const rootScheme = win.getComputedStyle(doc.documentElement).colorScheme;
console.log("color-scheme calculé sur la racine du document :", rootScheme);
if (rootScheme !== "dark") {
  throw new Error(`❌ color-scheme devrait être "dark" sur :root, obtenu "${rootScheme}" — sans ça, TOUS les <select> du jeu ouvrent leur liste en clair par défaut.`);
}
console.log("✅ Le document déclare bien color-scheme: dark globalement.");

// Balaie plusieurs écrans du jeu pour couvrir un maximum de <select>
// distincts (Effectif/Entraînement pour le sélecteur de tactique travaillée
// -- devenu un dropdown custom, donc pas un <select>, voir plus bas --,
// Ordres pour le sélecteur de journée, la feuille de match pour les postes
// des remplaçants...).
function checkAllSelectsOnScreen(label) {
  const selects = [...doc.querySelectorAll("select")];
  console.log(`\n[${label}] <select> trouvés : ${selects.length}`);
  if (selects.length === 0) return 0;
  selects.forEach(sel => {
    const scheme = win.getComputedStyle(sel).colorScheme;
    if (scheme !== "dark") {
      throw new Error(`❌ [${label}] <select id="${sel.id || "(sans id)"}"> : color-scheme calculé "${scheme}", attendu "dark".`);
    }
  });
  console.log(`✅ [${label}] Les ${selects.length} <select> de cet écran ouvriront bien leur liste en thème sombre.`);
  return selects.length;
}

let totalChecked = 0;
totalChecked += checkAllSelectsOnScreen("Écran initial");

[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ordres")?.click();
totalChecked += checkAllSelectsOnScreen("Ordres");

[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "entrainement")?.click();
totalChecked += checkAllSelectsOnScreen("Entraînement");

if (totalChecked === 0) {
  throw new Error("❌ (setup) Aucun <select> trouvé sur les écrans testés — le test ne vérifierait rien.");
}

await flush(dom);
dom.window.close();
server.close();

console.log(`\n✅ ${totalChecked} <select> natif(s) au total, tous configurés pour ouvrir leur liste d'options en thème sombre (color-scheme: dark), plus de cadre/fond blanc par défaut.`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
