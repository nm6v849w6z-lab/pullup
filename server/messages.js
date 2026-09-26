"use strict";
// =====================================================================
// MESSAGERIE PRIVÉE ENTRE MANAGERS (2026-09-26) — retour utilisateur : "il
// faut uniquement les discussions avec les autres managers du jeu (jeu
// online)" + "l'idée sera que les forums seront sur discord". Donc :
//   - conversations 1-à-1 entre managers HUMAINS de la ligue partagée
//     (jeton X-TipIn-Token) — jamais en solo (aucun autre manager) ;
//   - PAS de chat de ligue (Discord s'en charge) ;
//   - PAS de notifications du jeu ici (elles restent sur le tableau de bord).
//
// Stockage SÉPARÉ de la ligue (fichier `messages.json` à côté de
// multi-league.json, ou clé Redis `pullup:messages` quand Upstash est
// configuré — même bascule que server/store.js) : envoyer un message ne
// réécrit jamais la ligue partagée, donc ne peut jamais entrer en
// concurrence avec une sauvegarde de match/d'ordres d'un autre manager.
//
// Identité d'un participant : empreinte SHA-256 (tronquée) de son jeton
// manager, jamais le jeton lui-même, jamais l'index d'équipe (qui peut
// changer si la ligue est réinitialisée — les jetons, eux, sont conservés
// par nom de club, voir performMultiLeagueReset dans index.js). Le
// navigateur ne voit JAMAIS ces empreintes : il désigne son interlocuteur
// par index d'équipe, traduit ici à chaque requête.
// =====================================================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MESSAGES_VERSION = 1;
const REDIS_KEY = "pullup:messages";
const MAX_TEXT_LENGTH = 1000;
const MAX_MESSAGES_PER_CONVERSATION = 300;
// Anti-spam : au plus RATE_MAX messages sur RATE_WINDOW_MS glissantes par
// expéditeur, et un intervalle minimal entre deux envois.
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 10;
const MIN_INTERVAL_MS = 1000;
const MAX_REPORTS_KEPT = 500;
const REPORT_REASONS = ["insultes", "spam", "triche", "autre"];

function participantKey(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 24);
}

function conversationKey(a, b) {
  return a < b ? `${a}~${b}` : `${b}~${a}`;
}

function emptyData() {
  return { version: MESSAGES_VERSION, conversations: {}, blocks: {}, reports: [], nextId: 1 };
}

function normalizeData(data) {
  if (!data || data.version !== MESSAGES_VERSION || typeof data.conversations !== "object") return emptyData();
  data.blocks = data.blocks && typeof data.blocks === "object" ? data.blocks : {};
  data.reports = Array.isArray(data.reports) ? data.reports : [];
  data.nextId = Number.isInteger(data.nextId) && data.nextId > 0 ? data.nextId : 1;
  return data;
}

// ---------------------------------------------------------------------
// Persistance (même principe que server/store.js : fichier local écrit de
// façon atomique, ou Upstash Redis si les variables d'environnement sont
// définies). Les écritures passent par une file d'attente en mémoire
// (`withLock`) : deux envois simultanés ne peuvent pas s'écraser l'un
// l'autre (lecture → modification → écriture toujours en série).
// ---------------------------------------------------------------------
let fetchImpl = (...args) => fetch(...args);
function _setFetchImplForTests(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }

function upstashConfigured() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function messagesPathFor(multiSavePath) {
  return path.join(path.dirname(multiSavePath), "messages.json");
}

