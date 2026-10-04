// Succès de fidélité des joueurs (retour utilisateur 2026-10-04 : « enlève
// Fidèle au poste et Monument du club, mets plutôt des succès en lien avec
// le fait de conserver un joueur plusieurs saisons »).
const assert = require("assert");
const E = require("./engine.js");
const ok = m => console.log("✅ " + m);

const keys = E.MANAGER_ACHIEVEMENTS.map(a => a.key);
assert.ok(!keys.includes("seasons3") && !keys.includes("seasons10"), "anciens succès retirés");
assert.ok(["keep3", "keep5", "keep10", "core5"].every(k => keys.includes(k)));
ok("« Fidèle au poste » et « Monument du club » remplacés par 4 succès de fidélité");

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

const got = E.evaluateManagerAchievements(lg, 0, [], Date.now());
assert.ok(got.includes("keep3") && got.includes("core5"), JSON.stringify(got));
assert.ok(!got.includes("keep5") && !got.includes("keep10"), "pas encore 5 ou 10 saisons");
ok("fin de 3e saison : « Fidélité » et « Noyau dur » débloqués, pas « Pilier du vestiaire »");

// Fin de 5e saison, mais tout l'effectif renouvelé il y a 2 saisons : rien de plus.
const lg2 = E.generateLeague(E.generateTeam("Nomades", 1), 1, Date.now());
const t2 = lg2.teams[0];
t2.isHuman = true;
t2.seasonHistory = [{}, {}, {}, {}];
t2.players.forEach(p => { p.clubSinceSeason = 4; });
const got2 = E.evaluateManagerAchievements(lg2, 0, [], Date.now());
assert.ok(!got2.some(k => ["keep3", "keep5", "keep10", "core5"].includes(k)), JSON.stringify(got2));
t2.players[0].clubSinceSeason = 1;
const got3 = E.evaluateManagerAchievements(lg2, 0, [], Date.now());
assert.ok(got3.includes("keep3") && got3.includes("keep5") && !got3.includes("core5"), JSON.stringify(got3));
ok("ancienneté comptée par joueur (club renouvelé : rien ; un joueur depuis 5 saisons : Pilier du vestiaire)");

const saved = E.serializeTeam(team);
saved.achievements = [...saved.achievements, { key: "seasons3", label: "Fidèle au poste", seasonNumber: 3 }];
const reloaded = E.teamFromSave(JSON.parse(JSON.stringify(saved)));
assert.ok(!reloaded.achievements.some(a => a.key === "seasons3") && reloaded.achievements.some(a => a.key === "keep3"));
ok("anciens succès effacés des sauvegardes au chargement");
console.log("🏁 player_tenure_achievements_test.js : tout est vert");
