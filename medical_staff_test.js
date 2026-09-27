// Staff médical (médecin + kiné) et taille des marchés de staff — retours
// utilisateur du 2026-09-27 :
// - "le médecin, qui réduit la durée des blessures, le kiné qui améliore la
//   récupération et le risque de blessure" ; "pas de spécialité pour le
//   médecin" ; "le kiné doit pouvoir suivre tout le monde".
// - "les staffs ont le salaire qui augmentent régulièrement. il faut les
//   acheter au enchère" (même marché que les 3 autres rôles).
// - "le nombre de staff sur le marché [...] croissant en fonction du nombre
//   de manager (pour tous les staffs) [...] on fait tjrs x2 du nombre de
//   managers pour le moment".
//
// Voir engine.js : STAFF_MARKET_LISTINGS_PER_MANAGER/staffMarketMinOpenListingsFor,
// MEDICAL_STAFF_ROLES, Team.doctor/physio (+ doctorInjuryDurationMult/
// physioInjuryRiskMult/physioRecoveryBonus), League.refreshMedicalMarket/
// placeMedicalBid/fireTeamMedicalStaff, rollInjury(now, durationMult),
// MatchEngine.applyFatigue. Côté serveur : server/actions.js
// (bidOnDoctorListing/fireDoctor/bidOnPhysioListing/firePhysio). Côté
// navigateur : STAFF_ROLES (moteurbasket3.html), couvert via jsdom en fin de
// fichier.
const fs = require("fs");
const E = require("./engine.js");
const actions = require("./server/actions.js");
const {
  generateTeam, generateLeague, serializeTeam, teamFromSave, serializeLeague, leagueFromSave,
  rollInjury, INJURY_TYPES, CONDITION_DAY_MS, MatchEngine, trainerWeeklySalary,
  TRAINER_BASE_SALARY, COACH_AUCTION_DURATION_MS, COACH_MARKET_GENERATE_CHECK_INTERVAL_MS,
  STAFF_MARKET_LISTINGS_PER_MANAGER, MEDICAL_STAFF_ROLES,
  DOCTOR_INJURY_DURATION_REDUCTION_BY_LEVEL, PHYSIO_RECOVERY_BONUS_BY_LEVEL, PHYSIO_INJURY_RISK_MULT_BY_LEVEL,
  CONDITION_RECOVERY_PER_DAY, CONDITION_RECOVERY_PER_DAY_TRAINED,
} = E;

function freshLeague(budget = 5000000) {
  const user = generateTeam("User", 1.0);
  user.budget = budget;
  const lg = generateLeague(user, 1);
  lg.teams[0].budget = budget;
  return lg;
}
function openCount(list) { return list.filter(l => l.status === "open").length; }

// ---------------------------------------------------------------------
// 1) Taille des marchés : 2 candidats ouverts par manager humain, pour les
//    CINQ marchés de staff.
// ---------------------------------------------------------------------
(function testMarketFloorScalesWithManagers() {
  if (STAFF_MARKET_LISTINGS_PER_MANAGER !== 2) throw new Error("❌ Le plancher doit être de 2 candidats par manager.");
  const markets = [
    ["coachListings", (lg, now) => lg.refreshCoachMarket(now)],
    ["analystListings", (lg, now) => lg.refreshAnalystMarket(now)],
    ["recruiterListings", (lg, now) => lg.refreshRecruiterMarket(now)],
    ["doctorListings", (lg, now) => lg.refreshDoctorMarket(now)],
    ["physioListings", (lg, now) => lg.refreshPhysioMarket(now)],
  ];
  for (const humans of [1, 4, 7]) {
    const lg = freshLeague();
    lg.teams.forEach((t, i) => { t.isHuman = i < humans; });
    const now = Date.now();
    for (const [key, refresh] of markets) {
      refresh(lg, now);
      const n = openCount(lg[key]);
      if (n !== 2 * humans) throw new Error(`❌ ${key} : ${n} candidats ouverts avec ${humans} manager(s), attendu ${2 * humans}.`);
    }
  }
  // Aucun humain (ligue de test purement CPU) : on compte quand même 1 manager.
  const lg = freshLeague();
  lg.teams.forEach(t => { t.isHuman = false; });
  if (lg.staffMarketMinOpenListings() !== 2) throw new Error("❌ Sans manager humain, le plancher devrait retomber à 2.");
  console.log("✅ Les 5 marchés de staff gardent 2 candidats ouverts par manager humain (1, 4 et 7 managers testés).");
})();

