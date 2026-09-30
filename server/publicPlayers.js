"use strict";

// =====================================================================
// INFORMATIONS CACHÉES DES JOUEURS DES AUTRES CLUBS (2026-09-30, fuite
// relevée en codant Planète Hoop, correctif validé par l'utilisateur) :
// ce que le navigateur reçoit des clubs qui ne sont PAS ceux du manager.
//
// - Autre championnat (/api/world/team-page, league-page, player-page) :
//   aucun scouting possible, donc ni caractéristiques (`attrs`) ni potentiel
//   ni traits cachés — seulement ce que la page affiche (identité, âge,
//   taille, nationalité, poste, salaire public, forme physique, blessure,
//   stats et journal des matchs, récompenses, carrière). Exception : un
//   joueur sur le marché (annonce OUVERTE) garde ses caractéristiques, comme
//   sur le marché lui-même. Le joueur est marqué `attrsHidden` : le
//   navigateur n'en déduit alors aucune note (voir playerFromSave).
// - Son propre championnat (/api/save, clubs invités de Coupe/amicaux
//   compris) — 2026-09-30, suite validée par l'utilisateur : plus AUCUNE
//   caractéristique brute d'un adversaire, seulement celles que le
//   scouting a révélées pour ce club (Team.scoutedAttrs, séance vidéo) ;
//   joueur sur le marché : tout (comme le marché). Ce qui en dépendait est
//   calculé ICI : niveau de chaque club (`publicLevel`, niveau de
//   l'adversaire du tableau de bord), estimation des ventes comparables de
//   ses joueurs (`saleValuations`). Ni potentiel (sauf joueur sur le
//   marché, dont le marché affiche le palier), plafonds, progression,
//   motivation, agressivité, demande de transfert, discussions de retraite,
//   bonus de MVP en attente, mise en vente forcée ; côté club : académie,
//   scouting, fil, entretiens en attente.
// =====================================================================

// Jamais montré pour un joueur d'un autre club.
const HIDDEN_PLAYER_FIELDS = [
  "potential", "physicalPotential", "mentalPotential", "_trainProgress", "progressLog",
  "form", "weeksAtLowMotivation", "transferRequestActive", "transferRequestQuote", "transferRequestDiscussed",
  "retirementTalks", "pendingMatchBoost", "forSale", "salePrice", "trainingSecondsPlayedByPosition",
];
// En plus, pour un autre championnat (aucune simulation dans le navigateur).
const FOREIGN_EXTRA_PLAYER_FIELDS = ["attrs", "aggressiveness"];
// Données de club privées d'un autre club (supprimées : le navigateur
// reprend alors ses valeurs par défaut, voir teamFromSave).
const PRIVATE_TEAM_FIELDS = [
  "scoutedAttrs", "scoutingUnlocks", "scoutingAdWatchLog", "scoutingAdTickets",
  "youthCandidates", "youthPlayers", "pendingYouthDecisions",
  "feed", "pendingInterviews", "pendingRecapEvents", "marketAlertSeen", "ordersHistory",
];
const FOREIGN_PRIVATE_TEAM_FIELDS = [
  ...PRIVATE_TEAM_FIELDS,
  "transactions", "sponsorOffers", "trainingHistory", "lastTrainingReport", "tacticalKnowledge", "tacticalKnowledgeStreaks",
];

function openListingPlayerIds(listings) {
  return new Set((listings || []).filter(l => l && l.status === "open").map(l => l.playerId));
}

function stripFields(obj, fields) {
  fields.forEach(k => { if (k in obj) delete obj[k]; });
}

function sanitizeTeamPrivate(team, fields) {
  stripFields(team, fields);
}

// Caractéristiques révélées d'un joueur (clés `keys`).
function pickAttrs(attrs, keys) {
  const out = {};
  (keys || []).forEach(k => { if (attrs && typeof attrs[k] === "number") out[k] = attrs[k]; });
  return out;
}

// Un joueur d'un club adverse : caractéristiques révélées seulement.
function sanitizeOpponentPlayer(p, revealedKeys, listed, allAttrKeys) {
  const keepAll = listed.has(p.id);
  const potential = p.potential;
  stripFields(p, HIDDEN_PLAYER_FIELDS);
  delete p.aggressiveness;
  if (keepAll) { if (potential !== undefined) p.potential = potential; return; }
  const keys = (revealedKeys || []).filter(k => allAttrKeys.includes(k));
  if (allAttrKeys.length && keys.length === allAttrKeys.length) return; // entièrement scouté
  p.attrs = pickAttrs(p.attrs, keys);
  p.attrsHidden = true;
}

