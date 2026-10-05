// =====================================================================
// SUCCÈS DU MANAGER — REGISTRE CENTRAL (2026-10-05, remplace l'ancien
// système de 16 succès). Partagé tel quel par le moteur (engine.js, via
// require) et par le navigateur (window.HM_ACHIEVEMENTS) : une seule
// déclaration des succès, de leurs paliers et de leurs conditions.
//
//  - 20 succès à 3 paliers (Bronze, Argent, Or) + 5 succès Platine.
//  - `id` : identifiant STABLE (sauvegardes) — ne jamais le changer.
//  - Chaque palier : { need, stat } — palier obtenu quand
//    valeur(stat) >= need. La valeur vient de Team.achStats (compteurs
//    persistants tenus par le moteur, voir engine.js:achAdd/achMax/
//    achAddUnique) ; un tableau compte pour sa longueur (éléments distincts).
//  - `icon` : dessin vectoriel (chemins SVG, trait 1.8, viewBox 24×24),
//    jamais d'emoji (retour utilisateur 2026-10-05).
// =====================================================================
(function (root) {
  const T = (need, stat, text) => ({ need, stat, text });
  const ACHIEVEMENTS = [
    { id: "FIRST_MATCH", label: "Premier coup d'envoi", icon: "ball", desc: "Jouer des matchs officiels.",
      tiers: [T(1, "matches", "Jouer 1 match officiel"), T(25, "matches", "Jouer 25 matchs officiels"), T(100, "matches", "Jouer 100 matchs officiels")], unit: "matchs" },
    { id: "FIRST_WIN", label: "Première victoire", icon: "trophy", desc: "Remporter des matchs officiels (championnat, play-offs, coupes, Supercoupe).",
      tiers: [T(1, "wins", "Remporter 1 match officiel"), T(25, "wins", "Remporter 25 matchs officiels"), T(100, "wins", "Remporter 100 matchs officiels")], unit: "victoires" },
    { id: "TACTICS_MASTER", label: "À vos ordres", icon: "clipboard", desc: "Créer ses tactiques enregistrées et gagner avec.",
      tiers: [T(1, "presetsSaved", "Enregistrer sa première tactique personnalisée"), T(5, "presetsUsed", "Utiliser 5 tactiques personnalisées différentes en match officiel"), T(25, "presetWins", "Gagner 25 matchs officiels avec une tactique personnalisée")] },
    { id: "FIRST_TRAINING", label: "Première séance", icon: "dumbbell", desc: "Faire travailler ses joueurs en entraînement individuel.",
      tiers: [T(1, "trainings", "Effectuer 1 entraînement individuel"), T(25, "trainings", "Effectuer 25 entraînements individuels"), T(100, "trainings", "Effectuer 100 entraînements individuels")], unit: "séances" },
    { id: "FIRST_SIGNING", label: "Premier recrutement", icon: "contract", desc: "Signer des joueurs sur le marché (enchères et agents libres).",
      tiers: [T(1, "signings", "Signer 1 joueur sur le marché"), T(10, "signings", "Signer 10 joueurs sur le marché"), T(50, "signings", "Signer 50 joueurs sur le marché")], unit: "signatures" },
    { id: "SCOUT_EYE", label: "Œil du recruteur", icon: "eye", desc: "Mettre des joueurs dans ses Signets.",
      tiers: [T(1, "bookmarked", "Ajouter 1 joueur aux Signets"), T(25, "bookmarked", "Ajouter 25 joueurs aux Signets"), T(100, "bookmarked", "Ajouter 100 joueurs aux Signets")], unit: "joueurs" },
    { id: "PRUDENT_MANAGER", label: "Gestionnaire prudent", icon: "coins", desc: "Terminer des semaines avec un résultat financier positif.",
      tiers: [T(1, "posWeeks", "Terminer 1 semaine dans le vert"), T(10, "posWeeks", "Terminer 10 semaines dans le vert"), T(50, "posWeeks", "Terminer 50 semaines dans le vert")], unit: "semaines" },
    { id: "FULL_HOUSE", label: "Salle comble", icon: "arena", desc: "Remplir sa salle à 100 % lors d'un match de championnat à domicile.",
      tiers: [T(1, "fullHouse", "Salle pleine pour 1 match à domicile"), T(10, "fullHouse", "Salle pleine pour 10 matchs à domicile"), T(50, "fullHouse", "Salle pleine pour 50 matchs à domicile")], unit: "matchs" },
    { id: "FIRST_SEASON", label: "Première saison", icon: "calendar", desc: "Terminer des saisons complètes.",
      tiers: [T(1, "seasons", "Terminer 1 saison"), T(3, "seasons", "Terminer 3 saisons"), T(5, "seasons", "Terminer 5 saisons")], unit: "saisons" },
    { id: "FINAL_FOUR", label: "Dans le dernier carré", icon: "bracket", desc: "Se qualifier pour les play-offs du championnat.",
      tiers: [T(1, "playoffQuals", "1 qualification en play-offs"), T(3, "playoffQuals", "3 qualifications en play-offs"), T(5, "playoffQuals", "5 qualifications en play-offs")], unit: "qualifications" },
    { id: "CHAMPION", label: "Champion", icon: "crown", desc: "Être sacré champion de son championnat.",
      tiers: [T(1, "titles", "Remporter 1 championnat"), T(3, "titles", "Remporter 3 championnats"), T(5, "titles", "Remporter 5 championnats")], unit: "titres" },
    { id: "PROMOTION", label: "Ça monte !", icon: "arrowUp", desc: "Monter en division supérieure.",
      tiers: [T(1, "promotions", "Obtenir 1 montée"), T(3, "promotions", "Obtenir 3 montées"), T(5, "promotions", "Obtenir 5 montées")], unit: "montées" },
    { id: "CUP_WINNER", label: "Coupe en poche", icon: "cup", desc: "Remporter la Coupe.",
      tiers: [T(1, "cups", "Remporter 1 Coupe"), T(3, "cups", "Remporter 3 Coupes"), T(5, "cups", "Remporter 5 Coupes")], unit: "Coupes" },
    { id: "SUPERCUP", label: "Supercoupe", icon: "supercup", desc: "Remporter la Supercoupe.",
      tiers: [T(1, "supercups", "Remporter 1 Supercoupe"), T(3, "supercups", "Remporter 3 Supercoupes"), T(5, "supercups", "Remporter 5 Supercoupes")], unit: "Supercoupes" },
    { id: "STEAMROLLER", label: "Rouleau compresseur", icon: "roller", desc: "Victoires sur une même saison régulière.",
      tiers: [T(10, "bestRegWins", "Gagner 10 matchs d'une saison régulière"), T(15, "bestRegWins", "Gagner 15 matchs d'une saison régulière"), T(20, "bestRegWins", "Gagner 20 matchs d'une saison régulière")], unit: "victoires" },
    { id: "FORTRESS", label: "Forteresse", icon: "castle", desc: "Part de victoires à domicile sur une saison régulière.",
      tiers: [T(75, "bestHomePct", "75 % de victoires à domicile"), T(90, "bestHomePct", "90 % de victoires à domicile"), T(100, "bestHomePct", "100 % de victoires à domicile")], unit: "%" },
    { id: "MVP_MAKER", label: "Faiseur de MVP", icon: "star", desc: "Avoir des joueurs élus MVP.",
      tiers: [T(1, "matchMvp", "Un joueur élu MVP d'un match officiel"), T(1, "seasonMvp", "Un joueur élu MVP de la saison"), T(3, "seasonMvp", "3 fois le MVP de la saison")] },
    { id: "TALENT_SCOUT", label: "Dénicheur de talents", icon: "sprout", desc: "Faire éclore les jeunes de son académie.",
      tiers: [T(1, "homegrownMax", "Un joueur issu de l'académie dans l'effectif"), T(1, "bestYoungHG", "Un joueur de l'académie élu meilleur jeune"), T(3, "bestYoungHG", "3 fois meilleur jeune avec un joueur de l'académie")] },
    { id: "HARD_CORE", label: "Noyau dur", icon: "bricks", desc: "Garder des joueurs dans son effectif au moins 3 saisons.",
      tiers: [T(1, "keepMax", "1 joueur gardé 3 saisons"), T(3, "keepMax", "3 joueurs gardés 3 saisons"), T(5, "keepMax", "5 joueurs gardés 3 saisons")], unit: "joueurs" },
    { id: "CENTENARY", label: "Centenaire", icon: "laurel", desc: "Victoires en championnat avec son club.",
      tiers: [T(25, "champWins", "25 victoires de championnat"), T(100, "champWins", "100 victoires de championnat"), T(250, "champWins", "250 victoires de championnat")], unit: "victoires" },
    // ---- Platine ----
    { id: "DYNASTY", label: "Dynastie", icon: "dynasty", platinum: true, desc: "Remporter le championnat 3 saisons consécutives.",
      tiers: [T(3, "bestTitleStreak", "3 championnats consécutifs")], live: "titleStreak", unit: "titres d'affilée" },
    { id: "PERFECT_SEASON", label: "Saison parfaite", icon: "perfect", platinum: true, desc: "Gagner tous les matchs d'une saison régulière, sans aucune défaite (play-offs et coupes non comptés).",
      tiers: [T(1, "perfectSeasons", "Saison régulière sans défaite")] },
    { id: "IMPREGNABLE", label: "Forteresse imprenable", icon: "shieldCastle", platinum: true, desc: "Gagner tous ses matchs à domicile pendant 2 saisons régulières consécutives.",
      tiers: [T(2, "bestHomePerfectStreak", "2 saisons consécutives invaincu à domicile")], live: "homePerfectStreak", unit: "saisons" },
    { id: "GOLDEN_GENERATION", label: "Génération dorée", icon: "threeStars", platinum: true, desc: "Avoir 3 joueurs issus de son académie sélectionnés dans le cinq majeur de la saison (saisons différentes possibles).",
      tiers: [T(3, "allStarHG", "3 joueurs de l'académie dans le cinq majeur de la saison")], unit: "joueurs" },
    { id: "IMMORTAL_CLUB", label: "Club immortel", icon: "infinity", platinum: true, desc: "Atteindre 500 victoires en championnat avec le même club (montées et descentes comprises).",
      tiers: [T(500, "champWins", "500 victoires de championnat")], unit: "victoires" },
  ];
  const TIER_NAMES = ["Bronze", "Argent", "Or"];
  // Dessins (trait, viewBox 0 0 24 24).
  const ICONS = {
    ball: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5v17M6 6c2.6 2.4 2.6 9.6 0 12M18 6c-2.6 2.4-2.6 9.6 0 12"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>',
    clipboard: '<rect x="6" y="5" width="12" height="15" rx="2"/><path d="M9.5 5V3.5h5V5M9 10h6M9 13.5h6M9 17h3.5"/>',
    dumbbell: '<path d="M3.5 9.5v5M6.5 7.5v9M17.5 7.5v9M20.5 9.5v5M6.5 12h11"/>',
    contract: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 12h6M9.5 15h4"/><path d="M15.5 21l2.5-2.5 2 2"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    coins: '<ellipse cx="9" cy="7" rx="5" ry="2.2"/><path d="M4 7v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V7"/><ellipse cx="15" cy="14" rx="5" ry="2.2"/><path d="M10 14v3.5c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V14"/>',
    arena: '<path d="M3 10c2-3 5.5-4.5 9-4.5S19 7 21 10M3 10v8h18v-8M3 10c2 1.6 5.4 2.5 9 2.5s7-.9 9-2.5M7.5 18v-3.5M12 18v-4M16.5 18v-3.5"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/><path d="M9 14.5l2 2 4-4"/>',
    bracket: '<path d="M3.5 5.5h4v5h-4M3.5 13.5h4v5h-4M7.5 8h4v8.5h-4M11.5 12h4"/><circle cx="18.5" cy="12" r="2.5"/>',
    crown: '<path d="M4 17.5L3 8l5 4 4-6 4 6 5-4-1 9.5z"/><path d="M4.5 20.5h15"/>',
    arrowUp: '<path d="M4 19.5h16M7 16l4-4 3 3 5-6"/><path d="M15 9h4v4"/>',
    cup: '<path d="M7 4h10l-1 7a4 4 0 0 1-8 0z"/><path d="M12 15v3.5M8.5 20.5h7M7.5 6.5H4.5c0 2.5 1.5 4 3.4 4.2M16.5 6.5h3c0 2.5-1.5 4-3.4 4.2"/>',
    supercup: '<path d="M8 6h8l-.8 5.5a3.2 3.2 0 0 1-6.4 0z"/><path d="M12 14.5v3M9 20.5h6M12 2.5l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z"/>',
    roller: '<circle cx="7" cy="16" r="4"/><path d="M11 16h9v-4h-4l-2-4H9v4M14 12h-3M3.5 20.5h17"/>',
    castle: '<path d="M4 20.5V8h3v2h2V8h2v2h2V8h2v2h2V8h3v12.5z"/><path d="M10 20.5v-4a2 2 0 0 1 4 0v4"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    sprout: '<path d="M12 20.5v-8"/><path d="M12 12.5C12 8 9 5.5 4.5 5.5 4.5 10 7.5 12.5 12 12.5zM12 10.5c0-3.5 2.5-6 7.5-6 0 4-2.5 6-7.5 6z"/><path d="M7.5 20.5h9"/>',
    bricks: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 9.7h17M3.5 14.3h17M10 5v4.7M15 9.7v4.6M8 14.3V19M16.5 14.3V19"/>',
    laurel: '<path d="M8 20c-3.5-2-5-5.5-4.5-10M16 20c3.5-2 5-5.5 4.5-10M5 13.5l2.3-.8M4.2 10.5l2.3.2M6.7 16.6l2-1.3M19 13.5l-2.3-.8M19.8 10.5l-2.3.2M17.3 16.6l-2-1.3"/><text x="12" y="13.8" text-anchor="middle" font-size="6.6" font-weight="800" fill="currentColor" stroke="none" font-family="Arial,sans-serif">100</text>',
    dynasty: '<path d="M3.5 15L3 7l3.5 3L9 5l2.5 5L15 7l-.5 8z" transform="translate(4.5 0)"/><path d="M5 19h14M7 21.5h10"/><path d="M3 13.5l1.5-3M21 13.5l-1.5-3"/>',
    perfect: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8L16.5 9.5"/>',
    shieldCastle: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M8.5 15.5v-5h1.7v1.3h1v-1.3h1.6v1.3h1v-1.3h1.7v5z"/>',
    threeStars: '<path d="M12 3l1.6 3.3 3.6.5-2.6 2.5.6 3.6L12 11.2l-3.2 1.7.6-3.6L6.8 6.8l3.6-.5z"/><path d="M6 13.5l1.1 2.2 2.4.4-1.7 1.7.4 2.4L6 19.1l-2.2 1.1.4-2.4-1.7-1.7 2.4-.4zM18 13.5l1.1 2.2 2.4.4-1.7 1.7.4 2.4L18 19.1l-2.2 1.1.4-2.4-1.7-1.7 2.4-.4z"/>',
    infinity: '<path d="M12 12c-2-2.8-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.2 5.5-4zm0 0c2 2.8 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.2-5.5 4z"/>',
  };
  const BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
  function statValue(stats, key) {
    const v = stats ? stats[key] : 0;
    if (Array.isArray(v)) return v.length;
    return typeof v === "number" && isFinite(v) ? v : 0;
  }
  // Nombre de paliers atteints (0..3, ou 0..1 pour un Platine) d'après les
  // compteurs. Les paliers sont cumulatifs : atteindre l'Or valide aussi
  // Bronze et Argent.
  function tiersReached(def, stats) {
    let n = 0;
    def.tiers.forEach((t, i) => { if (statValue(stats, t.stat) >= t.need) n = Math.max(n, i + 1); });
    return n;
  }
  const api = { ACHIEVEMENTS, BY_ID, TIER_NAMES, ICONS, statValue, tiersReached };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HM_ACHIEVEMENTS = api;
})(typeof window !== "undefined" ? window : null);
