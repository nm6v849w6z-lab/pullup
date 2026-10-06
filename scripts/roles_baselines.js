// Recalcule CONFIG.baselines de assets/roles.js (relief habituel de chaque
// rôle chez les joueurs de chaque poste) et les réécrit dans le fichier. À relancer après
// toute modification des poids d'un rôle :  node scripts/roles_baselines.js
const fs = require("fs");
const path = require("path");
const E = require("../engine.js");
const R = require("../assets/roles.js");
const players = [];
for (let i = 0; i < 400; i++) players.push(...E.generateTeam("B" + i, [0.92, 0.86, 0.8, 0.7, 0.62][i % 5]).players.filter(p => p.age > 21));
const acc = {};
const avg = a => { const v = Object.values(a).filter(x => typeof x === "number"); return v.reduce((s, x) => s + x, 0) / v.length; };
players.forEach(p => {
  const ov = avg(p.attrs);
  Object.entries(R.ROLES).forEach(([id, r]) => {
    // Référence par (rôle, poste DU JOUEUR) : un joueur est comparé aux
    // joueurs de son poste, pour tous les rôles. Une référence par poste DU
    // RÔLE avantageait les joueurs hors poste (un meneur jugé sur la Passe
    // habituelle d'un ailier fort paraissait exceptionnel).
    (acc[`${id}|${p.position}`] = acc[`${id}|${p.position}`] || []).push(R.keyAverage(r, p.attrs) / ov - 1);
  });
});
const lines = Object.keys(acc).sort().map(k => `      "${k}": ${Math.round(1000 * acc[k].reduce((s, v) => s + v, 0) / acc[k].length) / 1000}`);
const file = path.join(__dirname, "../assets/roles.js");
const src = fs.readFileSync(file, "utf-8").replace(/    baselines: \{\n[\s\S]*?\n    \},/, `    baselines: {\n${lines.join(",\n")}\n    },`);
fs.writeFileSync(file, src);
console.log(`${lines.length} références réécrites dans assets/roles.js`);
