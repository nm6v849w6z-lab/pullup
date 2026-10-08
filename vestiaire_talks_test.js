// Entretiens et communication du coach (2026-10-08, phases 1 à 5) : moteur
// partagé assets/vestiaire.js (talk, recommandations, promesses,
// contradictions, déclarations publiques, cohérence). Test purement moteur.
const assert = require("assert");
const E = require("./engine.js");
const V = require("./assets/vestiaire.js");
const { generateStartingRoster, serializeTeam, teamFromSave } = E;

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 9, 1, 12);
function team(name = "Entretiens Test") {
  const t = generateStartingRoster(name);
  t.isHuman = true;
  t.week = 5;
  t.players.forEach(p => { p.form = 60; });
  return t;
}
const ok = msg => console.log("✅ " + msg);

// 1) Recommandations tirées de la situation réelle.
(function () {
  const t = team();
  const frustrated = t.players[t.players.length - 1];
  frustrated.form = 30;
  frustrated.matchLog = [1, 2, 3].map(i => ({ week: 4, min: 3, starter: false }));
  const rec = V.recommendTalks(t, { now: T0 });
  const r = rec.list.find(x => String(x.id) === String(frustrated.id));
  assert.ok(r, "le joueur frustré est recommandé");
  assert.strictEqual(r.topic, "intervention");
  assert.ok(/frustr|malheur|mitig/i.test(r.why), r.why);
  assert.strictEqual(rec.quota.left, V.TALKS_PER_WEEK);
  ok("Entretien recommandé à partir de la situation (frustré → intervention), quota plein.");
})();

// 2) Un entretien : choix, réaction selon la personnalité, mémoire, quota, délai.
(function () {
  const t = team();
  const p = t.players[t.players.length - 1];
  p.form = 30; p.matchLog = [{ week: 4, min: 2 }, { week: 4, min: 4 }];
  p.attrs.determination = 95; p.attrs.focus = 80;
  const opts = V.talkOptions(t, p.id, "intervention", { now: T0 });
  assert.ok(opts.open && opts.choices.length >= 4, "ouverture + 4 choix");
  assert.deepStrictEqual(opts.choices.slice(0, 4).map(c => c.letter), ["A", "B", "C", "D"]);
  const res = V.talk(t, p.id, "intervention", "objective", { now: T0 });
  assert.ok(res.ok, JSON.stringify(res));
  assert.strictEqual(res.out, "pos", "joueur très déterminé : l'objectif passe");
  assert.ok(res.form.after > res.form.before && res.trust.after > res.trust.before, "moral et confiance ↑");
  const c = t.locker.coach;
  assert.strictEqual(c.talks[0].topic, "intervention");
  const again = V.talk(t, p.id, "intervention", "reassure", { now: T0 + DAY });
  assert.ok(!again.ok && again.reason === "cooldown", "délai d'environ 2 semaines par joueur");
  assert.strictEqual(V.talk(t, p.id, "leadership", "reassure", { now: T0 + 20 * DAY }).reason, "topic", "le sujet doit correspondre à la situation");
  ok("Entretien : réaction selon la personnalité, moral et confiance, historique, délai par joueur, sujet vérifié.");

  // Même choix ferme : un joueur fragile le prend mal, un joueur solide l'accepte.
  const t2 = team("Fermeté");
  const fragile = t2.players[t2.players.length - 1], solid = t2.players[t2.players.length - 2];
  [fragile, solid].forEach(x => { x.form = 33; x.matchLog = [{ week: 4, min: 3 }, { week: 4, min: 2 }]; });
  Object.assign(fragile.attrs, { composure: 10, discipline: 15 });
  Object.assign(solid.attrs, { composure: 95, discipline: 95 });
  const rf = V.talk(t2, fragile.id, "intervention", "firm", { now: T0 });
  const rs = V.talk(t2, solid.id, "intervention", "firm", { now: T0 });
  assert.strictEqual(rf.out, "neg", "fragile + fermeté = mal pris");
  assert.notStrictEqual(rs.out, "neg", "sang-froid et discipline : la fermeté passe");
  ok("La même phrase ne produit pas la même réaction (sang-froid, discipline).");
})();

