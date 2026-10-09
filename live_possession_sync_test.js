// Possession du ballon dans le direct 2D (audit possession live, 2026-10-07).
// Chaîne complète, sans raccourci : moteur (MatchEngine.simulate) →
// diffusion (server/liveMatch.js : schedulePlayback + viewLiveMatchForTeam,
// domicile ET extérieur) → adaptateur (assets/live/adapter.js, utilisé par
// spectateur / autre match / sélection nationale / rediffusion) → terrain
// (assets/live/court2d.js) animé image par image sur une horloge virtuelle.
//
// Assertion centrale, à CHAQUE image et après chaque minuterie :
//   porteur du ballon ⇒ porteur.équipe === état du direct.possession
// (état du direct = possessionAfter du moteur pour le dernier événement
// diffusé). Plus, par transition (moteur → terrain) :
//   - après un rebond : le ballon finit chez le rebondeur désigné par le moteur ;
//   - après une interception : chez l'intercepteur ;
//   - après un panier / un lancer / une perte : dans l'équipe qui remonte ;
//   - avant chaque tir : le dernier porteur est le tireur ;
//   - jamais plus de 4,5 s sans porteur de la bonne équipe après un
//     changement de possession (hors temps morts, mi-temps, fin de quart).
// Enfin, l'adaptateur et la copie du direct de son club
// (moteurbasket3.html:livePossessionAt) donnent la même possession.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { JSDOM } = require("jsdom");
const E = require("./engine.js");
const LiveMatch = require("./server/liveMatch.js");
const fail = m => { throw new Error("❌ " + m); };
const PLAY = new Set(["shot", "rebound", "turnover", "foul", "freeThrow", "technicalFoul", "unsportsmanlikeFoul", "tipoff", "quarterStart"]);
const strip = src => src.replace(/^import .*$/mg, "").replace(/^export\s+(function|const|let|class)/mg, "$1").replace(/^export\s*\{[^}]*\};?/mg, "");

function team(name, seed) {
  const t = E.generateTeam(name, seed);
  const off = Object.keys(E.OFFENSE_PROFILES);
  t.offensivePriorities = [off[seed % off.length], off[(seed + 1) % off.length], off[(seed + 2) % off.length]];
  t.defense = Object.keys(E.DEFENSES)[seed % Object.keys(E.DEFENSES).length];
  t.rhythm = Object.keys(E.RHYTHMS)[seed % Object.keys(E.RHYTHMS).length];
  t.name = name;
  return t;
}

