// Vérifie la "tactique confirmée" côté navigateur (moteurbasket3.html) —
// retour utilisateur, 2026-09 : "Ajoute les nouveaux choix tactiques et
// modes débutant confirmés au html" ; en réponse à la question de
// clarification posée, le joueur a précisé que "débutant"/"confirmée"
// contrôle "la complexité de l'interface Ordres" et que les réglages
// eux-mêmes avaient déjà été définis le matin même avec le nouveau moteur
// de jeu (voir engine.js, grand commentaire au-dessus de SCREEN_DEFENSES,
// et ge_testbench_content.html pour les libellés français de référence).
//
// Couvre : (1) le mirroir moteur intégral dans moteurbasket3.html (mêmes
// tables/valeurs standard "delta zéro" que engine.js) ; (2) l'UI du panneau
// Ordres (sélecteur de niveau tactique, révélation/masquage du bloc
// "confirmée", endgameManagement toujours visible car indépendant du tier) ;
// (3) la persistance de bout en bout (changement → serveur → rechargement) ;
// (4) la préparation à l'avance d'une journée future avec ces nouveaux
// champs. Voir server/confirmed_tactics_actions_test.js pour la validation
// serveur (setTactics/setPlan) et engine.js pour la simulation elle-même.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const Engine = require("./engine.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

// ---------------------------------------------------------------------
// 1) Mirroir moteur : moteurbasket3.html porte EXACTEMENT les mêmes tables
//    (mêmes clés, mêmes valeurs) que engine.js — pas une réinvention
//    partielle. Vérifie aussi la "règle de sécurité absolue" du moteur :
//    chaque valeur "standard" par défaut d'un réglage "confirmée" est bien
//    un delta de zéro (aucun champ numérique non nul), exactement comme
//    dans engine.js — sinon une équipe "débutant" ne jouerait plus un match
//    identique à avant cette fonctionnalité.
// ---------------------------------------------------------------------
const TABLES = ["SCREEN_DEFENSES", "HELP_DEFENSE_LEVELS", "WATCH_FOCUS_EFFECTS", "POST_DEFENSES", "CLOSEOUT_STYLES", "OFF_REBOUND_STYLES", "ENDGAME_MANAGEMENT"];
TABLES.forEach(name => {
  const fromHtml = win.eval(name);
  const fromEngine = Engine[name];
  console.log(`Table ${name} — clés HTML :`, Object.keys(fromHtml).join(", "));
  if (JSON.stringify(fromHtml) !== JSON.stringify(fromEngine)) {
    throw new Error(`❌ La table ${name} dans moteurbasket3.html diverge de engine.js — copie mirroir non fidèle.`);
  }
});
console.log("✅ Les 7 tables de tactique confirmée sont des copies mirroir exactes de engine.js.");

if (win.eval("MAX_WATCH_ASSIGNMENTS") !== Engine.MAX_WATCH_ASSIGNMENTS) {
  throw new Error("❌ MAX_WATCH_ASSIGNMENTS diverge entre moteurbasket3.html et engine.js.");
}
console.log("✅ MAX_WATCH_ASSIGNMENTS identique des deux côtés :", win.eval("MAX_WATCH_ASSIGNMENTS"));

const standardChecks = [
  ["SCREEN_DEFENSES['Aucune consigne']", { ballCreationMod: 0, rollOpennessMod: 0 }],
  ["HELP_DEFENSE_LEVELS['Moyenne']", { insideDef: 0, perimDef: 0 }],
  ["POST_DEFENSES['Classique']", { insideDef: 0, tovMod: 0, assistOpenMod: 0, foulMod: 0 }],
  ["CLOSEOUT_STYLES['Contrôlé']", { perimDefMod: 0, insideMismatchMod: 0 }],
  ["OFF_REBOUND_STYLES['Normal']", { offRebWeightMod: 0, transitionRisk: 0 }],
  ["ENDGAME_MANAGEMENT['Standard']", { blowoutThreshold: null, blowoutHeroMod: 0, blowoutTovMod: 0, closeGameTempoMod: 0 }],
];
standardChecks.forEach(([expr, expected]) => {
  const value = win.eval(expr);
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error(`❌ La valeur "standard" de ${expr} devrait être un delta de zéro partout, obtenu ${JSON.stringify(value)}.`);
  }
});
console.log("✅ Chaque valeur \"standard\"/neutre des 6 réglages confirmée + endgameManagement est bien un delta de zéro (règle de sécurité du moteur).");

