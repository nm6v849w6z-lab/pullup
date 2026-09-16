// Vérifie le marché des analystes vidéo + la séance vidéo (retour
// utilisateur : "il faudrait pouvoir scouter l'effectif de son adversaire
// [...] en engageant un staff plus ou moins compétent, on peut voir plus ou
// moins de caractéristiques de l'adversaire en faisant une séance vidéo de
// l'adversaire"). Le MARCHÉ lui-même (League.analystListings/
// generateAnalystCandidate/placeAnalystBid/_resolveAnalystListing/
// refreshAnalystMarket/fireTeamVideoAnalyst) est structurellement identique
// au marché des entraîneurs déjà couvert par coach_market_test.js — ce
// fichier ne re-teste donc PAS chaque garde-fou d'enchère en détail (déjà
// prouvé là-bas, même code factorisé via _makeStaffListing), il se concentre
// sur ce qui est SPÉCIFIQUE à ce second rôle de staff : hiring/firing/
// relistage à 70%, et surtout League.runVideoSession (comptages de révélation
// par niveau, cooldown quotidien ancré Paris, union des révélations lors
// d'une remontée en niveau, refus sans analyste).
const E = require("./engine.js");
const {
  generateTeam, generateLeague, serializeTeam, teamFromSave, serializeLeague, leagueFromSave,
  ATTRS, TRAINER_LEVELS, TRAINER_BASE_SALARY,
  COACH_AUCTION_DURATION_MS,
  parisLocalDateParts, addParisCalendarDays, parisEpochForLocalTime, sameParisCalendarDay,
} = E;

function freshLeague(budget = 5000000) {
  const user = generateTeam("User", 1.0);
  user.budget = budget;
  const lg = generateLeague(user, 1);
  lg.teams[0].budget = budget;
  return lg;
}

// Instant de référence pour toutes les séances vidéo ci-dessous : un
// après-midi bien à l'intérieur d'un jour civil à Paris (jamais près de
// minuit/du changement d'heure), pour que "le lendemain" soit sans ambiguïté
// un simple +24h.
const NOON_PARIS_DAY0 = Date.UTC(2026, 8, 16, 12, 0, 0); // 14h à Paris (CEST) le 16/09/2026

function nextParisDayAt(ms) {
  const parts = parisLocalDateParts(ms);
  const tomorrow = addParisCalendarDays(parts, 1);
  return parisEpochForLocalTime(tomorrow.year, tomorrow.month, tomorrow.day, parts.hour, parts.minute, parts.second);
}

// ---------------------------------------------------------------------
// Partie 1 : generateAnalystCandidate — un candidat valide, même forme que
// generateCoachCandidate (voir coach_market_test.js), simplement poussé dans
// analystListings plutôt que coachListings.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const now = Date.now();
  const listing = lg.generateAnalystCandidate(now);
  console.log("\nCandidat analyste généré :", listing.status, "niveau", listing.level, "prix de départ", listing.startPrice);
  if (!listing || listing.status !== "open") throw new Error("❌ generateAnalystCandidate devrait créer une annonce ouverte.");
  if (!TRAINER_LEVELS.includes(listing.level)) throw new Error("❌ Le niveau généré devrait être un niveau de staff valide (1 à 5).");
  if (listing.startPrice !== TRAINER_BASE_SALARY[listing.level]) throw new Error("❌ Le prix de départ devrait être le tarif fixe TRAINER_BASE_SALARY du niveau tiré.");
  if (listing.closesAt - listing.createdAt !== COACH_AUCTION_DURATION_MS) throw new Error("❌ La durée de l'enchère devrait être exactement COACH_AUCTION_DURATION_MS (même rythme que le marché des entraîneurs).");
  if (!lg.analystListings.includes(listing)) throw new Error("❌ Le candidat généré devrait être poussé dans league.analystListings (pas coachListings).");
  if (lg.coachListings.some(l => l.id === listing.id)) throw new Error("❌ Le candidat analyste ne devrait JAMAIS apparaître dans coachListings — deux marchés bien séparés.");
  console.log("✅ Un candidat analyste valide est généré, à la bonne durée, dans la bonne liste.");
}

