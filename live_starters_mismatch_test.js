// Direct : le cinq de départ vient du MATCH JOUÉ, pas de la compo actuelle
// du navigateur (retour utilisateur 2026-10-03 : plus de 5 joueurs « sur le
// terrain », un joueur à 23 pts en 4 min, totaux faux — compo modifiée
// après le coup d'envoi). Couvre les deux sources : drapeaux `starter` du
// box score (moteur récent) et déduction depuis les événements (direct
// calculé avant ce champ).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, patchDateNow } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = require("./test_game_html.js").readGameHtml();

(async () => {
  const clock = { now: Date.now() };
  const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
  let dom = await openGame(html, baseUrl);
  patchDateNow(dom.window, () => clock.now);
  await flush(dom);
  const saved = readRawSave(savePath);
  const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);
  await dom.window.close();

  clock.now = scheduledAt + Math.round(MATCH_BROADCAST_DURATION_MS * 0.6);
  dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
  await flush(dom);
  const win = dom.window;

  for (const mode of ["flags", "events"]) {
    const r = win.eval(`(function() {
      const lm = JSON.parse(JSON.stringify(currentLiveMatch));
      if (${JSON.stringify(mode)} === "events") [lm.boxScoreA, lm.boxScoreB].forEach(rows => rows.forEach(x => { delete x.starter; delete x.startPos; }));
      // Compo du navigateur différente du cinq joué : deux titulaires
      // échangés avec des remplaçants.
      const truth = new Set(currentLiveMatch.boxScoreA.filter(x => x.starter).map(x => x.id));
      const bench = teamA.players.filter(p => !truth.has(p.id));
      const posList = Object.keys(teamA.lineup.starters);
      teamA.lineup.starters[posList[0]] = bench[0].id;
      teamA.lineup.starters[posList[1]] = bench[1].id;
      enterLiveMatch(lm, { keepCurrentPage: true });
      return { truth: [...truth] };
    })()`);
    await new Promise(res => setTimeout(res, 50));
    const st = win.eval(`(function() {
      const s = hmLiveBuildState();
      return s.teams.map(T => ({ on: T.players.filter(p => p.onCourt).length,
        starters: T.players.filter(p => p.starter).length,
        ghost: T.players.filter(p => (p.pts > 0 || p.reb > 0) && p.seconds === 0).map(p => p.name) }));
    })()`);
    const startersA = win.eval(`[...liveStarters.A.keys()]`);
    st.forEach((t, i) => {
      if (t.on !== 5) throw new Error(`❌ [${mode}] équipe ${i} : ${t.on} joueurs sur le terrain (5 attendus)`);
      if (t.starters !== 5) throw new Error(`❌ [${mode}] équipe ${i} : ${t.starters} titulaires (5 attendus)`);
      if (t.ghost.length) throw new Error(`❌ [${mode}] équipe ${i} : stats sans temps de jeu pour ${t.ghost.join(", ")}`);
    });
    if (JSON.stringify([...startersA].sort()) !== JSON.stringify([...r.truth].sort())) throw new Error(`❌ [${mode}] titulaires ${startersA} ≠ cinq joué ${r.truth}`);
    console.log(`✅ [${mode}] 5 joueurs en jeu, vrais titulaires, aucune stat sans minutes`);
  }
  await dom.window.close();
  server.close();
  console.log("\n✅ Direct : cinq de départ fiable.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
