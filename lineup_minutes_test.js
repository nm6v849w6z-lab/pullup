// Temps de jeu cible par poste dans les Ordres (retour utilisateur
// 2026-09-26 : "choisir les temps de jeu des joueurs [...] meneur c'est 30
// min, remplaçant 10 [...] un temps idéal à atteindre, qui en cas de
// blessure ou fautes, devra être modifié automatiquement par le moteur",
// "il faut aussi pouvoir donner des minutes au réserviste", "on mettra les
// minutes par poste"). Vérifie :
//  1. Team : répartition proposée 28/12, minutes qui suivent un changement
//     de titulaire, réserviste ajouté au poste avec des minutes.
//  2. Sauvegarde/rechargement et validation serveur (/api/lineup).
//  3. Moteur : minutes jouées proches des cibles sur de nombreux matchs.
//  4. Moteur : titulaire blessé d'entrée -> les autres joueurs du poste se
//     partagent ses minutes (jamais d'infériorité numérique).
//  5. Écran Ordres : "Régler", saisie des minutes, "Auto", sauvegarde.
const fs = require("fs");
const E = require("./engine.js");
const actions = require("./server/actions.js");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const { POSITIONS } = E;
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); };

(async () => {
// --- 1. Team -----------------------------------------------------------
const team = E.generateStartingRoster("Minutes");
const pos = "Meneur";
const starter = team.lineup.starters[pos];
assert(!team.slotMinuteShares(pos), "sans réglage, le poste doit rester en rotation automatique");
team.enableSlotMinutes(pos);
const ids = team.slotPlayerIds(pos);
assert(team.lineup.minutes[pos][starter] === (ids.length > 1 ? 28 : 40), "répartition proposée : 28 min au titulaire");
if (ids.length >= 3) {
  assert(team.lineup.minutes[pos][ids[1]] === 8, "répartition proposée : 8 min au remplaçant (le mieux noté)");
  assert(ids.slice(2).every(id => team.lineup.minutes[pos][id] <= 4), "répartition proposée : peu de minutes pour les réservistes");
}
const total = ids.reduce((s, id) => s + team.lineup.minutes[pos][id], 0);
assert(total === 40, `répartition proposée totale 40, obtenu ${total}`);
// Un réserviste (ni titulaire ni remplaçant) : on en fabrique un à partir
// d'un remplaçant d'un autre poste.
const reservist = team.players.find(p => !team.starterPosition(p.id) && !(team.lineup.backupPositions[p.id] || []).includes(pos));
assert(reservist, "l'effectif de départ devrait avoir un joueur hors du poste Meneur");
(team.lineup.backupPositions[reservist.id] || []).slice().forEach(x => team.toggleBackupPosition(reservist.id, x, false));
team.toggleBackupPosition(reservist.id, pos, true);
assert(team.lineup.minutes[pos][reservist.id] === 0, "réserviste ajouté au poste : 0 min par défaut");
team.setSlotMinutes(pos, starter, 30);
team.setSlotMinutes(pos, reservist.id, 4);
team.slotPlayerIds(pos).filter(id => id !== starter && id !== reservist.id).forEach((id, i) => team.setSlotMinutes(pos, id, i === 0 ? 6 : 0));
const shares = team.slotMinuteShares(pos);
assert(Math.abs(shares[starter] - 0.75) < 1e-9, "part du titulaire = 30/40");
assert(Math.abs(shares[reservist.id] - 0.1) < 1e-9, "part du réserviste = 4/40");
// Changement de titulaire : le nouveau reprend les minutes de l'ancien.
const newStarter = team.slotPlayerIds(pos).find(id => id !== starter && id !== reservist.id);
team.setStarter(pos, newStarter);
assert(team.lineup.minutes[pos][newStarter] === 6 || team.lineup.minutes[pos][newStarter] === 30, "le nouveau titulaire garde des minutes");
assert(team.lineup.minutes[pos][starter] == null, "l'ancien titulaire (devenu réserviste) n'a plus de minutes au poste");
team.setStarter(pos, starter);
team.setSlotMinutes(pos, starter, 30);
team.toggleBackupPosition(reservist.id, pos, false);
assert(team.lineup.minutes[pos][reservist.id] == null, "retiré du poste : ses minutes disparaissent");
team.clearSlotMinutes(pos);
assert(!team.lineup.minutes, "« Auto » sur le seul poste réglé : plus aucun réglage");
console.log("✅ Team : répartition 28/12, réserviste, changement de titulaire, retour en auto.");

// --- 2. Sauvegarde + validation serveur --------------------------------
team.enableSlotMinutes("Pivot");
const reloaded = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(team))));
assert(JSON.stringify(reloaded.lineup.minutes) === JSON.stringify(team.lineup.minutes), "les minutes doivent survivre à la sauvegarde");
const plan = team.snapshotTactics();
team.lineup.minutes.Pivot[team.lineup.starters.Pivot] = 1;
assert(plan.lineup.minutes.Pivot[team.lineup.starters.Pivot] !== 1, "un plan préparé ne partage pas l'objet minutes des ordres en direct");
const human = E.generateStartingRoster("Serveur");
const lg = E.generateLeague(human, 1, Date.UTC(2026, 8, 21));
const body = { starters: human.lineup.starters, backupPositions: human.lineup.backupPositions, minutes: { Pivot: { [human.lineup.starters.Pivot]: 32 } } };
const ok = actions.setLineup(human, 0, lg, body);
assert(ok.ok !== false && human.lineup.minutes && human.lineup.minutes.Pivot[human.lineup.starters.Pivot] === 32, "/api/lineup doit accepter et stocker les minutes : " + JSON.stringify(ok));
const bad = actions.setLineup(human, 0, lg, { ...body, minutes: { Pivot: { [human.lineup.starters.Pivot]: 55 } } });
assert(bad.ok === false || bad.error, "/api/lineup doit refuser plus de 40 min");
console.log("✅ Sauvegarde, plans et /api/lineup gèrent les minutes.");

