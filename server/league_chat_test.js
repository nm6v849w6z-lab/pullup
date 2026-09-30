"use strict";
// Chat de la ligue (voir server/leagueChat.js et les routes /api/league-chat
// de server/index.js) : vraies requêtes HTTP contre un vrai serveur sur port
// éphémère, horloge injectée.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createHandler } = require("./index.js");
const store = require("./store.js");
const World = require("./world.js");
const LeagueChat = require("./leagueChat.js");

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
      res.on("end", () => { let body = null; try { body = JSON.parse(raw); } catch (e) { /* */ } resolve({ status: res.statusCode, body }); });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  process.env.BASKET_ADMIN_TOKEN = "admin-chat-test";
  let now = Date.UTC(2026, 8, 28, 10);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basket-league-chat-test-"));
  const multiSavePath = path.join(dir, "multi-league.json");
  const server = http.createServer(createHandler(path.join(dir, "league.json"), () => now, multiSavePath, path.join(dir, "accounts.json")));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const get = h => request(server, "GET", "/api/league-chat", undefined, h);
  const send = (h, text) => request(server, "POST", "/api/league-chat/send", { text }, h);
  const react = (h, id, emoji) => request(server, "POST", "/api/league-chat/react", { id, emoji }, h);
  try {
    let r = await request(server, "GET", "/api/league-chat");
    check(r.status === 401, "sans jeton : chat refusé (401)");

    const boot = await request(server, "POST", "/api/admin/new-multi-league", { teamNames: ["Lyon", "Paris", "Nice"] }, { "X-Admin-Token": "admin-chat-test" });
    check(boot.status === 200 && boot.body.managers.length === 3, "ligue partagée créée (3 managers)");
    const M = {};
    boot.body.managers.forEach(m => { M[m.name] = { idx: m.teamIndex, h: { "X-TipIn-Token": m.token } }; });
    r = await get({ "X-TipIn-Token": "inconnu" });
    check(r.status === 401, "jeton inconnu refusé (401)");

    r = await get(M.Lyon.h);
    check(r.status === 200 && r.body.ok && r.body.canPost, "Lyon ouvre le chat (écriture possible)");
    check(r.body.managers.length === 3 && r.body.aiCount === 7, "3 managers humains, 7 équipes IA");
    check(r.body.managers[0].me && r.body.managers[0].club === "Lyon", "moi d'abord dans la liste des managers");
    check(r.body.online >= 1 && r.body.managers.filter(m => m.online).length === r.body.online, "compteur « en ligne » cohérent");
    check(!JSON.stringify(r.body).includes(boot.body.managers[1].token), "aucun jeton dans la réponse");
    check(Array.isArray(r.body.messages) && r.body.messages.length === 0, "aucun message avant la 1re journée");
    check(r.body.reactions.join("") === LeagueChat.REACTIONS.join(""), "jeu de réactions fourni au navigateur");

    // --- Validations.
    r = await send(M.Lyon.h, "   ");
    check(r.status === 400, "message vide refusé");
    r = await send(M.Lyon.h, "x".repeat(LeagueChat.MAX_TEXT_LENGTH + 1));
    check(r.status === 400, "message de plus de 500 caractères refusé");
    r = await send(M.Lyon.h, "  Salut la ligue, <b>bonne saison</b>  ");
    check(r.status === 200 && r.body.messages.length === 1, "Lyon poste un message");
    const first = r.body.messages[0];
    check(first.kind === "user" && first.mine && first.author.club === "Lyon" && first.text === "Salut la ligue, <b>bonne saison</b>", "texte nettoyé (espaces) et stocké brut (échappé à l'affichage)");
    now += 1000;
    r = await send(M.Lyon.h, "encore moi");
    check(r.status === 429, "second message en moins de 3 s refusé (429)");
    now += 2500;
    r = await send(M.Lyon.h, "encore moi");
    check(r.status === 200, "de nouveau autorisé après 3 s");
    r = await send(M.Paris.h, "Salut Lyon !");
    check(r.status === 200, "l'anti-spam est propre à chaque manager (Paris peut écrire)");

    r = await get(M.Paris.h);
    const lyonMsg = r.body.messages.find(m => m.id === first.id);
    check(r.body.messages.length === 3 && lyonMsg && !lyonMsg.mine && lyonMsg.author.club === "Lyon", "Paris voit les messages de Lyon (pas « à lui »)");

    // --- Réactions.
    r = await react(M.Paris.h, first.id, "🔥");
    let m = r.body.messages.find(x => x.id === first.id);
    check(r.status === 200 && m.reactions.length === 1 && m.reactions[0].count === 1 && m.reactions[0].mine, "Paris réagit 🔥");
    r = await react(M.Lyon.h, first.id, "🔥");
    m = r.body.messages.find(x => x.id === first.id);
    check(m.reactions[0].count === 2 && m.reactions[0].mine, "Lyon ajoute 🔥 (2)");
    r = await react(M.Paris.h, first.id, "🔥");
    m = r.body.messages.find(x => x.id === first.id);
    check(m.reactions[0].count === 1 && !m.reactions[0].mine, "Paris retire sa réaction (bascule)");
    r = await react(M.Lyon.h, first.id, "🔥");
    m = r.body.messages.find(x => x.id === first.id);
    check(m.reactions.length === 0, "plus aucune réaction : l'émoji disparaît");
    r = await react(M.Lyon.h, first.id, "💩");
    check(r.status === 400, "réaction hors du jeu fixe refusée");
    r = await react(M.Lyon.h, 99999, "🔥");
    check(r.status === 404, "réaction sur un message inconnu : 404");

    // --- Messages automatiques : résultats, classement, transfert.
    const loaded = await store.loadMultiLeague(multiSavePath);
    const lg = loaded.league;
    const scores = [[87, 65], [70, 81], [90, 88], [77, 72], [64, 69]];
    for (let round = 0; round < 3; round++) {
      lg.matchesForRound(round).forEach((mm, i) => {
        const [a, b] = scores[(i + round) % scores.length];
        lg.recordResult(round, mm.home, mm.away, a, b);
      });
    }
    lg.round = 3;
    lg.logTransferNews({ id: "tr-test-1", at: now, playerName: "Jean Test", buyerIdx: M.Nice.idx, buyerName: "Nice", sellerName: lg.teams[5].name, fee: 125000 });
    await store.saveMultiLeague(lg, multiSavePath);
    now += 5000;
    r = await get(M.Nice.h);
    const results = r.body.messages.filter(x => x.kind === "result");
    const transfers = r.body.messages.filter(x => x.kind === "transfer");
    const standings = r.body.messages.filter(x => x.kind === "standings");
    check(results.length === 15, `un message « Résultat » par match joué (${results.length})`);
    const r0 = lg.results.find(x => x.round === 0);
    const wName = lg.teams[r0.scoreHome > r0.scoreAway ? r0.home : r0.away].name;
    check(results.some(x => x.text === `${wName} bat ${lg.teams[r0.scoreHome > r0.scoreAway ? r0.away : r0.home].name} ${Math.max(r0.scoreHome, r0.scoreAway)}-${Math.min(r0.scoreHome, r0.scoreAway)}`), "texte « X bat Y 87-65 »");
    check(transfers.length === 1 && transfers[0].data.player === "Jean Test" && transfers[0].data.buyer === "Nice" && transfers[0].data.fee === 125000, "message « Transfert » quand un club de la ligue achète un joueur");
    check(standings.length >= 1 && standings.every(x => ["leader", "playoffs", "relegation"].includes(x.data.event)), `messages « Classement » (${standings.length})`);
    r = await get(M.Lyon.h);
    check(r.body.messages.filter(x => x.kind === "result").length === 15 && r.body.messages.filter(x => x.kind === "transfer").length === 1, "aucun doublon à la lecture suivante");
    const resId = results[0].id;
    r = await react(M.Lyon.h, resId, "👏");
    check(r.status === 200 && r.body.messages.find(x => x.id === resId).reactions[0].emoji === "👏", "on peut réagir à un message automatique");

    // --- Non-lus + repère de lecture (côté serveur, par manager).
    const readChat = (h, upTo) => request(server, "POST", "/api/league-chat/read", upTo === undefined ? {} : { upTo }, h);
    const summary = h => request(server, "GET", "/api/league-chat?summary=1", undefined, h);
    r = await get(M.Paris.h);
    const expectedParis = r.body.messages.filter(x => !(x.kind === "user" && x.mine)).length;
    check(r.body.unreadCount === expectedParis && r.body.lastReadId === 0, `Paris : ${expectedParis} non-lus (messages des autres + automatiques, pas les siens)`);
    let s = await summary(M.Paris.h);
    check(s.status === 200 && s.body.unreadCount === expectedParis && !s.body.messages, "?summary=1 : juste le nombre de non-lus");
    const lastId = Math.max(...r.body.messages.map(x => x.id)); // ids croissants, pas forcément dans l'ordre d'affichage
    s = await readChat(M.Paris.h, lastId);
    check(s.status === 200 && s.body.unreadCount === 0 && s.body.lastReadId === lastId, "Paris ouvre le chat : 0 non-lu");
    s = await readChat(M.Paris.h, 1);
    check(s.body.lastReadId === lastId, "le repère de lecture ne recule jamais");
    now += 4000;
    await send(M.Lyon.h, "Nouveau message de Lyon");
    s = await summary(M.Paris.h);
    check(s.body.unreadCount === 1, "un nouveau message de Lyon : 1 non-lu pour Paris");
    await readChat(M.Lyon.h);
    now += 4000;
    await send(M.Lyon.h, "Et un autre");
    s = await summary(M.Lyon.h);
    check(s.body.unreadCount === 0, "ses propres messages ne comptent jamais");
    s = await summary(M.Nice.h);
    check(s.body.unreadCount > 0, "le repère est propre à chaque manager (Nice n'a rien lu)");

    // --- Cloisonnement : un manager d'un autre championnat ne voit rien.
    const world = await World.loadWorld(multiSavePath, now);
    const us = await World.assignClub(world, multiSavePath, { country: "us", clubName: "Club US", now });
    check(us.ok && us.leagueId !== "fr-1", "un manager arrive dans le championnat américain");
    const U = { "X-TipIn-Token": us.token };
    r = await get(U);
    check(r.status === 200 && !r.body.messages.some(x => x.kind === "user"), "il ne voit aucun message du chat français");
    check(!r.body.canPost && r.body.managers.length === 1, "seul manager de sa ligue : lecture seule");
    r = await send(U, "hello ?");
    check(r.status === 403, "seul manager de sa ligue : envoi refusé (403)");
    await react(U, first.id, "🔥");
    r = await get(M.Lyon.h);
    check(r.body.messages.find(x => x.id === first.id).reactions.length === 0, "une réaction d'un autre championnat ne touche jamais ce chat");

    // --- Persistance : un nouveau serveur relit le même fichier.
    check(fs.existsSync(path.join(dir, "multi-league.chat.fr-1.json")), "chat écrit à côté de la ligue (multi-league.chat.fr-1.json)");
    const server2 = http.createServer(createHandler(path.join(dir, "league.json"), () => now, multiSavePath, path.join(dir, "accounts.json")));
    await new Promise(res => server2.listen(0, "127.0.0.1", res));
    try {
      r = await request(server2, "GET", "/api/league-chat", undefined, M.Paris.h);
      check(r.body.messages.filter(x => x.kind === "user").length === 5 && r.body.messages.filter(x => x.kind === "result").length === 15, "l'historique survit au redémarrage du serveur");
      check(r.body.unreadCount === 2 && r.body.lastReadId > 0, "le repère de lecture aussi (Paris : 2 non-lus)");
    } finally { server2.close(); }

    // --- Le chat ne réécrit jamais la ligue.
    const mtime = fs.statSync(multiSavePath).mtimeMs;
    now += 4000;
    await send(M.Nice.h, "test");
    await get(M.Nice.h);
    check(fs.statSync(multiSavePath).mtimeMs === mtime, "la ligue partagée n'est pas réécrite par le chat");
  } finally {
    server.close();
  }
  // --- Moteur : une enchère conclue alimente League.transferNews.
  {
    const lg = store.createMultiManagerCareer(["Lyon", "Paris"], now).league;
    const buyerIdx = lg.teams.findIndex(t => t.isHuman);
    const sellerIdx = lg.teams.findIndex(t => !t.isHuman);
    const player = lg.teams[sellerIdx].players[0];
    const listing = lg.listPlayerForSale(sellerIdx, player.id, 1000, now);
    lg.teams[buyerIdx].budget = 10000000;
    const bid = lg.placeBid(listing.id, buyerIdx, 5000, now);
    lg._resolveListing(listing, listing.closesAt);
    const news = lg.transferNews || [];
    check(bid.ok && listing.result === "sold" && news.length === 1 && news[0].playerName === player.name && news[0].buyerIdx === buyerIdx && news[0].fee === 5000,
      "une enchère conclue est notée dans League.transferNews (source des messages « Transfert »)");
    const round = store.deserializeMultiLeague(store.serializeMultiLeague(lg)).league;
    check((round.transferNews || []).length === 1, "transferNews survit à la sauvegarde");
  }
  console.log("\nTous les tests du chat de la ligue sont passés.");
}

main().catch(e => { console.error(e); process.exit(1); });
