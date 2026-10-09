// Signets — côté navigateur (retour utilisateur 2026-10-04) : icône ☆ sur
// la fiche de n'importe quel joueur (son effectif, un adversaire), état mis à
// jour au clic, page Menu → Signets (sous Planète Hoop), persistance après
// rechargement, retrait depuis la page. Le serveur : server/bookmarks_test.js.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };

(async () => {
  const { server, baseUrl } = await startTestServer();
  let dom = await openGame(html, baseUrl);
  await flush(dom);
  let win = dom.window, doc = win.document;
  const side = [...doc.querySelectorAll(".sidebar-section-bottom .sidebar-link")].map(b => b.textContent.trim());
  assert(side.indexOf("Signets") === side.indexOf("Planète Hoop") + 1, "menu : « Signets » juste sous « Planète Hoop »");

  const mine = win.eval("({ i: myTeamIndex, id: teamA.players[0].id })");
  const opp = win.eval("(() => { const i = (myTeamIndex + 1) % league.teams.length; return { i, id: league.teams[i].players[3].id, name: league.teams[i].players[3].name }; })()");
  for (const x of [mine, opp]) {
    win.showPlayerDetail(x.i, x.id);
    const btn = () => doc.querySelector("[data-pdp-bookmark]");
    assert(btn() && btn().getAttribute("aria-pressed") === "false", `fiche ${x.id} : icône « ajouter aux signets »`);
    btn().click();
    assert(btn().getAttribute("aria-pressed") === "true" && /ajouté aux signets/.test(doc.getElementById("hmToast").textContent), "clic : état mis à jour tout de suite + « Joueur ajouté aux signets. »");
    await win.__lastBookmarkToggle;
  }
  win.eval("TAB_HANDLERS.signets()");
  await win.__lastSignets;
  let rows = [...doc.querySelectorAll("#signetsContent tbody tr")];
  assert(rows.length === 2 && rows.some(r => r.textContent.includes(opp.name)), "page Signets : les deux joueurs (le sien et un adversaire)");
  await dom.window.close();

  dom = await openGame(html, baseUrl);
  await flush(dom);
  win = dom.window; doc = win.document;
  win.eval("TAB_HANDLERS.signets()");
  await win.__lastSignets;
  rows = [...doc.querySelectorAll("#signetsContent tbody tr")];
  assert(rows.length === 2, "après rechargement : signets toujours là");
  win.showPlayerDetail(opp.i, opp.id);
  assert(doc.querySelector("[data-pdp-bookmark]").getAttribute("aria-pressed") === "true", "fiche d'un joueur en signet : icône « déjà en signets »");
  win.eval("TAB_HANDLERS.signets()");
  await win.__lastSignets;
  doc.querySelector(`#signetsContent [data-bm-remove="${opp.id}"]`).click();
  await win.__lastBookmarkToggle;
  assert(doc.querySelectorAll("#signetsContent tbody tr").length === 1 && /retiré des signets/.test(doc.getElementById("hmToast").textContent), "retrait depuis la page : « Joueur retiré des signets. »");
  await dom.window.close();

  dom = await openGame(html, baseUrl);
  await flush(dom);
  dom.window.eval("TAB_HANDLERS.signets()");
  await dom.window.__lastSignets;
  assert(dom.window.document.querySelectorAll("#signetsContent tbody tr").length === 1, "retrait enregistré (après rechargement)");
  await dom.window.close();
  server.close();
  console.log("🏁 bookmarks_ui_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
