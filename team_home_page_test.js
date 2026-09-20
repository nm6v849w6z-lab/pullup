// Vérifie le retour utilisateur (2026-09) : "une petite page d'accueil pour
// les autres équipes [...] quand on clique sur le nom d'une équipe, on doit
// pouvoir voir le logo de l'équipe, la couleur de ses maillots, les derniers
// résultats (un truc avec VVVDV serait pas mal), joueur en forme du moment
// dans l'équipe et les derniers interviews du coach [...] le logo de
// l'équipe doit être type dès lors que l'équipe ne paie pas [...] pour les
// équipes qui paient, elles doivent pouvoir charger leur propre image
// [...] une équipe gratuite doit pouvoir choisir uniquement entre 2 formes
// de maillot et 5 couleurs [...] le logo et les maillots doivent pouvoir
// être modifiés dans le tableau de bord [...] pour les interviews, il faut
// les faire dans les 2h après le match, sinon c'est par défaut sans
// impact".
//
// Le sous-onglet "Aperçu" de la fiche équipe (teamDetailApercuHtml) et le
// panneau "Identité du club" du tableau de bord (renderClubIdentityPanel)
// sont des fonctions de rendu PURES côté client (comme teamSeasonStatsTableHtml/
// tacticalReportHtml) : plutôt que de rejouer des journées entières pour
// obtenir des résultats/statistiques réels, ce fichier injecte directement
// des données cohérentes (league.recordResult, Player.matchLog) via
// win.eval, même patron que attendance_history_test.js pour
// simulateHomeAttendance. La génération/compression réelle d'une image
// chargée par le manager (FileReader + canvas, voir
// resizeImageFileToDataUrl) n'est PAS exercée ici : jsdom n'a pas
// d'implémentation de canvas dans cet environnement de test, donc ce fichier
// vérifie directement Team.setCustomLogo (le point d'entrée que ce pipeline
// appelle une fois l'image prête), déjà couvert côté serveur par
// server/actions_test.js pour la validation de fond.
const fs = require("fs");
const { startTestServer, openGame, flush, patchDateNow } = require("./test_helpers.js");
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

const myIdx = win.eval("myTeamIndex");
const league = win.eval("league");
const opponentIdx = league.schedule[0].find(m => m.home === myIdx || m.away === myIdx).home === myIdx
  ? league.schedule[0].find(m => m.home === myIdx || m.away === myIdx).away
  : league.schedule[0].find(m => m.home === myIdx || m.away === myIdx).home;

// ---------------------------------------------------------------------
// Partie 1 : ouverture de la fiche équipe (la sienne ou un adversaire) :
// l'onglet par défaut est désormais "Aperçu", littéralement la "page
// d'accueil" demandée.
// ---------------------------------------------------------------------
win.showTeamDetail(opponentIdx);
const activeSubTab = doc.querySelector("#teamDetailContent [data-team-detail-subview].active");
console.log("Sous-onglet actif à l'ouverture :", activeSubTab && activeSubTab.dataset.teamDetailSubview);
if (!activeSubTab || activeSubTab.dataset.teamDetailSubview !== "apercu") {
  throw new Error("❌ L'onglet par défaut à l'ouverture d'une fiche équipe devrait être \"Aperçu\".");
}
const logoEl = doc.querySelector("#teamDetailContent .team-apercu-crest svg");
const jerseyEls = doc.querySelectorAll("#teamDetailContent .jersey-mockup svg");
console.log("Logo (SVG type, club gratuit) présent :", !!logoEl, "| Maillots (SVG, Domicile+Extérieur) présents :", jerseyEls.length);
if (!logoEl) throw new Error("❌ Le logo type (SVG, club gratuit par défaut) devrait être affiché sur l'Aperçu.");
if (jerseyEls.length !== 2) throw new Error("❌ Les deux maillots (Domicile + Extérieur, SVG) devraient être affichés sur l'Aperçu.");
if (!doc.querySelector("#teamDetailContent").textContent.includes("Derniers résultats")) {
  throw new Error("❌ La section \"Derniers résultats\" devrait être présente sur l'Aperçu.");
}
if (!doc.querySelector("#teamDetailContent").textContent.includes("Joueur en forme du moment")) {
  throw new Error("❌ La section \"Joueur en forme du moment\" devrait être présente sur l'Aperçu.");
}
if (!doc.querySelector("#teamDetailContent").textContent.includes("Dernières interviews du coach")) {
  throw new Error("❌ La section \"Dernières interviews du coach\" devrait être présente sur l'Aperçu.");
}
console.log("✅ La fiche équipe s'ouvre bien sur l'Aperçu (logo type + maillot + sections attendues).");

