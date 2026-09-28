// Premium, ex-« Bientôt » (liste de la nuit du 2026-09-28) : notifications
// (Web Push chiffré RFC 8291 + VAPID, sans dépendance), courbe de
// progression des joueurs, statistiques avancées + export CSV, revoir le
// direct d'un match déjà joué. Voir server/webpush.js, server/push.js,
// Team.trainWeek (progressLog), LiveMatch.archiveReplay + /api/replay, et
// moteurbasket3.html (playerProgressHtml, renderStatsAdvancedSection,
// startMatchReplay, hmPushSectionHtml).
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const store = require("./server/store.js");
const WebPush = require("./server/webpush.js");
const Push = require("./server/push.js");
const { startTestServer, openGame, patchDateNow } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const ok = m => console.log("✅ " + m);
const wait = async (cond, what) => { for (let i = 0; i < 100; i++) { if (cond()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error(`délai dépassé : ${what}`); };

// Déchiffrement côté navigateur (RFC 8291), pour vérifier le chiffrement.
function decrypt(body, uaEcdh, authSecret) {
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const hmac = (k, d) => crypto.createHmac("sha256", k).update(d).digest();
  const secret = uaEcdh.computeSecret(asPublic);
  const prkKey = hmac(authSecret, secret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaEcdh.getPublicKey(), asPublic, Buffer.from([1])])).subarray(0, 32);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.strictEqual(plain[plain.length - 1], 2, "délimiteur du dernier bloc");
  return plain.subarray(0, plain.length - 1).toString("utf8");
}

