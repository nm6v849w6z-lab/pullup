"use strict";
// Ligues privées (Premium) — voir server/privateLeague.js.
// Vérifie : garde Premium, création/adhésion/lancement, calendrier du
// vendredi 21h30, simulation sur copies (aucun effet sur les équipes
// réelles), avantage du terrain, classement, masquage du code.
const assert = require("assert");
const Engine = require("../engine.js");
const Calendar = require("./calendar.js");
const PL = require("./privateLeague.js");

function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

// Mercredi 2026-09-30 09:00 Paris.
const T0 = Calendar.parisEpochForLocalTime(2026, 9, 30, 9);
const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
const league = Engine.generateMultiManagerLeague(names, names.length, T0, Calendar.dailyAnchoredCalendarConfig());
const humans = league.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
check(humans.length === 6, "6 clubs humains générés");

// 1. Garde Premium.
let r = PL.createPrivateLeague(Engine, league.teams[humans[0]], humans[0], league, { name: "Coupe des Potes", size: 6, venue: "home" }, T0);
check(!r.ok && /Premium/.test(r.error), "création refusée sans Premium");
humans.forEach(i => { league.teams[i].isPaying = true; });

// 2. Création + validations.
r = PL.createPrivateLeague(Engine, league.teams[humans[0]], humans[0], league, { name: " ", size: 6, venue: "home" }, T0);
check(!r.ok, "nom vide refusé");
r = PL.createPrivateLeague(Engine, league.teams[humans[0]], humans[0], league, { name: "Coupe des Potes", size: 7, venue: "home" }, T0);
check(!r.ok, "taille 7 refusée");
r = PL.createPrivateLeague(Engine, league.teams[humans[0]], humans[0], league, { name: "Coupe des Potes", size: 6, venue: "home" }, T0);
check(r.ok, "création acceptée");
const lp = league.privateLeagues[0];
check(lp.status === "open" && lp.code.length === 6 && lp.teamIndices.length === 1, "ligue ouverte avec un code de 6 caractères");
r = PL.createPrivateLeague(Engine, league.teams[humans[0]], humans[0], league, { name: "Autre", size: 6, venue: "home" }, T0);
check(!r.ok && /déjà/.test(r.error), "un club ne peut pas être dans deux ligues actives");

// 3. Adhésion.
r = PL.joinPrivateLeague(Engine, league.teams[humans[1]], humans[1], league, { code: "ZZZZZZ" }, T0);
check(!r.ok, "code inconnu refusé");
for (let k = 1; k <= 3; k++) {
  r = PL.joinPrivateLeague(Engine, league.teams[humans[k]], humans[k], league, { code: lp.code.toLowerCase() }, T0);
  check(r.ok && !r.started, `club ${k + 1} rejoint (code insensible à la casse)`);
}
r = PL.joinPrivateLeague(Engine, league.teams[humans[1]], humans[1], league, { code: lp.code }, T0);
check(!r.ok, "double adhésion refusée");

// 4. Lancement anticipé par le créateur (4 clubs) → 6 journées (aller-retour
//    à 4), première le vendredi 2 octobre 2026 à 21h30 Paris.
r = PL.startPrivateLeague(Engine, league.teams[humans[1]], humans[1], league, { id: lp.id }, T0);
check(!r.ok, "seul le créateur peut lancer");
r = PL.startPrivateLeague(Engine, league.teams[humans[0]], humans[0], league, { id: lp.id }, T0);
check(r.ok && lp.status === "running", "lancement par le créateur");
check(lp.rounds.length === 6 && lp.rounds.every(rd => rd.matches.length === 2), "6 journées de 2 matchs");
const friday = Calendar.parisEpochForLocalTime(2026, 10, 2, 21, 30);
check(lp.rounds[0].dueAt === friday, "J1 le vendredi 2 octobre à 21h30 (Paris)");
check(lp.rounds[1].dueAt === Calendar.parisEpochForLocalTime(2026, 10, 9, 21, 30), "J2 une semaine plus tard");
// Changement d'heure (25 octobre 2026) : J4 = vendredi 23 oct., J5 = 30 oct. toujours 21h30.
check(Calendar.parisLocalDateParts(lp.rounds[4].dueAt).hour === 21 && Calendar.parisLocalDateParts(lp.rounds[4].dueAt).minute === 30, "21h30 conservé après le changement d'heure");

// 5. Rien ne se joue avant l'heure.
let played = PL.catchUpPrivateLeagues(Engine, league, friday - 1000);
check(played.length === 0 && lp.rounds[0].matches.every(m => !m.played), "rien avant le coup d'envoi");

// 6. Simulation sur copies : instantané des équipes réelles avant/après.
const snapshotBefore = league.teams.map(t => JSON.stringify(Engine.serializeTeam(t)));
const feedCounts = league.teams.map(t => t.feed.entries.length);
played = PL.catchUpPrivateLeagues(Engine, league, friday + 60 * 1000);
check(played.length === 1 && played[0].round === 0, "J1 jouée à l'heure");
lp.rounds[0].matches.forEach(m => {
  check(m.played && Number.isFinite(m.scoreHome) && Number.isFinite(m.scoreAway) && m.scoreHome !== m.scoreAway, `match ${m.home}-${m.away} a un score (${m.scoreHome}-${m.scoreAway})`);
  check(!m.forfeit && Array.isArray(m.boxScoreHome) && m.boxScoreHome.length >= 5 && m.quarterScores.home.length >= 4, "feuille de match et quarts-temps stockés");
});
const feedBumped = lp.rounds[0].matches.every(m => league.teams[m.home].feed.entries.length === feedCounts[m.home] + 1 && league.teams[m.away].feed.entries.length === feedCounts[m.away] + 1);
check(feedBumped, "une entrée de fil d'actu par club membre");
// Le fil d'actu est le SEUL changement autorisé : on le neutralise pour comparer.
const snapshotAfter = league.teams.map(t => { const d = Engine.serializeTeam(t); return JSON.stringify(d); });
league.teams.forEach((t, i) => {
  const a = JSON.parse(snapshotBefore[i]); const b = JSON.parse(snapshotAfter[i]);
  delete a.feed; delete b.feed;
  assert.deepStrictEqual(b, a, `l'équipe ${t.name} ne doit pas changer`);
});
check(true, "aucune équipe réelle modifiée (forme, fatigue, blessures, entraînement, budget, matchLog, alchimie...)");
played = PL.catchUpPrivateLeagues(Engine, league, friday + 60 * 1000);
check(played.length === 0, "pas de double simulation");