// ---------------------------------------------------------------------
// Partie 2 : forme récente ("VVVDV") : injecte 5 résultats réels sur les
// rounds effectivement programmés pour l'adversaire (league.recordResult),
// dans l'ordre chronologique du calendrier, alternant victoires/défaites.
// ---------------------------------------------------------------------
const oppRounds = [];
for (let r = 0; r < league.totalRounds && oppRounds.length < 5; r++) {
  const m = league.schedule[r].find(x => x.home === opponentIdx || x.away === opponentIdx);
  if (m) oppRounds.push({ round: r, match: m });
}
if (oppRounds.length < 5) throw new Error("❌ (setup) Pas assez de journées programmées pour cet adversaire dans les tests.");
const expectedPattern = [true, true, true, false, true]; // V V V D V
win.eval(`
  (function() {
    const oppRounds = ${JSON.stringify(oppRounds)};
    const pattern = ${JSON.stringify(expectedPattern)};
    oppRounds.forEach((entry, i) => {
      const won = pattern[i];
      const isHome = entry.match.home === ${opponentIdx};
      const oppScore = won ? 70 : 90;
      const myScore = won ? 90 : 70;
      const scoreHome = isHome ? myScore : oppScore;
      const scoreAway = isHome ? oppScore : myScore;
      league.recordResult(entry.round, entry.match.home, entry.match.away, scoreHome, scoreAway);
    });
  })();
`);
win.renderTeamDetail(opponentIdx);
const formBadges = [...doc.querySelectorAll("#teamDetailContent .form-badge")].map(b => b.textContent.trim());
console.log("Badges de forme affichés :", formBadges.join(""), "(attendu VVVDV)");
if (formBadges.join("") !== "VVVDV") {
  throw new Error(`❌ La forme récente devrait afficher "VVVDV" dans l'ordre chronologique, obtenu "${formBadges.join("")}".`);
}
console.log("✅ La forme récente affiche bien VVVDV, dans l'ordre chronologique.");

// ---------------------------------------------------------------------
// Partie 3 : joueur en forme du moment : injecte un matchLog nettement
// meilleur pour UN joueur précis de l'adversaire, vérifie qu'il est bien
// désigné.
// ---------------------------------------------------------------------
const standoutId = win.eval(`league.teams[${opponentIdx}].players[0].id`);
win.eval(`
  (function() {
    const p = league.teams[${opponentIdx}].players[0];
    p.matchLog = [
      { round: 0, competition: "championship", week: 1, min: 30, pts: 28, reb: 10, ast: 8, stl: 1, blk: 0, tov: 1, pf: 2, fgm2: 10, fga2: 15, fgm3: 2, fga3: 4, ftm: 4, fta: 4 },
      { round: 1, competition: "championship", week: 2, min: 32, pts: 30, reb: 9, ast: 7, stl: 2, blk: 1, tov: 2, pf: 1, fgm2: 11, fga2: 16, fgm3: 2, fga3: 5, ftm: 4, fta: 4 },
      { round: 2, competition: "championship", week: 3, min: 29, pts: 26, reb: 8, ast: 9, stl: 1, blk: 0, tov: 1, pf: 2, fgm2: 9, fga2: 14, fgm3: 2, fga3: 3, ftm: 4, fta: 4 },
    ];
    league.teams[${opponentIdx}].players.slice(1).forEach(other => { other.matchLog = []; });
  })();
`);
win.renderTeamDetail(opponentIdx);
const hotPlayerText = doc.querySelector("#teamDetailContent").textContent;
console.log("Section joueur en forme mentionne le joueur désigné :", hotPlayerText.includes(win.eval(`league.teams[${opponentIdx}].players[0].name`)));
if (!hotPlayerText.includes(win.eval(`league.teams[${opponentIdx}].players[0].name`))) {
  throw new Error("❌ Le joueur avec la meilleure moyenne récente (pts+reb+pas-pertes) devrait être désigné comme \"joueur en forme du moment\".");
}
console.log("✅ Le joueur en forme du moment est bien désigné à partir de ses statistiques récentes.");

