// Marché des joueurs : accord de contrat AVANT l'enchère, visite médicale
// (retour utilisateur 2026-10-03). Voir League.negotiateTransferContract,
// _hasAgreementForBid, _applyTransferContract et medicalCheckFor.
const assert = require("assert");
const E = require("../engine.js");
const ok = m => console.log("✅ " + m);
const T0 = Date.UTC(2026, 9, 3, 12);
const DAY = 24 * 3600 * 1000;

const me = E.generateStartingRoster("Acheteur");
const lg = E.generateLeague(me, 1, T0);
me.isHuman = true; me.budget = 5e6;
const myIdx = lg.teams.indexOf(me);
const sellerIdx = (myIdx + 1) % lg.teams.length;
const seller = lg.teams[sellerIdx];
const player = seller.players[0];
// Antécédent : 3 semaines il y a 2 mois (−7 %).
player.injuryHistory = [{ at: T0 - 60 * DAY, type: "Entorse de la cheville", days: 21, until: T0 - 39 * DAY }];
const listing = lg.listPlayerForSale(sellerIdx, player.id, 1000, T0);
assert.ok(listing, "annonce créée");
const asked = listing.askedSalary;

// 1) Pas d'enchère sans accord.
let r = lg.placeBid(listing.id, myIdx, 2000, T0 + 1000);
assert.strictEqual(r.reason, "no-agreement");
r = lg.setAutoBid("transferListings", listing.id, myIdx, 5000, T0 + 1000);
assert.strictEqual(r.reason, "no-agreement");
ok("pas d'enchère (ni automatique) sans accord");

// 2) Sous le plancher : refusé d'office ; refus tiré : demande +3 %.
r = lg.negotiateTransferContract(listing.id, myIdx, { salary: Math.floor(asked * 0.8), seasons: 3 }, T0 + 2000);
assert.strictEqual(r.reason, "invalid-salary");
r = lg.negotiateTransferContract(listing.id, myIdx, { salary: Math.ceil(asked * 0.9), seasons: 3 }, T0 + 3000, null, () => 0.999);
assert.ok(r.ok && !r.accepted && r.refusals === 1 && r.demand === Math.round(asked * 1.03 / 10) * 10, JSON.stringify(r));
ok(`refus : demande ${asked} → ${r.demand}`);
// 3 refus : seulement au salaire demandé.
lg.negotiateTransferContract(listing.id, myIdx, { salary: Math.ceil(r.demand * 0.95), seasons: 3 }, T0 + 4000, null, () => 0.999);
const r3 = lg.negotiateTransferContract(listing.id, myIdx, { salary: Math.ceil(asked), seasons: 3 }, T0 + 5000, null, () => 0.999);
assert.ok(r3.firm && r3.refusals === 3, JSON.stringify(r3));
r = lg.negotiateTransferContract(listing.id, myIdx, { salary: r3.demand - 10, seasons: 3 }, T0 + 6000);
assert.strictEqual(r.reason, "invalid-salary");
r = lg.negotiateTransferContract(listing.id, myIdx, { salary: r3.demand, seasons: 4 }, T0 + 7000);
assert.ok(r.ok && r.accepted && r.salary === r3.demand && r.seasons === 4, JSON.stringify(r));
ok(`après 3 refus, accord au salaire demandé (${r3.demand} €, 4 saisons)`);
r = lg.negotiateTransferContract(listing.id, myIdx, { salary: r3.demand, seasons: 2 }, T0 + 8000);
assert.strictEqual(r.reason, "already-agreed");
ok("accord figé");

// 4) Enchère possible, victoire, visite médicale : salaire −10 %.
r = lg.placeBid(listing.id, myIdx, 2000, T0 + 9000);
assert.ok(r.ok, JSON.stringify(r));
listing.closesAt = T0 + 10000;
lg._resolveListing(listing, T0 + 20000);
const signed = me.players.find(p => p.id === player.id);
assert.ok(signed, "joueur arrivé");
assert.strictEqual(signed.salary, Math.round(r3.demand * 0.93 / 10) * 10, `salaire après visite : ${signed.salary}`);
assert.strictEqual(signed.contractUntilSeason - lg.contractSeason() + 1, 4);
ok(`visite médicale : ${r3.demand} € → ${signed.salary} € (−7 %), 4 saisons`);

// 5) Barème de la visite médicale (12 semaines, blessures de 10 j et plus).
const mc = (h, now = T0) => E.medicalCheckFor({ injuryHistory: h }, now).rate;
const inj = (ago, days) => ({ at: T0 - DAY * ago, days, until: T0 - DAY * ago + DAY * days });
assert.strictEqual(mc([]), 0);
assert.strictEqual(mc([inj(20, 4), inj(40, 6), inj(60, 9)]), 0, "petits pépins ignorés");
assert.strictEqual(mc([inj(30, 12)]), 0.05);
assert.strictEqual(mc([inj(30, 12), inj(60, 15)]), 0.07);
assert.strictEqual(mc([inj(40, 24)]), 0.07, "3 semaines et plus");
assert.strictEqual(mc([inj(20, 10), inj(40, 12), inj(70, 14)]), 0.10);
assert.strictEqual(mc([{ at: T0 - DAY * 2, days: 20, until: T0 + DAY * 18 }]), 0, "blessure en cours : visible, pas comptée");
assert.strictEqual(mc([inj(100, 25)]), 0, "plus d'une saison : oubliée");
ok("barème : 0 / 5 / 7 / 10 %, petits pépins, blessure en cours et anciennes ignorées");

// 6) Annonce ouverte au déploiement : un club qui avait déjà misé garde la main.
const p2 = seller.players[1];
const l2 = lg.listPlayerForSale(sellerIdx, p2.id, 1000, T0);
l2.bids.push({ bidderIdx: myIdx, amount: 1000, at: T0 }); l2.currentBid = 1000; l2.currentBidderIdx = myIdx;
r = lg.placeBid(l2.id, myIdx, 2000, T0 + 1000);
assert.ok(r.ok && l2.agreements[E.autoBidKey(myIdx, null)].legacy, JSON.stringify(r));
ok("enchère d'avant la règle : accord implicite au salaire demandé");

// 7) Club de l'IA : enchérit sans accord, signe au salaire demandé.
const cpuIdx = lg.teams.findIndex((t, i) => !t.isHuman && i !== sellerIdx);
const p3 = seller.players[2];
p3.injuryHistory = [];
const l3 = lg.listPlayerForSale(sellerIdx, p3.id, 1000, T0);
r = lg.placeBid(l3.id, cpuIdx, 1500, T0 + 1000);
assert.ok(r.ok, JSON.stringify(r));
l3.closesAt = T0 + 2000; lg._resolveListing(l3, T0 + 3000);
assert.strictEqual(lg.teams[cpuIdx].players.find(p => p.id === p3.id).salary, l3.askedSalary);
ok("club de l'IA : pas d'accord requis, salaire demandé");
console.log("\n✅ Négociation avant enchère et visite médicale : OK.");
