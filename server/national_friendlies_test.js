// Sélections nationales — matchs amicaux internationaux
// (server/nationalFriendlies.js) : demandes envoyées / reçues, dates
// compatibles (dimanche hors fenêtres, jamais un match de club déplacé),
// domicile / extérieur, accepter / refuser / annuler, intérim qui accepte
// d'office, demande expirée, rassemblement et convocations, match joué
// (fatigue normale, retiré des stats de club), droits (sélectionneur seul).
const assert = require("assert");
const store = require("./store.js");
const N = require("./nationalTeams.js");
const C = require("./nationalCoach.js");
const M = require("./nationalMatches.js");
const F = require("./nationalFriendlies.js");
const ok = m => console.log("✅ " + m);
const DAY = 864e5;

const start = Date.UTC(2027, 0, 5, 19); // mardi 20h, heure de Paris
const fr = store.createMultiManagerCareer(["Lyon NT", "Paris NT", "Nice NT"], start).league;
const es = store.createMultiManagerCareer(["Madrid NT", "Sevilla NT"], start).league;
[fr, es].forEach(lg => { lg.seasonNumber = 2; lg.calendarStartAt = start; lg.teams.forEach(t => { if (t.isHuman) t.lastSeenAt = start + 300 * DAY; }); });
fr.country = "fr"; es.country = "es";
let n = 0;
[fr, es].forEach(lg => lg.teams.forEach(t => t.players.forEach(p => { p.nationality = "es"; p.age = 25; p.injuryUntil = null; p.condition = 100; p.conditionUpdatedAt = start; })));
[fr, es].forEach(lg => lg.teams.forEach(t => t.players.slice(0, 2).forEach(p => { if (n < 30) { p.nationality = "fr"; n++; } })));
const leagues = new Map([["fr-1", fr], ["es-1", es]]);
const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }, { id: "es-1", country: "es", level: 1, group: 0 }] };
const st = N.emptyStore(); st.config = { cycleStartSeason: 2, matchesLive: true };
let now = start + 3600e3;
N.step(st, leagues, world, now);
const lyon = N.managerOf("fr-1", fr, 0, world), nice = N.managerOf("fr-1", fr, 2, world);
const madrid = N.managerOf("es-1", es, 0, world);
assert.ok(C.adminAppoint(st, "fr-A", lyon, 2, now, leagues).ok);
assert.ok(C.adminAppoint(st, "es-A", madrid, 2, now, leagues).ok);
const ctx = { season: 2, calendarStartAt: start };
const viewOf = id => F.viewFor(st, st.teams[id], 2, start, now);
const feed = id => N.activeMandate(st, id).feed || [];

// 1) Dates compatibles : dimanches 20h, hors fenêtres, All-Star et phase finale.
const cand = F.candidateDays(st, 2, start);
const cfg = N.configOf(st);
assert.ok(cand.length >= 5 && cand.every(d => new Date(d.at).getUTCDay() === 0), "un dimanche à chaque fois");
assert.ok(!cand.some(d => d.week === cfg.allStarWeek) && cand.every(d => d.at < N.seasonDayAt(cfg, start, cfg.finalFirstDay) - 6 * DAY), "ni All-Star ni semaine de la phase finale");
const v0 = viewOf("fr-A");
assert.ok(v0.dates.length && v0.dates.every(d => !d.window || C.gatheringsOf(st, st.teams["fr-A"], 2, start).find(g => g.kind === "window" && g.n === d.window).bye), "dimanches des fenêtres exclus (sauf sélection exemptée)");
// Les dimanches sont des jours sans match de club (championnat mardi / samedi, coupe jeudi).
assert.ok(v0.dates.every(d => [0, 2, 4].indexOf(Math.round((d.at - start) / DAY) % 7) < 0), "jamais un jour de championnat ni de coupe");
assert.ok(v0.opponents.some(o => o.id === "es-A" && o.coach) && v0.opponents.some(o => o.id === "it-A" && o.interim) && v0.opponents.every(o => o.id.endsWith("-A")), "adversaires : même catégorie, sélectionneur ou intérim");
ok("dates compatibles proposées (dimanche 20h, hors fenêtres, All-Star, phase finale, matchs de club intacts)");

