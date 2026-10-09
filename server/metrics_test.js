"use strict";
// Mesures serveur (server/metrics.js) : temps par route, verrou, ligues ;
// lecture réservée à l'admin (X-Admin-Token), page /admin/metrics.
const http = require("http"), fs = require("fs"), os = require("os"), path = require("path");
const { createHandler } = require("./index.js");
const check = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };
const req = (port, method, p, body, h) => new Promise((res, rej) => {
  const payload = body ? JSON.stringify(body) : null;
  const r = http.request({ host: "127.0.0.1", port, path: p, method, headers: { ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}), ...(h || {}) } }, rs => { let s = ""; rs.on("data", c => s += c); rs.on("end", () => { let j = null; try { j = JSON.parse(s); } catch (e) { /* HTML */ } res({ status: rs.statusCode, body: j, raw: s }); }); });
  r.on("error", rej); if (payload) r.write(payload); r.end();
});
(async () => {
  process.env.BASKET_ADMIN_TOKEN = "adm-metrics";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-test-"));
  const server = http.createServer(createHandler(path.join(dir, "league.json"), Date.now, path.join(dir, "multi.json"), path.join(dir, "acc.json")));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port, A = { "X-Admin-Token": "adm-metrics" };
  const boot = await req(port, "POST", "/api/admin/new-multi-league", { teamNames: ["A", "B"] }, A);
  const tok = boot.body.managers[0].token;
  for (let i = 0; i < 3; i++) await req(port, "GET", "/api/live-status", null, { "X-TipIn-Token": tok });
  check((await req(port, "GET", "/api/admin/metrics")).status === 403, "mesures : refusées sans jeton admin");
  const m = await req(port, "GET", "/api/admin/metrics", null, A);
  const names = m.body.series.map(s => s.name);
  check(m.status === 200 && names.includes("GET /api/live-status") && m.body.series.find(s => s.name === "GET /api/live-status").count === 3, "temps par route (3 × GET /api/live-status)");
  check(names.includes("verrou · attente") && names.includes("verrou · tenu") && names.includes("ligue · chargement"), "verrou et chargements de ligue mesurés");
  check(m.body.memoryMb && m.body.memoryMb.rss > 0, "mémoire du serveur");
  const pg = await req(port, "GET", "/admin/metrics");
  check(pg.status === 200 && /Mesures serveur/.test(pg.raw) && !/adm-metrics/.test(pg.raw), "page admin (jeton saisi dans la page, jamais dans l'URL)");
  await req(port, "POST", "/api/admin/metrics?reset=1", {}, A);
  const m2 = await req(port, "GET", "/api/admin/metrics", null, A);
  check(!m2.body.series.some(s => s.name === "GET /api/live-status"), "remise à zéro");
  server.close();
  console.log("\n🏁 metrics_test.js : mesures serveur vérifiées.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
