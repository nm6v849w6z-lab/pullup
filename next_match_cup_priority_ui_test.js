// Vérifie AFFICHÉ (bandeau du haut, écran de préparation, bouton d'ordres)
// le correctif du "prochain match" ignorant la Coupe (retour utilisateur,
// 2026-09-24, capture d'écran du calendrier : "le match devrait s'afficher
// en haut pour la coupe aussi (il faut tjrs afficher le prochain match, et
// pas uniquement le prochain match de championnat)" — cas concret montré :
// un match de Coupe (Quarts, 15h) programmé AVANT le match de Championnat du
// même jour (19h), mais le bandeau du haut affichait quand même "Journée
// 4/18"). Voir DEV_NOTES.md point 12 pour le diagnostic et le correctif
// (League.prototype.nextUserMatch, engine.js ET moteurbasket3.html) ; voir
// server/next_user_match_cup_priority_test.js pour la même vérification côté
// moteur pur (sans navigateur). Ce fichier-ci vérifie la couche AFFICHAGE :
// updateTopbar()/renderPrep(), et que le bouton d'ordres du bandeau du haut
// réutilise bien le mécanisme de validation DÉJÀ existant pour la Coupe
// (teamA.hasPlanForRound, comme cup_ordres_planning_test.js) plutôt que
// teamA.ordresValidatedRound (qui suppose un round de championnat).
const fs = require("fs");
const Engine = require("./engine.js");
const { generateMultiManagerLeague } = Engine;
const Calendar = require("./server/calendar.js");
const { dailyAnchoredCalendarConfig } = Calendar;
const store = require("./server/store.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

const T0 = Date.UTC(2026, 8, 24, 7, 0, 0); // 24 septembre 2026, jeudi arbitraire (même jour que le retour utilisateur)

// Même construction que cup_ordres_planning_test.js : rejoue le tirage au
// sort du 1er tour de Coupe jusqu'à ce que l'équipe humaine (toujours
// league.teams[0]) tombe sur un VRAI match (jamais un bye).
function freshLeagueWithRealCupMatchForTeam0(teamName, now = T0) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const league = generateMultiManagerLeague([teamName], 1, now, dailyAnchoredCalendarConfig());
    const round0 = league.pendingCupRound();
    const match = round0.matches.find(m => !m.bye && (m.home === 0 || m.away === 0));
    if (match) return { league, round0, match };
  }
  throw new Error("❌ (setup) impossible de tirer un vrai match de 1er tour de Coupe pour l'équipe 0 après 60 essais.");
}

