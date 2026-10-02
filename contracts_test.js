// Contrats des joueurs (demande validée 2026-10-01) : contrat de 1 à 5
// saisons, salaire fixe pendant le contrat, prolongation pendant la dernière
// saison (marge de -10 %, une offre refusée par semaine), départ libre en fin
// de contrat (agents libres aux enchères, prime de signature), vente
// interdite en seconde moitié de dernière saison, durée choisie avec
// l'enchère (signature au salaire demandé), demande d'augmentation de
// mi-saison, comportement de l'IA, sauvegarde.
// Voir engine.js : CONTRACT_MIN_SEASONS et suivants, League.contractSeason/
// ensureContracts/processContractExpiries/weeklyContractsTick,
// Team.offerContractExtension/respondToRaiseRequest ; server/actions.js ;
// server/autoSim.js:runWeeklyEconomyTick ; server/worldMarket.js.
const assert = require("assert");
const E = require("./engine.js");
const actions = require("./server/actions.js");
const AutoSim = require("./server/autoSim.js");
const WorldMarket = require("./server/worldMarket.js");
const {
  generateMultiManagerLeague, askedSalary, contractOfferFloor, contractAcceptanceChance, contractOfferHint,
  initialContractSeasonsFor, contractSeasonsLeft, serializeLeague, leagueFromSave, serializePlayerRecord, playerFromSave,
  CONTRACT_REFUSAL_MORALE_MALUS, CONTRACT_FIRM_AFTER_REFUSALS, contractExtensionFloor, contractRefusalMoraleMalus, CONTRACT_RAISE_REFUSED_MORALE_MALUS, CONTRACT_RAISE_RESPONSE_MS, SEASON_LENGTH_WEEKS,
  FREE_AGENT_AUCTION_DURATION_MS, TRANSFER_AUCTION_DURATION_MS, financeCategoryOf,
} = E;

const T0 = Date.UTC(2026, 9, 5, 8, 0, 0);
const ok = msg => console.log("✅ " + msg);
const never = () => 0.999999;
const always = () => 0;

function freshLeague() {
  return generateMultiManagerLeague(["Lyon Contrats", "Paris Contrats"], 1, T0, { dailyAnchored: true, weekly: true });
}
const humanIdx = lg => lg.teams.findIndex(t => t.isHuman);
const cpuIdx = lg => lg.teams.findIndex(t => !t.isHuman);

// 1) Salaire demandé : niveau, âge, motivation ; plancher de négociation.
{
  const lg = freshLeague();
  const p = lg.teams[0].players[0];
  p.form = 55;
  p.age = 26;
  const base = askedSalary(p);
  p.age = 21;
  assert.ok(askedSalary(p) < base, "un jeune demande moins");
  p.age = 34;
  assert.ok(askedSalary(p) < base, "un vétéran demande moins");
  p.age = 26;
  p.form = 5;
  assert.ok(askedSalary(p) > base, "un joueur mécontent demande plus");
  assert.ok(askedSalary(p) <= Math.round(base * 1.1 / 10) * 10 + 10, "au plus +10 %");
  p.form = 95;
  assert.ok(askedSalary(p) < base, "un joueur très motivé demande un peu moins");
  assert.strictEqual(askedSalary(p) % 10, 0, "arrondi à 10 €");
  assert.strictEqual(contractOfferFloor(10000), 9000);
  assert.strictEqual(contractAcceptanceChance(10000, 10000, 55, 50), 1, "au salaire demandé : toujours");
  const atFloor = contractAcceptanceChance(10000, 9000, 55, 50);
  assert.ok(atFloor > 0.2 && atFloor < 0.3, `~25 % au plancher (${atFloor})`);
  // Compromis (2026-10-02) : ~82 % à -2 %, ~60 % à -5 %, ~39 % à -8 %.
  [[9800, 0.82], [9500, 0.60], [9200, 0.39]].forEach(([offer, target]) => {
    const c = contractAcceptanceChance(10000, offer, 55, 50);
    assert.ok(Math.abs(c - target) < 0.04, `${offer} : ~${target} (${c})`);
  });
  assert.strictEqual(contractRefusalMoraleMalus(10000, 9900), 3, "offre presque correcte : petite perte de motivation");
  assert.strictEqual(contractRefusalMoraleMalus(10000, 9000), CONTRACT_REFUSAL_MORALE_MALUS, "offre au plancher : grosse perte");
  assert.ok(contractAcceptanceChance(10000, 9500, 55, 50) > atFloor, "décroît vers le plancher");
  assert.ok(contractAcceptanceChance(10000, 9000, 55, 90) > atFloor, "renommée (cachée) : un peu plus de chances");
  assert.ok(contractAcceptanceChance(10000, 9000, 20, 50) < atFloor, "joueur mécontent : moins de chances");
  assert.strictEqual(contractOfferHint(10000, 10000).key, "sure");
  assert.strictEqual(contractOfferHint(10000, 9800).key, "likely");
  assert.strictEqual(contractOfferHint(10000, 9500).key, "hesitant");
  assert.strictEqual(contractOfferHint(10000, 9000).key, "risky");
  ok("salaire demandé (âge, motivation, arrondi), plancher -10 %, chance d'acceptation et indice");
}

