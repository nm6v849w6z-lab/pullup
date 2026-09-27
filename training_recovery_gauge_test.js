// Entraînement (retour utilisateur, 2026-09-27) : jauge "Forme moyenne de
// l'équipe" sous le focus collectif quand "Travailler la récupération" est
// choisi ; "Bilan de la semaine dernière" en bas de page (après les trois
// autres briques). Voir renderRecoveryFormGauge dans moteurbasket3.html.
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
  assert(kids[kids.length - 1] === "lastTrainingReportHolder", "bilan de la semaine dernière en dernier sur la page");
  assert(kids.indexOf("lastTrainingReportHolder") > kids.findIndex(k => /tp-players/.test(k)), "bilan après « Qui profite… »");

  const team = win.eval("teamA");
  const now = Date.now();
  team.players.forEach((p, i) => { p.condition = i % 2 ? 60 : 80; p.conditionUpdatedAt = now; });
  const sel = doc.getElementById("collectiveTrainingSelect");
  const gauge = doc.getElementById("recoveryFormGauge");
  sel.value = "";
  sel.dispatchEvent(new win.Event("change"));
  assert(gauge.classList.contains("hidden") && !gauge.innerHTML, "pas de jauge sans focus récupération");
  sel.value = "recuperation";
  sel.dispatchEvent(new win.Event("change"));
  await flush(dom);
  const expected = Math.round(team.players.reduce((s, p) => s + p.condition, 0) / team.players.length);
  assert(!gauge.classList.contains("hidden"), "jauge visible en « Travailler la récupération »");
  assert(gauge.textContent.includes("Forme moyenne de l'équipe") && gauge.textContent.includes(`${expected}/100`), `forme moyenne affichée (${expected}/100)`);
  assert(gauge.querySelector(".tq-fill").style.width === `${expected}%`, "barre à la bonne largeur");
  sel.value = "tactique";
  sel.dispatchEvent(new win.Event("change"));
  assert(gauge.classList.contains("hidden"), "jauge masquée en « Travailler une nouvelle tactique »");
  await flush(dom);
  dom.window.close();
  server.close();
  console.log("✅ training_recovery_gauge_test OK");
})().catch(e => { console.error(e); process.exit(1); });
