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
    [60, "Star"], [69, "Star"],
    [70, "All-Star"], [79, "All-Star"],
    [80, "Superstar"], [89, "Superstar"],
    [90, "Générationnel"], [99, "Générationnel"],
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
// Partie 2 : affichage sur l'onglet Effectif ET sur la fiche joueur — le NOM
// du palier apparaît aux deux endroits, mais jamais le chiffre exact caché.
// Historique : le Potentiel avait d'abord été retiré de l'onglet Effectif
// lors de la refonte de la fiche joueur (retour utilisateur, 2026-09 : "on
// verra toutes les carac des joueurs en cliquant sur la page du joueur"),
// puis un beta-testeur ("Ariane", Discord) a signalé son absence gênante sur
// le tableau — l'utilisateur a explicitement demandé de le remettre : "ajoute
// le potentiel juste après le poste" (sous-onglet "Général"), puis "idem là,
// juste après le poste" (sous-onglet "Caractéristiques"). Il reste AUSSI sur
// la fiche joueur (jamais retiré de là), donc affiché aux deux endroits
// désormais — voir ROSTER_SORT_COLUMNS/rosterHeaderCellHtml.
// ---------------------------------------------------------------------
(async () => {
  const html = fs.readFileSync("moteurbasket3.html", "utf-8");
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  const win = dom.window;
  const clickTab = (key) => [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click();
  clickTab("effectif");

  function checkPotentialColumn(label) {
    const table = doc.querySelector("#rosterContent table");
    if (!table) throw new Error(`❌ [${label}] Tableau de l'effectif introuvable.`);
    const headers = [...table.querySelectorAll("thead th")].map(th => th.textContent.trim());
    const posIdx = headers.indexOf("Poste");
    const potIdx = headers.indexOf("Potentiel");
    if (posIdx === -1) throw new Error(`❌ [${label}] Colonne "Poste" introuvable — en-têtes : ${headers.join(", ")}`);
    if (potIdx === -1) throw new Error(`❌ [${label}] Colonne "Potentiel" introuvable (retour utilisateur : "ajoute le potentiel juste après le poste") — en-têtes : ${headers.join(", ")}`);
    if (potIdx !== posIdx + 1) {
      throw new Error(`❌ [${label}] La colonne "Potentiel" devrait être JUSTE APRÈS "Poste" (index ${posIdx + 1}), trouvée en position ${potIdx} — en-têtes : ${headers.join(", ")}`);
    }
    const rows = [...table.querySelectorAll("tbody tr.eff-row")]; // hors titres de groupe (refonte 2026-09-25)
    if (rows.length === 0) throw new Error(`❌ [${label}] Aucune ligne de joueur dans le tableau.`);
    rows.forEach((tr, i) => {
      const cellText = tr.children[potIdx].textContent.trim();
      if (!POTENTIAL_TIERS.some(t => t.label === cellText)) {
        throw new Error(`❌ [${label}] Ligne ${i} : la cellule Potentiel ("${cellText}") ne correspond à aucun nom de palier connu.`);
      }
    });
    console.log(`✅ [${label}] Colonne "Potentiel" présente juste après "Poste" (${rows.length} lignes, palier nommé sur chacune, jamais le chiffre caché).`);
  }

  checkPotentialColumn("Général");

  // Sous-onglet "Caractéristiques" : même demande explicite ("idem là").
  const carSubTab = [...doc.querySelectorAll("[data-effectif-subview]")].find(b => b.dataset.effectifSubview === "caracteristiques");
  if (!carSubTab) throw new Error("❌ (setup) Sous-onglet \"Caractéristiques\" introuvable.");
  carSubTab.click();
  checkPotentialColumn("Caractéristiques");
  // Revient sur "Général" pour la suite du test (clic sur la fiche joueur).
  const genSubTab = [...doc.querySelectorAll("[data-effectif-subview]")].find(b => b.dataset.effectifSubview === "general");
  if (genSubTab) genSubTab.click();

  await flush(dom);
  const teamPlayers = readRawSave(savePath).team.players;

  const allLabels = new Set(POTENTIAL_TIERS.map(t => t.label));
  const firstPlayerLink = doc.querySelector("#rosterContent .player-link");
  if (!firstPlayerLink) throw new Error("❌ (setup) l'Effectif devrait afficher au moins un lien joueur cliquable.");
  firstPlayerLink.click();
  const playerId = Number(firstPlayerLink.dataset.playerId);
  const player = teamPlayers.find(p => p.id === playerId);
  const potentialEl = doc.querySelector("#playerDetailContent .potential-tier");
  if (!potentialEl) throw new Error("❌ La fiche joueur devrait afficher un élément \".potential-tier\" (ligne Potentiel).");
  const shownLabel = potentialEl.textContent.trim();
  if (!allLabels.has(shownLabel)) {
    throw new Error(`❌ Le potentiel affiché sur la fiche joueur ("${shownLabel}") ne correspond à aucun nom de palier connu.`);
  }
  const expectedLabel = potentialTierLabel(player.potential);
  if (shownLabel !== expectedLabel) {
    throw new Error(`❌ Le potentiel affiché ("${shownLabel}") devrait correspondre au palier réel du joueur ("${expectedLabel}", potential=${player.potential}).`);
  }
  console.log(`✅ La fiche joueur affiche bien le nom du palier de potentiel ("${shownLabel}"), cohérent avec le potentiel réel du joueur.`);

  // Le chiffre exact (p.potential) ne doit apparaître NULLE PART dans le
  // texte visible de cet élément - seul le nom du palier y est exposé,
  // jamais le niveau caché lui-même (le `title`, une infobulle, n'est pas du
  // texte visible et révèle volontairement le PALIER 1-10, pas p.potential).
  if (shownLabel.includes(String(player.potential))) {
    throw new Error("❌ La ligne Potentiel de la fiche joueur ne devrait jamais afficher le chiffre exact caché.");
  }
  console.log("✅ La ligne Potentiel de la fiche joueur ne contient que le nom du palier, jamais le chiffre caché.");
  win.close();
  server.close();

  console.log("\n✅ Le potentiel des joueurs est affiché sur la fiche joueur sous forme de palier nommé (ex. \"All-Star\"), jamais le niveau exact caché.");
})().catch(e => { console.error(e); process.exit(1); });