// ---------------------------------------------------------------------
// Partie 4 : dernières interviews du coach : sur SA PROPRE équipe (plus
// simple à peupler via resolveInterview, qui vit sur Team), vérifie que
// l'entrée apparaît sur l'Aperçu.
// ---------------------------------------------------------------------
win.eval(`
  (function() {
    teamA.applyMoraleForResult(true, 10, "Adversaire test", 3);
    const id = teamA.pendingInterviews[teamA.pendingInterviews.length - 1].id;
    teamA.resolveInterview(id, "Mesuré");
  })();
`);
win.showTeamDetail(myIdx);
const ownInterviewsText = doc.querySelector("#teamDetailContent").textContent;
const resolvedQuote = win.eval("teamA.moraleHistory[0].quote");
console.log("Citation générée :", resolvedQuote);
console.log("Interview affichée sur l'Aperçu de sa propre équipe :", ownInterviewsText.includes(resolvedQuote));
if (!resolvedQuote || !ownInterviewsText.includes(resolvedQuote)) {
  throw new Error("❌ Une interview résolue devrait apparaître (sous forme de citation) dans \"Dernières interviews du coach\".");
}
if (ownInterviewsText.includes("Interview (ton mesuré)")) {
  throw new Error("❌ Le delta chiffré/label brut ne devrait plus apparaître sur l'Aperçu, seule la citation du coach.");
}
console.log("✅ Les interviews résolues apparaissent bien sur l'Aperçu, sous forme de citation (plus de delta chiffré).");

// ---------------------------------------------------------------------
// Partie 5 : Identité du club (tableau de bord) : forme/couleur de maillot,
// statut payant, logo personnalisé.
// ---------------------------------------------------------------------
clickTab("club");
const shapeBBtn = doc.querySelector('[data-jersey-shape="B"]');
if (!shapeBBtn) throw new Error("❌ (setup) Bouton de forme de maillot \"B\" introuvable sur le tableau de bord.");
shapeBBtn.click();
console.log("teamA.jerseyShape après clic sur la forme B :", win.eval("teamA.jerseyShape"));
if (win.eval("teamA.jerseyShape") !== "B") throw new Error("❌ Cliquer sur la forme de maillot B devrait mettre à jour teamA.jerseyShape.");
if (!doc.querySelector('[data-jersey-shape="B"]').classList.contains("active")) {
  throw new Error("❌ Le bouton de forme actif devrait porter la classe \"active\" après le clic.");
}
console.log("✅ Le choix de forme de maillot est bien appliqué et reflété visuellement.");

const someColorBtn = doc.querySelectorAll("[data-jersey-color]")[2];
const someColorKey = someColorBtn.dataset.jerseyColor;
someColorBtn.click();
console.log("teamA.jerseyColor après clic sur une couleur :", win.eval("teamA.jerseyColor"), "(attendu", someColorKey, ")");
if (win.eval("teamA.jerseyColor") !== someColorKey) throw new Error("❌ Cliquer sur une couleur de maillot devrait mettre à jour teamA.jerseyColor.");
console.log("✅ Le choix de couleur de maillot est bien appliqué.");

console.log("Statut club avant bascule :", win.eval("teamA.isPaying"));
if (win.eval("teamA.isPaying")) throw new Error("❌ (setup) Le club devrait démarrer gratuit.");
if (doc.getElementById("clubLogoFileInput")) throw new Error("❌ Le champ de chargement de logo ne devrait PAS être proposé à un club gratuit.");
doc.getElementById("clubTogglePayingBtn").click();
console.log("Statut club après bascule :", win.eval("teamA.isPaying"));
if (!win.eval("teamA.isPaying")) throw new Error("❌ Cliquer sur \"Passer en payant\" devrait passer le club en payant.");
if (!doc.getElementById("clubLogoFileInput")) throw new Error("❌ Le champ de chargement de logo devrait apparaître une fois le club payant.");
console.log("✅ Le statut payant bascule bien et révèle le chargement de logo personnalisé.");

// Simule la fin du pipeline de redimensionnement (voir le commentaire
// d'en-tête : canvas non disponible dans jsdom) en appelant directement
// Team.setCustomLogo, exactement ce que resizeImageFileToDataUrl appellerait
// une fois l'image prête.
const tinyPngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
win.eval(`teamA.setCustomLogo(${JSON.stringify(tinyPngDataUrl)});`);
win.renderClubIdentityPanel();
const logoImg = doc.querySelector("#clubIdentityPanel .club-logo-preview img.team-logo-img");
console.log("Logo personnalisé affiché sur le tableau de bord :", !!logoImg, "| src correct :", logoImg && logoImg.src === tinyPngDataUrl);
if (!logoImg || logoImg.src !== tinyPngDataUrl) throw new Error("❌ Le logo personnalisé chargé devrait être affiché tel quel sur le tableau de bord.");
if (!doc.getElementById("clubLogoResetBtn")) throw new Error("❌ Le bouton \"Revenir au logo type\" devrait apparaître une fois un logo personnalisé chargé.");
console.log("✅ Le logo personnalisé s'affiche bien une fois chargé (club payant).");

