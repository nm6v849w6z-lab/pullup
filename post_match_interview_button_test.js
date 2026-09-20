// L'ancien système d'interview "classique" (une interview possible après
// CHAQUE match, avec un bouton dédié sur le direct ET sur le calendrier) a
// été retiré (retour utilisateur, 2026-09 : "on enlève ça"). Ce fichier
// testait exactement ces deux boutons (#liveInterviewCtaBtn,
// .calendar-interview-btn) : entièrement réécrit pour couvrir à la place les
// DEUX nouveaux points d'entrée choisis par l'utilisateur pour les
// interviews de JALON qui subsistent ("l'interview de jalon doit se faire
// via l'écran pendant votre absence et via le tableau de bord") :
//
// 1) L'écran "Pendant votre absence" (showCatchupSummaryIfAny), pour un
//    manager qui a manqué la diffusion en direct entière : déjà son
//    comportement historique pour les journées SANS jalon, inchangé ici.
//
// 2) Le panneau d'interview du tableau de bord (#clubInterviewPanel,
//    renderClubInterviewPanel), AJOUTÉ pour couvrir le trou laissé par le
//    retrait des boutons direct/calendrier : un manager resté connecté
//    pendant TOUTE la diffusion d'un match portant un jalon (ex. journée 0,
//    "début de saison") ne voit jamais son interview via "Pendant votre
//    absence" (voir refreshFromServerAndReenter, qui filtre explicitement la
//    journée qu'on vient de suivre en direct de la liste des événements à
//    rattraper). Sans ce panneau, l'interview resterait inaccessible
//    jusqu'à expiration silencieuse au bout de 3 jours, une régression par
//    rapport à l'ancien bouton "Faire l'interview d'après match" du direct.
const fs = require("fs");
const { startTestServer, openGame, flush, patchDateNow } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function clickTab(doc, key) { [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click(); }

(async () => {

const clock = { now: Date.now() };
const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
let dom = await openGame(html, baseUrl);
patchDateNow(dom.window, () => clock.now);
await flush(dom);

const saved = JSON.parse(fs.readFileSync(savePath, "utf-8"));
const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);
await dom.window.close();

// ---------------------------------------------------------------------
// Partie 1 : manager absent pendant TOUTE la diffusion de la journée 0
// (jamais suivie en direct). La journée 0 porte toujours le jalon "début
// de saison" (voir Engine.milestoneTypeForRound). L'interview de jalon doit
// apparaître dans le récapitulatif "Pendant votre absence", exactement
// comme n'importe quel autre événement manqué.
// ---------------------------------------------------------------------
clock.now = scheduledAt + MATCH_BROADCAST_DURATION_MS + 5000;
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
let doc = dom.window.document;
let win = dom.window;
await flush(dom);

const catchupVisible = !doc.getElementById("catchupSection").classList.contains("hidden");
console.log("Récapitulatif \"Pendant votre absence\" affiché après une absence couvrant toute la journée 0 :", catchupVisible);
if (!catchupVisible) throw new Error("❌ (setup) Le récapitulatif d'absence devrait s'afficher après avoir manqué toute la diffusion de la journée 0.");

const pendingBefore = win.eval("teamA.pendingInterviews.some(i => i.milestone === 'debut-saison')");
console.log("Interview de jalon \"début de saison\" en attente côté teamA :", pendingBefore);
if (!pendingBefore) throw new Error("❌ (setup) Une interview de jalon \"début de saison\" devrait être en attente après le tout premier match de la saison.");

const catchupWidget = doc.querySelector("#catchupContent .interview-widget");
console.log("Widget d'interview affiché dans le récapitulatif d'absence :", !!catchupWidget);
if (!catchupWidget) throw new Error("❌ Le récapitulatif \"Pendant votre absence\" devrait afficher le widget de l'interview de jalon \"début de saison\" de la journée 0.");
console.log("✅ L'interview de jalon \"début de saison\" s'affiche bien dans le récapitulatif \"Pendant votre absence\".");

const toneBtn = catchupWidget.querySelector("[data-interview-tone]");
if (!toneBtn) throw new Error("❌ (setup) Le widget devrait proposer au moins un bouton de ton.");
toneBtn.click();
await new Promise(r => setTimeout(r, 300));
await flush(dom);

const pendingAfterResolve = win.eval("teamA.pendingInterviews.some(i => i.milestone === 'debut-saison')");
console.log("Interview encore en attente après réponse depuis le récapitulatif d'absence :", pendingAfterResolve);
if (pendingAfterResolve) throw new Error("❌ Répondre à l'interview depuis le récapitulatif d'absence devrait la retirer de teamA.pendingInterviews.");
console.log("✅ Répondre à l'interview de jalon depuis le récapitulatif \"Pendant votre absence\" la retire bien de la file d'attente.");

const catchupContinueBtn = doc.getElementById("catchupContinueBtn");
catchupContinueBtn.click();
await flush(dom);
const catchupHiddenAfterContinue = doc.getElementById("catchupSection").classList.contains("hidden");
console.log("Récapitulatif d'absence masqué après \"Continuer\" :", catchupHiddenAfterContinue);
if (!catchupHiddenAfterContinue) throw new Error("❌ \"Continuer\" devrait quitter l'écran de récapitulatif d'absence.");
console.log("✅ \"Continuer\" fait bien reprendre le fil normal du jeu après le récapitulatif d'absence.");

await flush(dom);
await dom.window.close();

// ---------------------------------------------------------------------
// Partie 2 : manager resté connecté pendant TOUTE la diffusion d'une
// journée portant un jalon (mi-saison, journée 9 ici, atteinte en
// rattrapant les journées 1 à 8 sans les suivre en direct). Une fois la
// diffusion terminée (finishPlayback), l'interview est déjà en attente
// côté SERVEUR mais teamA (côté navigateur) ne le sait pas encore tant
// qu'aucun aller-retour serveur n'a eu lieu (voir refreshFromServerAndReenter),
// exactement le trou qui rendait l'ancien bouton du direct nécessaire.
// Vérifie que le nouveau panneau du tableau de bord (#clubInterviewPanel)
// comble bien ce trou, sans repasser par un bouton dédié au direct.
// ---------------------------------------------------------------------
const savedAfterPart1 = JSON.parse(fs.readFileSync(savePath, "utf-8"));
// Avance directement jusqu'à la journée 9 (mi-saison) côté serveur, en
// rattrapant chaque journée intermédiaire SANS jamais suivre son direct
// (comme n'importe quel manager occasionnel) : ouvre puis referme
// immédiatement une session bien après la fin de la fenêtre de diffusion de
// chaque journée, jusqu'à atteindre la journée voulue.
let round = savedAfterPart1.league.round;
while (round < 9) {
  const savedNow = JSON.parse(fs.readFileSync(savePath, "utf-8"));
  const at = scheduledTimeForRound(savedNow.league.calendarStartAt, savedNow.league.round);
  clock.now = at + MATCH_BROADCAST_DURATION_MS + 5000;
  const d = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
  await flush(d);
  // Consomme immédiatement le récapitulatif d'absence de cette journée (clic
  // sur "Continuer") : sans ça, ses événements resteraient en attente et
  // referaient surface plus tard, faussant la vérification de la Partie 2
  // (qui veut isoler le SEUL cas d'une journée suivie en direct jusqu'au
  // bout, journée 9, sans aucun autre événement en attente autour).
  const dc = d.window.document;
  if (!dc.getElementById("catchupSection").classList.contains("hidden")) {
    dc.getElementById("catchupContinueBtn").click();
    await flush(d);
  }
  await d.window.close();
  const after = JSON.parse(fs.readFileSync(savePath, "utf-8"));
  round = after.league.round;
}
console.log("\nJournée atteinte après rattrapage des journées précédentes :", round);
if (round !== 9) throw new Error(`❌ (setup) devrait avoir atteint la journée 9 (mi-saison), obtenu ${round}.`);

const savedAtRound9 = JSON.parse(fs.readFileSync(savePath, "utf-8"));
const scheduledAt9 = scheduledTimeForRound(savedAtRound9.league.calendarStartAt, savedAtRound9.league.round);
clock.now = scheduledAt9 + Math.round(MATCH_BROADCAST_DURATION_MS / 2);
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
doc = dom.window.document;
win = dom.window;

const liveRound = win.eval("league.liveMatch.round");
if (liveRound !== 9) throw new Error(`❌ (setup) un direct devrait être en cours pour la journée 9, obtenu ${liveRound}.`);

clock.now = scheduledAt9 + MATCH_BROADCAST_DURATION_MS + 5000;
win.eval("finishPlayback();");

const noInterviewYetOnClient = win.eval("teamA.pendingInterviews.some(i => i.milestone === 'mi-saison')");
console.log("Interview de mi-saison déjà connue de teamA juste après finishPlayback (avant tout aller-retour serveur) :", noInterviewYetOnClient);
if (noInterviewYetOnClient) throw new Error("❌ (setup) teamA ne devrait pas encore connaître l'interview de mi-saison juste après finishPlayback, avant tout rafraîchissement depuis le serveur.");

// Retour sur l'onglet Ordres : détecte que la diffusion est terminée et va
// chercher l'issue officielle (et donc l'interview de jalon en attente)
// auprès du serveur (voir goToOrdresTab/refreshFromServerAndReenter),
// exactement ce qui se produit normalement en reprenant le fil du jeu.
clickTab(doc, "ordres");
await new Promise(r => setTimeout(r, 300));
await flush(dom);

const interviewKnownAfterRefresh = win.eval("teamA.pendingInterviews.some(i => i.milestone === 'mi-saison')");
console.log("Interview de mi-saison connue de teamA après retour sur Ordres (rafraîchissement serveur) :", interviewKnownAfterRefresh);
if (!interviewKnownAfterRefresh) throw new Error("❌ (setup) L'interview de mi-saison devrait être connue de teamA après le rafraîchissement déclenché par le retour sur Ordres.");

// La journée 9 vient d'être suivie EN DIRECT : son événement "match" est
// filtré de pendingEvents (voir refreshFromServerAndReenter), donc son
// interview de jalon n'apparaît PAS dans le récapitulatif "Pendant votre
// absence", même si ce récapitulatif s'affiche encore pour d'autres
// événements en attente (ex. l'entraînement hebdomadaire de cette même
// semaine, sans rapport). Seul le tableau de bord peut encore donner accès
// à cette interview précise.
const interviewInCatchupAfterLive = !!doc.querySelector("#catchupContent .interview-widget");
console.log("Widget d'interview présent dans le récapitulatif d'absence après un direct suivi jusqu'au bout :", interviewInCatchupAfterLive);
if (interviewInCatchupAfterLive) throw new Error("❌ (setup) L'interview de la journée suivie en direct ne devrait PAS apparaître dans le récapitulatif \"Pendant votre absence\" (son événement \"match\" est filtré, voir refreshFromServerAndReenter).");
if (!doc.getElementById("catchupSection").classList.contains("hidden")) {
  doc.getElementById("catchupContinueBtn").click();
  await flush(dom);
}

clickTab(doc, "club");
const dashboardWidget = doc.querySelector("#clubInterviewPanel .interview-widget");
console.log("Widget d'interview affiché sur le tableau de bord :", !!dashboardWidget);
if (!dashboardWidget) throw new Error("❌ BUG : le panneau du tableau de bord (#clubInterviewPanel) devrait afficher l'interview de jalon manquée par le direct.");
console.log("✅ Le panneau du tableau de bord affiche bien l'interview de jalon pour une journée suivie en direct jusqu'au bout.");

const skipBtn = dashboardWidget.querySelector("[data-interview-skip]");
if (!skipBtn) throw new Error("❌ (setup) Le widget devrait proposer \"Sans commentaire\".");
skipBtn.click();
await new Promise(r => setTimeout(r, 300));
await flush(dom);

const pendingAfterSkip = win.eval("teamA.pendingInterviews.some(i => i.milestone === 'mi-saison')");
console.log("Interview de mi-saison encore en attente après \"Sans commentaire\" depuis le tableau de bord :", pendingAfterSkip);
if (pendingAfterSkip) throw new Error("❌ \"Sans commentaire\" depuis le tableau de bord devrait retirer l'interview de la file d'attente.");
console.log("✅ \"Sans commentaire\" depuis le panneau du tableau de bord retire bien l'interview de la file d'attente.");

const panelConfirmationAfterSkip = doc.getElementById("clubInterviewPanel").textContent.trim();
const widgetGoneFromPanel = !doc.querySelector("#clubInterviewPanel .interview-widget");
console.log("Confirmation affichée sur le panneau du tableau de bord après réponse :", panelConfirmationAfterSkip);
if (!widgetGoneFromPanel || !panelConfirmationAfterSkip.includes("Sans commentaire")) {
  throw new Error(`❌ Le panneau du tableau de bord devrait remplacer le widget par une confirmation "Sans commentaire" une fois l'interview traitée (voir refreshCatchupAfterInterview), obtenu : "${panelConfirmationAfterSkip}".`);
}
console.log("✅ Le panneau du tableau de bord remplace bien le widget par une confirmation une fois l'interview traitée.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests post_match_interview_button_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
