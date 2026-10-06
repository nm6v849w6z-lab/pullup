// Sélections nationales — matchs amicaux internationaux
// (server/nationalFriendlies.js) : demandes envoyées / reçues, dates
// compatibles (uniquement les dimanches des fenêtres internationales, par
// deux sélections sans match ce jour-là ; jamais un match de club déplacé),
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
const lyon = N.managerOf("fr-1", fr, 0, world), paris = N.managerOf("fr-1", fr, 1, world), nice = N.managerOf("fr-1", fr, 2, world);
const madrid = N.managerOf("es-1", es, 0, world), sevilla = N.managerOf("es-1", es, 1, world);
assert.ok(C.adminAppoint(st, "fr-A", lyon, 2, now, leagues).ok);
assert.ok(C.adminAppoint(st, "es-A", madrid, 2, now, leagues).ok);
const ctx = { season: 2, calendarStartAt: start };
const viewOf = id => F.viewFor(st, st.teams[id], 2, start, now);
const feed = id => N.activeMandate(st, id).feed || [];

// 1) Dates compatibles : uniquement le dimanche (20h) des fenêtres
//    internationales, pour deux sélections sans match ce jour-là.
const cand = F.candidateDays(st, 2, start);
const cfg = N.configOf(st);
assert.ok(cand.length === cfg.windowWeeks.length && cand.every(d => d.window && new Date(d.at).getUTCDay() === 0), "un dimanche de fenêtre internationale, rien d'autre");
const winAt = (id, w) => (C.gatheringsOf(st, st.teams[id], 2, start).find(g => g.kind === "window" && g.n === w) || {}).startAt;
const freeIn = w => Object.values(st.teams).filter(t => t.cat === "A" && F.viewFor(st, t, 2, start, now).dates.some(d => d.window === w)).map(t => t.id);
const v0 = viewOf("fr-A");
assert.ok(v0.dates.length && v0.dates.every(d => d.window && cand.some(c => c.at === d.at)), "dates proposées : fenêtres seulement");
const wFr = v0.dates[0].window;
const playsIn = M.compOf(st, 2, "A").matches.filter(m => m.w === wFr).map(m => [m.home, m.away]).flat();
assert.ok(!playsIn.includes("fr-A"), "seulement une fenêtre où la sélection ne joue pas de qualification");
// Les dimanches sont des jours sans match de club (championnat mardi / samedi, coupe jeudi).
assert.ok(v0.dates.every(d => [0, 2, 4].indexOf(Math.round((d.at - start) / DAY) % 7) < 0), "jamais un jour de championnat ni de coupe");
assert.ok(v0.opponents.some(o => o.id === "es-A" && o.coach) && v0.opponents.some(o => o.id === "it-A" && o.interim) && v0.opponents.every(o => o.id.endsWith("-A")), "adversaires : même catégorie, sélectionneur ou intérim");
// Sélections libres pendant la fenêtre de la France, et dans deux autres fenêtres.
const oppFr = freeIn(wFr).find(id => id !== "fr-A");
const wB = [1, 2, 3].find(w => w !== wFr && freeIn(w).length >= 2);
const pairB = freeIn(wB);
const wC = [1, 2, 3].find(w => w !== wFr && w !== wB && freeIn(w).length >= 2);
const pairC = freeIn(wC);
assert.ok(oppFr && pairB.length >= 2 && pairC.length >= 2, "des sélections libres dans chaque fenêtre (exemptées)");
assert.ok(C.adminAppoint(st, oppFr, sevilla, 2, now, leagues).ok && C.adminAppoint(st, pairB[0], nice, 2, now, leagues).ok && C.adminAppoint(st, pairC[0], madrid, 2, now, leagues).ok && C.adminAppoint(st, pairC[1], paris, 2, now, leagues).ok);
ok("dates compatibles : fenêtres internationales seulement, sélections sans match ce jour-là, matchs de club intacts");