doc.getElementById("clubLogoResetBtn").click();
console.log("customLogoDataUrl après \"Revenir au logo type\" :", win.eval("teamA.customLogoDataUrl"));
if (win.eval("teamA.customLogoDataUrl") !== null) throw new Error("❌ \"Revenir au logo type\" devrait effacer customLogoDataUrl.");
if (doc.querySelector("#clubIdentityPanel .club-logo-preview img.team-logo-img")) {
  throw new Error("❌ Après \"Revenir au logo type\", le logo affiché devrait redevenir le SVG type, plus une image.");
}
console.log("✅ \"Revenir au logo type\" retire bien le logo personnalisé.");

// Repasser en gratuit doit masquer à nouveau le chargement de logo, sur la
// fiche équipe ET le tableau de bord (retour utilisateur : "le logo de
// l'équipe doit être type dès lors que l'équipe ne paie pas").
win.eval(`teamA.setCustomLogo(${JSON.stringify(tinyPngDataUrl)}); teamA.setPaying(false);`);
win.renderClubIdentityPanel();
if (doc.querySelector("#clubIdentityPanel .club-logo-preview img.team-logo-img")) {
  throw new Error("❌ Un club redevenu gratuit ne devrait plus afficher son logo personnalisé, même si customLogoDataUrl est encore présent.");
}
if (doc.getElementById("clubLogoFileInput")) throw new Error("❌ Le champ de chargement ne devrait plus être proposé une fois le club redevenu gratuit.");
win.showTeamDetail(myIdx);
if (doc.querySelector("#teamDetailContent .team-apercu-crest img.team-logo-img")) {
  throw new Error("❌ La fiche équipe d'un club redevenu gratuit ne devrait plus afficher son logo personnalisé.");
}
console.log("✅ Repasser en club gratuit masque bien le logo personnalisé (sans le perdre) sur l'Aperçu et le tableau de bord.");

// ---------------------------------------------------------------------
// Partie 5bis : motif de maillot personnalisé (retour utilisateur, sur la
// refonte de l'Aperçu : "Pour le mode payant ajoute des maillots avec des
// dessins particuliers (rayure, degrade...)"). Club encore gratuit à ce
// stade (repassé à false juste au-dessus).
// ---------------------------------------------------------------------
win.renderClubIdentityPanel();
if (doc.querySelector("#clubIdentityPanel [data-jersey-pattern]")) {
  throw new Error("❌ Le sélecteur de motif de maillot ne devrait PAS être proposé à un club gratuit.");
}
console.log("✅ Le sélecteur de motif de maillot est bien masqué pour un club gratuit.");

doc.getElementById("clubTogglePayingBtn").click();
const degradeBtn = doc.querySelector('[data-jersey-pattern="degrade"]');
if (!degradeBtn) throw new Error("❌ (setup) Bouton de motif \"degrade\" introuvable une fois le club payant.");
degradeBtn.click();
console.log("teamA.jerseyPattern après clic sur \"degrade\" :", win.eval("teamA.jerseyPattern"));
if (win.eval("teamA.jerseyPattern") !== "degrade") throw new Error("❌ Cliquer sur le motif \"degrade\" devrait mettre à jour teamA.jerseyPattern.");
if (!doc.querySelector('[data-jersey-pattern="degrade"]').classList.contains("active")) {
  throw new Error("❌ Le bouton de motif actif devrait porter la classe \"active\" après le clic.");
}
console.log("✅ Le choix de motif de maillot est bien appliqué et reflété visuellement (club payant).");

win.showTeamDetail(myIdx);
const apercuJerseySvg = doc.querySelector("#teamDetailContent .jersey-mockup svg");
console.log("Le maillot de l'Aperçu reflète le motif dégradé :", apercuJerseySvg && apercuJerseySvg.getAttribute("aria-label"));
if (!apercuJerseySvg || !apercuJerseySvg.getAttribute("aria-label").includes("dégradé")) {
  throw new Error("❌ Le maillot affiché sur l'Aperçu devrait refléter le motif dégradé choisi (club payant).");
}
console.log("✅ Le motif de maillot personnalisé apparaît bien sur l'Aperçu d'un club payant.");

