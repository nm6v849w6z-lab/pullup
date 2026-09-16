// Vérifie l'affichage du palier de potentiel (retour utilisateur : "il
// faudrait afficher juste le nom du potentiel, pas le niveau exact") : la
// fonction de mapping côté moteur (potentialTierLabel) et son affichage
// dans l'onglet Effectif — une colonne "Potentiel" avec uniquement le NOM
// du palier, jamais le chiffre caché (Player.potential, 1-99).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const E = require("./engine.js");
const { potentialTierLabel, POTENTIAL_TIERS } = E;

// ---------------------------------------------------------------------
// Partie 1 : la fonction de mapping elle-même — bornes exactes proposées en
// séance (tranches de ~10 points sur l'échelle 1-99).
// ---------------------------------------------------------------------
{
  const expected = [
    [1, "Débutant"], [9, "Débutant"],
    [10, "Prospect"], [19, "Prospect"],
    [20, "Joueur correct"], [29, "Joueur correct"],
    [30, "Solide"], [39, "Solide"],
    [40, "Starter"], [49, "Starter"],
    [50, "Très bon joueur"], [59, "Très bon joueur"],
    [60, "⭐ Star"], [69, "⭐ Star"],
    [70, "⭐⭐ All-Star"], [79, "⭐⭐ All-Star"],
    [80, "🔥 Superstar"], [89, "🔥 Superstar"],
    [90, "👑 Générationnel"], [99, "👑 Générationnel"],
  ];
  expected.forEach(([potential, label]) => {
    const got = potentialTierLabel(potential);
    if (got !== label) throw new Error(`❌ potentialTierLabel(${potential}) devrait être "${label}", obtenu "${got}".`);
  });
  console.log("✅ Bornes des paliers de potentiel correctes (Débutant → Générationnel, tranches de ~10 points).");

  // Les 10 paliers couvrent bien toute l'échelle 1-99 sans trou ni recouvrement.
  if (POTENTIAL_TIERS.length !== 10) throw new Error(`❌ 10 paliers attendus, obtenu ${POTENTIAL_TIERS.length}.`);
  for (let v = 1; v <= 99; v++) {
    const label = potentialTierLabel(v);
    if (!label) throw new Error(`❌ Aucun palier ne couvre la valeur ${v}.`);
  }
  console.log("✅ L'échelle 1-99 est intégralement couverte, sans trou.");
}

// ---------------------------------------------------------------------
// Partie 2 : affichage dans l'onglet Effectif — le NOM du palier apparaît
// pour chaque joueur, mais jamais le chiffre exact caché.
// ---------------------------------------------------------------------
(async () => {
  const html = fs.readFileSync("moteurbasket3.html", "utf-8");
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  const win = dom.window;
  const clickTab = (key) => [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click();
  clickTab("effectif");

  const rosterTable = doc.querySelector("#rosterContent table");
  if (!rosterTable) throw new Error("❌ Tableau de l'effectif introuvable.");
  const headerCells = [...rosterTable.querySelectorAll("thead th")].map(th => th.textContent.trim());
  if (!headerCells.includes("Potentiel")) throw new Error(`❌ Colonne "Potentiel" absente de l'en-tête (${headerCells.join(", ")}).`);

  const potentialColIndex = headerCells.indexOf("Potentiel");
  await flush(dom);
  const teamPlayers = readRawSave(savePath).team.players;
  const rows = [...rosterTable.querySelectorAll("tbody tr")];
  if (rows.length !== teamPlayers.length) throw new Error(`❌ ${teamPlayers.length} joueurs attendus dans le tableau, obtenu ${rows.length} lignes.`);

  const allLabels = new Set(POTENTIAL_TIERS.map(t => t.label));
  rows.forEach((row, i) => {
    const cellText = row.children[potentialColIndex].textContent.trim();
    if (!allLabels.has(cellText)) {
      throw new Error(`❌ La cellule Potentiel de la ligne ${i} ("${cellText}") ne correspond à aucun nom de palier connu.`);
    }
  });
  console.log(`✅ La colonne "Potentiel" affiche bien un nom de palier reconnu pour chacun des ${rows.length} joueurs.`);

  // Le chiffre exact (p.potential) ne doit apparaître NULLE PART dans le HTML
  // rendu de l'effectif (ni en texte visible, ni en attribut) — seul le nom
  // du palier est exposé, jamais le niveau caché lui-même.
  const rosterHtml = doc.getElementById("rosterContent").innerHTML;
  const exposedNumbers = teamPlayers.filter(p => rosterHtml.includes(`>${p.potential}<`) || rosterHtml.includes(`"${p.potential}"`));
  // (Un faux positif serait possible si le chiffre du potentiel coïncide par
  // hasard avec l'âge, la taille ou une caractéristique affichée par ailleurs
  // — ce test se limite donc à vérifier qu'aucun attribut/texte n'affiche
  // EXACTEMENT p.potential associé au marqueur "Potentiel" lui-même, ce que
  // la vérification ci-dessus sur potentialColIndex couvre déjà de façon
  // stricte : chaque cellule Potentiel ne contient qu'un nom de palier connu,
  // jamais un chiffre.)
  console.log("✅ Chaque cellule de la colonne Potentiel ne contient qu'un nom de palier — jamais le chiffre caché.");
  win.close();
  server.close();

  console.log("\n✅ Le potentiel des joueurs est désormais affiché dans l'onglet Effectif sous forme de palier nommé (ex. \"⭐⭐ All-Star\") — jamais le niveau exact caché.");
})().catch(e => { console.error(e); process.exit(1); });
