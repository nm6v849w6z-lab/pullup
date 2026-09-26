// Histoire du club (1 & 3) — retours communauté 2026-09-26 : "Classement
// mondial de nos joueurs", "Menu Historique du club -> palmarès, records,
// meilleurs joueurs", Diablue : "Nouvel onglet Club ?".
// A) moteur : archivage idempotent, résumé de saison, records, légendes,
//    classement mondial. B) serveur : archivage au tick quand les play-offs
//    sont finis + report sur le nouveau club lors du reset de la ligue
//    partagée. C) navigateur : onglet + page + puce "mondial" sur la fiche.
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

// Joue toute la saison régulière + play-offs "en coulisses" (sans serveur).
function playWholeSeason(league, now) {
  while (!league.isRegularSeasonDone()) {
    const round = league.round;
    league.matchesForRound(round).forEach(m => {
      const r = Engine.simulateOrForfeit(league.teams[m.home], league.teams[m.away], now);
      if (!r.forfeit) Engine.recordMatchStatsAndAwardMvp(league.teams[m.home], league.teams[m.away], round, "championship", now, r.quarterScores, r.tacticsUsed);
      league.recordResult(round, m.home, m.away, r.scoreHome, r.scoreAway);
    });
    league.advanceRound();
  }
  league.startPlayoffsIfNeeded(now);
  let guard = 0;
  while (!league.isPlayoffsDone() && guard++ < 20) {
    league.playoffMatchesForRound(league.playoffs.round).forEach(pm => {
      const r = Engine.simulateOrForfeit(league.teams[pm.home], league.teams[pm.away], now);
      league.recordPlayoffGameResult(pm.seriesId, pm.home, pm.away, r.scoreHome, r.scoreAway, now);
    });
    league.playoffs.round++;
  }
}