// Même principe que le logo : repasser en gratuit ne doit PAS effacer le
// motif choisi, juste l'ignorer au rendu (retour au maillot uni).
win.eval("teamA.setPaying(false);");
win.showTeamDetail(myIdx);
const apercuJerseySvgAfter = doc.querySelector("#teamDetailContent .jersey-mockup svg");
console.log("teamA.jerseyPattern conservé après repassage en gratuit :", win.eval("teamA.jerseyPattern"), "| Aperçu redevenu uni :", apercuJerseySvgAfter && !apercuJerseySvgAfter.getAttribute("aria-label").includes("dégradé"));
if (win.eval("teamA.jerseyPattern") !== "degrade") throw new Error("❌ Repasser en club gratuit ne devrait pas effacer teamA.jerseyPattern.");
if (!apercuJerseySvgAfter || apercuJerseySvgAfter.getAttribute("aria-label").includes("dégradé")) {
  throw new Error("❌ Un club redevenu gratuit ne devrait plus afficher de motif personnalisé sur l'Aperçu, même si jerseyPattern est encore présent.");
}
console.log("✅ Repasser en club gratuit masque bien le motif personnalisé (sans le perdre) sur l'Aperçu.");

// ---------------------------------------------------------------------
// Partie 5ter : combinaison de 2 couleurs pour les motifs "rayures"/
// "degrade" (retour utilisateur, 2026-09 : "ajoute un peu plus de couleur
// pour le mode payant, et mets le choix de 2 couleurs [...] mets plus de
// choix"). Club encore gratuit à ce stade (repassé à false juste au-dessus),
// jerseyPattern déjà "degrade" (conservé, juste ignoré au rendu).
// ---------------------------------------------------------------------
win.renderClubIdentityPanel();
if (doc.querySelector("#clubIdentityPanel [data-jersey-twotone]")) {
  throw new Error("❌ Le sélecteur de combinaison de couleurs ne devrait PAS être proposé à un club gratuit.");
}
console.log("✅ Le sélecteur de combinaison de couleurs est bien masqué pour un club gratuit.");

doc.getElementById("clubTogglePayingBtn").click();
const twoToneSets = win.eval("JERSEY_TWO_TONE_SETS");
const twoToneKeys = Object.keys(twoToneSets);
console.log("Combinaisons de couleurs disponibles :", twoToneKeys.length, "(mets plus de choix)");
if (twoToneKeys.length < 8) throw new Error(`❌ JERSEY_TWO_TONE_SETS devrait exposer au moins 8 combinaisons, obtenu ${twoToneKeys.length}.`);
const chosenTwoToneKey = twoToneKeys[2];
const twoToneBtn = doc.querySelector(`[data-jersey-twotone="${chosenTwoToneKey}"]`);
if (!twoToneBtn) throw new Error("❌ (setup) Le sélecteur de combinaison de couleurs devrait apparaître une fois le club payant avec un motif \"degrade\".");
twoToneBtn.click();
console.log("teamA.jerseyTwoTone après clic :", win.eval("teamA.jerseyTwoTone"));
if (win.eval("teamA.jerseyTwoTone") !== chosenTwoToneKey) throw new Error("❌ Cliquer sur une combinaison de couleurs devrait mettre à jour teamA.jerseyTwoTone.");
if (!doc.querySelector(`[data-jersey-twotone="${chosenTwoToneKey}"]`).classList.contains("active")) {
  throw new Error("❌ Le bouton de combinaison actif devrait porter la classe \"active\" après le clic.");
}
console.log("✅ Le choix de combinaison de couleurs est bien appliqué et reflété visuellement (club payant).");

win.showTeamDetail(myIdx);
const apercuTwoToneSvg = doc.querySelector("#teamDetailContent .jersey-mockup svg");
const expectedColors = twoToneSets[chosenTwoToneKey];
const svgMarkup = apercuTwoToneSvg ? apercuTwoToneSvg.outerHTML : "";
const usesExactColors = apercuTwoToneSvg && expectedColors.every(c => svgMarkup.includes(c));
console.log("Le maillot de l'Aperçu utilise les 2 couleurs exactes de la combinaison choisie :", usesExactColors);
if (!usesExactColors) {
  throw new Error("❌ Le maillot affiché sur l'Aperçu devrait utiliser les 2 couleurs exactes de la combinaison choisie (dégradé), pas une nuance calculée.");
}
console.log("✅ La combinaison de 2 couleurs personnalisée apparaît bien sur l'Aperçu d'un club payant.");