async function loadData(filePath) {
  if (upstashConfigured()) {
    try {
      const res = await fetchImpl(`${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(REDIS_KEY)}`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      return normalizeData(body && typeof body.result === "string" ? JSON.parse(body.result) : null);
    } catch (e) {
      // Lecture impossible : on ne renvoie SURTOUT PAS des données vides qui
      // seraient ensuite réécrites par-dessus l'historique réel.
      throw new Error(`Messagerie momentanément indisponible (${e.message}).`);
    }
  }
  try {
    if (!fs.existsSync(filePath)) return emptyData();
    return normalizeData(JSON.parse(fs.readFileSync(filePath, "utf-8")));
  } catch (e) {
    throw new Error(`Messagerie illisible (${e.message}).`);
  }
}

async function saveData(filePath, data) {
  const raw = JSON.stringify(data);
  if (upstashConfigured()) {
    const res = await fetchImpl(`${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(REDIS_KEY)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      body: raw,
    });
    if (!res.ok) throw new Error(`Messagerie : écriture impossible (HTTP ${res.status}).`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, raw, "utf-8");
  fs.renameSync(tmp, filePath);
}

let queue = Promise.resolve();
function withLock(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// Anti-spam : horodatages des derniers envois, en mémoire seulement (un
// redémarrage du serveur remet les compteurs à zéro, sans conséquence).
const recentSends = new Map();
function _resetRateLimitForTests() { recentSends.clear(); }

function checkRate(senderKey, now) {
  const list = (recentSends.get(senderKey) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (list.length && now - list[list.length - 1] < MIN_INTERVAL_MS) return "Doucement : attendez une seconde entre deux messages.";
  if (list.length >= RATE_MAX) return "Trop de messages envoyés en peu de temps. Réessayez dans une minute.";
  list.push(now);
  recentSends.set(senderKey, list);
  return null;
}

// ---------------------------------------------------------------------
// Annuaire : les managers humains de la ligue, indexés par empreinte.
// ---------------------------------------------------------------------
function directory(league) {
  const byKey = new Map();
  league.teams.forEach((t, teamIndex) => {
    if (t && t.isHuman && t.managerLinkToken) byKey.set(participantKey(t.managerLinkToken), { teamIndex, team: t });
  });
  return byKey;
}

function keyForTeamIndex(league, teamIndex) {
  const t = Number.isInteger(teamIndex) ? league.teams[teamIndex] : null;
  if (!t || !t.isHuman || !t.managerLinkToken) return null;
  return participantKey(t.managerLinkToken);
}

function isBlocked(data, blocker, blocked) {
  return Array.isArray(data.blocks[blocker]) && data.blocks[blocker].includes(blocked);
}

function cleanText(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n?/g, "\n")
    // Caractères de contrôle (hors saut de ligne/tabulation) retirés.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function unreadIn(conv, me) {
  const lastRead = (conv.lastReadAt && conv.lastReadAt[me]) || 0;
  return conv.messages.filter(m => m.from !== me && m.at > lastRead).length;
}

function otherOf(conv, me) {
  return conv.participants[0] === me ? conv.participants[1] : conv.participants[0];
}

// ---------------------------------------------------------------------
// Vues (lecture seule) — tout ce qui part vers le navigateur passe par
// ici : index d'équipe et nom de club, jamais d'empreinte ni de jeton.
// ---------------------------------------------------------------------
function managerList(league, me, data) {
  const out = [];
  directory(league).forEach(({ teamIndex, team }, key) => {
    if (key === me) return;
    out.push({ teamIndex, name: team.name, blocked: isBlocked(data, me, key) });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function conversationsView(league, me, data) {
  const dir = directory(league);
  const list = [];
  Object.values(data.conversations).forEach(conv => {
    if (!conv.participants.includes(me) || !conv.messages.length) return;
    const other = dir.get(otherOf(conv, me));
    if (!other) return; // ce club n'est plus tenu par un manager de la ligue
    const last = conv.messages[conv.messages.length - 1];
    list.push({
      teamIndex: other.teamIndex,
      name: other.team.name,
      lastMessage: { text: last.text.slice(0, 140), at: last.at, mine: last.from === me },
      unread: unreadIn(conv, me),
      blocked: isBlocked(data, me, otherOf(conv, me)),
    });
  });
  return list.sort((a, b) => b.lastMessage.at - a.lastMessage.at);
}

function summaryView(league, me, data) {
  const conversations = conversationsView(league, me, data);
  return {
    ok: true,
    available: true,
    unread: conversations.reduce((s, c) => s + (c.blocked ? 0 : c.unread), 0),
    conversations,
    managers: managerList(league, me, data),
  };
}

function threadView(league, me, otherKey, otherIndex, data) {
  const conv = data.conversations[conversationKey(me, otherKey)];
  const team = league.teams[otherIndex];
  return {
    ok: true,
    with: { teamIndex: otherIndex, name: team.name, blocked: isBlocked(data, me, otherKey) },
    messages: conv ? conv.messages.map(m => ({ id: m.id, mine: m.from === me, text: m.text, at: m.at })) : [],
    // Dernier message de MOI que l'autre a déjà lu (accusé de lecture discret).
    readByOtherUntil: conv && conv.lastReadAt ? conv.lastReadAt[otherKey] || 0 : 0,
  };
}

// ---------------------------------------------------------------------
// Opérations. Chacune reçoit le contexte déjà résolu par index.js
// (league + teamIndex du manager authentifié) et renvoie
// { status, body } — index.js se contente d'envoyer la réponse.
// ---------------------------------------------------------------------
function resolveOther(league, me, rawIndex) {
  const idx = Number(rawIndex);
  if (!Number.isInteger(idx)) return { error: "Destinataire manquant." };
  const key = keyForTeamIndex(league, idx);
  if (!key) return { error: "Ce club n'est pas dirigé par un manager." };
  if (key === me) return { error: "Vous ne pouvez pas vous écrire à vous-même." };
  return { idx, key };
}

function createService(filePath) {
  return {
    filePath,

    async summary(league, teamIndex) {
      const me = keyForTeamIndex(league, teamIndex);
      const data = await loadData(filePath);
      return { status: 200, body: summaryView(league, me, data) };
    },

    async thread(league, teamIndex, withIndex) {
      const me = keyForTeamIndex(league, teamIndex);
      const other = resolveOther(league, me, withIndex);
      if (other.error) return { status: 400, body: { ok: false, error: other.error } };
      const data = await loadData(filePath);
      return { status: 200, body: threadView(league, me, other.key, other.idx, data) };
    },

    async markRead(league, teamIndex, body) {
      const me = keyForTeamIndex(league, teamIndex);
      const other = resolveOther(league, me, body && body.with);
      if (other.error) return { status: 400, body: { ok: false, error: other.error } };
      return withLock(async () => {
        const data = await loadData(filePath);
        const conv = data.conversations[conversationKey(me, other.key)];
        if (conv) {
          conv.lastReadAt = conv.lastReadAt || {};
          // `upTo` = horodatage du dernier message réellement AFFICHÉ par le
          // navigateur : un message arrivé entre l'affichage et cet appel
          // reste non lu. Jamais en arrière, jamais au-delà du dernier message.
          const last = conv.messages.length ? conv.messages[conv.messages.length - 1].at : 0;
          const upTo = Number(body && body.upTo);
          const target = Number.isFinite(upTo) && upTo > 0 ? Math.min(upTo, last) : last;
          conv.lastReadAt[me] = Math.max(conv.lastReadAt[me] || 0, target);
          await saveData(filePath, data);
        }
        return { status: 200, body: summaryView(league, me, data) };
      });
    },

    async send(league, teamIndex, body, now) {
      const me = keyForTeamIndex(league, teamIndex);
      const other = resolveOther(league, me, body && body.to);
      if (other.error) return { status: 400, body: { ok: false, error: other.error } };
      const text = cleanText(body && body.text);
      if (!text) return { status: 400, body: { ok: false, error: "Message vide." } };
      if (text.length > MAX_TEXT_LENGTH) return { status: 400, body: { ok: false, error: `Message trop long (${MAX_TEXT_LENGTH} caractères maximum).` } };
      return withLock(async () => {
        const data = await loadData(filePath);
        if (isBlocked(data, me, other.key)) return { status: 400, body: { ok: false, error: "Vous avez bloqué ce manager. Débloquez-le pour lui écrire." } };
        if (isBlocked(data, other.key, me)) return { status: 403, body: { ok: false, error: "Ce manager ne reçoit pas vos messages." } };
        const rateError = checkRate(me, now);
        if (rateError) return { status: 429, body: { ok: false, error: rateError } };
        const ck = conversationKey(me, other.key);
        const conv = data.conversations[ck] || (data.conversations[ck] = { participants: [me, other.key], messages: [], lastReadAt: {} });
        // Horodatage strictement croissant dans une conversation (tri et
        // non-lus fiables même pour deux envois dans la même milliseconde).
        const lastAt = conv.messages.length ? conv.messages[conv.messages.length - 1].at : 0;
        const msg = { id: data.nextId++, from: me, text, at: Math.max(now, lastAt + 1) };
        conv.messages.push(msg);
        if (conv.messages.length > MAX_MESSAGES_PER_CONVERSATION) conv.messages.splice(0, conv.messages.length - MAX_MESSAGES_PER_CONVERSATION);
        // Écrire vaut lecture de la conversation pour l'expéditeur.
        conv.lastReadAt = conv.lastReadAt || {};
        conv.lastReadAt[me] = msg.at;
        await saveData(filePath, data);
        return { status: 200, body: threadView(league, me, other.key, other.idx, data) };
      });
    },

    async setBlocked(league, teamIndex, body) {
      const me = keyForTeamIndex(league, teamIndex);
      const other = resolveOther(league, me, body && body.teamIndex);
      if (other.error) return { status: 400, body: { ok: false, error: other.error } };
      const blocked = !!(body && body.blocked);
      return withLock(async () => {
        const data = await loadData(filePath);
        const list = new Set(data.blocks[me] || []);
        if (blocked) list.add(other.key); else list.delete(other.key);
        if (list.size) data.blocks[me] = [...list]; else delete data.blocks[me];
        await saveData(filePath, data);
        return { status: 200, body: threadView(league, me, other.key, other.idx, data) };
      });
    },

    async report(league, teamIndex, body, now) {
      const me = keyForTeamIndex(league, teamIndex);
      const other = resolveOther(league, me, body && body.with);
      if (other.error) return { status: 400, body: { ok: false, error: other.error } };
      const reason = REPORT_REASONS.includes(body && body.reason) ? body.reason : "autre";
      const comment = cleanText(body && body.comment).slice(0, 500);
      return withLock(async () => {
        const data = await loadData(filePath);
        const conv = data.conversations[conversationKey(me, other.key)];
        const messageId = Number(body && body.messageId);
        const msg = conv && conv.messages.find(m => m.id === messageId && m.from === other.key);
        if (!msg) return { status: 400, body: { ok: false, error: "Message introuvable." } };
        if (data.reports.some(r => r.messageId === msg.id && r.reporter === me)) {
          return { status: 200, body: { ok: true, alreadyReported: true } };
        }
        data.reports.push({
          id: data.nextId++, at: now, reason, comment, status: "open",
          reporter: me, reporterTeam: league.teams[teamIndex].name,
          reported: other.key, reportedTeam: league.teams[other.idx].name,
          messageId: msg.id, messageText: msg.text, messageAt: msg.at,
          // Contexte pour la modération : les derniers échanges avant le message.
          context: conv.messages.filter(m => m.at <= msg.at).slice(-10).map(m => ({
            from: m.from === me ? league.teams[teamIndex].name : league.teams[other.idx].name, text: m.text, at: m.at,
          })),
        });
        if (data.reports.length > MAX_REPORTS_KEPT) data.reports.splice(0, data.reports.length - MAX_REPORTS_KEPT);
        await saveData(filePath, data);
        return { status: 200, body: { ok: true } };
      });
    },

    // Modération (route admin, X-Admin-Token) : signalements, sans empreintes.
    async listReports() {
      const data = await loadData(filePath);
      return {
        status: 200,
        body: {
          ok: true,
          reports: data.reports.slice().reverse().map(r => ({
            id: r.id, at: r.at, reason: r.reason, comment: r.comment, status: r.status,
            reporterTeam: r.reporterTeam, reportedTeam: r.reportedTeam,
            messageText: r.messageText, messageAt: r.messageAt, context: r.context,
          })),
        },
      };
    },

    async resolveReport(body) {
      return withLock(async () => {
        const data = await loadData(filePath);
        const r = data.reports.find(x => x.id === Number(body && body.id));
        if (!r) return { status: 404, body: { ok: false, error: "Signalement introuvable." } };
        r.status = "closed";
        await saveData(filePath, data);
        return { status: 200, body: { ok: true } };
      });
    },
  };
}

module.exports = {
  createService, messagesPathFor, participantKey, cleanText,
  MAX_TEXT_LENGTH, RATE_MAX, RATE_WINDOW_MS, MIN_INTERVAL_MS, REPORT_REASONS, REDIS_KEY,
  _setFetchImplForTests, _resetRateLimitForTests,
};
