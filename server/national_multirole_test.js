// Mode Sélection : rôles cumulables et onglet « Joueurs suivis » (demande
// du 2026-10-07), server/nationalCoach.js.
//   - une personne : au plus un rôle du staff NT (sélectionneur, adjoint,
//     personne aidante) + recruteur et/ou scout ; droits = union des rôles ;
//   - restriction du scout (seulement ses joueurs) pour qui n'est QUE scout ;
//   - Joueurs suivis : un scout seul ne voit que les siens ; les autres
//     voient tous les joueurs suivis et qui les suit ;
//   - proposition de poste : message (meta) pour la messagerie, acceptation
//     par rôle, pas d'acceptation multiple.
// Profils vérifiés : sélectionneur seul ; sélectionneur + recruteur + scout ;
// adjoint ; adjoint + recruteur + scout ; personne aidante + recruteur +
// scout ; recruteur ; scout seul.
const assert = require("assert");
const store = require("./store.js");
const N = require("./nationalTeams.js");
const C = require("./nationalCoach.js");
const ok = m => console.log("✅ " + m);
const DAY = 864e5;

const start = Date.UTC(2027, 0, 5, 19);
const names = ["Lyon MR", "Paris MR", "Nice MR", "Lille MR", "Nantes MR", "Brest MR", "Metz MR", "Reims MR"];
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
// Joueurs d'un club hors staff (notes possibles pour tout le monde).
const idxOf = n => lg.teams.findIndex(t => t.name === n);
const others = pool.players.filter(x => x.club && x.club.idx === idxOf("Paris MR"))
  .concat(pool.players.filter(x => x.club && ![idxOf("Paris MR"), idxOf("Lille MR")].includes(x.club.idx)));
assert.ok(others.length >= 6, "vivier : assez de joueurs");
const ref = i => ({ p: others[i].p, n: others[i].n });
const K = r => r.p + "|" + r.n;
const invite = (who, target, role) => C.staffInvite(st, who, { teamId: "fr-A", mid: mid(target), role }, now);
const accept = (who, role) => C.staffRespond(st, who, { teamId: "fr-A", role, accept: true }, now);
const view = who => C.coachView(st, who, "fr-A", now, ctx);
const M = () => N.activeMandate(st, "fr-A");
const FULL = C.PERMS.coach;
const followed = v => v.followed.map(e => e.ref.p).sort();

// 1) Rôles simples : sélectionneur seul, adjoint, recruteur, scouts.
for (const [who, role] of [[nice, "assistant"], [brest, "recruiter"], [metz, "scout"], [reims, "scout"]]) {
  const r = invite(lyon, who, role);
  assert.ok(r.ok, `nomination ${role}`);
  assert.ok(r.message && r.message.meta.kind === "natStaffInvite" && r.message.meta.teamId === "fr-A" && r.message.meta.role === role && /Proposition de poste/.test(r.message.text), "proposition de poste : message pour la messagerie (rôle, sélection)");
  assert.deepStrictEqual(r.message.to, who.ref, "message adressé au club du manager nommé");
  assert.ok(accept(who, role).ok, "poste accepté");
  assert.strictEqual(accept(who, role).status, 409, "pas d'acceptation multiple");
}
const vc = view(lyon), va = view(nice), vr = view(brest), vs = view(metz);
assert.deepStrictEqual(vc.roles, ["coach"]); assert.deepStrictEqual(vc.perms.sort(), FULL.slice().sort(), "sélectionneur seul : tous les droits");
assert.deepStrictEqual(va.roles, ["assistant"]); assert.deepStrictEqual(va.perms.sort(), FULL.slice().sort(), "adjoint : mêmes droits que le sélectionneur");
assert.deepStrictEqual(vr.perms.sort(), C.PERMS.recruiter.slice().sort(), "recruteur seul : droits inchangés");
assert.deepStrictEqual(vs.perms.sort(), C.PERMS.scout.slice().sort(), "scout seul : droits inchangés (restreint)");
ok("rôles simples : droits inchangés (sélectionneur, adjoint, recruteur, scout)");

