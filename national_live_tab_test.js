// Direct d'une sélection nationale dans un VRAI onglet, comme le direct du
// club (mission live 2026-10-10 : « Lorsqu'on ouvre le live d'une équipe
// nationale, un véritable onglet de live est créé ou activé… la fenêtre
// superposée ne doit plus être utilisée »). Navigateur réel (Chromium), jeu
// complet servi par le serveur de test, terrain animé (bêta live2d).
// Scénario imposé : ouvrir un live de club PUIS un live d'équipe nationale,
// vérifier que les deux suivent le même comportement d'onglet (page, onglet
// actif, bandeau du haut, navigation retour), sans fenêtre superposée ni
// perte de l'état du match ; aller-retour entre les deux : même vue, même
// file d'événements, aucune nouvelle simulation ni requête, aucun doublon
// (vues, terrains, contextes audio) ; un seul direct audible à la fois.
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

// Match international joué par le moteur (même construction que
// national_live_ui_test.js / la route /api/national/live), recalé pour être
// EN COURS maintenant (coup d'envoi il y a 20 min).
function nationalFixture() {
  const N = require("./server/nationalTeams.js");
  const M = require("./server/nationalMatches.js");
  const start = Date.UTC(2027, 0, 5, 19);
  const COUNTRIES = Object.keys(E.WORLD_COUNTRIES);
  const lg = store.createMultiManagerCareer(["Lyon NT", "Paris NT"], start).league;
  lg.seasonNumber = 2; lg.calendarStartAt = start; lg.country = "fr";
  lg.teams.forEach(t => { if (t.isHuman) t.lastSeenAt = start + 300 * 864e5; });
  lg.teams.flatMap(t => t.players).forEach((p, i) => { p.nationality = COUNTRIES[i % COUNTRIES.length]; p.age = 25; p.injuryUntil = null; p.condition = 100; p.conditionUpdatedAt = start; });
  const leagues = new Map([["fr-1", lg]]);
  const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }] };
  const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
  N.step(st, leagues, world, start + 3600e3);
  const comp = M.compOf(st, 2, "A");
  const m1 = comp.matches.find(m => m.w === 1);
  N.step(st, leagues, world, m1.at + 60e3);
  const item = M.takePendingLive(st).find(x => x.id === m1.id);
  const view = LiveMatch.viewLiveMatchForTeam({ liveMatches: { [m1.id]: item.entry } }, item.entry.homeIdx);
  view.intl = item.entry.intl;
  const shift = Date.now() - 20 * 60e3 - view.kickoffAt;
  const sh = o => { for (const k of Object.keys(o)) if (/At$/.test(k) && typeof o[k] === "number") o[k] += shift; };
  sh(view); (view.events || []).forEach(sh); (view.pauses || []).forEach(sh);
  delete view.replay; view.ended = false;
  return {
    id: m1.id,
    data: {
      ok: true, live: view, watchIdx: item.entry.homeIdx, mine: false, ended: false,
      guestTeams: [{ leagueId: null, idx: null, level: null, team: item.teams.home, localIdx: item.entry.homeIdx }, { leagueId: null, idx: null, level: null, team: item.teams.away, localIdx: item.entry.awayIdx }],
      teamName: N.teamLabel(m1.home), opponentName: N.teamLabel(m1.away),
    },
  };
}

