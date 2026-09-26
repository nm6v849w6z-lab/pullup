// « Aller au direct » depuis l'émission d'avant-match (retour utilisateur,
// 2026-09-26) : « le bouton aller au direct fais sortir de l'émission du
// match. Il faudrait pouvoir aller sur le live avant mais avec tout affiché
// à 0 comme il ne se passe rien ». Vérifie : le bouton ouvre la page live
// AVANT le coup d'envoi (tout à zéro, « Avant-match », compte à rebours), la
// vue live sait afficher cet état, et la même page bascule sur le vrai
// direct au coup d'envoi, sans rien recharger.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { JSDOM } = require("jsdom");
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
const kickoff = win.eval("scheduledTimeForCurrentMatch()");
assert(typeof kickoff === "number", "Prochain match avec un horaire");

clock.now = kickoff - 4 * 60 * 1000;
win.eval("startCountdown()");
await win.eval("openHoopShow('prematch')");
assert(!doc.getElementById("hoopShowSection").classList.contains("hidden"), "Émission d'avant-match ouverte");
const last = win.eval("hoopShowPlayer.index") ;
win.eval("hoopShowPlayer.goTo(document.querySelectorAll('.hs-barbtn').length - 1)");
const goLive = doc.querySelector('#hoopShowSection [data-hs-action="golive"]');
assert(!!goLive, "Bouton « Aller au direct » sur la dernière rubrique");
goLive.click();
await flush(dom);

assert(doc.getElementById("hoopShowSection").classList.contains("hidden"), "L'émission se ferme");
assert(!doc.getElementById("liveSection").classList.contains("hidden"), "…et la page live s'ouvre (on ne retombe plus hors de l'émission)");
assert(win.eval("hmLive && hmLive.match && hmLive.match.pregame === true"), "Page live en mode avant-match");
assert(doc.getElementById("scoreA").textContent === "0" && doc.getElementById("scoreB").textContent === "0", "Score 0 – 0");
assert(doc.getElementById("clockDisplay").textContent === "10:00", "Horloge à 10:00");
assert(/Avant-match/.test(doc.getElementById("quarterLabel").textContent), "Libellé « Avant-match »");
const st = win.eval("JSON.parse(JSON.stringify(hmLiveBuildState()))");
assert(st.status === "pregame", "État de la vue : pregame");
assert(st.kickoffIn > 200 && st.kickoffIn <= 240, `Compte à rebours jusqu'au coup d'envoi (${st.kickoffIn} s)`);
const everyone = st.teams.flatMap(t => t.players);
assert(everyone.length >= 10, "Feuilles de match des deux équipes présentes");
assert(everyone.every(p => p.pts === 0 && p.reb === 0 && p.ast === 0 && p.seconds === 0 && !p.onCourt), "Tous les joueurs à zéro, personne sur le terrain");
assert(st.teams.every(t => t.score === 0) && st.events.length === 0 && st.shots.length === 0, "Aucun point, aucune action, aucun tir");

// Vue live : rendu de l'état avant-match.
const vdom = new JSDOM('<!doctype html><div id="root"></div>');
const root = vdom.window.document.getElementById("root");
const { createLiveView } = await import(pathToFileURL(path.join(__dirname, "assets/live/live-view.js")).href);
const view = createLiveView(root, { quarterLength: 600 });
view.update(st);
const $ = sel => root.querySelector(sel);
assert(/^Avant-match/.test($("[data-ref=kicker]").textContent), "Vue : bandeau « Avant-match » (pas « En direct »)");
assert(/Coup d'envoi dans \d+:\d\d/.test($("[data-ref=period]").textContent), "Vue : « Coup d'envoi dans m:ss »");
assert($("[data-ref=liveDot]").classList.contains("done"), "Vue : pastille du direct éteinte");
assert($("[data-ref=clock]").textContent === "10:00", "Vue : horloge 10:00");
assert(root.querySelectorAll(".ld-tile").length === 0, "Vue : pas de « hommes du match » avant le coup d'envoi");
view.destroy && view.destroy();

// Coup d'envoi page ouverte : bascule sur le vrai direct.
clock.now = kickoff + 2000;
for (let i = 0; i < 60 && !win.eval("!!(league && league.liveMatch)"); i++) await sleep(100);
await flush(dom);
assert(win.eval("!!(league && league.liveMatch)"), "Au coup d'envoi, le vrai direct est chargé");
assert(win.eval("hmLive && hmLive.match && !hmLive.match.pregame"), "La page live passe en direct");
assert(!doc.getElementById("liveSection").classList.contains("hidden"), "On reste sur la page live");

win.close(); server.close();
console.log("\n🏁 Page live d'avant-match vérifiée.");
process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
