// Historique des transferts (retour utilisateur 2026-10-05) : entrées
// persistantes par club (Team.transferHistory, voir engine.js:
// recordTeamTransfer), onglet « Transferts » de la fiche équipe, « Mon
// historique » du Marché, noms de clubs et de joueurs cliquables, bilan
// (dépenses, recettes, solde = recettes − dépenses).
const assert = require("assert");
const fs = require("fs");
const Engine = require("./engine.js");
require("./test_transfer_agreement_helper.js")(Engine);
const store = require("./server/store.js");
const WorldMarket = require("./server/worldMarket.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const ok = m => console.log("✅ " + m);
const DAY = 24 * 3600 * 1000;

function sale(lg, sellerIdx, buyerIdx, playerId, price, now) {
  lg.teams[buyerIdx].budget = Math.max(lg.teams[buyerIdx].budget, price * 3 + 10_000_000);
  const l = lg.listPlayerForSale(sellerIdx, playerId, 1000, now);
  assert.ok(l && l.id, "annonce créée");
  const b = lg.placeBid(l.id, buyerIdx, price, now);
  assert.ok(b.ok, JSON.stringify(b));
  lg._resolveListing(l, l.closesAt);
  assert.strictEqual(l.result, "sold", `vente ${l.result}`);
  return l;
}
const kinds = t => t.transferHistory.map(e => e.kind);

(async () => {
  let now = Date.UTC(2026, 9, 1, 10);
  const lg = store.createMultiManagerCareer(["Lyon TH", "Paris TH"], now).league;
  lg.leagueId = "fr-1";
  const A = 0, B = 1;
  const ai = lg.teams.findIndex(t => !t.isHuman);
  const lyon = lg.teams[A], paris = lg.teams[B], cpu = lg.teams[ai];

  // 1) Plusieurs achats successifs (Lyon achète 2 joueurs de Paris, 1 de l'IA).
  const p1 = paris.players[0], p2 = paris.players[1], p3 = cpu.players[0];
  sale(lg, B, A, p1.id, 12_500_000, now += DAY);
  sale(lg, B, A, p2.id, 3_000_000, now += DAY);
  sale(lg, ai, A, p3.id, 500_000, now += DAY);
  assert.deepStrictEqual(kinds(lyon).slice(0, 3), ["buy", "buy", "buy"]);
  assert.deepStrictEqual(kinds(paris).slice(0, 2), ["sell", "sell"]);
  const e1 = lyon.transferHistory.find(e => e.playerId === p1.id);
  assert.ok(e1.dir === "in" && e1.fee === 12_500_000 && e1.from.name === "Paris TH" && e1.from.idx === B && e1.from.leagueId === "fr-1" && e1.to.idx === A && e1.human === true);
  const s1 = paris.transferHistory.find(e => e.playerId === p1.id);
  assert.ok(s1.dir === "out" && s1.fee === 12_500_000 && s1.to.name === "Lyon TH" && s1.id.replace(/:out$/, "") === e1.id.replace(/:in$/, ""), "même mouvement, deux entrées");
  assert.ok(cpu.transferHistory.some(e => e.kind === "sell" && e.playerId === p3.id && e.human === false), "vente de l'IA notée chez l'IA, pas comme opération d'un manager");
  ok("achats successifs : arrivée chez l'acheteur, départ chez le vendeur, prix, provenance");

  // 2) Plusieurs ventes successives + achat puis revente du même joueur.
  const q1 = lyon.players.find(p => p.id !== p1.id && p.id !== p2.id && p.id !== p3.id);
  sale(lg, A, B, q1.id, 2_000_000, now += DAY);
  sale(lg, A, ai, p2.id, 4_000_000, now += DAY); // revente de p2
  const p2Lyon = lyon.transferHistory.filter(e => e.playerId === p2.id).map(e => e.kind);
  assert.deepStrictEqual(p2Lyon, ["sell", "buy"], "achat puis revente du même joueur : 2 lignes");
  assert.ok(paris.transferHistory.some(e => e.playerId === p2.id && e.kind === "sell"), "le premier départ de p2 reste chez Paris après la revente");
  ok("ventes successives, achat puis revente : chaque mouvement reste visible");

  // 3) Agent libre : licenciement chez Lyon, signature chez Paris (prime).
  const r = lyon.players.find(p => ![p1.id, p2.id, p3.id, q1.id].includes(p.id));
  lyon.budget = 50_000_000;
  const rel = lg.releasePlayer(A, r.id, now += DAY);
  assert.ok(rel.ok, JSON.stringify(rel));
  const relE = lyon.transferHistory[0];
  assert.ok(relE.kind === "release" && relE.dir === "out" && relE.fee === 0 && relE.to === null && relE.human === true && relE.indemnity === rel.fee);
  const fa = lg.transferListings.find(l => l.status === "open" && l.freeAgent && l.playerId === r.id);
  paris.budget = 50_000_000;
  assert.ok(lg.placeBid(fa.id, B, 150_000, now).ok);
  lg._resolveListing(fa, fa.closesAt);
  const fe = paris.transferHistory[0];
  assert.ok(fe.kind === "free_in" && fe.from === null && fe.fee === 150_000 && fe.formerClub && fe.formerClub.name === "Lyon TH" && fe.formerClub.idx === A, JSON.stringify(fe));
  // Agent libre sans preneur → club de l'IA, 0 $.
  const r2 = paris.players.find(p => p.id !== r.id && p.id !== q1.id && p.id !== p1.id);
  assert.ok(lg.releasePlayer(B, r2.id, now += DAY).ok);
  const fa2 = lg.transferListings.find(l => l.status === "open" && l.freeAgent && l.playerId === r2.id);
  r2.age = 25;
  lg._resolveListing(fa2, fa2.closesAt);
  const cpuFree = lg.teams.flatMap(t => t.transferHistory).find(e => e.kind === "free_in" && e.playerId === r2.id);
  assert.ok(cpuFree && cpuFree.fee === 0 && cpuFree.human === false, "agent libre placé dans un club de l'IA à 0 $");
  ok("agents libres : licenciement (indemnité à part), signature avec prime, signature à 0 $ ; provenance « Agent libre »");

  // 4) Fin de contrat.
  const x = lyon.players[lyon.players.length - 1];
  x.contractUntilSeason = lg.contractSeason();
  lg.processContractExpiries(now += DAY, () => 0.99);
  assert.ok(lyon.transferHistory.some(e => e.kind === "expiry" && e.playerId === x.id && e.human === false), "fin de contrat notée, pas comme opération du manager");
  ok("fin de contrat : départ libre noté");

  // 5) Totaux et solde.
  const t = Engine.transferHistoryTotals(lyon.transferHistory);
  const buys = 12_500_000 + 3_000_000 + 500_000, sells = 2_000_000 + 4_000_000;
  assert.strictEqual(t.spent, buys);
  assert.strictEqual(t.earned, sells);
  assert.strictEqual(t.balance, sells - buys);
  const tp = Engine.transferHistoryTotals(paris.transferHistory);
  assert.strictEqual(tp.spent, 2_000_000 + 150_000, "prime de signature comptée en dépense");
  assert.strictEqual(tp.earned, 12_500_000 + 3_000_000);
  ok(`bilan Lyon : dépenses ${t.spent}, recettes ${t.earned}, solde ${t.balance} (= recettes − dépenses)`);

  // 6) Doublons et persistance.
  const before = lyon.transferHistory.length;
  assert.strictEqual(Engine.recordTeamTransfer(lyon, { id: e1.id.replace(/:in$/, ""), kind: "buy", player: p1, fee: 1 }), null, "même mouvement : refusé");
  assert.strictEqual(lyon.transferHistory.length, before);
  const reloaded = store.deserializeMultiLeague(JSON.parse(JSON.stringify(store.serializeMultiLeague(lg)))).league;
  assert.deepStrictEqual(reloaded.teams[A].transferHistory, lyon.transferHistory, "historique relu à l'identique");
  assert.strictEqual(reloaded.transferHistorySeeded, true);
  // p1 repart ensuite de Lyon : son arrivée passée reste visible.
  sale(lg, A, B, p1.id, 9_000_000, now += DAY);
  assert.ok(lyon.transferHistory.some(e => e.playerId === p1.id && e.kind === "buy") && lyon.transferHistory.some(e => e.playerId === p1.id && e.kind === "sell"));
  ok("aucun doublon ; historique persistant (sauvegarde) ; un ancien transfert reste après un nouveau départ du joueur");

  // 7) Ancienne sauvegarde : reprise unique depuis le journal des joueurs.
  {
    const old = store.createMultiManagerCareer(["Old A", "Old B"], now).league;
    const pl = old.teams[0].players[0];
    pl.historyLog = [{ type: "transfer", at: now - 10 * DAY, season: 1, from: "Old B", to: "Old A", fee: 777_000 }];
    const data = JSON.parse(JSON.stringify(store.serializeMultiLeague(old)));
    data.league.transferHistorySeeded = false;
    data.league.teams.forEach(tm => { delete tm.transferHistory; });
    const lg2 = store.deserializeMultiLeague(data).league;
    const a = lg2.teams[0].transferHistory.find(e => e.playerId === pl.id);
    const b = lg2.teams[1].transferHistory.find(e => e.playerId === pl.id);
    assert.ok(a && a.kind === "buy" && a.fee === 777_000 && b && b.kind === "sell" && b.fee === 777_000, "anciens transferts repris des deux côtés");
    const again = store.deserializeMultiLeague(JSON.parse(JSON.stringify(store.serializeMultiLeague(lg2)))).league;
    assert.strictEqual(again.teams[0].transferHistory.filter(e => e.playerId === pl.id).length, 1, "reprise faite une seule fois");
    ok("anciennes sauvegardes : transferts déjà notés sur les joueurs repris une seule fois");
  }

  // 8) Marché mondial : club d'un autre championnat.
  {
    const us = store.createMultiManagerCareer(["Boston TH"], now).league;
    us.leagueId = "us-1";
    const fr = store.createMultiManagerCareer(["Nice TH"], now).league;
    fr.leagueId = "fr-2";
    const sellerIdx = fr.teams.findIndex(tm => !tm.isHuman);
    const pw = fr.teams[sellerIdx].players[0];
    const l = fr.listPlayerForSale(sellerIdx, pw.id, 1000, now);
    us.teams[0].budget = 50_000_000;
    l.currentBidderIdx = Engine.FOREIGN_BIDDER_IDX; l.currentBidderRef = { leagueId: "us-1", idx: 0, name: "Boston TH" }; l.currentBid = 2_500_000;
    l.result = "foreign-pending"; l.status = "closed";
    l.agreements = { [Engine.autoBidKey(Engine.FOREIGN_BIDDER_IDX, l.currentBidderRef)]: { salary: l.askedSalary, seasons: 2, at: now } };
    WorldMarket.resolveForeignTransfers(new Map([["fr-2", fr], ["us-1", us]]), now, []);
    assert.strictEqual(l.result, "sold");
    const bi = us.teams[0].transferHistory[0], so = fr.teams[sellerIdx].transferHistory[0];
    assert.ok(bi.kind === "buy" && bi.from.leagueId === "fr-2" && bi.from.idx === sellerIdx && bi.fee === 2_500_000);
    assert.ok(so.kind === "sell" && so.to.leagueId === "us-1" && so.to.idx === 0 && so.to.name === "Boston TH");
    ok("marché mondial : arrivée à Boston (de Nice, autre championnat) et départ chez le vendeur, liens vers leur championnat");
  }

  // ------------------------------------------------------------------ UI
  {
    const { server, multiSavePath, baseUrl } = await startTestServer(() => Date.now());
    await store.saveMultiLeague(lg, multiSavePath);
    const dom = await openGame(html, `${baseUrl}?m=${lyon.managerLinkToken}`);
    const win = dom.window, doc = win.document;
    const myIdx = win.eval("myTeamIndex");
    assert.strictEqual(myIdx, A);
    win.eval(`showTeamDetail(${A})`);
    const tab = doc.querySelector('[data-team-detail-subview="transferts"]');
    assert.ok(tab && /Transferts/.test(tab.textContent), "onglet Transferts à côté d'Aperçu, Effectif, Calendrier, Analyse");
    tab.click();
    const rows = [...doc.querySelectorAll("#teamDetailContent .th-row")];
    assert.strictEqual(rows.length, win.eval("teamA.transferHistory.length"));
    const buyRow = rows.find(rw => rw.dataset.thKind === "buy" && rw.textContent.includes(p1.name));
    assert.ok(buyRow && /Arrivée/.test(buyRow.textContent) && buyRow.querySelector(".th-price").textContent.startsWith("−" + win.eval("formatMoney(12500000)")) && buyRow.querySelector(".th-price.in"), "arrivée : prix en dépense");
    assert.ok(buyRow.querySelector('.th-team[data-th-team="fr-1|1"]') && buyRow.querySelector(".th-team").textContent === "Paris TH", "provenance cliquable");
    const relRow = rows.find(rw => rw.dataset.thKind === "release");
    assert.ok(relRow && relRow.querySelector(".th-fa") && !relRow.querySelector(".th-fa").closest("button"), "« Agent libre » jamais cliquable");
    const sum = doc.querySelector("#teamDetailContent .th-sum");
    const tt = Engine.transferHistoryTotals(JSON.parse(win.eval("JSON.stringify(teamA.transferHistory)")));
    const fm = n => win.eval(`formatMoney(${n})`);
    assert.strictEqual(sum.querySelector(".th-spent").textContent, fm(tt.spent));
    assert.strictEqual(sum.querySelector(".th-earned").textContent, fm(tt.earned));
    assert.strictEqual(sum.querySelector(".th-balance").textContent, (tt.balance < 0 ? "−" : tt.balance > 0 ? "+" : "") + fm(Math.abs(tt.balance)));
    // Filtre Départs.
    doc.querySelector('[data-th-filter="out"]').click();
    assert.ok([...doc.querySelectorAll("#teamDetailContent .th-row")].every(rw => rw.classList.contains("out")), "filtre départs");
    assert.strictEqual(doc.querySelector("#teamDetailContent .th-spent").textContent, fm(tt.spent), "bilan toujours sur tout l'historique");
    doc.querySelector('[data-th-filter="all"]').click();
    ok("fiche équipe → Transferts : lignes, prix, provenance cliquable, Agent libre non cliquable, filtres, bilan");

    // Clic sur le club de provenance → fiche de Paris.
    doc.querySelector('#teamDetailContent .th-team[data-th-team="fr-1|1"]').click();
    assert.strictEqual(win.eval("teamDetailIdx"), B);
    // Historique d'un AUTRE club (Paris) : ses ventes.
    doc.querySelector('[data-team-detail-subview="transferts"]').click();
    const parisRows = [...doc.querySelectorAll("#teamDetailContent .th-row")];
    assert.ok(parisRows.some(rw => rw.dataset.thKind === "sell" && rw.textContent.includes(p1.name) && /Départ/.test(rw.textContent) && rw.querySelector('.th-team[data-th-team="fr-1|0"]')), "historique d'un autre club, destination cliquable");
    // Clic sur un joueur → sa fiche, là où il est aujourd'hui.
    const pBtn = [...doc.querySelectorAll("#teamDetailContent .th-player")].find(b => b.textContent === p1.name);
    pBtn.click();
    await win.__lastThPlayer;
    assert.strictEqual(win.eval("currentPlayerDetailRef && currentPlayerDetailRef.playerId"), p1.id, "fiche du joueur ouverte");
    ok("noms de clubs et de joueurs cliquables : fiche du club, fiche du joueur (club actuel)");

    // Marché → Mon historique.
    win.eval("TAB_HANDLERS.marche()");
    doc.getElementById("mkHistoryBtn").click();
    const panel = doc.getElementById("mkHistoryPanel");
    assert.ok(!panel.hidden && doc.querySelector(".mk-page").classList.contains("mk-history-on"));
    const mine = [...panel.querySelectorAll(".th-row")];
    const expected = JSON.parse(win.eval("JSON.stringify(teamA.transferHistory.filter(e => e.human))"));
    assert.strictEqual(mine.length, expected.length);
    assert.ok(!mine.some(rw => rw.dataset.thKind === "expiry"), "fin de contrat : pas une opération du manager");
    assert.ok(mine.some(rw => /Achat/.test(rw.textContent)) && mine.some(rw => /Vente/.test(rw.textContent)) && mine.some(rw => /Licenciement/.test(rw.textContent)));
    const mt = Engine.transferHistoryTotals(expected);
    assert.strictEqual(panel.querySelector(".th-spent").textContent, fm(mt.spent));
    assert.strictEqual(panel.querySelector(".th-earned").textContent, fm(mt.earned));
    assert.ok(/Mon bilan/.test(panel.textContent));
    doc.getElementById("mkHistoryBtn").click();
    assert.ok(panel.hidden, "retour au marché");
    ok("Marché → Mon historique : achats, ventes, licenciement du manager, bilan personnel");
    await flush(dom);
    dom.window.close(); server.close();
  }
  console.log("\n🏁 transfer_history_test.js : historique des transferts conforme.");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
