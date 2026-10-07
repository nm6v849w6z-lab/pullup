// Mode Club : un seul menu d'onglets (demande du 2026-10-07), le contrôle
// segmenté du Vestiaire (.vs-tabs, CSS commune dans moteurbasket3.html) sur
// Vestiaire, Centre médical, Calendrier, Effectif, Histoire du club,
// Sélections nationales et fiche d'une équipe (la Coupe : voir
// national_cup_ui_test.js). Chaque menu garde ses boutons et leur action :
// un clic sur le 2e onglet change bien la vue.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const wait = async (fn, label) => { for (let i = 0; i < 150; i++) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 100)); } throw new Error("❌ attente : " + label); };

(async () => {
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  await flush(dom);
  const win = dom.window, doc = win.document;
  const pages = [
    ["Vestiaire", "TAB_HANDLERS.vestiaire()", "#vestiaireContent"],
    ["Centre médical", "TAB_HANDLERS.medical()", "#medicalContent"],
    ["Calendrier", "TAB_HANDLERS.calendrier()", "#calendrierContent"],
    ["Effectif", "TAB_HANDLERS.effectif()", "#effectifSection"],
    ["Histoire du club", "TAB_HANDLERS.histoire()", "#histoireSection"],
    ["Sélections nationales", "TAB_HANDLERS.selections()", "#nationalContent"],
    ["Fiche d'une équipe", "showTeamDetail(1)", "#teamDetailContent"],
  ];
  const css = [...doc.querySelectorAll("style")].map(s => s.textContent).join("\n");
  assert(/\.vs-tabs\.vs-tabs\{/.test(css), "composant .vs-tabs dans la feuille de styles commune de la page");
  for (const [name, js, root] of pages) {
    win.eval(js);
    if (win.__lastNational) await win.__lastNational;
    await wait(() => doc.querySelector(root + " .vs-tabs > button"), name + " : menu");
    const menu = doc.querySelector(root + " .vs-tabs");
    const btns = [...menu.querySelectorAll(":scope > button")];
    assert(btns.length >= 2 && btns.filter(b => b.classList.contains("active") || b.classList.contains("on")).length === 1, `${name} : menu commun .vs-tabs, un onglet actif`);
    const label = btns[1].textContent.trim();
    btns[1].click();
    await flush(dom);
    if (win.__lastNational) await win.__lastNational;
    await wait(() => { const b = [...doc.querySelectorAll(root + " .vs-tabs > button")].find(x => x.textContent.trim() === label); return b && (b.classList.contains("active") || b.classList.contains("on")); }, name + " : bascule");
    assert(true, `${name} : « ${label} » sélectionné au clic (action d'origine conservée)`);
  }
  win.eval("TAB_HANDLERS.vestiaire()");
  doc.querySelector('#vestiaireContent [data-vs-tab="groups"]').click();
  assert(!/Comment naissent les groupes/.test(doc.getElementById("vestiaireContent").textContent), "Vestiaire › Groupes : plus de bloc « Comment naissent les groupes »");
  dom.window.close();
  server.close();
  console.log("\n🏁 club_menus_test.js : menus du Mode Club harmonisés.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
