// Adaptateur générique du direct (assets/live/adapter.js, audit live 2D
// 2026-10-07) : à partir d'un match RÉEL du moteur diffusé par
// schedulePlayback, il doit produire l'état de live-view/court2d sans rien
// savoir de « mon club » : cinq en jeu, feuille alimentée par les deltas du
// moteur (somme des points = score), acteurs par id, prochaine action sans
// résultat, chrono et chrono des 24 s, repère domicile/extérieur pour un
// spectateur à l'extérieur, et fonctionnement avec des équipes « nationales »
// (noms et couleurs arbitraires, pas de parquet Premium).
const path = require("path");
const { pathToFileURL } = require("url");
const E = require("./engine.js");
const LiveMatch = require("./server/liveMatch.js");
function fail(msg) { throw new Error("❌ " + msg); }

(async () => {
  const { createLiveAdapter } = await import(pathToFileURL(path.join(__dirname, "assets/live/adapter.js")).href);
  const home = E.generateTeam("France", 1), away = E.generateTeam("Espagne", 1);
  home.name = "France"; away.name = "Espagne";
  const result = new E.MatchEngine(home, away, { homeAdvantage: true }).simulate();
  const kickoffAt = 1_800_000_000_000;
  const sched = LiveMatch.schedulePlayback(result.events, kickoffAt);
  // Payload tel que le serveur le livre à un spectateur À L'EXTÉRIEUR : A = Espagne.
  const swap = k => (k === "A" ? "B" : k === "B" ? "A" : k);
  const events = sched.events.map(ev => ({ ...ev, ...(ev.team !== undefined ? { team: swap(ev.team) } : null), ...(ev.possession !== undefined ? { possession: swap(ev.possession) } : null),
    ...(ev.score !== undefined ? { score: { A: ev.score.B, B: ev.score.A } } : null), ...(ev.delta !== undefined ? { delta: { ...(ev.delta.B ? { A: ev.delta.B } : null), ...(ev.delta.A ? { B: ev.delta.A } : null) } } : null) }));
  const live = { isHome: false, kickoffAt, events, pauses: sched.pauses, totalDurationMs: sched.totalDurationMs, boxScoreA: result.boxScoreB, boxScoreB: result.boxScoreA, seed: 1 };
  const teamData = t => ({ name: t.name, short: t.name.slice(0, 3).toUpperCase(), color: t === home ? "#1f4e9c" : "#c8102e", logo: "", players: t.players.map(p => ({ id: p.id, name: p.name, pos: p.position, avatar: "" })) });
  const ad = createLiveAdapter({ live, teams: { A: teamData(away), B: teamData(home) }, mine: null, presenter: { name: "Nicolas Cosset", avatar: "" } });

  // Diffusion jusqu'à mi-parcours.
  // Instant pris en plein jeu (match non seedé : à 30 % pile, on peut tomber
  // juste après un « Début du quart-temps » ou en fin de quart, où le chrono
  // des 24 s est volontairement coupé).
  const inPlay = t => {
    if (sched.pauses.some(p => t >= p.airAt && t < p.airAt + p.durationMs)) return false;
    const i = events.findIndex(e => e.airAt > t) - 1;
    if (i < 0 || events[i].type === "quarterStart") return false;
    return events.slice(i + 1).some(e => e.quarter === events[i].quarter && e.clock !== events[i].clock);
  };
  let now = kickoffAt + Math.round(sched.totalDurationMs * 0.3);
  while (!inPlay(now)) now += 1000;
  const aired = events.filter(e => e.airAt <= now);
  const timeline = [...aired.map(e => ({ at: e.airAt, ev: e })), ...sched.pauses.filter(p => p.airAt <= now).map(p => ({ at: p.airAt, pause: p }))].sort((a, b) => a.at - b.at);
  for (const it of timeline) { if (it.ev) ad.applyEvent(it.ev); else ad.applyPause(it.pause); }
  ad.tick(now);
  const S = ad.buildState(now);

  if (S.teams[0].name !== "France" || S.teams[1].name !== "Espagne") fail(`domicile en premier attendu (France, Espagne), obtenu ${S.teams.map(t => t.name)}.`);
  const last = aired[aired.length - 1];
  if (S.teams[0].score !== last.score.B || S.teams[1].score !== last.score.A) fail("score du spectateur extérieur mal réorienté (A = Espagne dans le payload).");
  console.log(`✅ Repère domicile/extérieur : ${S.teams[0].name} ${S.teams[0].score} - ${S.teams[1].score} ${S.teams[1].name} (payload vu de l'extérieur).`);

  for (const t of [0, 1]) {
    const on = S.teams[t].players.filter(p => p.onCourt).length;
    if (on !== 5) fail(`${S.teams[t].name} : 5 joueurs en jeu attendus, obtenu ${on}.`);
    const sum = S.teams[t].players.reduce((s, p) => s + p.pts, 0);
    if (sum !== S.teams[t].score) fail(`${S.teams[t].name} : somme des points de la feuille (${sum}) ≠ score (${S.teams[t].score}).`);
    if (!S.teams[t].players.some(p => p.starter)) fail("cinq de départ attendu (boxScore.starter).");
    const mins = S.teams[t].players.reduce((s, p) => s + p.seconds, 0);
    const expected = 5 * ((S.quarter - 1) * 600 + (600 - S.clock));
    if (Math.abs(mins - expected) > 5 * 30) fail(`minutes cumulées ${mins} s trop loin de ${expected} s.`);
  }
  console.log("✅ Cinq en jeu, feuille par deltas moteur = score, minutes cohérentes, cinq de départ connu.");

  const ids = new Set(S.teams.flatMap(t => t.players.map(p => p.id)));
  for (const e of S.events) for (const id of Object.values(e.actors || {})) if (id && !ids.has(id)) fail(`acteur inconnu ${id} (événement ${e.kind}).`);
  const shots = S.events.filter(e => (e.kind === "shot" || e.kind === "rebound") && !e.freeThrow);   // (rebond de lancer franc : pas un tir)
  if (!shots.every(e => e.passes && e.passes[e.passes.length - 1] === e.actors.shooter && e.shotType && e.quality && e.possLen > 0)) fail("chaque tir doit porter passes / shotType / quality / possLen.");
  if (S.shots.length !== shots.filter(e => e.shot).length || !S.shots.every(s => s.x >= 0 && s.x <= 94)) fail("carte des tirs incohérente.");
  console.log(`✅ ${S.events.length} événements, acteurs par id, ${shots.length} tirs avec faits de possession, ${S.shots.length} points sur la carte.`);

  const na = S.nextAction;
  if (!na || !(na.airAt > now) || "made" in na || "text" in na) fail("nextAction attendue, future, sans résultat.");
  if (typeof S.shotClock !== "number" || S.shotClock < 0 || S.shotClock > 24) fail(`chrono des 24 s attendu entre 0 et 24, obtenu ${S.shotClock}.`);
  if (!(S.clock >= 0 && S.clock <= 600)) fail(`chrono invalide ${S.clock}.`);
  if (!S.events.some(e => e.type === "quote")) fail("commentaires du présentateur attendus.");
  console.log(`✅ nextAction (${na.kind}, +${Math.round((na.airAt - now) / 1000)} s), chrono ${S.clock} s, 24 s = ${S.shotClock.toFixed(1)}, présentateur présent.`);

  // Pause (mi-temps) : statut, chrono des 24 s coupé.
  const half = sched.pauses.find(p => p.kind === "halftime");
  const ad2 = createLiveAdapter({ live, teams: { A: teamData(away), B: teamData(home) }, mine: "B" });
  const mid = half.airAt + 1000;
  for (const e of events.filter(e => e.airAt <= mid)) ad2.applyEvent(e);
  ad2.tick(mid);
  const H = ad2.buildState(mid);
  if (H.status !== "halftime" || H.shotClock !== null || !(H.halftimeResumeIn > 0)) fail(`mi-temps attendue (statut ${H.status}, 24 s ${H.shotClock}).`);
  if (!H.teams[0].mine) fail("mine: 'B' = France (domicile) doit marquer l'équipe 0.");
  console.log("✅ Mi-temps : statut, chrono des 24 s coupé, « mon équipe » paramétrable.");

  // Fin de match.
  const end = kickoffAt + sched.totalDurationMs + 1;
  for (const e of events.filter(e => e.airAt > mid)) ad2.applyEvent(e);
  ad2.finish(); ad2.tick(end);
  const F = ad2.buildState(end);
  if (F.status !== "final" || F.nextAction !== null) fail("fin de match : statut final, plus d'action à venir.");
  if (F.teams[0].score !== result.finalScore.A || F.teams[1].score !== result.finalScore.B) fail("score final incohérent avec le moteur.");
  for (const t of [0, 1]) { const sum = F.teams[t].players.reduce((s, p) => s + p.pts, 0); if (sum !== F.teams[t].score) fail("feuille finale ≠ score final."); }
  if (F.teams[0].players.some(p => p.onCourt)) fail("plus personne « en jeu » après la fin.");
  console.log("✅ Fin de match : score final = moteur, feuille complète, terrain vidé.");
  console.log("\n✅ Adaptateur générique du direct vérifié (club ou sélection, domicile ou extérieur, deltas du moteur).");
})().catch(e => { console.error(e.message || e); process.exit(1); });
