// Vérifie l'académie de jeunes au complet : le recruteur (troisième rôle de
// staff, marché aux enchères identique à l'entraîneur/l'analyste vidéo — voir
// coach_market_test.js/analyst_market_test.js pour le gabarit repris ici),
// le vivier PRIVÉ de prospects qu'il alimente (Team.youthCandidates,
// génération/signature/refus), le Centre de formation (facilité tiered comme
// la Salle, qui accélère la progression AUTOMATIQUE des jeunes signés), et la
// décision de 18 ans (promotion vers l'effectif pro ou libération, avec
// auto-libération par défaut si le manager ne tranche pas avant la saison
// suivante).
const E = require("./engine.js");
const {
  generateTeam, generateLeague, serializeTeam, teamFromSave, serializeLeague, leagueFromSave,
  minNextBidFor, trainerWeeklySalary,
  TRAINER_LEVELS, TRAINER_BASE_SALARY,
  COACH_AUCTION_DURATION_MS, COACH_MARKET_MIN_OPEN_LISTINGS, COACH_MARKET_GENERATE_CHECK_INTERVAL_MS,
  MAX_YOUTH_ROSTER_SIZE, YOUTH_TRAINEE_WEEKLY_SALARY, YOUTH_CANDIDATE_QUEUE_MAX, YOUTH_CANDIDATE_EXPIRY_MS,
  YOUTH_CANDIDATE_DAILY_CHANCE_BY_LEVEL, YOUTH_QUALITY_TIER_BY_LEVEL, YOUTH_STANDOUT_CHANCE_BY_LEVEL,
  generateYouthCandidate, TRAINING_CENTER_LEVELS, trainingCenterInfo,
  MAX_ROSTER_SIZE, SEASON_LENGTH_WEEKS, salaryForOverall, potentialHeadroom, ATTRS,
  POTENTIAL_TIERS, potentialTierLabel, potentialTierIndex, youthProspectLabel,
  Player, Team,
} = E;

function freshLeague(budget = 5000000) {
  const user = generateTeam("User", 1.0);
  user.budget = budget;
  const lg = generateLeague(user, 1);
  lg.teams[0].budget = budget;
  return lg;
}

function freshTeam(budget = 5000000) {
  const team = generateTeam("User", 1.0);
  team.budget = budget;
  return team;
}

// Fige Math.random() sur une valeur fixe le temps d'un appel — même
// convention que coach_market_test.js.
function withMockedRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = orig; }
}

// ---------------------------------------------------------------------
// Partie 1 : generateYouthCandidate — attributs, âge, potentiel plafonné.
// ---------------------------------------------------------------------
{
  const now = Date.now();
  const candidates = [];
  for (let i = 0; i < 500; i++) candidates.push(generateYouthCandidate(now, 1)); // niveau 1 -> tier ×1.0
  const ages = new Set(candidates.map(c => c.age));
  console.log("\nÂges rencontrés sur 500 candidats niveau 1 :", [...ages].sort());
  if ([...ages].some(a => ![15, 16, 17].includes(a))) throw new Error("❌ Un candidat de l'académie devrait toujours avoir 15, 16 ou 17 ans.");
  if (ages.size !== 3) throw new Error("❌ Les trois âges (15/16/17) devraient tous apparaître sur 500 tirages.");

  const allAttrValues = candidates.flatMap(c => ATTRS.map(a => c.attrs[a]));
  const minAttr = Math.min(...allAttrValues);
  console.log("Attribut min observé :", minAttr, "| attribut max observé :", Math.max(...allAttrValues));
  if (minAttr < 9) throw new Error("❌ Au niveau 1 (tier ×1.0), aucun attribut ne devrait descendre sous ~10 (base rand(10,30)).");
  if (Math.max(...allAttrValues) > 41) throw new Error("❌ Au niveau 1, même un attribut 'outil brut' (31-40) ne devrait jamais dépasser ~40.");

  // Correctif 2026-09 (retour utilisateur : "un joueur du centre de
  // formation doit pouvoir avoir un potentiel jusqu'à 99 [...] doit pouvoir
  // devenir une superstar") : AUCUN plafond spécifique sur le potentiel d'un
  // prospect de l'académie — même formule que n'importe quel Player
  // (potentialHeadroom(age) + overall() + clamp(1,99)). Sur 500 tirages, on
  // devrait voir la pleine étendue de l'échelle, potentiels > 50 compris.
  const potentials = candidates.map(c => c.potential);
  console.log("Potentiel max observé sur 500 candidats :", Math.max(...potentials), "(plus de plafond à 50 : peut atteindre 99, comme n'importe quel joueur)");
  if (potentials.every(p => p <= 1)) throw new Error("❌ (garde-fou trivial) le potentiel ne devrait jamais tomber uniformément à 1.");
  if (Math.max(...potentials) <= 50) throw new Error("❌ Sur 500 tirages, au moins un candidat devrait dépasser 50 de potentiel (plus de plafond spécifique à l'académie — retour utilisateur explicite).");
  console.log("✅ Candidats générés : âges 15-17, attributs cohérents avec le tier, potentiel PAS plafonné (peut dépasser 50, jusqu'à 99).");
}
{
  // Tier de qualité : un recruteur de niveau 5 (tier ×1.4) doit produire des
  // attributs de base nettement plus élevés qu'un niveau 1 (tier ×1.0).
  const now = Date.now();
  const level1Avg = average(Array.from({ length: 300 }, () => generateYouthCandidate(now, 1)).flatMap(c => ATTRS.map(a => c.attrs[a])));
  const level5Avg = average(Array.from({ length: 300 }, () => generateYouthCandidate(now, 5)).flatMap(c => ATTRS.map(a => c.attrs[a])));
  console.log(`\nMoyenne des attributs — niveau 1 recruteur : ${level1Avg.toFixed(1)} | niveau 5 : ${level5Avg.toFixed(1)}`);
  if (level5Avg <= level1Avg * 1.15) throw new Error("❌ Un recruteur de niveau 5 (tier ×1.4) devrait générer des candidats nettement meilleurs qu'un niveau 1 (tier ×1.0).");
  console.log("✅ La qualité moyenne des prospects grandit bien avec le niveau du recruteur (YOUTH_QUALITY_TIER_BY_LEVEL).");

  function average(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
}
{
  // Chance d'"outil brut" (attribut boosté 31-40 avant tier) : au niveau 1
  // (tier ×1.0), tout attribut au-dessus de 30 ne peut venir QUE d'un
  // standout — sert de repère statistique sur YOUTH_STANDOUT_CHANCE_BY_LEVEL[1]=0.20.
  const now = Date.now();
  let withStandout = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const c = generateYouthCandidate(now, 1);
    if (ATTRS.some(a => c.attrs[a] > 30)) withStandout++;
  }
  const ratio = withStandout / N;
  console.log(`\nProportion de candidats avec au moins un attribut 'outil brut' (niveau 1, N=${N}) : ${(ratio * 100).toFixed(1)}% (attendu ~${(YOUTH_STANDOUT_CHANCE_BY_LEVEL[1] * 100).toFixed(0)}%)`);
  if (ratio < 0.12 || ratio > 0.30) throw new Error(`❌ La proportion de candidats avec un attribut 'outil brut' devrait rester proche de YOUTH_STANDOUT_CHANCE_BY_LEVEL[1] (0.20), obtenu ${ratio}.`);
  console.log("✅ La chance d'un attribut 'outil brut' (1 ou 2 attributs boostés) suit bien YOUTH_STANDOUT_CHANCE_BY_LEVEL.");
}

