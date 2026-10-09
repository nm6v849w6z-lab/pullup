// Recherche d'un manager (41) et pastilles de rôles sur la page du club (42),
// demande du 2026-10-07. Ligue partagée à 2 managers : Lyon (pseudo
// « CoachLyonnais », sélectionneur de la France A + recruteur + scout) et
// Paris (pseudo « ParisBoss », adjoint de la France A).
//  41. Barre du haut, mode Club puis mode Sélection : partie du pseudo, sans
//      casse ; le résultat identifie le manager (pseudo, « Manager · club »)
//      et ouvre son profil ; joueurs / équipes toujours trouvés ; recherche
//      monde (/api/world/search) : managers renvoyés aussi.
//  42. Page du club (fiche équipe) : à côté du pseudo, les MÊMES pastilles
//      que sur le profil (même composant .mp-natrole, même source
//      /api/national/roles) : plusieurs rôles, pays dynamique, et une
//      pastille retirée quand le rôle est retiré ; aucun rôle = rien.
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-mgrsearch";
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
  for (let i = 0; i < 40; i++) { const o = await call("lyon", "api/national/overview"); if (o.ok && (o.teams || []).length) break; await sleep(300); }
  assert((await call("lyon", "api/manager/set-pseudo", { pseudo: "CoachLyonnais" })).ok, "pseudo de Lyon : CoachLyonnais");
  assert((await call("paris", "api/manager/set-pseudo", { pseudo: "ParisBoss" })).ok, "pseudo de Paris : ParisBoss");
  const ap = await fetch(new URL("api/admin/national", baseUrl), { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ action: "appoint", teamId: "fr-A", club: "Lyon Sel" }) }).then(r => r.json());
  assert(ap.ok, "Lyon sélectionneur de la France A");
  let cv = null;
  for (let i = 0; i < 60; i++) { cv = await call("lyon", "api/national/coach?id=fr-A"); if (cv.ok && cv.managers && cv.managers.some(m => m.clubName === "Paris Sel")) break; await sleep(500); }
  const me = cv.managers.find(m => m.roles && m.roles.includes("coach")), paris = cv.managers.find(m => m.clubName === "Paris Sel");
  for (const role of ["recruiter", "scout"]) assert((await call("lyon", "api/national/coach/staff/invite", { teamId: "fr-A", mid: me.mid, role })).ok, "Lyon se nomme " + role);
  assert((await call("lyon", "api/national/coach/staff/invite", { teamId: "fr-A", mid: paris.mid, role: "assistant" })).ok, "Paris invité adjoint");
  assert((await call("paris", "api/national/coach/staff/respond", { teamId: "fr-A", role: "assistant", accept: true })).ok, "Paris accepte : adjoint");

  // ---- 41. recherche monde (autres championnats) : World.searchWorld ----
  {
    const World = require("./server/world.js");
    const lg = (await store.loadMultiLeague(multiSavePath)).league;
    const sm = World.leagueSummary({ id: "fr-2-1", country: "fr", level: 2, group: 1 }, lg);
    const res = World.searchWorld({ summaries: { "fr-2-1": sm } }, "lyonn");
    assert((res.managers || []).some(m => m.pseudo === "CoachLyonnais" && m.clubName === "Lyon Sel" && m.leagueId === "fr-2-1" && m.label), "recherche monde : « lyonn » trouve CoachLyonnais (Lyon Sel, championnat)");
    assert(!World.searchWorld({ summaries: { "fr-2-1": sm } }, "zzzz").managers.length, "recherche monde : rien pour « zzzz »");
  }

  // ---- navigateur de Paris ----
  const dom = await openGame(html, `${baseUrl}?m=${tok.paris}`);
  await flush(dom);
  const win = dom.window, doc = win.document;
  const input = doc.getElementById("topbarSearchInput"), box = doc.getElementById("topbarSearchResults");
  const type = v => { input.value = v; input.dispatchEvent(new win.Event("input", { bubbles: true })); };
  const managerRows = () => [...box.querySelectorAll(".topbar-search-result.tsr-manager")];
  // 41. Mode Club
  type("COACHlyo");
  assert(!box.classList.contains("hidden") && managerRows().length === 1 && /CoachLyonnais/.test(managerRows()[0].textContent) && /Manager · Lyon Sel/.test(managerRows()[0].textContent), "mode Club : « COACHlyo » (partie, casse) → CoachLyonnais, « Manager · Lyon Sel »");
  type("boss");
  assert(managerRows().some(r => /ParisBoss/.test(r.textContent)), "mode Club : « boss » → ParisBoss (milieu du pseudo)");
  type("zzzz-personne");
  assert(!managerRows().length && /Aucun manager ne correspond/.test(box.textContent), "mode Club : aucun manager → message clair");
  const someone = win.eval("teamA.players[0].name").split(" ")[0];
  type(someone);
  assert(box.querySelectorAll("[data-player-id]").length > 0, "mode Club : recherche de joueurs inchangée");
  type("Lyon Sel");
  assert(box.querySelector(`[data-team-idx="${L}"]`), "mode Club : recherche d'équipes inchangée");
  type("lyonnais");
  managerRows()[0].click();
  await flush(dom);
  assert(win.eval("managerProfileState.idx") === L && /CoachLyonnais/.test(doc.getElementById("managerProfileContent").textContent), "mode Club : le résultat ouvre le profil de CoachLyonnais");

  // 42. Profil puis page du club : mêmes pastilles.
  await win.__lastMpNatRoles; await flush(dom);
  const prof = doc.getElementById("mpNatRoles");
  const pills = el => [...el.querySelectorAll(".mp-natrole")].map(x => x.textContent.replace(/\s+/g, " ").trim());
  const profPills = pills(prof);
  assert(profPills.length === 3 && /Sélectionneur\s*—\s*France/.test(profPills[0]) && /Recruteur\s*—\s*France/.test(profPills[1]) && /Scout\s*—\s*France/.test(profPills[2]), "profil : 3 pastilles (" + profPills.join(" | ") + ")");
  win.eval(`showTeamDetail(${L})`);
  await win.__lastTeamNatRoles; await flush(dom);
  const banner = doc.querySelector("#teamDetailContent .ov-chips .mp-natroles");
  assert(banner && !banner.hidden && JSON.stringify(pills(banner)) === JSON.stringify(profPills), "page du club (aperçu) : à côté du pseudo, les 3 mêmes pastilles");
  assert(banner.querySelector(".mp-natrole .nat-flag") && banner.innerHTML === prof.innerHTML, "même composant (HTML identique au profil, drapeau inclus)");
  const header = doc.querySelector("#teamDetailName .team-detail-manager .mp-natroles");
  assert(header && JSON.stringify(pills(header)) === JSON.stringify(profPills), "page du club (en-tête des autres onglets) : mêmes pastilles");
  win.eval(`showTeamDetail(${P})`);
  await win.__lastTeamNatRoles; await flush(dom);
  const pb = pills(doc.querySelector("#teamDetailContent .ov-chips .mp-natroles"));
  assert(pb.length === 1 && /Adjoint\s*—\s*France/.test(pb[0]), "page du club de Paris : [Adjoint — France]");
  // Rôle retiré → pastille retirée.
  assert((await call("lyon", "api/national/coach/staff/remove", { teamId: "fr-A", role: "scout" })).ok, "Lyon quitte son poste de scout");
  win.eval(`showTeamDetail(${L})`);
  await win.__lastTeamNatRoles; await flush(dom);
  const after = pills(doc.querySelector("#teamDetailContent .ov-chips .mp-natroles"));
  assert(after.length === 2 && !after.some(x => /Scout/.test(x)), "rôle retiré : pastille Scout disparue (" + after.join(" | ") + ")");
  // Club IA : aucune pastille.
  const cpu = win.eval("league.teams.findIndex(t => !t.isHuman)");
  win.eval(`showTeamDetail(${cpu})`);
  await win.__lastTeamNatRoles; await flush(dom);
  assert(!doc.querySelector("#teamDetailContent .mp-natrole"), "club sans manager : aucune pastille");

  // 41. Mode Sélection (Paris adjoint de la France A).
  win.eval("HM_NATIONAL_COACH.enterMode('fr-A')");
  await wait(() => doc.body.classList.contains("nc-mode"), "entrée en mode Sélection");
  await sleep(600); await flush(dom);
  type("LYONNAIS");
  assert(managerRows().length === 1 && /CoachLyonnais/.test(managerRows()[0].textContent) && /Manager · Lyon Sel/.test(managerRows()[0].textContent), "mode Sélection : « LYONNAIS » → CoachLyonnais (même rendu)");
  managerRows()[0].click();
  await flush(dom);
  assert(win.eval("managerProfileState.idx") === L, "mode Sélection : le résultat ouvre le profil du manager");

  dom.window.close();
  server.close();
  console.log("\n🏁 manager_search_roles_test.js : recherche de managers (deux modes) et pastilles de rôles sur la page du club.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
