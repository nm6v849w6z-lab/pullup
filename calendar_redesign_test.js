// Refonte visuelle du calendrier (retour utilisateur, 2026-09-25 :
// "améliore l'affichage du calendrier", maquette validée puis "enlève la
// brique PROCHAIN sur la ligne J4, elle ne sert à rien") — voir
// renderCalendrierSection/calendarRowHtml/calendarNextMatchCardHtml/
// calendarSeasonCardHtml/calendarApplyFilter dans moteurbasket3.html.
// Vérifie :
// 1) une ligne par journée, regroupées par mois (un tableau par mois, son
//    en-tête porte le nom du mois), dans l'ordre chronologique ;
// 2) le match à venir est surligné (classe "me") SANS badge "PROCHAIN" ;
// 3) les filtres Domicile/Extérieur/À venir masquent bien les bonnes lignes ;
// 4) la carte "Prochain match" pointe sur la bonne journée et son bouton
//    ouvre l'onglet Ordres sur cette journée ;
// 5) après des résultats : V/D sur la ligne, bilan/forme dans la carte
//    "Saison" cohérents avec league.results (calculés indépendamment ici).
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
const openCalendar = () => [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "calendrier").click();

openCalendar();

// --- 1) Regroupement par mois, une ligne par journée ---
const tables = [...doc.querySelectorAll("#calendrierContent table.calendar-table.cal-month")];
const rows = [...doc.querySelectorAll("#calendrierContent table.calendar-table tbody tr.cal-row")];
console.log("Tableaux de mois :", tables.length, "| lignes :", rows.length);
if (rows.length !== 18) throw new Error(`❌ 18 journées attendues, obtenu ${rows.length}.`);
if (tables.length < 2) throw new Error("❌ Une saison de 18 journées (2 par semaine) couvre plusieurs mois : plusieurs tableaux de mois attendus.");
tables.forEach(t => {
  const title = t.querySelector(".cal-month-title").textContent;
  const firstAt = win.eval(`scheduledTimeForChampionshipRound(${Number(t.querySelector("abbr.cal-round").textContent.slice(1)) - 1})`);
  const expected = win.eval(`calendarMonthTitle(${firstAt})`);
  if (title !== expected) throw new Error(`❌ En-tête de mois "${title}", attendu "${expected}" (mois de sa première journée).`);
});
const rounds = rows.map(r => Number(r.querySelector("abbr.cal-round").textContent.slice(1)));
if (rounds.some((n, i) => n !== i + 1)) throw new Error(`❌ Journées hors ordre : ${rounds.join(",")}.`);
console.log("✅ Journées regroupées par mois, dans l'ordre chronologique.");

// --- 2) Match à venir surligné, sans badge "PROCHAIN" ---
const nextRows = rows.filter(r => r.classList.contains("me"));
if (nextRows.length !== 1) throw new Error(`❌ Exactement une ligne surlignée attendue, obtenu ${nextRows.length}.`);
if (/PROCHAIN/i.test(doc.querySelector("#calendrierContent .cal-main").textContent)) {
  throw new Error("❌ Le badge \"PROCHAIN\" a été retiré à la demande de l'utilisateur, il ne doit plus apparaître dans la liste.");
}
console.log("✅ Le match à venir est surligné, sans badge \"PROCHAIN\".");

// --- 3) Filtres ---
const clickFilter = key => doc.querySelector(`[data-cal-filter="${key}"]`).click();
const visibleRows = () => rows.filter(r => !r.classList.contains("hidden"));
const homeCount = win.eval(`league.schedule.filter(day => day.some(m => m.home === myTeamIndex)).length`);
clickFilter("home");
if (visibleRows().length !== homeCount || visibleRows().some(r => r.dataset.venue !== "home")) {
  throw new Error(`❌ Filtre Domicile : ${homeCount} lignes à domicile attendues, ${visibleRows().length} visibles.`);
}
clickFilter("away");
if (visibleRows().length !== 18 - homeCount || visibleRows().some(r => r.dataset.venue !== "away")) {
  throw new Error("❌ Filtre Extérieur : seules les lignes à l'extérieur devraient rester visibles.");
}
clickFilter("all");
if (visibleRows().length !== 18) throw new Error("❌ Filtre Tous : les 18 lignes devraient être visibles.");
console.log(`✅ Filtres Domicile (${homeCount}) / Extérieur (${18 - homeCount}) / Tous corrects.`);

