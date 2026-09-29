// =====================================================================
// Vraies pubs (Google H5 Games Ads) — voir server/ads.js et hmAds* dans
// moteurbasket3.html. Demande utilisateur (2026-09-27) : "ajouter les pubs
// aux endroits prévus". Partie A : server/ads.js. Partie B : routes HTTP
// (/, /bienvenue, /ads.txt) avec et sans ADSENSE_CLIENT. Partie C :
// navigateur (jsdom) avec un faux adBreak — pub récompensée du Scouting Pro
// (vue / fermée / indisponible) et coupure des Hoop Shows.
// =====================================================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const Engine = require("./engine.js");
const Ads = require("./server/ads.js");
const store = require("./server/store.js");
const { createHandler } = require("./server/index.js");
const { openGame, patchDateNow } = require("./test_helpers.js");
const { generateTeam, generateLeague, simulateOrForfeit, recordMatchStatsAndAwardMvp } = Engine;

const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const T0 = Date.UTC(2026, 8, 7);
function assertTrue(cond, label) { if (!cond) throw new Error(`❌ ${label}`); }

function freshLeagueWithRounds(n) {
  const lg = generateLeague(generateTeam("Pub FC", 1.0), 1, T0);
  for (let r = 0; r < n; r++) {
    lg.matchesForRound(r).forEach(m => {
      const home = lg.teams[m.home], away = lg.teams[m.away];
      const res = simulateOrForfeit(home, away, T0);
      lg.recordResult(r, m.home, m.away, res.scoreHome, res.scoreAway);
      if (!res.forfeit) recordMatchStatsAndAwardMvp(home, away, r, "championship", T0, res.quarterScores, res.tacticsUsed);
    });
  }
  lg.round = n;
  return lg;
}

async function get(baseUrl, p) {
  const res = await fetch(new URL(p, baseUrl));
  return { status: res.status, text: await res.text() };
}

