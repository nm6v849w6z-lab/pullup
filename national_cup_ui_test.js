// Coupe nationale, côté navigateur (retour utilisateur 2026-09-28, option
// (b) « tout d'un coup avec le direct ») : la sauvegarde envoyée au
// navigateur projette la Coupe nationale dans la forme de la Coupe interne,
// l'adversaire d'un autre championnat y est un « club invité » ; ordres
// préparés acceptés pour un tour de Coupe nationale ; direct avec handicap ;
// page Coupe (tableau complet d'un tour demandé au serveur, niveau des
// clubs, handicap) ; clic sur le club invité → Planète Hoop.
// Voir server/nationalCup.js (projectForLeague, pendingViewFor, roundMatches)
// et renderNationalCupSection / installGuestTeams (moteurbasket3.html).
// Saison entière simulée sans visite des managers : pas de libération des clubs inactifs ici.
process.env.BASKET_INACTIVE_RELEASE_DAYS = process.env.BASKET_INACTIVE_RELEASE_DAYS || "100000";
const fs = require("fs");
const store = require("./server/store.js");
const World = require("./server/world.js");
const Calendar = require("./server/calendar.js");
const NC = require("./server/nationalCup.js");
const { startTestServer, openGame, patchDateNow } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const fail = m => { throw new Error("❌ " + m); };
const ok = m => console.log("✅ " + m);
const wait = async (cond, what) => { for (let i = 0; i < 100; i++) { if (cond()) return; await new Promise(r => setTimeout(r, 50)); } fail(`délai dépassé : ${what}`); };

