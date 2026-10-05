// Succès de fidélité des joueurs (retour utilisateur 2026-10-04 : « enlève
// Fidèle au poste et Monument du club, mets plutôt des succès en lien avec
// le fait de conserver un joueur plusieurs saisons »).
const assert = require("assert");
const E = require("./engine.js");
const ok = m => console.log("✅ " + m);

// Système de succès refondu (2026-10-05) : la fidélité des joueurs passe par
// « Noyau dur » (HARD_CORE : 1 / 3 / 5 joueurs gardés au moins 3 saisons).
const ids = E.Achievements.ACHIEVEMENTS.map(a => a.id);
assert.ok(!["seasons3", "seasons10", "keep3", "keep5", "keep10", "core5"].some(k => ids.includes(k)), "anciens succès retirés");
assert.ok(ids.includes("HARD_CORE"));
ok("anciens succès de fidélité remplacés par « Noyau dur » (3 paliers)");

const lg = E.generateLeague(E.generateTeam("Fidèles", 1), 1, Date.now());
const team = lg.teams[0];
team.isHuman = true;
// Fin de la 3e saison du club : deux saisons archivées + la saison en cours.
team.seasonHistory = [{ wins: 10 }, { wins: 12 }];
// Une recrue arrivée cette saison.
const seller = lg.teams[1];
const recruitId = seller.players[0].id;
E.transferPlayerBetweenTeams(seller, team, recruitId, 1000, Date.now());
const recruit = team.players.find(p => p.id === recruitId);
assert.strictEqual(recruit.clubSinceSeason, 3, "transfert : saison d'arrivée notée");
const back = E.playerFromSave(JSON.parse(JSON.stringify(E.serializePlayerRecord(recruit))));
assert.strictEqual(back.clubSinceSeason, 3, "saison d'arrivée sauvegardée");
ok("arrivée au club notée au transfert et sauvegardée");

lg.seasonId = "s3";
E.achSeasonEnd(lg, 0, [], Date.now());
const veterans = team.players.filter(p => p.id !== recruitId).length;
assert.strictEqual(team.achStats.keepMax, veterans, "joueurs présents depuis 3 saisons (la recrue ne compte pas)");
assert.strictEqual(team.achTiers.HARD_CORE, 3, "5 joueurs ou plus : Noyau dur Or");
ok("fin de 3e saison : effectif d'origine compté, recrue exclue → Noyau dur");

// Fin de 5e saison, mais tout l'effectif renouvelé il y a 2 saisons : rien.
const lg2 = E.generateLeague(E.generateTeam("Nomades", 1), 1, Date.now());
const t2 = lg2.teams[0];
t2.isHuman = true;
t2.seasonHistory = [{}, {}, {}, {}];
t2.players.forEach(p => { p.clubSinceSeason = 4; });
lg2.seasonId = "a";
E.achSeasonEnd(lg2, 0, [], Date.now());
assert.ok(!t2.achTiers.HARD_CORE, JSON.stringify(t2.achStats));
// Saison suivante : les autres sont arrivés il y a 2 saisons, un seul est là depuis le début.
t2.seasonHistory.unshift({});
t2.players.forEach(p => { p.clubSinceSeason = 5; });
t2.players[0].clubSinceSeason = 1;
lg2.seasonId = "b";
E.achSeasonEnd(lg2, 0, [], Date.now());
assert.strictEqual(t2.achTiers.HARD_CORE, 1, "un seul joueur depuis 3 saisons ou plus : Bronze");
ok("ancienneté comptée par joueur (club renouvelé : rien ; un joueur fidèle : Bronze)");

const saved = E.serializeTeam(team);
saved.achievements = [{ key: "seasons3", label: "Fidèle au poste", seasonNumber: 3 }];
const reloaded = E.teamFromSave(JSON.parse(JSON.stringify(saved)));
assert.ok(!reloaded.achievements && reloaded.achTiers.HARD_CORE === 3);
ok("anciens succès ignorés au chargement, nouveaux paliers conservés");
console.log("🏁 player_tenure_achievements_test.js : tout est vert");