// ---------------------------------------------------------------------
// Partie 2 : potentialTierIndex / youthProspectLabel — correctif 2026-09,
// remplace l'ancien youthPotentialRange (fourchette numérique, retiré : basé
// sur la mauvaise prémisse d'un potentiel plafonné à 50). Le label grossier
// à 3 bandes est dérivé de potentialTierIndex (1-10, position dans
// POTENTIAL_TIERS), PAS directement de la valeur de potentiel — vérifié ici
// aux limites exactes de chaque bande.
// ---------------------------------------------------------------------
{
  // potentialTierIndex : position 1-10 dans POTENTIAL_TIERS, alignée sur ses
  // seuils `max` exacts (9,19,...,99).
  console.log("\nPOTENTIAL_TIERS.length :", POTENTIAL_TIERS.length, "(attendu 10)");
  if (POTENTIAL_TIERS.length !== 10) throw new Error("❌ POTENTIAL_TIERS devrait toujours compter 10 paliers (base des 3 bandes de l'académie).");
  POTENTIAL_TIERS.forEach((tier, i) => {
    const idx = potentialTierIndex(tier.max);
    if (idx !== i + 1) throw new Error(`❌ potentialTierIndex(${tier.max}) devrait renvoyer l'index 1-based ${i + 1} (palier "${tier.label}"), obtenu ${idx}.`);
  });
  if (potentialTierIndex(1) !== 1) throw new Error("❌ potentialTierIndex(1) devrait renvoyer 1 (palier Débutant).");
  if (potentialTierIndex(99) !== 10) throw new Error("❌ potentialTierIndex(99) devrait renvoyer 10 (palier Générationnel).");
  console.log("✅ potentialTierIndex renvoie bien la position 1-10 exacte dans POTENTIAL_TIERS.");
}
{
  // youthProspectLabel : 3 bandes dérivées de potentialTierIndex —
  //   tier 1-5  (potentiel <=49) -> "Espoir"
  //   tier 6-8  (potentiel 50-79) -> "Grand espoir"
  //   tier 9-10 (potentiel 80-99) -> "Prodige"
  // Vérifié aux bornes EXACTES de chaque bande (49/50, 79/80) plutôt qu'à
  // des valeurs au hasard, pour épingler tout décalage d'un seul point.
  const cases = [
    [1, "Espoir"], [9, "Espoir"], [49, "Espoir"],   // tier 1 et tier 5 (borne haute)
    [50, "Grand espoir"], [62, "Grand espoir"], [79, "Grand espoir"], // tier 6 et tier 8 (borne haute)
    [80, "Prodige"], [89, "Prodige"], [99, "Prodige"], // tier 9 et tier 10
  ];
  cases.forEach(([potential, expected]) => {
    const tierIndex = potentialTierIndex(potential);
    const label = youthProspectLabel(potential);
    console.log(`potentiel ${potential} → tier ${tierIndex} → ${label}`);
    if (label !== expected) throw new Error(`❌ youthProspectLabel(${potential}) devrait être "${expected}" (tier ${tierIndex}), obtenu "${label}".`);
  });
  // Exemple concret (voir POTENTIAL_TIERS : max 59 -> tier 6, max 69 -> tier
  // 7) : potentiel 62 tombe dans le palier "⭐ Star" (max 69) -> tier 7 ->
  // "Grand espoir" (tier 6-8).
  if (potentialTierIndex(62) !== 7) throw new Error(`❌ potentialTierIndex(62) devrait être 7 (palier "⭐ Star", max 69), obtenu ${potentialTierIndex(62)}.`);
  console.log("✅ youthProspectLabel regroupe bien les 10 paliers en 3 bandes (Espoir/Grand espoir/Prodige), à la frontière exacte des seuils 49/50 et 79/80.");
}
{
  // Le potentiel réel (déjà tiré, 1-99, jamais plafonné) reste toujours
  // masqué derrière youthProspectLabel tant qu'un candidat n'est pas promu —
  // invariant simple : le label dérive uniquement de potentialTierIndex,
  // cohérent quel que soit le potentiel tiré.
  const now = Date.now();
  for (let i = 0; i < 300; i++) {
    const c = generateYouthCandidate(now, Math.ceil(Math.random() * 5));
    const label = youthProspectLabel(c.potential);
    const expectedBand = potentialTierIndex(c.potential) <= 5 ? "Espoir" : potentialTierIndex(c.potential) <= 8 ? "Grand espoir" : "Prodige";
    if (label !== expectedBand) throw new Error(`❌ youthProspectLabel(${c.potential}) incohérent avec potentialTierIndex : obtenu "${label}", attendu "${expectedBand}".`);
  }
  console.log("✅ youthProspectLabel reste cohérent avec potentialTierIndex sur des candidats générés réels (potentiel jamais plafonné à 50).");
}

// ---------------------------------------------------------------------
// Partie 3 : Team.hireRecruiter/recruiterSalary/fireRecruiter — même forme
// que hireTrainer/trainerSalary/fireTrainer (recruiterSalary réutilise
// trainerWeeklySalary telle quelle).
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  if (team.recruiter !== null) throw new Error("❌ (setup) une équipe fraîchement générée ne devrait avoir aucun recruteur.");
  if (team.recruiterSalary() !== 0) throw new Error("❌ Sans recruteur, recruiterSalary() devrait renvoyer 0.");
  team.hireRecruiter(3, 4000);
  console.log("\nRecruteur embauché :", team.recruiter);
  if (!team.recruiter || team.recruiter.level !== 3 || team.recruiter.baseSalary !== 4000 || team.recruiter.weeksEmployed !== 0) {
    throw new Error("❌ hireRecruiter devrait fixer { level, baseSalary, weeksEmployed: 0 }.");
  }
  if (team.recruiterSalary() !== trainerWeeklySalary(3, 0, 4000)) throw new Error("❌ recruiterSalary() devrait réutiliser trainerWeeklySalary telle quelle.");
  team.fireRecruiter();
  if (team.recruiter !== null || team.recruiterSalary() !== 0) throw new Error("❌ fireRecruiter() devrait remettre recruiter à null.");
  console.log("✅ hireRecruiter/recruiterSalary/fireRecruiter fonctionnent comme leurs équivalents entraîneur/analyste vidéo.");
}

