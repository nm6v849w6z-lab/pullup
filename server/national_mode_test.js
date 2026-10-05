// Sélections nationales — phase E (server/nationalCoach.js) : notifications
// propres au mode Sélectionneur (jamais dans le fil du club), alertes
// (blessure, performance, convocations à finaliser), exemptés jamais
// convoqués, bilan de mandat (gardé à la fin), expérience aux élections.
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
lg.teams.forEach(t => { if (t.isHuman) t.lastSeenAt = start + 200 * DAY; });
const all = lg.teams.flatMap(t => t.players);
all.forEach((p, i) => { p.nationality = COUNTRIES[i % COUNTRIES.length]; p.age = 25; p.condition = 100; p.conditionUpdatedAt = start; p.injuryUntil = null; });
const leagues = new Map([["fr-1", lg]]);
const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }] };
const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
N.step(st, leagues, world, start + 3600e3);
const lyon = N.managerOf("fr-1", lg, 0, world);
const comp = M.compOf(st, 2, "A");
// Sélection qui joue la fenêtre 1 : le sélectionneur est Lyon.
const TID = comp.matches.find(m => m.w === 1).home;
assert.ok(C.adminAppoint(st, TID, lyon, 2, start + 3600e3, leagues).ok);
const md = () => N.activeMandate(st, TID);
const clubFeedTitles = () => lg.teams[0].feed.entries.map(e => e.title);

// 1) Alertes au recalcul du vivier : blessure d'un joueur suivi.
N.step(st, leagues, world, start + 2 * 3600e3);
const pool = C.buildPool(st, st.teams[TID], leagues, world, start + 2 * 3600e3);
const tracked = pool.players[0];
C.setListMember(st, lyon, { teamId: TID, list: "watchlist", player: { p: tracked.p, n: tracked.n } }, start, { pool });
const pl = all.find(p => p.id === tracked.p && p.name === tracked.n);
pl.injuryUntil = start + 20 * DAY; pl.injuryType = "Entorse";
st.poolAt[TID] = 0;
N.step(st, leagues, world, start + 3 * 3600e3);
assert.ok(md().feed.some(e => e.kind === "injury" && e.title.includes(pl.name)), "blessure d'un joueur suivi signalée");
pl.injuryUntil = null;
// Rappel : convocations à finaliser (moins de 24 h avant le gel).
const w1 = C.gatheringsOf(st, st.teams[TID], 2, start).find(g => g.kind === "window" && g.n === 1);
N.step(st, leagues, world, w1.freezeAt - 3600e3);
assert.ok(md().feed.some(e => e.kind === "convocation" && /finalisées/.test(e.title)), "rappel : convocations à finaliser");
// 2) Résultat du match : dans le mode Sélectionneur, pas dans le fil du club.
all.forEach(p => { p.condition = 100; p.conditionUpdatedAt = w1.startAt - DAY; });
N.step(st, leagues, world, w1.freezeAt + 1000);
N.step(st, leagues, world, w1.startAt + 60e3);
assert.ok(md().feed.some(e => e.kind === "result" && e.matchId), "résultat dans le fil du sélectionneur");
assert.ok(!clubFeedTitles().some(t => /victoire|défaite/.test(t) && t.includes(N.teamLabel(TID))), "jamais dans le fil du club");
const view = C.coachView(st, lyon, TID, w1.startAt + 60e3, { pool, season: 2, calendarStartAt: start });
assert.ok(view.feed.length >= 3 && view.unread >= 3 && view.stats.length >= 5 && view.report.played === 1, "vue : notifications, non lues, statistiques, bilan en cours");
assert.ok(C.markSeen(st, lyon, { teamId: TID }, w1.startAt).ok && C.coachView(st, lyon, TID, w1.startAt, { pool, season: 2, calendarStartAt: start }).unread === 0, "notifications marquées lues");
ok("mode Sélectionneur : notifications propres (blessure, convocations à finaliser, résultat), jamais dans le fil du club, non lues");

// 3) Exemptée d'une fenêtre (groupe de 3) : pas de rassemblement ni de convocation.
const byeTeam = comp.groups.find(g => g.teams.length === 3).teams.find(t => !comp.matches.some(m => m.w === 1 && (m.home === t || m.away === t)));
const gBye = C.gatheringsOf(st, st.teams[byeTeam], 2, start).find(g => g.kind === "window" && g.n === 1);
assert.ok(gBye.bye && !C.convocationOf(st, byeTeam, gBye.gid), "exemptée : jamais convoquée");
ok("sélection exemptée d'une fenêtre : pas de rassemblement, aucun club prévenu");

// 4) Fin de mandat : bilan gardé, expérience affichée à l'élection suivante.
const m = md();
N.resign(st, lyon, { teamId: TID }, w1.startAt + 2 * 3600e3, leagues);
assert.ok(m.report && m.report.played === 1 && m.report.playersUsed >= 5 && m.report.newInternationals >= 5 && m.report.seasonsDetail.length === 2, "bilan complet à la fin du mandat");
assert.strictEqual(m.report.seasonsDetail[0].comp, "continental");
const exp = N.experienceOf(st, lyon.key);
assert.ok(exp.length === 1 && exp[0].played === 1, "expérience du candidat (mandats passés, bilan)");
const el = N.openElection(st, st.teams[TID], w1.startAt + 3 * 3600e3, 2);
N.runForElection(st, lyon, { teamId: TID, title: "Retour aux affaires", project: "Reprendre le travail commencé avec ce groupe." }, w1.startAt + 3 * 3600e3);
assert.ok(N.publicElection(st, el, null, false).candidates[0].experience.length === 1, "expérience visible des électeurs");
ok("fin de mandat : bilan (matchs, victoires, joueurs utilisés, nouveaux internationaux, compétitions) conservé, montré aux élections");
console.log("\n🏁 national_mode_test.js : mode Sélectionneur (notifications, alertes, bilan, expérience) conforme.");
