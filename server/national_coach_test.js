// Sélections nationales — phase B (server/nationalCoach.js) : présélection,
// joueurs suivis, convocations (15 au plus, figées 3 jours avant le premier
// match, remplacement d'un indisponible seulement), notifications aux clubs,
// tactique propre à la sélection (12 joueurs par match pris dans les 15).
const assert = require("assert");
const store = require("./store.js");
const N = require("./nationalTeams.js");
const C = require("./nationalCoach.js");
const ok = m => console.log("✅ " + m);
const DAY = 864e5;

const start = Date.UTC(2027, 0, 5, 19); // mardi 20h, heure de Paris
const fr = store.createMultiManagerCareer(["Lyon NT", "Paris NT", "Nice NT"], start).league;
const es = store.createMultiManagerCareer(["Madrid NT", "Sevilla NT"], start).league;
[fr, es].forEach(lg => { lg.seasonNumber = 2; lg.calendarStartAt = start; lg.teams.forEach(t => { if (t.isHuman) t.lastSeenAt = start; }); });
fr.country = "fr"; es.country = "es";
// 30 Français répartis dans les deux championnats (dont l'Espagne).
let n = 0;
[fr, es].forEach(lg => lg.teams.forEach(t => t.players.forEach(p => { p.nationality = "es"; })));
[fr, es].forEach(lg => lg.teams.forEach(t => t.players.slice(0, 2).forEach(p => { if (n < 30) { p.nationality = "fr"; n++; } })));
const leagues = new Map([["fr-1", fr], ["es-1", es]]);
const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }, { id: "es-1", country: "es", level: 1, group: 0 }] };
const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
let now = start + 3600e3;
N.step(st, leagues, world, now);
const lyon = N.managerOf("fr-1", fr, 0, world), paris = N.managerOf("fr-1", fr, 1, world);

// 0) Nomination par l'administration, vivier.
{
  const out = C.adminAppoint(st, "fr-A", lyon, 2, now, leagues);
  assert.ok(out.ok && N.activeMandate(st, "fr-A").key === lyon.key && out.mandate.toSeason === 3);
  const pool = C.buildPool(st, st.teams["fr-A"], leagues, world, now);
  assert.strictEqual(pool.eligible, 30);
  const x = pool.players[0];
  assert.ok(x.attrs && typeof x.ovr === "number" && typeof x.condition === "number" && x.club.name, "fiche sélectionneur : GEN, caractéristiques, forme, club");
  assert.ok(!("salary" in x) && !("potential" in x) && !("contract" in x), "jamais salaire, potentiel ni contrat");
  assert.ok(pool.players.some(p => p.club.leagueId === "es-1"), "joueurs de tous les championnats");
  ok("nomination, vivier du sélectionneur (tous championnats, rien de privé)");
}
const pool = C.buildPool(st, st.teams["fr-A"], leagues, world, now);
const ctx = { pool, season: 2, calendarStartAt: start };
const refs = pool.players.map(p => ({ p: p.p, n: p.n }));

// 1) Présélection et joueurs suivis.
{
  assert.strictEqual(C.setListMember(st, paris, { teamId: "fr-A", list: "preselection", player: refs[0] }, now, ctx).status, 403, "réservé au sélectionneur");
  for (let i = 0; i < 24; i++) assert.ok(C.setListMember(st, lyon, { teamId: "fr-A", list: "preselection", player: refs[i] }, now, ctx).ok);
  assert.ok(!C.setListMember(st, lyon, { teamId: "fr-A", list: "preselection", player: refs[24] }, now, ctx).ok, "présélection : 24 au plus");
  assert.ok(C.setListMember(st, lyon, { teamId: "fr-A", list: "preselection", player: refs[3], on: false }, now, ctx).ok);
  assert.strictEqual(N.activeMandate(st, "fr-A").preselection.length, 23);
  assert.ok(C.setListMember(st, lyon, { teamId: "fr-A", list: "watchlist", player: refs[29] }, now, ctx).ok);
  assert.ok(!C.setListMember(st, lyon, { teamId: "fr-A", list: "watchlist", player: { p: 999999, n: "Inconnu" } }, now, ctx).ok, "joueur non sélectionnable refusé");
  const esp = es.teams[1].players.find(p => p.nationality !== "fr");
  assert.ok(!C.setListMember(st, lyon, { teamId: "fr-A", list: "watchlist", player: { p: esp.id, n: esp.name } }, now, ctx).ok, "un étranger n'est pas sélectionnable");
  ok("présélection (24 au plus) et joueurs suivis, persistés sur le mandat");
}