// ---------------------------------------------------------------------
// Partie 4 : marché aux enchères des recruteurs (League) — même mécanique
// que coach_market_test.js, condensé sur les points spécifiques au
// recruteur (génération, enchère, résolution, congédiement + relistage -30%).
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const now = Date.now();
  const listing = lg.generateRecruiterCandidate(now);
  console.log("\nCandidat recruteur généré :", listing.status, "niveau", listing.level, "prix de départ", listing.startPrice);
  if (!listing || listing.status !== "open") throw new Error("❌ generateRecruiterCandidate devrait créer une annonce ouverte.");
  if (!TRAINER_LEVELS.includes(listing.level)) throw new Error("❌ Le niveau généré devrait être valide (1 à 5).");
  if (listing.startPrice !== TRAINER_BASE_SALARY[listing.level]) throw new Error("❌ Le prix de départ devrait être TRAINER_BASE_SALARY du niveau tiré.");
  if (listing.closesAt - listing.createdAt !== COACH_AUCTION_DURATION_MS) throw new Error("❌ La durée de l'enchère devrait être COACH_AUCTION_DURATION_MS, comme les autres marchés de staff.");
  if (!lg.recruiterListings.includes(listing)) throw new Error("❌ Le candidat devrait être poussé dans league.recruiterListings.");
  console.log("✅ Un candidat recruteur valide est généré, à la bonne durée.");
}
{
  const lg = freshLeague();
  const now = Date.now();
  const listing = lg.generateRecruiterCandidate(now);
  const tooLow = lg.placeRecruiterBid(listing.id, 0, listing.startPrice - 1, now + 10);
  if (tooLow.ok !== false || tooLow.reason !== "too-low") throw new Error("❌ Une enchère sous le prix de départ devrait être refusée.");
  const okBid = lg.placeRecruiterBid(listing.id, 0, listing.startPrice, now + 20);
  if (!okBid.ok) throw new Error("❌ Une enchère au prix de départ exact devrait être acceptée.");
  console.log("\n✅ placeRecruiterBid applique les mêmes garde-fous (prix de départ/incrément minimum) que les autres marchés de staff.");
}
{
  const lg = freshLeague(5000000);
  const now = Date.now();
  const listing = lg.generateRecruiterCandidate(now);
  const bidAmount = listing.startPrice + 3333;
  lg.placeRecruiterBid(listing.id, 0, bidAmount, now + 500);
  withMockedRandom(0.999999, () => {
    lg.refreshRecruiterMarket(now + COACH_AUCTION_DURATION_MS + 100);
  });
  console.log(`\nRésolution de l'enchère recruteur — statut : ${listing.status}/${listing.result}, prix final : ${listing.finalPrice}`);
  if (listing.status !== "closed" || listing.result !== "sold" || listing.finalPrice !== bidAmount) {
    throw new Error("❌ L'enchère devrait se conclure vendue, au montant exact enchéri.");
  }
  const recruiter = lg.teams[0].recruiter;
  if (!recruiter || recruiter.level !== listing.level || recruiter.baseSalary !== bidAmount) {
    throw new Error("❌ Le recruteur du club après résolution devrait correspondre au candidat gagné, salaire de départ = mise gagnante.");
  }
  console.log("✅ La résolution du marché des recruteurs attribue bien le recruteur gagné (Team.recruiter), salaire de départ = mise gagnante.");
}
{
  // Renouvellement continu du marché — même plancher que les autres marchés
  // de staff (COACH_MARKET_MIN_OPEN_LISTINGS).
  const lg = freshLeague();
  const now = Date.now();
  if (lg.recruiterListings.length !== 0) throw new Error("❌ (setup) aucune annonce avant le premier refreshRecruiterMarket.");
  lg.refreshRecruiterMarket(now);
  const open = lg.recruiterListings.filter(l => l.status === "open").length;
  console.log(`\nAprès le premier refreshRecruiterMarket : ${open} candidat(s) ouvert(s) (attendu ${COACH_MARKET_MIN_OPEN_LISTINGS})`);
  if (open !== COACH_MARKET_MIN_OPEN_LISTINGS) throw new Error("❌ Le marché des recruteurs devrait se remplir jusqu'au plancher dès le premier appel.");
  console.log("✅ Le marché des recruteurs se maintient au même plancher que les autres marchés de staff.");
}
{
  // Congédiement -> relistage à -30% du salaire déjà escaladé — même
  // mécanisme que fireTeamTrainer/fireTeamVideoAnalyst.
  const lg = freshLeague();
  const now = Date.now();
  lg.teams[0].hireRecruiter(3, 5000);
  lg.teams[0].recruiter.weeksEmployed = 6;
  const salaryBeforeFiring = lg.teams[0].recruiterSalary();
  const listingsBefore = lg.recruiterListings.length;
  const result = lg.fireTeamRecruiter(0, now);
  console.log(`\nCongédiement du recruteur (salaire escaladé : ${salaryBeforeFiring}) — résultat :`, result);
  if (!result.ok || !result.relisted) throw new Error("❌ Congédier un recruteur EN POSTE devrait réussir et le relister.");
  if (lg.teams[0].recruiter) throw new Error("❌ L'équipe ne devrait plus avoir de recruteur après fireTeamRecruiter.");
  if (lg.recruiterListings.length !== listingsBefore + 1) throw new Error("❌ fireTeamRecruiter devrait pousser exactement une nouvelle annonce.");
  const relisted = lg.recruiterListings[lg.recruiterListings.length - 1];
  const expectedStartPrice = Math.max(1, Math.round(salaryBeforeFiring * 0.7));
  console.log(`Nouvelle annonce — niveau ${relisted.level} (attendu 3), prix de départ ${relisted.startPrice} (attendu ${expectedStartPrice})`);
  if (relisted.level !== 3 || relisted.startPrice !== expectedStartPrice) throw new Error("❌ Le relistage devrait reprendre le niveau du recruteur congédié, à 70% de son salaire déjà escaladé.");
  console.log("✅ Congédier un recruteur le reliste à -30% de son salaire déjà escaladé, même niveau, même forme d'annonce.");

  // Sans recruteur en poste : no-op propre.
  const noopResult = lg.fireTeamRecruiter(1, now);
  if (!noopResult.ok || noopResult.relisted) throw new Error("❌ Congédier sans recruteur en poste devrait être un no-op propre (ok:true, relisted:false).");
  console.log("✅ Congédier sans recruteur en poste reste un no-op propre.");
}

// ---------------------------------------------------------------------
// Partie 5 : Team.refreshYouthCandidates — vivier PRIVÉ, alimenté
// uniquement quand un recruteur est sous contrat, plafonné à
// YOUTH_CANDIDATE_QUEUE_MAX, expire après YOUTH_CANDIDATE_EXPIRY_MS.
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  const now = Date.now();
  withMockedRandom(0.0, () => team.refreshYouthCandidates(now)); // random toujours "gagnant"
  console.log("\nSans recruteur sous contrat, refreshYouthCandidates :", team.youthCandidates.length, "candidat(s) (attendu 0)");
  if (team.youthCandidates.length !== 0) throw new Error("❌ Sans recruteur sous contrat, aucune proposition ne devrait jamais être générée, même avec Math.random() toujours favorable.");
  console.log("✅ Aucune proposition sans recruteur sous contrat.");
}
{
  const team = freshTeam();
  const now = Date.now();
  team.hireRecruiter(3, 3000);
  withMockedRandom(0.0, () => {
    for (let i = 0; i < 10; i++) team.refreshYouthCandidates(now + i);
  });
  console.log(`\nAvec recruteur + random toujours favorable, file remplie à : ${team.youthCandidates.length} (plafond attendu ${YOUTH_CANDIDATE_QUEUE_MAX})`);
  if (team.youthCandidates.length !== YOUTH_CANDIDATE_QUEUE_MAX) throw new Error("❌ La file de propositions devrait se remplir jusqu'à YOUTH_CANDIDATE_QUEUE_MAX, jamais plus.");
  console.log("✅ La file de propositions ne dépasse jamais YOUTH_CANDIDATE_QUEUE_MAX.");
}
{
  const team = freshTeam();
  const now = Date.now();
  team.hireRecruiter(3, 3000);
  withMockedRandom(0.0, () => team.refreshYouthCandidates(now));
  if (team.youthCandidates.length !== 1) throw new Error("❌ (setup) une proposition attendue.");
  const stillThere = team.youthCandidates[0];
  // Juste avant expiration : toujours là.
  withMockedRandom(1.0, () => team.refreshYouthCandidates(stillThere.expiresAt - 1)); // random défavorable : pas de nouvelle génération
  if (team.youthCandidates.length !== 1) throw new Error("❌ Une proposition ne devrait pas expirer avant sa date d'expiration exacte.");
  // Juste après expiration : purgée (random défavorable, donc aucune nouvelle proposition ne la remplace ici).
  withMockedRandom(1.0, () => team.refreshYouthCandidates(stillThere.expiresAt + 1));
  console.log(`\nAprès expiration (fenêtre ${YOUTH_CANDIDATE_EXPIRY_MS}ms = ${YOUTH_CANDIDATE_EXPIRY_MS / (24 * 3600 * 1000)} jours) : ${team.youthCandidates.length} proposition(s) restante(s) (attendu 0)`);
  if (team.youthCandidates.length !== 0) throw new Error("❌ Une proposition non traitée devrait expirer et disparaître après YOUTH_CANDIDATE_EXPIRY_MS.");
  if (YOUTH_CANDIDATE_EXPIRY_MS !== COACH_AUCTION_DURATION_MS) throw new Error("❌ La fenêtre d'expiration devrait être la même que les marchés aux enchères de staff (3 jours réels).");
  console.log("✅ Une proposition non traitée expire d'elle-même après YOUTH_CANDIDATE_EXPIRY_MS (= COACH_AUCTION_DURATION_MS, 3 jours réels), sans consommer de place.");
}

