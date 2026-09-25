// Pendant le direct d'un match du club (retour utilisateur 2026-09-25 :
// "quand le match est en cours, on ne peut pas avoir le bouton donner vos
// ordres et scouter l'adversaire, il faut que ce soit noté voir le live
// plutôt ; idem dans la barre en haut, il faut enlever le bouton donner vos
// ordres"). Vérifie le bandeau Prochain match du tableau de bord, la tâche
// "Ordres de match" et le bouton d'ordres du topbar, pendant puis après le
// direct.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

(async () => {
const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
const clickTab = k => [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === k).click();
const hero = () => doc.querySelector(".hm-hero");
const ordersBtn = () => doc.getElementById("topbarOrdersBtn");

assert(win.eval("!!currentMatch && !!teamB"), "Un prochain match est programmé");
clickTab("economie"); clickTab("club");
assert(!!hero().querySelector('[data-dash-href="/ordres"]') && /Scouter/.test(hero().textContent), "Hors direct : boutons ordres + scouter dans le bandeau");
assert(!ordersBtn().classList.contains("hidden"), "Hors direct : bouton d'ordres visible dans la barre du haut");

win.eval(`league.liveMatch = { round: currentMatch.round, competition: currentMatch.competition === "cup" ? "cup" : "championship", isHome: currentMatch.isHome, opponentIdx: currentMatch.opponent }; syncTopbarLiveStrip();`);
assert(ordersBtn().classList.contains("hidden"), "Pendant le direct : bouton d'ordres retiré de la barre du haut");
clickTab("economie"); clickTab("club");
const liveBtn = hero().querySelector('[data-tab="live"]');
assert(!!liveBtn && /Voir le live/.test(liveBtn.textContent), "Pendant le direct : bouton « Voir le live » dans le bandeau");
assert(!hero().querySelector('[data-dash-href="/ordres"]') && !/Scouter/.test(hero().textContent), "Pendant le direct : plus de bouton ordres ni scouter dans le bandeau");
assert(/En direct/.test(hero().querySelector(".hm-hero__comp").textContent), "Pendant le direct : bandeau marqué « En direct »");
assert(!/Ordres de match vs/.test(doc.getElementById("clubSection").textContent), "Pendant le direct : plus de tâche « Ordres de match » pour ce match");

win.eval(`league.liveMatch = null; syncTopbarLiveStrip();`);
assert(!ordersBtn().classList.contains("hidden"), "Après le direct : bouton d'ordres de retour dans la barre du haut");
clickTab("economie"); clickTab("club");
assert(!hero().querySelector('[data-tab="live"]') && !!hero().querySelector('[data-dash-href="/ordres"]'), "Après le direct : boutons habituels de retour dans le bandeau");

await flush(dom);
dom.window.close();
server.close();
console.log("\n🏁 Tableau de bord et barre du haut pendant un direct vérifiés.");
})().catch(e => { console.error(e); process.exit(1); });
