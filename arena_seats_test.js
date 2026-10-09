// Agrandissement LIBRE de la salle (retour utilisateur, 2026-09-27) : "il faut
// que l'on puisse ajouter librement les places dans les gradins et pas les
// constructions par niveau", "il faut quand même plafonner le nombre de
// places", "le prix de construction doit tjrs être le même, de la première à
// la dernière place", loges VIP limitées ("6500 place vip ? ça paraît
// démentiel"), bouton "Agrandir" du bandeau retiré, brique « Agrandir la
// salle » sous la billetterie.
// Voir engine.js : SEAT_CATEGORY_MAX_SEATS/SEAT_BUILD_COST_PER_SEAT,
// Team.currentSeats/buildSeats/categoryCapacity/arenaCapacity ;
// server/actions.js:buildArenaSeats ; moteurbasket3.html:renderArenaBuild.
const fs = require("fs");
const E = require("./engine.js");
const actions = require("./server/actions.js");
const { generateTeam, serializeTeam, teamFromSave, SEAT_CATEGORY_MAX_SEATS, SEAT_BUILD_COST_PER_SEAT, ARENA_MAX_CAPACITY, arenaInfo } = E;

// 1) Plafonds et prix fixes.
if (SEAT_CATEGORY_MAX_SEATS.loge !== 1000 || SEAT_CATEGORY_MAX_SEATS.courtside !== 2000 || ARENA_MAX_CAPACITY !== 45500) throw new Error("❌ Plafonds attendus : 2 000 Courtside, 1 000 Loges VIP, 45 500 places au total.");
// Salle de 45 000 places jamais agrandie : plafonds respectés, le reste aux tribunes.
{ const big = E.seatsForCapacity(45000); if (big.loge !== 1000 || big.courtside !== 2000 || Object.values(big).reduce((a, b) => a + b, 0) !== 45000 || E.SEAT_CATEGORIES.some(c => big[c.key] > SEAT_CATEGORY_MAX_SEATS[c.key])) throw new Error(`❌ Répartition d'une grande salle : ${JSON.stringify(big)}.`); }
// Plus une catégorie est exclusive, moins elle a de places (part et plafond).
E.SEAT_CATEGORIES.forEach((c, i, all) => { const n = all[i + 1]; if (n && (n.shareOfCapacity >= c.shareOfCapacity || SEAT_CATEGORY_MAX_SEATS[n.key] >= SEAT_CATEGORY_MAX_SEATS[c.key])) throw new Error(`❌ ${n.name} devrait avoir moins de places que ${c.name}.`); });
// 4 catégories, dans l'ordre d'affichage (2026-10-05).
const names = E.SEAT_CATEGORIES.map(c => c.name).join(" / ");
if (names !== "Tribune Supérieure / Tribune Centrale / Courtside / Loges VIP") throw new Error(`❌ Catégories inattendues : ${names}.`);
if (Math.abs(E.SEAT_CATEGORIES.reduce((s, c) => s + c.shareOfCapacity, 0) - 1) > 1e-9) throw new Error("❌ Les parts de capacité doivent faire 100 %.");
console.log("✅ Plafonds : 27 500 Tribune Supérieure, 15 000 Tribune Centrale, 2 000 Courtside, 1 000 Loges VIP (45 500 au total), places décroissantes avec l'exclusivité.");

// 2) Salle existante (palier 3 = 12 000 places) : répartition conservée.
const t = generateTeam("Test", 1);
t.arenaLevel = 2;
const s0 = t.currentSeats();
if (s0.gradins !== 4000 || s0.tribune !== 2240 || s0.courtside !== 960 || s0.loge !== 800 || t.arenaCapacity() !== 8000) throw new Error(`❌ Une salle de palier 2 devrait avoir 4 000/2 240/960/800 places (${JSON.stringify(s0)}).`);
console.log("✅ Salle de palier : 8 000 places réparties (4 000 / 2 240 / 960 / 800).");

// 3) Prix fixe : même coût par place, quelle que soit la taille de la tribune.
t.budget = 10000000;
const r1 = t.buildSeats({ gradins: 100 });
const r2 = t.buildSeats({ gradins: 100 });
if (!r1.ok || r1.cost !== 100 * SEAT_BUILD_COST_PER_SEAT.gradins || r2.cost !== r1.cost) throw new Error("❌ Le prix d'une place doit être fixe, de la première à la dernière.");
const mixed = t.buildSeats({ gradins: 1000, tribune: 500, courtside: 50, loge: 100 });
if (mixed.cost !== 1000 * 100 + 500 * 500 + 50 * 2000 + 100 * 5000) throw new Error(`❌ Coût d'un lot mixte inattendu : ${mixed.cost}.`);
if (t.arenaCapacity() !== 8000 + 200 + 1650) throw new Error("❌ La capacité devrait être la somme des places.");
console.log(`✅ Prix fixe par place (100 / 500 / 2 000 / 5 000 $), lot mixte ${mixed.cost.toLocaleString("fr-FR")} $.`);

