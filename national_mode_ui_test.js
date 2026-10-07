// Mode Sélection (assets/national-coach.js) côté navigateur, refonte du
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
  assert(!doc.querySelector("[data-nc-enter]") && !doc.getElementById("ncModeBtn"), "sans mandat : aucun bouton Mode Sélection");
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
  assert(/Mode Sélection/.test(btn.textContent) && btn.querySelector(".nat-flag"), "tableau de bord : « Mode Sélection » avec le drapeau, à côté de l'analyse");
  assert(btn.closest(".hm-head") && btn.closest(".hm-head").querySelector(".hm-head__analyse-btn"), "même en-tête que « Analyse de mon équipe »");
  assert(!doc.getElementById("ncModeBtn"), "mode Club : rien dans la barre du haut");
  btn.click();
  await wait(() => doc.body.classList.contains("nc-mode") && doc.getElementById("ncSidebar") && win.HM_NATIONAL_COACH.state.view, "entrée dans le mode");
  await flush(dom); await new Promise(r => setTimeout(r, 300));
  const side = doc.getElementById("ncSidebar").textContent;
  assert(["Tableau de bord", "Joueurs sélectionnables", "Présélection", "Convoqués", "Tactique", "Vestiaire", "Calendrier", "Qualifications", "Compétitions", "Matchs amicaux", "Analyse des adversaires", "Statistiques", "Notifications", "Staff", "Mandat", "Retour au mode Club"].every(x => side.includes(x)), "sélectionneur : toutes les rubriques nationales");
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
    assert(!content().querySelector("[data-nc-pview]") && !/Forme récente/.test(content().textContent), "Sélectionnables : ni onglet Statistiques ni Forme récente (2026-10-06)");
    assert(!content().querySelector('[data-nc-list="watchlist"]'), "Sélectionnables : plus de bouton Suivre");
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
    // Sélectionneur (droit « assign ») : « Attribuer à un scout » à la place
    // de Suivre / Ne plus suivre (2026-10-07).
    check2(box() && /Ajouter à la présélection/.test(box().textContent) && /Attribuer à un scout/.test(box().textContent) && !box().querySelector('[data-nc-pdp-list="watchlist"]'), "fiche joueur : présélection et « Attribuer à un scout » (plus de Suivre)");
    check2(box().previousElementSibling && !box().closest(".pdp2-ring"), "boutons placés sous la note");
    // Notes sur un joueur d'un autre club : bloc en bas de la fiche.
    {
      const other = (st.view.pool.players || []).find(p => !(p.club && p.club.leagueId === win.eval("league.leagueId") && p.club.idx === win.eval("myTeamIndex")));
      if (other) {
        win.HM_NATIONAL_COACH.state.view.notes = { [other.p + "|" + other.n]: [{ id: 1, at: Date.now(), byName: "Coach X", role: "assistant", text: "Bon défenseur.", mine: false }] };
        const html = win.HM_NATIONAL_COACH.pdpNotesHtml({ id: other.p, name: other.n });
        check2(/Notes de la sélection/.test(html) && /Bon défenseur/.test(html) && /data-nc-note-add/.test(html), "notes : bloc avec les notes du staff et le champ d'ajout");
      }
    }
    check2(box().querySelector("button[disabled]") && /Attribuer à un scout/.test(box().querySelector("button[disabled]").textContent), "aucun scout en poste : bouton d'attribution désactivé");
    const realStaff = st.view.staff;
    st.view.staff = [{ mid: "s1", pseudo: "Scout A", role: "scout", status: "active" }, { mid: "s2", pseudo: "Scout B", role: "scout", status: "active" }];
    win.eval(`showPlayerDetail(${x.club.idx}, ${x.p})`);
    check2(box().querySelector("[data-nc-pdp-scout]") && box().querySelectorAll("[data-nc-pdp-scout] option").length === 2 && box().querySelector('[data-nc-pdp-assign][data-nc-on="1"]'), "plusieurs scouts : choix du scout puis « Attribuer à un scout »");
    st.view.staff = realStaff;
    if (pool.length) {
      box().querySelector('[data-nc-pdp-list="preselection"]').click();
      await win.__lastNationalCoach;
      check2(st.view.preselection.some(r => r.p === x.p && r.n === x.n) && /Retirer de la présélection/.test(box().textContent), "clic : joueur en présélection, bouton mis à jour");
    }
    // Sans droit d'attribution (personne aidante) : Suivre reste.
    const realPerms = st.view.perms;
    st.view.perms = require("./server/nationalCoach.js").PERMS.helper;
    win.eval(`showPlayerDetail(${x.club.idx}, ${x.p})`);
    check2(!doc.querySelector('#playerDetailSection [data-nc-pdp-list="watchlist"]') && !/Attribuer/.test((box() || { textContent: "" }).textContent), "personne aidante : ni Suivre ni attribution sur la fiche");
    // Notes de la sélection : jamais sur un joueur de son propre club.
    const ownClub = win.eval(`teamA.players.some(p => p.id === ${x.p})`);
    if (ownClub) check2(!doc.querySelector("#playerDetailSection .nc-notes"), "notes : pas sur un joueur de son propre club");
    st.view.perms = realPerms;
  }
  // Vestiaire (2026-10-06) : la dynamique de groupe du club, sur les joueurs
  // de la sélection.
  doc.querySelector('#ncSidebar [data-nc-nav="vestiaire"]').click();
  await wait(() => doc.querySelector(".nc-side-link.on[data-nc-nav=vestiaire]") && doc.getElementById("ncVestiaire"), "rubrique vestiaire");
  await wait(() => !/Chargement du vestiaire/.test(doc.getElementById("ncVestiaire").textContent), "vestiaire rendu");
  const vsTeam = win.eval("HM_NATIONAL_COACH.state.view.tacticsPlayers.length");
  if (vsTeam) {
    assert(doc.querySelector("#ncVestiaire .vs-tabs") && win.__lastVestiaire && win.__lastVestiaire.players.length === vsTeam, `vestiaire de la sélection : mêmes vues que le club, ${vsTeam} joueurs`);
    doc.querySelector('#ncVestiaire [data-vs-tab="groups"]').click();
    assert(doc.querySelector('#ncVestiaire [data-vs-tab="groups"].active'), "vestiaire : changement d'onglet (Groupes)");
    assert(!doc.querySelector("#ncVestiaire [data-player-team]"), "vestiaire : liens vers les fiches de la sélection, pas du club");
  } else assert(/Aucun joueur/.test(doc.getElementById("ncVestiaire").textContent), "vestiaire : message sans joueurs");
  // Tactique : Cohérence du cinq en brique pleine largeur, sous Composition.
  doc.querySelector('#ncSidebar [data-nc-nav="tactique"]').click();
  await wait(() => doc.querySelector("#ncTqGrid .ordres-coh-card"), "tactique : brique cohérence");
  {
    const coh = doc.querySelector("#ncTqGrid .ordres-coh-card");
    const panel = coh.parentElement;
    const kids = [...panel.children];
    assert(kids.indexOf(coh) === kids.indexOf(panel.querySelector(":scope > .lineup-editor")) + 1 && coh.nextElementSibling.classList.contains("prep-columns"), "tactique : Cohérence du cinq entre Composition et Attaque / Défense");
    if (vsTeam >= 5) assert(!coh.classList.contains("hidden") && coh.querySelector(".coh-kpis"), "tactique : cohérence du cinq affichée");
  }
  doc.querySelector('#ncSidebar [data-nc-nav="tactique"]').click();
  check2(!doc.getElementById("selectionsSection").classList.contains("hidden") && doc.getElementById("playerDetailSection").classList.contains("hidden") && doc.querySelector(".nc-side-link.on[data-nc-nav=tactique]"), "depuis la fiche joueur : clic dans le menu → rubrique affichée");
  // Menus selon le rôle (refonte du 2026-10-07 : mêmes droits que le
  // serveur, nationalCoach.PERMS / APPOINT).
  const { PERMS, APPOINT } = require("./server/nationalCoach.js");
  const asRole = (role) => {
    st.view.perms = PERMS[role]; st.view.role = role; st.view.appoint = APPOINT[role] || []; st.nav = "dashboard";
    doc.querySelector("#ncSidebar [data-nc-nav]").click();
    return doc.getElementById("ncSidebar").textContent;
  };
  const sideRec = asRole("recruiter");
  assert(/Joueurs sélectionnables/.test(sideRec) && /Joueurs suivis/.test(sideRec) && /Staff/.test(sideRec) && !/Tableau de bord|Tactique|Matchs amicaux|Convoqués|Mandat|Analyse des adversaires/.test(sideRec), "recruteur (DTN) : joueurs, joueurs suivis, staff (scouts)");
  doc.querySelector('#ncSidebar [data-nc-nav="staff"]').click();
  assert(/DTN/.test(content().textContent) && !/Staff NT|Adjoints|Personnes aidantes/.test(content().textContent) && [...content().querySelectorAll("[data-nc-staff-invite]")].every(b => b.dataset.ncRole === "scout"), "recruteur : page Staff limitée à la DTN, ne nomme que des scouts");
  const sideScout = asRole("scout");
  assert(/Mes joueurs attribués/.test(sideScout) && !/Tableau de bord|Joueurs sélectionnables|Tactique|Staff|Convoqués/.test(sideScout), "scout : uniquement ses joueurs attribués");
  const sideHelp = asRole("helper");
  assert(/Tactique/.test(sideHelp) && /Convoqués/.test(sideHelp) && !/Matchs amicaux|Staff|Mandat|Statistiques/.test(sideHelp), "personne aidante : roster et ordres en consultation, pas d'administration");
  doc.querySelector('#ncSidebar [data-nc-nav="tactique"]').click();
  await new Promise(r => setTimeout(r, 200));
  assert(!content().querySelector("[data-nc-tq-save]") && /Consultation/.test(content().textContent), "personne aidante : tactique en lecture seule");
  const sideAss = asRole("assistant");
  assert(["Tactique", "Convoqués", "Matchs amicaux", "Staff", "Mandat", "Statistiques"].every(x => sideAss.includes(x)), "adjoint : mêmes rubriques que le sélectionneur");
  doc.querySelector('#ncSidebar [data-nc-nav="staff"]').click();
  assert(/Staff NT/.test(content().textContent) && /DTN/.test(content().textContent) && ![...content().querySelectorAll("[data-nc-staff-invite]")].some(b => b.dataset.ncRole === "assistant"), "adjoint : Staff complet, mais ne nomme pas d'adjoint");
  asRole("coach");
  assert(win.localStorage.getItem("hm-nat-mode") === "fr-A", "mode mémorisé pour le prochain chargement");
  doc.querySelector("#ncSidebar [data-nc-exit]").click();
  await flush(dom);
  assert(!doc.body.classList.contains("nc-mode") && !doc.getElementById("ncSidebar") && !doc.getElementById("ncModeBtn"), "retour au mode Club (depuis le menu du mode)");
  await wait(() => doc.querySelector("#ncDashSlot [data-nc-enter]"), "bouton du tableau de bord après le retour");
  dom.window.close(); server.close();
  console.log("\n🏁 national_mode_ui_test.js : mode Sélectionneur conforme.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
