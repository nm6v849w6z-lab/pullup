// Salle personnalisée et avatars des jeunes (Premium, retour utilisateur
// 2026-09-30 : les deux lignes encore en « Bientôt » sur la page Premium).
// Vérifie :
// 1) moteur : normalizeArenaStyle/arenaStyleFor (Premium seulement), survie
//    à la sauvegarde ;
// 2) serveur : /api/club/set-arena-style refusé à un club gratuit, valeurs
//    invalides refusées ; /api/player/set-look accepté pour un jeune de
//    l'académie (Premium), refusé sinon ;
// 3) onglet Personnalisation, section « Salle » : aperçu verrouillé + Passer
//    Premium en gratuit ; réglages, brouillon, enregistrement et page Salle
//    redessinée en Premium ;
// 4) Académie : bouton d'apparence sur la carte de chaque jeune, fenêtre avec
//    aperçu ; gratuit = champs grisés sans requête, Premium = enregistrement.
const fs = require("fs");
const Engine = require("./engine.js");
const actions = require("./server/actions.js");
const { startTestServer, openGame, flush, editSave } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, msg, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* pas encore */ } await sleep(40); }
  throw new Error("❌ délai dépassé : " + msg);
}

// --- 1) Moteur.
assert(Engine.normalizeArenaStyle(null) === null && Engine.normalizeArenaStyle({ facade: "beton", roof: "gris", mood: "dusk" }) === null, "style par défaut = null");
const st = Engine.normalizeArenaStyle({ main: "bleu", second: "inconnu", facade: "brique", roof: "club", mood: "day" });
assert(st && st.main === "bleu" && st.second === null && st.facade === "brique" && st.roof === "club" && st.mood === "day", "style normalisé (couleur inconnue ignorée)");
const T0 = Date.UTC(2026, 8, 30, 12);
const league = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(require("./server/store.js").createNewCareer(T0).league))));
const team = league.teams[0];
team.arenaStyle = st;
assert(Engine.arenaStyleFor(team, T0) === null, "club gratuit : style ignoré au rendu");
team.setPaying(true);
assert(Engine.arenaStyleFor(team, T0) && Engine.arenaStyleFor(team, T0).facade === "brique", "club Premium : style appliqué");
const again = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(league)))).teams[0];
assert(again.arenaStyle && again.arenaStyle.roof === "club", "style de salle conservé à la sauvegarde");