// /api/save : `leagueOut` = payload.league (sérialisé, modifiable).
// `opts.scouted` : Team.scoutedAttrs du manager ({ idx: [clés] }) ;
// `opts.levels` : { idx: niveau } (voir teamPublicLevel) ;
// `opts.attrKeys` : Engine.ATTRS.
function sanitizeOwnLeagueForViewer(leagueOut, viewerIdx, opts = {}) {
  if (!leagueOut || !Array.isArray(leagueOut.teams)) return leagueOut;
  const listed = openListingPlayerIds(leagueOut.transferListings);
  const scouted = opts.scouted || {};
  const levels = opts.levels || {};
  const attrKeys = opts.attrKeys || [];
  const clean = (t, idx) => {
    sanitizeTeamPrivate(t, PRIVATE_TEAM_FIELDS);
    if (typeof levels[idx] === "number") t.publicLevel = levels[idx];
    (t.players || []).forEach(p => sanitizeOpponentPlayer(p, scouted[String(idx)], listed, attrKeys));
  };
  leagueOut.teams.forEach((t, i) => { if (t && i !== viewerIdx) clean(t, i); });
  (leagueOut.guestTeams || []).forEach(g => {
    if (g && g.team) clean(g.team, g.localIdx);
    // Invité « léger » du marché mondial : ses joueurs sont en vente.
    if (g && g.light) (g.light.players || []).forEach(p => { stripFields(p, HIDDEN_PLAYER_FIELDS.filter(k => k !== "potential")); delete p.aggressiveness; });
  });
  return leagueOut;
}

// Niveau affiché d'un club (moyenne arrondie des notes, même formule que
// dashboardTeamLevel côté navigateur), calculé ici où tout est connu.
function teamPublicLevel(team) {
  const players = (team && team.players) || [];
  if (!players.length) return 0;
  return Math.round(players.reduce((s, p) => s + p.overall(), 0) / players.length);
}

// Estimation par ventes comparables (même poste, note proche, 60 jours) :
// même règle que comparableSalesValuation côté navigateur, calculée ici
// (les notes des joueurs vendus ne sont plus envoyées).
const MARKET_COMPARABLE_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
function comparableSalesValuation(league, player, now = Date.now()) {
  const targetOverall = player.overall();
  const comparables = (league.transferListings || [])
    .filter(l => l.result === "sold" && l.finalPrice && l.playerId !== player.id && (now - l.closesAt) <= MARKET_COMPARABLE_WINDOW_MS)
    .map(l => {
      const p = typeof league.playerById === "function" ? league.playerById(l.playerId) : null;
      if (!p || p.position !== player.position) return null;
      return { price: l.finalPrice, gap: Math.abs(p.overall() - targetOverall) };
    })
    .filter(c => c && c.gap <= 10)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 5);
  if (comparables.length < 2) return null;
  return { estimate: Math.round(comparables.reduce((s, c) => s + c.price, 0) / comparables.length), sampleSize: comparables.length };
}

// Caractéristiques révélées de l'adversaire `opponent` après une séance
// vidéo : { playerId: { clé: valeur } } (renvoyé par /api/staff/video-session).
function revealedAttrsFor(opponent, keys) {
  const out = {};
  ((opponent && opponent.players) || []).forEach(p => { out[p.id] = pickAttrs(p.attrs, keys); });
  return out;
}

// Autre championnat : aucun club n'est au manager.
function sanitizeForeignLeague(leagueOut) {
  if (!leagueOut || !Array.isArray(leagueOut.teams)) return leagueOut;
  const listed = openListingPlayerIds(leagueOut.transferListings);
  leagueOut.teams.forEach(t => {
    if (!t) return;
    sanitizeTeamPrivate(t, FOREIGN_PRIVATE_TEAM_FIELDS);
    (t.players || []).forEach(p => {
      stripFields(p, HIDDEN_PLAYER_FIELDS);
      delete p.aggressiveness; // trait caché, jamais affiché
      if (listed.has(p.id)) return; // sur le marché : caractéristiques publiques
      stripFields(p, FOREIGN_EXTRA_PLAYER_FIELDS);
      p.attrsHidden = true;
    });
  });
  // Annonces ouvertes seulement (montant public, jamais les enchérisseurs).
  leagueOut.transferListings = (leagueOut.transferListings || []).filter(l => l && l.status === "open").map(l => ({
    id: l.id, playerId: l.playerId, sellerIdx: l.sellerIdx, startPrice: l.startPrice, currentBid: l.currentBid || null,
    currentBidderIdx: null, bids: [], createdAt: l.createdAt, closesAt: l.closesAt, status: "open", result: null, finalPrice: null,
  }));
  return leagueOut;
}

module.exports = {
  HIDDEN_PLAYER_FIELDS, FOREIGN_EXTRA_PLAYER_FIELDS, sanitizeOwnLeagueForViewer, sanitizeForeignLeague, openListingPlayerIds,
  teamPublicLevel, comparableSalesValuation, revealedAttrsFor, MARKET_COMPARABLE_WINDOW_MS,
};