// ---------------------------------------------------------------------
// 2) Enchère → embauche, salaire croissant, congédiement relisté à -30 %.
// ---------------------------------------------------------------------
for (const role of ["doctor", "physio"]) {
  const listKey = MEDICAL_STAFF_ROLES[role].listKey;
  const lg = freshLeague();
  const now = Date.now();
  lg.refreshMedicalMarket(role, now);
  const listing = lg[listKey].find(l => l.status === "open");
  const bid = lg.placeMedicalBid(role, listing.id, 0, listing.startPrice + 500, now);
  if (!bid.ok) throw new Error(`❌ ${role} : l'enchère devrait être acceptée (${bid.reason}).`);
  const tooLow = lg.placeMedicalBid(role, listing.id, 0, listing.startPrice, now);
  if (tooLow.ok || tooLow.reason !== "too-low") throw new Error(`❌ ${role} : une surenchère trop basse devrait être refusée.`);
  if (lg.placeMedicalBid("dentist", listing.id, 0, 99999, now).reason !== "invalid-role") throw new Error("❌ Un rôle inconnu devrait être refusé.");

  // Aucune équipe CPU ne passe devant (enchère déjà au-dessus de ce qu'elles veulent payer).
  lg.teams.forEach(t => { if (!t.isHuman) t[role] = { level: 5, weeksEmployed: 0, baseSalary: 1 }; });
  lg.refreshMedicalMarket(role, listing.closesAt + 1);
  const user = lg.teams[0];
  if (listing.result !== "sold" || !user[role] || user[role].level !== listing.level || user[role].baseSalary !== listing.startPrice + 500) {
    throw new Error(`❌ ${role} : le gagnant de l'enchère devrait être embauché avec sa mise comme salaire de départ (${JSON.stringify(user[role])}).`);
  }

  // Salaire payé dans trainWeek, ligne séparée, puis croissance hebdomadaire.
  const label = MEDICAL_STAFF_ROLES[role].txLabel;
  const salaryBefore = user.medicalStaffSalary(role);
  user.trainWeek(listing.closesAt + 2);
  const tx = (user.transactions || []).find(t => t.label === label);
  if (!tx || tx.amount !== -salaryBefore) throw new Error(`❌ ${role} : la ligne "${label}" devrait débiter ${salaryBefore} (trouvé ${tx && tx.amount}).`);
  if (user[role].weeksEmployed !== 1) throw new Error(`❌ ${role} : weeksEmployed devrait passer à 1 après une paie.`);
  const expected = trainerWeeklySalary(user[role].level, 1, user[role].baseSalary);
  if (user.medicalStaffSalary(role) !== expected || expected <= salaryBefore) throw new Error(`❌ ${role} : le salaire devrait augmenter après une semaine.`);

  // Congédiement : poste vacant, relisté à 70 % du salaire atteint.
  const current = user.medicalStaffSalary(role);
  const before = lg[listKey].length;
  const fired = lg.fireTeamMedicalStaff(role, 0, listing.closesAt + 3);
  const relisted = lg[listKey][lg[listKey].length - 1];
  if (!fired.ok || !fired.relisted || user[role] !== null || lg[listKey].length !== before + 1 || relisted.startPrice !== Math.round(current * 0.7)) {
    throw new Error(`❌ ${role} : le congédiement devrait vider le poste et relister à -30 %.`);
  }
  const again = lg.fireTeamMedicalStaff(role, 0, listing.closesAt + 4);
  if (!again.ok || again.relisted) throw new Error(`❌ ${role} : congédier un poste vide ne devrait rien relister.`);
  console.log(`✅ ${role} : enchère, embauche (mise = salaire de départ), paie "${label}" croissante, congédiement relisté à -30 %.`);
}

