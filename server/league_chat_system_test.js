"use strict";
// Chat de la ligue — AUCUN message automatique (retour utilisateur
// 2026-10-05 : « le chat des ligues ne doit plus servir de fil d'actualité
// ou de journal des événements de la ligue »). Une saison entière jouée en
// tâche de fond (matchs, transferts de l'IA, play-offs, Coupe, changement
// de saison) n'écrit rien dans le chat : seuls les messages des managers y
// sont, avant comme après.
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

(async () => {
  const t0 = Date.now();
  // L'ancien point d'entrée des messages automatiques n'existe plus.
  assert.strictEqual(LeagueChat.syncSystem, undefined);
  assert.strictEqual(LeagueChat.systemText, undefined);
  ok("plus de générateur de messages automatiques (syncSystem/systemText retirés)");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "league-chat-system-"));
  const multi = path.join(dir, "multi-league.json");
  const created = Date.UTC(2026, 8, 27, 9);
  const career = store.createMultiManagerCareer(["Lyon Chat", "Paris Chat"], created, "Lyon Chat");
  career.league.calendarDailyAnchored = true; career.league.calendarWeeklyRhythm = true;
  career.league.calendarStartAt = Calendar.weeklyRhythmCalendarStartAt(created);
  await store.saveMultiLeague(career.league, multi);
  await World.loadWorld(multi, created);
  const chat = LeagueChat.createService(multi);
  const ctxAt = async now => {
    const w = await World.loadWorld(multi, now);
    const lg = await World.loadLeague(w, "fr-1", multi);
    return { league: lg, leagueId: "fr-1", teamIndex: lg.teams.findIndex(x => x.name === "Lyon Chat"), world: w };
  };
  const onlyUsers = body => body.messages.every(m => m.kind === "user" && m.author && typeof m.text === "string");

  let now = career.league.calendarStartAt + 2 * H;
  let r = await chat.send(await ctxAt(now), { text: "Bonne saison à tous !" }, now);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));

  // Mi-saison.
  const mid = career.league.calendarStartAt + 3 * 7 * D + 2 * H;
  await World.catchUpWorld(multi, mid);
  r = await chat.view(await ctxAt(mid), mid);
  assert.ok(onlyUsers(r.body) && r.body.messages.length === 1, JSON.stringify(r.body.messages.map(m => m.kind)));
  ok("mi-saison : matchs joués, le chat ne contient que le message du manager");

  // Fin de saison, play-offs, puis changement de saison.
  let t = mid, d1 = (await ctxAt(t)).league;
  for (let i = 0; i < 200 && !d1.seasonEndTickDone; i++) {
    t += 12 * H;
    await World.catchUpWorld(multi, t);
    d1 = (await ctxAt(t)).league;
  }
  assert.ok(d1.isPlayoffsDone() && d1.seasonEndTickDone, "saison 1 terminée (play-offs joués)");
  const restart = Calendar.scheduledTimeForLeagueEconomyTick(d1, (d1.lastEconomyTick || 0) + 1);
  const evs = await World.catchUpWorld(multi, restart + 60 * 1000);
  assert.ok(evs.some(e => e.type === "country-new-season" && e.country === "fr" && e.seasonNumber === 2), "saison 2 commencée");
  now = restart + 2 * 60 * 1000;
  const ctx = await ctxAt(now);
  r = await chat.view(ctx, now);
  assert.ok(onlyUsers(r.body) && r.body.messages.length === 1 && r.body.messages[0].text === "Bonne saison à tous !", JSON.stringify(r.body.messages));
  const stored = await store.loadLeagueChat("fr-1", multi);
  assert.ok(stored && !stored.system && !stored.sync && stored.messages.every(m => m.kind === "user"), "fichier du chat : messages des managers seulement");
  ok("saison complète + play-offs + changement de saison : aucun résultat, transfert, classement ni champion dans le chat");

  // Paris (autre manager) : 1 non-lu = le message de Lyon, rien d'autre.
  const paris = { ...ctx, teamIndex: ctx.league.teams.findIndex(x => x.name === "Paris Chat") };
  r = await chat.view(paris, now, true);
  assert.strictEqual(r.body.unreadCount, 1);
  ok("non-lus : uniquement les messages des autres managers");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n🏁 league_chat_system_test.js : tout est vert (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
})().catch(e => { console.error("❌", e); process.exit(1); });
