// Ligues privées (Premium) — onglet "Ligues privées" côté navigateur (voir
// renderLpSection dans moteurbasket3.html et server/privateLeague.js).
// Ligue multi-manager de test avec 3 clubs humains : A crée une ligue, B la
// rejoint par code, le créateur la lance (4 clubs minimum → refus à 2), puis
// on avance au vendredi à l'heure choisie (20h00) et on vérifie classement, calendrier et
// feuille de match — et qu'un club non Premium voit les boutons désactivés.
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, tries = 60) {
  for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await sleep(50); }
  throw new Error("❌ délai dépassé : " + label);
}

(async () => {
  // Mercredi 30 septembre 2026, 9h Paris.
  let now = Calendar.parisEpochForLocalTime(2026, 9, 30, 9);
  const names = ["Alpha LP", "Bravo LP", "Charlie LP", "Delta LP"];
  const league = Engine.generateMultiManagerLeague(names, names.length, now, Calendar.dailyAnchoredCalendarConfig());
  const humans = league.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
  // A, B, C Premium ; D reste gratuit.
  humans.slice(0, 3).forEach(i => { league.teams[i].isPaying = true; });
  const tokens = humans.map(i => league.teams[i].managerLinkToken);

  const { server, multiSavePath, baseUrl } = await startTestServer(() => now);
  await store.saveMultiLeague(league, multiSavePath);

  // --- A : onglet présent, création.
  const domA = await openGame(html, `${baseUrl}?m=${tokens[0]}`);
  const docA = domA.window.document, winA = domA.window;
  const tab = [...docA.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "lp");
  check(!!tab, "onglet « Ligues privées » présent dans la barre latérale");
  tab.click();
  check(!docA.getElementById("lpSection").classList.contains("hidden"), "la page Ligues privées s'affiche");
  check(!!docA.getElementById("lpCreateBtn") && !docA.getElementById("lpCreateBtn").disabled, "formulaire de création actif pour un club Premium");
  docA.querySelector("[data-lp-venue='neutral']").click();
  check(winA.eval("lpUi.venue") === "neutral", "choix du terrain neutre pris en compte");
  docA.querySelector("[data-lp-venue='home']").click();
  docA.getElementById("lpNameInput").value = "Coupe des Potes";
  docA.getElementById("lpSizeSelect").value = "6";
  check(!docA.querySelector("#lpContent .lp-kicker") && !docA.querySelector(".lp-venue-sub") && !/récupèrent|Aucun bonus|Aller-retour dans la salle|Une compétition à part/.test(docA.getElementById("lpContent").textContent), "page d'accueil épurée : ni titre jaune, ni textes d'explication");
  check(docA.getElementById("lpTimeSelect").value === "21:30" && docA.getElementById("lpTimeSelect").options.length === 32, "heure des matchs : 32 créneaux, 21h30 par défaut");
  docA.getElementById("lpTimeSelect").value = "20:00";
  docA.getElementById("lpCreateBtn").click();
  await waitFor(() => docA.querySelector(".lp-code"), "code d'invitation affiché après création");
  const code = docA.querySelector(".lp-code").textContent.trim();
  check(/^[A-Z2-9]{6}$/.test(code), `code d'invitation affiché (${code})`);
  check(docA.querySelectorAll(".lp-member").length === 6 && docA.querySelectorAll(".lp-member-empty").length === 5, "salle d'attente : 1 inscrit, 5 places libres");
  check(!!docA.getElementById("lpStartBtn") && docA.getElementById("lpStartBtn").disabled, "« Lancer maintenant » désactivé à 1 club");

  // --- D (gratuit) : tout est désactivé.
  const domD = await openGame(html, `${baseUrl}?m=${tokens[3]}`);
  const docD = domD.window.document;
  [...docD.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "lp").click();
  check(!!docD.querySelector(".lp-premium-note") && docD.getElementById("lpCreateBtn").disabled && docD.getElementById("lpJoinBtn").disabled, "club gratuit : note Premium et boutons désactivés");
  check(!/[A-Z2-9]{6}/.test(JSON.stringify(domD.window.eval("league.privateLeagues[0].code"))), "le code d'invitation n'est pas envoyé à un non-membre");
  domD.window.close();

  // --- B et C rejoignent par code (B via l'interface, C via l'API).
  const domB = await openGame(html, `${baseUrl}?m=${tokens[1]}`);
  const docB = domB.window.document;
  [...docB.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "lp").click();
  docB.getElementById("lpCodeInput").value = "ZZZZZZ";
  docB.getElementById("lpJoinBtn").click();
  await waitFor(() => docB.querySelector(".lp-feedback.err"), "erreur affichée pour un mauvais code");
  check(true, "mauvais code : message d'erreur affiché");
  docB.getElementById("lpCodeInput").value = code.toLowerCase();
  docB.getElementById("lpJoinBtn").click();
  await waitFor(() => docB.querySelectorAll(".lp-member:not(.lp-member-empty)").length === 2, "B apparaît dans la salle d'attente");
  check(!!docB.getElementById("lpLeaveBtn") && !docB.getElementById("lpStartBtn"), "B voit « Quitter » mais pas « Lancer »");
  const resC = await fetch(`${baseUrl}api/private-league/join`, { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": tokens[2] }, body: JSON.stringify({ code }) });
  check(resC.ok, "C rejoint par l'API");
  const resD = await fetch(`${baseUrl}api/private-league/join`, { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": tokens[3] }, body: JSON.stringify({ code }) });
  check(resD.status === 400 && /Premium/.test((await resD.json()).error), "D (gratuit) refusé par le serveur même en appelant l'API directement");

  // --- A lance à 3 → refus (4 minimum) puis un 4e club CPU ? non : on
  //     ajoute D en Premium et il rejoint, puis lancement.
  const resStart3 = await fetch(`${baseUrl}api/private-league/start`, { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": tokens[0] }, body: JSON.stringify({ id: winA.eval("lpMyLeague().id") }) });
  check(resStart3.status === 400, "lancement refusé à 3 clubs");
  const { league: lg } = await store.loadMultiLeague(multiSavePath);
  lg.teams[humans[3]].isPaying = true;
  await store.saveMultiLeague(lg, multiSavePath);
  const resD2 = await fetch(`${baseUrl}api/private-league/join`, { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": tokens[3] }, body: JSON.stringify({ code }) });
  check(resD2.ok, "D rejoint une fois Premium");
  winA.eval("TAB_HANDLERS.lp()");
  // Recharge l'état côté A (les autres ont rejoint depuis) : on relance la page.
  const domA2 = await openGame(html, `${baseUrl}?m=${tokens[0]}`);
  const docA2 = domA2.window.document;
  [...docA2.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "lp").click();
  check(docA2.querySelectorAll(".lp-member:not(.lp-member-empty)").length === 4 && !docA2.getElementById("lpStartBtn").disabled, "A voit 4 clubs et peut lancer");
  docA2.getElementById("lpStartBtn").click();
  await waitFor(() => docA2.querySelector(".lp-table"), "classement affiché après lancement");
  check(docA2.querySelectorAll(".lp-table tbody tr").length === 4, "classement à 4 équipes");
  const rows = docA2.querySelectorAll(".lp-cal-row");
  check(rows.length === 6, "calendrier « Mes matchs » : 6 journées (aller-retour à 4)");
  check(/ven\./.test(rows[0].querySelector(".lp-cal-date").textContent) && /20:00/.test(rows[0].textContent), "J1 un vendredi à 20:00 (heure choisie)");
  docA2.querySelector("[data-lp-filter='all']").click();
  check(docA2.querySelectorAll(".lp-cal-row").length === 12, "filtre « Tous » : 12 matchs");
  check(!!docA2.querySelector(".cal-next .cal-card-kicker") && /J1/.test(docA2.querySelector(".cal-next .cal-card-kicker").textContent), "carte « Prochain match · J1 »");

  // --- Vendredi 20h01 : la journée se joue au prochain accès.
  const friday = Calendar.parisEpochForLocalTime(2026, 10, 2, 20, 1);
  now = friday;
  const domA3 = await openGame(html, `${baseUrl}?m=${tokens[0]}`);
  const docA3 = domA3.window.document;
  [...docA3.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "lp").click();
  const played = [...docA3.querySelectorAll(".lp-table tbody tr")].every(tr => tr.children[2].textContent === "1");
  check(played, "après vendredi 20h00 : chaque équipe a 1 match joué");
  const scoreBtn = docA3.querySelector(".lp-score");
  check(!!scoreBtn && /\d+ – \d+/.test(scoreBtn.textContent), `score cliquable dans le calendrier (${scoreBtn && scoreBtn.textContent})`);
  scoreBtn.click();
  const overlay = docA3.getElementById("matchBoxscoreOverlay");
  check(!!overlay && /Ligue privée · Coupe des Potes · Journée 1/.test(overlay.querySelector(".mbx-kicker").textContent), "feuille de match ouverte avec l'en-tête Ligue privée");
  check(!!overlay.querySelector(".lp-mbx-note") && overlay.querySelectorAll("table.boxscore tbody tr").length >= 6, "note « aucun effet » et lignes de joueurs présentes");
  const { league: after } = await store.loadMultiLeague(multiSavePath);
  // (L'isolement des équipes réelles est vérifié dans server/private_league_test.js :
  // ici le rechargement rattrape AUSSI les journées officielles de mercredi/jeudi.)
  check(after.teams[humans[0]].feed.entries.some(e => /Coupe des Potes/.test(e.title)), "entrée de fil d'actu pour le membre");

  [domA, domB, domA2, domA3].forEach(d => d.window.close());
  server.close();
  console.log("\n✅ private_league_ui_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
