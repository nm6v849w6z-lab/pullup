// Mode Sélectionneur : page Tactique construite comme les Ordres d'un club
// (buildTeamPanel / renderLineupEditor sur un proxy des joueurs du match),
// ordres PAR MATCH (sélecteur des matchs à venir, POST matchId, verrou
// T − 5 min) et bouton « Donnez / Modifier vos ordres » de la barre du haut
// (retour utilisateur 2026-10-06).
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-tq";
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const wait = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 100)); } throw new Error("❌ attente : " + label); };

(async () => {
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
  win.eval("TAB_HANDLERS.club()");
  await wait(() => doc.querySelector("#ncDashSlot [data-nc-enter]"), "bouton du tableau de bord");
  doc.querySelector("#ncDashSlot [data-nc-enter]").click();
  await wait(() => win.HM_NATIONAL_COACH.state.view && win.HM_NATIONAL_COACH.state.view.team, "entrée dans le mode");
  await flush(dom);
  const st = win.HM_NATIONAL_COACH.state;
  assert(st.view.upcoming && st.view.upcoming.length && st.view.pool && st.view.pool.players.length >= 15, "matchs à venir et vivier");
  // 15 joueurs présélectionnés (joueurs du match tant que la liste n'est
  // pas convoquée).
  const post = (path, body) => win.fetchApi(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ teamId: "fr-A" }, body)) }).then(r => r.json());
  for (const x of st.view.pool.players.slice(0, 15)) await post("/api/national/coach/list", { list: "preselection", on: true, player: { p: x.p, n: x.n } });
  await win.HM_NATIONAL_COACH.enterMode("fr-A");
  await flush(dom);
  const next = st.view.upcoming[0];
  assert(next.players.length === 15 && !next.hasPlan, "prochain match : 15 joueurs, pas encore d'ordres");

  // Bouton de la barre du haut (style du club).
  const topBtn = () => doc.getElementById("ncOrdersBtn");
  assert(topBtn() && topBtn().classList.contains("topbar-cta") && /Donnez vos ordres/.test(topBtn().textContent) && !topBtn().classList.contains("topbar-cta-validated"), "barre du haut : « Donnez vos ordres »");
  topBtn().click();
  await flush(dom);
  const page = () => doc.getElementById("ncOrdres");
  assert(st.nav === "tactique" && page() && st.tqMatch === String(next.id), "le bouton ouvre la Tactique sur le prochain match");

  // Même organisation que les Ordres du club.
  assert(page().querySelector(".ordres-actionbar .oab-tabs") && page().querySelector(".ordres-match-card .omc-teams") && page().querySelector(".ordres-savebar .ordres-validate-btn"), "barre d'onglets, carte du match, barre d'enregistrement");
  const sel = page().querySelector("select[data-nc-tq-match]");
  assert(sel && sel.options.length === st.view.upcoming.length + 1 && /Tactique par défaut/.test(sel.options[sel.options.length - 1].textContent), "sélecteur : les vrais matchs à venir + tactique par défaut");
  assert([...sel.options].slice(0, -1).every((o, i) => o.textContent.includes(st.view.upcoming[i].comp)), "options : adversaire, compétition, date");
  assert(page().querySelectorAll(".tactic-selected .tactic-rank").length === 3 && page().querySelector(".area-ordresCardAttaque") && page().querySelector(".area-ordresCardDefense"), "Attaque : priorités offensives à 3 puces, Défense");
  assert(page().querySelector(".compo-court") && page().querySelector(".conv-list"), "Composition sur terrain + effectif (feuille de match)");
  assert(page().querySelector(".area-ordresCardMinutes"), "carte Temps de jeu");
  assert(doc.getElementById("ncOrdresCss") && /#ncOrdres/.test(doc.getElementById("ncOrdresCss").textContent), "styles des Ordres du club repris pour la page");
  const confirmed = page().querySelector(".ordres-settings-grid-nested");
  const tierBtn = [...page().querySelectorAll(".tier-toggle-btn")].find(b => b.dataset.value === "confirmée");
  const wasHidden = confirmed.classList.contains("hidden");
  tierBtn.click();
  assert(wasHidden && !confirmed.classList.contains("hidden") && !page().querySelector(".area-ordresCardAdversaires").classList.contains("hidden"), "niveau tactique : réglages confirmés et postes à surveiller affichés");
  assert(/Modifications à valider/.test(doc.getElementById("ncTqStatus").textContent), "état : modifications à valider");
  // Feuille de match : 12 au plus parmi les 15.
  const boxes = [...page().querySelectorAll(".conv-list input[type=checkbox]")];
  assert(boxes.length === 15 && boxes.filter(b => b.checked).length === 12 && boxes.filter(b => !b.checked).every(b => b.disabled), "12 de la feuille de match parmi les 15");
  // Défense : changer le système puis enregistrer.
  const zone = [...page().querySelectorAll(".area-ordresCardDefense .seg-btn")].find(b => b.dataset.value === "Zone intérieure");
  zone.click();
  page().querySelector("[data-nc-tq-save]").click();
  await win.__lastNationalCoach; await flush(dom);
  const md = st.view.plans[next.id];
  assert(md && md.defense === "Zone intérieure" && md.tacticalTier === "confirmée" && md.lineup.convoked.length === 12, "ordres du match enregistrés (m.plans) avec la feuille de match");
  assert(st.view.tactics.defense !== "Zone intérieure", "tactique par défaut inchangée");
  assert(/Modifier vos ordres/.test(topBtn().textContent) && topBtn().classList.contains("topbar-cta-validated"), "barre du haut : « Modifier vos ordres »");
  assert(/Ordres validés/.test(doc.getElementById("ncTqStatus").textContent) && /préparé/.test(page().querySelector("select[data-nc-tq-match]").options[0].textContent), "état « Ordres validés », match marqué préparé");

  // Autre match : ses propres ordres, pas ceux du premier.
  if (st.view.upcoming[1]) {
    const s2 = page().querySelector("select[data-nc-tq-match]");
    s2.value = String(st.view.upcoming[1].id);
    s2.dispatchEvent(new win.Event("change", { bubbles: true }));
    await flush(dom);
    const on = [...page().querySelectorAll(".area-ordresCardDefense .seg-btn.active")].map(b => b.dataset.value);
    assert(!on.includes("Zone intérieure"), "autre match : ses propres ordres (tactique par défaut)");
  }

  // Verrou T − 5 min : bouton « Ordres verrouillés », page en lecture seule.
  st.view.upcoming[0].lockAt = Date.now() - 1000;
  st.tqMatch = String(next.id); st.tq = null;
  doc.querySelector('#ncSidebar [data-nc-nav="tactique"]').click();
  await flush(dom);
  assert(/Ordres verrouillés/.test(topBtn().textContent) && topBtn().disabled, "barre du haut : « Ordres verrouillés »");
  assert(page().querySelector(".ordres-lock-note") && page().querySelector("[data-nc-tq-save]").disabled && page().querySelector(".lineup-editor.readonly"), "verrouillé : lecture seule, Enregistrer désactivé");
  // Serveur : refus d'un match inconnu.
  const bad = await post("/api/national/coach/tactics", { matchId: "inconnu", orders: md });
  assert(!bad.ok, "serveur : match inconnu refusé");
  // Sans le droit « tactics » (recruteur) : pas de bouton d'ordres.
  st.view.perms = require("./server/nationalCoach.js").PERMS.recruiter;
  doc.querySelector('#ncSidebar [data-nc-nav="dashboard"]').click();
  await flush(dom);
  assert(!topBtn(), "sans le droit « tactics » : pas de bouton d'ordres");
  dom.window.close(); server.close();
  console.log("\n🏁 national_tactics_ui_test.js : Tactique de la sélection conforme aux Ordres du club.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