(async () => {
  // 1) Web Push : chiffrement et signature VAPID.
  const vapid = WebPush.generateVapidKeys();
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey; process.env.VAPID_PRIVATE_KEY = vapid.privateKey; process.env.VAPID_SUBJECT = "mailto:test@hoop-manager.com";
  const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
  const authSecret = crypto.randomBytes(16);
  const sub = { endpoint: "https://push.example.test/abc", keys: { p256dh: WebPush.b64u(ua.getPublicKey()), auth: WebPush.b64u(authSecret) } };
  const body = WebPush.encryptPayload(sub, JSON.stringify({ title: "Coup d'envoi", body: "é à ü" }));
  assert.deepStrictEqual(JSON.parse(decrypt(body, ua, authSecret)), { title: "Coup d'envoi", body: "é à ü" });
  const auth = WebPush.vapidAuthorization(sub.endpoint, WebPush.vapidConfig(), 1000);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(auth);
  assert.ok(m && m[4] === vapid.publicKey);
  const claims = JSON.parse(WebPush.unb64u(m[2]).toString());
  assert.strictEqual(claims.aud, "https://push.example.test"); assert.strictEqual(claims.exp, 1000 + 12 * 3600);
  const pub = WebPush.unb64u(vapid.publicKey);
  const pubKey = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: WebPush.b64u(pub.subarray(1, 33)), y: WebPush.b64u(pub.subarray(33)) }, format: "jwk" });
  assert.ok(crypto.verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key: pubKey, dsaEncoding: "ieee-p1363" }, WebPush.unb64u(m[3])), "signature ES256 valide");
  const calls = [];
  WebPush._setFetchForTests(async (url, init) => { calls.push({ url, init }); return { status: 201 }; });
  const sent = await WebPush.sendPush(sub, { title: "x" });
  assert.ok(sent.ok && calls[0].init.headers["Content-Encoding"] === "aes128gcm" && /^vapid t=/.test(calls[0].init.headers.Authorization));
  ok("Web Push : charge chiffrée aes128gcm (déchiffrée côté « navigateur »), JWT VAPID ES256 valide, en-têtes d'envoi");

  // 2) Quoi notifier : coup d'envoi, blessure, arrivée ; curseur ; abonnement expiré.
  const created = Date.now() - 2 * 24 * 3600 * 1000;
  const career = store.createMultiManagerCareer(["Lyon Prem", "Paris Prem"], created, "Lyon Prem");
  const league = career.league;
  const lyon = league.teams[0];
  lyon.setPaying(true);
  assert.ok(Push.addSubscription(lyon, sub, Date.now()));
  const now = Date.now();
  league.liveMatches = { "0:0:1": { homeIdx: 0, awayIdx: 1, kickoffAt: now - 60000, events: [], round: 0 } };
  Engine.handleGameEvent(lyon.feed, { type: "injury", week: 1, playerId: lyon.players[0].id, playerName: lyon.players[0].name, days: 5 }, { clubName: lyon.name });
  Engine.handleGameEvent(lyon.feed, { type: "transfer_in", week: 1, playerId: 99, playerName: "Nouveau Venu", from: "Paris", fee: 1000 }, { clubName: lyon.name });
  Engine.pushEntry(lyon.feed, { category: "club", title: "Sans intérêt", text: "…" });
  const sentNotes = [];
  let n = await Push.flushLeague(league, now, { send: async (s, note) => { sentNotes.push(note); return { ok: true }; } });
  assert.strictEqual(n, 3);
  assert.ok(/match commence/.test(sentNotes[0].title) && sentNotes.some(x => /Nouveau Venu/.test(x.title + x.body)));
  assert.strictEqual(sentNotes.length, 3, "l'entrée « Sans intérêt » n'est pas notifiée");
  n = await Push.flushLeague(league, now + 1000, { send: async () => ({ ok: true }) });
  assert.strictEqual(n, 0, "rien deux fois");
  lyon.feed.nextId && Engine.handleGameEvent(lyon.feed, { type: "injury", week: 1, playerId: lyon.players[1].id, playerName: lyon.players[1].name, days: 3 }, { clubName: lyon.name });
  await Push.flushLeague(league, now + 2000, { send: async () => ({ ok: false, gone: true }) });
  assert.strictEqual(lyon.pushSubscriptions.length, 0, "abonnement expiré retiré");
  lyon.setPaying(false);
  Push.addSubscription(lyon, sub, now);
  Engine.handleGameEvent(lyon.feed, { type: "transfer_out", week: 1, playerName: "Parti", to: "Paris", fee: 1 }, { clubName: lyon.name });
  assert.strictEqual(await Push.flushLeague(league, now + 3000, { send: async () => ({ ok: true }) }), 0, "pas de notification sans Premium");
  lyon.setPaying(true);
  ok("notifications : coup d'envoi, blessure, arrivée d'un joueur (pas les autres entrées), jamais deux fois, abonnement expiré retiré, Premium seulement");

  // 3) Courbe de progression : une note par semaine d'entraînement.
  const t2 = Engine.teamFromSave(Engine.serializeTeam(lyon));
  t2.trainWeek(1, now); t2.trainWeek(1, now + 1000);
  const pl = t2.players[0].progressLog;
  assert.ok(pl.length >= 2 && typeof pl[pl.length - 1].ovr === "number");
  const back = Engine.teamFromSave(JSON.parse(JSON.stringify(Engine.serializeTeam(t2))));
  assert.deepStrictEqual(back.players[0].progressLog, pl);
  ok(`courbe de progression : ${pl.length} points pour ${t2.players[0].name}, sauvegardés`);

  // 4) Revoir le direct : un match en direct, archivé à la fin, rejouable (Premium).
  lyon.pushSubscriptions = [];
  league.liveMatches = {};
  const clock = { now: now };
  const { server, multiSavePath, baseUrl } = await startTestServer(() => clock.now);
  const kick = Calendar.scheduledTimeForLeagueRound(league, league.round);
  await store.saveMultiLeague(league, multiSavePath);
  const api = async (p, token) => { const r = await fetch(new URL(p, baseUrl), { headers: { "X-TipIn-Token": token } }); return { status: r.status, body: await r.json() }; };
  clock.now = kick + 60 * 1000;
  await api("/api/state", lyon.managerLinkToken);
  clock.now = kick + Calendar.MATCH_BROADCAST_DURATION_MS + 60 * 1000;
  await api("/api/state", lyon.managerLinkToken);
  const reps = await store.loadReplays("fr-1", multiSavePath);
  assert.ok(reps.list.length >= 1, "direct archivé");
  const mine = reps.list.find(x => x.entry.homeIdx === 0 || x.entry.awayIdx === 0);
  const e = mine.entry;
  const q = `/api/replay?round=${e.round}&competition=championship&home=${e.homeIdx}&away=${e.awayIdx}`;
  const rp = await api(q, lyon.managerLinkToken);
  assert.strictEqual(rp.status, 200, JSON.stringify(rp.body).slice(0, 200));
  assert.ok(rp.body.live.replay && rp.body.live.kickoffAt >= clock.now && rp.body.live.events.every(ev => ev.airAt >= clock.now));
  assert.strictEqual(rp.body.live.opponentIdx, e.homeIdx === 0 ? e.awayIdx : e.homeIdx);
  const paris = league.teams[1];
  const denied = await api(q, paris.managerLinkToken);
  assert.ok(denied.status === 404 || denied.status === 403);
  ok(`revoir le direct : match de la journée ${e.round + 1} archivé, rejoué depuis maintenant, réservé aux clubs du match`);

  // 5) Navigateur : bouton « Revoir le direct », stats avancées + CSV, courbe, notifications.
  const dom = await openGame(html, `${baseUrl}?m=${lyon.managerLinkToken}`, w => patchDateNow(w, () => clock.now));
  const win = dom.window, doc = win.document;
  if (win.eval("currentVisiblePageId()") === "catchupSection") doc.getElementById("catchupContinueBtn").click();
  win.eval(`showMatchBoxscore(${e.round}, "championship", ${e.homeIdx}, ${e.awayIdx})`);
  const btn = doc.getElementById("matchReplayBtn");
  assert.ok(btn, "bouton « Revoir le direct »");
  btn.click();
  await wait(() => win.eval("!!currentLiveMatch && currentLiveMatch.replay === true"), "direct rejoué");
  assert.strictEqual(win.eval("currentVisiblePageId()"), "liveSection");
  win.eval("TAB_HANDLERS.statshebdo()");
  const adv = doc.getElementById("statsAdvancedContent");
  assert.ok(adv.querySelector(".st-adv-table") && /TS%/.test(adv.textContent));
  doc.getElementById("statsExportCsvBtn").click();
  assert.ok(/^﻿Joueur;Poste;MJ;Min;TS%/.test(win.eval("window.__lastCsvExport")), "CSV exporté");
  const p0 = win.eval("teamA.players.find(p => (p.matchLog || []).length).id");
  win.eval(`showPlayerDetail(${0}, ${JSON.stringify(p0)})`);
  assert.ok(/Progression/.test(doc.body.textContent));
  win.eval("showSettingsModal('account')");
  await wait(() => /Notifications/.test((doc.getElementById("settingsAccountBlock") || {}).textContent || ""), "section Notifications");
  assert.ok(/ne gère pas les notifications/.test(doc.getElementById("settingsAccountBlock").textContent), "navigateur sans Web Push : message explicite");
  ok("navigateur : « Revoir le direct » depuis la feuille de match, statistiques avancées + export CSV, carte Progression, section Notifications");
  dom.window.close();

  // Sans Premium : verrous.
  const saved = (await store.loadMultiLeague(multiSavePath)).league;
  saved.teams[0].setPaying(false); saved.teams[0].premiumUntil = null;
  await store.saveMultiLeague(saved, multiSavePath);
  assert.strictEqual((await api(q, lyon.managerLinkToken)).status, 403);
  const dom2 = await openGame(html, `${baseUrl}?m=${lyon.managerLinkToken}`, w => patchDateNow(w, () => clock.now));
  if (dom2.window.eval("currentVisiblePageId()") === "catchupSection") dom2.window.document.getElementById("catchupContinueBtn").click();
  dom2.window.eval("TAB_HANDLERS.statshebdo()");
  assert.ok(/réservé au Premium/.test(dom2.window.document.getElementById("statsAdvancedContent").textContent));
  ok("sans Premium : revoir le direct refusé (403), statistiques avancées verrouillées");
  dom2.window.close();

  server.close();
  console.log("\n🏁 premium_features_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
