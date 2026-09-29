// Recalibrage des clubs de l'IA des ligues déjà créées (audit moteur
// 2026-09-29) — POST /api/admin/recalibrate-cpu : dryRun par défaut (rapport,
// aucune écriture), puis application : clubs IA trop forts ramenés au niveau
// d'un club IA généré aujourd'hui dans leur division, clubs de managers
// intacts, second passage sans effet.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { createHandler } = require("./index.js");
const store = require("./store.js");
const AccountRoutes = require("./accountRoutes.js");
const Engine = require("../engine.js");

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basket-recalibrate-cpu-test-"));
  const paths = { solo: path.join(dir, "league.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
  const { league } = store.createMultiManagerCareer(["Lyon M", "Grenoble M"], Date.UTC(2026, 8, 7));
  // Clubs IA « d'avant la baisse de niveau » : ×1,5.
  league.teams.forEach(t => {
    if (t.isHuman) return;
    t.players.forEach(p => { Engine.ATTRS.forEach(a => { p.attrs[a] = Math.min(99, Math.round(p.attrs[a] * 1.5)); }); p.potential = Math.min(99, Math.round(p.potential * 1.5)); });
  });
  const humanBefore = league.teams.filter(t => t.isHuman).map(t => JSON.stringify(t.players.map(p => p.attrs)));
  await store.saveMultiLeague(league, paths.multi);
  const admin = { "X-Admin-Token": "secret-admin" };
  process.env.BASKET_ADMIN_TOKEN = "secret-admin";
  const server = await start(paths, () => now);
  try {
    assert.strictEqual((await request(server, "POST", "/api/admin/recalibrate-cpu", {})).statusCode, 403);

    const dry = await request(server, "POST", "/api/admin/recalibrate-cpu", {}, admin);
    assert.strictEqual(dry.statusCode, 200, JSON.stringify(dry.body));
    assert.strictEqual(dry.body.dryRun, true);
    assert(dry.body.clubsChanged >= 8, `clubs IA à recalibrer : ${dry.body.clubsChanged}`);
    const target = dry.body.leagues[0].target;
    const stored = () => store.loadMultiLeague(paths.multi, dry.body.leagues[0].leagueId).then(r => r.league);
    const cpuAvg = lg => { const cpu = lg.teams.filter(t => !t.isHuman); return cpu.reduce((s, t) => s + t.averageOverall(), 0) / cpu.length; };
    assert(cpuAvg(await stored()) > target * 1.3, "dryRun ne doit rien écrire");
    console.log(`✅ dryRun : ${dry.body.clubsChanged} clubs IA à recalibrer (cible ${target}), rien d'écrit.`);

    const run = await request(server, "POST", "/api/admin/recalibrate-cpu", { dryRun: false }, admin);
    assert.strictEqual(run.statusCode, 200, JSON.stringify(run.body));
    const after = await stored();
    const avg = cpuAvg(after);
    assert(Math.abs(avg - target) < target * 0.06, `moyenne IA ${avg.toFixed(1)} contre cible ${target}`);
    assert.deepStrictEqual(after.teams.filter(t => t.isHuman).map(t => JSON.stringify(t.players.map(p => p.attrs))), humanBefore, "clubs de managers intacts");
    console.log(`✅ Appliqué : clubs IA à ${avg.toFixed(1)} de moyenne (cible ${target}), clubs de managers intacts.`);

    const again = await request(server, "POST", "/api/admin/recalibrate-cpu", { dryRun: false }, admin);
    assert.strictEqual(again.body.clubsChanged, 0, "second passage sans effet");
    console.log("✅ Idempotent : un second passage ne touche plus aucun club.");
  } finally {
    server.close();
  }
  console.log("✅ Recalibrage admin des clubs de l'IA : OK.");
}

main().catch(e => { console.error(e); process.exit(1); });
