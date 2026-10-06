// Dynamique de groupe (« Vestiaire », 2026-10-06) : module partagé
// assets/vestiaire.js branché sur le moteur (Team.trainWeek,
// applyChemistryResult, discussTransferRequest, serializeTeam/teamFromSave).
// Test purement moteur, comme transfer_request_test.js.
const assert = require("assert");
const E = require("./engine.js");
const V = require("./assets/vestiaire.js");
const { generateStartingRoster, serializeTeam, teamFromSave } = E;

function team(name = "Vestiaire Test") {
  const t = generateStartingRoster(name);
  t.players.forEach(p => { p.form = 60; });
  return t;
}

// 1) Vue complète sur un effectif neuf : rien d'absent, hiérarchie cohérente.
(function testViewShape() {
  const t = team();
  const v = V.buildView(t, { now: Date.now() });
  assert.ok(v.state && v.state.label, "état global");
  assert.strictEqual(v.players.length, t.players.length);
  const leaders = v.players.filter(p => p.level === "leader");
  assert.ok(leaders.length <= 2, "2 leaders au plus");
  assert.ok(v.players.filter(p => p.level === "cadre").length <= 4, "4 cadres au plus");
  v.players.forEach(p => {
    assert.ok(V.LEVELS[p.level], `niveau connu ${p.level}`);
    assert.ok(p.influence >= 0 && p.influence <= 100, "influence 0-100");
  });
  v.groups.forEach(g => {
    assert.ok(g.ids.length >= 2 && g.ids.length <= 6, "groupes de 2 à 6");
    assert.ok(g.name, "groupe nommé");
  });
  assert.strictEqual(new Set(v.groups.flatMap(g => g.ids)).size, v.groups.flatMap(g => g.ids).length, "un joueur dans un seul groupe");
  assert.strictEqual(v.trend.key, "new");
})();

// 2) Groupes émergents : un clan étranger se forme sans être codé en dur.
(function testEmergentGroup() {
  const t = team();
  const main = t.players[0].nationality;
  const foreign = main === "us" ? "fr" : "us";
  const trio = t.players.slice(-3);
  const posts = ["Meneur", "Ailier fort", "Pivot"];
  trio.forEach((p, i) => { p.nationality = foreign; p.age = 24 + i; p.position = posts[i]; });
  t.players.filter(p => !trio.includes(p)).forEach(p => { p.nationality = main; });
  const v = V.buildView(t, { now: Date.now() });
  const ids = trio.map(p => String(p.id));
  const g = v.groups.find(gr => ids.every(id => gr.ids.includes(id)));
  assert.ok(g, "le trio étranger forme un groupe");
})();

// 3) Demande de transfert → problème prioritaire + joueur marginalisé.
(function testProblems() {
  const t = team();
  const p = t.players[3];
  p.transferRequestActive = true;
  p.form = 10;
  const v = V.buildView(t, { now: Date.now() });
  assert.strictEqual(v.problems[0].key, "request");
  assert.strictEqual(v.players.find(x => x.id === p.id).level, "marginal");
})();

// 4) Événements par différence d'une semaine à l'autre (arrivée, départ,
//    perte de place, blessure, prolongation) + relevé hebdo + sauvegarde.
(function testWeeklyEventsAndPersistence() {
  const t = team();
  const now = Date.now();
  t.trainWeek(1, now);
  assert.strictEqual(t.locker.history.length, 1, "un relevé par semaine");
  assert.strictEqual(t.locker.log.length, 0, "première semaine : référence, aucun événement");
  const starters = t.lineup.starters;
  const pos = Object.keys(starters)[0];
  const benchedId = starters[pos];
  const sub = t.players.find(p => !Object.values(starters).includes(p.id));
  starters[pos] = sub.id;
  const gone = t.players.find(p => p.id !== benchedId && p.id !== sub.id && !Object.values(starters).includes(p.id));
  t.players = t.players.filter(p => p !== gone);
  const hurt = t.players.find(p => p.id !== sub.id && p.id !== benchedId);
  hurt.injuryUntil = now + 7 * 86400000;
  const ext = t.players.find(p => p !== hurt && p.id !== sub.id && p.id !== benchedId);
  ext.contractUntilSeason = 3;
  t.locker.last.p[String(ext.id)][4] = 2;
  t.trainWeek(1, now);
  const types = t.locker.log.map(e => e.t);
  ["starter", "benched", "departure", "injury", "extension"].forEach(k => assert.ok(types.includes(k), `événement ${k} (${types.join(",")})`));
  t.locker.log.forEach(e => assert.ok(V.eventText(e).length > 3));
  // Sauvegarde / rechargement.
  const back = teamFromSave(JSON.parse(JSON.stringify(serializeTeam(t))));
  assert.strictEqual(back.locker.history.length, 2);
  assert.deepStrictEqual(back.locker.log, t.locker.log);
  // Sauvegarde ancienne : aucun champ locker.
  const old = serializeTeam(t); delete old.locker;
  const back2 = teamFromSave(JSON.parse(JSON.stringify(old)));
  assert.deepStrictEqual(back2.locker, V.emptyLocker());
  V.buildView(back2, { now });
})();

