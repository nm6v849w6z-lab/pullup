// Rythme HEBDOMADAIRE du calendrier (retour utilisateur, 2026-09-27) :
// "les matchs de championnat [...] mardi et samedi, la coupe le jeudi",
// "matchs à 20h", "l'économie est à mettre à jour dans la nuit du dimanche
// au lundi (on paie donc le staff et les joueurs à ce moment là)",
// "l'entrainement fondamental, c'est une fois par semaine selon le temps de
// jeu", "l'entrainement collectif c'est sur les jours de repos", play-offs
// "2 matchs par semaine" (mardi/samedi, le jeudi reste à la coupe).
//
// Voir server/calendar.js (bloc "RYTHME HEBDOMADAIRE", copies identiques dans
// engine.js/moteurbasket3.html/live_2d_demo.html), League.calendarWeeklyRhythm
// et server/autoSim.js:catchUpWeeklyRhythm.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const E = require("../engine.js");
const C = require("./calendar.js");
const A = require("./autoSim.js");

const PARIS = "Europe/Paris";
function paris(ms) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: PARIS, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).reduce((o, x) => (o[x.type] = x.value, o), {});
  return { weekday: p.weekday, hm: `${p.hour}:${p.minute}` };
}

// ---------------------------------------------------------------------
// 1) Dates : mardi/samedi 20h, coupe jeudi 20h, économie lundi 6h (heure
//    unique pour tous les pays, validé 2026-09-28), y compris
//    autour du passage à l'heure d'hiver (25 octobre 2026).
// ---------------------------------------------------------------------
(function testDates() {
  const created = Date.UTC(2026, 8, 27, 9); // dimanche 27 septembre 2026
  const start = C.weeklyRhythmCalendarStartAt(created);
  const s = paris(start);
  if (s.weekday !== "Tue" || s.hm !== "20:00") throw new Error(`❌ Jour 0 attendu un mardi à 20:00, obtenu ${s.weekday} ${s.hm}.`);
  for (let r = 0; r < 24; r++) {
    const d = paris(C.weeklyRhythmScheduledTimeForChampionshipRound(start, r));
    const want = r % 2 === 0 ? "Tue" : "Sat";
    if (d.weekday !== want || d.hm !== "20:00") throw new Error(`❌ Journée ${r} : ${d.weekday} ${d.hm}, attendu ${want} 20:00.`);
  }
  for (let k = 0; k < 13; k++) {
    const d = paris(C.weeklyRhythmScheduledTimeForCupRound(start, k));
    if (d.weekday !== "Thu" || d.hm !== "20:00") throw new Error(`❌ Tour de coupe ${k} : ${d.weekday} ${d.hm}, attendu jeudi 20:00.`);
  }
  for (let k = 1; k < 14; k++) {
    const t = C.weeklyRhythmEconomyTickAt(start, k);
    const d = paris(t);
    if (d.weekday !== "Mon" || d.hm !== "06:00") throw new Error(`❌ Mise à jour économique ${k} : ${d.weekday} ${d.hm}, attendu lundi 06:00.`);
    const prevSat = C.weeklyRhythmScheduledTimeForChampionshipRound(start, 2 * k - 1);
    const nextTue = C.weeklyRhythmScheduledTimeForChampionshipRound(start, 2 * k);
    if (!(prevSat < t && t < nextTue)) throw new Error(`❌ La mise à jour ${k} doit tomber entre le samedi et le mardi suivant.`);
  }
  // Mardi avant 20h : le jour même ; mardi après 20h : le mardi suivant.
  const tueMorning = Date.UTC(2026, 8, 29, 8);
  if (C.weeklyRhythmCalendarStartAt(tueMorning) !== start) throw new Error("❌ Créée un mardi matin, la ligue devrait démarrer le soir même.");
  const tueLate = Date.UTC(2026, 8, 29, 19); // 21h Paris
  if (C.weeklyRhythmCalendarStartAt(tueLate) - start !== 7 * 24 * 3600 * 1000) throw new Error("❌ Créée un mardi après 20h, la ligue devrait démarrer le mardi suivant.");
  console.log("✅ Dates : mardi/samedi 20:00, coupe jeudi 20:00, économie lundi 06:00 (heure d'hiver comprise).");
})();

