"use strict";
// Pays proposé d'après l'adresse IP (2026-10-01, retour utilisateur : « mets
// en place la proposition de pays basée sur l'ip »). Vérifie :
// 1) server/geoip.js : IPv4, IPv6, IPv4 encapsulée, IP privée / invalide,
//    pays non ouvert → null, en-tête de pays d'un CDN prioritaire ;
// 2) /api/account/config renvoie suggestedCountry d'après X-Forwarded-For
//    (Render), null hors des pays ouverts ;
// 3) la page d'inscription (navigateur réel si Chromium est là) présélectionne
//    le pays de l'IP, même avec un navigateur dans une autre langue.
process.env.BASKET_INVITE_CODE = "off";
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const GeoIp = require("./geoip.js");
const store = require("./store.js");
const { createHandler } = require("./index.js");

const ok = m => console.log("✅ " + m);

function get(server, urlPath, headers = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: urlPath, headers }, res => {
      let raw = ""; res.on("data", c => { raw += c; });
      res.on("end", () => resolve(JSON.parse(raw)));
    }).on("error", reject);
  });
}

(async () => {
  // 1) Table locale.
  const cases = { "90.84.1.1": "fr", "151.38.1.1": "it", "85.214.1.1": "de", "78.56.1.1": "lt", "83.4.1.1": "pl",
    "114.114.114.114": "cn", "8.8.8.8": "us", "2a01:cb00::1": "fr", "::ffff:90.84.1.1": "fr",
    "127.0.0.1": null, "192.168.1.10": null, "pas une ip": null, "": null };
  for (const [ip, want] of Object.entries(cases)) assert.strictEqual(GeoIp.countryForIp(ip), want, `${ip} → ${want}`);
  ok("table IP → pays : IPv4, IPv6, IPv4 encapsulée ; IP privée ou invalide → null");
  assert.strictEqual(GeoIp.countryFromRequest({ headers: { "cf-ipcountry": "CH", "x-forwarded-for": "90.84.1.1" } }), "ch");
  assert.strictEqual(GeoIp.countryFromRequest({ headers: { "x-forwarded-for": "85.214.1.1, 10.0.0.1" } }), "de");
  assert.strictEqual(GeoIp.countryFromRequest({ headers: {}, socket: { remoteAddress: "::ffff:151.38.1.1" } }), "it");
  assert.strictEqual(GeoIp.countryFromRequest({ headers: { "x-forwarded-for": "10.0.0.1, 90.84.1.1" } }), "fr", "adresse interne en tête sautée");
  assert.strictEqual(GeoIp.countryFromRequest({ headers: { "true-client-ip": "90.84.1.1", "x-forwarded-for": "104.16.0.1" } }), "fr", "True-Client-IP (Render/Cloudflare)");
  ok("requête : en-tête pays d'un CDN, puis IP du client (True-Client-IP, X-Forwarded-For en sautant les adresses internes), puis la socket");

  // 2) Route de configuration du site.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geoip-"));
  const paths = { solo: path.join(dir, "solo.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
  const { league } = store.createMultiManagerCareer(["Lyon I", "Paris I"], Date.now());
  await store.saveMultiLeague(league, paths.multi);
  const server = http.createServer(createHandler(paths.solo, Date.now, paths.multi, paths.accounts));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try {
    assert.strictEqual((await get(server, "/api/account/config", { "X-Forwarded-For": "85.214.1.1" })).suggestedCountry, "de");
    assert.strictEqual((await get(server, "/api/account/config", { "X-Forwarded-For": "78.56.1.1" })).suggestedCountry, "lt");
    assert.strictEqual((await get(server, "/api/account/config", { "CF-IPCountry": "JP" })).suggestedCountry, null, "Japon : pays non ouvert");
    assert.strictEqual((await get(server, "/api/account/config")).suggestedCountry, null, "127.0.0.1 : rien");
    ok("/api/account/config : suggestedCountry d'après l'IP (de, lt), null pour un pays non ouvert ou une IP locale");

    // Inscription : IP française → club français, sauf pays cliqué exprès.
    const post = (body, headers) => new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const rq = http.request({ host: "127.0.0.1", port: server.address().port, path: "/api/account/signup", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), ...headers } }, res => {
        let raw = ""; res.on("data", c => { raw += c; }); res.on("end", () => resolve(JSON.parse(raw)));
      });
      rq.on("error", reject); rq.end(data);
    });
    const leagueOf = async token => (await get(server, "/api/save", { "X-TipIn-Token": token })).league.leagueId;
    const a = await post({ email: "ipfr@x.fr", password: "motdepasse1", clubName: "Ip France", country: "us" }, { "X-Forwarded-For": "90.84.1.1" });
    assert.strictEqual(await leagueOf(a.managerToken), "fr-1", "IP française, pays présélectionné US (navigateur en anglais) → club français");
    const b2 = await post({ email: "ipfr2@x.fr", password: "motdepasse1", clubName: "Choix Italie", country: "it", countryChosen: true }, { "X-Forwarded-For": "90.84.1.1" });
    assert.strictEqual(await leagueOf(b2.managerToken), "it-1", "pays cliqué exprès : respecté");
    const c2 = await post({ email: "ipde@x.de", password: "motdepasse1", clubName: "Ip Deutschland" }, { "True-Client-IP": "85.214.1.1" });
    assert.strictEqual(await leagueOf(c2.managerToken), "de-1", "sans pays envoyé : celui de l'IP");
    ok("inscription : IP française → club en France (même si la page proposait un autre pays), sauf pays choisi par le manager");

    // 3) Page d'inscription dans un vrai navigateur.
    let chromium = null;
    try { chromium = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright").chromium; } catch (e) { /* pas de Playwright */ }
    if (chromium && fs.existsSync("/opt/pw-browsers/chromium")) {
      const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
      const { port } = server.address();
      const pickedIn = async (headers, locale) => {
        const ctx = await b.newContext({ locale, extraHTTPHeaders: headers });
        const p = await ctx.newPage();
        await p.goto(`http://127.0.0.1:${port}/bienvenue`);
        await p.waitForTimeout(700);
        const r = await p.evaluate(() => [...document.querySelectorAll('[data-country-pick] [aria-checked="true"]')].map(x => x.dataset.country));
        await ctx.close();
        return r;
      };
      assert.deepStrictEqual(await pickedIn({ "X-Forwarded-For": "85.214.1.1" }, "en-US"), ["de", "de"], "IP allemande, navigateur en anglais → Allemagne");
      assert.deepStrictEqual(await pickedIn({}, "pl-PL"), ["pl", "pl"], "sans pays d'IP : langue du navigateur (Pologne)");
      await b.close();
      ok("page d'inscription : pays de l'IP présélectionné (prioritaire sur la langue du navigateur), sinon langue du navigateur");
    } else console.log("ℹ️  Chromium absent : vérification de la page sautée");
  } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log("🏁 Pays d'après l'IP vérifié.");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
