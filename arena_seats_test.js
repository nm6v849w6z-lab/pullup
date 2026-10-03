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
if (SEAT_CATEGORY_MAX_SEATS.loge !== 2500 || ARENA_MAX_CAPACITY !== 45000) throw new Error("❌ Plafonds attendus : 2 500 loges, 45 000 places au total.");
console.log("✅ Plafonds : 27 500 gradins, 15 000 tribune, 2 500 loges (45 000 au total).");

// 2) Salle existante (palier 3 = 12 000 places) : répartition conservée.
const t = generateTeam("Test", 1);
t.arenaLevel = 3;
const s0 = t.currentSeats();
if (s0.gradins !== 6600 || s0.tribune !== 3600 || s0.loge !== 1800 || t.arenaCapacity() !== 12000) throw new Error(`❌ Une salle de palier 3 devrait garder 6 600/3 600/1 800 places (${JSON.stringify(s0)}).`);
console.log("✅ Salle existante : 12 000 places réparties comme avant (6 600 / 3 600 / 1 800).");

// 3) Prix fixe : même coût par place, quelle que soit la taille de la tribune.
t.budget = 10000000;
const r1 = t.buildSeats({ gradins: 100 });
const r2 = t.buildSeats({ gradins: 100 });
if (!r1.ok || r1.cost !== 100 * SEAT_BUILD_COST_PER_SEAT.gradins || r2.cost !== r1.cost) throw new Error("❌ Le prix d'une place doit être fixe, de la première à la dernière.");
const mixed = t.buildSeats({ gradins: 1000, tribune: 500, loge: 100 });
if (mixed.cost !== 1000 * 100 + 500 * 500 + 100 * 5000) throw new Error(`❌ Coût d'un lot mixte inattendu : ${mixed.cost}.`);
if (t.arenaCapacity() !== 12000 + 200 + 1600) throw new Error("❌ La capacité devrait être la somme des places.");
console.log(`✅ Prix fixe par place (100 / 500 / 5 000 €), lot mixte ${mixed.cost.toLocaleString("fr-FR")} €.`);

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
  const html = fs.readFileSync("moteurbasket3.html", "utf-8");
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
    if (win.eval("teamA.budget") !== 2000000 - 520000) throw new Error("❌ Le budget devrait être débité de 520 000 €.");
    console.log("✅ Navigateur : bandeau sans bouton, brique sous la billetterie, +300 places construites pour 520 000 €.");
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
    if (!r.ok) throw new Error("❌ Loges VIP au-dessus du plafond : les gradins populaires devraient rester constructibles.");
    console.log("✅ Loges VIP au-dessus du plafond (ancienne salle) : les autres gradins restent constructibles.");
  }
  console.log("\n🏁 Tous les tests de l'agrandissement libre de la salle sont passés.");
})().catch(e => { console.error(e); process.exit(1); });
