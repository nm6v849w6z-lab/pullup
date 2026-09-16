// Vérifie le mécanisme de forfait (retour utilisateur : "enleve le garde
// fou de vente, on peut vendre tout son effectif si on le souhaite. si on
// n'a plus suffisamment de joueurs sur la feuille de match, c'est forfait
// 20 à 0") : aucun plancher d'effectif pour la vente (déjà couvert par
// deficit_test.js/transfer_market_test.js — voir Team.sellPlayer/
// League.listPlayerForSale), et une équipe qui ne peut plus aligner un cinq
// de départ perd 0-20 (ou gagne 20-0 si c'est l'adversaire) plutôt que de
// bloquer la suite de la saison — voir FORFEIT_SCORE/simulateOrForfeit côté
// moteur, et forceForfeit/rosterCannotFieldLineup côté UI.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, writeRawSave, fastForwardCalendar } = require("./test_helpers.js");
const E = require("./engine.js");
const {
  generateTeam, generateLeague, POSITIONS, FORFEIT_SCORE, simulateOrForfeit,
} = E;
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

// Retire TOUS les joueurs d'un poste donné (le poste devient introuvable
// dans l'effectif) puis réassigne la feuille de match — reproduit
// exactement la situation d'un club qui a vendu tous ses joueurs à un
// poste sur le marché des transferts.
function stripPosition(team, pos) {
  team.players = team.players.filter(p => p.position !== pos);
  team.autoAssignLineup();
}

// ---------------------------------------------------------------------
// Partie 1 : simulateOrForfeit — logique moteur pure.
// ---------------------------------------------------------------------
{
  const home = generateTeam("Domicile Test", 1.0);
  const away = generateTeam("Extérieur Test", 1.0);
  console.log("Deux effectifs complets — hasValidLineup :", home.hasValidLineup(), away.hasValidLineup());
  const result = simulateOrForfeit(home, away);
  console.log("Match normal (deux effectifs complets) — forfeit:", result.forfeit, "| score:", result.scoreHome, "-", result.scoreAway);
  if (result.forfeit !== null) throw new Error("❌ Deux effectifs complets devraient produire un match normal (forfeit: null), pas un forfait.");
  if (!(result.scoreHome >= 0 && result.scoreAway >= 0)) throw new Error("❌ Un match normal devrait produire un score valide.");
  console.log("✅ Deux effectifs complets jouent un match normal (moteur complet), pas de forfait.");
}
{
  const home = generateTeam("Domicile Vidé", 1.0);
  const away = generateTeam("Extérieur Test", 1.0);
  stripPosition(home, "Pivot"); // plus aucun Pivot -> feuille de match incomplète
  console.log("\nDomicile sans Pivot — hasValidLineup:", home.hasValidLineup(), "| postes manquants:", home.missingStarterPositions());
  if (home.hasValidLineup()) throw new Error("❌ Une équipe sans aucun joueur à un poste ne devrait plus pouvoir constituer une feuille de match valide.");
  const result = simulateOrForfeit(home, away);
  console.log("Résultat — forfeit:", result.forfeit, "| score:", result.scoreHome, "-", result.scoreAway);
  if (result.forfeit !== "home") throw new Error("❌ L'équipe à domicile en défaut devrait perdre par forfait (forfeit: 'home').");
  if (result.scoreHome !== 0 || result.scoreAway !== FORFEIT_SCORE) throw new Error(`❌ Le score de forfait devrait être 0-${FORFEIT_SCORE}, obtenu ${result.scoreHome}-${result.scoreAway}.`);
  console.log(`✅ L'équipe à domicile, effectif insuffisant, perd par forfait 0-${FORFEIT_SCORE}.`);
}
{
  const home = generateTeam("Domicile Test", 1.0);
  const away = generateTeam("Extérieur Vidé", 1.0);
  stripPosition(away, "Meneur");
  const result = simulateOrForfeit(home, away);
  console.log("\nExtérieur en défaut — forfeit:", result.forfeit, "| score:", result.scoreHome, "-", result.scoreAway);
  if (result.forfeit !== "away") throw new Error("❌ L'équipe à l'extérieur en défaut devrait perdre par forfait (forfeit: 'away').");
  if (result.scoreHome !== FORFEIT_SCORE || result.scoreAway !== 0) throw new Error(`❌ Le score de forfait devrait être ${FORFEIT_SCORE}-0, obtenu ${result.scoreHome}-${result.scoreAway}.`);
  console.log(`✅ L'équipe à l'extérieur, effectif insuffisant, perd par forfait ${FORFEIT_SCORE}-0 (l'équipe à domicile gagne).`);
}
{
  // Cas limite : les DEUX équipes sont en défaut à la fois.
  const home = generateTeam("Domicile Vidé", 1.0);
  const away = generateTeam("Extérieur Vidé", 1.0);
  stripPosition(home, "Ailier fort");
  stripPosition(away, "Ailier shooteur");
  const result = simulateOrForfeit(home, away);
  console.log("\nLes deux équipes en défaut — forfeit:", result.forfeit, "| score:", result.scoreHome, "-", result.scoreAway);
  if (result.forfeit !== "both") throw new Error("❌ Si les deux équipes sont en défaut, le forfait devrait être mutuel (forfeit: 'both').");
  if (result.scoreHome !== 0 || result.scoreAway !== 0) throw new Error("❌ Un forfait mutuel devrait produire un score 0-0 (aucune des deux ne peut matériellement jouer).");
  console.log("✅ Forfait mutuel (0-0) si les deux équipes sont en défaut à la fois.");
}

