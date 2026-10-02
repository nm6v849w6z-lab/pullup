// Entraînement v2 (retour utilisateur 2026-10-01, spécification validée) :
// test moteur + action serveur. Couvre : places selon l'entraîneur (0 sans
// entraîneur), aucun effet du poste, règle des 30 minutes sur la semaine,
// intensité, plafond souple, spécialités, jour « Physique », mental par les
// minutes, parrainage, gain tactique selon le niveau, règles du jour
// d'amical, bilan du lundi et conseils, migration, IA, miroir HTML.
const fs = require("fs");
const E = require("./engine.js");
const actions = require("./server/actions.js");

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const D = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 5, 10); // lundi 5 octobre 2026, 12h à Paris

// Joueur « neutre » : potentiel, âge, taille et caractéristiques fixés.
function makeTeam(level = 3, specialty = null) {
  const t = E.generateTeam("Test V2");
  t.isHuman = true;
  if (level) t.hireTrainer(level, E.TRAINER_BASE_SALARY[level], specialty || "physical");
  if (level && !specialty) t.trainer.specialty = null;
  t.players.forEach(p => { p.trainingSecondsPlayedByPosition = {}; });
  return t;
}
function setup(p, { age = 20, pot = 70, height = 200, value = 40, position = null } = {}) {
  p.age = age; p.potential = pot; p.height = height;
  E.FUNDAMENTAL_ATTRS.forEach(a => { p.attrs[a] = value; });
  if (position) p.position = position;
  p._trainProgress = {};
  E.ATTRS.forEach(a => { p._trainProgress[a] = 0; });
}
// Progrès fractionnaire total sur une caractéristique après `weeks` semaines.
function progressOf(team, p, attr, weeks, secondsPerWeek = 3600, rng = null) {
  const start = p.attrs[attr] + (p._trainProgress[attr] || 0);
  for (let w = 0; w < weeks; w++) {
    p.trainingSecondsPlayedByPosition = { [p.position]: secondsPerWeek };
    team.trainWeek(1);
  }
  return p.attrs[attr] + (p._trainProgress[attr] || 0) - start;
}
// Hasard figé (Player.trainWeek tire rand(0.5, 1.3)) pour comparer à l'identique.
function withFixedRandom(fn) {
  const real = Math.random;
  Math.random = () => 0.5;
  try { return fn(); } finally { Math.random = real; }
}

// --- 1) Places selon l'entraîneur ---------------------------------------
{
  const expected = { 0: 0, 1: 3, 2: 3, 3: 4, 4: 4, 5: 5 };
  Object.entries(expected).forEach(([lvl, n]) => {
    const t = makeTeam(Number(lvl));
    assert(t.trainingSlotsMax() === n, `entraîneur niveau ${lvl} : ${n} place(s) de plan individuel`);
  });
  const t = makeTeam(0);
  t.trainingSlots = [{ playerId: t.players[0].id, program: "threePoint" }];
  assert(t.activeTrainingSlots().length === 0, "sans entraîneur, aucun plan actif (même enregistré)");
  const p = t.players[0];
  setup(p);
  const gain = progressOf(t, p, "threePoint", 3);
  assert(gain === 0, "sans entraîneur, aucun fondamental ne progresse");
  const v = E.sanitizeTrainingSlots(t, [{ playerId: p.id, program: "threePoint" }]);
  assert(!v.ok && /entraîneur/.test(v.error), "validation : pas de plan sans entraîneur");
  const t3 = makeTeam(3);
  const tooMany = E.sanitizeTrainingSlots(t3, t3.players.slice(0, 5).map(x => ({ playerId: x.id, program: "pass" })));
  assert(!tooMany.ok, "validation : 5 plans refusés avec un entraîneur niveau 3 (4 places)");
  const dup = E.sanitizeTrainingSlots(t3, [{ playerId: t3.players[0].id, program: "pass" }, { playerId: t3.players[0].id, program: "block" }]);
  assert(!dup.ok, "validation : un joueur dans deux plans refusé");
  const bad = E.sanitizeTrainingSlots(t3, [{ playerId: t3.players[0].id, program: "nope" }]);
  assert(!bad.ok, "validation : programme inconnu refusé");
}

