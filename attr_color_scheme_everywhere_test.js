// Vérifie que le schéma de couleur rouge/orange/blanc/vert (0-20/21-50/
// 51-80/81+, sans halo), déjà appliqué à la fiche joueur (voir
// pdp_color_scheme_test.js), a bien été étendu partout ailleurs — retour
// utilisateur, 2026-09-23 : "reprends le meme code couleur pour les pages
// effectifs, les joueurs sur le marché des transferts, l'humeur des
// supporters, alchimie, connaissance tactique".
//
// Deux mécanismes distincts portent ce même schéma dans moteurbasket3.html
// (voir leurs commentaires respectifs) :
//   - attrColorTier(value) → un NOM DE CLASSE CSS (attr-tier-red/orange/
//     white/green), posé sur un élément stylé par feuille de style — utilisé
//     par .pdp-attr-value/.pdp-overall-num (fiche joueur) ET .attr-cell
//     (Effectif/Marché/fiche équipe adverse/Académie de jeunes).
//   - moraleGaugeColor(value) → une COULEUR LITTÉRALE ("var(--danger)",
//     "var(--amber)", "var(--ink)", "#3ecf67"), pour les jauges dont la
//     couleur est posée en style INLINE dynamique — Humeur des supporters,
//     Alchimie, Connaissance tactique.
// Les deux utilisent exactement les mêmes seuils/couleurs (voir leurs
// commentaires croisés dans moteurbasket3.html) : ce test le vérifie
// indépendamment sur les DEUX mécanismes, sur chaque écran concerné.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, writeRawSave } = require("./test_helpers.js");
const E = require("./engine.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

// Calcul indépendant du palier CLASSE attendu (attrColorTier), pour ne
// jamais dépendre de la fonction elle-même.
function expectedTierClass(value) {
  if (value <= 20) return "attr-tier-red";
  if (value <= 50) return "attr-tier-orange";
  if (value <= 80) return "attr-tier-white";
  return "attr-tier-green";
}
// Calcul indépendant de la COULEUR LITTÉRALE attendue (moraleGaugeColor).
function expectedLiteralColor(value) {
  if (value <= 20) return "var(--danger)";
  if (value <= 50) return "var(--amber)";
  if (value <= 80) return "var(--ink)";
  return "#3ecf67";
}
// jsdom NORMALISE un `style.color = "#3ecf67"` (couleur hex résoluble) en
// "rgb(62, 207, 103)" une fois relu depuis `.style.color`/`.style.background`
// — contrairement à un `var(--xxx)` qu'il laisse tel quel (il ne peut pas le
// résoudre sans moteur CSS complet). Sans cette normalisation, la comparaison
// échouerait uniquement sur le palier vert, pour une raison purement liée à
// l'outil de test, pas à un vrai bug. On compare donc les deux formes
// possibles plutôt qu'une chaîne unique.
function colorMatches(actual, expected) {
  if (actual === expected) return true;
  if (expected === "#3ecf67") return actual === "rgb(62, 207, 103)";
  return false;
}

(async () => {

const { server, savePath, baseUrl } = await startTestServer();

// ---------------------------------------------------------------------
// Partie 1 : Effectif (sous-onglet Caractéristiques, .attr-cell).
// ---------------------------------------------------------------------
{
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;

  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "effectif").click();
  const subTabBtn = [...doc.querySelectorAll("[data-effectif-subview]")].find(b => b.dataset.effectifSubview === "caracteristiques");
  if (!subTabBtn) throw new Error("❌ (setup) le sous-onglet 'Caractéristiques' devrait être présent sur l'Effectif.");
  subTabBtn.click();

  const cells = [...doc.querySelectorAll("#rosterContent .attr-cell")];
  if (cells.length === 0) throw new Error("❌ (setup) l'Effectif (Caractéristiques) devrait afficher des .attr-cell.");
  console.log(`[Effectif] .attr-cell trouvées : ${cells.length}`);
  let mismatches = [];
  cells.forEach(cell => {
    const valEl = cell.querySelector(".attr-val");
    if (!valEl) return; // cellule verrouillée (.attr-locked), pas de valeur chiffrée
    const value = parseInt(valEl.textContent, 10);
    const expected = expectedTierClass(value);
    if (!cell.classList.contains(expected)) {
      mismatches.push(`valeur ${value} → attendu .${expected}, classes réelles "${cell.className}"`);
    }
    if (["attr-elite", "attr-good", "attr-mid", "attr-lo"].some(c => cell.classList.contains(c))) {
      mismatches.push(`valeur ${value} porte encore une classe de l'ANCIENNE échelle (${cell.className})`);
    }
  });
  if (mismatches.length > 0) throw new Error(`❌ [Effectif] Paliers incorrects :\n${mismatches.join("\n")}`);
  console.log("✅ [Effectif] Toutes les .attr-cell respectent le nouveau palier rouge/orange/blanc/vert, aucune trace de l'ancienne échelle.");

  await flush(dom);
  dom.window.close();
  server.close();
}

// ---------------------------------------------------------------------
// Partie 2 : Marché des transferts (.market-attr-chip .attr-cell).
// ---------------------------------------------------------------------
{
  const { server: server2, savePath: savePath2, baseUrl: baseUrl2 } = await startTestServer();
  const domInit = await openGame(html, baseUrl2);
  await flush(domInit);
  const saved = readRawSave(savePath2);
  // Annonce injectée directement dans la sauvegarde (même pattern que
  // transfer_market_test.js) : un joueur d'une équipe CPU (index 3) mis aux
  // enchères, pour avoir une carte de marché déterministe à inspecter.
  const sellerIdx = 3;
  saved.league.transferListings.push({
    id: 999101, playerId: saved.league.teams[sellerIdx].players[0].id, sellerIdx,
    startPrice: 50000, currentBid: null, currentBidderIdx: null, bids: [],
    createdAt: Date.now(), closesAt: Date.now() + E.TRANSFER_AUCTION_DURATION_MS,
    lastCpuCheckAt: Date.now(), status: "open", result: null, finalPrice: null,
  });
  writeRawSave(savePath2, saved);
  await domInit.window.close();

  const dom = await openGame(html, baseUrl2);
  const doc = dom.window.document;
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "marche").click();

  const card = doc.querySelector('#marketListings .market-card[data-listing-id="999101"]');
  if (!card) throw new Error("❌ (setup) La carte de l'annonce injectée (999101) devrait être affichée sur le Marché.");
  const chips = [...card.querySelectorAll(".market-attr-chip .attr-cell")];
  if (chips.length === 0) throw new Error("❌ (setup) La carte de marché devrait afficher des .market-attr-chip .attr-cell (caractéristiques du joueur).");
  console.log(`[Marché] .attr-cell trouvées sur la carte : ${chips.length}`);
  let mismatches = [];
  chips.forEach(cell => {
    const valEl = cell.querySelector(".attr-val");
    if (!valEl) return;
    const value = parseInt(valEl.textContent, 10);
    const expected = expectedTierClass(value);
    if (!cell.classList.contains(expected)) {
      mismatches.push(`valeur ${value} → attendu .${expected}, classes réelles "${cell.className}"`);
    }
  });
  if (mismatches.length > 0) throw new Error(`❌ [Marché] Paliers incorrects :\n${mismatches.join("\n")}`);
  console.log("✅ [Marché] Les caractéristiques du joueur mis aux enchères respectent le nouveau palier rouge/orange/blanc/vert.");

  await flush(dom);
  dom.window.close();
  server2.close();
}

// ---------------------------------------------------------------------
// Partie 3 : Humeur des supporters (#moraleValue / #moraleGaugeFill) —
// vérifié à PLUSIEURS valeurs de fanMorale (patchée directement dans la
// sauvegarde) pour couvrir les 4 paliers, pas seulement la valeur de départ.
// ---------------------------------------------------------------------
{
  const { server: server3, savePath: savePath3, baseUrl: baseUrl3 } = await startTestServer();
  const testValues = [10, 35, 65, 92]; // un par palier : rouge/orange/blanc/vert
  for (const testValue of testValues) {
    const domInit = await openGame(html, baseUrl3);
    await flush(domInit);
    const saved = readRawSave(savePath3);
    saved.team.fanMorale = testValue;
    saved.league.teams[0].fanMorale = testValue;
    writeRawSave(savePath3, saved);
    await domInit.window.close();

    const dom = await openGame(html, baseUrl3);
    const doc = dom.window.document;
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "humeur").click();

    const valueEl = doc.getElementById("moraleValue");
    const fillEl = doc.getElementById("moraleGaugeFill");
    if (!valueEl || !fillEl) throw new Error("❌ (setup) #moraleValue/#moraleGaugeFill introuvables sur l'écran Humeur des supporters.");
    const expected = expectedLiteralColor(testValue);
    console.log(`[Humeur] fanMorale=${testValue} → couleur affichée "${valueEl.style.color}" (attendu "${expected}")`);
    if (!colorMatches(valueEl.style.color, expected)) {
      throw new Error(`❌ [Humeur] fanMorale=${testValue} : couleur du chiffre "${valueEl.style.color}", attendu "${expected}".`);
    }
    if (!colorMatches(fillEl.style.background, expected)) {
      throw new Error(`❌ [Humeur] fanMorale=${testValue} : couleur de la jauge "${fillEl.style.background}", attendu "${expected}".`);
    }
    await flush(dom);
    dom.window.close();
  }
  server3.close();
  console.log("✅ [Humeur des supporters] Les 4 paliers (rouge/orange/blanc/vert) sont correctement affichés sur le chiffre et la jauge.");
}

