// Note par poste (retour utilisateur 2026-09-30 : "il faudrait que le jeu
// calcule une note par poste") : positionRating / positionRatings /
// bestPosition (engine.js, copie miroir dans moteurbasket3.html).
// Vérifie : bornes 0-100 et même échelle que overall(), monotonie avec les
// caractéristiques pondérées du poste, meilleur poste cohérent, copie miroir
// identique, et aucune influence sur la simulation (pure lecture).
const fs = require("fs");
const E = require("./engine.js");
const html = require("./test_game_html.js").readGameHtml();

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
    // 35 (et non plus 25) : la note repose à 65 % sur les caractéristiques
    // clés du poste (POSITION_RATING_KEY_SHARE), plus étalée qu'avant.
    if (Math.abs(max - ovr) > 35 || Math.abs(min - ovr) > 35) throw new Error(`❌ note par poste trop éloignée de overall (${ovr.toFixed(1)} vs ${min.toFixed(1)}-${max.toFixed(1)})`);
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

// 2 bis) Écart entre postes (retour utilisateur 2026-09-30 (téléphone) :
// "31 aux 5 postes alors qu'il est Meneur") : la note par poste repose sur
// les caractéristiques CLÉS de chaque poste (POSITION_KEY_WEIGHTS), assez
// discriminante pour qu'un spécialiste soit nettement meilleur à son poste
// qu'au poste opposé, alors qu'un joueur polyvalent reste égal partout.
Object.entries(E.POSITION_KEY_WEIGHTS).forEach(([pos, w]) => {
  const total = Object.values(w).reduce((s, x) => s + x, 0);
  if (total !== 100) throw new Error(`❌ POSITION_KEY_WEIGHTS[${pos}] : total ${total}, attendu 100`);
  Object.keys(w).forEach(a => { if (!E.ATTRS.includes(a)) throw new Error(`❌ POSITION_KEY_WEIGHTS[${pos}] : caractéristique inconnue ${a}`); });
});
assert(POS.every(q => E.POSITION_KEY_WEIGHTS[q]) && E.POSITION_RATING_KEY_SHARE > 0 && E.POSITION_RATING_KEY_SHARE < 1, "POSITION_KEY_WEIGHTS : 5 postes, poids en % (total 100) sur de vraies caractéristiques");
// Spécialistes synthétiques à l'échelle d'un effectif de départ (~30).
const at = v => { const o = {}; E.ATTRS.forEach(a => { o[a] = v; }); return o; };
const pgSpec = { ...at(28), pass: 50, dribble: 48, vision: 46, decision: 42, penetration: 45, speed: 46, acceleration: 46, steal: 40, threePoint: 36,
  rebound: 14, block: 10, defInside: 14, inside: 16, strength: 15, vertical: 18, power: 15 };
const cSpec = { ...at(28), block: 50, rebound: 50, defInside: 48, inside: 46, strength: 46, vertical: 44, power: 42,
  pass: 14, dribble: 12, vision: 18, threePoint: 12, speed: 16, acceleration: 16, agility: 16, penetration: 14, shotCreation: 15 };