(async () => {
  const nt = nationalFixture();
  const { server, multiSavePath, baseUrl } = await startTestServer();
  const career = store.createMultiManagerCareer(["Gotham Knights", "Paris Sel"], Date.now(), "Gotham Knights");
  const me = career.league.teams.find(t => t.name === "Gotham Knights");
  me.betaFeatures = ["live2d", "liveShows"];
  await store.saveMultiLeague(career.league, multiSavePath);
  // Direct du club en cours (coup d'envoi il y a 5 min).
  const home = E.generateTeam("Gotham Knights", 1), away = E.generateTeam("Paris Sel", 1);
  const r = new E.MatchEngine(home, away, { homeAdvantage: true }).simulate();
  const ko = Date.now() - 300000, sc = LiveMatch.schedulePlayback(r.events, ko);
  const club = { kickoffAt: ko, round: 1, competition: "championship", isHome: true, opponentIdx: 1, events: sc.events, pauses: sc.pauses, totalDurationMs: sc.totalDurationMs, boxScoreA: r.boxScoreA, boxScoreB: r.boxScoreB, finalScore: { home: 0, away: 0 } };

  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let code = 0;
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => {
      window.__ctxCount = 0;
      const AC = window.AudioContext;
      window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ctxCount++; } };
    });
    const errors = []; p.on("pageerror", e => errors.push(e.message));
    await p.goto(baseUrl + "?m=" + me.managerLinkToken);
    await p.waitForFunction(() => window.__gameReady, null, { timeout: 30000 });
    await p.evaluate(() => window.__gameReady);
    // Requêtes du direct national comptées (aucune nouvelle requête au retour).
    await p.evaluate(ntData => {
      window.refreshFromServerAndReenter = () => {};
      window.__ntCalls = 0;
      const real = window.fetchApi;
      window.fetchApi = async (url, ...rest) => {
        if (/\/api\/national\/live/.test(url)) { window.__ntCalls++; return { ok: true, json: async () => JSON.parse(JSON.stringify(ntData)) }; }
        return real(url, ...rest);
      };
    }, nt.data);

    // 1) Direct du club : sa page, son onglet.
    await p.evaluate(pl => { league.liveMatch = pl; enterLiveMatch(pl); syncTopbarLiveStrip(); }, club);
    await p.waitForFunction(() => hmLive && hmLive.view, null, { timeout: 15000 });
    const s1 = await p.evaluate(() => ({ page: !document.getElementById("liveSection").classList.contains("hidden"), cls: document.body.classList.contains("page-live"), overlay: !!document.getElementById("spectateOverlay") }));
    ok(s1.page && s1.cls && !s1.overlay, "direct du club : page #liveSection, sans fenêtre superposée");
    await p.evaluate(() => { window.__clubView = hmLive.view; });

    // 2) Direct national : une page / un onglet, comme le club.
    await p.evaluate(id => HM_NATIONAL.openLive(id), nt.id);
    await p.waitForFunction(() => ntLiveState && ntLiveState.rich && ntLiveState.rich.view, null, { timeout: 15000 });
    await p.waitForTimeout(1500);
    const s2 = await p.evaluate(() => ({
      overlay: !!document.getElementById("spectateOverlay") || !!document.querySelector(".spectate-overlay"),
      page: !document.getElementById("ntLiveSection").classList.contains("hidden"),
      clubHidden: document.getElementById("liveSection").classList.contains("hidden"),
      tab: hmActiveTabKey, cls: document.body.classList.contains("page-ntlive"),
      court: document.querySelectorAll("#ntLiveHost .c2d-court, #ntLiveHost svg.c2d").length,
      views: document.querySelectorAll("#ntLiveHost .hm-live").length,
      title: document.querySelector("#ntLiveHost h3").textContent,
      clubStrip: !document.getElementById("topbarLiveStrip").classList.contains("hidden"),
      ntStripShown: getComputedStyle(document.getElementById("topbarNtLiveStrip")).display !== "none",
      calls: window.__ntCalls, applied: ntLiveState.rich.applied,
      clubSame: hmLive.view === window.__clubView,
      nav: hmNavCurrent(),
    }));
    ok(!s2.overlay, "direct national : aucune fenêtre superposée (#spectateOverlay absent)");
    ok(s2.page && s2.clubHidden && s2.cls && s2.tab === "ntlive", "direct national : page #ntLiveSection affichée, onglet actif « ntlive » (même mécanique que « live »)");
    ok(s2.nav.page === "ntLiveSection" && s2.nav.tab === "ntlive", "navigation (retour navigateur) : l'étape « direct national » est enregistrée comme une page");
    ok(s2.views === 1, "une seule vue live dans la page nationale");
    ok(/Sélections nationales/.test(await p.evaluate(() => document.getElementById("ntLiveHost").textContent)) && s2.title.includes(nt.data.teamName), "page : compétition et sélections");
    ok(s2.clubStrip && !s2.ntStripShown, "bandeau du club visible (match du club en cours), bandeau national masqué sur sa propre page");
    ok(s2.clubSame, "le direct du club continue (même vue, pas recréée)");
    ok(s2.calls === 1 && s2.applied > 10, `une requête, match national en cours (${s2.applied} actions déjà diffusées)`);
    await p.evaluate(() => { window.__nt = { st: ntLiveState, view: ntLiveState.rich.view, adapter: ntLiveState.rich.adapter, items: ntLiveState.rich.items, timer: ntLiveState.timer }; });
    const aud2 = await p.evaluate(() => ({ club: hmLive.view.audible, nt: ntLiveState.rich.view.audible }));
    ok(aud2.nt === true && aud2.club === false, "un seul direct audible : la sélection sur sa page, le club coupé");

    // 3) Retour au direct du club par son onglet / bandeau : même comportement.
    await p.click("#topbarLiveStrip");
    await p.waitForTimeout(800);
    const s3 = await p.evaluate(() => ({
      page: !document.getElementById("liveSection").classList.contains("hidden"),
      ntHidden: document.getElementById("ntLiveSection").classList.contains("hidden"),
      tab: hmActiveTabKey, clubSame: hmLive.view === window.__clubView,
      ntStrip: getComputedStyle(document.getElementById("topbarNtLiveStrip")).display !== "none",
      ntStripText: document.getElementById("topbarNtLiveStrip").textContent.replace(/\s+/g, " ").trim(),
      ntSame: ntLiveState === window.__nt.st && ntLiveState.rich.view === window.__nt.view,
      applied: ntLiveState.rich.applied,
    }));
    ok(s3.page && s3.ntHidden && s3.tab === "live" && s3.clubSame, "bandeau du club → page du direct du club (même vue)");
    ok(s3.ntStrip && /\d+–\d+/.test(s3.ntStripText), `bandeau du direct national présent hors de sa page (« ${s3.ntStripText} »)`);
    ok(s3.ntSame, "direct national conservé en quittant sa page (même état, même vue)");
    const aud3 = await p.evaluate(() => ({ club: hmLive.view.audible, nt: window.__nt.view.audible }));
    ok(aud3.club === true && aud3.nt === false, "retour au club : le club audible, la sélection muette (elle continue en silence)");

    // Le match national avance hors de sa page (aucune perte d'état).
    // (le chrono peut être à l'arrêt — temps mort, lancers — : on compte
    // les mises à jour de la vue par la minuterie du direct.)
    await p.evaluate(() => { const a = ntLiveState.rich.adapter, t = a.tick; window.__ticks = 0; a.tick = (...x) => { window.__ticks++; return t.apply(a, x); }; });
    await p.waitForTimeout(3000);
    const c3b = await p.evaluate(() => ({ ticks: window.__ticks, n: ntLiveState.rich.applied }));
    ok(c3b.ticks >= 10, `le direct national avance hors de sa page (${c3b.ticks} mises à jour en 3 s)`);
    const applied3 = c3b.n;

    // 4) Retour sur le direct national par son bandeau : rien n'est recréé.
    await p.click("#topbarNtLiveStrip");
    await p.waitForTimeout(800);
    const s4 = await p.evaluate(() => ({
      page: !document.getElementById("ntLiveSection").classList.contains("hidden"), tab: hmActiveTabKey,
      same: ntLiveState === window.__nt.st && ntLiveState.rich.view === window.__nt.view && ntLiveState.rich.adapter === window.__nt.adapter && ntLiveState.rich.items === window.__nt.items && ntLiveState.timer === window.__nt.timer,
      views: document.querySelectorAll("#ntLiveHost .hm-live").length, calls: window.__ntCalls,
      applied: ntLiveState.rich.applied, total: ntLiveState.rich.items.length,
      ids: (() => { const s = ntLiveState.rich.adapter.buildState(Date.now()); const ids = (s.events || []).map(e => e.id); return { n: ids.length, uniq: new Set(ids).size }; })(),
    }));
    ok(s4.page && s4.tab === "ntlive", "bandeau national → page du direct national");
    ok(s4.same && s4.views === 1 && s4.calls === 1, "même état, même vue, même file d'événements, même minuterie : aucune nouvelle simulation ni requête");
    ok(applied3 >= s3.applied && s4.applied >= applied3, `le match a continué hors de la page (${s3.applied} → ${s4.applied} actions)`);
    ok(s4.ids.n === s4.ids.uniq, `aucun événement en double dans la vue (${s4.ids.n} événements)`);
    const aud4 = await p.evaluate(() => ({ club: hmLive.view.audible, nt: window.__nt.view.audible }));
    ok(aud4.nt === true && aud4.club === false, "retour sur la sélection : elle seule est audible");

    // 5) Rouvrir le même direct depuis un bouton « Voir le direct » : la page existante.
    await p.evaluate(() => TAB_HANDLERS.club());
    await p.evaluate(id => HM_NATIONAL.openLive(id), nt.id);
    await p.waitForTimeout(500);
    const s5 = await p.evaluate(() => ({ page: !document.getElementById("ntLiveSection").classList.contains("hidden"), same: ntLiveState === window.__nt.st && ntLiveState.rich.view === window.__nt.view, calls: window.__ntCalls, views: document.querySelectorAll("#ntLiveHost .hm-live").length }));
    ok(s5.page && s5.same && s5.calls === 1 && s5.views === 1, "« Voir le direct » sur le même match : page existante réaffichée, rien de recréé");

    // 6) Un seul AudioContext pour les deux directs ; un seul audible.
    const au = await p.evaluate(() => ({ n: window.__ctxCount, core: window.HMAudio ? window.HMAudio.debug().wants : null }));
    ok(au.n <= 1, `un seul AudioContext pour le club et la sélection (${au.n})`);

    // 7) Retour navigateur : page précédente (club), le direct national reste ouvert.
    await p.goBack().catch(() => {});
    await p.waitForTimeout(600);
    const s7 = await p.evaluate(() => ({ nt: document.getElementById("ntLiveSection").classList.contains("hidden"), alive: ntLiveState === window.__nt.st }));
    ok(s7.nt && s7.alive, "retour navigateur : quitte la page du direct national sans l'arrêter");

    // 7b) Fenêtre spectateur d'un autre club par-dessus : inchangée, et
    // indépendante du direct national (qui reste ouvert, muet).
    await p.evaluate(d => showSpectateMatch(d.watchIdx, { data: d, url: "/api/spectate?team=" + d.watchIdx }), nt.data);
    await p.waitForTimeout(500);
    const s7b = await p.evaluate(() => ({ overlay: !!document.getElementById("spectateOverlay"), nt: ntLiveState === window.__nt.st && !window.__nt.st.closed, ntAud: window.__nt.view.audible, clubAud: hmLive.view.audible }));
    ok(s7b.overlay && s7b.nt, "fenêtre spectateur des autres clubs inchangée, le direct national reste ouvert");
    ok(s7b.ntAud === false && s7b.clubAud === false, "fenêtre ouverte : ni le club ni la sélection ne jouent par-dessus");
    await p.evaluate(() => closeSpectateMatch());
    const s7c = await p.evaluate(() => ({ nt: ntLiveState === window.__nt.st && !!ntLiveState.rich, overlay: !!document.getElementById("spectateOverlay") }));
    ok(s7c.nt && !s7c.overlay, "fermer la fenêtre ne ferme pas le direct national");

    // 8) « ← Retour » puis « Fermer le direct ».
    await p.click("#topbarNtLiveStrip");
    await p.waitForTimeout(300);
    await p.click("#ntLiveBackBtn");
    const s8 = await p.evaluate(() => ({ hidden: document.getElementById("ntLiveSection").classList.contains("hidden"), alive: ntLiveState === window.__nt.st }));
    ok(s8.hidden && s8.alive, "« ← Retour » : page précédente, direct toujours ouvert");
    await p.click("#topbarNtLiveStrip");
    await p.waitForTimeout(300);
    await p.click("#ntLiveCloseBtn");
    await p.waitForTimeout(400);
    const s9 = await p.evaluate(() => ({
      state: ntLiveState, hidden: document.getElementById("ntLiveSection").classList.contains("hidden"),
      strip: document.getElementById("topbarNtLiveStrip").classList.contains("hidden"),
      empty: !document.getElementById("ntLiveHost").firstChild, closed: window.__nt.st.closed,
      club: hmLive.view === window.__clubView,
    }));
    ok(s9.state === null && s9.hidden && s9.strip && s9.empty && s9.closed, "« Fermer le direct » : vue détruite, minuterie arrêtée, page vidée, bandeau retiré");
    ok(s9.club, "le direct du club n'est pas touché");

    // 10) Téléphone (390×844) : page sans débordement horizontal.
    await p.setViewportSize({ width: 390, height: 844 });
    await p.evaluate(id => HM_NATIONAL.openLive(id), nt.id);
    await p.waitForFunction(() => ntLiveState && ntLiveState.rich && ntLiveState.rich.view, null, { timeout: 15000 });
    await p.waitForTimeout(1200);
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, page: !document.getElementById("ntLiveSection").classList.contains("hidden"), overlay: !!document.querySelector(".spectate-overlay") }));
    ok(m.page && !m.overlay && m.sw <= m.cw + 1, `téléphone : page du direct national sans fenêtre ni débordement (${m.sw}/${m.cw})`);
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
    ok(errors.length === 0, "aucune erreur JavaScript" + (errors.length ? " : " + errors.slice(0, 3).join(" | ") : ""));
  } catch (e) { console.error(e); code = 1; }
  await b.close(); server.close();
  if (!code) console.log("\n🏁 national_live_tab_test.js : direct national dans un vrai onglet, comme le club.");
  process.exit(code);
})().catch(e => { console.error(e); process.exit(1); });