// ---------------------------------------------------------------------
// Partie 6 : Team.signYouthCandidate — déplace vers youthPlayers, fixe le
// salaire de stagiaire FIXE, NE recalcule ni n'expose le potentiel exact
// (reste caché derrière youthProspectLabel jusqu'à la promotion, voir Partie
// 2 et Partie 10), refuse à 15/15.
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  const now = Date.now();
  const candidate = generateYouthCandidate(now, 3);
  team.youthCandidates.push(candidate);
  const res = team.signYouthCandidate(candidate.id);
  console.log("\nSignature d'un candidat :", res.ok, "| salaire :", res.player && res.player.salary, "| bande affichée :", res.player && youthProspectLabel(res.player.potential));
  if (!res.ok) throw new Error("❌ Signer un candidat existant devrait réussir.");
  if (team.youthCandidates.some(c => c.id === candidate.id)) throw new Error("❌ Le candidat signé devrait quitter youthCandidates.");
  if (!team.youthPlayers.some(p => p.id === candidate.id)) throw new Error("❌ Le candidat signé devrait rejoindre youthPlayers.");
  if (res.player.salary !== YOUTH_TRAINEE_WEEKLY_SALARY) throw new Error(`❌ Le salaire d'un stagiaire signé devrait être le tarif fixe YOUTH_TRAINEE_WEEKLY_SALARY (${YOUTH_TRAINEE_WEEKLY_SALARY}), obtenu ${res.player.salary}.`);
  if (res.player.potential !== candidate.potential) throw new Error("❌ Le potentiel exact ne devrait JAMAIS être recalculé à la signature (déjà tiré à la génération du candidat).");
  if (youthProspectLabel(res.player.potential) !== youthProspectLabel(candidate.potential)) throw new Error("❌ La bande affichée avant/après signature devrait rester identique (signer ne change rien à ce qui est montré).");
  console.log("✅ Signer un candidat le déplace vers youthPlayers, fixe son salaire au tarif de stagiaire, SANS exposer le potentiel exact (toujours la bande grossière).");
}
{
  const team = freshTeam();
  const bogus = team.signYouthCandidate(999999999);
  if (bogus.ok !== false || bogus.reason !== "not-found") throw new Error("❌ Signer un id de candidat inexistant devrait échouer avec reason 'not-found'.");
  console.log("\n✅ Signer un candidat inexistant échoue proprement (not-found).");
}
{
  // Effectif jeunes déjà complet (15/15) : refus explicite, le candidat
  // reste dans youthCandidates (rien n'est perdu).
  const team = freshTeam();
  const now = Date.now();
  for (let i = 0; i < MAX_YOUTH_ROSTER_SIZE; i++) {
    const c = generateYouthCandidate(now, 1);
    team.youthCandidates.push(c);
    team.signYouthCandidate(c.id);
  }
  console.log(`\nEffectif jeunes rempli : ${team.youthPlayers.length}/${MAX_YOUTH_ROSTER_SIZE}`);
  if (team.youthPlayers.length !== MAX_YOUTH_ROSTER_SIZE) throw new Error("❌ (setup) l'effectif jeunes devrait être plein à ce stade.");
  const extra = generateYouthCandidate(now, 1);
  team.youthCandidates.push(extra);
  const res = team.signYouthCandidate(extra.id);
  console.log("Tentative de signature à 15/15 :", res.ok, res.reason);
  if (res.ok !== false || res.reason !== "youth-roster-full") throw new Error("❌ Signer alors que l'effectif jeunes est déjà à MAX_YOUTH_ROSTER_SIZE devrait échouer avec reason 'youth-roster-full'.");
  if (!team.youthCandidates.some(c => c.id === extra.id)) throw new Error("❌ Un candidat refusé pour effectif plein devrait rester dans youthCandidates (rien n'est perdu).");
  console.log("✅ Signer à 15/15 est refusé (youth-roster-full), sans perdre le candidat.");
}

// ---------------------------------------------------------------------
// Partie 7 : Team.declineYouthCandidate — retire sans consommer de place.
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  const now = Date.now();
  const candidate = generateYouthCandidate(now, 2);
  team.youthCandidates.push(candidate);
  const res = team.declineYouthCandidate(candidate.id);
  console.log("\nRefus d'un candidat :", res.ok, "| file restante :", team.youthCandidates.length, "| effectif jeunes :", team.youthPlayers.length);
  if (!res.ok) throw new Error("❌ Refuser un candidat existant devrait réussir.");
  if (team.youthCandidates.length !== 0 || team.youthPlayers.length !== 0) throw new Error("❌ Refuser un candidat ne devrait consommer AUCUNE place d'effectif jeunes.");
  const bogus = team.declineYouthCandidate(999999999);
  if (bogus.ok !== false || bogus.reason !== "not-found") throw new Error("❌ Refuser un id inexistant devrait échouer avec reason 'not-found'.");
  console.log("✅ Refuser un candidat le retire sans consommer de place, et échoue proprement sur un id inconnu.");
}

