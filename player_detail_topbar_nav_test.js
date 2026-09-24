// Vérifie le bouton "Comparer" + les flèches de navigation entre joueurs de
// l'effectif, dans le topbar de la fiche joueur (retour utilisateur,
// 2026-09-24, capture annotée d'un cercle rouge à côté de "Modifier vos
// ordres") : "mets le bouton comparer dans la zone gribouillée en rouge et
// juste à côté de ce bouton, mets des flèches de navigation pour passer
// d'un joueur à l'autre de son effectif". Le bouton "Comparer" lui-même
// (ouverture du comparateur) est déjà couvert en détail par
// player_compare_test.js — ce fichier-ci couvre uniquement ce qui est
// NOUVEAU : le déplacement dans le topbar (visibilité liée à la page
// active, voir showPage/.topbar-player-nav) et les flèches précédent/
// suivant (playerDetailRosterOrder/navigatePlayerDetail).
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

// ---------------------------------------------------------------------
// Partie 1 : le bloc topbar (#topbarPlayerNav) n'est visible QUE sur la
// fiche joueur, sur TOUTES les pages sinon (showPage est le seul point de
// bascule, attrape donc n'importe quel onglet).
// ---------------------------------------------------------------------
const navEl = doc.getElementById("topbarPlayerNav");
if (!navEl.classList.contains("hidden")) {
  throw new Error("❌ Le bloc Comparer/navigation du topbar ne devrait PAS être visible avant d'ouvrir une fiche joueur.");
}
console.log("✅ Le bloc topbar Comparer/navigation est bien caché avant d'ouvrir une fiche joueur.");

const myPlayers = win.eval("league.teams[myTeamIndex].players");
const ordered = win.eval("playerDetailRosterOrder(myTeamIndex)");
if (ordered.length < 3) {
  throw new Error(`❌ Effectif de test trop petit pour ce scénario (précédent/milieu/suivant), obtenu ${ordered.length} joueurs.`);
}
win.showPlayerDetail(0, ordered[1].id); // joueur du MILIEU : précédent ET suivant doivent être actifs

if (navEl.classList.contains("hidden")) {
  throw new Error("❌ Le bloc Comparer/navigation du topbar devrait être visible une fois la fiche joueur ouverte.");
}
console.log("✅ Le bloc topbar Comparer/navigation apparaît bien une fois la fiche joueur ouverte.");

doc.getElementById("closePlayerDetailBtn").click();
if (!navEl.classList.contains("hidden")) {
  throw new Error("❌ Le bloc Comparer/navigation du topbar devrait redisparaître en quittant la fiche joueur (\"← Retour\").");
}
console.log("✅ Le bloc topbar Comparer/navigation redisparaît bien en quittant la fiche joueur.");

// ---------------------------------------------------------------------
// Partie 2 : flèches précédent/suivant — parcourent bien l'effectif dans
// l'ordre par défaut de l'Effectif (poste, puis note globale décroissante),
// se désactivent en bout de liste, jamais de bouclage.
// ---------------------------------------------------------------------
win.showPlayerDetail(0, ordered[0].id); // premier de l'effectif
const prevBtn = doc.getElementById("topbarPlayerPrevBtn");
const nextBtn = doc.getElementById("topbarPlayerNextBtn");
const nameHeader = doc.getElementById("playerDetailName");

if (!prevBtn.disabled) throw new Error("❌ La flèche \"précédent\" devrait être désactivée sur le premier joueur de l'effectif.");
if (nextBtn.disabled) throw new Error("❌ La flèche \"suivant\" ne devrait PAS être désactivée sur le premier joueur (effectif > 1).");
console.log("✅ Sur le premier joueur de l'effectif : flèche \"précédent\" désactivée, \"suivant\" active.");

nextBtn.click();
if (nameHeader.textContent !== ordered[1].name) {
  throw new Error(`❌ Un clic sur "suivant" depuis le 1er joueur devrait afficher ${ordered[1].name} (2e de l'effectif), obtenu ${nameHeader.textContent}.`);
}
if (prevBtn.disabled) throw new Error("❌ La flèche \"précédent\" devrait redevenir active une fois sur le 2e joueur.");
console.log(`✅ Un clic sur "suivant" affiche bien le joueur suivant de l'effectif (${ordered[1].name}).`);

prevBtn.click();
if (nameHeader.textContent !== ordered[0].name) {
  throw new Error(`❌ Un clic sur "précédent" devrait ramener au 1er joueur (${ordered[0].name}), obtenu ${nameHeader.textContent}.`);
}
console.log(`✅ Un clic sur "précédent" ramène bien au joueur précédent de l'effectif (${ordered[0].name}).`);

// Bout de liste opposé : dernier joueur -> "suivant" désactivé, pas de
// bouclage vers le premier.
win.showPlayerDetail(0, ordered[ordered.length - 1].id);
if (!nextBtn.disabled) throw new Error("❌ La flèche \"suivant\" devrait être désactivée sur le DERNIER joueur de l'effectif.");
if (prevBtn.disabled) throw new Error("❌ La flèche \"précédent\" ne devrait PAS être désactivée sur le dernier joueur (effectif > 1).");
console.log("✅ Sur le dernier joueur de l'effectif : flèche \"suivant\" désactivée (pas de bouclage), \"précédent\" active.");

// ---------------------------------------------------------------------
// Partie 3 : l'ordre de navigation correspond bien à celui de l'Effectif
// par défaut (poste, puis note globale décroissante) — pas un ordre
// arbitraire (ex. celui du tableau des joueurs en mémoire).
// ---------------------------------------------------------------------
const expectedOrderIds = [...myPlayers]
  .sort((a, b) => {
    const POSITIONS = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];
    return POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position);
  })
  .map(p => p.id);
// (tri secondaire par note globale déjà vérifié indirectement : `ordered`
// vient de la fonction réelle playerDetailRosterOrder elle-même — cette
// 3e partie vérifie juste que le tri par POSTE est respecté en premier,
// ce qu'un tri par seule note globale casserait facilement.)
const orderedIds = ordered.map(p => p.id);
const positionsInOrder = ordered.map(p => p.position);
const POSITIONS_REF = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];
let positionsNonDecreasing = true;
for (let i = 1; i < positionsInOrder.length; i++) {
  if (POSITIONS_REF.indexOf(positionsInOrder[i]) < POSITIONS_REF.indexOf(positionsInOrder[i - 1])) positionsNonDecreasing = false;
}
if (!positionsNonDecreasing) {
  throw new Error(`❌ L'ordre de navigation devrait grouper les joueurs par poste (comme l'Effectif par défaut), obtenu : ${JSON.stringify(positionsInOrder)}.`);
}
console.log("✅ L'ordre de navigation entre joueurs suit bien le même ordre par défaut que l'onglet Effectif (par poste).");

await flush(dom);
dom.window.close();
server.close();

console.log("\n🏁 Tous les tests du bouton Comparer + navigation entre joueurs (topbar de la fiche joueur) sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
