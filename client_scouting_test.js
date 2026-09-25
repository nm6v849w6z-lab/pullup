// Vérifie le scoutisme adverse + l'analyste vidéo côté navigateur
// (moteurbasket3.html) — retour utilisateur : "il faudrait pouvoir scouter
// l'effectif de son adversaire [...] en engageant un staff plus ou moins
// compétent, on peut voir plus ou moins de caractéristiques de l'adversaire
// en faisant une séance vidéo de l'adversaire". Le MOTEUR lui-même
// (League.runVideoSession/analystListings) est déjà couvert en détail par
// analyst_market_test.js — ce fichier-ci vérifie la couche UI : l'onglet
// Staff (section analyste), la fiche équipe adverse ouverte depuis le
// Classement (retour utilisateur, 2026-09 : "il faudrait de vrais pages
// équipes et pas seulement une fenêtre qui s'ouvre en dessous", voir
// showTeamDetail/renderTeamDetail, colonnes verrouillées/révélées), le
// bouton de séance vidéo, et la persistance de bout en bout à travers un
// rechargement complet de la page (nouvelle session JSDOM, comme
// persistence_test.js).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
let dom = await openGame(html, baseUrl);
let doc = dom.window.document;
let win = dom.window;

function clickTab(key) {
  const btn = [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key);
  if (!btn) throw new Error(`❌ Onglet introuvable : ${key}`);
  btn.click();
}

// `league`/`teamA`/`myTeamIndex` sont déclarées via `let` au premier niveau
// du script de moteurbasket3.html : contrairement aux `function` (qui
// deviennent des propriétés de `window`, comme performVideoSession/
// renderScoutingPanel ci-dessous, directement accessibles), un `let`/`const`
// de premier niveau reste une liaison purement lexicale, jamais une
// propriété de `window` — même comportement qu'un vrai navigateur pour un
// script classique. `win.eval(...)` s'exécute dans CE MÊME contexte lexical
// (celui de la page), donc y a bien accès.
function getLeague(w) { return w.eval("league"); }
function getTeamA(w) { return w.eval("teamA"); }
function getMyTeamIndex(w) { return w.eval("myTeamIndex"); }
function getAttrs(w) { return w.eval("ATTRS"); }
const ATTRS = getAttrs(win);
// Regroupement Fondamentaux/Physique/Mental (retour utilisateur, 2026-09 :
// "sur les tableaux récap [...] mental et physique sur 2 colonnes, on fait
// une moyenne") : le tableau de scoutisme n'affiche plus une colonne par
// caractéristique physique/mentale, mais une seule moyenne chacune (voir
// PHYSICAL_ATTRS/MENTAL_ATTRS/FUNDAMENTAL_ATTRS/categoryAverageCellHtml dans
// moteurbasket3.html) — les assertions ci-dessous en tiennent compte.
const FUNDAMENTAL_ATTRS = win.eval("FUNDAMENTAL_ATTRS");
const PHYSICAL_ATTRS = win.eval("PHYSICAL_ATTRS");
const MENTAL_ATTRS = win.eval("MENTAL_ATTRS");
const DENSE_ATTR_COLUMNS = FUNDAMENTAL_ATTRS.length + 2; // + Physique + Mental moyennés

// ---------------------------------------------------------------------
// Partie 1 : onglet Staff — section analyste vidéo, séparée de celle de
// l'entraîneur, avec le message "aucun analyste" par défaut et un marché
// déjà peuplé (refreshAnalystMarket() appelé au chargement/à l'ouverture de
// l'onglet, même rythme que le marché des entraîneurs).
// ---------------------------------------------------------------------
clickTab("staff");
const analystNoneMsg = doc.querySelector("#staffAnalystCurrent .staff-none");
console.log("\nMessage 'aucun analyste' présent :", !!analystNoneMsg);
if (!analystNoneMsg) throw new Error("❌ Sans analyste sous contrat, un message 'aucun analyste' devrait s'afficher dans #staffAnalystCurrent.");
const analystListingRows = doc.querySelectorAll("#staffAnalystHireGrid table.stf-table tbody tr").length;
console.log("Candidats analystes aux enchères :", analystListingRows, "(attendu >= 2, COACH_MARKET_MIN_OPEN_LISTINGS)");
if (analystListingRows < 2) throw new Error("❌ Le marché des analystes devrait être peuplé d'au moins COACH_MARKET_MIN_OPEN_LISTINGS candidats.");
console.log("✅ L'onglet Staff affiche bien une section analyste vidéo séparée, avec marché peuplé.");