// ---------------------------------------------------------------------
// Partie 8 : Team.growYouthPlayers (via trainWeek) — progression AUTOMATIQUE,
// mise à l'échelle par le Centre de formation (trainingCenterGrowthMultiplier).
// ---------------------------------------------------------------------
{
  function makeYouthPlayer() {
    const attrs = {};
    ATTRS.forEach(a => attrs[a] = 15);
    const p = new Player({ name: "Jeune Test", position: "Meneur", height: 190, age: 16, attrs, aggressiveness: 50 });
    p.potential = 50; // large marge de progression pour que la croissance soit bien mesurable
    return p;
  }

  const teamLevel1 = freshTeam();
  teamLevel1.youthPlayers = [makeYouthPlayer()];
  teamLevel1.trainingCenterLevel = 1; // ×1.0

  const teamLevel5 = freshTeam();
  teamLevel5.youthPlayers = [makeYouthPlayer()];
  teamLevel5.trainingCenterLevel = 5; // ×2.8

  const sumAttrs = p => ATTRS.reduce((s, a) => s + p.attrs[a], 0);
  const before1 = sumAttrs(teamLevel1.youthPlayers[0]);
  const before5 = sumAttrs(teamLevel5.youthPlayers[0]);

  // Même tirage aléatoire figé pour les deux équipes (0.5, milieu de
  // rand(0.5,1.3)/rand(0.3,1.0)) : seule la différence de
  // trainingCenterGrowthMultiplier doit expliquer l'écart de progression.
  withMockedRandom(0.5, () => {
    for (let i = 0; i < 20; i++) {
      teamLevel1.growYouthPlayers();
      teamLevel5.growYouthPlayers();
    }
  });

  const after1 = sumAttrs(teamLevel1.youthPlayers[0]);
  const after5 = sumAttrs(teamLevel5.youthPlayers[0]);
  console.log(`\nProgression sur 20 ticks (même tirage figé) — Centre niveau 1 (×1.0) : +${after1 - before1} | niveau 5 (×2.8) : +${after5 - before5}`);
  if (after1 <= before1) throw new Error("❌ Le jeune du Centre niveau 1 devrait tout de même progresser (potentiel large, écart à combler).");
  if (after5 - before5 <= after1 - before1) throw new Error("❌ Le Centre de formation niveau 5 (×2.8) devrait produire une progression nettement supérieure au niveau 1 (×1.0), à tirage aléatoire identique.");
  // Correctif 2026-09 : plafond de 50 PAR CARACTÉRISTIQUE appliqué par
  // growYouthPlayers lui-même, quel que soit le Centre de formation (même le
  // niveau 5, le plus rapide) — jamais dépassé, même sur ce joueur monté à
  // potentiel 50 avec une large marge de progression.
  ATTRS.forEach(a => {
    if (teamLevel1.youthPlayers[0].attrs[a] > 50) throw new Error(`❌ growYouthPlayers ne devrait JAMAIS pousser une caractéristique au-dessus de 50 (Centre niveau 1, ${a} = ${teamLevel1.youthPlayers[0].attrs[a]}).`);
    if (teamLevel5.youthPlayers[0].attrs[a] > 50) throw new Error(`❌ growYouthPlayers ne devrait JAMAIS pousser une caractéristique au-dessus de 50 (Centre niveau 5, ${a} = ${teamLevel5.youthPlayers[0].attrs[a]}).`);
  });
  console.log("✅ La progression automatique des jeunes est bien mise à l'échelle par trainingCenterGrowthMultiplier, et plafonnée à 50 par caractéristique (Centre niveau 1 ET niveau 5).");
}
{
  // Le plafond à 50 est INDÉPENDANT du potentiel réel (qui peut être bien
  // plus haut, ex. 90) — même avec un potentiel élevé et beaucoup de passes
  // de croissance (Centre de formation au palier maximum, le plus rapide),
  // aucune caractéristique ne doit jamais dépasser 50 tant que le joueur
  // reste dans l'académie (growYouthPlayers). C'est la promotion en pro,
  // PAS l'académie, qui débloquera le potentiel réel de 90 (voir Partie 10).
  const team = freshTeam();
  const attrs = {}; ATTRS.forEach(a => attrs[a] = 15);
  const prodigy = new Player({ name: "Prodige Test", position: "Ailier shooteur", height: 196, age: 15, attrs, aggressiveness: 50 });
  prodigy.potential = 90; // haut potentiel réel — AUCUN rapport avec le plafond académie
  team.youthPlayers = [prodigy];
  team.trainingCenterLevel = 5; // ×2.8, le plus rapide
  withMockedRandom(0.9, () => { // tirage haut : pousse la croissance au maximum
    for (let i = 0; i < 200; i++) team.growYouthPlayers(); // largement assez pour atteindre le plafond sans lui
  });
  const maxAttr = Math.max(...ATTRS.map(a => prodigy.attrs[a]));
  console.log(`\nProdige (potentiel réel 90) après 200 passes de croissance académie — caractéristique max atteinte : ${maxAttr} (jamais > 50, indépendamment du potentiel)`);
  if (maxAttr > 50) throw new Error(`❌ Aucune caractéristique ne devrait JAMAIS dépasser 50 sous growYouthPlayers, même avec un potentiel réel élevé (90) et 200 passes de croissance : obtenu ${maxAttr}.`);
  if (maxAttr < 45) throw new Error("❌ Avec 200 passes de croissance à tirage favorable, le plafond de 50 devrait être atteint ou presque sur au moins une caractéristique.");
  console.log("✅ Le plafond de 50 par caractéristique est indépendant du potentiel réel (90 ici) — l'académie seule ne peut jamais le dépasser.");
}
{
  // growYouthPlayers ne touche JAMAIS l'effectif pro, et inversement — deux
  // populations bien séparées.
  const team = freshTeam();
  const proAttrsBefore = team.players.map(p => ({ ...p.attrs }));
  const youthPlayer = (() => {
    const attrs = {}; ATTRS.forEach(a => attrs[a] = 15);
    const p = new Player({ name: "Isolation Test", position: "Pivot", height: 205, age: 16, attrs, aggressiveness: 50 });
    p.potential = 50;
    return p;
  })();
  team.youthPlayers = [youthPlayer];
  withMockedRandom(0.5, () => team.growYouthPlayers());
  const proAttrsAfter = team.players.map(p => ({ ...p.attrs }));
  console.log("\nEffectif pro inchangé par growYouthPlayers :", JSON.stringify(proAttrsBefore) === JSON.stringify(proAttrsAfter));
  if (JSON.stringify(proAttrsBefore) !== JSON.stringify(proAttrsAfter)) throw new Error("❌ growYouthPlayers ne devrait jamais toucher l'effectif pro (this.players).");
  console.log("✅ La progression automatique des jeunes reste strictement isolée de l'effectif pro.");
}

// ---------------------------------------------------------------------
// Partie 9 : Team.trainWeek — hooks académie (paiement, progression, passage
// de saison : vieillissement + décision de 18 ans + auto-libération par
// défaut si non tranchée).
// ---------------------------------------------------------------------
{
  // Salaire des stagiaires (youthPayroll) et du recruteur — lignes de dépense
  // dédiées, séparées de la masse salariale pro et du salaire du staff.
  const team = freshTeam();
  team.hireRecruiter(2, 1500);
  const attrs = {}; ATTRS.forEach(a => attrs[a] = 15);
  team.youthPlayers = [
    new Player({ name: "Stagiaire 1", position: "Meneur", height: 190, age: 16, attrs, aggressiveness: 50 }),
    new Player({ name: "Stagiaire 2", position: "Pivot", height: 205, age: 16, attrs, aggressiveness: 50 }),
  ];
  const report = team.trainWeek(1, Date.now());
  console.log(`\nRapport trainWeek — recruiterSalaryPaid : ${report.recruiterSalaryPaid}, youthPayroll : ${report.youthPayroll} (attendu ${2 * YOUTH_TRAINEE_WEEKLY_SALARY})`);
  if (report.recruiterSalaryPaid <= 0) throw new Error("❌ Un recruteur sous contrat devrait générer un recruiterSalaryPaid > 0 dans le rapport.");
  if (report.youthPayroll !== 2 * YOUTH_TRAINEE_WEEKLY_SALARY) throw new Error(`❌ youthPayroll devrait valoir (nombre de stagiaires × YOUTH_TRAINEE_WEEKLY_SALARY) = ${2 * YOUTH_TRAINEE_WEEKLY_SALARY}, obtenu ${report.youthPayroll}.`);
  if (!team.transactions.some(t => /recruteur/i.test(t.label))) throw new Error("❌ Le salaire du recruteur devrait être journalisé dans les transactions.");
  if (!team.transactions.some(t => /centre de formation/i.test(t.label))) throw new Error("❌ La masse salariale des stagiaires devrait être journalisée séparément (\"Salaires du centre de formation\").");
  console.log("✅ trainWeek paie bien le recruteur et les stagiaires (youthPayroll), chacun dans sa propre ligne de transaction.");
}
{
  // Vieillissement + décision de 18 ans : uniquement au passage d'une
  // SAISON (SEASON_LENGTH_WEEKS), jamais une semaine ordinaire.
  const team = freshTeam();
  const attrs = {}; ATTRS.forEach(a => attrs[a] = 15);
  const youngster = new Player({ name: "Bientôt 18 ans", position: "Ailier fort", height: 200, age: 17, attrs, aggressiveness: 50 });
  team.youthPlayers = [youngster];
  team.week = 3; // pas un multiple de SEASON_LENGTH_WEEKS -> pas de passage de saison

  team.trainWeek(1, Date.now());
  console.log(`\nSemaine ordinaire (week=${team.week}) — âge inchangé : ${youngster.age === 17}, pendingYouthDecisions : ${team.pendingYouthDecisions.length}`);
  if (youngster.age !== 17 || team.pendingYouthDecisions.length !== 0) throw new Error("❌ Une semaine ordinaire (hors passage de saison) ne devrait ni vieillir les jeunes ni créer de décision en attente.");

  team.week = SEASON_LENGTH_WEEKS - 1; // le prochain trainWeek() franchit la frontière de saison
  team.trainWeek(1, Date.now());
  console.log(`Passage de saison (week=${team.week}) — âge : ${youngster.age} (attendu 18), pendingYouthDecisions : ${JSON.stringify(team.pendingYouthDecisions)}`);
  if (youngster.age !== 18) throw new Error("❌ Au passage d'une saison, un jeune de l'académie devrait vieillir d'un an comme l'effectif pro.");
  if (!team.pendingYouthDecisions.includes(youngster.id)) throw new Error("❌ Un jeune qui atteint 18 ans au passage de saison devrait apparaître dans pendingYouthDecisions.");
  console.log("✅ Le vieillissement des jeunes et la création d'une décision de 18 ans n'ont lieu qu'au passage d'une saison (SEASON_LENGTH_WEEKS), pas chaque semaine.");
}
{
  // Auto-libération par défaut : une décision laissée SANS RÉPONSE jusqu'au
  // passage de la saison SUIVANTE entraîne une libération automatique.
  const team = freshTeam();
  const attrs = {}; ATTRS.forEach(a => attrs[a] = 15);
  const youngster = new Player({ name: "Décision ignorée", position: "Arrière", height: 192, age: 17, attrs, aggressiveness: 50 });
  team.youthPlayers = [youngster];
  team.week = SEASON_LENGTH_WEEKS - 1;
  team.trainWeek(1, Date.now()); // franchit la frontière : youngster passe à 18 ans, décision en attente
  if (!team.pendingYouthDecisions.includes(youngster.id)) throw new Error("❌ (setup) une décision de 18 ans est attendue ici.");

  // Aucune décision manager prise entre-temps -> saison suivante.
  team.week = 2 * SEASON_LENGTH_WEEKS - 1;
  team.trainWeek(1, Date.now());
  console.log(`\nAprès une saison entière sans décision — jeune encore dans youthPlayers : ${team.youthPlayers.some(p => p.id === youngster.id)}, pendingYouthDecisions : ${JSON.stringify(team.pendingYouthDecisions)}`);
  if (team.youthPlayers.some(p => p.id === youngster.id)) throw new Error("❌ Un jeune de 18 ans laissé sans décision jusqu'à la saison suivante devrait être auto-libéré (retiré de youthPlayers).");
  if (team.pendingYouthDecisions.includes(youngster.id)) throw new Error("❌ Une décision auto-résolue (libération) ne devrait plus figurer dans pendingYouthDecisions.");
  if (team.players.some(p => p.id === youngster.id)) throw new Error("❌ L'auto-libération ne devrait JAMAIS promouvoir le jeune vers l'effectif pro — seulement le retirer.");
  console.log("✅ Une décision de 18 ans non tranchée avant la saison suivante entraîne une auto-libération par défaut (jamais une auto-promotion).");
}