// --- 3. Moteur : cibles tenues ----------------------------------------
const A = E.generateStartingRoster("Cibles");
const B = E.generateStartingRoster("Adversaire");
const plan3 = { "Meneur": [30, 10], "Arrière": [34, 6], "Ailier shooteur": [26, 14], "Ailier fort": [24, 16], "Pivot": [32, 8] };
POSITIONS.forEach(p => {
  A.enableSlotMinutes(p);
  const [s, b] = plan3[p];
  const slot = A.slotPlayerIds(p);
  A.setSlotMinutes(p, slot[0], s);
  slot.slice(1).forEach((id, i) => A.setSlotMinutes(p, id, i === 0 ? b : 0));
});
const N = 60;
const sums = {};
for (let i = 0; i < N; i++) {
  [...A.players, ...B.players].forEach(p => { p.injuryUntil = null; p.injuryType = null; p.condition = 100; });
  new E.MatchEngine(A, B).simulate();
  POSITIONS.forEach(p => A.slotPlayerIds(p).forEach(id => {
    const pl = A.players.find(x => x.id === id);
    const k = p + "|" + id;
    sums[k] = (sums[k] || 0) + (pl.secondsPlayedByPosition[p] || 0) / 60;
  }));
}
POSITIONS.forEach(p => {
  const slot = A.slotPlayerIds(p);
  const s = sums[p + "|" + slot[0]] / N, b = sums[p + "|" + slot[1]] / N;
  console.log(`  ${p.padEnd(16)} titulaire cible ${plan3[p][0]} -> ${s.toFixed(1)} | remplaçant cible ${plan3[p][1]} -> ${b.toFixed(1)}`);
  assert(Math.abs(s - plan3[p][0]) <= 6, `${p} : titulaire trop loin de sa cible (${s.toFixed(1)} pour ${plan3[p][0]})`);
  assert(Math.abs(b - plan3[p][1]) <= 6, `${p} : remplaçant trop loin de sa cible (${b.toFixed(1)} pour ${plan3[p][1]})`);
});
console.log("✅ Moteur : minutes moyennes proches des cibles réglées.");

