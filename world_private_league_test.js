// Ligues privées « monde » (retour utilisateur 2026-10-02 : « Pour la ligue
// privée il faut que n'importe quel joueur du monde qui est premium puisse
// rejoindre la LP sinon ça n'a aucun sens. ») — voir server/privateLeague.js,
// server/world.js:catchUpWorld et les routes /api/private-league/* de
// server/index.js.
// 1) Lyon (France, Division I) crée une ligue privée ; Boston (USA) et Rome
//    (Italie) la rejoignent par code, Séville (Espagne, Division II) aussi :
//    lancement automatique à 4. Berlin (non Premium) est refusé, Paris (déjà
//    dans une ligue privée) aussi.
// 2) Chaque membre voit la ligue dans sa propre sauvegarde (/api/save) :
//    4 membres avec nom, pays et division, clubs des autres championnats en
//    invités.
// 3) La J1 se joue au rattrapage du monde ; direct visible d'un membre
//    étranger ; résultats identiques pour les 4 membres + fil d'actu dans
//    leurs championnats respectifs ; Paris dissout sa ligue.
// 4) Migration : une ancienne ligue privée (League.privateLeagues, code
//    59LDVG, 3/4 clubs) est rangée au niveau du monde sans perte — un club
//    du Canada la rejoint avec le même code ; une ancienne ligue en cours
//    garde ses résultats ; une lecture en échec du stockage du monde ne
//    réécrit rien et ne vide aucune ancienne ligue.
const assert = require("assert");
const fs = require("fs");
const Engine = require("./engine.js");
const store = require("./server/store.js");
const World = require("./server/world.js");
const Accounts = require("./server/accounts.js");
const PL = require("./server/privateLeague.js");
const { startTestServer } = require("./test_helpers.js");
const ok = m => console.log("✅ " + m);

