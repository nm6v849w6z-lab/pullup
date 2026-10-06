// Mode Sélectionneur — rubrique Analyse (assets/national-coach.js), retour
// utilisateur 2026-10-06 : MÊME rapport que l'analyse Premium (Scouting
// Pro) du Mode Club, rendu par les fonctions du club (scoutingProReportHtml,
// blocs sp2*) sur l'« équipe virtuelle » d'une sélection
// (/api/national/coach/analysis-data) ; adversaire ou « Ma sélection » ;
// message clair sans match international ; « Appliquer à ma tactique ».
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-ana";
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const wait = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 100)); } throw new Error("❌ attente : " + label); };

// Données d'analyse réelles (matchs internationaux joués par le moteur),
// calculées hors du serveur de test : même chemin que la route.
function fixture() {
  const store = require("./server/store.js");
  const N = require("./server/nationalTeams.js");
  const C = require("./server/nationalCoach.js");
  const M = require("./server/nationalMatches.js");
  const Engine = require("./engine.js");
  const DAY = 864e5, start = Date.UTC(2027, 0, 5, 19);
  const COUNTRIES = Object.keys(Engine.WORLD_COUNTRIES);
  const lg = store.createMultiManagerCareer(["Lyon AU", "Paris AU"], start).league;
  lg.seasonNumber = 2; lg.calendarStartAt = start; lg.country = "fr";
  lg.teams.forEach(t => { if (t.isHuman) t.lastSeenAt = start + 300 * DAY; });
  lg.teams.flatMap(t => t.players).forEach((p, i) => { p.nationality = COUNTRIES[i % COUNTRIES.length]; p.age = 25; p.injuryUntil = null; p.condition = 100; p.conditionUpdatedAt = start; });
  const leagues = new Map([["fr-1", lg]]);
  const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }] };
  const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
  N.step(st, leagues, world, start + 3600e3);
  const comp = M.compOf(st, 2, "A");
  const m1 = comp.matches.find(m => m.w === 1);
  const lyon = N.managerOf("fr-1", lg, 0, world);
  C.adminAppoint(st, m1.home, lyon, 2, start + 3600e3, leagues);
  // Après la fin des directs de la fenêtre 3 (score caché pendant la diffusion).
  const now = comp.matches.filter(m => m.w === 3)[0].at + 6 * 3600e3;
  N.step(st, leagues, world, now);
  return C.analysisData(st, lyon, m1.home, m1.away, now, { season: 2, pool: null });
}

