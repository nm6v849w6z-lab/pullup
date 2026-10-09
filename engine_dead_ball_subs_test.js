// Changements de joueurs : règles réelles du basket (retours utilisateur
// 2026-10-08 « jamais à la volée » et 2026-10-09 « des changements après un
// panier marqué », puis « après un lancer franc marqué il y a un arrêt de
// jeu, le changement doit être fait avant la remise en jeu »). Un changement
// n'a lieu QUE dans une fenêtre réglementaire : faute (avant les lancers
// francs), dernier lancer franc réussi (après lui, avant la remise en jeu),
// ballon perdu hors interception (sortie, violation), temps mort, blessure,
// exclusion, pause entre deux périodes. Jamais après un panier en jeu, un
// tir manqué, un dernier lancer manqué, un rebond, une interception ni
// pendant la remise en jeu. Un changement voulu pendant le jeu attend.
const assert = require("assert");
const E = require("./engine.js");

const a = E.generateStartingRoster("Arrêts A"), b = E.generateStartingRoster("Arrêts B");

// ---------- Scénarios unitaires (MatchEngine.runSubstitutionWindow) ----------
const eng = new E.MatchEngine(a, b);
eng.simulate(); // équipes dans un état de match réel (cinq sur le terrain, banc)
const team = eng.teamA;
const key = eng.teamKey(team);
const other = eng.teamKey(eng.teamB);
const q = 2, clock = 300;
const reset = () => { for (const t of [eng.teamA, eng.teamB]) for (const p of t.players) { p.fatigue = 0; p.disqualified = false; p.injured = false; p.fouls = 0; p.returnStarterId = null; p.nextRestAt = 1e9; } };
// Un joueur du cinq qui DEMANDE à sortir (fatigue au maximum), avec un remplaçant au poste.
const wantsOut = (exclude = new Set(), tm = team) => {
  const p = tm.onCourtPlayers().find(x => !exclude.has(x.id) && tm.backupsForSlot(x.matchPosition).length && !tm.slotMinuteShares(x.matchPosition));
  assert.ok(p, "un joueur du cinq avec un remplaçant à son poste");
  p.fatigue = 999;
  return p;
};
const subsIn = evs => evs.filter(e => e.type === "substitution");
const shot = (made, extra) => ({ type: "shot", team: key, made, ...extra });

// 1. Un panier marqué ne déclenche aucun changement.
reset();
{
  const p = wantsOut();
  const evs = [shot(true)];
  const win = eng.runSubstitutionWindow(evs, 0, q, clock, false);
  assert.strictEqual(win, null, "panier marqué : pas de fenêtre");
  assert.strictEqual(subsIn(evs).length, 0, "panier marqué : aucun changement");
  assert.ok(p.onCourt, "panier marqué : le joueur fatigué reste sur le terrain");
  // Panier puis dernier lancer franc réussi (and-one déjà tiré) : idem, la
  // fenêtre de la faute est passée, pas de changement après le lancer.
  for (const tail of [[{ type: "rebound", team: other }], [{ type: "turnover", team: key, tovType: "steal" }], [shot(false)]]) {
    const ev2 = [shot(true), ...tail];
    assert.strictEqual(eng.runSubstitutionWindow(ev2, 1, q, clock, false), null, `ballon vivant (${tail[0].type}) : pas de fenêtre`);
  }
  console.log("✅ 1. Panier marqué (et tir manqué, rebond, interception) : aucun changement.");
}

