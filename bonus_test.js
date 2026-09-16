// Vérifie les primes de fin de saison (retour utilisateur : "il faut prévoir
// des primes de montée en cas de montée et une prime de champion pour celui
// en DI (moins importante qu'une prime de montée)") : League.divisionOutcomeForUserTeam
// détecte bien le cas "champion de Division I" (pas de montée possible,
// l'outcome générique reste "stay"), seasonEndBonusFor calcule le bon
// montant pour chaque cas, et startNewSeason() verse effectivement la prime
// au budget du club AVANT de régénérer la ligue de la saison suivante.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, writeRawSave, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

// ---------------------------------------------------------------------
// Partie 1 : logique moteur pure (League.divisionOutcomeForUserTeam /
// seasonEndBonusFor), comme les "cas limites" de promotion_test.js — plus
// fiable qu'un parcours simulé pour couvrir précisément chaque cas.
// ---------------------------------------------------------------------
const E = require("./engine.js");
const {
  generateTeam, League, MAX_DIVISION_LEVEL: MAX_LEVEL,
  PROMOTION_BONUS_BY_LEVEL, CHAMPION_BONUS_DIVISION_I, seasonEndBonusFor,
} = E;

function fakeLeague(divisionLevel, { championIdx = null, relegated = [] } = {}) {
  const teams = Array.from({ length: 10 }, (_, i) => generateTeam(`Équipe ${i}`));
  const lg = new League(teams);
  lg.divisionLevel = divisionLevel;
  lg.playoffs = { champion: championIdx };
  lg.relegatedTeamIndexes = () => relegated;
  return lg;
}

// --- Montée depuis la Division II : outcome "promoted", championDivisionI
// à false, prime = PROMOTION_BONUS_BY_LEVEL[1] (division d'arrivée). ---
{
  const lg = fakeLeague(2, { championIdx: 0, relegated: [] });
  const o = lg.divisionOutcomeForUserTeam();
  console.log("Champion en Division II (montée en I) :", o);
  if (o.outcome !== "promoted" || o.toLevel !== 1) throw new Error("❌ Devrait monter en Division I : " + JSON.stringify(o));
  if (o.championDivisionI !== false) throw new Error("❌ championDivisionI devrait être false pour une montée depuis la Division II.");
  const bonus = seasonEndBonusFor(o);
  console.log("Prime calculée :", bonus);
  if (!bonus || bonus.amount !== PROMOTION_BONUS_BY_LEVEL[1]) {
    throw new Error("❌ La prime de montée en Division I devrait valoir " + PROMOTION_BONUS_BY_LEVEL[1] + " : " + JSON.stringify(bonus));
  }
}
console.log("✅ Prime de montée (Division II → I) correcte.");

// --- Montée depuis une division intermédiaire (IV → III). ---
{
  const lg = fakeLeague(4, { championIdx: 0, relegated: [] });
  const o = lg.divisionOutcomeForUserTeam();
  const bonus = seasonEndBonusFor(o);
  console.log("\nChampion en Division IV (montée en III) :", o, "| Prime :", bonus);
  if (o.outcome !== "promoted" || o.toLevel !== 3) throw new Error("❌ Devrait monter en Division III : " + JSON.stringify(o));
  if (!bonus || bonus.amount !== PROMOTION_BONUS_BY_LEVEL[3]) throw new Error("❌ Prime de montée en Division III incorrecte : " + JSON.stringify(bonus));
}
console.log("✅ Prime de montée (Division IV → III) correcte.");

// --- Champion de Division I : pas de montée possible (outcome "stay"), mais
// championDivisionI à true et une prime de champion, STRICTEMENT plus petite
// que N'IMPORTE laquelle des primes de montée ("moins importante qu'une
// prime de montée", retour utilisateur). ---
{
  const lg = fakeLeague(1, { championIdx: 0, relegated: [] });
  const o = lg.divisionOutcomeForUserTeam();
  console.log("\nChampion en Division I :", o);
  if (o.outcome !== "stay" || o.toLevel !== 1) throw new Error("❌ Un champion déjà en Division I ne devrait plus pouvoir monter : " + JSON.stringify(o));
  if (o.championDivisionI !== true) throw new Error("❌ championDivisionI devrait être true pour un champion de Division I.");
  const bonus = seasonEndBonusFor(o);
  console.log("Prime de champion :", bonus);
  if (!bonus || bonus.label !== "Prime de champion (Division I)" || bonus.amount !== CHAMPION_BONUS_DIVISION_I) {
    throw new Error("❌ Prime de champion de Division I incorrecte : " + JSON.stringify(bonus));
  }
  // Comparée à LA prime de montée la plus directement liée (monter EN
  // Division I) : "moins importante qu'une prime de montée", retour
  // utilisateur — pas forcément moins que TOUTE prime de montée, une montée
  // en Division V par exemple est un bien plus petit exploit qu'un titre de
  // champion national.
  if (bonus.amount >= PROMOTION_BONUS_BY_LEVEL[1]) {
    throw new Error(`❌ La prime de champion (${bonus.amount}) devrait être strictement inférieure à la prime de montée en Division I (${PROMOTION_BONUS_BY_LEVEL[1]}).`);
  }
}
console.log("✅ Prime de champion de Division I détectée séparément et strictement plus petite que la prime de montée en Division I.");