// --- 4. Moteur : titulaire indisponible, minutes redistribuées ----------
const C = E.generateStartingRoster("Blessé");
C.enableSlotMinutes("Meneur");
const cStarter = C.players.find(p => p.id === C.lineup.starters.Meneur);
const cBackups = C.slotPlayerIds("Meneur").filter(id => id !== cStarter.id);
C.setSlotMinutes("Meneur", cStarter.id, 34);
cBackups.forEach((id, i) => C.setSlotMinutes("Meneur", id, i === 0 ? 6 : 0));
[...C.players, ...B.players].forEach(p => { p.injuryUntil = null; p.condition = 100; });
cStarter.injuryUntil = Date.now() + 5 * 24 * 3600 * 1000;
cStarter.injuryType = "Entorse";
const r4 = new E.MatchEngine(C, B).simulate();
assert(cStarter.secondsPlayed === 0, "le titulaire blessé ne doit pas jouer");
assert(!r4.events.some(e => e.type === "shortHanded" && e.team === "A" && e.player === cStarter.name), "pas d'infériorité numérique");
const b0 = C.players.find(p => p.id === cBackups[0]);
const meneurMinutes = C.players.reduce((s, p) => s + (p.secondsPlayedByPosition.Meneur || 0), 0) / 60;
console.log(`  Titulaire blessé : remplaçant ${(b0.secondsPlayedByPosition.Meneur || 0) / 60 | 0} min au poste (cible 6), poste couvert ${meneurMinutes.toFixed(0)} min`);
assert((b0.secondsPlayedByPosition.Meneur || 0) / 60 > 15, "le remplaçant doit récupérer le temps de jeu du titulaire blessé");
console.log("✅ Moteur : minutes d'un titulaire blessé redistribuées automatiquement.");

// --- 5. Écran Ordres : carte « Temps de jeu » (à part de la Rotation) ---
const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
const ptRow = p => doc.querySelector(`#ordresCardMinutes .pt-block[data-pos="${p}"]`);
assert(doc.getElementById("ordresCardMinutes"), "la carte « Temps de jeu » doit exister");
assert(!doc.querySelector("#ordresCardRotation input[type=number]"), "la carte Rotation ne doit pas contenir de minutes");
assert(/Automatique/.test(ptRow("Meneur").textContent), "le poste Meneur doit être en automatique au départ");
ptRow("Meneur").querySelector(".pt-btn").click();
const inputs = [...ptRow("Meneur").querySelectorAll("input.pt-input")];
assert(inputs.length >= 1, "« Régler » doit afficher une case de minutes par joueur du poste");
assert(ptRow("Meneur").querySelector(".pt-total").textContent.trim() === "40 / 40 min", "total affiché 40 / 40 min après « Régler »");
inputs[0].value = "30";
inputs[0].dispatchEvent(new win.Event("change"));
const totalTxt = ptRow("Meneur").querySelector(".pt-total").textContent.trim();
assert(inputs.length === 1 || totalTxt === "42 / 40 min", `total mis à jour attendu 42 / 40 min, obtenu ${totalTxt}`);
// Ajout d'un joueur hors du poste (réserviste ou remplaçant d'un autre poste).
const add = ptRow("Meneur").querySelector("select.pt-add");
assert(add && add.options.length > 1, "« + Ajouter un joueur » doit proposer des joueurs");
const before = ptRow("Meneur").querySelectorAll("input.pt-input").length;
add.value = add.options[1].value;
add.dispatchEvent(new win.Event("change"));
assert(ptRow("Meneur").querySelectorAll("input.pt-input").length === before + 1, "le joueur ajouté doit avoir sa case de minutes");
await flush(dom);
const saved = readRawSave(savePath).team.lineup;
assert(saved.minutes && Object.values(saved.minutes.Meneur).includes(30), "les minutes saisies doivent être sauvegardées : " + JSON.stringify(saved.minutes));
ptRow("Meneur").querySelector(".pt-head .pt-btn").click();
await flush(dom);
assert(ptRow("Meneur").querySelector(".pt-auto"), "« Automatique » doit rendre le poste à la rotation automatique");
assert(!readRawSave(savePath).team.lineup.minutes, "« Automatique » doit effacer le réglage sauvegardé");
console.log("✅ Carte « Temps de jeu » : Régler / saisie / ajout d'un joueur / Automatique, sauvegardés.");

win.close();
server.close();
console.log("\n🏁 Temps de jeu cible par poste : tous les tests passent.");
})().catch(e => { console.error(e); process.exit(1); });