// 2) Droits : seul le sélectionneur envoie une demande ; calendrier respecté.
const d1 = v0.dates.find(d => !d.busy.includes(oppFr));
assert.strictEqual(F.request(st, nice, { teamId: "fr-A", opponent: oppFr, at: d1.at }, now, ctx).status, 403, "un autre manager : refusé");
assert.ok(!F.request(st, lyon, { teamId: "fr-A", opponent: oppFr.replace("-A", "-U21"), at: d1.at }, now, ctx).ok, "jamais contre une autre catégorie");
const wPlay = [1, 2, 3].find(w => w !== wFr && winAt("fr-A", w));
const rPlay = F.request(st, lyon, { teamId: "fr-A", opponent: oppFr, at: cand[wPlay - 1].at }, now, ctx);
assert.ok(!rPlay.ok && /joue déjà/.test(rPlay.error), "fenêtre où la sélection joue une qualification : refusée");
const rFree = F.request(st, lyon, { teamId: "fr-A", opponent: oppFr, at: d1.at - 7 * DAY }, now, ctx);
assert.ok(!rFree.ok && /fenêtres internationales/.test(rFree.error), "dimanche hors fenêtre : refusé");
assert.ok(!F.request(st, lyon, { teamId: "fr-A", opponent: oppFr, at: d1.at + 3600e3 }, now, ctx).ok, "heure hors calendrier refusée");
ok("droits : sélectionneur seulement, même catégorie, fenêtres internationales seulement");

// 3) Demande envoyée / reçue, acceptation, rassemblement.
const r1 = F.request(st, lyon, { teamId: "fr-A", opponent: oppFr, at: d1.at, venue: "away" }, now, ctx);
assert.ok(r1.ok && r1.friendly.status === "pending" && r1.friendly.home === oppFr && r1.friendly.away === "fr-A", "demande : à l'extérieur");
assert.ok(!F.request(st, lyon, { teamId: "fr-A", opponent: oppFr, at: d1.at }, now, ctx).ok, "une seule demande en attente par adversaire");
assert.strictEqual(viewOf("fr-A").sent[0].state, "sent");
assert.strictEqual(viewOf(oppFr).received[0].state, "received");
assert.ok(feed(oppFr).some(e => e.kind === "friendly" && /Demande de match amical/.test(e.title)), "sélectionneur adverse prévenu (mode Sélectionneur)");
assert.ok(!viewOf("fr-A").dates.some(d => d.at === d1.at), "date réservée par la demande");
assert.strictEqual(F.respond(st, lyon, { id: r1.friendly.id, accept: true }, now, ctx).status, 403, "seule la sélection invitée répond");
assert.ok(F.respond(st, sevilla, { id: r1.friendly.id, accept: true }, now, ctx).ok);
assert.strictEqual(viewOf("fr-A").scheduled[0].state, "scheduled");
assert.ok(feed("fr-A").some(e => /accepte votre match amical/.test(e.title)), "réponse dans le fil du sélectionneur");
const gF = C.gatheringsOf(st, st.teams["fr-A"], 2, start).find(g => g.kind === "friendly");
assert.ok(gF && gF.startAt === d1.at && gF.freezeAt === d1.at - 3 * DAY && !gF.bye, "rassemblement de l'amical (liste figée 3 jours avant)");
ok("demande envoyée, reçue, acceptée ; rassemblement créé ; notifications propres au mode Sélectionneur");

// 4) Intérim : accepte d'office ; annulation ; refus ; expiration.
const dB = cand[wB - 1].at;
const interimB = pairB.find(id => id !== pairB[0]);
const r2 = F.request(st, nice, { teamId: pairB[0], opponent: interimB, at: dB }, now, ctx);
assert.ok(r2.ok && r2.friendly.status === "accepted" && r2.friendly.auto, "sélection sans sélectionneur : acceptée d'office");
assert.strictEqual(F.cancel(st, madrid, { id: r2.friendly.id }, now).status, 403, "annulation : seulement les sélectionneurs concernés");
assert.ok(F.cancel(st, nice, { id: r2.friendly.id }, now).ok && viewOf(pairB[0]).closed.some(f => f.id === r2.friendly.id && f.state === "cancelled"), "amical annulé");
const dC = cand[wC - 1].at;
const r3 = F.request(st, madrid, { teamId: pairC[0], opponent: pairC[1], at: dC, venue: "home" }, now, ctx);
assert.ok(r3.ok && viewOf(pairC[1]).received.length === 1);
assert.ok(F.respond(st, paris, { id: r3.friendly.id, accept: false }, now, ctx).ok && viewOf(pairC[0]).closed.some(f => f.id === r3.friendly.id && f.state === "refused"), "demande refusée");
assert.ok(feed(pairC[0]).some(e => /refuse votre match amical/.test(e.title)));
const r4 = F.request(st, madrid, { teamId: pairC[0], opponent: pairC[1], at: dC }, now, ctx);
assert.ok(r4.ok, "nouvelle demande après un refus");
const firstAt = Math.min(dC, d1.at);
ok("intérim : accepté d'office ; annuler, refuser ; états sent / received / scheduled / refused / cancelled");