// 2) Droits : seul le sélectionneur envoie une demande.
const d1 = v0.dates.find(d => !d.busy.includes("es-A"));
assert.strictEqual(F.request(st, nice, { teamId: "fr-A", opponent: "es-A", at: d1.at }, now, ctx).status, 403, "un autre manager : refusé");
assert.ok(!F.request(st, lyon, { teamId: "fr-A", opponent: "es-U21", at: d1.at }, now, ctx).ok, "jamais contre une autre catégorie");
const win1 = C.gatheringsOf(st, st.teams["fr-A"], 2, start).find(g => g.kind === "window" && g.n === 1);
assert.ok(!F.request(st, lyon, { teamId: "fr-A", opponent: "es-A", at: win1.startAt }, now, ctx).ok, "dimanche de fenêtre refusé");
assert.ok(!F.request(st, lyon, { teamId: "fr-A", opponent: "es-A", at: d1.at + 3600e3 }, now, ctx).ok, "heure hors calendrier refusée");
ok("droits : sélectionneur seulement, même catégorie, calendrier respecté");

// 3) Demande envoyée / reçue, acceptation, rassemblement.
const r1 = F.request(st, lyon, { teamId: "fr-A", opponent: "es-A", at: d1.at, venue: "away" }, now, ctx);
assert.ok(r1.ok && r1.friendly.status === "pending" && r1.friendly.home === "es-A" && r1.friendly.away === "fr-A", "demande : à l'extérieur");
assert.ok(!F.request(st, lyon, { teamId: "fr-A", opponent: "es-A", at: v0.dates[v0.dates.length - 1].at }, now, ctx).ok, "une seule demande en attente par adversaire");
assert.strictEqual(viewOf("fr-A").sent[0].state, "sent");
assert.strictEqual(viewOf("es-A").received[0].state, "received");
assert.ok(feed("es-A").some(e => e.kind === "friendly" && /Demande de match amical/.test(e.title)), "sélectionneur adverse prévenu (mode Sélectionneur)");
assert.ok(!viewOf("fr-A").dates.some(d => d.at === d1.at), "date réservée par la demande");
assert.strictEqual(F.respond(st, lyon, { id: r1.friendly.id, accept: true }, now, ctx).status, 403, "seule la sélection invitée répond");
assert.ok(F.respond(st, madrid, { id: r1.friendly.id, accept: true }, now, ctx).ok);
assert.strictEqual(viewOf("fr-A").scheduled[0].state, "scheduled");
assert.ok(feed("fr-A").some(e => /accepte votre match amical/.test(e.title)), "réponse dans le fil du sélectionneur");
const gF = C.gatheringsOf(st, st.teams["fr-A"], 2, start).find(g => g.kind === "friendly");
assert.ok(gF && gF.startAt === d1.at && gF.freezeAt === d1.at - 3 * DAY && !gF.bye, "rassemblement de l'amical (liste figée 3 jours avant)");
ok("demande envoyée, reçue, acceptée ; rassemblement créé ; notifications propres au mode Sélectionneur");

// 4) Intérim : accepte d'office ; annulation ; refus.
const dIt = viewOf("fr-A").dates.find(d => !d.busy.includes("it-A"));
const r2 = F.request(st, lyon, { teamId: "fr-A", opponent: "it-A", at: dIt.at }, now, ctx);
assert.ok(r2.ok && r2.friendly.status === "accepted" && r2.friendly.auto, "sélection sans sélectionneur : acceptée d'office");
assert.strictEqual(F.cancel(st, madrid, { id: r2.friendly.id }, now).status, 403, "annulation : seulement les sélectionneurs concernés");
assert.ok(F.cancel(st, lyon, { id: r2.friendly.id }, now).ok && viewOf("fr-A").closed.some(f => f.id === r2.friendly.id && f.state === "cancelled"), "amical annulé");
const dEs = viewOf("fr-A").dates.find(d => !d.busy.includes("es-A"));
const r3 = F.request(st, madrid, { teamId: "es-A", opponent: "fr-A", at: dEs.at, venue: "home" }, now, ctx);
assert.ok(r3.ok && viewOf("fr-A").received.length === 1);
assert.ok(F.respond(st, lyon, { id: r3.friendly.id, accept: false }, now, ctx).ok && viewOf("es-A").closed.some(f => f.id === r3.friendly.id && f.state === "refused"), "demande refusée");
assert.ok(feed("es-A").some(e => /refuse votre match amical/.test(e.title)));
// Demande sans réponse avant le gel : expirée.
const dExp = viewOf("fr-A").dates.find(d => !d.busy.includes("es-A") && d.at > d1.at);
const r4 = F.request(st, lyon, { teamId: "fr-A", opponent: "es-A", at: dExp.at }, now, ctx);
assert.ok(r4.ok);
ok("intérim : accepté d'office ; annuler, refuser ; états sent / received / scheduled / refused / cancelled");

