// Mode Sélectionneur (phase E, assets/national-coach.js) côté navigateur :
// bouton dans la barre du haut seulement avec un mandat, bascule vers un
// environnement séparé (menu latéral propre, barre du haut de la sélection,
// rubriques du club masquées), retour au mode Club, mode mémorisé.
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-mode";
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const wait = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 100)); } throw new Error("❌ attente : " + label); };

(async () => {
  const { server, baseUrl } = await startTestServer();
  let dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  let win = dom.window, doc = win.document;
  await new Promise(r => setTimeout(r, 800));
  assert(!doc.getElementById("ncModeBtn"), "sans mandat : pas de bouton Mode Sélectionneur");
  const club = win.eval("teamA.name");
  const res = await fetch(baseUrl.replace(/\/?(\?.*)?$/, "/") + "api/admin/national", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ action: "appoint", teamId: "fr-A", club }) }).then(r => r.json());
  assert(res.ok, "nomination de test (admin)");
  dom.window.close();
  dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  win = dom.window; doc = win.document;
  await wait(() => doc.getElementById("ncModeBtn"), "bouton du mode");
  const btn = doc.getElementById("ncModeBtn");
  assert(/Mode Sélectionneur/.test(btn.textContent) && btn.querySelector(".nat-flag"), "barre du haut : bouton « Mode Sélectionneur » avec le drapeau");
  btn.click();
  await wait(() => doc.body.classList.contains("nc-mode") && doc.getElementById("ncSidebar") && win.HM_NATIONAL_COACH.state.view, "entrée dans le mode");
  await flush(dom); await new Promise(r => setTimeout(r, 300));
  const side = doc.getElementById("ncSidebar").textContent;
  assert(["Tableau de bord", "Joueurs sélectionnables", "Présélection", "Convoqués", "Joueurs suivis", "Convocations", "Tactique", "Calendrier", "Qualifications", "Compétition", "Statistiques", "Notifications", "Mandat"].every(x => side.includes(x)), "menu latéral propre au mode Sélectionneur");
  assert(/France A/.test(doc.getElementById("ncTopTitle").textContent) && /Sélectionneur/.test(doc.getElementById("ncTopTitle").textContent), "barre du haut : France A, sélectionneur");
  assert(/Prochain match/.test(doc.getElementById("nationalContent").textContent) && /Mandat/.test(doc.getElementById("nationalContent").textContent), "tableau de bord de la sélection");
  assert(!/Budget|Donnez vos ordres/.test(doc.getElementById("nationalContent").textContent), "rien du club dans le contenu");
  const css = doc.getElementById("ncModeCss").textContent;
  assert(/body\.nc-mode #sidebar > :not\(\.sidebar-brand\):not\(#ncSidebar\)\{display:none/.test(css) && /topbar-right > :not\(#ncModeBtn\)/.test(css), "menu et barre du haut du club masqués en mode Sélectionneur");
  for (const nav of ["notifications", "mandat", "joueurs", "tactique", "calendrier"]) {
    doc.querySelector(`[data-nc-nav="${nav}"]`).click();
    await wait(() => doc.querySelector(`.nc-side-link.on[data-nc-nav="${nav}"]`), "rubrique " + nav);
  }
  assert(doc.querySelector('[data-nc-nav="calendrier"].on'), "rubriques accessibles depuis le menu");
  assert(/nc-mode/.test(win.localStorage.getItem("hm-nat-mode") ? "nc-mode" : ""), "mode mémorisé pour le prochain chargement");
  doc.getElementById("ncModeBtn").click();
  await flush(dom);
  assert(!doc.body.classList.contains("nc-mode") && !doc.getElementById("ncSidebar") && /Mode Sélectionneur/.test(doc.getElementById("ncModeBtn").textContent), "retour au mode Club");
  dom.window.close(); server.close();
  console.log("\n🏁 national_mode_ui_test.js : mode Sélectionneur conforme.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
