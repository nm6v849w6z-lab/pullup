"use strict";
// Italie (retour utilisateur 2026-09-30 : « création de l'Italie : pour
// l'instant une division, mais en automatique plusieurs divisions quand on a
// plus de 10 joueurs »). Vérifie : Division I italienne créée toute seule
// (clubs de l'IA, villes et joueurs italiens, heure de Rome, mêmes semaines
// que la France) ; inscription d'un manager en Italie (HTTP) ; 10 managers
// = une division, le 11e ouvre la Division II.1 (World.MAX_HUMANS_PER_LEAGUE,
// règle commune à tous les pays) ; fin de saison : montée/descente entre
// les deux divisions italiennes, puis Coupe nationale d'Italie ; l'Italie
// dans Planète Hoop (countryOverview) et la recherche.
process.env.BASKET_INACTIVE_RELEASE_DAYS = process.env.BASKET_INACTIVE_RELEASE_DAYS || "100000";
process.env.BASKET_INVITE_CODE = "off";
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const Engine = require("../engine.js");
const Calendar = require("./calendar.js");
const store = require("./store.js");
const World = require("./world.js");
const { createHandler } = require("./index.js");
const AccountRoutes = require("./accountRoutes.js");

const H = 3600 * 1000, D = 24 * H;
const ok = m => console.log("✅ " + m);
const fmt = (ms, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));

