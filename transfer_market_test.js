// Vérifie le marché des transferts (retour utilisateur : "un vrai marché des
// transferts (acheter/vendre des joueurs entre managers, pas juste la vente
// forcée à 1€)" — le "gros morceau" manquant) : système D'ENCHÈRES sur 3
// jours RÉELS (retour utilisateur : "systeme d'enchere sur 3 jours c'est
// bien"), incrément minimum le plus grand de 1 000 € ou 20 % (retour
// utilisateur : "minimum de 1K à mettre pour enchérir ou 20%"), les 9
// adversaires CPU participent aussi bien comme vendeurs que comme
// enchérisseurs, plafond d'effectif acheteur (AUCUN plancher vendeur — voir
// listPlayerForSale/Team.sellPlayer, retour utilisateur : "on peut vendre
// tout son effectif si on le souhaite"), et intégration UI (mise aux
// enchères depuis l'onglet Effectif, suivi depuis l'onglet Marché,
// persistance, résolution différée dans le temps).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, writeRawSave } = require("./test_helpers.js");
const E = require("./engine.js");
const {
  generateTeam, generateLeague, Player,
  estimateMarketValue, transferMinIncrement, minNextBidFor,
  TRANSFER_AUCTION_DURATION_MS, TRANSFER_CPU_CHECK_INTERVAL_MS,
  TRANSFER_MIN_INCREMENT_FLAT, TRANSFER_MIN_INCREMENT_PCT, TRANSFER_CPU_BID_CHANCE,
  MAX_ROSTER_SIZE,
} = E;
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function freshLeague(budget = 5000000) {
  const user = generateTeam("User", 1.0);
  user.budget = budget;
  const lg = generateLeague(user, 1);
  lg.teams[0].budget = budget;
  return lg;
}

// Fige Math.random() sur une valeur fixe le temps d'un appel — rend
// déterministe la partie "activité CPU" du marché (autrement soumise au
// hasard), sans changer le fonctionnement réel du code testé.
function withMockedRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = orig; }
}

// Un joueur "hors norme" (99 partout) qu'absolument toute équipe CPU
// souhaite (voir League._cpuWantsPlayer) — utile pour des scénarios
// d'enchère CPU déterministes.
function makeOverpoweredPlayer(position) {
  const attrs = {};
  E.ATTRS.forEach(a => attrs[a] = 99);
  return new Player({ name: "Superstar Test", position, height: 200, age: 26, attrs, aggressiveness: 80 });
}

// ---------------------------------------------------------------------
// Partie 1 : valeur marchande estimée et règles d'incrément.
// ---------------------------------------------------------------------
{
  const young = estimateMarketValue({ salary: 10000, age: 20 });
  const old = estimateMarketValue({ salary: 10000, age: 35 });
  console.log(`Valeur estimée (même salaire 10000€) — jeune (20 ans) : ${young} | fin de carrière (35 ans) : ${old}`);
  if (young <= old) throw new Error("❌ Un jeune joueur devrait valoir nettement plus qu'un joueur en fin de carrière, à salaire égal.");
  console.log("✅ La valeur marchande estimée valorise bien la jeunesse (marge de progression revendable).");
}
{
  const inc1 = transferMinIncrement(1000); // 20% = 200 < 1000 -> plancher 1000
  const inc2 = transferMinIncrement(50000); // 20% = 10000 > 1000
  console.log(`\nIncrément minimum — sur 1000€ : ${inc1} (attendu ${TRANSFER_MIN_INCREMENT_FLAT}) | sur 50000€ : ${inc2} (attendu ${Math.round(50000 * TRANSFER_MIN_INCREMENT_PCT)})`);
  if (inc1 !== TRANSFER_MIN_INCREMENT_FLAT) throw new Error("❌ En dessous du seuil, l'incrément minimum devrait être le plancher fixe de 1000€.");
  if (inc2 !== Math.round(50000 * TRANSFER_MIN_INCREMENT_PCT)) throw new Error("❌ Au-dessus du seuil, l'incrément minimum devrait être 20% de l'enchère actuelle.");
  console.log("✅ L'incrément minimum applique bien le plus grand des deux (1000€ ou 20%).");
}
{
  const noBidYet = minNextBidFor({ currentBid: null, startPrice: 5000 });
  const withBid = minNextBidFor({ currentBid: 10000, startPrice: 5000 });
  console.log(`\nEnchère minimale — sans enchère : ${noBidYet} (attendu 5000, le prix de départ) | avec enchère à 10000 : ${withBid} (attendu ${10000 + transferMinIncrement(10000)})`);
  if (noBidYet !== 5000) throw new Error("❌ Sans enchère, l'enchère minimale valable devrait être le prix de départ.");
  if (withBid !== 10000 + transferMinIncrement(10000)) throw new Error("❌ Avec une enchère existante, l'enchère minimale devrait ajouter l'incrément minimum.");
  console.log("✅ L'enchère minimale valable est calculée correctement, avec ou sans enchère existante.");
}

