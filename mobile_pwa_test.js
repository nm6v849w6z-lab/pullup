// Application mobile (PWA, 2026-09-25 — retour utilisateur : "réfléchis à
// l'application mobile et prépare le code"). Vérifie : manifest servi à la
// racine avec le jeton manager recopié dans start_url (et un jeton douteux
// ignoré), service worker servi à la racine sans cache, balises <head> de la
// page (manifest, icônes, couche mobile APRÈS la grande feuille de style),
// fichiers d'icônes présents, et barre d'onglets du bas construite par
// mobile.js avec de vrais .tab-btn qui naviguent comme la barre latérale.
const fs = require("fs");
const path = require("path");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

(async () => {
const { server, baseUrl } = await startTestServer();

let res = await fetch(baseUrl + "manifest.webmanifest?m=abc_DEF-123");
const manifest = await res.json();
assert(res.status === 200 && (res.headers.get("content-type") || "").includes("application/manifest+json"), "Manifest servi à la racine en application/manifest+json");
assert(manifest.start_url === "/?m=abc_DEF-123", "start_url reprend le jeton manager (" + manifest.start_url + ")");
assert(manifest.display === "standalone" && manifest.icons.some(i => i.purpose === "maskable"), "Manifest : plein écran + icône maskable");
res = await fetch(baseUrl + "manifest.webmanifest?m=" + encodeURIComponent("<script>"));
assert((await res.json()).start_url === "/", "Un jeton douteux n'est jamais recopié dans start_url");

res = await fetch(baseUrl + "sw.js");
const sw = await res.text();
assert(res.status === 200 && (res.headers.get("content-type") || "").includes("javascript") && sw.includes("addEventListener(\"fetch\""), "Service worker servi à la racine (/sw.js)");
assert(res.headers.get("cache-control") === "no-cache" && res.headers.get("service-worker-allowed") === "/", "Service worker : jamais mis en cache, portée /");
assert(sw.includes('url.pathname.startsWith("/api/")'), "Service worker : les appels /api/ ne passent jamais par le cache");

["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "favicon-32.png", "mobile.css", "mobile.js"].forEach(f => {
  if (!fs.existsSync(path.join("assets", "mobile", f))) throw new Error("❌ Fichier manquant : assets/mobile/" + f);
});
console.log("✅ Icônes et couche mobile présentes dans assets/mobile/");

assert(/<link rel="manifest" href="\/manifest.webmanifest">/.test(html) && html.includes('rel="apple-touch-icon"'), "Page : balises manifest et icône iPhone");
assert(html.includes("viewport-fit=cover"), "Page : viewport-fit=cover (encoche iPhone)");
const lastStyleEnd = html.indexOf("</style>", html.indexOf("<style>"));
assert(html.indexOf('href="assets/mobile/mobile.css"') > lastStyleEnd, "mobile.css chargé APRÈS la grande feuille de style (ses règles l'emportent)");

const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
for (let i = 0; i < 50 && !doc.getElementById("mTabbar"); i++) await new Promise(r => setTimeout(r, 100));
const tabbar = doc.getElementById("mTabbar");
assert(!!tabbar, "Barre d'onglets du bas construite par mobile.js");
const tabs = [...tabbar.querySelectorAll(".tab-btn")].map(b => b.dataset.tab);
assert(JSON.stringify(tabs) === JSON.stringify(["club", "ordres", "calendrier", "economie"]), "Onglets : Accueil, Ordres, Calendrier, Économie (" + tabs.join(", ") + ")");
tabbar.querySelector('[data-tab="economie"]').click();
assert(!doc.getElementById("economieSection").classList.contains("hidden"), "L'onglet Économie du bas ouvre bien la page Économie");
assert(tabbar.querySelector('[data-tab="economie"]').classList.contains("active") && doc.querySelector('.sidebar .tab-btn[data-tab="economie"]').classList.contains("active"), "Onglet actif synchronisé entre barre du bas et menu latéral");
doc.getElementById("mTabMenu").click();
assert(doc.body.classList.contains("m-drawer-open"), "Le bouton Menu ouvre le tiroir");
doc.getElementById("mDrawerBackdrop").click();
assert(!doc.body.classList.contains("m-drawer-open"), "Toucher le fond referme le tiroir");
assert(!!doc.getElementById("mSearchToggle"), "Bouton loupe ajouté dans l'en-tête");

// Nom du club retiré de l'en-tête sur téléphone et dans l'appli (retour
// utilisateur 2026-09-30 (téléphone) : « sur l'application uniquement je
// retirerais le nom d'équipe en haut ») : masqué sous 768 px (seuil de la
// barre d'onglets du bas) et partout quand html porte .m-standalone (appli
// installée) ou .m-native (Capacitor) ; gardé sur ordinateur.
{
  const css = fs.readFileSync(path.join("assets", "mobile", "mobile.css"), "utf-8");
  const mobileBlock = css.slice(css.indexOf("@media (max-width: 768px)"));
  assert(/\.topbar-club \{ display: none; \}/.test(mobileBlock), "mobile.css : nom du club masqué dans l'en-tête sous 768 px");
  assert(/html\.m-standalone \.topbar-club, html\.m-native \.topbar-club \{ display: none; \}/.test(css.slice(0, css.indexOf("@media (max-width: 768px)"))), "mobile.css : nom du club masqué dans l'appli (m-standalone / m-native), toutes largeurs");
  assert(!doc.documentElement.classList.contains("m-native"), "Navigateur ordinaire : pas de classe m-native");
  const domApp = await openGame(html, baseUrl, w => { w.Capacitor = { isNativePlatform: () => true }; });
  for (let i = 0; i < 50 && !domApp.window.document.getElementById("mTabbar"); i++) await new Promise(r => setTimeout(r, 100));
  assert(domApp.window.document.documentElement.classList.contains("m-native"), "Appli Capacitor détectée : html.m-native posé par mobile.js");
  await flush(domApp);
  domApp.window.close();
}

await flush(dom);
dom.window.close();
server.close();
console.log("\n🏁 Application mobile (PWA) vérifiée.");
})().catch(e => { console.error(e); process.exit(1); });
