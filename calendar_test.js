// Vérifie le calendrier de saison (10 équipes, aller-retour, 18 journées) :
// classement consultable avant le premier match, une longue absence fait
// rattraper AUTOMATIQUEMENT toute la saison régulière côté serveur (voir
// catchUpLeague) — plus de clic "Verrouiller & simuler" journée par journée
// depuis le passage au calendrier réel (tâche #21, préparation à l'avance
// au lieu d'actions immédiates) — puis fin de saison (play-offs + champion)
// et démarrage d'une nouvelle saison.
const fs = require("fs");
const { startTestServer, openGame, flush, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom1 = await openGame(html, baseUrl);
const doc1 = dom1.window.document;

// #matchupContext (écran Ordres) a été retiré du bandeau du haut (retour
// utilisateur, 2026-09 : "enlève tout ce texte en haut [...] les infos se
// contredisent sinon", voir renderOrdresRoundDateTime dans
// moteurbasket3.html) : on vérifie directement le round sous-jacent plutôt
// que ce texte qui n'existe plus.
console.log("Round initial (0-indexé) :", dom1.window.eval("currentMatch.round"));
if (dom1.window.eval("currentMatch.round") !== 0) {
  throw new Error("❌ Le calendrier ne démarre pas à la journée 1/18.");
}

// --- Classement consultable avant le premier match : tout le monde à 0 ---
doc1.getElementById("regenBtn").click(); // "📊 Classement"
const standingsVisible = !doc1.getElementById("standingsSection").classList.contains("hidden");
const prepHiddenNow = doc1.getElementById("prepSection").classList.contains("hidden");
console.log(`${standingsVisible && prepHiddenNow ? "✅" : "❌"} Écran de classement accessible depuis la préparation.`);
const rowsBefore = doc1.querySelectorAll("#standingsContent tbody tr").length;
console.log("Lignes du classement (attendu 10) :", rowsBefore);
if (rowsBefore !== 10) throw new Error("❌ Le classement devrait afficher 10 équipes : " + rowsBefore);
doc1.getElementById("closeStandingsBtn").click();
if (doc1.getElementById("prepSection").classList.contains("hidden")) throw new Error("❌ Le retour depuis le classement ne réaffiche pas la préparation.");

// --- Retour utilisateur (2026-09) : "si on va dans le calendrier on doit
// pouvoir donnez ses ordres pour tous les matchs de la saison" — le bouton
// 📋 Ordres du calendrier doit apparaître sur TOUTE journée pas encore
// jouée, pas seulement le prochain match (les tactiques/la feuille de
// match sont un réglage persistant, applicable à tous les matchs à venir —
// voir renderCalendrierSection). ---
[...doc1.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "calendrier").click();
const calendarOrderBtns = [...doc1.querySelectorAll("#calendrierContent .calendar-order-btn")];
console.log("\nBoutons '📋 Ordres' dans le calendrier, avant tout match joué :", calendarOrderBtns.length, "(attendu 18, une par journée à venir)");
if (calendarOrderBtns.length !== 18) throw new Error(`❌ Le bouton 📋 Ordres devrait apparaître sur les 18 journées à venir, pas seulement le prochain match, obtenu ${calendarOrderBtns.length}.`);
// Clique sur le bouton d'une journée LOINTAINE (pas le prochain match) :
// doit quand même rejoindre l'écran de préparation / onglet Ordres.
calendarOrderBtns[calendarOrderBtns.length - 1].click();
const prepVisibleAfterFarClick = !doc1.getElementById("prepSection").classList.contains("hidden");
const ordresTabActiveAfterFarClick = doc1.getElementById("tabOrdres").classList.contains("active");
console.log(`${prepVisibleAfterFarClick && ordresTabActiveAfterFarClick ? "✅" : "❌"} Le bouton 📋 Ordres d'une journée lointaine (pas le prochain match) rejoint bien l'onglet Ordres.`);
if (!prepVisibleAfterFarClick || !ordresTabActiveAfterFarClick) {
  throw new Error("❌ Le bouton 📋 Ordres du calendrier, sur une journée qui n'est pas le prochain match, devrait quand même rejoindre l'onglet Ordres (réglages persistants, applicables à tous les matchs à venir).");
}
console.log("✅ Le calendrier permet de donner ses ordres pour n'importe quel match à venir de la saison, pas uniquement le prochain.");

await flush(dom1);
dom1.window.close();

// --- Longue absence couvrant toute la saison régulière (et, avec la marge
// ci-dessous, les play-offs qui suivent) : les 18 journées sont dues d'un
// coup (voir fastForwardCalendar/catchUpLeague) — une seule requête au
// serveur (l'ouverture de la page) rattrape tout. 18 journées de saison
// régulière + marge de 6 journées pour les play-offs (2 demi-finales + 1
// finale, chacune au meilleur des 3, jouées sur plusieurs jours réels
// distincts, voir la directive utilisateur "les play offs doivent être
// comme les matchs de saisons régulières, avec un live").
fastForwardCalendar(savePath, 24);
const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;

// Le récapitulatif "Pendant votre absence" doit lister les 18 journées,
// dans l'ordre, sans saut ni répétition (les semaines d'entraînement
// intercalées ne comptent pas comme des journées de championnat).
const catchupVisible = !doc2.getElementById("catchupSection").classList.contains("hidden");
console.log(`${catchupVisible ? "✅" : "❌"} Récapitulatif d'absence affiché après une longue absence couvrant toute la saison.`);
if (!catchupVisible) throw new Error("❌ Le récapitulatif d'absence devrait s'afficher.");

const catchupTitles = [...doc2.querySelectorAll("#catchupContent .catchup-item h3")].map(h => h.textContent);
const roundNumbers = catchupTitles
  .map(t => t.match(/Journée (\d+)/))
  .filter(Boolean)
  .map(m => parseInt(m[1], 10));
console.log("\nJournées listées dans le récapitulatif :\n" + roundNumbers.join(", "));
const expected = Array.from({ length: 18 }, (_, i) => i + 1);
const roundsOk = JSON.stringify(roundNumbers) === JSON.stringify(expected);
console.log(`${roundsOk ? "✅" : "❌"} Les 18 journées ont été jouées dans l'ordre, sans saut ni répétition.`);
if (!roundsOk) throw new Error("❌ Séquence de journées inattendue : " + roundNumbers.join(","));

// --- "Continuer" doit ensuite afficher l'écran de fin de saison (play-offs
// calculés, champion annoncé) puisque toute la saison régulière est faite.
doc2.getElementById("catchupContinueBtn").click();
const seasonEndVisible = !doc2.getElementById("seasonEndSection").classList.contains("hidden");
console.log(`\n${seasonEndVisible ? "✅" : "❌"} Écran de fin de saison affiché après la 18e journée.`);
if (!seasonEndVisible) throw new Error("❌ L'écran de fin de saison ne s'est pas affiché.");

const seasonEndText = doc2.getElementById("seasonEndContent").textContent;
console.log("Contenu (extrait) :", seasonEndText.replace(/\s+/g, " ").slice(0, 400));
const hasChampion = seasonEndText.includes("Champion");
const hasPlayoffs = seasonEndText.includes("Demi-finale 1") && seasonEndText.includes("Finale");
console.log(`${hasChampion ? "✅" : "❌"} Un champion est annoncé.`);
console.log(`${hasPlayoffs ? "✅" : "❌"} Les demi-finales et la finale sont affichées.`);

// Chaque équipe doit avoir joué exactement 18 matchs de saison régulière.
const standingsRows = [...doc2.querySelectorAll("#seasonEndContent table.standings-table tbody tr")];
const allPlayed18 = standingsRows.every(r => r.children[2].textContent === "18");
console.log(`${allPlayed18 && standingsRows.length === 10 ? "✅" : "❌"} Les 10 équipes ont chacune joué 18 matchs de saison régulière.`);

// --- Nouvelle saison : le calendrier redémarre à la journée 1, avec 9
// nouveaux adversaires (mêmes noms de villes, forces re-tirées), l'effectif
// du joueur (potentiel/progression/staff) restant inchangé.
doc2.getElementById("newSeasonBtn").click();
const backToPrep = !doc2.getElementById("prepSection").classList.contains("hidden") &&
  doc2.getElementById("seasonEndSection").classList.contains("hidden");
console.log("\nRound après 'Nouvelle saison' (0-indexé) :", dom2.window.eval("currentMatch.round"));
console.log(`${backToPrep ? "✅" : "❌"} Retour à l'écran de préparation.`);
// Même remarque que plus haut : #matchupContext n'existe plus depuis le
// retrait du bandeau du haut de l'écran Ordres (2026-09), on vérifie le
// round sous-jacent.
const newSeasonRoundOk = dom2.window.eval("currentMatch.round") === 0;
console.log(`${newSeasonRoundOk ? "✅" : "❌"} Le calendrier de la nouvelle saison redémarre à la journée 1/18.`);

if (!standingsVisible || !prepHiddenNow || rowsBefore !== 10 || !catchupVisible || !roundsOk || !seasonEndVisible ||
    !hasChampion || !hasPlayoffs || !allPlayed18 || !backToPrep || !newSeasonRoundOk) {
  process.exit(1);
}

await flush(dom2);
dom2.window.close();
server.close();
console.log("\n✅ Calendrier de saison vérifié : classement, rattrapage automatique de toute une saison après une longue absence (récapitulatif dans l'ordre), fin de saison (play-offs + champion), et nouvelle saison.");

})().catch(e => { console.error(e); process.exit(1); });