const rPG = E.positionRatings({ attrs: pgSpec }), rC = E.positionRatings({ attrs: cSpec });
const fmtR = r => POS.map(q => `${q} ${r[q].toFixed(1)}`).join(" · ");
console.log("   Meneur type :", fmtR(rPG));
console.log("   Pivot type  :", fmtR(rC));
assert(rPG.Meneur - rPG.Pivot >= 10, `Meneur spécialiste nettement meilleur Meneur que Pivot (${(rPG.Meneur - rPG.Pivot).toFixed(1)} pts, ≥ 10)`);
assert(rC.Pivot - rC.Meneur >= 10, `Pivot spécialiste nettement meilleur Pivot que Meneur (${(rC.Pivot - rC.Meneur).toFixed(1)} pts, ≥ 10)`);
assert(E.bestPosition({ attrs: pgSpec, position: "Meneur" }) === "Meneur" && E.bestPosition({ attrs: cSpec, position: "Pivot" }) === "Pivot", "meilleur poste = poste de spécialité");
assert(rPG.Meneur - rPG.Arrière >= 1 && rPG.Meneur - rPG.Arrière < rPG.Meneur - rPG["Ailier shooteur"] + 1e-9 && rPG["Ailier shooteur"] > rPG.Pivot, "écart progressif : voisin proche, poste opposé loin");
const allRound = E.positionRatings({ attrs: at(31) });
assert(POS.every(q => Math.abs(allRound[q] - 31) < 1e-9), "joueur polyvalent (tout à 31) : 31 à chaque poste");
// Sur des joueurs générés (tier 1), l'écart médian max-min dépasse
// nettement l'ancien 4-6 points de weightedRatingForPosition.
const spreads = [];
POS.forEach(pos => { for (let i = 0; i < 40; i++) { const r = Object.values(E.positionRatings(E.generatePlayer(pos, 1))); spreads.push(Math.max(...r) - Math.min(...r)); } });
spreads.sort((a, b) => a - b);
const oldSpreads = [];
POS.forEach(pos => { for (let i = 0; i < 40; i++) { const p = E.generatePlayer(pos, 1); const r = POS.map(q => E.weightedRatingForPosition(p.attrs, q)); oldSpreads.push(Math.max(...r) - Math.min(...r)); } });
oldSpreads.sort((a, b) => a - b);
const med = a => a[a.length >> 1];
assert(med(spreads) >= 10 && med(spreads) > 1.5 * med(oldSpreads), `écart médian entre postes : ${med(spreads).toFixed(1)} pts (ancienne pondération : ${med(oldSpreads).toFixed(1)})`);
// weightedRatingForPosition (salaire, poste effectif, frustration du banc)
// INCHANGÉE : toujours la moyenne pondérée strong 1.5 / base 1 / weak 0.4.
{
  const p = E.generatePlayer("Arrière", 1);
  const prof = E.POSITION_ATTR_PROFILE["Arrière"];
  let s = 0, t = 0;
  E.ATTRS.forEach(a => { const w = E.ATTR_CATEGORY_WEIGHT[prof[a] || "base"]; s += p.attrs[a] * w; t += w; });
  assert(Math.abs(E.weightedRatingForPosition(p.attrs, "Arrière") - s / t) < 1e-9 && E.ATTR_CATEGORY_WEIGHT.strong === 1.5 && E.ATTR_CATEGORY_WEIGHT.weak === 0.4, "weightedRatingForPosition inchangée (salaire / poste effectif)");
}
// Seuil « Hors poste » de l'écran Ordres, re-réglé sur ce nouvel étalement :
// au-dessus d'un écart de voisin typique, bien en dessous de l'écart
// spécialiste / poste opposé.
{
  const gap = Number((html.match(/const COMPO_OFF_POSITION_GAP = (\d+(?:\.\d+)?);/) || [])[1]);
  // Écart médian Meneur → Arrière (postes voisins) des Meneurs générés à
  // l'échelle d'un effectif de départ (tier 0.6, overall ~30).
  const nb = [];
  for (let i = 0; i < 200; i++) { const r = E.positionRatings(E.generatePlayer("Meneur", 0.6)); nb.push(Math.abs(r.Meneur - r.Arrière)); }
  nb.sort((a, b) => a - b);
  assert(gap >= 4 && gap < rPG.Meneur - rPG.Pivot && gap < rC.Pivot - rC.Meneur && gap > med(nb), `COMPO_OFF_POSITION_GAP (${gap}) cohérent : > écart médian entre voisins (${med(nb).toFixed(1)}), < écart spécialiste/poste opposé`);
}

// 3) Copie miroir identique dans la page.
const src = (text, name) => { const m = text.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`)); return m && m[0]; };
["positionRating", "positionRatings", "bestPosition", "weightedRatingForPosition"].forEach(f => {
  if (!src(html, f) || src(html, f) !== src(fs.readFileSync("engine.js", "utf-8"), f)) throw new Error(`❌ ${f} : copie miroir différente entre engine.js et moteurbasket3.html`);
});
const constSrc = (text, name) => { const m = text.match(new RegExp(`const ${name} = [\\s\\S]*?;\\n`)); return m && m[0]; };
["POSITION_KEY_WEIGHTS", "POSITION_RATING_KEY_SHARE"].forEach(c => {
  if (!constSrc(html, c) || constSrc(html, c) !== constSrc(fs.readFileSync("engine.js", "utf-8"), c)) throw new Error(`❌ ${c} : copie miroir différente entre engine.js et moteurbasket3.html`);
});
assert(true, "positionRating / positionRatings / bestPosition / POSITION_KEY_WEIGHTS identiques dans engine.js et moteurbasket3.html");

// 4) Pure lecture : ne modifie pas le joueur.
const p = E.generatePlayer("Arrière", 1);
const before = JSON.stringify(p.attrs);
E.positionRatings(p); E.bestPosition(p);
assert(JSON.stringify(p.attrs) === before, "aucune écriture dans le joueur (aide à la décision, pas de changement du moteur)");

console.log("\n🏁 Note par poste vérifiée.");
