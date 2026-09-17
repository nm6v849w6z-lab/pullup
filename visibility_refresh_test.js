// Vérifie le rafraîchissement automatique de la page (tâche #22, retour
// utilisateur : "je ne dois pas avoir à recharger la page à la main") face
// au cas que le compte à rebours seul (startCountdown, tâche #21) ne couvre
// qu'à moitié : un onglet laissé en ARRIÈRE-PLAN (navigateur minimisé,
// changement d'onglet) voit ses setInterval/setTimeout throttlés par le
// navigateur — l'écran peut donc rester figé, en retard sur l'horloge
// réelle, plusieurs dizaines de secondes après le retour sur l'onglet, le
// temps que le timer throttlé se réveille de lui-même. Le listener
// `visibilitychange` ajouté dans moteurbasket3.html revérifie l'état
// immédiatement au retour sur l'onglet plutôt que d'attendre ce réveil :
// - écran de préparation resté affiché alors que le coup d'envoi est déjà
//   passé → bascule aussitôt sur le direct ;
// - écran de direct resté affiché alors que la fenêtre de diffusion est
//   déjà entièrement écoulée → se finalise aussitôt ;
// - rien ne se passe si l'heure prévue n'est simplement pas encore là (pas
//   de déclenchement intempestif, pas de changement d'onglet forcé si le
//   joueur consultait autre chose).
//
// Simule le passage du temps réel via un `nowFn` injectable CÔTÉ SERVEUR
// (voir startTestServer) ET `patchDateNow` CÔTÉ NAVIGATEUR (voir
// test_helpers.js) — les deux doivent avancer de concert pour rester
// cohérents, exactement comme un vrai décalage du temps réel : le serveur
// est celui qui décide si le direct doit démarrer/se finaliser
// (ensureLiveMatchStarted/catchUpLeague), le navigateur celui qui décide si
// le retour sur l'onglet doit revérifier l'état (le nouveau listener).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, patchDateNow } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function fireVisible(doc, win) {
  Object.defineProperty(doc, "visibilityState", { value: "visible", configurable: true });
  doc.dispatchEvent(new win.Event("visibilitychange"));
}

