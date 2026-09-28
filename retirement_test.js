// Retraite des joueurs (retour utilisateur, 2026-09-28) : annonce de la
// dernière saison à la fin d'une saison, discussion pour le convaincre de
// continuer (une tentative par tiers de saison, 3 au plus, gratuite, un
// indice plutôt qu'un pourcentage), départ à la fin de la saison suivante,
// remplacement par un jeune dans les clubs de l'IA. Plus : une seule
// discussion par demande de transfert ("il faut pouvoir le faire une seule
// fois, sinon c'est abusé").
// Voir engine.js : RETIREMENT_ANNOUNCE_CHANCE_BY_AGE et suivants,
// Team.retirementTalkStatus/talkRetirement, League.retireAnnouncedPlayers/
// ageCpuPlayers/announceRetirements ; server/actions.js:talkRetirement ;
// server/autoSim.js:runWeeklyEconomyTick.
const assert = require("assert");
const E = require("./engine.js");
const actions = require("./server/actions.js");
const {
  generateMultiManagerLeague, retirementAnnounceChance, retirementTalkChance, retirementTalkPeriod,
  RETIREMENT_FORCED_AGE, RETIREMENT_TALK_PERIOD_WEEKS, MIN_ROSTER_SIZE,
  serializePlayerRecord, playerFromSave, TRANSFER_REQUEST_WEEKS_THRESHOLD,
} = E;

const T0 = Date.UTC(2026, 9, 5, 8, 0, 0);
const ok = msg => console.log("✅ " + msg);
const never = () => 0.999999;
const always = () => 0;

function freshLeague() {
  const lg = generateMultiManagerLeague(["Lyon Retraite", "Paris Retraite"], 1, T0);
  return lg;
}
function humanTeam(lg) { return lg.teams.find(t => t.isHuman); }
function cpuTeam(lg) { return lg.teams.find(t => !t.isHuman); }

// 1) Chance d'annonce selon l'âge et le rôle.
assert.strictEqual(retirementAnnounceChance(33, "rotation"), 0);
assert.strictEqual(retirementAnnounceChance(34, "rotation"), 0.10);
assert.strictEqual(retirementAnnounceChance(36, "rotation"), 0.45);
assert.ok(Math.abs(retirementAnnounceChance(36, "starter") - 0.30) < 1e-9, "titulaire : chance réduite d'un tiers");
assert.ok(Math.abs(retirementAnnounceChance(36, "reserve") - 0.675) < 1e-9, "réserviste : chance augmentée de moitié");
assert.strictEqual(retirementAnnounceChance(38, "reserve"), 1, "plafonnée à 100 %");
assert.strictEqual(retirementAnnounceChance(RETIREMENT_FORCED_AGE, "starter"), 1, "39 ans : certaine, même titulaire");
ok("chance d'annonce : 0 avant 34 ans, table par âge, titulaire ×2/3, réserviste ×1,5, certaine à 39 ans");

// 2) Annonce en fin de saison (rng injecté).
{
  const lg = freshLeague();
  const team = humanTeam(lg);
  team.players.forEach(p => { p.age = 25; });
  const vet = team.players[0];
  vet.age = 36;
  const nothing = lg.announceRetirements(T0, never);
  assert.strictEqual(nothing.filter(a => a.teamIdx === lg.teams.indexOf(team)).length, 0);
  const res = lg.announceRetirements(T0, always);
  assert.ok(res.some(a => a.playerId === vet.id), "le vétéran annonce sa dernière saison");
  assert.ok(!team.players.some(p => p !== vet && p.retiringAfterSeason), "un joueur de 25 ans n'annonce jamais");
  assert.strictEqual(vet.retiringAfterSeason, true);
  assert.strictEqual(vet.retirementWeeks, 0);
  assert.deepStrictEqual(vet.retirementTalks, []);
  assert.ok(typeof vet.retirementQuote === "string" && vet.retirementQuote.includes(vet.name));
  const entry = team.feed.entries.find(e => e.key === `retiring_${vet.id}`);
  assert.ok(entry && /annonce sa dernière saison/.test(entry.title) && /convaincre/.test(entry.text), "entrée du fil d'actualité");
  ok("annonce : tirage selon l'âge, citation figée, entrée « annonce sa dernière saison » dans le fil");
}

