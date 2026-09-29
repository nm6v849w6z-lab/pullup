// Transmission du club d'un bêta-testeur à un remplaçant (2026-09-29) —
// POST /api/admin/accounts/transfer-club : même club (effectif, budget),
// nouveau nom, nouveau lien privé, ancien lien et ancien compte supprimés.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { createHandler } = require("./index.js");
const store = require("./store.js");
const AccountRoutes = require("./accountRoutes.js");
const Accounts = require("./accounts.js");

function start(paths, nowFn) {
  const server = http.createServer(createHandler(paths.solo, nowFn, paths.multi, paths.accounts));
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function request(server, method, urlPath, jsonBody, headers = {}) {
  const { port } = server.address();
  const payload = jsonBody !== undefined ? JSON.stringify(jsonBody) : null;
  const h = { ...headers };
  if (payload) { h["Content-Type"] = "application/json"; h["Content-Length"] = Buffer.byteLength(payload); }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers: h }, res => {
      let raw = "";
      res.on("data", c => { raw += c; });
      res.on("end", () => {
        let body = null;
        try { body = JSON.parse(raw); } catch (e) { /* pas du JSON */ }
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const now = Date.UTC(2026, 8, 7, 10);
  AccountRoutes._resetMemoryForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basket-transfer-club-test-"));
  const paths = { solo: path.join(dir, "league.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
  const { league } = store.createMultiManagerCareer(["Lyon M", "Grenoble M"], Date.UTC(2026, 8, 7));
  await store.saveMultiLeague(league, paths.multi);
  const oldToken = league.teams[1].managerLinkToken;
  const lyonToken = league.teams[0].managerLinkToken;
  const admin = { "X-Admin-Token": "secret-admin" };
  process.env.BASKET_ADMIN_TOKEN = "secret-admin";
  const server = await start(paths, () => now);
  try {
    const claim = await request(server, "POST", "/api/account/claim", { email: "ancien@x.fr", password: "motdepasse1" }, { "X-TipIn-Token": oldToken });
    assert.strictEqual(claim.statusCode, 200, JSON.stringify(claim.body));
    await request(server, "POST", "/api/account/claim", { email: "lyon@x.fr", password: "motdepasse1" }, { "X-TipIn-Token": lyonToken });
    const before = await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": oldToken });
    const beforeTeam = before.body.league.teams[before.body.myTeamIndex];

    // Refus : sans jeton admin, club inconnu, nom invalide ou déjà pris.
    assert.strictEqual((await request(server, "POST", "/api/admin/accounts/transfer-club", { club: "Grenoble M" })).statusCode, 403);
    assert.strictEqual((await request(server, "POST", "/api/admin/accounts/transfer-club", { club: "Inconnu" }, admin)).statusCode, 404);
    assert.strictEqual((await request(server, "POST", "/api/admin/accounts/transfer-club", { club: "Paris" }, admin)).statusCode, 404, "un club de l'IA n'est pas concerné");
    assert.strictEqual((await request(server, "POST", "/api/admin/accounts/transfer-club", { club: "Grenoble M", newName: "<script>" }, admin)).statusCode, 400);
    assert.strictEqual((await request(server, "POST", "/api/admin/accounts/transfer-club", { club: "Grenoble M", newName: "lyon m" }, admin)).statusCode, 409);

    const res = await request(server, "POST", "/api/admin/accounts/transfer-club", { club: "grenoble m", newName: "Alpes Ballers" }, admin);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.previousName, "Grenoble M");
    assert.strictEqual(res.body.club, "Alpes Ballers");
    assert.deepStrictEqual(res.body.deletedAccounts, ["ancien@x.fr"]);
    const newToken = res.body.link.split("/?m=")[1];
    assert.ok(/^[0-9a-f]{48}$/.test(newToken) && newToken !== oldToken);

    // L'ancien lien et l'ancien compte ne donnent plus accès au club.
    assert.strictEqual((await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": oldToken })).statusCode, 401);
    const oldLogin = await request(server, "POST", "/api/account/login", { email: "ancien@x.fr", password: "motdepasse1" });
    assert.notStrictEqual(oldLogin.body && oldLogin.body.managerToken, newToken);
    const accounts = await Accounts.loadAccounts(paths.accounts);
    assert.deepStrictEqual(accounts.accounts.map(a => a.email), ["lyon@x.fr"], "les autres comptes sont intacts");

    // Le nouveau lien ouvre le MÊME club (effectif et budget), renommé, tutoriel relancé.
    const after = await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": newToken });
    assert.strictEqual(after.statusCode, 200);
    assert.strictEqual(after.body.myTeamIndex, before.body.myTeamIndex);
    const afterTeam = after.body.league.teams[after.body.myTeamIndex];
    assert.strictEqual(afterTeam.teamName, "Alpes Ballers");
    assert.deepStrictEqual(afterTeam.players.map(p => p.id), beforeTeam.players.map(p => p.id));
    assert.strictEqual(afterTeam.budget, beforeTeam.budget);
    const saved = await store.loadMultiLeague(paths.multi);
    assert.strictEqual(saved.league.teams[1].onboardingTourCompleted, false);

    // Le remplaçant se crée ses identifiants avec le nouveau lien.
    const claim2 = await request(server, "POST", "/api/account/claim", { email: "nouveau@x.fr", password: "motdepasse1" }, { "X-TipIn-Token": newToken });
    assert.strictEqual(claim2.statusCode, 200, JSON.stringify(claim2.body));
    const login = await request(server, "POST", "/api/account/login", { email: "nouveau@x.fr", password: "motdepasse1" });
    assert.strictEqual(login.body.managerToken, newToken);

    // Sans nouveau nom : le club garde le sien, seul le manager change.
    const keep = await request(server, "POST", "/api/admin/accounts/transfer-club", { club: "Alpes Ballers" }, admin);
    assert.strictEqual(keep.statusCode, 200, JSON.stringify(keep.body));
    assert.strictEqual(keep.body.club, "Alpes Ballers");
    assert.deepStrictEqual(keep.body.deletedAccounts, ["nouveau@x.fr"]);
  } finally {
    server.close();
    delete process.env.BASKET_ADMIN_TOKEN;
  }

  // Références par nom ({ leagueId, idx, name }) mises à jour en profondeur.
  const { _renameClubRefsForTests: rename } = AccountRoutes;
  const refs = { list: [{ home: { leagueId: "fr-1", idx: 3, name: "Vieux" }, away: { leagueId: "fr-1", idx: 4, name: "Autre" } }] };
  assert.strictEqual(rename(refs, "fr-1", 3, "Neuf"), true);
  assert.strictEqual(refs.list[0].home.name, "Neuf");
  assert.strictEqual(refs.list[0].away.name, "Autre");
  assert.strictEqual(rename(refs, "fr-1", 3, "Neuf"), false);

  console.log("transfer_club_test: OK");
}

main().catch(e => { console.error(e); process.exit(1); });
