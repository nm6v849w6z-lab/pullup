// Fiche équipe > Calendrier et Effectif > Statistiques — refonte (retour
// utilisateur, 2026-09-26 : "améliore les pages effectifs et calendrier des
// adversaires") — voir teamCalendarRows/teamCalendarTableHtml/
// teamCalendarNextCardHtml/teamCalendarHeadToHeadHtml et
// teamDetailEffectifStatsHtml dans moteurbasket3.html. Vérifie, pour
// l'adversaire de la Journée 4 :
// 1) une ligne par journée groupées par mois, résultats V/D DE CETTE ÉQUIPE,
//    bilan/forme de sa carte Saison, prochain match surligné ;
// 2) aucune ligne n'a de bouton Ordres ; les matchs contre le club du
//    manager portent la pastille "Contre vous" et la carte "Contre votre
//    club" ; la carte Prochain match (contre le manager) propose "Préparer
//    ce match" qui ouvre l'onglet Ordres sur la bonne journée ;
// 3) filtres Domicile/Extérieur/À venir propres à la fiche ;
// 4) vue Statistiques : tri par défaut Pts décroissant, meilleur marqueur
//    mis en avant.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {
const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

// Adversaire du manager à la Journée 4 (index 3).
const oppIdx = win.eval(`(() => { const m = league.schedule[3].find(x => x.home === myTeamIndex || x.away === myTeamIndex); return m.home === myTeamIndex ? m.away : m.home; })()`);
// 3 premiers résultats de CETTE équipe : V, D, V de son point de vue.
win.eval(`
  const scores = [[84, 77], [71, 79], [92, 88]];
  for (let r = 0; r < 3; r++) {
    league.schedule[r].forEach(m => {
      let sh = 70, sa = 60;
      if (m.home === ${oppIdx} || m.away === ${oppIdx}) {
        const [mine, opp] = scores[r];
        sh = m.home === ${oppIdx} ? mine : opp; sa = m.home === ${oppIdx} ? opp : mine;
      }
      league.results.push({ round: r, home: m.home, away: m.away, scoreHome: sh, scoreAway: sa });
    });
  }
  league.round = 3;
`);
const openOppCalendar = () => {
  win.showTeamDetail(oppIdx);
  doc.querySelector('[data-team-detail-subview="calendrier"]').click();
};
openOppCalendar();
const root = doc.querySelector("#teamDetailContent .tde-calendar");
if (!root) throw new Error("❌ Le calendrier de la fiche équipe devrait utiliser la nouvelle mise en page (.tde-calendar).");
const rows = [...root.querySelectorAll("table.cal-month tbody tr.cal-row")];
const champRows = rows.filter(r => r.querySelector("abbr.cal-round"));
console.log("Lignes :", rows.length, "| championnat :", champRows.length, "| tableaux de mois :", root.querySelectorAll("table.cal-month").length);
if (champRows.length !== 18) throw new Error(`❌ 18 journées attendues, obtenu ${champRows.length}.`);
const letters = champRows.slice(0, 3).map(r => (r.querySelector(".cal-result-letter") || {}).textContent).join("");
if (letters !== "VDV") throw new Error(`❌ V/D de l'équipe consultée attendus "VDV", obtenu "${letters}".`);
if (!champRows[3].classList.contains("me")) throw new Error("❌ La Journée 4 (prochain match de cette équipe) devrait être surlignée.");
const bilan = root.querySelector(".cal-season .cal-kpi .cal-kpi-value").textContent;
if (bilan !== "2-1") throw new Error(`❌ Bilan de l'équipe consultée attendu "2-1", obtenu "${bilan}".`);
const form = [...root.querySelectorAll(".cal-season .cal-form:not(.cal-form-empty)")].map(e => e.textContent).join("");
if (form !== "VDV") throw new Error(`❌ Forme attendue "VDV", obtenu "${form}".`);
console.log("✅ Résultats, bilan 2-1 et forme VDV calculés du point de vue de l'équipe consultée ; J4 surlignée.");

