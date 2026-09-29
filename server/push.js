"use strict";

// =====================================================================
// NOTIFICATIONS (Premium, liste de la nuit du 2026-09-28 : « notifications
// sur mobile : fin d'enchère, blessure, match qui commence »). Abonnements
// Web Push rangés sur le club (Team.pushSubscriptions, 5 appareils au plus)
// ; à chaque sauvegarde d'un championnat (server/index.js:persistContext,
// server/world.js:catchUpWorld), flushLeague envoie aux clubs Premium :
//  - le coup d'envoi d'un de leurs matchs en direct (15 premières minutes) ;
//  - les nouvelles entrées du fil d'actualité « à notifier » : blessure
//    (injury_…), fin d'enchère proche d'un joueur suivi (mkt_end_…),
//    arrivée ou départ d'un joueur (push: true) ;
//  - les enchères du club, joueurs ET staff (entraîneur, adjoint, analyste,
//    recruteur, médecin, kiné) : fin dans moins d'une heure (en tête ou
//    dépassé), puis résultat (staff remporté, enchère perdue, annulée faute
//    de budget) — retour utilisateur 2026-09-29 ; et « Enchère dépassée »
//    à chaque surenchère d'un autre club (y compris sur une annonce d'un
//    autre championnat), qui ouvre « Mes enchères » (/#encheres).
// Sans clés VAPID (server/webpush.js), rien n'est envoyé ni modifié.
// =====================================================================

const WebPush = require("./webpush.js");

const MAX_SUBSCRIPTIONS = 5;
const KICKOFF_WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_FLUSH = 4;

function isPremium(team, now) {
  return typeof team.hasActivePremium === "function" ? team.hasActivePremium(now) : !!team.isPaying;
}

function addSubscription(team, sub, now) {
  if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return false;
  team.pushSubscriptions = (team.pushSubscriptions || []).filter(x => x.endpoint !== sub.endpoint);
  team.pushSubscriptions.push({ endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) }, createdAt: now });
  team.pushSubscriptions = team.pushSubscriptions.slice(-MAX_SUBSCRIPTIONS);
  if (typeof team.pushCursor !== "number") team.pushCursor = team.feed ? (team.feed.nextId || 1) - 1 : 0;
  if (typeof team.pushSince !== "number") team.pushSince = now;
  return true;
}

function removeSubscription(team, endpoint) {
  const before = (team.pushSubscriptions || []).length;
  team.pushSubscriptions = (team.pushSubscriptions || []).filter(x => x.endpoint !== endpoint);
  return team.pushSubscriptions.length !== before;
}

const AUCTION_MARKETS = [
  ["transferListings", null],
  ["coachListings", "l'entraîneur"],
  ["assistantCoachListings", "l'entraîneur adjoint"],
  ["analystListings", "l'analyste vidéo"],
  ["recruiterListings", "le recruteur"],
  ["doctorListings", "le médecin"],
  ["physioListings", "le kiné"],
];
const AUCTION_ENDING_MS = 60 * 60 * 1000;
const AUCTION_RESULT_WINDOW_MS = 24 * 3600 * 1000;
const AUCTION_KEYS_KEPT = 100;
// Chargé à la demande (engine.js est volumineux, et ce module est aussi
// utilisé seul par les tests).
let engineMod = null;
function Engine() { if (!engineMod) engineMod = require("../engine.js"); return engineMod; }

function euros(n) { return `${Math.round(n || 0).toLocaleString("fr-FR")} €`; }

