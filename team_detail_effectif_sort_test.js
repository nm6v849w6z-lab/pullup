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

  // --- Propre équipe : tout doit être triable, comme l'onglet Effectif. ---
  ownLink.click();
  [...doc.querySelectorAll("[data-team-detail-subview]")].find(b => b.dataset.teamDetailSubview === "effectif").click();
  let table = doc.querySelector("#teamDetailContent table.roster-table");
  let headers = [...table.querySelectorAll("thead th")];
  let sortableCount = headers.filter(th => th.hasAttribute("data-team-sort")).length;
  console.log("Propre équipe — colonnes triables :", sortableCount, "/", headers.length);
  if (sortableCount !== headers.length) throw new Error("❌ Sur sa propre équipe, toutes les colonnes devraient être triables.");
  console.log("✅ Toutes les colonnes sont triables sur sa propre équipe.");

  const miDth = [...table.querySelectorAll("th[data-team-sort]")].find(th => th.textContent.trim().startsWith("MI-D"));
  miDth.click();
  table = doc.querySelector("#teamDetailContent table.roster-table");
  const idx = [...table.querySelectorAll("thead th")].findIndex(th => th.textContent.trim().startsWith("MI-D"));
  const vals = [...table.querySelectorAll("tbody tr")].map(tr => Number(tr.children[idx].textContent.trim().match(/-?\d+/)?.[0]));
  console.log("MI-D après clic (attendu décroissant) :", vals.join(", "));
  if (!vals.every((v, i) => i === 0 || vals[i - 1] >= v)) throw new Error("❌ Trier par MI-D sur sa propre équipe devrait fonctionner (plus fort au moins fort).");
  console.log("✅ Le tri par caractéristique fonctionne sur sa propre équipe.");

  // --- Adversaire non scouté : seules Nom/Poste/Taille/Salaire triables. ---
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ligue").click();
  oppLink.click();
  [...doc.querySelectorAll("[data-team-detail-subview]")].find(b => b.dataset.teamDetailSubview === "effectif").click();
  table = doc.querySelector("#teamDetailContent table.roster-table");
  headers = [...table.querySelectorAll("thead th")];
  const sortableHeaders = headers.filter(th => th.hasAttribute("data-team-sort")).map(th => th.textContent.trim());
  console.log("Adversaire non scouté — colonnes triables :", sortableHeaders.join(", "));
  if (sortableHeaders.length !== 4 || !["Nom", "Poste", "Taille", "Salaire/sem."].every(l => sortableHeaders.includes(l))) {
    throw new Error("❌ Pour un adversaire non scouté, seules Nom/Poste/Taille/Salaire devraient être triables (le reste est verrouillé par le scoutisme).");
  }
  const miDth2 = headers.find(th => th.textContent.trim().startsWith("MI-D"));
  if (miDth2.hasAttribute("data-team-sort")) throw new Error("❌ Une caractéristique verrouillée ne devrait jamais être triable (fuite d'information via l'ordre).");
  console.log("✅ Seules les colonnes toujours visibles sont triables pour un adversaire non scouté ; les caractéristiques verrouillées ne le sont pas.");

  // --- Garde-fou anti-fuite : le tri choisi sur l'équipe précédente (une
  // caractéristique) ne doit pas s'appliquer silencieusement ici. ---
  const positions = [...table.querySelectorAll("tbody tr")].map(tr => tr.children[1].textContent.trim());
  const expectedOrder = [...positions].sort((a, b) => ["M", "A", "AS", "AF", "P"].indexOf(a) - ["M", "A", "AS", "AF", "P"].indexOf(b));
  if (JSON.stringify(positions) !== JSON.stringify(expectedOrder)) {
    throw new Error("❌ Le tri par MI-D choisi sur l'équipe précédente n'aurait jamais dû s'appliquer ici (fuite d'information) — attendu un repli sur le tri par défaut (poste).");
  }
  console.log("✅ Le tri persistant d'une autre équipe ne fuite pas sur un adversaire où la colonne est verrouillée (repli sur le tri par défaut).");

  dom.window.close();
  console.log("\n🏁 Tous les tests du tri de la fiche équipe > Effectif sont passés.");
} finally {
  server.close();
}

})();
