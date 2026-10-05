"use strict";
// =====================================================================
// CHAT DE LA LIGUE (2026-09-30) — retour utilisateur : « le chat de
// compétition de BuzzerBeater », en plus moderne. Un fil public par
// championnat, lisible et utilisable par les seuls managers HUMAINS de ce
// championnat (jeton X-TipIn-Token → league + teamIndex, résolus par
// server/index.js:resolvePlayerContext : on ne peut donc lire/écrire que le
// chat de SA ligue, par construction).
//
// Le chat est UNIQUEMENT un espace de discussion entre managers (retour
// utilisateur 2026-10-05 : « le chat des ligues ne doit plus servir de fil
// d'actualité ») :
//   - messages des managers (500 caractères max, 1 message / 3 s par
//     manager, texte stocké brut et échappé à l'affichage) ;
//   - AUCUN message automatique : plus de résultats, transferts, classement
//     ni play-offs. Les anciens messages automatiques (`system`) encore
//     présents dans une sauvegarde sont effacés à la première lecture
//     (normalizeChat), jamais renvoyés au navigateur ;
//   - réactions rapides (jeu fixe d'émojis), une par manager et par émoji,
//     en bascule ;
//   - non-lus : repère de lecture par manager (`reads`, identifiant du
//     dernier message vu, POST /api/league-chat/read) → `unreadCount` dans
//     chaque réponse, ou seul avec GET ?summary=1 (pastilles du navigateur).
//
// Stockage SÉPARÉ de la ligue (store.loadLeagueChat/saveLeagueChat : un
// fichier/une clé Redis par championnat) : écrire dans le chat ne réécrit
// jamais la ligue. 200 derniers messages de managers, réactions comprises.
//
// Identité : empreinte du jeton manager (Messages.participantKey), jamais le
// jeton lui-même ; le navigateur ne voit que des noms de club, des index
// d'équipe, `mine` et le PSEUDO public du manager (Team.managerPseudo, voir
// Engine.managerPseudoOf — jamais son email, son nom réel ni son nom
// Discord ; `null` tant qu'il n'en a pas choisi : le navigateur affiche
// alors « Manager de <club> » dans la langue du joueur).
// =====================================================================
const store = require("./store.js");
const Messages = require("./messages.js");
const Engine = require("../engine.js");

const CHAT_VERSION = 1;
const MAX_TEXT_LENGTH = 500;
const MAX_USER_MESSAGES = 200;
const VIEW_LIMIT = 150;
const MIN_INTERVAL_MS = 3000;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const REACTIONS = ["🏀", "🔥", "😂", "👏", "💪", "😭"];

// ---------------------------------------------------------------------
// Présence (« M en ligne ») : dernière requête de chaque manager, en
// mémoire seulement (mise à jour par server/index.js à chaque requête
// authentifiée, sans écriture disque ; un redémarrage remet à zéro).
// ---------------------------------------------------------------------
const presence = new Map();
function touchPresence(token, now) {
  if (token) presence.set(Messages.participantKey(token), now);
}
// Nombre total de managers connectés (barre du haut, « N en ligne »).
function onlineCount(now) {
  let n = 0;
  for (const at of presence.values()) if (now - at < ONLINE_WINDOW_MS) n++;
  return n;
}
function isOnline(key, now) {
  const at = presence.get(key);
  return typeof at === "number" && now - at < ONLINE_WINDOW_MS;
}

// Anti-spam : dernier envoi par manager (mémoire).
const lastSend = new Map();
function _resetForTests() { lastSend.clear(); presence.clear(); }

function emptyChat() {
  return { version: CHAT_VERSION, nextId: 1, messages: [], reads: {} };
}
function normalizeChat(data) {
  if (!data || data.version !== CHAT_VERSION) return emptyChat();
  data.messages = Array.isArray(data.messages) ? data.messages : [];
  // Anciens messages automatiques (avant 2026-10-05) : supprimés pour de bon.
  // `purged` signale qu'il faut réécrire le fichier (voir loadClean).
  if ((Array.isArray(data.system) && data.system.length) || data.sync) data.purged = true;
  delete data.system;
  delete data.sync;
  data.messages = data.messages.filter(m => m && m.kind === "user");
  data.nextId = Number.isInteger(data.nextId) && data.nextId > 0 ? data.nextId : 1;
  data.reads = data.reads && typeof data.reads === "object" ? data.reads : {};
  return data;
}

