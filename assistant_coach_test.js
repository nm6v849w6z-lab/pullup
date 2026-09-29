// Entraîneur adjoint (retour utilisateur, 2026-09-27) : "recruter des
// assistants avec une spécialité [...] les joueurs progressent passivement
// sur les attributs liés à la spécialité", "1 adjoint par équipe", "si un
// adjoint a moins de carac sur lesquelles il agit, elles doivent monter
// plus vite", accessible à tous. Voir engine.js : ASSISTANT_SPECIALTIES,
// assistantAttrWeightsFor, Team.hireAssistantCoach/trainWeek,
// League.refreshAssistantCoachMarket/placeAssistantCoachBid/
// fireTeamAssistantCoach ; server/actions.js et server/index.js (routes).
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const {
  ASSISTANT_SPECIALTIES, ASSISTANT_WEIGHT_BY_LEVEL, ASSISTANT_BASE_SALARY, assistantAttrWeightsFor,
  generateStartingRoster, generateLeague, serializeTeam, teamFromSave, serializeLeague, leagueFromSave,
} = E;

function check(cond, msg) { if (!cond) throw new Error(`❌ ${msg}`); console.log(`✅ ${msg}`); }

// 1) Spécialités : les 13 fondamentaux, chacun une seule fois.
const all = Object.values(ASSISTANT_SPECIALTIES).flatMap(s => s.attrs);
check(all.length === 13 && new Set(all).size === 13 && all.every(a => E.FUNDAMENTAL_ATTRS.includes(a)), "4 spécialités couvrant les 13 fondamentaux une seule fois");

// 2) Moins de caractéristiques = chacune monte plus vite (même joueur, même niveau).
const guard = { position: "Ailier shooteur", height: 200 };
const wDef = assistantAttrWeightsFor({ specialty: "defense", level: 3 }, guard).steal;
const wShoot = assistantAttrWeightsFor({ specialty: "shooting", level: 3 }, guard).freeThrow; // lancer franc : ni poste ni gabarit
const wSteal = assistantAttrWeightsFor({ specialty: "defense", level: 3 }, { position: "Meneur", height: 200 }).steal;
check(wSteal > 0 && wShoot > 0 && ASSISTANT_WEIGHT_BY_LEVEL[5] > ASSISTANT_WEIGHT_BY_LEVEL[1], "poids positifs, croissants avec le niveau");
const perAttr = k => (ASSISTANT_WEIGHT_BY_LEVEL[3] * E.WEIGHT_BY_PROGRAM_SIZE[ASSISTANT_SPECIALTIES[k].attrs.length]);
check(perAttr("defense") > perAttr("shooting") && perAttr("shooting") > perAttr("inside"), "coach défensif (2 carac) > coach de tir (3) > coach des intérieurs (4), par caractéristique");
check(Object.keys(assistantAttrWeightsFor(null, guard)).length === 0 && wDef >= 0, "sans adjoint : aucun poids");

// 3) Progression sur une saison (11 lundis), joueurs qui ne jouent pas compris.
function seasonGains(withAssistant) {
  const team = generateStartingRoster("Adjoint FC");
  generateLeague(team, 1, Date.UTC(2026, 8, 21));
  team.trainingPositions = []; // aucun entraînement des fondamentaux : seul l'adjoint agit
  const p = team.players[0];
  p.age = 19; p.potential = 70;
  E.FUNDAMENTAL_ATTRS.forEach(a => { p.attrs[a] = 35; });
  p.injuryUntil = null;
  if (withAssistant) team.hireAssistantCoach("defense", 5);
  const start = { ...p.attrs };
  for (let w = 0; w < 11; w++) team.trainWeek(1, Date.UTC(2026, 8, 28 + 7 * w));
  return { team, p, d: a => p.attrs[a] - start[a] };
}
let tot = { steal: 0, defOutside: 0, pass: 0, base: 0 };
const N = 40;
for (let i = 0; i < N; i++) {
  const r = seasonGains(true); const b = seasonGains(false);
  tot.steal += r.d("steal"); tot.defOutside += r.d("defOutside"); tot.pass += r.d("pass") - b.d("pass"); tot.base += b.d("steal");
}
const avgSteal = tot.steal / N;
check(avgSteal >= 2 && avgSteal <= 12, `coach défensif 5★, 19 ans, sans jouer : +${avgSteal.toFixed(1)} en interceptions sur la saison (attendu quelques points)`);
check(tot.base / N < 0.5, "sans adjoint ni entraînement : les interceptions ne bougent pas");
check(Math.abs(tot.pass / N) < 0.5, "l'adjoint défensif ne touche pas la passe");

