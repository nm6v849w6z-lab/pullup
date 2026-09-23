// Vérifie le tri des colonnes du sous-onglet Effectif > Caractéristiques
// (retour utilisateur, 2026-09, 2 captures d'écran : "les colonnes ne
// peuvent de nouveau plus être triées") — jusqu'ici ce tableau (branche
// effectifSubView === "caracteristiques" de renderEffectifSection) était
// rendu avec des <th> bruts, sans data-sort, contrairement au sous-onglet
// "Général" (voir ROSTER_SORT_COLUMNS/rosterHeaderCellHtml/rosterSortState/
// rosterSortValue) qui, lui, était déjà triable. Ce test couvre : une
// colonne de caractéristique brute (MI-D), les deux colonnes moyennées
// ajoutées pour l'occasion (Physique/Mental, voir rosterSortValue), et la
// colonne Nom — dans les DEUX sens (clic simple = plus fort au moins fort
// pour une caractéristique, re-clic = inverse), en vérifiant l'ordre RÉEL
// affiché dans les lignes du tableau plutôt que juste la présence de
// data-sort.
const fs = require("fs");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, baseUrl } = await startTestServer();

try {
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;

  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "effectif").click();
  const subTabBtn = [...doc.querySelectorAll("[data-effectif-subview]")].find(b => b.dataset.effectifSubview === "caracteristiques");
  if (!subTabBtn) throw new Error("❌ (setup) le sous-onglet 'Caractéristiques' devrait être présent sur l'Effectif.");
  subTabBtn.click();

  const table = doc.querySelector("#rosterContent table.roster-table");
  if (!table) throw new Error("❌ (setup) le sous-onglet Caractéristiques devrait afficher un tableau.");

  const headerCells = [...table.querySelectorAll("thead th")];
  console.log("En-têtes du sous-onglet Caractéristiques :", headerCells.map(th => th.textContent.trim()).join(", "));
  const sortableCount = headerCells.filter(th => th.hasAttribute("data-sort")).length;
  console.log("Colonnes triables (data-sort) :", sortableCount, "/", headerCells.length);
  if (sortableCount !== headerCells.length) {
    throw new Error("❌ Toutes les colonnes du sous-onglet Caractéristiques devraient être triables (data-sort), comme sur le sous-onglet Général.");
  }
  console.log("✅ Toutes les colonnes du sous-onglet Caractéristiques sont bien triables.");

  // Colonne "MI-D" (midRange, 1ère caractéristique) : clic = du plus fort au
  // moins fort (comportement déjà établi pour les colonnes non-Nom, voir
  // rosterSortState).
  // `renderEffectifSection` remplace ENTIÈREMENT #rosterContent.innerHTML à
  // chaque tri (voir `holder.innerHTML = attrsHtml`) : le nœud `table`
  // capturé plus haut est donc périmé après un clic, il faut le
  // requêter à nouveau à chaque lecture plutôt que le garder en cache.
  function currentTable() { return doc.querySelector("#rosterContent table.roster-table"); }
  function columnValues(headerLabel) {
    const tbl = currentTable();
    const idx = [...tbl.querySelectorAll("thead th")].findIndex(th => th.textContent.trim().startsWith(headerLabel));
    if (idx === -1) throw new Error(`❌ Colonne "${headerLabel}" introuvable dans l'en-tête.`);
    return [...tbl.querySelectorAll("tbody tr")].map(tr => {
      const cell = tr.children[idx];
      // Les cellules de caractéristiques utilisent attrCellHtml (valeur +
      // mini-barre) : on lit la valeur numérique dans le texte de la cellule.
      const n = Number(cell.textContent.trim().match(/-?\d+/)?.[0]);
      return n;
    });
  }

  function isDescending(arr) { return arr.every((v, i) => i === 0 || arr[i - 1] >= v); }
  function isAscending(arr) { return arr.every((v, i) => i === 0 || arr[i - 1] <= v); }

  const miD_th = [...table.querySelectorAll("thead th")].find(th => th.textContent.trim().startsWith("MI-D"));
  miD_th.click();
  let vals = columnValues("MI-D");
  console.log("MI-D après 1er clic (attendu décroissant) :", vals.join(", "));
  if (!isDescending(vals)) throw new Error("❌ Un 1er clic sur l'en-tête MI-D devrait trier du plus fort au moins fort.");
  console.log("✅ Tri décroissant correct sur MI-D après le 1er clic.");

  const miD_th2 = [...doc.querySelectorAll("#rosterContent thead th")].find(th => th.textContent.trim().startsWith("MI-D"));
  miD_th2.click();
  vals = columnValues("MI-D");
  console.log("MI-D après 2e clic (attendu croissant) :", vals.join(", "));
  if (!isAscending(vals)) throw new Error("❌ Re-cliquer sur MI-D devrait inverser le tri (croissant).");
  console.log("✅ Re-cliquer sur la même colonne inverse bien le sens du tri.");

  // Colonnes moyennées Physique/Mental (nouvelles, ajoutées pour ce
  // correctif — voir rosterSortValue "physicalAvg"/"mentalAvg").
  const physiqueTh = [...doc.querySelectorAll("#rosterContent thead th")].find(th => th.textContent.trim().startsWith("Physique"));
  physiqueTh.click();
  vals = columnValues("Physique");
  console.log("Physique après clic (attendu décroissant) :", vals.join(", "));
  if (!isDescending(vals)) throw new Error("❌ Trier par la colonne moyennée Physique devrait fonctionner (plus fort au moins fort).");
  console.log("✅ Le tri fonctionne aussi sur la colonne moyennée Physique.");

  const mentalTh = [...doc.querySelectorAll("#rosterContent thead th")].find(th => th.textContent.trim().startsWith("Mental"));
  mentalTh.click();
  vals = columnValues("Mental");
  console.log("Mental après clic (attendu décroissant) :", vals.join(", "));
  if (!isDescending(vals)) throw new Error("❌ Trier par la colonne moyennée Mental devrait fonctionner (plus fort au moins fort).");
  console.log("✅ Le tri fonctionne aussi sur la colonne moyennée Mental.");

  // Colonne Nom : premier clic = ordre alphabétique croissant (comportement
  // déjà établi pour cette colonne précise, voir rosterSortState).
  const nomTh = [...doc.querySelectorAll("#rosterContent thead th")].find(th => th.textContent.trim().startsWith("Nom"));
  nomTh.click();
  const names = [...currentTable().querySelectorAll("tbody tr")].map(tr => tr.children[0].textContent.trim());
  const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
  console.log("Noms après clic sur 'Nom' :", names.join(", "));
  if (JSON.stringify(names) !== JSON.stringify(sortedNames)) {
    throw new Error("❌ Cliquer sur l'en-tête 'Nom' devrait trier les joueurs par ordre alphabétique.");
  }
  console.log("✅ La colonne Nom trie bien par ordre alphabétique.");

  // Le sous-onglet "Général" doit rester inchangé (même écouteur délégué,
  // même état de tri partagé rosterSortState — aucune régression attendue).
  const generalBtn = [...doc.querySelectorAll("[data-effectif-subview]")].find(b => b.dataset.effectifSubview === "general");
  generalBtn.click();
  const generalTable = doc.querySelector("#rosterContent table.roster-table");
  if (!generalTable || !generalTable.querySelector("th[data-sort]")) {
    throw new Error("❌ Le sous-onglet Général devrait rester triable après ce correctif (pas de régression).");
  }
  console.log("✅ Le sous-onglet Général reste bien triable (pas de régression).");

  dom.window.close();
  console.log("\n🏁 Tous les tests du tri de l'onglet Effectif > Caractéristiques sont passés.");
} finally {
  server.close();
}

})();
