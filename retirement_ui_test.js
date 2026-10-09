// Retraite des joueurs, côté écran (retour utilisateur, 2026-09-28) :
// pastille « Dernière saison » dans l'Effectif et sur la fiche d'un
// adversaire, encadré sur la fiche joueur (citation, indice sans
// pourcentage, bouton « Le convaincre de continuer »), tirage fait par le
// serveur (/api/player/retirement-talk) et appliqué tel quel ; demande de
// transfert : une seule discussion (bouton remplacé après un échec).
// Voir aussi retirement_test.js (moteur/serveur).
const fs = require("fs");
const Engine = require("./engine.js");
const { dailyAnchoredCalendarConfig } = require("./server/calendar.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();

const tick = () => new Promise(r => setTimeout(r, 30));
const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);

(async () => {
  const lg = Engine.generateMultiManagerLeague(["Lyon RetraiteUI"], 1, Date.now(), dailyAnchoredCalendarConfig());
  const idx = lg.teams.findIndex(t => t.isHuman);
  const me = lg.teams[idx];
  const vet = me.players[0];
  vet.age = 35; vet.form = 70;
  vet.retiringAfterSeason = true; vet.retirementWeeks = 0; vet.retirementTalks = [];
  vet.retirementQuote = `"Une dernière saison", annonce ${vet.name}.`;
  const unhappy = me.players[1];
  unhappy.form = 5; unhappy.transferRequestActive = true; unhappy.transferRequestQuote = "Je veux partir.";
  const oppIdx = lg.teams.findIndex(t => !t.isHuman);
  const oppVet = lg.teams[oppIdx].players[0];
  oppVet.age = 38; oppVet.retiringAfterSeason = true;

  const { server, multiSavePath, baseUrl } = await startTestServer();
  await store.saveMultiLeague(lg, multiSavePath);
  const dom = await openGame(html, `${baseUrl}?m=${me.managerLinkToken}`);
  const win = dom.window, doc = win.document;

  // Effectif : pastille.
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "effectif").click();
  await tick();
  const row = [...doc.querySelectorAll("#effectifSection tr.eff-row")].find(tr => tr.textContent.includes(vet.name));
  if (!row || !row.querySelector(".retirement-badge")) fail("pastille « Dernière saison » absente de l'Effectif.");
  if (!/Dernière saison/.test(row.querySelector(".retirement-badge").textContent)) fail("libellé de la pastille.");
  ok("Effectif : pastille « Dernière saison »");

  // Fiche joueur : encadré + indice + bouton.
  win.eval(`showPlayerDetail(${idx}, ${JSON.stringify(vet.id)})`);
  await tick();
  const notice = doc.querySelector("#playerDetailContent .retirement-notice");
  if (!notice) fail("encadré de retraite absent de la fiche joueur.");
  if (!notice.textContent.includes("Une dernière saison")) fail("citation absente.");
  if (!/Il hésite encore|Il semble décidé/.test(notice.textContent)) fail(`indice absent : ${notice.textContent}`);
  if (/%/.test(notice.textContent)) fail("aucun pourcentage ne doit être affiché.");
  const btn = notice.querySelector("[data-retirement-talk]");
  if (!btn) fail("bouton « Le convaincre de continuer » absent.");
  if (!/début de saison/.test(notice.textContent)) fail("période en cours non indiquée.");
  ok("Fiche joueur : citation, indice sans pourcentage, bouton « Le convaincre de continuer » (début de saison)");

  // Clic : tirage serveur (échec forcé côté serveur).
  const realRandom = Math.random;
  Math.random = () => 0.999999;
  try {
    btn.click();
    for (let i = 0; i < 20 && !doc.querySelector("#playerDetailTransferRequestFeedback .gain-line"); i++) await tick();
  } finally { Math.random = realRandom; }
  const feedback = doc.querySelector("#playerDetailTransferRequestFeedback");
  if (!feedback || !/n'est pas convaincu/.test(feedback.textContent)) fail(`retour après échec : ${feedback && feedback.textContent}`);
  const after = doc.querySelector("#playerDetailContent .retirement-notice");
  if (after.querySelector("[data-retirement-talk]")) fail("bouton encore actif après une tentative sur la période.");
  if (!/Prochaine discussion possible en milieu de saison/.test(after.textContent)) fail(`prochaine période non indiquée : ${after.textContent}`);
  const saved = (await store.loadMultiLeague(multiSavePath)).league.teams[idx].players.find(p => p.id === vet.id);
  if (JSON.stringify(saved.retirementTalks) !== "[0]") fail(`tentative non enregistrée côté serveur : ${JSON.stringify(saved.retirementTalks)}`);
  ok("Clic : tirage serveur appliqué, « Prochaine discussion possible en milieu de saison », tentative enregistrée côté serveur");

  // Demande de transfert : une seule discussion.
  win.eval(`showPlayerDetail(${idx}, ${JSON.stringify(unhappy.id)})`);
  await tick();
  const dBtn = doc.querySelector("#playerDetailContent [data-discuss-transfer-request]");
  if (!dBtn) fail("bouton « Discuter avec le joueur » absent.");
  Math.random = () => 0.999999;
  try {
    dBtn.click();
    for (let i = 0; i < 20 && !doc.querySelector("#playerDetailTransferRequestFeedback .gain-line"); i++) await tick();
  } finally { Math.random = realRandom; }
  if (doc.querySelector("#playerDetailContent [data-discuss-transfer-request]")) fail("le bouton « Discuter » devrait disparaître après une discussion ratée.");
  if (!doc.querySelector("#playerDetailContent .transfer-request-discussed")) fail("mention « déjà discuté » absente.");
  ok("Demande de transfert : après une discussion ratée, plus de bouton, mention « déjà discuté »");

  // Fiche d'une équipe adverse : pastille visible, pas de bouton.
  win.eval(`showPlayerDetail(${oppIdx}, ${JSON.stringify(oppVet.id)})`);
  await tick();
  const oppNotice = doc.querySelector("#playerDetailContent .retirement-notice");
  if (!oppNotice) fail("encadré absent sur la fiche d'un joueur adverse.");
  if (oppNotice.querySelector("[data-retirement-talk]")) fail("pas de bouton sur un joueur adverse.");
  ok("Joueur adverse : annonce visible, sans bouton");

  dom.window.close();
  server.close();
  console.log("\n🏁 retirement_ui_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
