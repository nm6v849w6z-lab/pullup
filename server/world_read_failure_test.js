// Incident 2026-10-02 (« Jeu momentanément indisponible ») : une lecture
// ÉCHOUÉE du registre du monde ne doit jamais être prise pour un registre
// absent — sinon World.loadWorld en reconstruisait un neuf et recréait les
// 1res divisions des autres pays par-dessus les existantes.
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
delete process.env.UPSTASH_REDIS_REST_URL;
const Engine = require("../engine.js");
const store = require("./store.js");
const World = require("./world.js");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "world-read-fail-"));
  const savePath = path.join(dir, "multi.json");
  const now = Date.now();
  const lg = Engine.generateMultiManagerLeague(["Club A"], 1, now, { dailyAnchored: true, weekly: true });
  await store.saveMultiLeague(lg, savePath);
  // Registre illisible (JSON abîmé) : signalé comme ÉCHEC, pas comme absent.
  const worldFile = savePath.replace(/\.json$/, "") + ".world.json";
  fs.writeFileSync(worldFile, "{abîmé");
  assert.strictEqual(await store.loadWorldRaw(savePath), store.WORLD_READ_FAILED, "lecture en échec signalée comme telle");
  assert.strictEqual(await World.loadWorld(savePath, now), null, "loadWorld : indisponible plutôt qu'un registre reconstruit");
  assert.strictEqual(fs.readFileSync(worldFile, "utf-8"), "{abîmé", "registre jamais réécrit");
  assert.ok(!fs.readdirSync(dir).some(f => /us-1|it-1|de-1/.test(f)), "aucun championnat recréé");
  console.log("✅ registre illisible : « indisponible », aucune reconstruction ni réécriture");
  // Registre absent (premier démarrage) : toujours créé à partir de la ligue historique.
  fs.unlinkSync(worldFile);
  assert.strictEqual(await store.loadWorldRaw(savePath), null, "registre absent : null");
  console.log("✅ registre absent : null (création normale au premier démarrage)");
  console.log("\n🏁 world_read_failure_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
