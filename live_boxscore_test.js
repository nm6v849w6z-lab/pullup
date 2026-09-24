// Vérifie le box score EN DIRECT (retour utilisateur, 2026-09 : "il n'y a
// pas de box score en direct. il faut l'ajouter") — #liveBoxscoreSection,
// reconstruit événement par événement pendant la diffusion (voir
// applyLiveBoxScoreEvent/renderLiveBoxScore dans moteurbasket3.html), par
// opposition à #boxscoreSection (feuille FINALE, déjà connue en entier dès
// l'entrée sur l'écran Live via matchResult.boxScoreA/B mais volontairement
// cachée pendant la diffusion pour ne pas spoiler le match — voir le grand
// commentaire HTML au-dessus de #liveBoxscoreSection). Même principe de
// reconnexion "in medias res" que live_court_view_test.js/end_to_end_test.js
// (partie 4) : à mi-diffusion, tous les événements déjà "passés à l'antenne"
// sont appliqués synchroniquement (voir enterLiveMatch), donc le box score en
// direct doit déjà refléter exactement ce qui a été montré jusque-là.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, patchDateNow } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const clock = { now: Date.now() };
const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
let dom = await openGame(html, baseUrl);
patchDateNow(dom.window, () => clock.now);
await flush(dom);

const saved = readRawSave(savePath);
const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);
await dom.window.close();

// --- Reconnexion à mi-diffusion : le box score en direct doit être visible
// (pas la feuille finale, cachée jusqu'à la fin du direct).
clock.now = scheduledAt + Math.round(MATCH_BROADCAST_DURATION_MS / 2);
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
const doc = dom.window.document;

const liveBsSection = doc.getElementById("liveBoxscoreSection");
if (!liveBsSection) throw new Error("❌ #liveBoxscoreSection devrait exister dans le DOM.");
if (liveBsSection.style.display === "none") {
  throw new Error("❌ Le box score en direct devrait être visible à mi-diffusion d'un match normal (non forfait, pas encore terminé).");
}
console.log("✅ Le box score en direct (#liveBoxscoreSection) est bien visible pendant la diffusion.");

const boxscoreSection = doc.getElementById("boxscoreSection");
if (boxscoreSection.style.display !== "none") {
  throw new Error("❌ La feuille de stats FINALE (#boxscoreSection) ne devrait PAS être visible pendant la diffusion (spoilerait le résultat déjà entièrement simulé).");
}
console.log("✅ La feuille de stats finale reste bien cachée pendant la diffusion (pas de spoiler).");