(async () => {

const { league, round0 } = freshLeagueWithRealCupMatchForTeam0("Lyon NextCup");
const team0 = league.teams[0];
const managerToken = team0.managerLinkToken;
if (!managerToken) throw new Error("❌ (setup) l'équipe humaine devrait porter un managerLinkToken.");

// Fait avancer directement league.round au créneau du soir (round 1 = jour
// 0, 19h) — le tour de Coupe en attente (round0, jour 0, 15h) devient ainsi
// chronologiquement AVANT le prochain match de championnat de l'équipe
// (même jour, mais plus tôt) : c'est EXACTEMENT le cas rapporté ("Quarts,
// 15h" avant "Championnat, 19h" le même jour).
league.round = 1;
const champMatch = league.schedule[1].find(m => m.home === 0 || m.away === 0);
if (!champMatch) throw new Error("❌ (setup) l'équipe devrait avoir un match de championnat à la journée 1.");

const { server, savePath, multiSavePath, baseUrl } = await startTestServer(() => T0);
await store.saveMultiLeague(league, multiSavePath);

const dom = await openGame(html, `${baseUrl}?m=${managerToken}`);
const doc = dom.window.document;
const win = dom.window;

// ---------------------------------------------------------------------
// 1) Le bandeau du haut affiche bien la Coupe comme prochain match (pas
//    "Journée 2/…" de championnat).
// ---------------------------------------------------------------------
const topbarWeekText = doc.getElementById("topbarWeek").textContent;
const currentMatchCompetition = win.eval("currentMatch && currentMatch.competition");
const currentMatchRound = win.eval("currentMatch && currentMatch.round");
console.log(`1) topbarWeek: "${topbarWeekText}" | currentMatch.competition: ${currentMatchCompetition} | currentMatch.round: ${currentMatchRound}`);
if (currentMatchCompetition !== "cup") {
  throw new Error(`❌ BUG NON CORRIGÉ : currentMatch devrait être le tour de Coupe (competition="cup"), obtenu ${JSON.stringify(currentMatchCompetition)}.`);
}
if (currentMatchRound !== round0.index) {
  throw new Error(`❌ currentMatch.round incorrect : obtenu ${currentMatchRound}, attendu ${round0.index} (le tour de Coupe).`);
}
const expectedCupLabel = win.eval(`cupStageLabelForRoundIndex(${round0.index})`);
if (!topbarWeekText.includes(expectedCupLabel) || !topbarWeekText.includes("Coupe")) {
  throw new Error(`❌ Le bandeau du haut devrait afficher "Coupe · ${expectedCupLabel}", obtenu "${topbarWeekText}".`);
}
if (topbarWeekText.includes("Journée")) {
  throw new Error(`❌ Le bandeau du haut ne devrait PAS afficher "Journée X/Y" pour un match de Coupe, obtenu "${topbarWeekText}".`);
}
console.log("✅ Le bandeau du haut affiche bien la Coupe (pas le championnat) comme prochain match, avec le bon libellé de tour.");

// ---------------------------------------------------------------------
// 2) L'écran de préparation (Ordres) atterrit bien directement sur ce tour
//    de Coupe (defaultOrdresRound), sans action supplémentaire.
// ---------------------------------------------------------------------
const selectedRound = win.eval("selectedOrdresRound");
const selectedCompetition = win.eval("selectedOrdresCompetition");
console.log(`2) selectedOrdresRound: ${selectedRound} | selectedOrdresCompetition: ${selectedCompetition}`);
if (selectedRound !== round0.index || selectedCompetition !== "cup") {
  throw new Error(`❌ L'écran de préparation devrait s'ouvrir directement sur le tour de Coupe (round=${round0.index}, competition="cup"), obtenu round=${selectedRound}, competition=${JSON.stringify(selectedCompetition)}.`);
}
console.log("✅ L'écran de préparation s'ouvre bien directement sur le tour de Coupe (le vrai prochain match).");

// ---------------------------------------------------------------------
// 3) Le bouton d'ordres du bandeau du haut ("Donnez vos ordres") réutilise
//    bien le mécanisme de validation DÉJÀ existant pour la Coupe
//    (teamA.hasPlanForRound), jamais teamA.ordresValidatedRound (qui
//    suppose un round de championnat, et qui plus est un round de
//    championnat sans lien avec round0.index).
// ---------------------------------------------------------------------
const ordersBtnBefore = doc.getElementById("topbarOrdersBtn").textContent.trim();
console.log(`3) Bouton d'ordres AVANT préparation du tour de Coupe : "${ordersBtnBefore}"`);
if (!ordersBtnBefore.includes("Donnez vos ordres")) {
  throw new Error(`❌ Avant toute préparation, le bouton devrait afficher "Donnez vos ordres", obtenu "${ordersBtnBefore}".`);
}

// Modifie la défense du tour de Coupe (même geste que cup_ordres_planning_test.js
// B3) pour déclencher stagePlanForRound/hasPlanForRound sur CE tour.
// Système défensif en boutons segmentés depuis le 2026-09-26 (data-value =
// clé interne, .active = valeur courante).
const defSel = doc.getElementById("ordresDefenseSelect");
if (!defSel) throw new Error("❌ Pas de groupe de boutons Système défensif dans le panneau de préparation.");
const otherDefenseOption = [...defSel.querySelectorAll(".seg-btn")].map(b => ({ value: b.dataset.value, el: b })).find(o => !o.el.classList.contains("active"));
if (!otherDefenseOption) throw new Error("❌ Il faudrait au moins 2 options de défense pour ce test.");
otherDefenseOption.el.dispatchEvent(new win.Event("click", { bubbles: true }));

win.eval("updateTopbar();"); // même appel que renderPrep()/onDirty, voir buildTeamPanel
const ordersBtnAfter = doc.getElementById("topbarOrdersBtn").textContent.trim();
const ordersBtnValidatedClass = doc.getElementById("topbarOrdersBtn").classList.contains("topbar-cta-validated");
const hasCupPlan = win.eval(`teamA.hasPlanForRound(${round0.index}, "cup")`);
console.log(`Après préparation du tour de Coupe : bouton = "${ordersBtnAfter}" | classe validée = ${ordersBtnValidatedClass} | teamA.hasPlanForRound(cup) = ${hasCupPlan}`);
if (!hasCupPlan) throw new Error("❌ (setup) la modification aurait dû créer un plan de Coupe pour ce tour.");
if (!ordersBtnAfter.includes("Modifier vos ordres") || !ordersBtnValidatedClass) {
  throw new Error(`❌ BUG NON CORRIGÉ : le bouton d'ordres du bandeau du haut devrait passer à "Modifier vos ordres" (classe validée) une fois le tour de Coupe préparé, obtenu "${ordersBtnAfter}" (classe validée : ${ordersBtnValidatedClass}).`);
}
console.log("✅ Le bouton d'ordres du bandeau du haut réutilise bien teamA.hasPlanForRound (mécanisme de Coupe déjà existant) pour refléter l'état \"déjà préparé\".");

// teamA.ordresValidatedRound (championnat) ne doit JAMAIS avoir été touché
// par cette préparation d'un tour de Coupe.
const ordresValidatedRound = win.eval("teamA.ordresValidatedRound");
console.log("teamA.ordresValidatedRound après préparation du tour de Coupe :", ordresValidatedRound);
if (ordresValidatedRound === round0.index) {
  throw new Error("❌ RÉGRESSION : préparer un tour de Coupe ne devrait jamais renseigner teamA.ordresValidatedRound (réservé au championnat).");
}
console.log("✅ teamA.ordresValidatedRound (mécanisme de championnat) reste inchangé par la préparation d'un tour de Coupe.");

await flush(dom); // laisse la sauvegarde fire-and-forget du changement de défense atteindre le serveur avant de le fermer
dom.window.close();
server.close();
console.log("\n🏁 Tous les tests next_match_cup_priority_ui_test.js sont passés.");

})();
