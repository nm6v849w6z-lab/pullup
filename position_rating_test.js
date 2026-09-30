// Note par poste (retour utilisateur 2026-09-30 : "il faudrait que le jeu
// calcule une note par poste") : positionRating / positionRatings /
// bestPosition (engine.js, copie miroir dans moteurbasket3.html).
// Vérifie : bornes 0-100 et même échelle que overall(), monotonie avec les
// caractéristiques pondérées du poste, meilleur poste cohérent, copie miroir
// identique, et aucune influence sur la simulation (pure lecture).
const fs = require("fs");
const E = require("./engine.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const POS = E.POSITIONS;

// 1) Bornes, échelle, meilleur poste = argmax, sur des joueurs générés.
let n = 0, bestIsCard = 0;
POS.forEach(pos => {
  for (let i = 0; i < 40; i++) {
    const p = E.generatePlayer(pos, 1);
    const r = E.positionRatings(p);
    POS.forEach(q => { if (!(r[q] >= 0 && r[q] <= 100)) throw new Error(`❌ note hors bornes : ${q} = ${r[q]}`); });
    const min = Math.min(...Object.values(r)), max = Math.max(...Object.values(r));
    const ovr = p.overall();
    if (!(min <= ovr + 1e-9 || max >= ovr - 1e-9)) throw new Error("❌ échelle incohérente avec overall()");
    if (Math.abs(max - ovr) > 25 || Math.abs(min - ovr) > 25) throw new Error(`❌ note par poste trop éloignée de overall (${ovr.toFixed(1)} vs ${min.toFixed(1)}-${max.toFixed(1)})`);
    const best = E.bestPosition(p);
    if (Math.abs(r[best] - max) > 1e-3) throw new Error(`❌ bestPosition (${best}) n'est pas le poste de note maximale`);
    if (best === p.position) bestIsCard++;
    n++;
  }
});
assert(true, `${n} joueurs générés : notes entre 0 et 100, proches de overall(), bestPosition = poste de note maximale`);
assert(bestIsCard / n > 0.5, `le meilleur poste est le plus souvent le poste de génération (${Math.round(100 * bestIsCard / n)} %)`);

// 2) Monotonie : +10 sur une caractéristique ne fait JAMAIS baisser une note,
// et monte davantage là où elle est « strong » que là où elle est « weak ».
const base = {};
E.ATTRS.forEach(a => { base[a] = 50; });
E.ATTRS.forEach(a => {
  const up = { ...base, [a]: 60 };
  POS.forEach(q => {
    if (E.positionRating({ attrs: up }, q) < E.positionRating({ attrs: base }, q)) throw new Error(`❌ +10 en ${a} fait baisser la note ${q}`);
  });
});
const gain = (a, q) => E.positionRating({ attrs: { ...base, [a]: 90 } }, q) - E.positionRating({ attrs: base }, q);
assert(gain("pass", "Meneur") > gain("pass", "Pivot") && gain("dribble", "Meneur") > gain("dribble", "Pivot"), "passe / dribble pèsent plus pour un Meneur que pour un Pivot");
assert(gain("rebound", "Pivot") > gain("rebound", "Meneur") && gain("block", "Pivot") > gain("block", "Arrière"), "rebond / contre pèsent plus pour un Pivot");
assert(gain("threePoint", "Ailier shooteur") > gain("threePoint", "Pivot"), "tir à 3 points pèse plus pour un Ailier shooteur");
const flat = E.positionRatings({ attrs: base });
assert(POS.every(q => Math.abs(flat[q] - 50) < 1e-9), "caractéristiques toutes à 50 : 50 à chaque poste (ancrée sur overall)");

// Profil type Pivot / Meneur : meilleur poste attendu.
const bigMan = { ...base, inside: 85, rebound: 88, block: 80, defInside: 84, power: 80, strength: 85, vertical: 75, pass: 30, dribble: 25, threePoint: 20 };
const guard = { ...base, pass: 88, dribble: 85, agility: 80, penetration: 80, shotCreation: 78, steal: 75, speed: 85, acceleration: 84, rebound: 25, block: 20, strength: 30 };
assert(E.bestPosition({ attrs: bigMan }) === "Pivot", "profil intérieur → meilleur poste Pivot");
assert(E.bestPosition({ attrs: guard }) === "Meneur", "profil meneur → meilleur poste Meneur");
// Égalité : le poste de carte l'emporte.
assert(E.bestPosition({ attrs: base, position: "Ailier fort" }) === "Ailier fort", "à égalité, le poste de carte l'emporte");

// 3) Copie miroir identique dans la page.
const src = (text, name) => { const m = text.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`)); return m && m[0]; };
["positionRating", "positionRatings", "bestPosition", "weightedRatingForPosition"].forEach(f => {
  if (!src(html, f) || src(html, f) !== src(fs.readFileSync("engine.js", "utf-8"), f)) throw new Error(`❌ ${f} : copie miroir différente entre engine.js et moteurbasket3.html`);
});
assert(true, "positionRating / positionRatings / bestPosition identiques dans engine.js et moteurbasket3.html");

// 4) Pure lecture : ne modifie pas le joueur.
const p = E.generatePlayer("Arrière", 1);
const before = JSON.stringify(p.attrs);
E.positionRatings(p); E.bestPosition(p);
assert(JSON.stringify(p.attrs) === before, "aucune écriture dans le joueur (aide à la décision, pas de changement du moteur)");

console.log("\n🏁 Note par poste vérifiée.");