// --- 4) Carte "Prochain match" ---
const nextBtn = doc.querySelector("#calendrierContent .cal-next-btn");
if (!nextBtn) throw new Error("❌ La carte Prochain match devrait proposer un bouton d'ordres.");
const expectedRound = win.eval("league.round");
if (Number(nextBtn.dataset.round) !== expectedRound || nextBtn.dataset.competition !== "championship") {
  throw new Error(`❌ Le bouton de la carte devrait viser la journée ${expectedRound}, obtenu ${nextBtn.dataset.round}/${nextBtn.dataset.competition}.`);
}
if (doc.querySelectorAll("#calendrierContent .calendar-order-btn").length !== 18) {
  throw new Error("❌ La carte ne doit pas ajouter de .calendar-order-btn : il en faut exactement un par journée à venir.");
}
nextBtn.click();
const onOrdres = !doc.getElementById("prepSection").classList.contains("hidden") && doc.getElementById("tabOrdres").classList.contains("active");
if (!onOrdres) throw new Error("❌ Le bouton de la carte Prochain match devrait ouvrir l'onglet Ordres.");
console.log("✅ La carte Prochain match vise la bonne journée et ouvre l'onglet Ordres.");

// --- 5) Résultats : V/D, bilan, forme ---
win.eval(`
  const scores = [[84, 77], [71, 79], [92, 88]];
  for (let r = 0; r < 3; r++) {
    const m = league.schedule[r].find(x => x.home === myTeamIndex || x.away === myTeamIndex);
    const mine = scores[r][0], opp = scores[r][1];
    const homeIsMe = m.home === myTeamIndex;
    league.results.push({ round: r, home: m.home, away: m.away, scoreHome: homeIsMe ? mine : opp, scoreAway: homeIsMe ? opp : mine });
  }
  league.round = 3;
`);
openCalendar();
const rows2 = [...doc.querySelectorAll("#calendrierContent table.calendar-table tbody tr.cal-row")];
const letters = rows2.slice(0, 3).map(r => (r.querySelector(".cal-result-letter") || {}).textContent);
if (letters.join("") !== "VDV") throw new Error(`❌ V/D attendus "VDV" sur les 3 premières lignes, obtenu "${letters.join("")}".`);
if (!rows2[3].classList.contains("me")) throw new Error("❌ Après 3 journées jouées, la 4e devrait être la ligne surlignée.");
const bilan = doc.querySelector(".cal-season .cal-kpi .cal-kpi-value").textContent;
if (bilan !== "2-1") throw new Error(`❌ Bilan attendu "2-1", obtenu "${bilan}".`);
const form = [...doc.querySelectorAll(".cal-season .cal-form:not(.cal-form-empty)")].map(e => e.textContent).join("");
if (form !== "VDV") throw new Error(`❌ Forme attendue "VDV", obtenu "${form}".`);
if (doc.querySelectorAll(".cal-season .cal-form-empty").length !== 2) throw new Error("❌ 2 cases de forme vides attendues (5 - 3 matchs joués).");
const kicker = doc.querySelector(".cal-next .cal-card-kicker").textContent;
if (!kicker.includes("Journée 4")) throw new Error(`❌ La carte Prochain match devrait annoncer la Journée 4, obtenu "${kicker}".`);
clickFilter("upcoming");
const upcomingVisible = rows2.filter(r => !r.classList.contains("hidden"));
if (upcomingVisible.length !== 15 || upcomingVisible.some(r => r.dataset.status !== "upcoming")) {
  throw new Error(`❌ Filtre À venir : 15 lignes attendues, ${upcomingVisible.length} visibles.`);
}
clickFilter("all");
console.log("✅ V/D sur les lignes, bilan 2-1, forme VDV, carte sur la Journée 4, filtre À venir (15).");

await flush(dom);
dom.window.close();
server.close();
console.log("\n🏁 Refonte du calendrier : tous les tests sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