// 2) Joueurs suivis : attributions aux scouts (suivi) + ajouts à la liste.
assert.ok(C.staffAssign(st, brest, { teamId: "fr-A", mid: mid(metz), player: ref(0) }, now, ctx).ok);
assert.ok(C.staffAssign(st, lyon, { teamId: "fr-A", mid: mid(reims), player: ref(1) }, now, ctx).ok);
assert.ok(C.setListMember(st, nice, { teamId: "fr-A", list: "watchlist", player: ref(2) }, now, ctx).ok, "l'adjoint suit un joueur");
for (const who of [lyon, nice, brest]) {
  const v = view(who);
  assert.deepStrictEqual(followed(v), [ref(0).p, ref(1).p, ref(2).p].sort(), "sélectionneur, adjoint, recruteur : tous les joueurs suivis");
  const e0 = v.followed.find(e => e.ref.p === ref(0).p), e2 = v.followed.find(e => e.ref.p === ref(2).p);
  assert.ok(e0.by.length === 1 && e0.by[0].role === "scout" && e0.by[0].name === (M().staff.find(s => s.mid === mid(metz)).pseudo || "Metz MR"), "qui suit : le scout attribué");
  assert.ok(e2.by[0].role === "assistant" && e2.by[0].mine === (who === nice), "qui suit : l'adjoint (« moi » pour lui)");
  assert.ok(v.followed.every(e => e.by.every(b => !("mid" in b) && !("key" in b))), "jamais d'identifiant de manager");
}
const vm = view(metz), vre = view(reims);
assert.deepStrictEqual(followed(vm), [ref(0).p], "scout : seulement le joueur qu'il suit");
assert.deepStrictEqual(followed(vre), [ref(1).p], "autre scout : seulement le sien");
assert.ok(vm.pool.players.every(x => x.p === ref(0).p) && !vm.notes[K(ref(1))], "scout : ni le vivier ni les notes des autres scouts");
assert.strictEqual(C.setListMember(st, metz, { teamId: "fr-A", list: "watchlist", player: ref(1) }, now, ctx).status, 403, "scout : ne suit pas le joueur d'un autre");
assert.strictEqual(C.setNote(st, metz, { teamId: "fr-A", player: ref(1), text: "x" }, now, ctx).status, 403, "scout : pas de note hors de ses joueurs");
ok("Joueurs suivis : tout le staff concerné voit tout (avec qui suit) ; un scout ne voit que les siens");

// 3) Adjoint + recruteur + scout (Lille).
assert.ok(C.staffRemove(st, lyon, { teamId: "fr-A", mid: mid(brest), role: "recruiter" }, now).ok, "place de recruteur libérée");
for (const role of ["assistant", "recruiter", "scout"]) assert.ok(invite(lyon, lille, role).ok, "Lille : proposition " + role);
assert.strictEqual(C.staffOf(st, lille.key).staffInvites.length, 3, "trois propositions en attente");
assert.ok(accept(lille, "recruiter").ok && accept(lille, "scout").ok, "acceptation par rôle");
let vl = view(lille);
assert.deepStrictEqual(vl.roles, ["recruiter", "scout"], "rôles en cours (l'adjoint pas encore accepté)");
assert.ok(!vl.perms.includes("assigned") && vl.pool.players.length === pool.players.length, "recruteur + scout : pas de restriction scout (union des droits)");
assert.ok(accept(lille, "assistant").ok);
vl = view(lille);
assert.deepStrictEqual(vl.roles, ["assistant", "recruiter", "scout"], "adjoint + recruteur + scout");
assert.deepStrictEqual(vl.perms.sort(), FULL.slice().sort(), "droits = union (ceux de l'adjoint)");
assert.deepStrictEqual(vl.appoint, ["helper", "recruiter", "scout"], "nominations = union");
assert.ok(C.staffAssign(st, lyon, { teamId: "fr-A", mid: mid(lille), player: ref(3) }, now, ctx).ok, "on lui attribue un joueur (scout)");
vl = view(lille);
assert.ok(followed(vl).length === 4 && vl.followed.find(e => e.ref.p === ref(3).p).by[0].mine, "voit tous les joueurs suivis, dont le sien");
assert.ok(C.setNote(st, lille, { teamId: "fr-A", player: ref(1), text: "Bon lecteur du jeu." }, now, ctx).ok, "notes sur tous les joueurs");
assert.ok(C.setTactics(st, lille, { teamId: "fr-A", orders: C.defaultOrders() }, now, ctx).ok, "ordres (adjoint)");
assert.ok(!invite(lyon, lille, "helper").ok, "pas deux rôles du staff NT (adjoint + personne aidante)");
assert.ok(!invite(lyon, lille, "scout").ok, "déjà scout");
ok("adjoint + recruteur + scout : droits cumulés, aucune restriction scout, acceptation rôle par rôle");

