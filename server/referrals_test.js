// Parrainage et badge « Amis » (2026-10-07, server/referrals.js) : lien
// personnel, validation après une saison COMPLÈTE du filleul, protections
// (auto-parrainage, même connexion, même email, limite), badge recopié sur
// le club du parrain et persistant (rechargement, nouvelle saison).
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createHandler } = require("./index.js");
const store = require("./store.js");
const World = require("./world.js");
const AccountRoutes = require("./accountRoutes.js");
const Accounts = require("./accounts.js");
const Referrals = require("./referrals.js");
process.env.BASKET_INVITE_CODE = "off";
function check(c, msg) { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); }

// --- Unitaire ---
check(Referrals.canonicalEmail("A.Lice+promo@GoogleMail.com") === "alice@gmail.com" && Referrals.canonicalEmail("bob+x@ex.fr") === "bob@ex.fr", "emails comparés sans alias (+étiquette, points Gmail)");
{
  const data = { accounts: [{ id: "R", email: "r@ex.fr", ipSeen: [{ fp: "AAA" }] }] };
  const code = Referrals.codeFor(data, data.accounts[0]);
  check(/^[A-Z2-9]{8}$/.test(code) && Referrals.codeFor(data, data.accounts[0]) === code, "code personnel stable, 8 caractères sans ambiguïté");
  const mk = (id, extra) => { const a = { id, ...extra }; data.accounts.push(a); return a; };
  check(Referrals.attachAtSignup(data, mk("X", {}), "INCONNU1", "BBB", 1) === null, "code inconnu : inscription normale, aucun parrainage");
  check(Referrals.attachAtSignup(data, mk("S", { email: "s@ex.fr" }), code, "AAA", 1).reason === "same-connection", "même connexion que le parrain : refusé");
  check(Referrals.attachAtSignup(data, mk("E", { email: "R+2@ex.fr" }), code, "CCC", 1).reason === "same-email", "même email (alias) : refusé");
  const ok = mk("OK", { email: "ok@ex.fr" });
  check(Referrals.attachAtSignup(data, ok, code, "DDD", 1).status === "pending", "ami d'une autre connexion : en attente");
  check(Referrals.attachAtSignup(data, ok, code, "DDD", 2) === null && ok.referredBy.at === 1, "parrainage figé à la création (jamais remplacé)");
  for (let i = 0; i < Referrals.MAX_PENDING; i++) Referrals.attachAtSignup(data, mk("P" + i, {}), code, "F" + i, 1);
  check(Referrals.attachAtSignup(data, mk("Z", {}), code, "ZZZ", 1).reason === "limit", `au plus ${Referrals.MAX_PENDING} invitations en attente`);
}

// --- Intégration HTTP ---
function request(server, method, urlPath, body, headers = {}) {
  const { port } = server.address();
  const payload = body !== undefined ? JSON.stringify(body) : null;
  const h = { ...headers };
  if (payload) { h["Content-Type"] = "application/json"; h["Content-Length"] = Buffer.byteLength(payload); }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers: h }, res => {
      let raw = ""; res.on("data", c => { raw += c; });
      res.on("end", () => { let b = null; try { b = JSON.parse(raw); } catch (e) { /* html */ } resolve({ status: res.statusCode, body: b }); });
    });
    req.on("error", reject); if (payload) req.write(payload); req.end();
  });
}