// ---------------------------------------------------------------------
// 2) Les copies de la règle restent identiques (engine.js, moteurbasket3.html,
//    live_2d_demo.html contre server/calendar.js).
// ---------------------------------------------------------------------
(function testCopiesIdentical() {
  const created = Date.UTC(2026, 9, 20, 12);
  const refStart = C.weeklyRhythmCalendarStartAt(created);
  const sample = (lib) => {
    const start = lib.weeklyRhythmCalendarStartAt(created);
    const out = [start];
    for (let r = 0; r < 24; r++) out.push(lib.weeklyRhythmScheduledTimeForChampionshipRound(start, r));
    for (let r = 0; r < 24; r++) out.push(lib.weeklyRhythmScheduledTimeForChampionshipRound(start, r, 18));
    for (let k = 0; k < 13; k++) out.push(lib.weeklyRhythmScheduledTimeForCupRound(start, k));
    for (let k = 1; k < 14; k++) out.push(lib.weeklyRhythmEconomyTickAt(start, k));
    return out.join(",");
  };
  const ref = sample(C);
  if (sample(E) !== ref) throw new Error("❌ engine.js et server/calendar.js divergent sur le rythme hebdomadaire.");
  // Copies HTML : on extrait le bloc des fonctions de calendrier et on l'évalue.
  for (const file of ["moteurbasket3.html", "live_2d_demo.html"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", file), "utf-8");
    const from = src.indexOf("function parisUtcOffsetMs(");
    const to = src.indexOf("function weeklyRhythmEconomyTickAt(");
    const end = src.indexOf("\n}\n", to) + 3;
    if (from < 0 || to < 0) throw new Error(`❌ ${file} : bloc calendrier introuvable.`);
    const code = src.slice(src.lastIndexOf("const CALENDAR_PARIS_TIME_ZONE", from), end);
    const ctx = {};
    vm.runInNewContext(code + "\nthis.lib = { weeklyRhythmCalendarStartAt, weeklyRhythmScheduledTimeForChampionshipRound, weeklyRhythmScheduledTimeForCupRound, weeklyRhythmEconomyTickAt };", ctx);
    if (sample(ctx.lib) !== ref) throw new Error(`❌ ${file} diverge de server/calendar.js sur le rythme hebdomadaire.`);
  }
  if (ref.split(",")[0] !== String(refStart)) throw new Error("❌ (setup) échantillon incohérent.");
  console.log("✅ Les 4 copies de la règle (serveur, moteur, page du jeu, démo) donnent exactement les mêmes dates.");
})();

// ---------------------------------------------------------------------
// 3) Une NOUVELLE ligue multi-manager est au rythme hebdomadaire ; une ligue
//    déjà sauvegardée sans le drapeau garde l'ancien rythme quotidien.
// ---------------------------------------------------------------------
(function testNewLeagueFlagAndLegacy() {
  const now = Date.UTC(2026, 8, 27, 9);
  const lg = E.generateMultiManagerLeague(["A", "B"], 1, now, C.dailyAnchoredCalendarConfig());
  if (!lg.calendarDailyAnchored || !lg.calendarWeeklyRhythm) throw new Error("❌ Une nouvelle ligue multi-manager devrait être au rythme hebdomadaire.");
  if (C.scheduledTimeForLeagueRound(lg, 1) !== C.weeklyRhythmScheduledTimeForChampionshipRound(lg.calendarStartAt, 1)) throw new Error("❌ scheduledTimeForLeagueRound devrait suivre le rythme hebdomadaire.");
  const back = E.leagueFromSave(JSON.parse(JSON.stringify(E.serializeLeague(lg))));
  if (!back.calendarWeeklyRhythm) throw new Error("❌ Le rythme hebdomadaire devrait survivre à la sauvegarde.");

  const raw = JSON.parse(JSON.stringify(E.serializeLeague(lg)));
  delete raw.calendarWeeklyRhythm; delete raw.lastEconomyTick;
  const legacy = E.leagueFromSave(raw);
  if (legacy.calendarWeeklyRhythm) throw new Error("❌ Une ligue sauvegardée avant le changement doit garder le rythme quotidien.");
  const legacyAt = C.scheduledTimeForLeagueRound(legacy, 1);
  if (legacyAt !== C.dailyAnchoredScheduledTimeForChampionshipRound(legacy.calendarStartAt, 1)) throw new Error("❌ Ligue existante : la date de la journée 1 ne doit pas bouger.");
  console.log("✅ Nouvelle ligue au rythme hebdomadaire (sauvegardé) ; ligue existante inchangée (rythme quotidien).");
})();

// ---------------------------------------------------------------------
// 4) Saison complète : ordre chronologique des événements, économie et
//    entraînement une fois par semaine (lundi), salaires payés à ce moment-là,
//    coupe les jeudis, play-offs mardi/samedi, vieillissement en fin de saison
//    régulière.
// ---------------------------------------------------------------------
(function testFullSeason() {
  const now = Date.UTC(2026, 8, 27, 9);
  const lg = E.generateMultiManagerLeague(["A", "B"], 1, now, C.dailyAnchoredCalendarConfig());
  // Contrats (2026-10-01) : longs ici (effectif conservé à la fin de saison,
  // les fins de contrat sont testées dans contracts_test.js).
  lg.teams.forEach(t => t.players.forEach(p => { p.contractUntilSeason = 99; }));
  const user = lg.teams.find(t => t.isHuman);
  user.hireTrainer(1, 800);
  // Journal des transactions plafonné à 40 lignes : on compte les paies au
  // moment où elles sont enregistrées.
  const staffPayments = [];
  const origRecord = user.recordTransaction.bind(user);
  user.recordTransaction = (label, amount) => { if (label === "Salaire du staff") staffPayments.push(amount); return origRecord(label, amount); };
  const ages0 = user.players.map(p => p.age);
  const log = [];
  let t = now;
  let agesAtChampion = null;
  for (let i = 0; i < 700 && !lg.seasonEndTickDone; i++) {
    t += 4 * 3600 * 1000;
    A.catchUpLeague(lg, t).forEach(ev => log.push({ ev, t }));
    if (lg.isPlayoffsDone() && !agesAtChampion) agesAtChampion = user.players.map(p => p.age);
  }
  if (!lg.isPlayoffsDone()) throw new Error("❌ La saison (play-offs compris) aurait dû se terminer.");
  if (!lg.seasonEndTickDone) throw new Error("❌ La mise à jour du lundi qui suit la finale aurait dû avoir lieu.");
  // Semaine d'intersaison (retour utilisateur 2026-09-28) : aucune mise à
  // jour avant le lundi suivant, qui relance une nouvelle saison (voir
  // server/new_season_test.js pour la suite).
  const nTrainBefore = log.filter(x => x.ev.type === "training").length;
  A.catchUpLeague(lg, t + 3 * 24 * 3600 * 1000).forEach(ev => log.push({ ev, t }));
  if (log.filter(x => x.ev.type === "training").length !== nTrainBefore) throw new Error("❌ Aucune mise à jour pendant la semaine d'intersaison.");

  const trainings = log.filter(x => x.ev.type === "training");
  if (!trainings.length) throw new Error("❌ Aucune mise à jour économique.");
  trainings.forEach(({ ev }, i) => {
    if (ev.week !== i + 1) throw new Error(`❌ Mises à jour attendues numérotées 1, 2, 3… (trouvé ${ev.week} en position ${i}).`);
    const at = C.weeklyRhythmEconomyTickAt(lg.calendarStartAt, ev.week);
    const d = paris(at);
    if (d.weekday !== "Mon") throw new Error("❌ La mise à jour économique doit avoir lieu le lundi.");
  });
  // Salaires : une ligne "Salaire du staff" par mise à jour du lundi, jamais ailleurs.
  const staffLines = staffPayments.length;
  if (staffLines !== trainings.length) throw new Error(`❌ ${staffLines} paies de l'entraîneur pour ${trainings.length} mises à jour du lundi.`);
  // Une mise à jour par semaine : 9 semaines de saison régulière + 2
  // semaines de play-offs (mardi/jeudi/samedi) = 11, toujours.
  if (trainings.length !== 11) throw new Error(`❌ ${trainings.length} mises à jour sur la saison, attendu 11.`);
  const last = trainings[trainings.length - 1];
  if (!last.ev.seasonEnd || trainings.slice(0, -1).some(x => x.ev.seasonEnd)) throw new Error("❌ Seule la dernière mise à jour (lundi après la finale) doit clore la saison.");
  const finalAt = log.filter(x => x.ev.type === "playoff-match").pop().t;
  if (!(last.t >= finalAt)) throw new Error("❌ La mise à jour de fin de saison doit suivre la finale.");
  if (user.week !== trainings.length + 1) throw new Error(`❌ team.week devrait compter les semaines réelles (${user.week} pour ${trainings.length} mises à jour).`);

  // Aucune mise à jour entre deux matchs d'une même semaine : chaque lundi
  // tombe entre le samedi et le mardi.
  const matches = log.filter(x => x.ev.type === "match").map(x => x.ev.round);
  if (matches.length !== lg.totalRounds) throw new Error("❌ Toutes les journées de championnat devraient être jouées une fois.");
  const cups = log.filter(x => x.ev.type === "cup-match");
  if (!cups.length || lg.cup.champion == null) throw new Error("❌ La coupe devrait être jouée jusqu'au bout.");
  const playoffs = log.filter(x => x.ev.type === "playoff-match");
  if (!playoffs.length) throw new Error("❌ Les play-offs devraient être joués.");
  playoffs.forEach(({ ev }) => {
    const d = paris(C.scheduledTimeForLeagueRound(lg, ev.round));
    if (!(d.weekday === "Tue" || d.weekday === "Thu" || d.weekday === "Sat")) throw new Error(`❌ Match de play-offs ${ev.round} un ${d.weekday}, attendu mardi, jeudi ou samedi.`);
  });
  const order = log.map(x => x.ev.type);
  const regEnd = order.indexOf("regular-season-end");
  if (regEnd < 0 || order.indexOf("playoff-match") < regEnd) throw new Error("❌ Les play-offs doivent suivre la fin de la saison régulière.");

  // Vieillissement : une seule fois, au lundi qui suit la finale (jamais
  // pendant la saison ni les play-offs).
  if (agesAtChampion.some((a, i) => ages0[i] != null && a !== ages0[i])) throw new Error("❌ Personne ne doit vieillir avant la fin des play-offs.");
  const aged = user.players.filter((p, i) => ages0[i] != null && p.age === ages0[i] + 1).length;
  if (aged !== user.players.filter((_, i) => ages0[i] != null).length) throw new Error("❌ Tous les joueurs d'origine auraient dû prendre exactement un an.");
  console.log(`✅ Saison complète : ${matches.length} journées (mar/sam), ${cups.length} tours de coupe (jeudi), ${playoffs.length} matchs de play-offs (mar/jeu/sam), ${trainings.length} mises à jour du lundi, vieillissement une fois.`);
})();

// ---------------------------------------------------------------------
// 5) Entraînement fondamental : minutes CUMULÉES sur la semaine, remises à
//    zéro à la mise à jour du lundi seulement (pas après chaque match).
// ---------------------------------------------------------------------
(function testWeeklyTrainingMinutes() {
  const now = Date.UTC(2026, 8, 27, 9);
  const lg = E.generateMultiManagerLeague(["A"], 1, now, C.dailyAnchoredCalendarConfig());
  const userIdx = lg.teams.findIndex(t => t.isHuman);
  const user = lg.teams[userIdx];
  const secs = () => user.players.reduce((s, p) => s + Object.values(p.trainingSecondsPlayedByPosition || {}).reduce((a, b) => a + b, 0), 0);
  const sat = C.weeklyRhythmScheduledTimeForChampionshipRound(lg.calendarStartAt, 1);
  A.catchUpLeague(lg, C.weeklyRhythmScheduledTimeForChampionshipRound(lg.calendarStartAt, 0) + 3 * 3600 * 1000);
  const afterTue = secs();
  A.catchUpLeague(lg, sat + 3 * 3600 * 1000);
  const afterSat = secs();
  if (!(afterTue > 0 && afterSat > afterTue)) throw new Error(`❌ Les minutes doivent s'additionner sur la semaine (mardi ${afterTue}, samedi ${afterSat}).`);
  A.catchUpLeague(lg, C.weeklyRhythmEconomyTickAt(lg.calendarStartAt, 1) + 60 * 1000);
  if (secs() !== 0) throw new Error("❌ Les compteurs de temps de jeu doivent repartir à 0 après la mise à jour du lundi.");
  if (lg.lastEconomyTick !== 1) throw new Error("❌ lastEconomyTick devrait valoir 1 après le premier lundi.");
  console.log("✅ Entraînement fondamental : minutes cumulées du mardi au samedi, remises à 0 le lundi.");
})();

// ---------------------------------------------------------------------
// 6) Bascule EN PLEINE SAISON (retour utilisateur, 2026-09-27 : "bascule en
//    pleine saison oui") : les journées jouées gardent leur date, la suite
//    passe au mardi/samedi 20h à partir du prochain mardi ; un match déjà en
//    cours de diffusion se termine à son heure d'origine.
// ---------------------------------------------------------------------
(function testMidSeasonSwitch() {
  const created = Date.UTC(2026, 8, 22, 12); // ligue lancée mercredi 23/09 10h, rythme quotidien
  for (const [label, at, expectFrom] of [
    ["avant le match du soir", Date.UTC(2026, 8, 27, 10, 40), 9],
    ["pendant le match du soir", Date.UTC(2026, 8, 27, 17, 30), 10],
  ]) {
    const lg = E.generateMultiManagerLeague(["A", "B"], 1, created, { dailyAnchored: true });
    A.catchUpLeague(lg, at);
    const past = [...Array(expectFrom).keys()].map(r => C.scheduledTimeForLeagueRound(lg, r));
    const sw = E.migrateLeagueToWeeklyRhythm(lg, at);
    if (!sw || sw.fromRound !== expectFrom) throw new Error(`❌ Bascule ${label} : la nouvelle règle devrait partir de la journée ${expectFrom + 1} (obtenu ${sw && sw.fromRound + 1}).`);
    if (E.migrateLeagueToWeeklyRhythm(lg, at) !== null) throw new Error("❌ La bascule doit être idempotente.");
    past.forEach((t, r) => { if (C.scheduledTimeForLeagueRound(lg, r) !== t) throw new Error(`❌ La journée ${r + 1} déjà programmée ne doit pas bouger.`); });
    const first = paris(C.scheduledTimeForLeagueRound(lg, expectFrom));
    if (first.weekday !== "Tue" || first.hm !== "20:00") throw new Error(`❌ Après la bascule, la journée ${expectFrom + 1} devrait être le mardi à 20:00 (obtenu ${first.weekday} ${first.hm}).`);
    const second = paris(C.scheduledTimeForLeagueRound(lg, expectFrom + 1));
    if (second.weekday !== "Sat") throw new Error("❌ La journée suivante devrait être le samedi.");
    const back = E.leagueFromSave(JSON.parse(JSON.stringify(E.serializeLeague(lg))));
    if (C.scheduledTimeForLeagueRound(back, expectFrom) !== C.scheduledTimeForLeagueRound(lg, expectFrom)) throw new Error("❌ La bascule doit survivre à la sauvegarde.");
    let t = at;
    const types = [];
    for (let i = 0; i < 600 && !lg.isPlayoffsDone(); i++) { t += 3 * 3600 * 1000; A.catchUpLeague(lg, t).forEach(e => types.push(e.type)); }
    if (!lg.isPlayoffsDone()) throw new Error("❌ La saison basculée devrait aller jusqu'au bout.");
    if (!types.includes("training")) throw new Error("❌ Après la bascule, les mises à jour du lundi devraient avoir lieu.");
  }
  // tick() du serveur bascule automatiquement une ligue quotidienne.
  const src = fs.readFileSync(path.join(__dirname, "index.js"), "utf-8");
  if (!/migrateLeagueToWeeklyRhythm\(league, now\)/.test(src)) throw new Error("❌ server/index.js:tick devrait basculer les ligues au rythme quotidien.");
  console.log("✅ Bascule en pleine saison : passé inchangé, suite le mardi 20:00 (match en cours préservé), sauvegarde et saison complète OK.");
})();

// ---------------------------------------------------------------------
// 7) Remise à 100 de la forme physique, une seule fois (retour utilisateur,
//    2026-09-27 : "peux-tu réinitialiser les formes des joueurs ?").
// ---------------------------------------------------------------------
(function testConditionResetOnce() {
  const created = Date.UTC(2026, 8, 22, 12);
  const at = Date.UTC(2026, 8, 27, 11);
  const lg = E.generateMultiManagerLeague(["A", "B"], 1, created, { dailyAnchored: true });
  A.catchUpLeague(lg, at);
  E.migrateLeagueToWeeklyRhythm(lg, at);
  const tired = lg.teams.flatMap(t => t.players).filter(p => p.condition < 100).length;
  if (!tired) throw new Error("❌ (setup) des joueurs devraient être fatigués après 9 journées.");
  const n = E.resetAllPlayerConditionsOnce(lg, "k", at);
  const all = lg.teams.flatMap(t => t.players);
  if (n !== all.length || all.some(p => p.condition !== 100 || p.conditionUpdatedAt !== at)) throw new Error("❌ Tous les joueurs devraient être remis à 100.");
  all[0].condition = 50;
  if (E.resetAllPlayerConditionsOnce(lg, "k", at + 1) !== 0 || all[0].condition !== 50) throw new Error("❌ La remise à 100 ne doit se faire qu'une fois.");
  const back = E.leagueFromSave(JSON.parse(JSON.stringify(E.serializeLeague(lg))));
  if (!back.maintenanceDone || !back.maintenanceDone.k) throw new Error("❌ Le drapeau « déjà fait » doit survivre à la sauvegarde.");
  const src = fs.readFileSync(path.join(__dirname, "index.js"), "utf-8");
  if (!src.includes('resetAllPlayerConditionsOnce(league, "conditionReset-2026-09-27", now)')) throw new Error("❌ server/index.js:tick devrait appeler la remise à 100.");
  console.log(`✅ Forme physique : ${tired} joueurs fatigués remis à 100, une seule fois (drapeau sauvegardé).`);
})();

// ---------------------------------------------------------------------
// 8) Ligue basculée EN PLEINE SAISON : team.week garde les jours du rythme
//    quotidien, mais personne ne vieillit avant le lundi qui suit la finale.
// ---------------------------------------------------------------------
(function testMigratedLeagueAgesAtSeasonEnd() {
  const created = Date.UTC(2026, 8, 22, 12);
  const at = Date.UTC(2026, 8, 27, 10, 40);
  const lg = E.generateMultiManagerLeague(["A", "B"], 1, created, { dailyAnchored: true });
  A.catchUpLeague(lg, at);
  E.migrateLeagueToWeeklyRhythm(lg, at);
  lg.teams.forEach(t => t.players.forEach(p => { p.contractUntilSeason = 99; })); // contrats longs (2026-10-01)
  const user = lg.teams.find(t => t.isHuman);
  const ages0 = user.players.map(p => p.age);
  let t = at, agedBeforeEnd = false;
  for (let i = 0; i < 700 && !lg.seasonEndTickDone; i++) {
    t += 4 * 3600 * 1000;
    A.catchUpLeague(lg, t);
    if (!lg.seasonEndTickDone && user.players.some((p, j) => ages0[j] != null && p.age !== ages0[j])) agedBeforeEnd = true;
  }
  if (agedBeforeEnd) throw new Error("❌ Ligue basculée : des joueurs ont vieilli en cours de saison.");
  if (!lg.seasonEndTickDone) throw new Error("❌ Ligue basculée : la fin de saison aurait dû être réglée.");
  if (!user.players.every((p, j) => ages0[j] == null || p.age === ages0[j] + 1)) throw new Error("❌ Ligue basculée : tout le monde doit prendre un an, une seule fois.");
  const back = E.leagueFromSave(JSON.parse(JSON.stringify(E.serializeLeague(lg))));
  if (!back.seasonEndTickDone) throw new Error("❌ seasonEndTickDone doit survivre à la sauvegarde.");
  console.log("✅ Ligue basculée en pleine saison : un an de plus, une seule fois, au lundi qui suit la finale.");
})();

// ---------------------------------------------------------------------
// 9) Entraînement collectif : uniquement les jours de repos — le jour d'un
//    match (ici la coupe du jeudi) ne compte jamais.
// ---------------------------------------------------------------------
(function testCollectiveTrainingRestDaysOnly() {
  const team = E.generateMultiManagerLeague(["A"], 1, Date.UTC(2026, 8, 27, 9), C.dailyAnchoredCalendarConfig()).teams.find(t => t.isHuman);
  const target = { category: "defense", value: Object.keys(E.DEFENSES)[1] };
  team.collectiveTraining = "tactique";
  team.trainedTactics = target;
  team.defense = target.value;
  team.updateTacticalKnowledge(Date.UTC(2026, 8, 29, 18)); // match mardi 20h
  // Règle 2026-10-01 (retour utilisateur) : le jour « Tactique » crédite la
  // connaissance dès qu'il est écoulé, selon son niveau ; le jour du match
  // (jeudi, coupe) n'est jamais crédité. (Avant : +4 par jour banqué, ajouté
  // au match.)
  team.syncCollectiveTrainingLog(Date.UTC(2026, 8, 30, 8)); // mercredi (repos)
  const beforeWed = team.tacticalKnowledge.defense[target.value];
  team.syncCollectiveTrainingLog(Date.UTC(2026, 9, 1, 8)); // jeudi matin, match de coupe à 20h : mercredi écoulé
  const afterWed = team.tacticalKnowledge.defense[target.value];
  const wedGain = Math.round(E.tacticDailyGainForLevel(beforeWed) * 10) / 10;
  if (Math.abs((afterWed - beforeWed) - Math.min(wedGain, 100 - beforeWed)) > 1e-6) throw new Error(`❌ Le mercredi (repos) doit être crédité : gain ${afterWed - beforeWed}, attendu ${wedGain}.`);
  const before = afterWed;
  // Club humain : connaissance individuelle (retour utilisateur
  // 2026-10-03), gain d'un match complet pour chaque joueur.
  const expectedGain = E.playerTacticalKnowledgeGainForStreak(1);
  team.tacticalKnowledgeStreaks.defense[target.value] = 0;
  team.players.forEach(p => { p.secondsPlayed = E.TACTICAL_FULL_GAIN_SECONDS; });
  team.updateTacticalKnowledge(Date.UTC(2026, 9, 1, 18));
  const gain = team.tacticalKnowledge.defense[target.value] - before;
  if (Math.abs(gain - Math.min(expectedGain, 100 - before)) > 1e-9) throw new Error(`❌ Le match n'ajoute que sa série : gain ${gain}, attendu ${expectedGain}.`);
  const afterMatch = team.tacticalKnowledge.defense[target.value];
  team.syncCollectiveTrainingLog(Date.UTC(2026, 9, 2, 8)); // vendredi : le jeudi (match) ne compte pas
  if (team.tacticalKnowledge.defense[target.value] !== afterMatch) throw new Error("❌ Le jour du match ne doit jamais être crédité comme un jour d'entraînement.");
  console.log("✅ Entraînement collectif : le jour du match ne compte pas, seuls les jours de repos.");
})();

// ---------------------------------------------------------------------
// 10) Play-offs mardi/jeudi/samedi (retour utilisateur, 2026-09-27) : les
//     6 matchs possibles (demies puis finale au 3e match) tiennent dans les
//     2 semaines qui suivent la saison régulière, y compris pour une ligue
//     basculée en pleine saison.
// ---------------------------------------------------------------------
(function testPlayoffDays() {
  const start = C.weeklyRhythmCalendarStartAt(Date.UTC(2026, 8, 27, 9));
  const lastReg = C.weeklyRhythmScheduledTimeForChampionshipRound(start, 17, 18);
  const want = ["Tue", "Thu", "Sat", "Tue", "Thu", "Sat"];
  const week = 7 * 24 * 3600 * 1000;
  for (let i = 0; i < 6; i++) {
    const at = C.weeklyRhythmScheduledTimeForChampionshipRound(start, 18 + i, 18);
    const d = paris(at);
    if (d.weekday !== want[i] || d.hm !== "20:00") throw new Error(`❌ Match de play-offs ${i + 1} : ${d.weekday} ${d.hm}, attendu ${want[i]} 20:00.`);
    if (!(at > lastReg)) throw new Error("❌ Les play-offs doivent suivre la saison régulière.");
  }
  const lastPo = C.weeklyRhythmScheduledTimeForChampionshipRound(start, 23, 18);
  if (lastPo > C.weeklyRhythmEconomyTickAt(start, 11)) throw new Error("❌ Le 6e match de play-offs doit précéder la 11e mise à jour du lundi.");
  if (lastPo < C.weeklyRhythmEconomyTickAt(start, 10)) throw new Error("❌ (setup) le 6e match de play-offs tombe en semaine 11.");
  // Ligue basculée à la journée 10 (fromRound impair) : play-offs du mardi qui suit la dernière journée.
  const sw = { fromRound: 9, fromCupRound: 4, anchorAt: start };
  const reg = C.dailyAnchoredScheduledTimeForChampionshipRound(0, 17, true, sw, 18);
  const po0 = C.dailyAnchoredScheduledTimeForChampionshipRound(0, 18, true, sw, 18);
  const d0 = paris(po0);
  if (!(po0 > reg) || d0.weekday !== "Tue") throw new Error(`❌ Ligue basculée : 1er match de play-offs ${d0.weekday}, attendu le mardi qui suit la saison régulière.`);
  if (po0 - reg > week) throw new Error("❌ Ligue basculée : pas de semaine vide avant les play-offs.");
  // Le serveur passe bien la première journée de play-offs.
  const lg = E.generateMultiManagerLeague(["A"], 1, Date.UTC(2026, 8, 27, 9), C.dailyAnchoredCalendarConfig());
  if (paris(C.scheduledTimeForLeagueRound(lg, lg.totalRounds + 1)).weekday !== "Thu") throw new Error("❌ scheduledTimeForLeagueRound : le 2e match de play-offs doit tomber un jeudi.");
  console.log("✅ Play-offs mardi/jeudi/samedi, 2 semaines max (ligue basculée comprise).");
})();

// ---------------------------------------------------------------------
// 11) « Récupération » uniquement les jours de repos (retour utilisateur,
//     2026-09-27) : +5 par jour de repos écoulé, une seule fois, jamais le
//     jour du match ; le taux continu reste 10/jour.
// ---------------------------------------------------------------------
(function testRecoveryRestDaysOnly() {
  const lg = E.generateMultiManagerLeague(["A"], 1, Date.UTC(2026, 8, 27, 9), C.dailyAnchoredCalendarConfig());
  const team = lg.teams.find(t => t.isHuman);
  const bonus = E.CONDITION_RECOVERY_PER_DAY_TRAINED - E.CONDITION_RECOVERY_PER_DAY;
  team.collectiveTraining = "recuperation";
  if (team.conditionRecoveryPerDay() !== E.CONDITION_RECOVERY_PER_DAY) throw new Error("❌ « Récupération » ne doit plus changer le taux continu.");
  team.players.forEach(p => { p.condition = 50; });
  team.updateTacticalKnowledge(Date.UTC(2026, 8, 29, 18)); // match mardi 20h
  team.syncCollectiveTrainingLog(Date.UTC(2026, 8, 30, 8)); // mercredi (repos, pas encore écoulé)
  if (team.players[0].condition !== 50) throw new Error("❌ Un jour de repos n'est crédité qu'une fois écoulé.");
  team.syncCollectiveTrainingLog(Date.UTC(2026, 9, 1, 8)); // jeudi matin : mercredi écoulé
  team.syncCollectiveTrainingLog(Date.UTC(2026, 9, 1, 12));
  if (team.players[0].condition !== 50 + bonus) throw new Error(`❌ Mercredi (repos) : +${bonus} une seule fois attendu (obtenu ${team.players[0].condition - 50}).`);
  const back = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(team))));
  back.syncCollectiveTrainingLog(Date.UTC(2026, 9, 1, 13));
  if (back.players[0].condition !== 50 + bonus) throw new Error("❌ Le crédit du mercredi ne doit pas être rejoué après rechargement.");
  team.resetForMatch(Date.UTC(2026, 9, 1, 18)); // coupe jeudi 20h
  team.updateTacticalKnowledge(Date.UTC(2026, 9, 1, 18));
  team.syncCollectiveTrainingLog(Date.UTC(2026, 9, 2, 8)); // vendredi : jeudi (match) écoulé
  if (team.players[0].condition !== 50 + bonus) throw new Error("❌ Le jour du match ne doit jamais être crédité.");
  // Un jour de repos non encore synchronisé est crédité au coup d'envoi.
  team.syncCollectiveTrainingLog(Date.UTC(2026, 9, 2, 20)); // vendredi soir
  team.resetForMatch(Date.UTC(2026, 9, 3, 18)); // samedi 20h, sans requête entre-temps
  if (team.players[0].condition !== 50 + 2 * bonus) throw new Error("❌ Le vendredi (repos) doit être crédité avant le coup d'envoi du samedi.");
  // Coquille d'amical : ne crédite rien aux vrais joueurs.
  const src = fs.readFileSync(path.join(__dirname, "friendlies.js"), "utf-8");
  if (!src.includes("shell.syncCollectiveTrainingLog = () => {};")) throw new Error("❌ La coquille d'amical ne doit pas tenir le journal collectif.");
  console.log(`✅ Récupération : +${bonus} par jour de repos écoulé, une fois, jamais le jour du match (taux continu ${E.CONDITION_RECOVERY_PER_DAY}/jour).`);
})();

