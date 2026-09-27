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
// en liste d'attente qui revient). Modifie `multi.league` en place ; c'est
// l'appelant qui sauvegarde ligue ET comptes.
function tryAssignClub(account, multi, now) {
  if (account.managerToken || !multi) return false;
  let name = account.requestedClubName;
  // Nom pris entre-temps par un autre club : on ajoute un numéro plutôt que
  // de bloquer le joueur.
  if (!name || Accounts.isClubNameTaken(name, multi.league)) {
    const base = (name || "Club").slice(0, Accounts.CLUB_NAME_MAX_LENGTH - 3);
    for (let i = 2; i < 100; i++) {
      const candidate = `${base} ${i}`;
      if (!Accounts.isClubNameTaken(candidate, multi.league)) { name = candidate; break; }
    }
  }
  const taken = Accounts.takeOverCpuClub(multi.league, name);
  if (!taken.ok) return false;
  account.managerToken = taken.token;
  account.assignedAt = now;
  return true;
}

function createAccountRouter({ sendJson, readJsonBody, getManagerToken, originFor, isAdminAuthorized, multiSavePath, accountsPath }) {
  async function withAccounts(fn) {
    const data = await Accounts.loadAccounts(accountsPath);
    return fn(data);
  }

  async function body(req, res) {
    try { return await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, code: "bad-request", error: e.message }); return null; }
  }

  function openSlots(multi) {
    return multi ? multi.league.teams.filter(t => !t.isHuman).length : 0;
  }

  // Finalise une inscription (email ou Discord) : crée le compte, tente
  // l'attribution d'un club, sauvegarde. `fields` déjà validés.
  async function registerAccount(data, fields, now) {
    const multi = await store.loadMultiLeague(multiSavePath);
    const account = Accounts.createAccount(data, fields, now);
    const assigned = tryAssignClub(account, multi, now);
    if (assigned) await store.saveMultiLeague(multi.league, multiSavePath);
    await Accounts.saveAccounts(data, accountsPath);
    return account;
  }

  // Vérifie un nom de club demandé contre la ligue actuelle.
  async function checkClubName(raw) {
    const name = Accounts.normalizeClubName(raw);
    if (!name) return { code: "club-invalid" };
    const multi = await store.loadMultiLeague(multiSavePath);
    if (Accounts.isClubNameTaken(name, multi && multi.league)) return { code: "club-taken" };
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
        passwordMinLength: Accounts.PASSWORD_MIN_LENGTH,
        clubNameMaxLength: Accounts.CLUB_NAME_MAX_LENGTH,
      });
      return true;
    }

    // ---------------- Inscription email/mot de passe ----------------
    if (p === "/api/account/signup" && req.method === "POST") {
      if (rateLimited(req, now)) { sendJson(res, 429, { ok: false, code: "rate-limited" }); return true; }
      const b = await body(req, res); if (!b) return true;
      const email = Accounts.normalizeEmail(b.email);
      if (!email) { sendJson(res, 400, { ok: false, code: "email-invalid" }); return true; }
      const pw = Accounts.validatePassword(b.password);
      if (pw.error) { sendJson(res, 400, { ok: false, code: pw.error }); return true; }
      const club = await checkClubName(b.clubName);
      if (club.code) { sendJson(res, 400, { ok: false, code: club.code }); return true; }
      await withAccounts(async data => {
        if (Accounts.findByEmail(data, email)) { sendJson(res, 409, { ok: false, code: "email-taken" }); return; }
        const account = await registerAccount(data, { email, passwordHash: Accounts.hashPassword(pw.value), requestedClubName: club.value }, now);
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
        if (!account.managerToken) {
          const multi = await store.loadMultiLeague(multiSavePath);
          if (tryAssignClub(account, multi, now)) await store.saveMultiLeague(multi.league, multiSavePath);
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
          const multi = await store.loadMultiLeague(multiSavePath);
          if (tryAssignClub(account, multi, now)) {
            await store.saveMultiLeague(multi.league, multiSavePath);
            await Accounts.saveAccounts(data, accountsPath);
          }
        }
        sendJson(res, 200, { ...sessionPayload(account), account: Accounts.publicView(account) });
      });
      return true;
    }

    // ---------------- Compte du manager connecté (dans le jeu) ----------------
    if (p === "/api/account/me" && req.method === "GET") {
      const token = getManagerToken(req);
      if (!token) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
      await withAccounts(async data => {
        const account = Accounts.findByManagerToken(data, token);
        sendJson(res, 200, { ok: true, account: account ? Accounts.publicView(account) : null, discord: discordConfigured() });
      });
      return true;
    }

    // Manager existant (lien privé, sans compte) qui se crée des
    // identifiants — ou compte Discord seul qui ajoute un mot de passe.
    if (p === "/api/account/claim" && req.method === "POST") {
      if (rateLimited(req, now)) { sendJson(res, 429, { ok: false, code: "rate-limited" }); return true; }
      const token = getManagerToken(req);
      if (!token) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
      const multi = await store.loadMultiLeague(multiSavePath);
      if (!multi || !store.resolveManagerTeam(multi.league, token)) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
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

    // ---------------- Discord ----------------
    if (p.startsWith("/auth/discord") || p.startsWith("/api/account/discord")) {
      if (!discordConfigured()) { sendJson(res, 404, { ok: false, code: "discord-disabled" }); return true; }
    }

    if (p === "/api/account/discord-link-start" && req.method === "POST") {
      const token = getManagerToken(req);
      const multi = token ? await store.loadMultiLeague(multiSavePath) : null;
      if (!multi || !store.resolveManagerTeam(multi.league, token)) { sendJson(res, 401, { ok: false, code: "login-required" }); return true; }
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
      if (!saved || cookies.hm_oauth !== state) { redirect(res, "/bienvenue#erreur=discord-expired", clearCookie); return true; }
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
        discordUser = { id: String(me.id), name: me.global_name || me.username || "Discord" };
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
          await Accounts.saveAccounts(data, accountsPath);
          redirect(res, "/#compte=discord-lie", clearCookie);
          return;
        }
        if (existing) {
          existing.discordName = discordUser.name;
          existing.lastLoginAt = now;
          if (!existing.managerToken) {
            const multi = await store.loadMultiLeague(multiSavePath);
            if (tryAssignClub(existing, multi, now)) await store.saveMultiLeague(multi.league, multiSavePath);
          }
          await Accounts.saveAccounts(data, accountsPath);
          redirect(res, existing.managerToken ? `/?m=${existing.managerToken}` : `/bienvenue#attente=${existing.accountKey}`, clearCookie);
          return;
        }
        // Première connexion Discord : il reste à choisir un nom de club.
        const pending = randomHex(16);
        pendingDiscordSignups.set(pending, { discordId: discordUser.id, discordName: discordUser.name, createdAt: now });
        redirect(res, `/bienvenue#discord=${pending}&nom=${encodeURIComponent(discordUser.name)}`, clearCookie);
      });
      return true;
    }

    if (p === "/api/account/discord-complete" && req.method === "POST") {
      const b = await body(req, res); if (!b) return true;
      const pending = typeof b.pending === "string" ? pendingDiscordSignups.get(b.pending) : null;
      if (!pending) { sendJson(res, 400, { ok: false, code: "discord-expired" }); return true; }
      const club = await checkClubName(b.clubName);
      if (club.code) { sendJson(res, 400, { ok: false, code: club.code }); return true; }
      await withAccounts(async data => {
        let account = Accounts.findByDiscordId(data, pending.discordId);
        if (!account) {
          account = await registerAccount(data, { discordId: pending.discordId, discordName: pending.discordName, requestedClubName: club.value }, now);
        }
        pendingDiscordSignups.delete(b.pending);
        sendJson(res, 200, sessionPayload(account));
      });
      return true;
    }

    // ---------------- Admin ----------------
    if (p === "/api/admin/accounts" && req.method === "GET") {
      if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return true; }
      const multi = await store.loadMultiLeague(multiSavePath);
      await withAccounts(async data => {
        const clubOf = token => {
          const r = multi && token ? store.resolveManagerTeam(multi.league, token) : null;
          return r ? r.team.name : null;
        };
        sendJson(res, 200, {
          ok: true,
          accounts: data.accounts.map(a => ({
            email: a.email, discordName: a.discordName, club: clubOf(a.managerToken),
            waiting: !a.managerToken, requestedClubName: a.requestedClubName,
            createdAt: a.createdAt, lastLoginAt: a.lastLoginAt,
          })),
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

module.exports = { createAccountRouter, discordConfigured, isPublicSite, _setFetchImplForTests, _resetMemoryForTests };