// 2) Contrats de départ / migration : 1 à 5 saisons selon l'âge,
// déterministes par id, salaire inchangé, échéances étalées.
{
  for (let id = 1; id < 200; id++) {
    const y = initialContractSeasonsFor(20, id), m = initialContractSeasonsFor(25, id), o = initialContractSeasonsFor(30, id), v = initialContractSeasonsFor(34, id);
    assert.ok(y >= 3 && y <= 5 && m >= 2 && m <= 4 && o >= 1 && o <= 3 && v >= 1 && v <= 2);
    assert.strictEqual(initialContractSeasonsFor(25, id), m, "déterministe");
  }
  const lg = freshLeague();
  const all = lg.teams.flatMap(t => t.players);
  assert.ok(all.every(p => typeof p.contractUntilSeason === "number"), "tous les joueurs générés ont un contrat");
  const ends = new Set(all.map(p => p.contractUntilSeason));
  assert.ok(ends.size >= 3, "les fins de contrat sont étalées");
  // Ancienne sauvegarde : champ absent → contrat posé au chargement, salaire gardé.
  const data = JSON.parse(JSON.stringify(serializeLeague(lg)));
  data.teams.forEach(t => t.players.forEach(p => { delete p.contractUntilSeason; p.salary = 4321; }));
  delete data.freeAgents;
  const lg2 = leagueFromSave(data);
  const ps = lg2.teams.flatMap(t => t.players);
  assert.ok(ps.every(p => typeof p.contractUntilSeason === "number" && p.salary === 4321), "migration : contrat posé, salaire inchangé");
  assert.ok(ps.every(p => { const left = contractSeasonsLeft(p, lg2.contractSeason()); return left >= 1 && left <= 5; }));
  assert.deepStrictEqual(lg2.freeAgents, []);
  ok("contrats de départ et migration des sauvegardes (âge, hachage de l'id, salaire inchangé)");
}

// 3) Salaire FIXE pendant le contrat à l'intersaison ; nextSalary appliqué.
{
  const lg = freshLeague();
  const team = lg.teams[humanIdx(lg)];
  const p = team.players[0];
  p.contractUntilSeason = lg.contractSeason() + 2;
  p.salary = 1234;
  p.attrs.inside = 99; p.attrs.midRange = 99;
  const q = team.players[1];
  q.contractUntilSeason = lg.contractSeason() + 2;
  q.salary = 2000;
  q.nextSalary = 2500;
  team.recalculateSalaries();
  assert.strictEqual(p.salary, 1234, "sous contrat : salaire inchangé malgré la progression");
  assert.strictEqual(q.salary, 2500, "nouveau salaire signé appliqué au passage de saison");
  assert.strictEqual(q.nextSalary, null);
  ok("salaire fixe pendant le contrat, nouveau salaire signé appliqué à l'intersaison");
}

