// Vérifie le retour utilisateur (2026-09) : "il faudrait de vrais pages
// équipes et pas seulement une fenêtre qui s'ouvre en dessous [...]
// Calendrier, Classement [...] Marché [...] je dois pouvoir cliquer sur le
// nom des équipes et ouvrir la page de leur équipe [...] sur l'onglet
// marché, je dois pouvoir cliquer sur le nom de l'équipe qui vend" et "quand
// je clique sur la page d'un joueur qui est en vente, je dois pouvoir voir
// ses carac (comme sur le marché des transferts)".
//
// La fiche équipe elle-même (contenu du scoutisme, verrouillage/révélation
// des caractéristiques, "← Retour" vers l'origine) est déjà couverte en
// détail par client_scouting_test.js, qui l'ouvre depuis le Classement. Ce
// fichier-ci se concentre sur les DEUX AUTRES points d'entrée (Calendrier,
// Marché) et sur le déverrouillage des caractéristiques d'un joueur sur le
// marché, depuis sa fiche complète.
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

// ---------------------------------------------------------------------
// Partie 1 : Calendrier, le nom de l'adversaire est un lien vers sa fiche
// équipe, "← Retour" ramène bien vers le Calendrier.
// ---------------------------------------------------------------------
clickTab("calendrier");
const calRows = [...doc.querySelectorAll("#calendrierContent table tbody tr")];
if (!calRows.length) throw new Error("❌ (setup) Le calendrier devrait afficher au moins une ligne.");
const calLink = calRows.map(r => r.querySelector("[data-team-idx]")).find(Boolean);
console.log("Lien d'équipe trouvé dans le calendrier :", !!calLink);
if (!calLink) throw new Error("❌ BUG NON CORRIGÉ : aucun nom d'équipe cliquable trouvé dans le calendrier.");
const calOpponentIdx = Number(calLink.dataset.teamIdx);
const calOpponentName = win.eval(`league.teams[${calOpponentIdx}].name`);
calLink.click();
const teamDetailVisibleFromCal = !doc.getElementById("teamDetailSection").classList.contains("hidden");
const teamDetailNameFromCal = doc.getElementById("teamDetailName").textContent;
console.log(`Fiche équipe ouverte depuis le Calendrier : visible=${teamDetailVisibleFromCal} | titre="${teamDetailNameFromCal}" (attendu de contenir "${calOpponentName}")`);
if (!teamDetailVisibleFromCal) throw new Error("❌ Cliquer sur un adversaire dans le Calendrier devrait ouvrir la fiche équipe.");
if (!teamDetailNameFromCal.includes(calOpponentName)) throw new Error("❌ La fiche équipe ouverte depuis le Calendrier devrait être celle du bon adversaire.");
doc.getElementById("closeTeamDetailBtn").click();
const backOnCalendrier = !doc.getElementById("calendrierSection").classList.contains("hidden");
const calTabActive = [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "calendrier").classList.contains("active");
console.log(`"← Retour" ramène bien vers le Calendrier : ${backOnCalendrier} (onglet actif : ${calTabActive})`);
if (!backOnCalendrier || !calTabActive) throw new Error("❌ \"← Retour\" depuis une fiche ouverte depuis le Calendrier devrait y ramener exactement.");
console.log("✅ Le Calendrier ouvre bien une vraie fiche équipe pour l'adversaire, et \"← Retour\" ramène à l'origine.");

// ---------------------------------------------------------------------
// Partie 2 : Marché, met en vente un joueur adverse, vérifie que le nom du
// VENDEUR (pas le vôtre) est cliquable vers sa fiche équipe, et que les
// caractéristiques du joueur mis en vente sont déverrouillées sur sa fiche
// complète (même règle que sur la carte du marché elle-même).
// ---------------------------------------------------------------------
const league = win.eval("league");
const myTeamIndex = win.eval("myTeamIndex");
const sellerIdx = myTeamIndex === 1 ? 2 : 1;
const sellerTeam = league.teams[sellerIdx];
// Le marché CPU peut déjà avoir mis en vente un ou plusieurs joueurs de
// cette équipe avant même le début du test (annonces générées
// automatiquement, voir refreshMarket) : listPlayerForSale refuse une
// annonce sur un joueur déjà listé (this.transferListings.some(...)), donc
// on cherche explicitement un joueur SANS annonce ouverte plutôt que de
// supposer que players[0] est libre.
const alreadyListedIds = new Set(
  league.transferListings.filter(l => l.status === "open").map(l => l.playerId)
);
const listedPlayer = sellerTeam.players.find(p => !alreadyListedIds.has(p.id));
if (!listedPlayer) throw new Error("❌ (setup) Tous les joueurs de l'équipe vendeuse sont déjà en vente, impossible de préparer le test.");
// Sélecteur ciblé sur data-listing-id (pas juste ".market-card[data-listing-id]",
// le premier venu) : le marché peut déjà contenir d'autres annonces CPU
// générées entre-temps, il ne faut donc pas supposer que la nôtre est la
// première affichée.
const listing = league.listPlayerForSale(sellerIdx, listedPlayer.id, 50000, Date.now());
if (!listing) throw new Error("❌ (setup) La mise en vente du joueur de test a échoué.");

