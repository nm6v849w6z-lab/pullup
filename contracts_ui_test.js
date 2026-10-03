// Contrats des joueurs, côté écran (demande validée 2026-10-01) : colonne
// « Contrat » de l'Effectif, carte « Contrat » de la fiche joueur (fin de
// contrat, offre de prolongation avec durée et salaire, indice d'après le
// seul écart avec le salaire demandé, tirage par le serveur), demande
// d'augmentation (Accepter), vente bloquée en seconde moitié de dernière
// saison, marché (salaire demandé, « Fin de contrat », « Agent libre »,
// prime de signature, durée du contrat jointe à l'enchère, ancien club
// exclu). Voir contracts_test.js (moteur/serveur).
const fs = require("fs");
const Engine = require("./engine.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

const tick = () => new Promise(r => setTimeout(r, 30));
const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);
async function until(fn, n = 60) { for (let i = 0; i < n; i++) { if (fn()) return true; await tick(); } return false; }

(async () => {
  const now = Date.now();
  const lg = Engine.generateMultiManagerLeague(["Lyon ContratsUI"], 1, now, { dailyAnchored: true, weekly: true });
  const idx = lg.teams.findIndex(t => t.isHuman);
  const me = lg.teams[idx];
  const season = lg.contractSeason();
  lg.teams.forEach(t => t.players.forEach(p => { p.contractUntilSeason = season + 2; }));
  // Seconde moitié de saison (vente bloquée en dernière saison).
  lg.lastEconomyTick = 6;
  const last = me.players[0];
  last.contractUntilSeason = season; last.form = 60; last.retiringAfterSeason = false;
  const raiser = me.players[1];
  raiser.salary = Math.round(Engine.askedSalary(raiser) / 2);
  raiser.raiseRequest = { asked: Engine.askedSalary(raiser), at: now, season };
  const former = me.players[2];
  lg._releaseToFreeAgency(me, idx, former, now);
  const cpuIdx = lg.teams.findIndex(t => !t.isHuman);
  const cpu = lg.teams[cpuIdx];
  const fa = cpu.players[0];
  lg._releaseToFreeAgency(cpu, cpuIdx, fa, now);
  const ending = cpu.players[1];
  ending.contractUntilSeason = season + 1;
  lg.lastEconomyTick = 1;
  const sale = lg.listPlayerForSale(cpuIdx, ending.id, 2000, now);
  ending.contractUntilSeason = season;
  lg.lastEconomyTick = 6;
  if (!sale) fail("annonce IA non créée.");
  me.budget = 2_000_000;

  const { server, multiSavePath, baseUrl } = await startTestServer();
  await store.saveMultiLeague(lg, multiSavePath);
  const dom = await openGame(html, `${baseUrl}?m=${me.managerLinkToken}`);
  const win = dom.window, doc = win.document;

  // 1) Effectif : colonne Contrat, badge « Fin de contrat ».
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "effectif").click();
  await tick();
  const heads = [...doc.querySelectorAll("#effectifSection thead th")].map(th => th.textContent.trim());
  if (!heads.some(h => /^Contrat/.test(h))) fail(`colonne « Contrat » absente : ${heads.join(" | ")}`);
  const row = [...doc.querySelectorAll("#effectifSection tr.eff-row")].find(tr => tr.textContent.includes(last.name));
  if (!row || !row.querySelector(".eff-td-contract .contract-end-badge")) fail("badge « Fin de contrat » absent de l'Effectif.");
  if (row.querySelector(".eff-td-contract").textContent.trim() !== "Fin de saison") fail(`dernière saison : « Fin de saison » attendu, obtenu ${row.querySelector(".eff-td-contract").textContent}`);
  const row2 = [...doc.querySelectorAll("#effectifSection tr.eff-row")].find(tr => tr.textContent.includes(raiser.name));
  // Fin du contrat affichée (« Fin S3 ») plutôt que des saisons restantes.
  if (row2.querySelector(".eff-td-contract").textContent.trim() !== `Fin S${raiser.contractUntilSeason}`) fail(`fin de contrat : ${row2.querySelector(".eff-td-contract").textContent}`);
  if (!row.querySelector(".eff-menu-blocked")) fail("menu de l'Effectif : la mise en vente devrait être bloquée.");
  ok("Effectif : colonne « Contrat » (fin du contrat « Fin S… », badge en dernière saison), mise en vente bloquée dans le menu");

  // 2) Fiche joueur : carte Contrat + offre de prolongation.
  win.eval(`showPlayerDetail(${idx}, ${JSON.stringify(last.id)})`);
  await tick();
  const card = doc.querySelector("#pdpContractCard");
  if (!card) fail("carte « Contrat » absente.");
  if (!new RegExp(`Fin de contrat\\s*Saison ${season}`).test(card.textContent) || !/Dernière saison/.test(card.textContent)) fail(`ligne de contrat : ${card.textContent}`);
  const sel = doc.querySelector("#pdpExtSeasons");
  const inp = doc.querySelector("#pdpExtSalary");
  if (!sel || sel.options.length !== 5 || sel.value !== "3") fail("durée : 1 à 5 saisons, 3 par défaut.");
  const asked = Number(inp.dataset.asked);
  if (Number(inp.max) !== asked || Number(inp.min) !== Engine.contractOfferFloor(asked)) fail(`bornes du salaire : ${inp.min}-${inp.max} (demandé ${asked})`);
  if (!card.textContent.includes("Salaire demandé")) fail("salaire demandé non indiqué.");
  if (!/Salaire demandé/.test(card.querySelector(".pdp-contract-asked").textContent)) fail("salaire demandé absent.");
  inp.value = String(Engine.contractOfferFloor(asked));
  inp.dispatchEvent(new win.Event("input", { bubbles: true }));
  if (!/Offre risquée/.test(doc.querySelector("#pdpExtHint").textContent)) fail("indice au plancher.");
  if (/%\s*de chances|renomm|prestige/i.test(card.textContent)) fail("aucune chance chiffrée ni renommée affichée.");
  const saleCard = doc.querySelector("#pdpSaleCard");
  if (!saleCard.querySelector(".pdp-sale-blocked") || doc.querySelector("#playerDetailListPrice")) fail("mise en vente : message de blocage attendu.");
  inp.value = String(asked);
  sel.value = "4";
  doc.querySelector("[data-contract-extend]").click();
  if (!await until(() => /accepte/.test((doc.querySelector("#pdpContractFeedback") || {}).textContent || ""))) fail(`retour de l'offre : ${(doc.querySelector("#pdpContractFeedback") || {}).textContent}`);
  const saved = (await store.loadMultiLeague(multiSavePath)).league.teams[idx].players.find(p => p.id === last.id);
  if (saved.contractUntilSeason !== season + 4 || saved.nextSalary !== asked) fail(`prolongation non enregistrée : ${saved.contractUntilSeason} / ${saved.nextSalary}`);
  if (!new RegExp(`Fin de contrat\\s*Saison ${season + 4}`).test(doc.querySelector("#pdpContractCard").textContent)) fail("carte non mise à jour.");
  ok("Fiche joueur : carte Contrat, offre de prolongation (1 à 5 saisons, salaire demandé -10 %), indice, vente bloquée, accord enregistré par le serveur");

  // 3) Demande d'augmentation : Accepter.
  win.eval(`showPlayerDetail(${idx}, ${JSON.stringify(raiser.id)})`);
  await tick();
  const box = doc.querySelector("#pdpRaiseBox");
  if (!box || !/demande/.test(box.textContent)) fail("demande d'augmentation absente.");
  if (!box.querySelector("[data-raise-counter]") || !box.querySelector("#pdpRaiseSalary") || !box.querySelector("[data-raise-refuse]")) fail("accepter / contre-offre / refuser attendus.");
  box.querySelector("[data-raise-accept]").click();
  if (!await until(() => /Augmentation accordée/.test((doc.querySelector("#pdpContractFeedback") || {}).textContent || ""))) fail("retour de l'augmentation.");
  const saved2 = (await store.loadMultiLeague(multiSavePath)).league.teams[idx].players.find(p => p.id === raiser.id);
  if (saved2.nextSalary !== raiser.raiseRequest.asked || saved2.raiseRequest) fail("augmentation non enregistrée.");
  ok("Demande d'augmentation : Accepter → salaire demandé la saison suivante (serveur)");

  // 4) Marché : salaire demandé, badges, durée jointe à l'enchère, ancien club.
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "marche").click();
  await tick();
  const cardOf = id => doc.querySelector(`#marketCard_${id}`);
  const lSale = cardOf(sale.id);
  if (!lSale) fail("annonce IA absente du marché.");
  if (!/Salaire demandé/.test(lSale.textContent) || !lSale.querySelector(".mk-badge-contract")) fail("salaire demandé / « Fin de contrat » absents.");
  const faListing = lg.transferListings.find(l => l.freeAgent && l.playerId === fa.id);
  const lFa = cardOf(faListing.id);
  if (!lFa || !lFa.querySelector(".mk-badge-fa") || !/Prime de signature/.test(lFa.textContent)) fail("annonce d'agent libre : badge / prime de signature.");
  // Règle du 2026-10-03 : durée et salaire négociés AVANT l'enchère.
  if (!lFa.querySelector(`#negoSeasons_${faListing.id}`) || lFa.querySelector(`[data-bid-listing="${faListing.id}"]`)) fail("négociation du contrat absente (ou enchère ouverte sans accord).");
  const exListing = lg.transferListings.find(l => l.freeAgent && l.playerId === former.id);
  const lEx = cardOf(exListing.id);
  if (!lEx || !lEx.querySelector(".mk-former-club") || lEx.querySelector("[data-bid-listing]") || lEx.querySelector("[data-mk-negotiate]")) fail("ancien club : enchère interdite.");
  doc.querySelector(`#negoSeasons_${faListing.id}`).value = "4";
  lFa.querySelector(`[data-mk-negotiate="${faListing.id}"]`).click();
  if (!await until(() => !!doc.querySelector(`#bid_${faListing.id}`), 100)) fail("accord au salaire demandé : enchère toujours fermée.");
  doc.querySelector(`#bid_${faListing.id}`).value = "5000";
  cardOf(faListing.id).querySelector(`[data-bid-listing="${faListing.id}"]`).click();
  await win.__lastSave;
  await until(() => false, 15);
  const reloaded = (await store.loadMultiLeague(multiSavePath)).league.transferListings.find(l => l.id === faListing.id);
  const deal = reloaded && reloaded.agreements && reloaded.agreements[`l:${idx}`];
  if (!reloaded || reloaded.currentBid !== 5000 || !deal || deal.seasons !== 4) fail(`enchère / accord non enregistrés : ${JSON.stringify(reloaded && { bid: reloaded.currentBid, deal })}`);
  ok("Marché : salaire demandé, « Fin de contrat », « Agent libre » + prime de signature, accord (4 saisons) avant l'enchère (serveur), ancien club exclu");

  server.close();
  console.log("\n🏁 contracts_ui_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
