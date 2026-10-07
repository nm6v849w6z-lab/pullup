// Mode Sélection : le bouton « Retour » (barre du haut et navigateur)
// revient à la rubrique précédente DU MODE (retour utilisateur 2026-10-07 :
// « Retour » depuis « Mes joueurs attribués » ramenait à l'Effectif du club,
// avec le menu de la sélection encore ouvert). Avant le mode : on le quitte
// proprement et on retrouve la page du club d'où l'on venait.
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-back";
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const check = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const wait = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 50)); } throw new Error("❌ attente : " + label); };

(async () => {
  const { server, baseUrl } = await startTestServer();
  let dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const club = dom.window.eval("teamA.name");
  const res = await fetch(baseUrl.replace(/\/?(\?.*)?$/, "/") + "api/admin/national", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ action: "appoint", teamId: "fr-A", club }) }).then(r => r.json());
  check(res.ok, "nomination de test (admin)");
  dom.window.close();
  dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const win = dom.window, doc = win.document;
  const tick = () => new Promise(r => setTimeout(r, 60));
  const visible = id => !doc.getElementById(id).classList.contains("hidden");
  const navOn = () => { const a = doc.querySelector(".nc-side-link.on[data-nc-nav]"); return a ? a.dataset.ncNav : null; };

  // Club : Tableau de bord → Effectif, puis entrée dans le mode.
  win.eval("TAB_HANDLERS.club()"); await tick();
  doc.querySelector('.tab-btn[data-tab="effectif"]').click(); await tick();
  check(visible("effectifSection"), "club : Effectif affiché");
  win.eval("TAB_HANDLERS.club()"); await tick();
  await wait(() => doc.querySelector("#ncDashSlot [data-nc-enter]"), "bouton Mode Sélection");
  doc.querySelector("#ncDashSlot [data-nc-enter]").click();
  await wait(() => doc.body.classList.contains("nc-mode") && win.HM_NATIONAL_COACH.state.view, "entrée dans le mode");
  await tick();
  // Rôle scout : une seule rubrique, « Mes joueurs attribués ».
  const st = win.HM_NATIONAL_COACH.state;
  const { PERMS } = require("./server/nationalCoach.js");
  st.view.perms = PERMS.scout; st.view.role = "scout";
  doc.querySelector('#ncSidebar [data-nc-nav="joueurs"]').click(); await tick();
  check(navOn() === "joueurs" && /Mes joueurs attribués/.test(doc.getElementById("ncSidebar").textContent), "scout : « Mes joueurs attribués »");
  // Coach : deux rubriques de plus pour remonter l'historique.
  st.view.perms = PERMS.coach; st.view.role = "coach";
  doc.querySelector('#ncSidebar [data-nc-nav="preselection"]').click(); await tick();
  doc.querySelector('#ncSidebar [data-nc-nav="staff"]').click(); await tick();
  check(navOn() === "staff", "rubrique Staff");

  const back = async () => { doc.getElementById("topbarBackBtn").click(); await tick(); await tick(); };
  check(!doc.getElementById("topbarBackBtn").classList.contains("hidden"), "« ‹ Retour » visible dans la barre du haut");
  await back();
  check(visible("selectionsSection") && doc.body.classList.contains("nc-mode") && navOn() === "preselection", "Retour : rubrique précédente du mode (Présélection)");
  await back();
  check(visible("selectionsSection") && navOn() === "joueurs" && !visible("effectifSection"), "Retour : « Mes joueurs attribués », jamais l'Effectif du club");
  // Fiche joueur ouverte depuis le mode : Retour ramène au mode.
  win.eval("showPlayerDetail(myTeamIndex, teamA.players[0].id)"); await tick();
  check(visible("playerDetailSection"), "fiche joueur ouverte depuis le mode");
  await back();
  check(visible("selectionsSection") && navOn() === "joueurs" && doc.body.classList.contains("nc-mode"), "Retour depuis la fiche : « Mes joueurs attribués »");
  await back();
  check(visible("selectionsSection") && navOn() === "dashboard", "Retour : tableau de bord du mode");
  await back();
  check(!doc.body.classList.contains("nc-mode") && !doc.getElementById("ncSidebar") && !visible("selectionsSection"), "Retour avant le mode : on le quitte proprement (plus de menu de la sélection)");
  dom.window.close(); server.close();
  console.log("\n🏁 national_mode_back_test.js : Retour cohérent en Mode Sélection.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