// ---------------------------------------------------------------------
// 3) Les équipes CPU enchérissent sur le staff médical comme sur les autres
//    rôles (si elles n'ont personne ou moins bien).
// ---------------------------------------------------------------------
(function testCpuBids() {
  const lg = freshLeague();
  const t0 = Date.now();
  lg.refreshMedicalMarket("physio", t0);
  const orig = Math.random;
  Math.random = () => 0.01; // passe toujours le tirage COACH_CPU_BID_CHANCE
  try { lg.refreshMedicalMarket("physio", t0 + COACH_MARKET_GENERATE_CHECK_INTERVAL_MS + 1); } finally { Math.random = orig; }
  const withCpuBid = lg.physioListings.filter(l => l.currentBidderIdx != null && !lg.teams[l.currentBidderIdx].isHuman);
  if (!withCpuBid.length) throw new Error("❌ Les équipes CPU devraient enchérir sur les kinés.");
  console.log("✅ Les équipes CPU enchérissent sur le marché des kinés.");
})();

// ---------------------------------------------------------------------
// 4) Médecin : rollInjury réduit la durée, jamais sous 1 jour.
// ---------------------------------------------------------------------
(function testRollInjuryDurationMult() {
  const T0 = Date.UTC(2026, 8, 27);
  for (let i = 0; i < 500; i++) {
    const r = rollInjury(T0, 0.65);
    const type = INJURY_TYPES.find(t => t.label === r.injuryType);
    const days = (r.injuryUntil - T0) / CONDITION_DAY_MS;
    if (days < Math.max(1, Math.round(type.minDays * 0.65)) || days > Math.round(type.maxDays * 0.65)) {
      throw new Error(`❌ Durée réduite hors plage pour ${type.label} : ${days} j.`);
    }
    const tiny = rollInjury(T0, 0.01);
    if ((tiny.injuryUntil - T0) / CONDITION_DAY_MS !== 1) throw new Error("❌ Une blessure dure toujours au moins 1 jour.");
  }
  const team = generateTeam("Doc", 1.0);
  if (team.doctorInjuryDurationMult() !== 1) throw new Error("❌ Sans médecin, aucune réduction.");
  for (let lv = 1; lv <= 5; lv++) {
    team.hireDoctor(lv, 1000);
    const want = 1 - DOCTOR_INJURY_DURATION_REDUCTION_BY_LEVEL[lv];
    if (Math.abs(team.doctorInjuryDurationMult() - want) > 1e-9) throw new Error(`❌ Médecin niveau ${lv} : multiplicateur ${team.doctorInjuryDurationMult()}, attendu ${want}.`);
  }
  if (DOCTOR_INJURY_DURATION_REDUCTION_BY_LEVEL[5] !== 0.35) throw new Error("❌ Un médecin 5★ doit réduire les blessures de 35 %.");
  console.log("✅ Médecin : durée des blessures réduite de 8 % (1★) à 35 % (5★), minimum 1 jour.");
})();

