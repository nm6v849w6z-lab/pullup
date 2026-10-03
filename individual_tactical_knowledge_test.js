// Connaissance tactique INDIVIDUELLE des clubs humains (retour utilisateur
// 2026-10-03 : "J'ai changé 80% de l'équipe et ça n'a pas bougé", "il
// faudrait que la connaissance tactique soit au niveau individuel",
// solution B retenue) : voir engine.js, PLAYER_TACTICAL_KNOWLEDGE_GAIN_BASE,
// Team.ensurePlayerTacticalKnowledge/recomputeTacticalKnowledge/
// playerTacticalKnowledgeFactor, resetPlayerTacticalKnowledge.
const E = require("./engine.js");
const {
  generateStartingRoster, generateLeague, serializeTeam, teamFromSave, recordMatchStatsForTeam,
  transferPlayerBetweenTeams, PLAYER_TACTICAL_KNOWLEDGE_RECRUIT, playerTacticalKnowledgeGainForStreak,
  TACTICAL_FULL_GAIN_SECONDS, defaultTacticalKnowledgeShape,
} = E;

const T0 = Date.UTC(2026, 8, 21);
const ONE_DAY = 24 * 3600 * 1000;
const assert = (cond, msg) => { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); };

function humanTeam(name) {
  const t = generateStartingRoster(name);
  generateLeague(t, 1, T0);
  t.isHuman = true;
  return t;
}

// 1) Migration : un joueur sans maîtrise reprend la jauge d'équipe, rien ne
//    bouge au déploiement.
(function testMigration() {
  const t = humanTeam("Migration");
  t.tacticalKnowledge.defense["Homme à homme"] = 77;
  t.players.forEach(p => { delete p.tacticalKnowledge; });
  t.recomputeTacticalKnowledge();
  assert(t.players.every(p => p.tacticalKnowledge.defense["Homme à homme"] === 77), "Migration : chaque joueur reprend la maîtrise d'équipe (77)");
  assert(t.tacticalKnowledge.defense["Homme à homme"] === 77, "Migration : la jauge d'équipe ne bouge pas");
})();

// 2) Courbe : +3, +4, +5, +6 puis plafond.
(function testCurve() {
  const seq = [1, 2, 3, 4, 7].map(playerTacticalKnowledgeGainForStreak);
  assert(JSON.stringify(seq) === "[3,4,5,6,6]", `Gain par match : ${seq.join(", ")}`);
})();

// 3) Match officiel : gain au prorata des minutes, rien pour qui n'a pas joué.
(function testMatchProrata() {
  const t = humanTeam("Prorata");
  t.defense = "Homme à homme";
  t.players.forEach(p => { p.tacticalKnowledge = defaultTacticalKnowledgeShape(50); });
  const [a, b, c] = t.players;
  t.players.forEach(p => { p.secondsPlayed = 0; });
  a.secondsPlayed = TACTICAL_FULL_GAIN_SECONDS + 300;
  b.secondsPlayed = TACTICAL_FULL_GAIN_SECONDS / 2;
  recordMatchStatsForTeam(t, 0, "championship", T0);
  const v = p => p.tacticalKnowledge.defense["Homme à homme"];
  assert(v(a) === 53 && v(b) === 51.5 && v(c) === 50, `Gain au prorata des minutes : ${v(a)} / ${v(b)} / ${v(c)}`);
})();

