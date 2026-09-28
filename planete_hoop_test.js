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

  // 3) Effectif d'un club, en lecture seule.
  const clubBtn = usCard.querySelector("[data-ph-club]");
  const clubName = clubBtn.textContent;
  clubBtn.click();
  await wait(() => box.querySelector(".ph-roster-card"), "effectif du club");
  const roster = box.querySelector(".ph-roster-card");
  if (!roster.textContent.includes(clubName)) fail("effectif du mauvais club.");
  if (roster.querySelectorAll("tbody tr").length < 5) fail("effectif vide.");
  if (/\b\d{2}\b.*Tir|Rebond/.test(roster.querySelector("thead").textContent)) fail("pas de caractéristiques affichées.");
  ok(`effectif de ${clubName} en lecture seule (poste, joueur, âge, taille)`);

  // 4) Recherche du haut : un club américain → Planète Hoop sur son championnat.
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
  await wait(() => doc.getElementById("planeteSection") && !doc.getElementById("planeteSection").classList.contains("hidden") && box.querySelector(".ph-roster-card") && box.querySelector(".ph-roster-card").textContent.includes(target.name), "ouverture via la recherche");
  if (!/États-Unis en chiffres/.test(box.textContent)) fail("la recherche doit ouvrir le bon pays.");
  input.value = "Division";
  input.dispatchEvent(new win.Event("input"));
  await wait(() => doc.querySelector("#topbarWorldResults [data-world-league]"), "championnats dans la recherche");
  ok("barre de recherche du haut : clubs et championnats du monde, un clic ouvre Planète Hoop sur le bon championnat et l'effectif du club");

  dom.window.close();
  server.close();
  console.log("\n🏁 planete_hoop_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
