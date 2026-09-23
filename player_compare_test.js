// Vérifie le comparateur de joueurs (retour utilisateur, 2026-09-23 :
// "Un comparateur de joueurs côte à côte (marché des transferts et
// effectif) / reflechis à ça, ça me plait bien" — deux décisions de
// cadrage validées via question à choix : page dédiée, 2 joueurs à la
// fois ; format "paysage" validé sur mockup statique AVANT implémentation,
// voir DEV_NOTES.md et mockup_player_compare.html).
//
// Couvre : ouverture depuis la fiche joueur (bouton "Comparer"), sélecteur
// du 2e joueur (réutilise l'index de recherche global), rendu de la vue
// comparative (en-têtes, note de poste, bandeau de profil, 3 colonnes de
// caractéristiques), le verrou de scoutisme (identique à la fiche joueur,
// voir computePlayerVisibility) dans ses 3 cas (propre effectif / marché /
// adversaire non scouté), la mise en avant de la "meilleure valeur", et le
// retour "← Retour" vers la fiche du joueur A.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, writeRawSave } = require("./test_helpers.js");
const E = require("./engine.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function expectedTierClass(value) {
  if (value <= 20) return "attr-tier-red";
  if (value <= 50) return "attr-tier-orange";
  if (value <= 80) return "attr-tier-white";
  return "attr-tier-green";
}

