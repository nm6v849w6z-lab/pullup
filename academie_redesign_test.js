// Vérifie la refonte de l'onglet Académie de jeunes (retour utilisateur,
// 2026-09-26 : "améliore l'onglet académie de jeunes") :
//   1. bandeau de synthèse (places, stagiaires, recruteur, promus) ;
//   2. états vides : sans recruteur (bouton vers Staff), avec recruteur ;
//   3. prospects en CARTES (plus de tableau à défilement horizontal) :
//      badge de potentiel à 3 bandes, compte à rebours, moyennes par
//      groupe, points forts/faibles, boutons Recruter/Ignorer visibles et
//      fonctionnels ;
//   4. effectif jeunes en cartes (progression vers le plafond 50) ;
//   5. décision 18 ans en carte, historique des promus (plus récent en
//      premier) après promotion.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {
const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
const norm = s => String(s).replace(/\s+/g, " ").trim();
const txt = sel => norm((doc.querySelector(sel) || { textContent: "" }).textContent);
function clickTab(key) { [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click(); }
function fail(m) { throw new Error("❌ " + m); }

// --- 1/2. Aucun jeune, aucun recruteur ---
win.eval("teamA.recruiter = null; teamA.youthCandidates = []; teamA.youthPlayers = []; teamA.pendingYouthDecisions = []; teamA.academyGraduatesHistory = [];");
clickTab("academie");
if (doc.querySelectorAll("#academyOverview .ac-kpi").length !== 4) fail("Le bandeau devrait avoir 4 chiffres clés.");
if (!txt('#academyOverview [data-kpi="places"]').includes("0 / 15")) fail("Places : 0 / 15 attendu.");
if (!doc.querySelector('#academyOverview [data-kpi="recruteur"].warn')) fail("Sans recruteur, la case Recruteur devrait être en alerte.");
const goto = doc.querySelector('#youthCandidatesHolder [data-ac-goto="staff"]');
if (!goto) fail("Sans recruteur, un bouton devrait mener à l'onglet Staff.");
goto.click();
if (doc.getElementById("academieSection").classList.contains("hidden") === false) fail("Le bouton devrait quitter l'onglet Académie.");
console.log("✅ Bandeau + état vide sans recruteur (bouton vers Staff).");

// --- Avec recruteur, sans prospect ---
win.eval("teamA.hireRecruiter ? teamA.hireRecruiter(3) : (teamA.recruiter = { level: 3, weeksEmployed: 0, baseSalary: 3000 });");
clickTab("academie");
if (!txt("#youthCandidatesHolder").includes("niveau 3")) fail("L'état vide avec recruteur devrait citer son niveau.");
if (!txt('#academyOverview [data-kpi="recruteur"]').includes("Niveau 3")) fail("Le bandeau devrait afficher le niveau du recruteur.");
console.log("✅ État vide avec recruteur.");

// --- 3. Prospects en cartes ---
win.eval(`const now = Date.now(); teamA.youthCandidates = [0,1,2].map(i => { const c = generateYouthCandidate(now, 3); c.expiresAt = now + (i + 1) * 5 * 3600 * 1000; return c; });`);
win.eval("renderAcademieSection();");
if (doc.querySelector("#youthCandidatesHolder table")) fail("Les prospects ne devraient plus être dans un tableau.");
const cards = doc.querySelectorAll("#youthCandidatesHolder .ac-card");
if (cards.length !== 3) fail(`3 cartes prospect attendues, obtenu ${cards.length}.`);
const first = cards[0];
if (!["Espoir", "Grand espoir", "Prodige"].includes(norm(first.querySelector(".ac-pot").textContent))) fail("Badge de potentiel à 3 bandes attendu.");
if (!first.querySelector(".ac-timer.soon")) fail("Le prospect qui expire dans 5 h devrait avoir un compte à rebours en alerte (trié en premier).");
if (first.querySelectorAll(".ac-group").length !== 3) fail("3 moyennes par groupe attendues.");
if (first.querySelectorAll(".ac-traits li").length !== 5) fail("3 points forts + 2 à travailler attendus.");
if (first.querySelectorAll(".ac-all-attrs .ac-attr-row").length !== win.eval("ATTRS.length")) fail("Le détail replié devrait lister toutes les caractéristiques.");
if (!txt("#youthCandidatesMeta").includes("3/5")) fail("Le compteur de prospects en attente devrait afficher 3/5.");
const signId = first.dataset.candidateId;
first.querySelector("[data-sign-youth]").click();
if (win.eval("teamA.youthPlayers.length") !== 1) fail("Recruter devrait signer le prospect.");
if (doc.querySelectorAll("#youthCandidatesHolder .ac-card").length !== 2) fail("La carte signée devrait disparaître.");
doc.querySelector("#youthCandidatesHolder [data-decline-youth]").click();
if (doc.querySelectorAll("#youthCandidatesHolder .ac-card").length !== 1) fail("Ignorer devrait retirer la carte.");
console.log("✅ Cartes prospect : badge, compte à rebours, groupes, traits, Recruter/Ignorer.");

// --- 4. Effectif jeunes ---
const rc = doc.querySelectorAll("#youthRosterHolder .ac-card");
if (rc.length !== 1 || rc[0].dataset.youthId !== signId) fail("Le jeune signé devrait apparaître en carte dans l'effectif jeunes.");
if (!rc[0].querySelector(".ac-progress .fill")) fail("La carte devrait montrer la progression vers le plafond 50.");
if (!txt('#academyOverview [data-kpi="places"]').includes("1 / 15")) fail("Places : 1 / 15 attendu après signature.");
if (doc.querySelectorAll("#academyOverview .ac-slots i.on").length !== 1) fail("Une case de place allumée attendue.");
console.log("✅ Effectif jeunes en cartes + bandeau à jour.");

// --- 5. Décision 18 ans puis historique ---
win.eval(`const p = teamA.youthPlayers[0]; p.age = 18; teamA.pendingYouthDecisions = [p.id]; renderAcademieSection();`);
const dec = doc.querySelector("#academiePendingBanner .ac-decision");
if (!dec) fail("La décision 18 ans devrait s'afficher en carte.");
if (!txt("#youthRosterHolder").includes("décision à prendre")) fail("La carte du jeune devrait signaler la décision en attente.");
dec.querySelector("[data-promote-youth]").click();
await flush(dom);
if (!txt("#academyGraduatesHolder").includes(win.eval("teamA.academyGraduatesHistory[0].name"))) fail("L'historique devrait lister le jeune promu.");
if (!txt('#academyOverview [data-kpi="promus"]').includes("1")) fail("Le bandeau devrait compter 1 promu.");
console.log("✅ Décision 18 ans en carte, historique et bandeau mis à jour après promotion.");

console.log("✅ academie_redesign_test OK");
process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
