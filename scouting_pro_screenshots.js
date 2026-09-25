// Script de capture d'écran (Playwright, chromium réel — PAS jsdom) pour
// montrer concrètement l'UI "Scouting Pro" fraîchement codée (retour
// utilisateur : "Bosse le code et montre des visuels"). Démarre un vrai
// serveur server/index.js (mode solo) sur un port éphémère, adossé à une
// sauvegarde temporaire pré-remplie (quelques journées déjà jouées, pour
// avoir de vraies stats à afficher), puis pilote un vrai navigateur headless
// pour capturer : le teaser verrouillé, l'écran gris de pub factice, le
// rapport débloqué après la pub, et l'état "Passer Pro".
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");
const Engine = require("./engine.js");
const { generateTeam, generateLeague, simulateOrForfeit, recordMatchStatsAndAwardMvp } = Engine;
const store = require("./server/store.js");
const { createHandler } = require("./server/index.js");

const T0 = Date.UTC(2026, 8, 7);
const OUT_DIR = "/mnt/user-data/outputs";
fs.mkdirSync(OUT_DIR, { recursive: true });

function freshLeague(now = T0) {
  const user = generateTeam("Scout FC", 1.0);
  return generateLeague(user, 1, now);
}

// Espace chaque journée de quelques jours réels (comme un vrai calendrier)
// plutôt que de tout jouer au même instant `now` : sinon la forme physique
// des joueurs (Player.condition) s'effondre à 0% en 5 matchs sans aucun
// jour de récupération entre deux, ce qui rendrait la démo "joueurs clés"
// des captures d'écran trompeuse (uniquement un artefact de données de
// démo, jamais un bug de server/scouting.js lui-même).
const DAY_MS = 24 * 60 * 60 * 1000;
// Fait varier les réglages tactiques de `varyIdx` (si fourni) d'une journée
// à l'autre AVANT chaque simulation — but purement démonstratif (capture
// d'écran des nouvelles "barres de fréquence de stratégies", retour
// utilisateur : "Graphiques stratégies offensive/défensive") : une IA CPU ne
// change normalement jamais ses réglages d'une journée à l'autre (fixés une
// fois à la génération de la ligue, voir buildLeagueWithHumanTeams), donc
// sans cette variation manuelle le graphique de démo n'aurait qu'une seule
// barre à 100%, peu parlant. `tacticsUsed` (voir Engine.tacticsSnapshotFor)
// est bien capturé au moment RÉEL de chaque simulation, donc cette rotation
// produit un historique varié fidèle à ce que montrerait un vrai manager qui
// change de stratégie au fil de la saison.
const DEMO_DEFENSES = ["Homme à homme", "Zone extérieure", "Zone press"];
const DEMO_OFFENSES = [
  ["Jeu extérieur", "Jeu en mouvement", "Équilibrée"],
  ["Pick & Roll", "Isolation", "Équilibrée"],
  ["Jeu intérieur", "Post-up", "Équilibrée"],
];
const DEMO_RHYTHMS = ["Normal", "Rapide", "Lent"];
function playRounds(lg, numRounds, startNow = T0, varyIdx = null) {
  for (let r = 0; r < numRounds; r++) {
    const now = startNow + r * 3 * DAY_MS;
    if (varyIdx != null) {
      const team = lg.teams[varyIdx];
      team.defense = DEMO_DEFENSES[r % DEMO_DEFENSES.length];
      team.offensivePriorities = DEMO_OFFENSES[r % DEMO_OFFENSES.length];
      team.rhythm = DEMO_RHYTHMS[r % DEMO_RHYTHMS.length];
    }
    lg.matchesForRound(r).forEach(m => {
      const home = lg.teams[m.home], away = lg.teams[m.away];
      const res = simulateOrForfeit(home, away, now);
      lg.recordResult(r, m.home, m.away, res.scoreHome, res.scoreAway);
      if (!res.forfeit) recordMatchStatsAndAwardMvp(home, away, r, "championship", now, res.quarterScores, res.tacticsUsed);
    });
  }
  lg.round = numRounds;
}