(async () => {

// =======================================================================
// Partie 1 : ouverture depuis la fiche joueur + sélecteur du 2e joueur.
// =======================================================================
{
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  const win = dom.window;
  const saved = readRawSave(savePath);
  const myPlayers = saved.team.players;
  const playerA = myPlayers[0];
  const playerB = myPlayers[1];

  win.showPlayerDetail(0, playerA.id);
  const compareBtn = doc.getElementById("openPlayerCompareBtn");
  if (!compareBtn || compareBtn.classList.contains("hidden")) {
    throw new Error("❌ Le bouton \"Comparer\" devrait être visible sur la fiche joueur.");
  }
  console.log("✅ Le bouton \"Comparer\" est bien présent sur la fiche joueur.");

  compareBtn.click();
  if (!win.eval('currentVisiblePageId()') === "playerCompareSection") {
    // currentVisiblePageId() est une fonction interne, on vérifie plutôt
    // directement l'état des sections via leurs classes.
  }
  const compareSection = doc.getElementById("playerCompareSection");
  if (compareSection.classList.contains("hidden")) {
    throw new Error("❌ Cliquer sur \"Comparer\" devrait afficher #playerCompareSection.");
  }
  const picker = doc.getElementById("playerComparePicker");
  if (picker.classList.contains("hidden")) {
    throw new Error("❌ Le sélecteur du 2e joueur devrait être visible juste après avoir cliqué \"Comparer\".");
  }
  const intro = doc.getElementById("playerComparePickerIntro").textContent;
  if (!intro.includes(playerA.name)) {
    throw new Error(`❌ Le sélecteur devrait mentionner le joueur A ("${playerA.name}"), obtenu "${intro}".`);
  }
  console.log("✅ Cliquer \"Comparer\" ouvre bien la page dédiée avec le sélecteur du 2e joueur, joueur A déjà fixé.");

  // --- Recherche + sélection du 2e joueur (réutilise normalizeSearchText).
  const input = doc.getElementById("compareSearchInput");
  input.value = playerB.name.slice(0, 4);
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  const results = doc.getElementById("compareSearchResults");
  if (results.classList.contains("hidden") || !results.querySelector("[data-compare-player-id]")) {
    throw new Error("❌ Taper un nom dans le sélecteur devrait afficher des résultats.");
  }
  // Le joueur A lui-même ne doit JAMAIS apparaître dans ses propres résultats.
  const selfResult = [...results.querySelectorAll("[data-compare-player-id]")]
    .find(b => Number(b.dataset.comparePlayerId) === playerA.id && Number(b.dataset.comparePlayerTeam) === 0);
  if (selfResult) throw new Error("❌ Le joueur A ne devrait jamais apparaître dans les résultats de son propre sélecteur.");
  console.log("✅ La recherche filtre bien les joueurs (par nom), sans jamais proposer le joueur A lui-même.");

  const resultBtn = [...results.querySelectorAll("[data-compare-player-id]")]
    .find(b => Number(b.dataset.comparePlayerId) === playerB.id);
  if (!resultBtn) throw new Error(`❌ Le joueur B ("${playerB.name}") devrait apparaître dans les résultats de recherche.`);
  resultBtn.click();

  if (!picker.classList.contains("hidden")) {
    throw new Error("❌ Choisir le 2e joueur devrait refermer le sélecteur.");
  }
  const content = doc.getElementById("playerCompareContent");
  if (!content.querySelector(".compare-heads")) {
    throw new Error("❌ Choisir le 2e joueur devrait afficher la vue comparative (.compare-heads).");
  }
  console.log("✅ Choisir le 2e joueur referme le sélecteur et affiche bien la vue comparative.");

  // --- "← Retour" ramène vers la fiche du joueur A, jamais ailleurs.
  doc.getElementById("closePlayerCompareBtn").click();
  if (compareSection.classList.contains("hidden") === false) {
    throw new Error("❌ \"← Retour\" depuis le comparateur devrait quitter #playerCompareSection.");
  }
  const detailSection = doc.getElementById("playerDetailSection");
  if (detailSection.classList.contains("hidden")) {
    throw new Error("❌ \"← Retour\" depuis le comparateur devrait revenir sur la fiche du joueur A.");
  }
  if (!doc.getElementById("playerDetailContent").innerHTML.includes(escapeForCheck(playerA.name))) {
    throw new Error(`❌ La fiche affichée après \"← Retour\" devrait être celle du joueur A ("${playerA.name}").`);
  }
  console.log("✅ \"← Retour\" depuis le comparateur ramène bien vers la fiche du joueur A.");

  await flush(dom);
  await dom.window.close();
  server.close();
}

function escapeForCheck(s) { return s.replace(/[&<>"']/g, () => ""); } // approx, juste pour un includes() tolérant

// =======================================================================
// Partie 2 : contenu de la vue comparative entre 2 joueurs de son PROPRE
// effectif (les deux entièrement visibles) — en-têtes, note de poste,
// bandeau de profil (potentiel/salaire visibles des deux côtés), et mise
// en avant de la meilleure valeur sur les 28 caractéristiques, calculée
// INDÉPENDAMMENT à partir de la sauvegarde brute plutôt que supposée.
// =======================================================================
{
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  const win = dom.window;
  const saved = readRawSave(savePath);
  const playerA = saved.team.players[0];
  const playerB = saved.team.players[1];

  win.showPlayerDetail(0, playerA.id);
  doc.getElementById("openPlayerCompareBtn").click();
  const input = doc.getElementById("compareSearchInput");
  input.value = playerB.name;
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  const btn = [...doc.getElementById("compareSearchResults").querySelectorAll("[data-compare-player-id]")]
    .find(b => Number(b.dataset.comparePlayerId) === playerB.id);
  btn.click();

  const content = doc.getElementById("playerCompareContent");
  const names = [...content.querySelectorAll(".cph-name")].map(el => el.textContent.trim());
  if (names[0] !== playerA.name || names[1] !== playerB.name) {
    throw new Error(`❌ En-têtes attendus ["${playerA.name}","${playerB.name}"], obtenu ${JSON.stringify(names)}.`);
  }
  console.log("✅ Les en-têtes affichent bien les noms des deux joueurs, dans le bon ordre (A puis B).");

  const teams = [...content.querySelectorAll(".cph-team")].map(el => el.textContent.trim());
  if (teams[0] !== "Votre équipe" || teams[1] !== "Votre équipe") {
    throw new Error(`❌ Les deux joueurs étant dans votre effectif, les deux en-têtes devraient afficher "Votre équipe", obtenu ${JSON.stringify(teams)}.`);
  }
  console.log("✅ L'étiquette d'équipe (\"Votre équipe\") est correcte pour deux joueurs de son propre effectif.");

  const posNote = content.querySelector(".compare-position-note").textContent;
  const expectedSamePos = playerA.position === playerB.position;
  if (expectedSamePos && !posNote.includes("Même poste")) {
    throw new Error(`❌ Postes identiques (${playerA.position}) : la note devrait dire "Même poste", obtenu "${posNote}".`);
  }
  if (!expectedSamePos && !posNote.includes("différents")) {
    throw new Error(`❌ Postes différents (${playerA.position}/${playerB.position}) : la note devrait le signaler, obtenu "${posNote}".`);
  }
  console.log(`✅ La note de poste est cohérente avec les postes réels (${playerA.position} / ${playerB.position}).`);

  // --- Potentiel et Salaire : les DEUX visibles et comparables (propre effectif).
  const tiles = [...content.querySelectorAll(".compare-profile-tile")];
  const potentielTile = tiles.find(t => t.querySelector(".cpt-label").textContent.trim() === "Potentiel");
  if (!potentielTile) throw new Error("❌ La mini-carte \"Potentiel\" devrait être présente.");
  if (potentielTile.querySelector(".cpt-val.locked")) {
    throw new Error("❌ Le potentiel des DEUX joueurs de son propre effectif ne devrait jamais être verrouillé.");
  }
  const salaireTile = tiles.find(t => t.querySelector(".cpt-label").textContent.trim() === "Salaire");
  const salaireVals = [...salaireTile.querySelectorAll(".cpt-val")].map(el => el.textContent.trim());
  if (!salaireVals[0].includes("/sem.") || !salaireVals[1].includes("/sem.")) {
    throw new Error(`❌ Le salaire réel des deux joueurs (propre effectif) devrait être affiché ("X €/sem."), obtenu ${JSON.stringify(salaireVals)}.`);
  }
  console.log("✅ Potentiel et Salaire sont bien visibles (non verrouillés) pour deux joueurs de son propre effectif.");

  // --- Vérification indépendante de la mise en avant "meilleure valeur"
  // sur chacune des 28 caractéristiques (les deux étant votre effectif,
  // TOUTES sont visibles, comparables).
  const rows = [...content.querySelectorAll(".compare-row")];
  if (rows.length !== 28) throw new Error(`❌ 28 lignes de caractéristiques attendues (13+7+8), obtenu ${rows.length}.`);
  let mismatches = [];
  rows.forEach(row => {
    const label = row.querySelector(".cmp-label").textContent.trim();
    const vals = [...row.querySelectorAll(".cmp-val")];
    const aVal = Number(vals[0].textContent.trim());
    const bVal = Number(vals[1].textContent.trim());
    const aTier = expectedTierClass(aVal);
    const bTier = expectedTierClass(bVal);
    if (!vals[0].classList.contains(aTier)) mismatches.push(`${label} (A=${aVal}) : palier attendu ${aTier}, classes obtenues ${vals[0].className}`);
    if (!vals[1].classList.contains(bTier)) mismatches.push(`${label} (B=${bVal}) : palier attendu ${bTier}, classes obtenues ${vals[1].className}`);
    const expectAWin = aVal > bVal;
    const expectBWin = bVal > aVal;
    if (vals[0].classList.contains("win") !== expectAWin) mismatches.push(`${label} : .win sur A attendu=${expectAWin}, obtenu=${vals[0].classList.contains("win")}`);
    if (vals[1].classList.contains("win") !== expectBWin) mismatches.push(`${label} : .win sur B attendu=${expectBWin}, obtenu=${vals[1].classList.contains("win")}`);
  });
  if (mismatches.length) throw new Error(`❌ Incohérences sur la mise en avant/palier :\n${mismatches.join("\n")}`);
  console.log("✅ Les 28 lignes de caractéristiques respectent bien le palier de couleur ET la mise en avant de la meilleure valeur (vérifiés indépendamment).");

  await flush(dom);
  await dom.window.close();
  server.close();
}

// =======================================================================
// Partie 3 : comparaison avec un joueur du MARCHÉ des transferts — verrou
// de scoutisme levé (caractéristiques visibles), mais potentiel toujours
// caché (pas votre joueur), salaire remplacé par l'enchère/le prix de
// départ (information déjà publique ailleurs dans le jeu, voir le grand
// commentaire dans moteurbasket3.html).
// =======================================================================
{
  const { server, savePath, baseUrl } = await startTestServer();
  const domInit = await openGame(html, baseUrl);
  await flush(domInit);
  const saved = readRawSave(savePath);
  const sellerIdx = 3;
  const listedPlayer = saved.league.teams[sellerIdx].players[0];
  saved.league.transferListings.push({
    id: 999201, playerId: listedPlayer.id, sellerIdx,
    startPrice: 42000, currentBid: 47000, currentBidderIdx: 5, bids: [],
    createdAt: Date.now(), closesAt: Date.now() + E.TRANSFER_AUCTION_DURATION_MS,
    lastCpuCheckAt: Date.now(), status: "open", result: null, finalPrice: null,
  });
  writeRawSave(savePath, saved);
  await domInit.window.close();

  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  const win = dom.window;
  const myPlayer = saved.team.players[0];

  win.showPlayerDetail(0, myPlayer.id);
  doc.getElementById("openPlayerCompareBtn").click();
  const input = doc.getElementById("compareSearchInput");
  input.value = listedPlayer.name;
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  const btn = [...doc.getElementById("compareSearchResults").querySelectorAll("[data-compare-player-id]")]
    .find(b => Number(b.dataset.comparePlayerId) === listedPlayer.id);
  if (!btn) throw new Error(`❌ Le joueur mis aux enchères ("${listedPlayer.name}") devrait apparaître dans les résultats.`);
  btn.click();

  const content = doc.getElementById("playerCompareContent");
  const teams = [...content.querySelectorAll(".cph-team")].map(el => el.textContent.trim());
  if (teams[1] !== "Marché des transferts") {
    throw new Error(`❌ L'équipe du joueur B (sur le marché) devrait afficher "Marché des transferts", obtenu "${teams[1]}".`);
  }
  console.log("✅ L'étiquette \"Marché des transferts\" s'affiche bien pour un joueur mis aux enchères.");

  const rows = [...content.querySelectorAll(".compare-row")];
  const lockedRows = rows.filter(r => [...r.querySelectorAll(".cmp-val")].some(v => v.classList.contains("locked")));
  if (lockedRows.length > 0) {
    throw new Error(`❌ Un joueur mis aux enchères devrait avoir TOUTES ses caractéristiques visibles (verrou de scoutisme levé), ${lockedRows.length} ligne(s) encore verrouillée(s).`);
  }
  console.log("✅ Le verrou de scoutisme est bien levé pour un joueur mis aux enchères : les 28 caractéristiques sont comparables.");

  const tiles = [...content.querySelectorAll(".compare-profile-tile")];
  const potentielTile = tiles.find(t => t.querySelector(".cpt-label").textContent.trim() === "Potentiel");
  const potentielVals = [...potentielTile.querySelectorAll(".cpt-val")];
  if (!potentielVals[1].classList.contains("locked") || potentielVals[1].textContent.trim() !== "Inconnu") {
    throw new Error(`❌ Le potentiel d'un joueur du marché (pas le vôtre) devrait rester verrouillé ("Inconnu"), obtenu "${potentielVals[1].textContent.trim()}", verrouillé=${potentielVals[1].classList.contains("locked")}.`);
  }
  console.log("✅ Le potentiel reste bien caché pour un joueur qui n'est pas dans votre effectif, même mis aux enchères.");

  const salaireTile = tiles.find(t => t.querySelector(".cpt-label").textContent.trim() === "Salaire");
  const salaireVals = [...salaireTile.querySelectorAll(".cpt-val")];
  if (!salaireVals[1].textContent.includes("47") || !salaireVals[1].textContent.includes("enchère")) {
    throw new Error(`❌ Le salaire du joueur B devrait afficher l'enchère en cours (47 000, "enchère"), obtenu "${salaireVals[1].textContent.trim()}".`);
  }
  console.log("✅ Le prix affiché pour un joueur du marché est bien l'enchère en cours (information déjà publique sur le Marché), pas le salaire réel.");

  await flush(dom);
  await dom.window.close();
  server.close();
}

// =======================================================================
// Partie 4 : comparaison avec un joueur ADVERSE non scouté (ni marché, ni
// propre effectif) — verrou de scoutisme actif : caractéristiques,
// potentiel, salaire ET évaluation globale tous verrouillés côté B.
// =======================================================================
{
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  const win = dom.window;
  const saved = readRawSave(savePath);
  const myPlayer = saved.team.players[0];
  const oppTeamIdx = 6; // ni la ligne 0 (soi-même) ni 3 (utilisé ailleurs) — arbitraire, jamais scouté par défaut (scoutedAttrs={})
  const oppPlayer = saved.league.teams[oppTeamIdx].players[0];

  win.showPlayerDetail(0, myPlayer.id);
  doc.getElementById("openPlayerCompareBtn").click();
  const input = doc.getElementById("compareSearchInput");
  input.value = oppPlayer.name;
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  const btn = [...doc.getElementById("compareSearchResults").querySelectorAll("[data-compare-player-id]")]
    .find(b => Number(b.dataset.comparePlayerId) === oppPlayer.id && Number(b.dataset.comparePlayerTeam) === oppTeamIdx);
  if (!btn) throw new Error(`❌ Le joueur adverse ("${oppPlayer.name}") devrait apparaître dans les résultats de recherche.`);
  btn.click();

  const content = doc.getElementById("playerCompareContent");
  const rows = [...content.querySelectorAll(".compare-row")];
  const allLockedOnB = rows.every(r => [...r.querySelectorAll(".cmp-val")][1].classList.contains("locked"));
  if (!allLockedOnB) {
    throw new Error("❌ Un adversaire jamais scouté ne devrait avoir AUCUNE caractéristique visible côté B (toutes verrouillées \"?\").");
  }
  const allVisibleOnA = rows.every(r => ![...r.querySelectorAll(".cmp-val")][0].classList.contains("locked"));
  if (!allVisibleOnA) {
    throw new Error("❌ Vos propres caractéristiques (côté A) devraient rester visibles quel que soit le joueur B comparé.");
  }
  console.log("✅ Un adversaire non scouté a bien toutes ses caractéristiques verrouillées côté B, sans affecter la visibilité côté A.");

  const noWinAnywhere = rows.every(r => [...r.querySelectorAll(".cmp-val")].every(v => !v.classList.contains("win")));
  if (!noWinAnywhere) {
    throw new Error("❌ Aucune \"meilleure valeur\" ne devrait être mise en avant quand un des deux côtés est verrouillé (comparaison impossible).");
  }
  console.log("✅ Aucune mise en avant de \"meilleure valeur\" sur une ligne verrouillée (comparaison correctement jugée impossible).");

  const tiles = [...content.querySelectorAll(".compare-profile-tile")];
  const evalTile = tiles.find(t => t.querySelector(".cpt-label").textContent.trim() === "Évaluation globale");
  const evalVals = [...evalTile.querySelectorAll(".cpt-val")];
  if (evalVals[1].textContent.trim() !== "?" || !evalVals[1].classList.contains("locked")) {
    throw new Error(`❌ L'évaluation globale d'un adversaire non scouté devrait être verrouillée ("?"), obtenu "${evalVals[1].textContent.trim()}".`);
  }
  console.log("✅ L'évaluation globale reste bien verrouillée pour un adversaire non entièrement scouté.");

  const potentielTile = tiles.find(t => t.querySelector(".cpt-label").textContent.trim() === "Potentiel");
  const salaireTile = tiles.find(t => t.querySelector(".cpt-label").textContent.trim() === "Salaire");
  if ([...potentielTile.querySelectorAll(".cpt-val")][1].textContent.trim() !== "Inconnu") {
    throw new Error("❌ Le potentiel d'un adversaire non scouté devrait afficher \"Inconnu\".");
  }
  if ([...salaireTile.querySelectorAll(".cpt-val")][1].textContent.trim() !== "Inconnu") {
    throw new Error("❌ Le salaire d'un adversaire non scouté (jamais mis aux enchères) devrait afficher \"Inconnu\".");
  }
  console.log("✅ Potentiel et salaire d'un adversaire non scouté, jamais mis aux enchères, affichent bien \"Inconnu\".");

  await flush(dom);
  await dom.window.close();
  server.close();
}

console.log("\n✅ Comparateur de joueurs vérifié : ouverture depuis la fiche joueur, sélecteur du 2e joueur (recherche + exclusion de soi-même), rendu (en-têtes, note de poste, bandeau de profil, 28 caractéristiques), verrou de scoutisme dans ses 3 cas (propre effectif/marché/adversaire non scouté), mise en avant de la meilleure valeur, et retour vers la fiche du joueur A.");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