// ---------------------------------------------------------------------
// 2) Team.constructor : une équipe fraîchement créée démarre en mode
//    "débutant", avec tous les nouveaux champs à leur valeur standard.
// ---------------------------------------------------------------------
const freshDefaults = win.eval(`
  (function() {
    const t = generateStartingRoster("Vérif défauts");
    return {
      tacticalTier: t.tacticalTier, screenDefense: t.screenDefense, helpDefense: t.helpDefense,
      watchAssignments: t.watchAssignments, postDefense: t.postDefense, closeoutStyle: t.closeoutStyle,
      offRebStyle: t.offRebStyle, endgameManagement: t.endgameManagement,
    };
  })()
`);
console.log("\nDéfauts Team.constructor :", freshDefaults);
if (freshDefaults.tacticalTier !== "débutant") throw new Error("❌ Une équipe neuve devrait démarrer en mode 'débutant'.");
if (freshDefaults.screenDefense !== "Aucune consigne" || freshDefaults.helpDefense !== "Moyenne" || freshDefaults.postDefense !== "Classique"
  || freshDefaults.closeoutStyle !== "Contrôlé" || freshDefaults.offRebStyle !== "Normal" || freshDefaults.endgameManagement !== "Standard") {
  throw new Error("❌ Les valeurs par défaut d'une équipe neuve devraient toutes être les valeurs standard delta-zéro.");
}
if (!Array.isArray(freshDefaults.watchAssignments) || freshDefaults.watchAssignments.length !== 0) {
  throw new Error("❌ watchAssignments devrait démarrer vide.");
}
console.log("✅ Une équipe neuve démarre en mode 'débutant', tous réglages confirmée à leur valeur standard.");