// 5) Demande sans réponse avant le gel : expirée ; match joué à sa date.
const expireAt = dC - 3 * DAY + 1000;
const playAt = d1.at;
const steps = [[expireAt, "exp"], [d1.at - 3 * DAY + 1000, "freeze"], [d1.at + 60e3, "play"]].sort((a, b) => a[0] - b[0]);
let someFr = null, logBefore = 0, conv = null;
for (const [at, what] of steps) {
  now = at;
  N.step(st, leagues, world, now);
  if (what === "exp") assert.ok(st.intlFriendlies.find(f => f.id === r4.friendly.id).reason === "expired", "demande expirée au gel des convocations");
  if (what === "freeze") {
    conv = C.convocationOf(st, "fr-A", gF.gid);
    assert.ok(conv && conv.frozenAt && conv.players.length === 15, "convocations figées 3 jours avant l'amical");
    someFr = fr.teams.flatMap(t => t.players).find(p => conv.players.some(r => r.p === p.id && r.n === p.name));
    assert.ok(someFr && someFr.nationalDuty && someFr.nationalDuty.some(d => d.gid.endsWith(gF.gid)), "joueur convoqué retenu par sa sélection (absent des amicaux de son club ce jour-là)");
    logBefore = someFr.matchLog.length;
  }
}
const f1 = st.intlFriendlies.find(f => f.id === r1.friendly.id);
assert.ok(f1.status === "played" && typeof f1.scoreHome === "number" && f1.boxHome.length > 0, "amical joué");
assert.strictEqual(someFr.matchLog.length, logBefore, "jamais dans les stats de club");
// Direct (2026-10-06) : résultat caché pendant la diffusion, annoncé à la fin.
assert.ok(M.isLive(f1, now) && M.takePendingLive(st).some(x => x.id === f1.id), "amical en direct, diffusion rangée à part");
assert.ok(!M.resultsOf(st, "fr-A", now).some(r => r.id === f1.id), "pendant le direct : pas dans les résultats");
const livePub = viewOf("fr-A").played.find(f => f.id === f1.id);
assert.ok(livePub.state === "live" && livePub.scoreHome == null, "pendant le direct : amical « en direct », sans score");
assert.ok(!feed("fr-A").some(e => e.kind === "result" && e.matchId === f1.id), "pendant le direct : pas de résultat au sélectionneur");
now = f1.liveUntil + 2000;
N.step(st, leagues, world, now);
assert.ok(M.resultsOf(st, "fr-A", now).some(r => r.id === f1.id && r.comp === "friendly"), "dans les résultats de la sélection");
assert.ok(M.matchDetail(st, f1.id, now) && M.matchDetail(st, f1.id, now).boxAway.length, "feuille de match");
assert.strictEqual(viewOf("fr-A").played[0].state, "played");
assert.ok(feed("fr-A").some(e => e.kind === "result" && e.matchId === f1.id), "résultat dans le fil du sélectionneur");
assert.ok(N.teamView(st, "fr-A", lyon, 2, now, start).friendlies.some(f => f.id === f1.id), "page publique : amicaux joués");
ok("amical joué : convocations figées, joueurs retenus, résultat, feuille de match, pas de stats de club ; demande expirée");

// 6) Vue du sélectionneur : rubrique Amicaux réservée au sélectionneur.
const pool = C.buildPool(st, st.teams["fr-A"], leagues, world, now);
const cv = C.coachView(st, lyon, "fr-A", now, { pool, season: 2, calendarStartAt: start });
assert.ok(cv.ok && cv.friendlies && cv.friendlies.played.length === 1 && cv.perms.includes("friendlies"));
assert.ok(cv.analysis && cv.analysis.choices.length, "analyse des adversaires : sélections au choix");
const an = C.analysisOf(st, st.teams["fr-A"], 2, start, now, oppFr);
assert.ok(an.opponent && an.opponent.id === oppFr && an.opponent.coach && an.opponent.results.length >= 1 && an.opponent.headToHead.length === 1, "analyse : sélectionneur, résultats, confrontations");
ok("vue du sélectionneur : amicaux, analyse des adversaires");
console.log("\n🏁 national_friendlies_test.js : matchs amicaux internationaux conformes.");
