// Vérifie la route POST /api/admin/credit-team (retour utilisateur, 2026-09 :
// "Et pour Ariane crédite le de 200k comme il ne pourra pas refaire le
// tuto") : rattrapage manuel du budget d'une équipe de la ligue partagée,
// authentifié par le même secret X-Admin-Token que les routes
// /api/admin/new-multi-league et /api/admin/reset-multi-league, plutôt qu'un
// correctif codé en dur réservé à Ariane.
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
    const league = generateMultiManagerLeague(["Ariane FC", "Autre Club"], 2, T0, dailyAnchoredCalendarConfig());
    const ariane = league.teams.find(t => t.name === "Ariane FC");
    ariane.onboardingTourCompleted = true; // a déjà fini le tutoriel avant le correctif des vraies primes
    const budgetBefore = ariane.budget;

    const { server, multiSavePath, baseUrl } = await startTestServer(() => T0);
    await store.saveMultiLeague(league, multiSavePath);

    // --- Sans BASKET_ADMIN_TOKEN défini côté serveur, toute requête admin
    // est refusée, même avec un en-tête envoyé (même garde-fou que les deux
    // autres routes admin, voir server/index_test.js).
    delete process.env.BASKET_ADMIN_TOKEN;
    const noEnv = await fetch(`${baseUrl}api/admin/credit-team`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": "peu-importe" },
      body: JSON.stringify({ teamName: "Ariane FC", amount: 200000 }),
    });
    if (noEnv.status !== 403) throw new Error(`❌ Sans BASKET_ADMIN_TOKEN défini, la route devrait répondre 403, obtenu ${noEnv.status}.`);
    console.log("✅ La route est désactivée (403) quand BASKET_ADMIN_TOKEN n'est pas défini côté serveur.");

    process.env.BASKET_ADMIN_TOKEN = "secret-admin-credit";

    // --- Mauvais jeton -> 403.
    const wrongToken = await fetch(`${baseUrl}api/admin/credit-team`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": "pas-le-bon" },
      body: JSON.stringify({ teamName: "Ariane FC", amount: 200000 }),
    });
    if (wrongToken.status !== 403) throw new Error(`❌ Un mauvais X-Admin-Token devrait répondre 403, obtenu ${wrongToken.status}.`);
    console.log("✅ Un mauvais X-Admin-Token est rejeté (403).");

    // --- Équipe inconnue -> 404, budget inchangé.
    const unknownTeam = await fetch(`${baseUrl}api/admin/credit-team`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": "secret-admin-credit" },
      body: JSON.stringify({ teamName: "Club Fantôme", amount: 200000 }),
    });
    if (unknownTeam.status !== 404) throw new Error(`❌ Un nom d'équipe inconnu devrait répondre 404, obtenu ${unknownTeam.status}.`);
    console.log("✅ Un nom d'équipe inconnu dans la ligue partagée répond 404.");

    // --- Montant invalide -> 400.
    const badAmount = await fetch(`${baseUrl}api/admin/credit-team`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": "secret-admin-credit" },
      body: JSON.stringify({ teamName: "Ariane FC", amount: 0 }),
    });
    if (badAmount.status !== 400) throw new Error(`❌ Un montant nul/invalide devrait répondre 400, obtenu ${badAmount.status}.`);
    console.log("✅ Un montant nul ou invalide répond 400.");

    // --- Crédit réel : 200 000 € pour Ariane FC, avec un motif explicite.
    const credit = await fetch(`${baseUrl}api/admin/credit-team`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": "secret-admin-credit" },
      body: JSON.stringify({ teamName: "Ariane FC", amount: 200000, label: "Rattrapage primes tutoriel (bug historique)" }),
    });
    const creditBody = await credit.json();
    console.log("Réponse du crédit :", JSON.stringify(creditBody));
    if (credit.status !== 200 || !creditBody.ok) throw new Error(`❌ Un crédit valide devrait répondre 200/ok, obtenu ${credit.status}.`);
    if (creditBody.budget !== budgetBefore + 200000) {
      throw new Error(`❌ Le budget renvoyé devrait être ${budgetBefore + 200000}, obtenu ${creditBody.budget}.`);
    }

    // --- Persisté sur le fichier de sauvegarde serveur (pas seulement dans
    // la réponse HTTP), et apparaît dans le journal des transactions
    // (recordTransaction, voir Team.transactions).
    const saved = (await store.loadMultiLeague(multiSavePath)).league;
    const arianeSaved = saved.teams.find(t => t.name === "Ariane FC");
    if (arianeSaved.budget !== budgetBefore + 200000) {
      throw new Error(`❌ RÉGRESSION : le crédit devrait être persisté sur le fichier de sauvegarde serveur, obtenu ${arianeSaved.budget} au lieu de ${budgetBefore + 200000}.`);
    }
    const lastTx = arianeSaved.transactions[0];
    if (!lastTx || lastTx.amount !== 200000 || lastTx.label !== "Rattrapage primes tutoriel (bug historique)") {
      throw new Error(`❌ Le crédit devrait apparaître dans le journal des transactions avec le bon motif, obtenu ${JSON.stringify(lastTx)}.`);
    }
    // L'autre équipe de la ligue n'a jamais dû être touchée.
    const autreSaved = saved.teams.find(t => t.name === "Autre Club");
    if (autreSaved.transactions[0] && autreSaved.transactions[0].label === "Rattrapage primes tutoriel (bug historique)") {
      throw new Error("❌ RÉGRESSION : le crédit ne devrait toucher QUE l'équipe nommée, jamais une autre équipe de la ligue.");
    }
    console.log(`✅ Le crédit de 200 000 € est bien appliqué, persisté sur le serveur, journalisé dans les transactions d'Ariane FC uniquement (budget : ${budgetBefore} -> ${arianeSaved.budget}).`);

    // --- Sans conséquence sur onboardingTourCompleted (déjà à true, Ariane
    // ne doit toujours pas pouvoir relancer le tutoriel pour retoucher la
    // prime une deuxième fois).
    if (!arianeSaved.onboardingTourCompleted) {
      throw new Error("❌ Le crédit manuel n'aurait jamais dû toucher onboardingTourCompleted.");
    }
    console.log("✅ onboardingTourCompleted reste inchangé (toujours vrai) : le tutoriel reste marqué comme fait, pas de retouche possible.");

    server.close();
    console.log("\n🏁 Tous les tests admin_credit_team_test.js sont passés.");
  } finally {
    if (prevAdminToken === undefined) delete process.env.BASKET_ADMIN_TOKEN;
    else process.env.BASKET_ADMIN_TOKEN = prevAdminToken;
  }
})().catch(e => { console.error(e); process.exit(1); });