// 4) Prolongation : seulement en dernière saison, marge -10 %, acceptée →
// nouveau salaire la saison suivante ; refusée → motivation, une fois par semaine.
{
  const lg = freshLeague();
  const ti = humanIdx(lg);
  const team = lg.teams[ti];
  const season = lg.contractSeason();
  const p = team.players[0];
  p.contractUntilSeason = season + 1;
  assert.strictEqual(team.offerContractExtension(p.id, { seasons: 3, salary: 1 }, season, T0, always).reason, "not-last-season");
  p.contractUntilSeason = season;
  p.form = 60;
  const asked = askedSalary(p);
  assert.strictEqual(team.offerContractExtension(p.id, { seasons: 6, salary: asked }, season, T0, always).reason, "invalid-seasons");
  assert.strictEqual(team.offerContractExtension(p.id, { seasons: 3, salary: Math.floor(asked * 0.85) }, season, T0, always).reason, "invalid-salary");
  assert.strictEqual(team.offerContractExtension(p.id, { seasons: 3, salary: asked + 100 }, season, T0, always).reason, "invalid-salary");
  const salaryBefore = p.salary;
  const refused = team.offerContractExtension(p.id, { seasons: 3, salary: contractOfferFloor(asked) }, season, T0, never);
  assert.strictEqual(refused.ok, true);
  assert.strictEqual(refused.accepted, false);
  assert.strictEqual(p.form, 60 - CONTRACT_REFUSAL_MORALE_MALUS, "refus au plancher : motivation en baisse");
  assert.strictEqual(refused.moraleLoss, CONTRACT_REFUSAL_MORALE_MALUS);
  assert.strictEqual(p.contractRefusals, 1);
  assert.strictEqual(team.offerContractExtension(p.id, { seasons: 3, salary: asked }, season, T0, always).reason, "already-offered", "une seule offre refusée par semaine");
  team.week += 1;
  const askedNow = askedSalary(p);
  { const q = { ...p, contractRefusals: 0 }; assert.ok(askedNow > askedSalary(q), "refus : sa demande augmente"); }
  // Après 3 refus : plus de marge, il ne signe qu'à sa demande.
  p.contractRefusals = CONTRACT_FIRM_AFTER_REFUSALS;
  assert.strictEqual(contractExtensionFloor(p, askedSalary(p)), askedSalary(p));
  assert.strictEqual(team.offerContractExtension(p.id, { seasons: 4, salary: askedSalary(p) - 10 }, season, T0, always).reason, "invalid-salary", "après 3 refus : plus de négociation");
  p.contractRefusals = 1;
  const acc = team.offerContractExtension(p.id, { seasons: 4, salary: askedNow }, season, T0, never);
  assert.strictEqual(acc.accepted, true, "au salaire demandé : toujours acceptée");
  assert.strictEqual(p.contractUntilSeason, season + 4);
  assert.strictEqual(p.salary, salaryBefore, "salaire actuel inchangé cette saison");
  assert.strictEqual(p.nextSalary, askedNow, "nouveau salaire à partir de la saison suivante");
  // Action serveur.
  const p2 = team.players[1];
  p2.contractUntilSeason = season;
  const r = actions.offerContractExtension(team, ti, lg, { playerId: p2.id, seasons: 2, salary: askedSalary(p2) }, T0);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.accepted, true);
  assert.strictEqual(p2.contractUntilSeason, season + 2);
  const bad = actions.offerContractExtension(team, ti, lg, { playerId: team.players[2].id, seasons: 2, salary: 5000 }, T0);
  assert.strictEqual(bad.ok, false);
  ok("prolongation : dernière saison seulement, marge -10 %, refus (motivation, 1 offre/semaine), accord (salaire la saison suivante), action serveur");
}

// 5) Vente interdite en seconde moitié de la dernière saison.
{
  const lg = freshLeague();
  const ti = humanIdx(lg);
  const team = lg.teams[ti];
  const p = team.players[0];
  p.contractUntilSeason = lg.contractSeason();
  lg.lastEconomyTick = 2;
  assert.strictEqual(lg.contractSaleBlocked(p), false, "première moitié : vente possible");
  lg.lastEconomyTick = Math.ceil(SEASON_LENGTH_WEEKS / 2);
  assert.strictEqual(lg.contractSaleBlocked(p), true, "seconde moitié : vente interdite");
  assert.strictEqual(lg.listPlayerForSale(ti, p.id, 1000, T0), null);
  const r = actions.listPlayer(team, ti, lg, { playerId: p.id, price: 1000 }, T0);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "contract-ending");
  const q = team.players[1];
  q.contractUntilSeason = lg.contractSeason() + 1;
  assert.ok(lg.listPlayerForSale(ti, q.id, 1000, T0), "un joueur avec plus d'une saison reste vendable");
  ok("vente interdite en seconde moitié de dernière saison (moteur + action serveur)");
}

