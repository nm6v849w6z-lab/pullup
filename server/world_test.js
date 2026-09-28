"use strict";
// Championnats par pays (2026-09-28, voir server/world.js) : registre du
// monde, Division I américaine créée automatiquement, horaires dans le
// fuseau de chaque pays, ouverture des championnats suivants à la demande.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Engine = require("../engine.js");
const Calendar = require("./calendar.js");
const store = require("./store.js");
const World = require("./world.js");
const AutoSim = require("./autoSim.js");

function wallClock(ms, tz) {
  const parts = {};
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", weekday: "short", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(ms)).forEach(p => { parts[p.type] = p.value; });
  return `${parts.weekday} ${parts.hour}:${parts.minute}`;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "world-test-"));
  const multi = path.join(dir, "multi-league.json");
  const now = Date.UTC(2026, 8, 28, 17, 0, 0); // lundi 28/09/2026, 19h à Paris

  // 0. Sans ligue partagée : pas de monde (mode solo / historique).
  assert.strictEqual(await World.loadWorld(multi, now), null);

  // 1. Ligue historique -> "fr-1", Division I américaine créée.
  const created = store.createMultiManagerCareer(["Gotham Knights", "BC Dia"], now);
  await store.saveMultiLeague(created.league, multi);
  const world = await World.loadWorld(multi, now);
  assert.deepStrictEqual(world.leagues.map(l => l.id).sort(), ["fr-1", "us-1"]);
  assert.strictEqual(world.tokens[created.league.teams[0].managerLinkToken], "fr-1");
  const again = await World.loadWorld(multi, now);
  assert.strictEqual(again.leagues.length, 2, "idempotent");
  const fr = await World.loadLeague(world, "fr-1", multi);
  const us = await World.loadLeague(world, "us-1", multi);
  assert.strictEqual(fr.country, "fr"); assert.strictEqual(fr.timeZone, "Europe/Paris");
  assert.strictEqual(us.country, "us"); assert.strictEqual(us.timeZone, "America/New_York");
  assert.ok(us.teams.every(t => !t.isHuman && Engine.COUNTRY_CPU_TEAM_NAMES.us.includes(t.name)), "10 clubs CPU aux noms américains");
  assert.ok(us.teams.every(t => t.country === "us"));
  const all = us.teams.flatMap(t => t.players);
  const share = all.filter(p => p.nationality === "us").length / all.length;
  assert.ok(share > 0.45 && share < 0.75, `part d'Américains : ${share}`);
  console.log(`✅ Monde : fr-1 (ligue historique) + us-1 créée (10 clubs CPU, ${Math.round(share * 100)} % d'Américains).`);

  // 2. Horaires : 1re journée à la même heure murale, chacun dans son fuseau.
  World.useLeagueTimeZone(fr);
  const frKick = Calendar.scheduledTimeForLeagueRound(fr, 0);
  World.useLeagueTimeZone(us);
  const usKick = Calendar.scheduledTimeForLeagueRound(us, 0);
  const frWall = wallClock(frKick, "Europe/Paris");
  const usWall = wallClock(usKick, "America/New_York");
  assert.strictEqual(frWall.slice(4), usWall.slice(4), `${frWall} (Paris) vs ${usWall} (New York)`);
  assert.notStrictEqual(frKick, usKick);
  assert.strictEqual(Engine.getCalendarTimeZone(), "America/New_York");
  console.log(`✅ Horaires par pays : 1re journée ${frWall} à Paris, ${usWall} à New York.`);

  // 3. Le championnat américain (sans coupe pour l'instant) se joue.
  const later = usKick + 3 * 24 * 3600 * 1000;
  AutoSim.catchUpLeague(us, later);
  assert.ok(us.results.length >= 5, `matchs joués aux États-Unis : ${us.results.length}`);
  World.useLeagueTimeZone(null);
  assert.strictEqual(Engine.getCalendarTimeZone(), "Europe/Paris");
  console.log(`✅ Championnat américain rattrapé : ${us.results.length} matchs joués.`);

  // 4. Placement : plus haut championnat avec un bot, puis ouverture des suivants.
  const w = await World.loadWorld(multi, now);
  const placed = [];
  for (let i = 0; i < 8; i++) placed.push(await World.assignClub(w, multi, { country: "fr", clubName: `Club FR ${i}`, now }));
  assert.ok(placed.every(r => r.ok && r.leagueId === "fr-1"), "les 8 bots de la Division I sont repris d'abord");
  const ninth = await World.assignClub(w, multi, { country: "fr", clubName: "Club FR 8", now });
  assert.strictEqual(ninth.leagueId, "fr-2.1", "Division I pleine -> Division II.1");
  const d2 = await World.loadLeague(w, "fr-2.1", multi);
  assert.strictEqual(d2.divisionLevel, 2); assert.strictEqual(d2.timeZone, "Europe/Paris");
  const frNames = new Set((await World.loadLeague(w, "fr-1", multi)).teams.map(t => t.name));
  assert.ok(!d2.teams.some(t => frNames.has(t.name)), "aucun nom de club en double dans le pays");
  const usPlaced = await World.assignClub(w, multi, { country: "us", clubName: "Club US", now });
  assert.strictEqual(usPlaced.leagueId, "us-1");
  // Ordre d'ouverture : II.2, II.3 puis III.1.
  const slots = [];
  const fake = { leagues: [{ country: "fr", level: 1, group: 0 }, { country: "fr", level: 2, group: 0 }] };
  for (let i = 0; i < 3; i++) { const s = World.nextSlot(fake, "fr"); slots.push(`${s.level}.${s.group + 1}`); fake.leagues.push({ country: "fr", ...s }); }
  assert.deepStrictEqual(slots, ["2.2", "2.3", "3.1"]);
  assert.strictEqual(Engine.worldLeagueId("fr", 3, 0), "fr-3.1");
  console.log("✅ Placement : Division I d'abord, puis Division II.1 ouverte à la demande ; ordre II.2, II.3, III.1.");

  // 5. Le jeton d'un manager placé en Division II est retrouvé.
  const found = await World.findTeamByToken(w, ninth.token, multi);
  assert.strictEqual(found.leagueId, "fr-2.1");
  assert.strictEqual(found.league.teams[found.teamIndex].name, "Club FR 8");
  console.log("✅ Jeton manager -> bon championnat.");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("\n🏁 world_test : tous les tests sont passés.");
})().catch(e => { console.error("❌", e); process.exit(1); });