// ---------------------------------------------------------------------
// Partie 2 : placeAnalystBid + résolution -> Team.hireVideoAnalyst.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const now = Date.now();
  const listing = lg.generateAnalystCandidate(now);
  const bid = lg.placeAnalystBid(listing.id, 0, listing.startPrice, now + 10);
  if (!bid.ok) throw new Error("❌ Une enchère au prix de départ exact devrait être acceptée.");
  lg._resolveAnalystListing(listing, now + 20);
  console.log("\nAnalyste embauché après résolution :", lg.teams[0].videoAnalyst);
  if (!lg.teams[0].videoAnalyst || lg.teams[0].videoAnalyst.level !== listing.level) {
    throw new Error("❌ Gagner l'enchère devrait embaucher l'analyste (Team.videoAnalyst) au bon niveau.");
  }
  if (lg.teams[0].videoAnalyst.baseSalary !== listing.startPrice) {
    throw new Error("❌ La mise gagnante devrait devenir le baseSalary (salaire de départ), pas un débit ponctuel en plus.");
  }
  if (lg.teams[0].trainer) throw new Error("❌ Embaucher un analyste ne devrait JAMAIS toucher à Team.trainer (rôles indépendants).");
  console.log("✅ placeAnalystBid/_resolveAnalystListing embauchent bien l'analyste, sans toucher à l'entraîneur.");
}

// ---------------------------------------------------------------------
// Partie 3 : fireTeamVideoAnalyst — congédiement + relistage à -30% du
// salaire déjà escaladé, même mécanique que fireTeamTrainer.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  const now = Date.now();
  lg.teams[0].hireVideoAnalyst(3, 5000); // baseSalary volontairement différent du tarif fixe
  lg.teams[0].videoAnalyst.weeksEmployed = 6; // fait grimper le salaire réel au-dessus du baseSalary
  const salaryBeforeFiring = lg.teams[0].videoAnalystSalary();
  const listingsBefore = lg.analystListings.length;

  const result = lg.fireTeamVideoAnalyst(0, now);
  console.log(`\nCongédiement analyste (salaire escaladé avant congédiement : ${salaryBeforeFiring}) — résultat :`, result);
  if (!result.ok || !result.relisted) throw new Error("❌ Congédier un analyste EN POSTE devrait réussir et le relister (ok:true, relisted:true).");
  if (lg.teams[0].videoAnalyst) throw new Error("❌ L'équipe ne devrait plus avoir d'analyste après fireTeamVideoAnalyst.");
  if (lg.teams[0].videoAnalystSalary() !== 0) throw new Error("❌ videoAnalystSalary() devrait retomber à 0 une fois l'analyste congédié.");

  if (lg.analystListings.length !== listingsBefore + 1) throw new Error("❌ fireTeamVideoAnalyst devrait pousser EXACTEMENT une nouvelle annonce dans analystListings.");
  const relisted = lg.analystListings[lg.analystListings.length - 1];
  const expectedStartPrice = Math.max(1, Math.round(salaryBeforeFiring * 0.7));
  console.log(`Nouvelle annonce — niveau ${relisted.level} (attendu 3), prix de départ ${relisted.startPrice} (attendu ${expectedStartPrice})`);
  if (relisted.level !== 3) throw new Error("❌ Le niveau de la nouvelle annonce devrait être celui de l'analyste congédié (3).");
  if (relisted.startPrice !== expectedStartPrice) {
    throw new Error(`❌ Le prix de départ devrait être 70% du salaire ESCALADÉ juste avant congédiement (${expectedStartPrice}), obtenu ${relisted.startPrice}.`);
  }
  console.log("✅ Congédier un analyste le reliste à -30% de son salaire déjà escaladé, même niveau, même forme d'annonce.");
}
{
  // Pas d'analyste en poste : no-op propre (même comportement que
  // fireTeamTrainer sans entraîneur).
  const lg = freshLeague();
  const now = Date.now();
  const listingsBefore = lg.analystListings.length;
  const result = lg.fireTeamVideoAnalyst(0, now);
  console.log("\nCongédiement sans analyste en poste — résultat :", result);
  if (!result.ok || result.relisted) throw new Error("❌ Sans analyste en poste, fireTeamVideoAnalyst devrait renvoyer { ok: true, relisted: false }.");
  if (lg.analystListings.length !== listingsBefore) throw new Error("❌ Sans analyste en poste, aucune nouvelle annonce ne devrait être créée.");
  console.log("✅ Congédier alors qu'aucun analyste n'est en poste est un no-op propre, sans annonce fantôme.");
}

