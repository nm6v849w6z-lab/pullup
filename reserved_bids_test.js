// Enchères en tête réservées (retour utilisateur 2026-10-03 : « j'ai enchéri,
// l'argent n'était pas bloqué, j'ai agrandi ma salle et je suis en négatif »).
const assert = require("assert");
const E = require("./engine.js");
// Enchères d'avant la règle « accord avant l'enchère » (2026-10-03).
require("./test_transfer_agreement_helper.js")(E);
const lg = E.generateMultiManagerLeague(["Gotham Knights"], 1, Date.now());
const me = 0, team = lg.teams[me];
team.budget = 1000000;
const now = Date.now();
lg.refreshMarket(now);
const listings = lg.transferListings.filter(l => l.status === "open" && l.sellerIdx !== me && !l.freeAgent);
assert.ok(listings.length >= 2, "au moins 2 annonces");
const a = lg.placeBid(listings[0].id, me, 500000, now);
assert.ok(a.ok, "1re enchère acceptée");
assert.strictEqual(lg.reservedBidsFor(me), 500000);
const b = lg.placeBid(listings[1].id, me, 600000, now);
assert.strictEqual(b.reason, "insufficient-budget", "2e enchère au-delà du budget restant refusée");
assert.ok(lg.placeBid(listings[1].id, me, 300000, now).ok, "2e enchère dans le budget restant acceptée");
{ const rr = lg.placeBid(listings[0].id, me, 600000, now); assert.ok(rr.ok, JSON.stringify({ reason: rr.reason, minBid: rr.minBid }) + " "+ "relancer sa propre enchère : réserve de cette annonce non comptée deux fois"); }
lg.syncReservedBids();
assert.strictEqual(team.spendableBudget(), 1000000 - 600000 - 300000);
const r = team.buildSeats({ gradins: 2000 });
assert.strictEqual(r.reason, "insufficient-budget", "salle refusée : argent réservé aux enchères");
{ const next = team.nextFanShopLevel(); if (next && next.cost > team.spendableBudget()) assert.strictEqual(team.upgradeFanShop(), false, "boutique refusée"); }
assert.strictEqual(team.budget, 1000000, "rien n'a été prélevé");
console.log("✅ reserved_bids_test.js : enchères, salle et boutique tiennent compte des enchères en tête");
