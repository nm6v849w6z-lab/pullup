// Vérifie la refonte visuelle de l'onglet Salle (retour utilisateur,
// 2026-09-25 : "aide moi à rendre cette page plus sexy", puis sur la
// maquette : "vas y ça me plait bien, code tout ça"). Remplace
// salle_arena_purchases_height_test.js (renommé via git mv) : l'ancienne
// colonne d'achats alignée sur la hauteur de l'image (#arenaPurchasesCol,
// syncArenaPurchasesHeight) n'existe plus, remplacée par un bandeau pleine
// largeur.
//
// Couvre :
//   1. le bandeau (niveau X/8, bouton d'agrandissement, chiffres clés,
//      anneau de remplissage), avec et sans historique d'affluence ;
//   2. l'aperçu EN DIRECT de la billetterie : faire glisser un curseur
//      (évènement "input") met à jour la recette affichée SANS enregistrer
//      le prix ; le relâcher ("change") ou cliquer +/− l'enregistre ;
//   3. le repère "prix idéal" = prix qui maximise la recette du match, sous
//      la zone rouge (retour utilisateur 2026-09-25 : "le prix idéal c'est 26
//      alors que tu annonces 17") ; plus de cases −/+ ni de notion de confort
//      (vrai modèle ticketPriceComfortFactor/moraleForgiveness) ;
//   4. le graphique d'affluence (une barre par match + la prévision) et la
//      liste repliée à 3 lignes (les 10 restent dans le DOM) ;
//   5. les cartes d'infrastructure (jauge de niveau, état "non construit").
// Les parcours d'achat (flèches/confirmations) restent couverts par
// salle_upgrade_confirm_test.js/tabs_test.js, l'historique par
// attendance_history_test.js.

const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

function clickTab(key) {
  const btn = [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key);
  if (!btn) throw new Error(`❌ Onglet introuvable : ${key}`);
  btn.click();
}
// Espaces normalisés des deux côtés (toLocaleString("fr-FR") produit des
// espaces insécables fines, que \s capture aussi).
const norm = str => String(str).replace(/\s+/g, " ").trim();
const txt = sel => norm((doc.querySelector(sel) || { textContent: "" }).textContent);
const fr = n => norm(n.toLocaleString("fr-FR"));

// --- 1a. Bandeau, aucun match à domicile joué ---
win.eval("teamA.attendanceHistory = []; teamA.arenaLevel = 1; teamA.fanShopLevel = 0; teamA.facilityLevels = { tvStation: 0, gym: 0, wellness: 0 };");
clickTab("salle");
if (!doc.querySelector("#salleHero #arenaVisualCard svg")) throw new Error("❌ Le dessin de la salle devrait être dans le bandeau.");
const tier = txt(".sl-tier");
console.log("Badge de niveau :", tier);
if (!tier.includes(`Niveau 1 / ${win.eval("ARENA_LEVELS.length")}`)) throw new Error(`❌ Le badge devrait afficher "Niveau 1 / 8", obtenu "${tier}".`);
if (doc.querySelectorAll(".sl-tier i span.on").length !== 1) throw new Error("❌ Une seule pastille de niveau devrait être allumée au niveau 1.");
if (txt(".sl-hero-title") !== win.eval("arenaInfo(1).name")) throw new Error("❌ Le titre du bandeau devrait être le nom de la salle actuelle.");
if (!txt("#salleHeroKpis").includes("Affluence prévue")) throw new Error("❌ Sans match joué, le bandeau devrait afficher l'affluence PRÉVUE.");
if (!txt("#salleHeroRing").includes("prévu")) throw new Error("❌ Sans match joué, l'anneau devrait indiquer un remplissage prévu.");
const upgrade = doc.querySelector("#arenaCurrentPanel .sl-hero-upgrade");
if (!upgrade || !upgrade.textContent.includes(win.eval("teamA.nextArenaLevel().name"))) throw new Error("❌ Le bouton d'agrandissement devrait nommer le palier suivant.");
console.log("✅ Bandeau sans historique : niveau, nom, affluence prévue, bouton d'agrandissement.");

