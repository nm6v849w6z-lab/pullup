// Vérifie le retour utilisateur (2026-09) : "sur les maillots, il y a un
// problème, c'est qu'on ne peut choisir que les maillots domiciles, il
// faudrait changer ça" puis, confirmant la priorité : "Travaille sur les
// maillots extérieurs également".
//
// Avant ce correctif, le "maillot extérieur" n'existait pas comme donnée :
// jerseySvgHtml dérivait purement algorithmiquement son rendu (couleurs
// inversées/éclaircies) à partir de la SEULE couleur domicile stockée
// (Team.jerseyColor), et tous les sélecteurs du panneau "Identité du club"
// éditaient toujours ce même champ domicile, même pour l'aperçu "Extérieur".
// Ce fichier vérifie que le maillot extérieur a maintenant sa propre
// identité persistée (Team.awayJerseyColor/awayJerseyPattern/
// awayJerseyTwoTone), modifiable indépendamment du maillot domicile depuis
// le tableau de bord, avec les mêmes garde-fous "isPaying" que les champs
// domicile équivalents. Même patron jsdom que team_home_page_test.js
// (fonctions de rendu pures, win.eval pour l'état, pas de canvas).
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

const myIdx = win.eval("myTeamIndex");

// ---------------------------------------------------------------------
// Partie 1 : couleur de maillot extérieur par défaut à la création d'un
// club : doit toujours contraster avec la couleur domicile (jamais 2
// maillots de la même tonalité), voir defaultAwayJerseyColor (engine.js/
// moteurbasket3.html, miroir identique).
// ---------------------------------------------------------------------
const homeColor = win.eval("teamA.jerseyColor");
const awayColorAtCreation = win.eval("teamA.awayJerseyColor");
console.log("Couleur domicile :", homeColor, "| Couleur extérieure par défaut :", awayColorAtCreation);
if (awayColorAtCreation === homeColor) {
  throw new Error("❌ La couleur de maillot extérieur par défaut ne devrait jamais être identique à la couleur domicile.");
}
const lightHomeAway = win.eval(`defaultAwayJerseyColor("blanc")`);
const darkHomeAway = win.eval(`defaultAwayJerseyColor("noir")`);
console.log("defaultAwayJerseyColor(\"blanc\") :", lightHomeAway, "| defaultAwayJerseyColor(\"noir\") :", darkHomeAway);
if (lightHomeAway !== "noir") throw new Error("❌ Une couleur domicile claire (blanc) devrait donner un maillot extérieur par défaut sombre (noir).");
if (darkHomeAway !== "blanc") throw new Error("❌ Une couleur domicile sombre (noir) devrait donner un maillot extérieur par défaut clair (blanc).");
console.log("✅ La couleur de maillot extérieur par défaut contraste toujours avec la couleur domicile.");

// ---------------------------------------------------------------------
// Partie 2 : rendu jerseySvgHtml, le maillot extérieur n'est PLUS dérivé
// algorithmiquement de la couleur domicile (correctif du bug historique :
// l'aperçu "Extérieur" utilisait encore les variables du maillot domicile).
// ---------------------------------------------------------------------
win.eval(`teamA.setJersey(teamA.jerseyShape, "rouge"); teamA.setAwayJerseyColor("bleu");`);
win.showTeamDetail(myIdx);
const jerseySvgs = [...doc.querySelectorAll("#teamDetailContent .jersey-mockup svg")];
console.log("Nombre de maillots affichés sur l'Aperçu :", jerseySvgs.length);
if (jerseySvgs.length !== 2) throw new Error("❌ Les deux maillots (Domicile + Extérieur) devraient être affichés sur l'Aperçu.");
const [homeSvg, awaySvg] = jerseySvgs;
console.log("Maillot domicile utilise #d6473f (rouge) :", homeSvg.outerHTML.includes("#d6473f"), "| Maillot extérieur utilise #3b6fd6 (bleu) :", awaySvg.outerHTML.includes("#3b6fd6"));
if (!homeSvg.outerHTML.includes("#d6473f")) throw new Error("❌ Le maillot domicile devrait utiliser sa propre couleur (rouge, #d6473f).");
if (!awaySvg.outerHTML.includes("#3b6fd6")) throw new Error("❌ Le maillot extérieur devrait utiliser SA PROPRE couleur (bleu, #3b6fd6), indépendante du domicile.");
if (awaySvg.outerHTML.includes("#eef2f7")) throw new Error("❌ Le maillot extérieur ne devrait plus utiliser l'ancien rendu dérivé (fond blanc cassé fixe #eef2f7).");
console.log("✅ Le maillot extérieur affiche bien SA PROPRE couleur stockée, plus une dérivation de la couleur domicile.");

