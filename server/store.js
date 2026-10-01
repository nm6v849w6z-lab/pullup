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
    console.warn("Registre du monde illisible :", e.message);
    return null;
  }
}
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

function upstashConfigured() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
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
async function redisGet(key) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Upstash GET ${key} a échoué (HTTP ${res.status}).`);
  const data = await res.json();
  return data && typeof data.result === "string" ? data.result : null;
}

// Écrit `value` (déjà sérialisée en JSON par l'appelant) pour `key`. Comme
// redisGet, ne fait qu'échouer par exception — c'est save()/saveMultiLeague()
// ci-dessous qui décide de l'avertir sans planter (voir leur commentaire).
async function redisSet(key, value) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    body: value,
  });
  if (!res.ok) throw new Error(`Upstash SET ${key} a échoué (HTTP ${res.status}).`);
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
async function saveWorldAuxRaw(name, data, savePath = defaultMultiLeaguePath()) {
  const where = worldAuxStorage(name, savePath);
  const body = JSON.stringify(data);
  if (upstashConfigured()) {
    try { await redisSet(where.redis, body); } catch (e) { console.warn(`Écriture Redis des données du monde « ${name} » échouée :`, e.message); }
    return;
  }
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

module.exports = {
  SAVE_VERSION, defaultSavePath, createNewCareer,
  serialize, deserialize, load, save, loadOrCreate,
  // Multi-manager (voir bloc dédié plus haut) :
  MULTI_SAVE_VERSION, defaultMultiLeaguePath, createMultiManagerCareer,
  serializeMultiLeague, deserializeMultiLeague, loadMultiLeague, saveMultiLeague,
  resolveManagerTeam,
  // Championnats par pays (voir server/world.js) :
  HISTORIC_LEAGUE_ID, loadWorldRaw, saveWorldRaw, stampHistoricLeague, loadWorldAuxRaw, saveWorldAuxRaw,
  loadReplays, appendReplays, REPLAYS_MAX, LP_REPLAYS_MAX, isLpReplayKey, loadLeagueChat, saveLeagueChat,
  // Comptes joueurs (voir server/accounts.js) :
  defaultAccountsPath, loadAccountsRaw, saveAccountsRaw,
  // Backend Redis (Upstash) optionnel (voir grand commentaire dédié plus
  // haut) — exposé pour server/upstash_store_test.js UNIQUEMENT :
  // `_setFetchImplForTests` pour intercepter les appels réseau,
  // `REDIS_KEYS`/`upstashConfigured` pour vérifier la bonne clé/bascule.
  REDIS_KEYS, redisKey, upstashConfigured, _setFetchImplForTests,
};