// Embauche directe (comme un manager qui vient de gagner une enchère —
// voir engine.js:League._resolveAnalystListing, déjà couvert par
// analyst_market_test.js) : on ne re-teste pas le marché ici, juste son
// branchement dans l'UI Staff.
getLeague(win).teams[getMyTeamIndex(win)].hireVideoAnalyst(3, 5000);
win.renderStaffPanel();
const analystCurrentInfo = doc.querySelector("#staffAnalystCurrent .staff-current-info");
console.log("\nBloc 'analyste en poste' après embauche :", analystCurrentInfo && analystCurrentInfo.textContent);
if (!analystCurrentInfo || !analystCurrentInfo.querySelector('[aria-label="Niveau 3 sur 5"]')) {
  throw new Error("❌ Après embauche, le panneau devrait afficher l'analyste en poste (niveau 3).");
}
// Retour utilisateur (2026-09) : le nombre de caractéristiques révélées par
// séance ("Caractéristiques révélées") ne doit plus être affiché sur
// l'onglet Staff, ici ni sur le marché aux enchères (voir renderAnalystListings).
if (analystCurrentInfo.textContent.includes("révèle")) {
  throw new Error("❌ Le panneau ne devrait plus afficher le nombre de caractéristiques révélées par séance (masqué sur demande utilisateur).");
}
console.log("✅ Le panneau analyste affiche bien le niveau, sans le nombre de caractéristiques révélées par séance (masqué sur demande utilisateur).");

// ---------------------------------------------------------------------
// Partie 2 : écran Classement — noms d'équipes cliquables (liens vers la
// fiche équipe), y compris sa PROPRE ligne (retour utilisateur, 2026-09 :
// "rends cliquable le nom de sa propre équipe [...] dans le classement" -
// avant ce correctif, seules les lignes adverses étaient cliquables).
// ---------------------------------------------------------------------
clickTab("ligue");
const rows = [...doc.querySelectorAll("#standingsContent table.standings-table tbody tr")];
console.log("\nLignes du classement :", rows.length, "(attendu 10)");
if (rows.length !== 10) throw new Error("❌ Le classement devrait lister les 10 équipes.");
const myRow = rows.find(r => r.classList.contains("me"));
if (!myRow) throw new Error("❌ (setup) une ligne devrait porter la classe 'me' (le club du joueur).");
if (!myRow.querySelector("[data-team-idx]")) throw new Error("❌ La ligne du club du joueur devrait, elle aussi, être un lien vers sa fiche équipe.");
const opponentRows = rows.filter(r => r !== myRow);
const allOpponentsLinked = opponentRows.every(r => r.querySelector("[data-team-idx]"));
console.log(`${allOpponentsLinked ? "✅" : "❌"} Toutes les lignes adverses (${opponentRows.length}) ont un nom d'équipe cliquable (data-team-idx).`);
if (!allOpponentsLinked) throw new Error("❌ Tous les noms d'équipe adverses devraient être des liens vers leur fiche équipe.");

// ---------------------------------------------------------------------
// Partie 3 : ouverture de la fiche équipe adverse (retour utilisateur,
// 2026-09 : "de vrais pages équipes et pas seulement une fenêtre qui s'ouvre
// en dessous") : baseline TOUJOURS visible (nom/poste/taille/salaire),
// caractéristiques verrouillées ("🔒") tant qu'aucune séance vidéo n'a eu
// lieu pour CET adversaire, même si un analyste est sous contrat (la
// révélation reste une action délibérée, pas automatique juste parce qu'on a
// un analyste).
// ---------------------------------------------------------------------
const opponentLink = opponentRows[0].querySelector("[data-team-idx]");
const opponentIdx = Number(opponentLink.dataset.teamIdx);
opponentLink.click();
const teamDetailVisible = !doc.getElementById("teamDetailSection").classList.contains("hidden");
console.log("\nFiche équipe ouverte (page dédiée, pas un panneau en dessous) :", teamDetailVisible);
if (!teamDetailVisible) throw new Error("❌ Cliquer sur le nom d'une équipe adverse devrait ouvrir une vraie page (teamDetailSection), pas rester sur le Classement.");
// L'onglet par défaut à l'ouverture est désormais "Aperçu" (retour
// utilisateur : "une petite page d'accueil pour les autres équipes", voir
// showTeamDetail) : le tableau de joueurs, lui, vit sous "Effectif".
doc.querySelector('[data-team-detail-subview="effectif"]').click();
const scoutingPanel = doc.getElementById("teamDetailContent");
const scoutingTable = scoutingPanel.querySelector("table.roster-table");
console.log("Tableau de joueurs présent :", !!scoutingTable);
if (!scoutingTable) throw new Error("❌ La fiche équipe adverse devrait afficher un tableau de joueurs.");

