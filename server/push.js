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

// `lang` (fr / en / it) : langue des notifications de CET appareil (celle
// du compte, sinon celle du jeu dans ce navigateur, voir /api/push/subscribe).
function addSubscription(team, sub, now, lang = null) {
  if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return false;
  team.pushSubscriptions = (team.pushSubscriptions || []).filter(x => x.endpoint !== sub.endpoint);
  team.pushSubscriptions.push({ endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) }, createdAt: now, ...(["fr", "en", "it"].includes(lang) ? { lang } : {}) });
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

// Marché → rôle du staff (null : joueurs). Libellés par langue dans STAFF.
const AUCTION_MARKETS = [
  ["transferListings", null],
  ["coachListings", "coach"],
  ["assistantCoachListings", "assistant"],
  ["analystListings", "analyst"],
  ["recruiterListings", "recruiter"],
  ["doctorListings", "doctor"],
  ["physioListings", "physio"],
];

// ---------------------------------------------------------------------
// Textes des notifications par langue (2026-09-30 : fr / en / it). Chaque
// note garde son texte français (title / body) et sa recette (`msg` : id +
// paramètres) ; localizeNote la réécrit dans la langue de l'appareil
// destinataire (langue enregistrée avec l'abonnement, voir addSubscription).
// Les entrées du fil (blessure, arrivée…) sont traduites par le
// dictionnaire du jeu (server/i18n.js). Vocabulaire : glossaire de
// assets/i18n/it.js (asta, offerta, vice allenatore, osservatore…).
// ---------------------------------------------------------------------
const STAFF = {
  fr: { coach: "l'entraîneur", assistant: "l'entraîneur adjoint", analyst: "l'analyste vidéo", recruiter: "le recruteur", doctor: "le médecin", physio: "le kiné" },
  en: { coach: "the coach", assistant: "the assistant coach", analyst: "the video analyst", recruiter: "the scout", doctor: "the doctor", physio: "the physio" },
  it: { coach: "l'allenatore", assistant: "il vice allenatore", analyst: "il video analista", recruiter: "l'osservatore", doctor: "il medico", physio: "il fisioterapista" },
};
const WORDS = {
  fr: { level: "niveau", aPlayer: "un joueur", opponent: "votre adversaire", min: "min", h: "h", d: "j" },
  en: { level: "level", aPlayer: "a player", opponent: "your opponent", min: "min", h: "h", d: "d" },
  it: { level: "livello", aPlayer: "un giocatore", opponent: "il tuo avversario", min: "min", h: "h", d: "g" },
};
const MESSAGES = {
  kickoff: {
    fr: p => ({ title: "Votre match commence !", body: `${p.team} contre ${p.opp} : c'est parti, en direct.` }),
    en: p => ({ title: "Your game is starting!", body: `${p.team} vs ${p.opp}: tip-off, live now.` }),
    it: p => ({ title: "La tua partita sta per iniziare!", body: `${p.team} contro ${p.opp}: si parte, in diretta.` }),
  },
  autoOutbid: {
    fr: p => ({ title: `Plafond dépassé : ${p.what}`, body: `Votre enchère automatique (jusqu'à ${p.max}) ne suffit plus : offre à ${p.bid}, clôture dans ${p.left}.` }),
    en: p => ({ title: `Max bid exceeded: ${p.what}`, body: `Your automatic bid (up to ${p.max}) is no longer enough: the offer is at ${p.bid}, closing in ${p.left}.` }),
    it: p => ({ title: `Tetto superato: ${p.what}`, body: `La tua offerta automatica (fino a ${p.max}) non basta più: offerta a ${p.bid}, chiusura tra ${p.left}.` }),
  },
  outbid: {
    fr: p => ({ title: `Enchère dépassée : ${p.what}`, body: `Nouvelle offre à ${p.bid}, clôture dans ${p.left}. Relancez dès ${p.next}.` }),
    en: p => ({ title: `Outbid: ${p.what}`, body: `New offer at ${p.bid}, closing in ${p.left}. Bid again from ${p.next}.` }),
    it: p => ({ title: `Offerta superata: ${p.what}`, body: `Nuova offerta a ${p.bid}, chiusura tra ${p.left}. Rilancia da ${p.next}.` }),
  },
  ending: {
    fr: p => ({ title: `Fin d'enchère dans moins d'une heure : ${p.what}`, body: p.lead ? `Vous êtes en tête à ${p.bid}.` : `Vous avez été dépassé (${p.bid}). Il est encore temps de surenchérir.` }),
    en: p => ({ title: `Auction ends in less than an hour: ${p.what}`, body: p.lead ? `You're leading at ${p.bid}.` : `You've been outbid (${p.bid}). There's still time to raise your bid.` }),
    it: p => ({ title: `L'asta si chiude tra meno di un'ora: ${p.what}`, body: p.lead ? `Sei in testa a ${p.bid}.` : `Sei stato superato (${p.bid}). Hai ancora tempo per rilanciare.` }),
  },
  cancelled: {
    fr: p => ({ title: `Enchère annulée : ${p.what}`, body: "Budget insuffisant au moment de la clôture." }),
    en: p => ({ title: `Auction cancelled: ${p.what}`, body: "Not enough budget when the auction closed." }),
    it: p => ({ title: `Asta annullata: ${p.what}`, body: "Budget insufficiente al momento della chiusura." }),
  },
  won: {
    fr: p => ({ title: `Enchère remportée : ${p.what}`, body: `Recruté pour ${p.price}.` }),
    en: p => ({ title: `Auction won: ${p.what}`, body: `Signed for ${p.price}.` }),
    it: p => ({ title: `Asta vinta: ${p.what}`, body: `Ingaggiato per ${p.price}.` }),
  },
  lost: {
    fr: p => ({ title: `Enchère perdue : ${p.what}`, body: p.price ? `Parti pour ${p.price}.` : "Un autre club a remporté l'enchère." }),
    en: p => ({ title: `Auction lost: ${p.what}`, body: p.price ? `Gone for ${p.price}.` : "Another club won the auction." }),
    it: p => ({ title: `Asta persa: ${p.what}`, body: p.price ? `Ceduto per ${p.price}.` : "Un altro club si è aggiudicato l'asta." }),
  },
};

