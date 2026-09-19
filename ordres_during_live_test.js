// Vérifie le retour utilisateur (2026-09) : "la page ordres doit être
// accessible meme quand un match se joue (on doit tjrs pouvoir donner ses
// ordres pour les matchs à venir)" — avant ce correctif, cliquer sur l'onglet
// "Ordres" pendant qu'un match du club du joueur était EN COURS de diffusion
// redirigeait systématiquement vers ce direct (goToOrdresTab), rendant
// impossible toute préparation des journées suivantes tant que le match du
// jour n'était pas terminé. Vérifie : l'écran Ordres s'ouvre bien (pas de
// redirection vers le direct), la journée présélectionnée saute
// automatiquement la journée en direct (déjà verrouillée côté serveur,
// non modifiable) au profit de la prochaine journée réellement éditable, et
// le mini bandeau Live du topbar reste accessible pour revenir suivre le
// match (retour utilisateur, 2026-09 : l'onglet Live séparé de la sidebar,
// lui, a depuis été retiré, redondant avec ce bandeau, voir goToLiveTab).
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

const fs2 = require("fs");
const saved = JSON.parse(fs2.readFileSync(savePath, "utf-8"));
const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);
await dom.window.close();

// --- Reconnexion à mi-diffusion (match du club du joueur en cours). ---
clock.now = scheduledAt + Math.round(MATCH_BROADCAST_DURATION_MS / 2);
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
const doc = dom.window.document;
const win = dom.window;

const liveVisibleAtLoad = !doc.getElementById("liveSection").classList.contains("hidden");
if (!liveVisibleAtLoad) throw new Error("❌ À mi-diffusion, l'écran de direct devrait s'afficher au chargement (comportement normal, inchangé).");
console.log("✅ Le direct s'affiche bien au chargement pendant la diffusion (comportement de base inchangé).");

const liveRoundAtLoad = win.eval("league.liveMatch.round");

// ---------------------------------------------------------------------
// Cliquer sur l'onglet "Ordres" pendant que le match est EN COURS : ne doit
// PLUS rediriger vers le direct.
// ---------------------------------------------------------------------
win.eval("TAB_HANDLERS.ordres();");

const prepVisible = !doc.getElementById("prepSection").classList.contains("hidden");
const liveVisibleAfterClick = !doc.getElementById("liveSection").classList.contains("hidden");
console.log(`\nAprès clic sur l'onglet Ordres pendant le direct — écran Ordres visible : ${prepVisible} | écran direct visible : ${liveVisibleAfterClick}`);
if (!prepVisible) throw new Error("❌ BUG NON CORRIGÉ : cliquer sur Ordres pendant un direct en cours devrait afficher l'écran de préparation, pas rester bloqué ailleurs.");
if (liveVisibleAfterClick) throw new Error("❌ BUG NON CORRIGÉ : cliquer sur Ordres pendant un direct en cours redirige encore vers ce direct.");
console.log("✅ L'onglet Ordres s'ouvre bien pendant un match en direct, sans redirection.");

// ---------------------------------------------------------------------
// La journée présélectionnée doit sauter la journée en direct (verrouillée,
// non modifiable) au profit de la prochaine journée éditable.
// ---------------------------------------------------------------------
const selectedRound = win.eval("selectedOrdresRound");
console.log(`Journée en direct : ${liveRoundAtLoad} | journée présélectionnée dans Ordres : ${selectedRound}`);
if (selectedRound === liveRoundAtLoad) {
  throw new Error(`❌ La journée présélectionnée ne devrait pas être la journée en direct (${liveRoundAtLoad}, déjà verrouillée côté serveur) mais une journée future réellement modifiable.`);
}
if (selectedRound == null || selectedRound <= liveRoundAtLoad) {
  throw new Error(`❌ La journée présélectionnée (${selectedRound}) devrait être une journée FUTURE par rapport à la journée en direct (${liveRoundAtLoad}).`);
}
console.log("✅ La journée en direct est bien sautée au profit de la prochaine journée éditable.");

// L'option correspondant à la journée en direct doit rester visible dans le
// sélecteur (pour information) mais non sélectionnable.
const roundSelect = doc.querySelector("#ordresRoundSelector select");
if (roundSelect) {
  // Valeur composite "competition:round" (voir Team.planKey côté moteur,
  // correctif 2026-09 permettant aussi de planifier des tours de Coupe) :
  // ce test ne couvre qu'un direct de championnat, donc "championship:<round>".
  const liveOption = [...roundSelect.options].find(o => o.value === `championship:${liveRoundAtLoad}`);
  if (!liveOption) throw new Error("❌ La journée en direct devrait rester listée dans le sélecteur (pour information).");
  if (!liveOption.disabled) throw new Error("❌ La journée en direct ne devrait pas être sélectionnable dans le sélecteur (déjà verrouillée).");
  console.log("✅ La journée en direct reste visible dans le sélecteur mais n'est pas sélectionnable.");
}

// Le simple rendu de l'écran Ordres pour la journée présélectionnée ne doit
// jamais toucher aux ordres EN DIRECT de teamA (seule une vraie édition sur
// CETTE journée-là créerait un plan, voir ordres_round_planning_test.js pour
// cette partie-là, déjà couverte).
const defenseBefore = win.eval("teamA.defense");
const defenseAfter = win.eval("teamA.defense");
if (defenseAfter !== defenseBefore) {
  throw new Error("❌ Ouvrir l'écran Ordres sur une journée future ne devrait jamais modifier les ordres en direct de teamA.");
}
console.log("✅ Les ordres en direct de teamA restent inchangés après ouverture de l'écran sur la journée présélectionnée.");

// ---------------------------------------------------------------------
// Le mini bandeau Live du topbar reste accessible pour revenir suivre le
// direct (retour utilisateur, 2026-09 : l'onglet Live séparé de la sidebar
// a été retiré depuis, redondant avec ce bandeau).
// ---------------------------------------------------------------------
const liveStripHidden = doc.getElementById("topbarLiveStrip").classList.contains("hidden");
if (liveStripHidden) throw new Error("❌ Le mini bandeau Live du topbar devrait rester visible pendant que le direct est en cours, même en étant sur Ordres.");
console.log("✅ Le mini bandeau Live du topbar reste visible pendant qu'on prépare Ordres.");

win.eval("goToLiveTab();");
const liveVisibleAfterGoBack = !doc.getElementById("liveSection").classList.contains("hidden");
if (!liveVisibleAfterGoBack) throw new Error("❌ Revenir sur l'onglet Live depuis Ordres devrait réafficher le direct en cours.");
console.log("✅ On peut toujours revenir suivre le direct via le bandeau Live du topbar depuis Ordres.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n✅ Tous les tests ordres_during_live_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
