// Comptes joueurs + connexion Discord + site public (2026-09-26) — de vraies
// requêtes HTTP contre un vrai serveur (port éphémère), fichiers de
// sauvegarde temporaires, Discord simulé (aucun appel réseau réel).
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { createHandler } = require("./index.js");
const store = require("./store.js");
const AccountRoutes = require("./accountRoutes.js");
const Accounts = require("./accounts.js");

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "basket-accounts-test-")); }

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
        try { body = JSON.parse(raw); } catch (e) { /* HTML ou redirection */ }
        resolve({ statusCode: res.statusCode, body, raw, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function freshSetup(managerNames = ["Lyon M", "Grenoble M"]) {
  const dir = tmpDir();
  const paths = { solo: path.join(dir, "league.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
  const { league } = store.createMultiManagerCareer(managerNames, Date.UTC(2026, 8, 7));
  await store.saveMultiLeague(league, paths.multi);
  return { paths, league };
}

async function main() {
  const now = Date.UTC(2026, 8, 7, 10);
  const nowFn = () => now;
  AccountRoutes._resetMemoryForTests();

  // 1) Inscription email -> reprise d'un club CPU, le jeton donne accès au jeu.
  {
    const { paths, league } = await freshSetup();
    const lyonToken = league.teams[0].managerLinkToken;
    const server = await start(paths, nowFn);
    try {
      const cfg = await request(server, "GET", "/api/account/config");
      assert.strictEqual(cfg.body.openSlots, 8, "8 clubs CPU libres attendus");
      assert.strictEqual(cfg.body.discord, false);

      const bad = await request(server, "POST", "/api/account/signup", { email: "pas-un-email", password: "motdepasse1", clubName: "Annecy" });
      assert.strictEqual(bad.body.code, "email-invalid");
      const short = await request(server, "POST", "/api/account/signup", { email: "a@b.fr", password: "court", clubName: "Annecy" });
      assert.strictEqual(short.body.code, "password-too-short");
      const cpuName = await request(server, "POST", "/api/account/signup", { email: "a@b.fr", password: "motdepasse1", clubName: "paris" });
      assert.strictEqual(cpuName.body.code, "club-taken", "un nom CPU par défaut est réservé");
      const humanName = await request(server, "POST", "/api/account/signup", { email: "a@b.fr", password: "motdepasse1", clubName: "Lyon M" });
      assert.strictEqual(humanName.body.code, "club-taken");

      const ok = await request(server, "POST", "/api/account/signup", { email: " Alice@Exemple.FR ", password: "motdepasse1", clubName: "Annecy Hoops" });
      assert.strictEqual(ok.statusCode, 200, JSON.stringify(ok.body));
      assert.strictEqual(ok.body.status, "active");
      const token = ok.body.managerToken;
      assert.ok(/^[0-9a-f]{48}$/.test(token));

      const save = await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": token });
      assert.strictEqual(save.statusCode, 200);
      const mine = save.body.league.teams[save.body.myTeamIndex];
      assert.strictEqual(mine.teamName, "Annecy Hoops");
      assert.strictEqual(mine.isHuman, true);
      assert.strictEqual(mine.isAdmin, false);
      assert.strictEqual(mine.managerLinkToken, token, "son propre jeton reste présent");
      // SÉCURITÉ : plus aucun autre jeton dans la sauvegarde envoyée.
      save.body.league.teams.forEach((t, i) => {
        if (i !== save.body.myTeamIndex) assert.strictEqual(t.managerLinkToken, null, `jeton de ${t.teamName} exposé`);
      });
      // Le manager d'origine n'a rien perdu.
      const lyon = await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": lyonToken });
      assert.strictEqual(lyon.body.league.teams[lyon.body.myTeamIndex].teamName, "Lyon M");

      // Effectif basique (retour utilisateur : joueurs entre 30 et 50 de niveau).
      const multiNow = await store.loadMultiLeague(paths.multi);
      const annecy = multiNow.league.teams[save.body.myTeamIndex];
      assert.strictEqual(annecy.players.length, 15);
      annecy.players.forEach(p => assert.ok(p.overall() >= 30 && p.overall() <= 50, `niveau ${p.overall()} hors 30-50`));
      // Fil d'actus : message de bienvenue.
      assert.ok((mine.feed.entries || []).some(e => e.key === "club_takeover"), "entrée de bienvenue attendue");

      const again = await request(server, "POST", "/api/account/signup", { email: "alice@exemple.fr", password: "motdepasse2", clubName: "Autre" });
      assert.strictEqual(again.body.code, "email-taken");

      // Connexion.
      const wrong = await request(server, "POST", "/api/account/login", { email: "alice@exemple.fr", password: "mauvais!!" });
      assert.strictEqual(wrong.statusCode, 401);
      const login = await request(server, "POST", "/api/account/login", { email: "ALICE@exemple.fr", password: "motdepasse1" });
      assert.strictEqual(login.body.managerToken, token);

      // Le mot de passe n'est jamais stocké en clair.
      const rawAccounts = fs.readFileSync(paths.accounts, "utf-8");
      assert.ok(!rawAccounts.includes("motdepasse1"));

      const me = await request(server, "GET", "/api/account/me", undefined, { "X-TipIn-Token": token });
      assert.strictEqual(me.body.account.email, "alice@exemple.fr");
      assert.strictEqual(me.body.account.hasPassword, true);
      assert.strictEqual(me.body.account.passwordHash, undefined);
    } finally { server.close(); }
  }

  // 1b) Les annonces du club CPU repris sont annulées (ses joueurs partent).
  {
    const { paths, league } = await freshSetup();
    const weakest = league.teams.map((t, i) => ({ t, i })).filter(x => !x.t.isHuman)
      .sort((a, b) => Accounts.teamAverageOverall(a.t) - Accounts.teamAverageOverall(b.t))[0];
    const listing = league.listPlayerForSale(weakest.i, weakest.t.players[0].id, 1000, now);
    assert.ok(listing, "annonce créée");
    await store.saveMultiLeague(league, paths.multi);
    const server = await start(paths, nowFn);
    try {
      const r = await request(server, "POST", "/api/account/signup", { email: "m@x.fr", password: "motdepasse1", clubName: "Reprise" });
      assert.strictEqual(r.body.status, "active");
      const after = await store.loadMultiLeague(paths.multi);
      assert.strictEqual(after.league.teams[weakest.i].name, "Reprise", "le club CPU le plus faible est repris");
      assert.strictEqual(after.league.transferListings.find(l => l.id === listing.id).status, "cancelled");
    } finally { server.close(); }
  }

  // 2) Championnats par pays (2026-09-28, voir server/world.js) : Division I
  // française pleine -> un nouveau championnat (Division II, groupe A) est
  // ouvert pour le nouveau manager, plus de liste d'attente ; un manager qui
  // choisit les États-Unis reprend un bot de la Division I américaine.
  {
    const names = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"];
    const { paths } = await freshSetup(names);
    const server = await start(paths, nowFn);
    try {
      const first = await request(server, "POST", "/api/account/signup", { email: "un@x.fr", password: "motdepasse1", clubName: "Dernier Club" });
      assert.strictEqual(first.body.status, "active", "le 10e club CPU est encore libre");
      const second = await request(server, "POST", "/api/account/signup", { email: "deux@x.fr", password: "motdepasse1", clubName: "Nouveau Venu" });
      assert.strictEqual(second.body.status, "active", "un nouveau championnat s'ouvre");
      const save = await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": second.body.managerToken });
      assert.strictEqual(save.body.league.teams[save.body.myTeamIndex].teamName, "Nouveau Venu");
      assert.strictEqual(save.body.league.leagueId, "fr-2.1");
      assert.strictEqual(save.body.league.divisionLevel, 2);
      const historic = await store.loadMultiLeague(paths.multi);
      assert.ok(!historic.league.teams.some(t => t.name === "Nouveau Venu"), "la Division I n'est pas touchée");

      const us = await request(server, "POST", "/api/account/signup", { email: "us@x.fr", password: "motdepasse1", clubName: "Yankees", country: "us" });
      assert.strictEqual(us.body.status, "active");
      const usSave = await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": us.body.managerToken });
      assert.strictEqual(usSave.body.league.leagueId, "us-1");
      assert.strictEqual(usSave.body.league.timeZone, "America/New_York");
      const usTeam = usSave.body.league.teams[usSave.body.myTeamIndex];
      assert.strictEqual(usTeam.teamName, "Yankees");
      const usPlayers = usTeam.players.filter(p => p.nationality === "us").length;
      assert.ok(usPlayers >= 4, `effectif repris aux États-Unis : ${usPlayers} Américains sur 15`);

      // Nom déjà pris dans un AUTRE championnat : refusé aussi.
      const dup = await request(server, "POST", "/api/account/signup", { email: "trois@x.fr", password: "motdepasse1", clubName: "Yankees" });
      assert.strictEqual(dup.body.code, "club-taken");
    } finally { server.close(); }
  }

  // 3) Manager existant (lien privé) qui se crée des identifiants.
  {
    const { paths, league } = await freshSetup();
    const token = league.teams[1].managerLinkToken;
    const server = await start(paths, nowFn);
    try {
      const noTok = await request(server, "POST", "/api/account/claim", { email: "g@x.fr", password: "motdepasse1" });
      assert.strictEqual(noTok.statusCode, 401);
      const claim = await request(server, "POST", "/api/account/claim", { email: "g@x.fr", password: "motdepasse1" }, { "X-TipIn-Token": token });
      assert.strictEqual(claim.statusCode, 200, JSON.stringify(claim.body));
      const login = await request(server, "POST", "/api/account/login", { email: "g@x.fr", password: "motdepasse1" });
      assert.strictEqual(login.body.managerToken, token, "la connexion rend le club d'origine");
      // Changer de mot de passe via claim : même compte, pas de doublon.
      await request(server, "POST", "/api/account/claim", { email: "g@x.fr", password: "nouveau-mdp" }, { "X-TipIn-Token": token });
      const data = await Accounts.loadAccounts(paths.accounts);
      assert.strictEqual(data.accounts.length, 1);
      // Un autre manager ne peut pas prendre cet email.
      const other = await request(server, "POST", "/api/account/claim", { email: "g@x.fr", password: "motdepasse1" }, { "X-TipIn-Token": league.teams[0].managerLinkToken });
      assert.strictEqual(other.body.code, "email-taken");

      // Admin : réinitialisation du mot de passe.
      process.env.BASKET_ADMIN_TOKEN = "secret-admin";
      const list = await request(server, "GET", "/api/admin/accounts", undefined, { "X-Admin-Token": "secret-admin" });
      assert.strictEqual(list.body.accounts[0].club, "Grenoble M");
      const reset = await request(server, "POST", "/api/admin/accounts/reset-password", { email: "g@x.fr", newPassword: "reinit-1234" }, { "X-Admin-Token": "secret-admin" });
      assert.strictEqual(reset.statusCode, 200);
      const login2 = await request(server, "POST", "/api/account/login", { email: "g@x.fr", password: "reinit-1234" });
      assert.strictEqual(login2.body.managerToken, token);
      const denied = await request(server, "GET", "/api/admin/accounts", undefined, { "X-Admin-Token": "faux" });
      assert.strictEqual(denied.statusCode, 403);
      delete process.env.BASKET_ADMIN_TOKEN;
    } finally { server.close(); }
  }

  // 4) Site public : pas de carrière solo sans jeton, "/" renvoie vers l'accueil.
  {
    const { paths, league } = await freshSetup();
    process.env.BASKET_PUBLIC_SITE = "1";
    const server = await start(paths, nowFn);
    try {
      const state = await request(server, "GET", "/api/state");
      assert.strictEqual(state.statusCode, 401);
      assert.strictEqual(state.body.code, "login-required");
      assert.ok(!fs.existsSync(paths.solo), "aucune carrière solo créée");
      const withTok = await request(server, "GET", "/api/state", undefined, { "X-TipIn-Token": league.teams[0].managerLinkToken });
      assert.strictEqual(withTok.statusCode, 200);
      const home = await request(server, "GET", "/");
      assert.ok(home.raw.includes("window.HM_PUBLIC_SITE=true"));
      const site = await request(server, "GET", "/bienvenue");
      assert.strictEqual(site.statusCode, 200);
      assert.ok(/<html/i.test(site.raw));
      const cfg = await request(server, "GET", "/api/account/config");
      assert.strictEqual(cfg.body.publicSite, true);
    } finally { server.close(); delete process.env.BASKET_PUBLIC_SITE; }
    // Plus de carrière solo (2026-09-29) : même hors site public, un
    // visiteur sans jeton est envoyé vers l'inscription.
    const server2 = await start(paths, nowFn);
    try {
      const home = await request(server2, "GET", "/");
      assert.ok(home.raw.includes("location.replace(\"/bienvenue\")"));
    } finally { server2.close(); }
  }

  // 5) Discord (simulé) : 1re connexion -> choix du club -> compte ; puis
  //    reconnexion ; puis liaison depuis le jeu pour un manager existant.
  {
    const { paths, league } = await freshSetup();
    process.env.DISCORD_CLIENT_ID = "123";
    process.env.DISCORD_CLIENT_SECRET = "abc";
    let discordUser = { id: "9001", username: "ariane", global_name: "Ariane" };
    AccountRoutes._setFetchImplForTests(async (url, opts) => {
      if (url.endsWith("/oauth2/token")) {
        assert.ok(String(opts.body).includes("code=CODE-OK"));
        return { ok: true, json: async () => ({ access_token: "AT" }) };
      }
      if (url.endsWith("/users/@me")) return { ok: true, json: async () => discordUser };
      throw new Error("URL inattendue " + url);
    });
    const server = await start(paths, nowFn);
    try {
      const go = await request(server, "GET", "/auth/discord");
      assert.strictEqual(go.statusCode, 302);
      const loc = new URL(go.headers.location);
      assert.strictEqual(loc.host, "discord.com");
      assert.strictEqual(loc.searchParams.get("scope"), "identify");
      const state = loc.searchParams.get("state");
      const cookie = go.headers["set-cookie"][0].split(";")[0];

      // Mauvais cookie : refusé (protection CSRF).
      const csrf = await request(server, "GET", `/auth/discord/callback?state=${state}&code=CODE-OK`, undefined, { Cookie: "hm_oauth=autre" });
      assert.ok(csrf.headers.location.includes("discord-expired"));

      const go2 = await request(server, "GET", "/auth/discord");
      const state2 = new URL(go2.headers.location).searchParams.get("state");
      const cookie2 = go2.headers["set-cookie"][0].split(";")[0];
      const cb = await request(server, "GET", `/auth/discord/callback?state=${state2}&code=CODE-OK`, undefined, { Cookie: cookie2 });
      assert.strictEqual(cb.statusCode, 302);
      const frag = new URLSearchParams(cb.headers.location.split("#")[1]);
      assert.ok(frag.get("discord"), "1re connexion : choix du nom de club");
      assert.strictEqual(frag.get("nom"), "Ariane");
      const done = await request(server, "POST", "/api/account/discord-complete", { pending: frag.get("discord"), clubName: "Ariane BC" });
      assert.strictEqual(done.body.status, "active", JSON.stringify(done.body));
      // Un "pending" ne sert qu'une fois.
      const reuse = await request(server, "POST", "/api/account/discord-complete", { pending: frag.get("discord"), clubName: "Autre" });
      assert.strictEqual(reuse.body.code, "discord-expired");

      // Reconnexion : directement dans le jeu.
      const go3 = await request(server, "GET", "/auth/discord");
      const st3 = new URL(go3.headers.location).searchParams.get("state");
      const cb3 = await request(server, "GET", `/auth/discord/callback?state=${st3}&code=CODE-OK`, undefined, { Cookie: go3.headers["set-cookie"][0].split(";")[0] });
      assert.strictEqual(cb3.headers.location, `/?m=${done.body.managerToken}`);
      // Un état déjà consommé ne se rejoue pas.
      const replay = await request(server, "GET", `/auth/discord/callback?state=${st3}&code=CODE-OK`, undefined, { Cookie: go3.headers["set-cookie"][0].split(";")[0] });
      assert.ok(replay.headers.location.includes("discord-expired"));

      // Liaison depuis le jeu (manager d'origine Lyon M, sans compte).
      discordUser = { id: "7777", username: "antony" };
      const lyonToken = league.teams[0].managerLinkToken;
      const startLink = await request(server, "POST", "/api/account/discord-link-start", undefined, { "X-TipIn-Token": lyonToken });
      assert.ok(startLink.body.url.startsWith("/auth/discord?n="));
      const go4 = await request(server, "GET", startLink.body.url);
      const st4 = new URL(go4.headers.location).searchParams.get("state");
      const cb4 = await request(server, "GET", `/auth/discord/callback?state=${st4}&code=CODE-OK`, undefined, { Cookie: go4.headers["set-cookie"][0].split(";")[0] });
      assert.strictEqual(cb4.headers.location, "/#compte=discord-lie");
      const me = await request(server, "GET", "/api/account/me", undefined, { "X-TipIn-Token": lyonToken });
      assert.strictEqual(me.body.account.discordName, "antony");
      // Et désormais, "Se connecter avec Discord" le ramène dans son club.
      const go5 = await request(server, "GET", "/auth/discord");
      const st5 = new URL(go5.headers.location).searchParams.get("state");
      const cb5 = await request(server, "GET", `/auth/discord/callback?state=${st5}&code=CODE-OK`, undefined, { Cookie: go5.headers["set-cookie"][0].split(";")[0] });
      assert.strictEqual(cb5.headers.location, `/?m=${lyonToken}`);

      // Le même Discord ne peut pas être lié à un 2e club.
      const grenobleToken = league.teams[1].managerLinkToken;
      const sl = await request(server, "POST", "/api/account/discord-link-start", undefined, { "X-TipIn-Token": grenobleToken });
      const go6 = await request(server, "GET", sl.body.url);
      const st6 = new URL(go6.headers.location).searchParams.get("state");
      const cb6 = await request(server, "GET", `/auth/discord/callback?state=${st6}&code=CODE-OK`, undefined, { Cookie: go6.headers["set-cookie"][0].split(";")[0] });
      assert.ok(cb6.headers.location.includes("discord-already-linked"));
    } finally {
      server.close();
      AccountRoutes._setFetchImplForTests(null);
      delete process.env.DISCORD_CLIENT_ID; delete process.env.DISCORD_CLIENT_SECRET;
    }
    // Discord non configuré : routes fermées.
    const server2 = await start(paths, nowFn);
    try {
      const off = await request(server2, "GET", "/auth/discord");
      assert.strictEqual(off.statusCode, 404);
    } finally { server2.close(); }
  }

  // 6) Verrou : des inscriptions simultanées ne s'écrasent pas.
  {
    const { paths } = await freshSetup();
    AccountRoutes._resetMemoryForTests();
    const server = await start(paths, nowFn);
    try {
      const results = await Promise.all([1, 2, 3, 4, 5].map(i =>
        request(server, "POST", "/api/account/signup", { email: `p${i}@x.fr`, password: "motdepasse1", clubName: `Club Simultane ${i}` })));
      results.forEach(r => assert.strictEqual(r.body.status, "active", JSON.stringify(r.body)));
      const tokens = new Set(results.map(r => r.body.managerToken));
      assert.strictEqual(tokens.size, 5);
      const multi = await store.loadMultiLeague(paths.multi);
      assert.strictEqual(multi.league.teams.filter(t => t.isHuman).length, 7, "2 d'origine + 5 nouveaux");
      const data = await Accounts.loadAccounts(paths.accounts);
      assert.strictEqual(data.accounts.length, 5);
      for (const r of results) {
        const s = await request(server, "GET", "/api/state", undefined, { "X-TipIn-Token": r.body.managerToken });
        assert.strictEqual(s.statusCode, 200);
      }
    } finally { server.close(); }
  }

  // 7) Préfixe de clés Redis (serveur de test partageant la base prod).
  {
    assert.strictEqual(store.redisKey("multiLeague"), "pullup:multi-league");
    process.env.BASKET_REDIS_PREFIX = "test";
    assert.strictEqual(store.redisKey("multiLeague"), "test:pullup:multi-league");
    assert.strictEqual(store.redisKey("accounts"), "test:pullup:accounts");
    delete process.env.BASKET_REDIS_PREFIX;
  }

  console.log("✅ accounts_test : inscription, connexion, liste d'attente, identifiants pour manager existant, admin, site public, Discord, verrou, préfixe Redis.");
}

main().catch(e => { console.error("❌", e && e.stack || e); process.exit(1); });