(async () => {
  const data = fixture();
  assert(data.ok && data.report.gamesPlayed >= 1, "données d'analyse (matchs joués par le moteur)");
  const { server, baseUrl } = await startTestServer();
  let dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const club = dom.window.eval("teamA.name");
  const res = await fetch(baseUrl.replace(/\/?(\?.*)?$/, "/") + "api/admin/national", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ action: "appoint", teamId: "fr-A", club }) }).then(r => r.json());
  assert(res.ok, "nomination de test (admin)");
  dom.window.close();
  dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const win = dom.window, doc = win.document;
  await win.HM_NATIONAL_COACH.enterMode("fr-A");
  const st = win.HM_NATIONAL_COACH.state;
  const content = () => doc.getElementById("nationalContent");
  doc.querySelector('#ncSidebar [data-nc-nav="analyse"]').click();
  await wait(() => content().querySelector("select[data-nc-opp]"), "rubrique Analyse");
  const sel = content().querySelector("select[data-nc-opp]");
  assert([...sel.options].some(o => o.value === "__self" && /Ma sélection/.test(o.textContent)), "choix « Ma sélection » dans le sélecteur");
  assert(content().querySelector("[data-nc-own-analysis]"), "bouton « Analyse de ma sélection »");

  // 1) Ma sélection sans match international : message clair (route réelle).
  content().querySelector("[data-nc-own-analysis]").click();
  await wait(() => st.ana && st.ana.data, "analyse de ma sélection chargée");
  await flush(dom);
  assert(st.anaSelf && /n'a encore joué aucun match international/.test(doc.getElementById("ncScoutingPanel").textContent), "sans match : message clair");

  // 2) Adversaire avec des matchs : rapport complet du club.
  const opp = data.teamId;
  st.anaSelf = false;
  st.view.analysis.opponent = { id: opp, label: data.label, country: data.country, coach: null, squad: [], convoked: null, results: [], record: {}, group: null, honours: [], headToHead: [] };
  st.ana = { key: opp, data: JSON.parse(JSON.stringify(data)), error: "" };
  doc.querySelector('#ncSidebar [data-nc-nav="analyse"]').click();
  await flush(dom);
  const panel = doc.getElementById("ncScoutingPanel");
  const txt = panel.textContent;
  assert(panel.classList.contains("sp2-host") && panel.querySelector(".sp2-hero") && panel.querySelector(".sp2-crest .nat-flag"), "bandeau du rapport avec le drapeau");
  ["Plan de match", "À neutraliser", "Comment les battre", "Profil et style de jeu", "Identité", "Forces", "Faiblesses", "Zones de tir", "Forme et contexte", "Stratégies utilisées", "Domicile vs extérieur", "Écart de points", "Joueurs clés", "Statistiques par joueur", "5 majeur", "Face à vous"].forEach(k => assert(txt.includes(k), "rapport : " + k));
  assert(/Sélection en intérim/.test(txt), "sélectionneur adverse dans le bandeau");
  assert(!/J\d+ ·/.test(panel.querySelector(".sp2-chart") ? panel.querySelector(".sp2-chart").textContent : ""), "matchs datés (pas de journée de championnat)");
  assert(panel.querySelector("[data-nc-profile]"), "liens vers les fiches des joueurs (club du joueur)");
  assert(!panel.querySelector("#scoutingApplyOrdresBtn") && panel.querySelector("[data-nc-apply-plan]"), "« Appliquer à ma tactique » (équivalent des ordres du club)");
  assert(content().textContent.includes("Joueurs de référence"), "joueurs de référence conservés");

  // 3) Appliquer à ma tactique : ordres du prochain match non verrouillé
  // préremplis (comme le club), Tactique ouverte sur ce match, enregistrés
  // par « Enregistrer ».
  const before = JSON.stringify(st.view.tactics);
  panel.querySelector("[data-nc-apply-plan]").click();
  await wait(() => st.nav === "tactique", "rubrique Tactique après application");
  const nx = (st.view.upcoming || []).find(x => !x.locked);
  assert(st.tq && st.tq.key === (nx ? String(nx.id) : "default") && /prérempli/.test(st.tq.feedback), "Tactique ouverte sur le prochain match, plan de match prérempli");
  assert(JSON.stringify(st.view.tactics) === before, "rien d'enregistré avant « Enregistrer »");
  if (doc.querySelector("[data-nc-tq-save]") && !doc.querySelector("[data-nc-tq-save]").disabled) {
    doc.querySelector("[data-nc-tq-save]").click();
    await win.__lastNationalCoach; await flush(dom);
    assert(nx ? st.view.plans[nx.id] && st.view.plans[nx.id].defense : JSON.stringify(st.view.tactics) !== before, "plan de match enregistré dans les ordres du match");
  }

  // 4) Ma sélection avec des matchs : même rapport, sans bouton d'application.
  st.anaSelf = true; st.nav = "analyse";
  st.ana = { key: "fr-A", data: Object.assign(JSON.parse(JSON.stringify(data)), { own: true, teamId: "fr-A" }), error: "" };
  doc.querySelector('#ncSidebar [data-nc-nav="analyse"]').click();
  await flush(dom);
  const own = doc.getElementById("ncScoutingPanel");
  assert(/Comment vos adversaires peuvent vous battre/.test(own.textContent) && !own.querySelector("[data-nc-apply-plan]"), "ma sélection : « Comment vos adversaires peuvent vous battre », pas d'application");
  dom.window.close(); server.close();
  console.log("\n🏁 national_analysis_ui_test.js : analyse du Mode Sélectionneur conforme.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
