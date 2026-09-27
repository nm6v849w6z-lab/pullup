// Scouting Pro — « Appliquer à mes ordres » (retour utilisateur, 2026-09-27) :
// "il faut que lorsque l'on clique sur appliquer à mes ordres, cela ouvre la
// page donner vos ordres correspondant à cet adversaire avec les tactiques
// proposées appliquées". Voir scoutingGamePlanPatch/nextOrdresRoundAgainst et
// le gestionnaire #scoutingApplyOrdresBtn dans moteurbasket3.html.
// Les tendances de l'adversaire sont fixées (computeScoutingTendencies
// remplacée) pour déclencher toutes les consignes à coup sûr.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

const TENDENCIES = {
  gamesPlayed: 3, paintSharePct: 45,
  pivotPaintSharePct: 22, pivotName: "Milo Novak",
  meneurDriveRatePct: 35, meneurName: "Tom Martin",
  threeRatePct: 20, orebSharePct: 20,
  foulsPerGame: 14.6, blocksPerGame: 0.9, stealsPerGame: 7, drebPerGame: 18,
};

(async () => {
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const win = dom.window, doc = win.document;
  win.computeScoutingTendencies = () => ({ ...TENDENCIES });

  const upcoming = win.eval("upcomingRoundsForOrders()").filter(r => r.competition === "championship");
  const current = win.eval("currentMatch");
  const immediateEntry = upcoming.find(r => r.round === current.round);
  // Adversaire rencontré d'abord plus tard (pas au match immédiat).
  const futureEntry = upcoming.find(r => r.round !== current.round && r.opponentIdx !== immediateEntry.opponentIdx);
  assert(immediateEntry && futureEntry, "un match immédiat et un match futur contre un autre adversaire");

  function clickApply(opponentIdx) {
    const holder = doc.getElementById("teamDetailContent");
    holder.innerHTML = win.eval(`sp2PlanHtml({}, ${opponentIdx}, suggestTacticalSetup(computeScoutingTendencies(league.teams[${opponentIdx}])), suggestOffensiveApproach(computeScoutingTendencies(league.teams[${opponentIdx}])))`);
    const btn = doc.getElementById("scoutingApplyOrdresBtn");
    assert(btn && !btn.disabled, "bouton « Appliquer à mes ordres » actif");
    btn.click();
  }

  // 1) Match futur : plan préparé pour CETTE journée, ordres en direct intacts.
  const team = win.eval("teamA");
  const liveDefense = team.defense, livePriorities = [...team.offensivePriorities];
  clickApply(futureEntry.opponentIdx);
  await flush(dom);
  assert(!doc.getElementById("prepSection").classList.contains("hidden"), "la page Ordres s'ouvre");
  assert(win.eval("selectedOrdresRound") === futureEntry.round && win.eval("selectedOrdresCompetition") === "championship",
    "sur le match contre cet adversaire (pas le prochain match)");
  const plan = team.getPlanForRound(futureEntry.round, "championship");
  assert(team.hasPlanForRound(futureEntry.round, "championship"), "plan préparé pour cette journée");
  assert(plan.defense === "Zone intérieure", "défense proposée appliquée");
  assert(JSON.stringify(plan.watchAssignments) === JSON.stringify([{ position: "Pivot", focus: "denyPostUp" }, { position: "Meneur", focus: "denyDrive" }]),
    "surveillances proposées appliquées");
  assert(plan.offensivePriorities[0] === "Jeu en pénétration" && plan.offensivePriorities.length === 3, "attaque proposée en priorité (toujours 3 priorités)");
  assert(plan.rhythm === "Lent" && plan.offRebStyle === "Agressif" && plan.tacticalTier === "confirmée", "rythme, rebond offensif, niveau confirmé");
  assert(team.defense === liveDefense && JSON.stringify(team.offensivePriorities) === JSON.stringify(livePriorities), "ordres du match immédiat inchangés");
  const fb = doc.getElementById("ordresValidateFeedback").textContent;
  assert(fb.includes("Plan de match contre") && fb.includes("Milo Novak"), "message de confirmation sur la page Ordres");
  assert(doc.getElementById("ordresStatus").textContent.includes("Modifications à valider"), "ordres marqués à valider");
  const saved = readRawSave(savePath).team.plannedTactics[`championship:${futureEntry.round}`];
  assert(saved && saved.defense === "Zone intérieure", "plan sauvegardé côté serveur");

  // 2) Match immédiat : ordres en direct.
  clickApply(immediateEntry.opponentIdx);
  await flush(dom);
  assert(win.eval("selectedOrdresRound") === current.round, "Ordres ouverts sur le match immédiat");
  assert(team.defense === "Zone intérieure" && team.offensivePriorities[0] === "Jeu en pénétration" && team.watchAssignments.length === 2,
    "ordres en direct mis à jour");
  assert(readRawSave(savePath).team.defense === "Zone intérieure", "ordres en direct sauvegardés");

  // 3) Adversaire jamais rencontré d'ici la fin : message, pas de navigation.
  const allOpp = new Set(win.eval("upcomingRoundsForOrders()").map(r => r.opponentIdx));
  const myIdx = win.eval("myTeamIndex");
  const noMatch = win.eval("league.teams").map((_, i) => i).find(i => i !== myIdx && !allOpp.has(i));
  if (noMatch != null) {
    win.eval('showPage("clubSection")');
    clickApply(noMatch);
    assert(doc.getElementById("scoutingApplyOrdresFeedback").textContent.includes("Aucun match à venir"), "aucun match à venir : message explicite");
  }

  dom.window.close();
  server.close();
  console.log("✅ scouting_apply_ordres_test OK");
})().catch(e => { console.error(e); process.exit(1); });
