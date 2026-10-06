// =====================================================================
// PERSISTANCE SERVEUR — même format de sauvegarde que le navigateur
// (localStorage, voir saveMyTeam/loadMyTeam dans moteurbasket3.html), mais
// écrit sur disque (un fichier JSON) plutôt que dans le stockage local d'un
// navigateur : pour l'instant un seul fichier = une seule ligue = un seul
// manager humain (teams[0]) + 9 adversaires CPU, exactement comme le
// prototype navigateur actuel (retour utilisateur : "d'abord le calendrier
// réel + simulation auto, même en solo" avant le multijoueur à 10).
//
// Réutilise explicitement serializeTeam/teamFromSave/serializeLeague/
// leagueFromSave du moteur (engine.js) — PAS de copie de cette logique ici,
// voir le commentaire à côté de ces fonctions dans engine.js pour pourquoi
// ça compte.
// =====================================================================
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const Engine = require("../engine.js");
const Calendar = require("./calendar.js");

const {
  generateStartingRoster, generateLeague, generateMultiManagerLeague,
  serializeTeam, teamFromSave, serializeLeague, leagueFromSave,
} = Engine;

const SAVE_VERSION = 1;

function defaultSavePath() {
  return path.join(__dirname, "data", "league.json");
}

// =====================================================================
// BACKEND REDIS (Upstash) — OPTIONNEL, pour l'hébergement en ligne (Render,
// voir server/README.md, section "déploiement sur Render").
//
// Pourquoi : sur le plan gratuit de Render, le système de fichiers est
// ÉPHÉMÈRE — tout fichier écrit sur disque (donc toute sauvegarde locale,
// solo comme multi-manager) est PERDU à chaque redéploiement, redémarrage,
// ou simple réveil après les 15 minutes d'inactivité qui endorment le
// service. Upstash Redis (API REST HTTPS, plan gratuit, toujours persistant)
// sert donc de remplacement au fichier local UNIQUEMENT quand le serveur
// tourne dans cet environnement.
//
// Activation : PUREMENT par variables d'environnement
// (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN), jamais par un
// paramètre explicite — voir upstashConfigured() ci-dessous, relue à CHAQUE
// appel (pas mise en cache une fois pour toutes) pour rester simple à tester
// (voir server/upstash_store_test.js, qui bascule ces variables en cours de
// test). Si les deux ne sont PAS définies (le cas par défaut : tout test
// existant, et quiconque lance le serveur en local exactement comme avant),
// TOUT le reste de ce fichier se comporte de façon rigoureusement IDENTIQUE
// à avant ce chantier — fichier JSON local, écriture atomique par
// renommage, mêmes messages d'avertissement. `savePath`/`defaultSavePath()`
// restent acceptés par load/save/loadOrCreate même quand Redis est actif
// (compatibilité avec les appelants/tests existants qui en passent un) :
// ils sont alors simplement IGNORÉS, puisqu'un chemin de fichier local n'a
// plus aucun sens pour ce backend — deux clés FIXES (REDIS_KEYS ci-dessous)
// sont utilisées à la place, jamais dérivées de `savePath`.
//
// Aucune dépendance npm : l'API REST d'Upstash est volontairement triviale
// (GET .../get/<clé> -> {"result": "<chaîne stockée ou null>"}, POST
// .../set/<clé> avec la valeur brute en corps de requête), donc le `fetch`
// global de Node (disponible nativement depuis Node 18, voir package.json/
// aucune contrainte de version plus ancienne dans ce projet) suffit —
// jamais besoin du module `https` ni d'un client Redis dédié.
// =====================================================================

// Indirection injectable (tests UNIQUEMENT, voir server/upstash_store_test.js)
// : par défaut le vrai `fetch` global de Node. Jamais appelée du tout tant
// qu'upstashConfigured() est faux, donc aucun risque de requête réseau
// réelle dans le reste de la suite de tests (qui ne définit jamais ces
// variables d'environnement).
let fetchImpl = (...args) => fetch(...args);
function _setFetchImplForTests(fn) {
  fetchImpl = fn || ((...args) => fetch(...args));
  clearRedisCache();
}

// Clés Redis FIXES (jamais dérivées de savePath, voir commentaire
// ci-dessus) — un seul espace de clés partagé par tout déploiement pointé
// vers la même base Upstash, exactement comme un seul fichier
// league.json/multi-league.json local pour un seul serveur.
// `accounts` (2026-09-26, inscription publique sur hoop-manager.com) : les
// comptes joueurs (email/mot de passe, Discord), voir server/accounts.js.
const REDIS_KEYS = { league: "pullup:league", multiLeague: "pullup:multi-league", accounts: "pullup:accounts" };

// Préfixe de clés (2026-09-26) : le plan gratuit d'Upstash n'autorise
// qu'UNE base. Le serveur de TEST partage donc la base de la prod, mais
// sous des clés préfixées (BASKET_REDIS_PREFIX=test -> "test:pullup:..."),
// jamais celles de la prod. La prod, elle, ne définit PAS cette variable
// (clés historiques inchangées, rien à migrer).
function redisKey(name) {
  return redisPrefix() + REDIS_KEYS[name];
}
function redisPrefix() {
  const raw = (process.env.BASKET_REDIS_PREFIX || "").trim();
  return raw ? `${raw.replace(/:+$/, "")}:` : "";
}

// ---------------------------------------------------------------------
// CHAMPIONNATS PAR PAYS (2026-09-28, voir server/world.js) : chaque
// championnat est une ligue à part, sauvegardée sous sa propre clé/son
// propre fichier. "fr-1" (Division I française) EST la ligue partagée
// historique : même clé Redis/même fichier qu'avant, rien à migrer. Les
// autres vivent à côté : clé "pullup:league:<id>", fichier
// "<multi-league>.<id>.json" (dans le même dossier que la ligue historique,
// ce qui isole naturellement les tests qui passent leur propre chemin).
// ---------------------------------------------------------------------
const HISTORIC_LEAGUE_ID = "fr-1";
function leagueStorage(leagueId, savePath) {
  if (!leagueId || leagueId === HISTORIC_LEAGUE_ID) return { redis: redisKey("multiLeague"), file: savePath };
  if (!/^[a-z]{2}-[0-9](\.[0-9]{1,3})?$/.test(leagueId)) throw new Error(`Identifiant de championnat invalide : ${leagueId}`);
  return { redis: `${redisPrefix()}pullup:league:${leagueId}`, file: savePath.replace(/\.json$/, "") + `.${leagueId}.json` };
}
function worldStorage(savePath) {
  return { redis: `${redisPrefix()}pullup:world`, file: savePath.replace(/\.json$/, "") + ".world.json" };
}

