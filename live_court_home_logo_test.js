// Vérifie le logo de l'équipe qui REÇOIT au milieu du terrain, pendant la
// diffusion en direct (retour utilisateur, 2026-09 : "maintenant qu'on a des
// logos (meme pour les joueurs non payant) ce serait pas mal si le logo
// apparaissait au milieu du terrain [...] logo de l'équipe qui recoit
// forcement") — voir #liveCourtHomeLogo, liveCourtHomeLogoSvg() et son
// câblage dans enterLiveMatch (juste après resetCourtView) dans
// moteurbasket3.html. teamLogoHtml() existant (utilisé ailleurs — tableau
// de bord, fiche club) ne convenait pas telle quelle DANS le <svg> du
// terrain (un <img> HTML n'est pas un enfant direct valide d'un <svg>) :
// liveCourtHomeLogoSvg() en est la variante SVG-native, couvrant les deux
// cas déjà gérés par teamLogoHtml (logo type généré pour un club gratuit —
// "même pour les joueurs non payant" — et logo personnalisé pour un club
// payant).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, writeRawSave, patchDateNow } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const clock = { now: Date.now() };
const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
let dom = await openGame(html, baseUrl);
patchDateNow(dom.window, () => clock.now);
await flush(dom);

const saved = readRawSave(savePath);
const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);
// Mode mono-manager (voir server/index.js) : l'équipe du joueur est
// toujours l'index 0 dans league.teams.
const myTeamIndex = 0;
await dom.window.close();

// ---------------------------------------------------------------------
// 1) Cas "club gratuit" : le logo au centre du terrain doit être le logo
//    TYPE généré (basketball + initiales), celui de l'équipe qui REÇOIT
//    (pas systématiquement "mon équipe" - voir liveMatch.isHome/opponentIdx).
// ---------------------------------------------------------------------
clock.now = scheduledAt + Math.round(MATCH_BROADCAST_DURATION_MS / 2);
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
let doc = dom.window.document;
let win = dom.window;

const courtWrap = doc.getElementById("liveCourtWrap");
if (courtWrap.classList.contains("hidden")) throw new Error("❌ (setup) La vue de terrain devrait être visible pendant un match normal.");

const savedMidway = readRawSave(savePath);
const liveMatch = savedMidway.league.liveMatch;
if (!liveMatch) throw new Error("❌ (setup) league.liveMatch devrait être présent une fois la diffusion démarrée.");
const homeIdx = liveMatch.isHome ? myTeamIndex : liveMatch.opponentIdx;
// Champ "teamName" côté sauvegarde brute (redevient Team.name une fois
// désérialisé, voir `new Team({ name: data.teamName, ... })` dans
// moteurbasket3.html).
const homeTeamName = savedMidway.league.teams[homeIdx].teamName;
const awayTeamName = savedMidway.league.teams[liveMatch.isHome ? liveMatch.opponentIdx : myTeamIndex].teamName;
console.log(`Match en cours — reçoit : "${homeTeamName}" (isHome=${liveMatch.isHome}), visiteur : "${awayTeamName}".`);

const logoGroup = doc.getElementById("liveCourtHomeLogo");
if (!logoGroup) throw new Error("❌ #liveCourtHomeLogo introuvable dans le terrain SVG.");
if (logoGroup.children.length === 0) {
  throw new Error("❌ #liveCourtHomeLogo devrait être rempli pendant la diffusion (logo de l'équipe qui reçoit).");
}
console.log("✅ #liveCourtHomeLogo est bien rempli pendant la diffusion.");

// L'équipe reçoit étant gratuite par défaut (nouvelle partie), on attend le
// logo TYPE (un <svg> imbriqué, avec aria-label portant son nom), pas
// d'<image> (réservée aux logos personnalisés d'un club payant).
const nestedSvg = logoGroup.querySelector("svg");
const imageEl = logoGroup.querySelector("image");
if (!nestedSvg) throw new Error("❌ Le logo type (club gratuit) devrait être un <svg> imbriqué (voir defaultTeamLogoSvg).");
if (imageEl) throw new Error("❌ Aucune <image> ne devrait apparaître pour un club gratuit (pas de logo personnalisé).");
const ariaLabel = nestedSvg.getAttribute("aria-label") || "";
if (!ariaLabel.includes(homeTeamName)) {
  throw new Error(`❌ Le logo au centre du terrain devrait correspondre à l'équipe qui REÇOIT ("${homeTeamName}"), aria-label obtenu : "${ariaLabel}".`);
}
if (ariaLabel.includes(awayTeamName) && awayTeamName !== homeTeamName) {
  throw new Error(`❌ Le logo affiché ne devrait PAS être celui de l'équipe visiteuse ("${awayTeamName}").`);
}
console.log(`✅ Le logo type au centre du terrain correspond bien à l'équipe qui reçoit ("${homeTeamName}"), jamais à la visiteuse.`);

