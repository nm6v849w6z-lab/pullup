// Vérifie l'élargissement du pool de noms de famille et l'anti-doublon au
// sein d'un même effectif (retour Discord d'Ariane, relayé par
// l'utilisateur, 2026-09-24 : "3 Fontaine, 2 Novak, 2 Petit, c'est la
// galère pour m'y retrouver" — voir DEV_NOTES.md). Test de moteur pur
// (pas de jsdom/serveur nécessaire) : generateTeam/generateStartingRoster
// génèrent un effectif de 15 joueurs (POSITIONS × 3) et ne devraient plus
// jamais produire deux joueurs du même nom de famille tant que le pool
// (LAST_NAMES, désormais ~90 noms) le permet.
const E = require("./engine.js");
const { generateTeam, generateStartingRoster, LAST_NAMES, POSITIONS } = E;

function lastNamesOf(team) {
  return team.players.map(p => p.name.split(" ").slice(1).join(" "));
}

function assertNoDuplicates(names, label) {
  const seen = new Set();
  const dups = [];
  names.forEach(n => {
    if (seen.has(n)) dups.push(n);
    seen.add(n);
  });
  if (dups.length) {
    throw new Error(`❌ ${label} : doublon(s) de nom de famille trouvé(s) : ${JSON.stringify(dups)} (effectif : ${JSON.stringify(names)}).`);
  }
}

// ---------------------------------------------------------------------
// Partie 1 : le pool de noms de famille est bien nettement plus grand
// qu'avant (22 noms à l'origine) — assez pour qu'un effectif de 15 noms
// distincts tirés dedans (POSITIONS.length * 3) soit systématiquement
// possible sans repli sur un doublon.
// ---------------------------------------------------------------------
const rosterSize = POSITIONS.length * 3;
if (LAST_NAMES.length < rosterSize * 2) {
  throw new Error(`❌ Le pool de noms de famille (${LAST_NAMES.length}) devrait être largement plus grand que la taille d'un effectif (${rosterSize}), avec de la marge pour l'anti-doublon.`);
}
console.log(`✅ Le pool de noms de famille contient bien ${LAST_NAMES.length} noms (largement plus que les ${rosterSize} joueurs d'un effectif), contre 22 avant le correctif.`);

if (new Set(LAST_NAMES).size !== LAST_NAMES.length) {
  throw new Error("❌ Le pool de noms de famille ne devrait contenir aucun doublon interne.");
}
console.log("✅ Aucun doublon interne dans le pool de noms de famille lui-même.");

// ---------------------------------------------------------------------
// Partie 2 : generateTeam (équipes adverses générées) — aucun doublon de
// nom de famille sur un grand nombre d'effectifs générés (la génération
// est aléatoire, on vérifie sur un échantillon large plutôt que sur un
// seul tirage qui pourrait passer par chance même avec l'ancien pool).
// ---------------------------------------------------------------------
const SAMPLE = 300;
for (let i = 0; i < SAMPLE; i++) {
  const team = generateTeam(`Équipe Test ${i}`, 1);
  assertNoDuplicates(lastNamesOf(team), `generateTeam #${i}`);
}
console.log(`✅ Aucun doublon de nom de famille sur ${SAMPLE} effectifs générés avec generateTeam (équipes adverses).`);

// ---------------------------------------------------------------------
// Partie 3 : generateStartingRoster (effectif de départ d'une nouvelle
// carrière) — même vérification, chemin de génération différent
// (generateRookiePlayer plutôt que generatePlayer).
// ---------------------------------------------------------------------
for (let i = 0; i < SAMPLE; i++) {
  const team = generateStartingRoster(`Effectif Départ Test ${i}`);
  assertNoDuplicates(lastNamesOf(team), `generateStartingRoster #${i}`);
}
console.log(`✅ Aucun doublon de nom de famille sur ${SAMPLE} effectifs générés avec generateStartingRoster (nouvelle carrière).`);

console.log("\n🏁 Tous les tests du pool de noms de famille élargi et de l'anti-doublon par effectif sont passés.");
