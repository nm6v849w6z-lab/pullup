// Rafraîchissement regroupé (performance, 2026-10-09) : GET /api/heartbeat
// renvoie en une requête ce que renvoyaient cinq minuteries séparées
// (en ligne, amicaux, mes enchères, résumé de la messagerie, non-lus du chat
// de ligue) ; le navigateur n'appelle plus que lui pour ces mises à jour.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const store = require("./store.js");
const Metrics = require("./metrics.js");
const { startTestServer, openGame } = require("../test_helpers.js");
const html = require("../test_game_html.js").readGameHtml();
const ok = m => console.log("✅ " + m);

(async () => {
  const now = Date.now();
  const { server, multiSavePath, baseUrl } = await startTestServer();
  const career = store.createMultiManagerCareer(["Lyon Pouls", "Paris Pouls"], now - 2 * 24 * 3600 * 1000, "Lyon Pouls");
  await store.saveMultiLeague(career.league, multiSavePath);
  const lyon = career.league.teams[0], paris = career.league.teams[1];
  const api = async (p, token, init = {}) => {
    const res = await fetch(new URL(p, baseUrl), { ...init, headers: { "Content-Type": "application/json", "X-TipIn-Token": token } });
    return { status: res.status, body: await res.json() };
  };
  // Paris écrit à Lyon (messagerie) et dans le chat de ligue.
  assert.strictEqual((await api("/api/messages/send", paris.managerLinkToken, { method: "POST", body: JSON.stringify({ to: "0", text: "Salut Lyon" }) })).status, 200);
  assert.strictEqual((await api("/api/league-chat/send", paris.managerLinkToken, { method: "POST", body: JSON.stringify({ text: "Bonjour la ligue" }) })).status, 200);

  const hb = await api("/api/heartbeat", lyon.managerLinkToken);
  assert.strictEqual(hb.status, 200, JSON.stringify(hb.body));
  const b = hb.body;
  assert.ok(b.ok && typeof b.online === "number" && b.online >= 1);
  const sep = {
    friendly: (await api("/api/friendly/list", lyon.managerLinkToken)).body,
    messages: (await api("/api/messages/summary", lyon.managerLinkToken)).body,
    chat: (await api("/api/league-chat?summary=1", lyon.managerLinkToken)).body,
    auctions: (await api("/api/auctions/mine", lyon.managerLinkToken)).body,
  };
  assert.deepStrictEqual(b.friendly, sep.friendly);
  assert.deepStrictEqual(b.messages, sep.messages);
  assert.deepStrictEqual(b.chat, sep.chat);
  assert.deepStrictEqual({ ...b.auctions, now: 0 }, { ...sep.auctions, now: 0 });
  assert.strictEqual(b.chat.unreadCount, 1, JSON.stringify(b.chat));
  assert.ok(b.messages.conversations.some(c => c.unread), JSON.stringify(b.messages));
  assert.strictEqual((await api("/api/heartbeat", "jeton-inconnu")).status >= 400, true, "jeton inconnu refusé");
  ok("GET /api/heartbeat : en ligne, amicaux, mes enchères, messagerie et chat de ligue en une réponse, identiques aux routes séparées");

  // Navigateur : un passage = une seule requête, pastilles à jour.
  const dom = await openGame(html, `${baseUrl}?m=${lyon.managerLinkToken}`);
  const win = dom.window, doc = win.document;
  await new Promise(r => setTimeout(r, 300));
  Metrics.reset();
  assert.strictEqual(await win.eval("hbTick(true)"), true);
  const names = Metrics.snapshot().series.map(s => s.name);
  assert.ok(names.includes("GET /api/heartbeat"), names.join(", "));
  const separate = names.filter(n => /^GET \/api\/(online|friendly\/list|auctions\/mine|messages\/summary|league-chat)$/.test(n));
  assert.deepStrictEqual(separate, [], names.join(", "));
  assert.ok(/En ligne/.test(doc.getElementById("topbarOnline").textContent), doc.getElementById("topbarOnline").textContent);
  assert.ok(win.eval("msgUi.summary && msgUi.summary.conversations.some(c => c.unread)"), "résumé de la messagerie reçu");
  assert.strictEqual(win.eval("lgcUi.unread"), 1, "non-lus du chat de ligue");
  assert.strictEqual(await win.eval("hbTick(false)"), false, "pas de second passage avant 30 s");
  assert.ok(!/setInterval\([^\n]*(frRefreshList|myAuctionsRefresh|refreshTopbarOnline)\(/.test(html), "plus de minuterie séparée");
  ok("navigateur : un passage = une seule requête /api/heartbeat ; en ligne, messagerie et chat de ligue à jour ; plus de minuteries séparées");
  dom.window.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
