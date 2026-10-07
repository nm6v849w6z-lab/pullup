// Sélections nationales : staff et droits (server/nationalCoach.js), refonte
// du 2026-10-07.
//   STAFF NT : Sélectionneur (coach), Adjoints (assistant, mêmes accès que
//   le sélectionneur), Personnes aidantes (helper, consultation du roster et
//   des ordres).
//   DTN : Recruteurs (recruiter), Scouts (scout, seulement leurs joueurs).
// Nominations : adjoint ← sélectionneur ; personne aidante et recruteur ←
// sélectionneur ou adjoint ; scout ← sélectionneur, adjoint ou recruteur.
// Ancien modèle : « scout » = recruteur (migré une fois).
const assert = require("assert");
const store = require("./store.js");
const N = require("./nationalTeams.js");
const C = require("./nationalCoach.js");
const F = require("./nationalFriendlies.js");
const ok = m => console.log("✅ " + m);
const DAY = 864e5;

const start = Date.UTC(2027, 0, 5, 19);
const names = ["Lyon ST", "Paris ST", "Nice ST", "Lille ST", "Nantes ST", "Brest ST", "Metz ST", "Reims ST"];
const lg = store.createMultiManagerCareer(names, start).league;
lg.seasonNumber = 2; lg.calendarStartAt = start; lg.country = "fr";
lg.teams.forEach(t => { if (t.isHuman) t.lastSeenAt = start + 300 * DAY; });
lg.teams.forEach(t => t.players.forEach((p, i) => { p.nationality = i < 3 ? "fr" : "es"; p.age = 25; p.injuryUntil = null; }));
const leagues = new Map([["fr-1", lg]]);
const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }] };
const st = N.emptyStore(); st.config = { cycleStartSeason: 2, matchesLive: true };
const now = start + 3600e3;
N.step(st, leagues, world, now);
const [lyon, paris, nice, lille, nantes, brest, metz, reims] = names.map((_, i) => N.managerOf("fr-1", lg, i, world));
assert.ok(C.adminAppoint(st, "fr-A", lyon, 2, now, leagues).ok);
assert.ok(C.adminAppoint(st, "es-A", paris, 2, now, leagues).ok);
const mid = m => N.managerMid(m.key);
const pool = C.buildPool(st, st.teams["fr-A"], leagues, world, now);
const ctx = { pool, season: 2, calendarStartAt: start };
const refOf = i => ({ p: pool.players[i].p, n: pool.players[i].n });
const invite = (who, target, role) => C.staffInvite(st, who, { teamId: "fr-A", mid: mid(target), role }, now);
const accept = who => assert.ok(C.staffRespond(st, who, { teamId: "fr-A", accept: true }, now).ok);
const M = () => N.activeMandate(st, "fr-A");

// 0) Une seule table de droits, pas de rôle « Entraîneur ».
assert.deepStrictEqual(Object.keys(C.PERMS).sort(), ["assistant", "coach", "helper", "recruiter", "scout"]);
assert.deepStrictEqual(C.PERMS.assistant, C.PERMS.coach, "adjoint = mêmes accès fonctionnels que le sélectionneur");
assert.deepStrictEqual(C.APPOINT, { coach: ["assistant", "helper", "recruiter", "scout"], assistant: ["helper", "recruiter", "scout"], recruiter: ["scout"] });
assert.strictEqual(C.STAFF_MAX.scout, 5, "5 scouts au maximum");
ok("rôles : staff NT (sélectionneur, adjoint, personne aidante) et DTN (recruteur, scout)");

// 1) Nominations.
assert.strictEqual(invite(nice, lille, "helper").status, 403, "hors staff : aucune nomination");
assert.ok(!invite(lyon, nice, "entraineur").ok, "rôle inconnu");
assert.ok(!invite(lyon, paris, "assistant").ok, "un sélectionneur ne peut pas rejoindre un staff");
assert.ok(invite(lyon, nice, "assistant").ok); accept(nice);
assert.strictEqual(invite(nice, brest, "assistant").status, 403, "un adjoint ne nomme pas d'adjoint");
assert.ok(invite(nice, lille, "helper").ok, "l'adjoint nomme une personne aidante"); accept(lille);
assert.ok(invite(nice, nantes, "recruiter").ok, "l'adjoint nomme un recruteur"); accept(nantes);
assert.strictEqual(invite(nantes, brest, "recruiter").status, 403, "un recruteur ne nomme pas de recruteur");
assert.strictEqual(invite(nantes, brest, "helper").status, 403, "un recruteur ne nomme pas de personne aidante");
assert.ok(invite(nantes, brest, "scout").ok, "le recruteur nomme un scout"); accept(brest);
assert.ok(invite(lyon, metz, "scout").ok, "le sélectionneur nomme un scout"); accept(metz);
assert.strictEqual(invite(lille, reims, "scout").status, 403, "une personne aidante ne nomme personne");
assert.strictEqual(invite(brest, reims, "scout").status, 403, "un scout ne nomme personne");
assert.ok(!invite(lyon, nice, "scout").ok, "déjà dans le staff");
const inv = C.staffOf(st, brest.key);
const rec = M().staff.find(s => s.mid === mid(nantes));
assert.deepStrictEqual(inv.staffRoles.map(r => [r.role, r.by]), [["scout", rec.pseudo || rec.clubName]], "nommé par le recruteur");
assert.ok(st.outbox && st.outbox.some(o => /invitation dans le staff/.test(o.entry.title)), "nommé prévenu (message au club)");
assert.ok(!C.staffInvite(st, paris, { teamId: "es-A", mid: mid(nice), role: "helper" }, now).ok, "déjà dans un autre staff");
ok("nominations : adjoint par le sélectionneur seul ; aidant et recruteur par sélectionneur / adjoint ; scout aussi par recruteur");