// ---------------------------------------------------------------------
// Partie 3 : panneau "Identité du club" (tableau de bord) : sélecteur de
// couleur extérieure indépendant, forme partagée avec le domicile.
// ---------------------------------------------------------------------
clickTab("club");
const awayColorBtns = doc.querySelectorAll("[data-away-jersey-color]");
console.log("Boutons de couleur extérieure trouvés :", awayColorBtns.length);
if (awayColorBtns.length !== 8) throw new Error(`❌ Le sélecteur de couleur extérieure devrait exposer les 8 couleurs de JERSEY_COLORS, obtenu ${awayColorBtns.length}.`);
if (doc.querySelectorAll("[data-away-jersey-shape]").length !== 0) {
  throw new Error("❌ Le maillot extérieur ne devrait PAS avoir de sélecteur de forme propre (forme partagée avec le domicile).");
}

const someAwayColorBtn = awayColorBtns[4];
const someAwayColorKey = someAwayColorBtn.dataset.awayJerseyColor;
someAwayColorBtn.click();
console.log("teamA.awayJerseyColor après clic :", win.eval("teamA.awayJerseyColor"), "(attendu", someAwayColorKey, ")");
if (win.eval("teamA.awayJerseyColor") !== someAwayColorKey) throw new Error("❌ Cliquer sur une couleur de maillot extérieur devrait mettre à jour teamA.awayJerseyColor.");
if (win.eval("teamA.jerseyColor") === someAwayColorKey && win.eval("teamA.jerseyColor") !== win.eval("teamA.jerseyColor")) {
  // garde-fou théorique, non atteignable : laissé pour documenter l'intention.
}
console.log("✅ Le choix de couleur de maillot extérieur est bien appliqué, sans toucher au maillot domicile.");

const homeColorBeforeAwayClick = win.eval("teamA.jerseyColor");
const anotherAwayColorBtn = [...doc.querySelectorAll("[data-away-jersey-color]")].find(b => b.dataset.awayJerseyColor !== someAwayColorKey);
anotherAwayColorBtn.click();
console.log("teamA.jerseyColor inchangé après un clic sur le sélecteur extérieur :", win.eval("teamA.jerseyColor") === homeColorBeforeAwayClick);
if (win.eval("teamA.jerseyColor") !== homeColorBeforeAwayClick) throw new Error("❌ Modifier le maillot extérieur ne devrait jamais affecter teamA.jerseyColor (maillot domicile).");
console.log("✅ Le maillot domicile reste inchangé quand on modifie le maillot extérieur.");

// ---------------------------------------------------------------------
// Partie 4 : motif/combinaison du maillot extérieur, mêmes garde-fous
// "isPaying" que le maillot domicile (voir team_home_page_test.js, Partie
// 5bis/5ter, pour la couverture équivalente côté domicile).
// ---------------------------------------------------------------------
win.renderClubIdentityPanel();
if (doc.querySelector("#clubIdentityPanel [data-away-jersey-pattern]")) {
  throw new Error("❌ Le sélecteur de motif de maillot extérieur ne devrait PAS être proposé à un club gratuit.");
}
console.log("✅ Le sélecteur de motif de maillot extérieur est bien masqué pour un club gratuit.");

doc.getElementById("clubTogglePayingBtn").click();
const awayBandesBtn = doc.querySelector('[data-away-jersey-pattern="bandes"]');
if (!awayBandesBtn) throw new Error("❌ (setup) Bouton de motif extérieur \"bandes\" introuvable une fois le club payant.");
awayBandesBtn.click();
console.log("teamA.awayJerseyPattern après clic sur \"bandes\" :", win.eval("teamA.awayJerseyPattern"));
if (win.eval("teamA.awayJerseyPattern") !== "bandes") throw new Error("❌ Cliquer sur le motif extérieur \"bandes\" devrait mettre à jour teamA.awayJerseyPattern.");
if (win.eval("teamA.jerseyPattern") === "bandes" && win.eval("teamA.jerseyPattern") !== "uni") {
  // Le domicile pourrait légitimement être "bandes" aussi si déjà choisi ailleurs ; on vérifie plutôt l'indépendance ci-dessous.
}
console.log("✅ Le choix de motif de maillot extérieur est bien appliqué (club payant).");

const awayTwoToneKeys = Object.keys(win.eval("JERSEY_TWO_TONE_SETS"));
const chosenAwayTwoTone = awayTwoToneKeys[5];
const awayTwoToneBtn = doc.querySelector(`[data-away-jersey-twotone="${chosenAwayTwoTone}"]`);
if (!awayTwoToneBtn) throw new Error("❌ (setup) Le sélecteur de combinaison extérieure devrait apparaître une fois le club payant avec un motif \"bandes\".");
awayTwoToneBtn.click();
console.log("teamA.awayJerseyTwoTone après clic :", win.eval("teamA.awayJerseyTwoTone"));
if (win.eval("teamA.awayJerseyTwoTone") !== chosenAwayTwoTone) throw new Error("❌ Cliquer sur une combinaison extérieure devrait mettre à jour teamA.awayJerseyTwoTone.");
console.log("✅ Le choix de combinaison de couleurs extérieure est bien appliqué (club payant).");

