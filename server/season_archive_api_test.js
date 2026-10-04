// API des archives de saison : liste des saisons du club, puis ses matchs
// d'une saison (feuilles figées), jamais ceux des autres clubs.
const assert = require("assert");
const store = require("./store.js");
const World = require("./world.js");
const { startTestServer } = require("../test_helpers.js");

(async () => {
  const { server, baseUrl, multiSavePath } = await startTestServer();
  const st = await (await fetch(baseUrl + "api/state")).json();
  const world = await World.loadWorld(multiSavePath, Date.now());
  const entry = world.leagues[0];
  const lg = await World.loadLeague(world, entry.id, multiSavePath);
  const me = lg.teams.find(t => t.isHuman) || lg.teams[0];
  const other = lg.teams.find(t => t !== me);
  const row = n => [1, n, "Meneur", true, false, 30, 10, 2, 0, 3, 1, 0, 2, 1, 4, 8, 0, 2, 2, 2, 0];
  const mk = (h, a) => ({ competition: "championship", round: 0, at: 1, quarterScores: { home: [20, 20, 20, 20], away: [10, 10, 10, 10] }, scoreHome: 80, scoreAway: 40,
    home: { team: h, rows: [row("Joueur parti")] }, away: { team: a, rows: [row("Autre")] } });
  await store.saveSeasonArchive(entry.id, 1, { version: 1, season: 1, totalRounds: 18, cols: [], teams: lg.teams.map(t => t.name),
    matches: [mk(me.name, other.name), mk("Club X", "Club Y")] }, multiSavePath);
  world.seasonArchives = { [entry.country]: { 1: { [entry.id]: lg.teams.map(t => t.name) } } };
  await World.saveWorld(world, multiSavePath);
  const list = await (await fetch(baseUrl + "api/season-archive")).json();
  assert.deepStrictEqual(list.seasons, [1], JSON.stringify(list));
  const one = await (await fetch(baseUrl + "api/season-archive?season=1")).json();
  assert.strictEqual(one.matches.length, 1, "seulement les matchs du club");
  assert.strictEqual(one.matches[0].home.rows[0][1], "Joueur parti");
  const none = await fetch(baseUrl + "api/season-archive?season=7");
  assert.strictEqual(none.status, 404);
  server.close();
  console.log("✅ API archives de saison : saisons du club, ses matchs seulement, 404 sinon");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
