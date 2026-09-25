// Vérifie le fil d'actualité du tableau de bord (refonte "Soir de match",
// 2026-09-24, voir DEV_NOTES.md point 10) : la logique pure de newsFeed.js
// (portée dans engine.js, voir le grand commentaire au-dessus de
// FEED_CATEGORIES) — créer/sérialiser un fil, pousser un événement par type,
// dédoublonnage par clé, seuils hebdomadaires (checkThresholds), ET les VRAIS
// points de branchement dans le moteur (staff_hired sur résolution d'enchère,
// transfer_in/out sur le marché des transferts, interview/interview_done,
// injury/injury_healed, checkThresholds appelé chaque semaine par
// Team.trainWeek). Réécrit dans le style du projet (assertions manuelles,
// pas node --test) plutôt que de copier tel quel newsFeed.test.mjs/
// dashboard.test.mjs du prestataire — voir tableau-de-bord/*.test.mjs pour
// les scénarios d'origine dont ce fichier s'inspire.
const E = require("./engine.js");
const {
  generateTeam, generateLeague, serializeTeam, teamFromSave,
  createFeed, serializeFeed, pushEntry, removeByKey, markAllRead, unreadCount,
  getVisibleEntries, handleGameEvent, checkThresholds, seedSeasonStart,
  COACH_AUCTION_DURATION_MS,
  MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS,
} = E;

function withMockedRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = orig; }
}

function freshLeague(budget = 5000000) {
  const user = generateTeam("User", 1.0);
  user.budget = budget;
  const lg = generateLeague(user, 1);
  lg.teams[0].budget = budget;
  return lg;
}

// ---------------------------------------------------------------------
// Partie A — logique pure du fil (createFeed/pushEntry/handleGameEvent/
// checkThresholds), indépendante du reste du moteur.
// ---------------------------------------------------------------------