// Non-lus (badge du bouton « Chat de la ligue » et de l'entrée « Ligue ») :
// messages d'autres managers plus récents que le dernier message vu par ce
// manager. Repère = identifiant (croissant dans un chat). Stocké côté
// serveur (`reads`, par empreinte) pour suivre le manager d'un appareil à
// l'autre. Ses propres messages ne comptent jamais.
function unreadCount(chat, me) {
  const lastRead = Number(chat.reads[me]) || 0;
  let n = 0;
  chat.messages.forEach(m => { if (m.id > lastRead && m.from !== me) n++; });
  return n;
}

function humans(league) {
  const out = [];
  league.teams.forEach((t, teamIndex) => {
    if (t && t.isHuman && t.managerLinkToken) out.push({ teamIndex, team: t, key: Messages.participantKey(t.managerLinkToken) });
  });
  return out;
}

function reactionsView(reactions, me) {
  return REACTIONS.map(emoji => {
    const list = (reactions && reactions[emoji]) || [];
    return list.length ? { emoji, count: list.length, mine: list.includes(me) } : null;
  }).filter(Boolean);
}

function chatView(chat, league, me, now) {
  const hs = humans(league);
  const managers = hs.map(h => ({
    teamIndex: h.teamIndex,
    club: h.team.name,
    name: Engine.managerPseudoOf(h.team),
    me: h.key === me,
    online: h.key === me || isOnline(h.key, now),
  })).sort((a, b) => (b.me - a.me) || (b.online - a.online) || a.club.localeCompare(b.club, "fr"));
  // Messages écrits par les managers, et rien d'autre.
  const merged = chat.messages
    .filter(m => m && m.kind === "user")
    .sort((a, b) => a.at - b.at || a.id - b.id)
    .slice(-VIEW_LIMIT)
    .map(m => {
      const author = hs.find(h => h.key === m.from);
      return {
        id: m.id, kind: "user", at: m.at, reactions: reactionsView(m.reactions, me),
        text: m.text, mine: m.from === me,
        author: { club: author ? author.team.name : m.club, teamIndex: author ? author.teamIndex : null, name: author ? Engine.managerPseudoOf(author.team) : null },
      };
    });
  return {
    ok: true,
    managers,
    aiCount: league.teams.length - hs.length,
    online: managers.filter(m => m.online).length,
    canPost: hs.length >= 2,
    unreadCount: unreadCount(chat, me),
    lastReadId: Number(chat.reads[me]) || 0,
    maxLength: MAX_TEXT_LENGTH,
    reactions: REACTIONS,
    messages: merged,
  };
}