// Registre du monde (voir server/world.js) : JSON brut, sans version de
// moteur — `null` si absent ou illisible.
async function loadWorldRaw(savePath = defaultMultiLeaguePath()) {
  const where = worldStorage(savePath);
  try {
    if (upstashConfigured()) {
      const raw = await redisGet(where.redis);
      return raw == null ? null : JSON.parse(raw);
    }
    if (!fs.existsSync(where.file)) return null;
    return JSON.parse(fs.readFileSync(where.file, "utf-8"));
  } catch (e) {
    // Lecture ÉCHOUÉE (Redis injoignable, JSON abîmé…) ≠ registre absent :
    // jamais null ici, sinon World.loadWorld reconstruirait un registre neuf
    // et recréerait les 1res divisions des autres pays par-dessus les
    // existantes (identifiants fixes, voir worldLeagueId) — perte de données.
    console.warn("Registre du monde illisible :", e.message);
    return WORLD_READ_FAILED;
  }
}
// Valeur renvoyée par loadWorldRaw quand la lecture a échoué (à distinguer
// d'un registre qui n'existe pas encore).
const WORLD_READ_FAILED = Object.freeze({ readFailed: true });
async function saveWorldRaw(world, savePath = defaultMultiLeaguePath()) {
  const where = worldStorage(savePath);
  const body = JSON.stringify(world);
  if (upstashConfigured()) {
    try { await redisSet(where.redis, body); } catch (e) { console.warn("Écriture Redis du registre du monde échouée :", e.message); }
    return;
  }
  fs.mkdirSync(path.dirname(where.file), { recursive: true });
  const tmpPath = `${where.file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, body, "utf-8");
  fs.renameSync(tmpPath, where.file);
}

// Deux bases possibles (bascule du 2026-10-02 vers Render Key Value) :
// REDIS_URL (Render, protocole Redis direct, voir server/redisClient.js) a
// la priorité ; sinon Upstash (API REST). Le nom upstashConfigured est gardé
// pour les appelants existants : il signifie « une base Redis est active ».
function nativeRedisConfigured() {
  return !!process.env.REDIS_URL;
}
function upstashConfigured() {
  return nativeRedisConfigured() || !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
function storageBackendName() {
  return nativeRedisConfigured() ? "redis" : upstashConfigured() ? "upstash" : "fichiers";
}
let nativeClient = null;
let nativeClientUrl = null;
function nativeRedis() {
  if (!nativeClient || nativeClientUrl !== process.env.REDIS_URL) {
    if (nativeClient) nativeClient.quit();
    nativeClient = require("./redisClient.js").createClient(process.env.REDIS_URL);
    nativeClientUrl = process.env.REDIS_URL;
  }
  return nativeClient;
}

// Renvoie la chaîne stockée pour `key`, ou `null` si absente — ne plante
// JAMAIS elle-même : une erreur réseau/HTTP est transformée en exception
// classique, à charge de l'appelant (load/loadMultiLeague ci-dessous) de la
// traiter EXACTEMENT comme un fichier local illisible (voir leur bloc
// try/catch : avertissement + `null`, jamais un plantage du process, jamais
// une carrière neuve créée par erreur sur un simple souci réseau passager
// puisque le code appelant NE crée une carrière neuve que sur un `null`,
// pas sur une exception qui remonterait — mais ici l'exception EST attrapée
// et convertie en `null` par l'appelant, donc voir bien le commentaire sur
// load() plus bas pour la distinction "pas encore de sauvegarde" vs "échec
// de lecture transitoire", toutes deux actuellement traitées pareil côté
// appelant, comme c'était déjà le cas pour un fichier local corrompu).
// Volume transféré (incident 2026-10-02 : base Upstash suspendue, 15 Go
// transférés pour 10 Go autorisés par mois, chaque requête relisant et
// réécrivant un championnat entier de 0,4 à 1 Mo) :
//   1. Compression : valeurs écrites en « gz1: » + gzip en base64 (environ
//      7 fois plus petites) ; une ancienne valeur en JSON clair reste lue
//      telle quelle.
//   2. Mémoire : le serveur (une seule instance) garde la dernière valeur
//      lue ou écrite de chaque clé pendant REDIS_CACHE_TTL_MS, dans la limite
//      de REDIS_CACHE_MAX_BYTES (les plus anciennes sortent d'abord). Une
//      écriture faite par un AUTRE programme sur la même base n'est vue
//      qu'après expiration (10 min).
const REDIS_COMPRESS_PREFIX = "gz1:";
const REDIS_CACHE_TTL_MS = 10 * 60 * 1000;
const REDIS_CACHE_MAX_BYTES = 120 * 1024 * 1024;
const REDIS_CACHE_MAX_ENTRY = 8 * 1024 * 1024;
const redisCache = new Map(); // key -> { value, at, size }
let redisCacheBytes = 0;
function clearRedisCache() { redisCache.clear(); redisCacheBytes = 0; }
function redisCacheGet(key) {
  const e = redisCache.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > REDIS_CACHE_TTL_MS) { redisCache.delete(key); redisCacheBytes -= e.size; return undefined; }
  // Plus récemment utilisée : en fin de Map.
  redisCache.delete(key); redisCache.set(key, e);
  return e.value;
}
function redisCacheSet(key, value) {
  const old = redisCache.get(key);
  if (old) { redisCache.delete(key); redisCacheBytes -= old.size; }
  const size = value == null ? 16 : value.length * 2;
  if (size > REDIS_CACHE_MAX_ENTRY) return;
  redisCache.set(key, { value, at: Date.now(), size });
  redisCacheBytes += size;
  for (const [k, e] of redisCache) {
    if (redisCacheBytes <= REDIS_CACHE_MAX_BYTES) break;
    redisCache.delete(k); redisCacheBytes -= e.size;
  }
}
function redisEncode(value) {
  return REDIS_COMPRESS_PREFIX + zlib.gzipSync(Buffer.from(String(value), "utf-8"), { level: 6 }).toString("base64");
}
function redisDecode(stored) {
  if (typeof stored !== "string" || !stored.startsWith(REDIS_COMPRESS_PREFIX)) return stored;
  return zlib.gunzipSync(Buffer.from(stored.slice(REDIS_COMPRESS_PREFIX.length), "base64")).toString("utf-8");
}

async function redisGet(key, opts = {}) {
  const cached = opts.fresh ? undefined : redisCacheGet(key);
  if (cached !== undefined) return cached;
  if (nativeRedisConfigured()) {
    const stored = await nativeRedis().command("GET", key);
    const value = typeof stored === "string" ? redisDecode(stored) : null;
    redisCacheSet(key, value);
    return value;
  }
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Upstash GET ${key} a échoué (HTTP ${res.status}).`);
  const data = await res.json();
  // Réponse d'erreur d'Upstash (quota, jeton…) : échec, jamais « clé absente ».
  if (data && data.error) throw new Error(`Upstash GET ${key} : ${data.error}`);
  const value = data && typeof data.result === "string" ? redisDecode(data.result) : null;
  redisCacheSet(key, value);
  return value;
}

