// Vérifie le calendrier fusionné (retour utilisateur, 2026-09 : "calendrier
// avec la date/l'heure [...] fusionner la coupe dans la même feuille") —
// voir renderCalendrierSection/scheduledTimeForChampionshipRound/
// scheduledTimeForCupRound dans moteurbasket3.html. Deux parties :
// 1) calendrier classique (carrière solo, pas de coupe) : chaque journée de
//    championnat affiche désormais une vraie date/heure programmée, plus
//    seulement un numéro de journée.
// 2) calendrier ancré quotidien (ligue multi-manager, avec coupe) : les
//    tours de coupe du club du joueur apparaissent DANS LA MÊME feuille que
//    le championnat, triés chronologiquement avec lui plutôt que dans un
//    tableau séparé.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();

// ---------------------------------------------------------------------
// Partie 1 : calendrier classique — date/heure sur chaque ligne, pas de
// note "Coupe" (league.cup est null en carrière solo).
// ---------------------------------------------------------------------
const dom1 = await openGame(html, baseUrl);
const doc1 = dom1.window.document;
const win1 = dom1.window;
[...doc1.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "calendrier").click();

const firstRow = doc1.querySelector("#calendrierContent table.calendar-table tbody tr");
if (!firstRow) throw new Error("❌ (setup) le calendrier devrait afficher au moins une ligne.");
const dateCellText = firstRow.children[0].textContent;
console.log("Première ligne du calendrier (carrière solo) — cellule Date :", dateCellText);
if (dateCellText.includes("—")) {
  throw new Error("❌ En carrière solo, calendarStartAt est toujours configuré : la première journée devrait afficher une vraie date/heure, pas '—'.");
}
// Refonte du calendrier (2026-09-25) : la date est découpée en jour court
// ("sam. 26 sept.") + heure ("19:00"), et le numéro de journée passe dans
// la 2e colonne ("J1", libellé complet "Journée 1" en infobulle).
const roundAbbr = firstRow.children[1].querySelector("abbr");
if (!roundAbbr || roundAbbr.textContent !== "J1" || roundAbbr.getAttribute("title") !== "Journée 1") {
  throw new Error(`❌ La 2e colonne devrait afficher "J1" (infobulle "Journée 1"), obtenu "${firstRow.children[1].textContent}".`);
}
const expectedFirstDate = win1.eval("scheduledTimeForChampionshipRound(0)");
const expectedDay = win1.eval(`formatCalendarDayFr(${expectedFirstDate})`);
const expectedTime = win1.eval(`formatCalendarTimeFr(${expectedFirstDate})`);
if (!dateCellText.includes(expectedDay) || !dateCellText.includes(expectedTime)) {
  throw new Error(`❌ La date affichée (${dateCellText}) devrait correspondre exactement à scheduledTimeForChampionshipRound(0) formatée (${expectedDay} / ${expectedTime}).`);
}
console.log("✅ Chaque journée de championnat affiche bien sa date/heure programmée exacte, pas seulement son numéro.");

const noCupNote = doc1.getElementById("calendrierContent").textContent.includes("Votre club n'est plus engagé en Coupe");
if (noCupNote) throw new Error("❌ En carrière solo (pas de Coupe du tout), la note 'plus engagé en Coupe' ne devrait pas apparaître.");
console.log("✅ Aucune mention de Coupe en carrière solo (league.cup est null).");
await flush(dom1);
dom1.window.close();

// ---------------------------------------------------------------------
// Partie 2 : calendrier ancré quotidien avec une Coupe active — on
// fabrique directement un état de coupe (comme un tour déjà résolu
// impliquant le club du joueur) via win.eval, sans repasser par tout le
// pipeline serveur multi-manager (déjà couvert par server/cup_test.js) :
// ce test-ci vérifie uniquement la FUSION à l'affichage, pas la logique de
// progression de la coupe elle-même.
// ---------------------------------------------------------------------
const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;

