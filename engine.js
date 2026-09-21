// =====================================================================
// MOTEUR DE JEU — Basket Manager (moteur de simulation, sans DOM)
// Module UMD : utilisable depuis Node (tests) et depuis le navigateur
// (chargé en <script> classique, il expose window.BasketEngine).
// =====================================================================
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BasketEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

const POSITIONS = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];

// 3 caractéristiques ajoutées (retour utilisateur, 2026-09 : "il faudrait
// ajouter les lignes de carac suivantes : Mental [...] Endurance [...]
// Lancer Franc") : mêmes citoyens à part entière que les 10 d'origine
// (comptent dans Player.overall()/le potentiel/le salaire, s'entraînent
// normalement, POSITION_ATTR_PROFILE plus bas les traite en "base" pour
// tous les postes faute de biais réel), mais chacune alimente en plus un
// mécanisme de match dédié plutôt qu'un simple malus/bonus générique :
// - "mental" : fin de match serrée (voir le bonus clutch dans
//   MatchEngine, autour de "clutch" dans playPossession) ET capacité à
//   encaisser une série de ratés/pertes de balle sans s'enfoncer (voir
//   Player.consecutiveMisses/le malus de "tilt" dans playPossession).
// - "endurance" : vitesse d'accumulation de la fatigue EN MATCH pour CE
//   joueur (voir enduranceMult dans MatchEngine.applyFatigue), version
//   individuelle de l'effet de l'Espace bien-être du club.
// - "freeThrow" : réussite aux lancers francs (voir MatchEngine.freeThrows),
//   qui utilisait jusqu'ici le tir à mi-distance comme simple approximation.
const ATTRS = [
  "midRange", "threePoint", "inside", "pass", "rebound",
  "block", "dribble", "agility", "defOutside", "defInside",
  "mental", "endurance", "freeThrow"
];

const TRAINING_LABELS = {
  midRange: "Tir à mi-distance",
  threePoint: "Tir à 3 points",
  inside: "Jeu intérieur",
  pass: "Passe",
  rebound: "Rebond",
  block: "Contre",
  dribble: "Dribble",
  agility: "Agilité",
  defOutside: "Défense extérieure",
  defInside: "Défense intérieure",
  mental: "Mental",
  endurance: "Endurance",
  freeThrow: "Lancer franc",
};

const OFFENSE_PROFILES = {
  "Équilibrée":        { inside: .34, mid: .33, three: .33, tov: 0,    assist: 0,   tempo: 0 },
  "Jeu intérieur":     { inside: .60, mid: .25, three: .15, tov: -.01, assist: 0,   tempo: -.05 },
  "Jeu extérieur":     { inside: .15, mid: .30, three: .55, tov: 0,    assist: .02, tempo: 0 },
  "Jeu en pénétration":{ inside: .50, mid: .35, three: .15, tov: .03,  assist: 0,   tempo: .05, drawFoul: .04 },
  "Pick & Roll":       { inside: .40, mid: .30, three: .30, tov: 0,    assist: .05, tempo: 0 },
  "Post-up":           { inside: .65, mid: .25, three: .10, tov: -.02, assist: -.02,tempo: -.08 },
  "Isolation":         { inside: .30, mid: .40, three: .30, tov: .04,  assist: -.05,tempo: -.03 },
  "Jeu en mouvement":  { inside: .30, mid: .30, three: .40, tov: -.01, assist: .06, tempo: .02 },
  "Transition rapide": { inside: .45, mid: .25, three: .30, tov: .05,  assist: .02, tempo: .18 },
  "Tirs rapides":      { inside: .20, mid: .35, three: .45, tov: .04,  assist: -.03,tempo: .12 },
};

const DEFENSES = {
  "Homme à homme":   { insideDef: 0,   perimDef: 0,   pressure: 0,   fatigueCost: 0 },
  "Zone press":      { insideDef: 0,   perimDef: .02, pressure: .09, fatigueCost: .35 },
  "Box and one":     { insideDef: .01, perimDef: .01, pressure: .02, fatigueCost: .10, shutdownStar: true },
  "Zone extérieure": { insideDef: -.06,perimDef: .09, pressure: .01, fatigueCost: -.05 },
  "Zone intérieure": { insideDef: .09, perimDef: -.06,pressure: .01, fatigueCost: -.05 },
};

const RHYTHMS = {
  "Lent":   { possessionsPerQuarter: 41, fatigueMult: .85, tovMult: .92 },
  "Normal": { possessionsPerQuarter: 45, fatigueMult: 1,   tovMult: 1 },
  "Rapide": { possessionsPerQuarter: 49, fatigueMult: 1.18,tovMult: 1.08 },
};

// ---------------------------------------------------------------------
// TACTIQUE CONFIRMÉE (retour utilisateur, 2026-09 — inspiré de BuzzerBeater,
// sélecteur "Rookie / Vétéran / AllStar") : six réglages tactiques
// supplémentaires, réservés au niveau tactique "confirmée" (voir
// Team.tacticalTier). RÈGLE DE SÉCURITÉ ABSOLUE, non négociable : chaque
// réglage a une valeur "standard" (voir les défauts posés dans
// Team.constructor) dont l'effet sur la formule est un delta de ZÉRO — un
// coach qui ne touche jamais à ces champs (tactique "débutant", ou une
// sauvegarde antérieure à cette fonctionnalité, voir les `?? "..."` de
// secours dans applyPlannedTacticsForRound) obtient un match RIGOUREUSEMENT
// IDENTIQUE à avant cette fonctionnalité. `tacticalTier` lui-même ne sert
// QU'À décider quels réglages afficher côté interface plus tard : le moteur
// applique toujours exactement la même formule, il lit juste les champs —
// délibérément AUCUN `if (tier === "confirmée")` dans playPossession.
// ---------------------------------------------------------------------

// Défense sur écrans — n'a d'effet que sur les possessions où "Pick & Roll"
// fait partie des priorités offensives adverses (pondéré par son poids dans
// la liste des priorités, voir screenDefenseWeight() dans playPossession).
// "Aucune consigne" = comportement actuel (aucun mécanisme d'écran modélisé
// avant cette fonctionnalité) = delta zéro partout — nommé ainsi plutôt que
// "Standard" (retour utilisateur : un nom de "schéma" à côté de vrais noms
// comme Au-dessus/Switch/Prise à deux prêtait à confusion, alors que c'est
// littéralement l'absence de consigne spécifique du coach sur les écrans).
// NOTE d'échelle : rollOpennessMod/shooterOpennessMod/mismatchVarianceMod/
// insideMismatchMod (ici et dans CLOSEOUT_STYLES) s'ajoutent DIRECTEMENT à
// `openness`/`mismatch`, une échelle "brute" de quelques points (le mismatch
// taille/agilité existant vaut déjà couramment 2 à 5) — PAS la même échelle
// fractionnaire (0 à ~0.1) que insideDef/perimDef/tovMod/assistOpenMod, qui
// eux se multiplient par defStat (~60-70) avant de compter. Ne jamais copier
// un ordre de grandeur de l'un vers l'autre sans repasser par simulate.js.
const SCREEN_DEFENSES = {
  "Aucune consigne": { ballCreationMod: 0,    rollOpennessMod: 0 },
  "Au-dessus":    { ballCreationMod: -.05, rollOpennessMod: 18 },
  "En-dessous":   { ballCreationMod: -.08, rollOpennessMod: -7, shooterOpennessMod: 14 },
  "Switch":       { mismatchVarianceMod: 1.3 },
  "Prise à deux": { ballCreationMod: -.16, tovMod: .03, assistOpenMod: .10 },
};

// Aide défensive — "Moyenne" = comportement actuel (delta zéro). Faible :
// plus de pénétration (insideDef en baisse) mais tireurs plus étroitement
// gardés (perimDef en hausse, moins de tirs ouverts) ; Forte : l'inverse
// (meilleure protection du panier, mais plus de tirs à 3 points ouverts) —
// exactement le compromis décrit par l'utilisateur.
const HELP_DEFENSE_LEVELS = {
  "Faible":  { insideDef: -.045, perimDef: .035 },
  "Moyenne": { insideDef: 0,     perimDef: 0 },
  "Forte":   { insideDef: .045,  perimDef: -.035 },
};

// Surveiller — jusqu'à 3 affectations { position, focus } sur Team.watchAssignments
// (tableau vide par défaut = comportement actuel inchangé). Chaque focus
// donne un bonus défensif CIBLÉ sur l'action correspondante, avec une petite
// contrepartie ailleurs (attention détournée = un peu de fatigue en plus
// pour le défenseur dédié, ou un peu plus de risque en pariant sur l'interception).
// Retour utilisateur (2026-09) : denyThree et denyPassingLanes retirés de la
// liste des focus proposés (redondants avec harassOutsideShot/denyEntry,
// gardés) — les entrées WATCH_FOCUS_EFFECTS correspondantes sont supprimées
// ci-dessous ; toute affectation existante avec l'un de ces deux focus (une
// ancienne sauvegarde) devient simplement inerte (voir la garde `if (!eff)
// continue` dans applyDefenseEffects/resolveShotOutcome plus bas), jamais un
// crash.
// NOTE d'échelle (bug calibrage corrigé, retour utilisateur "ce n'est pas
// assez" + validation croisée avec simulate.js) : extraFatigueMod s'ajoute
// DIRECTEMENT à Player.fatigue (échelle 0-100), possession par possession,
// SANS plafond autre que le clamp 0-100 — il doit donc rester du même ordre
// de grandeur que le gain de fatigue "naturel" d'une possession normale
// (~0.5 à 1.5, voir applyFatigue), jamais un gros forfait genre 7-12 : un
// défenseur ciblé qui joue presque toutes les possessions verrait sinon sa
// fatigue saturer à 100 en quelques possessions à peine, ce qui DÉTRUIT son
// eff() bien plus que le bonus de défBoost ne l'améliore et INVERSE l'effet
// voulu (mesuré : defBoost plus haut => FG% adverse plus haut, backwards).
const WATCH_FOCUS_EFFECTS = {
  denyPostUp:         { insideDefBonus: .09, extraFatigueMod: 2 },
  // Colle sur les drives : meilleur contest sur les tirs pris en pénétrant
  // (inside/mid), mais le tireur se retrouve plus souvent seul au tir à 3
  // (le défenseur reste collé sur la ligne de drive plutôt que de fermer la
  // ligne à 3pts) — inverse exact du compromis de harassOutsideShot.
  // NB : denyDrive se déclenche sur TOUS les tirs à 2 pts (inside + mid, pas
  // seulement inside comme denyPostUp) donc à fréquence quasi double — la
  // contrepartie fatigue est réduite d'autant pour rester proportionnée sur
  // un match complet (validé : fg2% adverse en baisse nette après ajustement).
  denyDrive:          { insideMidDefBonus: .07, perimOpenPenalty: .05, extraFatigueMod: 1.4 },
  // Gêne le tir à 3pts ET la mi-distance — plus de terrain à couvrir, donc
  // plus de fatigue.
  harassOutsideShot:  { perimDefBonusWide: .07, extraFatigueMod: 3.5 },
  // Boxe-out prioritaire sur CE joueur au rebond : réduit son poids
  // individuel dans le tirage du rebond offensif et donne un petit bonus
  // d'équipe au rebond défensif, au prix d'un peu de défBoost en moins
  // ailleurs (l'attention dédiée au boxout coûte un peu de aide ailleurs).
  // NOTE d'échelle : offRebWeightPenalty est un multiplicateur appliqué à la
  // contribution du joueur ciblé (eff("rebound")+height/20, déjà à l'échelle
  // brute ~15-90) — mais defRebTeamBonus s'ajoute DIRECTEMENT à la somme
  // offReb/defReb de toute l'équipe, qui tourne typiquement autour de
  // 250-450 (5 joueurs) : il lui faut donc sa propre échelle "brute" (~15-25,
  // l'ordre de grandeur d'une bonne moitié de joueur), jamais une fraction
  // (0-1) comme les modificateurs multiplicatifs.
  reboundPriority:    { offRebWeightPenalty: .5, defRebTeamBonus: 18, defBoostPenalty: .02 },
  // Face-guard : empêche carrément ce joueur de recevoir la balle facilement
  // (tov et coût de défBoost élevés tous les deux).
  denyEntry:          { tovBonus: .05, defBoostPenalty: .035 },
};
const MAX_WATCH_ASSIGNMENTS = 3;

// Gestion du post-up — s'applique aux tirs en zone "inside" uniquement.
// "Classique" = comportement actuel (delta zéro).
const POST_DEFENSES = {
  "Classique":              { insideDef: 0,    tovMod: 0,    assistOpenMod: 0,    foulMod: 0 },
  "Pousser vers le fond":   { insideDef: .05,  tovMod: 0,    assistOpenMod: -.03, foulMod: .015 },
  "Pousser vers le centre": { insideDef: .025, tovMod: 0,    assistOpenMod: .05,  foulMod: 0 },
  "Prise à deux":           { insideDef: .11,  tovMod: .05,  assistOpenMod: .08,  foulMod: 0 },
};

// Close-out — "Contrôlé" = comportement actuel (delta zéro). Agressif :
// meilleur contest sur les tirs extérieurs (mid/3pts) réellement pris, mais
// avantage offensif accru sur les tirs à l'intérieur — le risque de
// pénétration/dribble derrière une fermeture trop appuyée, décrit par
// l'utilisateur.
const CLOSEOUT_STYLES = {
  "Contrôlé": { perimDefMod: 0,   insideMismatchMod: 0 },
  "Agressif": { perimDefMod: .05, insideMismatchMod: 5 },
};

// Rebond offensif — "Normal" = comportement actuel (delta zéro). Agressif :
// plus de rebonds offensifs captés (offRebWeightMod positif), mais si le
// rebond est malgré tout perdu, la défense qui récupère bénéficie d'un
// petit bonus de transition sur SA possession suivante (repli plus lent —
// contrepartie explicitement demandée par l'utilisateur, "risque de prendre
// des contre-attaques"). Prudent : l'inverse, moins de rebonds offensifs
// mais jamais de bonus de transition donné à l'adversaire.
const OFF_REBOUND_STYLES = {
  "Prudent":  { offRebWeightMod: -.22, transitionRisk: 0 },
  "Normal":   { offRebWeightMod: 0,    transitionRisk: 0 },
  "Agressif": { offRebWeightMod: .28,  transitionRisk: .40 },
};

// Gestion de fin de match (retour utilisateur, 2026-09 — "lever le pied" en
// cas de gros écart, gérer le "money time" à ±5 pts ; nommé ainsi plutôt que
// "gestion du rythme" pour ne pas se confondre avec Team.rhythm/RHYTHMS, le
// réglage de tempo Lent/Normal/Rapide qui existe déjà) : comportement
// AUTOMATIQUE (pas un choix par possession), donc volontairement PAS
// rattaché au tier tactique — dispo aux deux niveaux. "Standard" = comportement actuel
// inchangé : les mécanismes déjà existants de faute intentionnelle et de
// ralentissement du chrono en fin de match (voir playPossession/simulate)
// restent les SEULS effets de money-time. "Adaptatif" ajoute un vrai
// "garbage time" dès qu'un écart de 10+ points existe à partir du Q3
// (moins de hero-ball côté équipe qui mène large, un peu plus d'imprécision
// des deux côtés), et accentue légèrement le rythme des ~5 dernières
// minutes de match quand l'écart repasse sous les 5 points.
const ENDGAME_MANAGEMENT = {
  "Standard":  { blowoutThreshold: null, blowoutHeroMod: 0,    blowoutTovMod: 0,    closeGameTempoMod: 0 },
  "Adaptatif": { blowoutThreshold: 10,   blowoutHeroMod: -.35, blowoutTovMod: .015, closeGameTempoMod: .10 },
};

// Probabilité de base de blessure, par joueur sur le terrain et par possession
// (modulée par la fatigue dans applyFatigue). Calibré pour rester rare — voir
// rapport de calibrage : cible ~1 match sur 6-8 avec au moins une blessure.
const BASE_INJURY_RATE = 0.00013;

let __uid = 1;
function uid() { return __uid++; }

// Jeton privé non-devinable pour un lien de manager (retour utilisateur,
// 2026-09 : jusqu'à 10 vrais managers humains dans UNE ligue partagée — voir
// Team.managerLinkToken plus bas, généré une fois pour toutes à la création
// d'une équipe humaine). Cross-environnement (Node côté serveur ET
// navigateur côté client, voir wrapper UMD en tête de fichier) : préfère
// `crypto.randomBytes` de Node (résolu par un `require` PARESSEUX, jamais
// atteint côté navigateur où `require` n'existe simplement pas), sinon le
// Web Crypto du navigateur (`crypto.getRandomValues`, disponible partout où
// ce jeu tourne), et ne retombe sur Math.random() que si aucune des deux API
// n'est disponible (environnement de test minimal) — jamais le cas en
// production, juste pour ne jamais planter.
function randomHexToken(byteLength) {
  if (typeof require === "function") {
    try {
      const nodeCrypto = require("crypto");
      return nodeCrypto.randomBytes(byteLength).toString("hex");
    } catch (e) { /* pas un environnement Node avec le module crypto — on continue */ }
  }
  if (typeof crypto !== "undefined" && crypto && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }
  let out = "";
  for (let i = 0; i < byteLength * 2; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function weightedPick(items, weightFn) {
  const weights = items.map(weightFn).map(w => Math.max(w, 0.0001));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ---------------------------------------------------------------------
// COMMENTAIRES — banques de formulations pour varier le fil d'événements
// ---------------------------------------------------------------------
function say(templates, vars) {
  const t = pick(templates);
  return t.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

const PHRASES = {
  madeShot: {
    three: [
      "{shooter} plante le tir à 3 points ({quality}) pour {team}.",
      "{shooter} trouve le fond des filets de loin ({quality}) pour {team}.",
      "{shooter} allume la mèche à 3 points ({quality}) pour {team}.",
      "{shooter} envoie une banderille à 3 points ({quality}) pour {team}.",
    ],
    mid: [
      "{shooter} marque en mi-distance ({quality}) pour {team}.",
      "{shooter} ajuste son tir à mi-distance ({quality}) pour {team}.",
      "{shooter} déclenche et marque à mi-distance ({quality}) pour {team}.",
    ],
    inside: [
      "{shooter} marque près du panier ({quality}) pour {team}.",
      "{shooter} s'impose sous le cercle ({quality}) pour {team}.",
      "{shooter} conclut au contact près du panier ({quality}) pour {team}.",
    ],
  },
  andOne: [
    "Faute de {defender}, panier compte + lancer additionnel.",
    "{shooter} marque et provoque la faute de {defender} !",
  ],
  missedFoul: [
    "Faute de {defender} sur le tir de {shooter}.",
    "{defender} accroche {shooter} sur son tir.",
  ],
  turnoverSteal: [
    "{stealer} intercepte ! Perte de balle de {ballHandler}.",
    "{stealer} vole le ballon à {ballHandler} !",
    "Interception de {stealer} sur {ballHandler}.",
  ],
  turnoverPlain: [
    "Perte de balle de {ballHandler} ({team}).",
    "{ballHandler} perd le ballon ({team}).",
    "Mauvaise passe de {ballHandler} ({team}), balle perdue.",
  ],
  reboundOff: [
    "Tir manqué de {shooter}. Rebond offensif de {rebounder}.",
    "{shooter} manque son tir, {rebounder} suit et récupère en attaque.",
  ],
  reboundDef: [
    "Tir manqué de {shooter}. Rebond défensif de {rebounder}.",
    "{shooter} manque, {rebounder} capte le rebond défensif.",
  ],
  freeThrows: [
    "{shooter} {made}/{n} aux lancers francs.",
  ],
  foulOut: [
    "{player} ({team}) est exclu pour 5 fautes.",
  ],
  substitution: [
    "{replacement} remplace {player} ({team}).",
    "{player} sort, {replacement} entre en jeu ({team}).",
  ],
  injury: [
    "{player} se blesse et doit quitter le match ({team}).",
    "Blessure pour {player} ({team}) : sortie immédiate.",
  ],
  shortHanded: [
    "{team} n'a plus de remplaçant disponible et doit jouer en infériorité numérique.",
  ],
  intentionalFoul: [
    "Faute intentionnelle de {defender} ({team}) pour arrêter le chrono.",
    "{team} envoie {shooter} sur la ligne : faute volontaire en fin de match.",
  ],
  clockMilking: [
    "⏳ {team} fait tourner le ballon pour dérouler le chrono.",
  ],
};

// ---------------------------------------------------------------------
// JOUEUR
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// ENTRAÎNEMENT — potentiel GLOBAL (un seul plafond, pas par caractéristique)
// + synergies entre caractéristiques + courbes de progression/déclin selon
// l'âge. Une "semaine" = un cycle d'entraînement entre deux matchs (pas
// encore de vrai calendrier de saison).
// ---------------------------------------------------------------------

// Marge de progression restante (min, max points au-dessus du NIVEAU GLOBAL
// actuel, échelle "overall" 1-99) selon l'âge à la génération du joueur. Un
// jeune joueur brut (attributs de départ volontairement bas, 20-40, voir
// generateAttrsForPosition) peut cacher un potentiel élevé ; un joueur en
// fin de carrière n'a plus de marge (le potentiel ne descend jamais sous le
// niveau déjà atteint).
function potentialHeadroom(age) {
  if (age <= 19) return [20, 50];
  if (age <= 21) return [15, 42];
  if (age <= 23) return [8, 28];
  if (age <= 25) return [3, 15];
  if (age <= 28) return [0, 8];
  if (age <= 31) return [0, 3];
  return [0, 0];
}

// Le potentiel CHIFFRÉ (1-99) reste toujours caché au manager (voir
// Player.potential plus haut) — seul un NOM de palier, forcément plus flou,
// est affiché (retour utilisateur : "il faudrait afficher juste le nom du
// potentiel, pas le niveau exact"). Découpage en tranches de ~10 points sur
// l'échelle 1-99, proposé par l'utilisateur en séance : la plupart des
// jeunes joueurs générés (général de départ ~25-35 + marge aléatoire selon
// l'âge, voir potentialHeadroom) retombent dans les paliers médians
// (Starter à All-Star) — les paliers extrêmes (Superstar, Générationnel)
// restent volontairement rares, pour que tomber dessus reste un événement.
const POTENTIAL_TIERS = [
  { max: 9,  label: "Débutant" },
  { max: 19, label: "Prospect" },
  { max: 29, label: "Joueur correct" },
  { max: 39, label: "Solide" },
  { max: 49, label: "Starter" },
  { max: 59, label: "Très bon joueur" },
  { max: 69, label: "Star" },
  { max: 79, label: "All-Star" },
  { max: 89, label: "Superstar" },
  { max: 99, label: "Générationnel" },
];

function potentialTierLabel(potential) {
  const tier = POTENTIAL_TIERS.find(t => potential <= t.max);
  return (tier || POTENTIAL_TIERS[POTENTIAL_TIERS.length - 1]).label;
}

// Index 1-10 (PAS 0-9) du palier POTENTIAL_TIERS auquel appartient
// `potential` — même recherche que potentialTierLabel ci-dessus, mais
// renvoie la POSITION du palier plutôt que son nom. Sert de base à
// youthProspectLabel juste en dessous (regrouper les 10 paliers fins en 3
// bandes grossières pour l'académie de jeunes) plutôt que de dupliquer une
// seconde table de seuils redondante avec POTENTIAL_TIERS.
function potentialTierIndex(potential) {
  const idx = POTENTIAL_TIERS.findIndex(t => potential <= t.max);
  return (idx === -1 ? POTENTIAL_TIERS.length - 1 : idx) + 1;
}

// Label GROSSIER (3 bandes) affiché pour un joueur de l'académie de jeunes
// (candidat pas encore signé OU déjà signé mais pas encore promu en pro) —
// correctif 2026-09, retour utilisateur explicite : ni le potentiel exact
// (jamais, comme pour un pro), ni même le potentialTierLabel normal à 10
// paliers (trop précis pour un jeune non encore promu), ni une FOURCHETTE
// numérique (l'ancien youthPotentialRange, retiré : basé sur la mauvaise
// prémisse d'un potentiel plafonné à 50) — seulement laquelle des 3 bandes
// ci-dessous, dérivées de potentialTierIndex (donc alignées EXACTEMENT sur
// les mêmes seuils que POTENTIAL_TIERS, pas une échelle différente) :
//   - palier 1-5  (Débutant..Starter,          potentiel <= 49) -> "Espoir"
//   - palier 6-8  (Très bon joueur..All-Star,   potentiel 50-79) -> "Grand espoir"
//   - palier 9-10 (Superstar/Générationnel,     potentiel 80-99) -> "Prodige"
// Dès la promotion vers l'effectif pro (Team.promoteYouthPlayer), ce label
// n'est plus utilisé : le joueur redevient un pro normal, potentialTierLabel
// s'applique comme pour n'importe qui d'autre.
function youthProspectLabel(potential) {
  const tierIndex = potentialTierIndex(potential);
  if (tierIndex <= 5) return "Espoir";
  if (tierIndex <= 8) return "Grand espoir";
  return "Prodige";
}

// Une saison = environ 10 semaines (championnat à 10 équipes en aller-retour
// = 18 matchs à raison de 2/semaine, + play-offs des 4 premiers en deux
// matchs gagnants). Les joueurs prennent une année d'âge par saison (voir
// Team.trainWeek), pas par semaine calendaire.
const SEASON_LENGTH_WEEKS = 10;

// Vitesse de progression hebdomadaire selon l'âge (les jeunes apprennent vite).
// Calibré (2026-09) pour qu'un prospect à fort potentiel, bien placé et bien
// entraîné (entraîneur niveau 5) puisse passer d'une carac à 50 à 90+ en
// environ UNE saison (~10 semaines) — un rythme volontairement rapide pour
// que la progression se sente semaine après semaine, pas sur plusieurs
// années. Les valeurs ci-dessous sont ~7x celles d'un calibrage "réaliste
// sur plusieurs saisons" (gardées en commentaire pour référence).
function growthFactorForAge(age) {
  if (age <= 20) return 2.38;   // ancien calibrage réaliste : 0.34
  if (age <= 22) return 1.89;   // 0.27
  if (age <= 24) return 1.54;   // 0.22
  if (age <= 26) return 1.19;   // 0.17
  if (age <= 28) return 0.77;   // 0.11
  if (age <= 30) return 0.46;   // 0.065
  if (age <= 32) return 0.25;   // 0.035
  return 0.08;                  // 0.011
}

// Vitesse de déclin hebdomadaire selon l'âge (les organismes vieillissent).
// Mise à l'échelle avec growthFactorForAge (même multiplicateur ~7x) pour que
// le déclin d'un vétéran reste comparable EN PROPORTION PAR SAISON à ce qu'il
// était dans l'ancien calibrage (quelques points par carac et par saison en
// fin de carrière), maintenant que la saison ne fait plus 52 semaines mais
// une dizaine.
function declineFactorForAge(age) {
  if (age < 34) return 0;
  if (age < 36) return 0.32;   // ancien calibrage réaliste : 0.045
  if (age < 38) return 0.53;   // 0.075
  if (age < 40) return 0.77;   // 0.11
  return 1.12;                 // 0.16
}

// Une caractéristique travaillée en fait progresser un peu une autre, liée
// (ex : la défense extérieure profite un peu à la défense intérieure ET à
// l'agilité). Purement additif au multiplicateur "focus".
const TRAINING_SYNERGY = {
  midRange: ["threePoint"],
  threePoint: ["midRange"],
  inside: ["rebound"],
  rebound: ["inside", "defInside"],
  pass: ["dribble"],
  dribble: ["pass", "agility"],
  block: ["defInside"],
  agility: ["dribble", "defOutside"],
  defOutside: ["defInside", "agility"],
  defInside: ["defOutside", "block"],
};

// Temps CUMULÉ, au poste entraîné, sur les matchs du cycle d'entraînement en
// cours pour valoir 100% (voir Player.trainingSecondsPlayedByPosition/
// Team.trainablySecondsFor). Calendrier ancré quotidien désormais en place
// (jusqu'à 3 matchs par jour civil : 2 championnat + 1 coupe/amical
// éventuel), donc le cumul porte réellement sur ces 3 matchs, pas plus sur
// le seul dernier match comme avant. Retour utilisateur, 2026-09, une fois
// ce calendrier réel en place : "un joueur doit jouer 30 min au poste
// déterminé sur sa semaine pour prendre l'entrainement", 30 minutes
// cumulées, valeur reprise telle quelle (pas les ~40 minutes envisagées
// avant ce calendrier réel). Proportionnel et continu (pas de seuil
// couperet) : 15 min ≈ 50%, 30 min = 100%, jouer un peu compte toujours un
// peu.
const TRAINING_FULL_MATCH_SECONDS = 1800; // 30 min, cumulées sur les matchs du jour

function attendanceFactorForSeconds(seconds) {
  return clamp(seconds / TRAINING_FULL_MATCH_SECONDS, 0, 1);
}

// ---------------------------------------------------------------------
// Retour utilisateur (2026-09) : "il faut que la motivation soit aussi
// impactée par le temps de jeu, un joueur qui cire le banc doit être
// malheureux (surtout si c'est censé etre un titu dans l'équipe où il est)"
// : érosion hebdomadaire de Player.form (voir Team.applyBenchFrustration,
// appelée depuis Team.trainWeek, au même rythme que le reste de
// l'entraînement) pour tout joueur qui n'est PAS titulaire (Team.
// lineup.starters) et qui n'a quasiment pas joué cette semaine (seuil bas,
// pas un simple "n'est pas titulaire" : un remplaçant qui tourne
// régulièrement n'est pas concerné, seul celui qui ne joue quasiment jamais
// l'est). Un joueur actuellement blessé n'est jamais concerné (ne pas jouer
// n'est alors pas un choix du coach). Multiplicateur plus sévère quand ce
// joueur note MIEUX (weightedRatingForPosition) que le titulaire
// actuellement aligné à son poste : c'est spécifiquement lui qui "devrait"
// être titulaire dans cette équipe.
const BENCH_FRUSTRATION_MAX_SECONDS = TRAINING_FULL_MATCH_SECONDS * 0.25; // ~7.5 min cumulées
const BENCH_FRUSTRATION_BASE_MALUS = 0.6; // points de Player.form perdus par semaine
const BENCH_FRUSTRATION_DESERVING_MULT = 3; // multiplicateur si meilleur que le titulaire à son poste

// ---------------------------------------------------------------------
// Entraînement à la BuzzerBeater : à la manière du vrai jeu, l'entraînement
// n'est PAS choisi joueur par joueur. Le club choisit UNE compétence pour la
// semaine, puis combien de postes elle couvre (1, 2, 3 ou 5 = toute
// l'équipe). Chaque compétence a un poste "de prédilection" (100% d'aptitude)
// et les autres postes sont plus ou moins bons pour cette compétence selon
// leur distance sur la ligne Meneur–Arrière–Ailier shooteur–Ailier fort–Pivot
// (-10% par poste d'écart). Étendre l'entraînement à plus de postes permet de
// faire progresser plus de joueurs, mais dilue le rendement de tout le monde.
const TRAINING_HOME_POSITION = {
  threePoint: "Arrière",
  midRange: "Ailier shooteur",
  inside: "Pivot",
  pass: "Meneur",
  rebound: "Pivot",
  block: "Pivot",
  dribble: "Meneur",
  agility: "Meneur",
  defOutside: "Arrière",
  defInside: "Pivot",
};

// Dilution du rendement selon le nombre de postes couverts cette semaine
// (1 poste = plein rendement, 2 = -15%, 3 = -30%, toute l'équipe = -50%).
const TRAINING_DILUTION_BY_POSITION_COUNT = { 1: 0, 2: 0.15, 3: 0.30, 4: 0.40, 5: 0.50 };

// Caractéristiques "naturelles" (fortes) de chaque poste — reprend les mêmes
// spécialités que generateAttrsForPosition (voir plus bas). Sert de base à
// la progression hebdomadaire simplifiée des équipes adverses (voir
// Team.trainWeekCPU / League.trainCpuTeams) : sans écran d'entraînement ni
// staff à gérer pour l'IA, chaque joueur CPU progresse un peu, chaque
// semaine, sur les caractéristiques de son poste — au même rythme
// calendaire que le club du joueur — pour que le niveau adverse ne reste
// pas figé (et donc de plus en plus faible) pendant qu'un club bien géré
// s'entraîne semaine après semaine.
const POSITION_STRONG_ATTRS = {
  "Meneur": ["pass", "dribble", "agility"],
  "Arrière": ["threePoint", "midRange"],
  "Ailier shooteur": ["threePoint", "defOutside"],
  "Ailier fort": ["inside", "rebound", "defInside"],
  "Pivot": ["inside", "rebound", "block", "defInside"],
};

function positionEfficiencyForSkill(skill, position) {
  const home = TRAINING_HOME_POSITION[skill];
  if (!home) return 100;
  const dist = Math.abs(POSITIONS.indexOf(position) - POSITIONS.indexOf(home));
  return clamp(100 - dist * 10, 1, 100);
}

// Classement des 5 postes du meilleur au moins bon pour une compétence
// donnée (utilisé pour proposer les combinaisons de postes à l'écran
// d'entraînement, dans le même esprit que le menu déroulant de BuzzerBeater).
function rankedPositionsForSkill(skill) {
  return [...POSITIONS].sort((a, b) => {
    const diff = positionEfficiencyForSkill(skill, b) - positionEfficiencyForSkill(skill, a);
    if (diff !== 0) return diff;
    return POSITIONS.indexOf(a) - POSITIONS.indexOf(b);
  });
}

// Combinaisons de postes proposées pour une compétence : des "fenêtres"
// glissantes de taille 1, 2 puis 3 sur le classement ci-dessus, plus
// l'option "toute l'équipe" (5 postes). Chaque option porte l'aptitude du
// meilleur poste qu'elle contient (comme dans BuzzerBeater) ; la dilution
// liée au nombre de postes est calculée séparément (voir Team.trainWeek).
function trainingPositionOptions(skill) {
  const ranked = rankedPositionsForSkill(skill);
  const options = [];
  [1, 2, 3].forEach(size => {
    for (let i = 0; i + size <= ranked.length; i++) {
      const positions = ranked.slice(i, i + size);
      const efficiency = positionEfficiencyForSkill(skill, positions[0]);
      options.push({ positions, efficiency });
    }
  });
  options.push({ positions: [...POSITIONS], efficiency: positionEfficiencyForSkill(skill, ranked[0]) });
  return options;
}

// La taille aide aussi : à poste égal, un grand gabarit progresse plus
// facilement sur les compétences "de grand" (jeu intérieur, rebond, contre,
// défense intérieure), et inversement un petit gabarit progresse plus
// facilement sur les compétences "de petit" (dribble, agilité, tir extérieur,
// passe, défense extérieure). Le tir à mi-distance est neutre.
const TRAINING_HEIGHT_AFFINITY = {
  inside: "tall", rebound: "tall", block: "tall", defInside: "tall",
  dribble: "short", agility: "short", threePoint: "short", defOutside: "short", pass: "short",
  midRange: "neutral",
};
const HEIGHT_MIN = 178, HEIGHT_MAX = 222; // bornes observées sur l'ensemble des postes

function heightMultiplierForSkill(skill, height) {
  const affinity = TRAINING_HEIGHT_AFFINITY[skill] || "neutral";
  if (affinity === "neutral") return 1;
  const t = clamp((height - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN), 0, 1); // 0=petit, 1=grand
  return affinity === "tall" ? (0.75 + 0.5 * t) : (1.25 - 0.5 * t);
}

// ---------------------------------------------------------------------
// PROGRAMMES D'ENTRAÎNEMENT — à la BuzzerBeater, le club ne choisit plus une
// caractéristique brute mais un "programme" : soit une caractéristique pure
// (plein rendement, ex: Tir à 3 points), soit un ensemble de caractéristiques
// liées qui progressent ENSEMBLE mais chacune plus lentement (ex: Tir
// extérieur = mi-distance + trois points ; Tirs rapides = agilité +
// mi-distance + trois points + jeu intérieur). Plus un programme couvre de
// caractéristiques, plus le rendement PAR caractéristique est dilué — c'est
// raisonnable : un entraînement large fait progresser plus de monde/plus de
// facettes du jeu, mais jamais aussi vite qu'un entraînement pointu sur une
// seule caractéristique (voir WEIGHT_BY_PROGRAM_SIZE).
const WEIGHT_BY_PROGRAM_SIZE = { 1: 1.0, 2: 0.62, 3: 0.48, 4: 0.40, 5: 0.34 };

function makeTrainingProgram(label, attrs) {
  const weight = WEIGHT_BY_PROGRAM_SIZE[attrs.length] || 0.3;
  return { label, attrs: attrs.map(attr => ({ attr, weight })) };
}

const TRAINING_PROGRAMS = {
  // -- Programmes "purs" (une seule caractéristique, plein rendement) --
  threePoint: makeTrainingProgram("Tir à 3 points", ["threePoint"]),
  midRange:   makeTrainingProgram("Tir à mi-distance", ["midRange"]),
  inside:     makeTrainingProgram("Jeu intérieur", ["inside"]),
  pass:       makeTrainingProgram("Passe", ["pass"]),
  rebound:    makeTrainingProgram("Rebond", ["rebound"]),
  block:      makeTrainingProgram("Contre", ["block"]),
  dribble:    makeTrainingProgram("Dribble", ["dribble"]),
  agility:    makeTrainingProgram("Agilité", ["agility"]),
  defOutside: makeTrainingProgram("Défense extérieure", ["defOutside"]),
  defInside:  makeTrainingProgram("Défense intérieure", ["defInside"]),
  // Retour utilisateur (2026-09) : "Ajoute les entrainements lancer franc et
  // endurance", les deux caractéristiques existaient déjà dans ATTRS (voir
  // le grand commentaire au-dessus d'ATTRS) mais n'étaient pas encore
  // entraînables via un programme dédié.
  freeThrow:  makeTrainingProgram("Lancer franc", ["freeThrow"]),
  endurance:  makeTrainingProgram("Endurance", ["endurance"]),
  // -- Programmes composites (plusieurs caractéristiques liées, rendement
  // dilué par caractéristique — voir WEIGHT_BY_PROGRAM_SIZE) --
  outsideShot: makeTrainingProgram("Tir extérieur", ["midRange", "threePoint"]),
  playmaking:  makeTrainingProgram("Meneur de jeu", ["pass", "dribble"]),
  allroundDef: makeTrainingProgram("Défense polyvalente", ["defOutside", "defInside"]),
  quickShots:  makeTrainingProgram("Tirs rapides", ["agility", "midRange", "threePoint", "inside"]),
};

// Aptitude d'un poste pour un PROGRAMME entier = moyenne (pondérée par le
// poids de chaque caractéristique dans le programme) de son aptitude sur
// chacune des caractéristiques qui le composent — un programme comme "Tirs
// rapides" mélange des caractéristiques dont le poste "naturel" diffère
// (agilité → Meneur, jeu intérieur → Pivot...), donc aucun poste unique n'est
// à 100% dessus, contrairement à un programme pur.
function positionEfficiencyForProgram(programKey, position) {
  const program = TRAINING_PROGRAMS[programKey];
  if (!program) return 100;
  // Défense polyvalente : cas particulier (retour utilisateur : "100% AS,
  // 90% AR ou AF, 80% M ou Pivot"). La moyenne défense extérieure/intérieure
  // ci-dessous donnerait une égalité à 4 postes sur 5 (Arrière, Ailier
  // shooteur, Ailier fort et Pivot tous à 85%, seul le Meneur en dessous) :
  // pas assez lisible pour choisir un poste. On récompense à la place le
  // poste le plus polyvalent au centre du spectre (Ailier shooteur, à
  // mi-chemin entre extérieur et intérieur), avec la même pente de -10% par
  // poste d'écart que positionEfficiencyForSkill ci-dessus, mais symétrique
  // vers les deux extrêmes (Meneur et Pivot, également désavantagés).
  if (programKey === "allroundDef") {
    const center = POSITIONS.indexOf("Ailier shooteur");
    const dist = Math.abs(POSITIONS.indexOf(position) - center);
    return clamp(100 - dist * 10, 1, 100);
  }
  let sum = 0, totalW = 0;
  program.attrs.forEach(({ attr, weight }) => {
    sum += positionEfficiencyForSkill(attr, position) * weight;
    totalW += weight;
  });
  return totalW ? sum / totalW : 100;
}

function rankedPositionsForProgram(programKey) {
  return [...POSITIONS].sort((a, b) => {
    const diff = positionEfficiencyForProgram(programKey, b) - positionEfficiencyForProgram(programKey, a);
    if (diff !== 0) return diff;
    return POSITIONS.indexOf(a) - POSITIONS.indexOf(b);
  });
}

function trainingPositionOptionsForProgram(programKey) {
  const ranked = rankedPositionsForProgram(programKey);
  const options = [];
  [1, 2, 3].forEach(size => {
    for (let i = 0; i + size <= ranked.length; i++) {
      const positions = ranked.slice(i, i + size);
      const efficiency = Math.round(positionEfficiencyForProgram(programKey, positions[0]));
      options.push({ positions, efficiency });
    }
  });
  options.push({ positions: [...POSITIONS], efficiency: Math.round(positionEfficiencyForProgram(programKey, ranked[0])) });
  return options;
}

// Gabarit "moyen" d'un programme pour un joueur = moyenne pondérée des
// multiplicateurs de gabarit de chacune de ses caractéristiques (voir
// heightMultiplierForSkill) — seulement utilisé pour l'affichage récapitulatif
// (le calcul réel, caractéristique par caractéristique, est fait dans
// Team.trainWeek).
function heightMultiplierForProgram(programKey, height) {
  const program = TRAINING_PROGRAMS[programKey];
  if (!program) return 1;
  let sum = 0, totalW = 0;
  program.attrs.forEach(({ attr, weight }) => {
    sum += heightMultiplierForSkill(attr, height) * weight;
    totalW += weight;
  });
  return totalW ? sum / totalW : 1;
}

// ---------------------------------------------------------------------
// ENTRAÎNEUR (staff) — n'a AUCUN effet sur les matchs, uniquement sur la
// vitesse de progression à l'entraînement (voir Team.trainWeek). Niveau 1
// à 5 : plus le niveau est élevé, plus le bonus de progression est grand,
// mais plus le salaire de départ est cher ET augmente vite chaque semaine —
// ce qui pousse à congédier/réembaucher régulièrement (environ une saison à
// une saison et demie pour un entraîneur de niveau intermédiaire) plutôt que
// de garder indéfiniment le même. Congédier puis réembaucher (même niveau ou
// un autre) réinitialise le salaire à sa valeur de départ.
const TRAINER_LEVELS = [1, 2, 3, 4, 5];
const TRAINER_BASE_SALARY = { 1: 800, 2: 1600, 3: 3000, 4: 5500, 5: 10000 };
const TRAINER_WEEKLY_GROWTH = { 1: 0.010, 2: 0.016, 3: 0.024, 4: 0.034, 5: 0.046 };
const TRAINER_TRAINING_BONUS = { 1: 0.06, 2: 0.12, 3: 0.18, 4: 0.24, 5: 0.30 };

// Analyste vidéo (voir Team.videoAnalyst/League.runVideoSession plus bas) —
// nombre de caractéristiques (sur ATTRS.length = 10) révélées par séance
// vidéo, selon le niveau de l'analyste. VOLONTAIREMENT plafonné SOUS 10 même
// au niveau maximum (retour utilisateur, 2026-09 : "il faut trouver un
// système qui ne permet pas de voir toutes les caractéristiques des joueurs
// sinon c'est trop facile"). Mapping 1:1, volontairement simple, deuxième
// correctif suite à un nouveau retour utilisateur resserrant encore le
// barème initial (qui allait jusqu'à 7/10) : "ça me semble trop, je dirai
// analyste video 1 etoile, c'est une carac, 5 étoiles c'est 5 caracs" — donc
// niveau N révèle exactement N caractéristiques. Même au niveau 5 (maximum),
// seules 5 des 10 caractéristiques sont révélées : au moins 5 restent
// TOUJOURS cachées, quel que soit le niveau de l'analyste. Une table
// explicite (plutôt qu'une formule) rend ce plafond immédiatement visible et
// facile à retoucher indépendamment de tout autre barème de staff.
const ANALYST_REVEAL_COUNT_BY_LEVEL = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
const CLUB_STARTING_BUDGET = 300000;

// Subvention de démarrage (retour utilisateur, à propos de BuzzerBeater :
// "quand tu commences, tu as 300 ou 500k au début / ensuite pendant 4
// semaines tu as 50k chaque semaine") : un nouveau club touche un coup de
// pouce hebdomadaire pendant ses toutes premières semaines, le temps de
// generer ses premières recettes de billetterie et d'ajuster ses prix —
// sans ça, la masse salariale recalibrée sur des salaires réalistes (voir
// SALARY_BASELINE_OVERALL) peut largement dépasser ce qu'une toute petite
// salle de départ rapporte, avant même que le club ait eu une chance de
// s'organiser. Voir Team.trainWeek, qui l'applique tant que this.week est
// dans les STARTUP_SUBSIDY_WEEKS premières semaines de la carrière.
const STARTUP_SUBSIDY_AMOUNT = 50000;
const STARTUP_SUBSIDY_WEEKS = 4;

// Primes de fin de saison (retour utilisateur : "il faut prévoir des primes
// de montée en cas de montée et une prime de champion pour celui en DI (moins
// importante qu'une prime de montée)") — voir League.divisionOutcomeForUserTeam
// et seasonEndBonusFor plus bas. La prime de montée dépend de la division
// D'ARRIVÉE (plus généreuse en visant une division plus forte) — montants
// calés directement sur la grille communiquée par l'utilisateur (référence
// BuzzerBeater) : 1 500 000 $ pour la Division I, 750 000 $ pour la II,
// 450 000 $ pour la III, 300 000 $ pour la IV, 225 000 $ pour la V, et
// 225 000 $ pour toute division encore inférieure (valeur plancher — pas
// atteignable dans la pyramide actuelle à 6 niveaux, mais conservée si elle
// s'agrandit un jour). La prime de champion de Division I est volontairement
// plus modeste que la prime de montée EN Division I (« moins importante
// qu'une prime de montée » — retour utilisateur), puisqu'en Division I il
// n'y a plus de montée possible : seul le titre reste à jouer.
const PROMOTION_BONUS_BY_LEVEL = {
  1: 1500000, // montée en Division I (depuis la II)
  2: 750000,  // montée en Division II (depuis la III)
  3: 450000,  // montée en Division III (depuis la IV)
  4: 300000,  // montée en Division IV (depuis la V)
  5: 225000,  // montée en Division V (depuis la VI)
};
const PROMOTION_BONUS_FLOOR = 225000; // toute division en dessous de la V (valeur plancher)
const CHAMPION_BONUS_DIVISION_I = 600000;

// Alerte de déficit économique + mise en vente forcée (retour utilisateur :
// "en cas de déficit économique trop important, message d'alerte, et si au
// bout de 2 semaines, la solution pas résolue, mise en vente de tous les
// joueurs pour 1 euro / on va mettre ce déficit à 500k"). BuzzerBeater est
// volontairement un jeu de gestion économique exigeant ("difficile de rester
// au plus haut en dépensant beaucoup" — retour utilisateur) : ce mécanisme
// n'est pas un bug à assouplir, c'est le dernier recours d'un club en
// quasi-faillite pour repartir d'un effectif dégraissé. Voir Team.trainWeek
// (suivi de deficitWeeks, semaines CONSÉCUTIVES sous le seuil) et
// Player.forSale/salePrice.
const DEFICIT_ALERT_THRESHOLD = -500000;
const DEFICIT_GRACE_WEEKS = 2;

// Droits TV (retour utilisateur : "il faut aussi prévoir les droits TV") :
// revenu hebdomadaire FIXE selon la division ACTUELLE du club (payé que le
// club entraîne ou pas, comme le salaire du staff et la masse salariale —
// voir Team.trainWeek), qui grimpe avec le prestige de la division. Montants
// dérivés de la grille des primes de montée ci-dessus (÷ 60, un ordre de
// grandeur cohérent avec un gros versement PONCTUEL comparé à un revenu
// RÉCURRENT) plutôt que choisis au hasard : 25 000 $/semaine en Division I,
// jusqu'à 2 500 $/semaine en Division VI. Reste nettement sous la masse
// salariale (même celle, modeste, d'un effectif tout juste débutant — voir
// generateStartingRoster) : un complément de revenu, pas de quoi financer un
// effectif à soi seul.
const TV_RIGHTS_WEEKLY_BY_LEVEL = {
  1: 25000,
  2: 12500,
  3: 7500,
  4: 5000,
  5: 3750,
  6: 2500,
};

// ---------------------------------------------------------------------
// Marché des transferts (retour utilisateur : "un vrai marché des transferts
// (acheter/vendre des joueurs entre managers, pas juste la vente forcée à
// 1€)") — voir League.listPlayerForSale / placeBid / refreshMarket plus bas.
// Système D'ENCHÈRES (pas de vente à prix fixe, retour utilisateur : "systeme
// d'enchere sur 3 jours c'est bien") : chaque joueur listé part aux enchères
// pour TRANSFER_AUCTION_DURATION_MS, en temps RÉEL (Date.now()), pas en
// semaines de jeu, à la façon d'un jeu persistant comme BuzzerBeater, même si
// ce club se joue par ailleurs en simulation instantanée. Incrément minimum
// entre deux enchères successives (retour utilisateur : "minimum de 1K à
// mettre pour enchérir ou 20%") : le plus grand des deux.
// Retour utilisateur (2026-09) : "pour le moment, il faudrait que les
// durées pour les enchères joueurs et staff soient de seulement 1 jour au
// lieu de 3" : raccourci à 1 jour ("pour le moment", donc pas forcément
// définitif). COACH_AUCTION_DURATION_MS (plus bas) suit automatiquement
// (même durée, voir son propre commentaire), donc ce seul changement couvre
// aussi bien le marché des transferts que celui du staff (entraîneur,
// analyste vidéo, recruteur).
// ---------------------------------------------------------------------
const TRANSFER_AUCTION_DURATION_MS = 1 * 24 * 60 * 60 * 1000; // 1 jour réel
const TRANSFER_MIN_INCREMENT_FLAT = 1000;
const TRANSFER_MIN_INCREMENT_PCT = 0.20;
// Rythme auquel les équipes adverses (CPU) "consultent" le marché — pas à
// chaque appel de refreshMarket (ça simulerait une agitation irréaliste si
// l'utilisateur rouvre l'onglet Marché plusieurs fois de suite), mais environ
// une fois par jour réel écoulé, par enchère (pour les enchères) ou pour la
// ligue entière (pour de nouvelles annonces CPU) — jusqu'à 3 vérifications
// sur la durée d'une enchère de 3 jours.
const TRANSFER_CPU_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TRANSFER_CPU_LIST_CHANCE = 0.12; // par équipe CPU, par vérification
const TRANSFER_CPU_BID_CHANCE = 0.35;  // par équipe CPU intéressée, par vérification

// ---------------------------------------------------------------------
// Marché des entraîneurs (retour utilisateur : "l'entraineur doit être
// acheté comme un joueur sur un espece de marche des entraineurs. c'est une
// vente aux enchères. son salaire doit augmenter toutes les semaines pour
// forcer à changer regulierement d'entraineur.") — même mécanique
// d'enchères en temps réel que le marché des transferts ci-dessus (voir
// League.generateCoachCandidate/placeCoachBid/_resolveCoachListing/
// refreshCoachMarket plus bas), à une différence près : un candidat
// entraîneur n'appartient à AUCUNE équipe au départ (pas de "vendeur"), le
// marché le génère lui-même — comme un vivier d'agents libres toujours
// partiellement renouvelé (voir COACH_MARKET_MIN_OPEN_LISTINGS). La
// croissance hebdomadaire du salaire une fois embauché (déjà en place, voir
// trainerWeeklySalary/TRAINER_WEEKLY_GROWTH) N'EST PAS modifiée par ce
// marché : c'est elle qui force déjà à changer régulièrement d'entraîneur ;
// l'enchère remplace seulement le prix de départ fixe (TRAINER_BASE_SALARY)
// par une mise aux enchères — voir _resolveCoachListing pour le détail.
// ---------------------------------------------------------------------
const COACH_AUCTION_DURATION_MS = TRANSFER_AUCTION_DURATION_MS; // même durée (3 jours réels)
// Le marché essaie toujours de garder au moins ce nombre de candidats
// ouverts aux enchères, pour qu'il y ait toujours quelque chose à acheter
// (contrairement au marché des transferts, où de nouvelles annonces CPU ne
// sont que probables — ici personne ne "vend" spontanément, donc sans ce
// plancher le marché pourrait rester vide). Relevé de 2 à 6 (retour
// utilisateur, 2026-09 : "générer plus de staff pour la période de test à
// 10 joueurs") : partagé par les 3 marchés de staff (entraîneurs,
// analystes, recruteurs, voir refreshMarket/refreshAnalystMarket/
// refreshRecruiterMarket), 2 candidats ouverts en permanence suffisaient
// pour une poignée de managers mais affamait/faisait s'affronter en
// permanence les 10 managers humains de la ligue de test sur trop peu de
// choix à la fois.
const COACH_MARKET_MIN_OPEN_LISTINGS = 6;
const COACH_MARKET_GENERATE_CHECK_INTERVAL_MS = TRANSFER_CPU_CHECK_INTERVAL_MS;
const COACH_CPU_BID_CHANCE = TRANSFER_CPU_BID_CHANCE;

// ---------------------------------------------------------------------
// ACADÉMIE DE JEUNES (retour utilisateur, 2026-09) — TROISIÈME rôle de staff,
// le recruteur (voir Team.recruiter/League.recruiterListings plus bas, même
// forme/marché aux enchères que l'entraîneur/l'analyste vidéo ci-dessus,
// réutilisant TRAINER_LEVELS/TRAINER_BASE_SALARY telles quelles). Tant qu'un
// recruteur est sous contrat, CE club (et lui seul — jamais partagé avec les
// autres managers, contrairement aux marchés ci-dessus) reçoit
// périodiquement des propositions de jeunes prospects (15-17 ans, voir
// Team.youthCandidates/refreshYouthCandidates) — leurs attributs ACTUELS
// sont visibles immédiatement, mais leur potentiel réel reste caché pendant
// TOUTE la phase académie (candidat non signé OU jeune déjà signé mais pas
// encore promu en pro) derrière un label grossier à 3 bandes (voir
// youthProspectLabel) — jamais la fourchette numérique ni le potentiel
// exact, exposé seulement à la promotion (Team.promoteYouthPlayer).
// ---------------------------------------------------------------------
const MAX_YOUTH_ROSTER_SIZE = 15; // effectif jeunes maximum une fois signés (Team.youthPlayers)
const YOUTH_TRAINEE_WEEKLY_SALARY = 200; // salaire hebdo FIXE d'un stagiaire, indépendant de ses attributs/potentiel
const YOUTH_CANDIDATE_QUEUE_MAX = 5; // jamais plus de 5 propositions non traitées à la fois (évite une file qui déborde pendant une absence prolongée)
const YOUTH_CANDIDATE_EXPIRY_MS = COACH_AUCTION_DURATION_MS; // même fenêtre que le marché du staff (3 jours réels) avant qu'une proposition non traitée expire
// Probabilité, PAR TICK D'ENTRAÎNEMENT (même cadence que Team.trainWeek —
// une fois par jour civil en ligue multi-manager ancrée quotidienne, voir
// refreshYouthCandidates), qu'une NOUVELLE proposition apparaisse pour ce
// club — croissante avec le niveau du recruteur : un recruteur niveau 5
// propose environ 5x plus souvent qu'un niveau 1.
const YOUTH_CANDIDATE_DAILY_CHANCE_BY_LEVEL = { 1: 0.12, 2: 0.20, 3: 0.32, 4: 0.48, 5: 0.65 };
// Qualité moyenne des attributs de départ d'un candidat : multiplicateur
// appliqué à la fourchette 10-30 (et au tirage "outil brut" 31-40 ci-dessous)
// — même mécanique que le `tier` de generateAttrsForPosition — croissante
// avec le niveau du recruteur : "plus fréquent ET de meilleure qualité en
// moyenne", comme demandé.
const YOUTH_QUALITY_TIER_BY_LEVEL = { 1: 1.0, 2: 1.08, 3: 1.16, 4: 1.26, 5: 1.4 };
// Probabilité qu'1 ou 2 des 10 attributs d'un candidat reçoivent un tirage
// plus haut (31-40 au lieu de 10-30) pour représenter un "outil brut" déjà
// repéré par le recruteur — ~20 à 32% selon le niveau du recruteur (un
// meilleur recruteur repère plus souvent un talent qui sort du lot).
const YOUTH_STANDOUT_CHANCE_BY_LEVEL = { 1: 0.20, 2: 0.23, 3: 0.26, 4: 0.29, 5: 0.32 };
// Poids "de base" (avant multiplicateur du Centre de formation, voir
// TRAINING_CENTER_LEVELS plus bas) appliqué à CHACUNE des 10 caractéristiques
// d'un jeune à chaque progression automatique (voir Team.growYouthPlayers) —
// volontairement MODESTE (contrairement à l'entraînement ciblé de l'effectif
// pro, qui peut atteindre un poids de 1 sur la/les caractéristique(s)
// choisie(s)) : un jeune progresse un peu sur TOUT (pas de sélection de
// programme/poste, délibéré — pas de micro-management pour l'académie de
// jeunes), jamais aussi vite qu'un entraînement pro ciblé.
const YOUTH_BASE_TRAINING_WEIGHT = 0.4;

// Taille d'effectif : MIN_ROSTER_SIZE n'est PLUS un plancher de vente (retour
// utilisateur : "on peut vendre tout son effectif si on le souhaite" — voir
// Team.sellPlayer/League.listPlayerForSale, qui n'appliquent plus aucune
// limite basse) ; elle ne sert plus qu'à décider si une équipe CPU peut
// générer une NOUVELLE annonce d'elle-même (voir refreshMarket, prudence
// distincte pour ne pas voir un adversaire se vider spontanément). Le
// plafond, lui, reste en vigueur pour ne pas accumuler un effectif
// surdimensionné via les achats.
const MIN_ROSTER_SIZE = 5;
const MAX_ROSTER_SIZE = 22;

// Score d'un match perdu par forfait (retour utilisateur : "si on n'a plus
// suffisamment de joueurs sur la feuille de match, c'est forfait 20 à 0") —
// voir Team.hasValidLineup/simulateOrForfeit plus bas : une équipe qui ne
// peut plus aligner les 5 postes de sa feuille de match (effectif insuffisant,
// le plus souvent après avoir vendu massivement sur le marché des
// transferts) perd par forfait plutôt que de bloquer la suite de la saison.
const FORFEIT_SCORE = 20;

// Valeur marchande ESTIMÉE d'un joueur (prix de départ suggéré pour une mise
// aux enchères, et base de comparaison pour l'intérêt/l'enchère max d'une
// équipe CPU) : un multiple du salaire hebdomadaire (voir salaryForOverall),
// plus élevé pour un jeune joueur (marge de progression revendable) que pour
// un joueur en fin de carrière (peu d'avenir) — pas une science exacte, juste
// un ancrage cohérent avec la grille salariale déjà calibrée.
function marketValueMultiplierForAge(age) {
  if (age <= 21) return 85;
  if (age <= 24) return 65;
  if (age <= 27) return 45;
  if (age <= 30) return 28;
  if (age <= 33) return 16;
  return 8;
}
function estimateMarketValue(player) {
  return Math.max(500, Math.round(player.salary * marketValueMultiplierForAge(player.age)));
}

// Incrément minimum au-dessus d'un montant donné, et enchère minimale
// valable pour une annonce donnée (le prix de départ si personne n'a encore
// enchéri, sinon l'enchère actuelle + l'incrément minimum).
function transferMinIncrement(amount) {
  return Math.max(TRANSFER_MIN_INCREMENT_FLAT, Math.round(amount * TRANSFER_MIN_INCREMENT_PCT));
}
function minNextBidFor(listing) {
  if (!listing.currentBid) return listing.startPrice;
  return listing.currentBid + transferMinIncrement(listing.currentBid);
}

// Salaire hebdomadaire courant d'un entraîneur, en fonction de son niveau et
// du nombre de semaines déjà passées en poste (croissance composée).
// `baseOverride` (optionnel) : salaire de départ RÉEL de CET entraîneur si
// différent de TRAINER_BASE_SALARY[level] — c'est le cas depuis l'ajout du
// marché aux enchères des entraîneurs (voir League._resolveCoachListing et
// Team.hireTrainer) : la mise gagnante devient le salaire de départ, pas le
// tarif fixe par niveau. `!= null` (et pas juste falsy) pour ne pas ignorer
// à tort un baseOverride de 0.
function trainerWeeklySalary(level, weeksEmployed, baseOverride) {
  const base = baseOverride != null ? baseOverride : (TRAINER_BASE_SALARY[level] || 0);
  const growth = TRAINER_WEEKLY_GROWTH[level] || 0;
  return Math.round(base * Math.pow(1 + growth, weeksEmployed));
}

// ---------------------------------------------------------------------
// Salle (arena) : 8 paliers de capacité, chacun agrandissable une fois le
// budget suffisant. Seuls les matchs à DOMICILE rapportent une recette de
// billetterie (voir Team.simulateHomeAttendance) — pas d'effet sur les
// matchs eux-mêmes, uniquement sur l'économie du club.
//
// Capacité de départ recalibrée 2026-09 (retour utilisateur, à propos de
// BuzzerBeater : "la salle au début fait 5000 places") — reste alignée
// avec la grille salariale recalibrée sur BuzzerBeater (voir
// SALARY_BASELINE_OVERALL) : toute la pyramide de paliers a été décalée
// vers le haut en conséquence (progression relative inchangée).
// ---------------------------------------------------------------------
const ARENA_LEVELS = [
  { level: 1, name: "Petit gymnase", capacity: 5000, upgradeCost: 0 },
  { level: 2, name: "Gymnase municipal", capacity: 8000, upgradeCost: 150000 },
  { level: 3, name: "Salle omnisports", capacity: 12000, upgradeCost: 300000 },
  { level: 4, name: "Petite arena", capacity: 17000, upgradeCost: 550000 },
  { level: 5, name: "Arena", capacity: 22000, upgradeCost: 900000 },
  { level: 6, name: "Grande arena", capacity: 28000, upgradeCost: 1500000 },
  { level: 7, name: "Arena régionale", capacity: 35000, upgradeCost: 2400000 },
  { level: 8, name: "Arena nationale", capacity: 45000, upgradeCost: 3600000 },
];

function arenaInfo(level) {
  return ARENA_LEVELS.find(a => a.level === level) || ARENA_LEVELS[0];
}

// ---------------------------------------------------------------------
// Centre de formation : facilité de l'académie de jeunes, tiered EXACTEMENT
// comme ARENA_LEVELS ci-dessus (Team.trainingCenterLevel, démarre à 1) — un
// palier plus élevé accélère la progression AUTOMATIQUE des jeunes (voir
// Team.growYouthPlayers/trainingCenterGrowthMultiplier), jamais celle de
// l'effectif pro (qui dépend de l'entraîneur/TRAINER_TRAINING_BONUS,
// totalement séparé). 5 paliers (comme TRAINER_LEVELS) plutôt que les 8
// d'ARENA_LEVELS : l'académie de jeunes est un investissement plus ciblé (15
// jeunes maximum, jamais toute l'économie du club comme la salle), pas
// besoin d'une granularité aussi fine. Coûts calibrés sur le même ordre de
// grandeur que les premiers paliers d'ARENA_LEVELS — nettement moins cher
// qu'agrandir toute une salle, cohérent avec un investissement plus modeste
// et ciblé. `growthMultiplier` multiplie directement le rendement de
// Team.growYouthPlayers (voir Player.trainWeek, paramètre `trainerMult`).
// ---------------------------------------------------------------------
const TRAINING_CENTER_LEVELS = [
  { level: 1, name: "Terrain arrière", upgradeCost: 0, growthMultiplier: 1.0 },
  { level: 2, name: "Centre régional", upgradeCost: 80000, growthMultiplier: 1.3 },
  { level: 3, name: "Centre labellisé", upgradeCost: 200000, growthMultiplier: 1.7 },
  { level: 4, name: "Académie", upgradeCost: 450000, growthMultiplier: 2.2 },
  { level: 5, name: "Académie d'élite", upgradeCost: 850000, growthMultiplier: 2.8 },
];

function trainingCenterInfo(level) {
  return TRAINING_CENTER_LEVELS.find(t => t.level === level) || TRAINING_CENTER_LEVELS[0];
}

// ---------------------------------------------------------------------
// Catégories de places, chacune avec son propre prix réglable : une salle
// n'est pas un seul tarif unique, les gradins populaires, la tribune et les
// loges VIP ont chacun leur budget et leur tolérance au prix (une loge VIP
// reste pleine à 70€ quand des gradins vident à 20€). shareOfCapacity se
// répartit la capacité totale de la salle (somme = 1).
// ---------------------------------------------------------------------
// Prix par défaut calés sur le plafond de confort (comfortCeiling) de
// chaque catégorie : aucun impact sur l'affluence (voir
// ticketPriceComfortFactor) tout en partant d'une billetterie réaliste —
// recalibré 2026-09 aux côtés de la grille salariale (voir SALARY_BASELINE_
// OVERALL plus haut) pour qu'une salle bien remplie à un bon niveau de
// division rapporte des recettes cohérentes avec des salaires eux-mêmes
// recalés sur des données réelles de BuzzerBeater.
const SEAT_CATEGORIES = [
  { key: "gradins", name: "Gradins populaires", shareOfCapacity: 0.55, defaultPrice: 15, minPrice: 3, maxPrice: 40, comfortCeiling: 15, comfortSlope: 0.03 },
  { key: "tribune", name: "Tribune couverte", shareOfCapacity: 0.30, defaultPrice: 30, minPrice: 8, maxPrice: 80, comfortCeiling: 30, comfortSlope: 0.02 },
  { key: "loge", name: "Loges VIP", shareOfCapacity: 0.15, defaultPrice: 70, minPrice: 15, maxPrice: 200, comfortCeiling: 70, comfortSlope: 0.012 },
];

function seatCategoryInfo(key) {
  return SEAT_CATEGORIES.find(c => c.key === key) || SEAT_CATEGORIES[0];
}

// Confort tarifaire du prix du billet POUR UNE CATÉGORIE DE PLACE donnée :
// zone de confort jusqu'à son plafond propre (comfortCeiling), puis chaque
// euro supplémentaire fait fuir une partie du public de cette catégorie (la
// pente diffère : les loges VIP tolèrent un prix bien plus élevé que les
// gradins avant de perdre du monde). Un prix bas (sous le plafond) n'a lui
// aucun effet négatif sur le taux de remplissage.
function ticketPriceComfortFactor(price, categoryKey) {
  const cat = seatCategoryInfo(categoryKey);
  if (price <= cat.comfortCeiling) return 1;
  return clamp(1 - (price - cat.comfortCeiling) * cat.comfortSlope, 0.15, 1);
}

// ---------------------------------------------------------------------
// Boutique des supporters : un investissement UNIQUE (comme la salle), mais
// qui rapporte ensuite un revenu FIXE chaque semaine (payé dans
// Team.trainWeek, aux côtés du salaire du staff), sans dépendre de la
// fréquentation des matchs — un revenu récurrent indépendant de la
// billetterie.
// ---------------------------------------------------------------------
// Revenus recalibrés 2026-09 (retour utilisateur : "il faudrait revoir les
// revenus hebdomadaires supplémentaires procurés par les infrastructures, ce
// n'est pas suffisant, ça fait environ 54 semaines pour rentabiliser [...]
// faut pas oublier que c'est un jeu et que ça doit aller vite" puis "une
// vingtaine de semaines serait plus raisonnable") : chaque palier, coût
// INCRÉMENTAL par rapport au précédent, se rentabilise maintenant en environ
// 20 semaines (weeklyRevenue = revenu TOTAL à ce palier, donc le gain apporté
// par un palier = weeklyRevenue - weeklyRevenue du palier précédent), contre
// 45 à 58 semaines avant recalibrage. Coûts inchangés, seuls les revenus
// montent.
const FAN_SHOP_LEVELS = [
  { level: 0, name: "Aucune boutique", cost: 0, weeklyRevenue: 0 },
  { level: 1, name: "Stand souvenirs", cost: 40000, weeklyRevenue: 2000 },
  { level: 2, name: "Boutique du club", cost: 120000, weeklyRevenue: 6000 },
  { level: 3, name: "Boutique officielle", cost: 300000, weeklyRevenue: 15000 },
];

function fanShopInfo(level) {
  return FAN_SHOP_LEVELS.find(f => f.level === level) || FAN_SHOP_LEVELS[0];
}

// ---------------------------------------------------------------------
// Autres infrastructures du club (retour utilisateur, 2026-09 : "il faudrait
// [...] mettre les autres améliorations [...] station tv [...] salle de
// soin, SPA, salle de musculation") — même principe qu'ARENA_LEVELS/
// FAN_SHOP_LEVELS/TRAINING_CENTER_LEVELS ci-dessus (investissement UNIQUE, un
// palier à la fois, jamais remboursable), regroupées ici sous une structure
// commune (CLUB_FACILITIES) plutôt que dupliquées trois fois. Chaque
// infrastructure n'apporte qu'UN effet ciblé et simple, sur un registre
// différent de la salle/boutique/centre de formation existants (inchangés) :
//   - Station TV : revenu hebdomadaire fixe supplémentaire (comme la
//     boutique des supporters), payé dans Team.trainWeek.
//   - Salle de musculation : réduit le risque de blessure en match (voir
//     MatchEngine.applyFatigue, injuryRiskMult).
//   - Espace bien-être (spa + salle de soin réunis en UNE seule
//     infrastructure, les deux idées du retour utilisateur étant redondantes)
//     : réduit l'accumulation de fatigue en match (voir MatchEngine.
//     applyFatigue, fatigueMult) — joueurs plus frais en fin de match.
// 4 paliers chacune (retour utilisateur explicite : "il faut 4 niveaux
// (rien, pas cher, moyen cher, cher)"), le niveau 0 valant toujours "rien
// construit, aucun effet".
// ---------------------------------------------------------------------
const CLUB_FACILITIES = {
  tvStation: {
    name: "Station TV",
    icon: "",
    levels: [
      // Revenus recalibrés 2026-09 pour une rentabilisation d'environ 20
      // semaines par palier (coût incrémental / gain incrémental) : voir le
      // commentaire de FAN_SHOP_LEVELS plus haut pour le détail du calcul.
      { level: 0, name: "Aucune station TV", cost: 0, weeklyRevenue: 0 },
      { level: 1, name: "Studio local", cost: 60000, weeklyRevenue: 3000 },
      { level: 2, name: "Chaîne régionale", cost: 170000, weeklyRevenue: 8500 },
      { level: 3, name: "Chaîne du club", cost: 400000, weeklyRevenue: 20000 },
    ],
  },
  gym: {
    name: "Salle de musculation",
    icon: "",
    levels: [
      { level: 0, name: "Aucune salle de musculation", cost: 0, injuryRiskMult: 1 },
      { level: 1, name: "Salle basique", cost: 45000, injuryRiskMult: 0.90 },
      { level: 2, name: "Salle équipée", cost: 130000, injuryRiskMult: 0.78 },
      { level: 3, name: "Salle haut de gamme", cost: 300000, injuryRiskMult: 0.65 },
    ],
  },
  wellness: {
    name: "Espace bien-être (spa et soins)",
    icon: "",
    levels: [
      { level: 0, name: "Aucun espace bien-être", cost: 0, fatigueMult: 1 },
      { level: 1, name: "Espace détente", cost: 45000, fatigueMult: 0.93 },
      { level: 2, name: "Spa du club", cost: 130000, fatigueMult: 0.85 },
      { level: 3, name: "Centre de récupération", cost: 300000, fatigueMult: 0.75 },
    ],
  },
};

function facilityInfo(key, level) {
  const cfg = CLUB_FACILITIES[key];
  if (!cfg) return null;
  return cfg.levels.find(l => l.level === level) || cfg.levels[0];
}

// ---------------------------------------------------------------------
// Humeur des supporters (0 à 100, neutre à 50 au départ) : des supporters
// contents viennent plus facilement aux matchs (voir attendanceBaseForMorale,
// qui remplace l'ancienne base fixe de remplissage) ET tolèrent des prix de
// billet plus élevés avant de déserter les gradins (voir moraleForgiveness,
// qui assouplit le plafond de confort tarifaire de chaque catégorie de
// place). Évolue avec les résultats sportifs (Team.applyMoraleForResult,
// appelé à chaque match) et dérive lentement selon le confort tarifaire
// moyen (Team.trainWeek, indépendamment des résultats).
// ---------------------------------------------------------------------
function attendanceBaseForMorale(morale) {
  return clamp(0.45 + (morale / 100) * 0.5, 0.2, 0.95);
}

function moraleForgiveness(morale) {
  return clamp(0.85 + (morale / 100) * 0.3, 0.85, 1.15);
}

function moraleLabel(morale) {
  if (morale >= 85) return "En feu";
  if (morale >= 65) return "Enthousiastes";
  if (morale >= 45) return "Satisfaits";
  if (morale >= 25) return "Mécontents";
  return "En colère";
}

// ---------------------------------------------------------------------
// MÉDIAS : interviews de jalon (voir Team.pendingInterviews/
// applyMoraleForResult/resolveInterview/skipInterview). Retour utilisateur,
// 2026-09 : l'interview classique d'après CHAQUE match (un ton parmi trois,
// effet immédiat sur l'humeur des supporters, réponse sous 2h) a été
// retirée ("on enlève ça") au profit du seul système "de jalon" ci-dessous,
// réservé à CINQ moments clés de la saison plutôt qu'à chaque match : début
// de saison, mi-saison, fin de saison régulière, demi-finale de play-offs,
// finale de play-offs ("on peut ajouter un interview post finale de PO, en
// cas de victoire ou défaite. idem pour le début de saison"). Un délai de
// réponse de 3 jours réels (au lieu de 2h), un effet chiffré plus élevé sur
// l'humeur des SUPPORTERS (MILESTONE_INTERVIEW_TONES.fanWin/fanLoss), et un
// effet sur la forme des JOUEURS ayant disputé ce match précis
// (MILESTONE_INTERVIEW_TONES.formWin/formLoss, voir Team.resolveInterview).
// Trois tons, chacun avec un vrai compromis plutôt qu'un simple
// "mieux/moins bien" :
//   - Agressif : amplifie le résultat. Le gain le plus élevé en cas de
//     victoire (jouer les gros bras après un succès plaît aux supporters),
//     mais aussi la pénalité la plus lourde en cas de défaite (l'arrogance
//     après une défaite les agace davantage).
//   - Mesuré : petit effet sûr, toujours dans le sens du résultat, sans
//     risque particulier. Le choix "par défaut" pour qui ne veut pas y
//     réfléchir.
//   - Humble : gain plafonné bas en cas de victoire (pas de vantardise), mais
//     seul ton qui tourne une défaite en effet NET POSITIF (`loss` > 0) : les
//     supporters pardonnent plus volontiers un coach qui reconnaît ses torts.
// Les deltas ci-dessous s'ajoutent au delta DÉJÀ appliqué par
// applyMoraleForResult au moment du match lui-même (le résultat sportif
// reste toujours le facteur dominant, ceci n'est qu'un supplément de
// personnalité). Ignorer l'interview (Team.skipInterview) reste toujours
// l'option à effet nul.
// ---------------------------------------------------------------------

// Cinq moments déclenchés côté serveur (voir Engine.milestoneTypeForRound
// pour début de saison/mi-saison/fin de saison régulière,
// League.recordPlayoffGameResult/_queuePlayoffSeriesInterview pour les deux
// derniers) : uniquement des ÉTIQUETTES d'affichage ici, la mécanique elle-
// même (tons/citations/deltas) est dans MILESTONE_INTERVIEW_TONES/
// MILESTONE_INTERVIEW_QUOTES juste en dessous.
const MILESTONE_INTERVIEW_TYPES = {
  "debut-saison": { label: "Interview de début de saison" },
  "mi-saison": { label: "Interview de mi-saison" },
  "fin-saison-reguliere": { label: "Bilan de fin de saison régulière" },
  "demi-finale-po": { label: "Interview d'après demi-finale de play-offs" },
  "finale-po": { label: "Interview d'après la finale des play-offs" },
};

// Vraies questions de journaliste posées à CHAQUE interview de jalon (retour
// utilisateur, 2026-09 : "mets un vrai pop up pour l'interview [...] mets 2/3
// questions quand même, et pose des vraies questions, c'est pas ouf quand
// même là (comment voyez-vous cette saison ? quels sont vos objectifs ?...)")
// : deux questions par jalon. Correctif 2026-09 (retour utilisateur : "la
// possibilité de choisir le ton pour chacune [des questions] et pas
// uniquement un ton pour toutes les questions") : le ton se choisit
// désormais INDÉPENDAMMENT pour chaque question (voir
// Team.resolveInterview/interviewTranscriptFor, qui acceptent un TABLEAU de
// tons, un par question, dans le même ordre que ce tableau ; une chaîne
// unique reste acceptée en compatibilité ascendante et s'applique alors aux
// deux questions). MILESTONE_INTERVIEW_QUOTES juste en dessous porte
// toujours un tableau de deux réponses par {ton, issue}, une par question.
// Remplace l'ancien système (un seul bloc de texte générique + boutons de
// ton sans vraie question posée), jugé trop pauvre par le manager.
// Correctif 2026-09 (retour utilisateur : "la première interview [...] ne
// doit pas porter sur le resultat du premier match mais sur la saison à
// venir (objectif, joueur sur qui on compte...)") : les deux questions de
// "debut-saison" sont désormais tournées vers l'AVENIR (aucun match n'a
// encore été joué quand cette interview est mise en attente, voir
// Team.queueSeasonPreviewInterview) plutôt que vers un résultat.
const MILESTONE_INTERVIEW_QUESTIONS = {
  "debut-saison": [
    "Quels sont vos objectifs pour cette saison ?",
    "Sur quel joueur comptez-vous particulièrement cette saison ?",
  ],
  "mi-saison": [
    "Quel bilan tirez-vous de cette première moitié de saison ?",
    "Qu'est-ce qui doit changer pour la seconde moitié ?",
  ],
  "fin-saison-reguliere": [
    "Comment jugez-vous le parcours de votre équipe en saison régulière ?",
    "Dans quel état d'esprit abordez-vous la suite ?",
  ],
  "demi-finale-po": [
    "Que retenez-vous de cette demi-finale ?",
    "Comment préparez-vous la suite des play-offs ?",
  ],
  "finale-po": [
    "Quel sentiment domine au sortir de cette finale ?",
    "Qu'est-ce que ce résultat représente pour le club ?",
  ],
};

// Journée de mi-saison : aucune notion de "mi-saison" n'existait avant ce
// retour utilisateur, milieu ARRONDI PAR LE BAS du calendrier round-robin
// (toujours 18 journées 0-indexées pour une ligue à 10 équipes, identique
// entre calendrier classique et ancré quotidien, voir League.totalRounds) —
// donne la journée 9 (10e journée sur 18), le point le plus proche du milieu
// réel de la saison régulière. Factorisée ici plutôt que recopiée à chaque
// appelant, pour qu'un futur changement de taille de ligue ne fasse diverger
// qu'un seul endroit.
function midSeasonRound(totalRounds) {
  return Math.floor(totalRounds / 2);
}

// Type de jalon (ou `null`, cas normal) pour une journée de CHAMPIONNAT
// donnée — jamais pour la Coupe (aucun calendrier "mi-saison"/"fin de
// saison régulière" n'a de sens là-bas, voir le tableau à élimination direct
// CUP_STAGE_LABELS). Utilisé par finalizeRound (server/liveMatch.js) pour
// savoir quel type passer à Team.applyMoraleForResult.
// Correctif 2026-09 (retour utilisateur : "la première interview doit
// pouvoir se faire avant le début de saison et ne doit pas porter sur le
// resultat du premier match mais sur la saison à venir") : la journée 0 ne
// déclenche plus RIEN ici (elle redevient une journée de championnat comme
// une autre) — l'interview "début de saison" est désormais mise en attente
// AVANT le premier match, dès la création de la ligue (voir
// Team.queueSeasonPreviewInterview/buildLeagueWithHumanTeams), donc plus
// jamais liée au résultat d'un match précis.
function milestoneTypeForRound(round, totalRounds) {
  if (round === midSeasonRound(totalRounds)) return "mi-saison";
  if (round === totalRounds - 1) return "fin-saison-reguliere";
  return null;
}

// Trois tons (Agressif/Mesuré/Humble, voir le grand commentaire plus haut),
// avec DEUX deltas chacun : `fanWin`/`fanLoss` (humeur des supporters,
// échelle plus marquée qu'un match ordinaire, moment plus important) et
// `formWin`/`formLoss` (Player.form, échelle 1-100 comme fanMorale). Correctif
// 2026-09 (retour utilisateur : "tous les joueurs doivent être impactés par
// les interviews, les interviews sont sur des périodes de la saison et pas
// uniquement un match") : appliqué par Team.resolveInterview à TOUT
// l'effectif, jamais aux seuls joueurs ayant disputé LE match qui a
// déclenché le jalon, une interview de jalon porte sur une PÉRIODE entière
// (la première moitié de saison, toute la saison régulière...), pas sur un
// seul match, donc tout le monde l'entend et en est affecté, joueur du soir
// ou pas.
// `chemistryWin`/`chemistryLoss` (retour utilisateur, 2026-09 : "l'alchimie
// du groupe [...] peut être impactée par le coach lors de ses interviews",
// voir le grand commentaire de CHEMISTRY_ROSTER_CHANGE_MAX_RANK plus bas) :
// Team.chemistry, appliqué par Team.resolveInterview à TOUTE l'équipe, tout
// comme formWin/formLoss ci-dessus désormais, la cohésion du vestiaire
// dépend du discours du coach dans son ensemble, pas seulement de qui a
// joué. Un ton "Agressif"
// coûte toujours un peu de cohésion (l'égo individuel prime sur le
// collectif), pire encore après une défaite (chercher des excuses divise le
// vestiaire) ; un ton "Humble" (crédit aux coéquipiers, responsabilité
// assumée) est au contraire ce qui construit le plus de cohésion, même
// après une défaite ; "Mesuré" reste neutre à légèrement positif. Un vrai
// choix à faire pour le coach : "Agressif" est excellent pour les
// supporters mais coûte de la cohésion, "Humble" est l'inverse.
const MILESTONE_INTERVIEW_TONES = {
  "Agressif": { fanWin: 7,   fanLoss: -7, formWin: 4, formLoss: -4, chemistryWin: -1, chemistryLoss: -2 },
  "Mesuré":   { fanWin: 3,   fanLoss: -3, formWin: 2, formLoss: -2, chemistryWin: 1,  chemistryLoss: 0 },
  "Humble":   { fanWin: 1.5, fanLoss: 3,  formWin: 1, formLoss: 2,  chemistryWin: 2,  chemistryLoss: 1 },
};

// Citations "étoffées" (retour utilisateur : "une interview un peu
// étoffée"), une par {type de jalon, ton, résultat} : `{opponent}` remplacé
// par le nom de l'adversaire (voir Team.resolveInterview). Correctif 2026-09
// (retour utilisateur : voir MILESTONE_INTERVIEW_QUESTIONS ci-dessus) : chaque
// entrée `win`/`loss` porte désormais DEUX réponses au lieu d'une seule,
// dans le même ordre que les deux questions de MILESTONE_INTERVIEW_QUESTIONS
// pour ce jalon (index 0 = réponse à la 1re question, index 1 = réponse à la
// 2e). La 1re réponse reprend la citation d'origine (réaction au résultat du
// match), la 2e (nouvelle) répond à la question tournée vers la suite
// (objectifs/ajustements/état d'esprit), toujours dans l'esprit du ton
// choisi.
const MILESTONE_INTERVIEW_QUOTES = {
  // Correctif 2026-09 (retour utilisateur : "la première interview [...] ne
  // doit pas porter sur le resultat du premier match mais sur la saison à
  // venir (objectif, joueur sur qui on compte...)") : mise en attente AVANT
  // le premier match (voir Team.queueSeasonPreviewInterview), donc toujours
  // résolue avec `won: true` (aucun résultat à commenter, cadrage positif/
  // plein d'espoir de rentrée). `{player}` (voir interviewTranscriptFor) est
  // remplacé par le joueur le mieux noté à son poste de l'effectif
  // (weightedRatingForPosition), jamais `{opponent}` (aucun adversaire
  // concerné). Les entrées `loss` ci-dessous ne sont normalement jamais
  // lues (won toujours vrai pour ce jalon précis) : conservées identiques à
  // `win` uniquement pour respecter la même forme de données que les autres
  // jalons (voir le test qui vérifie que chaque {jalon, ton, issue} porte
  // bien une réponse par question).
  "debut-saison": {
    "Agressif": {
      win: [
        "L'objectif est clair pour cette saison : on vise le haut de tableau, on ne se fixe aucune limite.",
        "On compte énormément sur {player} pour tirer l'équipe vers le haut, c'est un joueur fait pour ce genre de responsabilités.",
      ],
      loss: [
        "L'objectif est clair pour cette saison : on vise le haut de tableau, on ne se fixe aucune limite.",
        "On compte énormément sur {player} pour tirer l'équipe vers le haut, c'est un joueur fait pour ce genre de responsabilités.",
      ],
    },
    "Mesuré": {
      win: [
        "L'objectif est de construire une équipe solide et de rester compétitifs sur la durée de la saison, sans se fixer de chiffre précis pour l'instant.",
        "{player} aura un rôle important cette saison, on compte sur sa régularité pour porter le collectif.",
      ],
      loss: [
        "L'objectif est de construire une équipe solide et de rester compétitifs sur la durée de la saison, sans se fixer de chiffre précis pour l'instant.",
        "{player} aura un rôle important cette saison, on compte sur sa régularité pour porter le collectif.",
      ],
    },
    "Humble": {
      win: [
        "On ne se fixe pas d'objectif chiffré, l'idée est de progresser ensemble match après match, en restant les pieds sur terre.",
        "Toute l'équipe devra apporter sa pierre à l'édifice, mais {player} aura un rôle important à jouer pour nous aider à progresser.",
      ],
      loss: [
        "On ne se fixe pas d'objectif chiffré, l'idée est de progresser ensemble match après match, en restant les pieds sur terre.",
        "Toute l'équipe devra apporter sa pierre à l'édifice, mais {player} aura un rôle important à jouer pour nous aider à progresser.",
      ],
    },
  },
  "mi-saison": {
    "Agressif": {
      win: [
        "On passe le cap de la mi-saison sur la meilleure dynamique possible, et {opponent} vient encore de le confirmer : personne ne veut vraiment nous affronter en ce moment.",
        "Pour la seconde moitié, on ne change rien : on continue sur cette lancée et on vise le plus haut possible.",
      ],
      loss: [
        "Cette défaite contre {opponent} ne change rien à nos ambitions pour la seconde moitié de saison, on reste le favori de cette division.",
        "Rien à changer sur le fond, on garde la même ambition pour la seconde moitié de saison.",
      ],
    },
    "Mesuré": {
      win: [
        "À mi-parcours, cette victoire contre {opponent} confirme qu'on est sur la bonne trajectoire, il reste encore la moitié de la saison pour la confirmer.",
        "On va continuer à travailler dans la continuité, avec quelques ajustements tactiques pour la seconde moitié.",
      ],
      loss: [
        "Cette défaite contre {opponent} arrive à un moment charnière de la saison, on va en tirer les leçons avant d'attaquer la seconde moitié du calendrier.",
        "On va revoir certains détails à l'entraînement pour repartir sur de meilleures bases en seconde moitié de saison.",
      ],
    },
    "Humble": {
      win: [
        "On a fait la moitié du chemin avec cette victoire contre {opponent}, mais rien n'est acquis, il reste encore beaucoup de travail avant la fin de saison.",
        "On va continuer à travailler humblement, rien n'est jamais acquis dans ce championnat.",
      ],
      loss: [
        "Cette défaite contre {opponent} à mi-saison est une bonne piqûre de rappel, on doit rester humbles et travailler encore plus dur pour la suite.",
        "On doit se remettre en question collectivement et travailler encore plus dur pour la seconde moitié de saison.",
      ],
    },
  },
  "fin-saison-reguliere": {
    "Agressif": {
      win: [
        "On termine la saison régulière sur cette victoire contre {opponent}, et on aborde les échéances qui arrivent avec la plus grande confiance qui soit.",
        "On aborde la suite avec la certitude d'avoir le niveau pour aller loin, sans aucune pression particulière.",
      ],
      loss: [
        "Cette dernière défaite de saison régulière contre {opponent} n'entache en rien notre saison, on sait qu'on est prêts pour la suite.",
        "On aborde la suite avec la même confiance, cette fin de saison régulière ne change rien à nos ambitions.",
      ],
    },
    "Mesuré": {
      win: [
        "Une belle manière de clore la saison régulière face à {opponent}, l'équipe a montré tout au long de l'année qu'elle méritait sa place.",
        "On aborde la suite sereinement, en essayant de garder cette dynamique le plus longtemps possible.",
      ],
      loss: [
        "On termine la saison régulière sur une défaite décevante contre {opponent}, mais le bilan global de l'année reste ce qui compte le plus.",
        "On aborde la suite avec l'envie de corriger ce qui n'a pas fonctionné ces dernières semaines.",
      ],
    },
    "Humble": {
      win: [
        "Cette victoire pour clore la saison régulière contre {opponent} appartient à tout le groupe, staff compris, ça n'a pas toujours été facile cette année.",
        "On aborde la suite avec humilité, chaque adversaire mérite le plus grand respect à ce stade de la saison.",
      ],
      loss: [
        "Cette défaite contre {opponent} pour terminer la saison régulière nous rappelle qu'il reste encore des choses à corriger avant la suite.",
        "On aborde la suite en sachant qu'il reste beaucoup de travail, on ne change rien à notre état d'esprit.",
      ],
    },
  },
  "demi-finale-po": {
    "Agressif": {
      win: [
        "On envoie un message clair à toute la ligue en éliminant {opponent} en demi-finale, la prochaine étape ne nous fait absolument pas peur.",
        "On prépare la suite avec la même confiance, on n'a pas fait tout ce chemin pour s'arrêter en si bon chemin.",
      ],
      loss: [
        "Éliminés par {opponent} en demi-finale, difficile à avaler, mais cette équipe reviendra encore plus forte la saison prochaine.",
        "On tire un trait sur cette élimination et on prépare déjà la revanche pour la saison prochaine, sans complexe.",
      ],
    },
    "Mesuré": {
      win: [
        "Une qualification méritée contre {opponent} en demi-finale, l'équipe a fait preuve d'un sérieux remarquable dans ce moment de pression.",
        "On va préparer la suite avec sérieux, sans s'enflammer, il reste encore une marche à franchir.",
      ],
      loss: [
        "Cette élimination en demi-finale contre {opponent} est frustrante après une belle saison, on va analyser calmement ce qui a manqué.",
        "On va analyser calmement cette élimination et en tirer les enseignements pour progresser encore.",
      ],
    },
    "Humble": {
      win: [
        "Cette qualification face à {opponent} en demi-finale doit beaucoup à la réussite autant qu'au mérite, on reste concentrés sur la suite sans s'enflammer.",
        "On va préparer la suite pas à pas, sans se projeter trop vite sur la suite.",
      ],
      loss: [
        "{opponent} méritait sa qualification en demi-finale, on doit accepter cette élimination avec humilité et en tirer les bons enseignements.",
        "On accepte cette élimination avec humilité et on va travailler encore plus dur pour revenir plus forts.",
      ],
    },
  },
  "finale-po": {
    "Agressif": {
      win: [
        "On savait qu'on était la meilleure équipe de la division, ce titre face à {opponent} en finale ne fait que le confirmer.",
        "Ce titre représente une nouvelle étape pour ce club, et on compte bien ne pas s'arrêter là la saison prochaine.",
      ],
      loss: [
        "Cette défaite en finale contre {opponent} est difficile à digérer, mais on reviendra chercher ce titre la saison prochaine, sans exception.",
        "Cette défaite ne représente rien de plus qu'un contretemps, ce club reviendra chercher ce titre très vite.",
      ],
    },
    "Mesuré": {
      win: [
        "Ce titre de champion face à {opponent} en finale récompense tout le travail accompli cette saison, une immense fierté pour tout le club.",
        "Ce titre représente une immense fierté pour tout le club, du staff aux joueurs en passant par les supporters.",
      ],
      loss: [
        "Cette défaite en finale contre {opponent} est une déception, mais atteindre la finale reste une très belle saison pour ce groupe.",
        "Cette défaite en finale reste une bonne saison pour ce club, on va essayer de franchir ce dernier palier la saison prochaine.",
      ],
    },
    "Humble": {
      win: [
        "Ce titre face à {opponent} appartient à tout le club, des joueurs jusqu'au dernier membre du staff, on ne l'oubliera jamais.",
        "Ce titre appartient à tout le monde au club, on va rester humbles et continuer à travailler comme si de rien n'était.",
      ],
      loss: [
        "{opponent} méritait ce titre ce soir, on doit rester humbles et repartir plus forts la saison prochaine.",
        "Cette défaite en finale fait partie du sport, on va rester humbles et repartir travailler dès la saison prochaine.",
      ],
    },
  },
};

// Délai de réponse à une interview de jalon (retour utilisateur, 2026-09 :
// "On a 3 jours pour faire l'interview sinon c'est neutre sur le moral") :
// temps RÉEL, jamais le calendrier simulé (voir Team.pruneExpiredInterviews).
// Même idiome que TRANSFER_AUCTION_DURATION_MS (délai réel exprimé en
// millisecondes) déjà utilisé ailleurs dans ce fichier pour ce genre de
// fenêtre de plusieurs jours.
const MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS = 3 * 24 * 60 * 60 * 1000;

// Construit le transcript complet {question, answer}[] d'une interview de
// jalon (voir MILESTONE_INTERVIEW_QUESTIONS/MILESTONE_INTERVIEW_QUOTES
// ci-dessus) : factorisé ici plutôt que dans Team.resolveInterview pour que
// le client puisse aussi s'en servir en PRÉVISUALISATION (avant validation,
// pour montrer la réponse selon le ton survolé dans le popup d'interview)
// sans dupliquer cette logique de zip questions/réponses côté navigateur.
// `tones` (retour utilisateur, 2026-09 : "la possibilité de choisir le ton
// pour chacune [des questions] et pas uniquement un ton pour toutes les
// questions") : soit un TABLEAU (un ton par question, dans le même ordre que
// MILESTONE_INTERVIEW_QUESTIONS), soit une simple chaîne (compatibilité
// ascendante, appliquée alors à toutes les questions). `playerName`
// (optionnel) : remplace `{player}` dans la réponse (voir
// MILESTONE_INTERVIEW_QUOTES["debut-saison"]), tout comme `opponentName`
// remplace `{opponent}` pour les autres jalons. Renvoie toujours un tableau
// (vide si `milestone` inconnu, ou réponse vide si un `tone` demandé est
// inconnu pour telle question), jamais d'exception.
function interviewTranscriptFor(milestone, tones, won, opponentName, playerName) {
  const questions = MILESTONE_INTERVIEW_QUESTIONS[milestone] || [];
  const toneList = Array.isArray(tones) ? tones : questions.map(() => tones);
  return questions.map((question, i) => {
    const tone = toneList[i] !== undefined ? toneList[i] : toneList[0];
    const answers = ((MILESTONE_INTERVIEW_QUOTES[milestone] || {})[tone] || {})[won ? "win" : "loss"] || [];
    let answer = answers[i] || "";
    if (opponentName) answer = answer.replace("{opponent}", opponentName);
    if (playerName) answer = answer.replace("{player}", playerName);
    return { question, answer };
  });
}

// ---------------------------------------------------------------------
// MVP AUTOMATIQUE DU MATCH (retour utilisateur, 2026-09 : "le mvp du match
// se fait interviewer à chaque fois. Il n'y a aucune action c'est
// automatique [...] mettre ses citations sur la page tableau de bord et sur
// le box score du match fini [...] un petit bonus pour le match (+2 sur
// toutes ses caracs)") : contrairement aux interviews ci-dessus, AUCUN choix
// du manager, calculée et figée côté serveur au moment même où le match est
// enregistré (voir awardMatchMvp, appelée juste après recordMatchStatsForTeam
// dans server/liveMatch.js), pour CHAQUE match réellement simulé (championnat
// ET coupe). `statEvaluation` reprend EXACTEMENT la même formule "à la
// française" (PIR) que moteurbasket3.html utilisait déjà côté client pour un
// affichage purement éphémère (jamais persisté) — centralisée ici pour que
// le MVP soit désormais calculé UNE SEULE FOIS, de façon autoritaire, et que
// sa citation puisse survivre à un rechargement de page.
// ---------------------------------------------------------------------
function statEvaluation(s) {
  return (s.pts || 0) + (s.reb || 0) + (s.ast || 0) + (s.stl || 0) + (s.blk || 0)
    - (((s.fga2 || 0) - (s.fgm2 || 0)) + ((s.fga3 || 0) - (s.fgm3 || 0)) + ((s.fta || 0) - (s.ftm || 0)))
    - (s.tov || 0) - (s.pf || 0);
}

// Seuils de statEvaluation (PIR) pour les 5 nuances vert -> rouge de la
// page Effectif (retour utilisateur, 2026-09 : "une petite évaluation sous
// forme de carré des 5 derniers match, plus ou moins réussi plus ou moins
// vert ou plus ou moins rouge"). Calibrés empiriquement (script jetable
// pir_calibration.js, 1500 matchs simulés, ~28600 lignes de box-score
// réelles) : statEvaluation n'est PAS normalisée entre 0 et 100 (voir son
// commentaire plus haut), donc sans ce calibrage un même score aurait été
// interprété au hasard. Les 4 seuils ci-dessous sont les bornes hautes des
// tiers 0 à 3 (arrondies depuis les quintiles observés p20=0, p40=3,
// p60=6-7, p80=13) ; PIR_TIER_COLORS va du rouge (pire) au vert (meilleur),
// dans le même esprit que --danger/--ok définis côté CSS.
const PIR_TIER_THRESHOLDS = [0, 3, 7, 13];
const PIR_TIER_COLORS = ["#e2694f", "#e2a24f", "#d9c24f", "#8fc25f", "#33b4a1"];

function pirTier(score) {
  for (let i = 0; i < PIR_TIER_THRESHOLDS.length; i++) {
    if (score <= PIR_TIER_THRESHOLDS[i]) return i;
  }
  return PIR_TIER_THRESHOLDS.length;
}

// Bonus temporaire accordé au MVP pour son PROCHAIN match réellement joué
// (voir Player.pendingMatchBoost/eff()) : +2 sur chaque caractéristique lue
// en match, un supplément volontairement modeste (à titre de comparaison,
// un écart type d'attribut entre deux joueurs de la ligue est très
// largement supérieur à 2, et MILESTONE_INTERVIEW_TONES plus haut va déjà
// jusqu'à ±7 sur l'humeur des supporters pour une simple interview) — une
// petite étincelle de confiance après une belle performance, jamais de quoi
// transformer un joueur moyen en titulaire irremplaçable à lui seul.
const MVP_ATTR_BONUS = 2;

// Citations du MVP (retour utilisateur : "aucune action, c'est
// automatique") : contrairement à MILESTONE_INTERVIEW_QUOTES, aucun ton ni
// résultat (gagné/perdu) ne les distingue puisqu'il n'y a aucun choix à
// faire : une seule liste, tirée au sort (voir awardMatchMvp), volontairement
// écrite pour rester valable que l'équipe du MVP ait gagné ou perdu ce
// soir-là (jamais de mention explicite du résultat du match).
const MVP_QUOTES = [
  "Ce soir, tout est rentré naturellement, mes coéquipiers m'ont trouvé aux bons endroits toute la rencontre.",
  "Je n'ai fait que suivre le plan de jeu, le collectif m'a mis dans les meilleures conditions possibles.",
  "J'étais dans un bon soir, ça arrive, l'important c'est de rester régulier sur la durée d'une saison.",
  "Le travail à l'entraînement toute la semaine a payé ce soir, je suis content d'avoir pu répondre présent.",
  "Ce genre de match, ça se prépare mentalement dès le réveil, j'étais focus du début à la fin.",
  "Je dois beaucoup à mes coéquipiers ce soir, ce sont eux qui m'ont donné les munitions pour performer.",
];

// ---------------------------------------------------------------------
// IDENTITÉ DU CLUB : logo et maillots (retour utilisateur, 2026-09 : "une
// petite page d'accueil pour les autres équipes [...] le logo de l'équipe
// doit être type dès lors que l'équipe ne paie pas [...] pour les équipes
// qui paient, elles doivent pouvoir charger leur propre image [...] une
// équipe gratuite doit pouvoir choisir uniquement entre 2 formes de maillot
// et 5 couleurs"). Aucun vrai système de paiement n'existe encore dans le
// jeu : `Team.isPaying` est pour l'instant un simple interrupteur manuel
// (voir Team.setPaying/actions.js:setTeamPaying), la logique et l'interface
// sont prêtes pour un futur système de paiement réel sans rien changer ici.
// ---------------------------------------------------------------------

// Palette fermée de 8 couleurs de maillot pour une équipe gratuite (clé
// stable persistée dans Team.jerseyColor, valeur = code couleur utilisé par
// le rendu SVG côté client). Une équipe payante reste soumise à la MÊME
// palette pour l'instant (seul le logo personnalisé distingue les deux
// niveaux, voir Team.setCustomLogo) : rien dans la demande n'élargit le
// choix de maillot pour les clubs payants. noir/blanc/jaune ajoutés (retour
// utilisateur, 2026-09 : "mets plus de choix [...] il manque jaune [...]
// noir, blanc"), mêmes codes couleur que dans JERSEY_TWO_TONE_SETS plus bas
// pour rester visuellement cohérent entre un maillot "uni" et un motif à 2
// couleurs.
const JERSEY_COLORS = {
  rouge:  "#d6473f",
  bleu:   "#3b6fd6",
  vert:   "#3fae62",
  violet: "#8659d6",
  orange: "#e08a2e",
  noir:   "#20242c",
  blanc:  "#f2f2f0",
  jaune:  "#e8c93f",
};

// Luminosité perçue d'une couleur de JERSEY_COLORS (0 = noir, 1 = blanc),
// formule YIQ standard. Sert uniquement à choisir une couleur de maillot
// EXTÉRIEUR par défaut qui contraste avec le maillot domicile (voir
// defaultAwayJerseyColor juste en dessous), jamais utilisée pour le rendu.
function jerseyColorLuminance(colorKey) {
  const hex = JERSEY_COLORS[colorKey];
  if (!hex) return 0;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Couleur de maillot EXTÉRIEUR par défaut à la création d'un club ou quand la
// couleur domicile change (retour utilisateur, 2026-09 : "Travaille sur les
// maillots extérieurs également") : un club de basket porte traditionnellement
// un maillot clair à domicile et un maillot sombre à l'extérieur, ou
// inversement, jamais 2 maillots de la même tonalité. Ici, "noir" si la
// couleur domicile est claire, "blanc" sinon, pour garantir un contraste
// visible dès la création. Reste modifiable ensuite via
// Team.setAwayJerseyColor comme n'importe quelle couleur de la palette.
function defaultAwayJerseyColor(homeColorKey) {
  return jerseyColorLuminance(homeColorKey) > 0.6 ? "noir" : "blanc";
}

// Deux formes de maillot seulement (retour utilisateur explicite) : "A"
// (débardeur, col rond) et "B" (débardeur, col en V à bandes latérales).
// Toujours SANS manche (retour utilisateur : "Il n'y a pas de manches sur
// les maillots au basket"). Les silhouettes SVG elles-mêmes sont dessinées
// côté client (jerseySvgHtml, purement visuel, jamais simulé par le
// moteur) ; ces clés ne servent qu'à valider/persister le choix du manager.
const JERSEY_SHAPES = ["A", "B"];

// Motifs de maillot réservés aux clubs payants (retour utilisateur,
// 2026-09, après la refonte de la page "Aperçu" : "Pour le mode payant
// ajoute des maillots avec des dessins particuliers (rayure, degrade...)",
// puis, sur la refonte du panneau d'identité : "quelques correctifs à faire
// pour le mode payant [...] choix 2: motif du maillot (uni, rayure,
// dégradé, 2 bandes de couleur sur les côtés...)") : "uni" (identique à un
// club gratuit) reste toujours disponible ; "rayures"/"degrade"/"bandes" ne
// peuvent être choisis que par un club `isPaying` (voir
// Team.setJerseyPattern plus bas), même principe que customLogoDataUrl
// (jamais effacé en repassant gratuit, juste ignoré au rendu, voir
// effectiveJerseyPattern côté moteurbasket3.html). Le dessin réel de chaque
// motif est purement visuel, dessiné côté client (jerseySvgHtml) : ces clés
// ne servent qu'à valider/persister le choix.
const JERSEY_PATTERNS = ["uni", "rayures", "degrade", "bandes"];

// Combinaisons de 2 couleurs pour les motifs "rayures"/"degrade"/"bandes",
// réservées aux clubs payants (retour utilisateur, 2026-09 : "ajoute un peu
// plus de couleur pour le mode payant, et mets le choix de 2 couleurs
// [blanc rouge, blanc noir, blanc bleu, bleu et rouge, violet et jaune...]
// mets plus de choix", puis : "mets plus de choix. il faut pouvoir choisir
// noir et blanc, ou blanc et noir, idem pour les autres couleurs, il manque
// jaune, jaune et bleu, bleu et jaune, noir, blanc") : une palette CURATÉE
// de paires plutôt que 2 sélecteurs de couleur libres, pour garantir un
// rendu toujours cohérent (voir jerseySvgHtml côté moteurbasket3.html, seul
// endroit qui dessine réellement ces couleurs). Chaque combinaison existe
// maintenant dans les 2 sens (le motif "rayures"/"bandes" n'est pas
// symétrique : la première couleur domine visuellement, voir jerseySvgHtml)
// : "blanc et rouge" et "rouge et blanc" sont 2 choix distincts, pas un
// seul. Indépendant de JERSEY_COLORS/jerseyColor, qui reste utilisé pour le
// motif "uni" (voir Team.setJerseyTwoTone plus bas, même garde-fou
// `isPaying` que setJerseyPattern) : jamais effacé en repassant gratuit,
// juste ignoré au rendu (voir effectiveJerseyTwoTone côté client).
const JERSEY_TWO_TONE_SETS = {
  blanc_rouge:   ["#f2f2f0", "#d6473f"],
  rouge_blanc:   ["#d6473f", "#f2f2f0"],
  blanc_noir:    ["#f2f2f0", "#20242c"],
  noir_blanc:    ["#20242c", "#f2f2f0"],
  blanc_bleu:    ["#f2f2f0", "#3b6fd6"],
  bleu_blanc:    ["#3b6fd6", "#f2f2f0"],
  bleu_rouge:    ["#3b6fd6", "#d6473f"],
  rouge_bleu:    ["#d6473f", "#3b6fd6"],
  violet_jaune:  ["#8659d6", "#e8c93f"],
  jaune_violet:  ["#e8c93f", "#8659d6"],
  vert_blanc:    ["#3fae62", "#f2f2f0"],
  blanc_vert:    ["#f2f2f0", "#3fae62"],
  orange_noir:   ["#e08a2e", "#20242c"],
  noir_orange:   ["#20242c", "#e08a2e"],
  rouge_noir:    ["#d6473f", "#20242c"],
  noir_rouge:    ["#20242c", "#d6473f"],
  jaune_noir:    ["#e8c93f", "#20242c"],
  noir_jaune:    ["#20242c", "#e8c93f"],
  bordeaux_or:   ["#7a2b3a", "#e8c93f"],
  or_bordeaux:   ["#e8c93f", "#7a2b3a"],
  jaune_bleu:    ["#e8c93f", "#3b6fd6"],
  bleu_jaune:    ["#3b6fd6", "#e8c93f"],
};

// Primes du tutoriel d'accueil (retour utilisateur, 2026-09 : "Mets les
// vrais primes sur le tutoriel") : montant crédité au VRAI budget du club
// (voir Team.claimTutorialReward plus bas) la première fois que chaque thème
// est terminé dans le tutoriel (voir TOUR_STEPS côté moteurbasket3.html,
// seul endroit qui décide QUAND proposer chaque prime ; ce tableau-ci reste
// la seule source de vérité sur COMBIEN chaque thème rapporte, mirroré à
// l'identique côté client pour que l'affichage "+ X € à la validation" du
// tutoriel ne puisse jamais diverger du montant réellement crédité). Un
// thème absent d'ici, ou déjà présent dans Team.tutorialRewardsClaimed, ne
// rapporte plus rien (voir claimTutorialReward) : protège contre un joueur
// qui recommencerait le tutoriel (bouton "Passer" ou abandon avant la fin)
// pour retoucher une prime déjà gagnée sur un thème déjà vu.
const TOUR_REWARD_BY_TOPIC = {
  "Effectif": 15000,
  "Ordres": 50000,
  "Entraînement": 20000,
  "Marché": 25000,
  "Staff": 20000,
  "Académie de jeunes": 40000,
  "Économie": 15000,
  "Salle": 15000,
};

// Taille maximale d'un logo personnalisé encodé en data URL (retour
// utilisateur : image chargée par un club payant) : ~300 Ko d'image binaire
// gonflent à environ 400 000 caractères une fois encodés en base64, une
// limite raisonnable pour rester embarqué dans la sauvegarde JSON sans trop
// l'alourdir (le client redimensionne déjà l'image avant envoi, voir
// resizeImageFileToDataUrl côté moteurbasket3.html, donc cette limite n'est
// quasiment jamais atteinte en pratique, juste un garde-fou serveur).
const MAX_TEAM_LOGO_DATA_URL_LENGTH = 400000;

// Fiche club : date de création et trophées (retour utilisateur, 2026-09,
// après avoir vu la page "Aperçu" v1 : "on pourrait ajouter les petites
// infos comme date de création, renommée et trophée du club"). `foundedYear`
// est l'année RÉELLE de création du club dans le jeu (retour utilisateur,
// même sujet : "mets l'année de création de l'équipe dans le jeu"), tirée
// une seule fois à la création du club (voir Team.foundedYear plus bas,
// généré dans le constructeur puis figé par le va-et-vient
// serializeTeam/teamFromSave, même principe que Player.name/height générés
// une fois pour toutes). Volontairement PAS d'ancienneté fictive (un club
// tout juste créé n'a par définition aucun passé) : voir
// computeClubReputationStars plus bas, où l'ancienneté ne joue donc aucun
// rôle pour un club fraîchement créé, seuls les trophées gagnés et le
// niveau de division comptent.
function generateFoundedYear(now = Date.now()) {
  return new Date(now).getFullYear();
}

// Plafond du nombre de trophées conservés dans Team.trophies (voir
// League.recordTrophy plus bas) : même esprit de garde-fou que
// Team.moraleHistory (plafonné à 40) ou Team.attendanceHistory (plafonné à
// 10), large ici (30) car un trophée est un événement rare, jamais autant
// de bruit qu'un historique de moral.
const MAX_TEAM_TROPHIES = 30;

// ---------------------------------------------------------------------
// GRILLE SALARIALE DES JOUEURS — le salaire hebdomadaire d'un joueur dépend
// UNIQUEMENT de son niveau actuel (overall, voir Player.overall), fixé à sa
// création puis RECALCULÉ UNE FOIS PAR SAISON (même cadence que le
// vieillissement — voir Team.trainWeek), jamais chaque semaine : un salaire
// qui bougerait à chaque petit gain d'entraînement serait illisible et
// déconnecterait le budget de toute vraie décision de gestion.
//
// Formule EXPONENTIELLE (pas linéaire) autour d'une référence à 24 de
// coefficient de niveau (voir levelCoefficientFor plus bas) : chaque point
// au-dessus de cette référence coûte proportionnellement plus cher que le
// précédent, donc un très bon joueur coûte VRAIMENT beaucoup plus qu'un
// joueur quelconque — pas juste un peu plus — et empiler des stars a un
// vrai coût économique (plutôt que d'être gratuit une fois le niveau
// atteint). Comme la force des adversaires générés est elle-même calibrée
// par division (voir DIVISIONS/tierMultiplier), ça crée mécaniquement une
// masse salariale cohérente avec le niveau de la division : des adversaires
// plus forts en Division I coûteraient, à effectif comparable, bien plus
// cher à payer qu'en Division VI — d'où la nécessité de revenus
// (billetterie, boutique) à la hauteur pour viser le haut de la pyramide
// plutôt que d'empiler des stars sans les moyens de les payer.
//
// Recalibré 2026-09 sur des données réelles de BuzzerBeater fournies par
// l'utilisateur, avec DEUX points d'ancrage simultanés (pas un seul) après
// un premier retour ("on est très loin des niveaux que tu proposes") :
//   - le tout premier effectif d'une nouvelle carrière (voir
//     generateStartingRoster, capé 10-50 sur toutes les caractéristiques —
//     "12 joueurs entre 2 000 et 5 000 €, donc environ 50-60 000 €/semaine
//     de masse salariale" en début de carrière BuzzerBeater) ;
//   - un effectif de niveau Division II (tierMultiplier ~1.27, l'équivalent
//     des ~320 000 à 600 000 €/semaine relevés sur de vrais effectifs
//     BuzzerBeater de ce niveau).
// Les joueurs vedettes du marché des transferts BuzzerBeater (130 000 à
// 300 000 €/semaine) et les joueurs de complément (quelques centaines
// d'euros) ont servi à vérifier le haut et le bas de la courbe. Recalé en
// simulant des effectifs réels générés à CHAQUE niveau de tierMultiplier
// (voir DIVISIONS) et en cherchant les trois constantes qui satisfont LES
// DEUX ancrages à la fois (une seule référence, comme avant, ne suffisait
// pas : caler uniquement sur le petit effectif de départ sous-évaluait
// largement une Division II, et l'inverse gonflait un effectif neuf bien
// au-delà de 60 000 €/semaine). Recalé une seconde fois après l'ajout de
// generateStartingRoster (effectif de départ nettement plus faible qu'avant
// — voir plus bas — donc une référence plus basse que le premier passage).
const SALARY_BASELINE_OVERALL = 5; // overall de référence (bas de l'échelle, calibré sur la masse salariale globale, pas un joueur isolé)
const SALARY_AT_BASELINE = 1500;    // salaire hebdo à ce niveau de référence (5 de coefficient)
const SALARY_GROWTH_PER_POINT = 1.032; // +3.2%/point au-dessus/dessous de la référence
const SALARY_MIN = 200; // plancher, même pour un très jeune/faible joueur (≈ joueur de complément BuzzerBeater)

function salaryForOverall(overall) {
  const raw = SALARY_AT_BASELINE * Math.pow(SALARY_GROWTH_PER_POINT, overall - SALARY_BASELINE_OVERALL);
  return Math.max(SALARY_MIN, Math.round(raw));
}

// ---------------------------------------------------------------------
// FORME PHYSIQUE (retour utilisateur, 2026-09 : "Chaque joueur possède une
// forme comprise entre 0 et 100 [...] totalement indépendante de
// l'entraînement [...] l'interface affiche l'état correspondant [...] perte
// après un match qui dépend des minutes jouées [...] récupère +15 points de
// forme par jour de repos"). Champ VOLONTAIREMENT séparé de Player.form
// (confiance du joueur, alimentée par les interviews, voir INTERVIEW_TONES/
// applyMoraleForResult plus bas) et de Player.fatigue (énergie EN MATCH,
// remise à 0 à chaque coup d'envoi par resetForMatch, voir MatchEngine.
// applyFatigue) : ici, Player.condition survit d'un match à l'autre, sur
// plusieurs JOURS réels, exactement comme l'endurance physique d'un vrai
// sportif.
//
// États affichés (retour utilisateur, mêmes seuils que fournis) : la valeur
// réelle (Player.condition) reste précise en interne, seule l'UI affiche
// l'état correspondant (voir conditionStateFor). Chaque état porte aussi le
// malus de performance (perfFactor, lu par Player.eff() plus bas, même
// esprit que formFactor/fatigueFactor) et un multiplicateur de risque de
// blessure (injuryMult, lu par MatchEngine.applyFatigue) : un joueur
// "Épuisé" prend clairement plus de risques qu'un joueur frais.
const CONDITION_STATES = [
  { min: 90, label: "Pas de fatigue",     perfFactor: 1.00, injuryMult: 1.0 },
  { min: 75, label: "Légèrement fatigué", perfFactor: 0.97, injuryMult: 1.05 },
  { min: 60, label: "Fatigué",            perfFactor: 0.90, injuryMult: 1.20 },
  { min: 40, label: "Très fatigué",       perfFactor: 0.75, injuryMult: 1.45 },
  { min: 0,  label: "Épuisé",             perfFactor: 0.55, injuryMult: 1.80 },
];
function conditionStateFor(condition) {
  return CONDITION_STATES.find(s => condition >= s.min) || CONDITION_STATES[CONDITION_STATES.length - 1];
}

// Durée d'un jour réel, pour la récupération (voir currentCondition
// ci-dessous) — INDÉPENDANTE de CALENDAR_DAY_MS (plus bas dans ce fichier,
// propre au rythme du calendrier de championnat) : la récupération de forme
// suit le temps réel qui passe pour le MANAGER, pas le rythme des journées
// de championnat (un club peut très bien ne jouer qu'un match par semaine).
const CONDITION_DAY_MS = 24 * 60 * 60 * 1000;
// Retour utilisateur (2026-09, entraînement collectif) : "bosser la
// récupération +15 sur un jour sans match avec l'entraînement récupération
// sinon c'est seulement +10" — la récupération passive de base baisse de
// l'ancien 15/jour à 10/jour pour TOUTE équipe (rééquilibrage assumé, voir
// Team.collectiveTraining), et remonte à CONDITION_RECOVERY_PER_DAY_TRAINED
// (15/jour, la valeur historique) uniquement pour un club dont le focus
// collectif de la semaine est "recuperation" (voir Team.
// conditionRecoveryPerDay ci-dessous).
const CONDITION_RECOVERY_PER_DAY = 10;
const CONDITION_RECOVERY_PER_DAY_TRAINED = 15;

// Valeur ACTUELLE de la forme d'un joueur, jours de repos écoulés depuis
// Player.conditionUpdatedAt déjà rattrapés (retour utilisateur : "+15
// points de forme par jour de repos, avec un plafond à 100", désormais
// CONDITION_RECOVERY_PER_DAY par défaut, voir son commentaire ci-dessus).
// Fonction PURE (ne modifie rien), même principe que
// computeClubReputationStars (recalculée à l'affichage plutôt que stockée en
// continu). `recoveryPerDay` : taux à appliquer, laissé au choix de
// l'appelant (voir Team.conditionRecoveryPerDay(), qui tient compte de
// Team.collectiveTraining), défaut CONDITION_RECOVERY_PER_DAY quand
// l'appelant n'a pas connaissance de l'équipe (ex. tests directs sur un
// joueur isolé). La vraie mise à jour PERSISTÉE de Player.condition/
// conditionUpdatedAt n'a lieu qu'aux moments où elle compte réellement : au
// coup d'envoi d'un match (snapshot, voir Player.resetForMatch) puis juste
// après (perte selon les minutes jouées, voir recordMatchStatsForTeam plus
// bas).
function currentCondition(player, now = Date.now(), recoveryPerDay = CONDITION_RECOVERY_PER_DAY) {
  const daysRested = Math.floor((now - (player.conditionUpdatedAt || now)) / CONDITION_DAY_MS);
  if (daysRested <= 0) return player.condition;
  return clamp(player.condition + daysRested * recoveryPerDay, 0, 100);
}

// Perte de forme après un match, selon les minutes jouées (retour
// utilisateur, valeurs de référence : 5 min -> -3, 10 -> -6, 20 -> -12,
// 30 -> -18, 40 -> -25). Linéaire (-0,6/minute) jusqu'à 30 minutes, puis un
// peu plus coûteux au-delà (-0,7/minute) pour les grosses charges de fin de
// match, à l'image d'un vrai gros temps de jeu qui fatigue plus que
// proportionnellement. Arrondie au point entier le plus proche, comme les
// exemples fournis par l'utilisateur.
function conditionLossForMinutes(minutesPlayed) {
  if (minutesPlayed <= 0) return 0;
  const loss = minutesPlayed <= 30
    ? minutesPlayed * 0.6
    : 30 * 0.6 + (minutesPlayed - 30) * 0.7;
  return Math.round(loss);
}

// Blessures : durée d'indisponibilité RÉELLE et PERSISTANTE (retour
// utilisateur, 2026-09 : "en passant sur la croix on verra la blessure et
// la durée"), contrairement à Player.injured (indicateur transitoire,
// remis à false à CHAQUE match, voir Player.resetForMatch/MatchEngine.
// applyFatigue, sert seulement à sortir le joueur du match EN COURS), ces
// deux champs (Player.injuryType/injuryUntil) survivent d'un match à
// l'autre, en jours RÉELS (même logique que CONDITION_DAY_MS ci-dessus :
// le temps qui passe pour le manager, pas le rythme du calendrier de
// championnat), et empêchent le joueur d'être aligné tant qu'ils ne sont
// pas écoulés (voir isCurrentlyInjured/Player.matchInjuryLocked/
// Team.resetForMatch/Team.backupsForSlot plus bas).
//
// Le TYPE (weightedPick) est tiré vers les blessures légères : la grande
// majorité restent mineures (quelques jours), une minorité seulement
// immobilise pour plusieurs semaines, à l'image d'un vrai championnat -
// jamais l'inverse, dans le même esprit que BASE_INJURY_RATE plus haut
// (rester rare et, ici, rarement grave). Retour utilisateur, 2026-09 :
// "essaie de ne pas faire plus que 4 semaines et une blessure au genou ça
// doit être 3 à 5% max des cas" - plafond global à 28 jours (Blessure au
// genou : 35 -> 28) et poids de la Blessure au genou ramené de 10% à 4%
// (weight 10 -> 4 sur un total de 100), les 6 points retirés reversés à
// Contusion (40 -> 44) et Entorse à la cheville (30 -> 32) au prorata de
// leur poids d'origine.
const INJURY_TYPES = [
  { label: "Contusion",             minDays: 2,  maxDays: 5,  weight: 44 },
  { label: "Entorse à la cheville", minDays: 5,  maxDays: 12, weight: 32 },
  { label: "Blessure musculaire",   minDays: 8,  maxDays: 18, weight: 20 },
  { label: "Blessure au genou",     minDays: 15, maxDays: 28, weight: 4 },
];

// Tire un type de blessure et sa durée (voir INJURY_TYPES ci-dessus),
// appelé UNE SEULE FOIS au moment où une blessure survient (voir
// MatchEngine.applyFatigue), jamais recalculé ensuite, la durée reste
// fixe jusqu'à son terme (injuryUntil).
function rollInjury(now = Date.now()) {
  const type = weightedPick(INJURY_TYPES, t => t.weight);
  const days = Math.round(rand(type.minDays, type.maxDays));
  return { injuryType: type.label, injuryUntil: now + days * CONDITION_DAY_MS };
}

// Le joueur est-il ENCORE indisponible à cause d'une blessure persistante
// (voir rollInjury ci-dessus) ? Fonction PURE, même principe que
// currentCondition plus haut : ne modifie rien, recalculée à la demande à
// partir de injuryUntil plutôt que d'un compteur décrémenté en continu.
function isCurrentlyInjured(player, now = Date.now()) {
  return typeof player.injuryUntil === "number" && now < player.injuryUntil;
}

// Nombre de jours ENCORE à courir avant la fin de la blessure (arrondi au
// jour supérieur : un joueur blessé "aujourd'hui" pour 3 jours doit encore
// afficher "3 jours" et non "2", tant qu'il reste ne serait-ce qu'une
// fraction du dernier jour) — utilisé par l'infobulle de la croix rouge
// (voir renderEffectifSection). 0 si le joueur n'est pas/plus blessé.
function injuryDaysRemaining(player, now = Date.now()) {
  if (!isCurrentlyInjured(player, now)) return 0;
  return Math.ceil((player.injuryUntil - now) / CONDITION_DAY_MS);
}

// État affiché pour Player.form (voir son commentaire au constructeur juste
// en dessous, retour utilisateur, 2026-09 : "La motivation du joueur n'
// apparaît pas ?") : mêmes seuils que moraleLabel/chemistryLabel plus haut
// (85/65/45/25), Player.form étant alimenté par LE MÊME système
// d'interviews de jalon (voir MILESTONE_INTERVIEW_TONES formWin/formLoss,
// resolveInterview plus bas) que Team.fanMorale/Team.chemistry, juste à
// l'échelle d'un joueur plutôt que du club entier. Libellé propre plutôt
// qu'un simple appel à moraleLabel/chemistryLabel : "motivation" du joueur,
// pas "humeur des supporters" ni "cohésion du groupe".
function motivationLabel(form) {
  if (form >= 85) return "Très motivé";
  if (form >= 65) return "Motivé";
  if (form >= 45) return "Neutre";
  if (form >= 25) return "Peu motivé";
  return "Démotivé";
}

// Retour utilisateur (2026-09) : "le changement de club [...] il faudrait
// que la motivation remonte à un niveau neutre. Il change de club donc il
// devrait être plus motivé." Voir League._resolveListing plus bas (SEUL
// chemin qui déplace vraiment un joueur d'un effectif vers un autre,
// contrairement à Team.promoteYouthPlayer qui reste dans le MÊME club) :
// un transfert abouti relève la motivation du joueur ACHETÉ jusqu'à ce
// plancher si elle était plus basse, jamais une baisse pour un joueur déjà
// motivé chez son ancien club (un nouveau projet ne devrait jamais rendre
// quelqu'un MOINS motivé), et referme au passage toute demande de transfert
// active (voir TRANSFER_REQUEST_MOTIVATION_THRESHOLD plus bas) puisqu'elle
// visait le club qu'il vient justement de quitter. Contrairement à
// Player.condition, jamais touché par un transfert (voir le commentaire de
// son constructeur plus haut) : la forme physique est indépendante du
// club, la motivation, elle, est éminemment contextuelle.
const TRANSFER_NEW_CLUB_MOTIVATION_FLOOR = 55; // milieu de la fourchette "Neutre" (45-64)

// ---------------------------------------------------------------------
// Retour utilisateur (2026-09) : "un joueur très frustré (motivation proche
// de 0 depuis 3 semaines) peut demander son transfert dans la presse. Ne
// rien faire laisse sa motivation proche de 0, ouvrir la discussion avec
// lui pour le remotiver (ne marche pas à chaque fois) ou le vendre sont les
// deux possibilités." Voir Player.weeksAtLowMotivation/transferRequestActive
// (constructeur), Team.updateTransferRequests (appelée chaque semaine par
// Team.trainWeek, même rythme que applyBenchFrustration) et
// Team.discussTransferRequest (l'action "discuter" du manager, chance de
// succès liée au Mental du joueur : un Mental élevé encaisse mieux et se
// laisse plus facilement convaincre, même thème que son effet en match, voir
// le grand commentaire d'ATTRS). "Vendre" n'a besoin d'aucun nouveau
// mécanisme : c'est le marché des transferts déjà en place (Player.forSale/
// Team.sellPlayer/League.listPlayerForSale).
// ---------------------------------------------------------------------
const TRANSFER_REQUEST_MOTIVATION_THRESHOLD = 20; // "motivation proche de 0" (Démotivé commence à 25)
const TRANSFER_REQUEST_WEEKS_THRESHOLD = 3; // "depuis 3 semaines"
const TRANSFER_REQUEST_DISCUSS_BASE_CHANCE = 0.35;
const TRANSFER_REQUEST_DISCUSS_MENTAL_BONUS = 0.3; // jusqu'à +0.3 pour un Mental à 100 (chance totale 0.35 à 0.65)
const TRANSFER_REQUEST_DISCUSS_SUCCESS_FORM_BOOST = 25;

// Citations de presse (retour utilisateur : "demande son transfert dans la
// presse"), une piochée à chaque nouvelle demande (voir
// Team.updateTransferRequests) et figée sur le joueur (Player.
// transferRequestQuote) jusqu'à résolution : même esprit que MVP_QUOTES/
// MILESTONE_INTERVIEW_QUOTES plus haut, `{player}` remplacé par le nom du
// joueur (voir transferRequestQuoteFor).
const TRANSFER_REQUEST_QUOTES = [
  "\"Je ne me sens plus utile ici, il est temps d'envisager un nouveau projet\", confie {player} à la presse.",
  "\"Ça fait des semaines que je suis sur le banc sans la moindre explication, je demande à partir\", lâche {player}.",
  "\"J'ai besoin de retrouver du temps de jeu ailleurs\", déclare {player}, visiblement lassé de la situation.",
  "\"Le club connaît ma position, je souhaite être transféré au plus vite\", affirme {player}.",
];

function transferRequestQuoteFor(playerName) {
  return pick(TRANSFER_REQUEST_QUOTES).replace("{player}", playerName);
}

class Player {
  constructor({ name, position, height, age, attrs, aggressiveness }) {
    this.id = uid();
    this.name = name;
    this.position = position;
    this.height = height;
    this.age = age;
    this.attrs = attrs; // {midRange, threePoint, inside, pass, rebound, block, dribble, agility, defOutside, defInside}
    this.aggressiveness = aggressiveness; // caractéristique cachée 1-100
    this.form = clamp(Math.round(rand(55, 90)), 1, 100);

    // Forme physique (voir CONDITION_STATES/currentCondition/
    // conditionLossForMinutes plus haut) : démarre fraîche (haut de la
    // fourchette "Pas de fatigue"/"Légèrement fatigué"), un joueur qui
    // rejoint l'effectif n'a par définition subi aucune charge de matchs
    // récente. `conditionUpdatedAt` : posé à la génération, sert de point de
    // départ pour la récupération (voir currentCondition).
    this.condition = clamp(Math.round(rand(80, 100)), 0, 100);
    this.conditionUpdatedAt = Date.now();

    // Blessure PERSISTANTE en cours, le cas échéant (voir INJURY_TYPES/
    // rollInjury/isCurrentlyInjured plus haut) : `null` = pas blessé. Un
    // joueur qui rejoint l'effectif n'a par définition aucune blessure en
    // cours. Contrairement à `injured` (état de match ci-dessous, remis à
    // false à CHAQUE match), ces deux champs survivent d'un match à l'autre.
    this.injuryType = null;
    this.injuryUntil = null;

    // Bonus temporaire de MVP (retour utilisateur, 2026-09 : "le mvp d'un
    // match doit avoir un petit bonus pour le match [...] +2 sur toutes ses
    // caracs") : posé par awardMatchMvp, lu en direct par eff() ci-dessous
    // (jamais overall(), volontairement, pour ne pas gonfler la note/le
    // salaire affiché d'un joueur pour une seule bonne performance), effacé
    // par recordMatchStatsForTeam dès qu'il a servi pour le tout PROCHAIN
    // match réellement joué par ce joueur (secondsPlayed > 0) — un seul
    // match "boosté", jamais plus. PAS remis à zéro par resetForMatch
    // ci-dessous (à dessein : il doit survivre jusqu'au prochain match
    // réellement joué, même si ce joueur reste sur le banc entre-temps).
    this.pendingMatchBoost = 0;

    // Potentiel GLOBAL (un seul plafond, échelle "overall" 1-99), fixé une
    // fois pour toutes à la génération du joueur — représente son talent
    // brut, pas encore révélé. Dépasser son potentiel n'empêche pas de
    // continuer à progresser, mais ça devient beaucoup, beaucoup plus dur
    // (voir trainWeek).
    {
      const [lo, hi] = potentialHeadroom(this.age);
      this.potential = clamp(Math.round(this.overall() + rand(lo, hi)), 1, 99);
    }

    // Salaire hebdomadaire — voir salaryForOverall (grille salariale) :
    // dépend du niveau ACTUEL du joueur au poste où ses caractéristiques le
    // valorisent le mieux (voir levelCoefficientFor), pas d'une simple
    // moyenne brute — recalculé une fois par saison (voir Team.trainWeek),
    // jamais à la génération seule. `effectivePosition` (le poste retenu
    // pour ce calcul) est conservé à titre indicatif, pour l'UI.
    {
      const level = levelCoefficientFor(this.attrs, this.position);
      this.effectivePosition = level.position;
      this.salary = salaryForOverall(level.coefficient);
    }

    // Accumulateur fractionnaire caché : les gains hebdomadaires sont souvent
    // < 1 point. Sans ça, arrondir chaque semaine effacerait toute progression
    // lente (un joueur ne bougerait jamais si son gain hebdo reste sous 0,5).
    this._trainProgress = {};
    ATTRS.forEach(a => this._trainProgress[a] = 0);

    // état de match (réinitialisé à chaque simulate())
    this.fatigue = 0;       // 0 = frais, 100 = épuisé
    this.fouls = 0;
    this.disqualified = false;
    this.injured = false;
    this.onCourt = false;
    // Blessure PERSISTANTE encore en cours à l'entrée de CE match (voir
    // isCurrentlyInjured/injuryUntil plus haut) : snapshot pris UNE FOIS au
    // coup d'envoi (comme matchCondition), jamais recalculé pendant le match
    // — Team.resetForMatch s'en sert pour ne PAS aligner ce joueur (voir son
    // commentaire), et Team.backupsForSlot pour l'exclure du banc disponible.
    this.matchInjuryLocked = false;
    // Série de ratés/pertes de balle d'affilée EN MATCH (voir "mental" au-dessus
    // d'ATTRS) : incrémentée sur un tir manqué ou une perte de balle, remise à
    // 0 sur un tir réussi (voir playPossession) - alimente le malus de "tilt"
    // qui s'aggrave ou s'atténue selon Player.attrs.mental.
    this.consecutiveMisses = 0;
    // Poste occupé DANS CE MATCH (peut différer de this.position si le
    // joueur est aligné comme remplaçant sur un autre poste que le sien —
    // voir Team.lineup). Fixé à l'entrée sur le terrain (titulaire ou
    // remplacement), conservé jusqu'à la sortie du joueur.
    this.matchPosition = null;
    this.secondsPlayed = 0;
    // Temps de jeu de CE match, ventilé par poste RÉELLEMENT joué (clé =
    // matchPosition au moment où le temps est comptabilisé). Alimente le
    // journal de match (Player.matchLog, voir recordMatchStatsForTeam) et
    // les box-scores, PAS l'entraînement depuis le calendrier ancré
    // quotidien (voir trainingSecondsPlayedByPosition ci-dessous), remis à
    // zéro à CHAQUE match (voir resetForMatch), donc ne reflète jamais plus
    // que le dernier match joué.
    this.secondsPlayedByPosition = {};
    // Temps de jeu ventilé par poste, CUMULÉ sur tous les matchs du cycle
    // d'entraînement en cours (retour utilisateur, 2026-09 : "la semaine est
    // en fait une journée avec 3 matchs [...] un joueur doit jouer 30 min au
    // poste déterminé sur sa semaine pour prendre l'entrainement"). PAS
    // remis à zéro par resetForMatch (contrairement à secondsPlayedByPosition
    // ci-dessus) : accumulé match après match par applyFatigue, jusqu'à ce
    // que Team.trainWeek le consomme et le remette à zéro. Seul champ lu par
    // Team.trainablySecondsFor pour décider de l'entraînement.
    this.trainingSecondsPlayedByPosition = {};
    this.stats = this.emptyStats();

    // Mise en vente forcée en cas de déficit économique prolongé (voir
    // DEFICIT_ALERT_THRESHOLD/DEFICIT_GRACE_WEEKS et Team.trainWeek) — pas
    // encore un vrai marché des transferts, juste ce mécanisme de dernier
    // recours. `salePrice` reste `null` tant que le joueur n'est pas listé.
    this.forSale = false;
    this.salePrice = null;

    // Journal des matchs de la saison (retour utilisateur, 2026-09 : stats
    // de la Ligue + MVP de la dernière journée + pages joueur avec
    // "match par match + une moyenne") : une entrée par match RÉELLEMENT
    // joué (secondsPlayed > 0), jamais pour un forfait — voir
    // recordMatchStatsForTeam ci-dessous, seul point d'écriture. Remis à
    // zéro au passage de SAISON (voir Team.trainWeek), pas de semaine en
    // semaine : les stats affichées couvrent la saison EN COURS.
    this.matchLog = [];

    // Demande de transfert (voir le grand commentaire au-dessus de
    // TRANSFER_REQUEST_MOTIVATION_THRESHOLD) : `weeksAtLowMotivation` compte
    // les semaines CONSÉCUTIVES (voir Team.updateTransferRequests, appelée
    // chaque semaine) où ce joueur est resté sous le seuil de motivation
    // "proche de 0", remis à 0 dès qu'il repasse au-dessus (peu importe la
    // cause : discussion réussie, ou simplement une bonne interview de
    // jalon). `transferRequestActive` bascule à `true` une fois ce compteur
    // au seuil (3 semaines), et le reste jusqu'à ce que la motivation
    // remonte (voir updateTransferRequests) ou qu'une discussion réussisse
    // (voir Team.discussTransferRequest), jamais résolu par la simple vente
    // du joueur, qui le retire de l'effectif de toute façon.
    // `transferRequestQuote` : citation de presse figée au moment où la
    // demande démarre (voir transferRequestQuoteFor), affichée telle quelle
    // tant que `transferRequestActive` reste vrai.
    this.weeksAtLowMotivation = 0;
    this.transferRequestActive = false;
    this.transferRequestQuote = null;
  }

  // Applique une semaine d'entraînement. `attrWeights` est une map
  // {caractéristique: poids} calculée par Team.trainWeek pour CE joueur —
  // elle combine déjà tout ce qui influe sur le rendement : le poids de la
  // caractéristique dans le programme choisi (plein pour un programme "pur",
  // dilué pour un programme composite — voir TRAINING_PROGRAMS), l'aptitude
  // de son poste sur CETTE caractéristique précise, le gabarit, la dilution
  // liée au nombre de postes couverts cette semaine, et la proportion du
  // dernier match jouée. Un poids de 0 (ou absent) = caractéristique non
  // entraînée cette semaine pour ce joueur : elle ne bouge plus du tout par
  // l'entraînement (seuls le vieillissement/déclin s'appliquent encore).
  // `trainerMult` (>= 1) est le bonus apporté par l'entraîneur du club
  // (staff, sans aucun effet sur les matchs) ; s'applique à toute la
  // progression de la semaine. `synergyAttrs` (optionnel, Set<string>) liste
  // les caractéristiques dont le poids vient UNIQUEMENT de la synergie (voir
  // TRAINING_SYNERGY côté Team.trainWeek), pas du programme choisi lui-même —
  // voir plus bas pourquoi c'est nécessaire pour respecter la règle "une
  // caractéristique liée progresse toujours moins qu'une caractéristique
  // directement travaillée". Renvoie la liste des caractéristiques qui ont
  // bougé, sous la forme [{attr, before, after}, ...].
  trainWeek(attrWeights, trainerMult = 1, synergyAttrs = null) {
    const gains = [];
    const growth = growthFactorForAge(this.age);
    const decline = declineFactorForAge(this.age);

    ATTRS.forEach(a => {
      const before = this.attrs[a];
      const weight = clamp((attrWeights && attrWeights[a]) || 0, 0, 2);
      let delta = 0;

      if (growth > 0 && weight > 0) {
        // Le potentiel est GLOBAL (un seul chiffre), mais chaque caractéristique
        // garde son propre plafond dérivé de ce chiffre : une caractéristique
        // entraînée peut être poussée un peu au-dessus de la moyenne du
        // joueur, mais rien ne grimpe vers 99 sans rapport avec son potentiel.
        // Au-delà de son propre plafond, une caractéristique peut toujours
        // progresser, mais beaucoup plus difficilement (facteur ~1/8) —
        // jamais un mur infranchissable.
        const ceiling = clamp(this.potential + 12 * Math.min(weight, 1), 1, 99);
        const gap = ceiling - before;
        const beyondCeilingMult = gap > 0 ? 1 : 0.12;
        // `progressRoom` grandit avec l'écart à combler : c'est ce qui permet
        // à une caractéristique très en retard sur un potentiel élevé de
        // rattraper vite (retour utilisateur d'origine). Mais SANS
        // correction, ce même mécanisme retournait le classement : une
        // caractéristique de synergie (poids réduit, ex. x0.4 — voir
        // TRAINING_SYNERGY) partant très bas profitait d'un écart énorme et
        // finissait par progresser AUTANT, voire PLUS, que la caractéristique
        // réellement entraînée cette semaine-là (retour utilisateur : "il
        // prend l'entraînement comme il faut en DE mais il monte mieux sur
        // les autres caracs") — alors que le commentaire de la synergie,
        // plus haut, promet l'inverse. Pour une caractéristique de synergie,
        // la marge de progression est donc elle aussi réduite au prorata de
        // son poids (déjà < 1 par construction) : ça préserve le rattrapage
        // rapide vers un fort potentiel pour la caractéristique VRAIMENT
        // entraînée (poids proche de 1, `roomScale` alors inchangé), tout en
        // garantissant qu'une caractéristique de synergie reste structurellement
        // plus lente (poids² au lieu de poids). Les programmes composites
        // (plusieurs caractéristiques du même programme, voir
        // WEIGHT_BY_PROGRAM_SIZE) ne sont eux jamais concernés : ce ne sont
        // pas des caractéristiques de synergie.
        const roomScale = (synergyAttrs && synergyAttrs.has(a)) ? clamp(weight, 0, 1) : 1;
        const progressRoom = (Math.max(gap, 0) / 20 + 0.12) * roomScale;
        // `weight` porte déjà tout ce qui module le rendement (voir
        // Team.trainWeek) : une caractéristique NON entraînée cette semaine
        // (poids 0) ne bouge plus DU TOUT — seuls les joueurs alignés sur
        // le(s) poste(s) entraîné(s) progressent (demande explicite de
        // septembre 2026 : "pour les joueurs qui ne correspondent pas au
        // poste(s) entrainé(s) aucune caractéristique ne doit monter").
        delta += growth * weight * progressRoom * beyondCeilingMult * rand(0.5, 1.3) * trainerMult;
      }
      if (decline > 0) {
        // Une caractéristique entraînée cette semaine décline moins vite.
        const declineReduction = weight > 0 ? clamp(1 - 0.6 * Math.min(weight, 1), 0.2, 1) : 1;
        delta -= decline * rand(0.3, 1.0) * declineReduction;
      }

      // On accumule le delta fractionnaire ; on ne touche à l'attribut affiché
      // qu'une fois qu'un point entier s'est accumulé (dans un sens ou l'autre).
      this._trainProgress[a] = (this._trainProgress[a] || 0) + delta;
      const whole = Math.trunc(this._trainProgress[a]);
      if (whole !== 0) {
        this._trainProgress[a] -= whole;
        const after = clamp(before + whole, 1, 99);
        if (after !== before) {
          gains.push({ attr: a, before, after });
        }
        this.attrs[a] = after;
      }
    });
    return gains;
  }

  emptyStats() {
    return {
      pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
      fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0,
      // paintAtt/paintMade (retour utilisateur, 2026-09, "rapport de scouting" :
      // tendances chiffrées d'un adversaire, coïncidant avec de vrais leviers
      // tactiques déjà en jeu). Sous-ensemble de fga2/fgm2 ne comptant QUE les
      // tirs pris en zone "inside" (raquette/poste), fga2/fgm2 eux-mêmes
      // INCHANGÉS (toujours inside+mid confondus) : ajout strictement additif,
      // aucun comportement de simulation existant ne change. Sert à calculer,
      // côté UI, la part des tirs pris dans la raquette (utile pour distinguer
      // un adversaire tourné vers l'intérieur d'un adversaire de périmètre),
      // voir computeScoutingTendencies dans moteurbasket3.html.
      paintAtt: 0, paintMade: 0,
      // +/- (retour utilisateur, 2026-09 : "ajouté les colonnes de stats :
      // évaluation et +/- [...] dans les box score (match terminé et aussi
      // sur les live)") : différentiel de points marqués/encaissés pendant
      // que CE joueur était sur le terrain, voir
      // MatchEngine.applyPlusMinusForPoints (mis à jour à CHAQUE panier/
      // lancer franc marqué, jamais recalculé après coup).
      plusMinus: 0,
    };
  }

  resetForMatch(now = Date.now(), recoveryPerDay = CONDITION_RECOVERY_PER_DAY) {
    this.fatigue = 0;
    this.fouls = 0;
    this.disqualified = false;
    this.injured = false;
    this.onCourt = false;
    // Blessure PERSISTANTE (voir son commentaire au constructeur, et
    // isCurrentlyInjured plus haut) : snapshot pris ICI, une fois par match,
    // à partir de injuryUntil (qui, lui, n'est jamais remis à zéro ici -
    // seule l'échéance du temps réel qui passe le fait expirer).
    this.matchInjuryLocked = isCurrentlyInjured(this, now);
    this.consecutiveMisses = 0;
    this.matchPosition = null;
    this.secondsPlayed = 0;
    this.secondsPlayedByPosition = {};
    // trainingSecondsPlayedByPosition N'EST PAS remis à zéro ici, à dessein
    // (voir son commentaire au constructeur) : il doit survivre aux DEUX
    // autres matchs du jour, jusqu'à ce que Team.trainWeek le consomme.
    this.stats = this.emptyStats();
    // Forme physique (voir currentCondition/CONDITION_STATES plus haut) :
    // snapshot pris UNE FOIS au coup d'envoi (jours de repos déjà rattrapés
    // par currentCondition), lu par eff() pendant tout le match, jamais
    // recalculé possession par possession (contrairement à fatigue, qui
    // évolue EN DIRECT). La perte liée à CE match n'est appliquée qu'ensuite,
    // une fois les minutes réellement jouées connues (voir
    // recordMatchStatsForTeam). `recoveryPerDay` : taux du CLUB (voir
    // Team.conditionRecoveryPerDay/collectiveTraining), transmis par
    // Team.resetForMatch ci-dessous, défaut CONDITION_RECOVERY_PER_DAY pour
    // un appel direct sans équipe (tests).
    this.matchCondition = currentCondition(this, now, recoveryPerDay);
  }

  // Moyenne des 13 caractéristiques (voir le grand commentaire au-dessus
  // d'ATTRS) : "mental"/"endurance"/"freeThrow" comptent ici exactement
  // comme les 10 d'origine, mêmes citoyens à part entière (contrairement à
  // aggressiveness, caractéristique cachée volontairement EXCLUE d'overall,
  // voir le constructeur plus haut).
  overall() {
    const a = this.attrs;
    return (a.midRange + a.threePoint + a.inside + a.pass + a.rebound +
      a.block + a.dribble + a.agility + a.defOutside + a.defInside +
      a.mental + a.endurance + a.freeThrow) / 13;
  }

  // Statistique effective en jeu = (base + bonus MVP éventuel) * forme * fatigue * forme physique * alchimie d'équipe
  eff(stat) {
    const base = this.attrs[stat] + (this.pendingMatchBoost || 0);
    const formFactor = 0.85 + (this.form / 100) * 0.30;      // 0.85 → 1.15
    const fatigueFactor = 1 - (this.fatigue / 100) * 0.35;   // jusqu'à -35%
    // Forme physique (voir CONDITION_STATES plus haut) : lit matchCondition
    // (snapshot posé par resetForMatch), jamais Player.condition directement
    // (pas encore rattrapé/perdu pour CE match tant que resetForMatch n'est
    // pas passé), `?? this.condition` en dernier recours si eff() était
    // jamais appelée hors match (aucun appel de ce genre aujourd'hui, voir
    // les usages dans playPossession, mais un filet de sécurité coûte peu).
    const conditionFactor = conditionStateFor(this.matchCondition ?? this.condition).perfFactor;
    // Alchimie d'équipe (voir Team.chemistryFactor/resetForMatch plus haut) :
    // lit matchChemistryFactor (snapshot d'ÉQUIPE posé par Team.resetForMatch),
    // `?? 1` en dernier recours si eff() était jamais appelée hors match.
    const chemistryFactor = this.matchChemistryFactor ?? 1;
    return clamp(base * formFactor * fatigueFactor * conditionFactor * chemistryFactor, 1, 130);
  }
}

// ---------------------------------------------------------------------
// Clé composite pour Team.plannedTactics (voir le constructeur ci-dessous) :
// "{compétition}:{journée}" plutôt qu'un simple numéro de journée. Retour
// utilisateur (2026-09) : "il faut pouvoir donner ses ordres pour chaque
// match. Plus tard on ajoutera les matchs internationaux, il faudra aussi
// pouvoir le faire" — un tour de Coupe et une journée de championnat sont
// numérotés CHACUN à partir de 0 (CUP_STAGE_NAMES/round.index côté Coupe,
// totalement indépendant du round 0-17 du championnat) : sans cette clé
// composite, planifier les deux à la fois pour le même numéro les ferait
// s'écraser l'un l'autre dans le même objet plannedTactics. `competition`
// omis équivaut à "championship" (comportement historique, avant que la
// Coupe n'ait elle-même de planification à l'avance).
function planKey(round, competition) {
  return `${competition || "championship"}:${round}`;
}

// ---------------------------------------------------------------------
// ALCHIMIE D'ÉQUIPE (retour utilisateur, 2026-09 : "l'alchimie du groupe
// elle doit avoir un impact positif ou négatif sur les performances
// d'équipe [...] elle peut être impactée : par le coach lors de ses
// interviews [...] par les changements fréquents de joueurs (jamais une
// base de joueurs fixes, donc il faut recreer du lien entre les joueurs),
// mais changer un joueur majeur d'une équipe doit forcément avoir bcp plus
// d'impact que de changer le 12 homme (qui doit être très faible) [...]
// changer trop régulièrement de tactique doit aussi avoir un petit
// impact"). `Team.chemistry` : 0-100, MÊME convention que Team.fanMorale
// (neutre à 50 à la création, voir le constructeur plus bas) — mais,
// contrairement à fanMorale, ne bouge QUE par les 3 leviers explicitement
// listés ci-dessus, jamais de dérive naturelle dans le temps :
//   1) Interviews de jalon (voir MILESTONE_INTERVIEW_TONES.chemistryWin/
//      chemistryLoss, appliqué par Team.resolveInterview) : le ton choisi
//      par le coach peut construire ou abîmer la cohésion du groupe, dans
//      un sens ou dans l'autre (positif OU négatif, comme demandé).
//   2) Changements d'effectif (voir chemistryRosterImportance/rosterRankOf
//      ci-dessous, appliqué par League._resolveListing au marché des
//      transferts et par Team.sellPlayer à la vente forcée) : TOUJOURS un
//      malus (jamais un bonus, un club ne "gagne" pas en cohésion en
//      brassant son effectif), pondéré par l'importance du joueur parti/
//      arrivé dans l'effectif.
//   3) Changements de tactique trop fréquents (voir Team.checkTacticsChemistry
//      ci-dessous, appliqué à chaque match réellement joué) : malus
//      PROPORTIONNEL à ce qui change réellement dans l'identité tactique de
//      fond (attaque prioritaire/défense/rythme) par rapport au dernier
//      match, aucun effet si elle est restée la même (retour utilisateur,
//      2026-09 : "si je passe de pick and roll + pénétration + transition à
//      pick and roll + pénétration + jeu intérieur, je perds combien
//      d'alchimie ?" : la réponse ne doit plus être "pareil que si j'avais
//      tout changé"). Atténué de moitié quand l'entraînement collectif de la
//      semaine porte sur "tactique" (voir Team.collectiveTraining plus bas,
//      et CHEMISTRY_TACTICS_TRAINED_FACTOR) : travailler la nouvelle
//      tactique à l'entraînement rend sa mise en place en match moins
//      coûteuse pour la cohésion, sans jamais l'annuler complètement.
// Lu par Team.chemistryFactor() (voir Player.eff()/Team.resetForMatch plus
// bas) pour un effet MODESTE sur la performance de TOUTE l'équipe (jamais
// aussi marqué que la forme physique ou la fatigue d'UN seul joueur) : la
// cohésion collective aide ou pénalise le groupe entier, pas un joueur en
// particulier.
const CHEMISTRY_ROSTER_CHANGE_MAX_RANK = 12; // "le 12 homme" (retour utilisateur, littéral)
const CHEMISTRY_ROSTER_CHANGE_BASE = 8; // malus max, pour le tout meilleur joueur de l'effectif
// Décomposition du malus tactique (retour utilisateur, 2026-09) : un point
// par priorité offensive qui change (0 à 3, comparées en ENSEMBLE, pas en
// ordre : permuter l'ordre de 3 priorités identiques ne coûte rien), la
// défense pèse plus qu'une priorité isolée (changer de schéma défensif est
// un vrai changement d'identité), le rythme un peu moins. Maximum cumulé si
// TOUT change à la fois (3 priorités + défense + rythme) : 3+2+1 = 6, du
// même ordre de grandeur qu'un changement d'effectif (CHEMISTRY_ROSTER_
// CHANGE_BASE = 8 pour le tout meilleur joueur de l'effectif), plutôt que
// l'ancien malus fixe de 2 quel que soit l'ampleur du changement.
const CHEMISTRY_TACTICS_OFFENSE_PENALTY = 1; // par priorité offensive changée (0 à 3)
const CHEMISTRY_TACTICS_DEFENSE_PENALTY = 2;
const CHEMISTRY_TACTICS_RHYTHM_PENALTY = 1;
// Retour utilisateur (2026-09) : "je pense qu'il faut [...] diviser à chaque
// fois par 2 le malus sur la tactique bossée par jour d'entrainement sur la
// tactique", n'est plus une atténuation fixe appliquée en bloc dès que
// l'entraînement collectif porte sur "tactique", mais la base d'une
// puissance : CHEMISTRY_TACTICS_TRAINED_FACTOR ** (nombre de jours de repos
// passés à travailler PRÉCISÉMENT la catégorie qui a changé, voir
// Team.daysTrainedForTarget/collectiveTrainingLog), 0 jour banqué = ×1 (pas
// encore d'atténuation), 1 jour = ×0.5, 2 jours = ×0.25, 3 jours = ×0.125...
// Ne s'annule jamais exactement (asymptote vers 0), mais peut s'en approcher
// beaucoup avec suffisamment de jours de préparation.
const CHEMISTRY_TACTICS_TRAINED_FACTOR = 0.5;

// Deux instantanés tactiques {offense, defense, rhythm} représentent-ils
// EXACTEMENT la même chose ? Les priorités offensives sont comparées en
// ENSEMBLE (Set), pas en ordre — voir tacticsChangePenalty ci-dessous pour
// la même convention. `a`/`b` peuvent être `null` (pas encore de match de
// référence) : deux `null` sont considérés égaux, un `null` et un instantané
// réel jamais égaux.
function tacticsEqual(a, b) {
  if (!a || !b) return a === b;
  if (a.defense !== b.defense || a.rhythm !== b.rhythm) return false;
  if (a.offense.length !== b.offense.length) return false;
  const setA = new Set(a.offense);
  return b.offense.every(t => setA.has(t));
}

// Malus entre deux instantanés tactiques {offense, defense, rhythm} :
// fonction PURE partagée par Team.checkTacticsChemistry (moteur, applique
// réellement le malus après un match) et par l'aperçu en direct de la page
// Ordres côté client (renderOrdresChemistryGauge, ne fait QUE prévisualiser,
// n'appelle jamais applyChemistryDelta) : les deux doivent toujours calculer
// exactement le même nombre. `prev` peut être `null` (pas encore de match de
// référence), renvoie alors 0, jamais de malus au tout premier match.
// Les 3 priorités offensives sont comparées en ENSEMBLE (Set), pas en ordre :
// { "A", "B", "C" } -> { "C", "A", "B" } ne compte pour aucun changement.
// `trained` (optionnel, voir Team.trainedTactics) : UN SEUL aspect
// précisément travaillé à l'entraînement collectif (retour utilisateur,
// 2026-09 : "il faut effectivement choisir ce qui est bossé comme tactique
// [...] un seul aspect et pas tous les aspects") — `{ category, value }`,
// jamais plusieurs catégories à la fois. `trainedFactor` (voir
// CHEMISTRY_TACTICS_TRAINED_FACTOR ci-dessus, calculé par l'appelant selon
// le nombre de jours banqués) ne s'applique JAMAIS au malus dans son
// ensemble, mais UNIQUEMENT à la catégorie de `trained`, et seulement quand
// la valeur RÉELLEMENT jouée (`current`) correspond EXACTEMENT à ce qui a
// été travaillé : passer d'une défense à une autre que celle travaillée à
// l'entraînement paie donc le plein tarif sur la défense, même si `trained`
// porte sur la défense.
function tacticsChangePenalty(prev, current, trained, trainedFactor = CHEMISTRY_TACTICS_TRAINED_FACTOR) {
  if (!prev) return 0;
  const prevOffense = new Set(prev.offense);
  let penalty = 0;
  current.offense.forEach(t => {
    if (prevOffense.has(t)) return;
    const factor = trained && trained.category === "offense" && trained.value === t ? trainedFactor : 1;
    penalty += CHEMISTRY_TACTICS_OFFENSE_PENALTY * factor;
  });
  if (prev.defense !== current.defense) {
    const factor = trained && trained.category === "defense" && trained.value === current.defense ? trainedFactor : 1;
    penalty += CHEMISTRY_TACTICS_DEFENSE_PENALTY * factor;
  }
  if (prev.rhythm !== current.rhythm) {
    const factor = trained && trained.category === "rhythm" && trained.value === current.rhythm ? trainedFactor : 1;
    penalty += CHEMISTRY_TACTICS_RHYTHM_PENALTY * factor;
  }
  return penalty;
}

// Poids d'un changement de joueur selon son RANG dans l'effectif (1 = tout
// meilleur joueur au sens overall(), voir rosterRankOf ci-dessous) :
// décroît LINÉAIREMENT jusqu'à 0 au rang CHEMISTRY_ROSTER_CHANGE_MAX_RANK
// (le "12e homme" pèse donc quasiment rien, comme demandé), et reste à 0
// au-delà (un effectif de 22 joueurs maximum, voir MAX_ROSTER_SIZE, peut
// avoir un rang 13+ qui ne compte simplement plus du tout).
function chemistryRosterImportance(rank) {
  return clamp(1 - (rank - 1) / (CHEMISTRY_ROSTER_CHANGE_MAX_RANK - 1), 0, 1);
}

// Rang (1 = meilleur) d'un joueur PRÉCIS dans une liste de joueurs donnée,
// d'après overall() — à appeler au moment EXACT où ce joueur quitte ou
// rejoint un effectif (avant le splice() côté vendeur, après le push() côté
// acheteur, voir League._resolveListing/Team.sellPlayer), jamais après
// coup : le rang d'un joueur qui vient de partir n'a plus de sens une fois
// qu'il n'est plus dans la liste.
function rosterRankOf(players, playerId) {
  const sorted = [...players].sort((a, b) => b.overall() - a.overall());
  const idx = sorted.findIndex(p => p.id === playerId);
  return idx === -1 ? sorted.length + 1 : idx + 1;
}

// État affiché pour Team.chemistry (voir moraleLabel plus haut, mêmes
// seuils, même esprit : la valeur exacte reste interne, seul l'état est
// montré au manager).
function chemistryLabel(chemistry) {
  if (chemistry >= 85) return "Alchimie parfaite";
  if (chemistry >= 65) return "Bonne cohésion";
  if (chemistry >= 45) return "Cohésion correcte";
  if (chemistry >= 25) return "Tensions dans le groupe";
  return "Vestiaire fracturé";
}

// ---------------------------------------------------------------------
// ÉQUIPE
// ---------------------------------------------------------------------
class Team {
  constructor({ name, players }) {
    this.name = name;
    this.players = players; // 15 joueurs (3 par poste)

    this.autoAssignLineup();

    this.offensivePriorities = ["Équilibrée", "Pick & Roll", "Jeu en mouvement"];
    this.defense = "Homme à homme";
    this.rhythm = "Normal";

    // Tactique confirmée (retour utilisateur, 2026-09 — voir le grand
    // commentaire au-dessus de SCREEN_DEFENSES) : "tacticalTier" ne
    // sert qu'à choisir quels réglages proposer côté interface — TOUS
    // les champs ci-dessous existent déjà pour une équipe "débutant", à
    // leur valeur standard, pour que le moteur n'ait jamais besoin de
    // tester le tier lui-même. Ne JAMAIS changer une de ces valeurs par
    // défaut sans revérifier qu'elle reste un delta de zéro dans les
    // tables SCREEN_DEFENSES/HELP_DEFENSE_LEVELS/POST_DEFENSES/
    // CLOSEOUT_STYLES/OFF_REBOUND_STYLES/ENDGAME_MANAGEMENT ci-dessus.
    this.tacticalTier = "débutant"; // "débutant" | "confirmée"
    this.screenDefense = "Aucune consigne"; // clé de SCREEN_DEFENSES
    this.helpDefense = "Moyenne";           // clé de HELP_DEFENSE_LEVELS
    this.watchAssignments = [];             // jusqu'à 3 × { position, focus } — voir WATCH_FOCUS_EFFECTS
    this.postDefense = "Classique";         // clé de POST_DEFENSES
    this.closeoutStyle = "Contrôlé";        // clé de CLOSEOUT_STYLES
    this.offRebStyle = "Normal";            // clé de OFF_REBOUND_STYLES
    this.endgameManagement = "Standard";    // clé de ENDGAME_MANAGEMENT — indépendant du tier

    // Tutoriel d'accueil (retour utilisateur, 2026-09 : "on est d'accord
    // qu'on ne peut le faire qu'une fois ? quand il a été fait le bouton
    // dans le guide doit s'enlever") : jamais lu par le moteur de
    // simulation lui-même, mais DOIT quand même exister ici : c'est CE
    // fichier (mirroir exact, voir l'en-tête du fichier) qui reconstruit
    // team côté serveur à chaque sauvegarde (server/store.js ->
    // teamFromSave/serializeTeam plus bas), donc un champ absent d'ici est
    // silencieusement perdu à chaque aller-retour serveur, même s'il existe
    // côté client. Voir server/actions.js:setOnboardingTourCompleted pour
    // l'écriture côté serveur en ligue partagée (où saveMyTeam() ne peut
    // pas persister ce champ, voir moteurbasket3.html).
    this.onboardingTourCompleted = false;

    // Primes du tutoriel déjà créditées (retour utilisateur, 2026-09 :
    // "Mets les vrais primes sur le tutoriel") : liste des clés `topic` de
    // TOUR_REWARD_BY_TOPIC déjà payées à CE club, une fois pour toutes,
    // quel que soit le nombre de fois où le tutoriel est relancé ou
    // abandonné en cours de route (voir claimTutorialReward plus bas) :
    // sans ce ledger, redémarrer le tutoriel après l'avoir quitté avant la
    // fin (onboardingTourCompleted encore à `false`) permettrait de
    // retoucher indéfiniment les primes des thèmes déjà vus.
    this.tutorialRewardsClaimed = [];

    this.maintainDespiteFouls = new Set();
    // Plans d'ordres préparés À L'AVANCE pour une journée future (retour
    // utilisateur, 2026-09 : "sur buzzerbeater on peut faire pour tous les
    // matchs de la saison, [...] pratique de pouvoir préparer sa semaine en
    // avance"), valeur = un instantané complet des ordres
    // {offensivePriorities, defense, rhythm, lineup, ...}. Clé = planKey(round,
    // competition) ci-dessus ("championship:<round>" ou "cup:<round>"),
    // PAS un simple numéro de journée (correctif 2026-09, retour
    // utilisateur : "il faut pouvoir donner ses ordres pour chaque match" —
    // championnat et Coupe numérotent chacun leurs journées/tours à partir
    // de 0, une clé composite évite qu'ils s'écrasent l'un l'autre). Les
    // champs "en direct" (this.offensivePriorities/defense/rhythm/lineup
    // ci-dessus) restent la SEULE source lue au moment de simuler la
    // PROCHAINE journée à résoudre ; un plan stocké ici n'est appliqué à ces
    // champs qu'au moment où SA journée devient celle qu'on résout (voir
    // applyPlannedTacticsForRound, appelé depuis server/liveMatch.js) —
    // jusque-là, préparer une journée future ne change rien au match
    // immédiat. Vide par défaut : aucune journée future préparée,
    // comportement strictement identique à avant cette fonctionnalité tant
    // qu'elle n'est pas utilisée. Migration des sauvegardes plus anciennes
    // (clé = bare round number, forcément championnat à l'époque) vers ce
    // nouveau format : voir teamFromSave plus bas.
    this.plannedTactics = {};

    this.week = 1; // semaine d'entraînement courante (pas de calendrier complet pour l'instant)
    // Retour utilisateur (2026-09) : "au dessus de ces temps de jeu, il
    // faudrait ajouter un historique des ups et downs de la derniere
    // semaine d'entrainement" : dernier rapport renvoyé par trainWeek()
    // ci-dessous, conservé pour un réaffichage persistant sur l'onglet
    // Entraînement (voir renderLastTrainingReport côté client). Ce même
    // rapport n'était jusqu'ici affiché qu'UNE fois, de façon éphémère,
    // dans le récapitulatif "Pendant votre absence" (voir
    // trainingReportHtml/showCatchupSummaryIfAny, pendingEvents jamais
    // sauvegardé). `null` tant qu'aucune semaine d'entraînement n'a encore
    // été jouée.
    this.lastTrainingReport = null;
    // Entraînement hebdomadaire à la BuzzerBeater : UNE compétence pour tout
    // le club, appliquée à un ensemble de postes (1 à 5). Ce n'est pas un
    // choix joueur par joueur : chaque joueur profite (ou pas) de la semaine
    // selon son propre poste et selon s'il a assez joué au dernier match.
    // Retour utilisateur (2026-09) : "enleve l'entrainement aucune
    // (entrainement général uniquement)" — il n'existe plus d'option "pas de
    // focus cette semaine" (voir populateTrainingSkillSelect côté client,
    // qui ne propose plus cette option, et setTraining côté serveur, qui
    // n'accepte plus `null`) : une compétence est TOUJOURS sélectionnée, par
    // défaut "Lancer franc" (freeThrow) pour une toute nouvelle équipe.
    this.trainingSkill = "freeThrow"; // une clé de TRAINING_PROGRAMS, jamais null
    this.trainingPositions = [];    // 1, 2, 3 ou 5 postes parmi POSITIONS

    // Entraînement collectif (retour utilisateur, 2026-09 : "je souhaite
    // mettre en place maintenant l'entrainement collectif [...] soit bosser
    // une nouvelle tactique [...] soit bosser la récupération") : un réglage
    // SÉPARÉ de trainingSkill ci-dessus, les deux tournent EN MÊME TEMPS
    // (l'un porte sur les caractéristiques individuelles d'un groupe de
    // postes, l'autre sur le collectif de toute l'équipe). `null` = aucun
    // focus collectif cette semaine (comportement par défaut, inchangé pour
    // les parties déjà en cours). "tactique" : atténue le malus d'alchimie
    // d'un changement de tactique (voir Team.trainedTactics/
    // CHEMISTRY_TACTICS_TRAINED_FACTOR/checkTacticsChemistry). "recuperation" :
    // porte la récupération de forme physique quotidienne à CONDITION_
    // RECOVERY_PER_DAY_TRAINED au lieu de CONDITION_RECOVERY_PER_DAY (voir
    // conditionRecoveryPerDay ci-dessous/currentCondition plus haut).
    this.collectiveTraining = null; // null | "tactique" | "recuperation"

    // Tactique précisément travaillée à l'entraînement (retour utilisateur,
    // 2026-09 : "il faut effectivement choisir ce qui est bossé comme
    // tactique si c'est ce qui est choisi (exemple zone extérieure)", puis
    // "sachant que tu n'as qu'un jour pour faire cet entrainement [...] un
    // seul aspect et pas tous les aspects") : UN SEUL aspect précis à la
    // fois (jamais plusieurs catégories en même temps comme dans une
    // première version de cette fonctionnalité) — pertinent UNIQUEMENT
    // quand collectiveTraining === "tactique", ignoré sinon. `category`
    // désigne QUELLE des 3 catégories comparées par checkTacticsChemistry/
    // tacticsChangePenalty est travaillée, `value` LA valeur précise de
    // cette catégorie (une priorité offensive pour "offense", un nom de
    // défense pour "defense", un rythme pour "rhythm") — voir
    // tacticsChangePenalty plus bas pour le détail de l'appariement.
    this.trainedTactics = null; // null | { category: "offense"|"defense"|"rhythm", value: string }

    // Historique quotidien de l'entraînement collectif DEPUIS LE DERNIER
    // MATCH (retour utilisateur, 2026-09 : "si tu as 3 jours de repos, tu
    // divises à chaque fois par 2 le malus [...] par jour d'entrainement sur
    // la tactique [...] si le vendredi on fait entrainement récup [...] on
    // doit quand même avoir le malus divisé par deux du mercredi et par deux
    // encore une fois le jeudi") : UNE entrée par jour civil (voir
    // Team.syncCollectiveTrainingLog/parisCalendarDayIndex plus bas),
    // reconduite automatiquement d'un jour à l'autre si rien ne change,
    // JAMAIS effacée par un jour "récupération" intercalé (seul un vrai
    // match remet ce compteur à zéro, voir tacticsCycleStartDayIndex
    // ci-dessous) — permet de compter, au moment d'un match, combien de
    // jours de repos ont précisément porté sur LA MÊME tactique que celle
    // effectivement jouée ce jour-là (voir Team.daysTrainedForTarget).
    this.collectiveTrainingLog = []; // [{ dayIndex, collectiveTraining, trainedTactics }]
    // Jour civil (voir parisCalendarDayIndex) du DERNIER match réellement
    // joué : sert de repère pour ignorer tout jour de collectiveTrainingLog
    // antérieur (ou identique) à ce match — "depuis le dernier match"
    // s'applique littéralement, jamais un historique plus ancien. `null`
    // tant qu'aucun match n'a encore été joué.
    this.tacticsCycleStartDayIndex = null;

    // Identité tactique "établie" du club (retour utilisateur, 2026-09 : "si
    // je joue toute la saison sur une tactique, je change pour un seul
    // match, et je reviens à ma tactique, j'ai un malus [...] ça ne devrait
    // pas être le cas") : DIFFÉRENT de lastTacticsSnapshotForChemistry
    // ci-dessous (qui suit le tout DERNIER match, quel qu'il soit) — celui-ci
    // ne bouge QUE quand une même tactique est jouée 2 fois DE SUITE (un vrai
    // changement durable, pas un aller-retour ponctuel), voir
    // checkTacticsChemistry pour le détail. `null` tant qu'aucun match n'a
    // encore été joué.
    this.establishedTacticsSnapshot = null;

    // Staff : l'entraîneur n'a d'effet QUE sur la vitesse d'entraînement
    // (jamais sur les matchs). Pas d'entraîneur par défaut.
    this.trainer = null; // { level, weeksEmployed } ou null

    // Analyste vidéo (retour utilisateur, 2026-09 : "il faudrait pouvoir
    // scouter l'effectif de son adversaire [...] en engageant un staff plus
    // ou moins compétent, on peut voir plus ou moins de caractéristiques de
    // l'adversaire en faisant une séance vidéo") : un DEUXIÈME rôle de staff,
    // structurellement identique à l'entraîneur (même forme { level,
    // weeksEmployed, baseSalary }, même marché aux enchères — voir plus bas
    // League.analystListings/generateAnalystCandidate/placeAnalystBid/
    // _resolveAnalystListing/refreshAnalystMarket/fireTeamVideoAnalyst,
    // calqués sur leurs équivalents "entraîneur") — mais un effet totalement
    // différent : aucun impact sur l'entraînement, il débloque des SÉANCES
    // VIDÉO (voir League.runVideoSession plus bas) qui révèlent
    // progressivement les caractéristiques cachées des adversaires.
    this.videoAnalyst = null; // { level, weeksEmployed, baseSalary } ou null

    // Scoutisme adverse : nom/poste/taille/salaire sont TOUJOURS visibles
    // pour n'importe quel adversaire (aucun besoin de staff) — voir
    // moteurbasket3.html (panneau de scoutisme sur l'écran Classement). Les
    // 10 caractéristiques (ATTRS), elles, restent cachées tant qu'aucune
    // séance vidéo n'a permis de les révéler : `scoutedAttrs` associe
    // l'INDEX de chaque adversaire déjà scouté (converti en chaîne — une clé
    // d'objet JS est toujours une chaîne) au tableau des clés ATTRS déjà
    // révélées pour lui. Les caractéristiques révélées le restent pour le
    // reste de la saison même si l'analyste est ensuite congédié (une vidéo
    // déjà visionnée ne s'"oublie" pas) — voir League.runVideoSession, seul
    // endroit qui écrit dans cette carte, jamais une lecture qui la ferait
    // rétrécir. `lastVideoSessionAt` : horodatage RÉEL (epoch ms) de la
    // dernière séance vidéo de CE club, tous adversaires confondus — une
    // seule séance par JOUR CIVIL À PARIS (voir sameParisCalendarDay plus
    // bas), le même ancrage que le rythme quotidien entraînement/économie de
    // la ligue multi-manager (retour utilisateur : implicitement "1 séance
    // par jour", même esprit que "training/economy once per day").
    this.scoutedAttrs = {};
    this.lastVideoSessionAt = null;

    // Retour utilisateur (2026-09) : "quand les ordres ont été validés, il
    // faudrait [...] que le bouton donnez vos ordres deviennent : Modifier
    // vos ordres". Numéro de journée (league round) pour laquelle CE club a
    // explicitement cliqué "✅ Valider les ordres" en dernier (voir
    // validateOrdres/markOrdresValidated côté navigateur), distinct de
    // "des ordres existent" (toujours vrai, ce sont les ordres EN DIRECT,
    // voir Team.offensivePriorities et consorts) : sert uniquement à ce
    // badge d'interface, jamais lu par la simulation elle-même. `null` tant
    // qu'aucune validation explicite n'a eu lieu ; redevient "obsolète" tout
    // seul dès que la journée courante avance (comparé à currentMatch.round
    // côté navigateur), sans logique de remise à zéro dédiée nécessaire.
    this.ordresValidatedRound = null;

    // Recruteur — TROISIÈME rôle de staff (retour utilisateur, 2026-09 :
    // académie de jeunes), même forme que l'entraîneur/l'analyste vidéo
    // ci-dessus ({ level, weeksEmployed, baseSalary }, même marché aux
    // enchères — voir plus bas League.recruiterListings/
    // generateRecruiterCandidate/placeRecruiterBid/_resolveRecruiterListing/
    // refreshRecruiterMarket/fireTeamRecruiter) — mais un TROISIÈME effet,
    // différent des deux autres : tant qu'il est sous contrat, ce club (et
    // lui SEUL, voir this.youthCandidates ci-dessous) reçoit périodiquement
    // de nouvelles propositions de jeunes prospects.
    this.recruiter = null; // { level, weeksEmployed, baseSalary } ou null

    // Académie de jeunes — pipeline PRIVÉ de prospects (15-17 ans), jamais
    // partagé avec les autres managers (contrairement au marché aux
    // enchères de l'entraîneur/l'analyste/le recruteur ci-dessus, où TOUS
    // les managers voient et enchérissent sur les mêmes candidats) : voir
    // League.refreshYouthCandidates... non, cette maintenance vit sur Team
    // lui-même (Team.refreshYouthCandidates), CE flux n'appartenant qu'à ce
    // club précis, pas à la ligue entière. `youthCandidates` : propositions
    // EN ATTENTE d'une décision (signer/ignorer, voir Team.signYouthCandidate/
    // declineYouthCandidate) — attributs ACTUELS visibles immédiatement,
    // potentiel réel TOUJOURS caché (voir youthProspectLabel plus bas), même
    // règle qu'un joueur pro normal (potentialTierLabel) : un prospect de
    // l'académie tire son potentiel EXACTEMENT comme n'importe quel joueur
    // (potentialHeadroom(age) + overall() + clamp(1,99), AUCUN plafond
    // spécifique — retour utilisateur explicite : "un joueur du centre de
    // formation doit pouvoir avoir un potentiel jusqu'à 99 [...] doit pouvoir
    // devenir une superstar"), seul l'AFFICHAGE diffère : pendant toute la
    // phase académie (candidat NON signé OU jeune déjà signé mais pas encore
    // promu), le manager ne voit qu'un label grossier à 3 bandes
    // (youthProspectLabel), plus flou que le potentialTierLabel normal (10
    // paliers) utilisé pour un pro — voir le grand commentaire sur
    // youthProspectLabel plus bas pour le détail des 3 bandes.
    // `youthPlayers` : jeunes déjà SIGNÉS (jusqu'à MAX_YOUTH_ROSTER_SIZE),
    // MÊME masquage à 3 bandes que ci-dessus tant qu'ils ne sont pas promus
    // (voir Team.promoteYouthPlayer : c'est LA promotion vers l'effectif pro,
    // pas la signature, qui expose enfin le potentialTierLabel normal). Ces
    // joueurs ne jouent JAMAIS de match et n'ont AUCUN programme
    // d'entraînement à choisir (délibéré, pas de micro-management — voir
    // Team.growYouthPlayers, progression entièrement automatique, PLAFONNÉE
    // caractéristique par caractéristique à 50 — voir son commentaire —
    // indépendamment du potentiel réel qui, lui, n'est jamais plafonné). Au
    // passage d'une saison (voir Team.trainWeek), un jeune qui atteint 18 ans
    // est retiré de la gestion automatique et placé en attente d'une
    // décision manager explicite (voir this.pendingYouthDecisions ci-dessous)
    // plutôt que promu/libéré automatiquement.
    this.youthCandidates = [];
    this.youthPlayers = [];

    // Centre de formation — facilité tiered comme la salle (voir
    // TRAINING_CENTER_LEVELS/Team.nextTrainingCenterLevel/
    // upgradeTrainingCenter plus bas) : démarre au palier 1 comme
    // this.arenaLevel, un palier plus élevé accélère la progression
    // automatique des jeunes (voir Team.growYouthPlayers).
    this.trainingCenterLevel = 1;

    // Décisions manager en attente pour un jeune qui vient d'avoir 18 ans
    // (voir Team.trainWeek/promoteYouthPlayer/releaseYouthPlayer) : tableau
    // d'id de joueurs ENCORE présents dans this.youthPlayers (pas encore
    // déplacés/retirés) — si le manager ne tranche pas avant le PROCHAIN
    // passage de saison, le joueur est auto-libéré par défaut (voir
    // Team.trainWeek : ne jamais laisser une décision ignorée bloquer
    // indéfiniment une place de l'effectif jeunes).
    this.pendingYouthDecisions = [];

    // Palmarès du club (retour utilisateur, 2026-09, sur l'onglet Académie
    // de jeunes : "il faut trouver du contenu à ajouter", le haut de la
    // page jugé "affreusement vide") : nombre total de jeunes formés par
    // l'académie et promus en pro au fil de l'histoire du club (voir
    // Team.promoteYouthPlayer, seul point d'incrément). Jamais décrémenté,
    // même si le joueur est ensuite vendu, libéré ou prend sa retraite : un
    // compteur historique, pas un effectif courant.
    this.academyGraduates = 0;
    // Retour utilisateur (2026-09) : "l'historique du centre de formation,
    // c'est les joueurs qui étaient dans le centre de formation et qui sont
    // passés pro" : liste (pas juste un compteur) des jeunes promus, dans
    // l'ordre chronologique, affichée par renderAcademyGraduatesStat (côté
    // client) à la place du simple total ci-dessus. Chaque entrée est un
    // instantané figé au moment de la promotion (nom, poste).
    this.academyGraduatesHistory = [];

    this.budget = CLUB_STARTING_BUDGET;

    // Salle (voir ARENA_LEVELS) + un prix de billet par catégorie de place
    // (voir SEAT_CATEGORIES), la boutique des supporters (voir
    // FAN_SHOP_LEVELS, revenu hebdomadaire fixe payé dans trainWeek), et le
    // journal des transactions (recettes/dépenses les plus récentes, pour
    // l'écran "Économie") — voir recordTransaction().
    this.arenaLevel = 1;
    this.ticketPrices = {};
    SEAT_CATEGORIES.forEach(cat => { this.ticketPrices[cat.key] = cat.defaultPrice; });
    this.fanShopLevel = 0;
    // Autres infrastructures (voir CLUB_FACILITIES ci-dessus) : un niveau par
    // clé, 0 = rien construit — toujours un objet complet (jamais nul/absent),
    // pour que facilityInjuryRiskMult()/facilityFatigueMult() n'aient jamais
    // à gérer un cas manquant.
    this.facilityLevels = { tvStation: 0, gym: 0, wellness: 0 };
    this.transactions = [];

    // Humeur des supporters (voir attendanceBaseForMorale / moraleForgiveness
    // / moraleLabel) : neutre au départ, évolue avec les résultats et le
    // confort tarifaire — voir applyMoraleForResult et trainWeek.
    this.fanMorale = 50;
    this.moraleHistory = [];

    // Objectif de saison fixé par le conseil d'administration (retour
    // utilisateur, 2026-09, voir le grand commentaire au-dessus de
    // SEASON_OBJECTIVE_TIERS plus bas) : `null` tant qu'aucune ligue n'a
    // encore été générée pour ce club (assignSeasonObjectives, appelée par
    // buildLeagueWithHumanTeams, le pose dès la création/régénération de la
    // ligue), une des 5 clés de SEASON_OBJECTIVE_TIERS une fois posé.
    this.seasonObjective = null;

    // Alchimie d'équipe (voir le grand commentaire au-dessus de
    // CHEMISTRY_ROSTER_CHANGE_MAX_RANK plus haut) : neutre au départ, comme
    // fanMorale. `lastTacticsSnapshotForChemistry` : `null` tant qu'aucun
    // match n'a encore été joué (voir Team.checkTacticsChemistry), pas de
    // malus au tout premier match de la saison, faute de match précédent
    // auquel se comparer.
    this.chemistry = 50;
    this.lastTacticsSnapshotForChemistry = null;

    // Médias : interviews de jalon en attente d'un ton de réponse (retour
    // utilisateur, 2026-09 : "Interview d'après match qui pourrait influencer
    // sur les supporters et les joueurs [...] une petite interaction à choix
    // multiples [...] qui influence légèrement le moral ou l'humeur des
    // supporters. Peu coûteux à développer, et cela ajoute de la
    // personnalité") : un tableau, alimenté par applyMoraleForResult
    // ci-dessous UNIQUEMENT aux 5 moments clés de la saison (voir
    // MILESTONE_INTERVIEW_TYPES), vidé au fur et à mesure par
    // resolveInterview/skipInterview (voir MILESTONE_INTERVIEW_TONES plus
    // bas), même esprit de file d'attente que pendingYouthDecisions plus
    // haut, jamais bloquant pour la simulation elle-même. L'interview
    // classique d'après CHAQUE match (V1, fanMorale seul) a été retirée
    // (retour utilisateur, 2026-09 : "on enlève ça") au profit du seul
    // système de jalon, qui fait aussi bouger Player.form.
    this.pendingInterviews = [];

    // MVP automatique du dernier match joué par ce club (retour utilisateur,
    // 2026-09 : "mettre ses citations sur la page tableau de bord [...] et
    // sur le box score du match fini") : posé pour les DEUX équipes (celle
    // du MVP et son adversaire) par awardMatchMvp (voir server/liveMatch.js),
    // que le MVP appartienne à ce club ou à l'adversaire : un club n'a sinon
    // aucun moyen de savoir qui a été élu MVP de son dernier match si ce
    // n'était pas l'un de ses propres joueurs. `null` tant qu'aucun match
    // n'a encore été joué.
    this.lastMatchMvp = null;

    // Identité du club : logo et maillots (retour utilisateur, 2026-09 :
    // "une petite page d'accueil pour les autres équipes [...] le logo de
    // l'équipe doit être type dès lors que l'équipe ne paie pas [...] pour
    // les équipes qui paient, elles doivent pouvoir charger leur propre
    // image [...] une équipe gratuite doit pouvoir choisir uniquement entre
    // 2 formes de maillot et 5 couleurs [...] le logo et les maillots
    // doivent pouvoir être modifiés dans le tableau de bord"). Voir
    // JERSEY_COLORS/JERSEY_SHAPES/MAX_TEAM_LOGO_DATA_URL_LENGTH plus haut et
    // setJersey/setCustomLogo/setPaying plus bas. `isPaying` : pas de vrai
    // système de paiement pour l'instant, interrupteur manuel en attendant.
    // `customLogoDataUrl` : ignoré au RENDU dès que `isPaying` est faux
    // (jamais effacé pour autant, voir setPaying) plutôt qu'un logo type
    // toujours régénéré depuis le nom/la couleur de maillot du club, sans
    // rien stocker (voir teamLogoHtml côté moteurbasket3.html).
    this.isPaying = false;
    this.customLogoDataUrl = null;
    this.jerseyShape = JERSEY_SHAPES[0];
    this.jerseyColor = Object.keys(JERSEY_COLORS)[0];
    // Motif de maillot (retour utilisateur : "ajoute des maillots avec des
    // dessins particuliers (rayure, degrade...)" pour le mode payant) : voir
    // JERSEY_PATTERNS/setJerseyPattern, même garde-fou "isPaying" que
    // customLogoDataUrl ci-dessus.
    this.jerseyPattern = JERSEY_PATTERNS[0];
    // Combinaison de 2 couleurs pour les motifs "rayures"/"degrade" (retour
    // utilisateur : "mets le choix de 2 couleurs [...] mets plus de choix")
    // : voir JERSEY_TWO_TONE_SETS/setJerseyTwoTone, même garde-fou
    // "isPaying" que jerseyPattern ci-dessus. Une valeur par défaut est
    // toujours définie (même pour un club gratuit qui ne la voit jamais au
    // rendu) pour ne jamais avoir à distinguer "pas encore choisi" de
    // "choisi mais ignoré".
    this.jerseyTwoTone = Object.keys(JERSEY_TWO_TONE_SETS)[0];

    // Maillot EXTÉRIEUR, indépendant du maillot domicile ci-dessus (retour
    // utilisateur, 2026-09 : "sur les maillots, il y a un problème, c'est
    // qu'on ne peut choisir que les maillots domiciles, il faudrait changer
    // ça" puis "Travaille sur les maillots extérieurs également") : même
    // forme que le domicile (jerseyShape, un club n'a qu'une seule coupe de
    // maillot), mais couleur/motif/combinaison propres, mêmes garde-fous
    // "isPaying" que jerseyPattern/jerseyTwoTone (voir
    // setAwayJerseyPattern/setAwayJerseyTwoTone plus bas). Couleur par
    // défaut choisie pour contraster avec le maillot domicile (voir
    // defaultAwayJerseyColor plus haut) plutôt qu'une couleur fixe, pour ne
    // pas avoir 2 maillots identiques dès la création d'un club.
    this.awayJerseyColor = defaultAwayJerseyColor(this.jerseyColor);
    this.awayJerseyPattern = JERSEY_PATTERNS[0];
    this.awayJerseyTwoTone = Object.keys(JERSEY_TWO_TONE_SETS)[0];

    // Date de création et trophées (retour utilisateur, 2026-09 : "on
    // pourrait ajouter les petites infos comme date de création, renommée et
    // trophée du club" en regardant la page "Aperçu"). `foundedYear` : voir
    // generateFoundedYear plus haut, tiré une seule fois puis figé par
    // serializeTeam/teamFromSave. `trophies` : alimenté par
    // League.recordTrophy (voir advanceCup/runPlayoffs plus bas), jamais
    // écrit ailleurs. La "renommée" n'a PAS de champ ici : voir
    // computeClubReputationStars plus haut, recalculée à l'affichage.
    this.foundedYear = generateFoundedYear();
    // Marqueur de migration (retour utilisateur, 2026-09 : "on a tjrs des
    // dates de création random") : distingue un foundedYear posé par la
    // logique RÉELLE actuelle (voir generateFoundedYear plus haut) d'un
    // foundedYear hérité de l'ancienne logique aléatoire (5 à 90 ans avant
    // aujourd'hui, avant le commit "Annee de fondation du club reelle").
    // Toujours vrai pour un club neuf ; voir teamFromSave plus bas pour la
    // migration ponctuelle des sauvegardes antérieures à ce marqueur.
    this.foundedYearRealDate = true;
    this.trophies = [];

    // Affluence des derniers matchs à domicile (retour utilisateur, 2026-09 :
    // "sur l'onglet salle, il n'y a tjrs pas l'affluence des matchs
    // précédents (jusqu'à 10 matchs)") : même principe que moraleHistory
    // ci-dessus (unshift + plafond), mais plafonné à 10 plutôt que 40 (demande
    // explicite), alimenté par simulateHomeAttendance plus bas, un seul appel
    // par match à DOMICILE (jamais à l'extérieur, l'affluence de la salle
    // adverse n'est pas suivie ici).
    this.attendanceHistory = [];

    // Semaines CONSÉCUTIVES où le budget est resté sous DEFICIT_ALERT_THRESHOLD
    // (voir trainWeek) — remis à zéro dès que le budget repasse au-dessus.
    this.deficitWeeks = 0;

    // Identité manager (retour utilisateur, 2026-09 : jusqu'à 10 vrais
    // managers humains dans UNE seule ligue partagée, le reste comblé par des
    // adversaires CPU — voir generateMultiManagerLeague) : `false`/`null` par
    // défaut pour TOUTE équipe (y compris les adversaires CPU, qui ne portent
    // jamais ces champs) — seul le code qui construit une équipe pour un
    // VRAI manager (generateLeague pour le solo historique,
    // generateMultiManagerLeague pour plusieurs) met `isHuman` à `true` et
    // génère un `managerLinkToken` frais (voir randomHexToken ci-dessus).
    // Avant ce champ, "index 0 = le manager humain" était une simple
    // convention non écrite, partout dans League/server/ — ce flag la rend
    // explicite, ce qui permet à un manager humain d'occuper N'IMPORTE QUEL
    // index (voir buildLeagueWithHumanTeams). `managerLinkToken` est le seul
    // secret qui identifie une requête HTTP comme venant de CE manager (voir
    // server/store.js:resolveManagerTeam) — jamais affiché ni journalisé.
    this.isHuman = false;
    this.managerLinkToken = null;

    // Droit d'administration de ligue (2026-09, Phase B) : `false` par défaut
    // pour toute équipe. Un SEUL manager par ligue multi-managers peut porter
    // `isAdmin: true` (choisi à la création via `adminTeamName`, voir
    // server/store.js:generateMultiManagerLeague — par défaut le tout premier
    // nom de `teamNames`). Ce flag autorise ce manager à déclencher un reset
    // complet de la ligue depuis l'app (voir POST /api/reset-multi-league
    // côté serveur), sans jamais exposer le secret BASKET_ADMIN_TOKEN brut.
    this.isAdmin = false;
  }

  // ---------------------------------------------------------------------
  // Économie : toute variation de budget (recette ou dépense) passe par
  // recordTransaction, seule source de vérité pour le budget ET le journal
  // affiché sur l'écran "Économie" (les 40 entrées les plus récentes).
  // ---------------------------------------------------------------------
  recordTransaction(label, amount) {
    this.transactions = this.transactions || [];
    this.transactions.unshift({ week: this.week, label, amount: Math.round(amount) });
    if (this.transactions.length > 40) this.transactions.length = 40;
    this.budget += amount;
  }

  // Humeur des supporters : toute variation passe par ici, seule source de
  // vérité pour fanMorale ET le journal affiché sur l'écran "Humeur des
  // supporters" (les 40 événements les plus récents). `extra` (optionnel) :
  // champs supplémentaires fusionnés dans l'entrée du journal, sans toucher
  // à fanMorale ni au calcul du delta, uniquement pour de l'information
  // d'affichage propre à certains appelants (voir resolveInterview
  // ci-dessous, qui y ajoute `quote`).
  recordMoraleEvent(label, delta, extra = {}) {
    this.moraleHistory = this.moraleHistory || [];
    const rounded = Math.round(delta * 10) / 10;
    this.moraleHistory.unshift({ week: this.week, label, delta: rounded, ...extra });
    if (this.moraleHistory.length > 40) this.moraleHistory.length = 40;
    this.fanMorale = clamp(this.fanMorale + delta, 0, 100);
  }

  // Effet des résultats sportifs sur l'humeur : une victoire nette (gros
  // écart) enthousiasme un peu plus qu'une victoire courte, une défaite
  // sévère agace un peu plus qu'une défaite courte. Appelé à chaque match
  // (domicile ou extérieur). `round` : conservé sur l'entrée (utile aux
  // jalons de saison régulière, retrouvés par round côté navigateur), mais
  // NE crée plus d'interview à lui seul depuis le retrait de l'interview
  // classique d'après-match (retour utilisateur, 2026-09 : "on enlève ça") :
  // seul `milestone` déclenche désormais la mise en attente d'une interview
  // (voir pendingInterviews/MILESTONE_INTERVIEW_TONES ci-dessous).
  // `now` (optionnel, horodatage réel en millisecondes) : posé sur l'entrée
  // comme `at`, point de départ du délai de réponse (voir
  // MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS/pruneExpiredInterviews) ; par
  // défaut Date.now(), le vrai moment où ce résultat est traité, jamais une
  // date du calendrier simulé de la ligue.
  // `milestone` (optionnel, retour utilisateur 2026-09 : "elle doit avoir
  // lieu après le match de la mi saison [...] fin de la saison régulière
  // [...] demi finale de PO [...] finale de PO [...] début de saison") : une
  // des clés de MILESTONE_INTERVIEW_TYPES, seule condition de mise en
  // attente d'une interview (délai de 3 jours, tons/citations étoffés, effet
  // sur Player.form — voir pruneExpiredInterviews/resolveInterview), SANS
  // rien changer au delta de fanMorale immédiat calculé juste en dessous (le
  // résultat sportif du jour reste toujours traité pareil).
  // `explicitPlayerIds` (optionnel) : par défaut (`null`), les joueurs
  // affectés par une interview de jalon sont déduits de secondsPlayed > 0 AU
  // MOMENT de cet appel — correct pour début de saison/mi-saison/fin de
  // saison régulière (appelé juste après le match concerné, rien d'autre ne
  // s'est simulé entre-temps). NE MARCHE PAS pour la demi-finale de
  // play-offs : la finale se simule juste après dans la même série de tours,
  // et écraserait secondsPlayed des deux finalistes avant que
  // _queuePlayoffSeriesInterview n'ait la moindre chance de le lire, voir
  // League.recordPlayoffGameResult/_queuePlayoffSeriesInterview, qui passent
  // ici un instantané figé AU MOMENT de la demi-finale plutôt que de compter
  // sur ce repli automatique.
  applyMoraleForResult(won, scoreDiff, opponentName, round, now = Date.now(), milestone = null, explicitPlayerIds = null) {
    this.pruneExpiredInterviews(now);
    const margin = clamp(Math.abs(scoreDiff) / 40, 0, 1);
    const delta = won ? rand(3, 6) + margin * 1.5 : -(rand(2, 5) + margin * 1.5);
    this.recordMoraleEvent(won ? `Victoire contre ${opponentName}` : `Défaite contre ${opponentName}`, delta);
    if (milestone) {
      this.pendingInterviews = this.pendingInterviews || [];
      const entry = {
        id: uid(), round, opponentName, won, scoreDiff, at: now, milestone,
        // Joueurs affectés par l'effet sur Player.form à la résolution (voir
        // resolveInterview) : voir le commentaire d'explicitPlayerIds
        // au-dessus pour pourquoi un repli automatique ne suffit pas
        // toujours.
        playerIds: explicitPlayerIds || this.players.filter(p => p.secondsPlayed > 0).map(p => p.id),
      };
      this.pendingInterviews.push(entry);
    }
    return delta;
  }

  // Retire silencieusement, sans le moindre effet sur l'humeur, toute
  // interview en attente depuis plus de MILESTONE_INTERVIEW_RESPONSE_
  // DEADLINE_MS (retour utilisateur : "on a 3 jours pour faire l'interview
  // sinon c'est neutre sur le moral") : un "sans commentaire" implicite pour
  // le manager qui n'a jamais répondu. Appelée systématiquement au début de
  // applyMoraleForResult/resolveInterview/skipInterview (housekeeping
  // automatique, jamais besoin d'un appel dédié) ET côté serveur à chaque
  // requête joueur (voir server/index.js:tick), pour que la file reste
  // propre même si le manager ne déclenche plus jamais aucune de ces trois
  // méthodes. Renvoie le nombre d'entrées retirées. Toute entrée SANS
  // `milestone` (résidu d'une sauvegarde antérieure au retrait de
  // l'interview classique d'après-match) est traitée comme déjà expirée et
  // retirée sans effet, plutôt que de garder vivant un système désormais
  // supprimé.
  pruneExpiredInterviews(now = Date.now()) {
    this.pendingInterviews = this.pendingInterviews || [];
    const before = this.pendingInterviews.length;
    this.pendingInterviews = this.pendingInterviews.filter(i => {
      return !!i.milestone && (now - i.at) < MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS;
    });
    return before - this.pendingInterviews.length;
  }

  // Résout une interview de jalon en attente avec le(s) ton(s) choisi(s) par
  // le manager (voir MILESTONE_INTERVIEW_TONES) : ajoute un delta d'humeur
  // des supporters ET un delta de forme pour TOUT L'EFFECTIF (correctif
  // 2026-09, retour utilisateur : "tous les joueurs doivent être impactés
  // par les interviews, les interviews sont sur des périodes de la saison
  // et pas uniquement un match", voir MILESTONE_INTERVIEW_TONES plus haut ;
  // `entry.playerIds`, figé à la mise en attente, ne sert donc plus qu'à
  // savoir qui a RÉELLEMENT joué le match ayant déclenché le jalon, plus à
  // scoper l'effet), dans le sens du résultat ORIGINAL du match concerné
  // (jamais l'inverse), puis retire l'entrée de la file. `tones` (correctif
  // 2026-09, retour utilisateur : "la possibilité de choisir le ton pour
  // chacune [des questions] et pas uniquement un ton pour toutes les
  // questions") : soit un TABLEAU (un ton par question), soit une chaîne
  // unique (compatibilité ascendante, appliquée à toutes les questions) —
  // voir interviewTranscriptFor pour le même contrat. Quand plusieurs tons
  // différents sont choisis, les deltas de CHAQUE ton sont MOYENNÉS (plutôt
  // que sommés) pour garder une magnitude globale comparable à l'ancien
  // système à ton unique. Renvoie { ok: true, delta, formDelta,
  // chemistryDelta, quotes } ou null (id introuvable/déjà traité, expiré
  // depuis plus de 3 jours, un ton inconnu, ou entrée sans `milestone` -
  // résidu d'une sauvegarde antérieure au retrait de l'interview classique,
  // voir pruneExpiredInterviews), jamais d'exception, comme le reste des
  // méthodes "résoudre une file d'attente" de cette classe (voir
  // promoteYouthPlayer). Construit aussi le transcript complet
  // {question, answer}[] (voir interviewTranscriptFor/
  // MILESTONE_INTERVIEW_QUESTIONS ci-dessus) et le fige dans le journal via
  // `recordMoraleEvent(..., { quotes, quote })` : `quote` (les réponses
  // mises bout à bout) reste affiché tel quel sur la page "Aperçu" (retour
  // utilisateur : "mets plutôt ce que le coach vraiment dit"), `quotes`
  // porte le détail question par question pour un affichage plus riche
  // (popup d'interview). `entry.opponentName` peut être `null` (interview
  // "debut-saison" d'avant-saison, voir queueSeasonPreviewInterview
  // ci-dessous, sans adversaire ni résultat concerné) : le libellé du
  // journal s'adapte alors pour ne mentionner ni victoire/défaite ni
  // adversaire.
  resolveInterview(id, tones, now = Date.now()) {
    this.pruneExpiredInterviews(now);
    this.pendingInterviews = this.pendingInterviews || [];
    const idx = this.pendingInterviews.findIndex(i => i.id === id);
    if (idx === -1) return null;
    const entry = this.pendingInterviews[idx];
    if (!entry.milestone) { this.pendingInterviews.splice(idx, 1); return null; }
    const questionCount = (MILESTONE_INTERVIEW_QUESTIONS[entry.milestone] || []).length || 2;
    const toneList = Array.isArray(tones) ? tones : Array(questionCount).fill(tones);
    if (!toneList.length || toneList.some(t => !MILESTONE_INTERVIEW_TONES[t])) return null;
    const toneConfigs = toneList.map(t => MILESTONE_INTERVIEW_TONES[t]);
    const avgOf = key => toneConfigs.reduce((sum, cfg) => sum + cfg[key], 0) / toneConfigs.length;
    const fanDelta = avgOf(entry.won ? "fanWin" : "fanLoss");
    const formDelta = avgOf(entry.won ? "formWin" : "formLoss");
    // Alchimie d'équipe (voir MILESTONE_INTERVIEW_TONES.chemistryWin/
    // chemistryLoss ci-dessus) : levier 1 des 3 (retour utilisateur).
    const chemistryDelta = avgOf(entry.won ? "chemistryWin" : "chemistryLoss");
    const milestoneInfo = MILESTONE_INTERVIEW_TYPES[entry.milestone];
    const milestoneLabel = milestoneInfo ? milestoneInfo.label : "Interview de jalon";
    const quotes = interviewTranscriptFor(entry.milestone, toneList, entry.won, entry.opponentName, entry.playerName);
    const quote = quotes.map(q => q.answer).filter(Boolean).join(" ");
    const toneLabel = toneList.every(t => t === toneList[0]) ? toneList[0].toLowerCase() : toneList.map(t => t.toLowerCase()).join("/");
    const label = entry.opponentName
      ? `${milestoneLabel} (ton ${toneLabel}) après ${entry.won ? "la victoire" : "la défaite"} contre ${entry.opponentName}`
      : `${milestoneLabel} (ton ${toneLabel})`;
    this.recordMoraleEvent(label, fanDelta, { quote, quotes, milestone: entry.milestone });
    // TOUT l'effectif (pas seulement entry.playerIds, voir le commentaire de
    // cette méthode plus haut) : une interview de jalon porte sur toute une
    // période de la saison, jamais sur le seul match qui l'a déclenchée.
    this.players.forEach(p => { p.form = clamp(Math.round(p.form + formDelta), 1, 100); });
    this.applyChemistryDelta(chemistryDelta);
    this.pendingInterviews.splice(idx, 1);
    return { ok: true, delta: fanDelta, formDelta, chemistryDelta, quotes };
  }

  // Interview d'AVANT-saison (correctif 2026-09, retour utilisateur : "la
  // première interview doit pouvoir se faire avant le début de saison et ne
  // doit pas porter sur le resultat du premier match mais sur la saison à
  // venir (objectif, joueur sur qui on compte...)") : remplace l'ancien
  // déclenchement (jalon "debut-saison" posé après le résultat de la
  // journée 0, voir l'ancien milestoneTypeForRound) par une mise en attente
  // dès la CRÉATION de la ligue, avant le moindre match joué (voir
  // Engine.buildLeagueWithHumanTeams, seul appelant). Contenu tourné vers
  // l'AVENIR plutôt qu'un résultat qui n'existe pas encore : `won` toujours
  // à `true` (cadrage positif/plein d'espoir, aucune variante "défaite" ne
  // sera jamais lue pour ce jalon précis, voir
  // MILESTONE_INTERVIEW_QUOTES["debut-saison"]), `opponentName` à `null`
  // (aucun match concerné), `playerIds` = tout l'effectif (discours de
  // rentrée adressé au groupe entier, pas seulement à ceux qui auront joué
  // un match qui n'a pas encore eu lieu). `playerName` : le joueur le mieux
  // noté de l'effectif à son poste (weightedRatingForPosition), substitué à
  // `{player}` dans les citations (voir interviewTranscriptFor). Ne fait
  // rien (renvoie `null`) si l'effectif est vide.
  queueSeasonPreviewInterview(now = Date.now()) {
    this.pruneExpiredInterviews(now);
    this.pendingInterviews = this.pendingInterviews || [];
    if (!this.players.length) return null;
    let keyPlayer = this.players[0];
    let bestRating = -Infinity;
    this.players.forEach(p => {
      const rating = weightedRatingForPosition(p.attrs, p.position);
      if (rating > bestRating) { bestRating = rating; keyPlayer = p; }
    });
    const entry = {
      id: uid(), round: null, opponentName: null, won: true, scoreDiff: null, at: now,
      milestone: "debut-saison",
      playerIds: this.players.map(p => p.id),
      playerName: keyPlayer.name,
    };
    this.pendingInterviews.push(entry);
    return entry;
  }

  // Applique un delta à Team.chemistry, toujours borné à [0, 100] (voir le
  // grand commentaire de CHEMISTRY_ROSTER_CHANGE_MAX_RANK plus haut pour les
  // 3 leviers qui l'appellent) : point d'entrée UNIQUE pour modifier
  // Team.chemistry, pour qu'aucun appelant ne puisse oublier le clamp.
  applyChemistryDelta(delta) {
    this.chemistry = clamp(this.chemistry + delta, 0, 100);
  }

  // Multiplicateur de performance lié à l'alchimie (voir Player.eff()/
  // Team.resetForMatch plus bas) : effet volontairement MODESTE (0.94 à
  // 1.06, +/-6%) — un "petit plus/petit moins" d'ensemble sur TOUTE
  // l'équipe, jamais un levier aussi fort que la forme physique ou la
  // fatigue d'UN joueur (voir CONDITION_STATES.perfFactor, qui va jusqu'à
  // -45%).
  chemistryFactor() {
    return 0.94 + (this.chemistry / 100) * 0.12;
  }

  // Historique quotidien de l'entraînement collectif (voir
  // Team.collectiveTrainingLog dans le constructeur pour le détail complet
  // de ce que ça représente et pourquoi) : à appeler à chaque fois qu'on a
  // l'occasion d'observer l'écoulement du temps réel pour CE club (voir
  // server/index.js:tick, appelé à CHAQUE requête joueur, et setTraining,
  // appelé à chaque changement de réglage) — jamais dépendant d'une boucle
  // qui avancerait "un jour à la fois" (ce jeu n'en a pas), donc comble
  // rétroactivement tout jour manqué depuis la dernière synchro en
  // reconduisant la config qui était alors active (voir la boucle
  // ci-dessous), plutôt que de perdre ces jours silencieusement.
  syncCollectiveTrainingLog(now = Date.now()) {
    const todayIndex = parisCalendarDayIndex(now);
    if (!Array.isArray(this.collectiveTrainingLog)) this.collectiveTrainingLog = [];
    const log = this.collectiveTrainingLog;
    const snapshotEntry = (dayIndex, collectiveTraining, trainedTactics) => ({
      dayIndex,
      collectiveTraining,
      trainedTactics: trainedTactics ? { category: trainedTactics.category, value: trainedTactics.value } : null,
    });
    const last = log.length ? log[log.length - 1] : null;
    if (last && last.dayIndex === todayIndex) {
      // Même jour civil : dernier réglage du jour qui compte (l'utilisateur
      // peut changer d'avis plusieurs fois dans la même journée) — remplace
      // l'entrée existante plutôt que d'en empiler une deuxième.
      log[log.length - 1] = snapshotEntry(todayIndex, this.collectiveTraining, this.trainedTactics);
    } else {
      if (last) {
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        for (let cursor = last.dayIndex + ONE_DAY_MS; cursor < todayIndex; cursor += ONE_DAY_MS) {
          // Comble un jour manqué (absence, gros rattrapage groupé...) avec
          // la config qui était active à ce moment-là (celle de la DERNIÈRE
          // entrée connue), jamais la config actuelle qui pourrait venir
          // tout juste de changer pour AUJOURD'HUI seulement.
          log.push(snapshotEntry(cursor, last.collectiveTraining, last.trainedTactics));
        }
      }
      log.push(snapshotEntry(todayIndex, this.collectiveTraining, this.trainedTactics));
    }
    // Purge tout jour antérieur (ou identique) au début du cycle actuel
    // (dernier match RÉELLEMENT joué, voir tacticsCycleStartDayIndex/
    // checkTacticsChemistry ci-dessous) : "depuis le dernier match"
    // s'applique littéralement, et ça évite une historique illimitée.
    if (this.tacticsCycleStartDayIndex != null) {
      this.collectiveTrainingLog = this.collectiveTrainingLog.filter(e => e.dayIndex > this.tacticsCycleStartDayIndex);
    }
  }

  // Nombre de jours (depuis le dernier match, voir tacticsCycleStartDayIndex)
  // où l'entraînement collectif a porté EXACTEMENT sur `target` ({ category,
  // value }, voir Team.trainedTactics), utilisé par checkTacticsChemistry
  // pour calculer l'atténuation composée du malus (voir
  // CHEMISTRY_TACTICS_TRAINED_FACTOR). Un jour "récupération" (ou tout autre
  // focus) intercalé ne compte simplement pas, mais n'efface pas non plus
  // les jours déjà banqués (retour utilisateur, 2026-09 : "si le vendredi on
  // fait entrainement récup [...] on doit quand même avoir le malus divisé
  // par deux du mercredi et par deux encore une fois le jeudi").
  daysTrainedForTarget(target) {
    if (!target || !Array.isArray(this.collectiveTrainingLog)) return 0;
    const cycleStart = this.tacticsCycleStartDayIndex;
    return this.collectiveTrainingLog.filter(e => {
      if (cycleStart != null && e.dayIndex <= cycleStart) return false;
      return e.collectiveTraining === "tactique" && e.trainedTactics
        && e.trainedTactics.category === target.category && e.trainedTactics.value === target.value;
    }).length;
  }

  // Détecte un changement de tactique par rapport à la RÉFÉRENCE de
  // cohésion (retour utilisateur : "changer trop régulièrement de tactique
  // doit aussi avoir un petit impact", levier 3 des 3) : compare uniquement
  // l'identité tactique de FOND (attaque prioritaire, défense, rythme),
  // volontairement PAS les réglages fins (aide défensive, style de
  // contre-attaque, marquage individuel...) — on ne pénalise qu'un vrai
  // changement de plan de jeu, pas un simple ajustement. Appelée à chaque
  // match réellement simulé (voir recordMatchStatsForTeam), jamais pendant
  // la planification à l'avance (stagePlanForRound), qui ne représente
  // encore qu'une intention et non un ordre réellement donné.
  //
  // La RÉFÉRENCE n'est pas toujours lastTacticsSnapshotForChemistry (le tout
  // dernier match, quel qu'il soit) : retour utilisateur, 2026-09 — "si je
  // joue toute la saison sur une tactique, je change pour un seul match, et
  // je reviens à ma tactique, j'ai un malus [...] ça ne devrait pas être le
  // cas". Si la tactique actuelle correspond EXACTEMENT à l'identité établie
  // (establishedTacticsSnapshot, voir le constructeur) ET diffère de ce qui
  // vient d'être joué au match précédent (un vrai aller-retour, pas "on
  // continue comme avant"), on compare à cette identité établie à la place :
  // le malus tombe alors à 0 (revenir chez soi ne coûte rien). `null` posé
  // par le constructeur = pas encore de match de référence : aucun malus au
  // tout premier match de la saison.
  checkTacticsChemistry(now = Date.now()) {
    const current = {
      offense: [...this.offensivePriorities],
      defense: this.defense,
      rhythm: this.rhythm,
    };
    const lastPlayed = this.lastTacticsSnapshotForChemistry;
    const established = this.establishedTacticsSnapshot;
    let referenceForPenalty = lastPlayed;
    if (established && tacticsEqual(current, established) && !tacticsEqual(current, lastPlayed)) {
      referenceForPenalty = established;
    }

    // Entraînement collectif "tactique" (retour utilisateur, 2026-09 : "soit
    // bosser une nouvelle tactique ; ce qui permet d'éviter de trop
    // dégrader l'alchimie quand on la met en place en match [...] il faut
    // effectivement choisir ce qui est bossé comme tactique [...] un seul
    // aspect et pas tous les aspects") : UN SEUL aspect précis (voir
    // Team.trainedTactics), atténué CATÉGORIE PAR CATÉGORIE (jamais le malus
    // dans son ensemble), et d'autant plus fort que ça fait de jours de
    // repos consécutifs que cet aspect précis est travaillé (voir
    // daysTrainedForTarget/CHEMISTRY_TACTICS_TRAINED_FACTOR). Lu
    // directement sur `this.trainedTactics`, PAS conditionné à
    // `collectiveTraining === "tactique"` À CET INSTANT PRÉCIS (retour
    // utilisateur, 2026-09 : "si le vendredi on fait entrainement récup
    // [...] on doit quand même avoir le malus divisé par deux du mercredi et
    // par deux encore une fois le jeudi") — le focus du jour du MATCH lui-même
    // ne compte de toute façon jamais comme un jour d'entraînement (voir
    // tacticsCycleStartDayIndex), donc peu importe s'il a entre-temps changé ;
    // seul le nombre de jours RÉELLEMENT banqués dans collectiveTrainingLog
    // (voir daysTrainedForTarget) détermine l'atténuation.
    const target = this.trainedTactics;
    const daysTrained = target ? this.daysTrainedForTarget(target) : 0;
    const trainedFactor = Math.pow(CHEMISTRY_TACTICS_TRAINED_FACTOR, daysTrained);
    const penalty = tacticsChangePenalty(referenceForPenalty, current, target, trainedFactor);
    if (penalty > 0) this.applyChemistryDelta(-penalty);

    // Identité établie (voir le grand commentaire ci-dessus) : n'avance que
    // quand la MÊME tactique vient d'être jouée 2 fois de suite (current ==
    // lastPlayed, avant écrasement ci-dessous) — un vrai changement durable,
    // jamais un simple aller-retour ponctuel — ou au tout premier match
    // (established encore `null`).
    if (!established || tacticsEqual(current, lastPlayed)) {
      this.establishedTacticsSnapshot = current;
    }
    this.lastTacticsSnapshotForChemistry = current;

    // Ce match consomme tout le crédit accumulé dans collectiveTrainingLog
    // (voir daysTrainedForTarget ci-dessus) : nouveau cycle à partir de
    // MAINTENANT, les prochains jours de repos recommencent à zéro (voir le
    // filtre `dayIndex > tacticsCycleStartDayIndex` dans syncCollectiveTrainingLog/
    // daysTrainedForTarget).
    this.tacticsCycleStartDayIndex = parisCalendarDayIndex(now);
  }

  // Taux de récupération de forme physique quotidien de ce club (retour
  // utilisateur, 2026-09, voir Team.collectiveTraining/CONDITION_RECOVERY_
  // PER_DAY_TRAINED plus haut) : CONDITION_RECOVERY_PER_DAY_TRAINED (15/jour,
  // la valeur historique) si le focus collectif de la semaine est
  // "recuperation", sinon CONDITION_RECOVERY_PER_DAY (10/jour, le nouveau
  // défaut). Lu par Team.resetForMatch/recordMatchStatsForTeam (voir plus
  // bas) et par l'affichage de la forme physique côté client
  // (currentCondition).
  conditionRecoveryPerDay() {
    return this.collectiveTraining === "recuperation" ? CONDITION_RECOVERY_PER_DAY_TRAINED : CONDITION_RECOVERY_PER_DAY;
  }

  // Ignore une interview en attente ("pas de commentaire") : aucun effet sur
  // l'humeur, retire simplement l'entrée de la file. Renvoie true si une
  // entrée correspondante a bien été trouvée et retirée (false si déjà
  // traitée, ou déjà expirée et retirée par pruneExpiredInterviews ci-dessus).
  skipInterview(id, now = Date.now()) {
    this.pruneExpiredInterviews(now);
    this.pendingInterviews = this.pendingInterviews || [];
    const before = this.pendingInterviews.length;
    this.pendingInterviews = this.pendingInterviews.filter(i => i.id !== id);
    return this.pendingInterviews.length !== before;
  }

  // Choix de maillot d'un club (retour utilisateur : "une équipe gratuite
  // doit pouvoir choisir uniquement entre 2 formes de maillot et 5
  // couleurs [...] les maillots doivent pouvoir être modifiés dans le
  // tableau de bord") : validé contre JERSEY_SHAPES/JERSEY_COLORS, jamais
  // stocké sans validation. Même palette pour un club payant (voir le
  // commentaire sur JERSEY_COLORS plus haut).
  setJersey(shape, color) {
    if (!JERSEY_SHAPES.includes(shape)) return { ok: false, error: "Forme de maillot inconnue." };
    if (!JERSEY_COLORS[color]) return { ok: false, error: "Couleur de maillot inconnue." };
    this.jerseyShape = shape;
    this.jerseyColor = color;
    return { ok: true };
  }

  // Motif de maillot (retour utilisateur : "Pour le mode payant ajoute des
  // maillots avec des dessins particuliers (rayure, degrade...)") : "uni"
  // (retour au maillot standard) toujours autorisé, un motif personnalisé
  // (JERSEY_PATTERNS[1+]) réservé à un club `isPaying`, même garde-fou que
  // setCustomLogo ci-dessous. Jamais effacé en repassant gratuit (voir
  // setPaying) : seul le RENDU l'ignore tant que le club n'est pas payant
  // (voir effectiveJerseyPattern côté moteurbasket3.html).
  setJerseyPattern(pattern) {
    if (!JERSEY_PATTERNS.includes(pattern)) return { ok: false, error: "Motif de maillot inconnu." };
    if (pattern !== JERSEY_PATTERNS[0] && !this.isPaying) {
      return { ok: false, error: "Passez en club payant pour un motif de maillot personnalisé." };
    }
    this.jerseyPattern = pattern;
    return { ok: true };
  }

  // Combinaison de 2 couleurs pour les motifs "rayures"/"degrade" (retour
  // utilisateur : "ajoute un peu plus de couleur pour le mode payant, et
  // mets le choix de 2 couleurs [...] mets plus de choix") : réservée à un
  // club `isPaying`, sans exception (contrairement à setJerseyPattern
  // ci-dessus, il n'y a pas d'équivalent "uni" neutre ici : une combinaison
  // de 2 couleurs n'a de sens que pour un motif payant). Jamais effacée en
  // repassant gratuit (voir setPaying) : seul le RENDU l'ignore tant que le
  // club n'est pas payant (voir effectiveJerseyTwoTone côté
  // moteurbasket3.html), même principe que jerseyPattern.
  setJerseyTwoTone(key) {
    if (!JERSEY_TWO_TONE_SETS[key]) return { ok: false, error: "Combinaison de couleurs inconnue." };
    if (!this.isPaying) {
      return { ok: false, error: "Passez en club payant pour choisir une combinaison de couleurs." };
    }
    this.jerseyTwoTone = key;
    return { ok: true };
  }

  // Couleur du maillot EXTÉRIEUR (voir Team.awayJerseyColor plus haut) :
  // même palette et même validation que setJersey ci-dessus, mais la forme
  // (jerseyShape) reste PARTAGÉE avec le maillot domicile, un club n'ayant
  // qu'une seule coupe de maillot. Couleur libre pour tous les clubs, comme
  // jerseyColor (seuls le motif et la combinaison 2 couleurs sont réservés
  // au mode payant, voir setAwayJerseyPattern/setAwayJerseyTwoTone
  // ci-dessous).
  setAwayJerseyColor(color) {
    if (!JERSEY_COLORS[color]) return { ok: false, error: "Couleur de maillot inconnue." };
    this.awayJerseyColor = color;
    return { ok: true };
  }

  // Motif du maillot EXTÉRIEUR (voir Team.awayJerseyPattern plus haut) :
  // même garde-fou "isPaying" que setJerseyPattern ci-dessus, "uni" toujours
  // autorisé. Jamais effacé en repassant gratuit, seul le rendu l'ignore
  // tant que le club n'est pas payant (voir effectiveAwayJerseyPattern côté
  // moteurbasket3.html).
  setAwayJerseyPattern(pattern) {
    if (!JERSEY_PATTERNS.includes(pattern)) return { ok: false, error: "Motif de maillot inconnu." };
    if (pattern !== JERSEY_PATTERNS[0] && !this.isPaying) {
      return { ok: false, error: "Passez en club payant pour un motif de maillot personnalisé." };
    }
    this.awayJerseyPattern = pattern;
    return { ok: true };
  }

  // Combinaison de 2 couleurs du maillot EXTÉRIEUR (voir
  // Team.awayJerseyTwoTone plus haut) : même garde-fou "isPaying" strict
  // que setJerseyTwoTone ci-dessus, pas d'équivalent "uni" neutre. Jamais
  // effacée en repassant gratuit, seul le rendu l'ignore (voir
  // effectiveAwayJerseyTwoTone côté moteurbasket3.html).
  setAwayJerseyTwoTone(key) {
    if (!JERSEY_TWO_TONE_SETS[key]) return { ok: false, error: "Combinaison de couleurs inconnue." };
    if (!this.isPaying) {
      return { ok: false, error: "Passez en club payant pour choisir une combinaison de couleurs." };
    }
    this.awayJerseyTwoTone = key;
    return { ok: true };
  }

  // Logo personnalisé (retour utilisateur : "pour les équipes qui paient,
  // elles doivent pouvoir charger leur propre image") : réservé aux clubs
  // `isPaying` (voir setPaying ci-dessous), `dataUrl` = null retire le logo
  // personnalisé (retour au logo type). Validation minimale du format
  // (image PNG/JPEG/WebP encodée en data URL) et de la taille (voir
  // MAX_TEAM_LOGO_DATA_URL_LENGTH) : le vrai redimensionnement/compression a
  // déjà eu lieu côté client avant l'envoi (voir resizeImageFileToDataUrl
  // dans moteurbasket3.html), ceci n'est qu'un garde-fou serveur.
  setCustomLogo(dataUrl) {
    if (!this.isPaying) return { ok: false, error: "Passez en club payant pour charger un logo personnalisé." };
    if (dataUrl === null) {
      this.customLogoDataUrl = null;
      return { ok: true };
    }
    if (typeof dataUrl !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl)) {
      return { ok: false, error: "Image invalide (formats acceptés : PNG, JPEG, WebP)." };
    }
    if (dataUrl.length > MAX_TEAM_LOGO_DATA_URL_LENGTH) {
      return { ok: false, error: "Image trop lourde." };
    }
    this.customLogoDataUrl = dataUrl;
    return { ok: true };
  }

  // Statut "club payant" (voir le grand commentaire sur JERSEY_COLORS plus
  // haut) : simple interrupteur manuel pour l'instant, aucun vrai système de
  // paiement derrière. Ne PAS effacer customLogoDataUrl en repassant à
  // `false` : un club qui redevient payant plus tard retrouve directement
  // son logo précédent, jamais besoin de le recharger (voir teamLogoHtml
  // côté moteurbasket3.html, qui ignore déjà customLogoDataUrl tant
  // qu'isPaying est faux, sans avoir besoin que ce champ soit vidé ici).
  setPaying(isPaying) {
    this.isPaying = !!isPaying;
    return { ok: true };
  }

  // Marque le tutoriel d'accueil comme terminé (retour utilisateur,
  // 2026-09 : "on est d'accord qu'on ne peut le faire qu'une fois ? [...]
  // le bouton dans le guide doit s'enlever") : à sens unique (jamais remis
  // à `false`), déclenché aussi bien en allant jusqu'au bout du tutoriel
  // qu'en le passant (voir tourEndTour côté moteurbasket3.html). Existe
  // désormais aussi côté serveur (server/actions.js) pour la ligue
  // partagée, où saveMyTeam() (seul point d'écriture jusqu'ici, solo
  // uniquement) ne peut pas persister ce champ : sans ce point d'entrée
  // dédié, le bouton "Lancer le tutoriel" réapparaissait à chaque
  // rechargement de page pour un manager de ligue partagée, malgré le
  // tutoriel déjà terminé.
  markOnboardingTourCompleted() {
    this.onboardingTourCompleted = true;
    return { ok: true };
  }

  // Réinitialise UNIQUEMENT le drapeau ci-dessus, jamais accessible au
  // joueur lui-même (aucune route publique, voir server/index.js :
  // /api/admin/reset-onboarding-tour, même authentification X-Admin-Token
  // que /api/admin/credit-team) : bouche-trou déjà bricolé une première
  // fois à la main pour Ariane (voir le commentaire de /api/admin/
  // credit-team) faute d'un vrai outil - onboardingTourCompleted étant à
  // sens unique par design (voir markOnboardingTourCompleted ci-dessus),
  // rien côté joueur ne permet de relancer le tutoriel une fois terminé ou
  // passé, ce qui bloque définitivement quiconque s'y retrouve coincé par
  // erreur (retour utilisateur Discord, 2026-09, "Skyzer10" : le bouton a
  // disparu après un aller-retour dans le tutoriel). Ne touche JAMAIS
  // Team.tutorialRewardsClaimed : les primes déjà réellement créditées
  // restent acquises (protection anti-double-dépense inchangée, voir
  // claimTutorialReward ci-dessous) - seul le PARCOURS peut être refait, pas
  // l'argent regagné.
  resetOnboardingTour() {
    this.onboardingTourCompleted = false;
    return { ok: true };
  }

  // Crédite la prime d'un thème du tutoriel d'accueil terminé (retour
  // utilisateur, 2026-09 : "Mets les vrais primes sur le tutoriel") : voir
  // TOUR_REWARD_BY_TOPIC plus haut pour le montant par thème et
  // Team.tutorialRewardsClaimed pour la protection anti-doublon. Idempotent
  // à dessein (`alreadyClaimed: true, amount: 0` plutôt qu'une erreur) : le
  // tutoriel côté client appelle ce point d'entrée à chaque fois qu'un
  // thème à prime est terminé, y compris si le joueur relance le tutoriel
  // après l'avoir déjà fini une première fois (ex. via les outils de
  // développement) : jamais une double dépense pour le club.
  claimTutorialReward(topic) {
    const amount = TOUR_REWARD_BY_TOPIC[topic];
    if (!amount) return { ok: false, error: "Thème de tutoriel inconnu." };
    this.tutorialRewardsClaimed = this.tutorialRewardsClaimed || [];
    if (this.tutorialRewardsClaimed.includes(topic)) {
      return { ok: true, alreadyClaimed: true, amount: 0, budget: this.budget };
    }
    this.tutorialRewardsClaimed.push(topic);
    this.recordTransaction(`Tutoriel d'accueil : ${topic}`, amount);
    return { ok: true, alreadyClaimed: false, amount, budget: this.budget };
  }

  // Vend un joueur LISTÉ (voir Player.forSale/salePrice) : liquidation
  // D'URGENCE à 1 €, réservée à la mise en vente forcée en cas de déficit
  // prolongé (voir trainWeek) — un mécanisme séparé et bien plus rapide que
  // le vrai marché des transferts aux enchères (voir League.listPlayerForSale
  // / placeBid / refreshMarket), pour un club qui n'a plus le temps d'attendre
  // 3 jours d'enchères. Encaisse le prix, retire le joueur de l'effectif et
  // réassigne la feuille de match. AUCUN plancher d'effectif (retour
  // utilisateur explicite : "on peut vendre tout son effectif si on le
  // souhaite") — un club peut se vendre entièrement, y compris jusqu'à zéro
  // joueur ; voir MatchEngine/League.simulateOrForfeit pour ce qui se passe
  // alors au prochain match (forfait 20-0, pas un crash ni un blocage).
  // Renvoie true si la vente a eu lieu.
  sellPlayer(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx === -1 || !this.players[idx].forSale) return false;
    // Alchimie d'équipe (voir chemistryRosterImportance/rosterRankOf plus
    // haut, levier 2 des 3) : rang AVANT le splice() ci-dessous, aucun
    // acheteur ici (liquidation d'urgence, pas un vrai transfert), donc
    // malus uniquement pour ce club.
    const departureImportance = chemistryRosterImportance(rosterRankOf(this.players, playerId));
    const [p] = this.players.splice(idx, 1);
    this.applyChemistryDelta(-CHEMISTRY_ROSTER_CHANGE_BASE * departureImportance);
    this.recordTransaction(`Vente de ${p.name}`, p.salePrice || 0);
    // Retour utilisateur (2026-09) : "en cas d'indisponibilité pour vente
    // d'un joueur, qui avait été mis dans la composition, il doit être
    // enlevé de la composition" — PAS une reconstruction complète façon
    // autoAssignLineup() (qui reconsidère TOUS les postes et pourrait
    // déloger d'autres choix déjà faits manuellement). Voir
    // handleStarterDeparture : promeut automatiquement le remplaçant déjà
    // désigné pour CE poste précis s'il y en a un ("si [...] au moins un
    // remplaçant [...] il ne faut pas mettre un forfait dans ce type de
    // cas" — retour utilisateur), sinon laisse le trou, détecté par
    // missingStarterPositions()/hasValidLineup() — et c'est précisément ce
    // qui doit déclencher un forfait si la feuille de match n'est pas
    // corrigée avant le coup d'envoi (voir POSITIONS_MISSING côté
    // server/liveMatch.js). Cette méthode n'est appelée que pour le club DU
    // JOUEUR (seul à avoir une interface de gestion pour "refaire la
    // compo") — jamais pour un club CPU.
    this.handleStarterDeparture(playerId);
    return true;
  }

  arenaCapacity() {
    return arenaInfo(this.arenaLevel).capacity;
  }

  nextArenaLevel() {
    return ARENA_LEVELS.find(a => a.level === this.arenaLevel + 1) || null;
  }

  // Agrandit la salle d'un palier si le budget le permet. Renvoie true si
  // l'agrandissement a eu lieu.
  upgradeArena() {
    const next = this.nextArenaLevel();
    if (!next || this.budget < next.upgradeCost) return false;
    this.recordTransaction(`Agrandissement de la salle (${next.name})`, -next.upgradeCost);
    this.arenaLevel = next.level;
    return true;
  }

  nextTrainingCenterLevel() {
    return TRAINING_CENTER_LEVELS.find(t => t.level === this.trainingCenterLevel + 1) || null;
  }

  // Agrandit le Centre de formation d'un palier si le budget le permet —
  // MÊME contrat que upgradeArena ci-dessus (un palier à la fois, vérifié
  // par le budget, coût unique prélevé immédiatement). Renvoie true si
  // l'agrandissement a eu lieu.
  upgradeTrainingCenter() {
    const next = this.nextTrainingCenterLevel();
    if (!next || this.budget < next.upgradeCost) return false;
    this.recordTransaction(`Centre de formation : ${next.name}`, -next.upgradeCost);
    this.trainingCenterLevel = next.level;
    return true;
  }

  // Multiplicateur de progression automatique des jeunes (voir
  // growYouthPlayers) — palier ACTUEL du Centre de formation.
  trainingCenterGrowthMultiplier() {
    return trainingCenterInfo(this.trainingCenterLevel).growthMultiplier;
  }

  // Capacité de la salle réservée à une catégorie de place donnée (part
  // fixe de la capacité totale — voir SEAT_CATEGORIES.shareOfCapacity).
  categoryCapacity(categoryKey) {
    return Math.round(this.arenaCapacity() * seatCategoryInfo(categoryKey).shareOfCapacity);
  }

  setTicketPrice(categoryKey, price) {
    const cat = seatCategoryInfo(categoryKey);
    if (!this.ticketPrices) this.ticketPrices = {};
    this.ticketPrices[cat.key] = clamp(Math.round(price), cat.minPrice, cat.maxPrice);
  }

  // Taux de remplissage PROJETÉ à domicile POUR UNE CATÉGORIE, au prix du
  // billet actuel de cette catégorie — l'humeur des supporters relève la
  // base de remplissage (attendanceBaseForMorale) ET assouplit le plafond de
  // confort tarifaire (moraleForgiveness : des supporters contents tolèrent
  // un prix plus élevé avant de déserter cette catégorie).
  projectedAttendanceRateFor(categoryKey) {
    const price = (this.ticketPrices || {})[categoryKey];
    const forgiveness = moraleForgiveness(this.fanMorale);
    const comfort = ticketPriceComfortFactor(price / forgiveness, categoryKey);
    return clamp(attendanceBaseForMorale(this.fanMorale) * comfort, 0.08, 0.98);
  }

  // Taux de remplissage PROJETÉ global (moyenne pondérée par la part de
  // capacité de chaque catégorie) — sert d'aperçu synthétique (tableau de
  // bord du club) avant le prochain match.
  projectedAttendanceRate() {
    return SEAT_CATEGORIES.reduce((sum, cat) => sum + this.projectedAttendanceRateFor(cat.key) * cat.shareOfCapacity, 0);
  }

  // Calcule (et enregistre) la recette de billetterie d'un match à domicile,
  // catégorie de place par catégorie de place : seule la fréquentation
  // réelle du soir (légèrement aléatoire autour de la projection) compte
  // pour la recette encaissée. Renvoie le détail par catégorie pour l'UI.
  simulateHomeAttendance(opponentName) {
    let totalAttendance = 0, totalRevenue = 0;
    const breakdown = SEAT_CATEGORIES.map(cat => {
      const rate = clamp(this.projectedAttendanceRateFor(cat.key) * rand(0.85, 1.05), 0.05, 1);
      const capacity = this.categoryCapacity(cat.key);
      const attendance = Math.round(capacity * rate);
      const revenue = attendance * (this.ticketPrices || {})[cat.key];
      totalAttendance += attendance;
      totalRevenue += revenue;
      return { key: cat.key, name: cat.name, rate, capacity, attendance, revenue };
    });
    this.recordTransaction(`Billetterie vs ${opponentName} (${totalAttendance} spect.)`, totalRevenue);
    // Historique d'affluence (voir attendanceHistory ci-dessus) : même
    // rythme que recordTransaction/recordMoraleEvent (unshift + plafond),
    // pour afficher "jusqu'à 10 matchs" sur l'onglet Salle sans redemander
    // au moteur de reconstituer cet historique à partir des transactions
    // (qui mélangent billetterie et tout le reste, et ne gardent que 40
    // entrées au total, pas 40 matchs à domicile).
    this.attendanceHistory = this.attendanceHistory || [];
    const totalCapacity = SEAT_CATEGORIES.reduce((s, cat) => s + this.categoryCapacity(cat.key), 0);
    // Détail catégorie de place par catégorie de place (retour utilisateur,
    // 2026-09, sur l'historique lui-même une fois affiché : "sur l'affluence,
    // c'est bien, mais je mettrai le détail catégorie de place par catégorie
    // place") : réutilise le `breakdown` déjà calculé ci-dessus plutôt que de
    // le recalculer, allégé aux seuls champs affichés (name/attendance/
    // capacity), `rate` et `revenue` par catégorie étant redondants avec
    // attendance/capacity et le total déjà stocké juste au-dessus.
    const categoryBreakdown = breakdown.map(b => ({ key: b.key, name: b.name, attendance: b.attendance, capacity: b.capacity }));
    this.attendanceHistory.unshift({ week: this.week, opponentName, attendance: totalAttendance, revenue: Math.round(totalRevenue), capacity: totalCapacity, breakdown: categoryBreakdown });
    if (this.attendanceHistory.length > 10) this.attendanceHistory.length = 10;
    return { attendance: totalAttendance, revenue: totalRevenue, breakdown };
  }

  nextFanShopLevel() {
    return FAN_SHOP_LEVELS.find(f => f.level === this.fanShopLevel + 1) || null;
  }

  // Achète (ou agrandit) la boutique des supporters : coût UNIQUE prélevé
  // immédiatement, puis revenu hebdomadaire fixe payé dans trainWeek() tant
  // que le club la possède.
  upgradeFanShop() {
    const next = this.nextFanShopLevel();
    if (!next || this.budget < next.cost) return false;
    this.recordTransaction(`Boutique des supporters : ${next.name}`, -next.cost);
    this.fanShopLevel = next.level;
    return true;
  }

  nextFacilityLevel(key) {
    const cfg = CLUB_FACILITIES[key];
    if (!cfg) return null;
    const cur = (this.facilityLevels && this.facilityLevels[key]) || 0;
    return cfg.levels.find(l => l.level === cur + 1) || null;
  }

  // Achète (ou améliore) une infrastructure d'UN palier — même contrat que
  // upgradeArena/upgradeFanShop/upgradeTrainingCenter ci-dessus (un palier à
  // la fois, vérifié par le budget, coût unique prélevé immédiatement).
  upgradeFacility(key) {
    const cfg = CLUB_FACILITIES[key];
    if (!cfg) return false;
    const next = this.nextFacilityLevel(key);
    if (!next || this.budget < next.cost) return false;
    this.recordTransaction(`${cfg.name} : ${next.name}`, -next.cost);
    if (!this.facilityLevels) this.facilityLevels = { tvStation: 0, gym: 0, wellness: 0 };
    this.facilityLevels[key] = next.level;
    return true;
  }

  // Multiplicateur de risque de blessure en match (voir MatchEngine.
  // applyFatigue) — palier ACTUEL de la salle de musculation, 1 = aucun
  // effet (aucune salle construite).
  facilityInjuryRiskMult() {
    const level = (this.facilityLevels && this.facilityLevels.gym) || 0;
    const info = facilityInfo("gym", level);
    return info ? info.injuryRiskMult : 1;
  }

  // Multiplicateur d'accumulation de fatigue en match (voir MatchEngine.
  // applyFatigue) — palier ACTUEL de l'espace bien-être, 1 = aucun effet
  // (aucun espace bien-être construit).
  facilityFatigueMult() {
    const level = (this.facilityLevels && this.facilityLevels.wellness) || 0;
    const info = facilityInfo("wellness", level);
    return info ? info.fatigueMult : 1;
  }

  // Dilution du rendement selon le nombre de postes couverts cette semaine.
  trainingDilution() {
    return TRAINING_DILUTION_BY_POSITION_COUNT[this.trainingPositions.length] || 0;
  }

  // Temps RÉELLEMENT joué par ce joueur, CUMULÉ sur tous les matchs du cycle
  // d'entraînement en cours (calendrier ancré quotidien : jusqu'à 3 matchs
  // par jour civil, championnat + coupe éventuelle, voir
  // Player.trainingSecondsPlayedByPosition, retour utilisateur, 2026-09 :
  // "la semaine est en fait une journée avec 3 matchs [...] un joueur doit
  // jouer 30 min au poste déterminé sur sa semaine pour prendre
  // l'entrainement"), aux poste(s) couverts par l'entraînement de la
  // semaine (this.trainingPositions). PAS son temps de jeu total, ni son
  // poste "de carte" (this.position) : un remplaçant polyvalent peut avoir
  // été aligné sur un poste différent du sien (voir Team.lineup et
  // Player.matchPosition), auquel cas c'est le temps passé À CE poste
  // précis qui doit compter pour son entraînement, où qu'il joue
  // habituellement. Renvoie { byPosition, total } (secondes).
  trainablySecondsFor(player) {
    const byPosition = {};
    let total = 0;
    (this.trainingPositions || []).forEach(pos => {
      const s = (player.trainingSecondsPlayedByPosition && player.trainingSecondsPlayedByPosition[pos]) || 0;
      if (s > 0) { byPosition[pos] = s; total += s; }
    });
    return { byPosition, total };
  }

  // Aperçu (lecture seule, ne modifie rien) de ce que vaudrait l'entraînement
  // de la semaine pour CE joueur, avec la compétence et les postes
  // actuellement sélectionnés (this.trainingSkill / this.trainingPositions).
  // Utilisé par l'écran de préparation pour afficher "concerné à X%" avant
  // validation, et par trainWeek() pour construire ses valeurs
  // "représentatives" (une seule source de vérité pour ce calcul).
  trainingPreviewFor(player) {
    const skill = this.trainingSkill;
    const program = skill ? TRAINING_PROGRAMS[skill] : null;
    const { byPosition, total } = this.trainablySecondsFor(player);
    const posSelected = Boolean(program) && total > 0;
    const attendanceFactor = attendanceFactorForSeconds(total);
    if (!posSelected) {
      return { posSelected: false, trainedSeconds: total, attendanceFactor, positionEfficiency: null, heightMultiplier: null, finalPct: 0 };
    }
    const dilution = this.trainingDilution();
    let progEffSum = 0;
    Object.entries(byPosition).forEach(([pos, secs]) => { progEffSum += positionEfficiencyForProgram(skill, pos) * secs; });
    const positionEfficiency = Math.round(progEffSum / total);
    const heightMultiplier = heightMultiplierForProgram(skill, player.height);
    const finalPct = Math.round((positionEfficiency / 100) * (1 - dilution) * heightMultiplier * attendanceFactor * 100);
    return { posSelected: true, trainedSeconds: total, attendanceFactor, positionEfficiency, heightMultiplier, finalPct };
  }

  trainerSalary() {
    return this.trainer ? trainerWeeklySalary(this.trainer.level, this.trainer.weeksEmployed, this.trainer.baseSalary) : 0;
  }

  trainerBonusMultiplier() {
    return this.trainer ? 1 + (TRAINER_TRAINING_BONUS[this.trainer.level] || 0) : 1;
  }

  // Congédie l'entraîneur actuel (s'il y en a un) puis en embauche un nouveau
  // au niveau demandé : le salaire repart de sa valeur de départ (weeksEmployed
  // = 0), c'est tout l'intérêt de "racheter" un entraîneur une fois que le
  // salaire de l'ancien est devenu trop élevé. `baseSalary` (optionnel) :
  // salaire de départ RÉEL — utilisé par League._resolveCoachListing avec la
  // mise gagnante d'une enchère (voir marché des entraîneurs plus haut dans
  // le fichier) ; par défaut (appel direct, hors enchère) le tarif fixe
  // TRAINER_BASE_SALARY[level] comme avant.
  hireTrainer(level, baseSalary) {
    if (!TRAINER_LEVELS.includes(level)) return;
    this.trainer = { level, weeksEmployed: 0, baseSalary: baseSalary != null ? baseSalary : (TRAINER_BASE_SALARY[level] || 0) };
  }

  fireTrainer() {
    this.trainer = null;
  }

  // Analyste vidéo — même forme/mêmes méthodes que l'entraîneur ci-dessus
  // (trainerSalary/hireTrainer/fireTrainer), voir le commentaire sur
  // this.videoAnalyst (constructeur) pour ce que ce rôle apporte réellement
  // (des séances vidéo, voir League.runVideoSession, PAS un effet sur
  // l'entraînement ou les matchs). `trainerWeeklySalary` est déjà
  // agnostique du rôle de staff (ne lit que level/weeksEmployed/baseOverride,
  // jamais `this.trainer` lui-même) : la réutiliser ici évite de dupliquer le
  // calcul d'escalade hebdomadaire (TRAINER_WEEKLY_GROWTH) pour ce second
  // rôle.
  videoAnalystSalary() {
    return this.videoAnalyst ? trainerWeeklySalary(this.videoAnalyst.level, this.videoAnalyst.weeksEmployed, this.videoAnalyst.baseSalary) : 0;
  }

  // Congédie l'analyste actuel (s'il y en a un) puis en embauche un nouveau
  // au niveau demandé — même contrat que Team.hireTrainer (`baseSalary`
  // optionnel : mise gagnante d'une enchère via League._resolveAnalystListing,
  // sinon repli sur le tarif fixe TRAINER_BASE_SALARY[level]). Réutilise
  // TRAINER_LEVELS (1 à 5) comme paliers de compétence de l'analyste : aucune
  // raison de lui inventer une échelle de niveaux différente de celle de
  // l'entraîneur.
  hireVideoAnalyst(level, baseSalary) {
    if (!TRAINER_LEVELS.includes(level)) return;
    this.videoAnalyst = { level, weeksEmployed: 0, baseSalary: baseSalary != null ? baseSalary : (TRAINER_BASE_SALARY[level] || 0) };
  }

  fireVideoAnalyst() {
    this.videoAnalyst = null;
  }

  // Recruteur — TROISIÈME rôle de staff, même forme/mêmes méthodes que
  // l'entraîneur/l'analyste vidéo ci-dessus (recruiterSalary/hireRecruiter/
  // fireRecruiter, réutilisant trainerWeeklySalary comme videoAnalystSalary
  // le fait déjà) — voir le commentaire sur this.recruiter (constructeur)
  // pour ce que ce rôle apporte réellement (un flux PRIVÉ de propositions de
  // jeunes prospects, voir refreshYouthCandidates plus bas, PAS un effet sur
  // l'entraînement pro ni les matchs).
  recruiterSalary() {
    return this.recruiter ? trainerWeeklySalary(this.recruiter.level, this.recruiter.weeksEmployed, this.recruiter.baseSalary) : 0;
  }

  hireRecruiter(level, baseSalary) {
    if (!TRAINER_LEVELS.includes(level)) return;
    this.recruiter = { level, weeksEmployed: 0, baseSalary: baseSalary != null ? baseSalary : (TRAINER_BASE_SALARY[level] || 0) };
  }

  fireRecruiter() {
    this.recruiter = null;
  }

  // ---------------------------------------------------------------------
  // ACADÉMIE DE JEUNES — pipeline PRIVÉ de prospects (voir le grand
  // commentaire sur this.youthCandidates au constructeur) : contrairement
  // aux marchés d'entraîneur/analyste/recruteur ci-dessus (partagés, aux
  // enchères entre TOUS les managers), rien ici ne touche `this.teams` d'une
  // League — ces méthodes vivent entièrement sur Team.
  // ---------------------------------------------------------------------

  // Fait vivre la file de propositions de CE club : expire d'abord les
  // propositions trop anciennes (YOUTH_CANDIDATE_EXPIRY_MS, même fenêtre que
  // le marché du staff), puis, si un recruteur est sous contrat et que la
  // file n'est pas déjà pleine (YOUTH_CANDIDATE_QUEUE_MAX), tire au sort une
  // nouvelle proposition selon YOUTH_CANDIDATE_DAILY_CHANCE_BY_LEVEL. `now`
  // explicite (voir Team.trainWeek, qui appelle ceci à son propre rythme
  // "une fois par tick") — jamais de Date.now() implicite ici.
  refreshYouthCandidates(now) {
    this.youthCandidates = (this.youthCandidates || []).filter(c => now < c.expiresAt);
    if (!this.recruiter) return; // aucune proposition sans recruteur sous contrat
    if (this.youthCandidates.length >= YOUTH_CANDIDATE_QUEUE_MAX) return; // file déjà pleine
    const chance = YOUTH_CANDIDATE_DAILY_CHANCE_BY_LEVEL[this.recruiter.level] || 0;
    if (Math.random() >= chance) return;
    this.youthCandidates.push(generateYouthCandidate(now, this.recruiter.level));
  }

  // Signe un candidat en attente : le déplace de youthCandidates vers
  // youthPlayers (plafonné à MAX_YOUTH_ROSTER_SIZE), fixe son salaire au
  // tarif de stagiaire FIXE (YOUTH_TRAINEE_WEEKLY_SALARY, indépendant de ses
  // attributs/potentiel) — son potentiel réel (déjà tiré à la génération du
  // candidat, voir generateYouthCandidate) reste caché derrière le MÊME
  // label grossier à 3 bandes qu'avant la signature (voir
  // youthProspectLabel) : signer ne change RIEN à ce que le manager voit du
  // potentiel, seule la PROMOTION en pro (Team.promoteYouthPlayer) l'expose
  // enfin. Renvoie { ok: true, player } ou { ok: false, reason } — reasons :
  // "not-found" (id de candidat inconnu), "youth-roster-full" (déjà
  // MAX_YOUTH_ROSTER_SIZE jeunes signés).
  signYouthCandidate(candidateId) {
    if ((this.youthPlayers || []).length >= MAX_YOUTH_ROSTER_SIZE) return { ok: false, reason: "youth-roster-full" };
    const idx = (this.youthCandidates || []).findIndex(c => c.id === candidateId);
    if (idx === -1) return { ok: false, reason: "not-found" };
    const [player] = this.youthCandidates.splice(idx, 1);
    player.salary = YOUTH_TRAINEE_WEEKLY_SALARY;
    this.youthPlayers.push(player);
    return { ok: true, player };
  }

  // Décline un candidat en attente : simplement retiré de youthCandidates,
  // aucune place d'effectif jeunes consommée (il n'en occupait aucune tant
  // qu'il n'était pas signé). Renvoie { ok: true } ou { ok: false, reason:
  // "not-found" }.
  declineYouthCandidate(candidateId) {
    const idx = (this.youthCandidates || []).findIndex(c => c.id === candidateId);
    if (idx === -1) return { ok: false, reason: "not-found" };
    this.youthCandidates.splice(idx, 1);
    return { ok: true };
  }

  // Progression AUTOMATIQUE des jeunes déjà signés — AUCUNE sélection de
  // programme/poste (délibéré, pas de micro-management pour l'effectif
  // jeunes) : chaque jeune progresse un peu sur SES 10 caractéristiques à la
  // fois, à un rythme modeste (YOUTH_BASE_TRAINING_WEIGHT) mis à l'échelle
  // par le Centre de formation (trainingCenterGrowthMultiplier). Réutilise
  // TEL QUEL Player.trainWeek — même formule de progression selon l'âge
  // (growthFactorForAge) que l'effectif pro, PUIS plafonne CHAQUE
  // caractéristique à 50 (correctif 2026-09, retour utilisateur explicite :
  // "un joueur qui sort du centre de formation [...] ne doit pas avoir une
  // carac qui dépasse 50 [...] il doit pouvoir monter naturellement vers les
  // 50 (en sachant que 50 c'est exceptionnel)") — ce plafond porte
  // UNIQUEMENT sur les caractéristiques ACTUELLES pendant cette phase
  // académie, jamais sur le potentiel réel (qui peut valoir 85+, voir
  // generateYouthCandidate, et reste totalement invisible tant que le
  // joueur n'est pas promu). Volontairement appliqué ICI (un simple
  // Math.min après coup), PAS dans Player.trainWeek lui-même : une fois
  // promu en pro, ce même joueur repasse par le trainWeek NORMAL de
  // l'effectif pro (voir Team.trainWeek), sans aucun plafond à 50 — c'est ce
  // second passage, post-promotion, qui débloque vraiment le potentiel
  // élevé d'un prodige.
  growYouthPlayers() {
    const attrWeights = {};
    ATTRS.forEach(a => attrWeights[a] = YOUTH_BASE_TRAINING_WEIGHT);
    const mult = this.trainingCenterGrowthMultiplier();
    (this.youthPlayers || []).forEach(p => {
      p.trainWeek(attrWeights, mult);
      ATTRS.forEach(a => { if (p.attrs[a] > 50) p.attrs[a] = 50; });
    });
  }

  // Décision manager sur un jeune qui vient d'avoir 18 ans (voir
  // this.pendingYouthDecisions, alimenté par trainWeek au passage d'une
  // saison) — PROMOTION : rejoint l'effectif pro (this.players, plafonné à
  // MAX_ROSTER_SIZE), salaire recalculé à sa vraie valeur de marché (voir
  // salaryForOverall(player.overall()) — il cesse d'être un "stagiaire" pour
  // devenir un joueur normal, comme n'importe qui acheté sur le marché des
  // transferts). Renvoie { ok: true, player } ou { ok: false, reason } —
  // reasons : "not-found", "roster-full" (effectif pro déjà au plafond).
  // `now` (ms, comme Date.now()) : DOIT être passé explicitement par
  // l'appelant (retour utilisateur, 2026-09 : "ajoute la date à laquelle le
  // joueur est passé pro"), jamais de Date.now() implicite ici, même
  // convention que refreshMarket(now)/refreshRecruiterMarket(now) etc.
  // ci-dessus, pour rester testable de façon déterministe.
  promoteYouthPlayer(playerId, now) {
    const idx = (this.youthPlayers || []).findIndex(p => p.id === playerId);
    if (idx === -1) return { ok: false, reason: "not-found" };
    if (this.players.length >= MAX_ROSTER_SIZE) return { ok: false, reason: "roster-full" };
    const [player] = this.youthPlayers.splice(idx, 1);
    this.pendingYouthDecisions = (this.pendingYouthDecisions || []).filter(id => id !== playerId);
    player.salary = salaryForOverall(player.overall());
    this.players.push(player);
    // Palmarès du club (voir this.academyGraduates au constructeur) : cette
    // promotion EST l'évènement qui compte pour ce compteur, incrémenté
    // uniquement ici (jamais à la signature du candidat, ni pendant la
    // croissance automatique tant qu'il n'a pas encore 18 ans).
    this.academyGraduates = (this.academyGraduates || 0) + 1;
    // Historique du centre de formation (voir this.academyGraduatesHistory
    // au constructeur) : même évènement que le compteur ci-dessus, mais
    // garde le nom/poste de CHAQUE jeune promu au lieu de se limiter à un
    // total, pour l'affichage détaillé côté client
    // (renderAcademyGraduatesStat, moteurbasket3.html). promotedAt : date
    // de cette promotion (voir le paramètre `now` ci-dessus), une entrée
    // restaurée d'une sauvegarde d'avant ce champ n'en a pas (undefined),
    // affichée sans date plutôt qu'avec une date inventée.
    (this.academyGraduatesHistory = this.academyGraduatesHistory || []).push({
      name: player.name, position: player.position, promotedAt: now,
    });
    // Rejoint le banc plutôt qu'un titulaire (même convention que l'achat
    // d'un joueur sur le marché des transferts, voir League._resolveListing)
    // pour ne jamais déloger un titulaire déjà choisi manuellement — sauf
    // pour une équipe CPU (qui n'a personne pour retoucher sa feuille
    // manuellement, voir Team.isHuman), reconstruite entièrement comme
    // ailleurs.
    if (!this.isHuman) this.autoAssignLineup();
    return { ok: true, player };
  }

  // LIBÉRATION : retiré définitivement, libère une place d'effectif jeunes.
  // Renvoie { ok: true } ou { ok: false, reason: "not-found" }.
  releaseYouthPlayer(playerId) {
    const idx = (this.youthPlayers || []).findIndex(p => p.id === playerId);
    if (idx === -1) return { ok: false, reason: "not-found" };
    this.youthPlayers.splice(idx, 1);
    this.pendingYouthDecisions = (this.pendingYouthDecisions || []).filter(id => id !== playerId);
    return { ok: true };
  }

  // Fait progresser/décliner tous les joueurs du club d'une semaine d'entraînement.
  // Renvoie un rapport détaillé par joueur pour l'UI : gains obtenus, et le
  // détail du calcul (poste concerné ou non, proportion du dernier match
  // jouée) pour expliquer pourquoi l'entraînement a plus ou moins pris.
  // `divisionLevel` (optionnel) : niveau de division ACTUEL du club, pour le
  // calcul des droits TV (voir TV_RIGHTS_WEEKLY_BY_LEVEL plus haut) —
  // transmis par l'appelant (voir League.divisionLevel côté UI), puisque le
  // Team ne connaît pas lui-même sa position dans la pyramide. Omis (ou
  // `null`/`undefined`) : aucun revenu de droits TV cette semaine-là (utile
  // pour un Team utilisé sans ligue, comme dans les tests directs du moteur).
  // Voir le grand commentaire de BENCH_FRUSTRATION_MAX_SECONDS plus haut :
  // érode Player.form pour tout non-titulaire n'ayant quasiment pas joué
  // cette semaine, plus sévèrement s'il note mieux que le titulaire
  // actuellement aligné à son poste. Appelée par trainWeek ci-dessous, mais
  // gardée comme méthode séparée pour rester testable indépendamment.
  applyBenchFrustration(now = Date.now()) {
    const starters = (this.lineup && this.lineup.starters) || {};
    const starterIds = new Set(Object.values(starters).filter(Boolean));
    this.players.forEach(p => {
      if (starterIds.has(p.id)) return; // titulaire : jamais concerné
      if (isCurrentlyInjured(p, now)) return; // ne pas jouer n'est alors pas un choix
      const secondsThisWeek = Object.values(p.trainingSecondsPlayedByPosition || {})
        .reduce((sum, s) => sum + s, 0);
      if (secondsThisWeek > BENCH_FRUSTRATION_MAX_SECONDS) return; // a quand même tourné un peu
      const ownRating = weightedRatingForPosition(p.attrs, p.position);
      const starterId = starters[p.position];
      const starter = starterId ? this.players.find(x => x.id === starterId) : null;
      const deservesToStart = !!starter && ownRating > weightedRatingForPosition(starter.attrs, p.position);
      const malus = BENCH_FRUSTRATION_BASE_MALUS * (deservesToStart ? BENCH_FRUSTRATION_DESERVING_MULT : 1);
      p.form = clamp(Math.round(p.form - malus), 1, 100);
    });
  }

  // Voir le grand commentaire de TRANSFER_REQUEST_MOTIVATION_THRESHOLD plus
  // haut : fait avancer, chaque semaine, le compteur de semaines
  // consécutives sous le seuil de motivation "proche de 0" pour chaque
  // joueur, et déclenche une demande de transfert une fois ce compteur au
  // seuil. Une motivation qui remonte au-dessus du seuil (discussion
  // réussie, bonne interview de jalon, ou tout simplement le temps de jeu
  // qui revient) remet le compteur à 0 ET referme une demande déjà active :
  // un joueur qui n'est plus malheureux n'a plus de raison de demander son
  // transfert. Appelée par trainWeek ci-dessous, mais gardée comme méthode
  // séparée pour rester testable indépendamment (même convention que
  // applyBenchFrustration juste au-dessus).
  updateTransferRequests(now = Date.now()) {
    this.players.forEach(p => {
      if (p.form <= TRANSFER_REQUEST_MOTIVATION_THRESHOLD) {
        p.weeksAtLowMotivation = (p.weeksAtLowMotivation || 0) + 1;
        if (!p.transferRequestActive && p.weeksAtLowMotivation >= TRANSFER_REQUEST_WEEKS_THRESHOLD) {
          p.transferRequestActive = true;
          p.transferRequestQuote = transferRequestQuoteFor(p.name);
          this.recordMoraleEvent(`${p.name} demande son transfert dans la presse`, 0, { transferRequestPlayerId: p.id });
        }
      } else {
        p.weeksAtLowMotivation = 0;
        if (p.transferRequestActive) {
          p.transferRequestActive = false;
          p.transferRequestQuote = null;
        }
      }
    });
  }

  // Action "discuter" du manager avec un joueur qui a demandé son transfert
  // (voir le grand commentaire de TRANSFER_REQUEST_MOTIVATION_THRESHOLD plus
  // haut) : chance de succès partant de TRANSFER_REQUEST_DISCUSS_BASE_CHANCE,
  // augmentée jusqu'à TRANSFER_REQUEST_DISCUSS_MENTAL_BONUS de plus pour un
  // Mental à 100 (un joueur mentalement fort se laisse plus facilement
  // convaincre, voir ATTRS). Un succès remotive franchement le joueur (+
  // TRANSFER_REQUEST_DISCUSS_SUCCESS_FORM_BOOST sur sa forme, ce qui
  // repasse largement le seuil et referme donc la demande) et journalise
  // l'issue positive ; un échec ne change RIEN (la demande reste active, le
  // manager peut retenter plus tard, ou vendre le joueur) — "ne marche pas à
  // chaque fois". Renvoie { ok: true, success, formBefore, formAfter } ou
  // { ok: false, reason } (joueur introuvable, ou n'ayant PAS demandé son
  // transfert), jamais d'exception, même convention que les autres méthodes
  // "action du manager" de cette classe (voir resolveInterview/sellPlayer).
  discussTransferRequest(playerId, now = Date.now()) {
    const p = this.players.find(pl => pl.id === playerId);
    if (!p) return { ok: false, reason: "not-found" };
    if (!p.transferRequestActive) return { ok: false, reason: "not-requesting" };
    const chance = TRANSFER_REQUEST_DISCUSS_BASE_CHANCE + (p.attrs.mental / 100) * TRANSFER_REQUEST_DISCUSS_MENTAL_BONUS;
    const success = Math.random() < chance;
    const formBefore = p.form;
    if (success) {
      p.form = clamp(Math.round(p.form + TRANSFER_REQUEST_DISCUSS_SUCCESS_FORM_BOOST), 1, 100);
      p.weeksAtLowMotivation = 0;
      p.transferRequestActive = false;
      p.transferRequestQuote = null;
      this.recordMoraleEvent(`Discussion réussie avec ${p.name}, la demande de transfert est retirée`, 0, { transferRequestPlayerId: p.id });
    }
    return { ok: true, success, formBefore, formAfter: p.form };
  }

  trainWeek(divisionLevel, now) {
    const skill = this.trainingSkill; // clé de TRAINING_PROGRAMS, ou null
    const program = skill ? TRAINING_PROGRAMS[skill] : null;
    const dilution = this.trainingDilution();
    const trainerMult = this.trainerBonusMultiplier();
    const report = {};

    // AVANT la remise à zéro de trainingSecondsPlayedByPosition ci-dessous
    // (dans la boucle qui suit) : applyBenchFrustration a besoin du temps de
    // jeu de CETTE semaine qui s'achève, pas de la semaine suivante.
    this.applyBenchFrustration(now);
    // APRÈS applyBenchFrustration : se base sur Player.form déjà à jour de
    // cette semaine (malus du banc inclus) pour décider qui franchit le
    // seuil de motivation "proche de 0".
    this.updateTransferRequests(now);

    this.players.forEach(p => {
      // Le focus se base sur le temps RÉELLEMENT joué aux poste(s) entraînés
      // cette semaine (voir trainablySecondsFor) — pas sur le poste "de
      // carte" du joueur (this.position) : un remplaçant polyvalent peut
      // avoir été aligné, pour ce match, sur un poste différent du sien
      // (voir Team.lineup / Player.matchPosition). Un Arrière qui a dépanné
      // au poste de Meneur pendant 20 minutes profite donc bien d'un
      // entraînement de Meneur sur ces 20 minutes-là, même si sa fiche
      // affiche "Arrière" ; à l'inverse, un Meneur "de carte" resté sur le
      // banc tout le match ne progresse pas.
      const { byPosition: trainedByPosition, total: trainedSeconds } = this.trainablySecondsFor(p);
      const preview = this.trainingPreviewFor(p);
      const posSelected = preview.posSelected;
      const effectiveFocus = posSelected ? skill : null;
      // Ce n'est plus un seuil couperet : jouer un peu compte toujours un peu.
      const attendanceFactor = preview.attendanceFactor;
      let penalty = 0;
      let positionEfficiency = null;
      let heightMultiplier = null;
      const attrWeights = {};
      // Caractéristiques dont le poids ci-dessus vient UNIQUEMENT de la
      // synergie (pas du programme choisi lui-même) — voir Player.trainWeek,
      // qui s'en sert pour brider leur marge de progression et garantir
      // qu'elles restent toujours à la traîne de la caractéristique
      // réellement entraînée (voir le commentaire juste en dessous).
      const synergyAttrs = new Set();

      if (posSelected) {
        // Aptitude de poste = moyenne des postes RÉELLEMENT joués cette
        // semaine par ce joueur, pondérée par les minutes passées à chacun
        // (le plus souvent un seul poste, mais un remplaçant polyvalent a pu
        // couvrir plusieurs des postes entraînés au fil du match).
        const posEffFor = attr => {
          let sum = 0;
          Object.entries(trainedByPosition).forEach(([pos, secs]) => { sum += positionEfficiencyForSkill(attr, pos) * secs; });
          return sum / trainedSeconds;
        };
        // Poids RÉEL de chaque caractéristique du programme pour CE joueur :
        // poids de la caractéristique dans le programme (plein pour un
        // programme pur, dilué pour un programme composite) × aptitude du
        // poste réellement joué sur CETTE caractéristique précise × dilution
        // liée au nombre de postes couverts cette semaine × gabarit ×
        // proportion du dernier match jouée à ce(s) poste(s).
        program.attrs.forEach(({ attr, weight }) => {
          const posEff = posEffFor(attr);
          const heightMult = heightMultiplierForSkill(attr, p.height);
          const finalMult = weight * (posEff / 100) * (1 - dilution) * heightMult * attendanceFactor;
          attrWeights[attr] = Math.max(finalMult, 0);
        });
        // Synergie : une caractéristique liée à une de celles entraînées
        // progresse un peu, mais toujours moins qu'une caractéristique
        // directement travaillée par le programme (et jamais si elle en fait
        // déjà partie — pas de double bonus).
        program.attrs.forEach(({ attr }) => {
          (TRAINING_SYNERGY[attr] || []).forEach(rel => {
            if (attrWeights[rel]) return;
            const derived = (attrWeights[attr] || 0) * 0.4;
            if (derived > 0) { attrWeights[rel] = derived; synergyAttrs.add(rel); }
          });
        });

        // Valeurs "représentatives" pour l'UI (moyenne pondérée sur
        // l'ensemble du programme et des postes réellement joués — plus
        // lisible qu'une seule caractéristique/un seul poste isolé) : voir
        // trainingPreviewFor, seule source de vérité pour ce calcul (aussi
        // utilisé par l'aperçu de l'écran de préparation, avant validation).
        positionEfficiency = preview.positionEfficiency;
        heightMultiplier = preview.heightMultiplier;
        penalty = 1 - preview.finalPct / 100; // peut être négatif = bonus (grand gabarit bien placé)
      }

      const gains = p.trainWeek(attrWeights, trainerMult, synergyAttrs);
      report[p.id] = {
        name: p.name, position: p.position, height: p.height, gains,
        skill, posSelected, effectiveFocus, penalty, attendanceFactor,
        positionEfficiency, heightMultiplier,
        secondsPlayed: trainedSeconds,
      };
      // Retour utilisateur, 2026-09 : "quand la maj est passée, les
      // compteurs de temps de jeu sur la page entrainement doivent être
      // remis à 0 et on doit voir les effets du dernier entrainement". Le
      // temps cumulé de ce cycle vient d'être consommé ci-dessus (via
      // trainablySecondsFor/report), donc repart à zéro pour le prochain
      // cycle. `trainedSeconds`/`report[p.id]` gardent leur propre copie
      // (déjà affectés plus haut), donc cette remise à zéro n'efface rien
      // du rapport qui vient d'être construit.
      p.trainingSecondsPlayedByPosition = {};
    });

    // Académie de jeunes : progression AUTOMATIQUE des jeunes déjà signés
    // (voir Team.growYouthPlayers/youthPlayers ci-dessus) — au MÊME tick que
    // l'entraînement de l'effectif pro ci-dessus (retour utilisateur : "un
    // jeune progresse chaque jour civil comme l'effectif pro"), mais sans
    // AUCUNE sélection de programme/poste (délibéré, pas de rapport avec
    // `skill`/`program` ci-dessus).
    this.growYouthPlayers();

    // Subvention de démarrage : voir STARTUP_SUBSIDY_AMOUNT/WEEKS plus
    // haut — un coup de pouce hebdomadaire le temps que le club génère ses
    // premières vraies recettes (billetterie, boutique) et ajuste ses prix.
    if (this.week <= STARTUP_SUBSIDY_WEEKS) {
      this.recordTransaction("Subvention de démarrage", STARTUP_SUBSIDY_AMOUNT);
    }

    // Le staff est payé chaque semaine, entraînement ou pas — son salaire
    // grimpe avec l'ancienneté (voir trainerWeeklySalary). Aucun effet sur
    // les matchs : uniquement une ligne de dépense + le bonus ci-dessus.
    let trainerSalaryPaid = 0;
    if (this.trainer) {
      trainerSalaryPaid = this.trainerSalary();
      this.recordTransaction("Salaire du staff", -trainerSalaryPaid);
      this.trainer.weeksEmployed += 1;
    }

    // Analyste vidéo : même rythme de paiement que l'entraîneur ci-dessus
    // (chaque semaine, séance vidéo utilisée ou pas cette semaine-là) — voir
    // Team.videoAnalyst/videoAnalystSalary. Ligne de dépense SÉPARÉE de
    // "Salaire du staff" (plutôt que cumulée dans la même ligne) pour que le
    // détail des transactions reste lisible sur QUEL membre du staff coûte
    // quoi.
    let videoAnalystSalaryPaid = 0;
    if (this.videoAnalyst) {
      videoAnalystSalaryPaid = this.videoAnalystSalary();
      this.recordTransaction("Salaire du staff (analyste vidéo)", -videoAnalystSalaryPaid);
      this.videoAnalyst.weeksEmployed += 1;
    }

    // Recruteur : même rythme de paiement que l'entraîneur/l'analyste vidéo
    // ci-dessus — voir Team.recruiter/recruiterSalary. Ligne de dépense
    // SÉPARÉE (même raison que videoAnalystSalaryPaid ci-dessus).
    let recruiterSalaryPaid = 0;
    if (this.recruiter) {
      recruiterSalaryPaid = this.recruiterSalary();
      this.recordTransaction("Salaire du staff (recruteur)", -recruiterSalaryPaid);
      this.recruiter.weeksEmployed += 1;
    }

    // Masse salariale des joueurs : payée CHAQUE semaine (voir
    // salaryForOverall — grille salariale), que le club entraîne ou pas,
    // comme le salaire du staff. Le salaire de chaque joueur, lui, ne
    // change pas semaine après semaine : voir plus bas, recalculé
    // seulement au passage d'une saison.
    const playerPayroll = this.players.reduce((s, p) => s + p.salary, 0);
    if (playerPayroll > 0) {
      this.recordTransaction("Salaires des joueurs", -playerPayroll);
    }

    // Masse salariale de l'académie de jeunes : tarif FIXE par stagiaire
    // (YOUTH_TRAINEE_WEEKLY_SALARY), indépendant de ses attributs/potentiel
    // — ligne SÉPARÉE de "Salaires des joueurs" ci-dessus (des stagiaires
    // non salariés au marché, jamais mélangés dans la même ligne).
    const youthPayroll = (this.youthPlayers || []).length * YOUTH_TRAINEE_WEEKLY_SALARY;
    if (youthPayroll > 0) {
      this.recordTransaction("Salaires du centre de formation", -youthPayroll);
    }

    // Boutique des supporters : revenu hebdomadaire FIXE (indépendant de la
    // fréquentation des matchs), tant que le club la possède (voir
    // upgradeFanShop — investissement unique, revenu récurrent).
    let fanShopRevenue = 0;
    if (this.fanShopLevel > 0) {
      fanShopRevenue = fanShopInfo(this.fanShopLevel).weeklyRevenue;
      this.recordTransaction(`Recettes boutique des supporters (${fanShopInfo(this.fanShopLevel).name})`, fanShopRevenue);
    }

    // Droits TV : revenu hebdomadaire FIXE selon la division actuelle (voir
    // TV_RIGHTS_WEEKLY_BY_LEVEL plus haut), que le club entraîne ou pas —
    // comme le salaire du staff et la masse salariale.
    let tvRightsRevenue = 0;
    if (divisionLevel && TV_RIGHTS_WEEKLY_BY_LEVEL[divisionLevel] != null) {
      tvRightsRevenue = TV_RIGHTS_WEEKLY_BY_LEVEL[divisionLevel];
      this.recordTransaction(`Droits TV (${divisionInfo(divisionLevel).name})`, tvRightsRevenue);
    }

    // Station TV (voir CLUB_FACILITIES) : revenu hebdomadaire FIXE
    // supplémentaire, exactement comme la boutique des supporters ci-dessus
    // — la salle de musculation et l'espace bien-être n'agissent qu'EN MATCH
    // (voir MatchEngine.applyFatigue), rien à encaisser ici pour elles.
    let tvStationRevenue = 0;
    const tvStationLevel = (this.facilityLevels && this.facilityLevels.tvStation) || 0;
    if (tvStationLevel > 0) {
      const tvStationTier = facilityInfo("tvStation", tvStationLevel);
      tvStationRevenue = tvStationTier.weeklyRevenue;
      this.recordTransaction(`Recettes station TV (${tvStationTier.name})`, tvStationRevenue);
    }

    // Humeur des supporters : dérive lente et indépendante des résultats,
    // selon le confort tarifaire MOYEN des 3 catégories de place — des prix
    // durablement trop élevés agacent les supporters semaine après semaine,
    // des prix confortables les rassérènent doucement (voir
    // ticketPriceComfortFactor / moraleForgiveness).
    const forgiveness = moraleForgiveness(this.fanMorale);
    const avgComfort = SEAT_CATEGORIES.reduce((sum, cat) =>
      sum + ticketPriceComfortFactor(this.ticketPrices[cat.key] / forgiveness, cat.key), 0) / SEAT_CATEGORIES.length;
    let moraleDrift = 0;
    if (avgComfort < 0.6) moraleDrift = -1.5;
    else if (avgComfort >= 0.95) moraleDrift = 0.5;
    if (moraleDrift !== 0) {
      this.recordMoraleEvent(moraleDrift > 0 ? "Prix des billets jugés raisonnables" : "Prix des billets jugés trop élevés", moraleDrift);
    }

    // Alerte de déficit économique + mise en vente forcée (voir
    // DEFICIT_ALERT_THRESHOLD/DEFICIT_GRACE_WEEKS plus haut) : suit le nombre
    // de semaines CONSÉCUTIVES où le budget (une fois toutes les
    // transactions de la semaine passées) reste sous le seuil, remis à zéro
    // dès qu'il repasse au-dessus. Au bout de DEFICIT_GRACE_WEEKS semaines
    // sans redressement, tout l'effectif est listé à 1 € (voir
    // Player.forSale/salePrice, Team.sellPlayer) — une seule fois, pas
    // reconduit chaque semaine tant que ça reste non résolu.
    let deficitAlert = false;
    let forcedFireSale = false;
    if (this.budget < DEFICIT_ALERT_THRESHOLD) {
      this.deficitWeeks = (this.deficitWeeks || 0) + 1;
      deficitAlert = true;
      if (this.deficitWeeks >= DEFICIT_GRACE_WEEKS && this.players.some(p => !p.forSale)) {
        this.players.forEach(p => { p.forSale = true; p.salePrice = 1; });
        forcedFireSale = true;
      }
    } else {
      this.deficitWeeks = 0;
    }

    this.week++;
    // Une année d'âge par SAISON (~10 semaines), pas par 52 semaines
    // calendaires : voir SEASON_LENGTH_WEEKS. La grille salariale est
    // recalculée à la même cadence (voir salaryForOverall) : un joueur qui a
    // progressé (ou décliné) pendant la saison écoulée voit son salaire
    // ajusté à son NOUVEAU niveau pour la saison suivante — pas chaque
    // semaine, ce qui serait illisible.
    let salaryChanges = null;
    if (this.week % SEASON_LENGTH_WEEKS === 0) {
      this.players.forEach(p => { p.age += 1; });
      salaryChanges = this.recalculateSalaries();

      // Journal de matchs (voir Player.matchLog/recordMatchStatsForTeam) :
      // remis à zéro au passage de SAISON, comme l'âge/le salaire ci-dessus
      // — les stats affichées (Ligue/pages joueur) couvrent la saison EN
      // COURS, jamais un mélange de plusieurs saisons aux numéros de
      // journée qui se chevauchent.
      this.players.forEach(p => { p.matchLog = []; });

      // Académie de jeunes : les stagiaires vieillissent au même rythme que
      // l'effectif pro (une année d'âge par saison — voir plus haut).
      (this.youthPlayers || []).forEach(p => { p.age += 1; });

      // Décisions en attente laissées SANS RÉPONSE depuis la saison
      // précédente : auto-LIBÉRATION par défaut (retour utilisateur
      // implicite : ne jamais laisser une décision ignorée bloquer
      // indéfiniment une place de l'effectif jeunes) — appliquée AVANT de
      // détecter les nouveaux 18 ans ci-dessous, pour ne jamais confondre
      // une décision fraîche (cette saison) avec une décision déjà expirée
      // (la précédente, jamais tranchée).
      (this.pendingYouthDecisions || []).forEach(id => {
        const idx = this.youthPlayers.findIndex(p => p.id === id);
        if (idx !== -1) this.youthPlayers.splice(idx, 1);
      });
      this.pendingYouthDecisions = [];

      // Nouveaux 18 ans cette saison : flag pour décision manager explicite
      // (promotion ou libération, voir promoteYouthPlayer/releaseYouthPlayer)
      // plutôt qu'une auto-promotion ou auto-libération IMMÉDIATE — le
      // manager garde jusqu'à la saison SUIVANTE pour trancher (voir
      // l'auto-libération par défaut ci-dessus).
      this.youthPlayers.forEach(p => {
        if (p.age >= 18) this.pendingYouthDecisions.push(p.id);
      });
    }

    // Académie de jeunes : fait vivre la file de propositions PRIVÉE de ce
    // club (voir refreshYouthCandidates) — au même tick que le reste de ce
    // rapport. `now` explicite, JAMAIS de Date.now() implicite ici (même
    // convention que le reste du moteur) : sans `now` (appel historique,
    // voir tous les appels existants de trainWeek() dans les tests), aucune
    // proposition n'est générée — comportement inchangé pour tout appelant
    // qui ne passe pas encore ce second paramètre.
    if (now != null) this.refreshYouthCandidates(now);

    const result = {
      players: report, trainerSalaryPaid, videoAnalystSalaryPaid, recruiterSalaryPaid,
      playerPayroll, youthPayroll, fanShopRevenue, tvRightsRevenue, tvStationRevenue, moraleDrift, salaryChanges,
      fanMorale: this.fanMorale, budget: this.budget, trainerMult,
      deficitAlert, forcedFireSale, deficitWeeks: this.deficitWeeks,
    };
    // Conservé pour un réaffichage persistant (voir this.lastTrainingReport
    // au constructeur), ÉCRASE le rapport de la semaine précédente, un
    // seul conservé à la fois ("la derniere semaine", pas un historique
    // multi-semaines).
    this.lastTrainingReport = result;
    return result;
  }

  // Réévalue le salaire de chaque joueur d'après son coefficient de niveau
  // ACTUEL (voir levelCoefficientFor/salaryForOverall) — appelé au passage
  // d'une saison (voir trainWeek) et disponible séparément pour un futur
  // marché des transferts (comparer le salaire "juste" d'un joueur avant une
  // offre). Renvoie le détail des changements pour l'UI (qui a eu une
  // augmentation/baisse et de combien).
  recalculateSalaries() {
    return this.players.map(p => {
      const before = p.salary;
      const level = levelCoefficientFor(p.attrs, p.position);
      p.effectivePosition = level.position;
      p.salary = salaryForOverall(level.coefficient);
      return { name: p.name, before, after: p.salary };
    }).filter(c => c.before !== c.after);
  }

  // Moyenne du "overall" (voir Player.overall) sur l'ensemble de l'effectif
  // — sert de jauge de niveau global pour comparer deux équipes (voir
  // Team.trainWeekCPU / League.trainCpuTeams).
  averageOverall() {
    if (!this.players.length) return 0;
    return this.players.reduce((s, p) => s + p.overall(), 0) / this.players.length;
  }

  // Progression hebdomadaire pour une équipe adverse (CPU). `overallGap`
  // (moyenne du club du joueur moins moyenne de CETTE équipe adverse — voir
  // League.trainCpuTeams) pilote un RATTRAPAGE DIRECT : au-delà d'un petit
  // écart tolérable (6 points de overall), l'équipe comble tout de suite
  // 35% de l'écart restant (attributs ET potentiel, à l'échelle, pour ne
  // pas juste retarder le mur du potentiel). Un entraînement hebdomadaire
  // "classique" (voir trainWeek) est plafonné par le potentiel FIXÉ à la
  // génération de chaque joueur adverse : beaucoup trop lent pour refermer
  // un écart déjà creusé (plusieurs saisons entières), que ce soit parce
  // qu'une partie en cours a pris du retard avant ce mécanisme, ou
  // simplement parce que le hasard de la génération a fait démarrer les
  // adversaires en dessous du club du joueur — d'où ce rattrapage direct,
  // en plus (pas à la place) d'une petite progression hebdomadaire pour
  // garder un peu de texture semaine après semaine. Ne joue JAMAIS à la
  // baisse : une équipe adverse déjà au niveau ou devant n'est jamais
  // affaiblie, seulement laissée à son rendement hebdomadaire normal.
  trainWeekCPU(overallGap = 0) {
    if (overallGap > 6) {
      const currentAvg = this.averageOverall();
      const targetAvg = currentAvg + overallGap * 0.35;
      const scale = targetAvg / Math.max(currentAvg, 1);
      this.players.forEach(p => {
        ATTRS.forEach(a => { p.attrs[a] = clamp(Math.round(p.attrs[a] * scale), 1, 99); });
        p.potential = clamp(Math.round(p.potential * scale), 1, 99);
      });
    }

    this.players.forEach(p => {
      const attrs = POSITION_STRONG_ATTRS[p.position] || [];
      const attrWeights = {};
      attrs.forEach(a => { attrWeights[a] = 0.75; });
      p.trainWeek(attrWeights, 1);
    });
  }

  // ---------------------------------------------------------------------
  // Feuille de match : qui est titulaire (1 par poste), remplaçant (0 à N
  // postes chacun — un même remplaçant peut couvrir plusieurs postes, mais
  // jamais être titulaire à plusieurs postes en même temps) et réserviste
  // (ni titulaire ni remplaçant nulle part, ne joue pas ce match).
  //   lineup.starters[poste] = id du joueur titulaire à ce poste (ou null)
  //   lineup.backupPositions[id] = [poste, poste, ...] postes couverts par
  //     ce joueur EN TANT QUE remplaçant (absent/vide = pas remplaçant)
  // ---------------------------------------------------------------------
  autoAssignLineup() {
    const starters = {};
    const backupPositions = {};
    POSITIONS.forEach(pos => {
      const atPos = this.players.filter(p => p.position === pos).sort((a, b) => b.overall() - a.overall());
      starters[pos] = atPos[0] ? atPos[0].id : null;
      atPos.slice(1).forEach(p => { backupPositions[p.id] = [pos]; });
    });
    this.lineup = { starters, backupPositions };
  }

  // Poste titulaire d'un joueur (ou null s'il n'est pas titulaire).
  starterPosition(playerId) {
    return POSITIONS.find(pos => this.lineup.starters[pos] === playerId) || null;
  }

  // Fixe le titulaire d'un poste. Si un autre joueur était déjà titulaire à
  // ce poste, il redevient réserviste (retiré de starters ET de backupPositions,
  // pour ne jamais avoir un joueur titulaire ET remplaçant en même temps).
  // Retire aussi le nouveau titulaire de tous ses postes de remplaçant.
  setStarter(pos, playerId) {
    if (playerId) {
      // Un joueur ne peut être titulaire qu'à UN SEUL poste à la fois : s'il
      // était déjà titulaire ailleurs, ce poste-là redevient vacant (à
      // réassigner) plutôt que d'avoir le même joueur titulaire à deux
      // postes en même temps.
      POSITIONS.forEach(p => { if (p !== pos && this.lineup.starters[p] === playerId) this.lineup.starters[p] = null; });
      delete this.lineup.backupPositions[playerId];
    }
    this.lineup.starters[pos] = playerId || null;
  }

  // Coche/décoche un poste de remplaçant pour un joueur. Un joueur titulaire
  // quelque part ne peut pas devenir remplaçant (il faut d'abord le retirer
  // du poste de titulaire) — no-op silencieux dans ce cas.
  toggleBackupPosition(playerId, pos, on) {
    if (this.starterPosition(playerId)) return;
    const list = this.lineup.backupPositions[playerId] || [];
    const has = list.includes(pos);
    if (on && !has) this.lineup.backupPositions[playerId] = [...list, pos];
    if (!on && has) {
      const next = list.filter(p => p !== pos);
      if (next.length) this.lineup.backupPositions[playerId] = next;
      else delete this.lineup.backupPositions[playerId];
    }
  }

  // ---------------------------------------------------------------------
  // Planification des ordres à l'avance (voir this.plannedTactics dans le
  // constructeur) : préparer une journée FUTURE sans toucher aux ordres
  // "en direct" (ceux lus au moment de résoudre la TOUTE PROCHAINE
  // journée), à la BuzzerBeater.
  // ---------------------------------------------------------------------

  // Instantané indépendant (deep clone) des ordres EN DIRECT actuels —
  // jamais de référence partagée avec offensivePriorities/lineup en cours,
  // sinon modifier les ordres du jour changerait silencieusement un plan
  // déjà sauvegardé (et vice-versa).
  snapshotTactics() {
    return {
      offensivePriorities: [...this.offensivePriorities],
      defense: this.defense,
      rhythm: this.rhythm,
      // Tactique confirmée — voir Team.constructor. Copie des valeurs EN
      // DIRECT actuelles (jamais de référence partagée, notamment pour le
      // tableau watchAssignments).
      tacticalTier: this.tacticalTier,
      screenDefense: this.screenDefense,
      helpDefense: this.helpDefense,
      watchAssignments: this.watchAssignments.map(a => ({ ...a })),
      postDefense: this.postDefense,
      closeoutStyle: this.closeoutStyle,
      offRebStyle: this.offRebStyle,
      endgameManagement: this.endgameManagement,
      lineup: {
        starters: { ...this.lineup.starters },
        backupPositions: Object.fromEntries(
          Object.entries(this.lineup.backupPositions).map(([id, positions]) => [id, [...positions]])
        ),
      },
    };
  }

  // Le plan déjà préparé pour `round`/`competition` (voir planKey), ou (à
  // défaut) un instantané des ordres en direct actuels — simple lecture, ne
  // crée PAS d'entrée dans plannedTactics (utilisé côté navigateur pour
  // préremplir l'écran "Ordres" d'une journée future pas encore préparée,
  // avec les réglages actuels comme point de départ raisonnable).
  // `competition` omis = "championship" (comportement historique).
  getPlanForRound(round, competition) {
    return this.plannedTactics[planKey(round, competition)] || this.snapshotTactics();
  }

  // Enregistre/complète le plan de `round`/`competition` : la première
  // modification pour cette journée part des ordres en direct actuels
  // (snapshotTactics), les suivantes fusionnent juste le(s) champ(s)
  // modifié(s) (patch partiel, ex. {defense: "Zone"}) par-dessus le plan
  // déjà en place.
  stagePlanForRound(round, patch, competition) {
    const key = planKey(round, competition);
    this.plannedTactics[key] = Object.assign(this.plannedTactics[key] || this.snapshotTactics(), patch);
    return this.plannedTactics[key];
  }

  // Existence pure d'un plan préparé pour `round`/`competition` (contrairement
  // à getPlanForRound, qui retombe toujours sur un instantané des ordres en
  // direct si rien n'est préparé) — utilisé côté navigateur pour
  // l'indicateur "(préparé) ●" sans avoir à connaître le format de la clé
  // composite (voir planKey) depuis l'UI.
  hasPlanForRound(round, competition) {
    return !!this.plannedTactics[planKey(round, competition)];
  }

  // Retire le plan préparé pour `round`/`competition` (ex. "revenir aux
  // ordres actuels") — sans effet sur les ordres en direct ni sur les
  // autres journées/tours.
  clearPlanForRound(round, competition) {
    delete this.plannedTactics[planKey(round, competition)];
  }

  // Point d'entrée appelé juste AVANT de simuler `round`/`competition` (voir
  // server/liveMatch.js finalizeRound/ensureLiveMatchStarted côté
  // championnat, finalizeCupRound/ensureCupLiveMatchStarted côté Coupe) : si
  // un plan a été préparé pour cette journée, il
  // devient les ordres EN DIRECT (deep clone, jamais de référence
  // partagée) puis le plan est "consommé" (supprimé de plannedTactics) —
  // une fois utilisé pour résoudre son match, il n'est plus une
  // "préparation à l'avance", il EST l'état courant, exactement comme si
  // le manager l'avait réglé directement cette semaine-là. Sans plan
  // préparé pour cette journée : no-op complet, les ordres en direct ne
  // sont pas touchés (comportement inchangé pour qui ne planifie jamais).
  applyPlannedTacticsForRound(round, competition) {
    const key = planKey(round, competition);
    const plan = this.plannedTactics[key];
    if (!plan) return;
    this.offensivePriorities = [...plan.offensivePriorities];
    this.defense = plan.defense;
    this.rhythm = plan.rhythm;
    // Tactique confirmée — voir Team.constructor. `?? <standard>` de secours
    // pour un plan préparé AVANT cette fonctionnalité (plannedTactics stocké
    // dans une sauvegarde plus ancienne) : sans ce filet, ces champs
    // resteraient `undefined` après application du plan, ce qui casserait la
    // règle "rien de fait => standard" pour un coach qui avait juste préparé
    // sa journée à l'avance avant la sortie de cette fonctionnalité.
    this.tacticalTier = plan.tacticalTier ?? "débutant";
    this.screenDefense = plan.screenDefense ?? "Aucune consigne";
    this.helpDefense = plan.helpDefense ?? "Moyenne";
    this.watchAssignments = (plan.watchAssignments ?? []).map(a => ({ ...a }));
    this.postDefense = plan.postDefense ?? "Classique";
    this.closeoutStyle = plan.closeoutStyle ?? "Contrôlé";
    this.offRebStyle = plan.offRebStyle ?? "Normal";
    this.endgameManagement = plan.endgameManagement ?? "Standard";
    this.lineup = {
      starters: { ...plan.lineup.starters },
      backupPositions: Object.fromEntries(
        Object.entries(plan.lineup.backupPositions).map(([id, positions]) => [id, [...positions]])
      ),
    };
    delete this.plannedTactics[key];
  }

  // Le remplaçant DÉJÀ désigné (via toggleBackupPosition) pour un poste
  // donné, le mieux noté d'abord si plusieurs joueurs le couvrent — utilisé
  // pour l'auto-promotion d'un remplaçant au départ d'un titulaire (voir
  // handleStarterDeparture ci-dessous), PAS pendant un match en cours (où
  // c'est backupsForSlot qui s'applique, avec ses critères de disponibilité
  // onCourt/disqualified/injured qui n'ont pas de sens hors match).
  designatedBackupForPosition(pos) {
    const candidates = this.players.filter(p => (this.lineup.backupPositions[p.id] || []).includes(pos));
    candidates.sort((a, b) => b.overall() - a.overall());
    return candidates[0] || null;
  }

  // N'IMPORTE QUEL remplaçant déjà désigné, à N'IMPORTE QUEL poste (le mieux
  // noté d'abord) — utilisé en dernier recours par handleStarterDeparture
  // quand aucun remplaçant n'est désigné PRÉCISÉMENT pour le poste vacant :
  // jouer hors de son poste de carte est déjà un mécanisme du jeu (voir
  // effectivePosition/le calcul du salaire), donc un remplaçant désigné à un
  // AUTRE poste peut quand même dépanner comme titulaire, plutôt que de
  // déclencher un forfait alors que l'effectif reste suffisant.
  anyDesignatedBackup() {
    const candidates = this.players.filter(p => (this.lineup.backupPositions[p.id] || []).length > 0);
    candidates.sort((a, b) => b.overall() - a.overall());
    return candidates[0] || null;
  }

  // Retour utilisateur (2026-09) : "si un titulaire est vendu, qu'il y a 4
  // joueurs titu et au moins un remplaçant, ça veut dire que le remplaçant
  // doit être aligné comme titu sur le poste laissé en blanc, il ne faut pas
  // mettre un forfait dans ce type de cas" — puis précision : "pour le
  // forfait, c'est uniquement si on a moins de 5 joueurs sur la feuille. si
  // on a 4 titu, mais [qu'il] manque le meneur titu par exemple, mais qu'on
  // a un pivot remplaçant [...] le pivot remplaçant est mis comme meneur
  // titulaire" — à appeler quand un joueur quitte définitivement l'effectif
  // (vente directe ou enchère conclue) : s'il était titulaire, promeut
  // AUTOMATIQUEMENT (setStarter s'occupe de retirer le remplaçant promu de
  // backupPositions au passage) :
  //   1. le remplaçant déjà désigné pour CE poste précis, s'il y en a un ;
  //   2. sinon N'IMPORTE QUEL AUTRE remplaçant déjà désigné (à un autre
  //      poste) — il vaut mieux le voir dépanner hors de son poste que
  //      déclencher un forfait alors qu'il reste du monde "sur la feuille".
  // Ce n'est que si AUCUN remplaçant n'est désigné nulle part (moins de 5
  // joueurs titulaires+remplaçants au total "sur la feuille") que le poste
  // reste vacant : c'est missingStarterPositions()/hasValidLineup() qui le
  // détecte ensuite, et qui déclenche un forfait si la feuille de match
  // n'est pas corrigée avant le coup d'envoi (voir POSITIONS_MISSING,
  // server/liveMatch.js). Volontairement PAS un rebuild complet façon
  // autoAssignLineup() (qui reconsidère TOUS les postes et pourrait déloger
  // d'autres choix déjà faits manuellement) : seul le poste du titulaire
  // parti est concerné.
  handleStarterDeparture(playerId) {
    const vacatedPos = this.starterPosition(playerId);
    if (!vacatedPos) return; // le joueur parti n'était pas titulaire : rien à faire sur la feuille de match
    const backup = this.designatedBackupForPosition(vacatedPos) || this.anyDesignatedBackup();
    if (backup) {
      this.setStarter(vacatedPos, backup.id);
    } else {
      this.lineup.starters[vacatedPos] = null;
    }
  }

  // Postes pour lesquels un poste de titulaire n'a pas (ou plus) de joueur
  // valide assigné — la feuille de match doit couvrir les 5 postes (5
  // joueurs distincts minimum) pour pouvoir jouer le match.
  missingStarterPositions() {
    const ids = this.players.map(p => p.id);
    return POSITIONS.filter(pos => {
      const id = this.lineup.starters[pos];
      return !id || !ids.includes(id);
    });
  }

  hasValidLineup() {
    return this.missingStarterPositions().length === 0;
  }

  resetForMatch(now = Date.now()) {
    // Alchimie d'équipe (voir Team.chemistryFactor plus haut) : snapshot
    // pris UNE FOIS par match, sur CHAQUE joueur (comme matchCondition côté
    // Player.resetForMatch) — c'est un multiplicateur d'ÉQUIPE, mais lu
    // individuellement par Player.eff() pendant le match.
    const chemistryFactor = this.chemistryFactor();
    // Récupération de forme physique (retour utilisateur, 2026-09, voir
    // Team.conditionRecoveryPerDay/collectiveTraining) : taux du CLUB,
    // calculé UNE FOIS ici puis transmis à chaque joueur, plutôt que
    // recalculé joueur par joueur (identique pour tout l'effectif).
    const recoveryPerDay = this.conditionRecoveryPerDay();
    this.players.forEach(p => {
      p.resetForMatch(now, recoveryPerDay);
      p.matchChemistryFactor = chemistryFactor;
    });
    POSITIONS.forEach(pos => {
      const id = this.lineup.starters[pos];
      let p = id && this.players.find(x => x.id === id);
      // Blessure PERSISTANTE encore en cours à l'entrée du match (voir
      // Player.matchInjuryLocked, posé juste au-dessus par p.resetForMatch) :
      // le titulaire désigné ne peut pas être aligné. On essaie
      // automatiquement le remplaçant désigné pour CE poste, exactement
      // comme s'il se blessait à la mise en jeu (même filet que le
      // "mustLeave" en cours de match, voir backupsForSlot ci-dessous et
      // MatchEngine.substituteIfNeeded plus bas) — jamais de forfait pour
      // cette seule raison tant qu'un remplaçant existe ; sinon (banc
      // épuisé), le poste reste vacant et l'équipe joue en infériorité,
      // comme une sortie en cours de match sans remplaçant disponible.
      if (p && p.matchInjuryLocked) {
        p = this.backupsForSlot(pos)[0] || null;
      }
      if (p) { p.onCourt = true; p.matchPosition = pos; }
    });
  }

  onCourtPlayers() {
    return this.players.filter(p => p.onCourt);
  }

  // Remplaçants disponibles pour UN poste donné (celui que le joueur sortant
  // occupait dans ce match — voir p.matchPosition), triés du plus frais au
  // plus fatigué. Un même joueur peut apparaître comme remplaçant pour
  // plusieurs postes ; une fois entré sur le terrain (onCourt=true) il n'est
  // plus disponible pour les autres postes qu'il couvre aussi. `matchInjuryLocked`
  // (voir son commentaire plus haut) exclut aussi un remplaçant encore sous
  // le coup d'une blessure persistante, pas seulement `injured` (transitoire,
  // blessé PENDANT ce match précis).
  backupsForSlot(pos) {
    return this.players.filter(p =>
      (this.lineup.backupPositions[p.id] || []).includes(pos) &&
      !p.onCourt && !p.disqualified && !p.injured && !p.matchInjuryLocked
    ).sort((a, b) => a.fatigue - b.fatigue);
  }

  offenseProfile() {
    const profs = this.offensivePriorities.map(t => OFFENSE_PROFILES[t]);
    const merged = { inside: 0, mid: 0, three: 0, tov: 0, assist: 0, tempo: 0, drawFoul: 0 };
    profs.forEach(p => {
      merged.inside += p.inside / profs.length;
      merged.mid += p.mid / profs.length;
      merged.three += p.three / profs.length;
      merged.tov += p.tov / profs.length;
      merged.assist += p.assist / profs.length;
      merged.tempo += p.tempo / profs.length;
      merged.drawFoul += (p.drawFoul || 0) / profs.length;
    });
    return merged;
  }
}

// ---------------------------------------------------------------------
// GÉNÉRATION DE JOUEURS / ÉQUIPES DE DÉMONSTRATION
// ---------------------------------------------------------------------
const FIRST_NAMES = ["Léo", "Hugo", "Nathan", "Malik", "Yanis", "Théo", "Amir", "Kevin",
  "Rayan", "Bastien", "Enzo", "Souleymane", "Diego", "Marc", "Karim", "Sacha",
  "Jordan", "Tom", "Adama", "Noé", "Elias", "Baptiste", "Milo", "Quentin"];
const LAST_NAMES = ["Dupont", "Martin", "Garcia", "Johnson", "N'Diaye", "Rossi", "Kovac",
  "Petit", "Silva", "Traoré", "Bernard", "Moreau", "Lefevre", "Diallo", "Novak",
  "Fontaine", "Girard", "Brooks", "Fournier", "Lopez", "Barros", "Chevalier"];

function heightForPosition(position) {
  const ranges = {
    "Meneur": [178, 192], "Arrière": [188, 200], "Ailier shooteur": [195, 205],
    "Ailier fort": [200, 210], "Pivot": [206, 222],
  };
  return Math.round(rand(...ranges[position]));
}

// Spécialité de chaque poste, caractéristique par caractéristique : "strong"
// (aptitude forte et attendue à ce poste), "base" (ordinaire) ou "weak"
// (pas le rôle de ce poste). SOURCE UNIQUE utilisée à la fois par la
// génération de joueurs (generateAttrsForPosition, juste en dessous — une
// caractéristique "strong" tire vers le haut de la fourchette, "weak" vers
// le bas) ET par le coefficient de niveau qui détermine le salaire (voir
// levelCoefficientFor plus bas) : les deux doivent s'accorder sur ce qui
// définit chaque poste, sinon la génération et la grille salariale
// raconteraient chacune une histoire différente du même joueur.
// "mental"/"endurance"/"freeThrow" (voir leur commentaire au-dessus de
// ATTRS) N'APPARAISSENT PAS ci-dessous, à dessein : ce sont des qualités
// générales, pas propres à un poste (un Pivot encaisse aussi bien une
// mauvaise série qu'un Meneur), donc elles retombent sur "base" pour
// TOUS les postes via le filet `profile[a] || "base"` déjà en place plus
// bas (generateAttrsForPosition/weightedRatingForPosition) plutôt que de
// dupliquer "base" dans chacune des 5 entrées ci-dessous.
const POSITION_ATTR_PROFILE = {
  "Meneur": { pass: "strong", dribble: "strong", agility: "strong", threePoint: "base",
    defOutside: "base", midRange: "base", inside: "weak", rebound: "weak", block: "weak", defInside: "weak" },
  "Arrière": { threePoint: "strong", midRange: "strong", agility: "base", dribble: "base",
    pass: "base", defOutside: "base", inside: "weak", rebound: "weak", block: "weak", defInside: "weak" },
  "Ailier shooteur": { threePoint: "strong", midRange: "base", agility: "base", defOutside: "strong",
    inside: "base", pass: "base", dribble: "base", rebound: "base", block: "weak", defInside: "weak" },
  "Ailier fort": { inside: "strong", rebound: "strong", midRange: "base", defInside: "strong",
    block: "base", defOutside: "weak", pass: "weak", dribble: "weak", agility: "base", threePoint: "weak" },
  "Pivot": { inside: "strong", rebound: "strong", block: "strong", defInside: "strong",
    midRange: "weak", threePoint: "weak", pass: "weak", dribble: "weak", agility: "weak", defOutside: "weak" },
};

function generateAttrsForPosition(position, tier) {
  const generators = {
    base: () => clamp(Math.round(rand(30, 65) * tier), 1, 99),
    strong: () => clamp(Math.round(rand(55, 92) * tier), 1, 99),
    weak: () => clamp(Math.round(rand(15, 45) * tier), 1, 99),
  };
  const profile = POSITION_ATTR_PROFILE[position] || {};
  const attrs = {};
  ATTRS.forEach(a => attrs[a] = generators[profile[a] || "base"]());
  return attrs;
}

// Poids appliqué à une caractéristique selon sa catégorie pour un poste
// donné (voir POSITION_ATTR_PROFILE) — "strong" pèse plus, "weak" pèse
// moins, mais jamais zéro (même hors de sa spécialité, un peu de qualité
// compte toujours un peu). Utilisé pour l'aptitude de poste À L'ENTRAÎNEMENT
// (positionEfficiencyForSkill et consorts, plus haut) — voir
// weightedRatingForPosition ci-dessous pour la note salariale.
const ATTR_CATEGORY_WEIGHT = { strong: 1.5, base: 1.0, weak: 0.4 };

// Moyenne PONDÉRÉE des caractéristiques d'un joueur SI on l'évalue au poste
// `position` (voir POSITION_ATTR_PROFILE/ATTR_CATEGORY_WEIGHT) — contrairement
// à Player.overall() (moyenne BRUTE, tout compte pareil), une caractéristique
// hors-spécialité (ex : le tir à 3 points d'un Pivot) pèse moins. Utilisée
// pour déterminer le poste EFFECTIF d'un joueur (voir inferPosition) — PAS
// directement pour le salaire, qui ajoute par-dessus un bonus pour les
// caractéristiques signature exceptionnelles (voir peakBonusFor/
// levelCoefficientFor) : mélanger les deux dans une même moyenne avantageait
// à tort les postes ayant PLUS de caractéristiques "fortes" (ex : Pivot, 4
// caractéristiques signature, contre 2-3 pour les autres postes) — une
// caractéristique signature de plus dilue une moyenne, même quand elle est
// elle aussi excellente, ce qui faisait mal classer la majorité des Ailiers
// forts générés (trop souvent reclassés Pivot par ce seul artefact de calcul).
function weightedRatingForPosition(attrs, position) {
  const profile = POSITION_ATTR_PROFILE[position] || {};
  let sum = 0, totalW = 0;
  ATTRS.forEach(a => {
    const w = ATTR_CATEGORY_WEIGHT[profile[a] || "base"];
    sum += attrs[a] * w;
    totalW += w;
  });
  return totalW ? sum / totalW : 0;
}

// Marge en faveur du poste DE CARTE d'un joueur avant qu'un autre poste ne
// soit retenu comme "poste effectif" (voir inferPosition) : la génération
// (voir generateAttrsForPosition) comporte assez d'aléa pour qu'un joueur
// correctement généré à son poste obtienne, par pur hasard, un score
// légèrement meilleur à un poste voisin (Ailier fort/Pivot notamment, très
// proches) — sans cette marge, la majorité des joueurs se feraient
// "corriger" vers un autre poste sans raison réelle. Reste assez petite
// pour qu'un profil VRAIMENT typé autrement (voir l'exemple donné par
// l'utilisateur : gros rebond + grosse défense intérieure → Pivot, même sur
// une fiche Ailier fort) l'emporte quand même largement.
const CARD_POSITION_BIAS = 5;

// Détermine le poste EFFECTIF d'un joueur D'APRÈS SES CARACTÉRISTIQUES (pas
// forcément son poste "de carte" `cardPosition`, si fourni — voir
// Player.position et CARD_POSITION_BIAS ci-dessus) : celui qui donne la
// meilleure moyenne pondérée (voir weightedRatingForPosition). Sans
// `cardPosition` (ex : un profil de test isolé, sans joueur réel derrière),
// la meilleure moyenne l'emporte sans marge de tolérance.
function inferPosition(attrs, cardPosition) {
  let bestPosition = null, bestScore = -Infinity;
  POSITIONS.forEach(pos => {
    let score = weightedRatingForPosition(attrs, pos);
    if (cardPosition && pos === cardPosition) score += CARD_POSITION_BIAS;
    if (score > bestScore) { bestScore = score; bestPosition = pos; }
  });
  return bestPosition;
}

// Bonus salarial pour une caractéristique SIGNATURE exceptionnelle du poste
// retenu (voir POSITION_ATTR_PROFILE) : ADDITIF, appliqué APRÈS le choix du
// poste (voir levelCoefficientFor) — jamais mélangé dans une moyenne, pour
// ne pas réintroduire le biais lié au nombre de caractéristiques fortes du
// poste (voir weightedRatingForPosition). Sinon, même une caractéristique
// signature à 90+ finit noyée dans la moyenne pondérée de tout le reste du
// profil (constaté sur le cas concret signalé par l'utilisateur : 97 en tir
// à 3 points, reste du profil ordinaire → seulement 1848 € malgré un tir de
// classe mondiale).
//
// Seuil volontairement très haut (90) : la génération normale d'un joueur
// (voir generateAttrsForPosition) plafonne une caractéristique "forte" à 92
// pour un effectif de tier 1.0, donc la quasi-totalité des joueurs générés
// fraîchement ne déclenchent JAMAIS ce bonus — seul un pic VRAIMENT
// exceptionnel (joueur entraîné au-delà de ce plafond au fil des saisons,
// ou généré dans une division/tier plus fort, où la génération peut
// dépasser 92 — voir DIVISIONS/tierMultiplier) le déclenche. Facteur élevé (6) pour qu'un
// tel pic se traduise en une vraie prime, pas un ajustement cosmétique : un
// joueur à 97 dans SA caractéristique signature — parmi les meilleurs au
// monde à CETTE compétence-là — est ainsi payé en conséquence, même si le
// reste de son profil est ordinaire (voir salaryForOverall).
//
// PLAFONNÉ (SALARY_PEAK_BONUS_MAX) : sans plafond, un joueur qui cumule PAR
// HASARD plusieurs caractéristiques fortes déjà très hautes (donc une
// moyenne pondérée déjà élevée à elle seule) ET un pic extrême verrait les
// deux effets se multiplier via la courbe exponentielle (voir
// salaryForOverall) et produire un salaire imprévisible, hors de toute
// grille cohérente — repéré en testant sur des effectifs générés réels
// (masse salariale d'un effectif entier s'envolant occasionnellement bien
// au-delà des joueurs vedettes du marché des transferts, par pur hasard de
// génération). Le plafond garantit une prime maximale prévisible et
// cohérente, atteinte dès qu'un pic est déjà nettement exceptionnel, sans
// dépendre du reste du profil.
const SALARY_PEAK_BONUS_THRESHOLD = 90;
const SALARY_PEAK_BONUS_FACTOR = 6;
const SALARY_PEAK_BONUS_MAX = 40;

function peakBonusFor(attrs, position) {
  const profile = POSITION_ATTR_PROFILE[position] || {};
  const strongAttrs = ATTRS.filter(a => profile[a] === "strong");
  if (!strongAttrs.length) return 0;
  const peak = Math.max(...strongAttrs.map(a => attrs[a]));
  return Math.min(SALARY_PEAK_BONUS_MAX, Math.max(0, peak - SALARY_PEAK_BONUS_THRESHOLD) * SALARY_PEAK_BONUS_FACTOR);
}

// `coefficient` (moyenne pondérée au poste retenu + bonus de pic — voir
// weightedRatingForPosition/peakBonusFor) sert de base au salaire (voir
// salaryForOverall et Player.salary/Team.recalculateSalaries) : un vrai
// spécialiste bien évalué à son rôle, avec une vraie caractéristique
// signature, est mieux valorisé qu'une simple moyenne brute qui le
// pénaliserait pour des lacunes hors-spécialité pourtant normales à son poste.
function levelCoefficientFor(attrs, cardPosition) {
  const position = inferPosition(attrs, cardPosition);
  const coefficient = weightedRatingForPosition(attrs, position) + peakBonusFor(attrs, position);
  return { position, coefficient };
}

// Génère un profil d'attributs "brut" dans la fourchette [lo,hi] (avant tier),
// rien de développé, tout reste à révéler par l'entraînement, mais
// désormais LÉGÈREMENT orienté vers `position` (voir POSITION_ATTR_PROFILE) :
// une caractéristique "forte" pour ce poste tire vers le haut de la
// fourchette, une "faible" vers le bas, une "de base" reste répartie sur
// toute son étendue. Correctif 2026-09 (retour utilisateur : "corrige pour
// que le poste reflète les caractéristiques dès le départ") : avant ça,
// generateRawYouthAttrs tirait les 10 caractéristiques uniformément dans
// [lo,hi] SANS AUCUN rapport avec le poste qu'on venait de lui assigner :
// un Pivot pouvait ainsi démarrer avec un profil qui n'avait jamais eu la
// moindre chance de ressembler à un Pivot (voir Player.effectivePosition/
// levelCoefficientFor, qui pouvaient alors s'écarter du poste de carte dès
// la toute première saison, sans qu'aucune caractéristique n'ait bougé).
// L'écart reste volontairement modeste (25% de la fourchette totale de
// chaque côté, jamais les vraies bornes 55-92/15-45 de generateAttrsForPosition
// utilisées pour un adulte confirmé) : un jeune n'a encore RIEN prouvé, ce
// n'est qu'un léger a priori cohérent avec son étiquette de poste, qui laisse
// toute leur place à l'entraînement et au hasard (voir CARD_POSITION_BIAS/
// inferPosition, qui garde volontairement une vraie marge d'erreur possible
// malgré ce biais : un profil VRAIMENT atypique peut toujours, plus rarement
// qu'avant, faire pencher le poste effectif d'un autre côté).
function generateRawAttrsInRange(position, lo, hi, tier) {
  const span = hi - lo;
  const generators = {
    base: () => clamp(Math.round(rand(lo, hi) * tier), 1, 99),
    strong: () => clamp(Math.round(rand(lo + span * 0.25, hi) * tier), 1, 99),
    weak: () => clamp(Math.round(rand(lo, hi - span * 0.25) * tier), 1, 99),
  };
  const profile = POSITION_ATTR_PROFILE[position] || {};
  const attrs = {};
  ATTRS.forEach(a => attrs[a] = generators[profile[a] || "base"]());
  return attrs;
}

// Un jeune joueur (prospect brut, pas encore de vraie draft/génération de
// nouveaux joueurs pour l'instant) démarre bas sur TOUTES ses caractéristiques
// (10-50, recalibré 2026-09, retour utilisateur : "sur les joueurs de
// départ, on ne devrait pas avoir plus de 50 sur une caractéristique / donc
// entre 10 et 50 sur les caracs / idem pour les joueurs draftés de 18/19
// ans"), désormais orienté vers `position` (voir generateRawAttrsInRange
// ci-dessus) : son potentiel caché, lui, peut être élevé, tout reste à
// révéler par l'entraînement.
const YOUNG_PROSPECT_MAX_AGE = 21;
function generateRawYouthAttrs(tier, position) {
  return generateRawAttrsInRange(position, 10, 50, tier);
}

function generatePlayer(position, tier) {
  const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const age = Math.round(rand(18, 33));
  const attrs = age <= YOUNG_PROSPECT_MAX_AGE
    ? generateRawYouthAttrs(tier, position)
    : generateAttrsForPosition(position, tier);
  return new Player({
    name,
    position,
    height: heightForPosition(position),
    age,
    attrs,
    aggressiveness: Math.round(rand(15, 95)),
  });
}

function generateTeam(name, tier = 1) {
  const players = [];
  POSITIONS.forEach(pos => {
    for (let i = 0; i < 3; i++) players.push(generatePlayer(pos, tier * rand(0.9, 1.1)));
  });
  return new Team({ name, players });
}

// Effectif de TOUTE NOUVELLE carrière (voir initGame) : contrairement aux
// équipes adverses générées (generateTeam, dont la force suit le niveau de
// division — voir DIVISIONS/tierMultiplier), le club du joueur démarre
// comme un vrai groupe de débutants, sans aucune caractéristique
// développée (10-50, comme generateRawYouthAttrs), QUEL QUE SOIT L'ÂGE
// affiché — un effectif "de départ" n'a encore rien prouvé, tout reste à
// construire par l'entraînement (retour utilisateur : un effectif de
// départ avec un joueur déjà à 97 dans une caractéristique n'a pas de sens,
// une telle caractéristique doit se mériter par le jeu, pas être offerte
// gratuitement à la création).
function generateRookiePlayer(position) {
  const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const age = Math.round(rand(18, 33));
  return new Player({
    name,
    position,
    height: heightForPosition(position),
    age,
    attrs: generateRawYouthAttrs(1, position),
    aggressiveness: Math.round(rand(15, 95)),
  });
}

function generateStartingRoster(name) {
  const players = [];
  POSITIONS.forEach(pos => {
    for (let i = 0; i < 3; i++) players.push(generateRookiePlayer(pos));
  });
  return new Team({ name, players });
}

// ---------------------------------------------------------------------
// Académie de jeunes — génération d'un candidat (voir Team.youthCandidates/
// refreshYouthCandidates). `recruiterLevel` (1 à 5, voir TRAINER_LEVELS,
// réutilisé) pilote à la fois la qualité moyenne (YOUTH_QUALITY_TIER_BY_LEVEL)
// et la chance d'un "outil brut" (YOUTH_STANDOUT_CHANCE_BY_LEVEL) — voir ces
// deux constantes plus haut pour le détail du calibrage.
// ---------------------------------------------------------------------
function generateYouthCandidate(now, recruiterLevel) {
  const position = pick(POSITIONS);
  const age = pick([15, 16, 17]);
  const tier = YOUTH_QUALITY_TIER_BY_LEVEL[recruiterLevel] || 1;
  // Attributs ACTUELS, chacun 10-30 (avant tier), VOLONTAIREMENT visibles
  // tels quels dans l'UI dès la proposition (contraste délibéré avec le
  // scoutisme adverse, où c'est l'inverse : les attributs sont cachés, pas le
  // potentiel) : voir le commentaire sur Team.youthCandidates au constructeur.
  // Légèrement orienté vers `position` depuis 2026-09 (même correctif que
  // generateRawYouthAttrs, voir generateRawAttrsInRange) : avant ça, le poste
  // tiré au sort (pick(POSITIONS) ci-dessus) n'avait aucun rapport avec les
  // attributs générés.
  const attrs = generateRawAttrsInRange(position, 10, 30, tier);
  // "Outil brut" : 1 ou 2 attributs (jamais plus) reçoivent un tirage plus
  // haut (31-40 avant tier) pour représenter un talent déjà repéré par le
  // recruteur — voir YOUTH_STANDOUT_CHANCE_BY_LEVEL.
  const standoutChance = YOUTH_STANDOUT_CHANCE_BY_LEVEL[recruiterLevel] || 0.2;
  if (Math.random() < standoutChance) {
    const count = Math.random() < 0.5 ? 1 : 2;
    shuffleIndices(ATTRS).slice(0, count).forEach(a => {
      attrs[a] = clamp(Math.round(rand(31, 40) * tier), 1, 99);
    });
  }
  const candidate = new Player({
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    position,
    height: heightForPosition(position),
    age,
    attrs,
    aggressiveness: Math.round(rand(15, 95)),
  });
  // AUCUN plafond spécifique sur le potentiel d'un prospect de l'académie
  // (correctif 2026-09, retour utilisateur explicite : "un joueur du centre
  // de formation doit pouvoir avoir un potentiel jusqu'à 99 [...] doit
  // pouvoir devenir une superstar") — le constructeur Player vient déjà de
  // tirer le potentiel EXACTEMENT comme pour n'importe quel joueur
  // (potentialHeadroom(age) + overall() + clamp(1,99), qui vaut [20,50]
  // d'ÉCART ajouté à l'overall pour cet âge — PAS un plafond de 50 sur le
  // potentiel lui-même). Le "50" dont parle l'utilisateur ne concerne QUE
  // les CARACTÉRISTIQUES pendant la phase académie (voir le plafond
  // caractéristique par caractéristique dans Team.growYouthPlayers plus
  // bas) — jamais le potentiel, qui reste cette valeur brute 1-99 tirée
  // ici, cachée derrière youthProspectLabel (3 bandes grossières) tant que
  // le joueur n'est pas promu en pro.
  candidate.createdAt = now;
  candidate.expiresAt = now + YOUTH_CANDIDATE_EXPIRY_MS;
  return candidate;
}

// ---------------------------------------------------------------------
// CALENDRIER DE SAISON — championnat à 10 équipes (aller-retour) + play-offs
// ---------------------------------------------------------------------
// 9 adversaires générés + le club du joueur ("Lyon") = 10 équipes. Un
// championnat complet aller-retour : chaque équipe affronte les 9 autres
// deux fois (une à domicile, une à l'extérieur) = 18 journées. Avec 2
// journées jouées par semaine d'entraînement, ça fait 9 semaines de
// championnat, puis les play-offs (4 premiers, demies + finale en 2 matchs
// gagnants) pour une saison d'environ 10 semaines au total (voir
// SEASON_LENGTH_WEEKS).
const CPU_TEAM_NAMES = ["Paris", "Marseille", "Toulouse", "Nice", "Nantes", "Strasbourg", "Bordeaux", "Lille", "Rennes"];

// ---------------------------------------------------------------------
// PYRAMIDE DE DIVISIONS — à la BuzzerBeater : 6 niveaux, le nombre de
// championnats étant multiplié par 3 à chaque niveau qu'on descend (1
// championnat en Division I, 3 en Division II, 9 en III, 27 en IV, 81 en V,
// 243 en VI). Le club du joueur ne joue jamais que dans UN SEUL championnat
// à la fois (toujours 10 équipes, comme avant) : le niveau de division ne
// sert qu'à calibrer la force des 9 adversaires générés (tierMultiplier) et
// le nom affiché — les centaines d'autres championnats de la pyramide ne
// sont pas simulés, seul le parcours du joueur l'est.
const DIVISIONS = [
  { level: 1, name: "Division I", leagueCount: 1, tierMultiplier: 1.45 },
  { level: 2, name: "Division II", leagueCount: 3, tierMultiplier: 1.27 },
  { level: 3, name: "Division III", leagueCount: 9, tierMultiplier: 1.09 },
  { level: 4, name: "Division IV", leagueCount: 27, tierMultiplier: 0.91 },
  { level: 5, name: "Division V", leagueCount: 81, tierMultiplier: 0.73 },
  { level: 6, name: "Division VI", leagueCount: 243, tierMultiplier: 0.55 },
];
const MAX_DIVISION_LEVEL = DIVISIONS.length; // 6 = division la plus basse de la pyramide
function divisionInfo(level) {
  return DIVISIONS.find(d => d.level === level) || DIVISIONS[DIVISIONS.length - 1];
}

// "Renommée" du club (retour utilisateur, 2026-09 : "on pourrait ajouter les
// petites infos comme [...] renommée [...] du club") : DÉLIBÉRÉMENT non
// persistée (contrairement à foundedYear/trophies) : recalculée à chaque
// affichage à partir de trois ingrédients déjà connus (niveau de division
// actuel, nombre de trophées, ancienneté du club), plutôt que d'inventer un
// quatrième champ sauvegardé à faire évoluer/dériver dans le temps (aucune
// mécanique de jeu ne dépend encore de la renommée elle-même, seulement son
// AFFICHAGE façon "étoiles", voir le visuel Football Manager de référence).
// 1 à 5 étoiles : +1 base, jusqu'à +3 pour les trophées (1 étoile tous les 2
// trophées), jusqu'à +2 pour l'ancienneté (1 étoile tous les 25 ans), et un
// bonus qui grandit à mesure que le niveau de division baisse (Division I la
// plus prestigieuse). Purement cosmétique, ne modifie jamais rien côté
// simulation.
function computeClubReputationStars(team, divisionLevel, now = Date.now()) {
  const trophyCount = (team.trophies || []).length;
  const clubAgeYears = new Date(now).getFullYear() - (team.foundedYear || new Date(now).getFullYear());
  const divisionBonus = (MAX_DIVISION_LEVEL - (divisionLevel || MAX_DIVISION_LEVEL)) / (MAX_DIVISION_LEVEL - 1);
  const score = 1
    + Math.min(3, Math.floor(trophyCount / 2))
    + Math.min(2, Math.floor(Math.max(0, clubAgeYears) / 25))
    + divisionBonus * 2;
  return clamp(Math.round(score), 1, 5);
}

// Calendrier aller-retour par la "méthode du cercle" : une équipe reste
// fixe, les (n-1) autres tournent autour d'elle à chaque journée. n doit
// être pair (10 ici, donc jamais de journée de repos à gérer). Renvoie un
// tableau de journées, chacune un tableau de {home, away} (index dans le
// tableau d'équipes passé à League). Les (n-1) premières journées sont
// l'aller, les (n-1) suivantes le retour (mêmes duels, domicile/extérieur
// inversés).
function generateRoundRobinSchedule(n) {
  const idx = Array.from({ length: n }, (_, i) => i);
  const fixed = idx[0];
  let rotating = idx.slice(1);
  const firstLeg = [];
  for (let r = 0; r < n - 1; r++) {
    const ring = [fixed, ...rotating];
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const home = ring[i], away = ring[n - 1 - i];
      // Alterne qui reçoit à chaque journée pour ne pas toujours donner
      // l'avantage du terrain aux mêmes équipes sur l'aller.
      round.push(r % 2 === 0 ? { home, away } : { home: away, away: home });
    }
    firstLeg.push(round);
    rotating.unshift(rotating.pop());
  }
  const secondLeg = firstLeg.map(round => round.map(m => ({ home: m.away, away: m.home })));
  return [...firstLeg, ...secondLeg];
}

// ---------------------------------------------------------------------
// COUPE (retour utilisateur, 2026-09 — "la vraie saison de test" : "3 matchs
// par jour : Championnat 10h, Coupe 15h, Championnat 19h" + "une vraie
// compétition de Coupe" pour remplacer l'onglet "Coupe" jusqu'ici un simple
// placeholder côté navigateur) : élimination directe, TOUTES les équipes de
// la ligue multi-manager (humaines ET CPU, indiscernables dans le tirage —
// exactement comme un duel de championnat, voir Team.isHuman). Réservé à
// generateMultiManagerLeague (voir plus bas) — jamais pour generateLeague
// (carrière solo), qui n'a pas de calendrier ancré quotidien (voir
// League.calendarDailyAnchored) donc pas de créneau de 15h où faire vivre
// une coupe.
//
// Taille du tableau : la puissance de 2 immédiatement au-dessus du nombre
// d'équipes (16 pour 10 équipes) — 16-10 = 6 équipes tirées au sort reçoivent
// un "bye" (qualification directe, aucun match) pour le 1er tour, les 4
// restantes jouent 2 vrais matchs. Le tirage au sort (byes ET
// appariements, à CHAQUE tour) est purement aléatoire : aucune notion de
// tête de série n'a de sens avant le début de saison (pas encore de
// classement, voir le retour utilisateur explicite) — non déterministe par
// nature (voir shuffleIndices), les tests figent Math.random comme ailleurs
// dans ce projet (voir coach_market_test.js/transfer_market_test.js).
//
// 4 tours, nommés comme un VRAI tableau à 16 (même si le 1er n'est que
// partiel, 2 matchs sur 8 "places") : huitièmes (huitiemes) -> quarts
// (quarts) -> demies (demies) -> finale (finale). Le tour suivant n'est
// engendré qu'une fois le précédent ENTIÈREMENT résolu (voir
// League.advanceCup), jamais à l'avance — c'est ce qui fait "avancer" la
// coupe d'un jour à chaque tour joué (voir server/autoSim.js), et permet de
// savoir à tout instant qu'"aucun tour n'est dû" (league.cup.champion déjà
// connu, ou pendingCupRound() ci-dessous qui renvoie null) : le créneau de
// 15h reste alors simplement VIDE ce jour-là (voir server/liveMatch.js).
const CUP_BRACKET_SIZE = 16;
const CUP_STAGE_NAMES = ["huitiemes", "quarts", "demies", "finale"];
function cupNextStageName(name) {
  return CUP_STAGE_NAMES[CUP_STAGE_NAMES.indexOf(name) + 1] || null;
}

// Mélange de Fisher-Yates (copie — ne modifie jamais `arr` en place) : même
// esprit que `pick` ci-dessus (Math.random direct, jamais de générateur
// seedé), pour rester testable en figeant Math.random comme le reste du
// projet.
function shuffleIndices(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 1er tour (huitièmes, partiel) — voir le grand commentaire ci-dessus pour
// le détail du tirage. `teamIdxs` : tous les index d'équipes de la ligue
// (0..9 pour 10 équipes) dans LEUR ordre naturel (this.teams) — le tirage au
// sort se fait ICI, pas en amont. Chaque bye est représenté par un "match"
// avec `away: null` (déjà `resolved`/`winner` posés, aucune diffusion ni
// simulation nécessaire — voir server/liveMatch.js) plutôt que par une
// entrée séparée, pour que `round.matches` reste la liste UNIQUE de toutes
// les places du tour (byes comprises) que l'UI (voir moteurbasket3.html)
// parcourt pour afficher le tableau complet, "Exempt" compris.
function generateCupBracket(teamIdxs) {
  const shuffled = shuffleIndices(teamIdxs);
  const byeCount = CUP_BRACKET_SIZE - teamIdxs.length;
  const byeTeams = shuffled.slice(0, byeCount);
  const playInTeams = shuffled.slice(byeCount);
  const matches = [];
  byeTeams.forEach(t => {
    matches.push({ home: t, away: null, scoreHome: null, scoreAway: null, forfeit: null, winner: t, resolved: true, bye: true });
  });
  for (let i = 0; i < playInTeams.length; i += 2) {
    matches.push({
      home: playInTeams[i], away: playInTeams[i + 1],
      scoreHome: null, scoreAway: null, forfeit: null, winner: null, resolved: false, bye: false,
    });
  }
  return { index: 0, name: CUP_STAGE_NAMES[0], dayIndex: 0, matches, resolved: false };
}

// Tour suivant : apparie aléatoirement les vainqueurs de `prevRound` (jamais
// de choix du joueur — retour utilisateur explicite, "no player choice
// involved in matchups") — toujours une puissance de 2 (8, 4, 2), donc
// jamais de bye à ce stade (uniquement au 1er tour, voir generateCupBracket).
// `dayIndex` = celui de `prevRound` + 1 : la coupe avance d'exactement un
// jour civil par tour joué (voir dailyAnchoredScheduledTimeForCupRound côté
// server/calendar.js).
function buildNextCupRound(prevRound, winners) {
  const shuffled = shuffleIndices(winners);
  const matches = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    matches.push({
      home: shuffled[i], away: shuffled[i + 1],
      scoreHome: null, scoreAway: null, forfeit: null, winner: null, resolved: false, bye: false,
    });
  }
  return { index: prevRound.index + 1, name: cupNextStageName(prevRound.name), dayIndex: prevRound.dayIndex + 1, matches, resolved: false };
}

// Simule un match, ou déclare forfait si l'une des deux équipes (ou les
// deux) ne peut plus aligner les 5 postes de sa feuille de match — retour
// utilisateur explicite : "si on n'a plus suffisamment de joueurs sur la
// feuille de match, c'est forfait 20 à 0", en complément direct de la
// suppression du plancher de vente (voir Team.sellPlayer/
// League.listPlayerForSale) : un club qui a vendu trop de joueurs doit
// perdre son match, pas bloquer la suite de la saison. S'appuie sur
// Team.hasValidLineup (déjà maintenu à jour par Team.autoAssignLineup après
// chaque vente/achat — voir sellPlayer/_resolveListing) : AUCUNE
// vérification supplémentaire de taille d'effectif ici, uniquement "les 5
// postes ont-ils un titulaire valide ?". Si les DEUX équipes sont en défaut
// à la fois (cas limite), forfait mutuel 0-0 : aucune des deux ne peut
// matériellement disputer le match. Renvoie { scoreHome, scoreAway, forfeit }
// où `forfeit` vaut "home" | "away" | "both" | null (null = match normal,
// vraiment simulé par MatchEngine).
// Enregistre les stats de CE match dans le journal de chaque joueur ayant
// réellement joué (secondsPlayed > 0) — alimente les stats de saison / MVP
// de la dernière journée (onglet Ligue) et les pages joueur ("match par
// match + une moyenne", onglet Effectif). Un SEUL point d'écriture pour
// TOUT match réellement simulé (championnat OU coupe, diffusé en direct OU
// résolu directement par simulateOrForfeit) : voir server/liveMatch.js —
// finalizeRound/finalizeCupRound l'appellent juste après avoir déterminé
// scoreHome/scoreAway/forfeit, pour les DEUX équipes, et JAMAIS pour un
// forfait (qui n'a jamais appelé MatchEngine.simulate(), donc p.stats/
// p.secondsPlayed restent ceux — périmés — du match précédent de ce joueur).
function recordMatchStatsForTeam(team, round, competition, now = Date.now()) {
  // Alchimie d'équipe (voir Team.checkTacticsChemistry, levier 3 des 3) :
  // une seule fois par match RÉELLEMENT joué (pas par joueur), compare la
  // tactique de ce match à celle du précédent.
  if (team.checkTacticsChemistry) team.checkTacticsChemistry(now);
  team.players.forEach(p => {
    if (p.secondsPlayed > 0) {
      // Forme physique (voir CONDITION_STATES/conditionLossForMinutes plus
      // haut) : perte selon les minutes RÉELLEMENT jouées ce match,
      // appliquée sur matchCondition (déjà rattrapé des jours de repos par
      // resetForMatch), jamais sur l'ancien Player.condition stocké
      // directement, pour ne jamais compter deux fois la récupération.
      // `matchCondition ?? currentCondition(...)` en filet de sécurité si
      // cette fonction est appelée sans resetForMatch préalable (voir les
      // tests qui l'appellent directement sur un joueur déjà mis en jeu à
      // la main). `conditionUpdatedAt` posé à `now` : la prochaine
      // récupération (voir currentCondition) repartira de CE match.
      const baseCondition = p.matchCondition ?? currentCondition(p, now, team.conditionRecoveryPerDay());
      p.condition = clamp(Math.round(baseCondition - conditionLossForMinutes(p.secondsPlayed / 60)), 0, 100);
      p.conditionUpdatedAt = now;
      // Bonus temporaire de MVP consommé (voir Player.pendingMatchBoost/eff()
      // /MVP_ATTR_BONUS/awardMatchMvp) : ce joueur vient justement de
      // disputer un match (p.stats/p.secondsPlayed au-dessus en témoignent),
      // donc un bonus en attente a déjà fait effet PENDANT MatchEngine.
      // simulate() (eff() le lit en direct) — on l'efface maintenant pour
      // qu'il ne s'applique pas une deuxième fois au match suivant. Un seul
      // match "boosté" par élection au MVP, jamais plus.
      if (p.pendingMatchBoost) p.pendingMatchBoost = 0;
      if (!Array.isArray(p.matchLog)) p.matchLog = [];
      p.matchLog.push({
        // `week` = team.week AU MOMENT de ce match (avant tout trainWeek()
        // suivant qui l'incrémenterait) — même sémantique que
        // Team.recordTransaction/recordMoraleEvent (voir leur `week: this.week`
        // plus haut), pour pouvoir regrouper les matchs par semaine
        // d'entraînement (onglet 📈 Stats hebdo) sans dépendre des formules du
        // calendrier (classique/accéléré/ancré quotidien) : `team.week` est
        // déjà correct dans TOUS les modes, contrairement à un round/2.
        round, competition, week: team.week,
        min: Math.max(1, Math.round(p.secondsPlayed / 60)),
        pts: p.stats.pts || 0, reb: p.stats.reb || 0, oreb: p.stats.oreb || 0, dreb: p.stats.dreb || 0,
        ast: p.stats.ast || 0, stl: p.stats.stl || 0, blk: p.stats.blk || 0, tov: p.stats.tov || 0, pf: p.stats.pf || 0,
        fgm2: p.stats.fgm2 || 0, fga2: p.stats.fga2 || 0, fgm3: p.stats.fgm3 || 0, fga3: p.stats.fga3 || 0,
        ftm: p.stats.ftm || 0, fta: p.stats.fta || 0,
        // Voir emptyStats() : sous-ensemble de fga2/fgm2, uniquement les tirs
        // en zone "inside". `|| 0` de rigueur pour tout matchLog déjà persisté
        // avant cette fonctionnalité (jamais lu par du code plus ancien).
        paintAtt: p.stats.paintAtt || 0, paintMade: p.stats.paintMade || 0,
        // +/- (voir MatchEngine.applyPlusMinusForPoints/emptyStats plus haut) :
        // figé ici pour survivre à la remise à zéro de p.stats au prochain
        // match (resetForMatch), tout comme le reste de cette entrée.
        plusMinus: p.stats.plusMinus || 0,
      });
    }
  });
}

// MVP automatique du match (retour utilisateur, 2026-09, voir le grand
// commentaire de MVP_ATTR_BONUS/MVP_QUOTES plus haut) : meilleure évaluation
// PIR (statEvaluation) toutes équipes confondues, parmi les joueurs ayant
// réellement joué CE match (secondsPlayed > 0, exactement le même filtre que
// recordMatchStatsForTeam ci-dessus, qui DOIT avoir déjà été appelée pour
// `home` ET `away` avant cet appel — sinon `matchLog` n'a pas encore la
// nouvelle entrée à marquer). Fige la citation sur l'entrée matchLog du
// joueur élu (isMvp/mvpQuote, lue par boxscoreRowsFromMatchLog côté client
// pour le box score d'un match déjà joué) et pose Team.lastMatchMvp pour LES
// DEUX équipes (le MVP peut appartenir à l'une ou l'autre, voir son
// commentaire au constructeur), affiché sur le tableau de bord. Accorde
// aussi le bonus temporaire (voir Player.pendingMatchBoost/MVP_ATTR_BONUS).
// Ne fait rien (renvoie `null`) si aucun joueur n'a joué des deux côtés (cas
// théorique d'un double forfait, qui n'appelle jamais cette fonction en
// pratique — voir finalizeRound/finalizeCupRound, `if (!forfeit)`).
function awardMatchMvp(home, away, round, competition, now = Date.now()) {
  const rows = [];
  [home, away].forEach(team => {
    team.players.forEach(p => {
      if (p.secondsPlayed > 0) rows.push({ team, player: p, evalScore: statEvaluation(p.stats) });
    });
  });
  if (!rows.length) return null;
  let best = rows[0];
  rows.forEach(r => { if (r.evalScore > best.evalScore) best = r; });
  const { team: mvpTeam, player: p, evalScore } = best;
  const quote = pick(MVP_QUOTES);
  const lastEntry = Array.isArray(p.matchLog) ? p.matchLog[p.matchLog.length - 1] : null;
  if (lastEntry && lastEntry.round === round && lastEntry.competition === competition) {
    lastEntry.isMvp = true;
    lastEntry.mvpQuote = quote;
  }
  p.pendingMatchBoost = MVP_ATTR_BONUS;
  const mvpInfo = {
    playerName: p.name, teamName: mvpTeam.name, quote,
    evalScore: Math.round(evalScore * 10) / 10, round, competition, at: now,
  };
  home.lastMatchMvp = mvpInfo;
  away.lastMatchMvp = mvpInfo;
  return mvpInfo;
}

// Combine recordMatchStatsForTeam (les DEUX équipes) et awardMatchMvp en un
// seul point d'appel (retour utilisateur, voir le commentaire d'awardMatchMvp
// ci-dessus pour pourquoi l'ordre importe) : remplace les deux appels
// séparés à recordMatchStatsForTeam qu'utilisaient jusqu'ici finalizeRound/
// finalizeCupRound (server/liveMatch.js), pour qu'aucun futur appelant ne
// puisse oublier d'accorder le MVP après avoir enregistré les stats.
function recordMatchStatsAndAwardMvp(home, away, round, competition, now = Date.now()) {
  recordMatchStatsForTeam(home, round, competition, now);
  recordMatchStatsForTeam(away, round, competition, now);
  return awardMatchMvp(home, away, round, competition, now);
}

function simulateOrForfeit(teamHome, teamAway, now = Date.now()) {
  const homeOk = teamHome.hasValidLineup();
  const awayOk = teamAway.hasValidLineup();
  if (homeOk && awayOk) {
    const result = new MatchEngine(teamHome, teamAway).simulate(now);
    return { scoreHome: result.finalScore.A, scoreAway: result.finalScore.B, forfeit: null };
  }
  if (!homeOk && !awayOk) return { scoreHome: 0, scoreAway: 0, forfeit: "both" };
  if (!homeOk) return { scoreHome: 0, scoreAway: FORFEIT_SCORE, forfeit: "home" };
  return { scoreHome: FORFEIT_SCORE, scoreAway: 0, forfeit: "away" };
}

// Championnat + phase finale. `teams[0]` est TOUJOURS le club du joueur (les
// autres sont les adversaires générés). Ne simule JAMAIS le match du joueur
// lui-même (voir simulateCpuMatchesForRound) : celui-là passe par l'écran de
// préparation/match classique comme avant, et son résultat est enregistré à
// part via recordResult.
class League {
  constructor(teams) {
    this.teams = teams;
    this.schedule = generateRoundRobinSchedule(teams.length);
    this.round = 0; // prochaine journée à jouer (0-indexée)
    this.results = []; // { round, home, away, scoreHome, scoreAway }
    this.playoffs = null; // rempli une fois la saison régulière terminée

    // Marché des transferts (voir listPlayerForSale/placeBid/refreshMarket
    // plus bas) : enchères en cours pour cette ligue. Volontairement remis à
    // zéro à chaque régénération de ligue (nouvelle saison — voir
    // generateLeague) : les 9 adversaires sont intégralement régénérés
    // chaque saison, donc une enchère non conclue à cheval sur un changement
    // de saison référencerait des équipes qui n'existent plus — cas limite
    // assez rare (il faudrait ne pas se reconnecter pendant 3 jours PILE au
    // moment d'un changement de saison) pour ne pas valoir la peine de la
    // reporter.
    this.transferListings = [];
    this.lastCpuListingCheckAt = null;

    // Marché des entraîneurs (voir generateCoachCandidate/placeCoachBid/
    // refreshCoachMarket plus bas) : même remise à zéro à chaque
    // régénération de ligue que transferListings ci-dessus, pour la même
    // raison (les candidats d'une saison n'ont plus de sens une fois les
    // adversaires régénérés).
    this.coachListings = [];
    this.lastCoachGenerationCheckAt = 0;

    // Marché des analystes vidéo (voir Team.videoAnalyst/
    // League.generateAnalystCandidate/placeAnalystBid/_resolveAnalystListing/
    // refreshAnalystMarket/fireTeamVideoAnalyst/runVideoSession plus bas) :
    // même remise à zéro à chaque régénération de ligue que coachListings
    // ci-dessus, pour la même raison (les candidats d'une saison n'ont plus
    // de sens une fois les adversaires régénérés).
    this.analystListings = [];
    this.lastAnalystGenerationCheckAt = 0;

    // Marché des recruteurs (voir Team.recruiter/League.generateRecruiterCandidate/
    // placeRecruiterBid/_resolveRecruiterListing/refreshRecruiterMarket/
    // fireTeamRecruiter plus bas) : TROISIÈME marché de staff, même remise à
    // zéro à chaque régénération de ligue que coachListings/analystListings
    // ci-dessus, pour la même raison.
    this.recruiterListings = [];
    this.lastRecruiterGenerationCheckAt = 0;

    // Calendrier RÉEL (retour utilisateur, 2026-09 : "le jeu va être online,
    // donc il faudra mettre un calendrier réel / dans une vraie semaine, 2
    // matchs de championnat + 1 de coupe") : `calendarStartAt` est l'instant
    // réel (epoch ms) où la saison a commencé — laissé à `null` tant que
    // rien ne le renseigne explicitement (généré par generateLeague), pour
    // rester rétro-compatible avec le mode "à la demande" actuel (aucun
    // calendrier réel, tout se joue au clic — voir server/README.md pour le
    // détail du calendrier réel côté serveur). `lastAutoTrainedWeek` évite
    // de faire tourner deux fois l'entraînement hebdomadaire (Team.trainWeek
    // fait bien plus que juste progresser des caractéristiques — finances,
    // moral, vieillissement...) pour une même semaine réelle déjà traitée.
    this.calendarStartAt = null;
    this.lastAutoTrainedWeek = -1;

    // Rythme du calendrier retenu pour CETTE ligue (retour utilisateur,
    // 2026-09 : pouvoir tester une saison entière en quelques jours plutôt
    // qu'en ~9 semaines réelles, avant d'ouvrir le jeu à plusieurs managers
    // — "on repartira sur un calendrier classique quand le jeu sera
    // opérationnel [...] on restera sur ce schéma [accéléré] aussi" pour les
    // tests solo). Figé UNE FOIS POUR TOUTES à la génération de la ligue
    // (voir generateLeague) plutôt que relu dynamiquement à chaque calcul :
    // redémarrer le serveur avec/sans le mode accéléré ne dérègle donc
    // jamais un calendrier déjà en cours, seule une toute nouvelle ligue
    // (nouvelle carrière, ou nouvelle saison qui hérite du réglage de la
    // précédente, voir startNewSeason côté navigateur) adopte le réglage
    // courant. `null` = calendrier classique (voir CALENDAR_WEEK_MS/
    // CALENDAR_CHAMPIONSHIP_SLOT_OFFSETS_MS ci-dessous), pour rester
    // rétro-compatible avec les sauvegardes d'avant ce réglage.
    this.calendarWeekMs = null;
    this.calendarSlotOffsetsMs = null;

    // Calendrier ANCRÉ QUOTIDIEN (retour utilisateur, 2026-09 — "3 matchs
    // par jour à heures fixes réelles, en heure de Paris") : `true`
    // uniquement pour la ligue multi-manager (voir generateMultiManagerLeague/
    // buildLeagueWithHumanTeams) — jamais pour la carrière solo historique,
    // qui garde son propre rythme (calendarWeekMs/calendarSlotOffsetsMs
    // ci-dessus, ou null = classique). Un rythme entièrement séparé des deux
    // ci-dessus, pas exprimable avec les mêmes champs (voir le grand
    // commentaire dans server/calendar.js, "CALENDRIER ANCRÉ QUOTIDIEN") :
    // calendarWeekMs/calendarSlotOffsetsMs restent `null` quand celui-ci est
    // actif. `lastAutoTrainedDay` (`-1` = aucun jour encore traité) joue le
    // même rôle que lastAutoTrainedWeek ci-dessus, mais au jour CIVIL près
    // (retour utilisateur : "toutes les 3 matchs", lu comme "une fois par
    // jour civil, juste après le créneau de 19h" — voir server/autoSim.js).
    this.calendarDailyAnchored = false;
    this.lastAutoTrainedDay = -1;

    // Compétition de Coupe (retour utilisateur, 2026-09 — voir le grand
    // commentaire au-dessus de generateCupBracket) : `null` tant qu'aucune
    // coupe n'existe pour cette ligue (carrière solo, ou ligue multi-manager
    // pas encore passée par generateMultiManagerLeague/leagueFromSave) —
    // {rounds: [...], champion: null|idx} une fois créée (voir
    // generateCupBracket). Toujours reconstruite à zéro à chaque
    // régénération de la ligue multi-manager (nouvelle saison de test, voir
    // /api/admin/reset-multi-league côté serveur) — un nouveau tirage au
    // sort de byes à chaque fois, comme les 9 adversaires CPU.
    this.cup = null;

    // Matchs en direct en cours de diffusion pour la journée courante (voir
    // server/liveMatch.js) : UNE entrée par match diffusé, indexée par une
    // clé stable "round:home:away" (voir liveMatchKey côté server/liveMatch.js)
    // — plusieurs managers humains peuvent chacun avoir LEUR match diffusé en
    // même temps (retour utilisateur, 2026-09 : "jusqu'à 10 vrais managers
    // humains dans une ligue partagée"). Un match CPU-vs-CPU n'a JAMAIS
    // d'entrée ici (voir ensureLiveMatchStarted). Chaque entrée est calculée
    // UNE SEULE FOIS par le serveur dès l'heure du coup d'envoi, puis étalée
    // dans le temps réel jusqu'à sa clôture (voir MATCH_BROADCAST_DURATION_MS).
    this.liveMatches = {};

    // Confort d'affichage UNIQUEMENT : le match en direct DE CELUI QUI A FAIT
    // LA REQUÊTE, déjà résolu depuis this.liveMatches par le serveur (voir
    // server/liveMatch.js:viewLiveMatchForTeam) avant de sérialiser la
    // réponse — jamais recalculé ni maintenu à jour ici même, jamais la
    // source de vérité (c'est this.liveMatches). `null` par défaut ; c'est ce
    // que lit tout l'affichage "en direct" côté navigateur (league.liveMatch
    // — voir enterLiveMatch), qui n'a pas besoin de connaître les diffusions
    // des AUTRES managers.
    this.liveMatch = null;
  }

  get totalRounds() { return this.schedule.length; }
  isRegularSeasonDone() { return this.round >= this.totalRounds; }
  matchesForRound(r) { return this.schedule[r] || []; }

  // Premier match à venir pour l'équipe `teamIdx` (index 0 par défaut,
  // comportement historique solo) à partir de la journée courante. Renvoie
  // null une fois la saison régulière terminée.
  // Correctif (généralisation multi-manager, 2026-09, retour utilisateur :
  // "probleme équipe qui joue contre elle même ? normalement l'adversaire
  // est gotham knight") : cette méthode cherchait encore, sans condition,
  // le match de `teams[0]` (comportement historique solo, où le club du
  // joueur est TOUJOURS à cet index), jamais celui du manager qui consulte
  // réellement l'écran (myTeamIndex côté navigateur, voir
  // enterNextMatchOrShowSeasonEnd). Pour tout manager d'une ligue partagée
  // dont l'équipe n'est PAS à l'index 0, le "prochain match" affiché était
  // donc celui de teams[0] : round correct par coïncidence (calendrier
  // sans exempt, tout le monde avance au même rythme), mais adversaire et
  // domicile/extérieur erronés, jusqu'à parfois afficher l'équipe du
  // manager elle-même comme son propre adversaire (si teams[0] jouait
  // justement contre lui ce tour-ci). Se réduit exactement au comportement
  // historique en solo, où myTeamIndex vaut toujours 0.
  // Correctif (ligue multi-manager, 2026-09, retour utilisateur : "le bug
  // d'absence de texte [...] sur la page ordre, apparait quand on clique sur
  // ordres (la première fois qu'on va sur la page), si on choisit qqch dans
  // le menu déroulant, ça apparait, et si on remet le match qu'on avait au
  // départ via le menu deroulant, ça reapparait aussi") : cette boucle
  // partait de `this.round` (le round GLOBAL de la ligue) et renvoyait le
  // premier round à partir de là où `teamIdx` a un match programmé, SANS
  // jamais vérifier s'il avait déjà été joué. En solo (un seul match humain
  // par round), `this.round` avance dès que CE match est résolu, donc ça ne
  // posait jamais de problème. En ligue multi-manager, `this.round` n'avance
  // QUE quand TOUS les matchs du round sont résolus (voir
  // League.isRegularSeasonDone/server/autoSim.js) — si le match de `teamIdx`
  // se termine (diffusion en direct achevée) alors que D'AUTRES matchs du
  // même round sont encore en cours ailleurs dans la ligue, `this.round`
  // reste sur ce round déjà joué pour `teamIdx`, et cette méthode le
  // renvoyait quand même comme "prochain match" (déjà dans this.results,
  // jamais vérifié). currentMatch (côté navigateur, voir
  // enterNextMatchOrShowSeasonEnd) pointait alors sur un round déjà résolu,
  // absent de upcomingRoundsForOrders() (qui, lui, exclut bien les rounds
  // déjà joués via league.results) : defaultOrdresRound() présélectionnait
  // ce round fantôme, le menu déroulant retombait alors sur son option par
  // défaut du navigateur (aucune <option> ne correspondant), mais le
  // bandeau #ordresRoundDateTime, lui, cherchait toujours l'ancien round et
  // ne trouvait rien — d'où un bandeau vide malgré un menu déroulant qui
  // semblait pourtant afficher une sélection valide. Choisir N'IMPORTE QUELLE
  // option du menu (même celle déjà affichée) appelle selectOrdresRound()
  // avec la VRAIE valeur de cette <option>, qui corrige `selectedOrdresRound`
  // au passage — d'où le bandeau qui "réapparaît" en rechoisissant le même
  // match. Corrigé en sautant, comme upcomingRoundsForOrders(), tout round
  // déjà résolu pour `teamIdx` d'après `this.results`, plutôt que de
  // supposer que `this.round` (global) reflète déjà son propre état.
  nextUserMatch(teamIdx = 0) {
    for (let r = this.round; r < this.totalRounds; r++) {
      const m = this.schedule[r].find(x => x.home === teamIdx || x.away === teamIdx);
      if (!m) continue;
      const alreadyPlayed = this.results.some(res => res.round === r && (res.home === teamIdx || res.away === teamIdx));
      if (alreadyPlayed) continue;
      const isHome = m.home === teamIdx;
      return { round: r, isHome, opponent: isHome ? m.away : m.home };
    }
    return null;
  }

  recordResult(round, home, away, scoreHome, scoreAway) {
    this.results.push({ round, home, away, scoreHome, scoreAway });
  }

  // Classement : 2 points pour une victoire, 1 pour une défaite (pas de
  // match nul en basket). Départage par différence de points puis total de
  // points marqués.
  standings() {
    const table = this.teams.map((t, i) => ({
      idx: i, name: t.name, played: 0, wins: 0, losses: 0, pf: 0, pa: 0, points: 0,
    }));
    this.results.forEach(r => {
      const h = table[r.home], a = table[r.away];
      h.played++; a.played++;
      h.pf += r.scoreHome; h.pa += r.scoreAway;
      a.pf += r.scoreAway; a.pa += r.scoreHome;
      if (r.scoreHome > r.scoreAway) { h.wins++; a.losses++; h.points += 2; a.points += 1; }
      else { a.wins++; h.losses++; a.points += 2; h.points += 1; }
    });
    return table.sort((x, y) => y.points - x.points || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf);
  }

  // Simule instantanément (moteur complet, sans écran dédié) tous les
  // matchs d'une journée qui NE concernent PAS le club du joueur, et
  // enregistre les résultats. Le match du joueur, lui, passe par l'écran de
  // match classique puis est enregistré séparément.
  // NOTE (généralisation multi-manager, 2026-09) : sautait à l'origine
  // uniquement `home === 0 || away === 0` (LE club du joueur, toujours à cet
  // index) — généralisé à "n'importe quel côté humain" (`isHuman`) pour
  // qu'un match entre DEUX managers humains (aucun des deux forcément à
  // l'index 0, voir Team.isHuman/buildLeagueWithHumanTeams) ne soit jamais
  // auto-résolu ici à leur place. Se réduit exactement au comportement
  // historique quand il n'y a qu'UN SEUL manager humain, à l'index 0.
  simulateCpuMatchesForRound(r) {
    this.matchesForRound(r).forEach(m => {
      if (this.teams[m.home].isHuman || this.teams[m.away].isHuman) return;
      const result = simulateOrForfeit(this.teams[m.home], this.teams[m.away]);
      this.recordResult(r, m.home, m.away, result.scoreHome, result.scoreAway);
    });
  }

  // Fait progresser les 9 équipes adverses (CPU) d'une semaine
  // d'entraînement simplifiée (voir Team.trainWeekCPU), à appeler en
  // parallèle de Team.trainWeek pour le club du joueur (même cadence
  // hebdomadaire — désormais appliquée automatiquement une fois par semaine
  // réelle, voir catchUpLeague côté server/autoSim.js) : sans ça, un club bien
  // géré progresse semaine après semaine tandis que les adversaires restent
  // figés à leur niveau de génération, et l'écart se creuse sans limite au
  // fil d'une saison. Chaque adversaire reçoit en plus un "rattrapage"
  // proportionnel à son propre écart de niveau avec le club du joueur (voir
  // Team.trainWeekCPU) : ça referme aussi un écart déjà creusé (parties en
  // cours, ou après mise à jour du jeu), pas seulement empêcher qu'il
  // continue de grandir.
  // NOTE (généralisation multi-manager, 2026-09) : le "niveau du club du
  // joueur" auquel les CPU se comparent était `this.teams[0]` seul —
  // généralisé à la MOYENNE des équipes humaines (1 à 10, voir Team.isHuman)
  // pour rester représentatif quand plusieurs managers réels coexistent.
  // Se réduit exactement au comportement historique avec un seul manager
  // humain, à l'index 0.
  trainCpuTeams() {
    const humanTeams = this.teams.filter(t => t.isHuman);
    const userAvg = humanTeams.length
      ? humanTeams.reduce((s, t) => s + t.averageOverall(), 0) / humanTeams.length
      : this.teams[0].averageOverall();
    this.teams.forEach(t => {
      if (t.isHuman) return;
      const gap = userAvg - t.averageOverall();
      t.trainWeekCPU(gap);
    });
  }

  // Passe à la journée suivante (à appeler une fois TOUS les matchs de la
  // journée courante enregistrés, joueur compris).
  advanceRound() {
    this.round += 1;
  }

  // ---------------------------------------------------------------------
  // COUPE — voir le grand commentaire au-dessus de generateCupBracket pour
  // le format de league.cup. Ces 3 méthodes sont au tableau de coupe ce que
  // matchesForRound/recordResult/advanceRound sont au championnat
  // ci-dessus : de simples primitives de données, appelées depuis
  // server/liveMatch.js (voir finalizeCupRound) — jamais depuis ici (ce
  // moteur ne connaît ni le direct ni l'heure réelle).
  // ---------------------------------------------------------------------

  // Le tour de coupe actuellement EN ATTENTE (pas encore résolu) — `null` si
  // cette ligue n'a pas de coupe, ou si son dernier tour connu (la finale)
  // est déjà résolu (this.cup.champion posé) : dans les deux cas, "aucun
  // tour dû", le créneau de 15h reste vide ce jour-là (voir
  // server/liveMatch.js/server/autoSim.js).
  pendingCupRound() {
    if (!this.cup || this.cup.champion != null) return null;
    const round = this.cup.rounds[this.cup.rounds.length - 1];
    return round && !round.resolved ? round : null;
  }

  // Enregistre le résultat d'UN match réel (jamais un bye, déjà résolu à sa
  // création — voir generateCupBracket) du tour actuellement en attente,
  // repéré par son index DANS round.matches (stable, voir
  // server/liveMatch.js:finalizeCupRound). Égalité stricte (forfait mutuel
  // 0-0, les deux équipes incapables d'aligner un cinq — cas limite déjà géré
  // à part par simulateOrForfeit) : l'équipe À DOMICILE est arbitrairement
  // déclarée gagnante plutôt que de laisser un tableau bloqué sans vainqueur
  // — aussi rare que le même cas en barrage de relégation (voir
  // runRelegationBarrage), qui n'a pas non plus vraiment de règle dédiée.
  recordCupMatchResult(matchIndex, scoreHome, scoreAway, forfeit) {
    const round = this.pendingCupRound();
    if (!round) return;
    const m = round.matches[matchIndex];
    if (!m || m.bye) return;
    m.scoreHome = scoreHome;
    m.scoreAway = scoreAway;
    m.forfeit = forfeit;
    m.winner = scoreAway > scoreHome ? m.away : m.home;
    m.resolved = true;
  }

  // Clôt le tour en attente une fois TOUS ses matchs réels enregistrés (voir
  // recordCupMatchResult) : marque le tour résolu puis, soit couronne le
  // champion (c'était la finale), soit engendre le tour suivant en appariant
  // les vainqueurs (voir buildNextCupRound) — jamais les deux à la fois.
  // No-op silencieux si aucun tour n'est en attente (ligue sans coupe, ou
  // coupe déjà terminée).
  advanceCup(now = Date.now()) {
    const round = this.pendingCupRound();
    if (!round) return;
    round.resolved = true;
    const winners = round.matches.map(m => m.winner);
    if (round.name === CUP_STAGE_NAMES[CUP_STAGE_NAMES.length - 1]) {
      this.cup.champion = winners[0];
      this.recordTrophy(winners[0], "cup", now);
    } else {
      this.cup.rounds.push(buildNextCupRound(round, winners));
    }
  }

  // Trophée du club (retour utilisateur, voir le grand commentaire sur
  // generateFoundedYear/MAX_TEAM_TROPHIES plus haut) : hook UNIQUE partagé
  // par les deux couronnes d'une saison, coupe (voir advanceCup ci-dessus) et
  // championnat (voir runPlayoffs plus bas), pour ne pas dupliquer la même
  // construction de libellé aux deux endroits. `now` par défaut à Date.now()
  // (temps RÉEL, jamais le calendrier simulé) : un trophée est un souvenir
  // daté pour l'affichage, pas une donnée lue par le moteur de simulation.
  // Fonctionne identiquement en solo (seule teamA survit d'une saison à
  // l'autre, voir startNewSeason côté moteurbasket3.html — les trophées des
  // adversaires régénérés sont perdus avec eux, sans conséquence) et en
  // ligue multi-manager (toutes les équipes persistent).
  recordTrophy(teamIdx, type, now = Date.now()) {
    const team = this.teams[teamIdx];
    if (!team) return;
    const info = divisionInfo(this.divisionLevel);
    const label = type === "cup"
      ? `Vainqueur de la Coupe (${info.name})`
      : `Champion (${info.name})`;
    team.trophies = team.trophies || [];
    team.trophies.unshift({ at: now, type, divisionLevel: this.divisionLevel || null, label });
    if (team.trophies.length > MAX_TEAM_TROPHIES) team.trophies.length = MAX_TEAM_TROPHIES;
  }

  // Phase finale : les 4 premiers du classement, demi-finales (1er-4e,
  // 2e-3e) puis finale, chaque tour en deux matchs gagnants. Retour
  // utilisateur (2026-09) : "les play offs doivent être comme les matchs de
  // saisons régulières, avec un live [...] sur plusieurs jours réels (et pas
  // tout simulés d'un coup)" : chaque MATCH de play-offs est donc résolu un
  // par un, à son propre tour de calendrier (voir playoffs.round plus bas),
  // exactement comme un match de championnat (voir server/liveMatch.js
  // ensurePlayoffLiveMatchStarted/finalizePlayoffRound, server/autoSim.js).
  // `startPlayoffsIfNeeded` ne fait QUE poser l'état initial (tirage au sort
  // des têtes de série, les deux demi-finales encore vides) ; c'est
  // recordPlayoffGameResult ci-dessous qui fait progresser chaque série
  // match par match. No-op si les play-offs existent déjà, ou si la saison
  // régulière n'est pas terminée.
  startPlayoffsIfNeeded(now = Date.now()) {
    if (this.playoffs || !this.isRegularSeasonDone()) return this.playoffs;
    const seeds = this.standings().slice(0, 4).map(s => s.idx);
    const makeSeries = (idxA, idxB) => ({
      idxA, idxB, games: [], winsA: 0, winsB: 0, winner: null, resolved: false,
    });
    this.playoffs = {
      seeds,
      // Continuation de l'index de journée du championnat (voir
      // League.round/totalRounds) : le premier match de play-offs tombe
      // donc, sans le moindre changement à scheduledTimeForLeagueRound
      // (calendrier classique comme ancré quotidien), au tout prochain
      // créneau réel après le dernier match de saison régulière. Compteur
      // SÉPARÉ de this.round (qui reste figé à totalRounds une fois la
      // saison régulière terminée) pour ne jamais perturber
      // matchesForRound/nextUserMatch, qui ne connaissent que le
      // championnat.
      round: this.totalRounds,
      series: [makeSeries(seeds[0], seeds[3]), makeSeries(seeds[1], seeds[2])],
      finalSeries: null,
      champion: null,
      // Instantané des joueurs ayant disputé la demi-finale de CHAQUE
      // équipe (voir _queuePlayoffSeriesInterview ci-dessous), keyed par idx
      // d'équipe : alimenté série par série, au moment précis où elle se
      // termine, jamais en bloc à la fin comme l'ancienne v1 synchrone.
      semiPlayerIds: {},
    };
    return this.playoffs;
  }

  // Paires à jouer POUR CE TOUR de play-offs (en pratique toujours appelé
  // avec playoffs.round lui-même, voir server/liveMatch.js) : au plus une
  // par demi-finale encore vivante tant que la finale n'est pas encore
  // constituée, sinon la seule paire de la finale. Ne renvoie un tableau
  // vide QUE une fois le champion connu (voir isPlayoffsDone) : tant que les
  // play-offs sont en cours, il y a toujours au moins une série vivante à ce
  // tour (au plus 3 tours par série, voir recordPlayoffGameResult, donc
  // jamais de tour "creux").
  playoffMatchesForRound(round) {
    const po = this.playoffs;
    if (!po || po.champion != null || round !== po.round) return [];
    const out = [];
    const addIfLive = (series, seriesId) => {
      if (!series || series.resolved) return;
      const gameIndex = series.games.length;
      const aHome = gameIndex % 2 === 0; // alternance stricte, tête de série à domicile au match 1
      const home = aHome ? series.idxA : series.idxB;
      const away = aHome ? series.idxB : series.idxA;
      out.push({ home, away, seriesId, gameIndex });
    };
    if (!po.finalSeries) {
      addIfLive(po.series[0], "semi0");
      addIfLive(po.series[1], "semi1");
    } else {
      addIfLive(po.finalSeries, "final");
    }
    return out;
  }

  // true une fois la finale jouée (champion connu) : c'est CE flag, et non
  // plus la simple existence de league.playoffs (posée dès
  // startPlayoffsIfNeeded, avant le moindre match joué), qui signale la
  // vraie fin de la saison côté server/autoSim.js et navigateur.
  isPlayoffsDone() {
    return !!(this.playoffs && this.playoffs.champion != null);
  }

  // Enregistre le résultat d'UN match de play-offs (identifié par
  // `seriesId`, voir playoffMatchesForRound) : fait progresser la série
  // correspondante, la clôt à 2 victoires, puis soit prépare la finale (les
  // deux demies terminées), soit couronne le champion (finale terminée).
  // Voir server/liveMatch.js:finalizePlayoffRound (chemin normal, un match à
  // la fois, en direct) et League.runPlayoffsInstantly (tests/repli) pour
  // les deux seuls appelants.
  recordPlayoffGameResult(seriesId, home, away, scoreHome, scoreAway, now = Date.now()) {
    const po = this.playoffs;
    if (!po) return;
    const series = seriesId === "semi0" ? po.series[0]
      : seriesId === "semi1" ? po.series[1]
      : po.finalSeries;
    if (!series || series.resolved) return;
    series.games.push({ home, away, scoreHome, scoreAway });
    const aWon = home === series.idxA ? scoreHome > scoreAway : scoreAway > scoreHome;
    if (aWon) series.winsA++; else series.winsB++;
    if (series.winsA < 2 && series.winsB < 2) return; // série pas encore décidée
    series.resolved = true;
    series.winner = series.winsA === 2 ? series.idxA : series.idxB;
    if (seriesId === "final") {
      po.champion = series.winner;
      this.recordTrophy(series.winner, "championship", now);
      // Interview de jalon "finale de PO" (retour utilisateur, 2026-09 :
      // "on peut ajouter un interview post finale de PO, en cas de victoire
      // ou défaite") : même mécanique que la demi-finale ci-dessous, pour
      // CHAQUE finaliste humain. Pas de snapshot semiPlayerIds équivalent
      // ici (inutile : la finale est le dernier match de la saison, rien ne
      // resimule plus ces joueurs avant la saison prochaine).
      this._queuePlayoffSeriesInterview(series, now, "finale-po");
      return;
    }
    // Demi-finale décidée : interview de jalon (voir
    // _queuePlayoffSeriesInterview ci-dessous) pour CETTE série, capturée
    // IMMÉDIATEMENT (donc jamais écrasée par une future série, contrairement
    // à l'ancien compromis synchrone) puis, si les DEUX demies sont
    // désormais résolues, constitution de la finale.
    this._queuePlayoffSeriesInterview(series, now, "demi-finale-po", "semiPlayerIds");
    if (po.series[0].resolved && po.series[1].resolved && !po.finalSeries) {
      po.finalSeries = {
        idxA: po.series[0].winner, idxB: po.series[1].winner,
        games: [], winsA: 0, winsB: 0, winner: null, resolved: false,
      };
    }
  }

  // Interview de jalon "demi-finale de PO" OU "finale de PO" (retour
  // utilisateur, 2026-09, voir le grand commentaire de
  // MILESTONE_INTERVIEW_TYPES plus haut) pour CHAQUE équipe humaine de
  // `series` (qu'elle ait gagné ou perdu) : appelée par
  // recordPlayoffGameResult dès que cette série se termine, jamais en bloc
  // après coup comme l'ancienne v1 synchrone. `round` volontairement `null`
  // (aucune journée de calendrier ne correspond à une série de play-offs à
  // proprement parler, elle s'étale sur plusieurs) : cette interview n'est
  // donc jamais retrouvée par round (contrairement aux jalons de saison
  // régulière), uniquement par `milestone` (voir
  // showCatchupSummaryIfAny/showSeasonEnd côté navigateur). `snapshotKey`
  // (optionnel, ex. "semiPlayerIds") : nom du dictionnaire `this.playoffs`
  // où figer l'instantané des joueurs ayant disputé CETTE série, capturé
  // MAINTENANT (avant qu'une autre série, y compris la finale, ne resimule
  // ces mêmes joueurs et n'écrase leur secondsPlayed) ; omis pour la finale,
  // qui n'a besoin d'aucun instantané (dernier match de la saison).
  _queuePlayoffSeriesInterview(series, now, milestone, snapshotKey = null) {
    [series.idxA, series.idxB].forEach(idx => {
      const team = this.teams[idx];
      const playerIds = team ? team.players.filter(p => p.secondsPlayed > 0).map(p => p.id) : [];
      if (snapshotKey) this.playoffs[snapshotKey][idx] = playerIds;
      if (!team || !team.isHuman) return;
      const opponentIdx = idx === series.idxA ? series.idxB : series.idxA;
      const opponent = this.teams[opponentIdx];
      const won = series.winner === idx;
      const lastGame = series.games[series.games.length - 1];
      const isHomeLastGame = lastGame.home === idx;
      const scoreDiff = isHomeLastGame
        ? lastGame.scoreHome - lastGame.scoreAway
        : lastGame.scoreAway - lastGame.scoreHome;
      team.applyMoraleForResult(won, scoreDiff, opponent ? opponent.name : "l'adversaire", null, now, milestone, playerIds);
    });
  }

  // Prochain match de play-offs de `teamIdx` (index 0 par défaut) au tour
  // COURANT (playoffs.round) : équivalent de nextUserMatch, mais pour la
  // phase finale. `null` si les play-offs n'existent pas encore, sont déjà
  // terminés, ou si `teamIdx` n'est engagé dans AUCUNE série vivante ce
  // tour-ci (éliminé, ou pas qualifié) : contrairement à nextUserMatch, ne
  // cherche jamais au-delà du tour courant, puisqu'un tour de play-offs
  // n'avance que lorsque TOUTES ses séries vivantes ont joué (voir
  // finalizePlayoffRound côté server/liveMatch.js) : il n'y a donc jamais de
  // tour "déjà joué" à sauter.
  nextUserPlayoffMatch(teamIdx = 0) {
    const po = this.playoffs;
    if (!po || po.champion != null) return null;
    const m = this.playoffMatchesForRound(po.round).find(x => x.home === teamIdx || x.away === teamIdx);
    if (!m) return null;
    const isHome = m.home === teamIdx;
    return { round: po.round, isHome, opponent: isHome ? m.away : m.home, seriesId: m.seriesId };
  }

  // Résout les play-offs entièrement, tour par tour, en simulant chaque
  // match (jamais de diffusion en direct) : utilisé par les tests, et par le
  // repli défensif côté navigateur (voir enterNextMatchOrShowSeasonEnd) pour
  // le cas rare où l'écran de fin de saison est atteint sans être passé par
  // le rattrapage serveur normal (voir server/autoSim.js:catchUpLeague, le
  // chemin RÉEL, un match à la fois/en direct, qui n'appelle jamais cette
  // méthode). `competition` posé à "championship" comme pour un match de
  // championnat classique (voir le même choix côté finalizePlayoffRound) :
  // les stats/MVP/box-score des play-offs vivent dans le même flux que la
  // saison régulière, seul `round` (>= totalRounds) les distingue.
  runPlayoffsInstantly(now = Date.now()) {
    this.startPlayoffsIfNeeded(now);
    while (this.playoffs && this.playoffs.champion == null) {
      const round = this.playoffs.round;
      const matches = this.playoffMatchesForRound(round);
      matches.forEach(m => {
        const result = simulateOrForfeit(this.teams[m.home], this.teams[m.away], now);
        if (!result.forfeit) {
          recordMatchStatsAndAwardMvp(this.teams[m.home], this.teams[m.away], round, "championship", now);
        }
        this.recordPlayoffGameResult(m.seriesId, m.home, m.away, result.scoreHome, result.scoreAway, now);
      });
      this.playoffs.round += 1;
    }
    return this.playoffs;
  }

  // Barrage de relégation : le 7e et le 8e de la saison régulière
  // s'affrontent en un match sec, le perdant rejoint le 9e et le 10e parmi
  // les équipes reléguées (voir relegatedTeamIndexes) — le 9e et le 10e,
  // eux, descendent toujours directement, sans barrage.
  runRelegationBarrage() {
    const table = this.standings();
    const idx7 = table[6].idx, idx8 = table[7].idx; // 7e et 8e (0-indexé)
    const result = simulateOrForfeit(this.teams[idx7], this.teams[idx8]);
    const scoreHome = result.scoreHome, scoreAway = result.scoreAway;
    const loser = scoreHome > scoreAway ? idx8 : idx7;
    const winner = loser === idx7 ? idx8 : idx7;
    this.relegationBarrage = { idx7, idx8, scoreHome, scoreAway, winner, loser };
    return this.relegationBarrage;
  }

  // Indices (dans this.teams) des équipes reléguées cette saison : le 9e et
  // le 10e automatiquement, plus le perdant du barrage 7e-8e (voir
  // runRelegationBarrage — doit avoir été joué avant, sinon renvoie juste le
  // 9e et le 10e).
  relegatedTeamIndexes() {
    const table = this.standings();
    const auto = [table[8].idx, table[9].idx]; // 9e, 10e (0-indexé : rangs 8,9)
    return this.relegationBarrage ? [...auto, this.relegationBarrage.loser] : auto;
  }

  // Résultat de promotion/relégation pour le club du joueur (index 0) dans
  // la pyramide de divisions, une fois les play-offs ET le barrage de
  // relégation joués : le champion des play-offs monte d'un niveau (sauf
  // s'il est déjà en Division I, la plus haute) ; sinon, s'il fait partie
  // des équipes reléguées, il descend d'un niveau (sauf s'il est déjà en
  // Division VI, la plus basse). Renvoie { outcome: "promoted"|"relegated"|
  // "stay", fromLevel, toLevel }.
  divisionOutcomeForUserTeam() {
    const fromLevel = this.divisionLevel || MAX_DIVISION_LEVEL;
    const champion = this.playoffs ? this.playoffs.champion : null;
    let outcome = "stay", toLevel = fromLevel;
    if (champion === 0 && fromLevel > 1) {
      outcome = "promoted";
      toLevel = fromLevel - 1;
    } else if (this.relegatedTeamIndexes().includes(0) && fromLevel < MAX_DIVISION_LEVEL) {
      outcome = "relegated";
      toLevel = fromLevel + 1;
    }
    // Champion de Division I : aucune montée possible (déjà tout en haut de
    // la pyramide), mais mérite quand même sa propre prime (voir
    // CHAMPION_BONUS_DIVISION_I / seasonEndBonusFor) — à détecter à part,
    // puisque l'outcome ci-dessus reste "stay" dans ce cas précis.
    const championDivisionI = champion === 0 && fromLevel === 1;
    return { outcome, fromLevel, toLevel, championDivisionI };
  }

  // ---------------------------------------------------------------------
  // Marché des transferts — voir le commentaire sur this.transferListings
  // (constructeur) et sur les constantes TRANSFER_* plus haut. `now`
  // (millisecondes, comme Date.now()) est TOUJOURS un paramètre explicite
  // plutôt qu'un appel direct à Date.now() à l'intérieur de ces méthodes :
  // ça permet de tester le passage du temps (avance de plusieurs jours)
  // sans avoir à réellement attendre, et laisse l'appelant (l'UI) rester la
  // seule source de vérité sur "maintenant".
  // ---------------------------------------------------------------------

  // Cherche un joueur par id, TOUTES équipes confondues (utile pour une
  // enchère : le joueur listé peut appartenir à n'importe laquelle des 10
  // équipes de la ligue, pas seulement celle du joueur).
  playerById(playerId) {
    for (const team of this.teams) {
      const p = team.players.find(pl => pl.id === playerId);
      if (p) return p;
    }
    return null;
  }

  // Met un joueur de sellerIdx aux enchères pour TRANSFER_AUCTION_DURATION_MS.
  // AUCUN plancher d'effectif pour le vendeur (retour utilisateur explicite :
  // "on peut vendre tout son effectif si on le souhaite" — voir aussi
  // Team.sellPlayer) : refuse seulement si le joueur n'existe pas dans cette
  // équipe, ou s'il est déjà listé (une seule enchère active à la fois par
  // joueur). Renvoie l'annonce créée, ou `null`. (Le plancher qui subsiste
  // pour les NOUVELLES annonces générées automatiquement par une équipe CPU
  // est une prudence distincte côté génération — voir refreshMarket — pas
  // une limite sur cette méthode elle-même.)
  listPlayerForSale(sellerIdx, playerId, startPrice, now) {
    const seller = this.teams[sellerIdx];
    if (!seller) return null;
    const player = seller.players.find(p => p.id === playerId);
    if (!player) return null;
    if (this.transferListings.some(l => l.status === "open" && l.playerId === playerId)) return null;
    const listing = {
      id: uid(),
      playerId,
      sellerIdx,
      startPrice: Math.max(1, Math.round(startPrice)),
      currentBid: null,
      currentBidderIdx: null,
      bids: [],
      createdAt: now,
      closesAt: now + TRANSFER_AUCTION_DURATION_MS,
      lastCpuCheckAt: now,
      status: "open", // "open" | "sold" | "unsold" | "cancelled"
      result: null,
      finalPrice: null,
    };
    this.transferListings.push(listing);
    return listing;
  }

  // Annule une annonce SANS enchère encore posée (sécurité pour une erreur
  // de manipulation) — une fois qu'une enchère existe, plus d'annulation
  // possible (comme un vrai marché). Réservé au vendeur lui-même.
  cancelListing(listingId, teamIdx) {
    const listing = this.transferListings.find(l => l.id === listingId);
    if (!listing || listing.status !== "open") return false;
    if (listing.sellerIdx !== teamIdx) return false;
    if (listing.currentBidderIdx != null) return false;
    listing.status = "cancelled";
    return true;
  }

  // Pose une enchère sur une annonce ouverte. Renvoie { ok: true, listing }
  // ou { ok: false, reason, minBid? } — reasons : "closed" (annonce fermée ou
  // échéance déjà passée), "own-listing" (on ne peut pas enchérir sur son
  // propre joueur), "invalid-bidder", "roster-full" (déjà au plafond
  // d'effectif), "too-low" (sous l'enchère minimale — voir minNextBidFor),
  // "insufficient-budget" (club du joueur uniquement — voir plus bas).
  placeBid(listingId, bidderIdx, amount, now) {
    const listing = this.transferListings.find(l => l.id === listingId);
    if (!listing || listing.status !== "open" || now >= listing.closesAt) return { ok: false, reason: "closed" };
    if (listing.sellerIdx === bidderIdx) return { ok: false, reason: "own-listing" };
    const bidder = this.teams[bidderIdx];
    if (!bidder) return { ok: false, reason: "invalid-bidder" };
    if (bidder.players.length >= MAX_ROSTER_SIZE) return { ok: false, reason: "roster-full" };
    const minBid = minNextBidFor(listing);
    if (amount < minBid) return { ok: false, reason: "too-low", minBid };
    // Le budget des équipes CPU n'est pas suivi de façon réaliste (elles ne
    // jouent jamais Team.trainWeek, donc ne touchent ni recettes ni droits
    // TV) : seule une équipe HUMAINE (voir Team.isHuman — n'importe laquelle,
    // plus seulement l'index 0) est bloquée par son budget réel. Voir
    // refreshMarket pour la logique d'enchère CPU (valeur marchande estimée,
    // pas un vrai budget).
    if (bidder.isHuman && amount > bidder.budget) return { ok: false, reason: "insufficient-budget" };
    const rounded = Math.round(amount);
    listing.currentBid = rounded;
    listing.currentBidderIdx = bidderIdx;
    listing.bids.push({ bidderIdx, amount: rounded, at: now });
    return { ok: true, listing };
  }

  // Un adversaire CPU est-il intéressé par ce joueur ? Simplification :
  // intéressé s'il n'a personne à ce poste, ou si le joueur listé est
  // meilleur (overall()) que son plus faible joueur à ce poste — comme une
  // vraie équipe qui ne renforce que ce qui l'améliore.
  _cpuWantsPlayer(teamIdx, player) {
    const team = this.teams[teamIdx];
    const samePos = team.players.filter(p => p.position === player.position);
    if (!samePos.length) return true;
    const weakest = Math.min(...samePos.map(p => p.overall()));
    return player.overall() > weakest;
  }

  // Résout une enchère arrivée à échéance : transfère le joueur au plus
  // offrant (s'il y a une enchère), encaisse/débite une VRAIE transaction
  // budgétaire uniquement pour le club du joueur (voir placeBid — le budget
  // CPU n'est pas suivi), sinon la laisse invendue.
  _resolveListing(listing, now) {
    listing.status = "closed";
    if (listing.currentBidderIdx == null) {
      listing.result = "unsold";
      return;
    }
    const buyerIdx = listing.currentBidderIdx;
    const buyer = this.teams[buyerIdx];
    const seller = this.teams[listing.sellerIdx];
    const amount = listing.currentBid;
    // Revérifie au moment de la clôture que l'acheteur a toujours les
    // moyens ET la place (son budget/effectif a pu changer entre-temps) —
    // simplification volontaire : pas de "repêchage" du 2e enchérisseur si
    // le 1er échoue, l'enchère est simplement perdue pour tout le monde.
    if (buyer.players.length >= MAX_ROSTER_SIZE || (buyer.isHuman && amount > buyer.budget)) {
      listing.result = "buyer-failed";
      return;
    }
    const idx = seller.players.findIndex(p => p.id === listing.playerId);
    if (idx === -1) { listing.result = "player-missing"; return; }
    // Alchimie d'équipe (voir chemistryRosterImportance/rosterRankOf plus
    // haut, levier 2 des 3) : le rang du joueur DANS L'EFFECTIF VENDEUR,
    // calculé AVANT le splice() ci-dessous (tant qu'il y figure encore).
    const sellerImportance = chemistryRosterImportance(rosterRankOf(seller.players, listing.playerId));
    const [player] = seller.players.splice(idx, 1);
    // Retour utilisateur (2026-09) : "en cas d'indisponibilité pour vente
    // d'un joueur, qui avait été mis dans la composition, il doit être
    // enlevé de la composition [...] si un titulaire est vendu, qu'il y a 4
    // joueurs titu et au moins un remplaçant, [...] le remplaçant doit être
    // aligné comme titu sur le poste laissé en blanc, il ne faut pas mettre
    // un forfait dans ce type de cas" (voir le même correctif/commentaire
    // détaillé sur Team.sellPlayer/handleStarterDeparture plus haut) — pour
    // une équipe HUMAINE (n'importe laquelle, voir Team.isHuman — plus
    // seulement l'index 0), promeut le remplaçant déjà désigné pour le poste
    // du titulaire vendu s'il y en a un, sinon laisse le trou, plutôt que de
    // reconstruire automatiquement TOUTE la feuille de match ; les clubs
    // CPU, eux, n'ont personne pour la retoucher manuellement, donc on
    // continue de la reconstruire entièrement pour eux comme avant (sinon
    // ils s'effondreraient en forfaits après le moindre transfert). Idem
    // côté acheteur : un joueur d'un club HUMAIN nouvellement acquis rejoint
    // le banc plutôt que d'être auto-titularisé (ce qui pourrait sinon
    // déloger un titulaire déjà choisi manuellement).
    if (seller.isHuman) seller.handleStarterDeparture(listing.playerId);
    else seller.autoAssignLineup();
    if (buyer.isHuman) buyer.recordTransaction(`Achat de ${player.name} (enchères)`, -amount);
    if (seller.isHuman) seller.recordTransaction(`Vente de ${player.name} (enchères)`, amount);
    buyer.players.push(player);
    // Voir le grand commentaire de TRANSFER_NEW_CLUB_MOTIVATION_FLOOR plus
    // haut : un vrai changement de club (ce transfert-ci) relève la
    // motivation jusqu'à ce plancher si besoin, referme toute demande de
    // transfert active (elle visait l'ancien club), jamais l'inverse.
    if (player.form < TRANSFER_NEW_CLUB_MOTIVATION_FLOOR) player.form = TRANSFER_NEW_CLUB_MOTIVATION_FLOOR;
    player.weeksAtLowMotivation = 0;
    player.transferRequestActive = false;
    player.transferRequestQuote = null;
    if (!buyer.isHuman) buyer.autoAssignLineup();
    // Alchimie d'équipe (suite) : le rang du joueur DANS L'EFFECTIF
    // ACHETEUR, calculé APRÈS le push() ci-dessus (il y figure désormais).
    // Malus des DEUX côtés (jamais de bonus, voir le grand commentaire de
    // CHEMISTRY_ROSTER_CHANGE_MAX_RANK) : partir ET arriver perturbent
    // chacun la cohésion déjà en place dans leur effectif respectif.
    const buyerImportance = chemistryRosterImportance(rosterRankOf(buyer.players, player.id));
    seller.applyChemistryDelta(-CHEMISTRY_ROSTER_CHANGE_BASE * sellerImportance);
    buyer.applyChemistryDelta(-CHEMISTRY_ROSTER_CHANGE_BASE * buyerImportance);
    listing.result = "sold";
    listing.finalPrice = amount;
  }

  // À appeler à intervalles réguliers côté UI (chargement de la page,
  // ouverture de l'onglet Marché, validation d'une semaine d'entraînement) —
  // PAS en continu, puisqu'il n'y a pas de vraie horloge serveur ici : fait
  // vivre le marché (nouvelles annonces CPU, enchères CPU sur les annonces
  // ouvertes, au rythme de TRANSFER_CPU_CHECK_INTERVAL_MS) et résout toute
  // enchère dont l'échéance (3 jours réels) est dépassée.
  refreshMarket(now) {
    this.transferListings = this.transferListings || [];

    // 1) Enchères CPU sur les annonces ouvertes.
    this.transferListings.forEach(listing => {
      if (listing.status !== "open") return;
      if (now - (listing.lastCpuCheckAt || listing.createdAt) < TRANSFER_CPU_CHECK_INTERVAL_MS) return;
      listing.lastCpuCheckAt = now;
      const player = this.playerById(listing.playerId);
      if (!player) return;
      this.teams.forEach((team, idx) => {
        if (team.isHuman) return; // une équipe humaine enchérit elle-même (voir placeBid), pas simulé ici
        if (idx === listing.sellerIdx || idx === listing.currentBidderIdx) return;
        if (team.players.length >= MAX_ROSTER_SIZE) return;
        if (!this._cpuWantsPlayer(idx, player)) return;
        if (Math.random() >= TRANSFER_CPU_BID_CHANCE) return;
        const minBid = minNextBidFor(listing);
        const maxWilling = Math.round(estimateMarketValue(player) * rand(0.9, 1.35));
        if (minBid > maxWilling) return; // déjà trop cher pour cette équipe
        const bidAmount = Math.min(maxWilling, Math.round(minBid * rand(1, 1.15)));
        listing.currentBid = bidAmount;
        listing.currentBidderIdx = idx;
        listing.bids.push({ bidderIdx: idx, amount: bidAmount, at: now });
      });
    });

    // 2) Nouvelles annonces CPU (un adversaire met occasionnellement son
    // joueur le plus faible aux enchères) — vérifié pour toute la ligue à la
    // fois, au même rythme que les enchères CPU ci-dessus.
    if (now - (this.lastCpuListingCheckAt || 0) >= TRANSFER_CPU_CHECK_INTERVAL_MS) {
      this.lastCpuListingCheckAt = now;
      this.teams.forEach((team, idx) => {
        if (team.isHuman) return;
        if (team.players.length <= MIN_ROSTER_SIZE) return;
        if (this.transferListings.some(l => l.status === "open" && l.sellerIdx === idx)) return; // une annonce à la fois par CPU
        if (Math.random() >= TRANSFER_CPU_LIST_CHANCE) return;
        const weakest = team.players.reduce((w, p) => (p.overall() < w.overall() ? p : w), team.players[0]);
        this.listPlayerForSale(idx, weakest.id, estimateMarketValue(weakest), now);
      });
    }

    // 3) Résout toute enchère dont l'échéance est dépassée.
    this.transferListings
      .filter(l => l.status === "open" && now >= l.closesAt)
      .forEach(listing => this._resolveListing(listing, now));
  }

  // ---------------------------------------------------------------------
  // Marché des entraîneurs — voir le commentaire sur this.coachListings
  // (constructeur) et sur les constantes COACH_* plus haut. Même convention
  // `now` explicite que le marché des transferts ci-dessus.
  // ---------------------------------------------------------------------

  // Construit et pousse dans this.coachListings l'objet "annonce" d'un
  // candidat entraîneur au niveau et prix de départ donnés — factorisé pour
  // que generateCoachCandidate ci-dessous (tarif fixe TRAINER_BASE_SALARY) et
  // fireTeamTrainer plus bas (salaire déjà atteint, réduit de 30%) ne
  // laissent jamais diverger la FORME de l'annonce (les mêmes champs, values
  // par défaut identiques) entre les deux origines possibles d'un candidat.
  // Construit l'objet "annonce" (forme commune) d'un candidat de staff —
  // factorisé pour que _makeCoachListing (entraîneur) ET _makeAnalystListing
  // (analyste vidéo — marché structurellement identique, voir
  // Team.videoAnalyst/League.analystListings plus bas) ne puissent jamais
  // laisser diverger la FORME d'une annonce entre les deux marchés : mêmes
  // champs, mêmes valeurs par défaut, des deux côtés. Ne pousse PAS
  // elle-même dans une liste (contrairement à l'ancienne _makeCoachListing,
  // avant l'ajout du marché des analystes) : c'est aux deux petites méthodes
  // ci-dessous de le faire, chacune dans SA propre liste.
  _makeStaffListing(now, level, startPrice) {
    return {
      id: uid(),
      level,
      startPrice,
      currentBid: null,
      currentBidderIdx: null,
      bids: [],
      createdAt: now,
      closesAt: now + COACH_AUCTION_DURATION_MS,
      lastCpuCheckAt: now,
      status: "open", // "open" | "sold" | "unsold"
      result: null,
      finalPrice: null,
    };
  }

  // Construit et pousse dans this.coachListings l'objet "annonce" d'un
  // candidat entraîneur au niveau et prix de départ donnés — factorisé (voir
  // _makeStaffListing ci-dessus) pour que generateCoachCandidate ci-dessous
  // (tarif fixe TRAINER_BASE_SALARY) et fireTeamTrainer plus bas (salaire
  // déjà atteint, réduit de 30%) ne laissent jamais diverger la FORME de
  // l'annonce (les mêmes champs, valeurs par défaut identiques) entre les
  // deux origines possibles d'un candidat.
  _makeCoachListing(now, level, startPrice) {
    const listing = this._makeStaffListing(now, level, startPrice);
    this.coachListings.push(listing);
    return listing;
  }

  // Équivalent pour le marché des analystes vidéo (voir this.analystListings/
  // generateAnalystCandidate/fireTeamVideoAnalyst plus bas) — même rôle que
  // _makeCoachListing ci-dessus, juste une liste différente.
  _makeAnalystListing(now, level, startPrice) {
    const listing = this._makeStaffListing(now, level, startPrice);
    this.analystListings.push(listing);
    return listing;
  }

  // Génère un nouveau candidat entraîneur et le met aux enchères pour
  // COACH_AUCTION_DURATION_MS. Niveau tiré au sort avec un biais vers les
  // niveaux bas (plus fréquents) — un niveau 5 doit rester rare, un peu
  // comme un très bon joueur sur le marché des transferts.
  generateCoachCandidate(now) {
    const weights = [40, 28, 18, 10, 4]; // poids des niveaux 1 à 5
    const total = weights.reduce((s, w) => s + w, 0);
    let roll = Math.random() * total;
    let level = TRAINER_LEVELS[TRAINER_LEVELS.length - 1];
    for (let i = 0; i < weights.length; i++) {
      if (roll < weights[i]) { level = i + 1; break; }
      roll -= weights[i];
    }
    return this._makeCoachListing(now, level, TRAINER_BASE_SALARY[level] || 0);
  }

  // Pose une enchère sur un candidat entraîneur ouvert. Même convention de
  // retour que placeBid : { ok: true, listing } ou { ok: false, reason,
  // minBid? } — reasons : "closed" (annonce fermée ou échéance dépassée),
  // "invalid-bidder", "too-low" (sous l'enchère minimale — voir
  // minNextBidFor), "insufficient-budget" (club du joueur uniquement, même
  // logique que placeBid). Contrairement à placeBid : PAS de "own-listing"
  // (aucune équipe ne "possède" un candidat entraîneur) ni de "roster-full"
  // (un entraîneur n'occupe pas une place d'effectif — gagner l'enchère
  // remplace simplement l'entraîneur actuel de l'équipe, gratuitement,
  // exactement comme le bouton "Congédier" aujourd'hui).
  placeCoachBid(listingId, bidderIdx, amount, now) {
    const listing = this.coachListings.find(l => l.id === listingId);
    if (!listing || listing.status !== "open" || now >= listing.closesAt) return { ok: false, reason: "closed" };
    const bidder = this.teams[bidderIdx];
    if (!bidder) return { ok: false, reason: "invalid-bidder" };
    const minBid = minNextBidFor(listing);
    if (amount < minBid) return { ok: false, reason: "too-low", minBid };
    // Comme placeBid : seul le budget d'une équipe humaine est réel/suivi.
    if (bidder.isHuman && amount > bidder.budget) return { ok: false, reason: "insufficient-budget" };
    const rounded = Math.round(amount);
    listing.currentBid = rounded;
    listing.currentBidderIdx = bidderIdx;
    listing.bids.push({ bidderIdx, amount: rounded, at: now });
    return { ok: true, listing };
  }

  // Résout une enchère de candidat entraîneur arrivée à échéance. La mise
  // gagnante devient le SALAIRE DE DÉPART (baseSalary) du nouvel entraîneur
  // — voir Team.hireTrainer — PAS un débit ponctuel en plus : le salaire
  // hebdomadaire progressif (trainerWeeklySalary) EST le coût de l'enchère,
  // le débiter aussi en une fois reviendrait à facturer deux fois la même
  // chose. Si le club a déjà un entraîneur, il est simplement remplacé, sans
  // indemnité de départ (comme fireTrainer aujourd'hui).
  _resolveCoachListing(listing, now) {
    listing.status = "closed";
    if (listing.currentBidderIdx == null) {
      listing.result = "unsold";
      return;
    }
    const buyerIdx = listing.currentBidderIdx;
    const buyer = this.teams[buyerIdx];
    const amount = listing.currentBid;
    // Revérifie le budget à la clôture (le budget a pu changer entre-temps)
    // — simplification volontaire, comme _resolveListing : pas de
    // repêchage du 2e enchérisseur si le 1er n'a plus les moyens.
    if (buyer.isHuman && amount > buyer.budget) {
      listing.result = "buyer-failed";
      return;
    }
    buyer.hireTrainer(listing.level, amount);
    listing.result = "sold";
    listing.finalPrice = amount;
  }

  // À appeler au même rythme que refreshMarket (chargement de la page,
  // ouverture de l'onglet Staff...) — méthode VOLONTAIREMENT distincte (pas
  // fusionnée avec refreshMarket) pour que les deux marchés restent
  // lisibles indépendamment l'un de l'autre.
  refreshCoachMarket(now) {
    this.coachListings = this.coachListings || [];

    // 1) Enchères CPU sur les candidats ouverts — "intéressée" = équipe CPU
    // sans entraîneur du tout, ou dont l'entraîneur actuel est d'un niveau
    // inférieur à celui du candidat (même esprit que _cpuWantsPlayer).
    this.coachListings.forEach(listing => {
      if (listing.status !== "open") return;
      if (now - (listing.lastCpuCheckAt || listing.createdAt) < COACH_MARKET_GENERATE_CHECK_INTERVAL_MS) return;
      listing.lastCpuCheckAt = now;
      this.teams.forEach((team, idx) => {
        if (team.isHuman) return; // une équipe humaine enchérit elle-même via placeCoachBid
        if (idx === listing.currentBidderIdx) return;
        const interested = !team.trainer || team.trainer.level < listing.level;
        if (!interested) return;
        if (Math.random() >= COACH_CPU_BID_CHANCE) return;
        const minBid = minNextBidFor(listing);
        const maxWilling = Math.round((TRAINER_BASE_SALARY[listing.level] || 0) * rand(1.0, 1.5));
        if (minBid > maxWilling) return; // déjà trop cher pour cette équipe
        const bidAmount = Math.min(maxWilling, Math.round(minBid * rand(1, 1.15)));
        listing.currentBid = bidAmount;
        listing.currentBidderIdx = idx;
        listing.bids.push({ bidderIdx: idx, amount: bidAmount, at: now });
      });
    });

    // 2) Renouvelle les candidats pour garder au moins
    // COACH_MARKET_MIN_OPEN_LISTINGS annonces ouvertes en permanence (voir
    // le commentaire sur cette constante) — personne ne "vend" son
    // entraîneur spontanément comme sur le marché des transferts, donc ce
    // plancher est généré directement plutôt que probable.
    if (now - (this.lastCoachGenerationCheckAt || 0) >= COACH_MARKET_GENERATE_CHECK_INTERVAL_MS) {
      this.lastCoachGenerationCheckAt = now;
      let openCount = this.coachListings.filter(l => l.status === "open").length;
      while (openCount < COACH_MARKET_MIN_OPEN_LISTINGS) {
        this.generateCoachCandidate(now);
        openCount++;
      }
    }

    // 3) Résout toute enchère dont l'échéance est dépassée.
    this.coachListings
      .filter(l => l.status === "open" && now >= l.closesAt)
      .forEach(listing => this._resolveCoachListing(listing, now));
  }

  // Congédie l'entraîneur de `teamIndex` et le remet AUSSITÔT sur le marché
  // des entraîneurs, à un prix de départ réduit (retour utilisateur, 2026-09 :
  // "dès qu'un staff est viré parce que devenu trop cher, il faut qu'il
  // retourne sur le marché avec un salaire baissé de 30%"). Le prix de
  // départ de cette nouvelle annonce est calculé à partir du salaire
  // HEBDOMADAIRE DÉJÀ ATTEINT par ce club pour cet entraîneur (voir
  // Team.trainerSalary — la valeur escaladée par TRAINER_WEEKLY_GROWTH,
  // "devenu trop cher"), PAS le tarif fixe TRAINER_BASE_SALARY[level] d'un
  // tout nouveau candidat (voir generateCoachCandidate/_makeCoachListing
  // ci-dessus) — sinon un entraîneur congédié à un salaire déjà élevé
  // reviendrait moins cher qu'un inconnu du même niveau, ce qui n'aurait pas
  // de sens. `trainerSalary()` DOIT être lu AVANT team.fireTrainer() : une
  // fois l'entraîneur parti, elle retombe à 0 (voir Team.trainerSalary), il
  // n'y aurait alors plus rien à réduire de 30%. Une fois relistée, cette
  // annonce vit comme n'importe quel autre candidat (enchères CPU/humaines,
  // échéance...) — voir refreshCoachMarket/placeCoachBid — sans plus aucun
  // lien avec le club qui vient de le congédier.
  //
  // Règle de gameplay PARTAGÉE solo/multi-manager (contrairement aux points
  // d'entrée réseau eux-mêmes, elle vit directement ici sur League, pas
  // seulement dans server/actions.js) : appelée aussi bien par le bouton
  // "Congédier" côté navigateur en solo que par l'action serveur
  // "fireTrainer" en mode multi-manager (voir server/actions.js).
  //
  // `teamIndex` invalide (défensif, ne devrait jamais arriver côté appelants
  // réels qui résolvent déjà l'équipe avant d'appeler ceci) : no-op, renvoie
  // relisted:false plutôt que de planter. Pas d'entraîneur en poste : la
  // fonction reste un no-op complet côté marché (rien à congédier, rien à
  // relister), mais renvoie tout de même { ok: true, relisted: false } —
  // jamais une erreur, pour que l'appelant (bouton "Congédier") reste
  // simple à écrire sans avoir à distinguer ce cas.
  fireTeamTrainer(teamIndex, now) {
    const team = this.teams[teamIndex];
    if (!team) return { ok: false, relisted: false };
    const firedTrainer = team.trainer;
    const currentSalary = team.trainerSalary(); // AVANT fireTrainer() — voir commentaire ci-dessus
    team.fireTrainer();
    if (!firedTrainer) return { ok: true, relisted: false };
    const discountedStartPrice = Math.max(1, Math.round(currentSalary * 0.7));
    this._makeCoachListing(now, firedTrainer.level, discountedStartPrice);
    return { ok: true, relisted: true };
  }

  // ---------------------------------------------------------------------
  // Marché des analystes vidéo — retour utilisateur (2026-09) : "en
  // engageant un staff plus ou moins compétent, on peut voir plus ou moins
  // de caractéristiques de l'adversaire". DEUXIÈME marché de staff,
  // structurellement identique au marché des entraîneurs ci-dessus (voir
  // generateCoachCandidate/placeCoachBid/_resolveCoachListing/
  // refreshCoachMarket/fireTeamTrainer plus haut) — même mécanique
  // d'enchères en temps réel, mêmes constantes COACH_* réutilisées telles
  // quelles (COACH_AUCTION_DURATION_MS, COACH_MARKET_MIN_OPEN_LISTINGS,
  // COACH_MARKET_GENERATE_CHECK_INTERVAL_MS, COACH_CPU_BID_CHANCE) : aucune
  // raison connue de faire tourner ce marché à un rythme différent de celui
  // des entraîneurs — seul l'EFFET du staff recruté diffère (voir
  // Team.videoAnalyst/League.runVideoSession), pas la mécanique du marché
  // lui-même. Si un jour ce marché doit évoluer différemment de celui des
  // entraîneurs, lui donner ses propres constantes ANALYST_* sera trivial
  // (même forme que les COACH_* ci-dessus) — pas la peine de les dupliquer
  // par avance sans besoin réel.
  // ---------------------------------------------------------------------
  generateAnalystCandidate(now) {
    const weights = [40, 28, 18, 10, 4]; // même biais vers les niveaux bas que generateCoachCandidate
    const total = weights.reduce((s, w) => s + w, 0);
    let roll = Math.random() * total;
    let level = TRAINER_LEVELS[TRAINER_LEVELS.length - 1];
    for (let i = 0; i < weights.length; i++) {
      if (roll < weights[i]) { level = i + 1; break; }
      roll -= weights[i];
    }
    return this._makeAnalystListing(now, level, TRAINER_BASE_SALARY[level] || 0);
  }

  // Même convention de retour que placeCoachBid — voir son commentaire pour
  // le détail des reasons ("closed"/"invalid-bidder"/"too-low"/
  // "insufficient-budget"), identiques ici.
  placeAnalystBid(listingId, bidderIdx, amount, now) {
    const listing = this.analystListings.find(l => l.id === listingId);
    if (!listing || listing.status !== "open" || now >= listing.closesAt) return { ok: false, reason: "closed" };
    const bidder = this.teams[bidderIdx];
    if (!bidder) return { ok: false, reason: "invalid-bidder" };
    const minBid = minNextBidFor(listing);
    if (amount < minBid) return { ok: false, reason: "too-low", minBid };
    if (bidder.isHuman && amount > bidder.budget) return { ok: false, reason: "insufficient-budget" };
    const rounded = Math.round(amount);
    listing.currentBid = rounded;
    listing.currentBidderIdx = bidderIdx;
    listing.bids.push({ bidderIdx, amount: rounded, at: now });
    return { ok: true, listing };
  }

  // Voir _resolveCoachListing ci-dessus pour le détail du raisonnement (la
  // mise gagnante devient le salaire de départ, pas un débit ponctuel en
  // plus) — identique ici, juste appliqué à Team.hireVideoAnalyst.
  _resolveAnalystListing(listing, now) {
    listing.status = "closed";
    if (listing.currentBidderIdx == null) {
      listing.result = "unsold";
      return;
    }
    const buyerIdx = listing.currentBidderIdx;
    const buyer = this.teams[buyerIdx];
    const amount = listing.currentBid;
    if (buyer.isHuman && amount > buyer.budget) {
      listing.result = "buyer-failed";
      return;
    }
    buyer.hireVideoAnalyst(listing.level, amount);
    listing.result = "sold";
    listing.finalPrice = amount;
  }

  // À appeler au même rythme que refreshCoachMarket (chargement de la page,
  // ouverture de l'onglet Staff...) — méthode VOLONTAIREMENT distincte, même
  // esprit que refreshCoachMarket vs refreshMarket.
  refreshAnalystMarket(now) {
    this.analystListings = this.analystListings || [];

    // 1) Enchères CPU sur les candidats ouverts — "intéressée" = équipe CPU
    // sans analyste du tout, ou dont l'analyste actuel est d'un niveau
    // inférieur à celui du candidat (même esprit que refreshCoachMarket).
    this.analystListings.forEach(listing => {
      if (listing.status !== "open") return;
      if (now - (listing.lastCpuCheckAt || listing.createdAt) < COACH_MARKET_GENERATE_CHECK_INTERVAL_MS) return;
      listing.lastCpuCheckAt = now;
      this.teams.forEach((team, idx) => {
        if (team.isHuman) return; // une équipe humaine enchérit elle-même via placeAnalystBid
        if (idx === listing.currentBidderIdx) return;
        const interested = !team.videoAnalyst || team.videoAnalyst.level < listing.level;
        if (!interested) return;
        if (Math.random() >= COACH_CPU_BID_CHANCE) return;
        const minBid = minNextBidFor(listing);
        const maxWilling = Math.round((TRAINER_BASE_SALARY[listing.level] || 0) * rand(1.0, 1.5));
        if (minBid > maxWilling) return; // déjà trop cher pour cette équipe
        const bidAmount = Math.min(maxWilling, Math.round(minBid * rand(1, 1.15)));
        listing.currentBid = bidAmount;
        listing.currentBidderIdx = idx;
        listing.bids.push({ bidderIdx: idx, amount: bidAmount, at: now });
      });
    });

    // 2) Renouvelle les candidats pour garder au moins
    // COACH_MARKET_MIN_OPEN_LISTINGS annonces ouvertes en permanence — même
    // plancher que le marché des entraîneurs (voir son commentaire), pour la
    // même raison (personne ne "vend" spontanément son analyste).
    if (now - (this.lastAnalystGenerationCheckAt || 0) >= COACH_MARKET_GENERATE_CHECK_INTERVAL_MS) {
      this.lastAnalystGenerationCheckAt = now;
      let openCount = this.analystListings.filter(l => l.status === "open").length;
      while (openCount < COACH_MARKET_MIN_OPEN_LISTINGS) {
        this.generateAnalystCandidate(now);
        openCount++;
      }
    }

    // 3) Résout toute enchère dont l'échéance est dépassée.
    this.analystListings
      .filter(l => l.status === "open" && now >= l.closesAt)
      .forEach(listing => this._resolveAnalystListing(listing, now));
  }

  // Congédie l'analyste vidéo de `teamIndex` et le remet AUSSITÔT sur le
  // marché des analystes, à un prix de départ réduit — EXACTEMENT le même
  // mécanisme que fireTeamTrainer ci-dessus (voir son commentaire pour le
  // détail complet du raisonnement, identique ici) : prix de départ = 70%
  // du salaire HEBDOMADAIRE DÉJÀ ATTEINT (lu AVANT fireVideoAnalyst(),
  // sinon il n'y aurait plus rien à réduire), borné à 1 minimum. Même
  // convention de retour : { ok: true, relisted: boolean } (jamais une
  // erreur, y compris `teamIndex` invalide ou aucun analyste en poste).
  // Appelée aussi bien par le bouton "Congédier" du panneau analyste côté
  // navigateur en solo que par l'action serveur "fireVideoAnalyst" en mode
  // multi-manager (voir server/actions.js).
  fireTeamVideoAnalyst(teamIndex, now) {
    const team = this.teams[teamIndex];
    if (!team) return { ok: false, relisted: false };
    const firedAnalyst = team.videoAnalyst;
    const currentSalary = team.videoAnalystSalary(); // AVANT fireVideoAnalyst() — voir commentaire ci-dessus
    team.fireVideoAnalyst();
    if (!firedAnalyst) return { ok: true, relisted: false };
    const discountedStartPrice = Math.max(1, Math.round(currentSalary * 0.7));
    this._makeAnalystListing(now, firedAnalyst.level, discountedStartPrice);
    return { ok: true, relisted: true };
  }

  // ---------------------------------------------------------------------
  // Marché des recruteurs — TROISIÈME marché de staff, structurellement
  // identique aux marchés de l'entraîneur/de l'analyste vidéo ci-dessus (voir
  // generateCoachCandidate/placeCoachBid/_resolveCoachListing/
  // refreshCoachMarket/fireTeamTrainer, et leur pendant analyste) — mêmes
  // constantes COACH_* réutilisées telles quelles (aucune raison connue de
  // faire tourner ce marché à un rythme différent). Seul l'EFFET du staff
  // recruté diffère (voir Team.recruiter/refreshYouthCandidates ci-dessus),
  // pas la mécanique du marché lui-même.
  // ---------------------------------------------------------------------
  _makeRecruiterListing(now, level, startPrice) {
    const listing = this._makeStaffListing(now, level, startPrice);
    this.recruiterListings.push(listing);
    return listing;
  }

  generateRecruiterCandidate(now) {
    const weights = [40, 28, 18, 10, 4]; // même biais vers les niveaux bas que generateCoachCandidate
    const total = weights.reduce((s, w) => s + w, 0);
    let roll = Math.random() * total;
    let level = TRAINER_LEVELS[TRAINER_LEVELS.length - 1];
    for (let i = 0; i < weights.length; i++) {
      if (roll < weights[i]) { level = i + 1; break; }
      roll -= weights[i];
    }
    return this._makeRecruiterListing(now, level, TRAINER_BASE_SALARY[level] || 0);
  }

  // Même convention de retour que placeCoachBid/placeAnalystBid — voir leur
  // commentaire pour le détail des reasons ("closed"/"invalid-bidder"/
  // "too-low"/"insufficient-budget"), identiques ici.
  placeRecruiterBid(listingId, bidderIdx, amount, now) {
    const listing = this.recruiterListings.find(l => l.id === listingId);
    if (!listing || listing.status !== "open" || now >= listing.closesAt) return { ok: false, reason: "closed" };
    const bidder = this.teams[bidderIdx];
    if (!bidder) return { ok: false, reason: "invalid-bidder" };
    const minBid = minNextBidFor(listing);
    if (amount < minBid) return { ok: false, reason: "too-low", minBid };
    if (bidder.isHuman && amount > bidder.budget) return { ok: false, reason: "insufficient-budget" };
    const rounded = Math.round(amount);
    listing.currentBid = rounded;
    listing.currentBidderIdx = bidderIdx;
    listing.bids.push({ bidderIdx, amount: rounded, at: now });
    return { ok: true, listing };
  }

  // Voir _resolveCoachListing pour le détail du raisonnement (la mise
  // gagnante devient le salaire de départ, pas un débit ponctuel en plus) —
  // identique ici, juste appliqué à Team.hireRecruiter.
  _resolveRecruiterListing(listing, now) {
    listing.status = "closed";
    if (listing.currentBidderIdx == null) {
      listing.result = "unsold";
      return;
    }
    const buyerIdx = listing.currentBidderIdx;
    const buyer = this.teams[buyerIdx];
    const amount = listing.currentBid;
    if (buyer.isHuman && amount > buyer.budget) {
      listing.result = "buyer-failed";
      return;
    }
    buyer.hireRecruiter(listing.level, amount);
    listing.result = "sold";
    listing.finalPrice = amount;
  }

  // À appeler au même rythme que refreshCoachMarket/refreshAnalystMarket
  // (chargement de la page, ouverture de l'onglet Staff...).
  refreshRecruiterMarket(now) {
    this.recruiterListings = this.recruiterListings || [];

    // 1) Enchères CPU sur les candidats ouverts — "intéressée" = équipe CPU
    // sans recruteur du tout, ou dont le recruteur actuel est d'un niveau
    // inférieur à celui du candidat (même esprit que refreshCoachMarket).
    this.recruiterListings.forEach(listing => {
      if (listing.status !== "open") return;
      if (now - (listing.lastCpuCheckAt || listing.createdAt) < COACH_MARKET_GENERATE_CHECK_INTERVAL_MS) return;
      listing.lastCpuCheckAt = now;
      this.teams.forEach((team, idx) => {
        if (team.isHuman) return; // une équipe humaine enchérit elle-même via placeRecruiterBid
        if (idx === listing.currentBidderIdx) return;
        const interested = !team.recruiter || team.recruiter.level < listing.level;
        if (!interested) return;
        if (Math.random() >= COACH_CPU_BID_CHANCE) return;
        const minBid = minNextBidFor(listing);
        const maxWilling = Math.round((TRAINER_BASE_SALARY[listing.level] || 0) * rand(1.0, 1.5));
        if (minBid > maxWilling) return; // déjà trop cher pour cette équipe
        const bidAmount = Math.min(maxWilling, Math.round(minBid * rand(1, 1.15)));
        listing.currentBid = bidAmount;
        listing.currentBidderIdx = idx;
        listing.bids.push({ bidderIdx: idx, amount: bidAmount, at: now });
      });
    });

    // 2) Renouvelle les candidats pour garder au moins
    // COACH_MARKET_MIN_OPEN_LISTINGS annonces ouvertes en permanence — même
    // plancher que les deux autres marchés de staff.
    if (now - (this.lastRecruiterGenerationCheckAt || 0) >= COACH_MARKET_GENERATE_CHECK_INTERVAL_MS) {
      this.lastRecruiterGenerationCheckAt = now;
      let openCount = this.recruiterListings.filter(l => l.status === "open").length;
      while (openCount < COACH_MARKET_MIN_OPEN_LISTINGS) {
        this.generateRecruiterCandidate(now);
        openCount++;
      }
    }

    // 3) Résout toute enchère dont l'échéance est dépassée.
    this.recruiterListings
      .filter(l => l.status === "open" && now >= l.closesAt)
      .forEach(listing => this._resolveRecruiterListing(listing, now));
  }

  // Congédie le recruteur de `teamIndex` et le remet AUSSITÔT sur le marché
  // des recruteurs, à un prix de départ réduit — EXACTEMENT le même
  // mécanisme que fireTeamTrainer/fireTeamVideoAnalyst ci-dessus (voir leur
  // commentaire pour le détail complet du raisonnement, identique ici) :
  // prix de départ = 70% du salaire HEBDOMADAIRE DÉJÀ ATTEINT (lu AVANT
  // fireRecruiter(), sinon il n'y aurait plus rien à réduire), borné à 1
  // minimum. Même convention de retour : { ok: true, relisted: boolean }.
  fireTeamRecruiter(teamIndex, now) {
    const team = this.teams[teamIndex];
    if (!team) return { ok: false, relisted: false };
    const firedRecruiter = team.recruiter;
    const currentSalary = team.recruiterSalary(); // AVANT fireRecruiter() — voir commentaire ci-dessus
    team.fireRecruiter();
    if (!firedRecruiter) return { ok: true, relisted: false };
    const discountedStartPrice = Math.max(1, Math.round(currentSalary * 0.7));
    this._makeRecruiterListing(now, firedRecruiter.level, discountedStartPrice);
    return { ok: true, relisted: true };
  }

  // ---------------------------------------------------------------------
  // Séance vidéo (retour utilisateur, 2026-09) : "il faudrait pouvoir
  // scouter l'effectif de son adversaire. L'idée est d'avoir une vue au
  // moins sur les salaires, taille, poste... mais pas sur les
  // caractéristiques. En engageant un staff plus ou moins compétent, on
  // peut voir plus ou moins de caractéristiques de l'adversaire en faisant
  // une séance vidéo de l'adversaire." Action DÉLIBÉRÉE et ponctuelle par
  // adversaire choisi par le manager (pas une révélation passive
  // permanente) : nom/poste/taille/salaire restent, eux, TOUJOURS visibles
  // pour n'importe quel adversaire, sans staff — c'est uniquement l'accès
  // aux 10 caractéristiques (ATTRS) qui est gating derrière cette séance.
  //
  // Plafonnée à UNE séance par jour CIVIL à Paris (tous adversaires
  // confondus pour ce club — voir Team.lastVideoSessionAt et
  // sameParisCalendarDay plus bas dans ce fichier, qui réutilise
  // directement parisLocalDateParts) : même ancrage "jour civil" que le
  // reste du rythme quotidien entraînement/économie de la ligue
  // multi-manager (voir le grand bloc "CALENDRIER ANCRÉ QUOTIDIEN" plus bas)
  // plutôt qu'une fenêtre glissante de 24h, pour rester cohérent avec cette
  // même notion de "jour" partout ailleurs dans le jeu.
  //
  // Nombre de caractéristiques révélées = ANALYST_REVEAL_COUNT_BY_LEVEL[level]
  // (voir cette constante plus haut, à côté de TRAINER_LEVELS — plafonné
  // volontairement SOUS 10, retour utilisateur : "il faut trouver un système
  // qui ne permet pas de voir toutes les caractéristiques des joueurs sinon
  // c'est trop facile"). Le choix des caractéristiques révélées parmi les 10
  // est tiré au sort (shuffleIndices — comme le reste du moteur, jamais de
  // générateur seedé, testable en figeant Math.random()) plutôt qu'un ordre
  // fixe : rien dans la demande utilisateur n'indique qu'un type de
  // caractéristique devrait systématiquement sortir avant un autre.
  //
  // Renvoie { ok: true, opponentIdx, revealed, analystLevel } ou
  // { ok: false, reason } — reasons : "invalid-team" (défensif, teamIndex
  // hors bornes), "no-analyst" (aucun analyste sous contrat),
  // "already-scouted" (CET adversaire a déjà été scouté cette saison — voir
  // plus bas), "cooldown" (une séance a déjà été utilisée aujourd'hui, pour
  // un AUTRE adversaire pas encore scouté), "invalid-opponent" (index hors
  // bornes ou égal à teamIndex — on ne scoute pas sa propre équipe).
  //
  // Un même adversaire ne peut être scouté qu'UNE SEULE FOIS PAR SAISON,
  // point final (retour utilisateur, 2026-09 : "un même adversaire ne doit
  // pouvoir être scouté qu'une fois par saison parce que sinon en PO chacun
  // connaît les caracs de l'autre et c'est pas le but") — DÈS que
  // Team.scoutedAttrs[opponentIdx] contient au moins une entrée, toute
  // NOUVELLE séance vidéo contre CE MÊME adversaire est refusée
  // ("already-scouted"), pour le reste de la saison, MÊME des jours/semaines
  // plus tard (contrairement au cooldown quotidien ci-dessous, qui lui EST
  // temporaire), et MÊME si l'analyste est entre-temps monté en niveau — un
  // meilleur analyste débloque plus de caractéristiques sur un NOUVEL
  // adversaire, jamais plus sur un adversaire déjà scouté (l'ancienne
  // logique d'UNION entre deux séances sur le même adversaire a donc
  // disparu : elle est désormais inatteignable, une 2e séance sur le même
  // adversaire étant toujours rejetée avant même d'atteindre ce calcul).
  // Remise à zéro naturelle à chaque nouvelle saison (Team.scoutedAttrs fait
  // partie de l'état Team, régénéré comme le reste — voir generateLeague).
  //
  // Cooldown quotidien INCHANGÉ par ailleurs (voir Team.lastVideoSessionAt/
  // sameParisCalendarDay) : sert uniquement à limiter le RYTHME (un NOUVEL
  // adversaire scouté par jour civil à Paris maximum, tous adversaires
  // confondus) — pas à autoriser une 2e séance sur un adversaire déjà
  // scouté une fois ce cooldown écoulé, c'est justement ce que
  // "already-scouted" empêche en permanence, indépendamment du temps passé.
  runVideoSession(teamIndex, opponentIdx, now) {
    const team = this.teams[teamIndex];
    if (!team) return { ok: false, reason: "invalid-team" };
    if (!team.videoAnalyst) return { ok: false, reason: "no-analyst" };
    if (opponentIdx === teamIndex || !this.teams[opponentIdx]) return { ok: false, reason: "invalid-opponent" };
    const key = String(opponentIdx);
    if (team.scoutedAttrs[key] && team.scoutedAttrs[key].length > 0) {
      return { ok: false, reason: "already-scouted" };
    }
    if (team.lastVideoSessionAt != null && sameParisCalendarDay(team.lastVideoSessionAt, now)) {
      return { ok: false, reason: "cooldown" };
    }
    const level = team.videoAnalyst.level;
    const revealCount = ANALYST_REVEAL_COUNT_BY_LEVEL[level] || 0;
    // Tirage frais dans ATTRS — jamais d'union à faire avec un éventuel
    // scoutage précédent : la garde "already-scouted" ci-dessus garantit
    // qu'on n'atteint jamais ce point pour un adversaire déjà scouté.
    const drawn = shuffleIndices(ATTRS).slice(0, revealCount);
    // Ordre stable (celui d'ATTRS) plutôt que l'ordre de tirage — plus
    // lisible côté UI (mêmes colonnes toujours dans le même ordre d'une
    // équipe à l'autre).
    const revealed = ATTRS.filter(a => drawn.includes(a));
    team.scoutedAttrs[key] = revealed;
    team.lastVideoSessionAt = now;
    return { ok: true, opponentIdx, revealed, analystLevel: level };
  }
}

// Calcule la prime de fin de saison à verser au club du joueur d'après le
// résultat de la saison (voir League.divisionOutcomeForUserTeam ci-dessus) :
// montée = prime de montée fonction de la division D'ARRIVÉE (voir
// PROMOTION_BONUS_BY_LEVEL), champion de Division I sans montée possible =
// prime de champion, plus modeste (voir CHAMPION_BONUS_DIVISION_I). Renvoie
// `null` si aucune prime n'est due (relégation, ou maintien sans titre).
function seasonEndBonusFor(outcome) {
  if (outcome.outcome === "promoted") {
    return { label: `Prime de montée (${divisionInfo(outcome.toLevel).name})`, amount: PROMOTION_BONUS_BY_LEVEL[outcome.toLevel] || PROMOTION_BONUS_FLOOR };
  }
  if (outcome.championDivisionI) {
    return { label: "Prime de champion (Division I)", amount: CHAMPION_BONUS_DIVISION_I };
  }
  return null;
}

// ---------------------------------------------------------------------
// Objectif de saison du conseil d'administration (retour utilisateur,
// 2026-09) : "En début de saison, le conseil d'administration doit donner
// un objectif de classement (maintien, milieu de tableau, PO, finale,
// titre). [...] Si l'objectif n'est pas respecté pendant la saison, cela
// impact l'humeur des supporters. Une équipe qui est dernière alors qu'elle
// devait jouer la finale, doit voir ses supporters mécontents. L'objectif
// du CA doit être posé sur base du niveau des différentes équipes du
// championnat."
//
// Conception : `assignSeasonObjectives` (appelée par
// buildLeagueWithHumanTeams, donc pour toute nouvelle carrière ET chaque
// nouvelle saison, humaine ou CPU) classe les 10 équipes de la ligue par
// force pré-saison (Team.averageOverall) et découpe ce classement en 5
// paliers de 2 équipes, du plus faible (Team.seasonObjective = "maintien")
// au plus fort ("titre") : c'est la lecture la plus directe de "posé sur
// base du niveau des différentes équipes du championnat". `seasonObjective`
// reste figé tout le reste de la saison (jamais recalculé en cours de
// route), et le verdict n'est établi qu'une fois la saison ENTIÈREMENT
// terminée (saison régulière + barrage de relégation + play-offs jusqu'au
// champion, voir seasonAchievementTier) : c'est à ce moment-là,
// symétriquement à League.divisionOutcomeForUserTeam/seasonEndBonusFor déjà
// résolus au même endroit (voir startNewSeason côté moteurbasket3.html),
// que seasonObjectiveVerdict compare l'ambition de départ au résultat réel
// et calcule l'impact sur l'humeur des supporters (Team.recordMoraleEvent),
// exactement l'exemple donné : une équipe attendue en finale qui termine
// reléguée doit voir ses supporters mécontents.
const SEASON_OBJECTIVE_TIERS = { "maintien": 1, "milieu-tableau": 2, "playoffs": 3, "finale": 4, "titre": 5 };
const SEASON_OBJECTIVE_LABELS = {
  "maintien": "Maintien",
  "milieu-tableau": "Milieu de tableau",
  "playoffs": "Qualification en play-offs",
  "finale": "Finale des play-offs",
  "titre": "Titre de champion",
};
// Ce que l'équipe a RÉELLEMENT obtenu à l'issue de la saison, sur la même
// échelle ordinale que SEASON_OBJECTIVE_TIERS (0 = pire que le pire
// objectif possible, la relégation, jamais elle-même une aspiration) : voir
// seasonAchievementTier pour le calcul.
const SEASON_ACHIEVEMENT_LABELS = {
  0: "une relégation",
  1: "un maintien tout juste assuré",
  2: "une saison milieu de tableau",
  3: "une élimination en demi-finale des play-offs",
  4: "une finale des play-offs perdue",
  5: "le titre de champion",
};
// Barème de l'impact sur l'humeur des supporters (voir
// Team.recordMoraleEvent), fonction de l'écart entre le palier visé
// (SEASON_OBJECTIVE_TIERS) et le palier réellement atteint
// (seasonAchievementTier) : un objectif manqué coûte plus cher, par palier
// d'écart, qu'un objectif dépassé n'en rapporte (les supporters sont plus
// sévères face à un échec qu'indulgents face à une bonne surprise, même
// logique que MILESTONE_INTERVIEW_TONES fanWin/fanLoss). Un objectif
// exactement atteint (écart nul) rapporte un petit bonus : le mérite d'avoir
// fait ce qui était demandé, ni plus ni moins.
const SEASON_OBJECTIVE_MISS_MALUS_PER_TIER = 6;
const SEASON_OBJECTIVE_EXCEED_BONUS_PER_TIER = 4;
const SEASON_OBJECTIVE_MET_BONUS = 3;

// Classe les 10 équipes de `league` par force pré-saison (Team.
// averageOverall décroissant) et assigne à CHACUNE (pas seulement l'équipe
// du joueur : voir la généralisation multi-manager déjà en place ailleurs
// dans ce fichier) l'un des 5 paliers de SEASON_OBJECTIVE_TIERS, par
// tranches de 2 (rangs 1-2 -> "titre", ..., rangs 9-10 -> "maintien").
// Appelée une seule fois, à la création/régénération de la ligue (voir
// buildLeagueWithHumanTeams, seul appelant), jamais recalculée en cours de
// saison.
function assignSeasonObjectives(league) {
  const tierKeysStrongToWeak = ["titre", "finale", "playoffs", "milieu-tableau", "maintien"];
  const ranked = league.teams
    .map((t, idx) => ({ idx, avg: t.averageOverall() }))
    .sort((a, b) => b.avg - a.avg);
  ranked.forEach((entry, rankIdx) => {
    const tierIndex = Math.min(tierKeysStrongToWeak.length - 1, Math.floor(rankIdx / 2));
    league.teams[entry.idx].seasonObjective = tierKeysStrongToWeak[tierIndex];
  });
}

// Ce que l'équipe `teamIdx` a RÉELLEMENT obtenu à l'issue de la saison,
// 0 à 5 sur la même échelle que SEASON_OBJECTIVE_TIERS (voir
// SEASON_ACHIEVEMENT_LABELS pour le libellé de chaque valeur) : la
// relégation prime sur tout le reste (0, même pour une équipe par ailleurs
// allée loin en Coupe ou bien classée avant le barrage), sinon le parcours
// en play-offs (champion 5, finaliste 4, éliminé en demi-finale 3), sinon
// le classement de saison régulière (rang 5-6 -> 2 "milieu de tableau",
// rang 7-8 -> 1 "maintien", ces deux-là ayant nécessairement évité la
// relégation pour arriver jusqu'ici, voir la garde tout en haut). `null` si
// la saison n'est pas encore ENTIÈREMENT terminée (pas de play-offs, ou
// champion pas encore connu, voir League.isPlayoffsDone) : appeler cette
// fonction plus tôt donnerait un verdict prématuré et faux.
function seasonAchievementTier(league, teamIdx) {
  if (!league.playoffs || league.playoffs.champion == null) return null;
  if (league.relegatedTeamIndexes().includes(teamIdx)) return 0;
  const po = league.playoffs;
  if (po.champion === teamIdx) return 5;
  if (po.finalSeries && po.finalSeries.resolved && (po.finalSeries.idxA === teamIdx || po.finalSeries.idxB === teamIdx)) return 4;
  for (const series of po.series) {
    if (series.resolved && (series.idxA === teamIdx || series.idxB === teamIdx) && series.winner !== teamIdx) return 3;
  }
  const rank = league.standings().findIndex(s => s.idx === teamIdx) + 1; // 1-10
  return rank <= 6 ? 2 : 1;
}

// Verdict complet de fin de saison pour `teamIdx` (objectif du CA vs
// résultat réel, voir le grand commentaire de SEASON_OBJECTIVE_TIERS
// au-dessus) : fonction PURE (aucune mutation, contrairement à
// Team.recordMoraleEvent), utilisée à la fois pour l'AFFICHAGE (voir
// renderSeasonEnd/renderHumeurSection côté moteurbasket3.html, appelée à
// chaque rendu, purement en lecture) et pour l'APPLICATION réelle (voir
// startNewSeason côté moteurbasket3.html, qui appelle ENSUITE
// Team.recordMoraleEvent(verdict.label, verdict.delta) avec le résultat),
// même patron que seasonEndBonusFor/Team.recordTransaction juste au-dessus.
// Renvoie `null` si l'équipe n'a pas encore d'objectif assigné, ou si la
// saison n'est pas encore terminée (voir seasonAchievementTier).
function seasonObjectiveVerdict(league, teamIdx) {
  const team = league.teams[teamIdx];
  if (!team || !team.seasonObjective) return null;
  const achievedTier = seasonAchievementTier(league, teamIdx);
  if (achievedTier == null) return null;
  const objective = team.seasonObjective;
  const objectiveTier = SEASON_OBJECTIVE_TIERS[objective];
  const gap = objectiveTier - achievedTier; // > 0 = objectif manqué, <= 0 = atteint ou dépassé
  const delta = gap > 0
    ? -SEASON_OBJECTIVE_MISS_MALUS_PER_TIER * gap
    : SEASON_OBJECTIVE_MET_BONUS + SEASON_OBJECTIVE_EXCEED_BONUS_PER_TIER * (-gap);
  const achievedLabel = SEASON_ACHIEVEMENT_LABELS[achievedTier];
  const objectiveLabel = SEASON_OBJECTIVE_LABELS[objective];
  const label = gap > 0
    ? `Objectif de la saison manqué (${objectiveLabel}) : l'équipe termine avec ${achievedLabel}. Les supporters sont déçus.`
    : gap === 0
      ? `Objectif de la saison rempli (${objectiveLabel}) : l'équipe termine avec ${achievedLabel}, exactement ce qui était demandé.`
      : `Objectif de la saison largement dépassé (${objectiveLabel} espéré) : l'équipe termine avec ${achievedLabel} ! Les supporters sont aux anges.`;
  return { objective, objectiveTier, achievedTier, achievedLabel, gap, delta, label };
}

// ---------------------------------------------------------------------
// Signal de MI-SAISON pour l'objectif du conseil d'administration (retour
// utilisateur, 2026-09, en complément du verdict de fin de saison ci-dessus :
// "Ajoute un signal à la mi saison ouais ça serait pas mal") : contrairement
// à seasonObjectiveVerdict, aucun résultat définitif n'existe encore à la
// mi-saison (round = midSeasonRound, voir milestoneTypeForRound plus haut) :
// ni classement final, ni barrage de relégation, ni play-offs. On se
// contente donc de comparer le classement PROVISOIRE actuel
// (League.standings(), à cet instant précis de la saison régulière) à
// l'objectif du CA (Team.seasonObjective), avec EXACTEMENT le même découpage
// par tranches de 2 équipes que assignSeasonObjectives (rangs 1-2 -> "titre",
// ..., rangs 9-10 -> "maintien") : réutilise ainsi la même échelle
// (SEASON_OBJECTIVE_TIERS/SEASON_OBJECTIVE_LABELS) plutôt que d'inventer de
// nouveaux seuils arbitraires à mi-parcours. Impact sur l'humeur des
// supporters volontairement plus modeste qu'un verdict de fin de saison
// (voir les constantes MIDSEASON_* ci-dessous, environ moitié moindres) :
// un simple avertissement/encouragement à mi-parcours plutôt qu'un second
// jugement aussi sévère que le verdict final, qui reste la vraie sanction/
// récompense (évite de compter deux fois le même écart).
const SEASON_OBJECTIVE_MIDSEASON_MISS_MALUS_PER_TIER = 3;
const SEASON_OBJECTIVE_MIDSEASON_EXCEED_BONUS_PER_TIER = 2;
const SEASON_OBJECTIVE_MIDSEASON_MET_BONUS = 1;

// Palier de classement ACTUEL (une des clés de SEASON_OBJECTIVE_TIERS) pour
// `teamIdx`, d'après son rang dans League.standings() À CET INSTANT (donc
// utilisable EN COURS de saison régulière, contrairement à
// seasonAchievementTier qui exige la saison entièrement terminée) : même
// découpage par tranches de 2 que assignSeasonObjectives (rangs 1-2 ->
// "titre", ..., rangs 9-10 -> "maintien"). `null` si `teamIdx` est introuvable
// dans le classement (garde défensive, ne devrait jamais arriver en pratique).
function currentStandingsPaceObjective(league, teamIdx) {
  const tierKeysStrongToWeak = ["titre", "finale", "playoffs", "milieu-tableau", "maintien"];
  const rank = league.standings().findIndex(s => s.idx === teamIdx) + 1; // 1-10, 0 si absent
  if (rank <= 0) return null;
  const tierIndex = Math.min(tierKeysStrongToWeak.length - 1, Math.floor((rank - 1) / 2));
  return tierKeysStrongToWeak[tierIndex];
}

// Signal de mi-saison complet pour `teamIdx` (objectif du CA vs classement
// PROVISOIRE actuel) : même forme que seasonObjectiveVerdict ci-dessus
// (fonction PURE, aucune mutation), à appliquer par l'appelant via
// Team.recordMoraleEvent(signal.label, signal.delta), voir
// server/liveMatch.js:finalizeRound, seul appelant en production, qui
// l'applique pour CHAQUE équipe humaine impliquée dans la journée de
// mi-saison (solo comme multi-manager). Renvoie `null` si l'équipe n'a pas
// encore d'objectif assigné, ou si son rang est introuvable dans le
// classement (voir currentStandingsPaceObjective).
function seasonObjectiveMidSeasonSignal(league, teamIdx) {
  const team = league.teams[teamIdx];
  if (!team || !team.seasonObjective) return null;
  const paceObjective = currentStandingsPaceObjective(league, teamIdx);
  if (!paceObjective) return null;
  const objective = team.seasonObjective;
  const objectiveTier = SEASON_OBJECTIVE_TIERS[objective];
  const paceTier = SEASON_OBJECTIVE_TIERS[paceObjective];
  const gap = objectiveTier - paceTier; // > 0 = en dessous de l'objectif, <= 0 = sur la bonne voie ou au-dessus
  const delta = gap > 0
    ? -SEASON_OBJECTIVE_MIDSEASON_MISS_MALUS_PER_TIER * gap
    : SEASON_OBJECTIVE_MIDSEASON_MET_BONUS + SEASON_OBJECTIVE_MIDSEASON_EXCEED_BONUS_PER_TIER * (-gap);
  const objectiveLabel = SEASON_OBJECTIVE_LABELS[objective];
  const paceLabel = SEASON_OBJECTIVE_LABELS[paceObjective];
  const label = gap > 0
    ? `Mi-saison : le rythme actuel (${paceLabel}) est en dessous de l'objectif (${objectiveLabel}). Les supporters s'inquiètent déjà.`
    : gap === 0
      ? `Mi-saison : le rythme actuel colle exactement à l'objectif (${objectiveLabel}). Les supporters restent confiants.`
      : `Mi-saison : le rythme actuel (${paceLabel}) dépasse largement l'objectif (${objectiveLabel} espéré). Les supporters sont optimistes.`;
  return { objective, objectiveTier, paceObjective, paceTier, gap, delta, label };
}

// Génère une ligue complète : le club du joueur (déjà créé) + 9 adversaires
// neufs, de force à peu près comparable (légère variation aléatoire). Sans
// niveau de division précisé, on démarre le plus haut possible dans la
// pyramide (Division I) : une nouvelle carrière n'est encore assignée nulle
// part, donc elle prend la place la plus haute disponible plutôt que de
// partir du bas.
//
// NOTE DE CONCEPTION (2026-09, confirmé par l'utilisateur) : ce placement en
// haut de la pyramide est voulu pour la phase actuelle du projet (prototype
// solo, un seul manager réel — le joueur — face à des adversaires générés,
// aucune autre ligue de la pyramide n'étant réellement peuplée/simulée). La
// logique visée pour plus tard, une fois un vrai système multi-utilisateurs
// en place (plusieurs vrais managers, plusieurs ligues par division, un pays
// par pyramide) : au tout début, quand une pyramide ne compte encore aucun
// manager, on peuple PAR LE HAUT (Division I d'abord) pour amorcer le monde ;
// ensuite, une fois des managers déjà en place, un nouveau venu doit plutôt
// atterrir en bas (Division V/VI), le niveau exact dépendant du pays et du
// nombre de managers déjà inscrits dans SA pyramide — jamais recommencer en
// Division I par défaut comme aujourd'hui. Cette logique de placement des
// nouveaux venus n'est pas encore implémentée ici : elle suppose un vrai
// backend multi-ligues/multi-pays qui n'existe pas dans ce prototype (à
// construire quand ce système-là sera à l'ordre du jour).
// ---------------------------------------------------------------------
// CALENDRIER RÉEL — copie CLIENT de la formule pure de server/calendar.js
// (2 matchs de championnat/semaine réelle), pour que moteurbasket3.html
// puisse afficher un compte à rebours ("Prochain match dans Xj Xh") SANS
// dépendre du serveur pour ce simple calcul d'affichage. Ce module
// (engine.js) est ce qui est réellement embarqué côté navigateur (voir la
// synchronisation avec moteurbasket3.html) ; server/calendar.js, lui, reste
// le module autoritaire réellement utilisé par le serveur pour décider
// quand une journée est due (voir server/autoSim.js) — CES DEUX COPIES
// DOIVENT RESTER IDENTIQUES, voir le test croisé dans server/calendar_test.js
// qui compare directement les deux implémentations sur une plage de
// journées.
//
// Le navigateur n'a PAS besoin de recalculer lui-même si un match est "en
// direct" (voir MATCH_BROADCAST_DURATION_MS côté serveur) : c'est le
// serveur qui calcule et stocke la diffusion (`league.liveMatch`, voir
// server/liveMatch.js/serializeLeague ci-dessous) — le navigateur se
// contente de vérifier sa présence pour la journée en préparation.
// ---------------------------------------------------------------------
const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;
// Calendrier CLASSIQUE (calendrier réel de production) — 2 matchs de
// championnat par semaine réelle, espacés (pas dos à dos). Reste la valeur
// par défaut pour toute ligue qui ne précise pas explicitement un autre
// rythme (voir League.calendarWeekMs/calendarSlotOffsetsMs ci-dessus, et
// generateLeague ci-dessous) — en particulier pour toutes les anciennes
// sauvegardes (calendarWeekMs === null).
const CALENDAR_WEEK_MS = 7 * CALENDAR_DAY_MS;
const CALENDAR_CHAMPIONSHIP_SLOT_OFFSETS_MS = [2 * CALENDAR_DAY_MS, 5 * CALENDAR_DAY_MS];
const CALENDAR_ROUNDS_PER_REAL_WEEK = CALENDAR_CHAMPIONSHIP_SLOT_OFFSETS_MS.length;

// `weekMs`/`slotOffsetsMs` explicites (au lieu des constantes CLASSIQUES
// ci-dessus directement) : c'est ce qui permet à une ligue individuelle de
// tourner sur un rythme différent (voir League.calendarWeekMs/
// calendarSlotOffsetsMs, mode accéléré de test côté serveur) sans jamais
// changer cette formule elle-même — CALENDAR_ROUNDS_PER_REAL_WEEK (le
// NOMBRE de matchs par semaine), lui, ne varie jamais d'un mode à l'autre.
function calendarScheduledTimeForRound(calendarStartAt, round, weekMs = CALENDAR_WEEK_MS, slotOffsetsMs = CALENDAR_CHAMPIONSHIP_SLOT_OFFSETS_MS) {
  const week = Math.floor(round / CALENDAR_ROUNDS_PER_REAL_WEEK);
  const slot = round % CALENDAR_ROUNDS_PER_REAL_WEEK;
  return calendarStartAt + week * weekMs + slotOffsetsMs[slot];
}

// Ancre calendarStartAt sur un horaire "propre" (minuit) UNIQUEMENT quand le
// rythme de calendrier tient dans EXACTEMENT une journée (weekMs ===
// CALENDAR_DAY_MS) — ce qui n'est PAS le cas du mode accéléré actuel (voir
// server/calendar.js "MODE ACCÉLÉRÉ", un intervalle glissant de 5h entre
// matchs, weekMs = 10h) : cette fonction ne s'y déclenche donc jamais et
// calendarStartAt y reste l'instant de création exact, ce qui est
// EXACTEMENT ce qu'on veut pour un intervalle glissant (le 1er match tombe
// systématiquement "dans 5h", quelle que soit l'heure de création — pas
// d'ancrage sur une heure de la journée à respecter). Cette fonction reste
// utile si un futur rythme redevenait "N matchs répartis sur UNE journée à
// heures fixes" façon calendrier (ex. 10h/15h, l'ancienne version de ce mode
// accéléré, retour utilisateur 2026-09) : sans cet ancrage sur minuit, les
// créneaux tomberaient à un horaire arbitraire dépendant de l'instant EXACT
// de création (une carrière créée à 14h52 se serait retrouvée avec un 1er
// match à minuit 52 le lendemain plutôt qu'à 10h comme annoncé). L'ancrage
// se fait sur minuit en heure LOCALE de la machine qui exécute ce code — ce
// qui est correct pour un usage solo/local (client et serveur tournent sur
// la même machine, donc le même fuseau horaire), mais resterait à revoir
// pour un vrai multijoueur hébergé (voir server/README.md, "Prochaines
// étapes"). Si le 1er créneau du jour est déjà passé au moment de la
// création, bascule sur le jour suivant pour que le tout premier match
// reste à venir plutôt que déjà écoulé dès la création. Ne change RIEN au
// calendrier classique (semaine de 7 jours) : celui-ci garde l'instant de
// création exact, comme avant.
function anchoredCalendarStartAt(now, calendarConfig) {
  if (!calendarConfig || calendarConfig.weekMs !== CALENDAR_DAY_MS) return now;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  let startOfDay = d.getTime();
  const firstSlotOffset = Array.isArray(calendarConfig.slotOffsetsMs) ? calendarConfig.slotOffsetsMs[0] : 0;
  if (startOfDay + firstSlotOffset <= now) startOfDay += CALENDAR_DAY_MS;
  return startOfDay;
}

// ---------------------------------------------------------------------
// CALENDRIER ANCRÉ QUOTIDIEN — copie CÔTÉ NAVIGATEUR des mêmes formules
// pures que server/calendar.js ("CALENDRIER ANCRÉ QUOTIDIEN", voir le grand
// commentaire là-bas pour pourquoi ce rythme n'est PAS exprimable en simple
// décalage ms fixe comme calendarScheduledTimeForRound ci-dessus) —
// nécessaire au navigateur pour afficher un horaire/compte à rebours de la
// ligue multi-manager sans dépendre du réseau. CES DEUX COPIES DOIVENT
// RESTER IDENTIQUES (voir le test croisé dans server/calendar_test.js, sur
// des dates choisies de part et d'autre d'un changement d'heure à Paris).
// ---------------------------------------------------------------------
const CALENDAR_PARIS_TIME_ZONE = "Europe/Paris";
const CALENDAR_DAILY_ANCHORED_CHAMPIONSHIP_HOURS = [10, 19];
const CALENDAR_DAILY_ANCHORED_CUP_HOUR = 15;

// Jour civil visé pour le "jour 0" (voir dailyAnchoredCalendarStartAt plus
// bas), convention Date#getUTCDay (0 = dimanche ... 6 = samedi) : copie de la
// même constante côté serveur (server/calendar.js), retour utilisateur,
// 2026-09, à la réinitialisation d'une ligue multi-manager, "il faut que les
// matchs commencent à partir de mercredi, ça laissera le temps à tout le
// monde pour prendre ses marques et faire des emplettes".
const CALENDAR_DAILY_ANCHORED_FIRST_MATCH_WEEKDAY = 3; // mercredi

function parisUtcOffsetMs(utcMs) {
  const parts = parisLocalDateParts(utcMs);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - utcMs;
}

function parisLocalDateParts(utcMs) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: CALENDAR_PARIS_TIME_ZONE, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map = {};
  dtf.formatToParts(new Date(utcMs)).forEach(p => { if (p.type !== "literal") map[p.type] = p.value; });
  return {
    year: Number(map.year), month: Number(map.month), day: Number(map.day),
    hour: Number(map.hour), minute: Number(map.minute), second: Number(map.second),
  };
}

function addParisCalendarDays(dateParts, days) {
  const d = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// `aMs`/`bMs` tombent-ils le MÊME jour civil à Paris ? Utilisé par
// League.runVideoSession (séance vidéo, voir plus haut) pour son plafond "une
// séance par jour" — même définition de "jour" que le reste du calendrier
// ancré quotidien (parisLocalDateParts ci-dessus), jamais une fenêtre
// glissante de 24h qui dériverait d'une séance à l'autre.
function sameParisCalendarDay(aMs, bMs) {
  const a = parisLocalDateParts(aMs);
  const b = parisLocalDateParts(bMs);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

// Entier COMPARABLE/TRIABLE identifiant un jour civil à Paris (retour
// utilisateur, 2026-09, voir Team.collectiveTrainingLog/syncCollectiveTrainingLog/
// tacticsCycleStartDayIndex plus haut) : minuit UTC du triplet
// année/mois/jour Paris de `ms` — PAS un vrai instant réel (ignore
// volontairement l'heure locale/le décalage horaire), juste une clé stable
// et strictement croissante d'un jour civil au suivant (toujours exactement
// 24h = 86 400 000 ms d'écart, même autour d'un changement d'heure Paris,
// puisqu'aucune vraie conversion de fuseau n'entre plus en jeu à ce stade).
function parisCalendarDayIndex(ms) {
  const p = parisLocalDateParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day);
}

function parisEpochForLocalTime(year, month, day, hour, minute = 0, second = 0) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const offset = parisUtcOffsetMs(guess);
    const candidate = Date.UTC(year, month - 1, day, hour, minute, second) - offset;
    if (candidate === guess) return candidate;
    guess = candidate;
  }
  return guess;
}

function dailyAnchoredCalendarConfig() {
  return { dailyAnchored: true };
}

// Nombre de jours civils entre `dateParts` et le prochain jour tombant sur
// `targetWeekday` (convention Date#getUTCDay, 0 = dimanche ... 6 = samedi) :
// 0 si `dateParts` est déjà ce jour-là, sinon 1 à 6. Copie de la même
// fonction côté serveur (server/calendar.js).
function daysUntilParisWeekday(dateParts, targetWeekday) {
  const currentWeekday = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)).getUTCDay();
  return (targetWeekday - currentWeekday + 7) % 7;
}

// Instant réel (epoch ms) du tout premier créneau ("jour 0", 10h à Paris) :
// ancré sur le prochain CALENDAR_DAILY_ANCHORED_FIRST_MATCH_WEEKDAY (mercredi)
// à compter du jour de création `now`, création comprise si elle tombe déjà
// un mercredi avant 10h. Si ce mercredi est aujourd'hui mais que 10h est déjà
// passé, bascule sur le mercredi SUIVANT (+7 jours) plutôt que le lendemain
// (jeudi) : le rythme reste toujours "championnat à partir d'un mercredi".
// Copie de la même fonction côté serveur (server/calendar.js).
function dailyAnchoredCalendarStartAt(now) {
  const today = parisLocalDateParts(now);
  const daysAhead = daysUntilParisWeekday(today, CALENDAR_DAILY_ANCHORED_FIRST_MATCH_WEEKDAY);
  const nextWednesday = daysAhead > 0 ? addParisCalendarDays(today, daysAhead) : today;
  const firstSlot = parisEpochForLocalTime(nextWednesday.year, nextWednesday.month, nextWednesday.day, CALENDAR_DAILY_ANCHORED_CHAMPIONSHIP_HOURS[0]);
  if (firstSlot > now) return firstSlot;
  const followingWednesday = addParisCalendarDays(today, daysAhead + 7);
  return parisEpochForLocalTime(followingWednesday.year, followingWednesday.month, followingWednesday.day, CALENDAR_DAILY_ANCHORED_CHAMPIONSHIP_HOURS[0]);
}

function dailyAnchoredScheduledTimeForSlot(calendarStartAt, dayIndex, hour) {
  const day0 = parisLocalDateParts(calendarStartAt);
  const target = dayIndex > 0 ? addParisCalendarDays(day0, dayIndex) : day0;
  return parisEpochForLocalTime(target.year, target.month, target.day, hour);
}

function dailyAnchoredDayIndexForChampionshipRound(round) {
  return Math.floor(round / CALENDAR_DAILY_ANCHORED_CHAMPIONSHIP_HOURS.length);
}
function dailyAnchoredSlotIndexForChampionshipRound(round) {
  return round % CALENDAR_DAILY_ANCHORED_CHAMPIONSHIP_HOURS.length;
}
function dailyAnchoredScheduledTimeForChampionshipRound(calendarStartAt, round) {
  const dayIndex = dailyAnchoredDayIndexForChampionshipRound(round);
  const hour = CALENDAR_DAILY_ANCHORED_CHAMPIONSHIP_HOURS[dailyAnchoredSlotIndexForChampionshipRound(round)];
  return dailyAnchoredScheduledTimeForSlot(calendarStartAt, dayIndex, hour);
}
function dailyAnchoredScheduledTimeForCupRound(calendarStartAt, cupDayIndex) {
  return dailyAnchoredScheduledTimeForSlot(calendarStartAt, cupDayIndex, CALENDAR_DAILY_ANCHORED_CUP_HOUR);
}

// `calendarConfig` optionnel ({weekMs, slotOffsetsMs}) : le rythme de
// calendrier à figer pour CETTE ligue (voir League.calendarWeekMs/
// calendarSlotOffsetsMs) — `null`/absent = calendrier classique. Permet au
// serveur (voir server/store.js, mode accéléré de test) de générer une
// ligue sur un autre rythme, et à une nouvelle saison (voir startNewSeason
// côté navigateur) d'hériter explicitement du rythme de la saison
// précédente plutôt que de retomber sur le classique par défaut.
// Coeur commun à generateLeague (UN seul manager humain, historique — son
// équipe est déjà construite/personnalisée par l'appelant) et
// generateMultiManagerLeague (1 à 10 managers humains, équipes construites à
// la volée à partir de simples noms, voir plus bas) : construit une ligue à
// 10 équipes à partir d'équipes humaines DÉJÀ CONSTRUITES (`humanTeams`,
// isHuman déjà à `true` dessus) complétées par autant d'adversaires CPU que
// nécessaire pour arriver à 10 (voir CPU_TEAM_NAMES — au plus 9 nécessaires,
// exactement ce tableau contient). Les deux chemins d'appel restent ainsi
// IDENTIQUES sur tout ce qui ne concerne pas la construction de l'équipe
// humaine elle-même : génération des adversaires CPU, calendrier réel...
// — un seul endroit à faire évoluer si ça change.
function buildLeagueWithHumanTeams(humanTeams, divisionLevel, now, calendarConfig) {
  if (!Array.isArray(humanTeams) || humanTeams.length < 1 || humanTeams.length > 10) {
    throw new Error("humanTeams doit contenir entre 1 et 10 équipes.");
  }
  const info = divisionInfo(divisionLevel);
  const cpuCount = 10 - humanTeams.length;
  const opponents = CPU_TEAM_NAMES.slice(0, cpuCount).map(name => {
    const t = generateTeam(name, info.tierMultiplier * rand(0.9, 1.15));
    t.offensivePriorities = pick([
      ["Jeu extérieur", "Jeu en mouvement", "Équilibrée"],
      ["Jeu en pénétration", "Pick & Roll", "Transition rapide"],
      ["Jeu intérieur", "Équilibrée", "Jeu en mouvement"],
    ]);
    return t;
  });
  const league = new League([...humanTeams, ...opponents]);
  // Interview d'avant-saison (correctif 2026-09, voir le grand commentaire
  // de Team.queueSeasonPreviewInterview) : posée ici plutôt que dans
  // generateLeague/generateMultiManagerLeague séparément pour couvrir
  // UNIFORMÉMENT les trois chemins qui passent par ce point commun (nouvelle
  // carrière solo, nouvelle saison solo via startNewSeason, ET création
  // d'une ligue partagée à plusieurs managers).
  humanTeams.forEach(team => team.queueSeasonPreviewInterview(now));
  // Objectif de saison du conseil d'administration (voir le grand
  // commentaire au-dessus de SEASON_OBJECTIVE_TIERS) : posé ici pour la
  // même raison que l'interview d'avant-saison juste au-dessus, une fois
  // TOUTES les équipes (humaines ET CPU) présentes dans `league.teams`,
  // seul moment où l'on peut comparer leur niveau les unes aux autres.
  assignSeasonObjectives(league);
  league.divisionLevel = info.level;
  // Le calendrier réel d'une nouvelle saison démarre maintenant (voir
  // League.calendarStartAt ci-dessus, et server/calendar.js pour le détail
  // du rythme réel qui s'appuie dessus) — `now` explicite (comme
  // partout ailleurs pour tout ce qui touche au temps réel, voir
  // TRANSFER_AUCTION_DURATION_MS) plutôt qu'un Date.now() implicite, pour
  // rester testable de façon déterministe.
  // Calendrier ancré quotidien (voir League.calendarDailyAnchored et le
  // grand commentaire au-dessus de dailyAnchoredCalendarConfig ci-dessus) :
  // un rythme à part, jamais exprimable via calendarWeekMs/
  // calendarSlotOffsetsMs (qui restent `null` dans ce cas) — voir
  // generateMultiManagerLeague, seul appelant qui passe jamais ce marqueur.
  league.calendarDailyAnchored = !!(calendarConfig && calendarConfig.dailyAnchored);
  if (league.calendarDailyAnchored) {
    league.calendarStartAt = dailyAnchoredCalendarStartAt(now);
    league.calendarWeekMs = null;
    league.calendarSlotOffsetsMs = null;
  } else {
    league.calendarStartAt = anchoredCalendarStartAt(now, calendarConfig);
    league.calendarWeekMs = calendarConfig && typeof calendarConfig.weekMs === "number" ? calendarConfig.weekMs : null;
    league.calendarSlotOffsetsMs = calendarConfig && Array.isArray(calendarConfig.slotOffsetsMs) ? calendarConfig.slotOffsetsMs : null;
  }
  return league;
}

function generateLeague(userTeam, divisionLevel = 1, now = Date.now(), calendarConfig = null) {
  userTeam.isHuman = true;
  // Ne régénère JAMAIS un jeton si l'appelant en avait déjà un (ex. une
  // équipe reconstruite depuis une sauvegarde, voir server/store.js) — voir
  // Team.managerLinkToken.
  if (!userTeam.managerLinkToken) userTeam.managerLinkToken = randomHexToken(24);
  return buildLeagueWithHumanTeams([userTeam], divisionLevel, now, calendarConfig);
}

// Ligue à PLUSIEURS managers humains (retour utilisateur, 2026-09 : "jusqu'à
// 10 vrais managers humains dans une ligue partagée à la fois, le reste
// comblé par des adversaires CPU"). `managerTeamNames` : 1 à 10 noms de club
// (un par manager réel qui s'est inscrit) — chacun devient une équipe humaine
// fraîche (effectif de débutants, voir generateStartingRoster) avec SON
// PROPRE managerLinkToken (voir randomHexToken), complétée par autant
// d'adversaires CPU (CPU_TEAM_NAMES, dans l'ordre) qu'il en faut pour
// atteindre 10 équipes au total. Partage tout le reste (adversaires CPU,
// calendrier réel) avec generateLeague via buildLeagueWithHumanTeams
// ci-dessus.
function generateMultiManagerLeague(managerTeamNames, divisionLevel = 1, now = Date.now(), calendarConfig = null) {
  if (!Array.isArray(managerTeamNames) || managerTeamNames.length < 1 || managerTeamNames.length > 10) {
    throw new Error("generateMultiManagerLeague : managerTeamNames doit contenir entre 1 et 10 noms.");
  }
  const humanTeams = managerTeamNames.map(name => {
    const team = generateStartingRoster(name);
    team.isHuman = true;
    team.managerLinkToken = randomHexToken(24);
    return team;
  });
  const league = buildLeagueWithHumanTeams(humanTeams, divisionLevel, now, calendarConfig);
  // Coupe (voir le grand commentaire au-dessus de generateCupBracket) :
  // seulement pour le calendrier ancré quotidien (League.calendarDailyAnchored
  // — voir buildLeagueWithHumanTeams), qui seul lui réserve un créneau réel
  // (15h) où la faire vivre. Toujours les 10 équipes de la ligue (humaines
  // ET CPU, voir buildLeagueWithHumanTeams qui complète toujours à 10) —
  // jamais seulement managerTeamNames.
  if (league.calendarDailyAnchored) {
    league.cup = { rounds: [generateCupBracket(league.teams.map((_, i) => i))], champion: null };
  }
  return league;
}

// ---------------------------------------------------------------------
// SÉRIALISATION (sauvegarde/chargement) — partagée entre le client
// (navigateur, via l'API du serveur : voir saveMyTeam/loadMyTeam dans
// moteurbasket3.html) et le serveur lui-même (voir server/store.js, qui
// écrit un fichier JSON) : UNE SEULE version de cette logique, ici dans le
// moteur, plutôt que
// deux copies qui risquent de diverger. C'est exactement ce genre de
// divergence qui a causé le bug "mes joueurs ne progressent pas avec
// l'entrainement" (retour utilisateur, 2026-09) : `secondsPlayedByPosition`
// oublié dans UNE des deux copies (celle-ci n'existait alors que côté
// client) suffisait à casser l'entraînement après chaque rechargement. En la
// centralisant ici, un correctif ne peut plus être appliqué à une copie et
// oublié dans l'autre.
// ---------------------------------------------------------------------
// Forme commune d'un joueur sauvegardé — factorisée pour que serializeTeam
// (effectif pro, ci-dessous) ET l'académie de jeunes (youthCandidates/
// youthPlayers, mêmes champs) ne laissent jamais diverger la forme d'un
// enregistrement de joueur entre les deux. Voir playerFromSave plus bas pour
// la restauration (même logique de repli, partagée elle aussi).
function serializePlayerRecord(p) {
  return {
    name: p.name, position: p.position, height: p.height, age: p.age,
    attrs: { ...p.attrs }, potential: p.potential, salary: p.salary,
    // `effectivePosition` (voir Player.constructor/levelCoefficientFor) :
    // DOIT être sauvegardé au même rythme que `salary` juste au-dessus
    // (retour utilisateur, 2026-09 : "le poste est fixé en début de saison
    // selon les caracs et il ne doit ensuite plus bouger [...] corrigé
    // seulement lors de l'intersaison"), sans ce champ, playerFromSave
    // restaurait bien `salary` mais PAS `effectivePosition`, qui repartait
    // alors du constructeur Player, lequel le recalcule TOUJOURS d'après les
    // attributs ACTUELS (voir plus bas) : un simple rechargement de page en
    // cours de saison (après quelques gains d'entraînement) suffisait à
    // faire "changer de poste" l'étiquette/l'infobulle du salaire affichées,
    // alors que le salaire réellement payé restait, lui, correctement figé.
    effectivePosition: p.effectivePosition,
    _trainProgress: { ...p._trainProgress },
    aggressiveness: p.aggressiveness, form: p.form,
    // Forme physique (voir CONDITION_STATES/currentCondition plus haut) :
    // conditionUpdatedAt DOIT être persisté avec condition (pas juste la
    // valeur brute), sinon la récupération se rattraperait d'un coup, en
    // trop, au prochain chargement (calculée depuis "maintenant" au lieu du
    // dernier vrai point de mise à jour).
    condition: p.condition, conditionUpdatedAt: p.conditionUpdatedAt,
    // Blessure PERSISTANTE (voir INJURY_TYPES/rollInjury/isCurrentlyInjured
    // plus haut) : DOIT survivre au rechargement, sinon un simple
    // redémarrage suffirait à "guérir" instantanément un joueur, contraire
    // au principe même d'une indisponibilité qui dure plusieurs jours
    // réels. `null` par défaut (pas blessé) — jamais omis, contrairement à
    // `injured` (état de match transitoire, jamais sérialisé).
    injuryType: p.injuryType ?? null, injuryUntil: p.injuryUntil ?? null,
    forSale: p.forSale, salePrice: p.salePrice,
    // Temps de jeu du DERNIER match, ventilé par poste (voir
    // Player.secondsPlayedByPosition) : sans ces deux champs, un
    // redémarrage/rechargement entre un match joué et le prochain effacerait
    // le détail du dernier match (matchLog, box-score) — un rechargement de
    // page ne devrait jamais, à lui seul, effacer le mérite du dernier match
    // joué (retour utilisateur d'origine : "mes joueurs ne progressent pas
    // avec l'entrainement").
    secondsPlayed: p.secondsPlayed,
    secondsPlayedByPosition: { ...p.secondsPlayedByPosition },
    // Même raison, mais pour Player.trainingSecondsPlayedByPosition (voir son
    // commentaire au constructeur) : SEUL champ désormais lu par
    // Team.trainablySecondsFor, cumulé sur tout un cycle d'entraînement
    // (jusqu'à 3 matchs, calendrier ancré quotidien). Sans lui, un
    // rechargement entre deux des trois matchs du jour effacerait la part
    // déjà accumulée.
    trainingSecondsPlayedByPosition: { ...p.trainingSecondsPlayedByPosition },
    // Retour utilisateur (2026-09) : "le match 3 n'affiche aucune stats
    // hormis les minutes [...] généralisé à d'autres équipes et autres
    // joueurs". Cause : p.stats n'était JAMAIS sauvegardé alors que
    // p.secondsPlayed l'est déjà (voir commentaire ci-dessus). Un
    // redémarrage serveur survenant entre le coup d'envoi d'un match EN
    // DIRECT (qui remplit p.stats/p.secondsPlayed via MatchEngine.simulate,
    // voir computeLiveMatch) et sa finalisation (qui lit CES MÊMES champs,
    // voir recordMatchStatsForTeam) faisait perdre p.stats au rechargement
    // (reparti de emptyStats() via le constructeur Player) sans toucher
    // p.secondsPlayed (restauré ci-dessous) : d'où des entrées de
    // matchLog avec des minutes correctes mais toutes les autres stats à
    // zéro. Même rythme de persistance que secondsPlayed ci-dessus.
    stats: { ...p.stats },
    id: p.id,
    // Journal des matchs de la saison (voir Player.matchLog/
    // recordMatchStatsForTeam) : DOIT survivre au rechargement, sinon les
    // stats de saison/MVP (onglet Ligue) et les pages joueur repartiraient
    // de zéro à chaque redémarrage du serveur. Chaque entrée peut désormais
    // porter isMvp/mvpQuote (voir awardMatchMvp) : déjà inclus par ce spread
    // superficiel, aucun champ à lister explicitement.
    matchLog: Array.isArray(p.matchLog) ? p.matchLog.map(m => ({ ...m })) : [],
    // Bonus temporaire de MVP (voir Player.pendingMatchBoost/MVP_ATTR_BONUS/
    // awardMatchMvp) : DOIT survivre au rechargement, sinon un redémarrage
    // serveur entre l'élection au MVP et le prochain match de ce joueur lui
    // ferait perdre le bonus promis.
    pendingMatchBoost: p.pendingMatchBoost || 0,
    // Demande de transfert (voir le grand commentaire de
    // TRANSFER_REQUEST_MOTIVATION_THRESHOLD) : DOIT survivre au
    // rechargement, sinon un simple redémarrage "réconcilierait" à tort un
    // joueur qui a publiquement demandé son transfert.
    weeksAtLowMotivation: p.weeksAtLowMotivation || 0,
    transferRequestActive: !!p.transferRequestActive,
    transferRequestQuote: p.transferRequestQuote ?? null,
  };
}

// Copie du rapport hebdomadaire d'entraînement (voir Team.lastTrainingReport/
// trainWeek) réellement ciblée sur ses deux niveaux d'imbrication
// (`players`, un dictionnaire id -> objet, dont `gains` est lui-même un
// tableau) plutôt qu'un JSON.parse(JSON.stringify(...)) générique, même
// style de copie explicite que le reste de ce fichier (voir
// youthCandidates/academyGraduatesHistory ci-dessus), jamais la même
// référence que l'objet vivant renvoyé par trainWeek(), pour qu'une
// sauvegarde reste un instantané figé. `null` inchangé (aucune semaine
// d'entraînement jouée pour l'instant, ou sauvegarde d'avant cette
// fonctionnalité).
function cloneTrainingReport(report) {
  if (!report) return null;
  const players = {};
  Object.entries(report.players || {}).forEach(([id, p]) => {
    players[id] = { ...p, gains: (p.gains || []).map(g => ({ ...g })) };
  });
  return {
    ...report, players,
    salaryChanges: (report.salaryChanges || []).map(c => ({ ...c })),
  };
}

function serializeTeam(team) {
  return {
    version: 1,
    week: team.week,
    teamName: team.name,
    offensivePriorities: team.offensivePriorities,
    defense: team.defense,
    rhythm: team.rhythm,
    // Tactique confirmée (voir Team.constructor/SCREEN_DEFENSES et
    // consorts) — DOIT survivre au rechargement comme le reste des ordres.
    // Aucun souci de compatibilité arrière à la LECTURE : teamFromSave
    // n'écrase les défauts posés par `new Team(...)` que si le champ est
    // présent (voir plus bas), donc une sauvegarde d'avant cette
    // fonctionnalité retombe simplement sur les valeurs standard.
    tacticalTier: team.tacticalTier,
    screenDefense: team.screenDefense,
    helpDefense: team.helpDefense,
    watchAssignments: (team.watchAssignments || []).map(a => ({ ...a })),
    postDefense: team.postDefense,
    closeoutStyle: team.closeoutStyle,
    offRebStyle: team.offRebStyle,
    endgameManagement: team.endgameManagement,
    // Tutoriel d'accueil (voir Team.constructor plus haut) : DOIT survivre
    // au rechargement, sinon le bouton de l'onglet Guide reviendrait à
    // chaque redémarrage du serveur.
    onboardingTourCompleted: !!team.onboardingTourCompleted,
    // Primes du tutoriel déjà créditées (voir Team.tutorialRewardsClaimed/
    // claimTutorialReward plus haut) : DOIT survivre au rechargement, sinon
    // un thème déjà payé redeviendrait payable à chaque redémarrage du
    // serveur.
    tutorialRewardsClaimed: [...(team.tutorialRewardsClaimed || [])],
    trainingSkill: team.trainingSkill,
    trainingPositions: [...team.trainingPositions],
    trainer: team.trainer ? { ...team.trainer } : null,
    // Analyste vidéo + scoutisme (voir Team.videoAnalyst/scoutedAttrs/
    // lastVideoSessionAt ci-dessus) : doivent survivre au rechargement,
    // comme le reste du staff — `scoutedAttrs` en particulier, sinon un
    // manager perdrait le bénéfice de ses séances vidéo déjà faites au
    // premier redémarrage du serveur.
    videoAnalyst: team.videoAnalyst ? { ...team.videoAnalyst } : null,
    scoutedAttrs: team.scoutedAttrs || {},
    lastVideoSessionAt: typeof team.lastVideoSessionAt === "number" ? team.lastVideoSessionAt : null,
    // Badge "Modifier vos ordres" (voir Team.ordresValidatedRound ci-dessus) :
    // même raison de persister que lastVideoSessionAt juste au-dessus.
    ordresValidatedRound: typeof team.ordresValidatedRound === "number" ? team.ordresValidatedRound : null,
    budget: team.budget,
    arenaLevel: team.arenaLevel,
    ticketPrices: { ...team.ticketPrices },
    fanShopLevel: team.fanShopLevel,
    // Autres infrastructures (voir CLUB_FACILITIES/Team.facilityLevels
    // ci-dessus) : {tvStation:0, gym:0, wellness:0} par défaut si absent
    // (équipe créée avant cette fonctionnalité).
    facilityLevels: { ...(team.facilityLevels || { tvStation: 0, gym: 0, wellness: 0 }) },
    transactions: team.transactions,
    fanMorale: team.fanMorale,
    moraleHistory: team.moraleHistory,
    // Objectif de saison du conseil d'administration (voir le grand
    // commentaire au-dessus de SEASON_OBJECTIVE_TIERS) : `null` par défaut,
    // une sauvegarde d'avant cette fonctionnalité n'en a simplement pas
    // encore (voir teamFromSave plus bas).
    seasonObjective: team.seasonObjective || null,
    // Alchimie d'équipe (voir le grand commentaire de
    // CHEMISTRY_ROSTER_CHANGE_MAX_RANK plus haut) : chemistry, plus le
    // dernier instantané tactique utilisé pour détecter un changement au
    // match suivant (voir Team.checkTacticsChemistry) : sans lui, un
    // rechargement de page appliquerait à tort un malus au prochain match
    // (aucun `prev` à comparer, alors qu'il y en avait bien un).
    chemistry: team.chemistry,
    lastTacticsSnapshotForChemistry: team.lastTacticsSnapshotForChemistry
      ? { ...team.lastTacticsSnapshotForChemistry, offense: [...team.lastTacticsSnapshotForChemistry.offense] }
      : null,
    // Identité tactique établie (voir Team.establishedTacticsSnapshot/
    // checkTacticsChemistry) : même raisonnement que lastTacticsSnapshotForChemistry
    // ci-dessus, DOIT survivre au rechargement, sinon un aller-retour de
    // tactique redeviendrait à tort payant après chaque redémarrage serveur.
    establishedTacticsSnapshot: team.establishedTacticsSnapshot
      ? { ...team.establishedTacticsSnapshot, offense: [...team.establishedTacticsSnapshot.offense] }
      : null,
    // Entraînement collectif (voir Team.collectiveTraining ci-dessus) : DOIT
    // survivre au rechargement, comme trainingSkill/trainingPositions plus
    // haut, sinon le focus collectif de la semaine reviendrait à "aucun" à
    // chaque redémarrage du serveur.
    collectiveTraining: team.collectiveTraining || null,
    // Tactique précisément travaillée à l'entraînement (voir Team.
    // trainedTactics ci-dessus) : même raisonnement, DOIT survivre au
    // rechargement. Un seul aspect ({ category, value }).
    trainedTactics: team.trainedTactics
      ? { category: team.trainedTactics.category, value: team.trainedTactics.value }
      : null,
    // Historique quotidien de l'entraînement collectif (voir
    // Team.collectiveTrainingLog/syncCollectiveTrainingLog ci-dessus) : DOIT
    // survivre au rechargement, sinon les jours déjà banqués vers
    // l'atténuation du prochain changement de tactique seraient perdus à
    // chaque redémarrage serveur (copie superficielle de chaque entrée,
    // jamais de référence partagée).
    collectiveTrainingLog: Array.isArray(team.collectiveTrainingLog)
      ? team.collectiveTrainingLog.map(e => ({
        dayIndex: e.dayIndex,
        collectiveTraining: e.collectiveTraining || null,
        trainedTactics: e.trainedTactics ? { category: e.trainedTactics.category, value: e.trainedTactics.value } : null,
      }))
      : [],
    // Jour civil du dernier match réellement joué (voir
    // Team.tacticsCycleStartDayIndex ci-dessus) : DOIT survivre au
    // rechargement, même raisonnement que collectiveTrainingLog ci-dessus.
    tacticsCycleStartDayIndex: typeof team.tacticsCycleStartDayIndex === "number" ? team.tacticsCycleStartDayIndex : null,
    // Interviews en attente (voir Team.pendingInterviews/applyMoraleForResult) :
    // même forme de persistance que pendingYouthDecisions plus bas, simple
    // copie superficielle de chaque entrée (objets plats, jamais de
    // référence partagée avec team.pendingInterviews lui-même).
    pendingInterviews: Array.isArray(team.pendingInterviews) ? team.pendingInterviews.map(i => ({ ...i })) : [],
    // MVP automatique du dernier match (voir Team.lastMatchMvp/awardMatchMvp
    // ci-dessus) : DOIT survivre au rechargement, sinon la citation affichée
    // sur le tableau de bord disparaîtrait à chaque redémarrage du serveur.
    lastMatchMvp: team.lastMatchMvp ? { ...team.lastMatchMvp } : null,
    // Identité du club (voir Team.isPaying/customLogoDataUrl/jerseyShape/
    // jerseyColor, JERSEY_COLORS/JERSEY_SHAPES plus haut).
    isPaying: !!team.isPaying,
    customLogoDataUrl: team.customLogoDataUrl || null,
    jerseyShape: team.jerseyShape,
    jerseyColor: team.jerseyColor,
    jerseyPattern: team.jerseyPattern,
    jerseyTwoTone: team.jerseyTwoTone,
    // Maillot extérieur (voir Team.awayJerseyColor/awayJerseyPattern/
    // awayJerseyTwoTone, setAwayJerseyColor et consorts plus haut).
    awayJerseyColor: team.awayJerseyColor,
    awayJerseyPattern: team.awayJerseyPattern,
    awayJerseyTwoTone: team.awayJerseyTwoTone,
    // Fiche club (voir Team.foundedYear/trophies, generateFoundedYear/
    // MAX_TEAM_TROPHIES/League.recordTrophy plus haut) : copie superficielle
    // de chaque trophée, même précaution que pendingInterviews ci-dessus.
    foundedYear: team.foundedYear,
    // Marqueur de migration (voir Team constructeur plus haut) : persisté
    // pour que teamFromSave sache si ce foundedYear vient déjà de la logique
    // réelle actuelle ou doit encore être migré.
    foundedYearRealDate: team.foundedYearRealDate !== false,
    trophies: Array.isArray(team.trophies) ? team.trophies.map(t => ({ ...t })) : [],
    // Historique d'affluence (voir Team.attendanceHistory/simulateHomeAttendance
    // ci-dessus) : même rythme de persistance que moraleHistory/transactions
    // juste au-dessus, sinon l'historique affiché sur l'onglet Salle
    // disparaîtrait à chaque rechargement de page.
    attendanceHistory: team.attendanceHistory,
    deficitWeeks: team.deficitWeeks,
    // Identité manager (voir Team.isHuman/managerLinkToken ci-dessus) :
    // `false`/`null` pour une équipe CPU (comportement historique implicite,
    // avant ces deux champs) — DOIT survivre au rechargement, sinon un
    // manager perdrait son lien privé (donc l'accès à son équipe) au premier
    // redémarrage du serveur.
    isHuman: !!team.isHuman,
    managerLinkToken: team.managerLinkToken || null,
    // Droit d'administration de ligue (voir Team.isAdmin ci-dessus) : même
    // logique que isHuman — `false` par défaut, DOIT survivre au rechargement
    // sinon l'admin perdrait ce droit au premier redémarrage du serveur.
    isAdmin: !!team.isAdmin,
    lineup: team.lineup,
    // Journées futures déjà préparées à l'avance (voir Team.plannedTactics
    // et stagePlanForRound/applyPlannedTacticsForRound) — déjà un objet
    // JSON-safe (aucune classe/Set/Map à l'intérieur), transporté tel quel.
    plannedTactics: team.plannedTactics || {},
    players: team.players.map(serializePlayerRecord),
    // Recruteur (voir Team.recruiter ci-dessus) : même forme/logique de
    // sauvegarde que trainer/videoAnalyst.
    recruiter: team.recruiter ? { ...team.recruiter } : null,
    // Académie de jeunes (voir Team.youthCandidates/youthPlayers ci-dessus) :
    // mêmes enregistrements qu'un joueur normal (voir serializePlayerRecord)
    // — youthCandidates porte EN PLUS createdAt/expiresAt (fenêtre
    // d'expiration d'une proposition non traitée, voir
    // YOUTH_CANDIDATE_EXPIRY_MS), que youthPlayers n'a pas besoin de porter
    // (un jeune déjà signé n'expire jamais).
    youthCandidates: (team.youthCandidates || []).map(c => ({
      ...serializePlayerRecord(c), createdAt: c.createdAt, expiresAt: c.expiresAt,
    })),
    youthPlayers: (team.youthPlayers || []).map(serializePlayerRecord),
    // Centre de formation (voir Team.trainingCenterLevel ci-dessus) :
    // démarre à 1 par défaut (constructeur Team), comme arenaLevel.
    trainingCenterLevel: team.trainingCenterLevel || 1,
    // Palmarès du club (voir Team.academyGraduates/promoteYouthPlayer
    // ci-dessus) : DOIT survivre au rechargement comme le reste, sinon ce
    // compteur historique repartirait de zéro à chaque redémarrage serveur.
    academyGraduates: team.academyGraduates || 0,
    // Historique du centre de formation (voir
    // Team.academyGraduatesHistory/promoteYouthPlayer ci-dessus) : même
    // logique de persistance que youthCandidates/youthPlayers ci-dessus
    // (copie superficielle de chaque entrée, DOIT survivre au rechargement).
    academyGraduatesHistory: (team.academyGraduatesHistory || []).map(h => ({ ...h })),
    // Dernier rapport hebdomadaire d'entraînement (voir
    // Team.lastTrainingReport/trainWeek ci-dessus) : DOIT survivre au
    // rechargement comme le reste, sinon le bilan affiché sur l'onglet
    // Entraînement redeviendrait vide à chaque redémarrage du serveur.
    lastTrainingReport: cloneTrainingReport(team.lastTrainingReport),
    // Décisions manager en attente pour un jeune de 18 ans (voir
    // Team.pendingYouthDecisions ci-dessus) : simple tableau d'id de
    // joueurs, DOIT survivre au rechargement (sinon un manager perdrait la
    // trace d'une décision en attente au premier redémarrage du serveur).
    pendingYouthDecisions: Array.isArray(team.pendingYouthDecisions) ? [...team.pendingYouthDecisions] : [],
  };
}

function playerFromSave(pdata) {
  const p = new Player({
    name: pdata.name, position: pdata.position, height: pdata.height,
    age: pdata.age, attrs: { ...pdata.attrs }, aggressiveness: pdata.aggressiveness,
  });
  // Migration : sauvegardes d'avant l'ajout de mental/endurance/freeThrow aux
  // ATTRS (voir le grand commentaire au-dessus d'ATTRS) - ces 3 caractéristiques
  // manquent alors totalement dans pdata.attrs, ce qui rendrait overall() (et
  // tout ce qui en dépend : potentiel, salaire, entraînement) NaN. On les
  // dérive de la moyenne des 10 caractéristiques d'origine du joueur (avec un
  // léger bruit aléatoire pour éviter que tous les joueurs migrés se
  // retrouvent avec exactement la même valeur), plutôt qu'une constante fixe,
  // pour éviter un saut brutal d'overall/salaire au premier chargement après
  // mise à jour.
  const legacyAttrKeys = ["midRange", "threePoint", "inside", "pass", "rebound", "block", "dribble", "agility", "defOutside", "defInside"];
  const missingNewAttrs = ["mental", "endurance", "freeThrow"].filter(k => typeof p.attrs[k] !== "number");
  if (missingNewAttrs.length) {
    const legacyAvg = legacyAttrKeys.reduce((sum, k) => sum + (p.attrs[k] || 0), 0) / legacyAttrKeys.length;
    missingNewAttrs.forEach(k => {
      p.attrs[k] = clamp(Math.round(legacyAvg + (Math.random() * 10 - 5)), 1, 99);
    });
  }
  // Le potentiel est fixé une fois pour toutes à la création du joueur : on
  // écrase celui généré par défaut avec celui sauvegardé (sinon il serait
  // recalculé aléatoirement à chaque chargement, ce qui n'aurait aucun sens).
  p.potential = typeof pdata.potential === "number" ? pdata.potential : p.potential;
  // Le salaire n'est recalculé qu'au passage d'une saison (voir
  // Team.recalculateSalaries) : on restaure la valeur sauvegardée plutôt que
  // de le laisser se recalculer d'après les attributs ACTUELS à chaque
  // rechargement, ce qui romprait ce rythme (un simple rechargement de page
  // ferait alors bouger le salaire).
  p.salary = typeof pdata.salary === "number" ? pdata.salary : p.salary;
  // `effectivePosition` : même repli que `salary` juste au-dessus, pour la
  // même raison (voir le commentaire de serializePlayerRecord), sans ça, le
  // constructeur Player appelé par `new Player(...)` ci-dessus l'aurait déjà
  // écrasé avec une valeur recalculée d'après les attributs ACTUELS (pas
  // ceux du dernier passage de saison), rompant le même rythme que `salary`.
  // Absent (sauvegarde d'avant ce correctif) : on garde la valeur du
  // constructeur, qui se corrigera d'elle-même au prochain vrai passage de
  // saison (Team.recalculateSalaries), comme n'importe quel champ manquant
  // d'une ancienne sauvegarde.
  p.effectivePosition = pdata.effectivePosition || p.effectivePosition;
  if (pdata._trainProgress) p._trainProgress = { ...pdata._trainProgress };
  if (typeof pdata.form === "number") p.form = pdata.form;
  // Forme physique (voir serializePlayerRecord ci-dessus). Absent (ancienne
  // sauvegarde d'avant cette fonctionnalité) : on garde condition/
  // conditionUpdatedAt déjà posés par le constructeur (joueur "frais"),
  // même principe que les autres champs manquants ci-dessous.
  if (typeof pdata.condition === "number") p.condition = pdata.condition;
  if (typeof pdata.conditionUpdatedAt === "number") p.conditionUpdatedAt = pdata.conditionUpdatedAt;
  // Blessure PERSISTANTE (voir serializePlayerRecord ci-dessus). Absent
  // (ancienne sauvegarde d'avant cette fonctionnalité) : on garde `null`
  // déjà posé par le constructeur (joueur pas blessé), même principe que
  // les autres champs manquants ci-dessous.
  if (typeof pdata.injuryType === "string") p.injuryType = pdata.injuryType;
  if (typeof pdata.injuryUntil === "number") p.injuryUntil = pdata.injuryUntil;
  if (pdata.id) p.id = pdata.id;
  // Temps de jeu du dernier match (voir serializePlayerRecord ci-dessus pour
  // pourquoi c'est indispensable, matchLog/box-score).
  if (typeof pdata.secondsPlayed === "number") p.secondsPlayed = pdata.secondsPlayed;
  if (pdata.secondsPlayedByPosition) p.secondsPlayedByPosition = { ...pdata.secondsPlayedByPosition };
  // Temps de jeu CUMULÉ du cycle d'entraînement en cours (voir
  // serializePlayerRecord ci-dessus) : absent = sauvegarde d'avant ce champ,
  // on laisse alors le {} du constructeur (aucun cumul à restaurer).
  if (pdata.trainingSecondsPlayedByPosition) p.trainingSecondsPlayedByPosition = { ...pdata.trainingSecondsPlayedByPosition };
  // Stats du dernier match (voir serializePlayerRecord ci-dessus pour le
  // bug que ça corrige) : absent = sauvegarde d'avant cette correction, on
  // garde emptyStats() (déjà posé par le constructeur Player).
  if (pdata.stats && typeof pdata.stats === "object") p.stats = { ...p.emptyStats(), ...pdata.stats };
  // Mise en vente forcée (voir DEFICIT_ALERT_THRESHOLD) : doit survivre au
  // rechargement, sinon la contrainte de faillite disparaîtrait dès qu'on
  // recharge la page.
  if (typeof pdata.forSale === "boolean") p.forSale = pdata.forSale;
  if (typeof pdata.salePrice === "number") p.salePrice = pdata.salePrice;
  // Journal des matchs de la saison (voir serializePlayerRecord ci-dessus) :
  // absent = sauvegarde d'avant cette fonctionnalité, on garde `[]` (déjà
  // posé par le constructeur Player) plutôt que de crasher.
  if (Array.isArray(pdata.matchLog)) p.matchLog = pdata.matchLog.map(m => ({ ...m }));
  // Bonus temporaire de MVP (voir serializePlayerRecord ci-dessus) : absent
  // = sauvegarde d'avant cette fonctionnalité, on garde 0 (déjà posé par le
  // constructeur Player).
  if (typeof pdata.pendingMatchBoost === "number") p.pendingMatchBoost = pdata.pendingMatchBoost;
  // Demande de transfert (voir serializePlayerRecord ci-dessus) : absent =
  // sauvegarde d'avant cette fonctionnalité, on garde les valeurs neutres
  // déjà posées par le constructeur Player (aucune demande en cours).
  if (typeof pdata.weeksAtLowMotivation === "number") p.weeksAtLowMotivation = pdata.weeksAtLowMotivation;
  if (typeof pdata.transferRequestActive === "boolean") p.transferRequestActive = pdata.transferRequestActive;
  if (typeof pdata.transferRequestQuote === "string") p.transferRequestQuote = pdata.transferRequestQuote;
  return p;
}

function teamFromSave(data) {
  const players = data.players.map(playerFromSave);
  const team = new Team({ name: data.teamName, players });
  team.week = data.week || 1;
  // Identité manager (voir serializeTeam ci-dessus) : absente = sauvegarde
  // d'avant ce champ (ou équipe CPU, qui ne l'a jamais eu) — `false`/`null`
  // par défaut (déjà la valeur posée par le constructeur Team), donc rien à
  // faire de spécial pour une ancienne sauvegarde : ni crash, ni équipe
  // faussement marquée humaine.
  team.isHuman = !!data.isHuman;
  team.managerLinkToken = data.managerLinkToken || null;
  // Droit d'administration de ligue (voir serializeTeam ci-dessus) : absente
  // = sauvegarde d'avant ce champ (ou équipe non-admin) — `false` par défaut
  // (déjà la valeur posée par le constructeur Team).
  team.isAdmin = !!data.isAdmin;
  if (data.offensivePriorities) team.offensivePriorities = data.offensivePriorities;
  if (data.defense) team.defense = data.defense;
  if (data.rhythm) team.rhythm = data.rhythm;
  // Tactique confirmée — absente = sauvegarde d'avant cette fonctionnalité,
  // on garde les valeurs standard déjà posées par `new Team(...)` ci-dessus
  // (voir le commentaire de sécurité dans Team.constructor).
  if (data.tacticalTier) team.tacticalTier = data.tacticalTier;
  if (data.screenDefense) team.screenDefense = data.screenDefense;
  if (data.helpDefense) team.helpDefense = data.helpDefense;
  if (Array.isArray(data.watchAssignments)) team.watchAssignments = data.watchAssignments.map(a => ({ ...a }));
  if (data.postDefense) team.postDefense = data.postDefense;
  if (data.closeoutStyle) team.closeoutStyle = data.closeoutStyle;
  if (data.offRebStyle) team.offRebStyle = data.offRebStyle;
  if (data.endgameManagement) team.endgameManagement = data.endgameManagement;
  // Tutoriel d'accueil, absente = sauvegarde d'avant cette fonctionnalité,
  // on garde `false` (déjà la valeur posée par le constructeur Team).
  team.onboardingTourCompleted = !!data.onboardingTourCompleted;
  // Primes du tutoriel déjà créditées, absente = sauvegarde d'avant cette
  // fonctionnalité, on garde `[]` (déjà la valeur posée par le
  // constructeur Team) : ne recrédite RIEN rétroactivement pour un
  // tutoriel déjà terminé avant ce correctif (2026-09, retour utilisateur
  // "Mets les vrais primes sur le tutoriel").
  team.tutorialRewardsClaimed = Array.isArray(data.tutorialRewardsClaimed) ? data.tutorialRewardsClaimed : [];
  // Retour utilisateur (2026-09) : "enleve l'entrainement aucune" — plus
  // aucune sauvegarde ne doit se retrouver avec trainingSkill à `null`
  // (ancienne option "Aucune", ou simplement absente d'une sauvegarde
  // d'avant cette fonctionnalité) : on retombe alors sur le nouveau défaut
  // "Lancer franc" (freeThrow), comme pour une toute nouvelle équipe (voir
  // le constructeur), plutôt que de perpétuer une valeur qui n'est plus
  // sélectionnable depuis l'écran Entraînement.
  team.trainingSkill = (data.trainingSkill && TRAINING_PROGRAMS[data.trainingSkill]) ? data.trainingSkill : "freeThrow";
  team.trainingPositions = Array.isArray(data.trainingPositions) ? data.trainingPositions : [];
  if (data.trainer && TRAINER_LEVELS.includes(data.trainer.level)) {
    // baseSalary préservé explicitement (bug corrigé 2026-09 : il était
    // silencieusement perdu ici, donc trainerSalary() retombait sur le
    // tarif fixe TRAINER_BASE_SALARY[level] à chaque rechargement au lieu
    // du salaire de départ réel — invisible avant l'introduction du marché
    // aux enchères des entraîneurs, puisque les deux étaient alors toujours
    // identiques). Repli sur TRAINER_BASE_SALARY[level] pour une sauvegarde
    // d'avant cette fonctionnalité (data.trainer.baseSalary absent) —
    // `trainerWeeklySalary` gérerait aussi bien un `undefined` via son
    // `!= null`, mais l'expliciter ici rend le salaire cohérent dès ce
    // chargement plutôt que de dépendre de ce détail ailleurs.
    team.trainer = {
      level: data.trainer.level,
      weeksEmployed: data.trainer.weeksEmployed || 0,
      baseSalary: data.trainer.baseSalary != null ? data.trainer.baseSalary : (TRAINER_BASE_SALARY[data.trainer.level] || 0),
    };
  }
  // Analyste vidéo — même logique de restauration que l'entraîneur
  // ci-dessus (baseSalary explicitement préservé, même repli sur
  // TRAINER_BASE_SALARY[level] pour une sauvegarde d'avant cette
  // fonctionnalité).
  if (data.videoAnalyst && TRAINER_LEVELS.includes(data.videoAnalyst.level)) {
    team.videoAnalyst = {
      level: data.videoAnalyst.level,
      weeksEmployed: data.videoAnalyst.weeksEmployed || 0,
      baseSalary: data.videoAnalyst.baseSalary != null ? data.videoAnalyst.baseSalary : (TRAINER_BASE_SALARY[data.videoAnalyst.level] || 0),
    };
  }
  // Recruteur — même logique de restauration que l'entraîneur/l'analyste
  // vidéo ci-dessus.
  if (data.recruiter && TRAINER_LEVELS.includes(data.recruiter.level)) {
    team.recruiter = {
      level: data.recruiter.level,
      weeksEmployed: data.recruiter.weeksEmployed || 0,
      baseSalary: data.recruiter.baseSalary != null ? data.recruiter.baseSalary : (TRAINER_BASE_SALARY[data.recruiter.level] || 0),
    };
  }
  // Académie de jeunes (voir serializeTeam ci-dessus) : `[]`/`1` par défaut
  // (déjà les valeurs posées par le constructeur Team) pour une sauvegarde
  // d'avant cette fonctionnalité — aucun candidat/jeune, Centre de formation
  // au palier 1, comme au tout premier lancement. `playerFromSave` restaure
  // déjà toute la forme "joueur" (potentiel EXACT compris, jamais recalculé
  // au chargement) — réutilisée telle quelle ici, sans dupliquer cette
  // logique (voir serializePlayerRecord/playerFromSave).
  team.youthPlayers = Array.isArray(data.youthPlayers) ? data.youthPlayers.map(playerFromSave) : [];
  team.youthCandidates = Array.isArray(data.youthCandidates)
    ? data.youthCandidates.map(pdata => {
        const c = playerFromSave(pdata);
        c.createdAt = typeof pdata.createdAt === "number" ? pdata.createdAt : null;
        c.expiresAt = typeof pdata.expiresAt === "number" ? pdata.expiresAt : null;
        return c;
      })
    : [];
  if (TRAINING_CENTER_LEVELS.some(t => t.level === data.trainingCenterLevel)) {
    team.trainingCenterLevel = data.trainingCenterLevel;
  }
  // Palmarès du club (voir Team.academyGraduates ci-dessus) : une
  // sauvegarde d'avant cette fonctionnalité retombe proprement sur 0 (déjà
  // la valeur posée par le constructeur Team), jamais undefined/NaN.
  team.academyGraduates = typeof data.academyGraduates === "number" ? data.academyGraduates : 0;
  // Historique du centre de formation (voir Team.academyGraduatesHistory
  // ci-dessus) : `[]` par défaut pour une sauvegarde d'avant cette
  // fonctionnalité (déjà la valeur posée par le constructeur Team), jamais
  // undefined.
  team.academyGraduatesHistory = Array.isArray(data.academyGraduatesHistory)
    ? data.academyGraduatesHistory.map(h => ({ ...h }))
    : [];
  // Dernier rapport hebdomadaire d'entraînement (voir
  // Team.lastTrainingReport ci-dessus) : `null` par défaut (déjà la valeur
  // posée par le constructeur Team) pour une sauvegarde d'avant cette
  // fonctionnalité, ou tant qu'aucune semaine d'entraînement n'a encore
  // été jouée.
  team.lastTrainingReport = cloneTrainingReport(data.lastTrainingReport);
  team.pendingYouthDecisions = Array.isArray(data.pendingYouthDecisions) ? [...data.pendingYouthDecisions] : [];
  // Scoutisme (voir Team.scoutedAttrs/lastVideoSessionAt ci-dessus) :
  // `{}`/`null` par défaut (déjà la valeur posée par le constructeur Team)
  // pour une sauvegarde d'avant cette fonctionnalité — aucun adversaire
  // scouté, comme au tout premier lancement.
  team.scoutedAttrs = data.scoutedAttrs && typeof data.scoutedAttrs === "object" ? data.scoutedAttrs : {};
  team.lastVideoSessionAt = typeof data.lastVideoSessionAt === "number" ? data.lastVideoSessionAt : null;
  team.ordresValidatedRound = typeof data.ordresValidatedRound === "number" ? data.ordresValidatedRound : null;
  if (typeof data.budget === "number") team.budget = data.budget;
  if (typeof data.deficitWeeks === "number") team.deficitWeeks = data.deficitWeeks;
  if (ARENA_LEVELS.some(a => a.level === data.arenaLevel)) team.arenaLevel = data.arenaLevel;
  // Sauvegarde à jour (prix par catégorie de place) : on prend ce qui est
  // là et on comble les catégories manquantes avec leur défaut. Ancienne
  // sauvegarde (avant l'introduction des catégories, un seul "ticketPrice")
  // : on réutilise cette valeur pour les gradins, le reste part du défaut —
  // c'est mieux qu'une remise à zéro complète du réglage tarifaire du joueur.
  if (data.ticketPrices && typeof data.ticketPrices === "object") {
    SEAT_CATEGORIES.forEach(cat => {
      if (typeof data.ticketPrices[cat.key] === "number") team.ticketPrices[cat.key] = data.ticketPrices[cat.key];
    });
  } else if (typeof data.ticketPrice === "number") {
    team.ticketPrices.gradins = data.ticketPrice;
  }
  if (FAN_SHOP_LEVELS.some(f => f.level === data.fanShopLevel)) team.fanShopLevel = data.fanShopLevel;
  // Autres infrastructures (voir CLUB_FACILITIES/serializeTeam ci-dessus) :
  // absente = sauvegarde d'avant cette fonctionnalité, on garde
  // {tvStation:0, gym:0, wellness:0} déjà posé par le constructeur Team
  // (aucun effet, comme au tout premier lancement). Chaque niveau est
  // revalidé individuellement contre sa propre grille de paliers, jamais
  // recopié tel quel.
  if (data.facilityLevels && typeof data.facilityLevels === "object") {
    Object.keys(CLUB_FACILITIES).forEach(key => {
      const lvl = data.facilityLevels[key];
      if (CLUB_FACILITIES[key].levels.some(l => l.level === lvl)) {
        team.facilityLevels[key] = lvl;
      }
    });
  }
  team.transactions = Array.isArray(data.transactions) ? data.transactions : [];
  if (typeof data.fanMorale === "number") team.fanMorale = clamp(data.fanMorale, 0, 100);
  team.moraleHistory = Array.isArray(data.moraleHistory) ? data.moraleHistory : [];
  // Objectif de saison du conseil d'administration (voir serializeTeam
  // ci-dessus) : `null` par défaut (constructeur), une sauvegarde d'avant
  // cette fonctionnalité n'en a simplement pas encore.
  if (typeof data.seasonObjective === "string") team.seasonObjective = data.seasonObjective;
  // Alchimie d'équipe (voir serializeTeam ci-dessus). Absent (sauvegarde
  // d'avant cette fonctionnalité) : on garde les valeurs déjà posées par le
  // constructeur (chemistry neutre à 50, aucun instantané tactique de
  // référence).
  if (typeof data.chemistry === "number") team.chemistry = clamp(data.chemistry, 0, 100);
  if (data.lastTacticsSnapshotForChemistry && Array.isArray(data.lastTacticsSnapshotForChemistry.offense)) {
    team.lastTacticsSnapshotForChemistry = {
      offense: [...data.lastTacticsSnapshotForChemistry.offense],
      defense: data.lastTacticsSnapshotForChemistry.defense,
      rhythm: data.lastTacticsSnapshotForChemistry.rhythm,
    };
  }
  // Identité tactique établie (voir serializeTeam ci-dessus/
  // Team.establishedTacticsSnapshot). Absent (sauvegarde d'avant cette
  // fonctionnalité) : on reprend lastTacticsSnapshotForChemistry ci-dessus
  // quand il existe (une carrière déjà en cours part du principe que sa
  // tactique la plus récente est déjà son identité établie), sinon `null`
  // (déjà posé par le constructeur).
  if (data.establishedTacticsSnapshot && Array.isArray(data.establishedTacticsSnapshot.offense)) {
    team.establishedTacticsSnapshot = {
      offense: [...data.establishedTacticsSnapshot.offense],
      defense: data.establishedTacticsSnapshot.defense,
      rhythm: data.establishedTacticsSnapshot.rhythm,
    };
  } else if (team.lastTacticsSnapshotForChemistry) {
    team.establishedTacticsSnapshot = {
      offense: [...team.lastTacticsSnapshotForChemistry.offense],
      defense: team.lastTacticsSnapshotForChemistry.defense,
      rhythm: team.lastTacticsSnapshotForChemistry.rhythm,
    };
  }
  // Entraînement collectif (voir serializeTeam ci-dessus). Absent (sauvegarde
  // d'avant cette fonctionnalité) : on garde null (déjà posé par le
  // constructeur, aucun focus collectif).
  team.collectiveTraining = data.collectiveTraining === "tactique" || data.collectiveTraining === "recuperation"
    ? data.collectiveTraining
    : null;
  // Tactique précisément travaillée à l'entraînement (voir serializeTeam
  // ci-dessus) : UN SEUL aspect ({ category, value }) depuis ce correctif
  // (2026-09, retour utilisateur : "un seul aspect et pas tous les aspects")
  // — une ancienne sauvegarde au format précédent ({ offense, defense,
  // rhythm }) n'est plus reconnue comme valide (pas de `category`/`value`)
  // et retombe donc sur `null`, exactement comme une sauvegarde d'avant
  // cette fonctionnalité (déjà posé par le constructeur) : rien de cassé,
  // juste rien de précis à ré-entraîner tant que le manager n'a pas refait
  // son choix depuis la nouvelle interface.
  team.trainedTactics = (data.trainedTactics && typeof data.trainedTactics === "object"
    && ["offense", "defense", "rhythm"].includes(data.trainedTactics.category)
    && typeof data.trainedTactics.value === "string")
    ? { category: data.trainedTactics.category, value: data.trainedTactics.value }
    : null;
  // Historique quotidien de l'entraînement collectif (voir serializeTeam
  // ci-dessus/Team.collectiveTrainingLog). Absent = sauvegarde d'avant cette
  // fonctionnalité, on garde [] (déjà posé par le constructeur) : aucun jour
  // encore banqué, comme une toute nouvelle équipe.
  team.collectiveTrainingLog = Array.isArray(data.collectiveTrainingLog)
    ? data.collectiveTrainingLog
      .filter(e => e && typeof e.dayIndex === "number")
      .map(e => ({
        dayIndex: e.dayIndex,
        collectiveTraining: e.collectiveTraining === "tactique" || e.collectiveTraining === "recuperation" ? e.collectiveTraining : null,
        trainedTactics: (e.trainedTactics && ["offense", "defense", "rhythm"].includes(e.trainedTactics.category) && typeof e.trainedTactics.value === "string")
          ? { category: e.trainedTactics.category, value: e.trainedTactics.value }
          : null,
      }))
    : [];
  team.tacticsCycleStartDayIndex = typeof data.tacticsCycleStartDayIndex === "number" ? data.tacticsCycleStartDayIndex : null;
  // Interviews en attente (voir serializeTeam ci-dessus) : absent = sauvegarde
  // d'avant cette fonctionnalité, on garde [] (déjà posé par le constructeur).
  team.pendingInterviews = Array.isArray(data.pendingInterviews) ? data.pendingInterviews.map(i => ({ ...i })) : [];
  // MVP automatique du dernier match (voir serializeTeam ci-dessus) : absent
  // = sauvegarde d'avant cette fonctionnalité, on garde `null` (déjà posé
  // par le constructeur).
  team.lastMatchMvp = data.lastMatchMvp && typeof data.lastMatchMvp === "object" ? { ...data.lastMatchMvp } : null;
  // Identité du club (voir serializeTeam ci-dessus) : absent = sauvegarde
  // d'avant cette fonctionnalité, on garde les valeurs par défaut déjà
  // posées par le constructeur (logo type, forme/couleur de maillot par
  // défaut, club gratuit) plutôt que d'accepter n'importe quelle valeur
  // brute non validée venant de la sauvegarde.
  team.isPaying = !!data.isPaying;
  team.customLogoDataUrl = typeof data.customLogoDataUrl === "string" ? data.customLogoDataUrl : null;
  if (JERSEY_SHAPES.includes(data.jerseyShape)) team.jerseyShape = data.jerseyShape;
  if (JERSEY_COLORS[data.jerseyColor]) team.jerseyColor = data.jerseyColor;
  if (JERSEY_PATTERNS.includes(data.jerseyPattern)) team.jerseyPattern = data.jerseyPattern;
  if (JERSEY_TWO_TONE_SETS[data.jerseyTwoTone]) team.jerseyTwoTone = data.jerseyTwoTone;
  // Maillot extérieur (voir serializeTeam ci-dessus) : absent = sauvegarde
  // d'avant cette fonctionnalité, on garde la valeur par défaut déjà posée
  // par le constructeur (couleur contrastant avec le maillot domicile déjà
  // restauré juste au-dessus, motif "uni", club gratuit) plutôt que
  // d'accepter une valeur brute non validée.
  if (JERSEY_COLORS[data.awayJerseyColor]) team.awayJerseyColor = data.awayJerseyColor;
  if (JERSEY_PATTERNS.includes(data.awayJerseyPattern)) team.awayJerseyPattern = data.awayJerseyPattern;
  if (JERSEY_TWO_TONE_SETS[data.awayJerseyTwoTone]) team.awayJerseyTwoTone = data.awayJerseyTwoTone;
  // Fiche club (voir serializeTeam ci-dessus) : absent = sauvegarde d'avant
  // cette fonctionnalité, on garde les valeurs par défaut déjà posées par le
  // constructeur (foundedYear tiré à l'instant, trophies vide) plutôt que
  // d'accepter une valeur brute non validée.
  if (typeof data.foundedYear === "number") team.foundedYear = data.foundedYear;
  // Migration ponctuelle (retour utilisateur, 2026-09 : "on a tjrs des
  // dates de création random") : une sauvegarde sans le marqueur
  // `foundedYearRealDate` vient forcément d'avant le passage à une date de
  // fondation réelle (voir generateFoundedYear/commit "Annee de fondation
  // du club reelle" plus haut), donc son foundedYear est l'ancien âge
  // fictif tiré au hasard (5 à 90 ans). On "re-fonde" le club une seule
  // fois à la date réelle du jour, exactement comme un club fraîchement
  // créé, puis on pose le marqueur pour ne plus jamais y retoucher ensuite
  // (foundedYear reste figé pour de bon à partir de là, même principe que
  // Player.name/height).
  if (!data.foundedYearRealDate) {
    team.foundedYear = generateFoundedYear();
  }
  team.foundedYearRealDate = true;
  if (Array.isArray(data.trophies)) team.trophies = data.trophies.map(t => ({ ...t }));
  // Historique d'affluence (voir serializeTeam ci-dessus) : absent = sauvegarde
  // d'avant cette fonctionnalité, on garde [] (déjà posé par le constructeur).
  team.attendanceHistory = Array.isArray(data.attendanceHistory) ? data.attendanceHistory : [];
  // Feuille de match sauvegardée (titulaires + remplaçants, éventuellement
  // sur plusieurs postes) ; si absente (ancienne sauvegarde) ou invalide, la
  // feuille auto-assignée par défaut du constructeur reste en place.
  if (data.lineup && data.lineup.starters) {
    // Les clés d'objet JS sont toujours des chaînes (même écrites avec un id
    // numérique), donc Object.entries(...) renvoie des id-chaînes alors que
    // p.id est un nombre (voir uid() dans le moteur) : on normalise via
    // String() pour la recherche, puis on retombe sur le vrai p.id (typé
    // correctement) pour le stockage — sinon un Set de nombres ne matche
    // jamais un id-chaîne et la feuille de match sauvegardée se vide au
    // rechargement.
    const byStringId = new Map(team.players.map(p => [String(p.id), p]));
    const starters = {};
    POSITIONS.forEach(pos => {
      const rawId = data.lineup.starters[pos];
      const p = rawId != null ? byStringId.get(String(rawId)) : null;
      starters[pos] = p ? p.id : null;
    });
    const backupPositions = {};
    Object.entries(data.lineup.backupPositions || {}).forEach(([idStr, positions]) => {
      const p = byStringId.get(idStr);
      if (p && Array.isArray(positions) && positions.length) backupPositions[p.id] = [...positions];
    });
    team.lineup = { starters, backupPositions };
  }
  // Journées futures préparées à l'avance (voir serializeTeam ci-dessus) ;
  // absent = sauvegarde d'avant cette fonctionnalité, {} par défaut
  // (constructeur) reste en place — aucune journée future préparée.
  if (data.plannedTactics && typeof data.plannedTactics === "object") {
    // Migration (correctif 2026-09, voir planKey/Team.constructor) : une
    // sauvegarde antérieure à la clé composite "{compétition}:{journée}"
    // stockait plannedTactics avec une clé = simple numéro de journée de
    // championnat (Coupe n'avait alors AUCUNE planification à l'avance,
    // donc une telle clé ne pouvait être QUE du championnat). Une clé déjà
    // au nouveau format ("championship:3", "cup:1"...) est laissée telle
    // quelle ; seule une clé purement numérique ("3") est réécrite en
    // "championship:3", faute de quoi getPlanForRound/stagePlanForRound/
    // applyPlannedTacticsForRound (qui ne savent plus lire que le nouveau
    // format) ne la retrouveraient plus jamais.
    const migrated = {};
    Object.entries(data.plannedTactics).forEach(([key, plan]) => {
      const migratedKey = /^\d+$/.test(key) ? `championship:${key}` : key;
      migrated[migratedKey] = plan;
    });
    team.plannedTactics = migrated;
  }
  return team;
}

// Ligue (calendrier de saison) : sérialisation similaire à une équipe, mais
// à part de "mon équipe" — voir League ci-dessus. Les adversaires (CPU ou,
// plus tard, d'autres managers réels) sont sauvegardés avec le même format
// qu'une équipe classique (mêmes fonctions serializeTeam/teamFromSave).
function serializeLeague(lg) {
  return {
    teams: lg.teams.map(serializeTeam),
    round: lg.round,
    results: lg.results,
    playoffs: lg.playoffs,
    relegationBarrage: lg.relegationBarrage || null,
    divisionLevel: lg.divisionLevel || 1,
    // Marché des transferts (voir League.transferListings/refreshMarket) :
    // doit survivre à un rechargement de page, les enchères se déroulant en
    // temps RÉEL (3 jours) — bien plus long qu'une simple session de jeu.
    transferListings: lg.transferListings || [],
    lastCpuListingCheckAt: lg.lastCpuListingCheckAt || null,
    // Marché des entraîneurs (voir League.coachListings/refreshCoachMarket)
    // : même raison de survie au rechargement que transferListings ci-dessus
    // (enchères en temps réel, plusieurs jours).
    coachListings: lg.coachListings || [],
    lastCoachGenerationCheckAt: lg.lastCoachGenerationCheckAt || 0,
    // Marché des analystes vidéo (voir League.analystListings/
    // refreshAnalystMarket) : même raison de survie au rechargement que
    // coachListings ci-dessus.
    analystListings: lg.analystListings || [],
    lastAnalystGenerationCheckAt: lg.lastAnalystGenerationCheckAt || 0,
    // Marché des recruteurs (voir League.recruiterListings/
    // refreshRecruiterMarket) : même raison de survie au rechargement que
    // coachListings/analystListings ci-dessus.
    recruiterListings: lg.recruiterListings || [],
    lastRecruiterGenerationCheckAt: lg.lastRecruiterGenerationCheckAt || 0,
    // Calendrier réel (voir League.calendarStartAt/lastAutoTrainedWeek et
    // server/calendar.js) : absent (`null`/`-1`) pour une ligue qui tourne
    // encore uniquement "à la demande" (mode navigateur actuel, sans
    // serveur) — c'est le serveur (voir server/store.js) qui les renseigne.
    calendarStartAt: typeof lg.calendarStartAt === "number" ? lg.calendarStartAt : null,
    lastAutoTrainedWeek: typeof lg.lastAutoTrainedWeek === "number" ? lg.lastAutoTrainedWeek : -1,
    // Rythme de calendrier figé pour cette ligue (voir
    // League.calendarWeekMs/calendarSlotOffsetsMs ci-dessus) : `null` =
    // calendrier classique (rétro-compatible avec les sauvegardes d'avant
    // ce réglage, et cas normal pour toute ligue qui n'a jamais tourné en
    // mode accéléré).
    calendarWeekMs: typeof lg.calendarWeekMs === "number" ? lg.calendarWeekMs : null,
    calendarSlotOffsetsMs: Array.isArray(lg.calendarSlotOffsetsMs) ? lg.calendarSlotOffsetsMs : null,
    // Calendrier ancré quotidien + coupe (voir League.calendarDailyAnchored/
    // lastAutoTrainedDay/cup ci-dessus) : `false`/`-1`/`null` pour toute
    // ligue qui n'utilise pas ce rythme (carrière solo, ou ligue
    // multi-manager d'avant cette fonctionnalité) — rétro-compatible.
    calendarDailyAnchored: !!lg.calendarDailyAnchored,
    lastAutoTrainedDay: typeof lg.lastAutoTrainedDay === "number" ? lg.lastAutoTrainedDay : -1,
    cup: lg.cup || null,
    // Diffusions en direct en cours (voir League.liveMatches ci-dessus) :
    // doivent survivre à un rechargement de page/redémarrage du serveur en
    // plein milieu d'un match, sinon reprendre "là où on en est" (retour
    // utilisateur) serait impossible après un simple redémarrage. Une entrée
    // par match diffusé (voir Team.isHuman — plusieurs managers humains
    // peuvent chacun avoir la leur en même temps).
    liveMatches: lg.liveMatches || {},
    // Confort d'affichage résolu PAR L'APPELANT pour UN destinataire précis
    // (voir League.liveMatch ci-dessus et server/liveMatch.js:
    // viewLiveMatchForTeam) — `null` si l'appelant n'a rien résolu de
    // particulier ; jamais recalculé ici.
    liveMatch: lg.liveMatch || null,
  };
}

// Reconstruit la ligue à partir d'une sauvegarde. `userTeam` (optionnel) DOIT
// être l'instance déjà reconstruite pour UNE équipe humaine gérée LOCALEMENT
// (usage historique solo : teams[0] côté client comme côté serveur) : un
// seul objet Team, jamais une copie, sinon l'entraînement et la progression
// se désynchroniseraient du reste de l'état — dans ce cas-là uniquement,
// teams[0] est remplacé par cette instance plutôt que reconstruit depuis la
// sauvegarde. Omis (ou `null`) : TOUTES les équipes (humaines comme CPU) sont
// reconstruites à l'identique via teamFromSave, chacune portant déjà sa
// propre identité manager (isHuman/managerLinkToken, voir teamFromSave) —
// c'est le chemin multi-manager (voir server/store.js), où il n'y a plus une
// seule équipe "locale" privilégiée à l'index 0.
function leagueFromSave(data, userTeam = null) {
  const teams = data.teams.map((t, i) => (i === 0 && userTeam ? userTeam : teamFromSave(t)));
  const lg = new League(teams);
  lg.round = data.round || 0;
  lg.results = Array.isArray(data.results) ? data.results : [];
  lg.playoffs = data.playoffs || null;
  lg.relegationBarrage = data.relegationBarrage || null;
  // Ancienne sauvegarde sans pyramide de divisions (avant l'ajout de la
  // montée/descente) : un club "pas encore attribué" prend la place la plus
  // haute disponible, donc Division I par défaut (voir generateLeague).
  lg.divisionLevel = data.divisionLevel || 1;
  lg.transferListings = Array.isArray(data.transferListings) ? data.transferListings : [];
  lg.lastCpuListingCheckAt = typeof data.lastCpuListingCheckAt === "number" ? data.lastCpuListingCheckAt : null;
  lg.coachListings = Array.isArray(data.coachListings) ? data.coachListings : [];
  lg.lastCoachGenerationCheckAt = typeof data.lastCoachGenerationCheckAt === "number" ? data.lastCoachGenerationCheckAt : 0;
  lg.analystListings = Array.isArray(data.analystListings) ? data.analystListings : [];
  lg.lastAnalystGenerationCheckAt = typeof data.lastAnalystGenerationCheckAt === "number" ? data.lastAnalystGenerationCheckAt : 0;
  lg.recruiterListings = Array.isArray(data.recruiterListings) ? data.recruiterListings : [];
  lg.lastRecruiterGenerationCheckAt = typeof data.lastRecruiterGenerationCheckAt === "number" ? data.lastRecruiterGenerationCheckAt : 0;
  lg.calendarStartAt = typeof data.calendarStartAt === "number" ? data.calendarStartAt : null;
  lg.lastAutoTrainedWeek = typeof data.lastAutoTrainedWeek === "number" ? data.lastAutoTrainedWeek : -1;
  lg.calendarWeekMs = typeof data.calendarWeekMs === "number" ? data.calendarWeekMs : null;
  lg.calendarSlotOffsetsMs = Array.isArray(data.calendarSlotOffsetsMs) ? data.calendarSlotOffsetsMs : null;
  lg.calendarDailyAnchored = !!data.calendarDailyAnchored;
  lg.lastAutoTrainedDay = typeof data.lastAutoTrainedDay === "number" ? data.lastAutoTrainedDay : -1;
  lg.cup = data.cup || null;
  // Ancienne sauvegarde (avant liveMatches au pluriel) : `data.liveMatches`
  // absent, {} par défaut (constructeur) reste en place — aucune diffusion
  // en cours reprise, comme avant ce champ.
  lg.liveMatches = data.liveMatches && typeof data.liveMatches === "object" ? data.liveMatches : {};
  lg.liveMatch = data.liveMatch || null;
  return lg;
}

// ---------------------------------------------------------------------
// MOTEUR DE MATCH
// ---------------------------------------------------------------------
const QUARTER_SECONDS = 10 * 60;
// Prolongation standard : 5 minutes, plus courte qu'un quart-temps normal.
const OVERTIME_SECONDS = 5 * 60;

class MatchEngine {
  constructor(teamA, teamB) {
    this.teamA = teamA;
    this.teamB = teamB;
  }

  fmtClock(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // `meta` (optionnel) porte des champs structurés en plus du texte narratif
  // (type/team/zone/made...) — voir playPossession et consorts plus bas.
  // Utilisé par le client pour animer une vue 2D du terrain (position du
  // ballon/marqueur) en plus du fil de texte existant, SANS toucher au
  // mécanisme de diffusion (airAt/schedulePlayback) qui se contente déjà de
  // propager tous les champs d'un événement tels quels (voir
  // server/liveMatch.js:schedulePlayback, `{...ev, airAt}`).
  log(events, quarter, clock, text, meta) {
    const A = this.teamA.players.reduce((s, p) => s + p.stats.pts, 0);
    const B = this.teamB.players.reduce((s, p) => s + p.stats.pts, 0);
    events.push({ quarter, clock: this.fmtClock(clock), text, score: { A, B }, ...(meta || null) });
  }

  // "A" si `team` est this.teamA, "B" sinon — repère utilisé par les
  // événements structurés (meta.team) pour dire quelle équipe est concernée,
  // dans le même repère A/B que le reste (score, boxScoreA/B...).
  teamKey(team) {
    return team === this.teamA ? "A" : "B";
  }

  // +/- (retour utilisateur, 2026-09 : "ajouté les colonnes de stats :
  // évaluation et +/- dans les box score (match terminé et aussi sur les
  // live)") : appelée à CHAQUE point marqué (panier ou lancer franc, voir
  // playPossession/freeThrows plus bas, jamais recalculée a posteriori) —
  // applique `+points` aux joueurs SUR LE TERRAIN de l'équipe qui vient de
  // marquer et `-points` à ceux de l'équipe adverse à cet instant précis
  // (définition standard du +/- : différentiel de points pendant le temps de
  // jeu d'un joueur), jamais aux joueurs sur le banc à ce moment-là.
  applyPlusMinusForPoints(scoringTeam, points) {
    if (!points) return;
    const otherTeam = scoringTeam === this.teamA ? this.teamB : this.teamA;
    scoringTeam.onCourtPlayers().forEach(p => { p.stats.plusMinus = (p.stats.plusMinus || 0) + points; });
    otherTeam.onCourtPlayers().forEach(p => { p.stats.plusMinus = (p.stats.plusMinus || 0) - points; });
  }

  starPlayer(team) {
    return team.onCourtPlayers().slice().sort((a, b) => b.overall() - a.overall())[0];
  }

  matchupDefender(defTeam, offPlayer, zone) {
    const onCourt = defTeam.onCourtPlayers();
    // Le poste JOUÉ CE MATCH (matchPosition) fait foi, pas le poste naturel
    // du joueur : un remplaçant aligné hors de son poste habituel est quand
    // même défendu/marqué comme occupant ce poste-là sur le terrain.
    const samePos = onCourt.filter(p => p.matchPosition === offPlayer.matchPosition);
    const pool = samePos.length ? samePos : onCourt;
    // Le coach adverse a tendance à mettre son meilleur défenseur au poste sur le
    // tireur (pondéré, pas un pur "toujours le meilleur" pour garder de l'aléa).
    const defKey = zone === "inside" ? "defInside" : "defOutside";
    return weightedPick(pool, p => Math.pow(p.eff(defKey) + 15, 1.6));
  }

  substituteIfNeeded(team, quarter, clock, events) {
    // NOTE (calibrage 2026-09) : l'ancienne version faisait `p.onCourt = false` dès
    // l'exclusion pour fautes, PUIS testait `if (!p.onCourt) continue;` juste après —
    // ce qui sautait systématiquement le remplacement. Un joueur exclu pour 5 fautes
    // n'était donc jamais remplacé et son équipe finissait le match à 4 contre 5.
    // Corrigé : on détermine d'abord si le joueur DOIT sortir (fauté out / blessé) ou
    // DEVRAIT sortir (fatigue / entre dans les problèmes de fautes), puis on ne touche
    // à onCourt qu'une fois qu'on sait si un remplaçant est disponible.
    for (const p of team.onCourtPlayers()) {
      if (!p.onCourt) continue; // déjà sorti plus tôt dans cette même passe

      if (p.fouls >= 5 && !p.disqualified) {
        p.disqualified = true;
        this.log(events, quarter, clock, say(PHRASES.foulOut, { player: p.name, team: team.name }), { type: "foulOut", team: this.teamKey(team) });
      }

      const mustLeave = p.disqualified || p.injured;
      const shouldRest = !mustLeave && (
        (p.fatigue >= 82 && !team.maintainDespiteFouls.has(p.id)) ||
        (p.fouls >= 4 && !team.maintainDespiteFouls.has(p.id))
      );
      if (!mustLeave && !shouldRest) continue;

      // Remplaçant pour LE POSTE QUE p OCCUPAIT (matchPosition), pas
      // forcément son poste naturel — voir Team.backupsForSlot.
      const replacement = team.backupsForSlot(p.matchPosition)[0];

      if (replacement) {
        p.onCourt = false;
        replacement.onCourt = true;
        replacement.matchPosition = p.matchPosition;
        if (!mustLeave) {
          this.log(events, quarter, clock, say(PHRASES.substitution, { replacement: replacement.name, player: p.name, team: team.name }), { type: "substitution", team: this.teamKey(team) });
        }
      } else if (mustLeave) {
        // Banc épuisé (rare) : le joueur sort quand même, l'équipe joue en infériorité.
        p.onCourt = false;
        this.log(events, quarter, clock, say(PHRASES.shortHanded, { team: team.name }), { type: "shortHanded", team: this.teamKey(team) });
      }
      // Si ce n'est qu'une question de fatigue/fautes (pas obligatoire) et qu'aucun
      // remplaçant n'est disponible, le joueur reste simplement sur le terrain.
    }
  }

  freeThrows(shooter, n, events, quarter, clock, team) {
    // Utilise désormais l'attribut dédié "freeThrow" (voir le grand
    // commentaire au-dessus d'ATTRS) au lieu de l'ancien proxy sur midRange :
    // un lanceur médiocre (freeThrow bas) et un bon shooteur mi-distance
    // peuvent maintenant diverger, comme dans la réalité. Plage plus large
    // que l'ancienne (50 à 93 % contre 55 à 92) pour que l'attribut se sente
    // réellement discriminant sur la ligne des lancers francs.
    const ftPct = clamp(0.50 + (shooter.eff("freeThrow") / 100) * 0.42, 0.50, 0.93);
    let made = 0;
    for (let i = 0; i < n; i++) {
      shooter.stats.fta++;
      if (Math.random() < ftPct) { made++; shooter.stats.ftm++; shooter.stats.pts++; }
    }
    if (made > 0) {
      this.applyPlusMinusForPoints(team, made);
      this.log(events, quarter, clock, say(PHRASES.freeThrows, { shooter: shooter.name, made, n }), { type: "freeThrow", team: this.teamKey(team), possession: this.teamKey(team) });
    }
    return made;
  }

  // scoreDiff = score(offTeam) - score(defTeam) au moment présent : sert aux
  // décisions de fin de match (faute intentionnelle, hero ball, gestion du chrono).
  playPossession(offTeam, defTeam, quarter, clock, events, scoreDiff) {
    const offense = offTeam.offenseProfile();
    const defense = DEFENSES[defTeam.defense];
    const rhythmOff = RHYTHMS[offTeam.rhythm];
    const onCourtOff = offTeam.onCourtPlayers();
    const onCourtDef = defTeam.onCourtPlayers();

    // --- Tactique confirmée (voir le grand commentaire au-dessus de
    // SCREEN_DEFENSES, plus haut dans ce fichier) : lookup une fois par
    // possession, toujours avec un repli neutre (`|| SCREEN_DEFENSES["Aucune
    // consigne"]` etc.) au cas où une valeur invalide/obsolète traînerait
    // quelque part — jamais de crash, jamais d'effet, comme si le réglage
    // n'était simplement pas défini.
    const screen = SCREEN_DEFENSES[defTeam.screenDefense] || SCREEN_DEFENSES["Aucune consigne"];
    const help = HELP_DEFENSE_LEVELS[defTeam.helpDefense] || HELP_DEFENSE_LEVELS.Moyenne;
    const postD = POST_DEFENSES[defTeam.postDefense] || POST_DEFENSES.Classique;
    const closeout = CLOSEOUT_STYLES[defTeam.closeoutStyle] || CLOSEOUT_STYLES.Contrôlé;
    const endgameMgmt = ENDGAME_MANAGEMENT[offTeam.endgameManagement] || ENDGAME_MANAGEMENT.Standard;
    // Poids du Pick & Roll dans les priorités offensives actuelles (une
    // priorité parmi N => 1/N, absent => 0) : la défense sur écrans n'a
    // d'effet que sur cette fraction des possessions, proportionnellement à
    // combien le Pick & Roll est réellement au coeur du plan offensif.
    const prWeight = offTeam.offensivePriorities.includes("Pick & Roll")
      ? 1 / offTeam.offensivePriorities.length : 0;
    // Garbage time (gestion de fin de match "Adaptatif" — retour utilisateur,
    // "on lève le pied" à partir de ±10 pts) : "Standard" a
    // blowoutThreshold=null, donc inBlowout est TOUJOURS false pour une
    // équipe qui n'a pas activé "Adaptatif" — comportement actuel inchangé.
    const inBlowout = endgameMgmt.blowoutThreshold != null && quarter >= 3 && Math.abs(scoreDiff) >= endgameMgmt.blowoutThreshold;

    // --- Rebond offensif agressif du côté adverse la possession précédente
    // (voir plus bas dans le bloc rebond) : contre-attaque, défense pas
    // encore replacée — consommé une seule fois (le flag est retiré dès
    // lecture), donc sans effet pour une équipe qui n'utilise jamais le
    // style "Agressif" (transitionRisk = 0, le flag n'est jamais posé).
    const transitionBoost = !!offTeam._transitionBoost;
    if (transitionBoost) delete offTeam._transitionBoost;

    // --- Money time : faute intentionnelle de l'équipe menée, en défense ---
    // Dans la dernière minute environ, une équipe menée d'un écart rattrapable
    // a intérêt à stopper le chrono plutôt que de laisser filer une possession.
    const inFoulWindow = quarter >= 4 && clock <= 50 && clock > 3;
    const shouldFoulIntentionally = inFoulWindow && scoreDiff >= 1 && scoreDiff <= 9 && Math.random() < 0.75;

    if (shouldFoulIntentionally) {
      const ballHandler = weightedPick(onCourtOff, p => p.eff("dribble") + p.eff("pass"));
      // On évite si possible de faire fauter un joueur déjà proche de l'exclusion.
      const defender = weightedPick(onCourtDef, p => Math.max(6 - p.fouls, 0.5));
      defender.stats.pf++; defender.fouls++;
      this.log(events, quarter, clock, say(PHRASES.intentionalFoul, { defender: defender.name, shooter: ballHandler.name, team: defTeam.name }), { type: "foul", team: this.teamKey(defTeam), possession: this.teamKey(offTeam) });
      this.freeThrows(ballHandler, 2, events, quarter, clock, offTeam);
      return { possessionOffense: false, scored: true, intentionalFoul: true };
    }

    // --- Perte de balle ---
    const ballHandler = weightedPick(onCourtOff, p => p.eff("dribble") + p.eff("pass"));
    const pressure = onCourtDef.reduce((s, p) => s + p.eff("defOutside"), 0) / 5;
    let tovChance = 0.12 + offense.tov + defense.pressure + (pressure - ballHandler.eff("dribble")) / 400;
    tovChance *= rhythmOff.tovMult;
    // Défense sur écrans "Prise à deux" (double sur le porteur au screen,
    // pondéré par prWeight — voir plus haut) et garbage time "Adaptatif"
    // (imprécision des deux côtés en fin de match déséquilibrée) : ajoutés
    // avant le clamp, comme le reste des composantes de tovChance. "Standard"
    // partout => ces deux termes valent 0, tovChance inchangé.
    tovChance += (screen.tovMod || 0) * prWeight;
    if (inBlowout) tovChance += endgameMgmt.blowoutTovMod;
    // Surveiller "couper les entrées de balle" (face-guard, voir
    // WATCH_FOCUS_EFFECTS) : bonus de tov CIBLÉ si le porteur actuel occupe
    // le poste surveillé ; watchGamblePenalty ci-dessous porte la
    // contrepartie (un peu de défBoost en moins plus bas dans la fonction),
    // tableau vide par défaut = aucun effet.
    // "reboundPriority" porte aussi une taxe de défBoost permanente (le
    // défenseur dédié au boxout aide un peu moins ailleurs) — appliquée ici,
    // possession par possession, même les possessions qui ne finissent pas
    // par un rebond (voir watchGamblePenalty juste en dessous).
    let watchGamblePenalty = 0;
    for (const w of (defTeam.watchAssignments || []).slice(0, MAX_WATCH_ASSIGNMENTS)) {
      const eff = WATCH_FOCUS_EFFECTS[w.focus];
      if (!eff) continue;
      if (w.focus === "denyEntry") {
        watchGamblePenalty += eff.defBoostPenalty || 0;
        if (w.position === ballHandler.matchPosition) tovChance += eff.tovBonus || 0;
      } else if (w.focus === "reboundPriority") {
        watchGamblePenalty += eff.defBoostPenalty || 0;
      }
    }
    tovChance = clamp(tovChance, 0.03, 0.35);

    if (Math.random() < tovChance) {
      ballHandler.stats.tov++;
      // Mental / tilt (voir consecutiveMisses et le grand commentaire
      // au-dessus d'ATTRS) : une perte de balle compte comme un raté pour la
      // série qui alimente le malus de tilt du prochain tir.
      ballHandler.consecutiveMisses++;
      const stealer = weightedPick(onCourtDef, p => p.eff("agility") + p.eff("defOutside"));
      if (Math.random() < 0.55) {
        stealer.stats.stl++;
        this.log(events, quarter, clock, say(PHRASES.turnoverSteal, { stealer: stealer.name, ballHandler: ballHandler.name }), { type: "turnover", team: this.teamKey(offTeam), possession: this.teamKey(offTeam) });
      } else {
        this.log(events, quarter, clock, say(PHRASES.turnoverPlain, { ballHandler: ballHandler.name, team: offTeam.name }), { type: "turnover", team: this.teamKey(offTeam), possession: this.teamKey(offTeam) });
      }
      return { possessionOffense: false };
    }

    const zoneRoll = Math.random();
    let zone;
    if (zoneRoll < offense.inside) zone = "inside";
    else if (zoneRoll < offense.inside + offense.mid) zone = "mid";
    else zone = "three";

    const statForZone = { inside: "inside", mid: "midRange", three: "threePoint" }[zone];

    // --- Hero ball : en money time, le meilleur joueur prend plus de tirs ---
    // "Standard" => heroMult = 1.7 pile dans la fenêtre clutch, comportement
    // actuel inchangé.
    const clutch = quarter >= 4 && clock <= 120 && Math.abs(scoreDiff) <= 8;
    const star = this.starPlayer(offTeam);
    const heroMult = clutch ? 1.7 : 1;
    // Gestion de fin de match "Adaptatif" : en garbage time (écart >= seuil, dès
    // le Q3), l'équipe qui mène (ou est menée) large ne force plus autant
    // le jeu sur sa star — MULTIPLICATEUR SÉPARÉ du hero-ball clutch
    // ci-dessus (les deux fenêtres, |écart|<=8 pour le clutch et |écart|>=10
    // pour le blowout, sont mutuellement exclusives par construction, donc
    // jamais cumulées). Borné pour ne jamais tomber sous 0.3 (la star reste
    // un joueur normal, jamais activement évitée). "Standard" =>
    // blowoutThreshold=null => inBlowout toujours faux => blowoutHeroMult=1,
    // comportement actuel inchangé.
    const blowoutHeroMult = inBlowout ? Math.max(1 + endgameMgmt.blowoutHeroMod, 0.3) : 1;
    const shooter = weightedPick(onCourtOff, p =>
      Math.pow(p.eff(statForZone), 2.1) * (star && p.id === star.id ? heroMult * blowoutHeroMult : 1)
    );
    const defender = this.matchupDefender(defTeam, shooter, zone);

    const creators = onCourtOff.filter(p => p.id !== shooter.id);
    const creator = creators.length ? weightedPick(creators, p => p.eff("pass")) : null;

    let creation = (shooter.eff("dribble") + shooter.eff("agility") + (creator ? creator.eff("pass") * 0.8 : 0)) / (creator ? 2.8 : 2);
    // Défense sur écrans : n'affecte que la fraction de possessions
    // "Pick & Roll" (prWeight) — gêne (ou pas) la création du porteur selon
    // le choix du coach défenseur. "Aucune consigne" => ballCreationMod = 0.
    creation *= 1 + (screen.ballCreationMod || 0) * prWeight;

    const defStat = zone === "inside" ? defender.eff("defInside") : defender.eff("defOutside");
    let defBoost = zone === "inside" ? defense.insideDef : defense.perimDef;
    if (defense.shutdownStar && star && shooter.id === star.id) defBoost += 0.12;

    // --- Aide défensive (Faible/Moyenne/Forte) : déplace le curseur
    // intérieur/extérieur — "Moyenne" = delta zéro, comportement actuel. ---
    defBoost += zone === "inside" ? help.insideDef : help.perimDef;
    // --- Gestion du post-up, uniquement en zone "inside" — "Classique" =
    // delta zéro. ---
    if (zone === "inside") defBoost += postD.insideDef;
    // --- Close-out, uniquement en zone extérieure (mid/3pts) — "Contrôlé"
    // = delta zéro. ---
    if (zone !== "inside") defBoost += closeout.perimDefMod;
    // --- Surveiller : contrepartie de "couper les entrées de balle"/
    // "priorité au rebond" (voir plus haut où le bonus de tov ciblé est
    // appliqué) — un peu de défBoost en moins sur TOUTE la possession tant
    // que l'affectation existe, prix générique du pari schématique. Tableau
    // vide par défaut => 0. ---
    defBoost -= watchGamblePenalty;

    // --- Effet de matchup : taille en intérieur, agilité en extérieur/pénétration ---
    let mismatch = zone === "inside"
      ? (shooter.height - defender.height) * 0.22
      : (shooter.eff("agility") - defender.eff("agility")) * 0.11;
    // --- Close-out agressif : meilleur contest extérieur ci-dessus, mais
    // avantage offensif accru à l'intérieur (le risque de pénétration
    // derrière une fermeture trop appuyée) — "Contrôlé" = delta zéro. ---
    if (zone === "inside") mismatch += closeout.insideMismatchMod || 0;
    // --- Défense sur écrans "Switch" : n'élimine pas d'avantage moyen mais
    // ajoute de la variance (mismatch de taille/agilité aléatoire selon qui
    // se retrouve switché sur qui) — terme centré sur 0, donc sans biais
    // systématique. "Aucune consigne" => mismatchVarianceMod = 0. ---
    if (screen.mismatchVarianceMod) mismatch += screen.mismatchVarianceMod * prWeight * rand(-15, 15);

    // --- Défense sur écrans "Au-dessus"/"En-dessous" : le porteur est gêné
    // (ballCreationMod, déjà appliqué plus haut) mais ça ouvre différemment
    // le jeu selon où le shooteur finit par tirer — le rouleur profite d'un
    // panier ouvert en zone "inside" (rollOpennessMod), le tireur extérieur
    // profite d'un tir plus ouvert derrière un défenseur passé dessous
    // (shooterOpennessMod). Les deux pondérés par prWeight — "Aucune consigne" => 0.

    // --- Surveiller : bonus défensif ciblé si le tireur occupe le poste
    // sous surveillance avec le bon focus, contrepartie en fatigue
    // supplémentaire pour le défenseur dédié (sauf denyDrive, dont la
    // contrepartie est l'ouverture accrue sur le 3pts — voir plus bas). ---
    for (const w of (defTeam.watchAssignments || []).slice(0, MAX_WATCH_ASSIGNMENTS)) {
      if (w.position !== shooter.matchPosition) continue;
      const eff = WATCH_FOCUS_EFFECTS[w.focus];
      if (!eff) continue;
      if (w.focus === "denyPostUp" && zone === "inside") {
        defBoost += eff.insideDefBonus || 0;
        defender.fatigue = clamp(defender.fatigue + (eff.extraFatigueMod || 0), 0, 100);
      } else if (w.focus === "denyDrive") {
        // Colle sur les drives : meilleur contest en pénétration (inside/mid),
        // mais le défenseur reste sur la ligne de drive plutôt que de fermer
        // la ligne à 3pts — inverse exact du compromis de harassOutsideShot.
        if (zone !== "three") {
          defBoost += eff.insideMidDefBonus || 0;
          defender.fatigue = clamp(defender.fatigue + (eff.extraFatigueMod || 0), 0, 100);
        } else {
          defBoost -= eff.perimOpenPenalty || 0;
        }
      } else if (w.focus === "harassOutsideShot" && zone !== "inside") {
        defBoost += eff.perimDefBonusWide || 0;
        defender.fatigue = clamp(defender.fatigue + (eff.extraFatigueMod || 0), 0, 100);
      }
    }

    // --- Rebond offensif agressif de la possession précédente : contre-
    // attaque, défense pas replacée — bonus d'ouverture ponctuel, consommé
    // une seule fois (voir transitionBoost plus haut). ---
    const transitionOpenness = transitionBoost ? 14 : 0;

    const screenOpennessBonus = zone === "inside"
      ? (screen.rollOpennessMod || 0) * prWeight
      : (screen.shooterOpennessMod || 0) * prWeight;

    const openness = (creation - defStat * (1 + defBoost)) / 2 + mismatch + transitionOpenness + screenOpennessBonus + rand(-12, 12);
    let quality, qualityMod;
    if (openness > 8) { quality = "ouvert"; qualityMod = 0.08; }
    else if (openness > -10) { quality = "contesté"; qualityMod = 0; }
    else { quality = "très contesté"; qualityMod = -0.10; }

    const assistCandidate = creator;
    // --- Bonus d'assist ciblé : écran "Prise à deux" (kick-out après double
    // sur le porteur, pondéré par prWeight) et gestion du post-up (kick-out
    // après double/déplacement en zone "inside" uniquement) — "Aucune
    // consigne"/"Classique" => 0 dans les deux cas. Consommé plus bas, au moment du
    // test d'assist existant. ---
    const assistOpenBonus = (screen.assistOpenMod || 0) * prWeight + (zone === "inside" ? (postD.assistOpenMod || 0) : 0);

    const foulDrawBase = (zone === "inside" ? 0.10 : 0.03) + (offense.drawFoul || 0) + shooter.aggressiveness / 900
      + (zone === "inside" ? (postD.foulMod || 0) : 0);
    const shootingFoul = Math.random() < clamp(foulDrawBase - defBoost, 0.01, 0.35);

    const base = { inside: 0.50, mid: 0.40, three: 0.335 }[zone];
    const effStat = shooter.eff(statForZone);
    let prob = base + (effStat - 60) * 0.0048 + qualityMod;
    // Frein anti-blowout de base (retour utilisateur : "on a un peu trop vite
    // de gros blowout") — même deux équipes RIGOUREUSEMENT de même niveau
    // rejouées des milliers de fois produisaient déjà ~28% d'écarts ≥20 pts
    // et ~11% ≥30 pts (repères NBA : ~15% et ~3-4%), et ce n'était PAS un
    // effet des nouvelles options tactiques ni du banc d'essai — mesuré
    // identique avec effectif fixe rejoué (pas de régénération). Diagnostic :
    // resserrer le bruit de la formule d'ouverture (rand(-12,12)) ou rendre
    // le choix du tireur/défenseur déterministe ne change quasiment rien
    // (le second aggrave même la variance, en concentrant tous les tirs sur
    // un seul joueur) — la variance vient simplement du volume de tirages
    // aléatoires indépendants (~200 tirs/pertes/rebonds/LF par match), pas
    // d'un seul terme isolé. Le levier qui fonctionne : une légère poussée
    // de probabilité en fonction de l'écart au score ACTUEL (scoreDiff,
    // perspective de l'attaque) — l'équipe menée reprend un peu de
    // "présence" au tir, l'équipe qui mène en perd un peu, sans jamais
    // annuler un vrai écart de niveau (validé : 1.3 vs 0.7 reste un blowout
    // net de ~50 pts en moyenne, 0.65 vs 0.82 garde un écart net de ~17 pts
    // — seul l'EXCÈS de variance entre équipes ÉGALES est réduit : ~28%/11%
    // d'écarts ≥20/≥30 pts tombent à ~16%/3%, sans toucher FG%/score moyen).
    // Cumulatif avec ENDGAME_MANAGEMENT "Adaptatif" (qui reste un renfort
    // optionnel par-dessus ce plancher, inchangé) — "Standard" n'annule PAS
    // ce terme, volontairement : ce n'est pas un réglage tactique, c'est un
    // ajustement de calibrage du moteur lui-même.
    const marginDamp = clamp(-scoreDiff / 500, -0.06, 0.06);
    // Mental (voir le grand commentaire au-dessus d'ATTRS) : deux effets
    // additifs indépendants, appliqués avant le clamp final ci-dessous.
    // 1) Boost clutch : actif uniquement dans la fenêtre "clutch" existante
    //    (voir heroMult plus haut, ±8 pts, Q4, 2 dernières minutes) - un
    //    mental élevé transforme un tir serré en fin de match, un mental bas
    //    le fait douter. Pivot à 50 (valeur moyenne) => aucun effet pour un
    //    joueur "moyen", jusqu'à environ ±6 pts de % pour un mental extrême.
    const mentalClutchBoost = clutch ? (shooter.attrs.mental - 50) * 0.0012 : 0;
    // 2) Malus de "tilt" : après 3 ratés/pertes de balle d'affilée (voir
    //    consecutiveMisses, mis à jour plus bas et incrémenté aussi sur
    //    perte de balle) - un mental élevé (>=70) annule totalement le
    //    malus, un mental bas peut aller jusqu'à -9 pts de %.
    const tiltPenalty = shooter.consecutiveMisses >= 3
      ? clamp((70 - shooter.attrs.mental) * 0.0015, 0, 0.09) : 0;
    prob = clamp(prob + marginDamp + mentalClutchBoost - tiltPenalty, 0.10, 0.75);

    const made = Math.random() < prob;
    const points = zone === "three" ? 3 : 2;

    if (zone === "three") { shooter.stats.fga3++; } else { shooter.stats.fga2++; }
    if (zone === "inside") shooter.stats.paintAtt++;

    const shotLabel = zone === "three" ? "three" : zone === "mid" ? "mid" : "inside";

    if (made) {
      // Mental / tilt (voir consecutiveMisses plus haut) : un tir réussi
      // remet le compteur à zéro, quelle que soit sa longueur de série.
      shooter.consecutiveMisses = 0;
      shooter.stats.pts += points;
      this.applyPlusMinusForPoints(offTeam, points);
      if (zone === "three") shooter.stats.fgm3++; else shooter.stats.fgm2++;
      if (zone === "inside") shooter.stats.paintMade++;
      if (assistCandidate && quality === "ouvert" && Math.random() < 0.65 + offense.assist + assistOpenBonus) {
        assistCandidate.stats.ast++;
      }
      this.log(events, quarter, clock, say(PHRASES.madeShot[shotLabel], { shooter: shooter.name, quality, team: offTeam.name }), { type: "shot", team: this.teamKey(offTeam), zone, made: true, shooter: shooter.name, possession: this.teamKey(offTeam) });

      if (shootingFoul) {
        defender.stats.pf++; defender.fouls++;
        this.log(events, quarter, clock, say(PHRASES.andOne, { defender: defender.name, shooter: shooter.name }), { type: "foul", team: this.teamKey(defTeam), possession: this.teamKey(offTeam) });
        this.freeThrows(shooter, 1, events, quarter, clock, offTeam);
      }
      return { possessionOffense: false, scored: true };
    } else {
      // Mental / tilt (voir plus haut) : un tir raté incrémente le compteur,
      // même s'il est suivi de lancers francs (contre-attribué par le malus
      // de "tilt" au prochain tir).
      shooter.consecutiveMisses++;
      if (shootingFoul) {
        defender.stats.pf++; defender.fouls++;
        this.log(events, quarter, clock, say(PHRASES.missedFoul, { defender: defender.name, shooter: shooter.name }), { type: "shot", team: this.teamKey(offTeam), zone, made: false, shooter: shooter.name, possession: this.teamKey(offTeam) });
        this.freeThrows(shooter, zone === "three" ? 3 : 2, events, quarter, clock, offTeam);
        return { possessionOffense: false, scored: true };
      }

      // --- Rebond offensif (Prudent/Normal/Agressif) : "Normal" = delta
      // zéro, comportement actuel inchangé. ---
      const offRebStyle = OFF_REBOUND_STYLES[offTeam.offRebStyle] || OFF_REBOUND_STYLES.Normal;
      let offReb = onCourtOff.reduce((s, p) => s + p.eff("rebound") + p.height / 20, 0) * (1 + (offRebStyle.offRebWeightMod || 0));
      let defReb = onCourtDef.reduce((s, p) => s + p.eff("rebound") * 1.35 + p.height / 20, 0);
      // --- Surveiller "priorité au rebond" : boxout ciblé sur le joueur du
      // poste surveillé — réduit sa contribution à l'effort de rebond
      // offensif de son équipe (individualEff*offRebWeightPenalty en moins
      // du total offReb) et donne un petit bonus d'équipe au rebond défensif
      // (defRebTeamBonus, en points absolus — même échelle que les sommes
      // offReb/defReb ci-dessus, qui tournent typiquement autour de 60-90).
      // Tableau vide par défaut => aucun effet. ---
      for (const w of (defTeam.watchAssignments || []).slice(0, MAX_WATCH_ASSIGNMENTS)) {
        if (w.focus !== "reboundPriority") continue;
        const eff = WATCH_FOCUS_EFFECTS.reboundPriority;
        const target = onCourtOff.find(p => p.matchPosition === w.position);
        if (target) offReb -= (target.eff("rebound") + target.height / 20) * (eff.offRebWeightPenalty || 0);
        defReb += eff.defRebTeamBonus || 0;
      }
      offReb = Math.max(offReb, 1);
      const offensiveRebound = Math.random() < offReb / (offReb + defReb);

      // --- Contrepartie du style "Agressif" (retour utilisateur, "risque
      // de prendre des contre-attaques") : si le rebond offensif est
      // finalement manqué, la défense qui récupère hérite d'un bonus de
      // transition sur SA PROCHAINE possession (voir transitionBoost en
      // tête de fonction) — jamais posé pour "Normal"/"Prudent"
      // (transitionRisk = 0), donc sans effet pour qui ne joue pas agressif
      // au rebond offensif. ---
      if (!offensiveRebound && offRebStyle.transitionRisk && Math.random() < offRebStyle.transitionRisk) {
        defTeam._transitionBoost = true;
      }

      const rebounder = weightedPick(
        offensiveRebound ? onCourtOff : onCourtDef,
        p => p.eff("rebound") + p.height / 10
      );
      rebounder.stats.reb++;
      if (offensiveRebound) rebounder.stats.oreb++; else rebounder.stats.dreb++;

      this.log(events, quarter, clock, say(
        offensiveRebound ? PHRASES.reboundOff : PHRASES.reboundDef,
        { shooter: shooter.name, rebounder: rebounder.name }
      ), { type: "rebound", team: this.teamKey(offensiveRebound ? offTeam : defTeam), zone, made: false, shooter: shooter.name, possession: this.teamKey(offensiveRebound ? offTeam : defTeam) });

      return { possessionOffense: offensiveRebound };
    }
  }

  applyFatigue(team, rhythmKey, seconds, quarter, clock, events) {
    const mult = RHYTHMS[rhythmKey].fatigueMult;
    // Espace bien-être (voir Team.facilityFatigueMult/CLUB_FACILITIES) :
    // réduit l'accumulation de fatigue EN MATCH, 1 = aucun effet (aucun
    // espace bien-être construit) — n'agit jamais sur la récupération au
    // repos plus bas, seulement sur le rythme d'accumulation pendant le jeu.
    const wellnessMult = team.facilityFatigueMult ? team.facilityFatigueMult() : 1;
    team.onCourtPlayers().forEach(p => {
      // Endurance (voir le grand commentaire au-dessus d'ATTRS) : version
      // INDIVIDUELLE de l'effet "espace bien-être" ci-dessus, réduit
      // l'accumulation de fatigue EN MATCH propre à CE joueur uniquement -
      // pivot à 50 (valeur moyenne) pour que le comportement d'un joueur
      // "moyen" reste identique à avant l'ajout de cet attribut. N'agit
      // jamais sur la récupération sur le banc (ligne plus bas) ni sur la
      // forme physique jour après jour (currentCondition) : uniquement sur
      // le rythme d'accumulation pendant le jeu, comme demandé.
      const enduranceMult = 1.25 - (p.attrs.endurance / 100) * 0.5;
      p.fatigue = clamp(p.fatigue + (seconds / 24) * mult * wellnessMult * enduranceMult, 0, 100);
      p.secondsPlayed += seconds;
      if (p.matchPosition) {
        p.secondsPlayedByPosition[p.matchPosition] = (p.secondsPlayedByPosition[p.matchPosition] || 0) + seconds;
        // Même ventilation, mais CUMULÉE sur tous les matchs du cycle
        // d'entraînement (voir Player.trainingSecondsPlayedByPosition) :
        // jamais remise à zéro par resetForMatch, contrairement à la ligne
        // ci-dessus.
        p.trainingSecondsPlayedByPosition[p.matchPosition] = (p.trainingSecondsPlayedByPosition[p.matchPosition] || 0) + seconds;
      }

      // --- Blessures --- (rare, plus probable si le joueur est fatigué,
      // atténuée par la salle de musculation — voir
      // Team.facilityInjuryRiskMult/CLUB_FACILITIES, 1 = aucun effet)
      if (!p.injured) {
        const fatigueFactor = 0.25 + 0.75 * (p.fatigue / 100);
        const injuryRiskMult = team.facilityInjuryRiskMult ? team.facilityInjuryRiskMult() : 1;
        // Forme physique (retour utilisateur : "0-39 Épuisé -> gros malus +
        // risque de blessure augmenté", voir CONDITION_STATES plus haut) :
        // multiplicateur additionnel, indépendant de injuryRiskMult
        // (infrastructures du club) et de fatigueFactor (énergie EN MATCH
        // ci-dessus) — un joueur peut très bien être frais EN MATCH
        // (fatigue basse) mais arriver déjà éprouvé par son calendrier des
        // derniers jours (condition basse), et inversement.
        const conditionInjuryMult = conditionStateFor(p.matchCondition ?? p.condition).injuryMult;
        const injuryChance = BASE_INJURY_RATE * (seconds / 12) * fatigueFactor * injuryRiskMult * conditionInjuryMult;
        if (Math.random() < injuryChance) {
          p.injured = true;
          p.onCourt = false;
          // Tire le type et la durée RÉELLE d'indisponibilité (voir
          // INJURY_TYPES/rollInjury plus haut) : PERSISTANT, contrairement à
          // `injured` juste au-dessus (remis à false au prochain match).
          // `this.matchNow` posé par simulate() ci-dessus ; repli sur
          // Date.now() dans le cas (jamais rencontré en pratique) où
          // applyFatigue serait appelée hors de simulate().
          const rolled = rollInjury(this.matchNow ?? Date.now());
          p.injuryType = rolled.injuryType;
          p.injuryUntil = rolled.injuryUntil;
          this.log(events, quarter, clock, say(PHRASES.injury, { player: p.name, team: team.name }), { type: "injury", team: this.teamKey(team) });
        }
      }
    });
    // Tout joueur qui n'est pas sur le terrain récupère en repos — y compris
    // un titulaire mis au repos temporairement (l'ancien code ne récupérait
    // que le banc/les réservistes, jamais un titulaire sorti du match).
    team.players.filter(p => !p.onCourt).forEach(p => {
      p.fatigue = clamp(p.fatigue - (seconds / 40), 0, 100);
    });
  }

  simulate(now = Date.now()) {
    // Conservé sur l'instance (plutôt que reponduit dans la signature de
    // chaque méthode appelée depuis ici) : quelques mécanismes ponctuels ont
    // besoin de "maintenant" en dehors de resetForMatch (voir rollInjury
    // dans applyFatigue plus bas) sans pour autant vouloir threader `now` à
    // travers toute la chaîne d'appels existante.
    this.matchNow = now;
    this.teamA.resetForMatch(now);
    this.teamB.resetForMatch(now);
    const events = [];
    const quarterScores = { A: [0, 0, 0, 0], B: [0, 0, 0, 0] };
    let score = { A: 0, B: 0 };
    let possessionTeam = Math.random() < 0.5 ? "A" : "B";

    // Retour utilisateur : "début du premier quart temps, faut le mettre
    // avan[t] l'entre deux est remporté par..." — le marqueur "Début du 1er
    // quart-temps" doit précéder l'annonce de l'entre-deux dans le fil
    // (l'ordre narratif logique : le quart-temps commence, PUIS l'entre-deux
    // a lieu), pas l'inverse comme précédemment. On loggue donc ce marqueur
    // ICI, avant l'entre-deux, pour le 1er quart-temps UNIQUEMENT — la
    // boucle plus bas (qui loggue le même marqueur pour Q2/Q3/Q4 et les
    // prolongations) saute cette première itération pour ne pas le
    // dupliquer (voir `if (q > 1)` plus bas).
    this.log(events, 1, QUARTER_SECONDS, `Début du 1er quart-temps`, { type: "quarterStart" });

    // Retour utilisateur : "à 10:00 du Q1, ça doit être dit, l'entre-deux
    // est remporté par ..." — jusqu'ici `possessionTeam` (qui a la balle en
    // premier) était tiré au sort mais jamais annoncé. `possession` (en plus
    // de `team`, qui garde son sens narratif existant — voir plus bas) donne
    // aussi au client de quoi savoir qui a la balle en direct (retour
    // utilisateur : "on ne sait pas qui a la balle" — voir
    // updateLiveClockTick côté client).
    const tipOffWinner = possessionTeam === "A" ? this.teamA : this.teamB;
    this.log(events, 1, QUARTER_SECONDS, `L'entre-deux est remporté par ${tipOffWinner.name}.`, { type: "tipoff", team: this.teamKey(tipOffWinner), possession: this.teamKey(tipOffWinner) });

    // Un match de basket ne peut pas finir sur une égalité : au-delà du 4e
    // quart-temps, on enchaîne des prolongations de 5 minutes (règle
    // standard) jusqu'à ce qu'une équipe soit devant. Un garde-fou arbitraire
    // (10 prolongations, un cas quasi impossible en pratique) évite toute
    // boucle infinie théorique.
    let q = 0;
    while (true) {
      q++;
      const isOvertime = q > 4;
      if (isOvertime && quarterScores.A.length < q) { quarterScores.A.push(0); quarterScores.B.push(0); }
      let clock = isOvertime ? OVERTIME_SECONDS : QUARTER_SECONDS;
      const label = isOvertime ? `Prolongation ${q - 4}` : `${q}${q === 1 ? "er" : "e"} quart-temps`;
      // Le marqueur du 1er quart-temps est déjà loggué plus haut, AVANT
      // l'entre-deux (voir commentaire ci-dessus) — ne pas le dupliquer ici.
      if (q > 1) {
        this.log(events, q, clock, `Début ${isOvertime ? "de la" : "du"} ${label}`, { type: "quarterStart" });
      }
      const startScoreA = score.A, startScoreB = score.B;

      while (clock > 0) {
        const offTeam = possessionTeam === "A" ? this.teamA : this.teamB;
        const defTeam = possessionTeam === "A" ? this.teamB : this.teamA;
        const offScore = possessionTeam === "A" ? score.A : score.B;
        const defScore = possessionTeam === "A" ? score.B : score.A;
        const scoreDiff = offScore - defScore;

        const rhythmOff = RHYTHMS[offTeam.rhythm];
        const rhythmDef = RHYTHMS[defTeam.rhythm];
        const avgPossessions = (rhythmOff.possessionsPerQuarter + rhythmDef.possessionsPerQuarter) / 2;
        let possessionLength = clamp(QUARTER_SECONDS / avgPossessions + rand(-3, 3), 6, 30);

        // --- Money time : l'équipe qui mène de peu en fin de match (ou de
        // prolongation) fait tourner le chrono --- (vérifie le temps encore
        // au chrono AVANT cette possession, donc sur `clock` non décrémenté)
        const offIsMilkingClock = q >= 4 && clock <= 150 && scoreDiff > 0 && scoreDiff <= 12;
        if (offIsMilkingClock) possessionLength = Math.max(possessionLength, rand(18, 24));

        // --- Gestion de fin de match "Adaptatif" (retour utilisateur, 2026-09 —
        // "en fin de match si écart de moins de 5 points on calme le jeu ou
        // on accélère") : dans les 5 dernières minutes d'un match serré
        // (écart < 5, quel que soit le sens), un peu plus d'urgence dans le
        // tempo des DEUX équipes — sauf quand l'équipe en possession fait
        // déjà tourner le chrono (offIsMilkingClock, qui reste prioritaire :
        // une équipe qui mène de peu protège son avance avant de chercher à
        // accélérer). "Standard" (comportement actuel) => aucun effet.
        const endgameMgmtOff = ENDGAME_MANAGEMENT[offTeam.endgameManagement] || ENDGAME_MANAGEMENT.Standard;
        const closeGame = endgameMgmtOff.closeGameTempoMod > 0 && q >= 4 && clock <= 300 && Math.abs(scoreDiff) < 5;
        if (closeGame && !offIsMilkingClock) possessionLength *= (1 - endgameMgmtOff.closeGameTempoMod);

        possessionLength = Math.min(possessionLength, clock);

        // Retour utilisateur : "on ne peut pas avoir un tir marqué à 10:00,
        // ce n'est pas possible en vrai". Le chrono décrémentait AVANT ce
        // correctif seulement APRÈS avoir joué (et donc loggué) la
        // possession — playPossession recevait donc le chrono D'AVANT que
        // cette possession n'ait consommé la moindre seconde, si bien que la
        // toute première possession d'un quart-temps (qui démarre pile à
        // QUARTER_SECONDS) loggait son tir/sa perte de balle/sa faute à
        // "10:00" pile, comme si aucun temps ne s'était écoulé depuis
        // l'entre-deux. On décrémente maintenant le chrono ICI, AVANT de
        // jouer la possession, pour que playPossession/log() reçoivent
        // toujours un chrono qui reflète le temps RÉELLEMENT écoulé une fois
        // cette possession jouée — sans rien changer au principe déjà en
        // place ailleurs (plusieurs événements d'UNE MÊME possession, ex.
        // rebond offensif puis tir de suivi, continuent de partager
        // exactement le même chrono, puisqu'ils reçoivent tous cette même
        // valeur `clock` désormais décrémentée une fois pour toutes ici).
        clock -= possessionLength;
        clock = Math.max(clock, 0);

        const result = this.playPossession(offTeam, defTeam, q, clock, events, scoreDiff);

        score.A = this.teamA.players.reduce((s, p) => s + p.stats.pts, 0);
        score.B = this.teamB.players.reduce((s, p) => s + p.stats.pts, 0);

        this.applyFatigue(this.teamA, this.teamA.rhythm, possessionLength, q, clock, events);
        this.applyFatigue(this.teamB, this.teamB.rhythm, possessionLength, q, clock, events);

        this.substituteIfNeeded(this.teamA, q, clock, events);
        this.substituteIfNeeded(this.teamB, q, clock, events);

        if (!result.possessionOffense) {
          possessionTeam = possessionTeam === "A" ? "B" : "A";
        }
      }

      quarterScores.A[q - 1] = score.A - startScoreA;
      quarterScores.B[q - 1] = score.B - startScoreB;
      this.log(events, q, 0, `Fin ${isOvertime ? "de la" : "du"} ${label} : ${this.teamA.name} ${score.A} - ${score.B} ${this.teamB.name}`, { type: "quarterEnd" });

      if (q >= 4 && score.A !== score.B) break;
      if (q >= 14) {
        // Garde-fou théorique : n'arrive quasiment jamais en pratique.
        if (score.A === score.B) score.A += 1;
        break;
      }
    }

    return {
      finalScore: score,
      quarterScores,
      events,
      boxScoreA: this.buildBoxScore(this.teamA),
      boxScoreB: this.buildBoxScore(this.teamB),
    };
  }

  buildBoxScore(team) {
    return team.players
      .filter(p => p.secondsPlayed > 0)
      .sort((a, b) => b.secondsPlayed - a.secondsPlayed)
      .map(p => ({
        name: p.name, position: p.matchPosition || p.position,
        min: Math.max(1, Math.round(p.secondsPlayed / 60)),
        ...p.stats,
      }));
  }
}

return {
  POSITIONS, ATTRS, TRAINING_LABELS, TRAINING_SYNERGY, TRAINING_FULL_MATCH_SECONDS, attendanceFactorForSeconds,
  TRAINING_HOME_POSITION, TRAINING_DILUTION_BY_POSITION_COUNT, TRAINING_HEIGHT_AFFINITY,
  positionEfficiencyForSkill, rankedPositionsForSkill, trainingPositionOptions, heightMultiplierForSkill,
  TRAINING_PROGRAMS, WEIGHT_BY_PROGRAM_SIZE, positionEfficiencyForProgram, rankedPositionsForProgram,
  trainingPositionOptionsForProgram, heightMultiplierForProgram,
  TRAINER_LEVELS, TRAINER_BASE_SALARY, TRAINER_WEEKLY_GROWTH, TRAINER_TRAINING_BONUS, CLUB_STARTING_BUDGET,
  ANALYST_REVEAL_COUNT_BY_LEVEL,
  // Académie de jeunes (voir le grand commentaire au-dessus de MAX_YOUTH_ROSTER_SIZE) :
  MAX_YOUTH_ROSTER_SIZE, YOUTH_TRAINEE_WEEKLY_SALARY, YOUTH_CANDIDATE_QUEUE_MAX, YOUTH_CANDIDATE_EXPIRY_MS,
  YOUTH_CANDIDATE_DAILY_CHANCE_BY_LEVEL, YOUTH_QUALITY_TIER_BY_LEVEL, YOUTH_STANDOUT_CHANCE_BY_LEVEL,
  YOUTH_BASE_TRAINING_WEIGHT, generateYouthCandidate, youthProspectLabel,
  TRAINING_CENTER_LEVELS, trainingCenterInfo,
  STARTUP_SUBSIDY_AMOUNT, STARTUP_SUBSIDY_WEEKS,
  PROMOTION_BONUS_BY_LEVEL, PROMOTION_BONUS_FLOOR, CHAMPION_BONUS_DIVISION_I, seasonEndBonusFor,
  // Objectif de saison du conseil d'administration (voir le grand
  // commentaire au-dessus de SEASON_OBJECTIVE_TIERS) :
  SEASON_OBJECTIVE_TIERS, SEASON_OBJECTIVE_LABELS, SEASON_ACHIEVEMENT_LABELS,
  SEASON_OBJECTIVE_MISS_MALUS_PER_TIER, SEASON_OBJECTIVE_EXCEED_BONUS_PER_TIER, SEASON_OBJECTIVE_MET_BONUS,
  assignSeasonObjectives, seasonAchievementTier, seasonObjectiveVerdict,
  // Signal de mi-saison du même objectif (voir le grand commentaire
  // au-dessus de seasonObjectiveMidSeasonSignal) :
  SEASON_OBJECTIVE_MIDSEASON_MISS_MALUS_PER_TIER, SEASON_OBJECTIVE_MIDSEASON_EXCEED_BONUS_PER_TIER,
  SEASON_OBJECTIVE_MIDSEASON_MET_BONUS, currentStandingsPaceObjective, seasonObjectiveMidSeasonSignal,
  DEFICIT_ALERT_THRESHOLD, DEFICIT_GRACE_WEEKS,
  TV_RIGHTS_WEEKLY_BY_LEVEL,
  TRANSFER_AUCTION_DURATION_MS, TRANSFER_MIN_INCREMENT_FLAT, TRANSFER_MIN_INCREMENT_PCT,
  TRANSFER_CPU_CHECK_INTERVAL_MS, TRANSFER_CPU_LIST_CHANCE, TRANSFER_CPU_BID_CHANCE,
  COACH_AUCTION_DURATION_MS, COACH_MARKET_MIN_OPEN_LISTINGS, COACH_MARKET_GENERATE_CHECK_INTERVAL_MS, COACH_CPU_BID_CHANCE,
  MIN_ROSTER_SIZE, MAX_ROSTER_SIZE, estimateMarketValue, transferMinIncrement, minNextBidFor,
  FORFEIT_SCORE, simulateOrForfeit, recordMatchStatsForTeam, awardMatchMvp, recordMatchStatsAndAwardMvp,
  ARENA_LEVELS, arenaInfo, ticketPriceComfortFactor, SEAT_CATEGORIES, seatCategoryInfo,
  FAN_SHOP_LEVELS, fanShopInfo, attendanceBaseForMorale, moraleForgiveness, moraleLabel,
  JERSEY_COLORS, JERSEY_SHAPES, JERSEY_PATTERNS, JERSEY_TWO_TONE_SETS, defaultAwayJerseyColor, MAX_TEAM_LOGO_DATA_URL_LENGTH,
  // Interviews de jalon + MVP automatique (retour utilisateur, 2026-09 : voir
  // le grand commentaire au-dessus de MILESTONE_INTERVIEW_TYPES/MVP_ATTR_BONUS).
  MILESTONE_INTERVIEW_TYPES, MILESTONE_INTERVIEW_TONES, MILESTONE_INTERVIEW_QUOTES,
  MILESTONE_INTERVIEW_QUESTIONS, interviewTranscriptFor,
  MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS, midSeasonRound, milestoneTypeForRound,
  statEvaluation, PIR_TIER_THRESHOLDS, PIR_TIER_COLORS, pirTier, MVP_ATTR_BONUS, MVP_QUOTES,
  TOUR_REWARD_BY_TOPIC,
  MAX_TEAM_TROPHIES, generateFoundedYear, computeClubReputationStars,
  // Forme physique (voir le grand commentaire au-dessus de CONDITION_STATES) :
  CONDITION_STATES, conditionStateFor, currentCondition, conditionLossForMinutes,
  CONDITION_DAY_MS, CONDITION_RECOVERY_PER_DAY, CONDITION_RECOVERY_PER_DAY_TRAINED,
  // Blessures persistantes (voir le grand commentaire au-dessus d'INJURY_TYPES) :
  INJURY_TYPES, rollInjury, isCurrentlyInjured, injuryDaysRemaining,
  // Motivation du joueur (voir le commentaire de motivationLabel au-dessus
  // de "class Player") :
  motivationLabel,
  // Motivation remontée à un plancher neutre lors d'un vrai changement de
  // club (voir le grand commentaire au-dessus de TRANSFER_NEW_CLUB_MOTIVATION_FLOOR) :
  TRANSFER_NEW_CLUB_MOTIVATION_FLOOR,
  // Frustration du banc (voir le grand commentaire au-dessus de
  // BENCH_FRUSTRATION_MAX_SECONDS) :
  BENCH_FRUSTRATION_MAX_SECONDS, BENCH_FRUSTRATION_BASE_MALUS, BENCH_FRUSTRATION_DESERVING_MULT,
  // Demande de transfert (voir le grand commentaire au-dessus de
  // TRANSFER_REQUEST_MOTIVATION_THRESHOLD) :
  TRANSFER_REQUEST_MOTIVATION_THRESHOLD, TRANSFER_REQUEST_WEEKS_THRESHOLD,
  TRANSFER_REQUEST_DISCUSS_BASE_CHANCE, TRANSFER_REQUEST_DISCUSS_MENTAL_BONUS,
  TRANSFER_REQUEST_DISCUSS_SUCCESS_FORM_BOOST, TRANSFER_REQUEST_QUOTES, transferRequestQuoteFor,
  // Alchimie d'équipe (voir le grand commentaire au-dessus de
  // CHEMISTRY_ROSTER_CHANGE_MAX_RANK) :
  CHEMISTRY_ROSTER_CHANGE_MAX_RANK, CHEMISTRY_ROSTER_CHANGE_BASE,
  CHEMISTRY_TACTICS_OFFENSE_PENALTY, CHEMISTRY_TACTICS_DEFENSE_PENALTY, CHEMISTRY_TACTICS_RHYTHM_PENALTY,
  CHEMISTRY_TACTICS_TRAINED_FACTOR, tacticsChangePenalty, tacticsEqual, parisCalendarDayIndex,
  chemistryRosterImportance, rosterRankOf, chemistryLabel,
  CLUB_FACILITIES, facilityInfo,
  POSITION_STRONG_ATTRS,
  SALARY_BASELINE_OVERALL, SALARY_AT_BASELINE, SALARY_GROWTH_PER_POINT, SALARY_MIN, salaryForOverall,
  POSITION_ATTR_PROFILE, ATTR_CATEGORY_WEIGHT, weightedRatingForPosition, levelCoefficientFor,
  CARD_POSITION_BIAS, inferPosition, SALARY_PEAK_BONUS_THRESHOLD, SALARY_PEAK_BONUS_FACTOR, SALARY_PEAK_BONUS_MAX, peakBonusFor,
  trainerWeeklySalary,
  OFFENSE_PROFILES, DEFENSES, RHYTHMS,
  // Tactique confirmée (voir le grand commentaire au-dessus de
  // SCREEN_DEFENSES) : exportées pour que l'UI (test bench / futur écran
  // "Ordres") puisse lister les options disponibles directement depuis ces
  // tables plutôt que de dupliquer les noms en dur.
  SCREEN_DEFENSES, HELP_DEFENSE_LEVELS, WATCH_FOCUS_EFFECTS, MAX_WATCH_ASSIGNMENTS,
  POST_DEFENSES, CLOSEOUT_STYLES, OFF_REBOUND_STYLES, ENDGAME_MANAGEMENT,
  clamp, rand, pick, weightedPick,
  Player, Team, MatchEngine,
  heightForPosition, generateAttrsForPosition, generateRawYouthAttrs, generateRawAttrsInRange, generatePlayer, generateTeam,
  generateRookiePlayer, generateStartingRoster,
  potentialHeadroom, growthFactorForAge, declineFactorForAge, YOUNG_PROSPECT_MAX_AGE, SEASON_LENGTH_WEEKS,
  POTENTIAL_TIERS, potentialTierLabel, potentialTierIndex,
  QUARTER_SECONDS, OVERTIME_SECONDS,
  CPU_TEAM_NAMES, generateRoundRobinSchedule, League, generateLeague, generateMultiManagerLeague,
  randomHexToken,
  CALENDAR_DAY_MS, CALENDAR_WEEK_MS, CALENDAR_CHAMPIONSHIP_SLOT_OFFSETS_MS, CALENDAR_ROUNDS_PER_REAL_WEEK,
  calendarScheduledTimeForRound, anchoredCalendarStartAt,
  // Calendrier ancré quotidien (voir le bloc dédié ci-dessus) :
  CALENDAR_PARIS_TIME_ZONE, CALENDAR_DAILY_ANCHORED_CHAMPIONSHIP_HOURS, CALENDAR_DAILY_ANCHORED_CUP_HOUR,
  parisUtcOffsetMs, parisLocalDateParts, addParisCalendarDays, parisEpochForLocalTime, sameParisCalendarDay,
  dailyAnchoredCalendarConfig, dailyAnchoredCalendarStartAt, dailyAnchoredScheduledTimeForSlot,
  dailyAnchoredDayIndexForChampionshipRound, dailyAnchoredSlotIndexForChampionshipRound,
  dailyAnchoredScheduledTimeForChampionshipRound, dailyAnchoredScheduledTimeForCupRound,
  // Coupe (voir le bloc dédié au-dessus de generateCupBracket) :
  CUP_BRACKET_SIZE, CUP_STAGE_NAMES, generateCupBracket, buildNextCupRound, shuffleIndices,
  // Clé composite de Team.plannedTactics (voir le grand commentaire dédié
  // au-dessus) : exportée pour planned_tactics_test.js (partie MOTEUR pure),
  // qui a besoin de construire la même clé que Team.getPlanForRound et
  // consorts pour vérifier des accès directs (ex. round-trip de
  // sérialisation), plutôt que de dupliquer cette formule dans le test.
  planKey,
  serializeTeam, serializePlayerRecord, playerFromSave, teamFromSave, serializeLeague, leagueFromSave,
  DIVISIONS, MAX_DIVISION_LEVEL, divisionInfo,
};

});