// ---------------------------------------------------------------------
// Partie 4 : runVideoSession — refus sans analyste sous contrat.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  if (lg.teams[0].videoAnalyst) throw new Error("❌ (setup) une équipe fraîchement générée ne devrait pas avoir d'analyste.");
  const res = lg.runVideoSession(0, 1, NOON_PARIS_DAY0);
  console.log("\nSéance vidéo sans analyste — résultat :", res);
  if (res.ok !== false || res.reason !== "no-analyst") throw new Error("❌ Sans analyste sous contrat, runVideoSession devrait refuser avec reason 'no-analyst'.");
  console.log("✅ runVideoSession refuse sans analyste sous contrat.");
}

// ---------------------------------------------------------------------
// Partie 5 : runVideoSession — adversaire invalide (soi-même, ou index hors
// bornes).
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  lg.teams[0].hireVideoAnalyst(3);
  const self = lg.runVideoSession(0, 0, NOON_PARIS_DAY0);
  console.log("\nSéance vidéo sur soi-même — résultat :", self);
  if (self.ok !== false || self.reason !== "invalid-opponent") throw new Error("❌ Scouter sa propre équipe devrait être refusé avec reason 'invalid-opponent'.");

  const outOfBounds = lg.runVideoSession(0, 999, NOON_PARIS_DAY0);
  console.log("Séance vidéo sur un index hors bornes — résultat :", outOfBounds);
  if (outOfBounds.ok !== false || outOfBounds.reason !== "invalid-opponent") throw new Error("❌ Un opponentIdx hors bornes devrait être refusé avec reason 'invalid-opponent'.");
  console.log("✅ runVideoSession refuse un adversaire invalide (soi-même ou index hors bornes).");
}

// ---------------------------------------------------------------------
// Partie 6 : runVideoSession — comptages de révélation par niveau. Barème
// resserré une 2e fois (retour utilisateur, 2026-09, 2e patch d'équilibrage :
// "ça me semble trop, je dirai analyste video 1 etoile, c'est une carac, 5
// étoiles c'est 5 caracs") — ANALYST_REVEAL_COUNT_BY_LEVEL = {1:1, 2:2, 3:3,
// 4:4, 5:5}, mapping 1:1 niveau -> nombre de caractéristiques : JAMAIS 10,
// même au niveau maximum (au moins 5 caractéristiques restent TOUJOURS
// cachées). Chaque test sur une équipe fraîche (aucun cumul d'une séance
// précédente) pour isoler le comptage.
// ---------------------------------------------------------------------
{
  const expected = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
  TRAINER_LEVELS.forEach(level => {
    const lg = freshLeague();
    lg.teams[0].hireVideoAnalyst(level);
    const res = lg.runVideoSession(0, 1, NOON_PARIS_DAY0);
    console.log(`\nNiveau ${level} — révélées : ${res.revealed.length} (attendu ${expected[level]})`, res.revealed);
    if (!res.ok) throw new Error(`❌ La séance vidéo devrait réussir au niveau ${level}.`);
    if (res.revealed.length !== expected[level]) {
      throw new Error(`❌ Niveau ${level} devrait révéler ${expected[level]} caractéristiques, obtenu ${res.revealed.length}.`);
    }
    if (res.revealed.length >= ATTRS.length) {
      throw new Error(`❌ Niveau ${level} ne devrait JAMAIS révéler la totalité des ${ATTRS.length} caractéristiques (obtenu ${res.revealed.length}).`);
    }
    if (res.analystLevel !== level) throw new Error("❌ analystLevel renvoyé devrait être celui de l'analyste en poste.");
    if (new Set(res.revealed).size !== res.revealed.length) throw new Error("❌ Aucune caractéristique révélée en double.");
    if (res.revealed.some(a => !ATTRS.includes(a))) throw new Error("❌ Toutes les caractéristiques révélées devraient venir de ATTRS.");
    if (JSON.stringify(lg.teams[0].scoutedAttrs["1"]) !== JSON.stringify(res.revealed)) {
      throw new Error("❌ Team.scoutedAttrs[opponentIdx] devrait être mis à jour avec exactement les caractéristiques révélées.");
    }
  });
  console.log("✅ Le nombre de caractéristiques révélées suit ANALYST_REVEAL_COUNT_BY_LEVEL (1/2/3/4/5) à chaque niveau — jamais 10/10, même au niveau 5.");
}