// 7. Classement.
const table = PL.privateLeagueStandings(lp);
check(table.length === 4 && table[0].rank === 1 && table.every(rw => rw.played === 1) && table[0].pts === 2, "classement : 4 lignes, une journée jouée, leader à 2 pts");

// 8. Avantage du terrain : sur beaucoup de matchs entre deux copies de la
//    même équipe, le receveur gagne nettement plus d'une fois sur deux ; sur
//    terrain neutre, on reste autour de 50 %.
function homeWinRate(homeAdvantage, n) {
  let wins = 0;
  const base = league.teams[humans[0]];
  for (let i = 0; i < n; i++) {
    const h = Engine.teamFromSave(Engine.serializeTeam(base));
    const a = Engine.teamFromSave(Engine.serializeTeam(base));
    const res = new Engine.MatchEngine(h, a, { homeAdvantage }).simulate(T0);
    if (res.finalScore.A > res.finalScore.B) wins++;
  }
  return wins / n;
}
const withAdv = homeWinRate(true, 80);
const neutral = homeWinRate(false, 80);
console.log(`   (indicatif) taux de victoire du receveur : avec avantage ${(withAdv * 100).toFixed(0)} %, neutre ${(neutral * 100).toFixed(0)} %`);
// Vérification déterministe : le facteur posé sur chaque joueur.
{
  const base = league.teams[humans[0]];
  const h = Engine.teamFromSave(Engine.serializeTeam(base)), a = Engine.teamFromSave(Engine.serializeTeam(base));
  new Engine.MatchEngine(h, a, { homeAdvantage: true }).simulate(T0);
  check(h.players.every(p => p.matchVenueFactor === 1.02) && a.players.every(p => Math.abs(p.matchVenueFactor - 0.98) < 1e-9), "avantage du terrain : x1,02 pour le receveur, x0,98 pour le visiteur");
  const h2 = Engine.teamFromSave(Engine.serializeTeam(base)), a2 = Engine.teamFromSave(Engine.serializeTeam(base));
  new Engine.MatchEngine(h2, a2).simulate(T0);
  check(h2.players.every(p => p.matchVenueFactor === 1) && a2.players.every(p => p.matchVenueFactor === 1), "sans option : aucun avantage (championnat/Coupe inchangés)");
  const p = h2.players[0];
  const before = p.eff("midRange");
  p.matchVenueFactor = 1.02;
  check(Math.abs(p.eff("midRange") - before * 1.02) < 1e-6 || p.eff("midRange") === 130, "Player.eff applique le facteur de terrain");
}

// 9. Fin de ligue + purge.
lp.rounds.forEach(rd => PL.catchUpPrivateLeagues(Engine, league, rd.dueAt + 1000));
check(lp.status === "finished" && typeof lp.finishedAt === "number", "ligue terminée une fois toutes les journées jouées");
check(PL.activePrivateLeagueFor(league, humans[0]) === null, "le club redevient libre");
PL.catchUpPrivateLeagues(Engine, league, lp.finishedAt + PL.PRIVATE_LEAGUE_FINISHED_RETENTION_MS + 1);
check(league.privateLeagues.length === 0, "ligue purgée après la période de rétention");

// 10. Adhésion auto-lance quand complète + masquage du code hors membres.
r = PL.createPrivateLeague(Engine, league.teams[humans[0]], humans[0], league, { name: "Duo", size: 6, venue: "neutral" }, T0);
const lp2 = league.privateLeagues[0];
for (let k = 1; k <= 5; k++) r = PL.joinPrivateLeague(Engine, league.teams[humans[k]], humans[k], league, { code: lp2.code }, T0);
check(r.ok && r.started && lp2.status === "running" && lp2.rounds.length === 10, "6e adhésion → lancement automatique, 10 journées");
const cpuIdx = league.teams.findIndex(t => !t.isHuman);
const view = PL.sanitizePrivateLeaguesForViewer(league.privateLeagues, cpuIdx);
check(view[0].code === null && PL.sanitizePrivateLeaguesForViewer(league.privateLeagues, humans[2])[0].code === lp2.code, "code masqué hors membres, visible pour un membre");

// 11. Aller-retour de sérialisation de la ligue.
const rebuilt = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(league))));
check(Array.isArray(rebuilt.privateLeagues) && rebuilt.privateLeagues[0].id === lp2.id, "privateLeagues survit à serializeLeague/leagueFromSave");
const legacy = Engine.leagueFromSave(JSON.parse(JSON.stringify({ ...Engine.serializeLeague(league), privateLeagues: undefined })));
check(Array.isArray(legacy.privateLeagues) && legacy.privateLeagues.length === 0, "ancienne sauvegarde sans le champ → []");

console.log("\n✅ private_league_test.js : tout est vert");
