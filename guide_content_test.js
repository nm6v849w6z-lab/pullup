// Vérifie #54 (retour utilisateur, 2026-09 : "enrichis le guide, notamment
// les nouveautés tactiques") : le Guide couvre désormais le système de
// tactiques (Ordres), qui n'y avait jamais eu sa propre entrée malgré sa
// profondeur (3 priorités offensives parmi 10, défense, rythme), ainsi que
// les autres onglets ajoutés récemment sans explication (Académie de
// jeunes, Calendrier/Coupe, Ligue, Stats hebdo, Scoutisme). Vérifie aussi
// que ce nouveau texte respecte la règle de style du joueur ("jamais de
// tiret cadratin '—', ça fait très IA") sur les entrées ajoutées ici.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;

[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "guide").click();
const guideVisible = !doc.getElementById("guideSection").classList.contains("hidden");
if (!guideVisible) throw new Error("❌ (setup) l'onglet Guide devrait s'ouvrir.");

const entries = [...doc.querySelectorAll("#guideSection .guide-entry")];
const headings = entries.map(e => e.querySelector("h3").textContent);
console.log("Entrées du Guide :", headings.join(" | "));

const expectedNewHeadings = [
  "📋 Ordres et tactiques",
  "🧒 Académie de jeunes",
  "📅 Calendrier et 🏆 Coupe",
  "📊 Ligue",
  "📈 Stats hebdo",
  "🔎 Scoutisme",
];
const missing = expectedNewHeadings.filter(h => !headings.includes(h));
console.log(`${missing.length === 0 ? "✅" : "❌"} Toutes les nouvelles entrées attendues sont présentes.`, missing.length ? `Manquantes : ${missing.join(", ")}` : "");
if (missing.length) throw new Error("❌ Entrées de guide manquantes : " + missing.join(", "));

// --- Le contenu tactique cite bien les vraies options du jeu (pas un
// texte générique déconnecté des listes réelles OFF_TACTICS_LIST/DEF_LIST/
// RHYTHM_LIST), pour rester exact si ces listes changent un jour. ---
const tacticsEntry = entries.find(e => e.querySelector("h3").textContent === "📋 Ordres et tactiques");
const tacticsText = tacticsEntry.textContent;
const win = dom.window;
const offTactics = win.eval("OFF_TACTICS_LIST");
const defList = win.eval("DEF_LIST");
const rhythmList = win.eval("RHYTHM_LIST");
console.log("\nStyles offensifs réels :", offTactics.join(", "));
const missingOff = offTactics.filter(t => !tacticsText.includes(t));
const missingDef = defList.filter(d => !tacticsText.includes(d));
const missingRhythm = rhythmList.filter(r => !tacticsText.includes(r));
console.log(`${missingOff.length === 0 ? "✅" : "❌"} Les 10 styles offensifs réels sont tous cités dans le guide.`, missingOff.length ? `Manquants : ${missingOff.join(", ")}` : "");
console.log(`${missingDef.length === 0 ? "✅" : "❌"} Les 5 systèmes défensifs réels sont tous cités dans le guide.`, missingDef.length ? `Manquants : ${missingDef.join(", ")}` : "");
console.log(`${missingRhythm.length === 0 ? "✅" : "❌"} Les 3 rythmes réels sont tous cités dans le guide.`, missingRhythm.length ? `Manquants : ${missingRhythm.join(", ")}` : "");
if (missingOff.length || missingDef.length || missingRhythm.length) {
  throw new Error("❌ Le guide des tactiques devrait citer toutes les options réellement proposées au joueur (OFF_TACTICS_LIST/DEF_LIST/RHYTHM_LIST).");
}
if (!tacticsText.includes("exactement 3")) {
  throw new Error("❌ Le guide des tactiques devrait préciser qu'exactement 3 priorités offensives doivent être choisies.");
}

// --- Règle de style du joueur : aucun tiret cadratin dans les entrées
// ajoutées ici (les entrées PRÉEXISTANTES, écrites avant cette règle, ne
// sont pas concernées par ce test). ---
const newHeadingsSet = new Set(expectedNewHeadings);
let emDashFound = null;
entries.forEach(e => {
  const heading = e.querySelector("h3").textContent;
  if (!newHeadingsSet.has(heading)) return;
  if (e.textContent.includes("—")) emDashFound = heading;
});
console.log(`\n${emDashFound ? "❌" : "✅"} Aucun tiret cadratin ('—') dans les nouvelles entrées de guide (règle de style du joueur).`, emDashFound ? `Trouvé dans : ${emDashFound}` : "");
if (emDashFound) throw new Error(`❌ Tiret cadratin trouvé dans la nouvelle entrée '${emDashFound}' — règle de style explicite du joueur : jamais de '—'.`);

await flush(dom);
dom.window.close();
server.close();

console.log("\n🏁 Tous les tests de contenu du Guide sont passés.");

})().catch(e => { console.error(e); process.exit(1); });
