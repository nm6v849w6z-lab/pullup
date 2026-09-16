// Vérifie la vue 2D du terrain affichée pendant la diffusion en direct
// (moteurbasket3.html : #liveCourtView, un vrai terrain SVG avec raquette/
// ligne à 3 points/rond central — voir #liveCourtMarks/addCourtMark),
// alimentée par les champs structurés ajoutés aux événements — voir
// engine.js:log/teamKey et engine_live_events_test.js pour la partie
// "moteur" en isolation. Ce test couvre la partie CLIENT : à la
// reconnexion en cours de diffusion, tous les événements déjà "passés à
// l'antenne" (airAt <= maintenant) sont appliqués synchroniquement (voir
// enterLiveMatch) — un symbole (rond = réussi, croix = raté) doit alors
// apparaître sur le terrain pour CHACUN des tirs/rebonds déjà diffusés
// parmi eux, dans le même ordre, avec la bonne couleur d'équipe — c'est un
// "shot chart" cumulatif façon BuzzerBeater (retour utilisateur, 2026-09 :
// "il faut mettre une croix quand c'est raté, un rond quand c'est marqué"),
// pas un marqueur unique qui se contenterait de refléter le dernier
// événement (v1 précédente, voir historique de ce fichier). Comme la
// position de chaque symbole comporte volontairement une part de hasard
// dans sa zone (le moteur ne modélise pas de coordonnées de tir exactes),
// ce test vérifie le NOMBRE de symboles, leur ORDRE, leur FORME (rond/
// croix ↔ made) et leur COULEUR/CÔTÉ (équipe), pas une position pixel
// près — voir end_to_end_test.js (partie 4) pour le même principe de
// reprise "in medias res" appliqué au fil de texte.
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

// --- Reconnexion à mi-diffusion (comme end_to_end_test.js partie 4) : tous
// les événements déjà "passés à l'antenne" (airAt <= maintenant) doivent
// être appliqués synchroniquement, y compris sur la vue de terrain.
clock.now = scheduledAt + Math.round(MATCH_BROADCAST_DURATION_MS / 2);
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
const doc = dom.window.document;

const liveVisible = !doc.getElementById("liveSection").classList.contains("hidden");
if (!liveVisible) throw new Error("❌ À mi-diffusion, l'écran de direct devrait être affiché.");

const courtWrap = doc.getElementById("liveCourtWrap");
if (courtWrap.classList.contains("hidden")) throw new Error("❌ La vue de terrain devrait être visible pendant un match normal (non forfait).");
console.log("✅ La vue de terrain est bien affichée pendant la diffusion en direct (match normal).");

// --- Le vrai terrain (raquette, ligne à 3 points, rond central) doit être
// dessiné en SVG, pas juste un rectangle vide — retour utilisateur : "il
// faut dessiner le terrain de basket aussi (raquette, 3 pts...)".
const svg = doc.querySelector("#liveCourtView svg");
if (!svg) throw new Error("❌ Le terrain devrait être un vrai <svg>, pas juste un fond uni.");
const courtLines = svg.querySelectorAll(".lcv-line").length;
if (courtLines < 10) throw new Error(`❌ Le terrain devrait comporter plusieurs lignes dessinées (raquettes, ligne à 3 points, rond central...) — seulement ${courtLines} trouvée(s).`);
console.log(`✅ Un vrai terrain est dessiné en SVG (${courtLines} éléments de tracé : raquettes, ligne à 3 points, rond central...).`);

// --- Retour utilisateur : "enleve [les noms d'équipe] sur le terrain" — les
// étiquettes de coin (liveCourtLabelLeft/Right) ont été retirées ; le
// tableau de bord au-dessus suffit à identifier les deux équipes.
if (doc.getElementById("liveCourtLabelLeft") || doc.getElementById("liveCourtLabelRight")) {
  throw new Error("❌ Les étiquettes de nom d'équipe superposées sur le terrain devraient avoir été retirées (retour utilisateur : \"enleve [les noms d'équipe] sur le terrain\").");
}
console.log("✅ Aucune étiquette de nom d'équipe superposée sur le terrain (retirée à la demande de l'utilisateur).");

// --- Le fichier de sauvegarde (source de vérité serveur) contient la liste
// complète des événements déjà enrichis par schedulePlayback (avec airAt) —
// on y retrouve indépendamment tous les événements de tir/rebond déjà
// diffusés à cet instant, dans l'ordre, pour vérifier que les symboles
// affichés y correspondent exactement.
const savedMidway = readRawSave(savePath);
const liveMatch = savedMidway.league.liveMatch;
if (!liveMatch || !Array.isArray(liveMatch.events)) throw new Error("❌ league.liveMatch.events devrait être présent et structuré une fois la diffusion démarrée.");

