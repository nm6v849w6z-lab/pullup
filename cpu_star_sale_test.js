// Bots : tout joueur à 50 de général ou plus est mis en vente à 1 €
// (retour utilisateur 2026-10-01), sans descendre sous l'effectif minimum,
// et un bot n'enchérit jamais sur un tel joueur.
const E = require("./engine.js");
const assert = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };

const lg = E.generateMultiManagerLeague(["Humain A", "Humain B"], 2, Date.now());
const NOW = Date.now();
const cpuIdx = lg.teams.findIndex(t => !t.isHuman);
const cpu = lg.teams[cpuIdx];
// Trois joueurs du bot passent au-dessus de 50.
const stars = cpu.players.slice(0, 3);
stars.forEach(p => { Object.keys(p.attrs).forEach(a => { p.attrs[a] = Math.max(p.attrs[a], 70); }); });
assert(stars.every(p => p.overall() >= E.CPU_STAR_SELL_OVERALL), "joueurs de test à 50 de général ou plus");
lg.transferListings = [];
lg.lastCpuListingCheckAt = 0;
lg.refreshMarket(NOW);
const open = lg.transferListings.filter(l => l.status === "open" && l.sellerIdx === cpuIdx);
assert(stars.every(p => open.some(l => l.playerId === p.id && l.startPrice === 1)), "les trois joueurs du bot sont en vente à 1 €");
assert(lg.teams.every((t, i) => t.isHuman || t.players.every(p => p.overall() < E.CPU_STAR_SELL_OVERALL || lg.transferListings.some(l => l.status === "open" && l.playerId === p.id) || lg.contractSaleBlocked(p) || t.players.length <= E.MIN_ROSTER_SIZE)), "aucun bot ne garde un joueur à 50+ hors marché");

// Pas de doublon à la vérification suivante.
lg.lastCpuListingCheckAt = 0;
lg.refreshMarket(NOW + 1000);
const again = lg.transferListings.filter(l => l.status === "open" && stars.some(p => p.id === l.playerId));
assert(again.length === 3, "pas de seconde annonce pour un joueur déjà en vente");

// Les bots n'enchérissent pas sur un joueur à 50+.
const otherIdx = lg.teams.findIndex((t, i) => !t.isHuman && i !== cpuIdx);
assert(!lg._cpuWantsPlayer(otherIdx, stars[0]), "un bot ne veut pas d'un joueur à 50+");
const listing = again[0];
listing.lastCpuCheckAt = 0;
const realRandom = Math.random;
Math.random = () => 0;
try { lg.refreshMarket(NOW + 2 * E.TRANSFER_CPU_CHECK_INTERVAL_MS); } finally { Math.random = realRandom; }
assert(listing.currentBidderIdx == null || lg.teams[listing.currentBidderIdx].isHuman, "aucune enchère d'un bot sur un joueur à 50+");

// Effectif minimum respecté.
const small = lg.teams[otherIdx];
small.players = small.players.slice(0, E.MIN_ROSTER_SIZE);
small.players.forEach(p => { Object.keys(p.attrs).forEach(a => { p.attrs[a] = 80; }); });
lg.lastCpuListingCheckAt = 0;
lg.refreshMarket(NOW + 3 * E.TRANSFER_CPU_CHECK_INTERVAL_MS);
assert(!lg.transferListings.some(l => l.status === "open" && l.sellerIdx === otherIdx), "effectif minimum : le bot ne vend pas en dessous");
console.log("\n🏁 cpu_star_sale_test.js : tout est vert");