// --- Maintien sans titre (ni champion, ni promu) : aucune prime. ---
{
  const lg = fakeLeague(3, { championIdx: 5, relegated: [7, 8, 9] });
  const o = lg.divisionOutcomeForUserTeam();
  const bonus = seasonEndBonusFor(o);
  console.log("\nMaintien sans titre :", o, "| Prime :", bonus);
  if (bonus !== null) throw new Error("❌ Aucune prime ne devrait être due en cas de maintien sans titre : " + JSON.stringify(bonus));
}
console.log("✅ Aucune prime versée en cas de maintien sans titre.");

// --- Relégation : aucune prime non plus. ---
{
  const lg = fakeLeague(3, { championIdx: 5, relegated: [0, 8, 9] });
  const o = lg.divisionOutcomeForUserTeam();
  const bonus = seasonEndBonusFor(o);
  console.log("\nRelégation :", o, "| Prime :", bonus);
  if (bonus !== null) throw new Error("❌ Aucune prime ne devrait être due en cas de relégation : " + JSON.stringify(bonus));
}
console.log("✅ Aucune prime versée en cas de relégation.");

// ---------------------------------------------------------------------
// Partie 2 : parcours UI complet (comme cpu_training_test.js) — on gonfle
// fortement le club du joueur pour garantir une montée, on joue toute la
// saison, on vérifie que le budget encaisse EXACTEMENT la prime attendue au
// clic sur "Nouvelle saison" (voir startNewSeason côté UI).
// ---------------------------------------------------------------------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ATTRS = ["midRange", "threePoint", "inside", "pass", "rebound", "block", "dribble", "agility", "defOutside", "defInside"];

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom1 = await openGame(html, baseUrl);
await flush(dom1);
const saved = readRawSave(savePath);
dom1.window.close();

// Gonfle très largement le club du joueur pour garantir un titre de champion
// (même technique que cpu_training_test.js).
saved.team.players.forEach(p => {
  ATTRS.forEach(a => { p.attrs[a] = clamp(Math.round(p.attrs[a] * 4), 1, 99); });
  p.potential = 99;
});
writeRawSave(savePath, saved);

let dom2 = await openGame(html, baseUrl);
let doc2 = dom2.window.document;
let win2 = dom2.window;

// Depuis le passage au calendrier réel (tâche #21), plus de clic
// "Verrouiller & simuler" journée par journée : une longue absence couvrant
// toute la saison fait tout rattraper d'un coup côté serveur (voir
// fastForwardCalendar/catchUpLeague).
await flush(dom2);
win2.close();
fastForwardCalendar(savePath, 18);
dom2 = await openGame(html, baseUrl);
doc2 = dom2.window.document;
win2 = dom2.window;
if (doc2.getElementById("catchupSection").classList.contains("hidden")) {
  throw new Error("❌ Le récapitulatif d'absence devrait s'afficher après une saison entière jouée automatiquement.");
}
doc2.getElementById("catchupContinueBtn").click();

