// Vérifie le retour utilisateur (2026-09) : "ici, je souhaite que les
// briques de droite n'aillent pas plus bas que la brique de gauche. ce sera
// plus beau visuellement" (onglet Salle, .arena-row : carte visuelle de la
// salle à gauche, carte d'état actuel + "Autres infrastructures" à droite).
//
// Le vrai rendu (image de la salle, nombre de lignes de cartes selon le
// nombre d'infrastructures construites) dépend de la mise en page réelle du
// navigateur, que JSDOM ne calcule pas (getBoundingClientRect renvoie
// toujours des zéros ici, voir plus bas). Ce test vérifie donc directement
// le mécanisme JS qui garantit l'alignement (syncArenaPurchasesHeight,
// appelée depuis renderSalleSection et depuis un écouteur "resize" sur
// window) : #arenaPurchasesCol reçoit bien une max-height calquée sur la
// hauteur RÉELLEMENT mesurée de la carte de gauche (#arenaVisualCard
// .arena-card), pas une valeur figée. L'alignement visuel lui-même (3
// colonnes pour la grille de droite, défilement interne si ça ne suffit
// toujours pas) est le filet de sécurité CSS, voir les commentaires sur
// #arenaPurchasesCol/.arena-purchases .facilities-grid dans moteurbasket3.html.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

function clickTab(key) {
  const btn = [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key);
  if (!btn) throw new Error(`❌ Onglet introuvable : ${key}`);
  btn.click();
}

// Monkey-patch de getBoundingClientRect (JSDOM ne fait pas de vraie mise en
// page) : seule la carte visuelle de gauche (#arenaVisualCard .arena-card)
// renvoie une hauteur contrôlée par le test, tout le reste garde le
// comportement JSDOM normal (zéros).
let mockedLeftHeight = 300;
const realGetBoundingClientRect = win.Element.prototype.getBoundingClientRect;
win.Element.prototype.getBoundingClientRect = function () {
  if (this.matches && this.matches("#arenaVisualCard .arena-card")) {
    return { x: 0, y: 0, top: 0, left: 0, right: 0, width: 0, height: mockedLeftHeight, bottom: mockedLeftHeight };
  }
  return realGetBoundingClientRect.call(this);
};

// ---------------------------------------------------------------------
// Partie 1 : renderSalleSection (appelée par clickTab ci-dessous, voir
// TAB_HANDLERS.salle) reporte bien la hauteur mesurée de la carte de gauche
// comme max-height sur #arenaPurchasesCol.
// ---------------------------------------------------------------------
clickTab("salle");
const purchasesCol = doc.getElementById("arenaPurchasesCol");
if (!purchasesCol) throw new Error("❌ (setup) #arenaPurchasesCol introuvable : id manquant sur .arena-purchases ?");
console.log("max-height après premier rendu de l'onglet Salle :", purchasesCol.style.maxHeight, `(attendu ${mockedLeftHeight}px)`);
if (purchasesCol.style.maxHeight !== `${mockedLeftHeight}px`) {
  throw new Error(`❌ BUG NON CORRIGÉ : #arenaPurchasesCol devrait recevoir max-height:${mockedLeftHeight}px (hauteur mesurée de la carte de gauche), obtenu "${purchasesCol.style.maxHeight}".`);
}
console.log("✅ La colonne de droite reçoit bien une max-height calquée sur la hauteur réelle de la carte de gauche.");

// ---------------------------------------------------------------------
// Partie 2 : re-rendre avec une hauteur de gauche différente (simule un
// autre palier de salle avec une image de format différent, ou une fenêtre
// redimensionnée) doit mettre à jour la max-height en conséquence.
// ---------------------------------------------------------------------
mockedLeftHeight = 520;
win.renderSalleSection();
console.log("\nmax-height après un second rendu (hauteur de gauche changée à 520) :", purchasesCol.style.maxHeight);
if (purchasesCol.style.maxHeight !== "520px") {
  throw new Error(`❌ Un nouveau rendu de l'onglet Salle devrait remesurer et mettre à jour max-height, obtenu "${purchasesCol.style.maxHeight}" au lieu de "520px".`);
}
console.log("✅ Un nouveau rendu remesure bien et met à jour la max-height.");

// ---------------------------------------------------------------------
// Partie 3 : l'écouteur "resize" sur window (voir juste après
// syncArenaPurchasesHeight dans moteurbasket3.html) remesure et met à jour
// la max-height UNIQUEMENT quand l'onglet Salle est actuellement affiché,
// pas sur un autre écran (pour ne pas modifier un style qui n'est plus
// pertinent).
// ---------------------------------------------------------------------
mockedLeftHeight = 410;
win.dispatchEvent(new win.Event("resize"));
console.log("\nmax-height après un évènement resize, onglet Salle toujours affiché :", purchasesCol.style.maxHeight);
if (purchasesCol.style.maxHeight !== "410px") {
  throw new Error(`❌ BUG NON CORRIGÉ : redimensionner la fenêtre pendant que l'onglet Salle est affiché devrait remesurer et mettre à jour max-height, obtenu "${purchasesCol.style.maxHeight}" au lieu de "410px".`);
}
console.log("✅ Redimensionner la fenêtre pendant que l'onglet Salle est affiché remesure bien la colonne de droite.");

clickTab("effectif"); // quitte l'onglet Salle
const maxHeightBeforeIgnoredResize = purchasesCol.style.maxHeight;
mockedLeftHeight = 999;
win.dispatchEvent(new win.Event("resize"));
console.log("\nmax-height après un resize alors qu'on a quitté l'onglet Salle :", purchasesCol.style.maxHeight, "(attendu inchangé, ni 999px)");
if (purchasesCol.style.maxHeight !== maxHeightBeforeIgnoredResize) {
  throw new Error(`❌ Redimensionner la fenêtre depuis un AUTRE onglet ne devrait pas toucher #arenaPurchasesCol (onglet Salle non affiché), obtenu "${purchasesCol.style.maxHeight}" au lieu de "${maxHeightBeforeIgnoredResize}".`);
}
console.log("✅ Un resize depuis un autre onglet ne modifie pas la colonne de droite de la Salle (pas affichée).");

win.Element.prototype.getBoundingClientRect = realGetBoundingClientRect;

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests salle_arena_purchases_height_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