const airedShotOrRebound = liveMatch.events
  .filter(ev => (ev.type === "shot" || ev.type === "rebound") && typeof ev.airAt === "number" && ev.airAt <= clock.now)
  .sort((a, b) => a.airAt - b.airAt);

if (airedShotOrRebound.length === 0) throw new Error("❌ À mi-diffusion, au moins un événement de tir/rebond devrait déjà avoir été diffusé (improbable sinon).");

const marks = [...doc.querySelectorAll("#liveCourtMarks > *")];
console.log(`Tirs/rebonds déjà diffusés : ${airedShotOrRebound.length} | symboles affichés sur le terrain : ${marks.length}`);
if (marks.length !== airedShotOrRebound.length) {
  throw new Error(`❌ Il devrait y avoir exactement un symbole par tir/rebond déjà diffusé (${airedShotOrRebound.length}), pas ${marks.length} — un symbole ne doit jamais être perdu ni dupliqué.`);
}
console.log("✅ Il y a bien exactement un symbole sur le terrain par tir/rebond déjà diffusé (aucun perdu, aucun dupliqué).");

// --- Chaque symbole, dans l'ordre d'apparition, doit correspondre au bon
// événement. Depuis le passage au style "moderne" avec infobulle au survol
// (retour utilisateur : "sur buzzerbeater, quand on passe la souris sur la
// croix ou rond, on voit qui a pris le tir"), chaque symbole est TOUJOURS un
// groupe <g class="lcv-mark teamA|teamB"> (jamais un <circle> nu au premier
// niveau) contenant : un cercle de survol invisible (lcv-mark-hit), la forme
// visible (rond lcv-mark-o si réussi, deux traits lcv-mark-x si raté) et un
// <title> SVG donnant le nom du tireur — voir addCourtMark dans
// moteurbasket3.html.
for (let i = 0; i < airedShotOrRebound.length; i++) {
  const ev = airedShotOrRebound[i];
  const mark = marks[i];
  if (mark.tagName.toLowerCase() !== "g") {
    throw new Error(`❌ Symbole #${i} : attendu un groupe <g class="lcv-mark ...">, obtenu <${mark.tagName}> — événement : ${JSON.stringify(ev)}`);
  }
  const markClass = mark.getAttribute("class") || "";
  if (!markClass.includes("lcv-mark")) {
    throw new Error(`❌ Symbole #${i} devrait porter la classe "lcv-mark" — classe réelle : "${markClass}"`);
  }
  const expectedTeamClass = ev.team === "B" ? "teamB" : "teamA";
  if (!markClass.includes(expectedTeamClass)) {
    throw new Error(`❌ Symbole #${i} devrait porter la classe d'équipe "${expectedTeamClass}" (team=${ev.team}) — classe réelle : "${markClass}"`);
  }
  const expectedShapeSelector = ev.made ? ".lcv-mark-o" : ".lcv-mark-x";
  if (!mark.querySelector(expectedShapeSelector)) {
    throw new Error(`❌ Symbole #${i} (made=${ev.made}) devrait contenir un élément "${expectedShapeSelector}" — contenu : ${mark.innerHTML}`);
  }
  if (!mark.querySelector(".lcv-mark-hit")) {
    throw new Error(`❌ Symbole #${i} devrait contenir une zone de survol agrandie (.lcv-mark-hit) pour faciliter le survol à la souris.`);
  }
  const title = mark.querySelector("title");
  if (!title || !title.textContent.trim()) {
    throw new Error(`❌ Symbole #${i} devrait contenir un <title> non vide (infobulle de secours) — événement : ${JSON.stringify(ev)}`);
  }
  const expectedShooter = ev.shooter || "Joueur inconnu";
  if (!title.textContent.includes(expectedShooter)) {
    throw new Error(`❌ Symbole #${i} : le <title> devrait mentionner le tireur "${expectedShooter}" — obtenu : "${title.textContent}"`);
  }
}
console.log(`✅ Chaque symbole (${marks.length}) correspond, dans l'ordre, à la bonne forme (rond/croix ↔ tir réussi/raté), à la bonne couleur d'équipe, et porte un <title> mentionnant le tireur.`);

