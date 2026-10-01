// Favoris de la barre latérale réordonnables (suggestion Discord 2026-10-01,
// « rearrange/move the bookmark so you can have them in whatever order you
// want »). Dans un vrai navigateur (Chromium) : 3 favoris épinglés ; la
// poignée ⋮⋮ glissée à la souris déplace un favori, ordre gardé après
// rechargement ; au clavier ↑/↓ sur la poignée ; au doigt (écran tactile,
// tiroir du menu mobile) ; la poignée n'ouvre pas la page ; un seul favori
// = pas de poignée.
const fs = require("fs");
const { startTestServer } = require("./test_helpers.js");

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

(async () => {
  let chromium;
  try { chromium = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright").chromium; } catch (e) { /* rien */ }
  if (!chromium || !fs.existsSync("/opt/pw-browsers/chromium")) { console.log("ℹ️  Chromium absent : test sauté"); process.exit(0); }
  const { server, baseUrl, token } = await startTestServer();
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const order = p => p.evaluate(() => [...document.querySelectorAll("#sidebarFavs .sidebar-item")].map(x => x.dataset.favKey));
  const stored = p => p.evaluate(() => JSON.parse(localStorage.getItem("hm-sidebar-favs")));
  const open = async (ctx) => {
    const p = await ctx.newPage();
    await p.goto(baseUrl + "?m=" + token);
    await p.waitForFunction(() => window.__gameReady, null, { timeout: 30000 });
    return p;
  };
  try {
    // --- Souris (ordinateur).
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("hm-sidebar-favs", JSON.stringify(["effectif"])); } });
    let p = await open(ctx);
    assert(await p.locator("#sidebarFavs [data-fav-grip]").count() === 0, "un seul favori : pas de poignée");
    await p.evaluate(() => localStorage.setItem("hm-sidebar-favs", JSON.stringify(["effectif", "calendrier", "economie"])));
    await p.evaluate(() => renderSidebarFavs());
    assert((await order(p)).join() === "effectif,calendrier,economie", "3 favoris dans l'ordre d'ajout");
    const grip = p.locator('#sidebarFavs [data-fav-grip="economie"]');
    const first = await p.locator('#sidebarFavs [data-fav-key="effectif"]').boundingBox();
    const gb = await grip.boundingBox();
    await p.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await p.mouse.down();
    for (let y = gb.y + gb.height / 2; y >= first.y + 2; y -= 6) await p.mouse.move(gb.x + gb.width / 2, y);
    await p.mouse.up();
    assert((await order(p)).join() === "economie,effectif,calendrier", "souris : Finances glissé tout en haut (" + (await order(p)).join() + ")");
    assert((await stored(p)).join() === "economie,effectif,calendrier", "nouvel ordre enregistré");
    assert(!(await p.evaluate(() => document.querySelector('.tab-btn.active[data-tab="economie"]'))), "glisser la poignée n'ouvre pas la page");
    await p.reload();
    await p.waitForFunction(() => window.__gameReady, null, { timeout: 30000 });
    assert((await order(p)).join() === "economie,effectif,calendrier", "ordre gardé après rechargement");
    // --- Clavier.
    await p.locator('#sidebarFavs [data-fav-grip="calendrier"]').focus();
    await p.keyboard.press("ArrowUp");
    assert((await order(p)).join() === "economie,calendrier,effectif", "clavier : ↑ sur la poignée remonte Calendrier d'un cran");
    assert(await p.evaluate(() => document.activeElement && document.activeElement.dataset.favGrip === "calendrier"), "le focus reste sur la poignée déplacée");
    await p.keyboard.press("ArrowDown"); await p.keyboard.press("ArrowDown");
    assert((await order(p)).join() === "economie,effectif,calendrier", "clavier : ↓ ↓ le redescend (sans dépasser la fin)");
    await ctx.close();

    // --- Doigt (téléphone, tiroir du menu).
    const mctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mctx.addInitScript(() => { localStorage.setItem("hm-sidebar-favs", JSON.stringify(["effectif", "calendrier", "economie"])); });
    p = await open(mctx);
    await p.evaluate(() => document.body.classList.add("m-drawer-open"));
    await p.waitForTimeout(300);
    const g2 = await p.locator('#sidebarFavs [data-fav-grip="effectif"]').boundingBox();
    const last = await p.locator('#sidebarFavs [data-fav-key="economie"]').boundingBox();
    assert(g2 && g2.width > 0, "poignée visible dans le menu mobile");
    const cdp = await mctx.newCDPSession(p);
    const touch = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: g2.x + g2.width / 2, y }] });
    await touch("touchStart", g2.y + g2.height / 2);
    for (let y = g2.y + g2.height / 2; y <= last.y + last.height - 2; y += 6) await touch("touchMove", y);
    await touch("touchEnd");
    await p.waitForTimeout(100);
    assert((await order(p)).join() === "calendrier,economie,effectif", "doigt : Effectif glissé tout en bas (" + (await order(p)).join() + ")");
    await mctx.close();
  } finally { await b.close(); server.close(); }
  console.log("✅ Favoris réordonnables vérifiés.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
