// Sélections nationales — staff et droits (server/nationalCoach.js) :
// 2 adjoints et 2 recruteurs au plus, vrais managers invités par le
// sélectionneur (annuaire managerIndex, par mid), qui acceptent ou
// refusent ; retrait par le sélectionneur ou départ volontaire. Droits :
// sélectionneur tout ; adjoint joueurs, présélection en lecture, tactique,
// préparation des matchs (aucune administration) ; recruteur joueurs,
// joueurs suivis et analyse des adversaires seulement.
const assert = require("assert");
const store = require("./store.js");
const N = require("./nationalTeams.js");
const C = require("./nationalCoach.js");
const F = require("./nationalFriendlies.js");
const ok = m => console.log("✅ " + m);
const DAY = 864e5;

const start = Date.UTC(2027, 0, 5, 19);
const lg = store.createMultiManagerCareer(["Lyon ST", "Paris ST", "Nice ST", "Lille ST", "Nantes ST"], start).league;
lg.seasonNumber = 2; lg.calendarStartAt = start; lg.country = "fr";
lg.teams.forEach(t => { if (t.isHuman) t.lastSeenAt = start + 300 * DAY; });
lg.teams.forEach(t => t.players.forEach((p, i) => { p.nationality = i < 3 ? "fr" : "es"; p.age = 25; p.injuryUntil = null; }));
const leagues = new Map([["fr-1", lg]]);
const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }] };
const st = N.emptyStore(); st.config = { cycleStartSeason: 2, matchesLive: true };
const now = start + 3600e3;
N.step(st, leagues, world, now);
const [lyon, paris, nice, lille, nantes] = [0, 1, 2, 3, 4].map(i => N.managerOf("fr-1", lg, i, world));
assert.ok(C.adminAppoint(st, "fr-A", lyon, 2, now, leagues).ok);
assert.ok(C.adminAppoint(st, "es-A", paris, 2, now, leagues).ok);
const mid = m => N.managerMid(m.key);
assert.ok(st.managerIndex.length >= 5 && st.managerIndex.every(x => x.mid && x.key), "annuaire des managers");
const pool = C.buildPool(st, st.teams["fr-A"], leagues, world, now);
const ctx = { pool, season: 2, calendarStartAt: start };
const ref = { p: pool.players[0].p, n: pool.players[0].n };

// 1) Invitations : sélectionneur seulement, limites, réponse.
assert.strictEqual(C.staffInvite(st, nice, { teamId: "fr-A", mid: mid(lille), role: "scout" }, now).status, 403, "seul le sélectionneur invite");
assert.ok(!C.staffInvite(st, lyon, { teamId: "fr-A", mid: "inconnu", role: "scout" }, now).ok, "manager introuvable");
assert.ok(!C.staffInvite(st, lyon, { teamId: "fr-A", mid: mid(paris), role: "assistant" }, now).ok, "un sélectionneur ne peut pas être adjoint");
assert.ok(!C.staffInvite(st, lyon, { teamId: "fr-A", mid: mid(nice), role: "boss" }, now).ok, "rôle inconnu");
assert.ok(C.staffInvite(st, lyon, { teamId: "fr-A", mid: mid(nice), role: "assistant" }, now).ok);
assert.ok(C.staffInvite(st, lyon, { teamId: "fr-A", mid: mid(lille), role: "scout" }, now).ok);
assert.ok(C.staffInvite(st, lyon, { teamId: "fr-A", mid: mid(nantes), role: "scout" }, now).ok);
assert.ok(!C.staffInvite(st, lyon, { teamId: "fr-A", mid: mid(nice), role: "scout" }, now).ok, "déjà invité");
assert.strictEqual(C.staffOf(st, nice.key).staffInvites.length, 1, "invitation en attente visible de l'invité");
assert.ok(st.outbox && st.outbox.some(o => /invitation dans le staff/.test(o.entry.title)), "invité prévenu (message au club)");
assert.strictEqual(C.coachView(st, nice, "fr-A", now, ctx).status, 403, "pas d'accès avant d'avoir accepté");
assert.ok(C.staffRespond(st, nice, { teamId: "fr-A", accept: true }, now).ok);
assert.ok(C.staffRespond(st, lille, { teamId: "fr-A", accept: true }, now).ok);
assert.ok(C.staffRespond(st, nantes, { teamId: "fr-A", accept: false }, now).ok && !N.activeMandate(st, "fr-A").staff.some(s => s.mid === mid(nantes)), "invitation refusée");
assert.ok(N.activeMandate(st, "fr-A").feed.some(e => e.kind === "staff" && /rejoint votre staff/.test(e.title)), "le sélectionneur est prévenu");
assert.deepStrictEqual(C.staffOf(st, nice.key).staffRoles.map(r => r.role), ["assistant"]);
assert.ok(!C.staffInvite(st, paris, { teamId: "es-A", mid: mid(nice), role: "scout" }, now).ok, "déjà dans un autre staff");
ok("staff : invitations (sélectionneur seul, limites), acceptation, refus, invité prévenu");

