// Amical entre championnats : l'adversaire géré par un manager ne doit
// JAMAIS porter le petit robot des clubs de l'ordinateur (retour
// utilisateur 2026-10-11 : « Krautentruppen affiche un petit robot alors que
// l'équipe est gérée par un humain »).
// Cause : l'adversaire était projeté en invité « léger » (nom, pays) sans
// statut humain ; côté navigateur, new Team() → isHuman = false → robot.
// Correction à la source : ref.human / ref.look posés à la création
// (worldRefOf), rafraîchis par catchUp (refreshRefs), projetés dans
// light.look.isHuman. Les vrais clubs de l'ordinateur gardent leur robot.
const store = require("./server/store.js");
const WF = require("./server/worldFriendlies.js");
const Engine = require("./engine.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const check = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };

(async () => {
  const now = Date.now();
  const lgA = store.createMultiManagerCareer(["BC Dia"], now).league;
  const lgB = store.createMultiManagerCareer(["Krautentruppen"], now).league;
  const iA = lgA.teams.findIndex(t => t.name === "BC Dia"), iK = lgB.teams.findIndex(t => t.name === "Krautentruppen");
  const iBot = lgB.teams.findIndex(t => !t.isHuman);
  check(lgB.teams[iK].isHuman && !lgB.teams[iBot].isHuman, "données : Krautentruppen géré par un manager, un club de l'ordinateur à côté");
  const leagues = new Map([["fr-1", lgA], ["de-1", lgB]]);
  // Amicaux d'AVANT la correction (références sans statut humain).
  const ref = (lid, lg, i) => ({ leagueId: lid, idx: i, name: lg.teams[i].name, country: lid.slice(0, 2), label: "D1" });
  const at = now + 3 * 86400e3;
  const st = WF.emptyStore();
  st.list.push({ id: "1", home: ref("fr-1", lgA, iA), away: ref("de-1", lgB, iK), proposer: "home", at, day: 3, time: "20:00", status: "accepted", createdAt: now });
  st.list.push({ id: "2", home: ref("fr-1", lgA, iA), away: ref("de-1", lgB, iBot), proposer: "home", at: at + 86400e3, day: 4, time: "20:00", status: "accepted", createdAt: now });
  const before = WF.projectForViewer(st, "fr-1", iA, now);
  const gK0 = before.guests.find(g => g.light.name === "Krautentruppen");
  check(!("isHuman" in gK0.light.look), "ancien amical, adversaire pas encore relu : statut inconnu (jamais « ordinateur » par défaut côté serveur)");
  const seenFromK = WF.projectForViewer(st, "de-1", iK, now).guests.find(g => g.light.name === "BC Dia");
  check(seenFromK.light.look.isHuman === true, "ancien amical : le club qui l'a proposé est forcément humain");

  // Rattrapage du monde : références relues sur les vrais clubs.
  const changed = WF.catchUp(Engine, st, leagues, now, []);
  check(changed && st.list[0].away.human === true && st.list[1].away.human === false && st.list[0].home.human === true, "rattrapage : statut humain relu sur les vrais clubs (et enregistré)");
  check(st.list[0].away.look && st.list[0].away.look.jerseyColor === lgB.teams[iK].jerseyColor, "rattrapage : apparence du club (maillot, logo) relue aussi");
  check(!WF.catchUp(Engine, st, leagues, now, []), "rien de changé au rattrapage suivant (pas d'écriture inutile)");
  const proj = WF.projectForViewer(st, "fr-1", iA, now);
  const gK = proj.guests.find(g => g.light.name === "Krautentruppen"), gBot = proj.guests.find(g => g.light.name === lgB.teams[iBot].name);
  check(gK.light.look.isHuman === true && gBot.light.look.isHuman === false, "projection : Krautentruppen humain, le club de l'ordinateur reste « ordinateur »");

  // Navigateur : badge robot (lien d'équipe, prochain match, fiche équipe).
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const win = dom.window;
  win.__guests = JSON.parse(JSON.stringify(proj.guests));
  const r = win.eval(`(() => {
    installGuestTeams(league, window.__guests);
    const k = window.__guests.find(g => g.light.name === "Krautentruppen").localIdx;
    const b = window.__guests.find(g => g.light.name !== "Krautentruppen").localIdx;
    const tk = league.teams[k], tb = league.teams[b];
    return { kHuman: tk.isHuman, bHuman: tb.isHuman, kLink: teamLinkHtml(k, tk.name), bLink: teamLinkHtml(b, tb.name), kBadge: robotBadgeHtml(tk), bBadge: robotBadgeHtml(tb), human: teamA.isHuman, mine: robotBadgeHtml(teamA) };
  })()`);
  check(r.kHuman === true && !/bot-badge/.test(r.kLink) && r.kBadge === "", "Krautentruppen : reconnu humain, plus de robot (lien d'équipe, badge)");
  check(r.bHuman === false && /bot-badge/.test(r.bLink), "club de l'ordinateur d'un autre championnat : robot conservé");
  check(r.human === true && r.mine === "", "son propre club : inchangé (pas de robot)");
  const botsInLeague = win.eval("league.teams.filter((t, i) => i < 1000 && t && t.isHuman === false).every(t => /bot-badge/.test(robotBadgeHtml(t)))");
  check(botsInLeague, "clubs de l'ordinateur de sa propre ligue : robot conservé");
  dom.window.close(); server.close();
  console.log("\n🏁 world_friendly_human_badge_test.js : statut humain des adversaires d'amicaux corrigé à la source.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