// --- 1b. Bandeau avec historique ---
win.eval(`teamA.week = 1; ["Venomous", "ZyF0x_", "Brest", "Toulouse", "Nantes"].forEach(o => { teamA.week++; teamA.simulateHomeAttendance(o); });`);
win.eval("renderSalleSection();");
const kpis = txt("#salleHeroKpis");
console.log("Chiffres clés :", kpis);
const expectedAvg = win.eval("Math.round(teamA.attendanceHistory.reduce((s, e) => s + e.attendance, 0) / teamA.attendanceHistory.length)");
if (!kpis.includes(fr(expectedAvg))) throw new Error(`❌ L'affluence moyenne réelle (${expectedAvg}) devrait apparaître dans les chiffres clés.`);
if (!kpis.includes("Dernière recette")) throw new Error("❌ Avec au moins un match joué, la dernière recette devrait être affichée.");
if (doc.querySelectorAll("#salleHeroKpis .sl-kpi-cats span").length !== 3) throw new Error("❌ Le taux de remplissage par catégorie (3 pastilles) devrait accompagner l'affluence moyenne.");
if (!txt("#salleHeroRing").includes("remplissage")) throw new Error("❌ Avec des matchs joués, l'anneau devrait montrer le remplissage RÉEL.");
if (doc.querySelector("#salleHero #salleHeroKpis")) throw new Error("❌ Les chiffres clés ne devraient plus être sur l'image de la salle (retour utilisateur : 'ça allégera un peu').");
if (!doc.querySelector(".sl-side #salleHeroKpis + #attendanceHistoryHolder")) throw new Error("❌ Les chiffres clés devraient être juste au-dessus de la carte Affluence.");
console.log("✅ Chiffres clés (hors image, au-dessus de l'affluence) : moyenne réelle, détail par catégorie, dernière recette.");

// --- 2. Billetterie : aperçu en direct puis validation ---
const rows = doc.querySelectorAll("#seatCategoriesHolder .seat-category-card");
if (rows.length !== 3) throw new Error(`❌ 3 catégories attendues dans le bloc billetterie, obtenu ${rows.length}.`);
const savedBefore = readRawSave(savePath);
const gradinsBefore = win.eval("teamA.ticketPrices.gradins");
const totalBefore = txt("#slTotalRevenue");
const range = doc.getElementById("ticketPriceRange_gradins");
range.value = String(gradinsBefore + 10);
range.dispatchEvent(new win.Event("input"));
const totalLive = txt("#slTotalRevenue");
console.log(`Recette prévue : ${totalBefore} → ${totalLive} pendant le glisser`);
if (totalLive === totalBefore) throw new Error("❌ Faire glisser un curseur devrait mettre à jour la recette prévue en direct.");
if (txt("#seatPrice_gradins") !== `${gradinsBefore + 10} €`) throw new Error("❌ Le prix affiché devrait suivre le curseur pendant le glisser.");
if (win.eval("teamA.ticketPrices.gradins") !== gradinsBefore) throw new Error("❌ Un simple glisser (input) ne devrait PAS encore enregistrer le prix.");
const livePv = win.eval(`seatPreview(seatCategoryInfo("gradins"), ${gradinsBefore + 10}).revenue`);
if (!txt('[data-seat-key="gradins"] [data-seat-revenue]').includes(fr(livePv))) throw new Error("❌ La recette de la catégorie devrait venir de seatPreview (vrai modèle de remplissage).");
range.dispatchEvent(new win.Event("change"));
await flush(dom);
if (win.eval("teamA.ticketPrices.gradins") !== gradinsBefore + 10) throw new Error("❌ Relâcher le curseur (change) devrait enregistrer le prix.");
if (readRawSave(savePath).team.ticketPrices.gradins !== gradinsBefore + 10) throw new Error("❌ Le nouveau prix devrait être sauvegardé.");
if (doc.querySelector("#seatCategoriesHolder [data-step]")) throw new Error("❌ Les cases −/+ ont été retirées (retour utilisateur).");
if (/confort/i.test(txt("#seatCategoriesHolder"))) throw new Error("❌ Plus aucune notion de confort ne devrait être affichée dans la billetterie.");
const logeRange = doc.getElementById("ticketPriceRange_loge");
logeRange.value = String(savedBefore.team.ticketPrices.loge + 1);
logeRange.dispatchEvent(new win.Event("change"));
await flush(dom);
const logeAfter = win.eval("teamA.ticketPrices.loge");
if (logeAfter !== savedBefore.team.ticketPrices.loge + 1) throw new Error(`❌ Le curseur des loges devrait enregistrer +1 €, obtenu ${logeAfter}.`);
if (txt("#seatPrice_loge") !== `${logeAfter} €`) throw new Error("❌ Le prix affiché en texte devrait suivre le curseur.");
console.log("✅ Aperçu en direct au glisser, enregistrement au relâcher, sans cases −/+ ni confort affiché.");

