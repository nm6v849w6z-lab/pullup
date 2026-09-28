"use strict";
// Managers inactifs (liste de la nuit du 2026-09-28 : « rendre le club à
// l'IA après X jours ») : sans visite depuis World.INACTIVE_RELEASE_DAYS
// jours, le club redevient un club de l'IA ; le compte en garde la trace et
// le récupère au retour du manager s'il est toujours à l'IA. Voir
// server/world.js (releaseInactiveManagers, reclaimClub), server/index.js
// (lastSeenAt, comptes) et server/accountRoutes.js (tryAssignClub).
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const store = require("./store.js");
const World = require("./world.js");
const Accounts = require("./accounts.js");
const { createHandler, maybeCatchUpWorld } = require("./index.js");

const D = 24 * 3600 * 1000;
const ok = m => console.log("✅ " + m);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inactive-"));
  const paths = { solo: path.join(dir, "solo.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
  const clock = { now: Date.UTC(2026, 8, 28, 10) };
  const server = http.createServer(createHandler(paths.solo, () => clock.now, paths.multi, paths.accounts));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const career = store.createMultiManagerCareer(["Lyon Absent", "Paris Absent"], clock.now - 2 * D, "Lyon Absent");
  await store.saveMultiLeague(career.league, paths.multi);

  // Inscription : un club attribué.
  const su = await call("POST", "/api/account/signup", { email: "absent@test.fr", password: "motdepasse1", clubName: "Annecy Absent" });
  assert.strictEqual(su.body.status, "active");
  const token = su.body.managerToken;
  const st = await call("GET", "/api/state", null, { "X-TipIn-Token": token });
  assert.strictEqual(st.status, 200);
  let w = await World.loadWorld(paths.multi, clock.now);
  let found = await World.findTeamByToken(w, token, paths.multi);
  assert.strictEqual(found.league.teams[found.teamIndex].lastSeenAt, clock.now, "dernière visite enregistrée");
  const { leagueId, teamIndex } = found;
  const clubName = found.league.teams[teamIndex].name;
  ok(`inscription : ${clubName} (${leagueId}), dernière visite enregistrée`);

  // Absent un peu moins que le délai : rien.
  clock.now += (World.INACTIVE_RELEASE_DAYS - 1) * D;
  await maybeCatchUpWorld(paths.multi, clock.now, true, paths.accounts);
  w = await World.loadWorld(paths.multi, clock.now);
  assert.ok((await World.loadLeague(w, leagueId, paths.multi)).teams[teamIndex].isHuman, "toujours au manager");
  ok(`${World.INACTIVE_RELEASE_DAYS - 1} jours d'absence : le club reste au manager`);

  // Au-delà : club rendu à l'IA, jeton invalide, compte sans club.
  clock.now += 2 * D;
  const evs = await maybeCatchUpWorld(paths.multi, clock.now, true, paths.accounts);
  assert.ok(evs.some(e => e.type === "club-released" && e.name === clubName));
  w = await World.loadWorld(paths.multi, clock.now);
  const lg = await World.loadLeague(w, leagueId, paths.multi);
  const team = lg.teams[teamIndex];
  assert.ok(!team.isHuman && !team.managerLinkToken && team.name === clubName && team.players.length >= 5, "club à l'IA, nom et effectif gardés");
  assert.ok(!w.tokens[token]);
  const gone = await call("GET", "/api/state", null, { "X-TipIn-Token": token });
  assert.strictEqual(gone.status, 401);
  const accs = await Accounts.loadAccounts(paths.accounts);
  const acc = Accounts.findByEmail(accs, "absent@test.fr");
  assert.ok(!acc.managerToken && acc.releasedClub && acc.releasedClub.name === clubName);
  ok(`${World.INACTIVE_RELEASE_DAYS + 1} jours d'absence : ${clubName} rendu à l'IA (effectif et nom gardés), ancien lien invalide, compte sans club`);

  // Retour : connexion → il récupère son club.
  const back = await call("POST", "/api/account/login", { email: "absent@test.fr", password: "motdepasse1" });
  assert.strictEqual(back.body.status, "active");
  const st2 = await call("GET", "/api/state", null, { "X-TipIn-Token": back.body.managerToken });
  assert.strictEqual(st2.status, 200);
  w = await World.loadWorld(paths.multi, clock.now);
  found = await World.findTeamByToken(w, back.body.managerToken, paths.multi);
  assert.strictEqual(found.leagueId, leagueId); assert.strictEqual(found.teamIndex, teamIndex);
  assert.ok(found.league.teams[teamIndex].feed.entries.some(e => /Bon retour/.test(e.title)));
  ok("retour du manager : connexion → il récupère son club (message « Bon retour »)");

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("\n🏁 inactive_manager_test.js : tout est vert");
})().catch(e => { console.error("❌", e); process.exit(1); });
