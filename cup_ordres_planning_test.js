// Vérifie le correctif 2026-09 (retour utilisateur : "oui, il faut pouvoir
// donner ses ordres pour chaque match. Plus tard on ajoutera les matchs
// internationaux, il faudra aussi pouvoir le faire", étendu, dans un
// premier temps, à la Coupe, qui existait déjà comme compétition réelle,
// voir server/cup_test.js) : Team.plannedTactics passe d'une clé "round nu"
// à une clé composite "competition:round" (voir Team.planKey/planKey dans
// engine.js) pour qu'un tour de Coupe et une journée de championnat portant
// le MÊME numéro (les deux repartent de 0) ne s'écrasent plus l'un l'autre,
// et pour que la Coupe bénéficie enfin de la préparation à l'avance des
// ordres, comme le championnat. Deux parties :
//   A) MOTEUR/SERVEUR pur (sans navigateur) : ensureCupLiveMatchStarted et
//      finalizeCupRound (server/liveMatch.js) appliquent bien un plan
//      "cup" avant de résoudre un tour, le consomment, et n'interfèrent
//      JAMAIS avec un plan "championship" du même numéro de round.
//   B) NAVIGATEUR (moteurbasket3.html, ligue multi-manager de test) : le
//      bouton "📋 Ordres" apparaît sur la ligne de Coupe du calendrier,
//      ouvre bien CE tour-là, l'éditer ne touche jamais aux ordres en
//      direct, ça survit à un rechargement, et un plan de Coupe coexiste
//      avec un plan de championnat de même numéro sans collision.
const fs = require("fs");
const Engine = require("./engine.js");
const { generateMultiManagerLeague } = Engine;
const Calendar = require("./server/calendar.js");
const { dailyAnchoredCalendarConfig, scheduledTimeForLeagueCupRound } = Calendar;
const { ensureCupLiveMatchStarted, finalizeCupRound } = require("./server/liveMatch.js");
const store = require("./server/store.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

const T0 = Date.UTC(2026, 8, 22, 7, 0, 0); // 22 septembre 2026, 09h Paris (CEST), mardi arbitraire

// Construit une ligue multi-manager fraîche dans laquelle l'équipe humaine
// d'index 0 (toujours league.teams[0], voir buildLeagueWithHumanTeams :
// les équipes humaines viennent TOUJOURS en premier, dans l'ordre de
// `teamName`) a un VRAI match (jamais un bye) au 1er tour de Coupe. Le
// tirage au sort des byes (voir generateCupBracket) est aléatoire, donc on
// réessaie jusqu'à en trouver un, comme server/cup_test.js pour le même
// besoin.
function freshLeagueWithRealCupMatchForTeam0(teamName, now = T0) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const league = generateMultiManagerLeague([teamName], 1, now, dailyAnchoredCalendarConfig());
    const round0 = league.pendingCupRound();
    const match = round0.matches.find(m => !m.bye && (m.home === 0 || m.away === 0));
    if (match) return { league, round0, match };
  }
  throw new Error("❌ (setup) impossible de tirer un vrai match de 1er tour de Coupe pour l'équipe 0 après 60 essais.");
}

// =======================================================================
// PARTIE A : MOTEUR/SERVEUR pur (server/liveMatch.js), sans navigateur.
// =======================================================================

