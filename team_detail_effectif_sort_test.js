// Vérifie le tri du tableau Effectif de la fiche équipe (retour utilisateur,
// 2026-09, juste après l'ajout du tri sur SON PROPRE Effectif : "il faut
// aussi pouvoir trier sur la page effectif de qqun") — voir
// teamDetailEffectifHtml/teamDetailEffectifSortState/teamDetailSortAllowed
// dans moteurbasket3.html. Couvre le cas propre équipe (tout triable, comme
// l'onglet Effectif) ET le cas adversaire NON scouté (seules Nom/Poste/
// Taille/Salaire, toujours visibles, doivent être triables — trier une
// caractéristique verrouillée révélerait un ORDRE, donc de l'information sur
// des valeurs censées rester cachées), plus le garde-fou anti-fuite : un tri
// choisi sur une caractéristique révélée pour une équipe ne doit PAS
// s'appliquer silencieusement en consultant une autre équipe où elle ne
// l'est pas.
const fs = require("fs");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, baseUrl } = await startTestServer();

try {
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  const win = dom.window;
  const myIdx = win.eval("myTeamIndex");

  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ligue").click();
  const teamLinks = [...doc.querySelectorAll("[data-team-idx]")];
  const ownLink = teamLinks.find(l => Number(l.dataset.teamIdx) === myIdx);
  const oppLink = teamLinks.find(l => Number(l.dataset.teamIdx) !== myIdx);
  if (!ownLink || !oppLink) throw new Error("❌ (setup) il faut au moins un lien vers sa propre équipe et un adversaire.");

  const openEffectif = (link, view) => {
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ligue").click();
    [...doc.querySelectorAll("[data-team-idx]")].find(l => l.dataset.teamIdx === link.dataset.teamIdx).click();
    [...doc.querySelectorAll("[data-team-detail-subview]")].find(b => b.dataset.teamDetailSubview === "effectif").click();
    if (view) doc.querySelector(`[data-team-effectif-view="${view}"]`).click();
    return doc.querySelector("#teamDetailContent table.roster-table");
  };
  const colValues = (table, label) => {
    const idx = [...table.querySelectorAll("thead tr:last-child th")].findIndex(th => th.textContent.trim().startsWith(label));
    return [...table.querySelectorAll("tbody tr.eff-row")].map(tr => Number(tr.children[idx].textContent.trim().replace(",", ".").match(/-?\d+(\.\d+)?/)?.[0]));
  };

  // --- Propre équipe, vue Caractéristiques : tout est triable. ---
  let table = openEffectif(ownLink, "caracs");
  let headers = [...table.querySelectorAll("thead tr:last-child th")];
  let sortableCount = headers.filter(th => th.hasAttribute("data-team-sort")).length;
  console.log("Propre équipe (Caractéristiques) — colonnes triables :", sortableCount, "/", headers.length);
  if (sortableCount !== headers.length) throw new Error("❌ Sur sa propre équipe, toutes les colonnes devraient être triables.");
  [...table.querySelectorAll("th[data-team-sort]")].find(th => th.textContent.trim().startsWith("MI-D")).click();
  table = doc.querySelector("#teamDetailContent table.roster-table");
  let vals = colValues(table, "MI-D");
  console.log("MI-D après clic (attendu décroissant) :", vals.join(", "));
  if (!vals.every((v, i) => i === 0 || vals[i - 1] >= v)) throw new Error("❌ Trier par MI-D sur sa propre équipe devrait fonctionner.");
  console.log("✅ Propre équipe : toutes les colonnes triables, tri par caractéristique OK.");

  // --- Adversaire non scouté, vue Général : colonnes publiques triables. ---
  table = openEffectif(oppLink);
  headers = [...table.querySelectorAll("thead th")];
  const sortable = headers.filter(th => th.hasAttribute("data-team-sort")).map(th => th.textContent.trim());
  console.log("Adversaire (Général) — colonnes triables :", sortable.join(", "));
  if (sortable.length !== headers.length) throw new Error("❌ La vue Général n'affiche que des infos publiques : tout devrait y être triable.");
  // Le tri MI-D de l'équipe précédente ne doit pas fuiter : ordre par défaut
  // (groupes de rôle, puis poste) dans chaque groupe.
  const groupsOk = [...table.querySelectorAll("tbody.eff-group")].every(tb => {
    const pos = [...tb.querySelectorAll("tr.eff-row")].map(tr => tr.children[1].textContent.trim());
    const exp = [...pos].sort((a, b) => ["M", "A", "AS", "AF", "P"].indexOf(a) - ["M", "A", "AS", "AF", "P"].indexOf(b));
    return JSON.stringify(pos) === JSON.stringify(exp);
  });
  if (!groupsOk) throw new Error("❌ Le tri MI-D choisi sur une autre équipe n'aurait jamais dû s'appliquer ici (fuite d'information).");
  console.log("✅ Adversaire : colonnes publiques triables, le tri d'une caractéristique d'une autre équipe ne fuite pas.");

  // Tri par taille (public).
  [...table.querySelectorAll("th[data-team-sort]")].find(th => th.dataset.teamSort === "height").click();
  table = doc.querySelector("#teamDetailContent table.roster-table");
  const heightsOk = [...table.querySelectorAll("tbody.eff-group")].every(tb => {
    const h = [...tb.querySelectorAll("tr.eff-row")].map(tr => parseInt(tr.children[3].textContent, 10));
    return h.every((v, i) => i === 0 || h[i - 1] >= v);
  });
  if (!heightsOk) throw new Error("❌ Le tri par taille devrait fonctionner dans chaque groupe.");
  console.log("✅ Tri par taille OK sur la vue Général adverse.");

  // --- Adversaire partiellement scouté : seules les caracs révélées. ---
  const oppIdx = Number(oppLink.dataset.teamIdx);
  win.eval(`teamA.scoutedAttrs = teamA.scoutedAttrs || {}; teamA.scoutedAttrs["${oppIdx}"] = ["midRange", "speed"];`);
  table = openEffectif(oppLink, "caracs");
  const attrCols = [...table.querySelectorAll("thead th.eff-th-attr")].map(th => th.dataset.teamSort);
  console.log("Colonnes affichées après révélation de midRange + speed :", attrCols.join(", "));
  if (JSON.stringify(attrCols) !== JSON.stringify(["midRange", "speed"])) throw new Error("❌ Seules les caractéristiques révélées devraient être affichées (et triables).");
  const families = [...table.querySelectorAll(".eff-family")].map(td => td.textContent.trim());
  if (JSON.stringify(families) !== JSON.stringify(["Tir", "Physique"])) throw new Error("❌ Les familles affichées devraient être Tir et Physique, obtenu " + families.join(", "));
  [...table.querySelectorAll("th[data-team-sort]")].find(th => th.dataset.teamSort === "speed").click();
  table = doc.querySelector("#teamDetailContent table.roster-table");
  vals = colValues(table, "VIT");
  if (!vals.every((v, i) => i === 0 || vals[i - 1] >= v)) throw new Error("❌ Trier sur une caractéristique révélée devrait fonctionner.");
  console.log("✅ Adversaire partiellement scouté : seules midRange/speed affichées (familles Tir/Physique), tri OK.");

  // --- Vue Statistiques : tri par défaut points/match décroissant. ---
  win.eval("teamDetailEffectifSortState = { key: null, dir: 1 };");
  table = openEffectif(oppLink, "stats");
  if (table) {
    const pts = colValues(table, "Pts");
    if (!pts.every((v, i) => i === 0 || pts[i - 1] >= v)) throw new Error("❌ Vue Statistiques : tri par défaut attendu sur Pts décroissant.");
    console.log("✅ Vue Statistiques : tri par défaut Pts décroissant.");
  } else {
    console.log("ℹ️ Vue Statistiques : aucun match joué (message vide attendu).");
  }

  dom.window.close();
  console.log("\n🏁 Tous les tests du tri de la fiche équipe > Effectif sont passés.");
} finally {
  server.close();
}

})();
