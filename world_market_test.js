// Marché des transferts mondial (retour utilisateur 2026-09-28) : les
// annonces de TOUS les championnats (tous pays) apparaissent dans le marché
// de chaque manager, on enchérit sur un joueur d'un autre championnat, le
// transfert se fait à la clôture. Voir server/worldMarket.js,
// League.placeForeignBid / transferPlayerBetweenTeams (engine.js),
// server/world.js:catchUpWorld et le marché de moteurbasket3.html.
const assert = require("assert");
const fs = require("fs");
const Engine = require("./engine.js");
const store = require("./server/store.js");
const World = require("./server/world.js");
const WM = require("./server/worldMarket.js");
const { startTestServer, openGame, patchDateNow } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const ok = m => console.log("✅ " + m);
const wait = async (cond, what) => { for (let i = 0; i < 100; i++) { if (await cond()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error(`délai dépassé : ${what}`); };

(async () => {
  const t0 = Date.now();
  // 0) Vendeur : un enchérisseur d'ailleurs devient un club invité léger.
  {
    const listings = [{ id: 7, sellerIdx: 2, currentBidderIdx: Engine.FOREIGN_BIDDER_IDX, currentBidderRef: { leagueId: "us-1", idx: 4, name: "Boston X" }, bids: [{ bidderIdx: 3, amount: 10 }, { bidderIdx: Engine.FOREIGN_BIDDER_IDX, bidderRef: { leagueId: "us-1", idx: 4, name: "Boston X" }, amount: 12 }] }];
    const out = WM.projectOwnForeignBidders(listings);
    assert.strictEqual(out.listings[0].currentBidderIdx, WM.MARKET_GUEST_BIDDER_IDX);
    assert.deepStrictEqual(out.listings[0].bids.map(b => b.bidderIdx), [3, WM.MARKET_GUEST_BIDDER_IDX]);
    assert.strictEqual(out.guests[0].light.name, "Boston X");
    assert.strictEqual(listings[0].currentBidderIdx, Engine.FOREIGN_BIDDER_IDX, "l'original n'est pas modifié");
    ok("vendeur : l'enchérisseur d'un autre championnat apparaît sous son nom (club invité léger)");
  }

  const now0 = Date.now();
  const clock = { now: now0 };
  const { server, multiSavePath, baseUrl } = await startTestServer(() => clock.now);
  const career = store.createMultiManagerCareer(["Lyon Monde", "Paris Monde"], now0 - 3 * 24 * 3600 * 1000, "Lyon Monde");
  await store.saveMultiLeague(career.league, multiSavePath);
  await World.catchUpWorld(multiSavePath, clock.now);
  let w = await World.loadWorld(multiSavePath, clock.now);
  const us = await World.loadLeague(w, "us-1", multiSavePath);
  const seller = us.teams[5];
  const player = seller.players.reduce((b, p) => (p.overall() > b.overall() ? p : b), seller.players[0]);
  const listing = us.listPlayerForSale(5, player.id, 20000, clock.now);
  listing.lastCpuCheckAt = listing.closesAt; // pas d'enchère CPU concurrente dans ce test
  us.lastCpuListingCheckAt = clock.now;
  await store.saveMultiLeague(us, multiSavePath);
  await World.catchUpWorld(multiSavePath, clock.now + 1000);
  const index = await store.loadWorldAuxRaw("market", multiSavePath);
  const en = index.entries.find(x => x.leagueId === "us-1" && x.listingId === listing.id);
  assert.ok(en && en.gid > 0 && en.player.name === player.name && en.sellerName === seller.name && en.label === "Division I");
  ok(`index mondial : ${index.entries.length} annonce(s) ouverte(s), dont ${player.name} (${seller.name}, USA)`);

  // 1) Lyon voit l'annonce américaine dans son marché.
  const lyon = career.league.teams[0];
  const paris = career.league.teams[1];
  const api = async (path, token, init = {}) => {
    const res = await fetch(new URL(path, baseUrl), { ...init, headers: { "Content-Type": "application/json", "X-TipIn-Token": token } });
    return { status: res.status, body: await res.json() };
  };
  const save = (await api("/api/save", lyon.managerLinkToken)).body;
  const fl = save.league.transferListings.find(l => l.id === -en.gid);
  assert.ok(fl && fl.foreign && fl.foreign.country === "us" && fl.playerId === player.id);
  const g = save.league.guestTeams.find(x => x.localIdx === fl.sellerIdx);
  assert.ok(g && g.light.name === seller.name && g.light.players.some(p => p.id === player.id) && g.light.players.length === save.league.transferListings.filter(l => l.sellerIdx === fl.sellerIdx).length, "vendeur invité avec ses seuls joueurs en vente");
  assert.ok(!g.light.players[0].managerLinkToken);
  ok("sauvegarde : l'annonce américaine est dans le marché de Lyon (id global négatif, vendeur invité avec son joueur en vente)");

  // 2) Enchère depuis le navigateur de Lyon.
  let dom = await openGame(html, `${baseUrl}?m=${lyon.managerLinkToken}`, win => patchDateNow(win, () => clock.now));
  let win = dom.window, doc = win.document;
  if (win.eval("currentVisiblePageId()") === "catchupSection") doc.getElementById("catchupContinueBtn").click();
  win.eval("TAB_HANDLERS.marche()");
  const card = doc.getElementById(`marketCard_${-en.gid}`);
  assert.ok(card, "carte de l'annonce américaine");
  assert.ok(card.textContent.includes(seller.name) && /Division I/.test(card.querySelector(".mk-chip-origin").textContent), "vendeur et championnat sur la carte");
  // Filtre « Mon championnat » : l'annonce disparaît ; pays « États-Unis »
  // (choix libre, retour utilisateur 2026-10-01) : elle seule ; « Monde entier » : elle revient.
  const pick = v => { doc.querySelector("[data-mk-origin-btn]").click(); doc.querySelector(`[data-mk-origin="${v}"]`).click(); };
  pick("league");
  assert.ok(!doc.getElementById(`marketCard_${-en.gid}`), "masquée avec « Mon championnat »");
  pick("us");
  assert.ok(doc.getElementById(`marketCard_${-en.gid}`) && [...doc.querySelectorAll("#marketListings .mk-lst")].every(c => /Division/.test((c.querySelector(".mk-chip-origin") || {}).textContent || "")), "pays « us » : seules les annonces américaines");
  assert.ok(/États-Unis/.test(doc.querySelector("[data-mk-origin-btn]").textContent), "le bouton affiche le pays choisi");
  pick("fr");
  assert.ok(!doc.getElementById(`marketCard_${-en.gid}`), "pays « fr » : l'annonce américaine est masquée");
  pick("all");
  const minBid = Engine.minNextBidFor(listing);
  doc.getElementById(`bid_${-en.gid}`).value = String(minBid);
  doc.querySelector(`[data-bid-listing="${-en.gid}"]`).click();
  await wait(async () => {
    const ww = await World.loadWorld(multiSavePath, clock.now);
    const lg = await World.loadLeague(ww, "us-1", multiSavePath);
    const l = lg.transferListings.find(x => x.id === listing.id);
    return l && l.currentBidderIdx === Engine.FOREIGN_BIDDER_IDX && l.currentBidderRef.name === lyon.name && l.currentBid === minBid;
  }, "enchère enregistrée dans le championnat américain");
  assert.ok(/Vous êtes en tête/.test(doc.getElementById(`marketCard_${-en.gid}`).textContent));
  ok(`enchère de ${minBid} € posée depuis le marché de Lyon sur ${player.name} : enregistrée aux USA, « Vous êtes en tête »`);
  dom.window.close();

  // 3) Paris (même championnat que Lyon) voit Lyon en tête ; enchère trop basse refusée.
  const saveP = (await api("/api/save", paris.managerLinkToken)).body;
  const flP = saveP.league.transferListings.find(l => l.id === -en.gid);
  assert.strictEqual(flP.currentBidderIdx, 0, "Lyon (même ligue) en tête vu de Paris");
  const low = await api("/api/market/bid", paris.managerLinkToken, { method: "POST", body: JSON.stringify({ listingId: -en.gid, amount: minBid }) });
  assert.strictEqual(low.status, 400); assert.strictEqual(low.body.reason, "too-low");
  ok("Paris voit Lyon en tête ; une enchère trop basse est refusée par le championnat du vendeur");

  // 4) Clôture : transfert entre les deux championnats.
  clock.now = listing.closesAt + 2000;
  const evs = await World.catchUpWorld(multiSavePath, clock.now);
  assert.ok(evs.some(e => e.type === "world-transfer" && e.player === player.name && e.to === "fr-1"));
  w = await World.loadWorld(multiSavePath, clock.now);
  const fr1 = await World.loadLeague(w, "fr-1", multiSavePath);
  const us2 = await World.loadLeague(w, "us-1", multiSavePath);
  const lyon2 = fr1.teams[0];
  assert.ok(lyon2.players.some(p => p.id === player.id), "joueur arrivé à Lyon");
  assert.ok(!us2.teams[5].players.some(p => p.id === player.id), "joueur parti des USA");
  assert.ok(lyon2.transactions.some(t => t.label === `Achat de ${player.name} (enchères)` && t.amount === -minBid), "prix débité");
  const lClosed = us2.transferListings.find(x => x.id === listing.id);
  assert.strictEqual(lClosed.result, "sold"); assert.strictEqual(lClosed.finalPrice, minBid);
  const idx2 = await store.loadWorldAuxRaw("market", multiSavePath);
  assert.ok(!idx2.entries.some(x => x.gid === en.gid), "annonce retirée de l'index");
  ok(`clôture : ${player.name} passe de ${seller.name} (USA) à Lyon pour ${minBid} €, annonce retirée du marché mondial`);

  // 5) Rattrapage sans changement : aucune ligue réécrite.
  await World.catchUpWorld(multiSavePath, clock.now + 1000);
  const evs2 = await World.catchUpWorld(multiSavePath, clock.now + 2000);
  assert.strictEqual(evs2.savedLeagues, 0, `ligues réécrites sans raison : ${evs2.savedLeagues}`);
  ok("rattrapage sans changement : aucune ligue réécrite (seules les ligues modifiées sont sauvegardées)");

  server.close();
  console.log(`\n🏁 world_market_test.js : tout est vert (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
