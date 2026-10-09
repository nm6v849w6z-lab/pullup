// Barrage de relégation EN DIRECT (retour utilisateur : « barrage en 1 match
// sec ») : 7e contre 8e, programmé au premier créneau des play-offs (mardi
// 20:00), diffusé en direct si un manager y joue, résultat à la fin de la
// diffusion (fil d'actualité), perdant relégable. Voir
// League.scheduleRelegationBarrage/resolveRelegationBarrage (engine.js),
// server/autoSim.js:stepRelegationBarrage, moteurbasket3.html.
const assert = require("assert");
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const AutoSim = require("./server/autoSim.js");
const store = require("./server/store.js");
const { startTestServer, openGame, patchDateNow } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const ok = m => console.log("✅ " + m);
const H = 3600 * 1000;
const fmt = (ms, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
const wait = async (cond, what) => { for (let i = 0; i < 100; i++) { if (cond()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error(`délai dépassé : ${what}`); };

(async () => {
  const created = Date.UTC(2026, 8, 27, 9);
  const career = store.createMultiManagerCareer(["Lyon Barrage", "Paris Barrage"], created, "Lyon Barrage");
  const league = career.league;
  league.calendarDailyAnchored = true; league.calendarWeeklyRhythm = true;
  league.calendarStartAt = Calendar.weeklyRhythmCalendarStartAt(created);
  league.cup = null;
  let t = created;
  for (let i = 0; i < 400 && !league.relegationBarrage; i++) { t += 6 * H; AutoSim.catchUpLeague(league, t); }
  const b = league.relegationBarrage;
  assert.ok(b && b.pending && b.winner == null, "barrage programmé, pas encore joué");
  const table = league.standings();
  assert.strictEqual(b.idx7, table[6].idx); assert.strictEqual(b.idx8, table[7].idx);
  assert.strictEqual(b.at, Calendar.scheduledTimeForLeagueRound(league, league.totalRounds));
  assert.strictEqual(fmt(b.at, "Europe/Paris"), "Tue 20:00");
  assert.deepStrictEqual(league.relegatedTeamIndexes().length, 2, "perdant pas encore connu");
  ok(`barrage programmé : ${league.teams[b.idx7].name} (7e) reçoit ${league.teams[b.idx8].name} (8e) mardi 20:00, au premier créneau des play-offs`);

  // Le 7e devient un club de manager (pour la diffusion en direct).
  const t7 = league.teams[b.idx7];
  t7.isHuman = true; t7.managerLinkToken = Engine.randomHexToken(24); t7.feed = t7.feed || Engine.createFeed();
  const clock = { now: b.at - 2 * H };
  const { server, multiSavePath, baseUrl } = await startTestServer(() => clock.now);
  await store.saveMultiLeague(league, multiSavePath);
  // Depuis le 2026-09-29, le barrage n'a lieu que s'il a un enjeu (3
  // championnats ouverts juste en dessous) : on les déclare dans le monde.
  {
    const World = require("./server/world.js");
    const world = await World.loadWorld(multiSavePath, clock.now);
    const top = world.leagues.find(e => e.id === store.HISTORIC_LEAGUE_ID);
    [0, 1, 2].forEach(g => world.leagues.push({ id: `fr-test-2${g}`, country: top.country, level: top.level + 1, group: top.group * 3 + g, createdAt: clock.now }));
    await World.saveWorld(world, multiSavePath);
  }

  // 1) Avant : écran de préparation « Barrage », ligne au calendrier.
  let dom = await openGame(html, `${baseUrl}?m=${t7.managerLinkToken}`, w => patchDateNow(w, () => clock.now));
  let win = dom.window, doc = win.document;
  const errors = [];
  win.addEventListener("error", e => errors.push(e.message));
  if (win.eval("currentVisiblePageId()") === "catchupSection") doc.getElementById("catchupContinueBtn").click();
  win.eval("TAB_HANDLERS.ordres()");
  const cm = win.eval("JSON.stringify(currentMatch)");
  assert.ok(/"barrage":true/.test(cm), `currentMatch = barrage (${cm})`);
  assert.ok(/Barrage/.test(doc.body.textContent), "libellé Barrage sur l'écran de préparation");
  doc.getElementById("ordresValidateBtn").click();
  await wait(() => /enregistr/i.test((doc.getElementById("ordresValidateFeedback") || {}).textContent || "") || win.eval("currentVisiblePageId()") === "calendrierSection", "validation des ordres du barrage");
  const fb = (doc.getElementById("ordresValidateFeedback") || {}).textContent || "";
  assert.ok(!/refus|erreur|invalide/i.test(fb), `ordres du barrage : ${fb}`);
  win.eval("TAB_HANDLERS.calendrier()");
  assert.ok(/Barrage/.test(doc.getElementById("calendrierContent").textContent), "barrage au calendrier");
  assert.ok(!errors.length, errors.join(" | "));
  ok("avant le match : écran de préparation du barrage (ordres validés), ligne « Barrage » au calendrier");
  dom.window.close();

  // 2) Coup d'envoi : direct.
  clock.now = b.at + 5 * 60 * 1000;
  dom = await openGame(html, `${baseUrl}?m=${t7.managerLinkToken}`, w => patchDateNow(w, () => clock.now));
  win = dom.window; doc = win.document;
  if (win.eval("currentVisiblePageId()") === "catchupSection") doc.getElementById("catchupContinueBtn").click();
  await wait(() => win.eval("!!(league.liveMatch && currentLiveMatch)"), "direct du barrage");
  assert.ok(win.eval("league.liveMatch.barrage === true"));
  assert.strictEqual(win.eval("document.getElementById('nameB').textContent"), league.teams[b.idx8].name);
  ok("coup d'envoi : barrage diffusé en direct pour le manager du 7e");
  dom.window.close();

  // 3) Fin de la diffusion : résultat, perdant relégable, fil d'actualité.
  clock.now = b.at + Calendar.MATCH_BROADCAST_DURATION_MS + 60 * 1000;
  const res = await fetch(new URL("/api/state", baseUrl), { headers: { "X-TipIn-Token": t7.managerLinkToken } });
  assert.strictEqual(res.status, 200);
  const saved = (await store.loadMultiLeague(multiSavePath)).league;
  const rb = saved.relegationBarrage;
  assert.ok(!rb.pending && rb.winner != null && rb.loser != null && rb.scoreHome !== rb.scoreAway);
  assert.ok(!(saved.liveMatches || {})[AutoSim.barrageLiveKey(saved)], "diffusion retirée");
  assert.ok(saved.relegatedTeamIndexes().includes(rb.loser));
  const feed = saved.teams[b.idx7].feed.entries.find(e => /^Barrage/.test(e.title));
  assert.ok(feed, "fil d'actualité du barrage");
  ok(`fin : ${rb.scoreHome}-${rb.scoreAway}, ${saved.teams[rb.loser].name} relégable, « ${feed.title} » au fil d'actualité`);

  // 4) Rattrapage tardif (serveur endormi) : barrage simulé d'un coup.
  const lg2 = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(league))));
  lg2.relegationBarrage = { ...b, pending: true, started: false, winner: null, loser: null };
  AutoSim.catchUpLeague(lg2, b.at + 5 * 24 * H);
  assert.ok(!lg2.relegationBarrage.pending && lg2.relegationBarrage.loser != null, "joué d'un coup en retard");
  const lg3 = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(league))));
  lg3.relegationBarrage = { ...b, pending: true, started: false, winner: null, loser: null };
  lg3.runRelegationBarrage();
  assert.ok(!lg3.relegationBarrage.pending && lg3.relegationBarrage.idx7 === b.idx7, "montées/descentes : barrage résolu à la demande avec les mêmes clubs");
  ok("rattrapage tardif et calcul des montées/descentes : barrage joué d'un coup avec les mêmes clubs");

  server.close();
  console.log("\n🏁 barrage_live_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
