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
// Partie 2 : affichage sur la fiche joueur — le NOM du palier apparaît, mais
// jamais le chiffre exact caché. Depuis la refonte de l'onglet Effectif
// (retour utilisateur, 2026-09 : "on verra toutes les carac des joueurs en
// cliquant sur la page du joueur"), le Potentiel n'est plus une colonne du
// tableau Effectif lui-même : il a été réajouté sur renderPlayerDetail pour
// ne pas perdre cette information (voir moteurbasket3.html, juste après la
// ligne Motivation), donc c'est là qu'on le vérifie maintenant.
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
  if ([...rosterTable.querySelectorAll("thead th")].some(th => th.textContent.trim() === "Potentiel")) {
    throw new Error("❌ Le tableau Effectif ne devrait plus afficher de colonne \"Potentiel\" (déplacée vers la fiche joueur).");
  }
  await flush(dom);
  const teamPlayers = readRawSave(savePath).team.players;
  const rows = [...rosterTable.querySelectorAll("tbody tr")];
  if (rows.length !== teamPlayers.length) throw new Error(`❌ ${teamPlayers.length} joueurs attendus dans le tableau, obtenu ${rows.length} lignes.`);
  console.log(`✅ Le tableau Effectif (${rows.length} joueurs) n'affiche plus de colonne Potentiel.`);

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
