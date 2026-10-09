// Fiche joueur : petit triangle ▲ sur les caractéristiques qui ont progressé
// au dernier entraînement (retour utilisateur 2026-09-27).
const path = require("path");
process.chdir(__dirname);
const { startTestServer, openGame } = require(path.resolve("test_helpers.js"));
const fs = require("fs");
(async () => {
  const html = require("./test_game_html.js").readGameHtml();
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const w = dom.window, d = w.document;
  const tA = w.eval("teamA"), idx = w.eval("league.teams.indexOf(teamA)");
  const p = tA.players[0];
  const a = Object.keys(p.attrs)[0];
  tA.lastTrainingReport = { players: { [p.id]: { gains: [{ attr: a, before: 10, after: 12 }] } } };
  w.eval(`showPlayerDetail(${idx}, ${JSON.stringify(p.id)})`);
  const ups = [...d.querySelectorAll("#playerDetailContent .pdp-attr-up")];
  const filled = ups.filter(e => e.textContent === "▲");
  console.log("slots", ups.length, "ups", filled.length, filled.map(e => e.title));
  if (filled.length !== 1 || !/\+2/.test(filled[0].title)) { console.log("FAIL"); process.exit(1); }
  console.log("OK"); server.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