// 2) Convocations : 15 au plus, liste libre puis figée 3 jours avant.
const gs = C.gatheringsOf(st, st.teams["fr-A"], 2, start);
const w1 = gs[0];
{
  assert.deepStrictEqual(gs.filter(g => g.kind === "window").map(g => new Date(g.startAt).getUTCDay()), [0, 0, 0], "fenêtres le dimanche");
  assert.strictEqual(Math.round((w1.startAt - start) / DAY), 12, "fenêtre 1 : dimanche de la semaine 2");
  assert.deepStrictEqual(gs.filter(g => g.kind === "window").map(g => Math.round((g.startAt - start) / DAY)), [12, 26, 40], "semaines 2, 4 et 6");
  assert.strictEqual(w1.freezeAt, w1.startAt - 3 * DAY);
  assert.ok(!C.setConvocation(st, lyon, { teamId: "fr-A", gatheringId: w1.gid, players: refs.slice(0, 16) }, now, ctx).ok, "16 joueurs refusés");
  assert.ok(C.setConvocation(st, lyon, { teamId: "fr-A", gatheringId: w1.gid, players: refs.slice(0, 10) }, now, ctx).ok);
  // Un joueur d'un club de manager (Lyon) parmi les choix.
  const lyonP = fr.teams[0].players[0];
  const picks = [{ p: lyonP.id, n: lyonP.name }, ...refs.filter(r => !(r.p === lyonP.id && r.n === lyonP.name)).slice(0, 13)];
  assert.ok(C.setConvocation(st, lyon, { teamId: "fr-A", gatheringId: w1.gid, players: picks }, now, ctx).ok, "modifiable avant le gel");
  // Gel : liste complétée à 15, clubs prévenus.
  now = w1.freezeAt + 1000;
  assert.ok(!C.setConvocation(st, lyon, { teamId: "fr-A", gatheringId: w1.gid, players: refs.slice(0, 12) }, now, ctx).ok, "liste figée 3 jours avant le match");
  N.step(st, leagues, world, now);
  const conv = C.convocationOf(st, "fr-A", w1.gid);
  assert.ok(conv.frozenAt && conv.players.length === 15, "liste figée et complétée à 15");
  assert.ok(picks.every(r => conv.players.some(x => x.p === r.p && x.n === r.n)), "les 14 choix du sélectionneur gardés");
  const holder = [...leagues.values()].flatMap(lg => lg.teams).find(t => t.isHuman && t.players.some(p => conv.players.some(r => r.p === p.id && r.n === p.name)));
  assert.ok(holder && holder.feed.entries.some(e => /Convocation en sélection/.test(e.title) && /France A/.test(e.text) && /dimanche/.test(e.text) && /Indisponible/.test(e.text)), "le manager du club est prévenu (sélection, compétition, date, indisponibilité)");
  // Sélection sans sélectionneur : convoquée aussi (intérim).
  const esConv = C.convocationOf(st, "es-A", w1.gid);
  assert.ok(esConv && esConv.frozenAt && esConv.auto, "intérim : convocation automatique au gel");
  ok("convocations : 15 au plus, libres puis figées 3 jours avant (complétées), managers de club prévenus, intérim convoqué");
}

// 3) Remplacement : seulement un joueur indisponible.
{
  const conv = C.convocationOf(st, "fr-A", w1.gid);
  const outRef = conv.players[0];
  const inRef = refs.find(r => !conv.players.some(x => x.p === r.p && x.n === r.n));
  assert.ok(!C.replaceConvoked(st, lyon, { teamId: "fr-A", gatheringId: w1.gid, out: outRef, in: inRef }, now, ctx).ok, "joueur disponible : pas de remplacement");
  // Blessure du joueur (vivier à jour).
  const poolInj = JSON.parse(JSON.stringify(pool));
  poolInj.players.find(p => p.p === outRef.p && p.n === outRef.n).injuryUntil = w1.startAt + 5 * DAY;
  const r = C.replaceConvoked(st, lyon, { teamId: "fr-A", gatheringId: w1.gid, out: outRef, in: inRef }, now, { ...ctx, pool: poolInj });
  assert.ok(r.ok && r.convocation.players.some(x => x.p === inRef.p) && r.convocation.changes[0].reason === "injured", "blessé remplacé");
  assert.ok(st.outbox && st.outbox.length === 1, "club du remplaçant prévenu (au prochain passage du monde)");
  // Joueur devenu inéligible (absent du vivier).
  const outRef2 = r.convocation.players[1];
  const poolGone = JSON.parse(JSON.stringify(pool));
  poolGone.players = poolGone.players.filter(p => !(p.p === outRef2.p && p.n === outRef2.n));
  const inRef2 = refs.find(x => !r.convocation.players.some(y => y.p === x.p && y.n === x.n));
  assert.ok(C.replaceConvoked(st, lyon, { teamId: "fr-A", gatheringId: w1.gid, out: outRef2, in: inRef2 }, now, { ...ctx, pool: poolGone }).ok, "inéligible remplacé");
  N.step(st, leagues, world, now + 1000);
  assert.ok(!st.outbox.length, "file de notifications vidée par le passage du monde");
  ok("remplacement d'un blessé ou d'un inéligible seulement, après le gel");
}