// --- Invariant fort : la somme des PTS de toutes les lignes du box score en
// direct d'une équipe doit être EXACTEMENT égale au score affiché de cette
// équipe à cet instant (#scoreA/#scoreB) — chaque point marqué dans le match
// est forcément attribué à exactement un joueur (tir ou lancer franc), voir
// applyLiveBoxScoreEvent. Un écart signifierait un événement de score perdu
// ou mal attribué lors de la reconstruction côté client.
// ":not(.boxscore-totals)" (retour Discord d'Ariane, relayé par
// l'utilisateur, 2026-09-24 : "ligne total" — voir liveBoxscoreTableHtml)
// exclut la ligne de total ajoutée en bas du tableau, sinon elle doublerait
// la somme (déjà couverte, elle, par sa propre assertion plus bas).
function sumColumn(colIndex) {
  const rows = [...doc.querySelectorAll("#liveBoxscoreHolder table.boxscore tbody tr:not(.boxscore-totals)")];
  return rows.reduce((sum, tr) => {
    const cell = tr.children[colIndex];
    const v = parseInt(cell && cell.textContent, 10);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
}

const scoreA = parseInt(doc.getElementById("scoreA").textContent, 10);
const scoreB = parseInt(doc.getElementById("scoreB").textContent, 10);
if (!(scoreA > 0 || scoreB > 0)) throw new Error("❌ À mi-diffusion, au moins une équipe devrait déjà avoir marqué (improbable sinon) — test peu concluant sinon.");

// Équipe A (onglet actif par défaut à l'entrée sur l'écran Live).
const liveBsTabA = doc.getElementById("liveBsTabA");
if (!liveBsTabA.classList.contains("active")) throw new Error("❌ L'onglet équipe A du box score en direct devrait être actif par défaut à l'entrée sur l'écran Live.");
// Joueur(0) Poste(1) MIN(2) PTS(3) ... — MIN ajoutée en 2026-09-24 (retour
// Discord d'Ariane, relayé par l'utilisateur, "minutes jouées"), décale PTS
// d'une colonne par rapport à avant ce correctif.
const ptsColIndex = 3;
const rowsA = doc.querySelectorAll("#liveBoxscoreHolder table.boxscore tbody tr:not(.boxscore-totals)").length;
if (rowsA === 0) throw new Error("❌ Le box score en direct de l'équipe A devrait avoir au moins une ligne à mi-diffusion.");
const sumPtsA = sumColumn(ptsColIndex);
if (sumPtsA !== scoreA) {
  throw new Error(`❌ La somme des PTS du box score en direct (équipe A, ${sumPtsA}) devrait être exactement égale au score affiché #scoreA (${scoreA}).`);
}
console.log(`✅ La somme des PTS du box score en direct de l'équipe A (${sumPtsA}) correspond exactement au score affiché (${scoreA}).`);

// Bascule vers l'équipe B (onglet dédié .live-bs-tab, JAMAIS .bs-tab — voir
// son grand commentaire CSS dans moteurbasket3.html) et revérifie le même
// invariant.
doc.getElementById("liveBsTabB").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
if (!doc.getElementById("liveBsTabB").classList.contains("active")) {
  throw new Error("❌ Cliquer sur l'onglet équipe B du box score en direct devrait l'activer.");
}
if (doc.getElementById("liveBsTabA").classList.contains("active")) {
  throw new Error("❌ Cliquer sur l'onglet équipe B devrait désactiver l'onglet équipe A.");
}
const sumPtsB = sumColumn(ptsColIndex);
if (sumPtsB !== scoreB) {
  throw new Error(`❌ La somme des PTS du box score en direct (équipe B, ${sumPtsB}) devrait être exactement égale au score affiché #scoreB (${scoreB}).`);
}
console.log(`✅ La somme des PTS du box score en direct de l'équipe B (${sumPtsB}) correspond exactement au score affiché (${scoreB}), après bascule d'onglet.`);

// --- Les boutons .live-bs-tab ne doivent JAMAIS avoir été câblés vers
// renderBoxScore (feuille finale) via le câblage générique .bs-tab (voir son
// grand commentaire CSS) : la feuille finale doit rester fermée/cachée même
// après avoir cliqué sur ces onglets.
if (doc.getElementById("boxscoreSection").style.display !== "none") {
  throw new Error("❌ Cliquer sur un onglet .live-bs-tab ne devrait jamais afficher la feuille de stats finale (#boxscoreSection) — mauvais câblage vers renderBoxScore ?");
}
console.log("✅ Les onglets du box score en direct restent bien isolés de la feuille de stats finale (aucun affichage accidentel).");

// --- Fin du direct (le spectateur reste sur l'écran Live jusqu'au bout,
// cas normal — voir finishPlayback, déclenché par le dernier setTimeout
// programmé dans enterLiveMatch) : le box score en direct doit disparaître
// au profit de la feuille finale (complète, avec MIN/+/-/MVP). Appelé
// directement sur la MÊME session (pas une reconnexion) : une reconnexion
// après la fin de toute la fenêtre de diffusion passe par le récapitulatif
// d'absence (#catchupSection), un tout autre écran que #liveSection — voir
// end_to_end_test.js partie 5 — donc pas le bon scénario pour vérifier
// finishPlayback lui-même.
dom.window.eval("finishPlayback()");
if (doc.getElementById("liveBoxscoreSection").style.display !== "none") {
  throw new Error("❌ Une fois le match terminé (finishPlayback), le box score en direct devrait être masqué (la feuille finale prend le relais).");
}
if (doc.getElementById("boxscoreSection").style.display === "none") {
  throw new Error("❌ Une fois le match terminé (finishPlayback), la feuille de stats finale devrait être affichée.");
}
console.log("✅ À la fin du direct (finishPlayback), le box score en direct disparaît bien au profit de la feuille de stats finale.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n✅ Box score en direct vérifié : visible pendant la diffusion (jamais la feuille finale, pas de spoiler), PTS reconstruits événement par événement exactement égaux au score affiché pour les deux équipes, onglets dédiés isolés du câblage de la feuille finale, cède la place à la feuille finale une fois le match terminé.");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