// --- 2) Taux de l'entraîneur inchangé, poste sans effet, 30 min --------------
{
  [[1, 1.06], [2, 1.12], [3, 1.18], [4, 1.24], [5, 1.30]].forEach(([lvl, m]) => {
    assert(Math.abs(E.trainerRateMultiplier({ level: lvl }) - m) < 1e-9, `entraîneur niveau ${lvl} : ×${m}`);
  });
  const t = makeTeam(3);
  const [a, b] = t.players;
  setup(a, { position: "Meneur" });
  setup(b, { position: "Pivot" });
  const ea = E.trainingEfficiencyFor(t, a, "inside"), eb = E.trainingEfficiencyFor(t, b, "inside");
  a.trainingSecondsPlayedByPosition = { Meneur: 1800 };
  b.trainingSecondsPlayedByPosition = { Pivot: 1800 };
  const wa = E.slotTrainingWeightsFor(a, "inside").attrWeights.inside;
  const wb = E.slotTrainingWeightsFor(b, "inside").attrWeights.inside;
  assert(Math.abs(wa - wb) < 1e-9, "même taille, même minutes : le poste ne change pas le poids d'entraînement");
  assert(ea.pct === eb.pct && !("positionEfficiency" in ea), "rendement affiché identique, sans facteur de poste");
  // Le poids d'un plan = le meilleur cas d'avant (programme pur, 1 poste, 100 %).
  const hm = E.heightMultiplierForSkill("inside", a.height);
  assert(Math.abs(wa - hm) < 1e-9, "poids = programme pur × gabarit × minutes (sans dilution)");
  [[0, 0], [900, 0.5], [1800, 1], [3600, 1]].forEach(([s, f]) => {
    assert(E.attendanceFactorForSeconds(s) === f, `${s / 60} min sur la semaine → ${f * 100} %`);
  });
  a.trainingSecondsPlayedByPosition = { Meneur: 600, Arrière: 600, Pivot: 600 };
  assert(E.playerWeekSeconds(a) === 1800 && E.slotTrainingWeightsFor(a, "inside").attrWeights.inside === hm, "minutes à n'importe quel poste : 30 min cumulées = plein rendement");
}

