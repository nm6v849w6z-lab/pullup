// Sélections nationales — côté navigateur (2026-10-05, phase A) : page
// Menu → Sélections (tableau des 17 pays, élections), candidature depuis la
// page d'une élection, vote, résultat, mandat et démission. Le serveur :
// server/national_elections_test.js.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const DAY = 24 * 3600 * 1000;

(async () => {
  let offset = 0;
  const { server, baseUrl } = await startTestServer(() => Date.now() + offset);
  const dom = await openGame(html, baseUrl);
  await flush(dom);
  const win = dom.window, doc = win.document;
  win.confirm = () => true;
  const box = () => doc.getElementById("nationalContent");
  const side = [...doc.querySelectorAll(".sidebar-section-bottom .sidebar-link")].map(b => b.textContent.trim());
  assert(side.includes("Sélections"), "menu : entrée « Sélections »");
  win.eval("TAB_HANDLERS.selections()");
  await win.__lastNational;
  assert(doc.querySelectorAll(".nt-table tbody tr").length === 17, "tableau : 17 pays, sélections A et U21");
  assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(box().textContent), "aucun emoji (drapeaux en images)");
  assert(doc.querySelectorAll(".nt-table .nat-flag").length >= 17, "drapeaux des pays");
  const myCountry = win.eval("league.country || 'fr'");
  const firstCard = box().querySelector(".nt-card");
  assert(firstCard && firstCard.classList.contains("is-mine"), "élection de son pays en premier");

  // Candidature.
  firstCard.querySelector("[data-nt-run]").click();
  await win.__lastNational;
  const form = box().querySelector("[data-nt-form]");
  assert(form, "« Se présenter » : formulaire de candidature (titre + projet)");
  form.elements.title.value = "Défense et jeunesse";
  form.elements.project.value = "Une équipe solide en défense, des jeunes joueurs, et l'ambition d'aller loin.";
  form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
  await flush(dom); await new Promise(r => setTimeout(r, 300)); await flush(dom);
  assert(/Défense et jeunesse/.test(box().textContent) && box().querySelector("[data-nt-withdraw]"), "candidature déposée : visible + « Retirer ma candidature »");

  // Vote (3 jours plus tard).
  offset += 3 * DAY + 3600e3;
  const elId = win.HM_NATIONAL.state.electionId;
  await win.HM_NATIONAL.openElection(elId);
  assert(/Vote ouvert/.test(box().textContent), "après 3 jours : vote ouvert");
  const voteBtn = box().querySelector("[data-nt-vote]");
  assert(voteBtn, "électeur du pays : bouton « Voter »");
  voteBtn.click();
  await flush(dom); await new Promise(r => setTimeout(r, 300)); await flush(dom);
  assert(/Votre vote/.test(box().textContent) && !box().querySelector("[data-nt-vote]"), "vote enregistré, définitif (plus de bouton)");

  // Résultat (3 jours plus tard) et mandat.
  offset += 3 * DAY;
  await win.HM_NATIONAL.openElection(elId);
  assert(/Élu/.test(box().textContent) && box().querySelector(".nt-cand.is-win"), "clôture : élu affiché, barre des voix");
  win.eval("TAB_HANDLERS.selections()");
  await win.__lastNational;
  assert(/Mon mandat/.test(box().textContent) && box().querySelector("[data-nt-resign]"), "page : bloc « Mon mandat » avec démission");
  const row = box().querySelector(".nt-table tr.is-mine");
  assert(row && row.querySelector("[data-nt-club]"), "tableau : sélectionneur de son pays, club cliquable");
  box().querySelector("[data-nt-resign]").click();
  await flush(dom); await new Promise(r => setTimeout(r, 300)); await flush(dom);
  assert(!/Mon mandat/.test(box().textContent) && /Anciens sélectionneurs/.test(box().textContent) && /Démission/.test(box().textContent), "démission : intérim, historique « Démission »");

  // Page équipe d'une sélection (comme un club) : depuis le tableau.
  box().querySelector('.nt-table [data-nt-team="' + myCountry + '-A"]').click();
  await win.__lastNational;
  assert(box().querySelector(".nt-hero h1") && /France\s+A/.test(box().querySelector(".nt-hero h1").textContent), "page équipe : bandeau « France A »");
  assert([...box().querySelectorAll(".nt-tab")].map(b => b.textContent).join(",") === "Aperçu,Groupe,Calendrier,Sélectionneurs,Palmarès", "onglets Aperçu / Groupe / Calendrier / Sélectionneurs / Palmarès");
  assert(box().querySelectorAll(".nt-stats .nt-card").length === 4, "aperçu : 4 chiffres (groupe, bilan, échéance, éligibles)");
  box().querySelector('[data-nt-tab="groupe"]').click();
  const rows = [...box().querySelectorAll("table.eff-general tbody tr")];
  assert(rows.length >= 5 && rows.length <= 12 && rows.every(r => r.querySelector("[data-nt-player]") && r.querySelector("[data-nt-club]")), "groupe : joueurs (12 au plus), joueur et club cliquables");
  const heads = [...box().querySelectorAll("table.eff-general thead th")].map(th => th.textContent.trim());
  assert(JSON.stringify(heads) === JSON.stringify(["Nom", "Club", "Poste", "Âge", "Taille", "Salaire/sem.", "Forme", "Évaluation", "MJ", "Pts", "Reb", "Pas"]), "groupe : mêmes colonnes que l'effectif d'une équipe (+ club) : " + heads.join(","));
  assert(box().querySelectorAll("table.eff-general .eval-squares").length === rows.length && box().querySelectorAll("table.eff-general .eff-cond").length === rows.length, "forme physique et évaluation des 5 derniers matchs");
  assert(!/Note/.test(box().querySelector("table.eff-general thead").textContent), "pas de note (caractéristiques cachées, comme un club étranger)");
  box().querySelector('[data-nt-group-view="stats"]').click();
  assert(box().querySelector("table.tde-stats") || /Aucun match joué/.test(box().textContent), "vue Statistiques (stats de la saison en club)");
  box().querySelector('[data-nt-group-view="general"]').click();
  box().querySelector('[data-nt-tab="calendrier"]').click();
  assert(box().querySelectorAll(".nt-table tbody tr").length >= 3 && /Fenêtre 1/.test(box().textContent), "calendrier : fenêtres du dimanche (et phase finale)");
  box().querySelector('[data-nt-tab="selectionneurs"]').click();
  assert(/Démission/.test(box().textContent), "sélectionneurs : historique des mandats");
  // Joueur cliquable : ouvre sa fiche.
  box().querySelector('[data-nt-tab="groupe"]').click();
  box().querySelector("[data-nt-player]").click();
  await flush(dom); await new Promise(r => setTimeout(r, 400));
  assert(!doc.getElementById("playerDetailSection").classList.contains("hidden"), "clic sur un joueur du groupe : sa fiche");

  // Recherche du haut : « france u21 » → la sélection U21.
  const input = doc.getElementById("topbarSearchInput");
  input.value = "france";
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  const found = [...doc.querySelectorAll("#topbarSearchResults [data-nat-team]")].map(b => b.dataset.natTeam);
  assert(found.includes("fr-A") && found.includes("fr-U21"), "recherche « france » : France A et France U21");
  input.value = "france u21";
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  const only = [...doc.querySelectorAll("#topbarSearchResults [data-nat-team]")].map(b => b.dataset.natTeam);
  assert(only.length === 1 && only[0] === "fr-U21", "recherche « france u21 » : seulement la U21");
  doc.querySelector('#topbarSearchResults [data-nat-team="fr-U21"]').click();
  await win.__lastNational;
  assert(!doc.getElementById("selectionsSection").classList.contains("hidden") && /France\s+U21/.test(box().querySelector(".nt-hero h1").textContent), "clic : page de la France U21 (depuis n'importe quelle page)");
  win.eval("TAB_HANDLERS.selections()");
  await win.__lastNational;

  // Route du fil d'actualité.
  win.eval("dashResolveNavigate('/selections')");
  await win.__lastNational;
  assert(!doc.getElementById("selectionsSection").classList.contains("hidden"), "lien /selections (notifications) : ouvre la page");
  assert(myCountry, "pays du manager : " + myCountry);
  await dom.window.close();
  server.close();
  console.log("🏁 national_ui_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
