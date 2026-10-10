// Mission live 2026-10-10 — persistance et déterminisme (tests 31-35) :
//  31  même match → même chronologie à chaque calcul / rechargement ;
//  32  … et des semaines plus tard (horloge du serveur différente) ;
//  33  événements et statistiques jamais comptés deux fois (feuille du
//      direct = somme des deltas du moteur = feuille officielle) ;
//  34  plusieurs ouvertures simultanées → une seule chronologie stockée ;
//  35  la rediffusion (heures décalées, curseur déplacé) ne modifie jamais
//      le score ni les statistiques définitives.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const Engine = require("./engine.js");
const LiveMatch = require("./server/liveMatch.js");
const Calendar = require("./server/calendar.js");
const ok = m => console.log("✅ " + m);
const clone = o => JSON.parse(JSON.stringify(o));

(async () => {
  const KICK = Date.UTC(2026, 9, 10, 18, 0, 0);
  const league = Engine.generateLeague(Engine.generateStartingRoster("Persistance"), 1, KICK);
  const m0 = league.matchesForRound(0).find(m => m.home === 0 || m.away === 0);

  // 31. Trois calculs du même match.
  const a = LiveMatch.computeLiveMatch(Engine, league, 0, m0.home, m0.away, KICK);
  const b = LiveMatch.computeLiveMatch(Engine, league, 0, m0.home, m0.away, KICK);
  assert.deepStrictEqual(clone(b), clone(a), "deux calculs : direct identique");
  ok(`31. Même match calculé deux fois : ${a.events.length} événements, ${a.pauses.length} pauses, score ${a.finalScore.home}-${a.finalScore.away}, identiques.`);

  // 32. Trois semaines plus tard (horloge du serveur décalée).
  const realNow = Date.now;
  Date.now = () => realNow() + 21 * 86400e3;
  let c;
  try { c = LiveMatch.computeLiveMatch(Engine, league, 0, m0.home, m0.away, KICK); } finally { Date.now = realNow; }
  assert.deepStrictEqual(clone(c), clone(a), "trois semaines plus tard : direct identique");
  ok("32. Recalculé « trois semaines plus tard » : chronologie, horaires, score et statistiques identiques.");

  // 34. Ouvertures simultanées : une seule chronologie stockée.
  const kickoffAt = Calendar.scheduledTimeForLeagueRound(league, 0);
  const k1 = LiveMatch.ensureLiveMatchStarted(Engine, league, kickoffAt, Calendar.scheduledTimeForLeagueRound);
  const key = LiveMatch.liveMatchKey(0, m0.home, m0.away);
  assert.ok(k1.includes(key), "le direct démarre à l'heure");
  const stored = clone(league.liveMatches[key]);
  const k2 = LiveMatch.ensureLiveMatchStarted(Engine, league, kickoffAt + 1000, Calendar.scheduledTimeForLeagueRound);
  assert.ok(!k2.includes(key), "deuxième ouverture : rien de recalculé");
  assert.deepStrictEqual(clone(league.liveMatches[key]), stored, "deuxième ouverture : même direct stocké");
  // Direct stocké perdu (blob manquant, cache périmé) puis recalculé : le même.
  delete league.liveMatches[key];
  LiveMatch.ensureLiveMatchStarted(Engine, league, kickoffAt + 2000, Calendar.scheduledTimeForLeagueRound);
  assert.deepStrictEqual(clone(league.liveMatches[key].events), stored.events, "direct perdu puis recalculé : mêmes événements");
  assert.deepStrictEqual(league.liveMatches[key].finalScore, stored.finalScore, "direct perdu puis recalculé : même score");
  ok("34. Ouvertures répétées : un seul direct stocké ; perdu puis recalculé, il est identique.");

  // 33 / 35. Feuille du direct (adaptateur) = feuille officielle, en direct
  // comme en rediffusion décalée, et après un retour en arrière du curseur.
  const { createLiveAdapter } = await import(pathToFileURL(path.join(__dirname, "assets/live/adapter.js")).href);
  const live = { ...stored, isHome: true };
  const teamOf = idx => league.teams[idx];
  const teamData = t => ({ name: t.name, short: t.name.slice(0, 3).toUpperCase(), color: "#123456", logo: "", players: t.players.map(p => ({ id: p.id, name: p.name, pos: p.position, avatar: "" })) });
  const teams = { A: teamData(teamOf(m0.home)), B: teamData(teamOf(m0.away)) };
  const play = (lv, until) => {
    const ad = createLiveAdapter({ live: lv, teams, mine: "A" });
    const items = [...lv.events.map(ev => ({ at: ev.airAt, ev })), ...(lv.pauses || []).filter(p => p.kind === "timeout").map(p => ({ at: p.airAt, pause: p }))].sort((x, y) => x.at - y.at);
    for (const it of items) { if (it.at > until) break; if (it.ev) ad.applyEvent(it.ev); else ad.applyPause(it.pause); }
    ad.finish && until >= lv.kickoffAt + lv.totalDurationMs && ad.finish();
    ad.tick(until);
    const S = ad.buildState(until);
    return S.teams.map(t => ({ score: t.score, pts: t.players.reduce((s, p) => s + p.pts, 0), reb: t.players.reduce((s, p) => s + (p.reb || 0), 0), ast: t.players.reduce((s, p) => s + (p.ast || 0), 0) }));
  };
  const end = live.kickoffAt + live.totalDurationMs + 1000;
  const direct = play(live, end);
  const official = [live.finalScore.home, live.finalScore.away];
  assert.deepStrictEqual(direct.map(x => x.score), official, "score du direct = score officiel");
  direct.forEach((x, i) => assert.strictEqual(x.pts, x.score, "feuille du direct : somme des points = score (rien compté deux fois), équipe " + i));
  const boxPts = side => (side || []).reduce((s, r) => s + (r.pts || 0), 0);
  assert.strictEqual(boxPts(live.boxScoreA), official[0], "feuille officielle domicile = score");
  ok(`33. Feuille du direct : ${direct[0].pts} + ${direct[1].pts} points = score officiel ${official.join("-")} — aucun événement compté deux fois.`);
  // Rediffusion : mêmes événements, heures décalées de 9 jours.
  const shift = 9 * 86400e3;
  const replay = { ...live, kickoffAt: live.kickoffAt + shift, events: live.events.map(e => ({ ...e, airAt: e.airAt + shift })), pauses: live.pauses.map(p => ({ ...p, airAt: p.airAt + shift })), replay: true };
  assert.deepStrictEqual(play(replay, end + shift), direct, "rediffusion décalée : même feuille");
  // Curseur ramené en arrière puis en avant : mêmes valeurs à l'arrivée.
  const mid = replay.kickoffAt + replay.totalDurationMs / 2;
  play(replay, mid);
  assert.deepStrictEqual(play(replay, end + shift), direct, "curseur déplacé : feuille finale inchangée");
  assert.deepStrictEqual(clone(league.liveMatches[key].finalScore), stored.finalScore, "la rediffusion ne touche jamais au résultat stocké");
  ok("35. Rediffusion (heures décalées, curseur déplacé) : score et statistiques identiques au direct, résultat stocké intact.");
  console.log("\n🏁 live_persistence_test.js");
})().catch(e => { console.error(e); process.exit(1); });
