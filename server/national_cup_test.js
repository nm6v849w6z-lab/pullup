"use strict";
// Coupe nationale (retour utilisateur 2026-09-28) : tous les clubs du pays,
// exempts aux divisions les plus hautes, handicap +7 par division d'écart
// (plafond +21), un tour le jeudi 20:00 heure locale, diffusion en direct
// déposée dans la ligue de chaque manager (adversaire d'un autre championnat
// = « club invité »), stats/MVP des deux côtés, primes par match gagné,
// champion au palmarès. Voir server/nationalCup.js et server/world.js.
// Saison entière simulée sans visite des managers : pas de libération des clubs inactifs ici.
process.env.BASKET_INACTIVE_RELEASE_DAYS = process.env.BASKET_INACTIVE_RELEASE_DAYS || "100000";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Engine = require("../engine.js");
const Calendar = require("./calendar.js");
const store = require("./store.js");
const World = require("./world.js");
const NC = require("./nationalCup.js");

const H = 3600 * 1000, D = 24 * H;
const ok = m => console.log("✅ " + m);
const fmt = (ms, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));

// 0) Tirage et handicap (unitaire).
{
  assert.deepStrictEqual(NC.handicapFor({ level: 1 }, { level: 2 }), { home: 0, away: 7 });
  assert.deepStrictEqual(NC.handicapFor({ level: 5 }, { level: 1 }), { home: 21, away: 0 });
  assert.deepStrictEqual(NC.handicapFor({ level: 2 }, { level: 2 }), { home: 0, away: 0 });
  const leagues = new Map();
  const entries = [];
  [[1, 0], [2, 0], [2, 1]].forEach(([level, group]) => {
    const lg = Engine.generateCountryLeague("fr", level, group, Date.UTC(2026, 8, 27, 9), new Set([...leagues.values()].flatMap(l => l.teams.map(t => t.name))));
    leagues.set(lg.leagueId, lg);
    entries.push({ id: lg.leagueId, country: "fr", level, group });
  });
  const cup = NC.createNationalCup("fr", entries, leagues, 1);
  assert.strictEqual(cup.totalRounds, 5, "30 clubs → tableau de 32, 5 tours");
  const r0 = cup.rounds[0];
  const byes = r0.matches.filter(m => m.bye);
  assert.strictEqual(byes.length, 2);
  assert.ok(byes.every(m => m.home.level === 1), "exempts pour la Division I");
  assert.strictEqual(r0.matches.filter(m => !m.bye).length, 14);
  r0.matches.filter(m => !m.bye).forEach(m => assert.deepStrictEqual(m.handicap, NC.handicapFor(m.home, m.away)));
  assert.strictEqual(NC.stageKey(r0.stageFromEnd), "seiziemes");
  ok("tirage : 30 clubs → 32 places, 2 exempts pour la Division I, 14 matchs de seizièmes, handicap +7 par division d'écart (plafond +21)");
}

