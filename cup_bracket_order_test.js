// Vérifie #57 (retour utilisateur, 2026-09) : "réorganise les briques du
// tableau [de la Coupe] en fonction des tours pour que ce soit cohérent et
// plus beau visuellement. les briques quart de finale devraient être au
// milieu de briques 8e [...] reorganise les briques de gauche pour que
// vindicta et venomous soient en haut et match avec le quart vindicta vs
// venomous". Voir cupDisplayOrder/renderCoupeSection dans
// moteurbasket3.html. Les appariements de chaque tour de Coupe sont tirés
// au sort à l'avancement (voir buildNextCupRound côté moteur, "no player
// choice involved in matchups") : l'ordre naturel de round.matches n'a donc
// aucune raison de refléter visuellement quel duel du tour suivant vient de
// quels duels du tour précédent. Fixture construite à la main (4 duels de
// 8e menant à 2 quarts) plutôt qu'une vraie progression de ligue
// multi-manager simulée (inutilement lourd pour tester un pur
// réarrangement d'affichage).
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

// --- 1) cupDisplayOrder, en isolation : huitièmes réordonnées pour être
// groupées par paire dans le MÊME ordre que les quarts (l'ordre des quarts,
// lui, ne bouge pas, c'est la référence). ---
const orderResult = win.eval(`
  (function() {
    // m1 (2 vs 3, gagnant 3) et m3 (6 vs 7, gagnant 7) alimentent q0 (3 vs 7).
    // m0 (0 vs 1, gagnant 1) et m2 (4 vs 5, gagnant 4) alimentent q1 (1 vs 4).
    const m0 = { home: 0, away: 1, winner: 1, resolved: true, bye: false };
    const m1 = { home: 2, away: 3, winner: 3, resolved: true, bye: false };
    const m2 = { home: 4, away: 5, winner: 4, resolved: true, bye: false };
    const m3 = { home: 6, away: 7, winner: 7, resolved: true, bye: false };
    const q0 = { home: 3, away: 7, winner: null, resolved: false, bye: false };
    const q1 = { home: 1, away: 4, winner: null, resolved: false, bye: false };
    const cup = {
      champion: null,
      rounds: [
        { index: 0, name: "huitiemes", dayIndex: 0, matches: [m0, m1, m2, m3], resolved: true },
        { index: 1, name: "quarts", dayIndex: 1, matches: [q0, q1], resolved: false },
      ],
    };
    const order = cupDisplayOrder(cup);
    return {
      huitiemesOrder: order[0].map(m => \`\${m.home}-\${m.away}\`),
      quartsOrder: order[1].map(m => \`\${m.home}-\${m.away}\`),
      demiesIsNull: order[2] === null,
      finaleIsNull: order[3] === null,
    };
  })()
`);
console.log("Ordre calculé des 8e de finale :", orderResult.huitiemesOrder);
console.log("Ordre calculé des quarts :", orderResult.quartsOrder);
if (JSON.stringify(orderResult.huitiemesOrder) !== JSON.stringify(["2-3", "6-7", "0-1", "4-5"])) {
  throw new Error("❌ Les 8e de finale devraient être réordonnées par paire (2-3, 6-7) puis (0-1, 4-5), dans le même ordre que les quarts qu'elles alimentent, obtenu : " + JSON.stringify(orderResult.huitiemesOrder));
}
if (JSON.stringify(orderResult.quartsOrder) !== JSON.stringify(["3-7", "1-4"])) {
  throw new Error("❌ L'ordre des quarts (référence) ne devrait pas bouger, obtenu : " + JSON.stringify(orderResult.quartsOrder));
}
if (!orderResult.demiesIsNull || !orderResult.finaleIsNull) {
  throw new Error("❌ Les tours pas encore engendrés (demies/finale) devraient rester null, sans réordonnancement inventé.");
}
console.log("✅ cupDisplayOrder regroupe bien chaque tour par paire, dans l'ordre du tour suivant qu'il alimente, sans toucher aux tours pas encore engendrés.");

