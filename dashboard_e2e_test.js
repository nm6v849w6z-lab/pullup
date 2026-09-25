// Vérifie de bout en bout la refonte du tableau de bord (direction « A ·
// Soir de match », voir DEV_NOTES.md point 10) : montage réel via
// mountDashboard() sur de vraies données (teamA/league), navigation vers les
// vraies pages du jeu via les liens data-dash-href, ouverture de la modale
// "Identité du club", persistance d'un événement réel du fil d'actualité à
// travers un rechargement complet (nouveau serveur relisant son fichier), et
// marquage "lu" du fil en quittant le tableau de bord. Même patron JSDOM +
// vrai petit serveur local que lineup_test.js/away_jersey_test.js (pas de
// canvas, win.eval() pour lire l'état réel du jeu).
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
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
function currentPageId() {
  // PAGE_IDS (voir showPage) est la seule liste fiable des VRAIES pages de
  // premier niveau — d'autres éléments finissant par "Section" existent
  // dans le DOM (panneaux imbriqués, ex. liveBoxscoreSection) sans jamais
  // être gérés par showPage, donc pas forcément masqués par défaut.
  const ids = win.eval("PAGE_IDS");
  return ids.find(id => {
    const el = doc.getElementById(id);
    return el && !el.classList.contains("hidden");
  }) || null;
}

// ---------------------------------------------------------------------
// Partie 1 : montage réel, données réelles (pas de placeholders inventés).
// ---------------------------------------------------------------------
clickTab("club");
const root = doc.getElementById("clubDashboardRoot");
if (!root || !root.classList.contains("hm-dash")) throw new Error("❌ Le tableau de bord devrait être monté (mountDashboard) dans #clubDashboardRoot.");

const teamName = win.eval("teamA.name");
const headName = doc.querySelector(".hm-head__name")?.textContent.trim();
console.log("Nom du club affiché :", headName, "(attendu :", teamName + ")");
if (headName !== teamName) throw new Error("❌ Le nom du club dans l'en-tête devrait être le VRAI nom de teamA.");

const realBudget = win.eval("teamA.budget");
const budgetKpiText = doc.querySelector(".hm-kpis .hm-kpi:nth-child(1) .hm-kpi__value")?.textContent || "";
const budgetDigits = budgetKpiText.replace(/[^\d-]/g, "");
console.log("Budget réel :", realBudget, "| Budget affiché (chiffres) :", budgetDigits);
if (Number(budgetDigits) !== realBudget) throw new Error("❌ Le KPI Budget devrait afficher le VRAI budget de teamA (aucune valeur inventée).");

const realSquadCount = win.eval("teamA.players.length");
const squadKpiText = doc.querySelector(".hm-kpis .hm-kpi:nth-child(3) .hm-kpi__value")?.textContent || "";
console.log("Effectif réel :", realSquadCount, "| Effectif affiché :", squadKpiText);
if (!squadKpiText.includes(String(realSquadCount))) throw new Error("❌ Le KPI Effectif devrait afficher le VRAI nombre de joueurs de teamA.");
console.log("✅ Tableau de bord monté avec de vraies données (nom, budget, effectif).");

// ---------------------------------------------------------------------
// Partie 2 : navigation — un clic sur un lien du tableau de bord
// (data-dash-href) doit ouvrir la VRAIE page correspondante du jeu.
// ---------------------------------------------------------------------
const effectifKpiLink = [...doc.querySelectorAll("[data-dash-href]")].find(a => a.dataset.dashHref === "/effectif");
if (!effectifKpiLink) throw new Error("❌ Le KPI Effectif devrait porter data-dash-href=\"/effectif\".");
effectifKpiLink.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
console.log("Page ouverte après clic sur le KPI Effectif :", currentPageId());
if (currentPageId() !== "effectifSection") throw new Error("❌ Le clic sur le KPI Effectif devrait ouvrir la vraie page Effectif (effectifSection).");
console.log("✅ La navigation depuis le tableau de bord ouvre les vraies pages du jeu (pont dashResolveNavigate → TAB_HANDLERS).");

// Revient sur le tableau de bord pour la suite.
clickTab("club");

// ---------------------------------------------------------------------
// Partie 3 : bouton "Identité du club" (carte retirée du tableau de bord,
// accès relocalisé vers la modale existante, voir DEV_NOTES.md point 10).
// ---------------------------------------------------------------------
const identityBtn = doc.querySelector('[data-dash-href="/parametres/identite"]');
if (!identityBtn) throw new Error("❌ Le bouton \"Identité du club\" devrait être présent dans l'en-tête du tableau de bord.");
identityBtn.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
const identityOverlay = doc.getElementById("clubIdentityModalOverlay");
console.log("Modale Identité ouverte :", !!identityOverlay);
if (!identityOverlay) throw new Error("❌ Le bouton \"Identité du club\" devrait ouvrir la modale d'identité existante.");
win.eval("closeClubIdentityModal()");
console.log("✅ Le bouton \"Identité du club\" ouvre bien la modale existante (pas de nouvel écran de paramètres créé).");

