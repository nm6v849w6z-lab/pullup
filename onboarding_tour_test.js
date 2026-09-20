// Vérifie le tutoriel d'accueil posé DIRECTEMENT sur les vraies pages du jeu
// (retour utilisateur, 2026-09 : "mets le sur la vraie maquette du jeu et on
// regarde comment ça rend", suite à plusieurs itérations sur un aperçu HTML
// séparé). Voir TOUR_STEPS/startRealTour tout en bas de moteurbasket3.html.
const fs = require("fs");
const Engine = require("./engine.js");
const { generateMultiManagerLeague } = Engine;
const Calendar = require("./server/calendar.js");
const { dailyAnchoredCalendarConfig } = Calendar;
const store = require("./server/store.js");
const { startTestServer, openGame, flush, flushTourNext } = require("./test_helpers.js");
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
  // tourNext est désormais async (voir window.__lastTourNext, retour
  // utilisateur "Mets les vrais primes sur le tutoriel") : une étape à
  // prime attend la confirmation de la prime avant de faire avancer
  // tourStepIdx, sans quoi la boucle pourrait relire l'état AVANT que la
  // prime n'ait été traitée.
  await flushTourNext(dom);
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

// --- Retour utilisateur (2026-09) : "Mets les vrais primes sur le
// tutoriel" : le vrai budget du club (team.budget) doit avoir augmenté
// d'EXACTEMENT le total des primes affiché ci-dessus (voir
// performTutorialRewardClaim/tourNext), pas seulement dans le récapitulatif
// à l'écran. ---
const budgetBeforeTour = 300000; // solde de départ d'une carrière neuve (voir startTestServer/openGame ci-dessus)
const realBudget = win.eval("teamA.budget");
console.log("Budget réel du club après le tutoriel :", realBudget, "(devrait être", budgetBeforeTour + totalRewardVal, ")");
if (realBudget !== budgetBeforeTour + totalRewardVal) {
  throw new Error(`❌ RÉGRESSION : le budget réel devrait avoir augmenté de ${totalRewardVal} (total des primes), obtenu ${realBudget} au lieu de ${budgetBeforeTour + totalRewardVal}.`);
}
const claimedTopics = win.eval("teamA.tutorialRewardsClaimed");
if (!expectedTopics.every(t => claimedTopics.includes(t)) || claimedTopics.length !== expectedTopics.length) {
  throw new Error(`❌ tutorialRewardsClaimed devrait contenir exactement les ${expectedTopics.length} thèmes, obtenu ${JSON.stringify(claimedTopics)}.`);
}
console.log("✅ Le budget réel du club a bien été crédité de la prime totale, et tutorialRewardsClaimed liste bien les 8 thèmes.");

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

// --- Retour utilisateur (2026-09) : "on est d'accord qu'on ne peut le
// faire qu'une fois ? quand il a été fait le bouton dans le guide doit
// s'enlever" : une fois le tutoriel terminé, le bouton disparaît
// immédiatement (déjà vérifié en visitant Ordres ci-dessus, revisite Guide
// pour re-vérifier), ET l'état survit à un rechargement de page (persisté
// via saveMyTeam). ---
[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "guide").click();
const launchBtnAfter = doc.getElementById("tourLaunchBtn");
if (!launchBtnAfter || !launchBtnAfter.classList.contains("hidden")) {
  throw new Error("❌ Le bouton de lancement du tutoriel devrait être masqué après un tutoriel terminé.");
}
console.log("✅ Le bouton de lancement disparaît bien de l'onglet Guide une fois le tutoriel terminé.");

await flush(dom);
await dom.window.close();

// Rouvre une "nouvelle session" sur le MÊME serveur (donc la MÊME
// sauvegarde) : le bouton doit rester masqué après un rechargement complet
// de la page, pas seulement en mémoire pour cette session de navigateur.
const domReload = await openGame(html, baseUrl);
const docReload = domReload.window.document;
[...docReload.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "guide").click();
const launchBtnReload = docReload.getElementById("tourLaunchBtn");
if (!launchBtnReload || !launchBtnReload.classList.contains("hidden")) {
  throw new Error("❌ BUG : après un rechargement de page, le bouton de lancement du tutoriel devrait rester masqué (état non persisté ?).");
}
console.log("✅ L'état \"tutoriel terminé\" survit bien à un rechargement de page (persisté côté serveur).");
// Retour utilisateur (2026-09) : "Mets les vrais primes sur le tutoriel" :
// le budget réel et tutorialRewardsClaimed doivent eux aussi survivre au
// rechargement, pas seulement le drapeau onboardingTourCompleted.
const reloadedBudget = domReload.window.eval("teamA.budget");
if (reloadedBudget !== budgetBeforeTour + totalRewardVal) {
  throw new Error(`❌ RÉGRESSION : le budget réel devrait rester à ${budgetBeforeTour + totalRewardVal} après rechargement, obtenu ${reloadedBudget}.`);
}
const reloadedClaimed = domReload.window.eval("teamA.tutorialRewardsClaimed");
if (!expectedTopics.every(t => reloadedClaimed.includes(t)) || reloadedClaimed.length !== expectedTopics.length) {
  throw new Error(`❌ RÉGRESSION : tutorialRewardsClaimed devrait survivre au rechargement avec les 8 thèmes, obtenu ${JSON.stringify(reloadedClaimed)}.`);
}
console.log("✅ Le budget réel et tutorialRewardsClaimed survivent bien au rechargement de page.");
await flush(domReload);
await domReload.window.close();

