// Supercoupe (retour utilisateur 2026-09-28 : « supercoupes », Division I
// seulement) : samedi 20:00 de la semaine d'intersaison, champion de
// Division I contre vainqueur de la Coupe nationale (ou finaliste si c'est
// le même club), en direct, handicap comme en Coupe, prime, trophée,
// palmarès du pays. Voir server/nationalCup.js (createSuperCup,
// stepSuperCup, projectSuperCup), server/world.js (catchUpWorld) et
// superCupCardHtml (moteurbasket3.html).
// Saison entière simulée sans visite des managers : pas de libération des clubs inactifs ici.
process.env.BASKET_INACTIVE_RELEASE_DAYS = process.env.BASKET_INACTIVE_RELEASE_DAYS || "100000";
const assert = require("assert");
const fs = require("fs");
const store = require("./server/store.js");
const World = require("./server/world.js");
const Calendar = require("./server/calendar.js");
const NC = require("./server/nationalCup.js");
const { startTestServer, openGame, patchDateNow } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const ok = m => console.log("✅ " + m);
const H = 3600 * 1000;
const fmt = (ms, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
const wait = async (cond, what) => { for (let i = 0; i < 100; i++) { if (cond()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error(`délai dépassé : ${what}`); };

(async () => {
  const t0 = Date.now();
  // 0) Finaliste : même club champion de D I et vainqueur de Coupe.
  {
    const ref = (id, idx, level) => ({ leagueId: id, idx, name: `C${id}${idx}`, level });
    const cup = { season: 1, champion: ref("fr-1", 3, 1), rounds: [{ matches: [{ home: ref("fr-1", 3, 1), away: ref("fr-2.1", 5, 2), resolved: true, winner: "home", bye: false }] }] };
    const d1 = { playoffs: { champion: 3 }, teams: Array.from({ length: 10 }, (_, i) => ({ name: `Cfr-1${i}` })) };
    const sc = NC.createSuperCup("fr", 1, { id: "fr-1", level: 1 }, d1, cup, 123);
    assert.strictEqual(sc.away.leagueId, "fr-2.1", "finaliste quand le champion a aussi gagné la Coupe");
    assert.deepStrictEqual(sc.handicap, { home: 0, away: 7 });
    ok("champion de D I = vainqueur de la Coupe → le finaliste joue la Supercoupe (handicap +7 pour la D II)");
  }

  const created = Date.UTC(2026, 8, 27, 9);
  const clock = { now: created };
  const { server, multiSavePath, baseUrl } = await startTestServer(() => clock.now);
  const career = store.createMultiManagerCareer(["Lyon Super", "Paris Super"], created, "Lyon Super");
  career.league.calendarDailyAnchored = true; career.league.calendarWeeklyRhythm = true;
  career.league.calendarStartAt = Calendar.weeklyRhythmCalendarStartAt(created);
  career.league.cup = null;
  await store.saveMultiLeague(career.league, multiSavePath);
  const w = await World.loadWorld(multiSavePath, created);
  for (let i = 0; i < 8; i++) await World.assignClub(w, multiSavePath, { country: "fr", clubName: `FR Super ${i}`, now: created });
  await World.assignClub(w, multiSavePath, { country: "fr", clubName: "Rennes Super", now: created });
  const leagues = new Map();
  for (const e of World.leaguesOfCountry(w, "fr")) leagues.set(e.id, await World.loadLeague(w, e.id, multiSavePath));
  w.cups = { fr: NC.createNationalCup("fr", World.leaguesOfCountry(w, "fr"), leagues, 1) };
  await World.saveWorld(w, multiSavePath);

  // 1) Toute la saison jusqu'à la programmation de la Supercoupe.
  let t = created, scheduled = null;
  for (let i = 0; i < 400 && !scheduled; i++) {
    t += 6 * H;
    const evs = await World.catchUpWorld(multiSavePath, t);
    scheduled = evs.find(e => e.type === "super-cup-scheduled" && e.country === "fr");
    assert.ok(!evs.some(e => e.type === "country-new-season"), "la Supercoupe est programmée avant la reprise");
  }
  assert.ok(scheduled, "Supercoupe programmée à l'intersaison");
  let ww = await World.loadWorld(multiSavePath, t);
  const sc = ww.superCups.fr;
  const fr1 = await World.loadLeague(ww, "fr-1", multiSavePath);
  assert.strictEqual(sc.home.name, fr1.teams[fr1.playoffs.champion].name, "champion de Division I à domicile");
  const cupWinner = ww.cups.fr.champion;
  if (cupWinner.name !== sc.home.name) assert.strictEqual(sc.away.name, cupWinner.name, "vainqueur de la Coupe");
  else assert.strictEqual(sc.away.name, NC.cupFinalist(ww.cups.fr).name, "finaliste");
  assert.strictEqual(fmt(sc.at, "Europe/Paris"), "Sat 20:00");
  const restart = Calendar.scheduledTimeForLeagueEconomyTick(fr1, (fr1.lastEconomyTick || 0) + 1);
  assert.ok(sc.at < restart && restart - sc.at < 3 * 24 * H, "le samedi avant la reprise");
  assert.ok(fr1.seasonEndTickDone, "pendant l'intersaison");
  ok(`Supercoupe programmée samedi 20:00 (intersaison) : ${sc.home.name} (champion D I) contre ${sc.away.name}${cupWinner.name === sc.home.name ? " (finaliste)" : " (vainqueur de la Coupe)"}`);

  // 2) Navigateur du champion : carte sur la page Coupe, ligne au calendrier.
  const token = fr1.teams[fr1.playoffs.champion].managerLinkToken;
  clock.now = sc.at - 3 * H;
  let dom = await openGame(html, `${baseUrl}?m=${token}`, win => patchDateNow(win, () => clock.now));
  let win = dom.window, doc = win.document;
  win.eval("TAB_HANDLERS.coupe()");
  const card = doc.querySelector("#coupeContent .scup-card");
  assert.ok(card && card.textContent.includes(sc.home.name) && card.textContent.includes(sc.away.name) && /Supercoupe/.test(card.textContent), "carte Supercoupe sur la page Coupe");
  win.eval("TAB_HANDLERS.calendrier()");
  assert.ok(/Supercoupe/.test(doc.getElementById("calendrierContent").textContent), "Supercoupe au calendrier");
  ok("page Coupe : carte Supercoupe ; calendrier : ligne Supercoupe");
  dom.window.close();

  // 3) Coup d'envoi : direct pour le champion (manager).
  clock.now = sc.at + 5 * 60 * 1000;
  await World.catchUpWorld(multiSavePath, clock.now);
  ww = await World.loadWorld(multiSavePath, clock.now);
  assert.ok(ww.superCups.fr.started && !ww.superCups.fr.resolved);
  dom = await openGame(html, `${baseUrl}?m=${token}`, w2 => patchDateNow(w2, () => clock.now));
  win = dom.window; doc = win.document;
  // Récapitulatif d'absence d'abord (s'il y en a un), puis le direct.
  if (win.eval("currentVisiblePageId()") === "catchupSection") doc.getElementById("catchupContinueBtn").click();
  await wait(() => win.eval("!!(league.liveMatch && currentLiveMatch)"), "direct de Supercoupe");
  const lm = win.eval("({ c: league.liveMatch.competition, r: league.liveMatch.round, nb: document.getElementById('nameB').textContent })");
  assert.strictEqual(lm.c, "cup"); assert.strictEqual(lm.r, NC.SUPERCUP_ROUND);
  assert.strictEqual(lm.nb, sc.away.name);
  win.eval("TAB_HANDLERS.calendrier()");
  win.eval("TAB_HANDLERS.coupe()");
  ok(`direct de la Supercoupe : ${sc.home.name} contre ${lm.nb}`);
  dom.window.close();

  // 4) Fin : vainqueur, prime, trophée, palmarès.
  clock.now = sc.at + Calendar.MATCH_BROADCAST_DURATION_MS + 60 * 1000;
  await World.catchUpWorld(multiSavePath, clock.now);
  ww = await World.loadWorld(multiSavePath, clock.now);
  const done = ww.superCups.fr;
  assert.ok(done.resolved && done.winner);
  const winRef = done.winner === "home" ? done.home : done.away;
  const lgW = await World.loadLeague(ww, winRef.leagueId, multiSavePath);
  const winner = lgW.teams[winRef.idx];
  assert.ok((winner.trophies || []).some(tr => tr.type === "super-cup"), "trophée de Supercoupe");
  if (winner.isHuman) assert.ok((winner.transactions || []).some(tr => tr.label === "Prime de Supercoupe" && tr.amount === NC.SUPERCUP_WIN_BONUS), "prime de Supercoupe");
  assert.strictEqual(ww.history.fr[0].superCupWinner, winRef.name);
  const lgHome = await World.loadLeague(ww, "fr-1", multiSavePath);
  assert.ok(!(lgHome.liveMatches || {})[NC.superCupLiveKey(done)], "diffusion retirée");
  const cupChampLg = await World.loadLeague(ww, ww.cups.fr.champion.leagueId, multiSavePath);
  assert.ok((cupChampLg.teams[ww.cups.fr.champion.idx].trophies || []).some(tr => tr.type === "national-cup"), "trophée de Coupe nationale");
  ok(`fin : ${winRef.name} remporte la Supercoupe (trophée${winner.isHuman ? `, prime de ${NC.SUPERCUP_WIN_BONUS} €` : ""}), palmarès du pays mis à jour ; trophée du vainqueur de la Coupe nationale`);

  // 4bis) Stats des joueurs (2026-09-30) : journal de matchs (tour
  // SUPERCUP_ROUND, comme la Coupe) des deux côtés, feuille de match.
  {
    const lgA = await World.loadLeague(ww, done.away.leagueId, multiSavePath);
    const sides = [[lgHome.teams[done.home.idx], "home"], [lgA.teams[done.away.idx], "away"]];
    sides.forEach(([t, side]) => {
      const entries = t.players.flatMap(p => (p.matchLog || []).filter(m => m.competition === "cup" && m.round === NC.SUPERCUP_ROUND));
      assert.ok(entries.length >= 5, `${side} : ${entries.length} lignes de stats de Supercoupe`);
    });
    const pts = t => t.players.reduce((s, p) => s + (p.matchLog || []).filter(m => m.competition === "cup" && m.round === NC.SUPERCUP_ROUND).reduce((a, m) => a + (m.pts || 0), 0), 0);
    assert.strictEqual(pts(lgHome.teams[done.home.idx]), done.result.scoreHome, "points des joueurs = score (hors handicap)");
    assert.ok(done.statsRecorded, "stats enregistrées une seule fois");
    // Navigateur : feuille de match depuis la carte Supercoupe (page Coupe).
    dom = await openGame(html, `${baseUrl}?m=${token}`, w2 => patchDateNow(w2, () => clock.now));
    win = dom.window; doc = win.document;
    if (win.eval("currentVisiblePageId()") === "catchupSection") doc.getElementById("catchupContinueBtn").click();
    win.eval("TAB_HANDLERS.coupe()");
    const scoreBtn = doc.querySelector(`#coupeContent .scup-card [data-boxscore-round="${NC.SUPERCUP_ROUND}"]`);
    assert.ok(scoreBtn, "score de la Supercoupe cliquable (feuille de match)");
    scoreBtn.click();
    const ov = doc.getElementById("matchBoxscoreOverlay");
    assert.ok(ov && /Supercoupe/.test(ov.textContent) && ov.textContent.includes(sc.home.name), "feuille de match de la Supercoupe");
    win.eval("closeMatchBoxscore()");
    win.eval("TAB_HANDLERS.calendrier()");
    assert.ok(doc.querySelector(`#calendrierContent [data-boxscore-round="${NC.SUPERCUP_ROUND}"]`), "calendrier : score de la Supercoupe cliquable");
    // Fiche d'un joueur : la Supercoupe dans ses derniers matchs.
    const star = lgHome.teams[done.home.idx].players.find(p => (p.matchLog || []).some(m => m.round === NC.SUPERCUP_ROUND));
    win.eval(`showPlayerDetail(${done.home.idx}, ${star.id})`);
    assert.ok(/Supercoupe/.test(doc.getElementById("playerDetailContent").textContent), "fiche joueur : ligne Supercoupe");
    dom.window.close();
    ok("Supercoupe : stats des joueurs dans leur journal de matchs (tour Supercoupe, comme la Coupe), feuille de match depuis la page Coupe et le calendrier, ligne sur la fiche joueur");
  }

  // 5) Reprise le lundi : saison 2, la Supercoupe reste au palmarès.
  const evs = await World.catchUpWorld(multiSavePath, restart + 60 * 1000);
  assert.ok(evs.some(e => e.type === "country-new-season" && e.seasonNumber === 2));
  ww = await World.loadWorld(multiSavePath, restart + 60 * 1000);
  assert.strictEqual(ww.history.fr[0].superCupWinner, winRef.name);
  ok("reprise lundi : saison 2, palmarès conservé");

  server.close();
  console.log(`\n🏁 super_cup_test.js : tout est vert (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
