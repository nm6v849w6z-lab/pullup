// Marché — configurations de recherche (2026-10-09), parcours réel dans
// Chromium : enregistrer les critères, les changer, recharger la
// configuration (critères ET contrôles restaurés, mêmes résultats),
// doublon sans écrasement implicite, renommer, mettre à jour, supprimer,
// conservées après rechargement de la page ; fenêtres en bottom sheet sur
// téléphone (règle UI mobile du projet).
const fs = require("fs");
const { startTestServer } = require("./test_helpers.js");
const ok = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };
let chromium;
try { chromium = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright").chromium; } catch (e) { /* rien */ }
if (!chromium || !fs.existsSync("/opt/pw-browsers/chromium")) { console.log("ℹ️  Chromium absent : vérification navigateur sautée"); process.exit(0); }
(async () => {
  const { server, baseUrl, token } = await startTestServer();
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  try {
    for (const [w, h] of [[1280, 900], [390, 844]]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
      const p = await ctx.newPage();
      const errors = []; p.on("pageerror", e => errors.push(e.message));
      const open = async () => {
        await p.goto(baseUrl + "?m=" + token); await p.waitForFunction(() => window.__gameReady, null, { timeout: 30000 });
        await p.evaluate(() => TAB_HANDLERS.marche());
        await p.waitForSelector("#marketPresetsBar", { timeout: 15000 });
        await p.waitForFunction(() => HM_MARKET_PRESETS.state.presets);
      };
      await open();
      ok(await p.evaluate(() => /Mes recherches/.test(document.getElementById("marketPresetsBar").textContent)), `${w}px : barre « Mes recherches » sur le marché`);
      ok(await p.evaluate(() => document.querySelector("[data-mkp-save]").disabled), `${w}px : rien à enregistrer sans critère`);
      // Critères : pivot, 18-24 ans, potentiel ≥ 3, une caractéristique, tri potentiel.
      const set = await p.evaluate(() => {
        const key = MK_GROUPS[0].keys[0];
        Object.assign(marketUi, { pos: "Pivot", ageMin: 18, ageMax: 30, potMin: null, hideMine: true, sort: "pot", crit: [{ key, min: 1, max: 99 }] });
        renderMarketCritPanel(); renderMarketListings();
        return { key, count: document.getElementById("marketResCount").textContent };
      });
      await p.click("[data-mkp-save]");
      await p.waitForSelector("#mkPresetOverlay input");
      if (w < 500) {
        await p.waitForTimeout(500);   // fin de l'animation d'entrée
        const box = await p.evaluate(() => { const r = document.querySelector("#mkPresetOverlay .upgrade-confirm-box").getBoundingClientRect(); return { bottom: Math.round(r.bottom), w: Math.round(r.width) }; });
        ok(Math.abs(box.bottom - h) <= 2 && box.w >= w - 2, `téléphone : fenêtre ancrée en bas, pleine largeur (bottom sheet) ${JSON.stringify(box)}`);
      }
      await p.fill("#mkPresetName", "Pivots jeunes");
      await p.click("[data-mkp-ok]");
      await p.waitForFunction(() => !document.getElementById("mkPresetOverlay"));
      ok(await p.evaluate(() => HM_MARKET_PRESETS.state.presets.length === 1 && document.querySelector(".mk-preset.on")), `${w}px : configuration enregistrée, marquée active`);
      // Doublon : refus sans écrasement implicite.
      await p.evaluate(() => { marketUi.pos = "Meneur"; renderMarketListings(); });
      await p.click("[data-mkp-save]"); await p.fill("#mkPresetName", "pivots JEUNES"); await p.click("[data-mkp-ok]");
      await p.waitForSelector("[data-mkp-over]");
      ok(await p.evaluate(() => HM_MARKET_PRESETS.state.presets[0].filters.pos === "Pivot"), `${w}px : même nom → proposition de remplacer, rien d'écrasé tant qu'on ne confirme pas`);
      await p.click("[data-mkp-cancel]");
      // Autres critères, puis rechargement de la configuration.
      await p.evaluate(() => { mkResetFilters(); renderMarketCritPanel(); renderMarketListings(); });
      await p.click(".mk-preset-load");
      const back = await p.evaluate(() => ({ u: { pos: marketUi.pos, ageMin: marketUi.ageMin, ageMax: marketUi.ageMax, potMin: marketUi.potMin, hideMine: marketUi.hideMine, sort: marketUi.sort, crit: marketUi.crit.map(c => c.key + ":" + c.min) },
        count: document.getElementById("marketResCount").textContent, sortSel: document.getElementById("marketSort").value,
        budgetBtn: document.getElementById("marketHideMineBtn").getAttribute("aria-pressed"), ageMaxIn: document.getElementById("marketAgeMax") && document.getElementById("marketAgeMax").value }));
      ok(back.u.pos === "Pivot" && back.u.ageMin === 18 && back.u.ageMax === 30 && back.u.potMin === null && back.u.hideMine === true && back.u.sort === "pot" && back.u.crit.join() === set.key + ":1", `${w}px : tous les critères restaurés ${JSON.stringify(back.u)}`);
      ok(/^[1-9]/.test(back.count.trim()) && back.count === set.count, `${w}px : mêmes résultats qu'au moment de l'enregistrement (${back.count.trim()})`);
      ok(back.sortSel === "pot" && back.budgetBtn === "true" && String(back.ageMaxIn) === "30", `${w}px : contrôles de l'écran à jour (tri, « Masquer mes annonces », curseur d'âge)`);
      // Renommer, mettre à jour, supprimer (confirmation).
      await p.click(".mk-preset-more"); await p.fill("#mkPresetName", "Pivots U24"); await p.click('[data-mkp-do="rename"]');
      await p.waitForFunction(() => !document.getElementById("mkPresetOverlay"));
      ok(await p.evaluate(() => HM_MARKET_PRESETS.state.presets[0].name === "Pivots U24"), `${w}px : renommée`);
      await p.evaluate(() => { marketUi.ageMax = 22; renderMarketListings(); });
      await p.click(".mk-preset-more"); await p.click('[data-mkp-do="update"]');
      await p.waitForFunction(() => !document.getElementById("mkPresetOverlay"));
      ok(await p.evaluate(() => HM_MARKET_PRESETS.state.presets[0].filters.ageMax === 22), `${w}px : mise à jour avec les critères actuels`);
      // Conservée après rechargement de la page.
      await open();
      ok(await p.evaluate(() => HM_MARKET_PRESETS.state.presets.length === 1 && HM_MARKET_PRESETS.state.presets[0].name === "Pivots U24"), `${w}px : retrouvée après rechargement`);
      ok(await p.evaluate(() => marketUi.pos === "all"), `${w}px : à l'ouverture, la recherche n'est jamais remplacée d'office`);
      await p.click(".mk-preset-more"); await p.click('[data-mkp-do="delete"]');
      ok(await p.evaluate(() => HM_MARKET_PRESETS.state.presets.length === 1), `${w}px : suppression demandée → confirmation d'abord`);
      await p.click('[data-mkp-do="delete"]');
      await p.waitForFunction(() => !document.getElementById("mkPresetOverlay"));
      ok(await p.evaluate(() => HM_MARKET_PRESETS.state.presets.length === 0), `${w}px : supprimée`);
      ok(!errors.length, `${w}px : aucune erreur (${errors.join(" | ")})`);
      await ctx.close();
    }
  } finally { await b.close(); server.close(); }
  console.log("\n🏁 market_presets_ui_test.js : configurations de recherche du marché.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
