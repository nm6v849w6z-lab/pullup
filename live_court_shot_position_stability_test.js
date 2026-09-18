// Vérifie le retour utilisateur (2026-09) : "il y a un gros problème, quand
// je clique sur le bouton live, à gauche ou à droite, ça change
// l'emplacement des shoots. ce n'est pas possible qu'il se passe ça".
//
// Racine du bug (voir randomPointForZone/addCourtMark dans
// moteurbasket3.html) : chaque tir/rebond diffusé recevait un point tiré au
// hasard (Math.random(), via `rand()`) DANS randomPointForZone, appelée
// depuis addCourtMark, elle-même appelée depuis applyEvent, appelée pour
// CHAQUE événement déjà "passé à l'antenne" (airAt <= maintenant) à CHAQUE
// (ré)entrée sur enterLiveMatch (voir son "timeline.forEach" : delay<=0 =>
// applique tout de suite), donc à chaque fois que le manager quitte puis
// revient sur l'onglet/le bouton Live (ou simplement recharge la page en
// cours de diffusion), le MÊME tir recevait un NOUVEAU point aléatoire,
// silencieusement déplacé sur le terrain. Le correctif seed désormais ce
// tirage sur ev.airAt (entier stable et strictement croissant par
// événement au sein d'un même match, voir schedulePlayback côté
// server/liveMatch.js) via un PRNG déterministe (seededRandom).
//
// Partie 1 : vérifie DIRECTEMENT randomPointForZone/seededRandom, en
// isolation, sans dépendre d'un vrai match (rapide, sans ambiguïté).
// Partie 2 : vérifie le comportement de bout en bout via une VRAIE
// reconnexion en cours de diffusion (mêmes conditions que
// live_court_view_test.js) rejouée deux fois de suite (simulant deux clics
// successifs sur le bouton Live), les positions affichées sur le terrain
// doivent être EXACTEMENT les mêmes les deux fois, tir par tir.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, patchDateNow } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom0 = await openGame(html, baseUrl);
const win0 = dom0.window;

// ---------------------------------------------------------------------
// Partie 1 : seededRandom/randomPointForZone en isolation.
// ---------------------------------------------------------------------
const samePointTwice = win0.eval(`
  JSON.stringify([
    randomPointForZone("A", "three", 123456789),
    randomPointForZone("A", "three", 123456789),
  ])
`);
const [pointFirst, pointSecond] = JSON.parse(samePointTwice);
console.log("Même seed (123456789), deux appels :", pointFirst, pointSecond);
if (pointFirst.x !== pointSecond.x || pointFirst.y !== pointSecond.y) {
  throw new Error(`❌ BUG NON CORRIGÉ : le même seed devrait TOUJOURS produire le même point, obtenu ${JSON.stringify(pointFirst)} puis ${JSON.stringify(pointSecond)}.`);
}
console.log("✅ Le même seed produit toujours le même point (randomPointForZone est désormais déterministe).");

const differentSeedPoint = JSON.parse(win0.eval(`JSON.stringify(randomPointForZone("A", "three", 987654321))`));
console.log("Seed différent (987654321) :", differentSeedPoint);
if (differentSeedPoint.x === pointFirst.x && differentSeedPoint.y === pointFirst.y) {
  // Extrêmement improbable (pas structurellement impossible), signalé sans
  // faire échouer le test à lui seul, ce n'est pas la propriété vérifiée ici.
  console.log("⚠️ Coïncidence improbable : deux seeds différents ont produit le même point (pas un bug en soi).");
} else {
  console.log("✅ Deux seeds différents produisent des points différents (le hasard reste présent d'un tir à l'autre, comme avant).");
}

await flush(dom0);
await win0.close();

