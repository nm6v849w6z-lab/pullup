// Guide structuré avec un sommaire (retour utilisateur 2026-09-26 : "ce
// serait bien de structurer le guide avec un menu, plutôt qu'un long
// texte") + contenu enrichi ("niveaux de potentiel [...] pros ou jeunes du
// centre de formation"). Voir renderGuideSection/guideShowEntry.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {
const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "guide").click();

const entries = [...doc.querySelectorAll("#guideSection .guide-entry")].filter(e => !e.classList.contains("hidden"));
const navBtns = [...doc.querySelectorAll("#guideNav .gd-nav-btn")];
if (navBtns.length !== entries.length) throw new Error(`❌ Une entrée de sommaire par sujet attendue : ${navBtns.length} boutons pour ${entries.length} entrées.`);
const shown = () => entries.filter(e => !e.classList.contains("gd-off"));
if (shown().length !== 1) throw new Error(`❌ Une seule entrée affichée à la fois, obtenu ${shown().length}.`);
console.log(`✅ Sommaire : ${navBtns.length} sujets, une entrée affichée à la fois.`);

navBtns.find(b => b.dataset.guideGoto === "potentiel").click();
const pot = shown()[0];
if (!pot || pot.querySelector("h3").textContent !== "Potentiel") throw new Error("❌ Cliquer « Potentiel » dans le sommaire devrait afficher cette entrée.");
const tiers = win.eval("POTENTIAL_TIERS.map(t => t.label)");
const missing = tiers.filter(t => !pot.textContent.includes(t));
if (missing.length) throw new Error("❌ Paliers de potentiel manquants dans le guide : " + missing.join(", "));
["Espoir", "Grand espoir", "Prodige"].forEach(l => { if (!pot.textContent.includes(l)) throw new Error(`❌ Estimation des jeunes « ${l} » absente du guide.`); });
// Les estimations des jeunes correspondent bien aux paliers réels.
const check = win.eval("[5, 6, 8, 9].map(i => youthProspectLabel(POTENTIAL_TIERS[i - 1].max))");
if (JSON.stringify(check) !== JSON.stringify(["Espoir", "Grand espoir", "Grand espoir", "Prodige"])) throw new Error("❌ Le tableau des jeunes du guide ne correspond plus à youthProspectLabel : " + check.join(", "));
console.log("✅ Les 10 paliers pro et les 3 estimations des jeunes sont dans le guide, alignés sur le code.");

// Lien interne (Académie -> Potentiel).
navBtns.find(b => b.dataset.guideGoto === "academie").click();
shown()[0].querySelector('.gd-link[data-guide-goto="potentiel"]').click();
if (shown()[0].dataset.guideId !== "potentiel") throw new Error("❌ Le lien « Potentiel » de l'entrée Académie devrait ouvrir l'entrée Potentiel.");
["alchimie", "connaissance", "direct"].forEach(id => { if (!navBtns.some(b => b.dataset.guideGoto === id)) throw new Error(`❌ Entrée « ${id} » attendue dans le sommaire.`); });
console.log("✅ Liens internes et nouvelles entrées (Alchimie, Connaissance tactique, Match en direct) présents.");
fs.mkdirSync("Claude outputs/guide", { recursive: true });
fs.writeFileSync("Claude outputs/guide/snap.html", doc.getElementById("guideSection").outerHTML);

await flush(dom);
dom.window.close();
server.close();
console.log("\n🏁 Guide avec sommaire : tous les tests passent.");
})().catch(e => { console.error(e); process.exit(1); });