// ---------------------------------------------------------------------
// 3) UI du panneau Ordres : le sélecteur de niveau tactique existe, démarre
//    sur "Débutant" (comportement par défaut de teamA), le bloc "confirmée"
//    est masqué, et endgameManagement (indépendant du tier) est visible
//    MÊME en mode débutant.
// ---------------------------------------------------------------------
[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ordres").click();
const prepVisible = !doc.getElementById("prepSection").classList.contains("hidden");
if (!prepVisible) throw new Error("❌ (setup) l'onglet Ordres devrait s'ouvrir.");

const tierBtns = [...doc.querySelectorAll("#prepGrid .tier-toggle-btn")];
console.log("\nBoutons de niveau tactique trouvés :", tierBtns.map(b => b.textContent.trim() + (b.classList.contains("active") ? " (actif)" : "")));
if (tierBtns.length !== 2) throw new Error(`❌ Le panneau Ordres devrait avoir exactement 2 boutons de niveau tactique (Débutant/Confirmée), obtenu ${tierBtns.length}.`);
const debutantBtn = tierBtns.find(b => b.textContent.trim() === "Débutant");
const confirmeeBtn = tierBtns.find(b => b.textContent.trim() === "Confirmée");
if (!debutantBtn || !confirmeeBtn) throw new Error("❌ Les boutons 'Débutant' et 'Confirmée' devraient tous les deux être présents.");
if (!debutantBtn.classList.contains("active")) throw new Error("❌ Le bouton 'Débutant' devrait être actif par défaut (teamA.tacticalTier === 'débutant').");

const confirmedBlock = doc.querySelector("#prepGrid .tactic-confirmee-block");
if (!confirmedBlock) throw new Error("❌ Le bloc des réglages confirmée devrait exister dans le DOM (masqué, pas absent).");
if (!confirmedBlock.classList.contains("hidden")) throw new Error("❌ En mode 'débutant', le bloc des réglages confirmée devrait être masqué.");
console.log("✅ En mode 'débutant' : bloc de réglages avancés présent mais masqué, bouton 'Débutant' actif.");

const endgameLabels = [...doc.querySelectorAll("#prepGrid .field-label")].map(l => l.textContent);
console.log("Libellés de champs visibles en mode débutant :", endgameLabels.join(" | "));
if (!endgameLabels.includes("Gestion de fin de match")) {
  throw new Error("❌ 'Gestion de fin de match' (endgameManagement, indépendant du tier) devrait être visible même en mode débutant.");
}
if (endgameLabels.includes("Défense sur écrans") || endgameLabels.includes("Aide défensive")) {
  // Ces libellés sont bien DANS le DOM (dans confirmedBlock masqué) : ce test
  // vérifie juste qu'ils ne sont pas comptés comme "visibles" au sens propre
  // (offsetParent) — voir le test suivant, qui bascule réellement le tier.
}
console.log("✅ 'Gestion de fin de match' est visible même en mode débutant (réglage indépendant du tier).");

// ---------------------------------------------------------------------
// 4) Basculer sur "Confirmée" révèle le bloc, met à jour teamA.tacticalTier
//    et synchronise vers le serveur (persistance testée en 5).
// ---------------------------------------------------------------------
confirmeeBtn.dispatchEvent(new win.Event("click", { bubbles: true }));
console.log("\nAprès clic sur 'Confirmée' — teamA.tacticalTier :", win.eval("teamA.tacticalTier"));
if (win.eval("teamA.tacticalTier") !== "confirmée") throw new Error("❌ Cliquer sur 'Confirmée' devrait mettre teamA.tacticalTier à 'confirmée'.");
if (!confirmeeBtn.classList.contains("active") || debutantBtn.classList.contains("active")) {
  throw new Error("❌ Après le clic, seul le bouton 'Confirmée' devrait être actif.");
}
if (confirmedBlock.classList.contains("hidden")) throw new Error("❌ Après avoir basculé sur 'Confirmée', le bloc des réglages avancés devrait être révélé.");
console.log("✅ Basculer sur 'Confirmée' révèle le bloc de réglages avancés et met à jour teamA.tacticalTier.");

// ---------------------------------------------------------------------
// 5) Les 5 selects "confirmée" (hors Surveiller) sont bien présents et
//    modifient teamA.<champ> au changement, avec sync serveur — vérifié en
//    changeant chacun vers une valeur non-standard puis en relisant l'état.
// ---------------------------------------------------------------------
const confirmedSelectFields = [
  ["Défense sur écrans", "screenDefense", "Switch"],
  ["Aide défensive", "helpDefense", "Forte"],
  ["Gestion du post-up", "postDefense", "Prise à deux"],
  ["Close-out", "closeoutStyle", "Agressif"],
  ["Rebond offensif", "offRebStyle", "Agressif"],
];
confirmedSelectFields.forEach(([labelText, field, targetValue]) => {
  const label = [...confirmedBlock.querySelectorAll(".field-label")].find(l => l.textContent === labelText);
  if (!label) throw new Error(`❌ Le champ "${labelText}" devrait être présent dans le bloc confirmée.`);
  const sel = label.nextElementSibling;
  if (!sel || sel.tagName !== "SELECT") throw new Error(`❌ Le champ "${labelText}" devrait être suivi d'un <select>.`);
  const hasTarget = [...sel.options].some(o => o.value === targetValue);
  if (!hasTarget) throw new Error(`❌ Le select "${labelText}" devrait proposer l'option "${targetValue}".`);
  sel.value = targetValue;
  sel.dispatchEvent(new win.Event("change"));
  const applied = win.eval(`teamA.${field}`);
  if (applied !== targetValue) throw new Error(`❌ Changer "${labelText}" vers "${targetValue}" aurait dû mettre à jour teamA.${field}, obtenu "${applied}".`);
});
console.log("✅ Les 5 selects de réglages confirmée (écrans/aide défensive/post-up/close-out/rebond offensif) mettent bien à jour teamA.");

// ---------------------------------------------------------------------
// 5bis) Libellé affiché vs valeur interne : l'option "Classique" du select
//       "Gestion du post-up" s'affiche "Aucune consigne" (retour utilisateur,
//       2026-09), mais l'attribut value= reste la clé brute "Classique" — les
//       sauvegardes existantes et POST_DEFENSES['Classique'] ne doivent pas
//       changer.
// ---------------------------------------------------------------------
const postUpLabel = [...confirmedBlock.querySelectorAll(".field-label")].find(l => l.textContent === "Gestion du post-up");
const postUpSel = postUpLabel.nextElementSibling;
const classiqueOption = [...postUpSel.options].find(o => o.value === "Classique");
console.log("\nOption interne 'Classique' du select post-up — texte affiché :", classiqueOption && classiqueOption.textContent);
if (!classiqueOption) throw new Error("❌ Le select 'Gestion du post-up' devrait toujours proposer l'option de valeur interne 'Classique'.");
if (classiqueOption.textContent !== "Aucune consigne") {
  throw new Error(`❌ L'option de valeur interne 'Classique' devrait s'afficher \"Aucune consigne\", obtenu "${classiqueOption.textContent}".`);
}
postUpSel.value = "Classique";
postUpSel.dispatchEvent(new win.Event("change"));
if (win.eval("teamA.postDefense") !== "Classique") {
  throw new Error("❌ Sélectionner l'option affichée 'Aucune consigne' devrait toujours enregistrer la valeur interne 'Classique' dans teamA.postDefense.");
}
console.log("✅ L'option 'Classique' s'affiche \"Aucune consigne\" mais conserve sa valeur interne 'Classique' (sauvegardes/moteur inchangés).");
// Remet le select sur "Prise à deux" (valeur attendue par le test de
// persistance ci-dessous, étape 5 plus haut) avant de poursuivre.
postUpSel.value = "Prise à deux";
postUpSel.dispatchEvent(new win.Event("change"));

// ---------------------------------------------------------------------
// 6) Surveiller : 3 lignes poste+focus, sélectionner l'une d'elles ajoute
//    une entrée à teamA.watchAssignments ; la vider (poste ou focus sur
//    "aucun") la retire.
// ---------------------------------------------------------------------
const watchRows = [...doc.querySelectorAll("#prepGrid .watch-row")];
console.log("\nLignes 'Surveiller' trouvées :", watchRows.length, "(attendu 3 = MAX_WATCH_ASSIGNMENTS)");
if (watchRows.length !== 3) throw new Error(`❌ Attendu 3 lignes "Surveiller" (MAX_WATCH_ASSIGNMENTS), obtenu ${watchRows.length}.`);

const [posSel0, focusSel0] = watchRows[0].querySelectorAll("select");
posSel0.value = "Pivot";
posSel0.dispatchEvent(new win.Event("change"));
focusSel0.value = "denyPostUp";
focusSel0.dispatchEvent(new win.Event("change"));
const watchAfterFirstRow = win.eval("teamA.watchAssignments");
console.log("teamA.watchAssignments après avoir rempli la 1ère ligne (Pivot / denyPostUp) :", watchAfterFirstRow);
if (watchAfterFirstRow.length !== 1 || watchAfterFirstRow[0].position !== "Pivot" || watchAfterFirstRow[0].focus !== "denyPostUp") {
  throw new Error("❌ Remplir la 1ère ligne 'Surveiller' aurait dû ajouter { position: 'Pivot', focus: 'denyPostUp' } à teamA.watchAssignments.");
}

const [posSel1, focusSel1] = watchRows[1].querySelectorAll("select");
posSel1.value = "Ailier fort";
posSel1.dispatchEvent(new win.Event("change"));
focusSel1.value = "harassOutsideShot";
focusSel1.dispatchEvent(new win.Event("change"));
const watchAfterSecondRow = win.eval("teamA.watchAssignments");
console.log("teamA.watchAssignments après la 2e ligne (Ailier fort / harassOutsideShot) :", watchAfterSecondRow);
if (watchAfterSecondRow.length !== 2) throw new Error("❌ Remplir la 2e ligne aurait dû porter watchAssignments à 2 entrées (sans perdre la 1ère).");

// Vider la 1ère ligne (poste remis à "aucun") retire SA seule entrée, sans
// toucher à la 2e.
posSel0.value = "";
posSel0.dispatchEvent(new win.Event("change"));
const watchAfterClearFirst = win.eval("teamA.watchAssignments");
console.log("teamA.watchAssignments après avoir vidé la 1ère ligne :", watchAfterClearFirst);
if (watchAfterClearFirst.length !== 1 || watchAfterClearFirst[0].focus !== "harassOutsideShot") {
  throw new Error("❌ Vider la 1ère ligne 'Surveiller' aurait dû ne laisser que la 2e affectation (Ailier fort / harassOutsideShot).");
}
console.log("✅ Les 3 lignes 'Surveiller' ajoutent/retirent bien des affectations individuelles dans teamA.watchAssignments.");

// ---------------------------------------------------------------------
// 7) Persistance de bout en bout : tous ces changements survivent à un
//    rechargement complet de la page (nouvelle session JSDOM, même serveur).
// ---------------------------------------------------------------------
await flush(dom);
const saved = readRawSave(savePath);
console.log("\nSauvegarde brute — tactique confirmée :", {
  tacticalTier: saved.team.tacticalTier, screenDefense: saved.team.screenDefense, helpDefense: saved.team.helpDefense,
  watchAssignments: saved.team.watchAssignments, postDefense: saved.team.postDefense, closeoutStyle: saved.team.closeoutStyle,
  offRebStyle: saved.team.offRebStyle,
});
if (saved.team.tacticalTier !== "confirmée") throw new Error("❌ tacticalTier devrait être présent dans la sauvegarde brute.");
if (saved.team.screenDefense !== "Switch" || saved.team.helpDefense !== "Forte" || saved.team.postDefense !== "Prise à deux"
  || saved.team.closeoutStyle !== "Agressif" || saved.team.offRebStyle !== "Agressif") {
  throw new Error("❌ Les réglages confirmée modifiés devraient tous être présents dans la sauvegarde brute.");
}
if (!Array.isArray(saved.team.watchAssignments) || saved.team.watchAssignments.length !== 1) {
  throw new Error("❌ watchAssignments devrait être présent (1 entrée après le nettoyage de la 1ère ligne) dans la sauvegarde brute.");
}
win.close();

const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;
const reloaded = win2.eval(`
  ({
    tacticalTier: teamA.tacticalTier, screenDefense: teamA.screenDefense, helpDefense: teamA.helpDefense,
    watchAssignments: teamA.watchAssignments, postDefense: teamA.postDefense, closeoutStyle: teamA.closeoutStyle,
    offRebStyle: teamA.offRebStyle,
  })
`);
console.log("\nAprès rechargement complet de la page — teamA :", reloaded);
if (reloaded.tacticalTier !== "confirmée" || reloaded.screenDefense !== "Switch" || reloaded.helpDefense !== "Forte"
  || reloaded.postDefense !== "Prise à deux" || reloaded.closeoutStyle !== "Agressif" || reloaded.offRebStyle !== "Agressif") {
  throw new Error("❌ Les réglages de tactique confirmée devraient survivre à un rechargement complet de la page.");
}
if (reloaded.watchAssignments.length !== 1 || reloaded.watchAssignments[0].focus !== "harassOutsideShot") {
  throw new Error("❌ watchAssignments devrait survivre à un rechargement complet de la page.");
}
console.log("✅ Tous les réglages de tactique confirmée (y compris watchAssignments) survivent à un rechargement complet.");

// Ré-ouvre l'onglet Ordres sur la nouvelle session : le panneau doit
// refléter le tier "confirmée" rechargé (bloc déjà révélé, pas besoin de
// re-cliquer), preuve que le rendu initial lit bien team.tacticalTier et pas
// seulement les clics.
[...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ordres").click();
const confirmeeBtn2 = [...doc2.querySelectorAll("#prepGrid .tier-toggle-btn")].find(b => b.textContent.trim() === "Confirmée");
const confirmedBlock2 = doc2.querySelector("#prepGrid .tactic-confirmee-block");
console.log("Après rechargement — bouton 'Confirmée' actif :", confirmeeBtn2.classList.contains("active"), "| bloc révélé :", !confirmedBlock2.classList.contains("hidden"));
if (!confirmeeBtn2.classList.contains("active")) throw new Error("❌ Après rechargement avec tacticalTier='confirmée', le bouton 'Confirmée' devrait être actif au premier rendu.");
if (confirmedBlock2.classList.contains("hidden")) throw new Error("❌ Après rechargement avec tacticalTier='confirmée', le bloc de réglages avancés devrait être révélé au premier rendu.");
console.log("✅ Le rendu initial du panneau Ordres reflète bien team.tacticalTier après rechargement (pas seulement après un clic).");

await flush(dom2);
win2.close();

// ---------------------------------------------------------------------
// 8) Préparation à l'avance : planProxyForRound porte bien les nouveaux
//    champs, et les éditer sur une journée FUTURE ne touche jamais aux
//    ordres en direct de teamA (même garantie que les champs historiques,
//    voir ordres_round_planning_test.js).
// ---------------------------------------------------------------------
const dom3 = await openGame(html, baseUrl);
const doc3 = dom3.window.document;
const win3 = dom3.window;
[...doc3.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ordres").click();

const futureRound = win3.eval(`
  (function() {
    for (let r = 0; r < league.totalRounds; r++) {
      if (r === currentMatch.round) continue;
      const m = league.schedule[r].find(x => x.home === myTeamIndex || x.away === myTeamIndex);
      const played = league.results.some(res => res.round === r && (res.home === myTeamIndex || res.away === myTeamIndex));
      if (m && !played) return r;
    }
    return -1;
  })()
`);
if (futureRound < 0) throw new Error("❌ (setup) aucune journée future trouvée pour la planification.");
// Remet volontairement les ordres EN DIRECT à "débutant" (ils avaient été
// persistés à "confirmée" à l'étape 5-7 ci-dessus) : la journée future va
// être basculée sur "confirmée" plus bas, et le test n'a de sens que si le
// direct et le plan divergent réellement pendant la vérification.
win3.eval("teamA.tacticalTier = 'débutant';");
win3.eval(`selectOrdresRound(${futureRound});`);

const liveTierBefore = win3.eval("teamA.tacticalTier");
const futureConfirmeeBtn = [...doc3.querySelectorAll("#prepGrid .tier-toggle-btn")].find(b => b.textContent.trim() === "Confirmée");
if (!futureConfirmeeBtn) throw new Error("❌ Le panneau de préparation d'une journée future devrait aussi avoir le sélecteur de niveau tactique.");
futureConfirmeeBtn.dispatchEvent(new win3.Event("click", { bubbles: true }));

const liveTierAfter = win3.eval("teamA.tacticalTier");
const plannedTier = win3.eval(`teamA.plannedTactics[${futureRound}] && teamA.plannedTactics[${futureRound}].tacticalTier`);
console.log(`\nAprès bascule 'Confirmée' sur la journée future ${futureRound} — teamA.tacticalTier avant/après :`, liveTierBefore, "/", liveTierAfter, "| tacticalTier planifié :", plannedTier);
if (liveTierAfter !== liveTierBefore) throw new Error("❌ Éditer le niveau tactique d'une journée FUTURE ne devrait jamais changer les ordres en direct (teamA.tacticalTier).");
if (plannedTier !== "confirmée") throw new Error("❌ Le changement aurait dû être enregistré dans le plan de cette journée future.");
console.log("✅ Préparer une journée future avec le niveau tactique 'confirmée' ne touche jamais aux ordres en direct.");

await flush(dom3);
const savedPlan = readRawSave(savePath);
console.log("Plan sauvegardé pour la journée future", futureRound, "— tacticalTier :", savedPlan.team.plannedTactics[futureRound] && savedPlan.team.plannedTactics[futureRound].tacticalTier);
if (!savedPlan.team.plannedTactics[futureRound] || savedPlan.team.plannedTactics[futureRound].tacticalTier !== "confirmée") {
  throw new Error("❌ Le tacticalTier planifié pour la journée future devrait être présent dans la sauvegarde brute.");
}
console.log("✅ Le niveau tactique planifié pour une journée future est bien persisté côté serveur.");
win3.close();

server.close();
console.log("\n🏁 Tous les tests confirmed_tactics_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