// 5) Match joué à sa date : convocations figées, vrais joueurs, résultat.
now = d1.at - 3 * DAY + 1000;
N.step(st, leagues, world, now);
const conv = C.convocationOf(st, "fr-A", gF.gid);
assert.ok(conv && conv.frozenAt && conv.players.length === 15, "convocations figées 3 jours avant l'amical");
const someFr = fr.teams.flatMap(t => t.players).find(p => conv.players.some(r => r.p === p.id && r.n === p.name));
assert.ok(someFr && someFr.nationalDuty && someFr.nationalDuty.some(d => d.gid.endsWith(gF.gid)), "joueur convoqué retenu par sa sélection (absent des amicaux de son club ce jour-là)");
const logBefore = someFr.matchLog.length;
now = d1.at + 60e3;
N.step(st, leagues, world, now);
const f1 = st.intlFriendlies.find(f => f.id === r1.friendly.id);
assert.ok(f1.status === "played" && typeof f1.scoreHome === "number" && f1.boxHome.length > 0, "amical joué");
assert.strictEqual(someFr.matchLog.length, logBefore, "jamais dans les stats de club");
assert.ok(M.resultsOf(st, "fr-A").some(r => r.id === f1.id && r.comp === "friendly"), "dans les résultats de la sélection");
assert.ok(M.matchDetail(st, f1.id) && M.matchDetail(st, f1.id).boxAway.length, "feuille de match");
assert.strictEqual(viewOf("fr-A").played[0].state, "played");
assert.ok(feed("fr-A").some(e => e.kind === "result" && e.matchId === f1.id), "résultat dans le fil du sélectionneur");
assert.ok(N.teamView(st, "fr-A", lyon, 2, now, start).friendlies.some(f => f.id === f1.id), "page publique : amicaux joués");
// La demande restée sans réponse expire au gel.
now = dExp.at - 3 * DAY + 1000;
N.step(st, leagues, world, now);
assert.ok(st.intlFriendlies.find(f => f.id === r4.friendly.id).reason === "expired", "demande expirée au gel des convocations");
ok("amical joué : convocations figées, joueurs retenus, résultat, feuille de match, pas de stats de club ; demande expirée");

// 6) Vue du sélectionneur : rubrique Amicaux réservée au sélectionneur.
const pool = C.buildPool(st, st.teams["fr-A"], leagues, world, now);
const cv = C.coachView(st, lyon, "fr-A", now, { pool, season: 2, calendarStartAt: start });
assert.ok(cv.ok && cv.friendlies && cv.friendlies.played.length === 1 && cv.perms.includes("friendlies"));
assert.ok(cv.analysis && cv.analysis.choices.length && cv.analysis.next, "analyse des adversaires : prochain match");
const an = C.analysisOf(st, st.teams["fr-A"], 2, start, now, "es-A");
assert.ok(an.opponent && an.opponent.id === "es-A" && an.opponent.coach && an.opponent.results.length >= 1 && an.opponent.headToHead.length === 1, "analyse : sélectionneur, résultats, confrontations");
ok("vue du sélectionneur : amicaux, analyse des adversaires");
console.log("\n🏁 national_friendlies_test.js : matchs amicaux internationaux conformes.");
