"use strict";
// =====================================================================
// CHAT DE LA LIGUE (2026-09-30) — retour utilisateur : « le chat de
// compétition de BuzzerBeater », en plus moderne. Un fil public par
// championnat, lisible et utilisable par les seuls managers HUMAINS de ce
// championnat (jeton X-TipIn-Token → league + teamIndex, résolus par
// server/index.js:resolvePlayerContext : on ne peut donc lire/écrire que le
// chat de SA ligue, par construction).
//
// Deux sortes de messages :
//   - messages des managers (500 caractères max, 1 message / 3 s par
//     manager, texte stocké brut et échappé à l'affichage) ;
//   - messages AUTOMATIQUES, ce qui fait vivre le chat même avec peu de
//     managers : « Résultat » (chaque match de championnat), « Transfert »
//     (un club de la ligue achète un joueur, voir League.logTransferNews),
//     « Classement » (un club prend la 1re place, entre dans la zone de
//     play-offs ou de relégation). Écrits par le SERVEUR à partir de la
//     ligue sauvegardée (league.results, league.transferNews) au moment où
//     un manager ouvre/rafraîchit le chat — voir syncSystem : un curseur
//     (journée déjà traitée, transferts déjà annoncés) garantit qu'un
//     évènement n'est écrit qu'une fois, horodaté à la fin de son match
//     (pas à l'instant de la lecture). Les résultats n'existent dans
//     league.results qu'une fois la diffusion terminée : aucun spoiler.
//   - réactions rapides (jeu fixe d'émojis), une par manager et par émoji,
//     en bascule ;
//   - non-lus : repère de lecture par manager (`reads`, identifiant du
//     dernier message vu, POST /api/league-chat/read) → `unreadCount` dans
//     chaque réponse, ou seul avec GET ?summary=1 (pastilles du navigateur).
//
// Stockage SÉPARÉ de la ligue (store.loadLeagueChat/saveLeagueChat : un
// fichier/une clé Redis par championnat) : écrire dans le chat ne réécrit
// jamais la ligue. 200 derniers messages de managers + 200 derniers
// messages automatiques, réactions comprises.
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
const MAX_SYSTEM_MESSAGES = 200;
const VIEW_LIMIT = 150;
const MIN_INTERVAL_MS = 3000;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
// Premier passage sur un championnat déjà en cours : seules les 2 dernières
// journées (et les transferts des 3 derniers jours) sont annoncées, pas
// toute la saison d'un coup.
const FIRST_SYNC_ROUNDS = 2;
const FIRST_SYNC_TRANSFER_MS = 3 * 24 * 3600 * 1000;
// Pas d'annonces « Classement » sur les toutes premières journées (le
// classement y change à chaque match, ce serait du bruit).
const STANDINGS_FROM_ROUND = 2;
const PLAYOFF_SPOTS = 4;
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
function isOnline(key, now) {
  const at = presence.get(key);
  return typeof at === "number" && now - at < ONLINE_WINDOW_MS;
}

// Anti-spam : dernier envoi par manager (mémoire).
const lastSend = new Map();
function _resetForTests() { lastSend.clear(); presence.clear(); }

function emptyChat() {
  return { version: CHAT_VERSION, nextId: 1, messages: [], system: [], sync: null, reads: {} };
}
function normalizeChat(data) {
  if (!data || data.version !== CHAT_VERSION) return emptyChat();
  data.messages = Array.isArray(data.messages) ? data.messages : [];
  data.system = Array.isArray(data.system) ? data.system : [];
  data.nextId = Number.isInteger(data.nextId) && data.nextId > 0 ? data.nextId : 1;
  data.reads = data.reads && typeof data.reads === "object" ? data.reads : {};
  return data;
}

// Non-lus (badge du bouton « Chat de la ligue » et de l'entrée « Ligue ») :
// messages d'autres managers ET messages automatiques plus récents que le
// dernier message vu par ce manager. Repère = identifiant (croissant dans
// un chat), pas l'horodatage : un message automatique peut être daté de la
// fin d'un match plus ancien que le dernier message lu. Stocké côté
// serveur (`reads`, par empreinte) pour suivre le manager d'un appareil à
// l'autre. Ses propres messages ne comptent jamais.
function unreadCount(chat, me) {
  const lastRead = Number(chat.reads[me]) || 0;
  let n = 0;
  chat.messages.forEach(m => { if (m.id > lastRead && m.from !== me) n++; });
  chat.system.forEach(m => { if (m.id > lastRead) n++; });
  return n;
}