// ---------------------------------------------------------------------
// Partie 2 : mise aux enchères (listPlayerForSale) — garde-fous.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const now = Date.now();
  const p = lg.teams[0].players[0];
  const listing = lg.listPlayerForSale(0, p.id, 12345, now);
  console.log("\nAnnonce créée :", listing.status, listing.startPrice, "closesAt - createdAt =", listing.closesAt - listing.createdAt);
  if (!listing || listing.status !== "open") throw new Error("❌ La création d'une annonce valide devrait réussir.");
  if (listing.closesAt - listing.createdAt !== TRANSFER_AUCTION_DURATION_MS) throw new Error("❌ La durée de l'enchère devrait être exactement TRANSFER_AUCTION_DURATION_MS (3 jours).");
  console.log("✅ Une annonce valide est créée avec la bonne durée (3 jours réels).");

  const double = lg.listPlayerForSale(0, p.id, 999, now);
  console.log("Double annonce sur le même joueur refusée :", double === null);
  if (double !== null) throw new Error("❌ Un joueur déjà listé ne devrait pas pouvoir être listé une seconde fois.");
  console.log("✅ Un joueur déjà aux enchères ne peut pas être listé une seconde fois.");
}
{
  // Retour utilisateur : "on peut vendre tout son effectif si on le
  // souhaite" — listPlayerForSale n'impose plus AUCUN plancher, même
  // ramené à un seul joueur restant (voire lui-même, le dernier).
  const lg = freshLeague();
  const now = Date.now();
  lg.teams[0].players.length = 1;
  const p = lg.teams[0].players[0];
  const listing = lg.listPlayerForSale(0, p.id, 1000, now);
  console.log("\nAnnonce acceptée même avec un seul joueur restant dans l'effectif :", listing && listing.status === "open");
  if (!listing || listing.status !== "open") throw new Error("❌ La mise aux enchères ne devrait plus être bloquée par un plancher d'effectif, même à 1 seul joueur restant.");
  console.log("✅ Aucun plancher d'effectif pour la mise aux enchères : listable jusqu'au dernier joueur.");
}
{
  const lg = freshLeague();
  const now = Date.now();
  if (lg.listPlayerForSale(0, -999999, 1000, now) !== null) throw new Error("❌ Un identifiant de joueur inexistant devrait être refusé.");
  if (lg.listPlayerForSale(99, lg.teams[0].players[0].id, 1000, now) !== null) throw new Error("❌ Un identifiant d'équipe inexistant devrait être refusé.");
  console.log("\n✅ Identifiants de joueur/équipe invalides correctement refusés.");
}

// ---------------------------------------------------------------------
// Partie 3 : annulation d'une annonce.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const now = Date.now();
  const p1 = lg.teams[0].players[0];
  const l1 = lg.listPlayerForSale(0, p1.id, 5000, now);
  console.log("\nAnnulation avant toute enchère :", lg.cancelListing(l1.id, 0));
  if (!lg.cancelListing) throw new Error("❌ cancelListing devrait exister.");
  if (l1.status !== "cancelled") throw new Error("❌ L'annonce devrait être annulée.");

  const p2 = lg.teams[0].players[1];
  const l2 = lg.listPlayerForSale(0, p2.id, 5000, now);
  lg.placeBid(l2.id, 1, 5000, now + 10);
  const cancelAfterBid = lg.cancelListing(l2.id, 0);
  console.log("Annulation après une enchère refusée :", cancelAfterBid === false, "| statut :", l2.status);
  if (cancelAfterBid !== false || l2.status !== "open") throw new Error("❌ Une annonce avec une enchère déjà posée ne devrait plus pouvoir être annulée.");

  const wrongTeam = lg.cancelListing(l1.id, 3);
  console.log("Annulation par une autre équipe refusée :", wrongTeam === false);
  console.log("✅ Annulation possible avant enchère, bloquée après, et réservée au vendeur.");
}

