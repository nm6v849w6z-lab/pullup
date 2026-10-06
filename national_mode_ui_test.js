// Mode Sélectionneur (assets/national-coach.js) côté navigateur, refonte du
// 2026-10-06 : entrée par le bouton du tableau de bord du club (à côté de
// « Analyse de mon équipe ») seulement avec un mandat, rien dans la barre du
// haut en mode Club ; environnement séparé (menu latéral propre filtré par
// rôle, rubriques nationales seulement) ; « Retour au mode Club » à
// l'intérieur du mode ; postes aux abréviations du jeu ; tableau triable ;
// Convocations en une seule page ; plus de rubrique « Joueurs suivis ».
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-mode";
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const check2 = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const wait = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 100)); } throw new Error("❌ attente : " + label); };

(async () => {
  const { server, baseUrl } = await startTestServer();
  let dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  let win = dom.window, doc = win.document;
  await new Promise(r => setTimeout(r, 800));
  assert(!doc.querySelector("[data-nc-enter]") && !doc.getElementById("ncModeBtn"), "sans mandat : aucun bouton Mode Sélectionneur");
  const club = win.eval("teamA.name");
  const res = await fetch(baseUrl.replace(/\/?(\?.*)?$/, "/") + "api/admin/national", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ action: "appoint", teamId: "fr-A", club }) }).then(r => r.json());
  assert(res.ok, "nomination de test (admin)");
  dom.window.close();
  dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  win = dom.window; doc = win.document;
  win.eval("TAB_HANDLERS.club()");
  await wait(() => doc.querySelector("#ncDashSlot [data-nc-enter]"), "bouton du tableau de bord");
  const btn = doc.querySelector("#ncDashSlot [data-nc-enter]");
  assert(/Mode Sélectionneur/.test(btn.textContent) && btn.querySelector(".nat-flag"), "tableau de bord : « Mode Sélectionneur » avec le drapeau, à côté de l'analyse");
  assert(btn.closest(".hm-head") && btn.closest(".hm-head").querySelector(".hm-head__analyse-btn"), "même en-tête que « Analyse de mon équipe »");
  assert(!doc.getElementById("ncModeBtn"), "mode Club : rien dans la barre du haut");
  btn.click();
  await wait(() => doc.body.classList.contains("nc-mode") && doc.getElementById("ncSidebar") && win.HM_NATIONAL_COACH.state.view, "entrée dans le mode");
  await flush(dom); await new Promise(r => setTimeout(r, 300));
  const side = doc.getElementById("ncSidebar").textContent;
  assert(["Tableau de bord", "Joueurs sélectionnables", "Présélection", "Convoqués", "Tactique", "Calendrier", "Qualifications", "Compétitions", "Matchs amicaux", "Analyse des adversaires", "Statistiques", "Notifications", "Staff", "Mandat", "Retour au mode Club"].every(x => side.includes(x)), "sélectionneur : toutes les rubriques nationales");
  assert(!/Joueurs suivis|Convocations/.test(side), "plus de rubrique « Joueurs suivis » ni de doublon Convocations / Convoqués");
  assert(/Retour au mode Club/.test(doc.getElementById("ncModeBtn").textContent), "en mode : « Retour au mode Club » dans l'environnement Sélectionneur");
  assert(/France A/.test(doc.getElementById("ncTopTitle").textContent), "barre du haut : la sélection");
  const content = () => doc.getElementById("nationalContent");
  assert(/Prochain match/.test(content().textContent) && !/Budget|Donnez vos ordres/.test(content().textContent), "tableau de bord de la sélection, rien du club");
  for (const nav of ["joueurs", "preselection", "convocations", "tactique", "calendrier", "amicaux", "analyse", "staff", "notifications", "mandat"]) {
    doc.querySelector(`#ncSidebar [data-nc-nav="${nav}"]`).click();
    await wait(() => doc.querySelector(`.nc-side-link.on[data-nc-nav="${nav}"]`), "rubrique " + nav);
  }
  // Joueurs sélectionnables : pas de carte de rassemblement, colonnes, tri.
  doc.querySelector('#ncSidebar [data-nc-nav="joueurs"]').click();
  await wait(() => doc.querySelector(".nc-side-link.on[data-nc-nav=joueurs]"), "joueurs");
  const st = win.HM_NATIONAL_COACH.state;
  if (st.view.pool && st.view.pool.players.length) {
    assert(!content().querySelector(".nc-next") && !/CONVOQUÉS|Convoqués\s*0/i.test(content().textContent), "Sélectionnables : ni carte de rassemblement ni bloc des convoqués");
    const heads = [...content().querySelectorAll("th[data-nc-sort]")].map(th => th.textContent.trim());
    assert(["Nom", "Âge", "Poste", "Taille", "GEN", "Physique", "Mental", "État"].every(h => heads.includes(h)) && !heads.includes("MJ") && !heads.includes("Forme récente"), "Caractéristiques : identité, caractéristiques, état (stats de saison à part, comme l'Effectif)");
    content().querySelector('[data-nc-pview="stats"]').click();
    const heads2 = [...content().querySelectorAll("th[data-nc-sort]")].map(th => th.textContent.trim());
    assert(["Nom", "MJ", "Pts", "Forme récente"].every(h => heads2.includes(h)) && !heads2.includes("Physique"), "onglet Statistiques : stats de la saison en club et forme récente");
    content().querySelector('[data-nc-pview="caracs"]').click();
    assert(!/\b(MEN|ARR|AIS|AIF|PIV)\b/.test(content().textContent) && content().querySelector(".eff-pos"), "postes aux abréviations du jeu (badges de l'Effectif)");
    const ageOf = () => [...content().querySelectorAll("tbody tr.eff-row")].map(tr => Number(tr.children[1].textContent));
    content().querySelector('th[data-nc-sort="age"]').click();
    const a1 = ageOf();
    assert(a1.every((v, i) => !i || a1[i - 1] <= v), "tri par âge (croissant)");
    content().querySelector('th[data-nc-sort="age"]').click();
    const a2 = ageOf();
    assert(a2.every((v, i) => !i || a2[i - 1] >= v), "second clic : tri inversé");
  } else console.log("ℹ️ vivier pas encore calculé : tableau non vérifié");
  // Fiche joueur ouverte depuis le mode : le menu latéral reste utilisable
  // (retour utilisateur 2026-10-06, il fallait la flèche du navigateur).
  win.eval("showPlayerDetail(myTeamIndex, teamA.players[0].id)");
  check2(!doc.getElementById("playerDetailSection").classList.contains("hidden") && doc.getElementById("ncSidebar"), "fiche joueur ouverte, menu du mode toujours là");
  // Fiche d'un joueur sélectionnable : « Ajouter à la présélection » et
  // « Ajouter aux joueurs suivis » sous la note (retour utilisateur 2026-10-06).
  {
    const lgId = win.eval("league.leagueId");
    const pool = (st.view.pool && st.view.pool.players) || [];
    let x = pool.find(q => q.club && q.club.leagueId === lgId);
    if (!x) {
      // Vivier pas encore calculé : un joueur du club, ajouté au vivier côté client (affichage seulement).
      const pl = win.eval("({ id: teamA.players[0].id, name: teamA.players[0].name })");
      x = { p: pl.id, n: pl.name, name: pl.name, club: { leagueId: lgId, idx: win.eval("myTeamIndex") } };
      st.view.pool = Object.assign({}, st.view.pool || {}, { players: pool.concat([x]) });
    }
    win.eval(`showPlayerDetail(${x.club.idx}, ${x.p})`);
    const box = () => doc.querySelector("#playerDetailSection .nc-pdp-acts");
    check2(box() && /Ajouter à la présélection/.test(box().textContent) && /Ajouter aux joueurs suivis/.test(box().textContent), "fiche joueur : boutons présélection et joueurs suivis");
    check2(box().previousElementSibling && !box().closest(".pdp2-ring"), "boutons placés sous la note");
    if (pool.length) {
      box().querySelector('[data-nc-pdp-list="watchlist"]').click();
      await win.__lastNationalCoach;
      check2(st.view.watchlist.some(r => r.p === x.p && r.n === x.n) && /Ne plus suivre/.test(box().textContent), "clic : joueur suivi, bouton mis à jour");
      box().querySelector('[data-nc-pdp-list="preselection"]').click();
      await win.__lastNationalCoach;
      check2(st.view.preselection.some(r => r.p === x.p && r.n === x.n) && /Retirer de la présélection/.test(box().textContent), "clic : joueur en présélection, bouton mis à jour");
    }
  }
  doc.querySelector('#ncSidebar [data-nc-nav="tactique"]').click();
  check2(!doc.getElementById("selectionsSection").classList.contains("hidden") && doc.getElementById("playerDetailSection").classList.contains("hidden") && doc.querySelector(".nc-side-link.on[data-nc-nav=tactique]"), "depuis la fiche joueur : clic dans le menu → rubrique affichée");
  // Rôle recruteur : menu filtré.
  st.view.perms = ["view", "watch", "analysis"]; st.view.role = "scout"; st.nav = "dashboard";
  doc.querySelector('#ncSidebar [data-nc-nav="dashboard"]').click();
  const side2 = doc.getElementById("ncSidebar").textContent;
  assert(/Joueurs sélectionnables/.test(side2) && /Analyse des adversaires/.test(side2) && !/Tactique|Matchs amicaux|Staff|Convoqués|Mandat/.test(side2), "recruteur : joueurs et analyse seulement");
  st.view.perms = ["view", "watch", "preselectView", "convocView", "tactics", "feed", "analysis", "calendar"]; st.view.role = "assistant";
  doc.querySelector('#ncSidebar [data-nc-nav="dashboard"]').click();
  const side3 = doc.getElementById("ncSidebar").textContent;
  assert(/Tactique/.test(side3) && /Convoqués/.test(side3) && !/Matchs amicaux|Staff|Mandat|Statistiques/.test(side3), "adjoint : pas d'administration (amicaux, staff, mandat)");
  assert(win.localStorage.getItem("hm-nat-mode") === "fr-A", "mode mémorisé pour le prochain chargement");
  doc.querySelector("#ncSidebar [data-nc-exit]").click();
  await flush(dom);
  assert(!doc.body.classList.contains("nc-mode") && !doc.getElementById("ncSidebar") && !doc.getElementById("ncModeBtn"), "retour au mode Club (depuis le menu du mode)");
  await wait(() => doc.querySelector("#ncDashSlot [data-nc-enter]"), "bouton du tableau de bord après le retour");
  dom.window.close(); server.close();
  console.log("\n🏁 national_mode_ui_test.js : mode Sélectionneur conforme.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
