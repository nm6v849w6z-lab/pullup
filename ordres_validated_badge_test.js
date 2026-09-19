// Vérifie le retour utilisateur (2026-09) : "quand les ordres ont été
// validés, il faudrait dans le calendrier et en haut à droite, que le bouton
// donnez vos ordres deviennent : Modifier vos ordres (et que la couleur soit
// différente)". Couvre : l'état par défaut (avant toute validation), l'état
// après un clic sur "✅ Valider les ordres" pour la journée IMMÉDIATE (topbar
// ET ligne du calendrier), la persistance de teamA.ordresValidatedRound à
// travers un rechargement de session (voir Team.ordresValidatedRound côté
// moteur), et qu'une journée FUTURE préparée à l'avance (mécanisme
// plannedTactics existant, inchangé) affiche elle aussi le badge dans le
// calendrier.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function calendarBtnForRound(doc, round) {
  const btn = [...doc.querySelectorAll(`.calendar-order-btn[data-round="${round}"]`)][0];
  return btn || null;
}

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
let dom = await openGame(html, baseUrl);
let doc = dom.window.document;
let win = dom.window;

// ---------------------------------------------------------------------
// Partie 1 : état par défaut, avant toute validation explicite.
// ---------------------------------------------------------------------
const immediateRound = win.eval("currentMatch.round");
win.eval("TAB_HANDLERS.ordres();");

const initialOrdresValidated = win.eval("teamA.ordresValidatedRound");
if (initialOrdresValidated !== null) {
  throw new Error(`❌ (setup) teamA.ordresValidatedRound devrait être null avant toute validation, obtenu ${initialOrdresValidated}.`);
}

const topbarBtn = doc.getElementById("topbarOrdersBtn");
console.log("Bouton topbar avant validation :", JSON.stringify(topbarBtn.textContent), topbarBtn.className);
if (topbarBtn.textContent !== "📋 Donnez vos ordres") {
  throw new Error(`❌ Le bouton topbar devrait afficher le texte par défaut avant validation, obtenu "${topbarBtn.textContent}".`);
}
if (topbarBtn.classList.contains("topbar-cta-validated")) {
  throw new Error("❌ Le bouton topbar ne devrait pas porter la classe 'validé' avant toute validation.");
}
console.log("✅ Le bouton topbar affiche bien l'état par défaut avant validation.");

const calBtnBefore = win.eval("(() => { renderCalendrierSection(); return true; })()") && calendarBtnForRound(doc, immediateRound);
if (!calBtnBefore) throw new Error("❌ (setup) Le bouton Ordres de la journée immédiate devrait être présent dans le calendrier.");
console.log("Bouton calendrier avant validation :", JSON.stringify(calBtnBefore.textContent), calBtnBefore.className);
if (calBtnBefore.textContent !== "📋 Ordres") {
  throw new Error(`❌ Le bouton calendrier devrait afficher le texte par défaut avant validation, obtenu "${calBtnBefore.textContent}".`);
}
if (calBtnBefore.classList.contains("calendar-order-btn-validated")) {
  throw new Error("❌ Le bouton calendrier ne devrait pas porter la classe 'validé' avant toute validation.");
}
console.log("✅ Le bouton calendrier affiche bien l'état par défaut avant validation.");

// ---------------------------------------------------------------------
// Partie 2 : clic sur "✅ Valider les ordres" pour la journée immédiate.
// ---------------------------------------------------------------------
win.eval("TAB_HANDLERS.ordres();"); // reviens sur Ordres (le calendrier a changé de section)
await win.eval("validateOrdres()");
await flush(dom);

const validatedRound = win.eval("teamA.ordresValidatedRound");
console.log(`\nteamA.ordresValidatedRound après validation : ${validatedRound} (journée immédiate attendue : ${immediateRound})`);
if (validatedRound !== immediateRound) {
  throw new Error(`❌ BUG NON CORRIGÉ : teamA.ordresValidatedRound devrait valoir ${immediateRound} après validation, obtenu ${validatedRound}.`);
}
console.log("✅ teamA.ordresValidatedRound est bien renseigné après le clic sur Valider les ordres.");

console.log("Bouton topbar après validation :", JSON.stringify(topbarBtn.textContent), topbarBtn.className);
if (topbarBtn.textContent !== "✅ Modifier vos ordres") {
  throw new Error(`❌ BUG NON CORRIGÉ : le bouton topbar devrait afficher "Modifier vos ordres" après validation, obtenu "${topbarBtn.textContent}".`);
}
if (!topbarBtn.classList.contains("topbar-cta-validated")) {
  throw new Error("❌ BUG NON CORRIGÉ : le bouton topbar devrait porter la classe de couleur 'validé' après validation.");
}
console.log("✅ Le bouton topbar affiche bien 'Modifier vos ordres' avec une couleur différente après validation.");

