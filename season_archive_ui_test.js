// Calendrier : sélecteur « Saison » et feuilles de match archivées
// (retour utilisateur 2026-10-04).
const fs = require("fs");
const assert = require("assert");
const store = require("./server/store.js");
const World = require("./server/world.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const { server, baseUrl, multiSavePath } = await startTestServer();
  await fetch(baseUrl + "api/state");
  const world = await World.loadWorld(multiSavePath, Date.now());
  const entry = world.leagues[0];
  const lg = await World.loadLeague(world, entry.id, multiSavePath);
  const me = lg.teams[0], other = lg.teams[1];
  const cols = ["id", "name", "position", "starter", "isMvp", "min", "pts", "reb", "oreb", "ast", "stl", "blk", "tov", "pf", "fgm2", "fga2", "fgm3", "fga3", "ftm", "fta", "plusMinus"];
  const row = (n, pts) => [9999, n, "Meneur", true, false, 30, pts, 2, 0, 3, 1, 0, 2, 1, 4, 8, 0, 2, 2, 2, 0];
  await store.saveSeasonArchive(entry.id, 1, { version: 1, season: 1, totalRounds: 18, cols, teams: [me.name, other.name],
    matches: [{ competition: "championship", round: 0, at: Date.UTC(2026, 8, 1, 18), quarterScores: { home: [20, 20, 20, 20], away: [10, 10, 10, 10] }, scoreHome: 80, scoreAway: 40,
      home: { team: me.name, rows: [row("Joueur Parti Depuis", 80)] }, away: { team: other.name, rows: [row("Adversaire Archivé", 40)] } }] }, multiSavePath);
  world.seasonArchives = { [entry.country]: { 1: { [entry.id]: [me.name, other.name] } } };
  await World.saveWorld(world, multiSavePath);
  const dom = await openGame(html, baseUrl);
  const w = dom.window, d = w.document;
  const btn = d.getElementById("catchupContinueBtn"); if (btn) btn.click();
  w.eval("TAB_HANDLERS.calendrier()");
  for (let i = 0; i < 60 && !w.eval("calArchive.list"); i++) await sleep(50);
  // Saison en cours = 2 : la saison 1 est une saison passée.
  w.eval("league.seasonNumber = 2; TAB_HANDLERS.calendrier()");
  const sel = d.getElementById("calSeasonSelect");
  assert.ok(sel && [...sel.options].some(o => o.value === "1"), "sélecteur Saison avec la saison 1");
  sel.value = "1";
  sel.dispatchEvent(new w.Event("change", { bubbles: true }));
  for (let i = 0; i < 60 && !d.querySelector("[data-arch-match]"); i++) await sleep(50);
  const a = d.querySelector("[data-arch-match]");
  assert.ok(a && /80 - 40/.test(d.getElementById("calendrierContent").textContent), "match archivé listé avec son score");
  a.click();
  const ov = d.getElementById("matchBoxscoreOverlay");
  assert.ok(ov && ov.textContent.includes("Joueur Parti Depuis"), "feuille de match archivée avec le joueur parti");
  ov.querySelector("#matchBoxscoreCloseX").click();
  const sel2 = d.getElementById("calSeasonSelect");
  sel2.value = "";
  sel2.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.ok(d.querySelector("[data-cal-filter]"), "retour à la saison en cours");
  dom.window.close(); server.close();
  console.log("✅ Calendrier : sélecteur Saison, liste et feuille de match archivées, retour à la saison en cours");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
