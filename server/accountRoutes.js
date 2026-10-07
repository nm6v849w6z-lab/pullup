// =====================================================================
// ROUTES COMPTES + CONNEXION DISCORD (2026-09-26) — voir server/accounts.js
// pour le modèle. Branché dans server/index.js (handleAccountRoutes, appelé
// SOUS le verrou de sauvegarde : une inscription modifie la ligue partagée
// — reprise d'un club CPU — et ne doit jamais s'entrelacer avec une autre
// requête qui réécrirait une copie périmée de cette ligue).
//
// Routes :
//   GET  /api/account/config             réglages publics (Discord actif ?...)
//   POST /api/account/signup             {email, password, clubName}
//   POST /api/account/login              {email, password}
//   POST /api/account/discord-complete   {pending, clubName} (1re connexion Discord)
//   GET  /api/account/status             X-Account-Key (liste d'attente)
//   GET  /api/account/me                 X-TipIn-Token
//   POST /api/account/claim              X-TipIn-Token + {email, password}
//   POST /api/account/discord-link-start X-TipIn-Token -> {url}
//   GET  /auth/discord                   ?intent=login | ?n=<nonce> (liaison)
//   GET  /auth/discord/callback          retour de Discord
//   GET  /api/admin/accounts             X-Admin-Token
//   POST /api/admin/accounts/reset-password X-Admin-Token + {email, newPassword}
//   POST /api/admin/accounts/transfer-club X-Admin-Token + {club, newName?, leagueId?}
//
// Réponse d'une connexion/inscription réussie :
//   {ok:true, status:"active", managerToken}  -> le navigateur range le jeton
//                                               et ouvre le jeu (/?m=...)
//   {ok:true, status:"waiting", accountKey}   -> liste d'attente (plus aucun
//                                               club CPU libre)
// Les erreurs portent un `code` stable (traduit côté page, FR/EN).
//
// Discord (OAuth2, scope "identify" seulement — ni email ni serveurs) :
// variables DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET, et
// DISCORD_REDIRECT_URI (optionnelle : sinon <origine>/auth/discord/callback).
// Sans les deux premières, tout ce qui touche à Discord est simplement
// désactivé (boutons masqués, routes en 404).
// =====================================================================
const crypto = require("crypto");
const store = require("./store.js");
const Accounts = require("./accounts.js");
const World = require("./world.js");
const Referrals = require("./referrals.js");
const GeoIp = require("./geoip.js");

// Pays du club à l'inscription (2026-10-01, retour utilisateur : « si mon ip
// est fr je dois avoir une équipe fr ») : le pays CLIQUÉ par le manager
// (b.countryChosen) est respecté ; sinon (présélection automatique, ancienne
// page sans ce champ…), le pays de l'adresse IP l'emporte s'il est ouvert,
// puis celui envoyé par la page.
function signupCountry(req, b) {
  const sent = World.isOpenCountry(b.country) ? b.country : null;
  if (b.countryChosen === true && sent) return sent;
  const ip = GeoIp.countryFromRequest(req);
  return World.isOpenCountry(ip) ? ip : sent;
}
const Mailer = require("./mailer.js");
const I18n = require("./i18n.js");
const Engine = require("../engine.js");

// Mot de passe oublié (liste de la nuit du 2026-09-28) : lien valable 1 h,
// seul son empreinte SHA-256 est gardée sur le compte.
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
function sha256(x) { return crypto.createHash("sha256").update(String(x)).digest("hex"); }
function createPasswordReset(account, now) {
  const raw = crypto.randomBytes(24).toString("hex");
  account.passwordReset = { hash: sha256(raw), expiresAt: now + PASSWORD_RESET_TTL_MS };
  return raw;
}

// Anti-triche (comptes en double) : empreinte de l'adresse IP (jamais
// l'adresse elle-même), 5 dernières par compte — voir /api/admin/accounts/anticheat.
function ipFingerprint(req) {
  return sha256(`${process.env.ANTI_CHEAT_SALT || "hoop-manager"}:${clientIp(req)}`).slice(0, 16);
}
function recordIp(account, req, now) {
  const fp = ipFingerprint(req);
  const list = (account.ipSeen || []).filter(x => x.fp !== fp);
  list.unshift({ fp, at: now });
  account.ipSeen = list.slice(0, 5);
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const PENDING_SIGNUP_TTL_MS = 30 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 20;

// États OAuth et inscriptions Discord en attente de nom de club : en
// mémoire (un seul process). Un redémarrage pendant le va-et-vient avec
// Discord oblige seulement à recliquer.
const oauthStates = new Map();
const pendingDiscordSignups = new Map();
const rateBuckets = new Map();

// Indirection injectable pour les tests (aucun appel réseau réel).
let fetchImpl = (...args) => fetch(...args);
function _setFetchImplForTests(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }
function _resetMemoryForTests() { oauthStates.clear(); pendingDiscordSignups.clear(); rateBuckets.clear(); }

function discordConfigured() {
  return !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

// Code d'invitation (retour utilisateur 2026-09-29 : « ajoute un code
// d'invitation sur la page d'inscription pour le moment », puis le
// 2026-09-30 : « ajoute un code d'invitation sur le jeu : BuzzerBeater ») :
// toute NOUVELLE inscription (email ou 1re connexion Discord) doit fournir
// un code valable ; casse et espaces ignorés. Par défaut DEFAULT_INVITE_CODE ;
// BASKET_INVITE_CODE le remplace (plusieurs codes séparés par des virgules),
// et BASKET_INVITE_CODE=off rouvre les inscriptions à tous. La connexion
// d'un compte existant n'est jamais concernée. Depuis le 2026-10-02 (retour
// utilisateur : « enlève le code d'invitation ») : inscriptions ouvertes par
// défaut ; BASKET_INVITE_CODE peut toujours en exiger un.
const DEFAULT_INVITE_CODE = "";
function inviteCodes() {
  const raw = process.env.BASKET_INVITE_CODE;
  const value = raw == null || raw.trim() === "" ? DEFAULT_INVITE_CODE : raw;
  if (!value.trim() || /^(off|aucun|none|0)$/i.test(value.trim())) return [];
  return value.split(",").map(c => c.trim().toLowerCase()).filter(Boolean);
}
function inviteRequired() { return inviteCodes().length > 0; }
function inviteCodeValid(raw) {
  const codes = inviteCodes();
  if (!codes.length) return true;
  const given = String(raw || "").trim().toLowerCase();
  return !!given && codes.some(c => c.length === given.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(given)));
}

function isPublicSite() {
  return process.env.BASKET_PUBLIC_SITE === "1";
}

function randomHex(bytes) { return crypto.randomBytes(bytes).toString("hex"); }

function pruneExpired(map, ttl, now) {
  for (const [k, v] of map) if (now - v.createdAt > ttl) map.delete(k);
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "?";
}

function rateLimited(req, now) {
  const ip = clientIp(req);
  const b = rateBuckets.get(ip);
  if (!b || now > b.resetAt) { rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS }); return false; }
  b.count += 1;
  return b.count > RATE_MAX;
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (typeof raw !== "string") return out;
  raw.split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function redirect(res, location, extraHeaders = {}) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store", ...extraHeaders });
  res.end();
}

