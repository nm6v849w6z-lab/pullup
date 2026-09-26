"use strict";
// Messagerie privée entre managers (voir server/messages.js et les routes
// /api/messages/* de server/index.js) : vraies requêtes HTTP contre un vrai
// serveur sur port éphémère, horloge injectée.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createHandler } = require("./index.js");
const Messages = require("./messages.js");

function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "basket-messages-test-")); }

function request(server, method, urlPath, jsonBody, headers) {
  const { port } = server.address();
  const payload = jsonBody !== undefined ? JSON.stringify(jsonBody) : null;
  const h = { ...(headers || {}) };
  if (payload) { h["Content-Type"] = "application/json"; h["Content-Length"] = Buffer.byteLength(payload); }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers: h }, (res) => {
      let raw = "";
      res.on("data", c => { raw += c; });
      res.on("end", () => { let body = null; try { body = JSON.parse(raw); } catch (e) { /* */ } resolve({ status: res.statusCode, body }); });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  process.env.BASKET_ADMIN_TOKEN = "admin-msg-test";
  let now = Date.UTC(2026, 8, 28, 10);
  const dir = tmpDir();
  const multiSavePath = path.join(dir, "multi-league.json");
  const server = http.createServer(createHandler(path.join(dir, "league.json"), () => now, multiSavePath));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try {
    // --- Solo (aucun jeton) : messagerie indisponible, sans erreur.
    let r = await request(server, "GET", "/api/messages/summary");
    check(r.status === 200 && r.body.available === false, "solo : summary renvoie available:false");
    r = await request(server, "POST", "/api/messages/send", { to: 1, text: "coucou" });
    check(r.status === 404, "solo : envoi refusé (404)");

    // --- Ligue partagée à 3 managers.
    const boot = await request(server, "POST", "/api/admin/new-multi-league", { teamNames: ["Lyon", "Paris", "Nice"] }, { "X-Admin-Token": "admin-msg-test" });
    check(boot.status === 200 && boot.body.managers.length === 3, "ligue partagée créée (3 managers)");
    const M = {};
    boot.body.managers.forEach(m => { M[m.name] = { idx: m.teamIndex, h: { "X-TipIn-Token": m.token } }; });
    const cpuIdx = [...Array(10).keys()].find(i => !Object.values(M).some(m => m.idx === i));

    r = await request(server, "GET", "/api/messages/summary", undefined, M.Lyon.h);
    check(r.status === 200 && r.body.available && r.body.unread === 0, "summary : disponible, 0 non lu");
    check(r.body.managers.length === 2 && r.body.managers.every(m => m.name !== "Lyon"), "annuaire : les 2 autres managers, pas soi-même");
    check(!JSON.stringify(r.body).includes(boot.body.managers[1].token), "aucun jeton dans la réponse");

    // --- Fuite de jetons corrigée dans /api/save.
    const save = await request(server, "GET", "/api/save", undefined, M.Lyon.h);
    const tokens = save.body.league.teams.map(t => t.managerLinkToken).filter(Boolean);
    check(tokens.length === 1 && tokens[0] === M.Lyon.h["X-TipIn-Token"], "/api/save ne renvoie plus que MON jeton (plus ceux des autres managers)");

    // --- Validations d'envoi.
    r = await request(server, "POST", "/api/messages/send", { to: M.Lyon.idx, text: "moi" }, M.Lyon.h);
    check(r.status === 400, "impossible de s'écrire à soi-même");
    r = await request(server, "POST", "/api/messages/send", { to: cpuIdx, text: "cpu" }, M.Lyon.h);
    check(r.status === 400, "impossible d'écrire à un club CPU");
    r = await request(server, "POST", "/api/messages/send", { to: M.Paris.idx, text: "   " }, M.Lyon.h);
    check(r.status === 400, "message vide refusé");
    r = await request(server, "POST", "/api/messages/send", { to: M.Paris.idx, text: "x".repeat(Messages.MAX_TEXT_LENGTH + 1) }, M.Lyon.h);
    check(r.status === 400, "message trop long refusé");
    r = await request(server, "GET", "/api/messages/summary", undefined, { "X-TipIn-Token": "inconnu" });
    check(r.status === 401, "jeton inconnu refusé (401)");

    // --- Échange Lyon → Paris.
    r = await request(server, "POST", "/api/messages/send", { to: M.Paris.idx, text: "  Salut Paris, <b>ton meneur</b> m'intéresse  " }, M.Lyon.h);
    check(r.status === 200 && r.body.messages.length === 1 && r.body.messages[0].mine, "Lyon envoie un message à Paris");
    check(r.body.messages[0].text === "Salut Paris, <b>ton meneur</b> m'intéresse", "texte nettoyé (espaces) et stocké brut (échappé à l'affichage)");
    now += 2000;
    r = await request(server, "GET", "/api/messages/summary", undefined, M.Paris.h);
    check(r.body.unread === 1 && r.body.conversations[0].name === "Lyon" && r.body.conversations[0].unread === 1, "Paris : 1 non lu de Lyon");
    r = await request(server, "GET", "/api/messages/summary", undefined, M.Nice.h);
    check(r.body.unread === 0 && r.body.conversations.length === 0, "Nice ne voit rien de la conversation Lyon–Paris");
    r = await request(server, "GET", `/api/messages/thread?with=${M.Lyon.idx}`, undefined, M.Nice.h);
    check(r.status === 200 && r.body.messages.length === 0, "Nice ne peut pas lire le fil Lyon–Paris");

    r = await request(server, "GET", `/api/messages/thread?with=${M.Lyon.idx}`, undefined, M.Paris.h);
    check(r.body.messages.length === 1 && !r.body.messages[0].mine && r.body.with.name === "Lyon", "Paris lit le fil");
    const upTo = r.body.messages[0].at;
    r = await request(server, "POST", "/api/messages/read", { with: M.Lyon.idx, upTo }, M.Paris.h);
    check(r.status === 200 && r.body.unread === 0, "Paris marque comme lu → 0 non lu");
    r = await request(server, "GET", `/api/messages/thread?with=${M.Paris.idx}`, undefined, M.Lyon.h);
    check(r.body.readByOtherUntil >= upTo, "Lyon voit que Paris a lu");

    // Réponse + non-lu "upTo" : un message arrivé après l'affichage reste non lu.
    r = await request(server, "POST", "/api/messages/send", { to: M.Lyon.idx, text: "Il n'est pas à vendre" }, M.Paris.h);
    check(r.status === 200 && r.body.messages.length === 2, "Paris répond");
    now += 2000;
    await request(server, "POST", "/api/messages/send", { to: M.Lyon.idx, text: "Enfin… fais une offre" }, M.Paris.h);
    r = await request(server, "POST", "/api/messages/read", { with: M.Paris.idx, upTo: r.body.messages[1].at }, M.Lyon.h);
    check(r.body.unread === 1, "lecture partielle : le message arrivé après l'affichage reste non lu");

    // --- Anti-spam.
    Messages._resetRateLimitForTests();
    now += 60000;
    r = await request(server, "POST", "/api/messages/send", { to: M.Paris.idx, text: "a" }, M.Lyon.h);
    r = await request(server, "POST", "/api/messages/send", { to: M.Paris.idx, text: "b" }, M.Lyon.h);
    check(r.status === 429, "deux messages dans la même seconde : le second est refusé (429)");
    let last;
    for (let i = 0; i < Messages.RATE_MAX; i++) { now += 1500; last = await request(server, "POST", "/api/messages/send", { to: M.Paris.idx, text: "spam " + i }, M.Lyon.h); }
    check(last.status === 429, `plus de ${Messages.RATE_MAX} messages par minute refusés`);
    now += 61000;
    r = await request(server, "POST", "/api/messages/send", { to: M.Paris.idx, text: "après la pause" }, M.Lyon.h);
    check(r.status === 200, "de nouveau autorisé une minute plus tard");

    // --- Blocage.
    now += 2000;
    r = await request(server, "POST", "/api/messages/block", { teamIndex: M.Lyon.idx, blocked: true }, M.Paris.h);
    check(r.status === 200 && r.body.with.blocked === true, "Paris bloque Lyon");
    r = await request(server, "POST", "/api/messages/send", { to: M.Paris.idx, text: "tu es là ?" }, M.Lyon.h);
    check(r.status === 403, "Lyon ne peut plus écrire à Paris");
    r = await request(server, "POST", "/api/messages/send", { to: M.Lyon.idx, text: "hop" }, M.Paris.h);
    check(r.status === 400, "Paris doit débloquer pour écrire à Lyon");
    r = await request(server, "GET", "/api/messages/summary", undefined, M.Paris.h);
    check(r.body.unread === 0 && r.body.conversations[0].blocked, "les non-lus d'un manager bloqué ne comptent pas");
    r = await request(server, "POST", "/api/messages/block", { teamIndex: M.Lyon.idx, blocked: false }, M.Paris.h);
    check(r.body.with.blocked === false, "Paris débloque Lyon");

    // --- Signalement + modération.
    r = await request(server, "GET", `/api/messages/thread?with=${M.Lyon.idx}`, undefined, M.Paris.h);
    const fromLyon = r.body.messages.find(m => !m.mine);
    const mine = r.body.messages.find(m => m.mine);
    r = await request(server, "POST", "/api/messages/report", { with: M.Lyon.idx, messageId: mine.id, reason: "spam" }, M.Paris.h);
    check(r.status === 400, "on ne peut pas signaler son propre message");
    r = await request(server, "POST", "/api/messages/report", { with: M.Lyon.idx, messageId: fromLyon.id, reason: "insultes", comment: "pas cool" }, M.Paris.h);
    check(r.status === 200 && r.body.ok, "Paris signale un message de Lyon");
    r = await request(server, "POST", "/api/messages/report", { with: M.Lyon.idx, messageId: fromLyon.id, reason: "insultes" }, M.Paris.h);
    check(r.body.alreadyReported, "double signalement ignoré");
    r = await request(server, "GET", "/api/admin/message-reports");
    check(r.status === 403, "liste des signalements protégée (403 sans jeton admin)");
    r = await request(server, "GET", "/api/admin/message-reports", undefined, { "X-Admin-Token": "admin-msg-test" });
    check(r.status === 200 && r.body.reports.length === 1 && r.body.reports[0].reportedTeam === "Lyon" && r.body.reports[0].context.length >= 1, "l'admin voit le signalement avec son contexte");
    check(!JSON.stringify(r.body).includes("reporter\""), "pas d'empreinte de participant dans la vue admin");
    const rid = r.body.reports[0].id;
    r = await request(server, "POST", "/api/admin/message-reports", { id: rid }, { "X-Admin-Token": "admin-msg-test" });
    check(r.status === 200, "l'admin clôt le signalement");

    // --- Persistance : un nouveau serveur relit le même fichier.
    check(fs.existsSync(path.join(dir, "messages.json")), "messages.json écrit à côté de multi-league.json");
    const server2 = http.createServer(createHandler(path.join(dir, "league.json"), () => now, multiSavePath));
    await new Promise(res => server2.listen(0, "127.0.0.1", res));
    try {
      r = await request(server2, "GET", `/api/messages/thread?with=${M.Paris.idx}`, undefined, M.Lyon.h);
      check(r.body.messages.length >= 5, "l'historique survit au redémarrage du serveur");
    } finally { server2.close(); }

    // --- Écritures concurrentes : aucun message perdu.
    Messages._resetRateLimitForTests();
    now += 120000;
    const before = (await request(server, "GET", `/api/messages/thread?with=${M.Nice.idx}`, undefined, M.Lyon.h)).body.messages.length;
    await Promise.all([
      request(server, "POST", "/api/messages/send", { to: M.Nice.idx, text: "1" }, M.Lyon.h),
      request(server, "POST", "/api/messages/send", { to: M.Lyon.idx, text: "2" }, M.Nice.h),
      request(server, "POST", "/api/messages/send", { to: M.Nice.idx, text: "3" }, M.Paris.h),
    ]);
    const lyonNice = (await request(server, "GET", `/api/messages/thread?with=${M.Nice.idx}`, undefined, M.Lyon.h)).body.messages.length;
    const parisNice = (await request(server, "GET", `/api/messages/thread?with=${M.Nice.idx}`, undefined, M.Paris.h)).body.messages.length;
    check(lyonNice === before + 2 && parisNice === 1, "envois simultanés : aucun message perdu");

    // --- La messagerie ne réécrit jamais la ligue.
    const mtime = fs.statSync(multiSavePath).mtimeMs;
    await request(server, "GET", "/api/messages/summary", undefined, M.Lyon.h);
    now += 2000;
    await request(server, "POST", "/api/messages/send", { to: M.Paris.idx, text: "test" }, M.Nice.h);
    check(fs.statSync(multiSavePath).mtimeMs === mtime, "la ligue partagée n'est pas réécrite par la messagerie");
  } finally {
    server.close();
  }
  console.log("\nTous les tests de la messagerie sont passés.");
}

main().catch(e => { console.error(e); process.exit(1); });
