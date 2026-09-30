// Page d'accueil (/bienvenue) : « Mot de passe oublié ? » puis lien reçu
// (#reinit=…) → nouveau mot de passe et connexion. Voir
// assets/site/index.html et server/accountRoutes.js.
// Inscriptions sur invitation par défaut (voir accountRoutes.js, DEFAULT_INVITE_CODE) : ouvertes ici.
process.env.BASKET_INVITE_CODE = "off";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { JSDOM, VirtualConsole } = require("jsdom");
const store = require("./server/store.js");
const { createHandler } = require("./server/index.js");
const ok = m => console.log("✅ " + m);
const wait = async (cond, what) => { for (let i = 0; i < 100; i++) { if (cond()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error(`délai dépassé : ${what}`); };

(async () => {
  delete process.env.RESEND_API_KEY;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sitereset-"));
  const paths = { solo: path.join(dir, "solo.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
  const server = http.createServer(createHandler(paths.solo, Date.now, paths.multi, paths.accounts));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const career = store.createMultiManagerCareer(["Lyon Site", "Paris Site"], Date.now() - 86400000, "Lyon Site");
  await store.saveMultiLeague(career.league, paths.multi);
  const su = await (await fetch(base + "/api/account/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "site@test.fr", password: "ancienmotdepasse", clubName: "Annecy Site" }) })).json();
  assert.strictEqual(su.status, "active");

  const logs = [];
  const origLog = console.log;
  console.log = (...a) => { logs.push(a.join(" ")); if (!String(a[0]).startsWith("[comptes]")) origLog(...a); };
  const html = await (await fetch(base + "/bienvenue")).text();
  const open = url => new JSDOM(html, {
    url, runScripts: "dangerously", virtualConsole: new VirtualConsole(),
    beforeParse(w) { w.fetch = (input, init) => fetch(new URL(input, w.location.href).href, init); },
  });

  // 1) Demande du lien.
  let dom = open(base + "/bienvenue");
  let doc = dom.window.document;
  doc.getElementById("tabLogin").click();
  doc.getElementById("liEmail").value = "site@test.fr";
  doc.getElementById("forgotLink").click();
  assert.ok(doc.getElementById("viewForgot").classList.contains("is-active"));
  assert.strictEqual(doc.getElementById("fgEmail").value, "site@test.fr", "email repris du formulaire de connexion");
  doc.getElementById("forgotForm").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await wait(() => doc.getElementById("forgotMsg").textContent.length > 0, "message après la demande");
  assert.ok(/Discord/.test(doc.getElementById("forgotMsg").textContent), "sans email configuré : renvoi vers le Discord");
  const line = logs.find(l => l.includes("#reinit="));
  assert.ok(line);
  dom.window.close();
  ok("« Mot de passe oublié ? » : formulaire, demande envoyée, message adapté (envoi d'email non configuré)");

  // 2) Lien reçu : nouveau mot de passe → connecté.
  dom = open(base + "/bienvenue#reinit=" + line.split("#reinit=")[1].trim());
  doc = dom.window.document;
  assert.ok(doc.getElementById("viewReset").classList.contains("is-active"), "vue « Nouveau mot de passe »");
  doc.getElementById("rsPw").value = "nouveaumotdepasse";
  doc.getElementById("resetForm").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await wait(() => dom.window.localStorage.getItem("tipinManagerToken_v1"), "connexion après réinitialisation");
  assert.strictEqual(dom.window.localStorage.getItem("tipinManagerToken_v1"), su.managerToken);
  dom.window.close();
  ok("lien reçu : nouveau mot de passe enregistré et connexion directe au club");

  console.log = origLog;
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("\n🏁 site_password_reset_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
