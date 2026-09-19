// Vérifie le cumul du temps de jeu sur les 3 matchs d'un même jour civil
// (calendrier ancré quotidien) pour l'entraînement (retour utilisateur,
// 2026-09 : "la semaine est en fait une journée avec 3 matchs [...] un
// joueur doit jouer 30 min au poste déterminé sur sa semaine pour prendre
// l'entrainement [...] quand la maj est passée, les compteurs de temps de
// jeu sur la page entrainement doivent être remis à 0 et on doit voir les
// effets du dernier entrainement"). Avant ce correctif,
// Team.trainablySecondsFor lisait Player.secondsPlayedByPosition, remis à
// zéro par resetForMatch() à CHAQUE match (y compris les 2 premiers de la
// journée) : seul le DERNIER match du jour comptait pour l'entraînement, les
// 2 précédents étaient silencieusement perdus, et les compteurs affichés
// restaient ceux du dernier match même après l'entraînement (au lieu de
// repartir à 0). Voir Player.trainingSecondsPlayedByPosition/
// Team.trainablySecondsFor/Team.trainWeek/applyFatigue.
const E = require("./engine.js");
const { generateTeam } = E;

function simulateMatchMinutes(team, player, pos, seconds) {
  // Reproduit ce qu'un vrai match ferait pour CE joueur, sans passer par une
  // simulation complète (MatchEngine.applyFatigue), pour un test ciblé et
  // déterministe : resetForMatch() (comme au coup d'envoi de CHAQUE match),
  // puis l'accumulation des deux compteurs (dernier match + cumul
  // d'entraînement) exactement comme applyFatigue le fait ligne par ligne.
  player.resetForMatch();
  player.matchPosition = pos;
  player.secondsPlayed += seconds;
  player.secondsPlayedByPosition[pos] = (player.secondsPlayedByPosition[pos] || 0) + seconds;
  player.trainingSecondsPlayedByPosition[pos] = (player.trainingSecondsPlayedByPosition[pos] || 0) + seconds;
}

// ---------------------------------------------------------------------
// Partie 1 : le cumul sur 3 matchs doit dépasser ce qu'un seul match
// pouvait apporter avant ce correctif, et retomber au bon total.
// ---------------------------------------------------------------------
{
  const team = generateTeam("Cumul Test", 1.0);
  team.trainingSkill = "inside";
  const pos = "Pivot";
  team.trainingPositions = [pos];
  const p = team.players.find(pl => pl.position === pos) || team.players[0];

  // 3 matchs du jour (10h/15h coupe/19h) : 12 min, 0 min (banc), 10 min.
  simulateMatchMinutes(team, p, pos, 12 * 60);
  simulateMatchMinutes(team, p, pos, 0);
  simulateMatchMinutes(team, p, pos, 10 * 60);

  const { total } = team.trainablySecondsFor(p);
  console.log(`Temps cumulé sur les 3 matchs du jour : ${total / 60} min (attendu 22, PAS 10 = seul le dernier match)`);
  if (total !== 22 * 60) {
    throw new Error(`❌ trainablySecondsFor devrait cumuler les 3 matchs du jour (22 min), pas retomber au seul dernier match (obtenu ${total / 60} min).`);
  }
  console.log("✅ Le temps de jeu se cumule bien sur les 3 matchs du jour, pas seulement le dernier.");

  // resetForMatch() (déclenché au coup d'envoi d'un match) ne doit PAS
  // effacer ce cumul avant que trainWeek ne l'ait consommé.
  const beforeReset = team.trainablySecondsFor(p).total;
  p.resetForMatch();
  const afterReset = team.trainablySecondsFor(p).total;
  console.log(`Cumul avant/après un resetForMatch() isolé (sans nouveau match) : ${beforeReset / 60} min / ${afterReset / 60} min (attendu identiques)`);
  if (afterReset !== beforeReset) {
    throw new Error("❌ resetForMatch() ne devrait jamais effacer le cumul d'entraînement du jour (seul Team.trainWeek le fait, après l'avoir consommé).");
  }
  console.log("✅ resetForMatch() n'efface pas le cumul d'entraînement en cours (seul trainWeek le fait, après coup).");
}

