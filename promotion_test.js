// Vérifie la pyramide de divisions (montée/descente à la BuzzerBeater : 1
// championnat en Division I, 3 en II, 9 en III, 27 en IV, 81 en V, 243 en
// VI) : une nouvelle carrière n'est encore assignée nulle part, donc elle
// démarre le plus haut possible (Division I) plutôt que par le bas ; à la
// fin d'une saison, le vainqueur des play-offs peut monter d'un niveau,
// tandis que le 9e et le 10e décrochent directement et le perdant du
// barrage de relégation (7e vs 8e) descend aussi ; le résultat annoncé à
// l'écran de fin de saison doit être cohérent avec le niveau de division
// utilisé pour la saison suivante, et tout doit survivre à une
// sauvegarde/rechargement complet de la page.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

// Le bandeau "DIVISION I : 1 CHAMPIONNAT" de l'écran Ordres (#divisionBadge)
// a été retiré (retour utilisateur, 2026-09 : "enlève tout ce texte en haut
// [...] les infos se contredisent sinon", voir renderOrdresRoundDateTime
// dans moteurbasket3.html) ; on relit directement le même calcul que
// renderClubSection (le badge équivalent, toujours affiché sur le tableau de
// bord, #clubDivisionBadge) plutôt qu'un texte qui n'existe plus sur cet
// écran-ci.
function divisionBadgeText(win) {
  return win.eval('(function(){ var info = divisionInfo(league.divisionLevel || MAX_DIVISION_LEVEL); return info.name + " : " + info.leagueCount + " championnat" + (info.leagueCount > 1 ? "s" : ""); })()');
}

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
let dom = await openGame(html, baseUrl);
let doc = dom.window.document;
let win = dom.window;

// --- Nouvelle carrière : doit démarrer le plus haut possible (Division I),
// puisqu'un club "pas encore attribué" prend la place la plus haute libre. ---
const badgeAtStart = divisionBadgeText(win);
console.log("Badge division au départ :", badgeAtStart);
if (!badgeAtStart.startsWith("Division I ")) {
  throw new Error("❌ Une nouvelle carrière devrait démarrer en Division I (le plus haut possible) : " + badgeAtStart);
}
if (!badgeAtStart.includes("1 championnat")) {
  throw new Error("❌ Le badge devrait mentionner l'unique championnat de la Division I : " + badgeAtStart);
}

// --- La zone de relégation/promotion doit déjà être visible dans le
// classement consultable EN COURS de saison régulière (pas seulement à la
// fin), pour que l'enjeu se voie match après match. ---
doc.getElementById("regenBtn").click(); // "📊 Classement"
const zonesVisible = ["zone-promo", "zone-barrage", "zone-relegation"].every(cls =>
  doc.querySelector(`#standingsContent tr.${cls}`)
);
console.log(`${zonesVisible ? "✅" : "❌"} Zones de promotion/barrage/relégation visibles dans le classement en cours de saison.`);
if (!zonesVisible) throw new Error("❌ Les zones de promotion/barrage/relégation devraient être visibles dans le classement.");
doc.getElementById("closeStandingsBtn").click();

// --- Joue toute la saison régulière (18 journées) : depuis le passage au
// calendrier réel (tâche #21), plus de clic "Verrouiller & simuler" journée
// par journée — une longue absence couvrant toute la saison fait tout
// rattraper d'un coup côté serveur (voir fastForwardCalendar/catchUpLeague),
// comme calendar_test.js.
await flush(dom);
win.close();
fastForwardCalendar(savePath, 18);
dom = await openGame(html, baseUrl);
doc = dom.window.document;
win = dom.window;
const catchupVisible = !doc.getElementById("catchupSection").classList.contains("hidden");
if (!catchupVisible) throw new Error("❌ Le récapitulatif d'absence devrait s'afficher après une saison entière jouée automatiquement.");
doc.getElementById("catchupContinueBtn").click();

