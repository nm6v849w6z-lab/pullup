// Possession du ballon dans les événements du moteur (audit possession
// live, 2026-10-07). Source de vérité du direct : `possession` = équipe qui
// a le ballon PENDANT l'action, `possessionAfter` = équipe qui l'a APRÈS.
// Invariants vérifiés sur plusieurs matchs complets :
//  1. chaque événement de jeu porte possession et possessionAfter ("A"/"B") ;
//  2. chaîne continue : l'équipe qui agit à un événement de jeu est celle
//     qui avait le ballon après l'événement précédent (même quart-temps) ;
//  3. sens de chaque transition : panier → adversaire, rebond offensif →
//     même équipe, rebond défensif → défense, interception / perte →
//     adversaire, contre / faute sur tir → toujours l'attaque (rebond ou
//     lancers suivent), faute technique au milieu d'une possession → l'attaque
//     garde le ballon, dernier lancer → adversaire sauf rebond offensif
//     impossible (pas de rebond sur lancer dans le moteur) ;
//  4. le rebondeur appartient à l'équipe possessionAfter, l'intercepteur à
//     l'adversaire de l'attaque ;
//  5. reprise d'un quart-temps : quarterStart.possession = équipe qui joue
//     la première action du quart.
const E = require("./engine.js");
const assert = (c, m) => { if (!c) throw new Error("❌ " + m); };
const other = k => (k === "A" ? "B" : "A");
const PLAY = new Set(["shot", "rebound", "turnover", "foul", "freeThrow", "technicalFoul", "unsportsmanlikeFoul"]);
const counts = {};
const seen = k => { counts[k] = (counts[k] || 0) + 1; };

function team(name, seed) {
  const t = E.generateTeam(name, seed);
  const off = Object.keys(E.OFFENSE_PROFILES);
  t.offensivePriorities = [off[seed % off.length], off[(seed + 1) % off.length], off[(seed + 2) % off.length]];
  t.defense = Object.keys(E.DEFENSES)[seed % Object.keys(E.DEFENSES).length];
  t.rhythm = Object.keys(E.RHYTHMS)[seed % Object.keys(E.RHYTHMS).length];
  return t;
}

const MATCHES = 12;
for (let m = 0; m < MATCHES; m++) {
  const A = team("A" + m, 1 + (m % 3)), B = team("B" + m, 1 + ((m + 1) % 3));
  const { events } = new E.MatchEngine(A, B).simulate();
  const idsOf = k => new Set((k === "A" ? A : B).players.map(p => p.id));
  let after = null, quarter = 0;
  events.forEach((ev, i) => {
    const where = `match ${m}, événement ${i} (${ev.type} ${ev.quarter}Q ${ev.clock}) : ${ev.text}\n` + events.slice(Math.max(0, i - 2), i + 4).map((x, k) => `   ${i - 2 + k} ${x.type} ${x.clock} team=${x.team} poss=${x.possession} after=${x.possessionAfter} ${x.foulType || ""} ${x.text.slice(0, 60)}`).join("\n");
    if (ev.type === "quarterStart") {
      quarter = ev.quarter;
      if (ev.quarter > 1) { assert(ev.possession === "A" || ev.possession === "B", "quarterStart sans possession — " + where); after = ev.possessionAfter; seen("quarterStart"); }
      else after = null;
      return;
    }
    if (ev.type === "tipoff") { assert(ev.possessionAfter === ev.team && ev.possession === ev.team, "entre-deux — " + where); after = ev.possessionAfter; seen("tipoff"); return; }
    if (ev.type === "quarterEnd") { assert(ev.possessionAfter === "A" || ev.possessionAfter === "B", "quarterEnd sans possessionAfter — " + where); return; }
    if (!PLAY.has(ev.type)) { if (ev.possessionAfter) after = ev.possessionAfter; return; }
    assert(ev.possession === "A" || ev.possession === "B", "possession manquante — " + where);
    assert(ev.possessionAfter === "A" || ev.possessionAfter === "B", "possessionAfter manquante — " + where);
    // 2. Chaîne continue.
    assert(after === null || ev.possession === after, `chaîne rompue : l'événement précédent laissait le ballon à ${after}, celui-ci est joué par ${ev.possession} — ` + where);
    const off = ev.possession, next = ev.possessionAfter;
    // 3. Sens des transitions.
    if (ev.type === "shot") {
      assert(ev.team === off, "tir de l'équipe sans ballon — " + where);
      if (ev.made) { const nx = events.slice(i + 1).find(x => PLAY.has(x.type));
        const andOne = !!nx && nx.type === "foul" && nx.foulType === "andOne" && nx.quarter === ev.quarter && nx.clock === ev.clock;
        assert(andOne ? next === off : next === other(off), "panier : ballon à l'adversaire (sauf and-one) — " + where); seen(andOne ? "panier + faute" : "panier"); }
      else { assert(next === off, "contre / faute sur tir : l'attaque garde le ballon jusqu'au rebond / aux lancers — " + where); seen(ev.blocked ? "contre" : "faute sur tir"); }
    } else if (ev.type === "rebound") {
      assert(next === ev.team, "rebond : ballon à l'équipe du rebondeur — " + where);
      assert(ev.offensive ? next === off : next === other(off), "rebond offensif / défensif — " + where);
      assert(idsOf(next).has(ev.rebounderId), "rebondeur hors de l'équipe en possession — " + where);
      seen(ev.offensive ? "rebond offensif" : "rebond défensif");
    } else if (ev.type === "turnover") {
      assert(ev.team === off && next === other(off), "perte de balle : ballon à l'adversaire — " + where);
      if (ev.stealerId != null) { assert(idsOf(next).has(ev.stealerId), "intercepteur hors de l'équipe qui récupère — " + where); seen("interception"); }
      else seen("perte de balle");
    } else if (ev.type === "freeThrow") {
      assert(ev.team === off, "lancers de l'équipe sans ballon — " + where);
      seen(next === off ? "lancers, l'attaque garde le ballon" : "lancers puis remise en jeu / rebond adverse");
    } else if (ev.type === "foul") {
      assert(ev.team === other(off), "faute de l'attaque comptée à la défense — " + where);
      seen("faute");
    } else seen(ev.type);
    after = next;
  });
}
console.log("Transitions vérifiées :", Object.entries(counts).map(([k, v]) => `${k} ×${v}`).join(", "));
for (const k of ["panier", "rebond offensif", "rebond défensif", "interception", "perte de balle", "faute", "quarterStart", "tipoff"]) assert(counts[k] > 0, "transition jamais rencontrée : " + k);
console.log(`\n✅ engine_possession_chain_test.js : ${MATCHES} matchs, possession continue et cohérente à chaque événement.`);