function redirectUri(req, originFor) {
  return process.env.DISCORD_REDIRECT_URI || `${originFor(req)}/auth/discord/callback`;
}

// Réponse commune d'une connexion réussie (voir en-tête).
function sessionPayload(account) {
  return account.managerToken
    ? { ok: true, status: "active", managerToken: account.managerToken }
    : { ok: true, status: "waiting", accountKey: account.accountKey };
}

// Donne un club à un compte qui n'en a pas encore (inscription, ou compte
// en liste d'attente qui revient) — championnats par pays (2026-09-28, voir
// server/world.js) : dans le pays choisi, le championnat le PLUS HAUT qui a
// encore un club CPU ; si le pays est plein, un nouveau championnat est
// ouvert (plus de liste d'attente tant que la pyramide n'est pas complète).
// Sauvegarde elle-même le championnat et le registre ; l'appelant
// sauvegarde les comptes.
async function tryAssignClub(account, multiSavePath, now) {
  if (account.managerToken) return false;
  const world = await World.loadWorld(multiSavePath, now);
  if (!world) return false;
  // Club rendu à l'IA pendant une longue absence (voir
  // World.releaseInactiveManagers) : récupéré s'il est toujours à l'IA.
  if (account.releasedClub) {
    const token = await World.reclaimClub(world, multiSavePath, account.releasedClub, now);
    account.releasedClub = null;
    if (token) {
      account.managerToken = token;
      account.assignedAt = now;
      return true;
    }
  }
  let name = account.requestedClubName;
  // Nom pris entre-temps par un autre club : on ajoute un numéro plutôt que
  // de bloquer le joueur.
  if (!name || await World.isClubNameTakenInWorld(world, multiSavePath, name)) {
    const base = (name || "Club").slice(0, Accounts.CLUB_NAME_MAX_LENGTH - 3);
    for (let i = 2; i < 100; i++) {
      const candidate = `${base} ${i}`;
      if (!await World.isClubNameTakenInWorld(world, multiSavePath, candidate)) { name = candidate; break; }
    }
  }
  const taken = await World.assignClub(world, multiSavePath, { country: account.requestedCountry || World.DEFAULT_COUNTRY, clubName: name, now });
  if (!taken.ok) return false;
  account.managerToken = taken.token;
  account.assignedAt = now;
  return true;
}

// Pseudo de manager par défaut (2026-09-30, voir Engine.checkManagerPseudo) :
// les comptes n'ont pas d'identifiant de connexion (email ou Discord) ; seul
// l'identifiant Discord (`username`, déjà public, jamais le nom affiché qui
// peut être un nom réel) peut servir de pseudo — adopté UNE fois, s'il est
// valide et libre, sans compter comme le choix du manager (le premier
// changement reste libre). Sinon « Manager de <club> » jusqu'à ce qu'il en
// choisisse un (Paramètres › Mon compte).
async function defaultPseudoFromDiscord(account, token, multiSavePath, now) {
  const checked = Engine.checkManagerPseudo(String(account.discordUsername || "").slice(0, Engine.MANAGER_PSEUDO_MAX_LENGTH));
  if (checked.error) return false;
  const world = await World.loadWorld(multiSavePath, now);
  const found = world ? await World.findTeamByToken(world, token, multiSavePath) : null;
  if (!found) return false;
  const team = found.league.teams[found.teamIndex];
  if (!team || !team.isHuman || team.managerPseudo) return false;
  if (await World.isManagerPseudoTakenInWorld(world, multiSavePath, checked.value)) return false;
  team.managerPseudo = checked.value;
  await store.saveMultiLeague(found.league, multiSavePath);
  return true;
}

// Met à jour le nom de toutes les références { leagueId, idx, name } à un
// club dans `obj` (tableaux et objets simples, en profondeur). Renvoie true
// si au moins une a changé.
function renameClubRefs(obj, leagueId, idx, name, seen = new Set()) {
  if (!obj || typeof obj !== "object" || seen.has(obj)) return false;
  seen.add(obj);
  let changed = false;
  if (obj.leagueId === leagueId && obj.idx === idx && typeof obj.name === "string" && obj.name !== name) {
    obj.name = name;
    changed = true;
  }
  for (const v of Array.isArray(obj) ? obj : Object.values(obj)) {
    if (renameClubRefs(v, leagueId, idx, name, seen)) changed = true;
  }
  return changed;
}