// --- Chaque équipe attaquant toujours le même panier sur cet écran (A à
// gauche, B à droite — même côté que leur score respectif dans le tableau
// de bord, retour utilisateur : "il faudrait que les shoots soient du même
// côté que le score [...], moins compliqué à comprendre comme ça"), les
// symboles de A doivent être du côté gauche du terrain (cx/points < 500, la
// ligne médiane) et ceux de B du côté droit — jamais l'inverse, même avec
// la part de hasard dans leur position exacte.
function markCenterX(mark) {
  const circle = mark.querySelector(".lcv-mark-o");
  if (circle) return parseFloat(circle.getAttribute("cx"));
  const lines = mark.querySelectorAll(".lcv-mark-x");
  const xs = [...lines].flatMap(l => [parseFloat(l.getAttribute("x1")), parseFloat(l.getAttribute("x2"))]);
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}
for (let i = 0; i < airedShotOrRebound.length; i++) {
  const ev = airedShotOrRebound[i];
  const cx = markCenterX(marks[i]);
  const expectedSide = ev.team === "A" ? cx < 500 : cx > 500;
  if (!expectedSide) {
    throw new Error(`❌ Symbole #${i} (équipe ${ev.team}) est du mauvais côté du terrain (x=${cx}) — l'équipe A attaque toujours le panier de gauche (même côté que son score), B celui de droite.`);
  }
}
console.log("✅ Les symboles de chaque équipe restent bien du côté du panier qu'elle attaque, le même que leur score (A à gauche, B à droite).");

// --- Infobulle au survol (retour utilisateur : "sur buzzerbeater, quand on
// passe la souris sur la croix ou rond, on voit qui a pris le tir") : simule
// un survol du premier symbole et vérifie que #liveCourtTooltip devient
// visible et affiche le nom du tireur, puis redevient invisible au
// mouseleave.
const tooltip = doc.getElementById("liveCourtTooltip");
if (!tooltip) throw new Error("❌ #liveCourtTooltip devrait exister dans le DOM (infobulle custom au survol d'un symbole).");
const firstMark = marks[0];
const firstEv = airedShotOrRebound[0];
firstMark.dispatchEvent(new dom.window.Event("mouseenter", { bubbles: true }));
if (!tooltip.classList.contains("visible")) throw new Error("❌ L'infobulle devrait devenir visible au survol (mouseenter) d'un symbole.");
const expectedShooterFirst = firstEv.shooter || "Joueur inconnu";
if (!tooltip.textContent.includes(expectedShooterFirst)) {
  throw new Error(`❌ L'infobulle devrait afficher le nom du tireur "${expectedShooterFirst}" — contenu réel : "${tooltip.textContent}"`);
}
console.log(`✅ L'infobulle au survol s'affiche et mentionne bien le tireur ("${expectedShooterFirst}").`);
firstMark.dispatchEvent(new dom.window.Event("mouseleave", { bubbles: true }));
if (tooltip.classList.contains("visible")) throw new Error("❌ L'infobulle devrait redevenir invisible une fois la souris sortie du symbole (mouseleave).");
console.log("✅ L'infobulle disparaît bien quand la souris quitte le symbole.");

