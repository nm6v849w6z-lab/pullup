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
//    arrivée ou départ d'un joueur (push: true).
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
  return true;
}

function removeSubscription(team, endpoint) {
  const before = (team.pushSubscriptions || []).length;
  team.pushSubscriptions = (team.pushSubscriptions || []).filter(x => x.endpoint !== endpoint);
  return team.pushSubscriptions.length !== before;
}

function entryNumber(e) { const m = /^evt_(\d+)$/.exec(e.id || ""); return m ? Number(m[1]) : 0; }

// Notifications dues pour un club (et mise à jour de ses curseurs).
function collect(league, teamIdx, now) {
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
  const cursor = typeof team.pushCursor === "number" ? team.pushCursor : 0;
  const fresh = ((team.feed && team.feed.entries) || []).filter(e => entryNumber(e) > cursor)
    .filter(e => e.push === true || /^injury_|^mkt_end_/.test(e.key || ""))
    .sort((a, b) => entryNumber(a) - entryNumber(b));
  fresh.forEach(e => out.push({ title: e.title, body: e.text || "", url: "/", tag: e.key || e.id }));
  if (team.feed) team.pushCursor = (team.feed.nextId || 1) - 1;
  return out;
}

async function flushLeague(league, now, { send = WebPush.sendPush } = {}) {
  if (!WebPush.vapidConfig() || !league) return 0;
  let sent = 0;
  for (let idx = 0; idx < league.teams.length; idx++) {
    const team = league.teams[idx];
    if (!team || !team.isHuman || !(team.pushSubscriptions || []).length || !isPremium(team, now)) continue;
    const notes = collect(league, idx, now).slice(-MAX_PER_FLUSH);
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

module.exports = { MAX_SUBSCRIPTIONS, addSubscription, removeSubscription, collect, flushLeague, isPremium };
