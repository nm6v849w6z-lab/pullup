// Vérifie League.prototype.nextUserMatch pour la ligue MULTI-MANAGER (retour
// utilisateur, 2026-09 : "probleme équipe qui joue contre elle même ?
// normalement l'adversaire est gotham knight", capture d'écran du tableau de
// bord d'un manager affichant "BC Dia" à la fois comme nom de club ET comme
// prochain adversaire) : cette méthode ne cherchait, sans condition, QUE le
// match de teams[0] (comportement historique solo, où le club du joueur est
// TOUJOURS à cet index), jamais celui du manager qui consulte réellement
// l'écran (myTeamIndex côté navigateur, voir enterNextMatchOrShowSeasonEnd).
// Pour tout manager d'une ligue partagée dont l'équipe n'est PAS à l'index 0,
// le "prochain match" affiché était donc celui de teams[0] : round correct
// par coïncidence, mais adversaire et domicile/extérieur erronés, jusqu'à
// littéralement afficher le manager comme son propre adversaire quand son
// VRAI adversaire du tour était justement teams[0] (voir la capture
// d'écran : c'est exactement ce scénario qui est reconstruit ci-dessous).
const Engine = require("../engine.js");
const { generateMultiManagerLeague } = Engine;

const T0 = Date.UTC(2026, 8, 15, 7, 0, 0); // 15 septembre 2026, arbitraire

// 4 managers humains (index 0 à 3) + 6 CPU pour compléter à 10, calendrier
// classique (peu importe ici, nextUserMatch ne dépend pas du calendrier).
const league = generateMultiManagerLeague(["Lyon", "Marseille", "Gotham Knights", "BC Dia"], 1, T0);

const r0 = league.round; // journée de départ (0, ligue toute neuve)
const round0 = league.schedule[r0];

// ---------------------------------------------------------------------
// Partie 1 : reproduction exacte du bug rapporté, le manager dont
// l'adversaire RÉEL de ce tour est justement teams[0] ne doit PAS se voir
// lui-même comme adversaire (ce qu'aurait renvoyé l'ancienne implémentation,
// qui ignorait silencieusement tout argument et retournait toujours le
// match de teams[0]).
// ---------------------------------------------------------------------
const matchOfTeam0 = round0.find(m => m.home === 0 || m.away === 0);
if (!matchOfTeam0) throw new Error("❌ (setup) teams[0] devrait avoir un match ce tour-ci (calendrier sans exempt, nombre pair d'équipes).");
const opponentOfTeam0 = matchOfTeam0.home === 0 ? matchOfTeam0.away : matchOfTeam0.home;
console.log(`Journée ${r0} : teams[0] (${league.teams[0].name}) affronte teams[${opponentOfTeam0}] (${league.teams[opponentOfTeam0].name}).`);

const resultForOpponent = league.nextUserMatch(opponentOfTeam0);
console.log(`nextUserMatch(${opponentOfTeam0}) ->`, resultForOpponent);
if (!resultForOpponent) throw new Error(`❌ nextUserMatch(${opponentOfTeam0}) ne devrait pas être null : ce manager a un match ce tour-ci.`);
if (resultForOpponent.opponent === opponentOfTeam0) {
  throw new Error(`❌ BUG NON CORRIGÉ : nextUserMatch(${opponentOfTeam0}) affiche ce manager comme son propre adversaire (opponent=${resultForOpponent.opponent}).`);
}
if (resultForOpponent.opponent !== 0) {
  throw new Error(`❌ nextUserMatch(${opponentOfTeam0}) devrait renvoyer teams[0] comme adversaire (son vrai adversaire ce tour-ci), obtenu opponent=${resultForOpponent.opponent}.`);
}
if (resultForOpponent.round !== r0) throw new Error(`❌ Round inattendu : ${resultForOpponent.round}, attendu ${r0}.`);
// isHome doit refléter le VRAI côté de ce manager dans le match (home===teamIdx), pas celui de teams[0].
const expectedIsHomeForOpponent = matchOfTeam0.home === opponentOfTeam0;
if (resultForOpponent.isHome !== expectedIsHomeForOpponent) {
  throw new Error(`❌ isHome incorrect pour teams[${opponentOfTeam0}] : obtenu ${resultForOpponent.isHome}, attendu ${expectedIsHomeForOpponent}.`);
}
console.log(`✅ nextUserMatch(${opponentOfTeam0}) affiche correctement teams[0] comme adversaire, jamais lui-même.`);

// ---------------------------------------------------------------------
// Partie 2 : un TROISIÈME manager (ni teams[0], ni son adversaire direct)
// doit lui aussi voir SON PROPRE match, différent de celui de teams[0], pas
// une donnée recopiée de teams[0].
// ---------------------------------------------------------------------
const thirdIdx = [1, 2, 3].find(i => i !== opponentOfTeam0) ?? 1;
const matchOfThird = round0.find(m => m.home === thirdIdx || m.away === thirdIdx);
if (!matchOfThird) throw new Error(`❌ (setup) teams[${thirdIdx}] devrait avoir un match ce tour-ci.`);
const expectedOpponentOfThird = matchOfThird.home === thirdIdx ? matchOfThird.away : matchOfThird.home;
const resultForThird = league.nextUserMatch(thirdIdx);
console.log(`\nnextUserMatch(${thirdIdx}) ->`, resultForThird, `(attendu opponent=${expectedOpponentOfThird})`);
if (!resultForThird || resultForThird.opponent !== expectedOpponentOfThird) {
  throw new Error(`❌ nextUserMatch(${thirdIdx}) devrait renvoyer son propre adversaire réel (${expectedOpponentOfThird}), obtenu ${resultForThird && resultForThird.opponent}.`);
}
if (resultForThird.opponent === opponentOfTeam0 && expectedOpponentOfThird !== opponentOfTeam0) {
  throw new Error(`❌ BUG NON CORRIGÉ : teams[${thirdIdx}] se voit attribuer l'adversaire de teams[0] au lieu du sien.`);
}
console.log(`✅ nextUserMatch(${thirdIdx}) affiche bien SON PROPRE adversaire (teams[${expectedOpponentOfThird}]), pas celui de teams[0].`);

// ---------------------------------------------------------------------
// Partie 3 : compatibilité ascendante, sans argument, se comporte
// exactement comme avant (équipe 0, comportement historique solo).
// ---------------------------------------------------------------------
const resultNoArg = league.nextUserMatch();
const resultExplicitZero = league.nextUserMatch(0);
console.log("\nnextUserMatch() sans argument :", resultNoArg);
if (JSON.stringify(resultNoArg) !== JSON.stringify(resultExplicitZero)) {
  throw new Error("❌ nextUserMatch() sans argument devrait se comporter exactement comme nextUserMatch(0) (compatibilité ascendante, solo historique).");
}
if (resultNoArg.opponent !== opponentOfTeam0) {
  throw new Error(`❌ nextUserMatch() sans argument devrait toujours porter sur teams[0], obtenu adversaire ${resultNoArg.opponent} au lieu de ${opponentOfTeam0}.`);
}
console.log("✅ nextUserMatch() sans argument reste identique au comportement historique (équipe 0).");

console.log("\n🏁 Tous les tests next_user_match_multi_manager_test.js sont passés.");