// "← Retour" doit ramener vers le Classement (l'origine mémorisée), pas un
// écran par défaut arbitraire.
doc.getElementById("closeTeamDetailBtn").click();
const backOnStandings = !doc.getElementById("standingsSection").classList.contains("hidden");
console.log("Retour vers le Classement après \"← Retour\" :", backOnStandings);
if (!backOnStandings) throw new Error("❌ \"← Retour\" depuis la fiche équipe devrait ramener vers l'écran d'origine (Classement).");
opponentLink.click(); // rouvre la fiche pour la suite du test
console.log("✅ La fiche équipe adverse s'ouvre comme une vraie page dédiée, et \"← Retour\" ramène bien vers son origine.");
const headerTexts = [...scoutingTable.querySelectorAll("thead th")].map(th => th.textContent);
console.log("Colonnes :", headerTexts);
["Nom", "Poste", "Taille", "Salaire/sem."].forEach(col => {
  if (!headerTexts.includes(col)) throw new Error(`❌ La colonne baseline '${col}' devrait toujours être présente.`);
});
if (headerTexts.length !== 4 + DENSE_ATTR_COLUMNS) {
  throw new Error(`❌ Les colonnes de caractéristiques devraient TOUTES être présentes (verrouillées ou pas) : attendu ${4 + DENSE_ATTR_COLUMNS}, obtenu ${headerTexts.length}.`);
}
const firstRowCells = scoutingTable.querySelector("tbody tr");
if (!firstRowCells || !firstRowCells.cells[0].textContent.trim()) throw new Error("❌ Le nom du joueur adverse devrait toujours être visible.");
const lockedCells = scoutingTable.querySelectorAll(".attr-locked").length;
console.log("Cellules verrouillées (🔒) :", lockedCells, "(attendu : tous les joueurs × toutes les colonnes denses, aucune séance encore faite)");
const opponentRosterSize = getLeague(win).teams[opponentIdx].players.length;
if (lockedCells !== opponentRosterSize * DENSE_ATTR_COLUMNS) {
  throw new Error(`❌ Sans séance vidéo, TOUTES les cellules de caractéristiques devraient être verrouillées : attendu ${opponentRosterSize * DENSE_ATTR_COLUMNS}, obtenu ${lockedCells}.`);
}
console.log("✅ Le panneau de scoutisme affiche toujours nom/poste/taille/salaire, et verrouille (au lieu d'omettre) les caractéristiques non révélées.");

// Retour utilisateur (2026-09) : "il faudrait ajouter des boutons sur la
// page d'une équipe (effectif [...] analyse de l'équipe)" — le bouton de
// séance vidéo vit désormais sous le sous-onglet "Analyse d'équipe" de la
// fiche équipe (voir teamDetailAnalyseHtml), plus sous "Effectif" (par
// défaut à l'ouverture, voir showTeamDetail).
doc.querySelector('[data-team-detail-subview="analyse"]').click();
const sessionBtn = doc.getElementById("runVideoSessionBtn");
console.log("\nBouton 'Faire une séance vidéo' présent et actif :", !!sessionBtn && !sessionBtn.disabled);
if (!sessionBtn || sessionBtn.disabled) throw new Error("❌ Avec un analyste sous contrat et aucune séance utilisée aujourd'hui, le bouton devrait être actif.");
console.log("✅ Le bouton de séance vidéo est actif quand un analyste est sous contrat et qu'aucune séance n'a encore été utilisée aujourd'hui.");