// --- 3) Intensité ----------------------------------------------------------
{
  const run = (intensity) => withFixedRandom(() => {
    const t = makeTeam(3);
    const p = t.players[0];
    setup(p, { age: 19, pot: 80, value: 40 });
    t.trainingSlots = [{ playerId: p.id, program: "threePoint", intensity }];
    const g = progressOf(t, p, "threePoint", 1);
    return { g, team: t };
  });
  const l = run("legere"), n = run("normale");
  const i = run("intense");
  assert(Math.abs(l.g / n.g - 0.9) < 1e-6, "Légère : −10 % de progression");
  assert(Math.abs(i.g / n.g - 1.1) < 1e-6, "Intense : +10 % de progression");
  assert(l.team.conditionRecoveryPerDay() === n.team.conditionRecoveryPerDay(), "taux de récupération du club inchangé par l'intensité");
  // Intensité choisie joueur par joueur : deux plans, deux intensités.
  {
    const t = makeTeam(3);
    const [a, b] = t.players;
    t.trainingSlots = [{ playerId: a.id, program: "pass", intensity: "intense" }, { playerId: b.id, program: "pass", intensity: "legere" }];
    assert(E.trainingIntensityOf(t, a) === "intense" && E.trainingIntensityOf(t, b) === "legere" && E.trainingIntensityOf(t, t.players[2]) === "normale", "intensité lue sur le plan de chaque joueur");
    assert(E.trainingEfficiencyFor(t, a, "pass").intensityMult === 1.1 && E.trainingEfficiencyFor(t, b, "pass").intensityMult === 0.9, "rendement : intensité propre à chaque joueur");
  }
  // Récupération jour par jour : repos +10, Légère +9, Normale +7, Intense +5.
  const DAY = 24 * 3600 * 1000;
  const real = Math.random;
  try {
    Math.random = () => 0.99; // aucune blessure
    const t = makeTeam(3);
    const [a, b, c, d] = t.players;
    t.trainingSlots = [{ playerId: a.id, program: "pass", intensity: "legere" }, { playerId: b.id, program: "pass", intensity: "normale" }, { playerId: c.id, program: "pass", intensity: "intense" }];
    [a, b, c, d].forEach(p => { p.condition = 50; });
    t.syncCollectiveTrainingLog(NOW + DAY); // mardi
    t.syncCollectiveTrainingLog(NOW + 4 * DAY); // vendredi : mardi, mercredi, jeudi écoulés
    assert(d.condition - a.condition === 3 && d.condition - b.condition === 9 && d.condition - c.condition === 15, "3 jours de repos : Légère −1/jour, Normale −3/jour, Intense −5/jour par rapport au repos complet");
    // Changer d'intensité ne vaut que pour les jours suivants.
    t.trainingSlots[0].intensity = "intense";
    t.syncCollectiveTrainingLog(NOW + 4 * DAY + 3600e3);
    assert(d.condition - a.condition === 3, "changement d'intensité : aucun effet rétroactif sur les jours déjà écoulés");
    t.syncCollectiveTrainingLog(NOW + 5 * DAY);
    assert(d.condition - a.condition === 8, "le jour suivant compte avec la nouvelle intensité");
    // Blessure : 0,3 %/jour en Intense, triplé sous 60 de forme.
    const mk = (cond) => {
      const tt = makeTeam(3);
      const p = tt.players[0];
      tt.trainingSlots = [{ playerId: p.id, program: "pass", intensity: "intense" }];
      p.condition = cond; p.conditionUpdatedAt = NOW + DAY;
      tt.syncCollectiveTrainingLog(NOW + DAY);
      Math.random = () => 0.005;
      tt.syncCollectiveTrainingLog(NOW + 2 * DAY);
      Math.random = () => 0.99;
      return { tt, p };
    };
    const fresh = mk(100), tired = mk(20);
    assert(!(fresh.p.injuryUntil > NOW), "Intense, forme haute : tirage 0,5 % au-dessus du risque de 0,3 %");
    assert(tired.p.injuryUntil > NOW && tired.tt.injuryLog[0].training === true, "Intense, forme sous 60 : risque triplé (blessure à l'entraînement au carnet)");
    tired.tt.trainWeek(1, NOW + 2 * DAY);
    assert(tired.tt.lastTrainingReport.slots[0].injured === true, "le bilan signale la blessure à l'entraînement");
    // Légère et Normale : jamais de blessure.
    const safe = makeTeam(3);
    const sp = safe.players[0];
    safe.trainingSlots = [{ playerId: sp.id, program: "pass", intensity: "normale" }];
    sp.condition = 10;
    safe.syncCollectiveTrainingLog(NOW + DAY);
    Math.random = () => 0;
    safe.syncCollectiveTrainingLog(NOW + 3 * DAY);
    assert(!(sp.injuryUntil > NOW), "Normale : aucun risque de blessure");
  } finally { Math.random = real; }
}

