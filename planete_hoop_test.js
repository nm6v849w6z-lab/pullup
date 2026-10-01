// Planète Hoop (retour utilisateur, 2026-09-28) : page en bas du menu (avec
// Guide et Premium). Depuis le 2026-09-30, aperçu du pays à la
// BuzzerBeater : menu déroulant des pays (le sien par défaut) + recherche,
// carte du pays, divisions et Coupe, leaders et meilleures performances,
// titres par club, historique, classement mondial ; un championnat s'ouvre
// sur la vraie page Ligue (la sienne : onglet Ligue ; une autre : même page
// en lecture seule, showForeignLeague). Voir renderPlaneteSection (moteurbasket3.html),
// /api/world/* (server/index.js) et server/world.js.
const fs = require("fs");
const store = require("./server/store.js");
const World = require("./server/world.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);
const wait = async (cond, what) => { for (let i = 0; i < 60; i++) { if (cond()) return; await new Promise(r => setTimeout(r, 50)); } fail(`délai dépassé : ${what}`); };

(async () => {
  const { server, multiSavePath, baseUrl } = await startTestServer();
  const now = Date.now();
  const career = store.createMultiManagerCareer(["Lyon Planète", "Paris Planète"], now - 20 * 24 * 3600 * 1000, "Lyon Planète");
  await store.saveMultiLeague(career.league, multiSavePath);
  await World.catchUpWorld(multiSavePath, now);
  const world = await World.loadWorld(multiSavePath, now);
  if (!world.summaries || !world.summaries["us-1"]) fail("(setup) résumés du monde absents.");
  const token = career.league.teams[0].managerLinkToken;

  const dom = await openGame(html, `${baseUrl}?m=${token}`);
  const win = dom.window, doc = win.document;

  // 1) Menu : en bas, avec Guide et Premium ; aperçu du pays (le sien).
  const bottom = doc.querySelector(".sidebar-section-bottom");
  const btn = bottom && bottom.querySelector('[data-tab="planete"]');
  if (!btn || !/Planète Hoop/.test(btn.textContent)) fail("bouton « Planète Hoop » absent du bas du menu.");
  btn.click();
  const box = doc.getElementById("planeteContent");
  await wait(() => box.querySelector(".pc-hero"), "chargement de Planète Hoop");
  const opts = [...box.querySelectorAll(".pc-picker-opt")];
  if (opts.length !== 17 || !opts.some(o => o.dataset.phCountry === "it" && /Italie/.test(o.textContent)) || !opts.some(o => o.dataset.phCountry === "tw" && /Taïwan/.test(o.textContent))) fail(`17 pays attendus dans le menu déroulant (France, États-Unis, Italie, Espagne… Taïwan), obtenu ${opts.length}.`);
  if (!box.querySelector(".pc-picker-btn").textContent.includes("France") || !opts.find(o => o.classList.contains("active")).textContent.includes("France")) fail("son pays (France) doit être sélectionné par défaut.");
  if (!box.querySelector(".pc-picker-menu").classList.contains("hidden")) fail("menu des pays fermé au départ.");
  box.querySelector("[data-pc-picker]").click();
  if (box.querySelector(".pc-picker-menu").classList.contains("hidden")) fail("le bouton du pays ouvre le menu déroulant.");
  if (opts[0].dataset.phCountry !== "fr" || !/Votre pays/.test(opts[0].textContent)) fail("« Votre pays » en tête de la liste.");
  {
    // Recherche dans la liste (2026-10-01) : accents/casse ignorés, noms anglais / natifs, code.
    const filter = doc.getElementById("planeteCountryFilter");
    const shown = q => { filter.value = q; filter.dispatchEvent(new win.Event("input", { bubbles: true })); return opts.filter(o => !o.hidden).map(o => o.dataset.phCountry); };
    if (shown("deutsch").join() !== "de" || !shown("GERMANY").includes("de") || !shown("de").includes("de")) fail("recherche « deutsch » / « germany » / « de » → Allemagne.");
    if (shown("etats").join() !== "us" || shown("grece").join() !== "gr") fail("recherche sans accents.");
    if (shown("zzz").length || box.querySelector(".pc-picker-empty").hidden) fail("« Aucun pays trouvé. » quand rien ne correspond.");
    shown("ital");
    filter.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await wait(() => /Italie/.test((box.querySelector(".pc-hero") || {}).textContent || ""), "Entrée choisit l'Italie");
    box.querySelector("[data-pc-picker]").click();
    box.querySelector('.pc-picker-opt[data-ph-country="fr"]').click();
    await wait(() => /France/.test((box.querySelector(".pc-hero") || {}).textContent || "") && box.querySelector(".pc-picker-menu"), "retour en France");
    ok("liste des pays : « Votre pays » en tête, recherche (accents, anglais, langue du pays, code), Entrée choisit");
  }
  const hero = box.querySelector(".pc-hero");
  const kpis = [...hero.querySelectorAll(".pc-kpi")].map(k => k.textContent);
  if (!/France/.test(hero.textContent) || !/Votre pays/.test(hero.textContent)) fail(`carte du pays : ${hero.textContent}`);
  if (!/Divisions\s*1/.test(kpis[0]) || !/Clubs\s*10/.test(kpis[2]) || !/Managers\s*2/.test(kpis[3])) fail(`chiffres du pays : ${kpis.join(" | ")}`);
  const myRow = box.querySelector(".pc-leagues li.is-mine");
  if (!myRow || !/Division I/.test(myRow.textContent) || !/Votre championnat/.test(myRow.textContent) || !/En tête/.test(myRow.textContent)) fail(`son championnat dans les divisions : ${myRow && myRow.textContent}`);
  if (!/Coupe nationale/.test(box.textContent)) fail("ligne Coupe nationale absente.");
  const titles = [...box.querySelectorAll(".pc-card-head h3")].map(h => h.textContent);
  ["Divisions et compétitions", "Leaders de la saison", "Meilleures performances", "Historique", "Titres par équipe", "Classement mondial"].forEach(t => {
    if (!titles.includes(t)) fail(`bloc « ${t} » absent (${titles.join(", ")}).`);
  });
  const statBlocks = [...box.querySelectorAll(".pc-stat")];
  if (statBlocks.length !== 8) fail(`4 leaders + 4 meilleures performances attendus, obtenu ${statBlocks.length}.`);
  if (!/Contres/.test(statBlocks.map(s => s.textContent).join())) fail("leaders aux contres absents.");
  if (!statBlocks[0].querySelector("li [data-pc-club]")) fail("le club d'un leader doit être cliquable.");
  if (!statBlocks[0].querySelector("li [data-pc-player]") && !statBlocks[0].querySelector("li .pc-player")) fail("joueur leader absent.");
  // Première saison : blocs sans données = une ligne, pas de grande carte vide.
  const histCard = [...box.querySelectorAll(".pc-card")].find(c => c.querySelector("h3").textContent === "Historique");
  if (!histCard.classList.contains("pc-card--compact") || histCard.querySelector("table")) fail("historique vide : une ligne compacte attendue.");
  if (/Amicaux internationaux/.test(box.textContent)) fail("bloc « Amicaux internationaux » retiré (retour utilisateur).");
  // Briques par paires : Divisions | Titres, Leaders | Classement, Performances | Historique.
  const order = [...box.querySelectorAll(".pc-grid > .pc-card h3")].map(h => h.textContent);
  if (order.join("|") !== "Divisions et compétitions|Titres par équipe|Leaders de la saison|Classement mondial|Meilleures performances|Historique") fail(`ordre des briques : ${order.join(" | ")}`);
  if (/Sélection nationale|U21/.test(box.textContent)) fail("pas d'équipe nationale dans le jeu : bloc à ne pas inventer.");
  ok("menu : Planète Hoop en bas ; aperçu de la France par défaut (menu déroulant des pays, carte du pays, divisions + Coupe, leaders avec contres, meilleures performances, blocs vides compacts)");

  // 1bis) Route /api/world/country.
  const apiUs = await win.eval(`planeteFetch("/api/world/country?code=us")`);
  if (apiUs.overview.country !== "us" || apiUs.overview.mine || apiUs.myCountry !== "fr" || apiUs.countries.length !== 17) fail(`/api/world/country?code=us : ${JSON.stringify(apiUs).slice(0, 200)}`);
  ok("/api/world/country?code=us : aperçu des USA, pays du manager rappelé");

  // 2) Son propre championnat : l'onglet Ligue habituel.
  const stSection = doc.getElementById("standingsSection");
  const stContent = doc.getElementById("standingsContent");
  myRow.querySelector("[data-ph-league]").click();
  await wait(() => !stSection.classList.contains("hidden"), "sa page Ligue");
  if (!doc.querySelector('.tab-btn[data-tab="ligue"]').classList.contains("active")) fail("son championnat : onglet Ligue actif.");
  if (stContent.querySelector("[data-lg-back]") || !stContent.querySelector("#lgcOpenBtn")) fail("sa propre ligue : pas de lien retour, chat présent.");
  if (win.eval("leagueForeign") !== null) fail("sa propre ligue : pas de mode « autre championnat ».");
  win.eval(`TAB_HANDLERS.planete()`);
  await wait(() => box.querySelector(".pc-hero"), "retour à l'aperçu");
  ok("son propre championnat depuis Planète Hoop : l'onglet Ligue habituel");

  // 2bis) Palmarès semé : titres par club, historique (tenant en avant).
  {
    const w = await World.loadWorld(multiSavePath, now);
    const fr1 = await World.loadLeague(w, "fr-1", multiSavePath);
    const [a, b, c] = [fr1.teams[4].name, fr1.teams[5].name, fr1.teams[6].name];
    w.history = { ...(w.history || {}), fr: [
      { season: 2, champion: b, championFinalist: a, cupWinner: c, cupFinalist: a, superCupWinner: b },
      { season: 1, champion: b, championFinalist: c, cupWinner: null },
    ] };
    await store.saveWorldRaw(w, multiSavePath);
    win.eval(`renderPlaneteSection()`);
    await wait(() => box.querySelector(".pc-hist table"), "historique semé");
    const hist = [...box.querySelectorAll(".pc-hist-col")];
    if (hist.length !== 2) fail("historique en deux colonnes attendu.");
    const holder = hist[0].querySelector("tr.is-holder");
    if (!holder || !holder.textContent.includes(b) || !/Tenant/.test(holder.textContent)) fail(`tenant du titre : ${holder && holder.textContent}`);
    if (hist[0].querySelectorAll("tbody tr").length !== 2 || hist[1].querySelectorAll("tbody tr").length !== 1) fail("lignes de l'historique.");
    if (!hist[1].querySelector("tr.is-holder").textContent.includes(c)) fail("tenant de la Coupe.");
    const rows = [...box.querySelectorAll(".pc-titles tbody tr")].map(r => [...r.children].map(td => td.textContent.trim()));
    if (rows[0][0] !== b || rows[0].slice(1).join() !== "2,0,1,0") fail(`titres par club : ${JSON.stringify(rows)}`);
    if (!rows.find(r => r[0] === a && r[4] === "2")) fail(`finales de ${a} : ${JSON.stringify(rows)}`);
    const link = hist[0].querySelector("tr.is-holder [data-pc-club]");
    if (!link || link.dataset.pcClub !== "fr-1") fail("champion cliquable (fiche équipe).");
    ok(`palmarès : titres par club (${b} : 2 titres, 1 Supercoupe ; ${a} : 2 finales), historique champion/finaliste et Coupe, tenants en avant, clubs cliquables`);
  }

  // 2ter) Changer de pays via le menu déroulant : USA.
  box.querySelector("[data-pc-picker]").click();
  box.querySelector('.pc-picker-opt[data-ph-country="us"]').click();
  await wait(() => /États-Unis/.test((box.querySelector(".pc-hero") || {}).textContent || ""), "passage aux USA");
  if (/Votre pays/.test(box.querySelector(".pc-hero").textContent)) fail("les USA ne sont pas son pays.");
  if (box.querySelector('[data-tab="coupe"]')) fail("pas de lien vers son onglet Coupe pour un autre pays.");
  box.querySelector('[data-ph-league="us-1"]').click();
  await wait(() => !stSection.classList.contains("hidden") && stContent.querySelector("[data-lg-back]"), "vraie page Ligue de la Division I des USA");
  {
    const usLg = await World.loadLeague(world, "us-1", multiSavePath);
    const rows = [...stContent.querySelectorAll("tbody tr")].filter(r => r.querySelector("[data-team-idx]"));
    if (rows.length !== 10) fail(`classement complet de 10 clubs attendu, obtenu ${rows.length}.`);
    if (!rows.some(r => r.textContent.includes(usLg.teams[0].name))) fail("clubs américains attendus dans le classement.");
    if (stContent.querySelector(".lg-badge img, .lg-badge svg, .lg-badge span") == null) fail("logos des clubs attendus.");
    if (!/Ligue/.test(stContent.querySelector(".lg-head h1").textContent) || !/États-Unis/.test(stContent.querySelector(".lg-comp").textContent) || !/Division I/.test(stContent.querySelector(".lg-comp").textContent)) fail(`en-tête : ${stContent.querySelector(".lg-head").textContent}`);
    if (!/Planète Hoop · États-Unis/.test(stContent.querySelector("[data-lg-back]").textContent)) fail("lien retour « ← Planète Hoop · États-Unis ».");
    if (stContent.querySelector("#lgcOpenBtn")) fail("pas de chat de la ligue pour un autre championnat.");
    if (stContent.querySelector(".lg-race")) fail("pas de course aux play-offs pour un autre championnat.");
    if (stContent.querySelector("tr.mine, .lg-res-card.mine, .lg-mine-p") || doc.querySelector("#leagueStatsPanel .lg-mine-p")) fail("aucune ligne « à soi » dans un autre championnat.");
    if (/Tes joueurs/.test(doc.getElementById("leagueStatsPanel").textContent)) fail("pas de « Tes joueurs » dans un autre championnat.");
    if (!/Résultats de la journée/.test(stContent.textContent) || !stContent.querySelector("[data-boxscore-round]")) fail("résultats de la dernière journée (feuilles de match) attendus.");
    if (!doc.querySelector("#leagueStatsPanel .lg-card")) fail("leaders de la ligue attendus.");
    if (!doc.querySelector('.tab-btn[data-tab="planete"]').classList.contains("active")) fail("onglet Planète Hoop toujours actif.");
    if (win.eval("league.leagueId") === "us-1" || win.eval("myTeamIndex") !== 0) fail("la ligue du joueur doit être restaurée après le rendu.");
    // Bascule Moyennes/Totaux : toujours les joueurs américains.
    const usPlayers = new Set(usLg.teams.flatMap(t => t.players.map(p => p.name)));
    doc.querySelector('#leagueStatsPanel [data-lg-mode="tot"]').click();
    const leadName = doc.querySelector("#leagueStatsPanel .lg-lead-id b").textContent;
    if (!usPlayers.has(leadName)) fail(`leaders (Totaux) : ${leadName} n'est pas un joueur américain.`);
    doc.querySelector('#leagueStatsPanel [data-lg-mode="avg"]').click();
    // Feuille de match lue dans CE championnat.
    const bx = stContent.querySelector("[data-boxscore-round]");
    const homeName = usLg.teams[Number(bx.dataset.boxscoreHome)].name;
    bx.click();
    await wait(() => doc.getElementById("matchBoxscoreOverlay"), "feuille de match du championnat américain");
    if (!doc.getElementById("matchBoxscoreOverlay").textContent.includes(homeName)) fail("feuille de match : clubs américains attendus.");
    win.eval(`closeMatchBoxscore()`);
    win.eval(`TAB_HANDLERS.planete()`);
    await wait(() => box.querySelector(".pc-hero"), "Planète Hoop");
    // Retour : lien « ← Planète Hoop · États-Unis ».
    box.querySelector('[data-ph-league="us-1"]').click();
    await wait(() => !stSection.classList.contains("hidden") && stContent.querySelector("[data-lg-back]"), "page Ligue américaine (2)");
    stContent.querySelector("[data-lg-back]").click();
    await wait(() => !doc.getElementById("planeteSection").classList.contains("hidden") && /États-Unis/.test((box.querySelector(".pc-hero") || {}).textContent || ""), "retour à l'aperçu des USA");
    // L'onglet Ligue redonne SON championnat.
    win.eval(`TAB_HANDLERS.ligue()`);
    if (win.eval("leagueForeign") !== null || !stContent.querySelector("#lgcOpenBtn") || stContent.querySelector("[data-lg-back]")) fail("onglet Ligue : son propre championnat.");
    win.eval(`showForeignLeague("us-1")`);
    await wait(() => stContent.querySelector("[data-lg-back]"), "page Ligue américaine (3)");
  }
  ok("menu déroulant : USA puis leur Division I sur la vraie page Ligue (classement 10 clubs, logos, résultats + feuille de match, leaders, en-tête « Ligue · États-Unis · Division I », retour Planète Hoop), sans chat, course aux play-offs ni « Tes joueurs »");

  // 3) Clic sur un club d'un autre championnat (depuis sa page Ligue) : sa
  // fiche équipe habituelle (Aperçu), lue dans SON championnat.
  const clubBtn = stContent.querySelector("tbody [data-team-idx]");
  const clubName = clubBtn.textContent;
  const clubIdx = Number(clubBtn.dataset.teamIdx);
  clubBtn.click();
  const tdSection = doc.getElementById("teamDetailSection");
  const tdContent = doc.getElementById("teamDetailContent");
  await wait(() => !tdSection.classList.contains("hidden") && tdContent.querySelector(".team-apercu-name"), "fiche équipe du club américain");
  if (tdContent.querySelector(".team-apercu-name").textContent !== clubName) fail(`fiche du mauvais club : ${tdContent.querySelector(".team-apercu-name").textContent}`);
  if (!/Division I/.test(doc.getElementById("teamDetailName").textContent)) fail("le championnat du club doit être indiqué dans l'en-tête.");
  if (tdContent.querySelector('[data-team-detail-subview="analyse"]')) fail("pas d'Analyse d'équipe pour un club d'un autre championnat.");
  if (win.eval("league.leagueId") === "us-1" || win.eval("myTeamIndex") !== 0) fail("la ligue du joueur doit être restaurée après le rendu.");
  tdContent.querySelector('.team-detail-subnav [data-team-detail-subview="effectif"]').click();
  if (!tdContent.textContent.includes(win.eval(`teamDetailForeign.league.teams[${clubIdx}].players[0].name`))) fail("effectif du club américain attendu.");
  tdContent.querySelector('.team-detail-subnav [data-team-detail-subview="calendrier"]').click();
  if (!tdContent.querySelector("table")) fail("calendrier du club américain attendu.");
  doc.getElementById("closeTeamDetailBtn").click();
  if (win.eval("teamDetailForeign") !== null) fail("retour : la fiche étrangère doit être oubliée.");
  ok(`clic sur ${clubName} (autre championnat) : fiche équipe habituelle (Aperçu, Effectif, Calendrier), sans Analyse, ligue restaurée`);

  // 3ter) Barre de recherche de la page : un club américain → sa fiche.
  {
    win.eval(`TAB_HANDLERS.planete()`);
    await wait(() => box.querySelector(".pc-hero") && doc.getElementById("planeteSearchInput"), "aperçu (recherche)");
    const usLg = await World.loadLeague(world, "us-1", multiSavePath);
    const target = usLg.teams[5];
    const input = doc.getElementById("planeteSearchInput");
    input.value = target.name.slice(0, 6);
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    await wait(() => doc.querySelector("#planeteSearchResults [data-pc-club]"), "résultats de la recherche de la page");
    const hit = [...doc.querySelectorAll("#planeteSearchResults [data-pc-club]")].find(b => b.textContent.includes(target.name));
    if (!hit) fail(`club « ${target.name} » introuvable dans la recherche de la page.`);
    hit.click();
    await wait(() => !tdSection.classList.contains("hidden") && tdContent.querySelector(".team-apercu-name") && tdContent.querySelector(".team-apercu-name").textContent === target.name, "fiche via la recherche de la page");
    doc.getElementById("closeTeamDetailBtn").click();
    win.eval(`TAB_HANDLERS.planete()`);
    await wait(() => doc.getElementById("planeteSearchInput"), "retour Planète Hoop");
    const input2 = doc.getElementById("planeteSearchInput");
    input2.value = "Division";
    input2.dispatchEvent(new win.Event("input", { bubbles: true }));
    await wait(() => doc.querySelector("#planeteSearchResults [data-pc-go-league]"), "championnats dans la recherche de la page");
    doc.querySelector('#planeteSearchResults [data-pc-go-league="us-1"]').click();
    await wait(() => !stSection.classList.contains("hidden") && stContent.querySelector("[data-lg-back]") && /États-Unis/.test(stContent.querySelector("[data-lg-back]").textContent), "championnat via la recherche");
    ok("recherche de la page (clubs, managers, championnats) : un club ouvre sa fiche, un championnat sa page Ligue");
  }

  // 3quater) Joueurs et adversaires cliquables (retour utilisateur
  // 2026-09-30 : « impossible de cliquer sur le nom des joueurs ni sur les
  // équipes contre ») : fiche joueur habituelle d'un joueur américain, en
  // lecture seule.
  {
    const pdSection = doc.getElementById("playerDetailSection");
    const pdContent = doc.getElementById("playerDetailContent");
    win.eval(`planeteState.country = "us"; TAB_HANDLERS.planete()`);
    await wait(() => /États-Unis/.test((box.querySelector(".pc-hero") || {}).textContent || "") && box.querySelector(".pc-stat [data-pc-player]"), "leaders américains");
    const bestsCard = [...box.querySelectorAll(".pc-card")].find(c => c.querySelector("h3").textContent === "Meilleures performances");
    const oppLink = [...bestsCard.querySelectorAll("small")].map(sm => [...sm.querySelectorAll("[data-pc-club]")]).find(l => l.length === 2);
    if (!oppLink || oppLink.some(b => b.tagName !== "BUTTON")) fail("meilleures performances : club ET adversaire (« contre X ») cliquables attendus.");
    const opp = oppLink[1];
    const usLg = await World.loadLeague(world, "us-1", multiSavePath);
    if (usLg.teams[Number(opp.dataset.pcIdx)].name !== opp.textContent || opp.dataset.pcClub !== "us-1") fail(`adversaire : ${opp.textContent} → ${opp.dataset.pcClub}:${opp.dataset.pcIdx}`);
    const pBtn = box.querySelector(".pc-stat [data-pc-player]");
    if (pBtn.tagName !== "BUTTON") fail("nom du joueur : bouton attendu (clavier).");
    const pName = pBtn.textContent, pTeam = Number(pBtn.dataset.pcTeam), pId = Number(pBtn.dataset.pcPlayer);
    pBtn.click();
    await wait(() => !pdSection.classList.contains("hidden") && doc.getElementById("playerDetailName").textContent === pName, "fiche du joueur américain");
    if (!pdContent.textContent.includes(usLg.teams[pTeam].name)) fail("son club doit figurer sur la fiche.");
    if (pdContent.querySelector("[data-pdp-compare], [data-pdp-sell], [data-list-player-detail]")) fail("ni Comparer ni Vendre sur la fiche d'un joueur d'un autre championnat.");
    if (!doc.getElementById("topbarComparePlayerBtn").classList.contains("hidden")) fail("bouton Comparer du haut masqué.");
    if (!pdContent.querySelector(".pdp-pill.locked") || !pdContent.querySelector(".pdp2-ring--locked")) fail("caractéristiques et note verrouillées (joueur non scouté).");
    if (/\/ sem\./.test(pdContent.textContent)) fail("pas de salaire pour un joueur d'un autre club.");
    if (!/Derniers matchs/.test(pdContent.textContent)) fail("stats de matchs attendues.");
    if (/NaN|undefined/.test(pdContent.textContent)) fail("fiche joueur étrangère : ni NaN ni undefined (caractéristiques non envoyées).");
    if (!win.eval(`(() => { const lg = playerDetailForeign.league; const open = new Set((lg.transferListings || []).filter(l => l.status === "open").map(l => l.playerId)); return lg.teams.every(t => t.players.every(p => p.attrsHidden || open.has(p.id))); })()`)) fail("joueurs d'un autre championnat : caractéristiques non reçues (attrsHidden), sauf joueurs sur le marché.");
    if (win.eval("league.leagueId") === "us-1" || win.eval("myTeamIndex") !== 0) fail("la ligue du joueur doit être restaurée après le rendu.");
    // Son club → fiche équipe étrangère ; retour → fiche joueur → Planète Hoop.
    pdContent.querySelector(".pdp2-id-top [data-team-idx]").click();
    await wait(() => !tdSection.classList.contains("hidden") && tdContent.querySelector(".team-apercu-name") && tdContent.querySelector(".team-apercu-name").textContent === usLg.teams[pTeam].name, "fiche du club depuis la fiche joueur");
    // Depuis la fiche équipe étrangère, un joueur de l'effectif → sa fiche (pas un joueur de son propre club).
    tdContent.querySelector('.team-detail-subnav [data-team-detail-subview="effectif"]').click();
    const caracsBtn = tdContent.querySelector('[data-team-effectif-view="caracs"]');
    if (caracsBtn) {
      caracsBtn.click();
      if (/NaN|undefined/.test(tdContent.textContent)) fail("fiche équipe étrangère (caractéristiques) : ni NaN ni undefined.");
      tdContent.querySelector('[data-team-effectif-view="general"]').click();
    }
    if (/NaN|undefined/.test(tdContent.textContent)) fail("fiche équipe étrangère : ni NaN ni undefined.");
    const rosterLink = tdContent.querySelector("[data-player-team][data-player-id], [data-player-detail]");
    if (!rosterLink) fail("effectif de la fiche équipe étrangère : noms de joueurs cliquables attendus.");
    {
      const rn = rosterLink.textContent.trim();
      rosterLink.click();
      await wait(() => !pdSection.classList.contains("hidden") && doc.getElementById("playerDetailName").textContent === rn, "fiche joueur depuis la fiche équipe étrangère");
      if (win.eval("playerDetailForeign && playerDetailForeign.leagueId") !== "us-1") fail("fiche joueur étrangère attendue depuis la fiche équipe étrangère.");
    }
    doc.getElementById("closePlayerDetailBtn").click();
    if (win.eval("playerDetailForeign") !== null) fail("retour : fiche joueur étrangère oubliée.");
    // Page Ligue américaine : un leader → sa fiche joueur.
    win.eval(`showForeignLeague("us-1")`);
    await wait(() => !stSection.classList.contains("hidden") && doc.querySelector("#leagueStatsPanel .lg-lead-id [data-player-id]"), "page Ligue américaine (leaders)");
    const lead = doc.querySelector("#leagueStatsPanel .lg-lead-id [data-player-id]");
    const leadName = lead.textContent;
    lead.click();
    await wait(() => !pdSection.classList.contains("hidden") && doc.getElementById("playerDetailName").textContent === leadName, "fiche du leader américain");
    doc.getElementById("closePlayerDetailBtn").click();
    await wait(() => !stSection.classList.contains("hidden"), "retour à la page Ligue américaine");
    // Joueur de son propre championnat : sa fiche habituelle.
    win.eval(`planeteState.country = "fr"; TAB_HANDLERS.planete()`);
    await wait(() => /France/.test((box.querySelector(".pc-hero") || {}).textContent || "") && box.querySelector(".pc-stat [data-pc-player]"), "leaders français");
    const own = box.querySelector('.pc-stat [data-pc-player][data-pc-league="fr-1"]');
    own.click();
    await wait(() => !pdSection.classList.contains("hidden") && doc.getElementById("playerDetailName").textContent === own.textContent, "fiche d'un joueur de son championnat");
    if (win.eval("playerDetailForeign") !== null || !doc.querySelector("#playerDetailContent [data-pdp-compare]")) fail("son championnat : fiche habituelle (Comparer présent).");
    doc.getElementById("closePlayerDetailBtn").click();
    ok(`joueurs cliquables : ${pName} (autre championnat) → fiche joueur habituelle en lecture seule (caractéristiques verrouillées, sans Comparer/Vendre/salaire), son club et l'adversaire « contre » ouvrent la fiche équipe ; leaders de la page Ligue étrangère et effectif de la fiche équipe étrangère aussi ; joueur de son championnat → fiche habituelle`);
  }

  // 3bis) Les routes ne renvoient rien de privé.
  for (const route of ["team-page", "league-page"]) {
    const tp = await win.eval(`planeteFetch("/api/world/${route}?league=us-1")`);
    if (!tp.ok) fail(JSON.stringify(tp).slice(0,300));
    if (tp.league.teams.some(t => t.managerLinkToken || (t.pushSubscriptions || []).length || t.plannedTactics || (t.tacticPresets || []).length || (t.marketWatchlist || []).length)) fail(`données privées dans /api/world/${route}.`);
    if ((tp.league.transferListings || []).some(l => l.status !== "open" || (l.bids || []).length || l.currentBidderIdx != null) || tp.league.liveMatches || (tp.league.privateLeagues || []).length || (tp.league.friendlies || []).length) fail(`enchérisseurs/directs/ligues privées dans /api/world/${route}.`);
    if (!Array.isArray(tp.league.results) || !tp.league.divisionMoves || tp.label !== "Division I" || tp.mine) fail(`/api/world/${route} : résultats, zones, libellé attendus.`);
  }
  ok("/api/world/team-page et /api/world/league-page : aucun jeton, abonnement, tactique, enchérisseur ni direct ; résultats, zones et libellé présents");

  // 4) Recherche du haut : un club américain → sa fiche équipe.
  const usLeague = await World.loadLeague(world, "us-1", multiSavePath);
  const target = usLeague.teams[3];
  win.eval(`TAB_HANDLERS.club()`);
  const input = doc.getElementById("topbarSearchInput");
  input.value = target.name.slice(0, 6);
  input.dispatchEvent(new win.Event("input"));
  await wait(() => doc.querySelector("#topbarWorldResults [data-world-club]"), "résultats mondiaux de la recherche");
  const hit = [...doc.querySelectorAll("#topbarWorldResults [data-world-club]")].find(b => b.textContent.includes(target.name));
  if (!hit) fail(`club américain « ${target.name} » introuvable dans la recherche.`);
  hit.click();
  await wait(() => !tdSection.classList.contains("hidden") && tdContent.querySelector(".team-apercu-name") && tdContent.querySelector(".team-apercu-name").textContent === target.name, "ouverture via la recherche");
  win.eval(`TAB_HANDLERS.planete()`);
  await wait(() => box.querySelector(".pc-toolbar"), "retour sur Planète Hoop");
  input.value = "Division";
  input.dispatchEvent(new win.Event("input"));
  await wait(() => doc.querySelector("#topbarWorldResults [data-world-league]"), "championnats dans la recherche");
  ok("barre de recherche du haut : clubs et championnats du monde, un clic sur un club ouvre sa fiche équipe");

  // 5) Messagerie mondiale : écrire au manager d'un club américain depuis sa
  // fiche équipe, il voit la conversation (nom du club français) et répond.
  {
    const usLg = await World.loadLeague(world, "us-1", multiSavePath);
    const usIdx = 2;
    usLg.teams[usIdx].isHuman = true;
    usLg.teams[usIdx].managerLinkToken = "tok-us-manager-test";
    await store.saveMultiLeague(usLg, multiSavePath);
    const usName = usLg.teams[usIdx].name;
    const api = async (method, url, body, tok) => {
      const r = await fetch(new URL(url, baseUrl), { method, headers: { "Content-Type": "application/json", "X-TipIn-Token": tok }, body: body ? JSON.stringify(body) : undefined });
      return r.json();
    };
    const ok1 = await win.eval(`showForeignTeamDetail("us-1", ${usIdx})`);
    if (!ok1) fail("fiche du club américain (messagerie).");
    const cta = doc.querySelector('#teamDetailContent [data-msg-open]');
    if (!cta || cta.dataset.msgOpen !== `us-1:${usIdx}`) fail(`bouton « Envoyer un message » vers un autre championnat absent (${cta && cta.dataset.msgOpen}).`);
    cta.click();
    await win.eval("window.__lastMsgNav");
    doc.getElementById("msgInput").value = "Salut depuis la France !";
    await win.eval("msgSend()");
    if (!/Salut depuis la France/.test(doc.getElementById("msgThreadCol").textContent)) fail("message envoyé absent du fil.");
    const usSum = await api("GET", "/api/messages/summary", null, "tok-us-manager-test");
    const conv = usSum.conversations && usSum.conversations[0];
    if (!conv || conv.name !== "Lyon Planète" || conv.unread !== 1 || !/^fr-1:\d+$/.test(conv.who)) fail(`côté américain : ${JSON.stringify(usSum).slice(0, 300)}`);
    const reply = await api("POST", "/api/messages/send", { to: conv.who, text: "Hello from the US!" }, "tok-us-manager-test");
    if (!reply.ok) fail(`réponse refusée : ${JSON.stringify(reply)}`);
    const frSum = await api("GET", "/api/messages/summary", null, token);
    const back = frSum.conversations.find(c => c.who === `us-1:${usIdx}`);
    if (!back || back.name !== usName || back.unread !== 1 || back.leagueId !== "us-1") fail(`côté français : ${JSON.stringify(frSum).slice(0, 300)}`);
    ok(`messagerie mondiale : Lyon Planète écrit à ${usName} (autre championnat) depuis sa fiche, réponse reçue`);
  }

  dom.window.close();
  server.close();
  console.log("\n🏁 planete_hoop_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
