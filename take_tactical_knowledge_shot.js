const { chromium } = require("playwright");
const { startTestServer } = require("./test_helpers.js");
const fs = require("fs");

(async () => {
  fs.mkdirSync("screenshots", { recursive: true });
  const { server, baseUrl } = await startTestServer();
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });

  page.on("console", (msg) => { if (msg.type() === "error") console.log("PAGE ERROR:", msg.text()); });
  page.on("pageerror", (err) => console.log("PAGE EXCEPTION:", err.message));

  await page.goto(baseUrl);
  await page.waitForFunction(() => window.__gameReady !== undefined);
  await page.evaluate(async () => { await window.__gameReady; });

  // ---------------------------------------------------------------------
  // 1) Page Ordres : jauge "Connaissance tactique" (lecture simple, plus
  //    d'aperçu avant/après ni d'avertissement).
  // ---------------------------------------------------------------------
  await page.evaluate(() => {
    // Valeurs variées par option (pas juste 50 partout) pour que la capture
    // soit parlante, et pour que la moyenne des options ACTUELLEMENT jouées
    // diffère clairement de 50.
    Object.keys(teamA.tacticalKnowledge.offense).forEach((k, i) => {
      teamA.tacticalKnowledge.offense[k] = 30 + (i * 7) % 60;
    });
    Object.keys(teamA.tacticalKnowledge.defense).forEach((k, i) => {
      teamA.tacticalKnowledge.defense[k] = 20 + (i * 15) % 70;
    });
    Object.keys(teamA.tacticalKnowledge.rhythm).forEach((k, i) => {
      teamA.tacticalKnowledge.rhythm[k] = 40 + (i * 20) % 55;
    });
    // Force des valeurs connues sur les options ACTUELLEMENT jouées pour
    // pouvoir vérifier l'affichage de la jauge Ordres par un calcul exact.
    teamA.offensivePriorities.forEach((p, i) => { teamA.tacticalKnowledge.offense[p] = 60 + i * 4; });
    teamA.tacticalKnowledge.defense[teamA.defense] = 38;
    teamA.tacticalKnowledge.rhythm[teamA.rhythm] = 55;
    teamA.chemistry = 64;
    document.querySelector('[data-tab="ordres"]').click();
  });
  await page.waitForTimeout(200);
  const ordresGaugeHandle = await page.$("#ordresTacticalKnowledgeGaugeWrap");
  if (!ordresGaugeHandle) {
    console.log("❌ #ordresTacticalKnowledgeGaugeWrap introuvable sur la page Ordres.");
  } else {
    await ordresGaugeHandle.screenshot({ path: "screenshots/ordres_connaissance_tactique.png" });
    console.log("✅ Capture de la jauge Ordres enregistrée.");
  }
  await page.screenshot({ path: "screenshots/ordres_page_complete.png", fullPage: true });

  // Vérifie que l'ancien avertissement/aperçu avant-après a bien disparu.
  const oldWarning = await page.$("#ordresTacticalKnowledgeWarning");
  console.log(oldWarning ? "⚠️ #ordresTacticalKnowledgeWarning existe encore (attendu supprimé)." : "✅ #ordresTacticalKnowledgeWarning bien supprimé.");

  // Vérifie que la valeur affichée correspond bien à la moyenne exacte des 3
  // options ACTUELLEMENT jouées (et pas des 18 options).
  const ordresCheck = await page.evaluate(() => {
    const k = teamA.tacticalKnowledge;
    const offenseAvg = teamA.offensivePriorities.reduce((s, p) => s + k.offense[p], 0) / teamA.offensivePriorities.length;
    const expected = Math.round((offenseAvg + k.defense[teamA.defense] + k.rhythm[teamA.rhythm]) / 3);
    const displayed = document.getElementById("ordresTacticalKnowledgeValue")?.textContent || "";
    return { expected, displayed };
  });
  const ordresOk = ordresCheck.displayed.startsWith(`${ordresCheck.expected}/100`);
  console.log(ordresOk
    ? `✅ La jauge Ordres affiche bien la moyenne exacte des 3 options jouées (${ordresCheck.expected}/100).`
    : `❌ Valeur Ordres inattendue : attendu ${ordresCheck.expected}/100, obtenu "${ordresCheck.displayed}".`);

  // ---------------------------------------------------------------------
  // 2) Onglet Entraînement : les 18 jauges (une par option, groupées par
  //    catégorie attaque/défense/rythme).
  // ---------------------------------------------------------------------
  await page.evaluate(() => {
    document.querySelector('[data-tab="entrainement"]').click();
  });
  await page.waitForTimeout(200);
  const trainingGaugesHandle = await page.$("#tacticalKnowledgeGaugesRow");
  if (!trainingGaugesHandle) {
    console.log("❌ #tacticalKnowledgeGaugesRow introuvable sur l'onglet Entraînement.");
  } else {
    await trainingGaugesHandle.screenshot({ path: "screenshots/entrainement_jauges_tactiques.png" });
    console.log("✅ Capture des 18 jauges Entraînement enregistrée.");
  }
  await page.screenshot({ path: "screenshots/entrainement_page_complete.png", fullPage: true });

  // Vérifie qu'il y a bien 10 + 5 + 3 = 18 jauges au total, réparties dans
  // les 3 rangées groupées, et que quelques valeurs affichées correspondent
  // exactement à teamA.tacticalKnowledge.
  const groupCounts = await page.evaluate(() => ({
    offense: document.querySelectorAll("#tkGaugeRowOffense .tactical-knowledge-gauge-item").length,
    defense: document.querySelectorAll("#tkGaugeRowDefense .tactical-knowledge-gauge-item").length,
    rhythm: document.querySelectorAll("#tkGaugeRowRhythm .tactical-knowledge-gauge-item").length,
  }));
  console.log("Nombre de jauges par catégorie :", groupCounts);
  const countsOk = groupCounts.offense === 10 && groupCounts.defense === 5 && groupCounts.rhythm === 3;
  console.log(countsOk ? "✅ 10 jauges offense + 5 défense + 3 rythme = 18 au total." : "❌ Nombre de jauges inattendu.");

  const sampleValues = await page.evaluate(() => {
    const firstOffenseKey = Object.keys(teamA.tacticalKnowledge.offense)[0];
    const firstDefenseKey = Object.keys(teamA.tacticalKnowledge.defense)[0];
    const items = [...document.querySelectorAll("#tkGaugeRowOffense .tactical-knowledge-gauge-item")];
    const firstItemText = items[0]?.querySelector("b")?.textContent || "";
    return {
      firstOffenseKey,
      firstOffenseExpected: `${Math.round(teamA.tacticalKnowledge.offense[firstOffenseKey])}/100`,
      firstOffenseDisplayed: firstItemText,
      firstDefenseKey,
      firstDefenseValue: teamA.tacticalKnowledge.defense[firstDefenseKey],
    };
  });
  console.log("Échantillon de valeurs :", sampleValues);
  const sampleOk = sampleValues.firstOffenseDisplayed === sampleValues.firstOffenseExpected;
  console.log(sampleOk ? "✅ Les valeurs affichées correspondent exactement à teamA.tacticalKnowledge." : "❌ Valeur affichée inattendue pour la 1re option offensive.");

  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