// 5) Effets en retour bornés : contagion ±1 max par semaine, et le temps de
//    jeu remotive sans dépasser le plafond.
(function testBoundedFeedback() {
  const t = team();
  t.players.forEach(p => { p.form = 15; });
  t.chemistry = 70;
  const before = t.chemistry;
  t.trainWeek(1, Date.now());
  assert.ok(before - t.chemistry <= V.CONTAGION_MAX + 1e-9, "baisse bornée");
  assert.ok(t.chemistry < before, "le moral au plus bas pèse sur la cohésion");
  const t2 = team();
  const p = t2.players[0];
  p.form = 30;
  p.trainingSecondsPlayedByPosition = { [p.position]: 30 * 60 };
  const r = V.weeklyUpdate(t2, { now: Date.now() });
  assert.ok(p.form > 30, "remotivé par le temps de jeu");
  assert.ok(Math.abs(r.chemDelta) <= V.CONTAGION_MAX);
  p.form = 59;
  V.weeklyUpdate(t2, { now: Date.now() });
  assert.ok(p.form <= V.PLAYTIME_FORM_CAP, "plafond respecté");
})();

// 6) Relations : nées de l'histoire, nettoyées si un joueur part, bornées.
(function testRelations() {
  const t = team();
  const vet = t.players.find(p => p.age >= 27) || t.players[0];
  const young = t.players.find(p => p !== vet);
  t.mentorships = [{ youngId: young.id, veteranId: vet.id }];
  for (let i = 0; i < 4; i++) V.weeklyUpdate(t, { now: Date.now() });
  const k = V.pairKey(vet.id, young.id);
  assert.ok(t.locker.relations[k] && t.locker.relations[k].v >= 8, "lien de tutorat");
  assert.ok(Object.keys(t.locker.relations).length <= V.RELATIONS_MAX);
  t.players = t.players.filter(p => p !== young);
  t.mentorships = [];
  V.weeklyUpdate(t, { now: Date.now() });
  assert.ok(!t.locker.relations[k], "relation supprimée au départ");
})();

// 7) Séries et discussions journalisées ; données corrompues tolérées.
(function testResultsAndTalks() {
  const t = team();
  [1, 2, 3].forEach(() => t.applyChemistryResult(100, 70));
  assert.ok(t.locker.log.some(e => e.t === "win-streak" && e.x === 3));
  assert.ok(t.locker.log.some(e => e.t === "big-win"));
  const p = t.players[2];
  p.transferRequestActive = true;
  t.discussTransferRequest(p.id);
  assert.ok(t.locker.log.some(e => (e.t === "talk-ok" || e.t === "talk-ko") && e.p === p.id));
  const s = V.sanitize({ history: [null, { w: "x" }], log: [{}, 3], relations: { "a": { v: 50 }, "a|b": { v: "x" }, "c|d": { v: 0 } }, last: 7 });
  assert.deepStrictEqual(s, V.emptyLocker());
  const empty = team(); empty.players = [];
  const v = V.buildView(empty, {});
  assert.strictEqual(v.players.length, 0);
  V.weeklyUpdate(empty, {});
})();

// 8) Leaders : un leader épanoui relève les frustrés ; un leader en rupture
//    tire son groupe vers le bas sans jamais passer sous le plancher.
(function testLeaders() {
  const t = team();
  let v = V.buildView(t, { now: Date.now() });
  const leader = t.players.find(p => p.id === v.players.find(x => x.level === "leader").id);
  leader.form = 80;
  const low = t.players.find(p => p !== leader);
  low.form = 30;
  V.weeklyUpdate(t, { now: Date.now() });
  assert.ok(low.form >= 30 + V.LEADER_FORM_EFFECT, "leader épanoui : le frustré remonte");
  const t2 = team();
  t2.players.forEach(p => { p.nationality = "zz"; p.age = 26; });
  v = V.buildView(t2, { now: Date.now() });
  const l2 = t2.players.find(p => p.id === v.players.find(x => x.level === "leader").id);
  l2.form = 15;
  const mate = t2.players.find(p => p !== l2 && v.players.find(x => x.id === p.id).group && v.players.find(x => x.id === p.id).group === v.players.find(x => x.id === l2.id).group);
  if (mate) {
    mate.form = V.LEADER_PULL_FLOOR + 1;
    V.weeklyUpdate(t2, { now: Date.now() });
    assert.ok(mate.form >= V.LEADER_PULL_FLOOR, "plancher respecté");
  }
})();

// 9) Mouvements d'effectif immédiats (club humain) : vente forcée →
//    départ journalisé tout de suite, pas de doublon la semaine suivante ;
//    un club CPU n'enregistre rien.
(function testImmediateRoster() {
  const t = team(); t.isHuman = true;
  t.trainWeek(1, Date.now());
  const p = t.players.find(x => !Object.values(t.lineup.starters).includes(x.id));
  p.forSale = true;
  assert.ok(t.sellPlayer(p.id) !== false, "vente forcée");
  assert.strictEqual(t.locker.log.filter(e => e.t === "departure" && e.p === p.id).length, 1, "départ journalisé tout de suite");
  t.trainWeek(1, Date.now());
  assert.strictEqual(t.locker.log.filter(e => e.t === "departure" && e.p === p.id).length, 1, "pas de doublon à la semaine suivante");
  const newcomer = team("Autre").players[0];
  t.players.push(newcomer);
  V.noteRoster(t, newcomer, "arrival");
  t.trainWeek(1, Date.now());
  assert.strictEqual(t.locker.log.filter(e => e.t === "arrival" && e.p === newcomer.id).length, 1, "arrivée journalisée une seule fois");
  const cpu = team("CPU"); cpu.isHuman = false;
  V.noteRoster(cpu, cpu.players[0], "departure");
  assert.strictEqual((cpu.locker.log || []).length, 0, "club CPU : rien");
})();

console.log("vestiaire_test OK");