// ---------------------------------------------------------------------
// Partie 4 : exécution d'une séance vidéo (appel direct de
// performVideoSession — même fonction que le clic sur le bouton, voir
// moteurbasket3.html — pour un test déterministe sans dépendre du timing
// d'un event listener asynchrone).
// ---------------------------------------------------------------------
const sessionResult = await win.performVideoSession(opponentIdx);
console.log("\nRésultat de la séance vidéo :", sessionResult);
if (!sessionResult.ok) throw new Error(`❌ La séance vidéo devrait réussir : ${JSON.stringify(sessionResult)}`);
// Niveau 3 -> 3 (voir ANALYST_REVEAL_COUNT_BY_LEVEL, mapping 1:1, retour
// utilisateur : jamais 10/10 même au meilleur niveau — au niveau 3, 3/10
// seulement).
if (sessionResult.revealed.length !== 3) throw new Error(`❌ Niveau 3 devrait révéler 3 caractéristiques, obtenu ${sessionResult.revealed.length}.`);
// Les cellules verrouillées vivent sous le sous-onglet "Effectif" (voir
// teamDetailEffectifHtml), pas "Analyse" où on se trouve depuis le clic
// plus haut : bascule explicitement dessus avant de les compter.
win.eval("teamDetailSubView = 'effectif';");
win.renderTeamDetail(opponentIdx);
const lockedAfter = doc.getElementById("teamDetailContent").querySelectorAll(".attr-locked").length;
// Colonnes denses désormais (13 Fondamentaux détaillés + moyennes
// Physique/Mental, voir DENSE_ATTR_COLUMNS plus haut) : une caractéristique
// Fondamentale révélée déverrouille sa PROPRE colonne, mais une seule
// caractéristique Physique (ou Mentale) révélée déverrouille TOUTE la
// moyenne de sa catégorie (categoryAverageCellHtml calcule la moyenne sur
// les seules caractéristiques déjà révélées dès qu'il y en a au moins une,
// voir son commentaire dans moteurbasket3.html) — donc le nombre de cellules
// déverrouillées dépend de la répartition des 3 caractéristiques tirées au
// sort entre les 3 catégories, pas d'un simple "-3".
const revealed = sessionResult.revealed;
const lockedFundamentalsPerPlayer = FUNDAMENTAL_ATTRS.filter(a => !revealed.includes(a)).length;
const physicalLockedPerPlayer = PHYSICAL_ATTRS.some(a => revealed.includes(a)) ? 0 : 1;
const mentalLockedPerPlayer = MENTAL_ATTRS.some(a => revealed.includes(a)) ? 0 : 1;
const lockedPerPlayer = lockedFundamentalsPerPlayer + physicalLockedPerPlayer + mentalLockedPerPlayer;
console.log("Cellules verrouillées après la séance :", lockedAfter, `(attendu : ${lockedPerPlayer} × ${opponentRosterSize} joueurs, révélé cette séance : ${revealed.join(", ")})`);
if (lockedAfter !== opponentRosterSize * lockedPerPlayer) {
  throw new Error(`❌ Après la séance, ${lockedPerPlayer} colonnes par joueur devraient rester verrouillées (13 Fondamentaux + Physique + Mental, moins celles touchées par les 3 caractéristiques révélées), obtenu ${lockedAfter} cellules verrouillées restantes (attendu ${opponentRosterSize * lockedPerPlayer}).`);
}
console.log("✅ Une séance vidéo réussie révèle bien le bon nombre de caractéristiques dans le panneau (niveau 3 -> 3/10), reflété dans les colonnes Fondamentaux/Physique/Mental.");

// Adversaire déjà scouté (retour utilisateur, 2026-09 : un même adversaire
// n'est scoutable qu'UNE FOIS PAR SAISON, pas un cooldown quotidien) :
// rouvrir le panneau sur CE MÊME adversaire doit afficher le bouton
// désactivé avec une raison PERMANENTE ("déjà scoutée cette saison"),
// clairement distincte du message de cooldown quotidien ci-dessous.
// Le bouton/message de scoutisme vit sous "Analyse d'équipe" (voir plus
// haut) : rebascule dessus avant de le relire.
win.eval("teamDetailSubView = 'analyse';");
win.renderTeamDetail(opponentIdx);
const sessionBtnAfter = doc.getElementById("runVideoSessionBtn");
console.log("\nBouton de séance vidéo après scoutage de cet adversaire :", sessionBtnAfter);
if (sessionBtnAfter) throw new Error("❌ Après avoir scouté cet adversaire, le bouton actif ne devrait plus être présent (remplacé par un message désactivé).");
const scoutingActionsText = doc.querySelector("#teamDetailContent .scouting-actions").textContent;
console.log("Message affiché (adversaire déjà scouté) :", scoutingActionsText);
if (!scoutingActionsText.includes("scoutée")) throw new Error("❌ Le panneau devrait expliquer que CET adversaire a déjà été scouté cette saison (raison permanente).");
if (scoutingActionsText.includes("déjà utilisée aujourd'hui") || scoutingActionsText.includes("revenez demain")) {
  throw new Error("❌ Le message pour un adversaire déjà scouté ne doit PAS être le message de cooldown quotidien ('revenez demain') — ce sont deux raisons distinctes.");
}
console.log("✅ Un adversaire déjà scouté désactive bien le bouton avec une raison PERMANENTE, distincte du cooldown quotidien.");