// 6) Transfert : durée choisie avec l'enchère, signature au salaire demandé,
// message de confirmation ; vendeur ne paie plus.
{
  const lg = freshLeague();
  const ti = humanIdx(lg);
  const buyerIdx = lg.teams.findIndex((t, i) => t.isHuman && i !== ti);
  const seller = lg.teams[cpuIdx(lg)];
  const sellerIdx = lg.teams.indexOf(seller);
  const p = seller.players[0];
  p.contractUntilSeason = lg.contractSeason() + 3;
  const listing = lg.listPlayerForSale(sellerIdx, p.id, 1000, T0);
  assert.strictEqual(listing.askedSalary, askedSalary(p), "salaire demandé gelé sur l'annonce");
  const buyer = lg.teams[buyerIdx];
  buyer.budget = 10_000_000;
  const res = lg.placeBid(listing.id, buyerIdx, 1000, T0 + 1000, 5);
  assert.ok(res.ok);
  lg.transferListings.forEach(l => { l.lastCpuCheckAt = T0 + TRANSFER_AUCTION_DURATION_MS * 2; });
  lg.lastCpuListingCheckAt = T0 + TRANSFER_AUCTION_DURATION_MS * 2;
  lg.refreshMarket(T0 + TRANSFER_AUCTION_DURATION_MS + 10);
  assert.strictEqual(listing.result, "sold");
  assert.ok(buyer.players.includes(p));
  assert.strictEqual(p.salary, listing.askedSalary, "toujours signé au salaire demandé");
  assert.strictEqual(p.contractUntilSeason, lg.contractSeason() + 4, "5 saisons à partir de la saison en cours");
  const msg = buyer.feed.entries.find(e => e.key === `contract_signed_${p.id}`);
  assert.ok(msg && /5 saisons/.test(msg.text) && /salaire demandé/.test(msg.text), "message de confirmation");
  assert.ok(!seller.players.includes(p), "le vendeur ne le paie plus");
  // Durée invalide refusée par l'action serveur ; enchère auto avec durée.
  const p2 = seller.players[1];
  p2.contractUntilSeason = lg.contractSeason() + 3;
  const l2 = lg.listPlayerForSale(sellerIdx, p2.id, 1000, T0);
  assert.strictEqual(actions.bidOnListing(buyer, buyerIdx, lg, { listingId: l2.id, amount: 1000, seasons: 9 }, T0).ok, false);
  const auto = actions.setAutoBid(buyer, buyerIdx, lg, { market: "transferListings", listingId: l2.id, max: 5000, seasons: 2 }, T0);
  assert.ok(auto.ok);
  assert.strictEqual(auto.listing.myContractSeasons, 2, "durée mémorisée avec le plafond automatique");
  assert.ok(!("contractTerms" in auto.listing), "durées des autres clubs jamais renvoyées");
  ok("transfert : durée choisie avec l'enchère (et l'enchère auto), signature au salaire demandé, message, vendeur libéré");
}

