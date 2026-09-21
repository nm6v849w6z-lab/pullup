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
//    pendant TOUTE la diffusion d'un match portant un jalon (ex. journée 9,
//    "mi-saison") ne voit jamais son interview via "Pendant votre absence"
//    (voir refreshFromServerAndReenter, qui filtre explicitement la journée
//    qu'on vient de suivre en direct de la liste des événements à
//    rattraper). Sans ce panneau, l'interview resterait inaccessible jusqu'à
//    expiration silencieuse au bout de 3 jours, une régression par rapport à
//    l'ancien bouton "Faire l'interview d'après match" du direct. Ce panneau
//    est aussi le SEUL point d'entrée de l'interview "début de saison"
//    (correctif 2026-09, voir Partie 1 plus bas) : depuis qu'elle est mise
//    en attente AVANT le premier match plutôt qu'après son résultat
//    (round=null), elle ne peut plus jamais apparaître dans "Pendant votre
//    absence", qui ne retrouve les interviews de jalon que par round de
//    match.
//
// Correctif 2026-09 (retour utilisateur : "mets un vrai pop up pour
// l'interview qu'on peut passer et faire en retournant dans le tableau de
// bord, si on veut le faire plus tard") : dans les deux cas ci-dessus, le
// widget n'affiche plus qu'un bouton compact qui ouvre un vrai popup
// (showInterviewModal), où vivent désormais les vraies questions, la
// prévisualisation par ton (INDÉPENDANTE pour chaque question depuis un
// second correctif 2026-09, voir Partie 1) et le choix final (Valider/Sans
// commentaire/Plus tard). Ce fichier vérifie aussi que "Plus tard" NE résout
// PLUS jamais l'interview à la place du manager : elle reste en attente,
// reprenable via ce même bouton.
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

await dom.window.close();

// ---------------------------------------------------------------------
// Partie 1 : interview de jalon "début de saison" (correctif 2026-09,
// retour utilisateur : "la première interview doit pouvoir se faire avant
// le début de saison et ne doit pas porter sur le resultat du premier match
// mais sur la saison à venir (objectif, joueur sur qui on compte...)") :
// mise en attente dès la CRÉATION de la ligue (voir
// Team.queueSeasonPreviewInterview/buildLeagueWithHumanTeams), donc déjà là
// AVANT que la journée 0 ne soit jouée — contrairement à l'ancien
// comportement (jalon posé APRÈS le résultat de la journée 0). N'étant liée
// à AUCUNE journée (round=null), elle n'apparaît jamais dans le
// récapitulatif "Pendant votre absence" (qui ne retrouve les interviews de
// jalon que par round de match, voir showCatchupSummaryIfAny) : seul le
// panneau du tableau de bord (#clubInterviewPanel) y donne accès, dès
// l'ouverture d'une toute nouvelle sauvegarde.
// ---------------------------------------------------------------------
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
let doc = dom.window.document;
let win = dom.window;
await flush(dom);

const seasonPreviewPending = win.eval("teamA.pendingInterviews.some(i => i.milestone === 'debut-saison' && i.round === null)");
console.log("Interview de jalon \"début de saison\" déjà en attente dès l'ouverture d'une nouvelle sauvegarde (avant tout match) :", seasonPreviewPending);
if (!seasonPreviewPending) throw new Error("❌ Une interview \"début de saison\" (round=null) devrait déjà être en attente dès la création de la ligue, avant le moindre match.");
console.log("✅ L'interview de jalon \"début de saison\" est bien mise en attente dès la création de la ligue, avant que la journée 0 ne soit jouée.");

clickTab(doc, "club");
const dashboardWidgetSeasonPreview = doc.querySelector("#clubInterviewPanel [data-interview-open]");
if (!dashboardWidgetSeasonPreview) throw new Error("❌ Le tableau de bord devrait donner accès à l'interview \"début de saison\" avant même le premier match.");
dashboardWidgetSeasonPreview.click();

