// Ordres INDÉPENDANTS par match (retour utilisateur 2026-10-05 : « chaque
// match doit avoir ses propres ordres […] une modification sur le match N
// ne doit jamais modifier les ordres déjà définis du match N+1, N+2 »),
// dans toutes les compétitions :
//   A) championnat (navigateur + serveur) : J+1 et J+2 préparées, puis le
//      prochain match modifié → J+1/J+2 intactes, avant et après
//      rechargement, et leurs objets ne sont jamais partagés ;
//   B) Coupe (tour simulé avec son plan) : les ordres du prochain match de
//      championnat, déjà validés, ne sont plus remplacés ; l'historique
//      garde bien les ordres de Coupe joués ;
//   C) ligue privée : un jeu d'ordres PAR JOURNÉE (avant : un seul pour
//      toutes) ; ancien format migré sans rien changer aux autres journées ;
//      compo photographiée à T − 5 min = celle de la journée ;
//   D) amical / ligue privée : la copie du club jouée ne partage aucun
//      objet avec le vrai club.
const assert = require("assert");
const fs = require("fs");
const Engine = require("./engine.js");
const { generateMultiManagerLeague, dailyAnchoredCalendarConfig } = Engine;
const { scheduledTimeForLeagueCupRound } = require("./server/calendar.js");
const { ensureCupLiveMatchStarted, finalizeCupRound } = require("./server/liveMatch.js");
const PL = require("./server/privateLeague.js");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const ok = m => console.log("✅ " + m);
const DEFS = ["Homme à homme", "Zone press", "Box and one", "Zone extérieure", "Zone intérieure"];

