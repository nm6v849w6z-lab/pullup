// Vérifie l'exclusion pour indiscipline (retour utilisateur, 2026-09) :
//
// 1) Faute technique (Sang-froid bas, voir MatchEngine.maybeEjectForComposure) :
//    mécanisme déjà en place, mais jusqu'ici SANS AUCUN test dédié (repéré
//    en répondant à "les exclusions ont bien été intégrées dans le jeu ?" -
//    grep exhaustif de "exclusion"/"maybeEjectForComposure"/"technicalFoul"/
//    "disqualified" dans tous les *_test.js : rien). Ce fichier comble ce
//    manque.
// 2) Faute antisportive (Discipline basse, voir MatchEngine.
//    maybeCommitUnsportsmanlikeFoul) : NOUVEAU mécanisme, demandé dans la
//    foulée ("les fautes antisportives [...] Comme pour les fautes
//    techniques 2 antisportives c'est exclusion. 1 antisportive et une
//    technique c'est exclusion aussi").
//
// Voir engine.js : MatchEngine.shouldEjectForFouls (seuil PARTAGÉ par les 2
// mécanismes), maybeEjectForComposure, maybeCommitUnsportsmanlikeFoul,
// Player.technicalFouls/unsportsmanlikeFouls (remis à zéro à chaque match,
// voir resetForMatch), PHRASES.technicalFoul/unsportsmanlikeFoul/
// technicalEjection/unsportsmanlikeEjection.
//
// Tests MOTEUR (pas de DOM) : appels directs et déterministes des 2
// méthodes (Math.random stubbé) pour vérifier la mécanique exacte, plus une
// vérification statistique sur une vraie simulation de match pour confirmer
// que tout est bien câblé de bout en bout (pas seulement atteignable en
// appel direct).
const E = require("./engine.js");
const {
  generateStartingRoster, MatchEngine, PHRASES,
} = E;

const T0 = Date.now();

function freshMatch(offComposure = 50, offDiscipline = 50) {
  const off = generateStartingRoster("Exclusion Off");
  const def = generateStartingRoster("Exclusion Def");
  off.resetForMatch(T0);
  def.resetForMatch(T0);
  const me = new MatchEngine(off, def);
  return { off, def, me };
}

// ---------------------------------------------------------------------
// 1) shouldEjectForFouls : table de vérité complète et isolée, indépendante
//    de toute simulation - la RÈGLE elle-même, telle que demandée : "Comme
//    pour les fautes techniques 2 antisportives c'est exclusion. 1
//    antisportive et une technique c'est exclusion aussi".
// ---------------------------------------------------------------------
(function testShouldEjectForFoulsTruthTable() {
  const { me } = freshMatch();
  const cases = [
    [0, 0, false], [1, 0, false], [0, 1, false],
    [2, 0, true], [0, 2, true],
    [1, 1, true], [2, 1, true], [1, 2, true], [2, 2, true],
  ];
  cases.forEach(([technicalFouls, unsportsmanlikeFouls, expected]) => {
    const p = { technicalFouls, unsportsmanlikeFouls };
    const got = me.shouldEjectForFouls(p);
    console.log(`shouldEjectForFouls(technique=${technicalFouls}, antisportive=${unsportsmanlikeFouls}) = ${got} (attendu ${expected})`);
    if (got !== expected) {
      throw new Error(`❌ shouldEjectForFouls(${technicalFouls}, ${unsportsmanlikeFouls}) devrait valoir ${expected}, obtenu ${got}.`);
    }
  });
  console.log("✅ shouldEjectForFouls applique exactement la règle demandée (2 techniques, 2 antisportives, ou 1 de chaque, jamais 1 seule d'un type).");
})();

