// Vérifie le marché des entraîneurs (retour utilisateur : "l'entraineur doit
// être acheté comme un joueur sur un espece de marche des entraineurs. c'est
// une vente aux enchères. son salaire doit augmenter toutes les semaines
// pour forcer à changer regulierement d'entraineur.") : même mécanique
// D'ENCHÈRES en temps réel que le marché des transferts existant (voir
// transfer_market_test.js), mais SANS vendeur — les candidats sont générés
// par le marché lui-même (League.generateCoachCandidate), et la mise
// gagnante devient le salaire de DÉPART du nouvel entraîneur (pas un débit
// ponctuel en plus) : la croissance hebdomadaire déjà en place
// (TRAINER_WEEKLY_GROWTH, voir salary_test.js) n'est pas touchée — c'est
// elle, combinée à l'obligation de repasser par une enchère pour recruter,
// qui "force à changer régulièrement d'entraîneur" comme demandé.
const E = require("./engine.js");
const {
  generateTeam, generateLeague, serializeTeam, teamFromSave, serializeLeague, leagueFromSave,
  minNextBidFor, trainerWeeklySalary,
  TRAINER_LEVELS, TRAINER_BASE_SALARY,
  COACH_AUCTION_DURATION_MS, COACH_MARKET_MIN_OPEN_LISTINGS, COACH_MARKET_GENERATE_CHECK_INTERVAL_MS,
} = E;

function freshLeague(budget = 5000000) {
  const user = generateTeam("User", 1.0);
  user.budget = budget;
  const lg = generateLeague(user, 1);
  lg.teams[0].budget = budget;
  return lg;
}

// Fige Math.random() sur une valeur fixe le temps d'un appel — comme dans
// transfer_market_test.js, pour rendre déterministe l'activité CPU (niveau
// tiré au sort, décision de miser) sans changer le fonctionnement réel.
function withMockedRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = orig; }
}

// ---------------------------------------------------------------------
// Partie 1 : generateCoachCandidate — un candidat valide, à la bonne durée.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const now = Date.now();
  const listing = lg.generateCoachCandidate(now);
  console.log("\nCandidat généré :", listing.status, "niveau", listing.level, "prix de départ", listing.startPrice);
  if (!listing || listing.status !== "open") throw new Error("❌ generateCoachCandidate devrait créer une annonce ouverte.");
  if (!TRAINER_LEVELS.includes(listing.level)) throw new Error("❌ Le niveau généré devrait être un niveau d'entraîneur valide (1 à 5).");
  if (listing.startPrice !== TRAINER_BASE_SALARY[listing.level]) throw new Error("❌ Le prix de départ devrait être le tarif fixe TRAINER_BASE_SALARY du niveau tiré.");
  if (listing.closesAt - listing.createdAt !== COACH_AUCTION_DURATION_MS) throw new Error("❌ La durée de l'enchère devrait être exactement COACH_AUCTION_DURATION_MS.");
  if (listing.currentBid !== null || listing.currentBidderIdx !== null) throw new Error("❌ Un candidat tout juste généré ne devrait avoir aucune enchère.");
  if (!lg.coachListings.includes(listing)) throw new Error("❌ Le candidat généré devrait être poussé dans league.coachListings.");
  console.log("✅ Un candidat entraîneur valide est généré, à la bonne durée, sans enchère initiale.");
}
{
  // Biais vers les niveaux bas : sur un grand nombre de tirages, le niveau 5
  // (poids 4/100) doit rester nettement plus rare que le niveau 1 (poids
  // 40/100) — pas une preuve statistique rigoureuse, juste un garde-fou
  // contre une inversion du biais (poids mal branchés).
  const lg = freshLeague();
  const now = Date.now();
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let i = 0; i < 2000; i++) counts[lg.generateCoachCandidate(now).level]++;
  console.log("\nRépartition des niveaux sur 2000 tirages :", counts);
  if (counts[1] <= counts[5]) throw new Error("❌ Le niveau 1 devrait être généré nettement plus souvent que le niveau 5 (biais vers les niveaux bas).");
  if (counts[5] > counts[1] / 3) throw new Error("❌ Le niveau 5 devrait rester rare comparé au niveau 1 (biais vers les niveaux bas insuffisant).");
  console.log("✅ La génération de candidats est bien biaisée vers les niveaux bas, un niveau 5 restant rare.");
}

