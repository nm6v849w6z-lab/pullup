// Mise en scène du direct (bêta liveShows, 2026-10-08) : drapeaux globaux
// (server/featureFlags.js : /api/features, /api/admin/feature-flags), bêta
// par club, matrice d'accès côté client (hors bêta / bêta non premium / bêta
// premium / tout le monde), coach (persisté, par défaut stable), mascotte
// (Premium, gardée mais ignorée si le Premium expire), pub interstitielle
// des non-premium (premium : jamais ; plafond par match ; arrêt trop court ;
// repli silencieux si la pub ne charge pas) et suivi des pubs.
const Engine = require("./engine.js");
const { generateMultiManagerLeague } = Engine;
const { dailyAnchoredCalendarConfig } = require("./server/calendar.js");
const store = require("./server/store.js");
const FeatureFlags = require("./server/featureFlags.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const path = require("path");
const fs = require("fs");

const T0 = Date.UTC(2026, 9, 8, 7, 0, 0);
function fail(msg) { throw new Error("❌ " + msg); }

(async () => {
  const prevAdminToken = process.env.BASKET_ADMIN_TOKEN;
  try {
    FeatureFlags._resetCacheForTests();
    const league = generateMultiManagerLeague(["Testeur BC", "Autre Club"], 2, T0, dailyAnchoredCalendarConfig());
    const { server, multiSavePath, baseUrl, token } = await startTestServer(() => T0);
    league.teams[0].managerLinkToken = token; league.teams[0].isHuman = true;
    await store.saveMultiLeague(league, multiSavePath);
    const api = (p, body, headers = {}) => fetch(`${baseUrl}${p}`, body ? { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": token, ...headers }, body: JSON.stringify(body) } : { headers: { "X-TipIn-Token": token, ...headers } });

    // --- Drapeaux globaux ---
    const f0 = await (await api("api/features")).json();
    // Sortie de bêta (2026-10-09) : direct 2D et mise en scène pour tout le monde.
    if (!f0.ok || f0.liveShows.mode !== "all" || !f0.live2d || f0.live2d.mode !== "all") fail(`défaut : direct 2D et mise en scène pour tout le monde, obtenu ${JSON.stringify({ live2d: f0.live2d, liveShows: f0.liveShows })}.`);
    // Un réglage « whitelist » enregistré avant la sortie de bêta (sans version) ne bloque pas la sortie.
    if (FeatureFlags.normalize({ liveShows: { mode: "whitelist", clubs: ["BC Dia"] } }).liveShows.mode !== "all") fail("ancien réglage « whitelist » : sortie de bêta appliquée.");
    if (FeatureFlags.normalize({ liveShows: { mode: "off" } }).liveShows.mode !== "off") fail("un « off » enregistré reste respecté.");
    if (!(f0.liveShows.coach && f0.liveShows.playerIntro && f0.liveShows.shows)) fail("sous-drapeaux coach / playerIntro / shows actifs par défaut.");
    process.env.BASKET_ADMIN_TOKEN = "secret-flags";
    if ((await api("api/admin/feature-flags", { liveShows: { mode: "all" } }, { "X-Admin-Token": "faux" })).status !== 403) fail("route admin protégée (403).");
    if ((await api("api/admin/feature-flags", { liveShows: { mode: "partout" } }, { "X-Admin-Token": "secret-flags" })).status !== 400) fail("mode inconnu → 400.");
    if ((await api("api/admin/feature-flags", { live2d: { mode: "partout" } }, { "X-Admin-Token": "secret-flags" })).status !== 400) fail("live2d : mode inconnu → 400.");
    const fl = await (await api("api/admin/feature-flags", { live2d: { mode: "whitelist" } }, { "X-Admin-Token": "secret-flags" })).json();
    FeatureFlags._resetCacheForTests();
    const flr = await (await api("api/features")).json();
    if (fl.live2d.mode !== "whitelist" || flr.live2d.mode !== "whitelist") fail("live2d : retour en arrière possible sans redéploiement (whitelist persisté).");
    await api("api/admin/feature-flags", { live2d: { mode: "all" } }, { "X-Admin-Token": "secret-flags" });
    const f1 = await (await api("api/admin/feature-flags", { liveShows: { clubs: ["Testeur BC"], shows: false } }, { "X-Admin-Token": "secret-flags" })).json();
    if (!f1.liveShows) fail("réponse admin : " + JSON.stringify(f1));
    if (!f1.ok || f1.liveShows.clubs.join() !== "Testeur BC" || f1.liveShows.shows !== false || f1.liveShows.coach !== true) fail(`correctif partiel attendu, obtenu ${JSON.stringify(f1.liveShows)}.`);
    FeatureFlags._resetCacheForTests();
    const f2 = await (await api("api/features")).json();
    if (f2.liveShows.clubs.join() !== "Testeur BC" || f2.liveShows.shows !== false) fail("les drapeaux doivent être persistés (sans redéploiement).");
    await api("api/admin/feature-flags", { liveShows: { shows: true, mode: "whitelist" } }, { "X-Admin-Token": "secret-flags" });
    const bf = await api("api/admin/beta-feature", { teamName: "Autre Club", feature: "liveShows", enabled: true }, { "X-Admin-Token": "secret-flags" });
    if (bf.status !== 200) fail("la bêta par club accepte « liveShows ».");
    console.log("✅ Drapeaux : défaut tout le monde (direct 2D + mise en scène), retour en arrière possible, route admin (403/400/200), correctif partiel persisté, bêta par club liveShows.");

    // --- Coach : ouvert à tous, persisté ---
    const coachLook = { skin: 3, face: 2, eyes: 1, hairStyle: "slick", hairColor: 2, beard: "short", outfit: "tracksuit", accessory: "glasses" };
    const rc = await (await api("api/club/set-coach-look", { coachLook })).json();
    if (!rc.ok || rc.coachLook.outfit !== "tracksuit" || rc.coachLook.accessory !== "glasses") fail(`set-coach-look attendu ok pour un club gratuit, obtenu ${JSON.stringify(rc)}.`);
    const bad = await (await api("api/club/set-coach-look", { coachLook: { outfit: "pyjama", accessory: "sabre", skin: 99 } })).json();
    if (bad.coachLook.outfit !== "suit" || bad.coachLook.accessory !== "none" || bad.coachLook.skin !== null) fail("valeurs inconnues ramenées aux valeurs par défaut.");
    await api("api/club/set-coach-look", { coachLook });
    let saved = (await store.loadMultiLeague(multiSavePath)).league;
    if (saved.teams[0].coachLook.hairStyle !== "slick") fail("Team.coachLook doit survivre à la sauvegarde.");
    console.log("✅ Coach : personnalisable sans Premium, valeurs normalisées, persisté.");

    // --- Mascotte : Premium seulement, gardée si le Premium expire ---
    const mascot = { species: "dragon", name: "Krauty", number: 23, accessory: "couronne", celebration: "dab", primary: "#123456" };
    const m0 = await (await api("api/club/set-mascot", { mascot })).json();
    if (m0.ok !== false) fail("sans Premium, la mascotte personnalisée est refusée.");
    await api("api/club/set-paying", { isPaying: true });
    const m1 = await (await api("api/club/set-mascot", { mascot })).json();
    if (!m1.ok || m1.mascot.species !== "dragon" || m1.mascot.number !== 23) fail(`avec Premium, mascotte enregistrée, obtenu ${JSON.stringify(m1)}.`);
    await api("api/club/set-paying", { isPaying: false });
    saved = (await store.loadMultiLeague(multiSavePath)).league;
    const t0 = saved.teams[0];
    if (!t0.mascot || t0.mascot.species !== "dragon") fail("Premium expiré : la mascotte reste enregistrée.");
    if (Engine.mascotFor(t0, T0) !== null) fail("Premium expiré : mascotFor revient à la mascotte par défaut (null).");
    t0.isPaying = true;
    if (!Engine.mascotFor(t0, T0) || Engine.mascotFor(t0, T0).name !== "Krauty") fail("Premium retrouvé : la mascotte revient.");
    console.log("✅ Mascotte : Premium seulement ; Premium perdu → mascotte par défaut sans effacer la personnalisée.");

    // --- Suivi des pubs ---
    if ((await api("api/ads/track", { event: "pirouette" })).status !== 400) fail("événement de pub inconnu → 400.");
    const tr = await (await api("api/ads/track", { event: "impression", placement: "liveShow", show: "pompom" })).json();
    if (!tr.ok) fail("suivi d'une impression attendu.");
    const pend = JSON.stringify(FeatureFlags.AdsStats._pending());
    if (!/liveShow:pompom:impression/.test(pend)) fail(`compteur d'impressions attendu, obtenu ${pend}.`);
    await FeatureFlags.AdsStats.flush(store, multiSavePath);
    const stats = await store.loadWorldAuxRaw("adsstats", multiSavePath);
    if (!stats || !JSON.stringify(stats).includes("liveShow:pompom:impression")) fail("les compteurs de pub doivent être enregistrés.");
    console.log("✅ Suivi des pubs : impression comptée et enregistrée, événement inconnu refusé.");

    // --- Côté client : matrice d'accès, coach par défaut stable, pub ---
    const html = fs.readFileSync(path.join(__dirname, "moteurbasket3.html"), "utf-8");
    const game = await openGame(html, baseUrl);
    const w = game.window;
    const flagsFor = (ls, beta) => w.eval(`(() => { HM_FEATURES = { ok: true, liveShows: ${JSON.stringify(ls)} }; teamA.betaFeatures = ${JSON.stringify(beta || [])}; return !!hmLiveShowsFlags(); })()`);
    const base = { coach: true, playerIntro: true, shows: true, ads: { enabled: true, maxPerMatch: 1, minStoppageMs: 25000 } };
    if (flagsFor({ ...base, mode: "whitelist", clubs: ["Gotham Knights"] })) fail("hors bêta : aucune mise en scène.");
    if (!flagsFor({ ...base, mode: "whitelist", clubs: ["Testeur BC"] })) fail("club de la liste : mise en scène active.");
    if (!flagsFor({ ...base, mode: "whitelist", clubs: [] }, ["liveShows"])) fail("bêta par club (betaFeatures) : mise en scène active.");
    if (!flagsFor({ ...base, mode: "all", clubs: [] })) fail("mode « all » : tout le monde.");
    if (flagsFor({ ...base, mode: "off", clubs: ["Testeur BC"] })) fail("mode « off » : coupé pour tous.");
    console.log("✅ Matrice d'accès : hors bêta non, liste oui, bêta club oui, tout le monde oui, coupé non.");

    // Apparence identique (les SVG ne diffèrent que par leurs identifiants internes).
    const c1 = w.eval("JSON.stringify(AvatarGen.coachSpec(coachSeedFor(teamB), null))"), c2 = w.eval("JSON.stringify(AvatarGen.coachSpec(coachSeedFor({ name: teamB.name }), null))");
    if (!w.eval("coachAvatarFor(teamB, null)") || c1 !== c2) fail("coach par défaut : le même à chaque match (graine du nom du club).");
    const strip = s => String(s).replace(/(tx|eye|grad|clip|g)\d+/g, "$1");
    if (w.eval("coachSeedFor({ name: 'Autre Club' })") !== w.eval("coachSeedFor({ name: 'Autre Club' })")) fail("graine du coach stable.");
    if (strip(w.eval("coachAvatarFor(teamA)")) === strip(w.eval("coachAvatarFor(teamA, null)"))) fail("le coach personnalisé du club est utilisé en direct.");
    console.log("✅ Coach : par défaut stable, personnalisé utilisé en direct.");

    // Pub : premium jamais ; non premium → une pub, plafond, arrêt trop court, repli.
    w.eval(`window.__tracked = []; hmAdsTrack = (e, d) => window.__tracked.push(e + ":" + (d && d.status || ""));`);
    const ad = (premium, remainingMs, adOk) => w.eval(`(() => {
      teamA.isPaying = ${premium}; teamA.premiumUntil = null;
      window.HM_ADS = ${adOk ? "{ client: 'ca-pub-test' }" : "null"};
      window.adBreak = ${adOk ? "(o) => o.adBreakDone({ breakStatus: 'viewed' })" : "undefined"};
      window.adConfig = () => {};
      return hmLiveShowAd({ show: "pompom", remainingMs: ${remainingMs} }, { ads: { enabled: true, maxPerMatch: 1, minStoppageMs: 25000 } });
    })()`);
    if (ad(true, 55000, true)) fail("premium : aucune pub.");
    if (ad(false, 55000, false)) fail("pub indisponible : rien d'affiché (le show continue seul).");
    if (!w.__tracked.some(x => x.startsWith("failure"))) fail("échec de chargement suivi (failure).");
    if (ad(false, 10000, true)) fail("arrêt trop court : pas de pub (elle doit finir avant la reprise).");
    if (!ad(false, 55000, true)) fail("non premium : une pub superposée au show.");
    await new Promise(r => setTimeout(r, 50));
    if (!w.__tracked.includes("impression:viewed")) fail(`impression suivie attendue, obtenu ${w.__tracked}.`);
    if (ad(false, 55000, true)) fail("plafond par match atteint : pas de seconde pub.");
    await w.close();
    console.log("✅ Pub : jamais en Premium, une par arrêt non premium, plafond par match, arrêt trop court, repli si échec, suivi.");

    server.close();
    console.log("\n✅ Accès et persistance de la mise en scène vérifiés.");
  } finally {
    if (prevAdminToken === undefined) delete process.env.BASKET_ADMIN_TOKEN; else process.env.BASKET_ADMIN_TOKEN = prevAdminToken;
  }
})().catch(err => { console.error(err.message || err); process.exit(1); });