// 2) Droits de l'adjoint.
const va = C.coachView(st, nice, "fr-A", now, ctx);
assert.ok(va.ok && va.role === "assistant", "adjoint : accès à la vue");
assert.ok(va.pool && va.gatherings.length && va.tactics && va.analysis, "adjoint : joueurs, convocations en lecture, tactique, analyse");
assert.ok(va.friendlies === null && va.report === null && va.stats.length === 0 && va.managers.length === 0, "adjoint : ni amicaux, ni mandat, ni statistiques, ni staff");
assert.strictEqual(C.setListMember(st, nice, { teamId: "fr-A", list: "preselection", player: ref }, now, ctx).status, 403, "adjoint : présélection en lecture seule");
assert.ok(C.setListMember(st, nice, { teamId: "fr-A", list: "watchlist", player: ref }, now, ctx).ok, "adjoint : peut suivre un joueur");
const g = C.gatheringsOf(st, st.teams["fr-A"], 2, start).find(x => !x.bye);
assert.strictEqual(C.setConvocation(st, nice, { teamId: "fr-A", gatheringId: g.gid, players: [ref] }, now, ctx).status, 403, "adjoint : pas de convocation");
assert.ok(C.setTactics(st, nice, { teamId: "fr-A", orders: C.defaultOrders() }, now, ctx).ok, "adjoint : modifie la tactique");
assert.strictEqual(C.staffInvite(st, nice, { teamId: "fr-A", mid: mid(nantes), role: "scout" }, now).status, 403, "adjoint : aucun pouvoir d'administration");
const dates = F.viewFor(st, st.teams["fr-A"], 2, start, now).dates;
assert.strictEqual(F.request(st, nice, { teamId: "fr-A", opponent: "es-A", at: dates[0].at }, now, ctx).status, 403, "adjoint : pas d'amicaux");
ok("adjoint : joueurs, présélection en lecture, tactique, préparation ; ni convocations, ni amicaux, ni staff");

// 3) Droits du recruteur.
const vs = C.coachView(st, lille, "fr-A", now, ctx);
assert.ok(vs.ok && vs.role === "scout" && vs.pool && vs.analysis, "recruteur : joueurs et analyse");
assert.ok(vs.gatherings.length === 0 && vs.tactics === null && vs.preselection.length === 0 && vs.feed.length === 0 && vs.friendlies === null, "recruteur : rien d'autre");
assert.ok(C.setListMember(st, lille, { teamId: "fr-A", list: "watchlist", player: ref, on: false }, now, ctx).ok, "recruteur : joueurs suivis");
assert.strictEqual(C.setTactics(st, lille, { teamId: "fr-A", orders: C.defaultOrders() }, now, ctx).status, 403, "recruteur : pas de tactique");
assert.strictEqual(C.markSeen(st, lille, { teamId: "fr-A" }, now).status, 403);
ok("recruteur : joueurs, joueurs suivis, analyse des adversaires seulement");

// 4) Sélectionneur : tout ; retrait et départ.
const vc = C.coachView(st, lyon, "fr-A", now, ctx);
assert.ok(vc.role === "coach" && vc.friendlies && vc.report && vc.managers.length >= 3 && vc.staff.length === 2 && vc.staffMax.assistant === 2, "sélectionneur : amicaux, bilan, annuaire, staff");
assert.ok(vc.managers.find(x => x.mid === mid(paris)).busy, "annuaire : un sélectionneur n'est pas invitable");
assert.strictEqual(C.coachView(st, nantes, "fr-A", now, ctx).status, 403, "hors staff : refusé");
assert.ok(C.staffRemove(st, lyon, { teamId: "fr-A", mid: mid(lille) }, now).ok);
assert.strictEqual(C.coachView(st, lille, "fr-A", now, ctx).status, 403, "recruteur retiré : plus d'accès");
assert.ok(C.staffRemove(st, nice, { teamId: "fr-A" }, now).ok && C.staffOf(st, nice.key).staffRoles.length === 0, "l'adjoint quitte le staff");
assert.ok(N.activeMandate(st, "fr-A").feed.some(e => /quitte votre staff/.test(e.title)));
ok("sélectionneur : tous les droits ; retrait d'un membre, départ volontaire");
console.log("\n🏁 national_staff_test.js : staff et droits des sélections conformes.");
