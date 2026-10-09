// Moments forts du direct (2026-10-09, assets/live/highlights.js) sur un
// VRAI match du moteur diffusé par schedulePlayback, état de l'adaptateur,
// vue live-view.js (JSDOM) :
//  - « 3 POINTS » pour chaque 3 points réussi (et seulement ceux-là) ;
//  - « ON FIRE » : 6 paniers d'affilée d'un joueur sans tir manqué et ≥ 14
//    points, une fois par série ;
//  - jamais rejoué : re-rendu, reconnexion (arrivée en cours de match),
//    saut dans le temps ;
//  - titre / coupe au coup de sifflet final d'une finale (trophyFor) ;
//  - calque non cliquable (commandes du match utilisables).
const path = require("path");
const { pathToFileURL } = require("url");
const { JSDOM } = require("jsdom");
const E = require("./engine.js");
const LM = require("./server/liveMatch.js");
const ok = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };

(async () => {
  const { createLiveAdapter } = await import(pathToFileURL(path.join(__dirname, "assets/live/adapter.js")).href);
  const { createLiveView } = await import(pathToFileURL(path.join(__dirname, "assets/live/live-view.js")).href);
  const home = E.generateTeam("Lyon Basket", 1), away = E.generateTeam("Rennes Club", 1);
  home.name = "Lyon Basket"; away.name = "Rennes Club";
  const res = new E.MatchEngine(home, away, { homeAdvantage: true }).simulate();
  const K = 1_800_000_000_000;
  const sched = LM.schedulePlayback(res.events, K);
  const live = { isHome: true, kickoffAt: K, events: sched.events, pauses: sched.pauses, totalDurationMs: sched.totalDurationMs, boxScoreA: res.boxScoreA, boxScoreB: res.boxScoreB, seed: 1 };
  const td = t => ({ name: t.name, short: t.name.slice(0, 3).toUpperCase(), color: t === home ? "#e8892e" : "#3B8FE0", logo: "", players: t.players.map(p => ({ id: p.id, name: p.name, pos: p.position, avatar: "" })) });
  const mk = (trophy) => {
    const ad = createLiveAdapter({ live, teams: { A: td(home), B: td(away) }, mine: "A" });
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
    const root = dom.window.document.getElementById("root");
    const moments = [];
    const view = createLiveView(root, { court2d: false, trophyFor: trophy ? () => trophy : undefined });
    const orig = view.highlights.trigger;
    // Compte les moments réellement déclenchés (clé unique).
    const seen0 = view.highlights.seen;
    const tl = [...live.events.map(e => ({ at: e.airAt, ev: e })), ...live.pauses.map(p => ({ at: p.airAt, pause: p }))].sort((a, b) => a.at - b.at);
    let ti = 0;
    const at = now => { while (ti < tl.length && tl[ti].at <= now) { const it = tl[ti++]; if (it.ev) ad.applyEvent(it.ev); else ad.applyPause(it.pause); } ad.tick(now); const S = ad.buildState(now); view.update(S); return S; };
    return { ad, view, root, at, dom, seen: seen0, moments, orig };
  };

  // --- Règles attendues, calculées directement sur les événements du moteur ---
  const evs = sched.events;
  const threes = evs.filter(e => e.type === "shot" && e.made && e.zone === "three").length;
  let expectedFire = 0; const st = {};
  for (const e of evs) {
    if (e.type !== "shot" || !e.shooter) continue;
    const k = e.team + ":" + e.shooter, s = st[k] || (st[k] = { m: 0, p: 0, f: false });
    if (e.made) { s.m++; s.p += e.zone === "three" ? 3 : 2; if (!s.f && s.m >= 6 && s.p >= 14) { s.f = true; expectedFire++; } } else { s.m = 0; s.p = 0; s.f = false; }
  }

  // --- Match suivi du début à la fin, seconde par seconde ---
  const A = mk({ kind: "cup", label: "Coupe", key: "cup-final" });
  for (let t = K - 1000; t <= K + sched.totalDurationMs + 2000; t += 3000) A.at(t);
  A.ad.finish(); A.at(K + sched.totalDurationMs + 2500);   // coup de sifflet final (comme le direct)
  const keys = A.view.highlights.fired.map(m => m.key);
  const n3 = keys.filter(k => k.startsWith("3:")).length, nF = keys.filter(k => k.startsWith("fire:")).length;
  ok(n3 === threes, `« 3 POINTS » : ${n3} déclenchements pour ${threes} tirs à 3 points réussis`);
  ok(nF === expectedFire, `« ON FIRE » : ${nF} séries (6 paniers d'affilée, ≥ 14 pts, une fois par série) — attendu ${expectedFire}`);
  ok(keys.includes("trophy:cup-final"), "coup de sifflet final d'une finale : célébration de la coupe");
  await new Promise(r => setTimeout(r, 9000));   // file d'attente : la célébration passe après les derniers moments
  const cup = A.root.querySelector(".hl-cup");
  ok(cup && /VAINQUEUR/.test(cup.textContent) && cup.querySelector(".hl-trophy svg") && /Coupe/.test(cup.textContent), "célébration : trophée, équipe gagnante, compétition");
  const layer = A.root.querySelector(".hl-layer");
  ok(layer && /pointer-events:none/.test(require("fs").readFileSync("assets/live/live.css", "utf8").replace(/\s/g, "")), "calque des moments forts non cliquable (commandes du match utilisables)");
  // Re-rendus : aucun nouveau déclenchement.
  const before = A.view.highlights.fired.length;
  for (let i = 0; i < 5; i++) A.at(K + sched.totalDurationMs + 3000 + i * 1000);
  ok(A.view.highlights.fired.length === before, "re-rendus après la fin : rien n'est rejoué");

  // --- Arrivée en cours de match (reconnexion) : rien de déjà passé ---
  const B = mk(null);
  const mid = K + Math.round(sched.totalDurationMs / 2);
  B.at(mid);
  const triggeredAtJoin = B.view.highlights.fired.length;
  ok(triggeredAtJoin === 0, "arrivée en cours de match : aucune animation pour les actions déjà passées");
  // Saut dans le temps (beaucoup d'actions d'un coup) : pas de rafale.
  B.at(mid + 15 * 60 * 1000);
  ok(B.view.highlights.fired.length === 0, "saut dans le temps (rediffusion) : pas de rafale d'animations");
  // Puis les nouvelles actions en direct sont bien célébrées.
  for (let t = mid + 15 * 60 * 1000; t <= K + sched.totalDurationMs; t += 3000) B.at(t);
  B.ad.finish(); B.at(K + sched.totalDurationMs + 2500);
  const later3 = B.view.highlights.fired.filter(m => m.kind === "three").length;
  const real3 = sched.events.filter(e => e.type === "shot" && e.made && e.zone === "three" && e.airAt > mid + 15 * 60 * 1000).length;
  ok(later3 === real3, `ensuite, les 3 points en direct sont célébrés (${later3} / ${real3})`);
  // Match sans trophée : pas de célébration.
  ok(!B.view.highlights.fired.some(m => m.key.startsWith("trophy:")), "match sans enjeu de trophée : pas de célébration");
  console.log("\n🏁 live_highlights_test.js : moments forts du direct.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