// Positionné bien au centre du terrain (rond central : cx=500, cy=220).
const g = logoGroup.querySelector("g");
if (!g) throw new Error("❌ Le logo devrait être positionné via un <g transform=\"translate(...)\">.");
const transform = g.getAttribute("transform") || "";
if (!/translate\(4[68]\d,1[68]\d\)/.test(transform)) {
  throw new Error(`❌ Le logo devrait être centré sur le rond central (cx=500,cy=220), transform obtenu : "${transform}".`);
}
console.log("✅ Le logo est bien centré sur le rond central du terrain.");

// flush() AVANT de fermer cette fenêtre : sans ça, une sauvegarde encore en
// vol côté client (déclenchée en arrière-plan pendant le direct) peut
// atterrir APRÈS le patch écrit juste en dessous et l'écraser (même
// précaution que partout ailleurs dans la suite — voir flush() dans
// test_helpers.js).
await flush(dom);
await dom.window.close();

// ---------------------------------------------------------------------
// 2) Cas "club payant avec logo personnalisé" : bascule vers une <image>
//    SVG (pas de <img> HTML, invalide comme enfant direct d'un <svg>),
//    découpée en cercle, avec le bon href — sur l'équipe qui reçoit
//    précisément (patché directement dans la sauvegarde, les réglages
//    cosmétiques n'affectant pas la simulation déjà entièrement calculée).
// ---------------------------------------------------------------------
const CUSTOM_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const savedForPatch = readRawSave(savePath);
// La sauvegarde brute porte DEUX copies distinctes de "mon équipe" (data.team,
// utilisée pour construire teamA côté client) et de league.teams[0] (résumé
// league) — pas le même objet (vérifié : `saved.team !== saved.league.teams[0]`).
// Il faut patcher la bonne source selon que l'équipe qui reçoit est la
// mienne ou l'adversaire.
savedForPatch.league.teams[homeIdx].isPaying = true;
savedForPatch.league.teams[homeIdx].customLogoDataUrl = CUSTOM_LOGO;
if (homeIdx === myTeamIndex) {
  savedForPatch.team.isPaying = true;
  savedForPatch.team.customLogoDataUrl = CUSTOM_LOGO;
}
writeRawSave(savePath, savedForPatch);

dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
doc = dom.window.document;
win = dom.window;

const logoGroup2 = doc.getElementById("liveCourtHomeLogo");
const imageEl2 = logoGroup2.querySelector("image");
const nestedSvg2 = logoGroup2.querySelector("svg");
if (!imageEl2) throw new Error("❌ Une fois l'équipe qui reçoit passée payante avec un logo personnalisé, une <image> SVG devrait apparaître au centre du terrain.");
if (nestedSvg2) throw new Error("❌ Le logo type (<svg> imbriqué) ne devrait plus apparaître une fois un logo personnalisé actif.");
if (imageEl2.getAttribute("href") !== CUSTOM_LOGO) {
  throw new Error(`❌ L'<image> devrait pointer vers le logo personnalisé exact, obtenu : "${imageEl2.getAttribute("href")}".`);
}
const clipAttr = imageEl2.getAttribute("clip-path") || "";
if (!clipAttr.includes("url(#")) throw new Error("❌ Le logo personnalisé devrait être découpé en cercle via clip-path (cohérent avec .team-logo-img, border-radius:50%, utilisé partout ailleurs).");
console.log("✅ Un club payant avec un logo personnalisé affiche bien ce logo (via <image> SVG, découpé en cercle) au centre du terrain, à la place du logo type.");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n✅ Logo de l'équipe qui reçoit au centre du terrain vérifié : présent pendant la diffusion, correspond toujours à l'équipe qui REÇOIT (jamais la visiteuse), logo type généré pour un club gratuit, logo personnalisé (découpé en cercle) pour un club payant.");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