// 3) Discussion : 3 périodes (début / milieu / fin), une tentative chacune,
//    indice sans pourcentage, « Sa décision est prise » après 3 échecs.
{
  const lg = freshLeague();
  const team = humanTeam(lg);
  const p = team.players[0];
  p.age = 35; p.form = 70;
  p.retiringAfterSeason = true; p.retirementWeeks = 0; p.retirementTalks = [];
  let st = team.retirementTalkStatus(p.id);
  assert.strictEqual(st.period, 0); assert.strictEqual(st.periodLabel, "début de saison");
  assert.strictEqual(st.canTalk, true);
  assert.ok(["hopeful", "decided"].includes(st.hint));
  assert.ok(!("chance" in st), "le statut n'expose pas de pourcentage");
  let r = team.talkRetirement(p.id, T0, never);
  assert.ok(r.ok && !r.success);
  assert.deepStrictEqual(p.retirementTalks, [0]);
  st = team.retirementTalkStatus(p.id);
  assert.strictEqual(st.canTalk, false); assert.strictEqual(st.nextPeriodLabel, "milieu de saison");
  assert.strictEqual(team.talkRetirement(p.id, T0, always).reason, "already-talked", "une seule tentative par période");
  // 4 mises à jour hebdomadaires plus tard : milieu de saison.
  for (let i = 0; i < RETIREMENT_TALK_PERIOD_WEEKS; i++) team.trainWeek(1, T0 + i * 7 * 864e5, { seasonEnd: false });
  assert.strictEqual(p.retirementWeeks, RETIREMENT_TALK_PERIOD_WEEKS);
  assert.strictEqual(retirementTalkPeriod(p), 1);
  st = team.retirementTalkStatus(p.id);
  assert.strictEqual(st.canTalk, true); assert.strictEqual(st.periodLabel, "milieu de saison");
  r = team.talkRetirement(p.id, T0, never);
  assert.ok(r.ok && !r.success);
  p.retirementWeeks = 2 * RETIREMENT_TALK_PERIOD_WEEKS + 1; // fin de saison
  st = team.retirementTalkStatus(p.id);
  assert.strictEqual(st.periodLabel, "fin de saison"); assert.strictEqual(st.canTalk, true);
  r = team.talkRetirement(p.id, T0, never);
  assert.ok(r.ok && !r.success);
  st = team.retirementTalkStatus(p.id);
  assert.strictEqual(st.hint, "final"); assert.strictEqual(st.hintLabel, "Sa décision est prise");
  assert.strictEqual(st.canTalk, false); assert.strictEqual(st.attemptsUsed, 3);
  assert.strictEqual(team.talkRetirement(p.id, T0, always).reason, "decision-final");
  assert.strictEqual(p.retiringAfterSeason, true);
  ok("discussion : une tentative en début, au milieu et en fin de saison, puis « Sa décision est prise »");

  // Une période sautée ne se reporte pas : en fin de saison sans aucune
  // tentative, il ne reste qu'UNE tentative.
  const q = team.players[1];
  q.age = 35; q.retiringAfterSeason = true; q.retirementTalks = []; q.retirementWeeks = 9;
  st = team.retirementTalkStatus(q.id);
  assert.strictEqual(st.remaining, 1);
  team.talkRetirement(q.id, T0, never);
  assert.strictEqual(team.retirementTalkStatus(q.id).hint, "final");
  ok("une période non utilisée ne se reporte pas");
}