function leftLabel(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} j`;
}

// Lien des notifications d'enchère : la page Marché ouverte sur « Mes
// enchères » (voir mkGotoMine côté navigateur, #encheres).
const AUCTIONS_URL = "/#encheres";

// Enchères du club : dépassé (une note par surenchère), fin proche, puis
// résultat (voir l'en-tête). `opts.leagueId` + `opts.leagues` (Map id →
// League, server/world.js:catchUpWorld) : aussi les enchères du club sur les
// annonces des AUTRES championnats (marché mondial, enchérisseur rangé en
// FOREIGN_BIDDER_IDX + bidderRef dans la ligue du vendeur).
function auctionNotes(league, teamIdx, now, opts = {}) {
  const team = league.teams[teamIdx];
  const out = [];
  const since = typeof team.pushSince === "number" ? team.pushSince : 0;
  const seen = new Set(team.pushAuctionKeys || []);
  const mark = key => { seen.add(key); team.pushAuctionKeys = [...seen].slice(-AUCTION_KEYS_KEPT); };
  const watched = new Set((team.marketWatchlist || []).map(w => String(w.playerId)));
  const scan = (field, staffLabel, listings, isMe, playerOf) => (listings || []).forEach(l => {
    if (!l || !(l.bids || []).some(isMe)) return;
    if (l.closesAt < since) return;
    const player = !staffLabel ? playerOf(l) : null;
    const what = staffLabel ? `${staffLabel} (niveau ${l.level})` : (player ? player.name : "un joueur");
    const lead = isMe({ bidderIdx: l.currentBidderIdx, bidderRef: l.currentBidderRef });
    if (l.status === "open") {
      if (l.closesAt <= now) return;
      // Dépassé (retour utilisateur 2026-09-29 : « si qqun a surenchéri,
      // comment je retrouve rapidement ? ») : une note par nouvelle offre
      // d'un autre club (clé = nombre d'offres), même étiquette pour une
      // annonce donnée (la plus récente remplace l'ancienne sur l'appareil).
      const last = (l.bids || [])[l.bids.length - 1];
      if (!lead && last && !isMe(last) && (last.at || 0) >= since) {
        const key = `out:${field}:${l.id}:${l.bids.length}`;
        if (!seen.has(key)) {
          mark(key);
          // Enchère automatique du club dépassée : son plafond ne suffit plus.
          const auto = (l.autoBids || []).find(isMe);
          out.push({
            title: auto ? `Plafond dépassé : ${what}` : `Enchère dépassée : ${what}`,
            body: auto
              ? `Votre enchère automatique (jusqu'à ${euros(auto.max)}) ne suffit plus : offre à ${euros(l.currentBid)}, clôture dans ${leftLabel(l.closesAt - now)}.`
              : `Nouvelle offre à ${euros(l.currentBid)}, clôture dans ${leftLabel(l.closesAt - now)}. Relancez dès ${euros(Engine().minNextBidFor(l))}.`,
            url: AUCTIONS_URL, tag: `out:${field}:${l.id}`,
          });
        }
      }
      if (l.closesAt - now > AUCTION_ENDING_MS) return;
      if (!staffLabel && watched.has(String(l.playerId))) return; // déjà prévenu (joueur suivi, mkt_end_)
      const key = `end:${field}:${l.id}`;
      if (seen.has(key)) return;
      mark(key);
      out.push({
        title: `Fin d'enchère dans moins d'une heure : ${what}`,
        body: lead ? `Vous êtes en tête à ${euros(l.currentBid)}.` : `Vous avez été dépassé (${euros(l.currentBid)}). Il est encore temps de surenchérir.`,
        url: AUCTIONS_URL, tag: key,
      });
      return;
    }
    if (now - l.closesAt > AUCTION_RESULT_WINDOW_MS) return;
    const key = `res:${field}:${l.id}`;
    if (seen.has(key)) return;
    mark(key);
    const won = lead && (l.result === "sold");
    if (won && !staffLabel) return; // arrivée du joueur : déjà notifiée (fil, push: true)
    if (lead && l.result === "buyer-failed") {
      out.push({ title: `Enchère annulée : ${what}`, body: "Budget insuffisant au moment de la clôture.", url: "/", tag: key });
    } else if (won) {
      out.push({ title: `Enchère remportée : ${what}`, body: `Recruté pour ${euros(l.finalPrice)}.`, url: "/", tag: key });
    } else if (!lead) {
      out.push({ title: `Enchère perdue : ${what}`, body: l.finalPrice ? `Parti pour ${euros(l.finalPrice)}.` : "Un autre club a remporté l'enchère.", url: "/", tag: key });
    }
  });
  const isLocalMe = b => b && b.bidderIdx === teamIdx;
  const localPlayer = l => (typeof league.playerById === "function" ? league.playerById(l.playerId) : null);
  AUCTION_MARKETS.forEach(([field, staffLabel]) => scan(field, staffLabel, league[field], isLocalMe, localPlayer));
  if (opts.leagueId && opts.leagues) {
    const FOREIGN = Engine().FOREIGN_BIDDER_IDX;
    const isRemoteMe = b => !!(b && b.bidderIdx === FOREIGN && b.bidderRef && b.bidderRef.leagueId === opts.leagueId && b.bidderRef.idx === teamIdx);
    for (const [oid, olg] of opts.leagues) {
      if (oid === opts.leagueId || !olg) continue;
      const playerOf = l => { const s = olg.teams[l.sellerIdx]; return (s && s.players.find(p => p.id === l.playerId)) || null; };
      scan(`world:${oid}`, null, olg.transferListings, isRemoteMe, playerOf);
    }
  }
  return out;
}