function request(server, method, urlPath, jsonBody, headers = {}) {
  const { port } = server.address();
  const payload = jsonBody !== undefined ? JSON.stringify(jsonBody) : null;
  const h = { ...headers };
  if (payload) { h["Content-Type"] = "application/json"; h["Content-Length"] = Buffer.byteLength(payload); }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers: h }, res => {
      let raw = "";
      res.on("data", c => { raw += c; });
      res.on("end", () => { let body = null; try { body = JSON.parse(raw); } catch (e) { /* rien */ } resolve({ statusCode: res.statusCode, body }); });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const t0 = Date.now();

  // 1) Inscription HTTP en Italie (vraie route, heure fixe).
  {
    AccountRoutes._resetMemoryForTests();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "italy-http-"));
    const paths = { solo: path.join(dir, "league.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
    const now = Date.UTC(2026, 8, 7, 10);
    const { league } = store.createMultiManagerCareer(["Lyon I", "Paris I"], Date.UTC(2026, 8, 7));
    await store.saveMultiLeague(league, paths.multi);
    const server = http.createServer(createHandler(paths.solo, () => now, paths.multi, paths.accounts));
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    try {
      const cfg = await request(server, "GET", "/api/account/config");
      assert.ok(cfg.body.countries.some(c => c.code === "it" && c.name === "Italie" && c.timeZone === "Europe/Rome"), "Italie proposée à l'inscription");
      const su = await request(server, "POST", "/api/account/signup", { email: "it@x.it", password: "motdepasse1", clubName: "Olimpia Test", country: "it" });
      assert.strictEqual(su.body.status, "active");
      const save = await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": su.body.managerToken });
      assert.strictEqual(save.body.league.leagueId, "it-1");
      assert.strictEqual(save.body.league.timeZone, "Europe/Rome");
      assert.strictEqual(save.body.league.divisionLevel, 1);
      const me = save.body.league.teams[save.body.myTeamIndex];
      assert.strictEqual(me.teamName, "Olimpia Test");
      const itPlayers = me.players.filter(p => p.nationality === "it").length;
      assert.ok(itPlayers >= 4, `effectif repris en Italie : ${itPlayers} Italiens`);
      const planete = await request(server, "GET", "/api/world/country?code=it", undefined, { "X-TipIn-Token": su.body.managerToken });
      assert.strictEqual(planete.body.myCountry, "it");
      assert.ok(planete.body.overview.mine && planete.body.overview.name === "Italie");
      assert.ok(planete.body.countries.some(c => c.code === "it"));
    } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    ok("inscription : l'Italie est proposée, le manager reprend un club de la Division I italienne (heure de Rome, joueurs italiens), Planète Hoop sur l'Italie");
  }

  // 2) Monde : Division I italienne créée toute seule.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "italy-world-"));
  const multi = path.join(dir, "multi-league.json");
  const created = Date.UTC(2026, 8, 27, 9);
  const career = store.createMultiManagerCareer(["Lyon Italie", "Paris Italie"], created, "Lyon Italie");
  career.league.calendarDailyAnchored = true; career.league.calendarWeeklyRhythm = true;
  career.league.calendarStartAt = Calendar.weeklyRhythmCalendarStartAt(created);
  await store.saveMultiLeague(career.league, multi);
  const w = await World.loadWorld(multi, created);
  assert.deepStrictEqual(World.leaguesOfCountry(w, "it").map(e => e.id), ["it-1"], "une seule division au départ");
  const it1 = await World.loadLeague(w, "it-1", multi);
  const fr1 = await World.loadLeague(w, "fr-1", multi);
  assert.strictEqual(it1.teams.length, 10);
  assert.ok(it1.teams.every(t => !t.isHuman && Engine.COUNTRY_CPU_TEAM_NAMES.it.includes(t.name)), "10 clubs de l'IA aux noms de villes italiennes");
  const italians = it1.teams.flatMap(t => t.players).filter(p => p.nationality === "it").length;
  const total = it1.teams.flatMap(t => t.players).length;
  assert.ok(italians / total > 0.4, `joueurs italiens majoritaires (${italians}/${total})`);
  assert.strictEqual(it1.timeZone, "Europe/Rome");
  assert.strictEqual(fmt(it1.calendarStartAt, "Europe/Rome"), "Tue 20:00");
  for (let k = 1; k <= 11; k++) assert.strictEqual(Calendar.scheduledTimeForLeagueEconomyTick(it1, k), Calendar.scheduledTimeForLeagueEconomyTick(fr1, k));
  ok("Division I italienne : 10 clubs de l'IA (villes italiennes, ~60 % de joueurs italiens), mardi 20:00 à Rome, mêmes semaines que la France");

  // 3) 10 managers = une division ; le 11e ouvre la Division II.1.
  const midSeason = career.league.calendarStartAt + 3 * 7 * D + 2 * H;
  await World.catchUpWorld(multi, midSeason);
  const placed = [];
  for (let i = 0; i < World.MAX_HUMANS_PER_LEAGUE; i++) placed.push(await World.assignClub(w, multi, { country: "it", clubName: `Italia Club ${i}`, now: midSeason }));
  assert.ok(placed.every(r => r.ok && r.leagueId === "it-1"), "les 10 premiers en Division I");
  assert.deepStrictEqual(World.leaguesOfCountry(w, "it").map(e => e.id), ["it-1"], "10 managers : toujours une division");
  const eleventh = await World.assignClub(w, multi, { country: "it", clubName: "Undicesimo", now: midSeason });
  assert.ok(eleventh.ok && eleventh.leagueId === "it-2.1", `11e manager : ${eleventh.leagueId}`);
  assert.deepStrictEqual(World.leaguesOfCountry(w, "it").map(e => e.id), ["it-1", "it-2.1"]);
  const it2 = await World.loadLeague(w, "it-2.1", multi);
  const it1b = await World.loadLeague(w, "it-1", multi);
  assert.strictEqual(it2.divisionLevel, 2);
  assert.strictEqual(it2.round, it1b.round, "journées passées simulées comme la Division I");
  assert.strictEqual(it2.teams.filter(t => t.isHuman).length, 1);
  assert.ok(it2.teams.every(t => t.isHuman || Engine.COUNTRY_CPU_TEAM_NAMES.it.includes(t.name)));
  assert.deepStrictEqual(World.divisionMovesFor(w, "it-1"), { promotes: false, relegations: 1, barrage: false, upperLabel: null });
  assert.ok(World.leaguesOfCountry(w, "fr").every(e => e.country === "fr") && !World.leaguesOfCountry(w, "fr").some(e => e.id.startsWith("it")));
  ok(`${World.MAX_HUMANS_PER_LEAGUE} managers : une seule division ; le 11e ouvre aussitôt la Division II.1 (calée sur la saison en cours), la Division I a désormais une place de relégation`);

  // 4) Fin de saison : montée / descente entre les deux divisions italiennes.
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
  assert.ok(all.every(x => x.lg.isPlayoffsDone() && x.lg.seasonEndTickDone), "intersaison partout");
  const wi = await World.loadWorld(multi, t);
  assert.strictEqual(wi.seasons.it.moves.length, 1, "une paire montée/descente en Italie");
  const d1 = all.find(x => x.e.id === "it-1").lg;
  const d2 = all.find(x => x.e.id === "it-2.1").lg;
  const tenth = d1.teams[d1.standings()[9].idx];
  const champ2 = d2.teams[d2.playoffs.champion];
  assert.strictEqual(tenth.pendingDivisionMove.kind, "relegated");
  assert.strictEqual(tenth.pendingDivisionMove.toLeagueId, "it-2.1");
  assert.strictEqual(champ2.pendingDivisionMove.kind, "promoted");
  assert.ok(wi.history.it && wi.history.it[0] && wi.history.it[0].champion === d1.teams[d1.playoffs.champion].name, "palmarès italien");
  const restart = Calendar.scheduledTimeForLeagueEconomyTick(d1, (d1.lastEconomyTick || 0) + 1);
  const evs = await World.catchUpWorld(multi, restart + 60 * 1000);
  assert.ok(evs.some(e => e.type === "country-new-season" && e.country === "it" && e.seasonNumber === 2));
  const w2 = await World.loadWorld(multi, restart + 60 * 1000);
  const n1 = await World.loadLeague(w2, "it-1", multi), n2 = await World.loadLeague(w2, "it-2.1", multi);
  assert.ok(n1.teams.some(x => x.name === champ2.name), `${champ2.name} monte en Division I`);
  assert.ok(n2.teams.some(x => x.name === tenth.name), `${tenth.name} descend en Division II.1`);
  assert.strictEqual(n1.teams.length, 10); assert.strictEqual(n2.teams.length, 10);
  [...n1.teams, ...n2.teams].forEach(tm => { if (tm.isHuman) assert.ok(["it-1", "it-2.1"].includes(w2.tokens[tm.managerLinkToken])); });
  ok(`fin de saison : ${champ2.name} monte en Division I, ${tenth.name} descend en Division II.1, saison 2 pour l'Italie`);

  // 5) Coupe nationale d'Italie : tous les clubs du pays (20).
  const cup = w2.cups.it;
  assert.ok(cup && cup.country === "it" && cup.season === 2, "Coupe nationale d'Italie créée");
  const refs = cup.rounds[0].matches.flatMap(m => [m.home, m.away]).filter(Boolean);
  assert.strictEqual(refs.length, 20, "20 clubs italiens dans la Coupe");
  assert.ok(refs.every(r => r.leagueId.startsWith("it-")), "uniquement des clubs italiens");
  ok("Coupe nationale d'Italie : 20 clubs des deux divisions italiennes");

  // 6) Planète Hoop / recherche.
  const ov = World.countryOverview(w2, "it", { myCountry: "fr" });
  assert.strictEqual(ov.name, "Italie");
  assert.deepStrictEqual([ov.card.divisionCount, ov.card.leagueCount, ov.card.clubs], [2, 2, 20]);
  assert.strictEqual(ov.history.length, 1);
  assert.ok(World.searchWorld(w2, "italia").leagues.some(l => l.id === "it-1"), "« italia » trouve la Division I italienne");
  ok("Planète Hoop : aperçu de l'Italie (2 divisions, 20 clubs, palmarès), recherche « italia »");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n🏁 italy_test.js : tout est vert (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
