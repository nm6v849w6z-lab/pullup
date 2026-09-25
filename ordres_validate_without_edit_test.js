// Vérifie le retour utilisateur (2026-09) : "j'ai fait la compo pour les
// matchs 3 et 4 [...] ça ne met pas à jour le bouton donnez vos ordres en
// modifier vos ordres [...] si je refresh et retourne sur la page
// calendrier, c'est bon" : cliquer "✅ Valider les ordres" pour une journée
// FUTURE sans avoir modifié le moindre champ avant (le formulaire part déjà
// rempli par snapshotTactics(), voir Team.getPlanForRound) doit être traité
// comme une vraie validation (persistée ET reflétée localement tout de
// suite, sans attendre un rechargement complet de la page), exactement
// comme si le manager avait d'abord retouché un champ. Couvre le mode solo
// ET la ligue partagée (round-trip serveur réel), les deux chemins de code
// distincts dans validateOrdres().
const fs = require("fs");
const { startTestServer, openGame, flush, tmpMultiSavePath, patchDateNow } = require("./test_helpers.js");
const Engine = require("./engine.js");
const { generateMultiManagerLeague } = Engine;
const Calendar = require("./server/calendar.js");
const { dailyAnchoredCalendarConfig } = Calendar;
const store = require("./server/store.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function calendarBtnForRound(doc, round) {
  return [...doc.querySelectorAll(`.calendar-order-btn[data-round="${round}"][data-competition="championship"]`)][0] || null;
}

