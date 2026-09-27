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
// 1) Dates : mardi/samedi 20h, coupe jeudi 20h, économie lundi 0h, y compris
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
    if (d.weekday !== "Mon" || d.hm !== "00:00") throw new Error(`❌ Mise à jour économique ${k} : ${d.weekday} ${d.hm}, attendu lundi 00:00.`);
    const prevSat = C.weeklyRhythmScheduledTimeForChampionshipRound(start, 2 * k - 1);
    const nextTue = C.weeklyRhythmScheduledTimeForChampionshipRound(start, 2 * k);
    if (!(prevSat < t && t < nextTue)) throw new Error(`❌ La mise à jour ${k} doit tomber entre le samedi et le mardi suivant.`);
  }
  // Mardi avant 20h : le jour même ; mardi après 20h : le mardi suivant.
  const tueMorning = Date.UTC(2026, 8, 29, 8);
  if (C.weeklyRhythmCalendarStartAt(tueMorning) !== start) throw new Error("❌ Créée un mardi matin, la ligue devrait démarrer le soir même.");
  const tueLate = Date.UTC(2026, 8, 29, 19); // 21h Paris
  if (C.weeklyRhythmCalendarStartAt(tueLate) - start !== 7 * 24 * 3600 * 1000) throw new Error("❌ Créée un mardi après 20h, la ligue devrait démarrer le mardi suivant.");
  console.log("✅ Dates : mardi/samedi 20:00, coupe jeudi 20:00, économie lundi 00:00 (heure d'hiver comprise).");
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
  for (let i = 0; i < 600 && !lg.isPlayoffsDone(); i++) {
    t += 4 * 3600 * 1000;
    A.catchUpLeague(lg, t).forEach(ev => log.push({ ev, t }));
  }
  if (!lg.isPlayoffsDone()) throw new Error("❌ La saison (play-offs compris) aurait dû se terminer.");

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
  // Au plus une mise à jour par semaine : 9 semaines de saison régulière + play-offs.
  if (trainings.length < 9 || trainings.length > 12) throw new Error(`❌ ${trainings.length} mises à jour sur la saison, attendu entre 9 et 12.`);
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
    if (!(d.weekday === "Tue" || d.weekday === "Sat")) throw new Error(`❌ Match de play-offs ${ev.round} un ${d.weekday}, attendu mardi ou samedi.`);
  });
  const order = log.map(x => x.ev.type);
  const regEnd = order.indexOf("regular-season-end");
  if (regEnd < 0 || order.indexOf("playoff-match") < regEnd) throw new Error("❌ Les play-offs doivent suivre la fin de la saison régulière.");

  // Vieillissement : une seule fois, à la 9e mise à jour (lundi qui suit la
  // dernière journée de saison régulière, semaine 10).
  const aged = user.players.filter((p, i) => ages0[i] != null && p.age === ages0[i] + 1).length;
  if (aged !== user.players.filter((_, i) => ages0[i] != null).length) throw new Error("❌ Tous les joueurs d'origine auraient dû prendre exactement un an.");
  console.log(`✅ Saison complète : ${matches.length} journées (mar/sam), ${cups.length} tours de coupe (jeudi), ${playoffs.length} matchs de play-offs (mar/sam), ${trainings.length} mises à jour du lundi, vieillissement une fois.`);
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

console.log("\n🏁 Tous les tests du rythme hebdomadaire sont passés.");
