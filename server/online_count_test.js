// Barre du haut : nombre de managers connectés (fenêtre de 5 min).
const assert = require("assert");
const LeagueChat = require("./leagueChat.js");
LeagueChat._resetForTests();
const now = 10 * 60 * 1000;
LeagueChat.touchPresence("tokA", now - 60 * 1000);
LeagueChat.touchPresence("tokB", now - 6 * 60 * 1000);
LeagueChat.touchPresence("tokC", now);
assert.strictEqual(LeagueChat.onlineCount(now), 2);
console.log("✅ Managers en ligne : seuls ceux des 5 dernières minutes comptent");

// Route GET /api/online : un appel authentifié compte, la route ne renvoie qu'un nombre.
(async () => {
  const { startTestServer } = require("../test_helpers.js");
  const { server, baseUrl } = await startTestServer();
  await fetch(baseUrl + "api/state");
  const d = await (await fetch(baseUrl + "api/online")).json();
  assert.deepStrictEqual(Object.keys(d), ["online"]);
  assert.ok(d.online >= 1, JSON.stringify(d));
  server.close();
  console.log("✅ /api/online : nombre de managers connectés");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