// --- 4) Plafond souple + bonus d'entraîneur --------------------------------
{
  assert(E.trainingProgressRoom(-1) > 0.1 && E.trainingProgressRoom(-1) < E.trainingProgressRoom(0), "au-delà du plafond, la marge diminue doucement (plus de mur ×0,12)");
  assert(Math.abs(E.trainingProgressRoom(0) - 0.12) < 1e-12 && E.trainingProgressRoom(-1e-9) > 0.1199, "pas de saut au plafond (continuité)");
  [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]].forEach(([lvl, b]) => assert(E.trainerCeilingBonus({ level: lvl }) === b, `entraîneur niveau ${lvl} : plafond +${b}`));
  // Un 18 ans à fort potentiel continue de progresser plusieurs saisons.
  const seasons = withFixedRandom(() => {
    const t = makeTeam(3);
    const p = t.players[0];
    setup(p, { age: 18, pot: 74, value: 58, height: 199 });
    t.trainingSlots = [{ playerId: p.id, program: "threePoint" }];
    const out = [];
    for (let s = 0; s < 4; s++) {
      const before = p.attrs.threePoint;
      for (let w = 0; w < E.SEASON_LENGTH_WEEKS; w++) { p.trainingSecondsPlayedByPosition = { [p.position]: 3600 }; t.trainWeek(1); }
      p.age += 1;
      out.push(p.attrs.threePoint - before);
    }
    return out;
  });
  console.log("   18 ans, potentiel 74, 3 pts, entraîneur niv. 3 — gains par saison :", seasons.join(", "));
  assert(seasons[0] < 22, "1re saison un peu plus lente qu'avant (≈ +22 avant)");
  assert(seasons[2] >= 3 && seasons[3] >= 1, "la progression reste réelle en 3e et 4e saisons (plus de plateau après 2 saisons)");
}

// --- 5) Spécialités --------------------------------------------------------
{
  assert(E.trainingProgramFamily("threePoint") === "offense" && E.trainingProgramFamily("rimAttack") === "offense", "attaque : tir, pénétration… et leurs combos");
  assert(E.trainingProgramFamily("perimeterDefense") === "defense" && E.trainingProgramFamily("rebound") === "defense", "défense : rebond, contre, défenses, interceptions et combos");
  const young = { age: 20 }, old = { age: 25 };
  assert(E.coachSpecialtyMultFor({ level: 3, specialty: "offense" }, "pass", old) === 1.15, "spécialité Attaque : +15 % sur un programme offensif");
  assert(E.coachSpecialtyMultFor({ level: 3, specialty: "offense" }, "block", old) === 1, "spécialité Attaque : rien sur un programme défensif");
  assert(E.coachSpecialtyMultFor({ level: 3, specialty: "defense" }, "allroundDef", old) === 1.15, "spécialité Défense : +15 % sur un combo défensif");
  assert(E.coachSpecialtyMultFor({ level: 3, specialty: "youth" }, "pass", young) === 1.15 && E.coachSpecialtyMultFor({ level: 3, specialty: "youth" }, "pass", old) === 1, "spécialité Jeunes : +15 % pour les 21 ans et moins");
  const lg = new E.League(Array.from({ length: 10 }, (_, i) => E.generateTeam(`É${i}`)));
  lg.coachListings = [];
  for (let i = 0; i < 20; i++) lg.generateCoachCandidate(NOW);
  assert(lg.coachListings.every(l => E.COACH_SPECIALTY_KEYS.includes(l.specialty)), "chaque entraîneur du marché a une spécialité");
  const t = lg.teams[0];
  lg._resolveCoachListing({ ...lg.coachListings[0], currentBidderIdx: 0, currentBid: 1000 }, NOW);
  assert(t.trainer && t.trainer.specialty === lg.coachListings[0].specialty, "l'entraîneur recruté garde la spécialité de son annonce");
  const fired = lg.fireTeamTrainer(0, NOW);
  assert(fired.relisted && lg.coachListings[lg.coachListings.length - 1].specialty === lg.coachListings[0].specialty, "un entraîneur congédié est remis sur le marché avec sa spécialité");
}

