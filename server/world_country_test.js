"use strict";
// Aperçu du pays de Planète Hoop (retour utilisateur 2026-09-30, « comme
// l'aperçu du pays de BuzzerBeater ») : World.countryOverview et ses
// morceaux (countryStats : leaders avec les contres + meilleures
// performances en un match ; recordCountryHonours avec les finalistes ;
// countryTitles ; classement des managers du pays).
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Engine = require("../engine.js");
const store = require("./store.js");
const World = require("./world.js");

const D = 24 * 3600 * 1000;
const ok = m => console.log("✅ " + m);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "world-country-"));
  const multi = path.join(dir, "multi-league.json");
  const now = Date.now();
  const career = store.createMultiManagerCareer(["Lyon Aperçu", "Paris Aperçu"], now - 20 * D, "Lyon Aperçu");
  career.league.teams[0].lastSeenAt = now - D;
  await store.saveMultiLeague(career.league, multi);
  await World.catchUpWorld(multi, now);
  const world = await World.loadWorld(multi, now);

  // 1) Statistiques du pays : leaders (contres compris) et meilleurs matchs.
  const st = world.countryStats.fr;
  assert.ok(st.clubs === 10 && st.managers === 2, `clubs/managers : ${st.clubs}/${st.managers}`);
  assert.strictEqual(st.activeManagers, 1, "un seul manager vu dans les 7 derniers jours");
  ["pts", "reb", "ast", "blk"].forEach(k => {
    assert.ok(st.leaders[k].length > 0, `leaders ${k}`);
    assert.ok(st.leaders[k].every((r, i, a) => i === 0 || a[i - 1].value >= r.value), `leaders ${k} triés`);
    assert.ok(Number.isInteger(st.leaders[k][0].teamIdx) && st.leaders[k][0].leagueId === "fr-1", "leader cliquable (ligue + club)");
    assert.ok(st.bests[k].length > 0 && st.bests[k][0].value > 0, `meilleur match ${k}`);
  });
  const fr1 = await World.loadLeague(world, "fr-1", multi);
  let maxPts = 0;
  fr1.teams.forEach(t => t.players.forEach(p => (p.matchLog || []).forEach(m => { if (m.competition !== "friendly") maxPts = Math.max(maxPts, m.pts || 0); })));
  assert.strictEqual(st.bests.pts[0].value, maxPts, "record de points = vrai maximum des feuilles de match");
  { const top = st.bests.pts[0]; assert.ok(top.opponent && top.opponent !== top.team, `adversaire du record retrouvé : ${JSON.stringify(top)}`); }
  ok(`statistiques du pays : leaders pts/reb/ast/blk, record de points ${maxPts} (${st.bests.pts[0].name} contre ${st.bests.pts[0].opponent}), managers actifs`);

  // 2) Palmarès avec finalistes (championnat et Coupe).
  const lg = fr1;
  lg.playoffs = { champion: 2, finalSeries: { idxA: 2, idxB: 5 }, series: [] };
  const cup = { season: lg.seasonNumber || 1, champion: { leagueId: "fr-1", idx: 7, name: lg.teams[7].name },
    rounds: [{ index: 0, matches: [{ home: { leagueId: "fr-1", idx: 7, name: lg.teams[7].name }, away: { leagueId: "fr-1", idx: 2, name: lg.teams[2].name }, winner: "home", resolved: true }] }] };
  const w2 = { leagues: world.leagues, cups: { fr: cup }, history: {} };
  World.recordCountryHonours(w2, "fr", new Map([["fr-1", lg]]));
  const h = w2.history.fr[0];
  assert.deepStrictEqual([h.champion, h.championFinalist, h.cupWinner, h.cupFinalist], [lg.teams[2].name, lg.teams[5].name, lg.teams[7].name, lg.teams[2].name]);
  ok("palmarès : champion + finaliste de Division I, vainqueur + finaliste de la Coupe");

  // 3) Titres par club.
  const titles = World.countryTitles([
    { season: 2, champion: "A", championFinalist: "B", cupWinner: "B", cupFinalist: "C", superCupWinner: "A" },
    { season: 1, champion: "A", championFinalist: "C", cupWinner: "A", cupFinalist: "B" },
  ]);
  assert.deepStrictEqual(titles.map(t => t.name), ["A", "B", "C"]);
  assert.deepStrictEqual(titles[0], { name: "A", championships: 2, cups: 1, superCups: 1, finals: 0 });
  assert.deepStrictEqual(titles[2], { name: "C", championships: 0, cups: 0, superCups: 0, finals: 2 });
  ok("titres par club : championnats, Coupes, Supercoupes, finales perdues");

  // 5) Aperçu complet + classement des managers du pays.
  world.summaries["fr-1"].managers.forEach(m => { m.games = 0; });
  world.summaries["fr-1"].managers[0].games = 3;
  world.summaries["fr-1"].managers[0].rating = 1540;
  world.summaries["us-1"].managers = [{ idx: 4, name: "NY Test", rating: 1600, games: 2 }];
  world.history = { fr: [{ season: 1, champion: fr1.teams[3].name, championFinalist: fr1.teams[4].name, cupWinner: null }] };
  const ov = World.countryOverview(world, "fr", { myCountry: "fr" });
  assert.ok(ov.mine && ov.name === "France");
  assert.deepStrictEqual([ov.card.divisionCount, ov.card.leagueCount, ov.card.clubs, ov.card.managers], [1, 1, 10, 2]);
  assert.strictEqual(ov.divisions[0].leagues[0].id, "fr-1");
  assert.ok(ov.divisions[0].leagues[0].leader, "leader de chaque championnat");
  assert.deepStrictEqual(ov.ranking.top.map(r => [r.nationalRank, r.worldRank, r.name]), [[1, 2, "Lyon Aperçu"]]);
  assert.strictEqual(ov.ranking.worldTotal, 2);
  assert.strictEqual(ov.titles[0].name, fr1.teams[3].name);
  assert.ok(ov.clubs[fr1.teams[3].name] && ov.clubs[fr1.teams[3].name].leagueId === "fr-1", "clubs du palmarès cliquables");
  assert.ok(ov.leaders.blk.length && ov.bests.blk.length && !ov.leaders.eval);
  assert.ok(!("friendlies" in ov), "plus d'amicaux internationaux (retour utilisateur 2026-09-30)");
  const us = World.countryOverview(world, "us", { myCountry: "fr" });
  assert.ok(!us.mine && us.ranking.top[0].name === "NY Test" && us.ranking.top[0].worldRank === 1);
  assert.deepStrictEqual(us.titles, []);
  ok("countryOverview : carte du pays, divisions, classement national/mondial des managers, titres, clubs cliquables");

  // 6) /api/world/league-page : la vraie page Ligue d'un autre championnat
  // (même contenu que /api/world/team-page, rien de privé).
  {
    const http = require("http");
    const { createHandler } = require("./index.js");
    const usLg = await World.loadLeague(world, "us-1", multi);
    usLg.teams[3].isHuman = true;
    usLg.teams[3].managerLinkToken = "tok-secret-us";
    usLg.teams[3].plannedTactics = { any: 1 };
    await store.saveMultiLeague(usLg, multi);
    const server = http.createServer(createHandler(path.join(dir, "solo.json"), () => now, multi));
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const get = async (url, tok) => (await fetch(`http://127.0.0.1:${server.address().port}${url}`, { headers: { "X-TipIn-Token": tok } })).json();
    try {
      const tok = career.league.teams[0].managerLinkToken;
      const r = await get("/api/world/league-page?league=us-1", tok);
      assert.ok(r.ok && !r.mine && r.label === "Division I" && r.league.leagueId === "us-1");
      assert.strictEqual(r.league.teams.length, 10);
      assert.ok(r.league.teams.every(t => !t.managerLinkToken && !t.plannedTactics), "ni jeton ni tactique prévue");
      assert.ok(!r.league.liveMatches && (r.league.transferListings || []).every(l => l.status === "open" && !l.bids.length && l.currentBidderIdx == null), "ni directs ; annonces ouvertes seulement, sans enchérisseurs");
      assert.ok(Array.isArray(r.league.results) && r.league.results.length > 0, "résultats du championnat");
      assert.ok(r.league.teams.some(t => (t.players || []).some(p => (p.matchLog || []).length)), "journaux de matchs (leaders, feuilles de match)");
      assert.deepStrictEqual(r.league.divisionMoves, World.divisionMovesFor(world, "us-1"));
      const mine = await get("/api/world/league-page?league=fr-1", tok);
      assert.ok(mine.ok && mine.mine, "son propre championnat signalé (onglet Ligue habituel)");
      const missing = await get("/api/world/league-page?league=xx-9", tok);
      assert.ok(!missing.ok);
      // /api/world/player-page : même contenu nettoyé + le joueur demandé.
      const pl = usLg.teams[3].players[0];
      const pp = await get(`/api/world/player-page?league=us-1&team=3&id=${pl.id}`, tok);
      assert.ok(pp.ok && !pp.mine && pp.player.name === pl.name && pp.player.teamIdx === 3 && pp.player.playerId === pl.id);
      assert.ok(pp.league.teams.every(t => !t.managerLinkToken && !t.plannedTactics && !(t.pushSubscriptions || []).length), "ni jeton ni tactique prévue");
      assert.ok(!pp.league.liveMatches && (pp.league.transferListings || []).every(l => l.status === "open" && !l.bids.length) && !(pp.league.privateLeagues || []).length);
      assert.ok(!(await get(`/api/world/player-page?league=us-1&team=3&id=999999`, tok)).ok, "joueur inconnu refusé");
      assert.ok(!(await get(`/api/world/player-page?league=us-1&team=42&id=${pl.id}`, tok)).ok, "club inconnu refusé");
      // Meilleures performances : adversaire cliquable (championnat + club).
      const b = World.countryOverview(world, "fr", { myCountry: "fr" }).bests.pts.find(x => x.competition === "championship" && x.opponent);
      assert.ok(b && b.opponentLeagueId === "fr-1" && Number.isInteger(b.opponentIdx), "adversaire (ligue + index) des meilleures performances");
    } finally { server.close(); }
    ok("/api/world/league-page et player-page : championnat étranger complet (résultats, journaux de matchs, zones), sans jeton, tactique, enchérisseur ni direct ; « mine » pour le sien ; joueur ou club inconnu refusé ; adversaires des meilleures performances cliquables");
  }

  // 7) Informations cachées des joueurs des autres clubs (server/
  // publicPlayers.js) : scan complet du JSON.
  {
    const http = require("http");
    const { createHandler } = require("./index.js");
    const PublicPlayers = require("./publicPlayers.js");
    const usLg = await World.loadLeague(world, "us-1", multi);
    const usOpen = new Set((usLg.transferListings || []).filter(l => l.status === "open").map(l => l.playerId));
    const listedUs = usLg.teams[5].players.find(p => !usOpen.has(p.id) && !usLg.teams[5].players.slice(0, 1).includes(p));
    assert.ok(usLg.listPlayerForSale(5, listedUs.id, 90000, now), "annonce américaine");
    usLg.teams[6].youthPlayers = [{ ...usLg.teams[6].players[0] }];
    usLg.teams[6].scoutedAttrs = { 1: ["pass"] };
    await store.saveMultiLeague(usLg, multi);
    const frLg = await World.loadLeague(world, "fr-1", multi);
    const frOpen = new Set((frLg.transferListings || []).filter(l => l.status === "open").map(l => l.playerId));
    const listedFr = frLg.teams[4].players.find(p => !frOpen.has(p.id));
    assert.ok(frLg.listPlayerForSale(4, listedFr.id, 80000, now), "annonce française");
    // Scouting du manager : 2 caractéristiques révélées chez le club 2 ;
    // analyste vidéo pour une séance sur le club 3.
    frLg.teams[0].scoutedAttrs = { 2: ["pass", "rebound"] };
    frLg.teams[0].videoAnalyst = { level: 3, weeksEmployed: 0, baseSalary: 15000 };
    frLg.teams[0].lastVideoSessionAt = null;
    await store.saveMultiLeague(frLg, multi);
    const server = http.createServer(createHandler(path.join(dir, "solo.json"), () => now, multi));
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const get = async (url, tok) => (await fetch(`http://127.0.0.1:${server.address().port}${url}`, { headers: { "X-TipIn-Token": tok } })).json();
    // Chemins de toutes les clés `keys` dans l'objet.
    const scan = (obj, keys, pathStr = "", out = []) => {
      if (Array.isArray(obj)) obj.forEach((v, i) => scan(v, keys, `${pathStr}[${i}]`, out));
      else if (obj && typeof obj === "object") Object.keys(obj).forEach(k => { if (keys.includes(k)) out.push(`${pathStr}.${k}`); scan(obj[k], keys, `${pathStr}.${k}`, out); });
      return out;
    };
    const SECRET = ["attrs", "potential", "physicalPotential", "mentalPotential", "_trainProgress", "progressLog", "form", "weeksAtLowMotivation", "aggressiveness", "transferRequestActive", "retirementTalks", "pendingMatchBoost", "forSale", "salePrice"];
    try {
      const tok = career.league.teams[0].managerLinkToken;
      for (const route of [`team-page?league=us-1`, `league-page?league=us-1`, `player-page?league=us-1&team=5&id=${usLg.teams[5].players[0].id}`]) {
        const r = await get(`/api/world/${route}`, tok);
        assert.ok(r.ok, route);
        const found = scan(r, SECRET);
        const listedIds = new Set(r.league.transferListings.map(l => l.playerId));
        const listedPaths = [];
        r.league.teams.forEach((t, ti) => t.players.forEach((p, pi) => { if (listedIds.has(p.id)) listedPaths.push(`.league.teams[${ti}].players[${pi}].attrs`); }));
        const leaks = found.filter(x => !listedPaths.some(lp => x === lp || x.startsWith(lp + ".")));
        assert.deepStrictEqual(leaks, [], `${route} : aucune information cachée (${leaks.join(", ")})`);
        const listed = r.league.teams[5].players.find(p => p.id === listedUs.id);
        assert.ok(listed.attrs && Object.keys(listed.attrs).length === Object.keys(listedUs.attrs).length && !listed.attrsHidden, "joueur sur le marché : caractéristiques publiques");
        assert.ok(r.league.teams.every(t => t.players.every(p => listedIds.has(p.id) || (p.attrsHidden === true && !p.attrs))), "autres joueurs marqués attrsHidden");
        assert.ok(!("youthPlayers" in r.league.teams[6]), "académie d'un autre club non envoyée");
        assert.ok(!("scoutedAttrs" in r.league.teams[6]), "scouting d'un autre club non envoyé");
        assert.ok(r.league.transferListings.some(l => l.playerId === listedUs.id) && r.league.transferListings.every(l => l.status === "open" && !l.bids.length && l.currentBidderIdx === null), "annonces ouvertes seulement, sans enchérisseurs");
        // Ce qui reste affiché : identité, stats, salaire, forme physique.
        const p0 = r.league.teams[1].players[0];
        ["name", "age", "height", "nationality", "position", "salary", "condition", "matchLog", "id"].forEach(k => assert.ok(p0[k] !== undefined, `${route} : ${k} conservé`));
      }
      // Sa propre ligue (/api/save) : ses joueurs complets ; adversaires sans
      // potentiel ni traits cachés (caractéristiques gardées : scouting,
      // niveau de l'adversaire…) ; joueur sur le marché : potentiel gardé.
      const save = await get("/api/save", tok);
      const me = save.league.teams[save.myTeamIndex];
      assert.ok(me.players.every(p => typeof p.potential === "number" && p.attrs && typeof p.form === "number"), "ses joueurs : tout");
      const others = save.league.teams.filter((t, i) => i !== save.myTeamIndex);
      const openFr = new Set(save.league.transferListings.filter(l => l.status === "open").map(l => l.playerId));
      const HIDDEN = ["potential", "physicalPotential", "mentalPotential", "_trainProgress", "progressLog", "form", "weeksAtLowMotivation", "transferRequestActive", "retirementTalks", "pendingMatchBoost", "forSale", "salePrice"];
      others.forEach(t => t.players.forEach(p => {
        const leak = scan(p, [...HIDDEN, "aggressiveness"]).filter(x => !(openFr.has(p.id) && x === ".potential"));
        assert.deepStrictEqual(leak, [], `/api/save, ${t.teamName} / ${p.name} : ${leak.join(", ")}`);
        if (openFr.has(p.id)) assert.strictEqual(Object.keys(p.attrs).length, Engine.ATTRS.length, "joueur sur le marché : toutes ses caractéristiques");
        else assert.ok(p.attrsHidden === true, `${p.name} : attrsHidden`);
      }));
      // Club 2 : seulement les 2 caractéristiques révélées ; club 5 (non scouté) : aucune.
      save.league.teams[2].players.filter(p => !openFr.has(p.id)).forEach(p => assert.deepStrictEqual(Object.keys(p.attrs).sort(), ["pass", "rebound"]));
      assert.ok(save.league.teams[2].players.every(p => p.attrs.pass === frLg.teams[2].players.find(x => x.id === p.id).attrs.pass), "valeurs révélées exactes");
      save.league.teams[5].players.filter(p => !openFr.has(p.id)).forEach(p => assert.deepStrictEqual(p.attrs, {}));
      // Niveau de chaque club et estimations calculés par le serveur.
      const lvl = t => Math.round(t.players.reduce((a, p) => a + p.overall(), 0) / t.players.length);
      save.league.teams.forEach((t, i) => { if (i !== save.myTeamIndex) assert.strictEqual(t.publicLevel, lvl(frLg.teams[i]), `niveau du club ${i}`); });
      assert.ok(save.league.saleValuations && me.players.every(p => Object.prototype.hasOwnProperty.call(save.league.saleValuations, p.id)), "estimations de vente de ses joueurs");
      // Séance vidéo : les valeurs révélées arrivent dans la réponse.
      const vs = await (await fetch(`http://127.0.0.1:${server.address().port}/api/staff/video-session`, { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": tok }, body: JSON.stringify({ opponentIdx: 3 }) })).json();
      assert.ok(vs.ok && vs.revealed.length > 0, JSON.stringify(vs).slice(0, 200));
      const frNow = await World.loadLeague(world, "fr-1", multi);
      frNow.teams[3].players.forEach(p => assert.deepStrictEqual(vs.revealedAttrs[p.id], Object.fromEntries(vs.revealed.map(k => [k, p.attrs[k]]))));
      const save2 = await get("/api/save", tok);
      save2.league.teams[3].players.filter(p => !openFr.has(p.id)).forEach(p => assert.deepStrictEqual(Object.keys(p.attrs).sort(), [...vs.revealed].sort()));
      assert.strictEqual(typeof save.league.teams[4].players.find(p => p.id === listedFr.id).potential, "number", "adversaire sur le marché : potentiel (palier affiché par le marché)");
      assert.ok(others.every(t => !(t.youthPlayers || []).length && !(t.youthCandidates || []).length && !Object.keys(t.scoutedAttrs || {}).length), "académie et scouting des autres clubs non envoyés");
      assert.deepStrictEqual(PublicPlayers.HIDDEN_PLAYER_FIELDS.filter(k => !HIDDEN.includes(k)), ["transferRequestQuote", "transferRequestDiscussed", "trainingSecondsPlayedByPosition"]);
    } finally { server.close(); }
    ok("informations cachées : autre championnat (team/league/player-page) sans caractéristiques, potentiel ni traits cachés (sauf caractéristiques d'un joueur sur le marché), sans académie ni scouting des clubs ; /api/save : adversaires avec les seules caractéristiques révélées par le scouting (toutes pour un joueur sur le marché), niveau des clubs et estimations calculés par le serveur, séance vidéo renvoyant les valeurs révélées, sans potentiel, motivation, progression ni académie");
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("\n🏁 world_country_test.js : tout est vert");
})().catch(e => { console.error("❌", e); process.exit(1); });
