// Vérifie la carte des tirs affichée pendant la diffusion en direct et le
// chrono qui s'égrène. Depuis le 2026-10-01 (retour utilisateur : « on peut
// désormais enlever l'ancien [format de live] »), l'ancien terrain SVG
// (#liveCourtView/#liveCourtMarks/addCourtMark, ronds/croix + infobulle) a
// été retiré : la carte des tirs est celle de la vue live (assets/live/,
// module ES que jsdom n'exécute pas). Ce test vérifie donc l'état que
// l'adaptateur lui transmet (hmLive.shots, voir hmLiveOnEvent) : à la
// reconnexion en cours de diffusion, tous les événements déjà « passés à
// l'antenne » (airAt <= maintenant) sont appliqués synchroniquement (voir
// enterLiveMatch) — un tir doit alors figurer sur la carte pour CHAQUE tir
// déjà diffusé (réussi, manqué puis rebond, faute sur tir manqué), dans le
// même ordre, avec la bonne équipe, le bon résultat (réussi/manqué) et du
// côté du panier attaqué par l'équipe (« shot chart » cumulatif façon
// BuzzerBeater : « il faut mettre une croix quand c'est raté, un rond quand
// c'est marqué »). Le chrono interpolé, le chrono des 24 secondes et le
// point de possession restent vérifiés sur leurs nœuds d'état (#clockDisplay
// est lu par la vue live).
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

// --- Le fichier de sauvegarde (source de vérité serveur) contient la liste
// complète des événements déjà enrichis par schedulePlayback (avec airAt) —
// on y retrouve indépendamment tous les événements de tir/rebond déjà
// diffusés à cet instant, dans l'ordre, pour vérifier que les symboles
// affichés y correspondent exactement.
const savedMidway = readRawSave(savePath);
const liveMatch = savedMidway.league.liveMatch;
if (!liveMatch || !Array.isArray(liveMatch.events)) throw new Error("❌ league.liveMatch.events devrait être présent et structuré une fois la diffusion démarrée.");

// Tirs attendus sur la carte, même règle que hmLiveOnEvent : un panier
// réussi est porté par "shot" made ; un tir manqué « simple » par le
// "rebound" qui suit (tireur = équipe du rebond offensif, sinon l'autre) ;
// une faute sur tir manqué par "shot" + defender (pas de rebond ensuite) ;
// un contre ("shot" blocked) n'est compté qu'une fois, au rebond.
const toIdx = key => ((key === "A") === !!liveMatch.isHome ? 0 : 1);
const aired = liveMatch.events
  .filter(ev => typeof ev.airAt === "number" && ev.airAt <= clock.now)
  .sort((a, b) => a.airAt - b.airAt);
const expectedShots = [];
for (const ev of aired) {
  const zone = ev.zone === "inside" ? "paint" : ev.zone;
  if ((ev.team !== "A" && ev.team !== "B") || !["paint", "mid", "three"].includes(zone)) continue;
  const t = toIdx(ev.team);
  if (ev.type === "shot" && ev.made) expectedShots.push({ team: t, made: true, zone });
  else if (ev.type === "shot" && !ev.made && !ev.blocked && ev.defender) expectedShots.push({ team: t, made: false, zone });
  else if (ev.type === "rebound") expectedShots.push({ team: ev.offensive ? t : 1 - t, made: false, zone });
}
if (expectedShots.length === 0) throw new Error("❌ À mi-diffusion, au moins un tir devrait déjà avoir été diffusé (improbable sinon).");

const shots = JSON.parse(dom.window.eval("JSON.stringify(hmLive.shots)"));
console.log(`Tirs déjà diffusés : ${expectedShots.length} | tirs sur la carte de la vue live : ${shots.length}`);
if (shots.length !== expectedShots.length) {
  throw new Error(`❌ Il devrait y avoir exactement un tir sur la carte par tir déjà diffusé (${expectedShots.length}), pas ${shots.length} — un tir ne doit jamais être perdu ni dupliqué.`);
}
for (let i = 0; i < expectedShots.length; i++) {
  const e = expectedShots[i], sh = shots[i];
  if (sh.team !== e.team || sh.made !== e.made || sh.zone !== e.zone) {
    throw new Error(`❌ Tir #${i} : attendu ${JSON.stringify(e)}, obtenu ${JSON.stringify({ team: sh.team, made: sh.made, zone: sh.zone })}.`);
  }
  // Terrain de 94 pieds : l'équipe à domicile (0) attaque le panier de
  // droite, l'équipe à l'extérieur (1) celui de gauche (voir hmLiveShotSpot).
  if (!(e.team === 0 ? sh.x > 47 : sh.x < 47) || !(sh.y >= 0 && sh.y <= 50)) {
    throw new Error(`❌ Tir #${i} (équipe ${e.team}) hors de la moitié de terrain attaquée : (${sh.x}, ${sh.y}).`);
  }
}
console.log(`✅ Chaque tir (${shots.length}) figure sur la carte dans l'ordre, avec la bonne équipe, le bon résultat (réussi/manqué), la bonne zone et du bon côté du terrain.`);

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
// Retour utilisateur (2026-10-08, « le chrono démarre au chargement du
// live ») : le marqueur « Début du 1er quart-temps » ne lance PAS le
// chrono — entre lui et l'entre-deux, 10:00 figé et pas de 24 s ; le chrono
// démarre à l'entre-deux (tipoff) et défile dès l'instant qui suit.
clock.now = (firstEvent.airAt + tipoffEvent.airAt) / 2;
dom.window.eval("updateLiveClockTick()");
if (doc.getElementById("clockDisplay").textContent !== "10:00" || !shotBadge.classList.contains("off")) {
  throw new Error(`❌ Entre le marqueur de quart-temps et l'entre-deux, le chrono doit rester à 10:00 sans 24 s — obtenu "${doc.getElementById("clockDisplay").textContent}".`);
}
console.log("✅ Avant l'entre-deux (marqueur de quart-temps seul) : chrono figé à 10:00, pas de 24 s.");
// 10 % du chemin entre l'entre-deux et le prochain chrono différent, mais au
// moins 1,5 s après l'entre-deux (et jamais au-delà de la moitié) : une
// action très rapide (faute au bout de 2 s, 2026-10-09) laisserait sinon le
// chrono des 24 s afficher encore « 24 » (arrondi au supérieur), à raison.
{ const gap = nextDiffAfterTipoff.airAt - tipoffEvent.airAt; clock.now = tipoffEvent.airAt + Math.min(gap * 0.5, Math.max(gap * 0.1, 1500)); }
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

await flush(dom);
await dom.window.close();
server.close();
console.log("\n✅ Carte des tirs (vue live) et chrono du direct vérifiés : un tir par tir diffusé, dans l'ordre, avec la bonne équipe/résultat/côté ; chrono et 24 secondes qui s'égrènent ; point de possession.");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
