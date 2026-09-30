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
// - Son propre championnat (/api/save) : les caractéristiques des
//   adversaires restent envoyées (le navigateur en a besoin : scouting
//   révélé attribut par attribut, niveau de l'adversaire du tableau de
//   bord, Scouting Pro, compositions…), mais plus rien de ce que le jeu ne
//   montre jamais pour un adversaire : potentiel (sauf joueur sur le
//   marché, dont le marché affiche le palier), plafonds physique/mental,
//   progression d'entraînement, motivation, demande de transfert,
//   discussions de retraite, bonus de MVP en attente, mise en vente forcée.
//   Côté club : jeunes de l'académie, connaissances de scouting, fil,
//   entretiens en attente.
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

// /api/save : `leagueOut` = payload.league (sérialisé, modifiable).
function sanitizeOwnLeagueForViewer(leagueOut, viewerIdx) {
  if (!leagueOut || !Array.isArray(leagueOut.teams)) return leagueOut;
  const listed = openListingPlayerIds(leagueOut.transferListings);
  leagueOut.teams.forEach((t, i) => {
    if (!t || i === viewerIdx) return;
    sanitizeTeamPrivate(t, PRIVATE_TEAM_FIELDS);
    (t.players || []).forEach(p => {
      const keepPotential = listed.has(p.id);
      const potential = p.potential;
      stripFields(p, HIDDEN_PLAYER_FIELDS);
      if (keepPotential && potential !== undefined) p.potential = potential;
    });
  });
  return leagueOut;
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

module.exports = { HIDDEN_PLAYER_FIELDS, FOREIGN_EXTRA_PLAYER_FIELDS, sanitizeOwnLeagueForViewer, sanitizeForeignLeague, openListingPlayerIds };