// 4) Personne aidante + recruteur + scout (Nantes).
assert.ok(C.staffRemove(st, lyon, { teamId: "fr-A", mid: mid(metz) }, now).ok, "une place de scout libérée");
for (const role of ["helper", "recruiter", "scout"]) { assert.ok(invite(nice, nantes, role).ok || invite(lyon, nantes, role).ok, "Nantes : " + role); assert.ok(accept(nantes, role).ok); }
const vn = view(nantes);
assert.deepStrictEqual(vn.roles, ["helper", "recruiter", "scout"]);
const want = new Set(C.PERMS.helper.concat(C.PERMS.recruiter, C.PERMS.scout)); want.delete("assigned");
assert.deepStrictEqual(vn.perms.slice().sort(), [...want].sort(), "personne aidante + recruteur + scout : union des droits");
assert.ok(vn.staff.length && vn.appoint.join() === "scout" && vn.gatherings.length && vn.tactics, "staff (recruteur), roster et ordres en consultation (aidant)");
assert.strictEqual(C.setTactics(st, nantes, { teamId: "fr-A", orders: C.defaultOrders() }, now, ctx).status, 403, "toujours pas d'ordres (aucun de ses rôles ne le permet)");
assert.strictEqual(C.setConvocation(st, nantes, { teamId: "fr-A", gatheringId: "x", players: [] }, now, ctx).status, 403, "ni de convocations");
assert.ok(C.staffAssign(st, nantes, { teamId: "fr-A", mid: mid(reims), player: ref(4) }, now, ctx).ok, "attribue aux scouts (recruteur)");
assert.strictEqual(followed(view(nantes)).length, 4, "voit tous les joueurs suivis");
// Retrait d'une seule casquette.
assert.ok(C.staffRemove(st, lyon, { teamId: "fr-A", mid: mid(nantes), role: "recruiter" }, now).ok);
assert.deepStrictEqual(view(nantes).roles, ["helper", "scout"], "retrait d'un seul rôle : les autres restent");
ok("personne aidante + recruteur + scout : union des droits, retrait rôle par rôle");

// 5) Sélectionneur + recruteur + scout (Lyon se nomme lui-même).
assert.ok(!invite(lyon, lyon, "assistant").ok, "le sélectionneur n'est pas son propre adjoint");
assert.ok(C.staffRemove(st, lyon, { teamId: "fr-A", mid: mid(nantes), role: "scout" }, now).ok, "une place de scout libérée");
const self1 = invite(lyon, lyon, "recruiter"), self2 = invite(lyon, lyon, "scout");
assert.ok(self1.ok && self2.ok && !self1.message && !self2.message, "se nommer soi-même : en poste tout de suite, aucun message");
const vl2 = view(lyon);
assert.deepStrictEqual(vl2.roles, ["coach", "recruiter", "scout"], "sélectionneur + recruteur + scout");
assert.deepStrictEqual(vl2.perms.slice().sort(), FULL.slice().sort(), "droits du sélectionneur, sans restriction scout");
assert.ok(C.staffAssign(st, lille, { teamId: "fr-A", mid: mid(lyon), player: ref(5) }, now, ctx).ok, "on peut lui attribuer des joueurs (scout)");
const e5 = view(lyon).followed.find(e => e.ref.p === ref(5).p);
assert.ok(e5 && e5.by[0].mine && e5.by[0].role === "scout", "Joueurs suivis : les siens marqués « Vous »");
assert.ok(view(lyon).managers.some(x => x.roles.join() === "coach,recruiter,scout"), "annuaire : ses casquettes ici");
assert.ok(!C.staffInvite(st, paris, { teamId: "es-A", mid: mid(lille), role: "scout" }, now).ok, "toujours pas de staff dans une autre sélection");
assert.ok(!invite(lyon, paris, "scout").ok, "le sélectionneur d'une autre sélection n'est pas invitable");
// Scout seul toujours isolé malgré tout cela.
assert.deepStrictEqual(followed(view(reims)), [ref(1).p, ref(4).p].sort(), "scout seul : ses joueurs uniquement");
ok("sélectionneur + recruteur + scout : casquettes cumulées, rien d'autre ne change");

// 6) Fonctions sur le profil, accès « Mode Sélection » (une entrée par rôle).
const rl = require("./nationalExtras.js").rolesOf(st, "fr-1", lille.ref.idx).map(x => x.role);
assert.deepStrictEqual(rl, ["assistant", "recruiter", "scout"], "profil : toutes ses fonctions");
assert.deepStrictEqual(C.staffOf(st, lille.key).staffRoles.map(r => r.role).sort(), ["assistant", "recruiter", "scout"]);
ok("profil du manager et accès au mode : toutes les casquettes");
console.log("\n🏁 national_multirole_test.js : rôles cumulables et joueurs suivis conformes.");