// ---------------------------------------------------------------------
// Partie 7 : runVideoSession — un même adversaire ne peut être scouté
// qu'UNE SEULE FOIS PAR SAISON (retour utilisateur, 2026-09, patch
// d'équilibrage : "un même adversaire ne doit pouvoir être scouté qu'une
// fois par saison parce que sinon en PO chacun connaît les caracs de
// l'autre et c'est pas le but") — PERMANENT, pas basé sur le temps écoulé :
// une 2e séance contre le MÊME adversaire est refusée ("already-scouted")
// même plusieurs jours plus tard, et même si l'analyste est entre-temps
// monté en niveau (pas de "débloquer plus" en rescoutant). Le cooldown
// quotidien (voir Partie 8 ci-dessous), lui, reste un simple limiteur de
// RYTHME pour un NOUVEL adversaire — les deux mécanismes sont désormais
// bien distincts (reasons différentes).
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  lg.teams[0].hireVideoAnalyst(1);
  const first = lg.runVideoSession(0, 1, NOON_PARIS_DAY0);
  if (!first.ok) throw new Error("❌ (setup) la première séance sur cet adversaire devrait réussir.");

  // Même jour : refusé, mais par "already-scouted" (pas "cooldown" — même si
  // les deux seraient vrais ici, "already-scouted" est la raison qui compte,
  // permanente, alors que le cooldown seul aurait pu lever le lendemain).
  const sameDay = lg.runVideoSession(0, 1, NOON_PARIS_DAY0 + 60 * 1000);
  console.log("\n2e séance le même jour sur le MÊME adversaire — résultat :", sameDay);
  if (sameDay.ok !== false || sameDay.reason !== "already-scouted") {
    throw new Error("❌ Une 2e séance sur un adversaire déjà scouté devrait être refusée avec reason 'already-scouted'.");
  }

  // Plusieurs jours plus tard : TOUJOURS refusé — ce n'est PAS un cooldown
  // temporaire, c'est permanent pour la saison. Améliorer l'analyste
  // entre-temps ne change rien non plus.
  lg.teams[0].hireVideoAnalyst(5); // meilleur analyste, ne débloque rien de plus ici
  const muchLater = lg.runVideoSession(0, 1, NOON_PARIS_DAY0 + 10 * 24 * 60 * 60 * 1000);
  console.log("2e séance 10 jours plus tard, analyste amélioré (niveau 5) — résultat :", muchLater);
  if (muchLater.ok !== false || muchLater.reason !== "already-scouted") {
    throw new Error("❌ Un adversaire déjà scouté devrait rester définitivement refusé ('already-scouted'), même bien plus tard et même avec un meilleur analyste.");
  }
  if (lg.teams[0].scoutedAttrs["1"].length !== 1) {
    throw new Error("❌ scoutedAttrs pour cet adversaire ne devrait JAMAIS grandir après la toute première séance (plus d'union) — resté à 1 (niveau 1 de la 1re séance).");
  }
  console.log("✅ Un adversaire déjà scouté reste refusé pour le reste de la saison, quel que soit le temps écoulé ou le niveau de l'analyste — jamais de 'plus de caractéristiques' en rescoutant.");
}