function humans(league) {
  const out = [];
  league.teams.forEach((t, teamIndex) => {
    if (t && t.isHuman && t.managerLinkToken) out.push({ teamIndex, team: t, key: Messages.participantKey(t.managerLinkToken) });
  });
  return out;
}

// Classement après la journée `round` incluse (même règle et mêmes
// départages que League.standings, qu'on réutilise tel quel).
function standingsAfter(league, round) {
  const saved = league.results;
  try {
    league.results = saved.filter(r => r.round <= round);
    return league.standings();
  } finally {
    league.results = saved;
  }
}

function roundComplete(league, round) {
  const expected = (league.matchesForRound(round) || []).length;
  if (!expected) return false;
  return league.results.filter(r => r.round === round).length >= expected;
}

// ---------------------------------------------------------------------
// Messages automatiques. `opts` : { now, relegations, roundEndAt(round) }.
// Renvoie true si quelque chose a été ajouté (à sauvegarder).
// ---------------------------------------------------------------------
function syncSystem(chat, league, opts) {
  const now = opts.now;
  const season = league.seasonNumber || 1;
  const total = typeof league.totalRounds === "number" ? league.totalRounds : (league.schedule || []).length;
  const firstSync = !chat.sync;
  let changed = false;
  const push = (kind, key, data, at) => {
    chat.system.push({ id: chat.nextId++, kind, key, at, data, reactions: {} });
    changed = true;
  };

  if (!chat.sync || chat.sync.season !== season) {
    let lastRound = -1;
    if (firstSync) {
      let done = -1;
      while (done + 1 < total && roundComplete(league, done + 1)) done++;
      lastRound = Math.max(-1, done - FIRST_SYNC_ROUNDS);
    }
    chat.sync = { season, lastRound, transfers: (chat.sync && chat.sync.transfers) || [] };
    changed = true;
  }

  // Journées de championnat terminées depuis le dernier passage.
  const names = league.teams.map(t => (t ? t.name : "?"));
  for (let r = chat.sync.lastRound + 1; r < total && roundComplete(league, r); r++) {
    let at = opts.roundEndAt(r);
    if (typeof at !== "number" || !Number.isFinite(at) || at > now) at = now;
    league.results.filter(x => x.round === r).forEach(x => {
      const homeWon = x.scoreHome > x.scoreAway;
      push("result", `res:${season}:${r}:${x.home}-${x.away}`, {
        round: r + 1,
        winner: homeWon ? names[x.home] : names[x.away], winnerIdx: homeWon ? x.home : x.away,
        loser: homeWon ? names[x.away] : names[x.home], loserIdx: homeWon ? x.away : x.home,
        winnerPts: Math.max(x.scoreHome, x.scoreAway), loserPts: Math.min(x.scoreHome, x.scoreAway),
        home: names[x.home], away: names[x.away], scoreHome: x.scoreHome, scoreAway: x.scoreAway,
        homeIdx: x.home, awayIdx: x.away,
      }, at);
    });
    if (r >= Math.max(1, STANDINGS_FROM_ROUND - 1)) {
      const before = standingsAfter(league, r - 1);
      const after = standingsAfter(league, r);
      const posBefore = new Map(before.map((s, i) => [s.idx, i + 1]));
      let seq = 1;
      if (after[0] && before[0] && after[0].idx !== before[0].idx) {
        push("standings", `st:${season}:${r}:lead`, { event: "leader", round: r + 1, team: after[0].name, teamIdx: after[0].idx, points: after[0].points }, at + seq++);
      }
      if (r >= STANDINGS_FROM_ROUND) {
        const n = after.length;
        const rel = Math.max(0, Math.min(3, opts.relegations || 0));
        after.forEach((s, i) => {
          const rank = i + 1, prev = posBefore.get(s.idx);
          if (n === 10 && rank <= PLAYOFF_SPOTS && prev > PLAYOFF_SPOTS && rank !== 1) {
            push("standings", `st:${season}:${r}:po:${s.idx}`, { event: "playoffs", round: r + 1, team: s.name, teamIdx: s.idx, rank }, at + seq++);
          }
          if (rel && rank > n - rel && prev <= n - rel) {
            push("standings", `st:${season}:${r}:rel:${s.idx}`, { event: "relegation", round: r + 1, team: s.name, teamIdx: s.idx, rank }, at + seq++);
          }
        });
      }
    }
    chat.sync.lastRound = r;
    changed = true;
  }

  // Play-offs (demi-finales puis finale, 2 victoires ; voir
  // League.recordPlayoffGameResult) : un message par match joué (score de
  // la série, qualification), puis le champion. Curseur = nombre de matchs
  // déjà annoncés par série (remis à zéro avec la saison). La Coupe, elle,
  // n'est jamais annoncée (retour utilisateur 2026-09-30).
  const po = league.playoffs;
  if (po) {
    const cur = chat.sync.playoffs || (chat.sync.playoffs = { semi0: 0, semi1: 0, final: 0, champion: false });
    const series = [["semi0", po.series && po.series[0], "semi"], ["semi1", po.series && po.series[1], "semi"], ["final", po.finalSeries, "final"]];
    series.forEach(([sid, se, stage]) => {
      if (!se || !Array.isArray(se.games)) return;
      let winsA = 0, winsB = 0;
      se.games.forEach((g, gi) => {
        const aWon = g.home === se.idxA ? g.scoreHome > g.scoreAway : g.scoreAway > g.scoreHome;
        if (aWon) winsA++; else winsB++;
        if (gi < (cur[sid] || 0)) return;
        const homeWon = g.scoreHome > g.scoreAway;
        const w = homeWon ? g.home : g.away, l = homeWon ? g.away : g.home;
        const wWins = w === se.idxA ? winsA : winsB, lWins = w === se.idxA ? winsB : winsA;
        push("playoffs", `po:${season}:${sid}:${gi}`, {
          stage, game: gi + 1,
          winner: names[w], winnerIdx: w, loser: names[l], loserIdx: l,
          winnerPts: Math.max(g.scoreHome, g.scoreAway), loserPts: Math.min(g.scoreHome, g.scoreAway),
          seriesWinner: wWins, seriesLoser: lWins, decided: wWins >= 2,
        }, now);
        cur[sid] = gi + 1;
      });
    });
    if (po.champion != null && !cur.champion) {
      push("playoffs", `po:${season}:champion`, { stage: "champion", team: names[po.champion], teamIdx: po.champion }, now);
      cur.champion = true;
    }
  }

  // Transferts (voir League.logTransferNews).
  const seen = new Set(chat.sync.transfers);
  (league.transferNews || []).forEach(t => {
    if (!t || t.id == null || seen.has(String(t.id))) return;
    seen.add(String(t.id));
    chat.sync.transfers.push(String(t.id));
    changed = true;
    if (firstSync && now - (t.at || 0) > FIRST_SYNC_TRANSFER_MS) return;
    push("transfer", `tr:${t.id}`, {
      buyer: t.buyerName, buyerIdx: t.buyerIdx, seller: t.sellerName, player: t.playerName, fee: t.fee, foreign: !!t.foreign,
      // Liens du chat (joueur cliquable, club vendeur) et mention « IA »
      // (retour d'un testeur 2026-09-30 : « C'est un bot qui vient de
      // recruter ? »). Absents des transferts d'avant.
      ...(t.playerId != null ? { playerId: t.playerId } : {}),
      ...(typeof t.sellerIdx === "number" && !t.foreign ? { sellerIdx: t.sellerIdx } : {}),
      ...(typeof t.buyerAi === "boolean" ? { buyerAi: t.buyerAi } : {}),
      // Agent libre signé (demande du 2026-10-01) : pas de club vendeur.
      ...(t.freeAgent ? { freeAgent: true } : {}),
    }, Math.min(now, t.at || now));
  });
  if (chat.sync.transfers.length > 120) chat.sync.transfers = chat.sync.transfers.slice(-120);

  if (chat.system.length > MAX_SYSTEM_MESSAGES) chat.system.splice(0, chat.system.length - MAX_SYSTEM_MESSAGES);
  return changed;
}

