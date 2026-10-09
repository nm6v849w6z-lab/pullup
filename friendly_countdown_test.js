// Compte à rebours vivant (BUG 2026-10-09 : « dans l'onglet Match amical,
// le temps ne descend pas, les secondes restent figées jusqu'au
// rafraîchissement ») : les cartes « Prochain match » (amical, championnat,
// coupe, calendrier d'un club) portent data-countdown-to ; UN seul minuteur
// les met à jour chaque seconde, sans requête, onglet visible seulement.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const ok = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const win = dom.window, doc = win.document;
  const opp = win.eval("myTeamIndex === 0 ? 1 : 0");
  const at = Date.now() + 125000;
  const card = win.eval(`calendarNextMatchCardHtml({ competition: "fr", label: "Match amical", isHome: true, opponentIdx: ${opp}, scheduledAt: ${at}, location: "Domicile", isLive: false })`);
  ok(/data-countdown-to="\d+"/.test(card), "carte « Prochain match · Amical » : compte à rebours marqué (data-countdown-to)");
  const box = doc.createElement("div"); box.innerHTML = card; doc.body.appendChild(box);
  const el = box.querySelector("[data-countdown-to]");
  // JSDOM se déclare « onglet masqué » : page affichée pour ce test.
  Object.defineProperty(doc, "hidden", { configurable: true, get: () => false });
  const t0 = el.textContent;
  await sleep(2300);
  const t1 = el.textContent;
  ok(/min \d+ s/.test(t0) && t1 !== t0, `les secondes défilent sans rechargement (${t0} → ${t1})`);
  // Un seul minuteur, quel que soit le nombre de cartes et de rendus.
  const n0 = win.eval("hmCountdownTimer");
  win.eval("hmStartCountdowns(); hmStartCountdowns();");
  ok(win.eval("hmCountdownTimer") === n0 && n0, "un seul minuteur partagé (pas de minuteurs concurrents)");
  // Calendrier d'un club (autre carte) : idem.
  const card2 = win.eval(`teamCalendarNextCardHtml(${opp}, { competition: "fr", label: "Match amical", isHome: false, opponentIdx: myTeamIndex, scheduledAt: ${at}, location: "Extérieur" })`);
  ok(/data-countdown-to="\d+"/.test(card2), "calendrier d'un club : compte à rebours vivant aussi");
  // Coup d'envoi passé : « 0 s », jamais de valeur négative.
  el.dataset.countdownTo = String(Date.now() - 5000);
  await sleep(1200);
  ok(el.textContent === "0 s", "coup d'envoi passé : « 0 s »");
  // Onglet masqué : rien n'est recalculé (aucun travail en arrière-plan).
  Object.defineProperty(doc, "hidden", { configurable: true, get: () => true });
  el.dataset.countdownTo = String(Date.now() + 600000); el.textContent = "x";
  await sleep(1200);
  ok(el.textContent === "x", "onglet masqué : le minuteur ne fait rien");
  Object.defineProperty(doc, "hidden", { configurable: true, get: () => false });
  await sleep(1200);
  ok(/min/.test(el.textContent), "retour sur l'onglet : valeur juste aussitôt (" + el.textContent + ")");
  dom.window.close(); server.close();
  console.log("\n🏁 friendly_countdown_test.js : compte à rebours vivant.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
