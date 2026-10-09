// Mémoire historique des franchises (assets/history.js, 2026-10-06) :
// événements nés de vrais matchs (remontée, buzzer-beater, prolongations),
// rivalités partagées 0-100 avec déclin, légendes calculées, journal rangé
// à part par club (jamais dans la ligue), API /api/history/club, page
// « Histoire du club » complétée (Chronologie, Légendes, Rivalités,
// Managers) et narration d'avant-match tirée des seuls faits enregistrés.
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-hist";
const fs = require("fs");
const Engine = require("./engine.js");
const store = require("./server/store.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const H = Engine.History;
const check = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };
const wait = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 100)); } throw new Error("❌ attente : " + label); };

(async () => {
  // 1) Moteur : des événements uniquement issus des matchs simulés.
  H.drain();
  const career = store.createMultiManagerCareer(["Lyon Histoire", "Paris Histoire"], Date.now(), "Lyon Histoire");
  const a = career.league.teams[0], b = career.league.teams[1];
  let now = Date.now();
  for (let i = 0; i < 200; i++) {
    const home = i % 2 ? a : b, away = i % 2 ? b : a;
    const r = Engine.simulateOrForfeit(home, away, now);
    if (!r.forfeit) Engine.recordMatchStatsAndAwardMvp(home, away, i, "championship", now, r.quarterScores, r.tacticsUsed, r.seed);
    now += 3600e3;
  }
  const evs = H.drain();
  check(evs.length > 0 && evs.every(e => e.event_id && e.event_type && e.importance >= 1 && e.importance <= 4 && e.team_ids.length && e.description), "événements au format du journal (event_id, type, importance 1-4, clubs, description)");
  check(evs.filter(e => e.event_type === "COMEBACK").every(e => /renverse un retard de (\d+) points/.test(e.description) && Number(/(\d+) points/.exec(e.description)[1]) >= H.CFG.comebackMin), "remontées : retard réellement comblé (≥ 15 points)");
  check(evs.some(e => e.event_type === "RIVALRY_CREATED"), "rivalité née des confrontations répétées");
  const ra = a.rivalryScores[b.name.toLowerCase()], rb = b.rivalryScores[a.name.toLowerCase()];
  check(ra && rb && ra.s === rb.s && ra.w === rb.l && ra.l === rb.w, "rivalité partagée : même intensité, bilans miroirs");
  const later = H.rivalryOf(a, b.name, now + 4 * H.CFG.rivalryDecayMs);
  check(later.s < ra.s, `déclin sans nouvel épisode (${ra.s} → ${later.s})`);
  check(H.rivalryLabel(10) === "Faible" && H.rivalryLabel(30) === "Modérée" && H.rivalryLabel(50) === "Forte" && H.rivalryLabel(70) === "Intense" && H.rivalryLabel(90) === "Légendaire", "échelle Faible → Légendaire");

  // Drame lu dans le fil du match : buzzer-beater.
  const fake = [
    { quarter: 4, clock: "00:20", score: { A: 80, B: 80 } },
    { quarter: 4, clock: "00:02", score: { A: 80, B: 83 }, shooter: "Tireur", shooterId: 7 },
  ];
  const d = H.dramaFromEvents(fake, 80, 83);
  check(d && d.buzzer && d.buzzer.playerId === 7 && d.winner === "B", "buzzer-beater détecté (dernier panier à 2 s, vainqueur pas devant avant)");
  check(!H.dramaFromEvents([{ quarter: 4, clock: "00:30", score: { A: 80, B: 83 } }], 80, 83).buzzer, "pas de buzzer-beater inventé (panier à 30 s)");

  // Légendes : paliers.
  check(!H.legendTier({ games: 20, pts: 100, seasons: [1] }), "pas de légende après 20 matchs");
  check(H.legendTier({ games: 300, pts: 4000, seasons: [1, 2, 3, 4, 5], titles: 2 }).label === "Légende", "légende après 5 saisons, 300 matchs et 2 titres");

  // Records de franchise : seulement après une première saison archivée.
  a.seasonHistory = [{ seasonNo: 1 }];
  a.clubRecords = { playerPoints: { value: 30 }, playerRebounds: { value: 30 }, playerAssists: { value: 30 } };
  a.franchiseBests = null; a.isHuman = true;
  const p = a.players[0];
  p.secondsPlayed = 1200; p.stats = { pts: 10, reb: 1, ast: 1 };
  Engine.recordMatchStatsAndAwardMvp(a, b, 300, "friendly", now, null, null, null);
  check(!H.drain().length, "amical : aucun événement historique");
  const r1 = Engine.simulateOrForfeit(a, b, now);
  H.drain();
  // initialisation silencieuse, puis record battu.
  Engine.recordMatchStatsAndAwardMvp(a, b, 301, "championship", now, r1.quarterScores, null, r1.seed);
  H.drain();
  a.players.forEach(x => { x.secondsPlayed = 0; });
  p.secondsPlayed = 1200; p.stats = { pts: Math.max(31, (a.franchiseBests.pts.value || 0) + 1), reb: 0, ast: 0 };
  Engine.recordMatchStatsAndAwardMvp(a, b, 302, "championship", now, { home: [20, 20, 20, 20], away: [10, 10, 10, 10] }, null, null);
  const rec = H.drain().filter(e => e.event_type === "RECORD");
  check(rec.length === 1 && /Nouveau record de franchise/.test(rec[0].description) && rec[0].team_ids[0] === a.name, `record de franchise : ${rec[0] && rec[0].description}`);

  // 2) Stockage à part (un journal par club) + API.
  const { server, baseUrl, token, multiSavePath } = await startTestServer();
  H.push({ type: "TITLE", importance: 4, season: 1, at: Date.now(), teams: ["Club Témoin"], description: "Champion (Division I)." });
  H.push({ type: "BUZZER_BEATER", importance: 3, season: 1, at: Date.now() + 1, teams: ["Club Témoin", "Autre Club"], description: "Buzzer-beater : X offre la victoire à Club Témoin." });
  await store.flushHistoryQueue(multiSavePath);
  const logT = await store.loadClubHistory("Club Témoin", multiSavePath), logO = await store.loadClubHistory("autre club", multiSavePath);
  check(logT.length === 2 && logO.length === 1, "journal par club : l'événement partagé est dans les deux journaux");
  await store.appendClubHistory("Club Témoin", logT, multiSavePath);
  check((await store.loadClubHistory("Club Témoin", multiSavePath)).length === 2, "aucun doublon (event_id)");
  const api = await fetch(baseUrl.replace(/\/?(\?.*)?$/, "/") + "api/history/club?club=" + encodeURIComponent("Club Témoin"), { headers: { "X-TipIn-Token": token } }).then(r => r.json());
  check(api.ok && api.events.length === 2 && api.events[0].event_type === "BUZZER_BEATER", "API : journal du club, plus récent d'abord");

  // 3) Page « Histoire du club ».
  const dom = await openGame(html, `${baseUrl}?m=${token}`);
  await dom.window.__gameReady; await flush(dom);
  const win = dom.window, doc = win.document;
  const myName = win.eval("teamA.name");
  H.push({ type: "COMEBACK", importance: 2, season: 1, at: Date.now(), teams: [myName, "Autre Club"], description: `${myName} renverse un retard de 18 points face à Autre Club (75-70).` });
  await store.flushHistoryQueue(multiSavePath);
  win.eval("histoireEvents = null; histoireEventsClub = null; histoireView = 'chrono'; TAB_HANDLERS.histoire()");
  await wait(() => /renverse un retard de 18 points/.test(doc.getElementById("hcTimelineBody").textContent), "chronologie chargée");
  check(doc.querySelector("#hcTimeline .hc-tag").textContent.trim() === "Remontée", "chronologie : type d'événement en étiquette");
  win.eval(`teamA.rivalryScores = { "autre club": { name: "Autre Club", s: 72, at: Date.now(), w: 5, l: 3, created: true, moments: [{ season: 1, type: "FINAL", text: "${myName} a battu Autre Club en finale des play-offs (2-1), saison 1." }] } }`);
  doc.querySelector('[data-hc-view="rivalites"]').click();
  const rivTxt = doc.getElementById("hcRivalries").textContent;
  check(/Autre Club/.test(rivTxt) && /Intense · 72/.test(rivTxt) && /5 V – 3 D/.test(rivTxt), "rivalités : intensité, libellé, bilan");
  doc.querySelector('[data-hc-view="legendes"]').click();
  check(!!doc.getElementById("hcLegends"), "onglet Légendes");
  doc.querySelector('[data-hc-view="managers"]').click();
  check(/En poste/.test(doc.getElementById("hcManagers").textContent), "onglet Managers : manager actuel");

  // 4) Narration d'avant-match : faits enregistrés seulement.
  const me = { name: "Lyon", allTimePlayers: { 9: { id: 9, games: 300, pts: 4000, seasons: [1, 2, 3, 4], titles: 2 } }, rivalryScores: { paris: { name: "Paris", s: 70, at: Date.now(), w: 6, l: 4, moments: [{ type: "FINAL", text: "Lyon a battu Paris en finale des play-offs (2-1), saison 2." }] } } };
  const opp = { name: "Paris", players: [{ id: 9, name: "Marc Dupont" }, { id: 10, name: "Inconnu" }] };
  const lines = H.prematchLines(me, opp, Date.now());
  check(lines.some(l => /Marc Dupont/.test(l) && /affronte son ancien club/.test(l)) && lines.some(l => /finale des play-offs/.test(l)) && !lines.some(l => /Inconnu/.test(l)), "avant-match : retour d'une légende, dernière finale, rien d'inventé");
  check(H.prematchLines({ name: "A" }, { name: "B", players: [] }, Date.now()).length === 0, "avant-match : aucun fait → aucune phrase");

  dom.window.close(); server.close();
  console.log("\n🏁 franchise_history_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