win2.eval(`
  league.calendarDailyAnchored = true;
  league.cup = {
    rounds: [{
      index: 0, name: "huitiemes", dayIndex: 0, resolved: true,
      matches: [{ home: myTeamIndex, away: 1, resolved: true, scoreHome: 88, scoreAway: 74, winner: myTeamIndex }],
    }],
    champion: null,
  };
`);
const cupScheduledAt = win2.eval("scheduledTimeForCupRound(0)");
const champRound0At = win2.eval("scheduledTimeForChampionshipRound(0)");
console.log("\nHoraire programmé du tour de coupe (jour 0) :", cupScheduledAt, "| journée 1 de championnat :", champRound0At);
if (cupScheduledAt == null) throw new Error("❌ (setup) scheduledTimeForCupRound devrait renvoyer un horaire une fois calendarDailyAnchored activé.");

[...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "calendrier").click();
const rows = [...doc2.querySelectorAll("#calendrierContent table.calendar-table tbody tr")];
console.log("Nombre de lignes du calendrier fusionné :", rows.length);

// Retour utilisateur (2026-09) : "enlève tous les emojis qu'il y a dans le
// jeu, sauf ceux dans le menu de gauche et celui qui clignote" : le badge
// de compétition ("Coupe"/"Championnat", voir compLabel côté navigateur)
// n'affiche plus l'emoji 🏆 en préfixe.
const cupRowIdx = rows.findIndex(r => r.textContent.includes("Coupe"));
if (cupRowIdx === -1) throw new Error("❌ Le tour de coupe du club du joueur devrait apparaître dans la même feuille que le championnat (une ligne 'Coupe').");
const cupRow = rows[cupRowIdx];
console.log("Ligne de coupe trouvée :", cupRow.textContent.replace(/\s+/g, " ").trim());
// Depuis 2026-09-25 ("Coupe · Quarts c'est moche") : badge court sur une
// ligne ("Coupe 1/8"), nom complet du tour en infobulle.
const cupBadge = cupRow.querySelector(".cal-cup-badge");
if (!cupBadge || cupBadge.textContent !== "Coupe 1/8" || !cupBadge.title.includes("Huitièmes")) throw new Error(`❌ La ligne de coupe devrait afficher "Coupe 1/8" (infobulle "Huitièmes"), obtenu "${cupBadge && cupBadge.textContent}".`);
if (!cupRow.textContent.includes("88 - 74")) throw new Error("❌ La ligne de coupe devrait afficher le score exact du match (88 - 74).");
if (!cupRow.classList.contains("result-win")) throw new Error("❌ Une victoire de coupe devrait être stylée comme une victoire (classe 'result-win'), comme au championnat.");
console.log("✅ Le tour de coupe apparaît bien dans la même feuille que le championnat, avec son tour, son score, et son style de victoire/défaite.");

// Vérifie la fusion CHRONOLOGIQUE : la ligne de coupe (jour 0, 15h) doit
// être ordonnée par rapport aux lignes de championnat selon son horaire
// programmé réel, pas reléguée après-coup dans un second tableau.
// Refonte 2026-09-25 : "Journée 1" n'est plus dans le texte de la ligne
// mais dans l'infobulle de l'abréviation "J1" (2e colonne).
const champRow0Idx = rows.findIndex(r => !!r.querySelector('abbr[title="Journée 1"]'));
if (champRow0Idx === -1) throw new Error("❌ (setup) la ligne de la journée 1 de championnat devrait être trouvable.");
console.log("Index de la ligne de coupe :", cupRowIdx, "| index de la journée 1 de championnat :", champRow0Idx, `(coupe avant journée 1 attendu : ${cupScheduledAt < champRound0At})`);
const expectedCupBeforeRound0 = cupScheduledAt < champRound0At;
const actualCupBeforeRound0 = cupRowIdx < champRow0Idx;
if (expectedCupBeforeRound0 !== actualCupBeforeRound0) {
  throw new Error(`❌ L'ordre affiché (coupe ${actualCupBeforeRound0 ? "avant" : "après"} la journée 1) ne correspond pas à l'ordre chronologique réel des horaires programmés (coupe ${expectedCupBeforeRound0 ? "avant" : "après"} attendu).`);
}
console.log("✅ La ligne de coupe est bien triée à sa place chronologique exacte parmi les journées de championnat, pas ajoutée en vrac à la fin.");

await flush(dom2);
dom2.window.close();
server.close();

console.log("\n🏁 Tous les tests du calendrier fusionné (date/heure + coupe) sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
