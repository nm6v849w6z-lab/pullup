// Premium « personnalisation » (2026-09-29) : parquet aux couleurs du club,
// apparence des jeunes formés au club, numéros de maillot.
const fs = require("fs");
const assert = require("assert");
const Engine = require("./engine.js");
const store = require("./server/store.js");
const actions = require("./server/actions.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const now = Date.now();

const league = store.createMultiManagerCareer(["Kappa Perso"], now, "Kappa Perso").league;
const idx = league.teams.findIndex(t => t.isHuman);
let team = store.deserializeMultiLeague(JSON.parse(JSON.stringify(store.serializeMultiLeague(league)))).league.teams[idx];

// Numéros : uniques, 0-99, jamais un numéro retiré.
const nums = team.players.map(p => p.number);
assert(nums.every(n => Number.isInteger(n) && n >= 0 && n <= 99) && new Set(nums).size === nums.length, "numéros uniques");
team.hallOfFame = [{ id: 1, name: "Légende", retiredNumber: nums[0] }];
Engine.ensureJerseyNumbers(team);
assert(!team.players.some(p => p.number === nums[0]), "numéro retiré plus porté");
console.log("✅ Numéros de maillot uniques, numéro retiré jamais porté.");

// Actions réservées au Premium.
const pl = team.players[1];
assert.strictEqual(actions.setPlayerJerseyNumber(team, idx, league, { playerId: pl.id, number: 7 }, now).ok, false, "gratuit : refusé");
team.isPaying = true;
const other = team.players.find(p => p !== pl);
assert.strictEqual(actions.setPlayerJerseyNumber(team, idx, league, { playerId: pl.id, number: other.number }, now).ok, false, "numéro déjà porté : refusé");
assert.strictEqual(actions.setPlayerJerseyNumber(team, idx, league, { playerId: pl.id, number: nums[0] }, now).ok, false, "numéro retiré : refusé");
const free = [...Array(100).keys()].find(n => !team.players.some(p => p.number === n) && n !== nums[0]);
assert.strictEqual(actions.setPlayerJerseyNumber(team, idx, league, { playerId: pl.id, number: free }, now).ok, true);
assert.strictEqual(pl.number, free);
console.log("✅ Numéro choisi (Premium), doublons et numéros retirés refusés.");

// Parquet.
assert.strictEqual(actions.setTeamCourtStyle(team, idx, league, { courtStyle: { wood: "chene", paint: "rouge" } }, now).ok, true);
assert.deepStrictEqual(team.courtStyle, { wood: "chene", paint: "rouge" });
const cs = Engine.courtStyleFor(team, now);
assert.strictEqual(cs.floor, Engine.COURT_WOODS.chene.floor); assert.strictEqual(cs.paint, Engine.JERSEY_COLORS.rouge);
assert.strictEqual(actions.setTeamCourtStyle(team, idx, league, { courtStyle: { wood: "bambou" } }, now).ok, false);
team.isPaying = false;
assert.strictEqual(Engine.courtStyleFor(team, now), null, "sans Premium, parquet par défaut");
team.isPaying = true;
console.log("✅ Parquet : réglage Premium, sans effet sans Premium.");

// Apparence : jeunes formés au club seulement.
const outsider = team.players[2];
assert.strictEqual(actions.setPlayerLook(team, idx, league, { playerId: outsider.id, look: { hairStyle: "afro" } }, now).ok, false, "joueur non formé au club : refusé");
outsider.homegrownClub = team.name.toLowerCase();
const r = actions.setPlayerLook(team, idx, league, { playerId: outsider.id, look: { hairStyle: "afro", beard: "goatee", headband: "rouge", hairColor: 5, bogus: 1 } }, now);
assert.strictEqual(r.ok, true); assert.deepStrictEqual(outsider.look, { hairStyle: "afro", hairColor: 5, beard: "goatee", headband: "rouge" });
const back = store.deserializeMultiLeague(JSON.parse(JSON.stringify(store.serializeMultiLeague({ ...league, teams: league.teams.map((t, i) => i === idx ? team : t) }))));
console.log("✅ Apparence : réservée aux joueurs formés au club, valeurs filtrées.");

// Promotion d'un jeune : club formateur + numéro.
const y = team.players.pop(); team.youthPlayers = [y]; y.number = null;
team.promoteYouthPlayer(y.id, now);
assert.strictEqual(y.homegrownClub, team.name.toLowerCase()); assert(Number.isInteger(y.number));
assert(Engine.canCustomizePlayerLook(team, y));
console.log("✅ Jeune promu : marqué « formé au club » et numéroté.");

(async () => {
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const win = dom.window, doc = win.document;
  win.eval(`teamA.isPaying = true; teamA.players[0].homegrownClub = teamA.name.toLowerCase(); teamA.players[0].look = { hairStyle: "bald" }; showPlayerDetail(myTeamIndex, teamA.players[0].id);`);
  await flush(dom);
  const card = doc.getElementById("pdpPersoCard");
  assert(card && /Numéro de maillot/.test(card.textContent) && card.querySelector("[data-pdp-look='hairStyle']"), "carte Personnalisation");
  assert(/N° \d+/.test(doc.getElementById("playerDetailContent").textContent), "numéro sur la fiche");
  const jn = doc.querySelector("#playerDetailContent .pdp2-jersey svg .jersey-number");
  assert(jn && jn.textContent === String(win.eval("teamA.players[0].number")), "numéro floqué sur le maillot du club");
  assert(doc.querySelector("#playerDetailContent .pdp2-jersey svg path").getAttribute("fill") === win.eval("JERSEY_COLORS[teamA.jerseyColor]") || win.eval("teamA.jerseyPattern") !== "uni", "maillot aux couleurs du club");
  const svgA = win.eval(`playerAvatarSvg(teamA.players[0], teamA)`), svgB = win.eval(`playerAvatarSvg({ ...teamA.players[0], look: null }, teamA)`);
  assert.notStrictEqual(svgA, svgB, "l'apparence choisie change l'avatar");
  console.log("✅ Jeu : numéro et carte Personnalisation sur la fiche, avatar personnalisé.");
  win.eval(`teamA.courtStyle = { wood: "erable", paint: "bleu" }; document.querySelector('.tab-btn[data-tab="salle"]').click();`);
  await flush(dom);
  const court = doc.querySelector("#salleCourtHolder .sl-court-svg");
  assert(court && /#d9a86b/i.test(court.getAttribute("style")), "aperçu du parquet sur la page Salle");
  assert(doc.querySelectorAll("#salleCourtHolder [data-court-wood]").length === Object.keys(Engine.COURT_WOODS).length);
  win.eval(`teamA.isPaying = false; renderSalleCourt();`);
  assert(!doc.querySelector("#salleCourtHolder [data-court-wood]") && /Passer Premium/.test(doc.getElementById("salleCourtHolder").textContent));
  console.log("✅ Page Salle : aperçu et réglages du parquet (Premium), aperçu seul sinon.");
  await flush(dom); win.close(); server.close();
  console.log("\n🏁 Personnalisation Premium vérifiée.");
})().catch(e => { console.error(e); process.exit(1); });