// ---------------------------------------------------------------------
// Partie 2 : intégration dans le calendrier — un match CPU vs CPU dont l'une
// des deux équipes est en défaut se résout en forfait, pas en crash, et le
// résultat enregistré (recordResult) reflète bien le score de forfait.
// ---------------------------------------------------------------------
{
  const user = generateTeam("User", 1.0);
  const lg = generateLeague(user, 1);
  // Trouve un match CPU vs CPU de la journée 0 et vide un poste de l'équipe
  // à domicile de ce match précis.
  const round0 = lg.matchesForRound(0);
  const cpuMatch = round0.find(m => m.home !== 0 && m.away !== 0);
  if (!cpuMatch) throw new Error("❌ Aucun match CPU vs CPU trouvé à la journée 0 (inattendu avec 10 équipes).");
  stripPosition(lg.teams[cpuMatch.home], "Pivot");
  lg.simulateCpuMatchesForRound(0);
  const recorded = lg.results.find(r => r.round === 0 && r.home === cpuMatch.home && r.away === cpuMatch.away);
  console.log(`\nMatch CPU vs CPU, domicile en défaut — résultat enregistré : ${recorded.scoreHome}-${recorded.scoreAway}`);
  if (!recorded) throw new Error("❌ Le résultat du match CPU vs CPU en défaut devrait être enregistré (pas planté, pas ignoré).");
  if (recorded.scoreHome !== 0 || recorded.scoreAway !== FORFEIT_SCORE) throw new Error(`❌ Le match CPU vs CPU aurait dû se résoudre en forfait 0-${FORFEIT_SCORE}, obtenu ${recorded.scoreHome}-${recorded.scoreAway}.`);
  console.log("✅ simulateCpuMatchesForRound applique bien le forfait pour un match CPU vs CPU dont une équipe est en défaut.");
}

