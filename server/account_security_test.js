"use strict";
// Comptes (liste de la nuit du 2026-09-28) : mot de passe oublié (lien à
// usage unique valable 1 h, envoyé par email si le service est configuré,
// sinon lien administrateur), suppression du compte par le joueur (club
// rendu à l'IA), anti-triche (comptes partageant une IP, transferts
// suspects entre managers). Voir server/accountRoutes.js, server/mailer.js,
// Accounts.suspiciousTransfers, League.logHumanTransfer.
// Inscriptions sur invitation par défaut (voir accountRoutes.js, DEFAULT_INVITE_CODE) : ouvertes ici.
process.env.BASKET_INVITE_CODE = "off";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const store = require("./store.js");
const World = require("./world.js");
const Accounts = require("./accounts.js");
const Engine = require("../engine.js");
const { createHandler } = require("./index.js");

const ok = m => console.log("✅ " + m);

(async () => {
  delete process.env.RESEND_API_KEY;
  process.env.BASKET_ADMIN_TOKEN = "admin-test-token";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "accsec-"));
  const paths = { solo: path.join(dir, "solo.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
  const clock = { now: Date.UTC(2026, 8, 28, 10) };
  const server = http.createServer(createHandler(paths.solo, () => clock.now, paths.multi, paths.accounts));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const logs = [];
  const origLog = console.log;
  console.log = (...a) => { logs.push(a.join(" ")); if (!String(a[0]).startsWith("[comptes]")) origLog(...a); };
  const career = store.createMultiManagerCareer(["Lyon Sécu", "Paris Sécu"], clock.now - 2 * 24 * 3600 * 1000, "Lyon Sécu");
  await store.saveMultiLeague(career.league, paths.multi);

  // 1) Mot de passe oublié.
  const su = await call("POST", "/api/account/signup", { email: "oubli@test.fr", password: "ancienmotdepasse", clubName: "Annecy Oubli" }, { "X-Forwarded-For": "10.0.0.7" });
  assert.strictEqual(su.body.status, "active");
  const cfg = await call("GET", "/api/account/config");
  assert.strictEqual(cfg.body.passwordResetByMail, false, "pas d'envoi d'email sans configuration");
  const unknown = await call("POST", "/api/account/password-forgot", { email: "personne@test.fr" });
  const known = await call("POST", "/api/account/password-forgot", { email: "oubli@test.fr" });
  assert.deepStrictEqual(unknown.body, known.body, "même réponse que le compte existe ou non");
  const line = logs.find(l => l.includes("oubli@test.fr") && l.includes("#reinit="));
  assert.ok(line, "lien écrit dans les journaux faute d'email");
  const token = line.split("#reinit=")[1].trim();
  const bad = await call("POST", "/api/account/password-reset", { token: "mauvais", password: "nouveaumotdepasse" });
  assert.strictEqual(bad.body.code, "reset-expired");
  const reset = await call("POST", "/api/account/password-reset", { token, password: "nouveaumotdepasse" });
  assert.strictEqual(reset.body.status, "active");
  assert.strictEqual(reset.body.managerToken, su.body.managerToken, "connecté sur son club");
  const again = await call("POST", "/api/account/password-reset", { token, password: "encoreunautre1" });
  assert.strictEqual(again.body.code, "reset-expired", "lien à usage unique");
  assert.strictEqual((await call("POST", "/api/account/login", { email: "oubli@test.fr", password: "ancienmotdepasse" })).status, 401);
  assert.strictEqual((await call("POST", "/api/account/login", { email: "oubli@test.fr", password: "nouveaumotdepasse" })).body.status, "active");
  // Lien expiré au bout d'une heure ; lien administrateur.
  const adm = await call("POST", "/api/admin/accounts/password-reset-link", { email: "oubli@test.fr" }, { "X-Admin-Token": "admin-test-token" });
  assert.ok(adm.body.ok && /#reinit=/.test(adm.body.link));
  clock.now += 61 * 60 * 1000;
  const late = await call("POST", "/api/account/password-reset", { token: adm.body.link.split("#reinit=")[1], password: "troptardmotdepasse" });
  assert.strictEqual(late.body.code, "reset-expired");
  ok("mot de passe oublié : réponse identique que le compte existe ou non, lien à usage unique valable 1 h (journaux ou lien administrateur sans email), connexion directe");

  // 2) Anti-triche : deux comptes depuis la même IP ; vente arrangée.
  await call("POST", "/api/account/signup", { email: "double@test.fr", password: "motdepasse12", clubName: "Annecy Double" }, { "X-Forwarded-For": "10.0.0.7" });
  let w = await World.loadWorld(paths.multi, clock.now);
  const lg = await World.loadLeague(w, "fr-1", paths.multi);
  const seller = lg.teams[0], buyer = lg.teams[1];
  const star = seller.players.reduce((b, p) => (p.overall() > b.overall() ? p : b), seller.players[0]);
  const listing = lg.listPlayerForSale(0, star.id, 1, clock.now);
  listing.lastCpuCheckAt = listing.closesAt;
  assert.ok(lg.placeBid(listing.id, 1, 1, clock.now).ok);
  lg._resolveListing(listing, listing.closesAt);
  assert.strictEqual(listing.result, "sold");
  assert.strictEqual(lg.humanTransferLog.length, 1);
  await store.saveMultiLeague(lg, paths.multi);
  const ac = await call("GET", "/api/admin/accounts/anticheat", null, { "X-Admin-Token": "admin-test-token" });
  assert.ok(ac.body.sharedIp.some(g => g.map(a => a.email).sort().join() === "double@test.fr,oubli@test.fr"), "comptes partageant une IP");
  assert.ok(ac.body.suspiciousTransfers.some(x => x.playerName === star.name && /valeur estimée/.test(x.reason)), "vente à 1 € signalée");
  const accs = await Accounts.loadAccounts(paths.accounts);
  assert.ok(!JSON.stringify(accs).includes("10.0.0.7"), "l'adresse IP n'est jamais stockée en clair");
  assert.strictEqual((await call("GET", "/api/admin/accounts/anticheat")).status, 403);
  ok(`anti-triche : 2 comptes depuis la même IP (empreinte seulement) et vente de ${star.name} à 1 € (${seller.name} → ${buyer.name}) signalés à l'administrateur`);

  // 3) Suppression du compte.
  const tok = (await call("POST", "/api/account/login", { email: "oubli@test.fr", password: "nouveaumotdepasse" })).body.managerToken;
  const noConfirm = await call("POST", "/api/account/delete", { password: "nouveaumotdepasse" }, { "X-TipIn-Token": tok });
  assert.strictEqual(noConfirm.body.code, "confirm-required");
  const badPw = await call("POST", "/api/account/delete", { confirm: "SUPPRIMER", password: "faux" }, { "X-TipIn-Token": tok });
  assert.strictEqual(badPw.body.code, "bad-credentials");
  const del = await call("POST", "/api/account/delete", { confirm: "SUPPRIMER", password: "nouveaumotdepasse" }, { "X-TipIn-Token": tok });
  assert.ok(del.body.ok);
  assert.strictEqual((await call("GET", "/api/state", null, { "X-TipIn-Token": tok })).status, 401, "lien invalide");
  assert.strictEqual((await call("POST", "/api/account/login", { email: "oubli@test.fr", password: "nouveaumotdepasse" })).status, 401, "compte effacé");
  w = await World.loadWorld(paths.multi, clock.now);
  const lg2 = await World.loadLeague(w, "fr-1", paths.multi);
  const club = lg2.teams.find(t => t.name === "Annecy Oubli");
  assert.ok(club && !club.isHuman, "club confié à l'IA");
  const accs2 = await Accounts.loadAccounts(paths.accounts);
  assert.ok(!Accounts.findByEmail(accs2, "oubli@test.fr"));
  ok("suppression du compte : confirmation SUPPRIMER + mot de passe, compte effacé, club confié à l'IA, ancien lien invalide");

  console.log = origLog;
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("\n🏁 account_security_test.js : tout est vert");
})().catch(e => { console.error("❌", e); process.exit(1); });
