// "Les ordres sautent" (retour utilisateur 2026-09-26, capture du
// calendrier : bouton "Ordres" sur la journée qui vient, alors que les
// journées suivantes, préparées à l'avance, affichent "Modifier vos
// ordres"). Voir League.promoteImmediatePlan (engine.js) et son appel dans
// server/index.js:tick : dès qu'une journée préparée à l'avance devient le
// prochain match du club, son plan devient les ordres en direct et la
// journée est marquée validée.
const E = require("../engine.js");
const { generateStartingRoster, generateLeague } = E;
const { finalizeRound } = require("./autoSim.js");

const T0 = Date.UTC(2026, 8, 7);
const team = generateStartingRoster("Ordres Promus");
const league = generateLeague(team, 1, T0);
team.isHuman = true;
const idx = league.teams.indexOf(team);
team.defense = "Homme à homme";
team.rhythm = "Normal";

const r = league.round;
const next = league.nextUserMatch(idx);
if (!next || next.round !== r) throw new Error("❌ (setup) la journée courante devrait être le prochain match du club.");
// Journée suivante (et une plus lointaine) préparées à l'avance.
let r1 = r + 1;
while (!league.schedule[r1].some(m => m.home === idx || m.away === idx)) r1++;
team.stagePlanForRound(r1, { defense: "Zone press", rhythm: "Lent" });
team.stagePlanForRound(r1 + 2, { defense: "Zone extérieure", rhythm: "Rapide" });

// Tant que la journée r n'est pas jouée : rien à promouvoir.
if (league.promoteImmediatePlan(idx)) throw new Error("❌ Rien ne devrait être promu tant que la journée préparée n'est pas la prochaine.");
if (team.defense !== "Homme à homme") throw new Error("❌ Les ordres en direct ne devraient pas bouger avant l'heure.");

// La journée r est jouée : r1 devient la prochaine.
finalizeRound(league, r);
const promoted = league.promoteImmediatePlan(idx);
if (!promoted) throw new Error("❌ Le plan de la journée devenue immédiate aurait dû être promu.");
if (team.defense !== "Zone press" || team.rhythm !== "Lent") throw new Error(`❌ Les ordres en direct devraient être ceux préparés (Zone press / Lent), obtenu ${team.defense} / ${team.rhythm}.`);
if (team.hasPlanForRound(r1)) throw new Error("❌ Le plan promu devrait être consommé.");
if (team.ordresValidatedRound !== r1) throw new Error(`❌ La journée ${r1} devrait être marquée validée (bouton "Modifier vos ordres"), obtenu ${team.ordresValidatedRound}.`);
if (!team.hasPlanForRound(r1 + 2)) throw new Error("❌ Un plan pour une journée plus lointaine ne doit pas être touché.");
console.log("✅ Le plan de la journée devenue immédiate devient les ordres en direct, marqué validé ; les autres plans restent.");

// Retouche des ordres en direct après promotion : plus rien ne l'écrase.
team.defense = "Homme à homme";
if (league.promoteImmediatePlan(idx)) throw new Error("❌ Deuxième appel : plus rien à promouvoir (idempotent).");
finalizeRound(league, r1);
if (team.defense !== "Homme à homme") throw new Error(`❌ Une retouche faite après promotion ne doit plus être écrasée au coup d'envoi, obtenu ${team.defense}.`);
console.log("✅ Idempotent, et une retouche faite après promotion est bien celle jouée.");

// Équipe non humaine : jamais touchée.
const cpu = league.teams.find(t => !t.isHuman);
const cpuIdx = league.teams.indexOf(cpu);
if (league.promoteImmediatePlan(cpuIdx)) throw new Error("❌ Une équipe CPU ne devrait jamais être concernée.");
console.log("\n🏁 Promotion des ordres préparés : tous les tests passent.");
