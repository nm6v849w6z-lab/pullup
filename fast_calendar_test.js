// Vérifie le MODE ACCÉLÉRÉ du calendrier (tests/démo solo, retour
// utilisateur 2026-09 : "je vais quand même pas attendre 2 mois pour tester
// une saison" — "on repartira sur un calendrier classique quand le jeu sera
// opérationnel [...] on restera sur ce schéma [accéléré] aussi" pour les
// tests solo). Activé via server/calendar.js:setFastTestMode(true) — ce que
// fait server/index.js au démarrage si BASKET_FAST_CALENDAR=1 (voir
// server/README.md/README.md racine pour comment l'activer en pratique) :
// un match de championnat se simule toutes les 3h (resserré depuis 5h,
// retour utilisateur 2026-09 : "sinon ça va être long les tests" ;
// intervalle glissant depuis l'instant de création, PAS ancré sur une heure
// de la journée — retour utilisateur, 2026-09, après un 1er essai à
// horaires fixes façon "10h/15h" qui tombait à un horaire arbitraire selon
// l'instant de création), et tous les deux matchs (fin de la "semaine" de
// 6h), l'entraînement + les finances hebdomadaires s'appliquent —
// permettant d'enchaîner une saison de 18 journées en ~54h (2-3 jours
// réels) au lieu de ~9 semaines.
//
// Complète calendar_test.js (côté serveur, calculs purs isolés) par un vrai
// parcours UI bout en bout : nouvelle carrière créée alors que le mode
// accéléré est actif, calendrier CÔTÉ NAVIGATEUR (compte à rebours) qui
// reflète bien le rythme accéléré, ET la garantie que le rythme d'une ligue
// déjà en cours ne bouge jamais si le réglage global change ensuite (voir
// League.calendarWeekMs/calendarSlotOffsetsMs, engine.js) — y compris à
// travers un changement de saison (startNewSeason hérite explicitement de
// l'ancien réglage plutôt que de relire le réglage global courant).
const fs = require("fs");
const {
  startTestServer, openGame, flush, readRawSave, patchDateNow,
} = require("./test_helpers.js");
const Calendar = require("./server/calendar.js");
const { DAY_MS, FAST_MATCH_INTERVAL_MS, FAST_WEEK_MS, FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS } = Calendar;
const Engine = require("./engine.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const HOUR_MS = 60 * 60 * 1000;

(async () => {

// ---------------------------------------------------------------------
// Partie 0 : ancrage sur minuit (heure locale) plutôt que sur l'instant
// EXACT de création — comportement générique d'anchoredCalendarStartAt
// (engine.js), qui ne se déclenche QUE pour un rythme d'EXACTEMENT 1 jour/
// semaine (weekMs === CALENDAR_DAY_MS). Le mode accéléré ACTUEL (intervalle
// glissant de 3h, weekMs = 6h) n'est PAS concerné — testé séparément en
// Partie 1. Ce test-ci vérifie directement generateLeague avec un config
// littéral "1 jour/semaine, créneaux 10h/15h" (l'ANCIENNE forme du mode
// accéléré, retour utilisateur 2026-09), pour que ce mécanisme générique ne
// se casse pas silencieusement s'il est réutilisé un jour.
// ---------------------------------------------------------------------
{
  const oneDayConfig = { weekMs: DAY_MS, slotOffsetsMs: [10 * HOUR_MS, 15 * HOUR_MS] };
  const team = Engine.generateStartingRoster("Ancrage Test");

  // Créée à 14h52 (après le créneau de 10h, avant celui de 15h) : le 1er
  // créneau (10h) du jour même est déjà passé → bascule au lendemain.
  const createdAt1452 = new Date(2026, 8, 12, 14, 52, 0).getTime();
  const league1 = Engine.generateLeague(team, 1, createdAt1452, oneDayConfig);
  const round0_1 = Engine.calendarScheduledTimeForRound(league1.calendarStartAt, 0, league1.calendarWeekMs, league1.calendarSlotOffsetsMs);
  const d1 = new Date(round0_1);
  if (d1.getHours() !== 10 || d1.getMinutes() !== 0) {
    throw new Error(`❌ Une carrière créée à 14h52 (rythme 1 jour/semaine) devrait avoir son 1er match à 10h00 pile (jamais à un horaire dérivé de l'instant de création), obtenu ${d1.toString()}.`);
  }
  if (round0_1 <= createdAt1452) {
    throw new Error("❌ Le 1er match d'une carrière fraîchement créée devrait toujours être dans le futur, jamais déjà passé.");
  }
  console.log(`✅ [rythme 1 jour/semaine] Carrière créée à 14h52 → 1er match à ${d1.toTimeString().slice(0, 5)} (jour suivant, puisque le créneau de 10h du jour même était déjà passé) — jamais à un horaire arbitraire dérivé de l'instant de création.`);

  // Créée à 6h du matin (avant le créneau de 10h) : le 1er match reste sur
  // le jour même, à 10h pile.
  const createdAt0600 = new Date(2026, 8, 12, 6, 0, 0).getTime();
  const league2 = Engine.generateLeague(team, 1, createdAt0600, oneDayConfig);
  const round0_2 = Engine.calendarScheduledTimeForRound(league2.calendarStartAt, 0, league2.calendarWeekMs, league2.calendarSlotOffsetsMs);
  const d2 = new Date(round0_2);
  if (d2.getHours() !== 10 || d2.getMinutes() !== 0 || d2.getDate() !== new Date(createdAt0600).getDate()) {
    throw new Error(`❌ Une carrière créée à 6h (rythme 1 jour/semaine) devrait avoir son 1er match à 10h00 pile LE JOUR MÊME, obtenu ${d2.toString()}.`);
  }
  console.log(`✅ [rythme 1 jour/semaine] Carrière créée à 6h du matin → 1er match à 10h00 pile le jour même (le créneau n'était pas encore passé).`);

  // Le mode accéléré ACTUEL (intervalle glissant de 3h) n'est PAS concerné
  // par cet ancrage : calendarStartAt reste l'instant de création exact,
  // quelle que soit l'heure.
  const fastConfig = { weekMs: FAST_WEEK_MS, slotOffsetsMs: FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS };
  const fastLeague = Engine.generateLeague(team, 1, createdAt1452, fastConfig);
  if (fastLeague.calendarStartAt !== createdAt1452) {
    throw new Error("❌ Le mode accéléré actuel (intervalle glissant de 3h) ne devrait jamais être ancré sur minuit — il garde l'instant de création exact, comme le calendrier classique.");
  }
  console.log("✅ [mode accéléré actuel, 3h glissantes] calendarStartAt reste l'instant de création exact — jamais ancré sur minuit (pas d'heure de la journée à respecter).");

  // Le calendrier CLASSIQUE, lui, garde toujours l'instant de création
  // exact (aucun ancrage sur minuit) — comportement inchangé.
  const classicLeague = Engine.generateLeague(team, 1, createdAt1452, null);
  if (classicLeague.calendarStartAt !== createdAt1452) {
    throw new Error("❌ Le calendrier classique ne devrait jamais être ancré sur minuit — il garde l'instant de création exact.");
  }
  console.log("✅ Le calendrier classique reste inchangé (instant de création exact, jamais ancré sur minuit).");
}

// ---------------------------------------------------------------------
// Partie 1 : une NOUVELLE carrière créée pendant que le mode accéléré est
// actif adopte bien ce rythme — un match toutes les 3h depuis l'instant de
// création (round 0 à +3h, round 1 à +6h, fin de la "semaine" de 2 matchs).
// ---------------------------------------------------------------------
Calendar.setFastTestMode(true);
{
  const clock = { now: Date.now() };
  const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
  const dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
  const doc = dom.window.document;
  const win = dom.window;

  await flush(dom);
  const saved = readRawSave(savePath);
  if (saved.league.calendarWeekMs !== FAST_WEEK_MS) {
    throw new Error(`❌ Une nouvelle carrière créée en mode accéléré devrait avoir calendarWeekMs=${FAST_WEEK_MS} (6h, 2 matchs*3h), obtenu ${saved.league.calendarWeekMs}.`);
  }
  if (JSON.stringify(saved.league.calendarSlotOffsetsMs) !== JSON.stringify(FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS)) {
    throw new Error(`❌ Une nouvelle carrière créée en mode accéléré devrait avoir calendarSlotOffsetsMs=[3h,6h], obtenu ${JSON.stringify(saved.league.calendarSlotOffsetsMs)}.`);
  }
  console.log("✅ Nouvelle carrière créée en mode accéléré : calendarWeekMs/calendarSlotOffsetsMs bien fixés à 6h (2 matchs*3h) / [3h, 6h].");

  // calendarStartAt n'est PAS ancré (voir Partie 0) : le 1er match tombe
  // exactement 3h après l'instant de création, quelle que soit l'heure.
  const calendarStartAt = saved.league.calendarStartAt;
  const scheduledAtRound0 = win.scheduledTimeForCurrentMatch();
  const expectedRound0 = calendarStartAt + FAST_MATCH_INTERVAL_MS;
  if (scheduledAtRound0 !== expectedRound0) {
    throw new Error(`❌ Le compte à rebours navigateur (round 0) devrait annoncer ${expectedRound0} (3h après la création), obtenu ${scheduledAtRound0}.`);
  }
  console.log("✅ Le calendrier CÔTÉ NAVIGATEUR (scheduledTimeForCurrentMatch) reflète bien le rythme accéléré : 1er match 3h après la création de la carrière.");

  // Avance jusqu'au coup d'envoi du round 0 (+3h) : la diffusion démarre.
  clock.now = expectedRound0 + 1000;
  await flush(dom);
  await dom.window.close();
  let dom2 = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
  let doc2 = dom2.window.document;
  const liveVisible = !doc2.getElementById("liveSection").classList.contains("hidden");
  if (!liveVisible) throw new Error("❌ Le direct du round 0 (mode accéléré) aurait dû démarrer 3h après la création.");
  console.log("✅ Le direct du 1er match démarre bien 3h après la création (mode accéléré), comme n'importe quel match classique.");

  // Absence jusqu'à bien après la fin de la diffusion (+3h +1h30 = +4h30)
  // mais encore avant le round 1 (+6h) — on doit retomber sur l'écran de
  // préparation du round 1, programmé exactement 6h après la création
  // (jamais 3 jours plus tard comme en calendrier classique).
  clock.now = expectedRound0 + 2 * HOUR_MS; // +5h au total, bien après la fin de la diffusion (+4h30) mais avant +6h
  await dom2.window.close();
  dom2 = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
  doc2 = dom2.window.document;
  const win2 = dom2.window;
  await flush(dom2);
  // Le round 0 vient d'être finalisé pendant cette absence (fenêtre de
  // diffusion écoulée) : un récapitulatif s'affiche d'abord, comme pour
  // n'importe quelle absence classique — un clic sur "Continuer" mène à
  // l'écran de préparation du round 1.
  const catchupVisible = !doc2.getElementById("catchupSection").classList.contains("hidden");
  if (catchupVisible) {
    doc2.getElementById("catchupContinueBtn").click();
    await flush(dom2);
  }
  const prepVisible = !doc2.getElementById("prepSection").classList.contains("hidden");
  if (!prepVisible) throw new Error("❌ Entre les deux matchs de la fenêtre accélérée, l'écran de préparation du round 1 aurait dû être affiché.");
  const scheduledAtRound1 = win2.scheduledTimeForCurrentMatch();
  const expectedRound1 = calendarStartAt + 2 * FAST_MATCH_INTERVAL_MS;
  if (scheduledAtRound1 !== expectedRound1) {
    throw new Error(`❌ Le round 1 (mode accéléré) devrait être programmé exactement 6h après la création (espacement uniforme de 3h), obtenu un décalage de ${(scheduledAtRound1 - calendarStartAt) / HOUR_MS}h.`);
  }
  console.log("✅ Le 2e match est bien programmé exactement 6h après la création (espacement uniforme de 3h, jamais 3 jours plus tard comme en calendrier classique).");

  await flush(dom2);
  await dom2.window.close();
  server.close();
}

// ---------------------------------------------------------------------
// Partie 2 : le rythme d'une ligue déjà en cours ne bouge JAMAIS si le
// réglage global change ensuite — y compris à travers un changement de
// saison (startNewSeason hérite explicitement de l'ancien réglage de LA
// LIGUE, jamais du réglage global courant au moment du clic).
// ---------------------------------------------------------------------
Calendar.setFastTestMode(true);
{
  const clock = { now: Date.now() };
  const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
  let dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
  await flush(dom);

  // Le réglage GLOBAL change (comme si le serveur avait redémarré sans
  // BASKET_FAST_CALENDAR) : la carrière DÉJÀ créée ci-dessus, elle, ne doit
  // jamais en tenir compte rétroactivement.
  Calendar.setFastTestMode(false);

  const saved = readRawSave(savePath);
  if (saved.league.calendarWeekMs !== FAST_WEEK_MS) {
    throw new Error("❌ Désactiver le mode accéléré globalement ne devrait jamais changer le rythme d'une ligue déjà créée.");
  }

  // Rattrape toute la saison régulière (18 journées, un match toutes les 3h
  // → ~54h au total) d'un coup, en avançant l'horloge (le serveur ET le
  // navigateur de concert) très loin dans le futur plutôt que de rejouer
  // chaque journée une par une — seul le résultat final (fin de saison
  // atteinte) nous intéresse ici, pas le détail journée par journée (déjà
  // couvert par end_to_end_test.js).
  clock.now = saved.league.calendarStartAt + 30 * DAY_MS; // largement au-delà des ~54h (2-3 jours) d'une saison accélérée complète
  await dom.window.close();
  dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
  let doc = dom.window.document;
  let win = dom.window;
  await flush(dom);

  const afterCatchup = readRawSave(savePath);
  if (!afterCatchup.league.playoffs) {
    throw new Error("❌ La saison régulière (18 journées en mode accéléré) aurait dû être entièrement rattrapée et les play-offs calculés.");
  }
  console.log("✅ Une saison complète en mode accéléré (18 journées, ~54h) se rattrape correctement d'un coup, exactement comme en calendrier classique.");

  // Récapitulatif d'absence (toute la saison rattrapée d'un coup) avant
  // l'écran de fin de saison — même flux qu'une absence classique.
  const catchupVisible = !doc.getElementById("catchupSection").classList.contains("hidden");
  if (!catchupVisible) throw new Error("❌ Le récapitulatif d'absence devrait s'afficher après une saison entière rattrapée automatiquement.");
  doc.getElementById("catchupContinueBtn").click();
  await flush(dom);

  // Écran de fin de saison affiché : clique sur "Nouvelle saison" alors que
  // le réglage GLOBAL est désormais classique (setFastTestMode(false)
  // ci-dessus) — la nouvelle ligue doit malgré tout hériter du rythme
  // ACCÉLÉRÉ de la saison précédente, jamais retomber sur le classique.
  const seasonEndVisible = !doc.getElementById("seasonEndSection").classList.contains("hidden");
  if (!seasonEndVisible) throw new Error("❌ L'écran de fin de saison aurait dû être affiché après rattrapage complet de la saison régulière.");
  doc.getElementById("newSeasonBtn").click();
  await flush(dom);

  const newSeasonSave = readRawSave(savePath);
  if (newSeasonSave.league.round !== 0) throw new Error("❌ La nouvelle saison devrait redémarrer à la journée 0.");
  if (newSeasonSave.league.calendarWeekMs !== FAST_WEEK_MS) {
    throw new Error(`❌ La nouvelle saison devrait HÉRITER du rythme accéléré de la saison précédente (calendarWeekMs=${FAST_WEEK_MS}), obtenu ${newSeasonSave.league.calendarWeekMs} — jamais retomber sur le réglage global courant (classique ici).`);
  }
  if (JSON.stringify(newSeasonSave.league.calendarSlotOffsetsMs) !== JSON.stringify(FAST_CHAMPIONSHIP_SLOT_OFFSETS_MS)) {
    throw new Error("❌ La nouvelle saison devrait hériter des créneaux horaires accélérés (3h/6h) de la saison précédente.");
  }
  console.log("✅ Une nouvelle saison hérite bien du rythme accéléré de la précédente, même si le réglage global du serveur est entre-temps redevenu classique.");

  await dom.window.close();
  server.close();
}

Calendar.setFastTestMode(false); // ne doit jamais fuiter en dehors de ce fichier de test.

console.log("\n✅ Mode accéléré du calendrier (tests/démo solo) vérifié : nouvelle carrière créée avec le bon rythme (un match toutes les 3h, intervalle glissant depuis la création), compte à rebours navigateur cohérent, saison complète rattrapée correctement, et rythme toujours conservé par ligue (jamais relu dynamiquement depuis le réglage global, ni à la création ni au changement de saison).");

})().catch(e => { console.error(e); process.exit(1); });