// ---------------------------------------------------------------------
// Partie 2 : placeCoachBid — garde-fous.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const now = Date.now();
  const listing = lg.generateCoachCandidate(now);

  const tooLow = lg.placeCoachBid(listing.id, 0, listing.startPrice - 1, now + 10);
  console.log("\nEnchère trop basse refusée :", tooLow.ok === false, tooLow.reason, "minBid:", tooLow.minBid);
  if (tooLow.ok !== false || tooLow.reason !== "too-low" || tooLow.minBid !== listing.startPrice) {
    throw new Error("❌ Une enchère sous le prix de départ devrait être refusée avec le bon minimum.");
  }

  const okBid = lg.placeCoachBid(listing.id, 0, listing.startPrice, now + 20);
  console.log("Enchère valide au prix de départ exact acceptée :", okBid.ok);
  if (!okBid.ok) throw new Error("❌ Une enchère au prix de départ exact devrait être acceptée.");
  if (listing.currentBid !== listing.startPrice || listing.currentBidderIdx !== 0) {
    throw new Error("❌ L'enchère actuelle et l'enchérisseur devraient être mis à jour.");
  }

  const belowIncrement = lg.placeCoachBid(listing.id, 1, listing.currentBid + 1, now + 30);
  console.log("Enchère sous l'incrément minimum refusée :", belowIncrement.ok === false, "minBid:", belowIncrement.minBid);
  if (belowIncrement.ok !== false || belowIncrement.reason !== "too-low") {
    throw new Error("❌ L'incrément minimum devrait s'appliquer à l'enchère suivante, comme sur le marché des transferts.");
  }
  console.log("✅ Refus systématique sous le prix de départ/l'incrément minimum ; acceptation correcte sinon.");
}
{
  // Contrairement au marché des transferts (placeBid) : PAS de "own-listing"
  // (personne ne possède un candidat entraîneur), même le club du joueur
  // peut relancer sur un candidat sur lequel il est déjà en tête — même si
  // l'UI ne lui en laisse pas l'occasion (il n'affiche pas de bouton
  // d'enchère quand il est déjà en tête), l'API elle-même ne doit pas
  // refuser explicitement pour cette raison.
  const lg = freshLeague();
  const now = Date.now();
  const listing = lg.generateCoachCandidate(now);
  lg.placeCoachBid(listing.id, 0, listing.startPrice, now + 10);
  const relance = lg.placeCoachBid(listing.id, 0, minNextBidFor(listing), now + 20);
  console.log("\nRelance du club du joueur sur son propre candidat en tête acceptée :", relance.ok === true, relance.reason || "");
  if (!relance.ok) throw new Error("❌ Il ne devrait pas y avoir de refus 'own-listing' sur le marché des entraîneurs (personne ne possède un candidat).");
  console.log("✅ Pas de blocage 'own-listing' sur le marché des entraîneurs.");
}
{
  const lg = freshLeague(500); // budget très faible
  const now = Date.now();
  const listing = lg.generateCoachCandidate(now);
  const res = lg.placeCoachBid(listing.id, 0, listing.startPrice, now + 10);
  console.log("\nBudget insuffisant (club du joueur) refusé :", res.ok === false, res.reason);
  if (res.ok !== false || res.reason !== "insufficient-budget") throw new Error("❌ Le club du joueur devrait être bloqué par son budget réel.");

  // Une équipe CPU n'est PAS bloquée par un budget réaliste (même logique
  // que le marché des transferts — voir placeBid).
  lg.teams[3].budget = 1;
  const cpuRes = lg.placeCoachBid(listing.id, 3, listing.startPrice, now + 20);
  console.log("Enchère CPU acceptée malgré un budget CPU dérisoire :", cpuRes.ok === true);
  if (!cpuRes.ok) throw new Error("❌ Une équipe CPU ne devrait pas être bloquée par son champ budget (non suivi de façon réaliste pour les adversaires).");
  console.log("✅ Seul le club du joueur est bloqué par un budget insuffisant, pas les équipes CPU.");
}
{
  const lg = freshLeague();
  const now = Date.now();
  const listing = lg.generateCoachCandidate(now);
  const res = lg.placeCoachBid(listing.id, 0, listing.startPrice, now + COACH_AUCTION_DURATION_MS + 1);
  console.log("\nEnchère après échéance refusée :", res.ok === false, res.reason);
  if (res.ok !== false || res.reason !== "closed") throw new Error("❌ Une enchère après l'échéance devrait être refusée.");
  const bogus = lg.placeCoachBid(999999999, 0, 1000, now);
  console.log("Enchère sur un id inexistant refusée :", bogus.ok === false, bogus.reason);
  if (bogus.ok !== false || bogus.reason !== "closed") throw new Error("❌ Un id de candidat inexistant devrait être refusé comme 'closed'.");
  console.log("✅ Impossible d'enchérir après l'échéance des 3 jours, ni sur un candidat inexistant.");
}

