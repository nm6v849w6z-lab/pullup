// « Mes enchères » (retour utilisateur 2026-09-29 : « il faudrait un endroit
// où on peut suivre ses enchères […] si qqun a surenchéri, comment je
// retrouve rapidement […] ? » puis « ou le marché des staffs ») :
//  - notification « Enchère dépassée » à chaque surenchère d'un autre club
//    (joueurs, staff, annonces des autres championnats), lien /#encheres ;
//  - GET /api/auctions/mine (server/myAuctions.js) ;
//  - navigateur : pastille rouge sur « Marché », staff dans « Mes
//    enchères » avec « Relancer » vers la page Staff, tâche du tableau de
//    bord, rafraîchissement depuis le serveur.
const assert = require("assert");
const fs = require("fs");
const Engine = require("./engine.js");
// Enchères d'avant la règle « accord avant l'enchère » (2026-10-03).
require("./test_transfer_agreement_helper.js")(Engine);
const store = require("./server/store.js");
const Push = require("./server/push.js");
const MyAuctions = require("./server/myAuctions.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const ok = m => console.log("✅ " + m);
const wait = async (cond, what) => { for (let i = 0; i < 100; i++) { if (cond()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error(`délai dépassé : ${what}`); };
const clone = lg => Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(lg))));

(async () => {
  const now = Date.now();
  const career = store.createMultiManagerCareer(["Lyon Ench", "Paris Ench"], now - 2 * 24 * 3600 * 1000, "Lyon Ench");
  const league = career.league;

  // 1) Notifications « Enchère dépassée ».
  {
    const lg = clone(league);
    const me = lg.teams[0];
    me.pushSince = now - 1000; me.pushAuctionKeys = []; me.marketWatchlist = [];
    const coach = lg.generateCoachCandidate(now);
    assert.ok(lg.placeCoachBid(coach.id, 0, coach.startPrice, now).ok);
    assert.strictEqual(Push.auctionNotes(lg, 0, now + 10).length, 0, "en tête : rien");
    assert.ok(lg.placeCoachBid(coach.id, 1, Engine.minNextBidFor(coach), now + 100).ok);
    let notes = Push.auctionNotes(lg, 0, now + 200);
    const out = notes.find(n => /^Enchère dépassée : l'entraîneur \(niveau \d\)$/.test(n.title));
    assert.ok(out, JSON.stringify(notes));
    assert.strictEqual(out.url, "/#encheres");
    assert.ok(/Relancez dès/.test(out.body) && /clôture dans/.test(out.body), out.body);
    assert.strictEqual(Push.auctionNotes(lg, 0, now + 300).length, 0, "pas deux fois pour la même surenchère");
    assert.ok(lg.placeCoachBid(coach.id, 0, Engine.minNextBidFor(coach), now + 400).ok);
    assert.strictEqual(Push.auctionNotes(lg, 0, now + 500).length, 0, "de nouveau en tête : rien");
    assert.ok(lg.placeCoachBid(coach.id, 1, Engine.minNextBidFor(coach), now + 600).ok);
    notes = Push.auctionNotes(lg, 0, now + 700);
    assert.strictEqual(notes.filter(n => /^Enchère dépassée/.test(n.title)).length, 1, "nouvelle surenchère : nouvelle note");
    assert.strictEqual(notes[0].tag, `out:coachListings:${coach.id}`, "même étiquette (remplace la précédente)");

    // Joueur de la ligue.
    const seller = lg.teams[5];
    const pl = seller.players[0];
    const l = lg.listPlayerForSale(5, pl.id, 1000, now);
    assert.ok(lg.placeBid(l.id, 0, 1000, now + 800).ok && lg.placeBid(l.id, 1, Engine.minNextBidFor(l), now + 900).ok);
    notes = Push.auctionNotes(lg, 0, now + 1000);
    assert.ok(notes.some(n => n.title === `Enchère dépassée : ${pl.name}`), JSON.stringify(notes));

    // Annonce d'un autre championnat (marché mondial).
    const other = store.createMultiManagerCareer(["Madrid Ench", "Rome Ench"], now - 2 * 24 * 3600 * 1000, "Madrid Ench").league;
    const fs2 = other.teams[4];
    const fp = fs2.players[0];
    const fl = other.listPlayerForSale(4, fp.id, 1000, now);
    assert.ok(other.placeForeignBid(fl.id, { leagueId: "fr-1", idx: 0, name: me.name }, me, 1000, now + 1100).ok);
    const leagues = new Map([["fr-1", lg], ["es-1", other]]);
    assert.strictEqual(Push.auctionNotes(lg, 0, now + 1200, { leagueId: "fr-1", leagues }).length, 0);
    assert.ok(other.placeBid(fl.id, 0, Engine.minNextBidFor(fl), now + 1300).ok, "un club de l'autre championnat surenchérit");
    notes = Push.auctionNotes(lg, 0, now + 1400, { leagueId: "fr-1", leagues });
    assert.ok(notes.some(n => n.title === `Enchère dépassée : ${fp.name}` && n.url === "/#encheres"), JSON.stringify(notes));
    assert.strictEqual(Push.auctionNotes(lg, 0, now + 1500, { leagueId: "fr-1", leagues }).length, 0);
  }
  ok("notification « Enchère dépassée » : staff, joueur de la ligue, annonce d'un autre championnat ; une par surenchère, lien vers « Mes enchères »");

  // 2) Serveur : GET /api/auctions/mine.
  const lg = league;
  const coach = lg.generateCoachCandidate(now);
  assert.ok(lg.placeCoachBid(coach.id, 0, coach.startPrice, now).ok);
  assert.ok(lg.placeCoachBid(coach.id, 1, Engine.minNextBidFor(coach), now + 1).ok);
  const seller = lg.teams[6];
  const l = lg.listPlayerForSale(6, seller.players[0].id, 1000, now);
  assert.ok(lg.placeBid(l.id, 0, 1000, now + 2).ok);
  const direct = MyAuctions.collect(lg, 0, now + 10);
  assert.ok(direct.staff.coachListings.some(x => x.id === coach.id && x.currentBidderIdx === 1));
  assert.ok(direct.transferListings.some(x => x.id === l.id && x.currentBidderIdx === 0));

  const { server, multiSavePath, baseUrl } = await startTestServer();
  await store.saveMultiLeague(lg, multiSavePath);
  const lyon = lg.teams[0];
  const r = await fetch(new URL("/api/auctions/mine", baseUrl), { headers: { "X-TipIn-Token": lyon.managerLinkToken } });
  const data = await r.json();
  assert.strictEqual(r.status, 200, JSON.stringify(data));
  assert.ok(data.staff.coachListings.some(x => x.id === coach.id && x.currentBidderIdx === 1), "enchère staff dépassée");
  assert.ok(data.transferListings.some(x => x.id === l.id && x.currentBidderIdx === 0), "enchère joueur en tête");
  ok("GET /api/auctions/mine : enchères joueurs et staff du club, à jour");

  // 3) Navigateur.
  const dom = await openGame(html, `${baseUrl}?m=${lyon.managerLinkToken}`);
  const win = dom.window, doc = win.document;
  if (win.eval("currentVisiblePageId()") === "catchupSection") doc.getElementById("catchupContinueBtn").click();
  const badge = doc.getElementById("marcheBadge");
  assert.ok(!badge.classList.contains("hidden") && badge.textContent === "1", `pastille : ${badge.className} « ${badge.textContent} »`);
  // Tableau de bord : tâche « Dépassé sur … ».
  const tasks = win.eval("dashBuildTasks(dashboardDataFromGameState())");
  // Spécialité de l'entraîneur affichée (entraînement v2, retour utilisateur 2026-10-01).
  const task = tasks.find(t => /^Dépassé sur Entraîneur niveau \d \(Spécialité (Attaque|Défense|Physique|Jeunes)\)$/.test(t.title));
  assert.ok(task && task.cta.label === "Relancer" && task.cta.href === `/enchere/staff/coach/${coach.id}`, JSON.stringify(tasks.map(t => t.title)));
  // Mes enchères : ligne staff + ligne joueur.
  win.eval("TAB_HANDLERS.marche()");
  const list = doc.getElementById("marketMineList");
  const staffRow = list.querySelector(`[data-mk-staff-task="coach:${coach.id}"]`);
  assert.ok(staffRow && /Dépassé/.test(staffRow.textContent) && /Relancer/.test(staffRow.textContent), list.innerHTML.slice(0, 300));
  assert.ok(list.querySelector(`[data-mk-task="${l.id}"]`) && /En tête/.test(list.querySelector(`[data-mk-task="${l.id}"]`).textContent));
  assert.strictEqual(list.firstElementChild, staffRow, "dépassé en premier");
  doc.querySelector('[data-mk-mtab="staff"]').click();
  assert.strictEqual(doc.getElementById("marketMineList").querySelectorAll(".mk-task").length, 1, "onglet Staff");
  doc.querySelector(`[data-staff-goto="coach:${coach.id}"]`).click();
  // Staff v2 (2026-10-01) : les enchères staff vivent dans le Marché, mode Staff.
  assert.strictEqual(win.eval("currentVisiblePageId()"), "marcheSection");
  assert.ok(win.eval(`marketUi.mode === "staff" && marketUi.sRole === "coach"`));
  assert.ok(doc.getElementById(`marketStaffCard_coach_${coach.id}`), "carte du candidat dans le Marché");
  assert.ok(doc.getElementById(`coachBid_${coach.id}`), "champ d'offre du candidat affiché");
  await wait(() => doc.activeElement && doc.activeElement.id === `coachBid_${coach.id}`, "champ d'offre sélectionné");
  // Lien de la notification.
  win.eval("TAB_HANDLERS.club()");
  win.location.hash = "#encheres";
  await wait(() => win.eval("currentVisiblePageId()") === "marcheSection", "#encheres ouvre le Marché");
  ok("navigateur : pastille rouge sur Marché, staff dans « Mes enchères » (onglet Staff), « Relancer » → candidat dans le Marché (mode Staff), tâche du tableau de bord, lien #encheres");

  // 4) Rafraîchissement : Lyon relance (depuis un autre appareil) → plus de pastille.
  const saved = (await store.loadMultiLeague(multiSavePath)).league;
  const c2 = saved.coachListings.find(x => x.id === coach.id);
  assert.ok(saved.placeCoachBid(c2.id, 0, Engine.minNextBidFor(c2), Date.now()).ok);
  await store.saveMultiLeague(saved, multiSavePath);
  assert.strictEqual(await win.eval("myAuctionsRefresh()"), true);
  assert.ok(badge.classList.contains("hidden"), "pastille retirée");
  assert.ok(/En tête/.test(doc.getElementById("marketMineList").textContent));
  ok("rafraîchissement depuis le serveur : enchère reprise ailleurs → pastille retirée, « Mes enchères » à jour");

  dom.window.close();
  server.close();
  console.log("\n🏁 my_auctions_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