// 7) Fin de contrat : départ libre (club humain), annonce agent libre à 1 €,
// ancien club exclu, prime de signature = argent qui sort de l'économie.
{
  const lg = freshLeague();
  const ti = humanIdx(lg);
  const team = lg.teams[ti];
  const otherIdx = lg.teams.findIndex((t, i) => t.isHuman && i !== ti);
  const other = lg.teams[otherIdx];
  const season = lg.contractSeason();
  team.players.forEach(p => { p.contractUntilSeason = season + 2; });
  const p = team.players[0];
  p.contractUntilSeason = season;
  p.age = 27;
  const left = lg.processContractExpiries(T0, always);
  assert.ok(left.some(x => x.playerId === p.id));
  assert.ok(!team.players.includes(p), "parti libre");
  assert.ok(lg.freeAgents.includes(p));
  const fa = lg.transferListings.find(l => l.freeAgent && l.playerId === p.id);
  assert.ok(fa && fa.startPrice === 1 && fa.sellerIdx === null && fa.formerTeamIdx === ti);
  assert.strictEqual(fa.closesAt, T0 + FREE_AGENT_AUCTION_DURATION_MS);
  assert.ok(team.feed.entries.some(e => e.key === `contract_left_${p.id}`), "message : parti libre");
  assert.strictEqual(lg.playerById(p.id), p, "retrouvé parmi les agents libres");
  assert.strictEqual(lg.placeBid(fa.id, ti, 5, T0 + 1).reason, "former-club", "l'ancien club ne peut pas enchérir");
  assert.strictEqual(lg.setAutoBid("transferListings", fa.id, ti, 5000, T0 + 1).reason, "former-club");
  other.budget = 500000;
  const budgetBefore = other.budget;
  assert.ok(lg.placeBid(fa.id, otherIdx, 25000, T0 + 2, 2).ok);
  // Pas d'IA dans le test : enchère CPU coupée.
  lg.transferListings.forEach(l => { l.lastCpuCheckAt = T0 + FREE_AGENT_AUCTION_DURATION_MS * 2; });
  lg.lastCpuListingCheckAt = T0 + FREE_AGENT_AUCTION_DURATION_MS * 2;
  const totalBefore = lg.teams.reduce((s, t) => s + (t.budget || 0), 0);
  lg.refreshMarket(T0 + FREE_AGENT_AUCTION_DURATION_MS + 5);
  assert.strictEqual(fa.result, "sold");
  assert.ok(other.players.includes(p));
  assert.strictEqual(other.budget, budgetBefore - 25000, "prime de signature débitée");
  assert.strictEqual(lg.teams.reduce((s, t) => s + (t.budget || 0), 0), totalBefore - 25000, "créditée à personne");
  const tx = other.transactions.find(t => /^Prime de signature/.test(t.label));
  assert.ok(tx && tx.amount === -25000);
  assert.strictEqual(financeCategoryOf(tx.label, tx.amount), "signing", "catégorie du bilan économique");
  assert.strictEqual(p.contractUntilSeason, lg.contractSeason() + 1);
  assert.strictEqual(p.salary, fa.askedSalary);
  assert.ok(!lg.freeAgents.includes(p));
  ok("fin de contrat : départ libre, agent libre à 1 €, ancien club exclu, prime de signature hors économie, contrat signé");
}

// 8) Agent libre invendu : un club de l'IA le signe ; 33 ans et plus : retraite.
{
  const lg = freshLeague();
  const ti = humanIdx(lg);
  const team = lg.teams[ti];
  const season = lg.contractSeason();
  team.players.forEach(p => { p.contractUntilSeason = season + 2; });
  const young = team.players[0], vet = team.players[1];
  young.contractUntilSeason = season; young.age = 25;
  vet.contractUntilSeason = season; vet.age = 34;
  lg.processContractExpiries(T0, always);
  lg.transferListings.forEach(l => { l.lastCpuCheckAt = T0 + FREE_AGENT_AUCTION_DURATION_MS * 2; });
  lg.lastCpuListingCheckAt = T0 + FREE_AGENT_AUCTION_DURATION_MS * 2;
  lg.refreshMarket(T0 + FREE_AGENT_AUCTION_DURATION_MS + 5);
  const cpuWith = lg.teams.find(t => !t.isHuman && t.players.includes(young));
  assert.ok(cpuWith, "un club de l'IA signe l'agent libre invendu");
  assert.ok(typeof young.contractUntilSeason === "number");
  assert.ok(!lg.teams.some(t => t.players.includes(vet)), "le vétéran prend sa retraite");
  assert.strictEqual(lg.freeAgents.length, 0);
  ok("agent libre invendu : signé par l'IA, ou retraite à 33 ans et plus");
}

// 9) IA : prolonge la plupart de ses joueurs utiles, en laisse partir
// d'autres, effectif complété ; n'enchérit que dans son championnat (les
// enchères CPU ne portent que sur les annonces de sa ligue).
{
  const lg = freshLeague();
  const ci = cpuIdx(lg);
  const cpu = lg.teams[ci];
  const season = lg.contractSeason();
  lg.teams.forEach(t => t.players.forEach(p => { p.contractUntilSeason = season + 2; }));
  cpu.players.forEach(p => { p.contractUntilSeason = season; });
  const n = cpu.players.length;
  let calls = 0;
  const alt = () => (calls++ % 3 === 2 ? 0.99 : 0);
  lg.processContractExpiries(T0, alt);
  assert.ok(cpu.players.length >= E.CPU_MIN_ROSTER_AFTER_CONTRACTS, "effectif IA complété");
  assert.ok(lg.freeAgents.length > 0 && lg.freeAgents.length < n, "certains prolongés, d'autres partis");
  assert.ok(cpu.players.every(p => p.contractUntilSeason > season), "prolongés pour la saison suivante au moins");
  // Enchères CPU sur les agents libres : seulement des clubs de cette ligue.
  const saved = Math.random;
  Math.random = () => 0.01;
  try { lg.refreshMarket(T0 + E.TRANSFER_CPU_CHECK_INTERVAL_MS + 1000); } finally { Math.random = saved; }
  lg.transferListings.filter(l => l.freeAgent).forEach(l => {
    (l.bids || []).forEach(b => { assert.ok(b.bidderIdx >= 0 && b.bidderIdx < lg.teams.length && b.bidderIdx !== ci); });
  });
  assert.ok(lg.transferListings.some(l => l.freeAgent && (l.bids || []).length), "l'IA enchérit sur des agents libres");
  ok("IA : prolonge la plupart (pas tous), effectif complété, enchérit sur les agents libres de sa ligue (jamais l'ancien club)");
}