(async () => {
  const clock = { now: Date.now() };
  const { server, multiSavePath, baseUrl } = await startTestServer(() => clock.now);
  const career = store.createMultiManagerCareer(["Lyon LP", "Paris LP"], clock.now - 2 * 24 * 3600 * 1000, "Lyon LP");
  await store.saveMultiLeague(career.league, multiSavePath);
  await World.catchUpWorld(multiSavePath, clock.now);
  let w = await World.loadWorld(multiSavePath, clock.now);
  const assign = async (country, clubName) => {
    const r = await World.assignClub(w, multiSavePath, { country, clubName, now: clock.now });
    assert.ok(r.ok, `${clubName} placé`);
    return r;
  };
  const boston = await assign("us", "Boston LP");
  const roma = await assign("it", "Roma LP");
  const berlin = await assign("de", "Berlin LP");
  const toronto = await assign("ca", "Toronto LP");
  // Séville : Division II espagnole (championnat ouvert pour le test).
  const es2 = await World.createLeague(w, multiSavePath, "es", 2, 0, clock.now);
  const taken = Accounts.takeOverCpuClub(es2, "Sevilla LP");
  es2.teams[taken.teamIndex].country = "es";
  await store.saveMultiLeague(es2, multiSavePath);
  w.tokens[taken.token] = es2.leagueId;
  await World.saveWorld(w, multiSavePath);
  const sevilla = { token: taken.token, leagueId: es2.leagueId, teamIndex: taken.teamIndex };
  const lyonIdx = career.league.teams.findIndex(t => t.name === "Lyon LP");
  const parisIdx = career.league.teams.findIndex(t => t.name === "Paris LP");
  const lyon = { token: career.league.teams[lyonIdx].managerLinkToken, leagueId: "fr-1", teamIndex: lyonIdx };
  const paris = { token: career.league.teams[parisIdx].managerLinkToken, leagueId: "fr-1", teamIndex: parisIdx };
  // Premium pour tous sauf Berlin.
  for (const c of [lyon, paris, boston, roma, sevilla, toronto]) {
    const lg = await World.loadLeague(w, c.leagueId, multiSavePath);
    lg.teams[c.teamIndex].isPaying = true;
    await store.saveMultiLeague(lg, multiSavePath);
  }
  const api = async (path, who, body) => {
    const res = await fetch(new URL(path, baseUrl), { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "X-TipIn-Token": who.token }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };

  // 1) Création, adhésions, refus.
  let r = await api("/api/private-league/create", paris, { name: "Ligue de Paris", size: 6, venue: "home", time: "20:00" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  r = await api("/api/private-league/create", lyon, { name: "Ligue des Nations", size: 4, venue: "home", time: "20:00" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const lpId = r.body.privateLeagueId;
  const code = r.body.privateLeagues.find(l => l.id === lpId).code;
  assert.ok(/^[A-Z2-9]{6}$/.test(code));
  ok(`Lyon (France) crée « Ligue des Nations », code ${code}`);
  r = await api("/api/private-league/join", boston, { code: code.toLowerCase() });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(!r.body.started);
  const bostonView = r.body.privateLeagues.find(l => l.id === lpId);
  assert.ok(bostonView && bostonView.teamIndices.includes(boston.teamIndex) && bostonView.code === code);
  const lyonGuest = r.body.guestTeams.find(g => g.light.name === "Lyon LP");
  assert.ok(lyonGuest && lyonGuest.localIdx >= PL.PRIVATE_LEAGUE_GUEST_IDX && lyonGuest.light.country === "fr" && bostonView.creatorTeamIndex === lyonGuest.localIdx, "Lyon = club invité (index 4000+) et créateur vu de Boston");
  ok("Boston (USA) rejoint par code ; Lyon y apparaît en club invité (4000+), créateur");
  r = await api("/api/private-league/join", berlin, { code });
  assert.ok(r.status === 400 && /Premium/.test(r.body.error), JSON.stringify(r.body));
  ok("Berlin (Allemagne, non Premium) refusé par le serveur");
  r = await api("/api/private-league/join", paris, { code });
  assert.ok(r.status === 400 && /déjà/.test(r.body.error), JSON.stringify(r.body));
  ok("Paris (déjà dans une ligue privée) refusé");
  r = await api("/api/private-league/join", roma, { code });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  r = await api("/api/private-league/join", sevilla, { code });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.started, "4e club : lancement automatique");
  r = await api("/api/private-league/join", toronto, { code });
  assert.ok(r.status === 400 && /commencé/.test(r.body.error));
  ok("Rome (Italie) et Séville (Espagne, Division II) rejoignent : ligue lancée à 4 ; Toronto refusé (déjà commencée)");

  // 2) Chaque membre la voit dans sa propre sauvegarde.
  const members = [lyon, boston, roma, sevilla];
  for (const m of members) {
    const save = (await api("/api/save", m)).body;
    const lp = save.league.privateLeagues.find(l => l.id === lpId);
    assert.ok(lp && lp.status === "running" && lp.members.length === 4 && lp.teamIndices.includes(m.teamIndex), "ligue vue par chaque membre");
    assert.deepStrictEqual(lp.members.map(x => x.country).sort(), ["es", "fr", "it", "us"]);
    const sev = lp.members.find(x => x.name === "Sevilla LP");
    assert.ok(/II/.test(sev.label), `division de Séville : ${sev.label}`);
    lp.members.filter(x => !x.sameLeague).forEach(x => assert.ok(save.league.guestTeams.some(g => g.localIdx === x.idx && g.light.name === x.name), "invité présent"));
  }
  const bostonOwn = (await api("/api/save", boston)).body;
  assert.ok(Array.isArray(bostonOwn.myOfficialDays));
  ok("les 4 membres voient la ligue (pays, division, clubs invités) dans leur /api/save");

  // Paris dissout sa propre ligue (créateur qui part).
  const parisLp = (await api("/api/save", paris)).body.league.privateLeagues[0];
  r = await api("/api/private-league/leave", paris, { id: parisLp.id });
  assert.ok(r.status === 200 && r.body.dissolved && !r.body.privateLeagues.length);
  ok("Paris dissout sa ligue privée (créateur qui part)");

  // 3) J1 au rattrapage du monde.
  let raw = await store.loadWorldAuxStrict("privateleagues", multiSavePath);
  let wlp = raw.list.find(l => l.id === lpId);
  const kickoff = wlp.rounds[0].dueAt;
  // Vendredi de ligue privée = jour de match pour Boston (calendrier, amicaux).
  const dayKey = require("./server/friendlies.js").dayKeyOf(kickoff);
  assert.ok((await api("/api/save", boston)).body.myOfficialDays.includes(dayKey), "le vendredi compte comme jour de match à Boston");
  ok("le vendredi de ligue privée est un jour de match pour Boston (USA)");
  clock.now = kickoff + 60 * 1000;
  const evs = await World.catchUpWorld(multiSavePath, clock.now);
  assert.ok(evs.some(e => e.type === "private-league-round" && e.privateLeagueId === lpId && e.round === 0));
  raw = await store.loadWorldAuxStrict("privateleagues", multiSavePath);
  wlp = raw.list.find(l => l.id === lpId);
  assert.ok(wlp.rounds[0].matches.every(m => m.played && typeof m.liveUntil === "number"));
  ok("J1 jouée au rattrapage du monde (clubs de 4 championnats)");
  // Direct d'un membre étranger.
  const bView = (await api("/api/save", boston)).body.league.privateLeagues.find(l => l.id === lpId);
  const bMatch = bView.rounds[0].matches.find(m => m.home === boston.teamIndex || m.away === boston.teamIndex);
  assert.ok(bMatch.live && bMatch.scoreHome === null, "score caché pendant le direct");
  r = await api(`/api/private-league/live?lp=${lpId}&round=0&home=${bMatch.home}&away=${bMatch.away}`, boston);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.ok(r.body.mine && r.body.live.events.length > 10 && r.body.guestTeams.length === 1 && r.body.guestTeams[0].team.players.length >= 5, "direct : effectif complet de l'adversaire étranger");
  assert.strictEqual(r.body.live.opponentIdx, bMatch.home === boston.teamIndex ? bMatch.away : bMatch.home);
  const other = bView.rounds[0].matches.find(m => m !== bMatch);
  r = await api(`/api/private-league/live?lp=${lpId}&round=0&home=${other.home}&away=${other.away}`, boston);
  assert.ok(r.status === 200 && !r.body.mine && r.body.teamName && r.body.opponentName);
  r = await api(`/api/private-league/live?lp=${lpId}&round=0&home=${bMatch.home}&away=${bMatch.away}`, berlin);
  assert.strictEqual(r.status, 404);
  r = await api(`/api/shows/lp/prematch?lp=${lpId}&round=0`, boston);
  assert.ok(r.status === 404 || r.status === 200);
  ok("direct visible d'un membre étranger (son match et l'autre), refusé hors ligue");
  // Fin de diffusion : résultats et fil d'actu.
  clock.now = Math.max(...wlp.rounds[0].matches.map(m => m.liveUntil)) + 5000;
  await World.catchUpWorld(multiSavePath, clock.now);
  const seen = [];
  for (const m of members) {
    const v = (await api("/api/save", m)).body.league;
    const lp = v.privateLeagues.find(l => l.id === lpId);
    const nameOf = idx => lp.members.find(x => x.idx === idx).name;
    const res = lp.rounds[0].matches.map(x => `${nameOf(x.home)} ${x.scoreHome}-${x.scoreAway} ${nameOf(x.away)}`).sort().join(" | ");
    assert.ok(lp.rounds[0].matches.every(x => x.played && Number.isFinite(x.scoreHome)), "résultats visibles");
    seen.push(res);
    const me = v.teams[m.teamIndex];
    assert.ok(me.feed.entries.some(e => /Ligue des Nations · J1/.test(e.title)), `fil d'actu du membre (${m.leagueId})`);
  }
  assert.ok(seen.every(s => s === seen[0]));
  ok(`mêmes résultats pour les 4 membres (${seen[0]}) + fil d'actu dans leurs championnats`);

  // 4) Migration des anciennes ligues privées.
  const worldFile = multiSavePath.replace(/\.json$/, "") + ".world.privateleagues.json";
  w = await World.loadWorld(multiSavePath, clock.now);
  const fr = await World.loadLeague(w, "fr-1", multiSavePath);
  const cpu = fr.teams.map((t, i) => (t.isHuman ? -1 : i)).filter(i => i >= 0);
  fr.privateLeagues = [{
    id: "a1b2c3d4e5f6", name: "Coupe des champions", code: "59LDVG", creatorTeamIndex: parisIdx, size: 4, venue: "home", hour: 21, minute: 0,
    status: "open", createdAt: clock.now - 3600e3, startedAt: null, finishedAt: null, teamIndices: [parisIdx, cpu[0], cpu[1]], rounds: [],
  }];
  await store.saveMultiLeague(fr, multiSavePath);
  // Ancienne ligue en cours, avec une journée déjà jouée (us-1).
  const us = await World.loadLeague(w, "us-1", multiSavePath);
  // Boston + 3 clubs de l'IA (Boston y retrouvera son direct d'avant la migration).
  const usCpu = [boston.teamIndex].concat(us.teams.map((t, i) => (t.isHuman ? -1 : i)).filter(i => i >= 0).slice(0, 3));
  const old = { id: "0f0e0d0c0b0a", name: "Vieille ligue", code: "OLD234", creatorTeamIndex: usCpu[0], size: 4, venue: "neutral", hour: 21, minute: 30, status: "open", createdAt: clock.now, startedAt: null, finishedAt: null, teamIndices: usCpu.slice(), rounds: [] };
  PL.startPrivateLeagueNow(Engine, old, clock.now);
  us.privateLeagues = [old];
  PL.catchUpPrivateLeagues(Engine, us, old.rounds[0].dueAt + 1000);
  const oldScores = old.rounds[0].matches.map(m => `${us.teams[m.home].name} ${m.scoreHome}-${m.scoreAway} ${us.teams[m.away].name}`).sort();
  assert.ok(old.rounds[0].matches.every(m => m.played));
  await store.saveMultiLeague(us, multiSavePath);

  // 4a) Stockage du monde illisible : rien n'est réécrit ni vidé.
  const goodBody = fs.readFileSync(worldFile, "utf-8");
  fs.writeFileSync(worldFile, "{ illisible", "utf-8");
  await World.catchUpWorld(multiSavePath, clock.now + 1000);
  assert.strictEqual(fs.readFileSync(worldFile, "utf-8"), "{ illisible", "données du monde pas réécrites après une lecture en échec");
  w = await World.loadWorld(multiSavePath, clock.now);
  assert.strictEqual((await World.loadLeague(w, "fr-1", multiSavePath)).privateLeagues.length, 1, "ancienne ligue gardée tant que la migration n'est pas possible");
  r = await api("/api/private-league/join", toronto, { code: "59LDVG" });
  assert.ok(r.status === 503, `adhésion : indisponible (${r.status})`);
  const parisSave = (await api("/api/save", paris)).body.league.privateLeagues;
  assert.ok(parisSave.some(l => l.code === "59LDVG"), "pendant la panne, l'ancienne ligue reste visible de ses membres");
  ok("lecture en échec du stockage du monde : rien réécrit, anciennes ligues intactes et toujours visibles");
  fs.writeFileSync(worldFile, goodBody, "utf-8");

  // 4b) Migration (rattrapage du monde), idempotente.
  await World.catchUpWorld(multiSavePath, clock.now + 2000);
  await World.catchUpWorld(multiSavePath, clock.now + 3000);
  raw = await store.loadWorldAuxStrict("privateleagues", multiSavePath);
  const mig = raw.list.filter(l => l.id === "a1b2c3d4e5f6");
  assert.strictEqual(mig.length, 1, "migrée une seule fois");
  assert.ok(mig[0].code === "59LDVG" && mig[0].members.length === 3 && mig[0].members[0].name === "Paris LP" && mig[0].members.every(x => x.leagueId === "fr-1") && mig[0].creator.idx === parisIdx);
  w = await World.loadWorld(multiSavePath, clock.now);
  assert.strictEqual((await World.loadLeague(w, "fr-1", multiSavePath)).privateLeagues.length, 0, "copie du championnat vidée après migration vérifiée");
  const oldMig = raw.list.find(l => l.id === "0f0e0d0c0b0a");
  const migScores = oldMig.rounds[0].matches.map(m => `${oldMig.members[m.home].name} ${m.scoreHome}-${m.scoreAway} ${oldMig.members[m.away].name}`).sort();
  assert.deepStrictEqual(migScores, oldScores, "résultats de l'ancienne ligue en cours conservés");
  assert.ok(oldMig.rounds[0].matches.every(m => m.legacyKey) && oldMig.legacy.leagueId === "us-1");
  ok("anciennes ligues rangées au niveau du monde : même code, mêmes membres, résultats conservés, une seule fois");
  r = await api("/api/private-league/join", toronto, { code: "59ldvg" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.started, "4/4 : lancée");
  const tv = r.body.privateLeagues.find(l => l.code === "59LDVG");
  assert.ok(tv && tv.members.some(x => x.name === "Paris LP" && x.country === "fr") && tv.teamIndices.includes(toronto.teamIndex));
  ok("Toronto (Canada) rejoint l'ancienne « Coupe des champions » avec le code 59LDVG");
  // Le direct de l'ancienne ligue (rangé avant la migration, sous l'ancienne
  // clé, dans les directs de us-1) reste visible : « Revoir le direct ».
  const bOld = (await api("/api/save", boston)).body.league.privateLeagues.find(l => l.id === "0f0e0d0c0b0a");
  const bOldMatch = bOld.rounds[0].matches.find(m => m.home === boston.teamIndex || m.away === boston.teamIndex);
  clock.now = Math.max(clock.now, bOldMatch.liveUntil + 1000);
  r = await api(`/api/private-league/live?lp=0f0e0d0c0b0a&round=0&home=${bOldMatch.home}&away=${bOldMatch.away}`, boston);
  assert.ok(r.status === 200 && r.body.mine && r.body.live.replay && r.body.live.events.length > 10, JSON.stringify(r.body).slice(0, 200));
  ok("direct d'une ancienne ligue (avant migration) toujours disponible en « Revoir le direct »");

  server.close();
  console.log("\n✅ world_private_league_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