// Écrit `value` (déjà sérialisée en JSON par l'appelant) pour `key`. Comme
// redisGet, ne fait qu'échouer par exception — c'est save()/saveMultiLeague()
// ci-dessous qui décide de l'avertir sans planter (voir leur commentaire).
// La mémoire est mise à jour même si l'envoi échoue : le serveur continue
// sur la dernière version connue.
async function redisSet(key, value) {
  // Rien n'a changé depuis la dernière lecture/écriture : pas d'envoi.
  const e = redisCache.get(key);
  if (e && e.value === value && Date.now() - e.at <= REDIS_CACHE_TTL_MS) return;
  redisCacheSet(key, value);
  if (nativeRedisConfigured()) {
    await nativeRedis().command("SET", key, redisEncode(value));
    return;
  }
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    body: redisEncode(value),
  });
  if (!res.ok) throw new Error(`Upstash SET ${key} a échoué (HTTP ${res.status}).`);
  const data = typeof res.json === "function" ? await Promise.resolve().then(() => res.json()).catch(() => null) : null;
  if (data && data.error) throw new Error(`Upstash SET ${key} : ${data.error}`);
}

// ---------------------------------------------------------------------
// MULTI-MANAGER (retour utilisateur, 2026-09 : "jusqu'à 10 vrais managers
// humains dans une ligue partagée, le reste comblé par des adversaires CPU").
// Fichier de sauvegarde DISTINCT de la carrière solo historique ci-dessus
// (`defaultSavePath`/`league.json`) — jamais le même, jamais lu ni écrit par
// les fonctions solo, et réciproquement : c'est ce qui garantit que ce
// travail ne touche JAMAIS à la vraie carrière solo d'Antony, actuellement
// en cours dans `server/data/league.json`. Version numérotée dans un espace
// séparé de SAVE_VERSION ci-dessus (voir MULTI_SAVE_VERSION) plutôt qu'une
// simple incrémentation de celle-ci : un ancien fichier solo ({version:1,
// team, league}) pointé PAR ERREUR vers ce loader est ainsi rejeté sans
// ambiguïté (mauvaise version ET absence de `league` au bon format), traité
// comme "pas encore de ligue multi-manager" plutôt que planté ou, pire,
// silencieusement mal interprété comme une ligue partagée valide.
// ---------------------------------------------------------------------
const MULTI_SAVE_VERSION = 1001;

function defaultMultiLeaguePath() {
  return path.join(__dirname, "data", "multi-league.json");
}

// Nouvelle ligue à plusieurs managers humains (1 à 10 noms de club, un par
// manager réel qui s'est inscrit) — voir Engine.generateMultiManagerLeague.
// `now` explicite (comme createNewCareer ci-dessous), pour rester testable.
// Rythme de calendrier : TOUJOURS l'ancré quotidien (retour utilisateur,
// 2026-09 — "la vraie saison de test" : "3 matchs par jour à heures fixes
// réelles" + une vraie compétition de Coupe, voir Calendar.dailyAnchoredCalendarConfig
// et le grand commentaire dans server/calendar.js) — PAS
// Calendar.getDefaultCalendarConfig()/BASKET_FAST_CALENDAR (contrairement à
// createNewCareer ci-dessous, réservé à la carrière solo) : la ligue
// multi-manager EST la saison de test décrite par Antony, elle n'a donc pas
// besoin d'une bascule par variable d'environnement — ce rythme s'applique
// sans condition dès sa création (voir generateMultiManagerLeague, qui crée
// aussi league.cup dans la foulée dès que calendarDailyAnchored est vrai).
// `adminTeamName` (nouveau, Phase B — retour utilisateur : "Antony veut
// pouvoir réinitialiser la ligue lui-même depuis l'app, sans le secret
// BASKET_ADMIN_TOKEN brut") : nom de club, parmi `managerTeamNames`, qui doit
// porter `Team.isAdmin = true` sur la ligue fraîchement créée — UN SEUL par
// ligue. Si omis (ou s'il ne correspond à aucun nom de `managerTeamNames`,
// ce qui ne devrait jamais arriver côté serveur puisque server/index.js
// valide déjà cette correspondance avant d'appeler cette fonction, mais on
// reste défensif ici aussi), retombe sur `managerTeamNames[0]` — Antony se
// liste toujours en premier, il obtient donc ce droit sans avoir à y penser.
function createMultiManagerCareer(managerTeamNames, now = Date.now(), adminTeamName = null) {
  const league = generateMultiManagerLeague(managerTeamNames, 1, now, Calendar.dailyAnchoredCalendarConfig());
  const targetName = (typeof adminTeamName === "string" && managerTeamNames.includes(adminTeamName))
    ? adminTeamName
    : managerTeamNames[0];
  const adminTeam = league.teams.find(t => t.isHuman && t.name === targetName);
  if (adminTeam) adminTeam.isAdmin = true;
  stampHistoricLeague(league);
  return { league };
}

function serializeMultiLeague(league) {
  return { version: MULTI_SAVE_VERSION, league: serializeLeague(league) };
}

// Reconstruit TOUTES les équipes (humaines comme CPU) depuis la sauvegarde,
// chacune portant déjà sa propre identité manager (isHuman/managerLinkToken,
// voir Engine.teamFromSave) — contrairement au chemin solo historique
// (deserialize ci-dessous), il n'y a plus UNE SEULE équipe "locale"
// privilégiée à reconstruire à part : voir Engine.leagueFromSave (userTeam
// omis).
// La ligue partagée historique devient la Division I française (voir
// HISTORIC_LEAGUE_ID) : identité posée au chargement si elle manque.
function stampHistoricLeague(league) {
  if (!league.leagueId) league.leagueId = HISTORIC_LEAGUE_ID;
  if (league.leagueId === HISTORIC_LEAGUE_ID) {
    league.country = league.country || "fr";
    league.timeZone = league.timeZone || "Europe/Paris";
  }
  return league;
}

function deserializeMultiLeague(data) {
  // Même précaution que deserialize() ci-dessus, pour la ligue partagée
  // (c'est d'ailleurs très exactement ce chemin-ci qui a révélé le bug :
  // marché de staff/transferts en ligue partagée, voir le commentaire sur
  // Engine.reseedUidFromSave).
  Engine.reseedUidFromSave(data);
  const league = leagueFromSave(data.league);
  if (!league.leagueId) stampHistoricLeague(league);
  // Ids de joueurs en double dans la ligue (bug du 2026-10-06 : joueur
  // affiché « aux enchères » sans raison) : réparés à la lecture.
  const fixed = Engine.repairDuplicatePlayerIds(league);
  if (fixed.length) console.warn(`[ids] ${league.leagueId || "ligue"} : ${fixed.length} id(s) de joueur en double réattribué(s) (${fixed.slice(0, 5).map(c => `${c.name} ${c.from}→${c.to}`).join(", ")}).`);
  return { league };
}

