"use strict";
// Chat de la ligue — messages automatiques (voir server/leagueChat.js,
// syncSystem/flushSystem, et server/world.js:catchUpWorld, option
// flushLeague) : play-offs (chaque match + champion), jamais la Coupe, sans
// doublon, et plus aucune perte au changement de saison même si personne
// n'a ouvert le chat.
process.env.BASKET_INACTIVE_RELEASE_DAYS = process.env.BASKET_INACTIVE_RELEASE_DAYS || "100000";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Calendar = require("./calendar.js");
const store = require("./store.js");
const World = require("./world.js");
const LeagueChat = require("./leagueChat.js");

const ok = m => console.log("✅ " + m);
const H = 3600 * 1000, D = 24 * H;
const KINDS = new Set(["result", "playoffs", "standings", "transfer"]);

(async () => {
  const t0 = Date.now();
  // ------------------------------------------------------------------
  // 1) Play-offs : un message par match (score de la série), puis le
  //    champion ; une seconde synchronisation n'ajoute rien.
  // ------------------------------------------------------------------
  {
    const now = Date.UTC(2026, 8, 30, 12);
    const lg = store.createMultiManagerCareer(["Lyon", "Paris"], now).league;
    const total = lg.totalRounds;
    for (let r = 0; r < total; r++) lg.matchesForRound(r).forEach((m, k) => lg.recordResult(r, m.home, m.away, 80 + ((r + k) % 7), 75 + ((r * 3 + k) % 9)));
    lg.round = total;
    const chat = { version: 1, nextId: 1, messages: [], system: [], sync: { season: 1, lastRound: -1, transfers: [] }, reads: {} };
    const opts = { now, relegations: 1, roundEndAt: () => now };
    LeagueChat.syncSystem(chat, lg, opts);
    assert.strictEqual(chat.system.filter(m => m.kind === "result").length, 5 * total, "un « Résultat » par match de saison régulière");
    lg.startPlayoffsIfNeeded(now);
    lg.runPlayoffsInstantly(now);
    assert.ok(lg.isPlayoffsDone());
    assert.ok(LeagueChat.syncSystem(chat, lg, opts), "play-offs : nouveaux messages");
    const po = chat.system.filter(m => m.kind === "playoffs");
    const games = lg.playoffs.series[0].games.length + lg.playoffs.series[1].games.length + lg.playoffs.finalSeries.games.length;
    assert.strictEqual(po.length, games + 1, `un message par match de play-offs (${games}) + le champion`);
    const champ = po.find(m => m.data.stage === "champion");
    assert.strictEqual(champ.data.team, lg.teams[lg.playoffs.champion].name);
    assert.strictEqual(LeagueChat.systemText(champ), `${champ.data.team} est champion !`);
    const lastFinal = po.filter(m => m.data.stage === "final").pop();
    assert.ok(lastFinal.data.decided && lastFinal.data.seriesWinner === 2 && lastFinal.data.winner === champ.data.team, "dernier match de la finale : série 2-x, vainqueur = champion");
    assert.ok(/\(finale, 2-[01]\)$/.test(LeagueChat.systemText(lastFinal)), LeagueChat.systemText(lastFinal));
    const semiDecided = po.filter(m => m.data.stage === "semi" && m.data.decided);
    assert.strictEqual(semiDecided.length, 2, "deux demi-finales décidées");
    const count = chat.system.length;
    assert.strictEqual(LeagueChat.syncSystem(chat, lg, opts), false, "rien de nouveau");
    assert.strictEqual(chat.system.length, count, "aucun doublon");
    ok(`play-offs annoncés : ${games} matchs (score de la série) + champion ${champ.data.team}, sans doublon`);
  }

  // ------------------------------------------------------------------
  // 2) Monde réel : personne n'ouvre le chat, un seul rattrapage de fond
  //    joue la fin de saison, les play-offs, la Coupe nationale et le
  //    changement de saison. Tout est annoncé (sauf la Coupe), rien en double.
  // ------------------------------------------------------------------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "league-chat-system-"));
  const multi = path.join(dir, "multi-league.json");
  const created = Date.UTC(2026, 8, 27, 9);
  const career = store.createMultiManagerCareer(["Lyon Chat", "Paris Chat"], created, "Lyon Chat");
  career.league.calendarDailyAnchored = true; career.league.calendarWeeklyRhythm = true;
  career.league.calendarStartAt = Calendar.weeklyRhythmCalendarStartAt(created);
  await store.saveMultiLeague(career.league, multi);
  await World.loadWorld(multi, created);
  const chatService = LeagueChat.createService(multi, {
    systemOpts: ctx => ({
      relegations: ctx.world ? World.divisionMovesFor(ctx.world, ctx.leagueId).relegations : 0,
      roundEndAt: r => { const at = Calendar.scheduledTimeForLeagueRound(ctx.league, r); return typeof at === "number" ? at + Calendar.MATCH_BROADCAST_DURATION_MS : null; },
    }),
  });
  const flushAt = now => (id, lg, world) => chatService.flushSystem({ league: lg, leagueId: id, world }, now);

  // Mi-saison : un premier rattrapage avec le chat (curseur posé).
  const mid = career.league.calendarStartAt + 3 * 7 * D + 2 * H;
  await World.catchUpWorld(multi, mid, { flushLeague: flushAt(mid) });
  let chat = await store.loadLeagueChat("fr-1", multi);
  assert.ok(chat && chat.sync && chat.sync.season === 1, "chat synchronisé en tâche de fond, sans lecteur");
  const firstRound = Math.min(...chat.system.filter(m => m.kind === "result").map(m => m.data.round));
  const midLast = chat.sync.lastRound;
  ok(`mi-saison : messages écrits sans que personne n'ouvre le chat (journées ${firstRound} à ${midLast + 1})`);

  // Fin de saison (sans le chat), jusqu'à la veille de la reprise…
  let w = await World.loadWorld(multi, mid);
  let d1 = await World.loadLeague(w, "fr-1", multi);
  let t = mid;
  for (let i = 0; i < 200 && !d1.seasonEndTickDone; i++) {
    t += 12 * H;
    await World.catchUpWorld(multi, t); // pas de flushLeague : personne n'écrit le chat
    w = await World.loadWorld(multi, t);
    d1 = await World.loadLeague(w, "fr-1", multi);
  }
  assert.ok(d1.isPlayoffsDone() && d1.seasonEndTickDone, "saison 1 terminée (play-offs joués)");
  const total = d1.totalRounds;
  const champion = d1.teams[d1.playoffs.champion].name;
  const poGames = d1.playoffs.series[0].games.length + d1.playoffs.series[1].games.length + d1.playoffs.finalSeries.games.length;
  chat = await store.loadLeagueChat("fr-1", multi);
  assert.strictEqual(chat.sync.lastRound, midLast, "rien d'écrit entre-temps (aucun lecteur, pas de hook)");
  // … puis UN rattrapage qui passe la reprise : les messages dus sont écrits
  // AVANT que startNextSeason ne vide league.results.
  const restart = Calendar.scheduledTimeForLeagueEconomyTick(d1, (d1.lastEconomyTick || 0) + 1);
  const evs = await World.catchUpWorld(multi, restart + 60 * 1000, { flushLeague: flushAt(restart + 60 * 1000) });
  assert.ok(evs.some(e => e.type === "country-new-season" && e.country === "fr" && e.seasonNumber === 2), "saison 2 commencée");
  chat = await store.loadLeagueChat("fr-1", multi);
  const results = chat.system.filter(m => m.kind === "result");
  assert.ok(results.some(m => m.data.round === total), `résultats de la dernière journée (J${total}) annoncés malgré le changement de saison`);
  assert.strictEqual(results.length, 5 * (total - firstRound + 1), "exactement un message par match de championnat annoncé (aucun match de Coupe)");
  const po = chat.system.filter(m => m.kind === "playoffs");
  assert.strictEqual(po.length, poGames + 1, `play-offs de la saison 1 annoncés (${poGames} matchs + champion)`);
  assert.strictEqual(po.find(m => m.data.stage === "champion").data.team, champion, `champion annoncé : ${champion}`);
  assert.ok(chat.system.every(m => KINDS.has(m.kind)), "aucun autre type de message (pas de Coupe)");
  assert.ok(!chat.system.some(m => /coupe|cup/i.test(m.key + JSON.stringify(m.data))), "aucune trace de la Coupe");
  const keys = chat.system.map(m => m.key);
  assert.strictEqual(new Set(keys).size, keys.length, "aucun doublon");
  assert.strictEqual(chat.sync.season, 2, "curseur passé à la saison 2");
  ok(`changement de saison sans lecteur : J${total}, ${poGames} matchs de play-offs et le champion (${champion}) annoncés, sans Coupe ni doublon`);

  // Un nouveau passage n'ajoute rien.
  const before = chat.system.length;
  await World.catchUpWorld(multi, restart + 2 * 60 * 1000, { flushLeague: flushAt(restart + 2 * 60 * 1000) });
  chat = await store.loadLeagueChat("fr-1", multi);
  assert.strictEqual(chat.system.length, before, "rattrapage suivant : aucun doublon");
  ok("rattrapage suivant : rien en double");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n🏁 league_chat_system_test.js : tout est vert (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
})().catch(e => { console.error("❌", e); process.exit(1); });
