"use strict";
// Pseudo du manager (2026-09-30, voir Engine.checkManagerPseudo et
// POST /api/manager/set-pseudo dans server/index.js) : validation (longueur,
// caractères, insultes, noms réservés), unicité dans TOUT le monde (sans
// casse ni accents), délai de 30 jours (premier choix libre), réponses sans
// rien de privé (ni email, ni jeton, ni nom Discord), repli « Manager de
// <club> », pseudo affiché dans le chat de la ligue et la messagerie, club
// rendu à l'IA sans pseudo, pseudo par défaut = identifiant Discord (jamais
// le nom affiché Discord, qui peut être un vrai nom).
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Engine = require("../engine.js");
const { createHandler } = require("./index.js");
const store = require("./store.js");
const World = require("./world.js");
const Accounts = require("./accounts.js");
const AccountRoutes = require("./accountRoutes.js");

function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

function request(server, method, urlPath, jsonBody, headers) {
  const { port } = server.address();
  const payload = jsonBody !== undefined ? JSON.stringify(jsonBody) : null;
  const h = { ...(headers || {}) };
  if (payload) { h["Content-Type"] = "application/json"; h["Content-Length"] = Buffer.byteLength(payload); }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers: h }, (res) => {
      let raw = "";
      res.on("data", c => { raw += c; });
      res.on("end", () => { let body = null; try { body = JSON.parse(raw); } catch (e) { /* */ } resolve({ status: res.statusCode, body, raw, headers: res.headers }); });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  // --- Moteur : règles de validation.
  const C = Engine.checkManagerPseudo;
  check(C("aszat").value === "aszat" && C("  Rémi_42.b-x ").value === "Rémi_42.b-x", "pseudos valides (accents, _ . -), espaces de bord retirés");
  check(!!C("ab").error && !!C("a".repeat(21)).error && !!C("").error && !!C(null).error, "3 à 20 caractères");
  check(!!C("jean dupont").error && !!C("moi@mail.fr").error && !!C("<script>").error && !!C("a​b1").error, "espaces, @, balises et caractères invisibles refusés (jamais un email)");
  check(!!C("---").error, "au moins une lettre ou un chiffre");
  check(!!C("FuckYou").error && !!C("Connard_1").error && !!C("Admin").error && !!C("i.a").error, "insultes et noms réservés refusés");
  check(Engine.managerPseudoKey("Rémi") === Engine.managerPseudoKey("REMI"), "clé d'unicité sans casse ni accents");
  const cpu = { name: "IA Club", isHuman: false, managerPseudo: "x_ia" };
  check(Engine.managerDisplayName(cpu) === null, "club IA : pas de nom de manager");
  const hum = { name: "Lyon", isHuman: true, managerPseudo: null };
  check(Engine.managerDisplayName(hum) === "Manager de Lyon", "sans pseudo : « Manager de <club> »");
  hum.managerPseudo = "aszat";
  check(Engine.managerDisplayName(hum) === "aszat", "avec pseudo : le pseudo");

  process.env.BASKET_ADMIN_TOKEN = "admin-pseudo-test";
  let now = Date.UTC(2026, 8, 30, 10);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basket-pseudo-test-"));
  const multiSavePath = path.join(dir, "multi-league.json");
  const accountsPath = path.join(dir, "accounts.json");
  const server = http.createServer(createHandler(path.join(dir, "league.json"), () => now, multiSavePath, accountsPath));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const set = (h, pseudo) => request(server, "POST", "/api/manager/set-pseudo", { pseudo }, h);
  try {
    let r = await set({}, "aszat");
    check(r.status === 401, "sans jeton : refusé");
    const boot = await request(server, "POST", "/api/admin/new-multi-league", { teamNames: ["Lyon", "Paris", "Nice"] }, { "X-Admin-Token": "admin-pseudo-test" });
    check(boot.status === 200, "ligue partagée créée (3 managers)");
    const M = {};
    boot.body.managers.forEach(m => { M[m.name] = { idx: m.teamIndex, token: m.token, h: { "X-TipIn-Token": m.token } }; });

    // Compte email + nom Discord « réel » pour Lyon : jamais renvoyés.
    const accounts = await Accounts.loadAccounts(accountsPath);
    Accounts.createAccount(accounts, { email: "antony@example.fr", managerToken: M.Lyon.token, discordName: "Antony Szatmari" }, now);
    await Accounts.saveAccounts(accounts, accountsPath);

    r = await set(M.Lyon.h, "a b");
    check(r.status === 400 && r.body.code === "pseudo-invalid", "pseudo invalide refusé (400)");
    r = await set(M.Lyon.h, "salope42");
    check(r.status === 400 && /autorisé/.test(r.body.error), "insulte refusée");
    r = await set(M.Lyon.h, "aszat");
    check(r.status === 200 && r.body.pseudo === "aszat" && r.body.pseudoChangedAt === 0, "premier choix enregistré, sans lancer le délai");
    const leak = s => /antony@example|Szatmari|managerLinkToken|passwordHash/.test(s) || s.includes(M.Lyon.token);
    check(!leak(r.raw), "réponse sans email, nom réel ni jeton");
    check(Object.keys(r.body).sort().join() === "displayName,ok,pseudo,pseudoChangedAt", "réponse limitée au pseudo");

    r = await set(M.Paris.h, "ASZAT");
    check(r.status === 409 && r.body.code === "pseudo-taken", "même pseudo (autre casse) pris dans la ligue : 409");
    // Un manager d'un AUTRE championnat du monde.
    const world = await World.loadWorld(multiSavePath, now);
    const other = world.leagues.find(e => e.id !== store.HISTORIC_LEAGUE_ID);
    const lg = await World.loadLeague(world, other.id, multiSavePath);
    lg.teams[2].isHuman = true; lg.teams[2].managerLinkToken = "x".repeat(48); lg.teams[2].managerPseudo = "Globetrotter";
    await store.saveMultiLeague(lg, multiSavePath);
    r = await set(M.Paris.h, "globetrotter");
    check(r.status === 409, "pseudo pris dans un autre championnat du monde : 409");
    r = await set(M.Paris.h, "Pàris_Coach");
    check(r.status === 200 && r.body.pseudo === "Pàris_Coach", "Paris choisit son pseudo");
    r = await set(M.Nice.h, "paris_coach");
    check(r.status === 409, "unicité sans accents (Pàris_Coach = paris_coach)");

    // Délai : 2e changement libre (premier choix non compté), puis 30 jours.
    now += 1000;
    r = await set(M.Lyon.h, "aszat2");
    check(r.status === 200 && r.body.pseudoChangedAt === now, "deuxième changement accepté, le délai démarre");
    now += 5 * 24 * 3600 * 1000;
    r = await set(M.Lyon.h, "aszat3");
    check(r.status === 429 && r.body.code === "pseudo-cooldown" && /25 jours/.test(r.body.error), "changement suivant refusé pendant 30 jours (reste 25 jours)");
    r = await set(M.Lyon.h, "ASZAT2");
    check(r.status === 200 && r.body.pseudo === "ASZAT2", "changer seulement la casse reste permis");
    r = await set(M.Paris.h, "aszat");
    check(r.status === 200, "l'ancien pseudo de Lyon est libéré");
    now += 26 * 24 * 3600 * 1000;
    r = await set(M.Lyon.h, "aszat3");
    check(r.status === 200 && r.body.pseudo === "aszat3", "après 30 jours : nouveau changement possible");

    // Chat de la ligue : auteur = pseudo ; sinon « Manager de <club> ».
    r = await request(server, "POST", "/api/league-chat/send", { text: "Salut" }, M.Lyon.h);
    check(r.status === 200, "Lyon poste dans le chat");
    const msg = r.body.messages.find(m => m.kind === "user");
    check(msg.author.name === "aszat3" && msg.author.club === "Lyon", "chat : auteur = pseudo (+ club)");
    check(r.body.managers.find(m => m.club === "Nice").name === null, "chat : sans pseudo, nom null (le navigateur compose « Manager de Nice » dans sa langue)");
    check(!leak(r.raw), "chat : ni email, ni nom Discord, ni jeton");

    // Messagerie : expéditeur = pseudo.
    r = await request(server, "POST", "/api/messages/send", { to: String(M.Paris.idx), text: "Amical ?" }, M.Lyon.h);
    check(r.status === 200, "Lyon écrit à Paris");
    r = await request(server, "GET", "/api/messages/summary", undefined, M.Paris.h);
    const conv = r.body.conversations[0];
    check(conv && conv.manager === "aszat3" && conv.name === "Lyon", "messagerie : correspondant désigné par son pseudo");
    check(!leak(r.raw), "messagerie : rien de privé");

    // La ligue sauvegardée garde le pseudo ; la page d'un autre championnat le montre.
    const saved = await store.loadMultiLeague(multiSavePath, store.HISTORIC_LEAGUE_ID);
    check(saved.league.teams[M.Lyon.idx].managerPseudo === "aszat3", "pseudo sauvegardé avec le club");

    // Club rendu à l'IA : plus de pseudo.
    const w2 = await World.loadWorld(multiSavePath, now);
    World.releaseClubToCpu(w2, saved.league, M.Nice.idx, now, "deleted");
    saved.league.teams[M.Nice.idx].managerPseudo = null;
    World.releaseClubToCpu(w2, saved.league, M.Paris.idx, now, "inactive");
    check(saved.league.teams[M.Paris.idx].managerPseudo === null && Engine.managerDisplayName(saved.league.teams[M.Paris.idx]) === null, "club rendu à l'IA : aucun nom de manager");
    await store.saveMultiLeague(saved.league, multiSavePath);
    await World.saveWorld(w2, multiSavePath);
    check(!(await World.isManagerPseudoTakenInWorld(w2, multiSavePath, "aszat")), "pseudo d'un club rendu à l'IA libéré");

    // Pseudo par défaut : identifiant Discord (username), pas le nom affiché.
    const boot2 = await request(server, "POST", "/api/admin/accounts/transfer-club", { club: "Lyon" }, { "X-Admin-Token": "admin-pseudo-test" });
    check(boot2.status === 200, "(préparation) club Lyon transmis à un nouveau manager");
    const newToken = new URL(boot2.body.link).searchParams.get("m");
    const reloaded = await store.loadMultiLeague(multiSavePath, store.HISTORIC_LEAGUE_ID);
    check(reloaded.league.teams[M.Lyon.idx].managerPseudo === null, "nouveau manager : le pseudo de l'ancien ne suit pas");
    const acc2 = await Accounts.loadAccounts(accountsPath);
    Accounts.createAccount(acc2, { managerToken: newToken, discordName: "Jean Dupont", discordUsername: "hoop.fan_77" }, now);
    await Accounts.saveAccounts(acc2, accountsPath);
    r = await request(server, "GET", "/api/account/me", undefined, { "X-TipIn-Token": newToken });
    check(r.status === 200 && !/discordUsername|pseudoDefaultTried/.test(JSON.stringify(r.body)), "Mon compte : vue publique inchangée (aucun champ interne)");
    const after = await store.loadMultiLeague(multiSavePath, store.HISTORIC_LEAGUE_ID);
    check(after.league.teams[M.Lyon.idx].managerPseudo === "hoop.fan_77" && after.league.teams[M.Lyon.idx].managerPseudoChangedAt === null, "pseudo par défaut = identifiant Discord (premier choix toujours libre)");
    // --- Comptes Discord d'avant le stockage de l'identifiant : jamais le nom
    // affiché comme pseudo ; rattrapés à la prochaine connexion Discord.
    const acc3 = await Accounts.loadAccounts(accountsPath);
    acc3.accounts = acc3.accounts.filter(a => a.managerToken !== newToken);
    const legacy = Accounts.createAccount(acc3, { managerToken: newToken, discordName: "Jean Legacy" }, now);
    legacy.discordId = "5555"; legacy.pseudoDefaultTried = true;
    await Accounts.saveAccounts(acc3, accountsPath);
    const lg3 = await store.loadMultiLeague(multiSavePath, store.HISTORIC_LEAGUE_ID);
    lg3.league.teams[M.Lyon.idx].managerPseudo = null;
    await store.saveMultiLeague(lg3.league, multiSavePath);
    await request(server, "GET", "/api/account/me", undefined, { "X-TipIn-Token": newToken });
    const pseudoOfLyon = async () => (await store.loadMultiLeague(multiSavePath, store.HISTORIC_LEAGUE_ID)).league.teams[M.Lyon.idx].managerPseudo;
    check(await pseudoOfLyon() === null, "ancien compte Discord (sans identifiant) : le nom affiché n'est jamais adopté");
    process.env.DISCORD_CLIENT_ID = "123"; process.env.DISCORD_CLIENT_SECRET = "abc";
    AccountRoutes._setFetchImplForTests(async (url) => {
      if (url.endsWith("/oauth2/token")) return { ok: true, json: async () => ({ access_token: "AT" }) };
      return { ok: true, json: async () => ({ id: "5555", username: "legacy_coach", global_name: "Jean Legacy" }) };
    });
    try {
      const go = await request(server, "GET", "/auth/discord");
      const st = new URL(go.headers.location).searchParams.get("state");
      const cb = await request(server, "GET", `/auth/discord/callback?state=${st}&code=OK`, undefined, { Cookie: go.headers["set-cookie"][0].split(";")[0] });
      check(cb.headers.location === `/?m=${newToken}`, "(préparation) reconnexion Discord");
    } finally {
      AccountRoutes._setFetchImplForTests(null);
      delete process.env.DISCORD_CLIENT_ID; delete process.env.DISCORD_CLIENT_SECRET;
    }
    check(await pseudoOfLyon() === "legacy_coach", "reconnexion Discord : identifiant enregistré et adopté comme pseudo");
    const acc4 = await Accounts.loadAccounts(accountsPath);
    check(Accounts.findByManagerToken(acc4, newToken).discordUsername === "legacy_coach", "identifiant Discord désormais stocké");

    // --- Langue du compte (Accounts.langFor, POST /api/account/lang).
    check(Accounts.langFor(null) === "en" && Accounts.langFor({ lang: "it" }) === "it" && Accounts.langFor({ lang: "de" }) === "en", "langFor : en par défaut, fr/en/it seulement");
    check(Accounts.langFor({ detectedLang: "en" }, { country: "fr" }) === "en" && Accounts.langFor({ lang: "fr", detectedLang: "en" }) === "fr", "langFor : choix du compte, puis langue détectée du navigateur");
    check(Accounts.langFor({}, { country: "it" }) === "it" && Accounts.langFor({}, { country: "fr" }) === "fr" && Accounts.langFor({}, { country: "us" }) === "en", "langFor : sinon la langue du pays du club");
    check(Accounts.langFor({}, { hint: "it", country: "fr" }) === "it", "langFor : l'indice de la requête passe avant le pays");
    r = await request(server, "GET", "/api/account/me", undefined, { "X-TipIn-Token": newToken });
    check(r.body.account.lang === null, "compte sans langue : lang null (le jeu enverra celle du navigateur)");
    r = await request(server, "POST", "/api/account/lang", { lang: "de" }, { "X-TipIn-Token": newToken });
    check(r.status === 400, "langue inconnue refusée");
    r = await request(server, "POST", "/api/account/lang", { lang: "it" }, { "X-TipIn-Token": newToken });
    check(r.status === 200 && r.body.persisted === true, "langue enregistrée dans le compte");
    r = await request(server, "GET", "/api/account/me", undefined, { "X-TipIn-Token": newToken });
    check(r.body.account.lang === "it", "/api/account/me renvoie la langue du compte (tout appareil)");
    check(Accounts.langFor(Accounts.findByManagerToken(await Accounts.loadAccounts(accountsPath), newToken)) === "it", "langFor(compte) pour les textes serveur (emails, push)");
    r = await request(server, "POST", "/api/account/lang", { lang: "en" }, M.Paris.h);
    check(r.status === 200 && r.body.persisted === false, "manager sans compte (lien privé) : rien d'enregistré, le navigateur garde son choix");
    r = await request(server, "POST", "/api/account/lang", { lang: "en" });
    check(r.status === 401, "sans jeton : refusé");
    console.log("\n🏁 Pseudo du manager : validation, unicité mondiale, délai, confidentialité, langue du compte.");
  } finally {
    server.close();
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
