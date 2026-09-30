// Caractéristiques cachées des adversaires (2026-09-30, correctif de
// sécurité validé par l'utilisateur) : /api/save n'envoie plus les
// caractéristiques brutes des autres clubs, seulement celles révélées par
// le scouting (server/publicPlayers.js). Vérifie côté navigateur que ce qui
// en dépendait marche toujours : niveau de l'adversaire (tableau de bord,
// calculé par le serveur), séance vidéo (valeurs révélées reçues et
// affichées), estimation des ventes comparables (calculée par le serveur),
// fiches joueur/équipe adverses sans NaN ni undefined.
const fs = require("fs");
const store = require("./server/store.js");
const World = require("./server/world.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);
const wait = async (cond, what) => { for (let i = 0; i < 100; i++) { if (cond()) return; await new Promise(r => setTimeout(r, 50)); } fail(`délai dépassé : ${what}`); };

(async () => {
  const { server, multiSavePath, baseUrl } = await startTestServer();
  const now = Date.now();
  const career = store.createMultiManagerCareer(["Lyon Caché", "Paris Caché"], now - 20 * 24 * 3600 * 1000, "Lyon Caché");
  const me = career.league.teams[0];
  me.videoAnalyst = { level: 3, weeksEmployed: 0, baseSalary: 15000 };
  me.lastVideoSessionAt = null;
  await store.saveMultiLeague(career.league, multiSavePath);
  await World.catchUpWorld(multiSavePath, now);
  const w = await World.loadWorld(multiSavePath, now);
  const real = await World.loadLeague(w, "fr-1", multiSavePath);
  const dom = await openGame(html, `${baseUrl}?m=${me.managerLinkToken}`);
  const win = dom.window, doc = win.document;
  const E = s => win.eval(s);

  // 1) Adversaire : aucune caractéristique non révélée reçue.
  const opp = 3;
  const open = new Set(real.transferListings.filter(l => l.status === "open").map(l => l.playerId));
  const oppPlayers = real.teams[opp].players.filter(p => !open.has(p.id));
  if (!E(`league.teams[${opp}].players.filter(p => ${JSON.stringify([...open])}.indexOf(p.id) === -1).every(p => p.attrsHidden && (p.receivedAttrKeys || []).length === 0)`)) fail("adversaire non scouté : caractéristiques non reçues attendues.");
  if (E(`computePlayerVisibility(${opp}, league.teams[${opp}].players.find(p => p.attrsHidden)).visibleAttrs.length`) !== 0) fail("rien de visible pour un adversaire non scouté.");
  if (!E("teamA.players.every(p => !p.attrsHidden && typeof p.potential === 'number')")) fail("ses propres joueurs : complets.");
  ok("adversaire non scouté : aucune caractéristique reçue ; ses propres joueurs complets");

  // 2) Niveau de l'adversaire (tableau de bord) : celui du serveur, identique à l'ancien calcul.
  const level = t => Math.round(t.players.reduce((s, p) => s + p.overall(), 0) / t.players.length);
  for (let i = 1; i < 10; i++) {
    const got = E(`dashboardTeamLevel(league.teams[${i}])`);
    if (got !== level(real.teams[i])) fail(`niveau du club ${i} : ${got} au lieu de ${level(real.teams[i])}`);
  }
  if (E("dashboardTeamLevel(teamA)") !== level(real.teams[0])) fail("son propre niveau.");
  ok("niveau des adversaires (tableau de bord) : même valeur qu'avant, calculée par le serveur");

  // 3) Séance vidéo : les valeurs révélées arrivent et s'affichent.
  const res = await win.eval(`performVideoSession(${opp})`);
  if (!res.ok || !res.revealed.length) fail(`séance vidéo : ${JSON.stringify(res).slice(0, 200)}`);
  const p0 = oppPlayers[0];
  res.revealed.forEach(k => {
    const v = E(`league.teams[${opp}].players.find(p => p.id === ${p0.id}).attrs.${k}`);
    if (v !== p0.attrs[k]) fail(`${k} révélé : ${v} au lieu de ${p0.attrs[k]}`);
  });
  const vis = E(`computePlayerVisibility(${opp}, league.teams[${opp}].players.find(p => p.id === ${p0.id})).visibleAttrs`);
  if (JSON.stringify([...vis].sort()) !== JSON.stringify([...res.revealed].sort())) fail(`visibles après séance : ${vis}`);
  E(`showPlayerDetail(${opp}, ${p0.id})`);
  const pd = doc.getElementById("playerDetailContent");
  if (/NaN|undefined/.test(pd.textContent)) fail("fiche joueur adverse : ni NaN ni undefined.");
  const shown = [...pd.querySelectorAll(".pdp-attr-value")].map(e => e.textContent.trim()).filter(t => /^\d+$/.test(t));
  if (shown.length !== res.revealed.length) fail(`fiche joueur : ${shown.length} valeurs affichées pour ${res.revealed.length} révélées.`);
  E(`showTeamDetail(${opp})`);
  const td = doc.getElementById("teamDetailContent");
  td.querySelector('[data-team-detail-subview="effectif"]').click();
  const caracs = td.querySelector('[data-team-effectif-view="caracs"]');
  if (caracs) caracs.click();
  if (/NaN|undefined/.test(td.textContent)) fail("fiche équipe adverse : ni NaN ni undefined.");
  ok(`séance vidéo : ${res.revealed.length} caractéristiques révélées reçues du serveur, exactes, affichées (et elles seules) sur la fiche joueur ; fiches sans NaN/undefined`);

  // 4) Rechargement : les valeurs révélées sont renvoyées par /api/save.
  const dom2 = await openGame(html, `${baseUrl}?m=${me.managerLinkToken}`);
  const vis2 = dom2.window.eval(`computePlayerVisibility(${opp}, league.teams[${opp}].players.find(p => p.id === ${p0.id})).visibleAttrs`);
  if (JSON.stringify([...vis2].sort()) !== JSON.stringify([...res.revealed].sort())) fail("après rechargement : caractéristiques révélées toujours visibles.");
  ok("après rechargement : caractéristiques révélées toujours là (et seulement elles)");

  // 5) Estimation des ventes comparables : calculée par le serveur.
  const vals = E("league.saleValuations");
  if (!vals || !E("teamA.players.every(p => Object.prototype.hasOwnProperty.call(league.saleValuations, p.id))")) fail("estimations de vente reçues pour ses joueurs.");
  const pid = E("teamA.players[0].id");
  if (JSON.stringify(E(`comparableSalesValuation(teamA.players[0])`)) !== JSON.stringify(vals[pid])) fail("comparableSalesValuation lit l'estimation du serveur.");
  E(`showPlayerDetail(myTeamIndex, ${pid})`);
  if (!/ventes comparables/.test(doc.getElementById("playerDetailContent").textContent)) fail("carte « Mise en vente » : estimation (ou absence) affichée.");
  ok("estimation des ventes comparables : fournie par le serveur, affichée sur la fiche de ses joueurs");

  dom.window.close(); dom2.window.close();
  server.close();
  console.log("\n🏁 hidden_attrs_ui_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