// ---------------------------------------------------------------------
// Partie 3 : résolution d'une enchère — la mise gagnante devient le SALAIRE
// DE DÉPART (baseSalary), PAS un débit ponctuel en plus (voir la consigne
// explicite du design : le salaire hebdomadaire progressif EST le coût de
// l'enchère).
// ---------------------------------------------------------------------
{
  const lg = freshLeague(5000000);
  const now = Date.now();
  const listing = lg.generateCoachCandidate(now);
  const bidAmount = listing.startPrice + 4321;
  const bidRes = lg.placeCoachBid(listing.id, 0, bidAmount, now + 500);
  if (!bidRes.ok) throw new Error("❌ L'enchère de préparation du scénario aurait dû réussir.");
  const budgetBefore = lg.teams[0].budget;

  withMockedRandom(0.999999, () => {
    // Math.random figé haut : aucune enchère CPU concurrente ne se
    // déclenche (>= COACH_CPU_BID_CHANCE), le club du joueur l'emporte donc
    // forcément avec sa seule enchère.
    lg.refreshCoachMarket(now + COACH_AUCTION_DURATION_MS + 100);
  });
  console.log(`\nRésolution "le club du joueur gagne" — statut : ${listing.status}/${listing.result}, prix final : ${listing.finalPrice}`);
  if (listing.status !== "closed" || listing.result !== "sold" || listing.finalPrice !== bidAmount) {
    throw new Error("❌ L'enchère devrait se conclure vendue, au montant exact enchéri.");
  }
  const trainer = lg.teams[0].trainer;
  console.log("Entraîneur du club après résolution :", trainer);
  if (!trainer || trainer.level !== listing.level || trainer.baseSalary !== bidAmount || trainer.weeksEmployed !== 0) {
    throw new Error("❌ buyer.trainer devrait être { level: <niveau du candidat>, baseSalary: <mise gagnante>, weeksEmployed: 0 }.");
  }
  // AUCUN débit ponctuel : seul le budget reste inchangé à la résolution
  // elle-même (le salaire hebdomadaire, lui, est prélevé plus tard par
  // Team.trainWeek, hors de portée de ce test).
  if (lg.teams[0].budget !== budgetBefore) {
    throw new Error("❌ Aucune transaction ponctuelle ne devrait débiter le budget à la résolution : la mise gagnante devient le salaire de départ, pas un achat comptant.");
  }
  if (lg.teams[0].transactions.some(t => /entra[iî]neur/i.test(t.label))) {
    throw new Error("❌ Aucune transaction 'recrutement d'entraîneur' ne devrait être journalisée pour l'acquisition elle-même (le coût, c'est le salaire hebdomadaire qui grimpe).");
  }
  console.log("✅ La mise gagnante devient le salaire de départ (baseSalary) du nouvel entraîneur, sans débit ponctuel en plus.");
}
{
  // Aucune enchère du tout : le candidat reste invendu.
  const lg = freshLeague();
  const now = Date.now();
  const listing = lg.generateCoachCandidate(now);
  withMockedRandom(0.999999, () => {
    lg.refreshCoachMarket(now + COACH_AUCTION_DURATION_MS + 100);
  });
  console.log(`\nRésolution "invendu" — statut : ${listing.status}/${listing.result}`);
  if (listing.status !== "closed" || listing.result !== "unsold") throw new Error("❌ Un candidat sans aucune enchère devrait rester invendu.");
  console.log("✅ Un candidat sans enchère reste invendu (aucun impact sur l'équipe).");
}
{
  // Remplacement SANS indemnité : un club qui a déjà un entraîneur et
  // remporte une nouvelle enchère voit son ancien entraîneur simplement
  // remplacé, gratuitement — comme fireTrainer() aujourd'hui.
  const lg = freshLeague(5000000);
  const now = Date.now();
  lg.teams[0].hireTrainer(2, 1500);
  const budgetBefore = lg.teams[0].budget;
  const listing = lg.generateCoachCandidate(now);
  lg.placeCoachBid(listing.id, 0, listing.startPrice, now + 10);
  withMockedRandom(0.999999, () => {
    lg.refreshCoachMarket(now + COACH_AUCTION_DURATION_MS + 100);
  });
  console.log(`\nRemplacement d'un entraîneur déjà en poste — nouveau niveau : ${lg.teams[0].trainer.level}, budget inchangé : ${lg.teams[0].budget === budgetBefore}`);
  if (lg.teams[0].trainer.level !== listing.level) throw new Error("❌ L'entraîneur du club devrait être remplacé par le nouveau candidat gagné.");
  if (lg.teams[0].budget !== budgetBefore) throw new Error("❌ Le remplacement d'un entraîneur par un autre (enchère gagnée) ne devrait débiter aucune indemnité.");
  console.log("✅ Un entraîneur déjà en poste est simplement remplacé par le nouveau, sans indemnité de départ.");
}
{
  // Cas limite (miroir de _resolveListing) : le club du joueur perd les
  // moyens ENTRE l'enchère et la clôture -> "buyer-failed", pas d'entraîneur
  // attribué.
  const lg = freshLeague(50000);
  const now = Date.now();
  const listing = lg.generateCoachCandidate(now);
  lg.placeCoachBid(listing.id, 0, listing.startPrice, now + 500);
  lg.teams[0].budget = 1; // s'effondre avant la clôture
  withMockedRandom(0.999999, () => {
    lg.refreshCoachMarket(now + COACH_AUCTION_DURATION_MS + 100);
  });
  console.log(`\nÉchec de l'acheteur à la clôture (budget effondré entre-temps) — statut : ${listing.status}/${listing.result}`);
  if (listing.result !== "buyer-failed") throw new Error("❌ Un acheteur qui n'a plus les moyens à la clôture devrait faire échouer la vente (buyer-failed).");
  if (lg.teams[0].trainer) throw new Error("❌ Aucun entraîneur ne devrait être attribué si l'achat échoue à la clôture.");
  console.log("✅ Un acheteur qui n'a plus les moyens à la clôture ne conclut pas l'embauche.");
}