clickTab("marche");
win.renderMarcheSection();
// Désambiguïsation par le joueur mis en vente (`data-player-id`), pas
// seulement par `data-listing-id` : ce test crée son annonce directement
// sur `league` côté client (même optimisme que le vrai bouton "Mettre aux
// enchères", voir listBtn plus haut dans moteurbasket3.html), dont le
// compteur `uid()` est indépendant de celui du serveur qui a déjà généré
// les annonces CPU automatiques (refreshMarket). Les deux compteurs
// démarrent chacun à 1 et ne se coordonnent jamais : une collision d'id
// entre une annonce CPU authentique et celle-ci est donc possible (bug
// d'architecture préexistant, indépendant du présent test), auquel cas
// `[data-listing-id="X"]` seul matcherait DEUX cartes différentes et
// `querySelector` pourrait retourner celle de la mauvaise annonce.
const matchingCards = [...doc.querySelectorAll(`.market-card[data-listing-id="${listing.id}"]`)];
const marketCard = matchingCards.find(c => c.querySelector(`[data-player-id="${listedPlayer.id}"]`));
if (!marketCard) throw new Error("❌ (setup) Le marché devrait afficher la carte du joueur mis en vente.");
const sellerLink = marketCard.querySelector(".market-card-meta [data-team-idx]");
console.log("\nLien vers l'équipe vendeuse trouvé sur la carte du marché :", !!sellerLink);
if (!sellerLink) throw new Error("❌ BUG NON CORRIGÉ : le nom de l'équipe vendeuse n'est pas cliquable sur le marché.");
if (Number(sellerLink.dataset.teamIdx) !== sellerIdx) throw new Error(`❌ Le lien vendeur devrait pointer vers l'équipe ${sellerIdx}, obtenu ${sellerLink.dataset.teamIdx}.`);
sellerLink.click();
const teamDetailVisibleFromMarket = !doc.getElementById("teamDetailSection").classList.contains("hidden");
console.log("Fiche équipe ouverte depuis le Marché :", teamDetailVisibleFromMarket, "| titre :", doc.getElementById("teamDetailName").textContent);
if (!teamDetailVisibleFromMarket || !doc.getElementById("teamDetailName").textContent.includes(sellerTeam.name)) {
  throw new Error("❌ Cliquer sur le nom de l'équipe vendeuse devrait ouvrir SA fiche équipe.");
}
console.log("✅ Le nom de l'équipe vendeuse est bien cliquable sur le Marché, et ouvre sa fiche équipe.");

// Retour au marché, ouverture de la fiche complète du joueur mis en vente.
doc.getElementById("closeTeamDetailBtn").click();
clickTab("marche");
win.renderMarcheSection();
// Même désambiguïsation qu'au-dessus (collision possible sur
// data-listing-id) : cherche directement par data-player-id, sans jamais
// dépendre de quelle carte "market-card" portant cet id `querySelector`
// choisirait en cas de collision.
const playerLink = doc.querySelector(`.market-card-name [data-player-id="${listedPlayer.id}"]`);
if (!playerLink) throw new Error("❌ (setup) Le nom du joueur mis en vente devrait être cliquable.");
playerLink.click();
// Depuis la nouvelle fiche joueur (retour utilisateur, 2026-09, maquette
// "Adama Kovac") : les Caractéristiques sont affichées en grille
// (.player-attr-grid), plus en table.roster-table, voir renderPlayerDetail.
const attrCells = [...doc.querySelectorAll("#playerDetailContent .player-attr-grid .attr-cell")];
const lockedOnPlayerPage = attrCells.filter(cell => cell.classList.contains("attr-locked")).length;
console.log(`\nCellules verrouillées sur la fiche complète d'un joueur EN VENTE : ${lockedOnPlayerPage} (attendu 0, comme sur la carte du marché)`);
if (lockedOnPlayerPage !== 0) {
  throw new Error(`❌ BUG NON CORRIGÉ : les caractéristiques d'un joueur mis en vente devraient être déverrouillées sur sa fiche complète (comme sur le marché), obtenu ${lockedOnPlayerPage} cellules verrouillées.`);
}
const marketNoticeShown = doc.getElementById("playerDetailContent").textContent.includes("aux enchères sur le marché");
console.log("Mention \"aux enchères sur le marché\" affichée sur la fiche :", marketNoticeShown);
if (!marketNoticeShown) throw new Error("❌ La fiche joueur devrait expliquer pourquoi ses caractéristiques sont visibles (mise en vente).");
console.log("✅ Les caractéristiques d'un joueur mis en vente sont bien déverrouillées sur sa fiche complète, avec une mention explicative.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests team_detail_page_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