(async () => {
  const t0 = Date.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ncup-"));
  const multi = path.join(dir, "multi-league.json");
  const created = Date.UTC(2026, 8, 27, 9);
  const career = store.createMultiManagerCareer(["Lyon Coupe", "Paris Coupe"], created, "Lyon Coupe");
  career.league.calendarDailyAnchored = true; career.league.calendarWeeklyRhythm = true;
  career.league.calendarStartAt = Calendar.weeklyRhythmCalendarStartAt(created);
  career.league.cup = null; // la Coupe interne cède la place à la nationale
  await store.saveMultiLeague(career.league, multi);
  const w = await World.loadWorld(multi, created);
  for (let i = 0; i < 8; i++) await World.assignClub(w, multi, { country: "fr", clubName: `FR Coupe ${i}`, now: created });
  const d2 = await World.assignClub(w, multi, { country: "fr", clubName: "Rennes Coupe", now: created });
  assert.strictEqual(d2.leagueId, "fr-2.1");
  // Coupe nationale de la saison 1 (en jeu réel : créée à chaque nouvelle saison).
  const leagues = new Map();
  for (const e of World.leaguesOfCountry(w, "fr")) leagues.set(e.id, await World.loadLeague(w, e.id, multi));
  w.cups = { fr: NC.createNationalCup("fr", World.leaguesOfCountry(w, "fr"), leagues, 1) };
  {
    // Rennes (seul manager hors Division I) joue le 1er tour plutôt que d'être exempt.
    const ms = w.cups.fr.rounds[0].matches;
    const mine = ms.find(m => m.home.leagueId === "fr-2.1" && m.home.name === "Rennes Coupe" && m.bye);
    const other = ms.find(m => !m.bye && m.home.level === 2);
    if (mine && other) { const tmp = mine.home; mine.home = other.home; other.home = tmp; }
  }
  await World.saveWorld(w, multi);
  const cup0 = w.cups.fr;
  assert.strictEqual(cup0.totalRounds, 5);

  const fr1 = leagues.get("fr-1");
  const kick0 = Calendar.scheduledTimeForLeagueCupRound(fr1, 0);
  assert.strictEqual(fmt(kick0, "Europe/Paris"), "Thu 20:00");

  // 1) Coup d'envoi du 1er tour : diffusion chez les managers concernés.
  await World.catchUpWorld(multi, kick0 + 5 * 60 * 1000);
  let ww = await World.loadWorld(multi, kick0);
  const r0 = ww.cups.fr.rounds[0];
  assert.ok(r0.matches.filter(m => !m.bye).every(m => m.started), "tous les matchs du tour lancés");
  assert.ok(!r0.resolved, "pas encore de résultat pendant la diffusion");
  const humanMatches = [];
  for (const m of r0.matches.filter(x => !x.bye)) {
    for (const [side, ref, oppRef] of [["home", m.home, m.away], ["away", m.away, m.home]]) {
      const lg = await World.loadLeague(ww, ref.leagueId, multi);
      if (!lg.teams[ref.idx].isHuman) continue;
      const live = lg.liveMatches && lg.liveMatches[NC.liveKey(ww.cups.fr, r0, m)];
      assert.ok(live, `diffusion déposée pour ${ref.name}`);
      assert.strictEqual(live.competition, "cup");
      assert.strictEqual(side === "home" ? live.homeIdx : live.awayIdx, ref.idx);
      if (oppRef.leagueId !== ref.leagueId) {
        assert.strictEqual(side === "home" ? live.awayIdx : live.homeIdx, NC.guestIdxForRound(0));
        assert.ok(live.guest && live.guest.team && live.guest.team.players.length >= 5 && live.guest.team.name === oppRef.name, "club invité joint à la diffusion");
        assert.ok(!live.guest.team.feed, "sans son fil d'actualité");
      }
      humanMatches.push({ m, ref });
    }
  }
  assert.ok(humanMatches.length >= 1);
  ok(`coup d'envoi jeudi 20:00 : ${r0.matches.filter(m => !m.bye).length} matchs lancés, diffusion déposée chez les managers (${humanMatches.length}), adversaire d'un autre championnat joint en « club invité »`);

  // 2) Fin de la diffusion : résultats, stats, primes, tour suivant.
  const budgets = new Map();
  for (const { ref } of humanMatches) { const lg = await World.loadLeague(ww, ref.leagueId, multi); budgets.set(ref.name, lg.teams[ref.idx].budget); }
  await World.catchUpWorld(multi, kick0 + Calendar.MATCH_BROADCAST_DURATION_MS + 60 * 1000);
  ww = await World.loadWorld(multi, kick0);
  const r0b = ww.cups.fr.rounds[0];
  assert.ok(r0b.resolved, "tour résolu");
  assert.strictEqual(ww.cups.fr.rounds.length, 2, "tour suivant tiré");
  assert.strictEqual(ww.cups.fr.rounds[1].matches.length, 8);
  for (const { m, ref } of humanMatches) {
    const mm = r0b.matches.find(x => x.id === m.id);
    const lg = await World.loadLeague(ww, ref.leagueId, multi);
    const team = lg.teams[ref.idx];
    assert.ok(!(lg.liveMatches || {})[NC.liveKey(ww.cups.fr, r0b, mm)], "diffusion retirée");
    assert.ok(team.players.some(p => (p.matchLog || []).some(e => e.competition === "cup" && e.round === 0)), "stats de Coupe enregistrées");
    const won = mm.winner === (mm.home.name === ref.name ? "home" : "away");
    const gain = team.budget - budgets.get(ref.name);
    if (won) assert.ok(gain >= Engine.cupWinBonusFor(r0b.stageFromEnd), `prime de Coupe pour ${ref.name}`);
    const tot = s => s === "home" ? mm.result.scoreHome + mm.handicap.home : mm.result.scoreAway + mm.handicap.away;
    assert.strictEqual(mm.winner, tot("away") > tot("home") ? "away" : "home", "vainqueur = score + handicap");
  }
  {
    // Amicaux : les jeudis de Coupe restants sont réservés aux clubs en course.
    const Friendlies = require("./friendlies.js");
    const lg = await World.loadLeague(ww, "fr-1", multi);
    assert.ok(lg.nationalCupAlive && lg.nationalCupAlive.nextRound === 1 && lg.nationalCupAlive.teams.length > 0, "clubs en course enregistrés dans la ligue");
    const aliveIdx = lg.nationalCupAlive.teams[0];
    const times = Friendlies.officialMatchTimesFor(Engine, lg, aliveIdx);
    assert.ok(times.includes(Calendar.scheduledTimeForLeagueCupRound(lg, 1)), "jeudi du tour suivant réservé");
    const out = lg.teams.findIndex((t, i) => !lg.nationalCupAlive.teams.includes(i));
    if (out >= 0) assert.ok(!Friendlies.officialMatchTimesFor(Engine, lg, out).includes(Calendar.scheduledTimeForLeagueCupRound(lg, 1)), "jeudi libre pour un club éliminé");
  }
  ok("fin de diffusion : résultats (handicap compris), stats de Coupe et MVP enregistrés, primes versées, diffusions retirées, huitièmes tirés");

  // 3) Toute la Coupe : un champion avant la fin du championnat.
  let t = kick0 + D;
  for (let i = 0; i < 80; i++) {
    t += 12 * H;
    await World.catchUpWorld(multi, t);
    ww = await World.loadWorld(multi, t);
    if (ww.cups.fr.champion) break;
  }
  assert.ok(ww.cups.fr.champion, "un vainqueur de la Coupe");
  assert.strictEqual(ww.cups.fr.rounds.length, 5);
  assert.ok(t < fr1.calendarStartAt + 9 * 7 * D, "Coupe terminée pendant la saison régulière");
  ok(`Coupe nationale jouée en ${ww.cups.fr.rounds.length} tours (un par jeudi) : vainqueur ${ww.cups.fr.champion.name}`);

  // 4) Nouvelle saison : palmarès et nouvelle Coupe.
  for (let i = 0; i < 200; i++) {
    t += 12 * H;
    const evs = await World.catchUpWorld(multi, t);
    if (evs.some(e => e.type === "country-new-season" && e.country === "fr")) break;
  }
  ww = await World.loadWorld(multi, t);
  assert.strictEqual(ww.cups.fr.season, 2, "nouvelle Coupe pour la saison 2");
  assert.ok(ww.history.fr[0].cupWinner, "vainqueur de Coupe au palmarès");
  const fr1b = await World.loadLeague(ww, "fr-1", multi);
  assert.strictEqual(fr1b.cup, null, "plus de Coupe interne dans les championnats du monde");
  ok(`saison 2 : nouvelle Coupe nationale, palmarès « ${ww.history.fr[0].champion} / Coupe : ${ww.history.fr[0].cupWinner} », plus de Coupe interne`);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n🏁 national_cup_test.js : tout est vert (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
})().catch(e => { console.error("❌", e); process.exit(1); });