// ---------------------------------------------------------------------
// Partie 8 : runVideoSession — le limiteur de RYTHME quotidien (un NOUVEL
// adversaire scouté par jour civil à Paris maximum) reste inchangé pour un
// adversaire DIFFÉRENT de celui déjà scouté — c'est bien "cooldown" ici,
// pas "already-scouted" (cet autre adversaire n'a, lui, encore jamais été
// scouté). Une séance le lendemain sur ce même autre adversaire réussit.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  lg.teams[0].hireVideoAnalyst(2);
  const first = lg.runVideoSession(0, 1, NOON_PARIS_DAY0);
  if (!first.ok) throw new Error("❌ (setup) la première séance de la journée devrait réussir.");

  // Même jour, sur un AUTRE adversaire (jamais scouté) : refusé par
  // 'cooldown' (limiteur de rythme), pas 'already-scouted'.
  const laterSameDay = lg.runVideoSession(0, 2, NOON_PARIS_DAY0 + 3 * 60 * 60 * 1000);
  console.log("\n2e séance le même jour sur un AUTRE adversaire (jamais scouté) — résultat :", laterSameDay);
  if (laterSameDay.ok !== false || laterSameDay.reason !== "cooldown") {
    throw new Error("❌ Une 2e séance le même jour civil sur un adversaire DIFFÉRENT (pas encore scouté) devrait être refusée avec reason 'cooldown', pas 'already-scouted'.");
  }

  // Le lendemain (jour civil suivant à Paris), toujours sur ce même AUTRE
  // adversaire : de nouveau autorisé (il n'a toujours pas été scouté).
  const tomorrow = nextParisDayAt(NOON_PARIS_DAY0);
  if (sameParisCalendarDay(NOON_PARIS_DAY0, tomorrow)) throw new Error("❌ (setup) 'tomorrow' devrait être un jour civil différent de NOON_PARIS_DAY0.");
  const nextDaySession = lg.runVideoSession(0, 2, tomorrow);
  console.log("Séance le lendemain sur ce même autre adversaire — résultat :", nextDaySession.ok, nextDaySession.revealed);
  if (!nextDaySession.ok) throw new Error("❌ Une séance le jour civil SUIVANT, sur un adversaire pas encore scouté, devrait être acceptée (cooldown remis à zéro).");
  console.log("✅ Le limiteur de rythme quotidien (un nouvel adversaire par jour civil) fonctionne toujours correctement pour un adversaire différent de celui déjà scouté.");
}

// ---------------------------------------------------------------------
// Partie 9 : le scoutisme (name/position/height/salary) reste TOUJOURS
// accessible côté données, indépendamment de scoutedAttrs — ce n'est pas le
// moteur qui masque ces champs (ils vivent sur Player, jamais retirés),
// seule la couche UI choisit de ne PAS les gater. On vérifie ici juste que
// les caractéristiques NON révélées restent absentes de scoutedAttrs (donc
// détectables comme "cachées" côté UI) tant qu'aucune séance n'a eu lieu.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  console.log("\nAucun analyste, aucune séance : scoutedAttrs pour l'adversaire 1 :", lg.teams[0].scoutedAttrs["1"]);
  if (lg.teams[0].scoutedAttrs["1"] !== undefined) throw new Error("❌ Sans séance vidéo, aucune caractéristique ne devrait être marquée révélée pour un adversaire.");
  console.log("✅ Sans analyste/séance, aucune caractéristique adverse n'est révélée (baseline : nom/poste/taille/salaire restent gérés séparément côté UI, jamais par ce champ).");
}

