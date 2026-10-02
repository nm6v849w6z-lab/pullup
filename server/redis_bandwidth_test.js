// Volume transféré vers Upstash (incident 2026-10-02 : base suspendue pour
// dépassement de bande passante) : valeurs compressées, relectures servies
// par la mémoire du serveur, anciennes valeurs en clair toujours lisibles.
const assert = require("assert");
process.env.UPSTASH_REDIS_REST_URL = "https://fake-upstash.example";
process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const Engine = require("../engine.js");
const store = require("./store.js");
let back0;
(async () => {
  const kv = new Map(), calls = [];
  store._setFetchImplForTests(async (url, opts = {}) => {
    calls.push({ url, method: opts.method || "GET" });
    const key = decodeURIComponent(url.split("/").pop());
    if (url.includes("/set/")) { kv.set(key, opts.body); return { ok: true, status: 200, json: async () => ({ result: "OK" }) }; }
    return { ok: true, status: 200, json: async () => ({ result: kv.has(key) ? kv.get(key) : null }) };
  });
  const lg = Engine.generateMultiManagerLeague(["Bande passante"], 1, Date.now(), { dailyAnchored: true, weekly: true });
  await store.saveMultiLeague(lg, "/tmp/ignored.json");
  const [key, stored] = [...kv.entries()][0];
  const plain = JSON.stringify(store.serializeMultiLeague(lg));
  assert.ok(stored.startsWith("gz1:"), "valeur compressée");
  assert.ok(stored.length * 4 < plain.length, `au moins 4 fois plus petite (${stored.length} contre ${plain.length})`);
  console.log(`✅ compression : ${Math.round(plain.length / 1024)} Ko → ${Math.round(stored.length / 1024)} Ko`);
  calls.length = 0;
  for (let i = 0; i < 5; i++) assert.ok(await store.loadMultiLeague("/tmp/ignored.json"), "relecture");
  assert.strictEqual(calls.filter(c => c.method === "GET").length, 0, "relectures servies par la mémoire (aucune requête)");
  console.log("✅ mémoire : 5 relectures sans aucune requête Upstash");
  // Première relecture : numéros de maillot attribués, donc une écriture ;
  // ensuite, une ligue relue et réécrite sans changement n'envoie rien.
  await store.saveMultiLeague((await store.loadMultiLeague("/tmp/ignored.json")).league, "/tmp/ignored.json");
  calls.length = 0;
  await store.saveMultiLeague(back0 = (await store.loadMultiLeague("/tmp/ignored.json")).league, "/tmp/ignored.json");
  assert.strictEqual(calls.filter(c => c.method === "POST").length, 0, "écriture identique : rien envoyé");
  console.log("✅ écriture sans changement : rien envoyé");
  store.clearRedisCache();
  const back = await store.loadMultiLeague("/tmp/ignored.json");
  assert.ok(back && back.league.teams.length === lg.teams.length, "relecture après redémarrage (décompression)");
  assert.strictEqual(calls.filter(c => c.method === "GET").length, 1, "une seule lecture réseau après redémarrage");
  console.log("✅ après redémarrage : une lecture, valeur décompressée");
  // Ancienne valeur en JSON clair (avant compression) : toujours lisible.
  kv.set(key, plain); store.clearRedisCache();
  assert.ok(await store.loadMultiLeague("/tmp/ignored.json"), "ancienne valeur en clair lisible");
  console.log("✅ ancienne sauvegarde non compressée : lisible");
  // Réponse d'erreur d'Upstash (base suspendue) : échec, jamais « absente ».
  store._setFetchImplForTests(async () => ({ ok: true, status: 200, json: async () => ({ error: "ERR max bandwidth limit exceeded" }) }));
  await assert.rejects(() => store.redisGet("x"), /bandwidth/);
  console.log("✅ base suspendue : erreur remontée, pas « clé absente »");
  console.log("\n🏁 redis_bandwidth_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
