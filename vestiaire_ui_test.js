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
  assert(/À surveiller/.test(content.textContent) && /Ce qui va bien/.test(content.textContent) && /Levier prioritaire/.test(content.textContent), "vue générale : points positifs, à surveiller, levier prioritaire");
  assert(content.querySelector(".vs-head h1").textContent === "Vestiaire" && /Semaine \d+ · \d+ joueurs/.test(content.querySelector(".vs-head .vs-eyebrow").textContent), "en-tête : semaine, effectif, titre « Vestiaire »");
  assert(content.querySelectorAll(".vs-pillar").length === 3, "trois jauges (cohésion, moral, confiance)");
  assert(content.querySelector(".vs-root.vs-club"), "Mode Club : police et barème du Mode Club (classe vs-club)");
  const tierOk = [...content.querySelectorAll(".vs-pillar")].every(c => {
    const v = Number(c.querySelector(".vs-big").textContent), w = c.querySelector(".vs-verdict").textContent;
    return w === (v <= 20 ? "Faible" : v <= 50 ? "Moyen" : v <= 80 ? "Bon" : "Élevé") && c.querySelector(".vs-verdict").getAttribute("style").includes(win.radarTierColor(v));
  });
  assert(tierOk, "cohésion, moral, confiance : barème commun radarTierColor (rouge, jaune, blanc, vert)");
  for (const [k, re] of [["hierarchy", /La pyramide du vestiaire/], ["groups", /Groupes formés/], ["relations", /Carte des relations/], ["evolution", /Journal du vestiaire/]]) {
    content.querySelector(`[data-vs-tab="${k}"]`).click();
    assert(re.test(content.textContent), `vue ${k}`);
  }
  content.querySelector('[data-vs-tab="groups"]').click();
  assert(!/Comment naissent les groupes|les affinités se créent d'elles-mêmes/.test(content.textContent), "Groupes : bloc explicatif « Comment naissent les groupes » retiré");
  assert(content.querySelectorAll(".vs-kpi").length === 4, "Groupes : chiffres et cartes des groupes conservés");
  content.querySelector('[data-vs-tab="relations"]').click();
  assert(content.querySelectorAll(".vs-graph g[data-player-id]").length === win.eval("teamA.players.length"), "graphe : un point par joueur");
  content.querySelector('[data-vs-tab="hierarchy"]').click();
  const n = win.eval("teamA.players.length");
  const rowsN = () => content.querySelectorAll(".vs-table tbody tr").length;
  if (n > 11) {
    assert(rowsN() === 9 && content.querySelector("[data-vs-all]"), "tableau : 9 joueurs puis « Afficher les autres »");
    content.querySelector("[data-vs-all]").click();
  }
  assert(rowsN() === n, "tableau : tous les joueurs");
  assert(content.querySelectorAll(".vs-table .player-avatar").length === n, "avatars des joueurs (comme partout dans le jeu)");
  // Joueur retiré puis données de vestiaire absentes : aucune erreur.
  win.eval("teamA.players.pop(); teamA.locker = null; TAB_HANDLERS.vestiaire()");
  if (content.querySelector("[data-vs-all]")) content.querySelector("[data-vs-all]").click();
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