// Paramètres bruts → textes dans la langue : { money: n } → montant,
// { ms: n } → durée restante, { staff, level } / { player } → objet de
// l'enchère ; le reste tel quel.
function renderParams(params, lang) {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v && typeof v === "object" && "money" in v) out[k] = v.money == null ? null : euros(v.money, lang);
    else if (v && typeof v === "object" && "ms" in v) out[k] = leftLabel(v.ms, lang);
    else if (v && typeof v === "object" && "staff" in v) out[k] = `${STAFF[lang][v.staff]} (${WORDS[lang].level} ${v.level})`;
    else if (v && typeof v === "object" && "player" in v) out[k] = v.player || WORDS[lang].aPlayer;
    else if (v && typeof v === "object" && "opp" in v) out[k] = v.opp || WORDS[lang].opponent;
    else out[k] = v;
  });
  return out;
}

// Note structurée : texte français + recette pour les autres langues.
function mkNote(id, params, extra) {
  const fr = MESSAGES[id].fr(renderParams(params, "fr"));
  return Object.assign({ title: fr.title, body: fr.body }, extra, { msg: { id, params } });
}

function pickLang(l) { return l === "en" || l === "it" ? l : "fr"; }
function pickLangOrNull(l) { return l === "fr" || l === "en" || l === "it" ? l : null; }

// Montants du fil (« 120 000 € ») à la façon de la langue (comme le jeu :
// 120,000 € en anglais, 120.000 € en italien).
function localizeAmounts(s, lang) {
  if (lang === "fr" || typeof s !== "string") return s;
  return s.replace(/(\d{1,3}(?:[\s  ]\d{3})+)(?=\s?€)/g, m => m.replace(/[\s  ]/g, lang === "en" ? "," : "."));
}

// Note prête à envoyer dans la langue voulue ({ title, body, url, tag }).
function localizeNote(note, lang) {
  lang = pickLang(lang);
  const base = { title: note.title, body: note.body, url: note.url, tag: note.tag };
  if (lang === "fr") return base;
  if (note.msg && MESSAGES[note.msg.id]) return Object.assign(base, MESSAGES[note.msg.id][lang](renderParams(note.msg.params, lang)));
  if (note.feed) {
    const I18n = require("./i18n.js");
    return Object.assign(base, {
      title: localizeAmounts(I18n.translate(lang, note.title), lang),
      body: localizeAmounts(I18n.translate(lang, note.body), lang),
    });
  }
  return base;
}

// Langue d'un appareil abonné : celle enregistrée avec l'abonnement, sinon
// celle du club (team.lang, si elle est un jour recopiée du compte), sinon
// le français.
function subscriptionLang(team, sub) {
  return pickLang((sub && sub.lang) || (team && team.lang));
}
const AUCTION_ENDING_MS = 60 * 60 * 1000;
const AUCTION_RESULT_WINDOW_MS = 24 * 3600 * 1000;
const AUCTION_KEYS_KEPT = 100;
// Chargé à la demande (engine.js est volumineux, et ce module est aussi
// utilisé seul par les tests).
let engineMod = null;
function Engine() { if (!engineMod) engineMod = require("../engine.js"); return engineMod; }

const NUM_LOCALE = { fr: "fr-FR", en: "en-GB", it: "it-IT" };
function euros(n, lang = "fr") { return `${Math.round(n || 0).toLocaleString(NUM_LOCALE[lang] || "fr-FR")} €`; }

