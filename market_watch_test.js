// Marché — liste de suivi et alertes (Premium, retour utilisateur,
// 2026-09-27 : « Liste de suivi du marché des transferts et alertes »). Voir
// engine.js (MARKET_WATCHLIST_MAX, Team.setMarketWatch/saveMarketAlert,
// League.checkMarketAlerts), server/actions.js, moteurbasket3.html (Marché).
const fs = require("fs");
const E = require("./engine.js");
const actions = require("./server/actions.js");
function check(cond, msg) { if (!cond) throw new Error(`❌ ${msg}`); console.log(`✅ ${msg}`); }

const T0 = Date.UTC(2026, 8, 27, 9);
const lg = E.generateMultiManagerLeague(["A", "B"], 1, T0, { dailyAnchored: true });
const me = lg.teams.findIndex(t => t.isHuman);
const team = lg.teams[me];
const cpuIdx = lg.teams.findIndex(t => !t.isHuman);
const cpu = lg.teams[cpuIdx];

// 1) Réservé au Premium.
check(!team.setMarketWatch(cpu.players[0].id, true, T0).ok && !team.saveMarketAlert({ pos: "Pivot" }, T0).ok, "suivi et alertes refusés sans Premium");
check(!actions.setMarketWatch(team, me, lg, { playerId: cpu.players[0].id, watch: true }, T0).ok, "route /api/market/watch refusée sans Premium");
team.setPaying(true);

// 2) Liste de suivi.
const watched = cpu.players[0];
check(team.setMarketWatch(watched.id, true, T0).ok && team.isWatchingPlayer(watched.id), "Premium : suivre un joueur");
check(!team.saveMarketAlert({}, T0).ok, "une alerte sans aucun filtre est refusée");
const target = cpu.players.find(p => p.id !== watched.id);
const r = actions.setMarketAlert(team, me, lg, { op: "save", alert: { pos: target.position, crit: [{ key: "pass", min: 0, max: 99 }] } }, T0);
check(r.ok && team.marketAlerts.length === 1 && /pass|Passe/i.test(E.marketAlertLabel(team.marketAlerts[0])), "Premium : alerte enregistrée avec un libellé lisible");

// 3) Alertes dans le fil d'actualité.
const feedCount = () => team.feed.entries.filter(e => e.category === "marche" && /^mkt_/.test(e.key || "")).length;
const lWatch = lg.listPlayerForSale(cpuIdx, watched.id, 5000, T0 + 1000);
const lAlert = lg.listPlayerForSale(cpuIdx, target.id, 5000, T0 + 1000);
lg.checkMarketAlerts(T0 + 2000);
const keys = team.feed.entries.map(e => e.key);
check(keys.includes(`mkt_watch_${lWatch.id}`) && keys.includes(`mkt_alert_${lAlert.id}`), "joueur suivi mis en vente + annonce correspondant à l'alerte signalés");
const n1 = feedCount();
lg.checkMarketAlerts(T0 + 3000);
check(feedCount() === n1, "chaque annonce n'est signalée qu'une fois");
lg.checkMarketAlerts(lWatch.closesAt - 30 * 60 * 1000);
check(team.feed.entries.some(e => e.key === `mkt_end_${lWatch.id}`), "fin d'enchère proche d'un joueur suivi signalée");
// Annonce antérieure à l'alerte : pas signalée.
const other = cpu.players.find(p => p.id !== watched.id && p.id !== target.id && p.position === target.position);
if (other) {
  const lOld = lg.listPlayerForSale(cpuIdx, other.id, 5000, T0 - 60 * 1000);
  lg.checkMarketAlerts(T0 + 4000);
  check(!team.feed.entries.some(e => e.key === `mkt_alert_${lOld.id}`), "une annonce antérieure à l'alerte n'est pas signalée");
}
// Sauvegarde.
const back = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(team))));
check(back.isWatchingPlayer(watched.id) && back.marketAlerts.length === 1 && Object.keys(back.marketAlertSeen).length > 0, "liste de suivi, alertes et annonces signalées survivent à la sauvegarde");
// Premium arrêté : plus d'alertes.
team.setPaying(false);
const lNew = lg.listPlayerForSale(cpuIdx, cpu.players.find(p => ![watched.id, target.id].includes(p.id) && !lg.transferListings.some(l => l.status === "open" && l.playerId === p.id)).id, 5000, T0 + 5000);
const before = feedCount();
lg.checkMarketAlerts(T0 + 6000);
check(feedCount() === before && lNew, "sans Premium : plus aucune alerte");
team.setPaying(true);
check(actions.setMarketAlert(team, me, lg, { op: "delete", id: team.marketAlerts[0].id }, T0).ok && !team.marketAlerts.length, "alerte supprimée");
check(/checkMarketAlerts\(now\)/.test(fs.readFileSync("server/autoSim.js", "utf-8")), "alertes vérifiées à chaque passage serveur");

// 4) Page Marché.
(async () => {
  const { startTestServer, openGame, flush } = require("./test_helpers.js");
  const html = fs.readFileSync("moteurbasket3.html", "utf-8");
  const { server } = await startTestServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const dom = await openGame(html, baseUrl);
    const doc = dom.window.document;
    const win = dom.window;
    win.eval(`(() => { const cpu = league.teams.findIndex((t, i) => i !== myTeamIndex); league.teams[cpu].players.slice(0, 2).forEach(p => league.listPlayerForSale(cpu, p.id, 5000, Date.now())); })()`);
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "marche").click();
    await flush(dom);
    check(!!doc.querySelector('.mk-watch[data-tab="premium"]'), "gratuit : « Suivre » mène à l'onglet Premium");
    win.eval("teamA.setPaying(true); renderMarcheSection();");
    const btn = doc.querySelector(".mk-watch[data-mk-watch]");
    btn.click();
    check(win.eval(`teamA.isWatchingPlayer(${btn.dataset.mkWatch})`) && doc.querySelector(`.mk-watch[data-mk-watch="${btn.dataset.mkWatch}"]`).classList.contains("on"), "Premium : « Suivre » ajoute le joueur à la liste de suivi");
    doc.getElementById("marketWatchedBtn").click();
    check(doc.querySelectorAll("#marketListings .mk-lst").length === 1, "filtre « Joueurs suivis »");
    doc.getElementById("marketWatchedBtn").click();
    doc.querySelector('[data-mk-pos="Pivot"]').click();
    const save = doc.querySelector("[data-mk-alert-save]");
    check(!!save, "« Créer une alerte avec ces filtres » proposé dès qu'un filtre est actif");
    save.click();
    await win.__lastMarketAlertSync;
    check(win.eval("teamA.marketAlerts.length") === 1 && /Pivot/.test(doc.getElementById("marketAlertsBar").textContent), "alerte créée et affichée");
    doc.querySelector("[data-mk-alert-del]").click();
    await win.__lastMarketAlertSync;
    check(win.eval("teamA.marketAlerts.length") === 0 && doc.getElementById("marketAlertsBar").hidden, "alerte supprimée depuis la page");
    dom.window.close();
  } finally {
    server.close();
  }
  console.log("\n🏁 market_watch_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