// ---------------------------------------------------------------------
// A1) ensureCupLiveMatchStarted applique un plan "cup" préparé pour le tour
//    en attente AVANT de calculer la diffusion en direct, et le consomme,
//    exactement comme ensureLiveMatchStarted pour le championnat (voir
//    server/planned_tactics_test.js, section 3, le même scénario côté
//    championnat).
// ---------------------------------------------------------------------
{
  const { league, round0, match } = freshLeagueWithRealCupMatchForTeam0("Lyon CupA1");
  const team = league.teams[0];
  const starterMeneurId = team.lineup.starters["Meneur"];
  const backupMeneur = team.players.find(p => p.position === "Meneur" && p.id !== starterMeneurId);
  if (!backupMeneur) throw new Error("❌ (setup) il faut au moins 2 Meneurs dans l'effectif de test.");

  team.stagePlanForRound(round0.index, {}, "cup");
  Engine.Team.prototype.setStarter.call(team.getPlanForRound(round0.index, "cup"), "Meneur", backupMeneur.id);

  const kickoffAt = scheduledTimeForLeagueCupRound(league, round0.dayIndex);
  const startedKeys = ensureCupLiveMatchStarted(Engine, league, kickoffAt, scheduledTimeForLeagueCupRound);

  console.log("A1) Après ensureCupLiveMatchStarted avec un plan de Coupe préparé, titulaire Meneur :", team.lineup.starters["Meneur"], "(attendu", backupMeneur.id, ") | plan consommé :", !team.hasPlanForRound(round0.index, "cup"), "| diffusions démarrées :", startedKeys.length);
  if (team.lineup.starters["Meneur"] !== backupMeneur.id) throw new Error("❌ ensureCupLiveMatchStarted aurait dû appliquer la feuille de match planifiée AVANT de calculer le match en direct.");
  if (team.hasPlanForRound(round0.index, "cup")) throw new Error("❌ Le plan de Coupe aurait dû être consommé par ensureCupLiveMatchStarted.");
  if (!startedKeys.length) throw new Error("❌ ensureCupLiveMatchStarted aurait dû démarrer la diffusion du match de Coupe humain.");
  console.log("✅ ensureCupLiveMatchStarted applique le plan de Coupe préparé pour le tour en cours AVANT de calculer le match, puis le consomme.");
}

// ---------------------------------------------------------------------
// A2) finalizeCupRound applique aussi un plan "cup" pour un match jamais
//    démarré en direct (rattrapage), et le consomme, même principe que
//    finalizeRound côté championnat (server/planned_tactics_test.js,
//    section 1).
// ---------------------------------------------------------------------
{
  const { league, round0, match } = freshLeagueWithRealCupMatchForTeam0("Lyon CupA2");
  const team = league.teams[0];
  team.defense = "Homme à homme";
  team.rhythm = "Normal";
  team.stagePlanForRound(round0.index, { defense: "Zone press", rhythm: "Lent" }, "cup");

  finalizeCupRound(Engine, league);

  console.log("A2) Après finalizeCupRound (jamais diffusé en direct) avec un plan de Coupe préparé, defense:", team.defense, "| rhythm:", team.rhythm, "| plan consommé :", !team.hasPlanForRound(round0.index, "cup"));
  if (team.defense !== "Zone press") throw new Error("❌ finalizeCupRound aurait dû appliquer la defense planifiée pour ce tour de Coupe.");
  if (team.rhythm !== "Lent") throw new Error("❌ finalizeCupRound aurait dû appliquer le rythme planifié pour ce tour de Coupe.");
  if (team.hasPlanForRound(round0.index, "cup")) throw new Error("❌ Le plan de Coupe aurait dû être consommé par finalizeCupRound.");
  console.log("✅ finalizeCupRound applique le plan de Coupe préparé pour le tour qu'il résout (même sans diffusion en direct préalable), et le consomme.");
}

