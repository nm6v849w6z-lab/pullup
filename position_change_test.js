// Poste de carte qui suit les caractéristiques (retour utilisateur
// 2026-09-30 : "Quand un joueur a son meilleur poste qui ne correspond plus
// à la réalité, il faut le changer. La seule chose qui ne doit changer qu'à
// l'intersaison est le salaire.") — voir cardPositionChangeFor /
// Team.syncCardPositions / attrsForCardPosition (engine.js, copie miroir
// dans moteurbasket3.html).
// Vérifie : hystérésis (pas d'oscillation à ±1 point), migration d'une
// sauvegarde existante (tous les clubs), génération (poste de carte =
// meilleur poste), salaire figé en cours de saison puis recalculé à
// l'intersaison au nouveau poste, feuille de match toujours valide, nouvelle
// dans le fil pour un club humain seulement.
const fs = require("fs");
const E = require("./engine.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const POS = E.POSITIONS;
const flat = v => { const o = {}; E.ATTRS.forEach(a => { o[a] = v; }); return o; };
const keys = pos => Object.keys(E.POSITION_KEY_WEIGHTS[pos]);
// Monte les caractéristiques clés de `pos` (et seulement celles qui ne sont
// pas aussi clés du poste `except`) de `delta`.
const boost = (attrs, pos, delta, except) => { keys(pos).filter(k => !except || !keys(except).includes(k)).forEach(k => { attrs[k] += delta; }); return attrs; };

// 1) Hystérésis.
{
  assert(E.POSITION_CHANGE_MARGIN === 2, "marge de changement de poste : 2 points");
  const p = { position: "Meneur", attrs: flat(30) };
  // Meilleur poste Arrière de très peu : on garde Meneur.
  boost(p.attrs, "Arrière", 2, "Meneur");
  const b1 = E.bestPosition(p);
  const r1 = E.positionRating(p, b1) - E.positionRating(p, "Meneur");
  assert(b1 !== "Meneur" && r1 > 0 && r1 < 2 && E.cardPositionChangeFor(p) === null, `meilleur poste ${b1} de ${r1.toFixed(2)} pt seulement : le poste reste Meneur`);
  boost(p.attrs, "Arrière", 10, "Meneur");
  const c = E.cardPositionChangeFor(p);
  assert(c && c.from === "Meneur" && c.to !== "Meneur" && c.ratingTo - c.ratingFrom >= 2, `écart de ${(c.ratingTo - c.ratingFrom).toFixed(2)} pts : Meneur → ${c && c.to}`);
  p.position = c.to;
  // Retour de balancier : le Meneur repasse devant, de moins de 2 points :
  // pas de retour en arrière.
  for (let i = 0; i < 40 && E.positionRating(p, "Meneur") <= E.positionRating(p, c.to); i++) boost(p.attrs, "Meneur", 1, c.to);
  const back = E.positionRating(p, "Meneur") - E.positionRating(p, c.to);
  assert(back > 0 && back < 2 && E.cardPositionChangeFor(p) === null, `Meneur repassé devant de ${back.toFixed(2)} pt : le poste reste ${c.to} (pas d'oscillation)`);
  // Égalité parfaite : poste actuel conservé.
  assert(E.cardPositionChangeFor({ position: "Pivot", attrs: flat(40) }) === null, "notes égales partout : poste de carte conservé");
}

// 2) Génération : poste de carte = meilleur poste, effectif équilibré.
{
  let n = 0, mism = 0;
  const count = {};
  for (let i = 0; i < 10; i++) {
    [E.generateTeam("Test", 0.6), E.generateTeam("Test", 1), E.generateStartingRoster("Test")].forEach(t => t.players.forEach(p => {
      n++; if (E.bestPosition(p) !== p.position) mism++;
      count[p.position] = (count[p.position] || 0) + 1;
    }));
  }
  assert(mism <= n * 0.01, `génération : poste de carte = meilleur poste (${n - mism}/${n})`);
  assert(POS.every(q => count[q] >= n / 5 - 3), "génération : toujours 3 joueurs par poste (" + POS.map(q => count[q]).join("/") + ")");
  let ym = 0;
  for (let i = 0; i < 100; i++) { const y = E.generateYouthCandidate(Date.now(), 3); if (E.bestPosition(y) !== y.position) ym++; }
  assert(ym === 0, "académie : le poste affiché d'un prospect est son meilleur poste");
}

// 3) Migration d'une sauvegarde : tous les clubs, salaire inchangé,
// nouvelle pour le club humain seulement.
{
  const lg = E.generateMultiManagerLeague(["Humains"], 1, Date.now());
  const humanIdx = lg.teams.findIndex(t => t.isHuman);
  const cpuIdx = lg.teams.findIndex(t => !t.isHuman);
  const mangle = t => { const p = t.players.find(x => x.position === "Meneur"); p.attrs = boost(flat(30), "Pivot", 25); return p; };
  const hp = mangle(lg.teams[humanIdx]), cp = mangle(lg.teams[cpuIdx]);
  const hSalary = hp.salary, hEff = hp.effectivePosition;
  lg.teams[humanIdx].setStarter("Meneur", hp.id);
  const data = JSON.parse(JSON.stringify(E.serializeLeague(lg)));
  const hRaw = data.teams[humanIdx].players.find(x => x.id === hp.id);
  if (hRaw.position !== "Meneur") throw new Error("❌ (setup) la sauvegarde devrait garder l'ancien poste Meneur");
  const lg2 = E.leagueFromSave(data);
  const h2 = lg2.teams[humanIdx], c2 = lg2.teams[cpuIdx];
  const hp2 = h2.players.find(x => x.id === hp.id), cp2 = c2.players.find(x => x.id === cp.id);
  assert(hp2.position === "Pivot" && cp2.position === "Pivot", "migration au chargement : Meneur au profil de pivot → Pivot (club humain ET club IA)");
  assert(hp2.salary === hSalary && hp2.effectivePosition === hEff, "migration : salaire et poste de calcul du salaire inchangés");
  const news = h2.feed.entries.find(e => e.key === `poschange_${hp.id}`);
  assert(news && /joue désormais Pivot \(note \d+ en P contre \d+ en M\)/.test(news.title), `nouvelle pour le manager : « ${news && news.title} »`);
  assert(!c2.feed || !c2.feed.entries.some(e => e.key && e.key.startsWith("poschange_")), "aucune nouvelle pour un club IA");
  assert(h2.lineup.starters.Meneur === hp.id, "feuille de match : il reste titulaire de sa case Meneur (cases indépendantes du poste de carte)");
  // Idempotent : un second chargement ne change plus rien.
  const lg3 = E.leagueFromSave(JSON.parse(JSON.stringify(E.serializeLeague(lg2))));
  assert(lg3.teams.every(t => t.players.every(p => E.cardPositionChangeFor(p) === null)), "second chargement : plus aucun changement dû");
  // Composition automatique (IA) : aucune case vide même sans Meneur de carte.
  c2.players.filter(p => p.position === "Meneur").forEach(p => { p.position = "Arrière"; });
  c2.autoAssignLineup();
  assert(POS.every(q => c2.lineup.starters[q] != null) && new Set(Object.values(c2.lineup.starters)).size === 5, "composition automatique : 5 titulaires distincts même sans Meneur de carte");
}

// 4) Salaire : figé en cours de saison, recalculé à l'intersaison au
// nouveau poste de carte.
{
  const lg = E.generateMultiManagerLeague(["Humains"], 1, Date.now());
  const team = lg.teams.find(t => t.isHuman);
  const p = team.players.find(x => x.position === "Meneur");
  const salaryBefore = p.salary;
  p.attrs = boost(flat(35), "Pivot", 25);
  team.trainWeek(lg.divisionLevel, Date.now(), { seasonEnd: false, seasonNo: 1 });
  assert(p.position === "Pivot" && p.salary === salaryBefore && p.effectivePosition === "Meneur", `semaine ordinaire : poste → Pivot, salaire inchangé (${salaryBefore} €)`);
  assert(team.feed.entries.some(e => e.key === `poschange_${p.id}`), "semaine ordinaire : nouvelle dans le fil du club humain");
  team.trainWeek(lg.divisionLevel, Date.now(), { seasonEnd: true, seasonNo: 1 });
  const expected = E.salaryForOverall(E.levelCoefficientFor(p.attrs, "Pivot").coefficient);
  assert(p.effectivePosition === "Pivot" && p.salary === expected, `intersaison : salaire recalculé au poste Pivot (${salaryBefore} → ${p.salary} €)`);
  // L'IA suit la même règle à son entraînement hebdomadaire, sans nouvelle.
  const cpu = lg.teams.find(t => !t.isHuman);
  const q = cpu.players.find(x => x.position === "Pivot");
  q.attrs = boost(flat(35), "Meneur", 25);
  const cpuSalary = q.salary;
  cpu.trainWeekCPU(0);
  assert(q.position === "Meneur" && q.salary === cpuSalary, "IA : poste recalé à l'entraînement hebdomadaire, salaire inchangé");
}

// 5) Copie miroir identique dans la page.
{
  const src = (text, name) => { const m = text.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`)); return m && m[0]; };
  const eng = fs.readFileSync("engine.js", "utf-8");
  ["cardPositionChangeFor", "attrsForCardPosition", "levelCoefficientFor"].forEach(f => {
    if (!src(html, f) || src(html, f) !== src(eng, f)) throw new Error(`❌ ${f} : copie miroir différente entre engine.js et moteurbasket3.html`);
  });
  const method = text => { const i = text.indexOf("  syncCardPositions(opts = null) {"); return i >= 0 && text.slice(i, text.indexOf("\n  }\n", i)); };
  assert(method(html) && method(html) === method(eng), "cardPositionChangeFor / attrsForCardPosition / Team.syncCardPositions identiques dans engine.js et moteurbasket3.html");
}

console.log("\n🏁 Changement de poste de carte vérifié.");
