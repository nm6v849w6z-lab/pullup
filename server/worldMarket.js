"use strict";

// =====================================================================
// MARCHÉ DES TRANSFERTS MONDIAL (retour utilisateur 2026-09-28 : « marché
// des transferts mondial »). Chaque annonce reste rangée dans le
// championnat du vendeur (League.transferListings, source de vérité) ; le
// monde tient en plus un INDEX de toutes les annonces ouvertes (données
// annexes « market », voir store.loadWorldAuxRaw), reconstruit à chaque
// rattrapage du monde (server/world.js:catchUpWorld, au plus toutes les
// 10 minutes) et mis à jour à chaque enchère venue d'ailleurs.
//
//  - Navigateur : GET /api/save ajoute aux annonces de sa ligue celles des
//    AUTRES championnats (projectForLeague) : id négatif (−gid, identifiant
//    global stable), vendeur = club invité « léger » (index 1000 + k, avec
//    ses joueurs en vente seulement), enchérisseur en tête = soi-même ou
//    FOREIGN_BIDDER_IDX. Même rendu que le marché de sa ligue.
//  - Enchère sur une annonce d'un autre championnat (id négatif) :
//    placeForeignBid charge la ligue du vendeur, applique
//    League.placeForeignBid (mêmes contrôles que placeBid), sauvegarde.
//  - Clôture : League._resolveListing marque l'annonce « foreign-pending » ;
//    resolveForeignTransfers (catchUpWorld, toutes les ligues en main) fait
//    le transfert (Engine.transferPlayerBetweenTeams).
//  - Ligue du vendeur : un enchérisseur d'ailleurs y apparaît en club
//    invité léger (index 2000 + k, voir projectOwnForeignBidders).
// =====================================================================

const Engine = require("../engine.js");

const FOREIGN = Engine.FOREIGN_BIDDER_IDX;
const MARKET_GUEST_SELLER_IDX = 1000;
const MARKET_GUEST_BIDDER_IDX = 2000;
const MARKET_PROJECTION_LIMIT = 150;
// Agents libres (demande du 2026-10-01) : « vendeur » fictif dans l'index.
const FREE_AGENT_SELLER_IDX = -2;

// Joueur en vente, allégé (sans journal de matchs ni progression interne) :
// l'index est relu à chaque chargement du jeu par tous les managers.
function leanPlayerRecord(player) {
  const r = Engine.serializePlayerRecord(player);
  r.matchLog = [];
  r.progressLog = [];
  r.weeklyHistory = [];
  delete r._trainProgress;
  return r;
}

function refOfBid(league, leagueId, b) {
  if (b.bidderIdx === FOREIGN && b.bidderRef) return { ...b.bidderRef };
  const t = league.teams[b.bidderIdx];
  return t ? { leagueId, idx: b.bidderIdx, name: t.name } : null;
}

// Club en tête d'une annonce (référence mondiale), null sans offre.
function leaderOf(lg, leagueId, l) {
  if (l.currentBidderIdx == null) return null;
  if (l.currentBidderIdx === FOREIGN) return { ...(l.currentBidderRef || {}) };
  return { leagueId, idx: l.currentBidderIdx, name: (lg.teams[l.currentBidderIdx] || {}).name || "?" };
}
// Plafonds d'enchère automatique (voir AUTO_BID_FIELDS, engine.js) en
// références mondiales. Gardés dans l'index (côté serveur uniquement) pour
// que projectForLeague rende à chacun SON plafond (myAutoMax), jamais celui
// des autres.
function autoRefsOf(lg, leagueId, l) {
  return (l.autoBids || []).map(a => ({ ref: a.bidderIdx === FOREIGN ? { ...(a.bidderRef || {}) } : { leagueId, idx: a.bidderIdx }, max: a.max }));
}
// Accords et négociations de contrat (voir League.negotiateTransferContract)
// des clubs d'AUTRES championnats : chacun ne voit que les siens (voir
// projectForLeague, myAgreement/myNegotiation).
function refFromKey(key) {
  const m = /^w:(.+):(-?\d+)$/.exec(String(key));
  return m ? { leagueId: m[1], idx: Number(m[2]) } : null;
}
function dealsOf(l) {
  const out = { agreements: [], negotiations: [] };
  Object.entries(l.agreements || {}).forEach(([k, v]) => { const ref = refFromKey(k); if (ref) out.agreements.push({ ref, salary: v.salary, seasons: v.seasons }); });
  Object.entries(l.negotiations || {}).forEach(([k, v]) => { const ref = refFromKey(k); if (ref) out.negotiations.push({ ref, refusals: v.refusals, demand: v.demand }); });
  return out;
}