// 2) Adjoint : exactement les accès du sélectionneur.
const va = C.coachView(st, nice, "fr-A", now, ctx), vc = C.coachView(st, lyon, "fr-A", now, ctx);
assert.ok(va.ok && va.role === "assistant" && va.friendlies && va.report && va.stats && va.managers.length && va.staff.length === 5, "adjoint : amicaux, mandat, statistiques, staff");
assert.deepStrictEqual(va.perms, vc.perms);
assert.deepStrictEqual(va.appoint, ["helper", "recruiter", "scout"]);
const ref = refOf(0);
assert.ok(C.setListMember(st, nice, { teamId: "fr-A", list: "preselection", player: ref }, now, ctx).ok, "adjoint : présélection");
const g = C.gatheringsOf(st, st.teams["fr-A"], 2, start).find(x => !x.bye);
assert.ok(C.setConvocation(st, nice, { teamId: "fr-A", gatheringId: g.gid, players: [ref] }, now, ctx).ok, "adjoint : convocations");
assert.ok(C.setTactics(st, nice, { teamId: "fr-A", orders: C.defaultOrders() }, now, ctx).ok, "adjoint : ordres");
const dates = F.viewFor(st, st.teams["fr-A"], 2, start, now).dates;
assert.ok(F.request(st, nice, { teamId: "fr-A", opponent: "es-A", at: dates[0].at }, now, ctx).ok, "adjoint : matchs amicaux");
ok("adjoint : mêmes accès que le sélectionneur (présélection, convocations, ordres, amicaux, staff)");

// 3) Personne aidante : roster et ordres en consultation.
const vh = C.coachView(st, lille, "fr-A", now, ctx);
assert.ok(vh.ok && vh.pool && vh.gatherings.length && vh.preselection.length && vh.tactics && vh.upcoming, "aidant : joueurs, présélection, convoqués, ordres en consultation");
assert.ok(vh.staff.length === 0 && vh.managers.length === 0 && vh.friendlies === null && vh.report === null && vh.appoint.length === 0, "aidant : ni staff, ni DTN, ni amicaux, ni mandat");
assert.strictEqual(C.setTactics(st, lille, { teamId: "fr-A", orders: C.defaultOrders() }, now, ctx).status, 403, "aidant : ne modifie pas les ordres");
assert.strictEqual(C.setConvocation(st, lille, { teamId: "fr-A", gatheringId: g.gid, players: [] }, now, ctx).status, 403, "aidant : ne convoque pas");
assert.strictEqual(C.setListMember(st, lille, { teamId: "fr-A", list: "preselection", player: refOf(1) }, now, ctx).status, 403, "aidant : présélection en lecture");
assert.ok(C.setListMember(st, lille, { teamId: "fr-A", list: "watchlist", player: refOf(1) }, now, ctx).ok, "aidant : suit des joueurs");
ok("personne aidante : roster et ordres en consultation, aucun accès au staff ni à la DTN");

