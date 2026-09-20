// Vérifie le retour utilisateur (2026-09) : "il faudrait que l'interview du
// match s'affiche si on est connecté [...] si on est sur la page live sur le
// live via un bouton (faire l'interview d'après match) et dans le
// calendrier à la place de voir le live (quand le match est terminé comme
// ici) mettre un bouton 'interview d'après match'".
//
// Jusqu'ici, la SEULE façon de répondre à une interview était l'écran
// "Pendant votre absence…", qui ne s'affiche que lors d'un rechargement
// après le fait, et qui ignore explicitement la journée qu'on vient de
// suivre en direct (voir refreshFromServerAndReenter) : un manager resté
// connecté pendant tout le direct ne voyait donc jamais son interview.
// Couvre les DEUX nouveaux points d'entrée : le bouton "Faire l'interview
// d'après match" sur l'écran de direct lui-même une fois la diffusion
// terminée, et le bouton "Interview d'après match" du Calendrier, qui
// remplace "Voir le direct" une fois la fenêtre de diffusion écoulée côté
// client (même si league.liveMatch n'a pas encore été rattrapé par le
// serveur, exactement le cas capturé par l'utilisateur en capture d'écran).
const fs = require("fs");
const { startTestServer, openGame, flush, patchDateNow } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

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
// Partie 1 : bouton "Faire l'interview d'après match" sur le direct
// lui-même, une fois la diffusion locale terminée (finishPlayback, ici
// appelé directement plutôt que d'attendre son setTimeout en temps réel).
// ---------------------------------------------------------------------
clock.now = scheduledAt + Math.round(MATCH_BROADCAST_DURATION_MS / 2);
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
let doc = dom.window.document;
let win = dom.window;

const liveRound1 = win.eval("league.liveMatch.round");
if (typeof liveRound1 !== "number") throw new Error("❌ (setup) un direct devrait être en cours après reconnexion en pleine diffusion.");

clock.now = scheduledAt + MATCH_BROADCAST_DURATION_MS + 5000;
win.eval("finishPlayback();");

const liveInterviewBtnBefore = doc.querySelector("#liveInterviewPanel #liveInterviewCtaBtn");
console.log("Bouton \"Faire l'interview d'après match\" affiché sur le direct après la fin de la diffusion :", !!liveInterviewBtnBefore);
if (!liveInterviewBtnBefore) throw new Error("❌ BUG NON CORRIGÉ : le bouton d'interview devrait apparaître sur le direct une fois la diffusion terminée.");
console.log("✅ Le bouton d'interview apparaît bien sur le direct une fois la diffusion terminée.");

liveInterviewBtnBefore.click();
await new Promise(r => setTimeout(r, 300));
await flush(dom);

const liveWidget = doc.querySelector("#liveInterviewPanel .interview-widget");
console.log("Widget d'interview affiché sur le direct après clic :", !!liveWidget);
if (!liveWidget) throw new Error("❌ BUG NON CORRIGÉ : cliquer sur le bouton devrait afficher le widget d'interview directement sur le direct.");
console.log("✅ Le widget d'interview s'affiche bien directement sur le direct après le clic.");

const toneBtn = liveWidget.querySelector("[data-interview-tone]");
if (!toneBtn) throw new Error("❌ (setup) Le widget devrait proposer au moins un bouton de ton.");
toneBtn.click();
const pendingAfterResolve = win.eval(`teamA.pendingInterviews.some(i => i.round === ${liveRound1})`);
console.log("Interview encore en attente après réponse :", pendingAfterResolve);
if (pendingAfterResolve) throw new Error("❌ L'interview devrait être retirée de teamA.pendingInterviews une fois répondue.");
console.log("✅ Répondre à l'interview depuis le direct la retire bien de la file d'attente.");

const continueBtn = doc.querySelector("#liveInterviewPanel .post-interview-continue-btn");
if (!continueBtn) throw new Error("❌ (setup) Le bouton \"Continuer\" devrait rester affiché après réponse.");
continueBtn.click();
await flush(dom);
const liveSectionHiddenAfterContinue = doc.getElementById("liveSection").classList.contains("hidden");
console.log("Écran direct masqué après \"Continuer\" :", liveSectionHiddenAfterContinue);
if (!liveSectionHiddenAfterContinue) throw new Error("❌ \"Continuer\" devrait quitter l'écran de direct (match désormais résolu côté serveur).");
console.log("✅ \"Continuer\" fait bien reprendre le fil normal du jeu après l'interview.");