// 10) Demande d'augmentation de mi-saison : message, acceptation (salaire la
// saison suivante), refus ou silence (motivation), jamais de demande de transfert.
{
  const lg = freshLeague();
  const ti = humanIdx(lg);
  const team = lg.teams[ti];
  const season = lg.contractSeason();
  team.players.forEach(p => { p.contractUntilSeason = season + 2; p.salary = askedSalary(p); });
  const a = team.players[0], b = team.players[1], c = team.players[2];
  [a, b, c].forEach(p => { p.salary = Math.round(askedSalary(p) / 2); p.form = 60; });
  lg.lastEconomyTick = E.CONTRACT_RAISE_WEEK - 1;
  lg.weeklyContractsTick(T0);
  [a, b, c].forEach(p => assert.ok(p.raiseRequest && p.raiseRequest.asked === askedSalary(p), "demande posée"));
  assert.ok(team.feed.entries.some(e => e.key === `contract_raise_${a.id}`), "message au manager");
  assert.ok(team.players.slice(3).every(p => !p.raiseRequest), "seulement ceux qui ont beaucoup progressé");
  const aAsked = a.raiseRequest.asked, aSalary = a.salary;
  const r = actions.respondToRaiseRequest(team, ti, lg, { playerId: a.id, accept: true }, T0);
  assert.ok(r.ok && r.accepted);
  assert.strictEqual(a.salary, aSalary);
  assert.strictEqual(a.nextSalary, aAsked, "accordée : salaire demandé à partir de la saison suivante");
  team.respondToRaiseRequest(b.id, false);
  assert.strictEqual(b.form, 60 - CONTRACT_RAISE_REFUSED_MORALE_MALUS);
  assert.strictEqual(b.transferRequestActive, false, "pas de demande de transfert");
  // Contre-offre (2026-10-01) : hors limites refusée ; acceptée = salaire
  // proposé ; refusée = comme un refus. (`c` est remis en attente après.)
  {
    const cReq = { ...c.raiseRequest }, cForm = c.form;
    const floor = Math.round(cReq.asked * 0.9);
    assert.ok(!actions.respondToRaiseRequest(team, ti, lg, { playerId: c.id, counter: floor - 100 }, T0).ok, "contre-offre trop basse refusée");
    let rr = team.respondToRaiseRequest(c.id, false, cReq.asked - 50, () => 0);
    assert.ok(rr.ok && rr.accepted && rr.countered && c.nextSalary === cReq.asked - 50, "contre-offre acceptée : salaire proposé la saison suivante");
    c.nextSalary = null; c.raiseRequest = { ...cReq }; c.form = cForm;
    rr = team.respondToRaiseRequest(c.id, false, Math.ceil(cReq.asked * 0.9 / 10) * 10, () => 0.999);
    assert.ok(rr.ok && !rr.accepted && c.raiseRequest === null && c.form === cForm - CONTRACT_RAISE_REFUSED_MORALE_MALUS && c.nextSalary == null, "contre-offre refusée = refus");
    c.raiseRequest = { ...cReq }; c.form = cForm;
  }
  lg.expireRaiseRequests(T0 + CONTRACT_RAISE_RESPONSE_MS + 1);
  assert.strictEqual(c.raiseRequest, null);
  assert.strictEqual(c.form, 60 - CONTRACT_RAISE_REFUSED_MORALE_MALUS, "sans réponse = refus");
  lg.weeklyContractsTick(T0 + 10);
  assert.strictEqual(a.raiseRequest, null, "une seule demande par saison");
  // IA : augmentation accordée d'office.
  const cpu = lg.teams[cpuIdx(lg)];
  const cp = cpu.players[0];
  cp.contractUntilSeason = season + 2;
  cp.salary = Math.round(askedSalary(cp) / 2);
  cp.raiseRequestSeason = null;
  lg.weeklyContractsTick(T0 + 20);
  assert.strictEqual(cp.nextSalary, askedSalary(cp), "IA : augmentation accordée");
  ok("augmentation de mi-saison : message, accord (saison suivante), refus/silence (motivation, sans demande de transfert), IA");
}

