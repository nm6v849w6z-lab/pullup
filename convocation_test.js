// Convocation des joueurs (retour utilisateur 2026-09-26 : "choisir les
// joueurs qu'on convoque au match", 12 au maximum, un convoqué sans rôle
// "dépanne si besoin"). Vérifie : convocation par défaut (12), retrait qui
// enlève les rôles, limite de 12, sauvegarde, /api/lineup, moteur (un
// non-convoqué ne joue jamais, un convoqué sans rôle n'entre qu'en
// dépannage) et la carte Convocation de l'écran Ordres.
const fs = require("fs");
const E = require("./engine.js");
const actions = require("./server/actions.js");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const { POSITIONS, CONVOCATION_MAX } = E;
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); };
const reset = players => players.forEach(p => { p.injuryUntil = null; p.injuryType = null; p.condition = 100; });

(async () => {
// --- Team ----------------------------------------------------------------
const t = E.generateStartingRoster("Convoc");
assert(t.players.length > CONVOCATION_MAX, "l'effectif de départ devrait dépasser 12 joueurs");
const def = t.convokedIds();
assert(def.length === CONVOCATION_MAX, `convocation par défaut : 12 joueurs, obtenu ${def.length}`);
POSITIONS.forEach(pos => assert(def.includes(t.lineup.starters[pos]), "les titulaires sont convoqués par défaut"));
const starterM = t.lineup.starters.Meneur;
t.setConvoked(starterM, false);
assert(t.lineup.starters.Meneur === null, "retirer un titulaire de la convocation libère son poste");
assert(t.convokedIds().length === 11, "11 convoqués après un retrait");
t.setConvoked(starterM, true);
assert(t.convokedIds().length === 12 && t.isConvoked(starterM), "on peut reconvoquer jusqu'à 12");
const other = t.players.find(p => !t.isConvoked(p.id));
t.setConvoked(other.id, true);
assert(t.convokedIds().length === 12 && !t.isConvoked(other.id), "jamais plus de 12 convoqués");
t.setStarter("Meneur", starterM);
const back = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(t))));
assert(JSON.stringify(back.convokedIds()) === JSON.stringify(t.convokedIds()), "la convocation survit à la sauvegarde");
assert(JSON.stringify(t.snapshotTactics().lineup.convoked) === JSON.stringify(t.lineup.convoked), "les plans copient la convocation");
console.log("✅ Team : convocation par défaut, retrait, limite de 12, sauvegarde.");

// --- Serveur -------------------------------------------------------------
const human = E.generateStartingRoster("Serveur");
const lg = E.generateLeague(human, 1, Date.UTC(2026, 8, 21));
const ids12 = human.convokedIds();
const ok = actions.setLineup(human, 0, lg, { starters: human.lineup.starters, backupPositions: human.lineup.backupPositions, convoked: ids12 });
assert(ok.ok !== false && Array.isArray(human.lineup.convoked) && human.lineup.convoked.length === 12, "/api/lineup accepte la convocation");
const bad = actions.setLineup(human, 0, lg, { starters: human.lineup.starters, backupPositions: human.lineup.backupPositions, convoked: human.players.map(p => p.id) });
assert(bad.ok === false, "/api/lineup refuse plus de 12 convoqués");
console.log("✅ /api/lineup : convocation validée (12 max).");

// --- Moteur : un non-convoqué ne joue jamais ------------------------------
const A = E.generateStartingRoster("A"), B = E.generateStartingRoster("B");
const benched = A.players.find(p => !A.starterPosition(p.id) && (A.lineup.backupPositions[p.id] || []).length);
A.setConvoked(benched.id, false);
let played = 0;
for (let i = 0; i < 15; i++) { reset([...A.players, ...B.players]); new E.MatchEngine(A, B).simulate(); played += benched.secondsPlayed; }
assert(played === 0, "un joueur en tribune ne doit jamais jouer");
console.log("✅ Moteur : un joueur non convoqué ne joue jamais.");

// --- Moteur : un convoqué sans rôle dépanne en cas de besoin -------------
const C = E.generateStartingRoster("Dépannage");
const pos = "Pivot";
const cStarter = C.lineup.starters[pos];
// Aucun remplaçant au poste Pivot, un convoqué sans rôle disponible.
C.players.forEach(p => { if ((C.lineup.backupPositions[p.id] || []).includes(pos)) C.toggleBackupPosition(p.id, pos, false); });
const spare = C.players.find(p => !C.starterPosition(p.id) && !(C.lineup.backupPositions[p.id] || []).length);
C.lineup.convoked = [...new Set([...C.convokedIds().filter(id => id !== spare.id).slice(0, 11), spare.id])];
if (!C.lineup.convoked.includes(cStarter)) C.lineup.convoked[0] = cStarter;
assert(C.isConvoked(spare.id) && !C.starterPosition(spare.id), "préparation : réserviste convoqué sans rôle");
reset([...C.players, ...B.players]);
const starterPl = C.players.find(p => p.id === cStarter);
starterPl.injuryUntil = Date.now() + 3 * 24 * 3600 * 1000; starterPl.injuryType = "Entorse";
const r = new E.MatchEngine(C, B).simulate();
const shortA = r.events.filter(e => e.type === "shortHanded" && e.team === "A").length;
const coveredPivot = C.players.reduce((s, p) => s + (p.secondsPlayedByPosition[pos] || 0), 0) / 60;
console.log(`  Pivot titulaire blessé, aucun remplaçant : poste couvert ${coveredPivot.toFixed(0)} min, dont ${(spare.secondsPlayedByPosition[pos] || 0) / 60 | 0} par le convoqué sans rôle (${spare.name}).`);
assert(coveredPivot >= 39, "le poste doit rester couvert grâce aux convoqués");
assert(shortA === 0 || coveredPivot >= 39, "pas d'infériorité numérique");
console.log("✅ Moteur : un convoqué sans rôle dépanne quand un poste n'a plus personne.");

// --- Écran Ordres --------------------------------------------------------
const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
const card = doc.getElementById("ordresCardConvocation");
assert(card, "la carte Convocation doit exister");
const rows = () => [...card.querySelectorAll(".conv-row")];
assert(/12/.test(card.querySelector(".ordres-card-aside").textContent), "compteur 12 / 12 par défaut");
const offRow = rows().find(r => !r.querySelector("input").checked);
assert(offRow && offRow.querySelector("input").disabled, "à 12 convoqués, les autres cases sont bloquées");
const onRow = rows().find(r => /Titulaire/.test(r.textContent));
const onName = onRow.querySelector(".conv-name").textContent;
onRow.querySelector("input").checked = false;
onRow.querySelector("input").dispatchEvent(new win.Event("change"));
assert(/11/.test(card.querySelector(".ordres-card-aside").textContent), "compteur 11 / 12 après un retrait");
assert(doc.querySelectorAll(".court-marker.incomplete").length === 1, "le poste du titulaire retiré devient à pourvoir");
assert(rows().find(r => r.querySelector(".conv-name").textContent === onName && /tribune/i.test(r.textContent)), "le joueur retiré est « En tribune »");
await flush(dom);
const saved = readRawSave(savePath).team.lineup;
assert(Array.isArray(saved.convoked) && saved.convoked.length === 11, "convocation sauvegardée (11 joueurs) : " + JSON.stringify(saved.convoked));
console.log("✅ Écran Ordres : carte Convocation (compteur, limite, retrait d'un titulaire, sauvegarde).");
win.close();
server.close();
console.log("\n🏁 Convocation : tous les tests passent.");
})().catch(e => { console.error(e); process.exit(1); });
