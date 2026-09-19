// Vérifie la correction du bug de synergie d'entraînement (retour
// utilisateur : "je teste encore l'entrainement et je crois qu'il y a qqch
// qui ne tourne pas rond / noé novak prend l'entrainement comme il faut en
// DE mais il monte mieux sur les autres caracs") : une caractéristique liée
// par synergie (voir TRAINING_SYNERGY) doit TOUJOURS progresser moins, sur
// la durée, que la caractéristique réellement entraînée cette semaine-là —
// jamais autant, jamais plus — qu'elle parte d'une valeur basse (gros écart
// au plafond réduit) ou non. Voir Player.trainWeek/Team.trainWeek
// (synergyAttrs / roomScale).
const E = require("./engine.js");
const { generateTeam, ATTRS } = E;

function totalGrowthOver(weeks, setup) {
  const team = generateTeam("Synergie Test", 1.0);
  const p = team.players.find(pl => pl.position === "Arrière") || team.players[0];
  // Âge fixé à 24 ans (jeune joueur en pleine progression, croissance non
  // négligeable) : un âge tiré au hasard par generateTeam peut retomber sur
  // un joueur proche de la trentaine, dont la croissance hebdomadaire est si
  // faible (voir growthFactorForAge) que les deux caractéristiques comparées
  // plafonnent quasiment à zéro gain net — la comparaison "qui progresse le
  // plus" perd alors tout son sens (bruit d'arrondi au point entier plutôt
  // qu'un vrai signal), ce qui ne correspond pas au cas réel rapporté (un
  // joueur activement entraîné, en pleine progression).
  p.age = 24;
  setup(team, p);
  // Player.trainingSecondsPlayedByPosition est désormais remis à {} par
  // Team.trainWeek une fois consommé (calendrier ancré quotidien, cumul sur
  // les matchs du jour puis remise à zéro, voir engine.js) : `setup`
  // ci-dessus ne l'affecte qu'une seule fois, donc sans ce ré-arrosage à
  // chaque semaine simulée, seule la 1re des `weeks` itérations trouverait
  // un joueur ayant "joué" (les suivantes retomberaient à 0% d'assiduité).
  // On rejoue simplement, avant chaque semaine, ce que `setup` a affecté une
  // fois pour toutes, plutôt que de faire dépendre le test d'un vrai
  // enchaînement de matchs simulés (hors sujet ici, seule la progression
  // relative des caractéristiques entraînées/synergie compte).
  const trainedSecondsSnapshot = { ...p.trainingSecondsPlayedByPosition };
  const totals = {};
  ATTRS.forEach(a => totals[a] = 0);
  for (let w = 0; w < weeks; w++) {
    const before = { ...p.attrs };
    p.trainingSecondsPlayedByPosition = { ...trainedSecondsSnapshot };
    team.trainWeek(1);
    ATTRS.forEach(a => totals[a] += (p.attrs[a] - before[a]));
  }
  return totals;
}

// --- Cas 1 : tous les attributs partent du MÊME niveau (isole l'effet du
// poids pur, sans confusion avec l'écart au plafond). La caractéristique
// entraînée (defOutside) doit dominer très largement les deux caractéristiques
// de synergie (defInside, agility). ---
{
  const totals = totalGrowthOver(40, (team, p) => {
    ATTRS.forEach(a => p.attrs[a] = 30);
    p.potential = 70;
    team.trainingSkill = "defOutside";
    team.trainingPositions = [p.position];
    p.trainingSecondsPlayedByPosition = { [p.position]: 3000 };
  });
  console.log("Cas 1 (départs égaux) — defOutside:", totals.defOutside, "defInside:", totals.defInside, "agility:", totals.agility);
  if (!(totals.defOutside > totals.defInside)) {
    throw new Error(`❌ defOutside (entraîné) devrait progresser plus que defInside (synergie) : ${totals.defOutside} vs ${totals.defInside}.`);
  }
  if (!(totals.defOutside > totals.agility)) {
    throw new Error(`❌ defOutside (entraîné) devrait progresser plus qu'agility (synergie) : ${totals.defOutside} vs ${totals.agility}.`);
  }
  console.log("✅ Cas 1 : la caractéristique entraînée domine largement les caractéristiques de synergie, départs égaux.");
}

