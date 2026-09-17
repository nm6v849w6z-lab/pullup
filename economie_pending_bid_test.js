// Vérifie #56 (retour utilisateur, 2026-09) : "dans l'onglet économie, quand
// un joueur est en vente, s'il y a enchère, il faut qu'apparaisse le montant
// dans une ligne transaction". Voir renderEconomieSection dans
// moteurbasket3.html. AUCUNE nouvelle donnée persistée : la ligne est
// reconstituée à la volée depuis league.transferListings (déjà là pour le
// Marché), jamais comptée dans le total (pas encore réglée, voir le
// commentaire dédié dans renderEconomieSection).
const fs = require("fs");
const { startTestServer, openGame, flush, writeRawSave, readRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const E = require("./engine.js");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();

// --- Partie 1 : mon annonce sans aucune enchère, pas de ligne "en cours"
// (rien à afficher tant que personne n'a enchéri). Un premier aller-retour
// serveur (flush) JUSTE avant l'écriture directe du fichier, puis fermeture
// IMMÉDIATE de la fenêtre (aucun await entre les deux), sinon une
// sauvegarde automatique en arrière-plan de cette fenêtre (état ancien, en
// mémoire) pourrait écraser l'annonce injectée ici avant même la partie 2
// (même piège que documenté dans salle_upgrade_confirm_test.js).
const dom1 = await openGame(html, baseUrl);
await flush(dom1);
let saved = readRawSave(savePath);
const myPlayerId = saved.league.teams[0].players[0].id;
saved.league.transferListings.push({
  id: 777001, playerId: myPlayerId, sellerIdx: 0,
  startPrice: 40000, currentBid: null, currentBidderIdx: null, bids: [],
  createdAt: Date.now(), closesAt: Date.now() + E.TRANSFER_AUCTION_DURATION_MS,
  lastCpuCheckAt: Date.now(), status: "open", result: null, finalPrice: null,
});
writeRawSave(savePath, saved);
dom1.window.close();

const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;
[...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "economie").click();
let transactionsText = doc2.getElementById("economieTransactions").textContent;
console.log("Journal des transactions (annonce SANS enchère) :", transactionsText.replace(/\s+/g, " ").trim().slice(0, 200));
if (transactionsText.includes("Enchère en cours")) {
  throw new Error("❌ Aucune ligne 'Enchère en cours' ne devrait apparaître tant que personne n'a enchéri sur l'annonce.");
}
console.log("✅ Pas de ligne 'Enchère en cours' pour une annonce sans aucune enchère.");
await flush(dom2);
dom2.window.close();

// --- Partie 2 : une enchère est placée sur mon annonce, la ligne doit
// apparaître dans le journal, avec le bon montant, et ne pas être comptée
// dans le total (pas encore réglée). ---
saved = readRawSave(savePath);
const myListing = saved.league.transferListings.find(l => l.id === 777001);
myListing.currentBid = 45000;
myListing.currentBidderIdx = 3;
writeRawSave(savePath, saved);

const dom3 = await openGame(html, baseUrl);
const doc3 = dom3.window.document;
const win3 = dom3.window;
[...doc3.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "economie").click();
transactionsText = doc3.getElementById("economieTransactions").textContent.replace(/\s+/g, " ").trim();
console.log("\nJournal des transactions (annonce AVEC enchère) :", transactionsText.slice(0, 250));
const playerName = win3.eval(`league.playerById(${myPlayerId}).name`);
if (!transactionsText.includes("Enchère en cours") || !transactionsText.includes(playerName) || !transactionsText.includes("45 000")) {
  throw new Error("❌ Une ligne 'Enchère en cours' devrait apparaître avec le nom du joueur et le montant de l'enchère (45 000 €), obtenu : " + transactionsText);
}
console.log("✅ La ligne 'Enchère en cours' apparaît avec le nom du joueur et le montant exact de l'enchère.");

const pendingLine = [...doc3.querySelectorAll("#economieTransactions .gain-line")].find(l => l.textContent.includes("Enchère en cours"));
if (!pendingLine || !pendingLine.classList.contains("gain-pending")) {
  throw new Error("❌ La ligne d'enchère en cours devrait avoir une classe visuelle neutre (gain-pending), ni gain-up ni gain-down, pour ne pas la confondre avec une transaction réglée.");
}
console.log("✅ La ligne d'enchère en cours a bien un style visuel distinct (pas encore réglée).");

// Le total affiché ne doit PAS inclure ce montant (l'enchère n'est pas
// réglée), et le solde en début de semaine (economieBudgetStart) non plus.
const totalLine = doc3.querySelector("#economieTransactions .gain-line-total");
const budgetNow = win3.eval("teamA.budget");
console.log("\nBudget actuel :", budgetNow, "| Ligne total affichée :", totalLine ? totalLine.textContent.trim() : "(aucune, aucune transaction réglée)");
if (totalLine && /45[\s ]?000/.test(totalLine.textContent)) {
  throw new Error("❌ Le total du journal ne devrait pas inclure une enchère en cours, non réglée.");
}
console.log("✅ L'enchère en cours n'est comptée ni dans le total du journal ni dans le budget (pas encore réglée).");

await flush(dom3);
dom3.window.close();
server.close();

console.log("\n🏁 Tous les tests de l'enchère en cours affichée dans l'onglet Économie sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