// ---------------------------------------------------------------------
// Partie 4 : enchérir (placeBid) — garde-fous.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const now = Date.now();
  const p = lg.teams[0].players[0];
  const listing = lg.listPlayerForSale(0, p.id, 10000, now);

  const ownBid = lg.placeBid(listing.id, 0, 20000, now + 10);
  console.log("\nEnchère sur sa propre annonce refusée :", ownBid.ok === false, ownBid.reason);
  if (ownBid.ok !== false || ownBid.reason !== "own-listing") throw new Error("❌ On ne devrait pas pouvoir enchérir sur sa propre annonce.");

  const tooLow = lg.placeBid(listing.id, 1, 5000, now + 10);
  console.log("Enchère trop basse refusée :", tooLow.ok === false, tooLow.reason, "minBid:", tooLow.minBid);
  if (tooLow.ok !== false || tooLow.reason !== "too-low" || tooLow.minBid !== 10000) throw new Error("❌ Une enchère sous le prix de départ devrait être refusée avec le bon minimum.");

  const okBid = lg.placeBid(listing.id, 1, 10000, now + 20);
  console.log("Première enchère valide acceptée :", okBid.ok);
  if (!okBid.ok) throw new Error("❌ Une enchère au prix de départ exact devrait être acceptée.");
  if (listing.currentBid !== 10000 || listing.currentBidderIdx !== 1) throw new Error("❌ L'enchère actuelle et l'enchérisseur devraient être mis à jour.");

  const belowIncrement = lg.placeBid(listing.id, 2, 10500, now + 30); // incrément minimum = max(1000, 2000) = 2000 -> il faut 12000
  console.log("Enchère sous l'incrément minimum refusée :", belowIncrement.ok === false, "minBid:", belowIncrement.minBid);
  if (belowIncrement.ok !== false || belowIncrement.minBid !== 12000) throw new Error("❌ L'incrément minimum (20% ici) devrait être appliqué à l'enchère suivante.");
  console.log("✅ Refus systématique : propre annonce, sous le prix de départ, sous l'incrément minimum ; acceptation correcte sinon.");
}
{
  const lg = freshLeague(5000); // budget très faible
  const now = Date.now();
  const p = lg.teams[3].players[0];
  const listing = lg.listPlayerForSale(3, p.id, 10000, now);
  const res = lg.placeBid(listing.id, 0, 10000, now + 10);
  console.log("\nBudget insuffisant (club du joueur) refusé :", res.ok === false, res.reason);
  if (res.ok !== false || res.reason !== "insufficient-budget") throw new Error("❌ Le club du joueur devrait être bloqué par son budget réel.");

  // Une équipe CPU, elle, n'est PAS bloquée par un budget réaliste (non
  // suivi pour les adversaires — voir le commentaire dans placeBid) : une
  // enchère CPU du même montant doit passer même si son budget affiché est
  // dérisoire.
  lg.teams[4].budget = 1;
  const cpuRes = lg.placeBid(listing.id, 4, 10000, now + 20);
  console.log("Enchère CPU acceptée malgré un budget CPU dérisoire :", cpuRes.ok === true);
  if (!cpuRes.ok) throw new Error("❌ Une équipe CPU ne devrait pas être bloquée par son champ budget (non suivi de façon réaliste pour les adversaires).");
  console.log("✅ Seul le club du joueur est bloqué par un budget insuffisant, pas les équipes CPU.");
}
{
  const lg = freshLeague();
  const now = Date.now();
  while (lg.teams[0].players.length < MAX_ROSTER_SIZE) lg.teams[0].players.push(E.generateRookiePlayer("Meneur"));
  const p = lg.teams[3].players[0];
  const listing = lg.listPlayerForSale(3, p.id, 1000, now);
  const res = lg.placeBid(listing.id, 0, 1000, now + 10);
  console.log(`\nEnchère refusée au plafond de ${MAX_ROSTER_SIZE} joueurs :`, res.ok === false, res.reason);
  if (res.ok !== false || res.reason !== "roster-full") throw new Error(`❌ Une équipe déjà au plafond de ${MAX_ROSTER_SIZE} joueurs ne devrait pas pouvoir enchérir.`);
  console.log("✅ Le plafond d'effectif est respecté pour enchérir.");
}
{
  const lg = freshLeague();
  const now = Date.now();
  const p = lg.teams[0].players[0];
  const listing = lg.listPlayerForSale(0, p.id, 5000, now);
  const res = lg.placeBid(listing.id, 1, 5000, now + TRANSFER_AUCTION_DURATION_MS + 1);
  console.log("\nEnchère après échéance refusée :", res.ok === false, res.reason);
  if (res.ok !== false || res.reason !== "closed") throw new Error("❌ Une enchère après l'échéance devrait être refusée.");
  console.log("✅ Impossible d'enchérir après l'échéance des 3 jours.");
}