// ---------------------------------------------------------------------
// Partie 4 : Alchimie (.chemistry) — jauge Ordres, carte Tableau de bord,
// jauge compacte de l'Effectif — même schéma, 3 emplacements différents.
// ---------------------------------------------------------------------
{
  const { server: server4, savePath: savePath4, baseUrl: baseUrl4 } = await startTestServer();
  const testValue = 15; // rouge, bien distinct du neutre 50 par défaut
  const domInit = await openGame(html, baseUrl4);
  await flush(domInit);
  const saved = readRawSave(savePath4);
  saved.team.chemistry = testValue;
  saved.league.teams[0].chemistry = testValue;
  writeRawSave(savePath4, saved);
  await domInit.window.close();

  const dom = await openGame(html, baseUrl4);
  const doc = dom.window.document;
  const expected = expectedLiteralColor(testValue);

  // Ordres.
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ordres").click();
  const ordresChemValue = doc.getElementById("ordresChemistryValue");
  if (!ordresChemValue) throw new Error("❌ (setup) #ordresChemistryValue introuvable sur Ordres.");
  if (!colorMatches(ordresChemValue.style.color, expected)) {
    throw new Error(`❌ [Alchimie/Ordres] chemistry=${testValue} : couleur "${ordresChemValue.style.color}", attendu "${expected}".`);
  }
  console.log("✅ [Alchimie/Ordres] Jauge d'alchimie correctement colorée.");

  // Tableau de bord.
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "club").click();
  const chemCardTitle = [...doc.querySelectorAll("#clubStatsGrid h3")].find(h => h.textContent.trim() === "Alchimie");
  if (!chemCardTitle) throw new Error("❌ (setup) Carte 'Alchimie' introuvable sur le Tableau de bord.");
  const chemCardBig = chemCardTitle.closest(".stat-card").querySelector(".big");
  if (!colorMatches(chemCardBig.style.color, expected)) {
    throw new Error(`❌ [Alchimie/Tableau de bord] chemistry=${testValue} : couleur "${chemCardBig.style.color}", attendu "${expected}".`);
  }
  console.log("✅ [Alchimie/Tableau de bord] Carte 'Alchimie' correctement colorée.");

  // Effectif (jauge compacte sous le titre de l'onglet).
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "effectif").click();
  const rosterChemValue = doc.getElementById("rosterChemistryValue");
  if (!rosterChemValue) throw new Error("❌ (setup) #rosterChemistryValue introuvable sur l'Effectif.");
  if (!colorMatches(rosterChemValue.style.color, expected)) {
    throw new Error(`❌ [Alchimie/Effectif] chemistry=${testValue} : couleur "${rosterChemValue.style.color}", attendu "${expected}".`);
  }
  console.log("✅ [Alchimie/Effectif] Jauge compacte correctement colorée.");

  await flush(dom);
  dom.window.close();
  server4.close();
}