(async () => {

// ---------------------------------------------------------------------
// Partie 1 : SOLO.
// ---------------------------------------------------------------------
{
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const win = dom.window;
  const doc = win.document;

  const immediateRound = win.eval("currentMatch.round");
  const futureRound = immediateRound < 17 ? immediateRound + 1 : immediateRound - 1;

  if (win.eval(`teamA.hasPlanForRound(${futureRound})`)) {
    throw new Error("❌ (setup) La journée future testée ne devrait avoir aucun plan avant le test.");
  }

  // Ouvre l'onglet Ordres pour cette journée future, SANS toucher à aucun
  // champ, puis clique directement "Valider les ordres".
  win.eval(`goToOrdresTab(${futureRound}, "championship")`);
  await win.eval("validateOrdres()");
  await flush(dom);

  const hasPlanAfter = win.eval(`teamA.hasPlanForRound(${futureRound})`);
  console.log(`SOLO - hasPlanForRound(${futureRound}) juste après validation (sans édition préalable) : ${hasPlanAfter}`);
  if (!hasPlanAfter) {
    throw new Error("❌ BUG NON CORRIGÉ (solo) : valider sans avoir rien modifié devrait quand même enregistrer le plan localement.");
  }

  win.eval("TAB_HANDLERS.calendrier();");
  const btn = calendarBtnForRound(doc, futureRound);
  console.log("SOLO - bouton calendrier :", btn ? btn.textContent : "INTROUVABLE");
  if (!btn || btn.textContent !== "Modifier vos ordres") {
    throw new Error(`❌ BUG NON CORRIGÉ (solo) : le bouton du calendrier devrait afficher "Modifier vos ordres" sans recharger, obtenu "${btn && btn.textContent}".`);
  }
  console.log("✅ SOLO : valider sans édition préalable est bien traité comme une vraie validation, badge à jour immédiatement.");

  await dom.window.close();
  server.close();
}

// ---------------------------------------------------------------------
// Partie 2 : LIGUE PARTAGÉE (round-trip serveur réel).
// ---------------------------------------------------------------------
{
  const T0 = Date.UTC(2026, 8, 22, 7, 0, 0);
  const league = generateMultiManagerLeague(["Test Manager FC"], 2, T0, dailyAnchoredCalendarConfig());
  const manager = league.teams.find(t => t.name === "Test Manager FC");
  const { server, multiSavePath, baseUrl } = await startTestServer(() => T0);
  await store.saveMultiLeague(league, multiSavePath);

  // Bug de TEST corrigé (horloges désynchronisées, pas un bug du jeu) :
  // startTestServer(() => T0) fixe l'horloge SERVEUR dans le passé (T0 =
  // 2026-09-22), mais sans patcher l'horloge CLIENT jsdom, celle-ci reste
  // la vraie horloge de la machine qui fait tourner les tests — largement
  // postérieure à T0 (et cet écart ne fait que grandir avec le temps).
  // scheduledTimeForCurrentMatch() pour le round 0 (immédiat) renvoie donc
  // un horaire déjà dépassé du point de vue du client : startCountdown()
  // (déclenché dès le chargement initial de la page, DANS initGame(), donc
  // AVANT même que le code du test n'ait la main) exécute tick() une fois
  // de façon SYNCHRONE dès son démarrage, voit
  // `scheduledAt - Date.now() <= 0` et déclenche aussitôt
  // refreshFromServerAndReenter() en tâche de fond (fetch asynchrone,
  // jamais attendu par son appelant) — qui recharge teamA depuis le
  // serveur en concurrence avec la validation plus bas, exactement le
  // mécanisme identifié comme root cause plausible du signalement Discord
  // de Diablue (voir DEV_NOTES.md). Patcher l'horloge APRÈS openGame()
  // (une fois la page déjà chargée) arrive TROP TARD : ce premier tick()
  // synchrone s'est déjà exécuté avec la vraie horloge pendant le
  // chargement. Il faut donc patcher `window.Date` AVANT que le moindre
  // script de la page ne s'exécute, via `extraBeforeParse` (3e argument
  // d'openGame, voir test_helpers.js) — même précaution que
  // visibility_refresh_test.js, appliquée assez tôt cette fois pour
  // couvrir aussi le chargement initial, pas seulement les vérifications
  // faites après coup par le test.
  const dom = await openGame(html, `${baseUrl}?m=${manager.managerLinkToken}`, (win) => {
    patchDateNow(win, () => T0);
  });
  const win = dom.window;
  const doc = win.document;

  const immediateRound = win.eval("currentMatch.round");
  const futureRound = immediateRound < 17 ? immediateRound + 1 : immediateRound - 1;

  win.eval(`goToOrdresTab(${futureRound}, "championship")`);
  await win.eval("validateOrdres()");
  await new Promise(r => setTimeout(r, 50));

  const hasPlanAfter = win.eval(`teamA.hasPlanForRound(${futureRound})`);
  console.log(`\nLIGUE PARTAGÉE - hasPlanForRound(${futureRound}) juste après validation (sans édition préalable) : ${hasPlanAfter}`);
  if (!hasPlanAfter) {
    throw new Error("❌ BUG NON CORRIGÉ (ligue partagée) : valider sans avoir rien modifié devrait quand même enregistrer le plan localement, tout de suite, sans attendre un rechargement.");
  }

  const activeCalendrier = !doc.getElementById("calendrierSection").classList.contains("hidden");
  if (!activeCalendrier) throw new Error("❌ (setup) Devrait être revenu sur la page Calendrier après validation.");
  const btn = calendarBtnForRound(doc, futureRound);
  console.log("LIGUE PARTAGÉE - bouton calendrier :", btn ? btn.textContent : "INTROUVABLE");
  if (!btn || btn.textContent !== "Modifier vos ordres") {
    throw new Error(`❌ BUG NON CORRIGÉ (ligue partagée) : le bouton du calendrier devrait afficher "Modifier vos ordres" sans recharger, obtenu "${btn && btn.textContent}".`);
  }

  // Vérifie aussi que c'est réellement persisté côté serveur (pas juste
  // localement) : rouvre une session indépendante sur le même serveur.
  // Même patch d'horloge que ci-dessus (et pour la même raison) : sans
  // lui, cette seconde fenêtre déclenche elle aussi un
  // refreshFromServerAndReenter() de fond dès son chargement (horloge
  // réelle vs calendrier calé sur T0), qui continue de tourner en tâche
  // de fond après la fermeture de `server` plus bas et pollue la sortie du
  // test avec des erreurs réseau sans rapport (ECONNREFUSED) — inoffensif
  // pour l'assertion elle-même (lue avant que ce fetch n'ait une chance
  // d'aboutir) mais un bruit évitable, et le même mécanisme de fond que
  // celui documenté plus haut.
  const dom2 = await openGame(html, `${baseUrl}?m=${manager.managerLinkToken}`, (win) => {
    patchDateNow(win, () => T0);
  });
  const hasPlanReloaded = dom2.window.eval(`teamA.hasPlanForRound(${futureRound})`);
  console.log(`LIGUE PARTAGÉE - hasPlanForRound(${futureRound}) après réouverture d'une session indépendante : ${hasPlanReloaded}`);
  if (!hasPlanReloaded) {
    throw new Error("❌ RÉGRESSION : le plan devrait aussi être persisté côté serveur, pas seulement en local.");
  }
  console.log("✅ LIGUE PARTAGÉE : valider sans édition préalable est bien traité comme une vraie validation, badge à jour immédiatement ET persisté côté serveur.");

  await dom2.window.close();
  await dom.window.close();
  server.close();
}

console.log("\n🏁 Tous les tests ordres_validate_without_edit_test.js sont passés.");
})().catch(e => { console.error(e); process.exit(1); });