// --- 6) Jour « Physique », récupération, jour d'amical --------------------
{
  const t = makeTeam(3, "physical");
  const youngP = t.players[0], oldP = t.players[1], friendlyP = t.players[2];
  [youngP, oldP, friendlyP].forEach((p, i) => {
    p.age = i === 1 ? 31 : 19;
    E.PHYSICAL_ATTRS.forEach(a => { p.attrs[a] = 40; p.physicalPotential[a] = 60; });
    p._trainProgress = {};
  });
  const today = E.parisCalendarDayIndex(NOW);
  const totalPhys = p => E.PHYSICAL_ATTRS.reduce((s, a) => s + p.attrs[a] + (p._trainProgress[a] || 0), 0);
  const y0 = totalPhys(youngP), o0 = totalPhys(oldP), f0 = totalPhys(friendlyP);
  t.collectiveTraining = "physique";
  t.syncCollectiveTrainingLog(NOW);
  // Mardi : amical joué par friendlyP seulement (récupération/physique pour les autres).
  t.markFriendlyDay(today + D, [friendlyP.id]);
  t.syncCollectiveTrainingLog(NOW + 2 * D); // lundi et mardi écoulés
  const yGain = totalPhys(youngP) - y0, oGain = totalPhys(oldP) - o0, fGain = totalPhys(friendlyP) - f0;
  assert(yGain > 0 && yGain > oGain * 5, "jour Physique : petit gain physique, surtout pour les jeunes");
  assert(fGain < yGain, "jour d'amical : le joueur aligné en amical ne profite pas du physique ce jour-là");
  assert(t.collectiveWeek.days.physique === 2, "les jours Physique sont comptés pour le bilan du lundi");
  // Tactique impossible un jour d'amical, récupération pour les non-retenus.
  const t2 = makeTeam(1);
  const def = Object.keys(E.DEFENSES)[1];
  t2.collectiveTraining = "tactique";
  t2.trainedTactics = { category: "defense", value: def };
  t2.players.forEach(p => { p.condition = 50; });
  t2.syncCollectiveTrainingLog(NOW);
  t2.markFriendlyDay(today, [t2.players[0].id]);
  const before = t2.tacticalKnowledge.defense[def];
  t2.syncCollectiveTrainingLog(NOW + D);
  assert(t2.tacticalKnowledge.defense[def] === before, "jour d'amical : pas de gain tactique pour l'équipe");
  assert(t2.players[0].condition === 50 && t2.players[1].condition === 55, "jour d'amical : la tactique choisie devient une récupération (joueurs non retenus)");
  const t3 = makeTeam(1);
  t3.players.forEach(p => { p.condition = 50; });
  t3.collectiveTraining = "recuperation";
  t3.syncCollectiveTrainingLog(NOW);
  t3.markFriendlyDay(today, [t3.players[0].id]);
  t3.syncCollectiveTrainingLog(NOW + D);
  assert(t3.players[0].condition === 50 && t3.players[1].condition === 55, "jour d'amical : récupération (+5 en plus des +10) pour les joueurs non retenus seulement");
  // Gain tactique selon le niveau, effet en match ±8 %.
  const t4 = makeTeam(0);
  t4.collectiveTraining = "tactique";
  t4.trainedTactics = { category: "defense", value: def };
  t4.tacticalKnowledge.defense[def] = 40;
  t4.syncCollectiveTrainingLog(NOW);
  t4.syncCollectiveTrainingLog(NOW + D);
  assert(t4.tacticalKnowledge.defense[def] === 52, "jour Tactique à 40 : +12 (sans entraîneur aussi)");
  assert(E.tacticTierFor(54).label === "Découverte" && E.tacticTierFor(55).label === "En rodage" && E.tacticTierFor(70).label === "Maîtrisée" && E.tacticTierFor(85).label === "Signature", "paliers Découverte / En rodage / Maîtrisée / Signature");
  const k = t4.tacticalKnowledge;
  Object.keys(k).forEach(c => Object.keys(k[c]).forEach(x => { k[c][x] = 0; }));
  assert(Math.abs(t4.tacticalKnowledgeFactor() - 0.92) < 1e-9, "effet en match : −8 % à 0");
  Object.keys(k).forEach(c => Object.keys(k[c]).forEach(x => { k[c][x] = 100; }));
  assert(Math.abs(t4.tacticalKnowledgeFactor() - 1.08) < 1e-9, "effet en match : +8 % à 100");
  // Plan jour par jour : un jour futur planifié ne change pas aujourd'hui.
  const t5 = makeTeam(0);
  t5.collectiveTraining = "recuperation";
  t5.setCollectiveDay(today + 2 * D, "physique", undefined, NOW);
  assert(t5.collectiveTraining === "recuperation" && t5.collectiveDayConfig(today + 2 * D).collectiveTraining === "physique", "plan d'un jour futur sans changer le réglage du jour");
  t5.setCollectiveDay(today, "tactique", { category: "rhythm", value: Object.keys(E.RHYTHMS)[0] }, NOW);
  assert(t5.collectiveTraining === "tactique" && t5.trainedTactics.category === "rhythm", "planifier aujourd'hui devient le réglage des jours suivants non planifiés");
  t5.syncCollectiveTrainingLog(NOW);
  t5.syncCollectiveTrainingLog(NOW + 3 * D);
  const opts = t5.collectiveWeek.log.map(e => e.option);
  assert(JSON.stringify(opts) === JSON.stringify(["tactique", "tactique", "physique"]), "chaque jour écoulé suit son plan (journal de la semaine pour la bande des 7 jours)");
}