// 11) Message de prolongation en début de dernière saison (une fois).
{
  const lg = freshLeague();
  const team = lg.teams[humanIdx(lg)];
  const season = lg.contractSeason();
  team.players.forEach(p => { p.contractUntilSeason = season + 2; });
  const p = team.players[0];
  p.contractUntilSeason = season;
  lg.weeklyContractsTick(T0);
  const e = team.feed.entries.find(x => x.key === `contract_ext_${p.id}`);
  assert.ok(e && /prolonger/.test(e.title) && e.action.href === `/joueur/${p.id}`);
  const count = team.feed.entries.length;
  lg.weeklyContractsTick(T0 + 1);
  assert.strictEqual(team.feed.entries.length, count, "envoyé une seule fois");
  ok("message de prolongation au début de la dernière saison, une seule fois");
}

// 12) Bascule de saison complète (rythme hebdomadaire) : fin de contrat au
// lundi qui clôt la saison, saison de contrat suivante pendant l'intersaison.
{
  const lg = freshLeague();
  const ti = humanIdx(lg);
  const team = lg.teams[ti];
  const season = lg.contractSeason();
  team.players.forEach(p => { p.contractUntilSeason = season + 1; });
  const p = team.players[0];
  p.contractUntilSeason = season;
  const kept = team.players[1];
  const keptSalary = kept.salary;
  kept.attrs.inside = 99;
  const events = [];
  AutoSim.runWeeklyEconomyTick(lg, 11, T0, true, events);
  lg.seasonEndTickDone = true;
  assert.ok(!team.players.includes(p) && lg.freeAgents.includes(p), "parti libre à la fin de saison");
  assert.ok(events[0].contractsEnded.some(x => x.playerId === p.id));
  assert.strictEqual(kept.salary, keptSalary, "salaire inchangé à l'intersaison");
  assert.strictEqual(lg.contractSeason(), season + 1, "intersaison : saison de contrat suivante");
  assert.strictEqual(contractSeasonsLeft(kept, lg.contractSeason()), 1);
  lg.startNextSeason(T0 + 7 * 86400000);
  assert.strictEqual(lg.contractSeason(), season + 1);
  ok("bascule de saison : départs libres au lundi de clôture, salaires figés, saison de contrat suivante");
}

// 13) Sauvegarde : aller-retour des champs de contrat et des agents libres.
{
  const lg = freshLeague();
  const team = lg.teams[humanIdx(lg)];
  const p = team.players[0];
  p.contractUntilSeason = 7; p.nextSalary = 3210; p.lastContractOfferWeek = 4; p.raiseRequest = { asked: 5000, at: T0, season: 1 };
  p.raiseRequestSeason = 1; p.extensionRequestSeason = 1;
  const rec = playerFromSave(JSON.parse(JSON.stringify(serializePlayerRecord(p))));
  ["contractUntilSeason", "nextSalary", "lastContractOfferWeek", "raiseRequestSeason", "extensionRequestSeason"].forEach(k => assert.strictEqual(rec[k], p[k], k));
  assert.deepStrictEqual(rec.raiseRequest, p.raiseRequest);
  team.players.forEach(x => { x.contractUntilSeason = lg.contractSeason() + 2; });
  const q = team.players[1];
  q.contractUntilSeason = lg.contractSeason();
  lg.processContractExpiries(T0, always);
  const lg2 = leagueFromSave(JSON.parse(JSON.stringify(serializeLeague(lg))));
  assert.strictEqual(lg2.freeAgents.length, lg.freeAgents.length);
  const fa = lg2.transferListings.find(l => l.freeAgent && l.playerId === q.id);
  assert.ok(fa && lg2.listingPlayer(fa) && lg2.listingPlayer(fa).name === q.name, "agent libre retrouvé après rechargement");
  assert.strictEqual(lg2.listingPlayer(fa).contractUntilSeason, null, "sans contrat");
  ok("sauvegarde : champs de contrat et agents libres (aller-retour)");
}