(async () => {
  const created = Date.UTC(2026, 8, 27, 9);
  const clock = { now: created };
  const { server, multiSavePath, baseUrl } = await startTestServer(() => clock.now);
  const career = store.createMultiManagerCareer(["Lyon Coupe", "Paris Coupe"], created, "Lyon Coupe");
  career.league.calendarDailyAnchored = true; career.league.calendarWeeklyRhythm = true;
  career.league.calendarStartAt = Calendar.weeklyRhythmCalendarStartAt(created);
  career.league.cup = null;
  await store.saveMultiLeague(career.league, multiSavePath);
  const w = await World.loadWorld(multiSavePath, created);
  for (let i = 0; i < 8; i++) await World.assignClub(w, multiSavePath, { country: "fr", clubName: `FR Coupe ${i}`, now: created });
  const rennes = await World.assignClub(w, multiSavePath, { country: "fr", clubName: "Rennes Coupe", now: created });
  if (rennes.leagueId !== "fr-2.1") fail("Rennes doit être en Division II.1");

  // Coupe de la saison 1, 1er tour arrangé : Rennes (D.II) reçoit Lyon (D.I).
  const leagues = new Map();
  for (const e of World.leaguesOfCountry(w, "fr")) leagues.set(e.id, await World.loadLeague(w, e.id, multiSavePath));
  const cup = NC.createNationalCup("fr", World.leaguesOfCountry(w, "fr"), leagues, 1);
  const refs = cup.rounds[0].matches.flatMap(m => [m.home, m.away]).filter(Boolean);
  const isRef = (r, id, idx) => r.leagueId === id && r.idx === idx;
  const lyonRef = refs.find(r => isRef(r, "fr-1", 0));
  const rennesRef = refs.find(r => isRef(r, "fr-2.1", rennes.teamIndex));
  const others = refs.filter(r => r !== lyonRef && r !== rennesRef).sort((a, b) => a.level - b.level);
  const matches = [NC.makeMatch(0, 0, rennesRef, lyonRef)];
  others.slice(0, 12).forEach(r => matches.push(NC.makeMatch(0, matches.length, r, null)));
  const rest = others.slice(12);
  for (let i = 0; i + 1 < rest.length; i += 2) matches.push(NC.makeMatch(0, matches.length, rest[i], rest[i + 1]));
  cup.rounds[0].matches = matches;
  w.cups = { fr: cup };
  await World.saveWorld(w, multiSavePath);
  const fr1 = leagues.get("fr-1");
  const kick0 = Calendar.scheduledTimeForLeagueCupRound(fr1, 0);

  // 1) Avant le match : projection + club invité + ordres préparés acceptés.
  clock.now = kick0 - 2 * 3600 * 1000;
  const api = async (path, init = {}) => {
    const res = await fetch(new URL(path, baseUrl), { ...init, headers: { "Content-Type": "application/json", "X-TipIn-Token": rennes.token, ...(init.headers || {}) } });
    return { status: res.status, body: await res.json() };
  };
  const save = (await api("/api/save")).body;
  const pc = save.league.cup;
  if (!pc || !pc.national || pc.totalRounds !== 5) fail(`projection de la Coupe nationale absente : ${JSON.stringify(pc && { national: pc.national, totalRounds: pc.totalRounds })}`);
  const m0 = pc.rounds[0].matches[0];
  if (pc.rounds[0].matches.length !== 1 || m0.home !== rennes.teamIndex || m0.away !== NC.guestIdxForRound(0)) fail(`match projeté inattendu : ${JSON.stringify(m0)}`);
  if (m0.handicapHome !== 7 || m0.handicapAway !== 0) fail("handicap +7 pour Rennes (D.II) attendu.");
  if (pc.rounds[0].matchCount !== 4 || pc.rounds[0].byes !== 12) fail(`compteurs du tour : ${pc.rounds[0].matchCount} / ${pc.rounds[0].byes}`);
  const g = (save.league.guestTeams || [])[0];
  if (!g || g.localIdx !== NC.guestIdxForRound(0) || g.team.teamName !== "Lyon Coupe" || g.team.players.length < 5 || g.team.feed || g.team.managerLinkToken || g.team.plannedTactics) fail("club invité (Lyon) mal joint à la sauvegarde.");
  const plan = await api("/api/plan", { method: "POST", body: JSON.stringify({ round: 0, competition: "cup", patch: { defense: "Zone press" } }) });
  if (plan.status !== 200) fail(`ordres préparés du tour de Coupe nationale refusés : ${JSON.stringify(plan.body)}`);
  const badPlan = await api("/api/plan", { method: "POST", body: JSON.stringify({ round: 1, competition: "cup", patch: { defense: "Zone press" } }) });
  if (badPlan.status === 200) fail("un tour pas encore tiré ne doit pas accepter d'ordres.");
  const acc = await api(`/api/scouting/access?opponent=${NC.guestIdxForRound(0)}`);
  if (acc.status !== 200 || acc.body.level !== "locked") fail(`scouting du club invité : ${JSON.stringify(acc.body)}`);
  const ticket = await api("/api/scouting/ad-ticket", { method: "POST", body: JSON.stringify({ opponent: NC.guestIdxForRound(0) }) });
  if (ticket.status !== 200) fail(`pub de scouting pour le club invité : ${JSON.stringify(ticket.body)}`);
  const done = await api("/api/scouting/ad-complete", { method: "POST", body: JSON.stringify({ ticketId: ticket.body.ticketId }) });
  if (done.status !== 200) fail(`déblocage du scouting : ${JSON.stringify(done.body)}`);
  const rep = await api(`/api/scouting/report?opponent=${NC.guestIdxForRound(0)}`);
  if (rep.status !== 200 || !rep.body.guest || rep.body.opponentName !== "Lyon Coupe" || !rep.body.standing) fail(`rapport de scouting du club invité : ${JSON.stringify(rep.body).slice(0, 300)}`);
  ok("scouting Pro du club invité : verrouillé, débloqué par une pub, rapport tiré de son propre championnat");
  ok("sauvegarde : Coupe nationale projetée (5 tours, 4 matchs + 12 exempts au 1er tour), Lyon (D.I) joint en club invité, handicap +7 ; ordres préparés du tour accepté, tour suivant refusé");

  // 2) Page Coupe : tableau complet du tour demandé au serveur.
  let dom = await openGame(html, `${baseUrl}?m=${rennes.token}`, win => patchDateNow(win, () => clock.now));
  let win = dom.window, doc = win.document;
  // Récapitulatif d'absence (matchs joués pendant le rattrapage) : on le ferme.
  if (!doc.getElementById("catchupSection").classList.contains("hidden")) doc.getElementById("catchupContinueBtn").click();
  if (!win.eval("league.teams.length === 10 && league.teams[100] && league.teams[100].isGuest && league.teams[100].name === 'Lyon Coupe'")) fail("club invité non installé (league.teams[100]).");
  if (win.eval("league.teams.map(t => t.name).includes('Lyon Coupe')")) fail("le club invité ne doit pas apparaître dans les boucles sur league.teams.");
  // Tableau de bord, calendrier et Ordres affichent le match de Coupe contre le club invité.
  const errors = [];
  win.addEventListener("error", e => errors.push(e.message));
  for (const tab of ["club", "calendrier", "ordres", "ligue", "statshebdo"]) {
    try { win.eval(`TAB_HANDLERS.${tab}()`); } catch (e) { fail(`onglet ${tab} : ${e.message}`); }
  }
  win.eval("TAB_HANDLERS.calendrier()");
  if (!/Lyon Coupe/.test(doc.getElementById("calendrierContent") ? doc.getElementById("calendrierContent").textContent : doc.body.textContent)) fail("le calendrier doit montrer le match de Coupe contre Lyon.");
  win.eval("TAB_HANDLERS.ordres()");
  const ordresRounds = win.eval("typeof upcomingRoundsForOrders === 'function' ? JSON.stringify(upcomingRoundsForOrders().filter(r => r.competition === 'cup')) : '[]'");
  if (!/"round":0/.test(ordresRounds)) fail(`Ordres : tour de Coupe nationale attendu (${ordresRounds}).`);
  if (errors.length) fail(`erreurs : ${errors.join(" | ")}`);
  ok("tableau de bord, calendrier, Ordres, classement, stats : le match de Coupe contre le club invité s'affiche sans erreur");
  win.eval("TAB_HANDLERS.coupe()");
  const box = doc.getElementById("coupeContent");
  await wait(() => box.querySelectorAll("#cupRoundBody tr.cp-m").length === 4, "tableau du 1er tour");
  const first = box.querySelector("#cupRoundBody tr.cp-m");
  if (!first.classList.contains("mine") || !/Rennes Coupe/.test(first.textContent) || !/Lyon Coupe/.test(first.textContent)) fail(`son match en tête : ${first.textContent}`);
  if ([...first.querySelectorAll(".ncup-lvl")].map(e => e.textContent).join(",") !== "D.II,D.I" || !first.querySelector(".ncup-hc")) fail("niveau des clubs et handicap attendus sur la ligne.");
  if (!/12 clubs exemptés/.test(box.textContent)) fail("ligne des exempts attendue.");
  if (!/\+7 points par division/.test(box.textContent)) fail("explication du handicap attendue.");
  const tabs = [...box.querySelectorAll(".cp-rtab")].map(b => b.textContent.trim());
  if (tabs.length !== 5 || !/^16es/.test(tabs[0]) || !/^Finale/.test(tabs[4])) fail(`onglets de tours : ${tabs.join(" | ")}`);
  const side = box.querySelector(".cal-side");
  if (!/Lyon Coupe/.test(side.textContent) || !/Modifier les ordres/.test(side.textContent)) fail(`carte « Prochain match » : ${side.textContent.slice(0, 200)}`);
  ok(`page Coupe : onglets ${tabs.map(t => t.split(" ")[0]).join("/")}, son match en tête (niveau D.II/D.I, handicap +7), 12 exempts, prochain match contre le club invité avec ordres enregistrés`);

  // 3) Clic sur le club invité → sa fiche équipe habituelle (Aperçu), lue
  // dans son championnat (voir showForeignTeamDetail).
  first.querySelector('[data-team-idx="100"], [data-ncup-league="fr-1"]').click();
  const tdName = () => doc.querySelector("#teamDetailContent .team-apercu-name");
  await wait(() => !doc.getElementById("teamDetailSection").classList.contains("hidden") && tdName() && /Lyon Coupe/.test(tdName().textContent), "fiche équipe du club invité");
  ok("clic sur le club d'un autre championnat : sa fiche équipe (Aperçu)");
  dom.window.close();

  // 4) Coup d'envoi : direct avec le club invité et le handicap au score.
  clock.now = kick0 + 5 * 60 * 1000;
  await World.catchUpWorld(multiSavePath, clock.now);
  dom = await openGame(html, `${baseUrl}?m=${rennes.token}`, w2 => patchDateNow(w2, () => clock.now));
  win = dom.window; doc = win.document;
  await wait(() => win.eval("!!(league.liveMatch && currentLiveMatch)"), "direct de Coupe");
  const lm = win.eval("({ c: league.liveMatch.competition, opp: league.liveMatch.opponentIdx, hc: league.liveMatch.handicap, nb: document.getElementById('nameB').textContent })");
  if (lm.c !== "cup" || lm.opp !== NC.guestIdxForRound(0) || lm.nb !== "Lyon Coupe" || !lm.hc || lm.hc.mine !== 7) fail(`direct : ${JSON.stringify(lm)}`);
  const note = doc.getElementById("liveHandicapNote");
  if (!note || !/\+7 pour Rennes Coupe/.test(note.textContent)) fail("rappel du handicap sur le direct attendu.");
  const firstScored = win.eval("(currentLiveMatch.events.find(e => e.score) || {}).score");
  if (!firstScored || firstScored.A < 7) fail(`le score du direct part de +7 pour Rennes : ${JSON.stringify(firstScored)}`);
  ok("direct : Rennes contre Lyon (club invité), handicap +7 déjà au tableau d'affichage et rappelé sous le score");
  dom.window.close();

  // 5) Fin du match : résultat officiel projeté (handicap compris).
  clock.now = kick0 + Calendar.MATCH_BROADCAST_DURATION_MS + 60 * 1000;
  await World.catchUpWorld(multiSavePath, clock.now);
  const after = (await api("/api/save")).body;
  const r0 = after.league.cup.rounds[0].matches[0];
  const ww = await World.loadWorld(multiSavePath, clock.now);
  const real = ww.cups.fr.rounds[0].matches[0];
  if (!r0.resolved || r0.scoreHome !== real.result.scoreHome + 7 || r0.scoreAway !== real.result.scoreAway) fail(`score projeté : ${JSON.stringify(r0)} / ${JSON.stringify(real.result)}`);
  if (r0.winner !== (real.winner === "home" ? rennes.teamIndex : NC.guestIdxForRound(0))) fail("vainqueur projeté.");
  if (after.league.liveMatch) fail("plus de direct après la fin de diffusion.");
  ok(`fin du match : ${r0.scoreHome}-${r0.scoreAway} (handicap compris), vainqueur ${real.winner === "home" ? "Rennes" : "Lyon"}`);

  // 6) Après le match : calendrier, feuille de match et page Coupe.
  dom = await openGame(html, `${baseUrl}?m=${rennes.token}`, w3 => patchDateNow(w3, () => clock.now));
  win = dom.window; doc = win.document;
  const errs = [];
  win.addEventListener("error", e => errs.push(e.message));
  win.eval("TAB_HANDLERS.calendrier()");
  const cal = doc.getElementById("calendrierContent").textContent;
  if (!cal.includes(`${r0.scoreHome} - ${r0.scoreAway}`)) fail("score de Coupe (handicap compris) attendu dans le calendrier.");
  win.eval(`showMatchBoxscore(0, "cup", ${rennes.teamIndex}, ${NC.guestIdxForRound(0)})`);
  await new Promise(r => setTimeout(r, 100));
  const bs = doc.body.textContent;
  if (!/Lyon Coupe/.test(bs)) fail("feuille de match du tour de Coupe attendue.");
  win.eval("TAB_HANDLERS.coupe()");
  await wait(() => doc.querySelector('#cupRoundTabs [data-cup-round="0"]'), "onglets");
  if (!doc.getElementById("cupRoundTabs").classList.contains("vs-tabs")) fail("onglets des tours : menu commun .vs-tabs (comme Vestiaire et Centre médical)");
  ok("onglets des tours : menu commun .vs-tabs");
  doc.querySelector('#cupRoundTabs [data-cup-round="0"]').click();
  await wait(() => doc.querySelector("#cupRoundBody tr.cp-m .cp-score .w"), "résultat dans le tableau du tour");
  if (errs.length) fail(`erreurs : ${errs.join(" | ")}`);
  ok("après le match : score au calendrier, feuille de match ouverte, résultat dans le tableau du tour");
  dom.window.close();

  server.close();
  console.log("\n🏁 national_cup_ui_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