// `async` (voir grand commentaire "BACKEND REDIS" plus haut) : même
// interface pour les deux backends (fichier local ou Upstash), à charge de
// chaque appelant d'`await`er — voir server/index.js/resolvePlayerContext.
// `savePath` reste accepté (compatibilité) mais IGNORÉ quand Redis est actif
// (voir upstashConfigured()) : la clé fixe REDIS_KEYS.multiLeague est
// utilisée à la place, jamais dérivée de ce chemin.
// `leagueId` (2026-09-28) : championnat à charger (voir leagueStorage) —
// omis = la ligue partagée historique ("fr-1"), comme avant.
async function loadMultiLeague(savePath = defaultMultiLeaguePath(), leagueId = HISTORIC_LEAGUE_ID) {
  // Registre des IDs de joueurs chargé AVANT toute ligue (voir
  // loadPlayerIdRegistry) : aucun nouvel ID ne peut reprendre un ID déjà donné.
  await loadPlayerIdRegistry(savePath);
  const where = leagueStorage(leagueId, savePath);
  savePath = where.file;
  if (upstashConfigured()) {
    try {
      const raw = await redisGet(where.redis);
      if (raw == null) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== MULTI_SAVE_VERSION || !data.league || data.team) return null;
      return deserializeMultiLeague(data);
    } catch (e) {
      // Échec de lecture Redis (réseau, Upstash indisponible, réponse
      // invalide) : jamais de plantage du process, traité comme "pas encore
      // de ligue multi-manager" — voir le commentaire sur redisGet ci-dessus
      // pour pourquoi ce n'est PAS traité comme "il faut en créer une
      // nouvelle" côté appelant (resolvePlayerContext renvoie alors un 404,
      // jamais une nouvelle ligue écrasant silencieusement l'ancienne).
      console.warn("Lecture Redis (Upstash) de la ligue multi-manager échouée :", e.message);
      return null;
    }
  }
  try {
    if (!fs.existsSync(savePath)) return null;
    const raw = fs.readFileSync(savePath, "utf-8");
    const data = JSON.parse(raw);
    // Rejette silencieusement (renvoie null, ne plante jamais) tout ce qui
    // n'est pas EXACTEMENT une sauvegarde multi-manager au bon format — en
    // particulier une ancienne sauvegarde solo ({version:1, team, league}),
    // qui n'a jamais sa place ici (voir commentaire sur MULTI_SAVE_VERSION
    // ci-dessus) : "pas encore de ligue multi-manager", jamais une migration
    // silencieuse ni un plantage.
    if (!data || data.version !== MULTI_SAVE_VERSION || !data.league || data.team) return null;
    return deserializeMultiLeague(data);
  } catch (e) {
    console.warn("Sauvegarde multi-manager illisible :", e.message);
    return null;
  }
}

// Écriture atomique côté fichier local (fichier temporaire puis renommage,
// pour ne jamais laisser un fichier à moitié écrit si le process s'arrête en
// plein milieu) — inchangée. Côté Redis, une erreur d'écriture (réseau,
// Upstash indisponible) est seulement journalée (`console.warn`) plutôt que
// de remonter et faire planter tout le serveur : un échec d'écriture
// PASSAGER ne doit jamais interrompre la partie de TOUS les managers pour
// une seule requête — voir aussi save() ci-dessous, même logique.
// Sauvegarde sous l'identité du championnat (league.leagueId, voir
// leagueStorage) : `savePath` reste le chemin de la ligue historique, dont
// les autres championnats dérivent le leur.
// `body` (facultatif) : sérialisation JSON déjà calculée (voir
// server/world.js:catchUpWorld, qui compare avant/après pour n'écrire que
// les championnats modifiés).
async function saveMultiLeague(league, savePath = defaultMultiLeaguePath(), body = null) {
  // Nouveaux IDs de joueurs inscrits au registre (jamais réattribués).
  await flushPlayerIdRegistry(savePath);
  // Mémoire historique (assets/history.js) : événements en file, rangés à
  // part, un journal par club (jamais dans la ligue).
  await flushHistoryQueue(savePath);
  // Directs terminés à garder pour « Revoir le direct » (voir
  // LiveMatch.archiveReplay) : rangés à part, jamais dans la ligue.
  if (league && Array.isArray(league.pendingReplays) && league.pendingReplays.length) {
    const items = league.pendingReplays.splice(0);
    // Ligues privées : place à part (retour utilisateur 2026-10-01, « réserve
    // une place séparée pour les matchs de LP »), pour ne jamais évincer les
    // directs officiels.
    const lp = items.filter(it => isLpReplayKey(it.key)), official = items.filter(it => !isLpReplayKey(it.key));
    try {
      if (official.length) await appendReplays(league.leagueId, official, savePath);
      if (lp.length) await appendReplays(league.leagueId, lp, savePath, "lp");
    } catch (e) { console.warn("Enregistrement des directs à revoir échoué :", e.message); }
  }
  const where = leagueStorage(league && league.leagueId, savePath);
  savePath = where.file;
  if (upstashConfigured()) {
    try {
      await redisSet(where.redis, body || JSON.stringify(serializeMultiLeague(league)));
    } catch (e) {
      console.warn("Écriture Redis (Upstash) de la ligue multi-manager échouée :", e.message);
    }
    return;
  }
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  const tmpPath = `${savePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, body || JSON.stringify(serializeMultiLeague(league)), "utf-8");
  fs.renameSync(tmpPath, savePath);
}

// Directs à revoir (Premium) d'un championnat : { version, list: [{ key,
// season, savedAt, entry }] }, les REPLAYS_MAX plus récents.
// Tous les matchs diffusés se revoient (retour utilisateur 2026-10-01 :
// « il faudrait pouvoir revoir les matchs de tout le monde ») : 120 directs
// officiels par championnat (championnat, Coupe, play-offs, Supercoupe,
// barrage) ; les ligues privées ont leur propre stock (`kind` "lp", 80).
const REPLAYS_MAX = 120;
const LP_REPLAYS_MAX = 80;
function isLpReplayKey(key) { return /(^|:)lp:/.test(String(key || "")); }
function replayStorage(leagueId, savePath, kind = "") {
  const id = leagueId || HISTORIC_LEAGUE_ID;
  if (!/^[a-z]{2}-[0-9](\.[0-9]{1,3})?$/.test(id)) throw new Error(`Identifiant de championnat invalide : ${id}`);
  const k = kind === "lp" ? "lpreplays" : "replays";
  return { redis: `${redisPrefix()}pullup:${k}:${id}`, file: savePath.replace(/\.json$/, "") + `.${k}.${id}.json` };
}
async function loadReplays(leagueId, savePath = defaultMultiLeaguePath(), kind = "") {
  const where = replayStorage(leagueId, savePath, kind);
  try {
    if (upstashConfigured()) {
      const raw = await redisGet(where.redis);
      return raw == null ? { version: 1, list: [] } : JSON.parse(raw);
    }
    if (!fs.existsSync(where.file)) return { version: 1, list: [] };
    return JSON.parse(fs.readFileSync(where.file, "utf-8"));
  } catch (e) {
    return { version: 1, list: [] };
  }
}
async function appendReplays(leagueId, items, savePath = defaultMultiLeaguePath(), kind = "") {
  const data = await loadReplays(leagueId, savePath, kind);
  items.forEach(it => { data.list = data.list.filter(x => x.key !== it.key); data.list.push(it); });
  data.list = data.list.slice(-(kind === "lp" ? LP_REPLAYS_MAX : REPLAYS_MAX));
  const where = replayStorage(leagueId, savePath, kind);
  const body = JSON.stringify(data);
  if (upstashConfigured()) { await redisSet(where.redis, body); return; }
  fs.mkdirSync(path.dirname(where.file), { recursive: true });
  const tmp = `${where.file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body, "utf-8");
  fs.renameSync(tmp, where.file);
}

