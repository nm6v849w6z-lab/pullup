// Changements de joueurs (retour utilisateur 2026-10-08) : jamais à la volée.
// Un changement n'a lieu que sur un arrêt de jeu — faute / lancers francs,
// ballon perdu hors interception (sortie, violation), temps mort, blessure,
// exclusion, pause entre deux quarts-temps. Ballon vivant (panier en jeu,
// rebond, interception) : le changement attend le prochain arrêt.
const assert = require("assert");
const E = require("./engine.js");

const STOPS = new Set(["foul", "technicalFoul", "unsportsmanlikeFoul", "foulOut", "technicalEjection", "injury", "timeout", "freeThrow", "quarterStart"]);
const isStop = e => e && (STOPS.has(e.type) || (e.type === "turnover" && e.tovType !== "steal"));

const a = E.generateStartingRoster("Arrêts A"), b = E.generateStartingRoster("Arrêts B");
let subs = 0, games = 20;
const bad = [];
for (let g = 0; g < games; g++) {
  const r = new E.MatchEngine(a, b).simulate();
  const ev = r.events || r.log || [];
  for (let i = 0; i < ev.length; i++) {
    if (ev[i].type !== "substitution" && ev[i].type !== "shortHanded") continue;
    if (ev[i].type === "substitution") subs++;
    let j = i - 1;
    while (j >= 0 && (ev[j].type === "substitution" || ev[j].type === "shortHanded")) j--;
    if (!isStop(ev[j])) bad.push({ before: ev[j] && ev[j].type, tov: ev[j] && ev[j].tovType, made: ev[j] && ev[j].made, text: ev[i].text });
  }
}
assert.strictEqual(bad.length, 0, `changements pendant que le ballon est vivant : ${JSON.stringify(bad.slice(0, 3))}`);
console.log(`✅ ${subs} changements sur ${games} matchs, tous sur un arrêt de jeu (faute, lancers, sortie, temps mort, blessure, exclusion, entre deux quarts).`);
assert.ok(subs / games >= 20, `la rotation doit rester vivante (≥ 20 changements par match), obtenu ${(subs / games).toFixed(1)}`);
console.log(`✅ Rotation conservée : ${(subs / games).toFixed(1)} changements par match en moyenne.`);
