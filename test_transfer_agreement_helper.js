// Tests écrits avant la règle « accord de contrat avant l'enchère »
// (2026-10-03, voir League.negotiateTransferContract) : un club humain qui
// enchérit sans accord en conclut un d'office au salaire demandé, avec la
// durée de l'offre — le comportement d'avant. La règle elle-même est
// couverte par server/transfer_negotiation_test.js.
module.exports = function installLegacyAgreements(Engine) {
  const P = Engine.League.prototype;
  if (P.__legacyAgreements) return;
  P.__legacyAgreements = true;
  const agree = (lg, listingId, idx, ref, team, seasons, now) => {
    const l = (lg.transferListings || []).find(x => x.id === listingId);
    if (!l || !team || !team.isHuman) return;
    const key = Engine.autoBidKey(ref ? Engine.FOREIGN_BIDDER_IDX : idx, ref);
    if (l.agreements && l.agreements[key]) return;
    l.agreements = l.agreements || {};
    l.agreements[key] = { salary: typeof l.askedSalary === "number" ? l.askedSalary : null, seasons: Engine.normalizeContractSeasons(seasons), at: now };
  };
  const placeBid = P.placeBid;
  P.placeBid = function (listingId, bidderIdx, amount, now, seasons = null) {
    agree(this, listingId, bidderIdx, null, this.teams[bidderIdx], seasons, now);
    return placeBid.call(this, listingId, bidderIdx, amount, now, seasons);
  };
  const setAutoBid = P.setAutoBid;
  P.setAutoBid = function (field, listingId, bidderIdx, max, now, foreign = null, seasons = null) {
    if (field === "transferListings" && max) agree(this, listingId, bidderIdx, foreign ? { leagueId: foreign.ref.leagueId, idx: foreign.ref.idx, name: foreign.ref.name || (foreign.team && foreign.team.name) } : null, foreign ? foreign.team : this.teams[bidderIdx], seasons, now);
    return setAutoBid.call(this, field, listingId, bidderIdx, max, now, foreign, seasons);
  };
  const placeForeignBid = P.placeForeignBid;
  P.placeForeignBid = function (listingId, bidderRef, bidder, amount, now, seasons = null) {
    agree(this, listingId, null, { leagueId: bidderRef.leagueId, idx: bidderRef.idx, name: bidderRef.name || (bidder && bidder.name) }, bidder, seasons, now);
    return placeForeignBid.call(this, listingId, bidderRef, bidder, amount, now, seasons);
  };
};