// ---------------------------------------------------------------------
// Service : chaque opération reçoit le contexte résolu par index.js
// ({ league, teamIndex, leagueId }) et renvoie { status, body }.
// ---------------------------------------------------------------------
function createService(savePath) {
  let queue = Promise.resolve();
  const withLock = fn => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };
  const load = async id => normalizeChat(await store.loadLeagueChat(id, savePath));
  const save = (id, data) => store.saveLeagueChat(id, data, savePath);

  // Lecture ; un fichier qui contenait encore d'anciens messages
  // automatiques est réécrit sans eux (une seule fois).
  async function loadClean(ctx) {
    const id = ctx.leagueId || ctx.league.leagueId;
    const chat = await load(id);
    if (chat.purged) { delete chat.purged; await save(id, chat); }
    return chat;
  }

  function meOf(ctx) {
    const t = ctx.league.teams[ctx.teamIndex];
    return t && t.managerLinkToken ? Messages.participantKey(t.managerLinkToken) : null;
  }

  return {
    // `summaryOnly` : juste le nombre de non-lus (sondage depuis n'importe
    // quelle page, réponse minuscule).
    async view(ctx, now, summaryOnly = false) {
      const me = meOf(ctx);
      if (!me) return { status: 403, body: { ok: false, error: "Réservé aux managers de la ligue." } };
      const chat = await withLock(() => loadClean(ctx));
      if (summaryOnly) return { status: 200, body: { ok: true, unreadCount: unreadCount(chat, me) } };
      return { status: 200, body: chatView(chat, ctx.league, me, now) };
    },

    // Chat ouvert : tout ce qui a été affiché (jusqu'à `upTo`, identifiant
    // du dernier message rendu) est lu. Jamais en arrière.
    async markRead(ctx, body, now) {
      const me = meOf(ctx);
      if (!me) return { status: 403, body: { ok: false, error: "Réservé aux managers de la ligue." } };
      const id = ctx.leagueId || ctx.league.leagueId;
      const chat = await withLock(async () => {
        const c = await loadClean(ctx);
        const maxId = c.nextId - 1;
        const upTo = Number(body && body.upTo);
        const target = Number.isFinite(upTo) && upTo > 0 ? Math.min(Math.floor(upTo), maxId) : maxId;
        if (target > (Number(c.reads[me]) || 0)) {
          c.reads[me] = target;
          await save(id, c);
        }
        return c;
      });
      return { status: 200, body: { ok: true, unreadCount: unreadCount(chat, me), lastReadId: Number(chat.reads[me]) || 0 } };
    },

    async send(ctx, body, now) {
      const me = meOf(ctx);
      if (!me) return { status: 403, body: { ok: false, error: "Réservé aux managers de la ligue." } };
      if (humans(ctx.league).length < 2) return { status: 403, body: { ok: false, error: "Vous êtes le seul manager de cette ligue pour l'instant." } };
      const text = Messages.cleanText(body && body.text).replace(/\n+/g, " ");
      if (!text) return { status: 400, body: { ok: false, error: "Message vide." } };
      if (text.length > MAX_TEXT_LENGTH) return { status: 400, body: { ok: false, error: `Message trop long (${MAX_TEXT_LENGTH} caractères maximum).` } };
      const last = lastSend.get(me);
      if (typeof last === "number" && now - last < MIN_INTERVAL_MS) {
        return { status: 429, body: { ok: false, error: "Doucement : un message toutes les 3 secondes." } };
      }
      lastSend.set(me, now);
      const id = ctx.leagueId || ctx.league.leagueId;
      const chat = await withLock(async () => {
        const c = await loadClean(ctx);
        const team = ctx.league.teams[ctx.teamIndex];
        c.messages.push({ id: c.nextId++, kind: "user", at: now, from: me, teamIdx: ctx.teamIndex, club: team.name, text, reactions: {} });
        if (c.messages.length > MAX_USER_MESSAGES) c.messages.splice(0, c.messages.length - MAX_USER_MESSAGES);
        await save(id, c);
        return c;
      });
      return { status: 200, body: chatView(chat, ctx.league, me, now) };
    },

    async react(ctx, body, now) {
      const me = meOf(ctx);
      if (!me) return { status: 403, body: { ok: false, error: "Réservé aux managers de la ligue." } };
      const emoji = body && body.emoji;
      if (!REACTIONS.includes(emoji)) return { status: 400, body: { ok: false, error: "Réaction inconnue." } };
      const msgId = Number(body && body.id);
      const id = ctx.leagueId || ctx.league.leagueId;
      const out = await withLock(async () => {
        const c = await loadClean(ctx);
        const msg = c.messages.find(m => m.id === msgId);
        if (!msg) return null;
        msg.reactions = msg.reactions || {};
        const list = new Set(msg.reactions[emoji] || []);
        if (list.has(me)) list.delete(me); else list.add(me);
        if (list.size) msg.reactions[emoji] = [...list]; else delete msg.reactions[emoji];
        await save(id, c);
        return c;
      });
      if (!out) return { status: 404, body: { ok: false, error: "Message introuvable." } };
      return { status: 200, body: chatView(out, ctx.league, me, now) };
    },
  };
}

module.exports = {
  createService, touchPresence, onlineCount, _resetForTests,
  MAX_TEXT_LENGTH, MIN_INTERVAL_MS, REACTIONS, MAX_USER_MESSAGES, ONLINE_WINDOW_MS,
};