// --- Chrono de match "qui s'égrène" + chrono des 24 secondes (retour
// utilisateur : "le chrono ne défile pas en fait" / "ce serait bien si on
// voyait les secondes s'égrener ainsi que le chrono des 24 sec") : le
// client interpole le chrono affiché entre deux événements consécutifs déjà
// connus (airAt/clock) — vérifié en appelant updateLiveClockTick()
// directement avec Date.now() patché à un instant précis (via `clock`, déjà
// branché sur patchDateNow plus haut), sans attendre en temps réel.
function clockStrToSeconds(str) {
  const [m, s] = str.split(":").map(Number);
  return m * 60 + s;
}
const allLiveEvents = [...liveMatch.events].sort((a, b) => a.airAt - b.airAt);
let tickPair = null;
let tickPairFallback = null;
for (let i = 0; i < allLiveEvents.length - 1; i++) {
  const a = allLiveEvents[i], b = allLiveEvents[i + 1];
  if (a.quarter === b.quarter && b.airAt > a.airAt) {
    const overlapsAPause = liveMatch.pauses.some(p => a.airAt < p.airAt + p.durationMs && b.airAt > p.airAt);
    if (!overlapsAPause) {
      if (!tickPairFallback) tickPairFallback = [a, b];
      if (a.clock !== b.clock) { tickPair = [a, b]; break; } // préfère une paire où le chrono bouge vraiment, plus parlant à vérifier
    }
  }
}
tickPair = tickPair || tickPairFallback;
if (!tickPair) throw new Error("❌ Impossible de trouver deux événements consécutifs du même quart-temps pour tester le chrono qui s'égrène (match trop court ?).");
const [evA, evB] = tickPair;
clock.now = (evA.airAt + evB.airAt) / 2;
dom.window.eval("updateLiveClockTick()");
const interpolatedClock = doc.getElementById("clockDisplay").textContent;
const secA = clockStrToSeconds(evA.clock), secB = clockStrToSeconds(evB.clock);
const [minSec, maxSec] = secA <= secB ? [secA, secB] : [secB, secA];
const interpSec = clockStrToSeconds(interpolatedClock);
if (interpSec < minSec || interpSec > maxSec) {
  throw new Error(`❌ Le chrono interpolé (${interpolatedClock}) devrait être entre les deux événements qui l'encadrent (${evA.clock} et ${evB.clock}).`);
}
const shotBadge = doc.getElementById("shotClockDisplay");
if (!shotBadge) throw new Error("❌ #shotClockDisplay devrait exister dans le DOM (chrono des 24 secondes).");
if (shotBadge.classList.contains("off")) throw new Error("❌ Le chrono des 24 secondes devrait être visible entre deux événements en cours de jeu (hors pause).");
const shotVal = parseInt(shotBadge.textContent, 10);
if (!(shotVal >= 0 && shotVal <= 24)) throw new Error(`❌ Le chrono des 24 secondes devrait afficher une valeur entre 0 et 24 — obtenu "${shotBadge.textContent}"`);
console.log(`✅ Le chrono de match s'interpole bien en continu entre deux événements connus (${evA.clock} → ${interpolatedClock} → ${evB.clock}), et le chrono des 24 secondes affiche une valeur cohérente (${shotVal}).`);

// --- Retour utilisateur : "début du premier quart temps, faut le mettre
// avan[t] l'entre deux est remporté par..." — le marqueur "Début du 1er
// quart-temps" doit précéder l'entre-deux dans le fil (voir engine.js :
// loggué en tout premier, avant le tirage au sort de l'entre-deux).
const firstEvent = allLiveEvents[0];
if (firstEvent.type !== "quarterStart") {
  throw new Error(`❌ Le tout premier événement devrait être le marqueur "Début du 1er quart-temps" — obtenu : ${JSON.stringify(firstEvent)}`);
}
const tipoffEvent = allLiveEvents[1];
if (tipoffEvent.type !== "tipoff") {
  throw new Error(`❌ Le deuxième événement devrait être l'entre-deux ("tipoff"), juste après le marqueur de quart-temps — obtenu : ${JSON.stringify(tipoffEvent)}`);
}
console.log("✅ Le marqueur \"Début du 1er quart-temps\" précède bien l'annonce de l'entre-deux dans le fil.");

// --- Retour utilisateur : "quand l'entre-deux est remporté, [...] le
// chrono et le chrono des 24 doit tourner dès ce moment-là (pas à partir du
// premier tir)". Les tout premiers événements (le marqueur de quart-temps
// puis l'entre-deux, tous deux à 10:00) partagent souvent leur `clock` avec
// 1-2 événements suivants (parfois le tout premier tir — le moteur horodate
// un événement au chrono du DÉBUT de sa possession, voir engine.js).
// Vérifie que le chrono défile bien dès le tout début de la diffusion, sans
// attendre que TOUS ces événements à chrono identique soient passés —
// reproduit exactement le calcul client (`runStart`/`nextDiff`, voir
// updateLiveClockTick).
let nextDiffAfterTipoff = null;
for (let i = 1; i < allLiveEvents.length; i++) {
  const ev = allLiveEvents[i];
  if (ev.quarter !== firstEvent.quarter) break;
  if (ev.clock !== firstEvent.clock) { nextDiffAfterTipoff = ev; break; }
}
if (!nextDiffAfterTipoff) throw new Error("❌ Impossible de trouver un événement au chrono différent après l'entre-deux (match trop court ?).");
// Un instant tout proche du tout début de la diffusion (10% du chemin vers
// le prochain chrono différent) — même s'il tombe AVANT un événement
// intermédiaire à chrono identique (l'entre-deux...), le chrono affiché doit
// déjà avoir bougé, pas être figé à 10:00.
clock.now = firstEvent.airAt + (nextDiffAfterTipoff.airAt - firstEvent.airAt) * 0.1;
dom.window.eval("updateLiveClockTick()");
const clockJustAfterTipoff = doc.getElementById("clockDisplay").textContent;
if (clockStrToSeconds(clockJustAfterTipoff) >= 600) {
  throw new Error(`❌ Le chrono devrait déjà avoir commencé à défiler juste après l'entre-deux, pas rester figé à 10:00 — obtenu "${clockJustAfterTipoff}".`);
}
const shotClockJustAfterTipoff = parseInt(shotBadge.textContent, 10);
if (!(shotClockJustAfterTipoff >= 0 && shotClockJustAfterTipoff < 24)) {
  throw new Error(`❌ Le chrono des 24 secondes devrait déjà avoir commencé à décompter juste après l'entre-deux — obtenu "${shotBadge.textContent}".`);
}
console.log(`✅ Le chrono (${clockJustAfterTipoff}) et le chrono des 24 secondes (${shotClockJustAfterTipoff}) démarrent bien dès l'entre-deux, pas seulement à partir du premier tir.`);

