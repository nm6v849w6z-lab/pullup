// Variante de scouting_pro_screenshots.js : au lieu de capturer des PNG,
// sauvegarde le rapport Scouting Pro DÉBLOQUÉ sous forme de vraie page HTML
// statique (CSS de l'appli inclus, scripts retirés) — pour que l'utilisateur
// puisse l'ouvrir dans un navigateur et voir le rendu net (zoomable,
// sélectionnable) plutôt qu'une capture PNG figée.
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

const DAY_MS = 24 * 60 * 60 * 1000;
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
  playRounds(lg, 5, T0, oppIdx);

  const savePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-scouting-html-")), "league.json");
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

    // Débloque directement en Premium (pas de pub à attendre) pour capturer
    // le rapport complet.
    await page.evaluate((idx) => {
      window.showTeamDetail(idx);
      document.querySelector("[data-team-detail-subview='analyse']").dispatchEvent(new Event("click", { bubbles: true }));
    }, oppIdx);
    await page.evaluate(async () => { await window.__lastScoutingProCheck; });
    await page.waitForSelector("#scoutingProGoPremiumBtn");
    await page.click("#scoutingProGoPremiumBtn");
    await page.evaluate(async () => { await window.__lastScoutingPremiumToggle; });
    await page.waitForSelector("#scoutingProGoFreeBtn");

    // Extrait le CSS de la page (toutes les balises <style>) + le HTML du
    // panneau lui-même, puis reconstruit un document HTML statique
    // autonome (aucun <script> — juste le rendu figé, mais en vrai
    // HTML/CSS net et zoomable plutôt qu'un PNG).
    const { styles, panelHtml, bodyClass } = await page.evaluate(() => {
      const styles = [...document.querySelectorAll("style")].map(s => s.outerHTML).join("\n");
      const panel = document.querySelector("#scoutingProPanel");
      return { styles, panelHtml: panel ? panel.outerHTML : "<p>Panneau introuvable</p>", bodyClass: document.body.className };
    });

    const doc = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Scouting Pro — aperçu statique</title>
${styles}
<style>
  /* Le panneau vit normalement dans un conteneur de page avec padding/fond ;
     on recrée un fond simple pour l'aperçu isolé. */
  html,body{margin:0;padding:24px;background:var(--bg,#0d0d0d);}
</style>
</head>
<body class="${bodyClass}">
${panelHtml}
</body>
</html>`;

    const outPath = path.join(OUT_DIR, "scouting-pro-apercu.html");
    fs.writeFileSync(outPath, doc, "utf-8");
    console.log("✅ Aperçu HTML statique écrit :", outPath);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