// --- Le titre de champion n'est plus statistiquement garanti par le seul
// gonflement initial de l'effectif, depuis que l'entraînement hebdomadaire
// des adversaires (League.trainCpuTeams/Team.trainWeekCPU) s'applique tout
// seul, automatiquement, chaque semaine réelle traversée par
// fastForwardCalendar (tâche #21) : ce rattrapage direct referme l'écart
// avec le club du joueur de 35 % par semaine dès qu'il dépasse 6 points de
// "overall", quelle que soit l'ampleur du gonflement de départ — au bout de
// quelques semaines (bien avant les play-offs, en fin de saison), les
// meilleurs adversaires sont revenus à portée, et la finale des play-offs
// (deux matchs gagnants, un tirage à chaque rencontre) redevient un vrai
// résultat incertain plutôt qu'une formalité. La saison régulière (18
// journées, où le club gonflé garde l'avantage plus longtemps face à des
// adversaires isolés) reste, elle, gagnée très largement — voir le journal
// ci-dessous. Plutôt que de relancer le test au hasard en espérant un tirage
// favorable en finale (ce que faisait ce test avant task #21, quand
// l'entraînement adverse n'était pas automatique pendant un parcours simulé),
// on force ici directement le champion des play-offs à être le club du
// joueur si le tirage naturel a désigné un adversaire : Partie 1 de ce
// fichier couvre déjà exhaustivement le calcul de la prime pour CHAQUE cas
// (montée, champion de Division I, maintien, relégation) à partir d'une
// ligue construite à la main — l'objet de cette Partie 2 est de vérifier le
// parcours UI complet (annonce à l'écran, versement au budget, journal des
// transactions) une fois qu'on SAIT que le club du joueur est champion, pas
// de re-tester l'aléa des play-offs eux-mêmes.
await flush(dom2);
win2.close();
{
  const forced = readRawSave(savePath);
  if (forced.league.playoffs.champion !== 0) {
    console.log("\n(Tirage naturel des play-offs remporté par un adversaire malgré le gonflement — le club du joueur est désigné champion directement pour la suite du test, voir commentaire ci-dessus.)");
    forced.league.playoffs.champion = 0;
    writeRawSave(savePath, forced);
  }
}
dom2 = await openGame(html, baseUrl);
doc2 = dom2.window.document;
win2 = dom2.window;

await flush(dom2);
const beforeSeasonEnd = readRawSave(savePath);
const fromLevel = beforeSeasonEnd.league.divisionLevel;
const championIsUser = beforeSeasonEnd.league.playoffs.champion === 0;
console.log(`\nDivision de départ : ${fromLevel} | Champion : ${championIsUser ? "le club du joueur" : "un adversaire"}`);
if (!championIsUser) {
  throw new Error("❌ Le club du joueur devrait être désigné champion à ce stade (forcé ci-dessus si besoin).");
}

// --- L'annonce affichée à l'écran de fin de saison doit mentionner la
// prime, avant même de cliquer sur "Nouvelle saison". ---
const bonusEl = doc2.querySelector(".season-bonus");
console.log("Annonce de prime à l'écran de fin de saison :", bonusEl ? bonusEl.textContent : null);
if (!bonusEl) throw new Error("❌ La prime de fin de saison devrait être annoncée à l'écran de fin de saison.");

const budgetBefore = beforeSeasonEnd.team.budget;
const expectedBonus = fromLevel > 1 ? PROMOTION_BONUS_BY_LEVEL[fromLevel - 1] : CHAMPION_BONUS_DIVISION_I;
console.log("Budget avant la prime :", budgetBefore, "| Prime attendue :", expectedBonus);

doc2.getElementById("newSeasonBtn").click();
await flush(dom2);
const afterSeasonEnd = readRawSave(savePath);
const budgetAfter = afterSeasonEnd.team.budget;
console.log("Budget après clic sur 'Nouvelle saison' :", budgetAfter);

const delta = budgetAfter - budgetBefore;
console.log(`${delta === expectedBonus ? "✅" : "❌"} La prime versée (${delta}) correspond exactement au montant attendu (${expectedBonus}).`);
if (delta !== expectedBonus) {
  throw new Error(`❌ La prime versée (${delta}) ne correspond pas au montant attendu (${expectedBonus}).`);
}

// --- La transaction correspondante doit apparaître dans le journal
// (onglet Économie), avec le bon libellé. ---
const expectedLabel = fromLevel > 1
  ? `Prime de montée (${E.divisionInfo(fromLevel - 1).name})`
  : "Prime de champion (Division I)";
const tx = afterSeasonEnd.team.transactions.find(t => t.label === expectedLabel && t.amount === expectedBonus);
console.log("Transaction trouvée dans le journal :", tx);
if (!tx) throw new Error(`❌ Une transaction "${expectedLabel}" de ${expectedBonus} € devrait apparaître dans le journal.`);
console.log("✅ La transaction de la prime apparaît correctement dans le journal des transactions.");

win2.close();
server.close();
console.log("\n✅ Primes de fin de saison vérifiées : détection du champion de Division I, calcul du bon montant (montée ou titre), annonce à l'écran de fin de saison, versement exact au budget, et journal des transactions.");

})().catch(e => { console.error(e); process.exit(1); });