(async () => {
  AccountRoutes._resetMemoryForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basket-referral-test-"));
  const paths = { solo: path.join(dir, "league.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
  const { league } = store.createMultiManagerCareer(["Lyon M"], Date.UTC(2026, 8, 7));
  await store.saveMultiLeague(league, paths.multi);
  let now = Date.UTC(2026, 8, 7, 10);
  const server = http.createServer(createHandler(paths.solo, () => now, paths.multi, paths.accounts));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const ip = a => ({ "X-Forwarded-For": a });
  const signup = (email, club, from, ref) => request(server, "POST", "/api/account/signup", { email, password: "motdepasse1", clubName: club, ref }, ip(from));
  const teamOf = async token => { const w = await World.loadWorld(paths.multi, now); const f = await World.findTeamByToken(w, token, paths.multi); return f ? { team: f.league.teams[f.teamIndex], league: f.league } : null; };
  try {
    const a = await signup("alice@gmail.com", "Annecy Hoops", "10.0.0.1");
    check(a.body && a.body.ok && a.body.managerToken, "parrain : compte et club");
    const tokA = a.body.managerToken;
    const r0 = await request(server, "GET", "/api/account/referral", undefined, { "X-TipIn-Token": tokA, ...ip("10.0.0.1") });
    check(r0.body.ok && /\/bienvenue\?ref=[A-Z2-9]{8}$/.test(r0.body.link) && r0.body.validated === 0 && r0.body.tier === 0 && r0.body.next === 1 && r0.body.remaining === 1 && r0.body.referrals.length === 0, "état initial : lien personnel, 0 ami, 1 restant pour le palier 1");
    check((await request(server, "GET", "/api/account/referral")).status === 401, "sans connexion : 401");
    const code = r0.body.code;

    const b = await signup("bob@ex.fr", "Bordeaux BC", "10.0.0.2", code);
    const c = await signup("carl@ex.fr", "Caen BC", "10.0.0.1", code);          // même connexion
    const d = await signup("a.lice+2@gmail.com", "Dijon BC", "10.0.0.4", code);  // même email
    const e = await signup("eve@ex.fr", "Evry BC", "10.0.0.5", code);
    check([b, c, d, e].every(x => x.body && x.body.ok), "4 inscriptions via le lien");
    const data = await Accounts.loadAccounts(paths.accounts);
    const by = email => data.accounts.find(x => x.email === email);
    check(by("bob@ex.fr").referredBy.status === "pending" && by("carl@ex.fr").referredBy.reason === "same-connection" && by("a.lice+2@gmail.com").referredBy.reason === "same-email", "statuts à l'inscription : en attente / même connexion / même email");
    check(!by("alice@gmail.com").referredBy, "le parrain n'a pas de parrain (pas d'auto-parrainage)");

    // Eve se connecte ensuite depuis la connexion du parrain : comptes liés.
    await request(server, "GET", "/api/account/me", undefined, { "X-TipIn-Token": e.body.managerToken, ...ip("10.0.0.1") });

    // Une saison prise en cours de route : pas encore complète.
    for (const tok of [b.body.managerToken, e.body.managerToken]) {
      const t = await teamOf(tok); t.team.achStats = { ...(t.team.achStats || {}), seasons: 1 }; await store.saveMultiLeague(t.league, paths.multi);
    }
    now += 11 * 60 * 1000;
    const r1 = await request(server, "GET", "/api/account/referral", undefined, { "X-TipIn-Token": tokA, ...ip("10.0.0.1") });
    check(r1.body.validated === 0 && r1.body.pending === 2, "après une saison incomplète : toujours en attente");
    // Saison complète.
    for (const tok of [b.body.managerToken, e.body.managerToken]) {
      const t = await teamOf(tok); t.team.achStats.seasons = 2; await store.saveMultiLeague(t.league, paths.multi);
    }
    const r1b = await request(server, "GET", "/api/account/referral", undefined, { "X-TipIn-Token": tokA, ...ip("10.0.0.1") });
    check(r1b.body.validated === 0, "réévaluation limitée (au plus toutes les 10 minutes)");
    now += 11 * 60 * 1000;
    const r2 = await request(server, "GET", "/api/account/referral", undefined, { "X-TipIn-Token": tokA, ...ip("10.0.0.1") });
    check(r2.body.validated === 1 && r2.body.tier === 1 && r2.body.next === 2 && r2.body.remaining === 1, "saison complète : 1 ami validé, palier 1, encore 1 pour le palier 2");
    const st = Object.fromEntries(r2.body.referrals.map(x => [x.club, x]));
    check(st["Bordeaux BC"].status === "validated" && st["Evry BC"].status === "blocked" && st["Evry BC"].reason === "same-connection", "filleul ayant joué depuis la connexion du parrain : refusé à la validation");
    check(r2.body.referrals.every(x => !("email" in x) && !("id" in x)), "aucune donnée personnelle du filleul exposée");
    const ta = await teamOf(tokA);
    check(ta.team.friendsReferrals === 1, "badge recopié sur le club du parrain (persisté)");
    // Rechargement depuis la sauvegarde (reconnexion) et nouvelle saison.
    const reloaded = await store.loadMultiLeague(paths.multi);
    check(reloaded.league.teams.find(t => t.managerLinkToken === tokA).friendsReferrals === 1, "badge conservé après rechargement");
    check((await Accounts.loadAccounts(paths.accounts)).accounts.find(x => x.email === "bob@ex.fr").referredBy.status === "validated", "validation conservée dans le compte (changement de saison sans effet)");
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log("\n🏁 referrals_test.js : parrainage conforme.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