// 4) Recruteur : DTN.
const vr = C.coachView(st, nantes, "fr-A", now, ctx);
assert.ok(vr.ok && vr.pool.players.length === pool.players.length && vr.watchlist.length, "recruteur : vivier complet, joueurs suivis");
assert.ok(vr.gatherings.length === 0 && vr.tactics === null && vr.preselection.length === 0 && vr.friendlies === null && vr.analysis === null, "recruteur : rien du staff NT");
assert.ok(vr.staff.length === 5 && vr.appoint.join() === "scout", "recruteur : page Staff, ne nomme que des scouts");
assert.strictEqual(vr.assignMax, 50, "50 joueurs par scout au maximum");
assert.ok(C.staffAssign(st, nantes, { teamId: "fr-A", mid: mid(brest), player: refOf(2) }, now, ctx).ok, "recruteur : attribue un joueur à un scout");
assert.ok(C.staffAssign(st, nantes, { teamId: "fr-A", mid: mid(brest), player: refOf(3) }, now, ctx).ok);
assert.ok(C.staffAssign(st, nice, { teamId: "fr-A", mid: mid(metz), player: refOf(4) }, now, ctx).ok, "adjoint : attribue aussi");
assert.strictEqual(C.staffAssign(st, lille, { teamId: "fr-A", mid: mid(metz), player: refOf(5) }, now, ctx).status, 403, "aidant : pas d'attribution");
assert.strictEqual(C.staffAssign(st, brest, { teamId: "fr-A", mid: mid(brest), player: refOf(5) }, now, ctx).status, 403, "scout : pas d'attribution");
assert.ok(!C.staffAssign(st, nantes, { teamId: "fr-A", mid: mid(lille), player: refOf(5) }, now, ctx).ok, "attribution à un scout seulement");
assert.ok(C.staffAssign(st, nantes, { teamId: "fr-A", mid: mid(brest), player: refOf(3), on: false }, now, ctx).ok && M().assign[mid(brest)].length === 1, "retrait d'une attribution");
assert.strictEqual(C.staffRemove(st, nantes, { teamId: "fr-A", mid: mid(lille) }, now).status, 403, "recruteur : ne retire pas une personne aidante");
assert.strictEqual(C.staffRemove(st, nice, { teamId: "fr-A", mid: mid(nice) + "x" }, now).status, 404);
ok("recruteur : vivier, joueurs suivis, nomination des scouts et attribution de leurs joueurs");

// 5) Scout : uniquement ses joueurs (données filtrées côté serveur).
const vs = C.coachView(st, brest, "fr-A", now, ctx);
assert.ok(vs.ok && vs.role === "scout" && vs.pool.players.length === 1 && vs.pool.players[0].p === refOf(2).p, "scout : vivier réduit à ses joueurs attribués");
assert.ok(vs.watchlist.every(r => r.p === refOf(2).p) && vs.staff.length === 0 && vs.managers.length === 0 && vs.tactics === null && vs.analysis === null && vs.gatherings.length === 0, "scout : rien d'autre");
assert.ok(Object.keys(vs.assign).join() === mid(brest), "scout : ne voit pas les joueurs des autres scouts");
assert.ok(C.setListMember(st, brest, { teamId: "fr-A", list: "watchlist", player: refOf(2) }, now, ctx).ok, "scout : suit un joueur attribué");
assert.strictEqual(C.setListMember(st, brest, { teamId: "fr-A", list: "watchlist", player: refOf(4) }, now, ctx).status, 403, "scout : pas un joueur d'un autre scout");
assert.strictEqual(C.analysisData(st, brest, "fr-A", null, now, { season: 2, pool }).status, 403, "scout : pas d'analyse des adversaires");
ok("scout : accès limité aux joueurs qui lui sont attribués (vue et actions)");

// 6) Retraits : hiérarchie respectée, départ volontaire.
assert.strictEqual(C.staffRemove(st, nice, { teamId: "fr-A", mid: mid(nice) }, now).ok, true, "l'adjoint peut quitter de lui-même");
assert.ok(invite(lyon, nice, "assistant").ok); accept(nice);
assert.ok(invite(lyon, reims, "assistant").ok); accept(reims);
assert.strictEqual(C.staffRemove(st, nice, { teamId: "fr-A", mid: mid(reims) }, now).status, 403, "un adjoint ne retire pas un adjoint");
assert.ok(C.staffRemove(st, nantes, { teamId: "fr-A", mid: mid(brest) }, now).ok && !M().assign[mid(brest)], "le recruteur retire un scout (ses attributions disparaissent)");
assert.strictEqual(C.coachView(st, brest, "fr-A", now, ctx).status, 403, "scout retiré : plus d'accès");
assert.ok(C.staffRemove(st, nice, { teamId: "fr-A", mid: mid(nantes) }, now).ok, "l'adjoint retire un recruteur");
assert.ok(C.staffRemove(st, lyon, { teamId: "fr-A", mid: mid(reims) }, now).ok, "le sélectionneur retire un adjoint");
assert.ok(M().feed.some(e => /quitte votre staff/.test(e.title)));
ok("retraits selon la hiérarchie, départ volontaire");

// 7) Migration : l'ancien « scout » (recruteur) devient « recruiter ».
const old = { staff: [{ key: "k", mid: "m1", role: "scout", status: "active" }, { key: "k2", mid: "m2", role: "assistant", status: "active" }] };
C.migrateStaff(old);
assert.deepStrictEqual(old.staff.map(s => s.role), ["recruiter", "assistant"]);
C.migrateStaff(old);
assert.deepStrictEqual(old.staff.map(s => s.role), ["recruiter", "assistant"], "migration unique");
ok("migration : anciens recruteurs (« scout ») conservés comme recruteurs");
console.log("\n🏁 national_staff_test.js : staff et droits des sélections conformes.");