// ---------------------------------------------------------------------
// Partie 10 : Team.promoteYouthPlayer / releaseYouthPlayer — décision
// manager explicite (avant l'échéance ci-dessus).
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  const attrs = {}; ATTRS.forEach(a => attrs[a] = 60);
  const youngster = new Player({ name: "À promouvoir", position: "Ailier shooteur", height: 198, age: 18, attrs, aggressiveness: 50 });
  team.youthPlayers = [youngster];
  team.pendingYouthDecisions = [youngster.id];
  const rosterBefore = team.players.length;

  // Retour utilisateur (2026-09) : "ajoute la date à laquelle le joueur est
  // passé pro", `now` explicite (pas Date.now() implicite dans la
  // méthode, voir Team.promoteYouthPlayer), fixé ici pour une assertion
  // déterministe sur academyGraduatesHistory[].promotedAt.
  const promoteTime = Date.UTC(2026, 8, 19, 10, 0);
  const res = team.promoteYouthPlayer(youngster.id, promoteTime);
  console.log(`\nPromotion — ok : ${res.ok}, salaire attribué : ${res.player && res.player.salary} (attendu salaryForOverall(overall) = ${salaryForOverall(youngster.overall())})`);
  if (!res.ok) throw new Error("❌ Promouvoir un jeune de 18 ans en attente de décision devrait réussir.");
  if (team.youthPlayers.some(p => p.id === youngster.id)) throw new Error("❌ Le jeune promu devrait quitter youthPlayers.");
  if (!team.players.some(p => p.id === youngster.id)) throw new Error("❌ Le jeune promu devrait rejoindre l'effectif pro (this.players).");
  if (team.players.length !== rosterBefore + 1) throw new Error("❌ L'effectif pro devrait grandir exactement d'une unité après une promotion.");
  if (team.pendingYouthDecisions.includes(youngster.id)) throw new Error("❌ La décision devrait être retirée de pendingYouthDecisions une fois tranchée.");
  if (res.player.salary !== salaryForOverall(res.player.overall())) throw new Error("❌ Le salaire d'un jeune promu devrait être recalculé à sa vraie valeur de marché (salaryForOverall), pas rester au tarif de stagiaire.");
  console.log("✅ Promouvoir un jeune de 18 ans le déplace vers l'effectif pro, avec un salaire recalculé à sa vraie valeur de marché.");

  const histEntry = (team.academyGraduatesHistory || []).find(h => h.name === youngster.name);
  console.log(`Entrée d'historique académie : nom ${histEntry && histEntry.name}, poste ${histEntry && histEntry.position}, promotedAt ${histEntry && histEntry.promotedAt} (attendu ${promoteTime})`);
  if (!histEntry) throw new Error("❌ La promotion devrait ajouter une entrée dans academyGraduatesHistory.");
  if (histEntry.position !== youngster.position) throw new Error(`❌ L'entrée d'historique devrait porter le poste du joueur, obtenu "${histEntry.position}".`);
  if (histEntry.promotedAt !== promoteTime) throw new Error(`❌ L'entrée d'historique devrait porter exactement le \`now\` passé à promoteYouthPlayer, obtenu ${histEntry.promotedAt} au lieu de ${promoteTime}.`);
  console.log("✅ La promotion ajoute bien une entrée d'historique (nom, poste, date de promotion = `now` passé explicitement).");

  const restored = teamFromSave(serializeTeam(team));
  const restoredEntry = (restored.academyGraduatesHistory || []).find(h => h.name === youngster.name);
  console.log(`Après aller-retour de sauvegarde, entrée retrouvée : ${!!restoredEntry}, promotedAt : ${restoredEntry && restoredEntry.promotedAt}`);
  if (!restoredEntry || restoredEntry.promotedAt !== promoteTime) throw new Error("❌ academyGraduatesHistory (nom, poste, promotedAt) devrait survivre à un aller-retour de sauvegarde.");
  console.log("✅ academyGraduatesHistory (avec la date de promotion) survit bien à un aller-retour de sauvegarde.");
}
{
  // Correctif 2026-09 : après promotion, le joueur redevient un pro NORMAL
  // — plus aucun plafond à 50 (celui de growYouthPlayers ne s'applique QUE
  // dans l'académie), le trainWeek PRO habituel peut le pousser au-delà,
  // vers son potentiel réel (ici volontairement élevé, 90) exactement comme
  // n'importe quel autre pro.
  const team = freshTeam();
  const attrs = {}; ATTRS.forEach(a => attrs[a] = 50); // déjà au plafond académie
  const prodigy = new Player({ name: "Ex-prodige académie", position: "Pivot", height: 208, age: 18, attrs, aggressiveness: 50 });
  prodigy.potential = 85; // potentiel réel élevé (palier "🔥 Superstar", max 89), jamais exploité tant qu'il restait à l'académie
  team.youthPlayers = [prodigy];
  team.pendingYouthDecisions = [prodigy.id];
  const promoteRes = team.promoteYouthPlayer(prodigy.id, Date.now());
  if (!promoteRes.ok) throw new Error("❌ (setup) la promotion devrait réussir ici.");

  const attrWeights = {}; ATTRS.forEach(a => attrWeights[a] = 1); // entraînement pro classique, à fond sur toutes les caracs
  withMockedRandom(0.9, () => {
    for (let i = 0; i < 40; i++) prodigy.trainWeek(attrWeights, 1); // trainWeek PRO habituel, SANS growYouthPlayers
  });
  const maxAttrAfterPromotion = Math.max(...ATTRS.map(a => prodigy.attrs[a]));
  console.log(`\nAprès promotion + entraînement pro classique (40 semaines, tirage favorable) — caractéristique max : ${maxAttrAfterPromotion} (devrait pouvoir dépasser 50, potentiel réel 85)`);
  if (maxAttrAfterPromotion <= 50) throw new Error(`❌ Une fois promu, l'entraînement pro classique devrait pouvoir dépasser 50 (aucun plafond académie hors growYouthPlayers) : obtenu ${maxAttrAfterPromotion}.`);
  console.log("✅ Une fois promu, le plafond à 50 disparaît : le trainWeek pro classique peut pousser les caractéristiques au-delà, vers le potentiel réel.");

  // Et l'affichage bascule vers le palier fin normal (potentialTierLabel),
  // plus le label grossier à 3 bandes de l'académie.
  console.log("Label affiché pour ce pro (potentiel 85) :", potentialTierLabel(prodigy.potential), "(plus youthProspectLabel, réservé à l'académie)");
  if (potentialTierLabel(prodigy.potential) !== "🔥 Superstar") throw new Error(`❌ Un pro de potentiel 85 devrait afficher le palier fin normal "🔥 Superstar" (potentialTierLabel), obtenu "${potentialTierLabel(prodigy.potential)}".`);
}
{
  // Effectif pro déjà au plafond (MAX_ROSTER_SIZE) : promotion refusée,
  // le jeune reste dans youthPlayers (rien n'est perdu).
  const team = freshTeam();
  while (team.players.length < MAX_ROSTER_SIZE) {
    team.players.push(new Player({ name: "Effectif complet", position: "Pivot", height: 205, age: 25, attrs: { midRange: 40, threePoint: 40, inside: 40, pass: 40, rebound: 40, block: 40, dribble: 40, agility: 40, defOutside: 40, defInside: 40 }, aggressiveness: 50 }));
  }
  const attrs = {}; ATTRS.forEach(a => attrs[a] = 60);
  const youngster = new Player({ name: "Sans place", position: "Meneur", height: 190, age: 18, attrs, aggressiveness: 50 });
  team.youthPlayers = [youngster];
  const res = team.promoteYouthPlayer(youngster.id, Date.now());
  console.log(`\nPromotion à effectif pro plein (${team.players.length}/${MAX_ROSTER_SIZE}) :`, res);
  if (res.ok !== false || res.reason !== "roster-full") throw new Error("❌ Promouvoir alors que l'effectif pro est déjà à MAX_ROSTER_SIZE devrait échouer avec reason 'roster-full'.");
  if (!team.youthPlayers.some(p => p.id === youngster.id)) throw new Error("❌ Un jeune refusé pour effectif pro plein devrait rester dans youthPlayers.");
  console.log("✅ Promouvoir alors que l'effectif pro est déjà plein est refusé (roster-full), sans perdre le jeune.");
}
{
  const team = freshTeam();
  const attrs = {}; ATTRS.forEach(a => attrs[a] = 30);
  const youngster = new Player({ name: "À libérer", position: "Pivot", height: 207, age: 18, attrs, aggressiveness: 50 });
  team.youthPlayers = [youngster];
  team.pendingYouthDecisions = [youngster.id];
  const res = team.releaseYouthPlayer(youngster.id);
  console.log("\nLibération manager explicite :", res.ok, "| youthPlayers :", team.youthPlayers.length, "| effectif pro :", team.players.length);
  if (!res.ok) throw new Error("❌ Libérer un jeune en attente de décision devrait réussir.");
  if (team.youthPlayers.some(p => p.id === youngster.id)) throw new Error("❌ Le jeune libéré devrait quitter youthPlayers.");
  if (team.players.some(p => p.id === youngster.id)) throw new Error("❌ Libérer ne devrait JAMAIS envoyer le jeune vers l'effectif pro.");
  if (team.pendingYouthDecisions.includes(youngster.id)) throw new Error("❌ La décision devrait être retirée de pendingYouthDecisions une fois tranchée.");
  const bogus = team.releaseYouthPlayer(999999999);
  if (bogus.ok !== false || bogus.reason !== "not-found") throw new Error("❌ Libérer un id inexistant devrait échouer avec reason 'not-found'.");
  console.log("✅ Libérer un jeune de 18 ans le retire définitivement, sans jamais le promouvoir, et échoue proprement sur un id inconnu.");
}