// --- 3. Prix idéal ---
for (const key of ["gradins", "tribune", "loge"]) {
  const r = win.eval(`(() => { const cat = seatCategoryInfo("${key}"); const z = seatPriceZones(cat); const f = moraleForgiveness(teamA.fanMorale);
    let better = null; const rev = p => p * teamA.projectedAttendanceRateAtPrice("${key}", p);
    for (let p = cat.minPrice; p < z.red; p++) if (rev(p) > rev(z.ideal) + 1e-9) better = p;
    return { ideal: z.ideal, red: z.red, better, cRed: ticketPriceComfortFactor(z.red / f, "${key}"), max: cat.maxPrice }; })()`);
  if (r.better !== null) throw new Error(`❌ ${key} : ${r.better} € rapporterait plus que le prix idéal annoncé (${r.ideal} €).`);
  if (r.red < r.max && r.ideal >= r.red) throw new Error(`❌ ${key} : le prix idéal (${r.ideal} €) ne devrait jamais être dans la zone rouge (${r.red} €).`);
  console.log(`  ${key} : idéal ${r.ideal} €, zone rouge dès ${r.red} €`);
  if (r.red < r.max && r.cRed >= 0.6) throw new Error(`❌ ${key} : la zone rouge (${r.red} €) devrait commencer sous 60% de confort.`);
  const label = txt(`[data-seat-key="${key}"] .sl-track-ideal-label`);
  if (label !== `idéal ${r.ideal} €`) throw new Error(`❌ ${key} : repère attendu "idéal ${r.ideal} €", obtenu "${label}".`);
}
console.log("✅ Prix idéal = recette maximale hors zone rouge, zone rouge calée sur le vrai modèle.");

// --- 4. Graphique + liste repliée ---
const histLen = win.eval("teamA.attendanceHistory.length");
const labels = [...doc.querySelectorAll("#attendanceHistoryHolder .sl-chart-label")].map(t => t.textContent);
console.log("Barres du graphique :", labels.join(", "));
if (labels.length !== histLen + 1 || labels[labels.length - 1] !== "Prochain") throw new Error("❌ Le graphique devrait avoir une barre par match joué + une barre de prévision.");
if (doc.querySelectorAll("#attendanceHistoryHolder .sl-bar-proj").length !== 3) throw new Error("❌ La barre de prévision devrait être empilée par catégorie (3 segments).");
const lines = doc.querySelectorAll("#attendanceHistoryHolder .gain-line");
const extra = doc.querySelectorAll("#attendanceHistoryHolder .gain-line.sl-history-extra");
if (lines.length !== histLen || extra.length !== histLen - 3) throw new Error(`❌ Toutes les lignes devraient rester dans le DOM, les ${histLen - 3} plus anciennes repliées.`);
doc.querySelector(".sl-history-toggle").click();
if (!doc.querySelector("#attendanceHistoryHolder .sl-history--open")) throw new Error("❌ 'Voir les N matchs' devrait déplier la liste.");
console.log("✅ Graphique (matchs + prévision) et liste dépliable.");

// --- 5. Infrastructures ---
win.eval("teamA.facilityLevels = { tvStation: 0, gym: 2, wellness: 0 }; renderSalleSection();");
const gym = doc.querySelector('[data-facility-card="gym"]');
if (gym.classList.contains("sl-fac--off")) throw new Error("❌ Une infrastructure construite ne devrait pas être grisée.");
if (gym.querySelectorAll(".sl-pips span.on").length !== 2 || gym.querySelectorAll(".sl-pips span").length !== 3) throw new Error("❌ La jauge de la salle de musculation (niveau 2/3) devrait avoir 2 pastilles allumées sur 3.");
const tv = doc.querySelector('[data-facility-card="tvStation"]');
if (!tv.classList.contains("sl-fac--off") || !tv.querySelector(".sl-fac-why")) throw new Error("❌ Une infrastructure jamais construite devrait être marquée 'non construite' avec sa description.");
if (!tv.textContent.includes("Construire")) throw new Error("❌ Une infrastructure jamais construite devrait proposer 'Construire'.");
if (!txt("#facilitiesCountPill").includes("/ 5 construites")) throw new Error("❌ Le compteur d'infrastructures construites devrait être affiché.");
tv.querySelector(".facility-card-action .sl-fac-action-label").click();
if (!doc.getElementById("upgradeConfirmOverlay")) throw new Error("❌ Cliquer sur le libellé 'Construire' devrait ouvrir la même confirmation que la flèche.");
doc.getElementById("upgradeConfirmCancel").click();
console.log("✅ Cartes d'infrastructure : jauge de niveau, état non construit, libellé cliquable.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests salle_redesign_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