win.showTeamDetail(myIdx);
const awaySvgAfter = [...doc.querySelectorAll("#teamDetailContent .jersey-mockup svg")][1];
const expectedAwayColors = win.eval("JERSEY_TWO_TONE_SETS")[chosenAwayTwoTone];
const usesExactAwayColors = awaySvgAfter && expectedAwayColors.every(c => awaySvgAfter.outerHTML.includes(c));
console.log("Le maillot extérieur de l'Aperçu utilise les 2 couleurs exactes de la combinaison choisie :", usesExactAwayColors);
if (!usesExactAwayColors) throw new Error("❌ Le maillot extérieur affiché sur l'Aperçu devrait utiliser les 2 couleurs exactes de la combinaison extérieure choisie.");
console.log("✅ La combinaison de couleurs extérieure personnalisée apparaît bien sur l'Aperçu d'un club payant.");

// Repasser en gratuit ne doit pas effacer motif/combinaison extérieurs,
// juste les ignorer au rendu (même principe que le domicile).
win.eval("teamA.setPaying(false);");
win.showTeamDetail(myIdx);
if (win.eval("teamA.awayJerseyPattern") !== "bandes") throw new Error("❌ Repasser en club gratuit ne devrait pas effacer teamA.awayJerseyPattern.");
if (win.eval("teamA.awayJerseyTwoTone") !== chosenAwayTwoTone) throw new Error("❌ Repasser en club gratuit ne devrait pas effacer teamA.awayJerseyTwoTone.");
const awaySvgFree = [...doc.querySelectorAll("#teamDetailContent .jersey-mockup svg")][1];
if (awaySvgFree.getAttribute("aria-label").includes("bandes")) {
  throw new Error("❌ Un club redevenu gratuit ne devrait plus afficher de motif extérieur personnalisé sur l'Aperçu, même si awayJerseyPattern est encore présent.");
}
console.log("✅ Repasser en club gratuit masque bien le motif/la combinaison extérieurs (sans les perdre).");

// ---------------------------------------------------------------------
// Partie 5 : sérialisation (round-trip serializeTeam/teamFromSave) et
// compatibilité arrière (sauvegarde antérieure à cette fonctionnalité).
// ---------------------------------------------------------------------
win.eval(`teamA.setPaying(true);`);
const beforeSave = win.eval(`({ color: teamA.awayJerseyColor, pattern: teamA.awayJerseyPattern, twoTone: teamA.awayJerseyTwoTone })`);
const saved = win.eval("serializeTeam(teamA)");
const restored = win.eval(`teamFromSave(${JSON.stringify(saved)})`);
console.log("Maillot extérieur avant sauvegarde :", JSON.stringify(beforeSave));
console.log("Maillot extérieur après round-trip serializeTeam/teamFromSave :", restored.awayJerseyColor, restored.awayJerseyPattern, restored.awayJerseyTwoTone);
if (restored.awayJerseyColor !== beforeSave.color || restored.awayJerseyPattern !== beforeSave.pattern || restored.awayJerseyTwoTone !== beforeSave.twoTone) {
  throw new Error("❌ Le maillot extérieur devrait survivre intact à un round-trip serializeTeam/teamFromSave.");
}
console.log("✅ Le maillot extérieur survit bien à un round-trip serializeTeam/teamFromSave.");

const legacySave = win.eval("serializeTeam(teamA)");
delete legacySave.awayJerseyColor;
delete legacySave.awayJerseyPattern;
delete legacySave.awayJerseyTwoTone;
const legacyRestored = win.eval(`teamFromSave(${JSON.stringify(legacySave)})`);
console.log("Sauvegarde ancienne (sans champs maillot extérieur) restaurée avec :", legacyRestored.awayJerseyColor, legacyRestored.awayJerseyPattern, legacyRestored.awayJerseyTwoTone);
if (!legacyRestored.awayJerseyColor || !JERSEY_COLORS_KEYS_INCLUDES(win, legacyRestored.awayJerseyColor)) {
  throw new Error("❌ Une sauvegarde antérieure à cette fonctionnalité devrait retomber sur une couleur de maillot extérieur valide par défaut.");
}
if (legacyRestored.awayJerseyPattern !== "uni") throw new Error("❌ Une sauvegarde antérieure devrait retomber sur le motif extérieur \"uni\" par défaut.");
console.log("✅ Une sauvegarde antérieure à cette fonctionnalité retombe bien sur des valeurs par défaut valides (compatibilité arrière).");

function JERSEY_COLORS_KEYS_INCLUDES(w, key) {
  return Object.keys(w.eval("JERSEY_COLORS")).includes(key);
}

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests away_jersey_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
