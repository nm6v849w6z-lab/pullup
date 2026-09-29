"use strict";

// =====================================================================
// « MES ENCHÈRES » (retour utilisateur 2026-09-29 : « il faudrait un
// endroit où on peut suivre ses enchères […] si qqun a surenchéri, comment
// je retrouve rapidement sans devoir aller rechercher sur le marché des
// transferts ? » puis « ou le marché des staffs »).
//
// GET /api/auctions/mine renvoie les annonces où le club a misé, telles que
// le navigateur les connaît déjà (mêmes formes que GET /api/save) :
//  - transferListings : annonces de sa ligue (ouvertes, ou closes depuis
//    moins de 24 h pour que la copie locale passe à « close ») et annonces
//    des autres championnats (marché mondial, id négatif, projetées par
//    WorldMarket.projectForLeague) ;
//  - staff : { coachListings: [...], ... } ;
//  - foreignIds : ids (négatifs) des annonces d'ailleurs encore ouvertes où
//    l'on a misé — une copie locale absente de cette liste est close.
// Le navigateur (myAuctionsRefresh) ne met à jour QUE les champs d'enchère
// des annonces qu'il a déjà : pastille rouge, « Mes enchères », tâches du
// tableau de bord.
// =====================================================================

const WorldMarket = require("./worldMarket.js");

const STAFF_FIELDS = ["coachListings", "assistantCoachListings", "analystListings", "recruiterListings", "doctorListings", "physioListings"];
const RECENT_CLOSED_MS = 24 * 3600 * 1000;

function bidOn(l, teamIdx) {
  return l.currentBidderIdx === teamIdx || (l.bids || []).some(b => b.bidderIdx === teamIdx);
}
function keep(l, teamIdx, now) {
  if (!l || !bidOn(l, teamIdx)) return false;
  return l.status === "open" || now - l.closesAt < RECENT_CLOSED_MS;
}
// Copie envoyée au navigateur : un enchérisseur d'un autre championnat reste
// FOREIGN_BIDDER_IDX (la copie locale n'en affiche pas le nom pour une
// annonce où l'on est acheteur).
function slim(l) {
  return {
    id: l.id, status: l.status, result: l.result == null ? null : l.result, finalPrice: l.finalPrice == null ? null : l.finalPrice,
    startPrice: l.startPrice, currentBid: l.currentBid, currentBidderIdx: l.currentBidderIdx,
    currentBidderRef: l.currentBidderRef || null,
    bids: (l.bids || []).map(b => ({ bidderIdx: b.bidderIdx, amount: b.amount, at: b.at })),
    closesAt: l.closesAt,
  };
}

function collect(league, teamIdx, now, world = null) {
  const transferListings = (league.transferListings || [])
    .filter(l => l.sellerIdx !== teamIdx && keep(l, teamIdx, now)).map(slim);
  const staff = {};
  STAFF_FIELDS.forEach(f => { staff[f] = (league[f] || []).filter(l => keep(l, teamIdx, now)).map(slim); });
  let foreignIds = [];
  if (world && world.index) {
    // limit 0 : seulement les annonces où l'on a misé (voir projectForLeague).
    const proj = WorldMarket.projectForLeague(world.index, world.leagueId, teamIdx, now, 0);
    proj.listings.forEach(l => transferListings.push(slim(l)));
    foreignIds = proj.listings.map(l => l.id);
  }
  return { transferListings, staff, foreignIds };
}

module.exports = { STAFF_FIELDS, collect };
