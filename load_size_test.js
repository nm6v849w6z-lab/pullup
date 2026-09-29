// Chargement mobile (2026-09-29) : page du jeu allégée (images en fichiers,
// plus en base64) et réponses compressées (brotli / gzip).
const fs = require("fs");
const http = require("http");
const zlib = require("zlib");
const assert = require("assert");
const { startTestServer } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const b64 = (html.match(/data:(image|font)\/[a-z+]+;base64,[A-Za-z0-9+/=]{20000,}/g) || []);
assert.strictEqual(b64.length, 0, "aucune grosse image en base64 ne doit rester dans la page du jeu");
assert(Buffer.byteLength(html) < 3.5e6, "la page du jeu devrait peser moins de 3,5 Mo");
for (let i = 1; i <= 8; i++) assert(fs.existsSync(`assets/arena/niveau-${i}.jpg`), `visuel de salle ${i} manquant`);
console.log(`✅ Page du jeu : ${(Buffer.byteLength(html) / 1e6).toFixed(2)} Mo, plus d'image en base64.`);
const get = (port, path, ae) => new Promise((ok, ko) => http.get({ port, path, headers: ae ? { "accept-encoding": ae } : {} }, r => {
  const chunks = []; r.on("data", c => chunks.push(c)); r.on("end", () => ok({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }));
}).on("error", ko));
(async () => {
  const { server } = await startTestServer();
  const port = server.address().port;
  const plain = await get(port, "/");
  const br = await get(port, "/", "br, gzip");
  const gz = await get(port, "/", "gzip");
  assert.strictEqual(plain.headers["content-encoding"], undefined);
  assert.strictEqual(br.headers["content-encoding"], "br");
  assert.strictEqual(gz.headers["content-encoding"], "gzip");
  assert(zlib.brotliDecompressSync(br.body).equals(plain.body), "brotli : contenu identique une fois décompressé");
  assert(zlib.gunzipSync(gz.body).equals(plain.body), "gzip : contenu identique une fois décompressé");
  assert(br.body.length < plain.body.length / 3, "brotli devrait au moins diviser par 3");
  console.log(`✅ Page du jeu transférée : ${(br.body.length / 1e6).toFixed(2)} Mo en brotli (${(plain.body.length / 1e6).toFixed(2)} Mo sans).`);
  const img = await get(port, "/assets/arena/niveau-1.jpg", "br");
  assert.strictEqual(img.status, 200); assert.strictEqual(img.headers["content-encoding"], undefined, "pas de compression sur un JPEG");
  const json = await get(port, "/api/save", "br");
  assert(json.status < 500);
  console.log("✅ Images servies telles quelles, JSON compressé si utile.");
  server.close();
  console.log("\n🏁 Chargement allégé.");
})().catch(e => { console.error(e); process.exit(1); });