(async () => {
  const T0 = Calendar.parisEpochForLocalTime(2026, 9, 30, 9);
  // --- A : moteur pur, carrière solo.
  const league = Engine.generateLeague(Engine.generateStartingRoster("Bad Kings"), 1, T0);
  const team = league.teams[0];
  check(typeof league.seasonId === "string" && league.seasonId.length >= 6, "la ligue porte un seasonId");
  const wr = Engine.worldPlayerRankings(league);
  check(wr.length === league.teams.reduce((n, t) => n + t.players.length, 0) && wr[0].rank === 1 && wr[wr.length - 1].rank === wr.length, "classement mondial : tous les joueurs de la ligue, rangs continus");
  check(wr.every((r, i) => i === 0 || wr[i - 1].rating >= r.rating), "classement mondial trié par note");
  const mine = Engine.worldRankForPlayer(league, 0, team.players[0].id);
  check(mine && mine.rank >= 1 && mine.posRank >= 1 && mine.posRank <= mine.rank, "rang mondial et rang au poste d'un de mes joueurs");
  check(Engine.liveAllTimePlayers(league, 0).length === 0 && Object.keys(Engine.liveClubRecords(league, 0)).length === 0, "avant tout match : ni légendes ni records");

  playWholeSeason(league, T0);
  check(league.isPlayoffsDone(), "saison jouée jusqu'au champion");
  const live = Engine.liveClubRecords(league, 0);
  check(live.biggestWin && live.playerPoints && live.seasonWins && live.mostPoints, "records vivants calculés pendant la saison (écart, points joueur, bilan, points marqués)");
  check(live.biggestWin.match && live.biggestWin.match.seasonId === league.seasonId && live.biggestWin.match.competition === "championship" && Number.isFinite(live.biggestWin.match.round), "record : référence du match (saison, journée, équipes)");
  check(live.playerPoints.match && [live.playerPoints.match.home, live.playerPoints.match.away].includes(0), "record joueur : référence du match");
  // Hall of Fame (moteur).
  const entry0 = Engine.liveAllTimePlayers(league, 0)[0];
  check(team.inductHallOfFame(entry0, T0).ok && !team.inductHallOfFame(entry0, T0).ok, "Hall of Fame : entrée, pas de doublon");
  check(!team.setRetiredJersey(entry0.id, 100).ok && team.setRetiredJersey(entry0.id, 7).ok && team.hallOfFame[0].retiredNumber === 7, "maillot retiré (0-99)");
  check(!team.setRetiredJersey(123456789, 8).ok, "maillot retiré : seulement pour un membre du Hall of Fame");
  const hofRebuilt = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(league))));
  check(hofRebuilt.teams[0].hallOfFame.length === 1 && hofRebuilt.teams[0].hallOfFame[0].retiredNumber === 7, "Hall of Fame sérialisé");
  check(team.removeHallOfFame(entry0.id).ok && team.hallOfFame.length === 0, "sortie du Hall of Fame");
  const legends = Engine.liveAllTimePlayers(league, 0);
  check(legends.length >= 8 && legends.every(l => l.games > 0 && l.seasons.length === 1), "légendes vivantes : joueurs ayant joué, 1 saison");
  const summaryLive = Engine.seasonSummaryForTeam(league, 0, T0);
  check(summaryLive.rank >= 1 && summaryLive.played === league.totalRounds && summaryLive.topScorer && summaryLive.seasonNo === 1, `résumé de saison en cours : ${summaryLive.rank}e, ${summaryLive.wins}-${summaryLive.losses}, meilleur marqueur ${summaryLive.topScorer.name}`);
  check(summaryLive.playoffResult === null || ["Champion", "Finaliste", "Demi-finaliste"].includes(summaryLive.playoffResult), "résultat de play-offs lisible");

  check(Engine.archiveSeasonForTeam(league, 0, T0) === true, "archivage de la saison");
  check(Engine.archiveSeasonForTeam(league, 0, T0) === false && team.seasonHistory.length === 1, "archivage idempotent (une seule entrée)");
  check(team.seasonHistory[0].seasonNo === 1 && team.seasonHistory[0].divisionName && team.clubRecords.biggestWin && Object.keys(team.allTimePlayers).length >= 8, "seasonHistory / clubRecords / allTimePlayers remplis");
  if (league.playoffs.champion === 0) check(team.trophies.length >= 1 && team.seasonHistory[0].champion, "champion : trophée et saison marquée");
  const rebuilt = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(league))));
  check(rebuilt.teams[0].seasonHistory.length === 1 && rebuilt.teams[0].lastArchivedSeasonId === league.seasonId && rebuilt.seasonId === league.seasonId && rebuilt.teams[0].clubRecords.biggestWin.value === team.clubRecords.biggestWin.value, "tout survit à la sérialisation");
  // Nouvelle saison solo : records d'une 2e saison fusionnés (max gardé).
  const league2 = Engine.generateLeague(team, 1, T0 + 1000);
  check(league2.seasonId !== league.seasonId && league2.teams[0] === team && team.seasonHistory.length === 1, "nouvelle saison : nouveau seasonId, historique conservé");
  playWholeSeason(league2, T0 + 1000);
  const bestWinBefore = team.clubRecords.biggestWin.value;
  Engine.archiveSeasonForTeam(league2, 0, T0 + 1000);
  check(team.seasonHistory.length === 2 && team.seasonHistory[0].seasonNo === 2 && team.clubRecords.biggestWin.value >= bestWinBefore, "2e saison archivée en tête, records = meilleur des deux");
  const leg2 = Object.values(team.allTimePlayers);
  check(leg2.some(l => l.seasons.length === 2), "un joueur resté deux saisons cumule 2 saisons");

  // --- B : serveur (ligue partagée) : archivage au tick + report au reset.
  const names = ["Alpha HC", "Bravo HC"];
  const multi = Engine.generateMultiManagerLeague(names, names.length, T0, Calendar.dailyAnchoredCalendarConfig());
  const hIdx = multi.teams.findIndex(t => t.isHuman);
  multi.teams[hIdx].trigram = "ALP"; multi.teams[hIdx].arenaName = "Le Chaudron";
  playWholeSeason(multi, T0);
  const { server, multiSavePath, baseUrl } = await startTestServer(() => T0 + 3600 * 1000);
  await store.saveMultiLeague(multi, multiSavePath);
  const token = multi.teams[hIdx].managerLinkToken;
  let res = await fetch(`${baseUrl}api/state`, { headers: { "X-TipIn-Token": token } });
  check(res.ok, "tick serveur passé");
  let { league: saved } = await store.loadMultiLeague(multiSavePath);
  check(saved.teams[hIdx].seasonHistory.length === 1 && saved.teams[hIdx].lastArchivedSeasonId === multi.seasonId, "play-offs terminés → saison archivée au tick");
  // Reset admin (nouvelle saison) : histoire, trophées, trigramme et salle reportés.
  process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "test-admin";
  res = await fetch(`${baseUrl}api/admin/reset-multi-league`, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ teamNames: names }) });
  const resetBody = await res.json().catch(() => ({}));
  check(res.ok, `reset de la ligue partagée (${res.status} ${resetBody.error || ""})`);
  ({ league: saved } = await store.loadMultiLeague(multiSavePath));
  const fresh = saved.teams.find(t => t.isHuman && t.name === "Alpha HC");
  check(fresh && fresh.seasonHistory.length === 1 && fresh.trigram === "ALP" && fresh.arenaName === "Le Chaudron" && fresh.lastArchivedSeasonId === null, "après reset : historique, trigramme et nom de salle reportés sur le nouveau club");
  check(fresh.managerLinkToken === token, "jeton manager conservé (comme avant)");
  check(Object.keys(fresh.allTimePlayers).length >= 8 && fresh.players.every(p => !fresh.allTimePlayers[p.id] || fresh.allTimePlayers[p.id].name === p.name), "légendes reportées, effectif régénéré");

  // --- C : navigateur. Quelques journées de la saison 2 jouées, records
  // archivés effacés pour que les records "vivants" viennent de matchs de la
  // saison en cours (donc cliquables).
  {
    const { league: L } = await store.loadMultiLeague(multiSavePath);
    for (let k = 0; k < 3; k++) {
      const round = L.round;
      L.matchesForRound(round).forEach(m => {
        const r = Engine.simulateOrForfeit(L.teams[m.home], L.teams[m.away], T0);
        if (!r.forfeit) Engine.recordMatchStatsAndAwardMvp(L.teams[m.home], L.teams[m.away], round, "championship", T0, r.quarterScores, r.tacticsUsed);
        L.recordResult(round, m.home, m.away, r.scoreHome, r.scoreAway);
      });
      L.advanceRound();
    }
    L.teams.find(t => t.managerLinkToken === token).clubRecords = {};
    await store.saveMultiLeague(L, multiSavePath);
  }
  const dom = await openGame(html, `${baseUrl}?m=${token}`);
  const doc = dom.window.document, win = dom.window;
  const tab = [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "histoire");
  check(!!tab, "onglet « Histoire du club » présent");
  tab.click();
  check(!doc.getElementById("histoireSection").classList.contains("hidden"), "page Histoire affichée");
  const txt = doc.getElementById("histoireContent").textContent;
  check(/Saison 1/.test(txt) && /Saison 2/.test(txt) && /En cours/.test(txt), "palmarès : saison 1 archivée + saison 2 en cours");
  check(doc.querySelectorAll(".hc-record").length >= 4, "records affichés");
  check(doc.querySelectorAll(".hc-table").length === 1 && !/Légendes du club/.test(txt), "plus de tableau Légendes (remplacé par le Hall of Fame)");
  check(!/Nos joueurs parmi tous ceux de la ligue/.test(txt) && !/joueurs classés dans la ligue/.test(txt), "classement mondial : textes d'intro retirés");
  const cols = doc.querySelectorAll("#histoireContent .hc-col");
  check(cols.length === 2 && cols[0].querySelectorAll(".lg-panel").length === 3 && /Records du club/.test(cols[1].textContent), "mise en page : Palmarès + Hall of Fame + Classement mondial à gauche, Records à droite");
  const wsRows = doc.querySelectorAll(".hc-ws-row");
  check(wsRows.length === 5 && /Meilleur marqueur/.test(txt) && /Meilleur passeur/.test(txt) && /Meilleur rebondeur/.test(txt) && /Meilleur contreur/.test(txt), "classement mondial par stat (marqueur, passeur, rebondeur, contreur, intercepteur)");
  const firstWorld = doc.querySelector(".hc-ws-row .hc-world-rank");
  check(firstWorld && /^\d+(er|e)$/.test(firstWorld.textContent.trim()), `rang mondial affiché (${firstWorld && firstWorld.textContent})`);
  // Records cliquables → feuille de match (saison en cours seulement).
  const recBtn = doc.querySelector("button.hc-record[data-hc-match]");
  check(!!recBtn, `un record de la saison en cours est cliquable (${recBtn && recBtn.dataset.hcMatch})`);
  check([...doc.querySelectorAll("div.hc-record")].every(d => !d.dataset.hcMatch), "les records sans match (saison passée, affluence) ne sont pas cliquables");
  recBtn.click();
  check(!!doc.getElementById("matchBoxscoreOverlay"), "clic sur un record → feuille de match ouverte");
  if (typeof win.closeMatchBoxscore === "function") win.closeMatchBoxscore();
  // Hall of Fame : entrée, maillot retiré, affichage dans la salle.
  check(/Aucun joueur au Hall of Fame/.test(txt) && doc.getElementById("hcHofSelect"), "Hall of Fame vide + liste des joueurs éligibles");
  const sel = doc.getElementById("hcHofSelect");
  const pickedId = Number(sel.value);
  doc.getElementById("hcHofInduct").click();
  await new Promise(r => setTimeout(r, 400));
  check(doc.querySelectorAll(".hc-hof-card").length === 1, "joueur entré au Hall of Fame");
  let input = doc.querySelector("[data-hof-num]");
  input.value = "23";
  doc.querySelector("[data-hof-retire]").click();
  await new Promise(r => setTimeout(r, 400));
  check(/Maillot n°23 retiré/.test(doc.getElementById("histoireContent").textContent), "maillot n°23 retiré");
  ({ league: saved } = await store.loadMultiLeague(multiSavePath));
  const savedTeam = saved.teams.find(t => t.managerLinkToken === token);
  check(savedTeam.hallOfFame.length === 1 && savedTeam.hallOfFame[0].id === pickedId && savedTeam.hallOfFame[0].retiredNumber === 23, "Hall of Fame sauvegardé côté serveur");
  let r2 = await fetch(`${baseUrl}api/club/hall-of-fame/induct`, { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": token }, body: JSON.stringify({ playerId: 999999999 }) });
  check(r2.status === 400, "serveur : un joueur jamais passé par le club est refusé");
  const tabSalle = [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "salle");
  tabSalle.click();
  const banner = doc.querySelector("#arenaVisualCard .sl-retired-banner");
  check(banner && /23/.test(banner.textContent), "maillot retiré suspendu dans le visuel de la salle");
  tab.click();
  doc.querySelector("[data-hof-unretire]").click();
  await new Promise(r => setTimeout(r, 400));
  tabSalle.click();
  check(!doc.querySelector("#arenaVisualCard .sl-retired-banner"), "retrait annulé → plus de bannière dans la salle");
  tab.click();
  doc.querySelector("[data-hof-remove]").click();
  await new Promise(r => setTimeout(r, 400));
  check(doc.querySelectorAll(".hc-hof-card").length === 0, "joueur sorti du Hall of Fame");
  const link = doc.querySelector("#histoireContent .player-link, #histoireContent [data-player-detail]");
  link.click();
  check(!doc.getElementById("playerDetailSection").classList.contains("hidden"), "clic sur un joueur → fiche joueur");
  const chip = doc.querySelector(".pdp2-chip--world");
  check(chip && /mondial/.test(chip.textContent), `puce « mondial » sur la fiche joueur (${chip && chip.textContent})`);
  dom.window.close(); server.close();
  console.log("\n✅ club_history_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