// ---------------------------------------------------------------------
// Partie 4 : trainerWeeklySalary grandit à partir du baseSalary GAGNÉ AUX
// ENCHÈRES, pas du tarif fixe TRAINER_BASE_SALARY[level] (sauf coïncidence).
// ---------------------------------------------------------------------
{
  const lg = freshLeague(5000000);
  const now = Date.now();
  const listing = lg.generateCoachCandidate(now);
  // Mise gagnante volontairement DIFFÉRENTE du tarif fixe, pour bien
  // distinguer "salaire de départ réel" de "TRAINER_BASE_SALARY[level]".
  const bidAmount = listing.startPrice + 7777;
  lg.placeCoachBid(listing.id, 0, bidAmount, now + 10);
  withMockedRandom(0.999999, () => {
    lg.refreshCoachMarket(now + COACH_AUCTION_DURATION_MS + 100);
  });
  const trainer = lg.teams[0].trainer;
  const level = trainer.level;

  for (const weeksEmployed of [0, 1, 3, 8]) {
    trainer.weeksEmployed = weeksEmployed;
    const actual = lg.teams[0].trainerSalary();
    const expectedFromBid = trainerWeeklySalary(level, weeksEmployed, bidAmount);
    const expectedFromFixedTarif = trainerWeeklySalary(level, weeksEmployed, TRAINER_BASE_SALARY[level]);
    console.log(`\nSemaine ${weeksEmployed} — salaire réel : ${actual} (attendu, croissance depuis la mise gagnante ${bidAmount} : ${expectedFromBid})`);
    if (actual !== expectedFromBid) {
      throw new Error(`❌ trainerSalary() devrait faire croître le salaire depuis le baseSalary GAGNÉ AUX ENCHÈRES (${bidAmount}), pas depuis TRAINER_BASE_SALARY[level] (${TRAINER_BASE_SALARY[level]}).`);
    }
    if (weeksEmployed > 0 && actual === expectedFromFixedTarif) {
      // Coïncidence extrêmement improbable vu le +7777 choisi ci-dessus,
      // gardé comme garde-fou explicite plutôt qu'une simple note.
      throw new Error("❌ Le salaire ne devrait normalement PAS coïncider avec la croissance depuis le tarif fixe par niveau (mise gagnante différente).");
    }
  }
  console.log("✅ Le salaire hebdomadaire grandit bien à partir du baseSalary gagné aux enchères, pas du tarif fixe par niveau.");
}