{
  const feed = createFeed();
  const ctx = { clubName: "Lyon", rng: () => 0 };
  const e = handleGameEvent(feed, {
    type: "match_played", week: 1, matchId: "m1", opponent: "Rennes", home: true,
    pointsFor: 84, pointsAgainst: 79, topScorer: { name: "Martin", points: 22 },
  }, ctx);
  console.log("\nmatch_played (victoire) :", e.title, "|", e.text);
  if (e.title !== "Victoire face à Rennes") throw new Error("❌ Titre de victoire inattendu : " + e.title);
  if (!/84-79 à domicile/.test(e.text)) throw new Error("❌ Le texte devrait mentionner le score et 'à domicile'.");
  if (/\{/.test(e.text) || /\{/.test(e.title)) throw new Error("❌ Un gabarit non résolu (variable '{...}' restante) a fuité dans le texte.");
  console.log("✅ match_played (victoire à domicile) rempli correctement, aucune variable de gabarit non résolue.");
}
{
  const feed = createFeed();
  const ctx = { clubName: "Lyon", rng: () => 0 };
  const e = handleGameEvent(feed, {
    type: "match_played", week: 2, matchId: "m2", opponent: "Rennes", home: false,
    pointsFor: 60, pointsAgainst: 70, topScorer: null,
  }, ctx);
  console.log("match_played (défaite, sans MVP) :", e.title, "|", e.text);
  if (e.title !== "Défaite contre Rennes") throw new Error("❌ Titre de défaite inattendu : " + e.title);
  if (!/Personne/.test(e.text)) throw new Error("❌ Sans topScorer, le texte devrait retomber sur 'Personne'.");
  console.log("✅ match_played (défaite, sans meilleur marqueur) géré sans planter.");
}
{
  // league_round : un seul récap par semaine, même appelé plusieurs fois
  // (retour utilisateur implicite du prestataire, voir INTEGRATION.md).
  const feed = createFeed();
  const ctx = { clubName: "Lyon" };
  handleGameEvent(feed, { type: "league_round", week: 3, round: 3, results: [{ home: "Lyon", away: "Rennes", homePts: 80, awayPts: 70 }] }, ctx);
  handleGameEvent(feed, { type: "league_round", week: 3, round: 3, results: [{ home: "Lyon", away: "Rennes", homePts: 80, awayPts: 70 }] }, ctx);
  const rounds = feed.entries.filter(e => e.key === "league_round_3");
  console.log("Entrées league_round après 2 appels :", rounds.length, "(attendu 1)");
  if (rounds.length !== 1) throw new Error("❌ league_round devrait être dédoublonné par semaine (clé league_round_<semaine>).");
  console.log("✅ league_round dédoublonné par semaine.");
}
{
  // injury / injury_healed : la guérison retire l'entrée blessure (clé
  // injury_<playerId>).
  const feed = createFeed();
  const ctx = { clubName: "Lyon" };
  handleGameEvent(feed, { type: "injury", week: 1, playerId: "p1", playerName: "Dupont", weeks: 3 }, ctx);
  if (!feed.entries.some(e => e.key === "injury_p1")) throw new Error("❌ injury devrait créer une entrée clé injury_<id>.");
  if (feed.entries.find(e => e.key === "injury_p1").priority !== "alert") throw new Error("❌ Une blessure de 3 semaines ou plus devrait être une alerte.");
  handleGameEvent(feed, { type: "injury_healed", week: 4, playerId: "p1", playerName: "Dupont" }, ctx);
  if (feed.entries.some(e => e.key === "injury_p1")) throw new Error("❌ injury_healed devrait retirer l'entrée injury_<id>.");
  if (!feed.entries.some(e => e.title === "Dupont de retour")) throw new Error("❌ injury_healed devrait annoncer le retour du joueur.");
  console.log("✅ injury (alerte si ≥3 semaines) puis injury_healed (retire l'alerte, annonce le retour).");
}
{
  // interview : NE crée PLUS d'entrée de fil (retour utilisateur,
  // 2026-09-25, "fil d'actualité et cette semaine, ça ne fait pas un peu
  // doublon ?", voir DEV_NOTES.md point 14) — la même interview en attente
  // est déjà affichée dans la tâche "Cette semaine" du tableau de bord
  // (dashBuildTasks), plus besoin de la dupliquer dans le fil.
  const feed = createFeed();
  const ctx = { clubName: "Lyon" };
  handleGameEvent(feed, { type: "interview", week: 1, interviewId: "i1", subject: "Bilan", daysLeft: 3, title: "Interview de mi-saison" }, ctx);
  if (feed.entries.some(e => e.key === "interview_i1")) throw new Error("❌ interview ne devrait plus créer d'entrée dans le fil (doublon avec la tâche \"Cette semaine\").");
  // interview_done reste un nettoyage INCONDITIONNEL (removeByKey) : une
  // sauvegarde déjà passée par l'ancien comportement (entrée poussée avant
  // ce correctif) ne doit pas rester coincée indéfiniment dans le fil.
  feed.entries.push({ id: "evt_migration", key: "interview_i1", category: "presse", priority: "alert", read: false, title: "Ancienne entrée", text: "", action: null });
  handleGameEvent(feed, { type: "interview_done", interviewId: "i1" }, ctx);
  if (feed.entries.some(e => e.key === "interview_i1")) throw new Error("❌ interview_done devrait nettoyer toute entrée interview_<id> déjà présente (migration depuis une sauvegarde antérieure à ce correctif).");
  console.log("✅ interview ne duplique plus la tâche \"Cette semaine\" dans le fil ; interview_done nettoie toujours une éventuelle entrée héritée.");
}
{
  // staff_hired : pas de clé (plusieurs recrutements dans la saison restent
  // tous visibles), texte sans variable non résolue.
  const feed = createFeed();
  const e = handleGameEvent(feed, { type: "staff_hired", week: 2, name: "Niveau 3", role: "Entraîneur" }, { clubName: "Lyon", rng: () => 0 });
  console.log("staff_hired :", e.title, "|", e.text);
  if (!/Entraîneur/.test(e.title) && !/Entraîneur/.test(e.text)) throw new Error("❌ Le rôle devrait apparaître dans le titre ou le texte.");
  console.log("✅ staff_hired rempli correctement.");
}
{
  // transfer_in / transfer_out : montants en euros formatés, pas de
  // variable non résolue.
  const feed = createFeed();
  const ctx = { clubName: "Lyon", rng: () => 0 };
  const eIn = handleGameEvent(feed, { type: "transfer_in", week: 1, playerId: "p9", playerName: "Nouveau", from: "Rennes", fee: 50000 }, ctx);
  const eOut = handleGameEvent(feed, { type: "transfer_out", week: 1, playerName: "Parti", to: "Rennes", fee: 30000 }, ctx);
  console.log("transfer_in :", eIn.title, "|", eIn.text);
  console.log("transfer_out :", eOut.title, "|", eOut.text);
  // toLocaleString("fr-FR") sépare les milliers par une espace fine
  // insécable (U+202F), pas une espace normale — on tolère tout espace.
  if (!/50[\s  ]000/.test(eIn.text)) throw new Error("❌ Le montant du transfert entrant devrait être formaté en euros.");
  if (!/30[\s  ]000/.test(eOut.text)) throw new Error("❌ Le montant du transfert sortant devrait être formaté en euros.");
  console.log("✅ transfer_in/transfer_out remplis correctement.");
}
{
  // checkThresholds : alert_staff/alert_budget NE créent PLUS d'entrée
  // (même correctif que "interview" ci-dessus, doublon avec les tâches
  // "Staff : N/3 postes pourvus" / "Budget dans le rouge" de "Cette
  // semaine") — seule l'alerte d'humeur (mood_*, PAS affichée dans "Cette
  // semaine") reste propre au fil, toujours sans spam semaine après
  // semaine.
  const feed = createFeed();
  const state = { week: 1, budget: 100000, supporters: 20, chemistry: 50, staff: { coach: false, analyst: false, scout: false } };
  checkThresholds(feed, state);
  if (feed.entries.some(e => e.key === "alert_staff")) throw new Error("❌ Staff vide ne devrait plus créer d'alerte dans le fil (doublon avec la tâche \"Cette semaine\").");
  if (!feed.entries.some(e => e.key === "mood_supporters")) throw new Error("❌ Supporters < 30 devrait déclencher une alerte d'humeur.");
  if (feed.entries.some(e => e.key === "alert_budget")) throw new Error("❌ Budget positif ne devrait déclencher aucune alerte.");
  checkThresholds(feed, { ...state, week: 6, staff: { coach: true, analyst: true, scout: true }, supporters: 50 });
  if (feed.entries.some(e => e.key === "mood_supporters")) throw new Error("❌ L'alerte d'humeur devrait disparaître une fois l'humeur revenue en zone normale.");
  console.log("✅ checkThresholds : alert_staff/alert_budget ne dupliquent plus \"Cette semaine\" dans le fil ; l'alerte d'humeur (propre au fil) continue d'apparaître/disparaître normalement.");
}
{
  // Migration : une entrée alert_staff/alert_budget déjà poussée AVANT ce
  // correctif (sauvegarde existante) doit être nettoyée au prochain passage
  // de checkThresholds, plutôt que de rester coincée indéfiniment.
  const feed = createFeed();
  feed.entries.push({ id: "evt_m1", key: "alert_staff", category: "club", priority: "alert", read: false, title: "Ancienne alerte staff", text: "", action: null });
  feed.entries.push({ id: "evt_m2", key: "alert_budget", category: "club", priority: "alert", read: false, title: "Ancienne alerte budget", text: "", action: null });
  checkThresholds(feed, { week: 1, budget: 100000, supporters: 50, chemistry: 50, staff: { coach: true, analyst: true, scout: true } });
  if (feed.entries.some(e => e.key === "alert_staff" || e.key === "alert_budget")) throw new Error("❌ checkThresholds devrait nettoyer toute entrée alert_staff/alert_budget héritée d'avant ce correctif.");
  console.log("✅ checkThresholds nettoie les entrées alert_staff/alert_budget héritées d'une sauvegarde antérieure à ce correctif.");
}
{
  // Sérialisation : round-trip JSON complet (comme une vraie sauvegarde).
  const feed = createFeed();
  pushEntry(feed, { category: "club", week: 1, title: "a", text: "b" });
  markAllRead(feed);
  const restored = createFeed(JSON.parse(JSON.stringify(serializeFeed(feed))));
  if (unreadCount(restored) !== 0) throw new Error("❌ Le statut lu devrait survivre à un aller-retour JSON.");
  if (restored.nextId !== feed.nextId) throw new Error("❌ Le compteur d'id devrait survivre à un aller-retour JSON.");
  // createFeed(undefined) : sauvegarde d'avant cette fonctionnalité.
  const blank = createFeed(undefined);
  if (blank.entries.length !== 0 || blank.nextId !== 1) throw new Error("❌ createFeed(undefined) devrait renvoyer un fil vide (sauvegarde antérieure).");
  console.log("✅ Sérialisation round-trip + repli sur un fil vide pour une sauvegarde antérieure à cette fonctionnalité.");
}

// ---------------------------------------------------------------------
// Partie B — branchements RÉELS dans le moteur : Team.feed existe, survit à
// serializeTeam/teamFromSave, et les VRAIS points d'émission (résolution
// d'enchère staff, marché des transferts, interviews, checkThresholds
// hebdomadaire) poussent bien dans team.feed.
// ---------------------------------------------------------------------

{
  const lg = freshLeague();
  const user = lg.teams[0];
  if (!user.feed || !Array.isArray(user.feed.entries)) throw new Error("❌ Team.feed devrait exister dès la construction (createFeed()).");
  const saved = serializeTeam(user);
  if (!saved.feed || !Array.isArray(saved.feed.entries)) throw new Error("❌ serializeTeam devrait inclure feed.");
  // Note : generateLeague a déjà pu pousser une entrée "interview de début
  // de saison" dans le fil de l'équipe humaine (queueSeasonPreviewInterview,
  // voir engine.js) — on ne suppose donc pas un fil vide au départ, on
  // vérifie juste que NOTRE entrée survit bien au round-trip.
  const before = user.feed.entries.length;
  pushEntry(user.feed, { category: "club", week: 1, title: "x", text: "y" });
  const saved2 = serializeTeam(user);
  const restored = teamFromSave(JSON.parse(JSON.stringify(saved2)));
  if (restored.feed.entries.length !== before + 1 || restored.feed.entries[0].title !== "x") {
    throw new Error("❌ Le fil devrait survivre à serializeTeam/teamFromSave (round-trip complet).");
  }
  console.log("✅ Team.feed existe, survit à serializeTeam/teamFromSave.");
}
{
  // Résolution d'une enchère d'entraîneur gagnée par le club du joueur →
  // staff_hired dans buyer.feed (voir League._resolveCoachListing).
  const lg = freshLeague(5000000);
  const now = Date.now();
  const listing = lg.generateCoachCandidate(now);
  const bidAmount = listing.startPrice + 1000;
  lg.placeCoachBid(listing.id, 0, bidAmount, now + 500);
  withMockedRandom(0.999999, () => {
    lg.refreshCoachMarket(now + COACH_AUCTION_DURATION_MS + 100);
  });
  const entry = lg.teams[0].feed.entries.find(e => e.category === "club" && /Niveau/.test(e.title + e.text));
  console.log("\nstaff_hired après résolution d'enchère entraîneur :", entry && entry.title);
  if (!entry) throw new Error("❌ La résolution d'une enchère d'entraîneur gagnée devrait pousser un événement staff_hired dans le fil de l'acheteur.");
  console.log("✅ staff_hired réellement émis à la résolution d'une enchère d'entraîneur (League._resolveCoachListing).");
}
{
  // Marché des transferts : transfer_in côté acheteur, transfer_out côté
  // vendeur (voir League._resolveListing) — deux clubs HUMAINS pour que les
  // deux fils soient peuplés.
  const buyer = generateTeam("Acheteur", 1.0);
  buyer.budget = 5000000;
  const lg = generateLeague(buyer, 1);
  lg.teams[0].budget = 5000000;
  const seller = lg.teams[1];
  seller.isHuman = true; // deuxième club humain pour ce scénario (multi-manager)
  const player = seller.players[0];
  const now = Date.now();
  const listing = lg.listPlayerForSale(1, player.id, 10000, now);
  lg.placeBid(listing.id, 0, 10000, now + 10);
  withMockedRandom(0.999999, () => {
    lg._resolveListing(listing, now + 999999999);
  });
  const inEntry = lg.teams[0].feed.entries.find(e => e.category === "marche" && new RegExp(player.name).test(e.title + e.text));
  const outEntry = seller.feed.entries.find(e => e.category === "marche" && new RegExp(player.name).test(e.title + e.text));
  console.log("transfer_in (acheteur) :", inEntry && inEntry.title, "| transfer_out (vendeur) :", outEntry && outEntry.title);
  if (!inEntry) throw new Error("❌ L'acheteur humain devrait recevoir un événement transfer_in.");
  if (!outEntry) throw new Error("❌ Le vendeur humain devrait recevoir un événement transfer_out.");
  console.log("✅ transfer_in/transfer_out réellement émis à la résolution d'une enchère du marché des transferts (League._resolveListing).");
}
{
  // Interview : applyMoraleForResult(milestone) pousse "interview",
  // resolveInterview pousse "interview_done" — même entry.id des deux côtés.
  const lg = freshLeague();
  const user = lg.teams[0];
  const now = Date.now();
  user.applyMoraleForResult(true, 10, "Rennes", 0, now, "mi-saison");
  const pending = user.pendingInterviews.find(i => i.milestone === "mi-saison");
  if (!pending) throw new Error("❌ Scénario cassé : aucune interview de jalon créée.");
  // Ne pousse plus d'entrée dans team.feed (retour utilisateur, 2026-09-25,
  // doublon avec la tâche "Cette semaine" — voir DEV_NOTES.md point 14) :
  // seul team.pendingInterviews (déjà affiché par dashBuildTasks côté
  // tableau de bord) fait foi désormais.
  if (user.feed.entries.some(e => e.key === `interview_${pending.id}`)) throw new Error("❌ applyMoraleForResult(milestone) ne devrait plus pousser d'entrée dans team.feed (doublon avec \"Cette semaine\").");
  console.log("\ninterview de jalon en attente (sans doublon dans le fil) :", pending.milestone);
  user.resolveInterview(pending.id, "Mesuré", now + 1000);
  if (user.pendingInterviews.some(i => i.id === pending.id)) throw new Error("❌ resolveInterview devrait retirer l'interview de team.pendingInterviews.");
  if (user.feed.entries.some(e => e.key === `interview_${pending.id}`)) throw new Error("❌ resolveInterview ne devrait laisser aucune entrée interview_<id> dans le fil.");
  console.log("✅ interview de jalon (applyMoraleForResult) : plus de doublon dans le fil ; resolveInterview la retire bien de pendingInterviews.");
}
{
  // queueSeasonPreviewInterview (interview d'avant-saison) : même correctif,
  // ne pousse plus non plus son propre événement "interview" dans le fil.
  const lg = freshLeague();
  const user = lg.teams[0];
  const entry = user.queueSeasonPreviewInterview(Date.now());
  if (user.feed.entries.some(e => e.key === `interview_${entry.id}`)) throw new Error("❌ queueSeasonPreviewInterview ne devrait plus pousser d'entrée dans team.feed (doublon avec \"Cette semaine\").");
  if (!user.pendingInterviews.some(i => i.id === entry.id)) throw new Error("❌ queueSeasonPreviewInterview devrait toujours mettre l'interview en attente dans team.pendingInterviews.");
  console.log("\ninterview d'avant-saison en attente (sans doublon dans le fil) :", entry.id);
  console.log("✅ interview d'avant-saison : plus de doublon dans le fil, toujours bien mise en attente.");
}
{
  // Team.trainWeek : checkThresholds tourne chaque semaine (budget négatif
  // → alerte), ET injury_healed est détecté par diff pour un joueur qui
  // n'est plus courrament blessé.
  const lg = freshLeague();
  const user = lg.teams[0];
  user.budget = -5000;
  // Humeur forcée en zone basse : témoin indépendant que checkThresholds
  // tourne bien chaque semaine via trainWeek, puisque alert_budget ne
  // pousse plus rien dans le fil (voir plus haut, doublon avec "Budget dans
  // le rouge" de "Cette semaine") et ne peut donc plus servir de témoin.
  user.fanMorale = 20;
  const player = user.players[0];
  const now = Date.now();
  player.injured = true;
  player.injuryUntil = now - 1000; // déjà guéri au moment de trainWeek
  pushEntry(user.feed, { key: `injury_${player.id}`, category: "club", week: user.week, title: `${player.name} blessé`, text: "x" });
  user.trainWeek(1, now);
  if (user.feed.entries.some(e => e.key === "alert_budget")) throw new Error("❌ trainWeek ne devrait plus créer d'alerte budget dans le fil (doublon avec la tâche \"Cette semaine\").");
  if (!user.feed.entries.some(e => e.key === "mood_supporters")) throw new Error("❌ trainWeek devrait toujours déclencher checkThresholds (alerte d'humeur en zone basse).");
  if (user.feed.entries.some(e => e.key === `injury_${player.id}`)) throw new Error("❌ trainWeek devrait détecter la guérison et retirer l'entrée injury_<id>.");
  if (!user.feed.entries.some(e => e.title === `${player.name} de retour`)) throw new Error("❌ trainWeek devrait annoncer le retour du joueur guéri.");
  console.log("✅ Team.trainWeek : checkThresholds hebdomadaire + détection de guérison (injury_healed) par diff, tous deux réellement branchés.");
}

console.log("\n✅ Fil d'actualité du tableau de bord (moteur pur + branchements réels) entièrement vérifié.");