// ---------------------------------------------------------------------
// Partie 4 : fil d'actualité — une VRAIE interview de début de saison est
// déjà présente (queueSeasonPreviewInterview, voir generateLeague côté
// moteur) : elle doit apparaître dans le fil affiché, et son lien "Répondre"
// doit ouvrir la VRAIE modale d'interview (pas une modale factice).
// ---------------------------------------------------------------------
clickTab("club");
const feedItems = [...doc.querySelectorAll(".hm-feed__item")];
console.log("Entrées de fil affichées :", feedItems.length);
if (feedItems.length < 1) throw new Error("❌ Le fil d'actualité devrait afficher au moins une entrée (interview de début de saison).");
const interviewLink = doc.querySelector('.hm-feed__action[href^="/interview/"]');
if (!interviewLink) throw new Error("❌ Une entrée de fil \"interview\" avec un lien /interview/:id devrait être affichée.");
interviewLink.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
const interviewOverlay = doc.getElementById("interviewModalOverlay");
console.log("Modale d'interview ouverte depuis le fil :", !!interviewOverlay);
if (!interviewOverlay) throw new Error("❌ Le clic sur l'action d'une entrée \"interview\" du fil devrait ouvrir la VRAIE modale d'interview (showInterviewModal).");
win.eval("closeInterviewModal()");
console.log("✅ Le fil d'actualité affiche de vraies entrées et ses actions routent vers les vrais écrans (dashResolveNavigate).");

// ---------------------------------------------------------------------
// Partie 5 : un événement RÉEL émis par le moteur (staff_hired, via
// League._resolveCoachListing) apparaît dans le fil affiché, ET survit à un
// rechargement complet de la page (persistance feed dans serializeTeam).
// ---------------------------------------------------------------------
// listing.currentBid est `null` à la génération (voir _makeStaffListing) —
// la mise minimale est `listing.startPrice`, pas `listing.currentBid`
// (aurait donné `null + 5000` = 5000 €, bien en-dessous du prix de départ
// réel dès qu'un candidat de niveau un peu élevé est tiré au sort,
// entraînant un placeCoachBid silencieusement refusé (mise trop basse) un
// tirage sur N — même piège déjà évité dans dashboard_feed_test.js).
const bidPlaced = win.eval(`
  teamA.budget = 5000000;
  const listing = league.generateCoachCandidate(Date.now());
  const res = league.placeCoachBid(listing.id, myTeamIndex, listing.startPrice + 1000, Date.now() + 10);
  res.ok
`);
if (!bidPlaced) throw new Error("❌ Scénario cassé : la mise sur le candidat entraîneur généré aurait dû être acceptée.");
// Force la résolution immédiate de l'enchère (même patron que
// coach_market_test.js/dashboard_feed_test.js : avance juste après
// l'échéance, biaise Math.random pour que l'humain gagne face aux CPU).
win.eval(`
  window.__origRandom = Math.random;
  Math.random = () => 0.999999;
`);
win.eval(`league.refreshCoachMarket(Date.now() + COACH_AUCTION_DURATION_MS + 100);`);
win.eval(`Math.random = window.__origRandom;`);
// league.refreshCoachMarket() (méthode League, moteur pur) ne sauvegarde
// rien elle-même — seul le wrapper UI refreshCoachMarket() (sans argument,
// utilisé par le vrai bouton du marché du staff) appelle saveMyTeam()
// derrière ; on le fait ici explicitement pour que la persistance soit
// testée fidèlement.
win.eval(`saveMyTeam();`);
const coachHired = win.eval("!!teamA.trainer");
console.log("Entraîneur recruté via enchère réelle :", coachHired);
if (!coachHired) throw new Error("❌ Scénario cassé : l'enchère d'entraîneur devrait avoir été gagnée par l'humain.");

clickTab("club"); // remonte le tableau de bord pour rafraîchir le fil affiché
const staffFeedEntry = [...doc.querySelectorAll(".hm-feed__item-title")].find(t => /Nouvel? Entraîneur/.test(t.textContent) || /Entraîneur/.test(t.textContent));
console.log("Entrée \"staff_hired\" visible dans le fil affiché :", staffFeedEntry ? staffFeedEntry.textContent : null);
if (!staffFeedEntry) throw new Error("❌ L'événement staff_hired réel (recrutement d'entraîneur) devrait apparaître dans le fil affiché.");

await flush(dom);
win.close();
const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
function clickTab2(key) {
  const btn = [...doc2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key);
  btn.click();
}
clickTab2("club");
const staffFeedEntryAfterReload = [...doc2.querySelectorAll(".hm-feed__item-title")].find(t => /Entraîneur/.test(t.textContent));
console.log("Entrée \"staff_hired\" survit au rechargement :", !!staffFeedEntryAfterReload);
if (!staffFeedEntryAfterReload) throw new Error("❌ L'événement de fil réel devrait survivre à un rechargement complet (feed persisté dans serializeTeam/teamFromSave).");
console.log("✅ Un événement réel du moteur (staff_hired) apparaît dans le fil affiché ET survit à un rechargement complet.");

// ---------------------------------------------------------------------
// Partie 6 : quitter le tableau de bord marque le fil comme lu (voir
// clubDashboardMounted + markAllRead dans la délégation [data-tab]).
// ---------------------------------------------------------------------
const unreadBefore = dom2.window.eval("unreadCount(teamA.feed)");
console.log("Non-lus avant de quitter le tableau de bord :", unreadBefore);
if (unreadBefore < 1) throw new Error("❌ Scénario cassé : il devrait y avoir au moins une entrée non lue avant de quitter le tableau de bord.");
clickTab2("staff");
await flush(dom2);
const unreadAfter = dom2.window.eval("unreadCount(teamA.feed)");
console.log("Non-lus après avoir quitté le tableau de bord pour l'onglet Staff :", unreadAfter);
if (unreadAfter !== 0) throw new Error("❌ Quitter le tableau de bord devrait marquer tout le fil comme lu (markAllRead).");
console.log("✅ Quitter le tableau de bord marque bien tout le fil comme lu.");

await flush(dom2);
dom2.window.close();
server.close();
console.log("\n✅ Tableau de bord (refonte \"Soir de match\") vérifié de bout en bout : données réelles, navigation vers les vraies pages, modale d'identité, fil d'actualité réel et persistant, marquage lu.");

})().catch(e => { console.error(e); process.exit(1); });