// Index de toutes les annonces ouvertes du monde. `prev` : index précédent
// (garde les identifiants globaux stables) ; `leagues` : Map id → League ;
// `labelOf(entry)` : libellé du championnat (« Division II.1 »).
function buildIndex(prev, worldLeagues, leagues, now, labelOf) {
  const gids = { ...((prev && prev.gids) || {}) };
  let seq = (prev && prev.seq) || 0;
  const entries = [];
  const alive = new Set();
  worldLeagues.forEach(e => {
    const lg = leagues.get(e.id);
    if (!lg) return;
    (lg.transferListings || []).forEach(l => {
      if (l.status !== "open" || now >= l.closesAt) return;
      const seller = l.freeAgent ? { name: "Agents libres", isHuman: false } : lg.teams[l.sellerIdx];
      const player = typeof lg.listingPlayer === "function" ? lg.listingPlayer(l) : (seller && seller.players.find(p => p.id === l.playerId));
      if (!seller || !player) return;
      const key = `${e.id}:${l.id}`;
      if (!gids[key]) gids[key] = ++seq;
      alive.add(key);
      const leader = leaderOf(lg, e.id, l);
      entries.push({
        gid: gids[key], leagueId: e.id, country: e.country, label: labelOf(e), listingId: l.id,
        sellerIdx: l.freeAgent ? FREE_AGENT_SELLER_IDX : l.sellerIdx, sellerName: seller.name, sellerHuman: !!seller.isHuman,
        freeAgent: !!l.freeAgent, formerTeamName: l.formerTeamName || null, askedSalary: typeof l.askedSalary === "number" ? l.askedSalary : null,
        player: leanPlayerRecord(player),
        startPrice: l.startPrice, currentBid: l.currentBid, currentBidder: leader,
        bids: (l.bids || []).map(b => ({ ref: refOfBid(lg, e.id, b), amount: b.amount, at: b.at })).filter(b => b.ref),
        createdAt: l.createdAt, closesAt: l.closesAt, autoRefs: autoRefsOf(lg, e.id, l), ...dealsOf(l),
      });
    });
  });
  Object.keys(gids).forEach(k => { if (!alive.has(k)) delete gids[k]; });
  return { version: 1, seq, gids, builtAt: now, entries };
}

// Prochaine clôture d'une annonce avec un enchérisseur d'ailleurs (le
// transfert se fait au rattrapage suivant : server/index.js le déclenche à
// cet instant).
function nextForeignClosing(index, now) {
  let next = null;
  ((index && index.entries) || []).forEach(en => {
    if (!en.currentBidder || en.currentBidder.leagueId === en.leagueId) return;
    if (en.closesAt > now && (next == null || en.closesAt < next)) next = en.closesAt;
  });
  return next;
}

// Annonces des AUTRES championnats, dans le repère de la ligue d'un
// manager (voir le commentaire de tête).
function projectForLeague(index, leagueId, teamIdx, now, limit = MARKET_PROJECTION_LIMIT) {
  const isMe = ref => !!(ref && ref.leagueId === leagueId && ref.idx === teamIdx);
  const foreign = ((index && index.entries) || []).filter(en => en.leagueId !== leagueId && en.closesAt > now);
  const involved = foreign.filter(en => en.bids.some(b => isMe(b.ref)));
  const others = foreign.filter(en => !involved.includes(en)).sort((a, b) => a.closesAt - b.closesAt).slice(0, Math.max(0, limit - involved.length));
  const chosen = involved.concat(others);
  const sellers = new Map();
  const guests = [];
  const listings = chosen.map(en => {
    const key = `${en.leagueId}:${en.sellerIdx}`;
    let g = sellers.get(key);
    if (!g) {
      g = { localIdx: MARKET_GUEST_SELLER_IDX + sellers.size, leagueId: en.leagueId, idx: en.sellerIdx, level: null, light: { name: en.sellerName, country: en.country, players: [] } };
      sellers.set(key, g);
      guests.push(g);
    }
    g.light.players.push(en.player);
    const localBidder = ref => (isMe(ref) ? teamIdx : (ref && ref.leagueId === leagueId ? ref.idx : FOREIGN));
    const myAuto = (en.autoRefs || []).find(a => isMe(a.ref));
    const myDeal = (en.agreements || []).find(a => isMe(a.ref));
    const myNego = (en.negotiations || []).find(a => isMe(a.ref));
    return {
      ...(myAuto ? { myAutoMax: myAuto.max } : {}),
      ...(myDeal ? { myAgreement: { salary: myDeal.salary, seasons: myDeal.seasons } } : {}),
      ...(myNego ? { myNegotiation: { refusals: myNego.refusals, demand: myNego.demand } } : {}),
      id: -en.gid, playerId: en.player.id, sellerIdx: g.localIdx,
      startPrice: en.startPrice, currentBid: en.currentBid,
      currentBidderIdx: en.currentBidder ? localBidder(en.currentBidder) : null,
      currentBidderRef: en.currentBidder && en.currentBidder.leagueId !== leagueId ? en.currentBidder : null,
      bids: en.bids.map(b => ({ bidderIdx: localBidder(b.ref), amount: b.amount, at: b.at })),
      createdAt: en.createdAt, closesAt: en.closesAt, lastCpuCheckAt: en.createdAt,
      status: "open", result: null, finalPrice: null,
      ...(en.askedSalary != null ? { askedSalary: en.askedSalary } : {}),
      ...(en.freeAgent ? { freeAgent: true, formerTeamName: en.formerTeamName || null } : {}),
      foreign: { leagueId: en.leagueId, label: en.label, country: en.country, sellerName: en.sellerName },
    };
  });
  return { listings, guests };
}

