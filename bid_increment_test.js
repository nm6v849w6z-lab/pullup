// Surenchère minimale par paliers (2026-10-10, fiche de Jonas Tamm :
// « Meilleure offre : 3 600 000 $. Relance dès 4 320 000 $ » — +20 %, beaucoup
// trop ; 5 % pour les grosses sommes) :
//   ≤ 250 000 $ : 20 % (au moins 1 000 $, inchangé) ; 250 000 – 1 000 000 $ :
//   +50 000 $ ; ≥ 1 000 000 $ : 5 %, arrondi au millier SUPÉRIEUR.
// Vérifie : valeurs, continuité et croissance (relancer plus haut n'abaisse
// jamais le minimum suivant), parité EXACTE entre le client (moteurbasket3,
// texte « Relance dès … ») et le serveur (engine.js, qui valide), refus
// côté serveur d'une offre sous le minimum (requête modifiée), acceptation
// du montant affiché, enchères auto et CPU sur la même règle.
const E = require("./engine.js");
require("./test_transfer_agreement_helper.js")(E);
const actions = require("./server/actions.js");
const html = require("./test_game_html.js").readGameHtml();
const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);

// 1. Règle.
const cases = [[1000, 2000], [5000, 6000], [50000, 60000], [200000, 240000], [250000, 300000], [600000, 650000], [999999, 1049999], [1000000, 1050000], [3600000, 3780000], [10000000, 10500000]];
for (const [cur, next] of cases) { const got = E.minNextBidFor({ currentBid: cur, startPrice: 1 }); if (got !== next) fail(`meilleure offre ${cur} $ : relance minimale ${next} $ attendue, obtenu ${got} $`); }
ok(`Paliers : ${cases.map(([c, n]) => `${c.toLocaleString("fr-FR")} → ${n.toLocaleString("fr-FR")}`).join(" ; ")} $ (Jonas Tamm : 3 600 000 → 3 780 000 $).`);
let prev = 0;
for (let a = 0; a <= 20_000_000; a += a < 2_000_000 ? 997 : 9973) {
  const n = E.minNextBidFor({ currentBid: a || null, startPrice: 1000 });
  if (n < prev) fail(`minimum non croissant autour de ${a} $ (${prev} → ${n})`);
  if (a >= 1_000_000 && (n - a < a * 0.05 || n - a > a * 0.05 + 1000 || (n - a) % 1000)) fail(`grosses sommes : +5 % arrondi au millier supérieur attendu à ${a} $ (+${n - a})`);
  prev = n;
}
ok("Règle continue et croissante de 0 à 20 M$ ; au-delà de 1 M$ : +5 %, arrondi au millier supérieur.");

// 2. Parité client / serveur : mêmes constantes, même fonction, mêmes valeurs.
const grab = name => { const m = new RegExp(`function ${name}\\([^]*?\\n}\\n`).exec(html); if (!m) fail(`${name} introuvable côté client`); return m[0]; };
const consts = html.match(/^const TRANSFER_MIN_INCREMENT_[A-Z_]+ = [^;]+;/mg);
if (!consts || consts.length !== 7) fail(`constantes de surenchère côté client attendues (7), obtenu ${consts && consts.length}`);
const client = new Function(`${consts.join("\n")}\n${grab("transferMinIncrement")}${grab("minNextBidFor")}return { transferMinIncrement, minNextBidFor };`)();
for (let a = 0; a <= 30_000_000; a += a < 1_200_000 ? 1231 : 77_777) {
  if (client.transferMinIncrement(a) !== E.transferMinIncrement(a)) fail(`client ≠ serveur à ${a} $ (${client.transferMinIncrement(a)} / ${E.transferMinIncrement(a)})`);
}
if (!/Relance dès \$\{dashFormatEuros\(a\.minNext\)\}/.test(html) || !/minNext: minNextBidFor\(x\.l\)/.test(html)) fail("le message « Relance dès » doit afficher minNextBidFor (même formule que le serveur)");
ok("Client (texte « Relance dès … ») et serveur : formule et constantes identiques, mêmes montants sur 0–30 M$.");

// 3. Serveur : offre modifiée sous le minimum refusée ; montant affiché accepté.
const user = E.generateTeam("User", 1.0); user.budget = 50_000_000;
const lg = E.generateLeague(user, 1); lg.teams[0].budget = 50_000_000; lg.teams[0].isHuman = true;
const now = Date.now();
const seller = lg.teams[3], p = seller.players[0];
const listing = lg.listPlayerForSale(3, p.id, 3_000_000, now);
if (!listing) fail("annonce de test impossible");
let r = lg.placeBid(listing.id, 5, 3_600_000, now + 10);
if (!r.ok) fail("première offre (3 600 000 $) refusée : " + r.reason);
const shown = client.minNextBidFor(listing);
r = actions.bidOnListing(lg.teams[0], 0, lg, { listingId: listing.id, amount: 3_779_999 }, now + 20);
if (r.ok || !/too-low/.test(r.error || "") || !/3780000/.test(r.error || "")) fail(`offre à 3 779 999 $ (requête modifiée) : refus « too-low (minimum 3780000) » attendu, obtenu ${JSON.stringify(r)}`);
r = actions.bidOnListing(lg.teams[0], 0, lg, { listingId: listing.id, amount: shown }, now + 30);
if (!r.ok || listing.currentBid !== 3_780_000 || listing.currentBidderIdx !== 0) fail(`montant affiché (${shown} $) : accepté attendu, obtenu ${JSON.stringify(r).slice(0, 200)}`);
ok(`Serveur : 3 779 999 $ refusé (« ${r.error || "too-low"} »), le montant affiché ${shown.toLocaleString("fr-FR")} $ accepté ; prochain minimum ${E.minNextBidFor(listing).toLocaleString("fr-FR")} $.`);
r = actions.bidOnListing(lg.teams[0], 0, lg, { listingId: listing.id, amount: "4000000" }, now + 40);
if (r.ok) fail("montant non numérique accepté");
// 4. Dépassé : l'enchère suivante d'un autre club suit la même règle.
r = lg.placeBid(listing.id, 6, E.minNextBidFor(listing), now + 50);
if (!r.ok || listing.currentBid !== 3_780_000 + 189_000) fail(`surenchère d'un autre club au minimum (3 969 000 $) attendue, obtenu ${listing.currentBid}`);
ok(`Dépassé : l'autre club relance au minimum suivant (${listing.currentBid.toLocaleString("fr-FR")} $), même règle pour tous.`);
console.log("\n🏁 bid_increment_test.js : surenchère à 5 % pour les grosses sommes, identique client / serveur, validée par le serveur.");
