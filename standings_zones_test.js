// Zones du classement selon les divisions réellement ouvertes (2026-09-29) :
// aucune relégation/barrage sans championnat juste en dessous ; 1 → 10e ;
// 2 → 9e et 10e ; 3 → + barrage 7e-8e ; recalculé dès qu'une division s'ouvre.
const fs = require("fs");
const assert = require("assert");
const World = require("./server/world.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

// Serveur : divisionMovesFor sur un monde fictif.
const world = { leagues: [
  { id: "fr-1", country: "fr", level: 1, group: 0 },
  { id: "fr-2a", country: "fr", level: 2, group: 0 },
  { id: "fr-2b", country: "fr", level: 2, group: 1 },
  { id: "fr-3a", country: "fr", level: 3, group: 0 },
] };
assert.deepStrictEqual(World.divisionMovesFor(world, "fr-1"), { promotes: false, relegations: 2, barrage: false, upperLabel: null });
assert.deepStrictEqual(World.divisionMovesFor(world, "fr-2a"), { promotes: true, relegations: 1, barrage: false, upperLabel: "Division I" });
const d2b = World.divisionMovesFor(world, "fr-2b");
assert.strictEqual(d2b.relegations, 0); assert.strictEqual(d2b.barrage, false);
const d3 = World.divisionMovesFor(world, "fr-3a");
assert.strictEqual(d3.relegations, 0, "Division III sans Division IV : aucune relégation");
world.leagues.push({ id: "fr-4a", country: "fr", level: 4, group: 0 });
assert.strictEqual(World.divisionMovesFor(world, "fr-3a").relegations, 1, "dès qu'une Division IV s'ouvre, la relégation apparaît");
world.leagues.push({ id: "fr-2c", country: "fr", level: 2, group: 2 });
assert.deepStrictEqual(World.divisionMovesFor(world, "fr-1"), { promotes: false, relegations: 3, barrage: true, upperLabel: null });
console.log("✅ Serveur : zones calculées d'après les championnats ouverts juste en dessous.");

(async () => {
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const win = dom.window;
  const zones = dm => {
    win.eval(`league.divisionMoves = ${JSON.stringify(dm)};`);
    return win.eval(`[1,2,3,4,5,6,7,8,9,10].map(r => standingsRowZone(r, 10))`).join(",");
  };
  const legend = () => win.eval("standingsLegendItems().map(i => i.text).join(' | ')");
  assert.strictEqual(zones({ promotes: false, relegations: 0, barrage: false }), "zone-promo,zone-promo,zone-promo,zone-promo,,,,,,");
  assert.strictEqual(legend(), "Play-offs");
  assert.strictEqual(zones({ promotes: true, relegations: 0, barrage: false, upperLabel: "Division II.1" }), "zone-promo,zone-promo,zone-promo,zone-promo,,,,,,");
  assert.strictEqual(legend(), "Play-offs · le champion monte en Division II.1");
  assert.strictEqual(zones({ promotes: false, relegations: 1, barrage: false }), "zone-promo,zone-promo,zone-promo,zone-promo,,,,,,zone-relegation");
  assert.strictEqual(legend(), "Play-offs | Relégation directe (10e)");
  assert.strictEqual(zones({ promotes: false, relegations: 2, barrage: false }), "zone-promo,zone-promo,zone-promo,zone-promo,,,,,zone-relegation,zone-relegation");
  assert.strictEqual(zones({ promotes: true, relegations: 3, barrage: true }), "zone-promo,zone-promo,zone-promo,zone-promo,,,zone-barrage,zone-barrage,zone-relegation,zone-relegation");
  assert.strictEqual(legend(), "Play-offs · le champion monte | Barrage de relégation (7e contre 8e) | Relégation directe (9e, 10e)");
  console.log("✅ Jeu : couleurs et légende suivent exactement ce qui est en jeu.");
  // Page Ligue rendue sans erreur, sans mention de relégation quand rien n'est en jeu.
  win.eval("league.divisionMoves = { promotes: false, relegations: 0, barrage: false }; showStandings();");
  const txt = dom.window.document.getElementById("standingsContent").textContent;
  assert(!/Relégation directe|Barrage de relégation/.test(txt), "aucune mention de relégation sans division inférieure");
  console.log("✅ Page Ligue : aucune zone de relégation affichée sans division inférieure.");
  await flush(dom); win.close(); server.close();
  console.log("\n🏁 Zones du classement conformes.");
})().catch(e => { console.error(e); process.exit(1); });
