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
const store = require("./server/store.js");

// ---------------------------------------------------------------------
// PLUS DE CARRIÈRE SOLO (retour utilisateur 2026-09-29 : "le jeu n'a pas a
// etre un jeu solo mais un jeu online contre d'autres managers") : le
// serveur refuse désormais toute requête joueur sans jeton de manager. Pour
// que les tests écrits pour l'ancienne carrière solo gardent leur scénario,
// chaque serveur de test démarre avec une LIGUE EN LIGNE d'un seul manager
// (« Lyon », index 0, même effectif et même calendrier que l'ancienne
// carrière neuve, voir store.createNewCareer) face à 9 clubs de l'IA :
//   - openGame ajoute son jeton (?m=) à l'URL quand le test n'en donne pas ;
//   - une requête sans jeton reçoit ce jeton par défaut (tant que cette
//     ligue n'a pas été remplacée par le test lui-même) ;
//   - readRawSave/writeRawSave/fastForwardCalendar(savePath) lisent et
//     écrivent cette ligue en présentant la forme historique
//     { version, team, league } (team === league.teams[0]).
// Un fichier solo déjà écrit à `savePath` avant le démarrage (sauvegarde
// préparée par le test) est converti en ligue en ligne.
// ---------------------------------------------------------------------
const testServers = new Map(); // savePath -> { multiSavePath, token, baseUrl }
const testServersByUrl = new Map(); // baseUrl -> même objet

function readMultiFile(multiSavePath) {
  try { return JSON.parse(fs.readFileSync(multiSavePath, "utf-8")); } catch (e) { return null; }
}
function defaultTokenStillValid(entry) {
  const data = readMultiFile(entry.multiSavePath);
  return !!(data && data.league && (data.league.teams || []).some(t => t && t.managerLinkToken === entry.token));
}
async function seedDefaultLeague(savePath, multiSavePath, now) {
  let league;
  if (fs.existsSync(savePath)) {
    // Sauvegarde solo préparée par le test : même contenu, en ligne.
    const restored = store.deserialize(JSON.parse(fs.readFileSync(savePath, "utf-8")));
    league = restored.league;
    const me = league.teams[0];
    me.isHuman = true;
    if (!me.managerLinkToken) me.managerLinkToken = require("crypto").randomBytes(24).toString("hex");
  } else {
    league = store.createNewCareer(now).league;
  }
  await store.saveMultiLeague(league, multiSavePath);
  return league.teams[0].managerLinkToken;
}

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
  return new Promise(async (resolve) => {
    const entry = { multiSavePath, token: await seedDefaultLeague(savePath, multiSavePath, nowFn()) };
    const handler = createHandler(savePath, nowFn, multiSavePath);
    const server = http.createServer((req, res) => {
      if (!req.headers["x-tipin-token"] && defaultTokenStillValid(entry)) req.headers["x-tipin-token"] = entry.token;
      handler(req, res);
    });
    // Tests lancés en parallèle (machine chargée) : le serveur fermait les
    // connexions « keep-alive » inactives au bout de 5 s (défaut de Node)
    // pendant que fetch (undici) les réutilisait → « read ECONNRESET »
    // aléatoires (onboarding_tour, post_match_interview_button,
    // player_season_stats_modal…). Délai porté au-delà de celui d'undici.
    server.keepAliveTimeout = 65 * 1000;
    server.headersTimeout = 70 * 1000;
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      entry.baseUrl = `http://127.0.0.1:${port}/`;
      testServers.set(savePath, entry);
      testServersByUrl.set(entry.baseUrl, entry);
      resolve({ server, savePath, multiSavePath, baseUrl: entry.baseUrl, token: entry.token });
    });
  });
}