// ---------------------------------------------------------------------
// Partie 5 : le marché se renouvelle pour garder au moins
// COACH_MARKET_MIN_OPEN_LISTINGS candidats ouverts en permanence.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const now = Date.now();
  if (lg.coachListings.length !== 0) throw new Error("❌ Une ligue fraîchement générée ne devrait avoir aucun candidat entraîneur avant le premier refreshCoachMarket.");
  lg.refreshCoachMarket(now);
  const openAfterFirst = lg.coachListings.filter(l => l.status === "open").length;
  console.log(`\nAprès le premier refreshCoachMarket : ${openAfterFirst} candidat(s) ouvert(s) (attendu ${COACH_MARKET_MIN_OPEN_LISTINGS})`);
  if (openAfterFirst !== COACH_MARKET_MIN_OPEN_LISTINGS) {
    throw new Error(`❌ Le marché devrait se remplir jusqu'à COACH_MARKET_MIN_OPEN_LISTINGS (${COACH_MARKET_MIN_OPEN_LISTINGS}) candidats dès le premier appel.`);
  }

  // Un appel trop rapproché (avant COACH_MARKET_GENERATE_CHECK_INTERVAL_MS)
  // ne doit RIEN générer de plus — throttle, comme le marché des transferts.
  lg.refreshCoachMarket(now + 1000);
  const openAfterQuickRecheck = lg.coachListings.filter(l => l.status === "open").length;
  console.log(`Après un second appel rapproché : ${openAfterQuickRecheck} candidat(s) ouvert(s) (devrait être inchangé)`);
  if (openAfterQuickRecheck !== openAfterFirst) throw new Error("❌ Un second appel trop rapproché ne devrait générer aucun nouveau candidat (throttle).");

  // Un candidat résolu (fermé) fait baisser le nombre d'ouverts : le
  // prochain refreshCoachMarket, une fois l'intervalle de vérification
  // écoulé, devrait combler jusqu'au plancher à nouveau. On ferme le
  // candidat directement (plutôt que via closesAt) pour isoler l'étape
  // "renouvellement" de l'étape "résolution" (voir refreshCoachMarket :
  // dans UN SEUL appel, le renouvellement — étape 2 — précède la résolution
  // — étape 3 —, donc un candidat qui vient tout juste d'expirer n'est
  // comblé qu'à l'appel SUIVANT ; comportement volontairement identique au
  // marché des transferts).
  const someListing = lg.coachListings.find(l => l.status === "open");
  someListing.status = "closed";
  someListing.result = "unsold";
  const later = now + COACH_MARKET_GENERATE_CHECK_INTERVAL_MS + 100;
  lg.refreshCoachMarket(later);
  const openAfterRefill = lg.coachListings.filter(l => l.status === "open").length;
  console.log(`Après résolution d'un candidat puis nouveau refresh : ${openAfterRefill} candidat(s) ouvert(s) (attendu au moins ${COACH_MARKET_MIN_OPEN_LISTINGS})`);
  if (openAfterRefill < COACH_MARKET_MIN_OPEN_LISTINGS) {
    throw new Error("❌ Le marché devrait se reconstituer jusqu'au plancher après qu'un candidat a été résolu.");
  }
  console.log("✅ Le marché se maintient bien à au moins COACH_MARKET_MIN_OPEN_LISTINGS candidats ouverts, avec throttle correct entre deux vérifications.");
}

