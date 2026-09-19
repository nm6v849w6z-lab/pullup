// Test de bout en bout du scénario réel (tâche #23) : contrairement aux
// autres fichiers de tests, qui vérifient chacun UNE fonctionnalité en
// isolation, celui-ci rejoue une vraie session de manager du début à la fin
// — nouvelle carrière, réglages à l'avance (tactiques, entraînement),
// compte à rebours jusqu'au coup d'envoi qui bascule tout seul sur le
// direct, reconnexion EN COURS de diffusion (retour utilisateur : "si je me
// connecte à 19h30 je dois reprendre le match là où il en est"), fin de la
// diffusion, résultat officiel du match, rattrapage automatique du reste de
// la saison (matchs + entraînement hebdomadaire), fin de saison (play-offs,
// prime), nouvelle saison, et persistance complète à chaque étape — pour
// vérifier que toutes les briques (tâches #21 et #22) fonctionnent bien
// ENSEMBLE, pas seulement chacune de son côté.
//
// Simule le passage du temps réel via un `nowFn` injectable côté serveur
// (voir startTestServer) ET `patchDateNow` côté navigateur (voir
// test_helpers.js), avancés de concert — jamais de vraie attente de 90
// minutes : seules quelques fractions de seconde réelles sont attendues,
// pour laisser le compte à rebours (setInterval, 1 tick/seconde réel) avoir
// l'occasion de se déclencher lui-même, exactement comme dans un vrai
// navigateur.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, patchDateNow, fastForwardCalendar } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function clickTab(doc, key) { [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click(); }
async function realDelay(ms) { return new Promise(r => setTimeout(r, ms)); }
// Le bandeau "DIVISION I : 1 CHAMPIONNAT" de l'écran Ordres (#divisionBadge)
// a été retiré (retour utilisateur, 2026-09 : "enlève tout ce texte en haut
// [...] les infos se contredisent sinon", voir renderOrdresRoundDateTime
// dans moteurbasket3.html) ; on relit directement le même calcul que
// renderClubSection (le badge équivalent, toujours affiché sur le tableau de
// bord, #clubDivisionBadge) plutôt qu'un texte qui n'existe plus sur cet
// écran-ci.
function divisionBadgeText(win) {
  return win.eval('(function(){ var info = divisionInfo(league.divisionLevel || MAX_DIVISION_LEVEL); return info.name + " : " + info.leagueCount + " championnat" + (info.leagueCount > 1 ? "s" : ""); })()');
}

