// Test ciblé (2026-09-24), lié au signalement Discord de "Diablue" : « les
// ordres que j'avais établis n'ont pas été pris en compte, alors que
// c'était bien enregistré » (match de CHAMPIONNAT de 19h — très probablement
// la journée IMMÉDIATE, celle en préparation le jour même). Voir
// DEV_NOTES.md pour le diagnostic complet : refreshFromServerAndReenter()
// (moteurbasket3.html) REMPLACE ENTIÈREMENT l'objet global `teamA` par un
// objet fraîchement rechargé depuis le serveur, et peut se déclencher À TOUT
// MOMENT (countdown, retour d'onglet, navigation Live/Ordres) — y compris
// en CONCURRENCE avec une validateOrdres() en train de confirmer une
// validation auprès du serveur. Si le rechargement écrase `teamA` avec un
// instantané pris AVANT que le serveur n'ait fini de traiter la validation
// (ou dont la réponse est simplement traitée après coup localement), la
// mutation locale qui reflétait cette validation est perdue — silencieusement,
// sans erreur visible pour le joueur.
//
// Correctif vérifié ici : `ordresValidationInFlight` (posée au tout début de
// CHAQUE appel à validateOrdres(), avant le moindre `await`, donc sans
// fenêtre de course à la pose ; résolue dans son `finally`, succès ou échec
// confondus) — refreshFromServerAndReenter() l'attend avant d'aller chercher
// le moindre état serveur, ce qui garantit que, quand elle recharge enfin,
// le serveur a DÉJÀ fini de traiter la validation en cours : aucun risque
// d'écraser `teamA` avec un instantané antérieur à cette validation.
//
// Plutôt que de dépendre d'une vraie course réseau (non déterministe), ce
// test déclenche le rechargement CONCURRENT explicitement (comme le ferait
// le tick() du countdown pendant l'attente réseau de validateOrdres()) et
// vérifie, en instrumentant fetch(), que la requête GET /api/save de
// refreshFromServerAndReenter() n'est JAMAIS émise tant que les requêtes de
// validation (POST /api/tactics/​/api/lineup pour la journée immédiate,
// POST /api/plan pour une journée future) ne sont pas toutes deux résolues —
// la garantie structurelle qui rend la perte de données impossible,
// indépendamment de la latence réseau réelle du jour où le test tourne.
const fs = require("fs");
const { startTestServer, openGame, flush, tmpMultiSavePath, patchDateNow } = require("./test_helpers.js");
const Engine = require("./engine.js");
const { generateMultiManagerLeague } = Engine;
const Calendar = require("./server/calendar.js");
const { dailyAnchoredCalendarConfig } = Calendar;
const store = require("./server/store.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

const T0 = Date.UTC(2026, 8, 22, 7, 0, 0);

// Ouvre une session de ligue partagée fraîche et instrumente window.fetch
// pour journaliser, DANS L'ORDRE, chaque requête sortante (méthode + chemin)
// — utilisé pour prouver que le GET /api/save du rechargement concurrent
// n'a lieu qu'APRÈS que les requêtes de validation aient reçu leur réponse.
async function openInstrumentedGame(baseUrl, manager) {
  const fetchLog = [];
  const dom = await openGame(html, `${baseUrl}?m=${manager.managerLinkToken}`, (win) => {
    win.__fetchLog = fetchLog;
    // Même précaution que ordres_validate_without_edit_test.js (voir son
    // commentaire) : sans patcher l'horloge CLIENT AVANT le chargement de
    // la page, un décalage entre elle (la vraie horloge de la machine) et
    // le calendrier calé sur T0 (dans le passé) déclenche un ou plusieurs
    // rechargements PARASITES dès le chargement initial (et à chaque
    // navigation qui relance startCountdown()), qui polluent complètement
    // le journal fetch instrumenté ci-dessous et rendraient ce test
    // impossible à interpréter. Ce test veut UN SEUL rechargement
    // concurrent, déclenché explicitement, pas une cascade accidentelle.
    patchDateNow(win, () => T0);
  });
  // Enveloppe fetchApi APRÈS coup (plutôt qu'avant analyse des scripts) :
  // on ne veut journaliser que les requêtes émises PENDANT le scénario
  // testé ci-dessous, pas celles du chargement initial de la page.
  dom.window.eval(`
    (function () {
      const realFetch = window.fetch;
      window.fetch = function (input, init) {
        const method = (init && init.method) || "GET";
        const url = typeof input === "string" ? input : (input && input.url) || String(input);
        const path = url.replace(/^https?:\\/\\/[^/]+/, "");
        window.__fetchLog.push({ method, path, phase: "start" });
        return realFetch(input, init).then(
          (res) => { window.__fetchLog.push({ method, path, phase: "end", ok: res.ok }); return res; },
          (err) => { window.__fetchLog.push({ method, path, phase: "error" }); throw err; }
        );
      };
    })();
  `);
  return { dom, fetchLog };
}

function firstIndexMatching(log, phase, method, pathSuffix) {
  return log.findIndex(e => e.phase === phase && e.method === method && e.path.endsWith(pathSuffix));
}

(async () => {

// ---------------------------------------------------------------------
// Scénario A : journée IMMÉDIATE (currentMatch.round) — le cas le plus
// probable du signalement de Diablue (match du soir même).
// ---------------------------------------------------------------------
{
  const league = generateMultiManagerLeague(["Test Manager FC"], 2, T0, dailyAnchoredCalendarConfig());
  const manager = league.teams.find(t => t.name === "Test Manager FC");
  const { server, multiSavePath, baseUrl } = await startTestServer(() => T0);
  await store.saveMultiLeague(league, multiSavePath);

  const { dom, fetchLog } = await openInstrumentedGame(baseUrl, manager);
  const win = dom.window;

  const round = win.eval("currentMatch.round");
  win.eval(`goToOrdresTab(${round}, "championship")`);

  // Déclenche la validation ET, EXACTEMENT comme le ferait le tick() du
  // countdown pendant l'attente réseau de validateOrdres(), un rechargement
  // concurrent — les deux sont lancés dans le même tour de boucle
  // d'événements, avant que le moindre `await` de validateOrdres() n'ait pu
  // se résoudre, pour reproduire la fenêtre de course la plus défavorable
  // possible.
  await win.eval(`
    (async () => {
      const p1 = validateOrdres();
      const p2 = refreshFromServerAndReenter();
      await Promise.all([p1, p2]);
    })()
  `);
  await flush(dom).catch(() => {});
  await new Promise(r => setTimeout(r, 50));

  const validatedRound = win.eval("teamA.ordresValidatedRound");
  console.log(`IMMÉDIATE - teamA.ordresValidatedRound après validation + rechargement concurrent : ${validatedRound} (attendu ${round})`);
  if (validatedRound !== round) {
    throw new Error(`❌ RÉGRESSION : la validation de la journée immédiate a été perdue par le rechargement concurrent (ordresValidatedRound=${validatedRound}, attendu ${round}).`);
  }

  // Garantie structurelle : le GET /api/save du rechargement ne doit
  // JAMAIS démarrer avant que les DEUX requêtes de validation (tactics +
  // lineup) n'aient reçu leur réponse — sinon la protection ne fait que
  // "parfois" fonctionner au gré de la latence réseau réelle.
  const tacticsEnd = firstIndexMatching(fetchLog, "end", "POST", "/api/tactics");
  const lineupEnd = firstIndexMatching(fetchLog, "end", "POST", "/api/lineup");
  const saveStart = firstIndexMatching(fetchLog, "start", "GET", "/api/save");
  console.log("IMMÉDIATE - ordre des requêtes :", JSON.stringify(fetchLog));
  if (tacticsEnd === -1 || lineupEnd === -1 || saveStart === -1) {
    throw new Error("❌ (setup) Requêtes attendues introuvables dans le journal fetch.");
  }
  if (saveStart < tacticsEnd || saveStart < lineupEnd) {
    throw new Error("❌ RÉGRESSION : le GET /api/save du rechargement concurrent a démarré AVANT la fin des requêtes de validation (tactics/lineup) — la garantie de séquencement n'est plus assurée.");
  }
  console.log("✅ IMMÉDIATE : validation + rechargement concurrent ne perdent pas la validation, et le rechargement est bien séquencé APRÈS la validation.");

  await dom.window.close();
  server.close();
}

// ---------------------------------------------------------------------
// Scénario B : journée FUTURE (préparée à l'avance) — même garantie,
// complète la couverture déjà existante d'ordres_validate_without_edit_test.js
// (qui ne testait pas la concurrence, seulement l'absence d'édition
// préalable) avec un VRAI rechargement concurrent explicite.
// ---------------------------------------------------------------------
{
  const league = generateMultiManagerLeague(["Test Manager FC"], 2, T0, dailyAnchoredCalendarConfig());
  const manager = league.teams.find(t => t.name === "Test Manager FC");
  const { server, multiSavePath, baseUrl } = await startTestServer(() => T0);
  await store.saveMultiLeague(league, multiSavePath);

  const { dom, fetchLog } = await openInstrumentedGame(baseUrl, manager);
  const win = dom.window;

  const immediateRound = win.eval("currentMatch.round");
  const futureRound = immediateRound < 17 ? immediateRound + 1 : immediateRound - 1;
  win.eval(`goToOrdresTab(${futureRound}, "championship")`);

  await win.eval(`
    (async () => {
      const p1 = validateOrdres();
      const p2 = refreshFromServerAndReenter();
      await Promise.all([p1, p2]);
    })()
  `);
  await flush(dom).catch(() => {});
  await new Promise(r => setTimeout(r, 50));

  const hasPlanAfter = win.eval(`teamA.hasPlanForRound(${futureRound})`);
  console.log(`FUTURE - hasPlanForRound(${futureRound}) après validation + rechargement concurrent : ${hasPlanAfter}`);
  if (!hasPlanAfter) {
    throw new Error("❌ RÉGRESSION : la validation de la journée future a été perdue par le rechargement concurrent.");
  }

  const planEnd = firstIndexMatching(fetchLog, "end", "POST", "/api/plan");
  const saveStart = firstIndexMatching(fetchLog, "start", "GET", "/api/save");
  console.log("FUTURE - ordre des requêtes :", JSON.stringify(fetchLog));
  if (planEnd === -1 || saveStart === -1) {
    throw new Error("❌ (setup) Requêtes attendues introuvables dans le journal fetch.");
  }
  if (saveStart < planEnd) {
    throw new Error("❌ RÉGRESSION : le GET /api/save du rechargement concurrent a démarré AVANT la fin de la requête de validation (/api/plan).");
  }
  console.log("✅ FUTURE : validation + rechargement concurrent ne perdent pas la validation, et le rechargement est bien séquencé APRÈS la validation.");

  await dom.window.close();
  server.close();
}

console.log("\n🏁 Tous les tests ordres_validate_concurrent_refresh_test.js sont passés.");
})().catch(e => { console.error(e); process.exit(1); });