// ---------------------------------------------------------------------
// 12) Jour d'amical (règle modifiée, retour utilisateur 2026-10-01) : pas de
//     tactique pour l'équipe ce jour-là ; récupération/physique pour les
//     joueurs NON retenus pour l'amical (avant : rien pour personne).
// ---------------------------------------------------------------------
(function testFriendlyDayIsNotRestDay() {
  const lg = E.generateMultiManagerLeague(["A"], 1, Date.UTC(2026, 8, 27, 9), C.dailyAnchoredCalendarConfig());
  const team = lg.teams.find(t => t.isHuman);
  const target = { category: "defense", value: Object.keys(E.DEFENSES)[1] };
  team.trainedTactics = target;
  team.collectiveTraining = "tactique";
  team.updateTacticalKnowledge(Date.UTC(2026, 8, 29, 18)); // match mardi
  team.syncCollectiveTrainingLog(Date.UTC(2026, 8, 30, 8)); // mercredi : amical à 15h
  const friendlyDay = E.parisCalendarDayIndex(Date.UTC(2026, 8, 30, 13));
  team.markFriendlyDay(friendlyDay, [team.players[0].id]);
  const k0 = team.tacticalKnowledge.defense[target.value];
  // Depuis le 2026-10-02 : la tactique prévue un jour d'amical devient une
  // récupération pour les joueurs non retenus (jamais de tactique ce jour-là).
  team.players.forEach(p => { p.condition = 50; });
  team.syncCollectiveTrainingLog(Date.UTC(2026, 9, 1, 8)); // jeudi
  if (team.tacticalKnowledge.defense[target.value] !== k0) throw new Error("❌ Un jour d'amical ne doit pas compter comme jour d'entraînement tactique.");
  if (team.players[0].condition !== 50) throw new Error("❌ Le joueur retenu pour l'amical ne doit pas avoir le bonus de récupération.");
  if (team.players[1].condition !== 55) throw new Error("❌ Un joueur non retenu pour l'amical doit avoir le bonus de récupération.");
  const back = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(team))));
  if (!back.isFriendlyDay(friendlyDay) || !(back.friendlyPlayersByDay[friendlyDay] || []).length) throw new Error("❌ Les jours d'amical (et leurs joueurs) doivent survivre à la sauvegarde.");
  const fsrc = fs.readFileSync(path.join(__dirname, "friendlies.js"), "utf-8");
  if (!/markFriendlyDay\(friendlyDay, shell\.players/.test(fsrc)) throw new Error("❌ server/friendlies.js doit marquer le jour d'amical (et ses joueurs) sur les vrais clubs.");
  console.log("✅ Jour d'amical : pas de tactique ; récupération seulement pour les joueurs non retenus.");
})();

