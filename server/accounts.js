// =====================================================================
// COMPTES JOUEURS (2026-09-26) — retour utilisateur : "si on tape
// hoop-manager.com, on doit tomber sur un site pour s'inscrire" + club
// attribué automatiquement + inscription par Discord OU email/mot de passe.
//
// Un compte ne REMPLACE PAS l'identité manager existante (le jeton privé
// Team.managerLinkToken, envoyé par le jeu dans X-TipIn-Token, voir
// server/index.js:resolvePlayerContext) : il sert seulement à la
// RETROUVER. Se connecter = récupérer son jeton, que le navigateur range
// ensuite en localStorage exactement comme un lien `?m=` reçu à la main.
// Tout le reste du jeu reste donc strictement inchangé.
//
//   account = {
//     id,              // identifiant interne, jamais exposé au client
//     accountKey,      // secret du compte tant qu'il n'a pas de club (liste
//                      // d'attente) — voir /api/account/status
//     email, passwordHash,          // optionnels (compte Discord seul)
//     discordId, discordName,       // optionnels (compte email seul)
//     discordUsername,              // identifiant Discord (pseudo par défaut)
//     lang,            // langue choisie ("fr" | "en" | "it", ou null) — voir langFor
//     detectedLang,    // langue du navigateur, notée automatiquement — voir langFor
//     managerToken,    // Team.managerLinkToken du club attribué, ou null
//     requestedClubName,            // nom choisi à l'inscription
//     createdAt, lastLoginAt,
//   }
//
// Stockage : UN bloc JSON (store.loadAccountsRaw/saveAccountsRaw — fichier
// local ou Upstash, clé `pullup:accounts`). Suffisant pour quelques
// centaines de comptes ; au-delà (voir DEV_NOTES "passage à l'échelle"),
// ce module est le seul endroit à porter vers une vraie base SQL — ses
// fonctions ne supposent rien de la forme du stockage.
//
// Mots de passe : scrypt (module natif `crypto`, aucune dépendance), sel
// aléatoire par compte, comparaison à temps constant.
// =====================================================================
const crypto = require("crypto");
const store = require("./store.js");
const Engine = require("../engine.js");

const ACCOUNTS_VERSION = 1;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 200;
const CLUB_NAME_MIN_LENGTH = 2;
const CLUB_NAME_MAX_LENGTH = 24;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 32 };

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

// ---------------------------------------------------------------------
// Stockage
// ---------------------------------------------------------------------
async function loadAccounts(filePath) {
  const raw = await store.loadAccountsRaw(filePath);
  if (raw == null) return { version: ACCOUNTS_VERSION, accounts: [] };
  const data = JSON.parse(raw);
  if (!data || data.version !== ACCOUNTS_VERSION || !Array.isArray(data.accounts)) {
    // Jamais "on repart de zéro" en silence : ça écraserait les comptes.
    throw new Error("Fichier de comptes illisible (version inattendue).");
  }
  return data;
}

async function saveAccounts(data, filePath) {
  await store.saveAccountsRaw(JSON.stringify(data), filePath);
}

// ---------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------
function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function validatePassword(raw) {
  if (typeof raw !== "string") return { error: "password-invalid" };
  if (raw.length < PASSWORD_MIN_LENGTH) return { error: "password-too-short" };
  if (raw.length > PASSWORD_MAX_LENGTH) return { error: "password-invalid" };
  return { value: raw };
}

function normalizeClubName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < CLUB_NAME_MIN_LENGTH || name.length > CLUB_NAME_MAX_LENGTH) return null;
  // Lettres (accents compris), chiffres, espace, tiret, apostrophe, point.
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '’.\-]*$/u.test(name)) return null;
  return name;
}

// Un nom de club est refusé s'il existe déjà dans la ligue (humain OU CPU)
// ou s'il fait partie des noms CPU par défaut : une réinitialisation de
// ligue (voir server/index.js:performMultiLeagueReset) recrée les CPU sous
// ces noms-là et identifie les managers PAR NOM de club — un doublon y
// mélangerait deux clubs.
function isClubNameTaken(name, league) {
  const key = name.toLocaleLowerCase("fr");
  if (Engine.CPU_TEAM_NAMES.some(n => n.toLocaleLowerCase("fr") === key)) return true;
  if (league && league.teams.some(t => (t.name || "").toLocaleLowerCase("fr") === key)) return true;
  return false;
}

