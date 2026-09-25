// Brique Budget du tableau de bord : revenus, dépenses et revenu net de la
// SEMAINE PRÉCÉDENTE (retours utilisateur 2026-09-25 : "dépense et revenu et
// Revenus Net Hebdomadaires, incluant la billetterie, à mettre à jour à la
// mise à jour éco", puis "il faut pas des moyennes mais les chiffres de la
// semaine précédente"). Vérifie : dernière semaine terminée seulement (la
// semaine en cours est ignorée), toutes les lignes comptées (même bilan que
// l'historique de l'onglet Économie), affichage, et repli sur la masse
// salariale avant la toute première mise à jour économique.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const flat = s => s.replace(/[\s  ]+/g, "");

(async () => {
const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
const clickTab = k => [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === k).click();
const budgetCard = () => doc.querySelector(".hm-kpis .hm-kpi").textContent;

win.eval(`teamA.week = 1; teamA.transactions = [];`);
clickTab("economie"); clickTab("club");
assert(budgetCard().includes("Masse salariale"), "Avant la 1re mise à jour éco : ligne masse salariale conservée");

win.eval(`
  const T = (week, label, amount) => ({ week, label, amount });
  teamA.week = 3;
  teamA.transactions = [
    T(3, "Billetterie vs Nice (4000 spect.)", 120000),
    T(2, "Droits TV (Division I)", 25000), T(2, "Recettes boutique des supporters (Stand souvenirs)", 2000),
    T(2, "Salaires des joueurs", -51087), T(2, "Salaire du staff (recruteur)", -5500), T(2, "Salaire du staff (analyste vidéo)", -15062),
    T(2, "Salaire du staff", -3072), T(2, "Subvention de démarrage", 50000), T(2, "Billetterie vs ZyF0x_ (5672 spect.)", 159455),
    T(2, "Agrandissement de la salle (Gymnase municipal)", -150000),
    T(1, "Droits TV (Division I)", 25000), T(1, "Billetterie vs Venomous (3213 spect.)", 93700), T(1, "Salaires des joueurs", -51087),
  ];
`);
const lw = win.eval("dashboardLastWeekFlows(teamA)");
assert(lw.week === 2, "Semaine précédente = semaine 2 (la semaine 3 en cours est ignorée)");
assert(lw.revenue === 236455 && lw.expenses === 224721 && lw.net === 11734, "Chiffres de la semaine 2 : +236 455 / −224 721 / +11 734, billetterie comprise (" + JSON.stringify(lw) + ")");

clickTab("economie"); clickTab("club");
const card = flat(budgetCard());
assert(card.includes("Revenus+236455€") && card.includes("Dépenses−224721€") && card.includes("Revenunet+11734€"), "Brique Budget : revenus, dépenses et revenu net de la semaine précédente (" + budgetCard().replace(/\s+/g, " ").trim() + ")");
assert(card.includes("Semaine2"), "Brique Budget : semaine concernée indiquée");
assert(!card.includes("Moyenne"), "Plus aucune moyenne affichée");

await flush(dom);
dom.window.close();
server.close();
console.log("\n🏁 Chiffres de la semaine précédente dans la brique Budget vérifiés.");
})().catch(e => { console.error(e); process.exit(1); });
