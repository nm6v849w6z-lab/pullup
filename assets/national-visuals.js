// Personnalisation visuelle des sélections nationales (demande du
// 2026-10-07) : logo, bannière, maillot et terrain, choisis par le
// sélectionneur sur la page de la sélection (A et U21). Purement visuel :
// aucun effet sportif. Partagé serveur (validation, server/nationalExtras.js)
// et navigateur (window.HM_NATIONAL_VISUALS, assets/national.js).
//
// Certains éléments se débloquent avec le parcours de la sélection
// (`need`, voir NEEDS) : premier match officiel, 5 victoires, phase finale,
// podium, titre. Les statistiques viennent des résultats et du palmarès de
// la sélection (statsOf).
(function (root) {
  "use strict";
  var NEEDS = {
    played: { label: "Jouer un premier match international", test: function (s) { return s.played >= 1; } },
    wins5: { label: "Remporter 5 matchs internationaux", test: function (s) { return s.wins >= 5; } },
    finals: { label: "Disputer une phase finale", test: function (s) { return s.finals >= 1; } },
    podium: { label: "Monter sur un podium", test: function (s) { return s.podium >= 1; } },
    title: { label: "Remporter un titre", test: function (s) { return s.titles >= 1; } },
  };
  var CATALOG = {
    logo: [
      { id: "flag", label: "Drapeau" },
      { id: "shield", label: "Écusson" },
      { id: "star", label: "Étoile", need: "played" },
      { id: "ball", label: "Ballon", need: "wins5" },
      { id: "laurel", label: "Lauriers", need: "finals" },
      { id: "crown", label: "Couronne", need: "title" },
    ],
    banner: [
      { id: "night", label: "Nuit bleue" },
      { id: "flag", label: "Couleurs du drapeau" },
      { id: "stripes", label: "Bandes", need: "played" },
      { id: "spotlights", label: "Projecteurs", need: "wins5" },
      { id: "gold", label: "Or", need: "podium" },
    ],
    jersey: [
      { id: "bleu", label: "Bleu", color: "bleu", pattern: "uni" },
      { id: "rouge", label: "Rouge", color: "rouge", pattern: "uni" },
      { id: "blanc", label: "Blanc", color: "blanc", pattern: "uni" },
      { id: "noir", label: "Noir", color: "noir", pattern: "uni" },
      { id: "vert", label: "Vert", color: "vert", pattern: "uni" },
      { id: "jaune", label: "Jaune", color: "jaune", pattern: "uni" },
      { id: "orange", label: "Orange", color: "orange", pattern: "uni" },
      { id: "bleu-bandes", label: "Bleu à bandes", color: "bleu", pattern: "bandes", need: "played" },
      { id: "rouge-chevrons", label: "Rouge à chevrons", color: "rouge", pattern: "chevrons", need: "wins5" },
      { id: "noir-split", label: "Noir fendu", color: "noir", pattern: "split_v", need: "finals" },
      { id: "blanc-halo", label: "Blanc halo", color: "blanc", pattern: "halo", need: "podium" },
      { id: "jaune-eclats", label: "Or éclatant", color: "jaune", pattern: "eclats", need: "title" },
    ],
    court: [
      { id: "nuit", label: "Nuit (parquet du jeu)", wood: "nuit", paint: null },
      { id: "erable", label: "Érable clair", wood: "erable", paint: null },
      { id: "chene", label: "Chêne", wood: "chene", paint: null },
      { id: "noyer", label: "Noyer foncé", wood: "noyer", paint: null, need: "played" },
      { id: "ardoise", label: "Ardoise", wood: "ardoise", paint: null, need: "wins5" },
      { id: "erable-bleu", label: "Érable, raquette bleue", wood: "erable", paint: "bleu", need: "finals" },
      { id: "chene-rouge", label: "Chêne, raquette rouge", wood: "chene", paint: "rouge", need: "podium" },
    ],
  };
  var KINDS = ["logo", "banner", "jersey", "court"];
  var KIND_LABELS = { logo: "Logo", banner: "Bannière", jersey: "Maillot", court: "Terrain" };
  var DEFAULTS = { logo: "flag", banner: "night", jersey: "bleu", court: "nuit" };

  function itemOf(kind, id) {
    var list = CATALOG[kind] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function isUnlocked(item, stats) {
    if (!item) return false;
    if (!item.need) return true;
    var n = NEEDS[item.need];
    return !!(n && n.test(stats || {}));
  }
  // Statistiques de déblocage d'une sélection, à partir de ses résultats
  // (matchs terminés, voir nationalMatches.resultsOf) et de son palmarès
  // (honoursOf : { rank, of }).
  function statsOf(teamId, results, honours) {
    var s = { played: 0, wins: 0, finals: 0, podium: 0, titles: 0 };
    (results || []).forEach(function (m) {
      if (!m || m.status === "live" || typeof m.scoreHome !== "number" || typeof m.scoreAway !== "number") return;
      if (m.comp === "friendly") return; // matchs officiels seulement
      s.played++;
      var mine = m.home === teamId ? m.scoreHome : m.scoreAway, theirs = m.home === teamId ? m.scoreAway : m.scoreHome;
      if (mine > theirs) s.wins++;
    });
    (honours || []).forEach(function (h) {
      s.finals++;
      if (h.rank <= 3) s.podium++;
      if (h.rank === 1) s.titles++;
    });
    return s;
  }
  // Choix enregistré, nettoyé : un élément inconnu ou encore verrouillé
  // retombe sur le défaut (jamais d'élément verrouillé affiché).
  function resolve(visuals, stats) {
    var out = {};
    KINDS.forEach(function (k) {
      var id = visuals && visuals[k];
      var it = itemOf(k, id);
      out[k] = it && isUnlocked(it, stats) ? it.id : DEFAULTS[k];
    });
    return out;
  }
  var api = { NEEDS: NEEDS, CATALOG: CATALOG, KINDS: KINDS, KIND_LABELS: KIND_LABELS, DEFAULTS: DEFAULTS, itemOf: itemOf, isUnlocked: isUnlocked, statsOf: statsOf, resolve: resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HM_NATIONAL_VISUALS = api;
})(typeof window !== "undefined" ? window : this);
