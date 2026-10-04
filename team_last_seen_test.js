// Dernière connexion sur le profil du club (retour utilisateur 2026-10-04 :
// « afficher la date de dernière connexion sur le profil du club »).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, writeRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };

(async () => {
  const { server, savePath, baseUrl } = await startTestServer();
  const domInit = await openGame(html, baseUrl);
  await flush(domInit);
  const saved = readRawSave(savePath);
  const other = 2;
  saved.league.teams[other].isHuman = true;
  saved.league.teams[other].lastSeenAt = Date.now() - 26 * 3600 * 1000;
  writeRawSave(savePath, saved);
  await domInit.window.close();

  const dom = await openGame(html, baseUrl);
  const win = dom.window, doc = win.document;
  const now = new Date(2026, 9, 10, 12).getTime();
  assert(win.lastSeenLabel(now - 3600 * 1000, now) === "aujourd'hui", "libellé : aujourd'hui");
  assert(win.lastSeenLabel(now - 24 * 3600 * 1000, now) === "hier", "libellé : hier");
  assert(win.lastSeenLabel(now - 3 * 24 * 3600 * 1000, now) === "il y a 3 jours", "libellé : il y a 3 jours");
  assert(/oct|sept/.test(win.lastSeenLabel(now - 20 * 24 * 3600 * 1000, now)), "libellé : date au-delà d'une semaine");

  win.showTeamDetail(other);
  const chip = doc.querySelector("#teamDetailContent .ov-lastseen");
  assert(!!chip && /Dernière connexion/.test(chip.textContent) && /hier|aujourd'hui/.test(chip.textContent), "profil d'un club humain : « Dernière connexion » affichée");
  win.showTeamDetail(win.eval("myTeamIndex"));
  assert(!doc.querySelector("#teamDetailContent .ov-lastseen"), "mon propre club : pas de dernière connexion");

  await flush(dom);
  await dom.window.close();
  server.close();
  console.log("🏁 team_last_seen_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
