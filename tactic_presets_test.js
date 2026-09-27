// Onglet Tactiques (demande du 2026-09-27) : "pouvoir programmer 3
// tactiques max, qu'on pourra retrouver très facilement dans ordres et
// mettre en place en 1 seconde", "voir les tactiques maîtrisées", "tout,
// joueurs compris", "pouvoir donner un nom à la tactique".
// Voir engine.js (Team.tacticPresets, TACTIC_PRESETS_MAX), server/actions.js
// (setTacticPresets, /api/tactic-presets), moteurbasket3.html
// (renderTactiquesSection, renderOrdresPresetsBar).
const fs = require("fs");
const E = require("./engine.js");
const A = require("./server/actions.js");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

// 1) Moteur + serveur.
(function engineAndServer() {
  const user = E.generateTeam("User", 1.0);
  const lg = E.generateLeague(user, 1);
  const t = lg.teams[0];
  const snap = t.snapshotTactics();
  snap.watchAssignments = [{ position: "Meneur", playerId: 999 }];
  t.saveTacticPreset(0, "  Presse tout terrain  ", snap);
  assert(t.tacticPresets[0].name === "Presse tout terrain", "nom enregistré (espaces retirés)");
  assert(t.tacticPresets[0].orders.watchAssignments === undefined, "les postes à surveiller ne sont pas enregistrés");
  assert(t.tacticPresets[0].orders.lineup && t.tacticPresets[0].orders.defense === t.defense, "ordres complets, joueurs compris");
  t.saveTacticPreset(1, "", snap); t.saveTacticPreset(2, "C", snap);
  assert(t.tacticPresets[1].name === "Tactique 2", "nom par défaut");
  assert(t.saveTacticPreset(3, "D", snap) === null && t.tacticPresets.length === 3, "3 tactiques au maximum (club gratuit)");
  // Premium (retour utilisateur, 2026-09-27) : 6 tactiques.
  t.setPaying(true);
  assert(t.tacticPresetsMax() === 6 && t.saveTacticPreset(3, "D", snap) && t.saveTacticPreset(4, "E", snap) && t.saveTacticPreset(5, "F", snap) && t.saveTacticPreset(6, "G", snap) === null && t.tacticPresets.length === 6, "Premium : 6 tactiques au maximum");
  t.setPaying(false);
  assert(t.tacticPresets.length === 6 && t.saveTacticPreset(5, "F2", snap) && t.tacticPresetsMax() === 3, "fin du Premium : les tactiques enregistrées restent");
  t.tacticPresets = t.tacticPresets.slice(0, 3);
  assert(t.saveTacticPreset(0, "x".repeat(50), snap).name.length === E.TACTIC_PRESET_NAME_MAX, "nom limité à 30 caractères");
  // Joueur parti : retiré à l'application.
  const gone = t.tacticPresets[0].orders.lineup.starters["Meneur"];
  t.players = t.players.filter(p => p.id !== gone);
  const patch = t.tacticPresetPatch(0);
  assert(patch.lineup.starters["Meneur"] === null, "un joueur parti est retiré de la tactique appliquée");
  assert(typeof t.tacticPresetKnowledge(0) === "number", "maîtrise moyenne d'une tactique");
  const back = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(t))));
  assert(back.tacticPresets.length === 3 && back.tacticPresets[2].name === "C", "tactiques persistées");
  // Ordres complets des derniers matchs (onglet Tactiques : « partir d'un match précédent »).
  const [h1, h2] = lg.teams.slice(2, 4);
  h1.isHuman = true;
  for (let i = 0; i < 12; i++) {
    const r = E.simulateOrForfeit(h1, h2, Date.now() + i);
    E.recordMatchStatsAndAwardMvp(h1, h2, i, "championship", Date.now() + i, r.quarterScores, r.tacticsUsed);
  }
  assert(h1.ordersHistory.length === E.ORDERS_HISTORY_MAX && h1.ordersHistory[0].round === 11, "ordres des 10 derniers matchs gardés, le plus récent en tête");
  assert(h1.ordersHistory[0].opponentName === h2.name && h1.ordersHistory[0].orders.lineup && h1.ordersHistory[0].isHome === true, "match précédent : adversaire, lieu, ordres complets");
  assert(!h2.ordersHistory.length, "pas d'historique pour un club CPU");
  assert(E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(h1)))).ordersHistory.length === 10, "historique des ordres persisté");
  // Serveur.
  const t2 = lg.teams[1];
  const s2 = t2.snapshotTactics();
  let r = A.setTacticPresets(t2, 1, lg, { op: "save", slot: 0, name: "Zone", orders: s2 }, Date.now());
  assert(r.ok && t2.tacticPresets[0].name === "Zone", "serveur : enregistrement");
  r = A.setTacticPresets(t2, 1, lg, { op: "save", slot: 2, name: "Trou", orders: s2 });
  assert(!r.ok, "serveur : pas d'emplacement sauté");
  r = A.setTacticPresets(t2, 1, lg, { op: "save", slot: 1, name: "X", orders: { ...s2, defense: "Inconnue" } });
  assert(!r.ok, "serveur : ordres validés");
  r = A.setTacticPresets(t2, 1, lg, { op: "save", slot: 1, name: "X", orders: { ...s2, lineup: { starters: { Meneur: 123456 } } } });
  assert(!r.ok, "serveur : joueurs validés");
  r = A.setTacticPresets(t2, 1, lg, { op: "rename", slot: 0, name: "Zone 2-3" });
  assert(r.ok && t2.tacticPresets[0].name === "Zone 2-3", "serveur : renommage");
  r = A.setTacticPresets(t2, 1, lg, { op: "delete", slot: 0 });
  assert(r.ok && t2.tacticPresets.length === 0, "serveur : suppression");
})();

