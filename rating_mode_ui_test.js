// Option d'affichage « Total des caractéristiques (TC) » (Paramètres >
// Affichage, retour utilisateur 2026-10-03) : sur la fiche joueur, TC de
// tout dans l'anneau, TC par catégorie dessous, TC dans les en-têtes des
// caractéristiques ; « Moyenne (GEN) » par défaut.
const fs = require("fs");
const { startTestServer, openGame } = require("./test_helpers.js");
const fail = m => { console.error("❌ " + m); process.exit(1); };
(async () => {
  const html = fs.readFileSync("moteurbasket3.html", "utf-8");
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const w = dom.window, doc = w.document;
  w.eval("showPlayerDetail(myTeamIndex, teamA.players[0].id)");
  const ringLbl = () => doc.querySelector(".pdp2-ring .pdp2-ring-lbl").textContent;
  if (ringLbl() !== "Note" || doc.querySelector(".pdp2-tcratings")) fail("par défaut : note GEN et notes par poste");
  w.eval("showSettingsModal('display')");
  doc.querySelector('[data-rating-choice="tc"]').click();
  if (w.localStorage.getItem("hm-rating-mode") !== "tc") fail("préférence TC enregistrée");
  const tc = w.eval("teamA.players[0] && Object.values(teamA.players[0].attrs).reduce((a, b) => a + b, 0)");
  if (ringLbl() !== "TC" || Number(doc.querySelector(".pdp2-ring .pdp-overall-num").textContent) !== tc) fail(`anneau en TC (${tc})`);
  const cats = [...doc.querySelectorAll(".pdp2-tcratings .pdp2-posrating b")].map(b => Number(b.textContent));
  if (cats.length !== 3 || cats.reduce((a, b) => a + b, 0) !== tc) fail(`TC par catégorie : ${cats}`);
  if (![...doc.querySelectorAll(".pdp2-attr-head span")].every(s => /^TC \d+$/.test(s.textContent.trim()))) fail("en-têtes des caractéristiques en TC");
  console.log("✅ option TC : anneau, TC par catégorie et en-têtes des caractéristiques ; GEN par défaut");
  dom.window.close(); server.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
