// Vérifie la route POST /api/admin/reset-onboarding-tour (retour utilisateur
// Discord, 2026-09 : "Skyzer10" bloqué hors du tutoriel après un aller-retour
// dedans, plus aucun accès au bouton "Lancer le tutoriel" dans le Guide) :
// contrairement à /api/admin/credit-team (voir admin_credit_team_test.js, déjà
// utilisée une première fois pour Ariane comme bricolage), cette route rend
// RÉELLEMENT l'accès au tutoriel (onboardingTourCompleted remis à `false`) au
// lieu de se contenter de compenser en argent, sans jamais permettre de
// retoucher une prime déjà réellement créditée (Team.tutorialRewardsClaimed
// intact). Même authentification (X-Admin-Token) et même portée (ligue
// PARTAGÉE uniquement) que les autres routes admin.
const Engine = require("./engine.js");
const { generateMultiManagerLeague } = Engine;
const Calendar = require("./server/calendar.js");
const { dailyAnchoredCalendarConfig } = Calendar;
const store = require("./server/store.js");
const { startTestServer } = require("./test_helpers.js");

const T0 = Date.UTC(2026, 8, 22, 7, 0, 0);

(async () => {
  const prevAdminToken = process.env.BASKET_ADMIN_TOKEN;
  try {
    const league = generateMultiManagerLeague(["Skyzer10 BC", "Autre Club"], 2, T0, dailyAnchoredCalendarConfig());
    const skyzer = league.teams.find(t => t.name === "Skyzer10 BC");
    skyzer.onboardingTourCompleted = true; // bloqué après un aller-retour dans le tutoriel
    skyzer.tutorialRewardsClaimed = ["Effectif", "Ordres"]; // deux thèmes déjà réellement payés avant le blocage
    const budgetBefore = skyzer.budget;

    const { server, multiSavePath, baseUrl } = await startTestServer(() => T0);
    await store.saveMultiLeague(league, multiSavePath);

    // --- Sans BASKET_ADMIN_TOKEN défini côté serveur, toute requête admin
    // est refusée, même avec un en-tête envoyé (même garde-fou que les
    // autres routes admin, voir server/index_test.js).
    delete process.env.BASKET_ADMIN_TOKEN;
    const noEnv = await fetch(`${baseUrl}api/admin/reset-onboarding-tour`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": "peu-importe" },
      body: JSON.stringify({ teamName: "Skyzer10 BC" }),
    });
    if (noEnv.status !== 403) throw new Error(`❌ Sans BASKET_ADMIN_TOKEN défini, la route devrait répondre 403, obtenu ${noEnv.status}.`);
    console.log("✅ La route est désactivée (403) quand BASKET_ADMIN_TOKEN n'est pas défini côté serveur.");

    process.env.BASKET_ADMIN_TOKEN = "secret-admin-reset-tour";

    // --- Mauvais jeton -> 403.
    const wrongToken = await fetch(`${baseUrl}api/admin/reset-onboarding-tour`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": "pas-le-bon" },
      body: JSON.stringify({ teamName: "Skyzer10 BC" }),
    });
    if (wrongToken.status !== 403) throw new Error(`❌ Un mauvais X-Admin-Token devrait répondre 403, obtenu ${wrongToken.status}.`);
    console.log("✅ Un mauvais X-Admin-Token est rejeté (403).");

    // --- Équipe inconnue -> 404, rien touché.
    const unknownTeam = await fetch(`${baseUrl}api/admin/reset-onboarding-tour`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": "secret-admin-reset-tour" },
      body: JSON.stringify({ teamName: "Club Fantôme" }),
    });
    if (unknownTeam.status !== 404) throw new Error(`❌ Un nom d'équipe inconnu devrait répondre 404, obtenu ${unknownTeam.status}.`);
    console.log("✅ Un nom d'équipe inconnu dans la ligue partagée répond 404.");

    // --- 'teamName' manquant -> 400.
    const missingName = await fetch(`${baseUrl}api/admin/reset-onboarding-tour`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": "secret-admin-reset-tour" },
      body: JSON.stringify({}),
    });
    if (missingName.status !== 400) throw new Error(`❌ 'teamName' manquant devrait répondre 400, obtenu ${missingName.status}.`);
    console.log("✅ 'teamName' manquant répond 400.");

    // --- Reset réel : onboardingTourCompleted repasse à false pour Skyzer10 BC.
    const reset = await fetch(`${baseUrl}api/admin/reset-onboarding-tour`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": "secret-admin-reset-tour" },
      body: JSON.stringify({ teamName: "Skyzer10 BC" }),
    });
    const resetBody = await reset.json();
    console.log("Réponse du reset :", JSON.stringify(resetBody));
    if (reset.status !== 200 || !resetBody.ok) throw new Error(`❌ Un reset valide devrait répondre 200/ok, obtenu ${reset.status}.`);
    if (resetBody.onboardingTourCompleted !== false) {
      throw new Error(`❌ La réponse devrait renvoyer onboardingTourCompleted: false, obtenu ${resetBody.onboardingTourCompleted}.`);
    }

    // --- Persisté sur le fichier de sauvegarde serveur (pas seulement dans
    // la réponse HTTP).
    const saved = (await store.loadMultiLeague(multiSavePath)).league;
    const skyzerSaved = saved.teams.find(t => t.name === "Skyzer10 BC");
    if (skyzerSaved.onboardingTourCompleted !== false) {
      throw new Error(`❌ RÉGRESSION : le reset devrait être persisté sur le fichier de sauvegarde serveur, obtenu onboardingTourCompleted=${skyzerSaved.onboardingTourCompleted}.`);
    }
    console.log("✅ onboardingTourCompleted repasse bien à false, persisté sur le serveur : le bouton \"Lancer le tutoriel\" va réapparaître.");

    // --- Le budget et les primes déjà gagnées ne sont JAMAIS touchés
    // (protection anti-double-dépense inchangée, voir claimTutorialReward) :
    // rejouer le tutoriel plus tard ne doit pas pouvoir re-créditer Effectif
    // ni Ordres.
    if (skyzerSaved.budget !== budgetBefore) {
      throw new Error(`❌ RÉGRESSION : le reset ne devrait JAMAIS toucher le budget, obtenu ${skyzerSaved.budget} au lieu de ${budgetBefore}.`);
    }
    if (!skyzerSaved.tutorialRewardsClaimed.includes("Effectif") || !skyzerSaved.tutorialRewardsClaimed.includes("Ordres") || skyzerSaved.tutorialRewardsClaimed.length !== 2) {
      throw new Error(`❌ RÉGRESSION : tutorialRewardsClaimed devrait rester intact (Effectif, Ordres), obtenu ${JSON.stringify(skyzerSaved.tutorialRewardsClaimed)}.`);
    }
    console.log("✅ Le budget et les primes déjà réellement créditées (Effectif, Ordres) restent intacts : seul le PARCOURS peut être refait, jamais l'argent regagné.");

    // --- L'autre équipe de la ligue n'a jamais dû être touchée.
    const autreSaved = saved.teams.find(t => t.name === "Autre Club");
    if (autreSaved.onboardingTourCompleted) {
      throw new Error("❌ RÉGRESSION : le reset ne devrait toucher QUE l'équipe nommée, jamais une autre équipe de la ligue.");
    }
    console.log("✅ Le reset ne touche que l'équipe nommée, jamais les autres équipes de la ligue partagée.");

    server.close();
    console.log("\n🏁 Tous les tests admin_reset_onboarding_tour_test.js sont passés.");
  } finally {
    if (prevAdminToken === undefined) delete process.env.BASKET_ADMIN_TOKEN;
    else process.env.BASKET_ADMIN_TOKEN = prevAdminToken;
  }
})().catch(e => { console.error(e); process.exit(1); });