// 4) Blessé : pas de progression par l'adjoint.
{
  const { team, p } = (() => {
    const team = generateStartingRoster("Blessé FC");
    generateLeague(team, 1, Date.UTC(2026, 8, 21));
    team.trainingPositions = [];
    const p = team.players[0];
    p.age = 19; p.potential = 70; p.attrs.steal = 35;
    team.hireAssistantCoach("defense", 5);
    return { team, p };
  })();
  const now = Date.UTC(2026, 8, 28);
  p.injuryUntil = now + 60 * 24 * 3600 * 1000;
  for (let w = 0; w < 5; w++) team.trainWeek(1, now + 7 * w * 24 * 3600 * 1000);
  check(p.attrs.steal === 35, "un joueur blessé ne progresse pas grâce à l'adjoint");
}

// 5) Salaire, paie hebdomadaire, sauvegarde.
{
  const team = generateStartingRoster("Paie FC");
  generateLeague(team, 1, Date.UTC(2026, 8, 21));
  team.hireAssistantCoach("shooting", 3, 1900);
  check(team.assistantCoachSalary() === 1900, "salaire de départ = mise gagnante");
  const lines = [];
  const orig = team.recordTransaction.bind(team);
  team.recordTransaction = (label, amount) => { if (/entraîneur adjoint/.test(label)) lines.push(amount); return orig(label, amount); };
  team.trainWeek(1, Date.UTC(2026, 8, 28));
  check(lines.length === 1 && lines[0] === -1900 && team.assistantCoach.weeksEmployed === 1, "paie hebdomadaire sur sa propre ligne");
  check(team.assistantCoachSalary() > 1900, "le salaire grimpe chaque semaine");
  const back = teamFromSave(JSON.parse(JSON.stringify(serializeTeam(team))));
  check(back.assistantCoach && back.assistantCoach.specialty === "shooting" && back.assistantCoach.level === 3 && back.assistantCoach.baseSalary === 1900, "l'adjoint survit à la sauvegarde");
  team.hireAssistantCoach("inside", 2);
  check(team.assistantCoach.specialty === "inside" && team.assistantCoach.baseSalary === ASSISTANT_BASE_SALARY[2], "un seul adjoint : en engager un autre remplace le précédent");
}

// 6) Marché aux enchères.
{
  const now = Date.UTC(2026, 8, 27, 9);
  const lg = E.generateMultiManagerLeague(["A", "B"], 1, now, { dailyAnchored: true });
  lg.refreshAssistantCoachMarket(now);
  const open = lg.assistantCoachListings.filter(l => l.status === "open");
  check(open.length >= 2 * lg.staffMarketMinOpenListings() && open.every(l => ASSISTANT_SPECIALTIES[l.specialty]), `marché : ${open.length} candidats ouverts, chacun avec une spécialité`);
  const idx = lg.teams.findIndex(t => t.isHuman);
  const listing = open[0];
  // Mise nettement au-dessus du minimum : un club IA surenchérit parfois
  // (environ 7 % des tirages), ce qui rendait ce test aléatoire.
  const r = lg.placeAssistantCoachBid(listing.id, idx, E.minNextBidFor(listing) * 3, now + 1000);
  check(r.ok, "enchère acceptée");
  lg.refreshAssistantCoachMarket(listing.closesAt + 1);
  const team = lg.teams[idx];
  check(team.assistantCoach && team.assistantCoach.specialty === listing.specialty && team.assistantCoach.level === listing.level, "enchère gagnée : adjoint engagé avec sa spécialité");
  const salary = team.assistantCoachSalary();
  const fired = lg.fireTeamAssistantCoach(idx, listing.closesAt + 2);
  const relist = lg.assistantCoachListings[lg.assistantCoachListings.length - 1];
  check(fired.relisted && !team.assistantCoach && relist.specialty === listing.specialty && relist.startPrice === Math.max(1, Math.round(salary * 0.7)), "congédié : remis sur le marché à 70 % de son salaire");
  const back = leagueFromSave(JSON.parse(JSON.stringify(serializeLeague(lg))));
  check(back.assistantCoachListings.length === lg.assistantCoachListings.length, "le marché des adjoints survit à la sauvegarde");
}

