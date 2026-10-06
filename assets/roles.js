/* Rôles de jeu et compatibilité des joueurs (spécification utilisateur du
   2026-10-06, maquette validée : « oui vas y avance comme ça »).
   Module partagé serveur (require) / navigateur (window.HM_ROLES).

   POSTE ≠ RÔLE : le poste dit où joue le joueur (Meneur … Pivot), le rôle
   dit COMMENT il joue (3&D, Gâchette, Pass-first…). Les rôles sont
   déterminés par les caractéristiques (jamais attribués à la main) :
   maîtrise 0-99 par couple (rôle, poste).

   Tout est dans les données ci-dessous (CONFIG, ROLES, PAIRS), modifiables
   sans toucher au moteur :
   - ROLES[id] : name, positions, desc, weights (caractéristiques qui font
     le rôle), tendencies (0-1 : usage du ballon, création pour les autres,
     écartement, jeu sans ballon, raquette, défense extérieure, protection du
     cercle, rebond, transition, pick & roll), offense/defense (comportements,
     en clair), training (programmes qui le développent).
   - PAIRS : compatibilité entre deux rôles (-3 à +3) et sa raison.

   Phases : 1 rôles et maîtrise (fiche joueur) ; 2 compatibilité du cinq ;
   3 effets en match ; 4 marché, rôle préféré, moral ; 5 âge et tactiques. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HM_ROLES = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const POSITIONS = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];

  const CONFIG = {
    masteryBase: 60,        // maîtrise d'un profil « habituel » pour le rôle, à 50 de niveau
    shapeWeight: 100,       // poids du relief du profil (+10 % au-dessus de l'habituel = +10 de maîtrise)
    levelWeight: 0.6,       // poids du niveau du joueur
    baselineWeight: 0.65,    // part du relief habituel retirée (0 = relief brut, 1 = écart pur à l'habituel)
    // Poids des caractéristiques d'un rôle selon leur rang (correctifs du
    // 2026-10-06) : essentielle 3, importante 2, secondaire 1, non listée 0.
    tierWeights: { essential: 3, important: 2, secondary: 1 },
    // Seuils des caractéristiques essentielles (ROLES[id].min = { attr:
    // [souple, dur] }), exprimés pour un joueur de haut niveau (moyenne de
    // ses 8 meilleures caractéristiques ≥ thresholdRef) et réduits en
    // proportion en dessous (une Passe à 59 ne pèse pas pareil en D1 et en D6).
    thresholdRef: 75,
    softPenalty: 4,         // sous le seuil souple : −4…
    softSlope: 1,           // … et −1 par point manquant
    hardPenalty: 8,         // sous le seuil dur : −8 de plus…
    hardSlope: 1.5,         // … et −1,5 par point manquant sous ce seuil
    essentialBonus: 2,      // toutes les essentielles au-dessus du seuil souple : +2
    saturateFrom: 75,       // au-dessus : la maîtrise tend vers 99 sans l'atteindre d'un coup
    // Poste : modificateur réel de la maîtrise (et non plus un facteur
    // presque toujours égal à 1). Poste de carte, autre poste jouable, puis
    // selon la distance (en postes) au plus proche poste jouable.
    positionModifiers: { card: 4, playable: -2, dist1: -8, dist2: -14, dist3: -20 },
    positionGapSlope: 1.2,  // hors postes jouables : au moins −1,2 par % d'écart de note au poste
    secondaryMin: 60,       // maîtrise minimale d'un rôle secondaire
    secondaryGap: 15,       // … et à moins de 15 points du rôle principal
    strengthGap: 5,         // une force : au moins 5 points au-dessus du niveau du joueur
    identityWindow: 99,     // rôle principal : la meilleure maîtrise à un poste naturel
    identityPosFit: 0.99,   // sans postes connus : rôles joués à un poste jouable
    positionsGap: 0.05,     // postes jouables : note à moins de 5 % de son meilleur poste
    positionsReach: 1,      // … et voisins du poste de carte
                            // (relatif : 3 points pour un joueur à 60, 1 pour un jeune à 20)
    cardPositionBonus: 0,   // (le poste de carte compte désormais dans positionModifiers.card)
    // Relief habituel (caractéristiques du rôle / niveau du joueur − 1) de
    // chaque rôle chez les joueurs de chaque poste (joueurs générés,
    // scripts/roles_baselines.js) : un joueur est comparé aux joueurs de SON
    // poste — un rôle n'est pas « maîtrisé » juste parce que ses
    // caractéristiques recoupent les points forts du poste. (Avant le
    // 2026-10-06 la référence était celle du poste du RÔLE : un meneur jugé
    // sur la Passe habituelle d'un ailier fort paraissait exceptionnel.)
    baselines: {
      "combo_guard|Ailier fort": -0.183,
      "combo_guard|Ailier shooteur": 0.153,
      "combo_guard|Arrière": 0.186,
      "combo_guard|Meneur": 0.186,
      "combo_guard|Pivot": -0.215,
      "defensive_four|Ailier fort": -0.016,
      "defensive_four|Ailier shooteur": -0.046,
      "defensive_four|Arrière": -0.205,
      "defensive_four|Meneur": -0.12,
      "defensive_four|Pivot": 0.084,
      "floor_general|Ailier fort": -0.14,
      "floor_general|Ailier shooteur": 0.041,
      "floor_general|Arrière": 0.074,
      "floor_general|Meneur": 0.18,
      "floor_general|Pivot": -0.164,
      "inside_four|Ailier fort": 0.451,
      "inside_four|Ailier shooteur": -0.063,
      "inside_four|Arrière": -0.408,
      "inside_four|Meneur": -0.403,
      "inside_four|Pivot": 0.565,
      "interior_scorer|Ailier fort": 0.429,
      "interior_scorer|Ailier shooteur": -0.033,
      "interior_scorer|Arrière": -0.363,
      "interior_scorer|Meneur": -0.36,
      "interior_scorer|Pivot": 0.498,
      "lob_threat|Ailier fort": 0.248,
      "lob_threat|Ailier shooteur": -0.029,
      "lob_threat|Arrière": -0.185,
      "lob_threat|Meneur": -0.094,
      "lob_threat|Pivot": 0.223,
      "pass_first|Ailier fort": -0.146,
      "pass_first|Ailier shooteur": -0.027,
      "pass_first|Arrière": -0.02,
      "pass_first|Meneur": 0.112,
      "pass_first|Pivot": -0.115,
      "playmaking_four|Ailier fort": -0.188,
      "playmaking_four|Ailier shooteur": -0.029,
      "playmaking_four|Arrière": 0.075,
      "playmaking_four|Meneur": 0.173,
      "playmaking_four|Pivot": -0.192,
      "point_center|Ailier fort": -0.1,
      "point_center|Ailier shooteur": -0.026,
      "point_center|Arrière": -0.103,
      "point_center|Meneur": 0.072,
      "point_center|Pivot": -0.051,
      "point_forward|Ailier fort": -0.206,
      "point_forward|Ailier shooteur": 0.015,
      "point_forward|Arrière": 0.107,
      "point_forward|Meneur": 0.24,
      "point_forward|Pivot": -0.206,
      "rebounder|Ailier fort": 0.417,
      "rebounder|Ailier shooteur": -0.029,
      "rebounder|Arrière": -0.365,
      "rebounder|Meneur": -0.362,
      "rebounder|Pivot": 0.49,
      "rim_protector|Ailier fort": 0.198,
      "rim_protector|Ailier shooteur": -0.223,
      "rim_protector|Arrière": -0.345,
      "rim_protector|Meneur": -0.345,
      "rim_protector|Pivot": 0.457,
      "scorer_pg|Ailier fort": -0.229,
      "scorer_pg|Ailier shooteur": 0.142,
      "scorer_pg|Arrière": 0.308,
      "scorer_pg|Meneur": 0.252,
      "scorer_pg|Pivot": -0.301,
      "scorer_sg|Ailier fort": -0.073,
      "scorer_sg|Ailier shooteur": 0.148,
      "scorer_sg|Arrière": 0.26,
      "scorer_sg|Meneur": 0.136,
      "scorer_sg|Pivot": -0.232,
      "sharpshooter|Ailier fort": -0.085,
      "sharpshooter|Ailier shooteur": 0.107,
      "sharpshooter|Arrière": 0.172,
      "sharpshooter|Meneur": 0.027,
      "sharpshooter|Pivot": -0.229,
      "shot_creator|Ailier fort": -0.158,
      "shot_creator|Ailier shooteur": 0.15,
      "shot_creator|Arrière": 0.378,
      "shot_creator|Meneur": 0.193,
      "shot_creator|Pivot": -0.311,
      "slasher_pg|Ailier fort": -0.214,
      "slasher_pg|Ailier shooteur": -0.03,
      "slasher_pg|Arrière": 0.211,
      "slasher_pg|Meneur": 0.275,
      "slasher_pg|Pivot": -0.179,
      "slasher|Ailier fort": -0.173,
      "slasher|Ailier shooteur": -0.031,
      "slasher|Arrière": 0.24,
      "slasher|Meneur": 0.242,
      "slasher|Pivot": -0.132,
      "small_ball_four|Ailier fort": -0.115,
      "small_ball_four|Ailier shooteur": 0.116,
      "small_ball_four|Arrière": 0.065,
      "small_ball_four|Meneur": 0.156,
      "small_ball_four|Pivot": -0.197,
      "stretch_five|Ailier fort": -0.033,
      "stretch_five|Ailier shooteur": 0.138,
      "stretch_five|Arrière": 0.204,
      "stretch_five|Meneur": -0.166,
      "stretch_five|Pivot": -0.099,
      "stretch_forward|Ailier fort": 0.094,
      "stretch_forward|Ailier shooteur": 0.085,
      "stretch_forward|Arrière": -0.107,
      "stretch_forward|Meneur": -0.149,
      "stretch_forward|Pivot": 0.099,
      "stretch_four|Ailier fort": 0.02,
      "stretch_four|Ailier shooteur": 0.101,
      "stretch_four|Arrière": 0.107,
      "stretch_four|Meneur": -0.124,
      "stretch_four|Pivot": -0.055,
      "three_and_d|Ailier fort": -0.153,
      "three_and_d|Ailier shooteur": 0.216,
      "three_and_d|Arrière": 0.139,
      "three_and_d|Meneur": 0.096,
      "three_and_d|Pivot": -0.277
    },
  };

  // Tendances : usage (ballon), create (pour les autres), spacing, offBall,
  // paint, perimD, rimD, reb, transition, pnr.
  const T = (usage, create, spacing, offBall, paint, perimD, rimD, reb, transition, pnr) => ({ usage, create, spacing, offBall, paint, perimD, rimD, reb, transition, pnr });

  const ROLES = {
    floor_general: {
      name: "Floor General", positions: ["Meneur"],
      essential: ["pass", "vision", "decision"], important: ["dribble", "shotCreation"], secondary: ["anticipation", "composure"],
      min: { pass: [70, 60], vision: [52, 42], decision: [50, 40] },
      desc: "Organise l'attaque et met les autres en situation.",
      tendencies: T(0.65, 0.95, 0.4, 0.2, 0.2, 0.5, 0, 0.2, 0.5, 0.8),
      offense: ["Organise l'attaque", "Lit les défenses", "Distribue sur pick & roll"], defense: ["Dirige la défense"],
      training: ["pass", "dribble"],
    },
    scorer_pg: {
      name: "Scoreur meneur", positions: ["Meneur"],
      essential: ["shotCreation", "dribble", "threePoint"], important: ["pass", "decision", "penetration"], secondary: ["speed", "endurance", "midRange"],
      min: { shotCreation: [65, 55], dribble: [65, 55], pass: [66, 56] },
      desc: "Meneur qui porte la balle, lance l'attaque et crée pour lui-même.",
      tendencies: T(0.95, 0.3, 0.5, 0.15, 0.5, 0.4, 0, 0.2, 0.6, 0.6),
      offense: ["Garde beaucoup le ballon", "Prend des tirs difficiles", "Isolations"], defense: ["Défend moins"],
      training: ["shotCreation", "dribble"],
    },
    scorer_sg: {
      name: "Scoreur arrière", positions: ["Arrière"],
      essential: ["threePoint", "shotCreation", "midRange"], important: ["penetration", "inside", "agility"], secondary: ["dribble", "freeThrow"],
      min: { threePoint: [65, 55], shotCreation: [60, 50] },
      desc: "Arrière qui marque : tir, création secondaire, attaque des closeouts et finition.",
      tendencies: T(0.85, 0.3, 0.65, 0.45, 0.45, 0.4, 0, 0.2, 0.6, 0.4),
      offense: ["Tire en sortie d'écran", "Attaque les closeouts", "Finit au cercle"], defense: ["Défense moyenne"],
      training: ["threePoint", "shotCreation"],
    },
    pass_first: {
      name: "Pass-first", positions: ["Meneur"],
      essential: ["pass", "vision"], important: ["decision", "composure"], secondary: ["dribble", "anticipation"],
      min: { pass: [72, 62], vision: [52, 42] },
      desc: "Cherche d'abord à faire marquer ses coéquipiers.",
      tendencies: T(0.45, 1, 0.35, 0.25, 0.15, 0.5, 0, 0.2, 0.55, 0.7),
      offense: ["Réduit sa consommation de possessions", "Trouve le joueur démarqué"], defense: ["Défend sur le porteur"],
      training: ["pass"],
    },
    combo_guard: {
      name: "Combo Guard", positions: ["Meneur", "Arrière"],
      essential: ["dribble", "shotCreation", "pass", "threePoint"], important: ["speed", "decision", "inside"], secondary: ["defOutside", "endurance"],
      min: { pass: [60, 50], dribble: [65, 55], shotCreation: [60, 50], threePoint: [60, 50] },
      desc: "Hybride meneur-arrière : crée, tire et partage.",
      tendencies: T(0.7, 0.6, 0.6, 0.3, 0.35, 0.5, 0, 0.2, 0.7, 0.6),
      offense: ["Alterne création et tir"], defense: ["Défend sur les deux postes extérieurs"],
      training: ["dribble", "threePoint"],
    },
    sharpshooter: {
      name: "Gâchette", positions: ["Arrière", "Ailier shooteur"],
      essential: ["threePoint"], important: ["midRange", "freeThrow", "agility"], secondary: ["endurance", "focus"],
      min: { threePoint: [72, 62] },
      desc: "Spécialiste du tir extérieur, cherche les tirs ouverts.",
      tendencies: T(0.45, 0.2, 1, 0.8, 0.05, 0.4, 0, 0.15, 0.4, 0.3),
      offense: ["Cherche les tirs ouverts", "Se déplace sans ballon", "Tir en réception"], defense: ["Défense moyenne"],
      training: ["threePoint"],
    },
    shot_creator: {
      name: "Shot Creator", positions: ["Ailier shooteur"],
      essential: ["shotCreation", "dribble", "midRange"], important: ["composure", "threePoint"], secondary: ["penetration"],
      min: { shotCreation: [68, 58], dribble: [60, 50] },
      desc: "Ailier capable de se créer son tir (isolation, mi-distance).",
      tendencies: T(0.85, 0.35, 0.55, 0.2, 0.35, 0.4, 0, 0.2, 0.5, 0.5),
      offense: ["Se crée son tir", "Tirs à mi-distance"], defense: ["Défense moyenne"],
      training: ["shotCreation", "midRange"],
    },
    slasher: {
      name: "Slasher", positions: ["Arrière", "Ailier shooteur"],
      essential: ["penetration", "acceleration"], important: ["inside", "dribble"], secondary: ["power", "speed"],
      min: { penetration: [65, 55], acceleration: [60, 50] },
      desc: "Attaque le cercle avec agressivité.",
      tendencies: T(0.7, 0.3, 0.25, 0.5, 0.85, 0.45, 0.05, 0.3, 0.85, 0.4),
      offense: ["Attaque le cercle", "Provoque des fautes", "Coupe vers le panier"], defense: ["Défense active"],
      training: ["penetration", "inside"],
    },
    // Meneur pénétrant (demande utilisateur du 2026-10-06 : « crée le
    // meneur slasher ») : attaque le cercle balle en main, mais garde une
    // passe de meneur (ressortir le ballon sur l'aide).
    slasher_pg: {
      name: "Meneur slasher", positions: ["Meneur"],
      essential: ["penetration", "acceleration", "dribble"], important: ["pass", "speed", "inside"], secondary: ["decision", "power"],
      min: { penetration: [65, 55], acceleration: [60, 50], pass: [58, 48] },
      desc: "Meneur qui attaque le cercle balle en main et ressort le ballon sur l'aide.",
      tendencies: T(0.8, 0.5, 0.25, 0.3, 0.85, 0.45, 0.05, 0.25, 0.9, 0.6),
      offense: ["Attaque le cercle", "Provoque des fautes", "Ressort sur l'aide"], defense: ["Défense active"],
      training: ["penetration", "dribble"],
    },
    three_and_d: {
      name: "3&D", positions: ["Arrière", "Ailier shooteur"],
      essential: ["threePoint", "defOutside"], important: ["steal", "agility", "anticipation"], secondary: ["endurance"],
      min: { threePoint: [65, 55], defOutside: [65, 55] },
      desc: "Défenseur extérieur et spécialiste du tir : défense et écartement.",
      tendencies: T(0.35, 0.2, 0.9, 0.75, 0.1, 0.95, 0.05, 0.25, 0.5, 0.2),
      offense: ["Cherche les corners", "Prend des tirs ouverts", "Ne monopolise pas le ballon"], defense: ["Défend sur le meilleur extérieur"],
      training: ["threePoint", "defOutside"],
    },
    stretch_forward: {
      name: "Faux 4", positions: ["Ailier shooteur", "Ailier fort"],
      essential: ["threePoint", "rebound"], important: ["defInside", "agility"], secondary: ["strength", "defOutside"],
      min: { threePoint: [62, 52], rebound: [55, 45] },
      desc: "Ailier utilisé comme intérieur léger qui écarte le jeu.",
      tendencies: T(0.4, 0.25, 0.8, 0.6, 0.3, 0.6, 0.3, 0.55, 0.6, 0.4),
      offense: ["Étire la défense depuis le poste 4"], defense: ["Défend sur les intérieurs mobiles"],
      training: ["threePoint", "rebound"],
    },
    point_forward: {
      name: "Point Forward", positions: ["Ailier shooteur", "Ailier fort"],
      essential: ["pass", "vision", "dribble"], important: ["decision"], secondary: ["shotCreation"],
      min: { pass: [65, 55], dribble: [60, 50] },
      desc: "Ailier capable d'organiser le jeu.",
      tendencies: T(0.65, 0.85, 0.4, 0.3, 0.35, 0.5, 0.1, 0.35, 0.6, 0.6),
      offense: ["Organise depuis l'aile", "Passes vers les tireurs"], defense: ["Défense polyvalente"],
      training: ["pass", "dribble"],
    },
    stretch_four: {
      name: "Stretch 4", positions: ["Ailier fort"],
      essential: ["threePoint"], important: ["midRange", "rebound"], secondary: ["defInside", "agility"],
      min: { threePoint: [65, 55] },
      desc: "Intérieur capable de tirer à 3 points.",
      tendencies: T(0.45, 0.2, 0.9, 0.55, 0.15, 0.3, 0.3, 0.5, 0.35, 0.75),
      offense: ["Pick & pop", "Écarte la raquette"], defense: ["Défense intérieure moyenne"],
      training: ["threePoint", "midRange"],
    },
    inside_four: {
      name: "Inside 4", positions: ["Ailier fort", "Pivot"],
      essential: ["inside", "rebound"], important: ["power", "strength"], secondary: ["defInside"],
      min: { inside: [62, 52], rebound: [60, 50] },
      desc: "Joue principalement près du cercle.",
      tendencies: T(0.55, 0.15, 0.05, 0.3, 0.95, 0.2, 0.45, 0.75, 0.3, 0.45),
      offense: ["Poste bas", "Rebond offensif"], defense: ["Défend au contact"],
      training: ["inside", "rebound"],
    },
    defensive_four: {
      name: "Défenseur", positions: ["Ailier fort"],
      essential: ["defInside", "defOutside"], important: ["block", "agility"], secondary: ["anticipation", "discipline"],
      min: { defInside: [62, 52], defOutside: [58, 48] },
      desc: "Spécialiste défensif et polyvalent.",
      tendencies: T(0.25, 0.2, 0.3, 0.45, 0.4, 0.75, 0.65, 0.55, 0.45, 0.3),
      offense: ["Peu de ballons"], defense: ["Change sur les écrans", "Aide en défense"],
      training: ["defInside", "defOutside"],
    },
    small_ball_four: {
      name: "Small Ball 4", positions: ["Ailier fort", "Pivot"],
      essential: ["speed", "agility"], important: ["rebound", "defOutside"], secondary: ["threePoint"],
      min: { speed: [62, 52], agility: [62, 52] },
      desc: "Profil mobile qui accélère le jeu.",
      tendencies: T(0.45, 0.3, 0.55, 0.6, 0.4, 0.65, 0.3, 0.5, 0.9, 0.5),
      offense: ["Course en transition"], defense: ["Change sur tous les postes"],
      training: ["agility", "rebound"],
    },
    playmaking_four: {
      name: "Playmaking 4", positions: ["Ailier fort"],
      essential: ["pass", "vision"], important: ["dribble", "decision"], secondary: ["midRange"],
      min: { pass: [65, 55] },
      desc: "Ailier fort capable de créer du jeu.",
      tendencies: T(0.55, 0.75, 0.45, 0.35, 0.4, 0.35, 0.3, 0.45, 0.45, 0.65),
      offense: ["Passes depuis le poste haut"], defense: ["Défense intérieure moyenne"],
      training: ["pass"],
    },
    rim_protector: {
      name: "Rim Protector", positions: ["Pivot", "Ailier fort"],
      essential: ["block", "defInside"], important: ["vertical", "anticipation"], secondary: ["rebound"],
      min: { block: [65, 55], defInside: [60, 50] },
      desc: "Spécialiste défensif près du cercle.",
      tendencies: T(0.25, 0.1, 0.05, 0.4, 0.6, 0.15, 1, 0.75, 0.3, 0.5),
      offense: ["Peu de ballons", "Finit près du cercle"], defense: ["Protège le cercle", "Dissuade les pénétrations"],
      training: ["block", "defInside"],
    },
    interior_scorer: {
      name: "Interior Scorer", positions: ["Pivot", "Ailier fort"],
      essential: ["inside"], important: ["power", "strength"], secondary: ["freeThrow"],
      min: { inside: [68, 58] },
      desc: "Marque principalement dans la raquette.",
      tendencies: T(0.7, 0.15, 0.05, 0.2, 1, 0.1, 0.45, 0.6, 0.2, 0.45),
      offense: ["Poste bas", "Demande le ballon près du cercle"], defense: ["Défense statique"],
      training: ["inside"],
    },
    stretch_five: {
      name: "Stretch 5", positions: ["Pivot"],
      essential: ["threePoint"], important: ["midRange"], secondary: ["defInside", "rebound"],
      min: { threePoint: [65, 55] },
      desc: "Pivot capable de tirer de loin.",
      tendencies: T(0.45, 0.2, 0.85, 0.5, 0.15, 0.2, 0.4, 0.5, 0.3, 0.75),
      offense: ["Pick & pop", "Sort le pivot adverse de la raquette"], defense: ["Protection du cercle limitée"],
      training: ["threePoint"],
    },
    rebounder: {
      name: "Rebounder", positions: ["Pivot", "Ailier fort"],
      essential: ["rebound"], important: ["strength", "vertical"], secondary: ["determination"],
      min: { rebound: [68, 58] },
      desc: "Spécialiste du rebond.",
      tendencies: T(0.3, 0.1, 0.05, 0.35, 0.75, 0.15, 0.6, 1, 0.35, 0.35),
      offense: ["Rebond offensif", "Secondes chances"], defense: ["Boxe et prend le rebond"],
      training: ["rebound"],
    },
    point_center: {
      name: "Point Center", positions: ["Pivot"],
      essential: ["pass", "vision"], important: ["decision"], secondary: ["inside"],
      min: { pass: [65, 55] },
      desc: "Pivot qui distribue depuis le poste haut.",
      tendencies: T(0.55, 0.8, 0.25, 0.3, 0.5, 0.15, 0.45, 0.55, 0.3, 0.7),
      offense: ["Passes depuis le poste haut", "Relais du jeu"], defense: ["Défense intérieure moyenne"],
      training: ["pass", "inside"],
    },
    lob_threat: {
      name: "Lob Threat", positions: ["Pivot", "Ailier fort"],
      essential: ["vertical", "inside"], important: ["acceleration", "agility"], secondary: ["power"],
      min: { vertical: [68, 58], inside: [60, 50] },
      desc: "Très dangereux sur pick & roll et au-dessus du cercle.",
      tendencies: T(0.35, 0.1, 0.05, 0.85, 0.85, 0.2, 0.6, 0.6, 0.75, 1),
      offense: ["Plonge vers le cercle", "Finit les lobs"], defense: ["Contres en aide"],
      training: ["inside", "block"],
    },
  };

  // Compatibilité entre deux rôles : -3 (très mauvaise) à +3 (excellente),
  // avec la raison affichée au manager. Paires non listées : déduites des
  // tendances (pairScore).
  const PAIRS = [
    ["pass_first", "sharpshooter", 3, "Le meneur crée des tirs ouverts pour la Gâchette."],
    ["floor_general", "sharpshooter", 3, "Le meneur organisateur alimente la Gâchette."],
    ["scorer_pg", "sharpshooter", -1, "Le meneur garde le ballon : la Gâchette reçoit peu de tirs."],
    ["pass_first", "slasher", 2, "Le meneur trouve le Slasher en coupe."],
    ["scorer_pg", "scorer_sg", -2, "Deux joueurs qui ont besoin du ballon."],
    ["scorer_pg", "shot_creator", -2, "Deux créateurs pour un seul ballon."],
    ["scorer_sg", "shot_creator", -1, "Deux créateurs pour un seul ballon."],
    ["shot_creator", "shot_creator", -2, "Deux créateurs pour un seul ballon."],
    ["three_and_d", "scorer_pg", 3, "Le 3&D défend et écarte sans réclamer le ballon."],
    ["three_and_d", "scorer_sg", 2, "Le 3&D défend et écarte sans réclamer le ballon."],
    ["three_and_d", "shot_creator", 3, "Le 3&D défend et écarte sans réclamer le ballon."],
    ["three_and_d", "pass_first", 2, "Le meneur trouve le 3&D dans le corner."],
    ["stretch_forward", "rim_protector", 2, "Le Faux 4 écarte, le pivot protège le cercle."],
    ["stretch_forward", "stretch_four", 3, "Écartement maximal autour du cercle."],
    ["inside_four", "interior_scorer", -1, "Deux joueurs dans la raquette : congestion."],
    ["inside_four", "inside_four", -1, "Deux joueurs dans la raquette : congestion."],
    ["stretch_four", "interior_scorer", 3, "Le Stretch 4 libère la raquette pour le pivot."],
    ["stretch_four", "rim_protector", 2, "Écartement en attaque, cercle protégé en défense."],
    ["point_forward", "sharpshooter", 3, "Le Point Forward trouve la Gâchette."],
    ["scorer_pg", "lob_threat", 2, "Pick & roll : le créateur attire, le pivot finit."],
    ["pass_first", "lob_threat", 3, "Pick & roll : passe lobée pour le pivot."],
    ["floor_general", "lob_threat", 3, "Pick & roll : passe lobée pour le pivot."],
    ["slasher", "slasher", -1, "Deux Slashers : la raquette se bouche."],
    ["slasher_pg", "slasher", -1, "Deux Slashers : la raquette se bouche."],
    ["slasher_pg", "interior_scorer", -1, "Le Slasher et le pivot se disputent la raquette."],
    ["slasher_pg", "inside_four", -1, "Le Slasher et le pivot se disputent la raquette."],
    ["slasher_pg", "stretch_five", 3, "Le Stretch 5 vide la raquette pour le Slasher."],
    ["slasher_pg", "stretch_four", 2, "Le Stretch 4 vide la raquette pour le Slasher."],
    ["slasher_pg", "sharpshooter", 2, "Le meneur pénètre et ressort pour la Gâchette."],
    ["slasher_pg", "three_and_d", 2, "Le meneur pénètre et ressort pour le 3&D dans le corner."],
    ["slasher_pg", "lob_threat", 2, "Pick & roll : le meneur attaque, le pivot finit."],
    ["slasher_pg", "scorer_sg", -1, "Deux joueurs qui ont besoin du ballon."],
    ["slasher", "interior_scorer", -1, "Le Slasher et le pivot se disputent la raquette."],
    ["stretch_five", "slasher", 2, "Le Stretch 5 vide la raquette pour le Slasher."],
    ["point_center", "sharpshooter", 2, "Le pivot passeur sert les tireurs."],
    ["rebounder", "scorer_pg", 1, "Le rebondeur rattrape les tirs difficiles."],
    ["pass_first", "scorer_sg", 3, "Le meneur trouve l'arrière scoreur en rythme."],
    ["floor_general", "scorer_sg", 3, "Le meneur trouve l'arrière scoreur en rythme."],
  ];
  const pairIndex = new Map();
  PAIRS.forEach(([a, b, s, why]) => { pairIndex.set(`${a}|${b}`, { score: s, reason: why }); pairIndex.set(`${b}|${a}`, { score: s, reason: why }); });

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = v => (typeof v === "number" && isFinite(v) ? v : null);
  // Poids dérivés des rangs (essentielle / importante / secondaire).
  function weightsOf(role) {
    const w = {};
    ["secondary", "important", "essential"].forEach(t => (role[t] || []).forEach(k => { w[k] = CONFIG.tierWeights[t]; }));
    return w;
  }
  Object.keys(ROLES).forEach(id => { ROLES[id].weights = weightsOf(ROLES[id]); });
  function avgOf(attrs) {
    const vals = Object.values(attrs || {}).filter(v => typeof v === "number");
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 50;
  }
  function keyAverage(role, attrs) {
    if (!role.weights) role.weights = weightsOf(role);
    let s = 0, w = 0;
    Object.keys(role.weights).forEach(k => { const v = num(attrs[k]); if (v == null) return; s += v * role.weights[k]; w += role.weights[k]; });
    return w ? s / w : null;
  }

  // Maîtrise de chaque (rôle, poste). Correctifs du 2026-10-06 (audit :
  // 43,6 % des joueurs avec une incohérence) — quatre composantes séparées
  // et lisibles (`detail`) :
  //   base       : SPÉCIALISATION (relief des caractéristiques du rôle par
  //                rapport au niveau du joueur, comparé au relief habituel à
  //                ce poste) + CAPACITÉ (part du niveau du joueur) ;
  //   essential  : +essentialBonus si toutes les caractéristiques
  //                essentielles passent leur seuil souple ;
  //   weak       : pénalité pour chaque essentielle sous son seuil souple,
  //                plus lourde sous le seuil dur (un Scoreur meneur sans
  //                dribble n'est pas un Scoreur meneur, même très fort) ;
  //   position   : modificateur de poste (poste de carte, poste jouable, ou
  //                distance au plus proche poste jouable).
  // `neutral` : même maîtrise SANS la part du niveau (adéquation pure au
  // rôle) — utilisée par la cohésion du cinq, pour ne pas compter le talent
  // deux fois (il pèse déjà dans le match par les caractéristiques).
  // `positionRatings` : { poste: note } (facultatif) ; `cardPosition` :
  // poste de carte (facultatif).
  function thresholdScale(attrs) {
    const vals = Object.values(attrs || {}).filter(v => typeof v === "number").sort((a, b) => b - a).slice(0, 8);
    if (!vals.length) return 1;
    return clamp(vals.reduce((s, v) => s + v, 0) / vals.length / CONFIG.thresholdRef, 0.2, 1);
  }
  function essentialCheck(role, attrs, scale) {
    let weak = 0;
    const below = [];
    Object.keys(role.min || {}).forEach(k => {
      const v = num(attrs[k]);
      if (v == null) return;
      const soft = role.min[k][0] * scale, hard = role.min[k][1] * scale;
      if (v >= soft) return;
      // Points manquants ramenés à l'échelle d'un joueur de haut niveau
      // (5 points manquent autant à un jeune à 30 qu'à un titulaire à 75).
      let pen = CONFIG.softPenalty + (soft - v) / scale * CONFIG.softSlope;
      if (v < hard) pen += CONFIG.hardPenalty + (hard - v) / scale * CONFIG.hardSlope;
      weak += pen;
      below.push({ attr: k, value: v, soft: Math.round(soft), hard: Math.round(hard), hardMissed: v < hard });
    });
    const essential = Object.keys(role.min || {}).length && !below.length ? CONFIG.essentialBonus : 0;
    return { essential, weak: Math.round(weak * 10) / 10, below };
  }
  // Relief habituel d'un rôle chez les joueurs du poste `refPos` (moyenne
  // des cinq postes sans poste connu).
  function baselineOf(id, refPos) {
    const b = CONFIG.baselines;
    if (refPos && typeof b[`${id}|${refPos}`] === "number") return b[`${id}|${refPos}`];
    const vals = POSITIONS.map(p => b[`${id}|${p}`]).filter(v => typeof v === "number");
    return vals.length ? vals.reduce((s2, v) => s2 + v, 0) / vals.length : 0;
  }
  function positionDistance(pos, own) {
    const i = POSITIONS.indexOf(pos);
    return Math.min(...own.map(p => Math.abs(POSITIONS.indexOf(p) - i)));
  }
  function positionModifier(pos, own, cardPosition, positionRatings) {
    if (!own || !own.length) return 0;
    const M = CONFIG.positionModifiers;
    if (pos === cardPosition) return M.card;
    if (own.includes(pos)) return M.playable;
    const d = positionDistance(pos, own);
    const byDistance = d <= 1 ? M.dist1 : d === 2 ? M.dist2 : M.dist3;
    // … et selon l'écart réel de note à ce poste (un meneur à 65 et 54 en
    // ailier n'est pas un ailier, quel que soit son profil).
    const pr = positionRatings || null;
    const best = pr ? Math.max(...POSITIONS.map(p => num(pr[p]) || 0)) : 0;
    const gapPct = best > 0 ? Math.max(0, (best - (num(pr[pos]) || 0)) / best * 100) : 0;
    return Math.round(Math.min(byDistance, -CONFIG.positionGapSlope * gapPct));
  }
  // Courbe de saturation au-dessus de CONFIG.saturateFrom (monotone : ne
  // change jamais l'ordre de deux rôles) : sans elle, les profils très
  // marqués finissaient tous à 99 et l'on ne distinguait plus 3 rôles forts.
  function saturate(m) {
    const k = CONFIG.saturateFrom, room = 99 - k;
    return m <= k ? m : k + room * Math.tanh((m - k) / room);
  }
  function roleFits(attrs, positionRatings, cardPosition) {
    if (!attrs || typeof attrs !== "object") return [];
    const overall = avgOf(attrs);
    const scale = thresholdScale(attrs);
    const own = positionsOf(positionRatings || null, cardPosition || null);
    // Poste de référence du joueur : son poste de carte, sinon son meilleur poste.
    const refPos = cardPosition || (positionRatings ? POSITIONS.slice().sort((x, y) => (num(positionRatings[y]) || 0) - (num(positionRatings[x]) || 0))[0] : null);
    const out = [];
    Object.keys(ROLES).forEach(id => {
      const role = ROLES[id];
      const key = keyAverage(role, attrs);
      if (key == null) return;
      const shape = overall > 0 ? key / overall - 1 : 0; // relief relatif : identique à toutes les divisions
      const ess = essentialCheck(role, attrs, scale);
      const level = CONFIG.levelWeight * (overall - 50);
      role.positions.forEach(pos => {
        const baseline = baselineOf(id, refPos);
        const spec = CONFIG.shapeWeight * (shape - CONFIG.baselineWeight * (typeof baseline === "number" ? baseline : 0));
        const posMod = positionModifier(pos, own, cardPosition, positionRatings);
        const raw = CONFIG.masteryBase + spec + level + ess.essential - ess.weak;
        const mastery = clamp(Math.round(saturate(raw + posMod)), 1, 99);
        const neutral = clamp(Math.round(saturate(raw - level + posMod)), 1, 99);
        const playable = !own || own.includes(pos);
        out.push({
          role: id, name: role.name, position: pos, mastery, neutral,
          posFit: playable ? 1 : 0.5,
          detail: {
            roleScore: mastery,
            withoutPosition: clamp(Math.round(saturate(raw)), 1, 99),
            positionModifier: posMod,
            essentialModifier: ess.essential,
            weakAttributePenalty: -ess.weak,
            specialization: Math.round(spec * 10) / 10,
            capacity: Math.round(key),
            level: Math.round(level * 10) / 10,
            below: ess.below,
          },
        });
      });
    });
    return out.sort((a, b) => b.mastery - a.mastery);
  }

  // Rôle principal + rôles secondaires (autres rôles, ou même rôle à un
  // autre poste) à moins de secondaryGap points et au-dessus de secondaryMin.
  function identityScore(f, cardPosition) {
    return f.mastery + (cardPosition && f.position === cardPosition ? CONFIG.cardPositionBonus : 0);
  }
  // Postes jouables : le poste de carte et les postes voisins où sa note est
  // à moins de positionsGap (relatif) de son meilleur poste.
  function positionsOf(positionRatings, cardPosition) {
    if (!positionRatings) return cardPosition ? [cardPosition] : null;
    const best = Math.max(...POSITIONS.map(p => num(positionRatings[p]) || 0));
    // Un poste jouable est voisin du poste de carte (un meneur aux notes
    // encore plates n'est pas « jouable » pivot).
    const ci = POSITIONS.indexOf(cardPosition);
    return POSITIONS.filter((p, i) => p === cardPosition || ((ci < 0 || Math.abs(i - ci) <= CONFIG.positionsReach) && (num(positionRatings[p]) || 0) >= best * (1 - CONFIG.positionsGap)));
  }
  // `cardPosition` (facultatif) : poste de carte du joueur.
  function profileOf(attrs, positionRatings, max = 4, cardPosition = null) {
    const fits = roleFits(attrs, positionRatings, cardPosition);
    if (!fits.length) return null;
    const top = fits[0].mastery;
    // Rôle principal : le mieux maîtrisé à SES postes (poste de carte et
    // postes où il est à moins de positionsGap points de son meilleur poste),
    // léger avantage au poste de carte.
    const own = positionsOf(positionRatings, cardPosition);
    const pool = own ? fits.filter(f => own.includes(f.position)) : fits.filter(f => f.mastery >= top - CONFIG.identityWindow && f.posFit >= CONFIG.identityPosFit);
    const primary = (pool.length ? pool : fits).slice().sort((a, b) => identityScore(b, cardPosition) - identityScore(a, cardPosition))[0];
    const secondary = fits.filter(f => f !== primary && f.mastery >= CONFIG.secondaryMin && primary.mastery - f.mastery <= CONFIG.secondaryGap)
      .sort((a, b) => identityScore(b, cardPosition) - identityScore(a, cardPosition));
    const shown = [primary].concat(fits.filter(f => f !== primary && (own ? own.includes(f.position) : f.posFit >= CONFIG.identityPosFit))).slice(0, max);
    return { primary, secondary, fits: shown, role: ROLES[primary.role], positions: own || [primary.position] };
  }

  // Forces et faiblesses lisibles (familles de jeu), comparées au niveau
  // du joueur lui-même.
  const SKILL_GROUPS = [
    ["Tir extérieur", ["threePoint", "midRange"]],
    ["Défense extérieure", ["defOutside", "steal"]],
    ["Jeu sans ballon", ["agility", "anticipation", "decision"]],
    ["Création", ["shotCreation", "dribble"]],
    ["Passe", ["pass", "vision"]],
    ["Attaque du cercle", ["penetration", "acceleration"]],
    ["Jeu intérieur", ["inside", "power"]],
    ["Rebond", ["rebound", "strength"]],
    ["Protection du cercle", ["block", "defInside"]],
    ["Athlétisme", ["speed", "vertical"]],
  ];
  function strengthsOf(attrs, n = 3) {
    if (!attrs) return { strengths: [], weaknesses: [] };
    const overall = avgOf(attrs);
    const rows = SKILL_GROUPS.map(([label, keys]) => {
      const vals = keys.map(k => num(attrs[k])).filter(v => v != null);
      return { label, gap: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length - overall : 0 };
    });
    return {
      strengths: rows.filter(r => r.gap >= CONFIG.strengthGap).sort((a, b) => b.gap - a.gap).slice(0, n).map(r => r.label),
      weaknesses: rows.filter(r => r.gap <= -CONFIG.strengthGap).sort((a, b) => a.gap - b.gap).slice(0, 2).map(r => r.label),
    };
  }

  // Compatibilité de deux rôles (-3 à +3) : la matrice d'abord, sinon une
  // estimation par les tendances (deux joueurs qui veulent le ballon, deux
  // joueurs dans la raquette, création pour un tireur…).
  function pairScore(a, b) {
    const hit = pairIndex.get(`${a}|${b}`);
    if (hit) return hit;
    const ta = ROLES[a] && ROLES[a].tendencies, tb = ROLES[b] && ROLES[b].tendencies;
    if (!ta || !tb) return { score: 0, reason: null };
    let s = 0, reason = null;
    const ball = Math.max(0, ta.usage + tb.usage - 1.5) * 4;
    const paint = Math.max(0, ta.paint + tb.paint - 1.6) * 4;
    s -= ball + paint;
    s += (ta.create * tb.spacing + tb.create * ta.spacing) * 1.5;
    s += (ta.spacing + tb.spacing > 1.3 ? 0.5 : 0);
    const score = clamp(Math.round(s), -3, 3);
    if (score < 0) reason = ball >= paint ? "Deux joueurs qui ont besoin du ballon." : "Deux joueurs dans la raquette : congestion.";
    return { score, reason };
  }

  // ---------------------------------------------------------------------
  // Phase 2 : cohérence d'un cinq (titulaires à leurs postes).
  // `slots` : [{ pos, attrs, positionRatings, name, id }] (5 joueurs). Le
  // rôle d'un joueur dans le cinq = son rôle le mieux maîtrisé AU POSTE qu'il
  // occupe. Renvoie { slots, offense, defense, overall, notes, pairs }.
  const COHESION = {
    // Seuils calés sur les cinq majeurs de clubs générés (2026-10-06) : une
    // alerte concerne environ un cinq sur dix.
    offenseBase: 70, pairWeight: 4.5,
    usageMax: 2.65, usageMin: 1.8, usagePenalty: 14,
    creatorMin: 0.3, noCreatorPenalty: 8,
    spacingMin: 1.15, spacingPenalty: 14, spacingGood: 1.7, spacingBonus: 4,
    paintMax: 2, paintPenalty: 8,
    defenseBase: 66, rimWeight: 26, perimWeight: 60, rebWeight: 5,
    rimLow: 0.38, rimGood: 0.75, perimLow: 0.25, perimGood: 0.34,
    offenseShare: 0.55,
  };
  const NOTES = {
    usageHigh: "Trop de joueurs ont besoin du ballon : moins de tirs pour chacun.",
    usageLow: "Personne ne prend l'attaque à son compte.",
    noCreator: "Personne ne crée des tirs pour les autres.",
    lowSpacing: "Manque d'écartement : la défense resserre la raquette.",
    goodSpacing: "Bon écartement : plusieurs tireurs extérieurs.",
    crowdedPaint: "Raquette encombrée : trop de joueurs jouent près du cercle.",
    noRim: "Pas de protection du cercle.",
    goodRim: "Cercle bien protégé.",
    weakPerim: "Défense extérieure fragile.",
    goodPerim: "Bonne défense sur les extérieurs.",
  };
  function slotRole(slot) {
    const fits = roleFits(slot.attrs, slot.positionRatings, slot.position).filter(f => f.position === slot.pos);
    return fits.length ? fits[0] : null;
  }
  function lineupCohesion(slots) {
    const rows = (slots || []).filter(s => s && s.attrs).map(s => ({ ...s, fit: slotRole(s) })).filter(s => s.fit);
    if (rows.length < 2) return null;
    const tOf = r => ROLES[r.fit.role].tendencies;
    // Maîtrise NEUTRE (sans le niveau) : le talent pèse déjà en match.
    const w = r => clamp(r.fit.neutral / 100, 0.3, 1);
    const notes = [];
    const flagged = new Set();
    // Paires.
    const pairs = [];
    let pairSum = 0;
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const ps = pairScore(a.fit.role, b.fit.role);
      const val = ps.score * (w(a) + w(b)) / 2;
      pairSum += val;
      pairs.push({ a: a.pos, b: b.pos, score: ps.score });
      if (ps.score <= -1 && ps.reason) { flagged.add(a.pos); flagged.add(b.pos); notes.push({ tone: "warn", who: [a.name, b.name], text: ps.reason }); }
      else if (ps.score >= 3 && ps.reason) notes.push({ tone: "ok", who: [a.name, b.name], text: ps.reason });
    }
    const sum = k => rows.reduce((s2, r) => s2 + tOf(r)[k] * w(r), 0);
    const C = COHESION;
    let offense = C.offenseBase + C.pairWeight * pairSum / Math.max(1, rows.length - 1);
    const usage = sum("usage");
    if (usage > C.usageMax) { offense -= C.usagePenalty * (usage - C.usageMax); notes.push({ tone: "warn", text: NOTES.usageHigh }); rows.filter(r => tOf(r).usage >= 0.7).forEach(r => flagged.add(r.pos)); }
    const creator = Math.max(...rows.map(r => tOf(r).create * w(r)));
    if (usage < C.usageMin && creator < 0.6) { offense -= C.usagePenalty * (C.usageMin - usage); notes.push({ tone: "warn", text: NOTES.usageLow }); }
    if (creator < C.creatorMin) { offense -= C.noCreatorPenalty; notes.push({ tone: "warn", text: NOTES.noCreator }); }
    const spacing = sum("spacing");
    if (spacing < C.spacingMin) { offense -= C.spacingPenalty * (C.spacingMin - spacing); notes.push({ tone: "warn", text: NOTES.lowSpacing }); }
    else if (spacing >= C.spacingGood) { offense += C.spacingBonus; notes.push({ tone: "ok", text: NOTES.goodSpacing }); }
    const paint = rows.filter(r => tOf(r).paint >= 0.8).length;
    if (paint > C.paintMax) { offense -= C.paintPenalty * (paint - C.paintMax); notes.push({ tone: "warn", text: NOTES.crowdedPaint }); rows.filter(r => tOf(r).paint >= 0.8).forEach(r => flagged.add(r.pos)); }
    // Défense.
    const rim = Math.max(...rows.map(r => tOf(r).rimD * w(r)));
    const perim = rows.reduce((s2, r) => s2 + tOf(r).perimD * w(r), 0) / rows.length;
    const reb = sum("reb");
    let defense = C.defenseBase + C.rimWeight * (rim - 0.5) + C.perimWeight * (perim - 0.29) + C.rebWeight * (reb - 2);
    if (rim < C.rimLow) notes.push({ tone: "warn", text: NOTES.noRim }); else if (rim >= C.rimGood) notes.push({ tone: "ok", text: NOTES.goodRim });
    if (perim < C.perimLow) notes.push({ tone: "warn", text: NOTES.weakPerim }); else if (perim >= C.perimGood) notes.push({ tone: "ok", text: NOTES.goodPerim });
    offense = clamp(Math.round(offense), 20, 99);
    defense = clamp(Math.round(defense), 20, 99);
    const overall = Math.round(C.offenseShare * offense + (1 - C.offenseShare) * defense);
    notes.sort((a, b) => (a.tone === "warn" ? 0 : 1) - (b.tone === "warn" ? 0 : 1));
    return {
      offense, defense, overall, notes, pairs,
      slots: rows.map(r => ({ pos: r.pos, id: r.id, name: r.name, role: r.fit.role, roleName: r.fit.name, mastery: r.fit.mastery, neutral: r.fit.neutral, warn: flagged.has(r.pos) })),
    };
  }
  // Compatibilité d'un joueur avec un cinq : cohérence du cinq s'il prend la
  // place du titulaire au poste où il s'intègre le mieux (parmi ses postes).
  // `five` : slots du cinq actuel ; `cand` : { attrs, positionRatings, name,
  // id, position }. Renvoie { value, pos, before, after, replaced } ou null.
  function compatibilityWith(five, cand) {
    if (!five || !cand || !cand.attrs) return null;
    const before = lineupCohesion(five);
    if (!before) return null;
    const mine = five.find(s => s && s.id != null && s.id === cand.id);
    if (mine) return { value: before.overall, pos: mine.pos, before: before.overall, after: before.overall, replaced: null, starter: true };
    let best = null;
    (positionsOf(cand.positionRatings, cand.position) || [cand.position]).forEach(pos => {
      const slots = five.map(s => (s.pos === pos ? { ...cand, pos } : s));
      const c = lineupCohesion(slots);
      if (c && (!best || c.overall > best.after)) best = { value: c.overall, pos, before: before.overall, after: c.overall, replaced: (five.find(s => s.pos === pos) || {}).name || null, starter: false, cohesion: c };
    });
    return best;
  }

  // ---------------------------------------------------------------------
  // Phase 4 : rôle PRÉFÉRÉ (« ce joueur aime jouer ce rôle »), distinct du
  // rôle qu'il maîtrise le mieux. Stable pour un joueur (tirage déterminé par
  // son ID) : son rôle principal 2 fois sur 3, sinon son deuxième rôle le
  // mieux maîtrisé à ses postes s'il est à moins de 15 points.
  function stableUnit(id) {
    let h = 2166136261;
    const str = String(id);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  function preferredRole(attrs, positionRatings, cardPosition, id) {
    const prof = profileOf(attrs, positionRatings, 6, cardPosition);
    if (!prof) return null;
    const second = prof.fits.find(f => f !== prof.primary && f.role !== prof.primary.role && prof.primary.mastery - f.mastery <= CONFIG.secondaryGap);
    return second && stableUnit(id) >= 2 / 3 ? second : prof.primary;
  }
  // Rôle joué à un poste du cinq comparé au rôle préféré : null si tout va
  // bien, sinon { kind: "usage" (moins de ballons qu'il ne voudrait) |
  // "role", preferred, played }.
  function roleMismatch(attrs, positionRatings, cardPosition, id, slotPos) {
    const pref = preferredRole(attrs, positionRatings, cardPosition, id);
    const played = roleFits(attrs, positionRatings, cardPosition).filter(f => f.position === slotPos)[0];
    if (!pref || !played || pref.role === played.role) return null;
    const tp = ROLES[pref.role].tendencies, tq = ROLES[played.role].tendencies;
    if (pref.mastery - played.mastery < 8 && tp.usage - tq.usage < 0.25) return null;
    return { kind: tp.usage - tq.usage >= 0.25 ? "usage" : "role", preferred: pref, played };
  }

  // ---------------------------------------------------------------------
  // Phase 5 : tactiques et rôles. Chaque priorité offensive (OFFENSE_PROFILES
  // du moteur) et le rythme « Rapide » s'appuient sur des tendances du cinq ;
  // score 0-100 (50 = neutre). Configurable ici.
  const avgT = (rows, k) => rows.reduce((s2, r) => s2 + r.t[k] * r.m, 0) / rows.length;
  const maxT = (rows, k, filter) => Math.max(0, ...rows.filter(filter || (() => true)).map(r => r.t[k] * r.m));
  const isGuard = r => r.pos === "Meneur" || r.pos === "Arrière";
  const isBig = r => r.pos === "Ailier fort" || r.pos === "Pivot";
  const TACTICS = {
    "Pick & Roll": { label: "Pick & Roll", fit: rows => (maxT(rows, "pnr", isGuard) * 0.5 + maxT(rows, "create", isGuard) * 0.5 + maxT(rows, "pnr", isBig)) / 2 },
    "Jeu extérieur": { label: "Jeu extérieur", fit: rows => avgT(rows, "spacing") * 1.6 },
    "Tirs rapides": { label: "Tirs rapides", fit: rows => (avgT(rows, "spacing") * 1.3 + avgT(rows, "transition") * 0.5) },
    "Jeu en mouvement": { label: "Jeu en mouvement", fit: rows => (avgT(rows, "offBall") + avgT(rows, "create") + avgT(rows, "spacing")) / 1.8 },
    "Transition rapide": { label: "Transition rapide", fit: rows => avgT(rows, "transition") * 1.5 },
    "Jeu intérieur": { label: "Jeu intérieur", fit: rows => (maxT(rows, "paint", isBig) + avgT(rows, "paint")) / 1.4 },
    "Post-up": { label: "Post-up", fit: rows => (maxT(rows, "paint", isBig) * 1.2 + maxT(rows, "usage", isBig) * 0.6) / 1.6 },
    "Jeu en pénétration": { label: "Jeu en pénétration", fit: rows => (maxT(rows, "paint", isGuard) + avgT(rows, "spacing")) / 1.2 },
    "Isolation": { label: "Isolation", fit: rows => maxT(rows, "usage") * 0.9 },
    "Équilibrée": { label: "Équilibrée", fit: () => 0.5 },
  };
  // Normalisation (cinq de clubs générés, maîtrise neutre, 2026-10-06) : [médiane, demi-écart
  // p10-p90] du score brut ; un cinq moyen vaut 50, un sur dix < 35 ou > 65.
  const TACTIC_NORMS = {
    "Pick & Roll": [42, 11], "Jeu extérieur": [47, 12.5], "Tirs rapides": [58, 9], "Jeu en mouvement": [46, 7],
    "Transition rapide": [59, 9.5], "Jeu intérieur": [94, 14], "Post-up": [82, 16], "Jeu en pénétration": [73, 14.5],
    "Isolation": [61, 8.5], "Rapide": [59, 9.5], "Lent": [54, 5.5],
  };
  const normTactic = (key, raw) => {
    const n = TACTIC_NORMS[key];
    return n ? clamp(Math.round(50 + (raw - n[0]) * 15 / n[1]), 5, 95) : raw;
  };
  const RHYTHM_FIT = { "Rapide": rows => avgT(rows, "transition") * 1.5, "Lent": rows => (1 - avgT(rows, "transition")) * 0.9 };
  // `slots` : comme lineupCohesion ; `priorities` : tableau de priorités
  // offensives ; `rhythm` : "Lent" | "Normal" | "Rapide".
  function tacticalFit(slots, priorities, rhythm) {
    const rows = (slots || []).filter(sl => sl && sl.attrs).map(sl => {
      const f = slotRole(sl);
      return f ? { pos: sl.pos, t: ROLES[f.role].tendencies, m: clamp(f.neutral / 100, 0.3, 1) } : null;
    }).filter(Boolean);
    if (rows.length < 2) return null;
    const list = (priorities || []).filter(k => TACTICS[k]);
    const parts = list.map(k => ({ key: k, score: normTactic(k, TACTICS[k].fit(rows) * 100) }));
    if (RHYTHM_FIT[rhythm]) parts.push({ key: `Rythme ${rhythm.toLowerCase()}`, score: normTactic(rhythm, RHYTHM_FIT[rhythm](rows) * 100) });
    if (!parts.length) return { score: 50, parts, notes: [] };
    const score = Math.round(parts.reduce((s2, x) => s2 + x.score, 0) / parts.length);
    const notes = [];
    parts.filter(x => x.key !== "Équilibrée").forEach(x => {
      if (x.score >= 65) notes.push({ tone: "ok", tactic: x.key, text: "Cette tactique convient à votre cinq." });
      else if (x.score <= 35) notes.push({ tone: "warn", tactic: x.key, text: "Cette tactique convient mal à votre cinq." });
    });
    return { score, parts, notes };
  }

  return { POSITIONS, CONFIG, thresholdScale, essentialCheck, positionModifier, weightsOf, COHESION, NOTES, ROLES, PAIRS, TACTICS, tacticalFit, stableUnit, preferredRole, roleMismatch, roleFits, identityScore, positionsOf, profileOf, strengthsOf, pairScore, keyAverage, lineupCohesion, compatibilityWith, slotRole };
});