// ---------------------------------------------------------------------
// Mots de passe
// ---------------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const { N, r, p, keylen } = SCRYPT_PARAMS;
  const hash = crypto.scryptSync(password, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  let actual;
  try {
    actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  } catch (e) { return false; }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------
// Recherche / création
// ---------------------------------------------------------------------
function findByEmail(data, email) {
  return email ? data.accounts.find(a => a.email === email) || null : null;
}
function findByDiscordId(data, discordId) {
  return discordId ? data.accounts.find(a => a.discordId === discordId) || null : null;
}
function findByManagerToken(data, token) {
  return token ? data.accounts.find(a => a.managerToken === token) || null : null;
}
function findByAccountKey(data, key) {
  if (typeof key !== "string" || !key) return null;
  return data.accounts.find(a => a.accountKey === key) || null;
}

function createAccount(data, fields, now) {
  const account = {
    id: randomHex(12),
    accountKey: randomHex(24),
    email: fields.email || null,
    passwordHash: fields.passwordHash || null,
    discordId: fields.discordId || null,
    discordName: fields.discordName || null,
    // Identifiant Discord (username, un pseudo) : seule source d'un pseudo de
    // manager par défaut (voir accountRoutes.js:defaultPseudoFromDiscord).
    discordUsername: fields.discordUsername || null,
    // Langue du manager (2026-09-30, « la langue doit être dans le compte ») :
    // voir normalizeLang/langFor.
    lang: normalizeLang(fields.lang),
    // Langue du navigateur, notée automatiquement (voir noteDetectedLang).
    detectedLang: normalizeLang(fields.detectedLang),
    managerToken: fields.managerToken || null,
    requestedClubName: fields.requestedClubName || null,
    // Pays choisi à l'inscription (2026-09-28, championnats par pays).
    requestedCountry: fields.requestedCountry || null,
    createdAt: now,
    lastLoginAt: now,
  };
  data.accounts.push(account);
  return account;
}

// ---------------------------------------------------------------------
// Langue du compte (2026-09-30, retour utilisateur : la langue doit suivre
// le COMPTE, pas seulement le navigateur). Réglée depuis Paramètres ›
// Langue (POST /api/account/lang) ou le sélecteur de langue du site quand on
// est connecté ; renvoyée par /api/account/me ; le jeu l'applique au
// chargement sur n'importe quel appareil (localStorage "hm-lang" reste un
// cache). Première connexion sans langue enregistrée : le jeu envoie celle
// du navigateur.
//
// Textes générés par le SERVEUR qui dépendent de la langue (emails, push…) :
// utiliser `langFor(account, { country, hint })` — toujours "fr", "en" ou
// "it". Ordre (2026-09-30, retour utilisateur : « un compte qui n'a jamais
// choisi de langue reçoit tout en français, même si son navigateur est en
// anglais ») :
//   1. `lang` : choix explicite du manager ;
//   2. `detectedLang` : langue du navigateur, notée automatiquement à
//      l'inscription, à la connexion et à l'ouverture du jeu
//      (noteDetectedLang ; langue non prise en charge → "en") ;
//   3. `hint` : langue de la requête en cours (Accept-Language…) ;
//   4. langue du pays du club (`country` : fr → fr, it → it, us → en, voir
//      COUNTRY_LANGS) ;
//   5. l'anglais.
// Depuis un club : langFor(findByManagerToken(data, team.managerLinkToken),
// { country: team.country }).
// ---------------------------------------------------------------------
const ACCOUNT_LANGS = ["fr", "en", "it", "es", "pt", "de", "pl", "el", "lt", "zh"];
function normalizeLang(raw) {
  return typeof raw === "string" && ACCOUNT_LANGS.includes(raw) ? raw : null;
}
const COUNTRY_LANGS = { fr: "fr", it: "it", us: "en", ca: "en", be: "fr", es: "es", ar: "es", pt: "pt", br: "pt",
  de: "de", ch: "de", pl: "pl", gr: "el", lt: "lt", cn: "zh", hk: "zh", tw: "zh" };
function countryLang(country) {
  return (typeof country === "string" && COUNTRY_LANGS[country]) || null;
}
function langFor(account, { country = null, hint = null } = {}) {
  return (account && (normalizeLang(account.lang) || normalizeLang(account.detectedLang)))
    || normalizeLang(hint) || countryLang(country) || "en";
}
// Note la langue détectée du navigateur (déjà ramenée à fr/en/it, voir
// server/i18n.js:hintFromRequest). Renvoie true si le compte a changé.
function noteDetectedLang(account, lang) {
  const l = normalizeLang(lang);
  if (!account || !l || account.detectedLang === l) return false;
  account.detectedLang = l;
  return true;
}

// Ce que le client a le droit de voir de son propre compte.
function publicView(account) {
  return {
    email: account.email || null,
    hasPassword: !!account.passwordHash,
    discordLinked: !!account.discordId,
    discordName: account.discordName || null,
    hasClub: !!account.managerToken,
    lang: normalizeLang(account.lang),
    // Affichage des notes sur la fiche joueur (retour utilisateur 2026-10-03 :
    // « paramétré sur le compte ») : "gen" (défaut) ou "tc".
    // null : jamais choisi (le navigateur envoie alors son choix local).
    ratingMode: account.ratingMode === "tc" || account.ratingMode === "gen" ? account.ratingMode : null,
  };
}

// ---------------------------------------------------------------------
// Attribution d'un club (retour utilisateur : "club attribué
// automatiquement") — le nouveau manager reprend un club CPU de la ligue
// partagée en cours de route : classement et calendrier restent ceux du
// club CPU, le nom change (celui choisi à l'inscription) et l'EFFECTIF est
// remplacé (retour utilisateur 2026-09-26 : "un joueur qui reprend une
// équipe doit avoir un effectif basique, joueurs entre 30 et 50 en
// niveau") — un club CPU est bien plus fort (~55-65) que les managers
// d'origine, partis de débutants (~30). Plus aucun club CPU :
// `{ ok:false, reason:"full" }` (le compte reste en liste d'attente).
// ---------------------------------------------------------------------
const BASIC_PLAYER_MIN_LEVEL = 30;
const BASIC_PLAYER_MAX_LEVEL = 50;

function teamAverageOverall(team) {
  const players = team.players || [];
  if (!players.length) return 0;
  return players.reduce((s, p) => s + (typeof p.overall === "function" ? p.overall() : 0), 0) / players.length;
}

// Un joueur "basique" : niveau (Player.overall, celui du tableau de bord)
// tiré entre 30 et 50. Nom/âge/taille/agressivité repris d'un débutant
// classique (noms de famille uniques dans l'effectif), attributs générés
// autour du niveau visé puis recalés dans la fourchette. Construit en une
// fois (le constructeur de Player déduit salaire et potentiel des
// attributs).
function generateBasicPlayer(position, usedLastNames, country = "fr") {
  const base = Engine.generateRookiePlayer(position, usedLastNames, country);
  const target = BASIC_PLAYER_MIN_LEVEL + Math.random() * (BASIC_PLAYER_MAX_LEVEL - BASIC_PLAYER_MIN_LEVEL);
  const attrs = Engine.generateRawAttrsInRange(position, Math.max(1, target - 12), Math.min(99, target + 12), 1);
  const keys = Object.keys(attrs);
  const meanOf = () => keys.reduce((sum, k) => sum + attrs[k], 0) / keys.length;
  for (let i = 0; i < 20; i++) {
    const mean = meanOf();
    if (mean >= BASIC_PLAYER_MIN_LEVEL && mean <= BASIC_PLAYER_MAX_LEVEL) break;
    const shift = mean > BASIC_PLAYER_MAX_LEVEL ? -1 : 1;
    keys.forEach(k => { attrs[k] = Math.max(1, Math.min(99, attrs[k] + shift)); });
  }
  return new Engine.Player({
    name: base.name, nationality: base.nationality, position, height: base.height, age: base.age, attrs, aggressiveness: base.aggressiveness,
  });
}

function generateBasicRoster(country = "fr") {
  const used = new Set();
  const players = [];
  Engine.POSITIONS.forEach(pos => { for (let i = 0; i < 3; i++) players.push(generateBasicPlayer(pos, used, country)); });
  return players;
}

// Remplace l'effectif d'un club repris : ses anciens joueurs quittent la
// ligue, et tout ce qui pointait vers eux sur le marché des transferts est
// annulé (annonces de vente de ce club, enchères de ce club — personne ne
// paie ni n'encaisse quoi que ce soit pour ces joueurs-là).
function replaceRoster(league, teamIndex, country = (league && league.country) || "fr") {
  const team = league.teams[teamIndex];
  const oldIds = new Set((team.players || []).map(p => p.id));
  (league.transferListings || []).forEach(l => {
    if (l.status !== "open") return;
    if (l.sellerIdx === teamIndex || oldIds.has(l.playerId)) { l.status = "cancelled"; return; }
    if (l.currentBidderIdx === teamIndex) {
      // Enchère du club CPU sur le joueur d'un autre : on la retire, l'annonce
      // reste ouverte sans enchérisseur.
      l.bids = (l.bids || []).filter(b => b.bidderIdx !== teamIndex && b.teamIdx !== teamIndex);
      const last = l.bids[l.bids.length - 1];
      l.currentBid = last ? last.amount : null;
      l.currentBidderIdx = last ? (last.bidderIdx != null ? last.bidderIdx : last.teamIdx) : null;
      l.currentBidderRef = last && last.bidderRef ? { ...last.bidderRef } : null;
    }
  });
  team.players = generateBasicRoster(country);
  if (typeof team.autoAssignLineup === "function") team.autoAssignLineup();
}

function takeOverCpuClub(league, clubName) {
  if (!league) return { ok: false, reason: "no-league" };
  const candidates = league.teams
    .map((t, teamIndex) => ({ t, teamIndex }))
    .filter(x => !x.t.isHuman);
  if (!candidates.length) return { ok: false, reason: "full" };
  // Le club CPU le plus faible : son effectif part de toute façon, mais c'est
  // aussi (en général) celui qui est le plus bas au classement.
  candidates.sort((a, b) => teamAverageOverall(a.t) - teamAverageOverall(b.t));
  const { t: team, teamIndex } = candidates[0];
  const previousName = team.name;
  replaceRoster(league, teamIndex);
  team.isHuman = true;
  team.isAdmin = false;
  team.managerLinkToken = Engine.randomHexToken(24);
  team.name = clubName;
  team.onboardingTourCompleted = false;
  // Nouveau club (effectif remplacé, nouveau nom) : historique des
  // transferts repart de zéro, et « Mon historique » commence ici.
  team.transferHistory = [];
  team.managerSince = Date.now();
  // Mémoire historique : managers successifs du club.
  team.managerHistory = (Array.isArray(team.managerHistory) ? team.managerHistory : []).concat([{ since: team.managerSince, until: null, pseudo: null, fromSeason: Engine.histSeasonOf ? Engine.histSeasonOf(team) : null }]).slice(-20);
  // Succès : nouveau club, compteurs à zéro.
  team.achStats = { migrated: true };
  team.achTiers = {};
  team.achLog = [];
  team.achSeenAt = Date.now();
  if (team.feed) {
    try {
      Engine.pushEntry(team.feed, {
        key: "club_takeover",
        category: "club",
        priority: "alert",
        week: typeof team.week === "number" ? team.week : undefined,
        title: `Bienvenue à ${clubName} !`,
        text: `Vous reprenez en cours de saison la place de ${previousName} dans la ligue, avec un nouvel effectif à faire progresser.`,
      });
    } catch (e) { /* le fil d'actus est un confort, jamais bloquant */ }
  }
  return { ok: true, teamIndex, token: team.managerLinkToken, previousName };
}

// Anti-triche : transferts suspects entre clubs de managers (League.
// humanTransferLog) — prix inférieur à 40 % de la valeur estimée, ou au
// moins 3 ventes entre les deux mêmes clubs sur 30 jours.
function suspiciousTransfers(list, now) {
  const out = [];
  (list || []).forEach(x => {
    if (x.value > 0 && x.price < 0.4 * x.value) out.push({ ...x, reason: `prix ${Math.round(100 * x.price / x.value)} % de la valeur estimée` });
  });
  const pairs = new Map();
  (list || []).filter(x => now - x.at < 30 * 24 * 3600 * 1000).forEach(x => {
    const key = [x.sellerName, x.buyerName].sort().join(" ↔ ");
    pairs.set(key, (pairs.get(key) || []).concat([x]));
  });
  pairs.forEach((xs, key) => { if (xs.length >= 3) out.push({ pair: key, count: xs.length, reason: `${xs.length} transferts entre ces deux clubs en 30 jours` }); });
  return out;
}

module.exports = {
  suspiciousTransfers,
  ACCOUNTS_VERSION, PASSWORD_MIN_LENGTH, CLUB_NAME_MAX_LENGTH,
  loadAccounts, saveAccounts,
  normalizeEmail, validatePassword, normalizeClubName, isClubNameTaken,
  hashPassword, verifyPassword,
  findByEmail, findByDiscordId, findByManagerToken, findByAccountKey,
  createAccount, publicView,
  ACCOUNT_LANGS, normalizeLang, langFor, countryLang, noteDetectedLang,
  takeOverCpuClub, teamAverageOverall, generateBasicRoster,
  BASIC_PLAYER_MIN_LEVEL, BASIC_PLAYER_MAX_LEVEL,
};