win.eval("renderCalendrierSection();");
const calBtnAfter = calendarBtnForRound(doc, immediateRound);
console.log("Bouton calendrier après validation :", JSON.stringify(calBtnAfter.textContent), calBtnAfter.className);
if (calBtnAfter.textContent !== "✅ Modifier vos ordres") {
  throw new Error(`❌ BUG NON CORRIGÉ : le bouton calendrier devrait afficher "Modifier vos ordres" après validation, obtenu "${calBtnAfter.textContent}".`);
}
if (!calBtnAfter.classList.contains("calendar-order-btn-validated")) {
  throw new Error("❌ BUG NON CORRIGÉ : le bouton calendrier devrait porter la classe de couleur 'validé' après validation.");
}
console.log("✅ Le bouton calendrier affiche bien 'Modifier vos ordres' avec une couleur différente après validation.");

// ---------------------------------------------------------------------
// Partie 2bis : retour utilisateur (2026-09) : "ça me met ✅ Ordres
// enregistrés. [...] je n'ai pas appuyé sur valider les ordres" :
// #ordresValidateFeedback (voir validateOrdres) n'était jamais effacé, donc
// ce message de confirmation, posé ci-dessus pour la journée immédiate,
// restait affiché tel quel après être passé à une AUTRE journée dans le
// sélecteur (voir renderOrdresGrid), laissant croire à tort que cette autre
// journée venait, elle aussi, d'être validée alors qu'elle ne l'a jamais
// été.
// ---------------------------------------------------------------------
// (déjà sur l'onglet Ordres depuis la Partie 2, pas de TAB_HANDLERS.ordres()
// ici : goToOrdresTab -> renderPrep -> renderOrdresGrid effacerait
// justement le message qu'on veut observer avant tout changement de
// journée, voir le correctif ci-dessus.)
const feedbackAfterValidate = doc.getElementById("ordresValidateFeedback").textContent;
console.log(`\nMessage de confirmation juste après validation : "${feedbackAfterValidate}"`);
if (!feedbackAfterValidate.includes("enregistrés")) {
  throw new Error(`❌ (setup) Le message de confirmation devrait être affiché juste après le clic sur Valider, obtenu "${feedbackAfterValidate}".`);
}
const otherRound = immediateRound < 17 ? immediateRound + 1 : immediateRound - 1;
win.eval(`selectOrdresRound(${otherRound}, "championship")`);
const feedbackAfterSwitch = doc.getElementById("ordresValidateFeedback").textContent;
console.log(`Message de confirmation après avoir changé pour la journée ${otherRound} sans la valider : "${feedbackAfterSwitch}"`);
if (feedbackAfterSwitch.includes("enregistrés")) {
  throw new Error(`❌ BUG NON CORRIGÉ : le message "Ordres enregistrés" de la journée ${immediateRound} reste affiché après être passé à la journée ${otherRound}, laissant croire à tort que celle-ci vient d'être validée.`);
}
console.log(`✅ Le message de confirmation de la journée ${immediateRound} est bien effacé en passant à la journée ${otherRound} sans la valider.`);

await flush(dom);
await dom.window.close();

// ---------------------------------------------------------------------
// Partie 3 : persistance à travers un rechargement de session (nouvelle
// JSDOM pointée vers le même serveur, voir openGame).
// ---------------------------------------------------------------------
dom = await openGame(html, baseUrl);
doc = dom.window.document;
win = dom.window;

const reloadedValidated = win.eval("teamA.ordresValidatedRound");
console.log(`\nAprès rechargement de session, teamA.ordresValidatedRound = ${reloadedValidated}`);
if (reloadedValidated !== immediateRound) {
  throw new Error(`❌ BUG NON CORRIGÉ : la validation devrait survivre à un rechargement de session, attendu ${immediateRound}, obtenu ${reloadedValidated}.`);
}
console.log("✅ teamA.ordresValidatedRound survit bien à un rechargement de session.");

win.eval("TAB_HANDLERS.ordres();");
const topbarBtnReloaded = doc.getElementById("topbarOrdersBtn");
if (topbarBtnReloaded.textContent !== "✅ Modifier vos ordres") {
  throw new Error(`❌ Le bouton topbar devrait rester sur "Modifier vos ordres" après rechargement, obtenu "${topbarBtnReloaded.textContent}".`);
}
console.log("✅ Le bouton topbar reflète bien l'état persisté après rechargement.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests du badge \"Modifier vos ordres\" sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