// ---------------------------------------------------------------------
// 5) En match : le médecin raccourcit les blessures tirées, le kiné entre
//    dans le calcul du risque.
// ---------------------------------------------------------------------
(function testMatchIntegration() {
  const now = Date.UTC(2026, 8, 27, 18);
  const home = generateTeam("Home", 1.0);
  const away = generateTeam("Away", 1.0);
  home.hireDoctor(5, 10000);
  let physioCalls = 0;
  away.physioInjuryRiskMult = () => { physioCalls++; return 0; }; // kiné "parfait" : aucune blessure possible
  let homeInjuries = 0;
  for (let i = 0; i < 300; i++) {
    [home, away].forEach(t => t.players.forEach(p => { p.injuryUntil = null; p.injuryType = null; p.condition = 100; }));
    new MatchEngine(home, away).simulate(now);
    home.players.forEach(p => {
      if (typeof p.injuryUntil !== "number" || p.injuryUntil <= now) return;
      homeInjuries++;
      const type = INJURY_TYPES.find(t => t.label === p.injuryType);
      const days = Math.round((p.injuryUntil - now) / CONDITION_DAY_MS);
      if (days > Math.round(type.maxDays * 0.65)) throw new Error(`❌ Avec un médecin 5★, ${type.label} ne devrait pas dépasser ${Math.round(type.maxDays * 0.65)} j (trouvé ${days}).`);
    });
    away.players.forEach(p => {
      if (typeof p.injuryUntil === "number" && p.injuryUntil > now) throw new Error("❌ Le multiplicateur du kiné devrait entrer dans le risque de blessure (0 = aucune blessure).");
    });
  }
  if (!homeInjuries) throw new Error("❌ (setup) aucune blessure en 300 matchs, improbable.");
  if (!physioCalls) throw new Error("❌ physioInjuryRiskMult n'est jamais consulté en match.");
  console.log(`✅ En match : ${homeInjuries} blessure(s) côté médecin 5★, toutes raccourcies ; le kiné est bien pris en compte dans le risque.`);
})();

// ---------------------------------------------------------------------
// 6) Kiné : récupération quotidienne et multiplicateur de risque.
// ---------------------------------------------------------------------
(function testPhysioRecoveryAndRisk() {
  const team = generateTeam("Kiné", 1.0);
  team.collectiveTraining = null;
  if (team.conditionRecoveryPerDay() !== CONDITION_RECOVERY_PER_DAY || team.physioInjuryRiskMult() !== 1) {
    throw new Error("❌ Sans kiné, récupération et risque inchangés.");
  }
  for (let lv = 1; lv <= 5; lv++) {
    team.hirePhysio(lv, 1000);
    team.collectiveTraining = null;
    if (team.conditionRecoveryPerDay() !== CONDITION_RECOVERY_PER_DAY + PHYSIO_RECOVERY_BONUS_BY_LEVEL[lv]) throw new Error(`❌ Kiné ${lv}★ : récupération ${team.conditionRecoveryPerDay()}.`);
    team.collectiveTraining = "recuperation";
    // « Récupération » ne touche plus le taux continu (crédité jour de repos
    // par jour de repos, voir Team.applyRestDayRecovery) : kiné seul.
    if (team.conditionRecoveryPerDay() !== CONDITION_RECOVERY_PER_DAY + PHYSIO_RECOVERY_BONUS_BY_LEVEL[lv]) throw new Error(`❌ Kiné ${lv}★ + entraînement récupération : ${team.conditionRecoveryPerDay()}.`);
    if (team.physioInjuryRiskMult() !== PHYSIO_INJURY_RISK_MULT_BY_LEVEL[lv]) throw new Error(`❌ Kiné ${lv}★ : risque ×${team.physioInjuryRiskMult()}.`);
  }
  team.collectiveTraining = null;
  if (team.conditionRecoveryPerDay() !== 15 || team.physioInjuryRiskMult() !== 0.75) throw new Error("❌ Kiné 5★ : +15/jour et risque ×0,75 attendus.");
  console.log("✅ Kiné : +1 à +5 de forme physique par jour (cumulé avec l'entraînement récupération), risque ×0,95 à ×0,75.");
})();

