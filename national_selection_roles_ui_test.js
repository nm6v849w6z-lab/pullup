// Mode Sélection : améliorations du 2026-10-07, côté navigateur, ligue
// partagée à 2 managers (Lyon = sélectionneur de la France A, Paris).
//  1. « Liste des joueurs » (ex-« Joueurs sélectionnables ») ;
//  2. onglet « Joueurs suivis » (qui suit chaque joueur) ;
//  3. rôles cumulables (le sélectionneur se nomme recruteur + scout) ;
//  4. fiche joueur depuis Liste des joueurs, Présélection, Convoqués ;
//  5. proposition de poste dans la messagerie, « Accepter le poste »
//     relié à la vraie acceptation, état cohérent ensuite ;
//  6-8. onglet Sélections : sélection du pays du club, choix du pays,
//     bascule Équipe A / U21.
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-roles";
const fs = require("fs");
const store = require("./server/store.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wait = async (fn, label, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await sleep(100); } throw new Error("❌ attente : " + label); };

(async () => {
  const now0 = Date.now();
  const { server, multiSavePath, baseUrl } = await startTestServer();
  const career = store.createMultiManagerCareer(["Lyon Sel", "Paris Sel"], now0, "Lyon Sel");
  career.league.country = "fr";
  career.league.teams.forEach(t => t.players.forEach(p => { p.nationality = "fr"; p.injuryUntil = null; }));
  await store.saveMultiLeague(career.league, multiSavePath);
  const L = career.league.teams.findIndex(t => t.name === "Lyon Sel"), P = career.league.teams.findIndex(t => t.name === "Paris Sel");
  const tok = { lyon: career.league.teams[L].managerLinkToken, paris: career.league.teams[P].managerLinkToken };
  const call = async (who, path, body) => {
    const res = await fetch(new URL(path, baseUrl), body ? { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": tok[who] }, body: JSON.stringify(body) } : { headers: { "X-TipIn-Token": tok[who] } });
    return res.json();
  };
  // Monde et sélections créés au premier passage (comme à l'ouverture du jeu).
  for (let i = 0; i < 40; i++) { const o = await call("lyon", "api/national/overview"); if (o.ok && (o.teams || []).length) break; await sleep(300); }
  const ap = await fetch(new URL("api/admin/national", baseUrl), { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ action: "appoint", teamId: "fr-A", club: "Lyon Sel" }) }).then(r => r.json());
  assert(ap.ok, "Lyon nommé sélectionneur de la France A (admin) " + (ap.ok ? "" : JSON.stringify(ap)));
  // Vivier et annuaire des managers : calculés au passage du monde.
  let cv = null;
  for (let i = 0; i < 60; i++) {
    cv = await call("lyon", "api/national/coach?id=fr-A");
    if (cv.ok && cv.pool && cv.pool.players.length && cv.managers.some(m => m.clubName === "Paris Sel")) break;
    await sleep(500);
  }
  assert(cv.ok && cv.pool && cv.pool.players.length >= 6, "vivier calculé (" + (cv.pool ? cv.pool.players.length : 0) + " joueurs)");
  const me = cv.managers.find(m => m.roles && m.roles.includes("coach"));
  const paris = cv.managers.find(m => m.clubName === "Paris Sel");
  assert(me && paris, "annuaire : le sélectionneur (ses casquettes) et Paris");

  // 3) Rôles cumulables : Lyon se nomme recruteur et scout (en poste tout de suite).
  for (const role of ["recruiter", "scout"]) assert((await call("lyon", "api/national/coach/staff/invite", { teamId: "fr-A", mid: me.mid, role })).ok, "Lyon se nomme " + role);
  // Joueur en tête de la Liste des joueurs (tri par GEN, 50 affichés).
  const genOf = x => (x.gen != null ? x.gen : x.ovr);
  const target = cv.pool.players.slice().sort((a, b) => genOf(b) - genOf(a))[0];
  const tref = { p: target.p, n: target.n };
  assert((await call("lyon", "api/national/coach/staff/assign", { teamId: "fr-A", mid: me.mid, on: true, player: tref })).ok, "joueur attribué à Lyon (scout) : suivi et présélectionné");

  // 5) Proposition de poste à Paris : message dans la messagerie.
  assert((await call("lyon", "api/national/coach/staff/invite", { teamId: "fr-A", mid: paris.mid, role: "assistant" })).ok, "Paris invité comme adjoint");
  const thread = await call("paris", "api/messages/thread?with=" + L);
  const inv = thread.ok && thread.messages.find(m => m.meta && m.meta.kind === "natStaffInvite");
  assert(inv && inv.meta.teamId === "fr-A" && inv.meta.role === "assistant" && /Proposition de poste : adjoint de/.test(inv.text) && !inv.mine, "messagerie de Paris : proposition (rôle, sélection), de la part de Lyon");

  // --- Paris : la messagerie, bouton « Accepter le poste ».
  let dom = await openGame(html, `${baseUrl}?m=${tok.paris}`);
  await dom.window.__gameReady; await flush(dom);
  let win = dom.window, doc = win.document;
  win.confirm = () => true;
  win.eval(`goToMessages(${L})`);
  await wait(() => doc.querySelector("[data-nc-msg-accept]"), "bouton « Accepter le poste »");
  const box = doc.querySelector(".nc-msg-act");
  assert(/Adjoint/.test(box.textContent) && /France/.test(box.textContent) && /Accepter le poste/.test(box.textContent), "message : rôle, sélection et « Accepter le poste »");
  doc.querySelector("[data-nc-msg-accept]").click();
  await wait(() => doc.querySelector(".nc-msg-act .nc-tag.ok"), "poste accepté");
  assert(!doc.querySelector("[data-nc-msg-accept]") && /Poste accepté/.test(doc.querySelector(".nc-msg-act").textContent), "après acceptation : « Poste accepté », plus de bouton");
  const again = await call("paris", "api/national/coach/staff/respond", { teamId: "fr-A", role: "assistant", accept: true });
  assert(!again.ok, "pas d'acceptation multiple (" + again.error + ")");
  const pv = await call("paris", "api/national/coach?id=fr-A");
  assert(pv.ok && pv.roles.join() === "assistant", "Paris : adjoint de la France A (vrai processus d'acceptation)");
  dom.window.close();

  // --- Lyon : le Mode Sélection.
  dom = await openGame(html, `${baseUrl}?m=${tok.lyon}`);
  await dom.window.__gameReady; await flush(dom);
  win = dom.window; doc = win.document;
  win.confirm = () => true;
  win.eval("HM_NATIONAL_COACH.enterMode('fr-A')");
  await wait(() => win.HM_NATIONAL_COACH.state.view, "vue du mode");
  const st = win.HM_NATIONAL_COACH.state;
  const content = () => doc.getElementById("nationalContent");
  const side = () => doc.getElementById("ncSidebar").textContent;
  const nav = async key => { doc.querySelector(`#ncSidebar [data-nc-nav="${key}"]`).click(); await flush(dom); await sleep(50); };
  assert(/Sélectionneur · Recruteur · Scout/.test(side()), "menu : toutes les casquettes (Sélectionneur · Recruteur · Scout)");
  assert(/Liste des joueurs/.test(side()) && /Joueurs suivis/.test(side()) && !/Joueurs sélectionnables/.test(side()), "1. « Liste des joueurs » + onglet « Joueurs suivis »");

  const pdpOpens = async (btn, label) => {
    assert(btn, label + " : nom cliquable");
    btn.click();
    await wait(() => !doc.getElementById("playerDetailSection").classList.contains("hidden") && doc.getElementById("playerDetailContent").textContent.includes(target.name), label + " : fiche");
    assert(true, "4. " + label + " : fiche joueur (caractéristiques) ouverte");
    await nav("dashboard");
  };
  const sel = `[data-nc-profile$="|${target.p}"]`;
  await nav("joueurs");
  assert(/Liste des joueurs/.test(content().querySelector("h2.page-title").textContent), "titre de page : « Liste des joueurs »");
  await pdpOpens(content().querySelector(sel), "Liste des joueurs");

  await nav("suivis");
  const row = [...content().querySelectorAll(".nc-followed tbody tr")].find(r => r.textContent.includes(target.name));
  assert(row && /Vous/.test(row.textContent) && /Scout/.test(row.textContent), "2. Joueurs suivis : joueur suivi par « Vous · Scout »");
  assert(/Suivi par/.test(content().querySelector(".nc-followed thead").textContent), "colonne « Suivi par » (sélectionneur)");
  await pdpOpens(content().querySelector(".nc-followed " + sel), "Joueurs suivis");

  await nav("preselection");
  await pdpOpens(content().querySelector(sel), "Présélection");

  const cur = st.view.gatherings.find(x => !x.frozen && !x.past && !x.bye);
  if (cur) {
    assert((await call("lyon", "api/national/coach/convocation", { teamId: "fr-A", gatheringId: cur.gid, players: [tref] })).ok, "joueur convoqué");
    win.eval("HM_NATIONAL_COACH.enterMode('fr-A')");
    await wait(() => st.view && st.view.gatherings.some(g => g.players.length), "vue rechargée");
    await nav("convocations");
    await pdpOpens(content().querySelector(".nc-table " + sel), "Convoqués");
  } else {
    // Pas de rassemblement ouvert dans ce calendrier : un rassemblement
    // figé de la vue (même rendu que la page Convoqués).
    const t0 = Date.now() + 5 * 864e5;
    st.view.gatherings = [{ gid: "g-test", label: "Fenêtre test", kind: "window", startAt: t0, endAt: t0 + 864e5, freezeAt: t0 - 3 * 864e5, frozen: true, past: false, matches: [], changes: [], players: [{ ref: tref, nid: 1, status: "ok" }] }];
    st.view.currentGid = "g-test";
    await nav("convocations");
    await pdpOpens(content().querySelector(".nc-table " + sel), "Convoqués");
  }

  // Scout seul (droits du serveur appliqués au menu) : pas de « Suivi par ».
  const { PERMS } = require("./server/nationalCoach.js");
  st.view.perms = PERMS.scout; st.view.roles = ["scout"]; st.view.role = "scout";
  st.view.followed = st.view.followed.filter(e => e.by.some(b => b.mine));
  await nav("suivis");
  assert(!/Suivi par/.test(content().textContent) && /Joueurs que vous suivez/.test(content().textContent), "scout seul : seulement ses joueurs, sans la colonne « Suivi par »");
  win.eval("HM_NATIONAL_COACH.exitMode()");
  await flush(dom);

  // 6-8) Onglet Sélections nationales.
  const nbox = () => doc.getElementById("nationalContent");
  win.eval("TAB_HANDLERS.selections()");
  await win.__lastNational;
  await wait(() => win.HM_NATIONAL.state.team && nbox().querySelector(".nt-hero h1"), "page de la sélection");
  assert(/France\s+A/.test(nbox().querySelector(".nt-hero h1").textContent), "6. arrivée directe sur la France A (pays du club)");
  const country = () => nbox().querySelector("[data-nt-country]");
  const catOn = () => nbox().querySelector(".nt-seg button.on").dataset.ntCat;
  assert(country().value === "fr" && catOn() === "A", "sélecteur : France, « Équipe A » active");
  nbox().querySelector('[data-nt-tab="selectionneurs"]').click();
  country().value = "es";
  country().dispatchEvent(new win.Event("change", { bubbles: true }));
  await win.__lastNational;
  await wait(() => win.HM_NATIONAL.state.team && win.HM_NATIONAL.state.team.team.id === "es-A", "Espagne A");
  assert(/Espagne\s+A/.test(nbox().querySelector(".nt-hero h1").textContent) && country().value === "es" && catOn() === "A", "7. changement de pays : Espagne A (même catégorie)");
  assert(win.HM_NATIONAL.state.teamTab === "selectionneurs" && !nbox().querySelector("[data-nc-enter]"), "même onglet ; pas de Mode Sélection (aucun rôle en Espagne)");
  nbox().querySelector('[data-nt-cat="U21"]').click();
  await win.__lastNational;
  await wait(() => win.HM_NATIONAL.state.team && win.HM_NATIONAL.state.team.team.id === "es-U21", "Espagne U21");
  assert(/Espagne\s+U21/.test(nbox().querySelector(".nt-hero h1").textContent) && country().value === "es" && catOn() === "U21", "8. bascule U21 : même pays, sélection consultée indiquée");
  country().value = "fr";
  country().dispatchEvent(new win.Event("change", { bubbles: true }));
  await wait(() => win.HM_NATIONAL.state.team && win.HM_NATIONAL.state.team.team.id === "fr-U21", "France U21");
  nbox().querySelector('[data-nt-cat="A"]').click();
  await wait(() => win.HM_NATIONAL.state.team && win.HM_NATIONAL.state.team.team.id === "fr-A", "France A");
  assert(nbox().querySelector("[data-nc-enter]"), "retour sur la France A : Mode Sélection (droits à jour)");
  nbox().querySelector("[data-nt-back]").click();
  await win.__lastNational;
  await wait(() => nbox().querySelectorAll(".nt-table tbody tr").length === 17, "vue d'ensemble");
  assert(true, "« Toutes les sélections » : vue d'ensemble (17 pays)");
  dom.window.close(); server.close();
  console.log("\n🏁 national_selection_roles_ui_test.js : Mode Sélection (liste, suivis, rôles, fiche, proposition, pays, A/U21) conforme.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