(async () => {
  // ---------------- PARTIE A : server/ads.js ----------------
  assertTrue(Ads.adsConfig({}) === null, "A: pas de config sans ADSENSE_CLIENT");
  assertTrue(Ads.adsConfig({ ADSENSE_CLIENT: "pub-123" }) === null, "A: ID mal formé ignoré");
  const cfg = Ads.adsConfig({ ADSENSE_CLIENT: " ca-pub-1234567890123456 ", ADSENSE_TEST: "1" });
  assertTrue(cfg && cfg.client === "ca-pub-1234567890123456" && cfg.test === true, "A: config lue (ID + test)");
  assertTrue(Ads.adsTxt(cfg) === "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n", "A: ads.txt");
  const injected = Ads.injectHead("<html><head><title>x</title></head><body></body></html>", cfg);
  assertTrue(/window\.HM_ADS=.*<\/script><\/head>/.test(injected) && !injected.includes("adsbygoogle.js"), "A: jeu = config + shim, SANS le script (chargé après connexion)");
  const content = Ads.injectHead("<head></head>", cfg, { withApi: false });
  assertTrue(!content.includes("HM_ADS") && /data-ad-client="ca-pub-1234567890123456" data-adbreak-test="on"[^>]*adsbygoogle\.js\?client=ca-pub-1234567890123456/.test(content), "A: pages de contenu = script seul");
  assertTrue(Ads.injectHead("<head></head>", null) === "<head></head>", "A: rien sans config");
  console.log("✅ A : server/ads.js");

  // ---------------- PARTIE B : routes HTTP ----------------
  const lg = freshLeagueWithRounds(3);
  const savePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-ads-test-")), "league.json");
  const multiPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-ads-test-multi-")), "multi-league.json");
  // Ligue en ligne d'un seul manager (plus de carrière solo).
  await store.saveMultiLeague(lg, multiPath);
  const clock = { now: T0 + 60000 };
  const server = http.createServer(createHandler(savePath, () => clock.now, multiPath));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const prevClient = process.env.ADSENSE_CLIENT, prevTest = process.env.ADSENSE_TEST;
  try {
    delete process.env.ADSENSE_CLIENT; delete process.env.ADSENSE_TEST;
    let r = await get(baseUrl, "/");
    assertTrue(r.status === 200 && !r.text.includes("data-ad-client=\"ca-pub") && !r.text.includes("window.HM_ADS={"), "B1: sans ADSENSE_CLIENT, aucune pub injectée");
    r = await get(baseUrl, "/ads.txt");
    assertTrue(r.status === 404, "B1: /ads.txt en 404 sans config");

    process.env.ADSENSE_CLIENT = "ca-pub-1234567890123456";
    r = await get(baseUrl, "/");
    assertTrue(r.text.includes('window.HM_ADS={"client":"ca-pub-1234567890123456","test":false}') && !r.text.includes('data-ad-client="ca-pub'), "B2: jeu = config seule, pas de script AdSense dans la coquille");
    r = await get(baseUrl, "/bienvenue");
    assertTrue(r.status === 200 && !r.text.includes("adsbygoogle.js?client") && !r.text.includes("window.HM_ADS={"), "B2: écran d'inscription sans AdSense");
    r = await get(baseUrl, "/le-jeu");
    assertTrue(r.status === 200 && r.text.includes('adsbygoogle.js?client=ca-pub-1234567890123456'), "B2: pages de contenu avec le script AdSense");
    r = await get(baseUrl, "/ads.txt");
    assertTrue(r.status === 200 && r.text.trim() === "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0", "B2: /ads.txt servi");
    process.env.ADSENSE_TEST = "1";
    r = await get(baseUrl, "/");
    assertTrue(r.text.includes('"test":true'), "B3: ADSENSE_TEST=1 → pubs de test (jeu)");
    r = await get(baseUrl, "/faq");
    assertTrue(r.text.includes('data-adbreak-test="on"'), "B3: ADSENSE_TEST=1 → pubs de test (pages)");
    console.log("✅ B : routes HTTP");
  } finally {
    if (prevClient === undefined) delete process.env.ADSENSE_CLIENT; else process.env.ADSENSE_CLIENT = prevClient;
    if (prevTest === undefined) delete process.env.ADSENSE_TEST; else process.env.ADSENSE_TEST = prevTest;
  }

  // ---------------- PARTIE C : navigateur, faux adBreak ----------------
  try {
    const m = lg.matchesForRound(0).find(x => x.home === 0 || x.away === 0);
    const oppIdx = m.home === 0 ? m.away : m.home;
    const fake = { mode: "unavailable", calls: [] };
    const dom = await openGame(html, `${baseUrl}?m=${lg.teams[0].managerLinkToken}`, (window) => {
      patchDateNow(window, () => clock.now);
      window.HM_ADS = { client: "ca-pub-1234567890123456", test: true };
      window.adConfig = (o) => fake.calls.push({ config: o });
      window.adBreak = (o) => {
        fake.calls.push(o);
        setTimeout(() => {
          if (o.type === "reward") {
            if (fake.mode === "unavailable") { o.adBreakDone({ breakStatus: "notReady" }); return; }
            o.beforeReward(() => {
              if (fake.mode === "viewed") o.adViewed(); else o.adDismissed();
              o.adBreakDone({ breakStatus: fake.mode });
            });
          } else {
            o.adBreakDone({ breakStatus: "viewed" });
          }
        }, 0);
      };
    });
    const win = dom.window, doc = win.document;
    const tick = () => new Promise(r => setTimeout(r, 5));
    async function openAnalyse() {
      win.showTeamDetail(oppIdx);
      win.eval('document.querySelector("[data-team-detail-subview=\'analyse\']").dispatchEvent(new Event("click", {bubbles:true}));');
      await win.__lastScoutingProCheck;
    }
    async function waitFor(fn, label) {
      for (let i = 0; i < 200; i++) { if (fn()) return; await tick(); }
      throw new Error(`❌ ${label} (délai dépassé)`);
    }

    // Manager identifié (plus de carrière solo sans jeton) : le script AdSense
    // est chargé une fois la page prête.
    assertTrue(!!doc.querySelector('script[src*="adsbygoogle"]'), "C0: manager identifié, adsbygoogle.js chargé");
    await openAnalyse();
    // C1) Aucune pub disponible → message, bouton réactivé, rien débloqué.
    fake.mode = "unavailable";
    doc.getElementById("scoutingProWatchAdBtn").dispatchEvent(new win.Event("click", { bubbles: true }));
    await win.__lastScoutingAdOpen;
    assertTrue(fake.calls.some(c => c.config && c.config.preloadAdBreaks === "on"), "C1: adConfig appelé");
    assertTrue(fake.calls.some(c => c.type === "reward" && c.name === "scouting-pro"), "C1: adBreak reward demandé");
    assertTrue(!doc.getElementById("scoutingAdOverlay"), "C1: fenêtre refermée");
    assertTrue(/Aucune pub disponible/.test(doc.getElementById("scoutingProFeedback").textContent), "C1: message « aucune pub »");
    assertTrue(!doc.getElementById("scoutingProWatchAdBtn").disabled, "C1: bouton réactivé");

    // C2) Pub fermée avant la fin → pas de rapport.
    fake.mode = "dismissed";
    doc.getElementById("scoutingProWatchAdBtn").dispatchEvent(new win.Event("click", { bubbles: true }));
    await waitFor(() => { const b = doc.getElementById("scoutingAdPlay"); return b && !b.disabled; }, "C2: bouton « Regarder la pub » actif");
    assertTrue(!doc.querySelector(".scouting-ad-gray-block"), "C2: plus d'écran gris factice avec la vraie régie");
    doc.getElementById("scoutingAdPlay").click();
    await win.__lastScoutingAdOpen;
    assertTrue(/fermée avant la fin/.test(doc.getElementById("scoutingProFeedback").textContent), "C2: message « pub fermée »");
    assertTrue(!!doc.getElementById("scoutingProWatchAdBtn"), "C2: toujours verrouillé");

    // C3) Pub vue en entier → rapport complet débloqué.
    fake.mode = "viewed";
    doc.getElementById("scoutingProWatchAdBtn").dispatchEvent(new win.Event("click", { bubbles: true }));
    await waitFor(() => { const b = doc.getElementById("scoutingAdPlay"); return b && !b.disabled; }, "C3: bouton « Regarder la pub » actif");
    doc.getElementById("scoutingAdPlay").click();
    await win.__lastScoutingAdOpen;
    await win.__lastScoutingProCheck;
    const panel = doc.getElementById("scoutingProPanel");
    assertTrue(!doc.getElementById("scoutingProWatchAdBtn") && /Classement|Confrontations/.test(panel.innerHTML), "C3: rapport complet après la pub vue");
    console.log("✅ C1-C3 : Scouting Pro avec la vraie régie (indisponible / fermée / vue)");

    // C4) Coupure Hoop Show : adBreak « pause » nommé d'après le slot, résout.
    const el = doc.createElement("div");
    await win.hoopShowOnAd({ element: el, slot: "halftime" });
    assertTrue(fake.calls.some(c => c.type === "pause" && c.name === "hoopshow-halftime"), "C4: adBreak pause hoopshow-halftime");
    assertTrue(!el.textContent.includes("factice"), "C4: plus de « Publicité (factice) »");

    // C5) Appli native (Capacitor) → retour au factice, jamais AdSense.
    win.Capacitor = { isNativePlatform: () => true };
    const n = fake.calls.length;
    const el2 = doc.createElement("div");
    const p = win.hoopShowOnAd({ element: el2, slot: "prematch" });
    assertTrue(el2.textContent.includes("factice") && fake.calls.length === n, "C5: appli native = pub factice, aucun adBreak");
    clock.now += 21000; win.__hoopShowAdTickForTests(); await p;
    console.log("✅ C4-C5 : Hoop Shows (coupure réelle, repli factice dans l'appli native)");
    dom.window.close();
  } finally {
    server.close();
  }
  console.log("✅ ads_integration_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
