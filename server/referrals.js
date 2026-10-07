"use strict";
// Parrainage et badge « Amis » (demande du 2026-10-07).
//
// Chaque compte a un code personnel (account.referralCode) et un lien
// /bienvenue?ref=<code>. Un compte créé par ce lien garde, une fois pour
// toutes, `account.referredBy = { id, at, fp, status, reason, clubName,
// seasonsDone, validatedAt }` :
//   - "pending"   : en attente d'une saison COMPLÈTE jouée par le filleul ;
//   - "validated" : saison complète jouée, compte pour le badge ;
//   - "blocked"   : refusé (auto-parrainage, même connexion, limite…).
// Saison complète : team.achStats.seasons (fins de saison vécues depuis la
// reprise du club, remis à zéro à la reprise, voir accounts.js) >= 2 — la
// première, prise en cours de route, n'est pas complète.
//
// Anti-abus : le parrain ne peut pas être le filleul ; refus si le filleul
// s'inscrit depuis une connexion déjà vue chez le parrain (empreinte IP, voir
// accountRoutes.ipFingerprint) ou avec la même adresse email (alias Gmail
// compris) ; nouveau contrôle des connexions au moment de valider ; au plus
// MAX_PENDING filleuls en attente par parrain ; le lien de parrainage ne
// s'applique qu'à la création du compte (jamais après coup) ; un compte
// supprimé ou sans club ne compte jamais.
//
// Le nombre de filleuls validés est recopié sur le club du parrain
// (team.friendsReferrals) pour que le badge et ses récompenses
// (cosmétiques, voir FRIENDS_TIERS côté jeu) se voient sur son profil public.
const crypto = require("crypto");

const MAX_PENDING = 10;
const TIERS = [1, 2, 3];
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode() {
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}
function normalizeCode(raw) {
  const c = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length >= 6 && c.length <= 12 ? c : null;
}
// Code personnel du compte, créé à la première demande, unique.
function codeFor(data, account) {
  if (account.referralCode) return account.referralCode;
  const used = new Set((data.accounts || []).map(a => a.referralCode).filter(Boolean));
  let c = newCode();
  while (used.has(c)) c = newCode();
  account.referralCode = c;
  return c;
}
function findByCode(data, code) {
  const c = normalizeCode(code);
  return c ? (data.accounts || []).find(a => a.referralCode === c) || null : null;
}
// Email comparable : minuscules, sans « +étiquette », points ignorés chez Gmail.
function canonicalEmail(e) {
  const s = String(e || "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at < 1) return s;
  let local = s.slice(0, at).replace(/\+.*$/, "");
  const domain = s.slice(at + 1).replace(/^googlemail\.com$/, "gmail.com");
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}
function sharesConnection(a, b, extraFp) {
  const fps = new Set((a.ipSeen || []).map(x => x.fp).concat(extraFp ? [extraFp] : []));
  return (b.ipSeen || []).some(x => fps.has(x.fp));
}
function refereesOf(data, referrer) {
  return (data.accounts || []).filter(a => a.referredBy && a.referredBy.id === referrer.id && a.id !== referrer.id);
}

// À la création du compte (inscription email ou Discord). `fp` : empreinte de
// la connexion de l'inscription. Code inconnu : ignoré (inscription normale).
function attachAtSignup(data, account, code, fp, now) {
  if (!code || account.referredBy) return null;
  const ref = findByCode(data, code);
  if (!ref || ref.id === account.id) return null;
  let status = "pending", reason = null;
  if (fp && sharesConnection({ ipSeen: [{ fp }] }, ref)) { status = "blocked"; reason = "same-connection"; }
  else if (account.email && ref.email && canonicalEmail(account.email) === canonicalEmail(ref.email)) { status = "blocked"; reason = "same-email"; }
  else if (account.discordId && ref.discordId && account.discordId === ref.discordId) { status = "blocked"; reason = "self"; }
  else if (refereesOf(data, ref).filter(a => a.referredBy.status === "pending").length >= MAX_PENDING) { status = "blocked"; reason = "limit"; }
  account.referredBy = { id: ref.id, at: now, fp: fp || null, status, reason, clubName: account.requestedClubName || null, seasonsDone: 0, validatedAt: null };
  return account.referredBy;
}

// Met à jour les filleuls en attente d'un parrain (saisons jouées,
// validation). `findClub(token)` → Team | null (club actuel du filleul).
async function evaluate(data, referrer, findClub, now) {
  let changed = false;
  for (const a of refereesOf(data, referrer)) {
    const r = a.referredBy;
    if (r.status !== "pending" || !a.managerToken) continue;
    let team = null;
    try { team = await findClub(a.managerToken); } catch (e) { team = null; }
    if (!team) continue;
    const seasons = (team.achStats && team.achStats.seasons) || 0;
    const done = Math.max(0, seasons - 1);
    if (team.name && r.clubName !== team.name) { r.clubName = team.name; changed = true; }
    if (r.seasonsDone !== done) { r.seasonsDone = done; changed = true; }
    if (done >= 1) {
      // Dernier contrôle : comptes joués depuis la même connexion.
      if (sharesConnection(a, referrer)) { r.status = "blocked"; r.reason = "same-connection"; }
      else { r.status = "validated"; r.validatedAt = now; }
      changed = true;
    }
  }
  referrer.referralCheckedAt = now;
  return changed;
}
function needsCheck(referrer, now) {
  return !referrer.referralCheckedAt || now - referrer.referralCheckedAt >= CHECK_INTERVAL_MS;
}
function validatedCount(data, referrer) {
  return refereesOf(data, referrer).filter(a => a.referredBy.status === "validated").length;
}
// Vue du parrain (réglages > Compte, profil) : jamais d'email ni d'identifiant
// du filleul, seulement le nom de son club et l'avancement.
function summary(data, referrer, origin) {
  const code = codeFor(data, referrer);
  const list = refereesOf(data, referrer)
    .sort((x, y) => (y.referredBy.at || 0) - (x.referredBy.at || 0))
    .slice(0, 30)
    .map(a => ({ club: a.referredBy.clubName || null, at: a.referredBy.at, status: a.referredBy.status, reason: a.referredBy.reason || null, seasonsDone: a.referredBy.seasonsDone || 0, validatedAt: a.referredBy.validatedAt || null, active: !!a.managerToken }));
  const validated = validatedCount(data, referrer);
  const tier = TIERS.filter(t => validated >= t).length;
  const next = TIERS.find(t => validated < t) || null;
  return {
    ok: true, code, link: `${origin || ""}/bienvenue?ref=${code}`,
    validated, tier, maxTier: TIERS.length, next, remaining: next ? next - validated : 0,
    pending: list.filter(x => x.status === "pending").length, maxPending: MAX_PENDING,
    referrals: list,
  };
}

module.exports = { MAX_PENDING, TIERS, CHECK_INTERVAL_MS, codeFor, findByCode, normalizeCode, canonicalEmail, attachAtSignup, evaluate, needsCheck, validatedCount, summary };