// ---------------------------------------------------------------------
// Partie 11 : Centre de formation — 5 paliers tiered comme ARENA_LEVELS,
// upgradeTrainingCenter/nextTrainingCenterLevel/trainingCenterGrowthMultiplier.
// ---------------------------------------------------------------------
{
  console.log("\nTRAINING_CENTER_LEVELS :", TRAINING_CENTER_LEVELS.map(t => `${t.level}:${t.name} (${t.upgradeCost}€, ×${t.growthMultiplier})`).join(" | "));
  if (TRAINING_CENTER_LEVELS.length !== 5) throw new Error("❌ Le Centre de formation devrait avoir exactement 5 paliers.");
  if (TRAINING_CENTER_LEVELS[0].upgradeCost !== 0) throw new Error("❌ Le palier 1 devrait être gratuit (déjà acquis au démarrage).");
  for (let i = 1; i < TRAINING_CENTER_LEVELS.length; i++) {
    if (TRAINING_CENTER_LEVELS[i].upgradeCost <= TRAINING_CENTER_LEVELS[i - 1].upgradeCost) throw new Error("❌ Le coût d'agrandissement devrait strictement grandir à chaque palier.");
    if (TRAINING_CENTER_LEVELS[i].growthMultiplier <= TRAINING_CENTER_LEVELS[i - 1].growthMultiplier) throw new Error("❌ Le multiplicateur de progression devrait strictement grandir à chaque palier.");
  }
  console.log("✅ TRAINING_CENTER_LEVELS a bien 5 paliers, coût et multiplicateur strictement croissants, palier 1 gratuit.");
}
{
  const team = freshTeam(0); // budget nul : aucun agrandissement possible
  if (team.trainingCenterLevel !== 1) throw new Error("❌ (setup) une équipe fraîchement générée devrait démarrer au palier 1.");
  if (team.trainingCenterGrowthMultiplier() !== 1.0) throw new Error("❌ Au palier 1, trainingCenterGrowthMultiplier() devrait valoir 1.0 (aucun bonus).");
  const failedUpgrade = team.upgradeTrainingCenter();
  console.log("\nAgrandissement refusé faute de budget :", failedUpgrade === false, "| niveau inchangé :", team.trainingCenterLevel === 1);
  if (failedUpgrade !== false || team.trainingCenterLevel !== 1) throw new Error("❌ upgradeTrainingCenter() devrait échouer (renvoyer false) et laisser le niveau inchangé sans budget suffisant.");

  team.budget = 10000000;
  const next = team.nextTrainingCenterLevel();
  const ok = team.upgradeTrainingCenter();
  console.log(`Agrandissement réussi avec budget suffisant : niveau ${team.trainingCenterLevel} (attendu ${next.level}), multiplicateur ${team.trainingCenterGrowthMultiplier()} (attendu ${next.growthMultiplier})`);
  if (!ok || team.trainingCenterLevel !== next.level) throw new Error("❌ upgradeTrainingCenter() devrait faire progresser trainingCenterLevel d'exactement un palier.");
  if (team.trainingCenterGrowthMultiplier() !== next.growthMultiplier) throw new Error("❌ trainingCenterGrowthMultiplier() devrait refléter le nouveau palier immédiatement après l'agrandissement.");
  console.log("✅ upgradeTrainingCenter respecte le même contrat qu'upgradeArena : un palier à la fois, vérifié par le budget, coût prélevé immédiatement.");
}
{
  // Palier maximum : plus rien à agrandir.
  const team = freshTeam(999999999);
  TRAINING_CENTER_LEVELS.forEach(() => team.upgradeTrainingCenter());
  console.log(`\nAu palier maximum (${team.trainingCenterLevel}) — nextTrainingCenterLevel : ${team.nextTrainingCenterLevel()}`);
  if (team.trainingCenterLevel !== TRAINING_CENTER_LEVELS[TRAINING_CENTER_LEVELS.length - 1].level) throw new Error("❌ Avec un budget illimité, le Centre de formation devrait atteindre son palier maximum.");
  if (team.nextTrainingCenterLevel() !== null) throw new Error("❌ Au palier maximum, nextTrainingCenterLevel() devrait renvoyer null.");
  if (team.upgradeTrainingCenter() !== false) throw new Error("❌ Au palier maximum, upgradeTrainingCenter() devrait échouer (renvoyer false), même avec un budget illimité.");
  console.log("✅ Le Centre de formation ne dépasse jamais son palier maximum.");
}