// Texte (français) d'un message automatique — le navigateur compose le
// sien (montants, traduction) mais celui-ci sert de repli et aux tests.
function systemText(m) {
  const d = m.data || {};
  if (m.kind === "result") return `${d.winner} bat ${d.loser} ${d.winnerPts}-${d.loserPts}`;
  if (m.kind === "transfer" && d.freeAgent) return `${d.buyer} signe ${d.player} (agent libre)`;
  if (m.kind === "transfer") return `${d.buyer} achète ${d.player} (${d.seller})`;
  if (m.kind === "playoffs") {
    if (d.stage === "champion") return `${d.team} est champion !`;
    const stage = d.stage === "final" ? "finale" : "demi-finale";
    return `${d.winner} bat ${d.loser} ${d.winnerPts}-${d.loserPts} (${stage}, ${d.seriesWinner}-${d.seriesLoser})`;
  }
  if (m.kind === "standings") {
    if (d.event === "leader") return `${d.team} prend la tête du classement`;
    if (d.event === "playoffs") return `${d.team} entre dans la zone de play-offs (${d.rank}e)`;
    if (d.event === "relegation") return `${d.team} tombe en zone de relégation (${d.rank}e)`;
  }
  return "";
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
  const merged = chat.messages.concat(chat.system)
    .sort((a, b) => a.at - b.at || a.id - b.id)
    .slice(-VIEW_LIMIT)
    .map(m => {
      const base = { id: m.id, kind: m.kind, at: m.at, reactions: reactionsView(m.reactions, me) };
      if (m.kind === "user") {
        const author = hs.find(h => h.key === m.from);
        return {
          ...base, text: m.text, mine: m.from === me,
          author: { club: author ? author.team.name : m.club, teamIndex: author ? author.teamIndex : null, name: author ? Engine.managerPseudoOf(author.team) : null },
        };
      }
      return { ...base, data: m.data, text: systemText(m) };
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
// `opts.systemOpts(ctx)` → { relegations, roundEndAt } (calendrier,
// zones du championnat).
// ---------------------------------------------------------------------
function createService(savePath, opts = {}) {
  let queue = Promise.resolve();
  const withLock = fn => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };
  const load = async id => normalizeChat(await store.loadLeagueChat(id, savePath));
  const save = (id, data) => store.saveLeagueChat(id, data, savePath);
  const sysOpts = (ctx, now) => ({ now, relegations: 0, roundEndAt: () => now, ...(opts.systemOpts ? opts.systemOpts(ctx) : {}) });

  // Lecture + messages automatiques dus (écrit seulement s'il y en a).
  async function loadSynced(ctx, now) {
    const id = ctx.leagueId || ctx.league.leagueId;
    const chat = await load(id);
    if (syncSystem(chat, ctx.league, sysOpts(ctx, now))) await save(id, chat);
    return chat;
  }

  function meOf(ctx) {
    const t = ctx.league.teams[ctx.teamIndex];
    return t && t.managerLinkToken ? Messages.participantKey(t.managerLinkToken) : null;
  }

  return {
    // Messages automatiques dus, sans lecteur (rattrapage de fond du monde,
    // server/world.js:catchUpWorld, juste avant le changement de saison et
    // après chaque passage) : plus aucun résultat perdu si personne n'ouvre
    // le chat avant la nouvelle saison. Écrit seulement s'il y a du nouveau.
    async flushSystem(ctx, now) {
      if (!ctx.league.teams.some(t => t && t.isHuman)) return false;
      const id = ctx.leagueId || ctx.league.leagueId;
      return withLock(async () => {
        const chat = await load(id);
        if (!syncSystem(chat, ctx.league, sysOpts(ctx, now))) return false;
        await save(id, chat);
        return true;
      });
    },

    // `summaryOnly` : juste le nombre de non-lus (sondage depuis n'importe
    // quelle page, réponse minuscule).
    async view(ctx, now, summaryOnly = false) {
      const me = meOf(ctx);
      if (!me) return { status: 403, body: { ok: false, error: "Réservé aux managers de la ligue." } };
      const chat = await withLock(() => loadSynced(ctx, now));
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
        const c = await loadSynced(ctx, now);
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
        const c = await loadSynced(ctx, now);
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
        const c = await loadSynced(ctx, now);
        const msg = c.messages.find(m => m.id === msgId) || c.system.find(m => m.id === msgId);
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
  createService, syncSystem, systemText, touchPresence, _resetForTests,
  MAX_TEXT_LENGTH, MIN_INTERVAL_MS, REACTIONS, MAX_USER_MESSAGES, MAX_SYSTEM_MESSAGES, ONLINE_WINDOW_MS,
};
