// Refonte de l'onglet Économie (retour utilisateur, 2026-09-25 : "réfléchis
// à comment rendre cette page plus sympa", maquette validée "ça claque pas
// mal, code tout ça"). Vérifie, sur un journal reproduisant la capture
// d'écran de l'utilisateur : historique groupé par semaine avec bilans
// exacts, tutoriel regroupé en une ligne (détail dépliable), libellés
// réinterprétés ("Salaire du staff" = Entraîneur), filtres Revenus/Dépenses,
// repli d'une semaine, masse salariale (joueurs + staff), cartes
// Salle/Boutique, et bloc admin toujours présent tel quel. La carte
// "Semaine type" et les textes secondaires ont été retirés à la demande de
// l'utilisateur (2026-09-25) : on vérifie qu'ils ne reviennent pas.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const norm = s => s.replace(/[\s  ]+/g, " ").trim();

(async () => {
const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

win.eval(`
  const T = (week, label, amount) => ({ week, label, amount });
  teamA.week = 3;
  teamA.transactions = [
    T(2, "Droits TV (Division I)", 25000), T(2, "Recettes boutique des supporters (Stand souvenirs)", 2000),
    T(2, "Salaires des joueurs", -51087), T(2, "Salaire du staff (recruteur)", -5500), T(2, "Salaire du staff (analyste vidéo)", -15062),
    T(2, "Salaire du staff", -3072), T(2, "Subvention de démarrage", 50000), T(2, "Billetterie vs ZyF0x_ (5672 spect.)", 159455),
    T(2, "Agrandissement de la salle (Gymnase municipal)", -150000),
    T(1, "Droits TV (Division I)", 25000), T(1, "Recettes boutique des supporters (Stand souvenirs)", 2000),
    T(1, "Salaires des joueurs", -51087), T(1, "Salaire du staff (analyste vidéo)", -14400), T(1, "Salaire du staff", -3000),
    T(1, "Subvention de démarrage", 50000), T(1, "Billetterie vs Venomous (3213 spect.)", 93700),
    T(1, "Tutoriel d'accueil : Salle", 15000), T(1, "Tutoriel d'accueil : Économie", 15000), T(1, "Tutoriel d'accueil : Académie de jeunes", 40000),
    T(1, "Tutoriel d'accueil : Staff", 20000), T(1, "Tutoriel d'accueil : Marché", 25000), T(1, "Tutoriel d'accueil : Entraînement", 20000),
    T(1, "Tutoriel d'accueil : Ordres", 50000), T(1, "Tutoriel d'accueil : Effectif", 15000), T(1, "Boutique des supporters : Stand souvenirs", -40000),
  ];
  teamA.budget = 573947;
  teamA.fanShopLevel = 1;
  teamA.attendanceHistory = [{ week: 2, opponentName: "ZyF0x_", attendance: 5672, revenue: 159455, capacity: 8000 }];
  teamA.trainer = { level: 1, weeksEmployed: 0, baseSalary: 3072 };
  teamA.videoAnalyst = { level: 3, weeksEmployed: 0, baseSalary: 15062 };
  teamA.recruiter = { level: 2, weeksEmployed: 0, baseSalary: 5500 };
`);
[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "economie").click();

const weeks = [...doc.querySelectorAll("#economieTransactions .eco-week")];
assert(weeks.length === 2, "Historique groupé en 2 blocs (semaines 2 et 1)");
const head2 = norm(weeks[0].querySelector(".eco-week-head").textContent);
const head1 = norm(weeks[1].querySelector(".eco-week-head").textContent);
assert(head2.includes("Semaine 2") && head2.includes("+11 734 €") && head2.includes("+236 455 €") && head2.includes("−224 721 €"), "Semaine 2 : bilan net +11 734 €, revenus +236 455 €, dépenses −224 721 € (" + head2 + ")");
assert(head1.includes("Semaine 1") && head1.includes("+262 213 €"), "Semaine 1 : bilan net +262 213 €");

const rows1 = [...weeks[1].querySelectorAll(".eco-row")].map(r => norm(r.textContent));
const tutoRows = rows1.filter(t => t.includes("Tutoriel d'accueil"));
assert(tutoRows.length === 1 && tutoRows[0].includes("8 étapes") && tutoRows[0].includes("+200 000 €"), "Les 8 lignes du tutoriel sont regroupées en une seule (+200 000 €)");
assert(rows1[0].includes("Tutoriel"), "Les revenus sont triés du plus gros au plus petit (tutoriel en tête)");
assert(!doc.querySelector("#economieTransactions .eco-subgrid"), "Détail du tutoriel replié par défaut");
doc.querySelector('[data-eco-tuto="1"]').click();
assert(doc.querySelectorAll("#economieTransactions .eco-subgrid span > b").length === 8, "Le bouton Détail déplie les 8 étapes du tutoriel");

const rows2 = [...doc.querySelectorAll("#economieTransactions .eco-week")[0].querySelectorAll(".eco-row")].map(r => norm(r.textContent));
assert(rows2.some(t => t.includes("Staff · Entraîneur") && t.includes("−3 072 €")), "\"Salaire du staff\" est affiché comme Staff · Entraîneur");
assert(rows2.some(t => t.includes("Agrandissement de la salle") && t.includes("Exceptionnel")), "Les dépenses ponctuelles portent l'étiquette Exceptionnel");

doc.querySelector('[data-eco-filter="in"]').click();
let amounts = [...doc.querySelectorAll("#economieTransactions .eco-row .eco-amt")].map(a => a.textContent);
assert(amounts.length > 0 && amounts.every(a => a.startsWith("+")), "Filtre Revenus : uniquement des montants positifs");
doc.querySelector('[data-eco-filter="out"]').click();
amounts = [...doc.querySelectorAll("#economieTransactions .eco-row .eco-amt")].map(a => a.textContent);
assert(amounts.length > 0 && amounts.every(a => a.startsWith("−")), "Filtre Dépenses : uniquement des montants négatifs");
doc.querySelector('[data-eco-filter="all"]').click();

doc.querySelector('[data-eco-week="2"]').click();
assert(!doc.querySelectorAll("#economieTransactions .eco-week")[0].classList.contains("open"), "Cliquer sur l'en-tête replie la semaine");

const total = norm(doc.querySelector("#economieTransactions .gain-line-total").textContent);
assert(total.includes("Budget initial : 300 000 €") && total.includes("+273 947 €"), "Pied d'historique : budget initial et total depuis le début");

const charges = win.eval("teamA.players.reduce((s,p)=>s+p.salary,0) + teamA.trainerSalary() + teamA.videoAnalystSalary() + teamA.recruiterSalary()");
assert(norm(doc.getElementById("economiePayroll").textContent).startsWith(charges.toLocaleString("fr-FR").replace(/[  ]/g, " ")), "Carte Masse salariale : total joueurs + staff");

const arena = norm(doc.getElementById("economieArenaSummary").textContent);
assert(arena.includes("71 %") && arena.includes("159 455 €") && arena.includes("28,1 €"), "Carte Salle : remplissage 71 %, recette et prix moyen par spectateur");
const shop = norm(doc.getElementById("economieFanShopSummary").textContent);
assert(shop.includes("4 000 / 40 000 €") && shop.includes("18 semaines") && shop.includes("Boutique du club"), "Carte Boutique : amortissement, semaines restantes et palier suivant");

assert(doc.getElementById("economieBudgetChart").querySelectorAll(".eco-chart-dot").length === 3, "Courbe du budget : départ + fin S1 + fin S2");
const pageText = norm(doc.getElementById("economieSection").textContent);
assert(!pageText.includes("Semaine type") && !pageText.includes("Autonomie") && !pageText.includes("Solde en début de semaine") && !pageText.includes("depuis le début (départ") && !pageText.includes("Versé automatiquement") && !pageText.includes("Payée chaque semaine"), "Carte Semaine type et textes secondaires bien retirés");
assert(!!doc.getElementById("adminResetLeagueSection") && !!doc.getElementById("resetLeagueBtn"), "Bloc d'administration de la ligue toujours présent");

await flush(dom);
dom.window.close();
server.close();
console.log("\n🏁 Refonte de l'onglet Économie vérifiée.");
})().catch(e => { console.error(e); process.exit(1); });