// --- Fin de saison : la ligue a joué les play-offs ET le barrage de
// relégation (7e vs 8e), avant même que l'utilisateur ne clique quoi que ce
// soit — voir enterNextMatchOrShowSeasonEnd. ---
await flush(dom);
const saved1 = readRawSave(savePath);
const fromLevel = saved1.league.divisionLevel;
console.log("\nDivision à la fin de la saison régulière :", fromLevel);
if (!saved1.league.playoffs) throw new Error("❌ Les play-offs devraient être joués à la fin de la saison.");
if (!saved1.league.relegationBarrage) throw new Error("❌ Le barrage de relégation (7e vs 8e) devrait être joué à la fin de la saison.");
console.log("Champion (idx) :", saved1.league.playoffs.champion, "| Barrage :", saved1.league.relegationBarrage);

// --- Le bandeau de résultat (promu/relégué/maintien) affiché à l'écran de
// fin de saison doit annoncer un résultat cohérent avec le vainqueur des
// play-offs / le barrage — quel que soit le résultat réel (aléatoire). ---
const outcomeEl = doc.querySelector(".season-division-outcome");
if (!outcomeEl) throw new Error("❌ Le bandeau de résultat montée/descente devrait être affiché à l'écran de fin de saison.");
const outcomeClass = ["promoted", "relegated", "stay"].find(c => outcomeEl.classList.contains(c));
console.log("Résultat annoncé pour le club du joueur :", outcomeClass, "—", outcomeEl.textContent);

const championIsUser = saved1.league.playoffs.champion === 0;
// On relit directement le classement affiché (déjà trié) pour repérer si le
// club du joueur (ligne "me") est en zone de relégation (barrage perdu ou
// 9e/10e), plutôt que de recalculer le classement à la main ici.
const meRow = [...doc.querySelectorAll("#seasonEndContent table.standings-table tbody tr")].find(r => r.classList.contains("me"));
const userIsRelegationZone = meRow && (meRow.classList.contains("zone-barrage") || meRow.classList.contains("zone-relegation"));
const userLostBarrage = saved1.league.relegationBarrage.loser === 0;
const userIsRelegated = userLostBarrage || (meRow && meRow.classList.contains("zone-relegation"));

let expectedOutcome = "stay";
if (championIsUser && fromLevel > 1) expectedOutcome = "promoted";
else if (userIsRelegated && fromLevel < 6) expectedOutcome = "relegated";
console.log(`${outcomeClass === expectedOutcome ? "✅" : "❌"} Le bandeau annoncé correspond au résultat sportif (attendu "${expectedOutcome}").`);
if (outcomeClass !== expectedOutcome) throw new Error(`❌ Bandeau "${outcomeClass}" incohérent avec le résultat sportif (attendu "${expectedOutcome}").`);

// --- Nouvelle saison : le niveau de division doit refléter exactement le
// résultat annoncé (monté d'un cran, descendu d'un cran, ou inchangé). ---
doc.getElementById("newSeasonBtn").click();
await flush(dom);
const saved2 = readRawSave(savePath);
const toLevel = saved2.league.divisionLevel;
const expectedToLevel = expectedOutcome === "promoted" ? fromLevel - 1 : expectedOutcome === "relegated" ? fromLevel + 1 : fromLevel;
console.log(`\nNiveau de division : ${fromLevel} → ${toLevel} (attendu ${expectedToLevel})`);
if (toLevel !== expectedToLevel) throw new Error(`❌ Le niveau de division de la nouvelle saison est incohérent : ${toLevel}, attendu ${expectedToLevel}.`);

const badgeAfter = divisionBadgeText(win);
console.log("Badge division après 'Nouvelle saison' :", badgeAfter);

// --- Persistance : rechargement complet de la page (même serveur). ---
win.close();
const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;
const badgeReloaded = divisionBadgeText(win2);
console.log("Badge division après rechargement :", badgeReloaded);
const persistedOk = badgeReloaded === badgeAfter;
console.log(`${persistedOk ? "✅" : "❌"} Le niveau de division survit au rechargement complet de la page.`);
if (!persistedOk) throw new Error("❌ Le niveau de division ne survit pas au rechargement.");

await flush(dom2);
win2.close();
server.close();
console.log("\n✅ Pyramide de divisions vérifiée (parcours joué) : départ en Division I, montée du champion, descente directe (9e/10e) + barrage (7e/8e), cohérence saison suivante, persistance.");