(async () => {
  // ---------------------------------------------------------------- A
  {
    const { server, savePath, baseUrl } = await startTestServer();
    const dom = await openGame(html, baseUrl);
    const win = dom.window, doc = win.document;
    win.eval("TAB_HANDLERS.calendrier();");
    const n = win.eval("currentMatch.round");
    const pick = v => doc.querySelector(`#ordresDefenseSelect .seg-btn[data-value="${v}"]`).dispatchEvent(new win.Event("click", { bubbles: true }));
    const go = r => win.eval(`selectOrdresRound(${r}, "championship")`);
    const plans = () => JSON.parse(win.eval(`JSON.stringify([teamA.getPlanForRound(${n + 1}).defense, teamA.getPlanForRound(${n + 2}).defense, teamA.getPlanForRound(${n + 3}).defense])`));
    go(n + 1); pick(DEFS[1]); await win.eval("validateOrdres()");
    go(n + 2); pick(DEFS[2]); await win.eval("validateOrdres()");
    go(n + 3); pick(DEFS[4]); await win.eval("validateOrdres()");
    assert.deepStrictEqual(plans(), [DEFS[1], DEFS[2], DEFS[4]]);
    // Match N modifié (défense, rythme, cinq) puis enregistré.
    go(n); pick(DEFS[3]);
    win.eval(`(() => { const ids = teamA.players.map(p => p.id); const pos = POSITIONS[0]; const cur = teamA.lineup.starters[pos]; const other = teamA.players.find(p => !Object.values(teamA.lineup.starters).includes(p.id)); if (other) teamA.setStarter(pos, other.id); })()`);
    await win.eval("validateOrdres()");
    assert.strictEqual(win.eval("teamA.defense"), DEFS[3]);
    assert.deepStrictEqual(plans(), [DEFS[1], DEFS[2], DEFS[4]], "J+1..J+3 inchangées après modification du match N");
    // Le cinq des journées préparées n'a pas bougé non plus.
    assert.ok(win.eval(`JSON.stringify(teamA.getPlanForRound(${n + 1}).lineup.starters) !== JSON.stringify(teamA.lineup.starters)`), "cinq de J+1 indépendant du match N");
    // Aucun objet partagé entre deux plans ni avec les ordres en direct.
    assert.ok(win.eval(`(() => { const a = teamA.getPlanForRound(${n + 1}), b = teamA.getPlanForRound(${n + 2}); return a.lineup !== b.lineup && a.offensivePriorities !== b.offensivePriorities && a.lineup !== teamA.lineup && a.offensivePriorities !== teamA.offensivePriorities; })()`));
    // Modifier J+1 ne touche ni J+2 ni le match N.
    go(n + 1); pick(DEFS[0]); await win.eval("validateOrdres()");
    assert.deepStrictEqual(plans(), [DEFS[0], DEFS[2], DEFS[4]]);
    assert.strictEqual(win.eval("teamA.defense"), DEFS[3]);
    go(n + 1);
    assert.strictEqual(doc.querySelector("#ordresDefenseSelect .seg-btn.active").dataset.value, DEFS[0], "écran J+1 : ses propres ordres");
    go(n + 2);
    assert.strictEqual(doc.querySelector("#ordresDefenseSelect .seg-btn.active").dataset.value, DEFS[2], "écran J+2 : ses propres ordres");
    await flush(dom);
    const raw = readRawSave(savePath);
    assert.deepStrictEqual([n + 1, n + 2, n + 3].map(r => raw.team.plannedTactics[`championship:${r}`].defense), [DEFS[0], DEFS[2], DEFS[4]]);
    assert.strictEqual(raw.team.defense, DEFS[3]);
    win.close();
    const dom2 = await openGame(html, baseUrl);
    assert.deepStrictEqual(JSON.parse(dom2.window.eval(`JSON.stringify([teamA.defense, teamA.getPlanForRound(${n + 1}).defense, teamA.getPlanForRound(${n + 2}).defense, teamA.getPlanForRound(${n + 3}).defense])`)), [DEFS[3], DEFS[0], DEFS[2], DEFS[4]]);
    await flush(dom2); dom2.window.close(); server.close();
    ok("championnat : J+1, J+2, J+3 gardent leurs ordres quand le match N change (et inversement), serveur et rechargement compris");
  }

  // ---------------------------------------------------------------- A bis : moteur
  {
    const lg = generateMultiManagerLeague(["Moteur"], 1, Date.UTC(2026, 8, 22, 7), dailyAnchoredCalendarConfig());
    const t = lg.teams[0];
    t.defense = DEFS[0];
    t.stagePlanForRound(3, { defense: DEFS[1] });
    t.stagePlanForRound(4, { defense: DEFS[2] });
    t.offensivePriorities.reverse(); t.lineup.starters[Engine.POSITIONS[0]] = null; t.defense = DEFS[3];
    assert.deepStrictEqual([t.getPlanForRound(3).defense, t.getPlanForRound(4).defense], [DEFS[1], DEFS[2]]);
    assert.notStrictEqual(t.getPlanForRound(3).lineup.starters[Engine.POSITIONS[0]], null, "le cinq du plan n'est pas l'objet en direct");
    t.applyPlannedTacticsForRound(3);
    t.defense = DEFS[4]; t.lineup.starters[Engine.POSITIONS[1]] = null;
    assert.strictEqual(t.getPlanForRound(4).defense, DEFS[2]);
    assert.notStrictEqual(t.getPlanForRound(4).lineup.starters[Engine.POSITIONS[1]], null);
    ok("moteur : plans copiés en profondeur, appliquer/modifier un match ne touche jamais le plan d'un autre");
  }

  // ---------------------------------------------------------------- B
  const cupLeague = () => {
    for (let i = 0; i < 60; i++) {
      const league = generateMultiManagerLeague(["Coupe Test"], 1, Date.UTC(2026, 8, 22, 7), dailyAnchoredCalendarConfig());
      const round0 = league.pendingCupRound();
      if (round0.matches.find(m => !m.bye && (m.home === 0 || m.away === 0))) return { league, round0 };
    }
    throw new Error("pas de match de Coupe");
  };
  for (const mode of ["live", "finalize"]) {
    const { league, round0 } = cupLeague();
    const t = league.teams[0];
    t.defense = DEFS[1]; t.rhythm = "Rapide"; t.ordresValidatedRound = league.round;
    const champStarters = JSON.stringify(t.lineup.starters);
    t.stagePlanForRound(league.round + 1, { defense: DEFS[2] });
    t.stagePlanForRound(round0.index, { defense: DEFS[4], rhythm: "Lent" }, "cup");
    if (mode === "live") {
      const k = ensureCupLiveMatchStarted(Engine, league, scheduledTimeForLeagueCupRound(league, round0.dayIndex), scheduledTimeForLeagueCupRound);
      assert.ok(k.length, "direct de Coupe démarré");
      const live = league.liveMatches[k[0]];
      const mine = live.homeIdx === 0 ? "home" : "away";
      assert.strictEqual(live.tacticsUsed[mine].defense, DEFS[4], "le match de Coupe se joue avec SON plan");
    }
    finalizeCupRound(Engine, league);
    assert.deepStrictEqual([t.defense, t.rhythm, JSON.stringify(t.lineup.starters)], [DEFS[1], "Rapide", champStarters], `${mode} : ordres du prochain match de championnat intacts après la Coupe`);
    assert.strictEqual(t.getPlanForRound(league.round + 1).defense, DEFS[2], "plan de championnat suivant intact");
    assert.ok(!t.hasPlanForRound(round0.index, "cup"), "plan de Coupe consommé");
    const h = t.ordersHistory.find(x => x.competition === "cup");
    assert.ok(h && h.orders.defense === DEFS[4] && h.orders.rhythm === "Lent", `${mode} : historique « Partir de » = ordres de Coupe réellement joués`);
    assert.ok(!Object.keys(t.matchOrdersUsed || {}).length, "rien ne traîne après l'historique");
  }
  ok("Coupe (direct et rattrapage) : joue son plan, puis rend au championnat ses ordres validés ; historique correct");

  // ---------------------------------------------------------------- C
  {
    const lg = generateMultiManagerLeague(["LP A", "LP B"], 2, Date.UTC(2026, 8, 22, 7), dailyAnchoredCalendarConfig());
    const now = Date.UTC(2026, 9, 1, 8);
    const day = 24 * 3600 * 1000;
    const lp = {
      id: "lp1", status: "running",
      members: [{ leagueId: "fr-1", idx: 0, name: "LP A" }, { leagueId: "fr-1", idx: 1, name: "LP B" }],
      rounds: [0, 1, 2].map(i => ({ index: i, dueAt: now + (i + 1) * day, matches: [{ home: i % 2, away: (i + 1) % 2, played: false }] })),
    };
    const store = { list: [lp] };
    const me = { ref: { leagueId: "fr-1" }, idx: 0, league: lg };
    const team = lg.teams[0];
    const orders = def => ({ ...JSON.parse(JSON.stringify(team.snapshotTactics())), defense: def });
    const set = (round, def) => PL.setPrivateLeagueOrders(Engine, store, me, { id: "lp1", round, orders: orders(def) }, now);
    assert.ok(set(0, DEFS[1]).ok && set(1, DEFS[2]).ok && set(2, DEFS[4]).ok);
    assert.ok(set(0, DEFS[3]).ok, "J1 modifiée");
    assert.deepStrictEqual([0, 1, 2].map(r => PL.memberOrdersForRound(lp, 0, r).defense), [DEFS[3], DEFS[2], DEFS[4]], "J2 et J3 gardent leurs ordres");
    assert.notStrictEqual(PL.memberOrdersForRound(lp, 0, 1).lineup, PL.memberOrdersForRound(lp, 0, 2).lineup, "aucun objet partagé");
    assert.ok(PL.setPrivateLeagueOrders(Engine, store, me, { id: "lp1", round: 1, reset: true }, now).ok);
    assert.deepStrictEqual([0, 1, 2].map(r => (PL.memberOrdersForRound(lp, 0, r) || {}).defense || null), [DEFS[3], null, DEFS[4]], "retour aux ordres du club : J2 seulement");
    // Sans `round` : prochaine journée.
    assert.strictEqual(set(undefined, DEFS[0]).round, 0);
    // Journée verrouillée (T − 5 min) : refusée, les autres restent modifiables.
    assert.ok(!PL.setPrivateLeagueOrders(Engine, store, me, { id: "lp1", round: 0, orders: orders(DEFS[1]) }, lp.rounds[0].dueAt - 60 * 1000).ok);
    assert.ok(PL.setPrivateLeagueOrders(Engine, store, me, { id: "lp1", round: 2, orders: orders(DEFS[1]) }, lp.rounds[0].dueAt - 60 * 1000).ok);
    // Ancien format (un seul jeu pour toutes les journées) : migré à la
    // première modification, sans rien changer aux autres journées.
    const lp2 = JSON.parse(JSON.stringify(lp)); lp2.id = "lp2";
    delete lp2.members[0].ordersByRound; lp2.members[0].orders = orders(DEFS[2]);
    store.list.push(lp2);
    assert.deepStrictEqual([0, 1, 2].map(r => PL.memberOrdersForRound(lp2, 0, r).defense), [DEFS[2], DEFS[2], DEFS[2]], "ancien format lu pour chaque journée");
    assert.ok(PL.setPrivateLeagueOrders(Engine, store, me, { id: "lp2", round: 0, orders: orders(DEFS[4]) }, now).ok);
    assert.deepStrictEqual([0, 1, 2].map(r => PL.memberOrdersForRound(lp2, 0, r).defense), [DEFS[4], DEFS[2], DEFS[2]], "migration : J2/J3 gardent l'ancien jeu, J1 seule change");
    assert.ok(!lp2.members[0].orders, "ancien champ retiré");
    ok("ligue privée : un jeu d'ordres par journée, verrou par journée, ancien format migré sans changement");
  }

  // ---------------------------------------------------------------- D
  {
    const lg = generateMultiManagerLeague(["Copie"], 1, Date.UTC(2026, 8, 22, 7), dailyAnchoredCalendarConfig());
    const t = lg.teams[0];
    t.stagePlanForRound(5, { defense: DEFS[2] });
    const before = JSON.stringify([t.offensivePriorities, t.lineup, t.plannedTactics, t.defense]);
    const copy = Engine.teamFromSave(JSON.parse(JSON.stringify(Engine.serializeTeam(t))));
    const Friendlies = require("./server/friendlies.js");
    const shell = Friendlies.applyFriendlyOrders(Engine, copy, t, { ...JSON.parse(JSON.stringify(t.snapshotTactics())), defense: DEFS[4] }, Date.now());
    shell.offensivePriorities.reverse(); shell.lineup.starters[Engine.POSITIONS[0]] = null; shell.plannedTactics["championship:5"].defense = "X";
    assert.strictEqual(JSON.stringify([t.offensivePriorities, t.lineup, t.plannedTactics, t.defense]), before, "le vrai club n'a pas bougé");
    ok("amical / ligue privée : la copie jouée ne partage aucun objet avec le vrai club");
  }

  console.log("\n🏁 match_orders_independence_test.js : chaque match garde ses propres ordres.");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
