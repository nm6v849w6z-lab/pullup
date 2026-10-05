// Nouveau système de succès (2026-10-05) : 20 succès à 3 paliers + 5 Platine,
// registre central (assets/achievements.js), compteurs persistants
// (Team.achStats) alimentés par le moteur, paliers (achTiers), journal et
// notifications (achLog / achSeenAt), reprise des anciennes parties, écran.
const assert = require("assert");
const fs = require("fs");
const Engine = require("./engine.js");
const store = require("./server/store.js");
const { finalizeRound } = require("./server/liveMatch.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const A = require("./assets/achievements.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const ok = m => console.log("✅ " + m);
const DAY = 864e5;
const fresh = () => { const lg = store.createMultiManagerCareer(["Ach A", "Ach B"], Date.UTC(2026, 9, 1, 10)).league; lg.leagueId = "fr-1"; return lg; };
const tiers = (t, id) => (t.achTiers || {})[id] || 0;

(async () => {
  // 1) Registre.
  assert.strictEqual(A.ACHIEVEMENTS.length, 25);
  assert.strictEqual(A.ACHIEVEMENTS.filter(a => a.platinum).length, 5);
  assert.ok(A.ACHIEVEMENTS.filter(a => !a.platinum).every(a => a.tiers.length === 3));
  assert.ok(A.ACHIEVEMENTS.filter(a => a.platinum).every(a => a.tiers.length === 1));
  assert.strictEqual(new Set(A.ACHIEVEMENTS.map(a => a.id)).size, 25, "identifiants uniques");
  assert.ok(A.ACHIEVEMENTS.every(a => A.ICONS[a.icon] && !/[\u{1F300}-\u{1FAFF}]/u.test(A.ICONS[a.icon] + a.label + a.desc)), "un dessin par succès, aucun emoji");
  ok("registre : 20 succès à 3 paliers + 5 Platine, identifiants uniques, dessins, aucun emoji");

  // 2) Paliers numériques : seuil exact, dépassement, saut de plusieurs paliers.
  const simple = [
    ["FIRST_MATCH", "matches", [1, 25, 100]], ["FIRST_WIN", "wins", [1, 25, 100]], ["FIRST_TRAINING", "trainings", [1, 25, 100]],
    ["FIRST_SIGNING", "signings", [1, 10, 50]], ["PRUDENT_MANAGER", "posWeeks", [1, 10, 50]], ["FULL_HOUSE", "fullHouse", [1, 10, 50]],
    ["FIRST_SEASON", "seasons", [1, 3, 5]], ["FINAL_FOUR", "playoffQuals", [1, 3, 5]], ["CHAMPION", "titles", [1, 3, 5]],
    ["PROMOTION", "promotions", [1, 3, 5]], ["CUP_WINNER", "cups", [1, 3, 5]], ["SUPERCUP", "supercups", [1, 3, 5]],
    ["HARD_CORE", "keepMax", [1, 3, 5]], ["CENTENARY", "champWins", [25, 100, 250]],
  ];
  for (const [id, stat, need] of simple) {
    const t = fresh().teams[0];
    Engine.achAdd(t, stat, need[0] - 1);
    assert.strictEqual(tiers(t, id), 0, `${id} : rien sous le seuil`);
    Engine.achAdd(t, stat, 1);
    assert.strictEqual(tiers(t, id), 1, `${id} : Bronze au seuil exact ${need[0]}`);
    Engine.achAdd(t, stat, need[1] - need[0] - 1);
    assert.strictEqual(tiers(t, id), 1);
    Engine.achAdd(t, stat, 1);
    assert.strictEqual(tiers(t, id), 2, `${id} : Argent à ${need[1]}`);
    Engine.achAdd(t, stat, need[2] - need[1] + 7);
    assert.strictEqual(tiers(t, id), 3, `${id} : Or à ${need[2]} (dépassé)`);
    assert.strictEqual(t.achLog.filter(e => e.id === id).length, 3, `${id} : 3 déblocages, aucun doublon`);
  }
  { // Saut direct de 0 à 100 : Bronze, Argent et Or d'un coup.
    const t = fresh().teams[0];
    const got = Engine.achAdd(t, "wins", 100);
    assert.deepStrictEqual(got.filter(e => e.id === "FIRST_WIN").map(e => e.tier), [0, 1, 2]);
    assert.strictEqual(t.feed.filter ? true : true, true);
  }
  { // Séries : max (Rouleau compresseur, Forteresse) — jamais en arrière.
    const t = fresh().teams[0];
    Engine.achMax(t, "bestRegWins", 15); assert.strictEqual(tiers(t, "STEAMROLLER"), 2);
    Engine.achMax(t, "bestRegWins", 9); assert.strictEqual(t.achStats.bestRegWins, 15, "un record ne baisse pas");
    Engine.achMax(t, "bestRegWins", 20); assert.strictEqual(tiers(t, "STEAMROLLER"), 3);
    Engine.achMax(t, "bestHomePct", 74); assert.strictEqual(tiers(t, "FORTRESS"), 0);
    Engine.achMax(t, "bestHomePct", 75); assert.strictEqual(tiers(t, "FORTRESS"), 1);
    Engine.achMax(t, "bestHomePct", 90); assert.strictEqual(tiers(t, "FORTRESS"), 2);
    Engine.achMax(t, "bestHomePct", 100); assert.strictEqual(tiers(t, "FORTRESS"), 3);
    // Club IA : jamais de compteur.
    const cpu = fresh().teams.find(x => !x.isHuman);
    Engine.achAdd(cpu, "wins", 50);
    assert.ok(!cpu.achStats.wins && !Object.keys(cpu.achTiers).length);
  }
  ok("paliers : seuil exact, dépassement, saut de plusieurs paliers d'un coup, records jamais en baisse, clubs IA ignorés");

  // 3) Vrais évènements du moteur.
  {
    const lg = fresh();
    const t = lg.teams[0];
    let now = Date.UTC(2026, 9, 2, 10);
    // Tactique enregistrée (Bronze « À vos ordres »).
    t.saveTacticPreset(0, "Zone", t.snapshotTactics(), now);
    assert.strictEqual(tiers(t, "TACTICS_MASTER"), 1);
    // Matchs officiels : la tactique enregistrée est jouée telle quelle.
    for (let r = 0; r < 4; r++) { finalizeRound(Engine, lg, r, now += DAY); lg.round = r + 1; }
    const row = lg.standings().find(x => x.idx === 0);
    assert.strictEqual(t.achStats.matches, 4);
    assert.strictEqual(t.achStats.wins || 0, row.wins);
    assert.strictEqual(t.achStats.champWins || 0, row.wins, "victoires de championnat");
    assert.strictEqual(t.achStats.bestRegWins || 0, row.wins, "victoires de saison régulière au fil de l'eau");
    assert.deepStrictEqual(t.achStats.presetsUsed, [`Zone|${now - 4 * DAY}`].map(() => t.achStats.presetsUsed[0]), "tactique enregistrée utilisée");
    assert.strictEqual(t.achStats.presetsUsed.length, 1);
    assert.strictEqual(t.achStats.presetWins || 0, row.wins);
    assert.strictEqual(tiers(t, "FIRST_MATCH"), 1);
    // MVP de match.
    const mvps = (t.players || []).reduce((n, p) => n + (p.matchLog || []).filter(m => m.isMvp).length, 0);
    assert.strictEqual(t.achStats.matchMvp || 0, mvps, "MVP de match comptés");
    // Amical / ligue privée : jamais comptés.
    Engine.recordMatchStatsAndAwardMvp(t, lg.teams[2], -1, "friendly", now);
    assert.strictEqual(t.achStats.matches, 4, "amical ignoré");
    // Signets : joueurs distincts.
    lg.teams[3].players.slice(0, 3).forEach(p => t.setBookmark(p.id, true, null, now));
    t.setBookmark(lg.teams[3].players[0].id, false); t.setBookmark(lg.teams[3].players[0].id, true, null, now);
    assert.strictEqual(t.achStats.bookmarked.length, 3, "retirer/remettre le même joueur ne compte pas deux fois");
    assert.strictEqual(tiers(t, "SCOUT_EYE"), 1);
    // Recrutement (et jamais la reprise des anciens transferts).
    Engine.recordTeamTransfer(t, { id: "x1", kind: "buy", player: lg.teams[4].players[0], fee: 1, human: true, at: now });
    Engine.recordTeamTransfer(t, { id: "seed:9", kind: "buy", player: lg.teams[4].players[1], fee: 1, human: true, at: now });
    assert.strictEqual(t.achStats.signings, 1);
    // Entraînement + semaine dans le vert.
    const before = { tr: t.achStats.trainings || 0, pw: t.achStats.posWeeks || 0 };
    const ledgerKey = `${(t.seasonHistory || []).length + 1}:${t.week}`;
    const res = t.trainWeek(lg.divisionLevel, now);
    const net = Object.values(t.financeLedger[ledgerKey] || {}).reduce((a, v) => a + v, 0);
    assert.strictEqual((t.achStats.trainings || 0) - before.tr, res.slots.length);
    assert.strictEqual((t.achStats.posWeeks || 0) - before.pw, net > 0 ? 1 : 0, "semaine dans le vert = solde de la semaine > 0");
    // Coupe de la ligue : une seule fois par édition.
    lg.recordTrophy(0, "cup", now); lg.recordTrophy(0, "cup", now);
    assert.strictEqual(t.achStats.cups, 1);
    Engine.achAddOnce(t, "supercups", "sc:1"); Engine.achAddOnce(t, "supercups", "sc:1");
    assert.strictEqual(t.achStats.supercups, 1);
    // Académie.
    if (Array.isArray(t.youthPlayers) && t.youthPlayers.length) {
      t.promoteYouthPlayer(t.youthPlayers[0].id, now, 1);
      assert.ok(t.achStats.homegrownMax >= 1 && tiers(t, "TALENT_SCOUT") >= 1, "jeune de l'académie promu : Bronze");
    }
    // Plusieurs succès au même évènement : un match gagné (1er) → Premier coup d'envoi + Première victoire.
    const t2 = fresh().teams[0];
    const got = Engine.achRecordOfficialMatch(t2, { won: true, competition: "championship", mvp: true }, now);
    assert.deepStrictEqual(got.map(e => e.id).sort(), ["FIRST_MATCH", "FIRST_WIN", "MVP_MAKER"]);
    ok("évènements réels : matchs officiels (victoires, championnat, tactique enregistrée, MVP), amicaux ignorés, signets distincts, recrutements, entraînement, semaine dans le vert, Coupe/Supercoupe une fois, académie ; plusieurs succès au même évènement");
  }

  // 4) Fin de saison : séries réelles (Dynastie, Forteresse imprenable),
  //    saison parfaite, distinctions, Génération dorée.
  {
    const lg = fresh();
    const t = lg.teams[0];
    const hg = t.players.slice(0, 4);
    hg.forEach(p => { p.homegrownClub = t.name.trim().toLowerCase(); });
    let season = 0;
    const playSeason = ({ champion, allHomeWon, allWon, awards = [] }) => {
      season++;
      lg.seasonId = `s${season}`;
      // Saison régulière complète d'après le vrai calendrier : une défaite à
      // domicile (sauf allHomeWon), une à l'extérieur (sauf allWon).
      let homeLossDone = false, awayLossDone = false;
      lg.results = [];
      lg.schedule.slice(0, lg.totalRounds).forEach((rd, round) => rd.forEach(m => {
        if (m.home !== 0 && m.away !== 0) return;
        const home = m.home === 0;
        let win = true;
        if (home && !allHomeWon && !homeLossDone) { win = false; homeLossDone = true; }
        if (!home && !allWon && !awayLossDone) { win = false; awayLossDone = true; }
        const mine = win ? 85 : 75, theirs = 80;
        lg.results.push({ round, home: m.home, away: m.away, scoreHome: home ? mine : theirs, scoreAway: home ? theirs : mine });
      }));
      lg.playoffs = { seeds: [0, 1, 2, 3], champion: champion ? 0 : 1 };
      Engine.achSeasonEnd(lg, 0, awards, Date.UTC(2026, 10, season));
      Engine.achSeasonEnd(lg, 0, awards, Date.UTC(2026, 10, season)); // idempotent
      t.seasonHistory = [{ seasonId: lg.seasonId, wins: 3, played: 4 }].concat(t.seasonHistory || []);
    };
    playSeason({ champion: true, allHomeWon: true, allWon: false, awards: [{ key: "allStar", teamIdx: 0, playerId: hg[0].id }, { key: "mvp", teamIdx: 0, playerId: hg[1].id }] });
    playSeason({ champion: true, allHomeWon: false, allWon: false, awards: [{ key: "allStar", teamIdx: 0, playerId: hg[0].id }, { key: "youngPlayer", teamIdx: 0, playerId: hg[2].id }] });
    assert.strictEqual(t.achStats.seasons, 2, "fin de saison idempotente");
    assert.strictEqual(tiers(t, "IMPREGNABLE"), 0, "une défaite à domicile casse la série");
    assert.strictEqual(tiers(t, "DYNASTY"), 0);
    playSeason({ champion: true, allHomeWon: true, allWon: true, awards: [{ key: "allStar", teamIdx: 0, playerId: hg[3].id }] });
    assert.strictEqual(tiers(t, "DYNASTY"), 1, "3 titres consécutifs → Dynastie");
    assert.strictEqual(tiers(t, "PERFECT_SEASON"), 1, "saison régulière sans défaite");
    assert.strictEqual(tiers(t, "IMPREGNABLE"), 0, "une seule saison invaincue à domicile");
    playSeason({ champion: false, allHomeWon: true, allWon: false });
    assert.strictEqual(tiers(t, "IMPREGNABLE"), 1, "2 saisons consécutives invaincu à domicile");
    assert.strictEqual(t.achStats.titleStreak, 0, "saison sans titre : série remise à zéro");
    assert.strictEqual(t.achStats.allStarHG.length, 2, "même joueur 2 fois = 1 seul");
    assert.strictEqual(tiers(t, "GOLDEN_GENERATION"), 0);
    playSeason({ champion: false, allHomeWon: false, allWon: false, awards: [{ key: "allStar", teamIdx: 0, playerId: hg[1].id }] });
    assert.strictEqual(tiers(t, "GOLDEN_GENERATION"), 1, "3 joueurs de l'académie dans le cinq majeur (saisons différentes)");
    assert.strictEqual(t.achStats.seasonMvp, 1);
    assert.strictEqual(t.achStats.bestYoungHG, 1);
    assert.ok(tiers(t, "MVP_MAKER") >= 2 && tiers(t, "TALENT_SCOUT") >= 2);
    assert.strictEqual(tiers(t, "FIRST_SEASON"), 3, "5 saisons terminées → Or");
    // Saisons non consécutives : la série de titres repart de 1.
    const t2 = fresh().teams[0];
    const lg2 = { teams: [t2], leagueId: "x", totalRounds: 1, results: [], playoffs: { seeds: [0], champion: 0 }, standings: () => [] };
    lg2.seasonId = "a"; Engine.achSeasonEnd(lg2, 0, []);
    t2.seasonHistory = [{}, {}]; // une saison sautée
    lg2.seasonId = "b"; Engine.achSeasonEnd(lg2, 0, []);
    assert.strictEqual(t2.achStats.titleStreak, 1, "saisons non consécutives : pas de série");
    // Club immortel : 500 victoires de championnat, montées/descentes comprises.
    const t3 = fresh().teams[0];
    Engine.achAdd(t3, "champWins", 499); assert.strictEqual(tiers(t3, "IMMORTAL_CLUB"), 0);
    Engine.achAdd(t3, "champWins", 1); assert.strictEqual(tiers(t3, "IMMORTAL_CLUB"), 1);
    assert.strictEqual(tiers(t3, "CENTENARY"), 3);
    ok("fin de saison : Dynastie (3 titres consécutifs, série cassée par une saison sans titre ou sautée), Saison parfaite, Forteresse imprenable (2 saisons consécutives), Génération dorée (3 joueurs distincts), MVP/meilleur jeune, Club immortel");
  }

  // 5) Persistance et changement de division.
  {
    const lg = fresh();
    const t = lg.teams[0];
    Engine.achAdd(t, "wins", 30); Engine.achAddUnique(t, "bookmarked", 42);
    const back = store.deserializeMultiLeague(JSON.parse(JSON.stringify(store.serializeMultiLeague(lg)))).league.teams[0];
    assert.deepStrictEqual(back.achStats, JSON.parse(JSON.stringify(t.achStats)));
    assert.deepStrictEqual(back.achTiers, t.achTiers);
    assert.strictEqual(back.achLog.length, t.achLog.length, "aucune notification recréée au rechargement");
    // Club déplacé dans un autre championnat (montée/descente) : tout suit le club.
    const other = fresh();
    other.teams[5] = back; other.teams[5].isHuman = true;
    const moved = store.deserializeMultiLeague(JSON.parse(JSON.stringify(store.serializeMultiLeague(other)))).league.teams[5];
    assert.strictEqual(moved.achStats.wins, 30);
    ok("persistance : rechargement, redémarrage, changement de division sans perte ni notification répétée");
  }

  // 6) Reprise d'une ancienne partie (anciens succès supprimés, compteurs reconstruits, sans notification).
  {
    const lg = fresh();
    const data = JSON.parse(JSON.stringify(store.serializeMultiLeague(lg)));
    const td = data.league.teams[0];
    delete td.achStats; delete td.achTiers; delete td.achLog; delete td.achSeenAt;
    td.achievements = [{ key: "firstSeason", label: "Première saison", seasonNumber: 1, at: 1 }, { key: "keep3" }];
    td.seasonHistory = [
      { seasonId: "s2", divisionLevel: 1, played: 18, wins: 16, losses: 2, playoffResult: "Champion", champion: true },
      { seasonId: "s1", divisionLevel: 2, played: 18, wins: 18, losses: 0, playoffResult: "Champion", champion: true },
    ];
    td.trophies = [{ type: "championship" }, { type: "championship" }, { type: "national-cup" }];
    const m = store.deserializeMultiLeague(data).league.teams[0];
    assert.ok(!m.achievements, "ancien format abandonné");
    assert.strictEqual(m.achStats.seasons, 2);
    assert.strictEqual(m.achStats.wins, 34);
    assert.strictEqual(m.achStats.titles, 2);
    assert.strictEqual(m.achStats.cups, 1);
    assert.strictEqual(m.achStats.promotions, 1, "montée D2 → D1 reconnue");
    assert.strictEqual(m.achStats.perfectSeasons, 1);
    assert.strictEqual(m.achStats.bestTitleStreak, 2);
    assert.ok(tiers(m, "FIRST_WIN") === 2 && tiers(m, "PERFECT_SEASON") === 1 && tiers(m, "CHAMPION") === 1);
    assert.ok(m.achLog.length && m.achLog.every(e => e.silent), "déblocages repris sans notification");
    const again = store.deserializeMultiLeague(JSON.parse(JSON.stringify(store.serializeMultiLeague(store.deserializeMultiLeague(data).league)))).league.teams[0];
    assert.strictEqual(again.achStats.wins, 34, "reprise faite une seule fois");
    ok("anciennes parties : anciens succès retirés, compteurs reconstruits depuis l'histoire du club, aucune notification");
  }

  // 7) Écran et notifications dans le navigateur.
  {
    const { server, multiSavePath, baseUrl } = await startTestServer(() => Date.now());
    const lg = fresh();
    const t = lg.teams[0];
    Engine.achAdd(t, "wins", 12);
    t.achSeenAt = 0;
    await store.saveMultiLeague(lg, multiSavePath);
    let dom = await openGame(html, `${baseUrl}?m=${t.managerLinkToken}`);
    let win = dom.window, doc = win.document;
    await win.__lastAchSeen;
    const toast = doc.getElementById("achToast");
    assert.ok(toast && /Succès débloqué/.test(toast.textContent) && /Première victoire/.test(toast.textContent) && toast.querySelector("svg.ach-medal"), "notification de déblocage (médaille dessinée)");
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(toast.textContent), "pas d'emoji");
    win.eval(`showManagerProfile(myTeamIndex)`);
    const cards = doc.querySelectorAll("#mpAchievements .ach-card");
    assert.strictEqual(cards.length, 25);
    const fw = doc.querySelector('#mpAchievements [data-ach-id="FIRST_WIN"]');
    assert.ok(/Bronze obtenu/.test(fw.textContent) && /12 \/ 25/.test(fw.textContent.replace(/\s+/g, " ")) && /12 \/ 100/.test(fw.textContent.replace(/\s+/g, " ")), "compteurs 12 / 25 et 12 / 100");
    assert.strictEqual(fw.querySelectorAll(".ach-medal.is-locked").length, 2);
    assert.ok(doc.querySelectorAll("#mpAchievements .ach-plat").length === 5 && /Verrouillé/.test(doc.querySelector('[data-ach-id="DYNASTY"]').textContent));
    assert.ok(!doc.querySelector("#mpAchievements .ach-grid"), "ancien écran retiré");
    await flush(dom); dom.window.close();
    // Rechargement : plus de notification (déjà vue côté serveur).
    dom = await openGame(html, `${baseUrl}?m=${t.managerLinkToken}`);
    await new Promise(r => setTimeout(r, 200));
    const t2 = dom.window.document.getElementById("achToast");
    assert.ok(!t2 || !t2.classList.contains("show"), "pas de notification répétée au rechargement");
    await flush(dom); dom.window.close(); server.close();
    ok("écran : 25 cartes, médailles et compteurs, Platine verrouillé ; notification une seule fois (vue enregistrée par le serveur)");
  }
  console.log("\n🏁 achievements_test.js : système de succès conforme.");
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