if (root.querySelectorAll(".calendar-order-btn").length) throw new Error("❌ Aucune ligne du calendrier d'une autre équipe ne doit proposer de bouton Ordres.");
const vsMeCount = win.eval(`league.schedule.filter(day => day.some(m => (m.home === myTeamIndex && m.away === ${oppIdx}) || (m.away === myTeamIndex && m.home === ${oppIdx}))).length`);
const vsMeRows = rows.filter(r => r.querySelector(".tde-vs-me"));
if (vsMeRows.length < vsMeCount || vsMeCount < 1) throw new Error(`❌ ${vsMeCount} matchs contre votre club attendus avec la pastille, obtenu ${vsMeRows.length}.`);
if (!champRows[3].querySelector(".tde-vs-me")) throw new Error("❌ La J4 (contre le club du manager) devrait porter la pastille \"Contre vous\".");
const h2h = root.querySelector(".tde-h2h");
if (!h2h || h2h.querySelectorAll(".tde-h2h-row").length !== vsMeRows.length) throw new Error("❌ La carte \"Contre votre club\" devrait lister chaque confrontation.");
const prepBtn = root.querySelector(".cal-next .cal-next-btn");
if (!prepBtn || Number(prepBtn.dataset.round) !== 3 || prepBtn.dataset.competition !== "championship") {
  throw new Error("❌ La carte Prochain match (contre le manager) devrait proposer \"Préparer ce match\" sur la Journée 4.");
}
console.log(`✅ Pas de bouton Ordres sur les lignes, ${vsMeRows.length} match(s) "Contre vous", carte Contre votre club, bouton Préparer ce match (J4).`);

// Filtres
const homeCount = win.eval(`league.schedule.filter(day => day.some(m => m.home === ${oppIdx})).length`);
const click = k => root.querySelector(`[data-tde-cal-filter="${k}"]`).click();
const visible = () => champRows.filter(r => !r.classList.contains("hidden"));
click("home");
if (visible().length !== homeCount || visible().some(r => r.dataset.venue !== "home")) throw new Error(`❌ Filtre Domicile : ${homeCount} attendues, ${visible().length} visibles.`);
click("upcoming");
if (visible().length !== 15) throw new Error(`❌ Filtre À venir : 15 journées attendues, ${visible().length} visibles.`);
click("all");
if (visible().length !== 18) throw new Error("❌ Filtre Tous : 18 journées visibles attendues.");
console.log(`✅ Filtres de la fiche : Domicile (${homeCount}), À venir (15), Tous (18).`);

prepBtn.click();
const onOrdres = !doc.getElementById("prepSection").classList.contains("hidden");
if (!onOrdres) throw new Error("❌ \"Préparer ce match\" devrait ouvrir l'onglet Ordres.");
console.log("✅ \"Préparer ce match\" ouvre l'onglet Ordres.");

// Vue Statistiques
win.eval(`
  const t = league.teams[${oppIdx}];
  const line = (pts, reb) => ({ competition: "championship", round: 0, min: 25, pts, reb, ast: 2, stl: 1, blk: 0, tov: 1, pf: 2, fgm2: 4, fga2: 8, fgm3: 1, fga3: 3, ftm: 2, fta: 2 });
  t.players.forEach((p, i) => { p.matchLog = i < 4 ? [line(5 + i * 6, 3), line(7 + i * 6, 4)] : []; });
`);
win.eval("teamDetailEffectifSortState = { key: null, dir: 1 };");
win.showTeamDetail(oppIdx);
doc.querySelector('[data-team-detail-subview="effectif"]').click();
doc.querySelector('[data-team-effectif-view="stats"]').click();
const statsTable = doc.querySelector("#teamDetailContent table.tde-stats");
if (!statsTable) throw new Error("❌ La vue Statistiques devrait afficher un tableau.");
const statRows = [...statsTable.querySelectorAll("tbody tr")];
if (statRows.length !== 4) throw new Error(`❌ Seuls les 4 joueurs ayant joué devraient apparaître, obtenu ${statRows.length}.`);
const ptsIdx = [...statsTable.querySelectorAll("thead th")].findIndex(th => th.dataset.teamSort === "pts");
const pts = statRows.map(r => Number(r.children[ptsIdx].textContent.replace(",", ".")));
console.log("Pts/match (attendu décroissant) :", pts.join(" / "));
if (!pts.every((v, i) => i === 0 || pts[i - 1] >= v)) throw new Error("❌ Tri par défaut Pts décroissant attendu.");
if (!statRows[0].children[ptsIdx].classList.contains("tde-lead")) throw new Error("❌ Le meilleur marqueur devrait être mis en avant.");
console.log("✅ Vue Statistiques : 4 joueurs, tri Pts décroissant, meilleur marqueur mis en avant.");

await flush(dom);
dom.window.close();
server.close();
console.log("\n🏁 Fiche équipe > Calendrier / Statistiques : tous les tests sont passés.");
})().catch(e => { console.error(e); process.exit(1); });