(async () => {

const clock = { now: Date.now() };
const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
let dom = await openGame(html, baseUrl);
let doc = dom.window.document;
let win = dom.window;
patchDateNow(win, () => clock.now);

// ---------------------------------------------------------------------
// 1. Nouvelle carrière : l'écran de préparation par défaut doit déjà être
// jouable (tactiques + feuille de match valides dès la génération).
// ---------------------------------------------------------------------
clickTab(doc, "ordres");
const initialWarning = doc.getElementById("lockWarning").textContent.trim();
console.log("Avertissement au tout premier lancement :", initialWarning || "(aucun — prêt à jouer)");
if (initialWarning) throw new Error("❌ Une toute nouvelle carrière devrait démarrer avec une feuille de match et des tactiques valides : " + initialWarning);
const divisionBadge = divisionBadgeText(win);
console.log("Division de départ :", divisionBadge);
if (!divisionBadge.startsWith("Division I ")) throw new Error("❌ Une nouvelle carrière devrait démarrer en Division I.");

// ---------------------------------------------------------------------
// 2. Le manager règle les choses À L'AVANCE (tâche #21) : ajuste une
// priorité offensive et choisit le programme d'entraînement de la semaine —
// aucune de ces actions ne "se joue" immédiatement, elles seront appliquées
// par le serveur au moment programmé.
// ---------------------------------------------------------------------
const chipInputs = [...doc.querySelectorAll(".team-panel.a .tactic-chip input")];
const checkedBefore = chipInputs.filter(c => c.checked);
const uncheckedBefore = chipInputs.filter(c => !c.checked);
if (checkedBefore.length !== 3) throw new Error("❌ Exactement 3 priorités offensives devraient être sélectionnées par défaut.");
checkedBefore[0].checked = false;
checkedBefore[0].dispatchEvent(new win.Event("change"));
uncheckedBefore[0].checked = true;
uncheckedBefore[0].dispatchEvent(new win.Event("change"));
const warningAfterTacticChange = doc.getElementById("lockWarning").textContent.trim();
if (warningAfterTacticChange) throw new Error("❌ La feuille de match devrait rester jouable après avoir permuté une priorité offensive (toujours 3 sélectionnées) : " + warningAfterTacticChange);

clickTab(doc, "entrainement");
const skillSel = doc.getElementById("trainingSkillSelect");
skillSel.value = "threePoint";
skillSel.onchange();
const posSel = doc.getElementById("trainingPositionsSelect");
posSel.selectedIndex = 0;
posSel.onchange();

await flush(dom);
let saved = readRawSave(savePath);
console.log("\nTactiques réglées à l'avance :", saved.team.offensivePriorities);
console.log("Entraînement réglé à l'avance :", saved.team.trainingSkill, saved.team.trainingPositions);
if (saved.team.offensivePriorities.length !== 3) throw new Error("❌ Les tactiques modifiées devraient être persistées.");
if (saved.team.trainingSkill !== "threePoint") throw new Error("❌ Le programme d'entraînement choisi devrait être persisté.");
console.log("✅ Les réglages à l'avance (tactiques, entraînement) sont bien pris en compte et persistés sans action immédiate.");

// ---------------------------------------------------------------------
// 3. Minuteur interne jusqu'au coup d'envoi (tâche #21) : bascule de
// lui-même sur le direct à l'heure programmée, sans que le test ne déclenche
// quoi que ce soit manuellement (contrairement à visibility_refresh_test.js,
// qui couvre le cas d'un onglet resté en arrière-plan). Le texte de compte à
// rebours visible ("Coup d'envoi dans Xh") a été retiré de l'écran Ordres
// (retour utilisateur, 2026-09 : "enlève tout ce texte en haut [...] les
// infos se contredisent sinon", voir startCountdown/renderOrdresRoundDateTime
// dans moteurbasket3.html) : seul l'effet de bord (bascule automatique)
// subsiste désormais, c'est lui qu'on vérifie ci-dessous.
// ---------------------------------------------------------------------
clickTab(doc, "ordres");
const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);
console.log("\nCoup d'envoi programmé :", new Date(scheduledAt).toISOString());

clock.now = scheduledAt - 3 * 60 * 60 * 1000; // 3h avant le coup d'envoi
await realDelay(1100); // laisse le tick (1/seconde réelle) du minuteur interne se déclencher au moins une fois
const stillOnPrepAt3h = !doc.getElementById("prepSection").classList.contains("hidden");
console.log("Toujours sur l'écran Ordres à J-3h (pas de bascule prématurée) :", stillOnPrepAt3h);
if (!stillOnPrepAt3h) throw new Error("❌ La page n'aurait pas dû basculer sur le direct 3h avant le coup d'envoi.");

clock.now = scheduledAt + 500; // coup d'envoi atteint
await realDelay(1100);
const liveVisibleAuto = !doc.getElementById("liveSection").classList.contains("hidden");
console.log("Bascule automatique sur le direct au coup d'envoi (sans action du joueur) :", liveVisibleAuto);
if (!liveVisibleAuto) throw new Error("❌ Le minuteur interne aurait dû basculer tout seul sur le direct à l'heure programmée.");
console.log("✅ Le minuteur interne bascule tout seul sur le direct au coup d'envoi, même sans texte de compte à rebours visible.");

// ---------------------------------------------------------------------
// 4. Reconnexion EN COURS de diffusion (retour utilisateur : "si je me
// connecte à 19h30 je dois reprendre le match là où il en est, pas depuis
// le début") : ferme la page, avance le temps réel jusqu'à la moitié de la
// fenêtre de diffusion, rouvre une toute nouvelle session — elle doit
// immédiatement refléter l'état du direct à cet instant précis, sans
// animation depuis le début.
// ---------------------------------------------------------------------
await flush(dom);
win.close();
clock.now = scheduledAt + Math.round(MATCH_BROADCAST_DURATION_MS / 2);

// L'horloge falsifiée doit être en place AVANT même que le script de la
// page ne s'exécute une première fois (voir __gameReady) — patcher APRÈS
// `openGame()` serait trop tard : le calcul initial de la diffusion en
// direct (enterLiveMatch, quels événements sont déjà "passés à l'antenne")
// aurait déjà eu lieu avec la VRAIE horloge, bien avant `scheduledAt`.
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
doc = dom.window.document;
win = dom.window;

const liveVisibleMidway = !doc.getElementById("liveSection").classList.contains("hidden");
const quarterLabelMidway = doc.getElementById("quarterLabel").textContent;
const feedCountMidway = doc.getElementById("feed").children.length;
const statusMidway = doc.getElementById("boardStatus").textContent;
console.log("\nReconnexion à mi-diffusion — direct visible :", liveVisibleMidway, "| statut :", statusMidway, "| étiquette :", quarterLabelMidway, "| lignes de fil :", feedCountMidway);
if (!liveVisibleMidway) throw new Error("❌ Une reconnexion en cours de diffusion devrait immédiatement montrer le direct (pas l'écran de préparation).");
if (quarterLabelMidway === "Avant-match" || feedCountMidway === 0) {
  throw new Error("❌ Une reconnexion à mi-diffusion devrait reprendre le match là où il en est (déjà plusieurs événements appliqués), pas depuis le tout début.");
}
console.log("✅ La reconnexion en cours de diffusion reprend bien le match là où il en est, sans repartir du début.");

// ---------------------------------------------------------------------
// 5. Reconnexion APRÈS la fin de la fenêtre de diffusion (absent pendant
// TOUTE sa durée, pas seulement une coupure passagère comme à l'étape 4) :
// le match est alors traité comme n'importe quelle journée manquée —
// résultat déjà déterminé dès le coup d'envoi (jamais resimulé, voir
// finalizeLiveMatch côté serveur), annoncé via le récapitulatif d'absence
// plutôt que l'écran de direct. Le résultat affiché doit être EXACTEMENT
// celui que le serveur a déterminé dès le coup d'envoi.
// ---------------------------------------------------------------------
await flush(dom);
win.close();
clock.now = scheduledAt + MATCH_BROADCAST_DURATION_MS + 5000;

dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
doc = dom.window.document;
win = dom.window;
await flush(dom);

saved = readRawSave(savePath);
const round0Result = saved.league.results.find(r => r.round === 0 && (r.home === 0 || r.away === 0));
if (!round0Result) throw new Error("❌ Le résultat officiel de la journée 0 devrait être enregistré côté serveur une fois la fenêtre de diffusion entièrement écoulée.");
const officialScoreA = round0Result.home === 0 ? round0Result.scoreHome : round0Result.scoreAway;
const officialScoreB = round0Result.home === 0 ? round0Result.scoreAway : round0Result.scoreHome;

const catchupVisibleRound0 = !doc.getElementById("catchupSection").classList.contains("hidden");
const catchupTextRound0 = doc.getElementById("catchupContent").textContent.replace(/\s+/g, " ").trim();
console.log("\nRécapitulatif après une absence couvrant toute la diffusion :", catchupTextRound0.slice(0, 160));
console.log("Score officiel (serveur) :", officialScoreA, "-", officialScoreB);
if (!catchupVisibleRound0) throw new Error("❌ Le récapitulatif d'absence devrait s'afficher après avoir manqué toute la fenêtre de diffusion du match.");
if (!catchupTextRound0.includes(`${officialScoreA}-${officialScoreB}`) && !catchupTextRound0.includes(`${officialScoreB}-${officialScoreA}`)) {
  throw new Error("❌ Le récapitulatif devrait annoncer exactement le score officiel déterminé par le serveur dès le coup d'envoi (jamais resimulé).");
}
console.log("✅ Le résultat annoncé après une absence totale correspond exactement au résultat officiel déterminé dès le coup d'envoi — jamais resimulé.");
doc.getElementById("catchupContinueBtn").click();

// ---------------------------------------------------------------------
// 6. Rattrape le reste de la saison (17 journées restantes) d'un coup —
// matchs ET entraînement hebdomadaire automatique — jusqu'à la fin de la
// saison régulière et les play-offs.
// ---------------------------------------------------------------------
const prepVisibleAfterMatch1 = !doc.getElementById("prepSection").classList.contains("hidden");
console.log("\nÉcran de préparation du match suivant visible après 'Continuer' :", prepVisibleAfterMatch1);
if (!prepVisibleAfterMatch1) throw new Error("❌ Après la journée 0, l'écran de préparation du match suivant devrait être affiché.");

await flush(dom);
win.close();
fastForwardCalendar(savePath, 18, clock.now);
dom = await openGame(html, baseUrl);
doc = dom.window.document;
win = dom.window;
patchDateNow(win, () => clock.now);

const catchupVisible = !doc.getElementById("catchupSection").classList.contains("hidden");
console.log("Récapitulatif d'absence visible après rattrapage du reste de la saison :", catchupVisible);
if (!catchupVisible) throw new Error("❌ Le récapitulatif d'absence devrait s'afficher après avoir rattrapé le reste de la saison d'un coup.");
const catchupJourneeCount = (doc.getElementById("catchupContent").innerHTML.match(/Journée \d+/g) || []).length;
console.log("Journées récapitulées :", catchupJourneeCount, "(attendu 17, le reste de la saison après la 1ère journée déjà suivie en direct)");
if (catchupJourneeCount !== 17) throw new Error(`❌ Il devrait rester exactement 17 journées à récapituler après la 1ère déjà suivie en direct, obtenu ${catchupJourneeCount}.`);
doc.getElementById("catchupContinueBtn").click();

// ---------------------------------------------------------------------
// 7. Fin de saison : play-offs et éventuelle prime déjà calculés
// automatiquement (voir catchUpLeague/runPlayoffs côté serveur) avant même
// que le joueur ne clique quoi que ce soit.
// ---------------------------------------------------------------------
await flush(dom);
saved = readRawSave(savePath);
console.log("\nSaison régulière terminée — division :", saved.league.divisionLevel, "| champion (idx) :", saved.league.playoffs.champion);
if (!saved.league.playoffs) throw new Error("❌ Les play-offs devraient être calculés automatiquement à la fin de la saison régulière.");
const outcomeEl = doc.querySelector(".season-division-outcome");
if (!outcomeEl) throw new Error("❌ Le bandeau de résultat montée/descente devrait être affiché à l'écran de fin de saison.");
console.log("Résultat pour le club du joueur :", outcomeEl.textContent.trim());
const bonusEl = doc.querySelector(".season-bonus");
console.log("Prime annoncée :", bonusEl ? bonusEl.textContent.trim() : "(aucune)");
console.log("✅ Fin de saison (play-offs, barrage, résultat, prime éventuelle) entièrement calculée automatiquement, avant toute action du joueur.");

const budgetBeforeNewSeason = saved.team.budget;
doc.getElementById("newSeasonBtn").click();
await flush(dom);
const savedNewSeason = readRawSave(savePath);
console.log("\nNouvelle saison — journée :", savedNewSeason.league.round, "| division :", savedNewSeason.league.divisionLevel, "| budget :", budgetBeforeNewSeason, "→", savedNewSeason.team.budget);
if (savedNewSeason.league.round !== 0) throw new Error("❌ La nouvelle saison devrait redémarrer à la journée 0.");
if (bonusEl && savedNewSeason.team.budget <= budgetBeforeNewSeason) {
  throw new Error("❌ Une prime annoncée à l'écran de fin de saison devrait avoir été effectivement versée au clic sur 'Nouvelle saison'.");
}
console.log("✅ La nouvelle saison démarre correctement (journée 0, division mise à jour, prime versée si annoncée).");

// ---------------------------------------------------------------------
// 8. Persistance complète : rechargement de la page, même serveur — tout
// doit survivre à l'identique (calendrier réel, tactiques, entraînement,
// division, budget).
// ---------------------------------------------------------------------
win.close();
const domReloaded = await openGame(html, baseUrl);
const docReloaded = domReloaded.window.document;
const reloaded = readRawSave(savePath);
console.log("\nAprès rechargement complet — journée :", reloaded.league.round, "| division :", reloaded.league.divisionLevel, "| entraînement :", reloaded.team.trainingSkill, "| budget :", reloaded.team.budget);
const persistedOk = reloaded.league.round === savedNewSeason.league.round
  && reloaded.league.divisionLevel === savedNewSeason.league.divisionLevel
  && reloaded.team.trainingSkill === "threePoint"
  && reloaded.team.budget === savedNewSeason.team.budget;
console.log(`${persistedOk ? "✅" : "❌"} L'ensemble de la session (calendrier, division, réglages, budget) survit au rechargement complet.`);
if (!persistedOk) throw new Error("❌ La persistance complète a échoué après le scénario de bout en bout.");

await flush(domReloaded);
domReloaded.window.close();
server.close();

console.log("\n✅ Scénario de bout en bout vérifié : nouvelle carrière prête à jouer, réglages à l'avance (tactiques/entraînement), compte à rebours qui bascule tout seul sur le direct au coup d'envoi, reconnexion en cours de diffusion qui reprend là où elle en est, résultat final fidèle à ce que le serveur a déterminé, rattrapage automatique du reste de la saison, fin de saison (play-offs/prime) calculée sans action du joueur, nouvelle saison, et persistance complète de bout en bout.");

})().catch(e => { console.error(e); process.exit(1); });