// ---------------------------------------------------------------------
// 2) Faute technique isolée (Sang-froid bas, Discipline neutre) : 1ère faute
//    technique -> pas d'exclusion, message "technicalFoul" ; 2e -> exclusion,
//    message "technicalEjection", Player.disqualified posé.
// ---------------------------------------------------------------------
(function testTechnicalFoulThenEjection() {
  const { off, def, me } = freshMatch();
  const defender = def.players[0];
  const shooter = off.players[0];
  defender.attrs.composure = 1; // chance max (~4.9%, plafonnée à 5%)
  defender.attrs.discipline = 99; // neutralise toute interférence antisportive
  const events = [];

  const realRandom = Math.random;
  Math.random = () => 0; // garantit le déclenchement de CHAQUE roll de chance

  // maybeEjectForComposure logue d'abord son propre évènement (technicalFoul
  // ou technicalEjection), PUIS this.freeThrows(...) logue à son tour un
  // évènement "freeThrow" séparé (le lancer franc accordé) - le dernier
  // évènement de la liste n'est donc PAS celui qu'on veut vérifier ici ;
  // on capture events.length juste avant l'appel et on lit l'évènement à
  // cet index précis (le premier ajouté par CET appel).
  try {
    const ftaBefore = shooter.stats.fta;
    let idx = events.length;
    me.maybeEjectForComposure(defender, def, off, shooter, 1, 600, events);
    if (defender.technicalFouls !== 1) throw new Error(`❌ Après 1 faute technique, technicalFouls devrait valoir 1, obtenu ${defender.technicalFouls}.`);
    if (defender.disqualified) throw new Error("❌ 1 seule faute technique ne devrait PAS exclure le joueur.");
    if (shooter.stats.fta !== ftaBefore + 1) throw new Error(`❌ La faute technique devrait accorder 1 lancer franc adverse (fta attendu ${ftaBefore + 1}, obtenu ${shooter.stats.fta}).`);
    let foulEvent = events[idx];
    if (foulEvent.type !== "technicalFoul") throw new Error(`❌ Le 1er évènement de cet appel devrait être de type "technicalFoul", obtenu "${foulEvent.type}".`);
    console.log(`1ère faute technique : "${foulEvent.text}"`);

    idx = events.length;
    me.maybeEjectForComposure(defender, def, off, shooter, 1, 590, events);
    if (defender.technicalFouls !== 2) throw new Error(`❌ Après 2 fautes techniques, technicalFouls devrait valoir 2, obtenu ${defender.technicalFouls}.`);
    if (!defender.disqualified) throw new Error("❌ 2 fautes techniques dans le même match devraient exclure le joueur.");
    foulEvent = events[idx];
    if (foulEvent.type !== "technicalEjection") throw new Error(`❌ Le 1er évènement de cet appel devrait être de type "technicalEjection", obtenu "${foulEvent.type}".`);
    console.log(`2e faute technique : "${foulEvent.text}"`);
  } finally {
    Math.random = realRandom;
  }
  console.log("✅ 2 fautes techniques du même joueur (Sang-froid bas) l'excluent bien, la 1ère seule ne l'exclut pas.");
})();

