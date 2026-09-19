// Vérifie deux bugs signalés par l'utilisateur (2026-09), sur le direct
// (#60/#61) :
//
// 1) "il faut que sur le live, ce soit le bon nom des équipes qui apparaisse
//    pas les noms des équipes quand on faisait nos tests". enterLiveMatch()
//    (contrairement à renderPrep()) ne mettait jamais à jour #nameA/#nameB
//    (ni les onglets .bs-tab), qui gardaient donc leur texte STATIQUE du HTML
//    ("Lyon"/"Paris") quand la page atterrit DIRECTEMENT sur un direct déjà
//    en cours, sans passage préalable par renderPrep(). Voir enterLiveMatch.
//
// 2) "quand je suis sur la page donner vos ordres et qu'un match en live se
//    déroule, au bout de quelques secondes, la page saute et je vais sur le
//    live sans le vouloir". startCountdown() se basait UNIQUEMENT sur
//    currentMatch.round (jamais la journée réellement affichée), donc
//    redirigeait de force vers le direct même en préparant une AUTRE journée
//    future (voir defaultOrdresRound, déjà couvert côté "pas de redirection
//    immédiate" par ordres_during_live_test.js, mais jamais après le premier
//    tick réel du compte à rebours, exactement le délai "quelques secondes"
//    du retour utilisateur). Voir startCountdown.
const fs = require("fs");
const { startTestServer, openGame, flush, patchDateNow } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