// ---------------------------------------------------------------------
// 7) Sauvegarde : staff médical et marchés survivent à un rechargement ;
//    une ancienne sauvegarde (sans ces champs) reste chargeable.
// ---------------------------------------------------------------------
(function testPersistence() {
  const team = generateTeam("Save", 1.0);
  team.hireDoctor(3, 2500); team.doctor.weeksEmployed = 4;
  team.hirePhysio(2, 1700);
  const back = teamFromSave(JSON.parse(JSON.stringify(serializeTeam(team))));
  if (JSON.stringify(back.doctor) !== JSON.stringify(team.doctor) || JSON.stringify(back.physio) !== JSON.stringify(team.physio)) {
    throw new Error("❌ Le médecin/kiné devrait survivre à la sauvegarde.");
  }
  const raw = JSON.parse(JSON.stringify(serializeTeam(team)));
  delete raw.doctor; delete raw.physio;
  const old = teamFromSave(raw);
  if (old.doctor !== null || old.physio !== null) throw new Error("❌ Une ancienne sauvegarde devrait donner des postes vacants.");

  const lg = freshLeague();
  lg.refreshDoctorMarket(Date.now()); lg.refreshPhysioMarket(Date.now());
  const lg2 = leagueFromSave(JSON.parse(JSON.stringify(serializeLeague(lg))));
  if (lg2.doctorListings.length !== lg.doctorListings.length || lg2.physioListings.length !== lg.physioListings.length) {
    throw new Error("❌ Les marchés du staff médical devraient survivre à la sauvegarde de la ligue.");
  }
  const rawLg = JSON.parse(JSON.stringify(serializeLeague(lg)));
  delete rawLg.doctorListings; delete rawLg.physioListings;
  const lg3 = leagueFromSave(rawLg);
  if (!Array.isArray(lg3.doctorListings) || !Array.isArray(lg3.physioListings)) throw new Error("❌ Ancienne ligue : marchés médicaux vides attendus.");
  console.log("✅ Sauvegarde : staff médical et marchés persistés, anciennes sauvegardes compatibles.");
})();

// ---------------------------------------------------------------------
// 8) Actions serveur (mode multi-manager).
// ---------------------------------------------------------------------
(function testServerActions() {
  const lg = freshLeague();
  const now = Date.now();
  lg.refreshDoctorMarket(now);
  const l = lg.doctorListings.find(x => x.status === "open");
  const team = lg.teams[0];
  const ok = actions.bidOnDoctorListing(team, 0, lg, { listingId: String(l.id), amount: l.startPrice }, now);
  if (!ok.ok || l.currentBidderIdx !== 0) throw new Error(`❌ bidOnDoctorListing devrait enregistrer l'enchère (${JSON.stringify(ok)}).`);
  const bad = actions.bidOnPhysioListing(team, 0, lg, { listingId: l.id, amount: 5 }, now);
  if (bad.ok) throw new Error("❌ Une enchère kiné sur une annonce médecin devrait être refusée.");
  team.hirePhysio(4, 5000);
  const fired = actions.firePhysio(team, 0, lg, {}, now);
  if (!fired.ok || !fired.relisted || team.physio !== null) throw new Error("❌ firePhysio devrait congédier et relister.");
  const firedDoc = actions.fireDoctor(team, 0, lg, {}, now);
  if (!firedDoc.ok || firedDoc.relisted) throw new Error("❌ fireDoctor sans médecin : ok sans relistage.");
  const routes = fs.readFileSync("server/index.js", "utf-8");
  for (const r of ["/api/market/doctor-bid", "/api/staff/fire-doctor", "/api/market/physio-bid", "/api/staff/fire-physio"]) {
    if (!routes.includes(`"${r}"`)) throw new Error(`❌ Route ${r} absente de server/index.js.`);
  }
  const autoSim = fs.readFileSync("server/autoSim.js", "utf-8");
  if (!autoSim.includes("league.refreshDoctorMarket(now)") || !autoSim.includes("league.refreshPhysioMarket(now)")) {
    throw new Error("❌ Le serveur doit faire vivre les marchés médicaux à chaque tick (catchUpLeague).");
  }
  console.log("✅ Actions serveur bidOnDoctorListing/bidOnPhysioListing/fireDoctor/firePhysio + routes + rafraîchissement serveur.");
})();

