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
//
// Identité nationale (demande du 2026-10-09) : écussons de plusieurs formes
// aux couleurs du drapeau (`nation: true`), drapeau au centre au lieu des
// initiales (réglage `center`), bannières et maillots aux couleurs du
// drapeau. Les couleurs viennent de assets/flags/palette.json (calculé à
// partir des drapeaux du jeu, tools/build_flag_palettes.js) : rien n'est
// codé pays par pays. Les anciens choix restent valables tels quels.
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
      { id: "nat-shield", label: "Écusson national", nation: true, shape: "shield", motif: "plain" },
      { id: "nat-round", label: "Médaillon", nation: true, shape: "round", motif: "ring" },
      { id: "nat-diamond", label: "Losange", nation: true, shape: "diamond", motif: "plain" },
      { id: "nat-hex", label: "Hexagone", nation: true, shape: "hex", motif: "ring" },
      { id: "nat-pennant", label: "Fanion à bandes", nation: true, shape: "pennant", motif: "bands", need: "played" },
      { id: "nat-chevron", label: "Écusson à chevron", nation: true, shape: "shield", motif: "chevron", need: "wins5" },
      { id: "nat-star", label: "Écusson étoilé", nation: true, shape: "shield", motif: "star", need: "finals" },
    ],
    // Centre du logo : initiales du pays (comme avant) ou son drapeau.
    center: [
      { id: "code", label: "Initiales du pays" },
      { id: "flag", label: "Drapeau du pays" },
    ],
    banner: [
      { id: "night", label: "Nuit bleue" },
      { id: "flag", label: "Couleurs du drapeau" },
      { id: "stripes", label: "Bandes", need: "played" },
      { id: "spotlights", label: "Projecteurs", need: "wins5" },
      { id: "gold", label: "Or", need: "podium" },
      { id: "nat-bands", label: "Bandes nationales", nation: true },
      { id: "nat-diagonal", label: "Diagonale nationale", nation: true },
      { id: "nat-sash", label: "Écharpe nationale", nation: true, need: "played" },
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
      // Couleurs du drapeau (couleurs de maillot les plus proches, voir nationJersey).
      { id: "nat-uni", label: "Couleur nationale", nation: true, pattern: "uni" },
      { id: "nat-bandes", label: "Bandes nationales", nation: true, pattern: "bandes" },
      { id: "nat-split", label: "Fendu national", nation: true, pattern: "split_v", need: "played" },
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
  var KINDS = ["logo", "center", "banner", "jersey", "court"];
  var KIND_LABELS = { logo: "Logo", center: "Centre du logo", banner: "Bannière", jersey: "Maillot", court: "Terrain" };
  var DEFAULTS = { logo: "flag", center: "code", banner: "night", jersey: "bleu", court: "nuit" };
  // Couleurs de maillot du jeu (miroir de JERSEY_COLORS, moteurbasket3.html
  // et engine.js) : un maillot « national » prend les plus proches de celles
  // du drapeau (le moteur ne connaît que ces couleurs).
  var JERSEY_HEX = { rouge: "#d6473f", bleu: "#3b6fd6", vert: "#3fae62", violet: "#8659d6", orange: "#e08a2e", noir: "#20242c", blanc: "#f2f2f0", jaune: "#e8c93f" };
  function rgb(h) { var n = parseInt(String(h || "").replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function nearestJersey(hex, avoid) {
    var c = rgb(hex), best = null, bd = Infinity;
    // Couleur franche (bleu marine, vert foncé…) : jamais ramenée au noir ou
    // au blanc, seulement à une couleur du jeu.
    var mx = Math.max(c[0], c[1], c[2]) / 255, mn = Math.min(c[0], c[1], c[2]) / 255, l = (mx + mn) / 2;
    var sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
    var chroma = sat > 0.35 && l > 0.12 && l < 0.9;
    var hue = function (v) {
      var r = v[0] / 255, g = v[1] / 255, b = v[2] / 255, M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m;
      if (!d) return 0;
      var h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    var h0 = hue(c);
    Object.keys(JERSEY_HEX).forEach(function (k) {
      if (k === avoid || (chroma && (k === "noir" || k === "blanc"))) return;
      var d = rgb(JERSEY_HEX[k]), x;
      if (chroma) { var dh = Math.abs(hue(d) - h0); x = Math.min(dh, 360 - dh); }   // couleur franche : la teinte d'abord
      else x = Math.pow(c[0] - d[0], 2) * 0.3 + Math.pow(c[1] - d[1], 2) * 0.59 + Math.pow(c[2] - d[2], 2) * 0.11;
      if (x < bd) { bd = x; best = k; }
    });
    return best;
  }
  // Palette d'un pays (assets/flags/palette.json) → { c1, c2, c3 } ; repli
  // sur la nuit bleue et l'ambre du jeu sans palette.
  function nationPalette(palette) {
    var p = Array.isArray(palette) && palette.length ? palette : ["#1b2a52", "#f5a13a"];
    return { c1: p[0], c2: p[1] || "#ffffff", c3: p[2] || p[1] || "#ffffff", all: p.slice(0, 3) };
  }
  // Maillot « national » : couleur principale = 1re couleur du drapeau (en
  // évitant le blanc quand le drapeau a une autre couleur), seconde = la
  // suivante, distincte (motifs à deux tons).
  function nationJersey(item, palette) {
    var p = nationPalette(palette).all;
    var main = p.filter(function (h) { return nearestJersey(h) !== "blanc"; })[0] || p[0];
    var color = nearestJersey(main);
    var rest = p.filter(function (h) { return h !== main; });
    var second = rest.length ? nearestJersey(rest[0], color) : (color === "blanc" ? "noir" : "blanc");
    // Motifs à deux tons : couleurs EXACTES du drapeau (paire « #hex/#hex »,
    // acceptée par jerseyPair) ; couleur unie : la plus proche du jeu.
    var hex2 = rest.length ? rest[0] : JERSEY_HEX[second];
    return { color: color, second: second, pattern: item.pattern, pair: String(main).toLowerCase() + "/" + String(hex2).toLowerCase() };
  }

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
  var api = { NEEDS: NEEDS, CATALOG: CATALOG, KINDS: KINDS, KIND_LABELS: KIND_LABELS, DEFAULTS: DEFAULTS, itemOf: itemOf, isUnlocked: isUnlocked, statsOf: statsOf, resolve: resolve,
    JERSEY_HEX: JERSEY_HEX, nearestJersey: nearestJersey, nationPalette: nationPalette, nationJersey: nationJersey };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HM_NATIONAL_VISUALS = api;
})(typeof window !== "undefined" ? window : this);