function createAccountRouter({ sendJson, readJsonBody, getManagerToken, originFor, isAdminAuthorized, multiSavePath, accountsPath }) {
  async function withAccounts(fn) {
    const data = await Accounts.loadAccounts(accountsPath);
    return fn(data);
  }

  async function body(req, res) {
    try { return await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, code: "bad-request", error: e.message }); return null; }
  }

  // Places libres : avec les championnats par pays, un nouveau championnat
  // s'ouvre dès qu'un pays est plein — il y a donc toujours de la place tant
  // qu'un monde existe (et pas du tout sans ligue partagée).
  // Pseudo par défaut depuis l'identifiant Discord, une seule tentative par
  // identifiant connu (voir defaultPseudoFromDiscord).
  async function adoptDiscordPseudo(account, now) {
    if (!account || !account.managerToken || !account.discordUsername) return false;
    if (account.pseudoDefaultTried === account.discordUsername) return false;
    account.pseudoDefaultTried = account.discordUsername;
    try { return await defaultPseudoFromDiscord(account, account.managerToken, multiSavePath, now); } catch (e) { return false; }
  }

  function openSlots(multi) {
    return multi ? Math.max(1, multi.league.teams.filter(t => !t.isHuman).length) : 0;
  }

  // Finalise une inscription (email ou Discord) : crée le compte, tente
  // l'attribution d'un club, sauvegarde. `fields` déjà validés.
  async function registerAccount(data, fields, now) {
    const account = Accounts.createAccount(data, fields, now);
    await tryAssignClub(account, multiSavePath, now);
    await Accounts.saveAccounts(data, accountsPath);
    return account;
  }

  // Vérifie un nom de club demandé contre la ligue actuelle.
  async function checkClubName(raw) {
    const name = Accounts.normalizeClubName(raw);
    if (!name) return { code: "club-invalid" };
    const world = await World.loadWorld(multiSavePath);
    if (await World.isClubNameTakenInWorld(world, multiSavePath, name)) return { code: "club-taken" };
    return { value: name };
  }

  return async function handleAccountRoutes(req, res, route, now) {
    const p = route.pathname;
    const isAccountRoute = p.startsWith("/api/account/") || p.startsWith("/auth/discord") || p.startsWith("/api/admin/accounts");
    if (!isAccountRoute) return false;
    pruneExpired(oauthStates, OAUTH_STATE_TTL_MS, now);
    pruneExpired(pendingDiscordSignups, PENDING_SIGNUP_TTL_MS, now);

    if (p === "/api/account/config" && req.method === "GET") {
      const multi = await store.loadMultiLeague(multiSavePath);
      sendJson(res, 200, {
        ok: true,
        discord: discordConfigured(),
        discordInvite: process.env.DISCORD_INVITE_URL || null,
        publicSite: isPublicSite(),
        openSlots: openSlots(multi),
        countries: World.publicCountries(),
        // Pays proposé d'office à l'inscription, d'après l'IP (server/geoip.js) :
        // null hors des pays ouverts (le site prend alors la langue du navigateur).
        suggestedCountry: (c => (World.isOpenCountry(c) ? c : null))(GeoIp.countryFromRequest(req)),
        passwordMinLength: Accounts.PASSWORD_MIN_LENGTH,
        passwordResetByMail: Mailer.mailConfigured(),
        clubNameMaxLength: Accounts.CLUB_NAME_MAX_LENGTH,
        inviteRequired: inviteRequired(),
      });
      return true;
    }

    // ---------------- Inscription email/mot de passe ----------------
    if (p === "/api/account/signup" && req.method === "POST") {
      if (rateLimited(req, now)) { sendJson(res, 429, { ok: false, code: "rate-limited" }); return true; }
      const b = await body(req, res); if (!b) return true;
      if (!inviteCodeValid(b.inviteCode)) { sendJson(res, 403, { ok: false, code: "invite-invalid" }); return true; }
      const email = Accounts.normalizeEmail(b.email);
      if (!email) { sendJson(res, 400, { ok: false, code: "email-invalid" }); return true; }
      const pw = Accounts.validatePassword(b.password);
      if (pw.error) { sendJson(res, 400, { ok: false, code: pw.error }); return true; }
      const club = await checkClubName(b.clubName);
      if (club.code) { sendJson(res, 400, { ok: false, code: club.code }); return true; }
      await withAccounts(async data => {
        if (Accounts.findByEmail(data, email)) { sendJson(res, 409, { ok: false, code: "email-taken" }); return; }
        const account = await registerAccount(data, { email, passwordHash: Accounts.hashPassword(pw.value), lang: b.lang, detectedLang: I18n.hintFromRequest(req, b.lang), requestedClubName: club.value, requestedCountry: signupCountry(req, b) }, now);
        // Parrainage : lien /bienvenue?ref=<code> (server/referrals.js).
        Referrals.attachAtSignup(data, account, b.ref, ipFingerprint(req), now);
        recordIp(account, req, now);
        await Accounts.saveAccounts(data, accountsPath);
        sendJson(res, 200, sessionPayload(account));
      });
      return true;
    }

    // ---------------- Connexion email/mot de passe ----------------
    if (p === "/api/account/login" && req.method === "POST") {
      if (rateLimited(req, now)) { sendJson(res, 429, { ok: false, code: "rate-limited" }); return true; }
      const b = await body(req, res); if (!b) return true;
      const email = Accounts.normalizeEmail(b.email);
      await withAccounts(async data => {
        const account = Accounts.findByEmail(data, email);
        if (!account || !account.passwordHash || !Accounts.verifyPassword(b.password, account.passwordHash)) {
          sendJson(res, 401, { ok: false, code: "bad-credentials" });
          return;
        }
        account.lastLoginAt = now;
        recordIp(account, req, now);
        if (!account.lang && Accounts.normalizeLang(b.lang)) account.lang = b.lang;
        Accounts.noteDetectedLang(account, I18n.hintFromRequest(req, b.lang));
        if (!account.managerToken) {
          await tryAssignClub(account, multiSavePath, now);
        }
        await Accounts.saveAccounts(data, accountsPath);
        sendJson(res, 200, sessionPayload(account));
      });
      return true;
    }

    // ---------------- Liste d'attente ----------------
    if (p === "/api/account/status" && req.method === "GET") {
      const key = req.headers["x-account-key"];
      await withAccounts(async data => {
        const account = Accounts.findByAccountKey(data, key);
        if (!account) { sendJson(res, 401, { ok: false, code: "unknown-account" }); return; }
        if (!account.managerToken) {
          if (await tryAssignClub(account, multiSavePath, now)) await Accounts.saveAccounts(data, accountsPath);
        }
        sendJson(res, 200, { ...sessionPayload(account), account: Accounts.publicView(account) });
      });
      return true;
    }

    // ---------------- Parrainage et badge « Amis » (2026-10-07) ----------------
    // GET : code, lien, filleuls et avancement ; met à jour les filleuls en
    // attente (au plus toutes les 10 min) et recopie le nombre de filleuls
    // validés sur le club du parrain (team.friendsReferrals, badge public).
    if (p === "/api/account/referral" && req.method === "GET") {
      const token = getManagerToken(req);
      if (!token) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
      await withAccounts(async data => {
        const account = Accounts.findByManagerToken(data, token);
        if (!account) { sendJson(res, 404, { ok: false, code: "no-account", error: "Aucun compte n'est rattaché à ce club." }); return; }
        let dirty = !account.referralCode;
        Referrals.codeFor(data, account);
        const world = await World.loadWorld(multiSavePath, now);
        if (world && Referrals.needsCheck(account, now)) {
          const findClub = async tok => { const f = await World.findTeamByToken(world, tok, multiSavePath); return f ? f.league.teams[f.teamIndex] : null; };
          await Referrals.evaluate(data, account, findClub, now);
          dirty = true;
        }
        if (dirty) await Accounts.saveAccounts(data, accountsPath);
        const out = Referrals.summary(data, account, originFor(req));
        // Badge public : recopié sur le club du parrain s'il a changé.
        if (world) {
          try {
            const mine = await World.findTeamByToken(world, token, multiSavePath);
            const team = mine && mine.league.teams[mine.teamIndex];
            if (team && team.isHuman && (team.friendsReferrals || 0) !== out.validated) {
              team.friendsReferrals = out.validated;
              await store.saveMultiLeague(mine.league, multiSavePath);
              out.synced = true;
            }
          } catch (e) { /* badge resynchronisé à la prochaine visite */ }
        }
        sendJson(res, 200, out);
      });
      return true;
    }

    // ---------------- Compte du manager connecté (dans le jeu) ----------------
    if (p === "/api/account/me" && req.method === "GET") {
      const token = getManagerToken(req);
      if (!token) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
      await withAccounts(async data => {
        const account = Accounts.findByManagerToken(data, token);
        if (account && !(account.ipSeen || []).some(x => x.fp === ipFingerprint(req))) { recordIp(account, req, now); await Accounts.saveAccounts(data, accountsPath); }
        // Langue du navigateur notée pour les emails et notifications
        // (Accounts.langFor) ; sauvegarde seulement si elle change.
        if (account && !account.lang && Accounts.noteDetectedLang(account, I18n.hintFromRequest(req))) await Accounts.saveAccounts(data, accountsPath);
        if (account && !account.pseudoDefaultTried && account.discordUsername) {
          await adoptDiscordPseudo(account, now);
          await Accounts.saveAccounts(data, accountsPath);
        }
        sendJson(res, 200, { ok: true, account: account ? Accounts.publicView(account) : null, discord: discordConfigured() });
      });
      return true;
    }

    // Langue du compte (voir Accounts.langFor) : { lang: "fr" | "en" | "it" }.
    // Manager arrivé par un simple lien privé, sans compte : rien à
    // enregistrer (persisted:false), le navigateur garde son choix.
    if (p === "/api/account/lang" && req.method === "POST") {
      const token = getManagerToken(req);
      if (!token) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
      const b = await body(req, res); if (!b) return true;
      const lang = Accounts.normalizeLang(b.lang);
      if (!lang) { sendJson(res, 400, { ok: false, code: "lang-invalid" }); return true; }
      await withAccounts(async data => {
        const account = Accounts.findByManagerToken(data, token);
        if (!account) { sendJson(res, 200, { ok: true, lang, persisted: false }); return; }
        if (account.lang !== lang) { account.lang = lang; await Accounts.saveAccounts(data, accountsPath); }
        sendJson(res, 200, { ok: true, lang, persisted: true });
      });
      return true;
    }

    // Affichage des notes (fiche joueur) : { mode: "gen" | "tc" }, sur le
    // compte (retour utilisateur 2026-10-03). Sans compte : persisted:false.
    if (p === "/api/account/rating-mode" && req.method === "POST") {
      const token = getManagerToken(req);
      if (!token) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
      const b = await body(req, res); if (!b) return true;
      if (b.mode !== "gen" && b.mode !== "tc") { sendJson(res, 400, { ok: false, code: "mode-invalid" }); return true; }
      await withAccounts(async data => {
        const account = Accounts.findByManagerToken(data, token);
        if (!account) { sendJson(res, 200, { ok: true, mode: b.mode, persisted: false }); return; }
        if ((account.ratingMode || "gen") !== b.mode) { account.ratingMode = b.mode; await Accounts.saveAccounts(data, accountsPath); }
        sendJson(res, 200, { ok: true, mode: b.mode, persisted: true });
      });
      return true;
    }

    // Manager existant (lien privé, sans compte) qui se crée des
    // identifiants — ou compte Discord seul qui ajoute un mot de passe.
    if (p === "/api/account/claim" && req.method === "POST") {
      if (rateLimited(req, now)) { sendJson(res, 429, { ok: false, code: "rate-limited" }); return true; }
      const token = getManagerToken(req);
      if (!token) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
      const claimWorld = await World.loadWorld(multiSavePath, now);
      if (!await World.findTeamByToken(claimWorld, token, multiSavePath)) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
      const b = await body(req, res); if (!b) return true;
      const email = Accounts.normalizeEmail(b.email);
      if (!email) { sendJson(res, 400, { ok: false, code: "email-invalid" }); return true; }
      const pw = Accounts.validatePassword(b.password);
      if (pw.error) { sendJson(res, 400, { ok: false, code: pw.error }); return true; }
      await withAccounts(async data => {
        const other = Accounts.findByEmail(data, email);
        let account = Accounts.findByManagerToken(data, token);
        if (other && other !== account) { sendJson(res, 409, { ok: false, code: "email-taken" }); return; }
        if (!account) account = Accounts.createAccount(data, { managerToken: token }, now);
        account.email = email;
        account.passwordHash = Accounts.hashPassword(pw.value);
        await Accounts.saveAccounts(data, accountsPath);
        sendJson(res, 200, { ok: true, account: Accounts.publicView(account) });
      });
      return true;
    }

    // ---------------- Mot de passe oublié ----------------
    // Réponse identique que le compte existe ou non (ne révèle pas quels
    // emails sont inscrits).
    if (p === "/api/account/password-forgot" && req.method === "POST") {
      if (rateLimited(req, now)) { sendJson(res, 429, { ok: false, code: "rate-limited" }); return true; }
      const b = await body(req, res); if (!b) return true;
      const email = Accounts.normalizeEmail(b.email);
      if (!email) { sendJson(res, 400, { ok: false, code: "email-invalid" }); return true; }
      let link = null;
      let lang = "fr";
      await withAccounts(async data => {
        const account = Accounts.findByEmail(data, email);
        if (!account) return;
        const raw = createPasswordReset(account, now);
        await Accounts.saveAccounts(data, accountsPath);
        // Langue de l'email (Accounts.langFor) : celle du compte, sinon celle
        // détectée de son navigateur, sinon celle de la page d'où part la
        // demande (`lang` envoyé par /bienvenue, puis Accept-Language),
        // sinon celle du pays de son club, sinon l'anglais. Le lien rouvre
        // la page d'accueil dans la même langue.
        const country = account.requestedCountry || (account.managerToken ? World.DEFAULT_COUNTRY : null);
        lang = I18n.langFor(account, I18n.hintFromRequest(req, b.lang), country);
        link = `${originFor(req)}/bienvenue${lang === "fr" ? "" : `?lang=${lang}`}#reinit=${raw}`;
      });
      if (link) {
        const sent = await Mailer.sendMail({ to: email, ...Mailer.compose("passwordReset", lang, { link }) });
        if (!sent.ok) console.log(`[comptes] lien de réinitialisation pour ${email} (email non envoyé : ${sent.error}) : ${link}`);
      }
      sendJson(res, 200, { ok: true, byMail: Mailer.mailConfigured() });
      return true;
    }

    if (p === "/api/account/password-reset" && req.method === "POST") {
      if (rateLimited(req, now)) { sendJson(res, 429, { ok: false, code: "rate-limited" }); return true; }
      const b = await body(req, res); if (!b) return true;
      const pw = Accounts.validatePassword(b.password);
      if (pw.error) { sendJson(res, 400, { ok: false, code: pw.error }); return true; }
      const hash = typeof b.token === "string" && b.token ? sha256(b.token) : null;
      await withAccounts(async data => {
        const account = hash ? data.accounts.find(a => a.passwordReset && a.passwordReset.hash === hash) : null;
        if (!account || account.passwordReset.expiresAt < now) { sendJson(res, 400, { ok: false, code: "reset-expired" }); return; }
        account.passwordHash = Accounts.hashPassword(pw.value);
        delete account.passwordReset;
        account.lastLoginAt = now;
        recordIp(account, req, now);
        if (!account.managerToken) await tryAssignClub(account, multiSavePath, now);
        await Accounts.saveAccounts(data, accountsPath);
        sendJson(res, 200, sessionPayload(account));
      });
      return true;
    }

    // ---------------- Suppression du compte ----------------
    // Depuis le jeu (Paramètres → Mon compte) : confirmation écrite
    // « SUPPRIMER » (+ mot de passe si le compte en a un). Le club est rendu
    // à l'IA (World.releaseClubToCpu), le compte est effacé.
    if (p === "/api/account/delete" && req.method === "POST") {
      if (rateLimited(req, now)) { sendJson(res, 429, { ok: false, code: "rate-limited" }); return true; }
      const token = getManagerToken(req);
      if (!token) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
      const b = await body(req, res); if (!b) return true;
      if (String(b.confirm || "").trim().toUpperCase() !== "SUPPRIMER") { sendJson(res, 400, { ok: false, code: "confirm-required" }); return true; }
      const world = await World.loadWorld(multiSavePath, now);
      const found = world ? await World.findTeamByToken(world, token, multiSavePath) : null;
      if (!found) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
      await withAccounts(async data => {
        const account = Accounts.findByManagerToken(data, token);
        if (account && account.passwordHash && !Accounts.verifyPassword(b.password, account.passwordHash)) { sendJson(res, 401, { ok: false, code: "bad-credentials" }); return; }
        World.releaseClubToCpu(world, found.league, found.teamIndex, now, "deleted");
        await store.saveMultiLeague(found.league, multiSavePath);
        await World.saveWorld(world, multiSavePath);
        if (account) {
          data.accounts = data.accounts.filter(a => a !== account);
          await Accounts.saveAccounts(data, accountsPath);
        }
        sendJson(res, 200, { ok: true });
      });
      return true;
    }

    // ---------------- Discord ----------------
    if (p.startsWith("/auth/discord") || p.startsWith("/api/account/discord")) {
      if (!discordConfigured()) { sendJson(res, 404, { ok: false, code: "discord-disabled" }); return true; }
    }

    if (p === "/api/account/discord-link-start" && req.method === "POST") {
      const token = getManagerToken(req);
      const linkWorld = token ? await World.loadWorld(multiSavePath, now) : null;
      if (!linkWorld || !await World.findTeamByToken(linkWorld, token, multiSavePath)) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
      const nonce = randomHex(16);
      oauthStates.set(nonce, { intent: "link", managerToken: token, createdAt: now });
      sendJson(res, 200, { ok: true, url: `/auth/discord?n=${nonce}` });
      return true;
    }

    if (p === "/auth/discord" && req.method === "GET") {
      let nonce = route.searchParams.get("n");
      if (!nonce || !oauthStates.has(nonce)) {
        nonce = randomHex(16);
        oauthStates.set(nonce, { intent: "login", createdAt: now });
      }
      const secure = originFor(req).startsWith("https:") ? "; Secure" : "";
      const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        response_type: "code",
        redirect_uri: redirectUri(req, originFor),
        scope: "identify",
        state: nonce,
      });
      redirect(res, `https://discord.com/oauth2/authorize?${params}`, {
        "Set-Cookie": `hm_oauth=${nonce}; Path=/auth/discord; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
      });
      return true;
    }

    if (p === "/auth/discord/callback" && req.method === "GET") {
      const state = route.searchParams.get("state");
      const code = route.searchParams.get("code");
      const cookies = parseCookies(req);
      const clearCookie = { "Set-Cookie": "hm_oauth=; Path=/auth/discord; Max-Age=0" };
      const saved = state ? oauthStates.get(state) : null;
      // Cookie hm_oauth (anti-CSRF) : exigé pour la connexion. Pour la
      // LIAISON (intent « link »), l'état est déjà lié côté serveur au
      // jeton du manager qui l'a demandé (discord-link-start) ; le retour de
      // Discord arrive souvent dans un AUTRE contexte que celui qui a posé
      // le cookie (iPhone : l'appli Discord intercepte discord.com puis
      // rouvre le retour dans son navigateur intégré ; appli iOS/Android :
      // navigateur système ; PWA installée : cookies séparés de Safari), d'où
      // la page blanche puis « expirée ». Cookie absent accepté pour la
      // liaison seulement ; un cookie DIFFÉRENT reste refusé.
      const cookieOk = cookies.hm_oauth === state || (saved && saved.intent === "link" && !cookies.hm_oauth);
      if (!saved || !cookieOk) { redirect(res, "/bienvenue#erreur=discord-expired", clearCookie); return true; }
      const otherContext = cookies.hm_oauth !== state;
      oauthStates.delete(state);
      const back = saved.intent === "link" ? "/" : "/bienvenue";
      if (!code) { redirect(res, `${back}#erreur=discord-cancelled`, clearCookie); return true; }

      let discordUser;
      try {
        const tokenRes = await fetchImpl("https://discord.com/api/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri(req, originFor),
          }).toString(),
        });
        if (!tokenRes.ok) throw new Error(`token HTTP ${tokenRes.status}`);
        const tok = await tokenRes.json();
        const meRes = await fetchImpl("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tok.access_token}` } });
        if (!meRes.ok) throw new Error(`users/@me HTTP ${meRes.status}`);
        const me = await meRes.json();
        if (!me || !me.id) throw new Error("réponse Discord sans id");
        // `username` : l'identifiant Discord (un pseudo, jamais un nom réel
        // affiché) — seule source possible d'un pseudo de manager par défaut
        // (voir defaultPseudoFromDiscord) ; `global_name` peut être un vrai nom.
        discordUser = { id: String(me.id), name: me.global_name || me.username || "Discord", username: typeof me.username === "string" ? me.username : null };
      } catch (e) {
        console.warn("Connexion Discord échouée :", e.message);
        redirect(res, `${back}#erreur=discord-failed`, clearCookie);
        return true;
      }

      await withAccounts(async data => {
        const existing = Accounts.findByDiscordId(data, discordUser.id);
        if (saved.intent === "link") {
          const mine = Accounts.findByManagerToken(data, saved.managerToken);
          if (existing && existing !== mine) { redirect(res, "/#erreur=discord-already-linked", clearCookie); return; }
          const account = mine || Accounts.createAccount(data, { managerToken: saved.managerToken }, now);
          account.discordId = discordUser.id;
          account.discordName = discordUser.name;
          account.discordUsername = discordUser.username;
          Accounts.noteDetectedLang(account, I18n.hintFromRequest(req));
          await adoptDiscordPseudo(account, now);
          await Accounts.saveAccounts(data, accountsPath);
          // Autre navigateur que celui du jeu : pas de jeton ici, on
          // l'annonce sur la page d'accueil (retour dans le jeu à faire à la main).
          redirect(res, otherContext ? "/bienvenue#info=discord-linked" : "/#compte=discord-lie", clearCookie);
          return;
        }
        if (existing) {
          existing.discordName = discordUser.name;
          existing.discordUsername = discordUser.username;
          existing.lastLoginAt = now;
          Accounts.noteDetectedLang(existing, I18n.hintFromRequest(req));
          if (!existing.managerToken) {
            await tryAssignClub(existing, multiSavePath, now);
          }
          // Comptes Discord d'avant le 2026-09-30 : l'identifiant n'était pas
          // gardé, il l'est à cette connexion et sert de pseudo par défaut.
          await adoptDiscordPseudo(existing, now);
          await Accounts.saveAccounts(data, accountsPath);
          redirect(res, existing.managerToken ? `/?m=${existing.managerToken}` : `/bienvenue#attente=${existing.accountKey}`, clearCookie);
          return;
        }
        // Première connexion Discord : il reste à choisir un nom de club.
        const pending = randomHex(16);
        pendingDiscordSignups.set(pending, { discordId: discordUser.id, discordName: discordUser.name, discordUsername: discordUser.username, createdAt: now });
        redirect(res, `/bienvenue#discord=${pending}&nom=${encodeURIComponent(discordUser.name)}`, clearCookie);
      });
      return true;
    }

    if (p === "/api/account/discord-complete" && req.method === "POST") {
      const b = await body(req, res); if (!b) return true;
      const pending = typeof b.pending === "string" ? pendingDiscordSignups.get(b.pending) : null;
      if (!pending) { sendJson(res, 400, { ok: false, code: "discord-expired" }); return true; }
      if (!inviteCodeValid(b.inviteCode)) {
        // Compte Discord déjà existant (autre onglet) : pas de nouvelle inscription.
        const known = await withAccounts(async data => !!Accounts.findByDiscordId(data, pending.discordId));
        if (!known) { sendJson(res, 403, { ok: false, code: "invite-invalid" }); return true; }
      }
      const club = await checkClubName(b.clubName);
      if (club.code) { sendJson(res, 400, { ok: false, code: club.code }); return true; }
      await withAccounts(async data => {
        let account = Accounts.findByDiscordId(data, pending.discordId);
        if (!account) {
          account = await registerAccount(data, { discordId: pending.discordId, discordName: pending.discordName, discordUsername: pending.discordUsername || null, lang: b.lang, detectedLang: I18n.hintFromRequest(req, b.lang), requestedClubName: club.value, requestedCountry: signupCountry(req, b) }, now);
          // Parrainage (nouveau compte seulement, jamais après coup).
          if (Referrals.attachAtSignup(data, account, b.ref, ipFingerprint(req), now)) {
            recordIp(account, req, now);
            await Accounts.saveAccounts(data, accountsPath);
          }
        }
        pendingDiscordSignups.delete(b.pending);
        sendJson(res, 200, sessionPayload(account));
      });
      return true;
    }

    // ---------------- Admin ----------------
    if (p === "/api/admin/accounts" && req.method === "GET") {
      if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return true; }
      // Tous championnats confondus (voir server/world.js).
      const world = await World.loadWorld(multiSavePath, now);
      const clubByToken = new Map();
      for (const entry of (world ? world.leagues : [])) {
        const league = await World.loadLeague(world, entry.id, multiSavePath);
        (league ? league.teams : []).forEach(t => { if (t.isHuman && t.managerLinkToken) clubByToken.set(t.managerLinkToken, { name: t.name, leagueId: entry.id }); });
      }
      await withAccounts(async data => {
        const clubOf = token => (token && clubByToken.has(token) ? clubByToken.get(token).name : null);
        sendJson(res, 200, {
          ok: true,
          accounts: data.accounts.map(a => ({
            email: a.email, discordName: a.discordName, club: clubOf(a.managerToken),
            leagueId: a.managerToken && clubByToken.has(a.managerToken) ? clubByToken.get(a.managerToken).leagueId : null,
            waiting: !a.managerToken, requestedClubName: a.requestedClubName,
            createdAt: a.createdAt, lastLoginAt: a.lastLoginAt,
          })),
        });
      });
      return true;
    }

    // Lien de réinitialisation à transmettre à la main (sans envoi d'email).
    if (p === "/api/admin/accounts/password-reset-link" && req.method === "POST") {
      if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return true; }
      const b = await body(req, res); if (!b) return true;
      const email = Accounts.normalizeEmail(b.email);
      await withAccounts(async data => {
        const account = Accounts.findByEmail(data, email);
        if (!account) { sendJson(res, 404, { ok: false, error: "Aucun compte avec cet email." }); return; }
        const raw = createPasswordReset(account, now);
        await Accounts.saveAccounts(data, accountsPath);
        sendJson(res, 200, { ok: true, link: `${originFor(req)}/bienvenue#reinit=${raw}`, expiresInMinutes: PASSWORD_RESET_TTL_MS / 60000 });
      });
      return true;
    }

    // Anti-triche : comptes qui partagent une adresse IP (empreinte), et
    // transferts suspects entre clubs de managers (voir League.
    // humanTransferLog : prix très bas, ou ventes répétées entre deux clubs).
    if (p === "/api/admin/accounts/anticheat" && req.method === "GET") {
      if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return true; }
      const world = await World.loadWorld(multiSavePath, now);
      const clubByToken = new Map();
      const transfers = [];
      for (const entry of (world ? world.leagues : [])) {
        const league = await World.loadLeague(world, entry.id, multiSavePath);
        if (!league) continue;
        league.teams.forEach(t => { if (t.isHuman && t.managerLinkToken) clubByToken.set(t.managerLinkToken, `${t.name} (${entry.id})`); });
        (league.humanTransferLog || []).forEach(x => transfers.push({ leagueId: entry.id, ...x }));
      }
      await withAccounts(async data => {
        const byFp = new Map();
        data.accounts.forEach(a => (a.ipSeen || []).forEach(x => {
          if (!byFp.has(x.fp)) byFp.set(x.fp, new Set());
          byFp.get(x.fp).add(a);
        }));
        const label = a => ({ email: a.email, discordName: a.discordName, club: clubByToken.get(a.managerToken) || null });
        const sharedIp = [...byFp.values()].filter(set => set.size > 1).map(set => [...set].map(label));
        sendJson(res, 200, { ok: true, sharedIp, suspiciousTransfers: Accounts.suspiciousTransfers(transfers, now) });
      });
      return true;
    }

    // Transmission d'un club à un nouveau manager (retour utilisateur,
    // 2026-09-29 : « j'ai des beta testers qui ne sont pas suffisamment
    // dispo donc je vais les remplacer ») : le club est gardé TEL QUEL
    // (effectif, budget, palmarès), seul son manager change. Nouveau jeton
    // privé (l'ancien lien ne marche plus, ses messages privés restent
    // attachés à l'ancien jeton), nouveau nom facultatif, tutoriel d'accueil
    // relancé, trigramme et nom de salle remis par défaut (ils reprennent
    // en général l'ancien nom), compte(s) de l'ancien manager supprimé(s).
    // Le lien renvoyé est à transmettre au remplaçant, qui se crée ensuite
    // ses identifiants (Paramètres → Mon compte, /api/account/claim).
    // Body : { club, newName?, leagueId? } — `leagueId` seulement si deux
    // clubs de managers portent le même nom dans deux championnats.
    if (p === "/api/admin/accounts/transfer-club" && req.method === "POST") {
      if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return true; }
      const b = await body(req, res); if (!b) return true;
      if (typeof b.club !== "string" || !b.club.trim()) { sendJson(res, 400, { ok: false, error: "'club' (nom actuel du club) requis." }); return true; }
      const world = await World.loadWorld(multiSavePath, now);
      if (!world) { sendJson(res, 404, { ok: false, error: "Aucune ligue partagée n'existe encore." }); return true; }
      const key = b.club.trim().toLocaleLowerCase("fr");
      const matches = [];
      const leagues = [];
      for (const entry of world.leagues) {
        const league = await World.loadLeague(world, entry.id, multiSavePath);
        if (!league) continue;
        leagues.push(league);
        if (b.leagueId && entry.id !== b.leagueId) continue;
        league.teams.forEach((t, idx) => {
          if (t.isHuman && (t.name || "").toLocaleLowerCase("fr") === key) matches.push({ league, idx, leagueId: entry.id });
        });
      }
      if (!matches.length) { sendJson(res, 404, { ok: false, error: `Aucun club de manager nommé "${b.club.trim()}".` }); return true; }
      if (matches.length > 1) { sendJson(res, 409, { ok: false, error: "Plusieurs clubs portent ce nom : précisez 'leagueId'.", leagueIds: matches.map(m => m.leagueId) }); return true; }
      const { league, idx, leagueId } = matches[0];
      const team = league.teams[idx];
      const previousName = team.name;
      let newName = previousName;
      if (b.newName != null && b.newName !== "") {
        newName = Accounts.normalizeClubName(b.newName);
        if (!newName) { sendJson(res, 400, { ok: false, error: "Nom de club invalide (lettres, chiffres, espaces, tirets, apostrophes)." }); return true; }
        const sameClub = newName.toLocaleLowerCase("fr") === previousName.toLocaleLowerCase("fr");
        if (!sameClub && await World.isClubNameTakenInWorld(world, multiSavePath, newName)) { sendJson(res, 409, { ok: false, error: `Le nom "${newName}" est déjà pris.` }); return true; }
      }

      const oldToken = team.managerLinkToken;
      if (oldToken && world.tokens) delete world.tokens[oldToken];
      team.managerLinkToken = Engine.randomHexToken(24);
      world.tokens[team.managerLinkToken] = leagueId;
      team.lastSeenAt = now;
      team.onboardingTourCompleted = false;
      team.trigram = null;
      team.trigramChangedAt = null;
      team.arenaName = null;
      // Nouveau manager : le pseudo de l'ancien ne le suit pas.
      team.managerPseudo = null;
      team.managerPseudoChangedAt = null;
      let friendliesChanged = false;
      const dirty = new Set([league]);
      if (newName !== previousName) {
        team.name = newName;
        // Références à ce club rangées par nom ailleurs (voir
        // World.reclaimClub, WorldMarket.resolveForeignTransfers,
        // WorldFriendlies.catchUp) : sans ça, une enchère ou un amical en
        // cours avec un autre championnat serait annulé.
        const rename = obj => renameClubRefs(obj, leagueId, idx, newName);
        leagues.forEach(lg => Object.keys(lg).forEach(k => { if (/Listings$/.test(k) && rename(lg[k])) dirty.add(lg); }));
        rename(world.cups);
        rename(world.superCups);
        const fstore = await store.loadWorldAuxRaw("friendlies", multiSavePath);
        if (fstore && rename(fstore)) {
          await store.saveWorldAuxRaw("friendlies", fstore, multiSavePath);
          friendliesChanged = true;
        }
        try {
          Engine.pushEntry(team.feed, {
            key: `club_renamed_${now}`, category: "club", priority: "info", week: team.week,
            title: `Le club s'appelle désormais ${newName}`,
            text: `Anciennement ${previousName}.`,
          });
        } catch (e) { /* le fil d'actus est un confort, jamais bloquant */ }
      }
      for (const lg of dirty) await store.saveMultiLeague(lg, multiSavePath);
      await World.saveWorld(world, multiSavePath);
      await withAccounts(async data => {
        const removed = oldToken ? data.accounts.filter(a => a.managerToken === oldToken) : [];
        data.accounts = data.accounts.filter(a => !removed.includes(a));
        await Accounts.saveAccounts(data, accountsPath);
        sendJson(res, 200, {
          ok: true, leagueId, previousName, club: team.name,
          deletedAccounts: removed.map(a => a.email || a.discordName || "(sans identifiant)"),
          friendliesUpdated: friendliesChanged,
          link: `${originFor(req)}/?m=${team.managerLinkToken}`,
        });
      });
      return true;
    }

    if (p === "/api/admin/accounts/reset-password" && req.method === "POST") {
      if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return true; }
      const b = await body(req, res); if (!b) return true;
      const email = Accounts.normalizeEmail(b.email);
      const pw = Accounts.validatePassword(b.newPassword);
      if (!email || pw.error) { sendJson(res, 400, { ok: false, error: "'email' valide et 'newPassword' (8 caractères min.) requis." }); return true; }
      await withAccounts(async data => {
        const account = Accounts.findByEmail(data, email);
        if (!account) { sendJson(res, 404, { ok: false, error: "Aucun compte avec cet email." }); return; }
        account.passwordHash = Accounts.hashPassword(pw.value);
        await Accounts.saveAccounts(data, accountsPath);
        sendJson(res, 200, { ok: true });
      });
      return true;
    }

    sendJson(res, 404, { ok: false, code: "not-found" });
    return true;
  };
}

module.exports = { createAccountRouter, discordConfigured, isPublicSite, _setFetchImplForTests, _resetMemoryForTests, _renameClubRefsForTests: renameClubRefs };
