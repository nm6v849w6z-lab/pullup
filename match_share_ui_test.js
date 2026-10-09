// Partage d'un match (P3, 2026-10-09) côté jeu (navigateur simulé, vrai
// serveur) : bouton « Partager le match » sur l'écran du direct de son club,
// lien /m/<code> créé, copié et affiché dans le flux (pas de fenêtre) ; le
// lien ouvre la page publique ; « Partager la rediffusion » à côté de
// « Revoir le direct » ; jamais de bouton pour une ligue privée.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const store = require("./server/store.js");
const World = require("./server/world.js");
const LiveMatch = require("./server/liveMatch.js");
const Engine = require("./engine.js");
const html = require("./test_game_html.js").readGameHtml();
const ok = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const wait = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 100)); } throw new Error("❌ attente : " + label); };

(async () => {
  const { server, baseUrl, multiSavePath } = await startTestServer();
  let dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const my = dom.window.eval("myTeamIndex");
  dom.window.close();

  // Un direct en cours pour mon club.
  const now = Date.now();
  const world = await World.loadWorld(multiSavePath, now);
  const lg = await World.loadLeague(world, store.HISTORIC_LEAGUE_ID, multiSavePath);
  const opp = lg.teams.findIndex((t, i) => i !== my);
  const entry = LiveMatch.computeLiveMatchForTeams(Engine, lg.teams[my], lg.teams[opp], 4, my, opp, now - 10 * 60e3, "championship");
  lg.liveMatches = { ...(lg.liveMatches || {}), [`4:${my}:${opp}`]: entry };
  await store.saveMultiLeague(lg, multiSavePath);

  dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const win = dom.window, doc = win.document;
  ok(win.HM_SHARE && typeof win.HM_SHARE.own === "function", "module de partage chargé");

  // Écran du direct de mon club.
  win.HM_SHARE.own({ round: 4, competition: "championship", isHome: true, opponentIdx: opp });
  const btn = doc.querySelector("#hmOwnShare [data-hm-share]");
  ok(btn && /Partager le match/.test(btn.textContent) && btn.dataset.hmShare === "live", "écran du direct : bouton « Partager le match »");
  btn.click();
  await wait(() => /\/m\/[A-Za-z0-9_-]{8}/.test(doc.querySelector("#hmOwnShare .hm-share-fb").innerHTML), "lien créé");
  const fb = doc.querySelector("#hmOwnShare .hm-share-fb");
  const url = fb.querySelector("a").getAttribute("href");
  ok(/Lien copié|Copiez le lien/.test(fb.textContent), `lien affiché dans le flux, sous le bouton (${url})`);
  const cs = win.getComputedStyle(doc.getElementById("hmOwnShare"));
  ok(cs.position !== "fixed" && cs.position !== "absolute", "aucune fenêtre flottante (règle UI mobile)");
  const page = await fetch(url).then(r => r.text().then(t => ({ status: r.status, t })));
  ok(page.status === 200 && page.t.includes(lg.teams[my].name) && page.t.includes("EN DIRECT"), "le lien ouvre la page publique du match (en direct)");
  const data = await fetch(url + "/data").then(r => r.json());
  ok(data.ok && data.status === "live" && !data.live.finalScore, "données du direct sans score final");

  // Feuille de match : à côté de « Revoir le direct ».
  const box = doc.createElement("div");
  box.innerHTML = `<div class="mbx-replay"><button id="rb">▶ Revoir le direct</button><span class="mbx-replay-fb" id="rbfb"></span></div>`;
  doc.body.appendChild(box);
  win.HM_SHARE.replayButton(doc.getElementById("rbfb"), { round: 4, competition: "championship", home: my, away: opp });
  const rb = box.querySelector("[data-hm-share]");
  ok(rb && /Partager la rediffusion/.test(rb.textContent) && rb.closest(".hm-share").nextElementSibling.id === "rbfb", "feuille de match : « Partager la rediffusion » à côté de « Revoir le direct »");
  win.HM_SHARE.replayButton(doc.getElementById("rbfb"), { round: 4, competition: "championship", home: my, away: opp });
  ok(box.querySelectorAll("[data-hm-share]").length === 1, "pas de doublon");
  const box2 = doc.createElement("div");
  box2.innerHTML = `<div class="mbx-replay"><span id="lpfb"></span></div>`;
  doc.body.appendChild(box2);
  win.HM_SHARE.replayButton(doc.getElementById("lpfb"), { lp: "abc", round: 0, home: 0, away: 1 });
  ok(!box2.querySelector("[data-hm-share]"), "ligue privée : pas de bouton de partage");

  // Fenêtre spectateur d'une ligue privée : pas de bouton.
  const holder = doc.createElement("div"); holder.id = "spectateSeekHolder"; doc.body.appendChild(holder);
  win.HM_SHARE.spectate({ url: "/api/private-league/live?lp=1&round=0&home=0&away=1", live: { round: 0, isHome: true, opponentIdx: 1 }, teamIdx: 0 });
  ok(!holder.querySelector("[data-hm-share]"), "spectateur (ligue privée) : pas de bouton");
  win.HM_SHARE.spectate({ url: null, live: { round: 4, competition: "championship", isHome: false, opponentIdx: my }, teamIdx: opp, teamName: "X", opponentName: "Y" });
  ok(holder.querySelector("[data-hm-share='live']"), "spectateur (match officiel en direct) : « Partager le match »");

  dom.window.close(); server.close();
  console.log("\n🏁 match_share_ui_test.js : partage depuis le jeu vérifié.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
