// Licenciement d'un joueur (retour utilisateur 2026-10-03 : « dans la brique
// ajoute un bouton licencier le joueur [...] il faut payer 30 % d'indemnité
// sur le montant du salaire restant ») : voir League.releasePlayer,
// releaseIndemnityFor et POST /api/player/release.
const assert = require("assert");
const E = require("./engine.js");
const { startTestServer } = require("./test_helpers.js");
const ok = m => console.log("✅ " + m);

(async () => {
  // Calcul : 30 % × salaire × semaines restantes.
  const p = { salary: 1000, contractUntilSeason: 3 };
  assert.strictEqual(E.releaseIndemnityFor(p, 1, 5), Math.round(1000 * (12 - 5 + 1 + 2 * 12) * 0.3));
  assert.strictEqual(E.releaseIndemnityFor({ salary: 1000 }, 1, 5), 0);
  ok("indemnité = 30 % du salaire restant dû");

  const { server, baseUrl } = await startTestServer();
  const api = async (path, body) => {
    const res = await fetch(new URL(path, baseUrl), { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  let r = await api("/api/save");
  const lg = r.body.league;
  const myIdx = lg.teams.findIndex(t => t.isHuman);
  const me = lg.teams[myIdx];
  const victim = me.players[me.players.length - 1];
  const budgetBefore = me.budget;
  const nPlayers = me.players.length;

  r = await api("/api/player/release", { playerId: victim.id });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.fee > 0, "indemnité positive");
  const fee = r.body.fee;
  r = await api("/api/save");
  const after = r.body.league.teams[myIdx];
  assert.strictEqual(after.players.length, nPlayers - 1, "joueur retiré de l'effectif");
  assert.ok(!after.players.some(x => x.id === victim.id));
  assert.ok(Math.abs((budgetBefore - fee) - after.budget) < 1e-6 || after.budget <= budgetBefore - fee + 1, `budget débité (${budgetBefore} → ${after.budget}, indemnité ${fee})`);
  assert.ok((r.body.league.freeAgents || []).some(x => x.id === victim.id), "devient agent libre");
  ok(`licenciement : indemnité ${fee} € débitée, joueur agent libre`);

  r = await api("/api/player/release", { playerId: victim.id });
  assert.strictEqual(r.status, 400);
  ok("licencier un joueur absent : refusé");

  server.close();
  console.log("\n✅ Licenciement : OK.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