// --- 2) Serveur.
team.setPaying(false);
assert(!actions.setTeamArenaStyle(team, 0, league, { arenaStyle: { facade: "brique" } }, T0).ok, "set-arena-style refusé à un club gratuit");
team.setPaying(true);
assert(!actions.setTeamArenaStyle(team, 0, league, { arenaStyle: { facade: "marbre" } }, T0).ok, "façade inconnue refusée");
assert(!actions.setTeamArenaStyle(team, 0, league, { arenaStyle: { main: "rose" } }, T0).ok, "couleur inconnue refusée");
assert(!actions.setTeamArenaStyle(team, 0, league, { arenaStyle: { mood: "nuit" } }, T0).ok, "ambiance inconnue refusée");
let r = actions.setTeamArenaStyle(team, 0, league, { arenaStyle: { facade: "anthracite", roof: "noir", main: "vert" } }, T0);
assert(r.ok && team.arenaStyle.facade === "anthracite" && team.arenaStyle.main === "vert", "style valide enregistré");
// Couleurs libres (2026-10-05) : couleurs, façade et toit en "#rrggbb".
r = actions.setTeamArenaStyle(team, 0, league, { arenaStyle: { main: "#123ABC", second: "#ffffff", facade: "#7A2B3A", roof: "#20242C" } }, T0);
assert(r.ok && team.arenaStyle.main === "#123abc" && team.arenaStyle.facade === "#7a2b3a" && team.arenaStyle.roof === "#20242c", "couleurs libres enregistrées");
assert(Engine.arenaFacadeColors("#7a2b3a").side !== "#7a2b3a" && /^#[0-9a-f]{6}$/.test(Engine.arenaFacadeColors("#7a2b3a").side), "façade libre : côté ombré déduit");
assert(!actions.setTeamArenaStyle(team, 0, league, { arenaStyle: { roof: "#12" } }, T0).ok, "toit : code hexa invalide refusé");
r = actions.setTeamArenaStyle(team, 0, league, { arenaStyle: null }, T0);
assert(r.ok && team.arenaStyle === null, "retour à la salle par défaut");
const cand = Engine.generateYouthCandidate(T0, 3, team.country);
team.youthCandidates.push(cand);
team.signYouthCandidate(cand.id);
assert(Engine.canCustomizePlayerLook(team, team.youthPlayers[team.youthPlayers.length - 1]), "un jeune de l'académie est personnalisable");
r = actions.setPlayerLook(team, 0, league, { playerId: cand.id, look: { hairStyle: "afro", headband: "rouge" } }, T0);
assert(r.ok && r.look.hairStyle === "afro", "apparence d'un jeune enregistrée (Premium)");
team.setPaying(false);
assert(!actions.setPlayerLook(team, 0, league, { playerId: cand.id, look: { hairStyle: "bald" } }, T0).ok, "apparence refusée à un club gratuit");

(async () => {
  // --- 3/4) Navigateur.
  const { server, savePath, baseUrl } = await startTestServer();
  editSave(savePath, t => {
    const c = Engine.generateYouthCandidate(Date.now(), 3, t.country);
    t.youthCandidates.push(c);
    t.signYouthCandidate(c.id);
  });
  const dom = await openGame(html, baseUrl);
  const win = dom.window, doc = win.document;
  const calls = [];
  const realFetch = win.fetch;
  win.fetch = (input, init) => { calls.push({ url: String(input), body: init && init.body ? String(init.body) : "" }); return realFetch.call(win, input, init); };

  win.eval("TAB_HANDLERS.personnalisation()");
  await flush(dom);
  assert([...doc.querySelectorAll("[data-pz-anchor]")].map(a => a.dataset.pzAnchor).includes("persoSalle"), "sommaire : section Salle");
  const holder = doc.getElementById("persoArenaHolder");
  assert(holder.querySelector(".pz-arena-preview.is-locked svg") && holder.querySelector('[data-tab="premium"]') && !holder.querySelector("[data-arena-facade]"), "gratuit : aperçu verrouillé + « Passer Premium », aucun réglage");

  win.eval("renderPremiumSection()");
  doc.getElementById("premiumToggleBtn").click();
  await flush(dom);
  win.eval("TAB_HANDLERS.personnalisation()");
  await flush(dom);
  assert(holder.querySelectorAll("[data-arena-facade]").length === Object.keys(Engine.ARENA_FACADES).length && holder.querySelectorAll("[data-arena-roof]").length === Object.keys(Engine.ARENA_ROOFS).length, "Premium : façades et toits proposés");
  assert(doc.getElementById("persoArenaSaveBtn").disabled, "rien à enregistrer au départ");
  const before = holder.querySelector(".pz-arena-preview svg").outerHTML.replace(/ar\d+/g, "");
  holder.querySelector('[data-arena-facade="brique"]').click();
  holder.querySelector('[data-arena-roof="club"]').click();
  holder.querySelector('[data-arena-main="bleu"]').click();
  holder.querySelector('[data-arena-mood="day"]').click();
  const after = holder.querySelector(".pz-arena-preview svg").outerHTML.replace(/ar\d+/g, "");
  assert(before !== after && /#b8664b/.test(after) && /#3b6fd6/i.test(after), "aperçu redessiné en direct (brique, bleu)");
  assert(!doc.getElementById("persoArenaSaveBtn").disabled, "brouillon : Enregistrer actif");
  doc.getElementById("persoArenaSaveBtn").click();
  await waitFor(() => win.eval("teamA.arenaStyle && teamA.arenaStyle.facade") === "brique", "salle enregistrée");
  assert(calls.some(c => c.url.includes("/api/club/set-arena-style") && c.body.includes("brique")), "→ /api/club/set-arena-style");
  doc.querySelector('.tab-btn[data-tab="salle"]').click();
  await flush(dom);
  assert(/#b8664b/.test(doc.getElementById("arenaVisualCard").innerHTML), "page Salle : dessin personnalisé");
  win.eval("teamA.isPaying = false; TAB_HANDLERS.salle();");
  assert(!/#b8664b/.test(doc.getElementById("arenaVisualCard").innerHTML), "Premium perdu : salle par défaut (choix conservé)");
  win.eval("teamA.isPaying = true;");

  // Académie : avatars des jeunes.
  doc.querySelector('.tab-btn[data-tab="academie"]').click();
  await flush(dom);
  const btn = doc.querySelector("#youthRosterHolder [data-youth-look]");
  assert(btn, "bouton « Personnaliser l'apparence » sur la carte du jeune");
  btn.click();
  const box = doc.querySelector("#youthLookOverlay .yl-box");
  assert(box && box.querySelector("#youthLookPreview svg") && box.querySelectorAll("select[data-youth-look-field]").length >= 3, "fenêtre d'apparence avec aperçu");
  const sel = box.querySelector('[data-youth-look-field="hairStyle"]');
  const prevBefore = doc.getElementById("youthLookPreview").innerHTML;
  sel.value = sel.value === "afro" ? "bald" : "afro";
  sel.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(doc.getElementById("youthLookPreview").innerHTML !== prevBefore, "aperçu mis à jour en direct");
  const wanted = sel.value;
  box.querySelector("[data-youth-look-save]").click();
  await waitFor(() => /enregistrée/.test(doc.getElementById("youthLookFeedback").textContent), "apparence enregistrée");
  assert(calls.some(c => c.url.includes("/api/player/set-look") && c.body.includes(wanted)), "→ /api/player/set-look");
  assert(win.eval("teamA.youthPlayers[0].look && teamA.youthPlayers[0].look.hairStyle") === wanted, "apparence gardée côté client");
  doc.querySelector("[data-youth-look-close]").click();
  assert(!doc.getElementById("youthLookOverlay"), "Fermer ferme la fenêtre");

  // Gratuit : champs grisés, aucune requête.
  win.eval("teamA.isPaying = false; renderYouthRoster();");
  const n = calls.length;
  doc.querySelector("#youthRosterHolder [data-youth-look]").click();
  const box2 = doc.querySelector("#youthLookOverlay .yl-box");
  assert([...box2.querySelectorAll("select")].every(s => s.disabled) && box2.querySelector('[data-tab="premium"]') && !box2.querySelector("[data-youth-look-save]"), "gratuit : champs grisés + « Passer Premium »");
  assert(calls.length === n, "gratuit : aucune requête");
  doc.querySelector("[data-youth-look-close]").click();

  // Page Premium : plus rien en « Bientôt ».
  win.eval("renderPremiumSection()");
  const content = doc.getElementById("premiumContent");
  assert(!content.querySelector(".prm-soon") && /Salle personnalisée/.test(content.textContent) && /Avatars des jeunes/.test(content.textContent), "page Premium : salle et avatars livrés, plus de « Bientôt »");

  win.close(); server.close();
  console.log("\n🏁 premium_arena_youth_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
