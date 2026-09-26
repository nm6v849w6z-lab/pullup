// Retour utilisateur (2026-09-26, capture du tableau de bord à 07:56 pour un
// match à 07:57) : "les ordres ne sont pas bloqués 5 min avant le match et il
// n'y a pas l'émission de l'avant match qui est proposée". Vérifie qu'en
// franchissant T − 5 min PAGE OUVERTE (sans recharger) : le tableau de bord
// propose l'émission, la tâche Ordres devient « Émission d'avant-match »,
// le bouton du topbar ouvre l'émission, et l'écran Ordres est figé.
const fs = require("fs");
const { startTestServer, openGame, flush, patchDateNow } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
const clock = { now: Date.now() };
const { server, baseUrl } = await startTestServer(() => clock.now);
const dom = await openGame(html, baseUrl, (w) => patchDateNow(w, () => clock.now));
patchDateNow(dom.window, () => clock.now);
await flush(dom);
const doc = dom.window.document, win = dom.window;
const clickTab = k => [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === k).click();
const hero = () => doc.querySelector(".hm-hero");
const kickoff = win.eval("scheduledTimeForCurrentMatch()");
assert(typeof kickoff === "number" && win.eval("currentMatch.competition !== 'cup'"), "Prochain match de championnat avec un horaire");

clock.now = kickoff - 6 * 60 * 1000;
win.eval("startCountdown()");
clickTab("economie"); clickTab("club");
assert(!!hero().querySelector('[data-dash-href="/ordres"]') && !hero().querySelector('[data-dash-href="/emission-avant-match"]'), "À T-6 min : bandeau habituel, pas encore d'émission");
assert(!/Émission/.test(doc.getElementById("topbarOrdersBtn").textContent), "À T-6 min : bouton du topbar habituel");

// Franchit T-5 min SANS recharger : le compte à rebours (1 s) doit réagir.
clock.now = kickoff - 4 * 60 * 1000;
await sleep(1300);
assert(!!hero().querySelector('[data-dash-href="/emission-avant-match"]'), "À T-4 min, page ouverte : bouton « Émission d'avant-match » dans le bandeau");
assert(/Verrouillés|verrouillés/.test(hero().textContent), "Le bandeau indique que les ordres sont verrouillés");
assert(/Émission d'avant-match vs/.test(doc.getElementById("clubSection").textContent), "Tâche « Émission d'avant-match » dans Cette semaine");
assert(/Émission/.test(doc.getElementById("topbarOrdersBtn").textContent), "Topbar : bouton « Émission d'avant-match »");

// Le clic ouvre bien l'émission (route serveur réelle).
hero().querySelector('[data-dash-href="/emission-avant-match"]').click();
for (let i = 0; i < 40 && doc.getElementById("hoopShowSection").classList.contains("hidden"); i++) await sleep(50);
assert(!doc.getElementById("hoopShowSection").classList.contains("hidden"), "Le clic ouvre l'émission d'avant-match");
win.eval("closeHoopShow()");

// Écran Ordres figé + bandeau.
win.eval("goToOrdresTab()");
assert(win.eval("ordresPanelLocked") === true, "Écran Ordres : panneau verrouillé");
assert(!!doc.getElementById("hoopShowPrematchBtn"), "Écran Ordres : bouton de l'émission présent");

await flush(dom);
win.close(); server.close();
console.log("\n🏁 Verrou T-5 min et accès à l'émission d'avant-match vérifiés.");
process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
