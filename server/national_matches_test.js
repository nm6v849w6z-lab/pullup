// Sélections nationales — phase C (server/nationalMatches.js) : fenêtres
// internationales des semaines 2, 4 et 6 (dimanche 20h), groupes par
// continent, matchs joués avec le moteur des clubs sur les vrais joueurs
// (fatigue normale, jamais dans les stats de club), classement,
// qualification (Europe 8 sur 10, Amérique et Asie : tous).
const assert = require("assert");
const store = require("./store.js");
const N = require("./nationalTeams.js");
const C = require("./nationalCoach.js");
const M = require("./nationalMatches.js");
const Engine = require("../engine.js");
const ok = m => console.log("✅ " + m);
const DAY = 864e5;

const start = Date.UTC(2027, 0, 5, 19);
const COUNTRIES = Object.keys(Engine.WORLD_COUNTRIES);
const lg = store.createMultiManagerCareer(["Lyon NT", "Paris NT"], start).league;
lg.seasonNumber = 2; lg.calendarStartAt = start; lg.country = "fr";
lg.teams.forEach(t => { if (t.isHuman) t.lastSeenAt = start; });
// 17 pays : 13 joueurs de chaque nationalité au moins (répartis dans les clubs).
const all = lg.teams.flatMap(t => t.players);
all.forEach((p, i) => { p.nationality = COUNTRIES[i % COUNTRIES.length]; p.age = 25; p.injuryUntil = null; p.condition = 100; p.conditionUpdatedAt = start; });
const leagues = new Map([["fr-1", lg]]);
const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }] };
const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
N.step(st, leagues, world, start + 3600e3);

// 1) Groupes : par continent, 4 au plus, A et U21 indépendantes.
const compA = M.compOf(st, 2, "A");
assert.ok(compA && compA.comp === "continental");
const sizes = c => compA.groups.filter(g => g.continent === c).map(g => g.teams.length).sort();
assert.deepStrictEqual(sizes("Europe"), [3, 3, 4]);
assert.deepStrictEqual(sizes("Amérique"), [4]);
assert.deepStrictEqual(sizes("Asie"), [3]);
assert.ok(compA.groups.every(g => g.teams.every(t => t.endsWith("-A"))));
assert.ok(!M.compOf(st, 2, "U21"), "U21 : cycle décalé d'une saison (pas encore de compétition en saison 2)");
const perTeam = id => compA.matches.filter(m => m.home === id || m.away === id).length;
assert.ok(compA.groups.every(g => g.teams.every(t => perTeam(t) === g.teams.length - 1)), "chacun rencontre une fois chaque adversaire du groupe");
const days = [...new Set(compA.matches.map(m => Math.round((m.at - start) / DAY)))].sort((a, b) => a - b);
assert.deepStrictEqual(days, [12, 26, 40], "dimanches des semaines 2, 4 et 6");
assert.ok(compA.matches.every(m => new Date(m.at).getUTCDay() === 0));
ok("tirage : groupes de 4 au plus par continent (Europe 4/3/3, Amérique 4, Asie 3), 3 fenêtres (dimanches semaines 2, 4, 6)");