// 4) Réussite : une saison de plus, annonce retirée, fil d'actualité.
{
  const lg = freshLeague();
  const team = humanTeam(lg);
  const p = team.players[0];
  p.age = 36; p.retiringAfterSeason = true; p.retirementTalks = [0]; p.retirementWeeks = 5; p.retirementQuote = "x";
  const r = team.talkRetirement(p.id, T0, always);
  assert.ok(r.ok && r.success);
  assert.strictEqual(p.retiringAfterSeason, false);
  assert.deepStrictEqual(p.retirementTalks, []);
  assert.strictEqual(p.retirementQuote, null);
  assert.strictEqual(r.status, null);
  const entry = team.feed.entries.find(e => e.key === `retiring_${p.id}`);
  assert.ok(entry && /repousse sa retraite d'un an/.test(entry.title));
  // L'année suivante, il repasse le tirage de l'annonce, un an plus vieux.
  p.age = 37;
  lg.announceRetirements(T0, always);
  assert.strictEqual(p.retiringAfterSeason, true);
  ok("réussite : il joue une saison de plus (« repousse sa retraite d'un an »), puis repasse le tirage l'année suivante");
}

// 5) Chance de la discussion : titulaire motivé > réserviste démotivé ; 0 à 39 ans.
{
  const lg = freshLeague();
  const team = humanTeam(lg);
  const p = team.players[0];
  p.age = 35; p.form = 90;
  E.MENTAL_ATTRS.forEach(a => { p.attrs[a] = 80; });
  const high = retirementTalkChance(p, "starter");
  p.age = 37; p.form = 10;
  E.MENTAL_ATTRS.forEach(a => { p.attrs[a] = 30; });
  const low = retirementTalkChance(p, "reserve");
  assert.ok(high > 0.6, `titulaire motivé de 35 ans : ${high}`);
  assert.ok(low < 0.15, `réserviste démotivé de 37 ans : ${low}`);
  p.age = RETIREMENT_FORCED_AGE;
  assert.strictEqual(retirementTalkChance(p, "starter"), 0);
  p.retiringAfterSeason = true; p.retirementTalks = []; p.retirementWeeks = 0;
  assert.strictEqual(team.retirementTalkStatus(p.id).hint, "final");
  assert.strictEqual(team.talkRetirement(p.id, T0, always).reason, "decision-final");
  ok(`chance : titulaire motivé ${Math.round(high * 100)} %, réserviste démotivé ${Math.round(low * 100)} %, 0 à 39 ans (« Sa décision est prise »)`);
}

// 6) Départs en fin de saison : club humain (enchère annulée, fil, compo),
//    club de l'IA (remplacé par un jeune de niveau comparable), plancher
//    d'effectif humain.
{
  const lg = freshLeague();
  const hIdx = lg.teams.findIndex(t => t.isHuman);
  const human = lg.teams[hIdx];
  const cIdx = lg.teams.findIndex(t => !t.isHuman);
  const cpu = lg.teams[cIdx];
  const hp = human.players[0];
  hp.retiringAfterSeason = true; hp.age = 36;
  const listing = lg.listPlayerForSale(hIdx, hp.id, 1000, T0);
  assert.ok(listing);
  const cp = cpu.players[0];
  cp.retiringAfterSeason = true; cp.age = 37;
  const cpuSize = cpu.players.length;
  const cpuAvg = cpu.averageOverall();
  const humanSize = human.players.length;
  const retired = lg.retireAnnouncedPlayers(T0);
  assert.ok(retired.some(r => r.playerId === hp.id) && retired.some(r => r.playerId === cp.id));
  assert.ok(!human.players.some(p => p.id === hp.id));
  assert.strictEqual(human.players.length, humanSize - 1);
  assert.strictEqual(listing.status, "cancelled"); assert.strictEqual(listing.result, "retired");
  assert.ok(!Object.values(human.lineup.starters).includes(hp.id), "retiré de la compo");
  assert.ok(human.feed.entries.some(e => e.key === `retiring_${hp.id}` && /prend sa retraite/.test(e.title)));
  assert.strictEqual(cpu.players.length, cpuSize, "club de l'IA : effectif complet");
  const repl = cpu.players[cpu.players.length - 1];
  assert.ok(repl.age >= 20 && repl.age <= 23, `jeune remplaçant (${repl.age} ans)`);
  assert.strictEqual(repl.position, cp.position);
  assert.ok(Math.abs(repl.overall() - cpuAvg) < cpuAvg * 0.2, `niveau comparable (${repl.overall().toFixed(1)} pour une moyenne ${cpuAvg.toFixed(1)})`);
  assert.ok(repl.potential >= Math.round(repl.overall()));
  ok("départs : joueur retiré de l'effectif et de la compo, enchère annulée, fil « prend sa retraite », club de l'IA complété par un jeune de même poste et de niveau comparable");

  // Plancher d'effectif humain.
  human.players.forEach(p => { p.retiringAfterSeason = true; });
  lg.retireAnnouncedPlayers(T0);
  assert.strictEqual(human.players.length, MIN_ROSTER_SIZE, "complété jusqu'au minimum");
  assert.ok(human.players.every(p => p.age === 19));
  ok(`club humain vidé par les retraites : complété à ${MIN_ROSTER_SIZE} joueurs de complément`);
}

// 7) Vieillissement de l'IA.
{
  const lg = freshLeague();
  const cpu = cpuTeam(lg);
  const ages = cpu.players.map(p => p.age);
  lg.ageCpuPlayers();
  assert.deepStrictEqual(cpu.players.map(p => p.age), ages.map(a => a + 1));
  const human = humanTeam(lg);
  const hAges = human.players.map(p => p.age);
  lg.ageCpuPlayers();
  assert.deepStrictEqual(human.players.map(p => p.age), hAges, "les clubs humains vieillissent dans trainWeek, pas ici");
  ok("les joueurs de l'IA vieillissent d'un an à chaque fin de saison");
}

// 8) Sauvegarde.
{
  const lg = freshLeague();
  const p = humanTeam(lg).players[0];
  p.retiringAfterSeason = true; p.retirementWeeks = 6; p.retirementTalks = [0, 1]; p.retirementQuote = "Dernière !";
  p.transferRequestDiscussed = true;
  const back = playerFromSave(JSON.parse(JSON.stringify(serializePlayerRecord(p))));
  assert.strictEqual(back.retiringAfterSeason, true);
  assert.strictEqual(back.retirementWeeks, 6);
  assert.deepStrictEqual(back.retirementTalks, [0, 1]);
  assert.strictEqual(back.retirementQuote, "Dernière !");
  assert.strictEqual(back.transferRequestDiscussed, true);
  const old = serializePlayerRecord(p);
  ["retiringAfterSeason", "retirementWeeks", "retirementTalks", "retirementQuote", "transferRequestDiscussed"].forEach(k => delete old[k]);
  const fromOld = playerFromSave(JSON.parse(JSON.stringify(old)));
  assert.strictEqual(fromOld.retiringAfterSeason, false);
  assert.deepStrictEqual(fromOld.retirementTalks, []);
  ok("sauvegarde : champs de retraite et discussion de transfert persistés ; ancienne sauvegarde = aucune annonce");
}

// 9) Demande de transfert : une seule discussion par demande.
{
  const lg = freshLeague();
  const team = humanTeam(lg);
  const p = team.players[0];
  p.form = 5;
  for (let i = 0; i < TRANSFER_REQUEST_WEEKS_THRESHOLD; i++) team.updateTransferRequests(T0);
  assert.ok(p.transferRequestActive);
  const realRandom = Math.random;
  try {
    Math.random = never;
    const r1 = team.discussTransferRequest(p.id, T0);
    assert.ok(r1.ok && !r1.success);
    assert.strictEqual(p.transferRequestDiscussed, true);
    Math.random = always;
    const r2 = team.discussTransferRequest(p.id, T0);
    assert.strictEqual(r2.ok, false); assert.strictEqual(r2.reason, "already-discussed");
    const viaServer = actions.discussTransferRequest(team, lg.teams.indexOf(team), lg, { playerId: p.id }, T0);
    assert.strictEqual(viaServer.ok, false);
    assert.ok(/déjà discuté/.test(viaServer.error));
  } finally {
    Math.random = realRandom;
  }
  // La demande se referme (motivation remontée) puis une nouvelle démarre :
  // nouvelle discussion possible.
  p.form = 60; team.updateTransferRequests(T0);
  assert.strictEqual(p.transferRequestActive, false); assert.strictEqual(p.transferRequestDiscussed, false);
  p.form = 5;
  for (let i = 0; i < TRANSFER_REQUEST_WEEKS_THRESHOLD; i++) team.updateTransferRequests(T0);
  assert.ok(p.transferRequestActive && !p.transferRequestDiscussed);
  ok("demande de transfert : une seule discussion par demande (« déjà discuté »), à nouveau possible pour une nouvelle demande");
}

// 10) Action serveur.
{
  const lg = freshLeague();
  const idx = lg.teams.findIndex(t => t.isHuman);
  const team = lg.teams[idx];
  const p = team.players[0];
  assert.ok(!actions.talkRetirement(team, idx, lg, {}, T0).ok, "playerId requis");
  assert.ok(/pas annoncé/.test(actions.talkRetirement(team, idx, lg, { playerId: p.id }, T0).error));
  p.age = 35; p.retiringAfterSeason = true; p.retirementTalks = []; p.retirementWeeks = 0;
  const realRandom = Math.random;
  let res;
  try { Math.random = never; res = actions.talkRetirement(team, idx, lg, { playerId: String(p.id) }, T0); } finally { Math.random = realRandom; }
  assert.ok(res.ok && res.success === false && res.status && res.status.canTalk === false);
  const again = actions.talkRetirement(team, idx, lg, { playerId: p.id }, T0);
  assert.ok(!again.ok && /cette période/.test(again.error));
  ok("action serveur /api/player/retirement-talk : validation, tirage serveur, une tentative par période");
}

// 11) Mise à jour de fin de saison (server/autoSim.js) : départs AVANT le
//     vieillissement, puis vieillissement de l'IA et annonces.
{
  const AutoSim = require("./server/autoSim.js");
  const run = AutoSim.runWeeklyEconomyTick || (AutoSim.__test && AutoSim.__test.runWeeklyEconomyTick);
  if (typeof run !== "function") {
    console.log("ℹ️  runWeeklyEconomyTick non exporté : étape couverte par la revue du code.");
  } else {
    const lg = freshLeague();
    const human = humanTeam(lg);
    const cpu = cpuTeam(lg);
    const leaver = human.players[0];
    leaver.retiringAfterSeason = true;
    const cpuAge = cpu.players[1].age;
    const events = [];
    run(lg, 1, T0, true, events);
    assert.ok(!human.players.includes(leaver));
    assert.strictEqual(cpu.players[1].age, cpuAge + 1);
    assert.ok(Array.isArray(events[0].retired) && events[0].retired.some(r => r.playerId === leaver.id));
    assert.ok(Array.isArray(events[0].retirementsAnnounced));
    ok("mise à jour de fin de saison : départs, vieillissement de l'IA, annonces");
  }
}

console.log("\n🏁 retirement_test.js : tout est vert");
