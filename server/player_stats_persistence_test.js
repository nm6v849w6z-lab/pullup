// Vérifie le retour utilisateur (2026-09) : "le match 3 n'affiche aucune
// stats hormis les minutes [...] le problème a l'air d'être généralisé à
// d'autres équipes et autres joueurs" (page joueur, tableau "Match par
// match", voir renderPlayerDetail côté navigateur).
//
// Cause : Player.stats (pts/reb/ast/...) n'était JAMAIS écrit dans la
// sauvegarde (serializePlayerRecord), contrairement à Player.secondsPlayed
// qui l'est déjà (voir son propre commentaire, pour une raison différente :
// la reprise de l'entraînement après rechargement). Un redémarrage serveur
// (ou simplement une nouvelle requête qui relit le fichier de sauvegarde,
// voir store.loadOrCreate) survenant entre le coup d'envoi d'un match EN
// DIRECT (qui remplit p.stats/p.secondsPlayed via MatchEngine.simulate, voir
// computeLiveMatch dans server/liveMatch.js) et sa finalisation (qui lit CES
// MÊMES champs, voir Engine.recordMatchStatsForTeam) faisait donc perdre
// p.stats au rechargement (reparti de emptyStats() via le constructeur
// Player) sans toucher p.secondsPlayed (déjà restauré) : d'où une entrée de
// matchLog avec des minutes correctes mais toutes les autres stats à zéro.
//
// Reproduit exactement ce scénario avec les fonctions serveur réelles (sans
// navigateur, cette panne est purement côté serveur) : coup d'envoi d'un
// match en direct (ensureLiveMatchStarted, comme un vrai kickoff), puis un
// "redémarrage serveur" simulé en faisant repasser les DEUX équipes
// impliquées par un aller-retour serializeTeam -> teamFromSave (exactement
// ce qu'un vrai redémarrage fait via le fichier de sauvegarde), puis
// finalizeRound (comme le ferait un tick ultérieur, après le retour du
// serveur), et vérifie que le journal de match du joueur conserve bien ses
// vraies statistiques, pas seulement ses minutes.
const Engine = require("../engine.js");
const { scheduledTimeForLeagueRound } = require("./calendar.js");
const { ensureLiveMatchStarted, finalizeRound, liveMatchKey } = require("./liveMatch.js");
const { generateStartingRoster, generateLeague, serializeTeam, teamFromSave } = Engine;

const KICKOFF_BASE = Date.UTC(2026, 8, 9, 19, 0, 0);