// 2) Fenêtre 1 : convocations figées puis matchs joués.
const m1 = compA.matches.find(m => m.w === 1);
const TID = m1.home, CC = TID.split("-")[0];
const frConvAt = m1.at - 3 * DAY + 1000;
N.step(st, leagues, world, frConvAt);
const conv = C.convocationOf(st, TID, m1.gid);
const frPlayers = all.filter(p => p.nationality === CC);
assert.ok(conv && conv.frozenAt && conv.players.length === Math.min(15, frPlayers.length), `convocation figée (${conv && conv.players.length} sur ${frPlayers.length} Français)`);
// Convoqués retenus par leur sélection le jour du match : jamais dans un
// amical de leur club ce dimanche-là (retour utilisateur 2026-10-06).
{
  const Friendlies = require("./friendlies.js");
  const convoked = frPlayers.filter(p => conv.players.some(r => r.p === p.id && r.n === p.name));
  const p0 = convoked[0];
  const club = lg.teams.find(t => t.players.includes(p0));
  const sundayAfternoon = m1.at - 4 * 3600e3;
  assert.ok(Engine.isOnNationalDuty(p0, sundayAfternoon) && !Engine.isOnNationalDuty(p0, m1.at - 30 * 3600e3), "retenu le dimanche du match, pas la veille");
  const shell = Friendlies.buildFriendlyTeam(Engine, club, { starters: [p0.id], bench: [] }, sundayAfternoon);
  assert.ok(!shell.players.includes(p0), "amical du dimanche : le convoqué est remplacé");
  const shellSat = Friendlies.buildFriendlyTeam(Engine, club, { starters: [p0.id], bench: [] }, m1.at - 30 * 3600e3);
  assert.ok(shellSat.players.includes(p0), "amical de la veille : il joue");
  const back = Engine.playerFromSave(JSON.parse(JSON.stringify(Engine.serializePlayerRecord(p0))));
  assert.ok(Engine.isOnNationalDuty(back, sundayAfternoon), "période en sélection gardée à la sauvegarde");
  ok("convoqué retenu par sa sélection le jour du match : absent des amicaux de son club ce jour-là");
}
const idsBefore = frPlayers.map(p => p.id);
const logBefore = frPlayers.map(p => p.matchLog.length);
N.step(st, leagues, world, m1.at + 60e3);
assert.ok(compA.matches.filter(m => m.w === 1).every(m => m.status === "played"), "tous les matchs de la fenêtre 1 joués");
assert.strictEqual(compA.matches.filter(m => m.w === 2).some(m => m.status === "played"), false, "fenêtre 2 pas encore");
assert.deepStrictEqual(frPlayers.map(p => p.id), idsBefore, "ids des joueurs remis");
assert.deepStrictEqual(frPlayers.map(p => p.matchLog.length), logBefore, "jamais dans les stats de club");
const played = frPlayers.filter(p => (m1.boxHome.concat(m1.boxAway)).some(r => r.ref && r.ref.p === p.id && r.ref.n === p.name && r.min > 0));
assert.ok(played.length >= Math.min(8, frPlayers.length) && played.every(p => p.condition < 100), "fatigue normale appliquée aux joueurs qui ont joué");
assert.ok(m1.scoreHome + m1.scoreAway > 60 && !m1.forfeit, `score réaliste (${m1.scoreHome}-${m1.scoreAway})`);
const box = m1.boxHome;
assert.ok(box.length <= 12 && box.every(r => r.ref && r.club && r.club.name), "12 joueurs au plus sur la feuille, joueurs et clubs identifiés");
ok("fenêtre : convocation figée 3 jours avant, matchs joués au coup d'envoi (moteur des clubs), fatigue normale, stats de club intactes");

// 2 bis) Direct (2026-10-06) : diffusion du moteur des clubs calée sur le
// coup d'envoi, rangée à part ; score et résultat cachés jusqu'à la fin.
const w1 = compA.matches.filter(m => m.w === 1);
// Durée : 40 min de chrono (1 s de jeu = 1 s), plus les pauses (2 + 10 + 2
// min) et les arrêts — entre ~54 et ~65 min selon le match. L'ancien seuil
// « plus d'une heure » tombait au milieu de cette plage : test instable
// (2026-10-09), aucun lien avec le direct lui-même.
assert.ok(w1.every(m => typeof m.liveUntil === "number" && m.liveUntil > m.at + 40 * 60e3 + 14 * 60e3), "chaque match a un direct (chrono complet et pauses)");
const lives = M.takePendingLive(st);
assert.strictEqual(lives.length, w1.length, "un direct par match, en attente d'enregistrement");
assert.strictEqual(M.takePendingLive(st).length, 0, "vidé à la lecture");
assert.ok(!JSON.stringify(st).includes('"events"') && !Object.keys(st).includes("pendingLive"), "jamais dans le stock national");
const lv = lives.find(x => x.id === m1.id);
assert.ok(lv.entry.competition === "national" && lv.entry.homeIdx === M.LIVE_GUEST_IDX && lv.entry.awayIdx === M.LIVE_GUEST_IDX + 1, "entrée de direct (forme d'un match de club)");
assert.ok(lv.entry.events.length > 100 && lv.entry.events.every(e => typeof e.airAt === "number" && e.airAt >= m1.at), "événements avec heure de diffusion");
assert.strictEqual(lv.entry.kickoffAt + lv.entry.totalDurationMs, m1.liveUntil);
assert.deepStrictEqual(lv.entry.finalScore, { home: m1.scoreHome, away: m1.scoreAway });
const liveIds = new Set(lv.teams.home.players.concat(lv.teams.away.players).map(p => p.id));
assert.ok([...liveIds].every(id => id > 9000000) && lv.entry.boxScoreA.every(r => liveIds.has(r.id)), "sélections du direct : ids provisoires du fil d'événements");
assert.ok(lv.teams.home.players.every(p => !p.matchLog && !p.weeklyHistory) && !lv.teams.home.feed, "sélections épurées");
const view = require("./liveMatch.js").viewLiveMatchForTeam({ liveMatches: { [m1.id]: lv.entry } }, lv.entry.homeIdx);
assert.ok(view && view.opponentIdx === M.LIVE_GUEST_IDX + 1 && view.events.length === lv.entry.events.length, "vue du direct (viewLiveMatchForTeam)");
const during = m1.at + 60e3;
assert.strictEqual(M.resultsOf(st, TID, during).length, 0, "pendant le direct : pas dans les résultats");
const qd = M.qualifView(st, TID, 2, during);
const pmd = qd.matches.find(x => x.id === m1.id);
assert.ok(pmd.status === "live" && pmd.scoreHome == null && pmd.quarterScores == null, "pendant le direct : match « live », sans score");
assert.ok(qd.group.standings.every(r => r.played === 0), "pendant le direct : classement inchangé");
const mdd = M.matchDetail(st, m1.id, during);
assert.ok(mdd.status === "live" && mdd.scoreHome == null && !mdd.boxHome.length && !mdd.tacticsUsed, "pendant le direct : feuille de match cachée");
assert.ok(m1.resultPending, "annonce du résultat en attente");
const after = Math.max(...w1.map(m => m.liveUntil)) + 2000;
N.step(st, leagues, world, after);
assert.ok(w1.every(m => !m.resultPending), "fin du direct : résultat annoncé");
ok("direct : diffusion calée sur le coup d'envoi, rangée à part, score et classement cachés jusqu'à la fin");