// --- 7) Mental par les minutes et parrainage --------------------------------
{
  assert(E.mentalExperienceMult(3600) === 1, "titulaire (≈ 30 min/match) : mental comme avant");
  assert(Math.abs(E.mentalExperienceMult(1200) - 0.511) < 0.01, "remplaçant (≈ 10 min/match) : environ la moitié");
  assert(E.mentalExperienceMult(0) === 0.45, "joueur inutilisé : 45 %");
  const mentalGain = (secs, mentored) => withFixedRandom(() => {
    const t = makeTeam(0);
    const [y, v] = t.players;
    y.age = 20; v.age = 31; v.position = y.position;
    E.MENTAL_ATTRS.forEach(a => { y.attrs[a] = 40; y.mentalPotential[a] = 80; });
    y._trainProgress = {};
    if (mentored) t.mentorships = [{ youngId: y.id, veteranId: v.id }];
    const start = E.MENTAL_ATTRS.reduce((s, a) => s + y.attrs[a], 0);
    y.trainingSecondsPlayedByPosition = { [y.position]: secs };
    t.trainWeek(1);
    return E.MENTAL_ATTRS.reduce((s, a) => s + y.attrs[a] + (y._trainProgress[a] || 0), 0) - start;
  });
  const starter = mentalGain(3600, false), unused = mentalGain(0, false), mentored = mentalGain(3600, true);
  assert(Math.abs(unused / starter - 0.45) < 0.01, "le mental d'un joueur inutilisé progresse à 45 % de celui d'un titulaire");
  assert(Math.abs(mentored / starter - 1.3) < 0.01, "parrainage : mental ×1,3 pour le filleul");
  const t = makeTeam(0);
  const [y, v, o] = t.players;
  y.age = 21; v.age = 30; v.position = y.position; o.age = 30; o.position = y.position === "Pivot" ? "Meneur" : "Pivot";
  assert(E.sanitizeMentorships(t, [{ youngId: y.id, veteranId: v.id }]).ok, "parrainage valide : jeune ≤ 22, vétéran ≥ 29, même poste");
  assert(!E.sanitizeMentorships(t, [{ youngId: y.id, veteranId: o.id }]).ok, "parrainage refusé : postes différents");
  v.age = 27;
  assert(!E.sanitizeMentorships(t, [{ youngId: y.id, veteranId: v.id }]).ok, "parrainage refusé : parrain trop jeune");
  assert(!E.sanitizeMentorships(t, [1, 2, 3].map(() => ({ youngId: y.id, veteranId: v.id }))).ok, "3 parrainages refusés (2 au plus)");
}

