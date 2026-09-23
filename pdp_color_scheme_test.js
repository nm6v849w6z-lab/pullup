// Vérifie le nouveau schéma de couleur SANS halo sur la fiche joueur
// (retour utilisateur, 2026-09-23) :
//   1. "petite mission intermédiaire — simule une page d'un joueur avec les
//      carac de cette couleur : 0-20 rouge, 21-50 orange, 51-80 blanc et
//      +81 vert" (+ une variante rouge/orange/vert/bleu, écartée)
//   2. "sur les pages joueurs, refais des visuels sans le halo : je préfère
//      le premier oui, ça serait possible de présenter les valeurs sans
//      halo autour ?" (mockups color_scheme_comparison.html /
//      color_scheme_no_halo.html, jamais intégrés au jeu)
//   3. "on va partir sur la version sans mockup avec les couleurs rouges
//      orange blanc vert" : implémentation réelle, cette fois dans
//      moteurbasket3.html (attrColorTier/.pdp-attr-value/.pdp-overall-num).
// Voir le grand commentaire CSS "REVIRTEMENT VOLONTAIRE (2026-09-23)" dans
// moteurbasket3.html : ceci réintroduit délibérément une échelle de couleur
// DIFFÉRENTE de celle de l'Effectif/du Marché (.attr-cell, seuils 45/65/80),
// UNIQUEMENT sur la fiche joueur — ce test vérifie donc aussi que
// l'Effectif garde bien son ancienne échelle, inchangée.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

// Calcul indépendant du palier attendu, pour ne jamais dépendre de
// attrColorTier elle-même (sinon le test ne vérifierait rien).
function expectedTier(value) {
  if (value <= 20) return "attr-tier-red";
  if (value <= 50) return "attr-tier-orange";
  if (value <= 80) return "attr-tier-white";
  return "attr-tier-green";
}

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "effectif").click();
const firstPlayerLink = doc.querySelector("#rosterContent .player-link");
if (!firstPlayerLink) throw new Error("❌ (setup) l'Effectif devrait afficher au moins un lien joueur cliquable.");
firstPlayerLink.click();

const valueEls = [...doc.querySelectorAll("#playerDetailContent .pdp-attr-value")];
if (valueEls.length === 0) {
  throw new Error("❌ Aucune valeur de caractéristique affichée (.pdp-attr-value) — les caractéristiques de son propre joueur devraient être en clair.");
}
console.log(`Caractéristiques affichées : ${valueEls.length}`);

// 1) SANS halo : jamais la classe "pdp-pill" (qui garde padding/fond, voir
//    son commentaire CSS — réservée désormais au seul badge "?" verrouillé)
//    sur une valeur chiffrée.
const stillHasHalo = valueEls.some(el => el.classList.contains("pdp-pill"));
if (stillHasHalo) {
  throw new Error("❌ Une valeur de caractéristique porte encore la classe 'pdp-pill' (halo/pastille) — devrait être 'pdp-attr-value' seule, sans fond.");
}
console.log("✅ Aucune valeur de caractéristique ne porte plus le halo/pastille (.pdp-pill) : juste le chiffre coloré.");

// 2) Couleur correcte pour CHAQUE valeur affichée, contre un calcul
//    indépendant des seuils 0-20/21-50/51-80/81+.
let mismatches = [];
valueEls.forEach(el => {
  const value = parseInt(el.textContent, 10);
  const expected = expectedTier(value);
  const has = el.classList.contains(expected);
  if (!has) {
    mismatches.push(`valeur ${value} → attendu .${expected}, classes réelles "${el.className}"`);
  }
});
if (mismatches.length > 0) {
  throw new Error(`❌ Palier de couleur incorrect pour ${mismatches.length} valeur(s) :\n${mismatches.join("\n")}`);
}
console.log(`✅ Les ${valueEls.length} valeurs affichées respectent toutes le palier attendu (0-20 rouge / 21-50 orange / 51-80 blanc / 81+ vert).`);

// 3) Aucune classe de l'ANCIENNE échelle (attr-elite/good/mid/lo) ne doit
//    plus être appliquée aux valeurs de la fiche joueur.
const oldScaleLeak = valueEls.some(el => ["attr-elite", "attr-good", "attr-mid", "attr-lo"].some(c => el.classList.contains(c)));
if (oldScaleLeak) {
  throw new Error("❌ Une valeur de la fiche joueur porte encore une classe de l'ancienne échelle (attr-elite/good/mid/lo) — devrait être entièrement migrée vers attr-tier-*.");
}
console.log("✅ Plus aucune trace de l'ancienne échelle attr-elite/good/mid/lo sur la fiche joueur.");

// 4) La note globale (.pdp-overall-num) suit la MÊME échelle, calculée de
//    façon indépendante côté moteur.
const overallEl = doc.querySelector("#playerDetailContent .pdp-overall-num");
if (!overallEl) throw new Error("❌ (setup) .pdp-overall-num introuvable sur la fiche joueur.");
const overallValue = parseInt(overallEl.textContent, 10);
const expectedOverallTier = expectedTier(overallValue);
if (!overallEl.classList.contains(expectedOverallTier)) {
  throw new Error(`❌ Note globale (${overallValue}) : palier attendu .${expectedOverallTier}, classes réelles "${overallEl.className}".`);
}
console.log(`✅ La note globale (${overallValue}) respecte elle aussi le même palier de couleur (.${expectedOverallTier}).`);

// 5) L'Effectif (tableau dense, .attr-cell) : COUVERT SÉPARÉMENT depuis le
//    lot "reprends le meme code couleur pour les pages effectifs, les
//    joueurs sur le marché des transferts, l'humeur des supporters,
//    alchimie, connaissance tactique" (2026-09-23, voir
//    attr_color_scheme_everywhere_test.js) : .attr-cell partage désormais
//    la MÊME échelle qu'ici (attrColorTier), ce test-ci reste concentré sur
//    la fiche joueur uniquement pour rester lisible.

await flush(dom);
dom.window.close();
server.close();

console.log("\n✅ Nouveau schéma de couleur (rouge/orange/blanc/vert, sans halo) vérifié sur la fiche joueur.");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