// 2. Panier puis remise en jeu adverse et possession adverse : pas de changement.
reset();
{
  const p = wantsOut();
  const evs = [shot(true)];
  eng.runSubstitutionWindow(evs, 0, q, clock, false);
  // Remise en jeu après panier : la possession adverse démarre sans arrêt,
  // tir manqué + rebond défensif, puis panier : toujours ballon vivant.
  const from = evs.length;
  evs.push({ type: "shot", team: other, made: false }, { type: "rebound", team: key });
  eng.runSubstitutionWindow(evs, from, q, clock, false);
  const from2 = evs.length;
  evs.push({ type: "shot", team: other, made: true });
  eng.runSubstitutionWindow(evs, from2, q, clock, false);
  assert.strictEqual(subsIn(evs).length, 0, "remise en jeu après panier : aucun changement");
  assert.ok(p.onCourt, "le joueur fatigué attend toujours");
  // Lancers francs : dernier lancer réussi = panier + remise en jeu. Le
  // changement n'a lieu qu'à la FAUTE, avant le premier lancer (scénario 4).
  console.log("✅ 2. Panier puis remise en jeu adverse : aucun changement.");
}

// 3. Une vraie fenêtre (faute, sortie de balle, blessure) autorise le changement.
for (const stop of [{ type: "foul", team: other }, { type: "turnover", team: key, tovType: "outOfBounds" }, { type: "injury", team: other }]) {
  reset();
  const p = wantsOut();
  const evs = [shot(true), stop];
  const win = eng.runSubstitutionWindow(evs, 1, q, clock, false);
  assert.ok(win, `${stop.type} : fenêtre ouverte`);
  const s = subsIn(evs).filter(e => e.playerId === p.id);
  assert.strictEqual(s.length, 1, `${stop.type} : le joueur fatigué sort`);
  assert.ok(!p.onCourt, `${stop.type} : remplacé`);
  assert.ok(evs.indexOf(s[0]) > evs.indexOf(stop), "le changement suit l'arrêt");
}
console.log("✅ 3. Faute, ballon sorti, blessure : le changement est autorisé.");

// 4. Changement demandé pendant le jeu : il attend la prochaine fenêtre.
reset();
{
  const p = wantsOut();
  const evs = [];
  const seq = [[shot(true)], [{ type: "shot", team: other, made: false }, { type: "rebound", team: key }], [shot(false), { type: "rebound", team: other }], [{ type: "turnover", team: other, tovType: "steal" }]];
  for (const poss of seq) { const from = evs.length; evs.push(...poss); eng.runSubstitutionWindow(evs, from, q, clock, false); }
  assert.ok(p.onCourt && subsIn(evs).length === 0, "demande en attente : toujours sur le terrain après 4 possessions sans arrêt");
  // Faute sur un tir adverse → lancers francs, le DERNIER MANQUÉ (rebond,
  // ballon vivant ensuite) : la fenêtre est la faute, les changements
  // passent AVANT le premier lancer ; le tireur reste.
  const shooter = wantsOut(new Set(), eng.teamB); // il voudrait sortir aussi : il tire d'abord ses lancers
  const from = evs.length;
  const foul = { type: "shot", team: other, made: false, foulType: "shooting", score: { A: 10, B: 12 } };
  const ft = { type: "freeThrow", team: other, shooterId: shooter.id, made: 1, attempts: 2, lastMade: false, score: { A: 10, B: 13 } };
  evs.push(foul, ft);
  const win = eng.runSubstitutionWindow(evs, from, q, clock, false);
  assert.ok(win && win.locked && win.locked.has(shooter.id), "fenêtre de la faute, tireur protégé");
  const s = subsIn(evs).find(e => e.playerId === p.id);
  assert.ok(s, "la demande en attente est exécutée à la faute");
  assert.ok(evs.indexOf(s) > evs.indexOf(foul) && evs.indexOf(s) < evs.indexOf(ft), "changement entre la faute et le premier lancer franc");
  assert.strictEqual(evs[evs.length - 1], ft, "aucun changement après un dernier lancer manqué (ballon vivant)");
  assert.deepStrictEqual(s.score, foul.score, "le changement porte le score de la faute (avant les lancers)");
  assert.ok(shooter.onCourt && !subsIn(evs).some(e => e.playerId === shooter.id), "le tireur reste pour ses lancers");
  // Le tireur, lui, attend la fenêtre suivante (ballon sorti) pour souffler.
  const from2 = evs.length;
  evs.push({ type: "turnover", team: key, tovType: "outOfBounds" });
  eng.runSubstitutionWindow(evs, from2, q, clock, false);
  assert.ok(!shooter.onCourt && subsIn(evs).some(e => e.playerId === shooter.id), "le tireur sort à la fenêtre suivante");
  console.log("✅ 4. Changement demandé pendant le jeu : exécuté à la fenêtre suivante (faute, avant les lancers ; tireur après).");
}