// 4) Recrue : arrive à 40 partout, la jauge d'équipe baisse si elle joue.
(function testRecruit() {
  const buyer = humanTeam("Buyer");
  const seller = humanTeam("Seller");
  buyer.budget = 1e9;
  buyer.players.forEach(p => { p.tacticalKnowledge = defaultTacticalKnowledgeShape(80); });
  buyer.recomputeTacticalKnowledge();
  const before = buyer.tacticalKnowledge.defense[buyer.defense];
  const pid = seller.players[0].id;
  seller.players[0].tacticalKnowledge = defaultTacticalKnowledgeShape(90);
  const res = transferPlayerBetweenTeams(seller, buyer, pid, 1000, T0);
  assert(res.result === "sold", "Transfert effectué");
  const recruit = buyer.players.find(p => p.id === pid);
  assert(Object.values(recruit.tacticalKnowledge.offense).every(x => x === PLAYER_TACTICAL_KNOWLEDGE_RECRUIT), "La recrue arrive à 40 sur toutes les options");
  const starterPos = Object.keys(buyer.lineup.starters)[0];
  buyer.lineup.starters[starterPos] = pid;
  buyer.recomputeTacticalKnowledge();
  assert(buyer.tacticalKnowledge.defense[buyer.defense] < before, `Recrue titulaire : la jauge d'équipe baisse (${before} → ${buyer.tacticalKnowledge.defense[buyer.defense]})`);
})();

// 5) En match, chaque joueur joue avec SA maîtrise.
(function testMatchFactor() {
  const t = humanTeam("Factor");
  t.players.forEach(p => { p.tacticalKnowledge = defaultTacticalKnowledgeShape(100); });
  t.players[0].tacticalKnowledge = defaultTacticalKnowledgeShape(40);
  t.resetForMatch(T0);
  const f0 = t.players[0].matchTacticalKnowledgeFactor, f1 = t.players[1].matchTacticalKnowledgeFactor;
  assert(Math.abs(f1 - 1.08) < 1e-9 && Math.abs(f0 - (0.92 + 0.4 * 0.16)) < 1e-9, `Facteur individuel en match : ${f0.toFixed(3)} (recrue) / ${f1.toFixed(3)} (cadre)`);
})();

// 6) Jour « Tactique » : tout l'effectif progresse, chacun selon son niveau.
(function testTacticDay() {
  const t = humanTeam("Tactic Day");
  t.players.forEach(p => { p.tacticalKnowledge = defaultTacticalKnowledgeShape(60); });
  t.players[0].tacticalKnowledge = defaultTacticalKnowledgeShape(40);
  t.applyTacticDay({ category: "defense", value: "Zone extérieure" });
  assert(t.players[0].tacticalKnowledge.defense["Zone extérieure"] === 52 && t.players[1].tacticalKnowledge.defense["Zone extérieure"] === 69, "Jour Tactique : 40 → 52 et 60 → 69 pour tous les joueurs");
})();

// 7) Sauvegarde : la maîtrise individuelle survit au rechargement.
(function testRoundtrip() {
  const t = humanTeam("Roundtrip");
  t.players[2].tacticalKnowledge = defaultTacticalKnowledgeShape(40);
  t.players[2].tacticalKnowledge.rhythm.Rapide = 66.5;
  const t2 = teamFromSave(JSON.parse(JSON.stringify(serializeTeam(t))));
  assert(t2.players[2].tacticalKnowledge.rhythm.Rapide === 66.5, "Maîtrise individuelle conservée au rechargement");
})();

// 8) Amical : pas de gain « officiel » sur la coquille, gain par minutes via
//    gainTacticalKnowledgeFromFriendly (jeunes compris).
(function testFriendly() {
  const t = humanTeam("Friendly");
  t.defense = "Homme à homme";
  t.players.forEach(p => { p.tacticalKnowledge = defaultTacticalKnowledgeShape(50); p.secondsPlayed = 1800; });
  recordMatchStatsForTeam(t, -1, "friendly", T0);
  assert(t.players[0].tacticalKnowledge.defense["Homme à homme"] === 50, "Un amical ne déclenche pas la progression de match officiel");
  t.gainTacticalKnowledgeFromFriendly({ [t.players[0].id]: 900 });
  assert(t.players[0].tacticalKnowledge.defense["Homme à homme"] === 51.5 && t.players[1].tacticalKnowledge.defense["Homme à homme"] === 50, "Amical : gain individuel au prorata des minutes");
})();

console.log("\n✅ Connaissance tactique individuelle : tous les tests sont passés.");