// --- Point de possession (retour utilisateur : "on ne sait pas qui a la
// balle" / "mettre un point pour dire qui a la balle") : pendant cet
// intervalle, le point orange doit être visible à côté du nom de l'équipe
// qui a la balle (celle du prochain événement, `evB.possession`, avec le
// même repli que le client si absent — voir updateLiveClockTick). Remet
// `clock.now` au milieu de la paire [evA, evB] (le test de l'entre-deux
// ci-dessus l'a changé entre-temps) avant de relire l'état affiché.
clock.now = (evA.airAt + evB.airAt) / 2;
dom.window.eval("updateLiveClockTick()");
const expectedPossession = evB.possession || evA.possession;
if (expectedPossession !== "A" && expectedPossession !== "B") {
  throw new Error(`❌ Impossible de déterminer la possession attendue pour cette paire d'événements (${JSON.stringify(evA)} / ${JSON.stringify(evB)}).`);
}
const dotA = doc.getElementById("possDotA");
const dotB = doc.getElementById("possDotB");
if (!dotA || !dotB) throw new Error("❌ #possDotA et #possDotB devraient exister dans le DOM (point de possession à côté du nom de chaque équipe).");
const dotAOn = !dotA.classList.contains("off");
const dotBOn = !dotB.classList.contains("off");
if (dotAOn === dotBOn) throw new Error(`❌ Exactement un des deux points de possession devrait être visible à la fois — A visible: ${dotAOn}, B visible: ${dotBOn}.`);
const shownPossession = dotAOn ? "A" : "B";
if (shownPossession !== expectedPossession) {
  throw new Error(`❌ Le point de possession affiché (${shownPossession}) ne correspond pas à l'équipe qui a la balle (${expectedPossession}).`);
}
console.log(`✅ Le point de possession est bien affiché à côté du bon nom d'équipe (${expectedPossession}).`);

// --- En pause (mi-temps/entre quarts-temps/temps mort), le jeu est arrêté :
// le chrono des 24 secondes ne doit pas s'afficher (rien à décompter).
if (liveMatch.pauses.length > 0) {
  const pause = liveMatch.pauses[0];
  clock.now = pause.airAt + pause.durationMs / 2;
  dom.window.eval("updateLiveClockTick()");
  if (!shotBadge.classList.contains("off")) {
    throw new Error("❌ Le chrono des 24 secondes devrait être masqué pendant une pause (temps mort/mi-temps/entre quarts-temps).");
  }
  console.log("✅ Le chrono des 24 secondes est bien masqué pendant une pause.");
}

// --- Un nouveau match (nouvelle diffusion) doit repartir d'un terrain vide
// — les tirs d'un match précédent ne doivent jamais rester affichés. Testé
// indirectement via resetCourtView : rejouer enterLiveMatch (reconnexion)
// avec un autre round viderait le terrain — ici, on vérifie au moins que le
// mécanisme de vidage existe et fonctionne en appelant la fonction cliente
// directement (déjà exercée par chaque appel à enterLiveMatch ci-dessus,
// donc pas un no-op silencieux).
dom.window.eval("clearCourtMarks()");
const marksAfterClear = doc.querySelectorAll("#liveCourtMarks > *").length;
if (marksAfterClear !== 0) throw new Error("❌ clearCourtMarks() devrait vider entièrement le terrain.");
console.log("✅ Le terrain peut bien être vidé (utilisé par resetCourtView à chaque nouvelle diffusion, pour ne jamais garder les tirs d'un match précédent).");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n✅ Vue 2D du terrain (live) vérifiée : vrai terrain SVG dessiné (raquettes/3 points/rond central), un symbole rond/croix par tir/rebond diffusé, dans l'ordre, avec la bonne équipe/couleur/côté, terrain remis à zéro entre deux matchs.");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
