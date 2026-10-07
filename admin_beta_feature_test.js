// Bêta par club (2026-10-07, « possible d'ajouter uniquement ce mode à un
// seul joueur, pour qu'il puisse tester avant le passage en prod complet ? ») :
// POST /api/admin/beta-feature active une fonctionnalité (ici le terrain
// animé du direct, « live2d ») pour UN club de la ligue partagée. Vérifie la
// route (403 sans jeton, 400 fonctionnalité inconnue, 404 club inconnu,
// activation puis retrait), la persistance (Team.betaFeatures survit à la
// sauvegarde) et le côté client : seul le club en bêta voit le sélecteur
// Terrain / Carte des tirs et le terrain animé, les autres gardent la carte
// des tirs seule.
const Engine = require("./engine.js");
const { generateMultiManagerLeague } = Engine;
const { dailyAnchoredCalendarConfig } = require("./server/calendar.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const { JSDOM } = require("jsdom");
const path = require("path");
const { pathToFileURL } = require("url");

const T0 = Date.UTC(2026, 9, 7, 7, 0, 0);
function fail(msg) { throw new Error("❌ " + msg); }

(async () => {
  const prevAdminToken = process.env.BASKET_ADMIN_TOKEN;
  try {
    const league = generateMultiManagerLeague(["Testeur BC", "Autre Club"], 2, T0, dailyAnchoredCalendarConfig());
    const { server, multiSavePath, baseUrl, token } = await startTestServer(() => T0);
    // Le jeton du serveur de test désigne league.teams[0] : on le garde sur notre club testeur.
    league.teams[0].managerLinkToken = token; league.teams[0].isHuman = true;
    await store.saveMultiLeague(league, multiSavePath);
    const post = (body, token) => fetch(`${baseUrl}api/admin/beta-feature`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "X-Admin-Token": token } : {}) }, body: JSON.stringify(body),
    });

    delete process.env.BASKET_ADMIN_TOKEN;
    if ((await post({ teamName: "Testeur BC", feature: "live2d" }, "x")).status !== 403) fail("sans BASKET_ADMIN_TOKEN, la route doit répondre 403.");
    process.env.BASKET_ADMIN_TOKEN = "secret-beta";
    if ((await post({ teamName: "Testeur BC", feature: "live2d" }, "faux")).status !== 403) fail("mauvais jeton → 403.");
    if ((await post({ teamName: "Testeur BC", feature: "jetpack" }, "secret-beta")).status !== 400) fail("fonctionnalité inconnue → 400.");
    if ((await post({ teamName: "Club Fantôme", feature: "live2d" }, "secret-beta")).status !== 404) fail("club inconnu → 404.");
    console.log("✅ Route protégée : 403 sans/mauvais jeton, 400 fonctionnalité inconnue, 404 club inconnu.");

    const on = await post({ teamName: "Testeur BC", feature: "live2d", enabled: true }, "secret-beta");
    const onBody = await on.json();
    if (on.status !== 200 || !onBody.ok || !onBody.betaFeatures.includes("live2d")) fail(`activation attendue 200/ok avec live2d, obtenu ${on.status} ${JSON.stringify(onBody)}.`);
    let saved = (await store.loadMultiLeague(multiSavePath)).league;
    const tester = saved.teams.find(t => t.name === "Testeur BC"), other = saved.teams.find(t => t.name === "Autre Club");
    if (!tester.hasBetaFeature("live2d")) fail("Team.betaFeatures doit être persisté (hasBetaFeature('live2d') après rechargement).");
    if (other.hasBetaFeature("live2d")) fail("l'autre club ne doit pas avoir la bêta.");
    console.log("✅ Activation pour un seul club, persistée dans la sauvegarde ; l'autre club n'a rien.");

    // --- Côté client : le club rechargé dans le navigateur porte bien le drapeau
    // (la copie de Team embarquée dans moteurbasket3.html doit le désérialiser).
    const html0 = require("fs").readFileSync(path.join(__dirname, "moteurbasket3.html"), "utf-8");
    const game = await openGame(html0, baseUrl);
    const flag = game.window.eval('typeof teamA.hasBetaFeature === "function" && teamA.hasBetaFeature("live2d")');
    await game.window.close();
    if (flag !== true) fail("dans le navigateur, teamA.hasBetaFeature('live2d') doit être vrai pour le club en bêta.");
    console.log("✅ Le navigateur relit le drapeau bêta sur le club (Team embarquée dans la page).");

    // --- Côté client : la vue live n'ouvre le terrain animé qu'au club en bêta.
    const dom = new JSDOM(`<!doctype html><div id="root"></div>`, { pretendToBeVisual: true, runScripts: "outside-only" });
    const { window } = dom;
    const html = require("fs").readFileSync(path.join(__dirname, "moteurbasket3.html"), "utf-8");
    if (!/court2d: !!\(teamA && typeof teamA\.hasBetaFeature === "function" && teamA\.hasBetaFeature\("live2d"\)\)/.test(html)) fail("l'adaptateur doit passer court2d = teamA.hasBetaFeature('live2d') à createLiveView.");
    const view = require("fs").readFileSync(path.join(__dirname, "assets/live/live-view.js"), "utf-8");
    if (!/const court2dAllowed = opts\.court2d !== false;/.test(view) || !/view: court2dAllowed \? "2d" : "chart"/.test(view)) fail("live-view doit ouvrir sur la carte des tirs quand opts.court2d === false.");
    if (!/seg\.toggleAttribute\("hidden", !court2dAllowed\)/.test(view)) fail("le sélecteur Terrain / Carte des tirs doit être masqué hors bêta.");
    window.close();
    console.log("✅ Client : terrain animé et sélecteur réservés au club en bêta, carte des tirs seule pour les autres.");

    const off = await post({ teamName: "Testeur BC", feature: "live2d", enabled: false }, "secret-beta");
    if (off.status !== 200 || (await off.json()).betaFeatures.length !== 0) fail("le retrait doit vider betaFeatures.");
    saved = (await store.loadMultiLeague(multiSavePath)).league;
    if (saved.teams.find(t => t.name === "Testeur BC").hasBetaFeature("live2d")) fail("après retrait, plus de bêta.");
    console.log("✅ Retrait de la bêta persisté.");

    server.close();
    console.log("\n✅ Bêta par club vérifiée : route admin, persistance, gating côté client.");
  } finally {
    if (prevAdminToken === undefined) delete process.env.BASKET_ADMIN_TOKEN; else process.env.BASKET_ADMIN_TOKEN = prevAdminToken;
  }
})().catch(err => { console.error(err.message || err); process.exit(1); });
