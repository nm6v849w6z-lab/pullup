// Vérifie la remontée de motivation lors d'un vrai changement de club
// (retour utilisateur, 2026-09) : "le changement de club via transfert : que
// la forme ne bouge pas, ça me parait bien, par contre il faudrait que la
// motivation remonte à un niveau neutre. Il change de club donc il devrait
// être plus motivé."
//
// Voir engine.js : le grand commentaire au-dessus de
// TRANSFER_NEW_CLUB_MOTIVATION_FLOOR, et son application dans
// League._resolveListing (SEUL chemin qui déplace vraiment un joueur d'un
// effectif vers un autre, contrairement à Team.promoteYouthPlayer qui reste
// dans le même club et ne doit donc PAS être concerné).
//
// Test purement moteur (pas de serveur HTTP ni de DOM, comme
// transfer_request_test.js) : plus rapide, se concentre sur la logique.
const E = require("./engine.js");
const {
  generateTeam, generateLeague,
  TRANSFER_NEW_CLUB_MOTIVATION_FLOOR, TRANSFER_REQUEST_WEEKS_THRESHOLD,
  MAX_ROSTER_SIZE,
} = E;

function freshLeagueWithBigBudget() {
  const user = generateTeam("Acheteur Test", 1.0);
  user.budget = 50000000;
  const lg = generateLeague(user, 1);
  lg.teams[0].budget = 50000000;
  return lg;
}

// ---------------------------------------------------------------------
// 1) Un joueur peu motivé chez son ancien club voit sa motivation remontée
//    au plancher neutre une fois le transfert abouti.
// ---------------------------------------------------------------------
(function testLowMotivationPlayerRisesToFloorOnTransfer() {
  const lg = freshLeagueWithBigBudget();
  const seller = lg.teams[1];
  const player = seller.players[0];
  player.form = 10; // bien démotivé

  const listing = lg.listPlayerForSale(1, player.id, 1000, Date.now());
  const bid = lg.placeBid(listing.id, 0, 1000, Date.now() + 10);
  if (!bid.ok) throw new Error(`❌ (setup) l'enchère devrait être acceptée : ${JSON.stringify(bid)}`);

  lg._resolveListing(listing, Date.now() + 20);
  if (listing.result !== "sold") throw new Error(`❌ (setup) le transfert devrait avoir abouti : ${JSON.stringify(listing)}`);

  const transferred = lg.teams[0].players.find(p => p.id === player.id);
  if (!transferred) throw new Error("❌ Le joueur devrait maintenant être dans l'effectif acheteur.");
  if (transferred.form !== TRANSFER_NEW_CLUB_MOTIVATION_FLOOR) {
    throw new Error(`❌ La motivation d'un joueur peu motivé devrait remonter au plancher neutre (${TRANSFER_NEW_CLUB_MOTIVATION_FLOOR}) après un transfert (obtenu ${transferred.form}).`);
  }
  console.log(`✅ Un joueur peu motivé (10) voit sa motivation remontée au plancher neutre (${transferred.form}) lors d'un transfert abouti.`);
})();

// ---------------------------------------------------------------------
// 2) Un joueur DÉJÀ bien motivé chez son ancien club ne perd rien : le
//    transfert ne fait jamais baisser la motivation, seulement remonter un
//    plancher.
// ---------------------------------------------------------------------
(function testHighMotivationPlayerUnaffectedByTransfer() {
  const lg = freshLeagueWithBigBudget();
  const seller = lg.teams[1];
  const player = seller.players[0];
  player.form = 92; // déjà très motivé, largement au-dessus du plancher

  const listing = lg.listPlayerForSale(1, player.id, 1000, Date.now());
  lg.placeBid(listing.id, 0, 1000, Date.now() + 10);
  lg._resolveListing(listing, Date.now() + 20);

  const transferred = lg.teams[0].players.find(p => p.id === player.id);
  if (transferred.form !== 92) {
    throw new Error(`❌ Un joueur déjà très motivé ne devrait jamais voir sa motivation baisser suite à un transfert (attendu 92, obtenu ${transferred.form}).`);
  }
  console.log("✅ Un joueur déjà très motivé (92) garde exactement sa motivation lors d'un transfert (jamais de baisse).");
})();