// --- 2) Intégration : renderCoupeSection affiche bien les 8e de finale dans
// cet ordre recalculé (pas l'ordre brut de round.matches), avec les NOMS
// d'équipe du scénario utilisateur (Vindicta/Venomous en haut, alignées sur
// le quart Vindicta vs Venomous). ---
win.eval(`
  (function() {
    league.teams[0].name = "Gotham Knights";
    league.teams[1].name = "Vindicta";
    league.teams[2].name = "Devil May Care";
    league.teams[3].name = "Venomous";
    league.teams[4].name = "ZyF0x_";
    league.teams[5].name = "BC Dia";
    league.teams[6].name = "Cerberus";
    league.teams[7].name = "Santo Aleixo";
    // Mêmes duels que ci-dessus, mais avec Vindicta (1) vs Venomous (3) au
    // quart de tête (q0), reproduit exactement le scénario utilisateur.
    // Duel Devil May Care/Venomous DÉLIBÉRÉMENT placé en position 2 (pas
    // adjacent à Gotham/Vindicta en position 0) : c'est justement ce que
    // cupDisplayOrder doit corriger visuellement.
    const m0 = { home: 0, away: 1, winner: 1, resolved: true, bye: false }; // Gotham vs Vindicta -> Vindicta
    const m1 = { home: 4, away: 5, winner: 4, resolved: true, bye: false }; // ZyF0x_ vs BC Dia -> ZyF0x_
    const m2 = { home: 2, away: 3, winner: 3, resolved: true, bye: false }; // Devil May Care vs Venomous -> Venomous
    const m3 = { home: 6, away: 7, winner: 7, resolved: true, bye: false }; // Cerberus vs Santo Aleixo -> Santo Aleixo
    const q0 = { home: 1, away: 3, winner: null, resolved: false, bye: false }; // Vindicta vs Venomous
    const q1 = { home: 4, away: 7, winner: null, resolved: false, bye: false }; // ZyF0x_ vs Santo Aleixo
    league.cup = {
      champion: null,
      rounds: [
        { index: 0, name: "huitiemes", dayIndex: 0, matches: [m0, m1, m2, m3], resolved: true },
        { index: 1, name: "quarts", dayIndex: 1, matches: [q0, q1], resolved: false },
      ],
    };
    renderCoupeSection();
  })()
`);
const roundCols = [...doc.querySelectorAll("#coupeContent .cup-round")];
if (roundCols.length !== 4) throw new Error("❌ 4 colonnes attendues (huitièmes/quarts/demies/finale), obtenu : " + roundCols.length);
const huitiemesNames = [...roundCols[0].querySelectorAll(".cup-match-team span:first-child")].map(s => s.textContent);
console.log("\nOrdre affiché des 8e de finale :", huitiemesNames);
// Les 2 premiers duels (4 premiers noms = moitié haute de la colonne, en
// face du quart Vindicta vs Venomous en tête de la colonne suivante)
// doivent regrouper le duel de Vindicta ET celui de Venomous, peu importe
// lequel des deux passe en tout premier, ce qui compte c'est qu'ils soient
// désormais adjacents et en haut, plus dispersés dans la colonne comme
// avant ce correctif (Venomous était en position 3, loin du duel de
// Vindicta en position 0 juste avant la réorganisation, voir la
// construction volontairement dispersée du fixture ci-dessus).
const topGroup = huitiemesNames.slice(0, 4);
if (!topGroup.includes("Vindicta") || !topGroup.includes("Venomous")) {
  throw new Error("❌ Vindicta et Venomous (chacune dans son propre duel de 8e) devraient toutes deux se retrouver en haut de la colonne, alignées sur le quart Vindicta vs Venomous, obtenu : " + JSON.stringify(huitiemesNames));
}
if (huitiemesNames[2] !== "Devil May Care" || huitiemesNames[3] !== "Venomous") {
  throw new Error("❌ Le duel de Venomous (Devil May Care vs Venomous, dispersé en position 2 dans la fixture d'origine) devrait être remonté en 2e position, juste après celui de Vindicta, obtenu : " + JSON.stringify(huitiemesNames));
}
const quartsNames = [...roundCols[1].querySelectorAll(".cup-match-team span:first-child")].map(s => s.textContent);
console.log("Ordre affiché des quarts :", quartsNames);
if (quartsNames[0] !== "Vindicta" || quartsNames[1] !== "Venomous") {
  throw new Error("❌ Le quart 'Vindicta vs Venomous' devrait rester en tête de la colonne des quarts, obtenu : " + JSON.stringify(quartsNames));
}
console.log("✅ La colonne des 8e de finale est bien réorganisée pour placer Vindicta/Venomous en haut, alignées sur le quart Vindicta vs Venomous.");

await flush(dom);
dom.window.close();
server.close();

console.log("\n🏁 Tous les tests de réorganisation du tableau de la Coupe sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
