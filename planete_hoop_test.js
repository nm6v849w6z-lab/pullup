// Planète Hoop (retour utilisateur, 2026-09-28) : page en bas du menu (avec
// Guide et Premium) ; pays (son pays par défaut) ; le pays en chiffres
// (divisions ouvertes, palmarès, meilleurs de la saison) ; le championnat
// affiché (le sien par défaut, sinon celui trouvé via la barre de recherche
// du haut) avec classement, derniers résultats et effectif d'un club en
// lecture seule. Voir renderPlaneteSection (moteurbasket3.html),
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

  // 1) Menu : en bas, avec Guide et Premium.
  const bottom = doc.querySelector(".sidebar-section-bottom");
  const btn = bottom && bottom.querySelector('[data-tab="planete"]');
  if (!btn || !/Planète Hoop/.test(btn.textContent)) fail("bouton « Planète Hoop » absent du bas du menu.");
  btn.click();
  const box = doc.getElementById("planeteContent");
  await wait(() => box.querySelector(".ph-country"), "chargement de Planète Hoop");
  const countries = [...box.querySelectorAll(".ph-country")];
  if (countries.length !== 2) fail(`2 pays attendus, obtenu ${countries.length}.`);
  if (!countries.find(c => c.classList.contains("active")).textContent.includes("France")) fail("son pays (France) doit être sélectionné par défaut.");
  const card = box.querySelector(".ph-main .ph-card");
  if (!/Division I/.test(card.textContent) || !/Votre championnat/.test(card.textContent)) fail(`son championnat par défaut : ${card.textContent.slice(0, 120)}`);
  if (card.querySelectorAll("tbody tr").length !== 10) fail("classement de 10 clubs attendu.");
  const side = box.querySelector(".ph-side");
  if (!/France en chiffres/.test(side.textContent) || !/Palmarès/.test(side.textContent) || !/Meilleurs de la saison/.test(side.textContent)) fail("bloc « le pays en chiffres » incomplet.");
  ok("menu : Planète Hoop en bas (avec Guide/Premium) ; France par défaut, son championnat (classement de 10 clubs), le pays en chiffres (divisions, palmarès, meilleurs de la saison)");

  // 2) Changer de pays : USA → sa Division I.
  box.querySelector('[data-ph-country="us"]').click();
  await wait(() => /États-Unis en chiffres/.test(box.textContent), "passage aux USA");
  const usCard = box.querySelector(".ph-main .ph-card");
  if (/Votre championnat/.test(usCard.textContent)) fail("la Division I américaine n'est pas son championnat.");
  if (usCard.querySelectorAll("tbody tr").length !== 10) fail("classement américain attendu.");
  ok("changement de pays : Division I des USA affichée");

  // 3) Clic sur un club d'un autre championnat : sa fiche équipe habituelle
  // (Aperçu), lue dans SON championnat, en lecture seule.
  const clubBtn = usCard.querySelector("[data-ph-club]");
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
  await wait(() => /en chiffres/.test(box.textContent), "retour sur Planète Hoop");
  input.value = "Division";
  input.dispatchEvent(new win.Event("input"));
  await wait(() => doc.querySelector("#topbarWorldResults [data-world-league]"), "championnats dans la recherche");
  ok("barre de recherche du haut : clubs et championnats du monde, un clic sur un club ouvre sa fiche équipe");

  dom.window.close();
  server.close();
  console.log("\n🏁 planete_hoop_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