function entryNumber(e) { const m = /^evt_(\d+)$/.exec(e.id || ""); return m ? Number(m[1]) : 0; }

// Notifications dues pour un club (et mise à jour de ses curseurs).
function collect(league, teamIdx, now, opts = {}) {
  const team = league.teams[teamIdx];
  const out = [];
  Object.entries(league.liveMatches || {}).forEach(([key, m]) => {
    if (m.homeIdx !== teamIdx && m.awayIdx !== teamIdx) return;
    if (now < m.kickoffAt || now > m.kickoffAt + KICKOFF_WINDOW_MS) return;
    team.pushKickoffKeys = team.pushKickoffKeys || [];
    if (team.pushKickoffKeys.includes(key)) return;
    team.pushKickoffKeys = team.pushKickoffKeys.concat([key]).slice(-10);
    const oppIdx = m.homeIdx === teamIdx ? m.awayIdx : m.homeIdx;
    const opp = league.teams[oppIdx] || (m.guest && m.guest.team ? { name: m.guest.team.teamName } : null);
    out.push({ title: "Votre match commence !", body: `${team.name} contre ${opp ? opp.name : "votre adversaire"} : c'est parti, en direct.`, url: "/", tag: `kickoff-${key}` });
  });
  auctionNotes(league, teamIdx, now, opts).forEach(n => out.push(n));
  const cursor = typeof team.pushCursor === "number" ? team.pushCursor : 0;
  const fresh = ((team.feed && team.feed.entries) || []).filter(e => entryNumber(e) > cursor)
    .filter(e => e.push === true || /^injury_|^mkt_end_/.test(e.key || ""))
    .sort((a, b) => entryNumber(a) - entryNumber(b));
  fresh.forEach(e => out.push({ title: e.title, body: e.text || "", url: "/", tag: e.key || e.id }));
  if (team.feed) team.pushCursor = (team.feed.nextId || 1) - 1;
  return out;
}

async function flushLeague(league, now, { send = WebPush.sendPush, leagueId = null, leagues = null } = {}) {
  if (!WebPush.vapidConfig() || !league) return 0;
  let sent = 0;
  for (let idx = 0; idx < league.teams.length; idx++) {
    const team = league.teams[idx];
    if (!team || !team.isHuman || !(team.pushSubscriptions || []).length || !isPremium(team, now)) continue;
    const notes = collect(league, idx, now, { leagueId, leagues }).slice(-MAX_PER_FLUSH);
    for (const note of notes) {
      for (const sub of team.pushSubscriptions.slice()) {
        const r = await send(sub, note);
        if (r.ok) sent++;
        if (r.gone) removeSubscription(team, sub.endpoint);
      }
    }
  }
  return sent;
}

module.exports = { auctionNotes, MAX_SUBSCRIPTIONS, addSubscription, removeSubscription, collect, flushLeague, isPremium };
