// Enchère automatique (retour utilisateur 2026-09-29 : « pouvoir faire les
// enchères en automatique : on fixe un seuil et ça enchérit jusqu'à ce seuil
// si on se fait dépasser », pour tous les clubs). Voir AUTO_BID_FIELDS et
// League.setAutoBid/_applyAutoBids (engine.js + miroir moteurbasket3.html),
// POST /api/market/auto-bid, server/myAuctions.js:sanitizeAutoBids,
// WorldMarket.setForeignAutoBid et le marché / la page Staff.
const assert = require("assert");
const fs = require("fs");
const Engine = require("./engine.js");
const store = require("./server/store.js");
const World = require("./server/world.js");
const Push = require("./server/push.js");
const { startTestServer, openGame, patchDateNow } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const ok = m => console.log("✅ " + m);
const wait = async (cond, what) => { for (let i = 0; i < 100; i++) { if (await cond()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error(`délai dépassé : ${what}`); };
const inc = n => Engine.minNextBidFor({ currentBid: n, startPrice: 0 });

(async () => {
  const now = Date.now();
  // 1) Moteur.
  {
    const lg = store.createMultiManagerCareer(["Lyon Auto", "Paris Auto"], now - 2 * 86400000, "Lyon Auto").league;
    lg.teams[0].budget = 1e6; lg.teams[1].budget = 1e6;
    const seller = lg.teams[5];
    const l = lg.listPlayerForSale(5, seller.players[0].id, 1000, now);
    let r = lg.setAutoBid("transferListings", l.id, 0, 20000, now);
    assert.ok(r.ok && r.leading && l.currentBid === 1000 && l.currentBidderIdx === 0, "plafond fixé : première offre au prix de départ");
    assert.ok(l.bids[0].auto);
    // Paris enchérit à la main : Lyon relance aussitôt d'un palier.
    r = lg.placeBid(l.id, 1, 5000, now + 1);
    assert.ok(r.ok && r.autoOutbid, "Paris aussitôt dépassé");
    assert.strictEqual(l.currentBidderIdx, 0); assert.strictEqual(l.currentBid, inc(5000));
    // Paris fixe un plafond plus bas : Lyon garde la tête, un palier au-dessus.
    r = lg.setAutoBid("transferListings", l.id, 1, 15000, now + 2);
    assert.ok(r.ok && !r.leading && l.currentBidderIdx === 0 && l.currentBid === Math.min(20000, inc(15000)));
    // Paris monte à 30 000 : Lyon va à son plafond, Paris passe d'un palier.
    r = lg.setAutoBid("transferListings", l.id, 1, 30000, now + 3);
    assert.ok(r.ok && r.leading && l.currentBidderIdx === 1 && l.currentBid === inc(20000), `${l.currentBid}`);
    // Lyon relance à la main au-delà du plafond de Paris.
    r = lg.placeBid(l.id, 0, 35000, now + 4);
    assert.ok(r.ok && !r.autoOutbid && l.currentBidderIdx === 0 && l.currentBid === 35000);
    // Égalité de plafonds : celui qui mène garde la tête.
    const l2 = lg.listPlayerForSale(6, lg.teams[6].players[0].id, 1000, now);
    lg.setAutoBid("transferListings", l2.id, 0, 10000, now);
    lg.setAutoBid("transferListings", l2.id, 1, 10000, now + 1);
    assert.strictEqual(l2.currentBidderIdx, 0); assert.strictEqual(l2.currentBid, 10000);
    // Budget : le plafond effectif suit le budget du moment.
    const l3 = lg.listPlayerForSale(7, lg.teams[7].players[0].id, 1000, now);
    lg.setAutoBid("transferListings", l3.id, 0, 50000, now);
    lg.teams[0].budget = 8000;
    lg.placeBid(l3.id, 1, 6000, now + 1);
    assert.strictEqual(l3.currentBidderIdx, 0, "relance dans le budget"); assert.ok(l3.currentBid <= 8000);
    lg.placeBid(l3.id, 1, 9000, now + 2);
    assert.strictEqual(l3.currentBidderIdx, 1, "au-delà du budget : plus de relance");
    lg.teams[0].budget = 1e6;
    // Refus : trop bas, au-delà du budget, propre annonce, retrait.
    assert.strictEqual(lg.setAutoBid("transferListings", l3.id, 0, 100, now).reason, "too-low");
    assert.strictEqual(lg.setAutoBid("transferListings", l3.id, 0, 2e6, now).reason, "insufficient-budget");
    const own = lg.listPlayerForSale(0, lg.teams[0].players[0].id, 1000, now);
    assert.strictEqual(lg.setAutoBid("transferListings", own.id, 0, 5000, now).reason, "own-listing");
    r = lg.setAutoBid("transferListings", l.id, 1, 0, now + 5);
    assert.ok(r.ok && r.removed && !(l.autoBids || []).some(a => a.bidderIdx === 1));
    // Offre CPU : le plafond répond aussi.
    const l4 = lg.listPlayerForSale(8, lg.teams[8].players[0].id, 1000, now);
    lg.setAutoBid("transferListings", l4.id, 0, 1e5, now);
    l4.bids.push({ bidderIdx: 9, amount: 3000, at: now + 1 }); l4.currentBid = 3000; l4.currentBidderIdx = 9;
    lg._applyAutoBids(l4, "player", now + 1);
    assert.strictEqual(l4.currentBidderIdx, 0);
    // Staff : même mécanique.
    const coach = lg.generateCoachCandidate(now);
    const capC = coach.startPrice + 50000;
    lg.setAutoBid("coachListings", coach.id, 0, capC, now);
    r = lg.placeCoachBid(coach.id, 1, Engine.minNextBidFor(coach), now + 1);
    assert.ok(r.ok && r.autoOutbid && coach.currentBidderIdx === 0);
    // Sauvegarde : les plafonds survivent au rechargement.
    const back = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(lg))));
    assert.strictEqual(back.coachListings.find(c => c.id === coach.id).autoBids[0].max, capC);
    // Notification : plafond dépassé.
    const me = lg.teams[0]; me.pushSince = now - 1000; me.pushAuctionKeys = [];
    assert.ok(lg.placeCoachBid(coach.id, 1, capC + 50000, now + 2).ok);
    const notes = Push.auctionNotes(lg, 0, now + 3);
    assert.ok(notes.some(n => /^Plafond dépassé : l'entraîneur/.test(n.title) && /enchère automatique/.test(n.body)), JSON.stringify(notes));
  }
  ok("moteur : plafond → relance d'un palier, duel de plafonds réglé aussitôt (le plus haut gagne, égalité au premier), budget du moment, refus, retrait, offres CPU, staff, sauvegarde, notification « Plafond dépassé »");

  // 2) Serveur : plafonds secrets, route, marché mondial.
  const clock = { now };
  const { server, multiSavePath, baseUrl } = await startTestServer(() => clock.now);
  const career = store.createMultiManagerCareer(["Lyon Auto", "Paris Auto"], now - 3 * 86400000, "Lyon Auto");
  const lg = career.league;
  const lyon = lg.teams[0], paris = lg.teams[1];
  const l = lg.listPlayerForSale(5, lg.teams[5].players[0].id, 1000, now);
  l.lastCpuCheckAt = l.closesAt;
  await store.saveMultiLeague(lg, multiSavePath);
  const api = async (p, token, body) => {
    const res = await fetch(new URL(p, baseUrl), body ? { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": token }, body: JSON.stringify(body) } : { headers: { "X-TipIn-Token": token } });
    return { status: res.status, body: await res.json() };
  };
  let r = await api("/api/market/auto-bid", lyon.managerLinkToken, { market: "transferListings", listingId: l.id, max: 30000 });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.leading && r.body.listing.myAutoMax === 30000 && !r.body.listing.autoBids);
  const sp = (await api("/api/save", paris.managerLinkToken)).body;
  const seen = sp.league.transferListings.find(x => x.id === l.id);
  assert.ok(seen && !seen.autoBids && seen.myAutoMax == null, "Paris ne voit pas le plafond de Lyon");
  const sl = (await api("/api/save", lyon.managerLinkToken)).body;
  assert.strictEqual(sl.league.transferListings.find(x => x.id === l.id).myAutoMax, 30000, "Lyon voit son plafond");
  r = await api("/api/market/bid", paris.managerLinkToken, { listingId: l.id, amount: 5000 });
  assert.ok(r.status === 200 && r.body.autoOutbid && !r.body.listing.autoBids, JSON.stringify(r.body).slice(0, 200));
  const stored = (await store.loadMultiLeague(multiSavePath)).league.transferListings.find(x => x.id === l.id);
  assert.ok(stored.autoBids.length === 1 && stored.currentBidderIdx === 0, "plafond gardé côté serveur, Lyon en tête");
  const mine = (await api("/api/auctions/mine", lyon.managerLinkToken)).body;
  assert.strictEqual(mine.transferListings.find(x => x.id === l.id).myAutoMax, 30000);
  r = await api("/api/market/auto-bid", lyon.managerLinkToken, { market: "coachListings", listingId: 123456, max: 1000 });
  assert.strictEqual(r.status, 400);
  ok("serveur : POST /api/market/auto-bid, plafond secret pour les autres clubs (sauvegarde, réponse d'enchère), relance immédiate face à Paris, « Mes enchères » connaît son plafond");

  // 3) Marché mondial : plafond sur l'annonce d'un autre championnat.
  await World.catchUpWorld(multiSavePath, clock.now);
  let w = await World.loadWorld(multiSavePath, clock.now);
  const us = await World.loadLeague(w, "us-1", multiSavePath);
  const ul = us.listPlayerForSale(5, us.teams[5].players[0].id, 2000, clock.now);
  ul.lastCpuCheckAt = ul.closesAt; us.lastCpuListingCheckAt = clock.now;
  await store.saveMultiLeague(us, multiSavePath);
  await World.catchUpWorld(multiSavePath, clock.now + 1000);
  const index = await store.loadWorldAuxRaw("market", multiSavePath);
  const en = index.entries.find(x => x.leagueId === "us-1" && x.listingId === ul.id);
  r = await api("/api/market/auto-bid", lyon.managerLinkToken, { market: "transferListings", listingId: -en.gid, max: 40000 });
  assert.ok(r.status === 200 && r.body.foreign && r.body.leading, JSON.stringify(r.body));
  w = await World.loadWorld(multiSavePath, clock.now);
  let us2 = await World.loadLeague(w, "us-1", multiSavePath);
  let ul2 = us2.transferListings.find(x => x.id === ul.id);
  assert.ok(ul2.currentBidderIdx === Engine.FOREIGN_BIDDER_IDX && ul2.currentBidderRef.name === lyon.name && ul2.currentBid === 2000);
  // Un club américain surenchérit : le plafond de Lyon répond.
  const res2 = us2.placeBid(ul.id, 3, 6000, clock.now + 2000);
  assert.ok(res2.ok && res2.autoOutbid && ul2.currentBidderIdx === Engine.FOREIGN_BIDDER_IDX && ul2.currentBid === inc(6000));
  await store.saveMultiLeague(us2, multiSavePath);
  await World.catchUpWorld(multiSavePath, clock.now + 3000);
  const sl2 = (await api("/api/save", lyon.managerLinkToken)).body;
  const fl = sl2.league.transferListings.find(x => x.id === -en.gid);
  assert.ok(fl && fl.myAutoMax === 40000 && fl.currentBidderIdx === 0, JSON.stringify(fl && { m: fl.myAutoMax, c: fl.currentBidderIdx }));
  const sp2 = (await api("/api/save", paris.managerLinkToken)).body;
  assert.strictEqual(sp2.league.transferListings.find(x => x.id === -en.gid).myAutoMax, undefined, "plafond de Lyon invisible pour Paris");
  ok("marché mondial : plafond sur une annonce américaine, relance face à un club américain, visible pour Lyon seulement");

  // 4) Navigateur : bouton « Enchère auto » (marché) et page Staff.
  {
    const pre = (await store.loadMultiLeague(multiSavePath)).league;
    const nl = pre.listPlayerForSale(7, pre.teams[7].players[0].id, 1000, clock.now);
    nl.lastCpuCheckAt = nl.closesAt;
    await store.saveMultiLeague(pre, multiSavePath);
  }
  const dom = await openGame(html, `${baseUrl}?m=${lyon.managerLinkToken}`, win => patchDateNow(win, () => clock.now));
  const win = dom.window, doc = win.document;
  if (win.eval("currentVisiblePageId()") === "catchupSection") doc.getElementById("catchupContinueBtn").click();
  win.eval("TAB_HANDLERS.marche()");
  const saved = (await store.loadMultiLeague(multiSavePath)).league;
  const l5 = saved.transferListings.filter(x => x.status === "open" && x.sellerIdx === 7 && x.currentBidderIdx == null).pop();
  assert.ok(l5, "une annonce libre");
  win.eval(`mkResetFilters(); renderMarketListings();`);
  const input = doc.getElementById(`bid_${l5.id}`);
  assert.ok(input, "carte de l'annonce");
  input.value = "25000";
  doc.querySelector(`[data-mk-auto="${l5.id}"]`).click();
  await wait(() => /Enchère automatique jusqu'à/.test((doc.getElementById(`marketCard_${l5.id}`) || {}).textContent || ""), "plafond affiché sur la carte").catch(e => { console.log("feedback:", (doc.getElementById("marketFeedback") || {}).textContent, "| card:", !!doc.getElementById(`marketCard_${l5.id}`)); throw e; });
  let s = (await store.loadMultiLeague(multiSavePath)).league.transferListings.find(x => x.id === l5.id);
  assert.ok(s.autoBids.some(a => a.bidderIdx === 0 && a.max === 25000) && s.currentBidderIdx === 0);
  doc.querySelector(`[data-mk-auto-off="${l5.id}"]`).click();
  await wait(async () => !((await store.loadMultiLeague(multiSavePath)).league.transferListings.find(x => x.id === l5.id).autoBids || []).length, "plafond retiré");
  // Staff.
  // Staff v2 (2026-10-01) : enchères staff dans le Marché, mode Staff.
  win.eval("mkOpenStaffMarket('coach');");
  const c = win.eval("staffOpenListings(STAFF_ROLE_BY_KEY.coach).find(x => x.currentBidderIdx == null) || null");
  assert.ok(c, "un candidat entraîneur libre");
  const ci = doc.getElementById(`coachBid_${c.id}`);
  ci.value = String(c.startPrice * 2);
  doc.querySelector(`[data-mk-staff-auto="coach:${c.id}"]`).click();
  await wait(async () => { const x = (await store.loadMultiLeague(multiSavePath)).league.coachListings.find(y => y.id === c.id); return x && (x.autoBids || []).some(a => a.bidderIdx === 0 && a.max === c.startPrice * 2); }, "plafond staff enregistré");
  await wait(() => doc.querySelector(`[data-mk-staff-auto-off="coach:${c.id}"]`), "état « Enchère automatique » sur la carte");
  ok("navigateur : « Enchère auto » avec le montant saisi (marché et Staff), état affiché, « Arrêter »");
  dom.window.close();

  server.close();
  console.log("\n🏁 auto_bid_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
