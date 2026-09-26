// Trigramme personnalisé (7) + nom de salle (6) — retours communauté
// 2026-09-26 ("Pouvoir choisir son trigramme", "Modifier le nom de sa
// salle"). Partie A : actions serveur (validation, unicité, délai de 30 j,
// modération). Partie B : navigateur (champ Trigramme dans Identité du club,
// formulaire Renommer la salle, logo type et titre de la Salle mis à jour,
// persistance après rechargement).
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const actions = require("./server/actions.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, tries = 60) { for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await sleep(50); } throw new Error("❌ délai dépassé : " + label); }

(async () => {
  const T0 = Calendar.parisEpochForLocalTime(2026, 9, 30, 9);
  const names = ["Bad Kings", "Crawlers Lyon", "Rebond Sud"];
  const league = Engine.generateMultiManagerLeague(names, names.length, T0, Calendar.dailyAnchoredCalendarConfig());
  const humans = league.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
  const [a, b] = humans;

  // --- A : serveur.
  check(Engine.teamTrigram(league.teams[a]) === "BK", "sigle par défaut calculé depuis le nom (BK)");
  let r = actions.setTeamTrigram(league.teams[a], a, league, { trigram: "b4d" }, T0);
  check(!r.ok, "trigramme avec chiffre refusé");
  r = actions.setTeamTrigram(league.teams[a], a, league, { trigram: "fdp" }, T0);
  check(!r.ok, "trigramme interdit refusé");
  r = actions.setTeamTrigram(league.teams[a], a, league, { trigram: "c" }, T0);
  check(!r.ok, "1 lettre refusée");
  r = actions.setTeamTrigram(league.teams[a], a, league, { trigram: "abcd" }, T0);
  check(!r.ok, "4 lettres refusées");
  r = actions.setTeamTrigram(league.teams[a], a, league, { trigram: "cl" }, T0);
  check(!r.ok && /déjà utilisé/.test(r.error), "CL (sigle calculé de Crawlers Lyon) refusé");
  r = actions.setTeamTrigram(league.teams[a], a, league, { trigram: "bd" }, T0);
  check(r.ok && league.teams[a].trigram === "BD", "2 lettres acceptées (BD)");
  league.teams[a].trigram = null; league.teams[a].trigramChangedAt = null;
  r = actions.setTeamTrigram(league.teams[b], b, league, { trigram: "kng" }, T0);
  check(r.ok && league.teams[b].trigram === "KNG", "B prend KNG (mis en majuscules)");
  r = actions.setTeamTrigram(league.teams[a], a, league, { trigram: "KNG" }, T0);
  check(!r.ok && /déjà utilisé/.test(r.error), "A ne peut pas prendre KNG (déjà pris par B)");
  r = actions.setTeamTrigram(league.teams[a], a, league, { trigram: "BKG" }, T0);
  check(r.ok && league.teams[a].trigram === "BKG" && league.teams[a].trigramChangedAt === T0, "A prend BKG");
  r = actions.setTeamTrigram(league.teams[a], a, league, { trigram: "BAD" }, T0 + 5 * 24 * 3600 * 1000);
  check(!r.ok && /jour/.test(r.error), "second changement refusé avant 30 jours");
  r = actions.setTeamTrigram(league.teams[a], a, league, { trigram: "BAD" }, T0 + 31 * 24 * 3600 * 1000);
  check(r.ok && league.teams[a].trigram === "BAD", "changement accepté après 30 jours");
  r = actions.setTeamTrigram(league.teams[a], a, league, { trigram: "" }, T0 + 31 * 24 * 3600 * 1000);
  check(r.ok && league.teams[a].trigram === null && Engine.teamTrigram(league.teams[a]) === "BK", "retour au sigle par défaut");
  // Unicité face au sigle CALCULÉ d'un autre club : "Rebond Sud" → RS.
  // (2 lettres, jamais en conflit avec un trigramme à 3 lettres) ; on force
  // un club au nom d'un seul mot pour tester.
  league.teams[b].name = "Vertige";
  league.teams[b].trigram = null;
  r = actions.setTeamTrigram(league.teams[a], a, league, { trigram: "VER" }, T0 + 40 * 24 * 3600 * 1000);
  check(!r.ok, "VER refusé : c'est le sigle calculé de Vertige");
  league.teams[b].name = "Crawlers Lyon";
  league.teams[a].trigram = null; league.teams[a].trigramChangedAt = null;

  r = actions.setTeamArenaName(league.teams[a], a, league, { arenaName: "Le" }, T0);
  check(!r.ok, "nom de salle trop court refusé");
  r = actions.setTeamArenaName(league.teams[a], a, league, { arenaName: "Salle des Putes" }, T0);
  check(!r.ok, "nom de salle insultant refusé");
  r = actions.setTeamArenaName(league.teams[a], a, league, { arenaName: "<script>" }, T0);
  check(!r.ok, "caractères interdits refusés");
  r = actions.setTeamArenaName(league.teams[a], a, league, { arenaName: "  Le   Chaudron  " }, T0);
  check(r.ok && league.teams[a].arenaName === "Le Chaudron" && Engine.teamArenaName(league.teams[a]) === "Le Chaudron", "nom de salle enregistré (espaces normalisés)");
  check(Engine.teamArenaName(league.teams[b]) === Engine.arenaInfo(league.teams[b].arenaLevel).name, "sans nom personnalisé : nom du palier");
  r = actions.setTeamArenaName(league.teams[a], a, league, { arenaName: null }, T0);
  check(r.ok && league.teams[a].arenaName === null, "retour au nom du palier");
  league.teams[a].trigram = "BKG"; league.teams[a].trigramChangedAt = T0 - 40 * 24 * 3600 * 1000; league.teams[a].arenaName = "Le Chaudron";
  const rebuilt = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(league))));
  check(rebuilt.teams[a].trigram === "BKG" && rebuilt.teams[a].arenaName === "Le Chaudron" && typeof rebuilt.teams[a].trigramChangedAt === "number", "trigramme et nom de salle survivent à la sérialisation");
  league.teams[a].trigram = null; league.teams[a].trigramChangedAt = null; league.teams[a].arenaName = null;
  league.teams[b].trigram = "KNG";

  // --- B : navigateur.
  let now = T0;
  const { server, multiSavePath, baseUrl } = await startTestServer(() => now);
  await store.saveMultiLeague(league, multiSavePath);
  const token = league.teams[a].managerLinkToken;
  let dom = await openGame(html, `${baseUrl}?m=${token}`);
  let doc = dom.window.document, win = dom.window;
  win.eval("showSettingsModal()");
  const input = await waitFor(() => doc.getElementById("clubTrigramInput"), "champ Trigramme");
  check(input.value === "BK", "le champ Trigramme affiche le sigle actuel (BK)");
  input.value = "KNG";
  doc.getElementById("clubTrigramSaveBtn").click();
  await waitFor(() => /déjà utilisé/.test((doc.getElementById("settingsTrigramFeedback") || {}).textContent || ""), "erreur d'unicité affichée");
  check(true, "KNG (pris par B) : message d'erreur affiché");
  doc.getElementById("clubTrigramInput").value = "BKG";
  doc.getElementById("clubTrigramSaveBtn").click();
  await waitFor(() => win.eval("teamA.trigram") === "BKG", "trigramme appliqué côté client");
  await waitFor(() => /BKG/.test((doc.querySelector("#settingsClubBlock svg text") || {}).textContent || ""), "logo type mis à jour dans Paramètres");
  check(true, "le logo type affiche BKG");
  check(doc.getElementById("clubTrigramInput").disabled && /jour/.test(doc.getElementById("settingsClubBlock").textContent), "champ verrouillé et délai affiché après changement");

  doc.getElementById("salleArenaNameInput").value = "Le Chaudron";
  doc.getElementById("salleArenaNameSaveBtn").click();
  await waitFor(() => win.eval("teamA.arenaName") === "Le Chaudron", "nom de salle appliqué");
  win.eval("closeSettingsModal(); TAB_HANDLERS.salle()");
  check(doc.querySelector(".sl-hero-title").textContent === "Le Chaudron", "la page Salle s'intitule « Le Chaudron »");
  check(!doc.getElementById("salleRenameToggle") && !doc.getElementById("clubIdentityPanel"), "aucun formulaire dans la page Salle (tout est dans Paramètres)");

  // Rechargement : tout persiste (serveur).
  dom.window.close();
  dom = await openGame(html, `${baseUrl}?m=${token}`);
  doc = dom.window.document; win = dom.window;
  check(win.eval("teamA.trigram") === "BKG" && win.eval("teamA.arenaName") === "Le Chaudron", "trigramme et nom de salle persistés après rechargement");
  win.eval("TAB_HANDLERS.ligue()");
  check(/BKG/.test(doc.querySelector("#standingsSection").innerHTML), "le classement utilise le trigramme BKG dans le logo type");
  dom.window.close(); server.close();
  console.log("\n✅ trigram_arena_name_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