// --- 8) Bilan du lundi et conseils -----------------------------------------
{
  const t = makeTeam(3);
  const p = t.players[0];
  setup(p, { age: 22, pot: 50, value: 30 });
  p.attrs.defInside = 99; // bien au-delà du plafond : plus de progrès
  p.attrs.block = 20;     // beaucoup de marge
  t.trainingSlots = [{ playerId: p.id, program: "defInside" }];
  p.trainingSecondsPlayedByPosition = { [p.position]: 3600 };
  const r = t.trainWeek(1, NOW);
  assert(r.slots.length === 1 && r.slots[0].changes[0].attr === "defInside" && r.slots[0].delta === 0, "bilan : une ligne par joueur suivi, avant → après et écart");
  assert(r.advice.length === 1 && r.advice[0].playerId === p.id && r.advice[0].toProgram !== "defInside" && E.TRAINING_PROGRAMS[r.advice[0].toProgram].attrs.length === 1, "conseil : un autre programme simple pour le joueur qui ne progresse plus");
  assert(t.lastTrainingReport.advice.length === 1 && t.trainingHistory[t.trainingHistory.length - 1].slots.length === 1, "bilan conservé (dernier bilan + historique Premium)");
  const saved = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(t))));
  assert(saved.lastTrainingReport.slots[0].changes[0].attr === "defInside" && saved.trainingStalls[p.id], "bilan et semaines sans progrès sauvegardés");
  // Stagnation : 2 semaines sans gain → conseil même sous le plafond.
  const t2 = makeTeam(1);
  const q = t2.players[0];
  setup(q, { age: 30, pot: 60, value: 40 });
  t2.trainingStalls = { [q.id]: { program: "pass", weeks: 2 } };
  assert(!!E.trainingAdviceFor(t2, q, "pass"), "conseil après 2 semaines sans progrès sur le même programme");
  assert(E.ceilingRoomLevel(10) === "forte" && E.ceilingRoomLevel(3) === "faible" && E.ceilingRoomLevel(0) === "atteinte", "jauge de plafond : forte / faible / atteinte (marge relative)");
}

// --- 9) Migration d'une ancienne sauvegarde ---------------------------------
{
  const t = makeTeam(3, "offense");
  const data = JSON.parse(JSON.stringify(E.serializeTeam(t)));
  ["trainingSlots", "mentorships", "collectiveDayPlan", "collectiveWeek", "trainingStalls", "friendlyPlayersByDay"].forEach(k => delete data[k]);
  delete data.trainer.specialty;
  data.trainingSkill = "rebound";
  data.trainingPositions = ["Pivot"];
  const pivots = data.players.filter(p => p.position === "Pivot");
  // Pas de titulaire désigné : seules les minutes aux postes entraînés départagent.
  if (data.lineup) data.lineup.starters = {};
  pivots[pivots.length - 1].trainingSecondsPlayedByPosition = { Pivot: 2000 };
  const m = E.teamFromSave(data);
  assert(m.trainingSlots.length >= 1 && m.trainingSlots.length <= 4 && m.trainingSlots.every(s => s.program === "rebound"), "migration : places remplies avec l'ancien programme");
  assert(String(m.trainingSlots[0].playerId) === String(pivots[pivots.length - 1].id), "migration : d'abord le joueur qui a le plus joué aux postes entraînés");
  assert(E.COACH_SPECIALTY_KEYS.includes(m.trainer.specialty), "migration : l'entraîneur reçoit une spécialité");
  assert(E.teamFromSave(data).trainer.specialty === m.trainer.specialty, "spécialité de migration déterministe");
  delete data.trainer;
  assert(E.teamFromSave(data).trainingSlots.length === 0, "migration sans entraîneur : aucune place");
  assert(m.trainingSlots.every(s => s.intensity === "normale") && Array.isArray(m.mentorships), "migration : intensité normale, aucun parrainage");
}