// 4) Plafond par type, tout ou rien ; budget insuffisant refusé.
const before = JSON.stringify(t.currentSeats());
const capRes = t.buildSeats({ gradins: 100, loge: SEAT_CATEGORY_MAX_SEATS.loge });
if (capRes.ok || capRes.reason !== "cap" || JSON.stringify(t.currentSeats()) !== before) throw new Error("❌ Dépasser le plafond d'un type doit tout refuser, sans rien construire.");
t.budget = 10;
const poor = t.buildSeats({ gradins: 100 });
if (poor.ok || poor.reason !== "insufficient-budget") throw new Error("❌ Budget insuffisant : construction refusée.");
if (t.buildSeats({}).reason !== "empty") throw new Error("❌ Un lot vide doit être refusé.");
console.log("✅ Plafond par type (tout ou rien), budget insuffisant et lot vide refusés.");

// 5) Nom/palier suivent la capacité ; sauvegarde.
t.budget = 1e8;
t.buildSeats({ gradins: 10000, tribune: 4000 });
if (t.arenaLevel !== 5 || arenaInfo(t.arenaLevel).name !== "Arena") throw new Error(`❌ À ${t.arenaCapacity()} places, la salle devrait s'appeler « Arena » (palier ${t.arenaLevel}).`);
const back = teamFromSave(JSON.parse(JSON.stringify(serializeTeam(t))));
if (JSON.stringify(back.seats) !== JSON.stringify(t.seats) || back.arenaCapacity() !== t.arenaCapacity()) throw new Error("❌ Les places doivent survivre à la sauvegarde.");
console.log(`✅ Nom de la salle selon la capacité (${t.arenaCapacity().toLocaleString("fr-FR")} places → Arena), sauvegarde OK.`);

// 5bis) Sauvegarde d'avant le Courtside : places construites intactes, le
// Courtside reçoit la part du palier, prix existants gardés.
{
  const old = generateTeam("Ancienne", 1);
  const save = JSON.parse(JSON.stringify(serializeTeam(old)));
  save.arenaLevel = 4;
  save.seats = { gradins: 12000, tribune: 4000, loge: 900 };
  save.ticketPrices = { gradins: 18, tribune: 33, loge: 90 };
  const m = teamFromSave(save);
  const exp = E.seatsForCapacity(arenaInfo(4).capacity).courtside;
  if (m.seats.gradins !== 12000 || m.seats.tribune !== 4000 || m.seats.loge !== 900 || m.seats.courtside !== exp) throw new Error(`❌ Migration des places inattendue : ${JSON.stringify(m.seats)}.`);
  if (m.ticketPrices.gradins !== 18 || m.ticketPrices.loge !== 90 || m.ticketPrices.courtside !== 45) throw new Error(`❌ Migration des prix inattendue : ${JSON.stringify(m.ticketPrices)}.`);
  const res = m.simulateHomeAttendance("X");
  if (res.breakdown.map(b => b.key).join(",") !== "gradins,tribune,courtside,loge") throw new Error("❌ La recette doit couvrir les 4 catégories.");
  // Sauvegarde passée par la première version (2 % du palier, moins que les loges).
  const first = teamFromSave({ ...save, seats: { gradins: 12000, tribune: 4000, courtside: Math.round(arenaInfo(4).capacity * 0.02), loge: 900 } });
  if (first.seats.courtside !== exp) throw new Error(`❌ Première migration non reprise : ${JSON.stringify(first.seats)}.`);
  // Beaucoup de loges : le Courtside passe quand même au-dessus.
  // 2 500 loges construites (ancien plafond) : 1 000 gardées, 1 500 converties
  // en Courtside, différence de prix remboursée ; capacité inchangée.
  const vip = teamFromSave({ ...save, budget: 0, seats: { gradins: 12000, tribune: 4000, loge: 2500 } });
  if (vip.seats.loge !== 1000 || vip.seats.courtside !== 2000 || vip.seats.tribune !== 4000 || vip.seats.gradins !== 12000) throw new Error(`❌ Conversion des loges au-delà du plafond : ${JSON.stringify(vip.seats)}.`);
  if (vip.budget !== 1500 * (5000 - 2000)) throw new Error(`❌ Remboursement attendu ${1500 * 3000}, obtenu ${vip.budget}.`);
  // Courtside au-delà du nouveau plafond : bascule en Tribune Centrale.
  const cs = teamFromSave({ ...save, budget: 0, seats: { gradins: 12000, tribune: 4000, courtside: 2600, loge: 900 } });
  if (cs.seats.courtside !== 2000 || cs.seats.tribune !== 4600 || cs.budget !== 600 * 1500) throw new Error(`❌ Courtside au-delà du plafond : ${JSON.stringify(cs.seats)} / ${cs.budget}.`);
  // Courtside construit par le joueur (même sous les loges) : jamais touché.
  const built = teamFromSave({ ...save, seats: { gradins: 12000, tribune: 4000, courtside: 500, loge: 900 } });
  if (built.seats.courtside !== 500) throw new Error("❌ Des places Courtside sauvegardées ne doivent pas changer.");
  console.log(`✅ Ancienne sauvegarde : places et prix gardés, +${exp} places Courtside (toujours plus que les Loges VIP), recette sur 4 catégories.`);
}