// Directs des ligues privées « monde » (server/privateLeague.js, une ligue
// privée réunit des clubs de plusieurs championnats) : un stock par ligue
// privée, clé "pullup:lpreplays:world:<id>" / fichier
// "<multi-league>.lpreplays.world.<id>.json", mêmes entrées que les
// directs de championnat ({ key, savedAt, entry }), LP_REPLAYS_MAX au plus.
function lpWorldReplayStorage(lpId, savePath) {
  if (!/^[0-9a-f]{4,64}$/i.test(String(lpId || ""))) throw new Error(`Identifiant de ligue privée invalide : ${lpId}`);
  return { redis: `${redisPrefix()}pullup:lpreplays:world:${lpId}`, file: savePath.replace(/\.json$/, "") + `.lpreplays.world.${lpId}.json` };
}
async function loadLpReplays(lpId, savePath = defaultMultiLeaguePath()) {
  try {
    const where = lpWorldReplayStorage(lpId, savePath);
    if (upstashConfigured()) {
      const raw = await redisGet(where.redis);
      return raw == null ? { version: 1, list: [] } : JSON.parse(raw);
    }
    if (!fs.existsSync(where.file)) return { version: 1, list: [] };
    return JSON.parse(fs.readFileSync(where.file, "utf-8"));
  } catch (e) {
    return { version: 1, list: [] };
  }
}
async function appendLpReplays(lpId, items, savePath = defaultMultiLeaguePath()) {
  const data = await loadLpReplays(lpId, savePath);
  items.forEach(it => { data.list = data.list.filter(x => x.key !== it.key); data.list.push(it); });
  data.list = data.list.slice(-LP_REPLAYS_MAX);
  const where = lpWorldReplayStorage(lpId, savePath);
  const body = JSON.stringify(data);
  if (upstashConfigured()) { await redisSet(where.redis, body); return; }
  fs.mkdirSync(path.dirname(where.file), { recursive: true });
  const tmp = `${where.file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body, "utf-8");
  fs.renameSync(tmp, where.file);
}

// Directs des matchs internationaux (server/nationalMatches.js, 2026-10-06) :
// rangés À PART du stock national (une diffusion pèse lourd : événements +
// les deux sélections), une clé par emplacement d'un anneau de
// NATIONAL_LIVE_SLOTS (le plus ancien direct est remplacé), clé
// "pullup:natlive:<n>" / fichier "<multi-league>.natlive.<n>.json" ; l'index
// "pullup:natlive:index" donne l'emplacement de chaque match. Entrée :
// { id, at, entry (forme d'une entrée de league.liveMatches), teams }.
const NATIONAL_LIVE_SLOTS = 240;
function nationalLiveStorage(name, savePath) {
  return { redis: `${redisPrefix()}pullup:natlive:${name}`, file: savePath.replace(/\.json$/, "") + `.natlive.${name}.json` };
}
async function readNationalLiveRaw(name, savePath) {
  const where = nationalLiveStorage(name, savePath);
  try {
    if (upstashConfigured()) {
      const raw = await redisGet(where.redis);
      return raw == null ? null : JSON.parse(raw);
    }
    if (!fs.existsSync(where.file)) return null;
    return JSON.parse(fs.readFileSync(where.file, "utf-8"));
  } catch (e) {
    return null;
  }
}
async function writeNationalLiveRaw(name, data, savePath) {
  const where = nationalLiveStorage(name, savePath);
  const body = JSON.stringify(data);
  if (upstashConfigured()) { await redisSet(where.redis, body); return; }
  fs.mkdirSync(path.dirname(where.file), { recursive: true });
  const tmp = `${where.file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body, "utf-8");
  fs.renameSync(tmp, where.file);
}
async function saveNationalLives(items, savePath = defaultMultiLeaguePath()) {
  if (!Array.isArray(items) || !items.length) return;
  const index = (await readNationalLiveRaw("index", savePath)) || { version: 1, next: 0, slots: {} };
  for (const it of items) {
    if (!it || typeof it.id !== "string") continue;
    let slot = index.slots[it.id];
    if (!Number.isInteger(slot)) {
      slot = index.next % NATIONAL_LIVE_SLOTS;
      index.next = slot + 1;
      // Emplacement repris : l'ancien match n'a plus de direct.
      Object.keys(index.slots).forEach(k => { if (index.slots[k] === slot) delete index.slots[k]; });
    }
    await writeNationalLiveRaw(String(slot), it, savePath);
    index.slots[it.id] = slot;
  }
  await writeNationalLiveRaw("index", index, savePath);
}
async function loadNationalLive(id, savePath = defaultMultiLeaguePath()) {
  const index = await readNationalLiveRaw("index", savePath);
  const slot = index && index.slots ? index.slots[id] : null;
  if (!Number.isInteger(slot)) return null;
  const data = await readNationalLiveRaw(String(slot), savePath);
  return data && data.id === id ? data : null;
}

