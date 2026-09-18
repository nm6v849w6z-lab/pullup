// =====================================================================
// AIDE COMMUNE AUX TESTS NAVIGATEUR (JSDOM) — depuis le passage au
// calendrier réel (retour utilisateur, 2026-09), moteurbasket3.html ne
// persiste plus via localStorage mais via l'API du serveur (server/,
// fetch()). Pour tester ça FIDÈLEMENT (plutôt que de réinventer une fausse
// persistance), chaque test démarre un VRAI petit serveur HTTP local
// (server/index.js) sur un port éphémère, adossé à un fichier de
// sauvegarde temporaire — exactement l'architecture réelle, juste en local
// et jetable.
//
// `fetch` n'existe pas nativement dans l'environnement `window` fourni par
// jsdom (contrairement à un vrai navigateur) : on le polyfille avec le
// `fetch` natif de Node (disponible depuis Node 18) via `beforeParse`, AVANT
// que les scripts de la page ne s'exécutent.
//
// Pour enchaîner plusieurs "sessions" (page rechargée), il suffit d'ouvrir
// une nouvelle JSDOM pointée vers le MÊME serveur : celui-ci relit son
// fichier de sauvegarde à chaque requête (voir store.loadOrCreate côté
// serveur), donc pas besoin d'un mécanisme spécial de "seed" entre sessions
// — c'est exactement ce qui se passerait avec un vrai navigateur qui
// recharge la page.
// =====================================================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { JSDOM } = require("jsdom");
const { createHandler } = require("./server/index.js");

function tmpSavePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-client-test-")), "league.json");
}

// Même chose que tmpSavePath ci-dessus, mais pour la ligue MULTI-MANAGER
// (voir server/store.js:defaultMultiLeaguePath), correctif 2026-09 (voir
// cup_ordres_planning_test.js, premier test de ce fichier à en avoir besoin) :
// SANS ce chemin temporaire dédié, `startTestServer` retombait sur
// store.defaultMultiLeaguePath() (server/data/multi-league.json, le VRAI
// fichier de la ligue de production) dès qu'un test touchait ne serait-ce
// qu'une route multi-manager, même précaution que server/index_test.js
// (tmpMultiSavePath), déjà adoptée là-bas pour la même raison.
function tmpMultiSavePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-client-test-multi-")), "multi-league.json");
}

// Démarre un vrai serveur HTTP (server/index.js) sur un port éphémère.
// `nowFn` est injectable (comme côté serveur, voir server/index_test.js)
// pour les scénarios qui ont besoin de contrôler "maintenant" côté serveur ;
// par défaut Date.now (le cas normal, le calendrier réel avance avec le
// vrai temps). `multiSavePath` (nouveau, voir tmpMultiSavePath ci-dessus) :
// toujours un fichier temporaire ISOLÉ par défaut, jamais le vrai fichier de
// la ligue partagée de production, même pour un test qui ne s'en sert jamais
// (mode solo, la grande majorité des tests existants).
function startTestServer(nowFn = Date.now, savePath = tmpSavePath(), multiSavePath = tmpMultiSavePath()) {
  return new Promise((resolve) => {
    const server = http.createServer(createHandler(savePath, nowFn, multiSavePath));
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, savePath, multiSavePath, baseUrl: `http://127.0.0.1:${port}/` });
    });
  });
}

// Construit une JSDOM de moteurbasket3.html pointée vers un serveur de test,
// attend la fin du chargement initial (window.__gameReady, voir
// moteurbasket3.html) avant de la renvoyer : sans ça, tout code lisant le
// DOM/l'état du jeu juste après `new JSDOM(...)` s'exécuterait AVANT que la
// carrière ne soit chargée depuis le serveur (fetch asynchrone).
async function openGame(html, baseUrl, extraBeforeParse) {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: "usable",
    url: baseUrl,
    beforeParse(window) {
      // Le `fetch` global de Node (contrairement à celui d'un vrai
      // navigateur) ne résout pas les URLs relatives par rapport au document
      // courant — il lui faut une URL absolue. On la résout nous-mêmes via
      // `window.location.href` (celle passée à `url:` ci-dessus) avant de
      // déléguer au vrai fetch de Node.
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? new URL(input, window.location.href).href : input;
        return fetch(url, init);
      };
      if (extraBeforeParse) extraBeforeParse(window);
    },
  });
  await dom.window.__gameReady;
  return dom;
}