// Un second appel direct à performVideoSession sur ce MÊME adversaire (même
// en contournant l'UI) doit aussi être refusé par le moteur, avec la raison
// "already-scouted" — pas seulement par le bouton désactivé côté affichage.
const sameOpponentAgain = await win.performVideoSession(opponentIdx);
if (sameOpponentAgain.ok) throw new Error("❌ Rescouter le même adversaire cette saison devrait être refusé par League.runVideoSession lui-même, pas seulement par l'UI.");
console.log("✅ Le moteur refuse lui-même une 2e séance sur le même adversaire, indépendamment de l'état du bouton.");

// Adversaire DIFFÉRENT, pas encore scouté, même jour civil : refusé par le
// cooldown quotidien (limiteur de rythme, inchangé — un seul NOUVEL
// adversaire scouté par jour).
const otherOpponentIdx = opponentIdx === 1 ? 2 : 1;
const cooldownSession = await win.performVideoSession(otherOpponentIdx);
if (cooldownSession.ok) throw new Error("❌ Une séance sur un NOUVEL adversaire le même jour devrait être refusée par le cooldown quotidien.");
console.log("✅ Le cooldown quotidien refuse bien une séance sur un adversaire différent, non encore scouté, le même jour civil.");

// ---------------------------------------------------------------------
// Partie 5 : persistance — videoAnalyst/scoutedAttrs/lastVideoSessionAt
// survivent à un rechargement complet de la page (nouvelle session JSDOM,
// même serveur).
// ---------------------------------------------------------------------
await flush(dom);
const saved = readRawSave(savePath);
console.log("\nSauvegarde brute — videoAnalyst :", saved.team.videoAnalyst, "| scoutedAttrs :", saved.team.scoutedAttrs);
if (!saved.team.videoAnalyst || saved.team.videoAnalyst.level !== 3) throw new Error("❌ videoAnalyst devrait être persisté dans la sauvegarde brute.");
if (!saved.team.scoutedAttrs || !saved.team.scoutedAttrs[String(opponentIdx)] || saved.team.scoutedAttrs[String(opponentIdx)].length !== 3) {
  throw new Error("❌ scoutedAttrs devrait être persisté dans la sauvegarde brute, avec les 3 caractéristiques révélées.");
}
if (typeof saved.team.lastVideoSessionAt !== "number") throw new Error("❌ lastVideoSessionAt devrait être persisté (nombre) dans la sauvegarde brute.");

win.close();
const dom2 = await openGame(html, baseUrl);
const win2 = dom2.window;
console.log("Après rechargement complet — videoAnalyst :", getTeamA(win2).videoAnalyst, "| scoutedAttrs :", getTeamA(win2).scoutedAttrs);
if (!getTeamA(win2).videoAnalyst || getTeamA(win2).videoAnalyst.level !== 3) throw new Error("❌ videoAnalyst devrait survivre à un rechargement complet de la page.");
if (!getTeamA(win2).scoutedAttrs[String(opponentIdx)] || getTeamA(win2).scoutedAttrs[String(opponentIdx)].length !== 3) {
  throw new Error("❌ scoutedAttrs devrait survivre à un rechargement complet de la page.");
}
console.log("✅ videoAnalyst, scoutedAttrs et lastVideoSessionAt survivent tous à un rechargement complet de la page (nouvelle session).");

win2.close();
server.close();
console.log("\n🏁 Tous les tests client (scoutisme + analyste vidéo) sont passés.");

})().catch(e => {
  console.error("❌ Échec :", e);
  process.exit(1);
});