async function realDelay(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {

const clock = { now: Date.now() };
const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
let dom = await openGame(html, baseUrl);
patchDateNow(dom.window, () => clock.now);
await flush(dom);

const saved = JSON.parse(fs.readFileSync(savePath, "utf-8"));
const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);
await dom.window.close();

// --- Reconnexion à mi-diffusion (match du club du joueur en cours), même
// scénario que ordres_during_live_test.js. ---
clock.now = scheduledAt + Math.round(MATCH_BROADCAST_DURATION_MS / 2);
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
const doc = dom.window.document;
const win = dom.window;

// ---------------------------------------------------------------------
// Partie 1 : atterrissage DIRECT sur un direct déjà en cours (aucun passage
// par renderPrep() avant enterLiveMatch, voir enterNextMatchOrShowSeasonEnd)
// #nameA/#nameB doivent afficher les VRAIS noms, pas le texte statique du
// HTML ("Lyon"/"Paris").
// ---------------------------------------------------------------------
const realNameA = win.eval("teamA.name");
const realNameB = win.eval("teamB.name");
const shownNameA = doc.getElementById("nameA").textContent;
const shownNameB = doc.getElementById("nameB").textContent;
console.log("Noms réels : A =", realNameA, "| B =", realNameB);
console.log("Noms affichés sur le direct : A =", shownNameA, "| B =", shownNameB);
if (shownNameA !== realNameA) throw new Error(`❌ BUG NON CORRIGÉ : #nameA affiche "${shownNameA}" au lieu du vrai nom "${realNameA}".`);
if (shownNameB !== realNameB) throw new Error(`❌ BUG NON CORRIGÉ : #nameB affiche "${shownNameB}" au lieu du vrai nom "${realNameB}".`);
if (shownNameA === "Lyon" && realNameA !== "Lyon") throw new Error("❌ #nameA garde le texte statique du HTML ('Lyon') au lieu du vrai nom.");
if (shownNameB === "Paris" && realNameB !== "Paris") throw new Error("❌ #nameB garde le texte statique du HTML ('Paris') au lieu du vrai nom.");
console.log("✅ Le direct affiche bien les vrais noms d'équipe dès l'atterrissage direct sur un match en cours.");

// Le mini bandeau du topbar (#tlsNameA/#tlsNameB) recopie #nameA/#nameB
// (voir syncTopbarLiveStrip) : doit donc être corrigé du même coup.
const tlsNameA = doc.getElementById("tlsNameA").textContent;
const tlsNameB = doc.getElementById("tlsNameB").textContent;
console.log("Noms affichés dans le bandeau topbar : A =", tlsNameA, "| B =", tlsNameB);
if (tlsNameA !== realNameA || tlsNameB !== realNameB) {
  throw new Error(`❌ Le bandeau topbar devrait recopier les vrais noms (obtenu A="${tlsNameA}", B="${tlsNameB}").`);
}
console.log("✅ Le mini bandeau du topbar affiche lui aussi les vrais noms.");

// Les onglets .bs-tab (boxscore) doivent eux aussi porter les vrais noms.
const bsTabTexts = [...doc.querySelectorAll(".bs-tab")].map(b => b.textContent);
console.log("Onglets .bs-tab :", bsTabTexts);
if (!bsTabTexts.includes(realNameA) || !bsTabTexts.includes(realNameB)) {
  throw new Error(`❌ Les onglets .bs-tab devraient afficher les vrais noms d'équipe, obtenu : ${JSON.stringify(bsTabTexts)}.`);
}
console.log("✅ Les onglets du boxscore affichent eux aussi les vrais noms d'équipe.");

// ---------------------------------------------------------------------
// Partie 2 : sur l'onglet Ordres pendant ce même direct (défaultOrdresRound
// bascule sur une AUTRE journée future à préparer, voir
// ordres_during_live_test.js), après un délai réel (le tick du compte à
// rebours), la page ne doit PAS sauter d'elle-même vers le direct.
// ---------------------------------------------------------------------
const liveRoundAtLoad = win.eval("league.liveMatch.round");
win.eval("TAB_HANDLERS.ordres();");

const prepVisibleJustAfterClick = !doc.getElementById("prepSection").classList.contains("hidden");
if (!prepVisibleJustAfterClick) throw new Error("❌ (setup) L'onglet Ordres devrait s'ouvrir immédiatement après le clic.");
const selectedRound = win.eval("selectedOrdresRound");
if (selectedRound === liveRoundAtLoad) {
  throw new Error("❌ (setup) La journée présélectionnée devrait déjà sauter la journée en direct (voir defaultOrdresRound), sinon ce test ne couvre pas le bon scénario.");
}
console.log(`\nJournée en direct : ${liveRoundAtLoad} | journée présélectionnée (future) : ${selectedRound}`);

await realDelay(1300); // laisse le tick réel (1/seconde) du compte à rebours se déclencher au moins une fois

const prepVisibleAfterDelay = !doc.getElementById("prepSection").classList.contains("hidden");
const liveVisibleAfterDelay = !doc.getElementById("liveSection").classList.contains("hidden");
console.log(`Après ${1300}ms sur Ordres pendant le direct, écran Ordres visible : ${prepVisibleAfterDelay} | écran direct visible : ${liveVisibleAfterDelay}`);
if (!prepVisibleAfterDelay) throw new Error("❌ BUG NON CORRIGÉ : après quelques secondes sur Ordres, la page a sauté ailleurs (écran Ordres plus visible).");
if (liveVisibleAfterDelay) throw new Error("❌ BUG NON CORRIGÉ : après quelques secondes sur Ordres pendant un direct en cours, la page a sauté toute seule vers le direct.");
console.log("✅ La page reste bien sur Ordres après quelques secondes, aucun saut involontaire vers le direct.");

// Le bandeau de compte à rebours texte (#matchCountdown) a été retiré de
// l'écran Ordres (retour utilisateur, 2026-09 : "enlève tout ce texte en
// haut [...] les infos se contredisent sinon", voir
// renderOrdresRoundDateTime/startCountdown dans moteurbasket3.html) : à la
// place, on vérifie que le nouveau bandeau (#ordresRoundDateTime) affiche
// bien la date/heure de la journée SÉLECTIONNÉE (future, pas celle en
// direct) — exactement le risque de contradiction visé par ce retour
// utilisateur — et jamais un texte de compte à rebours.
const dateTimeText = doc.getElementById("ordresRoundDateTime").textContent;
console.log("Texte affiché pour la journée sélectionnée :", JSON.stringify(dateTimeText));
if (dateTimeText.includes("Coup d'envoi")) {
  throw new Error(`❌ Le bandeau ne devrait plus afficher de texte de compte à rebours, obtenu : "${dateTimeText}".`);
}
const expectedSelectedDateTime = win.eval(`formatDateTimeFr(scheduledTimeForChampionshipRound(${selectedRound}))`);
console.log("Date/heure attendue pour la journée sélectionnée :", expectedSelectedDateTime);
if (!dateTimeText.includes(expectedSelectedDateTime)) {
  throw new Error(`❌ Le bandeau devrait afficher la date/heure de la journée sélectionnée ("${expectedSelectedDateTime}"), obtenu : "${dateTimeText}".`);
}
console.log("✅ Le bandeau affiche la date/heure de la journée sélectionnée (future), jamais de texte trompeur lié au direct en cours.");

// L'onglet Live séparé reste la façon normale de revenir suivre le direct
// (déjà couvert par ordres_during_live_test.js, revérifié ici en contexte).
win.eval("goToLiveTab();");
const liveVisibleManual = !doc.getElementById("liveSection").classList.contains("hidden");
if (!liveVisibleManual) throw new Error("❌ L'onglet Live devrait toujours permettre de revenir manuellement suivre le direct.");
console.log("✅ L'onglet Live reste accessible manuellement pour suivre le direct.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests (noms d'équipe sur le direct + pas de saut involontaire depuis Ordres) sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