// Attend que la dernière sauvegarde "fire-and-forget" déclenchée dans cette
// fenêtre (voir window.__lastSave dans saveMyTeam, moteurbasket3.html) ait
// bien atteint le serveur, avant de relire le fichier de sauvegarde ou
// d'ouvrir une nouvelle "session" — sans ça, une lecture immédiatement après
// un clic pourrait courir plus vite que le fetch() qu'il a déclenché.
async function flush(dom) {
  await dom.window.__lastSave;
}

// Lecture/écriture BRUTES du fichier de sauvegarde (même forme que
// store.serialize : {version, team, league}) — pour les scénarios qui ont
// besoin d'inspecter ou de manipuler directement la sauvegarde entre deux
// "sessions" (ex. avancer artificiellement l'échéance d'une enchère), plutôt
// que de repasser par de vrais objets Team/League. Remplace l'ancien
// `JSON.parse(win.localStorage.getItem("basketManagerSave_v1"))`.
function readRawSave(savePath) {
  return JSON.parse(fs.readFileSync(savePath, "utf-8"));
}
function writeRawSave(savePath, data) {
  fs.writeFileSync(savePath, JSON.stringify(data), "utf-8");
}

// ---------------------------------------------------------------------
// Calendrier réel — remplace l'ancien "clic Verrouiller & simuler en vitesse
// instantanée" (tâche #21, préparation à l'avance au lieu d'actions
// immédiates : il n'y a plus de bouton pour ça) : on décale artificiellement
// `calendarStartAt` vers le passé pour que les `roundsToResolve` premières
// journées (0..N-1) soient déjà entièrement écoulées (leur fenêtre de
// diffusion de MATCH_BROADCAST_DURATION_MS comprise) à l'instant réel
// `nowMs` — UNE SEULE requête au serveur suffit ensuite à tout rattraper
// d'un coup (voir catchUpLeague côté server/autoSim.js), matchs ET
// entraînement(s) hebdomadaire(s) compris, exactement comme un manager qui
// se reconnecterait après une longue absence.
function calendarStartAtForRoundsDone(nowMs, roundsToResolve) {
  const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
  const lastRound = Math.max(0, roundsToResolve - 1);
  const offset = scheduledTimeForRound(0, lastRound);
  const SAFETY_MARGIN_MS = 60 * 60 * 1000; // 1h de marge de sécurité
  return nowMs - offset - MATCH_BROADCAST_DURATION_MS - SAFETY_MARGIN_MS;
}

// Applique calendarStartAtForRoundsDone directement au fichier de
// sauvegarde (sans passer par le serveur) — à appeler puis à faire suivre
// d'une requête au serveur (ouvrir une nouvelle session via openGame, ou
// fetch("/api/state")) pour que le rattrapage ait réellement lieu.
function fastForwardCalendar(savePath, roundsToResolve, nowMs = Date.now()) {
  const saved = readRawSave(savePath);
  if (typeof saved.league.calendarStartAt !== "number") {
    throw new Error("fastForwardCalendar: calendarStartAt non configuré dans cette sauvegarde.");
  }
  saved.league.calendarStartAt = calendarStartAtForRoundsDone(nowMs, roundsToResolve);
  writeRawSave(savePath, saved);
  return saved;
}

// ---------------------------------------------------------------------
// Remplace window.Date par une version dont `Date.now()`/`new Date()` (sans
// argument) renvoient `getFakeNow()` au lieu de la vraie horloge — sans quoi
// certains scénarios (courses entre le retour sur l'onglet et l'heure de
// coup d'envoi/fin de diffusion, voir visibility_refresh_test.js) ne
// peuvent être testés de façon déterministe qu'en attendant réellement le
// temps réel. Le `nowFn` injectable côté SERVEUR (voir startTestServer)
// ne rejaillit PAS automatiquement sur l'horloge du navigateur dans JSDOM :
// les deux doivent être patchés de concert (même `getFakeNow`) pour rester
// cohérents, comme le ferait un vrai décalage du temps réel.
function patchDateNow(window, getFakeNow) {
  const RealDate = window.Date;
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) return new RealDate(getFakeNow());
      return new RealDate(...args);
    }
    static now() { return getFakeNow(); }
  }
  window.Date = FakeDate;
}

module.exports = {
  tmpSavePath, tmpMultiSavePath, startTestServer, openGame, flush, readRawSave, writeRawSave,
  calendarStartAtForRoundsDone, fastForwardCalendar, patchDateNow,
};
