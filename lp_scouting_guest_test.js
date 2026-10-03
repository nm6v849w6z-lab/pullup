// Analyse d'équipe d'un adversaire de ligue privée venu d'un autre
// championnat (retour utilisateur 2026-10-03 : « je suis premium et ça me
// met ce message ») : l'accès doit être « full » en Premium et le rapport
// doit se construire (server/index.js:attachPrivateLeagueScoutingGuest).
const assert = require("assert");
const store = require("./server/store.js");
const World = require("./server/world.js");
const PL = require("./server/privateLeague.js");
const { startTestServer } = require("./test_helpers.js");
const ok = m => console.log("✅ " + m);

(async () => {
  const clock = { now: Date.now() };
  const { server, multiSavePath, baseUrl } = await startTestServer(() => clock.now);
  const career = store.createMultiManagerCareer(["Lyon LP", "Paris LP"], clock.now - 2 * 24 * 3600 * 1000, "Lyon LP");
  await store.saveMultiLeague(career.league, multiSavePath);
  await World.catchUpWorld(multiSavePath, clock.now);
  const w = await World.loadWorld(multiSavePath, clock.now);
  const assign = async (country, clubName) => { const r = await World.assignClub(w, multiSavePath, { country, clubName, now: clock.now }); assert.ok(r.ok); return r; };
  const boston = await assign("us", "Boston LP");
  const roma = await assign("it", "Roma LP");
  const lyonIdx = career.league.teams.findIndex(t => t.name === "Lyon LP");
  const lyon = { token: career.league.teams[lyonIdx].managerLinkToken, leagueId: "fr-1", teamIndex: lyonIdx };
  for (const c of [lyon, boston, roma]) {
    const lg = await World.loadLeague(w, c.leagueId, multiSavePath);
    lg.teams[c.teamIndex].isPaying = true;
    await store.saveMultiLeague(lg, multiSavePath);
  }
  const api = async (path, who, body) => {
    const res = await fetch(new URL(path, baseUrl), { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "X-TipIn-Token": who.token }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  let r = await api("/api/private-league/create", lyon, { name: "Ligue Scouting", size: 4, venue: "home", time: "20:00" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const lpId = r.body.privateLeagueId;
  const code = r.body.privateLeagues.find(l => l.id === lpId).code;
  for (const c of [boston, roma]) { r = await api("/api/private-league/join", c, { code }); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); }

  r = await api("/api/save", lyon);
  const lp = r.body.league.privateLeagues.find(l => l.id === lpId);
  const guest = lp.members.find(m => m.name === "Boston LP");
  assert.ok(guest && guest.idx >= PL.PRIVATE_LEAGUE_GUEST_IDX, "Boston est un invité local");

  r = await api(`/api/scouting/access?opponent=${guest.idx}`, lyon);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.level, "full", JSON.stringify(r.body));
  ok("Premium : accès complet à l'analyse d'un adversaire de ligue privée étranger");

  r = await api(`/api/scouting/report?opponent=${guest.idx}`, lyon);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.opponentName, "Boston LP");
  ok("Rapport construit depuis le championnat de l'adversaire");

  server.close();
  console.log("\n✅ Analyse d'un adversaire de ligue privée : OK.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
