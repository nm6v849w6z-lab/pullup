// Prestige du club (2026-09-30) : note 0-100 sur les 5 dernières saisons,
// effets modérés (affluence, boutique) non affichés, jauge du tableau de
// bord + fenêtre de détail, étoiles de Renommée.
const fs = require("fs");
const Engine = require("./engine.js");
const { startTestServer, openGame } = require("./test_helpers.js");
function check(c, m) { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); }
const hist = [
  { seasonNo: 5, divisionLevel: 1, rank: 3, teams: 8, playoffResult: "Demi-finaliste" },
  { seasonNo: 4, divisionLevel: 1, rank: 6, teams: 8 },
  { seasonNo: 3, divisionLevel: 2, rank: 1, teams: 8, playoffResult: "Champion" },
  { seasonNo: 2, divisionLevel: 2, rank: 4, teams: 8 },
  { seasonNo: 1, divisionLevel: 2, rank: 8, teams: 8 },
];
(async () => {
  const d = Engine.clubPrestigeDetail({ seasonHistory: hist }, 1);
  check(d.value === 77 && d.seasons.length === 5, `prestige pondéré sur 5 saisons (${d.value})`);
  check(d.seasons[2].tags.includes("Montée") && d.seasons[2].tags.includes("Champion"), "montée et titre repérés");
  check(Engine.clubPrestigeDetail({}, 1).value > Engine.clubPrestigeDetail({}, 6).value, "nouveau club : moyenne de sa division (Division I > Division VI)");
  check(Math.abs(Engine.prestigeAttendanceMult(0) - 0.9) < 1e-9 && Math.abs(Engine.prestigeAttendanceMult(100) - 1.1) < 1e-9 && Engine.prestigeAttendanceMult(null) === 1, "affluence ×0,9 à ×1,1 (neutre sans prestige)");
  check(Math.abs(Engine.prestigeShopMult(0) - 0.7) < 1e-9 && Math.abs(Engine.prestigeShopMult(100) - 1.4) < 1e-9, "boutique ×0,7 à ×1,4");
  const t = Engine.generateStartingRoster ? null : null;
  const league = Engine.generateLeague(Engine.generateStartingRoster("Test FC"));
  const team = league.teams[0];
  team.seasonHistory = hist;
  const before = team.projectedAttendanceRateFor("gradins");
  team.prestige = 100;
  check(team.projectedAttendanceRateFor("gradins") > before, "un prestige élevé remplit mieux la salle");
  team.prestige = null;
  check(Engine.computeClubReputationStars(team, 1) === Engine.prestigeStars(77), "étoiles de Renommée = prestige");
  const ser = Engine.serializeTeam ? Engine.serializeTeam(Object.assign(team, { prestige: 64 })) : null;
  if (ser) check(ser.prestige === 64, "prestige sauvegardé");

  const { server, baseUrl } = await startTestServer();
  const html = fs.readFileSync("moteurbasket3.html", "utf-8");
  const dom = await openGame(html, baseUrl);
  const win = dom.window, doc = win.document;
  win.eval(`teamA.seasonHistory = ${JSON.stringify(hist)};`);
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "effectif").click();
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "club").click();
  const labels = [...doc.querySelectorAll(".hm-pulse .hm-gauge__label .hm-strong")].map(e => e.textContent.trim());
  check(labels.join() === "Supporters,Alchimie,Renommée", "Pouls du club : 3 jauges dont Renommée");
  const btn = doc.querySelector("[data-prestige-open]");
  check(btn && /Renommée : \d+ sur 100/.test(btn.getAttribute("aria-label")), "jauge Prestige cliquable");
  check(!/%|×|€/.test(doc.querySelector(".hm-pulse").textContent), "aucun chiffre économique affiché");
  btn.click();
  const ov = doc.getElementById("prestigeModalOverlay");
  check(ov && ov.querySelectorAll(".pr-table tbody tr").length === 5 && /Champion/.test(ov.textContent), "fenêtre de détail : 5 saisons");
  check(!/%|€|affluence|boutique/i.test(ov.textContent), "fenêtre sans effets économiques");
  server.close();
  console.log("\n🏁 prestige_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
