// Couleurs de maillot libres (retour utilisateur 2026-10-04 : « remplacer le
// choix limité de couleurs par une palette ») : n'importe quelle couleur
// #rrggbb, une couleur (uni) ou deux (motif Premium) ; anciennes clés
// ("rouge", "blanc_rouge"…) toujours valides ; enregistrement exact.
const assert = require("assert");
const fs = require("fs");
const E = require("./engine.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const ok = m => console.log("✅ " + m);

(async () => {
  // --- Moteur ---------------------------------------------------------------
  assert.strictEqual(E.jerseyHex("rouge"), E.JERSEY_COLORS.rouge);
  assert.strictEqual(E.jerseyHex("#1E3A8A"), "#1e3a8a");
  assert.strictEqual(E.jerseyHex("#12345"), null);
  assert.strictEqual(E.jerseyHex("red"), null);
  assert.deepStrictEqual(E.jerseyPair("blanc_rouge"), E.JERSEY_TWO_TONE_SETS.blanc_rouge);
  assert.deepStrictEqual(E.jerseyPair("#123456/#F4A300"), ["#123456", "#f4a300"]);
  assert.strictEqual(E.jerseyPair("#123456"), null);
  ok("anciennes clés et codes #rrggbb lus ; codes invalides refusés");

  const t = E.generateTeam("Couleurs", 1);
  t.setPaying(true);
  const cases = [["#123456", "#f4a300"], ["#101010", "#121212"], ["#fdfdfd", "#ffffff"], ["#000000", "#ffffff"], ["#d4af37", "#7a2b3a"]];
  for (const [c1, c2] of cases) {
    assert.ok(t.setJersey("A", c1.toUpperCase()).ok && t.setJerseyTwoTone(`${c1}/${c2}`).ok && t.setAwayJerseyColor(c2).ok && t.setAwayJerseyTwoTone(`${c2}/${c1}`).ok);
    const back = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(t))));
    assert.deepStrictEqual([back.jerseyColor, back.jerseyTwoTone, back.awayJerseyColor, back.awayJerseyTwoTone], [c1, `${c1}/${c2}`, c2, `${c2}/${c1}`]);
  }
  assert.ok(!t.setJersey("A", "#zzzzzz").ok && !t.setJerseyTwoTone("#123456/nope").ok);
  const free = E.generateTeam("Gratuit", 1);
  assert.ok(!free.setJersey("A", "#ff7f50").ok && !free.setAwayJerseyColor("#ff7f50").ok, "club gratuit : couleur libre refusée");
  assert.ok(free.setJersey("A", "violet").ok && free.setAwayJerseyColor("jaune").ok, "club gratuit : les 8 couleurs d'origine");
  free.setPaying(true); free.setJersey("A", "#ff7f50"); free.setPaying(false);
  assert.ok(free.setJersey("B", free.jerseyColor).ok && free.jerseyColor === "#ff7f50", "ex-Premium : sa couleur libre reste acceptée (changement de coupe)");
  assert.ok(!free.setJerseyTwoTone("#123456/#f4a300").ok, "deux couleurs : Premium (motifs)");
  ok("une ou deux couleurs, proches, claires, foncées, noir et blanc : enregistrées et relues exactement");

  const legacy = E.serializeTeam(E.generateTeam("Ancien", 1));
  legacy.jerseyColor = "vert"; legacy.awayJerseyColor = "blanc"; legacy.jerseyTwoTone = "noir_jaune";
  const lt = E.teamFromSave(JSON.parse(JSON.stringify(legacy)));
  assert.deepStrictEqual([lt.jerseyColor, lt.awayJerseyColor, lt.jerseyTwoTone], ["vert", "blanc", "noir_jaune"]);
  assert.strictEqual(E.jerseyHex(lt.jerseyColor), "#3fae62");
  ok("maillots existants (anciennes couleurs) conservés tels quels");

  // --- Interface + serveur + rechargement ------------------------------------
  const { server, baseUrl } = await startTestServer();
  let dom = await openGame(html, baseUrl);
  await flush(dom);
  let win = dom.window, doc = win.document;
  win.eval("TAB_HANDLERS.personnalisation()");
  const setHex = (key, v) => { const el = doc.querySelector(`[data-jc-hex="${key}"]`); el.value = v; el.dispatchEvent(new win.Event("change", { bubbles: true })); };
  assert.strictEqual(doc.querySelectorAll("#clubIdentityPanel [data-jersey-color]").length, 8, "club gratuit : les 8 couleurs d'origine");
  assert.ok(!doc.querySelector("[data-jc-input]"), "club gratuit : pas de couleur libre");
  win.eval("teamA.setPaying(true); saveMyTeam(); syncPayingToServer(true); renderPersonnalisationSection();");
  await new Promise(r => setTimeout(r, 300));
  assert.ok(doc.querySelector('[data-jc-input="home-1"]') && !doc.querySelector('[data-jc-hex="home-2"]'), "Premium uni : une seule couleur, sélecteur libre");
  const inp = doc.querySelector('[data-jc-input="home-1"]');
  inp.value = "#ff00ff"; inp.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert.ok(doc.querySelector('[data-pz-jersey="home"] .pz-jersey-stage').innerHTML.includes("#ff00ff") && win.eval("teamA.jerseyColor") !== "#ff00ff", "aperçu immédiat, sans enregistrer");
  setHex("home-1", "#123456");
  assert.strictEqual(win.eval("teamA.jerseyColor"), "#123456");
  doc.querySelector('#clubIdentityPanel [data-jersey-pattern="rayures"]').click();
  assert.ok(doc.querySelector('[data-jc-hex="home-2"]'), "motif : deux couleurs");
  assert.ok(win.eval("teamA.jerseyTwoTone").startsWith("#123456/"), "la paire part de la couleur du maillot");
  setHex("home-2", "F4A300");
  setHex("away-1", "#FFFFFF");
  assert.deepStrictEqual(JSON.parse(win.eval("JSON.stringify([teamA.jerseyColor, teamA.jerseyTwoTone, teamA.awayJerseyColor])")), ["#123456", "#123456/#f4a300", "#ffffff"]);
  ok("interface : sélecteur libre, aperçu immédiat, 1 puis 2 couleurs");
  await new Promise(r => setTimeout(r, 800));
  await flush(dom);
  await dom.window.close();

  dom = await openGame(html, baseUrl);
  await flush(dom);
  win = dom.window;
  assert.deepStrictEqual(JSON.parse(win.eval("JSON.stringify([teamA.jerseyColor, teamA.jerseyTwoTone, teamA.awayJerseyColor, teamA.jerseyPattern])")), ["#123456", "#123456/#f4a300", "#ffffff", "rayures"]);
  ok("après rechargement (serveur) : couleurs exactement identiques");
  await dom.window.close();
  server.close();
  console.log("🏁 jersey_free_colors_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