// ---------------------------------------------------------------------
// Partie 12 : persistance — recruiter, youthCandidates (avec
// createdAt/expiresAt), youthPlayers, trainingCenterLevel,
// pendingYouthDecisions (Team) et recruiterListings (League) survivent à un
// aller-retour de sauvegarde ; compatibilité ascendante avec une VIEILLE
// sauvegarde qui n'a aucun de ces champs.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const now = Date.now();
  lg.refreshRecruiterMarket(now); // peuple lg.recruiterListings
  lg.teams[0].hireRecruiter(4, 7654);
  lg.teams[0].trainingCenterLevel = 3;
  const candidate = generateYouthCandidate(now, 3);
  lg.teams[0].youthCandidates.push(candidate);
  const attrs = {}; ATTRS.forEach(a => attrs[a] = 22);
  const youthPlayer = new Player({ name: "Persisté", position: "Ailier fort", height: 201, age: 16, attrs, aggressiveness: 50 });
  youthPlayer.potential = 42;
  youthPlayer.salary = YOUTH_TRAINEE_WEEKLY_SALARY;
  lg.teams[0].youthPlayers.push(youthPlayer);
  lg.teams[0].pendingYouthDecisions = [999];

  const savedTeam = serializeTeam(lg.teams[0]);
  const savedLeague = serializeLeague(lg);
  const teamBack = teamFromSave(savedTeam);
  const lgBack = leagueFromSave(savedLeague, teamBack);

  console.log("\nRecruteur avant/après round-trip :", lg.teams[0].recruiter, "/", teamBack.recruiter);
  if (!teamBack.recruiter || teamBack.recruiter.level !== 4 || teamBack.recruiter.baseSalary !== 7654) throw new Error("❌ Team.recruiter devrait survivre intégralement à un aller-retour de sauvegarde.");
  if (teamBack.trainingCenterLevel !== 3) throw new Error("❌ trainingCenterLevel devrait survivre à un aller-retour de sauvegarde.");
  if (JSON.stringify(teamBack.pendingYouthDecisions) !== JSON.stringify([999])) throw new Error("❌ pendingYouthDecisions devrait survivre à un aller-retour de sauvegarde.");

  if (teamBack.youthCandidates.length !== 1) throw new Error("❌ youthCandidates devrait survivre à un aller-retour de sauvegarde.");
  const candidateBack = teamBack.youthCandidates[0];
  console.log("Candidat restauré — potentiel :", candidateBack.potential, "(attendu", candidate.potential, ") | createdAt/expiresAt préservés :", candidateBack.createdAt === candidate.createdAt && candidateBack.expiresAt === candidate.expiresAt);
  if (candidateBack.potential !== candidate.potential) throw new Error("❌ Le potentiel exact d'un candidat (déjà tiré) devrait survivre à un aller-retour de sauvegarde, jamais recalculé.");
  if (candidateBack.createdAt !== candidate.createdAt || candidateBack.expiresAt !== candidate.expiresAt) throw new Error("❌ createdAt/expiresAt d'un candidat devraient survivre à un aller-retour de sauvegarde (sinon la fenêtre d'expiration serait faussée au rechargement).");

  if (teamBack.youthPlayers.length !== 1 || teamBack.youthPlayers[0].potential !== 42 || teamBack.youthPlayers[0].salary !== YOUTH_TRAINEE_WEEKLY_SALARY) {
    throw new Error("❌ youthPlayers devrait survivre à un aller-retour de sauvegarde (potentiel exact et salaire de stagiaire compris).");
  }

  console.log("recruiterListings avant/après round-trip :", lg.recruiterListings.length, "/", lgBack.recruiterListings.length);
  if (lgBack.recruiterListings.length !== lg.recruiterListings.length) throw new Error("❌ league.recruiterListings devrait survivre intégralement à un aller-retour de sauvegarde.");
  console.log("✅ recruiter, youthCandidates, youthPlayers, trainingCenterLevel, pendingYouthDecisions et recruiterListings survivent tous à un aller-retour de sauvegarde.");
}
{
  // Compatibilité ascendante : une VIEILLE sauvegarde (d'avant l'académie de
  // jeunes) n'a aucun de ces champs — doit rester chargeable, avec des
  // valeurs par défaut sûres, sans jamais planter.
  const lg = freshLeague();
  const oldStyleSavedTeam = serializeTeam(lg.teams[0]);
  delete oldStyleSavedTeam.recruiter;
  delete oldStyleSavedTeam.youthCandidates;
  delete oldStyleSavedTeam.youthPlayers;
  delete oldStyleSavedTeam.trainingCenterLevel;
  delete oldStyleSavedTeam.pendingYouthDecisions;
  const oldStyleSavedLeague = serializeLeague(lg);
  delete oldStyleSavedLeague.recruiterListings;
  delete oldStyleSavedLeague.lastRecruiterGenerationCheckAt;

  const teamBack = teamFromSave(oldStyleSavedTeam);
  const lgBack = leagueFromSave(oldStyleSavedLeague, teamBack);
  console.log("\nAncienne sauvegarde (sans académie de jeunes) — recruiter :", teamBack.recruiter, "| trainingCenterLevel :", teamBack.trainingCenterLevel, "| youthCandidates :", teamBack.youthCandidates, "| youthPlayers :", teamBack.youthPlayers, "| pendingYouthDecisions :", teamBack.pendingYouthDecisions, "| recruiterListings :", lgBack.recruiterListings);
  if (teamBack.recruiter !== null) throw new Error("❌ Sans recruiter sauvegardé, la valeur par défaut devrait être null.");
  if (teamBack.trainingCenterLevel !== 1) throw new Error("❌ Sans trainingCenterLevel sauvegardé, la valeur par défaut devrait être 1 (palier de départ).");
  if (!Array.isArray(teamBack.youthCandidates) || teamBack.youthCandidates.length !== 0) throw new Error("❌ Sans youthCandidates sauvegardé, la valeur par défaut devrait être un tableau vide.");
  if (!Array.isArray(teamBack.youthPlayers) || teamBack.youthPlayers.length !== 0) throw new Error("❌ Sans youthPlayers sauvegardé, la valeur par défaut devrait être un tableau vide.");
  if (!Array.isArray(teamBack.pendingYouthDecisions) || teamBack.pendingYouthDecisions.length !== 0) throw new Error("❌ Sans pendingYouthDecisions sauvegardé, la valeur par défaut devrait être un tableau vide.");
  if (!Array.isArray(lgBack.recruiterListings) || lgBack.recruiterListings.length !== 0) throw new Error("❌ Sans recruiterListings sauvegardé, la valeur par défaut devrait être un tableau vide.");
  console.log("✅ Une ancienne sauvegarde (d'avant l'académie de jeunes) reste chargeable, avec des valeurs par défaut sûres pour tous les nouveaux champs.");
}

console.log("\n🏁 Tous les tests de l'académie de jeunes sont passés.");
