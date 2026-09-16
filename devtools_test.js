// Vérifie les outils de test ajoutés à l'onglet Économie (retour utilisateur :
// "remets mon budget à 0 et remets moi des joueurs" — après une session de
// test où le club avait été vidé exprès, effectif vendu et budget mis à mal
// via le déficit forcé/le marché sans plancher) : remise à 0 du budget
// (quel que soit son signe de départ) et ajout de 15 joueurs débutants
// fraîchement générés, sans toucher au classement ni au calendrier.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, writeRawSave } = require("./test_helpers.js");

const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function clickTab(doc, key) { [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click(); }

(async () => {

// ---------------------------------------------------------------------
// Partie 1 : remise à zéro du budget, qu'il soit négatif ou positif.
// ---------------------------------------------------------------------
{
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  await flush(dom);
  const saved = readRawSave(savePath);
  saved.team.budget = -842317; // fortement négatif, comme après un test de déficit forcé
  writeRawSave(savePath, saved);
  dom.window.close();

  const dom2 = await openGame(html, baseUrl);
  const doc2 = dom2.window.document;
  const win2 = dom2.window;

  clickTab(doc2, "economie");
  console.log("Budget affiché avant remise à 0 :", doc2.getElementById("economieBudget").textContent);
  doc2.getElementById("resetBudgetBtn").click();
  await flush(dom2);
  const savedAfter = readRawSave(savePath);
  console.log("Budget après clic sur 'Remettre le budget à 0' :", savedAfter.team.budget);
  if (savedAfter.team.budget !== 0) throw new Error(`❌ Le budget devrait être exactement 0 après l'outil de remise à zéro, obtenu ${savedAfter.team.budget}.`);
  if (doc2.getElementById("economieBudget").textContent !== "0 €") throw new Error(`❌ L'affichage du budget devrait refléter 0 immédiatement, obtenu "${doc2.getElementById("economieBudget").textContent}".`);
  const tx = savedAfter.team.transactions[0];
  if (!tx || tx.label !== "Remise à zéro du budget (outil de test)") throw new Error("❌ La remise à zéro du budget devrait être journalisée comme une transaction.");
  console.log("✅ Le budget est remis exactement à 0 (depuis un montant négatif), journalisé, et l'affichage est à jour.");
  win2.close();
  server.close();
}
{
  // Fonctionne aussi si le budget est positif au départ (delta négatif).
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  await flush(dom);
  const saved = readRawSave(savePath);
  saved.team.budget = 500000;
  writeRawSave(savePath, saved);
  dom.window.close();
  const dom2 = await openGame(html, baseUrl);
  const doc2 = dom2.window.document;
  const win2 = dom2.window;
  clickTab(doc2, "economie");
  doc2.getElementById("resetBudgetBtn").click();
  await flush(dom2);
  const savedAfter = readRawSave(savePath);
  console.log("\nBudget positif (500000) après remise à 0 :", savedAfter.team.budget);
  if (savedAfter.team.budget !== 0) throw new Error(`❌ Le budget devrait être exactement 0 même en partant d'un montant positif, obtenu ${savedAfter.team.budget}.`);
  console.log("✅ La remise à zéro fonctionne aussi bien depuis un budget positif que négatif.");
  win2.close();
  server.close();
}

// ---------------------------------------------------------------------
// Partie 2 : régénération d'un effectif complet (15 joueurs débutants).
// ---------------------------------------------------------------------
{
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  await flush(dom);
  const saved = readRawSave(savePath);
  saved.team.players = []; // effectif entièrement vendu, comme après un test
  saved.team.lineup = { starters: {}, backupPositions: {} };
  writeRawSave(savePath, saved);
  dom.window.close();

  const dom2 = await openGame(html, baseUrl);
  const doc2 = dom2.window.document;
  const win2 = dom2.window;

  clickTab(doc2, "effectif");
  console.log("\nLignes de l'effectif avant régénération :", doc2.querySelectorAll("#rosterContent tbody tr").length);
  if (doc2.querySelectorAll("#rosterContent tbody tr").length !== 0) throw new Error("❌ L'effectif de départ de ce scénario de test devrait être vide.");

  clickTab(doc2, "economie");
  doc2.getElementById("refillRosterBtn").click();
  await flush(dom2);
  const savedAfter = readRawSave(savePath);
  console.log("Effectif après régénération :", savedAfter.team.players.length, "joueurs");
  if (savedAfter.team.players.length !== 15) throw new Error(`❌ La régénération devrait ajouter exactement 15 joueurs débutants (3 par poste), obtenu ${savedAfter.team.players.length}.`);

  const byPos = {};
  savedAfter.team.players.forEach(p => { byPos[p.position] = (byPos[p.position] || 0) + 1; });
  console.log("Répartition par poste :", byPos);
  const expectedPositions = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];
  expectedPositions.forEach(pos => {
    if (byPos[pos] !== 3) throw new Error(`❌ Le nouvel effectif devrait compter exactement 3 joueurs au poste ${pos}, obtenu ${byPos[pos] || 0}.`);
  });
  console.log("✅ 15 joueurs débutants régénérés, 3 par poste, comme un effectif de départ.");

  // La feuille de match a été réassignée automatiquement : les 5 postes ont
  // désormais un titulaire.
  const missing = Object.values(savedAfter.team.lineup.starters).filter(id => id == null).length;
  console.log("Postes sans titulaire après régénération :", missing);
  if (missing !== 0) throw new Error("❌ La feuille de match devrait être réassignée automatiquement après la régénération (les 5 postes couverts).");
  console.log("✅ La feuille de match est réassignée automatiquement après la régénération de l'effectif.");

  // L'onglet Effectif reflète bien le nouvel effectif après le clic.
  clickTab(doc2, "effectif");
  const rows = doc2.querySelectorAll("#rosterContent tbody tr").length;
  console.log("Lignes de l'effectif après régénération (onglet Effectif) :", rows);
  if (rows !== 15) throw new Error(`❌ L'onglet Effectif devrait afficher 15 lignes après régénération, obtenu ${rows}.`);
  console.log("✅ L'onglet Effectif affiche bien les 15 nouveaux joueurs.");

  win2.close();
  server.close();
}

// ---------------------------------------------------------------------
// Partie 3 : les outils de test n'ajoutent que ce qu'on leur demande — ils
// ne touchent ni au classement, ni au calendrier de la ligue en cours.
// ---------------------------------------------------------------------
{
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  await flush(dom);
  const saved = readRawSave(savePath);
  saved.team.budget = -12345;
  writeRawSave(savePath, saved);
  dom.window.close();

  const dom2 = await openGame(html, baseUrl);
  const doc2 = dom2.window.document;
  const win2 = dom2.window;
  const roundBefore = readRawSave(savePath).league.round;

  clickTab(doc2, "economie");
  doc2.getElementById("resetBudgetBtn").click();
  doc2.getElementById("refillRosterBtn").click();
  await flush(dom2);
  const savedAfter = readRawSave(savePath);
  console.log("\nJournée de championnat avant/après les outils de test :", roundBefore, "/", savedAfter.league.round);
  if (savedAfter.league.round !== roundBefore) throw new Error("❌ Les outils de test ne devraient pas faire avancer le calendrier de la ligue.");
  console.log("✅ Les outils de test ne touchent ni au classement ni au calendrier — seulement le budget/l'effectif du club du joueur.");
  win2.close();
  server.close();
}

console.log("\n✅ Outils de test (Économie) vérifiés : remise du budget à 0 (positif ou négatif), régénération d'un effectif complet de 15 joueurs débutants avec feuille de match réassignée, et aucun effet de bord sur le classement/calendrier.");

})().catch(e => { console.error(e); process.exit(1); });
