// Classements du joueur (retour utilisateur 2026-10-03) : rangs par 40 min
// dans le championnat, la division, le pays et le monde (World.playerRankings).
const assert = require("assert");
const Engine = require("../engine.js");
const World = require("./world.js");

const T0 = Date.UTC(2026, 8, 28, 9);
const mk = (id, country, level, group) => {
  const lg = Engine.generateMultiManagerLeague(["A"], 1, T0);
  return { entry: { id, country, level, group }, lg };
};
const all = [mk("fr-1", "fr", 1, 0), mk("fr-2", "fr", 2, 0), mk("fr-3", "fr", 2, 1), mk("it-1", "it", 1, 0)];
// Journal de matchs fictif : stats croissantes selon l'ordre des joueurs.
all.forEach(({ lg }, li) => lg.teams.forEach((t, ti) => t.players.forEach((p, pi) => {
  p.matchLog = [0, 1, 2].map(r => ({ round: r, competition: "championship", min: 30, pts: pi + ti + li, reb: 5, ast: 2, stl: 1, blk: (pi % 3) }));
})));
const world = { leagues: all.map(x => x.entry) };
const leagues = new Map(all.map(x => [x.entry.id, x.lg]));
["fr", "it"].forEach(c => { world.rankDist = world.rankDist || {}; world.rankDist[c] = World.countryRankDistribution(world, c, leagues); });

const { entry, lg } = all[1];
const team = lg.teams[3];
const best = team.players.reduce((a, b) => (a.matchLog[0].pts >= b.matchLog[0].pts ? a : b));
const r = World.playerRankings(world, entry, lg, 3, best.id);
assert.ok(r && r.eligible, "joueur éligible");
assert.deepStrictEqual(r.scopes.map(s => s.key), ["league", "division", "country", "world"]);
const nLeague = lg.teams.reduce((n, t) => n + t.players.length, 0);
assert.strictEqual(r.scopes[0].ranks.pts.of, nLeague, "championnat : tous les joueurs classés");
assert.ok(r.scopes[1].ranks.pts.of === nLeague * 2 && r.scopes[2].ranks.pts.of === nLeague * 3 && r.scopes[3].ranks.pts.of === nLeague * 4, "division, pays, monde");
assert.ok(r.scopes[0].ranks.pts.rank <= r.scopes[1].ranks.pts.rank && r.scopes[2].ranks.pts.rank <= r.scopes[3].ranks.pts.rank, "rang croissant avec le périmètre");
assert.strictEqual(r.values.pts, Math.round(best.matchLog[0].pts * 40 / 30 * 10) / 10, "moyenne ramenée à 40 min");
assert.ok(/Division II\.1$/.test(r.scopes[0].label) && /Division II$/.test(r.scopes[1].label), r.scopes.map(s => s.label).join(" | "));
// Rang mondial par note GEN (meilleur poste), parmi tous les joueurs.
assert.ok(r.gen && r.gen.world.of === nLeague * 4 && r.gen.world.rank >= 1 && r.gen.position.rank <= r.gen.world.rank, JSON.stringify(r.gen));
const top = all.flatMap(x => x.lg.teams.flatMap((t, ti) => t.players.map(p => ({ x, ti, p, g: Math.round(Math.max(...Object.values(Engine.positionRatings(p)))) })))).sort((a, b) => b.g - a.g)[0];
assert.strictEqual(World.playerRankings(world, top.x.entry, top.x.lg, top.ti, top.p.id).gen.world.rank, 1, "meilleure note GEN = 1er mondial");
// Pas assez de matchs : non éligible.
best.matchLog = best.matchLog.slice(0, 2);
assert.strictEqual(World.playerRankings(world, entry, lg, 3, best.id).eligible, false);
console.log("✅ player_ranks_test.js : classements championnat / division / pays / monde par 40 min");
