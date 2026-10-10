// Personnalisation des sélections dans le DIRECT (mission 2026-10-10) :
// navigateur réel (Chromium), jeu complet, match international joué par le
// moteur. Sélection à domicile avec personnalisation Premium (maillot,
// parquet, logo importé) ; sélection à l'extérieur avec des choix du
// catalogue (écusson national). Vérifie le parquet et le logo au rond
// central, les logos du tableau, les couleurs de maillot — avant le
// 2026-10-10 le parquet était ignoré et les logos remplacés par le ballon
// par défaut. Rouvrir le direct : même rendu (persistance).
const fs = require("fs");
const ok = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };
let chromium;
try { chromium = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright").chromium; } catch (e) { /* rien */ }
if (!chromium || !fs.existsSync("/opt/pw-browsers/chromium")) { console.log("ℹ️  Chromium absent : vérification navigateur sautée"); process.exit(0); }
process.chdir(__dirname);
const store = require("./server/store.js");
const { startTestServer } = require("./test_helpers.js");
const E = require("./engine.js");
const LiveMatch = require("./server/liveMatch.js");
const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const LOOK = { jerseyShape: "B", jerseyColor: "#123abc", jerseyPattern: "rayures", jerseyTwoTone: "#123abc/#ffcc00", courtStyle: { wood: "#334455", paint: "#aa0000" }, logoDataUrl: LOGO };

function fixture() {
  const N = require("./server/nationalTeams.js");
  const M = require("./server/nationalMatches.js");
  const start = Date.UTC(2027, 0, 5, 19);
  const COUNTRIES = Object.keys(E.WORLD_COUNTRIES);
  const lg = store.createMultiManagerCareer(["Lyon NP", "Paris NP"], start).league;
  lg.seasonNumber = 2; lg.calendarStartAt = start; lg.country = "fr";
  lg.teams.forEach(t => { if (t.isHuman) t.lastSeenAt = start + 300 * 864e5; });
  lg.teams.flatMap(t => t.players).forEach((p, i) => { p.nationality = COUNTRIES[i % COUNTRIES.length]; p.age = 25; p.injuryUntil = null; p.condition = 100; p.conditionUpdatedAt = start; });
  const leagues = new Map([["fr-1", lg]]);
  const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }] };
  const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
  N.step(st, leagues, world, start + 3600e3);
  const m1 = M.compOf(st, 2, "A").matches.find(m => m.w === 1);
  // Choix des staffs AVANT le match (stock national).
  st.teams[m1.home].look = JSON.parse(JSON.stringify(LOOK));
  st.teams[m1.away].visuals = { logo: "nat-round", center: "code", jersey: "blanc", court: "chene" };
  N.step(st, leagues, world, m1.at + 60e3);
  const item = M.takePendingLive(st).find(x => x.id === m1.id);
  const view = LiveMatch.viewLiveMatchForTeam({ liveMatches: { [m1.id]: item.entry } }, item.entry.homeIdx);
  view.intl = item.entry.intl;
  const shift = Date.now() - 20 * 60e3 - view.kickoffAt;
  const sh = o => { for (const k of Object.keys(o)) if (/At$/.test(k) && typeof o[k] === "number") o[k] += shift; };
  sh(view); (view.events || []).forEach(sh); (view.pauses || []).forEach(sh);
  return { id: m1.id, home: m1.home, away: m1.away, item, data: { ok: true, live: view, watchIdx: item.entry.homeIdx, mine: false, ended: false,
    guestTeams: [{ leagueId: null, idx: null, level: null, team: item.teams.home, localIdx: item.entry.homeIdx }, { leagueId: null, idx: null, level: null, team: item.teams.away, localIdx: item.entry.awayIdx }],
    teamName: N.teamLabel(m1.home), opponentName: N.teamLabel(m1.away) } };
}