// Chat de la ligue (server/leagueChat.js) : un bloc JSON par championnat,
// clé "pullup:leaguechat:<id>" / fichier "<multi-league>.chat.<id>.json".
// Contrairement aux replays, une lecture en échec LÈVE une exception : on ne
// renvoie jamais un chat vide qui serait ensuite réécrit par-dessus
// l'historique réel. `null` = aucun chat encore pour ce championnat.
function leagueChatStorage(leagueId, savePath) {
  const id = leagueId || HISTORIC_LEAGUE_ID;
  if (!/^[a-z]{2}-[0-9](\.[0-9]{1,3})?$/.test(id)) throw new Error(`Identifiant de championnat invalide : ${id}`);
  return { redis: `${redisPrefix()}pullup:leaguechat:${id}`, file: savePath.replace(/\.json$/, "") + `.chat.${id}.json` };
}
async function loadLeagueChat(leagueId, savePath = defaultMultiLeaguePath()) {
  const where = leagueChatStorage(leagueId, savePath);
  if (upstashConfigured()) {
    const raw = await redisGet(where.redis);
    return raw == null ? null : JSON.parse(raw);
  }
  if (!fs.existsSync(where.file)) return null;
  return JSON.parse(fs.readFileSync(where.file, "utf-8"));
}
async function saveLeagueChat(leagueId, data, savePath = defaultMultiLeaguePath()) {
  const where = leagueChatStorage(leagueId, savePath);
  const body = JSON.stringify(data);
  if (upstashConfigured()) { await redisSet(where.redis, body); return; }
  fs.mkdirSync(path.dirname(where.file), { recursive: true });
  const tmp = `${where.file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body, "utf-8");
  fs.renameSync(tmp, where.file);
}

// Données annexes du monde (index du marché mondial…) : une clé/fichier par
// nom, à côté du registre — chargées seulement quand on en a besoin.
function worldAuxStorage(name, savePath) {
  if (!/^[a-z]+$/.test(name)) throw new Error(`Nom de données du monde invalide : ${name}`);
  return { redis: `${redisPrefix()}pullup:world:${name}`, file: savePath.replace(/\.json$/, "") + `.world.${name}.json` };
}
async function loadWorldAuxRaw(name, savePath = defaultMultiLeaguePath()) {
  const where = worldAuxStorage(name, savePath);
  try {
    if (upstashConfigured()) {
      const raw = await redisGet(where.redis);
      return raw == null ? null : JSON.parse(raw);
    }
    if (!fs.existsSync(where.file)) return null;
    return JSON.parse(fs.readFileSync(where.file, "utf-8"));
  } catch (e) {
    console.warn(`Données du monde « ${name} » illisibles :`, e.message);
    return null;
  }
}
// Lecture STRICTE (ligues privées « monde », server/privateLeague.js) :
// `null` = pas encore de données, WORLD_READ_FAILED = lecture en échec
// (stockage injoignable, JSON abîmé) — jamais confondus, pour ne jamais
// réécrire un bloc vide par-dessus les vraies données.
async function loadWorldAuxStrict(name, savePath = defaultMultiLeaguePath()) {
  const where = worldAuxStorage(name, savePath);
  try {
    if (upstashConfigured()) {
      const raw = await redisGet(where.redis);
      return raw == null ? null : JSON.parse(raw);
    }
    if (!fs.existsSync(where.file)) return null;
    return JSON.parse(fs.readFileSync(where.file, "utf-8"));
  } catch (e) {
    console.warn(`Données du monde « ${name} » illisibles :`, e.message);
    return WORLD_READ_FAILED;
  }
}
// `opts.strict` : une écriture Redis en échec LÈVE l'exception (au lieu
// d'être seulement journalisée) — l'appelant doit savoir que rien n'est écrit.
async function saveWorldAuxRaw(name, data, savePath = defaultMultiLeaguePath(), opts = {}) {
  const where = worldAuxStorage(name, savePath);
  const body = JSON.stringify(data);
  if (upstashConfigured()) {
    try { await redisSet(where.redis, body); } catch (e) {
      console.warn(`Écriture Redis des données du monde « ${name} » échouée :`, e.message);
      if (opts.strict) throw e;
    }
    return;
  }
  fs.mkdirSync(path.dirname(where.file), { recursive: true });
  const tmp = `${where.file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body, "utf-8");
  fs.renameSync(tmp, where.file);
}

// Mémoire historique des franchises (assets/history.js, 2026-10-06) : un
// journal par club, clé « pullup:history:<club> » / fichier
// « <multi-league>.history.<club>.json », History.CFG.clubMax événements au
// plus. Le club est identifié par son nom (en minuscules), comme le reste
// de son histoire (palmarès, rivalités), stable malgré montées/descentes.
function historyStorage(clubName, savePath) {
  const k = String(clubName || "").trim().toLowerCase();
  if (!k) throw new Error("Club invalide pour l'histoire.");
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
  const slug = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + (h >>> 0).toString(36);
  return { redis: `${redisPrefix()}pullup:history:${slug}`, file: savePath.replace(/\.json$/, "") + `.history.${slug}.json` };
}
async function loadClubHistory(clubName, savePath = defaultMultiLeaguePath()) {
  const where = historyStorage(clubName, savePath);
  try {
    if (upstashConfigured()) {
      const raw = await redisGet(where.redis);
      return raw == null ? [] : (JSON.parse(raw).events || []);
    }
    if (!fs.existsSync(where.file)) return [];
    return JSON.parse(fs.readFileSync(where.file, "utf-8")).events || [];
  } catch (e) {
    console.warn(`Histoire du club « ${clubName} » illisible :`, e.message);
    return null; // lecture en échec : ne jamais réécrire par-dessus
  }
}
async function appendClubHistory(clubName, events, savePath = defaultMultiLeaguePath()) {
  const History = require("../assets/history.js");
  const prev = await loadClubHistory(clubName, savePath);
  if (prev === null) return;
  const where = historyStorage(clubName, savePath);
  const body = JSON.stringify({ version: 1, events: History.mergeClubLog(prev, events) });
  if (upstashConfigured()) { await redisSet(where.redis, body); return; }
  fs.mkdirSync(path.dirname(where.file), { recursive: true });
  const tmp = `${where.file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body, "utf-8");
  fs.renameSync(tmp, where.file);
}
// Registre des IDs de joueurs (demande utilisateur 2026-10-06 : ID de 10
// chiffres, jamais réattribué). Tous les IDs déjà donnés, y compris ceux de
// joueurs retraités ou disparus ; jamais vidé. Une clé/un fichier pour tout
// le monde de jeu : { version: 1, ids: "base36,base36,…" }.
function playerIdRegistryStorage(savePath) {
  const base = String(savePath || defaultMultiLeaguePath()).replace(/\.json$/, "").replace(/\.world\.league\..*$/, "");
  return { redis: `${redisPrefix()}pullup:player-ids`, file: `${base}.player-ids.json` };
}
const playerIdRegistryLoads = new Map();
async function readPlayerIdRegistry(where) {
  let raw = null;
  if (upstashConfigured()) raw = await redisGet(where.redis, { fresh: true });
  else if (fs.existsSync(where.file)) raw = fs.readFileSync(where.file, "utf-8");
  if (raw == null) return [];
  const data = JSON.parse(raw);
  return String(data.ids || "").split(",").filter(Boolean).map(x => parseInt(x, 36));
}
function loadPlayerIdRegistry(savePath = defaultMultiLeaguePath()) {
  const where = playerIdRegistryStorage(savePath);
  const key = upstashConfigured() ? where.redis : where.file;
  if (!playerIdRegistryLoads.has(key)) {
    playerIdRegistryLoads.set(key, readPlayerIdRegistry(where).then(ids => { Engine.registerPlayerIds(ids); return ids.length; }).catch(e => {
      // Lecture en échec : on réessaiera au prochain chargement ; les IDs
      // des ligues chargées restent connus (inscrits au chargement).
      playerIdRegistryLoads.delete(key);
      console.warn("Registre des IDs de joueurs illisible :", e.message);
      return 0;
    }));
  }
  return playerIdRegistryLoads.get(key);
}
async function flushPlayerIdRegistry(savePath = defaultMultiLeaguePath()) {
  const fresh = Engine.takePendingPlayerIds();
  if (!fresh.length) return;
  const where = playerIdRegistryStorage(savePath);
  try {
    await loadPlayerIdRegistry(savePath);
    const all = new Set(await readPlayerIdRegistry(where));
    fresh.forEach(id => all.add(id));
    const body = JSON.stringify({ version: 1, ids: Array.from(all, id => id.toString(36)).join(",") });
    if (upstashConfigured()) { await redisSet(where.redis, body); return; }
    fs.mkdirSync(path.dirname(where.file), { recursive: true });
    const tmp = `${where.file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, body, "utf-8");
    fs.renameSync(tmp, where.file);
  } catch (e) {
    // Jamais perdus : remis en attente pour la prochaine sauvegarde.
    Engine.requeuePendingPlayerIds(fresh);
    console.warn("Registre des IDs de joueurs non enregistré :", e.message);
  }
}