// 6) Action serveur.
const u = generateTeam("Srv", 1); u.budget = 1e6;
const ok = actions.buildArenaSeats(u, 0, null, { add: { tribune: 200 } }, Date.now());
if (!ok.ok || ok.seats.tribune !== u.currentSeats().tribune || u.budget !== 1e6 - 200 * 500) throw new Error(`❌ buildArenaSeats devrait construire (${JSON.stringify(ok)}).`);
if (actions.buildArenaSeats(u, 0, null, {}, Date.now()).ok) throw new Error("❌ buildArenaSeats sans 'add' doit échouer.");
if (!fs.readFileSync("server/index.js", "utf-8").includes('"/api/arena/build-seats"')) throw new Error("❌ Route /api/arena/build-seats absente.");
console.log("✅ Action serveur /api/arena/build-seats.");

// 7) Navigateur : pas de bouton Agrandir en haut, brique sous la billetterie, construction.
(async () => {
  const { startTestServer, openGame, flush } = require("./test_helpers.js");
  const html = require("./test_game_html.js").readGameHtml();
  const { server, baseUrl } = await startTestServer();
  try {
    const dom = await openGame(html, baseUrl);
    const doc = dom.window.document, win = dom.window;
    win.eval("teamA.budget = 2000000;");
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "salle").click();
    if (doc.querySelector("#arenaCurrentPanel button")) throw new Error("❌ Plus de bouton dans le bandeau de la salle.");
    const card = doc.querySelector(".sl-main #seatCategoriesHolder + #arenaBuildHolder");
    if (!card) throw new Error("❌ « Agrandir la salle » devrait suivre la billetterie.");
    if (card.textContent.includes("prix monte")) throw new Error("❌ Pas de texte d'explication sur le prix.");
    const cap0 = win.eval("teamA.arenaCapacity()");
    doc.querySelector('[data-build-step="gradins:100"]').click();
    doc.querySelector('[data-build-step="gradins:100"]').click();
    doc.querySelector('[data-build-step="loge:100"]').click();
    const btn = doc.getElementById("arenaBuildBtn");
    if (btn.disabled) throw new Error("❌ Le bouton Construire devrait être actif.");
    if (!doc.getElementById("arenaBuildHolder").textContent.includes((200 * 100 + 100 * 5000).toLocaleString("fr-FR"))) throw new Error("❌ Le coût total devrait être affiché.");
    btn.click();
    await flush(dom);
    if (win.eval("teamA.arenaCapacity()") !== cap0 + 300) throw new Error("❌ Construire devrait ajouter les 300 places.");
    if (win.eval("teamA.budget") !== 2000000 - 520000) throw new Error("❌ Le budget devrait être débité de 520 000 $.");
    console.log("✅ Navigateur : bandeau sans bouton, brique sous la billetterie, +300 places construites pour 520 000 $.");
    dom.window.close();
  } finally {
    server.close();
  }
  // Salle d'avant le choix des gradins (2 550 loges VIP pour un plafond de
  // 2 500, retour utilisateur 2026-10-03) : les autres gradins restent
  // constructibles.
  {
    const E = require("./engine.js");
    const t = E.generateTeam("Ancienne salle");
    t.budget = 1e8;
    t.seats = { ...t.currentSeats(), loge: E.SEAT_CATEGORY_MAX_SEATS.loge + 50 };
    const r = t.buildSeats({ gradins: 1000 });
    if (!r.ok) throw new Error("❌ Loges VIP au-dessus du plafond : la Tribune Supérieure devrait rester constructible.");
    console.log("✅ Loges VIP au-dessus du plafond (ancienne salle) : les autres gradins restent constructibles.");
  }
  console.log("\n🏁 Tous les tests de l'agrandissement libre de la salle sont passés.");
})().catch(e => { console.error(e); process.exit(1); });
