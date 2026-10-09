// Direct des matchs de ligue privée (retour utilisateur 2026-10-01 : « il
// faut ajouter le live sur les matchs de ligue privée »). Ligue privée de 4
// clubs lancée, on se place 5 minutes après le coup d'envoi de la J1 :
// - le score est caché (Calendrier, ligue privée) et un bouton « Voir le
//   direct » apparaît (calendrier de la ligue, carte du prochain match,
//   Calendrier général) ;
// - son propre match s'ouvre sur l'écran Live habituel, au bon moment du
//   match (pas depuis le début), avec « Ligue privée · nom · Journée 1 » ;
// - le match des deux autres membres s'ouvre dans la fenêtre spectateur ;
// - un non-membre ne peut pas le voir ;
// - une fois la diffusion finie : score visible, et « Revoir le direct »
//   depuis la feuille de match rejoue le match depuis le début.
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const store = require("./server/store.js");
const PL = require("./server/privateLeague.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();

function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, tries = 100) {
  for (let i = 0; i < tries; i++) { let v; try { v = fn(); } catch (e) { v = null; } if (v) return v; await sleep(50); }
  throw new Error("❌ délai dépassé : " + label);
}

(async () => {
  let now = Calendar.parisEpochForLocalTime(2026, 9, 30, 9);
  const names = ["Alpha LP", "Bravo LP", "Charlie LP", "Delta LP", "Echo LP"];
  const league = Engine.generateMultiManagerLeague(names, names.length, now, Calendar.dailyAnchoredCalendarConfig());
  const humans = league.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
  humans.forEach(i => { league.teams[i].isPaying = true; });
  const [A, B, C, D, E] = humans;
  // Ligues privées « monde » (2026-10-02) : la ligue est rangée au niveau du
  // monde (stock « privateleagues »), membres = références de club ; les
  // matchs y sont notés par place dans `members` (toLocal : index du club).
  const lpStore = PL.emptyStore();
  const me = i => ({ league, idx: i, ref: PL.refFor(store.HISTORIC_LEAGUE_ID, league, i, "Division I") });
  let r = PL.createPrivateLeague(Engine, lpStore, me(A), { name: "Coupe des Potes", size: 4, venue: "home" }, now);
  const lp = lpStore.list[0];
  [B, C, D].forEach(i => { r = PL.joinPrivateLeague(Engine, lpStore, me(i), { code: lp.code }, now); });
  check(lp.status === "running", "ligue privée de 4 clubs lancée (E n'en fait pas partie)");
  const tokens = league.teams.map(t => t.managerLinkToken);
  const kickoff = lp.rounds[0].dueAt;
  const toLocal = m => ({ home: lp.members[m.home].idx, away: lp.members[m.away].idx });
  const slotA = lp.members.findIndex(x => x.idx === A);
  const rawMine = lp.rounds[0].matches.find(m => m.home === slotA || m.away === slotA);
  const myMatch = toLocal(rawMine);
  const other = toLocal(lp.rounds[0].matches.find(m => m !== rawMine));

  const { server, multiSavePath, baseUrl } = await startTestServer(() => now);
  const root = baseUrl.replace(/\/$/, "");
  await store.saveMultiLeague(league, multiSavePath);
  await PL.saveStore(lpStore, multiSavePath);
  // Émission d'avant-match (sans pronostics) : ouverte 5 min avant.
  now = kickoff - 2 * 60 * 1000;
  const api = async (path, tok) => { const r = await fetch(root + path, { headers: { "X-TipIn-Token": tok } }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const pre = await api(`/api/shows/lp/prematch?lp=${lp.id}&round=0`, tokens[A]);
  check(pre.status === 200 && pre.body.kind === "prematch" && pre.body.segments.length > 2, "émission d'avant-match du match de ligue privée disponible 2 min avant");
  check(!pre.body.segments.some(sg => sg.type === "pronostics") && !pre.body.pronostics, "aucun pronostic dans l'émission de ligue privée");
  check(JSON.stringify(pre.body).includes("COUPE DES POTES"), "l'émission porte le nom de la ligue privée");
  check((await api(`/api/shows/lp/prematch?lp=${lp.id}&round=0`, tokens[E])).status === 404, "émission refusée hors de la ligue privée");
  const domPre = await openGame(html, `${baseUrl}?m=${tokens[A]}`, w => { const o = w.Date.now.bind(w.Date); const off = now - o(); w.Date.now = () => o() + off; });
  await waitFor(() => domPre.window.eval("typeof league !== \"undefined\" && league && (league.privateLeagues || []).length"), "ligues privées (avant-match)");
  [...domPre.window.document.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "lp").click();
  await sleep(100);
  check(!!domPre.window.document.querySelector("#lpContent [data-lp-show]"), "bouton « Émission d'avant-match » sur la carte du prochain match");
  domPre.window.close();

  now = kickoff + 5 * 60 * 1000;

  // --- A, 5 minutes après le coup d'envoi.
  const dom = await openGame(html, `${baseUrl}?m=${tokens[A]}`);
  const win = dom.window, doc = win.document;
  await waitFor(() => win.eval("typeof league !== \"undefined\" && league && (league.privateLeagues || []).length"), "ligues privées chargées");
  const lpView = win.eval("league.privateLeagues[0]");
  const m1 = lpView.rounds[0].matches.find(m => m.home === myMatch.home);
  check(m1.live && !m1.played && m1.scoreHome === null && m1.boxScoreHome === null, "pendant le direct : match « live », score et feuille cachés au navigateur");
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "calendrier").click();
  await sleep(100);
  check(!!doc.querySelector(`#calendrierSection [data-lp-live="${lp.id}"]`), "Calendrier général : bouton « Voir le direct » sur le match de ligue privée");
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "lp").click();
  await sleep(100);
  doc.querySelector('#lpContent [data-lp-filter="all"]').click();
  await sleep(50);
  check(doc.querySelectorAll("#lpContent [data-lp-live]").length >= 3, "page Ligue privée : direct proposé sur les 2 matchs de la journée + carte « Prochain match »");
  check(!/\d+ – \d+/.test(doc.querySelector("#lpContent .lp-cal-rows").textContent), "aucun score affiché pendant le direct");

  // Son propre match : écran Live, déjà 5 minutes de jeu diffusées.
  doc.querySelector(`#lpContent .lp-cal-row [data-lp-live][data-lp-home="${myMatch.home}"]`).click();
  await win.__lastLpLive;
  await waitFor(() => win.eval("currentLiveMatch && currentLiveMatch.privateLeague"), "direct de ligue privée ouvert");
  check(!doc.getElementById("liveSection").classList.contains("hidden"), "son propre match : écran Live habituel");
  check(win.eval("currentLiveMatch.kickoffAt") === kickoff && !win.eval("currentLiveMatch.replay"), "horaires réels : on rejoint le match en cours (pas un replay)");
  const meta = win.eval("hmLiveMeta()");
  check(meta.competition === "Ligue privée · Coupe des Potes" && meta.round === "Journée 1", `en-tête du direct : ${meta.competition} · ${meta.round}`);
  const aired = win.eval(`currentLiveMatch.events.filter(e => e.airAt <= ${now}).length`);
  check(aired > 5, `déjà ${aired} actions diffusées au moment où on arrive`);

  // Match des deux autres membres : fenêtre spectateur.
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "lp").click();
  await sleep(100);
  if (!doc.querySelector(`#lpContent [data-lp-live][data-lp-home="${other.home}"]`)) { doc.querySelector('#lpContent [data-lp-filter="all"]').click(); await sleep(50); }
  doc.querySelector(`#lpContent [data-lp-live][data-lp-home="${other.home}"]`).click();
  await win.__lastLpLive;
  await waitFor(() => doc.getElementById("spectateOverlay"), "fenêtre spectateur ouverte");
  const ov = doc.getElementById("spectateOverlay").textContent;
  check(/En direct/.test(ov) && ov.includes(league.teams[other.home].name) && /Ligue privée · Coupe des Potes · Journée 1/.test(ov), "match des autres membres : fenêtre spectateur « En direct » avec le nom de la ligue");
  doc.getElementById("spectateCloseBtn").click();

  // Mi-temps : émission sans pronostics pendant la pause.
  const halftime = win.eval("currentLiveMatch.pauses.find(p => p.kind === 'halftime')");
  const saveNow = now;
  now = halftime.airAt + 30 * 1000;
  const ht = await api(`/api/shows/lp/halftime?lp=${lp.id}&round=0`, tokens[A]);
  check(ht.status === 200 && ht.body.kind === "halftime" && !ht.body.segments.some(sg => sg.type === "pronostics"), "émission de mi-temps du match de ligue privée, sans pronostics");
  now = halftime.airAt - 60 * 1000;
  check((await api(`/api/shows/lp/halftime?lp=${lp.id}&round=0`, tokens[A])).status === 404, "pas d'émission de mi-temps avant la pause");
  now = saveNow;

  // Non-membre : refusé.
  const resE = await fetch(`${root}/api/private-league/live?lp=${lp.id}&round=0&home=${myMatch.home}&away=${myMatch.away}`, { headers: { "X-TipIn-Token": tokens[E] } });
  const bodyE = await resE.json();
  check(resE.status === 404 && /introuvable/.test(bodyE.error), "un club hors de la ligue privée ne peut pas voir le direct");
  const resA = await fetch(`${root}/api/private-league/live?lp=${lp.id}&round=0&home=${myMatch.home}&away=${myMatch.away}`, { headers: { "X-TipIn-Token": tokens[A] } });
  check(resA.status === 200, "un membre, si (même route)");

  // --- Après la diffusion.
  now = kickoff + 3 * 3600 * 1000;
  const dom2 = await openGame(html, `${baseUrl}?m=${tokens[A]}`);
  const w2 = dom2.window, d2 = w2.document;
  await waitFor(() => w2.eval("typeof league !== \"undefined\" && league && (league.privateLeagues || []).length"), "ligues privées rechargées");
  const m2 = w2.eval("league.privateLeagues[0]").rounds[0].matches.find(m => m.home === myMatch.home);
  check(m2.played && !m2.live && Number.isFinite(m2.scoreHome), `après le direct : score visible (${m2.scoreHome}-${m2.scoreAway})`);
  w2.eval(`showPrivateLeagueBoxscore(league.privateLeagues[0], 0, ${myMatch.home}, ${myMatch.away})`);
  const replayBtn = await waitFor(() => d2.getElementById("matchReplayBtn"), "bouton « Revoir le direct » sur la feuille de match");
  replayBtn.click();
  await waitFor(() => w2.eval("currentLiveMatch && currentLiveMatch.replay && currentLiveMatch.privateLeague"), "replay lancé");
  check(w2.eval("currentLiveMatch.kickoffAt") > now, "« Revoir le direct » : le match repart du début");

  server.close();
  console.log("✅ Direct des ligues privées vérifié.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
