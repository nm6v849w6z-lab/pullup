// Vérifie les couleurs du radar "Profil (vue d'ensemble)" de la fiche
// joueur (retour utilisateur, 2026-09-23 PUIS ENCORE 2026-09-24, même
// capture d'écran) : "les zones rouge et orange sur le profil ne sont tjrs
// pas vives". Deux tentatives précédentes (commits 91ea530 "Corrige
// couleurs radar" et 06d282d "Radar plus vif") n'avaient éclairci que les
// COULEURS elles-mêmes (--attr-tier-red/-amber, voir :root) sans jamais
// résoudre la vraie cause : radarChartSvg empilait 4 DISQUES PLEINS
// (du plus grand au plus petit) avec fill-opacity 0.5 chacun — la bande
// rouge (la plus petite, au centre) se retrouvait donc composée par-dessus
// le vert PUIS le blanc PUIS l'orange déjà empilés en dessous, ce qui la
// faisait virer à un orange/saumon terne (mesuré au pixel avec Playwright,
// hors suite : rgb(226,111,63) au lieu du rouge #ff3b30 attendu). Corrigé
// en dessinant chaque bande comme un VRAI ANNEAU indépendant (path SVG à
// deux sous-tracés + fill-rule="evenodd", voir le grand commentaire de
// radarChartSvg dans moteurbasket3.html) : chaque bande n'est composée
// qu'UNE SEULE FOIS avec le fond sombre de la page, plus de dilution en
// cascade. jsdom ne fait pas de vraie mise en page/canvas (même limite que
// league_stats_test.js/mobile_viewport_meta_test.js) : on vérifie donc la
// STRUCTURE du SVG généré (anneaux creux, pas des disques pleins) plutôt
// que des pixels ; la vérification pixel par pixel elle-même a été faite
// hors suite avec Playwright (bandes rouge/orange nettement plus vives,
// teintes correctes, sur la fiche joueur réelle).
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const win = dom.window;

// Catégories forcées pour peupler les 4 seuils attrColorTier (20/50/80,
// voir RADAR_AXES) : un axe dans chaque tranche.
const svg = win.eval(`
  radarChartSvg({ shoot: 10, finish: 35, create: 65, defense: 90, rebound: 50, physical: 50, mental: 50 })
`);

// 1) Les 4 bandes de fond doivent être des <path ... fill-rule="evenodd">,
//    plus aucun <polygon>/<circle> pour les bandes (régression du bug
//    d'origine : disques pleins empilés).
const bandPaths = [...svg.matchAll(/<path d="([^"]+)" fill="([^"]+)" fill-opacity="([^"]+)" fill-rule="evenodd"\/>/g)];
if (bandPaths.length !== 4) {
  throw new Error(`❌ radarChartSvg devrait dessiner exactement 4 bandes de fond en <path fill-rule="evenodd">, obtenu ${bandPaths.length}. SVG : ${svg.slice(0, 400)}`);
}
console.log("✅ Les 4 bandes de fond du radar sont bien des <path fill-rule=\"evenodd\"> (pas des disques pleins empilés).");

// 2) Les 3 bandes extérieures (vert/blanc/orange) doivent chacune avoir DEUX
//    sous-tracés "M ... Z" (un anneau creux, PAS un disque plein) ; seule la
//    bande centrale (rouge) n'en a qu'un seul (rien de plus petit à évider).
const subpathCounts = bandPaths.map(([, d]) => (d.match(/M /g) || []).length);
const expectedSubpaths = [2, 2, 2, 1]; // vert, blanc, orange, rouge (ordre de dessin)
if (JSON.stringify(subpathCounts) !== JSON.stringify(expectedSubpaths)) {
  throw new Error(`❌ Les 4 bandes devraient avoir ${JSON.stringify(expectedSubpaths)} sous-tracés (anneau=2, disque plein central=1), obtenu ${JSON.stringify(subpathCounts)} — une bande extérieure serait redevenue un disque plein (régression du bug de dilution des couleurs).`);
}
console.log("✅ Les 3 bandes extérieures (vert/blanc/orange) sont bien de VRAIS anneaux creux (2 sous-tracés), pas des disques pleins ; seule la bande rouge centrale est un disque plein (rien de plus petit à évider).");

// 3) Couleurs/ordre attendus : vert plein hex, blanc/orange/rouge sur les
//    tokens dédiés (voir radarTierColor/:root) — inchangés depuis les
//    correctifs précédents, juste la FORME (anneau vs disque) a changé.
const expectedColors = ["#3ecf67", "var(--ink)", "var(--attr-tier-amber)", "var(--attr-tier-red)"];
const gotColors = bandPaths.map(([, , color]) => color);
if (JSON.stringify(gotColors) !== JSON.stringify(expectedColors)) {
  throw new Error(`❌ Couleurs des 4 bandes attendues ${JSON.stringify(expectedColors)}, obtenu ${JSON.stringify(gotColors)}.`);
}
console.log("✅ Les 4 bandes utilisent bien les couleurs/tokens attendus (vert plein, --ink, --attr-tier-amber, --attr-tier-red), dans le bon ordre.");

// 4) Opacité relevée de 0.5 à 0.65 (retour utilisateur "pas assez vives") —
//    maintenant que ce n'est plus un problème de compositing en cascade,
//    on peut se permettre un peu plus d'opacité tout en restant un simple
//    repère de fond (pas un aplat plein, toujours jugé "trop agressif").
const opacities = bandPaths.map(([, , , op]) => op);
if (!opacities.every(op => op === "0.65")) {
  throw new Error(`❌ Les 4 bandes devraient utiliser fill-opacity="0.65" (relevé de 0.5, retour utilisateur "pas assez vives"), obtenu ${JSON.stringify(opacities)}.`);
}
console.log("✅ L'opacité des bandes est bien remontée à 0.65 (elles restent un repère de fond, pas un aplat plein).");

// 5) radarTierColor (couleur des points de données individuels, indépendant
//    des bandes de fond) : seuils attrColorTier (20/50/80) inchangés.
const tierCases = [
  { value: 0, expected: "var(--attr-tier-red)" },
  { value: 20, expected: "var(--attr-tier-red)" },
  { value: 21, expected: "var(--attr-tier-amber)" },
  { value: 50, expected: "var(--attr-tier-amber)" },
  { value: 51, expected: "var(--ink)" },
  { value: 80, expected: "var(--ink)" },
  { value: 81, expected: "#3ecf67" },
  { value: 100, expected: "#3ecf67" },
];
tierCases.forEach(({ value, expected }) => {
  const got = win.eval(`radarTierColor(${value})`);
  if (got !== expected) {
    throw new Error(`❌ radarTierColor(${value}) devrait donner ${expected}, obtenu ${got}.`);
  }
});
console.log("✅ radarTierColor respecte bien les seuils attrColorTier (20/50/80) pour les points de données.");

await flush(dom);
dom.window.close();
server.close();

console.log("\n🏁 Tous les tests des couleurs du radar \"Profil (vue d'ensemble)\" sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
