// Simulateur de DÉMONSTRATION uniquement : produit un état au format attendu
// par live-view.js pour tester la vue sans le vrai moteur. À ne pas livrer.
import { de, quarterName } from "./format.js";

const ROSTERS = [
  ["Venomous", "VEN", [["Rayan Brooks","M"],["Marc Lopez","AS"],["Théo Traoré","A"],["Bastien Barros","AF"],["Jordan Fournier","P"],["Kylian Mercier","M"],["Nassim Benali","AS"],["Lucas Girard","A"],["Yanis Petit","AF"],["Maxime Roux","P"],["Enzo Blanc","A"],["Hugo Lefèvre","M"]]],
  ["Cerberus Basketball Team", "CBT", [["Adama Diallo","M"],["Marc Novak","AS"],["Karim Brooks","P"],["Bastien Chevalier","AF"],["Souleymane Diallo","A"],["Hugo Garcia","A"],["Sacha Rossi","M"],["Léo Martin","AS"],["Enzo Moreau","P"],["Amir Lopez","M"],["Elias Moreau","A"],["Tom Moreau","AS"],["Quentin Fontaine","P"]]],
];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

export function createDemoMatch({ quarterLength = 600, halftimeSeconds = 45 } = {}) {
  let id = 0;
  const S = {
    status: "live", quarter: 1, clock: quarterLength, possession: 0, halftimeResumeIn: null,
    teams: ROSTERS.map(([name, short, r]) => ({
      name, short, score: 0, quarterScores: [0, null, null, null], teamFouls: 0, timeoutsLeft: 5, timeoutsTotal: 5,
      players: r.map(([n, p], i) => ({ id: short + i, name: n, pos: p, starter: i < 5, onCourt: i < 5, seconds: 0,
        pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 })),
    })),
    shots: [], events: [],
  };
  const on = t => S.teams[t].players.filter(p => p.onCourt);
  const ev = o => S.events.push({ id: ++id, quarter: S.quarter, clock: Math.round(S.clock), team: null, ...o });
  const scoreArr = () => [S.teams[0].score, S.teams[1].score];
  let run = { team: null, pts: 0 };

  function addPts(t, n) {
    const T = S.teams[t]; T.score += n; T.quarterScores[S.quarter - 1] += n;
    run = run.team === t ? { team: t, pts: run.pts + n } : { team: t, pts: n };
  }
  function sub(t, out, reason) {
    const bench = S.teams[t].players.filter(p => !p.onCourt && p.pf < 5);
    if (!bench.length) return;
    const inn = pick(bench.slice(0, 7)); out.onCourt = false; inn.onCourt = true;
    ev({ team: t, type: "sub", text: `Entrée ${de(inn.name)} à la place ${de(out.name)}${reason ? ` (${reason})` : ""}.` });
  }
  function foul(t, p) {
    p.pf++; S.teams[t].teamFouls++;
    if (p.pf === 5) { ev({ team: t, type: "foul", highlight: true, text: `${p.name} commet sa 5e faute et doit quitter le terrain.`, toast: `${p.name} est exclu pour 5 fautes` }); sub(t, p); }
  }
  function freeThrows(t, p, n) {
    let m = 0; for (let i = 0; i < n; i++) { p.fta++; if (Math.random() < .74) { m++; p.ftm++; p.pts++; } }
    if (m) addPts(t, m);
    ev({ team: t, type: "ft", text: `${p.name} ${m}/${n} aux lancers francs.`, score: m ? scoreArr() : null });
  }
  function spot(zone, t) {
    let x, y, a, d;
    if (zone === "paint") { d = rnd(.5, 8); a = rnd(-80, 80); }
    else if (zone === "mid") { d = rnd(9, 21); a = rnd(-78, 78); }
    else if (Math.random() < .25) { x = rnd(1, 13); y = Math.random() < .5 ? rnd(.8, 2.6) : 50 - rnd(.8, 2.6); }
    else { d = rnd(24, 27.5); a = rnd(-66, 66); }
    if (x === undefined) { a *= Math.PI / 180; x = Math.max(1, 5.25 + d * Math.cos(a)); y = 25 + d * Math.sin(a); }
    return { x: t === 0 ? 94 - x : x, y };
  }

  function tick() {
    if (S.status === "final") return S;
    if (S.status === "halftime") {
      if (--S.halftimeResumeIn <= 0) {
        S.status = "live"; S.halftimeResumeIn = null;
        ev({ type: "period", text: `Début du ${quarterName(S.quarter)}` });
      }
      return S;
    }
    const dt = rnd(7, 22);
    if (S.clock - dt <= 0) {
      S.teams.forEach((T, t) => on(t).forEach(p => (p.seconds += S.clock)));
      S.clock = 0;
      ev({ type: "period", text: `Fin du ${quarterName(S.quarter)} · ${S.teams[0].score}–${S.teams[1].score}` });
      if (S.quarter === 4) { S.status = "final"; return S; }
      S.quarter++; S.clock = quarterLength; S.teams.forEach(T => { T.teamFouls = 0; T.quarterScores[S.quarter - 1] = 0; });
      S.possession = S.quarter % 2 === 0 ? 1 : 0;
      if (S.quarter === 3) { S.status = "halftime"; S.halftimeResumeIn = halftimeSeconds; }
      else ev({ type: "period", text: `Début du ${quarterName(S.quarter)}` });
      return S;
    }
    S.clock -= dt; S.teams.forEach((T, t) => on(t).forEach(p => (p.seconds += dt)));
    const o = S.possession, d = 1 - o, sh = pick(on(o)), df = pick(on(d)), r = Math.random();

    if (run.team === o && run.pts >= 7 && S.teams[d].timeoutsLeft > 0 && Math.random() < .5) {
      S.teams[d].timeoutsLeft--;
      ev({ team: d, type: "timeout", highlight: true, text: `Temps mort demandé par ${S.teams[d].name} après une série de ${run.pts}-0.`, toast: `Temps mort ${S.teams[d].name}` });
      run.pts = 0;
    }
    if (Math.random() < .06) { const t = Math.random() < .5 ? 0 : 1; sub(t, pick(on(t))); }

    if (r < .12) {
      sh.tov++;
      if (Math.random() < .55) { df.stl++; ev({ team: d, type: "turnover", text: `Interception ${de(df.name)} sur ${sh.name}.` }); }
      else ev({ team: o, type: "turnover", text: `Perte de balle ${de(sh.name)} (${pick(["marcher", "passe ratée", "reprise de dribble", "24 secondes"])}).` });
      S.possession = d; return S;
    }
    if (r < .20) { ev({ team: d, type: "foul", text: `Faute ${de(df.name)} sur le tir ${de(sh.name)}.` }); foul(d, df); freeThrows(o, sh, 2); S.possession = d; return S; }
    if (r < .25) {
      ev({ team: d, type: "foul", text: `Faute ${de(df.name)} sur ${sh.name}.` }); foul(d, df);
      if (S.teams[d].teamFouls >= 5) { freeThrows(o, sh, 2); S.possession = d; }
      return S;
    }
    const z = Math.random(), zone = z < .36 ? "three" : z < .56 ? "mid" : "paint";
    const made = Math.random() < { three: .35, mid: .40, paint: .56 }[zone], three = zone === "three";
    const zl = { three: "à 3 points", mid: "à mi-distance", paint: "dans la raquette" }[zone];
    three ? sh.fg3a++ : sh.fg2a++;
    S.shots.push({ id: "s" + (id + 1), team: o, quarter: S.quarter, made, zone, ...spot(zone, o) });
    if (made) {
      three ? sh.fg3m++ : sh.fg2m++; sh.pts += three ? 3 : 2; addPts(o, three ? 3 : 2);
      let txt = `${sh.name} marque ${zl}`;
      if (Math.random() < .6) { const a = pick(on(o).filter(p => p !== sh)); a.ast++; txt += `, passe ${de(a.name)}`; }
      ev({ team: o, type: "made", text: txt + ".", score: scoreArr() });
      S.possession = d;
    } else {
      let txt = `${sh.name} manque son tir ${zl}`;
      if (zone === "paint" && Math.random() < .18) { df.blk++; txt = `Contre ${de(df.name)} sur ${sh.name}`; }
      if (Math.random() < .27) { const rb = pick(on(o)); rb.reb++; txt += rb === sh ? ", il reprend son propre rebond." : `, rebond offensif ${de(rb.name)}.`; }
      else { const rb = pick(on(d)); rb.reb++; txt += `, rebond défensif ${de(rb.name)}.`; S.possession = d; }
      ev({ team: o, type: "miss", text: txt });
    }
    return S;
  }

  return { state: S, tick };
}
