// Vérifie le tutoriel d'accueil posé DIRECTEMENT sur les vraies pages du jeu
// (retour utilisateur, 2026-09 : "mets le sur la vraie maquette du jeu et on
// regarde comment ça rend", suite à plusieurs itérations sur un aperçu HTML
// séparé). Voir TOUR_STEPS/startRealTour tout en bas de moteurbasket3.html.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

// --- Le bouton de lancement vit dans l'onglet Guide, jamais déclenché
// automatiquement (retour utilisateur pas encore tranché sur la mise en
// scène finale). ---
[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "guide").click();
const launchBtn = doc.getElementById("tourLaunchBtn");
if (!launchBtn) throw new Error("❌ Le bouton de lancement du tutoriel devrait être présent dans l'onglet Guide.");
launchBtn.click();

if (!doc.querySelector(".tour-center-box")) throw new Error("❌ Cliquer sur le bouton devrait ouvrir l'écran d'accueil du tutoriel.");
console.log("✅ Le tutoriel s'ouvre bien depuis l'onglet Guide, sur l'écran d'accueil.");

function currentStep() { return win.eval("TOUR_STEPS[tourStepIdx]"); }
const total = win.eval("TOUR_STEPS.length");

let sawOrdres = false, sawSalle = false, sawAcademie = false, sawConfirmedBlockRevealed = false;
let clicks = 0;
const MAX_CLICKS = total + 5;

while (true) {
  const step = currentStep();
  if (step.kind === "center" && step.final) break;
  clicks++;
  if (clicks > MAX_CLICKS) throw new Error("❌ Boucle de clics trop longue, tutoriel probablement bloqué (même bug que le retour utilisateur \"je ne peux plus avancer le tuto\" ?).");

  if (step.kind === "spotlight") {
    // La page réelle correspondante doit être vraiment affichée (pas une
    // maquette) : vérifie via les vrais id de section (showPage/PAGE_IDS).
    const realPageId = { ordres: "prepSection", salle: "salleSection", academie: "academieSection", dashboard: "clubSection" }[step.page];
    const pageEl = doc.getElementById(realPageId);
    if (!pageEl) throw new Error(`❌ (setup) section réelle #${realPageId} introuvable.`);
    if (pageEl.classList.contains("hidden")) {
      throw new Error(`❌ Étape "${step.title}" (topic ${step.topic}) : la vraie page #${realPageId} devrait être affichée (showPage), pas une maquette.`);
    }
    if (step.page === "ordres") sawOrdres = true;
    if (step.page === "salle") sawSalle = true;
    if (step.page === "academie") sawAcademie = true;

    const targetEl = doc.querySelector(step.target);
    if (!targetEl) throw new Error(`❌ Étape "${step.title}" : cible réelle "${step.target}" introuvable dans le DOM du vrai jeu.`);
    if (!targetEl.classList.contains("tour-target")) throw new Error(`❌ Étape "${step.title}" : la cible devrait porter la classe tour-target.`);

    if (step.reveal === "ordresConfirmedBlock") {
      const block = doc.getElementById("ordresConfirmedBlock");
      if (!block || block.classList.contains("hidden")) {
        throw new Error(`❌ Étape "${step.title}" : le bloc tactique confirmée devrait être révélé pour montrer ce réglage.`);
      }
      sawConfirmedBlockRevealed = true;
    }

    const callout = doc.querySelector(".tour-callout");
    if (!callout) throw new Error(`❌ Étape "${step.title}" : bulle manquante.`);
    if (!/^-?\d+(\.\d+)?px$/.test(callout.style.left) || !/^-?\d+(\.\d+)?px$/.test(callout.style.top)) {
      throw new Error(`❌ Étape "${step.title}" : positionnement invalide (left=${callout.style.left}, top=${callout.style.top}).`);
    }
  }

  const nextBtn = doc.getElementById("tourNextBtn");
  if (!nextBtn) throw new Error(`❌ Étape "${step.title}" : bouton Suivant introuvable, tutoriel bloqué.`);
  nextBtn.dispatchEvent(new win.Event("click", { bubbles: true }));
}

