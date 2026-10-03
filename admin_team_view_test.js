// Route GET /api/admin/team?name=… (diagnostic, retour utilisateur
// 2026-10-03) : lecture seule de l'effectif complet d'un club, réservée au
// jeton administrateur (X-Admin-Token), rien n'est modifié.
const Engine = require("./engine.js");
const { dailyAnchoredCalendarConfig } = require("./server/calendar.js");
const store = require("./server/store.js");
const { startTestServer } = require("./test_helpers.js");
const T0 = Date.UTC(2026, 8, 22, 7, 0, 0);
const ok = m => console.log("✅ " + m);

(async () => {
  const prev = process.env.BASKET_ADMIN_TOKEN;
  try {
    const league = Engine.generateMultiManagerLeague(["Alpha FC", "Beta FC"], 2, T0, dailyAnchoredCalendarConfig());
    const { server, multiSavePath, baseUrl } = await startTestServer(() => T0);
    await store.saveMultiLeague(league, multiSavePath);
    const get = (name, token) => fetch(`${baseUrl}api/admin/team?name=${encodeURIComponent(name)}`, { headers: token ? { "X-Admin-Token": token } : {} });

    delete process.env.BASKET_ADMIN_TOKEN;
    let r = await get("Beta FC", "x");
    if (r.status !== 403) throw new Error(`❌ sans BASKET_ADMIN_TOKEN : 403 attendu, ${r.status}`);
    process.env.BASKET_ADMIN_TOKEN = "secret-admin-view";
    r = await get("Beta FC", "mauvais");
    if (r.status !== 403) throw new Error(`❌ mauvais jeton : 403 attendu, ${r.status}`);
    r = await get("Beta FC");
    if (r.status !== 403) throw new Error(`❌ sans jeton : 403 attendu, ${r.status}`);
    ok("refusé sans jeton administrateur valide");

    r = await get("Club Fantôme", "secret-admin-view");
    if (r.status !== 404) throw new Error(`❌ club inconnu : 404 attendu, ${r.status}`);
    const before = JSON.stringify((await store.loadMultiLeague(multiSavePath)).league.teams.find(t => t.name === "Beta FC"));
    r = await get("beta fc", "secret-admin-view");
    const body = await r.json();
    if (r.status !== 200 || body.teamName !== "Beta FC" || !body.players.length || !body.players.every(p => p.attrs && Object.keys(p.attrs).length >= 20)) {
      throw new Error(`❌ effectif complet attendu : ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
    }
    const after = JSON.stringify((await store.loadMultiLeague(multiSavePath)).league.teams.find(t => t.name === "Beta FC"));
    if (before !== after) throw new Error("❌ la lecture ne doit rien modifier");
    const d = body.diagnostic;
    if (!d || !d.clubStarters || Object.keys(d.clubStarters).length !== 5 || !Array.isArray(d.plans) || !Array.isArray(d.lastMatches) || !Array.isArray(d.lpOrders)) {
      throw new Error(`❌ diagnostic des ordres attendu : ${JSON.stringify(d)}`);
    }
    ok(`effectif complet de Beta FC (${body.players.length} joueurs, caractéristiques comprises), rien de modifié`);
    server.close();
    console.log("\n✅ admin_team_view_test.js : tout est vert");
    process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
  finally { if (prev === undefined) delete process.env.BASKET_ADMIN_TOKEN; else process.env.BASKET_ADMIN_TOKEN = prev; }
})();