async function main() {
  const lg = freshLeague();
  const firstMatch = lg.matchesForRound(0).find(m => m.home === 0 || m.away === 0);
  const oppIdx = firstMatch.home === 0 ? firstMatch.away : firstMatch.home;
  const secondOppIdx = [1, 2, 3, 4, 5, 6].find(i => i !== oppIdx && i !== 0);
  // quelques journées jouées : de la vraie forme récente/zones de tir/
  // joueurs clés/stratégies utilisées à montrer — varyIdx=oppIdx fait
  // tourner ses réglages tactiques d'une journée à l'autre (voir le grand
  // commentaire de playRounds ci-dessus) pour peupler le graphique de
  // stratégies de plusieurs barres.
  playRounds(lg, 5, T0, oppIdx);

  const savePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-scouting-shots-")), "league.json");
  await store.save(lg.teams[0], lg, savePath);

  const server = http.createServer(createHandler(savePath, Date.now));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(baseUrl);
    await page.waitForFunction(() => window.__gameReady !== undefined);
    await page.evaluate(async () => { await window.__gameReady; });

    // ---- Écran 1 : rapport Scouting Pro VERROUILLÉ (teaser + pub/Premium) ----
    await page.evaluate((idx) => {
      window.showTeamDetail(idx);
      document.querySelector("[data-team-detail-subview='analyse']").dispatchEvent(new Event("click", { bubbles: true }));
    }, oppIdx);
    await page.evaluate(async () => { await window.__lastScoutingProCheck; });
    await page.waitForSelector("#scoutingProWatchAdBtn");
    await page.locator("#scoutingProPanel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT_DIR}/scouting-pro-1-verrouille.png`, fullPage: true });
    console.log("✅ Capture 1/4 : rapport verrouillé (teaser + boutons pub/Premium).");

    // ---- Écran 2 : écran gris de pub factice ----
    await page.click("#scoutingProWatchAdBtn");
    await page.waitForSelector("#scoutingAdOverlay");
    await page.screenshot({ path: `${OUT_DIR}/scouting-pro-2-pub-factice.png`, fullPage: true });
    console.log("✅ Capture 2/4 : écran gris de pub factice (15s).");

    // ---- Écran 3 : rapport débloqué après la pub (vraie attente ~15s, vrai navigateur réel) ----
    await page.waitForSelector("#scoutingAdOverlay", { state: "detached", timeout: 20000 });
    await page.waitForSelector("#scoutingProPanel :text('Classement')", { timeout: 5000 }).catch(() => {});
    await page.locator("#scoutingProPanel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT_DIR}/scouting-pro-3-debloque.png`, fullPage: true });
    console.log("✅ Capture 3/4 : rapport Scouting Pro débloqué (forme récente, zones de tir, joueurs clés...).");

    // ---- Écran 3bis : gros plan sur les nouveaux visuels (retour
    // utilisateur, 2026-09 : "trop simple pour le moment [...] faudrait des
    // choses plus visuels que ton texte / bilan tu mets des carré rouges ou
    // verts / zone de tir une carte du terrain... / on pourrait avoir une
    // carte du 5 types aussi") : carrés colorés, carte de terrain, barres de
    // stratégies, carte "5 majeur", tableau complet du roster — capture
    // juste le panneau (pas toute la page) pour un visuel net.
    // Fenêtre agrandie VERTICALEMENT juste avant cette capture (retour
    // utilisateur, 2026-09-24 : "évite d'avoir des trucs au dessus de la
    // barre du haut") : `.topbar` est position:sticky (voir son CSS) — un
    // `locator.screenshot()` sur un élément plus grand que le viewport fait
    // défiler ET recompose l'image par morceaux (comportement Playwright
    // documenté), ce qui peut laisser la barre du haut "recollée" en double
    // dans l'image recomposée. En rendant le viewport assez haut pour que
    // TOUT #scoutingProPanel tienne d'un coup, aucun défilement n'est
    // nécessaire pour cette capture, donc aucune recomposition — le bug ne
    // peut plus se produire. Remise à la taille normale juste après pour ne
    // pas affecter la capture 4.
    await page.evaluate(() => window.scrollTo(0, 0));
    const panelBox = await page.locator("#scoutingProPanel").boundingBox();
    // `panelBox.y` est relatif au HAUT de la page (scrollY=0 ci-dessus) : un
    // viewport aussi haut que "y + hauteur du panneau" le contient donc en
    // entier, sans qu'aucun défilement ne soit nécessaire pour la capture.
    await page.setViewportSize({ width: 1280, height: Math.ceil((panelBox?.y || 0) + (panelBox?.height || 900) + 40) });
    await page.locator("#scoutingProPanel").screenshot({ path: `${OUT_DIR}/scouting-pro-3bis-visuels.png` });
    await page.setViewportSize({ width: 1280, height: 900 });
    console.log("✅ Capture 3bis/4 : gros plan sur les nouveaux visuels (carrés, terrain, barres, 5 majeur, roster).");

    // ---- Écran 4 : "Passer Pro" sur un autre adversaire (Premium, sans pub) ----
    await page.evaluate((idx) => {
      window.showTeamDetail(idx);
      document.querySelector("[data-team-detail-subview='analyse']").dispatchEvent(new Event("click", { bubbles: true }));
    }, secondOppIdx);
    await page.evaluate(async () => { await window.__lastScoutingProCheck; });
    await page.waitForSelector("#scoutingProGoPremiumBtn");
    await page.click("#scoutingProGoPremiumBtn");
    await page.evaluate(async () => { await window.__lastScoutingPremiumToggle; });
    await page.waitForSelector("#scoutingProGoFreeBtn");
    await page.locator("#scoutingProPanel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT_DIR}/scouting-pro-4-premium.png`, fullPage: true });
    console.log("✅ Capture 4/4 : 'Passer Pro' actif, rapport débloqué instantanément sans pub.");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