(async () => {

const userTeam = generateStartingRoster("Stats Persistence Test");
const league = generateLeague(userTeam, 1, KICKOFF_BASE);
const kickoffAt = scheduledTimeForLeagueRound(league, 0);
const m0 = league.matchesForRound(0).find(m => m.home === 0 || m.away === 0);
const myKey = liveMatchKey(0, m0.home, m0.away);

// ---------------------------------------------------------------------
// Coup d'envoi réel : MatchEngine.simulate() (voir computeLiveMatch) remplit
// p.stats/p.secondsPlayed EN MÉMOIRE pour les deux équipes.
// ---------------------------------------------------------------------
const startedKeys = ensureLiveMatchStarted(Engine, league, kickoffAt, scheduledTimeForLeagueRound);
if (!startedKeys.includes(myKey)) throw new Error("❌ (setup) Le coup d'envoi du match du joueur aurait dû démarrer la diffusion.");

const homeTeam = league.teams[m0.home];
const awayTeam = league.teams[m0.away];

// Capture les vraies stats EN MÉMOIRE (juste après le coup d'envoi), pour
// les comparer plus bas à ce qui survit au "redémarrage".
function snapshotRealStats(team) {
  const byId = {};
  team.players.forEach(p => {
    if (p.secondsPlayed > 0) {
      byId[p.id] = { secondsPlayed: p.secondsPlayed, pts: p.stats.pts || 0, reb: p.stats.reb || 0, ast: p.stats.ast || 0 };
    }
  });
  return byId;
}
const homeRealStats = snapshotRealStats(homeTeam);
const awayRealStats = snapshotRealStats(awayTeam);
const playersWhoPlayed = Object.keys(homeRealStats).length + Object.keys(awayRealStats).length;
if (playersWhoPlayed < 5) throw new Error("❌ (setup) Trop peu de joueurs ayant du temps de jeu pour que ce test soit significatif.");
const anyRealPointsScored = [...Object.values(homeRealStats), ...Object.values(awayRealStats)].some(s => s.pts > 0);
if (!anyRealPointsScored) throw new Error("❌ (setup) Aucun point marqué dans ce match simulé, relancer le test (aléatoire), pas assez significatif tel quel.");

// ---------------------------------------------------------------------
// "Redémarrage serveur" simulé : les DEUX équipes impliquées repassent par
// un aller-retour sauvegarde/rechargement (exactement ce qu'un vrai
// redémarrage ferait via le fichier de sauvegarde, voir store.js). league
// elle-même (donc league.liveMatches, où le score déjà calculé est stocké
// séparément dans finalScore/boxScoreA/boxScoreB) N'EST PAS touchée ici,
// seuls les objets Team/Player (où vivent p.stats/p.secondsPlayed) le sont,
// pour isoler précisément la fuite décrite ci-dessus.
// ---------------------------------------------------------------------
league.teams[m0.home] = teamFromSave(serializeTeam(homeTeam));
league.teams[m0.away] = teamFromSave(serializeTeam(awayTeam));

// ---------------------------------------------------------------------
// Finalisation (comme un tick ultérieur, une fois le serveur revenu) : lit
// p.stats/p.secondsPlayed des équipes (désormais RECHARGÉES) pour écrire le
// journal de match (Engine.recordMatchStatsForTeam).
// ---------------------------------------------------------------------
finalizeRound(Engine, league, 0);

function checkMatchLogSurvived(team, realStats, label) {
  Object.entries(realStats).forEach(([id, real]) => {
    const player = team.players.find(p => String(p.id) === id);
    if (!player) throw new Error(`❌ (setup) Joueur ${id} introuvable après rechargement (${label}).`);
    const entry = (player.matchLog || []).find(m => m.round === 0 && m.competition === "championship");
    if (!entry) throw new Error(`❌ BUG NON CORRIGÉ : aucune entrée de journal pour ${player.name} (${label}) après le "redémarrage serveur".`);
    const expectedMin = Math.max(1, Math.round(real.secondsPlayed / 60));
    console.log(`${label} : ${player.name} : min=${entry.min} (attendu ${expectedMin}) | pts=${entry.pts} (réel ${real.pts}) | reb=${entry.reb} (réel ${real.reb}) | ast=${entry.ast} (réel ${real.ast})`);
    if (entry.min !== expectedMin) {
      throw new Error(`❌ (setup) Les minutes de ${player.name} ne survivent pas correctement au rechargement (obtenu ${entry.min}, attendu ${expectedMin}).`);
    }
    if (entry.pts !== real.pts || entry.reb !== real.reb || entry.ast !== real.ast) {
      throw new Error(
        `❌ BUG NON CORRIGÉ : ${player.name} (${label}) a perdu ses statistiques au "redémarrage serveur" ` +
        `(minutes correctes : ${entry.min}, mais pts=${entry.pts}/reb=${entry.reb}/ast=${entry.ast} au lieu de pts=${real.pts}/reb=${real.reb}/ast=${real.ast}).`
      );
    }
  });
}
checkMatchLogSurvived(league.teams[m0.home], homeRealStats, "domicile");
checkMatchLogSurvived(league.teams[m0.away], awayRealStats, "extérieur");
console.log(`\n✅ Les statistiques de ${playersWhoPlayed} joueurs (pas seulement les minutes) survivent bien à un "redémarrage serveur" survenu entre le coup d'envoi et la finalisation du match.`);

console.log("\n🏁 Tous les tests player_stats_persistence_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