console.log(`✅ Les ${total - 2} étapes spotlight parcourues sans erreur (${clicks} clics), toutes sur les VRAIES pages du jeu.`);
if (!sawOrdres) throw new Error("❌ La page Ordres n'a jamais été ouverte pour de vrai pendant le tutoriel.");
if (!sawSalle) throw new Error("❌ La page Salle n'a jamais été ouverte pour de vrai pendant le tutoriel.");
if (!sawAcademie) throw new Error("❌ La page Académie de jeunes n'a jamais été ouverte pour de vrai pendant le tutoriel.");
if (!sawConfirmedBlockRevealed) throw new Error("❌ Le bloc tactique confirmée n'a jamais été révélé pendant le tutoriel.");
console.log("✅ Ordres, Salle et Académie de jeunes s'ouvrent bien pour de vrai, et la tactique confirmée est révélée pour l'expliquer.");

// --- Écran de fin : récap + total, 200 000 € au total, exactement comme
// convenu (retour utilisateur, 2026-09 : "il faut que le tuto permette de
// gagne 200K en tout"). ---
const recapRows = [...doc.querySelectorAll(".tour-recap-row")];
const expectedTopics = ["Effectif", "Ordres", "Entraînement", "Marché", "Staff", "Académie de jeunes", "Économie", "Salle"];
const expectedRewards = { "Effectif": 15000, "Ordres": 50000, "Entraînement": 20000, "Marché": 25000, "Staff": 20000, "Académie de jeunes": 40000, "Économie": 15000, "Salle": 15000 };
if (recapRows.length !== expectedTopics.length) {
  throw new Error(`❌ Le récap devrait lister ${expectedTopics.length} thèmes, obtenu ${recapRows.length}.`);
}
const earnedArr = JSON.parse(win.eval("JSON.stringify(tourEarnedRewards)"));
for (const topic of expectedTopics) {
  const found = earnedArr.find(r => r.title === topic);
  if (!found || found.reward !== expectedRewards[topic]) {
    throw new Error(`❌ Récompense "${topic}" attendue ${expectedRewards[topic]}, obtenu ${found ? found.reward : "absente"}.`);
  }
}
const totalRewardVal = win.eval("tourTotalReward()");
if (totalRewardVal !== 200000) throw new Error(`❌ Le total des primes devrait être 200000, obtenu ${totalRewardVal}.`);
console.log(`✅ Écran de fin correct : 8 thèmes, total des primes = ${totalRewardVal} €.`);

// --- IMPORTANT : le vrai budget du club (team.budget) n'a PAS bougé, la
// récompense n'est encore qu'un aperçu de rendu (voir le commentaire au-
// dessus de TOUR_STEPS). ---
const realBudget = win.eval("teamA.budget");
console.log("Budget réel du club après le tutoriel :", realBudget, "(devrait être inchangé, pas encore crédité)");

// --- Le bouton final ferme le tutoriel et revient au tableau de bord réel. ---
doc.getElementById("tourNextBtn").dispatchEvent(new win.Event("click", { bubbles: true }));
if (doc.getElementById("tourRoot").innerHTML.trim() !== "") throw new Error("❌ Après la fin du tutoriel, #tourRoot devrait être vide.");
if (doc.getElementById("clubSection").classList.contains("hidden")) throw new Error("❌ Après la fin du tutoriel, la vraie page Tableau de bord devrait être affichée.");
console.log("✅ Le tutoriel se ferme bien sur le vrai tableau de bord.");

// --- Après le tutoriel, le bloc tactique confirmée doit être revenu à son
// vrai état (débutant par défaut pour une carrière neuve) : la révélation
// pendant le tutoriel était cosmétique, jamais une vraie mutation. ---
[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ordres").click();
const confirmedBlockAfter = doc.getElementById("ordresConfirmedBlock");
const realTier = win.eval("teamA.tacticalTier");
console.log("Niveau tactique réel après le tutoriel :", realTier);
if (realTier === "débutant" && !confirmedBlockAfter.classList.contains("hidden")) {
  throw new Error("❌ Le tutoriel a laissé le bloc tactique confirmée révélé alors que l'équipe est restée en mode Débutant (mutation cosmétique non restaurée).");
}
console.log("✅ Le mode tactique réel de l'équipe n'a pas été modifié par le tutoriel (juste révélé temporairement pour l'expliquer).");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests onboarding_tour_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