// 3) Quota hebdomadaire (hors urgences).
(function () {
  const t = team("Quota");
  t.players.forEach(p => { p.form = 65; });
  let done = 0;
  for (const p of t.players) { const r = V.talk(t, p.id, "checkin", "reassure", { now: T0 + done }); if (r.ok) done++; if (done > 5) break; }
  assert.strictEqual(done, V.TALKS_PER_WEEK, "3 entretiens par semaine");
  const urgent = t.players[t.players.length - 1];
  urgent.transferRequestActive = true; urgent.form = 18;
  const u = V.talk(t, urgent.id, "intervention", "transparent", { now: T0 + 10 });
  assert.ok(u.ok, "une urgence (demande de transfert) passe hors quota");
  ok("Quota de 3 entretiens par semaine, urgences hors quota.");
})();

// 4) Promesse privée vérifiée automatiquement : non tenue → confiance ↓.
(function () {
  const t = team("Promesses");
  const p = t.players[t.players.length - 1];
  p.form = 32; p.matchLog = [{ week: 4, min: 4 }, { week: 4, min: 2 }];
  const res = V.talk(t, p.id, "intervention", "promise", { now: T0 });
  assert.ok(res.ok && res.promise && res.promise.st === "open", "promesse ouverte");
  const trustAfterPromise = V.trustOf(t, p);
  // 3 semaines sans minutes de plus.
  for (let w = 6; w <= 8; w++) { t.week = w; p.matchLog.push({ week: w, min: 3 }); V.weeklyUpdate(t, { now: T0 + (w - 5) * 7 * DAY }); }
  const pr = t.locker.coach.promises.find(x => x.id === res.promise.id);
  assert.strictEqual(pr.st, "broken", "promesse non tenue à l'échéance");
  assert.ok(V.trustOf(t, p) < trustAfterPromise - 10, "confiance en chute");
  assert.ok(V.consistency(t).broken === 1 && V.consistency(t).score < 70, "cohérence du coach ↓");
  assert.ok(t.locker.log.some(e => e.t === "promise-broken"), "journal du vestiaire");
  // Promesse tenue : minutes en hausse.
  const t2 = team("Promesse tenue");
  const q = t2.players[t2.players.length - 1];
  q.form = 32; q.matchLog = [{ week: 4, min: 4 }, { week: 4, min: 2 }];
  const r2 = V.talk(t2, q.id, "intervention", "promise", { now: T0 });
  t2.week = 6; q.matchLog.push({ week: 5, min: 22 }, { week: 6, min: 25 });
  V.weeklyUpdate(t2, { now: T0 + 7 * DAY });
  assert.strictEqual(t2.locker.coach.promises.find(x => x.id === r2.promise.id).st, "kept");
  assert.strictEqual(V.consistency(t2).kept, 1);
  ok("Promesses : vérifiées sur les vraies minutes, tenue / non tenue, cohérence du coach.");
})();

