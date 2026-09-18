// Vérifie le retour utilisateur (2026-09) : "il y aussi un problème sur le
// live, les scores des quarts temps ne s'affichent pas tjrs".
//
// Racine du bug : window.__gameReady (tout en bas de moteurbasket3.html)
// appelait resetQuarterBars() JUSTE APRÈS enterNextMatchOrShowSeasonEnd().
// Quand cette dernière reconnecte à un match DÉJÀ en cours (league.liveMatch,
// via son appel à enterLiveMatch), enterLiveMatch() rejoue tout de suite tous
// les événements déjà passés (dont les marqueurs "quarterEnd" des
// quarts-temps déjà terminés, voir applyEvent/fillQuarterBar) et remplit donc
// correctement les cases Q1-Q4 déjà connues (#qv1..#qv4), puis ce SECOND
// resetQuarterBars(), exécuté juste après, effaçait aussitôt ce remplissage
// en le remettant à "–" (placeholder), sans qu'aucun autre événement
// "quarterEnd" ne vienne jamais le re-remplir pour un quart-temps déjà
// terminé. Reproduit ici en rechargeant la page (nouvelle session JSDOM,
// comme un vrai rechargement de navigateur) à un instant où au moins le
// premier quart-temps est déjà terminé, ce qui passe justement par
// window.__gameReady au complet (pas juste enterLiveMatch() appelée à la
// main, qui ne reproduirait pas l'ordre bugué).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, patchDateNow } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const clock = { now: Date.now() };
const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
let dom = await openGame(html, baseUrl);
patchDateNow(dom.window, () => clock.now);
await flush(dom);

const saved = readRawSave(savePath);
const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);
await dom.window.close();

// Reconnexion (nouvelle session, comme un rechargement de page) à mi-
// diffusion : au moins le 1er quart-temps devrait déjà être terminé pour un
// match de durée normale (même instant que live_court_view_test.js, qui a
// déjà vérifié qu'il s'y trouve largement plus d'un quart-temps de tirs).
clock.now = scheduledAt + Math.round(MATCH_BROADCAST_DURATION_MS / 2);
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
const doc = dom.window.document;

const savedMidway = readRawSave(savePath);
const liveMatch = savedMidway.league.liveMatch;
if (!liveMatch || !Array.isArray(liveMatch.events)) throw new Error("❌ (setup) league.liveMatch.events devrait être présent à mi-diffusion.");

const quarterEndsAlreadyAired = liveMatch.events.filter(
  ev => ev.type === "quarterEnd" && ev.quarter >= 1 && ev.quarter <= 4 && typeof ev.airAt === "number" && ev.airAt <= clock.now
);
console.log(`Quarts-temps (Q1-Q4) déjà terminés à mi-diffusion : ${quarterEndsAlreadyAired.map(ev => ev.quarter).join(", ") || "(aucun)"}`);
if (quarterEndsAlreadyAired.length === 0) {
  throw new Error("❌ (setup) Aucun quart-temps Q1-Q4 déjà terminé à mi-diffusion, impossible de tester le bug de reconnexion (match trop court ou instant mal choisi ?).");
}

for (const ev of quarterEndsAlreadyAired) {
  const el = doc.getElementById("qv" + ev.quarter);
  if (!el) throw new Error(`❌ (setup) #qv${ev.quarter} devrait exister dans le DOM.`);
  const shown = el.textContent.trim();
  console.log(`Q${ev.quarter} (déjà terminé, score ${ev.score.A}-${ev.score.B}) affiché sur la case : "${shown}"`);
  if (shown === "–" || shown === "") {
    throw new Error(`❌ BUG NON CORRIGÉ : le quart-temps Q${ev.quarter}, déjà terminé au moment où la page a chargé, devrait afficher son score partiel, pas rester vide ("${shown}").`);
  }
}
console.log(`✅ Les ${quarterEndsAlreadyAired.length} quart(s)-temps déjà terminé(s) au chargement de la page affichent bien leur score partiel (pas "–").`);

// Vérifie aussi la valeur exacte du tout premier quart-temps déjà terminé
// (le seul dont le score partiel est trivial à recalculer : différence avec
// 0, puisque c'est le tout début du match).
const q1 = quarterEndsAlreadyAired.find(ev => ev.quarter === 1);
if (q1) {
  const shownQ1 = doc.getElementById("qv1").textContent.trim();
  const expectedQ1 = `${q1.score.A}–${q1.score.B}`;
  if (shownQ1 !== expectedQ1) {
    throw new Error(`❌ Le score du Q1 affiché ("${shownQ1}") ne correspond pas au score réel du quart-temps ("${expectedQ1}").`);
  }
  console.log(`✅ Le score du Q1 affiché ("${shownQ1}") correspond exactement au score réel du quart-temps.`);
}

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests live_quarter_bars_reconnect_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
