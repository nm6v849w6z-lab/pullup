// Configurations de recherche du marché (2026-10-09) : règles (nettoyage,
// noms uniques, 20 au plus, champs inconnus ignorés) et route du compte
// (persistées sur le compte, refus sans jeton, rien sans compte).
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const MP = require("./marketPresets.js");
const { createHandler } = require("./index.js");
const store = require("./store.js");
const AccountRoutes = require("./accountRoutes.js");
process.env.BASKET_INVITE_CODE = "off";
const ok = (c, m) => { assert.ok(c, "❌ " + m); console.log("✅ " + m); };

// --- Règles ---
{
  const acc = {};
  const f = { pos: "Pivot", ageMax: 23, potMin: 4, crit: [{ key: "rebounding", min: 60 }, { key: "rebounding", min: 70 }, { key: "<script>", min: 5 }], inconnu: 42, sort: "pot" };
  let r = MP.apply(acc, { action: "save", name: "  Pivots   jeunes ", filters: f }, 1000);
  ok(r.ok && r.presets[0].name === "Pivots jeunes" && r.presets[0].v === 1, "enregistrement : nom nettoyé, format versionné");
  const pf = r.presets[0].filters;
  ok(pf.pos === "Pivot" && pf.ageMax === 23 && pf.potMin === 4 && pf.sort === "pot" && pf.ageMin === null && pf.budget === false && !("inconnu" in pf), "critères restaurés à l'identique, valeurs absentes = par défaut, champs inconnus ignorés");
  ok(pf.crit.length === 1 && pf.crit[0].key === "rebounding" && pf.crit[0].max === null, "caractéristiques : doublons et clés invalides écartés");
  r = MP.apply(acc, { action: "save", name: "pivots JEUNES", filters: { pos: "Meneur" } }, 2000);
  ok(!r.ok && r.status === 409, "même nom (casse ignorée) : refus sans écraser");
  ok(acc.marketPresets[0].filters.pos === "Pivot", "la configuration existante n'a pas été modifiée");
  r = MP.apply(acc, { action: "save", name: "pivots JEUNES", filters: { pos: "Meneur" }, overwrite: true }, 3000);
  ok(r.ok && r.presets.length === 1 && r.presets[0].filters.pos === "Meneur", "remplacement explicite (overwrite) : une seule configuration, critères mis à jour");
  const id = r.presets[0].id;
  r = MP.apply(acc, { action: "rename", id, name: "Meneurs" }, 4000);
  ok(r.ok && r.presets[0].name === "Meneurs", "renommer");
  r = MP.apply(acc, { action: "update", id, filters: { pos: "Arrière", budget: true } }, 5000);
  ok(r.ok && r.presets[0].filters.pos === "Arrière" && r.presets[0].filters.budget === true, "mettre à jour avec les critères actuels");
  for (let i = 0; i < 25; i++) MP.apply(acc, { action: "save", name: "R" + i, filters: {} }, 6000 + i);
  ok(acc.marketPresets.length === MP.MAX_PRESETS, `${MP.MAX_PRESETS} configurations au maximum`);
  r = MP.apply(acc, { action: "delete", id }, 7000);
  ok(r.ok && !r.presets.some(p => p.id === id), "supprimer");
  ok(!MP.apply(acc, { action: "save", name: "", filters: {} }).ok && !MP.apply(acc, { action: "hack" }).ok, "nom vide et action inconnue refusés");
  ok(MP.cleanFilters({ ageMin: 40, ageMax: 20 }).ageMin === 20, "bornes inversées remises dans l'ordre");
  // Ancienne configuration (champ manquant, critère ajouté depuis) : lue sans erreur.
  ok(MP.list({ marketPresets: [{ id: "x", name: "Vieille", filters: { pos: "Pivot" } }] })[0].filters.sort === "ends", "configuration ancienne : champs ajoutés depuis = valeurs par défaut");
}

// --- Route du compte ---
function start(paths) { const s = http.createServer(createHandler(paths.solo, Date.now, paths.multi, paths.accounts)); return new Promise(r => s.listen(0, "127.0.0.1", () => r(s))); }
function request(server, method, urlPath, body, headers = {}) {
  const payload = body !== undefined ? JSON.stringify(body) : null, h = { ...headers };
  if (payload) { h["Content-Type"] = "application/json"; h["Content-Length"] = Buffer.byteLength(payload); }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: urlPath, method, headers: h }, res => { let raw = ""; res.on("data", c => { raw += c; }); res.on("end", () => { let b = null; try { b = JSON.parse(raw); } catch (e) { /* rien */ } resolve({ statusCode: res.statusCode, body: b }); }); });
    req.on("error", reject); if (payload) req.write(payload); req.end();
  });
}
(async () => {
  AccountRoutes._resetMemoryForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basket-mp-test-"));
  const paths = { solo: path.join(dir, "league.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
  const { league } = store.createMultiManagerCareer(["Lyon M", "Grenoble M"], Date.UTC(2026, 8, 7));
  await store.saveMultiLeague(league, paths.multi);
  const server = await start(paths);
  try {
    ok((await request(server, "GET", "/api/account/market-presets")).statusCode === 401, "sans jeton : 401");
    const lyon = league.teams[0].managerLinkToken;
    const noAcc = await request(server, "GET", "/api/account/market-presets", undefined, { "X-TipIn-Token": lyon });
    ok(noAcc.statusCode === 200 && noAcc.body.persisted === false, "manager sans compte : rien côté serveur (le navigateur garde ses configurations)");
    const su = await request(server, "POST", "/api/account/signup", { email: "mp@x.fr", password: "motdepasse1", clubName: "Annecy Hoops" });
    const token = su.body.managerToken;
    const H = { "X-TipIn-Token": token };
    let r = await request(server, "POST", "/api/account/market-presets", { action: "save", name: "Ailiers forts", filters: { pos: "Ailier fort", potMin: 3 } }, H);
    ok(r.statusCode === 200 && r.body.persisted && r.body.presets.length === 1, "compte : enregistrée");
    r = await request(server, "POST", "/api/account/market-presets", { action: "save", name: "ailiers forts", filters: {} }, H);
    ok(r.statusCode === 409, "compte : doublon refusé (409)");
    const again = await request(server, "GET", "/api/account/market-presets", undefined, H);
    ok(again.body.presets[0].filters.pos === "Ailier fort" && again.body.presets[0].filters.potMin === 3, "relue après coup (reconnexion) : critères intacts");
    const raw = JSON.parse(fs.readFileSync(paths.accounts, "utf8"));
    ok(JSON.stringify(raw).includes("Ailiers forts"), "persistée dans le fichier des comptes");
  } finally { server.close(); }
  console.log("\n🏁 market_presets_test.js : configurations du marché conformes.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
