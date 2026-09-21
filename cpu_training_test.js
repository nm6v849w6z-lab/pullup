// Vérifie que les équipes adverses (CPU) ne restent pas distancées derrière
// le club du joueur — signalé par l'utilisateur après une première tentative
// de correctif : "je continue de mettre de grosses fessées / on est censé
// être du même niveau à peu près" (matchs à 109-49, 128-56 malgré une
// première version qui faisait progresser les CPU au même rythme que le
// joueur, mais sans jamais refermer un écart déjà creusé).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, writeRawSave, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
// ATTRS repris directement d'engine.js (13 caractéristiques désormais, voir
// le grand commentaire au-dessus d'ATTRS dans engine.js) plutôt que dupliqué
// en dur ici : la simulation de l'écart de niveau (INFLATE ci-dessous) et sa
// mesure (avgOverall) doivent porter sur EXACTEMENT le même ensemble de
// caractéristiques que Player.overall()/Team.trainWeekCPU en interne, sinon
// ce test mesurerait un écart "à 10 caractéristiques" alors que le rattrapage
// CPU référence désormais un overallGap à 13 caractéristiques (dilué par
// Mental/Endurance/Lancer franc, non liés à un poste donc non spécifiquement
// boostés par l'inflation ci-dessous) — écart de mesure qui ferait
// artificiellement échouer ce test sans aucune régression réelle du
// rattrapage.
const { ATTRS } = require("./engine.js");

function avgOverall(teamData) {
  return teamData.players.reduce((s, p) => {
    const a = p.attrs;
    return s + ATTRS.reduce((sum, k) => sum + a[k], 0) / ATTRS.length;
  }, 0) / teamData.players.length;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

(async () => {

// --- Phase 1 : partie neuve normale, pour récupérer une sauvegarde valide. ---
const { server, savePath, baseUrl } = await startTestServer();
const dom1 = await openGame(html, baseUrl);
await flush(dom1);
const saved = readRawSave(savePath);
dom1.window.close();

// --- Reproduit un écart déjà creusé (comme une partie en cours après
// plusieurs semaines d'entraînement à sens unique côté joueur) : on gonfle
// directement les caractéristiques du club du joueur dans la sauvegarde,
// sans toucher aux adversaires générés normalement. Facteur relevé (2.4 →
// 3.0) après le passage à generateStartingRoster pour le tout premier
// effectif (10-50 sur toutes les caractéristiques, donc une base de départ
// nettement plus faible qu'avant) : 2.4x ne suffisait plus à creuser un
// écart net face à des adversaires de Division I inchangés. ---
const INFLATE = 3.0;
saved.team.players.forEach(p => {
  ATTRS.forEach(a => { p.attrs[a] = clamp(Math.round(p.attrs[a] * INFLATE), 1, 99); });
  p.potential = clamp(Math.round(p.potential * INFLATE), 1, 99);
});

const userAvg = avgOverall(saved.team);
const cpuAvgBefore = saved.league.teams.slice(1).map(avgOverall);
console.log("Niveau moyen Lyon (gonflé, écart reproduit) :", userAvg.toFixed(1));
console.log("Niveau moyen des 9 adversaires avant rattrapage :", cpuAvgBefore.map(v => v.toFixed(1)).join(", "));
const gapBefore = cpuAvgBefore.reduce((s, v) => s + (userAvg - v), 0) / cpuAvgBefore.length;
if (gapBefore < 10) throw new Error("❌ Le scénario de test devrait reproduire un écart important (" + gapBefore.toFixed(1) + ").");

writeRawSave(savePath, saved);

// --- Phase 2 : recharge avec cet écart déjà présent, comme une partie en
// cours après mise à jour du jeu. ---
let dom2 = await openGame(html, baseUrl);
let doc2 = dom2.window.document;
let win2 = dom2.window;

// --- Plusieurs semaines d'entraînement : le rattrapage direct (voir
// Team.trainWeekCPU) doit refermer la majeure partie de l'écart, pas
// seulement freiner sa croissance. Depuis le passage au calendrier réel
// (tâche #21), l'entraînement hebdomadaire (joueur ET rattrapage CPU) est
// appliqué tout seul par le serveur en fin de semaine réelle — plus besoin
// de cliquer "Verrouiller & simuler" puis "Valider la semaine" : on avance
// le calendrier de 5 semaines réelles (10 journées) d'un coup (voir
// fastForwardCalendar/catchUpLeague).
await flush(dom2);
win2.close();
fastForwardCalendar(savePath, 10);
dom2 = await openGame(html, baseUrl);
doc2 = dom2.window.document;
win2 = dom2.window;
if (!doc2.getElementById("catchupSection").classList.contains("hidden")) {
  doc2.getElementById("catchupContinueBtn").click();
}

await flush(dom2);
const after = readRawSave(savePath);
const userAvgAfter = avgOverall(after.team);
const cpuAvgAfter = after.league.teams.slice(1).map(avgOverall);
console.log("Niveau moyen des 9 adversaires après 5 semaines de rattrapage :", cpuAvgAfter.map(v => v.toFixed(1)).join(", "));
const gapAfter = cpuAvgAfter.reduce((s, v) => s + (userAvgAfter - v), 0) / cpuAvgAfter.length;
console.log("Écart moyen avant :", gapBefore.toFixed(1), " → après 5 semaines :", gapAfter.toFixed(1));

if (gapAfter >= gapBefore * 0.5) {
  throw new Error("❌ Le rattrapage des équipes adverses est trop lent : écart réduit de seulement " +
    Math.round((1 - gapAfter / gapBefore) * 100) + "% en 5 semaines (attendu au moins 50%).");
}
console.log(`✅ L'écart de niveau se referme nettement (${Math.round((1 - gapAfter / gapBefore) * 100)}% en 5 semaines) au lieu de rester figé ou de se combler trop lentement.`);

// --- Aucune équipe adverse n'a été affaiblie par le rattrapage (jamais à
// la baisse). ---
const anyWeakened = cpuAvgAfter.some((v, i) => v < cpuAvgBefore[i] - 0.5);
if (anyWeakened) throw new Error("❌ Le rattrapage ne devrait jamais affaiblir une équipe adverse.");
console.log("✅ Aucune équipe adverse n'a été affaiblie par le rattrapage.");

win2.close();
server.close();
console.log("\n✅ Rattrapage des équipes adverses vérifié : un écart de niveau déjà creusé se referme concrètement en quelques semaines, pas seulement freiné.");

})().catch(e => { console.error(e); process.exit(1); });