// 3) Classement et résultats.
const q = M.qualifView(st, TID, 2, after);
assert.ok(q.group && q.group.standings.length >= 3 && q.matches.length >= 2);
const played1 = q.group.standings.filter(r => r.played === 1);
assert.ok(played1.every(r => r.points === 2 || r.points === 1 || r.points === 0), "victoire 2 points, défaite 1");
assert.ok(M.resultsOf(st, TID, after).length === 1, "résultat dans l'historique");
const tv = N.teamView(st, TID, null, 2, after, start);
assert.ok(tv.qualif && tv.results.length === 1, "page de la sélection : qualifications et résultats");
const md1 = M.matchDetail(st, m1.id, after);
assert.ok(md1.boxHome.length && md1.boxHome[0].oreb !== undefined && md1.tacticsUsed && md1.liveUntil === m1.liveUntil, "feuille de match complète (box score du Mode Club) et direct à revoir");
ok("classement (2 pts victoire, 1 défaite, départages), résultats et feuille de match");

// 4) Fenêtres 2 et 3, qualification.
for (const w of [2, 3]) {
  const at = compA.matches.find(m => m.w === w).at;
  all.forEach(p => { p.condition = 100; p.conditionUpdatedAt = at - DAY; p.injuryUntil = null; });
  N.step(st, leagues, world, at - 3 * DAY + 1000);
  N.step(st, leagues, world, at + 60e3);
}
assert.ok(compA.matches.every(m => m.status === "played"));
const qual = M.qualification(compA);
const eu = Object.entries(qual.status).filter(([id]) => M.continentOf(id.split("-")[0]) === "Europe");
assert.strictEqual(eu.filter(([, s]) => s === "qualified").length, 8, "Europe : 8 qualifiés sur 10");
assert.strictEqual(eu.filter(([, s]) => s === "consolation").length, 2);
assert.ok(["us", "br", "ar", "ca", "cn", "hk", "tw"].every(c => qual.status[`${c}-A`] === "qualified"), "Amérique et Asie : tous qualifiés");
compA.groups.filter(g => g.continent === "Europe").forEach(g => {
  M.standings(compA, g.id).filter(r => r.rank <= 2).forEach(r => assert.strictEqual(qual.status[r.teamId], "qualified", "les 2 premiers de chaque groupe"));
});
ok("qualification continentale : 2 premiers de chaque groupe européen + 2 meilleurs 3es, Amérique et Asie tous qualifiés");

// 5) Désactivable par l'administration.
const st2 = N.emptyStore(); st2.config = { cycleStartSeason: 2, matchesLive: false };
N.step(st2, leagues, world, start + 3600e3);
assert.ok(!M.compOf(st2, 2, "A"), "matchesLive: false → aucune compétition");
ok("matchs internationaux désactivables (config matchesLive)");
console.log("\n🏁 national_matches_test.js : fenêtres internationales, qualifications et fatigue conformes.");
