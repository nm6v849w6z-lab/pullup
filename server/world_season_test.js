"use strict";
// Championnats par pays : saisons synchronisées, montées/descentes et reprise
// commune (retour utilisateur 2026-09-28). Voir server/world.js
// (createLeague, computeCountryMoves, applyCountryMoves, catchUpWorld).
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

const H = 3600 * 1000, D = 24 * H;
const ok = m => console.log("✅ " + m);
const fmt = (ms, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));

(async () => {
  const t0 = Date.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "world-season-"));
  const multi = path.join(dir, "multi-league.json");
  const created = Date.UTC(2026, 8, 27, 9); // dimanche 27/09/2026
  const career = store.createMultiManagerCareer(["Lyon Monde", "Paris Monde"], created, "Lyon Monde");
  career.league.calendarDailyAnchored = true; career.league.calendarWeeklyRhythm = true;
  career.league.calendarStartAt = Calendar.weeklyRhythmCalendarStartAt(created);
  await store.saveMultiLeague(career.league, multi);
  const w = await World.loadWorld(multi, created);
  assert.deepStrictEqual(w.leagues.map(l => l.id).sort(), Object.keys(Engine.WORLD_COUNTRIES).map(c => c + "-1").sort());
  {
    const fr = await World.loadLeague(w, "fr-1", multi), us = await World.loadLeague(w, "us-1", multi);
    assert.strictEqual(fmt(us.calendarStartAt, "America/New_York"), "Tue 20:00");
    assert.ok(Math.abs(us.calendarStartAt - fr.calendarStartAt) < D, "même semaine que la France");
    for (let k = 1; k <= 11; k++) assert.strictEqual(Calendar.scheduledTimeForLeagueEconomyTick(us, k), Calendar.scheduledTimeForLeagueEconomyTick(fr, k));
    ok("USA calés sur les mêmes semaines que la France (mardi 20:00 à New York), mises à jour au même instant");
  }

  // 1) Une ligue ouverte en cours de saison se cale sur le calendrier du pays.
  const midSeason = career.league.calendarStartAt + 3 * 7 * D + 2 * H; // 4e semaine
  await World.catchUpWorld(multi, midSeason);
  const placed = [];
  for (let i = 0; i < 8; i++) placed.push(await World.assignClub(w, multi, { country: "fr", clubName: `FR Club ${i}`, now: midSeason }));
  const inD2a = await World.assignClub(w, multi, { country: "fr", clubName: "Rennes Monde", now: midSeason });
  assert.strictEqual(inD2a.leagueId, "fr-2.1");
  // Remplir aussi la II.1 pour ouvrir la II.2.
  for (let i = 0; i < 9; i++) await World.assignClub(w, multi, { country: "fr", clubName: `D2 Club ${i}`, now: midSeason });
  const inD2b = await World.assignClub(w, multi, { country: "fr", clubName: "Nantes Monde", now: midSeason });
  assert.strictEqual(inD2b.leagueId, "fr-2.2");
  const fr1 = await World.loadLeague(w, "fr-1", multi);
  const fr2b = await World.loadLeague(w, "fr-2.2", multi);
  assert.strictEqual(fr2b.calendarStartAt, fr1.calendarStartAt, "même calendrier que la Division I");
  assert.strictEqual(fr2b.round, fr1.round, `journées déjà passées simulées (${fr2b.round} = ${fr1.round})`);
  assert.ok(fr2b.results.length >= 5 * fr1.round);
  const humanD2b = fr2b.teams.find(t => t.isHuman);
  assert.ok(humanD2b && humanD2b.name === "Nantes Monde");
  assert.strictEqual(fr2b.autoNextSeason, false);
  ok(`ligues ouvertes en cours de saison (fr-2.1, fr-2.2) calées sur le calendrier du pays : journée ${fr2b.round + 1} comme la Division I, journées passées simulées`);

  // 2) Toute la saison : toutes les ligues arrivent ensemble à l'intersaison.
  let t = midSeason;
  let all;
  for (let i = 0; i < 200; i++) {
    t += 12 * H;
    await World.catchUpWorld(multi, t);
    const ww = await World.loadWorld(multi, t);
    all = [];
    for (const e of ww.leagues) all.push({ e, lg: await World.loadLeague(ww, e.id, multi) });
    if (all.every(x => x.lg.seasonEndTickDone)) break;
  }
  assert.ok(all.every(x => x.lg.isPlayoffsDone() && x.lg.seasonEndTickDone), "toutes les ligues en intersaison");
  const wi = await World.loadWorld(multi, t);
  assert.strictEqual(wi.seasons.fr.movesSeason, 1);
  assert.strictEqual(wi.seasons.fr.moves.length, 2, "2 ligues filles ouvertes → 2 échanges avec la Division I");
  assert.ok(!(wi.seasons.us && wi.seasons.us.moves && wi.seasons.us.moves.length), "une seule ligue aux USA : pas de mouvement");
  const d1 = all.find(x => x.e.id === "fr-1").lg;
  const table = d1.standings();
  const tenth = d1.teams[table[9].idx], ninth = d1.teams[table[8].idx];
  assert.strictEqual(tenth.pendingDivisionMove.kind, "relegated"); assert.strictEqual(tenth.pendingDivisionMove.toLeagueId, "fr-2.1");
  assert.strictEqual(ninth.pendingDivisionMove.kind, "relegated"); assert.strictEqual(ninth.pendingDivisionMove.toLeagueId, "fr-2.2");
  assert.ok(!d1.teams[table[7].idx].pendingDivisionMove, "avec 2 ligues filles, le 8e reste (barrage sans effet)");
  const champ2a = (x => x.teams[x.playoffs.champion])(all.find(x => x.e.id === "fr-2.1").lg);
  assert.strictEqual(champ2a.pendingDivisionMove.kind, "promoted");
  assert.strictEqual(champ2a.pendingDivisionMove.toLabel, "Division I");
  assert.ok(all.every(x => (x.lg.seasonNumber || 1) === 1), "toujours la saison 1 pendant l'intersaison");
  ok("intersaison commune : 10e → Division II.1, 9e → Division II.2, champions des deux groupes vers la Division I ; rien aux USA");

  // 3) Lundi suivant : échanges et saison 2 pour tout le monde.
  const restart = Calendar.scheduledTimeForLeagueEconomyTick(d1, (d1.lastEconomyTick || 0) + 1);
  assert.strictEqual(fmt(restart, "Europe/Paris"), "Mon 06:00");
  const evs = await World.catchUpWorld(multi, restart + 60 * 1000);
  assert.ok(evs.some(e => e.type === "country-new-season" && e.country === "fr" && e.seasonNumber === 2));
  assert.ok(evs.some(e => e.type === "country-new-season" && e.country === "us" && e.seasonNumber === 2));
  const w2 = await World.loadWorld(multi, restart + 60 * 1000);
  const after = new Map();
  for (const e of w2.leagues) after.set(e.id, await World.loadLeague(w2, e.id, multi));
  [...after.values()].forEach(lg => { assert.strictEqual(lg.seasonNumber, 2); assert.strictEqual(lg.round, 0); assert.strictEqual(lg.teams.length, 10); });
  const names = n => after.get(n).teams.map(x => x.name);
  assert.ok(names("fr-1").includes(champ2a.name), `${champ2a.name} est en Division I`);
  assert.ok(names("fr-2.1").includes(tenth.name) && names("fr-2.2").includes(ninth.name));
  assert.strictEqual(fmt(after.get("fr-1").calendarStartAt, "Europe/Paris"), "Tue 20:00");
  assert.strictEqual(fmt(after.get("us-1").calendarStartAt, "America/New_York"), "Tue 20:00");
  // Les jetons des managers déplacés suivent.
  for (const [id, lg] of after) lg.teams.forEach(tm => { if (tm.isHuman) assert.strictEqual(w2.tokens[tm.managerLinkToken], id, `${tm.name} → ${id}`); });
  const allNames = [...after.values()].flatMap(lg => lg.teams.map(x => x.name));
  assert.strictEqual(new Set(allNames).size, allNames.length, "aucun club perdu ni dupliqué");
  ok("reprise commune le lundi 6h : échanges appliqués, saison 2 partout (Paris et New York à 20:00 heure locale), jetons des managers déplacés mis à jour");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n🏁 world_season_test.js : tout est vert (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
})().catch(e => { console.error("❌", e); process.exit(1); });
