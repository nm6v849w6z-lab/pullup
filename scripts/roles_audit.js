// Audit du système de rôles (demande utilisateur du 2026-10-06 : « Correctifs
// — Système de rôles des joueurs »). Applique les MÊMES règles de cohérence à
// n'importe quelle version du module (avant / après correction) sur une
// population de joueurs générés par le moteur (toutes les divisions).
//
//   node scripts/roles_audit.js [--module chemin/vers/roles.js] [--out rapport.md] [--n 4500]
//
// Seuils : exprimés pour un joueur de haut niveau (moyenne de ses 8 meilleures
// caractéristiques ≥ 75) et réduits en proportion pour un joueur plus faible
// (une Passe à 59 ne veut pas dire la même chose en D1 et en D6).
const fs = require("fs");
const path = require("path");
// Population identique d'une exécution à l'autre (avant / après) : tirages
// déterministes (graine --seed, 42 par défaut).
{
  let x = Number((process.argv.find((v, i, arr) => arr[i - 1] === "--seed")) || 42) >>> 0 || 42;
  Math.random = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
const E = require("../engine.js");

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const R = require(path.resolve(opt("--module", path.join(__dirname, "../assets/roles.js"))));
const OUT = opt("--out", null);
const N = Number(opt("--n", 4500));

// Grille d'audit (indépendante du module audité).
const ESSENTIALS = {
  combo_guard: { pass: 60, dribble: 65, shotCreation: 60, threePoint: 60 },
  scorer_pg: { shotCreation: 65, dribble: 65, pass: 55 },
  scorer_sg: { shotCreation: 60, threePoint: 62 },
  floor_general: { pass: 70, vision: 52, decision: 50 }, // caractéristiques mentales : échelle du jeu plus basse (médiane 44)
  pass_first: { pass: 72, vision: 52 },
  sharpshooter: { threePoint: 72 },
  three_and_d: { threePoint: 65, defOutside: 65 },
  slasher: { penetration: 65, acceleration: 60 },
  shot_creator: { shotCreation: 68, dribble: 60 },
  point_forward: { pass: 65, dribble: 60 },
  stretch_forward: { threePoint: 62, rebound: 55 },
  stretch_four: { threePoint: 65 },
  inside_four: { inside: 62, rebound: 60 },
  defensive_four: { defInside: 62, defOutside: 58 },
  small_ball_four: { speed: 62, agility: 62 },
  playmaking_four: { pass: 65 },
  rim_protector: { block: 65, defInside: 60 },
  interior_scorer: { inside: 68 },
  stretch_five: { threePoint: 65 },
  rebounder: { rebound: 68 },
  point_center: { pass: 65 },
  lob_threat: { vertical: 68, inside: 60 },
};
const NAMES = {
  scorer_pg: "Scoreur meneur", scorer_sg: "Scoreur arrière",
};
const FAMILY = {};
[["handler", ["floor_general", "pass_first", "combo_guard", "scorer_pg", "scorer_sg", "shot_creator", "point_forward", "playmaking_four", "point_center"]],
 ["shooter", ["sharpshooter", "three_and_d", "stretch_four", "stretch_five", "stretch_forward"]],
 ["athlete", ["slasher", "lob_threat", "small_ball_four"]],
 ["big", ["inside_four", "interior_scorer", "rebounder", "rim_protector", "defensive_four"]]]
  .forEach(([f, ids]) => ids.forEach(id => { FAMILY[id] = f; }));

// Ancien module : un seul « scorer_guard » joué au poste de meneur ou
// d'arrière ; on le lit comme Scoreur meneur / Scoreur arrière.
const keyOf = f => (f.role === "scorer_guard" ? (f.position === "Meneur" ? "scorer_pg" : "scorer_sg") : f.role);
const nameOf = f => NAMES[keyOf(f)] || f.name;

function top8(attrs) { return Object.values(attrs).filter(v => typeof v === "number").sort((a, b) => b - a).slice(0, 8).reduce((s, v) => s + v, 0) / 8; }
const scaleOf = attrs => Math.min(1, top8(attrs) / 75);

function positionsOf(ratings, card) {
  const best = Math.max(...E.POSITIONS.map(p => ratings[p]));
  return E.POSITIONS.filter(p => p === card || ratings[p] >= best - 3);
}

function auditPlayer(p) {
  const ratings = E.positionRatings(p);
  const fits = R.roleFits(p.attrs, ratings);
  const prof = R.profileOf(p.attrs, ratings, 6, p.position);
  if (!fits.length || !prof) return [];
  const sc = scaleOf(p.attrs);
  const T = v => v * sc;
  const own = positionsOf(ratings, p.position);
  const out = [];
  const add = (rule, sev, text, cause) => out.push({ rule, sev, text, cause, player: p, prof, fits, own });
  const byKey = {};
  fits.forEach(f => { const k = keyOf(f); if (!byKey[k] || f.mastery > byKey[k].mastery) byKey[k] = f; });
  const sorted = Object.values(byKey).sort((a, b) => b.mastery - a.mastery);
  const best = sorted[0];
  const second = sorted[1];
  const top2 = k => sorted.slice(0, 2).some(f => keyOf(f) === k);
  const m = k => (byKey[k] ? byKey[k].mastery : 0);
  const a = p.attrs;
  // R1 — poste naturel : meilleur rôle à un poste qui n'est pas le sien.
  const bestOwn = Math.max(0, ...fits.filter(f => own.includes(f.position)).map(f => f.mastery));
  const bestOther = fits.filter(f => !own.includes(f.position)).sort((x, y) => y.mastery - x.mastery)[0];
  if (bestOther && bestOther.mastery - bestOwn >= 2) {
    const d = bestOther.mastery - bestOwn;
    add("R1 poste", d >= 6 ? "haute" : d >= 3 ? "moyenne" : "faible", `${p.position} : ${nameOf(bestOther)} (${bestOther.position}) ${bestOther.mastery} > meilleur rôle à ses postes ${bestOwn}`, "poste naturel sans poids réel dans la note");
  }
  // R2 — Combo Guard sans passe.
  if (a.pass < T(60) && (m("combo_guard") >= 85 || top2("combo_guard"))) add("R2 Combo Guard / passe", m("combo_guard") >= 85 ? "haute" : "moyenne", `Combo Guard ${m("combo_guard")} avec Passe ${a.pass}`, "passe non essentielle dans la formule");
  // R3 — Scoreur meneur sans création / dribble / passe minimale.
  if ((a.shotCreation < T(55) || a.dribble < T(60) || a.pass < T(55)) && (m("scorer_pg") >= 85 || top2("scorer_pg"))) add("R3 Scoreur meneur", m("scorer_pg") >= 85 ? "haute" : "moyenne", `Scoreur meneur ${m("scorer_pg")} avec Création ${a.shotCreation}, Dribble ${a.dribble}, Passe ${a.pass}`, "rôle de meneur sans attributs essentiels du meneur");
  // R4 — Gâchette sans tir.
  if (a.threePoint < T(65) && (m("sharpshooter") >= 80 || top2("sharpshooter"))) add("R4 Gâchette", m("sharpshooter") >= 80 ? "haute" : "moyenne", `Gâchette ${m("sharpshooter")} avec Tir à 3 pts ${a.threePoint}`, "tir non bloquant");
  // R5 — 3&D sans défense extérieure.
  if (a.defOutside < T(60) && (m("three_and_d") >= 85 || top2("three_and_d"))) add("R5 3&D", m("three_and_d") >= 85 ? "haute" : "moyenne", `3&D ${m("three_and_d")} avec Défense extérieure ${a.defOutside}`, "défense non bloquante");
  // R6 — protecteur de cercle / rebondeur sans les bases.
  if (a.block < T(55) && (m("rim_protector") >= 85 || top2("rim_protector"))) add("R6 Rim Protector", m("rim_protector") >= 85 ? "haute" : "moyenne", `Rim Protector ${m("rim_protector")} avec Contre ${a.block}`, "contre non bloquant");
  if (a.rebound < T(55) && (m("rebounder") >= 85 || top2("rebounder"))) add("R6 Rebounder", m("rebounder") >= 85 ? "haute" : "moyenne", `Rebounder ${m("rebounder")} avec Rebond ${a.rebound}`, "rebond non bloquant");
  // R7 — écart artificiellement faible entre deux identités différentes.
  // Proximité cohérente si le joueur a réellement les essentielles des deux
  // rôles (profil hybride) ; suspecte sinon (section 15 de la demande).
  const essOk = k => Object.keys(ESSENTIALS[k] || {}).every(x => a[x] >= T(ESSENTIALS[k][x]) * 0.9);
  if (second && best.mastery - second.mastery <= 1 && FAMILY[keyOf(best)] && FAMILY[keyOf(second)] && FAMILY[keyOf(best)] !== FAMILY[keyOf(second)] && !(essOk(keyOf(best)) && essOk(keyOf(second)))) add("R7 écart", "faible", `${nameOf(best)} ${best.mastery} / ${nameOf(second)} ${second.mastery} (familles différentes, essentielles non réunies)`, "rôles trop peu différenciés");
  // R8 — rôle principal avec un attribut essentiel très faible.
  const pk = keyOf(prof.primary);
  const ess = ESSENTIALS[pk] || {};
  const bad = Object.keys(ess).filter(k => a[k] < T(ess[k]) * 0.85);
  if (bad.length) add("R8 essentiel", bad.length >= 2 ? "haute" : "moyenne", `Rôle principal ${nameOf(prof.primary)} ${prof.primary.mastery} avec ${bad.map(k => `${E.TRAINING_LABELS[k] || k} ${a[k]}`).join(", ")}`, "attribut essentiel sans seuil");
  return out;
}

function population(n) {
  const out = [];
  const tiers = [0.92, 0.86, 0.8, 0.74, 0.68, 0.62];
  let i = 0;
  while (out.length < n) {
    const t = E.generateTeam("A" + i, tiers[i % tiers.length]);
    out.push(...t.players);
    i++;
  }
  return out.slice(0, n);
}

const players = population(N);
const all = [];
players.forEach(p => all.push(...auditPlayer(p)));
const sev = s => all.filter(x => x.sev === s).length;
const byRule = {};
all.forEach(x => { byRule[x.rule] = (byRule[x.rule] || 0) + 1; });
const playersWith = new Set(all.map(x => x.player.id)).size;
// Diversité : rôles principaux par poste.
const div = {};
players.forEach(p => { const prof = R.profileOf(p.attrs, E.positionRatings(p), 6, p.position); if (!prof) return; const k = nameOf(prof.primary); (div[p.position] = div[p.position] || {})[k] = (div[p.position][k] || 0) + 1; });

let md = `# Audit du système de rôles\n\nModule : \`${path.relative(process.cwd(), require.resolve(path.resolve(opt("--module", path.join(__dirname, "../assets/roles.js")))))}\`\n\n`;
md += `- Joueurs analysés : **${players.length}** (générés par le moteur, divisions I à VI)\n- Joueurs avec au moins une anomalie : **${playersWith}** (${(100 * playersWith / players.length).toFixed(1)} %)\n- Anomalies détectées : **${all.length}**\n  - criticité haute : ${sev("haute")}\n  - criticité moyenne : ${sev("moyenne")}\n  - criticité faible : ${sev("faible")}\n\n## Par règle\n\n| Règle | Anomalies |\n|---|---:|\n`;
Object.keys(byRule).sort().forEach(k => { md += `| ${k} | ${byRule[k]} |\n`; });
md += `\n## Rôles principaux par poste (diversité)\n\n`;
Object.keys(div).forEach(pos => { md += `- **${pos}** : ${Object.entries(div[pos]).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(", ")}\n`; });
md += `\n## Exemples (criticité haute d'abord)\n\n`;
const order = { haute: 0, moyenne: 1, faible: 2 };
all.slice().sort((x, y) => order[x.sev] - order[y.sev]).slice(0, 25).forEach((x, i) => {
  const p = x.player;
  const tops = x.fits.slice(0, 4).map(f => `${nameOf(f)} (${f.position}) ${f.mastery}`).join(" · ");
  md += `### Anomalie #${String(i + 1).padStart(3, "0")} — ${x.rule} (${x.sev})\n- Joueur : ${p.name}, ${p.position}, ${p.age} ans, postes jouables : ${x.own.join(" / ")}\n- Rôles : ${tops}\n- Problème : ${x.text}\n- Cause probable : ${x.cause}\n- Passe ${p.attrs.pass} · Dribble ${p.attrs.dribble} · Création ${p.attrs.shotCreation} · 3 pts ${p.attrs.threePoint} · Déf. ext. ${p.attrs.defOutside} · Contre ${p.attrs.block} · Rebond ${p.attrs.rebound}\n\n`;
});
if (OUT) fs.writeFileSync(OUT, md);
console.log(md.split("## Exemples")[0]);