// 4b. Dernier lancer franc RÉUSSI : ballon mort, le changement se fait après
// le lancer, AVANT la remise en jeu (le tireur peut alors sortir).
reset();
{
  const shooter = wantsOut(new Set(), eng.teamB);
  const evs = [{ type: "foul", team: key }];
  const ft = { type: "freeThrow", team: other, shooterId: shooter.id, made: 2, attempts: 2, lastMade: true };
  evs.push(ft);
  const win = eng.runSubstitutionWindow(evs, 0, q, clock, false);
  assert.ok(win && win.after, "dernier lancer réussi : fenêtre jusqu'à la remise en jeu");
  const s = subsIn(evs).find(e => e.playerId === shooter.id);
  assert.ok(s && evs.indexOf(s) > evs.indexOf(ft), "le tireur sort après son dernier lancer réussi, avant la remise en jeu");
  console.log("✅ 4b. Dernier lancer franc réussi : changement après le lancer, avant la remise en jeu.");
}

// 4c. Série de deux lancers (un événement par lancer) : le changement entre
// ENTRE les deux lancers ; le tireur reste pour le second.
reset();
{
  const p = wantsOut();
  const shooter = wantsOut(new Set(), eng.teamB);
  const ft1 = { type: "freeThrow", team: other, shooterId: shooter.id, made: 0, attempts: 1, attempt: 1, of: 2, lastMade: false, score: { A: 8, B: 9 } };
  const ft2 = { type: "freeThrow", team: other, shooterId: shooter.id, made: 1, attempts: 1, attempt: 2, of: 2, lastMade: true, score: { A: 8, B: 10 } };
  const evs = [{ type: "shot", team: other, made: false, foulType: "shooting", score: { A: 8, B: 9 } }, ft1, ft2];
  const win = eng.runSubstitutionWindow(evs, 0, q, clock, false);
  assert.ok(win, "fenêtre de la faute");
  const s = subsIn(evs).find(e => e.playerId === p.id);
  assert.ok(s && evs.indexOf(s) > evs.indexOf(ft1) && evs.indexOf(s) < evs.indexOf(ft2), "changement entre le 1er et le 2e lancer");
  assert.deepStrictEqual(s.score, ft1.score, "score après le 1er lancer");
  const out = subsIn(evs).find(e => e.playerId === shooter.id);
  assert.ok(out && evs.indexOf(out) > evs.indexOf(ft2), "le tireur tire ses deux lancers, puis peut sortir (dernier réussi)");
  console.log("✅ 4c. Deux lancers : changement entre les deux lancers, tireur protégé jusqu'au dernier.");
}

// 5. Temps mort (même après un panier encaissé) : changements autorisés.
reset();
{
  const p = wantsOut();
  const evs = [shot(true), { type: "timeout", team: key }];
  assert.ok(eng.runSubstitutionWindow(evs, 0, q, clock, true), "temps mort : fenêtre");
  assert.ok(!p.onCourt && subsIn(evs).some(e => e.playerId === p.id), "temps mort : changement effectué");
  assert.ok(evs.indexOf(subsIn(evs)[0]) > 1, "changement pendant le temps mort, après son annonce");
  console.log("✅ 5a. Temps mort : changement autorisé.");
}