(async () => {
  const nt = fixture();
  // Serveur : équipe du match habillée (direct rangé à part).
  const h = nt.item.teams.home, a = nt.item.teams.away;
  ok(h.customLogoDataUrl === LOGO && h.jerseyColor === "#123abc" && h.jerseyPattern === "rayures" && h.jerseyShape === "B" && h.courtStyle && h.courtStyle.wood === "#334455", "serveur : équipe du match à domicile habillée (logo, maillot, coupe, parquet)");
  ok(a.jerseyColor === "blanc" && a.courtStyle && a.courtStyle.wood === "chene" && !a.customLogoDataUrl, "serveur : sélection à l'extérieur aux choix du catalogue");
  ok(nt.data.live.intl.logos && nt.data.live.intl.logos.away.id === "nat-round", "direct : écussons du catalogue transmis (intl.logos)");

  const { server, multiSavePath, baseUrl } = await startTestServer();
  const career = store.createMultiManagerCareer(["Gotham Knights", "Paris Sel"], Date.now(), "Gotham Knights");
  const me = career.league.teams.find(t => t.name === "Gotham Knights");
  me.betaFeatures = ["live2d"];
  await store.saveMultiLeague(career.league, multiSavePath);
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let code = 0;
  try {
    const p = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    const errors = []; p.on("pageerror", e => errors.push(e.message));
    await p.goto(baseUrl + "?m=" + me.managerLinkToken);
    await p.waitForFunction(() => window.__gameReady, null, { timeout: 30000 });
    await p.evaluate(() => window.__gameReady);
    const clubBefore = await p.evaluate(() => JSON.stringify([teamA.jerseyColor, teamA.jerseyPattern, teamA.courtStyle, teamA.customLogoDataUrl || null]));
    await p.evaluate(d => { const real = window.fetchApi; window.fetchApi = async (url, ...r) => /national\/live/.test(url) ? { ok: true, json: async () => JSON.parse(JSON.stringify(d)) } : real(url, ...r); }, nt.data);
    const look = async () => {
      await p.evaluate(id => HM_NATIONAL.openLive(id), nt.id);
      await p.waitForFunction(() => ntLiveState && ntLiveState.rich && ntLiveState.rich.view, null, { timeout: 15000 });
      await p.waitForTimeout(1200);
      return p.evaluate(() => {
        const s = ntLiveState.rich.adapter.buildState(Date.now());
        const host = document.getElementById("ntLiveHost");
        return {
          court: s.courtStyle, courtLogo: s.courtLogo || "",
          logos: (s.teams || []).map(t => t.logo || ""), colors: (s.teams || []).map(t => t.color),
          domLogoImg: !!host.querySelector('image[href^="data:image/png"], img[src^="data:image/png"]'),
        };
      });
    };
    const r = await look();
    ok(r.court && /^#33445/i.test(r.court.floor || "") && /^#aa0000$/i.test(r.court.paint || ""), `direct : parquet de la sélection à domicile (sol ${r.court && r.court.floor}, raquette ${r.court && r.court.paint})`);
    ok(r.courtLogo.includes(LOGO), "direct : logo importé au rond central");
    const homeIdx = nt.data.live.isHome ? 0 : 1;
    ok(r.logos[homeIdx].includes(LOGO), "direct : logo importé sur le tableau (domicile)");
    ok(/<svg/.test(r.logos[1 - homeIdx]) && !/Logo de/.test(r.logos[1 - homeIdx]) , "direct : écusson du catalogue pour l'extérieur (pas le ballon par défaut)");
    ok(r.domLogoImg, "rendu : le logo importé est affiché");
    // Persistance : direct fermé puis rouvert → même rendu.
    await p.evaluate(() => closeNtLive(false));
    const r2 = await look();
    ok(JSON.stringify(r2.court) === JSON.stringify(r.court) && r2.courtLogo.includes(LOGO), "direct rouvert : même parquet, même logo");
    const clubAfter = await p.evaluate(() => JSON.stringify([teamA.jerseyColor, teamA.jerseyPattern, teamA.courtStyle, teamA.customLogoDataUrl || null]));
    ok(clubAfter === clubBefore, "personnalisation du club du spectateur inchangée");
    ok(errors.length === 0, "aucune erreur JavaScript" + (errors.length ? " : " + errors.slice(0, 3).join(" | ") : ""));
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  } catch (e) { console.error(e); code = 1; }
  await b.close(); server.close();
  if (!code) console.log("\n🏁 national_premium_live_test.js : personnalisation des sélections visible dans le direct.");
  process.exit(code);
})().catch(e => { console.error(e); process.exit(1); });