// Correctif 2026-09 (retour utilisateur : "tu as mis plus de question avec
// la possibilité de choisir le ton pour chacune d'entre elle et pas
// uniquement un ton pour toutes les questions ?") : au moins DEUX groupes de
// boutons de ton distincts (un par question), pas un seul partagé pour
// toute l'interview.
const toneGroups = new Set([...doc.querySelectorAll("#interviewModalOverlay [data-interview-preview-tone]")].map(b => b.dataset.interviewPreviewQ));
console.log("Groupes de boutons de ton distincts dans le popup (un par question) :", [...toneGroups]);
if (toneGroups.size < 2) throw new Error(`❌ Le popup devrait proposer un sélecteur de ton PAR question (au moins 2 groupes), obtenu ${toneGroups.size}.`);
console.log("✅ Le popup propose bien un sélecteur de ton indépendant pour chaque question.");

// Le contenu ne doit plus jamais mentionner de résultat de match : cette
// interview porte sur la saison à venir (objectifs, joueur sur qui compter).
const modalText = doc.getElementById("interviewModalOverlay").textContent;
if (/victoire|défaite/i.test(modalText)) throw new Error(`❌ L'interview "début de saison" ne devrait plus mentionner de résultat de match, obtenu : "${modalText}".`);
console.log("✅ Le contenu de l'interview \"début de saison\" ne mentionne plus aucun résultat de match (objectifs/joueur clé uniquement).");

const toneBtnPart1 = doc.querySelector("#interviewModalOverlay [data-interview-preview-tone]");
toneBtnPart1.click();
const validateBtnPart1 = doc.getElementById("interviewModalValidate");
validateBtnPart1.click();
await new Promise(r => setTimeout(r, 300));
await flush(dom);

const seasonPreviewResolved = !win.eval("teamA.pendingInterviews.some(i => i.milestone === 'debut-saison')");
console.log("Interview \"début de saison\" retirée de la file après réponse depuis le tableau de bord :", seasonPreviewResolved);
if (!seasonPreviewResolved) throw new Error("❌ Répondre à l'interview \"début de saison\" depuis le tableau de bord devrait la retirer de la file d'attente.");
console.log("✅ L'interview de jalon \"début de saison\" se résout normalement depuis le tableau de bord, avant même que la journée 0 ne soit jouée.");

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

// ---------------------------------------------------------------------
// Correctif 2026-09 (retour utilisateur : "mets un vrai pop up pour
// l'interview qu'on peut passer et faire en retournant dans le tableau de
// bord, si on veut le faire plus tard") : "Plus tard" ferme le popup SANS
// rien résoudre, l'interview doit rester en attente et le bouton doit
// rester disponible pour la reprendre.
// ---------------------------------------------------------------------
dashboardWidget.querySelector("[data-interview-open]").click();
const laterBtn = doc.getElementById("interviewModalLater");
if (!laterBtn) throw new Error("❌ (setup) Le popup d'interview devrait proposer \"Plus tard\".");
laterBtn.click();
const modalGoneAfterLater = !doc.getElementById("interviewModalOverlay");
const pendingAfterLater = win.eval("teamA.pendingInterviews.some(i => i.milestone === 'mi-saison')");
const widgetStillThereAfterLater = !!doc.querySelector("#clubInterviewPanel [data-interview-open]");
console.log(`\n"Plus tard" : popup fermé=${modalGoneAfterLater} | interview toujours en attente=${pendingAfterLater} | bouton toujours affiché=${widgetStillThereAfterLater}`);
if (!modalGoneAfterLater) throw new Error("❌ \"Plus tard\" devrait fermer le popup.");
if (!pendingAfterLater) throw new Error("❌ \"Plus tard\" ne devrait RIEN résoudre : l'interview devrait rester en attente (reprenable plus tard).");
if (!widgetStillThereAfterLater) throw new Error("❌ \"Plus tard\" ne devrait pas faire disparaître le bouton \"Faire l'interview\" du tableau de bord (l'interview reste à faire).");
console.log("✅ \"Plus tard\" ferme le popup sans rien résoudre : l'interview reste en attente, reprenable via le même bouton.");

// Correctif 2026-09 (voir plus haut) : "Sans commentaire" vit désormais dans
// le popup, ouvert via le bouton du widget.
dashboardWidget.querySelector("[data-interview-open]").click();
const skipBtn = doc.getElementById("interviewModalSkip");
if (!skipBtn) throw new Error("❌ (setup) Le popup d'interview devrait proposer \"Sans commentaire\".");
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