// --- 10) IA ---------------------------------------------------------------
{
  const t = E.generateTeam("CPU");
  t.trainer = null;
  t.trainWeekCPU(0);
  assert(t.trainingSlots.length === E.TRAINING_SLOTS_BY_COACH_LEVEL[E.CPU_IMPLICIT_COACH_LEVEL], "IA sans entraîneur : entraîneur implicite (plans remplis automatiquement)");
  assert(t.trainingSlots.every(s => E.TRAINING_PROGRAMS[s.program] && E.TRAINING_PROGRAMS[s.program].attrs.length === 1), "IA : programmes simples (compétence clé la plus faible)");
  t.hireTrainer(5, 10000, "defense");
  t.trainWeekCPU(0);
  assert(t.trainingSlots.length === 5, "IA avec entraîneur niveau 5 : 5 plans");
}

// --- 11) Action serveur /api/training -----------------------------------------
{
  const lg = new E.League(Array.from({ length: 10 }, (_, i) => E.generateTeam(`É${i}`)));
  const t = lg.teams[0];
  t.isHuman = true;
  t.hireTrainer(2, 1600, "youth");
  const ok = actions.setTraining(t, 0, null, { trainingSlots: [{ playerId: t.players[0].id, program: "pass", intensity: "legere" }], collectiveTraining: "physique" }, NOW);
  assert(ok.ok && t.trainingSlots.length === 1 && t.trainingSlots[0].intensity === "legere" && t.collectiveTraining === "physique", "serveur : plans, intensité par joueur et collectif « physique » acceptés");
  assert(!actions.setTraining(t, 0, null, { trainingSlots: [{ playerId: t.players[0].id, program: "pass", intensity: "folle" }] }, NOW).ok, "serveur : intensité inconnue refusée");
  assert(!actions.setTraining(t, 0, null, { trainingSlots: t.players.slice(0, 4).map(p => ({ playerId: p.id, program: "pass" })) }, NOW).ok, "serveur : trop de plans pour le niveau de l'entraîneur refusé");
  const today = E.parisCalendarDayIndex(NOW);
  assert(actions.setTraining(t, 0, null, { day: { dayIndex: today + 2 * D, collectiveTraining: "recuperation" } }, NOW).ok && t.collectiveDayPlan[today + 2 * D].collectiveTraining === "recuperation", "serveur : plan d'un jour de la semaine accepté");
  assert(!actions.setTraining(t, 0, null, { day: { dayIndex: today - D, collectiveTraining: "physique" } }, NOW).ok, "serveur : un jour passé ne se planifie pas");
  assert(!actions.setTraining(t, 0, null, { day: { dayIndex: today + 9 * D, collectiveTraining: "physique" } }, NOW).ok, "serveur : un jour d'une autre semaine ne se planifie pas");
  const y = t.players.find(p => p.age <= 22) || t.players[1];
  y.age = 20;
  const v = t.players.find(p => p !== y);
  v.age = 32; v.position = y.position;
  assert(actions.setTraining(t, 0, null, { mentorships: [{ youngId: y.id, veteranId: v.id }] }, NOW).ok && t.mentorships.length === 1, "serveur : parrainage valide accepté");
  v.age = 25;
  assert(!actions.setTraining(t, 0, null, { mentorships: [{ youngId: y.id, veteranId: v.id }] }, NOW).ok, "serveur : parrainage invalide refusé");
}

// --- 12) Miroir engine.js ⇄ moteurbasket3.html ----------------------------------
{
  const block = src => {
    const i = src.indexOf("// ENTRAÎNEMENT V2 (retour utilisateur 2026-10-01, spécification validée)");
    const j = src.indexOf("// FIN ENTRAÎNEMENT V2");
    return i >= 0 && j > i ? src.slice(i, j) : null;
  };
  const e = block(fs.readFileSync("engine.js", "utf8")), h = block(fs.readFileSync("moteurbasket3.html", "utf8"));
  assert(e && e === h, "bloc « ENTRAÎNEMENT V2 » identique dans engine.js et moteurbasket3.html");
}

console.log("\n✅ Entraînement v2 vérifié (moteur + serveur).");
