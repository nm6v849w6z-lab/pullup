// Onglet « Vestiaire » (Dynamique de groupe, 2026-10-06) côté navigateur :
// entrée de menu sous Effectif, page et ses 5 vues (Vue générale, Hiérarchie,
// Groupes, Relations, Évolution), liens joueur vers la fiche existante,
// joueurs ajoutés/retirés pris en compte, sauvegarde ancienne sans données.
const fs = require("fs");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };

(async () => {
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const win = dom.window, doc = win.document;
  const side = [...doc.querySelectorAll('[data-sidebar-group="equipe"] .sidebar-link')].map(b => b.textContent.trim());
  assert(side[1] === "Vestiaire", "menu Équipe : « Vestiaire » juste sous « Effectif »");
  assert(win.HM_VESTIAIRE && win.HM_VESTIAIRE_UI, "modules vestiaire chargés");
  doc.querySelector('.sidebar-link[data-tab="vestiaire"]').click();
  const sec = doc.getElementById("vestiaireSection");
  assert(!sec.classList.contains("hidden"), "page Vestiaire affichée");
  const content = doc.getElementById("vestiaireContent");
  assert(/Cohésion/.test(content.textContent) && /Moral/.test(content.textContent) && /Confiance/.test(content.textContent), "vue générale : cohésion, moral, confiance");
  assert(content.querySelector(".vs-state").textContent.trim().length > 3, "vue générale : état du vestiaire");
  assert(/Alertes/.test(content.textContent) && /Ce qui va bien/.test(content.textContent), "vue générale : points positifs et alertes");
  for (const [k, re] of [["hierarchy", /Hiérarchie du vestiaire/], ["groups", /(Liés par|Pas encore de groupe)/], ["relations", /Carte des relations/], ["evolution", /Journal du vestiaire/]]) {
    content.querySelector(`[data-vs-tab="${k}"]`).click();
    assert(re.test(content.textContent), `vue ${k}`);
  }
  content.querySelector('[data-vs-tab="relations"]').click();
  assert(content.querySelectorAll(".vs-graph g[data-player-id]").length === win.eval("teamA.players.length"), "graphe : un point par joueur");
  content.querySelector('[data-vs-tab="hierarchy"]').click();
  const n = win.eval("teamA.players.length");
  assert(content.querySelectorAll(".vs-table tbody tr").length === n, "tableau : tous les joueurs");
  // Joueur retiré puis données de vestiaire absentes : aucune erreur.
  win.eval("teamA.players.pop(); teamA.locker = null; TAB_HANDLERS.vestiaire()");
  assert(content.querySelectorAll(".vs-table tbody tr").length === n - 1, "joueur retiré : vue à jour sans erreur");
  // Semaine d'entraînement : relevé hebdo enregistré, courbe après 2 semaines.
  win.eval("teamA.trainWeek(1, Date.now()); teamA.trainWeek(1, Date.now()); TAB_HANDLERS.vestiaire()");
  content.querySelector('[data-vs-tab="evolution"]').click();
  assert(content.querySelector(".vs-chart"), "évolution : courbe affichée");
  content.querySelector('[data-vs-tab="hierarchy"]').click();
  const link = content.querySelector(".vs-table [data-player-team][data-player-id]");
  link.click();
  assert(!doc.getElementById("playerDetailSection").classList.contains("hidden"), "clic sur un joueur : sa fiche (actions existantes)");
  await dom.window.close();
  server.close();
  console.log("🏁 vestiaire_ui_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