// ---------------------------------------------------------------------
// 3) Faute antisportive isolée (Discipline basse, Sang-froid neutre) : même
//    couverture que le test 2, mais pour le nouveau mécanisme - et vérifie
//    en plus la sanction à 2 lancers francs (contre 1 pour la technique).
// ---------------------------------------------------------------------
(function testUnsportsmanlikeFoulThenEjection() {
  const { off, def, me } = freshMatch();
  const defender = def.players[0];
  const shooter = off.players[0];
  defender.attrs.discipline = 1; // chance max (~2.9%, plafonnée à 3%)
  defender.attrs.composure = 99; // neutralise toute interférence technique
  const events = [];

  const realRandom = Math.random;
  Math.random = () => 0;

  try {
    const ftaBefore = shooter.stats.fta;
    let idx = events.length;
    me.maybeCommitUnsportsmanlikeFoul(defender, def, off, shooter, 1, 600, events);
    if (defender.unsportsmanlikeFouls !== 1) throw new Error(`❌ Après 1 faute antisportive, unsportsmanlikeFouls devrait valoir 1, obtenu ${defender.unsportsmanlikeFouls}.`);
    if (defender.disqualified) throw new Error("❌ 1 seule faute antisportive ne devrait PAS exclure le joueur.");
    if (shooter.stats.fta !== ftaBefore + 2) throw new Error(`❌ La faute antisportive devrait accorder 2 lancers francs adverses (fta attendu ${ftaBefore + 2}, obtenu ${shooter.stats.fta}).`);
    let foulEvent = events[idx];
    if (foulEvent.type !== "unsportsmanlikeFoul") throw new Error(`❌ Le 1er évènement de cet appel devrait être de type "unsportsmanlikeFoul", obtenu "${foulEvent.type}".`);
    console.log(`1ère faute antisportive : "${foulEvent.text}"`);

    idx = events.length;
    me.maybeCommitUnsportsmanlikeFoul(defender, def, off, shooter, 1, 590, events);
    if (defender.unsportsmanlikeFouls !== 2) throw new Error(`❌ Après 2 fautes antisportives, unsportsmanlikeFouls devrait valoir 2, obtenu ${defender.unsportsmanlikeFouls}.`);
    if (!defender.disqualified) throw new Error("❌ 2 fautes antisportives dans le même match devraient exclure le joueur.");
    foulEvent = events[idx];
    if (foulEvent.type !== "technicalEjection") throw new Error(`❌ Le 1er évènement de cet appel devrait être de type "technicalEjection" (même type d'évènement que l'exclusion technique), obtenu "${foulEvent.type}".`);
    if (!/antisportive/i.test(foulEvent.text)) throw new Error(`❌ Le message d'exclusion sur 2 antisportives devrait mentionner "antisportive", obtenu "${foulEvent.text}".`);
    console.log(`2e faute antisportive : "${foulEvent.text}"`);
  } finally {
    Math.random = realRandom;
  }
  console.log("✅ 2 fautes antisportives du même joueur (Discipline basse) l'excluent bien, la 1ère seule ne l'exclut pas, sanctionnée de 2 lancers francs (vs 1 pour la technique).");
})();

// ---------------------------------------------------------------------
// 4) Règle mélangée : 1 faute technique + 1 faute antisportive (n'importe
//    quel ordre) exclut, comme demandé explicitement par l'utilisateur.
// ---------------------------------------------------------------------
(function testMixedTechnicalThenUnsportsmanlikeEjects() {
  const { off, def, me } = freshMatch();
  const defender = def.players[0];
  const shooter = off.players[0];
  defender.attrs.composure = 1;
  defender.attrs.discipline = 1;
  const events = [];
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    me.maybeEjectForComposure(defender, def, off, shooter, 1, 600, events);
    if (defender.disqualified) throw new Error("❌ 1 seule faute technique (0 antisportive) ne devrait pas encore exclure.");
    const idx = events.length;
    me.maybeCommitUnsportsmanlikeFoul(defender, def, off, shooter, 1, 590, events);
    if (!defender.disqualified) throw new Error("❌ 1 faute technique + 1 faute antisportive devraient exclure le joueur (règle mélangée).");
    const foulEvent = events[idx];
    if (foulEvent.type !== "technicalEjection") throw new Error(`❌ Type d'évènement d'exclusion inattendu : "${foulEvent.type}".`);
    console.log(`1 technique + 1 antisportive (technique d'abord) : "${foulEvent.text}"`);
  } finally {
    Math.random = realRandom;
  }
  console.log("✅ 1 faute technique + 1 faute antisportive (technique en premier) exclut bien le joueur.");
})();

(function testMixedUnsportsmanlikeThenTechnicalEjects() {
  const { off, def, me } = freshMatch();
  const defender = def.players[0];
  const shooter = off.players[0];
  defender.attrs.composure = 1;
  defender.attrs.discipline = 1;
  const events = [];
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    me.maybeCommitUnsportsmanlikeFoul(defender, def, off, shooter, 1, 600, events);
    if (defender.disqualified) throw new Error("❌ 1 seule faute antisportive (0 technique) ne devrait pas encore exclure.");
    const idx = events.length;
    me.maybeEjectForComposure(defender, def, off, shooter, 1, 590, events);
    if (!defender.disqualified) throw new Error("❌ 1 faute antisportive + 1 faute technique devraient exclure le joueur (règle mélangée, ordre inverse).");
    const foulEvent = events[idx];
    if (foulEvent.type !== "technicalEjection") throw new Error(`❌ Type d'évènement d'exclusion inattendu : "${foulEvent.type}".`);
    console.log(`1 antisportive + 1 technique (antisportive d'abord) : "${foulEvent.text}"`);
  } finally {
    Math.random = realRandom;
  }
  console.log("✅ 1 faute antisportive + 1 faute technique (antisportive en premier) exclut bien le joueur - l'ordre n'a pas d'importance.");
})();