(async () => {

// ---------------------------------------------------------------------
// Partie 1 : écran de préparation resté affiché après le coup d'envoi (le
// compte à rebours n'a pas eu l'occasion de se déclencher, comme s'il avait
// été throttlé en arrière-plan) — le retour sur l'onglet doit à lui seul
// basculer sur le direct, sans rechargement manuel.
// ---------------------------------------------------------------------
{
  const clock = { now: Date.now() };
  const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  const win = dom.window;

  await flush(dom);
  const saved = readRawSave(savePath);
  const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);

  const prepVisibleBefore = !doc.getElementById("prepSection").classList.contains("hidden");
  const liveVisibleBefore = !doc.getElementById("liveSection").classList.contains("hidden");
  console.log("Avant coup d'envoi — préparation visible :", prepVisibleBefore, "| direct visible :", liveVisibleBefore);
  if (!prepVisibleBefore || liveVisibleBefore) throw new Error("❌ Avant le coup d'envoi, l'écran de préparation devrait être affiché (pas le direct).");

  // Rien ne doit se passer si le retour sur l'onglet a lieu AVANT le coup
  // d'envoi (pas de déclenchement intempestif).
  fireVisible(doc, win);
  await flush(dom).catch(() => {}); // pas de sauvegarde attendue ici, mais ne doit pas planter si une survient
  const prepVisibleStillBefore = !doc.getElementById("prepSection").classList.contains("hidden");
  if (!prepVisibleStillBefore) throw new Error("❌ Le retour sur l'onglet ne devrait rien changer avant le coup d'envoi.");
  console.log("✅ Pas de déclenchement intempestif avant le coup d'envoi.");

  // Le temps réel passe (serveur ET navigateur de concert) : le coup
  // d'envoi est désormais passé de quelques secondes, mais la fenêtre de
  // diffusion (1h30) est encore très largement ouverte.
  clock.now = scheduledAt + 5000;
  patchDateNow(win, () => clock.now);

  fireVisible(doc, win);
  await new Promise(r => setTimeout(r, 300)); // refreshFromServerAndReenter() est asynchrone (fetch)

  const prepVisibleAfter = !doc.getElementById("prepSection").classList.contains("hidden");
  const liveVisibleAfter = !doc.getElementById("liveSection").classList.contains("hidden");
  console.log("Après coup d'envoi (retour sur l'onglet) — préparation visible :", prepVisibleAfter, "| direct visible :", liveVisibleAfter);
  if (liveVisibleAfter === false) throw new Error("❌ Le retour sur l'onglet après le coup d'envoi devrait basculer automatiquement sur le direct.");
  console.log("✅ Le retour sur l'onglet après le coup d'envoi bascule automatiquement sur le direct, sans rechargement manuel.");

  await flush(dom);
  dom.window.close();
  server.close();
}

// ---------------------------------------------------------------------
// Partie 2 : écran de direct resté affiché alors que sa fenêtre de
// diffusion est déjà entièrement écoulée (comme si le navigateur avait
// throttlé les setTimeout programmés par enterLiveMatch pendant tout ce
// temps) — le retour sur l'onglet doit finaliser l'affichage (score final,
// sans manquer les événements jamais appliqués faute d'avoir déclenché leurs
// setTimeout à temps).
// ---------------------------------------------------------------------
{
  const clock = { now: Date.now() };
  const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  const win = dom.window;

  await flush(dom);
  const saved = readRawSave(savePath);
  const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);

  // Avance juste jusqu'au coup d'envoi (le direct démarre côté serveur ET
  // côté navigateur), sans attendre la fin de sa diffusion.
  clock.now = scheduledAt + 1000;
  patchDateNow(win, () => clock.now);
  fireVisible(doc, win);
  await new Promise(r => setTimeout(r, 300));

  const liveVisibleMidway = !doc.getElementById("liveSection").classList.contains("hidden");
  const statusMidway = doc.getElementById("boardStatus").textContent;
  console.log("\nJuste après le coup d'envoi — direct visible :", liveVisibleMidway, "| statut :", statusMidway);
  if (!liveVisibleMidway) throw new Error("❌ Le direct devrait être affiché juste après le coup d'envoi.");

  // Le temps réel passe jusqu'à BIEN AU-DELÀ de la fin de la fenêtre de
  // diffusion (1h30) — comme si l'onglet était resté en arrière-plan tout
  // ce temps, sans qu'aucun des setTimeout programmés (événements, fin de
  // diffusion) ne se soit déclenché.
  clock.now = scheduledAt + MATCH_BROADCAST_DURATION_MS + 10000;
  fireVisible(doc, win);
  await new Promise(r => setTimeout(r, 300));

  const statusAfter = doc.getElementById("boardStatus").textContent;
  const scoreA = parseInt(doc.getElementById("scoreA").textContent, 10);
  const scoreB = parseInt(doc.getElementById("scoreB").textContent, 10);
  console.log("Après la fin de la fenêtre de diffusion (retour sur l'onglet) — statut :", statusAfter, "| score :", scoreA, "-", scoreB);
  if (statusAfter !== "Terminé" && statusAfter !== "Terminé (forfait)") {
    throw new Error("❌ Le retour sur l'onglet après la fin de la diffusion devrait afficher le match comme terminé.");
  }
  if (!(scoreA >= 0 && scoreB >= 0 && (scoreA > 0 || scoreB > 0 || statusAfter === "Terminé (forfait)"))) {
    throw new Error(`❌ Un score final valide devrait être affiché, obtenu ${scoreA}-${scoreB}.`);
  }
  console.log("✅ Le retour sur l'onglet après la fin de la diffusion finalise automatiquement l'affichage (score final), sans rechargement manuel.");

  await flush(dom);
  dom.window.close();
  server.close();
}

console.log("\n✅ Rafraîchissement automatique de la page vérifié (tâche #22) : le retour sur un onglet resté en arrière-plan (timers throttlés) rattrape immédiatement un coup d'envoi ou une fin de diffusion déjà passés, sans jamais agir prématurément ni nécessiter de rechargement manuel.");

})().catch(e => { console.error(e); process.exit(1); });