// Ligue du vendeur : enchérisseurs d'ailleurs → clubs invités légers
// (index 2000 + k) dans les annonces envoyées au navigateur (copie).
function projectOwnForeignBidders(listings) {
  const byKey = new Map();
  const guests = [];
  const localOf = ref => {
    const key = `${ref.leagueId}:${ref.idx}`;
    let g = byKey.get(key);
    if (!g) {
      g = { localIdx: MARKET_GUEST_BIDDER_IDX + byKey.size, leagueId: ref.leagueId, idx: ref.idx, light: { name: ref.name || "Club étranger", players: [] } };
      byKey.set(key, g);
      guests.push(g);
    }
    return g.localIdx;
  };
  const out = (listings || []).map(l => {
    if (!l || (l.currentBidderIdx !== FOREIGN && !(l.bids || []).some(b => b.bidderIdx === FOREIGN))) return l;
    return {
      ...l,
      currentBidderIdx: l.currentBidderIdx === FOREIGN && l.currentBidderRef ? localOf(l.currentBidderRef) : l.currentBidderIdx,
      bids: (l.bids || []).map(b => (b.bidderIdx === FOREIGN && b.bidderRef ? { ...b, bidderIdx: localOf(b.bidderRef) } : b)),
    };
  });
  return { listings: out, guests };
}

// Enchère d'un manager (ctx : sa ligue et son club) sur l'annonce d'un
// autre championnat. `loadLeague(id)` / `saveLeague(lg)` fournis par
// l'appelant (server/index.js). Renvoie { ok, listing? , reason?, minBid? }.
async function placeForeignBid({ index, leagueId, teamIdx, team, gid, amount, now, loadLeague, saveLeague, saveIndex, seasons = null }) {
  const en = ((index && index.entries) || []).find(x => x.gid === gid);
  if (!en || en.leagueId === leagueId) return { ok: false, reason: "closed" };
  const lg = await loadLeague(en.leagueId);
  if (!lg) return { ok: false, reason: "closed" };
  const res = lg.placeForeignBid(en.listingId, { leagueId, idx: teamIdx, name: team.name }, team, amount, now, seasons);
  if (!res.ok) return res;
  await saveLeague(lg);
  syncEntry(en, lg, res.listing);
  await saveIndex(index);
  return { ok: true, entry: en, autoOutbid: !!res.autoOutbid };
}

function syncEntry(en, lg, l) {
  en.currentBid = l.currentBid;
  en.currentBidder = leaderOf(lg, en.leagueId, l);
  en.bids = (l.bids || []).map(b => ({ ref: refOfBid(lg, en.leagueId, b), amount: b.amount, at: b.at })).filter(b => b.ref);
  en.autoRefs = autoRefsOf(lg, en.leagueId, l);
  Object.assign(en, dealsOf(l));
}

// Négociation du contrat avec le joueur d'une annonce d'un autre
// championnat (voir League.negotiateTransferContract) : mêmes paramètres
// que placeForeignBid, `offer` = { salary, seasons }.
async function negotiateForeign({ index, leagueId, teamIdx, team, gid, offer, now, loadLeague, saveLeague, saveIndex }) {
  const en = ((index && index.entries) || []).find(x => x.gid === gid);
  if (!en || en.leagueId === leagueId) return { ok: false, reason: "closed" };
  const lg = await loadLeague(en.leagueId);
  if (!lg) return { ok: false, reason: "closed" };
  const res = lg.negotiateTransferContract(en.listingId, null, offer, now, { ref: { leagueId, idx: teamIdx, name: team.name }, team });
  if (!res.ok) return res;
  const listing = (lg.transferListings || []).find(l => l.id === en.listingId);
  await saveLeague(lg);
  if (listing) syncEntry(en, lg, listing);
  await saveIndex(index);
  return res;
}

