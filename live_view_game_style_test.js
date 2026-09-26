// Page « Match en direct » dans l'esprit du jeu (retour utilisateur,
// 2026-09-26 : « améliore la page live pour qu'elle colle plus à l'esprit du
// jeu »). Vérifie que la vue (assets/live/live-view.js) exploite bien
// l'habillage fourni par l'adaptateur (hmLiveBuildState) : bandeau
// compétition/salle, écussons, couleurs de maillot (éclaircies si trop
// sombres), logo du club qui reçoit au rond central, « hommes du match »,
// avatars et liens vers les fiches joueurs, libellés de fin de match.
const { JSDOM } = require("jsdom");
const path = require("path");
const { pathToFileURL } = require("url");

function assert(cond, msg) {
  if (!cond) throw new Error("❌ " + msg);
  console.log("✅ " + msg);
}

const player = (id, name, pos, extra) => ({
  id, name, pos, starter: true, onCourt: true, seconds: 300,
  pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
  fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, ...extra,
});

function state(status) {
  return {
    status, quarter: status === "final" ? 4 : 1, clock: status === "final" ? 0 : 300, possession: 1, halftimeResumeIn: null,
    meta: { competition: "Championnat", round: "Journée 3/18", venue: "À domicile · 8 000 places" },
    courtLogo: '<g class="test-court-logo"></g>',
    teams: [
      { name: "Lyon", short: "LYO", score: 12, quarterScores: [12, null, null, null], teamFouls: 2, timeoutsLeft: 0, timeoutsTotal: 0,
        color: "#20242c", logo: '<svg class="test-logo-lyo"></svg>', mine: true,
        players: [
          player("A:1", "Adama Kovac", "M", { pts: 8, reb: 1, ast: 4, avatar: '<svg class="test-av"></svg>', link: { team: 0, id: 11 } }),
          player("A:2", "Hugo Petit", "P", { pts: 4, reb: 6, starter: false, onCourt: false, seconds: 0 }),
        ] },
      { name: "Rennes", short: "REN", score: 19, quarterScores: [19, null, null, null], teamFouls: 5, timeoutsLeft: 0, timeoutsTotal: 0,
        color: "#d6473f", logo: '<svg class="test-logo-ren"></svg>', mine: false,
        players: [player("B:1", "Marc Bernard", "AF", { pts: 11, reb: 3, ast: 1, link: { team: 4, id: 42 } })] },
    ],
    shots: [{ id: 1, team: 0, quarter: 1, made: true, zone: "paint", x: 88, y: 25 }],
    events: [{ id: 1, team: 0, type: "made", quarter: 1, clock: 320, text: "Adama Kovac marque.", score: [12, 19], highlight: false }],
  };
}

(async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const root = dom.window.document.getElementById("root");
  const { createLiveView } = await import(pathToFileURL(path.join(__dirname, "assets/live/live-view.js")).href);
  const view = createLiveView(root, { quarterLength: 600 });
  view.update(state("live"));
  const $ = sel => root.querySelector(sel);

  assert($("[data-ref=kicker]").textContent === "En direct · Championnat · Journée 3/18", "bandeau : compétition et journée comme sur le tableau de bord");
  assert($("[data-ref=venue]").textContent === "À domicile · 8 000 places", "bandeau : salle");
  assert($(".test-logo-lyo") && $(".test-logo-ren"), "écussons des deux clubs affichés");
  assert($("[data-ref=name0]").classList.contains("mine"), "mon club est signalé");
  assert(root.style.getPropertyValue("--stripe0") === "#20242c", "liseré = vraie couleur de maillot");
  assert(root.style.getPropertyValue("--c0") !== "#20242c", "maillot noir éclairci pour rester lisible sur fond sombre");
  assert(root.style.getPropertyValue("--c1") === "#d6473f", "couleur lisible gardée telle quelle");
  assert($(".court .test-court-logo"), "logo du club qui reçoit au rond central");
  assert($("[data-ref=fouls1]").textContent.includes("bonus"), "bonus affiché à 5 fautes d'équipe");

  const tiles = root.querySelectorAll(".ld-tile");
  assert(tiles.length === 3, "trois tuiles « hommes du match » (points, rebonds, passes)");
  assert(tiles[0].textContent.includes("Adama Kovac") && tiles[0].textContent.includes("Marc Bernard"), "meilleur marqueur de chaque équipe");
  assert(tiles[1].textContent.includes("Adama Kovac") && !tiles[1].textContent.includes("Hugo Petit"), "un joueur qui n'a pas joué n'est pas retenu");

  const link = $('.box [data-player-team="0"][data-player-id="11"]');
  assert(link && link.textContent === "Adama Kovac", "nom cliquable vers la fiche joueur (écouteur global du jeu)");
  assert($(".box .test-av"), "avatar du joueur dans la feuille de match");
  assert($(".box .pos").textContent === "M", "pastille de poste");
  assert($(".feed .chip.pts").textContent === "+12", "fil : pastille des points marqués");

  // Dernier tir du match : dessiné au-dessus et clignotant (retour
  // utilisateur, 2026-09-26), qu'il soit réussi ou raté.
  const withMiss = state("live");
  withMiss.shots.push({ id: 2, team: 1, quarter: 1, made: false, zone: "three", x: 20, y: 5 });
  view.update(withMiss);
  const lastMarks = root.querySelectorAll(".court .last");
  assert(lastMarks.length === 1 && lastMarks[0].classList.contains("miss"), "dernier tir (raté) clignote, un seul à la fois");
  assert(!root.querySelector(".court .last-halo"), "pas de rond autour du dernier tir");

  // Feuille de match : mon club d'abord, même s'il joue à l'extérieur.
  const dom2 = new JSDOM('<!doctype html><div id="root"></div>');
  const root2 = dom2.window.document.getElementById("root");
  const v2 = createLiveView(root2, {});
  const away = state("live"); away.teams[0].mine = false; away.teams[1].mine = true;
  v2.update(away);
  assert(root2.querySelector("[data-ref=fB1]").getAttribute("aria-pressed") === "true", "feuille de match ouverte sur mon club quand il est à l'extérieur");

  view.update(state("final"));
  assert($("[data-ref=kicker]").textContent.startsWith("Match terminé"), "fin de match : bandeau « Match terminé »");
  assert($("[data-ref=period]").textContent === "Victoire de Rennes", "fin de match : vainqueur annoncé");
  assert($("[data-ref=run]").textContent.includes("l'emporte de"), "fin de match : écart final");
  console.log("\nTous les tests de la vue live (esprit du jeu) passent.");
})().catch(e => { console.error(e); process.exit(1); });