// --- Passer le tutoriel (sans aller au bout) doit AUSSI le marquer comme
// fait, sur une carrière fraîche séparée : sinon "Passer" permettrait de
// relancer le tutoriel plus tard et de re-gagner les primes des thèmes déjà
// vus avant l'abandon. Retour utilisateur (2026-09) "Mets les vrais primes
// sur le tutoriel" : va plus loin qu'avant en validant RÉELLEMENT une étape
// à prime (le thème "Effectif") avant d'abandonner, pour vérifier que cette
// prime déjà gagnée reste acquise (le club la garde), mais qu'elle ne peut
// plus être retouchée même en tentant de relancer le tutoriel derrière. ---
console.log("\n--- Test : \"Passer\" marque aussi le tutoriel comme fait ---");
const { server: server2, baseUrl: baseUrl2 } = await startTestServer();
const dom2 = await openGame(html, baseUrl2);
const doc2 = dom2.window.document;
const win2 = dom2.window;
[...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "guide").click();
doc2.getElementById("tourLaunchBtn").click();
doc2.getElementById("tourNextBtn").dispatchEvent(new win2.Event("click", { bubbles: true })); // écran d'accueil -> étape "Effectif" (à prime)
await flushTourNext(dom2);
doc2.getElementById("tourNextBtn").dispatchEvent(new win2.Event("click", { bubbles: true })); // valide "Effectif" (prime réellement créditée) -> étape "Ordres"
await flushTourNext(dom2);
const budgetAfterOneTheme = win2.eval("teamA.budget");
if (budgetAfterOneTheme !== 300000 + 15000) {
  throw new Error(`❌ RÉGRESSION : la prime "Effectif" (15000) devrait déjà être créditée avant même d'abandonner le tutoriel, budget obtenu ${budgetAfterOneTheme}.`);
}
const skipBtn2 = doc2.querySelector("#tourSkipBtn");
if (!skipBtn2) throw new Error("❌ (setup) bouton Passer introuvable.");
skipBtn2.dispatchEvent(new win2.Event("click", { bubbles: true }));
if (!win2.eval("teamA.onboardingTourCompleted")) {
  throw new Error("❌ Passer le tutoriel devrait aussi le marquer comme fait (team.onboardingTourCompleted).");
}
[...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "guide").click();
const launchBtnAfterSkip = doc2.getElementById("tourLaunchBtn");
if (!launchBtnAfterSkip || !launchBtnAfterSkip.classList.contains("hidden")) {
  throw new Error("❌ Le bouton de lancement devrait aussi être masqué après un \"Passer\", pas seulement après être allé au bout.");
}
console.log("✅ \"Passer\" marque bien le tutoriel comme fait, bouton masqué en conséquence, et la prime déjà validée avant l'abandon reste acquise.");

// --- Défense en profondeur : même en contournant le bouton masqué (ex.
// outils de développement) pour rappeler directement claimTutorialReward
// sur un thème déjà payé avant l'abandon, aucune double dépense. ---
const doubleClaimAttempt = await win2.eval(`performTutorialRewardClaim("Effectif")`);
if (doubleClaimAttempt.ok !== true || doubleClaimAttempt.alreadyClaimed !== true || doubleClaimAttempt.amount !== 0) {
  throw new Error(`❌ RÉGRESSION : retoucher la prime "Effectif" après l'abandon devrait être idempotent (alreadyClaimed, amount 0), obtenu ${JSON.stringify(doubleClaimAttempt)}.`);
}
if (win2.eval("teamA.budget") !== budgetAfterOneTheme) {
  throw new Error("❌ RÉGRESSION : retoucher une prime déjà gagnée n'aurait jamais dû modifier le budget.");
}
console.log("✅ Retoucher une prime déjà gagnée avant l'abandon du tutoriel n'entraîne aucune double dépense (protection serveur/moteur, pas seulement le bouton masqué).");
await flush(dom2);
await dom2.window.close();
server2.close();

