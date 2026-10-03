// Ligue privée : compo lue à T − 5 min, comme un match officiel (retour
// utilisateur 2026-10-03). Un club SANS ordres de ligue privée qui change sa
// compo après T − 5 min joue quand même avec la compo photographiée.
const assert = require("assert");
const Engine = require("../engine.js");
const PL = require("./privateLeague.js");
const T = Date.UTC(2026, 9, 9, 18);
const lg = Engine.generateMultiManagerLeague(["A", "B"], 1, T - 864e5);
const [ia, ib] = lg.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
const A = lg.teams[ia];
const store = { version: 1, list: [{
  id: "lpx", name: "Test", status: "running", venue: "home", code: "ABC123",
  members: [PL.refFor("fr-1", lg, ia), PL.refFor("fr-1", lg, ib)],
  rounds: [{ index: 0, dueAt: T, matches: [{ home: 0, away: 1, played: false }] }],
}] };
const leagues = new Map([["fr-1", lg]]);
const best = A.players.slice().sort((a, b) => b.overall() - a.overall())[0];
const starterPos = Object.keys(A.lineup.starters).find(p => A.lineup.starters[p] === best.id);
assert.ok(starterPos, "(setup) le meilleur joueur de A est titulaire");
// T − 4 min : photo.
PL.catchUp(Engine, store, leagues, T - 4 * 60 * 1000, {});
const m = store.list[0].rounds[0].matches[0];
assert.ok(m.frozen && m.frozen[0] && !m.played, "compo photographiée à T − 4 min, match pas joué");
// Après la photo, A retire son meilleur joueur de la feuille de match.
A.lineup.starters[starterPos] = A.players.find(p => p.id !== best.id && !Object.values(A.lineup.starters).includes(p.id)).id;
delete A.lineup.backupPositions[best.id];
if (Array.isArray(A.lineup.convoked)) A.lineup.convoked = A.lineup.convoked.filter(id => id !== best.id);
A.lineup.convoked = A.players.filter(p => p.id !== best.id).slice(0, 12).map(p => p.id);
// Coup d'envoi : la compo photographiée est jouée.
PL.catchUp(Engine, store, leagues, T + 60 * 1000, {});
assert.ok(m.played && !m.frozen, "match joué, photo effacée");
const row = (m.boxScoreHome || []).find(r => String(r.id) === String(best.id));
assert.ok(row && row.min > 0, "le meilleur joueur (titulaire à T − 5 min) a joué malgré le changement de dernière minute");
console.log("✅ lp_frozen_orders_test.js : compo de ligue privée lue à T − 5 min");
