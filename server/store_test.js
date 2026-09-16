// Vérifie la persistance serveur (server/store.js) : un aller-retour sur
// disque (au lieu de localStorage) ne doit rien perdre — en particulier les
// champs qui avaient déjà causé un bug de persistance côté navigateur
// (secondsPlayedByPosition, voir engine.js) et les nouveaux champs de
// calendrier réel (calendarStartAt, lastAutoTrainedWeek).
const fs = require("fs");
const os = require("os");
const path = require("path");
const store = require("./store.js");
const { catchUpLeague } = require("./autoSim.js");
const { scheduledTimeForRound } = require("./calendar.js");

function tmpSavePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-store-test-")), "league.json");
}

const T0 = Date.UTC(2026, 8, 7);

// load/save/loadOrCreate/loadMultiLeague/saveMultiLeague sont désormais
// asynchrones (voir server/store.js, section "BACKEND REDIS") — même en
// mode fichier local (ce test ne définit jamais UPSTASH_REDIS_REST_URL/
// UPSTASH_REDIS_REST_TOKEN, donc emprunte toujours ce chemin historique,
// inchangé). Tout le corps du test est donc enveloppé dans une IIFE async
// (top-level await indisponible en CommonJS) — même convention que les
// tests de bout en bout à la racine du projet (voir persistence_test.js).
(async () => {

// ---------------------------------------------------------------------
// 1) createNewCareer : mêmes réglages de départ que initGame() côté
//    navigateur.
// ---------------------------------------------------------------------
{
  const { team, league } = store.createNewCareer(T0);
  if (team.players.length !== 15) throw new Error(`❌ Une nouvelle carrière devrait démarrer avec 15 joueurs (3/poste), obtenu ${team.players.length}.`);
  if (league.teams.length !== 10) throw new Error(`❌ Une ligue devrait compter 10 équipes, obtenu ${league.teams.length}.`);
  if (league.calendarStartAt !== T0) throw new Error(`❌ calendarStartAt devrait être ${T0} (now explicite passé à createNewCareer), obtenu ${league.calendarStartAt}.`);
  console.log("✅ createNewCareer : mêmes réglages de départ que le prototype navigateur, calendrier réel démarré à l'instant demandé.");
}

// ---------------------------------------------------------------------
// 2) Aller-retour save/load : le fichier existe, et tout revient identique
//    — y compris secondsPlayedByPosition (déjà cassé une fois côté
//    navigateur, voir le commentaire dans engine.js) et le calendrier réel.
// ---------------------------------------------------------------------
{
  const savePath = tmpSavePath();
  const { team, league } = store.createNewCareer(T0);

  // Fait "jouer" un peu de temps de jeu à un joueur, comme après un vrai
  // match — exactement le champ dont l'oubli avait cassé l'entraînement
  // après rechargement (retour utilisateur : "mes joueurs ne progressent
  // pas avec l'entrainement").
  const someone = team.players[0];
  someone.secondsPlayed = 612;
  someone.secondsPlayedByPosition = { [someone.position]: 612 };
  team.budget = 42424;
  league.lastAutoTrainedWeek = 3;

  await store.save(team, league, savePath);
  if (!fs.existsSync(savePath)) throw new Error("❌ Le fichier de sauvegarde devrait exister après store.save().");

  const loaded = await store.load(savePath);
  if (!loaded) throw new Error("❌ store.load() devrait relire la sauvegarde qu'on vient d'écrire.");

  const reloadedPlayer = loaded.team.players.find(p => p.id === someone.id);
  if (!reloadedPlayer) throw new Error("❌ Le joueur sauvegardé devrait être retrouvé après rechargement (même id).");
  if (reloadedPlayer.secondsPlayed !== 612) throw new Error(`❌ secondsPlayed devrait survivre à l'aller-retour disque, obtenu ${reloadedPlayer.secondsPlayed}.`);
  if (reloadedPlayer.secondsPlayedByPosition[someone.position] !== 612) throw new Error("❌ secondsPlayedByPosition devrait survivre à l'aller-retour disque (c'est exactement ce qui avait cassé l'entraînement côté navigateur).");
  if (loaded.team.budget !== 42424) throw new Error(`❌ Le budget devrait survivre à l'aller-retour disque, obtenu ${loaded.team.budget}.`);
  if (loaded.league.calendarStartAt !== T0) throw new Error(`❌ calendarStartAt devrait survivre à l'aller-retour disque, obtenu ${loaded.league.calendarStartAt}.`);
  if (loaded.league.lastAutoTrainedWeek !== 3) throw new Error(`❌ lastAutoTrainedWeek devrait survivre à l'aller-retour disque, obtenu ${loaded.league.lastAutoTrainedWeek}.`);
  console.log("✅ Aller-retour save/load sur disque : rien n'est perdu, y compris secondsPlayedByPosition et le calendrier réel.");
}

// ---------------------------------------------------------------------
// 3) loadOrCreate : crée une nouvelle carrière si le fichier n'existe pas
//    encore, puis la retrouve telle quelle aux appels suivants (ne
//    regénère pas une nouvelle ligue à chaque fois).
// ---------------------------------------------------------------------
{
  const savePath = tmpSavePath();
  if (fs.existsSync(savePath)) throw new Error("❌ Le fichier temporaire ne devrait pas encore exister à ce stade du test.");

  const first = await store.loadOrCreate(savePath, T0);
  if (!fs.existsSync(savePath)) throw new Error("❌ loadOrCreate() devrait avoir écrit le fichier de sauvegarde pour une carrière neuve.");

  const second = await store.loadOrCreate(savePath, T0 + 999999);
  if (second.team.name !== first.team.name) throw new Error("❌ Un second appel à loadOrCreate() devrait retrouver la MÊME carrière (même nom d'équipe), pas en régénérer une nouvelle.");
  if (second.league.calendarStartAt !== first.league.calendarStartAt) throw new Error("❌ Un second appel à loadOrCreate() ne devrait pas réinitialiser le calendrier réel d'une carrière déjà existante.");
  console.log("✅ loadOrCreate() : crée une fois, retrouve ensuite la même carrière sans la régénérer.");
}

// ---------------------------------------------------------------------
// 4) Round-trip après un vrai rattrapage (autoSim) : la ligue simulée puis
//    sauvegardée/rechargée doit rester dans le même état (round, semaine
//    d'entraînement, classement) — le scénario réel serveur : rattraper,
//    sauvegarder, redémarrer le process, recharger.
// ---------------------------------------------------------------------
{
  const savePath = tmpSavePath();
  const { team, league } = store.createNewCareer(T0);
  const secondMatchAt = scheduledTimeForRound(league.calendarStartAt, 1);
  catchUpLeague(league, secondMatchAt);
  await store.save(team, league, savePath);

  const reloaded = await store.load(savePath);
  if (reloaded.league.round !== league.round) throw new Error(`❌ league.round devrait survivre au cycle rattrapage → sauvegarde → rechargement, attendu ${league.round}, obtenu ${reloaded.league.round}.`);
  if (reloaded.team.week !== team.week) throw new Error(`❌ team.week devrait survivre au cycle rattrapage → sauvegarde → rechargement, attendu ${team.week}, obtenu ${reloaded.team.week}.`);
  if (reloaded.league.lastAutoTrainedWeek !== league.lastAutoTrainedWeek) throw new Error("❌ lastAutoTrainedWeek devrait survivre au cycle rattrapage → sauvegarde → rechargement (sinon l'entraînement pourrait se rejouer en double après un redémarrage du serveur).");

  // Un nouveau rattrapage sur l'état RECHARGÉ, à la même heure, ne doit
  // rien rejouer (l'idempotence doit survivre à un redémarrage du process,
  // pas seulement en mémoire).
  const moreEvents = catchUpLeague(reloaded.league, secondMatchAt + 1000);
  if (moreEvents.length !== 0) throw new Error(`❌ Après redémarrage (rechargement disque), un rattrapage sur la même fenêtre ne devrait rien rejouer, obtenu ${moreEvents.length} événement(s).`);
  console.log("✅ L'idempotence du rattrapage survit à un redémarrage du serveur (sauvegarde → rechargement disque).");
}

// ---------------------------------------------------------------------
// 5) createMultiManagerCareer + resolveManagerTeam : la carrière partagée
//    multi-manager (ligue de 10 équipes, plusieurs jetons privés) — voir
//    server/index.js pour son usage réel (résolution du manager appelant à
//    partir de l'en-tête X-TipIn-Token).
// ---------------------------------------------------------------------
{
  const { league } = store.createMultiManagerCareer(["Lyon Multi", "Marseille Multi"], T0);
  if (league.teams.length !== 10) throw new Error(`❌ Une ligue multi-manager devrait aussi compter 10 équipes (complétée par des CPU), obtenu ${league.teams.length}.`);
  const humans = league.teams.filter(t => t.isHuman);
  if (humans.length !== 2) throw new Error(`❌ Exactement 2 équipes humaines attendues, obtenu ${humans.length}.`);
  humans.forEach(t => {
    if (!t.managerLinkToken) throw new Error(`❌ Chaque équipe humaine devrait avoir un managerLinkToken généré (${t.name}).`);
  });
  if (humans[0].managerLinkToken === humans[1].managerLinkToken) throw new Error("❌ Deux managers différents ne devraient jamais partager le même jeton.");

  // Jeton valide : résout la bonne équipe (bon index, bonne référence
  // d'objet — pas une copie).
  const lyonIndex = league.teams.findIndex(t => t.name === "Lyon Multi");
  const resolved = store.resolveManagerTeam(league, league.teams[lyonIndex].managerLinkToken);
  if (!resolved) throw new Error("❌ resolveManagerTeam devrait résoudre un jeton valide.");
  if (resolved.teamIndex !== lyonIndex) throw new Error(`❌ resolveManagerTeam devrait renvoyer le bon index (${lyonIndex}), obtenu ${resolved.teamIndex}.`);
  if (resolved.team !== league.teams[lyonIndex]) throw new Error("❌ resolveManagerTeam devrait renvoyer la MÊME référence d'équipe (pas une copie).");

  // Jeton inconnu (jamais généré) : ne résout rien, ne plante pas.
  if (store.resolveManagerTeam(league, "ce-jeton-n-existe-pas") !== null) throw new Error("❌ Un jeton inconnu ne devrait résoudre aucune équipe.");

  // Jeton manquant/vide/absent : ne résout rien non plus, ne plante pas.
  if (store.resolveManagerTeam(league, null) !== null) throw new Error("❌ Un jeton null ne devrait résoudre aucune équipe.");
  if (store.resolveManagerTeam(league, undefined) !== null) throw new Error("❌ Un jeton undefined ne devrait résoudre aucune équipe.");
  if (store.resolveManagerTeam(league, "") !== null) throw new Error("❌ Un jeton vide ne devrait résoudre aucune équipe.");
  console.log("✅ resolveManagerTeam : résout correctement un jeton valide (bonne équipe, bon index), et renvoie null (sans planter) pour un jeton inconnu, vide ou manquant.");
}

// ---------------------------------------------------------------------
// 6) La ligue multi-manager persiste sur son propre fichier, distinct de la
//    sauvegarde solo — et loadMultiLeague rejette proprement un ancien
//    fichier solo ({team, league}), sans jamais planter ni "migrer" quoi
//    que ce soit à sa place.
// ---------------------------------------------------------------------
{
  const multiSavePath = tmpSavePath();
  const { league } = store.createMultiManagerCareer(["Lyon Multi 2"], T0);
  await store.saveMultiLeague(league, multiSavePath);
  if (!fs.existsSync(multiSavePath)) throw new Error("❌ saveMultiLeague() devrait écrire le fichier sur disque.");

  const reloaded = await store.loadMultiLeague(multiSavePath);
  if (!reloaded) throw new Error("❌ loadMultiLeague() devrait relire la ligue multi-manager qu'on vient d'écrire.");
  if (reloaded.league.teams.length !== 10) throw new Error("❌ La ligue multi-manager rechargée devrait toujours compter 10 équipes.");

  // Un ancien fichier solo ({team, league}) n'est PAS une ligue
  // multi-manager valide : loadMultiLeague doit le rejeter proprement
  // (renvoyer null), jamais planter ni tenter de le "migrer" à sa place.
  const legacySavePath = tmpSavePath();
  const legacyCareer = store.createNewCareer(T0);
  await store.save(legacyCareer.team, legacyCareer.league, legacySavePath);
  const rejected = await store.loadMultiLeague(legacySavePath);
  if (rejected !== null) throw new Error("❌ loadMultiLeague() devrait rejeter (null) un ancien fichier de sauvegarde solo ({team, league}), jamais le migrer/l'accepter tel quel.");
  console.log("✅ La ligue multi-manager persiste sur son propre fichier (distinct de la sauvegarde solo), et un ancien fichier solo est proprement rejeté (jamais migré, jamais de plantage).");
}

console.log("\n✅ Persistance serveur (server/store.js) vérifiée : sauvegarde/chargement sur disque fidèle (solo et multi-manager), y compris pour le calendrier réel, l'idempotence du rattrapage automatique, et la résolution de jeton manager (resolveManagerTeam).");

})().catch(e => { console.error(e); process.exit(1); });
