// Matchs amicaux — onglet côté navigateur (voir renderAmicauxSection dans
// moteurbasket3.html et server/friendlies.js). Ligue partagée à 2 managers :
// A programme un amical contre un CPU (accepté tout de suite), fait jouer un
// jeune de l'académie dans la composition, invite B ; B voit la pastille,
// le message privé et accepte ; à l'heure du match, résultat + feuille de
// match (jeune marqué « (J) ») et ligne « Amical » dans le Calendrier.
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, tries = 80) {
  for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await sleep(50); }
  throw new Error("❌ délai dépassé : " + label);
}
function change(el, value) { el.value = value; el.dispatchEvent(new el.ownerDocument.defaultView.Event("change", { bubbles: true })); }

(async () => {
  // Mercredi 30 septembre 2026, 9h Paris.
  let now = Calendar.parisEpochForLocalTime(2026, 9, 30, 9);
  const league = Engine.generateMultiManagerLeague(["Alpha FR", "Bravo FR"], 1, now, Calendar.dailyAnchoredCalendarConfig());
  const A = league.teams.findIndex(t => t.name === "Alpha FR");
  const B = league.teams.findIndex(t => t.name === "Bravo FR");
  const cpu = league.teams.findIndex(t => !t.isHuman);
  const youth = Engine.generatePlayer("Meneur", 1);
  youth.age = 17;
  youth.name = "Petit Jeune";
  league.teams[A].youthPlayers = [youth];
  const tokens = [league.teams[A].managerLinkToken, league.teams[B].managerLinkToken];
  const { server, multiSavePath, baseUrl } = await startTestServer(() => now);
  await store.saveMultiLeague(league, multiSavePath);

  // --- A : page, proposition contre un CPU.
  const domA = await openGame(html, `${baseUrl}?m=${tokens[0]}`);
  const docA = domA.window.document, winA = domA.window;
  const tab = [...docA.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "amicaux");
  tab.click();
  check(!docA.getElementById("amicauxSection").classList.contains("hidden") && docA.getElementById("placeholderSection").classList.contains("hidden"), "la page Matchs amicaux s'affiche (plus de page « à venir »)");
  const oppSel = docA.getElementById("frOpponentSelect");
  check(!!oppSel.querySelector("optgroup[label='Managers']") && !!oppSel.querySelector("optgroup[label='Équipes CPU']"), "adversaires : managers et équipes CPU");
  check(docA.getElementById("frProposeBtn").disabled, "« Proposer » désactivé tant qu'aucun adversaire n'est choisi");
  change(oppSel, String(cpu));
  await waitFor(() => docA.getElementById("frDaySelect") && !docA.getElementById("frDaySelect").disabled, "jours de repos chargés");
  const dayOptions = [...docA.getElementById("frDaySelect").options].map(o => o.value);
  const officialDays = new Set(require("./server/friendlies.js").officialMatchTimesFor(Engine, league, A).map(t => require("./server/friendlies.js").dayKeyOf(t)));
  check(dayOptions.length > 0 && dayOptions.every(d => !officialDays.has(d)), `${dayOptions.length} jours de repos proposés, aucun jour de match officiel`);
  check(docA.getElementById("frTimeSelect").value === "20:00", "20h00 par défaut");
  check(/Programmer/.test(docA.getElementById("frProposeBtn").textContent), "bouton « Programmer l'amical » contre un CPU");
  docA.getElementById("frProposeBtn").click();
  await waitFor(() => docA.querySelector(".lp-feedback.ok"), "confirmation affichée");
  check(/Amical programmé/.test(docA.querySelector(".lp-feedback.ok").textContent), "amical contre le CPU programmé");
  check(docA.querySelectorAll("[data-fr-lineup]").length === 1 && /Confirmé/.test(docA.getElementById("amicauxContent").textContent), "l'amical apparaît « Confirmé » dans À venir");
  const fId = winA.eval("league.friendlies[0].id");

  // --- Composition : le jeune titulaire à la place du meneur.
  docA.querySelector(`[data-fr-lineup='${fId}']`).click();
  const youthSel = await waitFor(() => docA.querySelector(`[data-fr-role='${youth.id}']`), "le jeune apparaît dans la composition");
  check(/Académie de jeunes/.test(docA.querySelector(".fr-lineup").textContent) && /Petit Jeune/.test(docA.querySelector(".fr-lineup").textContent), "section Académie de jeunes avec le jeune");
  check(/Titulaires 5\/5/.test(docA.querySelector(".fr-lu-head").textContent), "composition par défaut : les 5 titulaires des ordres du club");
  change(youthSel, "S");
  check(docA.querySelector(`[data-fr-save='${fId}']`).disabled && /Titulaires 6\/5/.test(docA.querySelector(".fr-lu-head").textContent), "6 titulaires : enregistrement impossible");
  const starterMeneur = winA.eval("teamA.lineup.starters['Meneur']");
  change(docA.querySelector(`[data-fr-role='${starterMeneur}']`), "-");
  check(/Titulaires 5\/5/.test(docA.querySelector(".fr-lu-head").textContent) && !docA.querySelector(`[data-fr-save='${fId}']`).disabled, "le meneur habituel en tribune : 5 titulaires, enregistrement possible");
  docA.querySelector(`[data-fr-save='${fId}']`).click();
  await waitFor(() => /Composition enregistrée/.test(docA.getElementById("amicauxContent").textContent), "composition enregistrée");
  check(/1 jeune/.test(docA.getElementById("amicauxContent").textContent), "la ligne indique « 1 jeune » dans la composition");

  // --- A invite B (humain).
  change(docA.getElementById("frOpponentSelect"), String(B));
  await waitFor(() => docA.getElementById("frDaySelect") && !docA.getElementById("frDaySelect").disabled && [...docA.getElementById("frDaySelect").options].length > 0, "jours communs avec B");
  const firstDay = winA.eval("league.friendlies[0].day");
  check(![...docA.getElementById("frDaySelect").options].some(o => o.value === firstDay), "le jour déjà pris par un amical n'est plus proposé");
  check(/Envoyer l'invitation/.test(docA.getElementById("frProposeBtn").textContent), "bouton « Envoyer l'invitation » vers un manager");
  docA.getElementById("frProposeBtn").click();
  await waitFor(() => /Invitation envoyée/.test(docA.getElementById("amicauxContent").textContent), "invitation envoyée");
  check(/En attente de réponse/.test(docA.getElementById("amicauxContent").textContent), "invitation « En attente de réponse » côté A");

  // --- B : pastille, message privé, acceptation.
  const domB = await openGame(html, `${baseUrl}?m=${tokens[1]}`);
  const docB = domB.window.document, winB = domB.window;
  await waitFor(() => docB.getElementById("amicauxBadge") && !docB.getElementById("amicauxBadge").classList.contains("hidden"), "pastille d'invitation sur l'onglet");
  check(docB.getElementById("amicauxBadge").textContent === "1", "pastille « 1 » sur Matchs amicaux");
  const msgRes = await fetch(`${baseUrl}api/messages/thread?with=${A}`, { headers: { "X-TipIn-Token": tokens[1] } });
  const msg = (await msgRes.json()).messages[0];
  check(msg && /Alpha FR vous propose un amical/.test(msg.text), "B a reçu le message privé d'invitation");
  [...docB.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "amicaux").click();
  check(/Invitations reçues/.test(docB.getElementById("amicauxContent").textContent) && /Alpha FR vous invite/.test(docB.getElementById("amicauxContent").textContent), "B voit l'invitation reçue");
  docB.querySelector("[data-fr-accept]").click();
  await waitFor(() => /Amical accepté/.test(docB.getElementById("amicauxContent").textContent), "B accepte");
  check(docB.getElementById("amicauxBadge").classList.contains("hidden"), "plus de pastille une fois répondu");

  // --- Le match contre le CPU se joue à l'heure dite.
  const fAt = winA.eval("league.friendlies.find(f => f.id === '" + fId + "').at");
  now = fAt + 60 * 1000;
  const domA3 = await openGame(html, `${baseUrl}?m=${tokens[0]}`);
  const docA3 = domA3.window.document, winA3 = domA3.window;
  [...docA3.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "amicaux").click();
  const played = winA3.eval(`league.friendlies.find(f => f.id === '${fId}')`);
  check(played.status === "played" && played.result.boxScoreHome.some(r => r.id === youth.id && r.min > 0), `amical joué (${played.result.scoreHome}-${played.result.scoreAway}), le jeune a joué`);
  check(/Derniers amicaux/.test(docA3.getElementById("amicauxContent").textContent) && !!docA3.querySelector(`[data-fr-box='${fId}']`), "résultat dans « Derniers amicaux », score cliquable");
  docA3.querySelector(`[data-fr-box='${fId}']`).click();
  const box = await waitFor(() => docA3.getElementById("matchBoxscoreOverlay"), "feuille de match ouverte");
  check(/Match amical/.test(box.textContent) && /Petit Jeune \(J\)/.test(box.textContent), "feuille de match « Match amical », jeune marqué (J)");
  winA3.eval("closeMatchBoxscore()");

  // --- Calendrier : ligne « Amical » (jouée) et invitation acceptée à venir.
  [...docA3.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "calendrier").click();
  const badges = [...docA3.querySelectorAll("#calendrierSection .cal-fr-badge")];
  check(badges.length === 2, `2 lignes « Amical » dans le Calendrier (${badges.length})`);
  check(!!docA3.querySelector("#calendrierSection .fr-cal-score"), "le score de l'amical joué ouvre sa feuille de match depuis le Calendrier");

  [domA, domB, domA3].forEach(d => d.window.close());
  server.close();
  console.log("\n✅ amicaux_ui_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
