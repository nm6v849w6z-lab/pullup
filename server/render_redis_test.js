// Bascule vers Render Key Value (2026-10-02) : stockage par REDIS_URL
// (protocole Redis direct) et script de copie depuis Upstash. Lance un vrai
// redis-server local s'il est installé, sinon le test est sauté.
const assert = require("assert");
const { spawn, execSync } = require("child_process");
const net = require("net");

function hasRedis() { try { execSync("command -v redis-server", { stdio: "ignore" }); return true; } catch (e) { return false; } }
function freePort() {
  return new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}

(async () => {
  if (!hasRedis()) { console.log("⏭️  redis-server absent : test sauté"); return; }
  const port = await freePort();
  const srv = spawn("redis-server", ["--port", String(port), "--save", "", "--appendonly", "no", "--requirepass", "secret"], { stdio: "ignore" });
  try {
    await new Promise(r => setTimeout(r, 400));
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.REDIS_URL = `redis://:secret@127.0.0.1:${port}`;
    const Engine = require("../engine.js");
    const store = require("./store.js");
    assert.strictEqual(store.upstashConfigured(), true);
    assert.strictEqual(store.storageBackendName(), "redis");

    // Valeurs : écriture compressée, relecture après vidage de la mémoire.
    const lg = Engine.generateMultiManagerLeague(["Render"], 1, Date.now(), { dailyAnchored: true, weekly: true });
    await store.saveMultiLeague(lg, "/tmp/ignored.json");
    const { createClient } = require("./redisClient.js");
    const direct = createClient(process.env.REDIS_URL);
    const keys = await direct.command("KEYS", "*");
    assert.strictEqual(keys.length, 1);
    const raw = await direct.command("GET", keys[0]);
    assert.ok(raw.startsWith("gz1:"), "valeur compressée");
    store.clearRedisCache();
    const back = await store.loadMultiLeague("/tmp/ignored.json");
    assert.ok(back && back.league.teams.length === lg.teams.length, "relecture depuis Redis");
    console.log("✅ ligue écrite et relue sur Redis (REDIS_URL)");

    // Texte accentué et grosse valeur : longueurs en octets correctes.
    const big = JSON.stringify({ t: "é€😀".repeat(50000) });
    await store.redisSet("test:big", big);
    store.clearRedisCache();
    assert.strictEqual(await store.redisGet("test:big"), big);
    assert.strictEqual(await store.redisGet("test:absente"), null, "clé absente : null");
    console.log("✅ valeurs accentuées et volumineuses intactes, clé absente = null");

    // Requêtes simultanées : chaque réponse revient à la bonne requête.
    await Promise.all(Array.from({ length: 30 }, (_, i) => store.redisSet(`test:p${i}`, `v${i}`)));
    store.clearRedisCache();
    const vals = await Promise.all(Array.from({ length: 30 }, (_, i) => store.redisGet(`test:p${i}`)));
    vals.forEach((v, i) => assert.strictEqual(v, `v${i}`));
    console.log("✅ 30 lectures simultanées dans le bon ordre");

    const h = await store.storageHealth("/tmp/ignored.json");
    assert.strictEqual(h.storage, "redis");
    console.log("✅ /api/health/storage indique redis");

    // Mauvais mot de passe : erreur, jamais « clé absente ».
    const bad = createClient(`redis://:faux@127.0.0.1:${port}`);
    await assert.rejects(bad.command("GET", "x"));
    bad.quit();
    console.log("✅ mot de passe faux : erreur");

    // Script de copie depuis un faux Upstash.
    const upstashKv = new Map([["pullup:world", "gz1:abc"], ["pullup:accounts", '{"a":1}'], ["pullup:liste", null]]);
    const fakeFetch = async (url) => {
      const parts = url.replace("https://fake.upstash/", "").split("/").map(decodeURIComponent);
      let result;
      if (parts[0] === "scan") result = parts[1] === "0" ? ["7", ["pullup:world", "pullup:liste"]] : ["0", ["pullup:accounts"]];
      else if (parts[0] === "type") result = upstashKv.get(parts[1]) === null ? "list" : "string";
      else if (parts[0] === "get") result = upstashKv.get(parts[1]);
      return { ok: true, status: 200, json: async () => ({ result }) };
    };
    const { migrate } = require("../scripts/migrate_upstash_to_redis.js");
    const res = await migrate({ upstashUrl: "https://fake.upstash", upstashToken: "t", redisUrl: process.env.REDIS_URL, fetchImpl: fakeFetch, log: () => {} });
    assert.strictEqual(res.copied, 2);
    assert.strictEqual(res.skipped.length, 1, "clé non texte signalée");
    assert.strictEqual(await direct.command("GET", "pullup:world"), "gz1:abc");
    assert.strictEqual(await direct.command("GET", "pullup:accounts"), '{"a":1}');
    console.log("✅ script de copie : clés copiées à l'identique et vérifiées");
    direct.quit();
    console.log("\n✅ render_redis_test.js : tout est vert");
    process.exit(0);
  } finally {
    srv.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