// ---------------------------------------------------------------------
// 9) Navigateur : onglet Staff avec 6 postes (entraîneur adjoint compris),
//    enchère puis embauche d'un médecin, tableau de bord sur 6 postes.
// ---------------------------------------------------------------------
(async () => {
  const { startTestServer, openGame, flush } = require("./test_helpers.js");
  const html = fs.readFileSync("moteurbasket3.html", "utf-8");
  const { server, baseUrl } = await startTestServer();
  try {
    const dom = await openGame(html, baseUrl);
    const doc = dom.window.document;
    const win = dom.window;
    const tab = [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "staff");
    tab.click();
    const slots = doc.querySelectorAll("#staffSlots .stf-slot");
    if (slots.length !== 6) throw new Error(`❌ L'onglet Staff devrait afficher 6 postes (trouvé ${slots.length}).`);
    if (!doc.querySelector("#staffDoctorCurrent .staff-none") || !doc.querySelector("#staffPhysioCurrent .staff-none")) {
      throw new Error("❌ Sans staff médical, les messages 'Aucun médecin/kiné sous contrat' devraient s'afficher.");
    }
    if (doc.getElementById("staffDoctorTitle").textContent !== "Engager un médecin") throw new Error("❌ Titre attendu : Engager un médecin.");
    const rows = doc.querySelectorAll("#staffDoctorHireGrid table.stf-table tbody tr").length;
    const humans = win.eval("league.teams.filter(t => t.isHuman).length");
    if (rows !== 2 * humans) throw new Error(`❌ Le marché des médecins devrait proposer ${2 * humans} candidats (trouvé ${rows}).`);

    const bidBtn = doc.querySelector('#staffDoctorHireGrid [data-staff-bid^="doctor:"]');
    const id = Number(bidBtn.dataset.staffBid.split(":")[1]);
    bidBtn.click();
    await flush(dom);
    const leading = win.eval(`league.doctorListings.find(l => l.id === ${id}).currentBidderIdx === myTeamIndex`);
    if (!leading) throw new Error("❌ Cliquer sur Enchérir devrait placer l'enchère sur le médecin.");
    win.eval(`(() => { const l = league.doctorListings.find(x => x.id === ${id}); league.teams.forEach(t => { if (!t.isHuman) t.doctor = { level: 5, weeksEmployed: 0, baseSalary: 1 }; }); league.refreshMedicalMarket("doctor", l.closesAt + 1); renderStaffPanel(); })()`);
    if (!win.eval("!!teamA.doctor")) throw new Error("❌ Le médecin gagné devrait être embauché côté navigateur.");
    if (!doc.querySelector("#staffDoctorCurrent .stf-stars")) throw new Error("❌ Le médecin en poste devrait s'afficher avec ses étoiles.");
    if (!doc.querySelector('[data-staff-fire="doctor"]')) throw new Error("❌ Un bouton Congédier devrait être proposé pour le médecin.");

    const dashRoles = win.eval("DASH_STAFF_ROLES.map(r => r.id).join(',')");
    if (dashRoles !== "coach,analyst,scout,doctor,physio,assistant") throw new Error(`❌ Tableau de bord : postes ${dashRoles}.`);
    console.log("✅ Navigateur : 6 postes dans l'onglet Staff, enchère puis embauche d'un médecin, tableau de bord sur 6 postes.");
    dom.window.close();
  } finally {
    server.close();
  }
  console.log("\n🏁 Tous les tests du staff médical sont passés.");
})().catch(e => { console.error(e); process.exit(1); });
