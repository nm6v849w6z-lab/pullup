// Entraînement (retour utilisateur, 2026-09-27) : jauge "Forme moyenne de
// l'équipe" sous le focus collectif quand la récupération est choisie ;
// bilan en bas de page (après les autres briques). Voir
// renderRecoveryFormGauge dans moteurbasket3.html.
// Entraînement v2 (retour utilisateur 2026-10-01) : le choix se fait jour
// par jour (boutons [data-day-option] sous la bande de la semaine) au lieu
// de l'ancien <select id="collectiveTrainingSelect">, et la carte « Qui
// profite… » a disparu (plans individuels) : le bilan du lundi reste en
// dernier, après les cartes Parrainage/Expérience.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

(async () => {
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const win = dom.window, doc = win.document;
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "entrainement" || b.dataset.tab === "training").click();
  const page = doc.querySelector("#trainingSection .tp-page");
  const kids = [...page.children].map(c => c.id || c.className);
  assert(kids[kids.length - 1] === "lastTrainingReportHolder", "bilan du lundi en dernier sur la page");
  assert(kids.indexOf("lastTrainingReportHolder") > kids.findIndex(k => /tm-cols2/.test(k)), "bilan après Parrainage / Expérience");

  const team = win.eval("teamA");
  const now = Date.now();
  team.players.forEach((p, i) => { p.condition = i % 2 ? 60 : 80; p.conditionUpdatedAt = now; });
  const btn = key => doc.querySelector(`#collectiveTrainingConfig [data-day-option="${key}"]`);
  btn("physique").click();
  assert(!doc.getElementById("recoveryFormGauge"), "pas de jauge sans jour « Récupération »");
  btn("recuperation").click();
  await flush(dom);
  const gauge = doc.getElementById("recoveryFormGauge");
  const expected = Math.round(team.players.reduce((s, p) => s + p.condition, 0) / team.players.length);
  assert(!!gauge, "jauge visible pour un jour « Récupération »");
  assert(gauge.textContent.includes("Forme moyenne de l'équipe") && gauge.textContent.includes(`${expected}/100`), `forme moyenne affichée (${expected}/100)`);
  assert(gauge.querySelector(".tq-fill").style.width === `${expected}%`, "barre à la bonne largeur");
  btn("tactique").click();
  assert(!doc.getElementById("recoveryFormGauge"), "jauge absente pour un jour « Tactique »");
  await flush(dom);
  dom.window.close();
  server.close();
  console.log("✅ training_recovery_gauge_test OK");
})().catch(e => { console.error(e); process.exit(1); });