// ---------------------------------------------------------------------
// Partie 2 : après trainWeek(), les compteurs affichés (temps cumulé)
// doivent retomber à 0, alors que le temps du dernier match (matchLog/
// box-score, secondsPlayed/secondsPlayedByPosition) reste, lui, intact.
// ---------------------------------------------------------------------
{
  const team = generateTeam("Reset Test", 1.0);
  team.trainingSkill = "inside";
  const pos = "Pivot";
  team.trainingPositions = [pos];
  const p = team.players.find(pl => pl.position === pos) || team.players[0];

  simulateMatchMinutes(team, p, pos, 18 * 60);
  simulateMatchMinutes(team, p, pos, 15 * 60);

  const beforeTotal = team.trainablySecondsFor(p).total;
  console.log(`Cumul avant l'entraînement : ${beforeTotal / 60} min (attendu 33)`);
  if (beforeTotal !== 33 * 60) throw new Error("❌ Le cumul avant l'entraînement devrait être de 33 min (18 + 15).");

  const lastMatchSecondsBefore = p.secondsPlayed;
  const lastMatchByPositionBefore = { ...p.secondsPlayedByPosition };

  const result = team.trainWeek(1, Date.now());

  const afterTotal = team.trainablySecondsFor(p).total;
  console.log(`Cumul après l'entraînement (remise à 0 attendue) : ${afterTotal / 60} min`);
  if (afterTotal !== 0) {
    throw new Error(`❌ Après trainWeek(), le temps de jeu cumulé (page Entraînement) devrait retomber à 0 (obtenu ${afterTotal / 60} min), retour utilisateur : "les compteurs de temps de jeu sur la page entrainement doivent être remis à 0".`);
  }
  console.log("✅ Après l'entraînement, le compteur de temps de jeu cumulé retombe bien à 0.");

  if (p.secondsPlayed !== lastMatchSecondsBefore || JSON.stringify(p.secondsPlayedByPosition) !== JSON.stringify(lastMatchByPositionBefore)) {
    throw new Error("❌ trainWeek() ne devrait JAMAIS toucher secondsPlayed/secondsPlayedByPosition (dernier match, box-score/matchLog), seul trainingSecondsPlayedByPosition doit être consommé.");
  }
  console.log("✅ Le temps du dernier match (box-score/matchLog) reste intact après l'entraînement, seul le cumul d'entraînement est consommé.");

  // Le rapport (ups/downs, voir renderLastTrainingReport côté client) doit
  // refléter le temps qui VENAIT d'être cumulé (33 min), pas 0. La remise à
  // zéro se fait APRÈS avoir construit le rapport, jamais avant.
  const reportSecondsPlayed = result.players[p.id] && result.players[p.id].secondsPlayed;
  console.log(`Temps de jeu figurant dans le rapport d'entraînement : ${reportSecondsPlayed / 60} min (attendu 33, capturé avant la remise à zéro)`);
  if (reportSecondsPlayed !== 33 * 60) {
    throw new Error("❌ Le rapport d'entraînement (déjà construit avant la remise à zéro) devrait garder les 33 min réellement cumulées cette semaine.");
  }
  console.log("✅ Le rapport d'entraînement garde bien le vrai temps cumulé, même une fois le compteur remis à 0 juste après.");
}

// ---------------------------------------------------------------------
// Partie 3 : round-trip de sauvegarde (serializeTeam/teamFromSave). Le
// cumul en cours (pas encore consommé par trainWeek) doit survivre à un
// rechargement, comme secondsPlayed/secondsPlayedByPosition le font déjà.
// ---------------------------------------------------------------------
{
  const team = generateTeam("Persistence Test", 1.0);
  const pos = "Meneur";
  const p = team.players.find(pl => pl.position === pos) || team.players[0];
  team.trainingPositions = [p.position];
  simulateMatchMinutes(team, p, p.position, 9 * 60);
  simulateMatchMinutes(team, p, p.position, 11 * 60);

  const beforeTotal = team.trainablySecondsFor(p).total;

  const saved = E.serializeTeam(team);
  const restored = E.teamFromSave(JSON.parse(JSON.stringify(saved)));
  const restoredPlayer = restored.players.find(pl => pl.id === p.id);
  restored.trainingPositions = [p.position];
  const afterTotal = restored.trainablySecondsFor(restoredPlayer).total;
  console.log(`Cumul avant/après un aller-retour de sauvegarde : ${beforeTotal / 60} min / ${afterTotal / 60} min (attendu identiques, 20 min)`);
  if (afterTotal !== beforeTotal || afterTotal !== 20 * 60) {
    throw new Error("❌ Le temps cumulé du cycle d'entraînement en cours devrait survivre à un aller-retour de sauvegarde (comme secondsPlayed/secondsPlayedByPosition le font déjà).");
  }
  console.log("✅ Le cumul d'entraînement en cours survit bien à un rechargement (sauvegarde/restauration).");
}

console.log("\n✅ Cycle d'entraînement quotidien (3 matchs/jour) vérifié : cumul correct sur les 3 matchs, remise à 0 après l'entraînement (temps du dernier match/box-score préservé), et persistance à travers une sauvegarde.");
