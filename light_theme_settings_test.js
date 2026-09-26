// Version claire du jeu (retour utilisateur, 2026-09-26 : « travaille sur une
// version claire du jeu, on mettra un petit bouton paramètre à côté
// d'identité du club dans le tableau de bord »). Vérifie le bouton
// Paramètres du tableau de bord, la fenêtre et ses trois choix (Sombre /
// Clair / Comme l'appareil), l'attribut data-theme posé sur <html>, le choix
// mémorisé dans le navigateur et relu au chargement suivant (petit script
// en tête de page), et la présence des règles du thème clair.
const fs = require("fs");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

(async () => {
  const { server, baseUrl } = await startTestServer();

  // 1) Premier chargement : thème sombre par défaut.
  const dom = await openGame(html, baseUrl);
  const win = dom.window, doc = win.document;
  assert(doc.documentElement.getAttribute("data-theme") === "dark", "thème sombre par défaut");

  const clickTab = k => [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === k).click();
  clickTab("club");
  const identity = doc.querySelector(".hm-head__identity-btn");
  const settings = doc.querySelector(".hm-head__settings-btn");
  assert(identity && settings, "bouton Paramètres présent sur le tableau de bord");
  assert(identity.nextElementSibling === settings, "le bouton Paramètres est juste à côté d'« Identité du club »");
  assert(settings.getAttribute("aria-label") === "Paramètres", "bouton Paramètres nommé pour les lecteurs d'écran");

  settings.click();
  const overlay = doc.getElementById("settingsModalOverlay");
  assert(!!overlay, "clic : la fenêtre Paramètres s'ouvre");
  const choices = [...overlay.querySelectorAll("[data-theme-choice]")];
  assert(choices.map(b => b.dataset.themeChoice).join() === "dark,light,system", "trois choix : Sombre, Clair, Comme l'appareil");
  assert(choices[0].getAttribute("aria-pressed") === "true", "Sombre coché au départ");

  choices[1].click();
  assert(doc.documentElement.getAttribute("data-theme") === "light", "Clair : data-theme=light posé sur <html>");
  assert(win.localStorage.getItem("hm-theme") === "light", "choix mémorisé dans le navigateur");
  assert(choices[1].getAttribute("aria-pressed") === "true" && choices[0].getAttribute("aria-pressed") === "false", "le choix coché suit le clic");
  assert(doc.querySelector('meta[name="theme-color"]').getAttribute("content") === "#ffffff", "couleur de la barre du navigateur mobile passée en clair");

  // « Comme l'appareil » : jsdom n'a pas de matchMedia → repli sombre, sans erreur.
  choices[2].click();
  assert(win.localStorage.getItem("hm-theme") === "system", "« Comme l'appareil » mémorisé");
  assert(doc.documentElement.getAttribute("data-theme") === "dark", "« Comme l'appareil » sans préférence connue : sombre");
  win.matchMedia = () => ({ matches: true, addEventListener() {}, addListener() {} });
  win.eval("hmThemeApply()");
  assert(doc.documentElement.getAttribute("data-theme") === "light", "« Comme l'appareil » + appareil en clair : clair");

  choices[1].click();
  doc.getElementById("settingsModalCloseBtn").click();
  assert(!doc.getElementById("settingsModalOverlay"), "Fermer ferme la fenêtre");

  // 2) Rechargement : le script en tête de page réapplique le choix avant le rendu.
  const dom2 = await openGame(html, baseUrl, w => { w.localStorage.setItem("hm-theme", "light"); });
  assert(dom2.window.document.documentElement.getAttribute("data-theme") === "light", "rechargement : thème clair réappliqué dès le chargement");

  // 3) Feuille de style : le thème clair redéfinit les couleurs de base et le logo.
  assert(/html\[data-theme="light"\]:root\{[^}]*--bg:#eef1f6/.test(html), "règles du thème clair présentes (fond papier)");
  assert(html.includes('content:url("/assets/brand/logo-hoop-manager-clair.png")') && fs.existsSync("assets/brand/logo-hoop-manager-clair.png"), "logo Hoop Manager recoloré pour le thème clair");
  assert(fs.readFileSync("assets/live/live.css", "utf-8").includes('html[data-theme="light"] .hm-live'), "page live : variante claire");

  server.close();
  console.log("\nTous les tests du thème clair passent.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