// ---------------------------------------------------------------------
// A3) LE cœur du correctif : un plan "championship" et un plan "cup"
//    portant le MÊME numéro de round (le 1er tour de Coupe est TOUJOURS
//    index 0, exactement comme la 1ère journée de championnat) ne se
//    marchent JAMAIS dessus : résoudre l'un ne doit ni consommer ni altérer
//    l'autre.
// ---------------------------------------------------------------------
{
  const { league, round0 } = freshLeagueWithRealCupMatchForTeam0("Lyon CupA3");
  const team = league.teams[0];
  if (round0.index !== 0) throw new Error("❌ (setup) le 1er tour de Coupe devrait être index 0 (comme la 1ère journée de championnat), obtenu " + round0.index + ".");

  team.stagePlanForRound(0, { defense: "Zone press" }, "championship");
  team.stagePlanForRound(0, { defense: "Box and one" }, "cup");
  console.log("A3) Avant résolution, plan championnat round 0 présent :", team.hasPlanForRound(0, "championship"), "| plan Coupe round 0 présent :", team.hasPlanForRound(0, "cup"));
  if (!team.hasPlanForRound(0, "championship") || !team.hasPlanForRound(0, "cup")) {
    throw new Error("❌ (setup) les deux plans (championnat ET Coupe, round 0) devraient coexister avant toute résolution.");
  }

  finalizeCupRound(Engine, league);

  console.log("Après résolution du tour de Coupe UNIQUEMENT, plan championnat round 0 toujours présent :", team.hasPlanForRound(0, "championship"), "| plan Coupe round 0 consommé :", !team.hasPlanForRound(0, "cup"));
  if (!team.hasPlanForRound(0, "championship")) throw new Error("❌ RÉGRESSION : résoudre le tour de Coupe round 0 a supprimé le plan de CHAMPIONNAT round 0 (collision de clé), le correctif de clé composite ne fonctionne pas.");
  if (team.getPlanForRound(0, "championship").defense !== "Zone press") throw new Error("❌ RÉGRESSION : le plan de championnat round 0 a été altéré par la résolution du tour de Coupe round 0.");
  if (team.hasPlanForRound(0, "cup")) throw new Error("❌ Le plan de Coupe round 0 aurait dû être consommé par la résolution de CE tour de Coupe.");
  console.log("✅ Un plan de championnat et un plan de Coupe portant le même numéro de round coexistent sans jamais se marcher dessus (clé composite).");
}

console.log("\n✅ Partie A (moteur/serveur pur) : ensureCupLiveMatchStarted/finalizeCupRound appliquent et consomment bien un plan de Coupe préparé à l'avance, sans jamais collisionner avec un plan de championnat de même numéro.\n");

// =======================================================================
// PARTIE B : NAVIGATEUR (moteurbasket3.html), ligue multi-manager de test.
// =======================================================================