// ---------------------------------------------------------------------
// 13) Connaissance tactique en amical : depuis la connaissance individuelle
//     (retour utilisateur 2026-10-03), chaque joueur apprend selon SES
//     minutes (plein gain dès 30 min) ; jamais de perte ni de séries.
// ---------------------------------------------------------------------
(function testFriendlyTacticalGainPerPlayer() {
  const lg = E.generateMultiManagerLeague(["A"], 1, Date.UTC(2026, 8, 27, 9), C.dailyAnchoredCalendarConfig());
  const team = lg.teams.find(t => t.isHuman);
  const def = team.defense;
  const other = Object.keys(E.DEFENSES).find(d => d !== def);
  team.players.forEach(p => { p.tacticalKnowledge = E.defaultTacticalKnowledgeShape(50); });
  const [a, b, c] = team.players;
  team.gainTacticalKnowledgeFromFriendly({ [a.id]: 40 * 60, [b.id]: 15 * 60 });
  const base = E.playerTacticalKnowledgeGainForStreak(1);
  const v = p => p.tacticalKnowledge.defense[def];
  if (v(a) !== 50 + base || v(b) !== 50 + base / 2 || v(c) !== 50) throw new Error(`❌ Amical : gain au prorata des minutes attendu, obtenu ${v(a)} / ${v(b)} / ${v(c)}.`);
  if (team.players.some(p => p.tacticalKnowledge.defense[other] !== 50)) throw new Error("❌ Un amical ne doit jamais faire perdre de maîtrise.");
  if (team.tacticalKnowledgeStreaks.defense[def] !== 0) throw new Error("❌ Un amical ne doit pas toucher aux séries.");
  const fsrc = fs.readFileSync(path.join(__dirname, "friendlies.js"), "utf-8");
  if (!fsrc.includes("t.gainTacticalKnowledgeFromFriendly(secs)")) throw new Error("❌ server/friendlies.js doit appliquer le gain tactique sur les vrais clubs.");
  console.log("✅ Amical : chaque joueur gagne selon ses minutes (+3 / +1,5 / 0), sans perte.");
})();

console.log("\n🏁 Tous les tests du rythme hebdomadaire sont passés.");