// ---------------------------------------------------------------------
// Partie 6 : League.fireTeamTrainer — retour utilisateur (2026-09) : "dès
// qu'un staff est viré parce que devenu trop cher, il faut qu'il retourne
// sur le marché avec un salaire baissé de 30%". Le renouvellement continu du
// marché lui-même (COACH_MARKET_MIN_OPEN_LISTINGS, voir Partie 5 ci-dessus)
// couvre déjà "génère régulièrement des personnels de staff" — cette partie
// ne teste QUE le relistage au congédiement.
// ---------------------------------------------------------------------
{
  // Cas normal : un entraîneur en poste depuis plusieurs semaines (salaire
  // ESCALADÉ, voir TRAINER_WEEKLY_GROWTH) est congédié -> relisté au niveau
  // du trainer congédié, à 70% de ce salaire escaladé (PAS 70% du tarif fixe
  // TRAINER_BASE_SALARY[level] d'un candidat neuf).
  const lg = freshLeague();
  const now = Date.now();
  lg.teams[0].hireTrainer(3, 5000); // baseSalary volontairement différent du tarif fixe
  lg.teams[0].trainer.weeksEmployed = 6; // fait grimper le salaire réel au-dessus du baseSalary
  const salaryBeforeFiring = lg.teams[0].trainerSalary();
  const listingsBefore = lg.coachListings.length;

  const result = lg.fireTeamTrainer(0, now);
  console.log(`\nCongédiement (salaire escaladé avant congédiement : ${salaryBeforeFiring}) — résultat :`, result);
  if (!result.ok || !result.relisted) throw new Error("❌ Congédier un entraîneur EN POSTE devrait réussir et le relister (ok:true, relisted:true).");
  if (lg.teams[0].trainer) throw new Error("❌ L'équipe ne devrait plus avoir d'entraîneur après fireTeamTrainer.");
  if (lg.teams[0].trainerSalary() !== 0) throw new Error("❌ trainerSalary() devrait retomber à 0 une fois l'entraîneur congédié.");

  const newListings = lg.coachListings.filter(l => l.status === "open");
  console.log("Annonces ouvertes avant/après :", listingsBefore, "/", newListings.length + (lg.coachListings.length - newListings.length));
  if (lg.coachListings.length !== listingsBefore + 1) throw new Error("❌ fireTeamTrainer devrait pousser EXACTEMENT une nouvelle annonce dans coachListings.");
  const relisted = lg.coachListings[lg.coachListings.length - 1];
  const expectedStartPrice = Math.max(1, Math.round(salaryBeforeFiring * 0.7));
  console.log(`Nouvelle annonce — niveau ${relisted.level} (attendu 3), prix de départ ${relisted.startPrice} (attendu ${expectedStartPrice})`);
  if (relisted.level !== 3) throw new Error("❌ Le niveau de la nouvelle annonce devrait être celui de l'entraîneur congédié (3).");
  if (relisted.startPrice !== expectedStartPrice) {
    throw new Error(`❌ Le prix de départ devrait être 70% du salaire ESCALADÉ juste avant congédiement (${expectedStartPrice}), obtenu ${relisted.startPrice}.`);
  }
  if (relisted.status !== "open" || relisted.currentBid !== null) throw new Error("❌ La nouvelle annonce devrait être ouverte, sans enchère initiale — même forme qu'un candidat généré normalement.");
  if (relisted.closesAt - relisted.createdAt !== COACH_AUCTION_DURATION_MS) throw new Error("❌ La nouvelle annonce devrait avoir la même durée d'enchère (COACH_AUCTION_DURATION_MS) qu'un candidat généré normalement.");
  console.log("✅ Congédier un entraîneur le reliste à -30% de son salaire déjà escaladé, même niveau, même forme d'annonce.");
}
{
  // Prix de départ borné à 1 minimum (jamais 0 ni négatif) — cas limite d'un
  // entraîneur congédié quasi immédiatement (salaire encore proche de 0 pour
  // un baseSalary très faible).
  const lg = freshLeague();
  const now = Date.now();
  lg.teams[0].hireTrainer(1, 1); // baseSalary quasi nul, weeksEmployed = 0
  const result = lg.fireTeamTrainer(0, now);
  const relisted = lg.coachListings[lg.coachListings.length - 1];
  console.log(`\nSalaire quasi nul avant congédiement — prix de départ relisté : ${relisted.startPrice} (attendu >= 1)`);
  if (!result.relisted || relisted.startPrice < 1) throw new Error("❌ Le prix de départ relisté devrait toujours être borné à au moins 1, jamais 0 ni négatif.");
  console.log("✅ Le prix de départ relisté reste borné à un minimum de 1.");
}
{
  // Pas d'entraîneur en poste : no-op propre côté marché — ok:true,
  // relisted:false, aucune annonce ajoutée. Ne doit JAMAIS être traité comme
  // une erreur (voir server/actions.js:fireTrainer, qui remonte ce même
  // résultat tel quel).
  const lg = freshLeague();
  const now = Date.now();
  if (lg.teams[0].trainer) throw new Error("❌ (setup) une équipe fraîchement générée ne devrait pas avoir d'entraîneur.");
  const listingsBefore = lg.coachListings.length;
  const result = lg.fireTeamTrainer(0, now);
  console.log("\nCongédiement sans entraîneur en poste — résultat :", result, "| annonces avant/après :", listingsBefore, "/", lg.coachListings.length);
  if (!result.ok || result.relisted) throw new Error("❌ Sans entraîneur en poste, fireTeamTrainer devrait renvoyer { ok: true, relisted: false } (no-op propre, pas une erreur).");
  if (lg.coachListings.length !== listingsBefore) throw new Error("❌ Sans entraîneur en poste, aucune nouvelle annonce ne devrait être créée.");
  console.log("✅ Congédier alors qu'aucun entraîneur n'est en poste est un no-op propre (ok:true, relisted:false), sans annonce fantôme.");
}