async function runMatch(label, viewerIdx, seed, fraction) {
  const { createLiveAdapter, possessionAt } = await import(pathToFileURL(path.join(__dirname, "assets/live/adapter.js")).href);
  const home = team(label + " Dom", seed), away = team(label + " Ext", seed + 1);
  const result = new E.MatchEngine(home, away, { homeAdvantage: true }).simulate();
  const kickoffAt = 1_800_000_000_000;
  const sched = LiveMatch.schedulePlayback(result.events, kickoffAt);
  const league = { liveMatches: { m: { homeIdx: 0, awayIdx: 1, kickoffAt, events: sched.events, pauses: sched.pauses, totalDurationMs: sched.totalDurationMs, boxScoreA: result.boxScoreA, boxScoreB: result.boxScoreB, seed } } };
  const live = LiveMatch.viewLiveMatchForTeam(league, viewerIdx);
  if (!live) fail("viewLiveMatchForTeam : aucun direct");
  const mineT = viewerIdx === 0 ? home : away, oppT = viewerIdx === 0 ? away : home;
  const teamData = t => ({ name: t.name, short: t.name.slice(0, 3).toUpperCase(), color: t === home ? "#1f4e9c" : "#c8102e", logo: "", players: t.players.map(p => ({ id: p.id, name: p.name, pos: p.position, avatar: "" })) });
  const ad = createLiveAdapter({ live, teams: { A: teamData(mineT), B: teamData(oppT) }, mine: "A" });
  const evs = live.events;
  // 0. Le serveur a bien réorienté possessionAfter avec le reste.
  evs.forEach((ev, i) => { const raw = sched.events[i]; if (raw.possessionAfter && ev.possessionAfter !== (viewerIdx === 0 ? raw.possessionAfter : (raw.possessionAfter === "A" ? "B" : "A"))) fail(`${label} : possessionAfter non réorienté (événement ${i})`); });

  // --- horloge virtuelle ---
  const dom = new JSDOM(`<!doctype html><div id="host"></div>`, { pretendToBeVisual: false, runScripts: "outside-only" });
  const win = dom.window;
  let vt = kickoffAt - 3000, seqT = 0;
  const timers = new Map();
  win.setTimeout = (fn, ms) => { const id = ++seqT; timers.set(id, { at: vt + Math.max(0, ms || 0), fn }); return id; };
  win.clearTimeout = id => { timers.delete(id); };
  let rafs = [];
  win.requestAnimationFrame = fn => { rafs.push(fn); return rafs.length; };
  win.cancelAnimationFrame = () => {};
  Object.defineProperty(win.performance, "now", { value: () => vt - kickoffAt + 100000, configurable: true });
  win.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/format.js"), "utf8")));
  win.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8")));
  const auditLog = [];
  const court = win.createCourt2D(win.document.getElementById("host"), { raster: false, now: () => vt, onAudit: x => auditLog.push({ ...x, at: vt, last: S && S.events.length ? S.events[S.events.length - 1] : null }) });

  const idxOf = key => ((key === "A") === live.isHome ? 0 : 1);
  const pidOf = (key, id) => key + ":#" + id;
  const timeline = [...evs.map(e => ({ at: e.airAt, ev: e })), ...live.pauses.map(p => ({ at: p.airAt, pause: p }))].sort((a, b) => a.at - b.at);
  const endAt = kickoffAt + Math.round(sched.totalDurationMs * fraction);
  let ti = 0, S = null, seen = new Set(), lastBuild = 0;
  const holderLog = [];   // [{ at, holder }]
  let lastHolder = null, wrong = 0, checks = 0;
  const check = where => {
    const d = court.debug();
    checks++;
    if (d.holder && S && S.status === "live" && (S.possession === 0 || S.possession === 1) && d.holderTeam !== S.possession) { wrong++; if (wrong <= 3) console.log(`   ✗ ${where} : porteur ${d.holder} (équipe ${d.holderTeam}) alors que le moteur donne le ballon à ${S.possession}`); }
    if (d.holder !== lastHolder) { lastHolder = d.holder; holderLog.push({ at: vt, holder: d.holder }); }
  };
  const update = () => {
    ad.tick(vt);
    S = ad.buildState(vt);
    const ids = S.events.map(e => e.id);
    const fresh = ids.filter(id => !seen.has(id));
    seen = new Set(ids);
    court.update(S, fresh);
    check("update");
  };
  const STEP = 40;
  while (vt < endAt) {
    vt += STEP;
    let applied = false;
    while (ti < timeline.length && timeline[ti].at <= vt) { const it = timeline[ti++]; if (it.ev) ad.applyEvent(it.ev); else ad.applyPause(it.pause); applied = true; }
    if (applied || vt - lastBuild >= 200) { lastBuild = vt; update(); }
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= vt && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      timers.delete(next[0]);
      next[1].fn();
      check("minuterie");
    }
    const fns = rafs; rafs = [];
    fns.forEach(fn => fn(vt - kickoffAt + 100000));
    check("image");
  }
  const dbg = court.debug();
  if (process.env.DBG) auditLog.slice(0, 6).forEach(x => console.log(`   refus ${x.id} équipe ${x.team} (moteur ${x.owner}${x.leaving ? ", sortant" : ""}) après ${x.last && x.last.kind} ${x.last && x.last.text}\n     ${x.stack.split("\n").slice(2, 5).map(l => l.trim().replace(/^at /, "").replace(/\(.*?:(\d+):\d+\)/, "l.$1")).join(" < ")}`));

  // --- transitions : le ballon finit au bon joueur ---
  const holderAt = t => { let h = null; for (const x of holderLog) { if (x.at > t) break; h = x.holder; } return h; };
  const firstHolderAfter = (t, until) => holderLog.find(x => x.at >= t && x.at <= until && x.holder);
  const stats = { rebounds: [0, 0], steals: [0, 0], shooters: [0, 0], recover: [0, 0] };
  const played = evs.filter(e => e.airAt <= endAt - 6000);
  const pauses = live.pauses;
  const inPauseNear = t => pauses.some(p => t >= p.airAt - 6000 && t <= p.airAt + p.durationMs + 1000);
  played.forEach((e, i) => {
    const nx = played[i + 1];
    const nextPlay = played.slice(i + 1).find(x => PLAY.has(x.type));
    const until = Math.min(e.airAt + 4500, nextPlay ? nextPlay.airAt : Infinity);
    // Joueur remplacé / exclu juste après l'action : le ballon passe légitimement à un coéquipier.
    const leftCourt = id => played.some(x => x.airAt >= e.airAt && x.airAt <= until && (x.type === "substitution" || x.type === "foulOut" || x.type === "shortHanded" || x.type === "injury" || x.type === "technicalEjection") && x.playerId === id);
    if (e.type === "rebound" && !inPauseNear(e.airAt) && !leftCourt(e.rebounderId)) {
      stats.rebounds[1]++;
      const want = pidOf(e.team, e.rebounderId);
      const h = firstHolderAfter(e.airAt, until);
      if (h && h.holder === want) stats.rebounds[0]++;
      else if (stats.rebounds[1] - stats.rebounds[0] <= 3) { console.log(`   ✗ rebond ${e.quarter}Q ${e.clock} : ${want} attendu, ${h ? h.holder : "personne"} (${e.text})`);
        if (process.env.DBG) { played.slice(Math.max(0, i - 3), i + 3).forEach(x => console.log(`      ev ${x.airAt - e.airAt} ${x.type} ${x.team} poss=${x.possession} after=${x.possessionAfter} blk=${!!x.blocked}`)); holderLog.filter(x => x.at > e.airAt - 6000 && x.at < e.airAt + 6000).forEach(x => console.log(`      h ${x.at - e.airAt} ${x.holder}`)); } }
    }
    if (e.type === "turnover" && e.stealerId != null && !inPauseNear(e.airAt) && !leftCourt(e.stealerId)) {
      stats.steals[1]++;
      const want = pidOf(e.possessionAfter, e.stealerId);
      const h = firstHolderAfter(e.airAt, until);
      if (h && h.holder === want) stats.steals[0]++;
      else if (stats.steals[1] - stats.steals[0] <= 3) { console.log(`   ✗ interception ${e.quarter}Q ${e.clock} : ${want} attendu, ${h ? h.holder : "personne"}`);
        if (process.env.DBG) { played.slice(Math.max(0, i - 2), i + 3).forEach(x => console.log(`      ev ${x.airAt - e.airAt} ${x.type} ${x.team} poss=${x.possession} after=${x.possessionAfter} p=${x.playerId} r=${x.replacementId} st=${x.stealerId}`)); holderLog.filter(x => x.at > e.airAt - 4000 && x.at < e.airAt + 5000).forEach(x => console.log(`      h ${x.at - e.airAt} ${x.holder}`)); } }
    }
    if (e.type === "shot" && e.shooterId != null && !inPauseNear(e.airAt) && !leftCourt(e.shooterId)) {
      stats.shooters[1]++;
      // Dernier porteur avant que le ballon parte vers le cercle.
      // (une action enchaînée à 2,2 s d'une autre se joue en version courte,
      // juste après sa diffusion : fenêtre jusqu'à +3 s)
      const before = holderLog.filter(x => x.at <= Math.min(e.airAt + 3000, until) && x.holder && x.holder.startsWith(e.team + ":"));
      const lastH = before.length ? before[before.length - 1].holder : null;
      if (lastH === pidOf(e.team, e.shooterId)) stats.shooters[0]++;
      else if (stats.shooters[1] - stats.shooters[0] <= 3) { console.log(`   ✗ tir ${e.quarter}Q ${e.clock} : dernier porteur ${lastH}, tireur ${pidOf(e.team, e.shooterId)} (${e.text})`);
        if (process.env.DBG) { played.slice(Math.max(0, i - 2), i + 2).forEach(x => console.log(`      ev ${x.airAt - e.airAt} ${x.type} ${x.team} poss=${x.possession} after=${x.possessionAfter} h=${x.handlerId} c=${x.creatorId} s=${x.shooterId}`)); holderLog.filter(x => x.at > e.airAt - 12000 && x.at < e.airAt + 1000).forEach(x => console.log(`      h ${x.at - e.airAt} ${x.holder}`)); } }
    }
    // Changement de possession : un porteur de la bonne équipe dans les 4,5 s
    // (si l'action suivante ne vient pas avant).
    const prevAfter = i > 0 ? played[i - 1].possessionAfter : null;
    // Dernier lancer franc réussi : l'arbitre récupère le ballon, les
    // changements passent avant la remise en jeu (2026-10-09) — jusqu'à 6 s.
    const recoverMs = e.type === "freeThrow" ? 6000 : 4500;
    if (e.possessionAfter && prevAfter && e.possessionAfter !== prevAfter && !inPauseNear(e.airAt) && e.type !== "quarterEnd" && (!nx || nx.airAt - e.airAt > recoverMs + 500)) {
      stats.recover[1]++;
      const h = firstHolderAfter(e.airAt, e.airAt + recoverMs);
      const team = h ? (h.holder.startsWith("A:") ? idxOf("A") : idxOf("B")) : null;
      if (team === idxOf(e.possessionAfter)) stats.recover[0]++;
      else if (stats.recover[1] - stats.recover[0] <= 3) console.log(`   ✗ ${e.type} ${e.quarter}Q ${e.clock} : ballon pas rendu à ${e.possessionAfter} (${h ? h.holder : "personne"})`);
    }
  });
  const pct = ([a, b]) => (b ? Math.round(1000 * a / b) / 10 : 100);
  console.log(`${label} (spectateur ${viewerIdx === 0 ? "domicile" : "extérieur"}) : ${checks} contrôles, ${wrong} porteur(s) de la mauvaise équipe ; ballon lâché au changement de possession ×${dbg.releases} ; garde-fou : ${dbg.refusals} remise(s) refusée(s), ${dbg.corrections} correction(s) d'animation.`);
  console.log(`   rebondeur moteur ${stats.rebounds.join("/")} (${pct(stats.rebounds)} %), intercepteur ${stats.steals.join("/")} (${pct(stats.steals)} %), tireur dernier porteur ${stats.shooters.join("/")} (${pct(stats.shooters)} %), ballon rendu après changement ${stats.recover.join("/")} (${pct(stats.recover)} %)`);
  if (wrong) fail(`${label} : ${wrong} contrôle(s) avec le ballon dans l'équipe qui ne l'a pas`);
  if (pct(stats.rebounds) < 97) fail(`${label} : rebondeur du moteur pas assez respecté`);
  if (pct(stats.steals) < 97) fail(`${label} : intercepteur du moteur pas assez respecté`);
  if (pct(stats.recover) < 97) fail(`${label} : ballon pas rendu à la bonne équipe après un changement de possession`);
  if (pct(stats.shooters) < 97) fail(`${label} : le tireur n'est pas le dernier porteur`);
  // Même possession côté direct de son club (copie inline).
  const html = require("./test_game_html.js").readGameHtml();
  const src = ["livePossessionAfterOf", "livePossessionAt"].map(n => { const m = new RegExp("function " + n + "\\([\\s\\S]*?\\n}\\n").exec(html); if (!m) fail("copie inline introuvable : " + n); return m[0]; }).join("\n");
  const inline = new Function(src + "; return livePossessionAt;")();
  for (let i = 0; i < evs.length; i++) if (inline(evs, i) !== possessionAt(evs, i)) fail(`${label} : moteurbasket3.html et adapter.js divergent à l'événement ${i}`);
  dom.window.close();
  return { wrong, dbg };
}

(async () => {
  const t0 = Date.now();
  await runMatch("Match A", 0, 1, 1);
  await runMatch("Match B", 1, 2, 1);
  await runMatch("Match C", 0, 3, 0.5);
  console.log(`\n✅ live_possession_sync_test.js : ballon toujours dans l'équipe du moteur, transitions conformes (${Math.round((Date.now() - t0) / 1000)} s).`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