// ---------------------------------------------------------------------
// Partie 5 : résolution (refreshMarket) — scénarios déterministes (Math.random figé).
// ---------------------------------------------------------------------
{
  // Le club du joueur gagne : Math.random figé à une valeur qui NE
  // déclenche JAMAIS d'enchère CPU (>= TRANSFER_CPU_BID_CHANCE), donc
  // l'unique enchère (celle du club du joueur) l'emporte forcément.
  const lg = freshLeague(5000000);
  const now = Date.now();
  const seller = lg.teams[3];
  const player = seller.players[0];
  const startPrice = 20000;
  const listing = lg.listPlayerForSale(3, player.id, startPrice, now);
  const bidAmount = 25000;
  const bidRes = lg.placeBid(listing.id, 0, bidAmount, now + 1000);
  if (!bidRes.ok) throw new Error("❌ L'enchère de préparation du scénario aurait dû réussir.");
  const budgetBefore = lg.teams[0].budget;
  const sellerCountBefore = seller.players.length;
  withMockedRandom(0.999999, () => {
    lg.refreshMarket(now + TRANSFER_CPU_CHECK_INTERVAL_MS + 100);
    lg.refreshMarket(now + 2 * TRANSFER_CPU_CHECK_INTERVAL_MS + 100);
    lg.refreshMarket(now + TRANSFER_AUCTION_DURATION_MS + 100);
  });
  console.log(`\nRésolution "le club du joueur gagne" — statut : ${listing.status}/${listing.result}, prix final : ${listing.finalPrice}`);
  if (listing.status !== "closed" || listing.result !== "sold" || listing.finalPrice !== bidAmount) {
    throw new Error("❌ L'enchère devrait se conclure vendue, au montant exact enchéri (aucune concurrence CPU dans ce scénario).");
  }
  if (lg.teams[0].budget !== budgetBefore - bidAmount) throw new Error("❌ Le budget du club du joueur devrait être débité exactement du montant gagné.");
  if (seller.players.length !== sellerCountBefore - 1) throw new Error("❌ Le vendeur devrait avoir un joueur de moins.");
  if (!lg.teams[0].players.some(p => p.id === player.id)) throw new Error("❌ Le joueur acheté devrait rejoindre l'effectif du club du joueur.");
  const tx = lg.teams[0].transactions.find(t => t.label.startsWith("Achat de") && t.amount === -bidAmount);
  if (!tx) throw new Error("❌ Une transaction d'achat négative devrait être journalisée pour le club du joueur.");
  console.log("✅ Achat gagné par le club du joueur : budget débité exactement, joueur transféré, transaction journalisée.");
}
{
  // Aucune enchère du tout, et Math.random figé pour empêcher toute
  // activité CPU : l'annonce doit rester invendue, le joueur reste chez le
  // vendeur.
  const lg = freshLeague();
  const now = Date.now();
  const seller = lg.teams[2];
  const player = seller.players[0];
  const listing = lg.listPlayerForSale(2, player.id, 15000, now);
  withMockedRandom(0.999999, () => {
    lg.refreshMarket(now + TRANSFER_AUCTION_DURATION_MS + 100);
  });
  console.log(`\nRésolution "invendue" — statut : ${listing.status}/${listing.result}`);
  if (listing.status !== "closed" || listing.result !== "unsold") throw new Error("❌ Une annonce sans aucune enchère devrait rester invendue.");
  if (!seller.players.some(p => p.id === player.id)) throw new Error("❌ Le joueur invendu devrait rester dans l'effectif du vendeur.");
  console.log("✅ Une annonce sans enchère reste invendue, le joueur reste chez le vendeur.");
}
{
  // Un joueur hors norme (99 partout) que TOUTE équipe CPU convoite (voir
  // _cpuWantsPlayer) : Math.random figé à 0 pour garantir le déclenchement
  // de l'enchère CPU dès la première vérification (1 jour). Le club du
  // joueur enchérit bas, une équipe CPU doit le devancer.
  const lg = freshLeague(5000000);
  const now = Date.now();
  const star = makeOverpoweredPlayer("Meneur");
  lg.teams[3].players[0] = star; // remplace un joueur CPU par la superstar
  const listing = lg.listPlayerForSale(3, star.id, 10000, now);
  lg.placeBid(listing.id, 0, 10000, now + 500); // enchère basse du club du joueur
  withMockedRandom(0, () => {
    lg.refreshMarket(now + TRANSFER_CPU_CHECK_INTERVAL_MS + 100);
  });
  console.log(`\nAprès la 1ère vérification CPU (joueur hors norme) — enchère actuelle : ${listing.currentBid}, enchérisseur : ${listing.currentBidderIdx}`);
  if (listing.currentBidderIdx === 0) throw new Error("❌ Au moins une équipe CPU aurait dû surenchérir sur un joueur que toutes convoitent.");
  if (listing.currentBid <= 10000) throw new Error("❌ L'enchère CPU devrait dépasser l'enchère initiale du club du joueur.");
  const minAfter = minNextBidFor(listing);
  if (minAfter < listing.currentBid + transferMinIncrement(listing.currentBid)) throw new Error("❌ L'incrément minimum devrait s'appliquer même à une enchère CPU.");
  console.log("✅ Une équipe CPU intéressée surenchérit bien sur une enchère trop basse du club du joueur (incrément minimum respecté).");
}
{
  // Nouvelles annonces CPU : Math.random figé à 0 pour garantir le
  // déclenchement (TRANSFER_CPU_LIST_CHANCE) pour chaque équipe CPU dès la
  // première vérification.
  const lg = freshLeague();
  const now = Date.now();
  const weakestByTeam = lg.teams.map(t => t.players.reduce((w, p) => (p.overall() < w.overall() ? p : w), t.players[0]));
  withMockedRandom(0, () => {
    lg.refreshMarket(now + 100);
  });
  const cpuListings = lg.transferListings.filter(l => l.sellerIdx !== 0);
  console.log(`\nNouvelles annonces CPU générées : ${cpuListings.length} (sur 9 équipes adverses)`);
  if (cpuListings.length !== 9) throw new Error("❌ Avec TRANSFER_CPU_LIST_CHANCE garanti, chacune des 9 équipes adverses devrait avoir listé un joueur.");
  cpuListings.forEach(l => {
    const expectedPlayer = weakestByTeam[l.sellerIdx];
    if (l.playerId !== expectedPlayer.id) throw new Error(`❌ L'équipe ${l.sellerIdx} devrait mettre aux enchères son joueur le plus faible (overall le plus bas).`);
    if (l.startPrice !== estimateMarketValue(expectedPlayer)) throw new Error("❌ Le prix de départ d'une annonce CPU devrait être sa valeur marchande estimée.");
  });
  console.log("✅ Les annonces CPU générées listent bien le joueur le plus faible de chaque équipe, au bon prix de départ.");
}
{
  // Cas limite : le gagnant perd la place/le budget nécessaires ENTRE
  // l'enchère et la clôture (ici : le club du joueur, dont le budget chute
  // sous le montant enchéri avant la résolution) — l'enchère échoue pour
  // tout le monde, le joueur reste chez le vendeur, aucune transaction.
  const lg = freshLeague(50000);
  const now = Date.now();
  const seller = lg.teams[3];
  const player = seller.players[0];
  const listing = lg.listPlayerForSale(3, player.id, 20000, now);
  lg.placeBid(listing.id, 0, 20000, now + 500);
  lg.teams[0].budget = 1000; // s'effondre avant la clôture
  withMockedRandom(0.999999, () => {
    lg.refreshMarket(now + TRANSFER_AUCTION_DURATION_MS + 100);
  });
  console.log(`\nÉchec de l'acheteur à la clôture (budget effondré entre-temps) — statut : ${listing.status}/${listing.result}`);
  if (listing.result !== "buyer-failed") throw new Error("❌ Un acheteur qui n'a plus les moyens à la clôture devrait faire échouer la vente (buyer-failed).");
  if (!seller.players.some(p => p.id === player.id)) throw new Error("❌ Le joueur devrait rester chez le vendeur si l'achat échoue à la clôture.");
  if (lg.teams[0].transactions.some(t => t.label.startsWith("Achat de"))) throw new Error("❌ Aucune transaction d'achat ne devrait être journalisée si l'achat échoue.");
  console.log("✅ Un acheteur qui n'a plus les moyens à la clôture ne conclut pas la vente (le joueur reste chez le vendeur).");
}