function leftLabel(ms, lang = "fr") {
  const w = WORDS[lang] || WORDS.fr;
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} ${w.min}`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} ${w.h}`;
  return `${Math.round(h / 24)} ${w.d}`;
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
    const what = staffLabel ? { staff: staffLabel, level: l.level } : { player: player ? player.name : null };
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
          const extra = { url: AUCTIONS_URL, tag: `out:${field}:${l.id}` };
          out.push(auto
            ? mkNote("autoOutbid", { what, max: { money: auto.max }, bid: { money: l.currentBid }, left: { ms: l.closesAt - now } }, extra)
            : mkNote("outbid", { what, bid: { money: l.currentBid }, left: { ms: l.closesAt - now }, next: { money: Engine().minNextBidFor(l) } }, extra));
        }
      }
      if (l.closesAt - now > AUCTION_ENDING_MS) return;
      if (!staffLabel && watched.has(String(l.playerId))) return; // déjà prévenu (joueur suivi, mkt_end_)
      const key = `end:${field}:${l.id}`;
      if (seen.has(key)) return;
      mark(key);
      out.push(mkNote("ending", { what, lead: !!lead, bid: { money: l.currentBid } }, { url: AUCTIONS_URL, tag: key }));
      return;
    }
    if (now - l.closesAt > AUCTION_RESULT_WINDOW_MS) return;
    const key = `res:${field}:${l.id}`;
    if (seen.has(key)) return;
    mark(key);
    const won = lead && (l.result === "sold");
    if (won && !staffLabel) return; // arrivée du joueur : déjà notifiée (fil, push: true)
    if (lead && l.result === "buyer-failed") {
      out.push(mkNote("cancelled", { what }, { url: "/", tag: key }));
    } else if (won) {
      out.push(mkNote("won", { what, price: { money: l.finalPrice } }, { url: "/", tag: key }));
    } else if (!lead) {
      out.push(mkNote("lost", { what, price: { money: l.finalPrice ? l.finalPrice : null } }, { url: "/", tag: key }));
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
    out.push(mkNote("kickoff", { team: team.name, opp: { opp: opp ? opp.name : null } }, { url: "/", tag: `kickoff-${key}` }));
  });
  auctionNotes(league, teamIdx, now, opts).forEach(n => out.push(n));
  const cursor = typeof team.pushCursor === "number" ? team.pushCursor : 0;
  const fresh = ((team.feed && team.feed.entries) || []).filter(e => entryNumber(e) > cursor)
    .filter(e => e.push === true || /^injury_|^mkt_end_/.test(e.key || ""))
    .sort((a, b) => entryNumber(a) - entryNumber(b));
  fresh.forEach(e => out.push({ title: e.title, body: e.text || "", url: "/", tag: e.key || e.id, feed: true }));
  if (team.feed) team.pushCursor = (team.feed.nextId || 1) - 1;
  return out;
}

// Langue du COMPTE du club (Accounts.langFor), fournie par le serveur
// (server/index.js:createHandler → setLangResolver) : async team → "fr" |
// "en" | "it" | null (club sans compte). Elle l'emporte sur la langue
// rangée avec l'abonnement : changer de langue dans Paramètres change aussi
// celle des notifications, sur tous les appareils.
let langResolver = null;
function setLangResolver(fn) { langResolver = typeof fn === "function" ? fn : null; }
// Langue du compte d'un club (même résolution que les notifications).
async function langForTeam(team) { return langResolver && team ? langResolver(team) : null; }

async function flushLeague(league, now, { send = WebPush.sendPush, leagueId = null, leagues = null, langOf = langResolver } = {}) {
  if (!WebPush.vapidConfig() || !league) return 0;
  let sent = 0;
  for (let idx = 0; idx < league.teams.length; idx++) {
    const team = league.teams[idx];
    if (!team || !team.isHuman || !(team.pushSubscriptions || []).length || !isPremium(team, now)) continue;
    const notes = collect(league, idx, now, { leagueId, leagues }).slice(-MAX_PER_FLUSH);
    if (!notes.length) continue;
    let accountLang = null;
    if (langOf) { try { accountLang = pickLangOrNull(await langOf(team)); } catch (e) { /* langue de l'abonnement */ } }
    for (const note of notes) {
      for (const sub of team.pushSubscriptions.slice()) {
        const r = await send(sub, localizeNote(note, accountLang || subscriptionLang(team, sub)));
        if (r.ok) sent++;
        if (r.gone) removeSubscription(team, sub.endpoint);
      }
    }
  }
  return sent;
}

module.exports = { localizeNote, subscriptionLang, setLangResolver, langForTeam, MESSAGES, auctionNotes, MAX_SUBSCRIPTIONS, addSubscription, removeSubscription, collect, flushLeague, isPremium };
