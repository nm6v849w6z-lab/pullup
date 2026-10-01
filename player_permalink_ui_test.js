// Permaliens des joueurs, côté écran (demande validée le 2026-10-01) :
// bouton « Partager » sur la fiche de SES joueurs seulement (création du
// lien, copie dans le presse-papiers, état « Lien public actif » et
// « Couper le lien »), courbe de progression avec sélecteur de
// caractéristique, rien pour un joueur adverse. Voir
// server/player_permalink_test.js (serveur, page publique).
const fs = require("fs");
const Engine = require("./engine.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

const tick = () => new Promise(r => setTimeout(r, 30));
const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);
async function until(fn, n = 100) { for (let i = 0; i < n; i++) { if (fn()) return true; await tick(); } return false; }

(async () => {
  const now = Date.now();
  const lg = Engine.generateMultiManagerLeague(["Lyon PartageUI"], 1, now, { dailyAnchored: true, weekly: true });
  const idx = lg.teams.findIndex(t => t.isHuman);
  const me = lg.teams[idx];
  me.setPaying(true);
  const star = me.players[0];
  star.weeklyHistory = [];
  [[1, 0], [2, 1], [3, 3], [4, 4]].forEach(([w, gain]) => {
    const saved = { ...star.attrs };
    Engine.ATTRS.forEach(a => { star.attrs[a] = Math.min(99, saved[a] + gain); });
    star.attrs.threePoint = Math.min(99, saved.threePoint + gain * 2);
    Engine.pushPlayerHistory(star, 1, w);
    star.attrs = saved;
  });
  const oppIdx = lg.teams.findIndex(t => !t.isHuman);
  const opp = lg.teams[oppIdx].players[0];
  Engine.pushPlayerHistory(opp, 1, 1); Engine.pushPlayerHistory(opp, 1, 2);

  const { server, multiSavePath, baseUrl } = await startTestServer();
  await store.saveMultiLeague(lg, multiSavePath);
  const dom = await openGame(html, `${baseUrl}?m=${me.managerLinkToken}`);
  const win = dom.window, doc = win.document;
  let copied = null;
  Object.defineProperty(win.navigator, "clipboard", { configurable: true, value: { writeText: async t => { copied = t; } } });

  // 1) Fiche de son joueur : bouton Partager, pas encore de lien actif.
  win.eval(`showPlayerDetail(${idx}, ${JSON.stringify(star.id)})`);
  await tick();
  const btn = doc.querySelector("#pdpShareBox [data-pdp-share]");
  if (!btn || !/Partager/.test(btn.textContent)) fail("bouton « Partager » absent de la fiche de son joueur.");
  if (doc.querySelector("[data-share-active]")) fail("aucun lien ne devrait être actif au départ.");
  ok("fiche de son joueur : bouton « Partager », aucun lien actif");

  // 2) Courbe de progression : note globale + sélecteur.
  const sel = doc.querySelector("#ppAttrSel");
  if (!sel || sel.value !== "overall" || !sel.querySelector('option[value="threePoint"]')) fail("sélecteur de la courbe absent.");
  if (doc.querySelectorAll("#ppChartBox .pp-dot").length !== 4 || !doc.querySelector("#ppChartBox .pp-line")) fail("courbe de la note globale : 4 points attendus.");
  if (!/S1 · sem\. 1/.test(doc.querySelector("#ppChartBox .pp-x").textContent)) fail(`semaines : ${doc.querySelector("#ppChartBox .pp-x").textContent}`);
  sel.value = "threePoint";
  sel.dispatchEvent(new win.Event("change", { bubbles: true }));
  await tick();
  const delta = doc.querySelector("#ppChartBox .pp-x b").textContent;
  if (delta !== "+8") fail(`courbe du tir à 3 points : +8 attendu, obtenu ${delta}`);
  ok("courbe de progression : note globale par défaut, caractéristique au choix (tir à 3 pts +8)");

  // 3) Partager : lien créé, copié, état actif.
  btn.click();
  if (!await until(() => doc.querySelector("[data-share-active]"))) fail("le lien n'est pas devenu actif.");
  if (!copied || !new RegExp(`^${baseUrl.replace(/\/$/, "")}/j/[A-Za-z0-9_-]{8}$`).test(copied)) fail(`lien copié inattendu : ${copied}`);
  const msg = doc.querySelector("#pdpShareMsg");
  if (!/Lien copié/.test(msg.textContent) || msg.querySelector("input").value !== copied) fail(`message : ${msg.textContent}`);
  if (!doc.querySelector("[data-pdp-share-revoke]") || !/Couper le lien/.test(doc.querySelector("[data-pdp-share-revoke]").textContent)) fail("« Couper le lien » absent.");
  const res = await fetch(copied);
  const page = await res.text();
  if (res.status !== 200 || !page.includes(star.name)) fail(`page publique : ${res.status}`);
  ok(`« Partager » : lien créé et copié (${copied}), « Lien public actif » + « Couper le lien »`);

  // Deuxième clic : même lien, sans nouvel appel au serveur.
  const first = copied; copied = null;
  doc.querySelector("[data-pdp-share]").click();
  if (!await until(() => copied)) fail("deuxième partage : rien copié.");
  if (copied !== first) fail("deuxième partage : le lien devrait être le même.");
  ok("deuxième « Partager » : même lien");

  // 4) Couper le lien.
  doc.querySelector("[data-pdp-share-revoke]").click();
  if (!await until(() => !doc.querySelector("[data-share-active]") && /Lien coupé/.test((doc.querySelector("#pdpShareMsg") || {}).textContent || ""))) fail("le lien n'a pas été coupé.");
  const res2 = await fetch(first);
  if (res2.status !== 404) fail(`lien coupé : 404 attendu, obtenu ${res2.status}`);
  ok("« Couper le lien » : état retiré, page publique en 404");

  // 5) Joueur adverse : ni bouton ni courbe.
  win.eval(`showPlayerDetail(${oppIdx}, ${JSON.stringify(opp.id)})`);
  await tick();
  if (doc.querySelector("[data-pdp-share]") || doc.querySelector("#ppChartBox")) fail("joueur adverse : ni « Partager » ni courbe.");
  const oppSeen = win.eval(`league.teams[${oppIdx}].players.find(p => p.id === ${JSON.stringify(opp.id)}).weeklyHistory.length`);
  if (oppSeen !== 0) fail(`historique d'un adversaire reçu par le navigateur (${oppSeen} entrées).`);
  ok("joueur adverse : pas de bouton « Partager », pas de courbe, aucun historique reçu");

  server.close();
  console.log("\nTous les tests d'écran des permaliens passent.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
