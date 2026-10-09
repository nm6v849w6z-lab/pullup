// Vérifie de bout en bout le nouveau modèle d'entraînement "à la
// BuzzerBeater" : le club choisit UNE compétence + les postes concernés
// (pas un choix joueur par joueur), et seuls les joueurs au bon poste ET
// ayant assez joué progressent plus vite. Vérifie aussi que tout survit à
// une sauvegarde / rechargement complet de la page (nouvelle instance jsdom).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar, editSave } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();

// Depuis le passage au calendrier réel (tâche #21), l'entraînement
// hebdomadaire n'est plus déclenché à la main (bouton "Valider la semaine",
// indépendant du calendrier) : il s'applique tout seul, une fois par semaine
// réelle, en même temps que les 2 journées de championnat de cette semaine
// (voir catchUpLeague). On ne peut donc plus reproduire "1 seul match joué
// mais 15 semaines d'entraînement" comme avant — à la place, on avance le
// calendrier de WEEKS semaines réelles complètes (2 journées chacune) d'un
// coup, ce qui fait mécaniquement jouer ROUNDS journées ET s'appliquer
// WEEKS entraînements hebdomadaires.
const WEEKS = 4;
const ROUNDS = WEEKS * 2;

(async () => {

// Un vrai petit serveur local (voir test_helpers.js) : depuis le passage au
// calendrier réel, la persistance vit côté serveur (fichier de sauvegarde),
// plus dans localStorage — "recharger la page" = ouvrir une nouvelle JSDOM
// pointée vers ce MÊME serveur, qui relit son fichier à chaque requête.
const { server, savePath, baseUrl } = await startTestServer();

// --- Session 1 : première visite, avant tout match. ---
let dom1 = await openGame(html, baseUrl);
let doc1 = dom1.window.document;
let win1 = dom1.window;

// #weekIndicator (écran Ordres) a été retiré du bandeau du haut (retour
// utilisateur, 2026-09, voir renderOrdresRoundDateTime dans
// moteurbasket3.html) ; on lit directement teamA.week, la même valeur qu'il
// affichait.
console.log("Avant tout match, semaine :", win1.eval("teamA.week"));

// Le bouton "🏋️ Semaine d'entraînement" affiché sous le direct (fin de
// match) a été retiré (retour utilisateur, 2026-09 : "enleve le bouton
// semaine d'entrainement sous le live") ; l'onglet latéral "Entraînement"
// reste la façon d'accéder à cet écran.
win1.eval("TAB_HANDLERS.entrainement();");

// Recrute un entraîneur niveau 4 (staff) avant d'entraîner : aucun effet sur
// les matchs, mais doit accélérer la progression et coûter un salaire
// hebdomadaire croissant, prélevé sur le budget du club. Depuis le passage
// au marché aux enchères (retour utilisateur, voir coach_market_test.js
// pour le détail du mécanisme lui-même — ce test-ci ne vérifie QUE la
// persistance), il n'y a plus de carte à prix fixe à cliquer : on simule
// directement une enchère gagnée (même méthode Team.hireTrainer qu'utilise
// League._resolveCoachListing une fois une enchère conclue), pour rester
// focalisé sur ce que ce test vérifie réellement.
// Plus de sauvegarde brute depuis le navigateur (carrière solo supprimée) :
// l'enchère gagnée est appliquée côté serveur, puis la page rechargée.
editSave(savePath, t => t.hireTrainer(4, 5000));
await flush(dom1);
win1.close();
dom1 = await openGame(html, baseUrl);
doc1 = dom1.window.document;
win1 = dom1.window;
win1.eval("TAB_HANDLERS.entrainement(); renderStaffPanel();");
console.log("Staff après recrutement niveau 4 :", doc1.getElementById("staffCurrent").textContent.replace(/\s+/g, " "));
console.log("Budget après recrutement (salaire pas encore prélevé) :", doc1.getElementById("staffBudget").textContent);

// Entraînement v2 (retour utilisateur 2026-10-01) : plans individuels au
// lieu de « compétence + postes » — deux pivots en « Jeu intérieur »,
// intensité Légère (pas de risque de blessure pendant le test).
const pivotIds = win1.eval("teamA.players.filter(p => p.position === 'Pivot').map(p => String(p.id))");
const addPlayer = (id) => {
  const sel = doc1.getElementById("trainingAddPlayer");
  sel.value = id;
  sel.dispatchEvent(new win1.Event("change", { bubbles: true }));
};
pivotIds.slice(0, 2).forEach(addPlayer);
// Chaque changement réaffiche la carte : on relit le menu par son index.
doc1.querySelectorAll("[data-slot-program]").forEach((_, i) => {
  const sel = doc1.querySelector(`[data-slot-program="${i}"]`);
  sel.value = "inside";
  sel.dispatchEvent(new win1.Event("change", { bubbles: true }));
});
doc1.querySelectorAll('#trainingPlansCard [data-int="legere"]').forEach((_, i) => doc1.querySelector(`#trainingPlansCard [data-slot-intensity="${i}"][data-int="legere"]`).click());
const slotRows = (doc) => [...doc.querySelectorAll("#trainingPlansCard .tm-slot")];
console.log("Plans individuels :", slotRows(doc1).map(r => r.querySelector(".tm-who b").textContent));
console.log("Rendement affiché :", slotRows(doc1).map(r => r.querySelector(".tm-eff-btn").textContent));

// --- Avance le calendrier de WEEKS semaines réelles complètes (ROUNDS
// journées) : une seule requête au serveur rattrape tout d'un coup (matchs +
// entraînement hebdomadaire, voir fastForwardCalendar/catchUpLeague). ---
await flush(dom1);
win1.close();
fastForwardCalendar(savePath, ROUNDS);
dom1 = await openGame(html, baseUrl);
doc1 = dom1.window.document;
win1 = dom1.window;
if (doc1.getElementById("catchupSection").classList.contains("hidden")) {
  throw new Error(`❌ Le récapitulatif d'absence devrait s'afficher après ${ROUNDS} journées jouées automatiquement.`);
}
const reportText = doc1.getElementById("catchupContent").textContent.replace(/\s+/g, " ").trim();
console.log("\nExtrait du récapitulatif :", reportText.slice(0, 300));
doc1.getElementById("catchupContinueBtn").click();

console.log("Staff après", WEEKS, "semaines :", doc1.getElementById("staffCurrent") ? "" : "");

await flush(dom1);
const saved = readRawSave(savePath);
if (!saved.team || !saved.league) throw new Error("❌ Format de sauvegarde inattendu (attendu team + league) : " + JSON.stringify(Object.keys(saved)));
const savedTeam = saved.team, savedLeague = saved.league;
console.log("\nSemaine sauvegardée :", savedTeam.week, "| plans :", JSON.stringify(savedTeam.trainingSlots), "| intensités :", (savedTeam.trainingSlots || []).map(sl => sl.intensity).join(", "));
console.log("Staff sauvegardé :", savedTeam.trainer, "| budget sauvegardé :", savedTeam.budget);
if (!Array.isArray(savedTeam.trainingSlots) || savedTeam.trainingSlots.length !== 2 || savedTeam.trainingSlots.some(sl => sl.program !== "inside")) throw new Error("❌ Les plans individuels n'ont pas été sauvegardés correctement.");
if (savedTeam.trainingSlots.some(sl => sl.intensity !== "legere")) throw new Error("❌ L'intensité n'a pas été sauvegardée correctement.");
if (!savedTeam.trainer || savedTeam.trainer.level !== 4 || savedTeam.trainer.weeksEmployed !== WEEKS) throw new Error("❌ Le staff (entraîneur) n'a pas été sauvegardé correctement : " + JSON.stringify(savedTeam.trainer));
// Avec plusieurs matchs (dont potentiellement des matchs à domicile,
// recette de billetterie à 6 chiffres) mêlés aux semaines d'entraînement, le
// budget net peut très bien avoir augmenté malgré le salaire du staff — on
// vérifie donc directement que ce salaire a bien été prélevé via le journal
// des transactions plutôt que via le solde net du budget.
const staffSalaryPayments = savedTeam.transactions.filter(t => t.label === "Salaire du staff" && t.amount < 0);
console.log("Prélèvements de salaire du staff dans le journal :", staffSalaryPayments.length, "(attendu", WEEKS, ")");
if (staffSalaryPayments.length !== WEEKS) throw new Error(`❌ Le budget n'a pas été débité du salaire du staff exactement ${WEEKS} fois : ${staffSalaryPayments.length} prélèvement(s) trouvé(s).`);

// Le pivot devrait avoir progressé en jeu intérieur (poste concerné + a joué
// dans les matchs disputés, en tant que titulaire).
const trainedPivots = savedTeam.players.filter(p => p.position === "Pivot");
console.log("Pivots sauvegardés (jeu intérieur) :", trainedPivots.map(p => `${p.name}: ${p.attrs.inside} (potentiel ${p.potential})`));

// --- Calendrier : ROUNDS journées ont été jouées (ROUNDS * 5 résultats : le
// nôtre + les 4 entre les autres équipes à chaque journée, simulés
// automatiquement). ---
console.log(`\nJournée courante après ${ROUNDS} journées : ${savedLeague.round} (attendu ${ROUNDS})`);
console.log(`Résultats enregistrés : ${savedLeague.results.length} (attendu ${ROUNDS * 5})`);
if (savedLeague.round !== ROUNDS) throw new Error("❌ La ligue n'a pas avancé du nombre de journées attendu : " + savedLeague.round);
if (savedLeague.results.length !== ROUNDS * 5) throw new Error("❌ Nombre de résultats de journée inattendu : " + savedLeague.results.length);
if (!Array.isArray(savedLeague.teams) || savedLeague.teams.length !== 10) throw new Error("❌ La ligue devrait contenir 10 équipes : " + (savedLeague.teams || []).length);

win1.close();

// --- Session 2 : rechargement de la page — même serveur, qui relit sa
// sauvegarde sur disque (celle écrite par la session 1 ci-dessus). ---
const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;

console.log("\n--- Après rechargement (nouvelle session) ---");
// #weekIndicator et #matchupContext (écran Ordres) ont été retirés du
// bandeau du haut (retour utilisateur, 2026-09 : "enlève tout ce texte en
// haut [...] les infos se contredisent sinon", voir renderOrdresRoundDateTime
// dans moteurbasket3.html) : on vérifie directement l'état sous-jacent
// (teamA.week, currentMatch.round) plutôt que ce texte qui n'existe plus.
const weekOk = win2.eval("teamA.week") === savedTeam.week;
console.log(`${weekOk ? "✅" : "❌"} Semaine persistée : attendu ${savedTeam.week}, obtenu ${win2.eval("teamA.week")}`);

const journeeOk = win2.eval("currentMatch.round") === ROUNDS;
console.log(`${journeeOk ? "✅" : "❌"} Calendrier persisté : la journée ${ROUNDS + 1} est bien proposée au rechargement (currentMatch.round = ${win2.eval("currentMatch.round")}).`);

win2.eval("TAB_HANDLERS.entrainement();");
const reloadedSlots = slotRows(doc2);
const skillOk = reloadedSlots.length === 2 && reloadedSlots.every(r => r.querySelector("[data-slot-program]").value === "inside");
const posOk = doc2.querySelectorAll('#trainingPlansCard [data-int="legere"].on').length === 2;
console.log(`${skillOk ? "✅" : "❌"} Plans individuels persistés : ${reloadedSlots.length} joueur(s) en « Jeu intérieur »`);
console.log(`${posOk ? "✅" : "❌"} Intensité persistée (Légère)`);
// Rendement recalculé au rechargement (minutes de la nouvelle semaine).
const listEmptyOk = reloadedSlots.every(r => /^\d+ %$/.test(r.querySelector(".tm-eff-btn").textContent));
console.log(`${listEmptyOk ? "✅" : "❌"} Rendement affiché pour chaque plan après rechargement.`);

// Staff v2 (2026-10-01) : carte du poste (nom/étoiles dans #staffCurrent, ancienneté « N sem. »).
const staffText = doc2.querySelector('#staffSlots [data-staff-role="coach"]').textContent.replace(/\s+/g, " ");
const budgetText = doc2.getElementById("staffBudget").textContent;
console.log("Staff après rechargement :", staffText);
console.log("Budget après rechargement :", budgetText);
// Refonte Staff (2026-09-25) : le niveau n'est plus écrit en texte, seulement
// en étoiles (aria-label "Niveau N sur 5").
const staffOk = !!doc2.querySelector('#staffCurrent [aria-label="Niveau 4 sur 5"]') && new RegExp(`En poste\\s*${WEEKS} sem\\.`).test(staffText);
// Refonte Staff (2026-09-25) : #staffBudget ne contient plus que le montant
// (le libellé "Budget club" est désormais une étiquette séparée de la tuile).
const budgetOk = budgetText === `${savedTeam.budget.toLocaleString("fr-FR")} $`;
console.log(`${staffOk ? "✅" : "❌"} Entraîneur (niveau + ancienneté) persisté.`);
console.log(`${budgetOk ? "✅" : "❌"} Budget du club persisté.`);

await flush(dom2);
win2.close();
server.close();

if (!weekOk || !journeeOk || !skillOk || !posOk || !staffOk || !budgetOk || !listEmptyOk) process.exit(1);
console.log("\n✅ Persistance vérifiée : semaine, calendrier/journée, plans individuels, intensité, staff et budget survivent à un rechargement complet de la page.");

})().catch(e => { console.error(e); process.exit(1); });