await flush(dom);
await dom.window.close();

// ---------------------------------------------------------------------
// Partie 2 : bouton "Interview d'après match" sur le Calendrier, à la place
// de "Voir le direct", pour un match dont la fenêtre de diffusion est déjà
// entièrement écoulée MAIS resté stale côté client (aucune requête réseau
// entre-temps) : exactement le scénario rapporté ("le calendrier affiche
// toujours 'Voir le direct' [...] alors que le match est fini").
// ---------------------------------------------------------------------
// La Partie 1 a fait avancer la ligue au-delà de la journée 0 (via
// "Continuer") : round/horaire programmé recalculés depuis l'état serveur
// ACTUEL plutôt que de réutiliser `scheduledAt`/round 0, périmés.
const savedAfterPart1 = JSON.parse(fs.readFileSync(savePath, "utf-8"));
const scheduledAt2 = scheduledTimeForRound(savedAfterPart1.league.calendarStartAt, savedAfterPart1.league.round);

clock.now = scheduledAt2 + Math.round(MATCH_BROADCAST_DURATION_MS / 2);
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
doc = dom.window.document;
win = dom.window;

const liveRound2 = win.eval("league.liveMatch.round");
if (typeof liveRound2 !== "number") throw new Error("❌ (setup) un direct devrait être en cours après reconnexion en pleine diffusion.");

// La fenêtre de diffusion s'écoule sans qu'aucune requête réseau n'ait
// lieu entre-temps (league.liveMatch reste stale côté client).
clock.now = scheduledAt2 + MATCH_BROADCAST_DURATION_MS + 5000;
win.eval("TAB_HANDLERS.calendrier();");

const calBtn = doc.querySelector(`.calendar-order-btn[data-live-interview-round="${liveRound2}"]`);
console.log("Bouton du calendrier pour la journée en direct périmée :", calBtn && calBtn.textContent, calBtn && calBtn.className);
if (!calBtn || calBtn.textContent !== "Interview d'après match") {
  throw new Error(`❌ BUG NON CORRIGÉ : le calendrier devrait afficher "Interview d'après match" (pas "Voir le direct") une fois la diffusion terminée, obtenu ${calBtn ? `"${calBtn.textContent}"` : "aucun bouton"}.`);
}
if (!calBtn.classList.contains("calendar-interview-btn")) throw new Error("❌ Le bouton devrait porter la classe de style dédiée à l'interview.");
console.log("✅ Le calendrier affiche bien \"Interview d'après match\" à la place de \"Voir le direct\" une fois la diffusion terminée.");

calBtn.click();
await new Promise(r => setTimeout(r, 300));
await flush(dom);

const calWidget = doc.querySelector("#calendrierInterviewPanel .interview-widget");
console.log("Widget d'interview affiché sur le calendrier après clic :", !!calWidget);
if (!calWidget) throw new Error("❌ BUG NON CORRIGÉ : cliquer sur le bouton devrait afficher le widget d'interview directement sur le calendrier.");
console.log("✅ Le widget d'interview s'affiche bien directement sur le calendrier après le clic.");

const scoreCellAfter = [...doc.querySelectorAll("#calendrierContent .calendar-score-btn")]
  .find(b => Number(b.dataset.boxscoreRound) === liveRound2);
console.log("Score désormais affiché et cliquable pour cette journée :", scoreCellAfter && scoreCellAfter.textContent);
if (!scoreCellAfter) throw new Error("❌ Le score de la journée devrait être connu (et cliquable) une fois le match résolu côté serveur suite au clic.");
console.log("✅ Le tableau du calendrier reflète bien le résultat officiel une fois l'interview ouverte.");

const skipBtn = calWidget.querySelector("[data-interview-skip]");
if (!skipBtn) throw new Error("❌ (setup) Le widget devrait proposer \"Sans commentaire\".");
skipBtn.click();
const pendingAfterSkip = win.eval(`teamA.pendingInterviews.some(i => i.round === ${liveRound2})`);
if (pendingAfterSkip) throw new Error("❌ \"Sans commentaire\" devrait retirer l'interview de la file d'attente.");
console.log("✅ \"Sans commentaire\" depuis le calendrier retire bien l'interview de la file d'attente.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests post_match_interview_button_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