// ---------------------------------------------------------------------
// Partie 2 : bout en bout, reconnexion à mi-diffusion rejouée deux fois de
// suite (comme live_court_view_test.js pour la mise en place).
// ---------------------------------------------------------------------
const clock = { now: Date.now() };
// Redémarre un serveur de test propre (le premier a servi à Partie 1 avec
// l'horloge par défaut) pour contrôler `now` dès la création de la
// sauvegarde, exactement comme live_court_view_test.js.
const started = await startTestServer(() => clock.now);
const server2 = started.server;
const savePath2 = started.savePath;
const baseUrl2 = started.baseUrl;
let dom = await openGame(html, baseUrl2);
patchDateNow(dom.window, () => clock.now);
await flush(dom);

const saved = readRawSave(savePath2);
const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);
await dom.window.close();

clock.now = scheduledAt + Math.round(MATCH_BROADCAST_DURATION_MS / 2);
dom = await openGame(html, baseUrl2, (window) => patchDateNow(window, () => clock.now));
const doc = dom.window.document;

function readMarkPositions() {
  return [...doc.querySelectorAll("#liveCourtMarks > *")].map(mark => {
    const circle = mark.querySelector(".lcv-mark-o");
    if (circle) return { shape: "o", x: circle.getAttribute("cx"), y: circle.getAttribute("cy") };
    const line = mark.querySelector(".lcv-mark-x");
    return { shape: "x", x1: line.getAttribute("x1"), y1: line.getAttribute("y1"), x2: line.getAttribute("x2"), y2: line.getAttribute("y2") };
  });
}

const positionsBeforeReentry = readMarkPositions();
console.log(`\nSymboles affichés après la première entrée sur l'écran Live : ${positionsBeforeReentry.length}`);
if (positionsBeforeReentry.length === 0) throw new Error("❌ (setup) Aucun symbole affiché à mi-diffusion, impossible de tester la stabilité des positions.");

// Simule le manager qui quitte l'écran Live puis y revient (clic sur le
// bouton Live, où qu'il soit dans l'interface) : rejoue enterLiveMatch avec
// EXACTEMENT le même league.liveMatch, sans changer `clock.now`.
dom.window.eval("enterLiveMatch(league.liveMatch);");
const positionsAfterReentry = readMarkPositions();
console.log(`Symboles affichés après une DEUXIÈME entrée sur l'écran Live (même match, même instant) : ${positionsAfterReentry.length}`);

if (positionsAfterReentry.length !== positionsBeforeReentry.length) {
  throw new Error(`❌ Le nombre de symboles ne devrait pas changer entre deux entrées sur l'écran Live (${positionsBeforeReentry.length} puis ${positionsAfterReentry.length}).`);
}
for (let i = 0; i < positionsBeforeReentry.length; i++) {
  const before = positionsBeforeReentry[i];
  const after = positionsAfterReentry[i];
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`❌ BUG NON CORRIGÉ : le symbole #${i} a changé de position entre deux entrées sur l'écran Live (avant : ${JSON.stringify(before)}, après : ${JSON.stringify(after)}), c'est exactement le retour utilisateur "quand je clique sur le bouton live [...] ça change l'emplacement des shoots".`);
  }
}
console.log("✅ Tous les symboles restent exactement à la même position après une deuxième entrée sur l'écran Live (le bug de repositionnement est corrigé).");

// Une troisième entrée, pour ne pas se contenter d'une coïncidence entre
// deux tirages seulement.
dom.window.eval("enterLiveMatch(league.liveMatch);");
const positionsThirdTime = readMarkPositions();
for (let i = 0; i < positionsBeforeReentry.length; i++) {
  if (JSON.stringify(positionsBeforeReentry[i]) !== JSON.stringify(positionsThirdTime[i])) {
    throw new Error(`❌ BUG NON CORRIGÉ (persiste à la 3e entrée) : le symbole #${i} a de nouveau changé de position.`);
  }
}
console.log("✅ Toujours stable à une troisième entrée sur l'écran Live.");

await flush(dom);
await dom.window.close();
server.close();
server2.close();
console.log("\n🏁 Tous les tests live_court_shot_position_stability_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