// ---------------------------------------------------------------------
// Cas limites (niveaux 1 et 6, maintien, relégation) — un parcours simulé
// tombe presque toujours sur "promoted" au tout premier essai (Lyon
// démarre plus fort que des adversaires de Division VI toute neuve), donc
// on vérifie directement la logique moteur (League.divisionOutcomeForUserTeam)
// pour couvrir les autres cas sans dépendre de l'aléatoire d'un match.
// ---------------------------------------------------------------------
const E = require("./engine.js");
const { generateTeam, League, MAX_DIVISION_LEVEL: MAX_LEVEL } = E;

function fakeLeague(divisionLevel, { championIdx = null, relegated = [] } = {}) {
  const teams = Array.from({ length: 10 }, (_, i) => generateTeam(`Équipe ${i}`));
  const lg = new League(teams);
  lg.divisionLevel = divisionLevel;
  lg.playoffs = { champion: championIdx };
  // On substitue directement relegatedTeamIndexes plutôt que de rejouer un
  // vrai barrage, pour contrôler précisément le scénario testé.
  lg.relegatedTeamIndexes = () => relegated;
  return lg;
}

// Le club du joueur (idx 0) gagne les play-offs mais est déjà en Division I
// (la plus haute) : pas de montée possible, il reste en Division I.
{
  const lg = fakeLeague(1, { championIdx: 0, relegated: [] });
  const o = lg.divisionOutcomeForUserTeam();
  console.log("\nChampion déjà en Division I :", o);
  if (o.outcome !== "stay" || o.toLevel !== 1) throw new Error("❌ Un champion déjà en Division I ne devrait plus pouvoir monter : " + JSON.stringify(o));
}
console.log("✅ Plafond de la pyramide respecté (pas de montée au-delà de la Division I).");

// Le club du joueur est relégué (perdant du barrage ou 9e/10e) mais est déjà
// en Division VI (la plus basse) : pas de descente possible, il y reste.
{
  const lg = fakeLeague(MAX_LEVEL, { championIdx: 3, relegated: [0, 8, 9] });
  const o = lg.divisionOutcomeForUserTeam();
  console.log("Relégué déjà en Division VI :", o);
  if (o.outcome !== "stay" || o.toLevel !== MAX_LEVEL) throw new Error("❌ Une équipe déjà en Division VI ne devrait plus pouvoir descendre : " + JSON.stringify(o));
}
console.log("✅ Plancher de la pyramide respecté (pas de descente au-delà de la Division VI).");

// Le club du joueur termine "au milieu du tableau" (ni champion, ni relégué) : maintien.
{
  const lg = fakeLeague(4, { championIdx: 3, relegated: [7, 8, 9] });
  const o = lg.divisionOutcomeForUserTeam();
  console.log("Milieu de tableau (Division IV) :", o);
  if (o.outcome !== "stay" || o.toLevel !== 4) throw new Error("❌ Une équipe ni championne ni reléguée devrait rester dans sa division : " + JSON.stringify(o));
}
console.log("✅ Maintien correct pour une équipe milieu de tableau.");

// Le club du joueur est relégué depuis une division intermédiaire : descend
// bien d'un cran (pas plus).
{
  const lg = fakeLeague(3, { championIdx: 5, relegated: [0, 8, 9] });
  const o = lg.divisionOutcomeForUserTeam();
  console.log("Relégué depuis la Division III :", o);
  if (o.outcome !== "relegated" || o.toLevel !== 4) throw new Error("❌ La relégation depuis une division intermédiaire devrait descendre d'un seul cran : " + JSON.stringify(o));
}
console.log("✅ Relégation d'un cran depuis une division intermédiaire.");

// Perdre le barrage 7e-8e relègue bien, exactement comme finir 9e ou 10e
// (idx 0 = club du joueur, ici perdant du barrage plutôt que 9e/10e direct).
{
  const lg = fakeLeague(2, { championIdx: 5, relegated: [0, 8, 9] });
  const o = lg.divisionOutcomeForUserTeam();
  console.log("Perdant du barrage (Division II) :", o);
  if (o.outcome !== "relegated" || o.toLevel !== 3) throw new Error("❌ Le perdant du barrage 7e-8e devrait être relégué comme un 9e/10e : " + JSON.stringify(o));
}
console.log("✅ Le perdant du barrage 7e-8e est bien relégué au même titre que le 9e/10e.");

console.log("\n✅ Tous les cas limites de la pyramide de divisions (I, VI, maintien, relégation intermédiaire, barrage) sont corrects.");

})().catch(e => { console.error(e); process.exit(1); });