// ---------------------------------------------------------------------
// Partie 3 : parcours UI — le club du joueur vide un poste de son effectif
// (comme après avoir tout vendu sur le marché). Depuis le passage au
// calendrier réel (tâche #21, préparation à l'avance au lieu d'actions
// immédiates), il n'y a plus de bouton "Déclarer forfait" : l'écran de
// préparation se contente d'avertir que le match se soldera AUTOMATIQUEMENT
// par un forfait à l'heure prévue (voir updateLockAvailability), et c'est le
// serveur qui applique ce forfait tout seul au coup d'envoi (voir
// POSITIONS_MISSING/computeLiveMatch dans server/liveMatch.js) — sans écran
// de match en direct (rien à diffuser), exactement comme avant, mais sans
// action du joueur.
// ---------------------------------------------------------------------
(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom1 = await openGame(html, baseUrl);
await flush(dom1);
const saved = readRawSave(savePath);
dom1.window.close();

// Vide le poste "Pivot" du club du joueur dans la sauvegarde.
saved.team.players = saved.team.players.filter(p => p.position !== "Pivot");
saved.team.lineup.starters["Pivot"] = null;
writeRawSave(savePath, saved);

const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
function clickTab(key) { [...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click(); }

clickTab("ordres");
const warnText = doc2.getElementById("lockWarning").textContent;
console.log("\nÉcran de préparation, effectif sans Pivot — message d'avertissement :", warnText);
if (!warnText.includes("forfait") && !warnText.toLowerCase().includes("insuffisant")) throw new Error("❌ Le message d'avertissement devrait expliquer que l'effectif est insuffisant / annoncer un forfait automatique.");
console.log("✅ L'écran de préparation prévient que ce match se soldera automatiquement par un forfait.");

const roundBefore = readRawSave(savePath).league.round;
await flush(dom2);
dom2.window.close();

// --- Coup d'envoi passé (et sa fenêtre de diffusion entièrement écoulée) :
// le serveur a résolu le forfait tout seul, sans aucune action du joueur.
fastForwardCalendar(savePath, 1);
const dom3 = await openGame(html, baseUrl);
const doc3 = dom3.window.document;

const catchupVisible = !doc3.getElementById("catchupSection").classList.contains("hidden");
if (!catchupVisible) throw new Error("❌ Le récapitulatif d'absence devrait s'afficher une fois le forfait résolu.");
const catchupText = doc3.getElementById("catchupContent").textContent.replace(/\s+/g, " ").trim();
console.log("\nRécapitulatif après résolution automatique :", catchupText.slice(0, 200));
if (!catchupText.includes("forfait")) throw new Error("❌ Le récapitulatif devrait mentionner qu'il s'agit d'un forfait.");
if (!catchupText.includes(`0-${FORFEIT_SCORE}`) && !catchupText.includes(`${FORFEIT_SCORE}-0`)) {
  throw new Error(`❌ Le score affiché devrait être un forfait 0-${FORFEIT_SCORE} (dans un sens ou l'autre selon domicile/extérieur).`);
}
console.log(`✅ Le forfait se résout automatiquement au coup d'envoi (sans écran de match en direct), avec un score de ${FORFEIT_SCORE}-0 correctement annoncé dans le récapitulatif.`);

const savedAfterForfeit = readRawSave(savePath);
console.log("Journée de championnat après forfait — round:", savedAfterForfeit.league.round, "(avant:", roundBefore, ")");
if (savedAfterForfeit.league.round !== roundBefore + 1) throw new Error("❌ La journée de championnat devrait avoir avancé après la résolution automatique du forfait.");
console.log("✅ Le résultat du forfait est enregistré dans le calendrier de la ligue dès sa résolution automatique.");

doc3.getElementById("catchupContinueBtn").click();
const prepVisible = !doc3.getElementById("prepSection").classList.contains("hidden");
console.log("\nAprès clic sur 'Continuer' — écran de préparation du match suivant visible :", prepVisible);
if (!prepVisible) throw new Error("❌ Après 'Continuer', l'écran de préparation du match suivant devrait redevenir visible (sauf fin de saison).");
console.log("✅ Le clic sur 'Continuer' fait bien avancer vers le match suivant (écran de préparation normal réaffiché).");

await flush(dom3);
dom3.window.close();
server.close();
console.log("\n✅ Mécanisme de forfait vérifié : simulateOrForfeit (match normal, forfait domicile/extérieur/mutuel), intégration dans le calendrier (CPU vs CPU), et parcours UI complet (avertissement préventif, résolution automatique 0-20 au coup d'envoi sans écran de match en direct, avancée de la saison au clic sur 'Continuer').");

})().catch(e => { console.error(e); process.exit(1); });