// 2) Navigateur.
(async () => {
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const win = dom.window, doc = win.document;
  const tab = key => [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key);
  assert(tab("tactiques") && tab("tactiques").textContent.trim() === "Tactiques", "onglet Tactiques dans la barre latérale");
  tab("tactiques").click();
  assert(!doc.getElementById("tactiquesSection").classList.contains("hidden"), "la page Tactiques s'affiche");
  const content = doc.getElementById("tactiquesContent");
  assert(content.querySelectorAll(".tq-card").length === 6 && content.querySelectorAll(".tq-card.is-premium").length === 3, "6 emplacements, dont 3 Premium (club gratuit)");

  // Maîtrise : 10 attaques, 5 défenses, 3 rythmes.
  const counts = [...content.querySelectorAll(".tq-mastery-table")].map(t => t.querySelectorAll("tr[data-tq-option]").length);
  assert(counts.join() === "10,5,3", "tactiques maîtrisées : une jauge par option (10/5/3)");
  const team = win.eval("teamA");
  const onDef = content.querySelector(`[data-tq-group="Défense"] tr[data-tq-option="${team.defense}"]`);
  assert(onDef && onDef.textContent.includes("En place"), "l'option des ordres actuels est marquée « En place »");

  // Créer une tactique : la page Ordres en mode édition.
  const firstDefense = team.defense;
  content.querySelector('[data-tq-create="0"]').click();
  const prep = doc.getElementById("prepSection");
  assert(!prep.classList.contains("hidden") && prep.classList.contains("tq-editing"), "« Créer une tactique » ouvre les Ordres en mode édition");
  assert(doc.querySelector("#ordresActionBar .oab-title").textContent === "Créer une tactique", "titre du mode édition");
  assert(doc.querySelector("#prepGrid .ordres-panel"), "mêmes cartes que les Ordres");
  // Changer la défense dans le brouillon ne touche pas les ordres du match.
  const draft = win.eval("tqEdit.proxy");
  const zone = Object.keys(win.eval("DEFENSES")).find(d => d !== firstDefense);
  draft.defense = zone;
  doc.getElementById("tqEditorName").value = "Défense de fer";
  doc.getElementById("tqEditorName").dispatchEvent(new win.Event("input", { bubbles: true }));
  doc.getElementById("tqEditorSave").click();
  await flush(dom);
  assert(team.tacticPresets.length === 1 && team.tacticPresets[0].name === "Défense de fer", "tactique enregistrée avec son nom");
  assert(team.tacticPresets[0].orders.defense === zone && team.defense === firstDefense, "le brouillon est enregistré, les ordres du match ne bougent pas");
  assert(!doc.getElementById("tactiquesSection").classList.contains("hidden") && !prep.classList.contains("tq-editing"), "retour à l'onglet Tactiques");
  assert(readRawSave(savePath).team.tacticPresets[0].name === "Défense de fer", "tactique sauvegardée côté serveur");
  assert(content.querySelector(".tq-name").textContent === "Défense de fer", "la carte affiche le nom");

  // Partir d'un match précédent (Team.ordersHistory).
  team.ordersHistory = [{ round: 3, competition: "championship", at: Date.now() - 86400000, opponentName: "Gotham", isHome: false, scoreFor: 70, scoreAgainst: 65,
    orders: { ...team.snapshotTactics(), rhythm: "Rapide" } }];
  content.querySelector('[data-tq-create="1"]').click();
  const sel = doc.getElementById("tqEditorSource");
  const opt = [...sel.options].find(o => o.value === "hist:0");
  assert(opt && opt.textContent.includes("J4 @ Gotham · V 70-65"), "les matchs précédents sont proposés comme point de départ");
  sel.value = "hist:0";
  sel.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(win.eval("tqEdit.proxy.rhythm") === "Rapide", "le brouillon reprend les ordres de ce match");
  doc.getElementById("tqEditorCancel").click();
  assert(team.tacticPresets.length === 1, "Annuler n'enregistre rien");
  team.defense = firstDefense;

  // Renommer.
  content.querySelector('[data-tq-rename="0"]').click();
  content.querySelector('[data-tq-rename-input="0"]').value = "Mur";
  content.querySelector('[data-tq-rename-ok="0"]').click();
  await flush(dom);
  assert(team.tacticPresets[0].name === "Mur", "renommage");

  // Dans les Ordres : 1 clic met la tactique en place.
  const other = zone;
  tab("ordres").click();
  const bar = doc.getElementById("ordresPresetsBar");
  const chip = bar.querySelector('[data-ordres-preset="0"]');
  assert(chip && chip.textContent === "Mur", "la tactique apparaît dans les Ordres");
  chip.click();
  await flush(dom);
  assert(team.defense === zone, "un clic met la tactique en place");
  assert(readRawSave(savePath).team.defense === zone, "ordres appliqués sauvegardés");
  assert(bar.textContent.includes("« Mur » mise en place."), "message de confirmation");

  // Enregistrer depuis les Ordres.
  bar.querySelector("[data-ordres-preset-open]").click();
  doc.getElementById("ordresPresetName").value = "Attaque rapide";
  bar.querySelector("[data-ordres-preset-save]").click();
  await flush(dom);
  assert(team.tacticPresets.length === 2 && team.tacticPresets[1].name === "Attaque rapide", "enregistrement depuis les Ordres");

  // Supprimer (en 2 clics).
  tab("tactiques").click();
  content.querySelector('[data-tq-delete="1"]').click();
  assert(team.tacticPresets.length === 2, "la suppression demande confirmation");
  content.querySelector('[data-tq-delete-ok="1"]').click();
  await flush(dom);
  assert(team.tacticPresets.length === 1, "suppression");

  win.close();
  server.close();
  console.log("\n✅ tactic_presets_test.js : tout est vert.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
