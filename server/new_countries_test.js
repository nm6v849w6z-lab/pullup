"use strict";
// Ouverture de 14 pays (retour utilisateur 2026-09-30 : « ouvre ces divisions
// (espagne, pologne, grece, portugal + bresil, lituanie et chine) », puis
// Hong Kong, Taïwan, Canada, Belgique, Suisse, Allemagne et Argentine).
// Même règle que l'Italie (server/italy_test.js) : vérifie ici que chaque
// pays a sa Division I (10 clubs de l'IA aux noms de ses villes, son fuseau,
// ses joueurs), sa langue par défaut, son drapeau, et qu'on peut s'y
// inscrire (HTTP, exemple : la Lituanie).
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

const Accounts = require("./accounts.js");

const NEW = { es: ["Europe/Madrid", "es"], de: ["Europe/Berlin", "de"], gr: ["Europe/Athens", "el"], lt: ["Europe/Vilnius", "lt"],
  pl: ["Europe/Warsaw", "pl"], pt: ["Europe/Lisbon", "pt"], be: ["Europe/Brussels", "fr"], ch: ["Europe/Zurich", "de"],
  br: ["America/Sao_Paulo", "pt"], ar: ["America/Argentina/Buenos_Aires", "es"], ca: ["America/Toronto", "en"],
  cn: ["Asia/Shanghai", "zh"], hk: ["Asia/Hong_Kong", "zh"], tw: ["Asia/Taipei", "zh"] };

(async () => {
  for (const [code, [tz, lang]] of Object.entries(NEW)) {
    const info = Engine.WORLD_COUNTRIES[code];
    assert.ok(info && info.timeZone === tz, `${code} : pays ouvert, fuseau ${tz}`);
    assert.ok(World.isOpenCountry(code));
    const names = Engine.COUNTRY_CPU_TEAM_NAMES[code];
    assert.strictEqual(new Set(names).size, 100, `${code} : 100 villes distinctes`);
    const league = Engine.generateCountryLeague(code, 1, 0, Date.UTC(2026, 8, 7, 10));
    assert.strictEqual(league.leagueId, `${code}-1`);
    assert.strictEqual(league.timeZone, tz);
    assert.strictEqual(league.teams.length, 10);
    assert.ok(league.teams.every(t => names.includes(t.name)), `${code} : clubs aux noms des villes du pays`);
    const players = league.teams.flatMap(t => t.players);
    const share = players.filter(p => p.nationality === code).length / players.length;
    assert.ok(share > 0.4, `${code} : joueurs du pays majoritaires (${Math.round(share * 100)} %)`);
    assert.strictEqual(Accounts.countryLang(code), lang, `${code} : langue par défaut ${lang}`);
    assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "flags", code + ".png")), `${code} : drapeau`);
  }
  ok("14 nouveaux pays : Division I (10 clubs de l'IA, villes et joueurs du pays, fuseau local), langue par défaut, drapeau");

  // 1) Inscription HTTP en Lituanie (vraie route, heure fixe).
  {
    AccountRoutes._resetMemoryForTests();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lt-http-"));
    const paths = { solo: path.join(dir, "league.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
    const now = Date.UTC(2026, 8, 7, 10);
    const { league } = store.createMultiManagerCareer(["Lyon I", "Paris I"], Date.UTC(2026, 8, 7));
    await store.saveMultiLeague(league, paths.multi);
    const server = http.createServer(createHandler(paths.solo, () => now, paths.multi, paths.accounts));
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    try {
      const cfg = await request(server, "GET", "/api/account/config");
      assert.ok(cfg.body.countries.some(c => c.code === "lt" && c.name === "Lituanie" && c.timeZone === "Europe/Vilnius"), "Lituanie proposée à l'inscription");
      const su = await request(server, "POST", "/api/account/signup", { email: "lt@x.lt", password: "motdepasse1", clubName: "Žalgiris Test", country: "lt" });
      assert.strictEqual(su.body.status, "active");
      const save = await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": su.body.managerToken });
      assert.strictEqual(save.body.league.leagueId, "lt-1");
      assert.strictEqual(save.body.league.timeZone, "Europe/Vilnius");
      assert.strictEqual(save.body.league.divisionLevel, 1);
      const me = save.body.league.teams[save.body.myTeamIndex];
      assert.strictEqual(me.teamName, "Žalgiris Test");
      const ltPlayers = me.players.filter(p => p.nationality === "lt").length;
      assert.ok(ltPlayers >= 4, `effectif repris en Lituanie : ${ltPlayers} Lituaniens`);
      const planete = await request(server, "GET", "/api/world/country?code=lt", undefined, { "X-TipIn-Token": su.body.managerToken });
      assert.strictEqual(planete.body.myCountry, "lt");
      assert.ok(planete.body.overview.mine && planete.body.overview.name === "Lituanie");
      assert.ok(planete.body.countries.some(c => c.code === "lt"));
    } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    ok("inscription en Lituanie (HTTP) : club de la Division I lituanienne, heure de Vilnius, joueurs lituaniens, Planète Hoop");
  }

  console.log("🏁 Nouveaux pays vérifiés.");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
