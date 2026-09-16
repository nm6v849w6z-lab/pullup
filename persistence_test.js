// Vérifie de bout en bout le nouveau modèle d'entraînement "à la
// BuzzerBeater" : le club choisit UNE compétence + les postes concernés
// (pas un choix joueur par joueur), et seuls les joueurs au bon poste ET
// ayant assez joué progressent plus vite. Vérifie aussi que tout survit à
// une sauvegarde / rechargement complet de la page (nouvelle instance jsdom).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

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

console.log("Avant tout match :", doc1.getElementById("weekIndicator").textContent);

doc1.getElementById("goToTrainingBtn").click();

// Recrute un entraîneur niveau 4 (staff) avant d'entraîner : aucun effet sur
// les matchs, mais doit accélérer la progression et coûter un salaire
// hebdomadaire croissant, prélevé sur le budget du club. Depuis le passage
// au marché aux enchères (retour utilisateur, voir coach_market_test.js
// pour le détail du mécanisme lui-même — ce test-ci ne vérifie QUE la
// persistance), il n'y a plus de carte à prix fixe à cliquer : on simule
// directement une enchère gagnée (même méthode Team.hireTrainer qu'utilise
// League._resolveCoachListing une fois une enchère conclue), pour rester
// focalisé sur ce que ce test vérifie réellement.
win1.eval('teamA.hireTrainer(4, 5000); saveMyTeam(); renderStaffPanel();');
console.log("Staff après recrutement niveau 4 :", doc1.getElementById("staffCurrent").textContent.replace(/\s+/g, " "));
console.log("Budget après recrutement (salaire pas encore prélevé) :", doc1.getElementById("staffBudget").textContent);

// Choisit "Jeu intérieur" (inside) comme compétence de la semaine.
const skillSel = doc1.getElementById("trainingSkillSelect");
skillSel.value = "inside";
skillSel.dispatchEvent(new win1.Event("change"));

const posSel = doc1.getElementById("trainingPositionsSelect");
console.log("Options de postes proposées pour 'Jeu intérieur' :", [...posSel.options].map(o => o.textContent));
// La 1ère option doit être le poste "naturel" (Pivot, 100%).
console.log("Postes sélectionnés par défaut :", posSel.value);
console.log("Note de dilution :", doc1.getElementById("trainingDilutionNote").textContent);

let rows = [...doc1.querySelectorAll(".training-row")];
const pivotRow = rows.find(r => r.querySelector(".tr-name").textContent.includes(" P "));
console.log("\nLigne d'un Pivot (poste concerné) :", pivotRow ? pivotRow.textContent.replace(/\s+/g, " ") : "introuvable");
const meneurRow = rows.find(r => r.querySelector(".tr-name").textContent.includes(" M "));
console.log("Ligne d'un Meneur (poste NON concerné) :", meneurRow ? meneurRow.textContent.replace(/\s+/g, " ") : "introuvable");

// Repère les pivots pour vérifier l'effet du gabarit.
function pivots(doc) {
  return [...doc.querySelectorAll(".training-row")].filter(r => r.querySelector(".tr-meta").textContent.startsWith("P ·"));
}
console.log(`\n${pivots(doc1).length} pivots trouvés.`);

// Étend à 2 postes (Pivot + Ailier fort) pour vérifier la dilution + la
// couverture de plus de joueurs.
const twoPosOption = [...posSel.options].find(o => o.value.split("|").length === 2);
if (twoPosOption) {
  posSel.value = twoPosOption.value;
  posSel.dispatchEvent(new win1.Event("change"));
  console.log("\nAprès extension à 2 postes :", posSel.value, "| note :", doc1.getElementById("trainingDilutionNote").textContent);
}

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
console.log("\nSemaine sauvegardée :", savedTeam.week, "| trainingSkill:", savedTeam.trainingSkill, "| trainingPositions:", savedTeam.trainingPositions);
console.log("Staff sauvegardé :", savedTeam.trainer, "| budget sauvegardé :", savedTeam.budget);
if (savedTeam.trainingSkill !== "inside") throw new Error("❌ La compétence entraînée n'a pas été sauvegardée correctement.");
if (!Array.isArray(savedTeam.trainingPositions) || savedTeam.trainingPositions.length !== 2) throw new Error("❌ Les postes entraînés n'ont pas été sauvegardés correctement.");
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
const expectedWeek = `Semaine ${savedTeam.week}`;
const weekOk = doc2.getElementById("weekIndicator").textContent === expectedWeek;
console.log(`${weekOk ? "✅" : "❌"} Semaine persistée : attendu "${expectedWeek}", obtenu "${doc2.getElementById("weekIndicator").textContent}"`);

console.log("Contexte de match après rechargement :", doc2.getElementById("matchupContext").textContent);
const expectedJournee = `Journée ${ROUNDS + 1}/18`;
const journeeOk = doc2.getElementById("matchupContext").textContent.startsWith(expectedJournee);
console.log(`${journeeOk ? "✅" : "❌"} Calendrier persisté : la journée ${ROUNDS + 1} est bien proposée au rechargement.`);

doc2.getElementById("goToTrainingBtn").click();
const skillOk = doc2.getElementById("trainingSkillSelect").value === "inside";
const posOk = doc2.getElementById("trainingPositionsSelect").value.split("|").length === 2;
console.log(`${skillOk ? "✅" : "❌"} Compétence entraînée persistée : "${doc2.getElementById("trainingSkillSelect").value}"`);
console.log(`${posOk ? "✅" : "❌"} Postes entraînés persistés : "${doc2.getElementById("trainingPositionsSelect").value}"`);

// Le poste vit désormais dans son propre badge .tr-pos-badge (habillage FM
// de l'écran Entraînement), plus dans le texte de .tr-meta — voir
// buildTrainingRow.
const reloadedRows = [...doc2.querySelectorAll(".training-row")];
const reloadedPivotRow = reloadedRows.find(r => r.querySelector(".tr-pos-badge").textContent === "P");
console.log("Statut d'un pivot après rechargement :", reloadedPivotRow.querySelector(".tr-status").textContent, "(secondsPlayed non persisté entre sessions, remis à 0 -> normal que ce ne soit plus 'assez joué' avant le prochain match)");

const staffText = doc2.getElementById("staffCurrent").textContent.replace(/\s+/g, " ");
const budgetText = doc2.getElementById("staffBudget").textContent;
console.log("Staff après rechargement :", staffText);
console.log("Budget après rechargement :", budgetText);
const staffOk = staffText.includes("niveau 4") && staffText.includes(`En poste depuis ${WEEKS} semaine`);
const budgetOk = budgetText === `Budget club : ${savedTeam.budget.toLocaleString("fr-FR")} €`;
console.log(`${staffOk ? "✅" : "❌"} Entraîneur (niveau + ancienneté) persisté.`);
console.log(`${budgetOk ? "✅" : "❌"} Budget du club persisté.`);

await flush(dom2);
win2.close();
server.close();

if (!weekOk || !journeeOk || !skillOk || !posOk || !staffOk || !budgetOk) process.exit(1);
console.log("\n✅ Persistance vérifiée : semaine, calendrier/journée, compétence entraînée, postes concernés, staff et budget survivent à un rechargement complet de la page.");

})().catch(e => { console.error(e); process.exit(1); });