// --- Ligue PARTAGÉE (retour utilisateur, 2026-09 : "Mets les vrais primes
// sur le tutoriel") : saveMyTeam() ne persiste rien pour ce mode (voir son
// commentaire), donc onboardingTourCompleted ET les primes du tutoriel
// passent chacun par leur propre point d'entrée serveur dédié
// (syncOnboardingTourCompletedToServer / performTutorialRewardClaim, voir
// server/actions.js:setOnboardingTourCompleted/claimTutorialReward) : sans
// ça, le bouton "Lancer le tutoriel" réapparaîtrait à chaque rechargement
// pour un manager de ligue partagée, et les primes ne seraient jamais
// réellement créditées. ---
console.log("\n--- Test : tutoriel en ligue partagée (round-trip serveur) ---");
const leagueShared = generateMultiManagerLeague(["Lyon TourShared"], 1, Date.now(), dailyAnchoredCalendarConfig());
const managerToken = leagueShared.teams[0].managerLinkToken;
if (!managerToken) throw new Error("❌ (setup) l'équipe humaine devrait porter un managerLinkToken.");
const { server: server3, multiSavePath: multiSavePath3, baseUrl: baseUrl3 } = await startTestServer();
await store.saveMultiLeague(leagueShared, multiSavePath3);

const dom3 = await openGame(html, `${baseUrl3}?m=${managerToken}`);
const doc3 = dom3.window.document;
const win3 = dom3.window;
const budgetBeforeShared = win3.eval("teamA.budget");
[...doc3.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "guide").click();
doc3.getElementById("tourLaunchBtn").click();
doc3.getElementById("tourNextBtn").dispatchEvent(new win3.Event("click", { bubbles: true })); // écran d'accueil -> "Effectif" (à prime)
await flushTourNext(dom3);
doc3.getElementById("tourNextBtn").dispatchEvent(new win3.Event("click", { bubbles: true })); // valide "Effectif" via un vrai round-trip serveur
await flushTourNext(dom3);
const budgetAfterSharedClaim = win3.eval("teamA.budget");
if (budgetAfterSharedClaim !== budgetBeforeShared + 15000) {
  throw new Error(`❌ RÉGRESSION : la prime "Effectif" devrait être créditée via le serveur en ligue partagée, budget obtenu ${budgetAfterSharedClaim} au lieu de ${budgetBeforeShared + 15000}.`);
}
// Vérifie directement le fichier de sauvegarde serveur (pas seulement ce
// que la session affiche localement) : le crédit doit avoir été réellement
// ÉCRIT sur disque par le round-trip ci-dessus.
const savedShared1 = (await store.loadMultiLeague(multiSavePath3)).league;
if (savedShared1.teams[0].budget !== budgetAfterSharedClaim || !savedShared1.teams[0].tutorialRewardsClaimed.includes("Effectif")) {
  throw new Error(`❌ RÉGRESSION : la prime du tutoriel devrait être persistée sur le fichier de sauvegarde serveur, obtenu budget=${savedShared1.teams[0].budget}, tutorialRewardsClaimed=${JSON.stringify(savedShared1.teams[0].tutorialRewardsClaimed)}.`);
}
console.log("✅ La prime du tutoriel est bien créditée ET persistée sur le serveur en ligue partagée.");

const skipBtn3 = doc3.querySelector("#tourSkipBtn");
skipBtn3.dispatchEvent(new win3.Event("click", { bubbles: true }));
dom3.window.close();

// Deuxième session indépendante (= un rechargement complet de la page) sur
// le MÊME serveur : le bouton doit rester masqué ET la prime ne doit
// jamais pouvoir être retouchée, exactement comme en solo.
const dom4 = await openGame(html, `${baseUrl3}?m=${managerToken}`);
const doc4 = dom4.window.document;
const win4 = dom4.window;
[...doc4.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "guide").click();
const launchBtnShared2 = doc4.getElementById("tourLaunchBtn");
if (!launchBtnShared2 || !launchBtnShared2.classList.contains("hidden")) {
  throw new Error("❌ RÉGRESSION : en ligue partagée, le bouton \"Lancer le tutoriel\" devrait rester masqué après un rechargement de page (onboardingTourCompleted non persisté côté serveur ?).");
}
const doubleClaimShared = await win4.eval(`performTutorialRewardClaim("Effectif")`);
if (doubleClaimShared.alreadyClaimed !== true || doubleClaimShared.amount !== 0) {
  throw new Error(`❌ RÉGRESSION : retoucher la prime "Effectif" depuis une nouvelle session de ligue partagée devrait être idempotent côté serveur, obtenu ${JSON.stringify(doubleClaimShared)}.`);
}
if (win4.eval("teamA.budget") !== budgetAfterSharedClaim) {
  throw new Error("❌ RÉGRESSION : retoucher une prime déjà gagnée en ligue partagée n'aurait jamais dû modifier le budget.");
}
console.log("✅ En ligue partagée aussi : bouton masqué et prime non retouchable après un rechargement de page complet.");
dom4.window.close();
server3.close();

server.close();
console.log("\n🏁 Tous les tests onboarding_tour_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