// 7) Serveur et page : routes, rafraîchissement, onglet Staff.
{
  const idx = fs.readFileSync(path.join(__dirname, "server", "index.js"), "utf-8");
  const auto = fs.readFileSync(path.join(__dirname, "server", "autoSim.js"), "utf-8");
  const A = require("./server/actions.js");
  check(/"\/api\/market\/assistant-bid": actions\.bidOnAssistantCoachListing/.test(idx) && /"\/api\/staff\/fire-assistant": actions\.fireAssistantCoach/.test(idx), "routes /api/market/assistant-bid et /api/staff/fire-assistant");
  check(typeof A.bidOnAssistantCoachListing === "function" && typeof A.fireAssistantCoach === "function", "actions serveur exportées");
  check(/refreshAssistantCoachMarket\(now\)/.test(auto), "marché rafraîchi à chaque passage serveur");
  const html = fs.readFileSync(path.join(__dirname, "moteurbasket3.html"), "utf-8");
  check(html.includes('id="staffAssistantPanel"') && html.includes('key: "assistant", label: "Entraîneur adjoint"'), "section Entraîneur adjoint sur la page Staff");
}

// 8) Navigateur : section Entraîneur adjoint, filtre par spécialité (retour
//    utilisateur, 2026-09-27 : "un filtre par spécialité sur le marché des
//    adjoints ; oui ajoute").
(async () => {
  const { startTestServer, openGame, flush } = require("./test_helpers.js");
  const html = fs.readFileSync("moteurbasket3.html", "utf-8");
  const { server } = await startTestServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const dom = await openGame(html, baseUrl);
    const doc = dom.window.document;
    const win = dom.window;
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "staff").click();
    doc.querySelector('[data-staff-toggle-role="assistant"]').click();
    await flush(dom);
    const specBtns = doc.querySelectorAll('#staffAssistantHireGrid [data-staff-specialty]');
    check(specBtns.length === 5, "filtre de spécialité : Toutes + 4 spécialités");
    const total = doc.querySelectorAll("#staffAssistantHireGrid table.stf-table tbody tr").length;
    const target = [...specBtns].find(b => b.dataset.staffSpecialty !== "assistant:" && !b.disabled);
    target.click();
    await flush(dom);
    const key = target.dataset.staffSpecialty.split(":")[1];
    const rows = [...doc.querySelectorAll("#staffAssistantHireGrid table.stf-table tbody tr")];
    const expected = win.eval(`league.assistantCoachListings.filter(l => l.status === "open" && l.specialty === "${key}").length`);
    const label = ASSISTANT_SPECIALTIES[key].label;
    check(rows.length === Math.min(expected, win.eval("STAFF_LISTINGS_COLLAPSED_COUNT")) && rows.every(r => r.textContent.includes(label)), `filtre « ${label} » : seuls ses candidats sont listés`);
    doc.querySelector('[data-staff-specialty="assistant:"]').click();
    await flush(dom);
    check(doc.querySelectorAll("#staffAssistantHireGrid table.stf-table tbody tr").length === total, "« Toutes » réaffiche tous les candidats");
    dom.window.close();
  } finally {
    server.close();
  }
  console.log("\n🏁 assistant_coach_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