// Enchère automatique d'un manager sur l'annonce d'un autre championnat
// (voir League.setAutoBid) : mêmes paramètres que placeForeignBid, `max`
// au lieu de `amount` (0 = plafond retiré). Renvoie { ok, leading } ou
// { ok: false, reason, minBid? }.
async function setForeignAutoBid({ index, leagueId, teamIdx, team, gid, max, now, loadLeague, saveLeague, saveIndex, seasons = null }) {
  const en = ((index && index.entries) || []).find(x => x.gid === gid);
  if (!en || en.leagueId === leagueId) return { ok: false, reason: "closed" };
  const lg = await loadLeague(en.leagueId);
  if (!lg) return { ok: false, reason: "closed" };
  const res = lg.setAutoBid("transferListings", en.listingId, null, max, now, { ref: { leagueId, idx: teamIdx, name: team.name }, team }, seasons);
  if (!res.ok) return res;
  await saveLeague(lg);
  syncEntry(en, lg, res.listing);
  await saveIndex(index);
  return { ok: true, leading: res.leading, removed: !!res.removed, entry: en };
}

// Transferts conclus avec un club d'ailleurs (toutes les ligues en main,
// voir catchUpWorld). Renvoie la liste des événements.
function resolveForeignTransfers(leagues, now, events = []) {
  for (const [id, lg] of leagues) {
    (lg.transferListings || []).forEach(l => {
      if (l.result !== "foreign-pending") return;
      const ref = l.currentBidderRef;
      const buyerLg = ref && leagues.get(ref.leagueId);
      const buyer = buyerLg && buyerLg.teams[ref.idx];
      const seller = l.freeAgent ? null : lg.teams[l.sellerIdx];
      if (!buyer || buyer.name !== ref.name) {
        l.result = "buyer-failed";
        // Agent libre resté sans club : même suite qu'un invendu.
        if (l.freeAgent && typeof lg._placeUnsoldFreeAgent === "function") lg._placeUnsoldFreeAgent(l, now);
        return;
      }
      const buyerSeason = typeof buyerLg.contractSeason === "function" ? buyerLg.contractSeason() : 1;
      // Agent libre (demande du 2026-10-01) : prime de signature, pas de vendeur.
      const res = l.freeAgent
        ? lg.signFreeAgentFromListing(l, buyer, buyerSeason, now, { leagueId: ref.leagueId, idx: ref.idx })
        : Engine.transferPlayerBetweenTeams(seller, buyer, l.playerId, l.currentBid, now);
      l.result = res.result;
      if (l.freeAgent && res.result === "buyer-failed" && typeof lg._placeUnsoldFreeAgent === "function") lg._placeUnsoldFreeAgent(l, now);
      if (res.result === "sold" && !l.freeAgent) lg._applyTransferContract(l, buyer, res.player, buyerSeason, now);
      if (res.result === "sold") {
        // Autre championnat : ses matchs de la saison ne comptent pas dans
        // les statistiques de sa nouvelle ligue (leaders, fiche, feuilles).
        if (res.player && id !== ref.leagueId && Array.isArray(res.player.matchLog) && res.player.matchLog.length) {
          // Mises de côté, jamais supprimées (feuilles de match de l'ancien club).
          res.player.archivedMatchLog = (res.player.archivedMatchLog || []).concat(res.player.matchLog.map(e => ({ ...e, team: e.team || (seller ? seller.name : null), leagueId: id })));
          res.player.matchLog = [];
        }
        l.finalPrice = l.currentBid;
        // Historique des transferts : chez le vendeur (son championnat) et
        // chez l'acheteur (l'autre championnat), même identifiant.
        if (!l.freeAgent && typeof Engine.recordTeamTransfer === "function") {
          const mvId = `w:${id}:L${l.id}`;
          const fromRef = Engine.transferTeamRef(seller, id, l.sellerIdx);
          const toRef = Engine.transferTeamRef(buyer, ref.leagueId, ref.idx);
          Engine.recordTeamTransfer(buyer, { id: mvId, at: now, kind: "buy", player: res.player, from: fromRef, to: toRef, fee: l.currentBid, human: buyer.isHuman });
          Engine.recordTeamTransfer(seller, { id: mvId, at: now, kind: "sell", player: res.player, from: fromRef, to: toRef, fee: l.currentBid, human: seller.isHuman });
        }
        if (seller && seller.isHuman && buyer.isHuman && typeof lg.logHumanTransfer === "function") lg.logHumanTransfer(seller.name, `${buyer.name} (${ref.leagueId})`, res.player, l.currentBid, now);
        events.push({ type: "world-transfer", from: id, to: ref.leagueId, player: res.player.name, fee: l.currentBid });
      }
    });
  }
  return events;
}

module.exports = {
  FREE_AGENT_SELLER_IDX, MARKET_GUEST_SELLER_IDX, MARKET_GUEST_BIDDER_IDX, MARKET_PROJECTION_LIMIT,
  buildIndex, nextForeignClosing, projectForLeague, projectOwnForeignBidders, placeForeignBid, setForeignAutoBid, negotiateForeign, resolveForeignTransfers,
};