// ---------------------------------------------------------------------
// Partie 5 : Connaissance tactique — jauge Ordres (moyenne des options
// sélectionnées) ET jauges par option du menu déroulant d'entraînement
// (optionGaugeHtml, 18 options).
// ---------------------------------------------------------------------
{
  const dom = await (async () => {
    const { server: server5, baseUrl: baseUrl5 } = await startTestServer();
    const d = await openGame(html, baseUrl5);
    d.window.__testServer5 = server5;
    return d;
  })();
  const doc = dom.window.document;

  // Ordres : la moyenne dépend des ordres réellement choisis par teamA, donc
  // calculée indépendamment ici à partir de teamA.tacticalKnowledge/ordres
  // plutôt que patchée à une valeur fixe (plus simple de la lire depuis le
  // moteur, déjà exposé côté fenêtre, que de deviner les clés d'ordres).
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ordres").click();
  const tacticValueEl = doc.getElementById("ordresTacticalKnowledgeValue");
  if (!tacticValueEl) throw new Error("❌ (setup) #ordresTacticalKnowledgeValue introuvable sur Ordres.");
  const avg = dom.window.eval(`
    (function() {
      const knowledge = teamA.tacticalKnowledge;
      const offenseValues = (teamA.offensivePriorities || []).map(p => knowledge.offense[p] ?? 50);
      const offenseAvg = offenseValues.length ? offenseValues.reduce((s, v) => s + v, 0) / offenseValues.length : 50;
      const defenseVal = knowledge.defense[teamA.defense] ?? 50;
      const rhythmVal = knowledge.rhythm[teamA.rhythm] ?? 50;
      return (offenseAvg + defenseVal + rhythmVal) / 3;
    })()
  `);
  const expectedOrdres = expectedLiteralColor(avg);
  console.log(`[Connaissance tactique/Ordres] moyenne=${avg.toFixed(1)} → couleur affichée "${tacticValueEl.style.color}" (attendu "${expectedOrdres}")`);
  if (!colorMatches(tacticValueEl.style.color, expectedOrdres)) {
    throw new Error(`❌ [Connaissance tactique/Ordres] couleur "${tacticValueEl.style.color}", attendu "${expectedOrdres}".`);
  }
  console.log("✅ [Connaissance tactique/Ordres] Jauge correctement colorée.");

  // Menu déroulant d'entraînement (optionGaugeHtml, une jauge par option de
  // tactique travaillable — voir trained_tactic_dropdown_test.js pour la
  // structure générale du menu, non ré-testée ici). Le picker reste masqué
  // tant que l'entraînement collectif n'est pas réglé sur "tactique" (même
  // mécanique que trained_tactic_dropdown_test.js).
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "entrainement").click();
  const collectiveSel = doc.getElementById("collectiveTrainingSelect");
  if (!collectiveSel) throw new Error("❌ (setup) #collectiveTrainingSelect introuvable.");
  collectiveSel.value = "tactique";
  collectiveSel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  // Le menu (#trainedTacticMenu) est construit PARESSEUSEMENT (renderMenu(),
  // voir renderTrainedTacticsPicker) : vide tant que le bouton déclencheur
  // n'a pas été cliqué au moins une fois.
  const trigger = doc.getElementById("trainedTacticTrigger");
  if (!trigger) throw new Error("❌ (setup) #trainedTacticTrigger introuvable.");
  trigger.click();
  const options = [...doc.querySelectorAll("#trainedTacticMenu .trained-tactic-option")];
  if (options.length === 0) throw new Error("❌ (setup) Le menu déroulant des tactiques travaillées devrait afficher des options.");
  console.log(`[Connaissance tactique/Entraînement] options trouvées : ${options.length}`);
  let mismatches = [];
  options.forEach(opt => {
    const valueEl = opt.querySelector(".tto-value");
    const fillEl = opt.querySelector(".tto-gauge-fill");
    if (!valueEl || !fillEl) return;
    const value = parseInt(valueEl.textContent, 10);
    const expected = expectedLiteralColor(value);
    if (!colorMatches(valueEl.style.color, expected)) {
      mismatches.push(`valeur ${value} : couleur chiffre "${valueEl.style.color}", attendu "${expected}"`);
    }
    if (!colorMatches(fillEl.style.background, expected)) {
      mismatches.push(`valeur ${value} : couleur jauge "${fillEl.style.background}", attendu "${expected}"`);
    }
  });
  if (mismatches.length > 0) throw new Error(`❌ [Connaissance tactique/Entraînement] Paliers incorrects :\n${mismatches.join("\n")}`);
  console.log("✅ [Connaissance tactique/Entraînement] Les jauges par option du menu déroulant respectent le nouveau palier.");

  await flush(dom);
  dom.window.close();
  dom.window.__testServer5.close();
}

console.log("\n✅ Le schéma de couleur rouge/orange/blanc/vert (sans halo) est cohérent sur : Effectif, Marché des transferts, Humeur des supporters, Alchimie (3 emplacements) et Connaissance tactique (2 emplacements).");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
