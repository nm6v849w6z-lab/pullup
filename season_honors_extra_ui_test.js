// Affichage : récompenses de la saison et All-Star Game sur la page Ligue,
// profil du manager sur la fiche d'un club humain, All-Star Game à l'écran
// de rattrapage (voir renderLeagueHonorsPanel, managerProfileCardHtml).
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
function check(c, m) { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label) { for (let i = 0; i < 200; i++) { let v; try { v = fn(); } catch (e) { v = null; } if (v) return v; await sleep(50); } throw new Error("❌ délai dépassé : " + label); }
const EMOJI = /\p{Extended_Pictographic}/u;

(async () => {
  const now = Date.now();
  const league = Engine.generateMultiManagerLeague(["Alpha HN", "Bravo HN"], 2, now, Calendar.dailyAnchoredCalendarConfig());
  const humans = league.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
  const [iA, iB] = humans;
  league.teams.forEach(t => t.players.forEach((p, k) => {
    for (let r = 0; r < 8; r++) {
      const pts = (k * 7 + r * 3) % 26;
      p.matchLog.push({ round: r, competition: "championship", min: 12 + (k % 5) * 5, pts, reb: k % 9, ast: r % 6, stl: k % 3, blk: r % 2, tov: 1, pf: 2, fgm2: Math.round(pts / 3), fga2: Math.round(pts / 2), fgm3: 1, fga3: 3, ftm: 1, fta: 2, starter: k % 3 !== 2 });
    }
  }));
  league.results = [];
  const key = league.seasonId || `start:${league.calendarStartAt || 0}`;
  league.seasonAwards = { seasonId: key, seasonNumber: 1, divisionLabel: "Division I", awards: Engine.computeSeasonAwards(league) };
  check(league.seasonAwards.awards.length > 5, "(préparation) récompenses calculées");
  const asg = Engine.simulateAllStarGame(league, now - 3600 * 1000);
  check(!!asg, "(préparation) All-Star Game simulé");
  const B = league.teams[iB];
  B.trophies = [{ at: now - 1e8, type: "championship", label: "Champion de Division I" }];
  B.seasonHistory = [{ seasonNo: 1, divisionName: "Division I", rank: 1, teams: 10, wins: 15, losses: 3, playoffResult: "Champion", cupResult: "Demi-finale", champion: true }];
  B.achievements = [{ key: "champion", label: "Champion", description: "x", seasonNumber: 1, at: now }];
  const { server, multiSavePath, baseUrl } = await startTestServer(() => Date.now());
  await store.saveMultiLeague(league, multiSavePath);
  let dom;
  try {
    dom = await openGame(html, `${baseUrl}?m=${league.teams[iA].managerLinkToken}`);
    const win = dom.window, doc = win.document;
    await waitFor(() => win.eval("typeof league !== 'undefined' && league && league.seasonAwards"), "ligue chargée");
    win.eval("TAB_HANDLERS.ligue()");
    const aw = await waitFor(() => doc.getElementById("seasonAwardsCard"), "carte Récompenses");
    check(/MVP/.test(aw.textContent) && /6e homme/.test(aw.textContent) && aw.querySelectorAll(".hn-five-p").length === 5, "Ligue : récompenses (MVP, 6e homme, cinq majeur)");
    check(/MVP des play-offs\s*À désigner/.test(aw.textContent), "MVP des play-offs « À désigner » avant la finale");
    check(aw.querySelectorAll(".player-avatar").length >= 8, "avatars des joueurs");
    const asgCard = doc.getElementById("allStarCard");
    check(!!asgCard && asgCard.querySelectorAll("li").length === 20 && asgCard.textContent.includes(`${asg.teams[0].score} – ${asg.teams[1].score}`), "Ligue : All-Star Game, 10 contre 10, score");
    check(!EMOJI.test(aw.textContent + asgCard.textContent), "aucun émoji");
    // Ordre de la page Ligue (retour utilisateur 2026-09-30) : récompenses
    // au-dessus des leaders, All-Star Game tout en bas après les leaders.
    const stats = doc.getElementById("leagueStatsPanel");
    check(!!(aw.compareDocumentPosition(stats) & 4) && !!(stats.compareDocumentPosition(asgCard) & 4), "Ligue : récompenses, puis leaders, puis All-Star Game");
    win.eval(`teamDetailSubView = "apercu"; showTeamDetail(${iB})`);
    const prof = await waitFor(() => doc.getElementById("managerProfileCard"), "profil du manager");
    check(/15 ?V – 3 ?D/.test(prof.textContent) && /1 \/ \d+ succès/.test(prof.textContent), "fiche d'équipe : carte compacte du manager (bilan, succès)");
    // Profil complet (2026-09-30) : saison en cours + saison archivée.
    prof.querySelector(".mp-more").click();
    const page = await waitFor(() => !doc.getElementById("managerProfileSection").classList.contains("hidden") && doc.getElementById("managerProfileContent"), "page profil");
    check(page.querySelectorAll(".mp-table tbody tr").length === 2 && /Saison 1/.test(page.textContent), "profil du manager : saison par saison");
    const cpu = league.teams.findIndex(t => !t.isHuman);
    win.eval(`showTeamDetail(${cpu})`);
    await sleep(50);
    check(!doc.getElementById("managerProfileCard"), "pas de profil pour un club de l'IA");
    win.eval(`pendingEvents = [{ type: "all-star-game", score: [${asg.teams[0].score}, ${asg.teams[1].score}], mvp: ${JSON.stringify(asg.mvp)} }]; showCatchupSummaryIfAny();`);
    check(doc.getElementById("catchupContent").textContent.includes(asg.mvp.name), "rattrapage : carte All-Star Game");
    win.eval("TAB_HANDLERS.histoire()");
    check(!doc.getElementById("hcAchievements") && !/Succès du manager/.test(doc.getElementById("histoireContent").textContent), "Histoire du club : plus de succès du manager (déplacés sur son profil)");
    win.eval(`showManagerProfile(${iB})`);
    const ach = await waitFor(() => doc.getElementById("mpAchievements"), "succès");
    check(!EMOJI.test(ach.textContent) && ach.querySelectorAll("svg").length > 0 && ach.querySelectorAll(".ach.on").length === 1, "Succès du manager sur son profil, sans émoji (icônes SVG)");
    console.log("\n🏁 Récompenses, All-Star Game et profil du manager affichés.");
  } finally { if (dom) dom.window.close(); server.close(); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
