// Sponsors (4) — retours communauté 2026-09-26, variante A choisie par
// l'utilisateur ("J'aime bien la A") + part variable selon les résultats +
// profils prudent/normal/ambitieux, sans emplacement pub. Voir le bloc
// SPONSORS côté moteur. A) moteur, B) serveur, C) navigateur.
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, tries = 60) { for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await sleep(50); } throw new Error("❌ délai dépassé : " + label); }
const DAY = 24 * 3600 * 1000;
const SPONSOR_ORDER = { prudent: 0, normal: 1, ambitieux: 2 };

(async () => {
  const T0 = Calendar.parisEpochForLocalTime(2026, 9, 30, 9);
  // --- A : moteur.
  const league = Engine.generateLeague(Engine.generateStartingRoster("Bad Kings"), 1, T0);
  const team = league.teams[0]; team.isHuman = true;
  check(team.sponsorReputation === Engine.SPONSOR_REPUTATION_DEFAULT && team.sponsorOffers.length === 0, "réputation à 50, aucune offre au départ");
  let created = Engine.refreshSponsorOffers(team, league, T0);
  check(created.length === 4 && ["maillot", "salle"].every(k => created.filter(o => o.slot === k).length === 2), "première vague : 2 offres par emplacement");
  check(["maillot", "salle"].every(k => new Set(created.filter(o => o.slot === k).map(o => o.profile)).size === 2), "deux profils différents par emplacement");
  check(["maillot", "salle"].every(k => new Set(created.filter(o => o.slot === k).map(o => o.tier)).size === 1), "même palier pour les deux offres d'un emplacement");
  check(["maillot", "salle"].every(k => { const [a, b] = created.filter(o => o.slot === k); const hi = SPONSOR_ORDER[a.profile] > SPONSOR_ORDER[b.profile] ? a : b, lo = hi === a ? b : a; return hi.weekly < lo.weekly && hi.winPrime > lo.winPrime && hi.bonus > lo.bonus; }), "le profil le plus ambitieux : moins de fixe, plus de prime, plus de bonus");
  check(created.every(o => o.tier !== "national"), "réputation 50 : pas encore de marque nationale");
  check(created.every(o => o.weekly > 0 && o.winPrime > 0 && o.bonus === o.weekly * Engine.SPONSOR_PROFILES[o.profile].bonusWeeks && o.quote), "fixe, prime, bonus et phrase du sponsor cohérents");
  const maillot = created.filter(o => o.slot === "maillot");
  const pr = maillot.find(o => o.profile === "prudent"), am = maillot.find(o => o.profile === "ambitieux"), no = maillot.find(o => o.profile === "normal");
  if (pr && am) check(pr.winPrime / pr.weekly < am.winPrime / am.weekly && pr.objectiveTier < am.objectiveTier && pr.bonus / pr.weekly < am.bonus / am.weekly, "prudent : part variable plus faible, objectif plus bas, bonus plus court que l'ambitieux");
  check(Engine.refreshSponsorOffers(team, league, T0 + DAY).length === 0, "pas de nouvelle vague avant 3 jours");
  const salleOffer = created.find(o => o.slot === "salle" && o.profile !== "prudent") || created.find(o => o.slot === "salle");
  let r = Engine.acceptSponsorOffer(team, league, salleOffer.id, T0);
  check(r.ok && team.sponsorContracts.length === 1 && team.sponsorOffers.every(o => o.slot !== "salle"), "acceptation : contrat créé, offres de l'emplacement retirées");
  check(Engine.sponsorNameForSlot(team, "salle") === salleOffer.sponsorName && Engine.sponsorNameForSlot(team, "maillot") === null, "sponsorNameForSlot");
  const other = team.sponsorOffers[0];
  r = Engine.declineSponsorOffer(team, other.id);
  check(r.ok && !team.sponsorOffers.some(o => o.id === other.id), "refus : offre retirée sans pénalité");
  const budget0 = team.budget;
  league.recordResult(0, 0, 1, 80, 70);
  check(team.budget === budget0 + salleOffer.winPrime && team.sponsorContracts[0].wins === 1, "prime versée au vainqueur (championnat)");
  league.recordResult(1, 1, 0, 80, 70);
  check(team.budget === budget0 + salleOffer.winPrime, "aucune prime en cas de défaite");
  const budget1 = team.budget;
  team.trainWeek(league.divisionLevel, T0 + DAY);
  check(team.transactions.some(t => /^Sponsor /.test(t.label) && t.amount === salleOffer.weekly), "fixe hebdomadaire versé par trainWeek");
  // Rupture par le club : clause = 4 semaines de fixe.
  const fee = Engine.sponsorTerminationFee(team.sponsorContracts[0]);
  const budget2 = team.budget;
  r = Engine.terminateSponsorContract(team, team.sponsorContracts[0].id, T0 + 2 * DAY);
  check(r.ok && r.fee === fee && team.budget === budget2 - fee && team.sponsorContracts.length === 0 && team.sponsorHistory[0].status === "terminated", "clause de rupture payée, contrat dans l'historique");
  check(team.sponsorReputation === 50, "la rupture par le club ne touche pas la réputation");
  // Règlement de fin de saison : un contrat "maintien" (atteint) et un "titre" (raté).
  team.sponsorOffers = [];
  team.lastSponsorOfferAt = 0;
  created = Engine.refreshSponsorOffers(team, league, T0 + 3 * DAY);
  const easy = created.find(o => o.slot === "maillot");
  easy.objectiveKey = "maintien"; easy.objectiveTier = 1; easy.objectiveLabel = "Maintien"; easy.profile = "prudent";
  const hard = created.find(o => o.slot === "salle");
  hard.objectiveKey = "titre"; hard.objectiveTier = 5; hard.objectiveLabel = "Titre de champion"; hard.profile = "ambitieux";
  Engine.acceptSponsorOffer(team, league, easy.id, T0 + 3 * DAY); Engine.acceptSponsorOffer(team, league, hard.id, T0 + 3 * DAY);
  check(Engine.settleSponsorsAtSeasonEnd(league, 0, T0).length === 0, "pas de règlement tant que la saison n'est pas finie");
  // Saison jouée jusqu'au champion (résultats forcés : l'équipe 0 finit au milieu).
  while (!league.isRegularSeasonDone()) { const round = league.round; league.matchesForRound(round).forEach(m => { const homeWin = (m.home + m.away + round) % 2 === 0; league.recordResult(round, m.home, m.away, homeWin ? 80 : 70, homeWin ? 70 : 80); }); league.advanceRound(); }
  league.startPlayoffsIfNeeded(T0);
  let g = 0; while (!league.isPlayoffsDone() && g++ < 20) { league.playoffMatchesForRound(league.playoffs.round).forEach(pm => league.recordPlayoffGameResult(pm.seriesId, pm.home, pm.away, 80, 70, T0)); league.playoffs.round++; }
  const achieved = Engine.seasonAchievementTier(league, 0);
  const budget3 = team.budget;
  const verdicts = Engine.settleSponsorsAtSeasonEnd(league, 0, T0 + 30 * DAY);
  check(verdicts.length === 2, "deux contrats réglés");
  const vEasy = verdicts.find(v => v.contractId && v.sponsorName === easy.sponsorName), vHard = verdicts.find(v => v.sponsorName === hard.sponsorName);
  if (achieved >= 1) check(vEasy.met && vEasy.bonus === easy.bonus && vEasy.reputationDelta === Engine.SPONSOR_PROFILES.prudent.reputationMet, "objectif maintien atteint : bonus versé, +4 réputation");
  if (achieved < 5) check(!vHard.met && vHard.bonus === 0 && vHard.reputationDelta === Engine.SPONSOR_REPUTATION_MISS, "objectif titre raté : pas de bonus, −12 réputation, jamais de débit");
  check(team.budget >= budget3, "le règlement n'a jamais retiré d'argent");
  check(team.sponsorContracts.length === 0 && team.sponsorHistory.length === 3, "contrats clos et archivés");
  check(Engine.settleSponsorsAtSeasonEnd(league, 0, T0 + 31 * DAY).length === 0, "règlement idempotent");
  const rebuilt = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(league))));
  check(rebuilt.teams[0].sponsorHistory.length === 3 && rebuilt.teams[0].sponsorReputation === team.sponsorReputation, "sponsors sérialisés");
  // Réputation : à 20, seuls les commerces locaux ; à 70 en D1, le national arrive.
  team.sponsorReputation = 20; check(Engine.sponsorTiersAvailable(team, 1).join(",") === "local", "réputation 20 : commerces locaux seulement");
  team.sponsorReputation = 70; check(Engine.sponsorTiersAvailable(team, 1).includes("national") && !Engine.sponsorTiersAvailable(team, 2).includes("national"), "réputation 70 : national en D1 seulement");

  // --- B : serveur (ligue partagée).
  const names = ["Alpha SP", "Bravo SP"];
  const multi = Engine.generateMultiManagerLeague(names, names.length, T0, Calendar.dailyAnchoredCalendarConfig());
  const hIdx = multi.teams.findIndex(t => t.isHuman);
  let now = T0;
  const { server, multiSavePath, baseUrl } = await startTestServer(() => now);
  await store.saveMultiLeague(multi, multiSavePath);
  const token = multi.teams[hIdx].managerLinkToken;
  let res = await fetch(`${baseUrl}api/state`, { headers: { "X-TipIn-Token": token } });
  check(res.ok, "tick serveur");
  let { league: saved } = await store.loadMultiLeague(multiSavePath);
  check(saved.teams[hIdx].sponsorOffers.length === 4 && !saved.teams[hIdx].feed.entries.some(e => /sponsor/i.test(e.title)), "au premier tick : 4 offres, rien dans le fil d'actu (c'est une tâche du tableau de bord)");
  const offerId = saved.teams[hIdx].sponsorOffers[0].id;
  res = await fetch(`${baseUrl}api/sponsors/accept`, { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": token }, body: JSON.stringify({ offerId }) });
  const acc = await res.json();
  check(res.ok && acc.ok && acc.sponsorContracts.length === 1, "acceptation par l'API");
  res = await fetch(`${baseUrl}api/sponsors/accept`, { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": token }, body: JSON.stringify({ offerId }) });
  const twice = await res.json();
  check(res.ok && twice.stale === true && twice.sponsorContracts.length === 1, "offre déjà acceptée : pas d'erreur, l'état réel est renvoyé (stale)");

  // --- C : navigateur.
  const dom = await openGame(html, `${baseUrl}?m=${token}`);
  const doc = dom.window.document, win = dom.window;
  const taskTxt = doc.getElementById("clubDashboardRoot").textContent;
  check(/offres? de sponsors?/i.test(taskTxt) && /Voir les offres/.test(taskTxt), "tableau de bord : tâche « offres de sponsors » avec le bouton Voir les offres");
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "sponsors").click();
  check(!doc.getElementById("sponsorsSection").classList.contains("hidden"), "onglet « Sponsors » dédié");
  const section = doc.getElementById("economieSponsors");
  check(section && section.querySelectorAll(".spo-card").length === 2, "page Sponsors : 2 emplacements");
  check(section.querySelectorAll(".spo-tag-ok").length === 1 && section.querySelectorAll(".spo-offer").length === 2, "un contrat en cours et 2 offres sur l'autre emplacement");
  const contractSlot = acc.sponsorContracts[0].slot;
  if (contractSlot === "maillot") check(!!section.querySelector(".spo-jersey svg text"), "le maillot du contrat porte le nom du sponsor");
  const declineBtn = section.querySelector("[data-sponsor-decline]");
  const offersBefore = section.querySelectorAll(".spo-offer").length;
  declineBtn.click();
  await waitFor(() => doc.getElementById("economieSponsors").querySelectorAll(".spo-offer").length === offersBefore - 1, "offre refusée dans l'interface");
  check(true, "refus depuis l'interface");
  doc.getElementById("economieSponsors").querySelector("[data-sponsor-accept]").click();
  await waitFor(() => doc.getElementById("economieSponsors").querySelectorAll(".spo-tag-ok").length === 2, "second contrat signé");
  check(true, "acceptation depuis l'interface : 2 contrats");
  // Rupture : premier clic = confirmation, second = rupture.
  const ter = doc.getElementById("economieSponsors").querySelector("[data-sponsor-terminate]");
  ter.click();
  check(/Confirmer/.test(ter.textContent), "premier clic : demande de confirmation");
  ter.click();
  await waitFor(() => doc.getElementById("economieSponsors").querySelectorAll(".spo-tag-ok").length === 1, "contrat rompu");
  check(/Rompu par le club/.test(doc.getElementById("economieSponsors").textContent), "historique : rompu par le club");
  // Salle : panneau dessiné, pas d'encart dans le bandeau.
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "salle").click();
  const hasSalle = win.eval('!!sponsorActiveContractForSlot(teamA, "salle")');
  if (hasSalle) {
    const nm = win.eval('sponsorNameForSlot(teamA, "salle")');
    check(!doc.querySelector(".sl-sponsor") && !doc.getElementById("salleHeroHead").textContent.includes(nm), "pas d'encart « Sponsor de la salle » dans le bandeau");
    check(doc.getElementById("arenaVisualCard").innerHTML.toUpperCase().includes(nm.toUpperCase()), "panneau du sponsor dessiné dans la salle (ArenaGen)");
  } else {
    check(!doc.querySelector(".sl-sponsor") && !/voir les offres/.test(doc.getElementById("salleHero").textContent), "sans sponsor : aucun encart sponsor sur la Salle");
  }
  // Vue live : le sponsor maillot arrive dans l'état de la vue.
  const st = win.eval(`(() => { hmLive = { match: { isHome: true, pregame: true, kickoffAt: Date.now() + 60000 }, dress: undefined, events: [], shots: [], fouls: [], raw: [], quarter: 1, final: false }; teamB = league.teams.find((t, i) => i !== myTeamIndex); const s = hmLiveBuildState(); return { sp: s.teams[0].sponsor, arena: s.arenaSponsor, short: s.teams[0].short }; })()`);
  check(st.sp === win.eval('sponsorNameForSlot(teamA, "maillot")') && st.arena === win.eval('sponsorNameForSlot(teamA, "salle")'), "état de la vue live : sponsor maillot et sponsor salle transmis");
  check(st.short === win.eval("teamTrigram(teamA)"), "la vue live utilise le trigramme du club");
  dom.window.close(); server.close();
  console.log("\n✅ sponsors_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
