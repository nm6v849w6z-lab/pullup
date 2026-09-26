// Vérifie côté navigateur (moteurbasket3.html) le correctif du retour
// utilisateur (2026-09) : "les liens pour donner ses ordres sur la page
// calendrier ne fonctionnent pas, ils renvoient tjrs vers le prochain match
// et pas en fonction du match auquel la ligne correspond" — ET la
// fonctionnalité complète demandée ensuite : "sur buzzerbeater on peut faire
// pour tous les matchs de la saison [...] donc je pense qu'il faut pouvoir
// le faire sur plusieurs matchs" (préparation à l'avance sur plusieurs
// journées, voir Team.plannedTactics dans engine.js). Couvre : chaque
// bouton "📋 Ordres" du calendrier porte le bon data-round et ouvre bien
// CETTE journée-là (pas toujours le prochain match) ; éditer une journée
// future ne touche jamais aux ordres en direct (seulement au plan de cette
// journée) ; ça survit à un rechargement ; et le plan est bien consommé une
// fois sa journée réellement simulée.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

// ---------------------------------------------------------------------
// 1) Chaque ligne du calendrier porte le bon data-round sur son bouton
//    "📋 Ordres" (le cœur du bug rapporté : avant ce correctif, aucun
//    data-round n'existait du tout et le clic renvoyait toujours vers le
//    prochain match).
// ---------------------------------------------------------------------
win.eval('TAB_HANDLERS.calendrier();');
const calendarBtns = [...doc.querySelectorAll(".calendar-order-btn[data-tab='ordres']")];
console.log("Boutons Ordres trouvés sur le calendrier :", calendarBtns.length, "(attendu 18, une saison complète pas encore jouée)");
if (calendarBtns.length !== 18) throw new Error(`❌ Attendu 18 boutons "Ordres" (18 journées, rien de joué), obtenu ${calendarBtns.length}.`);
const roundsOnButtons = calendarBtns.map(b => Number(b.dataset.round));
const expectedRounds = Array.from({ length: 18 }, (_, i) => i);
console.log("Journées portées par les boutons :", roundsOnButtons.join(","));
if (JSON.stringify(roundsOnButtons) !== JSON.stringify(expectedRounds)) {
  throw new Error(`❌ Chaque bouton "Ordres" devrait porter data-round=<sa propre journée> (0..17 dans l'ordre), obtenu [${roundsOnButtons.join(",")}].`);
}
console.log("✅ Chaque ligne du calendrier porte le data-round de SA journée.");

// ---------------------------------------------------------------------
// 2) Cliquer sur le bouton "Ordres" d'une journée FUTURE (pas le prochain
//    match, round 5 par exemple) ouvre bien l'écran Ordres avec CETTE
//    journée sélectionnée — pas silencieusement le prochain match (round 0).
// ---------------------------------------------------------------------
const targetRound = 5;
const targetBtn = calendarBtns.find(b => Number(b.dataset.round) === targetRound);
if (!targetBtn) throw new Error(`❌ Pas de bouton Ordres pour la journée ${targetRound}.`);
targetBtn.dispatchEvent(new win.Event("click", { bubbles: true }));

const prepVisible = !doc.getElementById("prepSection").classList.contains("hidden");
const selectedRoundAfterClick = win.eval("selectedOrdresRound");
console.log(`\nAprès clic sur le bouton Ordres de la journée ${targetRound + 1} — écran Ordres visible :`, prepVisible, "| journée sélectionnée :", selectedRoundAfterClick);
if (!prepVisible) throw new Error("❌ Cliquer sur le bouton Ordres d'une ligne du calendrier devrait ouvrir l'écran de préparation.");
if (selectedRoundAfterClick !== targetRound) {
  throw new Error(`❌ BUG NON CORRIGÉ : le clic devrait sélectionner la journée ${targetRound}, obtenu ${selectedRoundAfterClick} (probablement toujours le prochain match).`);
}
const roundSelect = doc.querySelector("#ordresRoundSelector select");
const selectedOption = roundSelect && roundSelect.options[roundSelect.selectedIndex];
console.log("Option sélectionnée dans le menu déroulant :", selectedOption && selectedOption.textContent.trim());
if (!selectedOption || !selectedOption.textContent.includes(`J${targetRound + 1}`)) {
  throw new Error(`❌ L'option du menu déroulant pour la journée ${targetRound} devrait être sélectionnée.`);
}
// Le bandeau #ordresPlanNote (qui redisait, avec une phrase d'explication en
// plus, les mêmes infos que #ordresRoundDateTime) a été retiré (retour
// utilisateur 2026-09 : "page ordre enleve ce texte : 📋 Préparation à
// l'avance [...]"). On vérifie à la place que #ordresRoundDateTime affiche
// bien l'adversaire de LA JOURNÉE FUTURE sélectionnée (pas celui de
// currentMatch), ce qui est le signal que l'écran est bien en mode
// préparation à l'avance pour cette journée-là.
const targetOpp = win.eval(`league.teams[league.schedule[${targetRound}].find(m => m.home === myTeamIndex || m.away === myTeamIndex).home === myTeamIndex ? league.schedule[${targetRound}].find(m => m.home === myTeamIndex || m.away === myTeamIndex).away : league.schedule[${targetRound}].find(m => m.home === myTeamIndex || m.away === myTeamIndex).home].name`);
const roundDateTimeText = doc.getElementById("ordresRoundDateTime").textContent;
console.log("Bandeau jour/heure pour la journée future :", roundDateTimeText, "(attendu adversaire :", targetOpp + ")");
const noteVisible = roundDateTimeText.includes(targetOpp);
if (!noteVisible) throw new Error(`❌ #ordresRoundDateTime devrait afficher l'adversaire de la journée future ${targetRound} (${targetOpp}), obtenu "${roundDateTimeText}".`);
console.log(`✅ Le bouton Ordres de la journée ${targetRound + 1} ouvre bien CETTE journée-là (correctif du bug rapporté).`);