// 5) Interview de jalon : question tirée du vestiaire, réactions différenciées,
//    contradiction avec un entretien privé, promesse publique.
(function () {
  const t = team("Presse");
  const q = V.interviewQuestion(t, { now: T0 });
  assert.ok(q && q.text && q.options.length === 3, "question + 3 réponses");
  // Leader : le désigner publiquement.
  const v = V.buildView(t, { now: T0 });
  const leader = v.players.find(p => p.level === "leader");
  const target = t.players.find(p => String(p.id) === String(leader.id));
  const before = V.trustOf(t, target);
  const st = V.applyStatement(t, { kind: "leader", pid: target.id, choice: "praise" }, { milestone: "mi-saison", label: "Interview de mi-saison", now: T0 });
  assert.ok(st.ok && st.imp === "pos", "déclaration positive");
  assert.ok(V.trustOf(t, target) > before, "le joueur cité : confiance ↑");
  assert.ok(st.reactions.length >= 1, "réactions listées");
  assert.strictEqual(t.locker.coach.comms[0].q, `${target.name} est clairement notre leader.`);
  // Contradiction : privé « je compte sur toi », puis critique publique.
  const t2 = team("Contradiction");
  const x = t2.players[t2.players.length - 1];
  x.form = 32; x.matchLog = [{ week: 4, min: 3 }, { week: 4, min: 2 }];
  V.talk(t2, x.id, "intervention", "reassure", { now: T0 });
  const tr = V.trustOf(t2, x);
  const crit = V.applyStatement(t2, { kind: "frustrated", pid: x.id, choice: "criticize" }, { milestone: "mi-saison", now: T0 + 5 * DAY });
  assert.ok(crit.contradictions.length === 1, "contradiction relevée");
  assert.ok(V.trustOf(t2, x) < tr - 10, "confiance ↓ (trahison)");
  assert.strictEqual(V.consistency(t2).contra, 1);
  // Promesse publique.
  const t3 = team("Public");
  const y = t3.players[t3.players.length - 1];
  const pub = V.applyStatement(t3, { kind: "frustrated", pid: y.id, choice: "promise" }, { milestone: "fin-saison-reguliere", now: T0 });
  assert.ok(pub.promise && pub.promise.src === "public", "promesse publique, même système que les privées");
  ok("Interviews : question du vestiaire, réactions, contradiction public / privé, promesse publique.");
})();

// 6) Persistance : serializeTeam / teamFromSave gardent tout.
(function () {
  const t = team("Sauvegarde");
  const p = t.players[t.players.length - 1];
  p.form = 32; p.matchLog = [{ week: 4, min: 3 }, { week: 4, min: 2 }];
  V.talk(t, p.id, "intervention", "promise", { now: T0 });
  const back = teamFromSave(JSON.parse(JSON.stringify(serializeTeam(t))));
  const c = back.locker.coach;
  assert.ok(c && c.talks.length === 1 && c.promises.length === 1 && Object.keys(c.trust).length >= 1, "bloc coach sauvegardé");
  assert.deepStrictEqual(V.sanitizeCoach({ talks: [{ topic: "pirate", c: "x" }], trust: { a: 999 } }).trust.a, 100, "valeurs bornées");
  ok("Sauvegarde : entretiens, promesses et confiance persistés et assainis.");
})();

// 7) Vue de l'onglet.
(function () {
  const t = team("Vue");
  const v = V.coachView(t, { now: T0 });
  assert.ok(v.quota && Array.isArray(v.recommended) && v.consistency && Array.isArray(v.others), "vue complète");
  ok("Vue Entretiens : recommandations, cohérence, promesses, communication, historique.");
})();
// 8) Ancienneté : effectif de départ en 1re saison = « nouveau / 1re saison »,
//    jamais « 2e saison » (retour utilisateur 2026-10-08).
(function () {
  const t = team("Ancienneté");
  t.seasonHistory = [];
  const p = t.players[0];
  delete p.clubSinceSeason; p.historyLog = [];
  assert.strictEqual(V.talkOptions(t, p.id, "checkin", { now: T0 }).tenure, 0, "1re saison au club");
  t.seasonHistory = [{}, {}];
  assert.strictEqual(V.talkOptions(t, p.id, "checkin", { now: T0 }).tenure, 2, "3e saison : là depuis la 1re");
  p.historyLog = [{ type: "transfer", season: 3, to: t.name }];
  assert.strictEqual(V.talkOptions(t, p.id, "checkin", { now: T0 }).tenure, 0, "arrivé cette saison");
  ok("Ancienneté au club : 1re saison correcte (plus de « 2e saison » par défaut).");
})();
console.log("✅ Tous les tests des entretiens sont passés.");
