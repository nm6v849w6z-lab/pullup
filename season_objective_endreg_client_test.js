// Vérifie le SIGNAL DE FIN DE SAISON RÉGULIÈRE de l'objectif du conseil
// d'administration côté NAVIGATEUR (retour utilisateur, 2026-09, voir
// season_objective_endreg_test.js pour la couverture purement moteur de la
// même fonctionnalité, et season_objective_midseason_client_test.js pour le
// premier signal intermédiaire déjà couvert côté navigateur) : ce second
// signal doit apparaître dans le récapitulatif "Pendant votre absence…" et
// dans le journal de l'onglet Humeur des supporters exactement à la
// dernière journée de la saison régulière, AVANT que le barrage de
// relégation et les play-offs ne soient joués.
//
// Retour utilisateur (2026-09, ultérieur) : "il ne faut pas qu'un signal et
// pas deux [...] la fin de la saison régulière correspond à la fin de la
// saison pour ces équipes là" : selon le rang final (imprévisible ici,
// saison simulée organiquement, voir Team.seasonObjectiveVerdictSettled)
// c'est soit ce simple aperçu ("Fin de saison régulière : ...") pour une
// équipe encore en lice play-offs/barrage, soit directement le VRAI verdict
// ("Objectif de la saison ... ") pour une équipe de milieu de tableau ou
// reléguée directement, jamais les deux. Voir
// season_objective_locked_at_endreg_test.js pour la couverture moteur
// dédiée de cette distinction.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
let dom = await openGame(html, baseUrl);
let doc = dom.window.document;
let win = dom.window;

const saved0 = readRawSave(savePath);
const objective = saved0.team.seasonObjective;
console.log("Objectif de saison :", objective);
if (!objective) throw new Error("❌ Une nouvelle carrière devrait déjà avoir un objectif de saison assigné.");

// La saison régulière d'un calendrier à 10 équipes compte 18 journées
// (0..17). On rattrape EXACTEMENT ces 18 journées, sans aller plus loin
// (donc AVANT le barrage de relégation et les play-offs, voir
// fastForwardCalendar : ne fait avancer QUE le calendrier de championnat,
// jamais play-offs/barrage, résolus séparément côté serveur une fois la
// saison régulière détectée terminée).
await flush(dom);
win.close();
fastForwardCalendar(savePath, 18);
dom = await openGame(html, baseUrl);
doc = dom.window.document;
win = dom.window;

// --- Déjà réellement appliqué à ce stade (comme le signal de mi-saison),
// et le barrage/les play-offs ne sont PAS encore résolus : ce signal/verdict
// reflète donc bien le classement de saison régulière, jamais un résultat de
// barrage ou de play-offs. ---
const savedEndReg = readRawSave(savePath);
if (savedEndReg.league.playoffs && savedEndReg.league.playoffs.champion != null) {
  throw new Error("❌ (setup) les play-offs ne devraient pas encore être terminés à ce stade (seulement la saison régulière a été rattrapée).");
}
const locked = !!savedEndReg.team.seasonObjectiveVerdictSettled;
const expectedPrefix = locked ? "Objectif de la saison" : "Fin de saison régulière";
console.log("Sort déjà scellé (milieu de tableau/relégation directe) :", locked, "-> libellé attendu :", expectedPrefix);

// --- Le récapitulatif "Pendant votre absence…" doit annoncer soit le VRAI
// verdict (sort déjà scellé), soit le simple aperçu provisoire (play-offs
// ou barrage encore à jouer), selon le rang final de l'équipe, jamais les
// deux (distinct du signal de mi-saison, déjà annoncé une journée plus tôt
// dans ce même récapitulatif puisqu'on rattrape tout d'un coup ici). ---
const catchupHtml = doc.getElementById("catchupContent").innerHTML;
if (!catchupHtml.includes(expectedPrefix)) {
  throw new Error(`❌ Le récapitulatif de rattrapage devrait mentionner "${expectedPrefix} : ...", obtenu :\n${catchupHtml}`);
}
if (!catchupHtml.includes("Mi-saison")) {
  throw new Error("❌ Le récapitulatif devrait aussi contenir le signal de mi-saison, rattrapé dans le même lot de journées.");
}
console.log(`✅ Le récapitulatif "Pendant votre absence…" annonce ${locked ? "le VRAI verdict (sort déjà scellé)" : "l'aperçu provisoire de fin de saison régulière"} (et toujours le signal de mi-saison, plus tôt dans la même saison).`);

const history = savedEndReg.team.moraleHistory || [];
const signalEntry = history.find(e => e.label && e.label.startsWith(expectedPrefix));
if (!signalEntry) throw new Error(`❌ Un événement d'humeur "${expectedPrefix} : ..." devrait avoir été journalisé (Team.moraleHistory).`);
console.log("Événement journalisé :", signalEntry.label, "delta =", signalEntry.delta);

doc.getElementById("catchupContinueBtn").click();
await flush(dom);

// --- Visible aussi dans le journal de l'onglet Humeur des supporters. ---
doc.querySelector('[data-tab="humeur"]').click();
const historyHtml = doc.getElementById("moraleHistoryContent").innerHTML;
if (!historyHtml.includes(expectedPrefix)) {
  throw new Error(`❌ L'onglet Humeur des supporters devrait afficher l'événement dans son journal, obtenu :\n${historyHtml}`);
}
console.log("✅ L'événement figure dans le journal de l'onglet Humeur des supporters.");

await flush(dom);
win.close();
server.close();
console.log(`\n✅ ${locked ? "Verdict" : "Signal"} de fin de saison régulière de l'objectif de saison du conseil d'administration vérifié côté navigateur : annoncé dans le récapitulatif de rattrapage aux côtés du signal de mi-saison, réellement appliqué à l'humeur des supporters avant le barrage et les play-offs, visible dans le journal de l'onglet dédié.`);

})().catch(e => { console.error(e); process.exit(1); });
