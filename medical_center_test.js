// Onglet Centre médical (demande du 2026-09-27 : "commence à travailler sur
// l'onglet Centre médical") : entrée de barre latérale après Staff,
// Infirmerie (blessés, jours restants, retour prévu), Risque de blessure
// (forme physique × salle de musculation × kiné, mêmes multiplicateurs que
// MatchEngine.applyFatigue), Encadrement médical, Historique de la saison
// (Team.injuryLog, alimenté par applyFatigue et persisté).
const fs = require("fs");
const E = require("./engine.js");
const { startTestServer, openGame, flush, readRawSave, writeRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

// 1) Moteur : chaque blessure en match est inscrite au carnet, et le carnet
//    survit à la sauvegarde.
(function engineLog() {
  const user = E.generateTeam("User", 1.0);
  const lg = E.generateLeague(user, 1);
  const [a, b] = lg.teams;
  for (let i = 0; i < 400 && !(a.injuryLog.length && b.injuryLog.length); i++) new E.MatchEngine(a, b).simulate(Date.now());
  assert(a.injuryLog.length > 0 && b.injuryLog.length > 0, "les blessures de match sont inscrites au carnet des deux équipes");
  const e = a.injuryLog[0];
  assert(e.seasonNo === 1 && typeof e.week === "number" && e.playerName && e.injuryType && e.days >= 1 && e.opponentName === b.name,
    "entrée complète (saison, semaine, joueur, type, durée, adversaire)");
  const injuredNow = a.players.find(p => p.id === e.playerId);
  assert(injuredNow && injuredNow.injuryType === e.injuryType, "l'entrée correspond à la blessure du joueur");
  const back = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(a))));
  assert(back.injuryLog.length === a.injuryLog.length, "le carnet est persisté (serializeTeam/teamFromSave)");
  a.injuryLog = [];
  for (let i = 0; i < 80; i++) a.recordInjury({ at: i, playerId: 1, playerName: "X", injuryType: "Contusion", days: 2 });
  assert(a.injuryLog.length === 60 && a.injuryLog[0].at === 79, "carnet plafonné à 60 entrées, la plus récente en tête");
})();

// 2) Page Centre médical.
(async () => {
  const { server, savePath, baseUrl } = await startTestServer();
  let dom = await openGame(html, baseUrl);
  await flush(dom);
  dom.window.close();

  const now = Date.now();
  const save = readRawSave(savePath);
  const t = save.team;
  const [p0, p1] = t.players;
  p0.injuryType = "Blessure musculaire"; p0.injuryUntil = now + 5 * 86400000 + 3600000;
  p1.condition = 30; p1.conditionUpdatedAt = now;
  t.physio = { level: 3, weeksEmployed: 0, baseSalary: 1000 };
  t.doctor = null;
  t.injuryLog = [
    { seasonNo: 1, week: 1, at: now - 86400000, playerId: p0.id, playerName: p0.name, injuryType: "Blessure musculaire", days: 8, opponentName: "Adversaire test" },
    { seasonNo: 0, week: 9, at: now - 90 * 86400000, playerId: p1.id, playerName: p1.name, injuryType: "Contusion", days: 2, opponentName: "Ancienne saison" },
  ];
  writeRawSave(savePath, save);

  dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  const btns = [...doc.querySelectorAll(".tab-btn")];
  const idx = btns.findIndex(b => b.dataset.tab === "medical");
  assert(idx > 0 && btns[idx - 1].dataset.tab === "staff" && btns[idx].textContent.trim() === "Centre médical", "onglet « Centre médical » juste après Staff");
  btns[idx].click();
  assert(!doc.getElementById("medicalSection").classList.contains("hidden"), "la page Centre médical s'affiche");
  assert(btns[idx].classList.contains("active"), "l'onglet est actif");

  const content = doc.getElementById("medicalContent");
  assert(content.querySelector(".cal-layout .cal-main") && content.querySelector(".cal-side"), "même gabarit que le Calendrier (liste + colonne de droite)");
  const injRows = content.querySelectorAll('tr[data-med-kind="injured"]');
  assert(injRows.length === 1 && injRows[0].textContent.includes(p0.name) && injRows[0].textContent.includes("Blessure musculaire"), "le blessé est en tête de liste avec sa blessure");
  assert(/6 jours/.test(injRows[0].querySelector(".med-days").textContent) && injRows[0].textContent.includes("retour"), "jours restants et date de retour");
  assert(doc.getElementById("medicalInjuredCount").textContent === "1", "Infirmerie : compteur de blessés");
  assert(doc.getElementById("medicalSummary").textContent.includes("Prochain retour"), "Infirmerie : prochain retour");

  assert(!content.querySelector(`tr[data-player-row="${p0.id}"][data-risk]`), "le blessé n'a pas de ligne de risque");
  const r1 = content.querySelector(`tr[data-player-row="${p1.id}"][data-risk]`);
  // Épuisé (×1,80) × kiné 3★ (×0,85) = ×1,53 → Très élevé, en tête.
  assert(r1 && r1.dataset.risk === "veryhigh" && r1.textContent.includes("Très élevé") && !r1.textContent.includes("×"), "joueur épuisé : risque Très élevé (×1,53 avec le kiné), sans facteur affiché");
  assert(content.querySelector("tr[data-risk]") === r1, "les joueurs les plus exposés en tête");
  assert(doc.getElementById("medicalHighRiskCount").textContent === "1", "compteur de joueurs à risque");

  const staff = doc.getElementById("medicalStaffCard");
  assert(staff.querySelector('[data-med-staff="doctor"]').textContent.includes("À recruter"), "encadrement : médecin à recruter");
  assert(staff.querySelector('[data-med-staff="physio"]').textContent.includes("−15 %"), "encadrement : effet du kiné chiffré");

  const hist = [...content.querySelectorAll(".med-hist-row")];
  assert(hist.length === 1 && hist.every(r => r.classList.contains("hidden")), "historique caché par défaut, seulement la saison en cours");
  const click = k => content.querySelector(`[data-med-filter="${k}"]`).click();
  click("history");
  assert(!hist[0].classList.contains("hidden") && hist[0].textContent.includes("Adversaire test") && r1.classList.contains("hidden"), "filtre Historique");
  click("injured");
  assert(!injRows[0].classList.contains("hidden") && r1.classList.contains("hidden"), "filtre Blessés : seulement le bloc Infirmerie");
  click("risk");
  assert(injRows[0].classList.contains("hidden") && !r1.classList.contains("hidden"), "filtre À risque");
  click("all");
  assert(doc.getElementById("medicalSeasonCount").textContent === "1", "compteur de blessures de la saison");

  doc.getElementById("medicalGoStaff").click();
  assert(!doc.getElementById("staffSection").classList.contains("hidden"), "« Gérer le staff » ouvre la page Staff");

  dom.window.close();
  server.close();
  console.log("\n✅ medical_center_test.js : tout est vert.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