(async () => {

const { league, round0, match } = freshLeagueWithRealCupMatchForTeam0("Lyon CupB", T0);
const team0 = league.teams[0];
const managerToken = team0.managerLinkToken;
if (!managerToken) throw new Error("❌ (setup) l'équipe humaine devrait porter un managerLinkToken (voir generateMultiManagerLeague).");

const { server, savePath, multiSavePath, baseUrl } = await startTestServer(() => T0);
await store.saveMultiLeague(league, multiSavePath);

const dom = await openGame(html, `${baseUrl}?m=${managerToken}`);
const doc = dom.window.document;
const win = dom.window;

// ---------------------------------------------------------------------
// B1) Le bouton "📋 Ordres" apparaît bien sur la ligne de Coupe du
//    calendrier (data-round=<index du tour>, data-competition="cup"), pas
//    seulement sur les lignes de championnat.
// ---------------------------------------------------------------------
win.eval("TAB_HANDLERS.calendrier();");
const cupOrderBtn = doc.querySelector(`.calendar-order-btn[data-tab='ordres'][data-competition='cup']`);
console.log("B1) Bouton Ordres de Coupe trouvé sur le calendrier :", !!cupOrderBtn, "| data-round :", cupOrderBtn && cupOrderBtn.dataset.round);
if (!cupOrderBtn) throw new Error("❌ Le calendrier devrait afficher un bouton \"📋 Ordres\" pour le tour de Coupe en attente (data-competition=\"cup\").");
if (Number(cupOrderBtn.dataset.round) !== round0.index) throw new Error(`❌ Le bouton Ordres de Coupe devrait porter data-round=${round0.index}, obtenu ${cupOrderBtn.dataset.round}.`);
console.log("✅ Le bouton \"📋 Ordres\" de la ligne de Coupe porte le bon data-round/data-competition.");

// ---------------------------------------------------------------------
// B2) Cliquer dessus ouvre bien l'écran Ordres sur CE tour de Coupe (pas le
//    prochain match de championnat par défaut).
// ---------------------------------------------------------------------
cupOrderBtn.dispatchEvent(new win.Event("click", { bubbles: true }));
const selectedRound = win.eval("selectedOrdresRound");
const selectedCompetition = win.eval("selectedOrdresCompetition");
console.log(`B2) Après clic sur le bouton Ordres de Coupe, journée sélectionnée : ${selectedRound} | compétition : ${selectedCompetition}`);
if (selectedRound !== round0.index || selectedCompetition !== "cup") {
  throw new Error(`❌ Le clic aurait dû sélectionner round=${round0.index}/competition="cup", obtenu round=${selectedRound}/competition=${JSON.stringify(selectedCompetition)}.`);
}
// #ordresPlanNote (qui redisait "Préparation à l'avance, <tour> de Coupe")
// a été retiré (retour utilisateur, 2026-09 : "page ordre enleve ce texte :
// 📋 Préparation à l'avance [...]") : on vérifie à la place que le menu
// déroulant (#ordresRoundSelector) affiche bien le libellé du TOUR DE
// COUPE (ex. "Demies"), pas un numéro de journée de championnat, pour ce
// round0 sélectionné.
const selectedOptionText = win.eval('document.querySelector("#ordresRoundSelector select") ? document.querySelector("#ordresRoundSelector select").selectedOptions[0].textContent : ""');
const cupLabel = win.eval(`cupStageLabelForRoundIndex(${round0.index})`);
console.log("Option sélectionnée du menu déroulant pour ce tour de Coupe :", selectedOptionText, "| libellé attendu :", cupLabel);
if (!selectedOptionText.includes(cupLabel)) throw new Error(`❌ Le menu déroulant devrait afficher le libellé du tour de Coupe (${cupLabel}) pour ce tour, obtenu "${selectedOptionText}".`);
console.log("✅ Le bouton Ordres de Coupe ouvre bien CE tour de Coupe (pas le prochain match de championnat).");

// ---------------------------------------------------------------------
// B3) Éditer les ordres de ce tour de Coupe ne touche jamais aux ordres EN
//    DIRECT de teamA (round immédiat de championnat), seulement au plan de
//    Coupe de ce tour (voir teamA.hasPlanForRound(round, "cup")).
// ---------------------------------------------------------------------
const liveDefenseBefore = win.eval("teamA.defense");
const defSel = doc.querySelector("#prepGrid select"); // 1er <select> du panneau = Défense
if (!defSel) throw new Error("❌ Pas de <select> Défense dans le panneau de préparation.");
const otherDefenseOption = [...defSel.options].find(o => o.value !== defSel.value);
if (!otherDefenseOption) throw new Error("❌ Il faudrait au moins 2 options de défense pour ce test.");
defSel.value = otherDefenseOption.value;
defSel.dispatchEvent(new win.Event("change"));

const liveDefenseAfter = win.eval("teamA.defense");
const hasCupPlan = win.eval(`teamA.hasPlanForRound(${round0.index}, "cup")`);
const cupPlanDefense = win.eval(`teamA.getPlanForRound(${round0.index}, "cup").defense`);
console.log(`B3) Après changement de défense sur le tour de Coupe, defense EN DIRECT avant/après : ${liveDefenseBefore} / ${liveDefenseAfter} | plan de Coupe présent : ${hasCupPlan} | defense planifiée : ${cupPlanDefense}`);
if (liveDefenseAfter !== liveDefenseBefore) throw new Error("❌ Éditer les ordres d'un tour de Coupe FUTUR ne devrait JAMAIS changer les ordres en direct (teamA.defense).");
if (!hasCupPlan) throw new Error("❌ Le changement aurait dû créer un plan de Coupe pour ce tour (teamA.hasPlanForRound(round, \"cup\")).");
if (cupPlanDefense !== otherDefenseOption.value) throw new Error("❌ Le changement aurait dû être enregistré dans le plan de Coupe de ce tour.");
console.log("✅ Éditer un tour de Coupe modifie uniquement son plan de Coupe, jamais les ordres en direct de teamA.");

// Le repère "(préparé) ●" doit apparaître sur l'option de ce tour dans le
// menu déroulant (si affiché, un seul tour à venir peut le masquer, voir
// renderOrdresRoundSelector).
const roundSelect = doc.querySelector("#ordresRoundSelector select");
if (roundSelect) {
  const cupOption = [...roundSelect.options].find(o => o.value === `cup:${round0.index}`);
  if (!cupOption) throw new Error("❌ Le menu déroulant devrait proposer une option pour ce tour de Coupe (valeur composite \"cup:<round>\").");
  if (!cupOption.textContent.includes("●")) throw new Error("❌ L'option du tour de Coupe édité devrait porter le repère \"(préparé) ●\".");
  console.log("✅ L'option du menu déroulant pour ce tour de Coupe porte bien le repère \"(préparé) ●\" après édition.");
}

// ---------------------------------------------------------------------
// B4) Le bouton du calendrier reflète bien l'état "déjà préparé" une fois
//    revenu sur cet onglet (✅ Modifier vos ordres, plutôt que 📋 Ordres).
// ---------------------------------------------------------------------
win.eval("TAB_HANDLERS.calendrier();");
const cupOrderBtnAfter = doc.querySelector(`.calendar-order-btn[data-tab='ordres'][data-competition='cup']`);
console.log("B4) Bouton Ordres de Coupe après préparation :", cupOrderBtnAfter && cupOrderBtnAfter.textContent.trim());
if (!cupOrderBtnAfter || !cupOrderBtnAfter.textContent.includes("Modifier")) {
  throw new Error("❌ Le bouton Ordres de Coupe devrait maintenant afficher \"✅ Modifier vos ordres\" (plan déjà préparé pour ce tour).");
}
console.log("✅ Le bouton du calendrier reflète bien l'état \"déjà préparé\" pour le tour de Coupe.");

// ---------------------------------------------------------------------
// B4bis) BUG corrigé (2026-09-24, retour utilisateur : "impossible de
//    mettre un remplaçant", capture d'écran du panneau Ordres poste Pivot,
//    précisé ensuite : "ça ne le ferait que pour le match de coupe, pour
//    le championnat [...] ça marche") : Team.prototype.toggleBackupPosition
//    (engine.js) appelle en interne this.starterPosition(playerId) (garde-
//    fou : un titulaire ne peut pas aussi être remplaçant) — planProxyForRound
//    (moteurbasket3.html, utilisé pour TOUTE journée préparée à l'avance,
//    donc TOUJOURS pour un tour de Coupe, jamais "le match immédiat") ne
//    copiait que setStarter/toggleBackupPosition sur son proxy, jamais
//    starterPosition : cliquer "+ Ajouter un remplaçant…" sur un tour de
//    Coupe levait TypeError DANS le gestionnaire d'évènement (exception
//    non interceptée, donc silencieuse pour le manager) et ne changeait
//    RIEN. Reproduit puis corrigé avec ce test précis : choisit
//    explicitement la ligne "Pivot" (même poste que la capture d'écran du
//    retour utilisateur) et un candidat déjà remplaçant ailleurs, pour que
//    le diff (son tableau de postes doit grandir) ne laisse aucune place
//    au doute.
// ---------------------------------------------------------------------
win.eval(`selectOrdresRound(${round0.index}, "cup");`);
const prepGridBackup = doc.querySelector("#prepGrid");
if (!prepGridBackup) throw new Error("❌ Pas de #prepGrid après re-sélection du tour de Coupe.");
const pivotRow = [...prepGridBackup.querySelectorAll(".lineup-add-select")]
  .find(sel => { const tr = sel.closest("tr"); return tr && tr.querySelector(".lt-pos").textContent === "P"; });
if (!pivotRow) throw new Error("❌ Pas de <select> \"Ajouter un remplaçant\" pour le poste Pivot.");
const backupCandidate = pivotRow.options[1];
if (!backupCandidate) throw new Error("❌ Aucun candidat remplaçant disponible pour le poste Pivot dans ce test.");
const backupCandidateId = backupCandidate.value;
const backupsBeforeForCandidate = win.eval(`(teamA.getPlanForRound(${round0.index}, "cup").lineup.backupPositions[${backupCandidateId}] || [])`);
pivotRow.value = backupCandidateId;
pivotRow.dispatchEvent(new win.Event("change"));

const hasCupPlanAfterBackup = win.eval(`teamA.hasPlanForRound(${round0.index}, "cup")`);
const backupsAfterForCandidate = win.eval(`(teamA.getPlanForRound(${round0.index}, "cup").lineup.backupPositions[${backupCandidateId}] || [])`);
console.log(`B4bis) Après ajout d'un remplaçant Pivot sur le tour de Coupe : plan présent = ${hasCupPlanAfterBackup} | postes du joueur ${backupCandidateId} avant/après : ${JSON.stringify(backupsBeforeForCandidate)} / ${JSON.stringify(backupsAfterForCandidate)}`);
if (!hasCupPlanAfterBackup) throw new Error("❌ RÉGRESSION : ajouter un remplaçant sur un tour de Coupe ne crée/complète plus le plan de ce tour.");
if (!backupsAfterForCandidate.includes("Pivot") || backupsAfterForCandidate.length !== backupsBeforeForCandidate.length + 1) {
  throw new Error(`❌ RÉGRESSION (bug "impossible de mettre un remplaçant") : le joueur ${backupCandidateId} n'a pas été ajouté comme remplaçant Pivot dans le plan de Coupe (postes avant ${JSON.stringify(backupsBeforeForCandidate)}, après ${JSON.stringify(backupsAfterForCandidate)}).`);
}
console.log("✅ Ajouter un remplaçant sur un tour de Coupe (planProxyForRound) fonctionne — starterPosition bien porté par le proxy.");

await flush(dom);
const multiSaveAfterBackup = JSON.parse(fs.readFileSync(multiSavePath, "utf-8"));
const savedBackupsForCandidate = multiSaveAfterBackup.league.teams[0].plannedTactics?.[`cup:${round0.index}`]?.lineup?.backupPositions?.[backupCandidateId];
console.log("Côté serveur (fichier de sauvegarde), postes remplaçant de ce joueur :", JSON.stringify(savedBackupsForCandidate));
if (!savedBackupsForCandidate || !savedBackupsForCandidate.includes("Pivot")) {
  throw new Error("❌ RÉGRESSION : le remplaçant Pivot ajouté sur le tour de Coupe n'a pas été persisté côté serveur.");
}
console.log("✅ Le remplaçant ajouté sur un tour de Coupe est bien persisté côté serveur (fichier de la ligue partagée).");

// ---------------------------------------------------------------------
// B5) Persistance : le plan de Coupe survit à un rechargement complet de la
//    page (nouvelle session JSDOM, même lien manager, même serveur).
// ---------------------------------------------------------------------
await flush(dom);
const multiSaveAfter = JSON.parse(fs.readFileSync(multiSavePath, "utf-8"));
const savedPlanKey = `cup:${round0.index}`;
const savedTeam0 = multiSaveAfter.league.teams[0];
console.log("Plan de Coupe sauvegardé (fichier ligue partagée) :", savedTeam0.plannedTactics && savedTeam0.plannedTactics[savedPlanKey] && savedTeam0.plannedTactics[savedPlanKey].defense);
if (!savedTeam0.plannedTactics || !savedTeam0.plannedTactics[savedPlanKey] || savedTeam0.plannedTactics[savedPlanKey].defense !== otherDefenseOption.value) {
  throw new Error("❌ Le plan de Coupe devrait être présent (clé composite \"cup:<round>\") dans la sauvegarde brute de la ligue partagée.");
}
dom.window.close();

const dom2 = await openGame(html, `${baseUrl}?m=${managerToken}`);
const win2 = dom2.window;
const reloadedHasCupPlan = win2.eval(`teamA.hasPlanForRound(${round0.index}, "cup")`);
const reloadedCupDefense = win2.eval(`teamA.getPlanForRound(${round0.index}, "cup").defense`);
console.log("B5) Après rechargement, plan de Coupe présent :", reloadedHasCupPlan, "| defense planifiée :", reloadedCupDefense);
if (!reloadedHasCupPlan || reloadedCupDefense !== otherDefenseOption.value) {
  throw new Error("❌ Le plan de Coupe ne survit pas à un rechargement complet de la page.");
}
console.log("✅ Le plan de Coupe préparé via l'écran Ordres survit à un rechargement complet de la page.");

// ---------------------------------------------------------------------
// B6) Un plan de championnat pour LE MÊME numéro de round (round 0, voir
//    A3 plus haut pour l'équivalent moteur pur) coexiste sans collision
//    avec le plan de Coupe déjà préparé ci-dessus, même en passant par
//    l'écran Ordres du navigateur.
// ---------------------------------------------------------------------
const doc2 = dom2.window.document;
win2.eval("selectOrdresRound(0, 'championship');");
const champDefSel = doc2.querySelector("#prepGrid select");
const champOtherOption = [...champDefSel.options].find(o => o.value !== champDefSel.value && o.value !== otherDefenseOption.value);
if (!champOtherOption) throw new Error("❌ Il faudrait au moins 3 options de défense pour bien distinguer les 2 plans dans ce test.");
champDefSel.value = champOtherOption.value;
champDefSel.dispatchEvent(new win2.Event("change"));

const champPlanDefense = win2.eval(`teamA.getPlanForRound(0, "championship").defense`);
const cupPlanStillThere = win2.eval(`teamA.hasPlanForRound(${round0.index}, "cup")`);
const cupPlanDefenseStillThere = win2.eval(`teamA.getPlanForRound(${round0.index}, "cup").defense`);
console.log(`B6) Après préparation d'un plan de championnat round 0, defense planifiée championnat : ${champPlanDefense} | plan de Coupe round ${round0.index} toujours présent : ${cupPlanStillThere} (defense : ${cupPlanDefenseStillThere})`);
if (champPlanDefense !== champOtherOption.value) throw new Error("❌ Le plan de championnat round 0 aurait dû être enregistré avec sa propre defense.");
if (!cupPlanStillThere || cupPlanDefenseStillThere !== otherDefenseOption.value) {
  throw new Error("❌ RÉGRESSION : préparer un plan de championnat round 0 a effacé ou altéré le plan de Coupe du même numéro de round (collision de clé).");
}
console.log("✅ Un plan de championnat et un plan de Coupe de même numéro de round coexistent sans collision, même en passant par l'écran Ordres du navigateur.");

await flush(dom2);
dom2.window.close();
server.close();

console.log("\n✅ Partie B (navigateur) : la planification à l'avance des ordres de Coupe (bouton du calendrier, écran Ordres, persistance, isolation vis-à-vis du championnat) fonctionne de bout en bout.");
console.log("\n🏁 Tous les tests cup_ordres_planning_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