// ---------------------------------------------------------------------
// 3) Éditer les ordres de cette journée future (défense) ne touche PAS aux
//    ordres en direct de teamA (round immédiat) — seulement au plan
//    préparé pour la journée 5.
// ---------------------------------------------------------------------
const liveDefenseBefore = win.eval("teamA.defense");
// Système défensif en boutons segmentés depuis le 2026-09-26 (data-value =
// clé interne, .active = valeur courante).
const defSel = doc.getElementById("ordresDefenseSelect");
if (!defSel) throw new Error("❌ Pas de groupe de boutons Système défensif dans le panneau de préparation.");
const otherDefenseOption = [...defSel.querySelectorAll(".seg-btn")].map(b => ({ value: b.dataset.value, el: b })).find(o => !o.el.classList.contains("active"));
if (!otherDefenseOption) throw new Error("❌ Il faudrait au moins 2 options de défense pour ce test.");
otherDefenseOption.el.dispatchEvent(new win.Event("click", { bubbles: true }));

const liveDefenseAfter = win.eval("teamA.defense");
// Team.plannedTactics est désormais indexé par une clé composite
// "competition:round" (voir Team.planKey côté moteur, correctif 2026-09
// permettant aussi de planifier des tours de Coupe) plutôt que par un simple
// numéro de journée : on passe par hasPlanForRound/getPlanForRound (l'API
// publique voulue pour ça, voir leur commentaire côté moteur) plutôt que
// d'indexer directement plannedTactics, pour ne pas dépendre du format exact
// de la clé depuis ce test.
const hasPlanForTarget = win.eval(`teamA.hasPlanForRound(${targetRound})`);
const plannedDefense = win.eval(`teamA.getPlanForRound(${targetRound}).defense`);
console.log(`\nAprès changement de défense sur la journée ${targetRound + 1} — defense EN DIRECT avant/après :`, liveDefenseBefore, "/", liveDefenseAfter, "| plan présent pour cette journée :", hasPlanForTarget, "| defense planifiée :", plannedDefense);
if (liveDefenseAfter !== liveDefenseBefore) throw new Error("❌ Éditer les ordres d'une journée FUTURE ne devrait JAMAIS changer les ordres en direct (teamA.defense).");
if (!hasPlanForTarget) throw new Error("❌ Le changement aurait dû créer un plan pour cette journée (teamA.hasPlanForRound(round)).");
if (plannedDefense !== otherDefenseOption.value) throw new Error("❌ Le changement aurait dû être enregistré dans le plan de cette journée (teamA.getPlanForRound(round).defense).");
console.log("✅ Éditer une journée future modifie uniquement son plan, jamais les ordres en direct.");

// Le repère "(préparé) ●" doit maintenant apparaître sur l'option de cette
// journée dans le menu déroulant.
const preparedOptions = [...doc.querySelectorAll("#ordresRoundSelector select option")].filter(o => o.textContent.includes("●"));
console.log("Options marquées \"préparées\" après ce changement :", preparedOptions.length, "(attendu au moins 1)");
if (preparedOptions.length < 1) throw new Error("❌ La journée éditée devrait maintenant porter le repère '(préparé) ●' dans le menu déroulant.");

