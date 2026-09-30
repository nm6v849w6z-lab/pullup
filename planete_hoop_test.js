// Planète Hoop (retour utilisateur, 2026-09-28) : page en bas du menu (avec
// Guide et Premium). Depuis le 2026-09-30, aperçu du pays à la
// BuzzerBeater : menu déroulant des pays (le sien par défaut) + recherche,
// carte du pays, divisions et Coupe, leaders et meilleures performances,
// titres par club, historique, classement mondial ; un championnat s'ouvre
// en sous-page (classement, derniers résultats). Voir renderPlaneteSection (moteurbasket3.html),
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
  if (opts.length !== 2) fail(`2 pays attendus dans le menu déroulant, obtenu ${opts.length}.`);
  if (!box.querySelector(".pc-picker-btn").textContent.includes("France") || !opts.find(o => o.classList.contains("active")).textContent.includes("France")) fail("son pays (France) doit être sélectionné par défaut.");
  if (!box.querySelector(".pc-picker-menu").classList.contains("hidden")) fail("menu des pays fermé au départ.");
  box.querySelector("[data-pc-picker]").click();
  if (box.querySelector(".pc-picker-menu").classList.contains("hidden")) fail("le bouton du pays ouvre le menu déroulant.");
  box.querySelector("[data-pc-picker]").click();
  const hero = box.querySelector(".pc-hero");
  const kpis = [...hero.querySelectorAll(".pc-kpi")].map(k => k.textContent);
  if (!/France/.test(hero.textContent) || !/Votre pays/.test(hero.textContent)) fail(`carte du pays : ${hero.textContent}`);
  if (!/Divisions\s*1/.test(kpis[0]) || !/Clubs\s*10/.test(kpis[2]) || !/Managers\s*2/.test(kpis[3])) fail(`chiffres du pays : ${kpis.join(" | ")}`);
  const myRow = box.querySelector(".pc-leagues li.is-mine");
  if (!myRow || !/Division I/.test(myRow.textContent) || !/Votre championnat/.test(myRow.textContent) || !/En tête/.test(myRow.textContent)) fail(`son championnat dans les divisions : ${myRow && myRow.textContent}`);
  if (!/Coupe nationale/.test(box.textContent)) fail("ligne Coupe nationale absente.");
  const titles = [...box.querySelectorAll(".pc-card-head h3")].map(h => h.textContent);
  ["Divisions et compétitions", "Leaders de la saison", "Meilleures performances", "Historique", "Titres par équipe", "Classement mondial", "Amicaux internationaux"].forEach(t => {
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
  if (/Sélection nationale|U21/.test(box.textContent)) fail("pas d'équipe nationale dans le jeu : bloc à ne pas inventer.");
  ok("menu : Planète Hoop en bas ; aperçu de la France par défaut (menu déroulant des pays, carte du pays, divisions + Coupe, leaders avec contres, meilleures performances, blocs vides compacts)");

  // 1bis) Route /api/world/country.
  const apiUs = await win.eval(`planeteFetch("/api/world/country?code=us")`);
  if (apiUs.overview.country !== "us" || apiUs.overview.mine || apiUs.myCountry !== "fr" || apiUs.countries.length !== 2) fail(`/api/world/country?code=us : ${JSON.stringify(apiUs).slice(0, 200)}`);
  ok("/api/world/country?code=us : aperçu des USA, pays du manager rappelé");

  // 2) Un championnat : sous-page (classement), retour à l'aperçu.
  myRow.querySelector("[data-ph-league]").click();
  await wait(() => box.querySelector("[data-pc-back]"), "sous-page du championnat");
  if (box.querySelectorAll("tbody tr").length !== 10 || !/Votre championnat/.test(box.textContent)) fail("classement de son championnat attendu.");
  box.querySelector("[data-pc-back]").click();
  await wait(() => box.querySelector(".pc-hero"), "retour à l'aperçu");
  ok("lien vers un championnat : classement en sous-page, retour à l'aperçu du pays");

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
  await wait(() => box.querySelector("[data-pc-back]") && box.querySelectorAll("tbody tr").length === 10, "Division I des USA");
  if (/Votre championnat/.test(box.textContent)) fail("la Division I américaine n'est pas son championnat.");
  ok("menu déroulant : aperçu des USA puis leur Division I");

  // 3) Clic sur un club d'un autre championnat : sa fiche équipe habituelle
  // (Aperçu), lue dans SON championnat, en lecture seule.
  const clubBtn = box.querySelector("[data-ph-club]");
  const clubName = clubBtn.textContent;
  const clubIdx = Number(clubBtn.dataset.phClub);
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
    win.eval(`planeteState.leagueId = null; TAB_HANDLERS.planete()`);
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
    await wait(() => box.querySelector("[data-pc-back]") && /États-Unis/.test(box.querySelector("[data-pc-back]").textContent), "championnat via la recherche");
    ok("recherche de la page (clubs, managers, championnats) : un club ouvre sa fiche, un championnat sa sous-page");
  }

  // 3bis) La route ne renvoie rien de privé.
  const tp = await win.eval(`planeteFetch("/api/world/team-page?league=us-1")`);
  if (!tp.ok) fail(JSON.stringify(tp).slice(0,300));
  if (tp.league.teams.some(t => t.managerLinkToken || (t.pushSubscriptions || []).length || t.plannedTactics)) fail("données privées dans /api/world/team-page.");
  ok("/api/world/team-page : aucun jeton, abonnement ou tactique prévue");

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
