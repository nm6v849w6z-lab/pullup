"use strict";
// Matchs amicaux par HTTP (voir server/friendlies.js et les routes
// /api/friendly/* de server/index.js) : jours proposés, invitation d'un
// manager humain → petit message privé reçu dans la Messagerie (demande
// utilisateur 2026-09-27), réponse, amicaux visibles dans /api/save.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createHandler } = require("./index.js");

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
  process.env.BASKET_ADMIN_TOKEN = "admin-friendly-test";
  let now = Date.UTC(2026, 8, 28, 10);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basket-friendly-test-"));
  const server = http.createServer(createHandler(path.join(dir, "league.json"), () => now, path.join(dir, "multi-league.json")));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try {
    const boot = await request(server, "POST", "/api/admin/new-multi-league", { teamNames: ["Lyon", "Paris"] }, { "X-Admin-Token": "admin-friendly-test" });
    check(boot.status === 200, "ligue partagée créée");
    const M = {};
    boot.body.managers.forEach(m => { M[m.name] = { idx: m.teamIndex, h: { "X-TipIn-Token": m.token } }; });

    let r = await request(server, "GET", `/api/friendly/days?opponent=${M.Paris.idx}`, undefined, M.Lyon.h);
    check(r.status === 200 && r.body.days.length > 0, `jours de repos communs proposés (${r.body.days.length})`);
    const day = r.body.days.find(d => d.times.includes("20:00"));
    check(/^[a-zé]+ \d+ [a-zéû]+$/.test(day.label), `libellé du jour en français (« ${day.label} »)`);

    r = await request(server, "POST", "/api/friendly/propose", { opponent: M.Paris.idx, day: day.day, time: "20:00" }, M.Lyon.h);
    check(r.status === 200 && r.body.status === "pending" && !("notify" in r.body), "invitation envoyée (le détail du message ne fuit pas dans la réponse)");
    check(Array.isArray(r.body.friendlies) && r.body.friendlies.length === 1, "la réponse renvoie mes amicaux");
    const id = r.body.friendlyId;

    r = await request(server, "GET", "/api/messages/summary", undefined, M.Paris.h);
    check(r.body.unread === 1, "Paris a 1 message non lu");
    r = await request(server, "GET", `/api/messages/thread?with=${M.Lyon.idx}`, undefined, M.Paris.h);
    const msg = r.body.messages[0];
    check(msg && !msg.mine && /Lyon vous propose un amical/.test(msg.text) && /20h00/.test(msg.text), `message privé reçu de Lyon : « ${msg && msg.text} »`);

    const save = await request(server, "GET", "/api/save", undefined, M.Paris.h);
    const fr = save.body.league.friendlies;
    check(fr.length === 1 && fr[0].id === id && fr[0].status === "pending", "l'invitation apparaît dans la sauvegarde de Paris");

    r = await request(server, "POST", "/api/friendly/respond", { id, accept: true }, M.Paris.h);
    check(r.status === 200 && r.body.status === "accepted", "Paris accepte");
    r = await request(server, "POST", "/api/friendly/propose", { opponent: M.Paris.idx, day: day.day, time: "21:00" }, M.Lyon.h);
    check(r.status === 400, "un seul amical par jour");

    // Le match se joue à l'heure dite, au premier passage du serveur après.
    now = fr[0].at + 60 * 1000;
    const during = await request(server, "GET", "/api/save", undefined, M.Lyon.h);
    const hiddenFr = during.body.league.friendlies.find(f => f.id === id);
    check(hiddenFr.status === "accepted" && hiddenFr.result === null, "huis clos : score caché pendant la durée d'un match");
    now = fr[0].at + 90 * 60 * 1000 + 60 * 1000;
    const after = await request(server, "GET", "/api/save", undefined, M.Lyon.h);
    const played = after.body.league.friendlies.find(f => f.id === id);
    check(played.status === "played" && played.result && played.result.boxScoreHome.length > 0, `amical joué : ${played.result.scoreHome}-${played.result.scoreAway}`);
  } finally {
    server.close();
  }
  console.log("\n✅ Matchs amicaux par HTTP : invitation, message privé, réponse, résultat.");
}

main().catch(e => { console.error(e); process.exit(1); });
