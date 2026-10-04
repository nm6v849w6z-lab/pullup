// Signets (retour utilisateur 2026-10-04, voir server/bookmarks.js) :
// n'importe quel joueur (son effectif, un adversaire fort ou faible, un
// joueur d'un autre championnat), par id unique ; listes personnelles ;
// persistantes ; le signet suit le joueur transféré (même à l'étranger) ;
// supprimé seulement si le joueur n'existe plus nulle part.
const assert = require("assert");
const store = require("./store.js");
const World = require("./world.js");
const { startTestServer } = require("../test_helpers.js");
const ok = m => console.log("✅ " + m);

(async () => {
  const now0 = Date.now();
  const clock = { now: now0 };
  const { server, multiSavePath, baseUrl } = await startTestServer(() => clock.now);
  const career = store.createMultiManagerCareer(["Lyon Signets", "Paris Signets"], now0 - 3 * 24 * 3600 * 1000, "Lyon Signets");
  await store.saveMultiLeague(career.league, multiSavePath);
  await World.catchUpWorld(multiSavePath, clock.now);
  const w = await World.loadWorld(multiSavePath, clock.now);
  const tokA = career.league.teams[0].managerLinkToken, tokB = career.league.teams[1].managerLinkToken;
  const api = async (path, token, init = {}) => {
    const res = await fetch(new URL(path, baseUrl), { ...init, headers: { "Content-Type": "application/json", "X-TipIn-Token": token } });
    return { status: res.status, body: await res.json() };
  };
  const add = (token, playerId, leagueId) => api("/api/bookmarks", token, { method: "POST", body: JSON.stringify({ playerId, on: true, leagueId }) });
  const list = async token => (await api("/api/bookmarks", token)).body;

  // Championnat de Lyon (id du monde) et adversaires.
  const ownEntry = w.leagues.find(e => e.country === (career.league.country || "fr") && e.level === career.league.divisionLevel) || w.leagues[0];
  let own = null;
  for (const e of w.leagues) {
    const lg = await World.loadLeague(w, e.id, multiSavePath);
    if (lg && lg.teams.some(t => t.name === "Lyon Signets")) { own = { id: e.id, lg }; break; }
  }
  assert.ok(own, `championnat de Lyon retrouvé (${ownEntry && ownEntry.id})`);
  const lyon = own.lg.teams[0];
  const opps = own.lg.teams.slice(2).flatMap((t, i) => t.players.map(p => ({ p, idx: i + 2 })));
  opps.sort((a, b) => b.p.overall() - a.p.overall());
  const strong = opps[0], weak = opps[opps.length - 1];
  const us = await World.loadLeague(w, "us-1", multiSavePath);
  const foreign = us.teams[4].players[0];

  // 1) Ajouts : son joueur, un fort, un faible, un joueur d'un autre championnat.
  assert.strictEqual((await add(tokA, lyon.players[0].id)).status, 200);
  assert.strictEqual((await add(tokA, strong.p.id)).status, 200);
  assert.strictEqual((await add(tokA, weak.p.id)).status, 200);
  const rF = await add(tokA, foreign.id, "us-1");
  assert.strictEqual(rF.status, 200, JSON.stringify(rF.body));
  assert.strictEqual((await add(tokA, 987654321)).status, 404, "joueur inexistant refusé");
  let a = await list(tokA);
  assert.strictEqual(a.items.length, 4, JSON.stringify(a));
  const fItem = a.items.find(x => x.playerId === foreign.id);
  assert.ok(fItem && !fItem.mine && fItem.leagueId === "us-1" && fItem.teamName === us.teams[4].name && fItem.player && fItem.player.name === foreign.name);
  assert.ok(fItem.player.attrsHidden && Object.keys(fItem.player.attrs).length === 0 && fItem.player.potential === undefined, "joueur d'un autre championnat : rien de caché n'est envoyé");
  ok("ajout : son joueur, le plus fort et le plus faible adversaire, un joueur d'un autre championnat (4 signets)");

  // 2) Listes personnelles.
  const b = await list(tokB);
  assert.strictEqual(b.items.length, 0, "Paris n'a aucun signet");
  const saveB = (await api("/api/save", tokB)).body;
  const lyonSeenByB = (saveB.league && saveB.league.teams || []).find(t => t && t.teamName === "Lyon Signets");
  assert.ok(lyonSeenByB && !(lyonSeenByB.bookmarks || []).length, "les signets de Lyon ne sont pas envoyés à Paris");
  await add(tokB, weak.p.id);
  assert.strictEqual((await list(tokB)).items.length, 1);
  assert.strictEqual((await list(tokA)).items.length, 4, "l'ajout de Paris ne touche pas Lyon");
  ok("deux managers : listes indépendantes, signets jamais envoyés aux autres");

  // 3) Persistance : rechargement complet de la sauvegarde (reconnexion).
  const reloaded = await store.loadMultiLeague(multiSavePath, own.id);
  assert.strictEqual(reloaded.league.teams[0].bookmarks.length, 4, "signets enregistrés dans la sauvegarde");
  ok("persistance : signets relus depuis la sauvegarde");

  // 4) Transfert dans le championnat : le signet suit le joueur.
  {
    const lg = (await store.loadMultiLeague(multiSavePath, own.id)).league;
    const from = lg.teams[strong.idx];
    const to = lg.teams[strong.idx === 3 ? 4 : 3];
    const idx = from.players.findIndex(p => p.id === strong.p.id);
    to.players.push(from.players.splice(idx, 1)[0]);
    await store.saveMultiLeague(lg, multiSavePath);
    a = await list(tokA);
    const it = a.items.find(x => x.playerId === strong.p.id);
    assert.ok(it && it.mine && lg.teams[it.teamIdx].name === to.name, JSON.stringify(it));
  }
  ok("transfert dans le championnat : le joueur reste dans les signets, nouveau club");

  // 5) Transfert vers un autre championnat : le signet le retrouve.
  {
    const lg = (await store.loadMultiLeague(multiSavePath, own.id)).league;
    const usLg = (await store.loadMultiLeague(multiSavePath, "us-1")).league;
    const from = lg.teams[weak.idx];
    const idx = from.players.findIndex(p => p.id === weak.p.id);
    usLg.teams[6].players.push(from.players.splice(idx, 1)[0]);
    await store.saveMultiLeague(lg, multiSavePath);
    await store.saveMultiLeague(usLg, multiSavePath);
    a = await list(tokA);
    const it = a.items.find(x => x.playerId === weak.p.id);
    assert.ok(it && !it.mine && it.leagueId === "us-1" && it.teamName === usLg.teams[6].name, JSON.stringify(it));
    const relA = (await store.loadMultiLeague(multiSavePath, own.id)).league.teams[0].bookmarks.find(x => x.playerId === weak.p.id);
    assert.strictEqual(relA.leagueId, "us-1", "dernière position enregistrée");
    const itB = (await list(tokB)).items.find(x => x.playerId === weak.p.id);
    assert.ok(itB && itB.leagueId === "us-1", "Paris le retrouve aussi, chacun dans sa liste");
  }
  ok("transfert vers un autre championnat : le joueur reste dans les signets (position mise à jour)");

  // 6) Joueur retiré du jeu : signet supprimé.
  {
    const usLg = (await store.loadMultiLeague(multiSavePath, "us-1")).league;
    usLg.teams[4].players = usLg.teams[4].players.filter(p => p.id !== foreign.id);
    await store.saveMultiLeague(usLg, multiSavePath);
    a = await list(tokA);
    assert.ok(a.removed.includes(foreign.id) && !a.items.some(x => x.playerId === foreign.id) && a.items.length === 3, JSON.stringify(a.removed));
  }
  ok("joueur supprimé définitivement : signet retiré automatiquement");

  // 7) Retrait.
  {
    const r = await api("/api/bookmarks", tokA, { method: "POST", body: JSON.stringify({ playerId: lyon.players[0].id, on: false }) });
    assert.strictEqual(r.status, 200);
    a = await list(tokA);
    assert.ok(a.items.length === 2 && !a.items.some(x => x.playerId === lyon.players[0].id));
  }
  ok("retrait : le joueur disparaît des signets");

  server.close();
  console.log("\n🏁 Signets vérifiés.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