// 14) Académie : promotion = contrat de 3 saisons.
{
  const lg = freshLeague();
  const ti = humanIdx(lg);
  const team = lg.teams[ti];
  const kid = E.generateYouthCandidate(T0, 1, "fr");
  kid.age = 18;
  team.youthPlayers = [kid];
  while (team.players.length >= E.MAX_ROSTER_SIZE) team.players.pop();
  const r = actions.promoteYouthPlayer(team, ti, lg, { playerId: kid.id }, T0);
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(kid.contractUntilSeason, lg.contractSeason() + 2, "3 saisons");
  ok("promotion de l'académie : contrat de 3 saisons");
}

// 15) Marché mondial : agent libre visible ailleurs, signé par un club d'un
// autre championnat, prime débitée ; ancien club exclu par son nom.
(async () => {
  const lgA = freshLeague();
  lgA.leagueId = "fr-1";
  const lgB = generateMultiManagerLeague(["Berlin Contrats"], 1, T0, { dailyAnchored: true, weekly: true });
  lgB.leagueId = "de-1";
  const tA = lgA.teams[humanIdx(lgA)];
  tA.players.forEach(p => { p.contractUntilSeason = lgA.contractSeason() + 2; });
  const p = tA.players[0];
  p.contractUntilSeason = lgA.contractSeason();
  p.age = 26;
  lgA.processContractExpiries(T0, always);
  const leagues = new Map([["fr-1", lgA], ["de-1", lgB]]);
  const index = WorldMarket.buildIndex(null, [{ id: "fr-1", country: "fr" }, { id: "de-1", country: "de" }], leagues, T0 + 1, e => e.id);
  const en = index.entries.find(x => x.freeAgent && x.player.id === p.id);
  assert.ok(en && en.askedSalary > 0, "agent libre dans l'index mondial");
  const bIdx = humanIdx(lgB);
  const proj = WorldMarket.projectForLeague(index, "de-1", bIdx, T0 + 1);
  const pl = proj.listings.find(l => l.playerId === p.id);
  assert.ok(pl && pl.freeAgent === true && typeof pl.askedSalary === "number");
  const buyer = lgB.teams[bIdx];
  buyer.budget = 100000;
  const out = await WorldMarket.placeForeignBid({
    index, leagueId: "de-1", teamIdx: bIdx, team: buyer, gid: en.gid, amount: 7000, now: T0 + 2, seasons: 4,
    loadLeague: async id => leagues.get(id), saveLeague: async () => {}, saveIndex: async () => {},
  });
  assert.ok(out.ok, JSON.stringify(out));
  const fake = { name: tA.name, players: [], isHuman: true, budget: 1e6 };
  const fl = lgA.transferListings.find(l => l.freeAgent && l.playerId === p.id);
  assert.strictEqual(lgA.placeForeignBid(fl.id, { leagueId: "x", idx: 0, name: tA.name }, fake, 99999, T0 + 3).reason, "former-club");
  fl.lastCpuCheckAt = T0 + FREE_AGENT_AUCTION_DURATION_MS * 2;
  lgA.lastCpuListingCheckAt = T0 + FREE_AGENT_AUCTION_DURATION_MS * 2;
  lgA.refreshMarket(T0 + FREE_AGENT_AUCTION_DURATION_MS + 10);
  assert.strictEqual(fl.result, "foreign-pending");
  WorldMarket.resolveForeignTransfers(leagues, T0 + FREE_AGENT_AUCTION_DURATION_MS + 20);
  assert.strictEqual(fl.result, "sold");
  assert.ok(buyer.players.includes(p));
  assert.strictEqual(buyer.budget, 100000 - 7000, "prime de signature débitée");
  assert.strictEqual(p.contractUntilSeason, lgB.contractSeason() + 3, "4 saisons");
  ok("marché mondial : agent libre visible et signé d'un autre championnat (prime, durée), ancien club exclu");
  console.log("\nTous les tests des contrats passent.");
})().catch(e => { console.error(e); process.exit(1); });