// Construit une JSDOM de moteurbasket3.html pointée vers un serveur de test,
// attend la fin du chargement initial (window.__gameReady, voir
// moteurbasket3.html) avant de la renvoyer : sans ça, tout code lisant le
// DOM/l'état du jeu juste après `new JSDOM(...)` s'exécuterait AVANT que la
// carrière ne soit chargée depuis le serveur (fetch asynchrone).
async function openGame(html, baseUrl, extraBeforeParse) {
  // Jeton du manager par défaut (voir startTestServer) si l'URL n'en a pas.
  try {
    const u = new URL(baseUrl);
    const entry = testServersByUrl.get(`${u.origin}/`);
    if (entry && !u.searchParams.get("m") && defaultTokenStillValid(entry)) {
      u.searchParams.set("m", entry.token);
      baseUrl = u.href;
    }
  } catch (e) { /* URL inhabituelle : telle quelle */ }
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
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? new URL(input, window.location.href).href : input;
        // Sous charge (tests en parallèle), une connexion réutilisée peut
        // être coupée (ECONNRESET / "other side closed") avant que la
        // requête ne soit traitée : une seule nouvelle tentative, sur ces
        // erreurs de connexion uniquement.
        try {
          return await fetch(url, init);
        } catch (e) {
          const code = e && e.cause && (e.cause.code || e.cause.name);
          if (!/ECONNRESET|UND_ERR_SOCKET|SocketError|EPIPE/.test(String(code))) throw e;
          await new Promise(r => setTimeout(r, 50));
          return fetch(url, init);
        }
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

// Attend que le dernier clic "Suivant" du tutoriel d'accueil (voir
// window.__lastTourNext dans tourNext, moteurbasket3.html) ait fini de
// traiter la prime éventuelle de l'étape (round-trip serveur en ligue
// partagée, voir performTutorialRewardClaim) avant de relire team.budget/
// tutorialRewardsClaimed, même précaution que flush() ci-dessus pour
// saveMyTeam().
async function flushTourNext(dom) {
  await dom.window.__lastTourNext;
}

// Lecture/écriture BRUTES du fichier de sauvegarde (même forme que
// store.serialize : {version, team, league}) — pour les scénarios qui ont
// besoin d'inspecter ou de manipuler directement la sauvegarde entre deux
// "sessions" (ex. avancer artificiellement l'échéance d'une enchère), plutôt
// que de repasser par de vrais objets Team/League. Remplace l'ancien
// `JSON.parse(win.localStorage.getItem("basketManagerSave_v1"))`.
function readRawSave(savePath) {
  const entry = testServers.get(savePath);
  if (!entry) return JSON.parse(fs.readFileSync(savePath, "utf-8"));
  const data = readMultiFile(entry.multiSavePath);
  const idx = Math.max(0, data.league.teams.findIndex(t => t && t.managerLinkToken === entry.token));
  // Direct en cours vu par ce manager (comme l'ancienne sauvegarde solo, qui
  // gardait league.liveMatch sur disque).
  try { data.league.liveMatch = require("./server/liveMatch.js").viewLiveMatchForTeam(data.league, idx); } catch (e) { /* rien */ }
  return { version: data.version, team: data.league.teams[idx], league: data.league, myTeamIndex: idx };
}
function writeRawSave(savePath, data) {
  const entry = testServers.get(savePath);
  if (!entry) { fs.writeFileSync(savePath, JSON.stringify(data), "utf-8"); return; }
  const league = data.league;
  delete league.liveMatch; // vue calculée par readRawSave, jamais stockée
  const idx = typeof data.myTeamIndex === "number" ? data.myTeamIndex : 0;
  if (data.team && league.teams[idx] !== data.team) league.teams[idx] = { ...data.team, isHuman: true, managerLinkToken: data.team.managerLinkToken || entry.token };
  fs.writeFileSync(entry.multiSavePath, JSON.stringify({ version: data.version && data.version > 1000 ? data.version : 1001, league }), "utf-8");
}

// Modifie la sauvegarde CÔTÉ SERVEUR avec de vrais objets Team/League :
// `fn(team, league)` sur le club du manager par défaut, puis réécriture.
// Remplace l'ancien « teamA.xxx(); saveMyTeam() » dans le navigateur, qui
// n'envoie plus rien au serveur (plus de sauvegarde brute).
function editSave(savePath, fn) {
  const Engine = require("./engine.js");
  const raw = readRawSave(savePath);
  const league = Engine.leagueFromSave(raw.league);
  const idx = raw.myTeamIndex || 0;
  fn(league.teams[idx], league);
  const data = store.serializeMultiLeague(league);
  const entry = testServers.get(savePath);
  fs.writeFileSync(entry ? entry.multiSavePath : savePath, JSON.stringify(data), "utf-8");
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
  tmpSavePath, tmpMultiSavePath, startTestServer, openGame, flush, flushTourNext, readRawSave, writeRawSave, editSave,
  calendarStartAtForRoundsDone, fastForwardCalendar, patchDateNow,
};