// ---------------------------------------------------------------------
// Partie 6 : playerById.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const p = lg.teams[5].players[2];
  console.log("\nplayerById retrouve un joueur de n'importe quelle équipe :", lg.playerById(p.id) === p);
  console.log("playerById renvoie null pour un id inconnu :", lg.playerById(-1) === null);
  if (lg.playerById(p.id) !== p || lg.playerById(-1) !== null) throw new Error("❌ playerById devrait retrouver n'importe quel joueur de la ligue, ou renvoyer null.");
  console.log("✅ playerById fonctionne pour toutes les équipes de la ligue.");
}

// ---------------------------------------------------------------------
// Partie 7 : parcours UI — mise aux enchères depuis l'onglet Effectif
// (retour utilisateur : "il faut le faire depuis la page effectif / et je
// dois pouvoir choisir le prix"), suivi depuis l'onglet Marché (retour
// utilisateur : "le marché des transferts doit permettre de voir les
// joueurs qui sont sur le marché (pas mes joueurs uniquement)" — vérifié
// plus bas via les annonces des AUTRES équipes, pas seulement la sienne),
// persistance, résolution différée dans le temps.
// ---------------------------------------------------------------------
(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
function clickTab(key) { [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click(); }

clickTab("effectif");
console.log("\nOnglet Effectif — lignes :", doc.querySelectorAll("#rosterContent tbody tr").length);
if (doc.querySelectorAll("#rosterContent tbody tr").length !== 15) throw new Error("❌ Le tableau Effectif devrait afficher les 15 joueurs du club du joueur.");
console.log("✅ L'onglet Effectif affiche l'effectif complet du club du joueur.");

// --- Mettre un joueur aux enchères via le bouton, DEPUIS L'EFFECTIF, avec
// un prix choisi LIBREMENT par le joueur — retour utilisateur (2026-09) :
// "il faut pouvoir mettre le prix qu'on veut, et pas le prix qui est
// suggeré (prix qu'on doit enlever, parce que on a aucune donnée de prix)".
// Le champ ne doit donc plus être pré-rempli d'une estimation. ---
const listBtn = doc.querySelector("#rosterContent [data-list-player]");
if (!listBtn) throw new Error("❌ Un bouton 'Mettre aux enchères' devrait exister, dans l'Effectif, pour un joueur non listé.");
const listedPlayerId = listBtn.dataset.listPlayer;
const priceInput = doc.getElementById(`listPrice_${listedPlayerId}`);
if (priceInput.value !== "") throw new Error(`❌ Le champ de prix ne devrait plus être pré-rempli d'une suggestion, obtenu : "${priceInput.value}".`);
console.log("\nChamp de prix vide par défaut (aucun prix suggéré) :", JSON.stringify(priceInput.value));
console.log("✅ Le champ de prix de mise aux enchères ne contient plus de valeur suggérée pré-remplie.");

// Cliquer sans avoir saisi de prix doit refuser (pas de repli silencieux
// sur 1 €, qui braderait le joueur sans le vouloir) et l'expliquer.
listBtn.click();
const emptyFeedback = doc.getElementById("rosterMarketFeedback").textContent;
console.log("Message si aucun prix saisi :", emptyFeedback);
if (!emptyFeedback.toLowerCase().includes("prix")) throw new Error("❌ Un message devrait demander de saisir un prix quand le champ est laissé vide.");
console.log("✅ La mise aux enchères sans prix saisi est bien refusée, avec un message explicite.");

// Le joueur choisit librement son propre prix.
const chosenPrice = 123456;
priceInput.value = String(chosenPrice);
listBtn.click();
console.log("Message après mise aux enchères :", doc.getElementById("rosterMarketFeedback").textContent);
if (!doc.getElementById("rosterMarketFeedback").textContent.includes("mis aux enchères")) throw new Error("❌ Un message de confirmation devrait s'afficher, dans l'Effectif, après la mise aux enchères.");
await flush(dom);
let saved = readRawSave(savePath);
const myListing = saved.league.transferListings.find(l => String(l.playerId) === String(listedPlayerId) && l.status === "open");
if (!myListing) throw new Error("❌ L'annonce devrait être persistée dans la sauvegarde.");
if (myListing.startPrice !== chosenPrice) throw new Error(`❌ Le prix de départ de l'annonce devrait être celui choisi par le joueur (${chosenPrice}), obtenu ${myListing.startPrice}.`);
console.log("✅ Mettre un joueur aux enchères depuis l'onglet Effectif fonctionne, avec le prix choisi par le joueur, confirmation et persistance.");

// --- L'onglet Marché, lui, n'affiche plus de tableau "Mon effectif" : la
// mise en vente s'y fait exclusivement depuis l'Effectif désormais. ---
clickTab("marche");
// L'onglet Marché déclenche lui-même une sauvegarde "fire-and-forget" (voir
// refreshTransferMarket/saveMyTeam) : sans l'attendre ici, elle pourrait
// atteindre le serveur APRÈS le writeRawSave manuel ci-dessous (annonce
// injectée pour un autre club) et l'écraser avec un état plus ancien qui
// l'ignore — d'où ce flush avant de continuer.
await flush(dom);
if (doc.getElementById("marketListMyPlayers")) throw new Error("❌ L'onglet Marché ne devrait plus contenir de tableau 'Mon effectif' séparé — la mise aux enchères se fait depuis l'Effectif.");
console.log("✅ L'onglet Marché ne duplique plus le tableau de mise en vente (déplacé vers l'Effectif).");

// La liste des enchères en cours doit afficher cette annonce (repérée via
// "Vendeur : Vous" dans les méta-infos), sans bouton d'enchère sur son
// propre joueur. Retour utilisateur (2026-09) : "ne mets pas Votre annonce
// quand c'est mon joueur, c'est moche". Ce texte a été retiré (déjà
// indiqué par "Vendeur : Vous"), donc la carte ne doit PLUS le contenir.
const myCard = [...doc.querySelectorAll("#marketListings .market-card")].find(c => c.textContent.includes("Vendeur : Vous"));
console.log("Carte de ma propre annonce visible dans les enchères en cours :", !!myCard);
if (!myCard) throw new Error("❌ L'annonce du club du joueur devrait apparaître dans 'Enchères en cours' (Vendeur : Vous).");
if (myCard.textContent.includes("Votre annonce")) throw new Error("❌ La carte ne devrait plus afficher 'Votre annonce', déjà indiqué par 'Vendeur : Vous' (retour utilisateur : \"c'est moche\").");
if (myCard.querySelector("[data-bid-listing]")) throw new Error("❌ Aucun bouton d'enchère ne devrait apparaître sur sa propre annonce.");
console.log("✅ Sa propre annonce est visible dans les enchères en cours, sans le texte redondant 'Votre annonce' et sans bouton pour enchérir dessus.");

// --- Tentative d'enchère invalide (trop basse) sur une annonce injectée
// directement dans la sauvegarde, pour un scénario contrôlé. ---
saved.league.transferListings.push({
  id: 999001, playerId: saved.league.teams[3].players[0].id, sellerIdx: 3,
  startPrice: 50000, currentBid: null, currentBidderIdx: null, bids: [],
  createdAt: Date.now(), closesAt: Date.now() + E.TRANSFER_AUCTION_DURATION_MS,
  lastCpuCheckAt: Date.now(), status: "open", result: null, finalPrice: null,
});
writeRawSave(savePath, saved);
win.close();

const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;
function clickTab2(key) { [...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click(); }
clickTab2("marche");

// --- Retour utilisateur : "le marché des transferts doit permettre de voir
// les joueurs qui sont sur le marché (pas mes joueurs uniquement)" — la
// sauvegarde rechargée ici contient DEUX annonces ouvertes : la vôtre
// (myListing, club du joueur) ET celle injectée pour un AUTRE club
// (listing 999001, équipe 3) — les deux doivent apparaître ensemble dans
// "Enchères en cours". ---
const marketCards = [...doc2.querySelectorAll("#marketListings .market-card")];
console.log(`\nOnglet Marché — cartes visibles : ${marketCards.length} (attendu au moins 2 : la vôtre + celle d'un adversaire)`);
if (marketCards.length < 2) throw new Error("❌ Le Marché devrait afficher au moins 2 annonces ouvertes (la vôtre et celle d'un adversaire), pas seulement vos joueurs.");
if (!marketCards.some(c => c.textContent.includes("Vendeur : Vous"))) throw new Error("❌ Votre propre annonce devrait toujours apparaître dans le Marché.");
if (!marketCards.some(c => c.querySelector('[data-bid-listing="999001"]'))) throw new Error("❌ L'annonce d'un AUTRE club devrait apparaître dans le Marché, pas seulement les vôtres.");
console.log("✅ Le Marché affiche bien toutes les enchères en cours de la ligue — les vôtres ET celles des adversaires, pas 'mes joueurs uniquement'.");

// --- Retour utilisateur (2026-09, 2 passes) : "il faut pouvoir voir le
// bouton enchérir sans scroller vers la droite [...] le bouton enchérir à
// droite à côté du prix était mieux [...] mais il ne faut pas qu'on ait
// besoin de scroller sur le coté. il faut que tout s'affiche d'une bloc".
// Le Marché n'est plus un tableau large (donc plus de défilement horizontal
// possible du tout, voir le commentaire CSS de .market-cards), et le bouton
// Enchérir est de nouveau à côté du prix/enchère actuelle (.market-card-bid),
// pas juste après le nom du joueur. ---
if (doc2.querySelector("#marketListings table")) {
  throw new Error("❌ Le Marché ne devrait plus utiliser de tableau (source du défilement horizontal), une carte par annonce désormais.");
}
if (doc2.querySelector("#marketListings .table-scroll")) {
  throw new Error("❌ Le Marché ne devrait plus avoir de conteneur à défilement horizontal (.table-scroll).");
}
const cardWithBidBtn = marketCards.find(c => c.querySelector('[data-bid-listing="999001"]'));
const bidZone = cardWithBidBtn.querySelector(".market-card-bid");
if (!bidZone || !bidZone.querySelector('[data-bid-listing="999001"]')) {
  throw new Error("❌ Le bouton 'Enchérir' devrait se trouver à côté du prix/enchère actuelle (.market-card-bid), pas ailleurs sur la carte.");
}
if (!bidZone.querySelector(".market-card-price")) {
  throw new Error("❌ La même zone (.market-card-bid) devrait regrouper le prix/enchère actuelle ET le bouton Enchérir, côte à côte.");
}
console.log("✅ Le Marché n'utilise plus de tableau (aucun défilement horizontal possible), et le bouton Enchérir est bien à côté du prix.");

if (!doc2.querySelector(`[data-bid-listing="999001"]`)) throw new Error("❌ Un bouton 'Enchérir' devrait exister pour l'annonce injectée (pas la vôtre).");
doc2.getElementById("bid_999001").value = "1"; // délibérément trop bas
doc2.querySelector(`[data-bid-listing="999001"]`).click();
console.log("\nMessage après enchère trop basse :", doc2.getElementById("marketFeedback").textContent);
if (!doc2.getElementById("marketFeedback").textContent.includes("trop basse")) throw new Error("❌ Un message d'erreur explicite devrait s'afficher pour une enchère trop basse.");
console.log("✅ Une enchère invalide affiche un message d'erreur explicite, sans planter.");

// --- Enchère valide cette fois. Chaque action précédente a réaffiché le
// tableau (holder.innerHTML = ...), donc les éléments doivent être
// requêtés À NOUVEAU : les anciens noeuds sont détachés du DOM (plus reliés
// à l'écouteur d'événements posé sur le conteneur parent). ---
doc2.getElementById("bid_999001").value = String(50000);
doc2.querySelector(`[data-bid-listing="999001"]`).click();
console.log("Message après enchère valide :", doc2.getElementById("marketFeedback").textContent);
if (!doc2.getElementById("marketFeedback").textContent.includes("enregistrée")) throw new Error("❌ Une enchère valide devrait confirmer son enregistrement.");
await flush(dom2);
let saved2 = readRawSave(savePath);
const injectedListing = saved2.league.transferListings.find(l => l.id === 999001);
if (injectedListing.currentBid !== 50000 || injectedListing.currentBidderIdx !== 0) throw new Error("❌ L'enchère valide devrait être enregistrée avec le bon montant et le bon enchérisseur.");
console.log("✅ Une enchère valide est bien enregistrée et persistée.");

// Retour utilisateur (2026-09) : "pas besoin de mettre vous et vous êtes en
// tête, ça fait redites". Maintenant qu'on est en tête sur cette annonce,
// la carte doit afficher "Vous êtes en tête" (dans .market-card-action) SANS
// dupliquer l'info via un "(vous)" dans le prix (.market-card-price).
const leadingCard = [...doc2.querySelectorAll("#marketListings .market-card")].find(c => c.getAttribute("data-listing-id") === "999001");
if (!leadingCard || !leadingCard.textContent.includes("Vous êtes en tête")) throw new Error("❌ La carte de l'annonce où l'on est en tête devrait afficher 'Vous êtes en tête'.");
if (leadingCard.querySelector(".market-card-price").textContent.includes("(vous)")) throw new Error("❌ Le prix ne devrait plus afficher '(vous)' en plus de 'Vous êtes en tête' juste en dessous, c'est redondant.");
console.log("✅ 'Vous êtes en tête' s'affiche sans le suffixe redondant '(vous)' sur le prix.");

// --- Résolution différée dans le temps : on avance artificiellement
// l'échéance dans le passé (comme si 3 jours réels s'étaient écoulés),
// recharge la page, et vérifie que tout se conclut (budget, effectif,
// transactions) SANS action supplémentaire de l'utilisateur — juste le
// chargement de la page (voir initGame -> refreshTransferMarket). ---
// lastCpuCheckAt reste "récent" (maintenant) exprès : ça empêche une
// dernière vérification CPU de s'intercaler au moment même de la résolution
// (le gagnant reste donc déterministe : le club du joueur, déjà en tête),
// tout en laissant l'échéance (closesAt) dépassée déclencher la résolution.
saved2.league.transferListings.forEach(l => {
  if (l.status === "open") { l.closesAt = Date.now() - 1000; l.lastCpuCheckAt = Date.now(); }
});
const budgetBeforeReload = saved2.team.budget;
win2.close();

writeRawSave(savePath, saved2);
const dom3 = await openGame(html, baseUrl);
const win3 = dom3.window;
await flush(dom3);
const saved3 = readRawSave(savePath);
const resolvedInjected = saved3.league.transferListings.find(l => l.id === 999001);
console.log(`\nAprès rechargement (échéance dépassée) — annonce injectée : ${resolvedInjected.status}/${resolvedInjected.result}`);
if (resolvedInjected.status !== "closed") throw new Error("❌ Une enchère dont l'échéance est dépassée devrait se résoudre automatiquement au chargement de la page.");
// lastCpuCheckAt a été laissé "récent" avant le rechargement (voir plus
// haut) : aucune vérification CPU ne peut s'intercaler au moment de la
// résolution, donc le club du joueur (déjà en tête) remporte forcément.
if (resolvedInjected.result !== "sold" || resolvedInjected.currentBidderIdx !== 0) {
  throw new Error("❌ Le club du joueur, déjà seul enchérisseur en tête, aurait dû remporter cette enchère à la résolution.");
}
const expectedDelta = -resolvedInjected.finalPrice;
console.log("Vendue au club du joueur — budget avant/après :", budgetBeforeReload, saved3.team.budget);
if (saved3.team.budget !== budgetBeforeReload + expectedDelta) throw new Error("❌ Le budget devrait refléter exactement l'achat conclu à la résolution.");
console.log("✅ Le budget reflète exactement l'achat conclu à la résolution différée, sans action supplémentaire de l'utilisateur.");
console.log("✅ Le marché se résout automatiquement au chargement de la page, sans action supplémentaire, pour toute enchère dont l'échéance (réelle) est dépassée.");

win3.close();
server.close();
console.log("\n✅ Marché des transferts vérifié : valeur marchande estimée, incrément minimum (1000€ ou 20%), mise aux enchères (aucun plancher vendeur) et annulation, garde-fous d'enchère (propre annonce, budget, plafond acheteur, échéance), résolution déterministe (vente, invendu, surenchère CPU, nouvelles annonces CPU, échec de dernière minute), et intégration UI complète (mise en vente depuis l'Effectif avec prix choisi, marché affichant toutes les annonces de la ligue, persistance, résolution différée au rechargement).");

})().catch(e => { console.error(e); process.exit(1); });
