// Migration des IDs de joueurs vers 10 chiffres (demande du 2026-10-06) :
// un monde « d'avant » (petits IDs, uniques seulement par championnat, deux
// championnats numérotés pareil) est migré au démarrage ; toutes les
// références suivent ; aucun ID n'est réattribué.
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-pid";
const fs = require("fs");
const Engine = require("./engine.js");
const store = require("./server/store.js");
const World = require("./server/world.js");
const Migration = require("./server/playerIdMigration.js");
const { startTestServer } = require("./test_helpers.js");
const check = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };

(async () => {
  const now = Date.now();
  const { server, multiSavePath } = await startTestServer(() => now);
  const career = store.createMultiManagerCareer(["Lyon Migration", "Paris Migration"], now);
  await store.saveMultiLeague(career.league, multiSavePath);
  await World.catchUpWorld(multiSavePath, now);
  let w = await World.loadWorld(multiSavePath, now);
  const es = await World.createLeague(w, multiSavePath, "es", 2, 0, now);
  await store.saveMultiLeague(es, multiSavePath);
  await World.saveWorld(w, multiSavePath);
  w = await World.loadWorld(multiSavePath, now);
  check(w.leagues.length >= 2, `monde à ${w.leagues.length} championnats`);

  // « Rajeunit » les sauvegardes : chaque ID de joueur à 10 chiffres
  // devient un petit ID, la numérotation repartant de 1 dans CHAQUE
  // championnat (IDs en commun entre championnats, comme avant).
  const legacy = {};
  for (const entry of w.leagues) {
    const { league } = await store.loadMultiLeague(multiSavePath, entry.id);
    let text = JSON.stringify(store.serializeMultiLeague(league));
    const ids = [];
    league.teams.forEach(t => t.players.concat(t.youthPlayers || []).forEach(p => ids.push(p.id)));
    (league.freeAgents || []).forEach(p => ids.push(p.id));
    const map = new Map(ids.map((id, i) => [id, i + 1]));
    text = text.replace(/\b(\d{10})\b/g, (m, d) => (map.has(Number(d)) ? String(map.get(Number(d))) : m));
    const data = JSON.parse(text);
    data.league.teams.forEach((t, idx) => (t.players || []).forEach(p => { legacy[`${entry.id}|${idx}|${p.name}`] = p.id; }));
    const { league: old } = store.deserializeMultiLeague(data);
    await store.saveMultiLeague(old, multiSavePath);
  }
  // Un vieux lien public et une référence de sélection vers un joueur de
  // l'autre championnat (même petit ID qu'un joueur du premier).
  const lyon = w.leagues.find(e => e.id !== es.leagueId).id;
  const { league: L1 } = await store.loadMultiLeague(multiSavePath, lyon);
  const { league: L2 } = await store.loadMultiLeague(multiSavePath, es.leagueId);
  const star = L2.teams[0].players[0];
  const twin = L1.teams.flatMap(t => t.players).find(p => p.id === star.id);
  check(!!twin && twin.name !== star.name, `ancien ID ${star.id} porté par deux joueurs de deux championnats`);
  await store.savePlayerLinks({ version: 1, codes: { abc123: { leagueId: es.leagueId, teamIdx: 0, playerId: star.id, name: star.name, createdAt: now } } }, multiSavePath);
  const NT = require("./server/nationalTeams.js");
  const nt = NT.emptyStore();
  nt.mandates.push({ id: "m1", teamId: "es-A", key: "k", preselection: [{ p: star.id, n: star.name }], watchlist: [{ p: twin.id, n: twin.name }], nids: { [`${star.id}|${star.name}`]: 1 } });
  await NT.saveStore(nt, multiSavePath);
  // Annonce du club vendeur, composition.
  const seller = L1.teams.findIndex(t => !t.isHuman);
  L1.listPlayerForSale(seller, L1.teams[seller].players[1].id, 1, now);
  const listedBefore = L1.transferListings.filter(x => x.status === "open" && x.sellerIdx === seller).map(x => L1.listingPlayer(x).name).sort();
  await store.saveMultiLeague(L1, multiSavePath);
  const starterOld = Object.values(L1.teams[0].lineup.starters)[0];
  const starterName = L1.teams[0].players.find(p => p.id === starterOld).name;

  // Migration.
  const res = await Migration.runIfNeeded(multiSavePath, { now, log: () => {} });
  check(res && res.players > 0, `migration : ${res.players} joueurs, ${res.refs} références`);
  const again = await Migration.runIfNeeded(multiSavePath, { now, log: () => {} });
  check(again && again.skipped, "une seule fois");

  const all = [];
  const M1 = (await store.loadMultiLeague(multiSavePath, lyon)).league;
  const M2 = (await store.loadMultiLeague(multiSavePath, es.leagueId)).league;
  [M1, M2].forEach(lg => lg.teams.forEach(t => t.players.concat(t.youthPlayers || []).forEach(p => all.push(p.id))));
  check(all.every(id => /^\d{10}$/.test(String(id))), "tous les joueurs ont un ID de 10 chiffres");
  check(new Set(all).size === all.length, "aucun doublon dans tout le monde");
  const star2 = M2.teams[0].players.find(p => p.name === star.name);
  const twin2 = M1.teams.flatMap(t => t.players).find(p => p.name === twin.name);
  check(star2.id !== twin2.id, "les deux anciens homonymes d'ID ont des IDs distincts");
  const st = M1.teams[0].players.find(p => p.name === starterName);
  check(Object.values(M1.teams[0].lineup.starters).includes(st.id), "composition : le titulaire suit son nouvel ID");
  const listedAfter = M1.transferListings.filter(x => x.status === "open" && x.sellerIdx === seller).map(x => M1.listingPlayer(x) && M1.listingPlayer(x).name).sort();
  check(listedBefore.length && JSON.stringify(listedAfter) === JSON.stringify(listedBefore), `annonces : les ${listedBefore.length} annonces du club vendeur désignent toujours ses mêmes joueurs`);
  const links = await store.loadPlayerLinks(multiSavePath);
  check(links.codes.abc123.playerId === star2.id, "lien public : nouvel ID du bon joueur (pas son homonyme d'ID)");
  const nt2 = await NT.loadStore(multiSavePath);
  const m = nt2.mandates[0];
  check(m.preselection[0].p === star2.id && m.watchlist[0].p === twin2.id && m.nids[`${star2.id}|${star.name}`] === 1, "sélections : références et clés « id|nom » migrées");
  check(Engine.playerIdRegistrySize() >= all.length, "registre : tous les IDs inscrits");
  const reg = store.playerIdRegistryStorage(multiSavePath).file;
  check(fs.existsSync(reg), "registre enregistré");
  server.close();
  console.log("\n🏁 player_id_migration_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