// ---------------------------------------------------------------------
// 4) Le round IMMÉDIAT (le prochain match, round 0) reste, lui, câblé sur
//    les ordres EN DIRECT — l'éditer modifie bien teamA.defense tout de
//    suite (comportement historique inchangé), pas un plan.
// ---------------------------------------------------------------------
win.eval("selectOrdresRound(0);");
const immediateDefSel = doc.getElementById("ordresDefenseSelect");
const immediateOtherOption = [...immediateDefSel.querySelectorAll(".seg-btn")].map(b => ({ value: b.dataset.value, el: b })).find(o => !o.el.classList.contains("active"));
immediateOtherOption.el.dispatchEvent(new win.Event("click", { bubbles: true }));
const liveDefenseAfterImmediateEdit = win.eval("teamA.defense");
console.log(`\nAprès changement de défense sur le round immédiat (0) — defense EN DIRECT :`, liveDefenseAfterImmediateEdit, "(attendu :", immediateOtherOption.value, ")");
if (liveDefenseAfterImmediateEdit !== immediateOtherOption.value) throw new Error("❌ Éditer le round immédiat (prochain match) devrait modifier teamA.defense directement, comme avant cette fonctionnalité.");
const noPlanForImmediate = win.eval("!teamA.hasPlanForRound(0)");
console.log("Aucun plan créé pour le round immédiat (0) :", noPlanForImmediate);
if (!noPlanForImmediate) throw new Error("❌ Le round immédiat ne doit jamais passer par plannedTactics (il EST les ordres en direct).");
console.log("✅ Le round immédiat reste câblé sur les ordres en direct, exactement comme avant cette fonctionnalité.");

// ---------------------------------------------------------------------
// 5) Persistance : le plan de la journée 5 survit à un rechargement complet
//    de la page (nouvelle session JSDOM pointée vers le même serveur).
// ---------------------------------------------------------------------
await flush(dom);
const saved = readRawSave(savePath);
// Clé composite "championship:<round>" (voir Team.planKey côté moteur) dans
// la sauvegarde brute JSON, puisque cette journée est une journée de
// championnat (le seul cas que ce test couvre).
const savedPlanKey = `championship:${targetRound}`;
console.log("\nPlan sauvegardé pour la journée", targetRound, ":", saved.team.plannedTactics[savedPlanKey]);
if (!saved.team.plannedTactics || !saved.team.plannedTactics[savedPlanKey] || saved.team.plannedTactics[savedPlanKey].defense !== otherDefenseOption.value) {
  throw new Error("❌ Le plan de la journée future devrait être présent dans la sauvegarde brute.");
}
win.close();

const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;
const reloadedPlan = win2.eval(`teamA.getPlanForRound(${targetRound}).defense`);
console.log("Après rechargement — defense planifiée pour la journée", targetRound, ":", reloadedPlan);
if (reloadedPlan !== otherDefenseOption.value) throw new Error("❌ Le plan de la journée future ne survit pas au rechargement.");
console.log("✅ Le plan d'une journée future survit à un rechargement complet de la page.");
// Important : attendre que toute sauvegarde fire-and-forget encore en vol
// depuis CETTE session (voir initGame -> refreshTransferMarket/
// refreshCoachMarket, qui sauvegardent elles aussi au chargement) ait bien
// atteint le serveur AVANT de fermer la fenêtre puis d'aller modifier le
// fichier de sauvegarde directement (fastForwardCalendar ci-dessous) —
// sinon une de ces sauvegardes en vol pourrait s'écrire APRÈS coup et
// écraser silencieusement le calendarStartAt qu'on s'apprête à avancer
// (même précaution que partout ailleurs dans la suite de tests, voir
// test_helpers.js).
await flush(dom2);
win2.close();

// ---------------------------------------------------------------------
// 6) Une fois la journée planifiée RÉELLEMENT simulée (calendrier avancé
//    jusque-là), le plan est consommé (supprimé) — il est devenu l'état
//    courant, plus une "préparation à l'avance" (voir
//    Team.applyPlannedTacticsForRound côté moteur).
// ---------------------------------------------------------------------
fastForwardCalendar(savePath, targetRound + 1, Date.now());
const dom3 = await openGame(html, baseUrl);
await flush(dom3); // laisse le temps au rattrapage déclenché par GET /api/state d'être bien persisté
const savedAfterSim = readRawSave(savePath);
const roundResolved = savedAfterSim.league.round > targetRound;
const planConsumed = !savedAfterSim.team.plannedTactics || !savedAfterSim.team.plannedTactics[savedPlanKey];
console.log(`\nAprès rattrapage jusqu'à la journée ${targetRound} — league.round:`, savedAfterSim.league.round, "(> ", targetRound, "?)", "| plan de la journée", targetRound, "consommé :", planConsumed);
if (!roundResolved) throw new Error(`❌ La journée ${targetRound} devrait avoir été résolue par le rattrapage automatique.`);
if (!planConsumed) throw new Error("❌ Une fois sa journée réellement simulée, le plan préparé à l'avance devrait avoir été consommé (supprimé).");
console.log("✅ Le plan d'une journée est bien consommé une fois cette journée réellement simulée.");
dom3.window.close();

server.close();
console.log("\n✅ Tous les tests ordres_round_planning_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
