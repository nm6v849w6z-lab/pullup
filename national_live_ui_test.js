// Sélections nationales — direct et box score des matchs internationaux
// (2026-10-06) : la feuille de statistiques est celle des matchs de club
// (openMatchBoxscoreModal via showNationalBoxscore), le direct passe par
// l'écran des clubs (installGuestTeams + showSpectateMatch via
// openNationalLive, route /api/national/live), boutons « Voir le direct » /
// « Suivre le match » sur les pages Sélections et le mode Sélectionneur.
// Le stockage à part des directs (store.saveNationalLives) est vérifié ici
// aussi (aller-retour sur fichiers).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const wait = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 100)); } throw new Error("❌ délai dépassé : " + label); };

// Un match international joué par le moteur (fenêtre 1), son direct rangé
// à part et sa feuille de match une fois la diffusion finie.
function fixture() {
  const store = require("./server/store.js");
  const N = require("./server/nationalTeams.js");
  const M = require("./server/nationalMatches.js");
  const LiveMatch = require("./server/liveMatch.js");
  const Engine = require("./engine.js");
  const start = Date.UTC(2027, 0, 5, 19);
  const COUNTRIES = Object.keys(Engine.WORLD_COUNTRIES);
  const lg = store.createMultiManagerCareer(["Lyon LV", "Paris LV"], start).league;
  lg.seasonNumber = 2; lg.calendarStartAt = start; lg.country = "fr";
  lg.teams.forEach(t => { if (t.isHuman) t.lastSeenAt = start + 300 * 864e5; });
  lg.teams.flatMap(t => t.players).forEach((p, i) => { p.nationality = COUNTRIES[i % COUNTRIES.length]; p.age = 25; p.injuryUntil = null; p.condition = 100; p.conditionUpdatedAt = start; });
  const leagues = new Map([["fr-1", lg]]);
  const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }] };
  const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
  N.step(st, leagues, world, start + 3600e3);
  const comp = M.compOf(st, 2, "A");
  const m1 = comp.matches.find(m => m.w === 1);
  N.step(st, leagues, world, m1.at + 60e3);
  const lives = M.takePendingLive(st);
  const item = lives.find(x => x.id === m1.id);
  const after = m1.liveUntil + 1000;
  const md = M.matchDetail(st, m1.id, after);
  // Réponse de /api/national/live (même construction que la route).
  const view = LiveMatch.viewLiveMatchForTeam({ liveMatches: { [m1.id]: item.entry } }, item.entry.homeIdx);
  view.intl = item.entry.intl;
  const live = {
    ok: true, live: view, watchIdx: item.entry.homeIdx, mine: false, ended: false,
    guestTeams: [{ leagueId: null, idx: null, level: null, team: item.teams.home, localIdx: item.entry.homeIdx }, { leagueId: null, idx: null, level: null, team: item.teams.away, localIdx: item.entry.awayIdx }],
    teamName: N.teamLabel(m1.home), opponentName: N.teamLabel(m1.away),
  };
  return { store, lives, item, md, live, m1 };
}

(async () => {
  const fx = fixture();
  // 0) Stockage à part : aller-retour, anneau d'emplacements.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "natlive-"));
  const savePath = path.join(dir, "multi.json");
  await fx.store.saveNationalLives(fx.lives, savePath);
  const back = await fx.store.loadNationalLive(fx.m1.id, savePath);
  assert(back && back.id === fx.m1.id && back.entry.events.length === fx.item.entry.events.length && back.teams.home.players.length, "direct rangé à part puis relu (fichier natlive)");
  assert(await fx.store.loadNationalLive("inconnu", savePath) === null, "match sans direct : rien");
  const many = Array.from({ length: fx.store.NATIONAL_LIVE_SLOTS + 2 }, (_, i) => ({ id: "x" + i, at: i, entry: {}, teams: {} }));
  await fx.store.saveNationalLives(many, savePath);
  assert(await fx.store.loadNationalLive(fx.m1.id, savePath) === null && (await fx.store.loadNationalLive("x" + (many.length - 1), savePath)).id === "x" + (many.length - 1), "anneau borné : les plus anciens directs sont remplacés");
  assert(fs.readdirSync(dir).filter(f => /\.natlive\./.test(f)).length <= fx.store.NATIONAL_LIVE_SLOTS + 1, "nombre de fichiers borné");

  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const win = dom.window, doc = win.document;

  // 1) Box score du Mode Club.
  win.showNationalBoxscore(fx.md);
  const ov = doc.getElementById("matchBoxscoreOverlay");
  assert(ov && ov.querySelector("table.boxscore"), "feuille de statistiques des matchs de club (openMatchBoxscoreModal)");
  assert(ov.querySelector(".mbx-kicker").textContent.includes("Fenêtre internationale 1"), "compétition dans l'en-tête");
  assert(ov.querySelectorAll("table.boxscore tbody tr").length >= fx.md.boxHome.length, "une ligne par joueur");
  assert(ov.querySelector(".mbx-tactics") && ov.querySelector(".quarter-scores-table"), "tactiques jouées et quarts-temps");
  assert(ov.querySelector("#matchReplayBtn") && !ov.querySelector(".mbx-replay .prm-badge"), "« Revoir le direct » (sans Premium)");

  // 2) Direct : écran des clubs (spectateur), sélections invitées.
  const calls = [];
  win.fetchApi = async url => { calls.push(url); return { ok: true, json: async () => JSON.parse(JSON.stringify(fx.live)) }; };
  ov.querySelector("#matchReplayBtn").click();
  await wait(() => doc.getElementById("spectateOverlay"), "écran du direct");
  assert(calls[0] === "/api/national/live?id=" + encodeURIComponent(fx.m1.id), "route /api/national/live");
  const sp = doc.getElementById("spectateOverlay");
  assert(/Sélections nationales/.test(sp.textContent) && sp.textContent.includes(fx.live.teamName), "direct : compétition et sélections");
  assert(win.eval("league.teams[" + fx.live.watchIdx + "].isGuest && league.teams[" + (fx.live.watchIdx + 1) + "].players.length > 0"), "sélections installées comme invités");
  win.closeSpectateMatch();

  // 3) Boutons du direct (pages Sélections et mode Sélectionneur).
  const N = win.HM_NATIONAL, now = Date.now();
  assert(/Voir le direct/.test(N.liveBtnHtml({ id: "a", status: "live", at: now - 600e3 })), "match en cours : « Voir le direct »");
  assert(/Suivre le match/.test(N.liveBtnHtml({ id: "a", status: "scheduled", at: now + 1800e3 })), "coup d'envoi dans l'heure : « Suivre le match »");
  assert(N.liveBtnHtml({ id: "a", status: "scheduled", at: now + 86400e3 }) === "" && N.liveBtnHtml({ id: "a", status: "played", at: now - 86400e3 }) === "", "ni plus tôt ni après");
  const tv = { team: { id: "fr-A" }, qualif: { matches: [{ id: "q1", home: "fr-A", away: "de-A", status: "live", at: now - 600e3 }] }, finals: null, friendlies: [] };
  assert(N.liveMatchOf(tv).id === "q1", "match de la sélection en direct trouvé");
  dom.window.close();
  server.close();
  console.log("\n🏁 national_live_ui_test.js : direct et box score des matchs internationaux conformes.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