// 4) Tactique : propre à la sélection, 12 joueurs par match dans les 15.
{
  const view = C.coachView(st, lyon, "fr-A", now, ctx);
  assert.ok(view.ok && view.tacticsPlayers.length === 15 && view.options.defense.includes("Zone press"));
  const nids = view.tacticsPlayers.map(x => x.nid);
  const byPos = pos => view.tacticsPlayers.filter(x => (pool.players.find(p => p.p === x.ref.p && p.n === x.ref.n) || {}).position === pos);
  const orders = C.defaultOrders();
  orders.defense = "Zone press"; orders.rhythm = "Rapide"; orders.offRebStyle = "Agressif";
  orders.lineup = { starters: {}, backupPositions: {}, convoked: nids.slice(0, 13) };
  assert.ok(!C.setTactics(st, lyon, { teamId: "fr-A", orders }, now, ctx).ok, "13 joueurs sur la feuille refusés");
  orders.lineup.convoked = nids.slice(0, 12);
  orders.lineup.starters = { Meneur: nids[0], "Arrière": nids[1], "Ailier shooteur": nids[2], "Ailier fort": nids[3], Pivot: nids[14] };
  assert.ok(!C.setTactics(st, lyon, { teamId: "fr-A", orders }, now, ctx).ok, "titulaire hors des 12 refusé");
  orders.lineup.starters.Pivot = nids[4];
  orders.lineup.minutes = { Meneur: { [nids[0]]: 30, [nids[5]]: 10 } };
  orders.watchAssignments = [{ position: "Pivot", focus: "denyPostUp" }];
  const r = C.setTactics(st, lyon, { teamId: "fr-A", orders }, now, ctx);
  assert.ok(r.ok, r.error);
  assert.strictEqual(N.activeMandate(st, "fr-A").tactics.defense, "Zone press");
  assert.ok(!C.setTactics(st, lyon, { teamId: "fr-A", orders: { ...orders, defense: "Inconnue" } }, now, ctx).ok, "réglage inconnu refusé (validation des clubs)");
  assert.ok(!C.setTactics(st, paris, { teamId: "fr-A", orders }, now, ctx).ok, "réservé au sélectionneur");
  // La tactique du club n'est pas touchée.
  assert.notStrictEqual(fr.teams[0].defense === "Zone press" && fr.teams[0].rhythm === "Rapide" && fr.teams[0].offRebStyle === "Agressif", true);
  assert.strictEqual(C.coachView(st, paris, "fr-A", now, ctx).status, 403, "vue réservée au sélectionneur");
  assert.ok(N.teamView(st, "fr-A", lyon, 2, now, start).isCoach && !N.teamView(st, "fr-A", paris, 2, now, start).isCoach);
  ok("tactique propre à la sélection (validée comme les ordres d'un club), 12 joueurs par match parmi les 15");
}

// 5) Fin de mandat : listes conservées dans l'historique, accès retiré.
{
  const m = N.activeMandate(st, "fr-A");
  N.resign(st, lyon, { teamId: "fr-A" }, now, leagues);
  assert.ok(!N.activeMandate(st, "fr-A") && m.preselection.length === 23 && m.tactics, "historique du mandat conservé");
  assert.strictEqual(C.coachView(st, lyon, "fr-A", now, ctx).status, 403, "plus d'accès après le mandat");
  ok("fin de mandat : accès retiré, listes et tactique gardées dans l'historique");
}
console.log("\n🏁 national_coach_test.js : présélection, suivis, convocations et tactique conformes.");