// ---------------------------------------------------------------------
// 5) Garde-fous : Sang-froid/Discipline >= 50 => jamais de faute déclenchée
//    (même avec Math.random stubbé à 0) ; un joueur déjà exclu ne peut plus
//    rien déclencher/reloguer (les 2 méthodes se gardent en tête via
//    disqualified).
// ---------------------------------------------------------------------
(function testGuardsNeverTriggerOrDoubleLog() {
  const { off, def, me } = freshMatch();
  const defender = def.players[0];
  const shooter = off.players[0];
  const events = [];
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    // Sang-froid/Discipline neutres (50) : jamais de faute, quel que soit le tirage.
    defender.attrs.composure = 50;
    defender.attrs.discipline = 50;
    me.maybeEjectForComposure(defender, def, off, shooter, 1, 600, events);
    me.maybeCommitUnsportsmanlikeFoul(defender, def, off, shooter, 1, 600, events);
    if (defender.technicalFouls !== 0 || defender.unsportsmanlikeFouls !== 0 || events.length !== 0) {
      throw new Error(`❌ Sang-froid/Discipline à 50 (neutre) ne devrait déclencher aucune faute technique/antisportive, obtenu technicalFouls=${defender.technicalFouls}, unsportsmanlikeFouls=${defender.unsportsmanlikeFouls}, ${events.length} évènement(s).`);
    }
    console.log("✅ Sang-froid/Discipline neutres (50) : aucune faute technique/antisportive déclenchée, même avec un tirage garanti.");

    // Un joueur déjà exclu ne redéclenche plus rien (ni compteur, ni log).
    defender.attrs.composure = 1;
    defender.attrs.discipline = 1;
    defender.disqualified = true;
    defender.technicalFouls = 2;
    const eventsBefore = events.length;
    me.maybeEjectForComposure(defender, def, off, shooter, 1, 590, events);
    me.maybeCommitUnsportsmanlikeFoul(defender, def, off, shooter, 1, 590, events);
    if (defender.technicalFouls !== 2 || defender.unsportsmanlikeFouls !== 0 || events.length !== eventsBefore) {
      throw new Error(`❌ Un joueur déjà exclu (disqualified=true) ne devrait plus rien déclencher (compteurs/évènements inchangés), obtenu technicalFouls=${defender.technicalFouls}, unsportsmanlikeFouls=${defender.unsportsmanlikeFouls}, ${events.length - eventsBefore} nouvel(s) évènement(s).`);
    }
    console.log("✅ Un joueur déjà exclu ne redéclenche plus rien (ni compteur, ni évènement), quel que soit son Sang-froid/Discipline.");
  } finally {
    Math.random = realRandom;
  }
})();