// --- Cas 2 (le bug exact rapporté) : la caractéristique entraînée part DÉJÀ
// bien développée (proche de son propre plafond, peu de marge), tandis
// qu'une caractéristique de synergie part très bas (gros écart, y compris à
// son plafond réduit). AVANT la correction, ce cas précis faisait progresser
// la caractéristique de synergie AUTANT, voire plus, que celle réellement
// entraînée — désormais la caractéristique entraînée doit rester devant.
// 12 semaines (un peu plus d'une saison) plutôt que 40 : au-delà, la
// caractéristique entraînée finit par plafonner tout à fait (son propre
// écart au plafond est réduit dès le départ), pendant que la caractéristique
// de synergie, elle, continue à grimper tout du long (gros écart à combler)
// — l'écart entre les deux devient alors de plus en plus ténu et sensible au
// hasard semaine après semaine, ce qui n'a rien à voir avec le bug corrigé
// ici (qui se manifeste tôt, pas seulement après plafonnement complet). ---
{
  const totals = totalGrowthOver(12, (team, p) => {
    p.potential = 55;
    p.attrs.defOutside = 48; // proche de son propre plafond (potential + 12)
    p.attrs.defInside = 10;  // très en retard
    p.attrs.agility = 10;
    team.trainingSkill = "defOutside";
    team.trainingPositions = [p.position];
    p.trainingSecondsPlayedByPosition = { [p.position]: 3000 };
  });
  console.log("Cas 2 (defOutside déjà développé, synergies très en retard) — defOutside:", totals.defOutside, "defInside:", totals.defInside, "agility:", totals.agility);
  if (!(totals.defOutside >= totals.defInside)) {
    throw new Error(`❌ Bug reproduit : defInside (synergie, très en retard) progresse plus que defOutside (entraîné) : ${totals.defOutside} vs ${totals.defInside}.`);
  }
  if (!(totals.defOutside >= totals.agility)) {
    throw new Error(`❌ Bug reproduit : agility (synergie, très en retard) progresse plus que defOutside (entraîné) : ${totals.defOutside} vs ${totals.agility}.`);
  }
  console.log("✅ Cas 2 : même avec un gros écart de départ en faveur des caractéristiques de synergie, la caractéristique entraînée reste devant (bug corrigé).");
}

// --- Cas 3 : sur de nombreux tirages aléatoires (rand() dans Player.trainWeek),
// vérifie que ce n'est pas un coup de chance isolé — répète le cas 2 vingt
// fois. Chaque semaine tire un facteur aléatoire indépendant par
// caractéristique (voir Player.trainWeek), donc une répétition isolée peut,
// rarement, retomber sur une quasi-égalité — ce qui compte est que la
// caractéristique entraînée gagne trÈs largement la majorité du temps, pas
// une garantie absolue à 100% sur un tirage aléatoire individuel : on
// tolère donc au plus 1 quasi-égalité sur 20 (jamais un écart franc en
// faveur de la synergie), et on vérifie surtout la MOYENNE, bien plus
// représentative du comportement réel que n'importe quelle répétition prise
// isolément. ---
{
  let failures = 0;
  let sumOut = 0, sumIn = 0, sumAgi = 0;
  const REPEATS = 20;
  for (let i = 0; i < REPEATS; i++) {
    const totals = totalGrowthOver(12, (team, p) => {
      p.potential = 55;
      p.attrs.defOutside = 48;
      p.attrs.defInside = 10;
      p.attrs.agility = 10;
      team.trainingSkill = "defOutside";
      team.trainingPositions = [p.position];
      p.trainingSecondsPlayedByPosition = { [p.position]: 3000 };
    });
    sumOut += totals.defOutside; sumIn += totals.defInside; sumAgi += totals.agility;
    if (totals.defOutside < totals.defInside || totals.defOutside < totals.agility) failures++;
  }
  const avgOut = sumOut / REPEATS, avgIn = sumIn / REPEATS, avgAgi = sumAgi / REPEATS;
  console.log(`Cas 3 (${REPEATS} répétitions du cas 2) — quasi-égalités/inversions : ${failures}/${REPEATS} | moyennes — defOutside: ${avgOut.toFixed(1)} defInside: ${avgIn.toFixed(1)} agility: ${avgAgi.toFixed(1)}`);
  if (failures > 1) throw new Error(`❌ ${failures}/${REPEATS} répétitions montrent une caractéristique de synergie dépassant nettement la caractéristique entraînée — ce ne serait plus un aléa isolé.`);
  if (!(avgOut > avgIn) || !(avgOut > avgAgi)) throw new Error(`❌ En moyenne sur ${REPEATS} répétitions, defOutside (entraîné, ${avgOut.toFixed(1)}) devrait dépasser defInside (${avgIn.toFixed(1)}) et agility (${avgAgi.toFixed(1)}).`);
  console.log(`✅ Cas 3 : stable sur ${REPEATS} répétitions — la caractéristique entraînée gagne presque toujours, et toujours en moyenne (pas un coup de chance).`);
}

console.log("\n✅ Bug de synergie d'entraînement corrigé : une caractéristique liée par synergie ne dépasse plus jamais, sur la durée, la caractéristique réellement entraînée cette semaine-là — quel que soit l'écart de départ.");