// ---------------------------------------------------------------------
// Partie 10 : persistance — videoAnalyst/scoutedAttrs/lastVideoSessionAt et
// analystListings survivent à un aller-retour sérialisation/désérialisation.
// ---------------------------------------------------------------------
{
  const lg = freshLeague();
  lg.refreshAnalystMarket(Date.now()); // peuple lg.analystListings
  lg.teams[0].hireVideoAnalyst(4, 9999); // baseSalary volontairement != TRAINER_BASE_SALARY[4]
  lg.runVideoSession(0, 1, NOON_PARIS_DAY0);

  const savedTeam = serializeTeam(lg.teams[0]);
  const savedLeague = serializeLeague(lg);
  const teamBack = teamFromSave(savedTeam);
  const lgBack = leagueFromSave(savedLeague, teamBack);

  console.log("\nanalystListings avant :", lg.analystListings.length, "| après round-trip :", lgBack.analystListings.length);
  if (lgBack.analystListings.length !== lg.analystListings.length) throw new Error("❌ league.analystListings devrait survivre intégralement à un aller-retour de sauvegarde.");

  console.log("videoAnalyst.baseSalary avant :", lg.teams[0].videoAnalyst.baseSalary, "| après round-trip :", teamBack.videoAnalyst.baseSalary);
  if (teamBack.videoAnalyst.baseSalary !== 9999) throw new Error("❌ videoAnalyst.baseSalary (9999) devrait survivre à un aller-retour de sauvegarde.");

  console.log("scoutedAttrs avant :", lg.teams[0].scoutedAttrs, "| après round-trip :", teamBack.scoutedAttrs);
  if (JSON.stringify(teamBack.scoutedAttrs) !== JSON.stringify(lg.teams[0].scoutedAttrs)) {
    throw new Error("❌ scoutedAttrs devrait survivre intégralement (mêmes clés, mêmes caractéristiques révélées) à un aller-retour de sauvegarde.");
  }
  if (teamBack.lastVideoSessionAt !== lg.teams[0].lastVideoSessionAt) {
    throw new Error("❌ lastVideoSessionAt devrait survivre à un aller-retour de sauvegarde (sinon le cooldown se réinitialiserait à chaque rechargement).");
  }
  console.log("✅ analystListings, videoAnalyst.baseSalary, scoutedAttrs et lastVideoSessionAt survivent tous à un aller-retour de sauvegarde.");
}
{
  // Compatibilité ascendante : une VIEILLE sauvegarde (d'avant cette
  // fonctionnalité) n'a ni videoAnalyst, ni scoutedAttrs, ni
  // lastVideoSessionAt, ni analystListings — doit rester chargeable, sans
  // planter, avec des défauts propres (aucun analyste, aucun adversaire
  // scouté).
  const lg = freshLeague();
  const oldStyleSavedTeam = serializeTeam(lg.teams[0]);
  delete oldStyleSavedTeam.videoAnalyst;
  delete oldStyleSavedTeam.scoutedAttrs;
  delete oldStyleSavedTeam.lastVideoSessionAt;
  const oldStyleSavedLeague = serializeLeague(lg);
  delete oldStyleSavedLeague.analystListings;
  delete oldStyleSavedLeague.lastAnalystGenerationCheckAt;

  const teamBack = teamFromSave(oldStyleSavedTeam);
  const lgBack = leagueFromSave(oldStyleSavedLeague, teamBack);
  console.log("\nAncienne sauvegarde (sans marché des analystes) — videoAnalyst :", teamBack.videoAnalyst, "| scoutedAttrs :", teamBack.scoutedAttrs, "| analystListings :", lgBack.analystListings);
  if (teamBack.videoAnalyst !== null) throw new Error("❌ Sans videoAnalyst sauvegardé, le repli devrait être null (aucun analyste).");
  if (typeof teamBack.scoutedAttrs !== "object" || Object.keys(teamBack.scoutedAttrs).length !== 0) throw new Error("❌ Sans scoutedAttrs sauvegardé, le repli devrait être {} (aucun adversaire scouté).");
  if (teamBack.lastVideoSessionAt !== null) throw new Error("❌ Sans lastVideoSessionAt sauvegardé, le repli devrait être null (aucune séance encore utilisée).");
  if (!Array.isArray(lgBack.analystListings) || lgBack.analystListings.length !== 0) throw new Error("❌ analystListings absent d'une ancienne sauvegarde devrait redevenir un tableau vide, pas planter.");
  console.log("✅ Une ancienne sauvegarde (sans marché des analystes vidéo) reste chargeable, avec des défauts propres.");
}

console.log("\n🏁 Tous les tests du marché des analystes vidéo / de la séance vidéo sont passés.");
