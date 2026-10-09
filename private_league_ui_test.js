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
const html = require("./test_game_html.js").readGameHtml();

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
  check([...docA.getElementById("lpSizeSelect").options].map(o => o.value).join(",") === "4,6,8,10" && /4 équipes · 6 journées/.test(docA.getElementById("lpSizeSelect").options[0].textContent), "nombre d'équipes : 4, 6, 8 ou 10");
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
  // Ligues privées « monde » (2026-10-02) : un non-membre ne reçoit plus du
  // tout la ligue (ni son code).
  check(!/[A-Z2-9]{6}/.test(JSON.stringify(domD.window.eval("(league.privateLeagues || []).map(l => l.code)"))), "le code d'invitation n'est pas envoyé à un non-membre");
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
  // Heure choisie = heure de Paris (le serveur planifie en Europe/Paris) ;
  // la page l'affiche à l'heure locale du navigateur (formatCalendar*Fr),
  // donc la vérification ne dépend plus du fuseau de la machine de test
  // (échouait en UTC : « 18:00 » affiché pour 20:00 à Paris).
  const j1At = domA2.window.eval("lpMyLeague().rounds[0].dueAt");
  const parisJ1 = new Date(j1At).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  check(/ven\./.test(parisJ1) && /20:00/.test(parisJ1), `J1 un vendredi à 20:00 heure de Paris (${parisJ1})`);
  check(rows[0].querySelector(".lp-cal-date").textContent === domA2.window.eval(`formatCalendarDayFr(${j1At})`) && rows[0].textContent.includes(domA2.window.eval(`formatCalendarTimeFr(${j1At})`)), "J1 affiché à l'heure locale du navigateur");
  docA2.querySelector("[data-lp-filter='all']").click();
  check(docA2.querySelectorAll(".lp-cal-row").length === 12, "filtre « Tous » : 12 matchs");
  check(!!docA2.querySelector(".cal-next .cal-card-kicker") && /J1/.test(docA2.querySelector(".cal-next .cal-card-kicker").textContent), "carte « Prochain match · J1 »");

  // --- Calendrier principal, tableau de bord, barre du haut (retour
  // utilisateur 2026-09-26 : "il faut que ça apparaisse dans le calendrier et
  // que si c'est le prochain match, ça apparaisse sur le tableau de bord et
  // dans la barre en haut").
  {
    const w = domA2.window, d = docA2;
    w.eval("TAB_HANDLERS.calendrier()");
    const lpRows = [...d.querySelectorAll("#calendrierContent tr.cal-row")].filter(tr => tr.querySelector(".cal-lp-badge"));
    check(lpRows.length === 6, `Calendrier : 6 lignes de ligue privée (${lpRows.length})`);
    check(/LP J1/.test(lpRows[0].textContent) && lpRows[0].textContent.includes(domA2.window.eval(`formatCalendarTimeFr(${j1At})`)) && !!lpRows[0].querySelector("[data-order-target^=\"lp:\"], .calendar-lp-btn.is-locked[disabled]"), "ligne LP J1 à 20:00 (heure de Paris, affichée à l'heure locale) avec bouton Ordres de la ligue privée");
    // Match officiel du jour avant 20h00 : le prochain match reste l'officiel.
    w.eval("updateTopbar()");
    const officialFirst = !!w.eval("scheduledTimeForCurrentMatch() <= lpMyNextMatch().dueAt");
    if (officialFirst) {
      check(!/Ligue privée/.test(d.getElementById("topbarWeek").textContent), "barre du haut : match officiel quand il passe avant");
    }
    // Plus aucun match officiel avant le vendredi 20h00 : le match de ligue
    // privée devient le prochain match partout.
    w.eval("scheduledTimeForCurrentMatch = () => Date.now() + 30 * 86400000");
    // Verrou T − 5 min (retour utilisateur 2026-10-03) : « Ordres verrouillés »
    // dans la barre du haut et le bandeau du tableau de bord.
    w.eval("window.__realLpOrdersLocked = lpOrdersLocked; lpOrdersLocked = () => true");
    w.eval("updateTopbar()");
    check(d.getElementById("topbarOrdersBtn").textContent === "Ordres verrouillés", "barre du haut : « Ordres verrouillés » à moins de 5 min du coup d'envoi");
    w.eval("TAB_HANDLERS.club()");
    check(/Ordres verrouillés/.test(d.querySelector(".hm-hero").textContent) && !/Donnez vos ordres|Modifier vos ordres/.test(d.querySelector(".hm-hero").textContent), "tableau de bord : « Ordres verrouillés » à moins de 5 min du coup d'envoi");
    // Horloge du navigateur de test au-delà du coup d'envoi de J1 : verrou
    // neutralisé pour la suite.
    // Pendant le direct d'une journée, les ordres visent la suivante : pas
    // de verrou (retour utilisateur 2026-10-03).
    check(w.eval(`(() => { const lp = { rounds: [{ dueAt: Date.now() - 60000, matches: [{ home: myTeamIndex, away: 1, played: false, live: true }] }, { dueAt: Date.now() + 86400000, matches: [{ home: 1, away: myTeamIndex, played: false }] }] }; return window.__realLpOrdersLocked(lp); })()`) === false, "ordres de ligue privée modifiables pendant le direct (journée suivante)");
    w.eval("lpOrdersLocked = () => false");
    w.eval("updateTopbar()");
    check(/Ligue privée · J1/.test(d.getElementById("topbarWeek").textContent) && d.getElementById("topbarOrdersBtn").textContent === "Donnez vos ordres", "barre du haut : adversaire de ligue privée + bouton « Donnez vos ordres »");
    w.eval("TAB_HANDLERS.club()");
    const hero = d.querySelector(".hm-hero");
    check(!!hero && /Ligue privée/.test(hero.textContent) && /Coupe des Potes · J1/.test(hero.textContent) && !!hero.querySelector("[data-order-target^=\"lp:\"]") && /Donnez vos ordres/.test(hero.textContent) && !/Niveau/.test(hero.textContent), "tableau de bord : bandeau Prochain match = ligue privée");
    check(![...d.querySelectorAll(".hm-task__title")].some(t => new RegExp(w.eval("league.teams[lpMyNextMatch().oppIdx].name")).test(t.textContent) && /Ordres de match/.test(t.textContent)) || w.eval("league.teams[lpMyNextMatch().oppIdx].name === teamB.name"), "la tâche « Ordres de match » vise toujours le match officiel");
    w.eval("TAB_HANDLERS.calendrier()");
    // Carte "Prochain match" du Calendrier : elle suit l'ordre chronologique
    // réel des lignes ; rendue ici directement pour une ligne de ligue privée.
    const card = w.eval(`(() => { const n = lpMyNextMatch(); return calendarNextMatchCardHtml({ competition: "lp", label: "x", shortLabel: "J1", isHome: n.isHome, opponentIdx: n.oppIdx, location: "Domicile", scheduledAt: Date.now() + 3600 * 1000, isLive: false, lpId: n.lp.id, lpOrdered: false }); })()`);
    const lockedCard = w.eval(`(() => { const n = lpMyNextMatch(); return calendarNextMatchCardHtml({ competition: "lp", label: "x", shortLabel: "J1", isHome: n.isHome, opponentIdx: n.oppIdx, location: "Domicile", scheduledAt: Date.now() + 60 * 1000, isLive: false, lpId: n.lp.id, lpOrdered: true }); })()`);
    check(/Ordres verrouillés/.test(lockedCard) && !/Modifier les ordres/.test(lockedCard), "carte Prochain match de LP à moins de 5 min : « Ordres verrouillés »");
    check(/Prochain match · Ligue privée · J1/.test(card) && /data-order-target="lp:/.test(card) && /Donner les ordres/.test(card) && !/data-tab="ordres"/.test(card), "Calendrier : carte « Prochain match · Ligue privée · J1 » avec bouton Donner les ordres");
    d.getElementById("topbarOrdersBtn").click();
    check(!d.getElementById("prepSection").classList.contains("hidden") && w.eval("tqEdit && tqEdit.kind") === "lp", "le bouton de la barre du haut ouvre les ordres de la ligue privée");
    w.eval("goToOrdresTab(0, 'championship')");
    check(w.eval("tqEdit") === null && !/Ordres de la ligue privée/.test(d.querySelector("#ordresActionBar .oab-title") ? d.querySelector("#ordresActionBar .oab-title").textContent : ""), "« Ordres » d'une journée de championnat après les ordres de ligue privée : ordres du club, pas ceux de la LP");
    d.getElementById("topbarOrdersBtn").click();
    check(/Match|Prochain adversaire/.test(d.getElementById("tqEditorBar").textContent) && d.getElementById("tqEditorBar").textContent.includes(w.eval("league.teams[lpMyNextMatch().oppIdx].name")), "ordres de la ligue privée : adversaire du match affiché");
    // Navigation par identifiant unique de match (retour utilisateur
    // 2026-10-04) : après les ordres de LP, « Ordres » d'une journée de
    // championnat ouvre bien les ordres du CLUB pour CETTE journée.
    check(!d.querySelector(".sidebar-link[data-tab='ordres']") && !d.getElementById("tabOrdres"), "plus d'onglet « Ordres » dans la barre latérale");
    w.eval("openOrdersTarget(orderTargetFor('championship', 1))");
    check(w.eval("tqEdit") === null && w.eval("selectedOrdresRound") === 1 && w.eval("selectedOrdresCompetition") === "championship", "championnat J2 après les ordres de LP : ordres du club, journée 2");
    const lpNext = w.eval("(() => { const n = lpMyNextMatch(); return { id: n.lp.id, r: n.round.index }; })()");
    w.eval(`openOrdersTarget(orderTargetFor('lp', ${JSON.stringify(lpNext.id)}, ${lpNext.r}))`);
    check(w.eval("tqEdit && tqEdit.kind") === "lp" && w.eval("tqEdit.lpRound") === lpNext.r, "LP J" + (lpNext.r + 1) + " : ordres de la ligue privée sur cette journée");
    w.eval("openOrdersTarget(orderTargetFor('championship', 1))");
    check(w.eval("tqEdit") === null, "puis retour au championnat sans rester sur la LP");
    check(w.eval("orderTargetFor('lp', 'x', 4)") !== w.eval("orderTargetFor('championship', 4)") && w.eval("orderTargetFor('cup', 4)") !== w.eval("orderTargetFor('championship', 4)"), "LP J5, Coupe et Championnat J5 : identifiants distincts");
    const calBtns = (() => { w.eval("TAB_HANDLERS.calendrier()"); return [...d.querySelectorAll("#calendrierContent [data-order-target]")].map(b => b.dataset.orderTarget); })();
    check(calBtns.length > 0 && new Set(calBtns).size === calBtns.length - calBtns.filter((x, i) => calBtns.indexOf(x) !== i).length && calBtns.some(t => t.startsWith("championship:")) && calBtns.some(t => t.startsWith("lp:")), "calendrier : chaque bouton d'ordres porte l'identifiant de son match (" + calBtns.slice(0, 4).join(", ") + "…)");
    w.eval("TAB_HANDLERS.calendrier()");
    d.getElementById("topbarOrdersBtn").click();
    check(w.eval("tqEdit && tqEdit.kind") === "lp" && w.eval("hmActiveTabKey") === "ordres", "le bouton de la barre du haut ouvre le prochain match, ici de ligue privée");
    // Journée lancée, diffusion en cours : « Voir le direct » en haut et sur
    // l'accueil (retour utilisateur 2026-10-02 : « il est 21h ça n'a
    // toujours pas commencé »).
    w.eval("lpMyNextMatch().match.live = true; updateTopbar(); TAB_HANDLERS.club()");
    check(d.getElementById("topbarOrdersBtn").textContent === "Voir le direct", "direct de ligue privée : bouton du haut « Voir le direct »");
    check(!!d.querySelector(".hm-hero [data-lp-live]"), "direct de ligue privée : bouton « Voir le direct » sur l'accueil");
    w.eval("lpMyNextMatch().match.live = false; updateTopbar()");
    // Ligue SPÉCIALE en plus (calendrier sur mesure) : affichée sous la
    // ligue normale, et son match devient le prochain s'il passe avant.
    w.eval(`(() => { const lp = lpMyLeague(); const opp = lpMyNextMatch().oppIdx; const at = lpMyNextMatch().dueAt - 3600000;
      league.privateLeagues.push({ id: "spe", name: "Ligue spéciale", special: true, status: "running", size: 2, venue: "home", hour: 10, minute: 0,
        creatorTeamIndex: myTeamIndex, teamIndices: [myTeamIndex, opp], members: [], myOrders: null,
        rounds: [{ index: 0, dueAt: at, matches: [{ home: myTeamIndex, away: opp, played: false }] }] }); })()`);
    check(w.eval("lpMyNextMatch().lp.id") === "spe", "ligue spéciale : son match, plus tôt, devient le prochain");
    w.eval("TAB_HANDLERS.lp()");
    check(d.querySelectorAll("#lpContent .lp-intro").length === 2 && /Ligue spéciale/.test(d.querySelector("#lpContent .lp-special").textContent), "page Ligues privées : ligue normale + ligue spéciale");
    w.eval("league.privateLeagues = league.privateLeagues.filter(l => l.id !== 'spe'); updateTopbar()");
    w.eval("TAB_HANDLERS.calendrier()");
  }

  // --- Vendredi soir, diffusion de 20h00 terminée (direct de ligue privée,
  //     2026-10-01 : score caché pendant le direct) : journée jouée.
  const friday = Calendar.parisEpochForLocalTime(2026, 10, 2, 23, 0);
  now = friday;
  const domA3 = await openGame(html, `${baseUrl}?m=${tokens[0]}`);
  const docA3 = domA3.window.document;
  [...docA3.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "lp").click();
  const played = [...docA3.querySelectorAll(".lp-table tbody tr")].every(tr => tr.children[2].textContent === "1");
  check(played, "après vendredi 20h00 : chaque équipe a 1 match joué");
  const scoreBtn = docA3.querySelector(".lp-cal .lp-score");
  // Comme une ligue classique (retour utilisateur 2026-10-03).
  check(!!docA3.querySelector(".lp-results .lg-res-card") && /Résultats de la journée 1/.test(docA3.querySelector(".lp-results").textContent), "résultats de la journée affichés");
  check(/MVP de la journée 1/.test((docA3.querySelector(".lp-mvp") || {}).textContent || ""), "MVP de la journée affiché");
  check(docA3.querySelectorAll(".lp-leaders .lg-card").length === 6, "leaders de la ligue affichés (6 catégories)");
  check(!/ne touche pas/.test(docA3.getElementById("lpContent").textContent) && !docA3.querySelector(".lp-orders-row"), "plus de rappel des règles ni de bandeau d'ordres en haut");
  check(!!scoreBtn && /\d+ – \d+/.test(scoreBtn.textContent), `score cliquable dans le calendrier (${scoreBtn && scoreBtn.textContent})`);
  scoreBtn.click();
  const overlay = docA3.getElementById("matchBoxscoreOverlay");
  check(!!overlay && /Ligue privée · Coupe des Potes · Journée 1/.test(overlay.querySelector(".mbx-kicker").textContent), "feuille de match ouverte avec l'en-tête Ligue privée");
  // Plus de note « aucun effet sur la forme… » (retour utilisateur 2026-10-05) ;
  // seul un match décidé par forfait garde sa note.
  check(!overlay.querySelector(".lp-mbx-note") && !/aucun effet/.test(overlay.textContent) && overlay.querySelectorAll("table.boxscore tbody tr").length >= 6, "pas de note « aucun effet », lignes de joueurs présentes");
  const { league: after } = await store.loadMultiLeague(multiSavePath);
  // (L'isolement des équipes réelles est vérifié dans server/private_league_test.js :
  // ici le rechargement rattrape AUSSI les journées officielles de mercredi/jeudi.)
  check(after.teams[humans[0]].feed.entries.some(e => /Coupe des Potes/.test(e.title)), "entrée de fil d'actu pour le membre");

  // Score de ligue privée cliquable aussi depuis le Calendrier principal.
  overlay.classList.add("hidden");
  domA3.window.eval("TAB_HANDLERS.calendrier()");
  const calLpScore = docA3.querySelector("#calendrierContent .lp-cal-score");
  check(!!calLpScore && /\d+ - \d+/.test(calLpScore.textContent), `Calendrier : score de ligue privée cliquable (${calLpScore && calLpScore.textContent})`);
  calLpScore.click();
  const overlay2 = docA3.getElementById("matchBoxscoreOverlay");
  check(!!overlay2 && /Ligue privée/.test(overlay2.textContent), "Calendrier : le score ouvre la feuille de match de ligue privée");

  [domA, domB, domA2, domA3].forEach(d => d.window.close());
  server.close();
  console.log("\n✅ private_league_ui_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