// Réécriture complète d'un journal d'histoire (migration des IDs de joueurs).
async function replaceClubHistory(clubName, events, savePath = defaultMultiLeaguePath()) {
  const where = historyStorage(clubName, savePath);
  const body = JSON.stringify({ version: 1, events });
  if (upstashConfigured()) { await redisSet(where.redis, body); return; }
  fs.mkdirSync(path.dirname(where.file), { recursive: true });
  const tmp = `${where.file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body, "utf-8");
  fs.renameSync(tmp, where.file);
}
// Copie de sauvegarde avant une migration de données (jamais relue par le
// jeu) : `pullup:backup:<tag>` ou `<base>.backup.<tag>.json`.
async function saveMigrationBackup(tag, data, savePath = defaultMultiLeaguePath()) {
  const safe = String(tag).toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(0, 80);
  const base = String(savePath || defaultMultiLeaguePath()).replace(/\.json$/, "").replace(/\.world\.league\..*$/, "");
  const body = JSON.stringify(data);
  if (upstashConfigured()) { await redisSet(`${redisPrefix()}pullup:backup:${safe}`, body); return; }
  const file = `${base}.backup.${safe}.json`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf-8");
}

async function flushHistoryQueue(savePath = defaultMultiLeaguePath()) {
  const History = require("../assets/history.js");
  const events = History.drain();
  if (!events.length) return;
  const byClub = History.byClub(events);
  for (const club of Object.keys(byClub)) {
    try { await appendClubHistory(club, byClub[club], savePath); } catch (e) { console.warn(`Histoire du club « ${club} » non enregistrée :`, e.message); }
  }
}

// Archives de saison (feuilles de match figées, voir
// engine.js:buildSeasonArchive) : une clé/fichier par championnat et par
// saison, lue seulement à la demande (jamais avec la ligue).
function seasonArchiveStorage(leagueId, season, savePath) {
  if (!/^[a-z0-9.-]+$/i.test(String(leagueId)) || !Number.isInteger(season) || season < 1) throw new Error(`Archive de saison invalide : ${leagueId}/${season}`);
  return { redis: `${redisPrefix()}pullup:world:archive:${leagueId}:${season}`, file: savePath.replace(/\.json$/, "") + `.world.archive.${leagueId}.${season}.json` };
}
async function saveSeasonArchive(leagueId, season, data, savePath = defaultMultiLeaguePath()) {
  const where = seasonArchiveStorage(leagueId, season, savePath);
  const body = JSON.stringify(data);
  if (upstashConfigured()) { await redisSet(where.redis, body); return; }
  fs.mkdirSync(path.dirname(where.file), { recursive: true });
  const tmp = `${where.file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body, "utf-8");
  fs.renameSync(tmp, where.file);
}
async function loadSeasonArchive(leagueId, season, savePath = defaultMultiLeaguePath()) {
  const where = seasonArchiveStorage(leagueId, season, savePath);
  try {
    if (upstashConfigured()) {
      const raw = await redisGet(where.redis);
      return raw == null ? null : JSON.parse(raw);
    }
    if (!fs.existsSync(where.file)) return null;
    return JSON.parse(fs.readFileSync(where.file, "utf-8"));
  } catch (e) {
    console.warn(`Archive de saison ${leagueId}/${season} illisible :`, e.message);
    return null;
  }
}

// Permaliens des joueurs (server/playerLinks.js, 2026-10-01) : un seul bloc
// JSON { codes: { code: { leagueId, teamIdx, playerId, name, createdAt } } },
// clé "pullup:playerlinks" / fichier "<multi-league>.playerlinks.json".
// Comme le chat, une lecture en échec LÈVE une exception (jamais un bloc
// vide réécrit par-dessus les liens existants). `null` = aucun lien encore.
function playerLinksStorage(savePath) {
  return { redis: `${redisPrefix()}pullup:playerlinks`, file: savePath.replace(/\.json$/, "") + ".playerlinks.json" };
}
async function loadPlayerLinks(savePath = defaultMultiLeaguePath()) {
  const where = playerLinksStorage(savePath);
  if (upstashConfigured()) {
    const raw = await redisGet(where.redis);
    return raw == null ? null : JSON.parse(raw);
  }
  if (!fs.existsSync(where.file)) return null;
  return JSON.parse(fs.readFileSync(where.file, "utf-8"));
}
async function savePlayerLinks(data, savePath = defaultMultiLeaguePath()) {
  const where = playerLinksStorage(savePath);
  const body = JSON.stringify(data);
  if (upstashConfigured()) { await redisSet(where.redis, body); return; }
  fs.mkdirSync(path.dirname(where.file), { recursive: true });
  const tmp = `${where.file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body, "utf-8");
  fs.renameSync(tmp, where.file);
}

// Résout le manager qui a fait CETTE requête à partir de son jeton privé
// (voir Team.managerLinkToken) : un simple parcours linéaire (N ≤ 10, jamais
// besoin d'un index) des équipes de la ligue, à la recherche d'une équipe
// HUMAINE dont le jeton correspond EXACTEMENT. Renvoie `{ team, teamIndex }`
// si trouvé, `null` sinon (jeton manquant, inconnu, ou appartenant à une
// équipe qui n'est plus humaine) — c'est la SEULE porte d'entrée qui
// transforme "une requête HTTP qui prétend être untel" en "l'équipe qu'elle
// a réellement le droit de piloter" (voir server/index.js).
function resolveManagerTeam(league, token) {
  if (!league || !token || typeof token !== "string") return null;
  const teamIndex = league.teams.findIndex(t => t.isHuman && t.managerLinkToken === token);
  if (teamIndex === -1) return null;
  return { team: league.teams[teamIndex], teamIndex };
}

// Nouvelle carrière — mêmes réglages de départ que initGame() côté
// navigateur (voir moteurbasket3.html) : effectif de débutants, mêmes
// priorités offensives par défaut, Division I. `now` explicite (voir
// generateLeague) pour rester testable. Le rythme de calendrier retenu
// (classique, ou accéléré si le serveur a démarré avec
// BASKET_FAST_CALENDAR=1 — voir Calendar.setFastTestMode/
// getDefaultCalendarConfig) est figé UNE FOIS ICI, à la création : voir le
// commentaire sur League.calendarWeekMs/calendarSlotOffsetsMs (engine.js)
// pour pourquoi une carrière déjà créée ne change jamais de rythme après
// coup.
function createNewCareer(now = Date.now()) {
  const team = generateStartingRoster("Lyon");
  team.offensivePriorities = ["Jeu en pénétration", "Pick & Roll", "Transition rapide"];
  const league = generateLeague(team, 1, now, Calendar.getDefaultCalendarConfig());
  return { team, league };
}

function serialize(team, league) {
  return { version: SAVE_VERSION, team: serializeTeam(team), league: serializeLeague(league) };
}

function deserialize(data) {
  // Reconstitue le plancher de uid() AVANT toute reconstruction d'objets
  // (voir Engine.reseedUidFromSave/__uid, correctif 2026-09 "Cette enchère
  // est déjà terminée" après un redémarrage du process serveur) : sans ça,
  // le tout premier candidat de marché généré après un redémarrage pourrait
  // reprendre un id déjà utilisé par une entité plus ancienne de CETTE
  // sauvegarde.
  Engine.reseedUidFromSave(data);
  const team = teamFromSave(data.team);
  const league = leagueFromSave(data.league, team);
  return { team, league };
}

// `async` + bascule Redis : voir le grand commentaire "BACKEND REDIS" en
// tête de fichier et le commentaire sur loadMultiLeague ci-dessus (même
// logique, appliquée ici à la carrière solo). `savePath` : accepté mais
// ignoré quand Redis est actif (clé fixe REDIS_KEYS.league à la place).
async function load(savePath = defaultSavePath()) {
  if (upstashConfigured()) {
    try {
      const raw = await redisGet(redisKey("league"));
      if (raw == null) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== SAVE_VERSION || !data.team || !data.league) return null;
      return deserialize(data);
    } catch (e) {
      console.warn("Lecture Redis (Upstash) de la carrière solo échouée, on repart d'une carrière neuve :", e.message);
      return null;
    }
  }
  try {
    if (!fs.existsSync(savePath)) return null;
    const raw = fs.readFileSync(savePath, "utf-8");
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION || !data.team || !data.league) return null;
    return deserialize(data);
  } catch (e) {
    console.warn("Sauvegarde serveur illisible, on repart d'une carrière neuve :", e.message);
    return null;
  }
}

// Écriture atomique côté fichier local (fichier temporaire puis renommage) :
// évite un fichier de sauvegarde à moitié écrit si le process s'arrête en
// plein milieu d'une écriture (un simple writeFileSync direct laisserait une
// fenêtre de corruption possible) — inchangé. Côté Redis, une erreur
// d'écriture est journalée sans jamais faire planter le serveur — voir le
// commentaire sur saveMultiLeague ci-dessus, même logique.
async function save(team, league, savePath = defaultSavePath()) {
  if (upstashConfigured()) {
    try {
      await redisSet(redisKey("league"), JSON.stringify(serialize(team, league)));
    } catch (e) {
      console.warn("Écriture Redis (Upstash) de la carrière solo échouée :", e.message);
    }
    return;
  }
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  const tmpPath = `${savePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(serialize(team, league)), "utf-8");
  fs.renameSync(tmpPath, savePath);
}

