// Tactique du mode Sélection — BUG 2026-10-09 : « des messages apparaissent
// au-dessus des emplacements des remplaçants et les masquent ». Cause : sur
// le terrain (hauteur fixe), la liste des remplaçants d'une carte rétrécit
// jusqu'à 0 quand des messages (hors poste, « X est plus fort… ») s'ajoutent.
// Vérifié dans Chromium, ordinateur et téléphone : la liste garde toute sa
// hauteur, les messages restent sous elle (sur une ligne, texte au survol).
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-layout";
const fs = require("fs");
const { startTestServer } = require("./test_helpers.js");
const ok = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
let chromium;
try { chromium = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright").chromium; } catch (e) { /* rien */ }
if (!chromium || !fs.existsSync("/opt/pw-browsers/chromium")) { console.log("ℹ️  Chromium absent : vérification navigateur sautée"); process.exit(0); }
(async () => {
  const { server, baseUrl, token } = await startTestServer();
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  try {
    const p0 = await (await b.newContext()).newPage();
    await p0.goto(baseUrl + "?m=" + token); await p0.waitForFunction(() => window.__gameReady, null, { timeout: 30000 });
    const club = await p0.evaluate(() => teamA.name);
    const api = baseUrl.replace(/\/?(\?.*)?$/, "/") + "api/admin/national";
    await fetch(api, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ action: "appoint", teamId: "fr-A", club }) });
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const p = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 })).newPage();
      const errors = []; p.on("pageerror", e => errors.push(e.message));
      await p.goto(baseUrl + "?m=" + token); await p.waitForFunction(() => window.__gameReady, null, { timeout: 30000 });
      await p.evaluate(() => HM_NATIONAL_COACH.enterMode("fr-A"));
      await p.waitForFunction(() => HM_NATIONAL_COACH.state.view, null, { timeout: 20000 });
      await p.evaluate(async () => {
        const v = HM_NATIONAL_COACH.state.view;
        const players = (v.pool && v.pool.players || []).slice(0, 12).map(x => ({ p: x.p, n: x.n }));
        await fetch("/api/national/coach/convocation", { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": new URLSearchParams(location.search).get("m") }, body: JSON.stringify({ teamId: "fr-A", gatheringId: v.currentGid, players }) });
      });
      await p.evaluate(() => HM_NATIONAL_COACH.enterMode("fr-A"));
      await p.waitForFunction(() => HM_NATIONAL_COACH.state.view, null, { timeout: 20000 });
      await p.evaluate(() => document.querySelector('#ncSidebar [data-nc-nav="tactique"]').click());
      await p.waitForFunction(() => HM_NATIONAL_COACH.state.tq && document.querySelector("#ncTqGrid .compo-court"), null, { timeout: 20000 });
      // Cas qui masquait les remplaçants : un meneur titulaire au poste de pivot
      // (« Hors poste », « X est plus fort ») et quatre remplaçants.
      await p.evaluate(() => {
        const px = HM_NATIONAL_COACH.state.tq.proxy, pl = px.players;
        const guard = pl.find(x => x.position === "Meneur") || pl[0];
        px.setStarter("Pivot", guard.id);
        pl.filter(x => x.id !== guard.id).slice(0, 4).forEach(x => { px.lineup.backupPositions[x.id] = ["Pivot"]; });
        document.querySelector('#ncSidebar [data-nc-nav="tactique"]').click();
      });
      await p.waitForTimeout(600);
      const cards = await p.evaluate(() => [...document.querySelectorAll("#ncTqGrid .compo-court > .cp-card")].map(c => {
        const bench = c.querySelector(".cp-bench"), warns = c.querySelector(".cp-warns");
        return { bench: bench ? [bench.scrollHeight, bench.clientHeight] : null, benchBottom: bench ? bench.getBoundingClientRect().bottom : 0,
          warnsTop: warns ? warns.getBoundingClientRect().top : null, warns: warns ? warns.children.length : 0,
          oneLine: warns ? [...warns.children].every(x => x.getBoundingClientRect().height < 26 && x.title) : true };
      }));
      const withWarns = cards.filter(c => c.warns);
      ok(withWarns.length > 0, `${w}px : cas reproduit (${withWarns.length} carte(s) avec messages)`);
      ok(cards.every(c => !c.bench || c.bench[1] >= c.bench[0] - 1), `${w}px : la liste des remplaçants garde toute sa hauteur, jamais écrasée (${cards.map(c => c.bench && c.bench.join("/")).join(", ")})`);
      ok(withWarns.every(c => c.warnsTop >= c.benchBottom - 1), `${w}px : les messages sont sous les remplaçants, sans les recouvrir`);
      ok(withWarns.every(c => c.oneLine), `${w}px : messages sur une ligne, texte complet au survol`);
      ok(!errors.length, `${w}px : aucune erreur de page`);
    }
  } finally { await b.close(); server.close(); }
  console.log("\n🏁 nt_tactics_layout_test.js : remplaçants toujours accessibles.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