// ---------------------------------------------------------------------
// Partie 7 : persistance — coachListings et le baseSalary d'un entraîneur
// survivent à un aller-retour sérialisation/désérialisation (voir le
// correctif sur teamFromSave : baseSalary était auparavant perdu au
// chargement, silencieusement, faisant retomber trainerSalary() sur le
// tarif fixe par niveau à chaque rechargement de page).
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const now = Date.now();
  lg.refreshCoachMarket(now); // peuple lg.coachListings
  lg.teams[0].hireTrainer(4, 9999); // baseSalary volontairement != TRAINER_BASE_SALARY[4]

  const savedTeam = serializeTeam(lg.teams[0]);
  const savedLeague = serializeLeague(lg);
  const teamBack = teamFromSave(savedTeam);
  const lgBack = leagueFromSave(savedLeague, teamBack);

  console.log("\ncoachListings avant :", lg.coachListings.length, "| après round-trip :", lgBack.coachListings.length);
  if (lgBack.coachListings.length !== lg.coachListings.length) throw new Error("❌ league.coachListings devrait survivre intégralement à un aller-retour de sauvegarde.");
  if (JSON.stringify(lgBack.coachListings.map(l => l.id).sort()) !== JSON.stringify(lg.coachListings.map(l => l.id).sort())) {
    throw new Error("❌ Les candidats sauvegardés devraient être les mêmes (mêmes id) après rechargement.");
  }

  console.log("trainer.baseSalary avant :", lg.teams[0].trainer.baseSalary, "| après round-trip :", teamBack.trainer.baseSalary);
  if (teamBack.trainer.baseSalary !== 9999) throw new Error("❌ trainer.baseSalary (9999, différent du tarif fixe) devrait survivre à un aller-retour de sauvegarde.");
  if (teamBack.trainerSalary() !== trainerWeeklySalary(4, 0, 9999)) {
    throw new Error("❌ Le salaire recalculé après rechargement devrait utiliser le baseSalary restauré (9999), pas le tarif fixe TRAINER_BASE_SALARY[4].");
  }
  console.log("✅ coachListings et le baseSalary d'un entraîneur survivent intégralement à un aller-retour de sauvegarde.");
}
{
  // Compatibilité ascendante : une VIEILLE sauvegarde (d'avant cette
  // fonctionnalité) n'a pas de coachListings ni de trainer.baseSalary —
  // teamFromSave/leagueFromSave doivent combler ces trous sans planter,
  // avec un salaire de départ qui retombe sur le tarif fixe du niveau (seul
  // repli raisonnable, faute de trace de la mise réellement payée à
  // l'époque).
  const lg = freshLeague();
  lg.teams[0].hireTrainer(3); // ancien style : pas de baseSalary explicite (voir hireTrainer)
  const oldStyleSavedTeam = serializeTeam(lg.teams[0]);
  delete oldStyleSavedTeam.trainer.baseSalary; // simule une sauvegarde d'avant le correctif
  const oldStyleSavedLeague = serializeLeague(lg);
  delete oldStyleSavedLeague.coachListings;
  delete oldStyleSavedLeague.lastCoachGenerationCheckAt;

  const teamBack = teamFromSave(oldStyleSavedTeam);
  const lgBack = leagueFromSave(oldStyleSavedLeague, teamBack);
  console.log("\nAncienne sauvegarde (sans coachListings/baseSalary) — trainer restauré :", teamBack.trainer, "| coachListings :", lgBack.coachListings);
  if (!Array.isArray(lgBack.coachListings) || lgBack.coachListings.length !== 0) throw new Error("❌ coachListings absent d'une ancienne sauvegarde devrait redevenir un tableau vide, pas planter.");
  if (teamBack.trainer.baseSalary !== TRAINER_BASE_SALARY[3]) throw new Error("❌ Sans baseSalary sauvegardé, le repli devrait être le tarif fixe TRAINER_BASE_SALARY du niveau.");
  console.log("✅ Une ancienne sauvegarde (sans marché aux enchères des entraîneurs) reste chargeable, avec un repli cohérent sur le tarif fixe par niveau.");
}

console.log("\n🏁 Tous les tests du marché des entraîneurs sont passés.");