// ---------------------------------------------------------------------
// 3) La forme physique (condition), elle, ne bouge JAMAIS lors d'un
//    transfert (retour utilisateur : "que la forme ne bouge pas, ça me
//    parait bien").
// ---------------------------------------------------------------------
(function testConditionNeverTouchedByTransfer() {
  const lg = freshLeagueWithBigBudget();
  const seller = lg.teams[1];
  const player = seller.players[0];
  player.form = 15;
  player.condition = 37; // valeur arbitraire, bien en dehors de la fourchette de génération (80-100)

  const listing = lg.listPlayerForSale(1, player.id, 1000, Date.now());
  lg.placeBid(listing.id, 0, 1000, Date.now() + 10);
  lg._resolveListing(listing, Date.now() + 20);

  const transferred = lg.teams[0].players.find(p => p.id === player.id);
  if (transferred.condition !== 37) {
    throw new Error(`❌ La forme physique ne devrait jamais être touchée par un transfert (attendu 37, obtenu ${transferred.condition}).`);
  }
  console.log("✅ La forme physique (condition) reste inchangée lors d'un transfert, seule la motivation est concernée.");
})();

// ---------------------------------------------------------------------
// 4) Une demande de transfert active chez l'ancien club est refermée par le
//    transfert lui-même (elle visait ce club qu'il vient justement de
//    quitter, la garder afficherait une citation de presse obsolète chez le
//    nouveau club).
// ---------------------------------------------------------------------
(function testActiveTransferRequestClearedByTransfer() {
  const lg = freshLeagueWithBigBudget();
  const seller = lg.teams[1];
  const player = seller.players[0];
  player.form = 5;
  for (let i = 0; i < TRANSFER_REQUEST_WEEKS_THRESHOLD; i++) seller.updateTransferRequests(Date.now());
  if (!player.transferRequestActive) throw new Error("❌ (setup) la demande de transfert devrait être active avant ce test.");

  const listing = lg.listPlayerForSale(1, player.id, 1000, Date.now());
  lg.placeBid(listing.id, 0, 1000, Date.now() + 10);
  lg._resolveListing(listing, Date.now() + 20);

  const transferred = lg.teams[0].players.find(p => p.id === player.id);
  if (transferred.transferRequestActive || transferred.transferRequestQuote !== null || transferred.weeksAtLowMotivation !== 0) {
    throw new Error(`❌ Une demande de transfert active devrait être refermée par le transfert lui-même (obtenu transferRequestActive=${transferred.transferRequestActive}, transferRequestQuote=${JSON.stringify(transferred.transferRequestQuote)}, weeksAtLowMotivation=${transferred.weeksAtLowMotivation}).`);
  }
  if (transferred.form !== TRANSFER_NEW_CLUB_MOTIVATION_FLOOR) {
    throw new Error(`❌ La motivation devrait aussi remonter au plancher neutre (obtenu ${transferred.form}).`);
  }
  console.log("✅ Une demande de transfert active est refermée par le transfert lui-même, motivation remontée au plancher neutre.");
})();

// ---------------------------------------------------------------------
// 5) Une promotion depuis l'académie de jeunes (MÊME club, pas un
//    transfert) ne doit JAMAIS déclencher ce plancher.
// ---------------------------------------------------------------------
(function testYouthPromotionNeverTriggersFloor() {
  const lg = freshLeagueWithBigBudget();
  const team = lg.teams[0];
  const candidate = E.generateYouthCandidate(Date.now(), 1);
  candidate.form = 8;
  candidate.age = 18;
  team.youthPlayers.push(candidate);
  team.pendingYouthDecisions = [candidate.id];

  const res = team.promoteYouthPlayer(candidate.id, Date.now());
  if (!res.ok) throw new Error(`❌ (setup) la promotion devrait réussir : ${JSON.stringify(res)}`);

  const promoted = team.players.find(p => p.id === candidate.id);
  if (promoted.form !== 8) {
    throw new Error(`❌ Une promotion depuis l'académie (même club) ne devrait jamais toucher la motivation (attendu 8, obtenu ${promoted.form}).`);
  }
  console.log("✅ Une promotion depuis l'académie de jeunes (même club) ne déclenche jamais le plancher de motivation neutre.");
})();

console.log("\nTous les tests de motivation au changement de club sont passés.");
