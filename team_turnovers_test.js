// Pertes de balle D'ÉQUIPE (2026-10-10, « violations et pertes de balle ») :
// toute violation (8 s, 24 s — airball à la sirène compris —, retour en zone
// arrière) compte +1 perte de balle à l'ÉQUIPE et +0 au porteur ; les pertes
// individuelles (interception, ballon arraché, passe perdue / dehors,
// ballon mal contrôlé, dribble raté) restent au joueur responsable. Aucun
// double comptage : total d'équipe = somme des joueurs + pertes d'équipe =
// nombre d'événements « turnover ». Vérifié à la source (moteur), puis
// jusqu'au matchLog, à la sauvegarde, à l'archive de saison, au direct
// (vue extérieur, adaptateur) et aux feuilles de match de la page.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { pathToFileURL } = require("url");
const E = require("./engine.js");
const LiveMatch = require("./server/liveMatch.js");
const ok = m => console.log("✅ " + m);

(async () => {
  // ---------- 1-4 : moteur ----------
  let violations = 0, individual = 0, games = 0, kinds = new Set(), sample = null;
  for (let seed = 1; seed <= 40; seed++) {
    const h = E.generateTeam("France", 1), a = E.generateTeam("Espagne", 1);
    const r = new E.MatchEngine(h, a, { homeAdvantage: true, seed }).simulate();
    games++;
    const teamFromEvents = { A: 0, B: 0 };
    for (const e of r.events) {
      if (e.teamDelta) for (const k of ["A", "B"]) teamFromEvents[k] += (e.teamDelta[k] && e.teamDelta[k].tov) || 0;
      if (e.type !== "turnover") {
        // Aucune perte cachée dans un autre type d'événement.
        for (const k of ["A", "B"]) for (const d of Object.values((e.delta && e.delta[k]) || {})) assert.ok(!d.tov, `perte imputée hors événement « turnover » (${e.type})`);
        continue;
      }
      const playerTov = Object.values((e.delta && e.delta[e.team]) || {}).reduce((x, d) => x + (d.tov || 0), 0);
      if (e.tovType === "violation") {
        violations++; kinds.add(e.tovKind);
        assert.ok(e.teamTurnover === true, "violation : marquée perte d'équipe");
        assert.deepStrictEqual(e.teamDelta, { [e.team]: { tov: 1 } }, "violation : +1 à l'équipe en attaque, rien à l'adversaire");
        assert.strictEqual(playerTov, 0, `violation ${e.tovKind} : +0 au porteur (${e.player})`);
        if (!sample) sample = { r, h, a, seed };
      } else {
        individual++;
        assert.ok(!e.teamTurnover && !e.teamDelta, "perte individuelle : jamais une perte d'équipe");
        assert.strictEqual(playerTov, 1, `perte individuelle ${e.tovType}/${e.tovKind} : +1 exactement`);
        assert.strictEqual(e.delta[e.team][e.playerId].tov, 1, "perte individuelle : au joueur responsable nommé");
      }
    }
    for (const k of ["A", "B"]) {
      const box = k === "A" ? r.boxScoreA : r.boxScoreB;
      const players = box.reduce((x, p) => x + (p.tov || 0), 0);
      const events = r.events.filter(e => e.type === "turnover" && e.team === k).length;
      assert.strictEqual(r.teamStats[k].tov, teamFromEvents[k], "teamStats = somme des teamDelta");
      assert.strictEqual(players + r.teamStats[k].tov, events, `équipe ${k} : joueurs + équipe = événements (aucun double comptage)`);
    }
    assert.strictEqual(h.matchStats.tov, r.teamStats.A.tov, "team.matchStats (domicile) = teamStats.A");
    assert.strictEqual(a.matchStats.tov, r.teamStats.B.tov, "team.matchStats (extérieur) = teamStats.B");
  }
  assert.ok(violations > 0 && individual > 0 && sample, "échantillon : violations et pertes individuelles");
  assert.ok(kinds.has("shotClock"), "au moins une violation des 24 s");
  ok(`1. ${violations} violations (${[...kinds].join(", ")}) sur ${games} matchs : +1 à l'équipe, +0 au porteur.`);
  ok(`2. ${individual} pertes individuelles (interception, ballon arraché, passes, ballon mal contrôlé, dribble) : +1 au seul joueur responsable.`);
  ok("3. Total d'équipe = somme des joueurs + pertes d'équipe = nombre d'événements « turnover » (aucun double comptage).");

  // Violation forcée (déterministe) : logViolation sur un match neuf.
  {
    const h = E.generateTeam("France", 1), a = E.generateTeam("Espagne", 1);
    const eng = new E.MatchEngine(h, a, { seed: 7 });
    eng.simulate();
    const before = h.players.map(p => p.stats.tov);
    const t0 = eng.teamStats.A.tov;
    const events = [];
    for (const kind of ["eightSeconds", "shotClock", "backcourt"]) eng.logViolation(kind, h, a, 4, 30, events);
    assert.deepStrictEqual(h.players.map(p => p.stats.tov), before, "violations forcées : aucune perte individuelle");
    assert.strictEqual(eng.teamStats.A.tov, t0 + 3, "violations forcées : +3 à l'équipe");
    assert.strictEqual(h.matchStats.tov, t0 + 3, "violations forcées : team.matchStats suit");
    assert.ok(events.every(e => e.teamTurnover && e.teamDelta.A.tov === 1 && !e.delta), "violations forcées : delta d'équipe seulement");
    ok("4. 8 s, 24 s et retour en zone forcés : +1 équipe chacun, aucun joueur touché.");
  }

  // ---------- 5 : matchLog, sauvegarde, archive de saison ----------
  {
    const { r, h, a } = sample;
    const qs = { home: r.quarterScores.A, away: r.quarterScores.B };
    E.recordMatchStatsForTeam(h, 1, "championship", 1_800_000_000_000, qs);
    E.recordMatchStatsForTeam(a, 1, "championship", 1_800_000_000_000, qs);
    for (const [t, k] of [[h, "A"], [a, "B"]]) {
      const entries = t.players.map(p => (p.matchLog || []).slice(-1)[0]).filter(Boolean);
      assert.ok(entries.length && entries.every(e => e.teamTov === r.teamStats[k].tov), "matchLog : teamTov du match sur chaque entrée");
      const box = k === "A" ? r.boxScoreA : r.boxScoreB;
      assert.strictEqual(entries.reduce((x, e) => x + (e.tov || 0), 0), box.reduce((x, p) => x + (p.tov || 0), 0), "matchLog : pertes individuelles = feuille");
    }
    const saved = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(h))));
    assert.strictEqual(saved.matchStats.tov, r.teamStats.A.tov, "sauvegarde : team.matchStats conservé");
    const archive = E.buildSeasonArchive({ teams: [h, a] });
    const m = archive.matches && archive.matches[0];
    assert.ok(m, "archive : le match est rangé");
    const homeSide = m.home.team === h.name ? m.home : m.away, awaySide = homeSide === m.home ? m.away : m.home;
    assert.strictEqual(homeSide.teamTov || 0, r.teamStats.A.tov, "archive : pertes d'équipe (domicile)");
    assert.strictEqual(awaySide.teamTov || 0, r.teamStats.B.tov, "archive : pertes d'équipe (extérieur)");
    ok("5. matchLog (teamTov, une fois par match), sauvegarde et archive de saison conservent les pertes d'équipe.");
  }

  // ---------- 6 : direct (vue extérieur + adaptateur) ----------
  {
    let entry = null, home, away;
    for (let i = 0; i < 30 && !entry; i++) {
      home = E.generateTeam("France", 1); away = E.generateTeam("Espagne", 1);
      const en = LiveMatch.computeLiveMatchForTeams(E, home, away, 1, 0, 1, Date.now() - 3 * 3600 * 1000);
      if (en.teamStats && en.teamStats.A.tov + en.teamStats.B.tov > 0 && en.teamStats.A.tov !== en.teamStats.B.tov) entry = en;
    }
    assert.ok(entry, "un direct avec des pertes d'équipe");
    const league = { teams: [home, away], liveMatches: { k: entry } };
    const awayView = LiveMatch.viewLiveMatchForTeam(league, 1);
    assert.deepStrictEqual(awayView.teamStats, { A: entry.teamStats.B, B: entry.teamStats.A }, "vue extérieur : teamStats dans le repère du spectateur");
    const fromEv = { A: 0, B: 0 };
    awayView.events.forEach(e => { if (e.teamDelta) for (const k in e.teamDelta) fromEv[k] += e.teamDelta[k].tov; });
    assert.deepStrictEqual(fromEv, { A: awayView.teamStats.A.tov, B: awayView.teamStats.B.tov }, "vue extérieur : teamDelta retournés");
    const { createLiveAdapter } = await import(pathToFileURL(path.join(__dirname, "assets/live/adapter.js")).href);
    const td = t => ({ name: t.name, short: "T", color: "#123456", logo: "", players: t.players.map(p => ({ id: p.id, name: p.name, pos: p.position, avatar: "" })) });
    const live = { ...awayView, isHome: false };
    const ad = createLiveAdapter({ live, teams: { A: td(away), B: td(home) }, mine: null });
    live.events.forEach(ev => ad.applyEvent(ev));
    ad.finish && ad.finish();
    const st = ad.buildState(live.kickoffAt + live.totalDurationMs + 60_000);
    // teams[0] = domicile (repère du terrain), teams[1] = extérieur.
    assert.strictEqual(st.teams[0].teamTov, entry.teamStats.A.tov, "adaptateur : pertes d'équipe du domicile");
    assert.strictEqual(st.teams[1].teamTov, entry.teamStats.B.tov, "adaptateur : pertes d'équipe de l'extérieur");
    for (const [t, box] of [[0, entry.boxScoreA], [1, entry.boxScoreB]])
      assert.strictEqual(st.teams[t].players.reduce((x, p) => x + p.tov, 0), box.reduce((x, p) => x + (p.tov || 0), 0), "adaptateur : pertes individuelles = feuille finale");
    ok("6. Direct : teamStats et teamDelta dans le repère du spectateur ; adaptateur = feuille finale + pertes d'équipe, sans double comptage.");
  }

  // ---------- 7 : feuilles de match de la page ----------
  {
    const html = fs.readFileSync(path.join(__dirname, "moteurbasket3.html"), "utf8");
    const grab = re => { const i = html.search(re); assert.ok(i >= 0, String(re)); const j = html.indexOf("\n}\n", i); return html.slice(i, j + 2); };
    const colsSrc = n => { const i = html.search(new RegExp(`^const ${n} = \\[`, "m")); return html.slice(i, html.indexOf("];", i) + 2); };
    const src = [colsSrc("BOXSCORE_COLS"), colsSrc("LIVE_BOXSCORE_COLS"),
      grab(/^function boxscoreTableHtml\(/m), grab(/^function liveBoxscoreTableHtml\(/m), grab(/^function matchBoxscoreDuelHtml\(/m)].join("\n");
    const ctx = { escapeHtml: s => String(s), POS_SHORT: {}, statEvaluation: () => 0, formatPlusMinus: n => String(n || 0) };
    vm.createContext(ctx);
    vm.runInContext(src + "\nthis.api = { boxscoreTableHtml, liveBoxscoreTableHtml, matchBoxscoreDuelHtml, BOXSCORE_COLS, LIVE_BOXSCORE_COLS };", ctx);
    const { boxscoreTableHtml, liveBoxscoreTableHtml, matchBoxscoreDuelHtml, BOXSCORE_COLS, LIVE_BOXSCORE_COLS } = ctx.api;
    const row = (name, tov) => ({ name, position: "Meneur", min: 20, pts: 4, reb: 1, oreb: 0, ast: 1, stl: 0, blk: 0, tov, pf: 1, fgm2: 2, fga2: 4, fgm3: 0, fga3: 1, ftm: 0, fta: 0, plusMinus: 0 });
    const rows = [row("Un", 2), row("Deux", 1)];
    const cell = (h, label, cols, offset) => {
      const tr = h.split("<tr").find(t => t.includes(`>${label}</td>`));
      assert.ok(tr, `ligne ${label}`);
      const tds = tr.split("<td").slice(1).map(t => t.replace(/^[^>]*>/, "").replace(/<.*$/s, ""));
      return Number(tds[offset + cols.findIndex(c => c[0] === "tov")]);
    };
    const fin = boxscoreTableHtml(rows, null, 2);
    assert.strictEqual(cell(fin, "Équipe", BOXSCORE_COLS, 2), 2, "feuille finale : ligne Équipe = pertes d'équipe");
    assert.strictEqual(cell(fin, "Total", BOXSCORE_COLS, 2), 5, "feuille finale : total = joueurs (3) + équipe (2)");
    assert.ok(!boxscoreTableHtml(rows, null, 0).includes(">Équipe<"), "sans perte d'équipe : pas de ligne Équipe");
    assert.strictEqual(cell(boxscoreTableHtml(rows, null), "Total", BOXSCORE_COLS, 2), 3, "ancien match (sans teamTov) : total inchangé");
    const lv = liveBoxscoreTableHtml(rows, 1);
    assert.strictEqual(cell(lv, "Équipe", LIVE_BOXSCORE_COLS, 2), 1, "feuille en direct : ligne Équipe");
    assert.strictEqual(cell(lv, "Total", LIVE_BOXSCORE_COLS, 2), 4, "feuille en direct : total = joueurs + équipe");
    const duel = matchBoxscoreDuelHtml(rows, [row("Trois", 0)], 2, 1);
    const m = duel.match(/<span class="mbx-duel-val[^"]*">(\d+)<\/span><div class="mbx-duel-mid"><span class="mbx-duel-label">Pertes de balle<\/span>.*?<span class="mbx-duel-val[^"]*">(\d+)<\/span>/s);
    assert.ok(m && Number(m[1]) === 5 && Number(m[2]) === 1, "face à face : pertes = joueurs + équipe");
    // Chaque ouverture de feuille de match transmet les pertes d'équipe.
    for (const re of [/teamTovHome: matchTeamTovFromTeam\(homeTeam/, /teamTovHome: m\.home\.teamTov/, /teamTovHome: md\.teamTovHome/, /teamTovHome: m\.teamTovHome/, /teamTovHome: f\.result\.teamTovHome/])
      assert.ok(re.test(html), `feuille de match : ${re}`);
    assert.ok((html.match(/ev\.player && !ev\.teamTurnover\)/g) || []).length === 2 && /liveTeamTov\[k\] \+= /.test(html), "direct du club et spectateur : violation jamais imputée au porteur, comptée à l'équipe");
    assert.ok(/g\.tov = m\.teamTov \|\| 0;/.test(html), "statistiques d'équipe de la saison : pertes d'équipe comptées une fois par match");
    ok("7. Feuilles de match (finale, direct, face à face, archives, sélections, ligue privée, amicaux) : ligne « Équipe » et total = joueurs + équipe.");
  }

  // ---------- 8 : serveur (amicaux, ligue privée, sélections) ----------
  for (const [f, re] of [["server/friendlies.js", /res\.teamTovHome = \(result\.teamStats/], ["server/privateLeague.js", /match\.teamTovHome = \(result\.teamStats/], ["server/nationalMatches.js", /m\.teamTovHome = \(result\.teamStats/]])
    assert.ok(re.test(fs.readFileSync(path.join(__dirname, f), "utf8")), `${f} : pertes d'équipe stockées avec le match`);
  ok("8. Amicaux, ligue privée et sélections stockent les pertes d'équipe avec la feuille du match.");

  console.log("\n🏁 team_turnovers_test.js");
})().catch(e => { console.error(e); process.exit(1); });
