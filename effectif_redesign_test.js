// Refonte visuelle de l'onglet Effectif (retour utilisateur, 2026-09-25 :
// "code ces pages effectifs stp", maquette "Hoop Manager – Effectif
// retravaillé") : groupes Cinq de départ / Rotation, bandeau d'en-tête,
// menu "⋯" des actions, sous-onglet Caractéristiques trié par Moy. avec le
// meilleur de l'équipe cerclé dans chaque colonne.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {
const { server, baseUrl } = await startTestServer();
try {
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "effectif").click();

  // En-tête.
  const sub = doc.getElementById("rosterSubtitle").textContent;
  if (!/15 joueurs$/.test(sub)) throw new Error(`❌ Sous-titre attendu "<club>, 15 joueurs", obtenu "${sub}".`);
  if (!/€/.test(doc.getElementById("rosterPayrollValue").textContent)) throw new Error("❌ La masse salariale devrait être affichée dans l'en-tête.");
  console.log("✅ En-tête : sous-titre + masse salariale.");

  // Groupes.
  const groups = [...doc.querySelectorAll("#rosterContent .eff-group-title")].map(el => el.textContent);
  if (groups[0] !== "Cinq de départ") throw new Error(`❌ Le premier groupe devrait être "Cinq de départ", obtenu ${groups.join(", ")}.`);
  const starters = doc.querySelectorAll("#rosterContent .eff-group-starters tr.eff-row").length;
  if (starters !== 5) throw new Error(`❌ 5 titulaires attendus dans "Cinq de départ", obtenu ${starters}.`);
  console.log(`✅ Groupes : ${groups.join(" / ")} (5 titulaires).`);

  // Menu "⋯" : fermé par défaut, s'ouvre, se referme sur un clic ailleurs.
  const btn = doc.querySelector("#rosterContent [data-eff-menu]");
  const menu = doc.getElementById(`effMenu_${btn.dataset.effMenu}`);
  if (!menu.hidden) throw new Error("❌ Le menu d'actions devrait être fermé par défaut.");
  btn.click();
  if (menu.hidden || btn.getAttribute("aria-expanded") !== "true") throw new Error("❌ Le clic sur ⋯ devrait ouvrir le menu.");
  if (!menu.querySelector("[data-list-player]")) throw new Error("❌ Le menu devrait proposer la mise aux enchères.");
  doc.querySelector("#effectifSection h2").click();
  if (!menu.hidden) throw new Error("❌ Un clic ailleurs devrait refermer le menu.");
  console.log("✅ Menu ⋯ : ouverture, mise aux enchères, fermeture au clic extérieur.");

  // Caractéristiques : tri par défaut sur Moy. (décroissant), cadre "meilleur".
  [...doc.querySelectorAll("[data-effectif-subview]")].find(b => b.dataset.effectifSubview === "caracteristiques").click();
  const avgs = [...doc.querySelectorAll("#rosterContent .eff-td-avg")].map(td => Number(td.textContent.replace(",", ".")));
  if (!avgs.every((v, i) => i === 0 || avgs[i - 1] >= v)) throw new Error(`❌ Tri par défaut attendu sur Moy. décroissante : ${avgs.join(", ")}`);
  const families = [...doc.querySelectorAll("#rosterContent .eff-family")].map(el => el.textContent.trim());
  if (families.join("/") !== "Tir/Jeu/Défense/Condition") throw new Error(`❌ Familles attendues Tir/Jeu/Défense/Condition, obtenu ${families.join("/")}.`);
  const colCount = doc.querySelectorAll("#rosterContent thead th.eff-th-attr").length;
  const bestCount = doc.querySelectorAll("#rosterContent .eff-best").length;
  if (colCount !== 15 || bestCount < colCount) throw new Error(`❌ 15 colonnes et au moins un "meilleur" par colonne attendus (${colCount} colonnes, ${bestCount} cadres).`);
  console.log(`✅ Caractéristiques : tri Moy. décroissant, familles, ${bestCount} cadres "meilleur" sur ${colCount} colonnes.`);

  await flush(dom);
  dom.window.close();
  console.log("\n🏁 Refonte Effectif : tous les contrôles sont passés.");
} finally {
  server.close();
}
})().catch(e => { console.error(e); process.exit(1); });