// ---------- Matchs simulés : aucun changement hors fenêtre ----------
const STOPS = new Set(["foul", "technicalFoul", "unsportsmanlikeFoul", "foulOut", "technicalEjection", "injury", "timeout", "quarterStart"]);
const isStop = e => e && (STOPS.has(e.type) || e.foulType || (e.type === "turnover" && e.tovType !== "steal"));
let subs = 0, atQuarter = 0, atTimeout = 0, beforeFt = 0, afterFt = 0, between = 0, ftEvents = 0;
const games = 30;
const bad = [];
for (let g = 0; g < games; g++) {
  const r = new E.MatchEngine(a, b).simulate();
  const ev = r.events || r.log || [];
  for (let i = 0; i < ev.length; i++) {
    if (ev[i].type === "freeThrow") {
      ftEvents++;
      if (ev[i].attempts !== 1 || !(ev[i].made === 0 || ev[i].made === 1) || !(ev[i].attempt >= 1 && ev[i].attempt <= ev[i].of)) bad.push({ before: "lancer mal formé", text: ev[i].text });
    }
    if (ev[i].type !== "substitution" && ev[i].type !== "shortHanded") continue;
    if (ev[i].type === "substitution") subs++;
    let j = i - 1;
    while (j >= 0 && (ev[j].type === "substitution" || ev[j].type === "shortHanded")) j--;
    let k = i + 1;
    while (k < ev.length && (ev[k].type === "substitution" || ev[k].type === "shortHanded")) k++;
    const prev = ev[j];
    if (ev[i].type === "substitution") {
      if (prev && prev.type === "quarterStart") atQuarter++;
      if (prev && prev.type === "timeout") atTimeout++;
      if (ev[k] && ev[k].type === "freeThrow") beforeFt++;
    }
    // Jamais après un panier en jeu, un tir manqué, un rebond, une
    // interception ni un dernier lancer franc manqué.
    const betweenFt = prev && prev.type === "freeThrow" && ev[k] && ev[k].type === "freeThrow" && ev[k].shooterId === prev.shooterId && ev[k].attempt === prev.attempt + 1;
    if (ev[i].type === "substitution" && betweenFt) between++;
    else if (prev && prev.type === "freeThrow" && ev[i].type === "substitution") afterFt++;
    // Lancers d'une faute technique / antisportive : ballon rendu en touche,
    // arrêt de jeu même si le dernier lancer est manqué.
    let f = j; while (f >= 0 && ["freeThrow", "substitution", "shortHanded"].includes(ev[f].type)) f--;
    const techFt = prev && prev.type === "freeThrow" && ev[f] && (ev[f].type === "technicalFoul" || ev[f].type === "unsportsmanlikeFoul");
    if (!(isStop(prev) || betweenFt || techFt || (prev && prev.type === "freeThrow" && prev.lastMade)) || (prev.type === "shot" && !prev.foulType)) bad.push({ stop: ev[f] && ev[f].type, before: prev && prev.type, tov: prev && prev.tovType, made: prev && prev.made, text: ev[i].text });
  }
}
assert.strictEqual(bad.length, 0, `changements hors fenêtre : ${JSON.stringify(bad.slice(0, 3))}`);
console.log(`✅ ${subs} changements sur ${games} matchs simulés, tous dans une fenêtre réglementaire ; aucun après un panier en jeu ni un dernier lancer manqué.`);
assert.ok(atQuarter > 0, "5b. des changements entre les périodes");
assert.ok(atTimeout > 0, "5c. des changements pendant les temps morts");
assert.ok(beforeFt > 0, "des changements à la faute, avant les lancers francs");
assert.ok(afterFt > 0, "des changements après un dernier lancer réussi");
assert.ok(between > 0, "des changements entre deux lancers francs");
console.log(`✅ 5. Fenêtres conservées : ${atQuarter} entre deux périodes, ${atTimeout} en temps mort, ${beforeFt} à la faute (avant ou entre les lancers, dont ${between} entre deux lancers), ${afterFt} après un dernier lancer réussi ; ${ftEvents} lancers, un événement chacun.`);
assert.ok(subs / games >= 20, `la rotation doit rester vivante (≥ 20 changements par match), obtenu ${(subs / games).toFixed(1)}`);
console.log(`✅ Rotation conservée : ${(subs / games).toFixed(1)} changements par match en moyenne.`);