// ---------------------------------------------------------------------
// 6) Intégration réelle : sur une VRAIE simulation de match (playPossession,
//    pas d'appel direct aux méthodes), avec une équipe entière au Sang-froid
//    ET à la Discipline au plancher, on doit observer statistiquement des
//    fautes techniques, des fautes antisportives, et au moins une exclusion
//    - confirme que le mécanisme est bien atteint depuis le flot normal du
//    jeu (les 2 points d'appel dans playPossession), pas seulement testable
//    en appel direct.
// ---------------------------------------------------------------------
(function testRealMatchSimulationTriggersEjections() {
  const off = generateStartingRoster("Indiscipline Off");
  const def = generateStartingRoster("Indiscipline Def");
  def.players.forEach(p => { p.attrs.composure = 1; p.attrs.discipline = 1; });
  off.resetForMatch(T0);
  def.resetForMatch(T0);
  const me = new MatchEngine(off, def);
  const events = [];
  // Pas d'arrêt anticipé sur la 1ère exclusion observée (essai précédent,
  // corrigé) : une exclusion peut survenir tôt via UN SEUL des 2 mécanismes
  // (ex : la technique atteint 2 avant que l'antisportive n'ait eu
  // l'occasion de se produire sur ce joueur ou un autre) - s'arrêter dès la
  // 1ère exclusion risquait de ne jamais observer l'AUTRE mécanisme et de
  // rendre ce test flaky. On joue un nombre fixe de possessions et on vérifie
  // les 3 signaux à la fin.
  const N = 4000;
  for (let i = 0; i < N; i++) {
    me.playPossession(off, def, 1, 600, events, 0);
  }
  const sawTechnicalFoul = events.some(e => e.type === "technicalFoul");
  const sawUnsportsmanlikeFoul = events.some(e => e.type === "unsportsmanlikeFoul");
  const sawEjection = events.some(e => e.type === "technicalEjection");
  console.log(`Sur ${N} possessions réelles (équipe Sang-froid=1/Discipline=1) : faute technique observée=${sawTechnicalFoul}, faute antisportive observée=${sawUnsportsmanlikeFoul}, exclusion observée=${sawEjection}.`);
  if (!sawTechnicalFoul) throw new Error(`❌ Une équipe entière à Sang-froid=1 devrait finir par déclencher au moins une faute technique sur ${N} possessions.`);
  if (!sawUnsportsmanlikeFoul) throw new Error(`❌ Une équipe entière à Discipline=1 devrait finir par déclencher au moins une faute antisportive sur ${N} possessions.`);
  if (!sawEjection) throw new Error(`❌ Une équipe entière à Sang-froid=1 ET Discipline=1 devrait finir par déclencher au moins une exclusion sur ${N} possessions.`);
  const ejected = def.players.filter(p => p.disqualified);
  if (ejected.length === 0) throw new Error("❌ Au moins un joueur de l'équipe en infraction devrait être marqué disqualified après l'exclusion observée.");
  console.log(`✅ Le mécanisme est bien atteint depuis le flot normal du jeu (playPossession), pas seulement en appel direct : ${ejected.length} joueur(s) exclu(s) (${ejected.map(p => p.name).join(", ")}).`);
})();

// ---------------------------------------------------------------------
// 7) Sortie effective du terrain : un joueur exclu par ce mécanisme doit,
//    comme pour foulOut, être sorti par substituteIfNeeded au prochain
//    passage (mustLeave = p.disqualified || p.injured, déjà en place) -
//    vérifie qu'il n'y a pas de nouvelle mécanique de sortie à écrire,
//    exactement comme le documentent les commentaires du moteur.
// ---------------------------------------------------------------------
(function testEjectedPlayerLeavesCourt() {
  const off = generateStartingRoster("Sortie Terrain Off");
  const def = generateStartingRoster("Sortie Terrain Def");
  off.resetForMatch(T0);
  def.resetForMatch(T0);
  const me = new MatchEngine(off, def);
  const defender = def.onCourtPlayers()[0];
  const shooter = off.players[0];
  const events = [];
  defender.attrs.composure = 1;
  defender.attrs.discipline = 99;
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    me.maybeEjectForComposure(defender, def, off, shooter, 1, 600, events);
    me.maybeEjectForComposure(defender, def, off, shooter, 1, 590, events);
  } finally {
    Math.random = realRandom;
  }
  if (!defender.disqualified) throw new Error("❌ (setup) le défenseur devrait être exclu à ce stade du test.");
  me.substituteIfNeeded(def, 1, 580, events);
  console.log(`Après substituteIfNeeded : ${defender.name} sur le terrain = ${defender.onCourt} (attendu false).`);
  if (defender.onCourt) throw new Error("❌ Un joueur exclu pour indiscipline devrait être sorti du terrain par substituteIfNeeded, exactement comme foulOut.");
  console.log("✅ Un joueur exclu pour indiscipline (technique ou antisportive) est bien sorti du terrain, via le même mécanisme que foulOut.");
})();

console.log("\n🏁 Tous les tests d'exclusion pour indiscipline (technique et antisportive) sont passés.");