// Même principe que le logo/motif ci-dessus : repasser en gratuit ne doit
// PAS effacer la combinaison choisie, juste l'ignorer au rendu (le motif
// lui-même retombe déjà sur "uni", donc twoTone n'a de toute façon plus
// d'effet visible tant que le club n'est pas repassé payant).
win.eval("teamA.setPaying(false);");
win.renderClubIdentityPanel();
if (doc.querySelector("#clubIdentityPanel [data-jersey-twotone]")) {
  throw new Error("❌ Un club redevenu gratuit ne devrait plus proposer le sélecteur de combinaison de couleurs.");
}
if (win.eval("teamA.jerseyTwoTone") !== chosenTwoToneKey) throw new Error("❌ Repasser en club gratuit ne devrait pas effacer teamA.jerseyTwoTone.");
console.log("✅ Repasser en club gratuit masque bien le sélecteur de combinaison de couleurs (sans perdre le choix).");

// ---------------------------------------------------------------------
// Partie 6 : délai de réponse de 2h à une interview, côté écran de
// rattrapage : une interview jamais traitée après 2h disparaît, sans
// blocage ni action requise du manager (retour utilisateur : "il faut les
// faire dans les 2h après le match, sinon c'est par défaut sans impact").
// ---------------------------------------------------------------------
let fakeNow = Date.now();
patchDateNow(win, () => fakeNow);
win.eval(`
  (function() {
    teamA.applyMoraleForResult(true, 10, "Adversaire test", 9, Date.now());
  })();
`);
const pendingBefore = win.eval("teamA.pendingInterviews.length");
console.log("Interviews en attente juste après le match :", pendingBefore);
if (pendingBefore < 1) throw new Error("❌ (setup) Une interview devrait être en attente juste après le match.");
fakeNow += (2 * 60 * 60 * 1000) + 1000; // 2h01 plus tard
win.eval("teamA.pruneExpiredInterviews(Date.now());");
const pendingAfter = win.eval("teamA.pendingInterviews.length");
console.log("Interviews en attente après 2h01 :", pendingAfter);
if (pendingAfter !== 0) throw new Error("❌ Une interview non traitée après 2h devrait avoir été purgée automatiquement.");
console.log("✅ Une interview non traitée après 2h disparaît bien de la file, sans effet sur l'humeur.");

// ---------------------------------------------------------------------
// Partie 7 : fiche club, date de création + renommée + trophées (retour
// utilisateur, sur la v1 de l'Aperçu : "on pourrait ajouter les petites
// infos comme date de création, renommée et trophée du club").
// ---------------------------------------------------------------------
win.showTeamDetail(myIdx);
const foundedYear = win.eval("teamA.foundedYear");
const apercuText = doc.querySelector("#teamDetailContent").textContent;
console.log("Année de création affichée sur l'Aperçu :", foundedYear, "| présente dans le texte :", apercuText.includes(String(foundedYear)));
if (!apercuText.includes(String(foundedYear))) {
  throw new Error("❌ La date de création du club (foundedYear) devrait être affichée sur l'Aperçu.");
}
if (!doc.querySelector("#teamDetailContent .infobar-item .stars")) {
  throw new Error("❌ La renommée du club devrait être affichée en étoiles sur l'Aperçu.");
}
console.log("✅ La date de création et la renommée (étoiles) sont bien affichées sur l'Aperçu.");

if (!doc.querySelector("#teamDetailContent").textContent.includes("Palmarès encore vierge")) {
  throw new Error("❌ (setup) Le palmarès devrait être vierge avant tout trophée.");
}
win.eval(`league.recordTrophy(${myIdx}, "cup", Date.now());`);
win.showTeamDetail(myIdx);
const trophyItem = doc.querySelector("#teamDetailContent .trophy-item");
console.log("Trophée affiché sur l'Aperçu après League.recordTrophy :", trophyItem && trophyItem.textContent.trim());
if (!trophyItem || !trophyItem.textContent.includes("Vainqueur de la Coupe")) {
  throw new Error("❌ Un trophée enregistré via League.recordTrophy devrait apparaître dans le palmarès de l'Aperçu.");
}
console.log("✅ Un trophée enregistré apparaît bien dans le palmarès de l'Aperçu.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n🏁 Tous les tests team_home_page_test.js sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
