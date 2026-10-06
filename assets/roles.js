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
    positionSlack: 30,      // écart de note au poste qui ramène la maîtrise au plancher
    positionFloor: 0.55,    // plancher du facteur de poste
    secondaryMin: 60,       // maîtrise minimale d'un rôle secondaire
    secondaryGap: 15,       // … et à moins de 15 points du rôle principal
    strengthGap: 5,         // une force : au moins 5 points au-dessus du niveau du joueur
    identityWindow: 99,     // rôle principal : la meilleure maîtrise à un poste naturel
    identityPosFit: 0.85,   // … à un poste où il est à moins de ~5 points de son meilleur poste
    positionsGap: 3,        // postes du joueur : à moins de 3 points de son meilleur poste
    cardPositionBonus: 6,   // le poste de carte du joueur compte dans le choix de son identité
    // Relief habituel (caractéristiques du rôle − niveau du joueur) de chaque
    // (rôle, poste) chez les joueurs de ce poste (joueurs générés D1-D3,
    // 2026-10-06, script dans DEV_NOTES) : un rôle n'est pas « maîtrisé »
    // juste parce que ses caractéristiques recoupent les points forts du poste.
    baselines: {
      "combo_guard|Arrière": 0.339,
      "combo_guard|Meneur": 0.341,
      "defensive_four|Ailier fort": 0.005,
      "floor_general|Meneur": 0.188,
      "inside_four|Ailier fort": 0.463,
      "inside_four|Pivot": 0.562,
      "interior_scorer|Ailier fort": 0.416,
      "interior_scorer|Pivot": 0.494,
      "lob_threat|Ailier fort": 0.272,
      "lob_threat|Pivot": 0.252,
      "pass_first|Meneur": 0.11,
      "playmaking_four|Ailier fort": -0.187,
      "point_center|Pivot": -0.059,
      "point_forward|Ailier fort": -0.19,
      "point_forward|Ailier shooteur": 0.02,
      "rebounder|Ailier fort": 0.414,
      "rebounder|Pivot": 0.494,
      "rim_protector|Ailier fort": 0.167,
      "rim_protector|Pivot": 0.5,
      "scorer_guard|Arrière": 0.453,
      "scorer_guard|Meneur": 0.313,
      "sharpshooter|Ailier shooteur": 0.159,
      "sharpshooter|Arrière": 0.212,
      "shot_creator|Ailier shooteur": 0.218,
      "shot_creator|Arrière": 0.399,
      "slasher|Ailier shooteur": -0.028,
      "slasher|Arrière": 0.226,
      "small_ball_four|Ailier fort": -0.118,
      "small_ball_four|Pivot": -0.191,
      "stretch_five|Pivot": -0.101,
      "stretch_forward|Ailier fort": 0.102,
      "stretch_forward|Ailier shooteur": 0.087,
      "stretch_four|Ailier fort": 0.001,
      "three_and_d|Ailier shooteur": 0.326,
      "three_and_d|Arrière": 0.168
    },
  };

  // Tendances : usage (ballon), create (pour les autres), spacing, offBall,
  // paint, perimD, rimD, reb, transition, pnr.
  const T = (usage, create, spacing, offBall, paint, perimD, rimD, reb, transition, pnr) => ({ usage, create, spacing, offBall, paint, perimD, rimD, reb, transition, pnr });

  const ROLES = {
    floor_general: {
      name: "Floor General", positions: ["Meneur"],
      desc: "Organise l'attaque et met les autres en situation.",
      weights: { pass: 3, vision: 3, decision: 2.5, dribble: 2, shotCreation: 1, anticipation: 1 },
      tendencies: T(0.65, 0.95, 0.4, 0.2, 0.2, 0.5, 0, 0.2, 0.5, 0.8),
      offense: ["Organise l'attaque", "Lit les défenses", "Distribue sur pick & roll"], defense: ["Dirige la défense"],
      training: ["pass", "dribble"],
    },
    scorer_guard: {
      name: "Scoreur", positions: ["Meneur", "Arrière"],
      desc: "Crée pour lui-même et consomme beaucoup de possessions.",
      weights: { shotCreation: 3, dribble: 2.5, penetration: 2, threePoint: 2, midRange: 1.5, speed: 1.5 },
      tendencies: T(0.95, 0.3, 0.5, 0.15, 0.5, 0.4, 0, 0.2, 0.6, 0.6),
      offense: ["Garde beaucoup le ballon", "Prend des tirs difficiles", "Isolations"], defense: ["Défend moins"],
      training: ["shotCreation", "dribble"],
    },
    pass_first: {
      name: "Pass-first", positions: ["Meneur"],
      desc: "Cherche d'abord à faire marquer ses coéquipiers.",
      weights: { pass: 3, vision: 3, decision: 2, composure: 1 },
      tendencies: T(0.45, 1, 0.35, 0.25, 0.15, 0.5, 0, 0.2, 0.55, 0.7),
      offense: ["Réduit sa consommation de possessions", "Trouve le joueur démarqué"], defense: ["Défend sur le porteur"],
      training: ["pass"],
    },
    combo_guard: {
      name: "Combo Guard", positions: ["Meneur", "Arrière"],
      desc: "Hybride meneur-arrière : crée, tire et partage.",
      weights: { dribble: 2, threePoint: 2, pass: 2, shotCreation: 2, speed: 1 },
      tendencies: T(0.7, 0.6, 0.6, 0.3, 0.35, 0.5, 0, 0.2, 0.7, 0.6),
      offense: ["Alterne création et tir"], defense: ["Défend sur les deux postes extérieurs"],
      training: ["dribble", "threePoint"],
    },
    sharpshooter: {
      name: "Gâchette", positions: ["Arrière", "Ailier shooteur"],
      desc: "Spécialiste du tir extérieur, cherche les tirs ouverts.",
      weights: { threePoint: 3.5, midRange: 1.5, freeThrow: 1.5, agility: 1, endurance: 1, focus: 1 },
      tendencies: T(0.45, 0.2, 1, 0.8, 0.05, 0.4, 0, 0.15, 0.4, 0.3),
      offense: ["Cherche les tirs ouverts", "Se déplace sans ballon", "Tir en réception"], defense: ["Défense moyenne"],
      training: ["threePoint"],
    },
    shot_creator: {
      name: "Shot Creator", positions: ["Arrière", "Ailier shooteur"],
      desc: "Arrière capable de se créer son tir.",
      weights: { shotCreation: 3, dribble: 2, midRange: 2, threePoint: 1.5, composure: 1 },
      tendencies: T(0.85, 0.35, 0.55, 0.2, 0.35, 0.4, 0, 0.2, 0.5, 0.5),
      offense: ["Se crée son tir", "Tirs à mi-distance"], defense: ["Défense moyenne"],
      training: ["shotCreation", "midRange"],
    },
    slasher: {
      name: "Slasher", positions: ["Arrière", "Ailier shooteur"],
      desc: "Attaque le cercle avec agressivité.",
      weights: { penetration: 3, acceleration: 2, speed: 0.5, inside: 1.5, dribble: 1.5, power: 1 },
      tendencies: T(0.7, 0.3, 0.25, 0.5, 0.85, 0.45, 0.05, 0.3, 0.85, 0.4),
      offense: ["Attaque le cercle", "Provoque des fautes", "Coupe vers le panier"], defense: ["Défense active"],
      training: ["penetration", "inside"],
    },
    three_and_d: {
      name: "3&D", positions: ["Arrière", "Ailier shooteur"],
      desc: "Défenseur extérieur et spécialiste du tir : défense et écartement.",
      weights: { threePoint: 3, defOutside: 3, steal: 1, agility: 1, anticipation: 1 },
      tendencies: T(0.35, 0.2, 0.9, 0.75, 0.1, 0.95, 0.05, 0.25, 0.5, 0.2),
      offense: ["Cherche les corners", "Prend des tirs ouverts", "Ne monopolise pas le ballon"], defense: ["Défend sur le meilleur extérieur"],
      training: ["threePoint", "defOutside"],
    },
    stretch_forward: {
      name: "Faux 4", positions: ["Ailier shooteur", "Ailier fort"],
      desc: "Ailier utilisé comme intérieur léger qui écarte le jeu.",
      weights: { threePoint: 2, rebound: 2, defInside: 1.5, agility: 1.5, strength: 1, defOutside: 1 },
      tendencies: T(0.4, 0.25, 0.8, 0.6, 0.3, 0.6, 0.3, 0.55, 0.6, 0.4),
      offense: ["Étire la défense depuis le poste 4"], defense: ["Défend sur les intérieurs mobiles"],
      training: ["threePoint", "rebound"],
    },
    point_forward: {
      name: "Point Forward", positions: ["Ailier shooteur", "Ailier fort"],
      desc: "Ailier capable d'organiser le jeu.",
      weights: { pass: 2.5, vision: 2.5, dribble: 2, decision: 1.5, shotCreation: 1 },
      tendencies: T(0.65, 0.85, 0.4, 0.3, 0.35, 0.5, 0.1, 0.35, 0.6, 0.6),
      offense: ["Organise depuis l'aile", "Passes vers les tireurs"], defense: ["Défense polyvalente"],
      training: ["pass", "dribble"],
    },
    stretch_four: {
      name: "Stretch 4", positions: ["Ailier fort"],
      desc: "Intérieur capable de tirer à 3 points.",
      weights: { threePoint: 3, midRange: 2, rebound: 1.5, defInside: 1 },
      tendencies: T(0.45, 0.2, 0.9, 0.55, 0.15, 0.3, 0.3, 0.5, 0.35, 0.75),
      offense: ["Pick & pop", "Écarte la raquette"], defense: ["Défense intérieure moyenne"],
      training: ["threePoint", "midRange"],
    },
    inside_four: {
      name: "Inside 4", positions: ["Ailier fort", "Pivot"],
      desc: "Joue principalement près du cercle.",
      weights: { inside: 3, rebound: 2, power: 2, strength: 2 },
      tendencies: T(0.55, 0.15, 0.05, 0.3, 0.95, 0.2, 0.45, 0.75, 0.3, 0.45),
      offense: ["Poste bas", "Rebond offensif"], defense: ["Défend au contact"],
      training: ["inside", "rebound"],
    },
    defensive_four: {
      name: "Défenseur", positions: ["Ailier fort"],
      desc: "Spécialiste défensif et polyvalent.",
      weights: { defInside: 2.5, defOutside: 2, block: 1.5, agility: 1.5, anticipation: 1, discipline: 1 },
      tendencies: T(0.25, 0.2, 0.3, 0.45, 0.4, 0.75, 0.65, 0.55, 0.45, 0.3),
      offense: ["Peu de ballons"], defense: ["Change sur les écrans", "Aide en défense"],
      training: ["defInside", "defOutside"],
    },
    small_ball_four: {
      name: "Small Ball 4", positions: ["Ailier fort", "Pivot"],
      desc: "Profil mobile qui accélère le jeu.",
      weights: { agility: 2, speed: 2, rebound: 1.5, defOutside: 1.5, threePoint: 1 },
      tendencies: T(0.45, 0.3, 0.55, 0.6, 0.4, 0.65, 0.3, 0.5, 0.9, 0.5),
      offense: ["Course en transition"], defense: ["Change sur tous les postes"],
      training: ["agility", "rebound"],
    },
    playmaking_four: {
      name: "Playmaking 4", positions: ["Ailier fort"],
      desc: "Ailier fort capable de créer du jeu.",
      weights: { pass: 2.5, vision: 2, dribble: 1.5, decision: 1.5, midRange: 1 },
      tendencies: T(0.55, 0.75, 0.45, 0.35, 0.4, 0.35, 0.3, 0.45, 0.45, 0.65),
      offense: ["Passes depuis le poste haut"], defense: ["Défense intérieure moyenne"],
      training: ["pass"],
    },
    rim_protector: {
      name: "Rim Protector", positions: ["Pivot", "Ailier fort"],
      desc: "Spécialiste défensif près du cercle.",
      weights: { block: 3.5, defInside: 2.5, vertical: 2, anticipation: 1 },
      tendencies: T(0.25, 0.1, 0.05, 0.4, 0.6, 0.15, 1, 0.75, 0.3, 0.5),
      offense: ["Peu de ballons", "Finit près du cercle"], defense: ["Protège le cercle", "Dissuade les pénétrations"],
      training: ["block", "defInside"],
    },
    interior_scorer: {
      name: "Interior Scorer", positions: ["Pivot", "Ailier fort"],
      desc: "Marque principalement dans la raquette.",
      weights: { inside: 3.5, power: 2, strength: 1.5, freeThrow: 1 },
      tendencies: T(0.7, 0.15, 0.05, 0.2, 1, 0.1, 0.45, 0.6, 0.2, 0.45),
      offense: ["Poste bas", "Demande le ballon près du cercle"], defense: ["Défense statique"],
      training: ["inside"],
    },
    stretch_five: {
      name: "Stretch 5", positions: ["Pivot"],
      desc: "Pivot capable de tirer de loin.",
      weights: { threePoint: 3, midRange: 2, defInside: 1, rebound: 1 },
      tendencies: T(0.45, 0.2, 0.85, 0.5, 0.15, 0.2, 0.4, 0.5, 0.3, 0.75),
      offense: ["Pick & pop", "Sort le pivot adverse de la raquette"], defense: ["Protection du cercle limitée"],
      training: ["threePoint"],
    },
    rebounder: {
      name: "Rebounder", positions: ["Pivot", "Ailier fort"],
      desc: "Spécialiste du rebond.",
      weights: { rebound: 3.5, strength: 2, vertical: 2, determination: 1 },
      tendencies: T(0.3, 0.1, 0.05, 0.35, 0.75, 0.15, 0.6, 1, 0.35, 0.35),
      offense: ["Rebond offensif", "Secondes chances"], defense: ["Boxe et prend le rebond"],
      training: ["rebound"],
    },
    point_center: {
      name: "Point Center", positions: ["Pivot"],
      desc: "Pivot qui distribue depuis le poste haut.",
      weights: { pass: 3, vision: 2.5, decision: 1.5, inside: 1 },
      tendencies: T(0.55, 0.8, 0.25, 0.3, 0.5, 0.15, 0.45, 0.55, 0.3, 0.7),
      offense: ["Passes depuis le poste haut", "Relais du jeu"], defense: ["Défense intérieure moyenne"],
      training: ["pass", "inside"],
    },
    lob_threat: {
      name: "Lob Threat", positions: ["Pivot", "Ailier fort"],
      desc: "Très dangereux sur pick & roll et au-dessus du cercle.",
      weights: { vertical: 3, inside: 2, acceleration: 1.5, agility: 1.5, power: 1 },
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
    ["scorer_guard", "sharpshooter", -1, "Le meneur garde le ballon : la Gâchette reçoit peu de tirs."],
    ["pass_first", "slasher", 2, "Le meneur trouve le Slasher en coupe."],
    ["scorer_guard", "scorer_guard", -2, "Deux joueurs qui ont besoin du ballon."],
    ["scorer_guard", "shot_creator", -2, "Deux créateurs pour un seul ballon."],
    ["shot_creator", "shot_creator", -2, "Deux créateurs pour un seul ballon."],
    ["three_and_d", "scorer_guard", 3, "Le 3&D défend et écarte sans réclamer le ballon."],
    ["three_and_d", "shot_creator", 3, "Le 3&D défend et écarte sans réclamer le ballon."],
    ["three_and_d", "pass_first", 2, "Le meneur trouve le 3&D dans le corner."],
    ["stretch_forward", "rim_protector", 2, "Le Faux 4 écarte, le pivot protège le cercle."],
    ["stretch_forward", "stretch_four", 3, "Écartement maximal autour du cercle."],
    ["inside_four", "interior_scorer", -1, "Deux joueurs dans la raquette : congestion."],
    ["inside_four", "inside_four", -1, "Deux joueurs dans la raquette : congestion."],
    ["stretch_four", "interior_scorer", 3, "Le Stretch 4 libère la raquette pour le pivot."],
    ["stretch_four", "rim_protector", 2, "Écartement en attaque, cercle protégé en défense."],
    ["point_forward", "sharpshooter", 3, "Le Point Forward trouve la Gâchette."],
    ["scorer_guard", "lob_threat", 2, "Pick & roll : le créateur attire, le pivot finit."],
    ["pass_first", "lob_threat", 3, "Pick & roll : passe lobée pour le pivot."],
    ["floor_general", "lob_threat", 3, "Pick & roll : passe lobée pour le pivot."],
    ["slasher", "slasher", -1, "Deux Slashers : la raquette se bouche."],
    ["slasher", "interior_scorer", -1, "Le Slasher et le pivot se disputent la raquette."],
    ["stretch_five", "slasher", 2, "Le Stretch 5 vide la raquette pour le Slasher."],
    ["point_center", "sharpshooter", 2, "Le pivot passeur sert les tireurs."],
    ["rebounder", "scorer_guard", 1, "Le rebondeur rattrape les tirs difficiles."],
  ];
  const pairIndex = new Map();
  PAIRS.forEach(([a, b, s, why]) => { pairIndex.set(`${a}|${b}`, { score: s, reason: why }); pairIndex.set(`${b}|${a}`, { score: s, reason: why }); });

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = v => (typeof v === "number" && isFinite(v) ? v : null);
  function avgOf(attrs) {
    const vals = Object.values(attrs || {}).filter(v => typeof v === "number");
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 50;
  }
  function keyAverage(role, attrs) {
    let s = 0, w = 0;
    Object.keys(role.weights).forEach(k => { const v = num(attrs[k]); if (v == null) return; s += v * role.weights[k]; w += role.weights[k]; });
    return w ? s / w : null;
  }

  // Maîtrise de chaque (rôle, poste) : moyenne des caractéristiques du rôle,
  // bonus de spécialisation, facteur de poste (note au poste comparée au
  // meilleur poste). `positionRatings` : { poste: note } (facultatif).
  function roleFits(attrs, positionRatings) {
    if (!attrs || typeof attrs !== "object") return [];
    const overall = avgOf(attrs);
    const pr = positionRatings || null;
    const best = pr ? Math.max(...POSITIONS.map(p => num(pr[p]) || 0)) : null;
    const out = [];
    Object.keys(ROLES).forEach(id => {
      const role = ROLES[id];
      const key = keyAverage(role, attrs);
      if (key == null) return;
      // Maîtrise = adéquation du PROFIL au rôle (écart des caractéristiques
      // du rôle au niveau du joueur, comparé à l'écart habituel à ce poste)
      // + une part du niveau, × facteur de poste. Un jeune joueur au profil
      // très marqué maîtrise déjà son rôle ; un joueur sans relief, non.
      const shape = overall > 0 ? key / overall - 1 : 0; // relief relatif : identique à toutes les divisions
      role.positions.forEach(pos => {
        const f = pr && best ? clamp(1 - Math.max(0, best - (num(pr[pos]) || 0)) / CONFIG.positionSlack, CONFIG.positionFloor, 1) : 1;
        const base = CONFIG.baselines[`${id}|${pos}`];
        const m = CONFIG.masteryBase + CONFIG.shapeWeight * (shape - CONFIG.baselineWeight * (typeof base === "number" ? base : 0)) + CONFIG.levelWeight * (overall - 50);
        out.push({ role: id, name: role.name, position: pos, mastery: clamp(Math.round(m * f), 1, 99), posFit: f });
      });
    });
    return out.sort((a, b) => b.mastery - a.mastery);
  }

  // Rôle principal + rôles secondaires (autres rôles, ou même rôle à un
  // autre poste) à moins de secondaryGap points et au-dessus de secondaryMin.
  function identityScore(f, cardPosition) {
    return f.mastery + (cardPosition && f.position === cardPosition ? CONFIG.cardPositionBonus : 0);
  }
  // Postes du joueur : son poste de carte et ceux où sa note est à moins de
  // positionsGap points de son meilleur poste.
  function positionsOf(positionRatings, cardPosition) {
    if (!positionRatings) return cardPosition ? [cardPosition] : null;
    const best = Math.max(...POSITIONS.map(p => num(positionRatings[p]) || 0));
    return POSITIONS.filter(p => p === cardPosition || (num(positionRatings[p]) || 0) >= best - CONFIG.positionsGap);
  }
  // `cardPosition` (facultatif) : poste de carte du joueur.
  function profileOf(attrs, positionRatings, max = 4, cardPosition = null) {
    const fits = roleFits(attrs, positionRatings);
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
    let s = 0;
    s -= Math.max(0, ta.usage + tb.usage - 1.3) * 3;
    s -= Math.max(0, ta.paint + tb.paint - 1.4) * 3;
    s += (ta.create * tb.spacing + tb.create * ta.spacing) * 1.5;
    s += (ta.spacing + tb.spacing > 1.3 ? 0.5 : 0);
    return { score: clamp(Math.round(s), -3, 3), reason: null };
  }

  return { POSITIONS, CONFIG, ROLES, PAIRS, roleFits, identityScore, positionsOf, profileOf, strengthsOf, pairScore, keyAverage };
});
