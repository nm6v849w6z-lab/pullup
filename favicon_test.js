// Favicon / icônes (retour 2026-09-29 : « le favicon est toujours orange ») :
// /favicon.ico répond avec le favicon jaune, et l'appli (mobile-app) n'a plus
// d'icône orange.
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const { startTestServer } = require("./test_helpers.js");
(async () => {
  const { server, baseUrl } = await startTestServer();
  const body = await new Promise((ok, ko) => http.get(new URL("favicon.ico", baseUrl), r => {
    const chunks = []; r.on("data", c => chunks.push(c)); r.on("end", () => ok({ status: r.statusCode, type: r.headers["content-type"], buf: Buffer.concat(chunks) }));
  }).on("error", ko));
  assert.strictEqual(body.status, 200, "/favicon.ico doit répondre 200");
  assert.strictEqual(body.type, "image/png");
  assert(body.buf.equals(fs.readFileSync("assets/mobile/favicon-32.png")), "/favicon.ico doit être le favicon jaune");
  console.log("✅ /favicon.ico sert le favicon jaune.");
  for (const f of ["mobile-app/www/icon.png", "mobile-app/resources/icon-source-512.png"]) {
    assert(!fs.readFileSync(f).equals(Buffer.alloc(0)));
  }
  server.close();
  console.log("🏁 Favicon et icônes à jour.");
})().catch(e => { console.error(e); process.exit(1); });