// ---------------------------------------------------------------------
// COMPTES JOUEURS (2026-09-26, voir server/accounts.js) — un simple bloc
// JSON (chaîne brute, sérialisée/validée par accounts.js), même bascule
// fichier local / Upstash que le reste. DIFFÉRENCE VOLONTAIRE avec
// loadMultiLeague : une lecture Redis qui ÉCHOUE lève une exception au lieu
// de renvoyer `null` — sinon une inscription pendant une panne d'Upstash
// repartirait d'une liste vide et ÉCRASERAIT tous les comptes existants.
// `null` veut donc TOUJOURS dire "aucun compte n'a encore été créé".
// ---------------------------------------------------------------------
function defaultAccountsPath() {
  return path.join(__dirname, "data", "accounts.json");
}

async function loadAccountsRaw(filePath = defaultAccountsPath()) {
  if (upstashConfigured()) return redisGet(redisKey("accounts"));
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

async function saveAccountsRaw(raw, filePath = defaultAccountsPath()) {
  if (upstashConfigured()) { await redisSet(redisKey("accounts"), raw); return; }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, raw, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

async function loadOrCreate(savePath = defaultSavePath(), now = Date.now()) {
  const loaded = await load(savePath);
  if (loaded) return loaded;
  const created = createNewCareer(now);
  await save(created.team, created.league, savePath);
  return created;
}

// Diagnostic du stockage (GET /api/health, incident 2026-10-02) : lit le
// registre du monde et renvoie l'erreur exacte en cas d'échec (jamais de
// donnée ni de secret).
async function storageHealth(savePath = defaultMultiLeaguePath()) {
  const where = worldStorage(savePath);
  const storage = storageBackendName();
  const t0 = Date.now();
  try {
    let raw;
    if (upstashConfigured()) raw = await redisGet(where.redis, { fresh: true });
    else raw = fs.existsSync(where.file) ? fs.readFileSync(where.file, "utf-8") : null;
    let leagues = null;
    if (raw != null) leagues = (JSON.parse(raw).leagues || []).length;
    return { ok: raw != null, storage, worldFound: raw != null, leagues, ms: Date.now() - t0, error: raw == null ? "Registre du monde introuvable." : null };
  } catch (e) {
    return { ok: false, storage, worldFound: false, leagues: null, ms: Date.now() - t0, error: String(e && e.message || e) };
  }
}
module.exports = {
  storageHealth, storageBackendName, redisGet, redisSet, clearRedisCache, redisEncode, redisDecode,
  SAVE_VERSION, defaultSavePath, createNewCareer,
  serialize, deserialize, load, save, loadOrCreate,
  // Multi-manager (voir bloc dédié plus haut) :
  MULTI_SAVE_VERSION, defaultMultiLeaguePath, createMultiManagerCareer,
  serializeMultiLeague, deserializeMultiLeague, loadMultiLeague, saveMultiLeague,
  loadPlayerIdRegistry, flushPlayerIdRegistry, playerIdRegistryStorage,
  resolveManagerTeam,
  // Championnats par pays (voir server/world.js) :
  HISTORIC_LEAGUE_ID, loadWorldRaw, saveWorldRaw, WORLD_READ_FAILED, stampHistoricLeague, loadWorldAuxRaw, loadWorldAuxStrict, saveWorldAuxRaw, saveSeasonArchive, loadSeasonArchive,
  loadClubHistory, appendClubHistory, replaceClubHistory, saveMigrationBackup, flushHistoryQueue,
  loadReplays, appendReplays, loadLpReplays, appendLpReplays, REPLAYS_MAX, LP_REPLAYS_MAX, isLpReplayKey, loadLeagueChat, saveLeagueChat,
  saveNationalLives, loadNationalLive, NATIONAL_LIVE_SLOTS,
  loadPlayerLinks, savePlayerLinks,
  // Comptes joueurs (voir server/accounts.js) :
  defaultAccountsPath, loadAccountsRaw, saveAccountsRaw,
  // Backend Redis (Upstash) optionnel (voir grand commentaire dédié plus
  // haut) — exposé pour server/upstash_store_test.js UNIQUEMENT :
  // `_setFetchImplForTests` pour intercepter les appels réseau,
  // `REDIS_KEYS`/`upstashConfigured` pour vérifier la bonne clé/bascule.
  REDIS_KEYS, redisKey, upstashConfigured, _setFetchImplForTests,
};
