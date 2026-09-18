// Vérifie le retour utilisateur (2026-09, suite du précédent réarrangement
// du bracket, voir cup_bracket_order_test.js) : "la brique quart n'est pas
// aligné avec les deux briques huitième lui correspondant, c'est mieux mais
// pas encore ça".
//
// Cause : .cup-round-title était un frère direct des cartes DANS le même
// conteneur flex portant justify-content:space-around (voir renderCoupeSection/
// .cup-round en CSS), donc comptait lui-même comme un élément à espacer, avec
// une hauteur différente d'une carte, ce qui décalait le calcul de centrage
// entre deux tours consécutifs. Le titre est désormais SORTI de ce conteneur,
// dans un bloc séparé .cup-round-matches qui ne contient QUE des cartes.
//
// JSDOM ne calcule pas de vraie mise en page (getBoundingClientRect renvoie
// toujours des zéros, voir team_detail_page_test.js/salle_arena_purchases_height_test.js
// pour la même limite déjà rencontrée) : ce test vérifie donc la STRUCTURE du
// DOM qui rend le centrage géométrique possible (le titre hors du conteneur
// space-around, ce conteneur ne contenant que des cartes), pas le résultat en
// pixels lui-même (vérifié manuellement via Playwright au moment du
// correctif : centrage exact à 0px près sur les 4 tours).
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

// Fixture minimale (comme cup_bracket_order_test.js) : 2 huitièmes menant à
// 1 quart, suffisant pour vérifier la structure des 2 tours.
win.eval(`
  (function() {
    const m0 = { home: 0, away: 1, winner: 1, resolved: true, bye: false, scoreHome: 80, scoreAway: 85 };
    const m1 = { home: 2, away: 3, winner: 3, resolved: true, bye: false, scoreHome: 70, scoreAway: 75 };
    const q0 = { home: 1, away: 3, winner: null, resolved: false, bye: false };
    league.cup = {
      champion: null,
      rounds: [
        { index: 0, name: "huitiemes", dayIndex: 0, matches: [m0, m1, m0, m1, m0, m1, m0, m1], resolved: true },
        { index: 1, name: "quarts", dayIndex: 1, matches: [q0, q0, q0, q0], resolved: false },
      ],
    };
    renderCoupeSection();
  })();
`);

const btn = [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "coupe");
btn.click();

// ---------------------------------------------------------------------
// Partie 1 : chaque .cup-round a bien un .cup-round-title ET un
// .cup-round-matches en enfants directs, dans cet ordre.
// ---------------------------------------------------------------------
const rounds = [...doc.querySelectorAll("#coupeContent .cup-round")];
console.log("Colonnes de tour trouvées :", rounds.length, "(attendu 4 : huitièmes/quarts/demies/finale)");
if (rounds.length !== 4) throw new Error(`❌ (setup) 4 colonnes de tour attendues, obtenu ${rounds.length}.`);
rounds.forEach((round, i) => {
  const children = [...round.children];
  const title = children[0];
  const matchesWrap = children[1];
  if (!title || !title.classList.contains("cup-round-title")) {
    throw new Error(`❌ BUG NON CORRIGÉ : le 1er enfant de la colonne ${i} devrait être .cup-round-title, obtenu "${title ? title.className : "(aucun)"}".`);
  }
  if (!matchesWrap || !matchesWrap.classList.contains("cup-round-matches")) {
    throw new Error(`❌ BUG NON CORRIGÉ : le 2e enfant de la colonne ${i} devrait être .cup-round-matches (voir renderCoupeSection), obtenu "${matchesWrap ? matchesWrap.className : "(aucun)"}".`);
  }
  if (children.length !== 2) {
    throw new Error(`❌ La colonne ${i} devrait avoir EXACTEMENT 2 enfants directs (titre + conteneur de cartes), obtenu ${children.length}.`);
  }
});
console.log("✅ Chaque colonne de tour a bien exactement 2 enfants directs : .cup-round-title puis .cup-round-matches.");

// ---------------------------------------------------------------------
// Partie 2 : .cup-round-matches ne contient QUE des cartes de match (le
// titre n'y est PAS mélangé, c'est précisément ce qui décalait le calcul de
// centrage avant le correctif).
// ---------------------------------------------------------------------
rounds.forEach((round, i) => {
  const matchesWrap = round.querySelector(".cup-round-matches");
  const nonCardChildren = [...matchesWrap.children].filter(c => !c.classList.contains("cup-match"));
  if (nonCardChildren.length) {
    throw new Error(`❌ BUG NON CORRIGÉ : .cup-round-matches de la colonne ${i} contient un élément qui n'est pas une carte (${nonCardChildren.map(c => c.className).join(", ")}), ce qui fausserait à nouveau le calcul de centrage par justify-content:space-around.`);
  }
  if (matchesWrap.querySelector(".cup-round-title")) {
    throw new Error(`❌ BUG NON CORRIGÉ : le titre du tour ${i} est retombé DANS .cup-round-matches, il devrait en être sorti (voir renderCoupeSection).`);
  }
});
console.log("✅ .cup-round-matches ne contient que des cartes de match, jamais le titre du tour.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests cup_bracket_card_alignment_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
